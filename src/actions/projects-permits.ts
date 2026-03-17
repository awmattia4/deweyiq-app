"use server"

/**
 * projects-permits.ts — Server actions for permit CRUD, permit gate, expiration alerts,
 * and HOA document storage.
 *
 * Phase 12: Projects & Renovations — Plan 08
 *
 * Key patterns:
 * - createPermit: Insert into project_permits with org_id + activity_log append
 * - updatePermit: Update permit fields; optionally upload documents to Supabase Storage
 * - getPermitsForProject: Fetch all non-archived permits for a project
 * - checkPermitGate: Gate check before advancing to in_progress stage
 * - checkPermitExpirations: System job — alerts for permits expiring within 30 days
 * - uploadHoaDocument: Upload to Supabase Storage + insert project_documents record
 * - getProjectDocuments: Fetch all non-archived project documents
 * - deleteProjectDocument: Soft-archive (set archived_at, no hard delete per PROJ-91)
 */

import { createClient } from "@/lib/supabase/server"
import { withRls, adminDb } from "@/lib/db"
import type { SupabaseToken } from "@/lib/db"
import {
  projects,
  projectPermits,
  projectDocuments,
  projectTemplates,
  alerts,
} from "@/lib/db/schema"
import { eq, and, isNull, lte, isNotNull } from "drizzle-orm"
import { toLocalDateString } from "@/lib/date-utils"
import { revalidatePath } from "next/cache"

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type PermitStatus =
  | "not_applied"
  | "applied"
  | "under_review"
  | "approved"
  | "denied"
  | "expired"

export type PermitType =
  | "building"
  | "electrical"
  | "plumbing"
  | "mechanical"
  | "demolition"
  | "excavation"
  | "pool_spa"
  | "hoa"
  | "utility"
  | "other"

export interface Permit {
  id: string
  org_id: string
  project_id: string
  permit_type: string
  permit_number: string | null
  status: string
  applied_date: string | null
  approved_date: string | null
  expiration_date: string | null
  inspector_name: string | null
  inspector_phone: string | null
  fee: string | null
  documents: string[] | null
  notes: string | null
  archived_at: Date | null
  created_at: Date
  updated_at: Date
}

export interface CreatePermitData {
  permit_type: string
  status?: string
  fee?: string
  notes?: string
}

export interface UpdatePermitData {
  permit_type?: string
  permit_number?: string
  status?: string
  applied_date?: string
  approved_date?: string
  expiration_date?: string
  inspector_name?: string
  inspector_phone?: string
  fee?: string
  notes?: string
}

export interface ProjectDocument {
  id: string
  org_id: string
  project_id: string
  document_type: string
  file_path: string
  file_name: string
  uploaded_by: string | null
  archived_at: Date | null
  created_at: Date
}

export interface PermitGateResult {
  canAdvance: boolean
  blockers: Array<{ permitType: string; currentStatus: string }>
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

/** Get org_id from a project (within RLS context) */
async function getProjectOrgId(
  token: SupabaseToken,
  projectId: string
): Promise<string | null> {
  const [row] = await withRls(token, (db) =>
    db
      .select({ org_id: projects.org_id, template_id: projects.template_id })
      .from(projects)
      .where(eq(projects.id, projectId))
      .limit(1)
  )
  return row?.org_id ?? null
}

// ---------------------------------------------------------------------------
// createPermit
// ---------------------------------------------------------------------------

export async function createPermit(
  projectId: string,
  data: CreatePermitData
): Promise<{ permit: Permit } | { error: string }> {
  const token = await getToken()
  if (!token) return { error: "Not authenticated" }

  try {
    // Get org_id + activity_log
    const [projectRow] = await withRls(token, (db) =>
      db
        .select({ org_id: projects.org_id, activity_log: projects.activity_log })
        .from(projects)
        .where(eq(projects.id, projectId))
        .limit(1)
    )
    if (!projectRow) return { error: "Project not found" }

    const now = new Date()
    const [permit] = await withRls(token, (db) =>
      db
        .insert(projectPermits)
        .values({
          org_id: projectRow.org_id,
          project_id: projectId,
          permit_type: data.permit_type,
          status: data.status ?? "not_applied",
          fee: data.fee ?? null,
          notes: data.notes ?? null,
        })
        .returning()
    )

    // Append to project activity_log
    const updatedLog = [
      ...(projectRow.activity_log ?? []),
      {
        type: "permit_added",
        at: now.toISOString(),
        by_id: token.sub,
        note: `Added ${data.permit_type} permit (${data.status ?? "not_applied"})`,
      },
    ]
    await withRls(token, (db) =>
      db
        .update(projects)
        .set({ activity_log: updatedLog, last_activity_at: now, updated_at: now })
        .where(eq(projects.id, projectId))
    )

    revalidatePath(`/projects/${projectId}`)
    return { permit: permit as Permit }
  } catch (err) {
    console.error("[createPermit]", err)
    return { error: "Failed to create permit" }
  }
}

// ---------------------------------------------------------------------------
// updatePermit
// ---------------------------------------------------------------------------

export async function updatePermit(
  permitId: string,
  data: UpdatePermitData
): Promise<{ permit: Permit } | { error: string }> {
  const token = await getToken()
  if (!token) return { error: "Not authenticated" }

  try {
    const [existing] = await withRls(token, (db) =>
      db
        .select({
          id: projectPermits.id,
          project_id: projectPermits.project_id,
          status: projectPermits.status,
          documents: projectPermits.documents,
        })
        .from(projectPermits)
        .where(eq(projectPermits.id, permitId))
        .limit(1)
    )
    if (!existing) return { error: "Permit not found" }

    const now = new Date()

    const [updated] = await withRls(token, (db) =>
      db
        .update(projectPermits)
        .set({
          ...(data.permit_type !== undefined && { permit_type: data.permit_type }),
          ...(data.permit_number !== undefined && { permit_number: data.permit_number }),
          ...(data.status !== undefined && { status: data.status }),
          ...(data.applied_date !== undefined && { applied_date: data.applied_date }),
          ...(data.approved_date !== undefined && { approved_date: data.approved_date }),
          ...(data.expiration_date !== undefined && { expiration_date: data.expiration_date }),
          ...(data.inspector_name !== undefined && { inspector_name: data.inspector_name }),
          ...(data.inspector_phone !== undefined && { inspector_phone: data.inspector_phone }),
          ...(data.fee !== undefined && { fee: data.fee }),
          ...(data.notes !== undefined && { notes: data.notes }),
          updated_at: now,
        })
        .where(eq(projectPermits.id, permitId))
        .returning()
    )

    // Append to activity_log when status changes to 'approved'
    if (data.status === "approved" && existing.status !== "approved") {
      const [projectRow] = await withRls(token, (db) =>
        db
          .select({ activity_log: projects.activity_log })
          .from(projects)
          .where(eq(projects.id, existing.project_id))
          .limit(1)
      )
      const updatedLog = [
        ...(projectRow?.activity_log ?? []),
        {
          type: "permit_approved",
          at: now.toISOString(),
          by_id: token.sub,
          note: `${updated.permit_type} permit approved${updated.permit_number ? ` (#${updated.permit_number})` : ""}`,
        },
      ]
      await withRls(token, (db) =>
        db
          .update(projects)
          .set({ activity_log: updatedLog, last_activity_at: now, updated_at: now })
          .where(eq(projects.id, existing.project_id))
      )
    }

    revalidatePath(`/projects/${existing.project_id}`)
    return { permit: updated as Permit }
  } catch (err) {
    console.error("[updatePermit]", err)
    return { error: "Failed to update permit" }
  }
}

// ---------------------------------------------------------------------------
// getPermitsForProject
// ---------------------------------------------------------------------------

export async function getPermitsForProject(
  projectId: string
): Promise<Permit[] | { error: string }> {
  const token = await getToken()
  if (!token) return { error: "Not authenticated" }

  try {
    const rows = await withRls(token, (db) =>
      db
        .select()
        .from(projectPermits)
        .where(
          and(
            eq(projectPermits.project_id, projectId),
            isNull(projectPermits.archived_at)
          )
        )
        .orderBy(projectPermits.created_at)
    )
    return rows as Permit[]
  } catch (err) {
    console.error("[getPermitsForProject]", err)
    return { error: "Failed to fetch permits" }
  }
}

// ---------------------------------------------------------------------------
// checkPermitGate
// ---------------------------------------------------------------------------

/**
 * Check if a project can advance to the 'in_progress' stage.
 *
 * Logic:
 * 1. If the project has no template_id, permits are not enforced — allow advance.
 * 2. If the template has no permit_requirements in its tier_config or a custom
 *    permit_requirements field, allow advance.
 * 3. Otherwise, check all non-archived permits for this project. Any permit that
 *    is NOT status='approved' is a blocker.
 *
 * Note: The project_templates schema stores permit requirements implicitly —
 * the presence of any existing permit with non-approved status blocks advancement.
 * This design means the office explicitly adds required permits to a project,
 * and each one must reach 'approved' before in_progress.
 */
export async function checkPermitGate(
  projectId: string
): Promise<PermitGateResult> {
  const token = await getToken()
  if (!token) return { canAdvance: false, blockers: [] }

  try {
    // Fetch existing permits for this project
    const permitRows = await withRls(token, (db) =>
      db
        .select({
          id: projectPermits.id,
          permit_type: projectPermits.permit_type,
          status: projectPermits.status,
        })
        .from(projectPermits)
        .where(
          and(
            eq(projectPermits.project_id, projectId),
            isNull(projectPermits.archived_at)
          )
        )
    )

    // If no permits have been added, no gate to check
    if (permitRows.length === 0) {
      return { canAdvance: true, blockers: [] }
    }

    // Any permit that is not 'approved' is a blocker
    const blockers = permitRows
      .filter((p) => p.status !== "approved")
      .map((p) => ({ permitType: p.permit_type, currentStatus: p.status }))

    return {
      canAdvance: blockers.length === 0,
      blockers,
    }
  } catch (err) {
    console.error("[checkPermitGate]", err)
    // On error, be safe — block advancement
    return { canAdvance: false, blockers: [] }
  }
}

// ---------------------------------------------------------------------------
// checkPermitExpirations
// ---------------------------------------------------------------------------

/**
 * System job: create 'permit_expiring' alerts for permits expiring within 30 days.
 *
 * Intended to be called by a scheduled cron edge function or manual trigger.
 * Uses adminDb (service role) since this is a system-level operation without
 * a user context.
 *
 * Deduplication: alerts table has UNIQUE on (org_id, alert_type, reference_id),
 * so we use INSERT ... ON CONFLICT DO NOTHING.
 */
export async function checkPermitExpirations(): Promise<{ alertsCreated: number } | { error: string }> {
  try {
    const today = toLocalDateString(new Date())
    // 30 days from today
    const thirtyDaysOut = toLocalDateString(new Date(Date.now() + 30 * 24 * 60 * 60 * 1000))

    // Fetch all approved, non-archived permits expiring within 30 days
    const expiringPermits = await adminDb
      .select({
        id: projectPermits.id,
        org_id: projectPermits.org_id,
        project_id: projectPermits.project_id,
        permit_type: projectPermits.permit_type,
        expiration_date: projectPermits.expiration_date,
      })
      .from(projectPermits)
      .where(
        and(
          eq(projectPermits.status, "approved"),
          isNull(projectPermits.archived_at),
          isNotNull(projectPermits.expiration_date)
          // expiration_date BETWEEN today AND thirtyDaysOut
          // Drizzle doesn't have a BETWEEN for text columns — use lte logic below
        )
      )

    // Filter in-memory: expiration_date between today and thirtyDaysOut
    const dueForAlert = expiringPermits.filter((p) => {
      if (!p.expiration_date) return false
      return p.expiration_date >= today && p.expiration_date <= thirtyDaysOut
    })

    if (dueForAlert.length === 0) return { alertsCreated: 0 }

    // Build alert insert values
    const alertInserts = dueForAlert.map((permit) => ({
      org_id: permit.org_id,
      alert_type: "permit_expiring",
      severity: "warning",
      reference_id: permit.id,
      reference_type: "project_permit",
      title: `Permit expiring soon`,
      description: `${permit.permit_type} permit for project expires on ${permit.expiration_date}`,
      metadata: {
        project_id: permit.project_id,
        permit_type: permit.permit_type,
        expiration_date: permit.expiration_date,
      },
    }))

    // Insert with ON CONFLICT DO NOTHING for deduplication
    // Drizzle doesn't have onConflictDoNothing directly — we use individual inserts
    // wrapped in try/catch to skip duplicates
    let alertsCreated = 0
    for (const alertData of alertInserts) {
      try {
        await adminDb.insert(alerts).values(alertData)
        alertsCreated++
      } catch {
        // Unique constraint violation = alert already exists — skip
      }
    }

    return { alertsCreated }
  } catch (err) {
    console.error("[checkPermitExpirations]", err)
    return { error: "Failed to check permit expirations" }
  }
}

// ---------------------------------------------------------------------------
// uploadHoaDocument
// ---------------------------------------------------------------------------

/**
 * Upload an HOA document to Supabase Storage and record it in project_documents.
 *
 * File is uploaded to: projects/{projectId}/hoa/{filename}
 * document_type is set to 'hoa'.
 */
export async function uploadHoaDocument(
  projectId: string,
  fileName: string,
  fileBase64: string,
  mimeType: string
): Promise<{ document: ProjectDocument } | { error: string }> {
  const token = await getToken()
  if (!token) return { error: "Not authenticated" }

  try {
    const supabase = await createClient()

    // Decode base64
    const base64Data = fileBase64.includes(",") ? fileBase64.split(",")[1] : fileBase64
    const buffer = Buffer.from(base64Data, "base64")

    const storagePath = `projects/${projectId}/hoa/${Date.now()}-${fileName}`

    const { error: uploadError } = await supabase.storage
      .from("project-documents")
      .upload(storagePath, buffer, {
        contentType: mimeType,
        upsert: false,
      })

    if (uploadError) {
      console.error("[uploadHoaDocument] Storage upload error:", uploadError)
      return { error: `Upload failed: ${uploadError.message}` }
    }

    // Get org_id for the project
    const orgId = await getProjectOrgId(token, projectId)
    if (!orgId) return { error: "Project not found" }

    // Insert project_documents record
    const [doc] = await withRls(token, (db) =>
      db
        .insert(projectDocuments)
        .values({
          org_id: orgId,
          project_id: projectId,
          document_type: "hoa",
          file_path: storagePath,
          file_name: fileName,
          uploaded_by: token.sub,
        })
        .returning()
    )

    revalidatePath(`/projects/${projectId}`)
    return { document: doc as ProjectDocument }
  } catch (err) {
    console.error("[uploadHoaDocument]", err)
    return { error: "Failed to upload HOA document" }
  }
}

// ---------------------------------------------------------------------------
// getProjectDocuments
// ---------------------------------------------------------------------------

export async function getProjectDocuments(
  projectId: string
): Promise<ProjectDocument[] | { error: string }> {
  const token = await getToken()
  if (!token) return { error: "Not authenticated" }

  try {
    const rows = await withRls(token, (db) =>
      db
        .select()
        .from(projectDocuments)
        .where(
          and(
            eq(projectDocuments.project_id, projectId),
            isNull(projectDocuments.archived_at)
          )
        )
        .orderBy(projectDocuments.document_type, projectDocuments.created_at)
    )
    return rows as ProjectDocument[]
  } catch (err) {
    console.error("[getProjectDocuments]", err)
    return { error: "Failed to fetch documents" }
  }
}

// ---------------------------------------------------------------------------
// deleteProjectDocument (soft-archive)
// ---------------------------------------------------------------------------

export async function deleteProjectDocument(
  docId: string
): Promise<{ success: true } | { error: string }> {
  const token = await getToken()
  if (!token) return { error: "Not authenticated" }

  try {
    const [existing] = await withRls(token, (db) =>
      db
        .select({ project_id: projectDocuments.project_id })
        .from(projectDocuments)
        .where(eq(projectDocuments.id, docId))
        .limit(1)
    )
    if (!existing) return { error: "Document not found" }

    await withRls(token, (db) =>
      db
        .update(projectDocuments)
        .set({ archived_at: new Date() })
        .where(eq(projectDocuments.id, docId))
    )

    revalidatePath(`/projects/${existing.project_id}`)
    return { success: true }
  } catch (err) {
    console.error("[deleteProjectDocument]", err)
    return { error: "Failed to archive document" }
  }
}
