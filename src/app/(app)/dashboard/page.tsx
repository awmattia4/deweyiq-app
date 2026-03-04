import type { Metadata } from "next"
import { redirect } from "next/navigation"
import Link from "next/link"
import { getCurrentUser } from "@/actions/auth"
import { withRls } from "@/lib/db"
import { profiles, orgs } from "@/lib/db/schema"
import { eq, count } from "drizzle-orm"
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
  ActivityIcon,
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

  try {
    const supabase = await createClient()
    const { data: claimsData } = await supabase.auth.getClaims()

    if (claimsData?.claims) {
      const token = claimsData.claims as Parameters<typeof withRls>[0]

      const [teamResult, orgResult] = await Promise.all([
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
      ])

      teamCount = teamResult[0]?.count ?? 1
      orgName = orgResult[0]?.name ?? "Your Organization"
    }
  } catch (err) {
    // Non-fatal — page renders with fallback values if DB is unreachable
    console.error("[DashboardPage] Failed to fetch org data:", err)
  }

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
        {/* Today's stops — placeholder until Phase 3 */}
        <Card>
          <CardHeader className="pb-2">
            <div className="flex items-center justify-between">
              <CardDescription>Today&apos;s Stops</CardDescription>
              <CalendarDaysIcon className="h-4 w-4 text-muted-foreground" aria-hidden="true" />
            </div>
            <CardTitle className="text-3xl font-bold">0</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-xs text-muted-foreground">
              Routes set up in Phase 3 &mdash; scheduling coming soon
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

        {/* Activity feed — placeholder */}
        <Card className="sm:col-span-2 lg:col-span-1">
          <CardHeader className="pb-2">
            <div className="flex items-center justify-between">
              <CardDescription>Recent Activity</CardDescription>
              <ActivityIcon className="h-4 w-4 text-muted-foreground" aria-hidden="true" />
            </div>
            <CardTitle className="text-base font-medium text-muted-foreground">
              No activity yet
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-xs text-muted-foreground">
              Service logs and invoices will appear here as your team works
            </p>
          </CardContent>
        </Card>
      </div>

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
