"use client"

import { useState, useCallback } from "react"
import {
  DndContext,
  DragOverlay,
  PointerSensor,
  useSensor,
  useSensors,
  closestCenter,
  type DragStartEvent,
  type DragEndEvent,
  type DragOverEvent,
} from "@dnd-kit/core"
import { useDroppable } from "@dnd-kit/core"
import { useDraggable } from "@dnd-kit/core"
import { CSS } from "@dnd-kit/utilities"
import { ProjectCard } from "@/components/projects/project-card"
import { updateProjectStage } from "@/actions/projects"
import { PROJECT_STAGES, PROJECT_STAGE_LABELS } from "@/lib/projects-constants"
import type { ProjectSummary } from "@/actions/projects"
import { cn } from "@/lib/utils"

// ---------------------------------------------------------------------------
// DraggableCard wrapper
// ---------------------------------------------------------------------------

function DraggableCard({ project }: { project: ProjectSummary }) {
  const { attributes, listeners, setNodeRef, transform, isDragging } = useDraggable({
    id: project.id,
    data: { project },
  })

  const style: React.CSSProperties = {
    transform: CSS.Translate.toString(transform),
    opacity: isDragging ? 0.3 : 1,
  }

  return (
    <div ref={setNodeRef} style={style} {...listeners} {...attributes}>
      <ProjectCard project={project} />
    </div>
  )
}

// ---------------------------------------------------------------------------
// DroppableColumn
// ---------------------------------------------------------------------------

interface DroppableColumnProps {
  stage: string
  label: string
  projects: ProjectSummary[]
  isOver: boolean
}

function DroppableColumn({ stage, label, projects, isOver }: DroppableColumnProps) {
  const { setNodeRef } = useDroppable({ id: stage })

  return (
    <div
      ref={setNodeRef}
      className={cn(
        "flex flex-col gap-2 min-w-[220px] w-[220px] shrink-0 rounded-lg border border-border bg-muted/30 p-2.5 transition-colors",
        isOver && "border-primary/50 bg-primary/5"
      )}
    >
      {/* Column header */}
      <div className="flex items-center justify-between px-0.5 py-0.5">
        <span className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
          {label}
        </span>
        <span className="flex h-5 min-w-5 items-center justify-center rounded-full bg-muted text-xs font-medium text-muted-foreground px-1">
          {projects.length}
        </span>
      </div>

      {/* Cards */}
      <div className="flex flex-col gap-2 min-h-[60px]">
        {projects.map((p) => (
          <DraggableCard key={p.id} project={p} />
        ))}

        {projects.length === 0 && (
          <div
            className={cn(
              "flex h-14 items-center justify-center rounded-md border border-dashed border-border/60 text-xs text-muted-foreground/50",
              isOver && "border-primary/40 text-primary/50"
            )}
          >
            Drop here
          </div>
        )}
      </div>
    </div>
  )
}

// ---------------------------------------------------------------------------
// PipelineKanban
// ---------------------------------------------------------------------------

interface PipelineKanbanProps {
  initialProjects: ProjectSummary[]
}

export function PipelineKanban({ initialProjects }: PipelineKanbanProps) {
  const [projectsList, setProjectsList] = useState<ProjectSummary[]>(initialProjects)
  const [activeProject, setActiveProject] = useState<ProjectSummary | null>(null)
  const [activeOverStage, setActiveOverStage] = useState<string | null>(null)
  const [updatingId, setUpdatingId] = useState<string | null>(null)

  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: {
        distance: 8, // 8px movement before drag starts (prevents accidental drags on click)
      },
    })
  )

  // Group projects by stage
  const byStage = useCallback(
    (stage: string) => projectsList.filter((p) => p.stage === stage),
    [projectsList]
  )

  function handleDragStart(event: DragStartEvent) {
    const project = event.active.data.current?.project as ProjectSummary | undefined
    if (project) setActiveProject(project)
  }

  async function handleDragEnd(event: DragEndEvent) {
    const { active, over } = event
    setActiveProject(null)
    setActiveOverStage(null)

    if (!over) return
    const newStage = over.id as string
    const projectId = active.id as string

    const project = projectsList.find((p) => p.id === projectId)
    if (!project || project.stage === newStage) return

    // Optimistic update
    setProjectsList((prev) =>
      prev.map((p) => (p.id === projectId ? { ...p, stage: newStage } : p))
    )

    setUpdatingId(projectId)
    try {
      const result = await updateProjectStage(projectId, newStage)
      if ("error" in result) {
        // Revert on error
        setProjectsList((prev) =>
          prev.map((p) => (p.id === projectId ? { ...p, stage: project.stage } : p))
        )
      }
    } finally {
      setUpdatingId(null)
    }
  }

  function handleDragOver(event: DragOverEvent) {
    setActiveOverStage(event.over ? String(event.over.id) : null)
  }

  return (
    <div className="relative">
      <DndContext
        sensors={sensors}
        collisionDetection={closestCenter}
        onDragStart={handleDragStart}
        onDragEnd={handleDragEnd}
        onDragOver={handleDragOver}
      >
        {/* Horizontally scrollable board */}
        <div className="flex gap-3 overflow-x-auto pb-4 -mx-1 px-1">
          {PROJECT_STAGES.map((stage) => (
            <DroppableColumn
              key={stage}
              stage={stage}
              label={PROJECT_STAGE_LABELS[stage]}
              projects={byStage(stage)}
              isOver={activeOverStage === stage}
            />
          ))}
        </div>

        {/* Drag overlay — ghost card following cursor */}
        <DragOverlay>
          {activeProject && (
            <div className="rotate-2 opacity-90">
              <ProjectCard project={activeProject} isDragging />
            </div>
          )}
        </DragOverlay>
      </DndContext>

      {/* Subtle updating indicator */}
      {updatingId && (
        <div className="pointer-events-none absolute inset-0 z-10" aria-hidden />
      )}
    </div>
  )
}
