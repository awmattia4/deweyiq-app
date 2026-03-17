"use client"

import Link from "next/link"
import { Badge } from "@/components/ui/badge"
import { PROJECT_TYPE_LABELS, PROJECT_STAGE_LABELS } from "@/lib/projects-constants"
import type { ProjectSummary } from "@/actions/projects"
import { cn } from "@/lib/utils"

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function formatCurrency(amount: string | null): string | null {
  if (!amount) return null
  const num = parseFloat(amount)
  if (isNaN(num)) return null
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(num)
}

function daysLabel(days: number): string {
  if (days === 0) return "Today"
  if (days === 1) return "1 day"
  return `${days} days`
}

// ---------------------------------------------------------------------------
// ProjectCard
// ---------------------------------------------------------------------------

interface ProjectCardProps {
  project: ProjectSummary
  /** When true, the card is being dragged (reduced opacity) */
  isDragging?: boolean
  /** When provided, card renders as a div with this ref instead of a Link */
  dragHandleRef?: React.Ref<HTMLDivElement>
  style?: React.CSSProperties
  className?: string
}

export function ProjectCard({
  project,
  isDragging = false,
  style,
  className,
  dragHandleRef,
}: ProjectCardProps) {
  const typeLabel = PROJECT_TYPE_LABELS[project.project_type] ?? project.project_type
  const formattedAmount = formatCurrency(project.contract_amount)
  const isOnHold = project.status === "on_hold"
  const stageLabel = PROJECT_STAGE_LABELS[project.stage] ?? project.stage

  const content = (
    <div
      className={cn(
        "group flex flex-col gap-2 rounded-lg border border-border bg-card p-3 shadow-sm transition-shadow",
        "hover:shadow-md cursor-pointer",
        isDragging && "opacity-50 shadow-lg",
        className
      )}
      style={style}
    >
      {/* Header: name + on-hold badge */}
      <div className="flex items-start justify-between gap-2">
        <span className="font-medium text-sm leading-snug line-clamp-2">{project.name}</span>
        {isOnHold && (
          <Badge
            variant="outline"
            className="shrink-0 text-xs border-amber-500/40 text-amber-500 bg-amber-500/10"
          >
            On Hold
          </Badge>
        )}
      </div>

      {/* Customer name */}
      <span className="text-xs text-muted-foreground">{project.customerName}</span>

      {/* Meta row: type + amount */}
      <div className="flex items-center justify-between gap-2">
        <Badge variant="secondary" className="text-xs">
          {typeLabel}
        </Badge>
        {formattedAmount && (
          <span className="text-xs font-medium text-foreground">{formattedAmount}</span>
        )}
      </div>

      {/* Days in stage */}
      <div className="flex items-center justify-between text-xs text-muted-foreground">
        <span>{daysLabel(project.days_in_stage)} in stage</span>
        {project.project_number && (
          <span className="font-mono text-[10px]">{project.project_number}</span>
        )}
      </div>
    </div>
  )

  if (dragHandleRef) {
    return (
      <div ref={dragHandleRef} style={style}>
        {content}
      </div>
    )
  }

  return (
    <Link href={`/projects/${project.id}`} className="block">
      {content}
    </Link>
  )
}
