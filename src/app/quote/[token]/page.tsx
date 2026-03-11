/**
 * /quote/[token] — Public customer-facing quote approval page.
 *
 * No auth required. Token IS the authorization (JWT signed with QUOTE_TOKEN_SECRET).
 * Lives OUTSIDE the (app) route group — no sidebar, no auth guard.
 *
 * Uses adminDb for all DB access per 06-RESEARCH.md Pitfall 5:
 * "Customer has no Supabase auth session, so withRls() returns empty results."
 */

import { Metadata } from "next"
import { verifyQuoteToken } from "@/lib/quotes/quote-token"
import { getQuotePublicData } from "@/actions/quotes"
import { QuoteApprovalPage } from "@/components/quotes/quote-approval-page"

export const metadata: Metadata = {
  title: "Quote Approval",
}

// Force dynamic rendering — this page depends on a URL param and DB state
export const dynamic = "force-dynamic"

interface Props {
  params: Promise<{ token: string }>
}

export default async function QuoteTokenPage({ params }: Props) {
  const { token } = await params

  // ── 1. Verify JWT token ────────────────────────────────────────────────────
  const tokenPayload = await verifyQuoteToken(token)

  if (!tokenPayload) {
    return (
      <PageShell>
        <ErrorCard
          icon="🔗"
          title="Link expired or invalid"
          message="This quote link has expired or is no longer valid. Please contact your service provider for a new link."
        />
      </PageShell>
    )
  }

  // ── 2. Fetch all public data via adminDb ───────────────────────────────────
  const data = await getQuotePublicData(tokenPayload.quoteId)

  if (!data) {
    return (
      <PageShell>
        <ErrorCard
          icon="🔍"
          title="Quote not found"
          message="We could not find the quote associated with this link. It may have been removed."
        />
      </PageShell>
    )
  }

  // ── 3. Status gates ────────────────────────────────────────────────────────
  if (data.quote.status === "approved") {
    return (
      <PageShell companyName={data.companyName} logoUrl={data.logoUrl}>
        <StatusCard
          icon="✅"
          iconColor="text-green-600"
          title="Quote already approved"
          message={`This quote was approved on ${data.quote.approved_at ? new Date(data.quote.approved_at).toLocaleDateString("en-US", { year: "numeric", month: "long", day: "numeric" }) : "a previous date"}. We will be in touch to schedule the work.`}
        />
      </PageShell>
    )
  }

  if (data.quote.status === "declined") {
    return (
      <PageShell companyName={data.companyName} logoUrl={data.logoUrl}>
        <StatusCard
          icon="✗"
          iconColor="text-red-500"
          title="Quote was declined"
          message="This quote was previously declined. If you'd like to reconsider, please contact us and we'll be happy to help."
        />
      </PageShell>
    )
  }

  const isExpired =
    data.quote.expires_at &&
    new Date(data.quote.expires_at) < new Date()

  if (isExpired) {
    return (
      <PageShell companyName={data.companyName} logoUrl={data.logoUrl}>
        <StatusCard
          icon="⏰"
          iconColor="text-amber-500"
          title="Quote has expired"
          message={`This quote expired on ${new Date(data.quote.expires_at!).toLocaleDateString("en-US", { year: "numeric", month: "long", day: "numeric" })}. Please contact ${data.companyName} for an updated quote.`}
        />
      </PageShell>
    )
  }

  // ── 4. Render interactive approval page ───────────────────────────────────
  return (
    <PageShell companyName={data.companyName} logoUrl={data.logoUrl}>
      <QuoteApprovalPage
        token={token}
        quoteNumber={data.quote.quote_number ?? tokenPayload.quoteId}
        version={data.quote.version}
        companyName={data.companyName}
        logoUrl={data.logoUrl}
        customerName={data.customerName}
        propertyAddress={data.propertyAddress}
        scopeOfWork={data.scopeOfWork}
        lineItems={data.lineItems}
        subtotal={data.subtotal}
        taxRate={data.taxRate}
        taxAmount={data.taxAmount}
        grandTotal={data.grandTotal}
        termsAndConditions={data.termsAndConditions}
        expirationDate={data.expirationDate}
        flaggedByTechName={data.flaggedByTechName}
      />
    </PageShell>
  )
}

// ── Sub-components ─────────────────────────────────────────────────────────────

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
        <p>Powered by PoolCo — Pool Service Management</p>
      </footer>
    </div>
  )
}

function ErrorCard({
  icon,
  title,
  message,
}: {
  icon: string
  title: string
  message: string
}) {
  return (
    <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-8 text-center">
      <div className="text-4xl mb-4">{icon}</div>
      <h1 className="text-xl font-semibold text-gray-900 mb-2">{title}</h1>
      <p className="text-gray-600 max-w-md mx-auto">{message}</p>
    </div>
  )
}

function StatusCard({
  icon,
  iconColor,
  title,
  message,
}: {
  icon: string
  iconColor: string
  title: string
  message: string
}) {
  return (
    <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-8 text-center">
      <div className={`text-5xl mb-4 ${iconColor}`}>{icon}</div>
      <h1 className="text-xl font-semibold text-gray-900 mb-2">{title}</h1>
      <p className="text-gray-600 max-w-md mx-auto">{message}</p>
    </div>
  )
}
