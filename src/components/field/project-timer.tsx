"use client"

/**
 * ProjectTimer — dual-mode time logger for project phases.
 *
 * Timer mode: Big start/stop button + running elapsed time display (HH:MM:SS).
 * Timer state stored in Dexie projectTaskDrafts to survive app close/reopen.
 *
 * Manual mode: Toggle to manual entry. Duration (hours + minutes), optional task
 * selector, notes. Submit logs time immediately via logManualTime action.
 *
 * Phase 12 Plan 12 (PROJ-48)
 */

import { useState, useEffect, useRef, useCallback } from "react"
import { useLiveQuery } from "dexie-react-hooks"
import { PlayIcon, SquareIcon, PencilIcon, ClockIcon, CheckIcon } from "lucide-react"
import { Button } from "@/components/ui/button"
import { toast } from "sonner"
import { offlineDb } from "@/lib/offline/db"
import type { ProjectTaskDraft } from "@/lib/offline/db"
import {
  startProjectTimer,
  stopProjectTimer,
  logManualTime,
} from "@/actions/projects-field"
import { cn } from "@/lib/utils"

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface ProjectTimerProps {
  projectId: string
  phaseId: string
  tasks: Array<{ id: string; name: string }>
  /** Server-side active timer (from getProjectPhaseDetail) */
  serverActiveTimerLogId: string | null
  serverActiveTimerStartTime: Date | null
  /** Already-logged time entries for display */
  timeLogs: Array<{
    id: string
    entry_type: string
    start_time: Date
    end_time: Date | null
    duration_minutes: number | null
    notes: string | null
    task_id: string | null
  }>
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function formatElapsed(ms: number): string {
  const totalSeconds = Math.floor(ms / 1000)
  const hours = Math.floor(totalSeconds / 3600)
  const minutes = Math.floor((totalSeconds % 3600) / 60)
  const seconds = totalSeconds % 60
  return [
    String(hours).padStart(2, "0"),
    String(minutes).padStart(2, "0"),
    String(seconds).padStart(2, "0"),
  ].join(":")
}

function formatDuration(minutes: number): string {
  if (minutes < 60) return `${minutes}m`
  const h = Math.floor(minutes / 60)
  const m = minutes % 60
  return m === 0 ? `${h}h` : `${h}h ${m}m`
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function ProjectTimer({
  projectId,
  phaseId,
  tasks,
  serverActiveTimerLogId,
  serverActiveTimerStartTime,
  timeLogs,
}: ProjectTimerProps) {
  // Draft key for Dexie (deterministic per phase)
  const draftKey = `${projectId}:${phaseId}`

  // ── Dexie draft (timer state persists across app close/reopen) ────────────
  const draft = useLiveQuery(
    () => offlineDb.projectTaskDrafts.get(draftKey),
    [draftKey]
  )

  // ── Mode: "timer" | "manual" ──────────────────────────────────────────────
  const [mode, setMode] = useState<"timer" | "manual">("timer")
  const [isSubmitting, setIsSubmitting] = useState(false)

  // ── Timer display state ────────────────────────────────────────────────────
  const [elapsedMs, setElapsedMs] = useState(0)
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null)

  // ── Manual entry state ─────────────────────────────────────────────────────
  const [manualHours, setManualHours] = useState("0")
  const [manualMinutes, setManualMinutes] = useState("30")
  const [manualTaskId, setManualTaskId] = useState<string>("")
  const [manualNotes, setManualNotes] = useState("")

  // Determine if timer is currently running
  // Timer is running if: Dexie draft says running, OR server has an open timer log
  const isRunning =
    draft?.timerRunning ??
    (serverActiveTimerLogId !== null && serverActiveTimerStartTime !== null)

  const activeTimeLogId =
    draft?.activeTimeLogId ?? serverActiveTimerLogId ?? null

  // ── Sync elapsed time from Dexie draft on mount ───────────────────────────
  useEffect(() => {
    if (!draft) {
      // No Dexie draft — check server-side timer
      if (serverActiveTimerStartTime) {
        const accumulated = Date.now() - serverActiveTimerStartTime.getTime()
        setElapsedMs(accumulated)
      }
      return
    }

    if (draft.timerRunning && draft.timerStartedAt) {
      const accumulated = draft.timerAccumulatedMs + (Date.now() - draft.timerStartedAt)
      setElapsedMs(accumulated)
    } else {
      setElapsedMs(draft.timerAccumulatedMs)
    }
  }, [draft, serverActiveTimerStartTime])

  // ── Ticker interval ───────────────────────────────────────────────────────
  useEffect(() => {
    if (isRunning) {
      timerRef.current = setInterval(() => {
        const startedAt = draft?.timerStartedAt ?? serverActiveTimerStartTime?.getTime() ?? Date.now()
        const accumulated = draft?.timerAccumulatedMs ?? 0
        setElapsedMs(accumulated + (Date.now() - startedAt))
      }, 1000)
    } else {
      if (timerRef.current) clearInterval(timerRef.current)
    }

    return () => {
      if (timerRef.current) clearInterval(timerRef.current)
    }
  }, [isRunning, draft?.timerStartedAt, draft?.timerAccumulatedMs, serverActiveTimerStartTime])

  // ── Start timer ───────────────────────────────────────────────────────────
  const handleStart = useCallback(async () => {
    setIsSubmitting(true)
    try {
      const result = await startProjectTimer(phaseId, draft?.activeTaskId ?? undefined)

      if ("error" in result) {
        toast.error(result.error)
        return
      }

      const timeLogId = result.data.timeLogId
      const now = Date.now()

      // Persist timer state to Dexie — survives app close/reopen
      const newDraft: ProjectTaskDraft = {
        id: draftKey,
        projectId,
        phaseId,
        timerRunning: true,
        timerStartedAt: now,
        timerAccumulatedMs: draft?.timerAccumulatedMs ?? 0,
        activeTaskId: draft?.activeTaskId ?? null,
        activeTimeLogId: timeLogId,
        taskCompletions: draft?.taskCompletions ?? {},
        status: "active",
        updatedAt: now,
      }

      await offlineDb.projectTaskDrafts.put(newDraft)
    } catch (err) {
      console.error("[ProjectTimer] start error:", err)
      toast.error("Failed to start timer")
    } finally {
      setIsSubmitting(false)
    }
  }, [phaseId, projectId, draftKey, draft])

  // ── Stop timer ────────────────────────────────────────────────────────────
  const handleStop = useCallback(async () => {
    if (!activeTimeLogId) return
    setIsSubmitting(true)
    try {
      const result = await stopProjectTimer(activeTimeLogId)

      if ("error" in result) {
        toast.error(result.error)
        return
      }

      const durationMinutes = result.data.durationMinutes

      // Update Dexie draft to idle
      await offlineDb.projectTaskDrafts.put({
        ...(draft ?? {
          id: draftKey,
          projectId,
          phaseId,
          taskCompletions: {},
          activeTaskId: null,
        }),
        id: draftKey,
        timerRunning: false,
        timerStartedAt: null,
        timerAccumulatedMs: 0, // Reset after stop
        activeTimeLogId: null,
        status: "idle" as const,
        updatedAt: Date.now(),
      })

      setElapsedMs(0)
      toast.success(`Time logged: ${formatDuration(durationMinutes)}`)
    } catch (err) {
      console.error("[ProjectTimer] stop error:", err)
      toast.error("Failed to stop timer")
    } finally {
      setIsSubmitting(false)
    }
  }, [activeTimeLogId, draft, draftKey, projectId, phaseId])

  // ── Manual submit ──────────────────────────────────────────────────────────
  const handleManualSubmit = useCallback(async () => {
    const hours = parseInt(manualHours, 10) || 0
    const minutes = parseInt(manualMinutes, 10) || 0
    const totalMinutes = hours * 60 + minutes

    if (totalMinutes === 0) {
      toast.error("Please enter a duration greater than 0")
      return
    }

    setIsSubmitting(true)
    try {
      const result = await logManualTime({
        phaseId,
        taskId: manualTaskId || undefined,
        durationMinutes: totalMinutes,
        notes: manualNotes || undefined,
      })

      if ("error" in result) {
        toast.error(result.error)
        return
      }

      toast.success(`Time logged: ${formatDuration(totalMinutes)}`)
      setManualHours("0")
      setManualMinutes("30")
      setManualTaskId("")
      setManualNotes("")
    } catch (err) {
      console.error("[ProjectTimer] manual submit error:", err)
      toast.error("Failed to log time")
    } finally {
      setIsSubmitting(false)
    }
  }, [phaseId, manualHours, manualMinutes, manualTaskId, manualNotes])

  // ── Derive completed time logs for display ─────────────────────────────────
  const completedLogs = timeLogs.filter((t) => t.end_time !== null)
  const totalLoggedMinutes = completedLogs.reduce(
    (sum, t) => sum + (t.duration_minutes ?? 0),
    0
  )

  // ── Render ─────────────────────────────────────────────────────────────────

  return (
    <div className="space-y-4">
      {/* Mode toggle */}
      <div className="flex items-center gap-2">
        <button
          type="button"
          onClick={() => setMode("timer")}
          className={cn(
            "flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-sm font-medium transition-colors cursor-pointer",
            mode === "timer"
              ? "bg-primary/15 text-primary border border-primary/30"
              : "text-muted-foreground hover:text-foreground border border-transparent"
          )}
        >
          <PlayIcon className="h-3.5 w-3.5" />
          Timer
        </button>
        <button
          type="button"
          onClick={() => setMode("manual")}
          className={cn(
            "flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-sm font-medium transition-colors cursor-pointer",
            mode === "manual"
              ? "bg-primary/15 text-primary border border-primary/30"
              : "text-muted-foreground hover:text-foreground border border-transparent"
          )}
        >
          <PencilIcon className="h-3.5 w-3.5" />
          Manual
        </button>
      </div>

      {/* Timer mode */}
      {mode === "timer" && (
        <div className="rounded-2xl border border-border/60 bg-card p-5 space-y-4">
          {/* Elapsed time display */}
          <div className="text-center">
            <div className={cn(
              "text-4xl font-mono font-bold tracking-wider tabular-nums transition-colors",
              isRunning ? "text-green-400" : "text-foreground"
            )}>
              {formatElapsed(elapsedMs)}
            </div>
            {isRunning && (
              <p className="text-xs text-green-400/70 mt-1 animate-pulse">
                Timer running
              </p>
            )}
          </div>

          {/* Task selector (optional) */}
          {tasks.length > 0 && (
            <div className="space-y-1.5">
              <label className="text-xs font-medium text-muted-foreground">
                Logging time for task (optional)
              </label>
              <select
                value={draft?.activeTaskId ?? ""}
                onChange={async (e) => {
                  const taskId = e.target.value || null
                  if (draft) {
                    await offlineDb.projectTaskDrafts.put({
                      ...draft,
                      activeTaskId: taskId,
                      updatedAt: Date.now(),
                    })
                  }
                }}
                disabled={isRunning}
                className="w-full rounded-lg border border-border/60 bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring disabled:opacity-50"
              >
                <option value="">Phase-level (no specific task)</option>
                {tasks.map((t) => (
                  <option key={t.id} value={t.id}>
                    {t.name}
                  </option>
                ))}
              </select>
            </div>
          )}

          {/* Start / Stop button */}
          <button
            type="button"
            onClick={isRunning ? handleStop : handleStart}
            disabled={isSubmitting}
            className={cn(
              "w-full rounded-2xl py-4 text-base font-semibold transition-all cursor-pointer flex items-center justify-center gap-3",
              isRunning
                ? "bg-red-600 hover:bg-red-700 text-white shadow-lg shadow-red-900/20"
                : "bg-green-600 hover:bg-green-700 text-white shadow-lg shadow-green-900/20",
              isSubmitting && "opacity-60 cursor-wait"
            )}
          >
            {isRunning ? (
              <>
                <SquareIcon className="h-6 w-6" />
                Stop Timer
              </>
            ) : (
              <>
                <PlayIcon className="h-6 w-6" />
                Start Timer
              </>
            )}
          </button>
        </div>
      )}

      {/* Manual entry mode */}
      {mode === "manual" && (
        <div className="rounded-2xl border border-border/60 bg-card p-5 space-y-4">
          <p className="text-sm text-muted-foreground">
            Log time without a running timer.
          </p>

          {/* Duration */}
          <div className="space-y-1.5">
            <label className="text-xs font-medium text-muted-foreground">Duration</label>
            <div className="flex items-center gap-2">
              <div className="flex items-center gap-1.5">
                <input
                  type="number"
                  min="0"
                  max="23"
                  value={manualHours}
                  onChange={(e) => setManualHours(e.target.value)}
                  className="w-16 rounded-lg border border-border/60 bg-background px-3 py-2 text-sm text-center focus:outline-none focus:ring-2 focus:ring-ring"
                />
                <span className="text-sm text-muted-foreground">h</span>
              </div>
              <div className="flex items-center gap-1.5">
                <input
                  type="number"
                  min="0"
                  max="59"
                  value={manualMinutes}
                  onChange={(e) => setManualMinutes(e.target.value)}
                  className="w-16 rounded-lg border border-border/60 bg-background px-3 py-2 text-sm text-center focus:outline-none focus:ring-2 focus:ring-ring"
                />
                <span className="text-sm text-muted-foreground">min</span>
              </div>
            </div>
          </div>

          {/* Task selector */}
          {tasks.length > 0 && (
            <div className="space-y-1.5">
              <label className="text-xs font-medium text-muted-foreground">
                Task (optional)
              </label>
              <select
                value={manualTaskId}
                onChange={(e) => setManualTaskId(e.target.value)}
                className="w-full rounded-lg border border-border/60 bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
              >
                <option value="">Phase-level</option>
                {tasks.map((t) => (
                  <option key={t.id} value={t.id}>
                    {t.name}
                  </option>
                ))}
              </select>
            </div>
          )}

          {/* Notes */}
          <div className="space-y-1.5">
            <label className="text-xs font-medium text-muted-foreground">
              Notes (optional)
            </label>
            <input
              type="text"
              placeholder="What did you work on?"
              value={manualNotes}
              onChange={(e) => setManualNotes(e.target.value)}
              className="w-full rounded-lg border border-border/60 bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
            />
          </div>

          <Button
            className="w-full h-12 rounded-xl bg-primary hover:bg-primary/90 text-primary-foreground font-semibold cursor-pointer"
            disabled={isSubmitting}
            onClick={handleManualSubmit}
          >
            <CheckIcon className="h-4 w-4 mr-2" />
            Log Time
          </Button>
        </div>
      )}

      {/* Time log history */}
      {completedLogs.length > 0 && (
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <p className="text-sm font-medium text-foreground">
              Time Logged
            </p>
            <span className="text-sm text-muted-foreground">
              Total: {formatDuration(totalLoggedMinutes)}
            </span>
          </div>
          <div className="space-y-1.5">
            {completedLogs.map((log) => {
              const taskName = log.task_id
                ? tasks.find((t) => t.id === log.task_id)?.name
                : null
              return (
                <div
                  key={log.id}
                  className="flex items-center justify-between rounded-lg border border-border/40 bg-muted/20 px-3 py-2"
                >
                  <div className="flex items-center gap-2 min-w-0">
                    <ClockIcon className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
                    <div className="min-w-0">
                      <p className="text-sm text-foreground truncate">
                        {taskName ?? "Phase work"}
                        {log.entry_type === "manual" && (
                          <span className="ml-1.5 text-xs text-muted-foreground">(manual)</span>
                        )}
                      </p>
                      {log.notes && (
                        <p className="text-xs text-muted-foreground truncate">{log.notes}</p>
                      )}
                    </div>
                  </div>
                  <span className="text-sm font-medium text-foreground shrink-0 ml-3">
                    {formatDuration(log.duration_minutes ?? 0)}
                  </span>
                </div>
              )
            })}
          </div>
        </div>
      )}
    </div>
  )
}
