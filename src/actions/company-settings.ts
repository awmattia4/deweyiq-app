"use server"

import { revalidatePath } from "next/cache"
import { createClient } from "@/lib/supabase/server"
import { withRls, adminDb } from "@/lib/db"
import type { SupabaseToken } from "@/lib/db"
import { orgSettings, orgs } from "@/lib/db/schema"
import { eq } from "drizzle-orm"

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
  created_at: Date
  updated_at: Date
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

/**
 * getOrgSettings — Reads org_settings for the current user's org via withRls.
 *
 * If no row exists (org has not configured settings yet), returns default
 * values so the system works out of the box before the owner configures anything.
 *
 * @returns OrgSettings object (real or default), or null if not authenticated.
 */
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

/**
 * updateOrgSettings — Upserts the org_settings row for the current user's org.
 *
 * Uses INSERT ... ON CONFLICT (org_id) DO UPDATE to create-or-update.
 * Validates that the current user is owner role before writing.
 *
 * @param data Partial org settings to update
 * @returns { success: boolean; error?: string }
 */
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

/**
 * ensureOrgSettings — Creates a default org_settings row if one doesn't exist.
 *
 * Called lazily when settings are first accessed. Uses adminDb to bypass RLS
 * for the existence check (avoids chicken-and-egg with RLS for INSERT).
 *
 * @param orgId Organization UUID
 */
export async function ensureOrgSettings(orgId: string): Promise<void> {
  if (!orgId) return

  try {
    // Check if row exists via adminDb
    const existing = await adminDb
      .select({ id: orgSettings.id })
      .from(orgSettings)
      .where(eq(orgSettings.org_id, orgId))
      .limit(1)

    if (existing.length > 0) return

    // Insert defaults via adminDb (owner RLS check happens at updateOrgSettings call)
    await adminDb
      .insert(orgSettings)
      .values({
        org_id: orgId,
        ...DEFAULT_SETTINGS,
      })
      .onConflictDoNothing()
  } catch (err) {
    // Non-fatal — if row creation fails, getOrgSettings returns defaults in memory
    console.error("[ensureOrgSettings] Error:", err)
  }
}

// ---------------------------------------------------------------------------
// updateOrgName
// ---------------------------------------------------------------------------

/**
 * updateOrgName — Updates the org's display name.
 *
 * Owner-only action (enforced by RLS on orgs table).
 *
 * @param name New organization name
 */
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
