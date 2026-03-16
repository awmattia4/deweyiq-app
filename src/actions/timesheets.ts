"use server"

/**
 * timesheets.ts — Phase 11-04 timesheet review and QBO push actions.
 *
 * Provides:
 *   - getTimesheets: weekly grouped time data per tech (owner/office)
 *   - editTimeEntry: manual clock-time correction (owner only, pre-sync)
 *   - approveTimesheet: approve a tech's week and push to QBO
 *   - getTimesheetSummary: aggregated pay-period data for payroll export
 *
 * Pattern: withRls for user-facing queries, adminDb for QBO push (service role).
 * LEFT JOIN everywhere — no correlated subqueries on RLS-protected tables (MEMORY.md).
 */

import { revalidatePath } from "next/cache"
import { createClient } from "@/lib/supabase/server"
import { withRls, adminDb } from "@/lib/db"
import type { SupabaseToken } from "@/lib/db"
import {
  timeEntries,
  timeEntryStops,
  breakEvents,
  ptoRequests,
  profiles,
  orgSettings,
} from "@/lib/db/schema"
import { and, between, eq, gte, isNull, lte, sql } from "drizzle-orm"
import { pushPayPeriodToQbo } from "@/lib/qbo/time-sync"

// ─── Auth helper ──────────────────────────────────────────────────────────────

async function getRlsToken(): Promise<SupabaseToken | null> {
  const supabase = await createClient()
  const { data: claimsData } = await supabase.auth.getClaims()
  if (!claimsData?.claims) return null
  return claimsData.claims as SupabaseToken
}

// ─── Types ────────────────────────────────────────────────────────────────────

export interface DayBreakdown {
  date: string // YYYY-MM-DD
  /** Total gross minutes worked (including breaks) */
  grossMinutes: number
  /** Minutes actively worked (gross minus breaks) */
  netMinutes: number
  /** Break minutes */
  breakMinutes: number
  /** time_entries rows that contributed to this day */
  entries: DailyEntryRow[]
}

export interface DailyEntryRow {
  id: string
  clockedInAt: string | null
  clockedOutAt: string | null
  totalMinutes: number | null
  breakMinutes: number | null
  status: string
  notes: string | null
  qboTimeActivityId: string | null
  qboSyncedAt: string | null
  approvedAt: string | null
  approvedBy: string | null
}

export interface TechWeeklyTimesheet {
  techId: string
  techName: string
  /** Mon-Sun day breakdown for the week */
  days: DayBreakdown[]
  /** Total net minutes worked across the week */
  totalNetMinutes: number
  /** Total gross minutes (raw clock time) */
  totalGrossMinutes: number
  /** Total break minutes */
  totalBreakMinutes: number
  /** Regular hours (up to overtime threshold) */
  regularHours: number
  /** Overtime hours (above threshold) */
  overtimeHours: number
  /** PTO hours approved for this week */
  ptoHours: number
  /** true if ALL entries in this week have been approved */
  isApproved: boolean
  /** true if ALL approved entries are also QBO-synced */
  isSynced: boolean
}

export interface TimesheetWeekResult {
  weekStart: string // YYYY-MM-DD (Monday)
  weekEnd: string   // YYYY-MM-DD (Sunday)
  overtimeThresholdHours: number
  techs: TechWeeklyTimesheet[]
}

// ─── Utility: compute week bounds (Mon-Sun) ────────────────────────────────────

function getWeekBounds(weekStartDate: string): { weekStart: string; weekEnd: string } {
  // weekStartDate is assumed to be a Monday (YYYY-MM-DD)
  const start = new Date(weekStartDate + "T00:00:00")
  const end = new Date(start)
  end.setDate(end.getDate() + 6) // +6 days = Sunday

  const pad = (n: number) => String(n).padStart(2, "0")
  const fmt = (d: Date) =>
    `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`

  return { weekStart: fmt(start), weekEnd: fmt(end) }
}

// ─── getTimesheets ─────────────────────────────────────────────────────────────

/**
 * Returns weekly timesheet data grouped by tech.
 *
 * Access: owner / office only.
 *
 * @param weekStartDate - YYYY-MM-DD of the Monday start of the week
 * @param techId        - optional filter to a single tech
 */
export async function getTimesheets(
  weekStartDate: string,
  techId?: string
): Promise<{ success: boolean; data?: TimesheetWeekResult; error?: string }> {
  const token = await getRlsToken()
  if (!token) return { success: false, error: "Not authenticated" }

  const userRole = token["user_role"] as string | undefined
  const orgId = token["org_id"] as string | undefined

  if (!orgId) return { success: false, error: "Invalid session" }
  if (userRole !== "owner" && userRole !== "office") {
    return { success: false, error: "Owner or office access required" }
  }

  const { weekStart, weekEnd } = getWeekBounds(weekStartDate)

  try {
    // 1. Fetch overtime threshold from org_settings
    const settingsRows = await withRls(token, (db) =>
      db
        .select({ overtime_threshold_hours: orgSettings.overtime_threshold_hours })
        .from(orgSettings)
        .where(eq(orgSettings.org_id, orgId))
        .limit(1)
    )
    const overtimeThreshold = settingsRows[0]?.overtime_threshold_hours ?? 40

    // 2. Fetch all time_entries for the week (LEFT JOIN profiles for names)
    const entries = await withRls(token, (db) =>
      db
        .select({
          id: timeEntries.id,
          tech_id: timeEntries.tech_id,
          tech_name: profiles.full_name,
          work_date: timeEntries.work_date,
          status: timeEntries.status,
          clocked_in_at: timeEntries.clocked_in_at,
          clocked_out_at: timeEntries.clocked_out_at,
          total_minutes: timeEntries.total_minutes,
          break_minutes: timeEntries.break_minutes,
          notes: timeEntries.notes,
          qbo_time_activity_id: timeEntries.qbo_time_activity_id,
          qbo_synced_at: timeEntries.qbo_synced_at,
          approved_at: timeEntries.approved_at,
          approved_by: timeEntries.approved_by,
        })
        .from(timeEntries)
        .innerJoin(profiles, eq(profiles.id, timeEntries.tech_id))
        .where(
          and(
            eq(timeEntries.org_id, orgId),
            gte(timeEntries.work_date, weekStart),
            lte(timeEntries.work_date, weekEnd),
            techId ? eq(timeEntries.tech_id, techId) : undefined
          )
        )
    )

    // 3. Fetch approved PTO requests that overlap this week
    const ptoRows = await withRls(token, (db) =>
      db
        .select({
          tech_id: ptoRequests.tech_id,
          hours: ptoRequests.hours,
          start_date: ptoRequests.start_date,
          end_date: ptoRequests.end_date,
        })
        .from(ptoRequests)
        .where(
          and(
            eq(ptoRequests.org_id, orgId),
            eq(ptoRequests.status, "approved"),
            // Overlap: PTO start <= weekEnd AND PTO end >= weekStart
            lte(ptoRequests.start_date, weekEnd),
            gte(ptoRequests.end_date, weekStart)
          )
        )
    )

    // 4. Group entries by tech
    const techMap = new Map<string, { name: string; entries: typeof entries }>()
    for (const entry of entries) {
      const existing = techMap.get(entry.tech_id)
      if (existing) {
        existing.entries.push(entry)
      } else {
        techMap.set(entry.tech_id, { name: entry.tech_name, entries: [entry] })
      }
    }

    // 5. Build per-tech weekly summaries
    const techs: TechWeeklyTimesheet[] = []

    for (const [tId, { name, entries: techEntries }] of techMap) {
      // Group entries by work_date
      const dayMap = new Map<string, typeof techEntries>()
      for (const e of techEntries) {
        const day = dayMap.get(e.work_date) ?? []
        day.push(e)
        dayMap.set(e.work_date, day)
      }

      // Build day breakdowns for Mon-Sun
      const days: DayBreakdown[] = []
      let totalNetMinutes = 0
      let totalGrossMinutes = 0
      let totalBreakMinutes = 0

      // Generate all 7 days of the week
      const weekStartObj = new Date(weekStart + "T00:00:00")
      for (let i = 0; i < 7; i++) {
        const dayDate = new Date(weekStartObj)
        dayDate.setDate(dayDate.getDate() + i)
        const pad = (n: number) => String(n).padStart(2, "0")
        const dateStr = `${dayDate.getFullYear()}-${pad(dayDate.getMonth() + 1)}-${pad(dayDate.getDate())}`

        const dayEntries = dayMap.get(dateStr) ?? []
        const dayGross = dayEntries.reduce((sum, e) => sum + (e.total_minutes ?? 0), 0)
        const dayBreaks = dayEntries.reduce((sum, e) => sum + (e.break_minutes ?? 0), 0)
        const dayNet = dayGross - dayBreaks

        totalGrossMinutes += dayGross
        totalBreakMinutes += dayBreaks
        totalNetMinutes += dayNet

        days.push({
          date: dateStr,
          grossMinutes: dayGross,
          netMinutes: dayNet < 0 ? 0 : dayNet,
          breakMinutes: dayBreaks,
          entries: dayEntries.map((e) => ({
            id: e.id,
            clockedInAt: e.clocked_in_at?.toISOString() ?? null,
            clockedOutAt: e.clocked_out_at?.toISOString() ?? null,
            totalMinutes: e.total_minutes,
            breakMinutes: e.break_minutes,
            status: e.status,
            notes: e.notes,
            qboTimeActivityId: e.qbo_time_activity_id,
            qboSyncedAt: e.qbo_synced_at?.toISOString() ?? null,
            approvedAt: e.approved_at?.toISOString() ?? null,
            approvedBy: e.approved_by,
          })),
        })
      }

      // Overtime calculation (in hours)
      const totalNetHours = totalNetMinutes / 60
      const overtimeHours = Math.max(0, totalNetHours - overtimeThreshold)
      const regularHours = totalNetHours - overtimeHours

      // PTO hours for this week — pro-rate by overlap days
      const techPto = ptoRows.filter((p) => p.tech_id === tId)
      const ptoHours = techPto.reduce((sum, p) => sum + parseFloat(p.hours), 0)

      // Approval / sync status
      const completedEntries = techEntries.filter((e) => e.status === "complete")
      const isApproved =
        completedEntries.length > 0 &&
        completedEntries.every((e) => e.approved_at !== null)
      const isSynced =
        completedEntries.length > 0 &&
        completedEntries.every((e) => e.qbo_time_activity_id !== null)

      techs.push({
        techId: tId,
        techName: name,
        days,
        totalNetMinutes: totalNetMinutes < 0 ? 0 : totalNetMinutes,
        totalGrossMinutes,
        totalBreakMinutes,
        regularHours: Math.round(regularHours * 100) / 100,
        overtimeHours: Math.round(overtimeHours * 100) / 100,
        ptoHours: Math.round(ptoHours * 100) / 100,
        isApproved,
        isSynced,
      })
    }

    // Sort techs alphabetically
    techs.sort((a, b) => a.techName.localeCompare(b.techName))

    return {
      success: true,
      data: {
        weekStart,
        weekEnd,
        overtimeThresholdHours: overtimeThreshold,
        techs,
      },
    }
  } catch (error) {
    console.error("[getTimesheets] Error:", error)
    return { success: false, error: "Failed to load timesheets" }
  }
}

// ─── editTimeEntry ─────────────────────────────────────────────────────────────

/**
 * Allows owner to manually correct clock times on a time entry.
 * Only allowed if the entry has NOT been synced to QBO yet.
 */
export async function editTimeEntry(
  timeEntryId: string,
  updates: { clocked_in_at?: Date; clocked_out_at?: Date; notes?: string }
): Promise<{ success: boolean; error?: string }> {
  const token = await getRlsToken()
  if (!token) return { success: false, error: "Not authenticated" }

  const userRole = token["user_role"] as string | undefined
  if (userRole !== "owner") {
    return { success: false, error: "Owner access required" }
  }

  try {
    // Verify the entry isn't already QBO-synced
    const entryRows = await withRls(token, (db) =>
      db
        .select({
          id: timeEntries.id,
          qbo_time_activity_id: timeEntries.qbo_time_activity_id,
          clocked_in_at: timeEntries.clocked_in_at,
          clocked_out_at: timeEntries.clocked_out_at,
          break_minutes: timeEntries.break_minutes,
        })
        .from(timeEntries)
        .where(eq(timeEntries.id, timeEntryId))
        .limit(1)
    )

    if (entryRows.length === 0) {
      return { success: false, error: "Time entry not found" }
    }

    const entry = entryRows[0]

    if (entry.qbo_time_activity_id) {
      return {
        success: false,
        error: "Cannot edit a time entry that has already been synced to QuickBooks",
      }
    }

    const now = new Date()
    const newClockIn = updates.clocked_in_at ?? entry.clocked_in_at
    const newClockOut = updates.clocked_out_at ?? entry.clocked_out_at

    // Recalculate total_minutes from new times
    let newTotalMinutes: number | undefined
    if (newClockOut) {
      const gross = Math.round((newClockOut.getTime() - newClockIn.getTime()) / 60000)
      newTotalMinutes = Math.max(0, gross)
    }

    await withRls(token, (db) =>
      db
        .update(timeEntries)
        .set({
          ...(updates.clocked_in_at !== undefined && { clocked_in_at: updates.clocked_in_at }),
          ...(updates.clocked_out_at !== undefined && { clocked_out_at: updates.clocked_out_at }),
          ...(updates.notes !== undefined && { notes: updates.notes }),
          ...(newTotalMinutes !== undefined && { total_minutes: newTotalMinutes }),
          updated_at: now,
        })
        .where(eq(timeEntries.id, timeEntryId))
    )

    revalidatePath("/team")

    return { success: true }
  } catch (error) {
    console.error("[editTimeEntry] Error:", error)
    return { success: false, error: "Failed to update time entry" }
  }
}

// ─── approveTimesheet ─────────────────────────────────────────────────────────

/**
 * Approves all completed time entries for a tech in a given week.
 * After approval, triggers QBO push for each entry.
 *
 * Owner only.
 */
export async function approveTimesheet(
  techId: string,
  weekStartDate: string
): Promise<{ success: boolean; approvedCount?: number; error?: string }> {
  const token = await getRlsToken()
  if (!token) return { success: false, error: "Not authenticated" }

  const userRole = token["user_role"] as string | undefined
  const orgId = token["org_id"] as string | undefined
  const userId = token["sub"] as string | undefined

  if (userRole !== "owner") {
    return { success: false, error: "Owner access required" }
  }
  if (!orgId || !userId) {
    return { success: false, error: "Invalid session" }
  }

  const { weekStart, weekEnd } = getWeekBounds(weekStartDate)

  try {
    const now = new Date()

    // Find all completed, unapproved entries for this tech in this week
    const entriestoApprove = await withRls(token, (db) =>
      db
        .select({ id: timeEntries.id })
        .from(timeEntries)
        .where(
          and(
            eq(timeEntries.org_id, orgId),
            eq(timeEntries.tech_id, techId),
            eq(timeEntries.status, "complete"),
            gte(timeEntries.work_date, weekStart),
            lte(timeEntries.work_date, weekEnd),
            isNull(timeEntries.approved_at)
          )
        )
    )

    if (entriestoApprove.length === 0) {
      return { success: true, approvedCount: 0 }
    }

    const entryIds = entriestoApprove.map((e) => e.id)

    // Stamp approved_at and approved_by
    for (const entryId of entryIds) {
      await withRls(token, (db) =>
        db
          .update(timeEntries)
          .set({ approved_at: now, approved_by: userId, updated_at: now })
          .where(eq(timeEntries.id, entryId))
      )
    }

    // Push approved entries to QBO (fire-and-forget — errors are logged, not thrown)
    void pushPayPeriodToQbo(orgId, techId, weekStartDate).catch((err) => {
      console.error("[approveTimesheet] QBO push failed:", err)
    })

    revalidatePath("/team")

    return { success: true, approvedCount: entryIds.length }
  } catch (error) {
    console.error("[approveTimesheet] Error:", error)
    return { success: false, error: "Failed to approve timesheet" }
  }
}

// ─── getTimesheetSummary ───────────────────────────────────────────────────────

export interface TechPayPeriodSummary {
  techId: string
  techName: string
  payType: string | null
  payRate: string | null
  totalNetHours: number
  regularHours: number
  overtimeHours: number
  ptoHours: number
  /** Estimated gross pay — only calculated when pay_type='hourly' */
  estimatedGrossPay: number | null
  entryCount: number
  approvedCount: number
  syncedCount: number
}

export interface TimesheetSummaryResult {
  startDate: string
  endDate: string
  overtimeThresholdHours: number
  techs: TechPayPeriodSummary[]
  totalRegularHours: number
  totalOvertimeHours: number
  totalPtoHours: number
}

/**
 * Returns aggregated timesheet data for a date range (pay period).
 * Used for payroll export view. Owner / office only.
 *
 * When time tracking is enabled, uses real time_entry data.
 * Falls back to route_stop-based calculation when time tracking is disabled.
 */
export async function getTimesheetSummary(
  startDate: string,
  endDate: string
): Promise<{ success: boolean; data?: TimesheetSummaryResult; error?: string }> {
  const token = await getRlsToken()
  if (!token) return { success: false, error: "Not authenticated" }

  const userRole = token["user_role"] as string | undefined
  const orgId = token["org_id"] as string | undefined

  if (!orgId) return { success: false, error: "Invalid session" }
  if (userRole !== "owner" && userRole !== "office") {
    return { success: false, error: "Owner or office access required" }
  }

  try {
    // Fetch org settings for overtime threshold
    const settingsRows = await withRls(token, (db) =>
      db
        .select({
          overtime_threshold_hours: orgSettings.overtime_threshold_hours,
          time_tracking_enabled: orgSettings.time_tracking_enabled,
        })
        .from(orgSettings)
        .where(eq(orgSettings.org_id, orgId))
        .limit(1)
    )
    const overtimeThreshold = settingsRows[0]?.overtime_threshold_hours ?? 40

    // Fetch all completed entries in range, with profile data
    const entries = await withRls(token, (db) =>
      db
        .select({
          tech_id: timeEntries.tech_id,
          tech_name: profiles.full_name,
          pay_type: profiles.pay_type,
          pay_rate: profiles.pay_rate,
          total_minutes: timeEntries.total_minutes,
          break_minutes: timeEntries.break_minutes,
          approved_at: timeEntries.approved_at,
          qbo_time_activity_id: timeEntries.qbo_time_activity_id,
        })
        .from(timeEntries)
        .innerJoin(profiles, eq(profiles.id, timeEntries.tech_id))
        .where(
          and(
            eq(timeEntries.org_id, orgId),
            eq(timeEntries.status, "complete"),
            gte(timeEntries.work_date, startDate),
            lte(timeEntries.work_date, endDate)
          )
        )
    )

    // Fetch PTO for the range
    const ptoRows = await withRls(token, (db) =>
      db
        .select({
          tech_id: ptoRequests.tech_id,
          hours: ptoRequests.hours,
        })
        .from(ptoRequests)
        .where(
          and(
            eq(ptoRequests.org_id, orgId),
            eq(ptoRequests.status, "approved"),
            lte(ptoRequests.start_date, endDate),
            gte(ptoRequests.end_date, startDate)
          )
        )
    )

    // Group by tech
    const techMap = new Map<
      string,
      {
        name: string
        payType: string | null
        payRate: string | null
        netMinutes: number
        entries: typeof entries
        ptoHours: number
      }
    >()

    for (const e of entries) {
      const netMinutes = Math.max(
        0,
        (e.total_minutes ?? 0) - (e.break_minutes ?? 0)
      )
      const existing = techMap.get(e.tech_id)
      if (existing) {
        existing.netMinutes += netMinutes
        existing.entries.push(e)
      } else {
        techMap.set(e.tech_id, {
          name: e.tech_name,
          payType: e.pay_type,
          payRate: e.pay_rate,
          netMinutes,
          entries: [e],
          ptoHours: 0,
        })
      }
    }

    // Add PTO hours
    for (const pto of ptoRows) {
      const tech = techMap.get(pto.tech_id)
      if (tech) {
        tech.ptoHours += parseFloat(pto.hours)
      }
    }

    // Build summary rows
    const techSummaries: TechPayPeriodSummary[] = []
    let totalRegularHours = 0
    let totalOvertimeHours = 0
    let totalPtoHours = 0

    for (const [tId, data] of techMap) {
      const netHours = data.netMinutes / 60
      const otHours = Math.max(0, netHours - overtimeThreshold)
      const regHours = netHours - otHours

      let estimatedGrossPay: number | null = null
      if (data.payType === "hourly" && data.payRate) {
        const rate = parseFloat(data.payRate)
        if (!isNaN(rate)) {
          estimatedGrossPay =
            Math.round(
              (regHours * rate + otHours * rate * 1.5) * 100
            ) / 100
        }
      }

      const approvedCount = data.entries.filter((e) => e.approved_at !== null).length
      const syncedCount = data.entries.filter((e) => e.qbo_time_activity_id !== null).length

      totalRegularHours += regHours
      totalOvertimeHours += otHours
      totalPtoHours += data.ptoHours

      techSummaries.push({
        techId: tId,
        techName: data.name,
        payType: data.payType,
        payRate: data.payRate,
        totalNetHours: Math.round(netHours * 100) / 100,
        regularHours: Math.round(regHours * 100) / 100,
        overtimeHours: Math.round(otHours * 100) / 100,
        ptoHours: Math.round(data.ptoHours * 100) / 100,
        estimatedGrossPay,
        entryCount: data.entries.length,
        approvedCount,
        syncedCount,
      })
    }

    techSummaries.sort((a, b) => a.techName.localeCompare(b.techName))

    return {
      success: true,
      data: {
        startDate,
        endDate,
        overtimeThresholdHours: overtimeThreshold,
        techs: techSummaries,
        totalRegularHours: Math.round(totalRegularHours * 100) / 100,
        totalOvertimeHours: Math.round(totalOvertimeHours * 100) / 100,
        totalPtoHours: Math.round(totalPtoHours * 100) / 100,
      },
    }
  } catch (error) {
    console.error("[getTimesheetSummary] Error:", error)
    return { success: false, error: "Failed to load timesheet summary" }
  }
}
