"use server"

import { createClient } from "@/lib/supabase/server"
import { withRls } from "@/lib/db"
import type { SupabaseToken } from "@/lib/db"
import { routeDays, customers, pools, serviceVisits } from "@/lib/db/schema"
import { and, eq, desc } from "drizzle-orm"

// ─── Types ────────────────────────────────────────────────────────────────────

/**
 * A single stop on today's route — the shape returned by the API and server action.
 * Consumed by StopCard and StopList components.
 */
export interface RouteStop {
  stopIndex: number
  routeDayId: string
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
 * fetchStopsForTech — internal helper used by getTodayStops and the API route.
 *
 * Queries route_days + customers + pools + last service_visits for a given
 * tech and date. Uses LEFT JOIN approach (no correlated subqueries) per the
 * critical RLS pitfall documented in MEMORY.md.
 */
async function fetchStopsForTech(
  token: SupabaseToken,
  orgId: string,
  techId: string,
  date: string
): Promise<RouteStop[]> {
  return withRls(token, async (db) => {
    // Find today's route_day for this tech
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

    // Fetch all customers in the org (RLS filters to org scope automatically)
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

    // Fetch all pools in the org
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
    for (const visit of recentVisits) {
      if (visit.pool_id && !lastVisitMap.has(visit.pool_id)) {
        lastVisitMap.set(visit.pool_id, {
          visited_at: visit.visited_at,
          status: visit.status,
        })
      }
    }

    // Build stop array in sort_index order
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
          stopStatus: "upcoming",
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
 * Returns empty array if no route_day exists for today.
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
 * LIMITATION: route_days UPDATE policy is owner+office only. Techs cannot
 * update route_days via RLS. For techs, the reorder is stored only in Dexie
 * routeCache locally — the visual order changes but the server record is
 * unchanged. Phase 4 will add persistent tech reordering when the full
 * scheduling system is built.
 *
 * For owner/office calls (e.g., dispatchers adjusting route mid-day), this
 * will persist to the server if the caller has the correct role.
 */
export async function reorderStops(
  routeDayId: string,
  newOrder: Array<{ customer_id: string; pool_id: string; sort_index: number }>
): Promise<{ success: boolean; error?: string }> {
  const token = await getRlsToken()
  if (!token) return { success: false, error: "Not authenticated" }

  const userRole = token["user_role"] as string | undefined

  // Techs cannot update route_days (RLS restriction).
  // Reordering for techs is purely client-side via Dexie — caller should handle this case.
  if (userRole === "tech") {
    // Return success — caller (StopList) handles local Dexie write
    return { success: true }
  }

  try {
    await withRls(token, async (db) => {
      await db
        .update(routeDays)
        .set({ stop_order: newOrder })
        .where(eq(routeDays.id, routeDayId))
    })
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
 * @param routeDayId - The route_day this stop belongs to
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
