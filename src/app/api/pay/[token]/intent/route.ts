/**
 * POST /api/pay/[token]/intent — Create a Stripe PaymentIntent for an invoice.
 *
 * Public endpoint (no auth required). Token IS the authorization.
 * Uses adminDb because the customer has no Supabase auth session.
 *
 * Creates or reuses a Stripe Customer on the connected account.
 * Calculates surcharge if enabled. Creates a payment_records entry.
 * Returns the PaymentIntent client_secret for Stripe Elements.
 */

import { type NextRequest, NextResponse } from "next/server"
import { verifyPayToken } from "@/lib/pay-token"
import { adminDb } from "@/lib/db"
import { invoices, customers, orgSettings, paymentRecords } from "@/lib/db/schema"
import { eq } from "drizzle-orm"
import { getStripe } from "@/lib/stripe/client"

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ token: string }> }
) {
  const { token } = await params

  // ── 1. Verify pay token ──────────────────────────────────────────────────
  const payload = await verifyPayToken(token)
  if (!payload) {
    return NextResponse.json({ error: "Invalid or expired payment link" }, { status: 401 })
  }

  // ── 2. Fetch invoice ─────────────────────────────────────────────────────
  const [invoice] = await adminDb
    .select()
    .from(invoices)
    .where(eq(invoices.id, payload.invoiceId))
    .limit(1)

  if (!invoice) {
    return NextResponse.json({ error: "Invoice not found" }, { status: 404 })
  }

  if (invoice.status === "paid") {
    return NextResponse.json({ error: "Invoice is already paid" }, { status: 400 })
  }

  if (invoice.status === "void") {
    return NextResponse.json({ error: "Invoice has been voided" }, { status: 400 })
  }

  // ── 3. Fetch org settings ────────────────────────────────────────────────
  const [settings] = await adminDb
    .select()
    .from(orgSettings)
    .where(eq(orgSettings.org_id, invoice.org_id))
    .limit(1)

  if (!settings?.stripe_account_id || !settings.stripe_onboarding_done) {
    return NextResponse.json(
      { error: "Online payment is not available for this company" },
      { status: 400 }
    )
  }

  const stripeAccountId = settings.stripe_account_id

  // ── 4. Fetch or create Stripe Customer ───────────────────────────────────
  const [customer] = await adminDb
    .select()
    .from(customers)
    .where(eq(customers.id, invoice.customer_id))
    .limit(1)

  if (!customer) {
    return NextResponse.json({ error: "Customer not found" }, { status: 404 })
  }

  const stripe = getStripe()
  let stripeCustomerId = customer.stripe_customer_id

  if (!stripeCustomerId) {
    // Create customer on the connected account
    const stripeCustomer = await stripe.customers.create(
      {
        email: customer.email ?? undefined,
        name: customer.full_name,
        metadata: {
          poolco_customer_id: customer.id,
          org_id: invoice.org_id,
        },
      },
      { stripeAccount: stripeAccountId }
    )

    stripeCustomerId = stripeCustomer.id

    // Save back to customers table
    await adminDb
      .update(customers)
      .set({ stripe_customer_id: stripeCustomerId, updated_at: new Date() })
      .where(eq(customers.id, customer.id))
  }

  // ── 5. Calculate amount ──────────────────────────────────────────────────
  const invoiceTotal = parseFloat(invoice.total)
  const baseCents = Math.round(invoiceTotal * 100)

  let surchargeAmountCents = 0
  const surchargeEnabled = settings.cc_surcharge_enabled && settings.cc_surcharge_pct
  let surchargeRate = 0

  if (surchargeEnabled) {
    surchargeRate = parseFloat(settings.cc_surcharge_pct!)
    surchargeAmountCents = Math.round(baseCents * surchargeRate)
  }

  // Total charged to the customer includes the surcharge.
  // The surcharge goes to the platform via application_fee_amount.
  // For ACH, the surcharge is not shown client-side -- handled in pay-client.tsx.
  const totalCents = surchargeEnabled ? baseCents + surchargeAmountCents : baseCents

  // ── 6. Create PaymentIntent ──────────────────────────────────────────────
  // If there's already a PaymentIntent on this invoice, reuse it
  if (invoice.stripe_payment_intent_id) {
    try {
      const existingPi = await stripe.paymentIntents.retrieve(
        invoice.stripe_payment_intent_id,
        { stripeAccount: stripeAccountId }
      )

      // If still usable, return the existing client secret
      if (
        existingPi.status === "requires_payment_method" ||
        existingPi.status === "requires_confirmation" ||
        existingPi.status === "requires_action"
      ) {
        return NextResponse.json({
          clientSecret: existingPi.client_secret,
          surchargeEnabled: !!surchargeEnabled,
          surchargeRate,
          surchargeAmountCents,
        })
      }
    } catch {
      // PI not found or in terminal state -- create new one
    }
  }

  const paymentIntent = await stripe.paymentIntents.create(
    {
      amount: totalCents,
      currency: "usd",
      customer: stripeCustomerId,
      payment_method_types: ["card", "us_bank_account"],
      // Always allow saving the payment method. The client only calls
      // enableAutoPay() if the customer checks the AutoPay checkbox, so
      // non-AutoPay payments simply won't save the method.
      setup_future_usage: "off_session",
      application_fee_amount: surchargeEnabled ? surchargeAmountCents : undefined,
      metadata: {
        invoice_id: invoice.id,
        org_id: invoice.org_id,
        customer_id: customer.id,
      },
    },
    { stripeAccount: stripeAccountId }
  )

  // ── 7. Save PI ID on invoice ─────────────────────────────────────────────
  await adminDb
    .update(invoices)
    .set({
      stripe_payment_intent_id: paymentIntent.id,
      updated_at: new Date(),
    })
    .where(eq(invoices.id, invoice.id))

  // ── 8. Create pending payment_records entry ──────────────────────────────
  await adminDb.insert(paymentRecords).values({
    org_id: invoice.org_id,
    invoice_id: invoice.id,
    amount: invoiceTotal.toFixed(2),
    method: "card", // Will be updated to 'ach' by webhook if ACH is used
    status: "pending",
    stripe_payment_intent_id: paymentIntent.id,
  })

  // ── 9. Return client secret ──────────────────────────────────────────────
  return NextResponse.json({
    clientSecret: paymentIntent.client_secret,
    surchargeEnabled: !!surchargeEnabled,
    surchargeRate,
    surchargeAmountCents,
  })
}
