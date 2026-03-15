"use server"

import { revalidatePath } from "next/cache"
import { createClient } from "@/lib/supabase/server"
import { adminDb, withRls } from "@/lib/db"
import type { SupabaseToken } from "@/lib/db"
import { alerts, routeStops, serviceVisits, customers, pools, orgSettings, chemicalProducts, invoices } from "@/lib/db/schema"
import { and, eq, isNull, lt, or, sql, inArray, not, desc } from "drizzle-orm"
import type { AlertType, AlertSeverity, Alert, AlertCounts } from "@/lib/alerts/constants"
import { toLocalDateString } from "@/lib/date-utils"

// NOTE: Types are imported (not re-exported) from @/lib/alerts/constants because
// Next.js "use server" files may only export async functions. Client components
// that need Alert types must import directly from @/lib/alerts/constants.

// ─── Auth helper ──────────────────────────────────────────────────────────────

async function getRlsToken(): Promise<SupabaseToken | null> {
  const supabase = await createClient()
  const { data: claimsData } = await supabase.auth.getClaims()
  if (!claimsData?.claims) return null
  return claimsData.claims as SupabaseToken
}

// ─── Chemistry decline thresholds (per-visit slope) ───────────────────────────

const DECLINE_THRESHOLDS: Record<string, number> = {
  freeChlorine: -0.5,    // ppm/visit
  pH: -0.15,             // units/visit
  totalAlkalinity: -5,   // ppm/visit
  salt: -100,            // ppm/visit
}

// ─── Alert generation ─────────────────────────────────────────────────────────

/**
 * generateAlerts — Detects new alert conditions and inserts alert rows.
 *
 * Uses adminDb (not withRls) because alert generation scans all org data.
 * The caller is responsible for verifying the user's org membership before calling.
 *
 * Uses ON CONFLICT DO NOTHING on the unique constraint (org_id, alert_type, reference_id)
 * to prevent duplicates idempotently.
 */
export async function generateAlerts(orgId: string): Promise<void> {
  try {
    await _generateMissedStopAlerts(orgId)
    await _generateIncompleteDataAlerts(orgId)
    await _generateDecliningChemistryAlerts(orgId)
    await _generateUnprofitablePoolAlerts(orgId)
  } catch (err) {
    // Non-fatal — alerts are best-effort. Log and continue.
    console.error("[generateAlerts] Error generating alerts:", err)
  }
}

// ── a) Missed stops ────────────────────────────────────────────────────────────

async function _generateMissedStopAlerts(orgId: string): Promise<void> {
  const today = toLocalDateString()

  // Find all stops before today that were not completed, skipped, or marked holiday
  // Using LEFT JOIN with customers and pools (no correlated subqueries per MEMORY.md)
  const missedStops = await adminDb
    .select({
      stopId: routeStops.id,
      customerId: routeStops.customer_id,
      poolId: routeStops.pool_id,
      techId: routeStops.tech_id,
      scheduledDate: routeStops.scheduled_date,
      customerName: customers.full_name,
    })
    .from(routeStops)
    .leftJoin(customers, eq(routeStops.customer_id, customers.id))
    .where(
      and(
        eq(routeStops.org_id, orgId),
        lt(routeStops.scheduled_date, today),
        not(inArray(routeStops.status, ["complete", "skipped", "holiday"]))
      )
    )
    .limit(100) // Safety limit — alert gen is best-effort

  if (missedStops.length === 0) return

  // Bulk insert with ON CONFLICT DO NOTHING — the unique constraint on
  // (org_id, alert_type, reference_id) prevents duplicates
  const newAlerts = missedStops.map((stop) => ({
    org_id: orgId,
    alert_type: "missed_stop" as AlertType,
    severity: "critical" as AlertSeverity,
    reference_id: stop.stopId,
    reference_type: "route_stop" as const,
    title: `${stop.customerName ?? "Customer"}'s stop was missed on ${stop.scheduledDate}`,
    metadata: {
      customerId: stop.customerId,
      poolId: stop.poolId,
      techId: stop.techId,
      scheduledDate: stop.scheduledDate,
    },
  }))

  await adminDb
    .insert(alerts)
    .values(newAlerts)
    .onConflictDoNothing()
}

// ── b) Incomplete data ─────────────────────────────────────────────────────────

async function _generateIncompleteDataAlerts(orgId: string): Promise<void> {
  const sevenDaysAgo = new Date()
  sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7)

  // Find completed visits in the last 7 days with missing/sparse chemistry
  const recentVisits = await adminDb
    .select({
      visitId: serviceVisits.id,
      customerId: serviceVisits.customer_id,
      poolId: serviceVisits.pool_id,
      techId: serviceVisits.tech_id,
      completedAt: serviceVisits.completed_at,
      chemistryReadings: serviceVisits.chemistry_readings,
      customerName: customers.full_name,
    })
    .from(serviceVisits)
    .leftJoin(customers, eq(serviceVisits.customer_id, customers.id))
    .where(
      and(
        eq(serviceVisits.org_id, orgId),
        eq(serviceVisits.status, "complete"),
        sql`${serviceVisits.completed_at} >= ${sevenDaysAgo.toISOString()}`
      )
    )
    .limit(200)

  const incompleteVisits = recentVisits.filter((visit) => {
    const readings = visit.chemistryReadings as Record<string, unknown> | null
    if (!readings) return true // No readings at all

    // Count non-null values among key chemistry params
    const keyParams = ["freeChlorine", "pH", "totalAlkalinity", "salt"]
    const presentCount = keyParams.filter(
      (p) => readings[p] !== null && readings[p] !== undefined
    ).length

    return presentCount < 2
  })

  if (incompleteVisits.length === 0) return

  const newAlerts = incompleteVisits.map((visit) => {
    const readings = visit.chemistryReadings as Record<string, unknown> | null
    const keyParams = ["freeChlorine", "pH", "totalAlkalinity", "salt"]
    const missingParams = keyParams.filter(
      (p) => !readings || readings[p] === null || readings[p] === undefined
    )

    const visitDate = visit.completedAt
      ? new Date(visit.completedAt).toLocaleDateString("en-US", {
          month: "short",
          day: "numeric",
        })
      : "unknown date"

    return {
      org_id: orgId,
      alert_type: "incomplete_data" as AlertType,
      severity: "warning" as AlertSeverity,
      reference_id: visit.visitId,
      reference_type: "service_visit" as const,
      title: `${visit.customerName ?? "Customer"}'s service on ${visitDate} has incomplete data`,
      metadata: {
        customerId: visit.customerId,
        poolId: visit.poolId,
        techId: visit.techId,
        missingParams,
      },
    }
  })

  await adminDb
    .insert(alerts)
    .values(newAlerts)
    .onConflictDoNothing()
}

// ── c) Declining chemistry ─────────────────────────────────────────────────────

async function _generateDecliningChemistryAlerts(orgId: string): Promise<void> {
  const thirtyDaysAgo = new Date()
  thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30)

  // Fetch recent visits per pool — we need 3+ visits to detect a trend
  const recentVisits = await adminDb
    .select({
      visitId: serviceVisits.id,
      customerId: serviceVisits.customer_id,
      poolId: serviceVisits.pool_id,
      completedAt: serviceVisits.completed_at,
      chemistryReadings: serviceVisits.chemistry_readings,
      customerName: customers.full_name,
      poolName: pools.name,
    })
    .from(serviceVisits)
    .leftJoin(customers, eq(serviceVisits.customer_id, customers.id))
    .leftJoin(pools, eq(serviceVisits.pool_id, pools.id))
    .where(
      and(
        eq(serviceVisits.org_id, orgId),
        eq(serviceVisits.status, "complete"),
        sql`${serviceVisits.completed_at} >= ${thirtyDaysAgo.toISOString()}`
      )
    )
    .orderBy(serviceVisits.pool_id, serviceVisits.completed_at)
    .limit(500)

  // Group by pool
  const byPool = new Map<
    string,
    typeof recentVisits
  >()
  for (const visit of recentVisits) {
    if (!visit.poolId) continue
    if (!byPool.has(visit.poolId)) byPool.set(visit.poolId, [])
    byPool.get(visit.poolId)!.push(visit)
  }

  const newAlerts: {
    org_id: string
    alert_type: AlertType
    severity: AlertSeverity
    reference_id: string
    reference_type: string
    title: string
    metadata: Record<string, unknown>
  }[] = []

  for (const [, poolVisits] of byPool) {
    if (poolVisits.length < 3) continue

    // Take the last 3 readings for trend analysis
    const last3 = poolVisits.slice(-3)
    const latestVisit = last3[last3.length - 1]

    for (const param of Object.keys(DECLINE_THRESHOLDS)) {
      const values = last3.map((v) => {
        const readings = v.chemistryReadings as Record<string, unknown> | null
        const val = readings?.[param]
        return typeof val === "number" ? val : null
      })

      // Skip if any reading is missing
      if (values.some((v) => v === null)) continue

      const nonNullValues = values as number[]
      const slope = (nonNullValues[2] - nonNullValues[0]) / (nonNullValues.length - 1)

      if (slope <= DECLINE_THRESHOLDS[param]) {
        const paramLabel = _formatParamLabel(param)
        const poolLabel = latestVisit.poolName ?? "Pool"
        const customerLabel = latestVisit.customerName ?? "Customer"

        newAlerts.push({
          org_id: orgId,
          alert_type: "declining_chemistry",
          severity: "warning",
          reference_id: latestVisit.visitId,
          reference_type: "service_visit",
          title: `${paramLabel} is declining for ${customerLabel}'s ${poolLabel}`,
          metadata: {
            customerId: latestVisit.customerId,
            poolId: latestVisit.poolId,
            param,
            slope,
            values: nonNullValues,
          },
        })
      }
    }
  }

  if (newAlerts.length === 0) return

  await adminDb
    .insert(alerts)
    .values(newAlerts)
    .onConflictDoNothing()
}

function _formatParamLabel(param: string): string {
  switch (param) {
    case "freeChlorine": return "Free Chlorine"
    case "pH": return "pH"
    case "totalAlkalinity": return "Total Alkalinity"
    case "salt": return "Salt"
    default: return param
  }
}

// ── d) Unprofitable pools ──────────────────────────────────────────────────────

async function _generateUnprofitablePoolAlerts(orgId: string): Promise<void> {
  // Fetch org settings for margin threshold
  const settingsRows = await adminDb
    .select({ chem_profit_margin_threshold_pct: orgSettings.chem_profit_margin_threshold_pct })
    .from(orgSettings)
    .where(eq(orgSettings.org_id, orgId))
    .limit(1)

  const thresholdPct = parseFloat(settingsRows[0]?.chem_profit_margin_threshold_pct ?? "20") || 20

  // Fetch active chemical products with cost_per_unit for the org
  const productRows = await adminDb
    .select({
      id: chemicalProducts.id,
      costPerUnit: chemicalProducts.cost_per_unit,
    })
    .from(chemicalProducts)
    .where(and(eq(chemicalProducts.org_id, orgId), eq(chemicalProducts.is_active, true)))

  // Only proceed if we have costs configured — otherwise profitability can't be calculated
  const productsWithCosts = productRows.filter((p) => p.costPerUnit != null)
  if (productsWithCosts.length === 0) return

  const costPerUnitMap = new Map<string, number>()
  for (const p of productsWithCosts) {
    costPerUnitMap.set(p.id, parseFloat(p.costPerUnit!))
  }

  // Fetch last 30 days of visits with dosing_amounts
  const thirtyDaysAgo = new Date()
  thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30)
  const startDate = thirtyDaysAgo.toISOString().split("T")[0]

  const visitRows = await adminDb
    .select({
      poolId: serviceVisits.pool_id,
      customerId: serviceVisits.customer_id,
      dosingAmounts: serviceVisits.dosing_amounts,
      poolName: pools.name,
      customerName: customers.full_name,
    })
    .from(serviceVisits)
    .leftJoin(pools, eq(serviceVisits.pool_id, pools.id))
    .leftJoin(customers, eq(serviceVisits.customer_id, customers.id))
    .where(
      and(
        eq(serviceVisits.org_id, orgId),
        eq(serviceVisits.status, "complete"),
        sql`${serviceVisits.visited_at} >= ${startDate}::date`
      )
    )
    .limit(1000)

  // Aggregate chemical cost per pool
  interface PoolCostAgg {
    poolId: string
    customerId: string | null
    poolName: string | null
    customerName: string | null
    totalCost: number
    visitCount: number
  }

  const poolCostMap = new Map<string, PoolCostAgg>()

  for (const visit of visitRows) {
    if (!visit.poolId) continue
    if (!poolCostMap.has(visit.poolId)) {
      poolCostMap.set(visit.poolId, {
        poolId: visit.poolId,
        customerId: visit.customerId,
        poolName: visit.poolName,
        customerName: visit.customerName,
        totalCost: 0,
        visitCount: 0,
      })
    }

    const agg = poolCostMap.get(visit.poolId)!
    agg.visitCount += 1

    const dosingAmounts = visit.dosingAmounts as Array<{
      chemical: string
      productId: string
      amount: number
      unit: string
    }> | null

    if (dosingAmounts) {
      for (const dose of dosingAmounts) {
        const unitCost = costPerUnitMap.get(dose.productId) ?? 0
        agg.totalCost += dose.amount * unitCost
      }
    }
  }

  // Fetch revenue per customer in the last 30 days
  const revenueRows = await adminDb
    .select({
      customerId: invoices.customer_id,
      totalRevenue: sql<string>`COALESCE(SUM(${invoices.total}::numeric), 0)::text`,
    })
    .from(invoices)
    .where(
      and(
        eq(invoices.org_id, orgId),
        eq(invoices.status, "paid"),
        sql`${invoices.paid_at} >= ${startDate}::timestamptz`
      )
    )
    .groupBy(invoices.customer_id)

  const revenueByCustomer = new Map<string, number>()
  for (const row of revenueRows) {
    if (row.customerId) {
      revenueByCustomer.set(row.customerId, parseFloat(row.totalRevenue))
    }
  }

  // Count pools per customer for revenue distribution
  const poolCountByCustomer = new Map<string, number>()
  for (const agg of poolCostMap.values()) {
    if (!agg.customerId) continue
    poolCountByCustomer.set(agg.customerId, (poolCountByCustomer.get(agg.customerId) ?? 0) + 1)
  }

  // Find flagged pools
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

  for (const agg of poolCostMap.values()) {
    if (!agg.customerId || agg.totalCost === 0) continue

    const customerRevenue = revenueByCustomer.get(agg.customerId) ?? 0
    const poolCount = poolCountByCustomer.get(agg.customerId) ?? 1
    const poolRevenue = poolCount > 0 ? customerRevenue / poolCount : 0

    const margin = poolRevenue - agg.totalCost
    const marginPct =
      poolRevenue > 0 ? (margin / poolRevenue) * 100 : agg.totalCost > 0 ? -100 : 0

    if (marginPct < thresholdPct) {
      const poolLabel = agg.poolName ?? "Pool"
      const customerLabel = agg.customerName ?? "Customer"
      const severity: AlertSeverity = margin < 0 ? "critical" : "warning"

      newAlerts.push({
        org_id: orgId,
        alert_type: "unprofitable_pool",
        severity,
        reference_id: agg.poolId,
        reference_type: "pool",
        title: `${poolLabel} (${customerLabel}) is unprofitable`,
        description: `Chemical cost $${agg.totalCost.toFixed(2)} vs revenue $${poolRevenue.toFixed(2)}. Margin: ${marginPct.toFixed(1)}%`,
        metadata: {
          poolId: agg.poolId,
          customerId: agg.customerId,
          chemicalCost: agg.totalCost,
          revenue: poolRevenue,
          marginPct,
          visitCount: agg.visitCount,
        },
      })
    }
  }

  if (newAlerts.length === 0) return

  await adminDb
    .insert(alerts)
    .values(newAlerts)
    .onConflictDoNothing()
}

// ─── Query actions ────────────────────────────────────────────────────────────

/**
 * getActiveAlerts — Returns active alerts for the current user's org.
 *
 * Active = dismissed_at IS NULL AND (snoozed_until IS NULL OR snoozed_until < now())
 * Sorted by: severity DESC (critical first), then generated_at DESC (newest first)
 */
export async function getActiveAlerts(): Promise<Alert[]> {
  const token = await getRlsToken()
  if (!token) return []

  const now = new Date()

  // Severity sort order — critical=3, warning=2, info=1
  // Using CASE in ORDER BY via raw sql for priority sort
  const rows = await withRls(token, (db) =>
    db
      .select()
      .from(alerts)
      .where(
        and(
          isNull(alerts.dismissed_at),
          or(
            isNull(alerts.snoozed_until),
            lt(alerts.snoozed_until, now)
          )
        )
      )
      .orderBy(
        sql`CASE ${alerts.severity}
          WHEN 'critical' THEN 3
          WHEN 'warning' THEN 2
          WHEN 'info' THEN 1
          ELSE 0
        END DESC`,
        desc(alerts.generated_at)
      )
  )

  return rows as Alert[]
}

/**
 * getAlertCount — Returns count of active alerts (for sidebar badge).
 * Only meaningful for owner/office — tech users don't see alerts.
 */
export async function getAlertCount(): Promise<number> {
  const token = await getRlsToken()
  if (!token) return 0

  // Only owner/office should see alerts per schema RLS
  const userRole = token.user_role as string | undefined
  if (!userRole || !["owner", "office"].includes(userRole)) return 0

  const now = new Date()

  try {
    const rows = await withRls(token, (db) =>
      db
        .select({ id: alerts.id })
        .from(alerts)
        .where(
          and(
            isNull(alerts.dismissed_at),
            or(
              isNull(alerts.snoozed_until),
              lt(alerts.snoozed_until, now)
            )
          )
        )
    )
    return rows.length
  } catch {
    return 0
  }
}

/**
 * getAlertCountByType — Returns alert counts grouped by type for the dashboard card.
 */
export async function getAlertCountByType(): Promise<AlertCounts> {
  const token = await getRlsToken()
  if (!token) return { total: 0, missed_stop: 0, declining_chemistry: 0, incomplete_data: 0, unprofitable_pool: 0 }

  const userRole = token.user_role as string | undefined
  if (!userRole || !["owner", "office"].includes(userRole)) {
    return { total: 0, missed_stop: 0, declining_chemistry: 0, incomplete_data: 0, unprofitable_pool: 0 }
  }

  const now = new Date()

  try {
    const rows = await withRls(token, (db) =>
      db
        .select({ alert_type: alerts.alert_type })
        .from(alerts)
        .where(
          and(
            isNull(alerts.dismissed_at),
            or(
              isNull(alerts.snoozed_until),
              lt(alerts.snoozed_until, now)
            )
          )
        )
    )

    const counts: AlertCounts = {
      total: rows.length,
      missed_stop: 0,
      declining_chemistry: 0,
      incomplete_data: 0,
      unprofitable_pool: 0,
    }

    for (const row of rows) {
      const t = row.alert_type as AlertType
      if (t === "missed_stop") counts.missed_stop++
      else if (t === "declining_chemistry") counts.declining_chemistry++
      else if (t === "incomplete_data") counts.incomplete_data++
      else if (t === "unprofitable_pool") counts.unprofitable_pool++
    }

    return counts
  } catch {
    return { total: 0, missed_stop: 0, declining_chemistry: 0, incomplete_data: 0, unprofitable_pool: 0 }
  }
}

// ─── Mutation actions ──────────────────────────────────────────────────────────

/**
 * dismissAlert — Permanently removes an alert from the active list.
 */
export async function dismissAlert(alertId: string): Promise<{ success: boolean; error?: string }> {
  const token = await getRlsToken()
  if (!token) return { success: false, error: "Not authenticated" }

  try {
    await withRls(token, (db) =>
      db
        .update(alerts)
        .set({ dismissed_at: new Date() })
        .where(eq(alerts.id, alertId))
    )

    revalidatePath("/alerts")
    revalidatePath("/dashboard")

    return { success: true }
  } catch (err) {
    console.error("[dismissAlert] Error:", err)
    return { success: false, error: "Failed to dismiss alert" }
  }
}

/**
 * snoozeAlert — Hides an alert until the snooze period expires.
 */
export async function snoozeAlert(
  alertId: string,
  durationMs: number
): Promise<{ success: boolean; error?: string }> {
  const token = await getRlsToken()
  if (!token) return { success: false, error: "Not authenticated" }

  try {
    const snoozedUntil = new Date(Date.now() + durationMs)

    await withRls(token, (db) =>
      db
        .update(alerts)
        .set({ snoozed_until: snoozedUntil })
        .where(eq(alerts.id, alertId))
    )

    revalidatePath("/alerts")

    return { success: true }
  } catch (err) {
    console.error("[snoozeAlert] Error:", err)
    return { success: false, error: "Failed to snooze alert" }
  }
}
