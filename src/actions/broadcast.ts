"use server"

/**
 * broadcast.ts -- Broadcast messaging server actions.
 *
 * Owner sends bulk email/SMS to all customers or filtered segments.
 * Supports:
 *   - All active customers (notifications_enabled = true)
 *   - Customers on a specific tech's route (have at least one route_stop assigned to that tech)
 *   - All customers (including inactive/paused)
 *   - Specific customers (by ID list)
 *
 * Delivery:
 *   - Email: Resend SDK (direct API, same as invoices.ts pattern)
 *   - SMS: Supabase Edge Function (send-invoice-sms with customText)
 *
 * History:
 *   - Stored as JSONB array in org_settings.broadcast_history (last 10 entries)
 *   - No complex queries needed — avoids a separate DB table
 *
 * Security:
 *   - All actions are owner-only (JWT user_role check)
 *   - adminDb used for segment queries (no user session needed for batch ops)
 */

import { createClient } from "@/lib/supabase/server"
import { adminDb, getRlsToken } from "@/lib/db"
import type { SupabaseToken } from "@/lib/db"
import { customers, profiles, routeStops, orgSettings, orgs } from "@/lib/db/schema"
import { eq, and, inArray, gte } from "drizzle-orm"
import { resolveTemplate } from "@/lib/notifications/template-engine"
import { Resend } from "resend"
import { toLocalDateString } from "@/lib/date-utils"

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type BroadcastSegment =
  | { type: "all" }
  | { type: "active" }
  | { type: "tech_route"; techId: string }
  | { type: "individual"; customerIds: string[] }

export interface BroadcastResult {
  totalTargeted: number
  emailSent: number
  emailFailed: number
  smsSent: number
  smsFailed: number
}

export interface BroadcastHistoryEntry {
  id: string
  sent_at: string
  segment_type: string
  segment_label: string
  channels: string[]
  subject: string
  total_targeted: number
  email_sent: number
  email_failed: number
  sms_sent: number
  sms_failed: number
}

interface SegmentCount {
  count: number
  hasEmail: number
  hasPhone: number
}

interface CustomerRow {
  id: string
  full_name: string
  email: string | null
  phone: string | null
}

// ---------------------------------------------------------------------------
// Auth helper
// ---------------------------------------------------------------------------


// ---------------------------------------------------------------------------
// getSegmentCustomers — internal helper to fetch customers for a segment
// ---------------------------------------------------------------------------

/**
 * Returns customers matching a BroadcastSegment.
 * Uses adminDb with explicit org_id filter (no RLS needed — owner action).
 */
async function getSegmentCustomers(
  orgId: string,
  segment: BroadcastSegment
): Promise<CustomerRow[]> {
  // Base select for all segments
  const baseSelect = {
    id: customers.id,
    full_name: customers.full_name,
    email: customers.email,
    phone: customers.phone,
  }

  if (segment.type === "all") {
    // All customers in org regardless of status
    return adminDb
      .select(baseSelect)
      .from(customers)
      .where(eq(customers.org_id, orgId))
  }

  if (segment.type === "active") {
    // Customers with notifications_enabled = true and status = 'active'
    return adminDb
      .select(baseSelect)
      .from(customers)
      .where(
        and(
          eq(customers.org_id, orgId),
          eq(customers.status, "active"),
          eq(customers.notifications_enabled, true)
        )
      )
  }

  if (segment.type === "tech_route") {
    // Customers assigned to a specific tech's routes
    // Two-query pattern (MEMORY.md — no correlated subqueries)
    const thirtyDaysAgo = new Date()
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30)
    const thirtyDaysAgoStr = toLocalDateString(thirtyDaysAgo)

    const stopRows = await adminDb
      .select({ customer_id: routeStops.customer_id })
      .from(routeStops)
      .where(
        and(
          eq(routeStops.org_id, orgId),
          eq(routeStops.tech_id, segment.techId),
          gte(routeStops.scheduled_date, thirtyDaysAgoStr)
        )
      )

    const customerIds = [...new Set(stopRows.map((r) => r.customer_id))]

    if (customerIds.length === 0) return []

    return adminDb
      .select(baseSelect)
      .from(customers)
      .where(
        and(
          eq(customers.org_id, orgId),
          inArray(customers.id, customerIds)
        )
      )
  }

  if (segment.type === "individual") {
    if (segment.customerIds.length === 0) return []

    return adminDb
      .select(baseSelect)
      .from(customers)
      .where(
        and(
          eq(customers.org_id, orgId),
          inArray(customers.id, segment.customerIds)
        )
      )
  }

  return []
}

// ---------------------------------------------------------------------------
// getSegmentLabel — human-readable label for a segment
// ---------------------------------------------------------------------------

async function getSegmentLabel(
  orgId: string,
  segment: BroadcastSegment
): Promise<string> {
  if (segment.type === "all") return "All Customers"
  if (segment.type === "active") return "All Active Customers"
  if (segment.type === "individual") {
    return `${segment.customerIds.length} specific customer${segment.customerIds.length !== 1 ? "s" : ""}`
  }
  if (segment.type === "tech_route") {
    const techRows = await adminDb
      .select({ full_name: profiles.full_name })
      .from(profiles)
      .where(eq(profiles.id, segment.techId))
      .limit(1)
    const techName = techRows[0]?.full_name ?? "Unknown Tech"
    return `Customers on ${techName}'s route`
  }
  return "Unknown Segment"
}

// ---------------------------------------------------------------------------
// getSegmentCount
// ---------------------------------------------------------------------------

/**
 * Returns the count of customers matching the segment, plus how many have
 * email and phone. Used for preview before send.
 *
 * Owner-only.
 */
export async function getSegmentCount(
  segment: BroadcastSegment
): Promise<{ count: number; hasEmail: number; hasPhone: number } | { error: string }> {
  const token = await getRlsToken()
  if (!token) return { error: "Not authenticated" }

  const orgId = token.org_id as string | undefined
  if (!orgId) return { error: "Invalid token — no org_id" }

  const userRole = token.user_role as string | undefined
  if (userRole !== "owner") return { error: "Owner access required" }

  try {
    const segmentCustomers = await getSegmentCustomers(orgId, segment)

    const hasEmail = segmentCustomers.filter((c) => c.email && c.email.trim()).length
    const hasPhone = segmentCustomers.filter((c) => c.phone && c.phone.trim()).length

    return {
      count: segmentCustomers.length,
      hasEmail,
      hasPhone,
    }
  } catch (err) {
    console.error("[getSegmentCount] Error:", err)
    return {
      error: err instanceof Error ? err.message : "Failed to count customers",
    }
  }
}

// ---------------------------------------------------------------------------
// sendBroadcast
// ---------------------------------------------------------------------------

/**
 * Sends a broadcast message to all customers in the given segment.
 *
 * Owner-only.
 *
 * Process:
 * 1. Validate owner role
 * 2. Query customers matching segment
 * 3. Load org name for merge tags
 * 4. Send in batches of 50 (email + SMS per customer)
 * 5. Store result in org_settings.broadcast_history (last 10 entries)
 * 6. Return delivery summary
 */
export async function sendBroadcast(params: {
  segment: BroadcastSegment
  subject: string
  bodyHtml: string
  smsText: string
  channels: ("email" | "sms")[]
}): Promise<BroadcastResult | { error: string }> {
  const token = await getRlsToken()
  if (!token) return { error: "Not authenticated" }

  const orgId = token.org_id as string | undefined
  if (!orgId) return { error: "Invalid token — no org_id" }

  const userRole = token.user_role as string | undefined
  if (userRole !== "owner") return { error: "Owner access required" }

  const { segment, subject, bodyHtml, smsText, channels } = params

  if (channels.length === 0) {
    return { error: "At least one channel (email or SMS) must be selected" }
  }

  const doEmail = channels.includes("email")
  const doSms = channels.includes("sms")

  try {
    // 1. Fetch customers for segment
    const segmentCustomers = await getSegmentCustomers(orgId, segment)

    if (segmentCustomers.length === 0) {
      return {
        totalTargeted: 0,
        emailSent: 0,
        emailFailed: 0,
        smsSent: 0,
        smsFailed: 0,
      }
    }

    // 2. Fetch org name for merge tags
    const orgRows = await adminDb
      .select({ name: orgs.name })
      .from(orgs)
      .where(eq(orgs.id, orgId))
      .limit(1)
    const companyName = orgRows[0]?.name ?? ""

    // 3. Setup Resend SDK
    const resendApiKey = process.env.RESEND_API_KEY
    const isDev = process.env.NODE_ENV === "development"

    const resend = resendApiKey ? new Resend(resendApiKey) : null

    // 4. Setup Supabase client for SMS Edge Function
    const supabase = await createClient()

    // 5. Process in batches of 50
    const BATCH_SIZE = 50
    let emailSent = 0
    let emailFailed = 0
    let smsSent = 0
    let smsFailed = 0

    for (let i = 0; i < segmentCustomers.length; i += BATCH_SIZE) {
      const batch = segmentCustomers.slice(i, i + BATCH_SIZE)

      const batchResults = await Promise.allSettled(
        batch.map(async (customer) => {
          const context: Record<string, string> = {
            customer_name: customer.full_name,
            company_name: companyName,
          }

          // Resolve merge tags per customer
          const resolvedBody = resolveTemplate(bodyHtml, context)
          const resolvedSms = resolveTemplate(smsText, context)
          const resolvedSubject = resolveTemplate(subject, context)

          const customerResults = { emailSent: false, smsSent: false }

          // ── Email ──────────────────────────────────────────────────────
          if (doEmail && customer.email && customer.email.trim()) {
            try {
              if (!resend) {
                if (isDev) {
                  console.log(`[broadcast] DEV email to ${customer.email}: ${resolvedSubject}`)
                  customerResults.emailSent = true
                } else {
                  // Non-fatal — count as failed
                  console.error("[sendBroadcast] RESEND_API_KEY not configured")
                }
              } else {
                const fromAddress = isDev
                  ? "DeweyIQ <onboarding@resend.dev>"
                  : `${companyName} <no-reply@deweyiq.app>`
                const toAddress = isDev ? "delivered@resend.dev" : customer.email

                const { error: resendError } = await resend.emails.send({
                  from: fromAddress,
                  to: [toAddress],
                  subject: resolvedSubject,
                  html: resolvedBody,
                })

                if (resendError) {
                  console.error(
                    `[sendBroadcast] Email failed for ${customer.email}:`,
                    resendError
                  )
                } else {
                  customerResults.emailSent = true
                }
              }
            } catch (emailErr) {
              console.error(`[sendBroadcast] Email exception for ${customer.email}:`, emailErr)
            }
          }

          // ── SMS ────────────────────────────────────────────────────────
          if (doSms && customer.phone && customer.phone.trim()) {
            try {
              if (isDev) {
                console.log(`[broadcast] DEV SMS to ${customer.phone}: ${resolvedSms}`)
                customerResults.smsSent = true
              } else {
                const { error: smsError } = await supabase.functions.invoke(
                  "send-invoice-sms",
                  {
                    body: {
                      phone: customer.phone,
                      companyName,
                      type: "invoice", // Required field — customText overrides the message
                      customText: resolvedSms,
                    },
                  }
                )

                if (smsError) {
                  console.error(
                    `[sendBroadcast] SMS failed for ${customer.phone}:`,
                    smsError
                  )
                } else {
                  customerResults.smsSent = true
                }
              }
            } catch (smsErr) {
              console.error(`[sendBroadcast] SMS exception for ${customer.phone}:`, smsErr)
            }
          }

          return customerResults
        })
      )

      // Tally results
      for (const result of batchResults) {
        if (result.status === "fulfilled") {
          if (result.value.emailSent) emailSent++
          else if (doEmail && batch[batchResults.indexOf(result)]?.email) emailFailed++
          if (result.value.smsSent) smsSent++
          else if (doSms && batch[batchResults.indexOf(result)]?.phone) smsFailed++
        } else {
          // Promise itself rejected (shouldn't happen with inner try/catch)
          if (doEmail) emailFailed++
          if (doSms) smsFailed++
        }
      }
    }

    const deliveryResult: BroadcastResult = {
      totalTargeted: segmentCustomers.length,
      emailSent,
      emailFailed,
      smsSent,
      smsFailed,
    }

    // 6. Store broadcast in org_settings.broadcast_history (last 10)
    try {
      const segmentLabel = await getSegmentLabel(orgId, segment)

      const historyEntry: BroadcastHistoryEntry = {
        id: crypto.randomUUID(),
        sent_at: new Date().toISOString(),
        segment_type: segment.type,
        segment_label: segmentLabel,
        channels,
        subject,
        total_targeted: segmentCustomers.length,
        email_sent: emailSent,
        email_failed: emailFailed,
        sms_sent: smsSent,
        sms_failed: smsFailed,
      }

      // Fetch current history
      const settingsRows = await adminDb
        .select({ broadcast_history: orgSettings.broadcast_history })
        .from(orgSettings)
        .where(eq(orgSettings.org_id, orgId))
        .limit(1)

      const currentHistory = settingsRows[0]?.broadcast_history ?? []
      const updatedHistory = [historyEntry, ...currentHistory].slice(0, 10)

      await adminDb
        .update(orgSettings)
        .set({ broadcast_history: updatedHistory, updated_at: new Date() })
        .where(eq(orgSettings.org_id, orgId))
    } catch (historyErr) {
      // Non-fatal — delivery already happened
      console.error("[sendBroadcast] Failed to save broadcast history:", historyErr)
    }

    return deliveryResult
  } catch (err) {
    console.error("[sendBroadcast] Error:", err)
    return {
      error: err instanceof Error ? err.message : "Broadcast failed",
    }
  }
}

// ---------------------------------------------------------------------------
// getBroadcastHistory
// ---------------------------------------------------------------------------

/**
 * Returns the last 10 broadcasts for the org.
 * Owner-only.
 */
export async function getBroadcastHistory(): Promise<
  BroadcastHistoryEntry[] | { error: string }
> {
  const token = await getRlsToken()
  if (!token) return { error: "Not authenticated" }

  const orgId = token.org_id as string | undefined
  if (!orgId) return { error: "Invalid token — no org_id" }

  const userRole = token.user_role as string | undefined
  if (userRole !== "owner") return { error: "Owner access required" }

  try {
    const rows = await adminDb
      .select({ broadcast_history: orgSettings.broadcast_history })
      .from(orgSettings)
      .where(eq(orgSettings.org_id, orgId))
      .limit(1)

    return rows[0]?.broadcast_history ?? []
  } catch (err) {
    console.error("[getBroadcastHistory] Error:", err)
    return {
      error: err instanceof Error ? err.message : "Failed to fetch broadcast history",
    }
  }
}

// ---------------------------------------------------------------------------
// getTechProfilesForBroadcast
// ---------------------------------------------------------------------------

/**
 * Returns tech profiles for the org — used to populate the tech selector
 * in the broadcast UI. Owner-only.
 */
export async function getTechProfilesForBroadcast(): Promise<
  Array<{ id: string; fullName: string }> | { error: string }
> {
  const token = await getRlsToken()
  if (!token) return { error: "Not authenticated" }

  const orgId = token.org_id as string | undefined
  if (!orgId) return { error: "Invalid token — no org_id" }

  const userRole = token.user_role as string | undefined
  if (userRole !== "owner") return { error: "Owner access required" }

  try {
    const rows = await adminDb
      .select({ id: profiles.id, full_name: profiles.full_name })
      .from(profiles)
      .where(
        and(
          eq(profiles.org_id, orgId),
          inArray(profiles.role, ["tech", "owner"])
        )
      )

    return rows.map((r) => ({ id: r.id, fullName: r.full_name }))
  } catch (err) {
    console.error("[getTechProfilesForBroadcast] Error:", err)
    return {
      error: err instanceof Error ? err.message : "Failed to fetch tech profiles",
    }
  }
}
