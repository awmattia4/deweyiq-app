"use client"

import { useState } from "react"
import { CheckCircle2Icon } from "lucide-react"
import { cn } from "@/lib/utils"
import { AlertCard } from "@/components/alerts/alert-card"
import type { Alert, AlertType } from "@/lib/alerts/constants"

// ─── Filter configuration ──────────────────────────────────────────────────────

type FilterValue = "all" | AlertType

const FILTER_CHIPS: Array<{ label: string; value: FilterValue }> = [
  { label: "All", value: "all" },
  { label: "Missed Stops", value: "missed_stop" },
  { label: "Declining Chemistry", value: "declining_chemistry" },
  { label: "Incomplete Data", value: "incomplete_data" },
]

// ─── Component ────────────────────────────────────────────────────────────────

interface AlertFeedProps {
  alerts: Alert[]
}

/**
 * AlertFeed — Filter chip header + sorted list of AlertCard items.
 *
 * Filter chips narrow the feed by alert_type.
 * Empty state shown when no alerts match the current filter.
 */
export function AlertFeed({ alerts }: AlertFeedProps) {
  const [activeFilter, setActiveFilter] = useState<FilterValue>("all")

  const filtered =
    activeFilter === "all"
      ? alerts
      : alerts.filter((a) => a.alert_type === activeFilter)

  // Count per type for chip badges
  const countByType: Record<FilterValue, number> = {
    all: alerts.length,
    missed_stop: alerts.filter((a) => a.alert_type === "missed_stop").length,
    declining_chemistry: alerts.filter((a) => a.alert_type === "declining_chemistry").length,
    incomplete_data: alerts.filter((a) => a.alert_type === "incomplete_data").length,
  }

  return (
    <div className="flex flex-col gap-4">
      {/* ── Filter chips ──────────────────────────────────────────────── */}
      <div className="flex flex-wrap gap-2">
        {FILTER_CHIPS.map((chip) => {
          const isActive = activeFilter === chip.value
          const chipCount = countByType[chip.value]

          return (
            <button
              key={chip.value}
              onClick={() => setActiveFilter(chip.value)}
              className={cn(
                "inline-flex cursor-pointer items-center gap-1.5 rounded-full px-3 py-1 text-xs font-medium transition-colors",
                isActive
                  ? "bg-primary text-primary-foreground"
                  : "bg-muted text-muted-foreground hover:bg-muted/80 hover:text-foreground"
              )}
            >
              {chip.label}
              {chipCount > 0 && (
                <span
                  className={cn(
                    "inline-flex h-4 min-w-4 items-center justify-center rounded-full px-1 text-xs",
                    isActive
                      ? "bg-primary-foreground/20 text-primary-foreground"
                      : "bg-background text-foreground"
                  )}
                >
                  {chipCount}
                </span>
              )}
            </button>
          )
        })}
      </div>

      {/* ── Alert list ────────────────────────────────────────────────── */}
      {filtered.length === 0 ? (
        <EmptyState hasAlerts={alerts.length > 0} />
      ) : (
        <div className="flex flex-col gap-2">
          {filtered.map((alert) => (
            <AlertCard key={alert.id} alert={alert} />
          ))}
        </div>
      )}
    </div>
  )
}

// ─── Empty state ──────────────────────────────────────────────────────────────

function EmptyState({ hasAlerts }: { hasAlerts: boolean }) {
  return (
    <div className="flex flex-col items-center justify-center rounded-lg border border-dashed border-border py-16 text-center">
      <CheckCircle2Icon className="mb-3 h-10 w-10 text-emerald-500/70" />
      <p className="text-sm font-medium text-foreground">
        {hasAlerts ? "No alerts match this filter" : "No active alerts"}
      </p>
      <p className="mt-1 text-xs text-muted-foreground">
        {hasAlerts
          ? "Try selecting a different filter"
          : "Everything looks good. We'll let you know if something needs attention."}
      </p>
    </div>
  )
}
