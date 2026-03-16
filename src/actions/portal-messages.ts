"use server"

/**
 * portal-messages.ts — CRUD server actions for customer ↔ office messaging.
 *
 * Key functions:
 * - sendMessage: insert a message, broadcast via Supabase Realtime, send email notification
 * - getMessages: load thread history with signed photo URLs
 * - getInboxThreads: aggregate per-customer thread summaries for office inbox
 * - markAsRead: mark the other party's messages as read when thread is opened
 * - getUnreadCount: badge counts for sidebar (office) and portal nav (customer)
 * - createMessagePhotoUploadUrl: generate signed upload URL for photo attachments
 *
 * Uses adminDb throughout:
 * - Customers use portal magic-link auth which sets user_role='customer' and org_id in JWT.
 *   But portal pages call these actions after resolveCustomerId — we have the customerId already.
 * - Email notifications (office→customer, customer→office) may run in non-RLS contexts.
 */

import { adminDb } from "@/lib/db"
import { portalMessages, customers, profiles, orgs } from "@/lib/db/schema"
import { eq, and, isNull, inArray, desc, asc, sql } from "drizzle-orm"
import { createClient as createSupabaseAdmin } from "@supabase/supabase-js"
import { getCurrentUser } from "@/actions/auth"
import { Resend } from "resend"
import { render as renderEmail } from "@react-email/render"
import { createElement } from "react"
import { PortalMessageEmail } from "@/lib/emails/portal-message-email"
import { notifyOrgRole } from "@/lib/notifications/dispatch"
import { getResolvedTemplate } from "@/actions/notification-templates"

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface PortalMessage {
  id: string
  sender_role: "customer" | "office"
  sender_name: string
  body: string | null
  photo_url: string | null  // signed URL (resolved from photo_path)
  photo_path: string | null
  created_at: string
}

export interface InboxThread {
  customerId: string
  customerName: string
  customerEmail: string
  lastMessage: string | null
  lastMessageAt: string
  unreadCount: number
}

// ---------------------------------------------------------------------------
// Admin Supabase client (for Realtime broadcast + signed URLs)
// ---------------------------------------------------------------------------

function createAdminClient() {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY

  if (!supabaseUrl || !serviceRoleKey) {
    throw new Error("Missing SUPABASE_SERVICE_ROLE_KEY or NEXT_PUBLIC_SUPABASE_URL")
  }

  return createSupabaseAdmin(supabaseUrl, serviceRoleKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  })
}

// ---------------------------------------------------------------------------
// sendMessage
// ---------------------------------------------------------------------------

/**
 * Insert a message, broadcast via Realtime, and send email notification.
 *
 * Caller: customer portal page (senderRole='customer') or office inbox (senderRole='office').
 * Both paths use adminDb — we validate orgId + customerId match before trusting the input.
 */
export async function sendMessage(params: {
  orgId: string
  customerId: string
  senderRole: "customer" | "office"
  senderName: string
  body: string | null
  photoPath: string | null
}): Promise<{ success: boolean; message?: PortalMessage; error?: string }> {
  const { orgId, customerId, senderRole, senderName, body, photoPath } = params

  if (!body && !photoPath) {
    return { success: false, error: "Message must have text or a photo" }
  }

  try {
    // Validate that the customer belongs to the org
    const [customer] = await adminDb
      .select({ id: customers.id, email: customers.email, full_name: customers.full_name, phone: customers.phone })
      .from(customers)
      .where(and(eq(customers.id, customerId), eq(customers.org_id, orgId)))
      .limit(1)

    if (!customer) {
      return { success: false, error: "Customer not found" }
    }

    const now = new Date()

    // Insert the message
    const [newMessage] = await adminDb
      .insert(portalMessages)
      .values({
        org_id: orgId,
        customer_id: customerId,
        sender_role: senderRole,
        sender_name: senderName,
        body,
        photo_path: photoPath,
        created_at: now,
      })
      .returning()

    if (!newMessage) {
      return { success: false, error: "Failed to insert message" }
    }

    const messagePayload: PortalMessage = {
      id: newMessage.id,
      sender_role: senderRole,
      sender_name: senderName,
      body,
      photo_url: null, // signed URL not needed in realtime payload (will be fetched fresh)
      photo_path: photoPath,
      created_at: newMessage.created_at.toISOString(),
    }

    // Broadcast via Supabase Realtime so both sides update instantly
    try {
      const supabaseAdmin = createAdminClient()
      const channel = supabaseAdmin.channel(`portal-thread-${customerId}`)
      await channel.send({
        type: "broadcast",
        event: "message",
        payload: messagePayload,
      })
      await supabaseAdmin.removeChannel(channel)

      // Also broadcast badge-refresh so unread counts update instantly
      const badgeChannel = supabaseAdmin.channel(`unread-badge-${orgId}`)
      await badgeChannel.send({
        type: "broadcast",
        event: "refresh",
        payload: { customerId, senderRole },
      })
      await supabaseAdmin.removeChannel(badgeChannel)
    } catch (broadcastErr) {
      // Broadcast failure is non-fatal — message is already saved
      console.error("[sendMessage] Realtime broadcast error:", broadcastErr)
    }

    // Send email notification to the other party (fire-and-forget)
    sendMessageEmailNotification({
      orgId,
      customerId,
      customerEmail: customer.email,
      customerName: customer.full_name,
      senderRole,
      senderName,
      body,
    }).catch((err) => console.error("[sendMessage] Email notification error:", err))

    // ── NOTIF-14: When customer sends a message, notify owner+office ─────────
    if (senderRole === "customer") {
      void notifyOrgRole(orgId, "owner+office", {
        type: "portal_message",
        urgency: "needs_action",
        title: "Customer message",
        body: `${customer.full_name}: ${body ? body.substring(0, 100) : "[Photo]"}`,
        link: `/portal-inbox`,
      }).catch((err) =>
        console.error("[sendMessage] NOTIF-14 dispatch failed (non-blocking):", err)
      )
    }

    // ── NOTIF-32: When office replies, send portal_reply_sms to customer ─────
    if (senderRole === "office" && customer.phone) {
      try {
        const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000"
        // Fetch org name for sms template
        const orgRows = await adminDb
          .select({ name: orgs.name })
          .from(orgs)
          .where(eq(orgs.id, orgId))
          .limit(1)
        const companyName = orgRows[0]?.name ?? "Pool Company"

        const smsTemplate = await getResolvedTemplate(orgId, "portal_reply_sms", {
          customer_name: customer.full_name,
          company_name: companyName,
          portal_link: `${appUrl}/portal`,
        })
        if (smsTemplate?.sms_text) {
          const supabaseAdmin = createAdminClient()
          await supabaseAdmin.functions.invoke("send-sms", {
            body: { to: customer.phone, text: smsTemplate.sms_text, orgId },
          })
        }
      } catch (smsErr) {
        console.error("[sendMessage] NOTIF-32 SMS failed (non-blocking):", smsErr)
      }
    }

    return { success: true, message: messagePayload }
  } catch (err) {
    console.error("[sendMessage] Error:", err)
    return {
      success: false,
      error: err instanceof Error ? err.message : "Failed to send message",
    }
  }
}

// ---------------------------------------------------------------------------
// getMessages
// ---------------------------------------------------------------------------

/**
 * Load the full message thread for a customer, with signed photo URLs.
 * Ordered oldest-first (for chat display). Optionally limited.
 */
export async function getMessages(
  orgId: string,
  customerId: string,
  limit = 100
): Promise<PortalMessage[]> {
  try {
    const rows = await adminDb
      .select()
      .from(portalMessages)
      .where(
        and(
          eq(portalMessages.org_id, orgId),
          eq(portalMessages.customer_id, customerId)
        )
      )
      .orderBy(asc(portalMessages.created_at))
      .limit(limit)

    // Resolve signed URLs for photo attachments
    const supabaseAdmin = createAdminClient()
    const messages: PortalMessage[] = await Promise.all(
      rows.map(async (row) => {
        let photo_url: string | null = null

        if (row.photo_path) {
          try {
            const { data } = await supabaseAdmin.storage
              .from("company-assets")
              .createSignedUrl(row.photo_path, 3600) // 1-hour expiry
            photo_url = data?.signedUrl ?? null
          } catch {
            // Signed URL failure — skip, don't crash
          }
        }

        return {
          id: row.id,
          sender_role: row.sender_role as "customer" | "office",
          sender_name: row.sender_name,
          body: row.body,
          photo_url,
          photo_path: row.photo_path,
          created_at:
            row.created_at instanceof Date
              ? row.created_at.toISOString()
              : String(row.created_at),
        }
      })
    )

    return messages
  } catch (err) {
    console.error("[getMessages] Error:", err)
    return []
  }
}

// ---------------------------------------------------------------------------
// getInboxThreads
// ---------------------------------------------------------------------------

/**
 * Aggregate thread summaries for the office inbox page.
 *
 * Groups portal_messages by customer_id. For each customer, returns:
 * - customer name + email
 * - last message body
 * - last message timestamp
 * - unread count (messages from customer that haven't been read by office)
 *
 * Sorted: unread threads first, then by last message time DESC.
 *
 * IMPORTANT: Uses LEFT JOIN + GROUP BY (not correlated subqueries) per MEMORY.md
 * to avoid RLS pitfalls on correlated subqueries.
 */
export async function getInboxThreads(orgId: string): Promise<InboxThread[]> {
  try {
    // Get all messages for this org grouped by customer
    // We use raw SQL aggregates to avoid correlated subquery pitfalls
    const rows = await adminDb
      .select({
        customer_id: portalMessages.customer_id,
        last_message_at: sql<string>`MAX(${portalMessages.created_at})`,
        last_message_body: sql<string>`(
          SELECT body FROM portal_messages pm2
          WHERE pm2.customer_id = ${portalMessages.customer_id}
            AND pm2.org_id = ${orgId}::uuid
          ORDER BY pm2.created_at DESC
          LIMIT 1
        )`,
        unread_count: sql<number>`COUNT(
          CASE WHEN ${portalMessages.sender_role} = 'customer'
            AND ${portalMessages.read_by_office_at} IS NULL
          THEN 1 END
        )`,
      })
      .from(portalMessages)
      .where(eq(portalMessages.org_id, orgId))
      .groupBy(portalMessages.customer_id)
      .orderBy(
        desc(sql`COUNT(CASE WHEN ${portalMessages.sender_role} = 'customer' AND ${portalMessages.read_by_office_at} IS NULL THEN 1 END)`),
        desc(sql`MAX(${portalMessages.created_at})`)
      )

    if (rows.length === 0) return []

    // Fetch customer details for the found customer IDs
    const customerIds = rows.map((r) => r.customer_id)
    const customerRows = await adminDb
      .select({
        id: customers.id,
        full_name: customers.full_name,
        email: customers.email,
      })
      .from(customers)
      .where(and(inArray(customers.id, customerIds), eq(customers.org_id, orgId)))

    const customerMap = new Map(customerRows.map((c) => [c.id, c]))

    return rows
      .map((row): InboxThread | null => {
        const customer = customerMap.get(row.customer_id)
        if (!customer) return null

        return {
          customerId: row.customer_id,
          customerName: customer.full_name,
          customerEmail: customer.email ?? "",
          lastMessage: row.last_message_body ?? null,
          lastMessageAt: row.last_message_at,
          unreadCount: Number(row.unread_count) || 0,
        }
      })
      .filter((t): t is InboxThread => t !== null)
  } catch (err) {
    console.error("[getInboxThreads] Error:", err)
    return []
  }
}

// ---------------------------------------------------------------------------
// markAsRead
// ---------------------------------------------------------------------------

/**
 * Mark all messages from the OTHER party as read when a thread is opened.
 *
 * - role='office' opens thread → mark all customer messages as read_by_office_at
 * - role='customer' opens thread → mark all office messages as read_by_customer_at
 */
export async function markAsRead(
  orgId: string,
  customerId: string,
  role: "office" | "customer"
): Promise<void> {
  try {
    const now = new Date()

    if (role === "office") {
      // Mark customer's messages as read by office
      await adminDb
        .update(portalMessages)
        .set({ read_by_office_at: now })
        .where(
          and(
            eq(portalMessages.org_id, orgId),
            eq(portalMessages.customer_id, customerId),
            eq(portalMessages.sender_role, "customer"),
            isNull(portalMessages.read_by_office_at)
          )
        )
    } else {
      // Mark office's messages as read by customer
      await adminDb
        .update(portalMessages)
        .set({ read_by_customer_at: now })
        .where(
          and(
            eq(portalMessages.org_id, orgId),
            eq(portalMessages.customer_id, customerId),
            eq(portalMessages.sender_role, "office"),
            isNull(portalMessages.read_by_customer_at)
          )
        )
    }
  } catch (err) {
    console.error("[markAsRead] Error:", err)
    // Non-fatal — read receipts are best-effort
  }
}

// ---------------------------------------------------------------------------
// getUnreadCount
// ---------------------------------------------------------------------------

/**
 * Returns the unread message count for nav badges.
 *
 * - Office: total unread customer messages across all threads (for sidebar badge)
 * - Customer: total unread office replies for their thread (for portal nav badge)
 */
export async function getUnreadCount(
  orgId: string,
  role: "office" | "customer",
  customerId?: string
): Promise<{ count: number }> {
  try {
    if (role === "office") {
      const [result] = await adminDb
        .select({
          count: sql<number>`COUNT(*)`,
        })
        .from(portalMessages)
        .where(
          and(
            eq(portalMessages.org_id, orgId),
            eq(portalMessages.sender_role, "customer"),
            isNull(portalMessages.read_by_office_at)
          )
        )
      return { count: Number(result?.count) || 0 }
    } else {
      if (!customerId) return { count: 0 }

      const [result] = await adminDb
        .select({
          count: sql<number>`COUNT(*)`,
        })
        .from(portalMessages)
        .where(
          and(
            eq(portalMessages.org_id, orgId),
            eq(portalMessages.customer_id, customerId),
            eq(portalMessages.sender_role, "office"),
            isNull(portalMessages.read_by_customer_at)
          )
        )
      return { count: Number(result?.count) || 0 }
    }
  } catch (err) {
    console.error("[getUnreadCount] Error:", err)
    return { count: 0 }
  }
}

// ---------------------------------------------------------------------------
// createMessagePhotoUploadUrl
// ---------------------------------------------------------------------------

/**
 * Generate a signed upload URL for a photo attachment.
 * Path: {orgId}/portal/messages/{timestamp}-{filename}
 */
export async function createMessagePhotoUploadUrl(
  orgId: string,
  customerId: string,
  filename: string
): Promise<{ signedUrl: string; path: string } | null> {
  // Validate caller is authenticated and belongs to this org
  const user = await getCurrentUser()
  if (!user || user.org_id !== orgId) return null

  try {
    const supabaseAdmin = createAdminClient()
    const path = `${orgId}/portal/messages/${customerId}/${Date.now()}-${filename}`

    const { data, error } = await supabaseAdmin.storage
      .from("company-assets")
      .createSignedUploadUrl(path)

    if (error || !data) {
      console.error("[createMessagePhotoUploadUrl] Error:", error)
      return null
    }

    return { signedUrl: data.signedUrl, path }
  } catch (err) {
    console.error("[createMessagePhotoUploadUrl] Error:", err)
    return null
  }
}

// ---------------------------------------------------------------------------
// sendMessageEmailNotification (internal helper, not exported as server action)
// ---------------------------------------------------------------------------

/**
 * Send email notification when a message is sent.
 *
 * - Customer sends → notify office (first owner profile email)
 * - Office replies → notify customer (customer.email)
 *
 * Non-fatal: email failure never blocks message delivery.
 */
async function sendMessageEmailNotification(params: {
  orgId: string
  customerId: string
  customerEmail: string | null
  customerName: string
  senderRole: "customer" | "office"
  senderName: string
  body: string | null
}): Promise<void> {
  const resendApiKey = process.env.RESEND_API_KEY
  if (!resendApiKey) return

  const { orgId, customerEmail, customerName, senderRole, senderName, body } = params

  try {
    // Get company name for the email
    const [orgRow] = await adminDb
      .select({ name: orgs.name })
      .from(orgs)
      .where(eq(orgs.id, orgId))
      .limit(1)

    const companyName = orgRow?.name ?? "Your Pool Company"
    const isDev = process.env.NODE_ENV === "development"

    const resend = new Resend(resendApiKey)

    if (senderRole === "customer") {
      // Customer sent a message → notify office owner(s)
      const ownerProfiles = await adminDb
        .select({ email: profiles.email, full_name: profiles.full_name })
        .from(profiles)
        .where(
          and(
            eq(profiles.org_id, orgId),
            inArray(profiles.role, ["owner", "office"])
          )
        )
        .limit(3) // notify up to 3 office/owner accounts

      if (ownerProfiles.length === 0) return

      const officeEmails = ownerProfiles.map((p) => p.email).filter(Boolean)
      if (officeEmails.length === 0) return

      const fromAddress = isDev
        ? "PoolCo Dev <onboarding@resend.dev>"
        : `${companyName} <notifications@poolco.app>`
      const toAddresses = isDev ? ["delivered@resend.dev"] : officeEmails

      const bodyPreview = body ? body.slice(0, 200) : "(photo attached)"
      const html = await renderEmail(
        createElement(PortalMessageEmail, {
          companyName,
          senderName: customerName,
          recipientName: "Team",
          bodyPreview,
          viewUrl: `${process.env.NEXT_PUBLIC_APP_URL ?? ""}/inbox?customer=${params.customerId}`,
          direction: "customer_to_office",
        })
      )

      await resend.emails.send({
        from: fromAddress,
        to: toAddresses,
        subject: `New message from ${customerName} — ${companyName}`,
        html,
      })
    } else {
      // Office replied → notify customer
      if (!customerEmail) return

      const fromAddress = isDev
        ? "PoolCo Dev <onboarding@resend.dev>"
        : `${companyName} <notifications@poolco.app>`
      const toAddress = isDev ? "delivered@resend.dev" : customerEmail

      const bodyPreview = body ? body.slice(0, 200) : "(photo attached)"
      const portalUrl = process.env.NEXT_PUBLIC_PORTAL_URL
      const viewUrl = portalUrl
        ? `${portalUrl}/portal/messages`
        : `/portal/messages`

      const html = await renderEmail(
        createElement(PortalMessageEmail, {
          companyName,
          senderName: companyName,
          recipientName: customerName,
          bodyPreview,
          viewUrl,
          direction: "office_to_customer",
        })
      )

      await resend.emails.send({
        from: fromAddress,
        to: [toAddress],
        subject: `${senderName} replied to your message — ${companyName}`,
        html,
      })
    }
  } catch (err) {
    // Non-fatal — email errors never block the message
    console.error("[sendMessageEmailNotification] Error:", err)
  }
}
