/**
 * src/app/api/quotes/[id]/pdf/route.ts — Authenticated PDF download route.
 *
 * Requires authentication (office/owner roles only).
 * Fetches quote data and generates a branded PDF via @react-pdf/renderer.
 *
 * GET /api/quotes/[id]/pdf
 * Returns: application/pdf with Content-Disposition attachment
 */

import { redirect } from "next/navigation"
import { createElement } from "react"
import { renderToBuffer } from "@react-pdf/renderer"
import { getCurrentUser } from "@/actions/auth"
import { adminDb } from "@/lib/db"
import {
  quotes,
  workOrders,
  workOrderLineItems,
  customers,
  orgSettings,
  orgs,
  profiles,
} from "@/lib/db/schema"
import { eq, and } from "drizzle-orm"
import { QuoteDocument } from "@/lib/pdf/quote-pdf"
import type { QuoteDocumentProps } from "@/lib/pdf/quote-pdf"

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  // ── Auth check ──────────────────────────────────────────────────────────
  const user = await getCurrentUser()
  if (!user) {
    redirect("/login")
  }

  // Office/owner only — techs don't generate quotes
  if (user.role !== "owner" && user.role !== "office") {
    return new Response("Forbidden", { status: 403 })
  }

  const { id } = await params

  try {
    // ── Fetch quote ──────────────────────────────────────────────────────
    const quoteRows = await adminDb
      .select()
      .from(quotes)
      .where(and(eq(quotes.id, id), eq(quotes.org_id, user.org_id)))
      .limit(1)

    const quote = quoteRows[0]
    if (!quote) {
      return new Response("Quote not found", { status: 404 })
    }

    // ── Fetch WO ──────────────────────────────────────────────────────────
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
    if (!wo) {
      return new Response("Work order not found", { status: 404 })
    }

    // ── Fetch customer ────────────────────────────────────────────────────
    const customerRows = await adminDb
      .select({
        full_name: customers.full_name,
        address: customers.address,
      })
      .from(customers)
      .where(eq(customers.id, wo.customer_id))
      .limit(1)

    const customer = customerRows[0]

    // ── Fetch org settings ───────────────────────────────────────────────
    const settingsRows = await adminDb
      .select({
        default_tax_rate: orgSettings.default_tax_rate,
        quote_terms_and_conditions: orgSettings.quote_terms_and_conditions,
      })
      .from(orgSettings)
      .where(eq(orgSettings.org_id, user.org_id))
      .limit(1)

    const settings = settingsRows[0]

    // ── Fetch org branding ───────────────────────────────────────────────
    const orgRows = await adminDb
      .select({ name: orgs.name, logo_url: orgs.logo_url })
      .from(orgs)
      .where(eq(orgs.id, user.org_id))
      .limit(1)

    const org = orgRows[0]
    const companyName = org?.name ?? "Pool Company"
    const companyLogoUrl = org?.logo_url ?? null

    // ── Fetch line items ──────────────────────────────────────────────────
    const lineItemRows = await adminDb
      .select()
      .from(workOrderLineItems)
      .where(eq(workOrderLineItems.work_order_id, wo.id))
      .orderBy(workOrderLineItems.sort_order)

    // ── Fetch flaggedBy tech name ─────────────────────────────────────────
    let flaggedByTechName: string | null = null
    if (wo.flagged_by_tech_id) {
      const techRows = await adminDb
        .select({ full_name: profiles.full_name })
        .from(profiles)
        .where(eq(profiles.id, wo.flagged_by_tech_id))
        .limit(1)
      flaggedByTechName = techRows[0]?.full_name ?? null
    }

    // ── Build PDF props ───────────────────────────────────────────────────
    const taxRate = parseFloat(settings?.default_tax_rate ?? "0.0875")

    const snapshotData =
      quote.snapshot_json as Record<string, unknown> | null
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
    const quoteDate = (quote.created_at ?? now).toLocaleDateString("en-US", {
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
      quoteNumber: quote.quote_number ?? id,
      quoteDate,
      expirationDate,
      companyName,
      companyLogoUrl,
      customerName: customer?.full_name ?? "Customer",
      propertyAddress: customer?.address ?? null,
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

    // ── Generate PDF ──────────────────────────────────────────────────────
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const buffer = await renderToBuffer(
      createElement(QuoteDocument, documentProps) as any
    )

    const filename = `quote-${quote.quote_number ?? id}.pdf`

    // Convert Node.js Buffer to Uint8Array for the Web Response API
    const uint8Array = new Uint8Array(buffer)

    return new Response(uint8Array, {
      status: 200,
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `attachment; filename="${filename}"`,
        "Cache-Control": "private, no-cache",
      },
    })
  } catch (err) {
    console.error("[GET /api/quotes/[id]/pdf] Error:", err)
    return new Response("Failed to generate PDF", { status: 500 })
  }
}
