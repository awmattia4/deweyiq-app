"use server"

import { revalidatePath } from "next/cache"
import { createClient } from "@/lib/supabase/server"
import { adminDb, withRls } from "@/lib/db"
import type { SupabaseToken } from "@/lib/db"
import {
  timeEntries,
  breakEvents,
  timeEntryStops,
  orgSettings,
  alerts,
} from "@/lib/db/schema"
import { and, asc, desc, eq, isNull, isNotNull } from "drizzle-orm"
import { toLocalDateString } from "@/lib/date-utils"

// ─── Auth helper ──────────────────────────────────────────────────────────────

async function getRlsToken(): Promise<SupabaseToken | null> {
  const supabase = await createClient()
  const { data: claimsData } = await supabase.auth.getClaims()
  if (!claimsData?.claims) return null
  return claimsData.claims as SupabaseToken
}

// ─── Types ────────────────────────────────────────────────────────────────────

export interface ActiveShiftState {
  /** time_entries.id of the open shift */
  entryId: string
  /** Current status: 'active' | 'on_break' */
  status: "active" | "on_break"
  /** ISO timestamp of clock-in */
  clockedInAt: string
  /** break_events.id if currently on break, null otherwise */
  activeBreakId: string | null
  /** ISO timestamp when current break started, null if not on break */
  breakStartedAt: string | null
}

// ─── Server actions ────────────────────────────────────────────────────────────

/**
 * getTimeTrackingEnabled — checks org_settings.time_tracking_enabled for the
 * current user's org. Returns false if org has no settings row yet (safe default).
 *
 * Uses adminDb because org_settings SELECT is restricted to org members; we need
 * this callable from server components without a full token just for the feature flag.
 * In practice the user IS authenticated on the routes page — token is available.
 */
export async function getTimeTrackingEnabled(): Promise<boolean> {
  const token = await getRlsToken()
  if (!token) return false

  const orgId = token["org_id"] as string | undefined
  if (!orgId) return false

  try {
    const rows = await withRls(token, async (db) => {
      return db
        .select({ time_tracking_enabled: orgSettings.time_tracking_enabled })
        .from(orgSettings)
        .where(eq(orgSettings.org_id, orgId))
        .limit(1)
    })

    return rows[0]?.time_tracking_enabled ?? false
  } catch (error) {
    console.error("[getTimeTrackingEnabled] Error:", error)
    return false
  }
}

/**
 * getActiveShift — returns the current open time_entry for the authenticated tech.
 *
 * Returns null if:
 * - Not authenticated
 * - No open shift (clocked_out_at IS NULL)
 * - Time tracking disabled for org
 *
 * Also surfaces break state (open break_event with ended_at IS NULL).
 * Used by ClockInBanner on mount to determine initial display state.
 */
export async function getActiveShift(): Promise<ActiveShiftState | null> {
  const token = await getRlsToken()
  if (!token) return null

  const userId = token["sub"] as string | undefined
  const orgId = token["org_id"] as string | undefined
  const userRole = token["user_role"] as string | undefined

  if (!userId || !orgId) return null
  // Only techs and owners clock in
  if (userRole !== "tech" && userRole !== "owner") return null

  try {
    const entries = await withRls(token, async (db) => {
      return db
        .select({
          id: timeEntries.id,
          status: timeEntries.status,
          clocked_in_at: timeEntries.clocked_in_at,
        })
        .from(timeEntries)
        .where(
          and(
            eq(timeEntries.org_id, orgId),
            eq(timeEntries.tech_id, userId),
            isNull(timeEntries.clocked_out_at)
          )
        )
        .limit(1)
    })

    if (entries.length === 0) return null

    const entry = entries[0]

    // Check for open break
    const breaks = await withRls(token, async (db) => {
      return db
        .select({
          id: breakEvents.id,
          started_at: breakEvents.started_at,
        })
        .from(breakEvents)
        .where(
          and(
            eq(breakEvents.time_entry_id, entry.id),
            isNull(breakEvents.ended_at)
          )
        )
        .limit(1)
    })

    const activeBreak = breaks[0] ?? null

    return {
      entryId: entry.id,
      status: entry.status as "active" | "on_break",
      clockedInAt: entry.clocked_in_at.toISOString(),
      activeBreakId: activeBreak?.id ?? null,
      breakStartedAt: activeBreak?.started_at.toISOString() ?? null,
    }
  } catch (error) {
    console.error("[getActiveShift] Error:", error)
    return null
  }
}

/**
 * clockIn — creates a new time_entry row for the authenticated tech.
 *
 * Validates:
 * - Time tracking enabled for org
 * - User is tech or owner
 * - No existing open shift
 *
 * GPS coordinates are optional — GPS failure should never block clock-in.
 * work_date uses toLocalDateString() (CRITICAL: not toISOString per MEMORY.md).
 */
export async function clockIn(
  lat?: number | null,
  lng?: number | null
): Promise<{ success: boolean; entryId?: string; error?: string }> {
  const token = await getRlsToken()
  if (!token) return { success: false, error: "Not authenticated" }

  const userId = token["sub"] as string | undefined
  const orgId = token["org_id"] as string | undefined
  const userRole = token["user_role"] as string | undefined

  if (!userId || !orgId) return { success: false, error: "Invalid session" }
  if (userRole !== "tech" && userRole !== "owner") {
    return { success: false, error: "Only techs and owners can clock in" }
  }

  // Check time tracking is enabled
  const enabled = await getTimeTrackingEnabled()
  if (!enabled) {
    return { success: false, error: "Time tracking is not enabled for your organization" }
  }

  // Check no existing open shift
  const existingShift = await getActiveShift()
  if (existingShift) {
    return { success: false, error: "You are already clocked in" }
  }

  try {
    const now = new Date()
    const workDate = toLocalDateString(now)

    const inserted = await withRls(token, async (db) => {
      return db
        .insert(timeEntries)
        .values({
          org_id: orgId,
          tech_id: userId,
          work_date: workDate,
          status: "active",
          clocked_in_at: now,
          clock_in_lat: lat ?? null,
          clock_in_lng: lng ?? null,
        })
        .returning({ id: timeEntries.id })
    })

    revalidatePath("/routes")

    return { success: true, entryId: inserted[0].id }
  } catch (error) {
    console.error("[clockIn] Error:", error)
    return { success: false, error: "Failed to clock in" }
  }
}

/**
 * clockOut — closes the active shift for the authenticated tech.
 *
 * Finds the active shift (clocked_out_at IS NULL), sets clocked_out_at,
 * calculates total_minutes and break_minutes (sum of completed break_events),
 * sets status='complete'.
 *
 * After clock-out, triggers pushTimeEntryToQbo() in the background.
 * TODO (Plan 04): implement pushTimeEntryToQbo() and call it here.
 */
export async function clockOut(
  lat?: number | null,
  lng?: number | null
): Promise<{
  success: boolean
  totalMinutes?: number
  breakMinutes?: number
  error?: string
}> {
  const token = await getRlsToken()
  if (!token) return { success: false, error: "Not authenticated" }

  const userId = token["sub"] as string | undefined
  const orgId = token["org_id"] as string | undefined
  const userRole = token["user_role"] as string | undefined

  if (!userId || !orgId) return { success: false, error: "Invalid session" }
  if (userRole !== "tech" && userRole !== "owner") {
    return { success: false, error: "Only techs and owners can clock out" }
  }

  const activeShift = await getActiveShift()
  if (!activeShift) {
    return { success: false, error: "No active shift found — you are not clocked in" }
  }

  // If currently on break, end it first
  if (activeShift.status === "on_break" && activeShift.activeBreakId) {
    await endBreak()
  }

  try {
    const now = new Date()

    // Calculate total gross minutes (clocked_in_at to now)
    const clockedInAt = new Date(activeShift.clockedInAt)
    const totalMinutes = Math.round((now.getTime() - clockedInAt.getTime()) / 60000)

    // Sum completed break_events for this entry
    const completedBreaks = await withRls(token, async (db) => {
      return db
        .select({
          started_at: breakEvents.started_at,
          ended_at: breakEvents.ended_at,
        })
        .from(breakEvents)
        .where(
          and(
            eq(breakEvents.time_entry_id, activeShift.entryId),
            isNotNull(breakEvents.ended_at)
          )
        )
    })

    const breakMinutes = completedBreaks.reduce((sum, b) => {
      if (!b.ended_at) return sum
      const duration = Math.round((b.ended_at.getTime() - b.started_at.getTime()) / 60000)
      return sum + duration
    }, 0)

    await withRls(token, async (db) => {
      await db
        .update(timeEntries)
        .set({
          clocked_out_at: now,
          clock_out_lat: lat ?? null,
          clock_out_lng: lng ?? null,
          total_minutes: totalMinutes,
          break_minutes: breakMinutes,
          status: "complete",
          updated_at: now,
        })
        .where(eq(timeEntries.id, activeShift.entryId))
    })

    // Plan 04: Push to QBO on clock-out (fire-and-forget)
    void import("@/lib/qbo/time-sync").then(({ pushTimeEntryToQbo }) => {
      pushTimeEntryToQbo(activeShift.entryId).catch((err) => {
        console.error("[clockOut] QBO time push failed:", err)
      })
    })

    revalidatePath("/routes")

    return { success: true, totalMinutes, breakMinutes }
  } catch (error) {
    console.error("[clockOut] Error:", error)
    return { success: false, error: "Failed to clock out" }
  }
}

/**
 * startBreak — creates a break_event row linked to the active shift.
 *
 * Validates:
 * - Active shift exists
 * - No open break already
 *
 * Updates time_entry status to 'on_break'.
 */
export async function startBreak(): Promise<{
  success: boolean
  breakId?: string
  error?: string
}> {
  const token = await getRlsToken()
  if (!token) return { success: false, error: "Not authenticated" }

  const userId = token["sub"] as string | undefined
  const orgId = token["org_id"] as string | undefined

  if (!userId || !orgId) return { success: false, error: "Invalid session" }

  const activeShift = await getActiveShift()
  if (!activeShift) {
    return { success: false, error: "No active shift — clock in first" }
  }

  if (activeShift.status === "on_break") {
    return { success: false, error: "Already on break" }
  }

  try {
    const now = new Date()

    const inserted = await withRls(token, async (db) => {
      return db
        .insert(breakEvents)
        .values({
          org_id: orgId,
          time_entry_id: activeShift.entryId,
          started_at: now,
        })
        .returning({ id: breakEvents.id })
    })

    // Update shift status to on_break
    await withRls(token, async (db) => {
      await db
        .update(timeEntries)
        .set({ status: "on_break", updated_at: now })
        .where(eq(timeEntries.id, activeShift.entryId))
    })

    revalidatePath("/routes")

    return { success: true, breakId: inserted[0].id }
  } catch (error) {
    console.error("[startBreak] Error:", error)
    return { success: false, error: "Failed to start break" }
  }
}

/**
 * endBreak — closes the open break_event for the authenticated tech.
 *
 * Finds the open break_event (ended_at IS NULL), sets ended_at.
 * Updates time_entry status back to 'active'.
 */
export async function endBreak(): Promise<{
  success: boolean
  durationMinutes?: number
  error?: string
}> {
  const token = await getRlsToken()
  if (!token) return { success: false, error: "Not authenticated" }

  const userId = token["sub"] as string | undefined
  const orgId = token["org_id"] as string | undefined

  if (!userId || !orgId) return { success: false, error: "Invalid session" }

  const activeShift = await getActiveShift()
  if (!activeShift) {
    return { success: false, error: "No active shift" }
  }

  if (!activeShift.activeBreakId || !activeShift.breakStartedAt) {
    return { success: false, error: "Not currently on break" }
  }

  try {
    const now = new Date()
    const breakStart = new Date(activeShift.breakStartedAt)
    const durationMinutes = Math.round((now.getTime() - breakStart.getTime()) / 60000)

    await withRls(token, async (db) => {
      await db
        .update(breakEvents)
        .set({ ended_at: now })
        .where(eq(breakEvents.id, activeShift.activeBreakId!))
    })

    // Restore shift status to active
    await withRls(token, async (db) => {
      await db
        .update(timeEntries)
        .set({ status: "active", updated_at: now })
        .where(eq(timeEntries.id, activeShift.entryId))
    })

    revalidatePath("/routes")

    return { success: true, durationMinutes }
  } catch (error) {
    console.error("[endBreak] Error:", error)
    return { success: false, error: "Failed to end break" }
  }
}

/**
 * checkBreakCompliance — checks if a tech has been clocked in for longer than
 * the org's break_auto_detect_minutes threshold without taking any break.
 *
 * If violated, creates an alert row via adminDb (bypasses RLS since alert
 * INSERT requires owner/office role, but this check may run on behalf of tech).
 *
 * Called by the auto-break detection job in Plan 03.
 * Alert type: 'break_compliance'. Deduplication via ON CONFLICT DO NOTHING.
 *
 * @param timeEntryId - The time_entries.id to check
 */
export async function checkBreakCompliance(timeEntryId: string): Promise<void> {
  try {
    // Fetch the time entry and org settings via adminDb (service role — bypasses RLS)
    const entryRows = await adminDb
      .select({
        id: timeEntries.id,
        org_id: timeEntries.org_id,
        tech_id: timeEntries.tech_id,
        clocked_in_at: timeEntries.clocked_in_at,
        status: timeEntries.status,
      })
      .from(timeEntries)
      .where(
        and(
          eq(timeEntries.id, timeEntryId),
          isNull(timeEntries.clocked_out_at)
        )
      )
      .limit(1)

    if (entryRows.length === 0) return // Entry not found or already clocked out

    const entry = entryRows[0]

    // Fetch org's break threshold (default 30 minutes if not set)
    const settingsRows = await adminDb
      .select({ break_auto_detect_minutes: orgSettings.break_auto_detect_minutes })
      .from(orgSettings)
      .where(eq(orgSettings.org_id, entry.org_id))
      .limit(1)

    const thresholdMinutes = settingsRows[0]?.break_auto_detect_minutes ?? 30

    // Check how long tech has been clocked in without a break
    const now = new Date()
    const clockedInMinutes = Math.round(
      (now.getTime() - entry.clocked_in_at.getTime()) / 60000
    )

    if (clockedInMinutes <= thresholdMinutes) return // Below threshold — no alert needed

    // Check if tech has taken any breaks for this shift
    const existingBreaks = await adminDb
      .select({ id: breakEvents.id })
      .from(breakEvents)
      .where(
        and(
          eq(breakEvents.time_entry_id, timeEntryId),
          isNotNull(breakEvents.ended_at) // Completed break
        )
      )
      .limit(1)

    if (existingBreaks.length > 0) return // Tech has taken a break — compliant

    // Insert a break compliance alert — ON CONFLICT DO NOTHING prevents duplicates
    // The unique constraint on (org_id, alert_type, reference_id) deduplicates.
    await adminDb
      .insert(alerts)
      .values({
        org_id: entry.org_id,
        alert_type: "break_compliance",
        severity: "warning",
        reference_id: timeEntryId as string,
        reference_type: "time_entry",
        title: "Break Compliance Alert",
        description: `Tech has been clocked in for ${clockedInMinutes} minutes without a break (threshold: ${thresholdMinutes} min).`,
        metadata: {
          tech_id: entry.tech_id,
          time_entry_id: timeEntryId,
          clocked_in_minutes: clockedInMinutes,
          threshold_minutes: thresholdMinutes,
        },
      })
      .onConflictDoNothing()
  } catch (error) {
    // Non-fatal — compliance checks are best-effort
    console.error("[checkBreakCompliance] Error:", error)
  }
}

/**
 * recordStopArrival — records the tech's geofence-confirmed arrival at a stop.
 *
 * Creates or updates a time_entry_stops row with arrived_at timestamp.
 * Called by useGpsBroadcast when the geofence state machine fires an arrival event.
 *
 * @param routeStopId  - The route_stops.id of the stop the tech arrived at
 * @param timeEntryId  - The active time_entries.id (tech must be clocked in)
 */
export async function recordStopArrival(
  routeStopId: string,
  timeEntryId: string
): Promise<{ success: boolean; error?: string }> {
  const token = await getRlsToken()
  if (!token) return { success: false, error: "Not authenticated" }

  const orgId = token["org_id"] as string | undefined
  if (!orgId) return { success: false, error: "Invalid session" }

  try {
    const now = new Date()

    // Calculate drive time from the most recently departed stop in this shift.
    // Pattern: LEFT JOIN + ORDER BY per MEMORY.md (no correlated subquery on
    // RLS-protected tables inside withRls transactions).
    let driveMinutes: number | null = null
    try {
      const previousStop = await withRls(token, async (db) => {
        return db
          .select({ departed_at: timeEntryStops.departed_at })
          .from(timeEntryStops)
          .where(
            and(
              eq(timeEntryStops.time_entry_id, timeEntryId),
              isNotNull(timeEntryStops.departed_at)
            )
          )
          .orderBy(desc(timeEntryStops.departed_at))
          .limit(1)
      })
      const prevDep = previousStop[0]?.departed_at
      if (prevDep) {
        driveMinutes = Math.round((now.getTime() - prevDep.getTime()) / 60_000)
      }
    } catch {
      // Drive time calculation is best-effort — don't block arrival recording
    }

    // Insert idempotently: onConflictDoNothing prevents duplicate rows.
    // If the row already exists (first arrival already recorded), this is a no-op.
    await withRls(token, async (db) => {
      await db
        .insert(timeEntryStops)
        .values({
          org_id: orgId,
          time_entry_id: timeEntryId,
          route_stop_id: routeStopId,
          arrived_at: now,
          drive_minutes_to_stop: driveMinutes,
        })
        .onConflictDoNothing()
    })

    return { success: true }
  } catch (error) {
    console.error("[recordStopArrival] Error:", error)
    return { success: false, error: "Failed to record arrival" }
  }
}

/**
 * recordStopDeparture — records the tech's geofence-confirmed departure from a stop.
 *
 * Updates the time_entry_stops row for this stop with departed_at timestamp
 * and computes onsite_minutes.
 * Called by useGpsBroadcast when the geofence state machine fires a departure event.
 *
 * @param routeStopId - The route_stops.id of the stop the tech departed
 */
export async function recordStopDeparture(
  routeStopId: string
): Promise<{ success: boolean; error?: string }> {
  const token = await getRlsToken()
  if (!token) return { success: false, error: "Not authenticated" }

  const userId = token["sub"] as string | undefined
  const orgId = token["org_id"] as string | undefined
  if (!userId || !orgId) return { success: false, error: "Invalid session" }

  try {
    const now = new Date()

    // Find the open stop entry (arrived_at IS NOT NULL, departed_at IS NULL)
    const stopRows = await withRls(token, async (db) => {
      return db
        .select({
          id: timeEntryStops.id,
          arrived_at: timeEntryStops.arrived_at,
        })
        .from(timeEntryStops)
        .where(
          and(
            eq(timeEntryStops.org_id, orgId),
            eq(timeEntryStops.route_stop_id, routeStopId),
            isNotNull(timeEntryStops.arrived_at),
            isNull(timeEntryStops.departed_at)
          )
        )
        .limit(1)
    })

    if (stopRows.length === 0) {
      // No open arrival record — departure without arrival, skip silently
      return { success: true }
    }

    const stopRow = stopRows[0]
    const arrivedAt = stopRow.arrived_at
    const onsiteMinutes = arrivedAt
      ? Math.round((now.getTime() - arrivedAt.getTime()) / 60000)
      : null

    await withRls(token, async (db) => {
      await db
        .update(timeEntryStops)
        .set({ departed_at: now, onsite_minutes: onsiteMinutes })
        .where(eq(timeEntryStops.id, stopRow.id))
    })

    return { success: true }
  } catch (error) {
    console.error("[recordStopDeparture] Error:", error)
    return { success: false, error: "Failed to record departure" }
  }
}

// ─── Stop timing query ─────────────────────────────────────────────────────────

/**
 * StopTimingRecord — per-stop timing record returned by getStopTimingForShift.
 */
export interface StopTimingRecord {
  routeStopId: string
  arrivedAt: Date | null
  departedAt: Date | null
  onsiteMinutes: number | null
  driveMinutesToStop: number | null
}

/**
 * getStopTimingForShift — returns all time_entry_stops records for a shift,
 * ordered by arrival time (earliest first).
 *
 * Used by timesheets (Plan 04) to display per-stop breakdowns:
 * - How long was the tech at each stop?
 * - How long did they drive between stops?
 *
 * @param timeEntryId - The time_entries.id for the shift to query
 */
export async function getStopTimingForShift(
  timeEntryId: string
): Promise<{ success: boolean; data?: StopTimingRecord[]; error?: string }> {
  const token = await getRlsToken()
  if (!token) return { success: false, error: "Not authenticated" }

  try {
    const records = await withRls(token, async (db) => {
      return db
        .select({
          routeStopId: timeEntryStops.route_stop_id,
          arrivedAt: timeEntryStops.arrived_at,
          departedAt: timeEntryStops.departed_at,
          onsiteMinutes: timeEntryStops.onsite_minutes,
          driveMinutesToStop: timeEntryStops.drive_minutes_to_stop,
        })
        .from(timeEntryStops)
        .where(eq(timeEntryStops.time_entry_id, timeEntryId))
        .orderBy(asc(timeEntryStops.arrived_at))
    })

    return { success: true, data: records }
  } catch (error) {
    console.error("[getStopTimingForShift] Error:", error)
    return { success: false, error: "Failed to retrieve stop timing" }
  }
}

// ─── Auto-break detection ──────────────────────────────────────────────────────

/**
 * autoDetectBreak — detects idle gaps in an active shift and creates a break event.
 *
 * Called periodically from the client (via useEffect timer) to check whether the
 * tech has been clocked in with no activity update for longer than
 * org_settings.break_auto_detect_minutes.
 *
 * Per the plan: "Break handling: manual 'Take Break' button AND auto-detection
 * of idle gaps as safety net — both modes active simultaneously."
 *
 * Uses time_entry.updated_at as the proxy for last known activity. If the entry
 * hasn't been touched in > threshold and there's no open break event, an
 * auto-detected break is created starting at (now - idleMs).
 *
 * @param timeEntryId - The active time_entries.id to check
 */
export async function autoDetectBreak(
  timeEntryId: string
): Promise<{ success: boolean; breakCreated?: boolean; error?: string }> {
  const token = await getRlsToken()
  if (!token) return { success: false, error: "Not authenticated" }

  const orgId = token["org_id"] as string | undefined
  if (!orgId) return { success: false, error: "Invalid session" }

  try {
    return await withRls(token, async (db) => {
      // Fetch the shift
      const shiftRows = await db
        .select({
          id: timeEntries.id,
          status: timeEntries.status,
          updated_at: timeEntries.updated_at,
        })
        .from(timeEntries)
        .where(eq(timeEntries.id, timeEntryId))
        .limit(1)

      if (shiftRows.length === 0) {
        return { success: false, error: "Shift not found" }
      }

      const entry = shiftRows[0]

      if (entry.status === "complete") {
        return { success: true, breakCreated: false }
      }

      if (entry.status === "on_break") {
        // Already on break — don't create another
        return { success: true, breakCreated: false }
      }

      // Get the org's break detection threshold
      const settingsRows = await db
        .select({ break_auto_detect_minutes: orgSettings.break_auto_detect_minutes })
        .from(orgSettings)
        .where(eq(orgSettings.org_id, orgId))
        .limit(1)

      const thresholdMinutes = settingsRows[0]?.break_auto_detect_minutes ?? 30
      const thresholdMs = thresholdMinutes * 60_000

      const now = new Date()
      const idleMs = now.getTime() - entry.updated_at.getTime()

      if (idleMs < thresholdMs) {
        // Not idle long enough — no break needed
        return { success: true, breakCreated: false }
      }

      // Check for an already-open break event
      const openBreaks = await db
        .select({ id: breakEvents.id })
        .from(breakEvents)
        .where(
          and(
            eq(breakEvents.time_entry_id, timeEntryId),
            isNull(breakEvents.ended_at)
          )
        )
        .limit(1)

      if (openBreaks.length > 0) {
        // Already have an open break — don't create another
        return { success: true, breakCreated: false }
      }

      // Create auto-detected break. Start time is backdated to when idling began.
      const breakStartedAt = new Date(now.getTime() - idleMs)

      await db.insert(breakEvents).values({
        org_id: orgId,
        time_entry_id: timeEntryId,
        started_at: breakStartedAt,
        is_auto_detected: true,
      })

      // Update shift status to on_break
      await db
        .update(timeEntries)
        .set({ status: "on_break", updated_at: now })
        .where(eq(timeEntries.id, timeEntryId))

      return { success: true, breakCreated: true }
    })
  } catch (error) {
    console.error("[autoDetectBreak] Error:", error)
    return { success: false, error: "Failed to auto-detect break" }
  }
}
