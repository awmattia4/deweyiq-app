import type { Metadata } from "next"
import { redirect } from "next/navigation"
import { getCurrentUser } from "@/actions/auth"
import { CalendarDaysIcon, MapPinIcon } from "lucide-react"

export const metadata: Metadata = {
  title: "Routes",
}

/**
 * Routes — Tech landing page (and accessible to office/owner too).
 *
 * Per user decision: "Tech: lands directly on today's route list
 * -- no dashboard in between."
 *
 * Per idea: "Tech landing should feel instant — open app, see your
 * route with zero navigation required."
 *
 * Phase 1: empty state with clear message. Stop list cards arrive
 * in Phase 3.
 *
 * Role guard: customers are redirected to /portal.
 */
export default async function RoutesPage() {
  const user = await getCurrentUser()

  if (!user) redirect("/login")
  if (user.role === "customer") redirect("/portal")

  const today = new Date()
  const dateLabel = today.toLocaleDateString("en-US", {
    weekday: "long",
    month: "long",
    day: "numeric",
  })

  return (
    <div className="flex flex-col gap-6">
      {/* ── Date header ──────────────────────────────────────────────────── */}
      <div className="flex items-center justify-between">
        <div>
          <div className="flex items-center gap-2 text-muted-foreground text-sm mb-1">
            <CalendarDaysIcon className="h-4 w-4" aria-hidden="true" />
            <span>Today</span>
          </div>
          <h1 className="text-2xl font-bold tracking-tight">{dateLabel}</h1>
        </div>
      </div>

      {/* ── Empty state — Phase 1 ────────────────────────────────────────── */}
      <div className="flex flex-col items-center justify-center rounded-xl border border-dashed border-border/60 p-12 text-center gap-4">
        <div className="flex h-12 w-12 items-center justify-center rounded-full bg-muted">
          <MapPinIcon className="h-6 w-6 text-muted-foreground" aria-hidden="true" />
        </div>
        <div className="flex flex-col gap-1 max-w-sm">
          <p className="font-medium text-sm">No routes scheduled yet</p>
          <p className="text-sm text-muted-foreground">
            Routes will appear here once scheduling is set up. Route management
            is coming in a future update.
          </p>
        </div>
      </div>

      {/* ── User context (helpful for tech role) ─────────────────────────── */}
      {user.role === "tech" && (
        <p className="text-xs text-muted-foreground text-center">
          Logged in as {user.full_name || user.email}
        </p>
      )}
    </div>
  )
}
