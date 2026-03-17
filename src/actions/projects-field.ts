"use server"

/**
 * projects-field.ts — Server actions for tech field project operations.
 *
 * Phase 12 Plan 12: Field app project mode
 *
 * Actions:
 * - getTechProjects: projects assigned to current tech (not_started or in_progress phases)
 * - getProjectPhaseDetail: phase tasks, time logs, photos for the tech view
 * - completeTask / uncompleteTask: toggle task completion
 * - startProjectTimer / stopProjectTimer: timer-based time logging
 * - logManualTime: manual time entry
 * - uploadProjectPhoto: photo upload to Supabase Storage
 * - flagIssue: create issue flag + office alert
 * - logMaterialUsage: log material used from field
 * - completePhase: validate + mark phase complete + notify office
 * - assignEquipment / returnEquipment: site equipment tracking
 * - suggestProjectInRoute: route position suggestion for project phase
 * - getTechProjectBriefing: daily briefing data for the Projects tab
 */

import { revalidatePath } from "next/cache"
import { createClient } from "@/lib/supabase/server"
import { withRls, adminDb } from "@/lib/db"
import type { SupabaseToken } from "@/lib/db"
import {
  projects,
  projectPhases,
  projectPhaseTasks,
  projectTimeLogs,
  projectPhotos,
  projectIssueFlags,
  projectMaterials,
  projectMaterialUsage,
  projectEquipmentAssignments,
  projectPhaseSubcontractors,
  projectInspections,
  subcontractors,
  customers,
  alerts,
  timeEntries,
} from "@/lib/db/schema"
import { eq, and, inArray, gte, lte, or, isNull, desc, asc, sql } from "drizzle-orm"
import { toLocalDateString } from "@/lib/date-utils"
// PROJ-71: Quality checklist validation — imported here to wire into completePhase
import { getQualityChecklist } from "@/actions/projects-inspections"

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface TechProjectSummary {
  id: string
  name: string
  projectNumber: string | null
  customerName: string
  address: string | null
  currentPhaseName: string | null
  currentPhaseId: string | null
  currentPhaseStatus: string | null
  totalTasks: number
  completedTasks: number
  estimatedStartDate: string | null
  estimatedEndDate: string | null
  hasActiveTimer: boolean
}

export interface ProjectPhaseDetailForTech {
  phaseId: string
  phaseName: string
  phaseStatus: string
  projectId: string
  projectName: string
  customerName: string
  projectAddress: string | null
  tasks: Array<{
    id: string
    name: string
    is_completed: boolean
    is_required: boolean
    notes: string | null
    sort_order: number
    completed_at: Date | null
    completed_by: string | null
  }>
  timeLogs: Array<{
    id: string
    entry_type: string
    start_time: Date
    end_time: Date | null
    duration_minutes: number | null
    notes: string | null
    task_id: string | null
  }>
  photoCount: number
  activeTimerLogId: string | null
  activeTimerStartTime: Date | null
  materials: Array<{
    id: string
    name: string
    unit: string
    quantity_estimated: string
    quantity_used: string
  }>
  equipment: Array<{
    id: string
    equipment_description: string
    assigned_date: string
    returned_date: string | null
  }>
}

export interface ProjectBriefingData {
  todayPhases: Array<{
    projectId: string
    projectName: string
    customerName: string
    phaseName: string
    phaseId: string
    tasksTotal: number
    tasksComplete: number
    estimatedEndDate: string | null
  }>
  materialsNeeded: Array<{
    projectName: string
    materialName: string
    unit: string
    quantityNeeded: string
  }>
  subsOnSite: Array<{
    projectName: string
    subName: string
    scopeOfWork: string | null
  }>
  upcomingInspections: Array<{
    projectName: string
    inspectionType: string
    scheduledDate: string | null
  }>
}

// ---------------------------------------------------------------------------
// Auth helper
// ---------------------------------------------------------------------------

async function getToken(): Promise<SupabaseToken | null> {
  const supabase = await createClient()
  const { data: claimsData } = await supabase.auth.getClaims()
  if (!claimsData?.claims) return null
  return claimsData.claims as SupabaseToken
}

// ---------------------------------------------------------------------------
// getTechProjects
// ---------------------------------------------------------------------------

/**
 * getTechProjects — Fetch projects where the current user is assigned_tech_id
 * on at least one phase that is 'not_started' or 'in_progress'.
 *
 * Uses LEFT JOIN + GROUP BY — no correlated subqueries (per MEMORY.md RLS pitfall).
 */
export async function getTechProjects(): Promise<
  TechProjectSummary[] | { error: string }
> {
  const token = await getToken()
  if (!token) return { error: "Not authenticated" }

  try {
    const techId = token.sub as string

    // Fetch active phases assigned to this tech
    const assignedPhases = await withRls(token, (db) =>
      db
        .select({
          phaseId: projectPhases.id,
          phaseName: projectPhases.name,
          phaseStatus: projectPhases.status,
          projectId: projectPhases.project_id,
          estimatedStartDate: projectPhases.estimated_start_date,
          estimatedEndDate: projectPhases.estimated_end_date,
        })
        .from(projectPhases)
        .where(
          and(
            eq(projectPhases.assigned_tech_id, techId),
            inArray(projectPhases.status, ["not_started", "in_progress"])
          )
        )
        .orderBy(asc(projectPhases.sort_order))
    )

    if (assignedPhases.length === 0) return []

    const projectIds = [...new Set(assignedPhases.map((p) => p.projectId))]
    const phaseIds = assignedPhases.map((p) => p.phaseId)

    // Fetch project info + customer name
    const projectRows = await withRls(token, (db) =>
      db
        .select({
          id: projects.id,
          name: projects.name,
          project_number: projects.project_number,
          customerName: customers.full_name,
          // Pool address is on the customer or pool — use customer address as fallback
          address: customers.address,
        })
        .from(projects)
        .leftJoin(customers, eq(customers.id, projects.customer_id))
        .where(inArray(projects.id, projectIds))
    )

    // Fetch task counts per phase
    const taskRows = await withRls(token, (db) =>
      db
        .select({
          phase_id: projectPhaseTasks.phase_id,
          id: projectPhaseTasks.id,
          is_completed: projectPhaseTasks.is_completed,
        })
        .from(projectPhaseTasks)
        .where(inArray(projectPhaseTasks.phase_id, phaseIds))
    )

    // Fetch active timer logs (end_time IS NULL)
    const activeTimers = await withRls(token, (db) =>
      db
        .select({ phase_id: projectTimeLogs.phase_id })
        .from(projectTimeLogs)
        .where(
          and(
            eq(projectTimeLogs.tech_id, techId),
            inArray(projectTimeLogs.phase_id, phaseIds),
            isNull(projectTimeLogs.end_time)
          )
        )
    )
    const activeTimerPhaseIds = new Set(
      activeTimers.map((t) => t.phase_id).filter(Boolean) as string[]
    )

    // Map task counts per phase
    const taskCountByPhase: Record<string, { total: number; completed: number }> = {}
    for (const t of taskRows) {
      if (!t.phase_id) continue
      if (!taskCountByPhase[t.phase_id]) {
        taskCountByPhase[t.phase_id] = { total: 0, completed: 0 }
      }
      taskCountByPhase[t.phase_id].total++
      if (t.is_completed) taskCountByPhase[t.phase_id].completed++
    }

    // Build summary per project — use the first assigned phase as "current"
    const projectMap = new Map(projectRows.map((p) => [p.id, p]))
    const results: TechProjectSummary[] = []

    for (const projectId of projectIds) {
      const proj = projectMap.get(projectId)
      if (!proj) continue

      const phasesForProject = assignedPhases.filter((p) => p.projectId === projectId)
      const currentPhase = phasesForProject[0] // already sorted by sort_order

      const counts = currentPhase
        ? (taskCountByPhase[currentPhase.phaseId] ?? { total: 0, completed: 0 })
        : { total: 0, completed: 0 }

      results.push({
        id: projectId,
        name: proj.name,
        projectNumber: proj.project_number,
        customerName: proj.customerName ?? "Unknown Customer",
        address: proj.address,
        currentPhaseName: currentPhase?.phaseName ?? null,
        currentPhaseId: currentPhase?.phaseId ?? null,
        currentPhaseStatus: currentPhase?.phaseStatus ?? null,
        totalTasks: counts.total,
        completedTasks: counts.completed,
        estimatedStartDate: currentPhase?.estimatedStartDate ?? null,
        estimatedEndDate: currentPhase?.estimatedEndDate ?? null,
        hasActiveTimer: currentPhase
          ? activeTimerPhaseIds.has(currentPhase.phaseId)
          : false,
      })
    }

    return results
  } catch (err) {
    console.error("[getTechProjects]", err)
    return { error: "Failed to load projects" }
  }
}

// ---------------------------------------------------------------------------
// getProjectPhaseDetail
// ---------------------------------------------------------------------------

export async function getProjectPhaseDetail(
  phaseId: string
): Promise<ProjectPhaseDetailForTech | { error: string }> {
  const token = await getToken()
  if (!token) return { error: "Not authenticated" }

  try {
    const techId = token.sub as string

    // Fetch phase + project + customer in one query
    const phaseRows = await withRls(token, (db) =>
      db
        .select({
          phaseId: projectPhases.id,
          phaseName: projectPhases.name,
          phaseStatus: projectPhases.status,
          projectId: projectPhases.project_id,
          projectName: projects.name,
          customerName: customers.full_name,
          customerAddress: customers.address,
        })
        .from(projectPhases)
        .leftJoin(projects, eq(projects.id, projectPhases.project_id))
        .leftJoin(customers, eq(customers.id, projects.customer_id))
        .where(eq(projectPhases.id, phaseId))
    )

    if (phaseRows.length === 0) return { error: "Phase not found" }
    const phase = phaseRows[0]

    // Fetch tasks
    const tasks = await withRls(token, (db) =>
      db
        .select()
        .from(projectPhaseTasks)
        .where(eq(projectPhaseTasks.phase_id, phaseId))
        .orderBy(asc(projectPhaseTasks.sort_order))
    )

    // Fetch time logs for this tech on this phase
    const timeLogs = await withRls(token, (db) =>
      db
        .select({
          id: projectTimeLogs.id,
          entry_type: projectTimeLogs.entry_type,
          start_time: projectTimeLogs.start_time,
          end_time: projectTimeLogs.end_time,
          duration_minutes: projectTimeLogs.duration_minutes,
          notes: projectTimeLogs.notes,
          task_id: projectTimeLogs.task_id,
        })
        .from(projectTimeLogs)
        .where(
          and(
            eq(projectTimeLogs.phase_id, phaseId),
            eq(projectTimeLogs.tech_id, techId)
          )
        )
        .orderBy(desc(projectTimeLogs.start_time))
    )

    // Find active timer (end_time IS NULL)
    const activeTimer = timeLogs.find((t) => !t.end_time && t.entry_type === "timer")

    // Photo count
    const photoCountRows = await withRls(token, (db) =>
      db
        .select({ id: projectPhotos.id })
        .from(projectPhotos)
        .where(
          and(
            eq(projectPhotos.phase_id, phaseId),
            isNull(projectPhotos.archived_at)
          )
        )
    )

    // Materials for this project (phase-level visibility)
    const materials = await withRls(token, (db) =>
      db
        .select({
          id: projectMaterials.id,
          name: projectMaterials.name,
          unit: projectMaterials.unit,
          quantity_estimated: projectMaterials.quantity_estimated,
          quantity_used: projectMaterials.quantity_used,
        })
        .from(projectMaterials)
        .where(eq(projectMaterials.project_id, phase.projectId!))
    )

    // Equipment assignments (not yet returned)
    const equipment = await withRls(token, (db) =>
      db
        .select({
          id: projectEquipmentAssignments.id,
          equipment_description: projectEquipmentAssignments.equipment_description,
          assigned_date: projectEquipmentAssignments.assigned_date,
          returned_date: projectEquipmentAssignments.returned_date,
        })
        .from(projectEquipmentAssignments)
        .where(eq(projectEquipmentAssignments.project_id, phase.projectId!))
        .orderBy(desc(projectEquipmentAssignments.created_at))
    )

    return {
      phaseId,
      phaseName: phase.phaseName,
      phaseStatus: phase.phaseStatus,
      projectId: phase.projectId!,
      projectName: phase.projectName ?? "Unknown Project",
      customerName: phase.customerName ?? "Unknown Customer",
      projectAddress: phase.customerAddress,
      tasks: tasks.map((t) => ({
        id: t.id,
        name: t.name,
        is_completed: t.is_completed,
        is_required: t.is_required,
        notes: t.notes,
        sort_order: t.sort_order,
        completed_at: t.completed_at,
        completed_by: t.completed_by,
      })),
      timeLogs: timeLogs.map((t) => ({
        id: t.id,
        entry_type: t.entry_type,
        start_time: t.start_time,
        end_time: t.end_time,
        duration_minutes: t.duration_minutes,
        notes: t.notes,
        task_id: t.task_id,
      })),
      photoCount: photoCountRows.length,
      activeTimerLogId: activeTimer?.id ?? null,
      activeTimerStartTime: activeTimer?.start_time ?? null,
      materials: materials.map((m) => ({
        id: m.id,
        name: m.name,
        unit: m.unit,
        quantity_estimated: m.quantity_estimated,
        quantity_used: m.quantity_used,
      })),
      equipment: equipment.map((e) => ({
        id: e.id,
        equipment_description: e.equipment_description,
        assigned_date: e.assigned_date,
        returned_date: e.returned_date,
      })),
    }
  } catch (err) {
    console.error("[getProjectPhaseDetail]", err)
    return { error: "Failed to load phase detail" }
  }
}

// ---------------------------------------------------------------------------
// completeTask / uncompleteTask
// ---------------------------------------------------------------------------

export async function completeTask(
  taskId: string
): Promise<{ success: true } | { error: string }> {
  const token = await getToken()
  if (!token) return { error: "Not authenticated" }

  try {
    const techId = token.sub as string
    const now = new Date()

    await withRls(token, (db) =>
      db
        .update(projectPhaseTasks)
        .set({
          is_completed: true,
          completed_at: now,
          completed_by: techId,
        })
        .where(eq(projectPhaseTasks.id, taskId))
    )

    // Update project.last_activity_at via a separate query (best effort)
    const taskRow = await withRls(token, (db) =>
      db
        .select({ phase_id: projectPhaseTasks.phase_id })
        .from(projectPhaseTasks)
        .where(eq(projectPhaseTasks.id, taskId))
    )
    if (taskRow[0]) {
      const phaseRow = await withRls(token, (db) =>
        db
          .select({ project_id: projectPhases.project_id })
          .from(projectPhases)
          .where(eq(projectPhases.id, taskRow[0].phase_id))
      )
      if (phaseRow[0]) {
        // Update last_activity_at — owner/office access only via RLS, use adminDb
        await adminDb
          .update(projects)
          .set({ last_activity_at: now })
          .where(eq(projects.id, phaseRow[0].project_id))
          .catch(() => {}) // non-fatal
      }
    }

    return { success: true }
  } catch (err) {
    console.error("[completeTask]", err)
    return { error: "Failed to complete task" }
  }
}

export async function uncompleteTask(
  taskId: string
): Promise<{ success: true } | { error: string }> {
  const token = await getToken()
  if (!token) return { error: "Not authenticated" }

  try {
    await withRls(token, (db) =>
      db
        .update(projectPhaseTasks)
        .set({
          is_completed: false,
          completed_at: null,
          completed_by: null,
        })
        .where(eq(projectPhaseTasks.id, taskId))
    )

    return { success: true }
  } catch (err) {
    console.error("[uncompleteTask]", err)
    return { error: "Failed to uncheck task" }
  }
}

// ---------------------------------------------------------------------------
// startProjectTimer / stopProjectTimer
// ---------------------------------------------------------------------------

export async function startProjectTimer(
  phaseId: string,
  taskId?: string
): Promise<{ data: { timeLogId: string } } | { error: string }> {
  const token = await getToken()
  if (!token) return { error: "Not authenticated" }
  if (!token.org_id) return { error: "No org context" }

  try {
    const techId = token.sub as string
    const now = new Date()

    // Find the phase to get project_id
    const phaseRows = await withRls(token, (db) =>
      db
        .select({ project_id: projectPhases.project_id })
        .from(projectPhases)
        .where(eq(projectPhases.id, phaseId))
    )
    if (phaseRows.length === 0) return { error: "Phase not found" }
    const projectId = phaseRows[0].project_id

    // Find active shift (time_entry) for reconciliation
    const activeShift = await withRls(token, (db) =>
      db
        .select({ id: timeEntries.id })
        .from(timeEntries)
        .where(
          and(
            eq(timeEntries.tech_id, techId),
            eq(timeEntries.status, "active"),
            isNull(timeEntries.clocked_out_at)
          )
        )
    ).catch(() => [])
    const timeEntryId = activeShift[0]?.id ?? null

    // Create timer log entry
    const inserted = await withRls(token, (db) =>
      db
        .insert(projectTimeLogs)
        .values({
          org_id: token.org_id as string,
          project_id: projectId,
          phase_id: phaseId,
          task_id: taskId ?? null,
          tech_id: techId,
          time_entry_id: timeEntryId,
          start_time: now,
          end_time: null,
          entry_type: "timer",
        })
        .returning({ id: projectTimeLogs.id })
    )

    if (!inserted[0]) return { error: "Failed to create timer" }

    return { data: { timeLogId: inserted[0].id } }
  } catch (err) {
    console.error("[startProjectTimer]", err)
    return { error: "Failed to start timer" }
  }
}

export async function stopProjectTimer(
  timeLogId: string
): Promise<{ data: { durationMinutes: number } } | { error: string }> {
  const token = await getToken()
  if (!token) return { error: "Not authenticated" }

  try {
    const now = new Date()

    // Fetch the log to calculate duration
    const logRows = await withRls(token, (db) =>
      db
        .select({ start_time: projectTimeLogs.start_time })
        .from(projectTimeLogs)
        .where(eq(projectTimeLogs.id, timeLogId))
    )
    if (logRows.length === 0) return { error: "Timer log not found" }

    const durationMs = now.getTime() - logRows[0].start_time.getTime()
    const durationMinutes = Math.round(durationMs / 60000)

    await withRls(token, (db) =>
      db
        .update(projectTimeLogs)
        .set({
          end_time: now,
          duration_minutes: durationMinutes,
        })
        .where(eq(projectTimeLogs.id, timeLogId))
    )

    return { data: { durationMinutes } }
  } catch (err) {
    console.error("[stopProjectTimer]", err)
    return { error: "Failed to stop timer" }
  }
}

// ---------------------------------------------------------------------------
// logManualTime
// ---------------------------------------------------------------------------

export interface ManualTimeInput {
  phaseId: string
  taskId?: string
  durationMinutes: number
  notes?: string
}

export async function logManualTime(
  data: ManualTimeInput
): Promise<{ success: true } | { error: string }> {
  const token = await getToken()
  if (!token) return { error: "Not authenticated" }
  if (!token.org_id) return { error: "No org context" }

  try {
    const techId = token.sub as string
    const now = new Date()

    const phaseRows = await withRls(token, (db) =>
      db
        .select({ project_id: projectPhases.project_id })
        .from(projectPhases)
        .where(eq(projectPhases.id, data.phaseId))
    )
    if (phaseRows.length === 0) return { error: "Phase not found" }
    const projectId = phaseRows[0].project_id

    // Find active shift for reconciliation
    const activeShift = await withRls(token, (db) =>
      db
        .select({ id: timeEntries.id })
        .from(timeEntries)
        .where(
          and(
            eq(timeEntries.tech_id, techId),
            eq(timeEntries.status, "active"),
            isNull(timeEntries.clocked_out_at)
          )
        )
    ).catch(() => [])
    const timeEntryId = activeShift[0]?.id ?? null

    await withRls(token, (db) =>
      db.insert(projectTimeLogs).values({
        org_id: token.org_id as string,
        project_id: projectId,
        phase_id: data.phaseId,
        task_id: data.taskId ?? null,
        tech_id: techId,
        time_entry_id: timeEntryId,
        // For manual entry: start_time = now - duration, end_time = now
        start_time: new Date(now.getTime() - data.durationMinutes * 60000),
        end_time: now,
        duration_minutes: data.durationMinutes,
        entry_type: "manual",
        notes: data.notes ?? null,
      })
    )

    return { success: true }
  } catch (err) {
    console.error("[logManualTime]", err)
    return { error: "Failed to log time" }
  }
}

// ---------------------------------------------------------------------------
// uploadProjectPhoto
// ---------------------------------------------------------------------------

export interface ProjectPhotoInput {
  projectId: string
  phaseId: string
  taskId?: string
  tag: "before" | "during" | "after" | "issue"
  caption?: string
  filePath: string // Supabase Storage path (uploaded by client first)
  thumbnailPath?: string
}

export async function uploadProjectPhoto(
  data: ProjectPhotoInput
): Promise<{ data: { photoId: string } } | { error: string }> {
  const token = await getToken()
  if (!token) return { error: "Not authenticated" }
  if (!token.org_id) return { error: "No org context" }

  try {
    const techId = token.sub as string

    const inserted = await withRls(token, (db) =>
      db
        .insert(projectPhotos)
        .values({
          org_id: token.org_id as string,
          project_id: data.projectId,
          phase_id: data.phaseId,
          task_id: data.taskId ?? null,
          tag: data.tag,
          file_path: data.filePath,
          thumbnail_path: data.thumbnailPath ?? null,
          caption: data.caption ?? null,
          taken_by: techId,
          taken_at: new Date(),
          archived_at: null,
        })
        .returning({ id: projectPhotos.id })
    )

    if (!inserted[0]) return { error: "Failed to save photo" }

    return { data: { photoId: inserted[0].id } }
  } catch (err) {
    console.error("[uploadProjectPhoto]", err)
    return { error: "Failed to upload photo" }
  }
}

// ---------------------------------------------------------------------------
// flagIssue
// ---------------------------------------------------------------------------

export interface FlagIssueInput {
  projectId: string
  phaseId: string
  taskId?: string
  title: string
  description?: string
  severity: "low" | "medium" | "high" | "critical"
  photoUrls?: string[]
}

export async function flagIssue(
  data: FlagIssueInput
): Promise<{ data: { issueFlagId: string } } | { error: string }> {
  const token = await getToken()
  if (!token) return { error: "Not authenticated" }
  if (!token.org_id) return { error: "No org context" }

  try {
    const techId = token.sub as string
    const orgId = token.org_id as string
    const now = new Date()

    // Create the issue flag
    const flagInserted = await withRls(token, (db) =>
      db
        .insert(projectIssueFlags)
        .values({
          org_id: orgId,
          project_id: data.projectId,
          phase_id: data.phaseId,
          task_id: data.taskId ?? null,
          flagged_by: techId,
          title: data.title,
          description: data.description ?? null,
          severity: data.severity,
          photo_urls: data.photoUrls ?? null,
          status: "open",
          alert_id: null,
        })
        .returning({ id: projectIssueFlags.id })
    )

    if (!flagInserted[0]) return { error: "Failed to create issue flag" }
    const issueFlagId = flagInserted[0].id

    // Create an office alert — uses adminDb so the tech can create office-only alerts
    // (alerts SELECT/INSERT is restricted to owner+office by RLS, but the intent here
    // is to notify the office, so we use adminDb with correct org scoping)
    try {
      await adminDb.insert(alerts).values({
        org_id: orgId,
        alert_type: "project_issue",
        severity: data.severity === "critical" ? "critical" : data.severity === "high" ? "critical" : "warning",
        reference_id: issueFlagId,
        reference_type: "project_issue_flag",
        title: `Project Issue: ${data.title}`,
        description: data.description ?? null,
        generated_at: now,
      })
    } catch (alertErr) {
      // Non-fatal — issue flag was created, alert is best-effort
      console.warn("[flagIssue] Failed to create office alert:", alertErr)
    }

    // Update project.last_activity_at
    await adminDb
      .update(projects)
      .set({ last_activity_at: now })
      .where(eq(projects.id, data.projectId))
      .catch(() => {})

    return { data: { issueFlagId } }
  } catch (err) {
    console.error("[flagIssue]", err)
    return { error: "Failed to flag issue" }
  }
}

// ---------------------------------------------------------------------------
// logMaterialUsage
// ---------------------------------------------------------------------------

export interface MaterialUsageInput {
  materialId: string
  phaseId: string
  quantityUsed: number
  notes?: string
}

export async function logMaterialUsage(
  data: MaterialUsageInput
): Promise<{ success: true } | { error: string }> {
  const token = await getToken()
  if (!token) return { error: "Not authenticated" }
  if (!token.org_id) return { error: "No org context" }

  try {
    const techId = token.sub as string
    const orgId = token.org_id as string

    // Fetch material to get project_id
    const matRows = await withRls(token, (db) =>
      db
        .select({ project_id: projectMaterials.project_id })
        .from(projectMaterials)
        .where(eq(projectMaterials.id, data.materialId))
    )
    if (matRows.length === 0) return { error: "Material not found" }
    const projectId = matRows[0].project_id

    // Insert usage record — uses adminDb because tech INSERT on project_material_usage
    // needs the org_id check but withRls RLS for this table allows tech INSERT
    await withRls(token, (db) =>
      db.insert(projectMaterialUsage).values({
        org_id: orgId,
        project_id: projectId,
        material_id: data.materialId,
        phase_id: data.phaseId,
        quantity_used: String(data.quantityUsed),
        logged_by: techId,
        notes: data.notes ?? null,
        used_at: new Date(),
      })
    )

    // Accumulate quantity_used on the material record (best effort via adminDb)
    await adminDb
      .update(projectMaterials)
      .set({
        quantity_used: sql`COALESCE(${projectMaterials.quantity_used}::numeric, 0) + ${data.quantityUsed}`,
        updated_at: new Date(),
      })
      .where(eq(projectMaterials.id, data.materialId))
      .catch(() => {
        // Non-fatal — usage record was logged
      })

    return { success: true }
  } catch (err) {
    console.error("[logMaterialUsage]", err)
    return { error: "Failed to log material usage" }
  }
}

// ---------------------------------------------------------------------------
// completePhase
// ---------------------------------------------------------------------------

export async function completePhase(
  phaseId: string
): Promise<{ success: true } | { error: string }> {
  const token = await getToken()
  if (!token) return { error: "Not authenticated" }
  if (!token.org_id) return { error: "No org context" }

  try {
    const techId = token.sub as string
    const orgId = token.org_id as string
    const today = toLocalDateString(new Date())

    // Validate: all required tasks must be completed
    const tasks = await withRls(token, (db) =>
      db
        .select({
          id: projectPhaseTasks.id,
          is_required: projectPhaseTasks.is_required,
          is_completed: projectPhaseTasks.is_completed,
        })
        .from(projectPhaseTasks)
        .where(eq(projectPhaseTasks.phase_id, phaseId))
    )

    const incompleteRequired = tasks.filter(
      (t) => t.is_required && !t.is_completed
    )
    if (incompleteRequired.length > 0) {
      return {
        error: `${incompleteRequired.length} required task(s) not yet completed. Please complete all required tasks before finishing this phase.`,
      }
    }

    // PROJ-71: Validate quality self-inspection checklist
    // All required checklist items must be marked complete before phase can be finished.
    const checklistResult = await getQualityChecklist(token, phaseId)
    if (!("error" in checklistResult)) {
      const incompleteChecklistItems = checklistResult.data.items.filter(
        (item) => item.isRequired && !item.isCompleted
      )
      if (incompleteChecklistItems.length > 0) {
        return {
          error: `Cannot complete phase: quality checklist items incomplete`,
          // @ts-expect-error — TypeScript doesn't know about the extra field, but it's intentional
          incompleteItems: incompleteChecklistItems.map((item) => item.label),
        }
      }
    }
    // If checklist fetch fails, we allow phase completion (non-blocking degradation)

    // Validate: at least one completion photo
    const photos = await withRls(token, (db) =>
      db
        .select({ id: projectPhotos.id })
        .from(projectPhotos)
        .where(
          and(
            eq(projectPhotos.phase_id, phaseId),
            isNull(projectPhotos.archived_at)
          )
        )
    )
    if (photos.length === 0) {
      return {
        error: "At least one completion photo is required before finishing this phase.",
      }
    }

    // Get project_id from phase
    const phaseRows = await withRls(token, (db) =>
      db
        .select({ project_id: projectPhases.project_id })
        .from(projectPhases)
        .where(eq(projectPhases.id, phaseId))
    )
    if (phaseRows.length === 0) return { error: "Phase not found" }
    const projectId = phaseRows[0].project_id

    const now = new Date()

    // Mark phase complete — uses adminDb because phase UPDATE is restricted to owner+office RLS
    // but tech completing their assigned phase is an expected operation
    await adminDb
      .update(projectPhases)
      .set({
        status: "complete",
        actual_end_date: today,
        updated_at: now,
      })
      .where(eq(projectPhases.id, phaseId))

    // Append to project activity_log and update last_activity_at
    const projectRow = await adminDb
      .select({ activity_log: projects.activity_log })
      .from(projects)
      .where(eq(projects.id, projectId))
    const existingLog = projectRow[0]?.activity_log ?? []
    const newLog = [
      ...existingLog,
      {
        type: "phase_complete",
        at: now.toISOString(),
        by_id: techId,
        note: `Phase completed by tech`,
      },
    ]

    await adminDb
      .update(projects)
      .set({
        activity_log: newLog,
        last_activity_at: now,
        updated_at: now,
      })
      .where(eq(projects.id, projectId))

    // Notify office — create an alert
    try {
      await adminDb.insert(alerts).values({
        org_id: orgId,
        alert_type: "project_phase_complete",
        severity: "info",
        reference_id: phaseId,
        reference_type: "project_phase",
        title: "Phase Completed",
        description: `A project phase has been completed by tech. Review required.`,
        generated_at: now,
      })
    } catch {
      // Non-fatal
    }

    revalidatePath("/projects")
    revalidatePath(`/projects/${projectId}`)

    return { success: true }
  } catch (err) {
    console.error("[completePhase]", err)
    return { error: "Failed to complete phase" }
  }
}

// ---------------------------------------------------------------------------
// assignEquipment / returnEquipment
// ---------------------------------------------------------------------------

export interface AssignEquipmentInput {
  projectId: string
  equipmentDescription: string
  notes?: string
}

export async function assignEquipment(
  data: AssignEquipmentInput
): Promise<{ data: { assignmentId: string } } | { error: string }> {
  const token = await getToken()
  if (!token) return { error: "Not authenticated" }
  if (!token.org_id) return { error: "No org context" }

  try {
    const techId = token.sub as string
    const today = toLocalDateString(new Date())

    // Equipment assignment INSERT is owner+office only in RLS — use adminDb for tech
    const inserted = await adminDb
      .insert(projectEquipmentAssignments)
      .values({
        org_id: token.org_id as string,
        project_id: data.projectId,
        equipment_description: data.equipmentDescription,
        assigned_date: today,
        assigned_by: techId,
        notes: data.notes ?? null,
        returned_date: null,
      })
      .returning({ id: projectEquipmentAssignments.id })

    if (!inserted[0]) return { error: "Failed to assign equipment" }

    return { data: { assignmentId: inserted[0].id } }
  } catch (err) {
    console.error("[assignEquipment]", err)
    return { error: "Failed to assign equipment" }
  }
}

export async function returnEquipment(
  assignmentId: string
): Promise<{ success: true } | { error: string }> {
  const token = await getToken()
  if (!token) return { error: "Not authenticated" }

  try {
    const today = toLocalDateString(new Date())

    await adminDb
      .update(projectEquipmentAssignments)
      .set({ returned_date: today })
      .where(eq(projectEquipmentAssignments.id, assignmentId))

    return { success: true }
  } catch (err) {
    console.error("[returnEquipment]", err)
    return { error: "Failed to return equipment" }
  }
}

// ---------------------------------------------------------------------------
// suggestProjectInRoute
// ---------------------------------------------------------------------------

/**
 * suggestProjectInRoute — check if tech has a project phase scheduled for a date
 * and suggest optimal route position. Returns suggestion only — office approves.
 */
export async function suggestProjectInRoute(
  techId: string,
  date: string
): Promise<{ hasSuggestion: boolean; suggestion?: string } | { error: string }> {
  const token = await getToken()
  if (!token) return { error: "Not authenticated" }

  try {
    const phases = await withRls(token, (db) =>
      db
        .select({
          id: projectPhases.id,
          name: projectPhases.name,
          projectId: projectPhases.project_id,
          estimatedStartDate: projectPhases.estimated_start_date,
          estimatedEndDate: projectPhases.estimated_end_date,
        })
        .from(projectPhases)
        .where(
          and(
            eq(projectPhases.assigned_tech_id, techId),
            inArray(projectPhases.status, ["not_started", "in_progress"]),
            lte(projectPhases.estimated_start_date, date),
            or(
              isNull(projectPhases.estimated_end_date),
              gte(projectPhases.estimated_end_date, date)
            )
          )
        )
    )

    if (phases.length === 0) return { hasSuggestion: false }

    return {
      hasSuggestion: true,
      suggestion: `${phases.length} project phase(s) scheduled for today. Review the Projects tab to plan your route.`,
    }
  } catch (err) {
    console.error("[suggestProjectInRoute]", err)
    return { error: "Failed to check route suggestions" }
  }
}

// ---------------------------------------------------------------------------
// getTechProjectBriefing
// ---------------------------------------------------------------------------

/**
 * getTechProjectBriefing — daily briefing data for the Projects tab.
 *
 * Shows: today's phases, materials needed, subs on site, upcoming inspections.
 * Subcontractor data is owner+office only, so we use adminDb for that section
 * (tech can see what subs are on site — it's operational context, not financial).
 */
export async function getTechProjectBriefing(): Promise<
  ProjectBriefingData | { error: string }
> {
  const token = await getToken()
  if (!token) return { error: "Not authenticated" }

  try {
    const techId = token.sub as string
    const today = toLocalDateString(new Date())
    const in3Days = toLocalDateString(
      new Date(Date.now() + 3 * 24 * 60 * 60 * 1000)
    )

    // Today's phases for this tech
    const phases = await withRls(token, (db) =>
      db
        .select({
          phaseId: projectPhases.id,
          phaseName: projectPhases.name,
          projectId: projectPhases.project_id,
          projectName: projects.name,
          customerName: customers.full_name,
          estimatedEndDate: projectPhases.estimated_end_date,
        })
        .from(projectPhases)
        .leftJoin(projects, eq(projects.id, projectPhases.project_id))
        .leftJoin(customers, eq(customers.id, projects.customer_id))
        .where(
          and(
            eq(projectPhases.assigned_tech_id, techId),
            inArray(projectPhases.status, ["not_started", "in_progress"])
          )
        )
        .orderBy(asc(projectPhases.sort_order))
    )

    if (phases.length === 0) {
      return {
        todayPhases: [],
        materialsNeeded: [],
        subsOnSite: [],
        upcomingInspections: [],
      }
    }

    const phaseIds = phases.map((p) => p.phaseId)
    const projectIds = [...new Set(phases.map((p) => p.projectId).filter(Boolean))] as string[]

    // Task counts per phase
    const taskRows = await withRls(token, (db) =>
      db
        .select({
          phase_id: projectPhaseTasks.phase_id,
          is_completed: projectPhaseTasks.is_completed,
        })
        .from(projectPhaseTasks)
        .where(inArray(projectPhaseTasks.phase_id, phaseIds))
    )

    const taskCountsByPhase: Record<string, { total: number; complete: number }> = {}
    for (const t of taskRows) {
      if (!t.phase_id) continue
      if (!taskCountsByPhase[t.phase_id]) {
        taskCountsByPhase[t.phase_id] = { total: 0, complete: 0 }
      }
      taskCountsByPhase[t.phase_id].total++
      if (t.is_completed) taskCountsByPhase[t.phase_id].complete++
    }

    const todayPhases = phases.map((p) => {
      const counts = taskCountsByPhase[p.phaseId] ?? { total: 0, complete: 0 }
      return {
        projectId: p.projectId ?? "",
        projectName: p.projectName ?? "Unknown Project",
        customerName: p.customerName ?? "Unknown Customer",
        phaseName: p.phaseName,
        phaseId: p.phaseId,
        tasksTotal: counts.total,
        tasksComplete: counts.complete,
        estimatedEndDate: p.estimatedEndDate,
      }
    })

    // Materials needed from active projects
    const materials = await withRls(token, (db) =>
      db
        .select({
          name: projectMaterials.name,
          unit: projectMaterials.unit,
          quantity_estimated: projectMaterials.quantity_estimated,
          quantity_used: projectMaterials.quantity_used,
          projectId: projectMaterials.project_id,
        })
        .from(projectMaterials)
        .where(inArray(projectMaterials.project_id, projectIds))
    )

    const projectNameById = new Map(
      phases.map((p) => [p.projectId ?? "", p.projectName ?? "Unknown"])
    )

    const materialsNeeded = materials
      .filter((m) => parseFloat(m.quantity_estimated) > parseFloat(m.quantity_used ?? "0"))
      .map((m) => ({
        projectName: projectNameById.get(m.projectId) ?? "Unknown",
        materialName: m.name,
        unit: m.unit,
        quantityNeeded: String(
          Math.max(
            0,
            parseFloat(m.quantity_estimated) - parseFloat(m.quantity_used ?? "0")
          ).toFixed(2)
        ),
      }))

    // Subs on site today — use adminDb (subcontractor SELECT is owner+office RLS only
    // but tech needs to know who's on site for coordination)
    const phaseProjectMap = new Map(
      phases.map((p) => [p.phaseId, p.projectName ?? "Unknown Project"])
    )

    const subRows = await adminDb
      .select({
        phase_id: projectPhaseSubcontractors.phase_id,
        scope_of_work: projectPhaseSubcontractors.scope_of_work,
        subName: subcontractors.name,
      })
      .from(projectPhaseSubcontractors)
      .leftJoin(subcontractors, eq(subcontractors.id, projectPhaseSubcontractors.subcontractor_id))
      .where(
        and(
          inArray(projectPhaseSubcontractors.phase_id, phaseIds),
          inArray(projectPhaseSubcontractors.status, ["not_started", "in_progress"])
        )
      )
      .catch(() => [])

    const subsOnSite = subRows.map((s) => ({
      projectName: phaseProjectMap.get(s.phase_id) ?? "Unknown Project",
      subName: s.subName ?? "Unknown Subcontractor",
      scopeOfWork: s.scope_of_work,
    }))

    // Upcoming inspections (next 3 days)
    const inspectionRows = await withRls(token, (db) =>
      db
        .select({
          project_id: projectInspections.project_id,
          inspection_type: projectInspections.inspection_type,
          scheduled_date: projectInspections.scheduled_date,
        })
        .from(projectInspections)
        .where(
          and(
            inArray(projectInspections.project_id, projectIds),
            inArray(projectInspections.status, ["scheduled"]),
            gte(projectInspections.scheduled_date, today),
            lte(projectInspections.scheduled_date, in3Days)
          )
        )
        .orderBy(asc(projectInspections.scheduled_date))
    ).catch(() => [])

    const upcomingInspections = inspectionRows.map((i) => ({
      projectName: projectNameById.get(i.project_id) ?? "Unknown Project",
      inspectionType: i.inspection_type,
      scheduledDate: i.scheduled_date,
    }))

    return {
      todayPhases,
      materialsNeeded,
      subsOnSite,
      upcomingInspections,
    }
  } catch (err) {
    console.error("[getTechProjectBriefing]", err)
    return { error: "Failed to load briefing" }
  }
}
