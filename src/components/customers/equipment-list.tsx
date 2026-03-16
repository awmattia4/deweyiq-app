"use client"

import { useState } from "react"
import { Button } from "@/components/ui/button"
import { AddEquipmentDialog } from "./add-equipment-dialog"
import { Cog, Plus, Wrench, ChevronDownIcon, ChevronUpIcon } from "lucide-react"
import { cn } from "@/lib/utils"
import type { EquipmentHealthResult, EquipmentMetricHealth } from "@/actions/equipment-readings"

// ─── Types ─────────────────────────────────────────────────────────────────────

type EquipmentItem = {
  id: string
  type: string
  brand: string | null
  model: string | null
  install_date: string | null
  notes: string | null
}

type Pool = {
  id: string
  name: string
  type: "pool" | "spa" | "fountain"
  equipment: EquipmentItem[]
}

interface EquipmentListProps {
  pools: Pool[]
  /** Equipment health data keyed by equipment ID. Only present when 6+ readings exist. */
  equipmentHealth?: Record<string, EquipmentHealthResult>
}

// ─── Health Badge ─────────────────────────────────────────────────────────────

const HEALTH_BADGE_STYLES = {
  healthy: {
    container: "bg-green-500/10 border-green-500/30 text-green-400",
    label: "Healthy",
  },
  degraded: {
    container: "bg-amber-500/10 border-amber-500/30 text-amber-400",
    label: "Degraded",
  },
  critical: {
    container: "bg-red-500/10 border-red-500/30 text-red-400",
    label: "Critical",
  },
}

function formatMetricLabel(metricName: string): string {
  switch (metricName) {
    case "salt_ppm": return "Salt"
    case "flow_gpm": return "Flow rate"
    case "rpm": return "RPM"
    case "psi": return "Filter PSI"
    case "delta_f": return "Heater delta"
    default: return metricName.replace(/_/g, " ")
  }
}

function formatMetricUnit(metricName: string): string {
  switch (metricName) {
    case "salt_ppm": return "ppm"
    case "flow_gpm": return "GPM"
    case "rpm": return "RPM"
    case "psi": return "PSI"
    case "delta_f": return "°F"
    default: return ""
  }
}

interface HealthBadgeProps {
  health: EquipmentHealthResult
}

function HealthBadge({ health }: HealthBadgeProps) {
  const [expanded, setExpanded] = useState(false)
  const style = HEALTH_BADGE_STYLES[health.overallStatus]

  // Only show metrics that have data
  const metricsWithData = health.metrics.filter((m) => m.baseline > 0)

  return (
    <div className="flex flex-col gap-1">
      <button
        type="button"
        onClick={() => setExpanded((v) => !v)}
        className={cn(
          "inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[10px] font-medium leading-none cursor-pointer transition-colors",
          style.container
        )}
        title="Click for details"
        aria-expanded={expanded}
      >
        {style.label}
        {expanded ? (
          <ChevronUpIcon className="h-2.5 w-2.5" />
        ) : (
          <ChevronDownIcon className="h-2.5 w-2.5" />
        )}
      </button>

      {/* Expanded metric details */}
      {expanded && metricsWithData.length > 0 && (
        <div className="rounded-lg border border-border/40 bg-muted/10 px-3 py-2 space-y-1.5">
          <p className="text-[10px] text-muted-foreground uppercase tracking-wider font-medium">
            Performance ({health.readingCount} readings)
          </p>
          {metricsWithData.map((metric) => (
            <MetricDetailRow key={metric.metricName} metric={metric} />
          ))}
        </div>
      )}
    </div>
  )
}

function MetricDetailRow({ metric }: { metric: EquipmentMetricHealth }) {
  const unit = formatMetricUnit(metric.metricName)
  const label = formatMetricLabel(metric.metricName)
  const dropPct = Math.abs(metric.dropPct)
  const isImproving = metric.current > metric.baseline

  const statusColor =
    metric.status === "critical"
      ? "text-red-400"
      : metric.status === "degraded"
        ? "text-amber-400"
        : "text-green-400"

  return (
    <div className="flex items-center justify-between gap-2">
      <span className="text-xs text-muted-foreground">{label}</span>
      <div className="flex items-center gap-1.5">
        <span className="text-xs tabular-nums text-foreground">
          {metric.baseline.toFixed(1)}{unit ? ` ${unit}` : ""}
        </span>
        <span className="text-muted-foreground/40 text-xs">→</span>
        <span className={cn("text-xs tabular-nums font-medium", statusColor)}>
          {metric.current.toFixed(1)}{unit ? ` ${unit}` : ""}
        </span>
        {dropPct > 1 && (
          <span className={cn("text-[10px] tabular-nums", statusColor)}>
            ({isImproving ? "+" : "-"}{dropPct.toFixed(0)}%)
          </span>
        )}
      </div>
    </div>
  )
}

// ─── Equipment Row ────────────────────────────────────────────────────────────

function EquipmentRow({
  item,
  health,
}: {
  item: EquipmentItem
  health?: EquipmentHealthResult
}) {
  const brandModel = [item.brand, item.model].filter(Boolean).join(" / ")

  const formattedDate = item.install_date
    ? new Date(item.install_date + "T00:00:00").toLocaleDateString("en-US", {
        month: "short",
        day: "numeric",
        year: "numeric",
      })
    : null

  return (
    <div className="flex flex-col gap-1 py-2 border-b border-border last:border-0">
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-2 min-w-0">
          <Cog className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
          <div className="min-w-0">
            <span className="text-sm font-medium capitalize">{item.type}</span>
            {brandModel && (
              <span className="text-sm text-muted-foreground ml-1.5">— {brandModel}</span>
            )}
          </div>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          {formattedDate && (
            <span className="text-xs text-muted-foreground">{formattedDate}</span>
          )}
        </div>
      </div>
      {/* Health badge — only shown when health data is available */}
      {health && (
        <div className="pl-5">
          <HealthBadge health={health} />
        </div>
      )}
    </div>
  )
}

// ─── Pool Equipment Section ───────────────────────────────────────────────────

function PoolEquipmentSection({
  pool,
  equipmentHealth,
}: {
  pool: Pool
  equipmentHealth?: Record<string, EquipmentHealthResult>
}) {
  const [dialogOpen, setDialogOpen] = useState(false)

  return (
    <div className="flex flex-col gap-2">
      {/* Pool section header */}
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-semibold capitalize">{pool.name}</h3>
        <Button size="sm" variant="outline" onClick={() => setDialogOpen(true)}>
          <Plus className="h-3.5 w-3.5 mr-1" />
          Add
        </Button>
      </div>

      {/* Equipment list or empty state */}
      {pool.equipment.length === 0 ? (
        <p className="text-xs text-muted-foreground py-3 text-center border border-dashed border-border rounded-md">
          No equipment tracked for this pool.
        </p>
      ) : (
        <div className="rounded-md border border-border px-3">
          {pool.equipment.map((item) => (
            <EquipmentRow
              key={item.id}
              item={item}
              health={equipmentHealth?.[item.id]}
            />
          ))}
        </div>
      )}

      {/* Add Equipment dialog for this pool */}
      <AddEquipmentDialog
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        poolId={pool.id}
        poolName={pool.name}
      />
    </div>
  )
}

// ─── Component ────────────────────────────────────────────────────────────────

/**
 * EquipmentList — Equipment tab content showing equipment grouped by pool.
 *
 * Each pool has its own section with a header and compact equipment list.
 * The "+ Add" button per section opens AddEquipmentDialog for that pool.
 *
 * Phase 10: Health badges are shown next to equipment that has 6+ readings.
 * Badges are clickable to show metric details (baseline vs current, % change).
 *
 * Empty state (no pools): guides user to add pools first.
 */
export function EquipmentList({ pools, equipmentHealth }: EquipmentListProps) {
  if (pools.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center gap-3 py-14 text-center rounded-lg border border-dashed border-border">
        <Wrench className="h-8 w-8 text-muted-foreground/50" />
        <div>
          <p className="text-sm font-medium text-muted-foreground">No pools yet</p>
          <p className="text-xs text-muted-foreground/70 mt-1">
            Add pools first, then track equipment for each pool.
          </p>
        </div>
      </div>
    )
  }

  return (
    <div className="flex flex-col gap-6">
      {pools.map((pool) => (
        <PoolEquipmentSection
          key={pool.id}
          pool={pool}
          equipmentHealth={equipmentHealth}
        />
      ))}
    </div>
  )
}
