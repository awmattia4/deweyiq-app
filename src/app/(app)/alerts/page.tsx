import type { Metadata } from "next"
import { redirect } from "next/navigation"
import { getCurrentUser } from "@/actions/auth"
import { generateAlerts, getActiveAlerts } from "@/actions/alerts"
import { getPendingProposals } from "@/actions/weather"
import { AlertFeed } from "@/components/alerts/alert-feed"
import { WeatherProposalsSection } from "@/components/weather/weather-proposals-section"

export const metadata: Metadata = {
  title: "Alerts",
}

/**
 * Alerts page — surfaces actionable exceptions for office/owner staff.
 *
 * On each page load, generateAlerts() runs first to detect new conditions,
 * then getActiveAlerts() returns the current active set for rendering.
 * Weather reschedule proposals are shown above regular alerts.
 *
 * Role guard: techs do not have access to alerts (redirected to /routes).
 */
export default async function AlertsPage() {
  const user = await getCurrentUser()

  if (!user) redirect("/login")
  if (user.role === "tech") redirect("/routes")
  if (user.role === "customer") redirect("/portal")

  // Generate new alerts + fetch proposals in parallel
  const [, alerts, pendingProposals] = await Promise.all([
    generateAlerts(user.org_id),
    getActiveAlerts(),
    getPendingProposals(),
  ])

  const totalCount = alerts.length + pendingProposals.length

  return (
    <div className="flex flex-col gap-6">
      {/* ── Page header ──────────────────────────────────────────────────── */}
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Alerts</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Actionable exceptions that need attention
          </p>
        </div>

        {/* Alert count badge */}
        {totalCount > 0 && (
          <div className="flex items-center gap-1.5 rounded-full bg-destructive/10 px-3 py-1">
            <span className="h-2 w-2 rounded-full bg-destructive" />
            <span className="text-sm font-medium text-destructive">
              {totalCount} active
            </span>
          </div>
        )}
      </div>

      {/* ── Weather reschedule proposals (shown above regular alerts) ─────── */}
      {pendingProposals.length > 0 && (
        <WeatherProposalsSection initialProposals={pendingProposals} />
      )}

      {/* ── Regular alert feed ────────────────────────────────────────────── */}
      <AlertFeed alerts={alerts} />
    </div>
  )
}
