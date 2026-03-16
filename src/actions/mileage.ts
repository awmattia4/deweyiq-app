"use server"

/**
 * mileage.ts -- Mileage tracking server actions.
 *
 * Phase 11 (Plan 10): Auto-calculates mileage from route stop coordinates
 *   at clock-out. Manual entry for non-route trips. IRS-compliant CSV export.
 *
 * IRS standard mileage rate for 2026: $0.725/mile.
 * Road distance factor: 1.2x haversine (straight-line) distance.
 *
 * Auto-mileage: called from clockOut after completing a shift.
 * Manual entry: field tech or owner can log non-route trips.
 */

import { revalidatePath } from "next/cache"
import { createClient } from "@/lib/supabase/server"
import { adminDb, withRls } from "@/lib/db"
import type { SupabaseToken } from "@/lib/db"
import { mileageLogs, timeEntries, timeEntryStops, routeStops, profiles, orgSettings } from "@/lib/db/schema"
import { and, asc, between, desc, eq, gte, lte, sql, inArray } from "drizzle-orm"
import { haversineDistance } from "@/lib/geo/geofence"
import { toLocalDateString } from "@/lib/date-utils"

// ---------------------------------------------------------------------------
// Constants (defaults — overridden by org_settings when configured)
// ---------------------------------------------------------------------------

const DEFAULT_IRS_RATE = 0.725
const DEFAULT_ROAD_FACTOR = 1.2
const METERS_PER_MILE = 1609.344

// ---------------------------------------------------------------------------
// Org mileage rate helper
// ---------------------------------------------------------------------------

/**
 * Reads mileage_irs_rate and mileage_road_factor from org_settings.
 * Falls back to defaults when null/unconfigured.
 */
async function getOrgMileageRates(orgId: string): Promise<{ irsRate: number; roadFactor: number }> {
  const [settings] = await adminDb
    .select({
      mileage_irs_rate: orgSettings.mileage_irs_rate,
      mileage_road_factor: orgSettings.mileage_road_factor,
    })
    .from(orgSettings)
    .where(eq(orgSettings.org_id, orgId))
    .limit(1)
  return {
    irsRate: settings?.mileage_irs_rate ? parseFloat(settings.mileage_irs_rate) : DEFAULT_IRS_RATE,
    roadFactor: settings?.mileage_road_factor ? parseFloat(settings.mileage_road_factor) : DEFAULT_ROAD_FACTOR,
  }
}

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
// calculateRouteMileage
// ---------------------------------------------------------------------------

/**
 * calculateRouteMileage — Auto-calculates mileage for a completed shift.
 *
 * Gets all route_stops linked to time_entry_stops for this shift, ordered by
 * sort_index. For each consecutive pair, calculates straight-line distance
 * using haversine, multiplies by 1.2 road factor. Sums total miles.
 *
 * Creates a mileage_logs entry with is_auto_calculated=true.
 *
 * Called at clock-out from time-tracking.ts.
 * Uses adminDb because this is a system operation triggered by clock-out.
 *
 * @returns mileage log ID if created, null if skipped (no coordinates).
 */
export async function calculateRouteMileage(
  timeEntryId: string
): Promise<{ success: boolean; miles?: number; logId?: string; error?: string }> {
  try {
    // Fetch the time entry to get org/tech info and work_date
    const [entry] = await adminDb
      .select({
        id: timeEntries.id,
        org_id: timeEntries.org_id,
        tech_id: timeEntries.tech_id,
        work_date: timeEntries.work_date,
      })
      .from(timeEntries)
      .where(eq(timeEntries.id, timeEntryId))
      .limit(1)

    if (!entry) {
      return { success: false, error: `Time entry not found: ${timeEntryId}` }
    }

    // Get all stops for this shift, ordered by sort_index
    const entryStops = await adminDb
      .select({
        route_stop_id: timeEntryStops.route_stop_id,
      })
      .from(timeEntryStops)
      .where(eq(timeEntryStops.time_entry_id, timeEntryId))
      .orderBy(asc(timeEntryStops.id))

    if (entryStops.length < 2) {
      // Need at least 2 stops to calculate mileage
      return { success: true, miles: 0 }
    }

    // Fetch coordinates for each route stop
    const stopIds = entryStops.map((s) => s.route_stop_id)
    const stopCoords = await adminDb
      .select({
        id: routeStops.id,
        sort_index: routeStops.sort_index,
      })
      .from(routeStops)
      .where(inArray(routeStops.id, stopIds))

    // Build coordinate map — route_stops has no lat/lng directly.
    // Mileage uses customer address geocoding. Since the stops table references
    // customers and pools but doesn't store lat/lng inline, we approximate using
    // stop sort_index ordering and note that actual GPS would come from customer
    // pool.geocoded_lat/lng. For now, return 0 miles if no coordinates available.
    // TODO: Join to pools for lat/lng when pool geocoding is wired (Phase 4 data).
    // This is a known limitation — manual entry is the fallback for non-geocoded routes.
    if (stopCoords.length < 2) {
      return { success: true, miles: 0 }
    }

    // Since routeStops doesn't expose lat/lng (they live in pools table),
    // we calculate using the pools' geocoded coordinates via a JOIN
    const stopsWithCoords = await adminDb.execute(
      sql`
        SELECT rs.id, p.geocoded_lat, p.geocoded_lng
        FROM route_stops rs
        LEFT JOIN pools p ON p.id = rs.pool_id
        WHERE rs.id = ANY(${stopIds})
        AND p.geocoded_lat IS NOT NULL
        AND p.geocoded_lng IS NOT NULL
        ORDER BY rs.sort_index ASC
      `
    )

    const rows = (stopsWithCoords as unknown as Array<{
      id: string
      geocoded_lat: number
      geocoded_lng: number
    }>)

    if (rows.length < 2) {
      // No geocoded stops — skip auto-mileage (manual entry fallback)
      return { success: true, miles: 0 }
    }

    // Get org-specific mileage rates (or defaults)
    const { irsRate, roadFactor } = await getOrgMileageRates(entry.org_id)

    // Calculate total route mileage using haversine + road factor
    let totalMeters = 0
    for (let i = 1; i < rows.length; i++) {
      const prev = rows[i - 1]
      const curr = rows[i]
      const distMeters = haversineDistance(
        prev.geocoded_lat,
        prev.geocoded_lng,
        curr.geocoded_lat,
        curr.geocoded_lng
      )
      totalMeters += distMeters * roadFactor
    }

    const totalMiles = totalMeters / METERS_PER_MILE

    if (totalMiles < 0.1) {
      // Less than 0.1 miles — not worth logging
      return { success: true, miles: 0 }
    }

    // Insert mileage log
    const inserted = await adminDb
      .insert(mileageLogs)
      .values({
        org_id: entry.org_id,
        tech_id: entry.tech_id,
        work_date: entry.work_date,
        origin_address: "Route start",
        destination_address: "Route end",
        purpose: "Pool service route",
        miles: totalMiles.toFixed(2),
        rate_per_mile: irsRate.toFixed(4),
        is_auto_calculated: true,
        time_entry_id: timeEntryId,
      })
      .returning({ id: mileageLogs.id })

    return { success: true, miles: parseFloat(totalMiles.toFixed(2)), logId: inserted[0]?.id }
  } catch (err) {
    console.error("[calculateRouteMileage] Error:", err)
    return { success: false, error: "Failed to calculate route mileage" }
  }
}

// ---------------------------------------------------------------------------
// addManualMileage
// ---------------------------------------------------------------------------

/**
 * addManualMileage — Tech or owner creates a manual mileage entry.
 * For non-route trips (customer visit, supply run, training, etc.).
 */
export async function addManualMileage(input: {
  workDate: string
  originAddress: string
  destinationAddress: string
  purpose: string
  miles: number
}): Promise<{ success: boolean; logId?: string; error?: string }> {
  const token = await getRlsToken()
  if (!token) return { success: false, error: "Not authenticated" }

  const role = token["user_role"] as string | undefined
  if (!role || !["owner", "office", "tech"].includes(role)) {
    return { success: false, error: "Unauthorized" }
  }

  if (isNaN(input.miles) || input.miles <= 0) {
    return { success: false, error: "Miles must be a positive number" }
  }

  if (!input.workDate || !/^\d{4}-\d{2}-\d{2}$/.test(input.workDate)) {
    return { success: false, error: "Invalid date format" }
  }

  if (!input.purpose.trim()) {
    return { success: false, error: "Purpose is required" }
  }

  const orgId = token["org_id"] as string
  const userId = token["sub"] as string

  try {
    // Get org-specific IRS rate (or default)
    const { irsRate } = await getOrgMileageRates(orgId)

    const inserted = await withRls(token, (db) =>
      db
        .insert(mileageLogs)
        .values({
          org_id: orgId,
          tech_id: userId,
          work_date: input.workDate,
          origin_address: input.originAddress.trim() || null,
          destination_address: input.destinationAddress.trim() || null,
          purpose: input.purpose.trim(),
          miles: input.miles.toFixed(2),
          rate_per_mile: irsRate.toFixed(4),
          is_auto_calculated: false,
        })
        .returning({ id: mileageLogs.id })
    )

    revalidatePath("/reports")
    return { success: true, logId: inserted[0]?.id }
  } catch (err) {
    console.error("[addManualMileage] Error:", err)
    return { success: false, error: "Failed to add mileage entry" }
  }
}

// ---------------------------------------------------------------------------
// getMileageLog
// ---------------------------------------------------------------------------

export interface MileageLogEntry {
  id: string
  tech_id: string
  tech_name: string | null
  work_date: string
  origin_address: string | null
  destination_address: string | null
  purpose: string | null
  miles: string
  rate_per_mile: string
  deduction_amount: string
  is_auto_calculated: boolean
  time_entry_id: string | null
  created_at: Date
}

/**
 * getMileageLog — Returns mileage_logs filtered by tech and date range.
 * Owner sees all techs, tech sees own entries only.
 */
export async function getMileageLog(
  techId?: string,
  startDate?: string,
  endDate?: string
): Promise<MileageLogEntry[]> {
  const token = await getRlsToken()
  if (!token) return []

  const role = token["user_role"] as string | undefined
  if (!role || !["owner", "office", "tech"].includes(role)) return []

  const userId = token["sub"] as string

  // Techs can only see their own mileage
  const effectiveTechId = role === "tech" ? userId : techId

  try {
    return await withRls(token, async (db) => {
      const conditions = []

      if (effectiveTechId) {
        conditions.push(eq(mileageLogs.tech_id, effectiveTechId))
      }

      if (startDate && endDate) {
        conditions.push(between(mileageLogs.work_date, startDate, endDate))
      } else if (startDate) {
        conditions.push(gte(mileageLogs.work_date, startDate))
      } else if (endDate) {
        conditions.push(lte(mileageLogs.work_date, endDate))
      }

      const rows = await db
        .select({
          id: mileageLogs.id,
          tech_id: mileageLogs.tech_id,
          work_date: mileageLogs.work_date,
          origin_address: mileageLogs.origin_address,
          destination_address: mileageLogs.destination_address,
          purpose: mileageLogs.purpose,
          miles: mileageLogs.miles,
          rate_per_mile: mileageLogs.rate_per_mile,
          is_auto_calculated: mileageLogs.is_auto_calculated,
          time_entry_id: mileageLogs.time_entry_id,
          created_at: mileageLogs.created_at,
        })
        .from(mileageLogs)
        .where(conditions.length > 0 ? and(...conditions) : undefined)
        .orderBy(desc(mileageLogs.work_date), desc(mileageLogs.created_at))

      // Batch fetch tech names
      const techIds = [...new Set(rows.map((r) => r.tech_id))]
      const techMap = new Map<string, string>()
      if (techIds.length > 0) {
        const profileRows = await db
          .select({ id: profiles.id, full_name: profiles.full_name })
          .from(profiles)
          .where(inArray(profiles.id, techIds))
        for (const p of profileRows) {
          techMap.set(p.id, p.full_name ?? "Unknown")
        }
      }

      return rows.map((r) => {
        const miles = parseFloat(r.miles)
        const rate = parseFloat(r.rate_per_mile)
        const deduction = miles * rate
        return {
          id: r.id,
          tech_id: r.tech_id,
          tech_name: techMap.get(r.tech_id) ?? null,
          work_date: r.work_date,
          origin_address: r.origin_address,
          destination_address: r.destination_address,
          purpose: r.purpose,
          miles: r.miles,
          rate_per_mile: r.rate_per_mile,
          deduction_amount: deduction.toFixed(2),
          is_auto_calculated: r.is_auto_calculated,
          time_entry_id: r.time_entry_id,
          created_at: r.created_at,
        }
      })
    })
  } catch (err) {
    console.error("[getMileageLog] Error:", err)
    return []
  }
}

// ---------------------------------------------------------------------------
// exportMileageLog
// ---------------------------------------------------------------------------

/**
 * exportMileageLog — Generates IRS-compliant mileage log CSV.
 *
 * Columns: Date, Origin, Destination, Business Purpose, Miles, Rate Per Mile, Deduction Amount
 *
 * IRS Publication 463 requires: date, destination, business purpose, and miles.
 * Origin is recommended but not strictly required.
 */
export async function exportMileageLog(
  techId: string,
  year: string
): Promise<{ success: boolean; csv?: string; filename?: string; error?: string }> {
  const token = await getRlsToken()
  if (!token) return { success: false, error: "Not authenticated" }

  const role = token["user_role"] as string | undefined
  if (!role || !["owner", "office", "tech"].includes(role)) {
    return { success: false, error: "Unauthorized" }
  }

  // Techs can only export their own logs
  if (role === "tech" && techId !== (token["sub"] as string)) {
    return { success: false, error: "You can only export your own mileage log" }
  }

  const startDate = `${year}-01-01`
  const endDate = `${year}-12-31`

  const entries = await getMileageLog(techId, startDate, endDate)

  if (entries.length === 0) {
    return { success: true, csv: "", filename: `mileage-log-${year}.csv` }
  }

  // Build CSV
  const headers = [
    "Date",
    "Origin",
    "Destination",
    "Business Purpose",
    "Miles",
    "Rate Per Mile",
    "Deduction Amount",
  ]

  const rows = entries.map((e) => {
    const rate = parseFloat(e.rate_per_mile)
    return [
      e.work_date,
      e.origin_address ?? "",
      e.destination_address ?? "",
      e.purpose ?? "",
      parseFloat(e.miles).toFixed(1),
      `$${rate.toFixed(3)}`,
      `$${e.deduction_amount}`,
    ].map((cell) => `"${String(cell).replace(/"/g, '""')}"`)
  })

  // Summary row
  const totalMiles = entries.reduce((sum, e) => sum + parseFloat(e.miles), 0)
  const totalDeduction = entries.reduce((sum, e) => sum + parseFloat(e.deduction_amount), 0)
  const summaryRow = [
    "TOTAL",
    "",
    "",
    `${entries.length} trips`,
    totalMiles.toFixed(1),
    "",
    `$${totalDeduction.toFixed(2)}`,
  ].map((cell) => `"${cell}"`)

  const csvLines = [
    headers.map((h) => `"${h}"`).join(","),
    ...rows.map((r) => r.join(",")),
    summaryRow.join(","),
  ]

  const csv = csvLines.join("\n")
  const techName = entries[0]?.tech_name?.replace(/\s+/g, "-").toLowerCase() ?? "tech"
  const filename = `mileage-log-${year}-${techName}.csv`

  return { success: true, csv, filename }
}

// ---------------------------------------------------------------------------
// getMileageSummary
// ---------------------------------------------------------------------------

/**
 * getMileageSummary — Total miles and deduction amount for a date range.
 * Used by financial dashboard and expense overview.
 */
export async function getMileageSummary(
  startDate: string,
  endDate: string
): Promise<{
  totalMiles: number
  totalDeduction: number
  tripCount: number
}> {
  const token = await getRlsToken()
  if (!token) return { totalMiles: 0, totalDeduction: 0, tripCount: 0 }

  const role = token["user_role"] as string | undefined
  if (!role || !["owner", "office"].includes(role)) {
    return { totalMiles: 0, totalDeduction: 0, tripCount: 0 }
  }

  try {
    const result = await withRls(token, async (db) => {
      const rows = await db
        .select({
          totalMiles: sql<string>`COALESCE(SUM(${mileageLogs.miles}::numeric), 0)::text`,
          tripCount: sql<number>`COUNT(*)::int`,
          // rate_per_mile can vary per entry; compute deduction inline
          totalDeduction: sql<string>`COALESCE(SUM(${mileageLogs.miles}::numeric * ${mileageLogs.rate_per_mile}::numeric), 0)::text`,
        })
        .from(mileageLogs)
        .where(between(mileageLogs.work_date, startDate, endDate))

      return rows[0] ?? { totalMiles: "0", tripCount: 0, totalDeduction: "0" }
    })

    return {
      totalMiles: parseFloat(result.totalMiles),
      totalDeduction: parseFloat(result.totalDeduction),
      tripCount: result.tripCount,
    }
  } catch (err) {
    console.error("[getMileageSummary] Error:", err)
    return { totalMiles: 0, totalDeduction: 0, tripCount: 0 }
  }
}
