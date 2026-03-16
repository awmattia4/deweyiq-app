"use server"

/**
 * team-dashboard.ts — Team management dashboard server actions.
 *
 * Phase 11, Plan 13: Team Dashboard & Labor Cost Analysis
 *
 * Exports:
 *   - getTeamDashboard: Owner only — per-employee live status, hours, PTO, alerts
 *   - getLaborCostAnalysis: Owner only — per-stop, per-route, per-customer labor costs
 *   - getTeamAlerts: Owner only — certification expiry, forgotten clock-outs, break violations, open PTO requests
 *   - forceClockOut: Owner only — force clock-out a tech who forgot to clock out
 */

import { createClient } from "@/lib/supabase/server"
import { withRls } from "@/lib/db"
import type { SupabaseToken } from "@/lib/db"
import {
  profiles,
  timeEntries,
  timeEntryStops,
  ptoBalances,
  ptoRequests,
  employeeDocuments,
  routeStops,
  customers,
} from "@/lib/db/schema"
import { and, eq, gte, lte, lt, isNull, isNotNull, sum, count, sql, desc, asc } from "drizzle-orm"

// ─── Auth helper ───────────────────────────────────────────────────────────────

async function getRlsToken(): Promise<SupabaseToken | null> {
  const supabase = await createClient()
  const { data: claimsData } = await supabase.auth.getClaims()
  if (!claimsData?.claims) return null
  return claimsData.claims as SupabaseToken
}

/** Returns today's date in YYYY-MM-DD format using local time (not UTC). */
function toLocalDate(d: Date = new Date()): string {
  const pad = (n: number) => String(n).padStart(2, "0")
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
}

/** Returns the Monday of the current week as YYYY-MM-DD in local time. */
function getCurrentWeekMonday(from: Date = new Date()): string {
  const jsDay = from.getDay() // 0=Sun, 1=Mon, ...
  const daysFromMonday = jsDay === 0 ? -6 : 1 - jsDay
  const monday = new Date(from)
  monday.setDate(from.getDate() + daysFromMonday)
  return toLocalDate(monday)
}

/** Returns the Sunday of the current week (end of week) as YYYY-MM-DD in local time. */
function getCurrentWeekSunday(from: Date = new Date()): string {
  const jsDay = from.getDay()
  const daysToSunday = jsDay === 0 ? 0 : 7 - jsDay
  const sunday = new Date(from)
  sunday.setDate(from.getDate() + daysToSunday)
  return toLocalDate(sunday)
}

// ─── Types ────────────────────────────────────────────────────────────────────

export type TechStatus = "clocked_in" | "on_break" | "clocked_out" | "off_shift"

export interface EmployeeDashboardEntry {
  id: string
  full_name: string
  email: string
  role: string
  avatar_url: string | null
  pay_type: string | null
  pay_rate: string | null
  // Live status
  status: TechStatus
  /** ISO timestamp of clock-in if currently active */
  clocked_in_at: string | null
  /** Today's hours in decimal (e.g. 4.5 = 4h 30m), including current shift elapsed */
  today_hours: number
  /** This week's total hours (Mon–Sun) */
  week_hours: number
  // PTO
  pto_balance_hours: number
  pending_pto_count: number
  // Alerts
  expiring_cert_count: number
  /** Number of stops completed today */
  stops_today: number
}

export interface TeamDashboardResult {
  success: true
  data: {
    employees: EmployeeDashboardEntry[]
    generated_at: string
  }
}

export interface TeamDashboardError {
  success: false
  error: string
}

export type TeamDashboardResponse = TeamDashboardResult | TeamDashboardError

export interface PerStopCost {
  stop_id: string
  customer_id: string
  customer_name: string
  tech_id: string
  tech_name: string
  scheduled_date: string
  onsite_minutes: number
  pay_type: string
  pay_rate: number
  estimated_cost: number
}

export interface PerEmployeeCost {
  tech_id: string
  tech_name: string
  pay_type: string
  pay_rate: number
  total_hours: number
  total_stops: number
  total_cost: number
  cost_per_stop: number
}

export interface PerCustomerCost {
  customer_id: string
  customer_name: string
  total_visits: number
  total_onsite_minutes: number
  total_cost: number
  avg_cost_per_visit: number
}

export interface LaborCostSummary {
  total_cost: number
  avg_cost_per_stop: number
  total_stops: number
  total_hours: number
}

export interface LaborCostResult {
  success: true
  data: {
    per_employee: PerEmployeeCost[]
    per_customer: PerCustomerCost[]
    per_stop: PerStopCost[]
    summary: LaborCostSummary
  }
}

export interface LaborCostError {
  success: false
  error: string
}

export type LaborCostResponse = LaborCostResult | LaborCostError

export interface TeamAlert {
  id: string
  type: "cert_expiry" | "forgotten_clock_out" | "break_violation" | "pending_pto"
  severity: "warning" | "critical"
  title: string
  description: string
  tech_id: string
  tech_name: string
  /** Extra structured data for action buttons */
  metadata?: Record<string, string | number>
}

export interface TeamAlertsResult {
  success: true
  data: TeamAlert[]
}

export interface TeamAlertsError {
  success: false
  error: string
}

export type TeamAlertsResponse = TeamAlertsResult | TeamAlertsError

// ─── getTeamDashboard ─────────────────────────────────────────────────────────

/**
 * Returns per-employee live status, today's hours, weekly hours, PTO balance,
 * pending PTO count, expiring cert count, and stops completed today.
 *
 * Owner only.
 */
export async function getTeamDashboard(): Promise<TeamDashboardResponse> {
  const token = await getRlsToken()
  if (!token) return { success: false, error: "Not authenticated" }

  const role = (token as Record<string, unknown>).user_role as string
  if (role !== "owner") return { success: false, error: "Owner access required" }

  try {
    const today = toLocalDate()
    const weekMonday = getCurrentWeekMonday()
    const weekSunday = getCurrentWeekSunday()
    const now = new Date()
    const thirtyDaysFromNow = new Date(now)
    thirtyDaysFromNow.setDate(now.getDate() + 30)
    const thirtyDaysStr = toLocalDate(thirtyDaysFromNow)

    // 1. Fetch all org members (non-customer)
    const allProfiles = await withRls(token, (db) =>
      db
        .select({
          id: profiles.id,
          full_name: profiles.full_name,
          email: profiles.email,
          role: profiles.role,
          avatar_url: profiles.avatar_url,
          pay_type: profiles.pay_type,
          pay_rate: profiles.pay_rate,
        })
        .from(profiles)
        .orderBy(asc(profiles.full_name))
    )

    const techProfiles = allProfiles.filter((p) => p.role === "tech" || p.role === "owner" || p.role === "office")
    const profileIds = techProfiles.map((p) => p.id)

    if (profileIds.length === 0) {
      return {
        success: true,
        data: { employees: [], generated_at: now.toISOString() },
      }
    }

    // 2. Fetch today's time entries for all team members
    // LEFT JOIN approach per MEMORY.md — never correlated subqueries on RLS-protected tables
    const todayEntries = await withRls(token, (db) =>
      db
        .select({
          tech_id: timeEntries.tech_id,
          status: timeEntries.status,
          clocked_in_at: timeEntries.clocked_in_at,
          clocked_out_at: timeEntries.clocked_out_at,
          total_minutes: timeEntries.total_minutes,
          break_minutes: timeEntries.break_minutes,
        })
        .from(timeEntries)
        .where(eq(timeEntries.work_date, today))
        .orderBy(desc(timeEntries.clocked_in_at))
    )

    // 3. Fetch this week's completed time entries (Mon–Sun) for all team members
    const weekEntries = await withRls(token, (db) =>
      db
        .select({
          tech_id: timeEntries.tech_id,
          total_minutes: timeEntries.total_minutes,
          break_minutes: timeEntries.break_minutes,
          status: timeEntries.status,
          clocked_in_at: timeEntries.clocked_in_at,
          clocked_out_at: timeEntries.clocked_out_at,
          work_date: timeEntries.work_date,
        })
        .from(timeEntries)
        .where(
          and(
            gte(timeEntries.work_date, weekMonday),
            lte(timeEntries.work_date, weekSunday)
          )
        )
    )

    // 4. Fetch PTO balances for all profiles
    const ptoData = await withRls(token, (db) =>
      db
        .select({
          tech_id: ptoBalances.tech_id,
          balance_hours: ptoBalances.balance_hours,
        })
        .from(ptoBalances)
    )

    // 5. Fetch pending PTO requests
    const pendingPto = await withRls(token, (db) =>
      db
        .select({
          tech_id: ptoRequests.tech_id,
          status: ptoRequests.status,
        })
        .from(ptoRequests)
        .where(eq(ptoRequests.status, "pending"))
    )

    // 6. Fetch expiring certifications (within 30 days)
    const expiringDocs = await withRls(token, (db) =>
      db
        .select({
          tech_id: employeeDocuments.tech_id,
          expires_at: employeeDocuments.expires_at,
        })
        .from(employeeDocuments)
        .where(
          and(
            isNotNull(employeeDocuments.expires_at),
            lte(employeeDocuments.expires_at, thirtyDaysStr)
          )
        )
    )

    // 7. Fetch stops completed today (via route_stops with status='complete')
    const stopsToday = await withRls(token, (db) =>
      db
        .select({
          tech_id: routeStops.tech_id,
          count: count(routeStops.id),
        })
        .from(routeStops)
        .where(
          and(
            eq(routeStops.scheduled_date, today),
            eq(routeStops.status, "complete"),
            isNotNull(routeStops.tech_id)
          )
        )
        .groupBy(routeStops.tech_id)
    )

    // ── Aggregate per profile ──────────────────────────────────────────────────

    const employees: EmployeeDashboardEntry[] = techProfiles.map((profile) => {
      // Determine live status from today's entries
      const profileTodayEntries = todayEntries.filter((e) => e.tech_id === profile.id)
      // Most recent entry first
      const activeEntry = profileTodayEntries.find((e) => e.status === "active" || e.status === "on_break")

      let status: TechStatus = "off_shift"
      let clocked_in_at: string | null = null

      if (activeEntry) {
        status = activeEntry.status === "on_break" ? "on_break" : "clocked_in"
        clocked_in_at = activeEntry.clocked_in_at.toISOString()
      } else if (profileTodayEntries.length > 0) {
        // Had entries today but all completed
        status = "clocked_out"
      }

      // Today's hours: sum completed entries + current elapsed if active
      let today_minutes = 0
      for (const entry of profileTodayEntries) {
        if (entry.status === "complete" && entry.total_minutes !== null) {
          today_minutes += entry.total_minutes
        } else if ((entry.status === "active" || entry.status === "on_break") && entry.clocked_in_at) {
          // Add elapsed since clock-in
          const elapsedMs = now.getTime() - entry.clocked_in_at.getTime()
          const elapsedMinutes = Math.floor(elapsedMs / 60000)
          const breaks = entry.break_minutes ?? 0
          today_minutes += Math.max(0, elapsedMinutes - breaks)
        }
      }

      // This week's hours: sum all entries in the week
      const profileWeekEntries = weekEntries.filter((e) => e.tech_id === profile.id)
      let week_minutes = 0
      for (const entry of profileWeekEntries) {
        if (entry.status === "complete" && entry.total_minutes !== null) {
          week_minutes += entry.total_minutes
        } else if ((entry.status === "active" || entry.status === "on_break") && entry.clocked_in_at) {
          const elapsedMs = now.getTime() - entry.clocked_in_at.getTime()
          const elapsedMinutes = Math.floor(elapsedMs / 60000)
          const breaks = entry.break_minutes ?? 0
          week_minutes += Math.max(0, elapsedMinutes - breaks)
        }
      }

      // PTO balance — sum all pto_types
      const profilePto = ptoData.filter((p) => p.tech_id === profile.id)
      const pto_balance_hours = profilePto.reduce(
        (sum, p) => sum + parseFloat(p.balance_hours ?? "0"),
        0
      )

      // Pending PTO count
      const pending_pto_count = pendingPto.filter((p) => p.tech_id === profile.id).length

      // Expiring cert count
      const expiring_cert_count = expiringDocs.filter((d) => d.tech_id === profile.id).length

      // Stops completed today
      const stopEntry = stopsToday.find((s) => s.tech_id === profile.id)
      const stops_today = stopEntry ? Number(stopEntry.count) : 0

      return {
        id: profile.id,
        full_name: profile.full_name,
        email: profile.email,
        role: profile.role,
        avatar_url: profile.avatar_url,
        pay_type: profile.pay_type,
        pay_rate: profile.pay_rate,
        status,
        clocked_in_at,
        today_hours: Math.round((today_minutes / 60) * 100) / 100,
        week_hours: Math.round((week_minutes / 60) * 100) / 100,
        pto_balance_hours: Math.round(pto_balance_hours * 100) / 100,
        pending_pto_count,
        expiring_cert_count,
        stops_today,
      }
    })

    return {
      success: true,
      data: {
        employees,
        generated_at: now.toISOString(),
      },
    }
  } catch (err) {
    console.error("[getTeamDashboard]", err)
    return { success: false, error: "Failed to load team dashboard" }
  }
}

// ─── getLaborCostAnalysis ──────────────────────────────────────────────────────

/**
 * Returns labor cost breakdown for a given date range.
 * Per-stop, per-employee, and per-customer views.
 *
 * Owner only.
 */
export async function getLaborCostAnalysis(
  startDate: string,
  endDate: string
): Promise<LaborCostResponse> {
  const token = await getRlsToken()
  if (!token) return { success: false, error: "Not authenticated" }

  const role = (token as Record<string, unknown>).user_role as string
  if (role !== "owner") return { success: false, error: "Owner access required" }

  try {
    // 1. Fetch all time entry stops in the date range via time_entries work_date
    //    Join: time_entry_stops → time_entries (for tech_id + work_date) → profiles (pay_rate) → route_stops → customers
    //    Per MEMORY.md: use LEFT JOINs, not correlated subqueries
    const stopsWithCost = await withRls(token, (db) =>
      db
        .select({
          stop_id: timeEntryStops.route_stop_id,
          time_entry_id: timeEntryStops.time_entry_id,
          onsite_minutes: timeEntryStops.onsite_minutes,
          tech_id: timeEntries.tech_id,
          work_date: timeEntries.work_date,
          tech_name: profiles.full_name,
          pay_type: profiles.pay_type,
          pay_rate: profiles.pay_rate,
          customer_id: routeStops.customer_id,
          customer_name: customers.full_name,
        })
        .from(timeEntryStops)
        .innerJoin(timeEntries, eq(timeEntryStops.time_entry_id, timeEntries.id))
        .innerJoin(profiles, eq(timeEntries.tech_id, profiles.id))
        .innerJoin(routeStops, eq(timeEntryStops.route_stop_id, routeStops.id))
        .innerJoin(customers, eq(routeStops.customer_id, customers.id))
        .where(
          and(
            gte(timeEntries.work_date, startDate),
            lte(timeEntries.work_date, endDate),
            isNotNull(timeEntryStops.onsite_minutes)
          )
        )
    )

    // 2. Compute per-stop costs
    const per_stop: PerStopCost[] = stopsWithCost.map((row) => {
      const payRate = parseFloat(row.pay_rate ?? "0")
      const payType = row.pay_type ?? "hourly"
      const onsiteMinutes = row.onsite_minutes ?? 0
      // Estimated cost: for hourly, (onsite_minutes / 60) * pay_rate
      // For per_stop, use pay_rate directly regardless of time
      const estimated_cost =
        payType === "per_stop" ? payRate : (onsiteMinutes / 60) * payRate

      return {
        stop_id: row.stop_id,
        customer_id: row.customer_id,
        customer_name: row.customer_name,
        tech_id: row.tech_id,
        tech_name: row.tech_name,
        scheduled_date: row.work_date,
        onsite_minutes: onsiteMinutes,
        pay_type: payType,
        pay_rate: payRate,
        estimated_cost: Math.round(estimated_cost * 100) / 100,
      }
    })

    // 3. Also aggregate completed time entries without stop records (shift-level)
    //    For techs with hourly pay, we want route-level hours too
    const shiftEntries = await withRls(token, (db) =>
      db
        .select({
          tech_id: timeEntries.tech_id,
          work_date: timeEntries.work_date,
          total_minutes: timeEntries.total_minutes,
          break_minutes: timeEntries.break_minutes,
          tech_name: profiles.full_name,
          pay_type: profiles.pay_type,
          pay_rate: profiles.pay_rate,
        })
        .from(timeEntries)
        .innerJoin(profiles, eq(timeEntries.tech_id, profiles.id))
        .where(
          and(
            gte(timeEntries.work_date, startDate),
            lte(timeEntries.work_date, endDate),
            eq(timeEntries.status, "complete")
          )
        )
    )

    // 4. Aggregate per-employee costs
    const employeeMap = new Map<
      string,
      { tech_name: string; pay_type: string; pay_rate: number; total_minutes: number; total_stops: number; total_cost: number }
    >()

    // For hourly techs, use shift-level data for total hours
    for (const entry of shiftEntries) {
      const payType = entry.pay_type ?? "hourly"
      const payRate = parseFloat(entry.pay_rate ?? "0")
      const workMinutes = (entry.total_minutes ?? 0) - (entry.break_minutes ?? 0)

      const existing = employeeMap.get(entry.tech_id)
      if (existing) {
        existing.total_minutes += workMinutes
        // For per_stop: cost is counted separately below
        if (payType === "hourly") {
          existing.total_cost += (workMinutes / 60) * payRate
        }
      } else {
        employeeMap.set(entry.tech_id, {
          tech_name: entry.tech_name,
          pay_type: payType,
          pay_rate: payRate,
          total_minutes: workMinutes,
          total_stops: 0,
          total_cost: payType === "hourly" ? (workMinutes / 60) * payRate : 0,
        })
      }
    }

    // Add per_stop costs and stop counts
    for (const stopRow of per_stop) {
      const existing = employeeMap.get(stopRow.tech_id)
      if (existing) {
        existing.total_stops++
        if (stopRow.pay_type === "per_stop") {
          existing.total_cost += stopRow.estimated_cost
        }
      } else {
        employeeMap.set(stopRow.tech_id, {
          tech_name: stopRow.tech_name,
          pay_type: stopRow.pay_type,
          pay_rate: stopRow.pay_rate,
          total_minutes: stopRow.onsite_minutes,
          total_stops: 1,
          total_cost: stopRow.pay_type === "per_stop" ? stopRow.estimated_cost : 0,
        })
      }
    }

    const per_employee: PerEmployeeCost[] = Array.from(employeeMap.entries()).map(
      ([tech_id, data]) => ({
        tech_id,
        tech_name: data.tech_name,
        pay_type: data.pay_type,
        pay_rate: data.pay_rate,
        total_hours: Math.round((data.total_minutes / 60) * 100) / 100,
        total_stops: data.total_stops,
        total_cost: Math.round(data.total_cost * 100) / 100,
        cost_per_stop:
          data.total_stops > 0
            ? Math.round((data.total_cost / data.total_stops) * 100) / 100
            : 0,
      })
    )

    // 5. Aggregate per-customer costs
    const customerMap = new Map<
      string,
      { customer_name: string; total_visits: number; total_onsite_minutes: number; total_cost: number }
    >()

    for (const stopRow of per_stop) {
      const existing = customerMap.get(stopRow.customer_id)
      if (existing) {
        existing.total_visits++
        existing.total_onsite_minutes += stopRow.onsite_minutes
        existing.total_cost += stopRow.estimated_cost
      } else {
        customerMap.set(stopRow.customer_id, {
          customer_name: stopRow.customer_name,
          total_visits: 1,
          total_onsite_minutes: stopRow.onsite_minutes,
          total_cost: stopRow.estimated_cost,
        })
      }
    }

    const per_customer: PerCustomerCost[] = Array.from(customerMap.entries()).map(
      ([customer_id, data]) => ({
        customer_id,
        customer_name: data.customer_name,
        total_visits: data.total_visits,
        total_onsite_minutes: data.total_onsite_minutes,
        total_cost: Math.round(data.total_cost * 100) / 100,
        avg_cost_per_visit:
          data.total_visits > 0
            ? Math.round((data.total_cost / data.total_visits) * 100) / 100
            : 0,
      })
    ).sort((a, b) => b.total_cost - a.total_cost)

    // 6. Build summary
    const total_cost = per_employee.reduce((s, e) => s + e.total_cost, 0)
    const total_stops = per_stop.length
    const total_hours = per_employee.reduce((s, e) => s + e.total_hours, 0)

    const summary: LaborCostSummary = {
      total_cost: Math.round(total_cost * 100) / 100,
      avg_cost_per_stop: total_stops > 0 ? Math.round((total_cost / total_stops) * 100) / 100 : 0,
      total_stops,
      total_hours: Math.round(total_hours * 100) / 100,
    }

    return {
      success: true,
      data: { per_employee, per_customer, per_stop, summary },
    }
  } catch (err) {
    console.error("[getLaborCostAnalysis]", err)
    return { success: false, error: "Failed to load labor cost analysis" }
  }
}

// ─── getTeamAlerts ────────────────────────────────────────────────────────────

/**
 * Returns actionable team management alerts:
 * - Certification expiry within 30 days
 * - Forgotten clock-outs (active entry with work_date < today)
 * - Break compliance (worked > 6 hours without any break)
 * - Open PTO requests (pending approval)
 *
 * Owner only.
 */
export async function getTeamAlerts(): Promise<TeamAlertsResponse> {
  const token = await getRlsToken()
  if (!token) return { success: false, error: "Not authenticated" }

  const role = (token as Record<string, unknown>).user_role as string
  if (role !== "owner") return { success: false, error: "Owner access required" }

  try {
    const today = toLocalDate()
    const now = new Date()
    const thirtyDaysFromNow = new Date(now)
    thirtyDaysFromNow.setDate(now.getDate() + 30)
    const thirtyDaysStr = toLocalDate(thirtyDaysFromNow)

    // Fetch all needed data in parallel
    const [expiringSoon, forgottenClockOuts, pendingPtoList, longShiftsToday] = await Promise.all([
      // Certs expiring within 30 days
      withRls(token, (db) =>
        db
          .select({
            tech_id: employeeDocuments.tech_id,
            tech_name: profiles.full_name,
            doc_name: employeeDocuments.doc_name,
            expires_at: employeeDocuments.expires_at,
          })
          .from(employeeDocuments)
          .innerJoin(profiles, eq(employeeDocuments.tech_id, profiles.id))
          .where(
            and(
              isNotNull(employeeDocuments.expires_at),
              lte(employeeDocuments.expires_at, thirtyDaysStr)
            )
          )
          .orderBy(asc(employeeDocuments.expires_at))
      ),

      // Forgotten clock-outs: active entries with work_date < today
      withRls(token, (db) =>
        db
          .select({
            id: timeEntries.id,
            tech_id: timeEntries.tech_id,
            tech_name: profiles.full_name,
            work_date: timeEntries.work_date,
            clocked_in_at: timeEntries.clocked_in_at,
            status: timeEntries.status,
          })
          .from(timeEntries)
          .innerJoin(profiles, eq(timeEntries.tech_id, profiles.id))
          .where(
            and(
              lt(timeEntries.work_date, today),
              isNull(timeEntries.clocked_out_at)
            )
          )
          .orderBy(desc(timeEntries.clocked_in_at))
      ),

      // Open PTO requests
      withRls(token, (db) =>
        db
          .select({
            id: ptoRequests.id,
            tech_id: ptoRequests.tech_id,
            tech_name: profiles.full_name,
            pto_type: ptoRequests.pto_type,
            start_date: ptoRequests.start_date,
            end_date: ptoRequests.end_date,
            hours: ptoRequests.hours,
          })
          .from(ptoRequests)
          .innerJoin(profiles, eq(ptoRequests.tech_id, profiles.id))
          .where(eq(ptoRequests.status, "pending"))
          .orderBy(asc(ptoRequests.created_at))
      ),

      // Break compliance: today's completed entries with total_minutes > 360 and break_minutes = 0
      withRls(token, (db) =>
        db
          .select({
            tech_id: timeEntries.tech_id,
            tech_name: profiles.full_name,
            work_date: timeEntries.work_date,
            total_minutes: timeEntries.total_minutes,
            break_minutes: timeEntries.break_minutes,
          })
          .from(timeEntries)
          .innerJoin(profiles, eq(timeEntries.tech_id, profiles.id))
          .where(
            and(
              eq(timeEntries.status, "complete"),
              gte(timeEntries.work_date, (() => {
                // Last 7 days
                const d = new Date()
                d.setDate(d.getDate() - 7)
                return toLocalDate(d)
              })()),
              sql`${timeEntries.total_minutes} > 360`,
              sql`COALESCE(${timeEntries.break_minutes}, 0) = 0`
            )
          )
      ),
    ])

    const alerts: TeamAlert[] = []

    // Certification expiry alerts
    for (const doc of expiringSoon) {
      const expiresAt = doc.expires_at ? new Date(doc.expires_at) : null
      if (!expiresAt) continue

      const daysUntilExpiry = Math.floor(
        (expiresAt.getTime() - now.getTime()) / (1000 * 60 * 60 * 24)
      )

      const isExpired = daysUntilExpiry < 0
      alerts.push({
        id: `cert-${doc.tech_id}-${doc.expires_at}`,
        type: "cert_expiry",
        severity: isExpired || daysUntilExpiry <= 7 ? "critical" : "warning",
        title: isExpired
          ? `${doc.doc_name} expired`
          : `${doc.doc_name} expiring soon`,
        description: isExpired
          ? `${doc.tech_name}'s ${doc.doc_name} expired on ${doc.expires_at}`
          : `${doc.tech_name}'s ${doc.doc_name} expires in ${daysUntilExpiry} day${daysUntilExpiry === 1 ? "" : "s"}`,
        tech_id: doc.tech_id,
        tech_name: doc.tech_name,
        metadata: { expires_at: doc.expires_at ?? "", days_until_expiry: daysUntilExpiry },
      })
    }

    // Forgotten clock-out alerts
    for (const entry of forgottenClockOuts) {
      alerts.push({
        id: `forgotten-${entry.id}`,
        type: "forgotten_clock_out",
        severity: "warning",
        title: `${entry.tech_name} still clocked in`,
        description: `${entry.tech_name} clocked in on ${entry.work_date} and never clocked out`,
        tech_id: entry.tech_id,
        tech_name: entry.tech_name,
        metadata: {
          time_entry_id: entry.id,
          work_date: entry.work_date,
          clocked_in_at: entry.clocked_in_at.toISOString(),
        },
      })
    }

    // Break compliance alerts
    for (const entry of longShiftsToday) {
      const totalHours = ((entry.total_minutes ?? 0) / 60).toFixed(1)
      alerts.push({
        id: `break-${entry.tech_id}-${entry.work_date}`,
        type: "break_violation",
        severity: "warning",
        title: `No break recorded for ${entry.tech_name}`,
        description: `${entry.tech_name} worked ${totalHours} hours on ${entry.work_date} with no break recorded`,
        tech_id: entry.tech_id,
        tech_name: entry.tech_name,
        metadata: {
          work_date: entry.work_date,
          total_hours: parseFloat(totalHours),
        },
      })
    }

    // Pending PTO alerts
    for (const pto of pendingPtoList) {
      alerts.push({
        id: `pto-${pto.id}`,
        type: "pending_pto",
        severity: "warning",
        title: `PTO request from ${pto.tech_name}`,
        description: `${pto.tech_name} requested ${pto.hours} hours of ${pto.pto_type} PTO (${pto.start_date} – ${pto.end_date})`,
        tech_id: pto.tech_id,
        tech_name: pto.tech_name,
        metadata: {
          pto_request_id: pto.id,
          pto_type: pto.pto_type,
          hours: parseFloat(pto.hours),
          start_date: pto.start_date,
          end_date: pto.end_date,
        },
      })
    }

    // Sort: critical first, then warning
    alerts.sort((a, b) => {
      if (a.severity === b.severity) return 0
      return a.severity === "critical" ? -1 : 1
    })

    return { success: true, data: alerts }
  } catch (err) {
    console.error("[getTeamAlerts]", err)
    return { success: false, error: "Failed to load team alerts" }
  }
}

// ─── forceClockOut ────────────────────────────────────────────────────────────

/**
 * Owner forces a clock-out for a forgotten time entry.
 * Sets clocked_out_at = now(), computes total_minutes, sets status = 'complete'.
 */
export async function forceClockOut(
  timeEntryId: string
): Promise<{ success: boolean; error?: string }> {
  const token = await getRlsToken()
  if (!token) return { success: false, error: "Not authenticated" }

  const role = (token as Record<string, unknown>).user_role as string
  if (role !== "owner") return { success: false, error: "Owner access required" }

  try {
    const now = new Date()

    // Fetch the entry to compute total_minutes
    const [entry] = await withRls(token, (db) =>
      db
        .select({
          id: timeEntries.id,
          clocked_in_at: timeEntries.clocked_in_at,
          break_minutes: timeEntries.break_minutes,
        })
        .from(timeEntries)
        .where(eq(timeEntries.id, timeEntryId))
        .limit(1)
    )

    if (!entry) return { success: false, error: "Time entry not found" }

    const elapsedMs = now.getTime() - entry.clocked_in_at.getTime()
    const elapsedMinutes = Math.floor(elapsedMs / 60000)
    const totalMinutes = Math.max(0, elapsedMinutes - (entry.break_minutes ?? 0))

    await withRls(token, (db) =>
      db
        .update(timeEntries)
        .set({
          clocked_out_at: now,
          total_minutes: totalMinutes,
          status: "complete",
          updated_at: now,
        })
        .where(eq(timeEntries.id, timeEntryId))
    )

    return { success: true }
  } catch (err) {
    console.error("[forceClockOut]", err)
    return { success: false, error: "Failed to force clock out" }
  }
}
