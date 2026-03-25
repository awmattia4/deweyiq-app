import type { Metadata } from "next"
import Link from "next/link"
import { redirect } from "next/navigation"
import { getCurrentUser } from "@/actions/auth"
import { resolveCustomerId } from "@/actions/portal-data"
import { adminDb } from "@/lib/db"
import { serviceAgreements, agreementPoolEntries, pools } from "@/lib/db/schema"
import { and, desc, eq } from "drizzle-orm"

export const metadata: Metadata = {
  title: "My Agreements",
}

/**
 * Portal Agreements page — shows the customer's active and past service agreements.
 *
 * Uses adminDb (customer has no RLS access to service_agreements table).
 * Scoped by customer_id resolved from the authenticated portal user.
 */
export default async function PortalAgreementsPage() {
  const user = await getCurrentUser()
  if (!user) redirect("/portal/login")

  const customerId = await resolveCustomerId(user.org_id, user.email)
  if (!customerId) {
    return (
      <div className="flex flex-col gap-6">
        <h1 className="text-2xl font-bold tracking-tight">Agreements</h1>
        <p className="text-sm text-muted-foreground italic">No agreements found.</p>
      </div>
    )
  }

  // Fetch agreements for this customer
  const agreements = await adminDb
    .select({
      id: serviceAgreements.id,
      agreement_number: serviceAgreements.agreement_number,
      status: serviceAgreements.status,
      term_type: serviceAgreements.term_type,
      start_date: serviceAgreements.start_date,
      end_date: serviceAgreements.end_date,
      auto_renew: serviceAgreements.auto_renew,
      signed_at: serviceAgreements.signed_at,
      created_at: serviceAgreements.created_at,
    })
    .from(serviceAgreements)
    .where(
      and(
        eq(serviceAgreements.customer_id, customerId),
        eq(serviceAgreements.org_id, user.org_id)
      )
    )
    .orderBy(desc(serviceAgreements.created_at))

  // Fetch pool entries for each agreement to show service scope
  const agreementIds = agreements.map((a) => a.id)
  let poolEntryMap = new Map<string, Array<{ poolName: string; frequency: string; pricingModel: string; monthlyAmount: string | null }>>()

  if (agreementIds.length > 0) {
    const entries = await adminDb
      .select({
        agreement_id: agreementPoolEntries.agreement_id,
        pool_name: pools.name,
        frequency: agreementPoolEntries.frequency,
        pricing_model: agreementPoolEntries.pricing_model,
        monthly_amount: agreementPoolEntries.monthly_amount,
      })
      .from(agreementPoolEntries)
      .innerJoin(pools, eq(pools.id, agreementPoolEntries.pool_id))
      .where(
        eq(agreementPoolEntries.agreement_id, agreements[0]?.id ?? "")
      )

    // Re-fetch for all agreements using a loop (simpler than inArray for small counts)
    for (const agreement of agreements) {
      const entryRows = await adminDb
        .select({
          pool_name: pools.name,
          frequency: agreementPoolEntries.frequency,
          pricing_model: agreementPoolEntries.pricing_model,
          monthly_amount: agreementPoolEntries.monthly_amount,
        })
        .from(agreementPoolEntries)
        .innerJoin(pools, eq(pools.id, agreementPoolEntries.pool_id))
        .where(eq(agreementPoolEntries.agreement_id, agreement.id))

      if (entryRows.length > 0) {
        poolEntryMap.set(
          agreement.id,
          entryRows.map((e) => ({
            poolName: e.pool_name,
            frequency: e.frequency,
            pricingModel: e.pricing_model,
            monthlyAmount: e.monthly_amount,
          }))
        )
      }
    }
  }

  const formatFreq = (f: string) => {
    if (f === "weekly") return "Weekly"
    if (f === "biweekly") return "Bi-Weekly"
    if (f === "monthly") return "Monthly"
    return f
  }

  const formatTerm = (t: string) => {
    if (t === "month_to_month") return "Month-to-Month"
    const m = t.match(/^(\d+)_month/)
    return m ? `${m[1]}-Month Term` : t
  }

  const statusStyles: Record<string, string> = {
    active: "bg-green-500/15 text-green-700 dark:text-green-400",
    paused: "bg-yellow-500/15 text-yellow-700 dark:text-yellow-400",
    expired: "bg-orange-500/15 text-orange-700 dark:text-orange-400",
    cancelled: "bg-muted text-muted-foreground",
    draft: "bg-muted text-muted-foreground",
    sent: "bg-blue-500/15 text-blue-600 dark:text-blue-400",
    declined: "bg-destructive/15 text-destructive",
  }

  // Only show agreements that have been sent or beyond (don't show internal drafts)
  const visibleAgreements = agreements.filter((a) => a.status !== "draft")

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Agreements</h1>
        <p className="text-sm text-muted-foreground mt-1">
          Your service agreements and contract details.
        </p>
      </div>

      {visibleAgreements.length === 0 ? (
        <p className="text-sm text-muted-foreground italic">No agreements yet.</p>
      ) : (
        <div className="flex flex-col gap-3">
          {visibleAgreements.map((agreement) => {
            const entries = poolEntryMap.get(agreement.id) ?? []
            const isActive = agreement.status === "active"

            return (
              <div
                key={agreement.id}
                className="rounded-lg border border-border bg-card p-4"
              >
                {/* Header row */}
                <div className="flex items-center gap-3 mb-2">
                  <span className="text-sm font-semibold tabular-nums">
                    {agreement.agreement_number}
                  </span>
                  <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${statusStyles[agreement.status] ?? "bg-muted text-muted-foreground"}`}>
                    {agreement.status.charAt(0).toUpperCase() + agreement.status.slice(1)}
                  </span>
                  <span className="text-xs text-muted-foreground ml-auto">
                    {formatTerm(agreement.term_type)}
                    {agreement.auto_renew ? " · Auto-renew" : ""}
                  </span>
                </div>

                {/* Pool entries */}
                {entries.length > 0 && (
                  <div className="flex flex-col gap-1 mt-2">
                    {entries.map((entry, i) => (
                      <div key={i} className="flex items-center gap-2 text-sm text-muted-foreground">
                        <span className="font-medium text-foreground">{entry.poolName}</span>
                        <span>·</span>
                        <span>{formatFreq(entry.frequency)}</span>
                        {entry.monthlyAmount && (
                          <>
                            <span>·</span>
                            <span>${parseFloat(entry.monthlyAmount).toFixed(2)}/mo</span>
                          </>
                        )}
                      </div>
                    ))}
                  </div>
                )}

                {/* Dates */}
                <div className="flex items-center gap-4 mt-3 text-xs text-muted-foreground">
                  {agreement.signed_at && (
                    <span>Signed {new Date(agreement.signed_at).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}</span>
                  )}
                  {agreement.start_date && (
                    <span>Starts {new Date(agreement.start_date + "T00:00:00").toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}</span>
                  )}
                  {agreement.end_date && (
                    <span>Ends {new Date(agreement.end_date + "T00:00:00").toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}</span>
                  )}
                </div>

                {/* PDF download link for active/signed agreements */}
                {isActive && (
                  <div className="mt-3">
                    <a
                      href={`/api/agreements/${agreement.id}/pdf?token=download`}
                      className="text-xs text-primary hover:underline"
                      target="_blank"
                      rel="noopener noreferrer"
                    >
                      Download Agreement PDF
                    </a>
                  </div>
                )}
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
