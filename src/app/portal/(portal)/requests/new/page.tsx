import type { Metadata } from "next"
import Link from "next/link"
import { redirect } from "next/navigation"
import { ChevronLeftIcon } from "lucide-react"
import { getCurrentUser } from "@/actions/auth"
import { resolveCustomerId, getCustomerPools } from "@/actions/portal-data"
import { RequestForm } from "@/components/portal/request-form"

export const metadata: Metadata = {
  title: "New Service Request",
}

/**
 * Customer portal — New service request form page.
 *
 * Fetches the customer's pools (for pool selection in step 1) and
 * renders the multi-step guided RequestForm component.
 */
export default async function NewRequestPage() {
  const user = await getCurrentUser()
  if (!user) redirect("/portal/login")
  if (user.role !== "customer") redirect("/dashboard")

  const customerId = await resolveCustomerId(user.org_id, user.email)
  if (!customerId) {
    redirect("/portal")
  }

  const pools = await getCustomerPools(user.org_id, customerId)

  return (
    <div className="flex flex-col gap-6 max-w-xl mx-auto">
      {/* ── Back navigation ───────────────────────────────────────────── */}
      <div className="flex items-center gap-2">
        <Link
          href="/portal/requests"
          className="flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground transition-colors"
        >
          <ChevronLeftIcon className="h-4 w-4" />
          Requests
        </Link>
      </div>

      {/* ── Header ────────────────────────────────────────────────────── */}
      <div>
        <h1 className="text-2xl font-bold tracking-tight">New Service Request</h1>
        <p className="text-sm text-muted-foreground mt-1">
          Tell us what you need. We&apos;ll review and schedule service for you.
        </p>
      </div>

      {/* ── Form ──────────────────────────────────────────────────────── */}
      <RequestForm
        orgId={user.org_id}
        customerId={customerId}
        pools={pools}
      />
    </div>
  )
}
