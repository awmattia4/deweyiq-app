"use server"

/**
 * notification-templates.ts -- CRUD actions for customizable notification templates.
 *
 * Key functions:
 * - getTemplates: returns all 10 template types (custom or default fallback)
 * - updateTemplate: upsert a custom template for a template type
 * - resetTemplate: delete the custom template (reverts to default)
 * - getResolvedTemplate: the main entry point used by all send functions.
 *   Fetches org's template (or default), resolves merge tags, returns ready-to-use content.
 *
 * All user-facing actions use withRls. getResolvedTemplate uses adminDb since it's
 * called from send functions that may run outside a user session (e.g. dunning cron).
 */

import { revalidatePath } from "next/cache"
import { createClient } from "@/lib/supabase/server"
import { withRls, getRlsToken, adminDb } from "@/lib/db"
import type { SupabaseToken } from "@/lib/db"
import { notificationTemplates, orgSettings, orgs } from "@/lib/db/schema"
import { eq, and } from "drizzle-orm"
import { resolveTemplate } from "@/lib/notifications/template-engine"
import {
  DEFAULT_TEMPLATES,
  ALL_TEMPLATE_TYPES,
  TEMPLATE_TYPE_META,
} from "@/lib/notifications/default-templates"
import type { TemplateType, DefaultTemplate } from "@/lib/notifications/default-templates"

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface TemplateRow {
  id: string | null // null for defaults (not yet saved to DB)
  template_type: TemplateType
  subject: string | null
  body_html: string | null
  sms_text: string | null
  enabled: boolean
  isCustom: boolean // true if the org has customized this template
  label: string
  channel: "email" | "sms"
}

export interface ResolvedTemplate {
  subject: string | null
  body_html: string | null
  sms_text: string | null
  enabled: boolean
}

// ---------------------------------------------------------------------------
// Auth helper
// ---------------------------------------------------------------------------


// ---------------------------------------------------------------------------
// getTemplates
// ---------------------------------------------------------------------------

/**
 * Fetches all 10 template types for the current org.
 * For any type that doesn't have a custom template, returns the default.
 * Always returns exactly 10 rows.
 */
export async function getTemplates(): Promise<TemplateRow[]> {
  const token = await getRlsToken()
  if (!token) return []

  const orgId = token.org_id as string
  if (!orgId) return []

  try {
    // Fetch all custom templates for this org
    const customRows = await withRls(token, (db) =>
      db
        .select()
        .from(notificationTemplates)
        .where(eq(notificationTemplates.org_id, orgId))
    )

    const customMap = new Map(
      customRows.map((row) => [row.template_type, row])
    )

    // Build the full list: custom if exists, else default
    return ALL_TEMPLATE_TYPES.map((type) => {
      const custom = customMap.get(type)
      const defaults = DEFAULT_TEMPLATES[type]
      const meta = TEMPLATE_TYPE_META[type]

      if (custom) {
        return {
          id: custom.id,
          template_type: type,
          subject: custom.subject,
          body_html: custom.body_html,
          sms_text: custom.sms_text,
          enabled: custom.enabled,
          isCustom: true,
          label: meta.label,
          channel: meta.channel,
        }
      }

      return {
        id: null,
        template_type: type,
        subject: defaults.subject ?? null,
        body_html: defaults.body_html ?? null,
        sms_text: defaults.sms_text ?? null,
        enabled: true,
        isCustom: false,
        label: meta.label,
        channel: meta.channel,
      }
    })
  } catch (err) {
    console.error("[getTemplates] Error:", err)
    return []
  }
}

// ---------------------------------------------------------------------------
// updateTemplate
// ---------------------------------------------------------------------------

/**
 * Upserts a custom template for a given template type.
 * Uses onConflictDoUpdate on (org_id, template_type).
 */
export async function updateTemplate(
  templateType: TemplateType,
  data: {
    subject?: string | null
    body_html?: string | null
    sms_text?: string | null
    enabled?: boolean
  }
): Promise<{ success: boolean; error?: string }> {
  const token = await getRlsToken()
  if (!token) return { success: false, error: "Not authenticated" }

  const orgId = token.org_id as string
  const userRole = token.user_role as string | undefined
  if (!userRole || !["owner", "office"].includes(userRole)) {
    return { success: false, error: "Insufficient permissions" }
  }

  if (!ALL_TEMPLATE_TYPES.includes(templateType)) {
    return { success: false, error: `Invalid template type: ${templateType}` }
  }

  try {
    const now = new Date()

    await withRls(token, (db) =>
      db
        .insert(notificationTemplates)
        .values({
          org_id: orgId,
          template_type: templateType,
          subject: data.subject ?? null,
          body_html: data.body_html ?? null,
          sms_text: data.sms_text ?? null,
          enabled: data.enabled ?? true,
          updated_at: now,
        })
        .onConflictDoUpdate({
          target: [notificationTemplates.org_id, notificationTemplates.template_type],
          set: {
            ...(data.subject !== undefined && { subject: data.subject }),
            ...(data.body_html !== undefined && { body_html: data.body_html }),
            ...(data.sms_text !== undefined && { sms_text: data.sms_text }),
            ...(data.enabled !== undefined && { enabled: data.enabled }),
            updated_at: now,
          },
        })
    )

    revalidatePath("/settings")
    return { success: true }
  } catch (err) {
    console.error("[updateTemplate] Error:", err)
    return {
      success: false,
      error: err instanceof Error ? err.message : "Failed to save template",
    }
  }
}

// ---------------------------------------------------------------------------
// resetTemplate
// ---------------------------------------------------------------------------

/**
 * Deletes the org's custom template for this type (reverts to default).
 */
export async function resetTemplate(
  templateType: TemplateType
): Promise<{ success: boolean; error?: string }> {
  const token = await getRlsToken()
  if (!token) return { success: false, error: "Not authenticated" }

  const orgId = token.org_id as string
  const userRole = token.user_role as string | undefined
  if (!userRole || !["owner", "office"].includes(userRole)) {
    return { success: false, error: "Insufficient permissions" }
  }

  try {
    await withRls(token, (db) =>
      db
        .delete(notificationTemplates)
        .where(
          and(
            eq(notificationTemplates.org_id, orgId),
            eq(notificationTemplates.template_type, templateType)
          )
        )
    )

    revalidatePath("/settings")
    return { success: true }
  } catch (err) {
    console.error("[resetTemplate] Error:", err)
    return {
      success: false,
      error: err instanceof Error ? err.message : "Failed to reset template",
    }
  }
}

// ---------------------------------------------------------------------------
// getResolvedTemplate
// ---------------------------------------------------------------------------

/**
 * The main function used by all send actions.
 *
 * 1. Fetches org's custom template (if exists) or falls back to default
 * 2. If template is disabled (enabled=false), returns null (send function should skip)
 * 3. Loads org_settings for google_review_url, website_url, custom_email_footer, custom_sms_signature
 * 4. Also loads org name (company_name) from orgs table
 * 5. Merges org settings into context
 * 6. Calls resolveTemplate on subject, body_html, and sms_text
 * 7. Returns { subject, body_html, sms_text, enabled }
 *
 * Uses adminDb because send functions may run without a user session
 * (e.g. dunning cron, webhook handlers).
 *
 * @param orgId - The org's UUID
 * @param templateType - Which template to resolve
 * @param context - Merge tag values (customer_name, invoice_number, etc.)
 * @returns ResolvedTemplate or null if disabled
 */
export async function getResolvedTemplate(
  orgId: string,
  templateType: TemplateType,
  context: Record<string, string>
): Promise<ResolvedTemplate | null> {
  try {
    // 1. Fetch custom template for this org+type
    const customRows = await adminDb
      .select()
      .from(notificationTemplates)
      .where(
        and(
          eq(notificationTemplates.org_id, orgId),
          eq(notificationTemplates.template_type, templateType)
        )
      )
      .limit(1)

    const custom = customRows[0]
    const defaults = DEFAULT_TEMPLATES[templateType]

    // Use custom values if they exist, else defaults
    const rawSubject = custom?.subject ?? defaults?.subject ?? null
    const rawBodyHtml = custom?.body_html ?? defaults?.body_html ?? null
    const rawSmsText = custom?.sms_text ?? defaults?.sms_text ?? null
    const enabled = custom?.enabled ?? true

    // 2. If disabled, return null -- send function should skip
    if (!enabled) return null

    // 3. Load org_settings for merge tag source fields
    const settingsRows = await adminDb
      .select({
        google_review_url: orgSettings.google_review_url,
        website_url: orgSettings.website_url,
        custom_email_footer: orgSettings.custom_email_footer,
        custom_sms_signature: orgSettings.custom_sms_signature,
      })
      .from(orgSettings)
      .where(eq(orgSettings.org_id, orgId))
      .limit(1)

    const settings = settingsRows[0]

    // 4. Load org name
    const orgRows = await adminDb
      .select({ name: orgs.name })
      .from(orgs)
      .where(eq(orgs.id, orgId))
      .limit(1)

    const orgName = orgRows[0]?.name ?? ""

    // 5. Build full context with org settings
    const fullContext: Record<string, string> = {
      company_name: orgName,
      review_link: settings?.google_review_url ?? "",
      website_link: settings?.website_url ?? "",
      custom_footer: settings?.custom_email_footer ?? "",
      sms_signature: settings?.custom_sms_signature ?? "",
      ...context,
    }

    // 6. Resolve merge tags in each field
    const resolvedSubject = rawSubject ? resolveTemplate(rawSubject, fullContext) : null
    const resolvedBodyHtml = rawBodyHtml ? resolveTemplate(rawBodyHtml, fullContext) : null
    const resolvedSmsText = rawSmsText ? resolveTemplate(rawSmsText, fullContext) : null

    return {
      subject: resolvedSubject,
      body_html: resolvedBodyHtml,
      sms_text: resolvedSmsText,
      enabled,
    }
  } catch (err) {
    console.error("[getResolvedTemplate] Error:", err)
    // On error, fall back to defaults with basic resolution
    const defaults = DEFAULT_TEMPLATES[templateType]
    if (!defaults) return null

    return {
      subject: defaults.subject
        ? resolveTemplate(defaults.subject, context)
        : null,
      body_html: defaults.body_html
        ? resolveTemplate(defaults.body_html, context)
        : null,
      sms_text: defaults.sms_text
        ? resolveTemplate(defaults.sms_text, context)
        : null,
      enabled: true,
    }
  }
}

// ---------------------------------------------------------------------------
// getOrgTemplateSettings
// ---------------------------------------------------------------------------

/**
 * Fetches the org-level template settings (merge tag sources).
 * Used by the template editor UI to populate the settings fields.
 */
export async function getOrgTemplateSettings(): Promise<{
  google_review_url: string | null
  website_url: string | null
  custom_email_footer: string | null
  custom_sms_signature: string | null
} | null> {
  const token = await getRlsToken()
  if (!token) return null

  const orgId = token.org_id as string
  if (!orgId) return null

  try {
    const rows = await withRls(token, (db) =>
      db
        .select({
          google_review_url: orgSettings.google_review_url,
          website_url: orgSettings.website_url,
          custom_email_footer: orgSettings.custom_email_footer,
          custom_sms_signature: orgSettings.custom_sms_signature,
        })
        .from(orgSettings)
        .where(eq(orgSettings.org_id, orgId))
        .limit(1)
    )

    return rows[0] ?? null
  } catch (err) {
    console.error("[getOrgTemplateSettings] Error:", err)
    return null
  }
}
