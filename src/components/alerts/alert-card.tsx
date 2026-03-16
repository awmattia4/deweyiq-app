"use client"

import { useState, useTransition } from "react"
import { useRouter } from "next/navigation"
import Link from "next/link"
import { XIcon, ClockIcon, TrendingDownIcon, TrendingUpIcon } from "lucide-react"
import { toast } from "sonner"
import { cn } from "@/lib/utils"
import { Button } from "@/components/ui/button"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { dismissAlert, snoozeAlert } from "@/actions/alerts"
import type { Alert } from "@/lib/alerts/constants"
import { SNOOZE_OPTIONS } from "@/lib/alerts/constants"

// ─── Relative time helper ─────────────────────────────────────────────────────

function formatRelativeTime(date: Date): string {
  const now = Date.now()
  const diffMs = now - date.getTime()
  const diffMins = Math.floor(diffMs / 60000)
  const diffHours = Math.floor(diffMs / 3600000)
  const diffDays = Math.floor(diffMs / 86400000)

  if (diffMins < 1) return "just now"
  if (diffMins < 60) return `${diffMins} minute${diffMins === 1 ? "" : "s"} ago`
  if (diffHours < 24) return `${diffHours} hour${diffHours === 1 ? "" : "s"} ago`
  if (diffDays < 30) return `${diffDays} day${diffDays === 1 ? "" : "s"} ago`
  return date.toLocaleDateString("en-US", { month: "short", day: "numeric" })
}

// ─── Predictive chemistry detail ──────────────────────────────────────────────

interface PredictiveMetadata {
  parameter: string
  slope: number
  rSquared: number
  projectedNext: number
  visitCount: number
  isEarlyPrediction: boolean
  direction: "low" | "high"
  customerId: string
  poolName: string
  customerName: string
  targetMin: number | null
  targetMax: number | null
  unit: string
}

function PredictiveChemistryDetail({ metadata }: { metadata: PredictiveMetadata }) {
  const TrendIcon = metadata.direction === "low" ? TrendingDownIcon : TrendingUpIcon
  const trendColor = metadata.direction === "low" ? "text-blue-400" : "text-orange-400"

  return (
    <div className="mt-2 flex flex-col gap-1.5">
      {/* Trend icon + projected value */}
      <div className="flex items-center gap-2 text-xs text-muted-foreground">
        <TrendIcon className={cn("h-3.5 w-3.5 shrink-0", trendColor)} aria-hidden="true" />
        <span>
          Projected next:{" "}
          <span className={cn("font-medium", trendColor)}>
            {metadata.projectedNext.toFixed(1)}
            {metadata.unit ? ` ${metadata.unit}` : ""}
          </span>
          {(metadata.targetMin != null || metadata.targetMax != null) && (
            <span className="text-muted-foreground/60 ml-1">
              (target: {metadata.targetMin ?? ""}–{metadata.targetMax ?? ""}{metadata.unit ? ` ${metadata.unit}` : ""})
            </span>
          )}
        </span>
      </div>

      {/* Early prediction disclaimer */}
      {metadata.isEarlyPrediction && (
        <div className="inline-flex items-center gap-1 rounded-md bg-blue-500/10 border border-blue-500/20 px-2 py-0.5 w-fit">
          <span className="text-[10px] text-blue-400 font-medium">
            Early prediction — accuracy improves with more data ({metadata.visitCount} visits)
          </span>
        </div>
      )}
    </div>
  )
}

// ─── Severity indicator ────────────────────────────────────────────────────────

function SeverityDot({ severity }: { severity: Alert["severity"] }) {
  return (
    <span
      className={cn(
        "mt-1 h-2.5 w-2.5 shrink-0 rounded-full",
        severity === "critical" && "bg-red-500",
        severity === "warning" && "bg-amber-500",
        severity === "info" && "bg-blue-500"
      )}
      aria-label={severity}
    />
  )
}

// ─── Alert label ──────────────────────────────────────────────────────────────

function AlertTypeLabel({ alertType }: { alertType: Alert["alert_type"] }) {
  const config: Record<string, { label: string; className: string }> = {
    missed_stop: { label: "Missed Stop", className: "text-red-400" },
    declining_chemistry: { label: "Declining Chemistry", className: "text-amber-400" },
    incomplete_data: { label: "Incomplete Data", className: "text-blue-400" },
    work_order_flagged: { label: "Issue Flagged", className: "text-amber-400" },
    unprofitable_pool: { label: "Unprofitable Pool", className: "text-orange-400" },
    equipment_degradation: { label: "Equipment", className: "text-amber-400" },
    predictive_chemistry: { label: "Predictive Trend", className: "text-violet-400" },
  }
  const { label, className } = config[alertType] ?? { label: alertType, className: "text-muted-foreground" }

  return (
    <span className={cn("text-xs font-medium", className)}>
      {label}
    </span>
  )
}

// ─── Component ────────────────────────────────────────────────────────────────

interface AlertCardProps {
  alert: Alert
}

/**
 * AlertCard — Individual alert card with dismiss and snooze actions.
 *
 * Dismiss: permanently removes the alert from the active list.
 * Snooze: hides it for a chosen duration (1h, 4h, 1d, 1w).
 *
 * Uses router.refresh() after server action to pull updated data
 * without a full page reload.
 */
export function AlertCard({ alert }: AlertCardProps) {
  const router = useRouter()
  const [isDismissing, startDismiss] = useTransition()
  const [isSnoozingOption, setSnoozingOption] = useState<string | null>(null)

  const relativeTime = formatRelativeTime(new Date(alert.generated_at))

  function handleDismiss() {
    startDismiss(async () => {
      const result = await dismissAlert(alert.id)
      if (result.success) {
        toast.success("Alert dismissed")
        router.refresh()
      } else {
        toast.error(result.error ?? "Failed to dismiss alert")
      }
    })
  }

  async function handleSnooze(option: (typeof SNOOZE_OPTIONS)[number]) {
    setSnoozingOption(option.label)
    try {
      const result = await snoozeAlert(alert.id, option.ms)
      if (result.success) {
        toast.success(`Alert snoozed for ${option.label}`)
        router.refresh()
      } else {
        toast.error(result.error ?? "Failed to snooze alert")
      }
    } finally {
      setSnoozingOption(null)
    }
  }

  const isActing = isDismissing || isSnoozingOption !== null

  // Extract predictive metadata for enhanced rendering
  const isPredictive = alert.alert_type === "predictive_chemistry"
  const predictiveMeta = isPredictive
    ? (alert.metadata as PredictiveMetadata | null)
    : null

  // Customer link for predictive alerts (navigate to customer profile)
  const customerHref = predictiveMeta?.customerId
    ? `/customers/${predictiveMeta.customerId}`
    : null

  const cardContent = (
    <>
      {/* Severity dot */}
      <SeverityDot severity={alert.severity} />

      {/* Content */}
      <div className="min-w-0 flex-1">
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0">
            <AlertTypeLabel alertType={alert.alert_type} />
            <p className="mt-0.5 text-sm font-medium text-foreground leading-snug">
              {alert.title}
            </p>
            {/* Predictive chemistry: show structured detail instead of plain description */}
            {isPredictive && predictiveMeta ? (
              <PredictiveChemistryDetail metadata={predictiveMeta} />
            ) : alert.description ? (
              <p className="mt-1 text-xs text-muted-foreground line-clamp-2">
                {alert.description}
              </p>
            ) : null}
          </div>

          {/* Actions */}
          <div className="flex shrink-0 items-center gap-1">
            {/* Snooze dropdown */}
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-7 w-7 cursor-pointer text-muted-foreground hover:text-foreground"
                  aria-label="Snooze alert"
                  disabled={isActing}
                >
                  {isSnoozingOption ? (
                    <span className="h-3.5 w-3.5 animate-spin rounded-full border-2 border-muted-foreground border-t-transparent" />
                  ) : (
                    <ClockIcon className="h-3.5 w-3.5" />
                  )}
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-36">
                {SNOOZE_OPTIONS.map((option) => (
                  <DropdownMenuItem
                    key={option.label}
                    onClick={() => handleSnooze(option)}
                    className="cursor-pointer"
                  >
                    {option.label}
                  </DropdownMenuItem>
                ))}
              </DropdownMenuContent>
            </DropdownMenu>

            {/* Dismiss button */}
            <Button
              variant="ghost"
              size="icon"
              className="h-7 w-7 cursor-pointer text-muted-foreground hover:text-foreground"
              aria-label="Dismiss alert"
              onClick={handleDismiss}
              disabled={isActing}
            >
              {isDismissing ? (
                <span className="h-3.5 w-3.5 animate-spin rounded-full border-2 border-muted-foreground border-t-transparent" />
              ) : (
                <XIcon className="h-3.5 w-3.5" />
              )}
            </Button>
          </div>
        </div>

        {/* Timestamp */}
        <p className="mt-1.5 text-xs text-muted-foreground/70">{relativeTime}</p>
      </div>
    </>
  )

  // Predictive alerts are wrapped in a link to the customer profile
  if (customerHref) {
    return (
      <Link
        href={customerHref}
        className={cn(
          "group flex items-start gap-3 rounded-lg border border-border bg-card px-4 py-3",
          "transition-colors hover:border-border/80 hover:bg-card/80 cursor-pointer",
          isActing && "pointer-events-none opacity-60"
        )}
      >
        {cardContent}
      </Link>
    )
  }

  return (
    <div
      className={cn(
        "group flex items-start gap-3 rounded-lg border border-border bg-card px-4 py-3",
        "transition-colors hover:border-border/80 hover:bg-card/80",
        isActing && "pointer-events-none opacity-60"
      )}
    >
      {cardContent}
    </div>
  )
}
