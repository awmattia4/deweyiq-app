"use client"

import { useEffect, useState } from "react"
import { createClient } from "@/lib/supabase/client"

/**
 * A tech's current GPS position as received via Supabase Broadcast.
 */
export interface TechPosition {
  techId: string
  lat: number
  lng: number
  accuracy: number
  updatedAt: number
}

/**
 * useTechPositions — subscribes to Supabase Broadcast for live tech GPS positions.
 *
 * Listens to the `dispatch:{orgId}` channel for `tech_location` events sent by
 * techs running useGpsBroadcast on the /routes page.
 *
 * Returns a map keyed by techId — positions update in place as new broadcasts arrive.
 * Stale position detection (>2 minutes since updatedAt) is done by consumers
 * (e.g. TechPositionMarker) using the updatedAt timestamp.
 *
 * @param orgId - Organization UUID (from server-side JWT claims). Null disables the hook.
 */
export function useTechPositions(orgId: string | null): Record<string, TechPosition> {
  const [positions, setPositions] = useState<Record<string, TechPosition>>({})

  useEffect(() => {
    if (!orgId) return

    const supabase = createClient()
    const channel = supabase.channel(`dispatch:${orgId}`)

    channel
      .on(
        "broadcast",
        { event: "tech_location" },
        ({ payload }: { payload: {
          tech_id: string
          lat: number
          lng: number
          accuracy: number
          timestamp: number
        } }) => {
          setPositions((prev) => ({
            ...prev,
            [payload.tech_id]: {
              techId: payload.tech_id,
              lat: payload.lat,
              lng: payload.lng,
              accuracy: payload.accuracy,
              updatedAt: payload.timestamp,
            },
          }))
        }
      )
      .subscribe()

    return () => {
      channel.unsubscribe()
    }
  }, [orgId])

  return positions
}
