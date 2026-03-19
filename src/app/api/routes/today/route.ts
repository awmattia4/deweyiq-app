import { NextRequest, NextResponse } from "next/server"
import { createClient } from "@/lib/supabase/server"
import type { SupabaseToken } from "@/lib/db"
import { fetchStopsForTech } from "@/actions/routes"
import { toLocalDateString } from "@/lib/date-utils"

/**
 * GET /api/routes/today
 *
 * Returns today's ordered stop list for the authenticated tech.
 *
 * Auth: any authenticated org member (tech sees own route, owner/office can
 *       pass optional ?techId= query param to view any tech's route).
 *
 * Response: RouteStop[] (empty array if no stops for today)
 *
 * Phase 4: delegates to fetchStopsForTech which reads from route_stops
 * with automatic fallback to route_days for backward compat.
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

  // 3. Fetch stops via shared helper (reads route_stops with route_days fallback)
  const today = toLocalDateString() // "YYYY-MM-DD"

  try {
    const stops = await fetchStopsForTech(claims, orgId, techId, today)
    return NextResponse.json(stops)
  } catch (error) {
    console.error("[api/routes/today] Error:", error)
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    )
  }
}
