import type { Metadata } from "next"
import { notFound, redirect } from "next/navigation"
import { getCurrentUser } from "@/actions/auth"
import { getAgreement } from "@/actions/agreements"
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
 */
export default async function AgreementDetailPage({ params }: AgreementDetailPageProps) {
  const user = await getCurrentUser()

  if (!user) redirect("/login")
  if (user.role === "tech") redirect("/routes")
  if (user.role === "customer") redirect("/portal")

  const { id } = await params

  // Fetch agreement and org settings in parallel
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

  return (
    <AgreementDetail
      agreement={result.data}
      isOwner={user.role === "owner"}
      noticePeriodDays={noticePeriodDays}
    />
  )
}
