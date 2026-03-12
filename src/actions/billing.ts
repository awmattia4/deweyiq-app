"use server"

/**
 * billing.ts — Billing model logic, invoice generation, and bulk invoicing.
 *
 * Phase 7: Billing & Payments — Plan 01
 *
 * Key patterns:
 * - updateCustomerBillingModel: set billing model per customer
 * - generateInvoiceForCustomer: create draft invoice using billing model
 * - generateAllInvoices: bulk generation with atomic sequential numbering
 * - getPlusChemicalsLineItems: extract chemical dosing from service visits
 *
 * Uses withRls for user-facing queries, adminDb for atomic counter operations.
 */

import { revalidatePath } from "next/cache"
import { createClient } from "@/lib/supabase/server"
import { withRls, adminDb } from "@/lib/db"
import type { SupabaseToken } from "@/lib/db"
import {
  customers,
  invoices,
  invoiceLineItems,
  orgSettings,
  routeStops,
  serviceVisits,
} from "@/lib/db/schema"
import { eq, and, gte, lte, sql, isNotNull } from "drizzle-orm"
import { syncInvoiceToQbo } from "@/actions/qbo-sync"
import { chargeAutoPay } from "@/actions/payments"
import { toLocalDateString } from "@/lib/date-utils"

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type BillingModel = "per_stop" | "flat_rate" | "plus_chemicals" | "custom"

interface DraftLineItem {
  description: string
  item_type: string
  quantity: string
  unit: string
  unit_price: string
  is_taxable: boolean
  visit_id?: string | null
  stop_date?: string | null
}

interface BulkGenerationResult {
  created: number
  skipped: number
  errors: string[]
  autoPay?: { charged: number; failed: number }
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

async function getRlsToken(): Promise<SupabaseToken | null> {
  const supabase = await createClient()
  const { data: claimsData } = await supabase.auth.getClaims()
  if (!claimsData?.claims) return null
  return claimsData.claims as SupabaseToken
}

function formatDate(dateStr: string): string {
  const d = new Date(dateStr + "T12:00:00")
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })
}

function addDays(dateStr: string, days: number): string {
  const d = new Date(dateStr + "T12:00:00")
  d.setDate(d.getDate() + days)
  return toLocalDateString(d)
}

// ---------------------------------------------------------------------------
// updateCustomerBillingModel
// ---------------------------------------------------------------------------

/**
 * Updates billing_model and optionally flat_rate_amount on a customer.
 */
export async function updateCustomerBillingModel(
  customerId: string,
  model: string | null,
  flatRateAmount?: string
): Promise<{ success: boolean; error?: string }> {
  const token = await getRlsToken()
  if (!token) return { success: false, error: "Not authenticated" }

  const userRole = token.user_role as string | undefined
  if (!userRole || !["owner", "office"].includes(userRole)) {
    return { success: false, error: "Insufficient permissions" }
  }

  try {
    await withRls(token, async (db) => {
      await db
        .update(customers)
        .set({
          billing_model: model || null,
          flat_rate_amount: model === "flat_rate" && flatRateAmount ? flatRateAmount : null,
          updated_at: new Date(),
        })
        .where(eq(customers.id, customerId))
    })

    revalidatePath(`/customers/${customerId}`)
    revalidatePath("/customers")
    return { success: true }
  } catch (err) {
    console.error("[updateCustomerBillingModel] Error:", err)
    return { success: false, error: "Failed to update billing model" }
  }
}

// ---------------------------------------------------------------------------
// getPlusChemicalsLineItems
// ---------------------------------------------------------------------------

/**
 * Extracts chemical dosing data from service_visits.chemistry_readings
 * for a given customer and date range. Returns draft line items for
 * plus-chemicals billing model.
 */
export async function getPlusChemicalsLineItems(
  customerId: string,
  periodStart: string,
  periodEnd: string
): Promise<DraftLineItem[]> {
  const token = await getRlsToken()
  if (!token) return []

  try {
    const visits = await withRls(token, async (db) =>
      db
        .select({
          id: serviceVisits.id,
          visited_at: serviceVisits.visited_at,
          chemistry_readings: serviceVisits.chemistry_readings,
        })
        .from(serviceVisits)
        .where(
          and(
            eq(serviceVisits.customer_id, customerId),
            gte(serviceVisits.visited_at, new Date(periodStart + "T00:00:00")),
            lte(serviceVisits.visited_at, new Date(periodEnd + "T23:59:59")),
            eq(serviceVisits.status, "complete")
          )
        )
    )

    const chemicalItems: DraftLineItem[] = []

    for (const visit of visits) {
      if (!visit.chemistry_readings) continue

      const readings = visit.chemistry_readings as Record<string, unknown>
      const dosing = readings.dosing as Record<string, { amount: number; unit: string }> | undefined

      if (!dosing) continue

      const visitDate = toLocalDateString(visit.visited_at)

      for (const [chemical, dose] of Object.entries(dosing)) {
        if (!dose || typeof dose.amount !== "number" || dose.amount <= 0) continue

        const chemName = chemical
          .replace(/_/g, " ")
          .replace(/\b\w/g, (c) => c.toUpperCase())

        chemicalItems.push({
          description: `${chemName} - ${formatDate(visitDate)}`,
          item_type: "chemical",
          quantity: String(dose.amount),
          unit: dose.unit || "oz",
          unit_price: "0", // Office fills in cost per unit before finalizing
          is_taxable: true,
          visit_id: visit.id,
          stop_date: visitDate,
        })
      }
    }

    return chemicalItems
  } catch (err) {
    console.error("[getPlusChemicalsLineItems] Error:", err)
    return []
  }
}

// ---------------------------------------------------------------------------
// generateInvoiceForCustomer
// ---------------------------------------------------------------------------

/**
 * Creates a draft invoice for one customer based on their billing model.
 *
 * - per_stop: One line item per completed stop in the billing period
 * - flat_rate: Single line item with customer's flat_rate_amount
 * - plus_chemicals: Per-stop items + chemical dosing line items
 * - custom: Empty draft invoice — office adds line items manually
 *
 * Returns the created invoice ID, or null on failure.
 */
export async function generateInvoiceForCustomer(
  customerId: string,
  periodStart: string,
  periodEnd: string
): Promise<string | null> {
  const token = await getRlsToken()
  if (!token) return null

  const orgId = token.org_id as string
  const userRole = token.user_role as string | undefined
  if (!userRole || !["owner", "office"].includes(userRole)) return null

  try {
    // ── 1. Fetch customer ──────────────────────────────────────────────────
    const custRows = await withRls(token, async (db) =>
      db
        .select({
          id: customers.id,
          billing_model: customers.billing_model,
          flat_rate_amount: customers.flat_rate_amount,
          tax_exempt: customers.tax_exempt,
          autopay_enabled: customers.autopay_enabled,
        })
        .from(customers)
        .where(and(eq(customers.id, customerId), eq(customers.org_id, orgId)))
        .limit(1)
    )

    const cust = custRows[0]
    if (!cust || !cust.billing_model) {
      console.error("[generateInvoiceForCustomer] Customer not found or no billing model")
      return null
    }

    const billingModel = cust.billing_model as BillingModel

    // ── 2. Fetch org settings ──────────────────────────────────────────────
    const settingsRows = await adminDb
      .select({
        default_hourly_rate: orgSettings.default_hourly_rate,
        default_tax_rate: orgSettings.default_tax_rate,
        default_payment_terms_days: orgSettings.default_payment_terms_days,
      })
      .from(orgSettings)
      .where(eq(orgSettings.org_id, orgId))
      .limit(1)

    const settings = settingsRows[0]
    const perStopRate = settings?.default_hourly_rate ?? "75"
    const taxRate = parseFloat(settings?.default_tax_rate ?? "0.0875")
    const paymentTermsDays = settings?.default_payment_terms_days ?? 30

    // ── 3. Build line items based on billing model ─────────────────────────
    const lineItems: DraftLineItem[] = []
    const now = new Date()
    const dueDate = addDays(toLocalDateString(now), paymentTermsDays)

    if (billingModel === "per_stop" || billingModel === "plus_chemicals") {
      // Query completed stops in the billing period
      const stops = await withRls(token, async (db) =>
        db
          .select({
            id: routeStops.id,
            scheduled_date: routeStops.scheduled_date,
          })
          .from(routeStops)
          .where(
            and(
              eq(routeStops.customer_id, customerId),
              eq(routeStops.status, "complete"),
              gte(routeStops.scheduled_date, periodStart),
              lte(routeStops.scheduled_date, periodEnd)
            )
          )
      )

      // Find matching service visits for each stop to link visit_id
      const visits = await withRls(token, async (db) =>
        db
          .select({
            id: serviceVisits.id,
            visited_at: serviceVisits.visited_at,
          })
          .from(serviceVisits)
          .where(
            and(
              eq(serviceVisits.customer_id, customerId),
              eq(serviceVisits.status, "complete"),
              gte(serviceVisits.visited_at, new Date(periodStart + "T00:00:00")),
              lte(serviceVisits.visited_at, new Date(periodEnd + "T23:59:59"))
            )
          )
      )

      // Map visits by date for linking
      const visitsByDate = new Map<string, string>()
      for (const v of visits) {
        const dateKey = toLocalDateString(v.visited_at)
        visitsByDate.set(dateKey, v.id)
      }

      for (const stop of stops) {
        lineItems.push({
          description: `Pool Service - ${formatDate(stop.scheduled_date)}`,
          item_type: "service",
          quantity: "1",
          unit: "visit",
          unit_price: perStopRate,
          is_taxable: false,
          visit_id: visitsByDate.get(stop.scheduled_date) ?? null,
          stop_date: stop.scheduled_date,
        })
      }

      // For plus_chemicals, also add chemical line items
      if (billingModel === "plus_chemicals") {
        const chemItems = await getPlusChemicalsLineItems(customerId, periodStart, periodEnd)
        lineItems.push(...chemItems)
      }
    } else if (billingModel === "flat_rate") {
      const amount = cust.flat_rate_amount ?? "0"
      lineItems.push({
        description: `Monthly Service - ${formatDate(periodStart)} to ${formatDate(periodEnd)}`,
        item_type: "service",
        quantity: "1",
        unit: "month",
        unit_price: amount,
        is_taxable: false,
      })
    }
    // For "custom" billing model, line items array stays empty — office adds manually

    // ── 4. Calculate totals ────────────────────────────────────────────────
    let subtotal = 0
    for (const li of lineItems) {
      const qty = parseFloat(li.quantity) || 0
      const price = parseFloat(li.unit_price) || 0
      subtotal += qty * price
    }

    let taxAmount = 0
    if (!cust.tax_exempt) {
      for (const li of lineItems) {
        if (li.is_taxable) {
          const qty = parseFloat(li.quantity) || 0
          const price = parseFloat(li.unit_price) || 0
          taxAmount += qty * price * taxRate
        }
      }
    }

    const total = subtotal + taxAmount

    // ── 5. Create invoice + line items ─────────────────────────────────────
    const invoiceId = await withRls(token, async (db) => {
      const inserted = await db
        .insert(invoices)
        .values({
          org_id: orgId,
          customer_id: customerId,
          status: "draft",
          billing_model: billingModel,
          billing_period_start: periodStart,
          billing_period_end: periodEnd,
          due_date: dueDate,
          subtotal: subtotal.toFixed(2),
          tax_amount: taxAmount.toFixed(2),
          discount_amount: "0",
          total: total.toFixed(2),
          created_at: now,
          updated_at: now,
        })
        .returning({ id: invoices.id })

      const newId = inserted[0]?.id
      if (!newId) return null

      if (lineItems.length > 0) {
        await db.insert(invoiceLineItems).values(
          lineItems.map((li, idx) => {
            const qty = parseFloat(li.quantity) || 0
            const price = parseFloat(li.unit_price) || 0
            return {
              org_id: orgId,
              invoice_id: newId,
              description: li.description,
              item_type: li.item_type,
              quantity: li.quantity,
              unit: li.unit,
              unit_price: li.unit_price,
              is_taxable: li.is_taxable,
              line_total: (qty * price).toFixed(2),
              sort_order: idx,
              visit_id: li.visit_id ?? null,
              stop_date: li.stop_date ?? null,
              created_at: now,
            }
          })
        )
      }

      return newId
    })

    if (invoiceId) {
      // Fire-and-forget QBO sync -- never blocks invoice generation
      syncInvoiceToQbo(invoiceId).catch((err) =>
        console.error("[generateInvoiceForCustomer] QBO sync error:", err)
      )

      // AutoPay: If customer has AutoPay enabled, charge immediately.
      // Wrap in try/catch -- AutoPay failure must NOT block invoice creation.
      if (cust.autopay_enabled) {
        try {
          const result = await chargeAutoPay(invoiceId)
          if (result.success) {
            console.log("[generateInvoiceForCustomer] AutoPay charged:", invoiceId)
          } else {
            console.warn("[generateInvoiceForCustomer] AutoPay failed:", result.error)
          }
        } catch (autoPayErr) {
          console.error("[generateInvoiceForCustomer] AutoPay error (non-blocking):", autoPayErr)
        }
      }

      revalidatePath("/work-orders")
    }

    return invoiceId
  } catch (err) {
    console.error("[generateInvoiceForCustomer] Error:", err)
    return null
  }
}

// ---------------------------------------------------------------------------
// generateAllInvoices
// ---------------------------------------------------------------------------

/**
 * Bulk invoice generation for all active customers with a billing model.
 *
 * - Checks for existing invoices in the same period (prevents duplicates)
 * - Generates sequentially (not Promise.all) to avoid race conditions
 * - Returns count of created/skipped invoices and any errors
 */
export async function generateAllInvoices(
  periodStart: string,
  periodEnd: string
): Promise<BulkGenerationResult> {
  const token = await getRlsToken()
  if (!token) return { created: 0, skipped: 0, errors: ["Not authenticated"] }

  const orgId = token.org_id as string
  const userRole = token.user_role as string | undefined
  if (!userRole || !["owner", "office"].includes(userRole)) {
    return { created: 0, skipped: 0, errors: ["Insufficient permissions"] }
  }

  const result: BulkGenerationResult = { created: 0, skipped: 0, errors: [] }

  try {
    // ── 1. Fetch all active customers with a billing model ─────────────────
    const eligibleCustomers = await withRls(token, async (db) =>
      db
        .select({
          id: customers.id,
          full_name: customers.full_name,
          billing_model: customers.billing_model,
        })
        .from(customers)
        .where(
          and(
            eq(customers.org_id, orgId),
            eq(customers.status, "active"),
            isNotNull(customers.billing_model)
          )
        )
    )

    if (eligibleCustomers.length === 0) {
      return result
    }

    // ── 2. Fetch existing invoices for this period (prevent duplicates) ────
    const existingInvoices = await withRls(token, async (db) =>
      db
        .select({
          customer_id: invoices.customer_id,
          billing_period_start: invoices.billing_period_start,
          billing_period_end: invoices.billing_period_end,
        })
        .from(invoices)
        .where(eq(invoices.org_id, orgId))
    )

    const existingSet = new Set(
      existingInvoices
        .filter(
          (inv) =>
            inv.billing_period_start === periodStart &&
            inv.billing_period_end === periodEnd
        )
        .map((inv) => inv.customer_id)
    )

    // ── 3. Generate invoices sequentially ──────────────────────────────────
    for (const cust of eligibleCustomers) {
      if (existingSet.has(cust.id)) {
        result.skipped++
        continue
      }

      try {
        const invoiceId = await generateInvoiceForCustomer(
          cust.id,
          periodStart,
          periodEnd
        )

        if (invoiceId) {
          result.created++
        } else {
          result.skipped++
        }
      } catch (err) {
        const msg = `${cust.full_name}: ${err instanceof Error ? err.message : "Unknown error"}`
        result.errors.push(msg)
      }
    }

    revalidatePath("/work-orders")
    return result
  } catch (err) {
    console.error("[generateAllInvoices] Error:", err)
    return {
      ...result,
      errors: [
        ...result.errors,
        err instanceof Error ? err.message : "Bulk generation failed",
      ],
    }
  }
}
