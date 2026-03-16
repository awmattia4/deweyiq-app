"use client"

import { useState, useEffect, useRef } from "react"
import { LoaderCircleIcon, CheckCircleIcon, TimerIcon } from "lucide-react"
import { toast } from "sonner"
import { getActiveShift, clockIn, clockOut } from "@/actions/time-tracking"
import type { ActiveShiftState } from "@/actions/time-tracking"
import { BreakButton } from "@/components/field/break-button"
import { cn } from "@/lib/utils"

/**
 * Format elapsed seconds into h:mm:ss (e.g. "1:04:22") or mm:ss for < 1 hour.
 */
function formatElapsed(seconds: number): string {
  const h = Math.floor(seconds / 3600)
  const m = Math.floor((seconds % 3600) / 60)
  const s = seconds % 60
  if (h > 0) {
    return `${h}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`
  }
  return `${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`
}

/**
 * ClockInBanner — persistent clock-in/out banner displayed at the top of the routes page.
 *
 * Three visual states:
 * a. Not clocked in: prominent green "Clock In" call-to-action.
 * b. Clocked in (active): amber banner with elapsed time + Break/Clock Out actions.
 * c. On break: violet banner with break duration + End Break action.
 *
 * GPS is requested on clock-in/out — failure never blocks the action.
 * Visually distinct from the Start Route button (different purpose, different color).
 * 44px minimum tap targets on all interactive elements.
 *
 * Uses local React state for the tick counter (no Dexie needed — not persisted).
 * Fetches fresh shift state from server on mount.
 */
export function ClockInBanner() {
  const [shiftState, setShiftState] = useState<ActiveShiftState | null | "loading">("loading")
  const [isOnBreak, setIsOnBreak] = useState(false)
  const [breakStartEpoch, setBreakStartEpoch] = useState<number | null>(null)
  const [elapsedSeconds, setElapsedSeconds] = useState(0)
  const [isClockedIn, setIsClockedIn] = useState(false)
  const [clockInEpoch, setClockInEpoch] = useState<number | null>(null)
  const [isClockingIn, setIsClockingIn] = useState(false)
  const [isClockingOut, setIsClockingOut] = useState(false)
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null)

  // ── Fetch active shift state on mount ────────────────────────────────────────
  useEffect(() => {
    getActiveShift().then((state) => {
      setShiftState(state)
      if (state) {
        setIsClockedIn(true)
        setIsOnBreak(state.status === "on_break")
        setClockInEpoch(new Date(state.clockedInAt).getTime())
        if (state.breakStartedAt) {
          setBreakStartEpoch(new Date(state.breakStartedAt).getTime())
        }
        // Calculate initial elapsed seconds from clocked_in_at
        const elapsed = Math.floor((Date.now() - new Date(state.clockedInAt).getTime()) / 1000)
        setElapsedSeconds(Math.max(0, elapsed))
      }
    })
  }, [])

  // ── Live elapsed time ticker ──────────────────────────────────────────────────
  // Ticks every second when clocked in. Updates elapsedSeconds.
  useEffect(() => {
    if (!isClockedIn || !clockInEpoch) {
      if (intervalRef.current) {
        clearInterval(intervalRef.current)
        intervalRef.current = null
      }
      return
    }

    // Start interval — fires every second to update elapsed display
    intervalRef.current = setInterval(() => {
      setElapsedSeconds(Math.floor((Date.now() - clockInEpoch) / 1000))
    }, 1000)

    return () => {
      if (intervalRef.current) {
        clearInterval(intervalRef.current)
        intervalRef.current = null
      }
    }
  }, [isClockedIn, clockInEpoch])

  // ── GPS helper — non-blocking ─────────────────────────────────────────────────
  async function getGpsCoords(): Promise<{ lat: number | null; lng: number | null }> {
    return new Promise((resolve) => {
      if (!navigator.geolocation) {
        resolve({ lat: null, lng: null })
        return
      }
      navigator.geolocation.getCurrentPosition(
        (pos) => resolve({ lat: pos.coords.latitude, lng: pos.coords.longitude }),
        () => resolve({ lat: null, lng: null }), // GPS denied/error — never block clock-in
        { enableHighAccuracy: true, timeout: 5000, maximumAge: 30_000 }
      )
    })
  }

  // ── Clock In handler ──────────────────────────────────────────────────────────
  async function handleClockIn() {
    if (isClockingIn) return
    setIsClockingIn(true)

    try {
      const { lat, lng } = await getGpsCoords()
      const result = await clockIn(lat, lng)

      if (result.error) {
        toast.error(`Clock-in failed: ${result.error}`)
        return
      }

      const now = Date.now()
      setIsClockedIn(true)
      setClockInEpoch(now)
      setElapsedSeconds(0)
      setIsOnBreak(false)
      // Refresh shift state for accurate entryId
      const freshState = await getActiveShift()
      setShiftState(freshState)

      toast.success("Clocked in" + (lat ? " (GPS captured)" : ""))
    } catch (err) {
      const message = err instanceof Error ? err.message : "Something went wrong"
      toast.error(`Clock-in failed: ${message}`)
    } finally {
      setIsClockingIn(false)
    }
  }

  // ── Clock Out handler ─────────────────────────────────────────────────────────
  async function handleClockOut() {
    if (isClockingOut) return
    setIsClockingOut(true)

    try {
      const { lat, lng } = await getGpsCoords()
      const result = await clockOut(lat, lng)

      if (result.error) {
        toast.error(`Clock-out failed: ${result.error}`)
        return
      }

      const totalMins = result.totalMinutes ?? 0
      const breakMins = result.breakMinutes ?? 0
      const workMins = totalMins - breakMins

      setIsClockedIn(false)
      setIsOnBreak(false)
      setClockInEpoch(null)
      setBreakStartEpoch(null)
      setElapsedSeconds(0)
      setShiftState(null)

      toast.success(
        `Clocked out — ${workMins} min worked${breakMins > 0 ? `, ${breakMins} min on break` : ""}`
      )
    } catch (err) {
      const message = err instanceof Error ? err.message : "Something went wrong"
      toast.error(`Clock-out failed: ${message}`)
    } finally {
      setIsClockingOut(false)
    }
  }

  // ── Break state change callback ───────────────────────────────────────────────
  function handleBreakChange(nowOnBreak: boolean) {
    setIsOnBreak(nowOnBreak)
    if (nowOnBreak) {
      setBreakStartEpoch(Date.now())
    } else {
      setBreakStartEpoch(null)
    }
  }

  // ── Loading state ─────────────────────────────────────────────────────────────
  if (shiftState === "loading") {
    return (
      <div className="flex items-center gap-2 rounded-xl border border-border/40 bg-card/50 px-4 min-h-[54px] text-sm text-muted-foreground">
        <LoaderCircleIcon className="h-4 w-4 animate-spin" aria-hidden="true" />
        <span>Loading time clock...</span>
      </div>
    )
  }

  // ── Not clocked in ────────────────────────────────────────────────────────────
  if (!isClockedIn) {
    return (
      <button
        type="button"
        onClick={handleClockIn}
        disabled={isClockingIn}
        aria-label="Clock in to start your shift"
        className={cn(
          "w-full flex items-center justify-center gap-2 rounded-xl px-4 min-h-[54px] text-sm font-semibold transition-all duration-200 border",
          "bg-emerald-500/15 text-emerald-300 border-emerald-500/40",
          "hover:bg-emerald-500/25 active:scale-[0.99]",
          isClockingIn && "opacity-70 cursor-wait"
        )}
      >
        {isClockingIn ? (
          <LoaderCircleIcon className="h-4 w-4 animate-spin" aria-hidden="true" />
        ) : (
          <TimerIcon className="h-4 w-4" aria-hidden="true" />
        )}
        {isClockingIn ? "Clocking In..." : "Clock In"}
      </button>
    )
  }

  // ── Break duration display ────────────────────────────────────────────────────
  const breakElapsedSecs = breakStartEpoch
    ? Math.floor((Date.now() - breakStartEpoch) / 1000)
    : 0

  // ── On break state ────────────────────────────────────────────────────────────
  if (isOnBreak) {
    return (
      <div className={cn(
        "flex items-center justify-between gap-3 rounded-xl px-4 min-h-[54px] border",
        "bg-violet-500/10 border-violet-500/30"
      )}>
        <div className="flex items-center gap-2 min-w-0">
          <span className="text-xs font-medium text-violet-300 uppercase tracking-wide">On Break</span>
          <BreakTimerDisplay epochMs={breakStartEpoch} />
        </div>
        <BreakButton isOnBreak={true} onBreakChange={handleBreakChange} />
      </div>
    )
  }

  // ── Clocked in (active) state ─────────────────────────────────────────────────
  return (
    <div className={cn(
      "flex items-center justify-between gap-3 rounded-xl px-4 min-h-[54px] border",
      "bg-amber-500/10 border-amber-500/30"
    )}>
      {/* Left side: status + elapsed time */}
      <div className="flex items-center gap-3 min-w-0">
        <CheckCircleIcon className="h-4 w-4 text-amber-400 shrink-0" aria-hidden="true" />
        <div className="flex flex-col">
          <span className="text-xs font-medium text-amber-300 uppercase tracking-wide">Clocked In</span>
          <span className="text-sm font-mono font-semibold text-amber-100 tabular-nums">
            {formatElapsed(elapsedSeconds)}
          </span>
        </div>
      </div>

      {/* Right side: Break + Clock Out */}
      <div className="flex items-center gap-2 shrink-0">
        <BreakButton isOnBreak={false} onBreakChange={handleBreakChange} />
        <button
          type="button"
          onClick={handleClockOut}
          disabled={isClockingOut}
          aria-label="Clock out and end your shift"
          className={cn(
            "flex items-center gap-1.5 rounded-lg px-3 min-h-[44px] text-xs font-semibold transition-all duration-200 cursor-pointer border",
            "bg-card text-muted-foreground border-border/60",
            "hover:text-foreground hover:border-border active:scale-[0.98]",
            isClockingOut && "opacity-70 cursor-wait"
          )}
        >
          {isClockingOut ? (
            <LoaderCircleIcon className="h-3.5 w-3.5 animate-spin" aria-hidden="true" />
          ) : null}
          {isClockingOut ? "Clocking Out..." : "Clock Out"}
        </button>
      </div>
    </div>
  )
}

/**
 * BreakTimerDisplay — live break duration counter.
 * Separate component so it can tick independently without re-rendering the entire banner.
 */
function BreakTimerDisplay({ epochMs }: { epochMs: number | null }) {
  const [secs, setSecs] = useState(() =>
    epochMs ? Math.floor((Date.now() - epochMs) / 1000) : 0
  )

  useEffect(() => {
    if (!epochMs) return
    const id = setInterval(() => {
      setSecs(Math.floor((Date.now() - epochMs) / 1000))
    }, 1000)
    return () => clearInterval(id)
  }, [epochMs])

  if (!epochMs) return null

  return (
    <span className="text-sm font-mono font-semibold text-violet-200 tabular-nums">
      {formatElapsed(secs)}
    </span>
  )
}
