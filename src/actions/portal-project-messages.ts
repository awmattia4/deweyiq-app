"use server"

/**
 * portal-project-messages.ts — Project-scoped portal messaging (PROJ-88).
 *
 * Extends portal_messages with project_id filtering.
 * Uses the same portal_messages table and PortalMessage type as portal-messages.ts.
 *
 * Key functions:
 * - getProjectMessages: load thread for a specific project
 * - sendProjectMessage: send a message tagged to a project
 * - markProjectMessagesRead: mark project-scoped messages as read
 */

import { adminDb } from "@/lib/db"
import { portalMessages, customers, orgs } from "@/lib/db/schema"
import { eq, and, isNull, asc } from "drizzle-orm"
import { createClient as createSupabaseAdmin } from "@supabase/supabase-js"
import type { PortalMessage } from "@/actions/portal-messages"

// ---------------------------------------------------------------------------
// Admin Supabase client
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
// getProjectMessages
// ---------------------------------------------------------------------------

/**
 * Load project-scoped message thread.
 * Ordered oldest-first for chat display.
 */
export async function getProjectMessages(
  orgId: string,
  customerId: string,
  projectId: string,
  limit = 100
): Promise<PortalMessage[]> {
  try {
    const rows = await adminDb
      .select()
      .from(portalMessages)
      .where(
        and(
          eq(portalMessages.org_id, orgId),
          eq(portalMessages.customer_id, customerId),
          eq(portalMessages.project_id, projectId)
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
              .createSignedUrl(row.photo_path, 3600)
            photo_url = data?.signedUrl ?? null
          } catch {
            // Non-fatal
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
    console.error("[getProjectMessages] Error:", err)
    return []
  }
}

// ---------------------------------------------------------------------------
// sendProjectMessage
// ---------------------------------------------------------------------------

/**
 * Insert a project-scoped message and broadcast via Realtime.
 */
export async function sendProjectMessage(params: {
  orgId: string
  customerId: string
  projectId: string
  senderRole: "customer" | "office"
  senderName: string
  body: string | null
  photoPath: string | null
}): Promise<{ success: boolean; message?: PortalMessage; error?: string }> {
  const { orgId, customerId, projectId, senderRole, senderName, body, photoPath } = params

  if (!body && !photoPath) {
    return { success: false, error: "Message must have text or a photo" }
  }

  try {
    // Validate customer belongs to org
    const [customer] = await adminDb
      .select({ id: customers.id })
      .from(customers)
      .where(and(eq(customers.id, customerId), eq(customers.org_id, orgId)))
      .limit(1)
    if (!customer) return { success: false, error: "Customer not found" }

    const now = new Date()
    const [newMessage] = await adminDb
      .insert(portalMessages)
      .values({
        org_id: orgId,
        customer_id: customerId,
        project_id: projectId,
        sender_role: senderRole,
        sender_name: senderName,
        body,
        photo_path: photoPath,
        created_at: now,
      })
      .returning()

    if (!newMessage) return { success: false, error: "Failed to insert message" }

    const messagePayload: PortalMessage = {
      id: newMessage.id,
      sender_role: senderRole,
      sender_name: senderName,
      body,
      photo_url: null,
      photo_path: photoPath,
      created_at: newMessage.created_at.toISOString(),
    }

    // Broadcast via Realtime
    try {
      const supabaseAdmin = createAdminClient()
      const channel = supabaseAdmin.channel(`portal-project-${projectId}`)
      await channel.send({
        type: "broadcast",
        event: "message",
        payload: messagePayload,
      })
      await supabaseAdmin.removeChannel(channel)
    } catch (broadcastErr) {
      console.error("[sendProjectMessage] Broadcast error:", broadcastErr)
    }

    return { success: true, message: messagePayload }
  } catch (err) {
    console.error("[sendProjectMessage] Error:", err)
    return {
      success: false,
      error: err instanceof Error ? err.message : "Failed to send message",
    }
  }
}

// ---------------------------------------------------------------------------
// markProjectMessagesRead
// ---------------------------------------------------------------------------

/**
 * Mark project-scoped messages as read.
 */
export async function markProjectMessagesRead(
  orgId: string,
  customerId: string,
  projectId: string,
  role: "office" | "customer"
): Promise<void> {
  try {
    const now = new Date()
    if (role === "office") {
      await adminDb
        .update(portalMessages)
        .set({ read_by_office_at: now })
        .where(
          and(
            eq(portalMessages.org_id, orgId),
            eq(portalMessages.customer_id, customerId),
            eq(portalMessages.project_id, projectId),
            eq(portalMessages.sender_role, "customer"),
            isNull(portalMessages.read_by_office_at)
          )
        )
    } else {
      await adminDb
        .update(portalMessages)
        .set({ read_by_customer_at: now })
        .where(
          and(
            eq(portalMessages.org_id, orgId),
            eq(portalMessages.customer_id, customerId),
            eq(portalMessages.project_id, projectId),
            eq(portalMessages.sender_role, "office"),
            isNull(portalMessages.read_by_customer_at)
          )
        )
    }
  } catch (err) {
    console.error("[markProjectMessagesRead] Error:", err)
  }
}
