"use server"

/**
 * projects-inspections.ts — Inspections, quality checklists, and punch list
 * server actions.
 *
 * Phase 12 Plan 15 (PROJ-69 through PROJ-72)
 *
 * Actions:
 * - createInspection: schedule a new inspection
 * - recordInspectionResult: record pass/fail with rework task creation on failure
 * - getInspections: fetch all inspections for a project
 * - getQualityChecklist: return self-inspection checklist for a phase (exported for completePhase)
 * - createPunchListItem: add a punch list item
 * - updatePunchListItem: update status/notes/evidence
 * - getPunchList: fetch all punch list items
 * - customerSignOffPunchList: customer accepts all resolved items (adminDb),
 *   triggers project completion + warranty activation + final invoice generation
 *
 * Critical patterns:
 * - withRls(token, ...) for office actions
 * - adminDb for portal-facing actions (no user session) and cross-org admin ops
 * - LEFT JOIN instead of correlated subqueries (per MEMORY.md)
 */

import { revalidatePath } from "next/cache"
import { createClient } from "@/lib/supabase/server"
import { withRls, adminDb } from "@/lib/db"
import type { SupabaseToken } from "@/lib/db"
import {
  projectInspections,
  projectPhaseTasks,
  projectPunchList,
  projectPhases,
  projects,
  alerts,
  profiles,
} from "@/lib/db/schema"
import { eq, and, isNull, asc } from "drizzle-orm"
import { toLocalDateString } from "@/lib/date-utils"

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
// Types
// ---------------------------------------------------------------------------

export interface InspectionSummary {
  id: string
  inspectionType: string
  scheduledDate: string | null
  actualDate: string | null
  inspectorName: string | null
  inspectorContact: string | null
  phaseId: string | null
  status: string
  resultNotes: string | null
  correctionTasks: Array<{ description: string; completed: boolean }> | null
  documents: string[] | null
  createdAt: Date
}

export interface QualityChecklistItem {
  id: string
  label: string
  isRequired: boolean
}

export interface PunchListItem {
  id: string
  projectId: string
  itemDescription: string
  status: string
  assignedTo: string | null
  assignedToName: string | null
  photoUrls: string[] | null
  resolutionNotes: string | null
  resolvedAt: Date | null
  customerAcceptedAt: Date | null
  createdAt: Date
}

// ---------------------------------------------------------------------------
// Quality checklist templates by phase name (PROJ-71)
// ---------------------------------------------------------------------------
// These are the self-inspection items a tech checks before marking a phase complete.
// Keyed by normalized phase name patterns.

const QUALITY_CHECKLIST_TEMPLATES: Record<
  string,
  Array<{ label: string; isRequired: boolean }>
> = {
  excavation: [
    { label: "Excavation dimensions match design plans", isRequired: true },
    { label: "Soil/rock conditions documented and reported to office", isRequired: true },
    { label: "Debris removal complete", isRequired: true },
    { label: "Slopes stable — no cave-in risk", isRequired: true },
  ],
  steel: [
    { label: "Rebar spacing matches engineering specs", isRequired: true },
    { label: "Bond beam steel in place", isRequired: true },
    { label: "All chairs/supports installed", isRequired: true },
    { label: "Steel inspection scheduled or passed", isRequired: true },
    { label: "Photos taken of all steel before gunite", isRequired: true },
  ],
  gunite: [
    { label: "All steel tied and ready before shoot", isRequired: true },
    { label: "Plumbing lines protected during gunite", isRequired: true },
    { label: "Shell thickness meets specs", isRequired: true },
    { label: "Curing in progress", isRequired: true },
    { label: "No visible voids or cold joints", isRequired: true },
  ],
  plumbing: [
    { label: "Main drain roughin installed", isRequired: true },
    { label: "Return lines placed and tied off", isRequired: true },
    { label: "Skimmer rough-in complete", isRequired: true },
    { label: "All fittings glued/solvent-welded", isRequired: true },
    { label: "Pressure test passed (30 PSI minimum)", isRequired: true },
    { label: "Plumbing inspection scheduled", isRequired: false },
  ],
  electrical: [
    { label: "Bonding wire installed and connected to all metal components", isRequired: true },
    { label: "Conduit runs complete", isRequired: true },
    { label: "Junction box locations match plan", isRequired: true },
    { label: "GFCI protection verified", isRequired: true },
    { label: "Electrical inspection scheduled", isRequired: true },
  ],
  decking: [
    { label: "Sub-base compacted and level", isRequired: true },
    { label: "Expansion joints placed per plan", isRequired: true },
    { label: "Drainage slope away from pool (1/4\" per foot)", isRequired: true },
    { label: "Concrete/pavers installed to spec", isRequired: true },
    { label: "No cracks > 1/4\" in cured concrete", isRequired: false },
  ],
  tile: [
    { label: "Waterline tile aligned and level", isRequired: true },
    { label: "Grout lines consistent", isRequired: true },
    { label: "No cracked or chipped tiles", isRequired: true },
    { label: "Tile adhesive fully cured before grouting", isRequired: true },
  ],
  equipment: [
    { label: "Equipment pad level and adequately sized", isRequired: true },
    { label: "All equipment installed per manufacturer specs", isRequired: true },
    { label: "Pump primed and operational", isRequired: true },
    { label: "Filter media installed", isRequired: true },
    { label: "Automation controller programmed (if applicable)", isRequired: false },
    { label: "Equipment bonded to pool bonding grid", isRequired: true },
    { label: "All unions and fittings leak-free", isRequired: true },
  ],
  startup: [
    { label: "Pool filled to operating level", isRequired: true },
    { label: "Initial startup chemicals added", isRequired: true },
    { label: "Water chemistry balanced (pH, chlorine, alkalinity)", isRequired: true },
    { label: "All equipment running correctly", isRequired: true },
    { label: "Customer orientation completed", isRequired: true },
    { label: "Owner's manuals and warranty cards provided to customer", isRequired: true },
  ],
  final: [
    { label: "All punch list items from prior phases resolved", isRequired: true },
    { label: "Site cleaned — all debris removed", isRequired: true },
    { label: "Final photos taken", isRequired: true },
    { label: "All equipment operational and tested", isRequired: true },
    { label: "Water chemistry balanced", isRequired: true },
    { label: "Customer walkthrough scheduled", isRequired: true },
  ],
  default: [
    { label: "Work area cleaned up", isRequired: true },
    { label: "Photos taken documenting completion", isRequired: true },
    { label: "All tasks on the task list completed", isRequired: true },
  ],
}

/** Normalize a phase name to a template key */
function getTemplateKey(phaseName: string): string {
  const lower = phaseName.toLowerCase()
  for (const key of Object.keys(QUALITY_CHECKLIST_TEMPLATES)) {
    if (key !== "default" && lower.includes(key)) {
      return key
    }
  }
  return "default"
}

// ---------------------------------------------------------------------------
// createInspection (PROJ-69)
// ---------------------------------------------------------------------------

export interface CreateInspectionInput {
  projectId: string
  inspectionType: string
  scheduledDate?: string | null
  inspectorName?: string | null
  inspectorContact?: string | null
  phaseId?: string | null
}

export async function createInspection(
  token: SupabaseToken | null,
  projectId: string,
  data: CreateInspectionInput
): Promise<{ data: { inspectionId: string } } | { error: string }> {
  const t = token ?? (await getToken())
  if (!t) return { error: "Not authenticated" }
  if (!t.org_id) return { error: "No org context" }

  try {
    const inserted = await withRls(t, (db) =>
      db
        .insert(projectInspections)
        .values({
          org_id: t.org_id as string,
          project_id: projectId,
          inspection_type: data.inspectionType,
          scheduled_date: data.scheduledDate ?? null,
          inspector_name: data.inspectorName ?? null,
          inspector_contact: data.inspectorContact ?? null,
          phase_id: data.phaseId ?? null,
          status: "scheduled",
        })
        .returning({ id: projectInspections.id })
    )

    if (!inserted[0]) return { error: "Failed to create inspection" }

    revalidatePath(`/projects/${projectId}`)
    return { data: { inspectionId: inserted[0].id } }
  } catch (err) {
    console.error("[createInspection]", err)
    return { error: "Failed to create inspection" }
  }
}

// ---------------------------------------------------------------------------
// recordInspectionResult (PROJ-69, PROJ-70)
// ---------------------------------------------------------------------------

export interface RecordInspectionResultInput {
  status: "passed" | "failed" | "cancelled" | "rescheduled"
  actualDate?: string | null
  resultNotes?: string | null
  documents?: string[] | null
  correctionTasks?: Array<{ description: string; completed: boolean }> | null
}

export async function recordInspectionResult(
  token: SupabaseToken | null,
  inspectionId: string,
  data: RecordInspectionResultInput
): Promise<{ success: true } | { error: string }> {
  const t = token ?? (await getToken())
  if (!t) return { error: "Not authenticated" }
  if (!t.org_id) return { error: "No org context" }

  try {
    const orgId = t.org_id as string

    // Fetch the inspection to get project_id and phase_id
    const inspectionRows = await withRls(t, (db) =>
      db
        .select({
          id: projectInspections.id,
          project_id: projectInspections.project_id,
          phase_id: projectInspections.phase_id,
          inspection_type: projectInspections.inspection_type,
        })
        .from(projectInspections)
        .where(eq(projectInspections.id, inspectionId))
    )

    if (inspectionRows.length === 0) return { error: "Inspection not found" }
    const inspection = inspectionRows[0]

    // Update the inspection record
    await withRls(t, (db) =>
      db
        .update(projectInspections)
        .set({
          status: data.status,
          actual_date: data.actualDate ?? toLocalDateString(new Date()),
          result_notes: data.resultNotes ?? null,
          documents: data.documents ?? null,
          correction_tasks: data.correctionTasks ?? null,
          updated_at: new Date(),
        })
        .where(eq(projectInspections.id, inspectionId))
    )

    // PROJ-70: On failure, auto-create rework tasks on the relevant phase
    if (data.status === "failed" && inspection.phase_id && data.correctionTasks && data.correctionTasks.length > 0) {
      // Count current tasks to set sort_order
      const existingTasks = await withRls(t, (db) =>
        db
          .select({ id: projectPhaseTasks.id })
          .from(projectPhaseTasks)
          .where(eq(projectPhaseTasks.phase_id, inspection.phase_id!))
      )
      let sortOffset = existingTasks.length

      // Insert correction tasks as required phase tasks
      for (const task of data.correctionTasks) {
        await withRls(t, (db) =>
          db.insert(projectPhaseTasks).values({
            org_id: orgId,
            phase_id: inspection.phase_id!,
            name: `[Rework] ${task.description}`,
            is_required: true,
            is_completed: false,
            sort_order: sortOffset++,
            notes: `Auto-created from failed ${inspection.inspection_type} inspection`,
          })
        )
      }

      // Create office alert for failed inspection with rework tasks
      try {
        await adminDb.insert(alerts).values({
          org_id: orgId,
          alert_type: "project_inspection_failed",
          severity: "warning",
          reference_id: inspectionId,
          reference_type: "project_inspection",
          title: `Inspection Failed: ${inspection.inspection_type}`,
          description: `${data.correctionTasks.length} rework task(s) have been added to the phase. Review and assign.`,
          generated_at: new Date(),
        })
      } catch {
        // Non-fatal
      }
    }

    // Also alert on failure even without correction tasks
    if (data.status === "failed" && (!data.correctionTasks || data.correctionTasks.length === 0)) {
      try {
        await adminDb.insert(alerts).values({
          org_id: orgId,
          alert_type: "project_inspection_failed",
          severity: "warning",
          reference_id: inspectionId,
          reference_type: "project_inspection",
          title: `Inspection Failed: ${inspection.inspection_type}`,
          description: data.resultNotes ?? "Inspection did not pass. Review notes and take corrective action.",
          generated_at: new Date(),
        })
      } catch {
        // Non-fatal
      }
    }

    revalidatePath(`/projects/${inspection.project_id}`)
    return { success: true }
  } catch (err) {
    console.error("[recordInspectionResult]", err)
    return { error: "Failed to record inspection result" }
  }
}

// ---------------------------------------------------------------------------
// getInspections (PROJ-69)
// ---------------------------------------------------------------------------

export async function getInspections(
  token: SupabaseToken | null,
  projectId: string
): Promise<InspectionSummary[] | { error: string }> {
  const t = token ?? (await getToken())
  if (!t) return { error: "Not authenticated" }

  try {
    const rows = await withRls(t, (db) =>
      db
        .select()
        .from(projectInspections)
        .where(
          and(
            eq(projectInspections.project_id, projectId),
            isNull(projectInspections.archived_at)
          )
        )
        .orderBy(asc(projectInspections.created_at))
    )

    return rows.map((r) => ({
      id: r.id,
      inspectionType: r.inspection_type,
      scheduledDate: r.scheduled_date,
      actualDate: r.actual_date,
      inspectorName: r.inspector_name,
      inspectorContact: r.inspector_contact,
      phaseId: r.phase_id,
      status: r.status,
      resultNotes: r.result_notes,
      correctionTasks: r.correction_tasks,
      documents: r.documents,
      createdAt: r.created_at,
    }))
  } catch (err) {
    console.error("[getInspections]", err)
    return { error: "Failed to fetch inspections" }
  }
}

// ---------------------------------------------------------------------------
// getQualityChecklist (PROJ-71)
// CRITICAL: exported for use by completePhase in projects-field.ts
// ---------------------------------------------------------------------------

/**
 * getQualityChecklist — Return the self-inspection checklist for a phase.
 *
 * The checklist is keyed off the phase name. Items are compared against
 * completed phase tasks that are named with "[Quality]" prefix to determine
 * which have been checked off.
 *
 * This function is imported by completePhase in projects-field.ts to validate
 * that all required checklist items are marked complete before allowing phase
 * completion.
 */
export async function getQualityChecklist(
  token: SupabaseToken | null,
  phaseId: string
): Promise<
  | {
      data: {
        items: Array<{
          id: string
          label: string
          isRequired: boolean
          isCompleted: boolean
        }>
        phaseName: string
      }
    }
  | { error: string }
> {
  const t = token ?? (await getToken())
  if (!t) return { error: "Not authenticated" }

  try {
    // Fetch phase name
    const phaseRows = await withRls(t, (db) =>
      db
        .select({ name: projectPhases.name })
        .from(projectPhases)
        .where(eq(projectPhases.id, phaseId))
    )

    if (phaseRows.length === 0) return { error: "Phase not found" }
    const phaseName = phaseRows[0].name

    const templateKey = getTemplateKey(phaseName)
    const template = QUALITY_CHECKLIST_TEMPLATES[templateKey]

    // Fetch tasks with "[Quality]" prefix to determine what's been self-checked
    const qualityTasks = await withRls(t, (db) =>
      db
        .select({
          name: projectPhaseTasks.name,
          is_completed: projectPhaseTasks.is_completed,
        })
        .from(projectPhaseTasks)
        .where(
          and(
            eq(projectPhaseTasks.phase_id, phaseId),
            // Match quality checklist tasks
          )
        )
    ).then((tasks) => tasks.filter((t) => t.name.startsWith("[Quality]")))

    const completedLabels = new Set(
      qualityTasks
        .filter((t) => t.is_completed)
        .map((t) => t.name.replace("[Quality] ", ""))
    )

    const items = template.map((item, idx) => ({
      id: `${templateKey}-${idx}`,
      label: item.label,
      isRequired: item.isRequired,
      isCompleted: completedLabels.has(item.label),
    }))

    return { data: { items, phaseName } }
  } catch (err) {
    console.error("[getQualityChecklist]", err)
    return { error: "Failed to fetch quality checklist" }
  }
}

// ---------------------------------------------------------------------------
// createPunchListItem (PROJ-72)
// ---------------------------------------------------------------------------

export interface CreatePunchListItemInput {
  itemDescription: string
  assignedTo?: string | null
  photoUrls?: string[] | null
}

export async function createPunchListItem(
  token: SupabaseToken | null,
  projectId: string,
  data: CreatePunchListItemInput
): Promise<{ data: { itemId: string } } | { error: string }> {
  const t = token ?? (await getToken())
  if (!t) return { error: "Not authenticated" }
  if (!t.org_id) return { error: "No org context" }

  try {
    const inserted = await withRls(t, (db) =>
      db
        .insert(projectPunchList)
        .values({
          org_id: t.org_id as string,
          project_id: projectId,
          item_description: data.itemDescription,
          assigned_to: data.assignedTo ?? null,
          photo_urls: data.photoUrls ?? null,
          status: "open",
        })
        .returning({ id: projectPunchList.id })
    )

    if (!inserted[0]) return { error: "Failed to create punch list item" }

    revalidatePath(`/projects/${projectId}`)
    return { data: { itemId: inserted[0].id } }
  } catch (err) {
    console.error("[createPunchListItem]", err)
    return { error: "Failed to create punch list item" }
  }
}

// ---------------------------------------------------------------------------
// updatePunchListItem (PROJ-72)
// ---------------------------------------------------------------------------

export interface UpdatePunchListItemInput {
  status?: "open" | "in_progress" | "resolved" | "accepted"
  resolutionNotes?: string | null
  photoUrls?: string[] | null
  assignedTo?: string | null
}

export async function updatePunchListItem(
  token: SupabaseToken | null,
  itemId: string,
  data: UpdatePunchListItemInput
): Promise<{ success: true } | { error: string }> {
  const t = token ?? (await getToken())
  if (!t) return { error: "Not authenticated" }

  try {
    const updates: Record<string, unknown> = {
      updated_at: new Date(),
    }
    if (data.status !== undefined) updates.status = data.status
    if (data.resolutionNotes !== undefined) updates.resolution_notes = data.resolutionNotes
    if (data.photoUrls !== undefined) updates.photo_urls = data.photoUrls
    if (data.assignedTo !== undefined) updates.assigned_to = data.assignedTo
    if (data.status === "resolved") updates.resolved_at = new Date()

    await withRls(t, (db) =>
      db
        .update(projectPunchList)
        .set(updates)
        .where(eq(projectPunchList.id, itemId))
    )

    return { success: true }
  } catch (err) {
    console.error("[updatePunchListItem]", err)
    return { error: "Failed to update punch list item" }
  }
}

// ---------------------------------------------------------------------------
// getPunchList (PROJ-72)
// ---------------------------------------------------------------------------

export async function getPunchList(
  token: SupabaseToken | null,
  projectId: string
): Promise<PunchListItem[] | { error: string }> {
  const t = token ?? (await getToken())
  if (!t) return { error: "Not authenticated" }

  try {
    const rows = await withRls(t, (db) =>
      db
        .select({
          id: projectPunchList.id,
          project_id: projectPunchList.project_id,
          item_description: projectPunchList.item_description,
          status: projectPunchList.status,
          assigned_to: projectPunchList.assigned_to,
          photo_urls: projectPunchList.photo_urls,
          resolution_notes: projectPunchList.resolution_notes,
          resolved_at: projectPunchList.resolved_at,
          customer_accepted_at: projectPunchList.customer_accepted_at,
          created_at: projectPunchList.created_at,
          assignedToName: profiles.full_name,
        })
        .from(projectPunchList)
        .leftJoin(profiles, eq(profiles.id, projectPunchList.assigned_to))
        .where(eq(projectPunchList.project_id, projectId))
        .orderBy(asc(projectPunchList.created_at))
    )

    return rows.map((r) => ({
      id: r.id,
      projectId: r.project_id,
      itemDescription: r.item_description,
      status: r.status,
      assignedTo: r.assigned_to,
      assignedToName: r.assignedToName ?? null,
      photoUrls: r.photo_urls,
      resolutionNotes: r.resolution_notes,
      resolvedAt: r.resolved_at,
      customerAcceptedAt: r.customer_accepted_at,
      createdAt: r.created_at,
    }))
  } catch (err) {
    console.error("[getPunchList]", err)
    return { error: "Failed to fetch punch list" }
  }
}

// ---------------------------------------------------------------------------
// customerSignOffPunchList (PROJ-72)
// Uses adminDb — called from portal (no user session).
// CRITICAL: triggers three downstream actions:
//   1. Set project stage='complete'
//   2. activateWarranty (imported from projects-warranty)
//   3. generateFinalInvoice (imported from projects-billing)
// ---------------------------------------------------------------------------

export async function customerSignOffPunchList(
  projectId: string,
  signatureData: string
): Promise<{ success: true } | { error: string }> {
  // Import here to avoid circular dependency at module level
  const { activateWarranty } = await import("@/actions/projects-warranty")
  const { generateFinalInvoice } = await import("@/actions/projects-billing")

  try {
    const now = new Date()

    // Mark all resolved items as customer-accepted
    await adminDb
      .update(projectPunchList)
      .set({
        status: "accepted",
        customer_accepted_at: now,
        updated_at: now,
      })
      .where(
        and(
          eq(projectPunchList.project_id, projectId),
          eq(projectPunchList.status, "resolved")
        )
      )

    // 1. Set project stage = 'complete' and record sign-off in activity log
    const projectRow = await adminDb
      .select({
        activity_log: projects.activity_log,
        org_id: projects.org_id,
      })
      .from(projects)
      .where(eq(projects.id, projectId))

    if (projectRow.length === 0) return { error: "Project not found" }
    const { activity_log: existingLog, org_id: orgId } = projectRow[0]

    const newLog = [
      ...(existingLog ?? []),
      {
        type: "customer_signoff",
        at: now.toISOString(),
        by_id: "customer",
        note: `Customer signed off on final walkthrough punch list${signatureData ? " (signature provided)" : ""}` as string | null,
      },
    ]

    await adminDb
      .update(projects)
      .set({
        stage: "complete",
        activity_log: newLog,
        last_activity_at: now,
        updated_at: now,
      })
      .where(eq(projects.id, projectId))

    // Build a minimal service-role context for downstream actions
    // (these actions accept token | null and fall back to getToken or adminDb)
    // We pass null — activateWarranty and generateFinalInvoice use adminDb internally
    // for the org-scoped operations they need.

    // 2. Activate warranty
    const warrantyResult = await activateWarranty(null, projectId)
    if ("error" in warrantyResult) {
      console.warn("[customerSignOffPunchList] Warranty activation failed:", warrantyResult.error)
      // Non-fatal — continue with invoice generation
    }

    // 3. Generate final invoice
    const invoiceResult = await generateFinalInvoice(null, projectId)
    if ("error" in invoiceResult) {
      console.warn("[customerSignOffPunchList] Final invoice generation failed:", invoiceResult.error)
      // Non-fatal — project is marked complete; invoice can be generated manually
    }

    // Create office notification
    try {
      await adminDb.insert(alerts).values({
        org_id: orgId,
        alert_type: "project_walkthrough_complete",
        severity: "info",
        reference_id: projectId,
        reference_type: "project",
        title: "Final Walkthrough Complete",
        description: "Customer has signed off on the punch list. Project is complete. Final invoice has been generated.",
        generated_at: now,
      })
    } catch {
      // Non-fatal
    }

    revalidatePath(`/projects/${projectId}`)
    return { success: true }
  } catch (err) {
    console.error("[customerSignOffPunchList]", err)
    return { error: "Failed to process customer sign-off" }
  }
}
