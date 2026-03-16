"use client"

import { useState } from "react"
import { LoaderCircleIcon } from "lucide-react"
import { toast } from "sonner"
import { startBreak, endBreak } from "@/actions/time-tracking"
import { cn } from "@/lib/utils"

interface BreakButtonProps {
  /** Whether the tech is currently on break */
  isOnBreak: boolean
  /** Called after a successful break state change — parent updates its state */
  onBreakChange: (isOnBreak: boolean) => void
}

/**
 * BreakButton — one-tap toggle for starting and ending breaks.
 *
 * Calls startBreak() when active, endBreak() when on break.
 * Rendered inline within ClockInBanner.
 *
 * 44px minimum tap target per mobile UX requirements.
 */
export function BreakButton({ isOnBreak, onBreakChange }: BreakButtonProps) {
  const [isLoading, setIsLoading] = useState(false)

  async function handleBreakToggle() {
    if (isLoading) return
    setIsLoading(true)

    try {
      if (isOnBreak) {
        const result = await endBreak()
        if (result.error) {
          toast.error(`Failed to end break: ${result.error}`)
          return
        }
        const mins = result.durationMinutes ?? 0
        toast.success(`Break ended — ${mins} ${mins === 1 ? "minute" : "minutes"}`)
        onBreakChange(false)
      } else {
        const result = await startBreak()
        if (result.error) {
          toast.error(`Failed to start break: ${result.error}`)
          return
        }
        toast.success("Break started")
        onBreakChange(true)
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : "Something went wrong"
      toast.error(isOnBreak ? `Failed to end break: ${message}` : `Failed to start break: ${message}`)
    } finally {
      setIsLoading(false)
    }
  }

  return (
    <button
      type="button"
      onClick={handleBreakToggle}
      disabled={isLoading}
      aria-label={isOnBreak ? "End break" : "Start break"}
      className={cn(
        "flex items-center gap-1.5 rounded-lg px-3 min-h-[44px] text-xs font-semibold transition-all duration-200 cursor-pointer border",
        isOnBreak
          ? "bg-violet-500/15 text-violet-300 border-violet-500/40 hover:bg-violet-500/25 active:scale-[0.98]"
          : "bg-amber-500/10 text-amber-300 border-amber-500/30 hover:bg-amber-500/20 active:scale-[0.98]",
        isLoading && "opacity-70 cursor-wait"
      )}
    >
      {isLoading ? (
        <LoaderCircleIcon className="h-3.5 w-3.5 animate-spin" aria-hidden="true" />
      ) : null}
      {isOnBreak ? "End Break" : "Break"}
    </button>
  )
}
