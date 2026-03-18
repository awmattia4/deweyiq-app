"use client"

import { useState, useTransition } from "react"
import { toast } from "sonner"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Checkbox } from "@/components/ui/checkbox"
import { Label } from "@/components/ui/label"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog"
import {
  addChecklistTask,
  updateChecklistTask,
  deleteChecklistTask,
  reorderChecklistTasks,
  createChecklistTemplate,
  renameChecklistTemplate,
  deleteChecklistTemplate,
  setDefaultChecklistTemplate,
} from "@/actions/company-settings"
import type { ChecklistTemplateRow, ChecklistTaskRow } from "@/actions/company-settings"
import {
  DndContext,
  closestCenter,
  useSensor,
  useSensors,
  TouchSensor,
  MouseSensor,
  KeyboardSensor,
} from "@dnd-kit/core"
import type { DragEndEvent } from "@dnd-kit/core"
import {
  SortableContext,
  verticalListSortingStrategy,
  useSortable,
  sortableKeyboardCoordinates,
} from "@dnd-kit/sortable"
import { CSS } from "@dnd-kit/utilities"
import {
  GripVerticalIcon,
  PlusIcon,
  TrashIcon,
  CameraIcon,
  PencilIcon,
  CheckIcon,
  XIcon,
  MoreVerticalIcon,
  StarIcon,
} from "lucide-react"
import { cn } from "@/lib/utils"

interface ChecklistManagerProps {
  initialTemplates: ChecklistTemplateRow[]
}

export function ChecklistManager({ initialTemplates }: ChecklistManagerProps) {
  const [templates, setTemplates] = useState<ChecklistTemplateRow[]>(initialTemplates)
  const [activeTemplateId, setActiveTemplateId] = useState<string>(
    () => templates.find((t) => t.is_default)?.id ?? templates[0]?.id ?? ""
  )
  const [newTypeName, setNewTypeName] = useState("")
  const [isCreating, startCreateTransition] = useTransition()

  // Rename state
  const [renamingId, setRenamingId] = useState<string | null>(null)
  const [renameValue, setRenameValue] = useState("")
  const [isRenaming, startRenameTransition] = useTransition()

  // Delete confirmation
  const [deleteId, setDeleteId] = useState<string | null>(null)
  const [isDeleting, startDeleteTransition] = useTransition()

  const activeTemplate = templates.find((t) => t.id === activeTemplateId)

  // ── Create new service type ──────────────────────────────────────────────

  const handleCreateTemplate = () => {
    const trimmed = newTypeName.trim()
    if (!trimmed) return

    startCreateTransition(async () => {
      const result = await createChecklistTemplate(trimmed)
      if (result.success && result.id) {
        const newTemplate: ChecklistTemplateRow = {
          id: result.id,
          name: trimmed,
          is_default: false,
          tasks: [],
        }
        setTemplates((prev) => [...prev, newTemplate])
        setActiveTemplateId(result.id)
        setNewTypeName("")
        toast.success("Service type created")
      } else {
        toast.error(result.error ?? "Failed to create service type")
      }
    })
  }

  // ── Rename template ────────────────────────────────────────────────────

  const handleRename = (id: string) => {
    const trimmed = renameValue.trim()
    if (!trimmed) {
      setRenamingId(null)
      return
    }

    startRenameTransition(async () => {
      const result = await renameChecklistTemplate(id, trimmed)
      if (result.success) {
        setTemplates((prev) =>
          prev.map((t) => (t.id === id ? { ...t, name: trimmed } : t))
        )
        setRenamingId(null)
        toast.success("Service type renamed")
      } else {
        toast.error(result.error ?? "Failed to rename")
      }
    })
  }

  // ── Delete template ────────────────────────────────────────────────────

  const handleConfirmDelete = () => {
    if (!deleteId) return

    startDeleteTransition(async () => {
      const result = await deleteChecklistTemplate(deleteId)
      if (result.success) {
        setTemplates((prev) => prev.filter((t) => t.id !== deleteId))
        if (activeTemplateId === deleteId) {
          const remaining = templates.filter((t) => t.id !== deleteId)
          setActiveTemplateId(remaining[0]?.id ?? "")
        }
        setDeleteId(null)
        toast.success("Service type deleted")
      } else {
        toast.error(result.error ?? "Failed to delete")
        setDeleteId(null)
      }
    })
  }

  // ── Set default ────────────────────────────────────────────────────────

  const handleSetDefault = (id: string) => {
    setTemplates((prev) =>
      prev.map((t) => ({ ...t, is_default: t.id === id }))
    )
    startCreateTransition(async () => {
      const result = await setDefaultChecklistTemplate(id)
      if (!result.success) {
        // Revert
        setTemplates(initialTemplates)
        toast.error(result.error ?? "Failed to set default")
      }
    })
  }

  // ── Task list management (delegates to per-template task list) ─────────

  const updateTemplateTasks = (templateId: string, updater: (tasks: ChecklistTaskRow[]) => ChecklistTaskRow[]) => {
    setTemplates((prev) =>
      prev.map((t) =>
        t.id === templateId ? { ...t, tasks: updater(t.tasks) } : t
      )
    )
  }

  return (
    <div className="flex flex-col gap-4">
      <div>
        <h3 className="text-sm font-semibold text-foreground">Service Types & Checklists</h3>
        <p className="text-xs text-muted-foreground mt-0.5">
          Define service types with their own task lists. Each recurring schedule can use a different service type.
        </p>
      </div>

      {/* ── Template tabs ──────────────────────────────────────────────── */}
      {templates.length > 0 && (
        <div className="flex items-center gap-1.5 overflow-x-auto pb-1">
          {templates.map((template) => (
            <div key={template.id} className="flex items-center shrink-0">
              {renamingId === template.id ? (
                <div className="flex items-center gap-1">
                  <Input
                    value={renameValue}
                    onChange={(e) => setRenameValue(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") handleRename(template.id)
                      if (e.key === "Escape") setRenamingId(null)
                    }}
                    disabled={isRenaming}
                    className="h-7 w-36 text-xs"
                    autoFocus
                  />
                  <button
                    onClick={() => handleRename(template.id)}
                    disabled={isRenaming}
                    className="shrink-0 text-emerald-500 hover:text-emerald-400 p-0.5 cursor-pointer"
                  >
                    <CheckIcon className="h-3.5 w-3.5" />
                  </button>
                  <button
                    onClick={() => setRenamingId(null)}
                    className="shrink-0 text-muted-foreground hover:text-foreground p-0.5 cursor-pointer"
                  >
                    <XIcon className="h-3.5 w-3.5" />
                  </button>
                </div>
              ) : (
                <button
                  onClick={() => setActiveTemplateId(template.id)}
                  className={cn(
                    "flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-colors cursor-pointer",
                    template.id === activeTemplateId
                      ? "bg-primary/10 text-primary border border-primary/20"
                      : "text-muted-foreground hover:text-foreground hover:bg-muted/30 border border-transparent"
                  )}
                >
                  {template.is_default && (
                    <StarIcon className="h-3 w-3 fill-current" />
                  )}
                  {template.name}
                  <span className="text-[10px] text-muted-foreground/60">
                    {template.tasks.length}
                  </span>
                </button>
              )}

              {/* Template actions menu */}
              {renamingId !== template.id && template.id === activeTemplateId && (
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <button className="p-0.5 text-muted-foreground hover:text-foreground cursor-pointer ml-0.5">
                      <MoreVerticalIcon className="h-3.5 w-3.5" />
                    </button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="start">
                    <DropdownMenuItem
                      onClick={() => {
                        setRenamingId(template.id)
                        setRenameValue(template.name)
                      }}
                      className="cursor-pointer"
                    >
                      Rename
                    </DropdownMenuItem>
                    {!template.is_default && (
                      <DropdownMenuItem
                        onClick={() => handleSetDefault(template.id)}
                        className="cursor-pointer"
                      >
                        Set as default
                      </DropdownMenuItem>
                    )}
                    {!template.is_default && (
                      <DropdownMenuItem
                        onClick={() => setDeleteId(template.id)}
                        className="text-destructive cursor-pointer"
                      >
                        Delete
                      </DropdownMenuItem>
                    )}
                  </DropdownMenuContent>
                </DropdownMenu>
              )}
            </div>
          ))}
        </div>
      )}

      {/* ── Add new service type ──────────────────────────────────────── */}
      <div className="flex items-center gap-2">
        <Input
          value={newTypeName}
          onChange={(e) => setNewTypeName(e.target.value)}
          placeholder="New service type (e.g., Chemical Only)"
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault()
              handleCreateTemplate()
            }
          }}
          disabled={isCreating}
          className="flex-1 h-8 text-sm"
        />
        <Button
          size="sm"
          variant="outline"
          onClick={handleCreateTemplate}
          disabled={isCreating || !newTypeName.trim()}
          className="cursor-pointer shrink-0 h-8"
        >
          <PlusIcon className="h-3.5 w-3.5 mr-1" />
          Add Type
        </Button>
      </div>

      {/* ── Active template task list ─────────────────────────────────── */}
      {activeTemplate && (
        <TemplateTaskList
          key={activeTemplate.id}
          templateId={activeTemplate.id}
          tasks={activeTemplate.tasks}
          onTasksChange={(updater) => updateTemplateTasks(activeTemplate.id, updater)}
        />
      )}

      {/* ── Delete confirmation dialog ────────────────────────────────── */}
      <AlertDialog open={!!deleteId} onOpenChange={(open) => !open && setDeleteId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete service type?</AlertDialogTitle>
            <AlertDialogDescription>
              This will permanently delete this service type and all its tasks.
              Existing stops using this type will fall back to the default checklist.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel className="cursor-pointer">Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleConfirmDelete}
              disabled={isDeleting}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90 cursor-pointer"
            >
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}

// ---------------------------------------------------------------------------
// TemplateTaskList — task list for a single template
// ---------------------------------------------------------------------------

interface TemplateTaskListProps {
  templateId: string
  tasks: ChecklistTaskRow[]
  onTasksChange: (updater: (tasks: ChecklistTaskRow[]) => ChecklistTaskRow[]) => void
}

function TemplateTaskList({ templateId, tasks, onTasksChange }: TemplateTaskListProps) {
  const [newTaskLabel, setNewTaskLabel] = useState("")
  const [isAdding, startAddTransition] = useTransition()
  const [isReordering, startReorderTransition] = useTransition()

  const sensors = useSensors(
    useSensor(TouchSensor, { activationConstraint: { delay: 250, tolerance: 5 } }),
    useSensor(MouseSensor, { activationConstraint: { distance: 10 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates })
  )

  const handleAddTask = () => {
    const trimmed = newTaskLabel.trim()
    if (!trimmed) return

    startAddTransition(async () => {
      const result = await addChecklistTask(trimmed, templateId)
      if (result.success) {
        onTasksChange((prev) => [
          ...prev,
          {
            id: crypto.randomUUID(),
            label: trimmed,
            is_required: true,
            requires_photo: false,
            sort_order: prev.length,
          },
        ])
        setNewTaskLabel("")
        toast.success("Task added")
      } else {
        toast.error(result.error ?? "Failed to add task")
      }
    })
  }

  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event
    if (!over || active.id === over.id) return

    const oldIndex = tasks.findIndex((t) => t.id === active.id)
    const newIndex = tasks.findIndex((t) => t.id === over.id)

    const reordered = [...tasks]
    const [moved] = reordered.splice(oldIndex, 1)
    reordered.splice(newIndex, 0, moved)
    onTasksChange(() => reordered)

    startReorderTransition(async () => {
      const result = await reorderChecklistTasks(reordered.map((t) => t.id))
      if (!result.success) {
        onTasksChange(() => tasks) // revert
        toast.error("Failed to reorder")
      }
    })
  }

  return (
    <div className="flex flex-col gap-3">
      {/* Task list */}
      {tasks.length > 0 ? (
        <DndContext
          sensors={sensors}
          collisionDetection={closestCenter}
          onDragEnd={handleDragEnd}
        >
          <SortableContext
            items={tasks.map((t) => t.id)}
            strategy={verticalListSortingStrategy}
          >
            <div className="rounded-xl border border-border/60 bg-muted/5 divide-y divide-border/40">
              {tasks.map((task) => (
                <TaskRow
                  key={task.id}
                  task={task}
                  onUpdate={(updated) =>
                    onTasksChange((prev) =>
                      prev.map((t) => (t.id === updated.id ? updated : t))
                    )
                  }
                  onDelete={(id) =>
                    onTasksChange((prev) => prev.filter((t) => t.id !== id))
                  }
                />
              ))}
            </div>
          </SortableContext>
        </DndContext>
      ) : (
        <div className="rounded-xl border border-dashed border-border/60 bg-muted/5 p-8 text-center">
          <p className="text-sm text-muted-foreground">
            No tasks yet. Add your first task below.
          </p>
        </div>
      )}

      {/* Add new task */}
      <div className="flex items-center gap-2">
        <Input
          value={newTaskLabel}
          onChange={(e) => setNewTaskLabel(e.target.value)}
          placeholder="New task (e.g., Skim surface debris)"
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault()
              handleAddTask()
            }
          }}
          disabled={isAdding}
          className="flex-1"
        />
        <Button
          size="sm"
          onClick={handleAddTask}
          disabled={isAdding || !newTaskLabel.trim()}
          className="cursor-pointer shrink-0"
        >
          <PlusIcon className="h-4 w-4" />
          Add
        </Button>
      </div>
    </div>
  )
}

// ---------------------------------------------------------------------------
// TaskRow — sortable individual task
// ---------------------------------------------------------------------------

interface TaskRowProps {
  task: ChecklistTaskRow
  onUpdate: (task: ChecklistTaskRow) => void
  onDelete: (id: string) => void
}

function TaskRow({ task, onUpdate, onDelete }: TaskRowProps) {
  const [isEditing, setIsEditing] = useState(false)
  const [editLabel, setEditLabel] = useState(task.label)
  const [isPending, startTransition] = useTransition()
  const [isDeleting, startDeleteTransition] = useTransition()

  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: task.id })

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
  }

  const handleSaveEdit = () => {
    const trimmed = editLabel.trim()
    if (!trimmed || trimmed === task.label) {
      setIsEditing(false)
      setEditLabel(task.label)
      return
    }

    startTransition(async () => {
      const result = await updateChecklistTask(task.id, { label: trimmed })
      if (result.success) {
        onUpdate({ ...task, label: trimmed })
        setIsEditing(false)
        toast.success("Task updated")
      } else {
        toast.error(result.error ?? "Failed to update")
      }
    })
  }

  const handleToggleRequired = (checked: boolean) => {
    onUpdate({ ...task, is_required: checked })
    startTransition(async () => {
      const result = await updateChecklistTask(task.id, { is_required: checked })
      if (!result.success) {
        onUpdate({ ...task, is_required: !checked })
        toast.error("Failed to update")
      }
    })
  }

  const handleTogglePhoto = (checked: boolean) => {
    onUpdate({ ...task, requires_photo: checked })
    startTransition(async () => {
      const result = await updateChecklistTask(task.id, { requires_photo: checked })
      if (!result.success) {
        onUpdate({ ...task, requires_photo: !checked })
        toast.error("Failed to update")
      }
    })
  }

  const handleDelete = () => {
    startDeleteTransition(async () => {
      const result = await deleteChecklistTask(task.id)
      if (result.success) {
        onDelete(task.id)
        toast.success("Task deleted")
      } else {
        toast.error(result.error ?? "Failed to delete")
      }
    })
  }

  return (
    <div ref={setNodeRef} style={style} className="flex items-center gap-2 px-3 py-2.5">
      {/* Drag handle */}
      <button
        {...listeners}
        {...attributes}
        className="shrink-0 text-muted-foreground hover:text-foreground cursor-grab active:cursor-grabbing touch-none p-0.5"
        tabIndex={-1}
      >
        <GripVerticalIcon className="h-4 w-4" />
      </button>

      {/* Label or edit input */}
      <div className="flex-1 min-w-0">
        {isEditing ? (
          <div className="flex items-center gap-1.5">
            <Input
              value={editLabel}
              onChange={(e) => setEditLabel(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") handleSaveEdit()
                if (e.key === "Escape") {
                  setIsEditing(false)
                  setEditLabel(task.label)
                }
              }}
              disabled={isPending}
              className="h-7 text-sm"
              autoFocus
            />
            <button
              onClick={handleSaveEdit}
              disabled={isPending}
              className="shrink-0 text-emerald-500 hover:text-emerald-400 p-0.5 cursor-pointer"
            >
              <CheckIcon className="h-4 w-4" />
            </button>
            <button
              onClick={() => {
                setIsEditing(false)
                setEditLabel(task.label)
              }}
              className="shrink-0 text-muted-foreground hover:text-foreground p-0.5 cursor-pointer"
            >
              <XIcon className="h-4 w-4" />
            </button>
          </div>
        ) : (
          <button
            onClick={() => setIsEditing(true)}
            className="flex items-center gap-1.5 text-sm text-foreground/90 hover:text-foreground cursor-pointer group w-full text-left"
          >
            <span className="truncate">{task.label}</span>
            <PencilIcon className="h-3 w-3 text-muted-foreground opacity-0 group-hover:opacity-100 shrink-0" />
          </button>
        )}
      </div>

      {/* Badges / toggles */}
      <div className="flex items-center gap-3 shrink-0">
        {/* Required toggle */}
        <div className="flex items-center gap-1.5">
          <Checkbox
            id={`req-${task.id}`}
            checked={task.is_required}
            onCheckedChange={(checked) => handleToggleRequired(!!checked)}
            disabled={isPending}
            className="cursor-pointer"
          />
          <Label
            htmlFor={`req-${task.id}`}
            className="text-xs text-muted-foreground cursor-pointer hidden sm:inline"
          >
            Required
          </Label>
        </div>

        {/* Photo requirement toggle */}
        <button
          onClick={() => handleTogglePhoto(!task.requires_photo)}
          disabled={isPending}
          className={`flex items-center gap-1 px-1.5 py-0.5 rounded text-xs cursor-pointer transition-colors ${
            task.requires_photo
              ? "text-blue-400 bg-blue-500/10"
              : "text-muted-foreground hover:text-foreground"
          }`}
          title={task.requires_photo ? "Photo required" : "No photo required"}
        >
          <CameraIcon className="h-3.5 w-3.5" />
          <span className="hidden sm:inline">
            {task.requires_photo ? "Photo" : ""}
          </span>
        </button>

        {/* Delete */}
        <button
          onClick={handleDelete}
          disabled={isDeleting}
          className="text-muted-foreground hover:text-destructive cursor-pointer p-0.5 transition-colors"
          title="Delete task"
        >
          <TrashIcon className="h-3.5 w-3.5" />
        </button>
      </div>
    </div>
  )
}
