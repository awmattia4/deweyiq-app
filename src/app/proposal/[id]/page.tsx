/**
 * /proposal/[id] — Public customer-facing proposal approval page.
 *
 * No auth required. Token IS the authorization (JWT signed with PROPOSAL_TOKEN_SECRET).
 * Lives OUTSIDE the (app) route group — no sidebar, no auth guard.
 *
 * Uses adminDb for all DB access per MEMORY.md pitfall:
 * "Customer has no Supabase auth session, so withRls() returns empty results."
 *
 * NOTE: Using [id] as the param name per MEMORY.md Next.js dynamic route slug
 * conflict rule — the value is semantically a token but param must be named "id".
 */

import { Metadata } from "next"
import { verifyProposalToken } from "@/lib/projects/proposal-token"
import { getProposalPublicData } from "@/actions/projects-approval"
import { ProposalApprovalPage } from "@/components/projects/proposal-approval-page"

export const metadata: Metadata = {
  title: "Project Proposal",
}

// Force dynamic rendering — depends on URL param and DB state
export const dynamic = "force-dynamic"

interface Props {
  params: Promise<{ id: string }>
}

export default async function ProposalTokenPage({ params }: Props) {
  // Extract token from the URL segment (named 'id' per slug-conflict rule)
  const { id: token } = await params

  // ── 1. Verify JWT token ────────────────────────────────────────────────────
  const tokenPayload = await verifyProposalToken(token)

  if (!tokenPayload) {
    return (
      <PageShell>
        <ErrorCard
          title="Link expired or invalid"
          message="This proposal link has expired or is no longer valid. Please contact your service provider for a new link."
        />
      </PageShell>
    )
  }

  // ── 2. Fetch all public data via adminDb ───────────────────────────────────
  const data = await getProposalPublicData(tokenPayload.proposalId)

  if (!data) {
    return (
      <PageShell>
        <ErrorCard
          title="Proposal not found"
          message="We could not find the proposal associated with this link. It may have been removed or expired."
        />
      </PageShell>
    )
  }

  // ── 3. Status gates ────────────────────────────────────────────────────────

  if (data.proposal.status === "approved") {
    return (
      <PageShell companyName={data.companyName} logoUrl={data.logoUrl}>
        <StatusCard
          iconBg="bg-green-100"
          iconColor="text-green-600"
          title="Proposal already approved"
          message={`This proposal was approved${
            data.proposal.approved_at
              ? ` on ${new Date(data.proposal.approved_at).toLocaleDateString("en-US", {
                  year: "numeric",
                  month: "long",
                  day: "numeric",
                })}`
              : ""
          }. We'll be in touch about scheduling your project.`}
          checkmark
        />
      </PageShell>
    )
  }

  if (data.proposal.status === "declined") {
    return (
      <PageShell companyName={data.companyName} logoUrl={data.logoUrl}>
        <StatusCard
          iconBg="bg-gray-100"
          iconColor="text-gray-400"
          title="Proposal declined"
          message="This proposal was previously declined. If you'd like to reconsider, please contact us and we'll be happy to help."
        />
      </PageShell>
    )
  }

  if (data.proposal.status === "superseded") {
    return (
      <PageShell companyName={data.companyName} logoUrl={data.logoUrl}>
        <StatusCard
          iconBg="bg-amber-100"
          iconColor="text-amber-500"
          title="A newer version is available"
          message="This proposal has been revised. Please check your email for the updated proposal link."
        />
      </PageShell>
    )
  }

  // ── 4. Render interactive approval page ───────────────────────────────────
  return (
    <PageShell
      companyName={data.companyName}
      logoUrl={data.logoUrl}
      projectName={data.project.name}
    >
      <ProposalApprovalPage token={token} data={data} />
    </PageShell>
  )
}

// ── Sub-components ──────────────────────────────────────────────────────────

function PageShell({
  children,
  companyName,
  logoUrl,
  projectName,
}: {
  children: React.ReactNode
  companyName?: string
  logoUrl?: string | null
  projectName?: string
}) {
  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <header className="bg-white border-b border-gray-200 py-4 px-6">
        <div className="max-w-3xl mx-auto flex items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            {logoUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={logoUrl}
                alt={companyName ?? "Company logo"}
                className="h-10 w-auto object-contain"
              />
            ) : null}
            {companyName ? (
              <span className="text-lg font-semibold text-gray-900">{companyName}</span>
            ) : null}
          </div>
          {projectName && (
            <div className="text-right">
              <div className="text-xs text-gray-400 uppercase tracking-wide">Project</div>
              <div className="text-sm font-medium text-gray-700">{projectName}</div>
            </div>
          )}
        </div>
      </header>

      {/* Page heading */}
      <div className="bg-white border-b border-gray-100">
        <div className="max-w-3xl mx-auto px-4 sm:px-6 py-5">
          <h1 className="text-2xl font-bold text-gray-900">Project Proposal</h1>
          <p className="text-sm text-gray-500 mt-1">
            Review your proposal below, select your preferred package, and sign to approve.
          </p>
        </div>
      </div>

      {/* Main content */}
      <main className="max-w-3xl mx-auto py-6 px-4 sm:px-6">
        {children}
      </main>

      {/* Footer */}
      <footer className="max-w-3xl mx-auto py-6 px-4 sm:px-6 text-center text-sm text-gray-400">
        <p>Powered by DeweyIQ</p>
      </footer>
    </div>
  )
}

function ErrorCard({ title, message }: { title: string; message: string }) {
  return (
    <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-8 text-center">
      <h1 className="text-xl font-semibold text-gray-900 mb-2">{title}</h1>
      <p className="text-gray-600 max-w-md mx-auto">{message}</p>
    </div>
  )
}

function StatusCard({
  iconBg,
  iconColor,
  title,
  message,
  checkmark = false,
}: {
  iconBg: string
  iconColor: string
  title: string
  message: string
  checkmark?: boolean
}) {
  return (
    <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-8 text-center">
      <div
        className={`h-12 w-12 rounded-full ${iconBg} flex items-center justify-center mx-auto mb-4`}
      >
        {checkmark ? (
          <svg
            className={`h-6 w-6 ${iconColor}`}
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
            strokeWidth={2}
          >
            <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
          </svg>
        ) : (
          <svg
            className={`h-6 w-6 ${iconColor}`}
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
            strokeWidth={2}
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
            />
          </svg>
        )}
      </div>
      <h1 className="text-xl font-semibold text-gray-900 mb-2">{title}</h1>
      <p className="text-gray-600 max-w-md mx-auto">{message}</p>
    </div>
  )
}
