/**
 * Reschedule Engine — finds optimal alternative service dates for stops
 * affected by severe weather forecasts.
 *
 * Algorithm:
 * 1. Fetch 10-day forecast for the org's service area.
 * 2. Identify clear days in that window.
 * 3. For each affected stop, score each clear day by:
 *    a. Tech load on that day (prefer days with fewer stops — less than max capacity)
 *    b. Geographic proximity: how close this stop is to the centroid of the tech's
 *       existing stops on that day (lower distance score = better)
 *    c. Customer's preferred day of week (bonus score if it matches)
 * 4. Return the top-scoring (stop, day) pair per stop.
 *
 * All weather classification is delegated to open-meteo.ts.
 */

import { adminDb } from "@/lib/db"
import { routeStops, customers, pools, profiles } from "@/lib/db/schema"
import { and, eq, inArray } from "drizzle-orm"
import { fetchWeatherForecast, classifyWeatherDay } from "./open-meteo"

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface AffectedStop {
  stopId: string
  customerId: string
  customerName: string
  poolName: string | null
  techId: string | null
  techName: string | null
  originalDate: string
  /** Optional: customer's preferred day of week (0=Sun ... 6=Sat) */
  preferredDayOfWeek?: number | null
  /** Optional: geographic coordinates for proximity scoring */
  lat?: number | null
  lng?: number | null
}

export interface RescheduleSlot {
  stopId: string
  newDate: string
  newTechId: string | null
  reason: string
}

// Default max stops per tech per day (used when org_settings has no value)
const DEFAULT_MAX_DAILY_CAPACITY = 15

// Forecast horizon for reschedule candidates (days beyond today)
const RESCHEDULE_HORIZON_DAYS = 10

// Weight factors for scoring
const WEIGHT_LOAD = 0.4
const WEIGHT_PROXIMITY = 0.35
const WEIGHT_PREFERRED_DAY = 0.25

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Haversine distance between two lat/lng points in kilometers.
 * Returns null if either point is missing coordinates.
 */
function haversineKm(
  lat1: number,
  lng1: number,
  lat2: number,
  lng2: number
): number {
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
 * Centroid of a list of lat/lng points. Returns null if list is empty.
 */
function centroid(
  points: Array<{ lat: number; lng: number }>
): { lat: number; lng: number } | null {
  if (points.length === 0) return null
  const sumLat = points.reduce((s, p) => s + p.lat, 0)
  const sumLng = points.reduce((s, p) => s + p.lng, 0)
  return { lat: sumLat / points.length, lng: sumLng / points.length }
}

/**
 * Returns an array of YYYY-MM-DD date strings for the next N days starting
 * from the day after `startDate`.
 */
function getNextNDays(startDate: Date, n: number): string[] {
  const dates: string[] = []
  for (let i = 1; i <= n; i++) {
    const d = new Date(startDate)
    d.setDate(startDate.getDate() + i)
    // Use local date components to avoid UTC offset shifting the date
    const yyyy = d.getFullYear()
    const mm = String(d.getMonth() + 1).padStart(2, "0")
    const dd = String(d.getDate()).padStart(2, "0")
    dates.push(`${yyyy}-${mm}-${dd}`)
  }
  return dates
}

// ---------------------------------------------------------------------------
// Main export
// ---------------------------------------------------------------------------

/**
 * Finds optimal reschedule slots for a list of affected stops.
 *
 * @param orgId - The org to search within
 * @param affectedStops - Stops that need to be rescheduled
 * @param serviceAreaLat - Latitude of the org's service area center (for forecast)
 * @param serviceAreaLng - Longitude of the org's service area center
 * @param maxDailyCapacity - Max stops per tech per day (defaults to 15)
 * @returns One recommended slot per stop
 */
export async function findRescheduleSlots(
  orgId: string,
  affectedStops: AffectedStop[],
  serviceAreaLat: number,
  serviceAreaLng: number,
  maxDailyCapacity: number = DEFAULT_MAX_DAILY_CAPACITY
): Promise<RescheduleSlot[]> {
  if (affectedStops.length === 0) return []

  // Step 1: Fetch forecast to identify clear days
  const forecast = await fetchWeatherForecast(serviceAreaLat, serviceAreaLng)
  if (!forecast) {
    // Fallback: return next available day with a generic reason
    return affectedStops.map((stop) => {
      const tomorrow = new Date()
      tomorrow.setDate(tomorrow.getDate() + 1)
      const yyyy = tomorrow.getFullYear()
      const mm = String(tomorrow.getMonth() + 1).padStart(2, "0")
      const dd = String(tomorrow.getDate()).padStart(2, "0")
      return {
        stopId: stop.stopId,
        newDate: `${yyyy}-${mm}-${dd}`,
        newTechId: stop.techId,
        reason: "Next available day (forecast unavailable)",
      }
    })
  }

  // Step 2: Identify candidate dates — next RESCHEDULE_HORIZON_DAYS days
  const today = new Date()
  today.setHours(0, 0, 0, 0)
  const candidateDates = getNextNDays(today, RESCHEDULE_HORIZON_DAYS)

  // For each candidate date, classify the weather using the forecast
  const clearDates = candidateDates.filter((dateStr) => {
    // Find the matching day index in the forecast
    const idx = forecast.daily.time.findIndex((t) => t === dateStr)
    if (idx === -1) return true // Date beyond forecast window — assume clear

    const classification = classifyWeatherDay(forecast, idx)
    // Only consider days that don't need rescheduling
    return classification ? !classification.shouldReschedule : true
  })

  if (clearDates.length === 0) {
    // All days in forecast window have bad weather — use nearest future date anyway
    return affectedStops.map((stop) => ({
      stopId: stop.stopId,
      newDate: candidateDates[0] ?? "",
      newTechId: stop.techId,
      reason: "Best available (all days in forecast have weather concerns)",
    }))
  }

  // Step 3: For each clear date, get existing stop counts and coordinates per tech
  // This tells us how loaded each tech is on each candidate day
  const existingStopsOnClearDates = await adminDb
    .select({
      id: routeStops.id,
      tech_id: routeStops.tech_id,
      scheduled_date: routeStops.scheduled_date,
      lat: customers.lat,
      lng: customers.lng,
    })
    .from(routeStops)
    .leftJoin(customers, eq(routeStops.customer_id, customers.id))
    .where(
      and(
        eq(routeStops.org_id, orgId),
        inArray(routeStops.scheduled_date, clearDates)
      )
    )

  // Build lookup: techId -> date -> existing stops (with coords)
  type StopCoord = { lat: number | null; lng: number | null }
  const techDayLoad: Record<string, Record<string, StopCoord[]>> = {}
  for (const stop of existingStopsOnClearDates) {
    const techKey = stop.tech_id ?? "unassigned"
    if (!techDayLoad[techKey]) techDayLoad[techKey] = {}
    if (!techDayLoad[techKey][stop.scheduled_date]) {
      techDayLoad[techKey][stop.scheduled_date] = []
    }
    techDayLoad[techKey][stop.scheduled_date].push({
      lat: stop.lat ?? null,
      lng: stop.lng ?? null,
    })
  }

  // Step 4: For each affected stop, score all clear dates and pick the best
  const slots: RescheduleSlot[] = []

  for (const stop of affectedStops) {
    const techKey = stop.techId ?? "unassigned"
    const techDays = techDayLoad[techKey] ?? {}

    let bestDate: string | null = null
    let bestScore = -Infinity
    let bestReason = ""

    for (const date of clearDates) {
      const existingOnDay = techDays[date] ?? []
      const loadCount = existingOnDay.length

      // Skip days at capacity
      if (loadCount >= maxDailyCapacity) continue

      // ─── Score A: Load (lower load = higher score) ───────────────────────
      // Normalized: 0 = full day, 1 = empty day
      const loadScore = 1 - loadCount / maxDailyCapacity

      // ─── Score B: Geographic proximity ───────────────────────────────────
      // How close is this stop to the centroid of existing stops on this day?
      // Higher proximity = higher score. If no existing stops, score is neutral.
      let proximityScore = 0.5 // neutral when no existing stops to compare
      if (stop.lat != null && stop.lng != null && existingOnDay.length > 0) {
        const validCoords = existingOnDay.filter(
          (c): c is { lat: number; lng: number } => c.lat != null && c.lng != null
        )
        if (validCoords.length > 0) {
          const center = centroid(validCoords)
          if (center) {
            const distKm = haversineKm(stop.lat, stop.lng, center.lat, center.lng)
            // Score: 1 for very close (<1km), 0 for far (>50km)
            proximityScore = Math.max(0, 1 - distKm / 50)
          }
        }
      }

      // ─── Score C: Preferred day of week ──────────────────────────────────
      let preferredDayScore = 0
      if (stop.preferredDayOfWeek != null) {
        const dateObj = new Date(date + "T00:00:00")
        const dayOfWeek = dateObj.getDay() // 0=Sun...6=Sat
        preferredDayScore = dayOfWeek === stop.preferredDayOfWeek ? 1 : 0
      } else {
        preferredDayScore = 0.5 // neutral when no preference
      }

      // ─── Composite score ─────────────────────────────────────────────────
      const score =
        WEIGHT_LOAD * loadScore +
        WEIGHT_PROXIMITY * proximityScore +
        WEIGHT_PREFERRED_DAY * preferredDayScore

      if (score > bestScore) {
        bestScore = score
        bestDate = date
        const reasons: string[] = []
        if (loadCount < maxDailyCapacity / 2)
          reasons.push("light day for tech")
        if (proximityScore > 0.7) reasons.push("close to other stops")
        if (preferredDayScore === 1) reasons.push("customer's preferred day")
        bestReason =
          reasons.length > 0
            ? `Best slot: ${reasons.join(", ")}`
            : "Best available slot based on tech schedule"
      }
    }

    if (!bestDate) {
      // All clear days are at capacity — pick the least-loaded clear day
      const leastLoaded = clearDates.reduce(
        (best, date) => {
          const load = (techDayLoad[techKey]?.[date] ?? []).length
          return load < best.load ? { date, load } : best
        },
        { date: clearDates[0] ?? "", load: Infinity }
      )
      bestDate = leastLoaded.date
      bestReason = "Best available (all preferred slots at capacity)"
    }

    slots.push({
      stopId: stop.stopId,
      newDate: bestDate ?? "",
      newTechId: stop.techId,
      reason: bestReason,
    })
  }

  return slots
}
