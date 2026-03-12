"use server"

/**
 * payments.ts -- Manual payment recording, payment status queries, invoice voiding.
 *
 * Key patterns:
 * - recordManualPayment: owner/office records check/cash payments against invoices
 * - getPaymentsForInvoice: returns all payment_records for an invoice
 * - voidInvoice: owner-only, cancels any pending PaymentIntent and voids the invoice
 * - withRls for all user-facing queries
 */

import { revalidatePath } from "next/cache"
import { createClient } from "@/lib/supabase/server"
import { withRls } from "@/lib/db"
import type { SupabaseToken } from "@/lib/db"
import {
  invoices,
  paymentRecords,
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
