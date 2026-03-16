import type { Metadata } from "next"
import { redirect } from "next/navigation"
import Link from "next/link"
import { getCurrentUser } from "@/actions/auth"
import { getAlertCountByType, getPredictiveAlerts } from "@/actions/alerts"
import { withRls } from "@/lib/db"
import { profiles, orgs, routeStops } from "@/lib/db/schema"
import { eq, count, and } from "drizzle-orm"
import { createClient } from "@/lib/supabase/server"
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import {
  UsersIcon,
  MapIcon,
  PlusIcon,
  CalendarDaysIcon,
  BellIcon,
  CheckCircle2Icon,
  TrendingDownIcon,
  TrendingUpIcon,
} from "lucide-react"

export const metadata: Metadata = {
  title: "Dashboard",
}

/**
 * Dashboard — Owner and office landing page.
 *
 * Fetches real data where available:
 * - Org name from the orgs table
 * - Team member count from the profiles table
 *
 * Per user decision: "Dashboard should feel like a command center,
 * not a report — key metrics and quick actions, not charts."
 *
 * Role guard: techs are redirected to /routes, customers to /portal.
 */
export default async function DashboardPage() {
  const user = await getCurrentUser()

  // Role guards at the page level (defense-in-depth behind proxy + layout)
  if (!user) redirect("/login")
  if (user.role === "tech") redirect("/routes")
  if (user.role === "customer") redirect("/portal")

  // Fetch real data via Drizzle with RLS
  let teamCount = 1
  let orgName = "Your Organization"
  let todayStopCount = 0
  let todayCompletedCount = 0

  try {
    const supabase = await createClient()
    const { data: claimsData } = await supabase.auth.getClaims()

    if (claimsData?.claims) {
      const token = claimsData.claims as Parameters<typeof withRls>[0]
      const today = new Date().toISOString().split("T")[0]

      const [teamResult, orgResult, stopsResult] = await Promise.all([
        // Count all profiles in the org (includes the current user)
        withRls(token, (db) =>
          db
            .select({ count: count() })
            .from(profiles)
            .where(eq(profiles.org_id, user.org_id))
        ),
        // Fetch the org name
        withRls(token, (db) =>
          db
            .select({ name: orgs.name })
            .from(orgs)
            .where(eq(orgs.id, user.org_id))
            .limit(1)
        ),
        // Count today's route stops
        withRls(token, (db) =>
          db
            .select({ status: routeStops.status })
            .from(routeStops)
            .where(
              and(
                eq(routeStops.org_id, user.org_id),
                eq(routeStops.scheduled_date, today)
              )
            )
        ),
      ])

      teamCount = teamResult[0]?.count ?? 1
      orgName = orgResult[0]?.name ?? "Your Organization"
      todayStopCount = stopsResult.length
      todayCompletedCount = stopsResult.filter((s) => s.status === "complete").length
    }
  } catch (err) {
    // Non-fatal — page renders with fallback values if DB is unreachable
    console.error("[DashboardPage] Failed to fetch org data:", err)
  }

  // Fetch alert counts and predictive alerts for dashboard summary (non-fatal)
  const [alertCounts, predictiveAlerts] = await Promise.all([
    getAlertCountByType().catch(() => ({
      total: 0,
      missed_stop: 0,
      declining_chemistry: 0,
      incomplete_data: 0,
      unprofitable_pool: 0,
      predictive_chemistry: 0,
    })),
    getPredictiveAlerts().catch(() => []),
  ])

  const firstName = user.full_name?.split(" ")[0] || "there"
  const today = new Date().toLocaleDateString("en-US", {
    weekday: "long",
    month: "long",
    day: "numeric",
  })

  return (
    <div className="flex flex-col gap-6">
      {/* ── Page header ──────────────────────────────────────────────────── */}
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">
            Good{getGreeting()}, {firstName}
          </h1>
          <p className="text-muted-foreground text-sm mt-1">
            {orgName} &middot; {today}
          </p>
        </div>
        <Badge variant="outline" className="hidden sm:flex gap-1.5">
          <span className="h-2 w-2 rounded-full bg-emerald-500" />
          {getRoleLabel(user.role)}
        </Badge>
      </div>

      {/* ── Key metrics ──────────────────────────────────────────────────── */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {/* Today's stops — real count from route_stops */}
        <Card>
          <CardHeader className="pb-2">
            <div className="flex items-center justify-between">
              <CardDescription>Today&apos;s Stops</CardDescription>
              <CalendarDaysIcon className="h-4 w-4 text-muted-foreground" aria-hidden="true" />
            </div>
            <CardTitle className="text-3xl font-bold">{todayStopCount}</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-xs text-muted-foreground">
              {todayStopCount === 0
                ? "No stops scheduled for today"
                : `${todayCompletedCount} completed, ${todayStopCount - todayCompletedCount} remaining`}
            </p>
          </CardContent>
        </Card>

        {/* Team member count — real data */}
        <Card>
          <CardHeader className="pb-2">
            <div className="flex items-center justify-between">
              <CardDescription>Team Members</CardDescription>
              <UsersIcon className="h-4 w-4 text-muted-foreground" aria-hidden="true" />
            </div>
            <CardTitle className="text-3xl font-bold">{teamCount}</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-xs text-muted-foreground">
              Active members in {orgName}
            </p>
          </CardContent>
        </Card>

        {/* Alerts summary card — links to /alerts */}
        <Link href="/alerts" className="block sm:col-span-2 lg:col-span-1 group">
          <Card className="h-full transition-colors group-hover:border-border/80 group-hover:bg-card/80 cursor-pointer">
            <CardHeader className="pb-2">
              <div className="flex items-center justify-between">
                <CardDescription>Active Alerts</CardDescription>
                <BellIcon className="h-4 w-4 text-muted-foreground" aria-hidden="true" />
              </div>
              {alertCounts.total === 0 ? (
                <div className="flex items-center gap-1.5">
                  <CheckCircle2Icon className="h-5 w-5 text-emerald-500" aria-hidden="true" />
                  <CardTitle className="text-base font-medium text-emerald-500">
                    All clear
                  </CardTitle>
                </div>
              ) : (
                <CardTitle className="text-3xl font-bold text-destructive">
                  {alertCounts.total}
                </CardTitle>
              )}
            </CardHeader>
            <CardContent>
              {alertCounts.total === 0 ? (
                <p className="text-xs text-muted-foreground">
                  No active alerts — everything looks good
                </p>
              ) : (
                <div className="flex flex-col gap-1">
                  {alertCounts.missed_stop > 0 && (
                    <p className="text-xs text-muted-foreground">
                      <span className="font-medium text-red-400">{alertCounts.missed_stop}</span>{" "}
                      missed {alertCounts.missed_stop === 1 ? "stop" : "stops"}
                    </p>
                  )}
                  {alertCounts.declining_chemistry > 0 && (
                    <p className="text-xs text-muted-foreground">
                      <span className="font-medium text-amber-400">{alertCounts.declining_chemistry}</span>{" "}
                      declining chemistry
                    </p>
                  )}
                  {alertCounts.incomplete_data > 0 && (
                    <p className="text-xs text-muted-foreground">
                      <span className="font-medium text-blue-400">{alertCounts.incomplete_data}</span>{" "}
                      incomplete {alertCounts.incomplete_data === 1 ? "record" : "records"}
                    </p>
                  )}
                </div>
              )}
            </CardContent>
          </Card>
        </Link>
      </div>

      {/* ── Predictive chemistry trends (only when alerts exist) ────────── */}
      {predictiveAlerts.length > 0 && (
        <div>
          <div className="flex items-center justify-between mb-3">
            <h2 className="text-sm font-medium text-muted-foreground uppercase tracking-wider">
              Predictive Chemistry Trends
            </h2>
            <Link
              href="/alerts?filter=predictive_chemistry"
              className="text-xs text-primary hover:underline cursor-pointer"
            >
              View all {predictiveAlerts.length}
            </Link>
          </div>
          <div className="flex flex-col gap-2">
            {predictiveAlerts.slice(0, 3).map((alert) => {
              const meta = alert.metadata as {
                parameter: string
                direction: "low" | "high"
                projectedNext: number
                unit: string
                isEarlyPrediction: boolean
                customerId: string
              } | null

              if (!meta) return null
              const TrendIcon = meta.direction === "low" ? TrendingDownIcon : TrendingUpIcon
              const trendColor = meta.direction === "low" ? "text-blue-400" : "text-orange-400"

              return (
                <Link
                  key={alert.id}
                  href={`/customers/${meta.customerId}`}
                  className="flex items-center gap-3 rounded-lg border border-border bg-card px-4 py-3 hover:border-border/80 hover:bg-card/80 transition-colors cursor-pointer"
                >
                  <TrendIcon className={`h-4 w-4 shrink-0 ${trendColor}`} aria-hidden="true" />
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-medium text-foreground truncate">{alert.title}</p>
                    <p className={`text-xs mt-0.5 ${trendColor}`}>
                      Projected: {meta.projectedNext.toFixed(1)}{meta.unit ? ` ${meta.unit}` : ""}
                      {meta.isEarlyPrediction && (
                        <span className="ml-2 text-muted-foreground/60">(early prediction)</span>
                      )}
                    </p>
                  </div>
                </Link>
              )
            })}
          </div>
        </div>
      )}

      {/* ── Quick actions ─────────────────────────────────────────────────── */}
      <div>
        <h2 className="text-sm font-medium text-muted-foreground mb-3 uppercase tracking-wider">
          Quick Actions
        </h2>
        <div className="flex flex-wrap gap-3">
          <Button asChild variant="default" size="sm">
            <Link href="/team">
              <PlusIcon className="h-4 w-4" aria-hidden="true" />
              Invite Team Member
            </Link>
          </Button>
          <Button asChild variant="outline" size="sm">
            <Link href="/routes">
              <MapIcon className="h-4 w-4" aria-hidden="true" />
              View Routes
            </Link>
          </Button>
        </div>
      </div>
    </div>
  )
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function getGreeting(): string {
  const hour = new Date().getHours()
  if (hour < 12) return " morning"
  if (hour < 17) return " afternoon"
  return " evening"
}

function getRoleLabel(role: string): string {
  switch (role) {
    case "owner":
      return "Owner"
    case "office":
      return "Office"
    default:
      return role
  }
}
