"use client"

import { useEffect } from "react"
import { toast } from "sonner"
import { createClient } from "@/lib/supabase/client"

/**
 * useGpsBroadcast — broadcasts the tech's GPS position via Supabase Realtime Broadcast.
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
 * @param orgId  - Organization UUID (from JWT claims)
 * @param techId - Tech's user UUID (from JWT sub claim)
 * @param active - Whether to broadcast. Set false to pause without unmounting.
 */
export function useGpsBroadcast(
  orgId: string | null,
  techId: string | null,
  active: boolean
) {
  useEffect(() => {
    if (!orgId || !techId || !active) return

    const supabase = createClient()
    const channel = supabase.channel(`dispatch:${orgId}`)

    let watchId: number | null = null

    channel.subscribe((status) => {
      if (status !== "SUBSCRIBED") return

      watchId = navigator.geolocation.watchPosition(
        (position) => {
          channel.send({
            type: "broadcast",
            event: "tech_location",
            payload: {
              tech_id: techId,
              lat: position.coords.latitude,
              lng: position.coords.longitude,
              accuracy: position.coords.accuracy,
              timestamp: Date.now(),
            },
          })
        },
        (error) => {
          if (error.code === error.PERMISSION_DENIED) {
            toast.error("Enable location to share your position with dispatch")
          }
          console.error("[GPS] Error:", error.message)
        },
        {
          enableHighAccuracy: true,
          maximumAge: 10_000,  // accept cached position up to 10s old
          timeout: 15_000,
        }
      )
    })

    return () => {
      if (watchId !== null) navigator.geolocation.clearWatch(watchId)
      channel.unsubscribe()
    }
  }, [orgId, techId, active])
}
