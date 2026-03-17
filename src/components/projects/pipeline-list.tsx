"use client"

import { useState, useMemo } from "react"
import Link from "next/link"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { PROJECT_STAGE_LABELS, PROJECT_TYPE_LABELS, PROJECT_STAGES } from "@/lib/projects-constants"
import type { ProjectSummary } from "@/actions/projects"
import { cn } from "@/lib/utils"
import { ArrowUpDownIcon } from "lucide-react"

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function formatCurrency(amount: string | null): string {
  if (!amount) return "—"
  const num = parseFloat(amount)
  if (isNaN(num)) return "—"
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(num)
}

type SortField = "name" | "customerName" | "project_type" | "stage" | "contract_amount" | "days_in_stage" | "status"
type SortDir = "asc" | "desc"

// ---------------------------------------------------------------------------
// PipelineList
// ---------------------------------------------------------------------------

interface PipelineListProps {
  projects: ProjectSummary[]
}

export function PipelineList({ projects }: PipelineListProps) {
  const [stageFilter, setStageFilter] = useState<string>("all")
  const [typeFilter, setTypeFilter] = useState<string>("all")
  const [statusFilter, setStatusFilter] = useState<string>("all")
  const [sortField, setSortField] = useState<SortField>("days_in_stage")
  const [sortDir, setSortDir] = useState<SortDir>("desc")

  function handleSort(field: SortField) {
    if (sortField === field) {
      setSortDir((d) => (d === "asc" ? "desc" : "asc"))
    } else {
      setSortField(field)
      setSortDir("asc")
    }
  }

  const filtered = useMemo(() => {
    let result = [...projects]

    if (stageFilter !== "all") result = result.filter((p) => p.stage === stageFilter)
    if (typeFilter !== "all") result = result.filter((p) => p.project_type === typeFilter)
    if (statusFilter !== "all") result = result.filter((p) => p.status === statusFilter)

    result.sort((a, b) => {
      let aVal: string | number = ""
      let bVal: string | number = ""

      switch (sortField) {
        case "name":
          aVal = a.name.toLowerCase()
          bVal = b.name.toLowerCase()
          break
        case "customerName":
          aVal = a.customerName.toLowerCase()
          bVal = b.customerName.toLowerCase()
          break
        case "project_type":
          aVal = a.project_type
          bVal = b.project_type
          break
        case "stage":
          aVal = PROJECT_STAGES.indexOf(a.stage as (typeof PROJECT_STAGES)[number])
          bVal = PROJECT_STAGES.indexOf(b.stage as (typeof PROJECT_STAGES)[number])
          break
        case "contract_amount":
          aVal = parseFloat(a.contract_amount ?? "0") || 0
          bVal = parseFloat(b.contract_amount ?? "0") || 0
          break
        case "days_in_stage":
          aVal = a.days_in_stage
          bVal = b.days_in_stage
          break
        case "status":
          aVal = a.status
          bVal = b.status
          break
      }

      if (aVal < bVal) return sortDir === "asc" ? -1 : 1
      if (aVal > bVal) return sortDir === "asc" ? 1 : -1
      return 0
    })

    return result
  }, [projects, stageFilter, typeFilter, statusFilter, sortField, sortDir])

  // Unique project types in data
  const uniqueTypes = useMemo(() => {
    const types = new Set(projects.map((p) => p.project_type))
    return Array.from(types)
  }, [projects])

  return (
    <div className="flex flex-col gap-4">
      {/* Filters row */}
      <div className="flex flex-wrap items-center gap-2">
        <Select value={stageFilter} onValueChange={setStageFilter}>
          <SelectTrigger className="h-8 w-[160px] text-xs">
            <SelectValue placeholder="All Stages" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Stages</SelectItem>
            {PROJECT_STAGES.map((stage) => (
              <SelectItem key={stage} value={stage}>
                {PROJECT_STAGE_LABELS[stage]}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        <Select value={typeFilter} onValueChange={setTypeFilter}>
          <SelectTrigger className="h-8 w-[140px] text-xs">
            <SelectValue placeholder="All Types" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Types</SelectItem>
            {uniqueTypes.map((type) => (
              <SelectItem key={type} value={type}>
                {PROJECT_TYPE_LABELS[type] ?? type}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        <Select value={statusFilter} onValueChange={setStatusFilter}>
          <SelectTrigger className="h-8 w-[130px] text-xs">
            <SelectValue placeholder="All Statuses" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Statuses</SelectItem>
            <SelectItem value="active">Active</SelectItem>
            <SelectItem value="on_hold">On Hold</SelectItem>
            <SelectItem value="cancelled">Cancelled</SelectItem>
            <SelectItem value="complete">Complete</SelectItem>
          </SelectContent>
        </Select>

        {(stageFilter !== "all" || typeFilter !== "all" || statusFilter !== "all") && (
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="h-8 text-xs text-muted-foreground"
            onClick={() => {
              setStageFilter("all")
              setTypeFilter("all")
              setStatusFilter("all")
            }}
          >
            Clear filters
          </Button>
        )}

        <span className="ml-auto text-xs text-muted-foreground">
          {filtered.length} project{filtered.length !== 1 ? "s" : ""}
        </span>
      </div>

      {/* Table */}
      {filtered.length === 0 ? (
        <p className="text-sm text-muted-foreground italic py-4">No projects match the selected filters.</p>
      ) : (
        <div className="overflow-x-auto rounded-lg border border-border">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border bg-muted/30">
                <SortableHeader field="name" label="Project" current={sortField} dir={sortDir} onSort={handleSort} />
                <SortableHeader field="customerName" label="Customer" current={sortField} dir={sortDir} onSort={handleSort} />
                <SortableHeader field="project_type" label="Type" current={sortField} dir={sortDir} onSort={handleSort} />
                <SortableHeader field="stage" label="Stage" current={sortField} dir={sortDir} onSort={handleSort} />
                <SortableHeader field="contract_amount" label="Amount" current={sortField} dir={sortDir} onSort={handleSort} />
                <SortableHeader field="days_in_stage" label="Days in Stage" current={sortField} dir={sortDir} onSort={handleSort} />
                <SortableHeader field="status" label="Status" current={sortField} dir={sortDir} onSort={handleSort} />
              </tr>
            </thead>
            <tbody>
              {filtered.map((project) => (
                <ProjectRow key={project.id} project={project} />
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}

// ---------------------------------------------------------------------------
// SortableHeader
// ---------------------------------------------------------------------------

interface SortableHeaderProps {
  field: SortField
  label: string
  current: SortField
  dir: SortDir
  onSort: (field: SortField) => void
}

function SortableHeader({ field, label, current, dir, onSort }: SortableHeaderProps) {
  const isActive = current === field
  return (
    <th className="px-4 py-2.5 text-left text-xs font-medium text-muted-foreground whitespace-nowrap">
      <button
        type="button"
        className="flex items-center gap-1 hover:text-foreground transition-colors"
        onClick={() => onSort(field)}
      >
        {label}
        <ArrowUpDownIcon
          className={cn("h-3 w-3", isActive ? "text-foreground" : "text-muted-foreground/40")}
        />
      </button>
    </th>
  )
}

// ---------------------------------------------------------------------------
// ProjectRow
// ---------------------------------------------------------------------------

function ProjectRow({ project }: { project: ProjectSummary }) {
  const isOnHold = project.status === "on_hold"

  return (
    <tr className="border-b border-border/50 hover:bg-muted/30 transition-colors">
      <td className="px-4 py-3">
        <Link
          href={`/projects/${project.id}`}
          className="font-medium hover:text-primary transition-colors"
        >
          <div className="flex flex-col gap-0.5">
            <span>{project.name}</span>
            {project.project_number && (
              <span className="text-[10px] font-mono text-muted-foreground">
                {project.project_number}
              </span>
            )}
          </div>
        </Link>
      </td>
      <td className="px-4 py-3 text-muted-foreground">{project.customerName}</td>
      <td className="px-4 py-3">
        <Badge variant="secondary" className="text-xs">
          {PROJECT_TYPE_LABELS[project.project_type] ?? project.project_type}
        </Badge>
      </td>
      <td className="px-4 py-3 text-sm">
        {PROJECT_STAGE_LABELS[project.stage] ?? project.stage}
      </td>
      <td className="px-4 py-3 text-sm font-medium">
        {formatCurrency(project.contract_amount)}
      </td>
      <td className="px-4 py-3 text-sm text-muted-foreground">
        {project.days_in_stage === 0
          ? "Today"
          : `${project.days_in_stage}d`}
      </td>
      <td className="px-4 py-3">
        {isOnHold ? (
          <Badge
            variant="outline"
            className="text-xs border-amber-500/40 text-amber-500 bg-amber-500/10"
          >
            On Hold
          </Badge>
        ) : (
          <Badge variant="outline" className="text-xs capitalize">
            {project.status}
          </Badge>
        )}
      </td>
    </tr>
  )
}
