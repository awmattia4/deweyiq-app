"use client"

import { useGpsBroadcast } from "@/hooks/use-gps-broadcast"

interface GpsBroadcasterProps {
  orgId: string
  techId: string
}

/**
 * GpsBroadcaster — render-null client component that activates GPS broadcasting.
 *
 * Included in the /routes page for tech role only. While this component is mounted,
 * the tech's GPS position is broadcast to the dispatch channel via Supabase Realtime.
 *
 * Cleans up automatically when the tech navigates away from /routes (unmounts).
 * This matches the user decision: "GPS tracked only while app is open and on route."
 *
 * Same pattern as SyncInitializer — no visual output, side-effect on mount only.
 */
export function GpsBroadcaster({ orgId, techId }: GpsBroadcasterProps) {
  useGpsBroadcast(orgId, techId, true)
  return null
}
