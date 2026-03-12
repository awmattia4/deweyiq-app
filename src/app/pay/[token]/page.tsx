/**
 * /pay/[token] -- Public customer-facing invoice payment page.
 *
 * No auth required. Token IS the authorization (JWT signed with INVOICE_TOKEN_SECRET).
 * Lives OUTSIDE the (app) route group -- no sidebar, no auth guard.
 *
 * Uses adminDb for all DB access -- customer has no Supabase auth session.
 * Matches the layout style of the quote approval page -- clean, professional, company-branded.
 * Light theme for customer-facing page.
 */

import { Metadata } from "next"
import { verifyPayToken } from "@/lib/pay-token"
import { adminDb } from "@/lib/db"
import { invoices, invoiceLineItems, customers, orgSettings, orgs } from "@/lib/db/schema"
import { eq, asc } from "drizzle-orm"
import { PayClient } from "./pay-client"

export const metadata: Metadata = {
  title: "Pay Invoice",
}

// Force dynamic rendering -- depends on URL param and DB state
export const dynamic = "force-dynamic"

interface Props {
  params: Promise<{ token: string }>
}

export default async function PayTokenPage({ params }: Props) {
  const { token } = await params

  // ── 1. Verify JWT token ────────────────────────────────────────────────────
  const tokenPayload = await verifyPayToken(token)

  if (!tokenPayload) {
    return (
      <PageShell>
        <ErrorCard
          title="Link expired or invalid"
          message="This payment link has expired or is no longer valid. Please contact your service provider for a new link."
        />
      </PageShell>
    )
  }

  // ── 2. Fetch invoice with line items ───────────────────────────────────────
  const [invoice] = await adminDb
    .select()
    .from(invoices)
    .where(eq(invoices.id, tokenPayload.invoiceId))
    .limit(1)

  if (!invoice) {
    return (
      <PageShell>
        <ErrorCard
          title="Invoice not found"
          message="We could not find the invoice associated with this link. It may have been removed."
        />
      </PageShell>
    )
  }

  // Fetch line items
  const lineItems = await adminDb
    .select({
      description: invoiceLineItems.description,
      line_total: invoiceLineItems.line_total,
    })
    .from(invoiceLineItems)
    .where(eq(invoiceLineItems.invoice_id, invoice.id))
    .orderBy(asc(invoiceLineItems.sort_order))

  // ── 3. Fetch org info ──────────────────────────────────────────────────────
  const [org] = await adminDb
    .select({
      name: orgs.name,
      logo_url: orgs.logo_url,
      slug: orgs.slug,
    })
    .from(orgs)
    .where(eq(orgs.id, invoice.org_id))
    .limit(1)

  // ── 4. Fetch customer info ─────────────────────────────────────────────────
  const [customer] = await adminDb
    .select({
      full_name: customers.full_name,
    })
    .from(customers)
    .where(eq(customers.id, invoice.customer_id))
    .limit(1)

  // ── 5. Fetch org settings ──────────────────────────────────────────────────
  const [settings] = await adminDb
    .select()
    .from(orgSettings)
    .where(eq(orgSettings.org_id, invoice.org_id))
    .limit(1)

  const companyName = org?.name ?? "Service Provider"
  const logoUrl = org?.logo_url ?? null
  const customerName = customer?.full_name ?? "Customer"

  // ── 6. Status gates ────────────────────────────────────────────────────────
  if (invoice.status === "paid") {
    const paidDate = invoice.paid_at
      ? new Date(invoice.paid_at).toLocaleDateString("en-US", {
          year: "numeric",
          month: "long",
          day: "numeric",
        })
      : "a previous date"

    return (
      <PageShell companyName={companyName} logoUrl={logoUrl}>
        <StatusCard
          title="Invoice Already Paid"
          titleColor="text-green-700"
          message={`This invoice was paid on ${paidDate} for ${formatCurrency(parseFloat(invoice.total))}. Thank you!`}
          bgClass="bg-green-50 border-green-200"
        />
      </PageShell>
    )
  }

  if (invoice.status === "void") {
    return (
      <PageShell companyName={companyName} logoUrl={logoUrl}>
        <StatusCard
          title="Invoice Voided"
          titleColor="text-gray-700"
          message="This invoice has been voided. Please contact your service provider if you have questions."
          bgClass="bg-gray-50 border-gray-200"
        />
      </PageShell>
    )
  }

  // ── 7. Check payment availability ──────────────────────────────────────────
  const paymentProvider = settings?.payment_provider ?? "none"
  const stripeConnected = settings?.stripe_account_id && settings?.stripe_onboarding_done

  if (paymentProvider === "none" || !stripeConnected) {
    return (
      <PageShell companyName={companyName} logoUrl={logoUrl}>
        <StatusCard
          title="Online payment is not available"
          titleColor="text-gray-700"
          message={`Please contact ${companyName} to arrange payment.`}
          bgClass="bg-gray-50 border-gray-200"
        />
      </PageShell>
    )
  }

  // ── 8. Render payment page ─────────────────────────────────────────────────
  const ccSurchargeEnabled = settings?.cc_surcharge_enabled ?? false
  const ccSurchargePct = settings?.cc_surcharge_pct
    ? parseFloat(settings.cc_surcharge_pct)
    : 0

  return (
    <PageShell companyName={companyName} logoUrl={logoUrl}>
      <PayClient
        token={token}
        invoiceNumber={invoice.invoice_number}
        billingPeriodStart={invoice.billing_period_start}
        billingPeriodEnd={invoice.billing_period_end}
        customerName={customerName}
        customerId={invoice.customer_id}
        subtotal={parseFloat(invoice.subtotal)}
        taxAmount={parseFloat(invoice.tax_amount)}
        total={parseFloat(invoice.total)}
        lineItemsSummary={lineItems.map((li) => ({
          description: li.description,
          amount: parseFloat(li.line_total),
        }))}
        companyName={companyName}
        brandColor={null}
        connectedAccountId={settings.stripe_account_id!}
        ccSurchargeEnabled={ccSurchargeEnabled}
        ccSurchargePct={ccSurchargePct}
        notes={invoice.notes}
      />
    </PageShell>
  )
}

// ── Helper ────────────────────────────────────────────────────────────────────

function formatCurrency(amount: number): string {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
  }).format(amount)
}

// ── Sub-components ────────────────────────────────────────────────────────────

function PageShell({
  children,
  companyName,
  logoUrl,
}: {
  children: React.ReactNode
  companyName?: string
  logoUrl?: string | null
}) {
  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <header className="bg-white border-b border-gray-200 py-4 px-6">
        <div className="max-w-3xl mx-auto flex items-center gap-3">
          {logoUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={logoUrl}
              alt={companyName ?? "Company logo"}
              className="h-10 w-auto object-contain"
            />
          ) : null}
          {companyName ? (
            <span className="text-lg font-semibold text-gray-900">
              {companyName}
            </span>
          ) : null}
        </div>
      </header>

      {/* Main content */}
      <main className="max-w-3xl mx-auto py-8 px-4 sm:px-6">
        {children}
      </main>

      {/* Footer */}
      <footer className="max-w-3xl mx-auto py-6 px-4 sm:px-6 text-center text-sm text-gray-500">
        <p>Powered by PoolCo -- Pool Service Management</p>
      </footer>
    </div>
  )
}

function ErrorCard({
  title,
  message,
}: {
  title: string
  message: string
}) {
  return (
    <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-8 text-center">
      <h1 className="text-xl font-semibold text-gray-900 mb-2">{title}</h1>
      <p className="text-gray-600 max-w-md mx-auto">{message}</p>
    </div>
  )
}

function StatusCard({
  title,
  titleColor,
  message,
  bgClass,
}: {
  title: string
  titleColor: string
  message: string
  bgClass: string
}) {
  return (
    <div className={`bg-white rounded-xl border shadow-sm p-8 text-center ${bgClass}`}>
      <h1 className={`text-xl font-semibold mb-2 ${titleColor}`}>{title}</h1>
      <p className="text-gray-600 max-w-md mx-auto">{message}</p>
    </div>
  )
}
