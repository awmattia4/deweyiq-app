"use server"

/**
 * safety.ts — Unresponsive tech detection and safety alert escalation.
 *
 * Phase 10 Plan 14 (NOTIF-23)
 *
 * If a tech hasn't completed any stop (or started their route) in the
 * configured safety_timeout_minutes during an active route, the system:
 *   1. Creates a safety alert in the `alerts` table (type: "safety_alert")
 *   2. Executes the configured escalation chain via notifyUser
 *   3. Tracks which escalation steps have fired in alert.metadata
 *
 * Techs can dismiss false positives via `dismissSafetyAlert`.
 * The cron runs every 5 minutes and calls `checkUnresponsiveTechs` for
 * each org.
 *
 * Activity signal: MAX(completed_at) from route_stops for today.
 * If no stop has been completed yet, falls back to MIN(started_at) from
 * today's stops (route start time). No GPS cache table exists.
 */

import { adminDb } from "@/lib/db"
import { createClient } from "@/lib/supabase/server"
import { withRls } from "@/lib/db"
import type { SupabaseToken } from "@/lib/db"
import {
  routeStops,
  alerts,
  orgSettings,
  profiles,
} from "@/lib/db/schema"
import { eq, and, sql, isNull, inArray } from "drizzle-orm"
import { notifyUser } from "@/lib/notifications/dispatch"
import { toLocalDateString } from "@/lib/date-utils"

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface EscalationStep {
  role: string
  delay_minutes: number
}

export interface SafetyAlertMetadata {
  tech_id: string
  tech_name: string
  last_activity_at: string
  inactive_minutes: number
  escalation_steps_fired: number[]
}

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

/**
 * Resolve the user IDs for an escalation step.
 * A step's `role` is either 'owner', 'office', or a specific user UUID.
 */
async function resolveEscalationRecipients(
  orgId: string,
  step: EscalationStep
): Promise<string[]> {
  const { role } = step

  // Specific user UUID
  if (role !== "owner" && role !== "office") {
    // Validate the user is in this org
    const member = await adminDb
      .select({ id: profiles.id })
      .from(profiles)
      .where(and(eq(profiles.org_id, orgId), eq(profiles.id, role)))
      .limit(1)
    return member.map((m) => m.id)
  }

  // Role-based — target all users with that role in the org
  const members = await adminDb
    .select({ id: profiles.id })
    .from(profiles)
    .where(and(eq(profiles.org_id, orgId), eq(profiles.role, role)))
  return members.map((m) => m.id)
}

// ---------------------------------------------------------------------------
// checkUnresponsiveTechs
// ---------------------------------------------------------------------------

/**
 * Scan all active routes for the given org today.
 * A route is "active" if at least one stop has started (started_at IS NOT NULL)
 * or one stop has been completed (completed_at is represented by status='complete').
 *
 * For each tech with an active route:
 *   - Find last_activity_at = MAX(updated_at) WHERE status='complete'
 *   - Fallback to MIN(started_at) if no completions yet
 *   - If now - last_activity_at > safety_timeout_minutes → unresponsive
 *
 * For unresponsive techs: create/update safety alert and fire escalation steps.
 */
export async function checkUnresponsiveTechs(orgId: string): Promise<{
  checked: number
  alertsCreated: number
  alertsEscalated: number
}> {
  const today = toLocalDateString(new Date())
  const now = new Date()

  // Get org safety settings
  const [settings] = await adminDb
    .select({
      safety_timeout_minutes: orgSettings.safety_timeout_minutes,
      safety_escalation_chain: orgSettings.safety_escalation_chain,
    })
    .from(orgSettings)
    .where(eq(orgSettings.org_id, orgId))
    .limit(1)

  if (!settings) {
    console.warn(`[safety] No org_settings for org ${orgId}`)
    return { checked: 0, alertsCreated: 0, alertsEscalated: 0 }
  }

  const timeoutMinutes = settings.safety_timeout_minutes ?? 30
  const escalationChain: EscalationStep[] = (settings.safety_escalation_chain as EscalationStep[] | null) ?? [
    { role: "owner", delay_minutes: 0 },
  ]

  // Get all techs with active routes today (started or completed at least one stop)
  // Two-query pattern per MEMORY.md — no correlated subqueries inside adminDb queries
  const activeStops = await adminDb
    .select({
      tech_id: routeStops.tech_id,
      status: routeStops.status,
      started_at: routeStops.started_at,
      updated_at: routeStops.updated_at,
    })
    .from(routeStops)
    .where(
      and(
        eq(routeStops.org_id, orgId),
        eq(routeStops.scheduled_date, today)
      )
    )

  // Group by tech_id to find active techs and their last activity
  type TechActivity = {
    tech_id: string
    last_completed_at: Date | null
    first_started_at: Date | null
    has_active_route: boolean
  }

  const techMap = new Map<string, TechActivity>()

  for (const stop of activeStops) {
    if (!stop.tech_id) continue

    const existing = techMap.get(stop.tech_id) ?? {
      tech_id: stop.tech_id,
      last_completed_at: null,
      first_started_at: null,
      has_active_route: false,
    }

    // A stop with started_at means the route has begun
    if (stop.started_at) {
      existing.has_active_route = true
      if (
        !existing.first_started_at ||
        stop.started_at < existing.first_started_at
      ) {
        existing.first_started_at = stop.started_at
      }
    }

    // A completed stop counts as activity
    if (stop.status === "complete" && stop.updated_at) {
      existing.has_active_route = true
      if (
        !existing.last_completed_at ||
        stop.updated_at > existing.last_completed_at
      ) {
        existing.last_completed_at = stop.updated_at
      }
    }

    // An in_progress stop also signals the route is active
    if (stop.status === "in_progress") {
      existing.has_active_route = true
    }

    techMap.set(stop.tech_id, existing)
  }

  const activeTechs = Array.from(techMap.values()).filter(
    (t) => t.has_active_route
  )

  if (activeTechs.length === 0) {
    return { checked: 0, alertsCreated: 0, alertsEscalated: 0 }
  }

  // Fetch tech names in batch
  const techIds = activeTechs.map((t) => t.tech_id)
  const techProfiles = await adminDb
    .select({ id: profiles.id, full_name: profiles.full_name })
    .from(profiles)
    .where(inArray(profiles.id, techIds))

  const techNameMap = new Map(techProfiles.map((p) => [p.id, p.full_name]))

  let alertsCreated = 0
  let alertsEscalated = 0

  for (const tech of activeTechs) {
    // Determine last activity timestamp
    const lastActivity: Date | null =
      tech.last_completed_at ?? tech.first_started_at

    if (!lastActivity) continue // No activity timestamp — skip

    const inactiveMs = now.getTime() - lastActivity.getTime()
    const inactiveMinutes = Math.floor(inactiveMs / (1000 * 60))

    if (inactiveMinutes < timeoutMinutes) continue // Not yet unresponsive

    const techName = techNameMap.get(tech.tech_id) ?? "Unknown Tech"

    // Check for existing active (not dismissed) safety alert for this tech today
    const existingAlerts = await adminDb
      .select({
        id: alerts.id,
        generated_at: alerts.generated_at,
        dismissed_at: alerts.dismissed_at,
        metadata: alerts.metadata,
      })
      .from(alerts)
      .where(
        and(
          eq(alerts.org_id, orgId),
          eq(alerts.alert_type, "safety_alert"),
          eq(alerts.reference_id, tech.tech_id as unknown as string)
        )
      )
      .limit(1)

    const existingAlert = existingAlerts[0]

    // If alert exists and was dismissed — skip (tech already confirmed OK)
    if (existingAlert?.dismissed_at) continue

    let alertId: string
    let stepsFired: number[] = []

    if (!existingAlert) {
      // Create new safety alert
      const [newAlert] = await adminDb
        .insert(alerts)
        .values({
          org_id: orgId,
          alert_type: "safety_alert",
          severity: "critical",
          reference_id: tech.tech_id as unknown as string,
          reference_type: "profile",
          title: `Tech unresponsive: ${techName}`,
          description: `${techName} has not completed a stop in ${inactiveMinutes} minutes. Last activity: ${lastActivity.toLocaleTimeString()}.`,
          metadata: {
            tech_id: tech.tech_id,
            tech_name: techName,
            last_activity_at: lastActivity.toISOString(),
            inactive_minutes: inactiveMinutes,
            escalation_steps_fired: [],
          } satisfies SafetyAlertMetadata,
        })
        .returning({ id: alerts.id })

      alertId = newAlert.id
      alertsCreated++
    } else {
      alertId = existingAlert.id
      const meta = existingAlert.metadata as SafetyAlertMetadata | null
      stepsFired = meta?.escalation_steps_fired ?? []
    }

    // Fire escalation steps based on elapsed time since alert was generated
    const alertAge = existingAlert
      ? Math.floor(
          (now.getTime() - existingAlert.generated_at.getTime()) / (1000 * 60)
        )
      : 0 // New alert — step 0 should fire

    let newStepsFired = [...stepsFired]
    let escalated = false

    for (let stepIndex = 0; stepIndex < escalationChain.length; stepIndex++) {
      const step = escalationChain[stepIndex]

      // Skip if already fired
      if (stepsFired.includes(stepIndex)) continue

      // Fire if enough time has passed since alert creation
      if (alertAge >= step.delay_minutes) {
        const recipients = await resolveEscalationRecipients(orgId, step)

        for (const recipientId of recipients) {
          await notifyUser(recipientId, orgId, {
            type: "system_event",
            urgency: "needs_action",
            title: `Tech unresponsive: ${techName}`,
            body: `${techName} has been inactive for ${inactiveMinutes} min. Tap to view route.`,
            link: `/dispatch`,
            metadata: {
              alert_id: alertId,
              tech_id: tech.tech_id,
              inactive_minutes: inactiveMinutes,
            },
          })
        }

        newStepsFired = [...newStepsFired, stepIndex]
        escalated = true
      }
    }

    // Update alert metadata with fired steps
    if (escalated) {
      await adminDb
        .update(alerts)
        .set({
          metadata: {
            tech_id: tech.tech_id,
            tech_name: techName,
            last_activity_at: lastActivity.toISOString(),
            inactive_minutes: inactiveMinutes,
            escalation_steps_fired: newStepsFired,
          } satisfies SafetyAlertMetadata,
        })
        .where(eq(alerts.id, alertId))

      alertsEscalated++
    }
  }

  return {
    checked: activeTechs.length,
    alertsCreated,
    alertsEscalated,
  }
}

// ---------------------------------------------------------------------------
// dismissSafetyAlert
// ---------------------------------------------------------------------------

/**
 * Tech dismisses a safety alert (false positive — e.g., was on lunch).
 * Updates the alert with dismissed_at and notifies the escalation chain
 * that the tech is OK.
 */
export async function dismissSafetyAlert(
  alertId: string
): Promise<{ success: boolean; error?: string }> {
  const supabase = await createClient()
  const { data: claimsData } = await supabase.auth.getClaims()
  if (!claimsData?.claims) return { success: false, error: "Not authenticated" }

  const token = claimsData.claims as SupabaseToken
  const userId = token.sub as string
  const orgId = token.org_id as string

  if (!alertId) return { success: false, error: "Alert ID required" }

  try {
    // Fetch the alert (use adminDb — tech has no SELECT access to alerts via RLS)
    const [alert] = await adminDb
      .select()
      .from(alerts)
      .where(and(eq(alerts.id, alertId), eq(alerts.org_id, orgId)))
      .limit(1)

    if (!alert) return { success: false, error: "Alert not found" }
    if (alert.dismissed_at) return { success: false, error: "Alert already dismissed" }

    const meta = alert.metadata as SafetyAlertMetadata | null
    const techName = meta?.tech_name ?? "the tech"

    // Mark dismissed
    await adminDb
      .update(alerts)
      .set({ dismissed_at: new Date() })
      .where(eq(alerts.id, alertId))

    // Notify the escalation chain that the tech is OK
    const [settings] = await adminDb
      .select({ safety_escalation_chain: orgSettings.safety_escalation_chain })
      .from(orgSettings)
      .where(eq(orgSettings.org_id, orgId))
      .limit(1)

    const escalationChain: EscalationStep[] =
      (settings?.safety_escalation_chain as EscalationStep[] | null) ?? [
        { role: "owner", delay_minutes: 0 },
      ]

    // Notify everyone in the chain that the tech confirmed they're OK
    for (const step of escalationChain) {
      const recipients = await resolveEscalationRecipients(orgId, step)
      for (const recipientId of recipients) {
        // Don't notify the tech themselves
        if (recipientId === userId) continue
        await notifyUser(recipientId, orgId, {
          type: "system_event",
          urgency: "informational",
          title: `${techName} is OK`,
          body: `${techName} dismissed the safety alert — they confirmed they are safe.`,
          link: `/dispatch`,
        })
      }
    }

    return { success: true }
  } catch (err) {
    console.error("[dismissSafetyAlert] Error:", err)
    return {
      success: false,
      error: err instanceof Error ? err.message : "Failed to dismiss alert",
    }
  }
}
