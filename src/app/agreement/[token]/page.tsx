/**
 * /agreement/[token] — Public customer-facing agreement approval page.
 *
 * No auth required. Token IS the authorization (JWT signed with AGREEMENT_TOKEN_SECRET).
 * Lives OUTSIDE the (app) route group — no sidebar, no auth guard.
 *
 * Uses adminDb for all DB access:
 * Customer has no Supabase auth session, so withRls() returns empty results.
 */

import { Metadata } from "next"
import { verifyAgreementToken } from "@/lib/agreements/agreement-token"
import { adminDb } from "@/lib/db"
import {
  serviceAgreements,
  agreementPoolEntries,
  agreementAmendments,
  customers,
  orgs,
  pools,
} from "@/lib/db/schema"
import { eq, and } from "drizzle-orm"
import { AgreementApprovalPage } from "@/components/agreements/agreement-approval-page"

export const metadata: Metadata = {
  title: "Service Agreement",
}

// Force dynamic rendering — this page depends on a URL param and DB state
export const dynamic = "force-dynamic"

interface Props {
  params: Promise<{ token: string }>
}

export default async function AgreementTokenPage({ params }: Props) {
  const { token } = await params

  // ── 1. Verify JWT token ────────────────────────────────────────────────────
  const tokenPayload = await verifyAgreementToken(token)

  if (!tokenPayload) {
    return (
      <PageShell>
        <ErrorCard
          title="Link expired or invalid"
          message="This agreement link has expired or is no longer valid. Please contact your service provider for a new link."
        />
      </PageShell>
    )
  }

  const { agreementId, amendmentId } = tokenPayload

  // ── 2. Fetch agreement via adminDb ─────────────────────────────────────────
  const agreementRows = await adminDb
    .select()
    .from(serviceAgreements)
    .where(eq(serviceAgreements.id, agreementId))
    .limit(1)

  const agreement = agreementRows[0]

  if (!agreement) {
    return (
      <PageShell>
        <ErrorCard
          title="Agreement not found"
          message="We could not find the agreement associated with this link. It may have been removed."
        />
      </PageShell>
    )
  }

  // ── 3. Status gates ────────────────────────────────────────────────────────

  // Amendment flow: active agreement with a pending amendment
  if (agreement.status === "active" && amendmentId && agreement.pending_amendment_id === amendmentId) {
    // Fetch amendment details
    const amendmentRows = await adminDb
      .select({
        id: agreementAmendments.id,
        version_number: agreementAmendments.version_number,
        change_summary: agreementAmendments.change_summary,
        status: agreementAmendments.status,
      })
      .from(agreementAmendments)
      .where(eq(agreementAmendments.id, amendmentId))
      .limit(1)

    const amendment = amendmentRows[0]
    if (!amendment || amendment.status !== "pending_signature") {
      return (
        <PageShell>
          <StatusCard
            variant="info"
            title="Amendment already processed"
            message="This amendment has already been signed or rejected."
          />
        </PageShell>
      )
    }

    // Fetch org branding for amendment page
    const orgRows = await adminDb
      .select({ name: orgs.name, logo_url: orgs.logo_url })
      .from(orgs)
      .where(eq(orgs.id, agreement.org_id))
      .limit(1)
    const org = orgRows[0]

    return (
      <PageShell companyName={org?.name ?? "Your Service Provider"} logoUrl={org?.logo_url ?? null}>
        <AgreementApprovalPage
          token={token}
          agreementId={agreementId}
          agreementNumber={agreement.agreement_number}
          termType={agreement.term_type}
          startDate={agreement.start_date}
          endDate={agreement.end_date}
          autoRenew={agreement.auto_renew}
          companyName={org?.name ?? "Your Service Provider"}
          customerName=""
          serviceAddress={null}
          poolEntries={[]}
          isAmendment
          amendmentChangeSummary={amendment.change_summary ?? ""}
          amendmentVersionNumber={amendment.version_number}
        />
      </PageShell>
    )
  }

  if (agreement.status === "active") {
    return (
      <PageShell>
        <StatusCard
          variant="success"
          title="Agreement already signed"
          message={`This agreement was signed${agreement.signed_at ? ` on ${new Date(agreement.signed_at).toLocaleDateString("en-US", { year: "numeric", month: "long", day: "numeric" })}` : ""}. Your service has been scheduled.`}
        />
      </PageShell>
    )
  }

  if (agreement.status === "declined") {
    return (
      <PageShell>
        <StatusCard
          variant="warning"
          title="Agreement was declined"
          message="This agreement was previously declined. If you'd like to reconsider, please contact your service provider."
        />
      </PageShell>
    )
  }

  if (agreement.status !== "sent") {
    return (
      <PageShell>
        <StatusCard
          variant="info"
          title="Agreement not available"
          message="This agreement is not currently available for signing. Please contact your service provider."
        />
      </PageShell>
    )
  }

  // Check end_date expiration (offer expired)
  if (agreement.end_date && new Date(agreement.end_date) < new Date()) {
    return (
      <PageShell>
        <StatusCard
          variant="warning"
          title="Agreement offer has expired"
          message={`This agreement offer expired on ${new Date(agreement.end_date).toLocaleDateString("en-US", { year: "numeric", month: "long", day: "numeric" })}. Please contact your service provider for an updated agreement.`}
        />
      </PageShell>
    )
  }

  // ── 4. Fetch customer ──────────────────────────────────────────────────────
  const customerRows = await adminDb
    .select({
      full_name: customers.full_name,
      email: customers.email,
      address: customers.address,
    })
    .from(customers)
    .where(eq(customers.id, agreement.customer_id))
    .limit(1)

  const customer = customerRows[0]

  // ── 5. Fetch org branding ──────────────────────────────────────────────────
  const orgRows = await adminDb
    .select({ name: orgs.name, logo_url: orgs.logo_url })
    .from(orgs)
    .where(eq(orgs.id, agreement.org_id))
    .limit(1)

  const org = orgRows[0]
  const companyName = org?.name ?? "Your Service Provider"
  const logoUrl = org?.logo_url ?? null

  // ── 6. Fetch pool entries with pool info ───────────────────────────────────
  const entryRows = await adminDb
    .select({
      id: agreementPoolEntries.id,
      pool_id: agreementPoolEntries.pool_id,
      frequency: agreementPoolEntries.frequency,
      preferred_day_of_week: agreementPoolEntries.preferred_day_of_week,
      pricing_model: agreementPoolEntries.pricing_model,
      monthly_amount: agreementPoolEntries.monthly_amount,
      per_visit_amount: agreementPoolEntries.per_visit_amount,
      tiered_threshold_visits: agreementPoolEntries.tiered_threshold_visits,
      tiered_base_amount: agreementPoolEntries.tiered_base_amount,
      tiered_overage_amount: agreementPoolEntries.tiered_overage_amount,
      notes: agreementPoolEntries.notes,
      pool_name: pools.name,
      pool_type: pools.type,
    })
    .from(agreementPoolEntries)
    .innerJoin(
      pools,
      and(
        eq(pools.id, agreementPoolEntries.pool_id),
        eq(agreementPoolEntries.agreement_id, agreementId)
      )
    )

  // ── 7. Render interactive approval page ───────────────────────────────────
  return (
    <PageShell companyName={companyName} logoUrl={logoUrl}>
      <AgreementApprovalPage
        token={token}
        agreementId={agreementId}
        agreementNumber={agreement.agreement_number}
        termType={agreement.term_type}
        startDate={agreement.start_date}
        endDate={agreement.end_date}
        autoRenew={agreement.auto_renew}
        companyName={companyName}
        customerName={customer?.full_name ?? "Customer"}
        serviceAddress={customer?.address ?? null}
        poolEntries={entryRows.map((e) => ({
          id: e.id,
          poolName: e.pool_name,
          poolType: e.pool_type ?? "pool",
          frequency: e.frequency,
          preferredDayOfWeek: e.preferred_day_of_week,
          pricingModel: e.pricing_model,
          monthlyAmount: e.monthly_amount,
          perVisitAmount: e.per_visit_amount,
          tieredThresholdVisits: e.tiered_threshold_visits,
          tieredBaseAmount: e.tiered_base_amount,
          tieredOverageAmount: e.tiered_overage_amount,
          notes: e.notes,
        }))}
        termsAndConditions={agreement.terms_and_conditions}
        cancellationPolicy={agreement.cancellation_policy}
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
        <p>Powered by DeweyIQ — Pool Service Management</p>
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
  variant,
  title,
  message,
}: {
  variant: "success" | "warning" | "info"
  title: string
  message: string
}) {
  const variantStyles = {
    success: "border-green-200 bg-green-50",
    warning: "border-amber-200 bg-amber-50",
    info: "border-blue-200 bg-blue-50",
  }

  return (
    <div className={`rounded-xl border shadow-sm p-8 text-center ${variantStyles[variant]}`}>
      <h1 className="text-xl font-semibold text-gray-900 mb-2">{title}</h1>
      <p className="text-gray-600 max-w-md mx-auto">{message}</p>
    </div>
  )
}
