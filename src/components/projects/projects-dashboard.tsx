"use client"

import { useState } from "react"
import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"
import { PipelineKanban } from "@/components/projects/pipeline-kanban"
import { PipelineList } from "@/components/projects/pipeline-list"
import { CreateProjectDialog } from "@/components/projects/create-project-dialog"
import { PROJECT_STAGE_LABELS } from "@/lib/projects-constants"
import type { ProjectSummary, PipelineMetrics, ProjectTemplate } from "@/actions/projects"
import { KanbanSquareIcon, ListIcon, PlusIcon } from "lucide-react"
import { cn } from "@/lib/utils"

// ---------------------------------------------------------------------------
// MetricCard helper
// ---------------------------------------------------------------------------

function MetricCard({
  label,
  value,
  sublabel,
  highlight,
}: {
  label: string
  value: string | number | null
  sublabel?: string
  highlight?: boolean
}) {
  return (
    <Card className="min-w-[130px]">
      <CardContent className="p-4">
        <div className="flex flex-col gap-1">
          <span className="text-xs text-muted-foreground">{label}</span>
          <span
            className={cn(
              "text-2xl font-bold tracking-tight",
              highlight && "text-amber-500"
            )}
          >
            {value ?? "—"}
          </span>
          {sublabel && <span className="text-xs text-muted-foreground">{sublabel}</span>}
        </div>
      </CardContent>
    </Card>
  )
}

// ---------------------------------------------------------------------------
// ProjectsDashboard
// ---------------------------------------------------------------------------

interface ProjectsDashboardProps {
  initialProjects: ProjectSummary[]
  metrics: PipelineMetrics | null
  templates: ProjectTemplate[]
}

export function ProjectsDashboard({
  initialProjects,
  metrics,
  templates,
}: ProjectsDashboardProps) {
  const [view, setView] = useState<"kanban" | "list">("kanban")
  const [createOpen, setCreateOpen] = useState(false)
  const [projects, setProjects] = useState<ProjectSummary[]>(initialProjects)

  function handleProjectCreated(project: ProjectSummary) {
    setProjects((prev) => [project, ...prev])
  }

  return (
    <div className="flex flex-col gap-6">
      {/* Page header */}
      <div className="flex items-center justify-between gap-4">
        <h1 className="text-2xl font-bold tracking-tight">Projects</h1>
        <div className="flex items-center gap-2">
          {/* View toggle */}
          <div className="flex items-center rounded-md border border-border bg-muted/30 p-0.5">
            <button
              type="button"
              onClick={() => setView("kanban")}
              className={cn(
                "flex items-center gap-1.5 rounded px-2.5 py-1 text-xs font-medium transition-colors",
                view === "kanban"
                  ? "bg-background text-foreground shadow-sm"
                  : "text-muted-foreground hover:text-foreground"
              )}
            >
              <KanbanSquareIcon className="h-3.5 w-3.5" />
              Kanban
            </button>
            <button
              type="button"
              onClick={() => setView("list")}
              className={cn(
                "flex items-center gap-1.5 rounded px-2.5 py-1 text-xs font-medium transition-colors",
                view === "list"
                  ? "bg-background text-foreground shadow-sm"
                  : "text-muted-foreground hover:text-foreground"
              )}
            >
              <ListIcon className="h-3.5 w-3.5" />
              List
            </button>
          </div>

          <Button size="sm" onClick={() => setCreateOpen(true)}>
            <PlusIcon className="h-4 w-4" />
            New Project
          </Button>
        </div>
      </div>

      {/* Pipeline metrics */}
      {metrics && (
        <div className="flex flex-wrap gap-3">
          <MetricCard
            label="Active Projects"
            value={metrics.totalActive}
          />
          <MetricCard
            label="Stalled"
            value={metrics.stalledCount}
            sublabel="> 14 days in stage"
            highlight={metrics.stalledCount > 0}
          />
          {metrics.avgDaysLeadToClose !== null && (
            <MetricCard
              label="Avg Lead to Close"
              value={`${metrics.avgDaysLeadToClose}d`}
            />
          )}
          {metrics.leadToCloseConversionRate !== null && (
            <MetricCard
              label="Conversion Rate"
              value={`${metrics.leadToCloseConversionRate}%`}
              sublabel="leads reaching deposit"
            />
          )}

          {/* Top 3 stage counts */}
          {(["lead", "in_progress", "punch_list"] as const).map((stage) => {
            const cnt = metrics.stageCounts[stage] ?? 0
            if (cnt === 0) return null
            return (
              <MetricCard
                key={stage}
                label={PROJECT_STAGE_LABELS[stage]}
                value={cnt}
              />
            )
          })}
        </div>
      )}

      {/* Main content */}
      {projects.length === 0 ? (
        <div className="flex flex-col items-center justify-center gap-3 rounded-lg border border-dashed border-border bg-muted/20 py-16 text-center">
          <p className="text-sm text-muted-foreground">No projects yet.</p>
          <Button size="sm" variant="outline" onClick={() => setCreateOpen(true)}>
            <PlusIcon className="h-4 w-4" />
            Create your first project
          </Button>
        </div>
      ) : view === "kanban" ? (
        <PipelineKanban initialProjects={projects} />
      ) : (
        <PipelineList projects={projects} />
      )}

      {/* Create project dialog */}
      <CreateProjectDialog
        open={createOpen}
        onClose={() => setCreateOpen(false)}
        templates={templates}
        onCreated={handleProjectCreated}
      />
    </div>
  )
}
