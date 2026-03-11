"use server"

/**
 * quotes.ts — Quote CRUD, send, and versioning server actions.
 *
 * CRITICAL: All hex colors in PDF code — NOT oklch(). @react-pdf/renderer
 * uses a non-browser PDF renderer that does not support oklch.
 *
 * Pattern: PDF generation via renderToBuffer in a server action,
 * email delivery via Resend SDK directly (NOT Edge Function — PDF buffers
 * should not traverse the Edge Function boundary).
 */

import { revalidatePath } from "next/cache"
import { createClient } from "@/lib/supabase/server"
import { withRls, adminDb } from "@/lib/db"
import type { SupabaseToken } from "@/lib/db"
import {
  quotes,
  workOrders,
  workOrderLineItems,
  customers,
  orgSettings,
  orgs,
  profiles,
} from "@/lib/db/schema"
import { eq, and, desc, sql } from "drizzle-orm"
import { renderToBuffer } from "@react-pdf/renderer"
import { createElement } from "react"
import { QuoteDocument } from "@/lib/pdf/quote-pdf"
import type { QuoteDocumentProps } from "@/lib/pdf/quote-pdf"
import { QuoteEmail } from "@/lib/emails/quote-email"
import { render as renderEmail } from "@react-email/render"
import { signQuoteToken } from "@/lib/quotes/quote-token"
import { Resend } from "resend"

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface QuoteDetail {
  id: string
  org_id: string
  work_order_id: string
  quote_number: string | null
  version: number
  status: string
  expires_at: Date | null
  approved_at: Date | null
  declined_at: Date | null
  change_note: string | null
  snapshot_json: Record<string, unknown> | null
  sent_at: Date | null
  created_at: Date
  updated_at: Date
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
// createQuote
// ---------------------------------------------------------------------------

/**
 * Creates a new draft quote for a work order.
 *
 * Auto-generates quote_number using atomic increment of org_settings.next_quote_number.
 * Copies current WO line items into snapshot_json.
 * Sets version=1, status='draft'.
 * Sets expires_at from org default_quote_expiry_days.
 *
 * Returns the new quote id, or null on failure.
 */
export async function createQuote(
  workOrderId: string
): Promise<string | null> {
  const token = await getRlsToken()
  if (!token) return null

  const orgId = token.org_id as string
  const userId = token.sub

  const userRole = token.user_role as string | undefined
  if (!userRole || !["owner", "office"].includes(userRole)) {
    console.error("[createQuote] Insufficient permissions")
    return null
  }

  try {
    // ── 1. Fetch WO + line items (via withRls) ─────────────────────────────
    const woData = await withRls(token, async (db) => {
      const woRows = await db
        .select({
          id: workOrders.id,
          description: workOrders.description,
          flagged_by_tech_id: workOrders.flagged_by_tech_id,
        })
        .from(workOrders)
        .where(and(eq(workOrders.id, workOrderId), eq(workOrders.org_id, orgId)))
        .limit(1)

      const wo = woRows[0]
      if (!wo) return null

      const lineItemRows = await db
        .select()
        .from(workOrderLineItems)
        .where(eq(workOrderLineItems.work_order_id, workOrderId))
        .orderBy(workOrderLineItems.sort_order)

      return { wo, lineItems: lineItemRows }
    })

    if (!woData) {
      console.error("[createQuote] Work order not found")
      return null
    }

    // ── 2. Fetch org settings via adminDb ──────────────────────────────────
    const settingsRows = await adminDb
      .select({
        default_quote_expiry_days: orgSettings.default_quote_expiry_days,
        default_tax_rate: orgSettings.default_tax_rate,
        quote_terms_and_conditions: orgSettings.quote_terms_and_conditions,
        quote_number_prefix: orgSettings.quote_number_prefix,
      })
      .from(orgSettings)
      .where(eq(orgSettings.org_id, orgId))
      .limit(1)

    const settings = settingsRows[0]

    // ── 3. Atomic increment of next_quote_number via adminDb ───────────────
    // org_settings UPDATE RLS requires owner role; adminDb bypasses RLS
    // so office staff can also create quotes.
    // Returns the OLD value (before increment) — that's the number to use.
    const incrementedRows = await adminDb
      .update(orgSettings)
      .set({
        next_quote_number: sql`next_quote_number + 1`,
        updated_at: new Date(),
      })
      .where(eq(orgSettings.org_id, orgId))
      .returning({ next_quote_number: orgSettings.next_quote_number })

    // After increment, next_quote_number is now N+1. The number we assigned
    // was N (before increment). Since we incremented first and returned after,
    // the returned value is N+1, so the assigned number is (N+1) - 1 = N.
    const assignedNum = (incrementedRows[0]?.next_quote_number ?? 2) - 1
    const prefix = settings?.quote_number_prefix ?? "Q"
    const quoteNumber = `${prefix}-${String(assignedNum).padStart(4, "0")}`

    // ── 4. Calculate expires_at ────────────────────────────────────────────
    const expiryDays = settings?.default_quote_expiry_days ?? 30
    const expiresAt = new Date()
    expiresAt.setDate(expiresAt.getDate() + expiryDays)

    // ── 5. Build snapshot_json from current line items ─────────────────────
    const snapshotJson: Record<string, unknown> = {
      scope_of_work: woData.wo.description ?? "",
      tax_rate: settings?.default_tax_rate ?? "0.0875",
      terms: settings?.quote_terms_and_conditions ?? null,
      line_items: woData.lineItems.map((li) => ({
        id: li.id,
        description: li.description,
        item_type: li.item_type,
        quantity: li.quantity,
        unit: li.unit,
        unit_price: li.unit_price,
        is_taxable: li.is_taxable,
        is_optional: li.is_optional,
      })),
    }

    // ── 6. Insert quote record (withRls) ──────────────────────────────────
    const quoteId = await withRls(token, async (db) => {
      const inserted = await db
        .insert(quotes)
        .values({
          org_id: orgId,
          work_order_id: workOrderId,
          quote_number: quoteNumber,
          version: 1,
          status: "draft",
          expires_at: expiresAt,
          snapshot_json: snapshotJson,
          created_at: new Date(),
          updated_at: new Date(),
        })
        .returning({ id: quotes.id })

      return inserted[0]?.id ?? null
    })

    if (quoteId) {
      // Log quote_created activity on the WO
      await withRls(token, async (db) => {
        await db
          .update(workOrders)
          .set({
            activity_log: sql`COALESCE(activity_log, '[]'::jsonb) || ${JSON.stringify([{
              type: "quote_created",
              at: new Date().toISOString(),
              by_id: userId,
              note: quoteNumber,
            }])}::jsonb`,
            updated_at: new Date(),
          })
          .where(eq(workOrders.id, workOrderId))
      })
    }

    revalidatePath(`/work-orders/${workOrderId}`)
    revalidatePath("/work-orders")
    return quoteId
  } catch (err) {
    console.error("[createQuote] Error:", err)
    return null
  }
}

// ---------------------------------------------------------------------------
// sendQuote
// ---------------------------------------------------------------------------

/**
 * Sends a quote to the customer via email with PDF attachment.
 *
 * Flow:
 * 1. Fetch quote + WO + customer + org data
 * 2. Build QuoteDocumentProps
 * 3. renderToBuffer(<QuoteDocument />) — PDF generation
 * 4. signQuoteToken(quoteId) — approval link token
 * 5. Render email HTML via @react-email/render
 * 6. Send via Resend SDK with PDF attachment
 * 7. Update quote: status='sent', sent_at=now
 * 8. Update WO status to 'quoted', append activity_log event: 'quote_sent'
 */
export async function sendQuote(
  quoteId: string
): Promise<{ success: boolean; error?: string }> {
  const token = await getRlsToken()
  if (!token) return { success: false, error: "Not authenticated" }

  const orgId = token.org_id as string
  const userId = token.sub

  const userRole = token.user_role as string | undefined
  if (!userRole || !["owner", "office"].includes(userRole)) {
    return { success: false, error: "Insufficient permissions" }
  }

  try {
    // ── 1. Fetch quote + WO + customer + org data via adminDb ──────────────
    const quoteRows = await adminDb
      .select()
      .from(quotes)
      .where(and(eq(quotes.id, quoteId), eq(quotes.org_id, orgId)))
      .limit(1)

    const quote = quoteRows[0]
    if (!quote) return { success: false, error: "Quote not found" }

    const woRows = await adminDb
      .select({
        id: workOrders.id,
        customer_id: workOrders.customer_id,
        title: workOrders.title,
        description: workOrders.description,
        flagged_by_tech_id: workOrders.flagged_by_tech_id,
        tax_exempt: workOrders.tax_exempt,
        discount_type: workOrders.discount_type,
        discount_value: workOrders.discount_value,
      })
      .from(workOrders)
      .where(eq(workOrders.id, quote.work_order_id))
      .limit(1)

    const wo = woRows[0]
    if (!wo) return { success: false, error: "Work order not found" }

    const customerRows = await adminDb
      .select({
        id: customers.id,
        full_name: customers.full_name,
        email: customers.email,
        address: customers.address,
      })
      .from(customers)
      .where(eq(customers.id, wo.customer_id))
      .limit(1)

    const customer = customerRows[0]
    if (!customer) return { success: false, error: "Customer not found" }
    if (!customer.email) {
      return { success: false, error: "Customer has no email address on file" }
    }

    const settingsRows = await adminDb
      .select({
        quote_terms_and_conditions: orgSettings.quote_terms_and_conditions,
        default_tax_rate: orgSettings.default_tax_rate,
      })
      .from(orgSettings)
      .where(eq(orgSettings.org_id, orgId))
      .limit(1)

    const settings = settingsRows[0]

    const orgRows = await adminDb
      .select({ name: orgs.name, logo_url: orgs.logo_url })
      .from(orgs)
      .where(eq(orgs.id, orgId))
      .limit(1)

    const org = orgRows[0]
    const companyName = org?.name ?? "Pool Company"
    const companyLogoUrl = org?.logo_url ?? null

    const lineItemRows = await adminDb
      .select()
      .from(workOrderLineItems)
      .where(eq(workOrderLineItems.work_order_id, wo.id))
      .orderBy(workOrderLineItems.sort_order)

    // Fetch flaggedBy tech name if applicable
    let flaggedByTechName: string | null = null
    if (wo.flagged_by_tech_id) {
      const techRows = await adminDb
        .select({ full_name: profiles.full_name })
        .from(profiles)
        .where(eq(profiles.id, wo.flagged_by_tech_id))
        .limit(1)
      flaggedByTechName = techRows[0]?.full_name ?? null
    }

    // ── 2. Build QuoteDocumentProps ────────────────────────────────────────
    const taxRate = parseFloat(settings?.default_tax_rate ?? "0.0875")

    // Use snapshot_json scope_of_work if set; fall back to WO description
    const snapshotData = quote.snapshot_json as Record<string, unknown> | null
    const scopeOfWork =
      (snapshotData?.scope_of_work as string | undefined) ??
      wo.description ??
      wo.title

    const pdfLineItems = lineItemRows.map((li) => {
      const qty = parseFloat(li.quantity ?? "1")
      const unitPrice = parseFloat(li.unit_price ?? "0")
      const total = qty * unitPrice
      return {
        description: li.description,
        quantity: qty,
        unit: li.unit ?? "each",
        unitPrice,
        total,
        isOptional: li.is_optional,
        isTaxable: li.is_taxable,
      }
    })

    const subtotal = pdfLineItems.reduce((sum, li) => sum + li.total, 0)

    // Apply WO-level discount
    let discountAmount: number | null = null
    if (wo.discount_type && wo.discount_value) {
      const discVal = parseFloat(wo.discount_value)
      if (wo.discount_type === "percent") {
        discountAmount = subtotal * (discVal / 100)
      } else {
        discountAmount = discVal
      }
    }

    const discountedSubtotal = discountAmount
      ? subtotal - discountAmount
      : subtotal

    const taxableSubtotal = pdfLineItems
      .filter((li) => li.isTaxable)
      .reduce((sum, li) => sum + li.total, 0)

    const isTaxExempt = wo.tax_exempt
    const taxAmount = isTaxExempt ? 0 : taxableSubtotal * taxRate
    const grandTotal = discountedSubtotal + taxAmount

    const now = new Date()
    const quoteDate = now.toLocaleDateString("en-US", {
      year: "numeric",
      month: "long",
      day: "numeric",
    })
    const expirationDate = quote.expires_at
      ? quote.expires_at.toLocaleDateString("en-US", {
          year: "numeric",
          month: "long",
          day: "numeric",
        })
      : "No expiration"

    const documentProps: QuoteDocumentProps = {
      quoteNumber: quote.quote_number ?? quoteId,
      quoteDate,
      expirationDate,
      companyName,
      companyLogoUrl,
      customerName: customer.full_name,
      propertyAddress: customer.address ?? null,
      scopeOfWork,
      lineItems: pdfLineItems,
      subtotal,
      taxRate,
      taxAmount,
      discountAmount,
      grandTotal,
      termsAndConditions: settings?.quote_terms_and_conditions ?? null,
      flaggedByTechName,
    }

    // ── 3. Generate PDF buffer ─────────────────────────────────────────────
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const pdfBuffer = await renderToBuffer(
      createElement(QuoteDocument, documentProps) as any
    )

    // ── 4. Sign approval token ─────────────────────────────────────────────
    const approvalToken = await signQuoteToken(quoteId)
    const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? "https://app.poolco.app"
    const approvalUrl = `${appUrl}/quote/${approvalToken}`

    // ── 5. Render email HTML ──────────────────────────────────────────────
    const totalFormatted = new Intl.NumberFormat("en-US", {
      style: "currency",
      currency: "USD",
    }).format(grandTotal)

    const emailHtml = await renderEmail(
      createElement(QuoteEmail, {
        companyName,
        customerName: customer.full_name,
        quoteNumber: quote.quote_number ?? quoteId,
        quoteTotal: totalFormatted,
        expirationDate,
        approvalUrl,
        scopeOfWork,
      })
    )

    // ── 6. Send via Resend SDK ─────────────────────────────────────────────
    const resendApiKey = process.env.RESEND_API_KEY
    if (!resendApiKey) {
      return { success: false, error: "RESEND_API_KEY not configured" }
    }

    const resend = new Resend(resendApiKey)

    const { error: resendError } = await resend.emails.send({
      from: `${companyName} <quotes@poolco.app>`,
      to: [customer.email],
      subject: `Quote #${quote.quote_number ?? quoteId} from ${companyName}`,
      html: emailHtml,
      attachments: [
        {
          filename: `quote-${quote.quote_number ?? quoteId}.pdf`,
          content: Buffer.from(pdfBuffer).toString("base64"),
        },
      ],
    })

    if (resendError) {
      console.error("[sendQuote] Resend error:", resendError)
      return {
        success: false,
        error: `Email delivery failed: ${resendError.message}`,
      }
    }

    // ── 7. Update quote: status='sent', sent_at=now ───────────────────────
    await withRls(token, async (db) => {
      await db
        .update(quotes)
        .set({
          status: "sent",
          sent_at: now,
          updated_at: now,
          snapshot_json: {
            ...(snapshotData ?? {}),
            scope_of_work: scopeOfWork,
            sent_total: grandTotal,
            sent_tax_rate: taxRate,
            sent_line_items: pdfLineItems,
          } as Record<string, unknown>,
        })
        .where(eq(quotes.id, quoteId))
    })

    // ── 8. Update WO status to 'quoted' + append activity log ─────────────
    await withRls(token, async (db) => {
      await db
        .update(workOrders)
        .set({
          status: "quoted",
          updated_at: now,
          activity_log: sql`COALESCE(activity_log, '[]'::jsonb) || ${JSON.stringify([{
            type: "quote_sent",
            at: now.toISOString(),
            by_id: userId,
            note: `Quote #${quote.quote_number ?? quoteId} sent to ${customer.email}`,
          }])}::jsonb`,
        })
        .where(eq(workOrders.id, wo.id))
    })

    revalidatePath(`/work-orders/${wo.id}`)
    revalidatePath("/work-orders")

    return { success: true }
  } catch (err) {
    console.error("[sendQuote] Error:", err)
    return {
      success: false,
      error: err instanceof Error ? err.message : "Failed to send quote",
    }
  }
}

// ---------------------------------------------------------------------------
// reviseQuote
// ---------------------------------------------------------------------------

/**
 * Creates a new version of a sent/declined/changes_requested quote.
 *
 * - Marks the current quote as 'superseded'
 * - Creates a new quote row with version incremented, status='draft'
 * - Office edits line items on the WO, then calls sendQuote again
 *
 * Returns the new quote id.
 */
export async function reviseQuote(
  quoteId: string
): Promise<{ success: boolean; newQuoteId?: string; error?: string }> {
  const token = await getRlsToken()
  if (!token) return { success: false, error: "Not authenticated" }

  const orgId = token.org_id as string

  const userRole = token.user_role as string | undefined
  if (!userRole || !["owner", "office"].includes(userRole)) {
    return { success: false, error: "Insufficient permissions" }
  }

  try {
    const currentQuoteRows = await withRls(token, async (db) =>
      db
        .select()
        .from(quotes)
        .where(and(eq(quotes.id, quoteId), eq(quotes.org_id, orgId)))
        .limit(1)
    )

    const currentQuote = currentQuoteRows[0]
    if (!currentQuote) return { success: false, error: "Quote not found" }

    const revisableStatuses = ["sent", "declined", "changes_requested", "expired"]
    if (!revisableStatuses.includes(currentQuote.status)) {
      return {
        success: false,
        error: `Cannot revise a quote with status '${currentQuote.status}'`,
      }
    }

    const now = new Date()

    // Mark current quote as superseded
    await withRls(token, async (db) => {
      await db
        .update(quotes)
        .set({ status: "superseded", updated_at: now })
        .where(eq(quotes.id, quoteId))
    })

    // Create new version with incremented version number
    const newVersion = (currentQuote.version ?? 1) + 1

    const newQuoteId = await withRls(token, async (db) => {
      const inserted = await db
        .insert(quotes)
        .values({
          org_id: orgId,
          work_order_id: currentQuote.work_order_id,
          quote_number: currentQuote.quote_number, // same quote number, new version
          version: newVersion,
          status: "draft",
          expires_at: currentQuote.expires_at,
          // Snapshot from prior version preserved for version history
          snapshot_json: currentQuote.snapshot_json as Record<string, unknown> | null,
          change_note: null, // office fills this in
          created_at: now,
          updated_at: now,
        })
        .returning({ id: quotes.id })

      return inserted[0]?.id ?? null
    })

    if (!newQuoteId) {
      return { success: false, error: "Failed to create revised quote" }
    }

    revalidatePath(`/work-orders/${currentQuote.work_order_id}`)
    revalidatePath("/work-orders")

    return { success: true, newQuoteId }
  } catch (err) {
    console.error("[reviseQuote] Error:", err)
    return {
      success: false,
      error: err instanceof Error ? err.message : "Failed to revise quote",
    }
  }
}

// ---------------------------------------------------------------------------
// extendQuote
// ---------------------------------------------------------------------------

/**
 * Extends the expiration date of an expired (or any) quote.
 * Resets status to 'sent' if it was 'expired'.
 */
export async function extendQuote(
  quoteId: string,
  newExpirationDate: Date
): Promise<{ success: boolean; error?: string }> {
  const token = await getRlsToken()
  if (!token) return { success: false, error: "Not authenticated" }

  const orgId = token.org_id as string

  const userRole = token.user_role as string | undefined
  if (!userRole || !["owner", "office"].includes(userRole)) {
    return { success: false, error: "Insufficient permissions" }
  }

  try {
    const quoteRows = await withRls(token, async (db) =>
      db
        .select({ id: quotes.id, status: quotes.status })
        .from(quotes)
        .where(and(eq(quotes.id, quoteId), eq(quotes.org_id, orgId)))
        .limit(1)
    )

    const quote = quoteRows[0]
    if (!quote) return { success: false, error: "Quote not found" }

    // Reset to 'sent' if was 'expired'
    const newStatus = quote.status === "expired" ? "sent" : quote.status

    await withRls(token, async (db) => {
      await db
        .update(quotes)
        .set({
          expires_at: newExpirationDate,
          status: newStatus,
          updated_at: new Date(),
        })
        .where(eq(quotes.id, quoteId))
    })

    revalidatePath("/work-orders")

    return { success: true }
  } catch (err) {
    console.error("[extendQuote] Error:", err)
    return {
      success: false,
      error: err instanceof Error ? err.message : "Failed to extend quote",
    }
  }
}

// ---------------------------------------------------------------------------
// getQuotesForWorkOrder
// ---------------------------------------------------------------------------

/**
 * Fetches all quotes for a work order, ordered by version desc (latest first).
 */
export async function getQuotesForWorkOrder(
  workOrderId: string
): Promise<QuoteDetail[]> {
  const token = await getRlsToken()
  if (!token) return []

  try {
    const rows = await withRls(token, async (db) =>
      db
        .select()
        .from(quotes)
        .where(eq(quotes.work_order_id, workOrderId))
        .orderBy(desc(quotes.version))
    )

    return rows as QuoteDetail[]
  } catch (err) {
    console.error("[getQuotesForWorkOrder] Error:", err)
    return []
  }
}

// ---------------------------------------------------------------------------
// updateQuoteDraft
// ---------------------------------------------------------------------------

/**
 * Updates a draft quote's scope_of_work, expiration, terms, or change_note.
 * Only works on quotes in 'draft' status.
 */
export async function updateQuoteDraft(
  quoteId: string,
  updates: {
    scopeOfWork?: string
    expiresAt?: Date
    terms?: string
    changeNote?: string
  }
): Promise<{ success: boolean; error?: string }> {
  const token = await getRlsToken()
  if (!token) return { success: false, error: "Not authenticated" }

  const orgId = token.org_id as string

  const userRole = token.user_role as string | undefined
  if (!userRole || !["owner", "office"].includes(userRole)) {
    return { success: false, error: "Insufficient permissions" }
  }

  try {
    const quoteRows = await withRls(token, async (db) =>
      db
        .select()
        .from(quotes)
        .where(and(eq(quotes.id, quoteId), eq(quotes.org_id, orgId)))
        .limit(1)
    )

    const quote = quoteRows[0]
    if (!quote) return { success: false, error: "Quote not found" }

    if (quote.status !== "draft") {
      return { success: false, error: "Only draft quotes can be updated" }
    }

    // Merge scope_of_work and terms into snapshot_json
    const currentSnapshot =
      (quote.snapshot_json as Record<string, unknown> | null) ?? {}
    const newSnapshot: Record<string, unknown> = {
      ...currentSnapshot,
      ...(updates.scopeOfWork !== undefined && {
        scope_of_work: updates.scopeOfWork,
      }),
      ...(updates.terms !== undefined && { terms: updates.terms }),
    }

    await withRls(token, async (db) => {
      await db
        .update(quotes)
        .set({
          ...(updates.expiresAt !== undefined && {
            expires_at: updates.expiresAt,
          }),
          ...(updates.changeNote !== undefined && {
            change_note: updates.changeNote,
          }),
          snapshot_json: newSnapshot,
          updated_at: new Date(),
        })
        .where(eq(quotes.id, quoteId))
    })

    revalidatePath("/work-orders")

    return { success: true }
  } catch (err) {
    console.error("[updateQuoteDraft] Error:", err)
    return {
      success: false,
      error: err instanceof Error ? err.message : "Failed to update quote",
    }
  }
}
