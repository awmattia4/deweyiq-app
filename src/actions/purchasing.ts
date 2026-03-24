"use server"

/**
 * purchasing.ts — Phase 13 purchasing dashboard and PO management actions.
 *
 * Exports:
 * - getPurchasingDashboard: Fleet-wide aggregated purchasing needs (supplier or urgency grouping)
 * - createPurchaseOrder: Insert PO with auto-incrementing PO number
 * - sendPurchaseOrder: Generate PO PDF and email supplier (formal mode)
 * - updatePurchaseOrderStatus: Transition PO status
 * - getSpendingInsights: Time-series and breakdown data for recharts
 *
 * All queries use LEFT JOIN + GROUP BY — never correlated subqueries (MEMORY.md).
 * PO number increments from org_settings.next_po_number (same pattern as next_invoice_number).
 */

import { withRls, getRlsToken, adminDb } from "@/lib/db"
import type { SupabaseToken } from "@/lib/db"
import {
  shoppingListItems,
  purchaseOrders,
  poLineItems,
  orgSettings,
  profiles,
} from "@/lib/db/schema"
import { and, eq, inArray, sql } from "drizzle-orm"
import { revalidatePath } from "next/cache"

// ---------------------------------------------------------------------------
// Auth helper
// ---------------------------------------------------------------------------

async function getToken(): Promise<SupabaseToken> {
  const token = await getRlsToken()
  if (!token) throw new Error("Not authenticated")
  return token
}

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface PurchasingGroupItem {
  id: string
  itemName: string
  quantityNeeded: string
  unit: string
  techName: string | null
  sourceType: string | null
  isUrgent: boolean
  vendor: string | null
  status: string
  catalogItemId: string | null
}

export interface PurchasingGroup {
  key: string
  label: string
  items: PurchasingGroupItem[]
  itemCount: number
  estimatedTotal: number
}

export interface PurchasingDashboardData {
  groups: PurchasingGroup[]
  totalItemsNeeded: number
  totalItemsOrdered: number
  totalEstimatedSpend: number
}

export interface CreatePoData {
  supplierName: string
  supplierContact?: string
  supplierEmail?: string
  mode: "formal" | "checklist"
  items: Array<{
    shoppingListItemId?: string
    itemName: string
    quantity: string
    unit: string
    unitPrice: string
  }>
  notes?: string
}

export interface SpendingInsightsData {
  timeSeries: Array<{ date: string; total: number }>
  breakdown: Array<{ key: string; label: string; total: number; percentage: number }>
}

// ---------------------------------------------------------------------------
// getPurchasingDashboard
// ---------------------------------------------------------------------------

/**
 * Aggregate all shopping_list_items with status IN ('needed', 'ordered') for the org.
 * Uses LEFT JOIN + GROUP BY to avoid correlated subqueries on RLS-protected tables.
 *
 * groupBy: 'supplier' groups by vendor field (or "Unassigned")
 * groupBy: 'urgency' groups by is_urgent + status
 */
export async function getPurchasingDashboard(
  groupBy: "supplier" | "urgency" = "urgency"
): Promise<PurchasingDashboardData> {
  const token = await getToken()

  return withRls(token, async (db) => {
    // Fetch items with tech profile info via LEFT JOIN
    const rows = await db
      .select({
        id: shoppingListItems.id,
        item_name: shoppingListItems.item_name,
        quantity_needed: shoppingListItems.quantity_needed,
        unit: shoppingListItems.unit,
        is_urgent: shoppingListItems.is_urgent,
        vendor: shoppingListItems.vendor,
        status: shoppingListItems.status,
        source_type: shoppingListItems.source_type,
        catalog_item_id: shoppingListItems.catalog_item_id,
        tech_name: profiles.full_name,
      })
      .from(shoppingListItems)
      .leftJoin(profiles, eq(shoppingListItems.tech_id, profiles.id))
      .where(
        inArray(shoppingListItems.status, ["needed", "ordered"])
      )

    const items: PurchasingGroupItem[] = rows.map((r) => ({
      id: r.id,
      itemName: r.item_name,
      quantityNeeded: r.quantity_needed,
      unit: r.unit,
      techName: r.tech_name,
      sourceType: r.source_type,
      isUrgent: r.is_urgent,
      vendor: r.vendor,
      status: r.status,
      catalogItemId: r.catalog_item_id,
    }))

    // Group items
    const groupMap = new Map<string, PurchasingGroupItem[]>()

    for (const item of items) {
      let groupKey: string
      if (groupBy === "supplier") {
        groupKey = item.vendor ?? "Unassigned"
      } else {
        // urgency grouping: urgent-needed first, then needed, then ordered
        if (item.isUrgent && item.status === "needed") {
          groupKey = "urgent-needed"
        } else if (item.status === "needed") {
          groupKey = "needed"
        } else {
          groupKey = "ordered"
        }
      }

      const existing = groupMap.get(groupKey) ?? []
      existing.push(item)
      groupMap.set(groupKey, existing)
    }

    // Sort urgency groups: urgent-needed → needed → ordered
    const urgencyOrder = ["urgent-needed", "needed", "ordered"]

    const groups: PurchasingGroup[] = []
    const sortedKeys =
      groupBy === "urgency"
        ? urgencyOrder.filter((k) => groupMap.has(k))
        : Array.from(groupMap.keys()).sort()

    for (const key of sortedKeys) {
      const groupItems = groupMap.get(key) ?? []
      let label: string
      if (groupBy === "urgency") {
        if (key === "urgent-needed") label = "Urgent — Needed Now"
        else if (key === "needed") label = "Needed"
        else label = "Ordered"
      } else {
        label = key === "Unassigned" ? "Unassigned Supplier" : key
      }

      groups.push({
        key,
        label,
        items: groupItems,
        itemCount: groupItems.length,
        estimatedTotal: 0, // No unit prices on shopping list items; PO builder handles pricing
      })
    }

    const needed = items.filter((i) => i.status === "needed").length
    const ordered = items.filter((i) => i.status === "ordered").length

    return {
      groups,
      totalItemsNeeded: needed,
      totalItemsOrdered: ordered,
      totalEstimatedSpend: 0,
    }
  })
}

// ---------------------------------------------------------------------------
// createPurchaseOrder
// ---------------------------------------------------------------------------

/**
 * Creates a PO with auto-incrementing PO number from org_settings.next_po_number.
 * Inserts PO, line items, and updates linked shopping_list_items to 'ordered'.
 */
export async function createPurchaseOrder(
  data: CreatePoData
): Promise<{ poId: string; poNumber: string }> {
  const token = await getToken()
  const orgId = token.org_id
  if (!orgId) throw new Error("No org_id in token")
  const userId = token.sub

  // Auto-increment PO number using adminDb to avoid RLS overhead on org_settings
  const settingsRows = await adminDb
    .select({
      next_po_number: orgSettings.next_po_number,
    })
    .from(orgSettings)
    .where(eq(orgSettings.org_id, orgId))
    .limit(1)

  const currentNum = settingsRows[0]?.next_po_number ?? 1
  const poNumber = `PO-${String(currentNum).padStart(4, "0")}`

  // Increment next_po_number
  await adminDb
    .update(orgSettings)
    .set({ next_po_number: currentNum + 1, updated_at: new Date() })
    .where(eq(orgSettings.org_id, orgId))

  // Calculate total
  const totalAmount = data.items.reduce((sum, item) => {
    const qty = parseFloat(item.quantity) || 0
    const price = parseFloat(item.unitPrice) || 0
    return sum + qty * price
  }, 0)

  const now = new Date()

  // Insert PO
  const poRows = await adminDb
    .insert(purchaseOrders)
    .values({
      org_id: orgId,
      po_number: poNumber,
      supplier_name: data.supplierName,
      supplier_contact: data.supplierContact ?? null,
      supplier_email: data.supplierEmail ?? null,
      mode: data.mode,
      status: "draft",
      total_amount: String(totalAmount.toFixed(2)),
      notes: data.notes ?? null,
      created_by_id: userId,
      created_at: now,
      updated_at: now,
    })
    .returning({ id: purchaseOrders.id })

  const poId = poRows[0]?.id
  if (!poId) throw new Error("Failed to create purchase order")

  // Insert line items
  if (data.items.length > 0) {
    await adminDb.insert(poLineItems).values(
      data.items.map((item) => {
        const qty = parseFloat(item.quantity) || 1
        const price = parseFloat(item.unitPrice) || 0
        const total = qty * price
        return {
          org_id: orgId,
          po_id: poId,
          shopping_list_item_id: item.shoppingListItemId ?? null,
          item_name: item.itemName,
          quantity: String(qty),
          unit: item.unit,
          unit_price: String(price.toFixed(2)),
          total: String(total.toFixed(2)),
          created_at: now,
        }
      })
    )
  }

  // Update linked shopping_list_items to 'ordered'
  const linkedItemIds = data.items
    .map((i) => i.shoppingListItemId)
    .filter((id): id is string => Boolean(id))

  if (linkedItemIds.length > 0) {
    await adminDb
      .update(shoppingListItems)
      .set({
        status: "ordered",
        ordered_at: now,
        ordered_by_id: userId,
        vendor: data.supplierName,
        po_reference: poNumber,
        updated_at: now,
      })
      .where(inArray(shoppingListItems.id, linkedItemIds))
  }

  revalidatePath("/inventory")

  return { poId, poNumber }
}

// ---------------------------------------------------------------------------
// sendPurchaseOrder
// ---------------------------------------------------------------------------

/**
 * For formal mode POs: send an email with PO summary to the supplier.
 * Updates sent_at and status to 'sent'.
 */
export async function sendPurchaseOrder(poId: string): Promise<{ ok: boolean; error?: string }> {
  const token = await getToken()
  const orgId = token.org_id
  if (!orgId) return { ok: false, error: "No org_id" }

  try {
    // Fetch PO and its line items
    const poRows = await adminDb
      .select()
      .from(purchaseOrders)
      .where(and(eq(purchaseOrders.id, poId), eq(purchaseOrders.org_id, orgId)))
      .limit(1)

    const po = poRows[0]
    if (!po) return { ok: false, error: "PO not found" }
    if (!po.supplier_email) return { ok: false, error: "No supplier email on PO" }
    if (po.mode !== "formal") return { ok: false, error: "Send is only available for formal POs" }

    const lineItemRows = await adminDb
      .select()
      .from(poLineItems)
      .where(eq(poLineItems.po_id, poId))

    // Send email via Resend (use existing email infrastructure pattern)
    const { Resend } = await import("resend")
    const resend = new Resend(process.env.RESEND_API_KEY)

    const lineItemsHtml = lineItemRows
      .map(
        (li) =>
          `<tr>
            <td style="padding:6px 8px;border-bottom:1px solid #e5e7eb">${li.item_name}</td>
            <td style="padding:6px 8px;border-bottom:1px solid #e5e7eb;text-align:right">${parseFloat(li.quantity)} ${li.unit}</td>
            <td style="padding:6px 8px;border-bottom:1px solid #e5e7eb;text-align:right">$${parseFloat(li.unit_price).toFixed(2)}</td>
            <td style="padding:6px 8px;border-bottom:1px solid #e5e7eb;text-align:right">$${parseFloat(li.total).toFixed(2)}</td>
          </tr>`
      )
      .join("")

    const htmlBody = `
      <div style="font-family:sans-serif;max-width:600px;margin:0 auto">
        <h2 style="color:#111827">Purchase Order ${po.po_number}</h2>
        <p style="color:#6b7280">Supplier: <strong>${po.supplier_name}</strong></p>
        ${po.notes ? `<p style="color:#6b7280">Notes: ${po.notes}</p>` : ""}
        <table style="width:100%;border-collapse:collapse;margin-top:16px">
          <thead>
            <tr style="background:#f9fafb">
              <th style="padding:8px;text-align:left;border-bottom:2px solid #e5e7eb">Item</th>
              <th style="padding:8px;text-align:right;border-bottom:2px solid #e5e7eb">Qty</th>
              <th style="padding:8px;text-align:right;border-bottom:2px solid #e5e7eb">Unit Price</th>
              <th style="padding:8px;text-align:right;border-bottom:2px solid #e5e7eb">Total</th>
            </tr>
          </thead>
          <tbody>${lineItemsHtml}</tbody>
          <tfoot>
            <tr>
              <td colspan="3" style="padding:8px;text-align:right;font-weight:bold">Total</td>
              <td style="padding:8px;text-align:right;font-weight:bold">$${parseFloat(po.total_amount).toFixed(2)}</td>
            </tr>
          </tfoot>
        </table>
        <p style="color:#9ca3af;font-size:12px;margin-top:24px">Sent via DeweyIQ</p>
      </div>
    `

    await resend.emails.send({
      from: process.env.EMAIL_FROM ?? "noreply@deweyiq.com",
      to: po.supplier_email,
      subject: `Purchase Order ${po.po_number}`,
      html: htmlBody,
    })

    // Update PO status
    await adminDb
      .update(purchaseOrders)
      .set({
        status: "sent",
        sent_at: new Date(),
        updated_at: new Date(),
      })
      .where(eq(purchaseOrders.id, poId))

    revalidatePath("/inventory")
    return { ok: true }
  } catch (err) {
    console.error("[sendPurchaseOrder] Error:", err)
    return { ok: false, error: "Failed to send purchase order" }
  }
}

// ---------------------------------------------------------------------------
// updatePurchaseOrderStatus
// ---------------------------------------------------------------------------

/**
 * Transitions a PO status. When complete, optionally marks linked shopping_list_items as 'received'.
 */
export async function updatePurchaseOrderStatus(
  poId: string,
  status: "partial" | "complete" | "cancelled",
  markItemsReceived = false
): Promise<{ ok: boolean; error?: string }> {
  const token = await getToken()
  const orgId = token.org_id
  if (!orgId) return { ok: false, error: "No org_id" }
  const userId = token.sub

  const now = new Date()

  await adminDb
    .update(purchaseOrders)
    .set({ status, updated_at: now })
    .where(and(eq(purchaseOrders.id, poId), eq(purchaseOrders.org_id, orgId)))

  if (status === "complete" && markItemsReceived) {
    // Find all shopping_list_item_ids linked via po_line_items
    const lineRows = await adminDb
      .select({ shopping_list_item_id: poLineItems.shopping_list_item_id })
      .from(poLineItems)
      .where(eq(poLineItems.po_id, poId))

    const linkedItemIds = lineRows
      .map((r) => r.shopping_list_item_id)
      .filter((id): id is string => Boolean(id))

    if (linkedItemIds.length > 0) {
      await adminDb
        .update(shoppingListItems)
        .set({
          status: "received",
          received_at: now,
          received_by_id: userId,
          updated_at: now,
        })
        .where(inArray(shoppingListItems.id, linkedItemIds))
    }
  }

  revalidatePath("/inventory")
  return { ok: true }
}

// ---------------------------------------------------------------------------
// getSpendingInsights
// ---------------------------------------------------------------------------

/**
 * Aggregate purchase_orders + po_line_items for spending trends.
 * Returns time-series for line chart and breakdown for bar chart.
 * Uses LEFT JOIN + GROUP BY (no correlated subqueries).
 */
export async function getSpendingInsights(
  period: "week" | "month" | "quarter" = "month",
  compareBy: "supplier" | "category" = "supplier"
): Promise<SpendingInsightsData> {
  const token = await getToken()

  return withRls(token, async (db) => {
    const now = new Date()
    let startDate: Date
    if (period === "week") {
      startDate = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000)
    } else if (period === "month") {
      startDate = new Date(now.getFullYear(), now.getMonth() - 1, now.getDate())
    } else {
      startDate = new Date(now.getFullYear(), now.getMonth() - 3, now.getDate())
    }

    // Time-series: daily totals from purchase_orders
    const timeSeriesRows = await db
      .select({
        date: sql<string>`DATE(${purchaseOrders.created_at} AT TIME ZONE 'UTC')`,
        total: sql<string>`SUM(CAST(${purchaseOrders.total_amount} AS NUMERIC))`,
      })
      .from(purchaseOrders)
      .where(
        and(
          sql`${purchaseOrders.status} NOT IN ('cancelled', 'draft')`,
          sql`${purchaseOrders.created_at} >= ${startDate.toISOString()}`
        )
      )
      .groupBy(sql`DATE(${purchaseOrders.created_at} AT TIME ZONE 'UTC')`)
      .orderBy(sql`DATE(${purchaseOrders.created_at} AT TIME ZONE 'UTC')`)

    const timeSeries = timeSeriesRows.map((r) => ({
      date: r.date,
      total: parseFloat(r.total) || 0,
    }))

    // Breakdown by supplier_name
    const breakdownRows = await db
      .select({
        key: purchaseOrders.supplier_name,
        total: sql<string>`SUM(CAST(${purchaseOrders.total_amount} AS NUMERIC))`,
      })
      .from(purchaseOrders)
      .where(
        and(
          sql`${purchaseOrders.status} NOT IN ('cancelled', 'draft')`,
          sql`${purchaseOrders.created_at} >= ${startDate.toISOString()}`
        )
      )
      .groupBy(purchaseOrders.supplier_name)
      .orderBy(sql`SUM(CAST(${purchaseOrders.total_amount} AS NUMERIC)) DESC`)

    const rawBreakdown = breakdownRows.map((r) => ({
      key: r.key,
      total: parseFloat(r.total) || 0,
    }))

    const grandTotal = rawBreakdown.reduce((sum, r) => sum + r.total, 0)

    const breakdown = rawBreakdown.map((r) => ({
      key: r.key,
      label: r.key,
      total: r.total,
      percentage: grandTotal > 0 ? Math.round((r.total / grandTotal) * 100) : 0,
    }))

    return { timeSeries, breakdown }
  })
}
