"use server"

import { createClient } from "@/lib/supabase/server"
import { withRls } from "@/lib/db"
import type { SupabaseToken } from "@/lib/db"
import { routeStops, customers, profiles } from "@/lib/db/schema"
import { and, eq, isNull, inArray } from "drizzle-orm"

// ─── Types ────────────────────────────────────────────────────────────────────

interface PreArrivalStop {
  stopId: string
  customerName: string
  customerPhone: string | null
  customerEmail: string | null
  stopNumber: number
  notificationsEnabled: true
}

interface SendPreArrivalResult {
  sent: number
  error?: string
}

// ─── Helper ───────────────────────────────────────────────────────────────────

async function getRlsToken(): Promise<SupabaseToken | null> {
  const supabase = await createClient()
  const { data: claimsData } = await supabase.auth.getClaims()
  if (!claimsData?.claims) return null
  return claimsData.claims as SupabaseToken
}

// ─── sendPreArrivalNotifications ──────────────────────────────────────────────

/**
 * sendPreArrivalNotifications — fires pre-arrival SMS/email for all eligible
 * customers on the given tech's route today.
 *
 * Eligibility criteria:
 * - notifications_enabled = true on the customer row
 * - At least one contact channel (phone OR email)
 * - pre_arrival_sent_at IS NULL (idempotency — skip already-notified stops)
 * - stop.status IN ('scheduled', 'in_progress')
 *
 * Uses LEFT JOIN pattern throughout per MEMORY.md RLS pitfall guidance:
 * no correlated subqueries inside withRls transactions.
 *
 * Invokes the `send-pre-arrival` Supabase Edge Function which handles
 * Twilio SMS (primary) and Resend email (fallback).
 *
 * @param techId - UUID of the tech whose route to notify for
 * @returns { sent: number } count of stops that notification was requested for
 */
export async function sendPreArrivalNotifications(
  techId: string
): Promise<SendPreArrivalResult> {
  const token = await getRlsToken()
  if (!token) return { sent: 0, error: "Not authenticated" }

  const orgId = token.org_id as string | undefined
  if (!orgId) return { sent: 0, error: "Invalid token — no org_id" }

  const today = new Date().toISOString().split("T")[0]

  try {
    // ── 1. Query today's eligible route stops (LEFT JOIN — no correlated subquery) ──
    //
    // Pull stop rows for this tech today, then join customers separately.
    // This avoids correlated subquery anti-pattern from MEMORY.md.
    const stopRows = await withRls(token, async (db) => {
      // Step A: fetch route_stops for this tech today
      const stops = await db
        .select({
          id: routeStops.id,
          customer_id: routeStops.customer_id,
          sort_index: routeStops.sort_index,
          status: routeStops.status,
          pre_arrival_sent_at: routeStops.pre_arrival_sent_at,
        })
        .from(routeStops)
        .where(
          and(
            eq(routeStops.org_id, orgId),
            eq(routeStops.tech_id, techId),
            eq(routeStops.scheduled_date, today),
            isNull(routeStops.pre_arrival_sent_at) // idempotency
          )
        )
        .orderBy(routeStops.sort_index)

      // Filter to only scheduled or in_progress stops
      const activeStops = stops.filter(
        (s) => s.status === "scheduled" || s.status === "in_progress"
      )

      if (activeStops.length === 0) return []

      // Step B: fetch customers for these stops via LEFT JOIN (batch, not per-row)
      const customerIds = activeStops.map((s) => s.customer_id)

      const customerRows = await db
        .select({
          id: customers.id,
          full_name: customers.full_name,
          phone: customers.phone,
          email: customers.email,
          notifications_enabled: customers.notifications_enabled,
        })
        .from(customers)
        .where(
          and(
            eq(customers.org_id, orgId),
            inArray(customers.id, customerIds)
          )
        )

      const customerMap = new Map(customerRows.map((c) => [c.id, c]))

      // Step C: join in JS — filter for notification eligibility
      return activeStops
        .map((stop) => {
          const customer = customerMap.get(stop.customer_id)
          if (!customer) return null
          if (!customer.notifications_enabled) return null
          if (!customer.phone && !customer.email) return null

          return {
            stopId: stop.id,
            customerName: customer.full_name,
            phone: customer.phone,
            email: customer.email,
            sortIndex: stop.sort_index,
          }
        })
        .filter(Boolean) as Array<{
        stopId: string
        customerName: string
        phone: string | null
        email: string | null
        sortIndex: number
      }>
    })

    if (stopRows.length === 0) {
      return { sent: 0 }
    }

    // ── 2. Fetch tech's display name ───────────────────────────────────────────
    const techName = await withRls(token, async (db) => {
      const profileRows = await db
        .select({ full_name: profiles.full_name })
        .from(profiles)
        .where(eq(profiles.id, techId))
        .limit(1)

      return profileRows[0]?.full_name ?? "Your pool tech"
    })

    // ── 3. Build payload for Edge Function ─────────────────────────────────────
    const stopsPayload: PreArrivalStop[] = stopRows.map((stop) => ({
      stopId: stop.stopId,
      customerName: stop.customerName,
      customerPhone: stop.phone,
      customerEmail: stop.email,
      stopNumber: stop.sortIndex,
      notificationsEnabled: true,
    }))

    // ── 4. Invoke send-pre-arrival Edge Function ────────────────────────────────
    const supabase = await createClient()
    const { error: fnError } = await supabase.functions.invoke("send-pre-arrival", {
      body: {
        orgId,
        techName,
        stops: stopsPayload,
      },
    })

    if (fnError) {
      console.error("[sendPreArrivalNotifications] Edge Function error:", fnError)
      return { sent: 0, error: fnError.message ?? "Edge Function invocation failed" }
    }

    return { sent: stopsPayload.length }
  } catch (err) {
    console.error("[sendPreArrivalNotifications] Error:", err)
    return {
      sent: 0,
      error: err instanceof Error ? err.message : "Unknown error",
    }
  }
}

// ─── startRoute ───────────────────────────────────────────────────────────────

/**
 * startRoute — called when a tech taps "Start Route" from their daily route view.
 *
 * Sends pre-arrival notifications to all eligible customers on today's route.
 * The Edge Function handles SMS (primary) and email (fallback) per stop, and
 * stamps pre_arrival_sent_at on each stop row for idempotency.
 *
 * Calling startRoute a second time is safe — the idempotency check in
 * sendPreArrivalNotifications filters out stops that already have
 * pre_arrival_sent_at set.
 *
 * @returns { sent: number } — count of customers notified (0 if all opted out)
 */
export async function startRoute(): Promise<SendPreArrivalResult> {
  const token = await getRlsToken()
  if (!token) return { sent: 0, error: "Not authenticated" }

  const techId = token.sub
  if (!techId) return { sent: 0, error: "Invalid token — no sub" }

  return sendPreArrivalNotifications(techId)
}
