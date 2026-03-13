import type { Metadata } from "next"
import { redirect } from "next/navigation"
import { getCurrentUser } from "@/actions/auth"
import {
  resolveCustomerId,
  getCustomerInvoices,
  getCustomerPaymentMethods,
} from "@/actions/portal-data"
import { adminDb } from "@/lib/db"
import { customers, orgSettings } from "@/lib/db/schema"
import { eq } from "drizzle-orm"
import { InvoiceList } from "@/components/portal/invoice-list"
import { PaymentMethodManager } from "@/components/portal/payment-method-manager"

export const metadata: Metadata = {
  title: "Invoices & Payments",
}

// Force dynamic rendering — depends on auth session and real-time invoice data
export const dynamic = "force-dynamic"

/**
 * /portal/invoices — Customer billing self-service page.
 *
 * Server component: resolves customer context, loads invoices + payment methods,
 * then passes everything to client components for interaction.
 *
 * Sections:
 * 1. "Invoices" — list with status, amounts, Pay Now buttons
 * 2. "Payment & Contact Info" — saved methods manager + contact info editor
 */
export default async function PortalInvoicesPage() {
  const user = await getCurrentUser()
  if (!user) redirect("/portal/login")

  // Portal customers have role "customer"
  if (user.role !== "customer") {
    redirect("/dashboard")
  }

  const customerId = await resolveCustomerId(user.org_id, user.email)
  if (!customerId) {
    return (
      <div className="flex flex-col gap-6">
        <h1 className="text-2xl font-bold tracking-tight">Invoices & Payments</h1>
        <p className="text-sm text-muted-foreground italic">
          Your account is being set up. Please check back shortly.
        </p>
      </div>
    )
  }

  // Load invoices and payment methods in parallel
  const [invoices, paymentMethods] = await Promise.all([
    getCustomerInvoices(user.org_id, customerId),
    getCustomerPaymentMethods(user.org_id, customerId),
  ])

  // Load customer contact info for pre-populating the contact form
  const [customerRow] = await adminDb
    .select({
      phone: customers.phone,
      email: customers.email,
    })
    .from(customers)
    .where(eq(customers.id, customerId))
    .limit(1)

  // Load org settings to check if Stripe is available
  const [settings] = await adminDb
    .select({
      stripe_account_id: orgSettings.stripe_account_id,
      stripe_onboarding_done: orgSettings.stripe_onboarding_done,
      cc_surcharge_enabled: orgSettings.cc_surcharge_enabled,
      cc_surcharge_pct: orgSettings.cc_surcharge_pct,
    })
    .from(orgSettings)
    .where(eq(orgSettings.org_id, user.org_id))
    .limit(1)

  const stripeAvailable = !!(settings?.stripe_account_id && settings?.stripe_onboarding_done)
  const stripeAccountId = settings?.stripe_account_id ?? null
  const publishableKey = process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY ?? null
  const ccSurchargeEnabled = settings?.cc_surcharge_enabled ?? false
  const ccSurchargePct = settings?.cc_surcharge_pct ? parseFloat(settings.cc_surcharge_pct) : 0

  return (
    <div className="flex flex-col gap-8">
      {/* ── Page header ─────────────────────────────────────────────────── */}
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Invoices & Payments</h1>
        <p className="text-muted-foreground text-sm mt-1">
          View and pay your invoices, manage your payment method, and update your contact info.
        </p>
      </div>

      {/* ── Invoice list ────────────────────────────────────────────────── */}
      <section>
        <h2 className="text-lg font-semibold mb-4">Invoices</h2>
        <InvoiceList
          invoices={invoices}
          orgId={user.org_id}
          customerId={customerId}
          stripeAvailable={stripeAvailable}
          stripeAccountId={stripeAccountId}
          publishableKey={publishableKey}
          ccSurchargeEnabled={ccSurchargeEnabled}
          ccSurchargePct={ccSurchargePct}
        />
      </section>

      {/* ── Payment & contact info ──────────────────────────────────────── */}
      <section>
        <h2 className="text-lg font-semibold mb-4">Payment & Contact Info</h2>
        <PaymentMethodManager
          orgId={user.org_id}
          customerId={customerId}
          stripeAvailable={stripeAvailable}
          stripeAccountId={stripeAccountId}
          publishableKey={publishableKey}
          savedMethods={paymentMethods}
          currentPhone={customerRow?.phone ?? null}
          currentEmail={customerRow?.email ?? null}
        />
      </section>
    </div>
  )
}
