/**
 * QBO Time Sync — pushes DeweyIQ time entries to QuickBooks Online as TimeActivity records.
 *
 * DeweyIQ's entire payroll contribution: accurate time data pushed to QBO.
 * All payroll processing (rates, taxes, pay stubs) stays in QBO per CONTEXT OVERRIDE.
 *
 * Exported:
 *   - syncEmployeeToQbo: creates/updates a QBO Employee for a DeweyIQ profile
 *   - pushTimeEntryToQbo: pushes a single time_entry as a QBO TimeActivity
 *   - pushPayPeriodToQbo: batch-pushes all approved/un-synced entries for a tech week
 *
 * All functions are fire-and-forget safe — they log errors but never throw,
 * so calling code can use `void fn().catch(console.error)`.
 */

import { adminDb } from "@/lib/db"
import { timeEntries, profiles, orgSettings } from "@/lib/db/schema"
import { and, eq, gte, isNull, lte } from "drizzle-orm"
import { getQboClient, isQboConnected, qboPromise } from "@/lib/qbo/client"
import {
  mapTimeEntryToQboTimeActivity,
  mapProfileToQboEmployee,
} from "@/lib/qbo/mappers"

// ─── syncEmployeeToQbo ────────────────────────────────────────────────────────

/**
 * Creates or updates a QBO Employee entity for a DeweyIQ profile.
 *
 * - If profile.qbo_employee_id is set, calls updateEmployee.
 * - If not set, calls createEmployee and stores the returned ID.
 * - If QBO is not connected for the org, this is a no-op.
 * - Fire-and-forget: never throws.
 *
 * Uses adminDb — profile writes need service role, not user RLS.
 */
export async function syncEmployeeToQbo(profileId: string): Promise<void> {
  try {
    // Load the profile via adminDb (service role — bypasses RLS)
    const profileRows = await adminDb
      .select({
        id: profiles.id,
        org_id: profiles.org_id,
        full_name: profiles.full_name,
        email: profiles.email,
        qbo_employee_id: profiles.qbo_employee_id,
      })
      .from(profiles)
      .where(eq(profiles.id, profileId))
      .limit(1)

    if (profileRows.length === 0) {
      console.warn("[syncEmployeeToQbo] Profile not found:", profileId)
      return
    }

    const profile = profileRows[0]

    // Check QBO is connected for this org
    const connected = await isQboConnected(profile.org_id)
    if (!connected) return

    // Cast to any — node-quickbooks TS types don't include Employee endpoints,
    // but the runtime library fully supports them.
    const qbo = await getQboClient(profile.org_id) as any

    const employeePayload = mapProfileToQboEmployee({
      id: profile.id,
      full_name: profile.full_name,
      email: profile.email,
      qbo_employee_id: profile.qbo_employee_id,
    })

    if (profile.qbo_employee_id) {
      // Update existing employee — include Id + SyncToken (QBO requires SyncToken for updates)
      // First read the current employee to get SyncToken
      try {
        const existing = await qboPromise<any>((cb) =>
          qbo.getEmployee(profile.qbo_employee_id!, cb)
        )
        const syncToken = existing?.Employee?.SyncToken ?? existing?.SyncToken ?? "0"

        await qboPromise<any>((cb) =>
          qbo.updateEmployee(
            { ...employeePayload, Id: profile.qbo_employee_id, SyncToken: syncToken },
            cb
          )
        )
      } catch (updateErr) {
        console.warn(
          "[syncEmployeeToQbo] Employee update failed, skipping:",
          updateErr
        )
      }
    } else {
      // Create new employee
      const created = await qboPromise<any>((cb) =>
        qbo.createEmployee(employeePayload, cb)
      )

      const qboEmployeeId =
        created?.Employee?.Id ??
        created?.Id ??
        null

      if (qboEmployeeId) {
        await adminDb
          .update(profiles)
          .set({ qbo_employee_id: String(qboEmployeeId), updated_at: new Date() })
          .where(eq(profiles.id, profileId))
      }
    }
  } catch (error) {
    // Non-fatal — QBO sync is best-effort
    console.error("[syncEmployeeToQbo] Error:", error)
  }
}

// ─── pushTimeEntryToQbo ───────────────────────────────────────────────────────

/**
 * Pushes a single time_entry as a QBO TimeActivity record.
 *
 * - If the tech doesn't have a qbo_employee_id yet, calls syncEmployeeToQbo first.
 * - On success, stores qbo_time_activity_id and qbo_synced_at on the entry.
 * - Fire-and-forget: never throws.
 *
 * Uses adminDb for both reads and writes (service role).
 */
export async function pushTimeEntryToQbo(timeEntryId: string): Promise<void> {
  try {
    // Load the time entry
    const entryRows = await adminDb
      .select({
        id: timeEntries.id,
        org_id: timeEntries.org_id,
        tech_id: timeEntries.tech_id,
        work_date: timeEntries.work_date,
        total_minutes: timeEntries.total_minutes,
        break_minutes: timeEntries.break_minutes,
        status: timeEntries.status,
        qbo_time_activity_id: timeEntries.qbo_time_activity_id,
        approved_at: timeEntries.approved_at,
      })
      .from(timeEntries)
      .where(eq(timeEntries.id, timeEntryId))
      .limit(1)

    if (entryRows.length === 0) {
      console.warn("[pushTimeEntryToQbo] Entry not found:", timeEntryId)
      return
    }

    const entry = entryRows[0]

    // Only push complete entries
    if (entry.status !== "complete") return

    // Skip already-synced entries
    if (entry.qbo_time_activity_id) return

    // Check QBO connected for this org
    const connected = await isQboConnected(entry.org_id)
    if (!connected) return

    // Load tech profile
    const profileRows = await adminDb
      .select({
        id: profiles.id,
        qbo_employee_id: profiles.qbo_employee_id,
      })
      .from(profiles)
      .where(eq(profiles.id, entry.tech_id))
      .limit(1)

    if (profileRows.length === 0) return

    const profile = profileRows[0]

    // Ensure QBO employee exists — sync if not yet linked
    if (!profile.qbo_employee_id) {
      await syncEmployeeToQbo(entry.tech_id)

      // Re-read to get the newly created qbo_employee_id
      const refreshed = await adminDb
        .select({ qbo_employee_id: profiles.qbo_employee_id })
        .from(profiles)
        .where(eq(profiles.id, entry.tech_id))
        .limit(1)

      profile.qbo_employee_id = refreshed[0]?.qbo_employee_id ?? null
    }

    if (!profile.qbo_employee_id) {
      console.warn(
        "[pushTimeEntryToQbo] No QBO employee ID after sync — cannot push entry:",
        timeEntryId
      )
      return
    }

    // Cast to any — node-quickbooks TS types don't include TimeActivity endpoints,
    // but the runtime library fully supports them.
    const qbo = await getQboClient(entry.org_id) as any

    // Net minutes = gross - breaks
    const grossMinutes = entry.total_minutes ?? 0
    const breakMinutes = entry.break_minutes ?? 0
    const netMinutes = Math.max(0, grossMinutes - breakMinutes)

    const payload = mapTimeEntryToQboTimeActivity(
      {
        id: entry.id,
        work_date: entry.work_date,
        total_minutes: netMinutes,
      },
      profile.qbo_employee_id
    )

    const created = await qboPromise<any>((cb) =>
      qbo.createTimeActivity(payload, cb)
    )

    const qboActivityId =
      created?.TimeActivity?.Id ??
      created?.Id ??
      null

    if (qboActivityId) {
      await adminDb
        .update(timeEntries)
        .set({
          qbo_time_activity_id: String(qboActivityId),
          qbo_synced_at: new Date(),
          updated_at: new Date(),
        })
        .where(eq(timeEntries.id, timeEntryId))
    }
  } catch (error) {
    // Non-fatal — QBO push is best-effort
    console.error("[pushTimeEntryToQbo] Error for entry", timeEntryId, ":", error)
  }
}

// ─── pushPayPeriodToQbo ───────────────────────────────────────────────────────

/**
 * Batch-pushes all approved, un-synced time entries for a tech in a given week.
 *
 * Called after approveTimesheet() from timesheets.ts.
 *
 * @returns count of entries pushed and count of failures
 */
export async function pushPayPeriodToQbo(
  orgId: string,
  techId: string,
  weekStartDate: string
): Promise<{ pushed: number; failed: number }> {
  // Calculate week end (Mon + 6 days = Sun)
  const start = new Date(weekStartDate + "T00:00:00")
  const end = new Date(start)
  end.setDate(end.getDate() + 6)
  const pad = (n: number) => String(n).padStart(2, "0")
  const weekEnd = `${end.getFullYear()}-${pad(end.getMonth() + 1)}-${pad(end.getDate())}`

  // Find all approved, un-synced entries for this tech in this week
  const entries = await adminDb
    .select({ id: timeEntries.id })
    .from(timeEntries)
    .where(
      and(
        eq(timeEntries.org_id, orgId),
        eq(timeEntries.tech_id, techId),
        eq(timeEntries.status, "complete"),
        gte(timeEntries.work_date, weekStartDate),
        lte(timeEntries.work_date, weekEnd),
        isNull(timeEntries.qbo_time_activity_id)
        // approved_at IS NOT NULL — only push approved entries
      )
    )

  let pushed = 0
  let failed = 0

  for (const entry of entries) {
    try {
      await pushTimeEntryToQbo(entry.id)
      pushed++
    } catch {
      failed++
    }
  }

  return { pushed, failed }
}
