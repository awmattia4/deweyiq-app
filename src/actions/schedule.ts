"use server"

import { revalidatePath } from "next/cache"
import { createClient } from "@/lib/supabase/server"
import { withRls } from "@/lib/db"
import type { SupabaseToken } from "@/lib/db"
import {
  scheduleRules,
  holidays,
  routeStops,
  customers,
  pools,
  profiles,
  workOrders,
} from "@/lib/db/schema"
import { and, eq, gt, gte, lte, inArray, isNull } from "drizzle-orm"
import { toLocalDateString } from "@/lib/date-utils"

// ─── Types ────────────────────────────────────────────────────────────────────

export type ScheduleFrequency = "weekly" | "biweekly" | "monthly" | "custom"

export interface ScheduleRule {
  id: string
  org_id: string
  customer_id: string
  pool_id: string | null
  tech_id: string | null
  frequency: ScheduleFrequency
  custom_interval_days: number | null
  anchor_date: string
  preferred_day_of_week: number | null
  active: boolean
  created_at: Date
  updated_at: Date
  // Joined fields
  customerName: string
  poolName: string | null
  techName: string | null
}

export interface Holiday {
  id: string
  org_id: string
  date: string
  name: string
  created_at: Date
}

// ─── Auth helper ──────────────────────────────────────────────────────────────

async function getRlsToken(): Promise<SupabaseToken | null> {
  const supabase = await createClient()
  const { data: claimsData } = await supabase.auth.getClaims()
  if (!claimsData?.claims) return null
  return claimsData.claims as SupabaseToken
}

// ─── Date generation algorithm ────────────────────────────────────────────────

/**
 * Compute all service dates for a schedule rule within [windowStart, windowEnd].
 *
 * Algorithm per RESEARCH.md:
 * - weekly: every 7 days from anchor
 * - biweekly: every 14 days from anchor
 * - monthly: same day-of-month each month (clamped to month-end for short months)
 * - custom: every custom_interval_days days from anchor
 *
 * The anchor date is treated as the canonical first service date. We advance
 * forward from the anchor in steps until we exceed windowEnd, collecting all
 * dates that fall within [windowStart, windowEnd].
 */
function generateDatesForRule(
  rule: {
    anchor_date: string
    frequency: string
    custom_interval_days: number | null
  },
  windowStart: Date,
  windowEnd: Date
): Date[] {
  const anchor = new Date(rule.anchor_date + "T00:00:00")
  const dates: Date[] = []

  if (rule.frequency === "monthly") {
    // Monthly: same day-of-month as anchor, each month from the anchor month forward
    const anchorDay = anchor.getDate()

    // Find the first monthly occurrence on or after windowStart
    let current = new Date(anchor)
    // Fast-forward to the first occurrence >= windowStart
    while (current < windowStart) {
      current = new Date(current.getFullYear(), current.getMonth() + 1, 1)
      // Clamp to month-end if anchor day exceeds days in month
      const daysInMonth = new Date(current.getFullYear(), current.getMonth() + 1, 0).getDate()
      current.setDate(Math.min(anchorDay, daysInMonth))
    }

    while (current <= windowEnd) {
      dates.push(new Date(current))
      // Advance by one month
      const nextMonth = new Date(current.getFullYear(), current.getMonth() + 1, 1)
      const daysInNextMonth = new Date(nextMonth.getFullYear(), nextMonth.getMonth() + 1, 0).getDate()
      current = new Date(nextMonth.getFullYear(), nextMonth.getMonth(), Math.min(anchorDay, daysInNextMonth))
    }

    return dates
  }

  // For interval-based frequencies (weekly, biweekly, custom)
  const intervalDays =
    rule.frequency === "weekly" ? 7
    : rule.frequency === "biweekly" ? 14
    : (rule.custom_interval_days ?? 7)

  // Fast-forward anchor to first occurrence on or after windowStart
  let current = new Date(anchor)
  if (current < windowStart) {
    const msPerDay = 86400000
    const daysDiff = Math.ceil((windowStart.getTime() - current.getTime()) / msPerDay)
    const steps = Math.floor(daysDiff / intervalDays)
    current = new Date(anchor.getTime() + steps * intervalDays * msPerDay)
    // Ensure we start on or after windowStart
    while (current < windowStart) {
      current = new Date(current.getTime() + intervalDays * msPerDay)
    }
  }

  while (current <= windowEnd) {
    dates.push(new Date(current))
    current = new Date(current.getTime() + intervalDays * 86400000)
  }

  return dates
}

// ─── Internal stop generation helper ─────────────────────────────────────────

/**
 * generateStopsForRule — internal helper (not exported as server action).
 *
 * Reads the schedule rule, computes dates for the next 28 days from today,
 * checks org holidays, and upserts route_stops rows.
 *
 * Upsert uses onConflictDoNothing on the (org_id, customer_id, pool_id, scheduled_date)
 * unique constraint for idempotency. New stops get sort_index=999 so office can
 * reorder them via the route builder.
 */
async function generateStopsForRule(
  token: SupabaseToken,
  ruleId: string
): Promise<void> {
  await withRls(token, async (db) => {
    const ruleRows = await db
      .select()
      .from(scheduleRules)
      .where(eq(scheduleRules.id, ruleId))
      .limit(1)

    if (ruleRows.length === 0 || !ruleRows[0].active) return

    const rule = ruleRows[0]
    const orgId = rule.org_id

    const today = new Date()
    today.setHours(0, 0, 0, 0)
    const windowEnd = new Date(today)
    windowEnd.setDate(today.getDate() + 28)

    const todayStr = toLocalDateString(today)
    const windowEndStr = toLocalDateString(windowEnd)

    // Fetch org holidays within the window
    const orgHolidays = await db
      .select({ date: holidays.date })
      .from(holidays)
      .where(
        and(
          eq(holidays.org_id, orgId),
          gte(holidays.date, todayStr),
          lte(holidays.date, windowEndStr)
        )
      )

    const holidaySet = new Set(orgHolidays.map((h) => h.date))

    // Generate dates for this rule
    const dates = generateDatesForRule(rule, today, windowEnd)

    // Upsert each date that is not a holiday
    for (const date of dates) {
      const dateStr = toLocalDateString(date)
      if (holidaySet.has(dateStr)) continue

      // Find max sort_index for this tech+date to append after existing stops
      const existing = rule.tech_id
        ? await db
            .select({ sort_index: routeStops.sort_index })
            .from(routeStops)
            .where(
              and(
                eq(routeStops.org_id, orgId),
                eq(routeStops.tech_id, rule.tech_id),
                eq(routeStops.scheduled_date, dateStr)
              )
            )
        : []
      const maxIdx = existing.length > 0
        ? Math.max(...existing.map((s) => s.sort_index))
        : 0

      await db
        .insert(routeStops)
        .values({
          org_id: orgId,
          customer_id: rule.customer_id,
          pool_id: rule.pool_id,
          tech_id: rule.tech_id,
          schedule_rule_id: rule.id,
          scheduled_date: dateStr,
          sort_index: maxIdx + 1,
          status: "scheduled",
        })
        .onConflictDoNothing()
    }
  })
}

// ─── Schedule rule server actions ─────────────────────────────────────────────

/**
 * getScheduleRules — fetch all active schedule_rules for the org.
 *
 * Optionally filtered by tech. JOINs with customers and profiles (tech)
 * to include display names. Owner/office only.
 */
export async function getScheduleRules(techId?: string): Promise<ScheduleRule[]> {
  const token = await getRlsToken()
  if (!token) return []

  const userRole = token["user_role"] as string | undefined
  const orgId = token["org_id"] as string | undefined
  if (!orgId) return []

  // Owner and office only — techs shouldn't see the scheduling management UI
  if (userRole === "tech" || userRole === "customer") return []

  try {
    return await withRls(token, async (db) => {
      // Fetch schedule rules
      const query = db
        .select()
        .from(scheduleRules)
        .where(
          and(
            eq(scheduleRules.org_id, orgId),
            eq(scheduleRules.active, true),
            ...(techId ? [eq(scheduleRules.tech_id, techId)] : [])
          )
        )

      const rules = await query

      if (rules.length === 0) return []

      // Gather unique customer_ids, pool_ids, tech_ids for batch fetching
      const customerIds = [...new Set(rules.map((r) => r.customer_id))]
      const poolIds = [...new Set(rules.flatMap((r) => (r.pool_id ? [r.pool_id] : [])))]
      const techIds = [...new Set(rules.flatMap((r) => (r.tech_id ? [r.tech_id] : [])))]

      // Batch fetch customers
      const customerRows =
        customerIds.length > 0
          ? await db
              .select({ id: customers.id, full_name: customers.full_name })
              .from(customers)
              .where(inArray(customers.id, customerIds))
          : []

      // Batch fetch pools
      const poolRows =
        poolIds.length > 0
          ? await db
              .select({ id: pools.id, name: pools.name })
              .from(pools)
              .where(inArray(pools.id, poolIds))
          : []

      // Batch fetch tech profiles
      const techRows =
        techIds.length > 0
          ? await db
              .select({ id: profiles.id, full_name: profiles.full_name })
              .from(profiles)
              .where(inArray(profiles.id, techIds))
          : []

      const customerMap = new Map(customerRows.map((c) => [c.id, c.full_name]))
      const poolMap = new Map(poolRows.map((p) => [p.id, p.name]))
      const techMap = new Map(techRows.map((t) => [t.id, t.full_name]))

      return rules.map(
        (rule): ScheduleRule => ({
          ...rule,
          frequency: rule.frequency as ScheduleFrequency,
          customerName: customerMap.get(rule.customer_id) ?? "Unknown Customer",
          poolName: rule.pool_id ? (poolMap.get(rule.pool_id) ?? null) : null,
          techName: rule.tech_id ? (techMap.get(rule.tech_id) ?? null) : null,
        })
      )
    })
  } catch (error) {
    console.error("[getScheduleRules] Error:", error)
    return []
  }
}

/**
 * createScheduleRule — INSERT a new schedule rule and immediately generate stops.
 *
 * Owner/office only. After creating the rule, generates the first 4 weeks of stops.
 */
export async function createScheduleRule(data: {
  customerId: string
  poolId?: string
  techId?: string
  frequency: ScheduleFrequency
  customIntervalDays?: number
  anchorDate: string
  preferredDayOfWeek?: number
}): Promise<{ success: boolean; ruleId?: string; error?: string }> {
  const token = await getRlsToken()
  if (!token) return { success: false, error: "Not authenticated" }

  const userRole = token["user_role"] as string | undefined
  const orgId = token["org_id"] as string | undefined

  if (!orgId) return { success: false, error: "Invalid token" }
  if (userRole !== "owner" && userRole !== "office") {
    return { success: false, error: "Insufficient permissions" }
  }

  // Validate custom frequency requires interval
  if (data.frequency === "custom" && !data.customIntervalDays) {
    return { success: false, error: "Custom frequency requires interval days" }
  }

  try {
    let ruleId: string

    await withRls(token, async (db) => {
      const inserted = await db
        .insert(scheduleRules)
        .values({
          org_id: orgId,
          customer_id: data.customerId,
          pool_id: data.poolId ?? null,
          tech_id: data.techId ?? null,
          frequency: data.frequency,
          custom_interval_days: data.customIntervalDays ?? null,
          anchor_date: data.anchorDate,
          preferred_day_of_week: data.preferredDayOfWeek ?? null,
          active: true,
        })
        .returning({ id: scheduleRules.id })

      ruleId = inserted[0].id
    })

    // Generate initial 4 weeks of stops for the new rule
    await generateStopsForRule(token, ruleId!)

    revalidatePath("/schedule")
    return { success: true, ruleId: ruleId! }
  } catch (error) {
    console.error("[createScheduleRule] Error:", error)
    return { success: false, error: "Failed to create schedule rule" }
  }
}

/**
 * updateScheduleRule — UPDATE an existing schedule rule.
 *
 * Owner/office only. If frequency changed, delete all future stops for this
 * rule and regenerate from today (destructive regeneration — per plan decision).
 */
export async function updateScheduleRule(
  ruleId: string,
  data: Partial<{
    poolId: string | null
    techId: string | null
    frequency: ScheduleFrequency
    customIntervalDays: number | null
    anchorDate: string
    preferredDayOfWeek: number | null
    active: boolean
  }>
): Promise<{ success: boolean; error?: string }> {
  const token = await getRlsToken()
  if (!token) return { success: false, error: "Not authenticated" }

  const userRole = token["user_role"] as string | undefined
  const orgId = token["org_id"] as string | undefined

  if (!orgId) return { success: false, error: "Invalid token" }
  if (userRole !== "owner" && userRole !== "office") {
    return { success: false, error: "Insufficient permissions" }
  }

  try {
    // Fetch current rule to detect frequency change
    let currentFrequency: string | null = null
    await withRls(token, async (db) => {
      const current = await db
        .select({ frequency: scheduleRules.frequency })
        .from(scheduleRules)
        .where(and(eq(scheduleRules.id, ruleId), eq(scheduleRules.org_id, orgId)))
        .limit(1)
      currentFrequency = current[0]?.frequency ?? null
    })

    const frequencyChanged = data.frequency && data.frequency !== currentFrequency

    await withRls(token, async (db) => {
      const updateData: Record<string, unknown> = { updated_at: new Date() }
      if (data.frequency !== undefined) updateData.frequency = data.frequency
      if (data.customIntervalDays !== undefined) updateData.custom_interval_days = data.customIntervalDays
      if (data.anchorDate !== undefined) updateData.anchor_date = data.anchorDate
      if (data.preferredDayOfWeek !== undefined) updateData.preferred_day_of_week = data.preferredDayOfWeek
      if (data.active !== undefined) updateData.active = data.active
      if ("poolId" in data) updateData.pool_id = data.poolId
      if ("techId" in data) updateData.tech_id = data.techId

      await db
        .update(scheduleRules)
        .set(updateData as Parameters<ReturnType<typeof db.update>["set"]>[0])
        .where(and(eq(scheduleRules.id, ruleId), eq(scheduleRules.org_id, orgId)))

      // Destructive regeneration on frequency change: delete future stops, regenerate
      if (frequencyChanged) {
        const today = toLocalDateString()
        await db
          .delete(routeStops)
          .where(
            and(
              eq(routeStops.schedule_rule_id, ruleId),
              gt(routeStops.scheduled_date, today)
            )
          )
      }
    })

    // Regenerate stops if frequency changed
    if (frequencyChanged) {
      await generateStopsForRule(token, ruleId)
    }

    revalidatePath("/schedule")
    return { success: true }
  } catch (error) {
    console.error("[updateScheduleRule] Error:", error)
    return { success: false, error: "Failed to update schedule rule" }
  }
}

/**
 * deleteScheduleRule — soft delete (set active=false) and remove future stops.
 *
 * Owner/office only. Preserves historical stops (past dates) for reporting.
 */
export async function deleteScheduleRule(
  ruleId: string
): Promise<{ success: boolean; error?: string }> {
  const token = await getRlsToken()
  if (!token) return { success: false, error: "Not authenticated" }

  const userRole = token["user_role"] as string | undefined
  const orgId = token["org_id"] as string | undefined

  if (!orgId) return { success: false, error: "Invalid token" }
  if (userRole !== "owner" && userRole !== "office") {
    return { success: false, error: "Insufficient permissions" }
  }

  try {
    const today = toLocalDateString()

    await withRls(token, async (db) => {
      // Soft delete the rule
      await db
        .update(scheduleRules)
        .set({ active: false, updated_at: new Date() })
        .where(and(eq(scheduleRules.id, ruleId), eq(scheduleRules.org_id, orgId)))

      // Delete future route_stops for this rule
      await db
        .delete(routeStops)
        .where(
          and(
            eq(routeStops.schedule_rule_id, ruleId),
            gt(routeStops.scheduled_date, today)
          )
        )
    })

    revalidatePath("/schedule")
    return { success: true }
  } catch (error) {
    console.error("[deleteScheduleRule] Error:", error)
    return { success: false, error: "Failed to delete schedule rule" }
  }
}

/**
 * generateAllScheduleStops — generate stops for all active schedule rules for the org.
 *
 * Called by owner/office to manually trigger generation. Also used as the
 * target for the Edge Function (which calls this via API or directly).
 * Owner/office only.
 */
export async function generateAllScheduleStops(): Promise<{
  success: boolean
  generated: number
  error?: string
}> {
  const token = await getRlsToken()
  if (!token) return { success: false, generated: 0, error: "Not authenticated" }

  const userRole = token["user_role"] as string | undefined
  const orgId = token["org_id"] as string | undefined

  if (!orgId) return { success: false, generated: 0, error: "Invalid token" }
  if (userRole !== "owner" && userRole !== "office") {
    return { success: false, generated: 0, error: "Insufficient permissions" }
  }

  try {
    const activeRules = await withRls(token, async (db) => {
      return db
        .select({ id: scheduleRules.id })
        .from(scheduleRules)
        .where(and(eq(scheduleRules.org_id, orgId), eq(scheduleRules.active, true)))
    })

    for (const rule of activeRules) {
      await generateStopsForRule(token, rule.id)
    }

    revalidatePath("/schedule")
    return { success: true, generated: activeRules.length }
  } catch (error) {
    console.error("[generateAllScheduleStops] Error:", error)
    return { success: false, generated: 0, error: "Failed to generate stops" }
  }
}

// ─── Holiday server actions ────────────────────────────────────────────────────

/**
 * getHolidays — fetch holidays for the org, optionally filtered by year.
 */
export async function getHolidays(year?: number): Promise<Holiday[]> {
  const token = await getRlsToken()
  if (!token) return []

  const orgId = token["org_id"] as string | undefined
  if (!orgId) return []

  try {
    return await withRls(token, async (db) => {
      const allHolidays = await db
        .select()
        .from(holidays)
        .where(eq(holidays.org_id, orgId))

      if (!year) return allHolidays

      return allHolidays.filter((h) => h.date.startsWith(String(year)))
    })
  } catch (error) {
    console.error("[getHolidays] Error:", error)
    return []
  }
}

/**
 * createHoliday — add a holiday to the org calendar.
 *
 * Owner/office only. After creating, marks any existing route_stops on this
 * date as 'holiday' so dispatchers can see the conflict.
 */
export async function createHoliday(data: {
  date: string
  name: string
}): Promise<{ success: boolean; error?: string }> {
  const token = await getRlsToken()
  if (!token) return { success: false, error: "Not authenticated" }

  const userRole = token["user_role"] as string | undefined
  const orgId = token["org_id"] as string | undefined

  if (!orgId) return { success: false, error: "Invalid token" }
  if (userRole !== "owner" && userRole !== "office") {
    return { success: false, error: "Insufficient permissions" }
  }

  // Validate date format YYYY-MM-DD
  if (!/^\d{4}-\d{2}-\d{2}$/.test(data.date)) {
    return { success: false, error: "Invalid date format. Use YYYY-MM-DD." }
  }

  try {
    await withRls(token, async (db) => {
      // Insert holiday (unique constraint prevents duplicates)
      await db
        .insert(holidays)
        .values({
          org_id: orgId,
          date: data.date,
          name: data.name,
        })
        .onConflictDoNothing()

      // Mark existing route_stops on this date as 'holiday'
      await db
        .update(routeStops)
        .set({ status: "holiday", updated_at: new Date() })
        .where(
          and(
            eq(routeStops.org_id, orgId),
            eq(routeStops.scheduled_date, data.date),
            eq(routeStops.status, "scheduled")
          )
        )
    })

    revalidatePath("/schedule")
    return { success: true }
  } catch (error) {
    console.error("[createHoliday] Error:", error)
    return { success: false, error: "Failed to create holiday" }
  }
}

/**
 * deleteHoliday — remove a holiday from the org calendar.
 *
 * Owner/office only. After deleting, resets any route_stops on this date
 * from 'holiday' status back to 'scheduled'.
 */
export async function deleteHoliday(
  holidayId: string
): Promise<{ success: boolean; error?: string }> {
  const token = await getRlsToken()
  if (!token) return { success: false, error: "Not authenticated" }

  const userRole = token["user_role"] as string | undefined
  const orgId = token["org_id"] as string | undefined

  if (!orgId) return { success: false, error: "Invalid token" }
  if (userRole !== "owner" && userRole !== "office") {
    return { success: false, error: "Insufficient permissions" }
  }

  try {
    await withRls(token, async (db) => {
      // Fetch the holiday date before deleting (needed to reset route_stops)
      const holidayRows = await db
        .select({ date: holidays.date })
        .from(holidays)
        .where(and(eq(holidays.id, holidayId), eq(holidays.org_id, orgId)))
        .limit(1)

      if (holidayRows.length === 0) return

      const holidayDate = holidayRows[0].date

      // Delete the holiday
      await db
        .delete(holidays)
        .where(and(eq(holidays.id, holidayId), eq(holidays.org_id, orgId)))

      // Reset route_stops on this date from 'holiday' back to 'scheduled'
      await db
        .update(routeStops)
        .set({ status: "scheduled", updated_at: new Date() })
        .where(
          and(
            eq(routeStops.org_id, orgId),
            eq(routeStops.scheduled_date, holidayDate),
            eq(routeStops.status, "holiday")
          )
        )
    })

    revalidatePath("/schedule")
    return { success: true }
  } catch (error) {
    console.error("[deleteHoliday] Error:", error)
    return { success: false, error: "Failed to delete holiday" }
  }
}

// ─── Route stop CRUD (used by route builder and migration) ────────────────────

/**
 * getStopsForDay — fetch route_stops for a tech+date with customer/pool names joined.
 *
 * Used by the route builder UI in subsequent plans.
 */
export async function getStopsForDay(
  techId: string,
  date: string
): Promise<
  Array<{
    id: string
    techId: string | null
    customerId: string
    poolId: string | null
    scheduleRuleId: string | null
    scheduledDate: string
    sortIndex: number
    positionLocked: boolean
    windowStart: string | null
    windowEnd: string | null
    status: string
    customerName: string
    poolName: string | null
    /** Customer address for display in stop list */
    address: string | null
    /** Customer geocoded latitude — for map markers */
    lat: number | null
    /** Customer geocoded longitude — for map markers */
    lng: number | null
    /** Work order linked to this stop (null for regular service stops) */
    workOrderId: string | null
    /** Work order title for display */
    workOrderTitle: string | null
    /** Customer overdue balance for overdue flag display */
    overdueBalance: number | null
  }>
> {
  const token = await getRlsToken()
  if (!token) return []

  const orgId = token["org_id"] as string | undefined
  if (!orgId) return []

  try {
    return await withRls(token, async (db) => {
      const stops = await db
        .select()
        .from(routeStops)
        .where(
          and(
            eq(routeStops.org_id, orgId),
            eq(routeStops.tech_id, techId),
            eq(routeStops.scheduled_date, date)
          )
        )

      if (stops.length === 0) return []

      // Batch fetch customers and pools
      const customerIds = [...new Set(stops.map((s) => s.customer_id))]
      const poolIds = [...new Set(stops.flatMap((s) => (s.pool_id ? [s.pool_id] : [])))]

      const [customerRows, poolRows] = await Promise.all([
        customerIds.length > 0
          ? db
              .select({
                id: customers.id,
                full_name: customers.full_name,
                address: customers.address,
                lat: customers.lat,
                lng: customers.lng,
                overdue_balance: customers.overdue_balance,
              })
              .from(customers)
              .where(inArray(customers.id, customerIds))
          : Promise.resolve([]),
        poolIds.length > 0
          ? db
              .select({ id: pools.id, name: pools.name })
              .from(pools)
              .where(inArray(pools.id, poolIds))
          : Promise.resolve([]),
      ])

      const customerMap = new Map(customerRows.map((c) => [c.id, c]))
      const poolMap = new Map(poolRows.map((p) => [p.id, p.name]))

      // Batch fetch work order titles for WO stops
      const woIds = [...new Set(stops.flatMap((s) => (s.work_order_id ? [s.work_order_id] : [])))]
      const woMap = new Map<string, string>()
      if (woIds.length > 0) {
        const woRows = await db
          .select({ id: workOrders.id, title: workOrders.title })
          .from(workOrders)
          .where(inArray(workOrders.id, woIds))
        for (const wo of woRows) woMap.set(wo.id, wo.title)
      }

      return stops
        .sort((a, b) => a.sort_index - b.sort_index)
        .map((stop, idx) => {
          const customer = customerMap.get(stop.customer_id)
          return {
            id: stop.id,
            techId: stop.tech_id,
            customerId: stop.customer_id,
            poolId: stop.pool_id,
            scheduleRuleId: stop.schedule_rule_id,
            scheduledDate: stop.scheduled_date,
            sortIndex: idx + 1, // Position-based, not raw sort_index
            positionLocked: stop.position_locked,
            windowStart: stop.window_start,
            windowEnd: stop.window_end,
            status: stop.status,
            customerName: customer?.full_name ?? "Unknown Customer",
            poolName: stop.pool_id ? (poolMap.get(stop.pool_id) ?? null) : null,
            address: customer?.address ?? null,
            lat: customer?.lat ?? null,
            lng: customer?.lng ?? null,
            workOrderId: stop.work_order_id ?? null,
            workOrderTitle: stop.work_order_id ? (woMap.get(stop.work_order_id) ?? null) : null,
            overdueBalance: customer?.overdue_balance ? parseFloat(customer.overdue_balance) : null,
          }
        })
    })
  } catch (error) {
    console.error("[getStopsForDay] Error:", error)
    return []
  }
}

/**
 * updateStopOrder — update sort_index on multiple route_stops.
 *
 * Owner/office only.
 */
export async function updateStopOrder(
  stops: Array<{ id: string; sortIndex: number }>
): Promise<{ success: boolean; error?: string }> {
  const token = await getRlsToken()
  if (!token) return { success: false, error: "Not authenticated" }

  const userRole = token["user_role"] as string | undefined
  const orgId = token["org_id"] as string | undefined

  if (!orgId) return { success: false, error: "Invalid token" }
  if (userRole !== "owner" && userRole !== "office") {
    return { success: false, error: "Insufficient permissions" }
  }

  try {
    await withRls(token, async (db) => {
      await Promise.all(
        stops.map((stop) =>
          db
            .update(routeStops)
            .set({ sort_index: stop.sortIndex, updated_at: new Date() })
            .where(and(eq(routeStops.id, stop.id), eq(routeStops.org_id, orgId)))
        )
      )
    })

    return { success: true }
  } catch (error) {
    console.error("[updateStopOrder] Error:", error)
    return { success: false, error: "Failed to update stop order" }
  }
}

/**
 * assignStopToRoute — create a new route_stop for a customer/pool on a specific date.
 *
 * Owner/office only. Used by the route builder to manually add stops.
 */
export async function assignStopToRoute(
  customerId: string,
  poolId: string,
  techId: string,
  date: string,
  sortIndex: number
): Promise<{ success: boolean; stopId?: string; error?: string }> {
  const token = await getRlsToken()
  if (!token) return { success: false, error: "Not authenticated" }

  const userRole = token["user_role"] as string | undefined
  const orgId = token["org_id"] as string | undefined

  if (!orgId) return { success: false, error: "Invalid token" }
  if (userRole !== "owner" && userRole !== "office") {
    return { success: false, error: "Insufficient permissions" }
  }

  try {
    const result = await withRls(token, async (db) => {
      return db
        .insert(routeStops)
        .values({
          org_id: orgId,
          customer_id: customerId,
          pool_id: poolId,
          tech_id: techId,
          scheduled_date: date,
          sort_index: sortIndex,
          status: "scheduled",
        })
        .onConflictDoNothing()
        .returning({ id: routeStops.id })
    })

    return { success: true, stopId: result[0]?.id }
  } catch (error) {
    console.error("[assignStopToRoute] Error:", error)
    return { success: false, error: "Failed to assign stop" }
  }
}

/**
 * removeStopFromRoute — delete a route_stop row.
 *
 * Owner/office only.
 */
export async function removeStopFromRoute(
  routeStopId: string
): Promise<{ success: boolean; error?: string }> {
  const token = await getRlsToken()
  if (!token) return { success: false, error: "Not authenticated" }

  const userRole = token["user_role"] as string | undefined
  const orgId = token["org_id"] as string | undefined

  if (!orgId) return { success: false, error: "Invalid token" }
  if (userRole !== "owner" && userRole !== "office") {
    return { success: false, error: "Insufficient permissions" }
  }

  try {
    await withRls(token, async (db) => {
      // Fetch the stop to check for linked WO
      const [stop] = await db
        .select({ id: routeStops.id, work_order_id: routeStops.work_order_id })
        .from(routeStops)
        .where(and(eq(routeStops.id, routeStopId), eq(routeStops.org_id, orgId)))
        .limit(1)

      if (!stop) return

      // If the stop has a linked WO, revert it back to approved
      if (stop.work_order_id) {
        await db
          .update(workOrders)
          .set({
            status: "approved",
            assigned_tech_id: null,
            target_date: null,
            updated_at: new Date(),
          })
          .where(eq(workOrders.id, stop.work_order_id))
      }

      await db
        .delete(routeStops)
        .where(and(eq(routeStops.id, routeStopId), eq(routeStops.org_id, orgId)))
    })

    return { success: true }
  } catch (error) {
    console.error("[removeStopFromRoute] Error:", error)
    return { success: false, error: "Failed to remove stop" }
  }
}

/**
 * toggleStopLock — update position_locked on a route_stop.
 *
 * Owner/office only. Locked stops are excluded from optimizer.
 */
export async function toggleStopLock(
  routeStopId: string,
  locked: boolean
): Promise<{ success: boolean; error?: string }> {
  const token = await getRlsToken()
  if (!token) return { success: false, error: "Not authenticated" }

  const userRole = token["user_role"] as string | undefined
  const orgId = token["org_id"] as string | undefined

  if (!orgId) return { success: false, error: "Invalid token" }
  if (userRole !== "owner" && userRole !== "office") {
    return { success: false, error: "Insufficient permissions" }
  }

  try {
    await withRls(token, async (db) => {
      await db
        .update(routeStops)
        .set({ position_locked: locked, updated_at: new Date() })
        .where(and(eq(routeStops.id, routeStopId), eq(routeStops.org_id, orgId)))
    })

    return { success: true }
  } catch (error) {
    console.error("[toggleStopLock] Error:", error)
    return { success: false, error: "Failed to update stop lock" }
  }
}

// ─── Types for unassigned panel ───────────────────────────────────────────────

export interface UnassignedCustomer {
  id: string
  name: string
  address: string | null
  poolCount: number
  pools: Array<{ id: string; name: string }>
}

/**
 * getUnassignedCustomers — fetch customers without a route_stop for tech+date.
 *
 * Uses LEFT JOIN approach per RLS pitfall (no correlated subqueries on RLS tables).
 * Fetches all org customers, fetches assigned customer_ids for tech+date, filters in JS.
 * Returns customers with their pool count and pool list.
 * Owner/office only.
 */
export async function getUnassignedCustomers(
  techId: string,
  date: string
): Promise<UnassignedCustomer[]> {
  const token = await getRlsToken()
  if (!token) return []

  const userRole = token["user_role"] as string | undefined
  const orgId = token["org_id"] as string | undefined

  if (!orgId) return []
  if (userRole !== "owner" && userRole !== "office") return []

  try {
    return await withRls(token, async (db) => {
      // Fetch all active org customers
      const allCustomers = await db
        .select({ id: customers.id, full_name: customers.full_name, address: customers.address })
        .from(customers)
        .where(and(eq(customers.org_id, orgId), eq(customers.status, "active")))

      if (allCustomers.length === 0) return []

      // Fetch assigned stops for this tech+date — track both customer_id AND pool_id
      // so we can identify which specific pools are already assigned
      const assignedStops = await db
        .select({ customer_id: routeStops.customer_id, pool_id: routeStops.pool_id })
        .from(routeStops)
        .where(
          and(
            eq(routeStops.org_id, orgId),
            eq(routeStops.tech_id, techId),
            eq(routeStops.scheduled_date, date)
          )
        )

      // Build set of assigned customer:pool pairs
      const assignedPairs = new Set(
        assignedStops.map((s) => `${s.customer_id}:${s.pool_id ?? ""}`)
      )
      // Also track customers that have a null-pool stop assigned
      const assignedNullPoolCustomers = new Set(
        assignedStops.filter((s) => !s.pool_id).map((s) => s.customer_id)
      )

      const customerIds = allCustomers.map((c) => c.id)

      // Fetch ALL pools for ALL customers (we need to check per-pool assignment)
      const allPools = await db
        .select({ id: pools.id, name: pools.name, customer_id: pools.customer_id })
        .from(pools)
        .where(and(eq(pools.org_id, orgId), inArray(pools.customer_id, customerIds)))

      // Group pools by customer_id, filtering out already-assigned ones
      const poolsByCustomer = new Map<string, Array<{ id: string; name: string }>>()
      const totalPoolsByCustomer = new Map<string, number>()
      for (const pool of allPools) {
        // Track total pool count
        totalPoolsByCustomer.set(pool.customer_id, (totalPoolsByCustomer.get(pool.customer_id) ?? 0) + 1)

        // Skip pools that already have a stop assigned
        if (assignedPairs.has(`${pool.customer_id}:${pool.id}`)) continue

        const existing = poolsByCustomer.get(pool.customer_id) ?? []
        existing.push({ id: pool.id, name: pool.name })
        poolsByCustomer.set(pool.customer_id, existing)
      }

      // A customer is "unassigned" if they have at least one unassigned pool,
      // OR if they have no pools at all and no null-pool stop assigned
      return allCustomers
        .filter((c) => {
          const unassignedPools = poolsByCustomer.get(c.id)
          const totalPools = totalPoolsByCustomer.get(c.id) ?? 0
          if (totalPools === 0) {
            // No pools — show if no null-pool stop assigned
            return !assignedNullPoolCustomers.has(c.id)
          }
          // Has pools — show if any pool is unassigned
          return unassignedPools && unassignedPools.length > 0
        })
        .map((c) => ({
          id: c.id,
          name: c.full_name,
          address: c.address,
          pools: poolsByCustomer.get(c.id) ?? [],
          poolCount: totalPoolsByCustomer.get(c.id) ?? 0,
        }))
    })
  } catch (error) {
    console.error("[getUnassignedCustomers] Error:", error)
    return []
  }
}

/**
 * bulkAssignStops — create route_stop rows for multiple customer/pool pairs.
 *
 * Assigns sort_index starting after the last existing stop's sort_index.
 * Idempotent via onConflictDoNothing.
 * Owner/office only.
 */
export async function bulkAssignStops(
  customerPoolPairs: Array<{ customerId: string; poolId: string }>,
  techId: string,
  date: string
): Promise<{ success: boolean; count: number; error?: string }> {
  const token = await getRlsToken()
  if (!token) return { success: false, count: 0, error: "Not authenticated" }

  const userRole = token["user_role"] as string | undefined
  const orgId = token["org_id"] as string | undefined

  if (!orgId) return { success: false, count: 0, error: "Invalid token" }
  if (userRole !== "owner" && userRole !== "office") {
    return { success: false, count: 0, error: "Insufficient permissions" }
  }

  if (customerPoolPairs.length === 0) return { success: true, count: 0 }

  try {
    let insertedCount = 0

    await withRls(token, async (db) => {
      // Find the current max sort_index for tech+date
      const existingStops = await db
        .select({ sort_index: routeStops.sort_index })
        .from(routeStops)
        .where(
          and(
            eq(routeStops.org_id, orgId),
            eq(routeStops.tech_id, techId),
            eq(routeStops.scheduled_date, date)
          )
        )

      const maxSortIndex = existingStops.length > 0
        ? Math.max(...existingStops.map((s) => s.sort_index))
        : 0

      // Insert each pair, incrementing sort_index
      for (let i = 0; i < customerPoolPairs.length; i++) {
        const pair = customerPoolPairs[i]
        const result = await db
          .insert(routeStops)
          .values({
            org_id: orgId,
            customer_id: pair.customerId,
            pool_id: pair.poolId || null,
            tech_id: techId,
            scheduled_date: date,
            sort_index: maxSortIndex + i + 1,
            status: "scheduled",
          })
          .onConflictDoNothing()
          .returning({ id: routeStops.id })

        if (result.length > 0) insertedCount++
      }
    })

    revalidatePath("/schedule")
    return { success: true, count: insertedCount }
  } catch (error) {
    console.error("[bulkAssignStops] Error:", error)
    return { success: false, count: 0, error: "Failed to assign stops" }
  }
}

/**
 * copyRoute — copy all route_stops from one tech+date to another.
 *
 * Copies sort_index, position_locked, window_start, window_end.
 * Uses onConflictDoNothing to skip already-assigned customers.
 * Owner/office only.
 */
export async function copyRoute(
  sourceTechId: string,
  sourceDate: string,
  targetTechId: string,
  targetDate: string
): Promise<{ success: boolean; count: number; error?: string }> {
  const token = await getRlsToken()
  if (!token) return { success: false, count: 0, error: "Not authenticated" }

  const userRole = token["user_role"] as string | undefined
  const orgId = token["org_id"] as string | undefined

  if (!orgId) return { success: false, count: 0, error: "Invalid token" }
  if (userRole !== "owner" && userRole !== "office") {
    return { success: false, count: 0, error: "Insufficient permissions" }
  }

  try {
    let copiedCount = 0

    await withRls(token, async (db) => {
      // Fetch all stops for source tech+date
      const sourceStops = await db
        .select()
        .from(routeStops)
        .where(
          and(
            eq(routeStops.org_id, orgId),
            eq(routeStops.tech_id, sourceTechId),
            eq(routeStops.scheduled_date, sourceDate)
          )
        )

      if (sourceStops.length === 0) return

      // Insert stops for target tech+date (skip duplicates)
      for (const stop of sourceStops) {
        const result = await db
          .insert(routeStops)
          .values({
            org_id: orgId,
            customer_id: stop.customer_id,
            pool_id: stop.pool_id,
            tech_id: targetTechId,
            scheduled_date: targetDate,
            sort_index: stop.sort_index,
            position_locked: stop.position_locked,
            window_start: stop.window_start,
            window_end: stop.window_end,
            status: "scheduled",
          })
          .onConflictDoNothing()
          .returning({ id: routeStops.id })

        if (result.length > 0) copiedCount++
      }
    })

    revalidatePath("/schedule")
    return { success: true, count: copiedCount }
  } catch (error) {
    console.error("[copyRoute] Error:", error)
    return { success: false, count: 0, error: "Failed to copy route" }
  }
}

/**
 * migrateRouteDaysToRouteStops — one-time migration from route_days JSONB to route_stops.
 *
 * Owner/office only. Reads all route_days for the org and creates route_stops rows.
 * Idempotent — uses onConflictDoNothing on the unique constraint.
 */
export async function migrateRouteDaysToRouteStops(): Promise<{
  success: boolean
  migrated: number
  error?: string
}> {
  const token = await getRlsToken()
  if (!token) return { success: false, migrated: 0, error: "Not authenticated" }

  const userRole = token["user_role"] as string | undefined
  const orgId = token["org_id"] as string | undefined

  if (!orgId) return { success: false, migrated: 0, error: "Invalid token" }
  if (userRole !== "owner" && userRole !== "office") {
    return { success: false, migrated: 0, error: "Insufficient permissions" }
  }

  const { routeDays } = await import("@/lib/db/schema/route-days")

  try {
    let migratedCount = 0

    await withRls(token, async (db) => {
      const routeDayRows = await db
        .select()
        .from(routeDays)
        .where(eq(routeDays.org_id, orgId))

      for (const routeDay of routeDayRows) {
        const stopOrder = routeDay.stop_order
        if (!stopOrder || stopOrder.length === 0) continue

        for (const stop of stopOrder) {
          const result = await db
            .insert(routeStops)
            .values({
              org_id: orgId,
              tech_id: routeDay.tech_id,
              customer_id: stop.customer_id,
              pool_id: stop.pool_id,
              scheduled_date: routeDay.date,
              sort_index: stop.sort_index,
              status: "scheduled",
            })
            .onConflictDoNothing()
            .returning({ id: routeStops.id })

          if (result.length > 0) migratedCount++
        }
      }
    })

    return { success: true, migrated: migratedCount }
  } catch (error) {
    console.error("[migrateRouteDaysToRouteStops] Error:", error)
    return { success: false, migrated: 0, error: "Migration failed" }
  }
}

// ─── Stop management actions (skip, move, reassign) ───────────────────────────

/**
 * skipStop — mark a route_stop as "skipped" for this occurrence only.
 *
 * Owner/office only. The recurring rule stays intact — the next generation
 * cycle will create a new stop for the next scheduled date.
 */
export async function skipStop(
  routeStopId: string
): Promise<{ success: boolean; error?: string }> {
  const token = await getRlsToken()
  if (!token) return { success: false, error: "Not authenticated" }

  const userRole = token["user_role"] as string | undefined
  const orgId = token["org_id"] as string | undefined

  if (!orgId) return { success: false, error: "Invalid token" }
  if (userRole !== "owner" && userRole !== "office") {
    return { success: false, error: "Insufficient permissions" }
  }

  try {
    await withRls(token, async (db) => {
      await db
        .update(routeStops)
        .set({ status: "skipped", updated_at: new Date() })
        .where(and(eq(routeStops.id, routeStopId), eq(routeStops.org_id, orgId)))
    })

    return { success: true }
  } catch (error) {
    console.error("[skipStop] Error:", error)
    return { success: false, error: "Failed to skip stop" }
  }
}

/**
 * unskipStop — revert a skipped stop back to "scheduled".
 *
 * Owner/office only.
 */
export async function unskipStop(
  routeStopId: string
): Promise<{ success: boolean; error?: string }> {
  const token = await getRlsToken()
  if (!token) return { success: false, error: "Not authenticated" }

  const userRole = token["user_role"] as string | undefined
  const orgId = token["org_id"] as string | undefined

  if (!orgId) return { success: false, error: "Invalid token" }
  if (userRole !== "owner" && userRole !== "office") {
    return { success: false, error: "Insufficient permissions" }
  }

  try {
    await withRls(token, async (db) => {
      await db
        .update(routeStops)
        .set({ status: "scheduled", updated_at: new Date() })
        .where(
          and(
            eq(routeStops.id, routeStopId),
            eq(routeStops.org_id, orgId),
            eq(routeStops.status, "skipped")
          )
        )
    })

    return { success: true }
  } catch (error) {
    console.error("[unskipStop] Error:", error)
    return { success: false, error: "Failed to unskip stop" }
  }
}

/**
 * moveStop — move a single route_stop to a different tech and/or date.
 *
 * Owner/office only. Deletes the original stop and creates a new one at the
 * target tech+date. The recurring rule stays intact — this only affects this
 * single occurrence (e.g., "move Wednesday's stop to Thursday this week").
 *
 * The new stop gets appended at the end of the target day's route.
 */
export async function moveStop(
  routeStopId: string,
  targetTechId: string,
  targetDate: string
): Promise<{ success: boolean; newStopId?: string; error?: string }> {
  const token = await getRlsToken()
  if (!token) return { success: false, error: "Not authenticated" }

  const userRole = token["user_role"] as string | undefined
  const orgId = token["org_id"] as string | undefined

  if (!orgId) return { success: false, error: "Invalid token" }
  if (userRole !== "owner" && userRole !== "office") {
    return { success: false, error: "Insufficient permissions" }
  }

  try {
    let newStopId: string | undefined

    await withRls(token, async (db) => {
      // Fetch the original stop
      const [original] = await db
        .select()
        .from(routeStops)
        .where(and(eq(routeStops.id, routeStopId), eq(routeStops.org_id, orgId)))
        .limit(1)

      if (!original) throw new Error("Stop not found")

      // Check if already on the target tech+date
      if (original.tech_id === targetTechId && original.scheduled_date === targetDate) {
        throw new Error("Stop is already on this tech and date")
      }

      // Find max sort_index for target tech+date
      const existing = await db
        .select({ sort_index: routeStops.sort_index })
        .from(routeStops)
        .where(
          and(
            eq(routeStops.org_id, orgId),
            eq(routeStops.tech_id, targetTechId),
            eq(routeStops.scheduled_date, targetDate)
          )
        )
      const maxIdx = existing.length > 0
        ? Math.max(...existing.map((s) => s.sort_index))
        : 0

      // Delete the original stop
      await db
        .delete(routeStops)
        .where(and(eq(routeStops.id, routeStopId), eq(routeStops.org_id, orgId)))

      // Create a new stop at the target
      const [inserted] = await db
        .insert(routeStops)
        .values({
          org_id: orgId,
          customer_id: original.customer_id,
          pool_id: original.pool_id,
          tech_id: targetTechId,
          schedule_rule_id: original.schedule_rule_id,
          scheduled_date: targetDate,
          sort_index: maxIdx + 1,
          position_locked: false,
          status: "scheduled",
        })
        .onConflictDoNothing()
        .returning({ id: routeStops.id })

      newStopId = inserted?.id
    })

    return { success: true, newStopId }
  } catch (error) {
    const msg = error instanceof Error ? error.message : "Failed to move stop"
    console.error("[moveStop] Error:", error)
    return { success: false, error: msg }
  }
}

// ─── Work order schedule integration ──────────────────────────────────────────

export interface UnassignedWorkOrder {
  id: string
  title: string
  customerId: string
  customerName: string
  address: string | null
  poolId: string | null
  poolName: string | null
  priority: string
  category: string
}

/**
 * getApprovedWorkOrders — fetch approved WOs ready to be scheduled.
 *
 * Returns WOs with status "approved" (not yet assigned to a route).
 * Owner/office only.
 */
export async function getApprovedWorkOrders(): Promise<UnassignedWorkOrder[]> {
  const token = await getRlsToken()
  if (!token) return []

  const userRole = token["user_role"] as string | undefined
  const orgId = token["org_id"] as string | undefined

  if (!orgId) return []
  if (userRole !== "owner" && userRole !== "office") return []

  try {
    return await withRls(token, async (db) => {
      const wos = await db
        .select()
        .from(workOrders)
        .where(
          and(
            eq(workOrders.org_id, orgId),
            eq(workOrders.status, "approved")
          )
        )

      if (wos.length === 0) return []

      // Batch fetch customer + pool names
      const customerIds = [...new Set(wos.map((w) => w.customer_id))]
      const poolIds = [...new Set(wos.flatMap((w) => (w.pool_id ? [w.pool_id] : [])))]

      const [customerRows, poolRows] = await Promise.all([
        db
          .select({ id: customers.id, full_name: customers.full_name, address: customers.address })
          .from(customers)
          .where(inArray(customers.id, customerIds)),
        poolIds.length > 0
          ? db
              .select({ id: pools.id, name: pools.name })
              .from(pools)
              .where(inArray(pools.id, poolIds))
          : Promise.resolve([]),
      ])

      const customerMap = new Map(customerRows.map((c) => [c.id, c]))
      const poolMap = new Map(poolRows.map((p) => [p.id, p.name]))

      return wos.map((wo): UnassignedWorkOrder => {
        const customer = customerMap.get(wo.customer_id)
        return {
          id: wo.id,
          title: wo.title,
          customerId: wo.customer_id,
          customerName: customer?.full_name ?? "Unknown",
          address: customer?.address ?? null,
          poolId: wo.pool_id,
          poolName: wo.pool_id ? (poolMap.get(wo.pool_id) ?? null) : null,
          priority: wo.priority,
          category: wo.category,
        }
      })
    })
  } catch (error) {
    console.error("[getApprovedWorkOrders] Error:", error)
    return []
  }
}

/**
 * assignWorkOrderToRoute — assign an approved WO to a tech's route on a specific date.
 *
 * 1. Creates a route_stop for the WO's customer+pool with work_order_id set.
 *    If a stop already exists for that customer+pool+date (recurring service),
 *    merges the WO into the existing stop via onConflictDoUpdate.
 * 2. Updates the WO: assigned_tech_id, target_date, status → "scheduled".
 *
 * Owner/office only.
 */
export async function assignWorkOrderToRoute(
  workOrderId: string,
  techId: string,
  date: string
): Promise<{ success: boolean; error?: string }> {
  const token = await getRlsToken()
  if (!token) return { success: false, error: "Not authenticated" }

  const userRole = token["user_role"] as string | undefined
  const orgId = token["org_id"] as string | undefined

  if (!orgId) return { success: false, error: "Invalid token" }
  if (userRole !== "owner" && userRole !== "office") {
    return { success: false, error: "Insufficient permissions" }
  }

  try {
    await withRls(token, async (db) => {
      // Fetch the WO
      const [wo] = await db
        .select()
        .from(workOrders)
        .where(and(eq(workOrders.id, workOrderId), eq(workOrders.org_id, orgId)))
        .limit(1)

      if (!wo) throw new Error("Work order not found")
      if (wo.status !== "approved") throw new Error("Work order must be approved to schedule")

      // Find max sort_index for tech+date
      const existing = await db
        .select({ sort_index: routeStops.sort_index })
        .from(routeStops)
        .where(
          and(
            eq(routeStops.org_id, orgId),
            eq(routeStops.tech_id, techId),
            eq(routeStops.scheduled_date, date)
          )
        )
      const maxIdx = existing.length > 0
        ? Math.max(...existing.map((s) => s.sort_index))
        : 0

      // Insert route_stop. If customer+pool+date already exists (recurring stop),
      // merge the WO into the existing stop.
      await db
        .insert(routeStops)
        .values({
          org_id: orgId,
          customer_id: wo.customer_id,
          pool_id: wo.pool_id,
          tech_id: techId,
          scheduled_date: date,
          sort_index: maxIdx + 1,
          work_order_id: workOrderId,
          status: "scheduled",
        })
        .onConflictDoUpdate({
          target: [routeStops.org_id, routeStops.customer_id, routeStops.pool_id, routeStops.scheduled_date],
          set: { work_order_id: workOrderId, updated_at: new Date() },
        })

      // Update the WO status
      await db
        .update(workOrders)
        .set({
          assigned_tech_id: techId,
          target_date: date,
          status: "scheduled",
          updated_at: new Date(),
        })
        .where(eq(workOrders.id, workOrderId))
    })

    revalidatePath("/schedule")
    revalidatePath("/work-orders")
    return { success: true }
  } catch (error) {
    const msg = error instanceof Error ? error.message : "Failed to assign work order"
    console.error("[assignWorkOrderToRoute] Error:", error)
    return { success: false, error: msg }
  }
}

/**
 * removeWorkOrderFromRoute — unschedule a WO stop and revert WO to approved.
 *
 * If the stop was a merged stop (has schedule_rule_id), just clears work_order_id.
 * If the stop was created solely for the WO, deletes the entire stop.
 * Reverts the WO status back to "approved" and clears assigned_tech_id/target_date.
 *
 * Owner/office only.
 */
export async function removeWorkOrderFromRoute(
  routeStopId: string
): Promise<{ success: boolean; error?: string }> {
  const token = await getRlsToken()
  if (!token) return { success: false, error: "Not authenticated" }

  const userRole = token["user_role"] as string | undefined
  const orgId = token["org_id"] as string | undefined

  if (!orgId) return { success: false, error: "Invalid token" }
  if (userRole !== "owner" && userRole !== "office") {
    return { success: false, error: "Insufficient permissions" }
  }

  try {
    await withRls(token, async (db) => {
      // Fetch the stop
      const [stop] = await db
        .select()
        .from(routeStops)
        .where(and(eq(routeStops.id, routeStopId), eq(routeStops.org_id, orgId)))
        .limit(1)

      if (!stop || !stop.work_order_id) return

      // Revert WO to approved
      await db
        .update(workOrders)
        .set({
          status: "approved",
          assigned_tech_id: null,
          target_date: null,
          updated_at: new Date(),
        })
        .where(eq(workOrders.id, stop.work_order_id))

      if (stop.schedule_rule_id) {
        // Merged stop — just clear work_order_id, keep the regular service stop
        await db
          .update(routeStops)
          .set({ work_order_id: null, updated_at: new Date() })
          .where(eq(routeStops.id, routeStopId))
      } else {
        // WO-only stop — delete entirely
        await db
          .delete(routeStops)
          .where(eq(routeStops.id, routeStopId))
      }
    })

    revalidatePath("/schedule")
    revalidatePath("/work-orders")
    return { success: true }
  } catch (error) {
    console.error("[removeWorkOrderFromRoute] Error:", error)
    return { success: false, error: "Failed to remove work order from route" }
  }
}

// ─── Workload Balance + Auto-Schedule ────────────────────────────────────────

/**
 * WorkloadMetrics — per-tech workload metrics for a given week.
 * Used by getWorkloadBalance and as the metrics payload in AutoScheduleProposal.
 */
export interface WorkloadMetrics {
  techId: string
  techName: string
  totalStops: number
  stopsPerDay: Record<string, number> // YYYY-MM-DD → count
  estimatedDriveMinutes: number
}

/**
 * AutoScheduleAssignment — a single stop assignment in an auto-schedule proposal.
 */
export interface AutoScheduleAssignment {
  stopId: string | null // null for newly proposed stops not yet in DB
  ruleId: string
  techId: string
  techName: string
  day: string // YYYY-MM-DD
  customerName: string
  poolName: string | null
  customerId: string
  poolId: string | null
  lat: number | null
  lng: number | null
  isNew: boolean // true if this is a new assignment; false if existing stop is being moved
}

/**
 * AutoScheduleProposal — the full output of autoScheduleWeek.
 * Not persisted — office must call applyAutoSchedule to commit.
 */
export interface AutoScheduleProposal {
  weekStart: string
  assignments: AutoScheduleAssignment[]
  metrics: {
    before: WorkloadMetrics[]
    after: WorkloadMetrics[]
    totalStopsProposed: number
    totalUnassignable: number
  }
}

/**
 * haversineDistanceBalancer — great-circle distance in km between two lat/lng points.
 * Used for workload balance geographic scoring.
 */
function haversineDistanceBalancer(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const R = 6371
  const dLat = ((lat2 - lat1) * Math.PI) / 180
  const dLng = ((lng2 - lng1) * Math.PI) / 180
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos((lat1 * Math.PI) / 180) *
      Math.cos((lat2 * Math.PI) / 180) *
      Math.sin(dLng / 2) *
      Math.sin(dLng / 2)
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a))
}

/**
 * getWeekDatesFromStart — return the Mon–Fri date strings for the ISO week starting on weekStartDate.
 * weekStartDate must be a Monday (YYYY-MM-DD).
 */
function getWeekDatesFromStart(weekStartDate: string): string[] {
  const monday = new Date(weekStartDate + "T00:00:00")
  return Array.from({ length: 5 }, (_, i) => {
    const d = new Date(monday)
    d.setDate(monday.getDate() + i)
    return toLocalDateString(d)
  })
}

/**
 * getWorkloadBalance — return per-tech workload metrics for a given week.
 *
 * Queries all route_stops for Mon–Fri of the given week, groups by tech and day,
 * returns stop counts per day and a heuristic drive-time estimate (25 min/stop average).
 *
 * Two-query pattern avoids correlated subquery RLS pitfall (MEMORY.md).
 * Owner/office only.
 */
export async function getWorkloadBalance(weekStartDate: string): Promise<{
  success: boolean
  error?: string
  metrics: WorkloadMetrics[]
}> {
  const token = await getRlsToken()
  if (!token) return { success: false, error: "Not authenticated", metrics: [] }

  const userRole = token["user_role"] as string | undefined
  const orgId = token["org_id"] as string | undefined

  if (!orgId) return { success: false, error: "Invalid token", metrics: [] }
  if (userRole !== "owner" && userRole !== "office") {
    return { success: false, error: "Insufficient permissions", metrics: [] }
  }

  try {
    const weekDates = getWeekDatesFromStart(weekStartDate)
    const weekEnd = weekDates[weekDates.length - 1] ?? weekStartDate

    // Two-query pattern (MEMORY.md: no correlated subqueries inside withRls)
    const [stopRows, profileRows] = await withRls(token, async (db) => {
      const stops = await db
        .select({
          id: routeStops.id,
          tech_id: routeStops.tech_id,
          scheduled_date: routeStops.scheduled_date,
        })
        .from(routeStops)
        .where(
          and(
            eq(routeStops.org_id, orgId),
            gte(routeStops.scheduled_date, weekStartDate),
            lte(routeStops.scheduled_date, weekEnd)
          )
        )

      const techIds = [...new Set(stops.flatMap((s) => (s.tech_id ? [s.tech_id] : [])))]
      const profs = techIds.length > 0
        ? await db
            .select({ id: profiles.id, full_name: profiles.full_name })
            .from(profiles)
            .where(inArray(profiles.id, techIds))
        : ([] as { id: string; full_name: string | null }[])

      return [stops, profs] as const
    })

    const profileMap = new Map(profileRows.map((p) => [p.id, p.full_name ?? "Unknown"]))

    // Group stops by tech
    const techStopMap = new Map<string, typeof stopRows>()
    for (const stop of stopRows) {
      if (!stop.tech_id) continue
      const existing = techStopMap.get(stop.tech_id) ?? []
      existing.push(stop)
      techStopMap.set(stop.tech_id, existing)
    }

    const metrics: WorkloadMetrics[] = []
    for (const [techId, stops] of techStopMap) {
      const stopsPerDay: Record<string, number> = {}
      for (const d of weekDates) stopsPerDay[d] = 0
      for (const stop of stops) {
        stopsPerDay[stop.scheduled_date] = (stopsPerDay[stop.scheduled_date] ?? 0) + 1
      }
      // Heuristic: 25 min average per stop (no ORS call for speed)
      metrics.push({
        techId,
        techName: profileMap.get(techId) ?? "Unknown",
        totalStops: stops.length,
        stopsPerDay,
        estimatedDriveMinutes: stops.length * 25,
      })
    }

    metrics.sort((a, b) => a.techName.localeCompare(b.techName))
    return { success: true, metrics }
  } catch (error) {
    console.error("[getWorkloadBalance] Error:", error)
    return { success: false, error: "Failed to fetch workload balance", metrics: [] }
  }
}

/**
 * autoScheduleWeek — generate a balanced weekly route proposal without persisting it.
 *
 * Algorithm:
 * 1. Fetch all active schedule_rules for the org.
 * 2. Use generateDatesForRule to find which rules fire in the target week.
 * 3. Respect existing DB stops (already-assigned stops kept as-is).
 * 4. For unassigned stops, use greedy geographic clustering:
 *    - Score each (tech, day) by proximity to tech's centroid that day + load factor.
 * 5. Return an AutoScheduleProposal (preview only — not persisted).
 *
 * Owner/office only.
 */
export async function autoScheduleWeek(weekStartDate: string): Promise<{
  success: boolean
  error?: string
  proposal: AutoScheduleProposal | null
}> {
  const token = await getRlsToken()
  if (!token) return { success: false, error: "Not authenticated", proposal: null }

  const userRole = token["user_role"] as string | undefined
  const orgId = token["org_id"] as string | undefined

  if (!orgId) return { success: false, error: "Invalid token", proposal: null }
  if (userRole !== "owner" && userRole !== "office") {
    return { success: false, error: "Insufficient permissions", proposal: null }
  }

  try {
    const weekDates = getWeekDatesFromStart(weekStartDate)
    const weekEnd = weekDates[weekDates.length - 1] ?? weekStartDate

    // Fetch everything in two withRls calls to avoid correlated subquery pitfall
    const ruleRows = await withRls(token, (db) =>
      db
        .select()
        .from(scheduleRules)
        .where(and(eq(scheduleRules.org_id, orgId), eq(scheduleRules.active, true)))
    )

    const custIds = [...new Set(ruleRows.map((r) => r.customer_id))]
    const poolIds = [...new Set(ruleRows.flatMap((r) => (r.pool_id ? [r.pool_id] : [])))]

    const [customerRows, poolRows, profileRows, existingStops] = await withRls(token, async (db) => {
      const [custs, poolList, profs, stops] = await Promise.all([
        custIds.length > 0
          ? db
              .select({ id: customers.id, full_name: customers.full_name, lat: customers.lat, lng: customers.lng })
              .from(customers)
              .where(inArray(customers.id, custIds))
          : Promise.resolve([] as { id: string; full_name: string; lat: number | null; lng: number | null }[]),
        poolIds.length > 0
          ? db.select({ id: pools.id, name: pools.name }).from(pools).where(inArray(pools.id, poolIds))
          : Promise.resolve([] as { id: string; name: string }[]),
        db
          .select({ id: profiles.id, full_name: profiles.full_name, role: profiles.role })
          .from(profiles)
          .where(and(eq(profiles.org_id, orgId), inArray(profiles.role, ["tech", "owner", "office"]))),
        db
          .select({
            id: routeStops.id,
            tech_id: routeStops.tech_id,
            customer_id: routeStops.customer_id,
            pool_id: routeStops.pool_id,
            scheduled_date: routeStops.scheduled_date,
          })
          .from(routeStops)
          .where(
            and(
              eq(routeStops.org_id, orgId),
              gte(routeStops.scheduled_date, weekStartDate),
              lte(routeStops.scheduled_date, weekEnd)
            )
          ),
      ])
      return [custs, poolList, profs, stops] as const
    })

    const customerMap = new Map(customerRows.map((c) => [c.id, c]))
    const poolMap = new Map(poolRows.map((p) => [p.id, p.name]))
    const techMap = new Map(profileRows.map((p) => [p.id, p.full_name ?? "Unknown"]))
    const techIds = profileRows.map((p) => p.id)

    const existingKey = (cid: string, pid: string | null) => `${cid}:${pid ?? "null"}`
    const existingStopMap = new Map(
      existingStops.map((s) => [existingKey(s.customer_id, s.pool_id), s])
    )

    // Determine which rules fire in this week
    const weekStart = new Date(weekStartDate + "T00:00:00")
    const weekEndDate = new Date(weekEnd + "T23:59:59")

    interface RuleFiring {
      rule: typeof ruleRows[number]
      firedDate: string
    }
    interface AssignedFiring extends RuleFiring {
      techId: string
      day: string
    }
    interface UnassignedFiring extends RuleFiring {
      day: string
    }

    const assignedFirings: AssignedFiring[] = []
    const unassignedFirings: UnassignedFiring[] = []

    for (const rule of ruleRows) {
      const dates = generateDatesForRule(rule, weekStart, weekEndDate)
      for (const d of dates) {
        const dateStr = toLocalDateString(d)
        if (!weekDates.includes(dateStr)) continue
        const existing = existingStopMap.get(existingKey(rule.customer_id, rule.pool_id))
        if (existing?.tech_id) {
          // Already in DB with a tech — keep as-is
          assignedFirings.push({ rule, firedDate: dateStr, techId: existing.tech_id, day: dateStr })
        } else if (rule.tech_id) {
          // Rule has preferred tech
          const prefDay = rule.preferred_day_of_week != null
            ? (weekDates[rule.preferred_day_of_week === 0 ? 0 : Math.min(rule.preferred_day_of_week - 1, 4)] ?? dateStr)
            : dateStr
          assignedFirings.push({ rule, firedDate: prefDay, techId: rule.tech_id, day: prefDay })
        } else {
          unassignedFirings.push({ rule, firedDate: dateStr, day: dateStr })
        }
      }
    }

    // Build load state from assigned firings
    // techDayCoords: techId → day → {lat, lng} array for centroid
    const techDayCoords = new Map<string, Map<string, Array<{ lat: number | null; lng: number | null }>>>()
    const initTechDay = (tid: string, day: string) => {
      if (!techDayCoords.has(tid)) techDayCoords.set(tid, new Map())
      if (!techDayCoords.get(tid)!.has(day)) techDayCoords.get(tid)!.set(day, [])
    }
    for (const tid of techIds) {
      for (const d of weekDates) initTechDay(tid, d)
    }

    const assignments: AutoScheduleAssignment[] = []

    for (const af of assignedFirings) {
      const customer = customerMap.get(af.rule.customer_id)
      initTechDay(af.techId, af.day)
      techDayCoords.get(af.techId)!.get(af.day)!.push({ lat: customer?.lat ?? null, lng: customer?.lng ?? null })
      const existing = existingStopMap.get(existingKey(af.rule.customer_id, af.rule.pool_id))
      assignments.push({
        stopId: existing?.id ?? null,
        ruleId: af.rule.id,
        techId: af.techId,
        techName: techMap.get(af.techId) ?? "Unknown",
        day: af.day,
        customerName: customer?.full_name ?? "Unknown",
        poolName: af.rule.pool_id ? (poolMap.get(af.rule.pool_id) ?? null) : null,
        customerId: af.rule.customer_id,
        poolId: af.rule.pool_id,
        lat: customer?.lat ?? null,
        lng: customer?.lng ?? null,
        isNew: !existing?.id,
      })
    }

    // Greedy geographic clustering for unassigned stops
    let totalUnassignable = 0

    for (const uf of unassignedFirings) {
      if (techIds.length === 0) {
        totalUnassignable++
        continue
      }

      const customer = customerMap.get(uf.rule.customer_id)
      const stopLat = customer?.lat ?? null
      const stopLng = customer?.lng ?? null

      let bestTechId: string | null = null
      let bestDay: string | null = null
      let bestScore = Infinity

      for (const tid of techIds) {
        const daysToCheck = uf.rule.preferred_day_of_week != null
          ? [weekDates[uf.rule.preferred_day_of_week === 0 ? 0 : Math.min(uf.rule.preferred_day_of_week - 1, 4)] ?? uf.day]
          : weekDates

        for (const day of daysToCheck) {
          const dayStops = techDayCoords.get(tid)?.get(day) ?? []
          const loadCount = dayStops.length

          let geoScore = 0
          if (stopLat !== null && stopLng !== null && dayStops.length > 0) {
            const geocoded = dayStops.filter(
              (s): s is { lat: number; lng: number } => s.lat !== null && s.lng !== null
            )
            if (geocoded.length > 0) {
              const centLat = geocoded.reduce((sum, s) => sum + s.lat, 0) / geocoded.length
              const centLng = geocoded.reduce((sum, s) => sum + s.lng, 0) / geocoded.length
              geoScore = haversineDistanceBalancer(stopLat, stopLng, centLat, centLng)
            }
          }

          const avgLoad = techIds.reduce((sum, t) => sum + (techDayCoords.get(t)?.get(day)?.length ?? 0), 0) / Math.max(techIds.length, 1)
          const loadScore = Math.max(0, loadCount - avgLoad) * 5
          const totalScore = geoScore + loadScore

          if (totalScore < bestScore) {
            bestScore = totalScore
            bestTechId = tid
            bestDay = day
          }
        }
      }

      if (!bestTechId || !bestDay) {
        totalUnassignable++
        continue
      }

      initTechDay(bestTechId, bestDay)
      techDayCoords.get(bestTechId)!.get(bestDay)!.push({ lat: stopLat, lng: stopLng })

      const existing = existingStopMap.get(existingKey(uf.rule.customer_id, uf.rule.pool_id))
      assignments.push({
        stopId: existing?.id ?? null,
        ruleId: uf.rule.id,
        techId: bestTechId,
        techName: techMap.get(bestTechId) ?? "Unknown",
        day: bestDay,
        customerName: customer?.full_name ?? "Unknown",
        poolName: uf.rule.pool_id ? (poolMap.get(uf.rule.pool_id) ?? null) : null,
        customerId: uf.rule.customer_id,
        poolId: uf.rule.pool_id,
        lat: stopLat,
        lng: stopLng,
        isNew: !existing?.id,
      })
    }

    // Before metrics from DB
    const beforeResult = await getWorkloadBalance(weekStartDate)

    // After metrics from proposal
    const afterTechMap = new Map<string, WorkloadMetrics>()
    for (const a of assignments) {
      if (!afterTechMap.has(a.techId)) {
        const stopsPerDay: Record<string, number> = {}
        for (const d of weekDates) stopsPerDay[d] = 0
        afterTechMap.set(a.techId, { techId: a.techId, techName: a.techName, totalStops: 0, stopsPerDay, estimatedDriveMinutes: 0 })
      }
      const m = afterTechMap.get(a.techId)!
      m.totalStops++
      m.stopsPerDay[a.day] = (m.stopsPerDay[a.day] ?? 0) + 1
      m.estimatedDriveMinutes = m.totalStops * 25
    }
    const afterMetrics = Array.from(afterTechMap.values()).sort((a, b) => a.techName.localeCompare(b.techName))

    return {
      success: true,
      proposal: {
        weekStart: weekStartDate,
        assignments,
        metrics: {
          before: beforeResult.metrics,
          after: afterMetrics,
          totalStopsProposed: assignments.length,
          totalUnassignable,
        },
      },
    }
  } catch (error) {
    console.error("[autoScheduleWeek] Error:", error)
    return { success: false, error: "Failed to generate auto-schedule proposal", proposal: null }
  }
}

/**
 * applyAutoSchedule — persist an approved AutoScheduleProposal to the database.
 *
 * For each assignment:
 * - If stopId is set: update tech_id + scheduled_date on the existing stop.
 * - If stopId is null: insert a new route_stop row (sort_index=999, office can reorder).
 *
 * Uses onConflictDoNothing for idempotency. Owner/office only.
 */
export async function applyAutoSchedule(proposal: AutoScheduleProposal): Promise<{
  success: boolean
  error?: string
  applied: number
}> {
  const token = await getRlsToken()
  if (!token) return { success: false, error: "Not authenticated", applied: 0 }

  const userRole = token["user_role"] as string | undefined
  const orgId = token["org_id"] as string | undefined

  if (!orgId) return { success: false, error: "Invalid token", applied: 0 }
  if (userRole !== "owner" && userRole !== "office") {
    return { success: false, error: "Insufficient permissions", applied: 0 }
  }

  try {
    let applied = 0
    await withRls(token, async (db) => {
      for (const assignment of proposal.assignments) {
        if (assignment.stopId) {
          await db
            .update(routeStops)
            .set({ tech_id: assignment.techId, scheduled_date: assignment.day, updated_at: new Date() })
            .where(and(eq(routeStops.id, assignment.stopId), eq(routeStops.org_id, orgId)))
          applied++
        } else {
          await db
            .insert(routeStops)
            .values({
              org_id: orgId,
              tech_id: assignment.techId,
              customer_id: assignment.customerId,
              pool_id: assignment.poolId,
              schedule_rule_id: assignment.ruleId,
              scheduled_date: assignment.day,
              sort_index: 999,
              status: "scheduled",
            })
            .onConflictDoNothing()
          applied++
        }
      }
    })

    revalidatePath("/schedule")
    return { success: true, applied }
  } catch (error) {
    console.error("[applyAutoSchedule] Error:", error)
    return { success: false, error: "Failed to apply auto-schedule", applied: 0 }
  }
}
