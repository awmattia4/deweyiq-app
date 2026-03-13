import type { Metadata } from "next"
import Link from "next/link"
import { redirect } from "next/navigation"
import { getCurrentUser } from "@/actions/auth"
import { resolveCustomerId } from "@/actions/portal-data"
import { getCustomerRequests } from "@/actions/service-requests"
import { RequestList } from "@/components/portal/request-list"
import { PlusIcon } from "lucide-react"

export const metadata: Metadata = {
  title: "Service Requests",
}

/**
 * Customer portal — Service Requests page.
 *
 * Lists all submitted requests with status tracking and per-request chat threads.
 * "New Request" button navigates to the guided form.
 */
export default async function PortalRequestsPage({
  searchParams,
}: {
  searchParams: Promise<{ submitted?: string }>
}) {
  const user = await getCurrentUser()
  if (!user) redirect("/portal/login")
  if (user.role !== "customer") redirect("/dashboard")

  const customerId = await resolveCustomerId(user.org_id, user.email)
  if (!customerId) {
    redirect("/portal")
  }

  const params = await searchParams
  const justSubmitted = params.submitted === "1"

  const requests = await getCustomerRequests(user.org_id, customerId)

  return (
    <div className="flex flex-col gap-6">
      {/* ── Header ────────────────────────────────────────────────────── */}
      <div className="flex items-center justify-between gap-4">
        <h1 className="text-2xl font-bold tracking-tight">Service Requests</h1>
        <Link
          href="/portal/requests/new"
          className="flex items-center gap-1.5 rounded-xl bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90 transition-colors"
        >
          <PlusIcon className="h-4 w-4" />
          New Request
        </Link>
      </div>

      {/* ── Submission success banner ──────────────────────────────────── */}
      {justSubmitted && (
        <div className="rounded-xl border border-green-500/30 bg-green-500/10 px-4 py-3">
          <p className="text-sm font-medium text-green-400">Request submitted!</p>
          <p className="text-xs text-muted-foreground mt-0.5">
            We&apos;ll review it and get back to you soon.
          </p>
        </div>
      )}

      {/* ── Request list ───────────────────────────────────────────────── */}
      <RequestList
        requests={requests}
        orgId={user.org_id}
        customerId={customerId}
        senderName={user.full_name || "Customer"}
      />
    </div>
  )
}
