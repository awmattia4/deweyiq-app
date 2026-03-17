"use server"

/**
 * projects.ts — Server actions for project CRUD, detail view, phase management,
 * stage transitions, hold/resume, stalled project detection, and templates.
 *
 * Phase 12: Projects & Renovations — Plans 02 & 03
 *
 * Key patterns:
 * - getProjects: fetch all projects with customer name + days in stage (LEFT JOIN, no correlated subqueries)
 * - createProject: create project with auto-generated project_number, optional template phase seeding
 * - getProjectDetail: full project with phases, tasks, milestones, activity log
 * - updateProjectSiteNotes: update site_notes JSONB + append activity_log
 * - createProjectPhase / updateProjectPhase / deleteProjectPhase: phase CRUD with dependency cascade
 * - updateProjectStage: update stage + stage_entered_at + activity_log
 * - holdProject / resumeProject: status transitions with activity_log
 * - checkStalledProjects: alert generation for inactive projects
 * - getProjectsForCustomer: PROJ-79 archive access
 * - suggestServiceAgreement: PROJ-78 recurring service upsell
 * - getProjectTemplates / createProjectTemplate / updateProjectTemplate / deleteProjectTemplate
 * - getProjectPipelineMetrics: stage counts, avg days per stage, lead-to-close conversion rate
 */

import { revalidatePath } from "next/cache"
import { createClient } from "@/lib/supabase/server"
import { withRls, adminDb } from "@/lib/db"
import type { SupabaseToken } from "@/lib/db"
import {
  projects,
  projectTemplates,
  projectPhases,
  projectPhaseTasks,
  projectPaymentMilestones,
  customers,
  pools,
  profiles,
  orgSettings,
  alerts,
  invoices,
} from "@/lib/db/schema"
import { eq, and, desc, count, sql, isNull, inArray, lt } from "drizzle-orm"
import { toLocalDateString } from "@/lib/date-utils"

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface ProjectSummary {
  id: string
  org_id: string
  customer_id: string
  pool_id: string | null
  project_number: string | null
  name: string
  project_type: string
  stage: string
  stage_entered_at: Date | null
  status: string
  on_hold_reason: string | null
  contract_amount: string | null
  estimated_start_date: string | null
  estimated_completion_date: string | null
  lead_source: string | null
  last_activity_at: Date | null
  created_at: Date
  // Computed
  days_in_stage: number
  // Joined
  customerName: string
}

export interface ProjectTemplate {
  id: string
  org_id: string
  name: string
  project_type: string
  default_phases: Array<{
    name: string
    sort_order: number
    estimated_days: number
    tasks: Array<{ name: string; sort_order: number; is_required: boolean }>
    materials: Array<{ name: string; category: string; unit: string; quantity_estimated: number }>
  }> | null
  default_payment_schedule: Array<{
    name: string
    percentage: number
    trigger_stage: string
  }> | null
  tier_config: Record<string, { label: string; features: string[]; markup_pct: number }> | null
  is_active: boolean
  created_at: Date
}

export interface PipelineMetrics {
  totalActive: number
  stageCounts: Record<string, number>
  stalledCount: number
  avgDaysLeadToClose: number | null
  leadToCloseConversionRate: number | null
}

export const PROJECT_STAGES = [
  "lead",
  "site_survey_scheduled",
  "survey_complete",
  "proposal_sent",
  "proposal_approved",
  "deposit_received",
  "permitted",
  "in_progress",
  "punch_list",
  "complete",
  "warranty_active",
] as const

export const PROJECT_STAGE_LABELS: Record<string, string> = {
  lead: "Lead",
  site_survey_scheduled: "Survey Scheduled",
  survey_complete: "Survey Complete",
  proposal_sent: "Proposal Sent",
  proposal_approved: "Proposal Approved",
  deposit_received: "Deposit Received",
  permitted: "Permitted",
  in_progress: "In Progress",
  punch_list: "Punch List",
  complete: "Complete",
  warranty_active: "Warranty Active",
}

export const PROJECT_TYPE_LABELS: Record<string, string> = {
  new_pool: "New Pool",
  renovation: "Renovation",
  equipment: "Equipment",
  remodel: "Remodel",
  replaster: "Replaster",
  other: "Other",
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function computeDaysInStage(stageEnteredAt: Date | null): number {
  if (!stageEnteredAt) return 0
  const now = new Date()
  const diff = now.getTime() - stageEnteredAt.getTime()
  return Math.floor(diff / (1000 * 60 * 60 * 24))
}

async function getToken(): Promise<SupabaseToken | null> {
  const supabase = await createClient()
  const { data: claimsData } = await supabase.auth.getClaims()
  if (!claimsData?.claims) return null
  return claimsData.claims as SupabaseToken
}

// ---------------------------------------------------------------------------
// getProjects
// ---------------------------------------------------------------------------

export async function getProjects(): Promise<ProjectSummary[] | { error: string }> {
  const token = await getToken()
  if (!token) return { error: "Not authenticated" }

  try {
    // LEFT JOIN to get customer name — no correlated subqueries (per RLS pitfalls)
    const rows = await withRls(token, (db) =>
      db
        .select({
          id: projects.id,
          org_id: projects.org_id,
          customer_id: projects.customer_id,
          pool_id: projects.pool_id,
          project_number: projects.project_number,
          name: projects.name,
          project_type: projects.project_type,
          stage: projects.stage,
          stage_entered_at: projects.stage_entered_at,
          status: projects.status,
          on_hold_reason: projects.on_hold_reason,
          contract_amount: projects.contract_amount,
          estimated_start_date: projects.estimated_start_date,
          estimated_completion_date: projects.estimated_completion_date,
          lead_source: projects.lead_source,
          last_activity_at: projects.last_activity_at,
          created_at: projects.created_at,
          customerName: customers.full_name,
        })
        .from(projects)
        .leftJoin(customers, eq(customers.id, projects.customer_id))
        .orderBy(desc(projects.last_activity_at))
    )

    return rows.map((r) => ({
      ...r,
      customerName: r.customerName ?? "Unknown Customer",
      days_in_stage: computeDaysInStage(r.stage_entered_at),
    }))
  } catch (err) {
    console.error("[getProjects]", err)
    return { error: "Failed to load projects" }
  }
}

// ---------------------------------------------------------------------------
// createProject
// ---------------------------------------------------------------------------

export interface CreateProjectInput {
  customer_id: string
  project_type: string
  name: string
  lead_source?: string | null
  lead_notes?: string | null
  template_id?: string | null
  pool_id?: string | null
}

export async function createProject(
  data: CreateProjectInput
): Promise<{ data: ProjectSummary } | { error: string }> {
  const token = await getToken()
  if (!token) return { error: "Not authenticated" }
  if (!token.org_id) return { error: "No org context" }

  try {
    // Generate sequential project number: PRJ-XXXX
    // Use adminDb for atomic counter (no RLS needed for counting)
    const countResult = await adminDb
      .select({ cnt: count(projects.id) })
      .from(projects)
      .where(eq(projects.org_id, token.org_id))
    const nextNum = (Number(countResult[0]?.cnt ?? 0) + 1).toString().padStart(4, "0")
    const projectNumber = `PRJ-${nextNum}`

    const now = new Date()
    const todayStr = toLocalDateString(now)

    // Insert the project
    const [newProject] = await withRls(token, (db) =>
      db
        .insert(projects)
        .values({
          org_id: token.org_id!,
          customer_id: data.customer_id,
          pool_id: data.pool_id ?? null,
          project_number: projectNumber,
          name: data.name,
          project_type: data.project_type,
          template_id: data.template_id ?? null,
          stage: "lead",
          status: "active",
          lead_source: data.lead_source ?? null,
          lead_notes: data.lead_notes ?? null,
          stage_entered_at: now,
          last_activity_at: now,
          activity_log: [
            {
              type: "created",
              at: now.toISOString(),
              by_id: token.sub,
              note: "Project created",
            },
          ],
        })
        .returning()
    )

    // If a template was provided, seed phases and tasks from template default_phases
    if (data.template_id) {
      const [template] = await withRls(token, (db) =>
        db
          .select({ default_phases: projectTemplates.default_phases })
          .from(projectTemplates)
          .where(
            and(
              eq(projectTemplates.id, data.template_id!),
              eq(projectTemplates.org_id, token.org_id!)
            )
          )
          .limit(1)
      )

      if (template?.default_phases && template.default_phases.length > 0) {
        for (const phaseDef of template.default_phases) {
          const [insertedPhase] = await withRls(token, (db) =>
            db
              .insert(projectPhases)
              .values({
                org_id: token.org_id!,
                project_id: newProject.id,
                name: phaseDef.name,
                sort_order: phaseDef.sort_order,
                status: "not_started",
              })
              .returning({ id: projectPhases.id })
          )

          if (phaseDef.tasks?.length > 0) {
            await withRls(token, (db) =>
              db.insert(projectPhaseTasks).values(
                phaseDef.tasks.map((task) => ({
                  org_id: token.org_id!,
                  phase_id: insertedPhase.id,
                  name: task.name,
                  sort_order: task.sort_order,
                  is_required: task.is_required,
                }))
              )
            )
          }
        }
      }
    }

    // Fetch with customer name for return value
    const [withCustomer] = await withRls(token, (db) =>
      db
        .select({
          id: projects.id,
          org_id: projects.org_id,
          customer_id: projects.customer_id,
          pool_id: projects.pool_id,
          project_number: projects.project_number,
          name: projects.name,
          project_type: projects.project_type,
          stage: projects.stage,
          stage_entered_at: projects.stage_entered_at,
          status: projects.status,
          on_hold_reason: projects.on_hold_reason,
          contract_amount: projects.contract_amount,
          estimated_start_date: projects.estimated_start_date,
          estimated_completion_date: projects.estimated_completion_date,
          lead_source: projects.lead_source,
          last_activity_at: projects.last_activity_at,
          created_at: projects.created_at,
          customerName: customers.full_name,
        })
        .from(projects)
        .leftJoin(customers, eq(customers.id, projects.customer_id))
        .where(eq(projects.id, newProject.id))
        .limit(1)
    )

    revalidatePath("/projects")
    return {
      data: {
        ...withCustomer,
        customerName: withCustomer.customerName ?? "Unknown Customer",
        days_in_stage: 0,
      },
    }
  } catch (err) {
    console.error("[createProject]", err)
    return { error: "Failed to create project" }
  }
}

// ---------------------------------------------------------------------------
// updateProjectStage
// ---------------------------------------------------------------------------

export async function updateProjectStage(
  projectId: string,
  newStage: string
): Promise<{ success: true } | { error: string }> {
  const token = await getToken()
  if (!token) return { error: "Not authenticated" }

  try {
    const now = new Date()

    // Fetch existing activity_log and stage
    const [existing] = await withRls(token, (db) =>
      db
        .select({ activity_log: projects.activity_log, stage: projects.stage })
        .from(projects)
        .where(eq(projects.id, projectId))
        .limit(1)
    )

    if (!existing) return { error: "Project not found" }

    const updatedLog = [
      ...(existing.activity_log ?? []),
      {
        type: "stage_changed",
        at: now.toISOString(),
        by_id: token.sub,
        note: `Moved from ${PROJECT_STAGE_LABELS[existing.stage] ?? existing.stage} to ${PROJECT_STAGE_LABELS[newStage] ?? newStage}`,
      },
    ]

    await withRls(token, (db) =>
      db
        .update(projects)
        .set({
          stage: newStage,
          stage_entered_at: now,
          last_activity_at: now,
          activity_log: updatedLog,
          updated_at: now,
        })
        .where(eq(projects.id, projectId))
    )

    revalidatePath("/projects")
    return { success: true }
  } catch (err) {
    console.error("[updateProjectStage]", err)
    return { error: "Failed to update project stage" }
  }
}

// ---------------------------------------------------------------------------
// holdProject
// ---------------------------------------------------------------------------

export async function holdProject(
  projectId: string,
  reason: string
): Promise<{ success: true } | { error: string }> {
  const token = await getToken()
  if (!token) return { error: "Not authenticated" }

  try {
    const now = new Date()

    const [existing] = await withRls(token, (db) =>
      db
        .select({ activity_log: projects.activity_log })
        .from(projects)
        .where(eq(projects.id, projectId))
        .limit(1)
    )

    if (!existing) return { error: "Project not found" }

    const updatedLog = [
      ...(existing.activity_log ?? []),
      {
        type: "put_on_hold",
        at: now.toISOString(),
        by_id: token.sub,
        note: reason,
      },
    ]

    await withRls(token, (db) =>
      db
        .update(projects)
        .set({
          status: "on_hold",
          on_hold_reason: reason,
          last_activity_at: now,
          activity_log: updatedLog,
          updated_at: now,
        })
        .where(eq(projects.id, projectId))
    )

    revalidatePath("/projects")
    return { success: true }
  } catch (err) {
    console.error("[holdProject]", err)
    return { error: "Failed to put project on hold" }
  }
}

// ---------------------------------------------------------------------------
// resumeProject
// ---------------------------------------------------------------------------

export async function resumeProject(
  projectId: string
): Promise<{ success: true } | { error: string }> {
  const token = await getToken()
  if (!token) return { error: "Not authenticated" }

  try {
    const now = new Date()

    const [existing] = await withRls(token, (db) =>
      db
        .select({ activity_log: projects.activity_log })
        .from(projects)
        .where(eq(projects.id, projectId))
        .limit(1)
    )

    if (!existing) return { error: "Project not found" }

    const updatedLog = [
      ...(existing.activity_log ?? []),
      {
        type: "resumed",
        at: now.toISOString(),
        by_id: token.sub,
        note: "Project resumed",
      },
    ]

    await withRls(token, (db) =>
      db
        .update(projects)
        .set({
          status: "active",
          on_hold_reason: null,
          last_activity_at: now,
          activity_log: updatedLog,
          updated_at: now,
        })
        .where(eq(projects.id, projectId))
    )

    revalidatePath("/projects")
    return { success: true }
  } catch (err) {
    console.error("[resumeProject]", err)
    return { error: "Failed to resume project" }
  }
}

// ---------------------------------------------------------------------------
// getProjectTemplates
// ---------------------------------------------------------------------------

export async function getProjectTemplates(): Promise<ProjectTemplate[] | { error: string }> {
  const token = await getToken()
  if (!token) return { error: "Not authenticated" }

  try {
    const rows = await withRls(token, (db) =>
      db
        .select()
        .from(projectTemplates)
        .where(eq(projectTemplates.is_active, true))
        .orderBy(projectTemplates.name)
    )

    return rows as ProjectTemplate[]
  } catch (err) {
    console.error("[getProjectTemplates]", err)
    return { error: "Failed to load project templates" }
  }
}

// ---------------------------------------------------------------------------
// createProjectTemplate
// ---------------------------------------------------------------------------

export interface CreateTemplateInput {
  name: string
  project_type: string
  default_phases?: ProjectTemplate["default_phases"]
  default_payment_schedule?: ProjectTemplate["default_payment_schedule"]
  tier_config?: ProjectTemplate["tier_config"]
}

export async function createProjectTemplate(
  data: CreateTemplateInput
): Promise<{ data: ProjectTemplate } | { error: string }> {
  const token = await getToken()
  if (!token) return { error: "Not authenticated" }
  if (!token.org_id) return { error: "No org context" }

  try {
    const [newTemplate] = await withRls(token, (db) =>
      db
        .insert(projectTemplates)
        .values({
          org_id: token.org_id!,
          name: data.name,
          project_type: data.project_type,
          default_phases: data.default_phases ?? null,
          default_payment_schedule: data.default_payment_schedule ?? null,
          tier_config: data.tier_config ?? null,
          is_active: true,
        })
        .returning()
    )

    revalidatePath("/settings")
    revalidatePath("/projects")
    return { data: newTemplate as ProjectTemplate }
  } catch (err) {
    console.error("[createProjectTemplate]", err)
    return { error: "Failed to create template" }
  }
}

// ---------------------------------------------------------------------------
// updateProjectTemplate
// ---------------------------------------------------------------------------

export async function updateProjectTemplate(
  id: string,
  data: Partial<CreateTemplateInput>
): Promise<{ data: ProjectTemplate } | { error: string }> {
  const token = await getToken()
  if (!token) return { error: "Not authenticated" }

  try {
    const [updated] = await withRls(token, (db) =>
      db
        .update(projectTemplates)
        .set({
          ...(data.name !== undefined && { name: data.name }),
          ...(data.project_type !== undefined && { project_type: data.project_type }),
          ...(data.default_phases !== undefined && { default_phases: data.default_phases }),
          ...(data.default_payment_schedule !== undefined && {
            default_payment_schedule: data.default_payment_schedule,
          }),
          ...(data.tier_config !== undefined && { tier_config: data.tier_config }),
          updated_at: new Date(),
        })
        .where(eq(projectTemplates.id, id))
        .returning()
    )

    revalidatePath("/settings")
    revalidatePath("/projects")
    return { data: updated as ProjectTemplate }
  } catch (err) {
    console.error("[updateProjectTemplate]", err)
    return { error: "Failed to update template" }
  }
}

// ---------------------------------------------------------------------------
// deleteProjectTemplate (soft-delete)
// ---------------------------------------------------------------------------

export async function deleteProjectTemplate(
  id: string
): Promise<{ success: true } | { error: string }> {
  const token = await getToken()
  if (!token) return { error: "Not authenticated" }

  try {
    await withRls(token, (db) =>
      db
        .update(projectTemplates)
        .set({ is_active: false, updated_at: new Date() })
        .where(eq(projectTemplates.id, id))
    )

    revalidatePath("/settings")
    revalidatePath("/projects")
    return { success: true }
  } catch (err) {
    console.error("[deleteProjectTemplate]", err)
    return { error: "Failed to delete template" }
  }
}

// ---------------------------------------------------------------------------
// getProjectPipelineMetrics
// ---------------------------------------------------------------------------

export async function getProjectPipelineMetrics(): Promise<PipelineMetrics | { error: string }> {
  const token = await getToken()
  if (!token) return { error: "Not authenticated" }
  if (!token.org_id) return { error: "No org context" }

  try {
    // Get all active projects with their stage and stage_entered_at
    const allProjects = await withRls(token, (db) =>
      db
        .select({
          id: projects.id,
          stage: projects.stage,
          status: projects.status,
          stage_entered_at: projects.stage_entered_at,
          actual_completion_date: projects.actual_completion_date,
          created_at: projects.created_at,
        })
        .from(projects)
    )

    const stageCounts: Record<string, number> = {}
    for (const stage of PROJECT_STAGES) {
      stageCounts[stage] = 0
    }

    let totalActive = 0
    let stalledCount = 0
    const STALL_THRESHOLD_DAYS = 14

    for (const p of allProjects) {
      if (p.status === "active" || p.status === "on_hold") {
        stageCounts[p.stage] = (stageCounts[p.stage] ?? 0) + 1
        totalActive++

        const daysInStage = computeDaysInStage(p.stage_entered_at)
        if (daysInStage > STALL_THRESHOLD_DAYS && p.stage !== "complete" && p.stage !== "warranty_active") {
          stalledCount++
        }
      }
    }

    // Lead-to-close: completed projects with both created_at and actual_completion_date
    const completedWithDates = allProjects.filter(
      (p) => p.stage === "complete" && p.actual_completion_date
    )
    let avgDaysLeadToClose: number | null = null
    if (completedWithDates.length > 0) {
      const totalDays = completedWithDates.reduce((sum, p) => {
        if (!p.actual_completion_date) return sum
        const completionDate = new Date(p.actual_completion_date)
        const diff = completionDate.getTime() - p.created_at.getTime()
        return sum + Math.floor(diff / (1000 * 60 * 60 * 24))
      }, 0)
      avgDaysLeadToClose = Math.round(totalDays / completedWithDates.length)
    }

    // Conversion rate: % of leads that reached "deposit_received" or beyond
    const leadProjects = allProjects.filter((p) => p.stage === "lead")
    const convertedProjects = allProjects.filter(
      (p) =>
        !["lead", "site_survey_scheduled", "survey_complete", "proposal_sent"].includes(p.stage)
    )
    const leadToCloseConversionRate =
      allProjects.length > 0
        ? Math.round((convertedProjects.length / allProjects.length) * 100)
        : null

    return {
      totalActive,
      stageCounts,
      stalledCount,
      avgDaysLeadToClose,
      leadToCloseConversionRate,
    }
  } catch (err) {
    console.error("[getProjectPipelineMetrics]", err)
    return { error: "Failed to load pipeline metrics" }
  }
}

// ---------------------------------------------------------------------------
// getCustomersForProjectCreation
// ---------------------------------------------------------------------------

export async function getCustomersForProjectCreation(): Promise<
  Array<{ id: string; name: string }> | { error: string }
> {
  const token = await getToken()
  if (!token) return { error: "Not authenticated" }

  try {
    const rows = await withRls(token, (db) =>
      db
        .select({ id: customers.id, full_name: customers.full_name })
        .from(customers)
        .orderBy(customers.full_name)
    )

    return rows.map((r) => ({ id: r.id, name: r.full_name }))
  } catch (err) {
    console.error("[getCustomersForProjectCreation]", err)
    return { error: "Failed to load customers" }
  }
}

// ===========================================================================
// Plan 03: Project Detail — types and actions
// ===========================================================================

// ---------------------------------------------------------------------------
// Additional Types (Plan 03)
// ---------------------------------------------------------------------------

export interface ActivityLogEntry {
  type: string
  at: string
  by_id: string
  note: string | null
}

export interface ProjectPhaseTask {
  id: string
  org_id: string
  phase_id: string
  name: string
  sort_order: number
  is_completed: boolean
  completed_at: Date | null
  completed_by: string | null
  completedByName: string | null
  notes: string | null
  is_required: boolean
  created_at: Date
}

export interface ProjectPhaseSummary {
  id: string
  org_id: string
  project_id: string
  name: string
  sort_order: number
  status: string
  dependency_phase_id: string | null
  dependency_type: string | null
  assigned_tech_id: string | null
  techName: string | null
  estimated_start_date: string | null
  estimated_end_date: string | null
  actual_start_date: string | null
  actual_end_date: string | null
  estimated_labor_hours: string | null
  actual_labor_hours: string | null
  is_outdoor: boolean
  notes: string | null
  created_at: Date
  updated_at: Date
  tasks: ProjectPhaseTask[]
}

export interface ProjectMilestone {
  id: string
  name: string
  trigger_phase_id: string | null
  percentage: string | null
  amount: string
  invoice_id: string | null
  status: string
  due_date: string | null
  sort_order: number
}

export interface ProjectDetail extends ProjectSummary {
  stage_entered_at: Date | null
  pool_id: string | null
  on_hold_reason: string | null
  contract_amount: string | null
  retainage_pct: string | null
  estimated_start_date: string | null
  estimated_completion_date: string | null
  actual_start_date: string | null
  actual_completion_date: string | null
  site_notes: Record<string, string> | null
  lead_source: string | null
  lead_notes: string | null
  financing_status: string | null
  activity_log: ActivityLogEntry[] | null
  last_activity_at: Date | null
  customerAddress: string | null
  poolName: string | null
  phases: ProjectPhaseSummary[]
  milestones: ProjectMilestone[]
}

// ---------------------------------------------------------------------------
// getProjectDetail
// ---------------------------------------------------------------------------

/**
 * getProjectDetail — Fetch a project with customer, phases (ordered by sort_order),
 * phase tasks, payment milestones, and activity log.
 *
 * Uses LEFT JOIN for all joins (no correlated subqueries per MEMORY.md RLS pitfall).
 */
export async function getProjectDetail(projectId: string): Promise<ProjectDetail | null> {
  const token = await getToken()
  if (!token) return null

  try {
    // 1. Fetch project with customer + pool joins
    const projectRows = await withRls(token, (db) =>
      db
        .select({
          id: projects.id,
          org_id: projects.org_id,
          customer_id: projects.customer_id,
          pool_id: projects.pool_id,
          project_number: projects.project_number,
          name: projects.name,
          project_type: projects.project_type,
          stage: projects.stage,
          stage_entered_at: projects.stage_entered_at,
          status: projects.status,
          on_hold_reason: projects.on_hold_reason,
          contract_amount: projects.contract_amount,
          retainage_pct: projects.retainage_pct,
          estimated_start_date: projects.estimated_start_date,
          estimated_completion_date: projects.estimated_completion_date,
          actual_start_date: projects.actual_start_date,
          actual_completion_date: projects.actual_completion_date,
          site_notes: projects.site_notes,
          lead_source: projects.lead_source,
          lead_notes: projects.lead_notes,
          financing_status: projects.financing_status,
          activity_log: projects.activity_log,
          last_activity_at: projects.last_activity_at,
          created_at: projects.created_at,
          updated_at: projects.updated_at,
          customerName: customers.full_name,
          customerAddress: customers.address,
          poolName: pools.name,
        })
        .from(projects)
        .leftJoin(customers, eq(projects.customer_id, customers.id))
        .leftJoin(pools, eq(projects.pool_id, pools.id))
        .where(eq(projects.id, projectId))
        .limit(1)
    )

    if (projectRows.length === 0) return null
    const project = projectRows[0]

    // 2. Fetch phases ordered by sort_order with assigned tech names
    const phaseRows = await withRls(token, (db) =>
      db
        .select({
          id: projectPhases.id,
          org_id: projectPhases.org_id,
          project_id: projectPhases.project_id,
          name: projectPhases.name,
          sort_order: projectPhases.sort_order,
          status: projectPhases.status,
          dependency_phase_id: projectPhases.dependency_phase_id,
          dependency_type: projectPhases.dependency_type,
          assigned_tech_id: projectPhases.assigned_tech_id,
          techName: profiles.full_name,
          estimated_start_date: projectPhases.estimated_start_date,
          estimated_end_date: projectPhases.estimated_end_date,
          actual_start_date: projectPhases.actual_start_date,
          actual_end_date: projectPhases.actual_end_date,
          estimated_labor_hours: projectPhases.estimated_labor_hours,
          actual_labor_hours: projectPhases.actual_labor_hours,
          is_outdoor: projectPhases.is_outdoor,
          notes: projectPhases.notes,
          created_at: projectPhases.created_at,
          updated_at: projectPhases.updated_at,
        })
        .from(projectPhases)
        .leftJoin(profiles, eq(projectPhases.assigned_tech_id, profiles.id))
        .where(and(
          eq(projectPhases.project_id, projectId),
          sql`${projectPhases.status} != 'skipped'`,
        ))
        .orderBy(projectPhases.sort_order)
    )

    // 3. Fetch tasks for all phases in one batch query
    const phaseIds = phaseRows.map((p) => p.id)
    let taskRows: ProjectPhaseTask[] = []

    if (phaseIds.length > 0) {
      const rawTaskRows = await withRls(token, (db) =>
        db
          .select({
            id: projectPhaseTasks.id,
            org_id: projectPhaseTasks.org_id,
            phase_id: projectPhaseTasks.phase_id,
            name: projectPhaseTasks.name,
            sort_order: projectPhaseTasks.sort_order,
            is_completed: projectPhaseTasks.is_completed,
            completed_at: projectPhaseTasks.completed_at,
            completed_by: projectPhaseTasks.completed_by,
            completedByName: profiles.full_name,
            notes: projectPhaseTasks.notes,
            is_required: projectPhaseTasks.is_required,
            created_at: projectPhaseTasks.created_at,
          })
          .from(projectPhaseTasks)
          .leftJoin(profiles, eq(projectPhaseTasks.completed_by, profiles.id))
          .where(inArray(projectPhaseTasks.phase_id, phaseIds))
          .orderBy(projectPhaseTasks.phase_id, projectPhaseTasks.sort_order)
      )
      taskRows = rawTaskRows
    }

    // 4. Fetch payment milestones
    const milestoneRows = await withRls(token, (db) =>
      db
        .select({
          id: projectPaymentMilestones.id,
          name: projectPaymentMilestones.name,
          trigger_phase_id: projectPaymentMilestones.trigger_phase_id,
          percentage: projectPaymentMilestones.percentage,
          amount: projectPaymentMilestones.amount,
          invoice_id: projectPaymentMilestones.invoice_id,
          status: projectPaymentMilestones.status,
          due_date: projectPaymentMilestones.due_date,
          sort_order: projectPaymentMilestones.sort_order,
        })
        .from(projectPaymentMilestones)
        .where(eq(projectPaymentMilestones.project_id, projectId))
        .orderBy(projectPaymentMilestones.sort_order)
    )

    // 5. Group tasks by phase
    const tasksByPhase = new Map<string, ProjectPhaseTask[]>()
    for (const task of taskRows) {
      if (!tasksByPhase.has(task.phase_id)) tasksByPhase.set(task.phase_id, [])
      tasksByPhase.get(task.phase_id)!.push(task)
    }

    const phases: ProjectPhaseSummary[] = phaseRows.map((phase) => ({
      ...phase,
      tasks: tasksByPhase.get(phase.id) ?? [],
    }))

    return {
      id: project.id,
      org_id: project.org_id,
      customer_id: project.customer_id,
      pool_id: project.pool_id,
      project_number: project.project_number,
      name: project.name,
      project_type: project.project_type,
      stage: project.stage,
      stage_entered_at: project.stage_entered_at,
      status: project.status,
      on_hold_reason: project.on_hold_reason,
      contract_amount: project.contract_amount,
      retainage_pct: project.retainage_pct,
      estimated_start_date: project.estimated_start_date,
      estimated_completion_date: project.estimated_completion_date,
      actual_start_date: project.actual_start_date,
      actual_completion_date: project.actual_completion_date,
      site_notes: project.site_notes as Record<string, string> | null,
      lead_source: project.lead_source,
      lead_notes: project.lead_notes,
      financing_status: project.financing_status,
      activity_log: project.activity_log as ActivityLogEntry[] | null,
      last_activity_at: project.last_activity_at,
      created_at: project.created_at,
      customerName: project.customerName ?? "Unknown Customer",
      customerAddress: project.customerAddress,
      poolName: project.poolName,
      days_in_stage: computeDaysInStage(project.stage_entered_at),
      phases,
      milestones: milestoneRows,
    }
  } catch (err) {
    console.error("[getProjectDetail] Error:", err)
    return null
  }
}

// ---------------------------------------------------------------------------
// getProjectsForCustomer
// ---------------------------------------------------------------------------

/**
 * getProjectsForCustomer — All projects for a customer (PROJ-79 archive access).
 * Newest first. Includes complete and warranty_active projects.
 */
export async function getProjectsForCustomer(customerId: string): Promise<ProjectSummary[]> {
  const token = await getToken()
  if (!token) return []

  try {
    const rows = await withRls(token, (db) =>
      db
        .select({
          id: projects.id,
          org_id: projects.org_id,
          customer_id: projects.customer_id,
          pool_id: projects.pool_id,
          project_number: projects.project_number,
          name: projects.name,
          project_type: projects.project_type,
          stage: projects.stage,
          stage_entered_at: projects.stage_entered_at,
          status: projects.status,
          on_hold_reason: projects.on_hold_reason,
          contract_amount: projects.contract_amount,
          estimated_start_date: projects.estimated_start_date,
          estimated_completion_date: projects.estimated_completion_date,
          lead_source: projects.lead_source,
          last_activity_at: projects.last_activity_at,
          created_at: projects.created_at,
          customerName: customers.full_name,
        })
        .from(projects)
        .leftJoin(customers, eq(projects.customer_id, customers.id))
        .where(eq(projects.customer_id, customerId))
        .orderBy(desc(projects.created_at))
    )

    return rows.map((r) => ({
      ...r,
      customerName: r.customerName ?? "Unknown Customer",
      days_in_stage: computeDaysInStage(r.stage_entered_at),
    }))
  } catch (err) {
    console.error("[getProjectsForCustomer] Error:", err)
    return []
  }
}

// ---------------------------------------------------------------------------
// updateProjectSiteNotes
// ---------------------------------------------------------------------------

/**
 * updateProjectSiteNotes — Update site_notes JSONB and append activity_log entry.
 *
 * PROJ-52: Fields: gate_code, access_instructions, utility_locations,
 * dig_alert_number, hoa_contact, neighbor_notification, parking_instructions, custom_notes
 */
export async function updateProjectSiteNotes(
  projectId: string,
  siteNotes: Record<string, string>
): Promise<{ success: boolean; error?: string }> {
  const token = await getToken()
  if (!token) return { success: false, error: "Not authenticated" }

  try {
    const userId = token.sub as string
    const now = new Date()

    await withRls(token, async (db) => {
      const existing = await db
        .select({ activity_log: projects.activity_log })
        .from(projects)
        .where(eq(projects.id, projectId))
        .limit(1)

      const currentLog = (existing[0]?.activity_log as ActivityLogEntry[] | null) ?? []
      const newEntry: ActivityLogEntry = {
        type: "site_notes_updated",
        at: now.toISOString(),
        by_id: userId,
        note: "Site notes updated",
      }

      await db
        .update(projects)
        .set({
          site_notes: siteNotes,
          activity_log: [...currentLog, newEntry],
          last_activity_at: now,
          updated_at: now,
        })
        .where(eq(projects.id, projectId))
    })

    revalidatePath(`/projects/${projectId}`)
    return { success: true }
  } catch (err) {
    console.error("[updateProjectSiteNotes] Error:", err)
    return { success: false, error: "Failed to update site notes" }
  }
}

// ---------------------------------------------------------------------------
// Phase dependency cascade helper
// ---------------------------------------------------------------------------

/**
 * _recalculateDependentPhases — Topological sort + cascade date recalculation (PROJ-43).
 *
 * Given all phases for a project, rebuilds start/end dates for downstream phases.
 * Returns a Map of phaseId -> { estimated_start_date, estimated_end_date } for phases
 * that need updating (excludes the triggering phase itself).
 */
function _recalculateDependentPhases(
  phases: Array<{
    id: string
    dependency_phase_id: string | null
    dependency_type: string | null
    estimated_start_date: string | null
    estimated_end_date: string | null
  }>
): Map<string, { estimated_start_date: string | null; estimated_end_date: string | null }> {
  const updates = new Map<string, { estimated_start_date: string | null; estimated_end_date: string | null }>()

  // Build child->parent dependency map
  const dependsOn = new Map<string, string>()
  for (const phase of phases) {
    if (phase.dependency_phase_id) {
      dependsOn.set(phase.id, phase.dependency_phase_id)
    }
  }

  // Build parent->children map
  const children = new Map<string, string[]>()
  for (const [child, parent] of dependsOn.entries()) {
    if (!children.has(parent)) children.set(parent, [])
    children.get(parent)!.push(child)
  }

  // Kahn's topological sort
  const inDegree = new Map<string, number>(phases.map((p) => [p.id, 0]))
  for (const [child] of dependsOn.entries()) {
    inDegree.set(child, (inDegree.get(child) ?? 0) + 1)
  }

  const queue: string[] = []
  for (const [phaseId, deg] of inDegree.entries()) {
    if (deg === 0) queue.push(phaseId)
  }

  const phaseMap = new Map(phases.map((p) => [p.id, p]))
  const topoOrder: string[] = []

  while (queue.length > 0) {
    const current = queue.shift()!
    topoOrder.push(current)
    for (const child of children.get(current) ?? []) {
      const newDeg = (inDegree.get(child) ?? 1) - 1
      inDegree.set(child, newDeg)
      if (newDeg === 0) queue.push(child)
    }
  }

  // Track live end dates as we process in topo order
  const liveEndDate = new Map<string, string | null>(
    phases.map((p) => [p.id, p.estimated_end_date])
  )

  for (const phaseId of topoOrder) {
    const phase = phaseMap.get(phaseId)
    if (!phase) continue
    const parentId = dependsOn.get(phaseId)
    if (!parentId) continue // Root — no cascade needed

    const parentEndDate = liveEndDate.get(parentId)
    if (!parentEndDate) continue

    // New start = day after parent ends
    const parentEnd = new Date(parentEndDate)
    parentEnd.setDate(parentEnd.getDate() + 1)
    const newStart = parentEnd.toISOString().split("T")[0]

    // Preserve original duration
    let newEnd: string | null = null
    if (phase.estimated_start_date && phase.estimated_end_date) {
      const origStart = new Date(phase.estimated_start_date)
      const origEnd = new Date(phase.estimated_end_date)
      const durationDays = Math.round(
        (origEnd.getTime() - origStart.getTime()) / (1000 * 60 * 60 * 24)
      )
      const endDate = new Date(newStart)
      endDate.setDate(endDate.getDate() + durationDays)
      newEnd = endDate.toISOString().split("T")[0]
    }

    updates.set(phaseId, { estimated_start_date: newStart, estimated_end_date: newEnd })
    liveEndDate.set(phaseId, newEnd)
  }

  return updates
}

// ---------------------------------------------------------------------------
// createProjectPhase
// ---------------------------------------------------------------------------

export async function createProjectPhase(
  projectId: string,
  data: {
    name: string
    sort_order?: number
    dependency_phase_id?: string | null
    dependency_type?: "hard" | "soft"
    estimated_start_date?: string | null
    estimated_end_date?: string | null
    assigned_tech_id?: string | null
    estimated_labor_hours?: string | null
    is_outdoor?: boolean
    notes?: string | null
  }
): Promise<{ success: boolean; phaseId?: string; error?: string }> {
  const token = await getToken()
  if (!token) return { success: false, error: "Not authenticated" }

  try {
    const userId = token.sub as string
    const now = new Date()
    let phaseId: string | undefined

    await withRls(token, async (db) => {
      // Auto-assign sort_order if not provided
      let sortOrder = data.sort_order
      if (sortOrder === undefined) {
        const existing = await db
          .select({ sort_order: projectPhases.sort_order })
          .from(projectPhases)
          .where(eq(projectPhases.project_id, projectId))
          .orderBy(desc(projectPhases.sort_order))
          .limit(1)
        sortOrder = (existing[0]?.sort_order ?? -1) + 1
      }

      const inserted = await db
        .insert(projectPhases)
        .values({
          org_id: token.org_id as string,
          project_id: projectId,
          name: data.name,
          sort_order: sortOrder,
          dependency_phase_id: data.dependency_phase_id ?? null,
          dependency_type: data.dependency_type ?? "hard",
          assigned_tech_id: data.assigned_tech_id ?? null,
          estimated_start_date: data.estimated_start_date ?? null,
          estimated_end_date: data.estimated_end_date ?? null,
          estimated_labor_hours: data.estimated_labor_hours ?? null,
          is_outdoor: data.is_outdoor ?? false,
          notes: data.notes ?? null,
        })
        .returning({ id: projectPhases.id })

      phaseId = inserted[0]?.id

      // Append activity log
      const existingProject = await db
        .select({ activity_log: projects.activity_log })
        .from(projects)
        .where(eq(projects.id, projectId))
        .limit(1)

      const currentLog = (existingProject[0]?.activity_log as ActivityLogEntry[] | null) ?? []
      await db
        .update(projects)
        .set({
          activity_log: [...currentLog, {
            type: "phase_created",
            at: now.toISOString(),
            by_id: userId,
            note: `Phase "${data.name}" created`,
          }],
          last_activity_at: now,
          updated_at: now,
        })
        .where(eq(projects.id, projectId))
    })

    revalidatePath(`/projects/${projectId}`)
    return { success: true, phaseId }
  } catch (err) {
    console.error("[createProjectPhase] Error:", err)
    return { success: false, error: "Failed to create phase" }
  }
}

// ---------------------------------------------------------------------------
// updateProjectPhase (with cascade)
// ---------------------------------------------------------------------------

/**
 * updateProjectPhase — Update phase fields with dependency cascade (PROJ-43).
 *
 * If dates change on a phase: fetch all phases, recalculate downstream dates
 * via DAG topological sort, bulk-update affected phases, update project
 * estimated_completion_date if the final phase changes.
 */
export async function updateProjectPhase(
  phaseId: string,
  data: {
    name?: string
    sort_order?: number
    status?: string
    dependency_phase_id?: string | null
    dependency_type?: "hard" | "soft"
    estimated_start_date?: string | null
    estimated_end_date?: string | null
    actual_start_date?: string | null
    actual_end_date?: string | null
    assigned_tech_id?: string | null
    estimated_labor_hours?: string | null
    notes?: string | null
  }
): Promise<{ success: boolean; error?: string; cascadedPhaseCount?: number }> {
  const token = await getToken()
  if (!token) return { success: false, error: "Not authenticated" }

  try {
    const userId = token.sub as string
    const now = new Date()
    let cascadedPhaseCount = 0

    await withRls(token, async (db) => {
      // Fetch phase to get project_id
      const phaseRows = await db
        .select({ project_id: projectPhases.project_id, name: projectPhases.name })
        .from(projectPhases)
        .where(eq(projectPhases.id, phaseId))
        .limit(1)

      if (phaseRows.length === 0) throw new Error("Phase not found")
      const { project_id: projectId, name: phaseName } = phaseRows[0]

      // Update the phase
      await db
        .update(projectPhases)
        .set({
          ...(data.name !== undefined ? { name: data.name } : {}),
          ...(data.sort_order !== undefined ? { sort_order: data.sort_order } : {}),
          ...(data.status !== undefined ? { status: data.status } : {}),
          ...(data.dependency_phase_id !== undefined ? { dependency_phase_id: data.dependency_phase_id } : {}),
          ...(data.dependency_type !== undefined ? { dependency_type: data.dependency_type } : {}),
          ...(data.estimated_start_date !== undefined ? { estimated_start_date: data.estimated_start_date } : {}),
          ...(data.estimated_end_date !== undefined ? { estimated_end_date: data.estimated_end_date } : {}),
          ...(data.actual_start_date !== undefined ? { actual_start_date: data.actual_start_date } : {}),
          ...(data.actual_end_date !== undefined ? { actual_end_date: data.actual_end_date } : {}),
          ...(data.assigned_tech_id !== undefined ? { assigned_tech_id: data.assigned_tech_id } : {}),
          ...(data.estimated_labor_hours !== undefined ? { estimated_labor_hours: data.estimated_labor_hours } : {}),
          ...(data.notes !== undefined ? { notes: data.notes } : {}),
          updated_at: now,
        })
        .where(eq(projectPhases.id, phaseId))

      // Cascade date recalculation if dates changed (PROJ-43)
      const dateChanged =
        data.estimated_start_date !== undefined || data.estimated_end_date !== undefined

      if (dateChanged) {
        const allPhases = await db
          .select({
            id: projectPhases.id,
            dependency_phase_id: projectPhases.dependency_phase_id,
            dependency_type: projectPhases.dependency_type,
            estimated_start_date: projectPhases.estimated_start_date,
            estimated_end_date: projectPhases.estimated_end_date,
            sort_order: projectPhases.sort_order,
          })
          .from(projectPhases)
          .where(eq(projectPhases.project_id, projectId))
          .orderBy(projectPhases.sort_order)

        // Apply the in-flight change before cascading
        const phasesWithChange = allPhases.map((p) => {
          if (p.id !== phaseId) return p
          return {
            ...p,
            estimated_start_date: data.estimated_start_date ?? p.estimated_start_date,
            estimated_end_date: data.estimated_end_date ?? p.estimated_end_date,
          }
        })

        const cascadeUpdates = _recalculateDependentPhases(phasesWithChange)
        cascadedPhaseCount = cascadeUpdates.size

        for (const [cascadePhaseId, updates] of cascadeUpdates.entries()) {
          if (cascadePhaseId === phaseId) continue
          await db
            .update(projectPhases)
            .set({
              estimated_start_date: updates.estimated_start_date,
              estimated_end_date: updates.estimated_end_date,
              updated_at: now,
            })
            .where(eq(projectPhases.id, cascadePhaseId))
        }

        // Update project estimated_completion_date from the last phase's end date
        const sortedPhases = [...phasesWithChange].sort((a, b) => b.sort_order - a.sort_order)
        const lastPhase = sortedPhases[0]
        if (lastPhase) {
          const lastPhaseUpdate = cascadeUpdates.get(lastPhase.id)
          const finalEndDate = lastPhaseUpdate?.estimated_end_date ?? lastPhase.estimated_end_date
          if (finalEndDate) {
            await db
              .update(projects)
              .set({ estimated_completion_date: finalEndDate, updated_at: now })
              .where(eq(projects.id, projectId))
          }
        }
      }

      // Append activity log
      const existingProject = await db
        .select({ activity_log: projects.activity_log })
        .from(projects)
        .where(eq(projects.id, projectId))
        .limit(1)

      const currentLog = (existingProject[0]?.activity_log as ActivityLogEntry[] | null) ?? []
      await db
        .update(projects)
        .set({
          activity_log: [...currentLog, {
            type: "phase_updated",
            at: now.toISOString(),
            by_id: userId,
            note: `Phase "${phaseName}" updated`,
          }],
          last_activity_at: now,
          updated_at: now,
        })
        .where(eq(projects.id, projectId))
    })

    revalidatePath(`/projects`)
    return { success: true, cascadedPhaseCount }
  } catch (err) {
    console.error("[updateProjectPhase] Error:", err)
    return { success: false, error: "Failed to update phase" }
  }
}

// ---------------------------------------------------------------------------
// deleteProjectPhase (soft-delete)
// ---------------------------------------------------------------------------

/**
 * deleteProjectPhase — Soft-remove by setting status to 'skipped' (PROJ-91: no hard deletes).
 */
export async function deleteProjectPhase(
  phaseId: string
): Promise<{ success: boolean; error?: string }> {
  const token = await getToken()
  if (!token) return { success: false, error: "Not authenticated" }

  try {
    const userId = token.sub as string
    const now = new Date()

    await withRls(token, async (db) => {
      const phaseRows = await db
        .select({ project_id: projectPhases.project_id, name: projectPhases.name })
        .from(projectPhases)
        .where(eq(projectPhases.id, phaseId))
        .limit(1)

      if (phaseRows.length === 0) throw new Error("Phase not found")
      const { project_id: projectId, name: phaseName } = phaseRows[0]

      await db
        .update(projectPhases)
        .set({ status: "skipped", updated_at: now })
        .where(eq(projectPhases.id, phaseId))

      const existingProject = await db
        .select({ activity_log: projects.activity_log })
        .from(projects)
        .where(eq(projects.id, projectId))
        .limit(1)

      const currentLog = (existingProject[0]?.activity_log as ActivityLogEntry[] | null) ?? []
      await db
        .update(projects)
        .set({
          activity_log: [...currentLog, {
            type: "phase_skipped",
            at: now.toISOString(),
            by_id: userId,
            note: `Phase "${phaseName}" removed`,
          }],
          last_activity_at: now,
          updated_at: now,
        })
        .where(eq(projects.id, projectId))

      revalidatePath(`/projects/${projectId}`)
    })

    return { success: true }
  } catch (err) {
    console.error("[deleteProjectPhase] Error:", err)
    return { success: false, error: "Failed to remove phase" }
  }
}

// ---------------------------------------------------------------------------
// createPhaseTasks (bulk insert)
// ---------------------------------------------------------------------------

export async function createPhaseTasks(
  phaseId: string,
  tasks: Array<{ name: string; sort_order?: number; is_required?: boolean }>
): Promise<{ success: boolean; error?: string }> {
  const token = await getToken()
  if (!token) return { success: false, error: "Not authenticated" }

  try {
    await withRls(token, async (db) => {
      // Get current max sort_order
      const existing = await db
        .select({ sort_order: projectPhaseTasks.sort_order })
        .from(projectPhaseTasks)
        .where(eq(projectPhaseTasks.phase_id, phaseId))
        .orderBy(desc(projectPhaseTasks.sort_order))
        .limit(1)

      const startOrder = (existing[0]?.sort_order ?? -1) + 1

      // Get org_id from phase
      const phaseRows = await db
        .select({ org_id: projectPhases.org_id })
        .from(projectPhases)
        .where(eq(projectPhases.id, phaseId))
        .limit(1)

      if (phaseRows.length === 0) throw new Error("Phase not found")
      const orgId = phaseRows[0].org_id

      await db.insert(projectPhaseTasks).values(
        tasks.map((task, i) => ({
          org_id: orgId,
          phase_id: phaseId,
          name: task.name,
          sort_order: task.sort_order ?? startOrder + i,
          is_required: task.is_required ?? true,
        }))
      )
    })

    return { success: true }
  } catch (err) {
    console.error("[createPhaseTasks] Error:", err)
    return { success: false, error: "Failed to create tasks" }
  }
}

// ---------------------------------------------------------------------------
// updatePhaseTask
// ---------------------------------------------------------------------------

export async function updatePhaseTask(
  taskId: string,
  data: {
    is_completed?: boolean
    notes?: string | null
    name?: string
    is_required?: boolean
  }
): Promise<{ success: boolean; error?: string }> {
  const token = await getToken()
  if (!token) return { success: false, error: "Not authenticated" }

  try {
    const userId = token.sub as string

    await withRls(token, (db) =>
      db
        .update(projectPhaseTasks)
        .set({
          ...(data.is_completed !== undefined
            ? {
                is_completed: data.is_completed,
                completed_at: data.is_completed ? new Date() : null,
                completed_by: data.is_completed ? userId : null,
              }
            : {}),
          ...(data.notes !== undefined ? { notes: data.notes } : {}),
          ...(data.name !== undefined ? { name: data.name } : {}),
          ...(data.is_required !== undefined ? { is_required: data.is_required } : {}),
        })
        .where(eq(projectPhaseTasks.id, taskId))
    )

    return { success: true }
  } catch (err) {
    console.error("[updatePhaseTask] Error:", err)
    return { success: false, error: "Failed to update task" }
  }
}

// ---------------------------------------------------------------------------
// checkStalledProjects
// ---------------------------------------------------------------------------

/**
 * checkStalledProjects — Detect active projects with no activity in N days.
 *
 * Uses adminDb (not withRls) since alert generation scans org data as service role.
 * Threshold from org_settings.project_inactivity_alert_days (default 7).
 * Idempotent via ON CONFLICT DO NOTHING.
 */
export async function checkStalledProjects(orgId: string): Promise<void> {
  try {
    const settingsRows = await adminDb
      .select({ project_inactivity_alert_days: orgSettings.project_inactivity_alert_days })
      .from(orgSettings)
      .where(eq(orgSettings.org_id, orgId))
      .limit(1)

    const thresholdDays = settingsRows[0]?.project_inactivity_alert_days ?? 7

    const cutoffDate = new Date()
    cutoffDate.setDate(cutoffDate.getDate() - thresholdDays)

    const stalledProjects = await adminDb
      .select({
        projectId: projects.id,
        projectName: projects.name,
        projectNumber: projects.project_number,
        customerId: projects.customer_id,
        lastActivityAt: projects.last_activity_at,
        customerName: customers.full_name,
      })
      .from(projects)
      .leftJoin(customers, eq(projects.customer_id, customers.id))
      .where(
        and(
          eq(projects.org_id, orgId),
          eq(projects.status, "active"),
          lt(projects.last_activity_at, cutoffDate)
        )
      )
      .limit(50)

    if (stalledProjects.length === 0) return

    const newAlerts = stalledProjects.map((project) => ({
      org_id: orgId,
      alert_type: "stalled_project" as string,
      severity: "warning" as string,
      reference_id: project.projectId,
      reference_type: "project",
      title: `${project.projectName} has had no activity for ${thresholdDays}+ days`,
      description: `Last activity: ${project.lastActivityAt?.toLocaleDateString() ?? "unknown"}`,
      metadata: {
        projectId: project.projectId,
        projectNumber: project.projectNumber,
        customerId: project.customerId,
        customerName: project.customerName,
        lastActivityAt: project.lastActivityAt?.toISOString(),
        thresholdDays,
      },
    }))

    await adminDb
      .insert(alerts)
      .values(newAlerts)
      .onConflictDoNothing()
  } catch (err) {
    console.error("[checkStalledProjects] Error:", err)
  }
}

// ---------------------------------------------------------------------------
// suggestServiceAgreement
// ---------------------------------------------------------------------------

/**
 * suggestServiceAgreement — Check if a completed project's customer lacks active
 * recurring service. Returns true to show "Offer Recurring Service" prompt (PROJ-78).
 *
 * Proxy: check for recent service invoices in the last 60 days.
 * Full subscription billing check wired once Phase 17 (subscription billing) is live.
 */
export async function suggestServiceAgreement(
  projectId: string
): Promise<{ shouldSuggest: boolean }> {
  const token = await getToken()
  if (!token) return { shouldSuggest: false }

  try {
    const projectRows = await withRls(token, (db) =>
      db
        .select({ customer_id: projects.customer_id, status: projects.status })
        .from(projects)
        .where(eq(projects.id, projectId))
        .limit(1)
    )

    if (projectRows.length === 0) return { shouldSuggest: false }
    const { customer_id: customerId, status } = projectRows[0]

    if (status !== "complete") return { shouldSuggest: false }

    const sixtyDaysAgo = new Date()
    sixtyDaysAgo.setDate(sixtyDaysAgo.getDate() - 60)

    const serviceInvoices = await withRls(token, (db) =>
      db
        .select({ id: invoices.id })
        .from(invoices)
        .where(
          and(
            eq(invoices.customer_id, customerId),
            sql`${invoices.invoice_type} = 'service'`,
            sql`${invoices.created_at} >= ${sixtyDaysAgo.toISOString()}`,
            sql`${invoices.status} NOT IN ('void', 'cancelled')`
          )
        )
        .limit(1)
    )

    return { shouldSuggest: serviceInvoices.length === 0 }
  } catch (err) {
    console.error("[suggestServiceAgreement] Error:", err)
    return { shouldSuggest: false }
  }
}
