import type { Metadata } from "next"
import { redirect } from "next/navigation"
import { getCurrentUser } from "@/actions/auth"
import { resolveCustomerId } from "@/actions/portal-data"
import { EtaTracker } from "@/components/portal/eta-tracker"

export const metadata: Metadata = {
  title: "Track Service",
}

/**
 * Portal ETA tracker page — /portal/eta
 *
 * Shows the customer a live countdown and approximate tech location for
 * their scheduled service today. Updates in real-time via Supabase Broadcast.
 *
 * Server component: resolves customer + org context, then renders EtaTracker
 * as a client component for live updates.
 */
export default async function EtaPage() {
  const user = await getCurrentUser()
  if (!user) redirect("/portal/login")

  const customerId = await resolveCustomerId(user.org_id, user.email)
  if (!customerId) redirect("/portal")

  return (
    <div className="flex flex-col gap-6 max-w-lg mx-auto">
      {/* ── Page header ────────────────────────────────────────────────── */}
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Track Service</h1>
        <p className="text-sm text-muted-foreground mt-1">
          Live updates on your tech&apos;s arrival time.
        </p>
      </div>

      {/* ── Live tracker ───────────────────────────────────────────────── */}
      <EtaTracker
        customerId={customerId}
        orgId={user.org_id}
      />
    </div>
  )
}
