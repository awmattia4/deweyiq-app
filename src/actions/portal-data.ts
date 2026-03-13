"use server"

import { createClient as createSupabaseAdmin } from "@supabase/supabase-js"
import { adminDb } from "@/lib/db"
import { customers, orgs, orgSettings, serviceVisits, pools, visitPhotos, profiles } from "@/lib/db/schema"
import { eq, and, inArray } from "drizzle-orm"

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

// ─── Service history types ────────────────────────────────────────────────────

/**
 * PortalVisit — a service visit enriched with pool and tech metadata,
 * suitable for the customer-facing portal history view.
 *
 * CRITICAL (from MEMORY.md): chemistry_readings MUST be included — do NOT
 * drop it during object mapping. Drizzle fetches all columns but manual
 * mapping can silently omit fields.
 */
export interface PortalVisit {
  id: string
  pool_id: string | null
  pool_name: string | null
  pool_type: string | null
  sanitizer_type: string | null
  tech_name: string | null
  visit_type: string | null
  visited_at: Date
  status: string | null
  skip_reason: string | null
  notes: string | null
  chemistry_readings: Record<string, number> | null
  checklist_completion: Record<string, boolean> | null
  photo_urls: string[] | null
}

/** PortalPool — minimal pool summary for the per-pool tab switcher. */
export interface PortalPool {
  id: string
  name: string | null
  pool_type: string | null
  sanitizer_type: string | null
}

/** Result type for getServiceHistory. */
export interface ServiceHistoryResult {
  pools: PortalPool[]
  visits: PortalVisit[]
}

/** A single photo entry with context for the gallery view. */
export interface PortalPhoto {
  url: string
  visitDate: string
  poolName: string
}

// ─── getServiceHistory ───────────────────────────────────────────────────────

/**
 * getServiceHistory — load all completed/skipped service visits for a customer.
 *
 * Uses adminDb with explicit customerId filter because portal customers don't
 * have org_id in JWT claims required for RLS; adminDb is the established pattern
 * for all portal data helpers (see portal-data.ts header comment).
 *
 * Returns pools (for tab rendering) and visits (enriched with pool + tech names).
 */
export async function getServiceHistory(
  orgId: string,
  customerId: string
): Promise<ServiceHistoryResult> {
  // Fetch pools for this customer in parallel with visits
  const [poolRows, visitRows] = await Promise.all([
    adminDb
      .select({
        id: pools.id,
        name: pools.name,
        pool_type: pools.type,
        sanitizer_type: pools.sanitizer_type,
      })
      .from(pools)
      .where(and(eq(pools.customer_id, customerId), eq(pools.org_id, orgId))),

    adminDb
      .select({
        // Visit fields — ALL fields explicitly listed to prevent any from being dropped
        id: serviceVisits.id,
        pool_id: serviceVisits.pool_id,
        tech_id: serviceVisits.tech_id,
        visit_type: serviceVisits.visit_type,
        visited_at: serviceVisits.visited_at,
        status: serviceVisits.status,
        skip_reason: serviceVisits.skip_reason,
        notes: serviceVisits.notes,
        // CRITICAL: chemistry_readings must be here — don't drop it (MEMORY.md)
        chemistry_readings: serviceVisits.chemistry_readings,
        checklist_completion: serviceVisits.checklist_completion,
        photo_urls: serviceVisits.photo_urls,
        // Pool fields via LEFT JOIN
        pool_name: pools.name,
        pool_type: pools.type,
        sanitizer_type: pools.sanitizer_type,
      })
      .from(serviceVisits)
      .leftJoin(pools, eq(serviceVisits.pool_id, pools.id))
      .where(
        and(
          eq(serviceVisits.customer_id, customerId),
          eq(serviceVisits.org_id, orgId),
          inArray(serviceVisits.status, ["complete", "skipped"])
        )
      )
      .orderBy(serviceVisits.visited_at),
  ])

  // Collect unique tech IDs from visits to fetch display names in one query
  const techIds = [...new Set(visitRows.map((v) => v.tech_id).filter(Boolean))] as string[]

  const techMap: Record<string, string> = {}
  if (techIds.length > 0) {
    const techRows = await adminDb
      .select({ id: profiles.id, full_name: profiles.full_name })
      .from(profiles)
      .where(inArray(profiles.id, techIds))

    for (const tech of techRows) {
      if (tech.full_name) techMap[tech.id] = tech.full_name
    }
  }

  // Map visit rows to PortalVisit
  const visits: PortalVisit[] = visitRows
    .map((row) => ({
      id: row.id,
      pool_id: row.pool_id ?? null,
      pool_name: row.pool_name ?? null,
      pool_type: row.pool_type ?? null,
      sanitizer_type: row.sanitizer_type ?? null,
      tech_name: row.tech_id ? (techMap[row.tech_id] ?? null) : null,
      visit_type: row.visit_type ?? null,
      visited_at: row.visited_at,
      status: row.status ?? null,
      skip_reason: row.skip_reason ?? null,
      notes: row.notes ?? null,
      // CRITICAL: chemistry_readings must NOT be dropped (MEMORY.md)
      chemistry_readings: (row.chemistry_readings as Record<string, number> | null) ?? null,
      checklist_completion: (row.checklist_completion as Record<string, boolean> | null) ?? null,
      photo_urls: row.photo_urls ?? null,
    }))
    // Sort newest first after all joins complete
    .sort((a, b) => b.visited_at.getTime() - a.visited_at.getTime())

  const portalPools: PortalPool[] = poolRows.map((p) => ({
    id: p.id,
    name: p.name ?? null,
    pool_type: p.pool_type ?? null,
    sanitizer_type: p.sanitizer_type ?? null,
  }))

  return { pools: portalPools, visits }
}

// ─── getVisitPhotos ──────────────────────────────────────────────────────────

/**
 * getVisitPhotos — load all photos for a customer's visits, with signed URLs.
 *
 * Pulls photo paths from:
 * 1. visit_photos table (storage_path per photo row)
 * 2. service_visits.photo_urls JSONB array (denormalized paths from field app)
 *
 * Deduplicates paths, generates 1-hour signed URLs for each.
 * Returns newest photos first.
 *
 * @param poolId — optional filter to a single pool's visits
 */
export async function getVisitPhotos(
  orgId: string,
  customerId: string,
  poolId?: string
): Promise<PortalPhoto[]> {
  // Build WHERE conditions for service_visits filter
  const visitConditions = poolId
    ? and(
        eq(serviceVisits.customer_id, customerId),
        eq(serviceVisits.org_id, orgId),
        eq(serviceVisits.pool_id, poolId),
        inArray(serviceVisits.status, ["complete", "skipped"])
      )
    : and(
        eq(serviceVisits.customer_id, customerId),
        eq(serviceVisits.org_id, orgId),
        inArray(serviceVisits.status, ["complete", "skipped"])
      )

  const visitRows = await adminDb
    .select({
      id: serviceVisits.id,
      visited_at: serviceVisits.visited_at,
      pool_id: serviceVisits.pool_id,
      pool_name: pools.name,
      photo_urls: serviceVisits.photo_urls,
    })
    .from(serviceVisits)
    .leftJoin(pools, eq(serviceVisits.pool_id, pools.id))
    .where(visitConditions)
    .orderBy(serviceVisits.visited_at)

  if (visitRows.length === 0) return []

  const visitIds = visitRows.map((v) => v.id)

  // Also fetch from visit_photos table
  const photoRows = await adminDb
    .select({
      visit_id: visitPhotos.visit_id,
      storage_path: visitPhotos.storage_path,
    })
    .from(visitPhotos)
    .where(and(inArray(visitPhotos.visit_id, visitIds), eq(visitPhotos.org_id, orgId)))

  // Build visit metadata map
  const visitMeta: Record<string, { visited_at: Date; pool_name: string }> = {}
  for (const v of visitRows) {
    visitMeta[v.id] = {
      visited_at: v.visited_at,
      pool_name: v.pool_name ?? "Pool",
    }
  }

  // Collect all (path, visitId) pairs — deduplicated by path
  const pathMap = new Map<string, { visitId: string }>()

  // From service_visits.photo_urls (denormalized array from field app)
  for (const v of visitRows) {
    if (v.photo_urls) {
      for (const path of v.photo_urls) {
        if (!pathMap.has(path)) pathMap.set(path, { visitId: v.id })
      }
    }
  }

  // From visit_photos table rows
  for (const p of photoRows) {
    if (!pathMap.has(p.storage_path)) pathMap.set(p.storage_path, { visitId: p.visit_id })
  }

  if (pathMap.size === 0) return []

  // Generate signed URLs in parallel (1-hour expiry per research recommendation)
  const supabaseAdmin = createAdminClient()
  const signedEntries = await Promise.all(
    Array.from(pathMap.entries()).map(async ([path, { visitId }]) => {
      try {
        const { data } = await supabaseAdmin.storage
          .from("visit-photos")
          .createSignedUrl(path, 3600)

        if (!data?.signedUrl) return null

        const meta = visitMeta[visitId]
        return {
          url: data.signedUrl,
          visitDate: meta?.visited_at
            ? meta.visited_at.toISOString()
            : new Date().toISOString(),
          poolName: meta?.pool_name ?? "Pool",
          _timestamp: meta?.visited_at?.getTime() ?? 0,
        }
      } catch {
        return null
      }
    })
  )

  // Filter nulls and sort newest first
  return signedEntries
    .filter((e): e is NonNullable<typeof e> => e !== null)
    .sort((a, b) => b._timestamp - a._timestamp)
    .map(({ url, visitDate, poolName }) => ({ url, visitDate, poolName }))
}

// ─── getCustomerPools ─────────────────────────────────────────────────────────

/**
 * CustomerPool — minimal pool info for the service request form's pool selector.
 */
export interface CustomerPool {
  id: string
  name: string
  pool_type: string
}

/**
 * getCustomerPools — load all pools for a customer, for the request form selector.
 *
 * Uses adminDb — called from portal context where RLS JWT is the customer role.
 * The customer's pools are loaded by customer_id (resolved from email upstream).
 */
export async function getCustomerPools(
  orgId: string,
  customerId: string
): Promise<CustomerPool[]> {
  try {
    const rows = await adminDb
      .select({
        id: pools.id,
        name: pools.name,
        pool_type: pools.type,
      })
      .from(pools)
      .where(and(eq(pools.customer_id, customerId), eq(pools.org_id, orgId)))

    return rows.map((row) => ({
      id: row.id,
      name: row.name,
      pool_type: row.pool_type,
    }))
  } catch (err) {
    console.error("[portal-data] getCustomerPools error:", err)
    return []
  }
}
