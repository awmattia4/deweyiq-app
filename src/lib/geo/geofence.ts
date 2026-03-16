/**
 * geofence.ts — Pure TypeScript geofence utility module.
 *
 * No Next.js or Supabase imports — these are pure math functions that can
 * be tested without any framework setup.
 *
 * Anti-bounce pattern (Research Pitfall 5):
 * - Arrival: tech must be inside the geofence for >= 30s before triggering
 * - Departure: tech must be outside for >= 60s after being inside before triggering
 * - State machine per stop: outside → entering (30s timer) → inside → leaving (60s timer) → outside
 *
 * This prevents GPS jitter at the edge of a geofence boundary from creating
 * false arrival/departure events.
 */

// ─── Constants ────────────────────────────────────────────────────────────────

const EARTH_RADIUS_METERS = 6_371_000

/** Milliseconds inside geofence required before confirming arrival */
const ARRIVAL_DWELL_MS = 30_000

/** Milliseconds outside geofence required before confirming departure */
const DEPARTURE_DWELL_MS = 60_000

// ─── Types ────────────────────────────────────────────────────────────────────

/**
 * Per-stop geofence state machine.
 *
 * States:
 * - outside: tech is not inside the geofence
 * - entering: tech entered the geofence; waiting for dwell time before confirming arrival
 * - inside: arrival confirmed; tech is on-site
 * - leaving: tech left the geofence; waiting for dwell time before confirming departure
 */
export type GeofencePhase = "outside" | "entering" | "inside" | "leaving"

export interface GeofenceState {
  /** The route stop ID this state tracks */
  stopId: string
  /** Current phase of the state machine */
  phase: GeofencePhase
  /** Unix timestamp (ms) when the tech first entered the geofence (entering phase start) */
  enteredAt: number | null
  /** Unix timestamp (ms) when the arrival was confirmed (after dwell) */
  arrivedAt: number | null
  /** Unix timestamp (ms) when the tech first exited the geofence (leaving phase start) */
  leftAt: number | null
}

// ─── Math ─────────────────────────────────────────────────────────────────────

/**
 * haversineDistance — returns the great-circle distance in meters between two
 * geographic coordinates using the Haversine formula.
 *
 * @param lat1 - Latitude of point 1 in decimal degrees
 * @param lng1 - Longitude of point 1 in decimal degrees
 * @param lat2 - Latitude of point 2 in decimal degrees
 * @param lng2 - Longitude of point 2 in decimal degrees
 * @returns Distance in meters
 */
export function haversineDistance(
  lat1: number,
  lng1: number,
  lat2: number,
  lng2: number
): number {
  const toRad = (deg: number) => (deg * Math.PI) / 180

  const dLat = toRad(lat2 - lat1)
  const dLng = toRad(lng2 - lng1)

  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(toRad(lat1)) *
      Math.cos(toRad(lat2)) *
      Math.sin(dLng / 2) *
      Math.sin(dLng / 2)

  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a))
  return EARTH_RADIUS_METERS * c
}

/**
 * isInsideGeofence — returns true if the user's position is within the specified
 * radius of a stop's location.
 *
 * @param userLat - User's current latitude
 * @param userLng - User's current longitude
 * @param stopLat - Stop's latitude
 * @param stopLng - Stop's longitude
 * @param radiusMeters - Geofence radius in meters (typically org_settings.geofence_radius_meters)
 */
export function isInsideGeofence(
  userLat: number,
  userLng: number,
  stopLat: number,
  stopLng: number,
  radiusMeters: number
): boolean {
  return haversineDistance(userLat, userLng, stopLat, stopLng) <= radiusMeters
}

// ─── State machine ─────────────────────────────────────────────────────────────

/**
 * createGeofenceState — creates an initial per-stop geofence state (outside, no timers).
 */
export function createGeofenceState(stopId: string): GeofenceState {
  return {
    stopId,
    phase: "outside",
    enteredAt: null,
    arrivedAt: null,
    leftAt: null,
  }
}

/**
 * GeofenceEvent — emitted by processGeofenceUpdate when a state transition completes.
 */
export type GeofenceEvent =
  | { type: "arrival"; stopId: string; timestamp: number }
  | { type: "departure"; stopId: string; timestamp: number }

/**
 * processGeofenceUpdate — advances the state machine for a single stop given the
 * tech's current inside/outside status and the current timestamp.
 *
 * Returns an updated GeofenceState and an optional GeofenceEvent if a confirmed
 * arrival or departure occurred.
 *
 * State transitions:
 *   outside  + inside=true  → entering (start 30s timer)
 *   entering + inside=true  + dwell >= 30s → inside (emit arrival)
 *   entering + inside=false → outside (cancel timer, false positive)
 *   inside   + inside=false → leaving (start 60s timer)
 *   leaving  + inside=false + dwell >= 60s → outside (emit departure)
 *   leaving  + inside=true  → inside (cancel timer, re-entered)
 *
 * @param state   - Current geofence state for this stop
 * @param inside  - Whether the tech is currently inside the geofence
 * @param nowMs   - Current timestamp in milliseconds (Date.now())
 * @returns Tuple of [newState, event | null]
 */
export function processGeofenceUpdate(
  state: GeofenceState,
  inside: boolean,
  nowMs: number
): [GeofenceState, GeofenceEvent | null] {
  switch (state.phase) {
    case "outside": {
      if (!inside) return [state, null]
      // Tech just entered — start the dwell timer
      return [{ ...state, phase: "entering", enteredAt: nowMs }, null]
    }

    case "entering": {
      if (!inside) {
        // Exited before dwell time — false positive, reset
        return [{ ...state, phase: "outside", enteredAt: null }, null]
      }
      const dwellMs = nowMs - (state.enteredAt ?? nowMs)
      if (dwellMs >= ARRIVAL_DWELL_MS) {
        // Confirmed arrival
        const newState: GeofenceState = {
          ...state,
          phase: "inside",
          arrivedAt: state.enteredAt, // arrival time = when they first entered, not after dwell
        }
        return [newState, { type: "arrival", stopId: state.stopId, timestamp: state.enteredAt ?? nowMs }]
      }
      // Still waiting for dwell
      return [state, null]
    }

    case "inside": {
      if (inside) return [state, null]
      // Tech just left — start departure dwell timer
      return [{ ...state, phase: "leaving", leftAt: nowMs }, null]
    }

    case "leaving": {
      if (inside) {
        // Re-entered before departure confirmed — cancel timer
        return [{ ...state, phase: "inside", leftAt: null }, null]
      }
      const dwellMs = nowMs - (state.leftAt ?? nowMs)
      if (dwellMs >= DEPARTURE_DWELL_MS) {
        // Confirmed departure
        const newState: GeofenceState = {
          ...state,
          phase: "outside",
          leftAt: null,
          arrivedAt: null,
          enteredAt: null,
        }
        return [newState, { type: "departure", stopId: state.stopId, timestamp: state.leftAt ?? nowMs }]
      }
      // Still waiting for dwell
      return [state, null]
    }
  }
}
