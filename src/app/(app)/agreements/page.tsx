import type { Metadata } from "next"
import { redirect } from "next/navigation"
import { getCurrentUser } from "@/actions/auth"
import { getAgreements, getCustomersForAgreement, getAgreementsWithCompliance } from "@/actions/agreements"
import { AgreementManager } from "@/components/agreements/agreement-manager"

export const metadata: Metadata = {
  title: "Agreements",
}

/**
 * AgreementsPage — Top-level agreement management page.
 *
 * Role guard: owner and office only. Techs redirect to /routes.
 * Fetches all agreements with customer + pool entry data, plus the customer
 * list for the filter dropdown, in parallel.
 *
 * Also fetches compliance data for active agreements and passes it to the
 * manager for compliance badge display.
 */
export default async function AgreementsPage() {
  const user = await getCurrentUser()

  if (!user) redirect("/login")
  if (user.role === "tech") redirect("/routes")
  if (user.role === "customer") redirect("/portal")

  const [agreementsResult, customers, complianceResult] = await Promise.all([
    getAgreements(),
    getCustomersForAgreement(),
    getAgreementsWithCompliance(),
  ])

  const agreements = agreementsResult.success ? (agreementsResult.data ?? []) : []

  // Serialize compliance map to a plain object for client component
  const complianceData: Record<string, { overall_status: string; breach_count: number; warning_count: number }> = {}
  if (complianceResult.success && complianceResult.data) {
    for (const [id, summary] of complianceResult.data.entries()) {
      complianceData[id] = {
        overall_status: summary.overall_status,
        breach_count: summary.breach_count,
        warning_count: summary.warning_count,
      }
    }
  }

  return (
    <div className="flex flex-col gap-6">
      {/* ── Page header ──────────────────────────────────────────────────── */}
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Agreements</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Manage service agreements and contracts for your customers
          </p>
        </div>
      </div>

      <AgreementManager agreements={agreements} customers={customers} complianceData={complianceData} />
    </div>
  )
}
