"use server"

/**
 * payments.ts -- Manual payment recording, payment status queries, invoice voiding,
 * and AutoPay enrollment/charging.
 *
 * Key patterns:
 * - recordManualPayment: owner/office records check/cash payments against invoices
 * - getPaymentsForInvoice: returns all payment_records for an invoice
 * - voidInvoice: owner-only, cancels any pending PaymentIntent and voids the invoice
 * - enableAutoPay: saves payment method for future off-session charges
 * - chargeAutoPay: creates off-session PaymentIntent for AutoPay customers
 * - disableAutoPay: turns off AutoPay for a customer
 * - withRls for user-facing queries, adminDb for public/cron contexts
 */

import { revalidatePath } from "next/cache"
import { createClient } from "@/lib/supabase/server"
import { withRls, adminDb } from "@/lib/db"
import type { SupabaseToken } from "@/lib/db"
import {
  invoices,
  paymentRecords,
  customers,
  orgSettings,
} from "@/lib/db/schema"
import { eq, and } from "drizzle-orm"
import { getStripe } from "@/lib/stripe/client"
import { syncPaymentToQbo } from "@/actions/qbo-sync"

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface PaymentRecord {
  id: string
  org_id: string
  invoice_id: string
  amount: string
  method: string
  status: string
  stripe_payment_intent_id: string | null
  settled_at: Date | null
  failure_reason: string | null
  attempt_count: number
  created_at: Date
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
// recordManualPayment
// ---------------------------------------------------------------------------

/**
 * Records a manual payment (check or cash) against an invoice.
 * Owner + office only.
 * If payment covers invoice total, marks invoice as paid.
 */
export async function recordManualPayment(
  invoiceId: string,
  method: "check" | "cash",
  amount: string,
  notes?: string
): Promise<{ success: boolean; error?: string }> {
  const token = await getRlsToken()
  if (!token) return { success: false, error: "Not authenticated" }

  const userRole = token.user_role as string | undefined
  if (!userRole || !["owner", "office"].includes(userRole)) {
    return { success: false, error: "Only owners and office staff can record payments" }
  }

  const orgId = token.org_id as string
  if (!orgId) return { success: false, error: "No org found" }

  const parsedAmount = parseFloat(amount)
  if (isNaN(parsedAmount) || parsedAmount <= 0) {
    return { success: false, error: "Invalid payment amount" }
  }

  try {
    const now = new Date()

    // Fetch the invoice to check status and total
    const [invoice] = await withRls(token, (db) =>
      db
        .select({
          id: invoices.id,
          status: invoices.status,
          total: invoices.total,
        })
        .from(invoices)
        .where(and(eq(invoices.id, invoiceId), eq(invoices.org_id, orgId)))
        .limit(1)
    )

    if (!invoice) {
      return { success: false, error: "Invoice not found" }
    }

    if (invoice.status === "paid") {
      return { success: false, error: "Invoice is already paid" }
    }

    if (invoice.status === "void") {
      return { success: false, error: "Cannot record payment for a voided invoice" }
    }

    // Create payment_records entry
    const insertedPayment = await withRls(token, (db) =>
      db.insert(paymentRecords).values({
        org_id: orgId,
        invoice_id: invoiceId,
        amount: parsedAmount.toFixed(2),
        method,
        status: "settled",
        settled_at: now,
      }).returning({ id: paymentRecords.id })
    )

    const paymentRecordId = insertedPayment[0]?.id

    // If amount covers invoice total, mark invoice as paid
    const invoiceTotal = parseFloat(invoice.total)
    if (parsedAmount >= invoiceTotal) {
      await withRls(token, (db) =>
        db
          .update(invoices)
          .set({
            status: "paid",
            paid_at: now,
            payment_method: method,
            updated_at: now,
          })
          .where(eq(invoices.id, invoiceId))
      )
    }

    // Fire-and-forget QBO sync -- never blocks payment recording
    if (paymentRecordId) {
      syncPaymentToQbo(paymentRecordId).catch((err) =>
        console.error("[recordManualPayment] QBO sync error:", err)
      )
    }

    revalidatePath("/work-orders")
    revalidatePath(`/work-orders/${invoiceId}`)

    return { success: true }
  } catch (err) {
    console.error("[recordManualPayment] Error:", err)
    return {
      success: false,
      error: err instanceof Error ? err.message : "Failed to record payment",
    }
  }
}

// ---------------------------------------------------------------------------
// getPaymentsForInvoice
// ---------------------------------------------------------------------------

/**
 * Returns all payment_records for an invoice, ordered by creation date desc.
 */
export async function getPaymentsForInvoice(
  invoiceId: string
): Promise<PaymentRecord[]> {
  const token = await getRlsToken()
  if (!token) return []

  try {
    const rows = await withRls(token, (db) =>
      db
        .select()
        .from(paymentRecords)
        .where(eq(paymentRecords.invoice_id, invoiceId))
        .orderBy(paymentRecords.created_at)
    )

    return rows as PaymentRecord[]
  } catch (err) {
    console.error("[getPaymentsForInvoice] Error:", err)
    return []
  }
}

// ---------------------------------------------------------------------------
// voidInvoice
// ---------------------------------------------------------------------------

/**
 * Voids an invoice. Owner only.
 * If the invoice has a pending PaymentIntent, cancels it via Stripe API.
 */
export async function voidInvoice(
  invoiceId: string
): Promise<{ success: boolean; error?: string }> {
  const token = await getRlsToken()
  if (!token) return { success: false, error: "Not authenticated" }

  const userRole = token.user_role as string | undefined
  if (userRole !== "owner") {
    return { success: false, error: "Only owners can void invoices" }
  }

  const orgId = token.org_id as string
  if (!orgId) return { success: false, error: "No org found" }

  try {
    // Fetch the invoice
    const [invoice] = await withRls(token, (db) =>
      db
        .select({
          id: invoices.id,
          status: invoices.status,
          stripe_payment_intent_id: invoices.stripe_payment_intent_id,
        })
        .from(invoices)
        .where(and(eq(invoices.id, invoiceId), eq(invoices.org_id, orgId)))
        .limit(1)
    )

    if (!invoice) {
      return { success: false, error: "Invoice not found" }
    }

    if (invoice.status === "void") {
      return { success: false, error: "Invoice is already voided" }
    }

    if (invoice.status === "paid") {
      return { success: false, error: "Cannot void a paid invoice" }
    }

    // Cancel pending PaymentIntent if it exists
    if (invoice.stripe_payment_intent_id) {
      try {
        const stripe = getStripe()
        await stripe.paymentIntents.cancel(invoice.stripe_payment_intent_id)
      } catch (stripeErr) {
        // Non-fatal -- PaymentIntent may already be canceled or in a terminal state
        console.warn("[voidInvoice] Could not cancel PaymentIntent:", stripeErr)
      }
    }

    // Update invoice status to void
    await withRls(token, (db) =>
      db
        .update(invoices)
        .set({
          status: "void",
          updated_at: new Date(),
        })
        .where(eq(invoices.id, invoiceId))
    )

    revalidatePath("/work-orders")
    revalidatePath(`/work-orders/${invoiceId}`)

    return { success: true }
  } catch (err) {
    console.error("[voidInvoice] Error:", err)
    return {
      success: false,
      error: err instanceof Error ? err.message : "Failed to void invoice",
    }
  }
}

// ---------------------------------------------------------------------------
// enableAutoPay
// ---------------------------------------------------------------------------

/**
 * Saves a payment method on a customer for future automatic charges.
 * Called from the public payment page after SetupIntent confirmation.
 * Uses adminDb -- no user session in public payment context.
 */
export async function enableAutoPay(
  customerId: string,
  paymentMethodId: string
): Promise<{ success: boolean; error?: string }> {
  if (!customerId || !paymentMethodId) {
    return { success: false, error: "Missing customer or payment method ID" }
  }

  try {
    await adminDb
      .update(customers)
      .set({
        autopay_enabled: true,
        autopay_method_id: paymentMethodId,
        updated_at: new Date(),
      })
      .where(eq(customers.id, customerId))

    console.log("[enableAutoPay] AutoPay enabled for customer:", customerId)
    return { success: true }
  } catch (err) {
    console.error("[enableAutoPay] Error:", err)
    return {
      success: false,
      error: err instanceof Error ? err.message : "Failed to enable AutoPay",
    }
  }
}

// ---------------------------------------------------------------------------
// disableAutoPay
// ---------------------------------------------------------------------------

/**
 * Turns off AutoPay for a customer.
 * Owner + office only (uses withRls).
 */
export async function disableAutoPay(
  customerId: string
): Promise<{ success: boolean; error?: string }> {
  const token = await getRlsToken()
  if (!token) return { success: false, error: "Not authenticated" }

  const userRole = token.user_role as string | undefined
  if (!userRole || !["owner", "office"].includes(userRole)) {
    return { success: false, error: "Only owners and office staff can manage AutoPay" }
  }

  try {
    await withRls(token, (db) =>
      db
        .update(customers)
        .set({
          autopay_enabled: false,
          autopay_method_id: null,
          updated_at: new Date(),
        })
        .where(eq(customers.id, customerId))
    )

    revalidatePath(`/customers/${customerId}`)
    return { success: true }
  } catch (err) {
    console.error("[disableAutoPay] Error:", err)
    return {
      success: false,
      error: err instanceof Error ? err.message : "Failed to disable AutoPay",
    }
  }
}

// ---------------------------------------------------------------------------
// chargeAutoPay
// ---------------------------------------------------------------------------

/**
 * Charges an AutoPay customer off-session for a given invoice.
 * Creates a PaymentIntent with confirm:true using the saved payment method.
 *
 * Uses adminDb -- called from billing.ts (invoice generation) and dunning.ts
 * (retry logic), both of which may run without a user session.
 *
 * Does NOT mark the invoice as paid -- waits for webhook confirmation.
 */
export async function chargeAutoPay(
  invoiceId: string
): Promise<{ success: boolean; paymentIntentId?: string; error?: string }> {
  try {
    // -- 1. Fetch invoice ---------------------------------------------------
    const [invoice] = await adminDb
      .select()
      .from(invoices)
      .where(eq(invoices.id, invoiceId))
      .limit(1)

    if (!invoice) {
      return { success: false, error: "Invoice not found" }
    }

    if (invoice.status === "paid") {
      return { success: false, error: "Invoice already paid" }
    }

    // -- 2. Fetch customer --------------------------------------------------
    const [customer] = await adminDb
      .select()
      .from(customers)
      .where(eq(customers.id, invoice.customer_id))
      .limit(1)

    if (!customer) {
      return { success: false, error: "Customer not found" }
    }

    if (!customer.autopay_enabled || !customer.autopay_method_id) {
      return { success: false, error: "AutoPay not enabled for this customer" }
    }

    if (!customer.stripe_customer_id) {
      return { success: false, error: "No Stripe customer on record" }
    }

    // -- 3. Fetch org settings for stripe_account_id ------------------------
    const [settings] = await adminDb
      .select()
      .from(orgSettings)
      .where(eq(orgSettings.org_id, invoice.org_id))
      .limit(1)

    if (!settings?.stripe_account_id || !settings.stripe_onboarding_done) {
      return { success: false, error: "Stripe not configured for this org" }
    }

    const stripeAccountId = settings.stripe_account_id

    // -- 4. Calculate amount ------------------------------------------------
    const invoiceTotal = parseFloat(invoice.total)
    const totalCents = Math.round(invoiceTotal * 100)

    if (totalCents <= 0) {
      return { success: false, error: "Invoice total is zero" }
    }

    // Apply surcharge for card payments if enabled
    let applicationFee: number | undefined
    if (settings.cc_surcharge_enabled && settings.cc_surcharge_pct) {
      const surchargeRate = parseFloat(settings.cc_surcharge_pct)
      applicationFee = Math.round(invoiceTotal * surchargeRate * 100)
    }

    // -- 5. Create off-session PaymentIntent --------------------------------
    const stripe = getStripe()

    const paymentIntent = await stripe.paymentIntents.create(
      {
        amount: totalCents,
        currency: "usd",
        customer: customer.stripe_customer_id,
        payment_method: customer.autopay_method_id,
        off_session: true,
        confirm: true,
        application_fee_amount: applicationFee || undefined,
        metadata: {
          invoice_id: invoiceId,
          org_id: invoice.org_id,
          customer_id: customer.id,
          autopay: "true",
        },
      },
      { stripeAccount: stripeAccountId }
    )

    // -- 6. Save PI ID on invoice -------------------------------------------
    await adminDb
      .update(invoices)
      .set({
        stripe_payment_intent_id: paymentIntent.id,
        updated_at: new Date(),
      })
      .where(eq(invoices.id, invoiceId))

    // -- 7. Create pending payment_records entry ----------------------------
    await adminDb.insert(paymentRecords).values({
      org_id: invoice.org_id,
      invoice_id: invoiceId,
      amount: invoiceTotal.toFixed(2),
      method: "card", // Updated by webhook if ACH
      status: "pending",
      stripe_payment_intent_id: paymentIntent.id,
    })

    console.log("[chargeAutoPay] PaymentIntent created:", paymentIntent.id, "for invoice:", invoiceId)
    return { success: true, paymentIntentId: paymentIntent.id }
  } catch (err: unknown) {
    // Handle authentication_required (3DS needed)
    const stripeError = err as { code?: string; message?: string }
    if (stripeError.code === "authentication_required") {
      console.warn("[chargeAutoPay] 3DS required for invoice:", invoiceId, "- customer must authenticate manually")
      return {
        success: false,
        error: "Payment requires authentication. Customer will receive a payment link.",
      }
    }

    console.error("[chargeAutoPay] Error:", err)
    return {
      success: false,
      error: err instanceof Error ? err.message : "Failed to charge AutoPay",
    }
  }
}
