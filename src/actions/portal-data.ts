"use server"

import { createClient as createSupabaseAdmin } from "@supabase/supabase-js"
import { adminDb } from "@/lib/db"
import { customers, orgs, orgSettings } from "@/lib/db/schema"
import { eq, and } from "drizzle-orm"

/**
 * portal-data.ts — Customer-ID resolution and org branding helpers.
 *
 * These are the canonical data helpers for the portal. All portal server
 * components and actions should use these to look up the customer row and
 * load branding — never inline the same queries.
 *
 * Uses adminDb because:
 * 1. Portal customers don't have org_id in JWT during first load
 * 2. Branding must be loadable even for unauthenticated login page
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
 * resolveCustomerId — maps a logged-in customer email + orgId to their customers row.
 *
 * This is the canonical way to resolve the customer_id for portal data queries.
 * All portal pages that need to load customer-specific data should call this first.
 *
 * Returns null if no matching customer row exists (edge case during invite flow).
 */
export async function resolveCustomerId(
  orgId: string,
  email: string
): Promise<string | null> {
  const [customer] = await adminDb
    .select({ id: customers.id })
    .from(customers)
    .where(and(eq(customers.email, email), eq(customers.org_id, orgId)))
    .limit(1)

  return customer?.id ?? null
}

/**
 * OrgBranding — branding data for portal white-labeling.
 */
export interface OrgBranding {
  name: string
  logoUrl: string | null
  slug: string | null
  brandColor: string | null
  portalWelcomeMessage: string | null
  faviconUrl: string | null
}

/**
 * getOrgBranding — loads branding data for a given org.
 *
 * Used by:
 * - Portal login page (show company branding before auth)
 * - Portal layout (apply brand throughout authenticated session)
 *
 * Generates a 24-hour signed URL for the favicon if one is set.
 * Falls back to null faviconUrl if no favicon is configured.
 */
export async function getOrgBranding(orgId: string): Promise<OrgBranding | null> {
  const [orgRow] = await adminDb
    .select({
      name: orgs.name,
      logo_url: orgs.logo_url,
      slug: orgs.slug,
    })
    .from(orgs)
    .where(eq(orgs.id, orgId))
    .limit(1)

  if (!orgRow) return null

  const [settingsRow] = await adminDb
    .select({
      brand_color: orgSettings.brand_color,
      favicon_path: orgSettings.favicon_path,
      portal_welcome_message: orgSettings.portal_welcome_message,
    })
    .from(orgSettings)
    .where(eq(orgSettings.org_id, orgId))
    .limit(1)

  let faviconUrl: string | null = null

  if (settingsRow?.favicon_path) {
    try {
      const supabaseAdmin = createAdminClient()
      const { data } = await supabaseAdmin.storage
        .from("company-assets")
        .createSignedUrl(settingsRow.favicon_path, 86400) // 24 hours
      faviconUrl = data?.signedUrl ?? null
    } catch (err) {
      console.error("[getOrgBranding] favicon signed URL error:", err)
    }
  }

  return {
    name: orgRow.name,
    logoUrl: orgRow.logo_url ?? null,
    slug: orgRow.slug ?? null,
    brandColor: settingsRow?.brand_color ?? null,
    portalWelcomeMessage: settingsRow?.portal_welcome_message ?? null,
    faviconUrl,
  }
}

/**
 * getOrgBySlug — resolves an org from its subdomain slug.
 *
 * Used by the portal login page to load branding from the subdomain
 * before the user authenticates.
 */
export async function getOrgBySlug(slug: string): Promise<{ orgId: string } | null> {
  const [orgRow] = await adminDb
    .select({ id: orgs.id })
    .from(orgs)
    .where(eq(orgs.slug, slug))
    .limit(1)

  if (!orgRow) return null
  return { orgId: orgRow.id }
}
