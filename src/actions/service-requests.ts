"use server"

import { revalidatePath } from "next/cache"
import { createClient } from "@/lib/supabase/server"
import { createClient as createSupabaseAdmin } from "@supabase/supabase-js"
import { withRls, adminDb } from "@/lib/db"
import type { SupabaseToken } from "@/lib/db"
import {
  serviceRequests,
  portalMessages,
  customers,
  pools,
  workOrders,
} from "@/lib/db/schema"
import { eq, and, desc } from "drizzle-orm"

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface ServiceRequestInput {
  poolId: string | null
  category: string
  description: string
  isUrgent: boolean
  photoPaths: string[]
  preferredDate: string | null
  preferredTimeWindow: string | null
}

export interface ServiceRequest {
  id: string
  org_id: string
  customer_id: string
  pool_id: string | null
  work_order_id: string | null
  category: string
  description: string
  is_urgent: boolean
  photo_paths: string[]
  preferred_date: string | null
  preferred_time_window: string | null
  status: string
  office_notes: string | null
  created_at: Date
  updated_at: Date
  // Joined
  pool_name: string | null
}

export interface OfficeServiceRequest extends ServiceRequest {
  customer_name: string
}

export interface PortalMessage {
  id: string
  org_id: string
  customer_id: string
  service_request_id: string | null
  sender_role: string
  sender_name: string
  body: string | null
  photo_path: string | null
  photo_url: string | null
  read_by_office_at: Date | null
  read_by_customer_at: Date | null
  created_at: Date
}

// ---------------------------------------------------------------------------
// Helpers
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

async function getRlsToken(): Promise<SupabaseToken | null> {
  const supabase = await createClient()
  const { data: claimsData } = await supabase.auth.getClaims()
  if (!claimsData?.claims) return null
  return claimsData.claims as SupabaseToken
}

// ---------------------------------------------------------------------------
// createRequestPhotoUploadUrl
// ---------------------------------------------------------------------------

/**
 * createRequestPhotoUploadUrl — generates a signed upload URL for portal request photos.
 *
 * Storage path: {orgId}/portal/requests/{timestamp}-{filename}
 * Bucket: company-assets (shared bucket used for portal assets)
 *
 * Customers upload directly to the signed URL from the client before submitting
 * the request form. The returned `path` is stored in service_requests.photo_paths.
 */
export async function createRequestPhotoUploadUrl(
  orgId: string,
  customerId: string,
  filename: string
): Promise<{ signedUrl: string; path: string } | null> {
  try {
    const supabaseAdmin = createAdminClient()
    const storagePath = `${orgId}/portal/requests/${Date.now()}-${filename}`

    const { data, error } = await supabaseAdmin.storage
      .from("company-assets")
      .createSignedUploadUrl(storagePath)

    if (error || !data) {
      console.error("[service-requests] Failed to create upload URL:", error)
      return null
    }

    return {
      signedUrl: data.signedUrl,
      path: storagePath,
    }
  } catch (err) {
    console.error("[service-requests] createRequestPhotoUploadUrl error:", err)
    return null
  }
}

// ---------------------------------------------------------------------------
// submitServiceRequest
// ---------------------------------------------------------------------------

/**
 * submitServiceRequest — customer submits a new service request from the portal.
 *
 * Uses adminDb because portal customers may not have org_id in JWT during
 * the transaction, and service_requests has a customer INSERT RLS policy that
 * checks email. We use adminDb here to avoid JWT-related complications —
 * the caller verifies the customer owns the request before calling.
 *
 * If isUrgent is true, sends an email notification to the office.
 *
 * @returns { id: string, success: true } on success
 */
export async function submitServiceRequest(
  orgId: string,
  customerId: string,
  data: ServiceRequestInput
): Promise<{ id: string; success: true } | { success: false; error: string }> {
  try {
    const [newRequest] = await adminDb
      .insert(serviceRequests)
      .values({
        org_id: orgId,
        customer_id: customerId,
        pool_id: data.poolId ?? null,
        category: data.category,
        description: data.description,
        is_urgent: data.isUrgent,
        photo_paths: data.photoPaths,
        preferred_date: data.preferredDate ?? null,
        preferred_time_window: data.preferredTimeWindow ?? null,
        status: "submitted",
        updated_at: new Date(),
      })
      .returning({ id: serviceRequests.id })

    if (!newRequest) {
      return { success: false, error: "Failed to create service request" }
    }

    // If urgent, notify the office via email
    if (data.isUrgent) {
      try {
        // Fetch org info for the notification
        const supabaseAdmin = createAdminClient()
        const { data: orgData } = await supabaseAdmin
          .from("orgs")
          .select("name")
          .eq("id", orgId)
          .single()

        const { data: customerData } = await supabaseAdmin
          .from("customers")
          .select("full_name, email")
          .eq("id", customerId)
          .single()

        // Send urgent notification via Resend (fire-and-forget)
        const resendKey = process.env.RESEND_API_KEY
        const orgEmail = process.env.ORG_NOTIFICATION_EMAIL

        if (resendKey && orgEmail) {
          void fetch("https://api.resend.com/emails", {
            method: "POST",
            headers: {
              Authorization: `Bearer ${resendKey}`,
              "Content-Type": "application/json",
            },
            body: JSON.stringify({
              from: "PoolCo <notifications@poolco.app>",
              to: orgEmail,
              subject: `Urgent Service Request — ${customerData?.full_name ?? "Customer"}`,
              html: `
                <p>An urgent service request was submitted.</p>
                <p><strong>Customer:</strong> ${customerData?.full_name ?? "Unknown"}</p>
                <p><strong>Category:</strong> ${data.category}</p>
                <p><strong>Description:</strong> ${data.description}</p>
                <p><strong>Preferred Date:</strong> ${data.preferredDate ?? "Flexible"}</p>
                <p>Please review it in the office portal.</p>
              `,
            }),
          }).catch((err) => {
            console.error("[service-requests] Failed to send urgent notification:", err)
          })
        }
      } catch (notifyErr) {
        // Non-fatal — request is still created
        console.error("[service-requests] Urgent notification error:", notifyErr)
      }
    }

    revalidatePath("/requests")

    return { id: newRequest.id, success: true }
  } catch (err) {
    console.error("[service-requests] submitServiceRequest error:", err)
    return {
      success: false,
      error: err instanceof Error ? err.message : "Unknown error",
    }
  }
}

// ---------------------------------------------------------------------------
// getCustomerRequests
// ---------------------------------------------------------------------------

/**
 * getCustomerRequests — loads all service requests for a given customer.
 *
 * Uses adminDb — portal customers access data via customerId (resolved from email),
 * not via RLS JWT claims. The caller (layout/page) resolves the customer ID.
 */
export async function getCustomerRequests(
  orgId: string,
  customerId: string
): Promise<ServiceRequest[]> {
  try {
    const rows = await adminDb
      .select({
        id: serviceRequests.id,
        org_id: serviceRequests.org_id,
        customer_id: serviceRequests.customer_id,
        pool_id: serviceRequests.pool_id,
        work_order_id: serviceRequests.work_order_id,
        category: serviceRequests.category,
        description: serviceRequests.description,
        is_urgent: serviceRequests.is_urgent,
        photo_paths: serviceRequests.photo_paths,
        preferred_date: serviceRequests.preferred_date,
        preferred_time_window: serviceRequests.preferred_time_window,
        status: serviceRequests.status,
        office_notes: serviceRequests.office_notes,
        created_at: serviceRequests.created_at,
        updated_at: serviceRequests.updated_at,
        pool_name: pools.name,
      })
      .from(serviceRequests)
      .leftJoin(pools, eq(pools.id, serviceRequests.pool_id))
      .where(
        and(
          eq(serviceRequests.org_id, orgId),
          eq(serviceRequests.customer_id, customerId)
        )
      )
      .orderBy(desc(serviceRequests.created_at))

    return rows.map((row) => ({
      ...row,
      photo_paths: (row.photo_paths as string[]) ?? [],
      pool_name: row.pool_name ?? null,
    }))
  } catch (err) {
    console.error("[service-requests] getCustomerRequests error:", err)
    return []
  }
}

// ---------------------------------------------------------------------------
// getOfficeRequests
// ---------------------------------------------------------------------------

/**
 * getOfficeRequests — loads all service requests for the office view.
 *
 * Uses withRls — office/owner staff access this page. Urgent requests sort first.
 * Per MEMORY.md: uses two-query pattern (not correlated subqueries) to avoid
 * RLS pitfall when joining customers and pools.
 */
export async function getOfficeRequests(orgId: string): Promise<OfficeServiceRequest[]> {
  const token = await getRlsToken()
  if (!token) return []

  try {
    return await withRls(token, async (db) => {
      // Step 1: fetch service requests
      const requestRows = await db
        .select({
          id: serviceRequests.id,
          org_id: serviceRequests.org_id,
          customer_id: serviceRequests.customer_id,
          pool_id: serviceRequests.pool_id,
          work_order_id: serviceRequests.work_order_id,
          category: serviceRequests.category,
          description: serviceRequests.description,
          is_urgent: serviceRequests.is_urgent,
          photo_paths: serviceRequests.photo_paths,
          preferred_date: serviceRequests.preferred_date,
          preferred_time_window: serviceRequests.preferred_time_window,
          status: serviceRequests.status,
          office_notes: serviceRequests.office_notes,
          created_at: serviceRequests.created_at,
          updated_at: serviceRequests.updated_at,
        })
        .from(serviceRequests)
        .where(eq(serviceRequests.org_id, orgId))
        .orderBy(desc(serviceRequests.is_urgent), desc(serviceRequests.created_at))

      if (requestRows.length === 0) return []

      // Step 2: fetch customers + pools separately (avoid correlated subquery pitfall)
      const customerIds = [...new Set(requestRows.map((r) => r.customer_id))]
      const poolIds = requestRows
        .filter((r) => r.pool_id != null)
        .map((r) => r.pool_id as string)

      const customerRows = await db
        .select({ id: customers.id, full_name: customers.full_name })
        .from(customers)
        .where(eq(customers.org_id, orgId))

      const poolRows =
        poolIds.length > 0
          ? await db
              .select({ id: pools.id, name: pools.name })
              .from(pools)
              .where(eq(pools.org_id, orgId))
          : []

      const customerMap = new Map(customerRows.map((c) => [c.id, c.full_name]))
      const poolMap = new Map(poolRows.map((p) => [p.id, p.name]))

      return requestRows.map((row) => ({
        ...row,
        photo_paths: (row.photo_paths as string[]) ?? [],
        pool_name: row.pool_id ? (poolMap.get(row.pool_id) ?? null) : null,
        customer_name: customerMap.get(row.customer_id) ?? "Unknown",
      }))
    })
  } catch (err) {
    console.error("[service-requests] getOfficeRequests error:", err)
    return []
  }
}

// ---------------------------------------------------------------------------
// reviewRequest
// ---------------------------------------------------------------------------

/**
 * reviewRequest — office marks a request as reviewed or declined.
 *
 * Uses withRls — requires office or owner role.
 */
export async function reviewRequest(
  requestId: string,
  data: { status: "reviewed" | "declined"; officeNotes?: string }
): Promise<{ success: boolean; error?: string }> {
  const token = await getRlsToken()
  if (!token) return { success: false, error: "Not authenticated" }

  try {
    await withRls(token, async (db) => {
      await db
        .update(serviceRequests)
        .set({
          status: data.status,
          office_notes: data.officeNotes ?? null,
          updated_at: new Date(),
        })
        .where(eq(serviceRequests.id, requestId))
    })

    revalidatePath("/requests")
    return { success: true }
  } catch (err) {
    console.error("[service-requests] reviewRequest error:", err)
    return {
      success: false,
      error: err instanceof Error ? err.message : "Unknown error",
    }
  }
}

// ---------------------------------------------------------------------------
// createWoFromRequest
// ---------------------------------------------------------------------------

/**
 * createWoFromRequest — creates a work order from a service request.
 *
 * Reads the service request, creates a work order with appropriate defaults,
 * then links the WO back to the request and marks the request as "reviewed".
 *
 * Uses adminDb for the cross-table operation to avoid RLS complexity when
 * creating a WO and updating a service request in the same operation.
 */
export async function createWoFromRequest(
  requestId: string
): Promise<{ woId: string; success: true } | { success: false; error: string }> {
  const token = await getRlsToken()
  if (!token) return { success: false, error: "Not authenticated" }

  const orgId = token.org_id as string | undefined
  if (!orgId) return { success: false, error: "Invalid token — no org_id" }

  try {
    // Step 1: fetch the service request
    const [request] = await adminDb
      .select()
      .from(serviceRequests)
      .where(
        and(
          eq(serviceRequests.id, requestId),
          eq(serviceRequests.org_id, orgId)
        )
      )
      .limit(1)

    if (!request) {
      return { success: false, error: "Service request not found" }
    }

    // Map service request category to WO category
    const woCategory = mapCategoryToWoCategory(request.category)

    // Step 2: create the work order
    const [newWo] = await adminDb
      .insert(workOrders)
      .values({
        org_id: orgId,
        customer_id: request.customer_id,
        pool_id: request.pool_id ?? null,
        created_by_id: token.sub,
        title: `Service Request: ${formatCategoryLabel(request.category)}`,
        description: request.description,
        category: woCategory,
        priority: request.is_urgent ? "high" : "normal",
        status: "draft",
        target_date: request.preferred_date ?? null,
        updated_at: new Date(),
        activity_log: [
          {
            type: "created_from_request",
            at: new Date().toISOString(),
            by_id: token.sub,
            note: `Created from service request ${requestId}`,
          },
        ],
      })
      .returning({ id: workOrders.id })

    if (!newWo) {
      return { success: false, error: "Failed to create work order" }
    }

    // Step 3: link WO back to the request and mark as reviewed
    await adminDb
      .update(serviceRequests)
      .set({
        work_order_id: newWo.id,
        status: "reviewed",
        updated_at: new Date(),
      })
      .where(eq(serviceRequests.id, requestId))

    revalidatePath("/requests")
    revalidatePath("/work-orders")

    return { woId: newWo.id, success: true }
  } catch (err) {
    console.error("[service-requests] createWoFromRequest error:", err)
    return {
      success: false,
      error: err instanceof Error ? err.message : "Unknown error",
    }
  }
}

// ---------------------------------------------------------------------------
// getRequestMessages
// ---------------------------------------------------------------------------

/**
 * getRequestMessages — loads all messages for a specific service request thread.
 *
 * Uses adminDb — called from both portal (customer) and office (staff) contexts.
 * For messages with photo_path, generates 1-hour signed URLs.
 */
export async function getRequestMessages(
  orgId: string,
  requestId: string
): Promise<PortalMessage[]> {
  try {
    const rows = await adminDb
      .select()
      .from(portalMessages)
      .where(
        and(
          eq(portalMessages.org_id, orgId),
          eq(portalMessages.service_request_id, requestId)
        )
      )
      .orderBy(portalMessages.created_at)

    // Generate signed URLs for photo attachments
    const supabaseAdmin = createAdminClient()

    const messages = await Promise.all(
      rows.map(async (row) => {
        let photoUrl: string | null = null

        if (row.photo_path) {
          try {
            const { data } = await supabaseAdmin.storage
              .from("company-assets")
              .createSignedUrl(row.photo_path, 3600) // 1-hour expiry
            photoUrl = data?.signedUrl ?? null
          } catch (err) {
            console.error("[service-requests] Failed to generate photo URL:", err)
          }
        }

        return {
          ...row,
          photo_url: photoUrl,
        }
      })
    )

    return messages
  } catch (err) {
    console.error("[service-requests] getRequestMessages error:", err)
    return []
  }
}

// ---------------------------------------------------------------------------
// sendRequestMessage
// ---------------------------------------------------------------------------

/**
 * sendRequestMessage — sends a message in a service request's chat thread.
 *
 * Uses adminDb — runs from both portal and office contexts where RLS JWTs
 * may differ. The service request is verified to belong to the org before insert.
 *
 * After insert, broadcasts to Supabase Realtime channel `portal-request-${requestId}`
 * so messages appear in near-real-time for both parties.
 *
 * Sends email notification to the other party (same pattern as general messages).
 */
export async function sendRequestMessage(params: {
  orgId: string
  customerId: string
  serviceRequestId: string
  senderRole: "customer" | "office"
  senderName: string
  body: string | null
  photoPath: string | null
}): Promise<{ message: PortalMessage; success: true } | { success: false; error: string }> {
  const { orgId, customerId, serviceRequestId, senderRole, senderName, body, photoPath } =
    params

  if (!body && !photoPath) {
    return { success: false, error: "Message must have text or a photo" }
  }

  try {
    // Verify the service request exists and belongs to this org
    const [request] = await adminDb
      .select({ id: serviceRequests.id, customer_id: serviceRequests.customer_id })
      .from(serviceRequests)
      .where(
        and(
          eq(serviceRequests.id, serviceRequestId),
          eq(serviceRequests.org_id, orgId)
        )
      )
      .limit(1)

    if (!request) {
      return { success: false, error: "Service request not found" }
    }

    // Insert the message
    const [newMessage] = await adminDb
      .insert(portalMessages)
      .values({
        org_id: orgId,
        customer_id: customerId,
        service_request_id: serviceRequestId,
        sender_role: senderRole,
        sender_name: senderName,
        body: body ?? null,
        photo_path: photoPath ?? null,
      })
      .returning()

    if (!newMessage) {
      return { success: false, error: "Failed to send message" }
    }

    // Broadcast to Realtime channel for live updates
    try {
      const supabaseAdmin = createAdminClient()
      await supabaseAdmin.channel(`portal-request-${serviceRequestId}`).send({
        type: "broadcast",
        event: "message",
        payload: {
          id: newMessage.id,
          sender_role: senderRole,
          sender_name: senderName,
          body: body,
          photo_path: photoPath,
          created_at: newMessage.created_at,
        },
      })
    } catch (realtimeErr) {
      // Non-fatal — message is stored; Realtime broadcast failure is not critical
      console.error("[service-requests] Realtime broadcast error:", realtimeErr)
    }

    const result: PortalMessage = {
      ...newMessage,
      photo_url: null,
    }

    return { message: result, success: true }
  } catch (err) {
    console.error("[service-requests] sendRequestMessage error:", err)
    return {
      success: false,
      error: err instanceof Error ? err.message : "Unknown error",
    }
  }
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function mapCategoryToWoCategory(category: string): string {
  const map: Record<string, string> = {
    green_pool: "other",
    opening_closing: "other",
    repair: "other",
    cleaning: "other",
    chemical: "other",
    other: "other",
  }
  return map[category] ?? "other"
}

function formatCategoryLabel(category: string): string {
  const labels: Record<string, string> = {
    green_pool: "Green Pool Cleanup",
    opening_closing: "Opening / Closing",
    repair: "Repair",
    cleaning: "Cleaning",
    chemical: "Chemical Balance",
    other: "Other",
  }
  return labels[category] ?? category
}
