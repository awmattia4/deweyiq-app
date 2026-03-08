"use client"

import { useState } from "react"
import { LockIcon, LockOpenIcon } from "lucide-react"
import { cn } from "@/lib/utils"
import { toggleStopLock } from "@/actions/schedule"

// ─── StopLockToggle ────────────────────────────────────────────────────────────

interface StopLockToggleProps {
  stopId: string
  locked: boolean
  onToggle: (stopId: string) => void
  className?: string
}

/**
 * StopLockToggle — toggle button for locking/unlocking a route stop's position.
 *
 * - Locked: amber/gold LockIcon — stop is excluded from route optimizer
 * - Unlocked: muted LockOpenIcon — stop can be reordered
 *
 * Calls the toggleStopLock server action to persist, then notifies parent
 * via onToggle callback for optimistic UI update.
 */
export function StopLockToggle({ stopId, locked, onToggle, className }: StopLockToggleProps) {
  const [isPending, setIsPending] = useState(false)

  async function handleClick() {
    if (isPending) return
    setIsPending(true)
    try {
      // Optimistic update first
      onToggle(stopId)
      // Persist to server
      await toggleStopLock(stopId, !locked)
    } catch (err) {
      // Revert optimistic update on error
      onToggle(stopId)
      console.error("[StopLockToggle] Failed to toggle lock:", err)
    } finally {
      setIsPending(false)
    }
  }

  return (
    <button
      type="button"
      onClick={handleClick}
      disabled={isPending}
      aria-label={locked ? "Unlock stop position" : "Lock stop position"}
      title={locked ? "Locked — click to unlock" : "Unlocked — click to lock"}
      className={cn(
        "flex h-7 w-7 items-center justify-center rounded transition-colors cursor-pointer",
        locked
          ? "text-amber-400 hover:text-amber-300 hover:bg-amber-400/10"
          : "text-muted-foreground/50 hover:text-muted-foreground hover:bg-muted/60",
        isPending && "opacity-50 cursor-not-allowed",
        className
      )}
    >
      {locked ? (
        <LockIcon className="h-3.5 w-3.5" />
      ) : (
        <LockOpenIcon className="h-3.5 w-3.5" />
      )}
    </button>
  )
}
