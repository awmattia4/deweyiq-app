"use client"

import { useState } from "react"
import { CheckSquare2Icon, ClipboardListIcon, PlusIcon } from "lucide-react"
import { Checkbox } from "@/components/ui/checkbox"
import { Button } from "@/components/ui/button"
import { cn } from "@/lib/utils"
import type { VisitDraft } from "@/lib/offline/db"
import type { StopContext } from "@/actions/visits"

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

type ChecklistTask = StopContext["checklistTasks"][number]

type ChecklistState = VisitDraft["checklist"]

interface ChecklistProps {
  tasks: ChecklistTask[]
  draft: VisitDraft
  onUpdate: (taskId: string, completed: boolean, notes: string) => Promise<void>
  onMarkAllComplete: (taskIds: string[]) => Promise<void>
  readOnly?: boolean
}

// ---------------------------------------------------------------------------
// Task Row
// ---------------------------------------------------------------------------

interface TaskRowProps {
  task: ChecklistTask
  completed: boolean
  notes: string
  onToggle: (completed: boolean) => void
  onNotesChange: (notes: string) => void
  readOnly?: boolean
}

function TaskRow({ task, completed, notes, onToggle, onNotesChange, readOnly = false }: TaskRowProps) {
  const [notesOpen, setNotesOpen] = useState(!!notes)

  const handleToggle = (checked: boolean | "indeterminate") => {
    const isChecked = checked === true
    onToggle(isChecked)
    // Auto-open notes field when unchecking a completed task (exception note flow)
    if (!isChecked) {
      setNotesOpen(true)
    }
  }

  const handleNotesChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    onNotesChange(e.target.value)
  }

  return (
    <div
      className={cn(
        "flex flex-col gap-0",
        "border-b border-border/30 last:border-b-0"
      )}
    >
      {/* ── Task row ── */}
      <div className="flex items-center gap-3 px-4 py-3 min-h-[56px]">
        {/* Checkbox — 44px touch target via parent padding */}
        <div className="flex items-center justify-center w-11 h-11 -ml-2 shrink-0">
          <Checkbox
            checked={completed}
            onCheckedChange={readOnly ? undefined : handleToggle}
            disabled={readOnly}
            aria-label={`Mark "${task.label}" as complete`}
            className={cn("size-6 rounded-md", readOnly ? "cursor-default opacity-70" : "cursor-pointer")}
          />
        </div>

        {/* Label */}
        <span
          className={cn(
            "flex-1 text-sm font-medium leading-snug transition-colors",
            completed
              ? "line-through text-muted-foreground/60 decoration-muted-foreground/40"
              : "text-foreground"
          )}
        >
          {task.label}
          {task.isRequired && (
            <span className="text-primary/60 ml-1 no-underline" aria-label="required">
              *
            </span>
          )}
        </span>

        {/* "Add note" trigger — appears when task is checked, collapses when open */}
        {completed && !notesOpen && !readOnly && (
          <button
            type="button"
            onClick={() => setNotesOpen(true)}
            className="flex items-center gap-1 text-xs text-muted-foreground/60 hover:text-muted-foreground transition-colors cursor-pointer shrink-0 py-1 px-1.5 -mr-1"
            aria-label={`Add note for ${task.label}`}
          >
            <PlusIcon className="size-3" />
            <span>Note</span>
          </button>
        )}
      </div>

      {/* ── Exception notes (expandable) ── */}
      {notesOpen && (
        <div className="px-4 pb-3 pt-0 ml-9">
          <textarea
            className={cn(
              "w-full min-h-[72px] rounded-lg border border-input/60 bg-background/60",
              "px-3 py-2.5 text-sm placeholder:text-muted-foreground/40",
              "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/60",
              "resize-none transition-colors",
              "text-foreground",
              readOnly && "opacity-70 cursor-default"
            )}
            placeholder="Add notes about this task..."
            value={notes}
            onChange={readOnly ? undefined : handleNotesChange}
            readOnly={readOnly}
            rows={2}
            aria-label={`Notes for ${task.label}`}
          />
          {notes && (
            <button
              type="button"
              onClick={() => setNotesOpen(false)}
              className="text-xs text-muted-foreground/50 hover:text-muted-foreground transition-colors cursor-pointer mt-1"
            >
              Collapse
            </button>
          )}
        </div>
      )}
    </div>
  )
}

// ---------------------------------------------------------------------------
// Main Checklist component
// ---------------------------------------------------------------------------

/**
 * Checklist — service checklist tab content for the stop workflow.
 *
 * Per locked decisions:
 * - "Mark all complete" button at the top for routine visits
 * - Each task has a checkbox (44px tap target) AND an expandable notes field
 * - State persists in Dexie visitDrafts via onUpdate callback
 * - Offline-first: all interactions write to Dexie immediately
 *
 * On mount, the draft's stored checklist state is merged with the template tasks:
 * - Draft entries for known taskIds take priority over defaults
 * - Template tasks not in the draft are initialized as unchecked
 */
export function Checklist({ tasks, draft, onUpdate, onMarkAllComplete, readOnly = false }: ChecklistProps) {
  // Build a lookup of current checklist state from draft
  const getDraftState = (taskId: string): { completed: boolean; notes: string } => {
    const stored = draft.checklist.find((t) => t.taskId === taskId)
    return stored ?? { completed: false, notes: "" }
  }

  // Compute overall completion state
  const allCompleted =
    tasks.length > 0 && tasks.every((t) => getDraftState(t.taskId).completed)

  const handleMarkAllComplete = async () => {
    if (allCompleted) return
    // Single bulk write — avoids race condition from concurrent individual updates
    await onMarkAllComplete(tasks.map((t) => t.taskId))
  }

  // ── Empty state ──
  if (tasks.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center rounded-xl border border-dashed border-border/60 p-10 text-center gap-3">
        <ClipboardListIcon className="h-10 w-10 text-muted-foreground/30" />
        <div className="flex flex-col gap-1">
          <p className="text-sm font-medium text-muted-foreground">
            No checklist configured
          </p>
          <p className="text-xs text-muted-foreground/60">
            Ask your office to set up templates for this service type.
          </p>
        </div>
      </div>
    )
  }

  return (
    <div className="flex flex-col gap-3">
      {/* ── Mark All Complete button ── */}
      {!readOnly && (
        <Button
          type="button"
          onClick={handleMarkAllComplete}
          disabled={allCompleted}
          className={cn(
            "w-full h-12 text-base font-semibold rounded-xl transition-all cursor-pointer",
            allCompleted
              ? "bg-green-600/20 text-green-400 border border-green-600/30 cursor-default"
              : "bg-green-600 hover:bg-green-700 text-white shadow-lg shadow-green-900/20"
          )}
          aria-label={allCompleted ? "All tasks are complete" : "Mark all tasks as complete"}
        >
          <CheckSquare2Icon className="h-5 w-5 mr-2" />
          {allCompleted ? "All Tasks Complete" : "Mark All Complete"}
        </Button>
      )}

      {/* ── Task list ── */}
      <div className="rounded-xl border border-border/60 bg-card overflow-hidden">
        {/* Header */}
        <div className="px-4 py-2.5 bg-muted/30 border-b border-border/40 flex items-center justify-between">
          <span className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
            Tasks
          </span>
          <span className="text-xs text-muted-foreground/50 tabular-nums">
            {tasks.filter((t) => getDraftState(t.taskId).completed).length} / {tasks.length}
          </span>
        </div>

        {/* Task rows */}
        <div>
          {tasks.map((task) => {
            const state = getDraftState(task.taskId)
            return (
              <TaskRow
                key={task.taskId}
                task={task}
                completed={state.completed}
                notes={state.notes}
                onToggle={(completed) => onUpdate(task.taskId, completed, state.notes)}
                onNotesChange={(notes) => onUpdate(task.taskId, state.completed, notes)}
                readOnly={readOnly}
              />
            )
          })}
        </div>

        {/* Footer */}
        <div className="px-4 py-2 bg-muted/20 border-t border-border/40">
          <p className="text-[11px] text-muted-foreground/50">
            <span className="text-primary/60">*</span> Required task &nbsp;·&nbsp; Tap checkbox to complete &nbsp;·&nbsp; Add notes for exceptions
          </p>
        </div>
      </div>
    </div>
  )
}
