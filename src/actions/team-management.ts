"use server"

/**
 * team-management.ts — Server actions for PTO, employee availability, and certification tracking.
 *
 * Phase 11: Team Management — Plan 05
 *
 * Exports (PTO):
 *   - getPtoBalances: Owner sees all techs' balances; tech sees own
 *   - updatePtoBalance: Owner only — upserts a pto_balances row
 *   - requestPto: Tech submits PTO request → creates alert for owner
 *   - approvePto: Owner approves/denies → deducts balance, notifies tech
 *   - getPtoRequests: Owner gets all, tech gets own — filterable by status
 *
 * Exports (Availability):
 *   - getAvailability: Returns availability windows + blocked dates for a tech
 *   - updateAvailability: Owner only — replaces all availability windows (delete + insert)
 *   - addBlockedDate: Owner only — adds a blocked date
 *   - removeBlockedDate: Owner only — removes a blocked date
 *
 * Exports (Documents):
 *   - getDocuments: Owner sees all, tech sees own (with profile names)
 *   - uploadDocument: Owner only — creates DB row + returns signed upload URL
 *   - deleteDocument: Owner only — deletes DB row + removes from Storage
 *   - checkExpiringDocuments: System function (adminDb) — finds docs expiring within 30 days
 */

import { revalidatePath } from "next/cache"
import { createClient } from "@/lib/supabase/server"
import { adminDb, withRls } from "@/lib/db"
import type { SupabaseToken } from "@/lib/db"
import {
  ptoBalances,
  ptoRequests,
  employeeAvailability,
  employeeBlockedDates,
  employeeDocuments,
  profiles,
  alerts,
  userNotifications,
} from "@/lib/db/schema"
import { and, eq, or, lte, gte, asc, desc, inArray } from "drizzle-orm"
import { sql } from "drizzle-orm"
import { toLocalDateString } from "@/lib/date-utils"

// ─── Auth helper ──────────────────────────────────────────────────────────────

async function getRlsToken(): Promise<SupabaseToken | null> {
  const supabase = await createClient()
  const { data: claimsData } = await supabase.auth.getClaims()
  if (!claimsData?.claims) return null
  return claimsData.claims as SupabaseToken
}

// ─── Types ────────────────────────────────────────────────────────────────────

export interface PtoBalance {
  id: string
  tech_id: string
  tech_name: string
  pto_type: string
  balance_hours: string
  accrual_rate_hours: string
  last_accrual_at: Date | null
}

export interface PtoRequest {
  id: string
  tech_id: string
  tech_name: string
  pto_type: string
  start_date: string
  end_date: string
  hours: string
  status: string
  notes: string | null
  reviewed_by: string | null
  reviewed_at: Date | null
  created_at: Date
}

export interface AvailabilityWindow {
  id: string
  day_of_week: number
  start_time: string
  end_time: string
}

export interface BlockedDate {
  id: string
  blocked_date: string
  reason: string | null
}

export interface EmployeeDocument {
  id: string
  tech_id: string
  tech_name: string
  doc_type: string
  doc_name: string
  file_url: string | null
  expires_at: string | null
  notes: string | null
  created_at: Date
}

// ─── PTO: Balances ────────────────────────────────────────────────────────────

/**
 * getPtoBalances — Owner sees all tech PTO balances; tech sees only own.
 *
 * @param techId Optional — if provided, returns only that tech's balances (owner use)
 */
export async function getPtoBalances(techId?: string): Promise<PtoBalance[]> {
  const token = await getRlsToken()
  if (!token) return []

  try {
    const rows = await withRls(token, (db) =>
      db
        .select({
          id: ptoBalances.id,
          tech_id: ptoBalances.tech_id,
          tech_name: profiles.full_name,
          pto_type: ptoBalances.pto_type,
          balance_hours: ptoBalances.balance_hours,
          accrual_rate_hours: ptoBalances.accrual_rate_hours,
          last_accrual_at: ptoBalances.last_accrual_at,
        })
        .from(ptoBalances)
        .leftJoin(profiles, eq(ptoBalances.tech_id, profiles.id))
        .where(techId ? eq(ptoBalances.tech_id, techId) : undefined)
        .orderBy(asc(profiles.full_name), asc(ptoBalances.pto_type))
    )

    return rows.map((r) => ({
      ...r,
      tech_name: r.tech_name ?? "Unknown",
      balance_hours: r.balance_hours ?? "0",
      accrual_rate_hours: r.accrual_rate_hours ?? "0",
    }))
  } catch (err) {
    console.error("[getPtoBalances] Error:", err)
    return []
  }
}

/**
 * updatePtoBalance — Owner only. Upserts a pto_balances row for a tech.
 */
export async function updatePtoBalance(
  techId: string,
  ptoType: string,
  balanceHours: number,
  accrualRateHours: number
): Promise<{ success: boolean; error?: string }> {
  const token = await getRlsToken()
  if (!token) return { success: false, error: "Not authenticated" }

  const userRole = token.user_role as string | undefined
  if (userRole !== "owner") return { success: false, error: "Owner access required" }

  const orgId = token.org_id as string | undefined
  if (!orgId) return { success: false, error: "No org context" }

  try {
    // Check if a balance row already exists for this tech + type
    const [existing] = await withRls(token, (db) =>
      db
        .select({ id: ptoBalances.id })
        .from(ptoBalances)
        .where(
          and(
            eq(ptoBalances.tech_id, techId),
            eq(ptoBalances.org_id, orgId),
            eq(ptoBalances.pto_type, ptoType)
          )
        )
        .limit(1)
    )

    if (existing) {
      // Update existing row
      await withRls(token, (db) =>
        db
          .update(ptoBalances)
          .set({
            balance_hours: String(balanceHours),
            accrual_rate_hours: String(accrualRateHours),
            updated_at: new Date(),
          })
          .where(eq(ptoBalances.id, existing.id))
      )
    } else {
      // Insert new row
      await withRls(token, (db) =>
        db.insert(ptoBalances).values({
          org_id: orgId,
          tech_id: techId,
          pto_type: ptoType,
          balance_hours: String(balanceHours),
          accrual_rate_hours: String(accrualRateHours),
        })
      )
    }

    revalidatePath("/team")
    return { success: true }
  } catch (err) {
    console.error("[updatePtoBalance] Error:", err)
    return { success: false, error: "Failed to update PTO balance" }
  }
}

// ─── PTO: Requests ────────────────────────────────────────────────────────────

/**
 * requestPto — Tech submits a PTO request.
 *
 * Creates a pto_request with status='pending'. Creates an alert for the owner
 * so they know to review it.
 */
export async function requestPto(input: {
  ptoType: string
  startDate: string
  endDate: string
  hours: number
  notes?: string
}): Promise<{ success: boolean; error?: string }> {
  const token = await getRlsToken()
  if (!token) return { success: false, error: "Not authenticated" }

  const orgId = token.org_id as string | undefined
  const userId = token.sub as string | undefined
  if (!orgId || !userId) return { success: false, error: "No org/user context" }

  try {
    // Insert the PTO request
    const [newRequest] = await withRls(token, (db) =>
      db
        .insert(ptoRequests)
        .values({
          org_id: orgId,
          tech_id: userId,
          pto_type: input.ptoType,
          start_date: input.startDate,
          end_date: input.endDate,
          hours: String(input.hours),
          status: "pending",
          notes: input.notes ?? null,
        })
        .returning({ id: ptoRequests.id })
    )

    // Fetch tech name for the alert title
    const [techProfile] = await withRls(token, (db) =>
      db
        .select({ full_name: profiles.full_name })
        .from(profiles)
        .where(eq(profiles.id, userId))
        .limit(1)
    )
    const techName = techProfile?.full_name ?? "A team member"

    // Create owner alert (using adminDb — alert INSERT is owner+office only in RLS)
    await adminDb.insert(alerts).values({
      org_id: orgId,
      alert_type: "system_event",
      severity: "info",
      reference_id: newRequest.id,
      reference_type: "pto_request",
      title: `PTO Request from ${techName}`,
      description: `${input.ptoType} leave — ${input.startDate} to ${input.endDate} (${input.hours} hrs)`,
      metadata: {
        techId: userId,
        techName,
        ptoType: input.ptoType,
        startDate: input.startDate,
        endDate: input.endDate,
        hours: input.hours,
      },
    }).onConflictDoNothing()

    revalidatePath("/team")
    return { success: true }
  } catch (err) {
    console.error("[requestPto] Error:", err)
    return { success: false, error: "Failed to submit PTO request" }
  }
}

/**
 * approvePto — Owner approves or denies a PTO request.
 *
 * - Sets status to 'approved' or 'denied'
 * - Records reviewed_by and reviewed_at
 * - If approved, deducts hours from pto_balances
 * - Creates in-app notification for the tech
 */
export async function approvePto(
  requestId: string,
  approved: boolean
): Promise<{ success: boolean; error?: string }> {
  const token = await getRlsToken()
  if (!token) return { success: false, error: "Not authenticated" }

  const userRole = token.user_role as string | undefined
  if (userRole !== "owner") return { success: false, error: "Owner access required" }

  const orgId = token.org_id as string | undefined
  const reviewerId = token.sub as string | undefined
  if (!orgId || !reviewerId) return { success: false, error: "No org/user context" }

  try {
    const newStatus = approved ? "approved" : "denied"

    // Fetch the request first to get tech_id, hours, pto_type
    const [request] = await withRls(token, (db) =>
      db
        .select({
          id: ptoRequests.id,
          tech_id: ptoRequests.tech_id,
          pto_type: ptoRequests.pto_type,
          hours: ptoRequests.hours,
          start_date: ptoRequests.start_date,
          end_date: ptoRequests.end_date,
          status: ptoRequests.status,
        })
        .from(ptoRequests)
        .where(and(eq(ptoRequests.id, requestId), eq(ptoRequests.org_id, orgId)))
        .limit(1)
    )

    if (!request) return { success: false, error: "PTO request not found" }
    if (request.status !== "pending") {
      return { success: false, error: "Request has already been reviewed" }
    }

    // Update the request status
    await withRls(token, (db) =>
      db
        .update(ptoRequests)
        .set({
          status: newStatus,
          reviewed_by: reviewerId,
          reviewed_at: new Date(),
          updated_at: new Date(),
        })
        .where(eq(ptoRequests.id, requestId))
    )

    // If approved — deduct hours from balance
    if (approved) {
      const hoursToDeduct = parseFloat(request.hours ?? "0")
      await withRls(token, (db) =>
        db
          .update(ptoBalances)
          .set({
            balance_hours: sql`GREATEST(0, ${ptoBalances.balance_hours}::numeric - ${hoursToDeduct})`,
            updated_at: new Date(),
          })
          .where(
            and(
              eq(ptoBalances.tech_id, request.tech_id),
              eq(ptoBalances.org_id, orgId),
              eq(ptoBalances.pto_type, request.pto_type)
            )
          )
      )
    }

    // Create in-app notification for the tech (adminDb — tech can't insert notifications)
    const statusLabel = approved ? "approved" : "denied"
    await adminDb.insert(userNotifications).values({
      org_id: orgId,
      recipient_id: request.tech_id,
      notification_type: "system_event",
      urgency: "informational",
      title: `PTO Request ${statusLabel.charAt(0).toUpperCase() + statusLabel.slice(1)}`,
      body: `Your ${request.pto_type} leave request (${request.start_date} to ${request.end_date}) has been ${statusLabel}.`,
      link: "/team",
    })

    revalidatePath("/team")
    return { success: true }
  } catch (err) {
    console.error("[approvePto] Error:", err)
    return { success: false, error: "Failed to review PTO request" }
  }
}

/**
 * getPtoRequests — Returns PTO requests.
 *
 * Owner gets all requests in the org. Tech gets only own requests.
 * Optionally filterable by status ('pending' | 'approved' | 'denied').
 */
export async function getPtoRequests(status?: string): Promise<PtoRequest[]> {
  const token = await getRlsToken()
  if (!token) return []

  try {
    const rows = await withRls(token, (db) => {
      const query = db
        .select({
          id: ptoRequests.id,
          tech_id: ptoRequests.tech_id,
          tech_name: profiles.full_name,
          pto_type: ptoRequests.pto_type,
          start_date: ptoRequests.start_date,
          end_date: ptoRequests.end_date,
          hours: ptoRequests.hours,
          status: ptoRequests.status,
          notes: ptoRequests.notes,
          reviewed_by: ptoRequests.reviewed_by,
          reviewed_at: ptoRequests.reviewed_at,
          created_at: ptoRequests.created_at,
        })
        .from(ptoRequests)
        .leftJoin(profiles, eq(ptoRequests.tech_id, profiles.id))
        .orderBy(desc(ptoRequests.created_at))

      if (status) {
        return query.where(eq(ptoRequests.status, status))
      }
      return query
    })

    return rows.map((r) => ({
      ...r,
      tech_name: r.tech_name ?? "Unknown",
      hours: r.hours ?? "0",
    }))
  } catch (err) {
    console.error("[getPtoRequests] Error:", err)
    return []
  }
}

// ─── Availability ─────────────────────────────────────────────────────────────

/**
 * getAvailability — Returns availability windows and blocked dates for a tech.
 */
export async function getAvailability(techId: string): Promise<{
  windows: AvailabilityWindow[]
  blockedDates: BlockedDate[]
}> {
  const token = await getRlsToken()
  if (!token) return { windows: [], blockedDates: [] }

  try {
    const [windowRows, blockedRows] = await Promise.all([
      withRls(token, (db) =>
        db
          .select({
            id: employeeAvailability.id,
            day_of_week: employeeAvailability.day_of_week,
            start_time: employeeAvailability.start_time,
            end_time: employeeAvailability.end_time,
          })
          .from(employeeAvailability)
          .where(eq(employeeAvailability.tech_id, techId))
          .orderBy(asc(employeeAvailability.day_of_week))
      ),
      withRls(token, (db) =>
        db
          .select({
            id: employeeBlockedDates.id,
            blocked_date: employeeBlockedDates.blocked_date,
            reason: employeeBlockedDates.reason,
          })
          .from(employeeBlockedDates)
          .where(eq(employeeBlockedDates.tech_id, techId))
          .orderBy(asc(employeeBlockedDates.blocked_date))
      ),
    ])

    return {
      windows: windowRows,
      blockedDates: blockedRows,
    }
  } catch (err) {
    console.error("[getAvailability] Error:", err)
    return { windows: [], blockedDates: [] }
  }
}

/**
 * updateAvailability — Owner only. Replaces all availability windows for a tech.
 *
 * Uses delete + insert pattern so the owner can re-set all days at once.
 * Passing an empty array clears all availability windows.
 */
export async function updateAvailability(
  techId: string,
  windows: { dayOfWeek: number; startTime: string; endTime: string }[]
): Promise<{ success: boolean; error?: string }> {
  const token = await getRlsToken()
  if (!token) return { success: false, error: "Not authenticated" }

  const userRole = token.user_role as string | undefined
  if (userRole !== "owner") return { success: false, error: "Owner access required" }

  const orgId = token.org_id as string | undefined
  if (!orgId) return { success: false, error: "No org context" }

  try {
    // Delete all existing windows for this tech
    await withRls(token, (db) =>
      db
        .delete(employeeAvailability)
        .where(
          and(
            eq(employeeAvailability.tech_id, techId),
            eq(employeeAvailability.org_id, orgId)
          )
        )
    )

    // Insert new windows (if any)
    if (windows.length > 0) {
      await withRls(token, (db) =>
        db.insert(employeeAvailability).values(
          windows.map((w) => ({
            org_id: orgId,
            tech_id: techId,
            day_of_week: w.dayOfWeek,
            start_time: w.startTime,
            end_time: w.endTime,
          }))
        )
      )
    }

    revalidatePath("/team")
    return { success: true }
  } catch (err) {
    console.error("[updateAvailability] Error:", err)
    return { success: false, error: "Failed to update availability" }
  }
}

/**
 * addBlockedDate — Owner only. Adds a blocked date for a tech.
 */
export async function addBlockedDate(
  techId: string,
  date: string,
  reason: string
): Promise<{ success: boolean; error?: string }> {
  const token = await getRlsToken()
  if (!token) return { success: false, error: "Not authenticated" }

  const userRole = token.user_role as string | undefined
  if (userRole !== "owner") return { success: false, error: "Owner access required" }

  const orgId = token.org_id as string | undefined
  if (!orgId) return { success: false, error: "No org context" }

  try {
    await withRls(token, (db) =>
      db.insert(employeeBlockedDates).values({
        org_id: orgId,
        tech_id: techId,
        blocked_date: date,
        reason: reason || null,
      })
    )

    revalidatePath("/team")
    return { success: true }
  } catch (err) {
    console.error("[addBlockedDate] Error:", err)
    return { success: false, error: "Failed to add blocked date" }
  }
}

/**
 * removeBlockedDate — Owner only. Removes a blocked date.
 */
export async function removeBlockedDate(
  id: string
): Promise<{ success: boolean; error?: string }> {
  const token = await getRlsToken()
  if (!token) return { success: false, error: "Not authenticated" }

  const userRole = token.user_role as string | undefined
  if (userRole !== "owner") return { success: false, error: "Owner access required" }

  try {
    await withRls(token, (db) =>
      db.delete(employeeBlockedDates).where(eq(employeeBlockedDates.id, id))
    )

    revalidatePath("/team")
    return { success: true }
  } catch (err) {
    console.error("[removeBlockedDate] Error:", err)
    return { success: false, error: "Failed to remove blocked date" }
  }
}

// ─── Documents ────────────────────────────────────────────────────────────────

/**
 * getDocuments — Owner sees all org documents; tech sees own.
 *
 * @param techId Optional — if provided, filters to a specific tech (owner use)
 */
export async function getDocuments(techId?: string): Promise<EmployeeDocument[]> {
  const token = await getRlsToken()
  if (!token) return []

  try {
    const rows = await withRls(token, (db) =>
      db
        .select({
          id: employeeDocuments.id,
          tech_id: employeeDocuments.tech_id,
          tech_name: profiles.full_name,
          doc_type: employeeDocuments.doc_type,
          doc_name: employeeDocuments.doc_name,
          file_url: employeeDocuments.file_url,
          expires_at: employeeDocuments.expires_at,
          notes: employeeDocuments.notes,
          created_at: employeeDocuments.created_at,
        })
        .from(employeeDocuments)
        .leftJoin(profiles, eq(employeeDocuments.tech_id, profiles.id))
        .where(techId ? eq(employeeDocuments.tech_id, techId) : undefined)
        .orderBy(asc(profiles.full_name), asc(employeeDocuments.expires_at))
    )

    return rows.map((r) => ({
      ...r,
      tech_name: r.tech_name ?? "Unknown",
    }))
  } catch (err) {
    console.error("[getDocuments] Error:", err)
    return []
  }
}

export interface UploadDocumentResult {
  success: boolean
  documentId?: string
  signedUploadUrl?: string
  storagePath?: string
  error?: string
}

/**
 * uploadDocument — Owner only. Creates employee_documents row + returns signed upload URL.
 *
 * Caller uploads the file directly to Supabase Storage using the signed URL,
 * then calls confirmDocumentUpload to set file_url on the DB row.
 *
 * Storage bucket: employee-documents
 * Storage path: {orgId}/{techId}/{docName}-{timestamp}.{ext}
 */
export async function uploadDocument(input: {
  techId: string
  docType: string
  docName: string
  expiresAt?: string
  notes?: string
  fileName: string
}): Promise<UploadDocumentResult> {
  const token = await getRlsToken()
  if (!token) return { success: false, error: "Not authenticated" }

  const userRole = token.user_role as string | undefined
  if (userRole !== "owner") return { success: false, error: "Owner access required" }

  const orgId = token.org_id as string | undefined
  if (!orgId) return { success: false, error: "No org context" }

  try {
    const supabase = await createClient()

    // Build storage path
    const timestamp = Date.now()
    const safeName = input.fileName.replace(/[^a-zA-Z0-9._-]/g, "_")
    const storagePath = `${orgId}/${input.techId}/${timestamp}-${safeName}`

    // Create signed upload URL
    const { data: uploadData, error: uploadError } = await supabase.storage
      .from("employee-documents")
      .createSignedUploadUrl(storagePath)

    if (uploadError) {
      console.error("[uploadDocument] Storage error:", uploadError)
      return { success: false, error: "Failed to create upload URL" }
    }

    // Create DB row with the storage path (file_url set immediately to path)
    const [newDoc] = await withRls(token, (db) =>
      db
        .insert(employeeDocuments)
        .values({
          org_id: orgId,
          tech_id: input.techId,
          doc_type: input.docType,
          doc_name: input.docName,
          file_url: storagePath,
          expires_at: input.expiresAt ?? null,
          notes: input.notes ?? null,
        })
        .returning({ id: employeeDocuments.id })
    )

    revalidatePath("/team")

    return {
      success: true,
      documentId: newDoc.id,
      signedUploadUrl: uploadData.signedUrl,
      storagePath,
    }
  } catch (err) {
    console.error("[uploadDocument] Error:", err)
    return { success: false, error: "Failed to upload document" }
  }
}

/**
 * deleteDocument — Owner only. Deletes the DB row and removes the file from Storage.
 */
export async function deleteDocument(
  docId: string
): Promise<{ success: boolean; error?: string }> {
  const token = await getRlsToken()
  if (!token) return { success: false, error: "Not authenticated" }

  const userRole = token.user_role as string | undefined
  if (userRole !== "owner") return { success: false, error: "Owner access required" }

  try {
    // Fetch the doc first to get file_url
    const [doc] = await withRls(token, (db) =>
      db
        .select({ id: employeeDocuments.id, file_url: employeeDocuments.file_url })
        .from(employeeDocuments)
        .where(eq(employeeDocuments.id, docId))
        .limit(1)
    )

    if (!doc) return { success: false, error: "Document not found" }

    // Delete from DB
    await withRls(token, (db) =>
      db.delete(employeeDocuments).where(eq(employeeDocuments.id, docId))
    )

    // Delete from Storage (best-effort — don't fail if file not found)
    if (doc.file_url) {
      const supabase = await createClient()
      await supabase.storage.from("employee-documents").remove([doc.file_url])
    }

    revalidatePath("/team")
    return { success: true }
  } catch (err) {
    console.error("[deleteDocument] Error:", err)
    return { success: false, error: "Failed to delete document" }
  }
}

/**
 * checkExpiringDocuments — System function (adminDb).
 *
 * Finds all documents expiring within 30 days and creates owner alerts.
 * Intended to be called from a cron edge function (e.g. daily at 8am).
 * Uses adminDb — bypasses RLS for org-wide scan.
 *
 * @param orgId Organization to check. If omitted, checks all orgs.
 */
export async function checkExpiringDocuments(orgId?: string): Promise<void> {
  try {
    const today = new Date()
    const thirtyDaysOut = new Date()
    thirtyDaysOut.setDate(thirtyDaysOut.getDate() + 30)

    const todayStr = toLocalDateString(today)
    const thirtyDaysStr = toLocalDateString(thirtyDaysOut)

    // Build conditions — org filter is optional
    const conditions = orgId
      ? and(
          eq(employeeDocuments.org_id, orgId),
          sql`${employeeDocuments.expires_at} IS NOT NULL`,
          gte(employeeDocuments.expires_at, todayStr),
          lte(employeeDocuments.expires_at, thirtyDaysStr)
        )
      : and(
          sql`${employeeDocuments.expires_at} IS NOT NULL`,
          gte(employeeDocuments.expires_at, todayStr),
          lte(employeeDocuments.expires_at, thirtyDaysStr)
        )

    const expiringDocs = await adminDb
      .select({
        id: employeeDocuments.id,
        org_id: employeeDocuments.org_id,
        tech_id: employeeDocuments.tech_id,
        doc_type: employeeDocuments.doc_type,
        doc_name: employeeDocuments.doc_name,
        expires_at: employeeDocuments.expires_at,
        tech_name: profiles.full_name,
      })
      .from(employeeDocuments)
      .leftJoin(profiles, eq(employeeDocuments.tech_id, profiles.id))
      .where(conditions)

    if (expiringDocs.length === 0) return

    const alertValues = expiringDocs.map((doc) => {
      const daysUntilExpiry = Math.ceil(
        (new Date(doc.expires_at!).getTime() - today.getTime()) / (1000 * 60 * 60 * 24)
      )

      return {
        org_id: doc.org_id,
        alert_type: "system_event",
        severity: daysUntilExpiry <= 7 ? "critical" : "warning",
        reference_id: doc.id,
        reference_type: "employee_document",
        title: `${doc.tech_name ?? "Employee"}'s ${_formatDocType(doc.doc_type)} expires in ${daysUntilExpiry} day${daysUntilExpiry === 1 ? "" : "s"}`,
        description: `${doc.doc_name} expires on ${doc.expires_at}`,
        metadata: {
          techId: doc.tech_id,
          techName: doc.tech_name,
          docType: doc.doc_type,
          docName: doc.doc_name,
          expiresAt: doc.expires_at,
          daysUntilExpiry,
        },
      }
    })

    await adminDb
      .insert(alerts)
      .values(alertValues)
      .onConflictDoNothing()
  } catch (err) {
    console.error("[checkExpiringDocuments] Error:", err)
  }
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function _formatDocType(docType: string): string {
  switch (docType) {
    case "cpo":
      return "CPO Certification"
    case "drivers_license":
      return "Driver's License"
    case "insurance":
      return "Insurance Card"
    case "other":
      return "Document"
    default:
      return docType
  }
}
