"use server"

/**
 * ETA notification actions — compute and dispatch ETA notifications.
 *
 * ETA delivery rules (per user decisions):
 * - Route start: send 'initial' ETA SMS to all customers on the route.
 * - 2-3 stops away: send 'refined' ETA SMS.
 * - Auto-update: send 'update' if ETA shifts 15+ min, capped at 2 updates per visit.
 *
 * SMS template types:
 * - eta_initial_sms: Sent once at route start.
 * - eta_update_sms: Sent when ETA shifts 15+ min (max 2 per visit).
 */

import { adminDb } from "@/lib/db"
import {
  routeStops,
  customers,
  pools,
  profiles,
  orgSettings,
  notificationTemplates,
  orgs,
} from "@/lib/db/schema"
import { and, eq, inArray, ne } from "drizzle-orm"
import { computeEta, type EtaStop } from "@/lib/eta/calculator"

// ─── Types ────────────────────────────────────────────────────────────────────

export interface EtaStopResult {
  stopId: string
  customerId: string
  customerName: string
  poolName: string | null
  etaMinutes: number
  etaTime: Date
}

// ─── Default SMS templates ────────────────────────────────────────────────────

const DEFAULT_ETA_INITIAL_SMS =
  "{{company_name}}: Your pool tech {{tech_name}} has started their route. Estimated arrival: {{eta_time}}."

const DEFAULT_ETA_UPDATE_SMS =
  "{{company_name}}: Updated arrival time: {{eta_time}} (was {{previous_eta_time}}). {{tech_name}} is on the way."

// ─── Template helpers ─────────────────────────────────────────────────────────

/**
 * resolveEtaTemplate — fetch org-customized SMS template or fall back to default.
 * Uses adminDb (no user session required for notification sends).
 */
async function resolveEtaTemplate(
  orgId: string,
  templateType: "eta_initial_sms" | "eta_update_sms"
): Promise<{ smsText: string; enabled: boolean }> {
  const [row] = await adminDb
    .select({
      sms_text: notificationTemplates.sms_text,
      enabled: notificationTemplates.enabled,
    })
    .from(notificationTemplates)
    .where(
      and(
        eq(notificationTemplates.org_id, orgId),
        eq(notificationTemplates.template_type, templateType)
      )
    )
    .limit(1)

  if (row) {
    return {
      smsText: row.sms_text ?? (templateType === "eta_initial_sms" ? DEFAULT_ETA_INITIAL_SMS : DEFAULT_ETA_UPDATE_SMS),
      enabled: row.enabled,
    }
  }

  return {
    smsText: templateType === "eta_initial_sms" ? DEFAULT_ETA_INITIAL_SMS : DEFAULT_ETA_UPDATE_SMS,
    enabled: true,
  }
}

/** Format a Date as "HH:MM AM/PM" for SMS merge tags. */
function formatEtaTime(date: Date): string {
  return date.toLocaleTimeString("en-US", {
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
  })
}

/** Replace merge tags in template text. */
function applyMergeTags(template: string, tags: Record<string, string>): string {
  let result = template
  for (const [key, value] of Object.entries(tags)) {
    result = result.replaceAll(`{{${key}}}`, value)
  }
  return result
}

// ─── computeRouteEtas ─────────────────────────────────────────────────────────

/**
 * computeRouteEtas — compute ETA for each uncompleted stop on a tech's route.
 *
 * Uses adminDb (no RLS) with explicit org_id + tech_id guards.
 * Requires techPosition to be provided by the caller (from GPS broadcast or cached).
 *
 * Returns array of EtaStopResult in route order.
 */
export async function computeRouteEtas(
  orgId: string,
  techId: string,
  date: string,
  techPosition: { lat: number; lng: number }
): Promise<EtaStopResult[]> {
  // Fetch today's route stops for this tech (uncompleted only)
  const stopRows = await adminDb
    .select({
      id: routeStops.id,
      customer_id: routeStops.customer_id,
      pool_id: routeStops.pool_id,
      sort_index: routeStops.sort_index,
      status: routeStops.status,
    })
    .from(routeStops)
    .where(
      and(
        eq(routeStops.org_id, orgId),
        eq(routeStops.tech_id, techId),
        eq(routeStops.scheduled_date, date)
      )
    )

  if (stopRows.length === 0) return []

  // Separate remaining (uncompleted, unskipped) stops
  const remainingStops = stopRows
    .filter((s) => s.status !== "complete" && s.status !== "skipped" && s.status !== "holiday")
    .sort((a, b) => a.sort_index - b.sort_index)

  if (remainingStops.length === 0) return []

  // Fetch customer + pool data in parallel (two-query pattern — no correlated subqueries)
  const customerIds = [...new Set(remainingStops.map((s) => s.customer_id))]
  const poolIds = [...new Set(remainingStops.flatMap((s) => (s.pool_id ? [s.pool_id] : [])))]

  const [customerRows, poolRows] = await Promise.all([
    adminDb
      .select({ id: customers.id, full_name: customers.full_name, lat: customers.lat, lng: customers.lng })
      .from(customers)
      .where(inArray(customers.id, customerIds)),
    poolIds.length > 0
      ? adminDb
          .select({ id: pools.id, name: pools.name })
          .from(pools)
          .where(inArray(pools.id, poolIds))
      : Promise.resolve([]),
  ])

  const customerMap = new Map(customerRows.map((c) => [c.id, c]))
  const poolMap = new Map(poolRows.map((p) => [p.id, p]))

  // Build EtaStop[] — only include stops with geocoded coordinates
  const etaStops: EtaStop[] = []
  for (const stop of remainingStops) {
    const customer = customerMap.get(stop.customer_id)
    if (!customer?.lat || !customer?.lng) continue

    etaStops.push({
      id: stop.id,
      poolId: stop.pool_id,
      customerName: customer.full_name,
      lat: customer.lat,
      lng: customer.lng,
      serviceDurationSeconds: 25 * 60, // default 25 min; could be enriched from history
    })
  }

  if (etaStops.length === 0) return []

  // Compute ETAs
  const etaMap = computeEta(techPosition, etaStops)

  // Build result array
  return etaStops.flatMap((stop) => {
    const eta = etaMap.get(stop.id)
    if (!eta) return []
    const customer = customerMap.get(
      remainingStops.find((s) => s.id === stop.id)?.customer_id ?? ""
    )
    const poolId = remainingStops.find((s) => s.id === stop.id)?.pool_id
    return [
      {
        stopId: stop.id,
        customerId: remainingStops.find((s) => s.id === stop.id)?.customer_id ?? "",
        customerName: stop.customerName,
        poolName: poolId ? (poolMap.get(poolId)?.name ?? null) : null,
        etaMinutes: eta.etaMinutes,
        etaTime: eta.etaTime,
      },
    ]
  })
}

// ─── sendEtaNotification ──────────────────────────────────────────────────────

/**
 * sendEtaNotification — send an ETA SMS notification to a customer for a stop.
 *
 * Enforcement rules:
 * - 'update' type: skip if eta_sms_count >= 2 (capped at 2 updates per user decision).
 * - 'update' type: skip if shift < 15 minutes from previous ETA.
 * - Disabled template: skip.
 *
 * Non-blocking — failure must never roll back the originating mutation.
 */
export async function sendEtaNotification(
  stopId: string,
  orgId: string,
  etaMinutes: number,
  etaTime: Date,
  notificationType: "initial" | "refined" | "update"
): Promise<{ sent: boolean; reason?: string }> {
  try {
    // Fetch stop + customer + tech + org data in parallel
    const [stopRow] = await adminDb
      .select({
        id: routeStops.id,
        customer_id: routeStops.customer_id,
        tech_id: routeStops.tech_id,
        eta_sms_count: routeStops.eta_sms_count,
        eta_previous_minutes: routeStops.eta_previous_minutes,
      })
      .from(routeStops)
      .where(eq(routeStops.id, stopId))
      .limit(1)

    if (!stopRow) return { sent: false, reason: "Stop not found" }

    const smsCount = stopRow.eta_sms_count ?? 0
    const previousEtaMinutes = stopRow.eta_previous_minutes

    // Cap check: 'update' notifications are capped at 2 per visit
    if (notificationType === "update" && smsCount >= 2) {
      return { sent: false, reason: "ETA update cap reached (max 2 updates per visit)" }
    }

    // Shift check: 'update' only if ETA changed by 15+ minutes
    if (notificationType === "update" && previousEtaMinutes !== null && previousEtaMinutes !== undefined) {
      const shift = Math.abs(etaMinutes - previousEtaMinutes)
      if (shift < 15) {
        return { sent: false, reason: `ETA shift (${shift} min) below 15-minute threshold` }
      }
    }

    // Resolve template
    const templateType =
      notificationType === "initial" || notificationType === "refined"
        ? ("eta_initial_sms" as const)
        : ("eta_update_sms" as const)

    const template = await resolveEtaTemplate(orgId, templateType)
    if (!template.enabled) return { sent: false, reason: "ETA notifications disabled" }

    // Fetch customer phone, tech name, company name
    const [customerRow] = await adminDb
      .select({ phone: customers.phone, full_name: customers.full_name })
      .from(customers)
      .where(eq(customers.id, stopRow.customer_id))
      .limit(1)

    if (!customerRow?.phone) return { sent: false, reason: "Customer has no phone number" }

    // Fetch tech name (may be null if tech_id is null)
    let techName = "Your tech"
    if (stopRow.tech_id) {
      const [techRow] = await adminDb
        .select({ full_name: profiles.full_name })
        .from(profiles)
        .where(eq(profiles.id, stopRow.tech_id))
        .limit(1)
      if (techRow?.full_name) techName = techRow.full_name
    }

    // Fetch company name
    const [orgRow] = await adminDb
      .select({ name: orgs.name })
      .from(orgs)
      .where(eq(orgs.id, orgId))
      .limit(1)
    const companyName = orgRow?.name ?? "Your pool company"

    // Merge tags
    const previousEtaDate = previousEtaMinutes != null
      ? new Date(Date.now() + previousEtaMinutes * 60 * 1000)
      : null

    const smsText = applyMergeTags(template.smsText, {
      company_name: companyName,
      tech_name: techName,
      customer_name: customerRow.full_name,
      eta_time: formatEtaTime(etaTime),
      eta_minutes: String(etaMinutes),
      previous_eta_time: previousEtaDate ? formatEtaTime(previousEtaDate) : "unknown",
    })

    // Send via Edge Function (same pattern as pre-arrival SMS)
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
    const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY
    if (supabaseUrl && serviceRoleKey) {
      const edgeFnUrl = `${supabaseUrl}/functions/v1/send-pre-arrival`
      await fetch(edgeFnUrl, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${serviceRoleKey}`,
        },
        body: JSON.stringify({
          phone: customerRow.phone,
          message: smsText,
        }),
      }).catch((err) => {
        // Non-fatal — log but don't throw
        console.error("[sendEtaNotification] SMS send error:", err)
      })
    }

    // Update eta_sms_count and eta_previous_minutes on the stop
    const newCount = notificationType === "update" ? smsCount + 1 : smsCount
    await adminDb
      .update(routeStops)
      .set({
        eta_sms_count: newCount,
        eta_previous_minutes: etaMinutes,
        updated_at: new Date(),
      })
      .where(eq(routeStops.id, stopId))

    return { sent: true }
  } catch (error) {
    console.error("[sendEtaNotification] Error:", error)
    return { sent: false, reason: "Internal error" }
  }
}

// ─── triggerEtaNotifications ──────────────────────────────────────────────────

/**
 * triggerEtaNotifications — called at route start and on stop completion.
 *
 * Computes ETAs for remaining stops and sends appropriate notifications:
 * - Route start: 'initial' ETA to all customers.
 * - After stop completion: 'refined' for customers 2-3 stops away, 'update' for farther customers.
 *
 * techPosition must be provided by the caller (from GPS or estimated).
 * Non-blocking by design — failures log but never throw.
 */
export async function triggerEtaNotifications(
  orgId: string,
  techId: string,
  date: string,
  techPosition: { lat: number; lng: number },
  trigger: "route_start" | "stop_complete"
): Promise<void> {
  try {
    const etas = await computeRouteEtas(orgId, techId, date, techPosition)
    if (etas.length === 0) return

    for (let i = 0; i < etas.length; i++) {
      const eta = etas[i]
      if (!eta) continue

      let notificationType: "initial" | "refined" | "update"

      if (trigger === "route_start") {
        // At route start: send initial ETA to all remaining stops
        notificationType = "initial"
      } else {
        // After stop completion: 'refined' for customers 2-3 stops away (indices 0, 1)
        // 'update' for farther customers (to respect the cap)
        notificationType = i <= 1 ? "refined" : "update"
      }

      // Fire-and-forget — non-blocking per MEMORY.md notification pattern
      sendEtaNotification(
        eta.stopId,
        orgId,
        eta.etaMinutes,
        eta.etaTime,
        notificationType
      ).catch((err) => {
        console.error("[triggerEtaNotifications] sendEtaNotification error:", err)
      })
    }
  } catch (error) {
    console.error("[triggerEtaNotifications] Error:", error)
  }
}
