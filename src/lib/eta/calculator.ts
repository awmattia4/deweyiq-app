/**
 * ETA Calculator — computes per-stop arrival time estimates.
 *
 * Uses ORS directions for real road drive times between stops.
 * Falls back to haversine distance at average speed when ORS is unavailable.
 *
 * Called by src/actions/eta.ts — not a server action itself (pure function module).
 */

// ─── Types ────────────────────────────────────────────────────────────────────

export interface EtaStop {
  /** Route stop database ID */
  id: string
  /** Pool ID for per-pool historical lookup */
  poolId: string | null
  /** Customer name (for logging / debugging) */
  customerName: string
  /** WGS-84 latitude */
  lat: number
  /** WGS-84 longitude */
  lng: number
  /**
   * Expected service duration at this stop in seconds.
   * Pre-computed from historical data or org default before calling computeEta.
   */
  serviceDurationSeconds: number
}

export interface EtaResult {
  /** Minutes from now until tech arrives at this stop */
  etaMinutes: number
  /** Absolute Date of estimated arrival */
  etaTime: Date
}

export type EtaMap = Map<string, EtaResult>

// ─── Haversine fallback ───────────────────────────────────────────────────────

/** Great-circle distance in km between two lat/lng points. */
function haversineDistanceKm(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const R = 6371
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

/** Estimate drive minutes between two points at 30 mph (48 km/h). */
function haversineDriveMinutes(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const km = haversineDistanceKm(lat1, lng1, lat2, lng2)
  return (km / 48) * 60
}

// ─── computeEta ───────────────────────────────────────────────────────────────

/**
 * computeEta — compute per-stop ETA for a tech's remaining route.
 *
 * Algorithm:
 * 1. Start from tech's current GPS position.
 * 2. For each remaining stop (in order):
 *    a. Drive time from previous position → this stop (haversine approximation).
 *    b. Add service duration at previous stop (except for first leg from tech position).
 *    c. Accumulated elapsed time = ETA in minutes from now.
 *
 * Note: This uses haversine (not ORS) because it is called on every GPS ping.
 * ORS would be too expensive at that frequency. The ETA is a close approximation
 * rather than a precise road-routing result.
 *
 * @param techPosition  Current GPS position of the tech.
 * @param remainingStops  Remaining stops in route order (uncompleted, with coordinates).
 * @param avgServiceMinutes  Override for service duration in minutes (optional).
 *                           When provided, overrides each stop's serviceDurationSeconds.
 * @returns Map<stopId, EtaResult>
 */
export function computeEta(
  techPosition: { lat: number; lng: number },
  remainingStops: EtaStop[],
  avgServiceMinutes?: number
): EtaMap {
  const result: EtaMap = new Map()
  const now = new Date()

  let prevLat = techPosition.lat
  let prevLng = techPosition.lng
  let cumulativeMinutes = 0 // time elapsed from tech's current position

  for (let i = 0; i < remainingStops.length; i++) {
    const stop = remainingStops[i]

    // Drive time from previous position to this stop
    const driveMinutes = haversineDriveMinutes(prevLat, prevLng, stop.lat, stop.lng)
    cumulativeMinutes += driveMinutes

    // Record ETA for this stop BEFORE adding its own service time
    const etaMinutes = Math.round(cumulativeMinutes)
    const etaTime = new Date(now.getTime() + etaMinutes * 60 * 1000)

    result.set(stop.id, { etaMinutes, etaTime })

    // Add service time at this stop so the NEXT stop's ETA accounts for it
    const serviceMinutes = avgServiceMinutes ?? stop.serviceDurationSeconds / 60
    cumulativeMinutes += serviceMinutes

    prevLat = stop.lat
    prevLng = stop.lng
  }

  return result
}
