"use client"

import { useState } from "react"
import { PlayIcon, CheckCircleIcon, LoaderCircleIcon } from "lucide-react"
import { toast } from "sonner"
import { startRoute } from "@/actions/notifications"
import { cn } from "@/lib/utils"

interface StartRouteButtonProps {
  /**
   * If true, the route was already started today (at least one stop has
   * pre_arrival_sent_at set). Renders in disabled "Route Started" state.
   */
  alreadyStarted: boolean
}

/**
 * StartRouteButton — one-tap button for techs to start their route.
 *
 * When tapped:
 * 1. Calls startRoute() server action (fires pre-arrival SMS/email to eligible customers)
 * 2. Shows loading state while in-flight
 * 3. On success: toast "Route started! N customers notified" + disables button
 * 4. On error: toast error message, re-enables button for retry
 *
 * Idempotency: the startRoute action itself filters out stops that have
 * pre_arrival_sent_at set, so tapping twice is safe but shows 0 sent.
 *
 * Tech role only — office/owner do not see this component (parent page guards).
 */
export function StartRouteButton({ alreadyStarted }: StartRouteButtonProps) {
  const [isLoading, setIsLoading] = useState(false)
  const [isDone, setIsDone] = useState(alreadyStarted)

  async function handleStartRoute() {
    if (isDone || isLoading) return

    setIsLoading(true)
    try {
      const result = await startRoute()

      if (result.error) {
        toast.error(`Failed to send notifications: ${result.error}`)
        return
      }

      setIsDone(true)

      if (result.sent === 0) {
        toast.success("Route started! No notifications to send.")
      } else {
        toast.success(
          `Route started! ${result.sent} ${result.sent === 1 ? "customer" : "customers"} notified.`
        )
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : "Something went wrong"
      toast.error(`Failed to start route: ${message}`)
    } finally {
      setIsLoading(false)
    }
  }

  const isDisabled = isDone || isLoading

  return (
    <button
      type="button"
      onClick={handleStartRoute}
      disabled={isDisabled}
      aria-label={isDone ? "Route already started" : "Start route and notify customers"}
      className={cn(
        "flex items-center gap-2 rounded-lg px-4 min-h-[44px] text-sm font-semibold transition-all duration-200 cursor-pointer",
        isDone
          ? "bg-green-500/15 text-green-400 border border-green-500/30 cursor-default"
          : isLoading
            ? "bg-primary/80 text-primary-foreground border border-primary/40 cursor-wait"
            : "bg-primary text-primary-foreground border border-primary/20 hover:bg-primary/90 active:scale-[0.98]",
        isDisabled && "opacity-80"
      )}
    >
      {isLoading ? (
        <LoaderCircleIcon className="h-4 w-4 animate-spin" aria-hidden="true" />
      ) : isDone ? (
        <CheckCircleIcon className="h-4 w-4" aria-hidden="true" />
      ) : (
        <PlayIcon className="h-4 w-4" aria-hidden="true" />
      )}
      {isDone ? "Route Started" : isLoading ? "Notifying..." : "Start Route"}
    </button>
  )
}
