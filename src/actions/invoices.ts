"use server"

/**
 * invoices.ts — Invoice CRUD, preparation, finalization, delivery, and multi-WO invoicing.
 *
 * CRITICAL: All hex colors in PDF code — NOT oklch(). @react-pdf/renderer
 * uses a non-browser PDF renderer that does not support oklch.
 *
 * Key patterns:
 * - prepareInvoice: creates draft invoice from completed WO with copied line items
 * - addWorkOrderToInvoice: multi-WO invoicing support
 * - finalizeInvoice: atomic invoice number generation via adminDb
 * - sendInvoice: email (with PDF) + SMS delivery via Resend and Twilio Edge Function
 * - sendAllInvoices: batch send for bulk-generated invoices
 * - withRls for all user-facing queries; adminDb only for atomic counter
 */

import { revalidatePath } from "next/cache"
import { createClient } from "@/lib/supabase/server"
import { withRls, adminDb } from "@/lib/db"
import type { SupabaseToken } from "@/lib/db"
import {
  invoices,
  invoiceLineItems,
  workOrders,
  workOrderLineItems,
  customers,
  orgSettings,
  orgs,
} from "@/lib/db/schema"
import { eq, and, inArray, desc, sql, isNull } from "drizzle-orm"
import { updateWorkOrderStatus } from "@/actions/work-orders"
import { renderToBuffer } from "@react-pdf/renderer"
import { createElement } from "react"
import { InvoiceDocument } from "@/lib/pdf/invoice-pdf"
import type { InvoiceDocumentProps } from "@/lib/pdf/invoice-pdf"
import { InvoiceEmail } from "@/lib/emails/invoice-email"
import { render as renderEmail } from "@react-email/render"
import { signPayToken } from "@/lib/pay-token"
import { Resend } from "resend"
import { syncInvoiceToQbo } from "@/actions/qbo-sync"
import { getResolvedTemplate } from "@/actions/notification-templates"
import { createInvoiceJournalEntry, createRefundJournalEntry } from "@/lib/accounting/journal"
import { toLocalDateString } from "@/lib/date-utils"

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface InvoiceLineItemDetail {
  id: string
  org_id: string
  invoice_id: string
  description: string
  item_type: string
  quantity: string
  unit: string
  unit_price: string
  discount_type: string | null
  discount_value: string | null
  is_taxable: boolean
  line_total: string
  sort_order: number
  created_at: Date
}

export interface InvoiceDetail {
  id: string
  org_id: string
  invoice_number: string | null
  status: string
  work_order_ids: string[] | null
  customer_id: string
  subtotal: string
  tax_amount: string
  discount_amount: string
  total: string
  notes: string | null
  issued_at: Date | null
  paid_at: Date | null
  created_at: Date
  updated_at: Date
  // Joined
  customerName: string
  customerEmail: string | null
  customerAddress: string | null
  taxExempt: boolean
  lineItems: InvoiceLineItemDetail[]
  // Work order references
  workOrderTitles: string[]
  // Credit card surcharge (if applicable)
  surcharge_amount?: string | null
  due_date?: Date | null
  billing_period_start?: Date | null
  billing_period_end?: Date | null
  autopay_id?: string | null
  // Billing model for the invoice (per_stop | flat_rate | plus_chemicals | custom)
  billing_model?: string | null
  // Delivery timestamps
  sent_at?: Date | null
  sent_sms_at?: Date | null
  // Payment details
  payment_method?: string | null
}

export interface InvoiceSummary {
  id: string
  org_id: string
  invoice_number: string | null
  status: string
  customer_id: string
  customerName: string
  subtotal: string
  total: string
  created_at: Date
  issued_at: Date | null
  paid_at: Date | null
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
// Totals calculation helper
// ---------------------------------------------------------------------------

interface TotalsInput {
  lineItems: Array<{
    quantity: string
    unit_price: string
    discount_type: string | null
    discount_value: string | null
    is_taxable: boolean
  }>
  taxRate: number
  taxExempt: boolean
  discountAmount?: number
}

function calculateTotals(input: TotalsInput) {
  const { lineItems, taxRate, taxExempt, discountAmount: orderDiscount = 0 } = input

  let subtotal = 0
  let taxableSubtotal = 0

  for (const li of lineItems) {
    const qty = parseFloat(li.quantity) || 0
    const unitPrice = parseFloat(li.unit_price) || 0
    let lineTotal = qty * unitPrice

    // Apply per-line discount
    if (li.discount_type && li.discount_value) {
      const discVal = parseFloat(li.discount_value) || 0
      if (li.discount_type === "percent") {
        lineTotal = lineTotal * (1 - discVal / 100)
      } else {
        lineTotal = Math.max(0, lineTotal - discVal)
      }
    }

    subtotal += lineTotal
    if (li.is_taxable) {
      taxableSubtotal += lineTotal
    }
  }

  const discountedSubtotal = Math.max(0, subtotal - orderDiscount)

  // Adjust taxable amount by the ratio of discount applied
  const discountRatio = subtotal > 0 ? orderDiscount / subtotal : 0
  const adjustedTaxable = taxableSubtotal * (1 - discountRatio)

  const taxAmount = taxExempt ? 0 : adjustedTaxable * taxRate
  const total = discountedSubtotal + taxAmount

  return {
    subtotal: subtotal.toFixed(2),
    tax_amount: taxAmount.toFixed(2),
    discount_amount: orderDiscount.toFixed(2),
    total: total.toFixed(2),
  }
}

// ---------------------------------------------------------------------------
// prepareInvoice
// ---------------------------------------------------------------------------

/**
 * Creates a draft invoice from a completed work order.
 *
 * - Validates WO is in 'complete' status
 * - Copies WO line items to invoice_line_items with calculated line_total
 * - Calculates: subtotal, tax_amount (respects tax_exempt), discount_amount, total
 * - Returns invoice id, or null on failure
 */
export async function prepareInvoice(
  workOrderId: string
): Promise<string | null> {
  const token = await getRlsToken()
  if (!token) return null

  const orgId = token.org_id as string

  const userRole = token.user_role as string | undefined
  if (!userRole || !["owner", "office"].includes(userRole)) {
    console.error("[prepareInvoice] Insufficient permissions")
    return null
  }

  try {
    // ── 1. Fetch WO with line items (via withRls) ──────────────────────────
    const woData = await withRls(token, async (db) => {
      const woRows = await db
        .select({
          id: workOrders.id,
          customer_id: workOrders.customer_id,
          status: workOrders.status,
          title: workOrders.title,
          tax_exempt: workOrders.tax_exempt,
          discount_type: workOrders.discount_type,
          discount_value: workOrders.discount_value,
          labor_hours: workOrders.labor_hours,
          labor_rate: workOrders.labor_rate,
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
      console.error("[prepareInvoice] Work order not found")
      return null
    }

    if (woData.wo.status !== "complete") {
      console.error("[prepareInvoice] Work order is not in 'complete' status")
      return null
    }

    // ── 2. Fetch org settings for tax rate via adminDb ─────────────────────
    const settingsRows = await adminDb
      .select({
        default_tax_rate: orgSettings.default_tax_rate,
      })
      .from(orgSettings)
      .where(eq(orgSettings.org_id, orgId))
      .limit(1)

    const settings = settingsRows[0]
    const taxRate = parseFloat(settings?.default_tax_rate ?? "0.0875")
    const taxExempt = woData.wo.tax_exempt

    // ── 2b. Compute WO-level labor ──────────────────────────────────────────
    const laborHours = parseFloat(woData.wo.labor_hours ?? "0") || 0
    const laborRateVal = parseFloat(woData.wo.labor_rate ?? "0") || 0
    const laborCost = laborHours * laborRateVal

    // ── 3. Calculate WO-level discount ────────────────────────────────────
    let orderDiscountAmount = 0
    if (woData.wo.discount_type && woData.wo.discount_value) {
      const discVal = parseFloat(woData.wo.discount_value) || 0
      if (woData.wo.discount_type === "percent") {
        const raw = woData.lineItems.reduce((sum, li) => {
          const qty = parseFloat(li.quantity) || 0
          const price = parseFloat(li.unit_price ?? "0") || 0
          return sum + qty * price
        }, 0)
        orderDiscountAmount = (raw + laborCost) * (discVal / 100)
      } else {
        orderDiscountAmount = discVal
      }
    }

    // ── 4. Prepare line items data (includes labor as a line item for invoice) ──
    const allLineItemsForCalc: Array<{
      quantity: string
      unit_price: string
      discount_type: string | null
      discount_value: string | null
      is_taxable: boolean
    }> = woData.lineItems.map((li) => ({
      quantity: li.quantity ?? "1",
      unit_price: li.unit_price ?? "0",
      discount_type: li.discount_type,
      discount_value: li.discount_value,
      is_taxable: li.is_taxable,
    }))

    // Add WO-level labor as a virtual line item for totals calculation
    if (laborCost > 0) {
      allLineItemsForCalc.push({
        quantity: String(laborHours),
        unit_price: String(laborRateVal),
        discount_type: null,
        discount_value: null,
        is_taxable: false, // labor is not taxable
      })
    }

    // ── 5. Calculate totals ────────────────────────────────────────────────
    const totals = calculateTotals({
      lineItems: allLineItemsForCalc,
      taxRate,
      taxExempt,
      discountAmount: orderDiscountAmount,
    })

    // ── 6. Create invoice + line items (withRls) ──────────────────────────
    const invoiceId = await withRls(token, async (db) => {
      const inserted = await db
        .insert(invoices)
        .values({
          org_id: orgId,
          customer_id: woData.wo.customer_id,
          status: "draft",
          work_order_ids: [workOrderId],
          subtotal: totals.subtotal,
          tax_amount: totals.tax_amount,
          discount_amount: totals.discount_amount,
          total: totals.total,
          created_at: new Date(),
          updated_at: new Date(),
        })
        .returning({ id: invoices.id })

      const newInvoiceId = inserted[0]?.id
      if (!newInvoiceId) return null

      // Build invoice line items from WO line items
      const invoiceLineItemValues = woData.lineItems.map((li, idx) => {
        const qty = parseFloat(li.quantity ?? "1") || 0
        const unitPrice = parseFloat(li.unit_price ?? "0") || 0
        let lineTotal = qty * unitPrice

        // Apply per-line discount
        if (li.discount_type && li.discount_value) {
          const discVal = parseFloat(li.discount_value) || 0
          if (li.discount_type === "percent") {
            lineTotal = lineTotal * (1 - discVal / 100)
          } else {
            lineTotal = Math.max(0, lineTotal - discVal)
          }
        }

        return {
          org_id: orgId,
          invoice_id: newInvoiceId,
          description: li.description,
          item_type: li.item_type ?? "part",
          quantity: li.quantity ?? "1",
          unit: li.unit ?? "each",
          unit_price: li.unit_price ?? "0",
          discount_type: li.discount_type,
          discount_value: li.discount_value,
          is_taxable: li.is_taxable,
          line_total: lineTotal.toFixed(2),
          sort_order: idx,
          created_at: new Date(),
        }
      })

      // Add WO-level labor as an invoice line item
      if (laborCost > 0) {
        invoiceLineItemValues.push({
          org_id: orgId,
          invoice_id: newInvoiceId,
          description: `Labor — ${laborHours} hrs × $${laborRateVal.toFixed(2)}/hr`,
          item_type: "labor",
          quantity: String(laborHours),
          unit: "hour",
          unit_price: String(laborRateVal),
          discount_type: null,
          discount_value: null,
          is_taxable: false,
          line_total: laborCost.toFixed(2),
          sort_order: woData.lineItems.length,
          created_at: new Date(),
        })
      }

      if (invoiceLineItemValues.length > 0) {
        await db.insert(invoiceLineItems).values(invoiceLineItemValues)
      }

      return newInvoiceId
    })

    if (invoiceId) {
      revalidatePath(`/work-orders/${workOrderId}`)
      revalidatePath("/work-orders")
    }

    return invoiceId
  } catch (err) {
    console.error("[prepareInvoice] Error:", err)
    return null
  }
}

// ---------------------------------------------------------------------------
// addWorkOrderToInvoice
// ---------------------------------------------------------------------------

/**
 * Adds a second completed WO to an existing draft invoice (multi-WO invoicing).
 *
 * - Validates both WO is complete and belongs to same customer
 * - Appends workOrderId to invoice.work_order_ids
 * - Copies WO line items to invoice_line_items
 * - Recalculates totals
 */
export async function addWorkOrderToInvoice(
  invoiceId: string,
  workOrderId: string
): Promise<{ success: boolean; error?: string }> {
  const token = await getRlsToken()
  if (!token) return { success: false, error: "Not authenticated" }

  const orgId = token.org_id as string

  const userRole = token.user_role as string | undefined
  if (!userRole || !["owner", "office"].includes(userRole)) {
    return { success: false, error: "Insufficient permissions" }
  }

  try {
    // ── 1. Fetch invoice ───────────────────────────────────────────────────
    const invoiceRows = await withRls(token, async (db) =>
      db
        .select()
        .from(invoices)
        .where(and(eq(invoices.id, invoiceId), eq(invoices.org_id, orgId)))
        .limit(1)
    )

    const invoice = invoiceRows[0]
    if (!invoice) return { success: false, error: "Invoice not found" }
    if (invoice.status !== "draft") {
      return { success: false, error: "Can only add WOs to draft invoices" }
    }

    // ── 2. Fetch WO ────────────────────────────────────────────────────────
    const woRows = await withRls(token, async (db) =>
      db
        .select({
          id: workOrders.id,
          customer_id: workOrders.customer_id,
          status: workOrders.status,
          tax_exempt: workOrders.tax_exempt,
          discount_type: workOrders.discount_type,
          discount_value: workOrders.discount_value,
        })
        .from(workOrders)
        .where(and(eq(workOrders.id, workOrderId), eq(workOrders.org_id, orgId)))
        .limit(1)
    )

    const wo = woRows[0]
    if (!wo) return { success: false, error: "Work order not found" }
    if (wo.status !== "complete") {
      return { success: false, error: "Work order must be in 'complete' status" }
    }
    if (wo.customer_id !== invoice.customer_id) {
      return {
        success: false,
        error: "Work order must belong to the same customer as the invoice",
      }
    }

    // Check WO not already on this invoice
    const currentWoIds = (invoice.work_order_ids as string[] | null) ?? []
    if (currentWoIds.includes(workOrderId)) {
      return { success: false, error: "Work order is already on this invoice" }
    }

    // ── 3. Fetch WO line items ─────────────────────────────────────────────
    const woLineItems = await withRls(token, async (db) =>
      db
        .select()
        .from(workOrderLineItems)
        .where(eq(workOrderLineItems.work_order_id, workOrderId))
        .orderBy(workOrderLineItems.sort_order)
    )

    // ── 4. Fetch existing invoice line items (for sort order continuity) ───
    const existingLineItems = await withRls(token, async (db) =>
      db
        .select()
        .from(invoiceLineItems)
        .where(eq(invoiceLineItems.invoice_id, invoiceId))
        .orderBy(invoiceLineItems.sort_order)
    )

    const nextSortOrder = existingLineItems.length

    // ── 5. Fetch org settings for tax rate ────────────────────────────────
    const settingsRows = await adminDb
      .select({ default_tax_rate: orgSettings.default_tax_rate })
      .from(orgSettings)
      .where(eq(orgSettings.org_id, orgId))
      .limit(1)

    const taxRate = parseFloat(settingsRows[0]?.default_tax_rate ?? "0.0875")

    // ── 6. Calculate WO-level discount for new WO ─────────────────────────
    let newWoDiscountAmount = 0
    if (wo.discount_type && wo.discount_value) {
      const discVal = parseFloat(wo.discount_value) || 0
      if (wo.discount_type === "percent") {
        const raw = woLineItems.reduce((sum, li) => {
          const qty = parseFloat(li.quantity) || 0
          const price = parseFloat(li.unit_price ?? "0") || 0
          return sum + qty * price
        }, 0)
        newWoDiscountAmount = raw * (discVal / 100)
      } else {
        newWoDiscountAmount = discVal
      }
    }

    // ── 7. Update invoice and add new line items ───────────────────────────
    await withRls(token, async (db) => {
      // Insert new line items from the additional WO
      if (woLineItems.length > 0) {
        await db.insert(invoiceLineItems).values(
          woLineItems.map((li, idx) => {
            const qty = parseFloat(li.quantity ?? "1") || 0
            const unitPrice = parseFloat(li.unit_price ?? "0") || 0
            let lineTotal = qty * unitPrice

            if (li.discount_type && li.discount_value) {
              const discVal = parseFloat(li.discount_value) || 0
              if (li.discount_type === "percent") {
                lineTotal = lineTotal * (1 - discVal / 100)
              } else {
                lineTotal = Math.max(0, lineTotal - discVal)
              }
            }

            return {
              org_id: orgId,
              invoice_id: invoiceId,
              description: li.description,
              item_type: li.item_type ?? "part",
              quantity: li.quantity ?? "1",
              unit: li.unit ?? "each",
              unit_price: li.unit_price ?? "0",
              discount_type: li.discount_type,
              discount_value: li.discount_value,
              is_taxable: li.is_taxable,
              line_total: lineTotal.toFixed(2),
              sort_order: nextSortOrder + idx,
              created_at: new Date(),
            }
          })
        )
      }

      // Fetch all line items now for recalculation
      const allLineItems = await db
        .select()
        .from(invoiceLineItems)
        .where(eq(invoiceLineItems.invoice_id, invoiceId))

      const allForCalc = allLineItems.map((li) => ({
        quantity: li.quantity,
        unit_price: li.unit_price,
        discount_type: li.discount_type,
        discount_value: li.discount_value,
        is_taxable: li.is_taxable,
      }))

      // Combine discounts from both invoices
      const prevDiscount = parseFloat(invoice.discount_amount ?? "0") || 0
      const totals = calculateTotals({
        lineItems: allForCalc,
        taxRate,
        taxExempt: wo.tax_exempt, // both WOs should have same tax exempt status ideally
        discountAmount: prevDiscount + newWoDiscountAmount,
      })

      // Update invoice: append WO id and recalculate totals
      const updatedWoIds = [...currentWoIds, workOrderId]
      await db
        .update(invoices)
        .set({
          work_order_ids: updatedWoIds,
          subtotal: totals.subtotal,
          tax_amount: totals.tax_amount,
          discount_amount: totals.discount_amount,
          total: totals.total,
          updated_at: new Date(),
        })
        .where(eq(invoices.id, invoiceId))
    })

    revalidatePath(`/work-orders`)
    return { success: true }
  } catch (err) {
    console.error("[addWorkOrderToInvoice] Error:", err)
    return {
      success: false,
      error: err instanceof Error ? err.message : "Failed to add work order to invoice",
    }
  }
}

// ---------------------------------------------------------------------------
// updateInvoiceLineItem
// ---------------------------------------------------------------------------

/**
 * Updates a single invoice line item (quantity, price, discount, description).
 * Recalculates the line_total and the invoice totals.
 */
export async function updateInvoiceLineItem(
  lineItemId: string,
  data: {
    description?: string
    quantity?: string
    unit?: string
    unit_price?: string
    discount_type?: string | null
    discount_value?: string | null
    is_taxable?: boolean
    sort_order?: number
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
    // ── 1. Fetch line item to get invoice_id ──────────────────────────────
    const liRows = await withRls(token, async (db) =>
      db
        .select()
        .from(invoiceLineItems)
        .where(and(eq(invoiceLineItems.id, lineItemId), eq(invoiceLineItems.org_id, orgId)))
        .limit(1)
    )

    const li = liRows[0]
    if (!li) return { success: false, error: "Line item not found" }

    // ── 2. Calculate new line_total ────────────────────────────────────────
    const qty = parseFloat(data.quantity ?? li.quantity) || 0
    const unitPrice = parseFloat(data.unit_price ?? li.unit_price) || 0
    let lineTotal = qty * unitPrice

    const discountType = data.discount_type !== undefined ? data.discount_type : li.discount_type
    const discountValue =
      data.discount_value !== undefined ? data.discount_value : li.discount_value

    if (discountType && discountValue) {
      const discVal = parseFloat(discountValue) || 0
      if (discountType === "percent") {
        lineTotal = lineTotal * (1 - discVal / 100)
      } else {
        lineTotal = Math.max(0, lineTotal - discVal)
      }
    }

    // ── 3. Update line item ────────────────────────────────────────────────
    await withRls(token, async (db) => {
      await db
        .update(invoiceLineItems)
        .set({
          ...(data.description !== undefined && { description: data.description }),
          ...(data.quantity !== undefined && { quantity: data.quantity }),
          ...(data.unit !== undefined && { unit: data.unit }),
          ...(data.unit_price !== undefined && { unit_price: data.unit_price }),
          ...(data.discount_type !== undefined && { discount_type: data.discount_type }),
          ...(data.discount_value !== undefined && { discount_value: data.discount_value }),
          ...(data.is_taxable !== undefined && { is_taxable: data.is_taxable }),
          ...(data.sort_order !== undefined && { sort_order: data.sort_order }),
          line_total: lineTotal.toFixed(2),
        })
        .where(eq(invoiceLineItems.id, lineItemId))
    })

    // ── 4. Recalculate invoice totals ─────────────────────────────────────
    await recalculateInvoiceTotals(token, li.invoice_id, orgId)

    revalidatePath("/work-orders")
    return { success: true }
  } catch (err) {
    console.error("[updateInvoiceLineItem] Error:", err)
    return {
      success: false,
      error: err instanceof Error ? err.message : "Failed to update line item",
    }
  }
}

// ---------------------------------------------------------------------------
// addInvoiceLineItem
// ---------------------------------------------------------------------------

/**
 * Adds a new ad-hoc line item to a draft invoice.
 */
export async function addInvoiceLineItem(
  invoiceId: string,
  data: {
    description: string
    item_type?: string
    quantity: string
    unit?: string
    unit_price: string
    discount_type?: string | null
    discount_value?: string | null
    is_taxable?: boolean
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
    // ── 1. Verify invoice exists and is draft ──────────────────────────────
    const invoiceRows = await withRls(token, async (db) =>
      db
        .select({ id: invoices.id, status: invoices.status })
        .from(invoices)
        .where(and(eq(invoices.id, invoiceId), eq(invoices.org_id, orgId)))
        .limit(1)
    )

    const invoice = invoiceRows[0]
    if (!invoice) return { success: false, error: "Invoice not found" }
    if (invoice.status !== "draft") {
      return { success: false, error: "Can only add items to draft invoices" }
    }

    // ── 2. Get next sort order ─────────────────────────────────────────────
    const existingItems = await withRls(token, async (db) =>
      db
        .select({ sort_order: invoiceLineItems.sort_order })
        .from(invoiceLineItems)
        .where(eq(invoiceLineItems.invoice_id, invoiceId))
    )

    const nextSortOrder = existingItems.length

    // ── 3. Calculate line_total ────────────────────────────────────────────
    const qty = parseFloat(data.quantity) || 0
    const unitPrice = parseFloat(data.unit_price) || 0
    let lineTotal = qty * unitPrice

    if (data.discount_type && data.discount_value) {
      const discVal = parseFloat(data.discount_value) || 0
      if (data.discount_type === "percent") {
        lineTotal = lineTotal * (1 - discVal / 100)
      } else {
        lineTotal = Math.max(0, lineTotal - discVal)
      }
    }

    // ── 4. Insert line item ────────────────────────────────────────────────
    await withRls(token, async (db) => {
      await db.insert(invoiceLineItems).values({
        org_id: orgId,
        invoice_id: invoiceId,
        description: data.description,
        item_type: data.item_type ?? "other",
        quantity: data.quantity,
        unit: data.unit ?? "each",
        unit_price: data.unit_price,
        discount_type: data.discount_type ?? null,
        discount_value: data.discount_value ?? null,
        is_taxable: data.is_taxable ?? true,
        line_total: lineTotal.toFixed(2),
        sort_order: nextSortOrder,
        created_at: new Date(),
      })
    })

    // ── 5. Recalculate invoice totals ─────────────────────────────────────
    await recalculateInvoiceTotals(token, invoiceId, orgId)

    revalidatePath("/work-orders")
    return { success: true }
  } catch (err) {
    console.error("[addInvoiceLineItem] Error:", err)
    return {
      success: false,
      error: err instanceof Error ? err.message : "Failed to add line item",
    }
  }
}

// ---------------------------------------------------------------------------
// removeInvoiceLineItem
// ---------------------------------------------------------------------------

/**
 * Removes a line item from a draft invoice and recalculates totals.
 */
export async function removeInvoiceLineItem(
  lineItemId: string
): Promise<{ success: boolean; error?: string }> {
  const token = await getRlsToken()
  if (!token) return { success: false, error: "Not authenticated" }

  const orgId = token.org_id as string

  const userRole = token.user_role as string | undefined
  if (!userRole || !["owner", "office"].includes(userRole)) {
    return { success: false, error: "Insufficient permissions" }
  }

  try {
    // ── 1. Get line item ───────────────────────────────────────────────────
    const liRows = await withRls(token, async (db) =>
      db
        .select({ id: invoiceLineItems.id, invoice_id: invoiceLineItems.invoice_id })
        .from(invoiceLineItems)
        .where(and(eq(invoiceLineItems.id, lineItemId), eq(invoiceLineItems.org_id, orgId)))
        .limit(1)
    )

    const li = liRows[0]
    if (!li) return { success: false, error: "Line item not found" }

    // ── 2. Verify invoice is draft ────────────────────────────────────────
    const invoiceRows = await withRls(token, async (db) =>
      db
        .select({ status: invoices.status })
        .from(invoices)
        .where(and(eq(invoices.id, li.invoice_id), eq(invoices.org_id, orgId)))
        .limit(1)
    )

    if (invoiceRows[0]?.status !== "draft") {
      return { success: false, error: "Can only remove items from draft invoices" }
    }

    // ── 3. Delete line item ────────────────────────────────────────────────
    await withRls(token, async (db) => {
      await db
        .delete(invoiceLineItems)
        .where(eq(invoiceLineItems.id, lineItemId))
    })

    // ── 4. Recalculate invoice totals ─────────────────────────────────────
    await recalculateInvoiceTotals(token, li.invoice_id, orgId)

    revalidatePath("/work-orders")
    return { success: true }
  } catch (err) {
    console.error("[removeInvoiceLineItem] Error:", err)
    return {
      success: false,
      error: err instanceof Error ? err.message : "Failed to remove line item",
    }
  }
}

// ---------------------------------------------------------------------------
// updateInvoiceNotes
// ---------------------------------------------------------------------------

/**
 * Updates the notes field on a draft invoice.
 */
export async function updateInvoiceNotes(
  invoiceId: string,
  notes: string
): Promise<{ success: boolean; error?: string }> {
  const token = await getRlsToken()
  if (!token) return { success: false, error: "Not authenticated" }

  const orgId = token.org_id as string

  const userRole = token.user_role as string | undefined
  if (!userRole || !["owner", "office"].includes(userRole)) {
    return { success: false, error: "Insufficient permissions" }
  }

  try {
    await withRls(token, async (db) => {
      await db
        .update(invoices)
        .set({ notes, updated_at: new Date() })
        .where(and(eq(invoices.id, invoiceId), eq(invoices.org_id, orgId)))
    })

    revalidatePath("/work-orders")
    return { success: true }
  } catch (err) {
    console.error("[updateInvoiceNotes] Error:", err)
    return {
      success: false,
      error: err instanceof Error ? err.message : "Failed to update invoice notes",
    }
  }
}

// ---------------------------------------------------------------------------
// finalizeInvoice
// ---------------------------------------------------------------------------

/**
 * Finalizes a draft invoice:
 * 1. Generates invoice number using atomic counter via adminDb
 * 2. Sets invoice status='sent'
 * 3. Updates all referenced WOs to status='invoiced'
 * 4. Sets issued_at=now
 *
 * Returns the finalized invoice number, or null on failure.
 */
export async function finalizeInvoice(
  invoiceId: string
): Promise<{ success: boolean; invoiceNumber?: string; error?: string }> {
  const token = await getRlsToken()
  if (!token) return { success: false, error: "Not authenticated" }

  const orgId = token.org_id as string

  const userRole = token.user_role as string | undefined
  if (!userRole || !["owner", "office"].includes(userRole)) {
    return { success: false, error: "Insufficient permissions" }
  }

  try {
    // ── 1. Fetch invoice ───────────────────────────────────────────────────
    const invoiceRows = await withRls(token, async (db) =>
      db
        .select()
        .from(invoices)
        .where(and(eq(invoices.id, invoiceId), eq(invoices.org_id, orgId)))
        .limit(1)
    )

    const invoice = invoiceRows[0]
    if (!invoice) return { success: false, error: "Invoice not found" }
    if (invoice.status !== "draft") {
      return { success: false, error: "Only draft invoices can be finalized" }
    }

    // ── 2. Atomic increment of next_invoice_number via adminDb ────────────
    // org_settings UPDATE RLS requires owner role; adminDb bypasses RLS
    // so office staff can also finalize invoices.
    const incrementedRows = await adminDb
      .update(orgSettings)
      .set({
        next_invoice_number: sql`next_invoice_number + 1`,
        updated_at: new Date(),
      })
      .where(eq(orgSettings.org_id, orgId))
      .returning({
        next_invoice_number: orgSettings.next_invoice_number,
        invoice_number_prefix: orgSettings.invoice_number_prefix,
      })

    // After increment, next_invoice_number is N+1. The assigned number is N.
    const assignedNum = (incrementedRows[0]?.next_invoice_number ?? 2) - 1
    const prefix = incrementedRows[0]?.invoice_number_prefix ?? "INV"
    const invoiceNumber = `${prefix}-${String(assignedNum).padStart(4, "0")}`

    // ── 3. Update invoice to finalized ────────────────────────────────────
    const now = new Date()
    await withRls(token, async (db) => {
      await db
        .update(invoices)
        .set({
          invoice_number: invoiceNumber,
          status: "sent",
          issued_at: now,
          updated_at: now,
        })
        .where(eq(invoices.id, invoiceId))
    })

    // ── 4. Update all referenced WOs to status='invoiced' ─────────────────
    const woIds = (invoice.work_order_ids as string[] | null) ?? []
    for (const woId of woIds) {
      await updateWorkOrderStatus(woId, "invoiced")
    }

    // Fire-and-forget QBO sync -- never blocks finalization
    syncInvoiceToQbo(invoiceId).catch((err) =>
      console.error("[finalizeInvoice] QBO sync error:", err)
    )

    // Fire-and-forget double-entry journal entry -- never blocks finalization
    createInvoiceJournalEntry(invoiceId).catch((err) =>
      console.error("[finalizeInvoice] Journal entry error:", err)
    )

    revalidatePath("/work-orders")

    return { success: true, invoiceNumber }
  } catch (err) {
    console.error("[finalizeInvoice] Error:", err)
    return {
      success: false,
      error: err instanceof Error ? err.message : "Failed to finalize invoice",
    }
  }
}

// ---------------------------------------------------------------------------
// sendInvoice
// ---------------------------------------------------------------------------

/**
 * Sends an invoice to the customer via email (with PDF attachment + pay link)
 * and/or SMS (with pay link).
 *
 * Flow:
 * 1. If still draft, finalizes (assigns invoice number via existing logic).
 * 2. Sets status to 'sent' and issued_at/sent_at to now.
 * 3. Generates pay token for public payment page link.
 * 4. If email: generates PDF, renders email HTML, sends via Resend with PDF attachment.
 * 5. If SMS: invokes Edge Function with phone, paymentUrl, invoiceNumber, total.
 * 6. Updates sent_at / sent_sms_at timestamps.
 */
export async function sendInvoice(
  invoiceId: string,
  options?: { email?: boolean; sms?: boolean }
): Promise<{ success: boolean; invoiceNumber?: string; error?: string }> {
  const token = await getRlsToken()
  if (!token) return { success: false, error: "Not authenticated" }

  const orgId = token.org_id as string
  const userRole = token.user_role as string | undefined
  if (!userRole || !["owner", "office"].includes(userRole)) {
    return { success: false, error: "Insufficient permissions" }
  }

  // Default to email only if nothing specified
  const doEmail = options?.email ?? (!options?.sms)
  const doSms = options?.sms ?? false

  try {
    // ── 1. Fetch invoice ───────────────────────────────────────────────────
    const invoiceRows = await withRls(token, async (db) =>
      db
        .select()
        .from(invoices)
        .where(and(eq(invoices.id, invoiceId), eq(invoices.org_id, orgId)))
        .limit(1)
    )

    const invoice = invoiceRows[0]
    if (!invoice) return { success: false, error: "Invoice not found" }

    // If already paid, skip re-send
    if (invoice.status === "paid") {
      return { success: true, invoiceNumber: invoice.invoice_number ?? undefined }
    }

    // ── 2. If draft, finalize first (assign invoice number) ────────────────
    let invoiceNumber = invoice.invoice_number
    if (invoice.status === "draft") {
      const finalizeResult = await finalizeInvoice(invoiceId)
      if (!finalizeResult.success) {
        return { success: false, error: finalizeResult.error ?? "Failed to finalize invoice" }
      }
      invoiceNumber = finalizeResult.invoiceNumber ?? null
    }

    // ── 3. Fetch customer, org, line items for email/SMS ──────────────────
    const customerRows = await adminDb
      .select({
        id: customers.id,
        full_name: customers.full_name,
        email: customers.email,
        phone: customers.phone,
        address: customers.address,
        tax_exempt: customers.tax_exempt,
      })
      .from(customers)
      .where(eq(customers.id, invoice.customer_id))
      .limit(1)

    const customer = customerRows[0]
    if (!customer) return { success: false, error: "Customer not found" }

    const orgRows = await adminDb
      .select({ name: orgs.name, logo_url: orgs.logo_url })
      .from(orgs)
      .where(eq(orgs.id, orgId))
      .limit(1)

    const org = orgRows[0]
    const companyName = org?.name ?? "Pool Company"
    const companyLogoUrl = org?.logo_url ?? null

    const settingsRows = await adminDb
      .select({ default_tax_rate: orgSettings.default_tax_rate })
      .from(orgSettings)
      .where(eq(orgSettings.org_id, orgId))
      .limit(1)

    const taxRate = parseFloat(settingsRows[0]?.default_tax_rate ?? "0.0875")

    const lineItemRows = await adminDb
      .select()
      .from(invoiceLineItems)
      .where(eq(invoiceLineItems.invoice_id, invoiceId))
      .orderBy(invoiceLineItems.sort_order)

    // WO titles for PDF
    const woIds = (invoice.work_order_ids as string[] | null) ?? []
    let workOrderNumbers: string[] = []
    if (woIds.length > 0) {
      const woRows = await adminDb
        .select({ id: workOrders.id, title: workOrders.title })
        .from(workOrders)
        .where(inArray(workOrders.id, woIds))
      workOrderNumbers = woRows.map((wo) => wo.title)
    }

    // ── 4. Generate pay token + payment URL ──────────────────────────────
    const payToken = await signPayToken(invoiceId)
    const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? "https://app.poolco.app"
    const paymentUrl = `${appUrl}/pay/${payToken}`

    // Pre-compute totals for email
    const total = parseFloat(invoice.total ?? "0")
    const totalFormatted = new Intl.NumberFormat("en-US", {
      style: "currency",
      currency: "USD",
    }).format(total)

    // Build billing period string
    let billingPeriod: string | null = null
    if (invoice.billing_period_start && invoice.billing_period_end) {
      const start = new Date(invoice.billing_period_start).toLocaleDateString("en-US", {
        month: "short",
        day: "numeric",
      })
      const end = new Date(invoice.billing_period_end).toLocaleDateString("en-US", {
        month: "short",
        day: "numeric",
        year: "numeric",
      })
      billingPeriod = `${start} - ${end}`
    }

    // Due date
    let dueDateFormatted: string | null = null
    if (invoice.due_date) {
      dueDateFormatted = new Date(invoice.due_date).toLocaleDateString("en-US", {
        year: "numeric",
        month: "long",
        day: "numeric",
      })
    }

    // Count stops for per_stop billing model
    const stopCount = invoice.billing_model === "per_stop"
      ? lineItemRows.filter((li) => li.item_type === "service" || li.visit_id).length || null
      : null

    const now = new Date()

    // ── 4b. Resolve notification templates ────────────────────────────────
    const emailTemplate = await getResolvedTemplate(orgId, "invoice_email", {
      customer_name: customer.full_name,
      company_name: companyName,
      invoice_number: invoiceNumber ?? invoiceId,
      invoice_total: totalFormatted,
      due_date: dueDateFormatted ?? "",
      billing_period: billingPeriod ?? "",
      payment_link: paymentUrl,
    })

    const smsTemplate = await getResolvedTemplate(orgId, "invoice_sms", {
      customer_name: customer.full_name,
      company_name: companyName,
      invoice_number: invoiceNumber ?? invoiceId,
      invoice_total: totalFormatted,
      payment_link: paymentUrl,
    })

    // ── 5. Email delivery ────────────────────────────────────────────────
    if (doEmail && emailTemplate) {
      if (!customer.email) {
        // If email was requested but customer has no email, skip silently
        console.warn(`[sendInvoice] Customer ${customer.id} has no email — skipping email delivery`)
      } else {
        // Build PDF props
        const taxExempt = customer.tax_exempt ?? false
        const subtotal = parseFloat(invoice.subtotal ?? "0")
        const taxAmount = taxExempt ? 0 : parseFloat(invoice.tax_amount ?? "0")
        const discountAmount = parseFloat(invoice.discount_amount ?? "0")

        const invoiceDate = (invoice.issued_at ?? invoice.created_at).toLocaleDateString(
          "en-US",
          { year: "numeric", month: "long", day: "numeric" }
        )

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

        const documentProps: InvoiceDocumentProps = {
          invoiceNumber: invoiceNumber ?? invoiceId,
          invoiceDate,
          companyName,
          companyLogoUrl,
          customerName: customer.full_name,
          customerAddress: customer.address ?? null,
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

        // Generate PDF buffer
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const pdfBuffer = await renderToBuffer(
          createElement(InvoiceDocument, documentProps) as any
        )

        // Render email HTML (with template customizations)
        const emailHtml = await renderEmail(
          createElement(InvoiceEmail, {
            companyName,
            customerName: customer.full_name,
            invoiceNumber: invoiceNumber ?? invoiceId,
            invoiceTotal: totalFormatted,
            dueDate: dueDateFormatted,
            paymentUrl,
            billingPeriod,
            billingModel: invoice.billing_model,
            stopCount,
            customBody: emailTemplate.body_html,
            customFooter: null, // Footer already resolved into body_html by template engine
          })
        )

        // Send via Resend SDK (or log in dev)
        const resendApiKey = process.env.RESEND_API_KEY
        const isDev = process.env.NODE_ENV === "development"

        if (!resendApiKey) {
          if (isDev) {
            console.log("\n=== [DEV] Invoice Email ===================================")
            console.log(`To: ${customer.email}`)
            console.log(`Subject: Invoice #${invoiceNumber ?? invoiceId} from ${companyName}`)
            console.log(`Payment URL: ${paymentUrl}`)
            console.log(`PDF: ${pdfBuffer.byteLength} bytes`)
            console.log("============================================================\n")
          } else {
            return { success: false, error: "RESEND_API_KEY not configured" }
          }
        } else {
          const resend = new Resend(resendApiKey)
          const fromAddress = isDev
            ? "PoolCo Dev <onboarding@resend.dev>"
            : `${companyName} <invoices@poolco.app>`

          const { error: resendError } = await resend.emails.send({
            from: fromAddress,
            to: isDev ? ["delivered@resend.dev"] : [customer.email],
            subject: emailTemplate.subject ?? `Invoice #${invoiceNumber ?? invoiceId} from ${companyName}`,
            html: emailHtml,
            attachments: [
              {
                filename: `invoice-${invoiceNumber ?? invoiceId}.pdf`,
                content: Buffer.from(pdfBuffer).toString("base64"),
              },
            ],
          })

          if (resendError) {
            console.error("[sendInvoice] Resend error:", resendError)
            return {
              success: false,
              error: `Email delivery failed: ${resendError.message}`,
            }
          }
        }

        // Update sent_at
        await withRls(token, async (db) => {
          await db
            .update(invoices)
            .set({ sent_at: now, updated_at: now })
            .where(eq(invoices.id, invoiceId))
        })
      }
    }

    // ── 6. SMS delivery ──────────────────────────────────────────────────
    if (doSms && customer.phone && smsTemplate) {
      try {
        const supabase = await createClient()
        await supabase.functions.invoke("send-invoice-sms", {
          body: {
            phone: customer.phone,
            paymentUrl,
            invoiceNumber: invoiceNumber ?? invoiceId,
            total: totalFormatted,
            companyName,
            type: "invoice",
            customText: smsTemplate.sms_text ?? undefined,
          },
        })

        // Update sent_sms_at
        await withRls(token, async (db) => {
          await db
            .update(invoices)
            .set({ sent_sms_at: now, updated_at: now })
            .where(eq(invoices.id, invoiceId))
        })
      } catch (smsErr) {
        console.error("[sendInvoice] SMS delivery error:", smsErr)
        // SMS failure is non-fatal if email was also sent
        if (!doEmail) {
          return {
            success: false,
            error: `SMS delivery failed: ${smsErr instanceof Error ? smsErr.message : "Unknown error"}`,
          }
        }
      }
    }

    // Fire-and-forget QBO sync -- never blocks invoice send
    syncInvoiceToQbo(invoiceId).catch((err) =>
      console.error("[sendInvoice] QBO sync error:", err)
    )

    revalidatePath("/work-orders")
    return { success: true, invoiceNumber: invoiceNumber ?? undefined }
  } catch (err) {
    console.error("[sendInvoice] Error:", err)
    return {
      success: false,
      error: err instanceof Error ? err.message : "Failed to send invoice",
    }
  }
}

// ---------------------------------------------------------------------------
// sendAllInvoices
// ---------------------------------------------------------------------------

/**
 * Batch-sends multiple invoices. Processes sequentially (not Promise.all)
 * because each one generates a PDF and sends email.
 *
 * For each invoice: calls sendInvoice with both email and SMS enabled.
 *
 * Returns { sent, failed, errors } summary.
 */
export async function sendAllInvoices(
  invoiceIds: string[]
): Promise<{ sent: number; failed: number; errors: string[] }> {
  const results = { sent: 0, failed: 0, errors: [] as string[] }

  for (const id of invoiceIds) {
    const result = await sendInvoice(id, { email: true, sms: true })
    if (result.success) {
      results.sent++
    } else {
      results.failed++
      results.errors.push(`Invoice ${id}: ${result.error ?? "Unknown error"}`)
    }
  }

  revalidatePath("/work-orders")
  return results
}

// ---------------------------------------------------------------------------
// getInvoices
// ---------------------------------------------------------------------------

/**
 * Fetches invoices with customer info, filterable by status, customerId, dateRange.
 * Orders by created_at desc.
 */
export async function getInvoices(filters?: {
  status?: string[]
  customerId?: string
  dateFrom?: string
  dateTo?: string
}): Promise<InvoiceSummary[]> {
  const token = await getRlsToken()
  if (!token) return []

  try {
    // Two-query pattern: fetch invoices then customer names separately
    // to avoid RLS correlated subquery pitfall (MEMORY.md)
    const invoiceRows = await withRls(token, async (db) => {
      const rows = await db
        .select({
          id: invoices.id,
          org_id: invoices.org_id,
          invoice_number: invoices.invoice_number,
          status: invoices.status,
          customer_id: invoices.customer_id,
          subtotal: invoices.subtotal,
          total: invoices.total,
          created_at: invoices.created_at,
          issued_at: invoices.issued_at,
          paid_at: invoices.paid_at,
        })
        .from(invoices)
        .orderBy(desc(invoices.created_at))

      return rows
    })

    if (!invoiceRows || invoiceRows.length === 0) return []

    // Filter in application layer (avoids complex SQL with RLS)
    let filtered = invoiceRows

    if (filters?.status && filters.status.length > 0) {
      filtered = filtered.filter((inv) => filters.status!.includes(inv.status))
    }
    if (filters?.customerId) {
      filtered = filtered.filter((inv) => inv.customer_id === filters.customerId)
    }
    if (filters?.dateFrom) {
      const from = new Date(filters.dateFrom)
      filtered = filtered.filter((inv) => inv.created_at >= from)
    }
    if (filters?.dateTo) {
      const to = new Date(filters.dateTo + "T23:59:59")
      filtered = filtered.filter((inv) => inv.created_at <= to)
    }

    if (filtered.length === 0) return []

    // Fetch customer names for filtered invoices
    const customerIds = [...new Set(filtered.map((inv) => inv.customer_id))]
    const customerRows = await withRls(token, async (db) =>
      db
        .select({ id: customers.id, full_name: customers.full_name })
        .from(customers)
        .where(inArray(customers.id, customerIds))
    )

    const customerMap = new Map(customerRows.map((c) => [c.id, c.full_name]))

    return filtered.map((inv) => ({
      id: inv.id,
      org_id: inv.org_id,
      invoice_number: inv.invoice_number,
      status: inv.status,
      customer_id: inv.customer_id,
      customerName: customerMap.get(inv.customer_id) ?? "Unknown Customer",
      subtotal: inv.subtotal,
      total: inv.total,
      created_at: inv.created_at,
      issued_at: inv.issued_at,
      paid_at: inv.paid_at,
    }))
  } catch (err) {
    console.error("[getInvoices] Error:", err)
    return []
  }
}

// ---------------------------------------------------------------------------
// getInvoice
// ---------------------------------------------------------------------------

/**
 * Fetches a single invoice with all line items, customer info, and WO references.
 */
export async function getInvoice(id: string): Promise<InvoiceDetail | null> {
  const token = await getRlsToken()
  if (!token) return null

  const orgId = token.org_id as string

  try {
    // ── 1. Fetch invoice ───────────────────────────────────────────────────
    const invoiceRows = await withRls(token, async (db) =>
      db
        .select()
        .from(invoices)
        .where(and(eq(invoices.id, id), eq(invoices.org_id, orgId)))
        .limit(1)
    )

    const invoice = invoiceRows[0]
    if (!invoice) return null

    // ── 2. Fetch line items ────────────────────────────────────────────────
    const lineItemRows = await withRls(token, async (db) =>
      db
        .select()
        .from(invoiceLineItems)
        .where(eq(invoiceLineItems.invoice_id, id))
        .orderBy(invoiceLineItems.sort_order)
    )

    // ── 3. Fetch customer info ─────────────────────────────────────────────
    const customerRows = await withRls(token, async (db) =>
      db
        .select({
          id: customers.id,
          full_name: customers.full_name,
          email: customers.email,
          address: customers.address,
          tax_exempt: customers.tax_exempt,
        })
        .from(customers)
        .where(eq(customers.id, invoice.customer_id))
        .limit(1)
    )

    const customer = customerRows[0]

    // ── 4. Fetch WO titles for references ─────────────────────────────────
    const woIds = (invoice.work_order_ids as string[] | null) ?? []
    let workOrderTitles: string[] = []
    if (woIds.length > 0) {
      const woRows = await withRls(token, async (db) =>
        db
          .select({ id: workOrders.id, title: workOrders.title })
          .from(workOrders)
          .where(inArray(workOrders.id, woIds))
      )
      workOrderTitles = woRows.map((wo) => wo.title)
    }

    return {
      id: invoice.id,
      org_id: invoice.org_id,
      invoice_number: invoice.invoice_number,
      status: invoice.status,
      work_order_ids: invoice.work_order_ids as string[] | null,
      customer_id: invoice.customer_id,
      subtotal: invoice.subtotal,
      tax_amount: invoice.tax_amount,
      discount_amount: invoice.discount_amount,
      total: invoice.total,
      notes: invoice.notes,
      issued_at: invoice.issued_at,
      paid_at: invoice.paid_at,
      created_at: invoice.created_at,
      updated_at: invoice.updated_at,
      customerName: customer?.full_name ?? "Unknown Customer",
      customerEmail: customer?.email ?? null,
      customerAddress: customer?.address ?? null,
      taxExempt: customer?.tax_exempt ?? false,
      lineItems: lineItemRows as InvoiceLineItemDetail[],
      workOrderTitles,
      billing_model: invoice.billing_model ?? null,
      sent_at: invoice.sent_at ?? null,
      sent_sms_at: invoice.sent_sms_at ?? null,
      payment_method: invoice.payment_method ?? null,
    }
  } catch (err) {
    console.error("[getInvoice] Error:", err)
    return null
  }
}

// ---------------------------------------------------------------------------
// getInvoiceForWorkOrder
// ---------------------------------------------------------------------------

/**
 * Fetches the invoice (if any) associated with a given work order.
 * Returns null if no invoice exists for this WO.
 */
export async function getInvoiceForWorkOrder(
  workOrderId: string
): Promise<{ id: string; invoice_number: string | null; status: string } | null> {
  const token = await getRlsToken()
  if (!token) return null

  try {
    // Fetch all invoices for this org (RLS filtered)
    // Then check work_order_ids in app layer (JSONB array contains check)
    const invoiceRows = await withRls(token, async (db) =>
      db
        .select({
          id: invoices.id,
          invoice_number: invoices.invoice_number,
          status: invoices.status,
          work_order_ids: invoices.work_order_ids,
        })
        .from(invoices)
    )

    const found = invoiceRows.find((inv) => {
      const woIds = (inv.work_order_ids as string[] | null) ?? []
      return woIds.includes(workOrderId)
    })

    if (!found) return null

    return {
      id: found.id,
      invoice_number: found.invoice_number,
      status: found.status,
    }
  } catch (err) {
    console.error("[getInvoiceForWorkOrder] Error:", err)
    return null
  }
}

// ---------------------------------------------------------------------------
// getCompletedWorkOrdersForCustomer
// ---------------------------------------------------------------------------

/**
 * Fetches completed (not yet invoiced) WOs for a customer.
 * Used in the "Add another WO" picker in invoice prep.
 */
export async function getCompletedWorkOrdersForCustomer(
  customerId: string,
  excludeWoIds?: string[]
): Promise<Array<{ id: string; title: string; completed_at: Date | null }>> {
  const token = await getRlsToken()
  if (!token) return []

  try {
    const woRows = await withRls(token, async (db) =>
      db
        .select({
          id: workOrders.id,
          title: workOrders.title,
          completed_at: workOrders.completed_at,
        })
        .from(workOrders)
        .where(
          and(
            eq(workOrders.customer_id, customerId),
            eq(workOrders.status, "complete")
          )
        )
        .orderBy(desc(workOrders.completed_at))
    )

    // Filter out excluded WO ids
    const excluded = new Set(excludeWoIds ?? [])
    return woRows.filter((wo) => !excluded.has(wo.id))
  } catch (err) {
    console.error("[getCompletedWorkOrdersForCustomer] Error:", err)
    return []
  }
}

// ---------------------------------------------------------------------------
// createCreditNote
// ---------------------------------------------------------------------------

/**
 * Creates a credit note as a new invoice record with negative total.
 * References the original invoice. Status='sent'.
 */
export async function createCreditNote(
  invoiceId: string,
  reason: string,
  adjustmentAmount: number
): Promise<{ success: boolean; creditNoteId?: string; error?: string }> {
  const token = await getRlsToken()
  if (!token) return { success: false, error: "Not authenticated" }

  const orgId = token.org_id as string

  const userRole = token.user_role as string | undefined
  if (!userRole || !["owner", "office"].includes(userRole)) {
    return { success: false, error: "Insufficient permissions" }
  }

  try {
    // ── 1. Fetch original invoice ─────────────────────────────────────────
    const invoiceRows = await withRls(token, async (db) =>
      db
        .select()
        .from(invoices)
        .where(and(eq(invoices.id, invoiceId), eq(invoices.org_id, orgId)))
        .limit(1)
    )

    const originalInvoice = invoiceRows[0]
    if (!originalInvoice) return { success: false, error: "Invoice not found" }
    if (!originalInvoice.invoice_number) {
      return { success: false, error: "Can only create credit notes for finalized invoices" }
    }

    // ── 2. Atomic increment for credit note number ────────────────────────
    const incrementedRows = await adminDb
      .update(orgSettings)
      .set({
        next_invoice_number: sql`next_invoice_number + 1`,
        updated_at: new Date(),
      })
      .where(eq(orgSettings.org_id, orgId))
      .returning({
        next_invoice_number: orgSettings.next_invoice_number,
        invoice_number_prefix: orgSettings.invoice_number_prefix,
      })

    const assignedNum = (incrementedRows[0]?.next_invoice_number ?? 2) - 1
    const prefix = incrementedRows[0]?.invoice_number_prefix ?? "INV"
    const creditNoteNumber = `${prefix}-CN-${String(assignedNum).padStart(4, "0")}`

    const negativeAmount = -Math.abs(adjustmentAmount)

    // ── 3. Create credit note invoice record ──────────────────────────────
    const creditNoteId = await withRls(token, async (db) => {
      const inserted = await db
        .insert(invoices)
        .values({
          org_id: orgId,
          customer_id: originalInvoice.customer_id,
          invoice_number: creditNoteNumber,
          status: "sent",
          notes: `Credit note for ${originalInvoice.invoice_number}. Reason: ${reason}`,
          subtotal: negativeAmount.toFixed(2),
          tax_amount: "0",
          discount_amount: "0",
          total: negativeAmount.toFixed(2),
          issued_at: new Date(),
          created_at: new Date(),
          updated_at: new Date(),
        })
        .returning({ id: invoices.id })

      const newId = inserted[0]?.id
      if (!newId) return null

      // Add a single line item describing the credit
      await db.insert(invoiceLineItems).values({
        org_id: orgId,
        invoice_id: newId,
        description: `Credit: ${reason}`,
        item_type: "other",
        quantity: "1",
        unit: "each",
        unit_price: negativeAmount.toFixed(2),
        is_taxable: false,
        line_total: negativeAmount.toFixed(2),
        sort_order: 0,
        created_at: new Date(),
      })

      return newId
    })

    if (!creditNoteId) {
      return { success: false, error: "Failed to create credit note" }
    }

    // Fire-and-forget journal entry for the credit note (refund pattern)
    // The credit note itself is an invoice with negative total, so we generate
    // an invoice journal entry that will produce Dr Revenue (positive), Cr AR (negative)
    // effectively reversing the original invoice's revenue recognition.
    createInvoiceJournalEntry(creditNoteId).catch((err) =>
      console.error("[createCreditNote] Journal entry error:", err)
    )

    revalidatePath("/work-orders")
    return { success: true, creditNoteId }
  } catch (err) {
    console.error("[createCreditNote] Error:", err)
    return {
      success: false,
      error: err instanceof Error ? err.message : "Failed to create credit note",
    }
  }
}

// ---------------------------------------------------------------------------
// recalculateInvoiceTotals (internal helper)
// ---------------------------------------------------------------------------

/**
 * Recalculates invoice subtotal, tax, discount, and total from its line items.
 * Used internally after any line item mutation.
 */
async function recalculateInvoiceTotals(
  token: SupabaseToken,
  invoiceId: string,
  orgId: string
): Promise<void> {
  const settingsRows = await adminDb
    .select({
      default_tax_rate: orgSettings.default_tax_rate,
    })
    .from(orgSettings)
    .where(eq(orgSettings.org_id, orgId))
    .limit(1)

  const taxRate = parseFloat(settingsRows[0]?.default_tax_rate ?? "0.0875")

  await withRls(token, async (db) => {
    const invoiceRows = await db
      .select({
        tax_exempt: invoices.discount_amount, // we need customer tax_exempt — fetch via join
        discount_amount: invoices.discount_amount,
        customer_id: invoices.customer_id,
      })
      .from(invoices)
      .where(and(eq(invoices.id, invoiceId), eq(invoices.org_id, orgId)))
      .limit(1)

    const invoice = invoiceRows[0]
    if (!invoice) return

    const customerRows = await db
      .select({ tax_exempt: customers.tax_exempt })
      .from(customers)
      .where(eq(customers.id, invoice.customer_id))
      .limit(1)

    const taxExempt = customerRows[0]?.tax_exempt ?? false
    const currentDiscount = parseFloat(invoice.discount_amount ?? "0") || 0

    const allLineItems = await db
      .select()
      .from(invoiceLineItems)
      .where(eq(invoiceLineItems.invoice_id, invoiceId))

    const lineItemsForCalc = allLineItems.map((li) => ({
      quantity: li.quantity,
      unit_price: li.unit_price,
      discount_type: li.discount_type,
      discount_value: li.discount_value,
      is_taxable: li.is_taxable,
    }))

    const totals = calculateTotals({
      lineItems: lineItemsForCalc,
      taxRate,
      taxExempt,
      discountAmount: currentDiscount,
    })

    await db
      .update(invoices)
      .set({
        subtotal: totals.subtotal,
        tax_amount: totals.tax_amount,
        discount_amount: totals.discount_amount,
        total: totals.total,
        updated_at: new Date(),
      })
      .where(eq(invoices.id, invoiceId))
  })
}

// ---------------------------------------------------------------------------
// getCustomerPhonesForInvoices
// ---------------------------------------------------------------------------

/**
 * Fetches customer phone numbers for a list of customer IDs.
 * Used by invoice list to gate SMS send option visibility.
 *
 * Returns a map of customerId -> phone | null.
 */
export async function getCustomerPhonesForInvoices(
  customerIds: string[]
): Promise<Record<string, string | null>> {
  if (customerIds.length === 0) return {}

  const token = await getRlsToken()
  if (!token) return {}

  try {
    const uniqueIds = [...new Set(customerIds)]
    const rows = await withRls(token, async (db) =>
      db
        .select({ id: customers.id, phone: customers.phone })
        .from(customers)
        .where(inArray(customers.id, uniqueIds))
    )

    const map: Record<string, string | null> = {}
    for (const row of rows) {
      map[row.id] = row.phone
    }
    return map
  } catch (err) {
    console.error("[getCustomerPhonesForInvoices] Error:", err)
    return {}
  }
}

// ---------------------------------------------------------------------------
// BillingInsights — key metrics for the billing dashboard
// ---------------------------------------------------------------------------

export interface BillingInsights {
  draftsReadyToSend: number
  draftsTotal: string
  overdueCount: number
  overdueTotal: string
  outstandingCount: number
  outstandingTotal: string
  paidThisMonth: number
  paidThisMonthTotal: string
  uninvoicedWoCount: number
  customersNoBillingModel: number
}

/**
 * getBillingInsights — Aggregated billing stats for the billing dashboard.
 *
 * Returns counts and totals for draft/overdue/outstanding/paid invoices,
 * plus action items (uninvoiced WOs, customers without billing model).
 */
export async function getBillingInsights(): Promise<BillingInsights | null> {
  const token = await getRlsToken()
  if (!token) return null

  const role = token["user_role"] as string | undefined
  if (!role || !["owner", "office"].includes(role)) return null

  try {
    return await withRls(token, async (db) => {
      const now = new Date()
      const monthStart = new Date(now.getFullYear(), now.getMonth(), 1)

      // Fetch all invoices for aggregation (LEFT JOIN avoids correlated subquery)
      const allInvoices = await db
        .select({
          id: invoices.id,
          status: invoices.status,
          total: invoices.total,
          due_date: invoices.due_date,
          paid_at: invoices.paid_at,
        })
        .from(invoices)

      let draftsReadyToSend = 0
      let draftsTotal = 0
      let overdueCount = 0
      let overdueTotal = 0
      let outstandingCount = 0
      let outstandingTotal = 0
      let paidThisMonth = 0
      let paidThisMonthTotal = 0

      const todayStr = toLocalDateString(now)

      for (const inv of allInvoices) {
        const total = parseFloat(inv.total ?? "0") || 0

        if (inv.status === "draft") {
          draftsReadyToSend++
          draftsTotal += total
        }

        if ((inv.status === "sent" || inv.status === "overdue") && !inv.paid_at) {
          outstandingCount++
          outstandingTotal += total

          if (inv.due_date && inv.due_date < todayStr) {
            overdueCount++
            overdueTotal += total
          }
        }

        if (inv.status === "paid" && inv.paid_at && inv.paid_at >= monthStart) {
          paidThisMonth++
          paidThisMonthTotal += total
        }
      }

      // Count completed WOs not yet invoiced (status = 'complete', before 'invoiced')
      const uninvoicedWos = await db
        .select({ id: workOrders.id })
        .from(workOrders)
        .where(eq(workOrders.status, "complete"))

      // Count active customers without billing model
      const customersNoBilling = await db
        .select({ id: customers.id })
        .from(customers)
        .where(
          and(
            eq(customers.status, "active"),
            isNull(customers.billing_model)
          )
        )

      return {
        draftsReadyToSend,
        draftsTotal: draftsTotal.toFixed(2),
        overdueCount,
        overdueTotal: overdueTotal.toFixed(2),
        outstandingCount,
        outstandingTotal: outstandingTotal.toFixed(2),
        paidThisMonth,
        paidThisMonthTotal: paidThisMonthTotal.toFixed(2),
        uninvoicedWoCount: uninvoicedWos.length,
        customersNoBillingModel: customersNoBilling.length,
      }
    })
  } catch (err) {
    console.error("[getBillingInsights] Error:", err)
    return null
  }
}
