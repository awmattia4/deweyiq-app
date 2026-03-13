"use server"

import { createClient as createSupabaseAdmin } from "@supabase/supabase-js"
import { createClient } from "@/lib/supabase/server"
import { adminDb } from "@/lib/db"
import { customers, orgs, orgSettings, profiles } from "@/lib/db/schema"
import { eq, and } from "drizzle-orm"
import { getCurrentUser } from "./auth"

/**
 * portal-auth.ts — Magic link auth, multi-org company picker, org switching.
 *
 * All public-facing portal authentication is handled here.
 * Uses shouldCreateUser: false to prevent rogue account creation — only
 * customers who already have Supabase accounts (invited by the company) can
 * receive magic links.
 */

function createAdminClient() {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY

  if (!supabaseUrl || !serviceRoleKey) {
    throw new Error("Missing SUPABASE_SERVICE_ROLE_KEY or NEXT_PUBLIC_SUPABASE_URL")
  }

  return createSupabaseAdmin(supabaseUrl, serviceRoleKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  })
}

/**
 * sendMagicLink — sends a magic link email to the given address.
 *
 * Always returns success to prevent email enumeration.
 * CRITICAL: shouldCreateUser: false prevents rogue account creation.
 * Only users with existing Supabase accounts will receive the email.
 */
export async function sendMagicLink(
  email: string
): Promise<{ success: boolean }> {
  try {
    const supabase = await createClient()
    const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000"
    const emailRedirectTo = `${appUrl}/auth/portal-callback`

    const { error } = await supabase.auth.signInWithOtp({
      email,
      options: {
        shouldCreateUser: false,
        emailRedirectTo,
      },
    })

    // Log error (non-rate-limit) but always return success to prevent enumeration
    if (error && !error.message.toLowerCase().includes("rate limit")) {
      console.error("[sendMagicLink] signInWithOtp error:", error.message)
    }
  } catch (err) {
    console.error("[sendMagicLink] unexpected error:", err)
  }

  // Always return success — never reveal whether the email exists
  return { success: true }
}

/**
 * getCustomerOrgs — returns all orgs the given customer belongs to.
 *
 * Used for the multi-company picker after login. Queries all profile rows
 * for the email + customer role, then joins orgs + org_settings for branding.
 */
export async function getCustomerOrgs(
  userId: string,
  email: string
): Promise<
  Array<{
    orgId: string
    orgName: string
    logoUrl: string | null
    slug: string | null
    brandColor: string | null
  }>
> {
  // Find all customer profiles for this email
  const customerProfiles = await adminDb
    .select({
      orgId: profiles.org_id,
    })
    .from(profiles)
    .where(and(eq(profiles.email, email), eq(profiles.role, "customer")))

  if (customerProfiles.length === 0) return []

  const orgIds = customerProfiles.map((p) => p.orgId).filter((id): id is string => id !== null)

  if (orgIds.length === 0) return []

  // Fetch org details for each org
  const results: Array<{
    orgId: string
    orgName: string
    logoUrl: string | null
    slug: string | null
    brandColor: string | null
  }> = []

  for (const orgId of orgIds) {
    const [orgRow] = await adminDb
      .select({
        id: orgs.id,
        name: orgs.name,
        logo_url: orgs.logo_url,
        slug: orgs.slug,
      })
      .from(orgs)
      .where(eq(orgs.id, orgId))
      .limit(1)

    if (!orgRow) continue

    const [settingsRow] = await adminDb
      .select({ brand_color: orgSettings.brand_color })
      .from(orgSettings)
      .where(eq(orgSettings.org_id, orgId))
      .limit(1)

    results.push({
      orgId: orgRow.id,
      orgName: orgRow.name,
      logoUrl: orgRow.logo_url ?? null,
      slug: orgRow.slug ?? null,
      brandColor: settingsRow?.brand_color ?? null,
    })
  }

  return results
}

/**
 * switchOrg — updates the customer's active org in their JWT.
 *
 * Verifies the customer actually has a profile in the target org before
 * switching. Client must call supabase.auth.refreshSession() after this
 * and do a hard navigation to /portal.
 */
export async function switchOrg(
  newOrgId: string
): Promise<{ success: boolean; error?: string }> {
  const user = await getCurrentUser()
  if (!user) return { success: false, error: "Not authenticated" }

  if (user.role !== "customer") {
    return { success: false, error: "Only customers can switch orgs" }
  }

  // Verify the customer has a profile in the target org
  const [targetProfile] = await adminDb
    .select({ id: profiles.id })
    .from(profiles)
    .where(and(eq(profiles.id, user.id), eq(profiles.org_id, newOrgId)))
    .limit(1)

  // Also check by email in case profile ID differs
  const [targetProfileByEmail] = await adminDb
    .select({ id: profiles.id })
    .from(profiles)
    .where(and(eq(profiles.email, user.email), eq(profiles.org_id, newOrgId), eq(profiles.role, "customer")))
    .limit(1)

  if (!targetProfile && !targetProfileByEmail) {
    return { success: false, error: "You do not have access to this organization" }
  }

  const supabaseAdmin = createAdminClient()

  const { error } = await supabaseAdmin.auth.admin.updateUserById(user.id, {
    app_metadata: { org_id: newOrgId },
  })

  if (error) {
    console.error("[switchOrg] updateUserById error:", error.message)
    return { success: false, error: "Failed to switch organization" }
  }

  return { success: true }
}
