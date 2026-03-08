"use server"

import { createClient } from "@/lib/supabase/server"
import { withRls } from "@/lib/db"
import type { SupabaseToken } from "@/lib/db"
import { routeDays, routeStops, customers, pools, serviceVisits } from "@/lib/db/schema"
import { and, eq, desc, asc } from "drizzle-orm"

// ─── Types ────────────────────────────────────────────────────────────────────

/**
 * A single stop on today's route — the shape returned by the API and server action.
 * Consumed by StopCard and StopList components.
 *
 * Phase 4 additions: routeStopId, positionLocked, windowStart, windowEnd, scheduleRuleId.
 * routeDayId is kept as optional for backward compat during the Phase 3→4 transition.
 */
export interface RouteStop {
  stopIndex: number
  /** Phase 4: route_stops.id — the primary row reference for this stop */
  routeStopId?: string
  /** Phase 3 compat: route_days.id — kept during transition; undefined for Phase 4 stops */
  routeDayId?: string
  customerId: string
  poolId: string
  customerName: string
  address: string | null
  phone: string | null
  poolName: string
  poolType: "pool" | "spa" | "fountain"
  sanitizerType: "chlorine" | "salt" | "bromine" | "biguanide" | null
  volumeGallons: number | null
  gateCode: string | null
  accessNotes: string | null
  customerNotes: string | null
  lastServiceDate: string | null
  // "upcoming" | "in_progress" | "complete" | "skipped"
  // Persisted in local Dexie store — server only knows visits, not per-stop status
  stopStatus: "upcoming" | "in_progress" | "complete" | "skipped"
  /** Phase 4: whether this stop is locked in place (excluded from optimizer) */
  positionLocked?: boolean
  /** Phase 4: time window start (HH:MM:SS) */
  windowStart?: string | null
  /** Phase 4: time window end (HH:MM:SS) */
  windowEnd?: string | null
  /** Phase 4: schedule rule that generated this stop */
  scheduleRuleId?: string | null
}

// ─── Helper ───────────────────────────────────────────────────────────────────

async function getRlsToken(): Promise<SupabaseToken | null> {
  const supabase = await createClient()
  const { data: claimsData } = await supabase.auth.getClaims()
  if (!claimsData?.claims) return null
  return claimsData.claims as SupabaseToken
}

// ─── Core query helper ────────────────────────────────────────────────────────

/**
 * fetchStopsForTech — primary helper used by getTodayStops and the API route.
 *
 * Phase 4: reads from route_stops table first. Falls back to route_days JSONB
 * if no route_stops rows exist for the tech+date (backward compat for orgs that
 * haven't yet migrated their route data via migrateRouteDaysToRouteStops).
 *
 * Uses LEFT JOIN approach (no correlated subqueries) per the RLS pitfall
 * documented in MEMORY.md.
 *
 * Exported so the API route (/api/routes/today) can call it directly,
 * eliminating duplicated query logic.
 */
export async function fetchStopsForTech(
  token: SupabaseToken,
  orgId: string,
  techId: string,
  date: string
): Promise<RouteStop[]> {
  return withRls(token, async (db) => {
    // ── Phase 4 path: read from route_stops ──────────────────────────────────
    const routeStopRows = await db
      .select()
      .from(routeStops)
      .where(
        and(
          eq(routeStops.org_id, orgId),
          eq(routeStops.tech_id, techId),
          eq(routeStops.scheduled_date, date)
        )
      )
      .orderBy(asc(routeStops.sort_index))

    // Shared data loading — fetch customers, pools, visits for both paths
    const customerRows = await db
      .select({
        id: customers.id,
        full_name: customers.full_name,
        address: customers.address,
        phone: customers.phone,
        gate_code: customers.gate_code,
        access_notes: customers.access_notes,
        status: customers.status,
      })
      .from(customers)
      .where(eq(customers.org_id, orgId))

    const customerMap = new Map(customerRows.map((c) => [c.id, c]))

    const poolRows = await db
      .select({
        id: pools.id,
        name: pools.name,
        type: pools.type,
        volume_gallons: pools.volume_gallons,
        sanitizer_type: pools.sanitizer_type,
        notes: pools.notes,
        customer_id: pools.customer_id,
      })
      .from(pools)
      .where(eq(pools.org_id, orgId))

    const poolMap = new Map(poolRows.map((p) => [p.id, p]))

    // Fetch recent service visits — ordered desc by visited_at.
    // We pick first entry per pool_id in JS (avoids correlated subquery anti-pattern).
    const recentVisits = await db
      .select({
        pool_id: serviceVisits.pool_id,
        visited_at: serviceVisits.visited_at,
        status: serviceVisits.status,
      })
      .from(serviceVisits)
      .where(eq(serviceVisits.org_id, orgId))
      .orderBy(desc(serviceVisits.visited_at))

    const lastVisitMap = new Map<string, { visited_at: Date; status: string | null }>()
    const todayVisitStatusMap = new Map<string, string>()
    for (const visit of recentVisits) {
      if (visit.pool_id && !lastVisitMap.has(visit.pool_id)) {
        lastVisitMap.set(visit.pool_id, {
          visited_at: visit.visited_at,
          status: visit.status,
        })
      }
      if (visit.pool_id && !todayVisitStatusMap.has(visit.pool_id)) {
        const visitDate = visit.visited_at.toISOString().split("T")[0]
        if (visitDate === date && visit.status) {
          todayVisitStatusMap.set(visit.pool_id, visit.status)
        }
      }
    }

    if (routeStopRows.length > 0) {
      // Phase 4 path: route_stops exist — use them
      return routeStopRows.map((stop, idx): RouteStop => {
        const customer = customerMap.get(stop.customer_id)
        const pool = stop.pool_id ? poolMap.get(stop.pool_id) : undefined
        const lastVisit = stop.pool_id ? lastVisitMap.get(stop.pool_id) : undefined
        const poolKey = stop.pool_id ?? ""

        return {
          stopIndex: idx,
          routeStopId: stop.id,
          customerId: stop.customer_id,
          poolId: stop.pool_id ?? "",
          customerName: customer?.full_name ?? "Unknown Customer",
          address: customer?.address ?? null,
          phone: customer?.phone ?? null,
          poolName: pool?.name ?? "Pool",
          poolType: (pool?.type as RouteStop["poolType"]) ?? "pool",
          sanitizerType: (pool?.sanitizer_type as RouteStop["sanitizerType"]) ?? null,
          volumeGallons: pool?.volume_gallons ?? null,
          gateCode: customer?.gate_code ?? null,
          accessNotes: customer?.access_notes ?? null,
          customerNotes: pool?.notes ?? null,
          lastServiceDate: lastVisit?.visited_at?.toISOString() ?? null,
          stopStatus: (todayVisitStatusMap.get(poolKey) as RouteStop["stopStatus"]) ?? "upcoming",
          positionLocked: stop.position_locked,
          windowStart: stop.window_start,
          windowEnd: stop.window_end,
          scheduleRuleId: stop.schedule_rule_id,
        }
      })
    }

    // ── Phase 3 fallback: read from route_days JSONB ──────────────────────────
    // Used when office staff haven't run migrateRouteDaysToRouteStops yet.
    console.warn(
      `[fetchStopsForTech] No route_stops found for tech=${techId} date=${date}. ` +
        "Falling back to route_days JSONB. Run migrateRouteDaysToRouteStops to upgrade."
    )

    const routeDayRows = await db
      .select()
      .from(routeDays)
      .where(
        and(
          eq(routeDays.org_id, orgId),
          eq(routeDays.tech_id, techId),
          eq(routeDays.date, date)
        )
      )
      .limit(1)

    if (routeDayRows.length === 0) return []

    const routeDay = routeDayRows[0]
    const stopOrder = routeDay.stop_order

    if (!stopOrder || stopOrder.length === 0) return []

    return stopOrder
      .sort((a, b) => a.sort_index - b.sort_index)
      .map((stop, idx): RouteStop => {
        const customer = customerMap.get(stop.customer_id)
        const pool = poolMap.get(stop.pool_id)
        const lastVisit = lastVisitMap.get(stop.pool_id)

        return {
          stopIndex: idx,
          routeDayId: routeDay.id,
          customerId: stop.customer_id,
          poolId: stop.pool_id,
          customerName: customer?.full_name ?? "Unknown Customer",
          address: customer?.address ?? null,
          phone: customer?.phone ?? null,
          poolName: pool?.name ?? "Pool",
          poolType: (pool?.type as RouteStop["poolType"]) ?? "pool",
          sanitizerType: (pool?.sanitizer_type as RouteStop["sanitizerType"]) ?? null,
          volumeGallons: pool?.volume_gallons ?? null,
          gateCode: customer?.gate_code ?? null,
          accessNotes: customer?.access_notes ?? null,
          customerNotes: pool?.notes ?? null,
          lastServiceDate: lastVisit?.visited_at?.toISOString() ?? null,
          stopStatus: (todayVisitStatusMap.get(stop.pool_id) as RouteStop["stopStatus"]) ?? "upcoming",
        }
      })
  })
}

// ─── Public server actions ─────────────────────────────────────────────────────

/**
 * getTodayStops — SSR server action for the /routes page.
 *
 * Fetches today's ordered stops for the authenticated tech (or for a specified
 * techId if called by owner/office). Identical data shape to GET /api/routes/today.
 *
 * Returns empty array if no route stops exist for today.
 */
export async function getTodayStops(techId?: string): Promise<RouteStop[]> {
  const supabase = await createClient()
  const { data: claimsData } = await supabase.auth.getClaims()
  if (!claimsData?.claims) return []

  const claims = claimsData.claims as SupabaseToken
  const userRole = claims["user_role"] as string | undefined
  const orgId = claims["org_id"] as string | undefined
  const userId = claims["sub"] as string | undefined

  if (!userRole || !orgId || !userId) return []

  // Determine effective techId
  let effectiveTechId: string
  if (userRole === "tech") {
    effectiveTechId = userId
  } else {
    effectiveTechId = techId ?? userId
  }

  const today = new Date().toISOString().split("T")[0]

  try {
    return await fetchStopsForTech(claims, orgId, effectiveTechId, today)
  } catch (error) {
    console.error("[getTodayStops] Error:", error)
    return []
  }
}

/**
 * reorderStops — update stop ordering.
 *
 * Phase 4: Updates sort_index on route_stops rows. Works for all roles since
 * route_stops UPDATE policy includes tech role (unlike route_days which was
 * owner+office only).
 *
 * Falls back to route_days JSONB update for orgs still on Phase 3 data.
 *
 * @param routeStopIdOrDayId - Either a route_stops.id (Phase 4) or route_days.id (Phase 3)
 * @param newOrder           - Array of {id, sortIndex} pairs (Phase 4) or
 *                             {customer_id, pool_id, sort_index} (Phase 3)
 */
export async function reorderStops(
  routeStopIdOrDayId: string,
  newOrder:
    | Array<{ id: string; sortIndex: number }>
    | Array<{ customer_id: string; pool_id: string; sort_index: number }>
): Promise<{ success: boolean; error?: string }> {
  const token = await getRlsToken()
  if (!token) return { success: false, error: "Not authenticated" }

  // Detect Phase 4 vs Phase 3 call pattern by shape of first item
  const isPhase4Order =
    newOrder.length > 0 && "sortIndex" in newOrder[0] && "id" in newOrder[0]

  try {
    if (isPhase4Order) {
      // Phase 4: update sort_index on individual route_stop rows
      const phase4Order = newOrder as Array<{ id: string; sortIndex: number }>
      await withRls(token, async (db) => {
        for (const item of phase4Order) {
          await db
            .update(routeStops)
            .set({ sort_index: item.sortIndex, updated_at: new Date() })
            .where(eq(routeStops.id, item.id))
        }
      })
    } else {
      // Phase 3 fallback: update route_days.stop_order JSONB
      // (techs get a no-op since route_days UPDATE is owner+office only)
      const userRole = token["user_role"] as string | undefined
      if (userRole === "tech") {
        return { success: true } // caller handles Dexie-only reorder for techs on Phase 3 data
      }
      const phase3Order = newOrder as Array<{
        customer_id: string
        pool_id: string
        sort_index: number
      }>
      await withRls(token, async (db) => {
        await db
          .update(routeDays)
          .set({ stop_order: phase3Order })
          .where(eq(routeDays.id, routeStopIdOrDayId))
      })
    }
    return { success: true }
  } catch (error) {
    console.error("[reorderStops] Error:", error)
    return { success: false, error: "Failed to save reorder" }
  }
}

/**
 * skipStop — mark a stop as skipped with a reason.
 *
 * Creates a service_visit with status="skipped" and the provided reason.
 * Uses enqueueWrite() pattern via the API so it works offline.
 *
 * @param routeDayId - The route_day this stop belongs to (Phase 3 compat)
 * @param customerId - Customer being skipped
 * @param poolId     - Pool being skipped
 * @param reason     - Free-text reason for skipping
 */
export async function skipStop(
  routeDayId: string,
  customerId: string,
  poolId: string,
  reason: string
): Promise<{ success: boolean; error?: string }> {
  const token = await getRlsToken()
  if (!token) return { success: false, error: "Not authenticated" }

  const orgId = token["org_id"] as string | undefined
  const userId = token["sub"] as string | undefined

  if (!orgId || !userId) return { success: false, error: "Invalid token" }

  try {
    await withRls(token, async (db) => {
      await db.insert(serviceVisits).values({
        org_id: orgId,
        customer_id: customerId,
        pool_id: poolId,
        tech_id: userId,
        visit_type: "routine",
        visited_at: new Date(),
        status: "skipped",
        skip_reason: reason,
        notes: `Skipped: ${reason}`,
      })
    })
    return { success: true }
  } catch (error) {
    console.error("[skipStop] Error:", error)
    return { success: false, error: "Failed to record skip" }
  }
}
