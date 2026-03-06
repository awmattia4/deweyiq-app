import { NextRequest, NextResponse } from "next/server"
import { createClient } from "@/lib/supabase/server"
import { withRls } from "@/lib/db"
import type { SupabaseToken } from "@/lib/db"
import { routeDays, customers, pools, serviceVisits } from "@/lib/db/schema"
import { and, eq, desc } from "drizzle-orm"
import type { RouteStop } from "@/actions/routes"

/**
 * GET /api/routes/today
 *
 * Returns today's ordered stop list for the authenticated tech.
 *
 * Auth: any authenticated org member (tech sees own route, owner/office can
 *       pass optional ?techId= query param to view any tech's route).
 *
 * Response: RouteStop[] (empty array if no route_day for today)
 *
 * This endpoint is called by:
 * - prefetchTodayRoutes() in sync.ts (offline cache on app open)
 * - Client-side fallback if SSR server action fails
 */
export async function GET(req: NextRequest): Promise<NextResponse> {
  // 1. Authenticate
  const supabase = await createClient()
  const { data: claimsData } = await supabase.auth.getClaims()

  if (!claimsData?.claims) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  const claims = claimsData.claims as SupabaseToken
  const userRole = claims["user_role"] as string | undefined
  const orgId = claims["org_id"] as string | undefined
  const userId = claims["sub"] as string | undefined

  if (!userRole || !orgId || !userId) {
    return NextResponse.json({ error: "Invalid token claims" }, { status: 401 })
  }

  // 2. Determine which tech's route to fetch
  //    - Tech: always their own route
  //    - Owner/Office: can specify ?techId= to view any tech's route
  let techId: string
  if (userRole === "tech") {
    techId = userId
  } else if (userRole === "owner" || userRole === "office") {
    const techIdParam = req.nextUrl.searchParams.get("techId")
    techId = techIdParam ?? userId
  } else {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 })
  }

  // 3. Query for today's route_day
  const today = new Date().toISOString().split("T")[0] // "YYYY-MM-DD"

  try {
    const stops = await withRls(claims, async (db) => {
      // Find today's route_day for this tech
      const routeDayRows = await db
        .select()
        .from(routeDays)
        .where(
          and(
            eq(routeDays.org_id, orgId),
            eq(routeDays.tech_id, techId),
            eq(routeDays.date, today)
          )
        )
        .limit(1)

      if (routeDayRows.length === 0) {
        return []
      }

      const routeDay = routeDayRows[0]
      const stopOrder = routeDay.stop_order // Array<{ customer_id, pool_id, sort_index }>

      if (!stopOrder || stopOrder.length === 0) {
        return []
      }

      // 4. Fetch customer and pool data for each stop using LEFT JOIN (not correlated
      //    subqueries — RLS pitfall documented in MEMORY.md: correlated subqueries on
      //    RLS-protected tables return wrong results inside withRls transactions).
      //
      //    We fetch all needed customers and pools in a single JOIN query, then map.

      const customerIds = stopOrder.map((s) => s.customer_id)
      const poolIds = stopOrder.map((s) => s.pool_id)

      // Fetch customers
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

      // Fetch pools
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

      // 5. Fetch last service_visit for each pool in stopOrder
      //    Use LEFT JOIN approach: query all recent visits for relevant pools,
      //    then pick the most recent per pool in JavaScript (safe, no correlated subquery).
      const recentVisits = await db
        .select({
          pool_id: serviceVisits.pool_id,
          visited_at: serviceVisits.visited_at,
          status: serviceVisits.status,
        })
        .from(serviceVisits)
        .where(eq(serviceVisits.org_id, orgId))
        .orderBy(desc(serviceVisits.visited_at))

      // Build a map of pool_id -> most recent visit (first entry per pool due to desc sort)
      const lastVisitMap = new Map<string, { visited_at: Date; status: string | null }>()
      for (const visit of recentVisits) {
        if (visit.pool_id && !lastVisitMap.has(visit.pool_id)) {
          lastVisitMap.set(visit.pool_id, {
            visited_at: visit.visited_at,
            status: visit.status,
          })
        }
      }

      // 6. Build the stop array in stop_order order
      const result: RouteStop[] = stopOrder
        .sort((a, b) => a.sort_index - b.sort_index)
        .map((stop, idx) => {
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
            poolType: pool?.type ?? "pool",
            sanitizerType: pool?.sanitizer_type ?? null,
            volumeGallons: pool?.volume_gallons ?? null,
            gateCode: customer?.gate_code ?? null,
            accessNotes: customer?.access_notes ?? null,
            customerNotes: pool?.notes ?? null,
            lastServiceDate: lastVisit?.visited_at?.toISOString() ?? null,
            stopStatus: "upcoming" as const,
          }
        })

      return result
    })

    return NextResponse.json(stops)
  } catch (error) {
    console.error("[api/routes/today] Error:", error)
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    )
  }
}
