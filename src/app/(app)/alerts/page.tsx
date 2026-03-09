import type { Metadata } from "next"
import { redirect } from "next/navigation"
import { BellIcon } from "lucide-react"
import { getCurrentUser } from "@/actions/auth"
import { generateAlerts, getActiveAlerts } from "@/actions/alerts"
import { AlertFeed } from "@/components/alerts/alert-feed"

export const metadata: Metadata = {
  title: "Alerts",
}

/**
 * Alerts page — surfaces actionable exceptions for office/owner staff.
 *
 * On each page load, generateAlerts() runs first to detect new conditions,
 * then getActiveAlerts() returns the current active set for rendering.
 *
 * Role guard: techs do not have access to alerts (redirected to /routes).
 */
export default async function AlertsPage() {
  const user = await getCurrentUser()

  if (!user) redirect("/login")
  if (user.role === "tech") redirect("/routes")
  if (user.role === "customer") redirect("/portal")

  // Generate new alerts for this org (idempotent — ON CONFLICT DO NOTHING)
  await generateAlerts(user.org_id)

  // Fetch current active alerts
  const alerts = await getActiveAlerts()

  return (
    <div className="flex flex-col gap-6">
      {/* ── Page header ──────────────────────────────────────────────────── */}
      <div className="flex items-start justify-between">
        <div>
          <div className="flex items-center gap-2">
            <BellIcon className="h-6 w-6 text-muted-foreground" aria-hidden="true" />
            <h1 className="text-2xl font-bold tracking-tight">Alerts</h1>
          </div>
          <p className="mt-1 text-sm text-muted-foreground">
            Actionable exceptions that need attention
          </p>
        </div>

        {/* Alert count badge */}
        {alerts.length > 0 && (
          <div className="flex items-center gap-1.5 rounded-full bg-destructive/10 px-3 py-1">
            <span className="h-2 w-2 rounded-full bg-destructive" />
            <span className="text-sm font-medium text-destructive">
              {alerts.length} active
            </span>
          </div>
        )}
      </div>

      {/* ── Alert feed ───────────────────────────────────────────────────── */}
      <AlertFeed alerts={alerts} />
    </div>
  )
}
