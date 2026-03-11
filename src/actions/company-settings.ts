"use server"

import { revalidatePath } from "next/cache"
import { createClient } from "@/lib/supabase/server"
import { withRls, adminDb } from "@/lib/db"
import type { SupabaseToken } from "@/lib/db"
import { orgSettings, orgs, checklistTasks, checklistTemplates } from "@/lib/db/schema"
import { eq, and, isNull, asc } from "drizzle-orm"

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface OrgSettings {
  id: string
  org_id: string
  pre_arrival_sms_enabled: boolean
  pre_arrival_email_enabled: boolean
  service_report_email_enabled: boolean
  alert_missed_stop_enabled: boolean
  alert_declining_chemistry_enabled: boolean
  alert_incomplete_data_enabled: boolean
  required_chemistry_by_sanitizer: Record<string, string[]> | null
  required_checklist_task_ids: string[] | null
  // Service report content toggles
  report_include_chemistry: boolean
  report_include_checklist: boolean
  report_include_photos: boolean
  report_include_tech_name: boolean
  // Custom chemistry target ranges per sanitizer
  custom_chemistry_targets: Record<string, Record<string, { min: number; max: number }>> | null
  // Home base / office address for route optimization
  home_base_address: string | null
  home_base_lat: number | null
  home_base_lng: number | null
  // Phase 6: Work Orders & Quoting settings
  default_hourly_rate: string | null
  default_parts_markup_pct: string | null
  default_tax_rate: string | null
  default_quote_expiry_days: number | null
  invoice_number_prefix: string | null
  quote_number_prefix: string | null
  quote_terms_and_conditions: string | null
  wo_notify_office_on_flag: boolean
  wo_notify_customer_on_scheduled: boolean
  wo_notify_customer_on_complete: boolean
  created_at: Date
  updated_at: Date
}

export interface ChecklistTaskRow {
  id: string
  label: string
  is_required: boolean
  requires_photo: boolean
  sort_order: number
}

/** Default org settings returned when no row exists yet */
const DEFAULT_SETTINGS: Omit<OrgSettings, "id" | "org_id" | "created_at" | "updated_at"> = {
  pre_arrival_sms_enabled: true,
  pre_arrival_email_enabled: true,
  service_report_email_enabled: true,
  alert_missed_stop_enabled: true,
  alert_declining_chemistry_enabled: true,
  alert_incomplete_data_enabled: true,
  required_chemistry_by_sanitizer: null,
  required_checklist_task_ids: null,
  report_include_chemistry: true,
  report_include_checklist: true,
  report_include_photos: true,
  report_include_tech_name: true,
  custom_chemistry_targets: null,
  home_base_address: null,
  home_base_lat: null,
  home_base_lng: null,
  // Phase 6 defaults
  default_hourly_rate: null,
  default_parts_markup_pct: "30",
  default_tax_rate: "0.0875",
  default_quote_expiry_days: 30,
  invoice_number_prefix: "INV",
  quote_number_prefix: "Q",
  quote_terms_and_conditions: null,
  wo_notify_office_on_flag: true,
  wo_notify_customer_on_scheduled: true,
  wo_notify_customer_on_complete: true,
}

// ---------------------------------------------------------------------------
// Auth helper
// ---------------------------------------------------------------------------

async function getRlsToken(): Promise<SupabaseToken | null> {
  const supabase = await createClient()
  const { data: claimsData } = await supabase.auth.getClaims()
  if (!claimsData?.claims) return null
  return claimsData.claims as SupabaseToken
}

// ---------------------------------------------------------------------------
// getOrgSettings
// ---------------------------------------------------------------------------

export async function getOrgSettings(): Promise<OrgSettings | null> {
  const token = await getRlsToken()
  if (!token) return null

  const orgId = token.org_id as string
  if (!orgId) return null

  try {
    const rows = await withRls(token, (db) =>
      db
        .select()
        .from(orgSettings)
        .where(eq(orgSettings.org_id, orgId))
        .limit(1)
    )

    if (rows.length > 0) {
      return rows[0] as OrgSettings
    }

    // No row yet — return defaults with sentinel IDs
    const now = new Date()
    return {
      id: "",
      org_id: orgId,
      ...DEFAULT_SETTINGS,
      created_at: now,
      updated_at: now,
    }
  } catch (err) {
    console.error("[getOrgSettings] Error:", err)
    return null
  }
}

// ---------------------------------------------------------------------------
// updateOrgSettings
// ---------------------------------------------------------------------------

export async function updateOrgSettings(
  data: Partial<Omit<OrgSettings, "id" | "org_id" | "created_at" | "updated_at">>
): Promise<{ success: boolean; error?: string }> {
  const token = await getRlsToken()
  if (!token) return { success: false, error: "Not authenticated" }

  const userRole = token.user_role as string | undefined
  if (userRole !== "owner") {
    return { success: false, error: "Only owners can update company settings" }
  }

  const orgId = token.org_id as string
  if (!orgId) return { success: false, error: "No org found" }

  try {
    const now = new Date()

    await withRls(token, (db) =>
      db
        .insert(orgSettings)
        .values({
          org_id: orgId,
          ...data,
          updated_at: now,
        })
        .onConflictDoUpdate({
          target: orgSettings.org_id,
          set: {
            ...data,
            updated_at: now,
          },
        })
    )

    revalidatePath("/settings")

    return { success: true }
  } catch (err) {
    console.error("[updateOrgSettings] Error:", err)
    return {
      success: false,
      error: err instanceof Error ? err.message : "Failed to save settings",
    }
  }
}

// ---------------------------------------------------------------------------
// ensureOrgSettings
// ---------------------------------------------------------------------------

export async function ensureOrgSettings(orgId: string): Promise<void> {
  if (!orgId) return

  try {
    const existing = await adminDb
      .select({ id: orgSettings.id })
      .from(orgSettings)
      .where(eq(orgSettings.org_id, orgId))
      .limit(1)

    if (existing.length > 0) return

    await adminDb
      .insert(orgSettings)
      .values({
        org_id: orgId,
        ...DEFAULT_SETTINGS,
      })
      .onConflictDoNothing()
  } catch (err) {
    console.error("[ensureOrgSettings] Error:", err)
  }
}

// ---------------------------------------------------------------------------
// updateOrgName
// ---------------------------------------------------------------------------

export async function updateOrgName(
  name: string
): Promise<{ success: boolean; error?: string }> {
  const token = await getRlsToken()
  if (!token) return { success: false, error: "Not authenticated" }

  const userRole = token.user_role as string | undefined
  if (userRole !== "owner") {
    return { success: false, error: "Only owners can update company name" }
  }

  const orgId = token.org_id as string
  if (!orgId) return { success: false, error: "No org found" }

  const trimmed = name.trim()
  if (!trimmed) return { success: false, error: "Company name cannot be empty" }

  try {
    await withRls(token, (db) =>
      db
        .update(orgs)
        .set({ name: trimmed, updated_at: new Date() })
        .where(eq(orgs.id, orgId))
    )

    revalidatePath("/settings")

    return { success: true }
  } catch (err) {
    console.error("[updateOrgName] Error:", err)
    return {
      success: false,
      error: err instanceof Error ? err.message : "Failed to update company name",
    }
  }
}

// ---------------------------------------------------------------------------
// updateOrgLogo
// ---------------------------------------------------------------------------

export async function updateOrgLogo(
  logoUrl: string | null
): Promise<{ success: boolean; error?: string }> {
  const token = await getRlsToken()
  if (!token) return { success: false, error: "Not authenticated" }

  const userRole = token.user_role as string | undefined
  if (userRole !== "owner") {
    return { success: false, error: "Only owners can update company logo" }
  }

  const orgId = token.org_id as string
  if (!orgId) return { success: false, error: "No org found" }

  try {
    await withRls(token, (db) =>
      db
        .update(orgs)
        .set({ logo_url: logoUrl, updated_at: new Date() })
        .where(eq(orgs.id, orgId))
    )

    revalidatePath("/settings")

    return { success: true }
  } catch (err) {
    console.error("[updateOrgLogo] Error:", err)
    return {
      success: false,
      error: err instanceof Error ? err.message : "Failed to update logo",
    }
  }
}

// ---------------------------------------------------------------------------
// getOrgBranding — name + logo in one query (used by sidebar)
// ---------------------------------------------------------------------------

export async function getOrgBranding(): Promise<{ name: string; logoUrl: string | null } | null> {
  const token = await getRlsToken()
  if (!token) return null

  const orgId = token.org_id as string
  if (!orgId) return null

  try {
    const rows = await withRls(token, (db) =>
      db
        .select({ name: orgs.name, logo_url: orgs.logo_url })
        .from(orgs)
        .where(eq(orgs.id, orgId))
        .limit(1)
    )
    if (!rows[0]) return null
    return { name: rows[0].name, logoUrl: rows[0].logo_url }
  } catch {
    return null
  }
}

// ---------------------------------------------------------------------------
// getOrgLogoUrl
// ---------------------------------------------------------------------------

export async function getOrgLogoUrl(): Promise<string | null> {
  const token = await getRlsToken()
  if (!token) return null

  const orgId = token.org_id as string
  if (!orgId) return null

  try {
    const rows = await withRls(token, (db) =>
      db
        .select({ logo_url: orgs.logo_url })
        .from(orgs)
        .where(eq(orgs.id, orgId))
        .limit(1)
    )
    return rows[0]?.logo_url ?? null
  } catch {
    return null
  }
}

// ---------------------------------------------------------------------------
// createLogoUploadUrl
// ---------------------------------------------------------------------------

export async function createLogoUploadUrl(
  fileName: string
): Promise<{ signedUrl: string; token: string; path: string } | { error: string }> {
  const rlsToken = await getRlsToken()
  if (!rlsToken) return { error: "Not authenticated" }

  const userRole = rlsToken.user_role as string | undefined
  if (userRole !== "owner") return { error: "Only owners can upload logos" }

  const orgId = rlsToken.org_id as string
  if (!orgId) return { error: "No org found" }

  const supabase = await createClient()
  const path = `${orgId}/logo/${fileName}`

  const { data, error } = await supabase.storage
    .from("company-assets")
    .createSignedUploadUrl(path, { upsert: true })

  if (error) {
    console.error("[createLogoUploadUrl] Error:", error)
    return { error: error.message }
  }

  return {
    signedUrl: data.signedUrl,
    token: data.token,
    path,
  }
}

// ---------------------------------------------------------------------------
// Checklist CRUD
// ---------------------------------------------------------------------------

/**
 * getChecklistTasks — Returns all org-level checklist tasks (template_id null, customer_id null).
 * These are the "universal" tasks that apply to all stops.
 */
export async function getChecklistTasks(): Promise<ChecklistTaskRow[]> {
  const token = await getRlsToken()
  if (!token) return []

  const orgId = token.org_id as string
  if (!orgId) return []

  try {
    const rows = await withRls(token, (db) =>
      db
        .select({
          id: checklistTasks.id,
          label: checklistTasks.label,
          is_required: checklistTasks.is_required,
          requires_photo: checklistTasks.requires_photo,
          sort_order: checklistTasks.sort_order,
        })
        .from(checklistTasks)
        .where(
          and(
            eq(checklistTasks.org_id, orgId),
            isNull(checklistTasks.template_id),
            isNull(checklistTasks.customer_id),
            eq(checklistTasks.is_deleted, false)
          )
        )
        .orderBy(asc(checklistTasks.sort_order))
    )
    return rows
  } catch (err) {
    console.error("[getChecklistTasks] Error:", err)
    return []
  }
}

/**
 * addChecklistTask — Adds a new org-level checklist task.
 */
export async function addChecklistTask(
  label: string,
  options?: { is_required?: boolean; requires_photo?: boolean }
): Promise<{ success: boolean; error?: string }> {
  const token = await getRlsToken()
  if (!token) return { success: false, error: "Not authenticated" }

  const userRole = token.user_role as string | undefined
  if (!userRole || !["owner", "office"].includes(userRole)) {
    return { success: false, error: "Only owners and office staff can manage checklist" }
  }

  const orgId = token.org_id as string
  if (!orgId) return { success: false, error: "No org found" }

  const trimmed = label.trim()
  if (!trimmed) return { success: false, error: "Task label cannot be empty" }

  try {
    // Get max sort_order for new task
    const existing = await withRls(token, (db) =>
      db
        .select({ sort_order: checklistTasks.sort_order })
        .from(checklistTasks)
        .where(
          and(
            eq(checklistTasks.org_id, orgId),
            isNull(checklistTasks.template_id),
            isNull(checklistTasks.customer_id)
          )
        )
        .orderBy(asc(checklistTasks.sort_order))
    )
    const nextOrder = existing.length > 0
      ? Math.max(...existing.map((r) => r.sort_order)) + 1
      : 0

    await withRls(token, (db) =>
      db.insert(checklistTasks).values({
        org_id: orgId,
        label: trimmed,
        is_required: options?.is_required ?? true,
        requires_photo: options?.requires_photo ?? false,
        sort_order: nextOrder,
      })
    )

    revalidatePath("/settings")
    return { success: true }
  } catch (err) {
    console.error("[addChecklistTask] Error:", err)
    return {
      success: false,
      error: err instanceof Error ? err.message : "Failed to add task",
    }
  }
}

/**
 * updateChecklistTask — Updates label, is_required, or requires_photo on a task.
 */
export async function updateChecklistTask(
  taskId: string,
  data: { label?: string; is_required?: boolean; requires_photo?: boolean }
): Promise<{ success: boolean; error?: string }> {
  const token = await getRlsToken()
  if (!token) return { success: false, error: "Not authenticated" }

  const userRole = token.user_role as string | undefined
  if (!userRole || !["owner", "office"].includes(userRole)) {
    return { success: false, error: "Only owners and office staff can manage checklist" }
  }

  try {
    const updateData: Record<string, unknown> = {}
    if (data.label !== undefined) {
      const trimmed = data.label.trim()
      if (!trimmed) return { success: false, error: "Task label cannot be empty" }
      updateData.label = trimmed
    }
    if (data.is_required !== undefined) updateData.is_required = data.is_required
    if (data.requires_photo !== undefined) updateData.requires_photo = data.requires_photo

    if (Object.keys(updateData).length === 0) return { success: true }

    await withRls(token, (db) =>
      db
        .update(checklistTasks)
        .set(updateData)
        .where(eq(checklistTasks.id, taskId))
    )

    revalidatePath("/settings")
    return { success: true }
  } catch (err) {
    console.error("[updateChecklistTask] Error:", err)
    return {
      success: false,
      error: err instanceof Error ? err.message : "Failed to update task",
    }
  }
}

/**
 * deleteChecklistTask — Hard deletes an org-level checklist task.
 */
export async function deleteChecklistTask(
  taskId: string
): Promise<{ success: boolean; error?: string }> {
  const token = await getRlsToken()
  if (!token) return { success: false, error: "Not authenticated" }

  const userRole = token.user_role as string | undefined
  if (!userRole || !["owner", "office"].includes(userRole)) {
    return { success: false, error: "Only owners and office staff can manage checklist" }
  }

  try {
    await withRls(token, (db) =>
      db
        .delete(checklistTasks)
        .where(eq(checklistTasks.id, taskId))
    )

    revalidatePath("/settings")
    return { success: true }
  } catch (err) {
    console.error("[deleteChecklistTask] Error:", err)
    return {
      success: false,
      error: err instanceof Error ? err.message : "Failed to delete task",
    }
  }
}

/**
 * reorderChecklistTasks — Reorders tasks by updating sort_order.
 */
export async function reorderChecklistTasks(
  taskIds: string[]
): Promise<{ success: boolean; error?: string }> {
  const token = await getRlsToken()
  if (!token) return { success: false, error: "Not authenticated" }

  const userRole = token.user_role as string | undefined
  if (!userRole || !["owner", "office"].includes(userRole)) {
    return { success: false, error: "Only owners and office staff can manage checklist" }
  }

  try {
    // Update each task's sort_order based on its position in the array
    for (let i = 0; i < taskIds.length; i++) {
      await withRls(token, (db) =>
        db
          .update(checklistTasks)
          .set({ sort_order: i })
          .where(eq(checklistTasks.id, taskIds[i]))
      )
    }

    revalidatePath("/settings")
    return { success: true }
  } catch (err) {
    console.error("[reorderChecklistTasks] Error:", err)
    return {
      success: false,
      error: err instanceof Error ? err.message : "Failed to reorder tasks",
    }
  }
}
