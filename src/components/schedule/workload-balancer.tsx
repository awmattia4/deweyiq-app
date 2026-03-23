"use client"

import { useState } from "react"
import { Loader2Icon, AlertTriangleIcon, CheckCircle2Icon } from "lucide-react"
import { toast } from "sonner"
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog"
import { Button } from "@/components/ui/button"
import { cn } from "@/lib/utils"
import { toLocalDateString } from "@/lib/date-utils"
import type { WorkloadMetrics, AutoScheduleProposal } from "@/actions/schedule"
import { getWorkloadBalance, autoScheduleWeek, applyAutoSchedule } from "@/actions/schedule"

// ─── Types ─────────────────────────────────────────────────────────────────────

interface WorkloadBalancerProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  weekStartDate: string // YYYY-MM-DD Monday
  /** Called after successful apply — parent should refresh */
  onApplied: () => void
}

type Phase = "balance" | "proposal" | "applying"

// ─── Helpers ───────────────────────────────────────────────────────────────────

/** Format minutes as "Xh Ym" or "Ym" */
function formatMinutes(minutes: number): string {
  if (minutes === 0) return "0 min"
  const h = Math.floor(minutes / 60)
  const m = minutes % 60
  if (h === 0) return `${m} min`
  if (m === 0) return `${h}h`
  return `${h}h ${m}m`
}

/** Short weekday label from YYYY-MM-DD */
function dayLabel(dateStr: string): string {
  const d = new Date(dateStr + "T00:00:00")
  return d.toLocaleDateString("en-US", { weekday: "short" })
}

// ─── TechRow — per-tech workload row ──────────────────────────────────────────

function TechRow({
  metrics,
  weekDates,
  avgStops,
  isImbalanced,
}: {
  metrics: WorkloadMetrics
  weekDates: string[]
  avgStops: number
  isImbalanced: boolean
}) {
  return (
    <div
      className={cn(
        "grid items-center gap-3 rounded-md px-3 py-2.5 text-sm",
        "grid-cols-[1fr_auto_auto]",
        isImbalanced ? "bg-destructive/10 border border-destructive/20" : "bg-muted/30"
      )}
    >
      {/* Name */}
      <div className="min-w-0">
        <p className={cn("font-medium truncate", isImbalanced && "text-destructive")}>{metrics.techName}</p>
        <p className="text-xs text-muted-foreground">{formatMinutes(metrics.estimatedDriveMinutes)} est. drive</p>
      </div>

      {/* Per-day mini grid */}
      <div className="flex gap-1">
        {weekDates.map((d) => {
          const count = metrics.stopsPerDay[d] ?? 0
          return (
            <div key={d} className="flex flex-col items-center gap-0.5">
              <span className="text-[9px] text-muted-foreground leading-none">{dayLabel(d)}</span>
              <span
                className={cn(
                  "flex h-5 w-5 items-center justify-center rounded text-[10px] font-bold",
                  count === 0
                    ? "text-muted-foreground/40 bg-muted/20"
                    : count > avgStops * 1.5
                    ? "bg-destructive/20 text-destructive"
                    : "bg-primary/10 text-primary"
                )}
              >
                {count}
              </span>
            </div>
          )
        })}
      </div>

      {/* Total */}
      <div className="text-right">
        <span
          className={cn(
            "text-sm font-bold",
            isImbalanced ? "text-destructive" : "text-foreground"
          )}
        >
          {metrics.totalStops}
        </span>
        <p className="text-[10px] text-muted-foreground leading-none">stops</p>
      </div>
    </div>
  )
}

// ─── MetricsPanel — list of tech rows with imbalance detection ────────────────

function MetricsPanel({
  metrics,
  weekDates,
  title,
}: {
  metrics: WorkloadMetrics[]
  weekDates: string[]
  title: string
}) {
  const avgStops =
    metrics.length > 0
      ? metrics.reduce((sum, m) => sum + m.totalStops, 0) / metrics.length
      : 0

  return (
    <div className="flex flex-col gap-2">
      <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">{title}</p>
      {metrics.length === 0 ? (
        <p className="text-sm text-muted-foreground italic">No techs assigned this week</p>
      ) : (
        <div className="flex flex-col gap-1.5">
          {metrics.map((m) => {
            const isImbalanced = avgStops > 0 && m.totalStops > avgStops * 1.3
            return (
              <TechRow
                key={m.techId}
                metrics={m}
                weekDates={weekDates}
                avgStops={avgStops}
                isImbalanced={isImbalanced}
              />
            )
          })}
        </div>
      )}
    </div>
  )
}

// ─── WorkloadBalancer ─────────────────────────────────────────────────────────

/**
 * WorkloadBalancer — dialog for viewing workload distribution and applying auto-schedule.
 *
 * Three-phase flow:
 * 1. Balance view: shows current per-tech stop distribution with imbalance highlighting.
 * 2. Proposal view: shows before/after comparison from autoScheduleWeek.
 * 3. Applying: spinner while applyAutoSchedule runs.
 *
 * Office/owner only. Triggered by "Balance Workload" button on Schedule page.
 */
export function WorkloadBalancer({
  open,
  onOpenChange,
  weekStartDate,
  onApplied,
}: WorkloadBalancerProps) {
  const [phase, setPhase] = useState<Phase>("balance")
  const [currentMetrics, setCurrentMetrics] = useState<WorkloadMetrics[] | null>(null)
  const [proposal, setProposal] = useState<AutoScheduleProposal | null>(null)
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // Derive week dates for column headers (Mon–Fri)
  const weekDates = (() => {
    const monday = new Date(weekStartDate + "T00:00:00")
    return Array.from({ length: 5 }, (_, i) => {
      const d = new Date(monday)
      d.setDate(monday.getDate() + i)
      return toLocalDateString(d)
    })
  })()

  // Load balance data when dialog opens
  async function handleOpen(isOpen: boolean) {
    onOpenChange(isOpen)
    if (!isOpen) {
      // Reset state on close
      setPhase("balance")
      setCurrentMetrics(null)
      setProposal(null)
      setError(null)
      return
    }
    // Load balance data on open
    setIsLoading(true)
    setError(null)
    try {
      const result = await getWorkloadBalance(weekStartDate)
      if (result.success) {
        setCurrentMetrics(result.metrics)
      } else {
        setError(result.error ?? "Failed to load workload data")
      }
    } catch {
      setError("Failed to load workload data")
    } finally {
      setIsLoading(false)
    }
  }

  async function handleAutoSchedule() {
    setIsLoading(true)
    setError(null)
    try {
      const result = await autoScheduleWeek(weekStartDate)
      if (result.success && result.proposal) {
        setProposal(result.proposal)
        setPhase("proposal")
      } else {
        setError(result.error ?? "Failed to generate auto-schedule")
      }
    } catch {
      setError("Failed to generate auto-schedule proposal")
    } finally {
      setIsLoading(false)
    }
  }

  async function handleApply() {
    if (!proposal) return
    setPhase("applying")
    setIsLoading(true)
    try {
      const result = await applyAutoSchedule(proposal)
      if (result.success) {
        toast.success(`Auto-schedule applied — ${result.applied} stops updated`)
        onOpenChange(false)
        onApplied()
      } else {
        toast.error(result.error ?? "Failed to apply auto-schedule")
        setPhase("proposal")
      }
    } catch {
      toast.error("An error occurred while applying the schedule")
      setPhase("proposal")
    } finally {
      setIsLoading(false)
    }
  }

  // Determine imbalance for the summary banner
  const avgStops = currentMetrics && currentMetrics.length > 0
    ? currentMetrics.reduce((sum, m) => sum + m.totalStops, 0) / currentMetrics.length
    : 0
  const hasImbalance = currentMetrics?.some((m) => m.totalStops > avgStops * 1.3) ?? false

  return (
    <Dialog open={open} onOpenChange={handleOpen}>
      <DialogContent className="max-w-xl w-full p-0 gap-0 overflow-hidden">
        <DialogHeader className="px-6 pt-6 pb-4 border-b border-border">
          <DialogTitle className="text-base">
            {phase === "balance" ? "Workload Balance" : "Auto-Schedule Proposal"}
          </DialogTitle>
        </DialogHeader>

        <div className="overflow-y-auto max-h-[65vh] px-6 py-4 flex flex-col gap-4">
          {/* ── Loading state ──────────────────────────────────────────── */}
          {isLoading && (
            <div className="flex items-center justify-center gap-2 py-8 text-sm text-muted-foreground">
              <Loader2Icon className="h-4 w-4 animate-spin" />
              {phase === "balance" ? "Loading workload data…" : phase === "proposal" ? "Generating proposal…" : "Applying schedule…"}
            </div>
          )}

          {/* ── Error state ──────────────────────────────────────────── */}
          {error && !isLoading && (
            <div className="flex items-start gap-2.5 rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2.5 text-sm text-destructive">
              <AlertTriangleIcon className="h-4 w-4 shrink-0 mt-0.5" />
              <span>{error}</span>
            </div>
          )}

          {/* ── Balance phase ──────────────────────────────────────────── */}
          {!isLoading && !error && phase === "balance" && currentMetrics && (
            <>
              {/* Imbalance warning */}
              {hasImbalance && (
                <div className="flex items-start gap-2.5 rounded-md border border-amber-500/30 bg-amber-500/10 px-3 py-2.5 text-sm text-amber-300">
                  <AlertTriangleIcon className="h-4 w-4 shrink-0 mt-0.5 text-amber-400" />
                  <span>
                    Workload is imbalanced — some techs have significantly more stops than others.
                    Use Auto-Schedule to rebalance.
                  </span>
                </div>
              )}

              {/* Balanced notice */}
              {!hasImbalance && currentMetrics.length > 0 && (
                <div className="flex items-start gap-2.5 rounded-md border border-border bg-muted/40 px-3 py-2.5 text-sm text-muted-foreground">
                  <CheckCircle2Icon className="h-4 w-4 shrink-0 mt-0.5 text-emerald-400" />
                  <span>Workload looks balanced. You can still run Auto-Schedule to optimize geographic clustering.</span>
                </div>
              )}

              {/* Metrics table */}
              <MetricsPanel
                metrics={currentMetrics}
                weekDates={weekDates}
                title="Current Distribution"
              />
            </>
          )}

          {/* ── Proposal phase ─────────────────────────────────────────── */}
          {!isLoading && !error && phase === "proposal" && proposal && (
            <>
              {/* Summary banner */}
              <div className="rounded-md border border-primary/20 bg-primary/10 px-4 py-3 text-sm">
                <p className="font-semibold text-primary">
                  Proposal ready — {proposal.metrics.totalStopsProposed} stop{proposal.metrics.totalStopsProposed !== 1 ? "s" : ""} assigned
                </p>
                {proposal.metrics.totalUnassignable > 0 && (
                  <p className="text-xs text-muted-foreground mt-0.5">
                    {proposal.metrics.totalUnassignable} stop{proposal.metrics.totalUnassignable !== 1 ? "s" : ""} could not be assigned (no available techs)
                  </p>
                )}
              </div>

              {/* Before/After comparison */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <MetricsPanel
                  metrics={proposal.metrics.before}
                  weekDates={weekDates}
                  title="Current"
                />
                <MetricsPanel
                  metrics={proposal.metrics.after}
                  weekDates={weekDates}
                  title="Proposed"
                />
              </div>

              {/* Change list summary */}
              {proposal.assignments.filter((a) => a.isNew).length > 0 && (
                <div className="flex flex-col gap-1">
                  <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">New Assignments</p>
                  <div className="flex flex-col gap-1 max-h-40 overflow-y-auto">
                    {proposal.assignments.filter((a) => a.isNew).map((a, idx) => (
                      <div key={idx} className="flex items-center gap-2 rounded px-2 py-1.5 bg-muted/30 text-sm">
                        <span className="text-muted-foreground">{dayLabel(a.day)}</span>
                        <span className="font-medium truncate flex-1">{a.customerName}</span>
                        {a.poolName && <span className="text-xs text-muted-foreground">{a.poolName}</span>}
                        <span className="text-xs text-primary font-medium shrink-0">{a.techName}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </>
          )}
        </div>

        {/* ── Footer ─────────────────────────────────────────────────────── */}
        <DialogFooter className="px-6 py-4 border-t border-border">
          <Button
            variant="ghost"
            onClick={() => {
              if (phase === "proposal") {
                setPhase("balance")
                setProposal(null)
              } else {
                onOpenChange(false)
              }
            }}
            disabled={isLoading}
          >
            {phase === "proposal" ? "Back" : "Close"}
          </Button>

          {phase === "balance" && !isLoading && !error && (
            <Button onClick={handleAutoSchedule} disabled={isLoading}>
              Auto-Schedule Week
            </Button>
          )}

          {phase === "proposal" && !isLoading && proposal && (
            <Button onClick={handleApply} disabled={isLoading} className="gap-2">
              Apply Schedule
            </Button>
          )}

          {phase === "applying" && (
            <Button disabled className="gap-2">
              <Loader2Icon className="h-4 w-4 animate-spin" />
              Applying…
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
