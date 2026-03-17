"use client"

/**
 * ProfitabilityGauge — Visual margin indicator for project financial dashboard.
 *
 * Shows current margin % as a segmented bar with:
 * - Green zone: above margin_floor threshold
 * - Amber zone: within 5% of floor
 * - Red zone: below floor
 *
 * Includes threshold line marking the margin_floor_pct setting.
 */

interface ProfitabilityGaugeProps {
  margin: number
  projectedMargin: number
  marginFloor: number
  isAtRisk: boolean
}

export function ProfitabilityGauge({
  margin,
  projectedMargin,
  marginFloor,
  isAtRisk,
}: ProfitabilityGaugeProps) {
  // Clamp values to 0-100 for display
  const displayMargin = Math.max(0, Math.min(100, margin))
  const displayProjected = Math.max(0, Math.min(100, projectedMargin))
  const floorPosition = Math.max(0, Math.min(100, marginFloor))

  const getMarginColor = (m: number) => {
    if (m < marginFloor) return "text-destructive"
    if (m < marginFloor + 5) return "text-amber-500"
    return "text-emerald-500"
  }

  const getBarColor = (m: number) => {
    if (m < marginFloor) return "bg-destructive"
    if (m < marginFloor + 5) return "bg-amber-500"
    return "bg-emerald-500"
  }

  const marginLabel = margin >= 0 ? `${margin.toFixed(1)}%` : `${margin.toFixed(1)}%`
  const projectedLabel = projectedMargin >= 0
    ? `${projectedMargin.toFixed(1)}%`
    : `${projectedMargin.toFixed(1)}%`

  return (
    <div className="flex flex-col gap-3">
      {/* Current margin headline */}
      <div className="flex items-end gap-3">
        <div className="flex flex-col">
          <span className="text-xs text-muted-foreground uppercase tracking-wide">Current Margin</span>
          <span className={`text-3xl font-bold tabular-nums ${getMarginColor(margin)}`}>
            {marginLabel}
          </span>
        </div>
        {projectedMargin !== margin && (
          <div className="flex flex-col pb-0.5">
            <span className="text-xs text-muted-foreground">Projected</span>
            <span className={`text-base font-semibold tabular-nums ${getMarginColor(projectedMargin)}`}>
              {projectedLabel}
            </span>
          </div>
        )}
        {isAtRisk && (
          <span className="ml-auto text-xs font-medium text-destructive bg-destructive/10 px-2 py-1 rounded">
            At Risk
          </span>
        )}
      </div>

      {/* Margin bar */}
      <div className="relative">
        {/* Background track */}
        <div className="h-3 w-full rounded-full bg-muted overflow-hidden">
          {/* Actual margin fill */}
          <div
            className={`h-full rounded-full transition-all duration-500 ${getBarColor(margin)}`}
            style={{ width: `${displayMargin}%` }}
          />
        </div>

        {/* Floor threshold marker */}
        <div
          className="absolute top-0 h-3 w-0.5 bg-foreground/40 rounded-full"
          style={{ left: `${floorPosition}%` }}
          title={`Margin floor: ${marginFloor}%`}
        />

        {/* Projected marker (if different from actual) */}
        {projectedMargin !== margin && (
          <div
            className={`absolute -top-0.5 h-4 w-1.5 rounded-sm opacity-60 ${getBarColor(projectedMargin)}`}
            style={{ left: `${displayProjected}%` }}
            title={`Projected margin: ${projectedMargin.toFixed(1)}%`}
          />
        )}
      </div>

      {/* Legend */}
      <div className="flex items-center justify-between text-xs text-muted-foreground">
        <span>0%</span>
        <span className="text-foreground/50">
          Floor: {marginFloor}%
        </span>
        <span>100%</span>
      </div>

      {/* Cost breakdown reminder */}
      <p className="text-xs text-muted-foreground">
        {isAtRisk
          ? "Margin is below the configured threshold. Review costs to identify overruns."
          : "Margin is within acceptable range."}
      </p>
    </div>
  )
}
