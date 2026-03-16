import type { Metadata } from "next"
import { redirect } from "next/navigation"
import { CalendarDaysIcon, MapIcon } from "lucide-react"
import { getCurrentUser } from "@/actions/auth"
import { getTodayStops, getRouteStartedStatus, getRouteAreaCoordinates } from "@/actions/routes"
import { getTimeTrackingEnabled } from "@/actions/time-tracking"
import { getPredictiveAlertsForPools } from "@/actions/alerts"
import { fetchWeatherForecast, classifyWeatherDay } from "@/lib/weather/open-meteo"
import type { WeatherType } from "@/lib/weather/open-meteo"
import { StopList } from "@/components/field/stop-list"
import type { StopPredictiveAlert } from "@/components/field/stop-card"
import { RouteProgress } from "@/components/field/route-progress"
import { GpsBroadcaster } from "@/components/field/gps-broadcaster"
import { StartRouteButton } from "@/components/field/start-route-button"
import { ClockInBanner } from "@/components/field/clock-in-banner"

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
 * Phase 10-07: Weather badge — fetches a single daily forecast for the route
 *              area and passes today's weather classification to all stop cards.
 *              Clear days show no badge (no clutter). Rain/storm/heat/wind show
 *              a small pill badge on each card.
 *
 * Phase 11-02: Clock-in banner — persistent clock-in/out strip above the route
 *              list for tech/owner when time tracking is enabled for the org.
 *              Visually distinct from Start Route button (different color, purpose).
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

  // Determine if time tracking banner should be shown
  // Only for tech and owner roles — office doesn't do field work
  const isFieldUser = user.role === "tech" || user.role === "owner"

  // Fetch today's stops server-side for instant render (no loading flicker)
  // Also check if route was already started for the Start Route button initial state
  // Also fetch time tracking enabled flag (conditionally for field users only)
  const [stops, routeAlreadyStarted, timeTrackingEnabled] = await Promise.all([
    getTodayStops(),
    user.role === "tech" ? getRouteStartedStatus() : Promise.resolve(false),
    isFieldUser ? getTimeTrackingEnabled() : Promise.resolve(false),
  ])

  // ── Weather fetch (Phase 10-07) ──────────────────────────────────────────
  // Fetch a single daily forecast for the route area — all stops share the same
  // badge since this is a daily-level forecast, not per-stop hourly data.
  // Gracefully skips if no geocoded coordinates are available.
  let todayWeather: { type: WeatherType; label: string } | null = null

  if (stops.length > 0) {
    const coords = await getRouteAreaCoordinates(stops)
    if (coords) {
      const forecast = await fetchWeatherForecast(coords.lat, coords.lng)
      if (forecast) {
        const classification = classifyWeatherDay(forecast, 0)
        if (classification && classification.type !== "clear") {
          todayWeather = { type: classification.type, label: classification.label }
        }
        // Clear weather: leave todayWeather null — no badge shown
      }
    }
  }

  // ── Predictive chemistry alerts (Phase 10-02) ─────────────────────────────
  // Fetch predictive chemistry alerts for the pools on today's route.
  // Uses adminDb server-side so techs can see alerts without office-level RLS access.
  // Returns Record<poolId, alert> for efficient lookup by stop card.
  let predictiveAlerts: Record<string, StopPredictiveAlert> = {}

  if (stops.length > 0) {
    const poolIds = stops.map((s) => s.poolId).filter(Boolean)
    const alertsMap = await getPredictiveAlertsForPools(user.org_id, poolIds).catch(() => new Map())
    // Convert Map to plain Record for client component serialization
    for (const [poolId, alert] of alertsMap) {
      predictiveAlerts[poolId] = alert
    }
  }

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

      {/* ── Clock-in banner — tech/owner, shown when time tracking is enabled ── */}
      {/* Persistently visible above route list. Visually distinct from Start Route. */}
      {isFieldUser && timeTrackingEnabled && (
        <ClockInBanner />
      )}

      {/* ── Start Route button — tech-only, shown when there are stops ──── */}
      {user.role === "tech" && stops.length > 0 && (
        <StartRouteButton alreadyStarted={routeAlreadyStarted} />
      )}

      {/* ── Progress bar ─────────────────────────────────────────────────── */}
      {stops.length > 0 && (
        <RouteProgress
          completedStops={completedStops}
          totalStops={stops.length}
        />
      )}

      {/* ── Stop list ────────────────────────────────────────────────────── */}
      <StopList initialStops={stops} weather={todayWeather} predictiveAlerts={predictiveAlerts} />

      {/* ── Tech context footer ──────────────────────────────────────────── */}
      {user.role === "tech" && (
        <p className="text-xs text-muted-foreground text-center pb-2">
          Logged in as {user.full_name || user.email}
        </p>
      )}

      {/* ── GPS Broadcaster — activates position sharing while on route ──── */}
      {/* Render-null component; no visual output. Active only for tech role. */}
      {user.role === "tech" && (
        <GpsBroadcaster orgId={user.org_id} techId={user.id} />
      )}
    </div>
  )
}
