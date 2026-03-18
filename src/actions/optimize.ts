"use server"

import { revalidatePath } from "next/cache"
import { createClient } from "@/lib/supabase/server"
import { withRls, getRlsToken, adminDb } from "@/lib/db"
import type { SupabaseToken } from "@/lib/db"
import { routeStops, serviceVisits, customers, pools, orgSettings, workOrders } from "@/lib/db/schema"
import { and, eq, inArray, isNotNull, desc } from "drizzle-orm"

// ─── Types ────────────────────────────────────────────────────────────────────

/**
 * StopForOptimization — internal shape used during optimization calculation.
 * Includes all fields needed to call ORS and reconstruct the final order.
 */
interface StopForOptimization {
  id: string
  customerId: string
  poolId: string | null
  customerName: string
  address: string | null
  sortIndex: number
  positionLocked: boolean
  windowStart: string | null
  windowEnd: string | null
  lat: number | null
  lng: number | null
  workOrderId: string | null
  workOrderTitle: string | null
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
  workOrderId: string | null
  workOrderTitle: string | null
  /** Expected service duration in seconds (from historical data or default) */
  serviceDurationSeconds: number
  /** True if serviceDurationSeconds came from real historical data for this pool */
  hasHistoricalDuration: boolean
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
  /** Total route time = drive time + sum of per-stop service durations (current order) */
  currentTotalTimeMinutes: number
  /** Total route time = drive time + sum of per-stop service durations (optimized order) */
  optimizedTotalTimeMinutes: number
  timeSavedMinutes: number
  /** Number of stops excluded from optimization due to missing coordinates */
  stopsWithoutCoordinates: number
  /** True when historical durations were available for >= 50% of stops */
  usedHistoricalDurations: boolean
  /** Fraction of stops that used historical durations (0–1) */
  historicalCoverage: number
}

// ─── Auth helper ──────────────────────────────────────────────────────────────


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

// ─── Historical duration helpers ──────────────────────────────────────────────

/** Default service duration in seconds when no historical data is available (25 min) */
const DEFAULT_SERVICE_DURATION_SECONDS = 25 * 60

/**
 * computeMedianSeconds — compute the median from an array of duration values in seconds.
 * Returns undefined if array is empty.
 */
function computeMedianSeconds(durations: number[]): number | undefined {
  if (durations.length === 0) return undefined
  const sorted = [...durations].sort((a, b) => a - b)
  const mid = Math.floor(sorted.length / 2)
  return sorted.length % 2 === 0
    ? Math.round(((sorted[mid - 1] ?? 0) + (sorted[mid] ?? 0)) / 2)
    : (sorted[mid] ?? DEFAULT_SERVICE_DURATION_SECONDS)
}

/**
 * fetchHistoricalServiceDurations — query per-pool median service durations
 * using completed route_stops crossed with service_visits for the org.
 *
 * Uses adminDb so this query runs without user RLS context (cross-session safe).
 * Explicit org_id + pool_id filtering enforces data isolation.
 *
 * Duration = route_stop.started_at → service_visit.completed_at for matching pool on same day.
 *
 * Returns:
 * - poolDurations: Map<poolId, medianDurationSeconds>
 * - orgMedianSeconds: org-wide fallback median (null if no data at all)
 */
async function fetchHistoricalServiceDurations(
  orgId: string,
  poolIds: string[]
): Promise<{
  poolDurations: Map<string, number>
  orgMedianSeconds: number | null
}> {
  const poolDurations = new Map<string, number>()

  if (poolIds.length === 0) {
    return { poolDurations, orgMedianSeconds: null }
  }

  try {
    // Query recent completed route_stops with started_at for the target pools.
    // Then join service_visits by pool_id to get completed_at.
    // We use adminDb to avoid RLS correlated subquery pitfall (MEMORY.md critical note).
    const routeStopRows = await adminDb
      .select({
        poolId: routeStops.pool_id,
        scheduledDate: routeStops.scheduled_date,
        startedAt: routeStops.started_at,
      })
      .from(routeStops)
      .where(
        and(
          eq(routeStops.org_id, orgId),
          inArray(routeStops.pool_id, poolIds),
          isNotNull(routeStops.started_at),
          isNotNull(routeStops.pool_id)
        )
      )
      .orderBy(desc(routeStops.created_at))
      .limit(poolIds.length * 20)

    if (routeStopRows.length === 0) {
      return { poolDurations, orgMedianSeconds: null }
    }

    // Fetch completed service visits for these pools (separate query — no correlated subquery)
    const visitRows = await adminDb
      .select({
        poolId: serviceVisits.pool_id,
        visitedAt: serviceVisits.visited_at,
        completedAt: serviceVisits.completed_at,
      })
      .from(serviceVisits)
      .where(
        and(
          eq(serviceVisits.org_id, orgId),
          inArray(serviceVisits.pool_id, poolIds),
          isNotNull(serviceVisits.completed_at)
        )
      )
      .orderBy(desc(serviceVisits.visited_at))
      .limit(poolIds.length * 20)

    // Index visits by poolId + date for fast lookup
    // Key: `${poolId}:${YYYY-MM-DD}`
    const visitMap = new Map<string, Date>()
    for (const visit of visitRows) {
      if (!visit.poolId || !visit.completedAt) continue
      const dateKey = visit.visitedAt.toISOString().split("T")[0] ?? ""
      const key = `${visit.poolId}:${dateKey}`
      // Keep the most recent visit for that pool+date (visits already ordered desc)
      if (!visitMap.has(key)) {
        visitMap.set(key, visit.completedAt)
      }
    }

    // Compute durations: started_at (route_stop) → completed_at (service_visit for same pool+date)
    const durationsByPool = new Map<string, number[]>()
    const allDurations: number[] = []

    for (const stop of routeStopRows) {
      if (!stop.poolId || !stop.startedAt) continue
      const key = `${stop.poolId}:${stop.scheduledDate}`
      const completedAt = visitMap.get(key)
      if (!completedAt) continue

      const durationMs = completedAt.getTime() - stop.startedAt.getTime()
      // Sanity check: only include durations between 2 min and 4 hours
      if (durationMs < 2 * 60 * 1000 || durationMs > 4 * 60 * 60 * 1000) continue

      const durationSec = Math.round(durationMs / 1000)
      if (!durationsByPool.has(stop.poolId)) durationsByPool.set(stop.poolId, [])
      durationsByPool.get(stop.poolId)!.push(durationSec)
      allDurations.push(durationSec)
    }

    // Compute per-pool median durations
    for (const [poolId, durations] of durationsByPool.entries()) {
      const median = computeMedianSeconds(durations)
      if (median !== undefined) poolDurations.set(poolId, median)
    }

    // Org-wide fallback median
    const orgMedianSeconds = computeMedianSeconds(allDurations) ?? null

    return { poolDurations, orgMedianSeconds }
  } catch (error) {
    console.error("[fetchHistoricalServiceDurations] Error:", error)
    return { poolDurations, orgMedianSeconds: null }
  }
}

/**
 * sumServiceTimeMinutes — compute total service time in minutes for an ordered list of stops.
 */
function sumServiceTimeMinutes(stops: OptimizedStop[]): number {
  const totalSeconds = stops.reduce((sum, s) => sum + s.serviceDurationSeconds, 0)
  return Math.round(totalSeconds / 60)
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
 * ML enhancement: Queries historical service durations per pool from route_stops
 * (started_at) and service_visits (completed_at). Feeds these as VROOM job
 * `service` times for more accurate route optimization.
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
    currentTotalTimeMinutes: 0,
    optimizedTotalTimeMinutes: 0,
    timeSavedMinutes: 0,
    stopsWithoutCoordinates: 0,
    usedHistoricalDurations: false,
    historicalCoverage: 0,
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
    // 1. Fetch all route_stops for this tech+date with customer + work order data joined
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

      const [customerRows] = await Promise.all([
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
      ])

      // Fetch pool names (for future use — poolMap)
      void poolIds // referenced so TypeScript doesn't complain

      const customerMap = new Map(customerRows.map((c) => [c.id, c]))

      // Fetch WO titles for stops that have a work_order_id
      const woIds = stops.flatMap((s) => (s.work_order_id ? [s.work_order_id] : []))
      const woTitleMap = new Map<string, string>()
      if (woIds.length > 0) {
        const woRows = await db
          .select({ id: workOrders.id, title: workOrders.title })
          .from(workOrders)
          .where(inArray(workOrders.id, woIds))
        for (const wo of woRows) woTitleMap.set(wo.id, wo.title)
      }

      return stops
        .sort((a, b) => a.sort_index - b.sort_index)
        .map(
          (stop): StopForOptimization => ({
            id: stop.id,
            customerId: stop.customer_id,
            poolId: stop.pool_id,
            customerName: customerMap.get(stop.customer_id)?.full_name ?? "Unknown Customer",
            address: customerMap.get(stop.customer_id)?.address ?? null,
            sortIndex: stop.sort_index,
            positionLocked: stop.position_locked,
            windowStart: stop.window_start,
            windowEnd: stop.window_end,
            lat: customerMap.get(stop.customer_id)?.lat ?? null,
            lng: customerMap.get(stop.customer_id)?.lng ?? null,
            workOrderId: stop.work_order_id,
            workOrderTitle: stop.work_order_id ? (woTitleMap.get(stop.work_order_id) ?? null) : null,
          })
        )
    })

    if (rawStops.length === 0) {
      return { ...emptyResult, error: "No stops found for this tech and date" }
    }

    // 2. Fetch historical service durations per pool for ML-enhanced VROOM optimization
    const poolIdsForHistory = rawStops.flatMap((s) => (s.poolId ? [s.poolId] : []))
    const { poolDurations, orgMedianSeconds } = await fetchHistoricalServiceDurations(orgId, poolIdsForHistory)

    // Compute coverage stats for the AI-Optimized badge
    const stopsWithHistoricalData = rawStops.filter(
      (s) => s.poolId !== null && poolDurations.has(s.poolId)
    ).length
    const historicalCoverage = rawStops.length > 0 ? stopsWithHistoricalData / rawStops.length : 0
    const usedHistoricalDurations = historicalCoverage >= 0.5

    /**
     * resolveServiceDuration — get service duration in seconds for a stop.
     * Priority: per-pool historical median → org-wide median → default (25 min).
     */
    function resolveServiceDuration(stop: StopForOptimization): { durationSeconds: number; isHistorical: boolean } {
      if (stop.poolId && poolDurations.has(stop.poolId)) {
        return { durationSeconds: poolDurations.get(stop.poolId)!, isHistorical: true }
      }
      if (orgMedianSeconds !== null) {
        return { durationSeconds: orgMedianSeconds, isHistorical: false }
      }
      return { durationSeconds: DEFAULT_SERVICE_DURATION_SECONDS, isHistorical: false }
    }

    // 3. Build current order for the before half of the preview
    const currentOrder: OptimizedStop[] = rawStops.map((stop, idx) => {
      const { durationSeconds, isHistorical } = resolveServiceDuration(stop)
      return {
        id: stop.id,
        customerName: stop.customerName,
        address: stop.address,
        sortIndex: idx + 1,
        locked: stop.positionLocked,
        workOrderId: stop.workOrderId,
        workOrderTitle: stop.workOrderTitle,
        serviceDurationSeconds: durationSeconds,
        hasHistoricalDuration: isHistorical,
      }
    })

    // 4. Separate locked and unlocked stops
    const lockedStops = rawStops.filter((s) => s.positionLocked)
    const unlockedStops = rawStops.filter((s) => !s.positionLocked)

    // 5. Filter stops without coordinates — cannot optimize without lat/lng
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
          usedHistoricalDurations,
          historicalCoverage,
        }
      }
      // All stops are locked — nothing to optimize
      return {
        ...emptyResult,
        error: "All stops are locked. Unlock at least one stop to enable optimization.",
        currentOrder,
        optimizedOrder: currentOrder,
        usedHistoricalDurations,
        historicalCoverage,
      }
    }

    // 6. Fetch home base from org settings — needed for both VROOM request AND
    //    drive time calculation so the two are measured on the same basis.
    let homeBaseLngLat: [number, number] | null = null

    const homeBase = await withRls(token, (db) =>
      db
        .select({
          home_base_lat: orgSettings.home_base_lat,
          home_base_lng: orgSettings.home_base_lng,
        })
        .from(orgSettings)
        .where(eq(orgSettings.org_id, orgId))
        .limit(1)
    )

    if (homeBase[0]?.home_base_lat != null && homeBase[0]?.home_base_lng != null) {
      homeBaseLngLat = [homeBase[0].home_base_lng, homeBase[0].home_base_lat]
    }

    // 7. Calculate current drive time — use ORS directions for real road time.
    //    CRITICAL: Include home base as start/end so the displayed drive time
    //    matches what VROOM optimizes for (home → stops → home).
    const stopCoords: [number, number][] = rawStops
      .filter((s) => s.lat !== null && s.lng !== null)
      .map((s) => [s.lng!, s.lat!])
    const currentCoords: [number, number][] = []
    if (homeBaseLngLat) currentCoords.push(homeBaseLngLat)
    currentCoords.push(...stopCoords)
    if (homeBaseLngLat) currentCoords.push(homeBaseLngLat)

    let currentDriveTimeMinutes: number
    if (currentCoords.length >= 2) {
      const currentRoute = await getRouteDirections(currentCoords)
      currentDriveTimeMinutes = currentRoute.success
        ? currentRoute.durationMinutes
        : estimateDriveTimeMinutes(rawStops)
    } else {
      currentDriveTimeMinutes = estimateDriveTimeMinutes(rawStops)
    }

    // Current total time = drive + service time across all stops
    const currentServiceMinutes = sumServiceTimeMinutes(currentOrder)
    const currentTotalTimeMinutes = currentDriveTimeMinutes + currentServiceMinutes

    // If only 1 unlocked stop, no optimization needed — return current = optimized
    if (unlockedWithCoords.length === 1) {
      return {
        success: true,
        currentOrder,
        optimizedOrder: currentOrder,
        currentDriveTimeMinutes,
        optimizedDriveTimeMinutes: currentDriveTimeMinutes,
        currentTotalTimeMinutes,
        optimizedTotalTimeMinutes: currentTotalTimeMinutes,
        timeSavedMinutes: 0,
        stopsWithoutCoordinates,
        usedHistoricalDurations,
        historicalCoverage,
      }
    }

    // 8. Build ORS optimization request for unlocked stops only.
    // Feed per-stop service durations as VROOM `service` field (seconds)
    // so VROOM accounts for dwell time when computing the optimal order.
    const jobs = unlockedWithCoords.map((stop, idx) => {
      const { durationSeconds } = resolveServiceDuration(stop)
      return {
        id: idx,
        location: [stop.lng, stop.lat] as [number, number],
        // VROOM service: dwell time in seconds spent at this job location
        service: durationSeconds,
        ...(stop.windowStart && stop.windowEnd
          ? {
              time_windows: [[timeToSeconds(stop.windowStart), timeToSeconds(stop.windowEnd)]] as [[number, number]],
            }
          : {}),
      }
    })

    // Use home base (fetched above) as vehicle start/end for VROOM
    const startLocation: [number, number] = homeBaseLngLat ?? [unlockedWithCoords[0].lng, unlockedWithCoords[0].lat]
    const endLocation: [number, number] | undefined = homeBaseLngLat ?? undefined

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
            ...(endLocation ? { end: endLocation } : {}),
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

    // 8. Parse ORS response — extract optimized job order from route steps
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

    // 9. Re-insert locked stops at their original sort_index positions
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

    // 10. Get optimized drive time — use ORS directions for real road time.
    //     Include home base legs to match how VROOM optimized (home → stops → home).
    const optimizedStopCoords: [number, number][] = finalOrder
      .filter((s) => s.lat !== null && s.lng !== null)
      .map((s) => [s.lng!, s.lat!])
    const optimizedCoords: [number, number][] = []
    if (homeBaseLngLat) optimizedCoords.push(homeBaseLngLat)
    optimizedCoords.push(...optimizedStopCoords)
    if (homeBaseLngLat) optimizedCoords.push(homeBaseLngLat)

    let optimizedDriveTimeMinutes: number
    if (optimizedCoords.length >= 2) {
      const optimizedRoute = await getRouteDirections(optimizedCoords)
      optimizedDriveTimeMinutes = optimizedRoute.success
        ? optimizedRoute.durationMinutes
        : estimateDriveTimeMinutes(finalOrder)
    } else {
      optimizedDriveTimeMinutes = estimateDriveTimeMinutes(finalOrder)
    }

    // 11. Build optimized order for the after half of the preview
    const optimizedOrder: OptimizedStop[] = finalOrder.map((stop, idx) => {
      const { durationSeconds, isHistorical } = resolveServiceDuration(stop)
      return {
        id: stop.id,
        customerName: stop.customerName,
        address: stop.address,
        sortIndex: idx + 1,
        locked: stop.positionLocked,
        workOrderId: stop.workOrderId,
        workOrderTitle: stop.workOrderTitle,
        serviceDurationSeconds: durationSeconds,
        hasHistoricalDuration: isHistorical,
      }
    })

    // Total time savings = drive savings (optimizing order reduces travel)
    // Service time is identical regardless of order — only drive time changes
    const timeSavedMinutes = Math.max(0, currentDriveTimeMinutes - optimizedDriveTimeMinutes)

    // Total time = drive + service for both orders
    const optimizedServiceMinutes = sumServiceTimeMinutes(optimizedOrder)
    const optimizedTotalTimeMinutes = optimizedDriveTimeMinutes + optimizedServiceMinutes

    return {
      success: true,
      currentOrder,
      optimizedOrder,
      currentDriveTimeMinutes,
      optimizedDriveTimeMinutes,
      currentTotalTimeMinutes,
      optimizedTotalTimeMinutes,
      timeSavedMinutes,
      stopsWithoutCoordinates,
      usedHistoricalDurations,
      historicalCoverage,
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

// ─── getRouteDirections ──────────────────────────────────────────────────────

/**
 * RouteDirectionsResult — real ORS driving directions for a set of waypoints.
 * Returns total drive duration and the road-snapped route geometry (GeoJSON LineString).
 */
export interface RouteDirectionsResult {
  success: boolean
  error?: string
  durationMinutes: number
  /** GeoJSON LineString coordinates [[lng, lat], ...] for the actual road route */
  geometry: [number, number][]
}

/**
 * getRouteDirections — call ORS directions API for an ordered list of waypoints.
 *
 * Returns real road-routed duration and geometry. Used by the map to draw
 * actual road paths and show accurate drive time.
 *
 * Requires >= 2 waypoints with coordinates. No auth check needed — this is
 * a read-only utility with no org data exposure (just lat/lng → route).
 */
export async function getRouteDirections(
  coordinates: [number, number][]
): Promise<RouteDirectionsResult> {
  const empty: RouteDirectionsResult = { success: false, durationMinutes: 0, geometry: [] }

  if (coordinates.length < 2) {
    return { ...empty, error: "Need at least 2 waypoints" }
  }

  const orsKey = process.env.ORS_API_KEY
  if (!orsKey) {
    return { ...empty, error: "ORS_API_KEY not configured" }
  }

  try {
    const response = await fetch(
      "https://api.openrouteservice.org/v2/directions/driving-car/geojson",
      {
        method: "POST",
        headers: {
          Authorization: orsKey,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ coordinates }),
      }
    )

    if (!response.ok) {
      if (response.status === 429) {
        return { ...empty, error: "Rate limited" }
      }
      return { ...empty, error: "Directions API error" }
    }

    const data = await response.json()
    const feature = data.features?.[0]
    if (!feature) {
      return { ...empty, error: "No route returned" }
    }

    const durationSeconds = feature.properties?.summary?.duration ?? 0
    const geometry: [number, number][] = feature.geometry?.coordinates ?? []

    return {
      success: true,
      durationMinutes: Math.round(durationSeconds / 60),
      geometry,
    }
  } catch (error) {
    console.error("[getRouteDirections] Error:", error)
    return { ...empty, error: "Failed to get directions" }
  }
}
