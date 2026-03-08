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
} from "@/lib/db/schema"
import { and, eq, gt, gte, lte, inArray } from "drizzle-orm"

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

    const todayStr = today.toISOString().split("T")[0]
    const windowEndStr = windowEnd.toISOString().split("T")[0]

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
      const dateStr = date.toISOString().split("T")[0]
      if (holidaySet.has(dateStr)) continue

      await db
        .insert(routeStops)
        .values({
          org_id: orgId,
          customer_id: rule.customer_id,
          pool_id: rule.pool_id,
          tech_id: rule.tech_id,
          schedule_rule_id: rule.id,
          scheduled_date: dateStr,
          sort_index: 999,
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
        const today = new Date().toISOString().split("T")[0]
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
    const today = new Date().toISOString().split("T")[0]

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
              .select({ id: customers.id, full_name: customers.full_name })
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

      const customerMap = new Map(customerRows.map((c) => [c.id, c.full_name]))
      const poolMap = new Map(poolRows.map((p) => [p.id, p.name]))

      return stops
        .sort((a, b) => a.sort_index - b.sort_index)
        .map((stop) => ({
          id: stop.id,
          techId: stop.tech_id,
          customerId: stop.customer_id,
          poolId: stop.pool_id,
          scheduleRuleId: stop.schedule_rule_id,
          scheduledDate: stop.scheduled_date,
          sortIndex: stop.sort_index,
          positionLocked: stop.position_locked,
          windowStart: stop.window_start,
          windowEnd: stop.window_end,
          status: stop.status,
          customerName: customerMap.get(stop.customer_id) ?? "Unknown Customer",
          poolName: stop.pool_id ? (poolMap.get(stop.pool_id) ?? null) : null,
        }))
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
