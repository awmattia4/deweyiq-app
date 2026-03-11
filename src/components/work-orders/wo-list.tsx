"use client"

import { useState, useTransition } from "react"
import { useRouter } from "next/navigation"
import { cn } from "@/lib/utils"
import type { WorkOrderSummary } from "@/actions/work-orders"

// ─── Constants ────────────────────────────────────────────────────────────────

const CATEGORY_ICONS: Record<string, string> = {
  pump: "⚙️",
  filter: "🔧",
  heater: "🔥",
  plumbing_leak: "💧",
  surface: "🏊",
  electrical: "⚡",
  other: "📋",
}

const STATUS_LABELS: Record<string, string> = {
  draft: "Draft",
  quoted: "Quoted",
  approved: "Approved",
  scheduled: "Scheduled",
  in_progress: "In Progress",
  complete: "Complete",
  invoiced: "Invoiced",
  cancelled: "Cancelled",
}

const STATUS_COLORS: Record<string, string> = {
  draft: "bg-zinc-700 text-zinc-200",
  quoted: "bg-blue-900/60 text-blue-300",
  approved: "bg-green-900/60 text-green-300",
  scheduled: "bg-purple-900/60 text-purple-300",
  in_progress: "bg-amber-900/60 text-amber-300",
  complete: "bg-emerald-900/60 text-emerald-300",
  invoiced: "bg-slate-700 text-slate-300",
  cancelled: "bg-red-900/60 text-red-300",
}

const PRIORITY_COLORS: Record<string, string> = {
  emergency: "bg-red-500 text-white",
  high: "bg-amber-500 text-black",
  normal: "bg-blue-600 text-white",
  low: "bg-zinc-600 text-zinc-200",
}

const PRIORITY_LABELS: Record<string, string> = {
  emergency: "Emergency",
  high: "High",
  normal: "Normal",
  low: "Low",
}

const PRIORITY_BORDER: Record<string, string> = {
  emergency: "border-l-red-500",
  high: "border-l-amber-500",
  normal: "border-l-blue-500",
  low: "border-l-zinc-500",
}

const STATUS_FILTER_OPTIONS = [
  { label: "All Open", value: "open" },
  { label: "Draft", value: "draft" },
  { label: "Quoted", value: "quoted" },
  { label: "Approved", value: "approved" },
  { label: "Scheduled", value: "scheduled" },
  { label: "In Progress", value: "in_progress" },
  { label: "Complete", value: "complete" },
  { label: "Invoiced", value: "invoiced" },
  { label: "Cancelled", value: "cancelled" },
]

const PRIORITY_FILTER_OPTIONS = [
  { label: "All Priorities", value: "all" },
  { label: "Emergency", value: "emergency" },
  { label: "High", value: "high" },
  { label: "Normal", value: "normal" },
  { label: "Low", value: "low" },
]

const OPEN_STATUSES = ["draft", "quoted", "approved", "scheduled", "in_progress"]

// ─── Component ────────────────────────────────────────────────────────────────

interface WoListProps {
  workOrders: WorkOrderSummary[]
}

/**
 * WoList — Client component for the filterable Work Order list.
 *
 * Renders filter chips for status and priority, then a priority-sorted
 * list of WO cards. Entire card is clickable → /work-orders/{id}.
 *
 * Filter state is local (client-side) over pre-fetched server data.
 * "Needs Attention" badge shows count of draft WOs.
 */
export function WoList({ workOrders }: WoListProps) {
  const router = useRouter()
  const [, startTransition] = useTransition()
  const [statusFilter, setStatusFilter] = useState<string>("open")
  const [priorityFilter, setPriorityFilter] = useState<string>("all")

  // Apply filters
  const filtered = workOrders.filter((wo) => {
    const statusMatch =
      statusFilter === "open"
        ? OPEN_STATUSES.includes(wo.status)
        : statusFilter === "all"
          ? true
          : wo.status === statusFilter

    const priorityMatch =
      priorityFilter === "all" ? true : wo.priority === priorityFilter

    return statusMatch && priorityMatch
  })

  // "Needs Attention" count: draft WOs (from tech flags or pending creation)
  const needsAttention = workOrders.filter((wo) => wo.status === "draft").length

  function handleCardClick(id: string) {
    startTransition(() => {
      router.push(`/work-orders/${id}`)
    })
  }

  return (
    <div className="flex flex-col gap-4">
      {/* ── Needs Attention banner ───────────────────────────────────────── */}
      {needsAttention > 0 && (
        <div className="flex items-center gap-2 rounded-lg border border-amber-500/30 bg-amber-500/10 px-3 py-2">
          <span className="h-2 w-2 rounded-full bg-amber-500" />
          <span className="text-sm font-medium text-amber-300">
            {needsAttention} {needsAttention === 1 ? "work order" : "work orders"} need{needsAttention === 1 ? "s" : ""} attention
          </span>
        </div>
      )}

      {/* ── Status filter chips ───────────────────────────────────────────── */}
      <div className="flex flex-wrap gap-2">
        {STATUS_FILTER_OPTIONS.map((chip) => {
          const isActive = statusFilter === chip.value
          const count =
            chip.value === "open"
              ? workOrders.filter((wo) => OPEN_STATUSES.includes(wo.status)).length
              : workOrders.filter((wo) => wo.status === chip.value).length

          return (
            <button
              key={chip.value}
              onClick={() => setStatusFilter(chip.value)}
              className={cn(
                "inline-flex cursor-pointer items-center gap-1.5 rounded-full px-3 py-1 text-xs font-medium transition-colors",
                isActive
                  ? "bg-primary text-primary-foreground"
                  : "bg-muted text-muted-foreground hover:bg-muted/80 hover:text-foreground"
              )}
            >
              {chip.label}
              {count > 0 && (
                <span
                  className={cn(
                    "inline-flex h-4 min-w-4 items-center justify-center rounded-full px-1 text-xs",
                    isActive
                      ? "bg-primary-foreground/20 text-primary-foreground"
                      : "bg-background text-foreground"
                  )}
                >
                  {count}
                </span>
              )}
            </button>
          )
        })}
      </div>

      {/* ── Priority filter chips ─────────────────────────────────────────── */}
      <div className="flex flex-wrap gap-2">
        {PRIORITY_FILTER_OPTIONS.map((chip) => {
          const isActive = priorityFilter === chip.value
          return (
            <button
              key={chip.value}
              onClick={() => setPriorityFilter(chip.value)}
              className={cn(
                "inline-flex cursor-pointer items-center gap-1.5 rounded-full px-3 py-1 text-xs font-medium transition-colors",
                isActive
                  ? "bg-secondary text-secondary-foreground"
                  : "bg-muted/50 text-muted-foreground hover:bg-muted/80 hover:text-foreground"
              )}
            >
              {chip.value !== "all" && (
                <span
                  className={cn(
                    "h-2 w-2 rounded-full",
                    chip.value === "emergency"
                      ? "bg-red-500"
                      : chip.value === "high"
                        ? "bg-amber-500"
                        : chip.value === "normal"
                          ? "bg-blue-500"
                          : "bg-zinc-500"
                  )}
                />
              )}
              {chip.label}
            </button>
          )
        })}
      </div>

      {/* ── WO list ──────────────────────────────────────────────────────── */}
      {filtered.length === 0 ? (
        <EmptyState hasWorkOrders={workOrders.length > 0} />
      ) : (
        <div className="flex flex-col gap-2">
          {filtered.map((wo) => (
            <WoCard key={wo.id} wo={wo} onClick={() => handleCardClick(wo.id)} />
          ))}
        </div>
      )}
    </div>
  )
}

// ─── WO Card ─────────────────────────────────────────────────────────────────

interface WoCardProps {
  wo: WorkOrderSummary
  onClick: () => void
}

function WoCard({ wo, onClick }: WoCardProps) {
  const categoryIcon = CATEGORY_ICONS[wo.category] ?? "📋"
  const statusColor = STATUS_COLORS[wo.status] ?? "bg-zinc-700 text-zinc-200"
  const statusLabel = STATUS_LABELS[wo.status] ?? wo.status
  const priorityColor = PRIORITY_COLORS[wo.priority] ?? PRIORITY_COLORS.normal
  const priorityLabel = PRIORITY_LABELS[wo.priority] ?? wo.priority
  const borderColor = PRIORITY_BORDER[wo.priority] ?? "border-l-zinc-500"

  const createdDate = new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  }).format(new Date(wo.created_at))

  const targetDate = wo.target_date
    ? new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric" }).format(
        new Date(wo.target_date + "T00:00:00")
      )
    : null

  return (
    <button
      onClick={onClick}
      className={cn(
        "group w-full cursor-pointer rounded-lg border border-border bg-card text-left transition-colors hover:bg-card/80 hover:border-border/80",
        "border-l-4",
        borderColor
      )}
    >
      <div className="flex items-start gap-3 p-4">
        {/* Category icon */}
        <span className="mt-0.5 text-lg leading-none" aria-hidden="true">
          {categoryIcon}
        </span>

        {/* Main content */}
        <div className="min-w-0 flex-1">
          {/* Top row: title + status badge */}
          <div className="flex items-start justify-between gap-2">
            <span className="truncate font-medium text-foreground group-hover:text-foreground/90">
              {wo.title}
            </span>
            <span
              className={cn(
                "shrink-0 rounded-full px-2 py-0.5 text-xs font-medium",
                statusColor
              )}
            >
              {statusLabel}
            </span>
          </div>

          {/* Customer + pool */}
          <p className="mt-0.5 truncate text-sm text-muted-foreground">
            {wo.customerName}
            {wo.poolName && (
              <span className="text-muted-foreground/60"> · {wo.poolName}</span>
            )}
          </p>

          {/* Bottom row: priority, tech, dates */}
          <div className="mt-2 flex flex-wrap items-center gap-2">
            <span
              className={cn(
                "rounded-full px-2 py-0.5 text-xs font-semibold",
                priorityColor
              )}
            >
              {priorityLabel}
            </span>

            <span className="text-xs text-muted-foreground">
              {wo.techName ? (
                <span className="text-foreground/70">{wo.techName}</span>
              ) : (
                <span className="italic text-muted-foreground/60">Unassigned</span>
              )}
            </span>

            {targetDate && (
              <span className="text-xs text-muted-foreground">
                Target: <span className="text-foreground/70">{targetDate}</span>
              </span>
            )}

            <span className="ml-auto text-xs text-muted-foreground/60">
              {createdDate}
            </span>
          </div>
        </div>
      </div>
    </button>
  )
}

// ─── Empty state ──────────────────────────────────────────────────────────────

function EmptyState({ hasWorkOrders }: { hasWorkOrders: boolean }) {
  return (
    <div className="flex flex-col items-center justify-center rounded-lg border border-dashed border-border py-16 text-center">
      <span className="text-4xl" aria-hidden="true">🔧</span>
      <p className="mt-3 text-sm font-medium text-foreground">
        {hasWorkOrders ? "No work orders match your filters" : "No work orders yet"}
      </p>
      <p className="mt-1 text-xs text-muted-foreground">
        {hasWorkOrders
          ? "Try adjusting your filters"
          : "Create a work order to get started"}
      </p>
    </div>
  )
}
