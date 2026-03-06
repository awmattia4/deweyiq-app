"use client"

import { cn } from "@/lib/utils"

interface RouteProgressProps {
  completedStops: number
  totalStops: number
  className?: string
}

/**
 * RouteProgress — X of Y stops progress bar for the route view.
 *
 * Per locked decision: "Progress bar at top showing 'X of Y stops' with visual fill"
 * FIELD-11: 44px minimum height for tap-target compliance.
 *
 * Color: brand accent for completed portion, muted for remainder.
 */
export function RouteProgress({
  completedStops,
  totalStops,
  className,
}: RouteProgressProps) {
  const percentage =
    totalStops > 0 ? Math.round((completedStops / totalStops) * 100) : 0

  const allDone = completedStops === totalStops && totalStops > 0

  return (
    <div
      className={cn(
        "flex flex-col gap-2 min-h-[44px] justify-center",
        className
      )}
      role="region"
      aria-label="Route progress"
    >
      {/* Label row */}
      <div className="flex items-center justify-between">
        <span className="text-sm font-medium text-foreground">
          {allDone ? (
            <span className="text-green-400">All {totalStops} stops complete</span>
          ) : (
            <>
              <span className="font-bold text-foreground">{completedStops}</span>
              <span className="text-muted-foreground"> of {totalStops} stops</span>
            </>
          )}
        </span>
        <span
          className={cn(
            "text-xs font-medium tabular-nums",
            allDone ? "text-green-400" : "text-muted-foreground"
          )}
        >
          {percentage}%
        </span>
      </div>

      {/* Fill bar */}
      <div
        className="relative h-2 w-full overflow-hidden rounded-full bg-muted"
        aria-hidden="true"
      >
        <div
          className={cn(
            "h-full rounded-full transition-all duration-500 ease-out",
            allDone
              ? "bg-green-500"
              : "bg-primary"
          )}
          style={{ width: `${percentage}%` }}
        />
      </div>
    </div>
  )
}
