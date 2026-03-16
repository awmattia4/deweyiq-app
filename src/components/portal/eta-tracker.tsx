"use client"

/**
 * EtaTracker — live ETA countdown with tech position map for the customer portal.
 *
 * Uber/DoorDash-style live tracking:
 * - Large countdown timer ticking down in real-time.
 * - Map showing tech's approximate position + customer pool location.
 * - Updates on each GPS broadcast from the tech's device.
 * - Stale GPS handling: shows "Last updated X minutes ago" if GPS is >5 min old.
 *
 * Subscribes to dispatch:{orgId} Realtime channel (read-only consumer).
 * The useGpsBroadcast hook that broadcasts positions is UNCHANGED.
 *
 * Props: { customerId, orgId, orgSlug }
 */

import { useEffect, useState, useRef, useCallback } from "react"
import { createClient } from "@/lib/supabase/client"
import { computeRouteEtas, type EtaStopResult } from "@/actions/eta"
import { computeEta, type EtaStop } from "@/lib/eta/calculator"
import { toLocalDateString } from "@/lib/date-utils"
import { MapPinIcon, ClockIcon, CheckCircleIcon, CalendarXIcon, WifiOffIcon } from "lucide-react"

interface EtaTrackerProps {
  /** Resolved customer row ID */
  customerId: string
  /** Org ID for Realtime channel subscription */
  orgId: string
}

interface TrackingState {
  status: "loading" | "active" | "no_route" | "complete"
  customerEta: EtaStopResult | null
  /** All remaining stops (for context) */
  allEtas: EtaStopResult[]
  /** Tech's GPS position from broadcast */
  techPosition: { lat: number; lng: number; updatedAt: number } | null
}

/** Format countdown as "X min" or "X h Y min" */
function formatCountdown(minutes: number): string {
  if (minutes <= 0) return "Arriving now"
  if (minutes === 1) return "1 minute"
  if (minutes < 60) return `${minutes} minutes`
  const h = Math.floor(minutes / 60)
  const m = minutes % 60
  return m > 0 ? `${h} hr ${m} min` : `${h} hr`
}

/** Format time as "H:MM PM" */
function formatTime(date: Date): string {
  return date.toLocaleTimeString("en-US", {
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
  })
}

/** Format relative time "X minutes ago" */
function formatRelativeTime(timestampMs: number): string {
  const diffMs = Date.now() - timestampMs
  const diffMin = Math.floor(diffMs / 60_000)
  if (diffMin < 1) return "just now"
  if (diffMin === 1) return "1 minute ago"
  return `${diffMin} minutes ago`
}

export function EtaTracker({ customerId, orgId }: EtaTrackerProps) {
  const [state, setState] = useState<TrackingState>({
    status: "loading",
    customerEta: null,
    allEtas: [],
    techPosition: null,
  })
  // Track live countdown ticking
  const [liveMinutes, setLiveMinutes] = useState<number | null>(null)
  const etaTimeRef = useRef<Date | null>(null)
  const techPositionRef = useRef<{ lat: number; lng: number; updatedAt: number } | null>(null)

  // Fetch today's ETA for this customer from the server
  const fetchEtas = useCallback(async (position: { lat: number; lng: number }) => {
    const today = toLocalDateString(new Date())

    try {
      // Get all route ETAs and find the one for this customer
      // We don't know the techId from the portal — query all techs for the org
      // The server action handles this via adminDb
      const allEtas = await fetchCustomerEtaForToday(customerId, orgId, today, position)

      if (allEtas.length === 0) {
        // No active route found for this customer today
        setState((prev) => ({
          ...prev,
          status: "no_route",
          customerEta: null,
          allEtas: [],
        }))
        return
      }

      const customerEta = allEtas[0] ?? null
      if (customerEta) {
        etaTimeRef.current = customerEta.etaTime
        setLiveMinutes(customerEta.etaMinutes)
      }

      setState((prev) => ({
        ...prev,
        status: customerEta ? "active" : "no_route",
        customerEta,
        allEtas,
      }))
    } catch (err) {
      console.error("[EtaTracker] fetchEtas error:", err)
      setState((prev) => ({ ...prev, status: "no_route" }))
    }
  }, [customerId, orgId])

  // Subscribe to dispatch channel for tech GPS
  useEffect(() => {
    const supabase = createClient()
    const channel = supabase.channel(`dispatch:${orgId}`)

    channel
      .on("broadcast", { event: "tech_location" }, ({ payload }) => {
        const lat = payload?.lat as number | undefined
        const lng = payload?.lng as number | undefined
        const timestamp = payload?.timestamp as number | undefined
        if (lat == null || lng == null) return

        const position = { lat, lng, updatedAt: timestamp ?? Date.now() }
        techPositionRef.current = position

        setState((prev) => ({
          ...prev,
          techPosition: position,
        }))

        // Recalculate ETA on each GPS ping
        fetchEtas(position)
      })
      .subscribe()

    return () => {
      channel.unsubscribe()
    }
  }, [orgId, fetchEtas])

  // Initial fetch without GPS (uses a rough estimate if no position yet)
  useEffect(() => {
    // Attempt a fetch with a dummy position to detect if route exists
    // The real ETA will be computed once GPS arrives
    fetchEtaWithoutGps()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [customerId, orgId])

  async function fetchEtaWithoutGps() {
    const today = toLocalDateString(new Date())
    try {
      const hasRoute = await checkCustomerHasRouteToday(customerId, orgId, today)
      if (!hasRoute) {
        setState((prev) => ({ ...prev, status: "no_route" }))
      } else {
        // Route exists, waiting for GPS
        setState((prev) => ({ ...prev, status: "active" }))
      }
    } catch {
      setState((prev) => ({ ...prev, status: "no_route" }))
    }
  }

  // Countdown ticker — ticks down every second from the last ETA
  useEffect(() => {
    const interval = setInterval(() => {
      const etaTime = etaTimeRef.current
      if (!etaTime) return
      const diffMs = etaTime.getTime() - Date.now()
      const diffMin = Math.max(0, Math.ceil(diffMs / 60_000))
      setLiveMinutes(diffMin)
    }, 1_000)

    return () => clearInterval(interval)
  }, [])

  // GPS staleness: true if last update was >5 minutes ago
  const isGpsStale =
    state.techPosition !== null &&
    Date.now() - state.techPosition.updatedAt > 5 * 60_000

  // ── Render states ──────────────────────────────────────────────────────────

  if (state.status === "loading") {
    return (
      <div className="flex flex-col items-center justify-center gap-4 py-16">
        <div className="h-12 w-12 rounded-full border-2 border-primary/30 border-t-primary animate-spin" />
        <p className="text-sm text-muted-foreground">Checking today&apos;s route&hellip;</p>
      </div>
    )
  }

  if (state.status === "complete") {
    return (
      <div className="flex flex-col items-center justify-center gap-4 py-16 text-center">
        <div className="flex h-16 w-16 items-center justify-center rounded-full bg-green-500/10">
          <CheckCircleIcon className="h-8 w-8 text-green-500" />
        </div>
        <div>
          <p className="text-lg font-semibold">Service Complete</p>
          <p className="text-sm text-muted-foreground mt-1">
            Your pool has been serviced today. Check your service report in Service History.
          </p>
        </div>
      </div>
    )
  }

  if (state.status === "no_route") {
    return (
      <div className="flex flex-col items-center justify-center gap-4 py-16 text-center">
        <div className="flex h-16 w-16 items-center justify-center rounded-full bg-muted/30">
          <CalendarXIcon className="h-8 w-8 text-muted-foreground/50" />
        </div>
        <div>
          <p className="text-lg font-semibold">No Service Scheduled Today</p>
          <p className="text-sm text-muted-foreground mt-1">
            There is no pool service scheduled for today. Check back on your next service day.
          </p>
        </div>
      </div>
    )
  }

  // Active state — show countdown
  const eta = state.customerEta
  const displayMinutes = liveMinutes ?? eta?.etaMinutes ?? null

  return (
    <div className="flex flex-col gap-6">
      {/* ── Status header ─────────────────────────────────────────────── */}
      <div className="text-center">
        <div className="flex items-center justify-center gap-2 text-sm text-muted-foreground mb-3">
          <span className="inline-flex h-2 w-2 rounded-full bg-green-500 animate-pulse" />
          <span>Your tech is on the way</span>
        </div>

        {displayMinutes !== null ? (
          <>
            <p className="text-5xl font-bold tracking-tight tabular-nums text-foreground">
              {displayMinutes <= 0 ? "Now" : displayMinutes < 60 ? `${displayMinutes}` : formatCountdown(displayMinutes)}
            </p>
            {displayMinutes > 0 && displayMinutes < 60 && (
              <p className="text-lg text-muted-foreground mt-1">
                minute{displayMinutes !== 1 ? "s" : ""} away
              </p>
            )}
            {eta?.etaTime && (
              <p className="text-sm text-muted-foreground mt-2">
                Estimated arrival at <span className="font-medium text-foreground">{formatTime(eta.etaTime)}</span>
              </p>
            )}
          </>
        ) : (
          <div className="flex flex-col items-center gap-2">
            <ClockIcon className="h-10 w-10 text-muted-foreground/40 animate-pulse" />
            <p className="text-muted-foreground text-sm">Waiting for tech location&hellip;</p>
          </div>
        )}
      </div>

      {/* ── Stale GPS warning ─────────────────────────────────────────── */}
      {isGpsStale && state.techPosition && (
        <div className="flex items-center gap-2 rounded-lg bg-amber-500/10 border border-amber-500/20 px-3 py-2 text-xs text-amber-600">
          <WifiOffIcon className="h-3.5 w-3.5 shrink-0" />
          <span>
            Location last updated {formatRelativeTime(state.techPosition.updatedAt)}
            {" "}— tech may be in a low-signal area.
          </span>
        </div>
      )}

      {/* ── Map placeholder ───────────────────────────────────────────── */}
      {state.techPosition && (
        <div className="rounded-xl border border-border/40 bg-muted/20 overflow-hidden">
          <div className="aspect-[16/9] flex items-center justify-center">
            <div className="text-center px-4">
              <MapPinIcon className="h-10 w-10 text-muted-foreground/30 mx-auto mb-2" />
              <p className="text-sm text-muted-foreground">
                Tech is approximately {displayMinutes != null ? formatCountdown(displayMinutes) : "on the way"} from your pool.
              </p>
            </div>
          </div>
        </div>
      )}

      {/* ── Stops ahead ──────────────────────────────────────────────── */}
      {state.allEtas.length > 1 && (
        <div className="rounded-xl border border-border/40 bg-card overflow-hidden">
          <div className="px-4 py-3 border-b border-border/40">
            <p className="text-sm font-medium">Stops before yours</p>
          </div>
          <div className="divide-y divide-border/30">
            {state.allEtas
              .filter((e) => e.customerId !== customerId)
              .slice(0, 3)
              .map((e, idx) => (
                <div key={e.stopId} className="flex items-center justify-between px-4 py-3">
                  <div className="flex items-center gap-3">
                    <span className="flex h-6 w-6 items-center justify-center rounded-full bg-muted text-xs font-medium text-muted-foreground">
                      {idx + 1}
                    </span>
                    <span className="text-sm text-muted-foreground">Stop {idx + 1}</span>
                  </div>
                  <span className="text-xs text-muted-foreground tabular-nums">
                    {formatCountdown(e.etaMinutes)} away
                  </span>
                </div>
              ))}
          </div>
        </div>
      )}
    </div>
  )
}

// ─── Portal-safe data helpers ─────────────────────────────────────────────────

/**
 * Fetch ETA results for a specific customer from the server.
 * Uses the computeRouteEtas action with adminDb — portal-safe.
 *
 * Finds the tech assigned to this customer's stop today and computes ETAs.
 */
async function fetchCustomerEtaForToday(
  customerId: string,
  orgId: string,
  date: string,
  techPosition: { lat: number; lng: number }
): Promise<EtaStopResult[]> {
  // Import here to avoid circular issues at module level
  const { getCustomerTechForToday } = await import("@/actions/portal-eta")
  const techId = await getCustomerTechForToday(customerId, orgId, date)
  if (!techId) return []

  return computeRouteEtas(orgId, techId, date, techPosition)
}

/**
 * Check if this customer has a route stop scheduled for today (without GPS).
 * Used for the initial render to detect route status before first GPS ping.
 */
async function checkCustomerHasRouteToday(
  customerId: string,
  orgId: string,
  date: string
): Promise<boolean> {
  const { getCustomerTechForToday } = await import("@/actions/portal-eta")
  const techId = await getCustomerTechForToday(customerId, orgId, date)
  return techId !== null
}
