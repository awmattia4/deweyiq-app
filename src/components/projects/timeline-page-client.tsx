"use client"

/**
 * timeline-page-client.tsx — Client wrapper for the Gantt timeline page.
 *
 * Manages:
 * - Project nav header (back to project detail, project name)
 * - Weather alert banner for outdoor phases with bad forecast
 * - Auto-schedule button (runs dependency cascade on demand)
 * - GanttTimeline component with drag-to-reschedule
 * - Data refresh after moves
 *
 * Design: matches the established page patterns (plan 09-10 sub pages as reference).
 */

import { useCallback, useState } from "react"
import Link from "next/link"
import { useRouter } from "next/navigation"
import { GanttTimeline } from "@/components/projects/gantt-timeline"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { cascadeDependencies } from "@/actions/projects-scheduling"
import type { ProjectDetail } from "@/actions/projects"
import type { GanttTask, GanttLink, WeatherDelayAlert, PhaseShift } from "@/actions/projects-scheduling"

interface TimelinePageClientProps {
  project: ProjectDetail
  initialTasks: GanttTask[]
  initialLinks: GanttLink[]
  initialWeatherAlerts: WeatherDelayAlert[]
}

/**
 * TimelinePageClient — tabbed-style Gantt timeline with nav + auto-schedule.
 */
export function TimelinePageClient({
  project,
  initialTasks,
  initialLinks,
  initialWeatherAlerts,
}: TimelinePageClientProps) {
  const router = useRouter()

  const [tasks, setTasks] = useState(initialTasks)
  const [links] = useState(initialLinks)
  const [weatherAlerts] = useState(initialWeatherAlerts)
  const [cascading, setCascading] = useState(false)
  const [cascadeResult, setCascadeResult] = useState<PhaseShift[] | null>(null)
  const [cascadeError, setCascadeError] = useState<string | null>(null)

  const weatherAlertPhaseIds = weatherAlerts.map((a) => a.phaseId)

  // ── Auto-schedule: run dependency cascade and refresh ──────────────────────
  const handleAutoSchedule = useCallback(async () => {
    setCascading(true)
    setCascadeResult(null)
    setCascadeError(null)

    try {
      const result = await cascadeDependencies(project.id)

      if ("error" in result) {
        setCascadeError(result.error)
        return
      }

      setCascadeResult(result.shifted)
      // Refresh the full page to get updated task dates
      router.refresh()
    } catch (err) {
      console.error("[TimelinePageClient] cascadeDependencies error:", err)
      setCascadeError("Failed to auto-schedule phases")
    } finally {
      setCascading(false)
    }
  }, [project.id, router])

  // ── After drag/resize, update local task state optimistically ─────────────
  const handleTaskMove = useCallback(
    (phaseId: string, newStart: string, newEnd: string, shifted: PhaseShift[]) => {
      setTasks((prev) =>
        prev.map((t) => {
          if (t.id === phaseId) {
            return {
              ...t,
              start: parseLocalDate(newStart),
              end: parseLocalDate(newEnd),
            }
          }
          // Apply any cascaded shifts
          const shift = shifted.find((s) => s.phaseId === t.id)
          if (shift) {
            return {
              ...t,
              start: parseLocalDate(shift.newStart),
              end: parseLocalDate(shift.newEnd),
            }
          }
          return t
        })
      )
    },
    []
  )

  const handleRefresh = useCallback(() => {
    router.refresh()
  }, [router])

  return (
    <div className="flex flex-col min-h-0 h-full">
      {/* ── Page header ─────────────────────────────────────────────────── */}
      <div className="shrink-0 border-b border-border px-6 py-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3 min-w-0">
            <Link
              href={`/projects/${project.id}`}
              className="text-sm text-muted-foreground hover:text-foreground transition-colors shrink-0"
            >
              ← {project.project_number ?? "Project"}
            </Link>
            <span className="text-muted-foreground shrink-0">/</span>
            <h1 className="text-base font-semibold truncate">
              {project.name} — Timeline
            </h1>
          </div>

          <Button
            variant="outline"
            size="sm"
            onClick={handleAutoSchedule}
            disabled={cascading}
            className="shrink-0"
          >
            {cascading ? "Scheduling..." : "Auto-Schedule"}
          </Button>
        </div>

        {/* Auto-schedule result notification */}
        {cascadeResult !== null && (
          <div className="mt-2 text-sm">
            {cascadeResult.length === 0 ? (
              <span className="text-muted-foreground">
                All phases are already in dependency order.
              </span>
            ) : (
              <span className="text-primary">
                {cascadeResult.length} phase{cascadeResult.length > 1 ? "s" : ""} rescheduled to fix dependency order.
              </span>
            )}
          </div>
        )}
        {cascadeError && (
          <div className="mt-2 text-sm text-destructive">{cascadeError}</div>
        )}
      </div>

      {/* ── Weather alert banner ─────────────────────────────────────────── */}
      {weatherAlerts.length > 0 && (
        <div className="shrink-0 bg-amber-950/30 border-b border-amber-800/50 px-6 py-3">
          <div className="flex items-start gap-2">
            <div className="flex-1">
              <p className="text-sm font-medium text-amber-200">
                Weather Alert — {weatherAlerts.length} outdoor phase{weatherAlerts.length > 1 ? "s" : ""} affected
              </p>
              <div className="flex flex-wrap gap-2 mt-1">
                {weatherAlerts.map((alert) => (
                  <Badge
                    key={`${alert.phaseId}-${alert.forecastDate}`}
                    variant="outline"
                    className="text-xs border-amber-700 text-amber-300 bg-amber-950/50"
                  >
                    {alert.phaseName}: {alert.weatherLabel} on {formatDate(alert.forecastDate)}
                  </Badge>
                ))}
              </div>
              <p className="text-xs text-amber-400 mt-1">
                Review forecast and decide whether to delay. Use the Phases tab to update dates.
              </p>
            </div>
          </div>
        </div>
      )}

      {/* ── Gantt chart ──────────────────────────────────────────────────── */}
      <div className="flex-1 overflow-auto p-6">
        <GanttTimeline
          tasks={tasks}
          links={links}
          weatherAlertPhaseIds={weatherAlertPhaseIds}
          onTaskMove={handleTaskMove}
          onRefresh={handleRefresh}
        />
      </div>
    </div>
  )
}

// ── Helpers ────────────────────────────────────────────────────────────────────

/** Parse YYYY-MM-DD as local midnight (avoids UTC off-by-one from new Date(str)). */
function parseLocalDate(str: string): Date {
  const [y, m, d] = str.split("-").map(Number)
  return new Date(y, m - 1, d)
}

/** Format YYYY-MM-DD as "Mar 17" style. */
function formatDate(str: string): string {
  const date = parseLocalDate(str)
  return date.toLocaleDateString("en-US", { month: "short", day: "numeric" })
}
