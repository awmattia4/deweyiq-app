import type { Metadata } from "next"
import { notFound, redirect } from "next/navigation"
import { getCurrentUser } from "@/actions/auth"
import { getAgreement } from "@/actions/agreements"
import { AgreementDetail } from "@/components/agreements/agreement-detail"

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
  const result = await getAgreement(id)

  if (!result.success || !result.data) {
    notFound()
  }

  return (
    <AgreementDetail
      agreement={result.data}
      isOwner={user.role === "owner"}
    />
  )
}
