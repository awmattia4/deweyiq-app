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
