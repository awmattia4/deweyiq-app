/**
 * src/app/api/invoices/[id]/pdf/route.ts — Authenticated invoice PDF download route.
 *
 * Requires authentication (office/owner roles only).
 * Fetches invoice data via adminDb and generates a branded PDF.
 *
 * GET /api/invoices/[id]/pdf
 * Returns: application/pdf with Content-Disposition attachment
 */

import { redirect } from "next/navigation"
import { createElement } from "react"
import { renderToBuffer } from "@react-pdf/renderer"
import { getCurrentUser } from "@/actions/auth"
import { adminDb } from "@/lib/db"
import {
  invoices,
  invoiceLineItems,
  customers,
  orgSettings,
  orgs,
  workOrders,
} from "@/lib/db/schema"
import { eq, and, inArray } from "drizzle-orm"
import { InvoiceDocument } from "@/lib/pdf/invoice-pdf"
import type { InvoiceDocumentProps } from "@/lib/pdf/invoice-pdf"

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  // ── Auth check ──────────────────────────────────────────────────────────
  const user = await getCurrentUser()
  if (!user) {
    redirect("/login")
  }

  // Office/owner only — techs don't access invoices
  if (user.role !== "owner" && user.role !== "office") {
    return new Response("Forbidden", { status: 403 })
  }

  const { id } = await params

  try {
    // ── Fetch invoice ──────────────────────────────────────────────────
    const invoiceRows = await adminDb
      .select()
      .from(invoices)
      .where(and(eq(invoices.id, id), eq(invoices.org_id, user.org_id)))
      .limit(1)

    const invoice = invoiceRows[0]
    if (!invoice) {
      return new Response("Invoice not found", { status: 404 })
    }

    // ── Fetch line items ──────────────────────────────────────────────
    const lineItemRows = await adminDb
      .select()
      .from(invoiceLineItems)
      .where(eq(invoiceLineItems.invoice_id, id))
      .orderBy(invoiceLineItems.sort_order)

    // ── Fetch customer ────────────────────────────────────────────────
    const customerRows = await adminDb
      .select({
        full_name: customers.full_name,
        address: customers.address,
        tax_exempt: customers.tax_exempt,
      })
      .from(customers)
      .where(eq(customers.id, invoice.customer_id))
      .limit(1)

    const customer = customerRows[0]

    // ── Fetch org settings ───────────────────────────────────────────
    const settingsRows = await adminDb
      .select({
        default_tax_rate: orgSettings.default_tax_rate,
      })
      .from(orgSettings)
      .where(eq(orgSettings.org_id, user.org_id))
      .limit(1)

    const settings = settingsRows[0]
    const taxRate = parseFloat(settings?.default_tax_rate ?? "0.0875")

    // ── Fetch org branding ───────────────────────────────────────────
    const orgRows = await adminDb
      .select({ name: orgs.name, logo_url: orgs.logo_url })
      .from(orgs)
      .where(eq(orgs.id, user.org_id))
      .limit(1)

    const org = orgRows[0]
    const companyName = org?.name ?? "Pool Company"
    const companyLogoUrl = org?.logo_url ?? null

    // ── Fetch WO titles for references ────────────────────────────────
    const woIds = (invoice.work_order_ids as string[] | null) ?? []
    let workOrderNumbers: string[] = []
    if (woIds.length > 0) {
      const woRows = await adminDb
        .select({ id: workOrders.id, title: workOrders.title })
        .from(workOrders)
        .where(inArray(workOrders.id, woIds))
      workOrderNumbers = woRows.map((wo) => wo.title)
    }

    // ── Build PDF props ───────────────────────────────────────────────
    const taxExempt = customer?.tax_exempt ?? false

    const pdfLineItems = lineItemRows.map((li) => {
      const qty = parseFloat(li.quantity ?? "1")
      const unitPrice = parseFloat(li.unit_price ?? "0")
      const lineTotal = parseFloat(li.line_total ?? "0")
      return {
        description: li.description,
        quantity: qty,
        unit: li.unit ?? "each",
        unitPrice,
        lineTotal,
        isTaxable: li.is_taxable,
      }
    })

    const subtotal = parseFloat(invoice.subtotal ?? "0")
    const taxAmount = taxExempt ? 0 : parseFloat(invoice.tax_amount ?? "0")
    const discountAmount = parseFloat(invoice.discount_amount ?? "0")
    const total = parseFloat(invoice.total ?? "0")

    const invoiceDate = (invoice.issued_at ?? invoice.created_at).toLocaleDateString(
      "en-US",
      {
        year: "numeric",
        month: "long",
        day: "numeric",
      }
    )

    const documentProps: InvoiceDocumentProps = {
      invoiceNumber: invoice.invoice_number ?? id,
      invoiceDate,
      companyName,
      companyLogoUrl,
      customerName: customer?.full_name ?? "Customer",
      customerAddress: customer?.address ?? null,
      lineItems: pdfLineItems,
      subtotal,
      taxRate,
      taxAmount,
      discountAmount,
      total,
      notes: invoice.notes,
      workOrderNumbers,
      taxExempt,
    }

    // ── Generate PDF ──────────────────────────────────────────────────
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const buffer = await renderToBuffer(
      createElement(InvoiceDocument, documentProps) as any
    )

    const filename = `invoice-${invoice.invoice_number ?? id}.pdf`

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
    console.error("[GET /api/invoices/[id]/pdf] Error:", err)
    return new Response("Failed to generate PDF", { status: 500 })
  }
}
