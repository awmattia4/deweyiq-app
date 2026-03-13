"use server"

import { createClient as createSupabaseAdmin } from "@supabase/supabase-js"
import { adminDb } from "@/lib/db"
import {
  customers,
  orgs,
  orgSettings,
  serviceVisits,
  pools,
  visitPhotos,
  profiles,
  invoices,
  invoiceLineItems,
  paymentRecords,
} from "@/lib/db/schema"
import { eq, and, inArray, asc } from "drizzle-orm"
import { getStripe } from "@/lib/stripe/client"

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

// ---------------------------------------------------------------------------
// Portal billing types
// ---------------------------------------------------------------------------

export interface PortalInvoice {
  id: string
  invoice_number: string | null
  status: string
  subtotal: string
  tax_amount: string
  surcharge_amount: string | null
  total: string
  due_date: string | null
  issued_at: Date | null
  paid_at: Date | null
  billing_period_start: string | null
  billing_period_end: string | null
  lineItems: { description: string; quantity: string; unit_price: string; line_total: string }[]
  payments: { amount: string; method: string; status: string; settled_at: Date | null }[]
}

export interface PortalPaymentMethod {
  id: string
  type: "card" | "us_bank_account"
  last4: string
  brand?: string
  exp_month?: number
  exp_year?: number
  bank_name?: string
  isDefault: boolean
}

// ---------------------------------------------------------------------------
// getCustomerInvoices
// ---------------------------------------------------------------------------

/**
 * Returns all 'sent' and 'paid' invoices for a customer, with line items and
 * payment history grouped per invoice.
 *
 * Only shows invoices the customer should see — no drafts or voided invoices.
 * Uses adminDb because portal customers don't have a staff-role JWT.
 */
export async function getCustomerInvoices(
  orgId: string,
  customerId: string
): Promise<PortalInvoice[]> {
  // Fetch invoices for this customer
  const invoiceRows = await adminDb
    .select()
    .from(invoices)
    .where(
      and(
        eq(invoices.customer_id, customerId),
        eq(invoices.org_id, orgId)
      )
    )
    .orderBy(asc(invoices.created_at))

  // Only show sent and paid invoices to customers
  const visibleInvoices = invoiceRows.filter((inv) =>
    ["sent", "paid"].includes(inv.status)
  )

  if (visibleInvoices.length === 0) return []

  const invoiceIds = visibleInvoices.map((inv) => inv.id)

  // Fetch all line items for these invoices
  const lineItemRows = await adminDb
    .select({
      invoice_id: invoiceLineItems.invoice_id,
      description: invoiceLineItems.description,
      quantity: invoiceLineItems.quantity,
      unit_price: invoiceLineItems.unit_price,
      line_total: invoiceLineItems.line_total,
      sort_order: invoiceLineItems.sort_order,
    })
    .from(invoiceLineItems)
    .where(inArray(invoiceLineItems.invoice_id, invoiceIds))
    .orderBy(asc(invoiceLineItems.sort_order))

  // Fetch all payment records for these invoices
  const paymentRows = await adminDb
    .select({
      invoice_id: paymentRecords.invoice_id,
      amount: paymentRecords.amount,
      method: paymentRecords.method,
      status: paymentRecords.status,
      settled_at: paymentRecords.settled_at,
    })
    .from(paymentRecords)
    .where(inArray(paymentRecords.invoice_id, invoiceIds))

  // Group line items and payments by invoice_id
  const lineItemsByInvoice = new Map<string, typeof lineItemRows>()
  for (const li of lineItemRows) {
    if (!lineItemsByInvoice.has(li.invoice_id)) {
      lineItemsByInvoice.set(li.invoice_id, [])
    }
    lineItemsByInvoice.get(li.invoice_id)!.push(li)
  }

  const paymentsByInvoice = new Map<string, typeof paymentRows>()
  for (const pr of paymentRows) {
    if (!paymentsByInvoice.has(pr.invoice_id)) {
      paymentsByInvoice.set(pr.invoice_id, [])
    }
    paymentsByInvoice.get(pr.invoice_id)!.push(pr)
  }

  return visibleInvoices.map((inv): PortalInvoice => ({
    id: inv.id,
    invoice_number: inv.invoice_number,
    status: inv.status,
    subtotal: inv.subtotal,
    tax_amount: inv.tax_amount,
    surcharge_amount: inv.surcharge_amount,
    total: inv.total,
    due_date: inv.due_date,
    issued_at: inv.issued_at,
    paid_at: inv.paid_at,
    billing_period_start: inv.billing_period_start,
    billing_period_end: inv.billing_period_end,
    lineItems: (lineItemsByInvoice.get(inv.id) ?? []).map((li) => ({
      description: li.description,
      quantity: li.quantity,
      unit_price: li.unit_price,
      line_total: li.line_total,
    })),
    payments: (paymentsByInvoice.get(inv.id) ?? []).map((pr) => ({
      amount: pr.amount,
      method: pr.method,
      status: pr.status,
      settled_at: pr.settled_at,
    })),
  }))
}

// ---------------------------------------------------------------------------
// createPortalPaymentIntent
// ---------------------------------------------------------------------------

/**
 * Creates a Stripe PaymentIntent for a customer to pay an outstanding invoice.
 *
 * CRITICAL: Uses { stripeAccount: org.stripe_account_id } — the PI must live
 * on the connected account, not the platform account.
 *
 * Validates invoice ownership and status before creating the intent.
 * If the customer has no Stripe customer record, creates one on the connected account.
 */
export async function createPortalPaymentIntent(
  orgId: string,
  customerId: string,
  invoiceId: string
): Promise<
  | { clientSecret: string; publishableKey: string; stripeAccount: string; amount: number; surchargeAmount: number }
  | { error: string }
> {
  // Validate invoice belongs to this customer and is in payable state
  const [invoice] = await adminDb
    .select()
    .from(invoices)
    .where(
      and(
        eq(invoices.id, invoiceId),
        eq(invoices.customer_id, customerId),
        eq(invoices.org_id, orgId)
      )
    )
    .limit(1)

  if (!invoice) {
    return { error: "Invoice not found" }
  }

  if (invoice.status !== "sent") {
    return { error: "Invoice is not payable (must be in sent status)" }
  }

  // Fetch org settings for Stripe config
  const [settings] = await adminDb
    .select()
    .from(orgSettings)
    .where(eq(orgSettings.org_id, orgId))
    .limit(1)

  if (!settings?.stripe_account_id || !settings.stripe_onboarding_done) {
    return { error: "Online payment is not available for this company" }
  }

  const stripeAccountId = settings.stripe_account_id

  // Fetch customer row
  const [customer] = await adminDb
    .select({
      id: customers.id,
      email: customers.email,
      full_name: customers.full_name,
      stripe_customer_id: customers.stripe_customer_id,
    })
    .from(customers)
    .where(eq(customers.id, customerId))
    .limit(1)

  if (!customer) {
    return { error: "Customer not found" }
  }

  const stripe = getStripe()

  // Ensure a Stripe customer exists on the connected account
  let stripeCustomerId = customer.stripe_customer_id
  if (!stripeCustomerId) {
    const stripeCustomer = await stripe.customers.create(
      {
        email: customer.email ?? undefined,
        name: customer.full_name,
        metadata: { customer_id: customerId, org_id: orgId },
      },
      { stripeAccount: stripeAccountId }
    )
    stripeCustomerId = stripeCustomer.id

    // Save the stripe_customer_id back to the customer row
    await adminDb
      .update(customers)
      .set({ stripe_customer_id: stripeCustomerId, updated_at: new Date() })
      .where(eq(customers.id, customerId))
  }

  // Calculate surcharge (shown as estimated for card; customer can pick ACH to avoid fee)
  const baseTotal = parseFloat(invoice.total)
  const baseCents = Math.round(baseTotal * 100)

  const ccSurchargeEnabled = settings.cc_surcharge_enabled ?? false
  const ccSurchargePct = settings.cc_surcharge_pct ? parseFloat(settings.cc_surcharge_pct) : 0
  const surchargeAmountCents = ccSurchargeEnabled ? Math.round(baseCents * ccSurchargePct) : 0
  const totalCents = baseCents + surchargeAmountCents

  // Reuse existing PI if present and still usable
  if (invoice.stripe_payment_intent_id) {
    try {
      const existingPI = await stripe.paymentIntents.retrieve(
        invoice.stripe_payment_intent_id,
        { stripeAccount: stripeAccountId }
      )
      if (
        ["requires_payment_method", "requires_confirmation", "requires_action"].includes(
          existingPI.status
        )
      ) {
        const publishableKey = process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY!
        return {
          clientSecret: existingPI.client_secret!,
          publishableKey,
          stripeAccount: stripeAccountId,
          amount: totalCents / 100,
          surchargeAmount: surchargeAmountCents / 100,
        }
      }
    } catch {
      // PI not found or error — fall through to create a new one
    }
  }

  const paymentIntent = await stripe.paymentIntents.create(
    {
      amount: totalCents,
      currency: "usd",
      customer: stripeCustomerId,
      automatic_payment_methods: { enabled: true },
      application_fee_amount: surchargeAmountCents > 0 ? surchargeAmountCents : undefined,
      metadata: {
        invoice_id: invoiceId,
        org_id: orgId,
        customer_id: customerId,
        portal: "true",
      },
    },
    { stripeAccount: stripeAccountId }
  )

  // Save PI ID on the invoice for reuse
  await adminDb
    .update(invoices)
    .set({
      stripe_payment_intent_id: paymentIntent.id,
      updated_at: new Date(),
    })
    .where(eq(invoices.id, invoiceId))

  const publishableKey = process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY
  if (!publishableKey) {
    return { error: "Stripe publishable key not configured" }
  }

  return {
    clientSecret: paymentIntent.client_secret!,
    publishableKey,
    stripeAccount: stripeAccountId,
    amount: totalCents / 100,
    surchargeAmount: surchargeAmountCents / 100,
  }
}

// ---------------------------------------------------------------------------
// createPortalSetupIntent
// ---------------------------------------------------------------------------

/**
 * Creates a Stripe SetupIntent for saving a payment method on file.
 *
 * Used by the payment method manager to let customers save or update
 * their payment method for AutoPay without making a payment.
 *
 * CRITICAL: Uses { stripeAccount: org.stripe_account_id }.
 */
export async function createPortalSetupIntent(
  orgId: string,
  customerId: string
): Promise<
  | { clientSecret: string; publishableKey: string; stripeAccount: string }
  | { error: string }
> {
  const [settings] = await adminDb
    .select()
    .from(orgSettings)
    .where(eq(orgSettings.org_id, orgId))
    .limit(1)

  if (!settings?.stripe_account_id || !settings.stripe_onboarding_done) {
    return { error: "Online payment is not available for this company" }
  }

  const stripeAccountId = settings.stripe_account_id

  const [customer] = await adminDb
    .select({
      id: customers.id,
      email: customers.email,
      full_name: customers.full_name,
      stripe_customer_id: customers.stripe_customer_id,
    })
    .from(customers)
    .where(eq(customers.id, customerId))
    .limit(1)

  if (!customer) {
    return { error: "Customer not found" }
  }

  const stripe = getStripe()

  let stripeCustomerId = customer.stripe_customer_id
  if (!stripeCustomerId) {
    const stripeCustomer = await stripe.customers.create(
      {
        email: customer.email ?? undefined,
        name: customer.full_name,
        metadata: { customer_id: customerId, org_id: orgId },
      },
      { stripeAccount: stripeAccountId }
    )
    stripeCustomerId = stripeCustomer.id

    await adminDb
      .update(customers)
      .set({ stripe_customer_id: stripeCustomerId, updated_at: new Date() })
      .where(eq(customers.id, customerId))
  }

  const setupIntent = await stripe.setupIntents.create(
    {
      customer: stripeCustomerId,
      usage: "off_session",
      automatic_payment_methods: { enabled: true },
      metadata: { customer_id: customerId, org_id: orgId, portal: "true" },
    },
    { stripeAccount: stripeAccountId }
  )

  const publishableKey = process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY
  if (!publishableKey) {
    return { error: "Stripe publishable key not configured" }
  }

  return {
    clientSecret: setupIntent.client_secret!,
    publishableKey,
    stripeAccount: stripeAccountId,
  }
}

// ---------------------------------------------------------------------------
// confirmPaymentMethodUpdate
// ---------------------------------------------------------------------------

/**
 * Saves a new default payment method for a customer after successful SetupIntent.
 *
 * Called by the payment method manager after stripe.confirmSetup() succeeds.
 * Updates autopay_method_id and enables AutoPay for the customer.
 */
export async function confirmPaymentMethodUpdate(
  orgId: string,
  customerId: string,
  paymentMethodId: string
): Promise<{ success: boolean; error?: string }> {
  try {
    await adminDb
      .update(customers)
      .set({
        autopay_method_id: paymentMethodId,
        autopay_enabled: true,
        updated_at: new Date(),
      })
      .where(and(eq(customers.id, customerId), eq(customers.org_id, orgId)))

    return { success: true }
  } catch (err) {
    console.error("[confirmPaymentMethodUpdate] Error:", err)
    return {
      success: false,
      error: err instanceof Error ? err.message : "Failed to update payment method",
    }
  }
}

// ---------------------------------------------------------------------------
// getCustomerPaymentMethods
// ---------------------------------------------------------------------------

/**
 * Lists saved payment methods for a customer from Stripe.
 *
 * Returns card and ACH bank account methods from the connected account.
 * Marks the customer's current autopay_method_id as the default.
 */
export async function getCustomerPaymentMethods(
  orgId: string,
  customerId: string
): Promise<PortalPaymentMethod[]> {
  const [settings] = await adminDb
    .select({
      stripe_account_id: orgSettings.stripe_account_id,
      stripe_onboarding_done: orgSettings.stripe_onboarding_done,
    })
    .from(orgSettings)
    .where(eq(orgSettings.org_id, orgId))
    .limit(1)

  if (!settings?.stripe_account_id || !settings.stripe_onboarding_done) {
    return []
  }

  const stripeAccountId = settings.stripe_account_id

  const [customer] = await adminDb
    .select({
      stripe_customer_id: customers.stripe_customer_id,
      autopay_method_id: customers.autopay_method_id,
    })
    .from(customers)
    .where(eq(customers.id, customerId))
    .limit(1)

  if (!customer?.stripe_customer_id) {
    return []
  }

  try {
    const stripe = getStripe()

    // Fetch card and bank account methods in parallel
    const [cardMethods, bankMethods] = await Promise.all([
      stripe.paymentMethods.list(
        { customer: customer.stripe_customer_id, type: "card" },
        { stripeAccount: stripeAccountId }
      ),
      stripe.paymentMethods.list(
        { customer: customer.stripe_customer_id, type: "us_bank_account" },
        { stripeAccount: stripeAccountId }
      ),
    ])

    const allMethods = [...cardMethods.data, ...bankMethods.data]

    return allMethods.map((pm): PortalPaymentMethod => {
      if (pm.type === "card" && pm.card) {
        return {
          id: pm.id,
          type: "card",
          last4: pm.card.last4,
          brand: pm.card.brand,
          exp_month: pm.card.exp_month,
          exp_year: pm.card.exp_year,
          isDefault: pm.id === customer.autopay_method_id,
        }
      } else if (pm.type === "us_bank_account" && pm.us_bank_account) {
        return {
          id: pm.id,
          type: "us_bank_account",
          last4: pm.us_bank_account.last4 ?? "0000",
          bank_name: pm.us_bank_account.bank_name ?? undefined,
          isDefault: pm.id === customer.autopay_method_id,
        }
      }
      // Fallback — should not happen for the types we request
      return {
        id: pm.id,
        type: "card",
        last4: "0000",
        isDefault: pm.id === customer.autopay_method_id,
      }
    })
  } catch (err) {
    console.error("[getCustomerPaymentMethods] Error:", err)
    return []
  }
}

// ---------------------------------------------------------------------------
// updateCustomerContactInfo
// ---------------------------------------------------------------------------

/**
 * Allows a customer to update their own contact details via the portal.
 *
 * Only allows updating `phone` and `email` — NOT name, address, or billing fields.
 * Uses adminDb because portal customers don't have a staff-role JWT.
 *
 * Security: validates orgId + customerId together to prevent cross-customer updates.
 */
export async function updateCustomerContactInfo(
  orgId: string,
  customerId: string,
  data: { phone?: string; email?: string }
): Promise<{ success: boolean; error?: string }> {
  if (!data.phone && !data.email) {
    return { success: false, error: "No fields to update" }
  }

  try {
    const updatePayload: Record<string, string | Date> = {
      updated_at: new Date(),
    }

    if (data.phone !== undefined) {
      updatePayload.phone = data.phone
    }

    if (data.email !== undefined) {
      updatePayload.email = data.email
    }

    await adminDb
      .update(customers)
      .set(updatePayload)
      .where(and(eq(customers.id, customerId), eq(customers.org_id, orgId)))

    return { success: true }
  } catch (err) {
    console.error("[updateCustomerContactInfo] Error:", err)
    return {
      success: false,
      error: err instanceof Error ? err.message : "Failed to update contact info",
    }
  }
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
