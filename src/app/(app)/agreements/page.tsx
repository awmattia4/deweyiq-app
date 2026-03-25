import type { Metadata } from "next"
import { redirect } from "next/navigation"
import { getCurrentUser } from "@/actions/auth"
import { getAgreements, getCustomersForAgreement } from "@/actions/agreements"
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
 */
export default async function AgreementsPage() {
  const user = await getCurrentUser()

  if (!user) redirect("/login")
  if (user.role === "tech") redirect("/routes")
  if (user.role === "customer") redirect("/portal")

  const [agreementsResult, customers] = await Promise.all([
    getAgreements(),
    getCustomersForAgreement(),
  ])

  const agreements = agreementsResult.success ? (agreementsResult.data ?? []) : []

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

      <AgreementManager agreements={agreements} customers={customers} />
    </div>
  )
}
