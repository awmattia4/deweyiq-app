/**
 * webhook-handlers.ts -- Event handler functions for Stripe webhook events.
 *
 * Uses adminDb for all operations (webhooks have no user session).
 * All handlers are idempotent -- they check current state before mutating.
 *
 * Handlers:
 * - handlePaymentSucceeded: marks invoice paid, payment_record settled
 * - handlePaymentFailed: creates alert, updates overdue_balance
 * - handleAccountUpdated: syncs onboarding status
 * - handleChargeRefunded: creates refund records
 */

import Stripe from "stripe"
import { adminDb } from "@/lib/db"
import {
  invoices,
  paymentRecords,
  orgSettings,
  customers,
  alerts,
  orgs,
} from "@/lib/db/schema"
import { eq, and, sql } from "drizzle-orm"
import { syncPaymentToQbo } from "@/actions/qbo-sync"
import { createPaymentJournalEntry, createRefundJournalEntry } from "@/lib/accounting/journal"
import { createElement } from "react"
import { render as renderEmail } from "@react-email/render"
import { ReceiptEmail } from "@/lib/emails/receipt-email"
import { Resend } from "resend"
import { getResolvedTemplate } from "@/actions/notification-templates"
import { notifyOrgRole } from "@/lib/notifications/dispatch"
import { createClient as createSupabaseAdmin } from "@supabase/supabase-js"

// ---------------------------------------------------------------------------
// handlePaymentSucceeded
// ---------------------------------------------------------------------------

/**
 * Handles payment_intent.succeeded events.
 * Marks the payment_record as settled and the invoice as paid.
 *
 * Idempotency: If payment_record already has status='settled', skips.
 */
export async function handlePaymentSucceeded(
  paymentIntent: Stripe.PaymentIntent
): Promise<void> {
  const invoiceId = paymentIntent.metadata?.invoice_id
  if (!invoiceId) {
    console.warn("[handlePaymentSucceeded] No invoice_id in metadata, skipping")
    return
  }

  // Check idempotency -- if already settled, skip
  const existingRecords = await adminDb
    .select({ id: paymentRecords.id, status: paymentRecords.status })
    .from(paymentRecords)
    .where(
      and(
        eq(paymentRecords.stripe_payment_intent_id, paymentIntent.id),
        eq(paymentRecords.status, "settled")
      )
    )
    .limit(1)

  if (existingRecords.length > 0) {
    console.log("[handlePaymentSucceeded] Already settled, skipping:", paymentIntent.id)
    return
  }

  const now = new Date()

  // Detect payment method type
  const pmTypes = paymentIntent.payment_method_types ?? []
  // Check the actual charge for the method used
  let paymentMethod = "card"
  if (
    paymentIntent.latest_charge &&
    typeof paymentIntent.latest_charge === "object"
  ) {
    const charge = paymentIntent.latest_charge as Stripe.Charge
    if (charge.payment_method_details?.type === "us_bank_account") {
      paymentMethod = "ach"
    }
  } else if (pmTypes.includes("us_bank_account") && !pmTypes.includes("card")) {
    paymentMethod = "ach"
  }

  // Update payment_records: status -> settled
  await adminDb
    .update(paymentRecords)
    .set({
      status: "settled",
      settled_at: now,
      method: paymentMethod,
    })
    .where(eq(paymentRecords.stripe_payment_intent_id, paymentIntent.id))

  // Update invoice: status -> paid
  await adminDb
    .update(invoices)
    .set({
      status: "paid",
      paid_at: now,
      payment_method: paymentMethod,
      updated_at: now,
    })
    .where(eq(invoices.id, invoiceId))

  // Recalculate customer overdue_balance after payment success
  try {
    const [paidInvoice] = await adminDb
      .select({ customer_id: invoices.customer_id })
      .from(invoices)
      .where(eq(invoices.id, invoiceId))
      .limit(1)

    if (paidInvoice) {
      // Recalculate from remaining overdue invoices
      const [result] = await adminDb
        .select({
          total: sql<string>`COALESCE(SUM(${invoices.total}::numeric), 0)::text`,
        })
        .from(invoices)
        .where(
          and(
            eq(invoices.customer_id, paidInvoice.customer_id),
            sql`${invoices.status} IN ('sent', 'overdue')`,
            sql`${invoices.paid_at} IS NULL`,
            sql`${invoices.due_date} < now()::date`
          )
        )

      await adminDb
        .update(customers)
        .set({
          overdue_balance: result?.total ?? "0",
          updated_at: now,
        })
        .where(eq(customers.id, paidInvoice.customer_id))
    }
  } catch (overdueErr) {
    // Non-fatal -- overdue balance recalculation should never block payment success
    console.error("[handlePaymentSucceeded] Overdue balance recalc error (non-blocking):", overdueErr)
  }

  // Fire-and-forget QBO sync for the settled payment
  const settledRecords = await adminDb
    .select({ id: paymentRecords.id })
    .from(paymentRecords)
    .where(eq(paymentRecords.stripe_payment_intent_id, paymentIntent.id))
    .limit(1)

  if (settledRecords[0]?.id) {
    syncPaymentToQbo(settledRecords[0].id).catch((err) =>
      console.error("[handlePaymentSucceeded] QBO sync error:", err)
    )

    // Fire-and-forget double-entry journal entry for the payment
    // Extract Stripe fee from the charge if available
    let stripeFeeAmountCents: number | undefined
    if (
      paymentIntent.latest_charge &&
      typeof paymentIntent.latest_charge === "object"
    ) {
      const charge = paymentIntent.latest_charge as import("stripe").default.Charge
      // Stripe fee is stored in balance_transaction — we approximate from application_fee_amount
      // For split-fee captures, use balance_transaction.fee when available
      const balanceTx = (charge as { balance_transaction?: { fee?: number } }).balance_transaction
      if (balanceTx && typeof balanceTx === "object" && typeof balanceTx.fee === "number") {
        stripeFeeAmountCents = balanceTx.fee
      }
    }

    createPaymentJournalEntry(settledRecords[0].id, stripeFeeAmountCents).catch((err) =>
      console.error("[handlePaymentSucceeded] Journal entry error:", err)
    )
  }

  // -- Send receipt email -------------------------------------------------------
  try {
    // Fetch customer, org, and invoice details for receipt email
    const [invoice] = await adminDb
      .select({
        total: invoices.total,
        invoice_number: invoices.invoice_number,
        customer_id: invoices.customer_id,
        org_id: invoices.org_id,
      })
      .from(invoices)
      .where(eq(invoices.id, invoiceId))
      .limit(1)

    if (invoice) {
      const [customer] = await adminDb
        .select({
          email: customers.email,
          full_name: customers.full_name,
        })
        .from(customers)
        .where(eq(customers.id, invoice.customer_id))
        .limit(1)

      const [org] = await adminDb
        .select({ name: orgs.name })
        .from(orgs)
        .where(eq(orgs.id, invoice.org_id))
        .limit(1)

      if (customer?.email && org) {
        // Get payment method last4 if available
        let paymentLast4: string | null = null
        if (
          paymentIntent.latest_charge &&
          typeof paymentIntent.latest_charge === "object"
        ) {
          const charge = paymentIntent.latest_charge as Stripe.Charge
          const pmDetails = charge.payment_method_details
          if (pmDetails?.type === "card" && pmDetails.card) {
            paymentLast4 = pmDetails.card.last4 ?? null
          } else if (pmDetails?.type === "us_bank_account" && pmDetails.us_bank_account) {
            paymentLast4 = pmDetails.us_bank_account.last4 ?? null
          }
        }

        const paidAt = now.toLocaleDateString("en-US", {
          year: "numeric",
          month: "long",
          day: "numeric",
        })

        const totalFormatted = new Intl.NumberFormat("en-US", {
          style: "currency",
          currency: "USD",
        }).format(parseFloat(invoice.total))

        // Resolve notification template for receipt_email
        const receiptTemplate = await getResolvedTemplate(invoice.org_id, "receipt_email", {
          customer_name: customer.full_name,
          company_name: org.name,
          invoice_number: invoice.invoice_number ?? "N/A",
          invoice_total: totalFormatted,
          payment_method: paymentMethod,
          paid_at: paidAt,
        })

        // Skip receipt email if template is disabled
        if (receiptTemplate) {
          const emailHtml = await renderEmail(
            createElement(ReceiptEmail, {
              companyName: org.name,
              customerName: customer.full_name,
              invoiceNumber: invoice.invoice_number ?? "N/A",
              totalAmount: totalFormatted,
              paymentMethod: paymentMethod as "card" | "ach" | "check" | "cash",
              paidAt,
              paymentLast4,
              customBody: receiptTemplate.body_html,
              customFooter: null, // Footer resolved into body_html by template engine
            })
          )

          const resendApiKey = process.env.RESEND_API_KEY
          if (resendApiKey) {
            const resend = new Resend(resendApiKey)
            await resend.emails.send({
              from: `${org.name} <billing@poolco.app>`,
              to: [customer.email],
              subject: receiptTemplate.subject ?? `Payment Receipt: Invoice ${invoice.invoice_number ?? ""}`,
              html: emailHtml,
            })
            console.log("[handlePaymentSucceeded] Receipt email sent to:", customer.email)
          } else {
            console.warn("[handlePaymentSucceeded] RESEND_API_KEY not set, skipping receipt email")
          }
        }
      }
    }
  } catch (receiptErr) {
    // Receipt email failure must NOT block payment success flow
    console.error("[handlePaymentSucceeded] Receipt email error (non-blocking):", receiptErr)
  }

  // ── NOTIF-12: Notify owner+office of payment received (fire-and-forget) ────
  try {
    const [invoiceForNotif] = await adminDb
      .select({ total: invoices.total, invoice_number: invoices.invoice_number, customer_id: invoices.customer_id, org_id: invoices.org_id })
      .from(invoices)
      .where(eq(invoices.id, invoiceId))
      .limit(1)

    if (invoiceForNotif) {
      const totalFormatted = new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(parseFloat(invoiceForNotif.total))
      const customerRows = await adminDb
        .select({ full_name: customers.full_name, phone: customers.phone })
        .from(customers)
        .where(eq(customers.id, invoiceForNotif.customer_id))
        .limit(1)
      const customerName = customerRows[0]?.full_name ?? "Customer"
      const customerPhone = customerRows[0]?.phone ?? null

      void notifyOrgRole(invoiceForNotif.org_id, "owner+office", {
        type: "payment_received",
        urgency: "informational",
        title: "Payment received",
        body: `${totalFormatted} from ${customerName}`,
        link: `/billing`,
      }).catch((err) =>
        console.error("[handlePaymentSucceeded] NOTIF-12 dispatch failed (non-blocking):", err)
      )

      // ── NOTIF-27: Send payment_receipt_sms to customer (fire-and-forget) ────
      if (customerPhone) {
        try {
          const smsTemplate = await getResolvedTemplate(invoiceForNotif.org_id, "payment_receipt_sms", {
            customer_name: customerName,
            invoice_number: invoiceForNotif.invoice_number ?? "N/A",
            invoice_total: totalFormatted,
          })
          if (smsTemplate?.sms_text) {
            const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
            const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY
            if (supabaseUrl && serviceRoleKey) {
              const supabaseAdmin = createSupabaseAdmin(supabaseUrl, serviceRoleKey, {
                auth: { autoRefreshToken: false, persistSession: false },
              })
              await supabaseAdmin.functions.invoke("send-sms", {
                body: { to: customerPhone, text: smsTemplate.sms_text, orgId: invoiceForNotif.org_id },
              })
            }
          }
        } catch (smsErr) {
          console.error("[handlePaymentSucceeded] NOTIF-27 SMS failed (non-blocking):", smsErr)
        }
      }
    }
  } catch (notifErr) {
    console.error("[handlePaymentSucceeded] NOTIF-12/27 failed (non-blocking):", notifErr)
  }

  console.log("[handlePaymentSucceeded] Invoice paid:", invoiceId, "via", paymentMethod)
}

// ---------------------------------------------------------------------------
// handlePaymentFailed
// ---------------------------------------------------------------------------

/**
 * Handles payment_intent.payment_failed events.
 * Updates payment_record status, creates an alert, updates overdue_balance.
 *
 * Idempotency: Increments attempt_count rather than creating duplicate records.
 */
export async function handlePaymentFailed(
  paymentIntent: Stripe.PaymentIntent
): Promise<void> {
  const invoiceId = paymentIntent.metadata?.invoice_id
  const orgId = paymentIntent.metadata?.org_id
  if (!invoiceId || !orgId) {
    console.warn("[handlePaymentFailed] Missing metadata, skipping")
    return
  }

  const failureMessage =
    paymentIntent.last_payment_error?.message ?? "Payment failed"

  // Update payment_records: status -> failed
  const existingRecords = await adminDb
    .select({ id: paymentRecords.id, attempt_count: paymentRecords.attempt_count })
    .from(paymentRecords)
    .where(eq(paymentRecords.stripe_payment_intent_id, paymentIntent.id))
    .limit(1)

  if (existingRecords.length > 0) {
    await adminDb
      .update(paymentRecords)
      .set({
        status: "failed",
        failure_reason: failureMessage,
        attempt_count: existingRecords[0].attempt_count + 1,
      })
      .where(eq(paymentRecords.id, existingRecords[0].id))
  }

  // Update invoice status to 'overdue' if it was 'sent'
  const [invoice] = await adminDb
    .select({ status: invoices.status, total: invoices.total, customer_id: invoices.customer_id })
    .from(invoices)
    .where(eq(invoices.id, invoiceId))
    .limit(1)

  if (invoice && invoice.status === "sent") {
    await adminDb
      .update(invoices)
      .set({
        status: "overdue",
        updated_at: new Date(),
      })
      .where(eq(invoices.id, invoiceId))
  }

  // Recalculate customer overdue_balance (absolute, not incremental — avoids
  // double-counting when the same PI fails multiple times via retry webhooks)
  if (invoice) {
    const [result] = await adminDb
      .select({
        total: sql<string>`COALESCE(SUM(${invoices.total}::numeric), 0)::text`,
      })
      .from(invoices)
      .where(
        and(
          eq(invoices.customer_id, invoice.customer_id),
          sql`${invoices.status} IN ('sent', 'overdue')`,
          sql`${invoices.paid_at} IS NULL`,
          sql`${invoices.due_date} < now()::date`
        )
      )

    await adminDb
      .update(customers)
      .set({
        overdue_balance: result?.total ?? "0",
        updated_at: new Date(),
      })
      .where(eq(customers.id, invoice.customer_id))
  }

  // Create alert for payment failure
  try {
    await adminDb
      .insert(alerts)
      .values({
        org_id: orgId,
        alert_type: "payment_failed",
        severity: "critical",
        reference_id: invoiceId,
        reference_type: "invoice",
        title: "Payment failed",
        description: `Payment failed for invoice: ${failureMessage}`,
        metadata: {
          invoice_id: invoiceId,
          payment_intent_id: paymentIntent.id,
          failure_reason: failureMessage,
        },
      })
      .onConflictDoNothing() // Unique constraint on (org_id, alert_type, reference_id)
  } catch (alertErr) {
    // Non-fatal -- alert creation should never block payment processing
    console.error("[handlePaymentFailed] Failed to create alert:", alertErr)
  }

  // ── NOTIF-13: Notify owner+office of payment failure (fire-and-forget) ──────
  // ── NOTIF-28: Send payment_failure_sms to customer (fire-and-forget) ────────
  try {
    if (invoice) {
      const totalFormatted = new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(parseFloat(invoice.total))
      const customerRows = await adminDb
        .select({ full_name: customers.full_name, phone: customers.phone })
        .from(customers)
        .where(eq(customers.id, invoice.customer_id))
        .limit(1)
      const customerName = customerRows[0]?.full_name ?? "Customer"
      const customerPhone = customerRows[0]?.phone ?? null

      void notifyOrgRole(orgId, "owner+office", {
        type: "payment_failed",
        urgency: "needs_action",
        title: "Payment failed",
        body: `${totalFormatted} failed for ${customerName}: ${failureMessage}`,
        link: `/billing`,
      }).catch((err) =>
        console.error("[handlePaymentFailed] NOTIF-13 dispatch failed (non-blocking):", err)
      )

      // NOTIF-28: SMS to customer about failed payment
      if (customerPhone) {
        const [invoiceRow] = await adminDb
          .select({ invoice_number: invoices.invoice_number, org_id: invoices.org_id })
          .from(invoices)
          .where(eq(invoices.id, invoiceId))
          .limit(1)

        if (invoiceRow) {
          const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000"
          try {
            const smsTemplate = await getResolvedTemplate(invoiceRow.org_id, "payment_failure_sms", {
              customer_name: customerName,
              invoice_number: invoiceRow.invoice_number ?? "N/A",
              invoice_total: totalFormatted,
              portal_link: `${appUrl}/portal`,
            })
            if (smsTemplate?.sms_text) {
              const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
              const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY
              if (supabaseUrl && serviceRoleKey) {
                const supabaseAdmin = createSupabaseAdmin(supabaseUrl, serviceRoleKey, {
                  auth: { autoRefreshToken: false, persistSession: false },
                })
                await supabaseAdmin.functions.invoke("send-sms", {
                  body: { to: customerPhone, text: smsTemplate.sms_text, orgId: invoiceRow.org_id },
                })
              }
            }
          } catch (smsErr) {
            console.error("[handlePaymentFailed] NOTIF-28 SMS failed (non-blocking):", smsErr)
          }
        }
      }
    }
  } catch (notifErr) {
    console.error("[handlePaymentFailed] NOTIF-13/28 failed (non-blocking):", notifErr)
  }

  console.log("[handlePaymentFailed] Invoice payment failed:", invoiceId)
}

// ---------------------------------------------------------------------------
// handleAccountUpdated
// ---------------------------------------------------------------------------

/**
 * Handles account.updated events.
 * Syncs the connected account onboarding status with org_settings.
 *
 * Idempotency: Always sets to current state (no delta tracking needed).
 */
export async function handleAccountUpdated(
  account: Stripe.Account
): Promise<void> {
  const accountId = account.id

  // Find org by stripe_account_id
  const [settings] = await adminDb
    .select({ id: orgSettings.id, org_id: orgSettings.org_id })
    .from(orgSettings)
    .where(eq(orgSettings.stripe_account_id, accountId))
    .limit(1)

  if (!settings) {
    console.warn("[handleAccountUpdated] No org found for account:", accountId)
    return
  }

  const onboardingDone =
    (account.charges_enabled ?? false) && (account.details_submitted ?? false)

  await adminDb
    .update(orgSettings)
    .set({
      stripe_onboarding_done: onboardingDone,
      updated_at: new Date(),
    })
    .where(eq(orgSettings.id, settings.id))

  console.log(
    "[handleAccountUpdated] Account",
    accountId,
    "onboarding_done:",
    onboardingDone
  )
}

// ---------------------------------------------------------------------------
// handleChargeRefunded
// ---------------------------------------------------------------------------

/**
 * Handles charge.refunded events.
 * Creates a refund record and updates invoice status if fully refunded.
 *
 * Idempotency: Checks if a refund record already exists for this charge.
 */
export async function handleChargeRefunded(
  charge: Stripe.Charge
): Promise<void> {
  // Get invoice_id from the charge's payment_intent metadata
  const paymentIntentId =
    typeof charge.payment_intent === "string"
      ? charge.payment_intent
      : charge.payment_intent?.id

  if (!paymentIntentId) {
    console.warn("[handleChargeRefunded] No payment_intent on charge, skipping")
    return
  }

  // Find the original payment record
  const [originalRecord] = await adminDb
    .select()
    .from(paymentRecords)
    .where(eq(paymentRecords.stripe_payment_intent_id, paymentIntentId))
    .limit(1)

  if (!originalRecord) {
    console.warn("[handleChargeRefunded] No payment record for PI:", paymentIntentId)
    return
  }

  // Check idempotency -- look for existing refund record for this specific charge.
  // Uses failure_reason to store the charge ID for refund records, ensuring
  // partial refund sequences on the same invoice are not blocked.
  const existingRefunds = await adminDb
    .select({ id: paymentRecords.id })
    .from(paymentRecords)
    .where(
      and(
        eq(paymentRecords.invoice_id, originalRecord.invoice_id),
        eq(paymentRecords.status, "refunded"),
        eq(paymentRecords.failure_reason, charge.id)
      )
    )
    .limit(1)

  if (existingRefunds.length > 0) {
    console.log("[handleChargeRefunded] Refund already recorded for charge, skipping:", charge.id)
    return
  }

  const refundedAmountCents = charge.amount_refunded ?? 0
  const refundedAmount = (refundedAmountCents / 100).toFixed(2)

  // Create refund record with negative amount.
  // Store charge.id in failure_reason for idempotency checks.
  const [insertedRefund] = await adminDb.insert(paymentRecords).values({
    org_id: originalRecord.org_id,
    invoice_id: originalRecord.invoice_id,
    amount: `-${refundedAmount}`,
    method: originalRecord.method,
    status: "refunded",
    stripe_payment_intent_id: paymentIntentId,
    failure_reason: charge.id,
    settled_at: new Date(),
  }).returning({ id: paymentRecords.id })

  // Check if fully refunded
  const originalAmountCents = charge.amount ?? 0
  const isFullRefund = refundedAmountCents >= originalAmountCents

  if (isFullRefund) {
    // Fully refunded -- void the invoice
    await adminDb
      .update(invoices)
      .set({
        status: "void",
        updated_at: new Date(),
      })
      .where(eq(invoices.id, originalRecord.invoice_id))
  }

  // Fire-and-forget double-entry journal entry for the refund
  if (insertedRefund?.id) {
    createRefundJournalEntry(insertedRefund.id, refundedAmount).catch((err) =>
      console.error("[handleChargeRefunded] Journal entry error:", err)
    )
  }

  console.log(
    "[handleChargeRefunded] Refund recorded for invoice:",
    originalRecord.invoice_id,
    isFullRefund ? "(full refund)" : "(partial refund)"
  )
}
