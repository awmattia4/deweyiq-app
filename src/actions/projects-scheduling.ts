"use server"

/**
 * projects-scheduling.ts — Server actions for project phase scheduling,
 * dependency cascade, crew assignment, weather delay checks, and Gantt data.
 *
 * Phase 12 Plan 11: Gantt Timeline (PROJ-40, PROJ-41, PROJ-42, PROJ-43, PROJ-45)
 *
 * Key actions:
 * - updatePhaseDates: Update phase start/end dates, then cascade dependencies
 * - cascadeDependencies: Topological sort (Kahn's) to shift downstream phases (PROJ-40)
 * - assignCrewToPhase: Assign tech to phase with route conflict detection (PROJ-42)
 * - checkWeatherDelay: Check outdoor phases against Open-Meteo forecast (PROJ-45)
 * - holdProject / resumeProject: Status transitions (extends Plan 03 actions)
 * - getGanttData: Format phases + dependencies for @svar-ui/react-gantt (PROJ-41)
 */

import { revalidatePath } from "next/cache"
import { createClient } from "@/lib/supabase/server"
import { withRls } from "@/lib/db"
import type { SupabaseToken } from "@/lib/db"
import {
  projects,
  projectPhases,
  projectPhaseTasks,
  routeStops,
  customers,
  profiles,
} from "@/lib/db/schema"
import { eq, and, inArray, gte, lte, sql } from "drizzle-orm"
import { toLocalDateString } from "@/lib/date-utils"
import { fetchWeatherForecast, classifyWeatherDay } from "@/lib/weather/open-meteo"

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface GanttTask {
  id: string
  text: string
  start: Date
  end: Date
  progress: number
  /** Status drives color coding in the Gantt */
  status: "not_started" | "in_progress" | "complete" | "on_hold" | "skipped"
  is_outdoor: boolean
  assigned_tech_id: string | null
}

export interface GanttLink {
  id: string
  /** Source phase id (predecessor) */
  source: string
  /** Target phase id (dependent) */
  target: string
  /** "e2s" = end-to-start (finish-to-start dependency) */
  type: "e2s"
}

export interface GanttData {
  tasks: GanttTask[]
  links: GanttLink[]
}

export interface PhaseShift {
  phaseId: string
  phaseName: string
  oldStart: string
  oldEnd: string
  newStart: string
  newEnd: string
}

export interface WeatherDelayAlert {
  phaseId: string
  phaseName: string
  startDate: string
  weatherType: string
  weatherLabel: string
  forecastDate: string
}

export interface CrewConflict {
  date: string
  conflictType: "route_stop"
  note: string
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

async function getToken(): Promise<SupabaseToken | null> {
  const supabase = await createClient()
  const { data: claimsData } = await supabase.auth.getClaims()
  if (!claimsData?.claims) return null
  return claimsData.claims as SupabaseToken
}

/**
 * Parse YYYY-MM-DD string to Date (midnight local time via date-utils convention).
 * NEVER use new Date(str) directly — parses as UTC which causes off-by-one errors.
 */
function parseDateStr(str: string): Date {
  const [year, month, day] = str.split("-").map(Number)
  return new Date(year, month - 1, day)
}

/**
 * Add days to a Date and return YYYY-MM-DD string.
 */
function addDays(date: Date, days: number): string {
  const result = new Date(date)
  result.setDate(result.getDate() + days)
  return toLocalDateString(result)
}

/**
 * Get duration in days between two YYYY-MM-DD strings (inclusive).
 * Returns at least 1.
 */
function getDurationDays(start: string, end: string): number {
  const s = parseDateStr(start)
  const e = parseDateStr(end)
  const diff = Math.round((e.getTime() - s.getTime()) / (1000 * 60 * 60 * 24))
  return Math.max(1, diff)
}

// ---------------------------------------------------------------------------
// cascadeDependencies
// ---------------------------------------------------------------------------

/**
 * Core scheduling engine: Topological sort (Kahn's algorithm) over the phase
 * dependency DAG. For each phase with a 'hard' dependency, ensures start >=
 * predecessor.end + 1 day. Applies all shifts atomically and returns which
 * phases moved.
 *
 * Per research Pitfall 6: cascade logic lives in TypeScript (not SQL) so it
 * is testable and avoids recursive CTEs.
 */
export async function cascadeDependencies(
  projectId: string
): Promise<{ shifted: PhaseShift[] } | { error: string }> {
  const token = await getToken()
  if (!token) return { error: "Not authenticated" }

  try {
    // Fetch all phases for the project
    const phases = await withRls(token, (db) =>
      db
        .select({
          id: projectPhases.id,
          name: projectPhases.name,
          sort_order: projectPhases.sort_order,
          dependency_phase_id: projectPhases.dependency_phase_id,
          dependency_type: projectPhases.dependency_type,
          estimated_start_date: projectPhases.estimated_start_date,
          estimated_end_date: projectPhases.estimated_end_date,
          status: projectPhases.status,
        })
        .from(projectPhases)
        .where(eq(projectPhases.project_id, projectId))
    )

    if (phases.length === 0) return { shifted: [] }

    // Build adjacency structures for Kahn's algorithm
    // adj[a] = list of phase ids that depend on a (a → deps of a)
    const adj = new Map<string, string[]>()
    // in-degree[b] = number of hard predecessors b has
    const inDegree = new Map<string, number>()
    // predecessorId[b] = id of b's hard predecessor (for date cascade)
    const hardPredecessor = new Map<string, string>()

    for (const p of phases) {
      adj.set(p.id, [])
      inDegree.set(p.id, 0)
    }

    for (const p of phases) {
      if (p.dependency_phase_id && p.dependency_type === "hard") {
        const deps = adj.get(p.dependency_phase_id)
        if (deps) {
          deps.push(p.id)
          inDegree.set(p.id, (inDegree.get(p.id) ?? 0) + 1)
          hardPredecessor.set(p.id, p.dependency_phase_id)
        }
      }
    }

    // Kahn's topological sort
    const queue: string[] = []
    for (const [id, deg] of inDegree.entries()) {
      if (deg === 0) queue.push(id)
    }

    const topoOrder: string[] = []
    while (queue.length > 0) {
      const curr = queue.shift()!
      topoOrder.push(curr)
      for (const neighbor of adj.get(curr) ?? []) {
        const newDeg = (inDegree.get(neighbor) ?? 0) - 1
        inDegree.set(neighbor, newDeg)
        if (newDeg === 0) queue.push(neighbor)
      }
    }

    // Map phase id → mutable date state (starts with DB values)
    const dateState = new Map<
      string,
      { start: string; end: string; name: string }
    >()
    for (const p of phases) {
      dateState.set(p.id, {
        start: p.estimated_start_date ?? toLocalDateString(new Date()),
        end: p.estimated_end_date ?? toLocalDateString(new Date()),
        name: p.name,
      })
    }

    // Process in topological order — shift phases where hard predecessor ends after phase start
    const shifted: PhaseShift[] = []

    for (const phaseId of topoOrder) {
      const predecessorId = hardPredecessor.get(phaseId)
      if (!predecessorId) continue

      const pred = dateState.get(predecessorId)
      const phase = dateState.get(phaseId)
      if (!pred || !phase) continue

      // Hard dependency: phase must start at least 1 day after predecessor ends
      const minStart = addDays(parseDateStr(pred.end), 1)

      if (phase.start < minStart) {
        // Shift this phase forward
        const originalDuration = getDurationDays(phase.start, phase.end)
        const oldStart = phase.start
        const oldEnd = phase.end
        const newStart = minStart
        const newEnd = addDays(parseDateStr(newStart), originalDuration - 1)

        dateState.set(phaseId, { start: newStart, end: newEnd, name: phase.name })
        shifted.push({
          phaseId,
          phaseName: phase.name,
          oldStart,
          oldEnd,
          newStart,
          newEnd,
        })
      }
    }

    if (shifted.length === 0) return { shifted: [] }

    // Apply all shifts in separate updates (withRls doesn't support batch updates with different WHERE)
    const now = new Date()
    for (const shift of shifted) {
      await withRls(token, (db) =>
        db
          .update(projectPhases)
          .set({
            estimated_start_date: shift.newStart,
            estimated_end_date: shift.newEnd,
            updated_at: now,
          })
          .where(eq(projectPhases.id, shift.phaseId))
      )
    }

    // Update project.estimated_completion_date to the latest phase end
    let latestEnd: string | null = null
    for (const state of dateState.values()) {
      if (!latestEnd || state.end > latestEnd) {
        latestEnd = state.end
      }
    }
    if (latestEnd) {
      // Fetch activity log to append cascade note
      const [projectRow] = await withRls(token, (db) =>
        db
          .select({ activity_log: projects.activity_log })
          .from(projects)
          .where(eq(projects.id, projectId))
          .limit(1)
      )

      const cascadeNote =
        shifted.length === 1
          ? `Auto-shifted phase "${shifted[0].phaseName}" to ${shifted[0].newStart}`
          : `Auto-shifted ${shifted.length} phases due to dependency cascade`

      const updatedLog = [
        ...(projectRow?.activity_log ?? []),
        {
          type: "dependency_cascade",
          at: now.toISOString(),
          by_id: token.sub,
          note: cascadeNote,
        },
      ]

      await withRls(token, (db) =>
        db
          .update(projects)
          .set({
            estimated_completion_date: latestEnd!,
            last_activity_at: now,
            activity_log: updatedLog,
            updated_at: now,
          })
          .where(eq(projects.id, projectId))
      )
    }

    revalidatePath(`/projects/${projectId}`)
    revalidatePath(`/projects/${projectId}/timeline`)
    return { shifted }
  } catch (err) {
    console.error("[cascadeDependencies]", err)
    return { error: "Failed to cascade dependencies" }
  }
}

// ---------------------------------------------------------------------------
// updatePhaseDates
// ---------------------------------------------------------------------------

/**
 * Update a phase's estimated start and end dates, then run cascadeDependencies
 * to shift downstream phases. Returns the full list of shifted phases.
 */
export async function updatePhaseDates(
  phaseId: string,
  newStartDate: string,
  newEndDate: string
): Promise<{ projectId: string; shifted: PhaseShift[] } | { error: string }> {
  const token = await getToken()
  if (!token) return { error: "Not authenticated" }

  try {
    const now = new Date()

    // Fetch the phase to get its project_id and existing dates
    const [phase] = await withRls(token, (db) =>
      db
        .select({
          id: projectPhases.id,
          name: projectPhases.name,
          project_id: projectPhases.project_id,
          estimated_start_date: projectPhases.estimated_start_date,
          estimated_end_date: projectPhases.estimated_end_date,
        })
        .from(projectPhases)
        .where(eq(projectPhases.id, phaseId))
        .limit(1)
    )

    if (!phase) return { error: "Phase not found" }

    // Apply new dates
    await withRls(token, (db) =>
      db
        .update(projectPhases)
        .set({
          estimated_start_date: newStartDate,
          estimated_end_date: newEndDate,
          updated_at: now,
        })
        .where(eq(projectPhases.id, phaseId))
    )

    // Append activity log entry on the project
    const [projectRow] = await withRls(token, (db) =>
      db
        .select({ activity_log: projects.activity_log })
        .from(projects)
        .where(eq(projects.id, phase.project_id))
        .limit(1)
    )

    const updatedLog = [
      ...(projectRow?.activity_log ?? []),
      {
        type: "phase_rescheduled",
        at: now.toISOString(),
        by_id: token.sub,
        note: `Phase "${phase.name}" rescheduled: ${newStartDate} – ${newEndDate}`,
      },
    ]

    await withRls(token, (db) =>
      db
        .update(projects)
        .set({
          last_activity_at: now,
          activity_log: updatedLog,
          updated_at: now,
        })
        .where(eq(projects.id, phase.project_id))
    )

    // Run dependency cascade
    const cascadeResult = await cascadeDependencies(phase.project_id)
    const shifted = "error" in cascadeResult ? [] : cascadeResult.shifted

    revalidatePath(`/projects/${phase.project_id}`)
    revalidatePath(`/projects/${phase.project_id}/timeline`)
    return { projectId: phase.project_id, shifted }
  } catch (err) {
    console.error("[updatePhaseDates]", err)
    return { error: "Failed to update phase dates" }
  }
}

// ---------------------------------------------------------------------------
// assignCrewToPhase
// ---------------------------------------------------------------------------

/**
 * Assign a tech to a project phase. Checks for route stop conflicts in the
 * phase's date range. Returns a warning if conflicts exist but does NOT block
 * assignment — office can override (PROJ-42).
 */
export async function assignCrewToPhase(
  phaseId: string,
  techId: string
): Promise<
  | { success: true; conflicts: CrewConflict[] }
  | { error: string }
> {
  const token = await getToken()
  if (!token) return { error: "Not authenticated" }

  try {
    const now = new Date()

    // Fetch the phase dates
    const [phase] = await withRls(token, (db) =>
      db
        .select({
          id: projectPhases.id,
          name: projectPhases.name,
          project_id: projectPhases.project_id,
          estimated_start_date: projectPhases.estimated_start_date,
          estimated_end_date: projectPhases.estimated_end_date,
        })
        .from(projectPhases)
        .where(eq(projectPhases.id, phaseId))
        .limit(1)
    )

    if (!phase) return { error: "Phase not found" }

    // Check for route stop conflicts in date range
    const conflicts: CrewConflict[] = []

    if (phase.estimated_start_date && phase.estimated_end_date) {
      const conflictingStops = await withRls(token, (db) =>
        db
          .select({
            scheduled_date: routeStops.scheduled_date,
          })
          .from(routeStops)
          .where(
            and(
              eq(routeStops.tech_id, techId),
              gte(routeStops.scheduled_date, phase.estimated_start_date!),
              lte(routeStops.scheduled_date, phase.estimated_end_date!)
            )
          )
      )

      for (const stop of conflictingStops) {
        conflicts.push({
          date: stop.scheduled_date,
          conflictType: "route_stop",
          note: `Tech has service route stops on ${stop.scheduled_date}`,
        })
      }
    }

    // Update the phase assignment (office overrides conflict warnings)
    await withRls(token, (db) =>
      db
        .update(projectPhases)
        .set({
          assigned_tech_id: techId,
          updated_at: now,
        })
        .where(eq(projectPhases.id, phaseId))
    )

    // Log the assignment
    const [projectRow] = await withRls(token, (db) =>
      db
        .select({ activity_log: projects.activity_log })
        .from(projects)
        .where(eq(projects.id, phase.project_id))
        .limit(1)
    )

    // Get tech name for activity log
    const [techProfile] = await withRls(token, (db) =>
      db
        .select({ full_name: profiles.full_name })
        .from(profiles)
        .where(eq(profiles.id, techId))
        .limit(1)
    )

    const techName = techProfile?.full_name ?? "Unknown"
    const conflictNote =
      conflicts.length > 0
        ? ` (${conflicts.length} route stop conflict${conflicts.length > 1 ? "s" : ""} noted)`
        : ""

    const updatedLog = [
      ...(projectRow?.activity_log ?? []),
      {
        type: "crew_assigned",
        at: now.toISOString(),
        by_id: token.sub,
        note: `${techName} assigned to phase "${phase.name}"${conflictNote}`,
      },
    ]

    await withRls(token, (db) =>
      db
        .update(projects)
        .set({
          last_activity_at: now,
          activity_log: updatedLog,
          updated_at: now,
        })
        .where(eq(projects.id, phase.project_id))
    )

    revalidatePath(`/projects/${phase.project_id}`)
    return { success: true, conflicts }
  } catch (err) {
    console.error("[assignCrewToPhase]", err)
    return { error: "Failed to assign crew to phase" }
  }
}

// ---------------------------------------------------------------------------
// checkWeatherDelay
// ---------------------------------------------------------------------------

/**
 * Check outdoor phases with is_outdoor=true that are in_progress or starting
 * within 7 days for severe weather conditions. Returns alerts — does NOT
 * auto-delay (office decides, per PROJ-45).
 *
 * Uses the project's customer lat/lng for location-based weather lookup.
 */
export async function checkWeatherDelay(
  projectId: string
): Promise<{ alerts: WeatherDelayAlert[] } | { error: string }> {
  const token = await getToken()
  if (!token) return { error: "Not authenticated" }

  try {
    const today = toLocalDateString(new Date())
    const sevenDaysOut = addDays(new Date(), 7)
    // sevenDaysOut is a YYYY-MM-DD string from addDays helper

    // Fetch outdoor phases that are active or starting soon
    const outdoorPhases = await withRls(token, (db) =>
      db
        .select({
          id: projectPhases.id,
          name: projectPhases.name,
          estimated_start_date: projectPhases.estimated_start_date,
          estimated_end_date: projectPhases.estimated_end_date,
          status: projectPhases.status,
        })
        .from(projectPhases)
        .where(
          and(
            eq(projectPhases.project_id, projectId),
            eq(projectPhases.is_outdoor, true)
          )
        )
    )

    // Filter to phases in_progress or starting within 7 days
    const activePhasesForWeather = outdoorPhases.filter((p) => {
      if (p.status === "in_progress") return true
      if (p.status === "not_started" && p.estimated_start_date) {
        return p.estimated_start_date <= sevenDaysOut
      }
      return false
    })

    if (activePhasesForWeather.length === 0) return { alerts: [] }

    // Get project's customer location for weather lookup
    const [projectWithCustomer] = await withRls(token, (db) =>
      db
        .select({
          customer_lat: customers.lat,
          customer_lng: customers.lng,
        })
        .from(projects)
        .leftJoin(customers, eq(customers.id, projects.customer_id))
        .where(eq(projects.id, projectId))
        .limit(1)
    )

    const lat = projectWithCustomer?.customer_lat
    const lng = projectWithCustomer?.customer_lng

    if (!lat || !lng) return { alerts: [] }

    // Fetch 7-day weather forecast
    const forecast = await fetchWeatherForecast(lat, lng)
    if (!forecast) return { alerts: [] }

    const alerts: WeatherDelayAlert[] = []

    for (const phase of activePhasesForWeather) {
      if (!phase.estimated_start_date) continue

      // Check each forecast day that overlaps with this phase
      for (let i = 0; i < forecast.daily.time.length; i++) {
        const forecastDate = forecast.daily.time[i]
        if (!forecastDate) continue

        // Only check dates within the phase window
        if (forecastDate < today || forecastDate > sevenDaysOut) continue
        if (phase.estimated_end_date && forecastDate > phase.estimated_end_date) continue

        const classification = classifyWeatherDay(forecast, i)

        if (classification?.shouldReschedule) {
          alerts.push({
            phaseId: phase.id,
            phaseName: phase.name,
            startDate: phase.estimated_start_date,
            weatherType: classification.type,
            weatherLabel: classification.label,
            forecastDate,
          })
          // One alert per phase (first bad weather day is enough)
          break
        }
      }
    }

    return { alerts }
  } catch (err) {
    console.error("[checkWeatherDelay]", err)
    return { error: "Failed to check weather delays" }
  }
}

// ---------------------------------------------------------------------------
// getGanttData
// ---------------------------------------------------------------------------

/**
 * Fetch project phases and format for @svar-ui/react-gantt.
 *
 * Task format: { id, text, start, end, progress, status, is_outdoor, assigned_tech_id }
 * Link format: { id, source, target, type: "e2s" } (end-to-start = finish-to-start)
 *
 * Progress is computed as: completed tasks / total tasks (0-1 range).
 */
export async function getGanttData(
  projectId: string
): Promise<GanttData | { error: string }> {
  const token = await getToken()
  if (!token) return { error: "Not authenticated" }

  try {
    // Fetch phases
    const phases = await withRls(token, (db) =>
      db
        .select({
          id: projectPhases.id,
          name: projectPhases.name,
          sort_order: projectPhases.sort_order,
          status: projectPhases.status,
          dependency_phase_id: projectPhases.dependency_phase_id,
          dependency_type: projectPhases.dependency_type,
          estimated_start_date: projectPhases.estimated_start_date,
          estimated_end_date: projectPhases.estimated_end_date,
          is_outdoor: projectPhases.is_outdoor,
          assigned_tech_id: projectPhases.assigned_tech_id,
        })
        .from(projectPhases)
        .where(eq(projectPhases.project_id, projectId))
        .orderBy(projectPhases.sort_order)
    )

    if (phases.length === 0) return { tasks: [], links: [] }

    // Fetch task completion counts for all phases via LEFT JOIN + GROUP BY
    // (no correlated subqueries per MEMORY.md RLS pitfalls)
    const phaseIds = phases.map((p) => p.id)
    const taskCountRows = await withRls(token, (db) =>
      db
        .select({
          phase_id: projectPhaseTasks.phase_id,
          total: sql<number>`count(*)::int`,
          completed: sql<number>`count(*) filter (where ${projectPhaseTasks.is_completed})::int`,
        })
        .from(projectPhaseTasks)
        .where(inArray(projectPhaseTasks.phase_id, phaseIds))
        .groupBy(projectPhaseTasks.phase_id)
    )

    const taskCountMap = new Map<string, { total: number; completed: number }>()
    for (const row of taskCountRows) {
      taskCountMap.set(row.phase_id, {
        total: row.total,
        completed: row.completed,
      })
    }

    // Today as fallback for phases with no dates
    const today = new Date()
    const tomorrow = new Date(today)
    tomorrow.setDate(tomorrow.getDate() + 1)

    // Build Gantt tasks
    const tasks: GanttTask[] = phases.map((phase) => {
      const counts = taskCountMap.get(phase.id)
      const progress =
        counts && counts.total > 0
          ? Math.round((counts.completed / counts.total) * 100) / 100
          : 0

      const start = phase.estimated_start_date
        ? parseDateStr(phase.estimated_start_date)
        : today
      const end = phase.estimated_end_date
        ? parseDateStr(phase.estimated_end_date)
        : tomorrow

      return {
        id: phase.id,
        text: phase.name,
        start,
        end,
        progress,
        status: (phase.status as GanttTask["status"]) ?? "not_started",
        is_outdoor: phase.is_outdoor,
        assigned_tech_id: phase.assigned_tech_id,
      }
    })

    // Build Gantt links from hard dependencies only
    const links: GanttLink[] = phases
      .filter((p) => p.dependency_phase_id && p.dependency_type === "hard")
      .map((p) => ({
        id: `${p.dependency_phase_id}-${p.id}`,
        source: p.dependency_phase_id!,
        target: p.id,
        type: "e2s" as const,
      }))

    return { tasks, links }
  } catch (err) {
    console.error("[getGanttData]", err)
    return { error: "Failed to load Gantt data" }
  }
}
