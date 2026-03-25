import type { Metadata } from "next"
import { redirect } from "next/navigation"
import { getCurrentUser } from "@/actions/auth"
import { getScheduleRules, getHolidays, getStopsForDay, getUnassignedCustomers, type UnassignedCustomer } from "@/actions/schedule"
import { withRls } from "@/lib/db"
import { customers, pools, profiles, orgSettings } from "@/lib/db/schema"
import { createClient } from "@/lib/supabase/server"
import { eq, asc } from "drizzle-orm"
import type { SupabaseToken } from "@/lib/db"
import { toLocalDateString } from "@/lib/date-utils"
import { ScheduleRuleDialog } from "@/components/schedule/schedule-rule-dialog"
import { HolidayCalendar } from "@/components/schedule/holiday-calendar"
import { RouteBuilder } from "@/components/schedule/route-builder"
import { ScheduleTabs } from "@/components/schedule/schedule-tabs"
import { WorkloadBalancerTrigger } from "@/components/schedule/workload-balancer-trigger"
import { WeatherCheckTrigger } from "@/components/schedule/weather-check-trigger"
import { Badge } from "@/components/ui/badge"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { CalendarDaysIcon, UserIcon, RefreshCwIcon } from "lucide-react"
import type { ScheduleStop } from "@/components/schedule/route-map"

export const metadata: Metadata = {
  title: "Schedule",
}

// ─── Day helpers ──────────────────────────────────────────────────────────────

/**
 * Convert a Mon-indexed day number (0=Mon … 4=Fri) to a YYYY-MM-DD string for
 * the corresponding day of the current ISO week. Matches client-side logic.
 */
function dayIndexToDateServer(dayIndex: number): string {
  const today = new Date()
  const jsDay = today.getDay() // 0=Sun, 1=Mon ... 6=Sat
  const daysFromMonday = jsDay === 0 ? -6 : 1 - jsDay
  const monday = new Date(today)
  monday.setDate(today.getDate() + daysFromMonday)
  monday.setHours(0, 0, 0, 0)
  const target = new Date(monday)
  target.setDate(monday.getDate() + dayIndex)
  return toLocalDateString(target)
}

function getTodayDayIndexServer(): number {
  const jsDay = new Date().getDay()
  if (jsDay === 0) return 4
  if (jsDay === 6) return 4
  return jsDay - 1
}

// ─── Frequency badge ──────────────────────────────────────────────────────────

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
 * SchedulePage — scheduling hub for owner/office.
 *
 * Three top-level tabs:
 * - Routes: split-view route builder (stop list + map)
 * - Rules: schedule rule management
 * - Holidays: company holiday calendar
 *
 * Role guard: owner and office only. Techs redirect to /routes.
 */
export default async function SchedulePage() {
  const user = await getCurrentUser()

  if (!user) redirect("/login")
  if (user.role === "tech") redirect("/routes")
  if (user.role === "customer") redirect("/portal")

  // ── Fetch all data in parallel ────────────────────────────────────────────

  let techList: { id: string; name: string }[] = []
  let initialStops: ScheduleStop[] = []
  let customerList: { id: string; full_name: string }[] = []
  let poolList: { id: string; name: string; customer_id: string }[] = []
  let techListForDialog: { id: string; full_name: string }[] = []
  let homeBase: { lat: number; lng: number; address?: string } | null = null

  try {
    const supabase = await createClient()
    const { data: claimsData } = await supabase.auth.getClaims()

    if (claimsData?.claims) {
      const token = claimsData.claims as SupabaseToken

      const [customerRows, poolRows, techRows, orgSettingsRows] = await Promise.all([
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
            .select({ id: profiles.id, full_name: profiles.full_name, role: profiles.role })
            .from(profiles)
            .where(eq(profiles.org_id, user.org_id))
            .orderBy(asc(profiles.full_name))
        ),
        withRls(token, (db) =>
          db
            .select({
              home_base_lat: orgSettings.home_base_lat,
              home_base_lng: orgSettings.home_base_lng,
              home_base_address: orgSettings.home_base_address,
            })
            .from(orgSettings)
            .where(eq(orgSettings.org_id, user.org_id))
            .limit(1)
        ),
      ])

      customerList = customerRows
      poolList = poolRows
      techListForDialog = techRows

      if (orgSettingsRows[0]?.home_base_lat && orgSettingsRows[0]?.home_base_lng) {
        homeBase = {
          lat: orgSettingsRows[0].home_base_lat,
          lng: orgSettingsRows[0].home_base_lng,
          address: orgSettingsRows[0].home_base_address ?? undefined,
        }
      }

      // Tech list for route builder tabs: include tech + owner roles
      // Fetch truck assignments to show truck context on each tech tab
      let truckAssignmentMap = new Map<string, string>()
      try {
        const { getTrucks } = await import("@/actions/trucks")
        const trucksResult = await getTrucks()
        if (trucksResult.success) {
          for (const truck of trucksResult.trucks) {
            if (!truck.is_active) continue
            for (const tech of truck.assignedTechs) {
              truckAssignmentMap.set(tech.id, truck.name)
            }
          }
        }
      } catch { /* non-blocking */ }

      techList = techRows
        .filter((p) => p.role === "tech" || p.role === "owner")
        .map((p) => {
          const truckName = truckAssignmentMap.get(p.id)
          return {
            id: p.id,
            name: truckName
              ? `${p.full_name ?? "Unknown Tech"} · ${truckName}`
              : (p.full_name ?? "Unknown Tech"),
          }
        })
    }
  } catch (err) {
    console.error("[SchedulePage] Failed to fetch selector data:", err)
  }

  // Fetch initial stops and unassigned customers for the first tech + today's day
  const todayDayIndex = getTodayDayIndexServer()
  const todayDate = dayIndexToDateServer(todayDayIndex)
  const firstTechId = techList[0]?.id ?? ""
  let initialUnassigned: UnassignedCustomer[] = []

  if (firstTechId) {
    try {
      const [rawStops, rawUnassigned] = await Promise.all([
        getStopsForDay(firstTechId, todayDate),
        getUnassignedCustomers(firstTechId, todayDate),
      ])
      initialStops = rawStops.map(
        (s): ScheduleStop => ({
          id: s.id,
          customerName: s.customerName,
          address: s.address,
          poolName: s.poolName ?? "",
          sortIndex: s.sortIndex,
          positionLocked: s.positionLocked,
          status: s.status,
          lat: s.lat,
          lng: s.lng,
        })
      )
      initialUnassigned = rawUnassigned
    } catch (err) {
      console.error("[SchedulePage] Failed to fetch initial stops:", err)
    }
  }

  // Compute Monday of the current ISO week for workload balancer
  const todayForWeek = new Date()
  const jsDay = todayForWeek.getDay()
  const daysFromMonday = jsDay === 0 ? -6 : 1 - jsDay
  const mondayForWeek = new Date(todayForWeek)
  mondayForWeek.setDate(todayForWeek.getDate() + daysFromMonday)
  mondayForWeek.setHours(0, 0, 0, 0)
  const weekStartDate = toLocalDateString(mondayForWeek)

  // Fetch schedule rules and holidays for Rules + Holidays tabs
  const [scheduleRules, holidays] = await Promise.all([
    getScheduleRules(),
    getHolidays(),
  ])

  const currentYear = new Date().getFullYear()
  const currentYearHolidays = holidays.filter((h) => h.date.startsWith(String(currentYear)))

  // ── Rules panel (moved from prior plan 04-02) ─────────────────────────────

  const rulesPanel = (
    <div className="flex flex-col gap-6">
      <div className="flex items-start justify-between flex-wrap gap-3">
        <div>
          <h2 className="text-base font-semibold">Recurring Service Rules</h2>
          <p className="text-muted-foreground text-sm mt-0.5">
            {scheduleRules.length} active rule{scheduleRules.length !== 1 ? "s" : ""}
          </p>
        </div>
        <ScheduleRuleDialog
          customers={customerList}
          pools={poolList}
          techs={techListForDialog}
        />
      </div>

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
              techs={techListForDialog}
            />
          </CardContent>
        </Card>
      ) : (
        <div className="rounded-md border border-border overflow-hidden">
          <div className="hidden sm:grid sm:grid-cols-[2fr_1.5fr_1.5fr_1fr_1fr_auto] gap-4 px-4 py-2.5 border-b border-border bg-muted/30">
            <span className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Customer</span>
            <span className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Pool</span>
            <span className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Tech</span>
            <span className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Frequency</span>
            <span className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Start Date</span>
            <span className="text-xs font-medium text-muted-foreground uppercase tracking-wider sr-only">Actions</span>
          </div>

          {scheduleRules.map((rule, idx) => (
            <div
              key={rule.id}
              className={`grid grid-cols-[1fr_auto] sm:grid-cols-[2fr_1.5fr_1.5fr_1fr_1fr_auto] gap-3 sm:gap-4 px-4 py-3.5 items-center ${idx < scheduleRules.length - 1 ? "border-b border-border" : ""}`}
            >
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
              <span className="hidden sm:block text-sm text-muted-foreground truncate">
                {rule.poolName ?? <span className="italic">All pools</span>}
              </span>
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
              <span className="hidden sm:flex">
                <FrequencyBadge frequency={rule.frequency} />
              </span>
              <span className="hidden sm:block text-sm text-muted-foreground">
                {rule.anchor_date}
              </span>
              <div className="flex items-center gap-2 justify-end shrink-0">
                <span className="sm:hidden">
                  <FrequencyBadge frequency={rule.frequency} />
                </span>
                <ScheduleRuleDialog
                  customers={customerList}
                  pools={poolList}
                  techs={techListForDialog}
                  rule={rule}
                />
              </div>
            </div>
          ))}
        </div>
      )}

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

  // ── Holidays panel ────────────────────────────────────────────────────────

  const holidaysPanel = (
    <Card>
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <CardTitle className="text-base flex items-center gap-2">
            <CalendarDaysIcon className="h-4 w-4" />
            Company Holidays
          </CardTitle>
          <span className="text-xs text-muted-foreground">
            {currentYearHolidays.length} holiday{currentYearHolidays.length !== 1 ? "s" : ""} this year
          </span>
        </div>
      </CardHeader>
      <CardContent>
        <HolidayCalendar holidays={holidays} />
      </CardContent>
    </Card>
  )

  return (
    <div className="flex flex-col gap-4">
      {/* ── Page header ──────────────────────────────────────────────────── */}
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Schedule</h1>
          <p className="text-muted-foreground text-sm mt-1">
            Build routes, manage recurring rules, and set company holidays
          </p>
        </div>
        <div className="flex items-center gap-2">
          <WeatherCheckTrigger weekStartDate={weekStartDate} />
          <WorkloadBalancerTrigger weekStartDate={weekStartDate} />
        </div>
      </div>

      {/* ── Tabbed content ────────────────────────────────────────────────── */}
      <ScheduleTabs>
        {{
          routes:
            techList.length === 0 ? (
              <div className="flex flex-col items-center gap-3 rounded-lg border border-dashed border-border/60 p-12 text-center">
                <UserIcon className="h-10 w-10 text-muted-foreground/40" />
                <div>
                  <p className="text-sm font-medium">No technicians found</p>
                  <p className="text-xs text-muted-foreground mt-1">
                    Invite technicians from the{" "}
                    <a href="/team" className="underline underline-offset-2">
                      Team page
                    </a>{" "}
                    to start building routes.
                  </p>
                </div>
              </div>
            ) : (
              <RouteBuilder
                techs={techList}
                initialTechId={firstTechId}
                initialStops={initialStops}
                initialUnassigned={initialUnassigned}
                homeBase={homeBase}
              />
            ),
          rules: rulesPanel,
          holidays: holidaysPanel,
        }}
      </ScheduleTabs>
    </div>
  )
}
