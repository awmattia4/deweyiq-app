"use client"

/**
 * EtaOverlay — per-stop ETA panel for the dispatch page.
 *
 * Shows real-time ETA estimates for all remaining stops on the selected
 * tech's active route. Auto-refreshes every 60 seconds.
 *
 * Subscribes to the dispatch:{orgId} Realtime channel to receive GPS updates
 * and recalculates ETAs on each ping (read-only consumer — useGpsBroadcast
 * hook is unchanged).
 */

import { useEffect, useState, useRef, useCallback } from "react"
import { createClient } from "@/lib/supabase/client"
import { computeRouteEtas, type EtaStopResult } from "@/actions/eta"
import { toLocalDateString } from "@/lib/date-utils"
import { ClockIcon, RefreshCcwIcon } from "lucide-react"

interface EtaOverlayProps {
  /** The currently selected tech ID */
  techId: string
  /** Org ID for Realtime channel subscription */
  orgId: string
}

/** Format "X min" or "Arriving now" */
function formatEtaMinutes(minutes: number): string {
  if (minutes <= 1) return "Arriving now"
  if (minutes < 60) return `${minutes} min`
  const hours = Math.floor(minutes / 60)
  const mins = minutes % 60
  return mins > 0 ? `${hours}h ${mins}m` : `${hours}h`
}

/** Format HH:MM AM/PM */
function formatEtaTime(date: Date): string {
  return date.toLocaleTimeString("en-US", {
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
  })
}

export function EtaOverlay({ techId, orgId }: EtaOverlayProps) {
  const [etas, setEtas] = useState<EtaStopResult[]>([])
  const [loading, setLoading] = useState(true)
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null)
  const techPositionRef = useRef<{ lat: number; lng: number } | null>(null)

  // Fetch ETAs with the latest known tech position
  const fetchEtas = useCallback(async () => {
    const today = toLocalDateString(new Date())
    const position = techPositionRef.current

    if (!position) {
      // No GPS yet — can still compute with a placeholder but it's not useful
      // Skip until we have at least one GPS ping
      setLoading(false)
      return
    }

    try {
      const results = await computeRouteEtas(orgId, techId, today, position)
      setEtas(results)
      setLastUpdated(new Date())
    } catch (err) {
      console.error("[EtaOverlay] fetchEtas error:", err)
    } finally {
      setLoading(false)
    }
  }, [orgId, techId])

  // Subscribe to dispatch channel for tech GPS updates
  useEffect(() => {
    const supabase = createClient()
    const channel = supabase.channel(`dispatch:${orgId}`)

    channel
      .on("broadcast", { event: "tech_location" }, ({ payload }) => {
        if (payload?.tech_id !== techId) return
        const lat = payload?.lat as number | undefined
        const lng = payload?.lng as number | undefined
        if (lat == null || lng == null) return

        techPositionRef.current = { lat, lng }
        // Recalculate ETA on each GPS ping (haversine is fast enough)
        fetchEtas()
      })
      .subscribe()

    return () => {
      channel.unsubscribe()
    }
  }, [orgId, techId, fetchEtas])

  // Auto-refresh every 60 seconds even without new GPS updates
  useEffect(() => {
    const interval = setInterval(() => {
      fetchEtas()
    }, 60_000)
    return () => clearInterval(interval)
  }, [fetchEtas])

  // Initial fetch on mount
  useEffect(() => {
    fetchEtas()
  }, [fetchEtas])

  if (loading) {
    return (
      <div className="bg-card/95 border border-border/40 rounded-lg p-3 backdrop-blur-sm w-72">
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <ClockIcon className="h-3.5 w-3.5 shrink-0 animate-pulse" />
          <span>Computing ETAs&hellip;</span>
        </div>
      </div>
    )
  }

  if (etas.length === 0) {
    return (
      <div className="bg-card/95 border border-border/40 rounded-lg p-3 backdrop-blur-sm w-72">
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <ClockIcon className="h-3.5 w-3.5 shrink-0" />
          <span>
            {techPositionRef.current
              ? "No remaining stops"
              : "Waiting for tech GPS\u2026"}
          </span>
        </div>
      </div>
    )
  }

  return (
    <div className="bg-card/95 border border-border/40 rounded-lg backdrop-blur-sm w-72 overflow-hidden">
      {/* Header */}
      <div className="flex items-center justify-between px-3 py-2 border-b border-border/40">
        <div className="flex items-center gap-1.5">
          <ClockIcon className="h-3.5 w-3.5 text-muted-foreground" />
          <span className="text-xs font-medium text-foreground">Live ETAs</span>
        </div>
        {lastUpdated && (
          <div className="flex items-center gap-1 text-[10px] text-muted-foreground">
            <RefreshCcwIcon className="h-2.5 w-2.5" />
            <span>{formatEtaTime(lastUpdated)}</span>
          </div>
        )}
      </div>

      {/* Stop rows */}
      <div className="divide-y divide-border/30 max-h-72 overflow-y-auto">
        {etas.map((eta, idx) => (
          <div key={eta.stopId} className="flex items-center justify-between gap-2 px-3 py-2">
            {/* Stop number + name */}
            <div className="flex items-center gap-2 min-w-0">
              <span className="flex-shrink-0 flex h-5 w-5 items-center justify-center rounded-full bg-muted text-[10px] font-medium text-muted-foreground">
                {idx + 1}
              </span>
              <div className="min-w-0">
                <p className="text-xs font-medium text-foreground truncate leading-tight">
                  {eta.customerName}
                </p>
                {eta.poolName && (
                  <p className="text-[10px] text-muted-foreground truncate leading-tight">
                    {eta.poolName}
                  </p>
                )}
              </div>
            </div>

            {/* ETA */}
            <div className="flex-shrink-0 text-right">
              <p className="text-xs font-semibold text-foreground tabular-nums">
                {formatEtaMinutes(eta.etaMinutes)}
              </p>
              <p className="text-[10px] text-muted-foreground tabular-nums">
                {formatEtaTime(eta.etaTime)}
              </p>
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}
