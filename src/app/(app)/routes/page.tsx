import type { Metadata } from "next"
import { redirect } from "next/navigation"
import { CalendarDaysIcon, MapIcon } from "lucide-react"
import { getCurrentUser } from "@/actions/auth"
import { getTodayStops } from "@/actions/routes"
import { StopList } from "@/components/field/stop-list"
import { RouteProgress } from "@/components/field/route-progress"

export const metadata: Metadata = {
  title: "Routes",
}

/**
 * Routes — Tech landing page (and accessible to office/owner too).
 *
 * Per locked decision: "Tech: lands directly on today's route list
 * — no dashboard in between."
 *
 * Per locked decision: "Stop list is the primary view when tech opens the app."
 *
 * Phase 3: Renders real stop list with progress bar and drag-to-reorder.
 *          Replaces Phase 1 empty state.
 *
 * Phase 4: Map view toggle will render an actual map. For now the button
 *          exists but map view shows a stub.
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

  // Fetch today's stops server-side for instant render (no loading flicker)
  const stops = await getTodayStops()

  // Calculate completed stops for the progress bar
  const completedStops = stops.filter(
    (s) => s.stopStatus === "complete" || s.stopStatus === "skipped"
  ).length

  return (
    <div className="flex flex-col gap-5">
      {/* ── Date header ──────────────────────────────────────────────────── */}
      <div className="flex items-center justify-between">
        <div>
          <div className="flex items-center gap-2 text-muted-foreground text-sm mb-1">
            <CalendarDaysIcon className="h-4 w-4" aria-hidden="true" />
            <span>Today</span>
          </div>
          <h1 className="text-2xl font-bold tracking-tight">{dateLabel}</h1>
        </div>

        {/* Map view toggle — stub for Phase 4 */}
        {stops.length > 0 && (
          <button
            type="button"
            className="flex items-center gap-1.5 rounded-lg border border-border/60 bg-card px-3 min-h-[44px] text-xs font-medium text-muted-foreground hover:text-foreground hover:border-border transition-colors duration-150 cursor-not-allowed opacity-60"
            title="Map view coming in Phase 4"
            aria-label="Toggle map view (coming soon)"
            disabled
          >
            <MapIcon className="h-3.5 w-3.5" />
            Map
          </button>
        )}
      </div>

      {/* ── Progress bar ─────────────────────────────────────────────────── */}
      {stops.length > 0 && (
        <RouteProgress
          completedStops={completedStops}
          totalStops={stops.length}
        />
      )}

      {/* ── Stop list ────────────────────────────────────────────────────── */}
      <StopList initialStops={stops} />

      {/* ── Tech context footer ──────────────────────────────────────────── */}
      {user.role === "tech" && (
        <p className="text-xs text-muted-foreground text-center pb-2">
          Logged in as {user.full_name || user.email}
        </p>
      )}
    </div>
  )
}
