/**
 * POST /api/pay/[token]/setup -- Create a Stripe SetupIntent for saving
 * a payment method (AutoPay enrollment).
 *
 * Public endpoint (no auth required). Token IS the authorization.
 * Uses adminDb because the customer has no Supabase auth session.
 *
 * Creates a SetupIntent on the connected account so the customer can
 * save a card or ACH method for future off-session charges.
 * Returns the SetupIntent client_secret for Stripe Elements.
 */

import { NextRequest, NextResponse } from "next/server"
import { verifyPayToken } from "@/lib/pay-token"
import { adminDb } from "@/lib/db"
import { invoices, customers, orgSettings } from "@/lib/db/schema"
import { eq } from "drizzle-orm"
import { getStripe } from "@/lib/stripe/client"

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ token: string }> }
) {
  const { token } = await params

  // -- 1. Verify pay token ---------------------------------------------------
  const payload = await verifyPayToken(token)
  if (!payload) {
    return NextResponse.json(
      { error: "Invalid or expired payment link" },
      { status: 401 }
    )
  }

  // -- 2. Fetch invoice -------------------------------------------------------
  const [invoice] = await adminDb
    .select({ id: invoices.id, org_id: invoices.org_id, customer_id: invoices.customer_id })
    .from(invoices)
    .where(eq(invoices.id, payload.invoiceId))
    .limit(1)

  if (!invoice) {
    return NextResponse.json({ error: "Invoice not found" }, { status: 404 })
  }

  // -- 3. Fetch org settings for stripe_account_id ----------------------------
  const [settings] = await adminDb
    .select({
      stripe_account_id: orgSettings.stripe_account_id,
      stripe_onboarding_done: orgSettings.stripe_onboarding_done,
    })
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

  // -- 4. Fetch customer and ensure Stripe Customer exists --------------------
  const [customer] = await adminDb
    .select({
      id: customers.id,
      full_name: customers.full_name,
      email: customers.email,
      stripe_customer_id: customers.stripe_customer_id,
    })
    .from(customers)
    .where(eq(customers.id, invoice.customer_id))
    .limit(1)

  if (!customer) {
    return NextResponse.json({ error: "Customer not found" }, { status: 404 })
  }

  const stripe = getStripe()
  let stripeCustomerId = customer.stripe_customer_id

  if (!stripeCustomerId) {
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

    await adminDb
      .update(customers)
      .set({ stripe_customer_id: stripeCustomerId, updated_at: new Date() })
      .where(eq(customers.id, customer.id))
  }

  // -- 5. Create SetupIntent on connected account -----------------------------
  const setupIntent = await stripe.setupIntents.create(
    {
      customer: stripeCustomerId,
      usage: "off_session",
      payment_method_types: ["card", "us_bank_account"],
      metadata: {
        customer_id: customer.id,
        org_id: invoice.org_id,
      },
    },
    { stripeAccount: stripeAccountId }
  )

  return NextResponse.json({ clientSecret: setupIntent.client_secret })
}
