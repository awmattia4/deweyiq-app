"use client"

/**
 * customer-checklist-editor.tsx — Per-customer checklist customization.
 *
 * Two sections:
 * 1. Standard Tasks — inherited from org template, with toggle to suppress/restore per customer
 * 2. Custom Tasks — customer-specific additions with add/edit/delete
 */

import { useState, useTransition } from "react"
import {
  CheckCircleIcon,
  CameraIcon,
  PlusIcon,
  TrashIcon,
  Loader2Icon,
  PencilIcon,
  XIcon,
  CheckIcon,
} from "lucide-react"
import { toast } from "sonner"
import { cn } from "@/lib/utils"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Switch } from "@/components/ui/switch"
import {
  suppressTemplateTask,
  restoreTemplateTask,
  addCustomerTask,
  updateCustomerTask,
  deleteCustomerTask,
} from "@/actions/company-settings"
import type { CustomerChecklistView } from "@/actions/company-settings"

// ─── Types ────────────────────────────────────────────────────────────────────

interface Props {
  customerId: string
  initialView: CustomerChecklistView
}

type TemplateTask = CustomerChecklistView["templateTasks"][number]
type CustomTask = CustomerChecklistView["customTasks"][number]

// ─── Component ────────────────────────────────────────────────────────────────

export function CustomerChecklistEditor({ customerId, initialView }: Props) {
  const [view, setView] = useState<CustomerChecklistView>(initialView)
  const [isPending, startTransition] = useTransition()

  // ── Add task form state ──
  const [newLabel, setNewLabel] = useState("")
  const [newRequired, setNewRequired] = useState(true)
  const [newPhoto, setNewPhoto] = useState(false)

  // ── Inline edit state ──
  const [editingId, setEditingId] = useState<string | null>(null)
  const [editLabel, setEditLabel] = useState("")

  // ── Handlers: template task suppress/restore ──

  function handleToggleSuppress(task: TemplateTask) {
    startTransition(async () => {
      if (task.isSuppressed && task.tombstoneId) {
        // Restore
        const result = await restoreTemplateTask(task.tombstoneId)
        if (result.success) {
          setView((prev) => ({
            ...prev,
            templateTasks: prev.templateTasks.map((t) =>
              t.id === task.id
                ? { ...t, isSuppressed: false, tombstoneId: null }
                : t
            ),
          }))
        } else {
          toast.error(result.error ?? "Failed to restore task")
        }
      } else {
        // Suppress
        const result = await suppressTemplateTask(customerId, task.id)
        if (result.success) {
          setView((prev) => ({
            ...prev,
            templateTasks: prev.templateTasks.map((t) =>
              t.id === task.id
                ? { ...t, isSuppressed: true, tombstoneId: "pending" }
                : t
            ),
          }))
        } else {
          toast.error(result.error ?? "Failed to suppress task")
        }
      }
    })
  }

  // ── Handlers: custom task CRUD ──

  function handleAddTask() {
    const trimmed = newLabel.trim()
    if (!trimmed) return

    startTransition(async () => {
      const result = await addCustomerTask(customerId, {
        label: trimmed,
        is_required: newRequired,
        requires_photo: newPhoto,
      })
      if (result.success) {
        // Optimistic — add a placeholder, page revalidation will give the real ID
        setView((prev) => ({
          ...prev,
          customTasks: [
            ...prev.customTasks,
            {
              id: `temp-${Date.now()}`,
              label: trimmed,
              is_required: newRequired,
              requires_photo: newPhoto,
              sort_order: prev.customTasks.length,
            },
          ],
        }))
        setNewLabel("")
        setNewRequired(true)
        setNewPhoto(false)
        toast.success("Task added")
      } else {
        toast.error(result.error ?? "Failed to add task")
      }
    })
  }

  function handleDeleteCustomTask(taskId: string) {
    startTransition(async () => {
      const result = await deleteCustomerTask(taskId)
      if (result.success) {
        setView((prev) => ({
          ...prev,
          customTasks: prev.customTasks.filter((t) => t.id !== taskId),
        }))
        toast.success("Task removed")
      } else {
        toast.error(result.error ?? "Failed to delete task")
      }
    })
  }

  function handleStartEdit(task: CustomTask) {
    setEditingId(task.id)
    setEditLabel(task.label)
  }

  function handleCancelEdit() {
    setEditingId(null)
    setEditLabel("")
  }

  function handleSaveEdit(taskId: string) {
    const trimmed = editLabel.trim()
    if (!trimmed) return

    startTransition(async () => {
      const result = await updateCustomerTask(taskId, { label: trimmed })
      if (result.success) {
        setView((prev) => ({
          ...prev,
          customTasks: prev.customTasks.map((t) =>
            t.id === taskId ? { ...t, label: trimmed } : t
          ),
        }))
        setEditingId(null)
        setEditLabel("")
      } else {
        toast.error(result.error ?? "Failed to update task")
      }
    })
  }

  function handleToggleCustomRequired(task: CustomTask) {
    startTransition(async () => {
      const result = await updateCustomerTask(task.id, {
        is_required: !task.is_required,
      })
      if (result.success) {
        setView((prev) => ({
          ...prev,
          customTasks: prev.customTasks.map((t) =>
            t.id === task.id ? { ...t, is_required: !t.is_required } : t
          ),
        }))
      } else {
        toast.error(result.error ?? "Failed to update task")
      }
    })
  }

  function handleToggleCustomPhoto(task: CustomTask) {
    startTransition(async () => {
      const result = await updateCustomerTask(task.id, {
        requires_photo: !task.requires_photo,
      })
      if (result.success) {
        setView((prev) => ({
          ...prev,
          customTasks: prev.customTasks.map((t) =>
            t.id === task.id
              ? { ...t, requires_photo: !t.requires_photo }
              : t
          ),
        }))
      } else {
        toast.error(result.error ?? "Failed to update task")
      }
    })
  }

  const noTemplateTasks = view.templateTasks.length === 0
  const noCustomTasks = view.customTasks.length === 0

  return (
    <div className="flex flex-col gap-6">
      {/* ── Standard Tasks (from template) ────────────────────────────────── */}
      <div>
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-sm font-semibold">Standard Tasks</h2>
          <span className="text-xs text-muted-foreground">
            Inherited from service template
          </span>
        </div>

        {noTemplateTasks ? (
          <p className="text-sm text-muted-foreground italic">
            No service template configured. Add one in Settings &gt; Service.
          </p>
        ) : (
          <div className="flex flex-col gap-1">
            {view.templateTasks.map((task) => (
              <div
                key={task.id}
                className={cn(
                  "flex items-center gap-3 rounded-lg border border-border px-4 py-2.5 transition-colors",
                  task.isSuppressed && "opacity-50"
                )}
              >
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <span
                      className={cn(
                        "text-sm",
                        task.isSuppressed && "line-through text-muted-foreground"
                      )}
                    >
                      {task.label}
                    </span>
                    {task.is_required && !task.isSuppressed && (
                      <span className="text-[10px] text-muted-foreground">
                        required
                      </span>
                    )}
                    {task.requires_photo && !task.isSuppressed && (
                      <CameraIcon className="h-3 w-3 text-muted-foreground" />
                    )}
                  </div>
                </div>

                <div className="flex items-center gap-2 shrink-0">
                  {task.isSuppressed && (
                    <span className="text-xs text-muted-foreground">
                      Excluded
                    </span>
                  )}
                  <Switch
                    checked={!task.isSuppressed}
                    onCheckedChange={() => handleToggleSuppress(task)}
                    disabled={isPending}
                    aria-label={
                      task.isSuppressed
                        ? `Restore ${task.label}`
                        : `Exclude ${task.label}`
                    }
                  />
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* ── Custom Tasks (customer-specific) ──────────────────────────────── */}
      <div>
        <h2 className="text-sm font-semibold mb-3">
          Custom Tasks for This Customer
        </h2>

        {noCustomTasks ? (
          <p className="text-sm text-muted-foreground italic mb-4">
            No custom tasks added yet.
          </p>
        ) : (
          <div className="flex flex-col gap-1 mb-4">
            {view.customTasks.map((task) => (
              <div
                key={task.id}
                className="flex items-center gap-3 rounded-lg border border-border px-4 py-2.5"
              >
                {editingId === task.id ? (
                  /* ── Inline edit mode ── */
                  <div className="flex flex-1 items-center gap-2">
                    <Input
                      value={editLabel}
                      onChange={(e) => setEditLabel(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === "Enter") handleSaveEdit(task.id)
                        if (e.key === "Escape") handleCancelEdit()
                      }}
                      className="h-8 text-sm"
                      autoFocus
                    />
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-7 w-7 shrink-0"
                      onClick={() => handleSaveEdit(task.id)}
                      disabled={isPending}
                    >
                      <CheckIcon className="h-3.5 w-3.5" />
                    </Button>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-7 w-7 shrink-0"
                      onClick={handleCancelEdit}
                    >
                      <XIcon className="h-3.5 w-3.5" />
                    </Button>
                  </div>
                ) : (
                  /* ── Read mode ── */
                  <>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="text-sm">{task.label}</span>
                        {task.is_required && (
                          <span className="text-[10px] text-muted-foreground">
                            required
                          </span>
                        )}
                        {task.requires_photo && (
                          <CameraIcon className="h-3 w-3 text-muted-foreground" />
                        )}
                      </div>
                    </div>

                    <div className="flex items-center gap-1 shrink-0">
                      <button
                        type="button"
                        onClick={() => handleToggleCustomRequired(task)}
                        disabled={isPending}
                        className={cn(
                          "cursor-pointer rounded-md p-1.5 text-xs transition-colors",
                          task.is_required
                            ? "text-foreground bg-muted"
                            : "text-muted-foreground hover:bg-muted"
                        )}
                        title={
                          task.is_required
                            ? "Required — click to make optional"
                            : "Optional — click to make required"
                        }
                      >
                        <CheckCircleIcon className="h-3.5 w-3.5" />
                      </button>
                      <button
                        type="button"
                        onClick={() => handleToggleCustomPhoto(task)}
                        disabled={isPending}
                        className={cn(
                          "cursor-pointer rounded-md p-1.5 text-xs transition-colors",
                          task.requires_photo
                            ? "text-foreground bg-muted"
                            : "text-muted-foreground hover:bg-muted"
                        )}
                        title={
                          task.requires_photo
                            ? "Photo required — click to remove"
                            : "No photo — click to require"
                        }
                      >
                        <CameraIcon className="h-3.5 w-3.5" />
                      </button>
                      <button
                        type="button"
                        onClick={() => handleStartEdit(task)}
                        disabled={isPending}
                        className="cursor-pointer rounded-md p-1.5 text-muted-foreground hover:bg-muted hover:text-foreground transition-colors"
                        title="Edit label"
                      >
                        <PencilIcon className="h-3.5 w-3.5" />
                      </button>
                      <button
                        type="button"
                        onClick={() => handleDeleteCustomTask(task.id)}
                        disabled={isPending}
                        className="cursor-pointer rounded-md p-1.5 text-muted-foreground hover:bg-destructive/20 hover:text-destructive transition-colors"
                        title="Delete task"
                      >
                        <TrashIcon className="h-3.5 w-3.5" />
                      </button>
                    </div>
                  </>
                )}
              </div>
            ))}
          </div>
        )}

        {/* ── Add new custom task ── */}
        <div className="flex items-end gap-2">
          <div className="flex-1">
            <Input
              value={newLabel}
              onChange={(e) => setNewLabel(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && newLabel.trim()) handleAddTask()
              }}
              placeholder="Add a task for this customer..."
              className="text-sm"
              disabled={isPending}
            />
          </div>
          <div className="flex items-center gap-1.5 shrink-0">
            <button
              type="button"
              onClick={() => setNewRequired(!newRequired)}
              className={cn(
                "cursor-pointer rounded-md p-2 text-xs transition-colors",
                newRequired
                  ? "text-foreground bg-muted"
                  : "text-muted-foreground hover:bg-muted"
              )}
              title={newRequired ? "Required" : "Optional"}
            >
              <CheckCircleIcon className="h-3.5 w-3.5" />
            </button>
            <button
              type="button"
              onClick={() => setNewPhoto(!newPhoto)}
              className={cn(
                "cursor-pointer rounded-md p-2 text-xs transition-colors",
                newPhoto
                  ? "text-foreground bg-muted"
                  : "text-muted-foreground hover:bg-muted"
              )}
              title={newPhoto ? "Photo required" : "No photo"}
            >
              <CameraIcon className="h-3.5 w-3.5" />
            </button>
            <Button
              size="sm"
              variant="outline"
              onClick={handleAddTask}
              disabled={isPending || !newLabel.trim()}
            >
              {isPending ? (
                <Loader2Icon className="h-3.5 w-3.5 animate-spin" />
              ) : (
                <PlusIcon className="h-3.5 w-3.5" />
              )}
              Add
            </Button>
          </div>
        </div>
      </div>
    </div>
  )
}
