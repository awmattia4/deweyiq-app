"use client"

import { useState } from "react"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import {
  createProjectTemplate,
  updateProjectTemplate,
  deleteProjectTemplate,
} from "@/actions/projects"
import type { ProjectTemplate, CreateTemplateInput } from "@/actions/projects"
import { PROJECT_TYPE_LABELS } from "@/lib/projects-constants"
import { PlusIcon, PencilIcon, Trash2Icon } from "lucide-react"

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

type PhaseDef = {
  name: string
  sort_order: number
  estimated_days: number
  tasks: Array<{ name: string; sort_order: number; is_required: boolean }>
  materials: Array<{ name: string; category: string; unit: string; quantity_estimated: number }>
}

interface ProjectTemplatesProps {
  initialTemplates: ProjectTemplate[]
}

const PROJECT_TYPES = Object.entries(PROJECT_TYPE_LABELS)

// ---------------------------------------------------------------------------
// TemplateDialog — create or edit a template
// ---------------------------------------------------------------------------

interface TemplateDialogProps {
  open: boolean
  onClose: () => void
  template?: ProjectTemplate | null
  onSave: (template: ProjectTemplate) => void
}

function TemplateDialog({ open, onClose, template, onSave }: TemplateDialogProps) {
  const isEditing = !!template

  const [name, setName] = useState(template?.name ?? "")
  const [projectType, setProjectType] = useState(template?.project_type ?? "renovation")
  const [phases, setPhases] = useState<PhaseDef[]>(
    template?.default_phases ?? []
  )
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // Phase editing state
  const [newPhaseName, setNewPhaseName] = useState("")

  function addPhase() {
    if (!newPhaseName.trim()) return
    setPhases((prev) => [
      ...prev,
      {
        name: newPhaseName.trim(),
        sort_order: prev.length,
        estimated_days: 7,
        tasks: [],
        materials: [],
      },
    ])
    setNewPhaseName("")
  }

  function removePhase(idx: number) {
    setPhases((prev) => prev.filter((_, i) => i !== idx).map((p, i) => ({ ...p, sort_order: i })))
  }

  function updatePhaseEstimatedDays(idx: number, days: number) {
    setPhases((prev) =>
      prev.map((p, i) => (i === idx ? { ...p, estimated_days: days } : p))
    )
  }

  function addTaskToPhase(phaseIdx: number, taskName: string) {
    if (!taskName.trim()) return
    setPhases((prev) =>
      prev.map((p, i) => {
        if (i !== phaseIdx) return p
        return {
          ...p,
          tasks: [
            ...p.tasks,
            { name: taskName.trim(), sort_order: p.tasks.length, is_required: true },
          ],
        }
      })
    )
  }

  function removeTaskFromPhase(phaseIdx: number, taskIdx: number) {
    setPhases((prev) =>
      prev.map((p, i) => {
        if (i !== phaseIdx) return p
        return {
          ...p,
          tasks: p.tasks
            .filter((_, ti) => ti !== taskIdx)
            .map((t, ti) => ({ ...t, sort_order: ti })),
        }
      })
    )
  }

  async function handleSave() {
    setError(null)
    if (!name.trim()) {
      setError("Template name is required")
      return
    }

    setSaving(true)
    try {
      const input: CreateTemplateInput = {
        name: name.trim(),
        project_type: projectType,
        default_phases: phases.length > 0 ? phases : undefined,
      }

      const result = isEditing
        ? await updateProjectTemplate(template!.id, input)
        : await createProjectTemplate(input)

      if ("error" in result) {
        setError(result.error)
        return
      }

      onSave(result.data)
      onClose()
    } finally {
      setSaving(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{isEditing ? "Edit Template" : "Create Project Template"}</DialogTitle>
          <DialogDescription>
            Templates define the default phases and tasks for a project type. When creating a
            project, selecting a template pre-populates the phase list.
          </DialogDescription>
        </DialogHeader>

        <div className="flex flex-col gap-5 py-2">
          {/* Name */}
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="template-name">Template Name</Label>
            <Input
              id="template-name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g. Standard Pool Renovation"
            />
          </div>

          {/* Project Type */}
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="template-type">Project Type</Label>
            <Select value={projectType} onValueChange={setProjectType}>
              <SelectTrigger id="template-type">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {PROJECT_TYPES.map(([value, label]) => (
                  <SelectItem key={value} value={value}>
                    {label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* Phases */}
          <div className="flex flex-col gap-3">
            <Label>Default Phases</Label>
            <p className="text-xs text-muted-foreground">
              Define the phases that will be created when this template is applied to a new project.
            </p>

            {phases.length === 0 && (
              <p className="text-sm text-muted-foreground italic">No phases added yet.</p>
            )}

            {phases.map((phase, phaseIdx) => (
              <PhaseEditor
                key={phaseIdx}
                phase={phase}
                phaseIdx={phaseIdx}
                onRemove={() => removePhase(phaseIdx)}
                onUpdateDays={(days) => updatePhaseEstimatedDays(phaseIdx, days)}
                onAddTask={(taskName) => addTaskToPhase(phaseIdx, taskName)}
                onRemoveTask={(taskIdx) => removeTaskFromPhase(phaseIdx, taskIdx)}
              />
            ))}

            {/* Add phase */}
            <div className="flex gap-2">
              <Input
                value={newPhaseName}
                onChange={(e) => setNewPhaseName(e.target.value)}
                placeholder="Phase name (e.g. Demo & Excavation)"
                onKeyDown={(e) => e.key === "Enter" && addPhase()}
                className="flex-1"
              />
              <Button type="button" variant="outline" size="sm" onClick={addPhase}>
                <PlusIcon className="h-4 w-4" />
                Add Phase
              </Button>
            </div>
          </div>

          {error && <p className="text-sm text-destructive">{error}</p>}
        </div>

        <DialogFooter>
          <Button type="button" variant="outline" onClick={onClose} disabled={saving}>
            Cancel
          </Button>
          <Button type="button" onClick={handleSave} disabled={saving}>
            {saving ? "Saving..." : isEditing ? "Save Changes" : "Create Template"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

// ---------------------------------------------------------------------------
// PhaseEditor — inline phase configuration
// ---------------------------------------------------------------------------

interface PhaseEditorProps {
  phase: PhaseDef
  phaseIdx: number
  onRemove: () => void
  onUpdateDays: (days: number) => void
  onAddTask: (taskName: string) => void
  onRemoveTask: (taskIdx: number) => void
}

function PhaseEditor({
  phase,
  onRemove,
  onUpdateDays,
  onAddTask,
  onRemoveTask,
}: PhaseEditorProps) {
  const [taskInput, setTaskInput] = useState("")

  function handleAddTask() {
    if (!taskInput.trim()) return
    onAddTask(taskInput)
    setTaskInput("")
  }

  return (
    <div className="rounded-lg border border-border bg-muted/30 p-4 flex flex-col gap-3">
      <div className="flex items-center justify-between">
        <span className="font-medium text-sm">{phase.name}</span>
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-1.5">
            <Label className="text-xs text-muted-foreground whitespace-nowrap">Est. days:</Label>
            <Input
              type="number"
              min={1}
              max={365}
              value={phase.estimated_days}
              onChange={(e) => onUpdateDays(Number(e.target.value) || 1)}
              className="w-16 h-7 text-xs"
            />
          </div>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={onRemove}
            className="h-7 w-7 p-0 text-muted-foreground hover:text-destructive"
          >
            <Trash2Icon className="h-3.5 w-3.5" />
          </Button>
        </div>
      </div>

      {/* Tasks */}
      {phase.tasks.length > 0 && (
        <div className="flex flex-col gap-1">
          {phase.tasks.map((task, taskIdx) => (
            <div key={taskIdx} className="flex items-center justify-between py-0.5">
              <span className="text-xs text-muted-foreground">{task.name}</span>
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={() => onRemoveTask(taskIdx)}
                className="h-5 w-5 p-0 text-muted-foreground hover:text-destructive"
              >
                <Trash2Icon className="h-3 w-3" />
              </Button>
            </div>
          ))}
        </div>
      )}

      {/* Add task */}
      <div className="flex gap-2">
        <Input
          value={taskInput}
          onChange={(e) => setTaskInput(e.target.value)}
          placeholder="Add task..."
          onKeyDown={(e) => e.key === "Enter" && handleAddTask()}
          className="flex-1 h-7 text-xs"
        />
        <Button type="button" variant="outline" size="sm" className="h-7 text-xs" onClick={handleAddTask}>
          Add
        </Button>
      </div>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Main component
// ---------------------------------------------------------------------------

export function ProjectTemplates({ initialTemplates }: ProjectTemplatesProps) {
  const [templates, setTemplates] = useState<ProjectTemplate[]>(initialTemplates)
  const [dialogOpen, setDialogOpen] = useState(false)
  const [editingTemplate, setEditingTemplate] = useState<ProjectTemplate | null>(null)
  const [deletingId, setDeletingId] = useState<string | null>(null)

  function openCreate() {
    setEditingTemplate(null)
    setDialogOpen(true)
  }

  function openEdit(template: ProjectTemplate) {
    setEditingTemplate(template)
    setDialogOpen(true)
  }

  function handleSaved(template: ProjectTemplate) {
    setTemplates((prev) => {
      const idx = prev.findIndex((t) => t.id === template.id)
      if (idx >= 0) {
        const next = [...prev]
        next[idx] = template
        return next
      }
      return [...prev, template]
    })
  }

  async function handleDelete(id: string) {
    setDeletingId(id)
    try {
      const result = await deleteProjectTemplate(id)
      if ("error" in result) {
        console.error(result.error)
        return
      }
      setTemplates((prev) => prev.filter((t) => t.id !== id))
    } finally {
      setDeletingId(null)
    }
  }

  return (
    <div className="flex flex-col gap-4">
      {templates.length === 0 && (
        <p className="text-sm text-muted-foreground italic">
          No templates yet. Create one to pre-populate phases and tasks when starting a new project.
        </p>
      )}

      {templates.map((template) => (
        <div
          key={template.id}
          className="flex items-start justify-between rounded-lg border border-border bg-muted/20 p-4"
        >
          <div className="flex flex-col gap-1">
            <div className="flex items-center gap-2">
              <span className="font-medium text-sm">{template.name}</span>
              <Badge variant="outline" className="text-xs">
                {PROJECT_TYPE_LABELS[template.project_type] ?? template.project_type}
              </Badge>
            </div>
            {template.default_phases && template.default_phases.length > 0 && (
              <p className="text-xs text-muted-foreground">
                {template.default_phases.length} phase
                {template.default_phases.length !== 1 ? "s" : ""}
                {template.default_phases.reduce((sum, p) => sum + (p.tasks?.length ?? 0), 0) > 0 &&
                  ` · ${template.default_phases.reduce((sum, p) => sum + (p.tasks?.length ?? 0), 0)} tasks`}
              </p>
            )}
          </div>

          <div className="flex items-center gap-1">
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={() => openEdit(template)}
              className="h-8 w-8 p-0"
            >
              <PencilIcon className="h-3.5 w-3.5" />
            </Button>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={() => handleDelete(template.id)}
              disabled={deletingId === template.id}
              className="h-8 w-8 p-0 text-muted-foreground hover:text-destructive"
            >
              <Trash2Icon className="h-3.5 w-3.5" />
            </Button>
          </div>
        </div>
      ))}

      <div className="pt-1">
        <Button type="button" variant="outline" size="sm" onClick={openCreate}>
          <PlusIcon className="h-4 w-4" />
          New Template
        </Button>
      </div>

      <TemplateDialog
        open={dialogOpen}
        onClose={() => setDialogOpen(false)}
        template={editingTemplate}
        onSave={handleSaved}
      />
    </div>
  )
}
