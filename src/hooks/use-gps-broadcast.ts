"use client"

import { useEffect, useRef } from "react"
import { toast } from "sonner"
import { createClient } from "@/lib/supabase/client"
import {
  isInsideGeofence,
  createGeofenceState,
  processGeofenceUpdate,
  type GeofenceState,
} from "@/lib/geo/geofence"
import { recordStopArrival, recordStopDeparture } from "@/actions/time-tracking"

/**
 * Stop descriptor for geofence detection.
 * The routes page passes today's stops with their coordinates so the hook
 * can detect when the tech enters/exits each stop's geofence.
 */
export interface GeofenceStop {
  id: string
  lat: number
  lng: number
}

/**
 * useGpsBroadcast — broadcasts the tech's GPS position via Supabase Realtime Broadcast
 * AND performs geofence-based per-stop arrival/departure detection.
 *
 * Per user decision: GPS tracked only while the app is open and tech is on route.
 * No background tracking — watchPosition fires only while page is active.
 *
 * Activates when `active` is true and both orgId + techId are available.
 * Cleans up on unmount per RESEARCH.md Pitfall 6: clearWatch + unsubscribe
 * prevent battery drain when tech navigates away from the route page.
 *
 * Channel is org-scoped: `dispatch:{orgId}`. Office dispatch map subscribes
 * to the same channel to receive tech_location events.
 *
 * Geofence detection is ADDITIVE — the existing dispatch broadcast is unchanged.
 * Geofence checks only run when activeShiftId is present (tech is clocked in).
 *
 * Anti-bounce (Research Pitfall 5):
 * - Arrival: tech must be inside geofence >= 30s before triggering
 * - Departure: tech must be outside >= 60s after arrival before triggering
 * Per-stop state machine prevents GPS jitter from creating false events.
 *
 * @param orgId          - Organization UUID (from JWT claims)
 * @param techId         - Tech's user UUID (from JWT sub claim)
 * @param active         - Whether to broadcast. Set false to pause without unmounting.
 * @param stops          - Today's stops with lat/lng for geofence detection (optional)
 * @param geofenceRadius - Geofence radius in meters (org_settings.geofence_radius_meters)
 * @param activeShiftId  - Active time_entries.id when clocked in, null otherwise
 */
export function useGpsBroadcast(
  orgId: string | null,
  techId: string | null,
  active: boolean,
  stops?: GeofenceStop[],
  geofenceRadius?: number,
  activeShiftId?: string | null
) {
  // Per-stop geofence state machine keyed by stop ID.
  // Stored in a ref so GPS callbacks always have the latest state without
  // triggering re-renders (Dexie-derived state preference from MEMORY.md).
  const geofenceStatesRef = useRef<Map<string, GeofenceState>>(new Map())
  // Track previous stops to only reset geofence states when stops actually change
  const prevStopsRef = useRef<GeofenceStop[] | undefined>(undefined)

  useEffect(() => {
    if (!orgId || !techId || !active) return

    const supabase = createClient()
    const channel = supabase.channel(`dispatch:${orgId}`)

    let watchId: number | null = null

    // Only reset geofence states when the stops list changes, NOT when activeShiftId changes.
    // This prevents losing arrival progress when a tech clocks in mid-route.
    const stopsChanged = stops !== prevStopsRef.current
    if (stopsChanged) {
      geofenceStatesRef.current = new Map()
      prevStopsRef.current = stops
    }

    channel.subscribe((status) => {
      if (status !== "SUBSCRIBED") return

      watchId = navigator.geolocation.watchPosition(
        (position) => {
          const lat = position.coords.latitude
          const lng = position.coords.longitude

          // ── Dispatch broadcast (original behavior, unchanged) ──────────────
          channel.send({
            type: "broadcast",
            event: "tech_location",
            payload: {
              tech_id: techId,
              lat,
              lng,
              accuracy: position.coords.accuracy,
              timestamp: Date.now(),
            },
          })

          // ── Geofence detection (additive, only when clocked in) ────────────
          // Skip if not clocked in, no stops, or no radius configured.
          if (!activeShiftId || !stops?.length || !geofenceRadius) return

          const nowMs = Date.now()
          const currentStates = geofenceStatesRef.current

          for (const stop of stops) {
            // Initialize state for new stops
            if (!currentStates.has(stop.id)) {
              currentStates.set(stop.id, createGeofenceState(stop.id))
            }

            const currentState = currentStates.get(stop.id)!
            const inside = isInsideGeofence(lat, lng, stop.lat, stop.lng, geofenceRadius)
            const [newState, event] = processGeofenceUpdate(currentState, inside, nowMs)

            currentStates.set(stop.id, newState)

            if (event) {
              if (event.type === "arrival") {
                // Fire-and-forget: don't await in GPS callback
                recordStopArrival(stop.id, activeShiftId).catch((err) => {
                  console.error("[GPS] Failed to record arrival:", err)
                })
              } else if (event.type === "departure") {
                recordStopDeparture(stop.id).catch((err) => {
                  console.error("[GPS] Failed to record departure:", err)
                })
              }
            }
          }
        },
        (error) => {
          if (error.code === error.PERMISSION_DENIED) {
            toast.error("Enable location to share your position with dispatch")
          }
          console.error("[GPS] Error:", error.message)
        },
        {
          enableHighAccuracy: true,
          maximumAge: 10_000, // accept cached position up to 10s old
          timeout: 15_000,
        }
      )
    })

    return () => {
      if (watchId !== null) navigator.geolocation.clearWatch(watchId)
      channel.unsubscribe()
    }
  }, [orgId, techId, active, stops, geofenceRadius, activeShiftId])
}
