import type { Metadata } from "next"
import { notFound, redirect } from "next/navigation"
import { getCurrentUser } from "@/actions/auth"
import { getAgreement, getAgreementCompliance } from "@/actions/agreements"
import type { PoolComplianceResult } from "@/actions/agreements"
import { AgreementDetail } from "@/components/agreements/agreement-detail"
import { adminDb } from "@/lib/db"
import { orgSettings } from "@/lib/db/schema"
import { eq } from "drizzle-orm"

export const metadata: Metadata = {
  title: "Agreement",
}

interface AgreementDetailPageProps {
  params: Promise<{ id: string }>
}

/**
 * AgreementDetailPage — Server component showing full agreement details.
 *
 * Role guard: owner and office only.
 * Fetches the full agreement with customer, pool entries (with pool data),
 * amendments, and template via getAgreement.
 *
 * Also fetches compliance data for active agreements to display per-pool
 * frequency and billing status on the detail page.
 */
export default async function AgreementDetailPage({ params }: AgreementDetailPageProps) {
  const user = await getCurrentUser()

  if (!user) redirect("/login")
  if (user.role === "tech") redirect("/routes")
  if (user.role === "customer") redirect("/portal")

  const { id } = await params

  // Fetch agreement, org settings in parallel; compliance fetched after
  const [result, settingsRows] = await Promise.all([
    getAgreement(id),
    adminDb
      .select({ agreement_notice_period_days: orgSettings.agreement_notice_period_days })
      .from(orgSettings)
      .where(eq(orgSettings.org_id, user.org_id))
      .limit(1),
  ])

  if (!result.success || !result.data) {
    notFound()
  }

  const noticePeriodDays = settingsRows[0]?.agreement_notice_period_days ?? 30

  // Fetch compliance only for active agreements (others don't have relevant data)
  let complianceResults: PoolComplianceResult[] | undefined
  if (result.data.status === "active") {
    const complianceResult = await getAgreementCompliance(id)
    if (complianceResult.success) {
      complianceResults = complianceResult.data
    }
  }

  return (
    <AgreementDetail
      agreement={result.data}
      isOwner={user.role === "owner"}
      noticePeriodDays={noticePeriodDays}
      complianceResults={complianceResults}
    />
  )
}
