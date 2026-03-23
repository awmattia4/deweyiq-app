import type { Metadata } from "next"
import { redirect } from "next/navigation"
import { getCurrentUser } from "@/actions/auth"
import { getOfficeRequests } from "@/actions/service-requests"
import { OfficeRequestList } from "@/components/requests/office-request-list"

export const metadata: Metadata = {
  title: "Service Requests",
}

/**
 * Office requests page — shows incoming customer service requests.
 *
 * Role guard: only owner and office roles can access this page.
 * Techs and customers are redirected.
 *
 * Requests are sorted urgent first, then by created_at desc.
 */
export default async function OfficeRequestsPage() {
  const user = await getCurrentUser()

  if (!user) redirect("/login")
  if (user.role === "tech") redirect("/routes")
  if (user.role === "customer") redirect("/portal")

  const requests = await getOfficeRequests(user.org_id)

  return (
    <div className="flex flex-col gap-6">
      {/* ── Header ────────────────────────────────────────────────────── */}
      <h1 className="text-2xl font-bold tracking-tight">Service Requests</h1>

      {/* ── Request queue ─────────────────────────────────────────────── */}
      <OfficeRequestList
        requests={requests}
        orgId={user.org_id}
        officerName={user.full_name || "Office"}
      />
    </div>
  )
}
