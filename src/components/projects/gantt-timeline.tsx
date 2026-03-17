"use client"

/**
 * gantt-timeline.tsx — Interactive Gantt chart wrapping @svar-ui/react-gantt
 *
 * Renders project phases as draggable task bars with:
 * - Drag-to-reschedule (move phase start/end dates)
 * - Resize-to-change-duration
 * - Dependency lines between phases (hard links only)
 * - Progress bars (completed tasks / total tasks)
 * - Status-driven color coding per phase
 * - Dark mode via WillowDark wrapper theme
 * - Today marker line
 * - Zoom controls (day / week / month)
 *
 * Per user decision: "Gantt timeline is interactive drag-to-reschedule"
 *
 * SVAR Gantt API reference:
 * - ITask: { id, text, start, end, progress }
 * - ILink: { id, source, target, type: "e2s" | "s2s" | "s2e" | "e2e" }
 * - onUpdatetask fires after drag/resize; we extract new start/end from it
 *
 * MEMORY.md: NEVER use oklch() in any map/paint properties (WebGL).
 * Use hex colors in gantt-dark-theme.css overrides.
 */

import { useCallback, useEffect, useRef, useState } from "react"
import dynamic from "next/dynamic"
import type { IApi, ITask, ILink, IScaleConfig } from "@svar-ui/react-gantt"
// SVAR Gantt CSS — import via direct path (exports map alias not needed)
// eslint-disable-next-line @typescript-eslint/ban-ts-comment
// @ts-ignore
import "../../../node_modules/@svar-ui/react-gantt/dist/index.css"
import "./gantt-dark-theme.css"
import { toLocalDateString } from "@/lib/date-utils"
import { updatePhaseDates } from "@/actions/projects-scheduling"
import type { GanttTask, GanttLink, PhaseShift } from "@/actions/projects-scheduling"

// ── Dynamic import with SSR disabled (SVAR Gantt is client-only) ─────────────
const Gantt = dynamic(
  () => import("@svar-ui/react-gantt").then((mod) => mod.Gantt),
  { ssr: false }
)

const WillowDark = dynamic(
  () => import("@svar-ui/react-gantt").then((mod) => mod.WillowDark),
  { ssr: false }
)

// ── Types ─────────────────────────────────────────────────────────────────────

interface GanttTimelineProps {
  /** Phase task bars */
  tasks: GanttTask[]
  /** Dependency links between phases */
  links: GanttLink[]
  /** Phase IDs that have weather warnings (for visual flag) */
  weatherAlertPhaseIds?: string[]
  /** Called after a drag/resize with the new dates + any cascaded shifts */
  onTaskMove?: (phaseId: string, newStart: string, newEnd: string, shifted: PhaseShift[]) => void
  /** Called when the data should be fully refreshed */
  onRefresh?: () => void
}

// ── Helpers ───────────────────────────────────────────────────────────────────

/**
 * Map GanttTask[] → ITask[] for SVAR Gantt consumption.
 *
 * SVAR expects start/end as Date objects.
 * We pass the status as a custom field so we can apply CSS classes later.
 */
function toSvarTasks(tasks: GanttTask[], weatherAlertIds: Set<string>): ITask[] {
  return tasks.map((t) => ({
    id: t.id,
    text: t.text,
    start: t.start,
    end: t.end,
    progress: t.progress,
    // Custom fields (stored on task for potential template access)
    status: t.status,
    is_outdoor: t.is_outdoor,
    has_weather_alert: weatherAlertIds.has(t.id),
    assigned_tech_id: t.assigned_tech_id,
  }))
}

/**
 * Map GanttLink[] → ILink[] for SVAR Gantt.
 * "e2s" = end-to-start (finish-to-start dependency)
 */
function toSvarLinks(links: GanttLink[]): ILink[] {
  return links.map((l) => ({
    id: l.id,
    source: l.source,
    target: l.target,
    type: l.type as ILink["type"],
  }))
}

// ── Status color map for legend ────────────────────────────────────────────────
const STATUS_COLORS: Record<string, { bg: string; label: string }> = {
  not_started: { bg: "#64748b", label: "Not Started" },
  in_progress: { bg: "#3b82f6", label: "In Progress" },
  complete: { bg: "#22c55e", label: "Complete" },
  on_hold: { bg: "#f59e0b", label: "On Hold" },
  skipped: { bg: "#374151", label: "Skipped" },
}

// ── Component ─────────────────────────────────────────────────────────────────

export function GanttTimeline({
  tasks,
  links,
  weatherAlertPhaseIds = [],
  onTaskMove,
  onRefresh,
}: GanttTimelineProps) {
  const [isSaving, setIsSaving] = useState(false)
  const [saveError, setSaveError] = useState<string | null>(null)
  const [zoomLevel, setZoomLevel] = useState(1) // 0=day, 1=week, 2=month

  const weatherAlertIds = new Set(weatherAlertPhaseIds)
  const svarTasks = toSvarTasks(tasks, weatherAlertIds)
  const svarLinks = toSvarLinks(links)

  // SVAR API ref for programmatic control (zoom, etc.)
  const ganttApiRef = useRef<IApi | null>(null)

  const handleInit = useCallback((api: IApi) => {
    ganttApiRef.current = api
  }, [])

  // ── Drag / resize handler ──────────────────────────────────────────────────
  const handleUpdateTask = useCallback(
    async (ev: { id: string | number; task: Partial<ITask> }) => {
      const { id, task } = ev
      if (!task.start || !task.end) return

      const phaseId = String(id)
      const newStart = toLocalDateString(task.start)
      const newEnd = toLocalDateString(task.end)

      setIsSaving(true)
      setSaveError(null)

      try {
        const result = await updatePhaseDates(phaseId, newStart, newEnd)

        if ("error" in result) {
          setSaveError(result.error)
          // Refresh to revert optimistic state
          onRefresh?.()
          return
        }

        onTaskMove?.(phaseId, newStart, newEnd, result.shifted)
        if (result.shifted.length > 0) {
          // Shifted phases means the data changed — trigger full refresh
          onRefresh?.()
        }
      } catch (err) {
        console.error("[GanttTimeline] updatePhaseDates error:", err)
        setSaveError("Failed to save schedule change")
        onRefresh?.()
      } finally {
        setIsSaving(false)
      }
    },
    [onTaskMove, onRefresh]
  )

  // ── Zoom controls ──────────────────────────────────────────────────────────
  const ZOOM_SCALES: IScaleConfig[][] = [
    // Day view — fine-grained
    [
      { unit: "week", step: 1, format: (d: Date) => `Week of ${d.toLocaleDateString("en-US", { month: "short", day: "numeric" })}` },
      { unit: "day", step: 1, format: (d: Date) => String(d.getDate()) },
    ],
    // Week view (default)
    [
      { unit: "month", step: 1, format: (d: Date) => d.toLocaleDateString("en-US", { month: "long", year: "numeric" }) },
      { unit: "week", step: 1, format: (d: Date) => `W${getISOWeek(d)}` },
    ],
    // Month view — high-level overview
    [
      { unit: "year", step: 1, format: (d: Date) => String(d.getFullYear()) },
      { unit: "month", step: 1, format: (d: Date) => d.toLocaleDateString("en-US", { month: "short" }) },
    ],
  ]

  const currentScales = ZOOM_SCALES[zoomLevel] ?? ZOOM_SCALES[1]!

  // Today marker
  const todayMarker = [{ start: new Date(), text: "Today", css: "wx-gantt-today" }]

  if (!tasks.length) {
    return (
      <div className="flex items-center justify-center h-48 text-sm text-muted-foreground italic">
        No phases scheduled yet. Add phases with start and end dates to see the timeline.
      </div>
    )
  }

  return (
    <div className="flex flex-col gap-3">
      {/* ── Toolbar ───────────────────────────────────────────────────────── */}
      <div className="flex items-center justify-between">
        {/* Zoom controls */}
        <div className="flex items-center gap-1">
          <span className="text-xs text-muted-foreground mr-2">Zoom:</span>
          {(["Day", "Week", "Month"] as const).map((label, i) => (
            <button
              key={label}
              type="button"
              onClick={() => setZoomLevel(i)}
              className={[
                "px-3 py-1 text-xs rounded-md border transition-colors",
                zoomLevel === i
                  ? "bg-primary text-primary-foreground border-primary"
                  : "border-border text-muted-foreground hover:text-foreground hover:border-muted-foreground",
              ].join(" ")}
            >
              {label}
            </button>
          ))}
        </div>

        {/* Save status */}
        <div className="text-xs text-muted-foreground">
          {isSaving && <span className="text-primary">Saving...</span>}
          {saveError && <span className="text-destructive">{saveError}</span>}
        </div>
      </div>

      {/* ── Legend ────────────────────────────────────────────────────────── */}
      <div className="flex items-center gap-4 flex-wrap">
        {Object.entries(STATUS_COLORS).map(([status, { bg, label }]) => (
          <div key={status} className="flex items-center gap-1.5">
            <div
              className="h-3 w-8 rounded-sm"
              style={{ backgroundColor: bg }}
            />
            <span className="text-xs text-muted-foreground">{label}</span>
          </div>
        ))}
        {weatherAlertPhaseIds.length > 0 && (
          <div className="flex items-center gap-1.5">
            <div className="h-3 w-8 rounded-sm border-2" style={{ borderColor: "#f97316", backgroundColor: "transparent" }} />
            <span className="text-xs text-muted-foreground">Weather Alert</span>
          </div>
        )}
      </div>

      {/* ── Gantt chart ───────────────────────────────────────────────────── */}
      <div className="gantt-container rounded-lg border border-border overflow-hidden">
        <WillowDark>
          <Gantt
            tasks={svarTasks}
            links={svarLinks}
            scales={currentScales}
            markers={todayMarker}
            cellHeight={38}
            scaleHeight={28}
            init={handleInit}
            onUpdatetask={handleUpdateTask}
            columns={[
              {
                id: "text",
                header: "Phase",
                width: 180,
                flexgrow: 0,
                resize: true,
              },
              {
                id: "start",
                header: "Start",
                width: 100,
                flexgrow: 0,
                template: (task: ITask) =>
                  task.start
                    ? new Date(task.start).toLocaleDateString("en-US", {
                        month: "short",
                        day: "numeric",
                      })
                    : "–",
              },
              {
                id: "end",
                header: "End",
                width: 100,
                flexgrow: 0,
                template: (task: ITask) =>
                  task.end
                    ? new Date(task.end).toLocaleDateString("en-US", {
                        month: "short",
                        day: "numeric",
                      })
                    : "–",
              },
            ]}
          />
        </WillowDark>
      </div>
    </div>
  )
}

// ── ISO week number helper ─────────────────────────────────────────────────────
function getISOWeek(date: Date): number {
  const tmp = new Date(date.valueOf())
  const dayNum = (date.getDay() + 6) % 7
  tmp.setDate(tmp.getDate() - dayNum + 3)
  const firstThursday = tmp.valueOf()
  tmp.setMonth(0, 1)
  if (tmp.getDay() !== 4) {
    tmp.setMonth(0, 1 + ((4 - tmp.getDay() + 7) % 7))
  }
  return 1 + Math.ceil((firstThursday - tmp.valueOf()) / 604800000)
}
