"use server"

/**
 * projects-subcontractors.ts — Server actions for subcontractor directory,
 * phase assignments, payment tracking, and schedule notifications.
 *
 * Phase 12 Plan 10: Subcontractor Management (PROJ-34 through PROJ-38)
 *
 * Key actions:
 * - getSubcontractors: List all subs for org
 * - createSubcontractor / updateSubcontractor / deactivateSubcontractor: Directory CRUD
 * - checkInsuranceExpiry: Scheduled-style check — creates alerts for expiring certs
 * - assignSubToPhase / updateSubAssignment / getSubAssignmentsForProject: Assignment CRUD
 * - recordSubPayment / getSubPaymentSummary: Payment tracking with lien waivers
 * - sendSubNotification: Schedule email to sub's email address
 */

import { revalidatePath } from "next/cache"
import { createClient } from "@/lib/supabase/server"
import { withRls, adminDb } from "@/lib/db"
import type { SupabaseToken } from "@/lib/db"
import {
  subcontractors,
  projectPhaseSubcontractors,
  projectPhases,
  projects,
  customers,
  orgs,
  alerts,
} from "@/lib/db/schema"
import { eq, and, inArray, lte, sql, isNull } from "drizzle-orm"
import { toLocalDateString } from "@/lib/date-utils"
import { Resend } from "resend"
import { render as renderEmail } from "@react-email/render"
import { SubcontractorNotificationEmail } from "@/lib/emails/subcontractor-notification-email"

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type SubTrade =
  | "plumbing"
  | "electrical"
  | "excavation"
  | "decking"
  | "masonry"
  | "plastering"
  | "painting"
  | "landscaping"
  | "other"

export interface SubcontractorRow {
  id: string
  org_id: string
  name: string
  trade: string
  contact_name: string | null
  email: string | null
  phone: string | null
  address: string | null
  insurance_cert_path: string | null
  insurance_expiry: string | null
  license_number: string | null
  license_expiry: string | null
  payment_terms: string | null
  notes: string | null
  is_active: boolean
  created_at: Date
  updated_at: Date
  // Computed
  insurance_status: "valid" | "expiring" | "expired" | "none"
  license_status: "valid" | "expiring" | "expired" | "none"
}

export interface SubAssignmentRow {
  id: string
  org_id: string
  phase_id: string
  subcontractor_id: string
  subName: string
  subTrade: string
  subEmail: string | null
  subInsuranceExpiry: string | null
  phaseName: string
  scope_of_work: string | null
  agreed_price: string | null
  status: string
  payment_status: string
  amount_paid: string
  lien_waiver_path: string | null
  scheduled_start: string | null
  scheduled_end: string | null
  created_at: Date
  updated_at: Date
}

export interface SubPaymentSummary {
  subcontractor_id: string
  subName: string
  subTrade: string
  assignmentId: string
  phaseName: string
  agreed_price: string | null
  amount_paid: string
  payment_status: string
  lien_waiver_path: string | null
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
// Helpers
// ---------------------------------------------------------------------------

/** YYYY-MM-DD comparison helpers */
function computeDocStatus(
  expiry: string | null
): "valid" | "expiring" | "expired" | "none" {
  if (!expiry) return "none"
  const today = new Date()
  const expiryDate = new Date(expiry + "T00:00:00")
  const diff = expiryDate.getTime() - today.getTime()
  const daysUntil = Math.floor(diff / (1000 * 60 * 60 * 24))
  if (daysUntil < 0) return "expired"
  if (daysUntil <= 30) return "expiring"
  return "valid"
}

function enrichSub(row: Omit<SubcontractorRow, "insurance_status" | "license_status">): SubcontractorRow {
  return {
    ...row,
    insurance_status: computeDocStatus(row.insurance_expiry),
    license_status: computeDocStatus(row.license_expiry),
  }
}

// ---------------------------------------------------------------------------
// getSubcontractors (PROJ-34)
// ---------------------------------------------------------------------------

export async function getSubcontractors(
  includeInactive = false
): Promise<SubcontractorRow[] | { error: string }> {
  const token = await getToken()
  if (!token) return { error: "Not authenticated" }

  try {
    const rows = await withRls(token, (db) =>
      db
        .select()
        .from(subcontractors)
        .where(
          includeInactive
            ? undefined
            : eq(subcontractors.is_active, true)
        )
        .orderBy(subcontractors.trade, subcontractors.name)
    )

    return rows.map(enrichSub)
  } catch (err) {
    console.error("[getSubcontractors]", err)
    return { error: "Failed to load subcontractors" }
  }
}

// ---------------------------------------------------------------------------
// createSubcontractor (PROJ-34)
// ---------------------------------------------------------------------------

export interface CreateSubcontractorInput {
  name: string
  trade: SubTrade
  contact_name?: string | null
  email?: string | null
  phone?: string | null
  address?: string | null
  insurance_cert_path?: string | null
  insurance_expiry?: string | null
  license_number?: string | null
  license_expiry?: string | null
  payment_terms?: string | null
  notes?: string | null
}

export async function createSubcontractor(
  data: CreateSubcontractorInput
): Promise<{ data: SubcontractorRow } | { error: string }> {
  const token = await getToken()
  if (!token) return { error: "Not authenticated" }
  if (!token.org_id) return { error: "No org context" }

  try {
    const [row] = await withRls(token, (db) =>
      db
        .insert(subcontractors)
        .values({
          org_id: token.org_id!,
          name: data.name.trim(),
          trade: data.trade,
          contact_name: data.contact_name ?? null,
          email: data.email?.trim() ?? null,
          phone: data.phone?.trim() ?? null,
          address: data.address?.trim() ?? null,
          insurance_cert_path: data.insurance_cert_path ?? null,
          insurance_expiry: data.insurance_expiry ?? null,
          license_number: data.license_number?.trim() ?? null,
          license_expiry: data.license_expiry ?? null,
          payment_terms: data.payment_terms ?? null,
          notes: data.notes ?? null,
          is_active: true,
        })
        .returning()
    )

    revalidatePath("/settings")
    return { data: enrichSub(row) }
  } catch (err) {
    console.error("[createSubcontractor]", err)
    return { error: "Failed to create subcontractor" }
  }
}

// ---------------------------------------------------------------------------
// updateSubcontractor (PROJ-34)
// ---------------------------------------------------------------------------

export type UpdateSubcontractorInput = Partial<CreateSubcontractorInput>

export async function updateSubcontractor(
  id: string,
  data: UpdateSubcontractorInput
): Promise<{ data: SubcontractorRow } | { error: string }> {
  const token = await getToken()
  if (!token) return { error: "Not authenticated" }

  try {
    const updateValues: Record<string, unknown> = { updated_at: new Date() }
    if (data.name !== undefined) updateValues.name = data.name.trim()
    if (data.trade !== undefined) updateValues.trade = data.trade
    if (data.contact_name !== undefined) updateValues.contact_name = data.contact_name
    if (data.email !== undefined) updateValues.email = data.email?.trim() ?? null
    if (data.phone !== undefined) updateValues.phone = data.phone?.trim() ?? null
    if (data.address !== undefined) updateValues.address = data.address?.trim() ?? null
    if (data.insurance_cert_path !== undefined) updateValues.insurance_cert_path = data.insurance_cert_path
    if (data.insurance_expiry !== undefined) updateValues.insurance_expiry = data.insurance_expiry
    if (data.license_number !== undefined) updateValues.license_number = data.license_number?.trim() ?? null
    if (data.license_expiry !== undefined) updateValues.license_expiry = data.license_expiry
    if (data.payment_terms !== undefined) updateValues.payment_terms = data.payment_terms
    if (data.notes !== undefined) updateValues.notes = data.notes

    const [row] = await withRls(token, (db) =>
      db
        .update(subcontractors)
        .set(updateValues)
        .where(eq(subcontractors.id, id))
        .returning()
    )

    if (!row) return { error: "Subcontractor not found" }

    revalidatePath("/settings")
    return { data: enrichSub(row) }
  } catch (err) {
    console.error("[updateSubcontractor]", err)
    return { error: "Failed to update subcontractor" }
  }
}

// ---------------------------------------------------------------------------
// deactivateSubcontractor (PROJ-34)
// ---------------------------------------------------------------------------

export async function deactivateSubcontractor(
  id: string
): Promise<{ success: true } | { error: string }> {
  const token = await getToken()
  if (!token) return { error: "Not authenticated" }

  try {
    await withRls(token, (db) =>
      db
        .update(subcontractors)
        .set({ is_active: false, updated_at: new Date() })
        .where(eq(subcontractors.id, id))
    )

    revalidatePath("/settings")
    revalidatePath("/projects")
    return { success: true }
  } catch (err) {
    console.error("[deactivateSubcontractor]", err)
    return { error: "Failed to deactivate subcontractor" }
  }
}

// ---------------------------------------------------------------------------
// checkInsuranceExpiry (PROJ-34)
// ---------------------------------------------------------------------------

/**
 * Checks all active subs for expiring insurance certs (within 30 days).
 * Creates alerts for the org. Designed to be called from a scheduled job
 * or manually triggered from settings.
 *
 * Uses adminDb (no user context required — scheduled check).
 */
export async function checkInsuranceExpiry(
  orgId: string
): Promise<{ checked: number; alertsCreated: number } | { error: string }> {
  try {
    const today = toLocalDateString(new Date())
    // 30 days from now
    const thirtyDaysOut = new Date()
    thirtyDaysOut.setDate(thirtyDaysOut.getDate() + 30)
    const thirtyDaysStr = toLocalDateString(thirtyDaysOut)

    // Find subs with expiring or expired insurance
    const expiringSubs = await adminDb
      .select({
        id: subcontractors.id,
        name: subcontractors.name,
        insurance_expiry: subcontractors.insurance_expiry,
        org_id: subcontractors.org_id,
      })
      .from(subcontractors)
      .where(
        and(
          eq(subcontractors.org_id, orgId),
          eq(subcontractors.is_active, true),
          sql`${subcontractors.insurance_expiry} IS NOT NULL`,
          sql`${subcontractors.insurance_expiry} <= ${thirtyDaysStr}`
        )
      )

    let alertsCreated = 0

    for (const sub of expiringSubs) {
      const isExpired = sub.insurance_expiry! <= today
      const severity = isExpired ? "critical" : "warning"
      const title = isExpired
        ? `${sub.name}: Insurance certificate expired`
        : `${sub.name}: Insurance certificate expiring soon`
      const description = isExpired
        ? `Insurance for ${sub.name} expired on ${sub.insurance_expiry}. Remove from active assignments until renewed.`
        : `Insurance for ${sub.name} expires on ${sub.insurance_expiry} (within 30 days). Request renewal.`

      try {
        // INSERT OR IGNORE — deduplication via unique constraint
        await adminDb
          .insert(alerts)
          .values({
            org_id: orgId,
            alert_type: "sub_insurance_expiry",
            severity,
            reference_id: sub.id,
            reference_type: "subcontractor",
            title,
            description,
          })
          .onConflictDoNothing()

        alertsCreated++
      } catch {
        // Already exists — skip
      }
    }

    return { checked: expiringSubs.length, alertsCreated }
  } catch (err) {
    console.error("[checkInsuranceExpiry]", err)
    return { error: "Failed to check insurance expiry" }
  }
}

// ---------------------------------------------------------------------------
// assignSubToPhase (PROJ-35, PROJ-36)
// ---------------------------------------------------------------------------

export interface AssignSubInput {
  subcontractor_id: string
  scope_of_work?: string | null
  agreed_price?: string | null
  scheduled_start?: string | null
  scheduled_end?: string | null
}

export async function assignSubToPhase(
  phaseId: string,
  data: AssignSubInput
): Promise<{ data: SubAssignmentRow } | { error: string }> {
  const token = await getToken()
  if (!token) return { error: "Not authenticated" }
  if (!token.org_id) return { error: "No org context" }

  try {
    const [assignment] = await withRls(token, (db) =>
      db
        .insert(projectPhaseSubcontractors)
        .values({
          org_id: token.org_id!,
          phase_id: phaseId,
          subcontractor_id: data.subcontractor_id,
          scope_of_work: data.scope_of_work ?? null,
          agreed_price: data.agreed_price ?? null,
          scheduled_start: data.scheduled_start ?? null,
          scheduled_end: data.scheduled_end ?? null,
          status: "not_started",
          payment_status: "unpaid",
          amount_paid: "0",
        })
        .returning()
    )

    // Append to project activity_log via phase → project join
    try {
      const [phaseRow] = await withRls(token, (db) =>
        db
          .select({
            project_id: projectPhases.project_id,
            name: projectPhases.name,
          })
          .from(projectPhases)
          .where(eq(projectPhases.id, phaseId))
          .limit(1)
      )

      if (phaseRow) {
        const [subRow] = await withRls(token, (db) =>
          db
            .select({ name: subcontractors.name })
            .from(subcontractors)
            .where(eq(subcontractors.id, data.subcontractor_id))
            .limit(1)
        )

        const [projectRow] = await withRls(token, (db) =>
          db
            .select({ activity_log: projects.activity_log })
            .from(projects)
            .where(eq(projects.id, phaseRow.project_id))
            .limit(1)
        )

        if (projectRow) {
          const now = new Date()
          const updatedLog = [
            ...(projectRow.activity_log ?? []),
            {
              type: "sub_assigned",
              at: now.toISOString(),
              by_id: token.sub,
              note: `${subRow?.name ?? "Subcontractor"} assigned to phase "${phaseRow.name}"`,
            },
          ]

          await withRls(token, (db) =>
            db
              .update(projects)
              .set({ activity_log: updatedLog, last_activity_at: now, updated_at: now })
              .where(eq(projects.id, phaseRow.project_id))
          )
        }
      }
    } catch {
      // Activity log update is best-effort
    }

    // Fetch enriched row
    const enriched = await _fetchAssignmentRow(token, assignment.id)
    if (!enriched) return { error: "Failed to fetch assignment" }

    revalidatePath("/projects")
    return { data: enriched }
  } catch (err) {
    console.error("[assignSubToPhase]", err)
    return { error: "Failed to assign subcontractor" }
  }
}

// ---------------------------------------------------------------------------
// updateSubAssignment (PROJ-36)
// ---------------------------------------------------------------------------

export interface UpdateSubAssignmentInput {
  status?: string
  scope_of_work?: string | null
  agreed_price?: string | null
  scheduled_start?: string | null
  scheduled_end?: string | null
}

export async function updateSubAssignment(
  assignmentId: string,
  data: UpdateSubAssignmentInput
): Promise<{ data: SubAssignmentRow } | { error: string }> {
  const token = await getToken()
  if (!token) return { error: "Not authenticated" }

  try {
    const updateValues: Record<string, unknown> = { updated_at: new Date() }
    if (data.status !== undefined) updateValues.status = data.status
    if (data.scope_of_work !== undefined) updateValues.scope_of_work = data.scope_of_work
    if (data.agreed_price !== undefined) updateValues.agreed_price = data.agreed_price
    if (data.scheduled_start !== undefined) updateValues.scheduled_start = data.scheduled_start
    if (data.scheduled_end !== undefined) updateValues.scheduled_end = data.scheduled_end

    await withRls(token, (db) =>
      db
        .update(projectPhaseSubcontractors)
        .set(updateValues)
        .where(eq(projectPhaseSubcontractors.id, assignmentId))
    )

    // Append status change to project activity_log (best-effort)
    if (data.status) {
      try {
        const [assignRow] = await withRls(token, (db) =>
          db
            .select({
              phase_id: projectPhaseSubcontractors.phase_id,
              subcontractor_id: projectPhaseSubcontractors.subcontractor_id,
            })
            .from(projectPhaseSubcontractors)
            .where(eq(projectPhaseSubcontractors.id, assignmentId))
            .limit(1)
        )

        if (assignRow) {
          const [phaseRow] = await withRls(token, (db) =>
            db
              .select({ project_id: projectPhases.project_id, name: projectPhases.name })
              .from(projectPhases)
              .where(eq(projectPhases.id, assignRow.phase_id))
              .limit(1)
          )

          if (phaseRow) {
            const [subRow] = await withRls(token, (db) =>
              db
                .select({ name: subcontractors.name })
                .from(subcontractors)
                .where(eq(subcontractors.id, assignRow.subcontractor_id))
                .limit(1)
            )

            const [projectRow] = await withRls(token, (db) =>
              db
                .select({ activity_log: projects.activity_log })
                .from(projects)
                .where(eq(projects.id, phaseRow.project_id))
                .limit(1)
            )

            if (projectRow) {
              const now = new Date()
              const statusLabels: Record<string, string> = {
                not_started: "Not Started",
                in_progress: "In Progress",
                complete: "Complete",
                needs_rework: "Needs Rework",
              }
              const updatedLog = [
                ...(projectRow.activity_log ?? []),
                {
                  type: "sub_status_update",
                  at: now.toISOString(),
                  by_id: token.sub,
                  note: `${subRow?.name ?? "Subcontractor"} status on "${phaseRow.name}" → ${statusLabels[data.status] ?? data.status}`,
                },
              ]

              await withRls(token, (db) =>
                db
                  .update(projects)
                  .set({ activity_log: updatedLog, last_activity_at: now, updated_at: now })
                  .where(eq(projects.id, phaseRow.project_id))
              )
            }
          }
        }
      } catch {
        // Best-effort
      }
    }

    const enriched = await _fetchAssignmentRow(token, assignmentId)
    if (!enriched) return { error: "Assignment not found" }

    revalidatePath("/projects")
    return { data: enriched }
  } catch (err) {
    console.error("[updateSubAssignment]", err)
    return { error: "Failed to update assignment" }
  }
}

// ---------------------------------------------------------------------------
// getSubAssignmentsForProject (PROJ-35)
// ---------------------------------------------------------------------------

export async function getSubAssignmentsForProject(
  projectId: string
): Promise<SubAssignmentRow[] | { error: string }> {
  const token = await getToken()
  if (!token) return { error: "Not authenticated" }

  try {
    // Get all phase IDs for this project
    const phaseRows = await withRls(token, (db) =>
      db
        .select({ id: projectPhases.id })
        .from(projectPhases)
        .where(eq(projectPhases.project_id, projectId))
    )

    if (phaseRows.length === 0) return []

    const phaseIds = phaseRows.map((p) => p.id)

    const rows = await withRls(token, (db) =>
      db
        .select({
          id: projectPhaseSubcontractors.id,
          org_id: projectPhaseSubcontractors.org_id,
          phase_id: projectPhaseSubcontractors.phase_id,
          subcontractor_id: projectPhaseSubcontractors.subcontractor_id,
          subName: subcontractors.name,
          subTrade: subcontractors.trade,
          subEmail: subcontractors.email,
          subInsuranceExpiry: subcontractors.insurance_expiry,
          phaseName: projectPhases.name,
          scope_of_work: projectPhaseSubcontractors.scope_of_work,
          agreed_price: projectPhaseSubcontractors.agreed_price,
          status: projectPhaseSubcontractors.status,
          payment_status: projectPhaseSubcontractors.payment_status,
          amount_paid: projectPhaseSubcontractors.amount_paid,
          lien_waiver_path: projectPhaseSubcontractors.lien_waiver_path,
          scheduled_start: projectPhaseSubcontractors.scheduled_start,
          scheduled_end: projectPhaseSubcontractors.scheduled_end,
          created_at: projectPhaseSubcontractors.created_at,
          updated_at: projectPhaseSubcontractors.updated_at,
        })
        .from(projectPhaseSubcontractors)
        .leftJoin(subcontractors, eq(projectPhaseSubcontractors.subcontractor_id, subcontractors.id))
        .leftJoin(projectPhases, eq(projectPhaseSubcontractors.phase_id, projectPhases.id))
        .where(inArray(projectPhaseSubcontractors.phase_id, phaseIds))
        .orderBy(projectPhaseSubcontractors.created_at)
    )

    return rows.map((r) => ({
      ...r,
      subName: r.subName ?? "Unknown Sub",
      subTrade: r.subTrade ?? "other",
      phaseName: r.phaseName ?? "Unknown Phase",
    }))
  } catch (err) {
    console.error("[getSubAssignmentsForProject]", err)
    return { error: "Failed to load sub assignments" }
  }
}

// ---------------------------------------------------------------------------
// recordSubPayment (PROJ-37)
// ---------------------------------------------------------------------------

export interface RecordSubPaymentInput {
  amount_paid: string
  lien_waiver_path?: string | null
}

export async function recordSubPayment(
  assignmentId: string,
  data: RecordSubPaymentInput
): Promise<{ data: SubAssignmentRow } | { error: string }> {
  const token = await getToken()
  if (!token) return { error: "Not authenticated" }

  try {
    // Fetch existing agreed_price to compute payment_status
    const [existing] = await withRls(token, (db) =>
      db
        .select({
          agreed_price: projectPhaseSubcontractors.agreed_price,
        })
        .from(projectPhaseSubcontractors)
        .where(eq(projectPhaseSubcontractors.id, assignmentId))
        .limit(1)
    )

    if (!existing) return { error: "Assignment not found" }

    const paid = parseFloat(data.amount_paid) || 0
    const agreed = parseFloat(existing.agreed_price ?? "0") || 0

    let payment_status = "unpaid"
    if (paid >= agreed && agreed > 0) {
      payment_status = "paid"
    } else if (paid > 0) {
      payment_status = "partial"
    }

    await withRls(token, (db) =>
      db
        .update(projectPhaseSubcontractors)
        .set({
          amount_paid: data.amount_paid,
          payment_status,
          ...(data.lien_waiver_path !== undefined && { lien_waiver_path: data.lien_waiver_path }),
          updated_at: new Date(),
        })
        .where(eq(projectPhaseSubcontractors.id, assignmentId))
    )

    const enriched = await _fetchAssignmentRow(token, assignmentId)
    if (!enriched) return { error: "Assignment not found after update" }

    revalidatePath("/projects")
    return { data: enriched }
  } catch (err) {
    console.error("[recordSubPayment]", err)
    return { error: "Failed to record payment" }
  }
}

// ---------------------------------------------------------------------------
// getSubPaymentSummary (PROJ-37)
// ---------------------------------------------------------------------------

export async function getSubPaymentSummary(
  projectId: string
): Promise<SubPaymentSummary[] | { error: string }> {
  const token = await getToken()
  if (!token) return { error: "Not authenticated" }

  try {
    const phaseRows = await withRls(token, (db) =>
      db
        .select({ id: projectPhases.id })
        .from(projectPhases)
        .where(eq(projectPhases.project_id, projectId))
    )

    if (phaseRows.length === 0) return []

    const phaseIds = phaseRows.map((p) => p.id)

    const rows = await withRls(token, (db) =>
      db
        .select({
          subcontractor_id: projectPhaseSubcontractors.subcontractor_id,
          subName: subcontractors.name,
          subTrade: subcontractors.trade,
          assignmentId: projectPhaseSubcontractors.id,
          phaseName: projectPhases.name,
          agreed_price: projectPhaseSubcontractors.agreed_price,
          amount_paid: projectPhaseSubcontractors.amount_paid,
          payment_status: projectPhaseSubcontractors.payment_status,
          lien_waiver_path: projectPhaseSubcontractors.lien_waiver_path,
        })
        .from(projectPhaseSubcontractors)
        .leftJoin(subcontractors, eq(projectPhaseSubcontractors.subcontractor_id, subcontractors.id))
        .leftJoin(projectPhases, eq(projectPhaseSubcontractors.phase_id, projectPhases.id))
        .where(inArray(projectPhaseSubcontractors.phase_id, phaseIds))
        .orderBy(subcontractors.name)
    )

    return rows.map((r) => ({
      subcontractor_id: r.subcontractor_id,
      subName: r.subName ?? "Unknown",
      subTrade: r.subTrade ?? "other",
      assignmentId: r.assignmentId,
      phaseName: r.phaseName ?? "Unknown Phase",
      agreed_price: r.agreed_price,
      amount_paid: r.amount_paid,
      payment_status: r.payment_status,
      lien_waiver_path: r.lien_waiver_path,
    }))
  } catch (err) {
    console.error("[getSubPaymentSummary]", err)
    return { error: "Failed to load payment summary" }
  }
}

// ---------------------------------------------------------------------------
// sendSubNotification (PROJ-38)
// ---------------------------------------------------------------------------

/**
 * Sends a schedule notification email to the subcontractor for a given assignment.
 * Includes: project address, phase name, scope of work, scheduled dates,
 * site access info (from project.site_notes), and agreed price.
 */
export async function sendSubNotification(
  assignmentId: string
): Promise<{ success: true } | { error: string }> {
  const token = await getToken()
  if (!token) return { error: "Not authenticated" }

  try {
    // Fetch assignment with sub + phase + project + customer info
    const [row] = await withRls(token, (db) =>
      db
        .select({
          subName: subcontractors.name,
          subEmail: subcontractors.email,
          phaseName: projectPhases.name,
          scope_of_work: projectPhaseSubcontractors.scope_of_work,
          agreed_price: projectPhaseSubcontractors.agreed_price,
          scheduled_start: projectPhaseSubcontractors.scheduled_start,
          scheduled_end: projectPhaseSubcontractors.scheduled_end,
          projectId: projectPhases.project_id,
        })
        .from(projectPhaseSubcontractors)
        .leftJoin(subcontractors, eq(projectPhaseSubcontractors.subcontractor_id, subcontractors.id))
        .leftJoin(projectPhases, eq(projectPhaseSubcontractors.phase_id, projectPhases.id))
        .where(eq(projectPhaseSubcontractors.id, assignmentId))
        .limit(1)
    )

    if (!row) return { error: "Assignment not found" }
    if (!row.subEmail) return { error: "Subcontractor has no email address on file" }
    if (!row.projectId) return { error: "Phase has no project" }

    // Fetch project address + site notes
    const [projectRow] = await withRls(token, (db) =>
      db
        .select({
          site_notes: projects.site_notes,
          customerAddress: customers.address,
        })
        .from(projects)
        .leftJoin(customers, eq(projects.customer_id, customers.id))
        .where(eq(projects.id, row.projectId!))
        .limit(1)
    )

    // Fetch org name for email branding
    const [orgRow] = await withRls(token, (db) =>
      db
        .select({ name: orgs.name })
        .from(orgs)
        .where(eq(orgs.id, token.org_id!))
        .limit(1)
    )

    const companyName = orgRow?.name ?? "Your Pool Company"
    const projectAddress = projectRow?.customerAddress ?? "Address on file"
    const siteNotes = projectRow?.site_notes
      ? Object.entries(projectRow.site_notes as Record<string, string>)
          .filter(([, v]) => v)
          .map(([k, v]) => `${k}: ${v}`)
          .join("\n")
      : null

    const resendKey = process.env.RESEND_API_KEY
    if (!resendKey) return { error: "Email service not configured" }

    const resend = new Resend(resendKey)

    const emailHtml = await renderEmail(
      SubcontractorNotificationEmail({
        companyName,
        subName: row.subName ?? "Subcontractor",
        projectAddress,
        phaseName: row.phaseName ?? "Project Phase",
        scopeOfWork: row.scope_of_work,
        scheduledStart: row.scheduled_start,
        scheduledEnd: row.scheduled_end,
        agreedPrice: row.agreed_price,
        siteNotes,
        specialInstructions: null,
      })
    )

    const { error: sendError } = await resend.emails.send({
      from: `${companyName} <notifications@deweyiq.com>`,
      to: row.subEmail,
      subject: `Work scheduled: ${row.phaseName ?? "Project Phase"} at ${projectAddress}`,
      html: emailHtml,
    })

    if (sendError) {
      console.error("[sendSubNotification] Resend error:", sendError)
      return { error: "Failed to send notification email" }
    }

    return { success: true }
  } catch (err) {
    console.error("[sendSubNotification]", err)
    return { error: "Failed to send notification" }
  }
}

// ---------------------------------------------------------------------------
// Internal helper: fetch enriched assignment row
// ---------------------------------------------------------------------------

async function _fetchAssignmentRow(
  token: SupabaseToken,
  assignmentId: string
): Promise<SubAssignmentRow | null> {
  try {
    const [row] = await withRls(token, (db) =>
      db
        .select({
          id: projectPhaseSubcontractors.id,
          org_id: projectPhaseSubcontractors.org_id,
          phase_id: projectPhaseSubcontractors.phase_id,
          subcontractor_id: projectPhaseSubcontractors.subcontractor_id,
          subName: subcontractors.name,
          subTrade: subcontractors.trade,
          subEmail: subcontractors.email,
          subInsuranceExpiry: subcontractors.insurance_expiry,
          phaseName: projectPhases.name,
          scope_of_work: projectPhaseSubcontractors.scope_of_work,
          agreed_price: projectPhaseSubcontractors.agreed_price,
          status: projectPhaseSubcontractors.status,
          payment_status: projectPhaseSubcontractors.payment_status,
          amount_paid: projectPhaseSubcontractors.amount_paid,
          lien_waiver_path: projectPhaseSubcontractors.lien_waiver_path,
          scheduled_start: projectPhaseSubcontractors.scheduled_start,
          scheduled_end: projectPhaseSubcontractors.scheduled_end,
          created_at: projectPhaseSubcontractors.created_at,
          updated_at: projectPhaseSubcontractors.updated_at,
        })
        .from(projectPhaseSubcontractors)
        .leftJoin(subcontractors, eq(projectPhaseSubcontractors.subcontractor_id, subcontractors.id))
        .leftJoin(projectPhases, eq(projectPhaseSubcontractors.phase_id, projectPhases.id))
        .where(eq(projectPhaseSubcontractors.id, assignmentId))
        .limit(1)
    )

    if (!row) return null

    return {
      ...row,
      subName: row.subName ?? "Unknown Sub",
      subTrade: row.subTrade ?? "other",
      phaseName: row.phaseName ?? "Unknown Phase",
    }
  } catch {
    return null
  }
}
