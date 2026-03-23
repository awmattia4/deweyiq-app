"use server"

import { revalidatePath } from "next/cache"
import { createClient } from "@/lib/supabase/server"
import { withRls, adminDb, getRlsToken } from "@/lib/db"
import type { SupabaseToken } from "@/lib/db"
import { orgSettings, orgs, checklistTasks, checklistTemplates, profiles } from "@/lib/db/schema"
import { eq, and, isNull, isNotNull, asc, ne } from "drizzle-orm"

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
  // Phase 7: Billing & Payments
  stripe_account_id: string | null
  stripe_onboarding_done: boolean
  qbo_connected: boolean
  payment_provider: string
  cc_surcharge_enabled: boolean
  cc_surcharge_pct: string | null
  default_payment_terms_days: number
  invoice_footer_text: string | null
  // Phase 7-08: Notification template merge tag sources
  google_review_url: string | null
  website_url: string | null
  social_media_urls: Record<string, string> | null
  custom_email_footer: string | null
  custom_sms_signature: string | null
  // Phase 8: Portal branding
  brand_color: string | null
  favicon_path: string | null
  portal_welcome_message: string | null
  // Phase 9: Team payroll — upsell commission % for tech-flagged WOs
  wo_upsell_commission_pct: string | null
  // Phase 9: Chemical profitability threshold — minimum % margin before flagging
  chem_profit_margin_threshold_pct: string | null
  // Phase 10-14: Safety — unresponsive tech detection
  safety_timeout_minutes: number
  safety_escalation_chain: Array<{ role: string; delay_minutes: number }> | null
  // Phase 11: Time tracking settings
  time_tracking_enabled: boolean
  geofence_radius_meters: number
  break_auto_detect_minutes: number
  pay_period_type: string
  overtime_threshold_hours: number
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

export interface ChecklistTemplateRow {
  id: string
  name: string
  is_default: boolean
  tasks: ChecklistTaskRow[]
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
  // Phase 7 defaults
  stripe_account_id: null,
  stripe_onboarding_done: false,
  qbo_connected: false,
  payment_provider: "none",
  cc_surcharge_enabled: false,
  cc_surcharge_pct: null,
  default_payment_terms_days: 30,
  invoice_footer_text: null,
  // Phase 7-08 defaults
  google_review_url: null,
  website_url: null,
  social_media_urls: null,
  custom_email_footer: null,
  custom_sms_signature: null,
  // Phase 8 defaults
  brand_color: null,
  favicon_path: null,
  portal_welcome_message: null,
  // Phase 9 defaults
  wo_upsell_commission_pct: "0",
  chem_profit_margin_threshold_pct: "20",
  // Phase 10-14 defaults
  safety_timeout_minutes: 30,
  safety_escalation_chain: [{ role: "owner", delay_minutes: 0 }],
  // Phase 11 defaults
  time_tracking_enabled: false,
  geofence_radius_meters: 100,
  break_auto_detect_minutes: 30,
  pay_period_type: "bi_weekly",
  overtime_threshold_hours: 40,
}

// ---------------------------------------------------------------------------
// Auth helper
// ---------------------------------------------------------------------------

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

  // Use service role client to bypass storage RLS policies.
  // Auth check is already done above (owner only).
  const { createClient: createAdminClient } = await import("@supabase/supabase-js")
  const adminSupabase = createAdminClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  )

  const path = `${orgId}/logo/${fileName}`

  const { data, error } = await adminSupabase.storage
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
// createFaviconUploadUrl
// ---------------------------------------------------------------------------

/**
 * createFaviconUploadUrl — generates a signed URL for uploading a portal favicon.
 * Accepts ICO or PNG files. Stored at {orgId}/portal/favicon.{ext} in company-assets bucket.
 */
export async function createFaviconUploadUrl(
  fileName: string
): Promise<{ signedUrl: string; token: string; path: string } | { error: string }> {
  const rlsToken = await getRlsToken()
  if (!rlsToken) return { error: "Not authenticated" }

  const userRole = rlsToken.user_role as string | undefined
  if (userRole !== "owner") return { error: "Only owners can upload favicons" }

  const orgId = rlsToken.org_id as string
  if (!orgId) return { error: "No org found" }

  const { createClient: createAdminClient } = await import("@supabase/supabase-js")
  const adminSupabase = createAdminClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  )
  const ext = fileName.split(".").pop() ?? "png"
  const path = `${orgId}/portal/favicon.${ext}`

  const { data, error } = await adminSupabase.storage
    .from("company-assets")
    .createSignedUploadUrl(path, { upsert: true })

  if (error) {
    console.error("[createFaviconUploadUrl] Error:", error)
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
 * getChecklistTasks — Returns checklist tasks for a specific template.
 * When templateId is omitted, returns tasks with template_id IS NULL (legacy compat).
 */
export async function getChecklistTasks(templateId?: string): Promise<ChecklistTaskRow[]> {
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
            templateId
              ? eq(checklistTasks.template_id, templateId)
              : isNull(checklistTasks.template_id),
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
 * addChecklistTask — Adds a checklist task to a template (or org-level if no templateId).
 */
export async function addChecklistTask(
  label: string,
  templateId?: string,
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
    // Get max sort_order for new task within this template
    const existing = await withRls(token, (db) =>
      db
        .select({ sort_order: checklistTasks.sort_order })
        .from(checklistTasks)
        .where(
          and(
            eq(checklistTasks.org_id, orgId),
            templateId
              ? eq(checklistTasks.template_id, templateId)
              : isNull(checklistTasks.template_id),
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
        template_id: templateId ?? null,
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

// ---------------------------------------------------------------------------
// Checklist template CRUD
// ---------------------------------------------------------------------------

/**
 * getChecklistTemplatesWithTasks — returns all templates with their tasks.
 * Creates a default "Routine Service" template if none exist (auto-migration).
 * Also moves orphan tasks (template_id IS NULL) under the default template.
 */
export async function getChecklistTemplatesWithTasks(): Promise<ChecklistTemplateRow[]> {
  const token = await getRlsToken()
  if (!token) return []

  const orgId = token.org_id as string
  if (!orgId) return []

  try {
    return await withRls(token, async (db) => {
      // Fetch all templates
      let templates = await db
        .select({
          id: checklistTemplates.id,
          name: checklistTemplates.name,
          is_default: checklistTemplates.is_default,
        })
        .from(checklistTemplates)
        .where(eq(checklistTemplates.org_id, orgId))
        .orderBy(asc(checklistTemplates.name))

      // Auto-create default template if none exist
      if (templates.length === 0) {
        const [newTemplate] = await db
          .insert(checklistTemplates)
          .values({
            org_id: orgId,
            name: "Routine Service",
            is_default: true,
          })
          .returning({
            id: checklistTemplates.id,
            name: checklistTemplates.name,
            is_default: checklistTemplates.is_default,
          })
        templates = [newTemplate]
      }

      // Ensure exactly one default
      const hasDefault = templates.some((t) => t.is_default)
      if (!hasDefault) {
        await db
          .update(checklistTemplates)
          .set({ is_default: true })
          .where(eq(checklistTemplates.id, templates[0].id))
        templates[0].is_default = true
      }

      const defaultTemplateId = templates.find((t) => t.is_default)!.id

      // Move orphan tasks (template_id IS NULL) under the default template
      await db
        .update(checklistTasks)
        .set({ template_id: defaultTemplateId })
        .where(
          and(
            eq(checklistTasks.org_id, orgId),
            isNull(checklistTasks.template_id),
            isNull(checklistTasks.customer_id)
          )
        )

      // Fetch all tasks for all templates
      const allTasks = await db
        .select({
          id: checklistTasks.id,
          template_id: checklistTasks.template_id,
          label: checklistTasks.label,
          is_required: checklistTasks.is_required,
          requires_photo: checklistTasks.requires_photo,
          sort_order: checklistTasks.sort_order,
        })
        .from(checklistTasks)
        .where(
          and(
            eq(checklistTasks.org_id, orgId),
            isNull(checklistTasks.customer_id),
            eq(checklistTasks.is_deleted, false)
          )
        )
        .orderBy(asc(checklistTasks.sort_order))

      // Group tasks by template
      const tasksByTemplate = new Map<string, ChecklistTaskRow[]>()
      for (const task of allTasks) {
        if (!task.template_id) continue
        const list = tasksByTemplate.get(task.template_id) ?? []
        list.push({
          id: task.id,
          label: task.label,
          is_required: task.is_required,
          requires_photo: task.requires_photo,
          sort_order: task.sort_order,
        })
        tasksByTemplate.set(task.template_id, list)
      }

      return templates.map((t) => ({
        id: t.id,
        name: t.name,
        is_default: t.is_default,
        tasks: tasksByTemplate.get(t.id) ?? [],
      }))
    })
  } catch (err) {
    console.error("[getChecklistTemplatesWithTasks] Error:", err)
    return []
  }
}

/**
 * createChecklistTemplate — creates a new service type template.
 */
export async function createChecklistTemplate(
  name: string
): Promise<{ success: boolean; id?: string; error?: string }> {
  const token = await getRlsToken()
  if (!token) return { success: false, error: "Not authenticated" }

  const userRole = token.user_role as string | undefined
  if (!userRole || !["owner", "office"].includes(userRole)) {
    return { success: false, error: "Only owners and office staff can manage service types" }
  }

  const orgId = token.org_id as string
  if (!orgId) return { success: false, error: "No org found" }

  const trimmed = name.trim()
  if (!trimmed) return { success: false, error: "Name cannot be empty" }

  try {
    const [created] = await withRls(token, (db) =>
      db
        .insert(checklistTemplates)
        .values({ org_id: orgId, name: trimmed, is_default: false })
        .returning({ id: checklistTemplates.id })
    )

    revalidatePath("/settings")
    return { success: true, id: created.id }
  } catch (err) {
    console.error("[createChecklistTemplate] Error:", err)
    return {
      success: false,
      error: err instanceof Error ? err.message : "Failed to create service type",
    }
  }
}

/**
 * renameChecklistTemplate — renames a service type template.
 */
export async function renameChecklistTemplate(
  templateId: string,
  name: string
): Promise<{ success: boolean; error?: string }> {
  const token = await getRlsToken()
  if (!token) return { success: false, error: "Not authenticated" }

  const userRole = token.user_role as string | undefined
  if (!userRole || !["owner", "office"].includes(userRole)) {
    return { success: false, error: "Only owners and office staff can manage service types" }
  }

  const trimmed = name.trim()
  if (!trimmed) return { success: false, error: "Name cannot be empty" }

  try {
    await withRls(token, (db) =>
      db
        .update(checklistTemplates)
        .set({ name: trimmed })
        .where(eq(checklistTemplates.id, templateId))
    )

    revalidatePath("/settings")
    return { success: true }
  } catch (err) {
    console.error("[renameChecklistTemplate] Error:", err)
    return {
      success: false,
      error: err instanceof Error ? err.message : "Failed to rename service type",
    }
  }
}

/**
 * deleteChecklistTemplate — deletes a service type template and its tasks.
 * Cannot delete the default template.
 */
export async function deleteChecklistTemplate(
  templateId: string
): Promise<{ success: boolean; error?: string }> {
  const token = await getRlsToken()
  if (!token) return { success: false, error: "Not authenticated" }

  const userRole = token.user_role as string | undefined
  if (!userRole || !["owner", "office"].includes(userRole)) {
    return { success: false, error: "Only owners and office staff can manage service types" }
  }

  try {
    return await withRls(token, async (db) => {
      // Check if this is the default template
      const [template] = await db
        .select({ is_default: checklistTemplates.is_default })
        .from(checklistTemplates)
        .where(eq(checklistTemplates.id, templateId))
        .limit(1)

      if (!template) return { success: false, error: "Template not found" }
      if (template.is_default) return { success: false, error: "Cannot delete the default service type" }

      // Delete template (cascades to tasks via FK onDelete)
      await db.delete(checklistTemplates).where(eq(checklistTemplates.id, templateId))

      revalidatePath("/settings")
      return { success: true }
    })
  } catch (err) {
    console.error("[deleteChecklistTemplate] Error:", err)
    return {
      success: false,
      error: err instanceof Error ? err.message : "Failed to delete service type",
    }
  }
}

/**
 * setDefaultChecklistTemplate — marks a template as default and unmarks all others.
 */
export async function setDefaultChecklistTemplate(
  templateId: string
): Promise<{ success: boolean; error?: string }> {
  const token = await getRlsToken()
  if (!token) return { success: false, error: "Not authenticated" }

  const userRole = token.user_role as string | undefined
  if (!userRole || !["owner", "office"].includes(userRole)) {
    return { success: false, error: "Only owners and office staff can manage service types" }
  }

  const orgId = token.org_id as string
  if (!orgId) return { success: false, error: "No org found" }

  try {
    await withRls(token, async (db) => {
      // Unmark all templates for this org
      await db
        .update(checklistTemplates)
        .set({ is_default: false })
        .where(
          and(
            eq(checklistTemplates.org_id, orgId),
            ne(checklistTemplates.id, templateId)
          )
        )
      // Mark the target template
      await db
        .update(checklistTemplates)
        .set({ is_default: true })
        .where(eq(checklistTemplates.id, templateId))
    })

    revalidatePath("/settings")
    return { success: true }
  } catch (err) {
    console.error("[setDefaultChecklistTemplate] Error:", err)
    return {
      success: false,
      error: err instanceof Error ? err.message : "Failed to set default service type",
    }
  }
}

// ---------------------------------------------------------------------------
// Per-Customer Checklist Management
// ---------------------------------------------------------------------------

/**
 * Structured view of a customer's effective checklist: template tasks (with
 * per-customer suppression status) plus any customer-specific additions.
 */
export interface CustomerChecklistView {
  templateTasks: Array<{
    id: string
    label: string
    is_required: boolean
    requires_photo: boolean
    sort_order: number
    isSuppressed: boolean
    tombstoneId: string | null
  }>
  customTasks: Array<{
    id: string
    label: string
    is_required: boolean
    requires_photo: boolean
    sort_order: number
  }>
}

/**
 * getCustomerChecklistView — Returns the effective checklist for a customer:
 * template tasks (with suppression status) + customer-specific additions.
 */
export async function getCustomerChecklistView(
  customerId: string
): Promise<CustomerChecklistView> {
  const token = await getRlsToken()
  if (!token) return { templateTasks: [], customTasks: [] }

  const orgId = token.org_id as string
  if (!orgId) return { templateTasks: [], customTasks: [] }

  try {
    // 1. Find the default template for this org
    const templates = await withRls(token, (db) =>
      db
        .select({ id: checklistTemplates.id })
        .from(checklistTemplates)
        .where(
          and(
            eq(checklistTemplates.org_id, orgId),
            eq(checklistTemplates.is_default, true)
          )
        )
        .limit(1)
    )

    const defaultTemplateId = templates[0]?.id ?? null

    // 2. Fetch template tasks (org-level, not deleted)
    const templateTaskRows = defaultTemplateId
      ? await withRls(token, (db) =>
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
                eq(checklistTasks.template_id, defaultTemplateId),
                isNull(checklistTasks.customer_id),
                eq(checklistTasks.is_deleted, false)
              )
            )
            .orderBy(asc(checklistTasks.sort_order))
        )
      : []

    // 3. Fetch ALL customer-level rows (both additions and tombstones)
    const customerRows = await withRls(token, (db) =>
      db
        .select({
          id: checklistTasks.id,
          label: checklistTasks.label,
          is_required: checklistTasks.is_required,
          requires_photo: checklistTasks.requires_photo,
          sort_order: checklistTasks.sort_order,
          is_deleted: checklistTasks.is_deleted,
          suppresses_task_id: checklistTasks.suppresses_task_id,
        })
        .from(checklistTasks)
        .where(
          and(
            eq(checklistTasks.org_id, orgId),
            eq(checklistTasks.customer_id, customerId)
          )
        )
        .orderBy(asc(checklistTasks.sort_order))
    )

    // 4. Build suppression map: templateTaskId → tombstoneId
    const suppressionMap = new Map<string, string>()
    for (const row of customerRows) {
      if (row.is_deleted && row.suppresses_task_id) {
        suppressionMap.set(row.suppresses_task_id, row.id)
      }
    }

    // 5. Build template tasks with suppression status
    const templateTasks = templateTaskRows.map((t) => ({
      id: t.id,
      label: t.label,
      is_required: t.is_required,
      requires_photo: t.requires_photo,
      sort_order: t.sort_order,
      isSuppressed: suppressionMap.has(t.id),
      tombstoneId: suppressionMap.get(t.id) ?? null,
    }))

    // 6. Build customer additions (non-deleted customer rows)
    const customTasks = customerRows
      .filter((r) => !r.is_deleted)
      .map((r) => ({
        id: r.id,
        label: r.label,
        is_required: r.is_required,
        requires_photo: r.requires_photo,
        sort_order: r.sort_order,
      }))

    return { templateTasks, customTasks }
  } catch (err) {
    console.error("[getCustomerChecklistView] Error:", err)
    return { templateTasks: [], customTasks: [] }
  }
}

/**
 * suppressTemplateTask — Creates a tombstone row to suppress a template task
 * for a specific customer.
 */
export async function suppressTemplateTask(
  customerId: string,
  templateTaskId: string
): Promise<{ success: boolean; error?: string }> {
  const token = await getRlsToken()
  if (!token) return { success: false, error: "Not authenticated" }

  const userRole = token.user_role as string | undefined
  if (!userRole || !["owner", "office"].includes(userRole)) {
    return { success: false, error: "Only owners and office staff can manage checklists" }
  }

  const orgId = token.org_id as string
  if (!orgId) return { success: false, error: "No org found" }

  try {
    // Fetch the template task to copy its label (label is NOT NULL in schema)
    const [templateTask] = await withRls(token, (db) =>
      db
        .select({ label: checklistTasks.label })
        .from(checklistTasks)
        .where(eq(checklistTasks.id, templateTaskId))
        .limit(1)
    )

    if (!templateTask) {
      return { success: false, error: "Template task not found" }
    }

    await withRls(token, (db) =>
      db.insert(checklistTasks).values({
        org_id: orgId,
        customer_id: customerId,
        template_id: null,
        label: templateTask.label,
        is_deleted: true,
        suppresses_task_id: templateTaskId,
        sort_order: 0,
      })
    )

    revalidatePath(`/customers/${customerId}`)
    return { success: true }
  } catch (err) {
    console.error("[suppressTemplateTask] Error:", err)
    return {
      success: false,
      error: err instanceof Error ? err.message : "Failed to suppress task",
    }
  }
}

/**
 * restoreTemplateTask — Deletes a tombstone row to restore a previously
 * suppressed template task for a customer.
 */
export async function restoreTemplateTask(
  tombstoneId: string
): Promise<{ success: boolean; error?: string }> {
  const token = await getRlsToken()
  if (!token) return { success: false, error: "Not authenticated" }

  const userRole = token.user_role as string | undefined
  if (!userRole || !["owner", "office"].includes(userRole)) {
    return { success: false, error: "Only owners and office staff can manage checklists" }
  }

  try {
    await withRls(token, (db) =>
      db.delete(checklistTasks).where(eq(checklistTasks.id, tombstoneId))
    )

    revalidatePath("/customers")
    return { success: true }
  } catch (err) {
    console.error("[restoreTemplateTask] Error:", err)
    return {
      success: false,
      error: err instanceof Error ? err.message : "Failed to restore task",
    }
  }
}

/**
 * addCustomerTask — Adds a customer-specific checklist task.
 */
export async function addCustomerTask(
  customerId: string,
  data: { label: string; is_required?: boolean; requires_photo?: boolean }
): Promise<{ success: boolean; error?: string }> {
  const token = await getRlsToken()
  if (!token) return { success: false, error: "Not authenticated" }

  const userRole = token.user_role as string | undefined
  if (!userRole || !["owner", "office"].includes(userRole)) {
    return { success: false, error: "Only owners and office staff can manage checklists" }
  }

  const orgId = token.org_id as string
  if (!orgId) return { success: false, error: "No org found" }

  const trimmed = data.label.trim()
  if (!trimmed) return { success: false, error: "Task label cannot be empty" }

  try {
    // Get max sort_order for customer tasks
    const existing = await withRls(token, (db) =>
      db
        .select({ sort_order: checklistTasks.sort_order })
        .from(checklistTasks)
        .where(
          and(
            eq(checklistTasks.org_id, orgId),
            eq(checklistTasks.customer_id, customerId),
            eq(checklistTasks.is_deleted, false)
          )
        )
    )
    const nextOrder = existing.length > 0
      ? Math.max(...existing.map((r) => r.sort_order)) + 1
      : 0

    await withRls(token, (db) =>
      db.insert(checklistTasks).values({
        org_id: orgId,
        customer_id: customerId,
        template_id: null,
        label: trimmed,
        is_required: data.is_required ?? true,
        requires_photo: data.requires_photo ?? false,
        sort_order: nextOrder,
        is_deleted: false,
      })
    )

    revalidatePath(`/customers/${customerId}`)
    return { success: true }
  } catch (err) {
    console.error("[addCustomerTask] Error:", err)
    return {
      success: false,
      error: err instanceof Error ? err.message : "Failed to add customer task",
    }
  }
}

/**
 * updateCustomerTask — Updates a customer-specific checklist task.
 * Only allows updating tasks that belong to a customer (customer_id IS NOT NULL).
 */
export async function updateCustomerTask(
  taskId: string,
  data: { label?: string; is_required?: boolean; requires_photo?: boolean }
): Promise<{ success: boolean; error?: string }> {
  const token = await getRlsToken()
  if (!token) return { success: false, error: "Not authenticated" }

  const userRole = token.user_role as string | undefined
  if (!userRole || !["owner", "office"].includes(userRole)) {
    return { success: false, error: "Only owners and office staff can manage checklists" }
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
        .where(
          and(
            eq(checklistTasks.id, taskId),
            isNotNull(checklistTasks.customer_id)
          )
        )
    )

    revalidatePath("/customers")
    return { success: true }
  } catch (err) {
    console.error("[updateCustomerTask] Error:", err)
    return {
      success: false,
      error: err instanceof Error ? err.message : "Failed to update task",
    }
  }
}

/**
 * deleteCustomerTask — Hard deletes a customer-specific checklist task.
 * Only allows deleting tasks that belong to a customer (customer_id IS NOT NULL).
 */
export async function deleteCustomerTask(
  taskId: string
): Promise<{ success: boolean; error?: string }> {
  const token = await getRlsToken()
  if (!token) return { success: false, error: "Not authenticated" }

  const userRole = token.user_role as string | undefined
  if (!userRole || !["owner", "office"].includes(userRole)) {
    return { success: false, error: "Only owners and office staff can manage checklists" }
  }

  try {
    await withRls(token, (db) =>
      db
        .delete(checklistTasks)
        .where(
          and(
            eq(checklistTasks.id, taskId),
            isNotNull(checklistTasks.customer_id)
          )
        )
    )

    revalidatePath("/customers")
    return { success: true }
  } catch (err) {
    console.error("[deleteCustomerTask] Error:", err)
    return {
      success: false,
      error: err instanceof Error ? err.message : "Failed to delete task",
    }
  }
}

// ---------------------------------------------------------------------------
// updateTechPayConfig — owner-only: update pay_type and pay_rate for a tech
// profiles_update_policy allows owner to update any profile in their org
// ---------------------------------------------------------------------------

export async function updateTechPayConfig(
  techId: string,
  payType: "per_stop" | "hourly",
  payRate: number
): Promise<{ success: boolean; error?: string }> {
  const supabase = await createClient()
  const { data: claimsData } = await supabase.auth.getClaims()
  if (!claimsData?.claims) return { success: false, error: "Not authenticated" }

  const token = claimsData.claims as SupabaseToken
  const role = token["user_role"] as string | undefined
  if (role !== "owner") return { success: false, error: "Only the owner can configure pay rates" }

  try {
    await withRls(token, async (db) => {
      await db
        .update(profiles)
        .set({
          pay_type: payType,
          pay_rate: String(payRate),
          updated_at: new Date(),
        })
        .where(eq(profiles.id, techId))
    })

    revalidatePath("/settings")
    return { success: true }
  } catch (err) {
    console.error("[updateTechPayConfig] Error:", err)
    return {
      success: false,
      error: err instanceof Error ? err.message : "Failed to update pay config",
    }
  }
}
