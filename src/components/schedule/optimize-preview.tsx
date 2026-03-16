"use client"

import { LockIcon, AlertTriangleIcon, CheckCircle2Icon, Loader2Icon, WrenchIcon, SparklesIcon, ClockIcon } from "lucide-react"
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
import type { OptimizationResult, OptimizedStop } from "@/actions/optimize"
import { applyOptimizedOrder } from "@/actions/optimize"

// ─── Types ────────────────────────────────────────────────────────────────────

interface OptimizePreviewProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  result: OptimizationResult
  techId: string
  date: string
  /** Called after successful apply — parent should refresh stops */
  onApplied: () => void
  isApplying: boolean
  onApplyingChange: (applying: boolean) => void
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

/** Format seconds to a concise human-readable duration string, e.g. "25 min" or "1 hr 5 min" */
function formatDurationSeconds(seconds: number): string {
  const totalMinutes = Math.round(seconds / 60)
  if (totalMinutes < 60) return `${totalMinutes} min`
  const hours = Math.floor(totalMinutes / 60)
  const mins = totalMinutes % 60
  return mins > 0 ? `${hours} hr ${mins} min` : `${hours} hr`
}

// ─── StopRow — a single stop in the before/after column ───────────────────────

function StopRow({
  stop,
  movedFromIndex,
}: {
  stop: OptimizedStop
  /** 0-based index this stop was in the current (before) order, or undefined if it didn't move */
  movedFromIndex?: number
}) {
  const hasMoved = movedFromIndex !== undefined && movedFromIndex !== stop.sortIndex - 1

  return (
    <div
      className={cn(
        "flex items-start gap-2 rounded-md px-2.5 py-2 text-sm transition-colors",
        hasMoved ? "bg-primary/10 border border-primary/20" : "bg-transparent"
      )}
    >
      {/* Position number badge */}
      <span
        className={cn(
          "flex h-5 w-5 shrink-0 items-center justify-center rounded-full text-[10px] font-bold mt-0.5",
          hasMoved
            ? "bg-primary/20 text-primary"
            : "bg-muted text-muted-foreground"
        )}
      >
        {stop.sortIndex}
      </span>

      {/* Stop name, address, and service duration */}
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-1.5">
          <p className={cn("truncate font-medium", hasMoved && "text-foreground")}>
            {stop.customerName}
          </p>
          {stop.workOrderId && (
            <span className="inline-flex shrink-0 items-center gap-0.5 rounded-full bg-amber-500/15 border border-amber-500/30 px-1.5 py-0 text-[9px] font-medium text-amber-300 leading-relaxed">
              <WrenchIcon className="h-2.5 w-2.5" />
              WO
            </span>
          )}
          {stop.locked && (
            <LockIcon className="h-3 w-3 shrink-0 text-amber-400" aria-label="locked" />
          )}
        </div>
        {stop.workOrderTitle && (
          <p className="text-xs font-medium text-amber-300/70 truncate leading-snug">
            {stop.workOrderTitle}
          </p>
        )}
        {stop.address && (
          <p className="truncate text-xs text-muted-foreground">{stop.address}</p>
        )}
        {/* Per-stop service duration — historical in normal text, estimated in muted italic */}
        <div className="flex items-center gap-1 mt-0.5">
          <ClockIcon className="h-2.5 w-2.5 shrink-0 text-muted-foreground/60" />
          <span
            className={cn(
              "text-[10px] leading-none",
              stop.hasHistoricalDuration
                ? "text-muted-foreground"
                : "text-muted-foreground/50 italic"
            )}
          >
            {formatDurationSeconds(stop.serviceDurationSeconds)}
            {!stop.hasHistoricalDuration && " est."}
          </span>
        </div>
        {stop.locked && (
          <p className="text-[10px] text-amber-400/80 font-medium">locked</p>
        )}
      </div>
    </div>
  )
}

// ─── RouteTimeDisplay — drive + total time stats for a column ─────────────────

function RouteTimeDisplay({
  driveMinutes,
  totalMinutes,
  highlight,
}: {
  driveMinutes: number
  totalMinutes: number
  highlight?: "good" | "neutral"
}) {
  return (
    <div className="flex flex-col gap-0.5 mt-1.5">
      <div
        className={cn(
          "flex items-center gap-1.5 rounded-md px-2.5 py-1 text-xs font-medium",
          highlight === "good"
            ? "bg-emerald-500/10 text-emerald-400"
            : "bg-muted/50 text-muted-foreground"
        )}
      >
        <span>Drive:</span>
        <span className={cn("font-bold", highlight === "good" ? "text-emerald-400" : "text-foreground")}>
          {driveMinutes} min
        </span>
      </div>
      <div
        className={cn(
          "flex items-center gap-1.5 rounded-md px-2.5 py-1 text-xs font-medium",
          highlight === "good"
            ? "bg-emerald-500/10 text-emerald-400"
            : "bg-muted/40 text-muted-foreground"
        )}
      >
        <span>Total route:</span>
        <span className={cn("font-bold", highlight === "good" ? "text-emerald-400" : "text-foreground")}>
          {totalMinutes} min
        </span>
      </div>
    </div>
  )
}

// ─── OptimizePreview ──────────────────────────────────────────────────────────

/**
 * OptimizePreview — before/after route optimization comparison modal.
 *
 * Shows current stop order vs. ORS-optimized order side-by-side,
 * with drive time + total route time saved. Office can click "Apply Changes"
 * to persist the optimized order or "Cancel" to reject it.
 *
 * The "AI-Optimized" badge appears when historical service durations were
 * available for >= 50% of stops (real data, not just defaults).
 * Per-stop service duration is shown next to each stop — historical in normal
 * text, estimated (default) in muted italic with "est." suffix.
 *
 * Locked stops display with a lock icon in both columns and are not
 * highlighted as moved (they stay in position by design).
 */
export function OptimizePreview({
  open,
  onOpenChange,
  result,
  techId,
  date,
  onApplied,
  isApplying,
  onApplyingChange,
}: OptimizePreviewProps) {
  // Build a map of stopId → 0-based index in the current order for moved detection
  const currentIndexById = new Map(
    result.currentOrder.map((stop, idx) => [stop.id, idx])
  )

  // Determine if any stops actually moved (some optimizations are no-ops)
  const anyMoved = result.optimizedOrder.some(
    (stop, idx) => currentIndexById.get(stop.id) !== idx
  )

  // Drive time reduction percentage for the percentage badge
  const driveReductionPercent =
    result.currentDriveTimeMinutes > 0
      ? Math.round((result.timeSavedMinutes / result.currentDriveTimeMinutes) * 100)
      : 0

  async function handleApply() {
    onApplyingChange(true)
    try {
      const optimizedIds = result.optimizedOrder.map((s) => s.id)
      const applyResult = await applyOptimizedOrder(techId, date, optimizedIds)

      if (applyResult.success) {
        const savedText =
          result.timeSavedMinutes > 0
            ? ` Saved ${result.timeSavedMinutes} min of driving.`
            : ""
        toast.success(`Route optimized!${savedText}`)
        onOpenChange(false)
        onApplied()
      } else {
        toast.error(applyResult.error ?? "Failed to apply optimized route")
      }
    } catch {
      toast.error("An error occurred while applying the optimized route")
    } finally {
      onApplyingChange(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl w-full p-0 gap-0 overflow-hidden">
        <DialogHeader className="px-6 pt-6 pb-4 border-b border-border">
          <div className="flex items-center justify-between gap-3">
            <DialogTitle className="text-base">Route Optimization Preview</DialogTitle>
            {/* AI-Optimized / Standard Optimization badge */}
            {result.usedHistoricalDurations ? (
              <span className="inline-flex shrink-0 items-center gap-1.5 rounded-full bg-primary/15 border border-primary/25 px-2.5 py-1 text-[11px] font-semibold text-primary">
                <SparklesIcon className="h-3 w-3" />
                AI-Optimized
              </span>
            ) : (
              <span className="inline-flex shrink-0 items-center gap-1 rounded-full bg-muted/60 border border-border px-2.5 py-1 text-[11px] font-medium text-muted-foreground">
                Standard Optimization
              </span>
            )}
          </div>
          {/* Historical coverage note when using AI */}
          {result.usedHistoricalDurations && (
            <p className="text-xs text-muted-foreground mt-1">
              Service durations based on historical visit data for{" "}
              {Math.round(result.historicalCoverage * 100)}% of stops.
            </p>
          )}
        </DialogHeader>

        {/* ── Missing coordinates warning ──────────────────────────────── */}
        {result.stopsWithoutCoordinates > 0 && (
          <div className="flex items-start gap-2.5 mx-6 mt-4 rounded-md border border-amber-500/30 bg-amber-500/10 px-3 py-2.5 text-sm text-amber-300">
            <AlertTriangleIcon className="h-4 w-4 shrink-0 mt-0.5 text-amber-400" />
            <span>
              <strong>{result.stopsWithoutCoordinates}</strong> stop
              {result.stopsWithoutCoordinates !== 1 ? "s have" : " has"} no coordinates
              and {result.stopsWithoutCoordinates !== 1 ? "were" : "was"} excluded from
              optimization. Add geocoded addresses to customers to include them.
            </span>
          </div>
        )}

        {/* ── No change notice ──────────────────────────────────────────── */}
        {!anyMoved && result.timeSavedMinutes === 0 && (
          <div className="flex items-start gap-2.5 mx-6 mt-4 rounded-md border border-border bg-muted/40 px-3 py-2.5 text-sm text-muted-foreground">
            <CheckCircle2Icon className="h-4 w-4 shrink-0 mt-0.5 text-emerald-400" />
            <span>Your route is already optimally ordered — no changes needed.</span>
          </div>
        )}

        {/* ── Side-by-side columns ──────────────────────────────────────── */}
        <div className="grid grid-cols-1 sm:grid-cols-2 divide-y sm:divide-y-0 sm:divide-x divide-border overflow-y-auto max-h-[50vh] sm:max-h-[55vh]">
          {/* Current order column */}
          <div className="flex flex-col">
            <div className="sticky top-0 z-10 border-b border-border bg-muted/40 px-4 py-3">
              <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                Current Order
              </p>
              <RouteTimeDisplay
                driveMinutes={result.currentDriveTimeMinutes}
                totalMinutes={result.currentTotalTimeMinutes}
                highlight="neutral"
              />
            </div>
            <div className="flex flex-col gap-0.5 p-3">
              {result.currentOrder.map((stop, idx) => (
                <StopRow key={stop.id} stop={stop} movedFromIndex={idx} />
              ))}
            </div>
          </div>

          {/* Optimized order column */}
          <div className="flex flex-col">
            <div className="sticky top-0 z-10 border-b border-border bg-muted/40 px-4 py-3">
              <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                Optimized Order
              </p>
              <RouteTimeDisplay
                driveMinutes={result.optimizedDriveTimeMinutes}
                totalMinutes={result.optimizedTotalTimeMinutes}
                highlight={result.timeSavedMinutes > 0 ? "good" : "neutral"}
              />
            </div>
            <div className="flex flex-col gap-0.5 p-3">
              {result.optimizedOrder.map((stop) => (
                <StopRow
                  key={stop.id}
                  stop={stop}
                  movedFromIndex={currentIndexById.get(stop.id)}
                />
              ))}
            </div>
          </div>
        </div>

        {/* ── Time saved banner ─────────────────────────────────────────── */}
        {result.timeSavedMinutes > 0 && (
          <div className="border-t border-border bg-emerald-500/10 px-6 py-3 text-center">
            <p className="text-sm font-semibold text-emerald-400">
              {result.timeSavedMinutes} minute
              {result.timeSavedMinutes !== 1 ? "s" : ""} saved on driving
              {driveReductionPercent > 0 && (
                <span className="ml-1.5 inline-flex items-center rounded-full bg-emerald-500/20 px-2 py-0.5 text-xs font-bold text-emerald-300">
                  {driveReductionPercent}% faster route
                </span>
              )}
            </p>
          </div>
        )}

        {/* ── Footer ───────────────────────────────────────────────────── */}
        <DialogFooter className="px-6 py-4 border-t border-border">
          <Button
            variant="ghost"
            onClick={() => onOpenChange(false)}
            disabled={isApplying}
          >
            Cancel
          </Button>
          <Button
            onClick={handleApply}
            disabled={isApplying || !anyMoved}
            className="gap-2"
          >
            {isApplying && <Loader2Icon className="h-4 w-4 animate-spin" />}
            {isApplying ? "Applying…" : "Apply Changes"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
