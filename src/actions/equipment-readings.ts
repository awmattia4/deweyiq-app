"use server"

import { createClient } from "@/lib/supabase/server"
import { adminDb, withRls } from "@/lib/db"
import type { SupabaseToken } from "@/lib/db"
import { equipmentReadings, equipment, pools, customers, alerts } from "@/lib/db/schema"
import { eq, and, desc, inArray } from "drizzle-orm"
import type { AlertType, AlertSeverity } from "@/lib/alerts/constants"

// ---------------------------------------------------------------------------
// Auth helper
// ---------------------------------------------------------------------------

async function getRlsToken(): Promise<SupabaseToken | null> {
  const supabase = await createClient()
  const { data: claimsData } = await supabase.auth.getClaims()
  if (!claimsData?.claims) return null
  return claimsData.claims as SupabaseToken
}

// ---------------------------------------------------------------------------
// Equipment metric types
// ---------------------------------------------------------------------------

/**
 * EquipmentMetrics — equipment-type-specific readings.
 *
 * salt_chlorine_generator (also stored as 'salt_cell'):
 *   - salt_ppm: salt concentration in ppm
 *
 * pump:
 *   - flow_gpm: gallons per minute
 *   - rpm: revolutions per minute
 *
 * filter:
 *   - psi: filter pressure in PSI
 *
 * heater:
 *   - delta_f: temperature delta (outlet - inlet) in Fahrenheit
 */
export type EquipmentMetrics = {
  salt_ppm?: number
  flow_gpm?: number
  rpm?: number
  psi?: number
  delta_f?: number
  [key: string]: number | undefined
}

export type EquipmentHealthStatus = "healthy" | "degraded" | "critical"

export interface EquipmentMetricHealth {
  metricName: string
  baseline: number
  current: number
  status: EquipmentHealthStatus
  dropPct: number
}

export interface EquipmentHealthResult {
  equipmentId: string
  equipmentType: string
  metrics: EquipmentMetricHealth[]
  overallStatus: EquipmentHealthStatus
  readingCount: number
}

// ---------------------------------------------------------------------------
// logEquipmentReading
// ---------------------------------------------------------------------------

/**
 * logEquipmentReading — Records a new metric reading for a piece of equipment.
 *
 * Called during stop completion when tech enters equipment readings.
 * visitId links the reading to the service visit for traceability.
 */
export async function logEquipmentReading(
  equipmentId: string,
  poolId: string,
  metrics: EquipmentMetrics,
  visitId?: string,
  notes?: string
): Promise<{ success: boolean; id?: string; error?: string }> {
  const token = await getRlsToken()
  if (!token) return { success: false, error: "Not authenticated" }
  if (!token.org_id) return { success: false, error: "No org context" }

  // Validate that at least one metric value is present
  const hasMetric = Object.values(metrics).some(
    (v) => v !== undefined && v !== null && !isNaN(v as number)
  )
  if (!hasMetric) {
    return { success: false, error: "At least one metric value is required" }
  }

  try {
    const [inserted] = await withRls(token, (db) =>
      db
        .insert(equipmentReadings)
        .values({
          org_id: token.org_id!,
          equipment_id: equipmentId,
          pool_id: poolId,
          service_visit_id: visitId ?? null,
          metrics,
          recorded_by_id: token.sub,
          notes: notes ?? null,
        })
        .returning({ id: equipmentReadings.id })
    )

    return { success: true, id: inserted.id }
  } catch (err) {
    console.error("[logEquipmentReading] Error:", err)
    return { success: false, error: "Failed to log equipment reading" }
  }
}

// ---------------------------------------------------------------------------
// getEquipmentReadings
// ---------------------------------------------------------------------------

/**
 * getEquipmentReadings — Returns recent readings for a piece of equipment.
 *
 * Ordered newest-first. Limit defaults to 20 readings.
 */
export async function getEquipmentReadings(
  equipmentId: string,
  limit = 20
): Promise<{
  success: boolean
  readings?: Array<{
    id: string
    recorded_at: Date
    metrics: EquipmentMetrics
    notes: string | null
    service_visit_id: string | null
  }>
  error?: string
}> {
  const token = await getRlsToken()
  if (!token) return { success: false, error: "Not authenticated" }

  try {
    const rows = await withRls(token, (db) =>
      db
        .select({
          id: equipmentReadings.id,
          recorded_at: equipmentReadings.recorded_at,
          metrics: equipmentReadings.metrics,
          notes: equipmentReadings.notes,
          service_visit_id: equipmentReadings.service_visit_id,
        })
        .from(equipmentReadings)
        .where(eq(equipmentReadings.equipment_id, equipmentId))
        .orderBy(desc(equipmentReadings.recorded_at))
        .limit(limit)
    )

    return {
      success: true,
      readings: rows.map((r) => ({
        ...r,
        metrics: r.metrics as EquipmentMetrics,
      })),
    }
  } catch (err) {
    console.error("[getEquipmentReadings] Error:", err)
    return { success: false, error: "Failed to fetch equipment readings" }
  }
}

// ---------------------------------------------------------------------------
// getEquipmentHealth
// ---------------------------------------------------------------------------

/**
 * getEquipmentHealth — Computes health scores from the last 8 readings.
 *
 * Algorithm:
 * 1. Fetch the last 8 readings for the equipment piece (oldest-first for baseline).
 * 2. For each numeric metric key in the JSONB:
 *    - baseline = average of first 4 readings
 *    - current = average of last 2 readings
 *    - dropPct = (1 - current / baseline) * 100 (positive = drop)
 * 3. Status:
 *    - current < baseline * 0.50 → "critical" (50%+ drop)
 *    - current < baseline * 0.70 → "degraded" (30%+ drop)
 *    - otherwise → "healthy"
 *
 * Returns null if fewer than 6 readings exist (not enough data for baseline).
 */
export async function getEquipmentHealth(
  equipmentId: string
): Promise<EquipmentHealthResult | null> {
  const token = await getRlsToken()
  if (!token) return null

  try {
    // Fetch last 8 readings, oldest-first (for baseline/current split)
    const rows = await withRls(token, (db) =>
      db
        .select({
          metrics: equipmentReadings.metrics,
          recorded_at: equipmentReadings.recorded_at,
        })
        .from(equipmentReadings)
        .where(eq(equipmentReadings.equipment_id, equipmentId))
        .orderBy(desc(equipmentReadings.recorded_at))
        .limit(8)
    )

    if (rows.length < 6) return null // Not enough data

    // Reverse to get oldest-first for correct baseline/current split
    const readings = [...rows].reverse()

    // Fetch equipment type
    const equipRows = await withRls(token, (db) =>
      db
        .select({ type: equipment.type })
        .from(equipment)
        .where(eq(equipment.id, equipmentId))
        .limit(1)
    )
    const equipmentType = equipRows[0]?.type ?? "unknown"

    // Collect all metric keys from the readings
    const allMetricKeys = new Set<string>()
    for (const r of readings) {
      const m = r.metrics as EquipmentMetrics
      for (const k of Object.keys(m)) {
        allMetricKeys.add(k)
      }
    }

    const metricHealthList: EquipmentMetricHealth[] = []

    for (const metricKey of allMetricKeys) {
      // Extract numeric values for this metric across readings
      const values = readings
        .map((r) => {
          const m = r.metrics as EquipmentMetrics
          const v = m[metricKey]
          return typeof v === "number" && !isNaN(v) ? v : null
        })
        .filter((v): v is number => v !== null)

      if (values.length < 4) continue // Need at least 4 readings for baseline

      // Baseline: average of first half (up to 4 values)
      const baselineValues = values.slice(0, Math.min(4, Math.floor(values.length / 2)))
      const baseline = baselineValues.reduce((a, b) => a + b, 0) / baselineValues.length

      if (baseline <= 0) continue // Skip zero/negative baselines (avoid division by zero)

      // Current: average of last 2 values
      const currentValues = values.slice(-2)
      const current = currentValues.reduce((a, b) => a + b, 0) / currentValues.length

      const dropPct = ((baseline - current) / baseline) * 100

      let status: EquipmentHealthStatus
      if (current < baseline * 0.5) {
        status = "critical"
      } else if (current < baseline * 0.7) {
        status = "degraded"
      } else {
        status = "healthy"
      }

      metricHealthList.push({
        metricName: metricKey,
        baseline,
        current,
        status,
        dropPct,
      })
    }

    // Overall status: worst across all metrics
    let overallStatus: EquipmentHealthStatus = "healthy"
    for (const m of metricHealthList) {
      if (m.status === "critical") {
        overallStatus = "critical"
        break
      } else if (m.status === "degraded") {
        overallStatus = "degraded"
      }
    }

    return {
      equipmentId,
      equipmentType,
      metrics: metricHealthList,
      overallStatus,
      readingCount: rows.length,
    }
  } catch (err) {
    console.error("[getEquipmentHealth] Error:", err)
    return null
  }
}

// ---------------------------------------------------------------------------
// checkDegradation
// ---------------------------------------------------------------------------

/**
 * checkDegradation — Scans all equipment in the org for degradation.
 *
 * For each equipment piece with 8+ readings, checks for degradation.
 * Creates alerts for degraded equipment with:
 *   - title: equipment name, pool name, customer name, metric that degraded
 *   - metadata: { equipmentId, createWoLink } for one-tap WO creation
 *
 * Uses adminDb (not withRls) — called from cron/system context.
 * Caller must validate org membership before calling.
 */
export async function checkDegradation(orgId: string): Promise<void> {
  try {
    // Fetch all equipment for this org
    const orgEquipment = await adminDb
      .select({
        id: equipment.id,
        type: equipment.type,
        brand: equipment.brand,
        model: equipment.model,
        pool_id: equipment.pool_id,
        poolName: pools.name,
        customerId: customers.id,
        customerName: customers.full_name,
      })
      .from(equipment)
      .leftJoin(pools, eq(equipment.pool_id, pools.id))
      .leftJoin(customers, eq(pools.customer_id, customers.id))
      .where(eq(equipment.org_id, orgId))

    if (orgEquipment.length === 0) return

    const equipmentIds = orgEquipment.map((e) => e.id)

    // Fetch last 8 readings per equipment piece using adminDb
    const allReadings = await adminDb
      .select({
        id: equipmentReadings.id,
        equipment_id: equipmentReadings.equipment_id,
        metrics: equipmentReadings.metrics,
        recorded_at: equipmentReadings.recorded_at,
      })
      .from(equipmentReadings)
      .where(
        and(
          eq(equipmentReadings.org_id, orgId),
          inArray(equipmentReadings.equipment_id, equipmentIds)
        )
      )
      .orderBy(desc(equipmentReadings.recorded_at))

    // Group readings by equipment_id (take up to 8 per equipment)
    const readingsByEquipment = new Map<string, typeof allReadings>()
    for (const r of allReadings) {
      const existing = readingsByEquipment.get(r.equipment_id) ?? []
      if (existing.length < 8) {
        existing.push(r)
        readingsByEquipment.set(r.equipment_id, existing)
      }
    }

    const newAlerts: {
      org_id: string
      alert_type: AlertType
      severity: AlertSeverity
      reference_id: string
      reference_type: string
      title: string
      description: string
      metadata: Record<string, unknown>
    }[] = []

    for (const eq_ of orgEquipment) {
      const readings = readingsByEquipment.get(eq_.id)
      if (!readings || readings.length < 8) continue

      // Oldest-first for baseline/current split
      const orderedReadings = [...readings].reverse()

      // Collect metric keys
      const allMetricKeys = new Set<string>()
      for (const r of orderedReadings) {
        const m = r.metrics as EquipmentMetrics
        for (const k of Object.keys(m)) allMetricKeys.add(k)
      }

      for (const metricKey of allMetricKeys) {
        const values = orderedReadings
          .map((r) => {
            const m = r.metrics as EquipmentMetrics
            const v = m[metricKey]
            return typeof v === "number" && !isNaN(v) ? v : null
          })
          .filter((v): v is number => v !== null)

        if (values.length < 4) continue

        const baselineValues = values.slice(0, 4)
        const baseline = baselineValues.reduce((a, b) => a + b, 0) / baselineValues.length
        if (baseline <= 0) continue

        const currentValues = values.slice(-2)
        const current = currentValues.reduce((a, b) => a + b, 0) / currentValues.length

        let status: EquipmentHealthStatus
        if (current < baseline * 0.5) {
          status = "critical"
        } else if (current < baseline * 0.7) {
          status = "degraded"
        } else {
          status = "healthy"
        }

        if (status === "healthy") continue

        const dropPct = ((baseline - current) / baseline) * 100
        const equipLabel = _formatEquipmentLabel(eq_.type, eq_.brand, eq_.model)
        const metricLabel = _formatMetricLabel(metricKey)
        const poolLabel = eq_.poolName ?? "Pool"
        const customerLabel = eq_.customerName ?? "Customer"

        newAlerts.push({
          org_id: orgId,
          alert_type: "equipment_degradation",
          severity: status === "critical" ? "critical" : "warning",
          reference_id: eq_.id,
          reference_type: "equipment",
          title: `${equipLabel} performance drop — ${customerLabel}'s ${poolLabel}`,
          description: `${metricLabel} dropped ${dropPct.toFixed(0)}% from baseline (${baseline.toFixed(1)} → ${current.toFixed(1)})`,
          metadata: {
            equipmentId: eq_.id,
            equipmentType: eq_.type,
            poolId: eq_.pool_id,
            customerId: eq_.customerId,
            metric: metricKey,
            baseline,
            current,
            dropPct,
            status,
            createWoLink: `/work-orders?create=true&equipment=${eq_.id}`,
          },
        })
      }
    }

    if (newAlerts.length === 0) return

    await adminDb
      .insert(alerts)
      .values(newAlerts)
      .onConflictDoNothing()
  } catch (err) {
    console.error("[checkDegradation] Error:", err)
  }
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function _formatEquipmentLabel(type: string, brand: string | null, model: string | null): string {
  const base = type.replace(/_/g, " ")
  const parts = [brand, model].filter(Boolean)
  if (parts.length > 0) {
    return `${_capitalize(base)} (${parts.join(" ")})`
  }
  return _capitalize(base)
}

function _capitalize(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1)
}

function _formatMetricLabel(metric: string): string {
  switch (metric) {
    case "salt_ppm": return "Salt output (PPM)"
    case "flow_gpm": return "Flow rate (GPM)"
    case "rpm": return "RPM"
    case "psi": return "Filter pressure (PSI)"
    case "delta_f": return "Heater delta-T"
    default: return metric.replace(/_/g, " ")
  }
}
