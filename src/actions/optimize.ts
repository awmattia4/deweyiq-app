"use server"

import { revalidatePath } from "next/cache"
import { createClient } from "@/lib/supabase/server"
import { withRls } from "@/lib/db"
import type { SupabaseToken } from "@/lib/db"
import { routeStops, customers, pools } from "@/lib/db/schema"
import { and, eq, inArray } from "drizzle-orm"

// ─── Types ────────────────────────────────────────────────────────────────────

/**
 * StopForOptimization — internal shape used during optimization calculation.
 * Includes all fields needed to call ORS and reconstruct the final order.
 */
interface StopForOptimization {
  id: string
  customerId: string
  customerName: string
  address: string | null
  sortIndex: number
  positionLocked: boolean
  windowStart: string | null
  windowEnd: string | null
  lat: number | null
  lng: number | null
}

/**
 * OptimizedStop — stop entry in before/after comparison lists.
 * Returned to the client for preview rendering.
 */
export interface OptimizedStop {
  id: string
  customerName: string
  address: string | null
  sortIndex: number
  locked: boolean
}

/**
 * OptimizationResult — full result of calling optimizeRoute.
 * Contains both the current and proposed optimized stop orders,
 * drive time estimates, and diagnostic info.
 */
export interface OptimizationResult {
  success: boolean
  error?: string
  currentOrder: OptimizedStop[]
  optimizedOrder: OptimizedStop[]
  currentDriveTimeMinutes: number
  optimizedDriveTimeMinutes: number
  timeSavedMinutes: number
  /** Number of stops excluded from optimization due to missing coordinates */
  stopsWithoutCoordinates: number
}

// ─── Auth helper ──────────────────────────────────────────────────────────────

async function getRlsToken(): Promise<SupabaseToken | null> {
  const supabase = await createClient()
  const { data: claimsData } = await supabase.auth.getClaims()
  if (!claimsData?.claims) return null
  return claimsData.claims as SupabaseToken
}

// ─── Helper functions ─────────────────────────────────────────────────────────

/**
 * timeToSeconds — convert "HH:MM:SS" or "HH:MM" time string to seconds from midnight.
 * Used for ORS time window constraints.
 */
function timeToSeconds(timeStr: string): number {
  const parts = timeStr.split(":").map(Number)
  const hours = parts[0] ?? 0
  const minutes = parts[1] ?? 0
  const seconds = parts[2] ?? 0
  return hours * 3600 + minutes * 60 + seconds
}

/**
 * haversineDistance — great-circle distance in km between two lat/lng points.
 * Used to estimate drive time for stops without ORS data (current order calculation).
 */
function haversineDistance(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const R = 6371 // Earth radius in km
  const dLat = ((lat2 - lat1) * Math.PI) / 180
  const dLng = ((lng2 - lng1) * Math.PI) / 180
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos((lat1 * Math.PI) / 180) *
      Math.cos((lat2 * Math.PI) / 180) *
      Math.sin(dLng / 2) *
      Math.sin(dLng / 2)
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a))
  return R * c
}

/**
 * estimateDriveTimeMinutes — estimate total drive time in minutes for an ordered list of stops.
 * Uses Haversine distance between consecutive stops at an average speed of 30 mph (48 km/h).
 * Only includes stops that have both lat and lng.
 */
function estimateDriveTimeMinutes(stops: Array<{ lat: number | null; lng: number | null }>): number {
  const avgSpeedKmh = 48 // 30 mph in km/h
  let totalKm = 0
  const geocodedStops = stops.filter((s): s is { lat: number; lng: number } => s.lat !== null && s.lng !== null)

  for (let i = 0; i < geocodedStops.length - 1; i++) {
    const a = geocodedStops[i]
    const b = geocodedStops[i + 1]
    totalKm += haversineDistance(a.lat, a.lng, b.lat, b.lng)
  }

  return Math.round((totalKm / avgSpeedKmh) * 60)
}

// ─── ORS optimization response types (subset) ─────────────────────────────────

interface ORSStep {
  type: string
  job?: number // index into jobs array (undefined for start/end vehicle steps)
  arrival?: number
  duration?: number
}

interface ORSRoute {
  steps: ORSStep[]
  summary?: { duration?: number }
}

interface ORSOptimizationResponse {
  routes: ORSRoute[]
  summary?: { duration?: number }
  unassigned?: Array<{ id: number }>
  code?: number
  message?: string
}

// ─── optimizeRoute ────────────────────────────────────────────────────────────

/**
 * optimizeRoute — server action that calls OpenRouteService (VROOM-backed) to
 * find the optimal visit order for a tech's stops on a given date.
 *
 * CRITICAL: ORS API key lives only on the server — never exposed to the client.
 *
 * Locked stops are handled via the simplified workaround:
 * 1. Exclude locked stops from the ORS request
 * 2. ORS optimizes only the unlocked stops
 * 3. Re-insert locked stops at their original sort_index positions
 *
 * Returns a before/after comparison with estimated drive times for the preview modal.
 * Does NOT apply the optimized order — user must call applyOptimizedOrder() to confirm.
 */
export async function optimizeRoute(
  techId: string,
  date: string
): Promise<OptimizationResult> {
  const emptyResult: OptimizationResult = {
    success: false,
    currentOrder: [],
    optimizedOrder: [],
    currentDriveTimeMinutes: 0,
    optimizedDriveTimeMinutes: 0,
    timeSavedMinutes: 0,
    stopsWithoutCoordinates: 0,
  }

  const token = await getRlsToken()
  if (!token) return { ...emptyResult, error: "Not authenticated" }

  const userRole = token["user_role"] as string | undefined
  const orgId = token["org_id"] as string | undefined

  if (!orgId) return { ...emptyResult, error: "Invalid token" }
  if (userRole !== "owner" && userRole !== "office") {
    return { ...emptyResult, error: "Insufficient permissions" }
  }

  // Check for ORS API key
  const orsKey = process.env.ORS_API_KEY
  if (!orsKey) {
    console.error("[optimizeRoute] ORS_API_KEY environment variable not set")
    return { ...emptyResult, error: "Route optimization is not configured. Please contact your administrator." }
  }

  try {
    // 1. Fetch all route_stops for this tech+date with customer data joined
    const rawStops = await withRls(token, async (db) => {
      const stops = await db
        .select()
        .from(routeStops)
        .where(
          and(
            eq(routeStops.org_id, orgId),
            eq(routeStops.tech_id, techId),
            eq(routeStops.scheduled_date, date)
          )
        )

      if (stops.length === 0) return []

      const customerIds = [...new Set(stops.map((s) => s.customer_id))]
      const poolIds = [...new Set(stops.flatMap((s) => (s.pool_id ? [s.pool_id] : [])))]

      const [customerRows, poolRows] = await Promise.all([
        customerIds.length > 0
          ? db
              .select({
                id: customers.id,
                full_name: customers.full_name,
                address: customers.address,
                lat: customers.lat,
                lng: customers.lng,
              })
              .from(customers)
              .where(inArray(customers.id, customerIds))
          : Promise.resolve([]),
        poolIds.length > 0
          ? db
              .select({ id: pools.id, name: pools.name })
              .from(pools)
              .where(inArray(pools.id, poolIds))
          : Promise.resolve([]),
      ])

      const customerMap = new Map(customerRows.map((c) => [c.id, c]))
      const poolMap = new Map(poolRows.map((p) => [p.id, p.name]))

      return stops
        .sort((a, b) => a.sort_index - b.sort_index)
        .map(
          (stop): StopForOptimization => ({
            id: stop.id,
            customerId: stop.customer_id,
            customerName: customerMap.get(stop.customer_id)?.full_name ?? "Unknown Customer",
            address: customerMap.get(stop.customer_id)?.address ?? null,
            sortIndex: stop.sort_index,
            positionLocked: stop.position_locked,
            windowStart: stop.window_start,
            windowEnd: stop.window_end,
            lat: customerMap.get(stop.customer_id)?.lat ?? null,
            lng: customerMap.get(stop.customer_id)?.lng ?? null,
          })
        )
    })

    if (rawStops.length === 0) {
      return { ...emptyResult, error: "No stops found for this tech and date" }
    }

    // 2. Build current order for the before half of the preview
    const currentOrder: OptimizedStop[] = rawStops.map((stop, idx) => ({
      id: stop.id,
      customerName: stop.customerName,
      address: stop.address,
      sortIndex: idx + 1,
      locked: stop.positionLocked,
    }))

    // 3. Separate locked and unlocked stops
    const lockedStops = rawStops.filter((s) => s.positionLocked)
    const unlockedStops = rawStops.filter((s) => !s.positionLocked)

    // 4. Filter stops without coordinates — cannot optimize without lat/lng
    const unlockedWithCoords = unlockedStops.filter(
      (s): s is StopForOptimization & { lat: number; lng: number } =>
        s.lat !== null && s.lng !== null
    )
    const stopsWithoutCoordinates =
      rawStops.filter((s) => s.lat === null || s.lng === null).length

    if (unlockedWithCoords.length === 0) {
      if (stopsWithoutCoordinates > 0) {
        return {
          ...emptyResult,
          error: "No stops have geocoded coordinates. Add coordinates to customer addresses to enable optimization.",
          stopsWithoutCoordinates,
          currentOrder,
        }
      }
      // All stops are locked — nothing to optimize
      return {
        ...emptyResult,
        error: "All stops are locked. Unlock at least one stop to enable optimization.",
        currentOrder,
        optimizedOrder: currentOrder,
      }
    }

    // 5. Calculate current drive time estimate using Haversine
    const currentDriveTimeMinutes = estimateDriveTimeMinutes(rawStops)

    // If only 1 unlocked stop, no optimization needed — return current = optimized
    if (unlockedWithCoords.length === 1) {
      return {
        success: true,
        currentOrder,
        optimizedOrder: currentOrder,
        currentDriveTimeMinutes,
        optimizedDriveTimeMinutes: currentDriveTimeMinutes,
        timeSavedMinutes: 0,
        stopsWithoutCoordinates,
      }
    }

    // 6. Build ORS optimization request for unlocked stops only
    const jobs = unlockedWithCoords.map((stop, idx) => ({
      id: idx,
      location: [stop.lng, stop.lat] as [number, number],
      ...(stop.windowStart && stop.windowEnd
        ? {
            time_windows: [[timeToSeconds(stop.windowStart), timeToSeconds(stop.windowEnd)]] as [[number, number]],
          }
        : {}),
    }))

    // Use the first unlocked stop's location as the vehicle start
    const startLocation: [number, number] = [unlockedWithCoords[0].lng, unlockedWithCoords[0].lat]

    const orsResponse = await fetch("https://api.openrouteservice.org/optimization", {
      method: "POST",
      headers: {
        Authorization: orsKey,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        jobs,
        vehicles: [
          {
            id: 0,
            start: startLocation,
            profile: "driving-car",
          },
        ],
      }),
    })

    if (!orsResponse.ok) {
      const errorText = await orsResponse.text()
      console.error("[optimizeRoute] ORS API error:", orsResponse.status, errorText)

      if (orsResponse.status === 429) {
        return { ...emptyResult, error: "Optimization quota exceeded, try again later", currentOrder }
      }
      return { ...emptyResult, error: "Optimization service unavailable. Please try again.", currentOrder }
    }

    const orsResult: ORSOptimizationResponse = await orsResponse.json()

    // 7. Parse ORS response — extract optimized job order from route steps
    const route = orsResult.routes?.[0]
    if (!route) {
      return { ...emptyResult, error: "Optimization service returned no routes", currentOrder }
    }

    // ORS steps: vehicle start → job steps → vehicle end
    // Each job step has a `job` property = index into our jobs array
    const optimizedJobIndices = route.steps
      .filter((step): step is ORSStep & { job: number } => step.type === "job" && step.job !== undefined)
      .map((step) => step.job)

    // Map job indices back to unlockedWithCoords stops
    const optimizedUnlockedStops = optimizedJobIndices.map((jobIdx) => unlockedWithCoords[jobIdx])

    // 8. Re-insert locked stops at their original sort_index positions
    // Strategy: Build a merged array, inserting locked stops at their original positions,
    // filling gaps with the ORS-optimized unlocked stops.
    const totalStops = rawStops.length
    const mergedOrder: Array<StopForOptimization | null> = new Array(totalStops).fill(null)

    // Place locked stops at their 0-based original positions (clamped to valid range)
    for (const locked of lockedStops) {
      // Original position: sortIndex is 1-based → convert to 0-based
      const originalPos = Math.min(locked.sortIndex - 1, totalStops - 1)
      mergedOrder[originalPos] = locked
    }

    // Fill empty slots with optimized unlocked stops in order
    let unlockedIdx = 0
    for (let i = 0; i < mergedOrder.length; i++) {
      if (mergedOrder[i] === null && unlockedIdx < optimizedUnlockedStops.length) {
        mergedOrder[i] = optimizedUnlockedStops[unlockedIdx]
        unlockedIdx++
      }
    }

    // Filter out any remaining nulls (shouldn't happen, but defensive)
    const finalOrder = mergedOrder.filter((s): s is StopForOptimization => s !== null)

    // 9. Get optimized drive time from ORS summary, or estimate via Haversine
    const orsOptimizedSeconds = route.summary?.duration ?? orsResult.summary?.duration
    const optimizedDriveTimeMinutes = orsOptimizedSeconds !== undefined
      ? Math.round(orsOptimizedSeconds / 60)
      : estimateDriveTimeMinutes(finalOrder)

    // 10. Build optimized order for the after half of the preview
    const optimizedOrder: OptimizedStop[] = finalOrder.map((stop, idx) => ({
      id: stop.id,
      customerName: stop.customerName,
      address: stop.address,
      sortIndex: idx + 1,
      locked: stop.positionLocked,
    }))

    const timeSavedMinutes = Math.max(0, currentDriveTimeMinutes - optimizedDriveTimeMinutes)

    return {
      success: true,
      currentOrder,
      optimizedOrder,
      currentDriveTimeMinutes,
      optimizedDriveTimeMinutes,
      timeSavedMinutes,
      stopsWithoutCoordinates,
    }
  } catch (error) {
    console.error("[optimizeRoute] Unexpected error:", error)
    return { ...emptyResult, error: "An unexpected error occurred during optimization" }
  }
}

// ─── applyOptimizedOrder ──────────────────────────────────────────────────────

/**
 * applyOptimizedOrder — persist the user-accepted optimized stop order to the database.
 *
 * Called after the user clicks "Apply" in the OptimizePreview modal.
 * Updates sort_index on each route_stop to match the new order.
 * Owner/office only.
 *
 * @param techId — tech whose route is being updated
 * @param date — YYYY-MM-DD date of the route
 * @param optimizedStopIds — stop IDs in their new order (index 0 = stop #1)
 */
export async function applyOptimizedOrder(
  techId: string,
  date: string,
  optimizedStopIds: string[]
): Promise<{ success: boolean; error?: string }> {
  const token = await getRlsToken()
  if (!token) return { success: false, error: "Not authenticated" }

  const userRole = token["user_role"] as string | undefined
  const orgId = token["org_id"] as string | undefined

  if (!orgId) return { success: false, error: "Invalid token" }
  if (userRole !== "owner" && userRole !== "office") {
    return { success: false, error: "Insufficient permissions" }
  }

  if (optimizedStopIds.length === 0) {
    return { success: false, error: "No stop IDs provided" }
  }

  try {
    await withRls(token, async (db) => {
      // Update sort_index for each stop in the optimized order
      await Promise.all(
        optimizedStopIds.map((stopId, idx) =>
          db
            .update(routeStops)
            .set({ sort_index: idx + 1, updated_at: new Date() })
            .where(
              and(
                eq(routeStops.id, stopId),
                eq(routeStops.org_id, orgId),
                eq(routeStops.tech_id, techId),
                eq(routeStops.scheduled_date, date)
              )
            )
        )
      )
    })

    revalidatePath("/schedule")
    return { success: true }
  } catch (error) {
    console.error("[applyOptimizedOrder] Error:", error)
    return { success: false, error: "Failed to apply optimized route order" }
  }
}
