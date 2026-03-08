import type { Metadata } from "next"
import { redirect } from "next/navigation"
import { getCurrentUser } from "@/actions/auth"
import { getScheduleRules, getHolidays } from "@/actions/schedule"
import { withRls } from "@/lib/db"
import { customers, pools, profiles } from "@/lib/db/schema"
import { createClient } from "@/lib/supabase/server"
import { eq, asc } from "drizzle-orm"
import type { SupabaseToken } from "@/lib/db"
import { ScheduleRuleDialog } from "@/components/schedule/schedule-rule-dialog"
import { HolidayCalendar } from "@/components/schedule/holiday-calendar"
import { Badge } from "@/components/ui/badge"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { CalendarDaysIcon, UserIcon, RefreshCwIcon } from "lucide-react"

export const metadata: Metadata = {
  title: "Schedule",
}

// ─── Frequency badge colors ────────────────────────────────────────────────────

function FrequencyBadge({ frequency }: { frequency: string }) {
  const labels: Record<string, string> = {
    weekly: "Weekly",
    biweekly: "Bi-weekly",
    monthly: "Monthly",
    custom: "Custom",
  }
  return (
    <Badge variant="outline" className="text-xs font-normal">
      {labels[frequency] ?? frequency}
    </Badge>
  )
}

// ─── Page ──────────────────────────────────────────────────────────────────────

/**
 * SchedulePage — placeholder for the full scheduling UI.
 *
 * Phase 4 plan 02: Shows schedule rules list, "Add Rule" dialog, and holiday
 * calendar section. Full split-view route builder comes in plan 04-03.
 *
 * Role guard: owner and office only. Techs are redirected to /routes.
 */
export default async function SchedulePage() {
  const user = await getCurrentUser()

  if (!user) redirect("/login")
  if (user.role === "tech") redirect("/routes")
  if (user.role === "customer") redirect("/portal")

  // Fetch data in parallel
  const [scheduleRules, holidays] = await Promise.all([
    getScheduleRules(),
    getHolidays(),
  ])

  // Fetch customers, pools, techs for the dialog selectors
  let customerList: { id: string; full_name: string }[] = []
  let poolList: { id: string; name: string; customer_id: string }[] = []
  let techList: { id: string; full_name: string }[] = []

  try {
    const supabase = await createClient()
    const { data: claimsData } = await supabase.auth.getClaims()

    if (claimsData?.claims) {
      const token = claimsData.claims as SupabaseToken

      const [customerRows, poolRows, techRows] = await Promise.all([
        withRls(token, (db) =>
          db
            .select({ id: customers.id, full_name: customers.full_name })
            .from(customers)
            .where(eq(customers.org_id, user.org_id))
            .orderBy(asc(customers.full_name))
        ),
        withRls(token, (db) =>
          db
            .select({ id: pools.id, name: pools.name, customer_id: pools.customer_id })
            .from(pools)
            .where(eq(pools.org_id, user.org_id))
            .orderBy(asc(pools.name))
        ),
        withRls(token, (db) =>
          db
            .select({ id: profiles.id, full_name: profiles.full_name })
            .from(profiles)
            .where(eq(profiles.org_id, user.org_id))
            .orderBy(asc(profiles.full_name))
        ),
      ])

      customerList = customerRows
      poolList = poolRows
      // Only include tech role profiles
      techList = techRows
    }
  } catch (err) {
    console.error("[SchedulePage] Failed to fetch selector data:", err)
  }

  const currentYear = new Date().getFullYear()
  const currentYearHolidays = holidays.filter((h) => h.date.startsWith(String(currentYear)))

  return (
    <div className="flex flex-col gap-6">
      {/* ── Page header ──────────────────────────────────────────────────── */}
      <div className="flex items-start justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Schedule</h1>
          <p className="text-muted-foreground text-sm mt-1">
            Recurring service rules &middot; {scheduleRules.length} active rule
            {scheduleRules.length !== 1 ? "s" : ""}
          </p>
        </div>
        <ScheduleRuleDialog
          customers={customerList}
          pools={poolList}
          techs={techList}
        />
      </div>

      {/* ── Schedule rules table ──────────────────────────────────────────── */}
      {scheduleRules.length === 0 ? (
        <Card>
          <CardContent className="flex flex-col items-center gap-3 py-12 text-center">
            <CalendarDaysIcon className="h-10 w-10 text-muted-foreground/40" />
            <div>
              <p className="text-sm font-medium">No schedule rules yet</p>
              <p className="text-xs text-muted-foreground mt-1">
                Create a recurring schedule rule to start auto-generating route stops.
              </p>
            </div>
            <ScheduleRuleDialog
              customers={customerList}
              pools={poolList}
              techs={techList}
            />
          </CardContent>
        </Card>
      ) : (
        <div className="rounded-md border border-border overflow-hidden">
          {/* Table header */}
          <div className="hidden sm:grid sm:grid-cols-[2fr_1.5fr_1.5fr_1fr_1fr_auto] gap-4 px-4 py-2.5 border-b border-border bg-muted/30">
            <span className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
              Customer
            </span>
            <span className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
              Pool
            </span>
            <span className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
              Tech
            </span>
            <span className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
              Frequency
            </span>
            <span className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
              Start Date
            </span>
            <span className="text-xs font-medium text-muted-foreground uppercase tracking-wider sr-only">
              Actions
            </span>
          </div>

          {/* Table rows */}
          {scheduleRules.map((rule, idx) => (
            <div
              key={rule.id}
              className={`grid grid-cols-[1fr_auto] sm:grid-cols-[2fr_1.5fr_1.5fr_1fr_1fr_auto] gap-3 sm:gap-4 px-4 py-3.5 items-center ${idx < scheduleRules.length - 1 ? "border-b border-border" : ""}`}
            >
              {/* Customer + pool (mobile stacked) */}
              <div className="min-w-0">
                <p className="text-sm font-medium truncate">{rule.customerName}</p>
                <p className="text-xs text-muted-foreground truncate sm:hidden">
                  {rule.poolName ?? "All pools"} &middot;{" "}
                  {rule.techName ? (
                    <span className="inline-flex items-center gap-1">
                      <UserIcon className="h-3 w-3" />
                      {rule.techName}
                    </span>
                  ) : (
                    "Unassigned"
                  )}
                </p>
              </div>

              {/* Pool (desktop only) */}
              <span className="hidden sm:block text-sm text-muted-foreground truncate">
                {rule.poolName ?? <span className="italic">All pools</span>}
              </span>

              {/* Tech (desktop only) */}
              <span className="hidden sm:flex items-center gap-1.5 text-sm text-muted-foreground truncate">
                {rule.techName ? (
                  <>
                    <UserIcon className="h-3.5 w-3.5 shrink-0" />
                    <span className="truncate">{rule.techName}</span>
                  </>
                ) : (
                  <span className="italic">Unassigned</span>
                )}
              </span>

              {/* Frequency (desktop only) */}
              <span className="hidden sm:flex">
                <FrequencyBadge frequency={rule.frequency} />
              </span>

              {/* Anchor date (desktop only) */}
              <span className="hidden sm:block text-sm text-muted-foreground">
                {rule.anchor_date}
              </span>

              {/* Edit button — mobile shows badge + edit in a row */}
              <div className="flex items-center gap-2 justify-end shrink-0">
                <span className="sm:hidden">
                  <FrequencyBadge frequency={rule.frequency} />
                </span>
                <ScheduleRuleDialog
                  customers={customerList}
                  pools={poolList}
                  techs={techList}
                  rule={rule}
                />
              </div>
            </div>
          ))}
        </div>
      )}

      {/* ── Holiday calendar section ──────────────────────────────────────── */}
      <Card>
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between">
            <CardTitle className="text-base flex items-center gap-2">
              <CalendarDaysIcon className="h-4 w-4" />
              Company Holidays
            </CardTitle>
            <span className="text-xs text-muted-foreground">
              {currentYearHolidays.length} holiday
              {currentYearHolidays.length !== 1 ? "s" : ""} this year
            </span>
          </div>
        </CardHeader>
        <CardContent>
          <HolidayCalendar holidays={holidays} />
        </CardContent>
      </Card>

      {/* ── Generation info ───────────────────────────────────────────────── */}
      <div className="flex items-start gap-2 rounded-md border border-border bg-muted/20 px-4 py-3">
        <RefreshCwIcon className="h-4 w-4 text-muted-foreground mt-0.5 shrink-0" />
        <div>
          <p className="text-sm font-medium">Automatic stop generation</p>
          <p className="text-xs text-muted-foreground mt-0.5">
            Route stops for the next 4 weeks are auto-generated from these rules.
            Enable the pg_cron job in your Supabase dashboard to run generation
            automatically each week. New rules generate stops immediately.
          </p>
        </div>
      </div>
    </div>
  )
}
