"use server"

import { revalidatePath } from "next/cache"
import { createClient } from "@/lib/supabase/server"
import { withRls, adminDb } from "@/lib/db"
import type { SupabaseToken } from "@/lib/db"
import {
  workOrders,
  workOrderLineItems,
  customers,
  pools,
  profiles,
  quotes,
  woTemplates,
  alerts,
  orgSettings,
  orgs,
} from "@/lib/db/schema"
import {
  eq,
  and,
  desc,
  inArray,
  sql,
} from "drizzle-orm"
import { notifyOrgRole, notifyUser } from "@/lib/notifications/dispatch"
import { getResolvedTemplate } from "@/actions/notification-templates"
import { createClient as createSupabaseAdmin } from "@supabase/supabase-js"

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface WorkOrderSummary {
  id: string
  org_id: string
  customer_id: string
  pool_id: string | null
  assigned_tech_id: string | null
  title: string
  description: string | null
  category: string
  priority: string
  status: string
  severity: string | null
  target_date: string | null
  completed_at: Date | null
  cancelled_at: Date | null
  flagged_by_tech_id: string | null
  tax_exempt: boolean
  created_at: Date
  updated_at: Date
  // Joined
  customerName: string
  poolName: string | null
  techName: string | null
}

export interface WorkOrderDetail extends WorkOrderSummary {
  created_by_id: string | null
  parent_wo_id: string | null
  completion_notes: string | null
  completion_photo_paths: string[] | null
  cancel_reason: string | null
  flagged_from_visit_id: string | null
  discount_type: string | null
  discount_value: string | null
  discount_reason: string | null
  template_id: string | null
  activity_log: Array<{ type: string; at: string; by_id: string; note: string | null }> | null
  // Joined
  createdByName: string | null
  flaggedByTechName: string | null
  lineItems: WorkOrderLineItem[]
  quoteSummaries: QuoteSummary[]
}

export interface WorkOrderLineItem {
  id: string
  work_order_id: string
  catalog_item_id: string | null
  description: string
  item_type: string
  labor_type: string | null
  quantity: string
  unit: string
  unit_cost: string | null
  unit_price: string | null
  markup_pct: string | null
  discount_type: string | null
  discount_value: string | null
  is_taxable: boolean
  is_optional: boolean
  actual_hours: string | null
  sort_order: number
}

export interface QuoteSummary {
  id: string
  quote_number: string | null
  version: number
  status: string
  expires_at: Date | null
  approved_at: Date | null
  sent_at: Date | null
  created_at: Date
}

export interface WorkOrderFilters {
  status?: string[]
  priority?: string
  techId?: string
  customerId?: string
}

export interface CreateWorkOrderInput {
  customerId: string
  poolId?: string
  title: string
  description?: string
  category?: string
  priority?: string
  severity?: string
  /** Pass explicit UUID, OR set flagFromCurrentUser: true to auto-fill from JWT */
  flaggedByTechId?: string
  /** When true, server action auto-fills flaggedByTechId from the JWT sub claim */
  flagFromCurrentUser?: boolean
  flaggedFromVisitId?: string
  templateId?: string
}

export interface UpdateWorkOrderInput {
  title?: string
  description?: string
  category?: string
  priority?: string
  assignedTechId?: string | null
  targetDate?: string | null
}

export type WorkOrderStatus =
  | "draft"
  | "quoted"
  | "approved"
  | "scheduled"
  | "in_progress"
  | "complete"
  | "invoiced"
  | "cancelled"

export interface UpdateStatusExtra {
  // For 'scheduled'
  assignedTechId?: string
  targetDate?: string
  // For 'complete'
  completionNotes?: string
  completionPhotoPaths?: string[]
  // For 'cancelled'
  cancelReason?: string
}

// ---------------------------------------------------------------------------
// Priority sort order for ORDER BY
// ---------------------------------------------------------------------------

const PRIORITY_ORDER: Record<string, number> = {
  emergency: 0,
  high: 1,
  normal: 2,
  low: 3,
}

// ---------------------------------------------------------------------------
// Auth helper
// ---------------------------------------------------------------------------

async function getRlsToken(): Promise<SupabaseToken | null> {
  const supabase = await createClient()
  const { data: claimsData } = await supabase.auth.getClaims()
  if (!claimsData?.claims) return null
  return claimsData.claims as SupabaseToken
}

// Service-role Supabase client for Edge Function invocations from admin context
function getAdminSupabaseClient() {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!
  return createSupabaseAdmin(supabaseUrl, serviceKey)
}

// ---------------------------------------------------------------------------
// appendActivityEvent — helper to append to JSONB activity_log
// ---------------------------------------------------------------------------

type ActivityEvent = {
  type: string
  at: string
  by_id: string
  note: string | null
}

async function appendActivityEvent(
  db: Parameters<Parameters<typeof withRls>[1]>[0],
  workOrderId: string,
  event: ActivityEvent
): Promise<void> {
  await db
    .update(workOrders)
    .set({
      activity_log: sql`COALESCE(activity_log, '[]'::jsonb) || ${JSON.stringify([event])}::jsonb`,
      updated_at: new Date(),
    })
    .where(eq(workOrders.id, workOrderId))
}

// ---------------------------------------------------------------------------
// Types for WO create dialog
// ---------------------------------------------------------------------------

export interface CustomerForWo {
  id: string
  full_name: string
  pools: Array<{ id: string; name: string; type: string }>
}

// ---------------------------------------------------------------------------
// getCustomersForWo
// ---------------------------------------------------------------------------

/**
 * Returns customers with their pools for the WO create dialog.
 * Two separate queries to avoid RLS correlated subquery pitfall (MEMORY.md).
 */
export async function getCustomersForWo(): Promise<CustomerForWo[]> {
  const token = await getRlsToken()
  if (!token) return []

  try {
    return await withRls(token, async (db) => {
      const customerRows = await db
        .select({ id: customers.id, full_name: customers.full_name })
        .from(customers)
        .orderBy(customers.full_name)

      if (customerRows.length === 0) return []

      const customerIds = customerRows.map((c) => c.id)
      const poolRows = await db
        .select({
          id: pools.id,
          customer_id: pools.customer_id,
          name: pools.name,
          type: pools.type,
        })
        .from(pools)
        .where(inArray(pools.customer_id, customerIds))

      const poolsByCustomer: Record<string, Array<{ id: string; name: string; type: string }>> = {}
      for (const p of poolRows) {
        if (!poolsByCustomer[p.customer_id]) poolsByCustomer[p.customer_id] = []
        poolsByCustomer[p.customer_id].push({ id: p.id, name: p.name, type: p.type })
      }

      return customerRows.map((c) => ({
        id: c.id,
        full_name: c.full_name,
        pools: poolsByCustomer[c.id] ?? [],
      }))
    })
  } catch (err) {
    console.error("[getCustomersForWo] Error:", err)
    return []
  }
}

// ---------------------------------------------------------------------------
// getTechProfiles — for WO assignment dialogs
// ---------------------------------------------------------------------------

export interface TechProfile {
  id: string
  full_name: string
}

/**
 * Returns all tech-role profiles for the org.
 * Used by the WO assignment/scheduling dialogs.
 */
export async function getTechProfiles(): Promise<TechProfile[]> {
  const token = await getRlsToken()
  if (!token) return []

  try {
    return await withRls(token, async (db) => {
      const rows = await db
        .select({ id: profiles.id, full_name: profiles.full_name })
        .from(profiles)
        .where(eq(profiles.role, "tech"))
        .orderBy(profiles.full_name)

      return rows.map((r) => ({ id: r.id, full_name: r.full_name }))
    })
  } catch (err) {
    console.error("[getTechProfiles] Error:", err)
    return []
  }
}

// ---------------------------------------------------------------------------
// getWorkOrders
// ---------------------------------------------------------------------------

/**
 * Fetches the WO list with customer, pool, and tech name joins.
 * Filters by status[], priority, techId, customerId.
 * Ordered by priority (emergency first) then created_at desc.
 */
export async function getWorkOrders(
  filters?: WorkOrderFilters
): Promise<WorkOrderSummary[]> {
  const token = await getRlsToken()
  if (!token) return []

  try {
    return await withRls(token, async (db) => {
      const rows = await db
        .select({
          id: workOrders.id,
          org_id: workOrders.org_id,
          customer_id: workOrders.customer_id,
          pool_id: workOrders.pool_id,
          assigned_tech_id: workOrders.assigned_tech_id,
          title: workOrders.title,
          description: workOrders.description,
          category: workOrders.category,
          priority: workOrders.priority,
          status: workOrders.status,
          severity: workOrders.severity,
          target_date: workOrders.target_date,
          completed_at: workOrders.completed_at,
          cancelled_at: workOrders.cancelled_at,
          flagged_by_tech_id: workOrders.flagged_by_tech_id,
          tax_exempt: workOrders.tax_exempt,
          created_at: workOrders.created_at,
          updated_at: workOrders.updated_at,
          customerName: customers.full_name,
          poolName: pools.name,
          techName: profiles.full_name,
        })
        .from(workOrders)
        .leftJoin(customers, eq(workOrders.customer_id, customers.id))
        .leftJoin(pools, eq(workOrders.pool_id, pools.id))
        .leftJoin(profiles, eq(workOrders.assigned_tech_id, profiles.id))
        .where(
          and(
            ...[
              filters?.status && filters.status.length > 0
                ? inArray(workOrders.status, filters.status)
                : undefined,
              filters?.priority
                ? eq(workOrders.priority, filters.priority)
                : undefined,
              filters?.techId
                ? eq(workOrders.assigned_tech_id, filters.techId)
                : undefined,
              filters?.customerId
                ? eq(workOrders.customer_id, filters.customerId)
                : undefined,
            ].filter(Boolean) as Parameters<typeof and>
          )
        )
        .orderBy(desc(workOrders.created_at))

      // Sort by priority in application layer (emergency→high→normal→low)
      return rows
        .sort((a, b) => {
          const pa = PRIORITY_ORDER[a.priority] ?? 2
          const pb = PRIORITY_ORDER[b.priority] ?? 2
          return pa !== pb
            ? pa - pb
            : b.created_at.getTime() - a.created_at.getTime()
        })
        .map((r) => ({
          ...r,
          customerName: r.customerName ?? "Unknown Customer",
          poolName: r.poolName ?? null,
          techName: r.techName ?? null,
        }))
    })
  } catch (err) {
    console.error("[getWorkOrders] Error:", err)
    return []
  }
}

// ---------------------------------------------------------------------------
// getWorkOrder
// ---------------------------------------------------------------------------

/**
 * Fetches a single WO with all relations: customer, pool, assigned tech,
 * created by, flagged by tech, line items (ordered by sort_order), quotes.
 */
export async function getWorkOrder(id: string): Promise<WorkOrderDetail | null> {
  const token = await getRlsToken()
  if (!token) return null

  try {
    return await withRls(token, async (db) => {
      // ── 1. Fetch WO with customer, pool, tech, createdBy, flaggedByTech ──
      // Multiple profile joins require aliases — use separate queries to avoid
      // Drizzle join alias complexity (per MEMORY.md: avoid correlated subqueries)
      const woRows = await db
        .select({
          id: workOrders.id,
          org_id: workOrders.org_id,
          customer_id: workOrders.customer_id,
          pool_id: workOrders.pool_id,
          created_by_id: workOrders.created_by_id,
          assigned_tech_id: workOrders.assigned_tech_id,
          parent_wo_id: workOrders.parent_wo_id,
          title: workOrders.title,
          description: workOrders.description,
          category: workOrders.category,
          priority: workOrders.priority,
          status: workOrders.status,
          severity: workOrders.severity,
          target_date: workOrders.target_date,
          completed_at: workOrders.completed_at,
          completion_notes: workOrders.completion_notes,
          completion_photo_paths: workOrders.completion_photo_paths,
          cancelled_at: workOrders.cancelled_at,
          cancel_reason: workOrders.cancel_reason,
          flagged_by_tech_id: workOrders.flagged_by_tech_id,
          flagged_from_visit_id: workOrders.flagged_from_visit_id,
          tax_exempt: workOrders.tax_exempt,
          discount_type: workOrders.discount_type,
          discount_value: workOrders.discount_value,
          discount_reason: workOrders.discount_reason,
          template_id: workOrders.template_id,
          activity_log: workOrders.activity_log,
          created_at: workOrders.created_at,
          updated_at: workOrders.updated_at,
          customerName: customers.full_name,
          poolName: pools.name,
        })
        .from(workOrders)
        .leftJoin(customers, eq(workOrders.customer_id, customers.id))
        .leftJoin(pools, eq(workOrders.pool_id, pools.id))
        .where(eq(workOrders.id, id))
        .limit(1)

      const wo = woRows[0]
      if (!wo) return null

      // ── 2. Fetch tech name, createdBy name, flaggedBy name separately ──
      // (avoids multi-alias self-join complexity on profiles table)
      const profileIds = [
        wo.assigned_tech_id,
        wo.created_by_id,
        wo.flagged_by_tech_id,
      ].filter(Boolean) as string[]

      const profileMap: Record<string, string> = {}
      if (profileIds.length > 0) {
        const profileRows = await db
          .select({ id: profiles.id, full_name: profiles.full_name })
          .from(profiles)
          .where(inArray(profiles.id, profileIds))

        for (const p of profileRows) {
          profileMap[p.id] = p.full_name
        }
      }

      // ── 3. Fetch line items ────────────────────────────────────────────
      const lineItemRows = await db
        .select({
          id: workOrderLineItems.id,
          work_order_id: workOrderLineItems.work_order_id,
          catalog_item_id: workOrderLineItems.catalog_item_id,
          description: workOrderLineItems.description,
          item_type: workOrderLineItems.item_type,
          labor_type: workOrderLineItems.labor_type,
          quantity: workOrderLineItems.quantity,
          unit: workOrderLineItems.unit,
          unit_cost: workOrderLineItems.unit_cost,
          unit_price: workOrderLineItems.unit_price,
          markup_pct: workOrderLineItems.markup_pct,
          discount_type: workOrderLineItems.discount_type,
          discount_value: workOrderLineItems.discount_value,
          is_taxable: workOrderLineItems.is_taxable,
          is_optional: workOrderLineItems.is_optional,
          actual_hours: workOrderLineItems.actual_hours,
          sort_order: workOrderLineItems.sort_order,
        })
        .from(workOrderLineItems)
        .where(eq(workOrderLineItems.work_order_id, id))
        .orderBy(workOrderLineItems.sort_order)

      // ── 4. Fetch quote summaries ────────────────────────────────────────
      const quoteRows = await db
        .select({
          id: quotes.id,
          quote_number: quotes.quote_number,
          version: quotes.version,
          status: quotes.status,
          expires_at: quotes.expires_at,
          approved_at: quotes.approved_at,
          sent_at: quotes.sent_at,
          created_at: quotes.created_at,
        })
        .from(quotes)
        .where(eq(quotes.work_order_id, id))
        .orderBy(desc(quotes.version))

      return {
        ...wo,
        customerName: wo.customerName ?? "Unknown Customer",
        poolName: wo.poolName ?? null,
        techName: wo.assigned_tech_id ? (profileMap[wo.assigned_tech_id] ?? null) : null,
        createdByName: wo.created_by_id ? (profileMap[wo.created_by_id] ?? null) : null,
        flaggedByTechName: wo.flagged_by_tech_id ? (profileMap[wo.flagged_by_tech_id] ?? null) : null,
        lineItems: lineItemRows.map((li) => ({
          ...li,
          quantity: li.quantity ?? "1",
          unit_cost: li.unit_cost ?? null,
          unit_price: li.unit_price ?? null,
          markup_pct: li.markup_pct ?? null,
          discount_value: li.discount_value ?? null,
          actual_hours: li.actual_hours ?? null,
        })),
        quoteSummaries: quoteRows,
      }
    })
  } catch (err) {
    console.error("[getWorkOrder] Error:", err)
    return null
  }
}

// ---------------------------------------------------------------------------
// createWorkOrder
// ---------------------------------------------------------------------------

/**
 * Creates a new work order. If templateId provided, seeds line items from
 * the template's line_items_snapshot. Initializes activity_log.
 *
 * Returns the created WO id, or null on failure.
 */
export async function createWorkOrder(
  data: CreateWorkOrderInput
): Promise<string | null> {
  const token = await getRlsToken()
  if (!token) return null

  const orgId = token.org_id as string
  const userId = token.sub

  // Resolve flaggedByTechId — if flagFromCurrentUser, use the JWT sub claim
  const resolvedFlaggedByTechId =
    data.flagFromCurrentUser ? userId : (data.flaggedByTechId ?? null)

  try {
    const woId = await withRls(token, async (db) => {
      const now = new Date()

      // ── 1. Create the WO record ────────────────────────────────────────
      const woValues = {
        org_id: orgId,
        customer_id: data.customerId,
        pool_id: data.poolId ?? null,
        created_by_id: userId,
        title: data.title,
        description: data.description ?? null,
        category: data.category ?? "other",
        priority: data.priority ?? "normal",
        severity: data.severity ?? null,
        flagged_by_tech_id: resolvedFlaggedByTechId,
        flagged_from_visit_id: data.flaggedFromVisitId ?? null,
        template_id: data.templateId ?? null,
        activity_log: [
          {
            type: "created",
            at: now.toISOString(),
            by_id: userId,
            note: null,
          },
        ] as Array<{ type: string; at: string; by_id: string; note: string | null }>,
        created_at: now,
        updated_at: now,
      }

      const inserted = await db.insert(workOrders).values(woValues).returning({ id: workOrders.id })
      const newWoId = inserted[0]?.id
      if (!newWoId) throw new Error("Failed to insert work order")

      // ── 2. Seed line items from template if templateId provided ────────
      if (data.templateId) {
        const templateRows = await db
          .select({ line_items_snapshot: woTemplates.line_items_snapshot })
          .from(woTemplates)
          .where(
            and(
              eq(woTemplates.id, data.templateId),
              eq(woTemplates.org_id, orgId)
            )
          )
          .limit(1)

        const snapshot = templateRows[0]?.line_items_snapshot
        if (snapshot && Array.isArray(snapshot) && snapshot.length > 0) {
          const lineItemValues = snapshot.map((item) => ({
            org_id: orgId,
            work_order_id: newWoId,
            description: item.description,
            item_type: item.item_type ?? "part",
            labor_type: item.labor_type ?? null,
            quantity: item.quantity ?? "1",
            unit: item.unit ?? "each",
            unit_cost: item.unit_cost ?? null,
            unit_price: item.unit_price ?? null,
            markup_pct: item.markup_pct ?? null,
            is_taxable: item.is_taxable ?? true,
            is_optional: item.is_optional ?? false,
            sort_order: item.sort_order ?? 0,
          }))

          await db.insert(workOrderLineItems).values(lineItemValues)
        }
      }

      revalidatePath("/work-orders")
      return newWoId
    })

    // ── 3. Fire office alert for tech-flagged WOs (best-effort, non-fatal) ──
    // Uses adminDb because techs cannot INSERT into alerts (RLS: owner+office only).
    // Runs outside withRls transaction so alert failure never rolls back WO creation.
    if (woId && resolvedFlaggedByTechId) {
      await _notifyOfficeWoFlagged(
        orgId,
        woId,
        data.title,
        data.severity ?? null,
        resolvedFlaggedByTechId
      )
    }

    // ── 4. NOTIF-10: Notify owner+office of new WO (fire-and-forget) ─────────
    if (woId) {
      // Fetch customer name for the notification body
      void adminDb
        .select({ full_name: customers.full_name })
        .from(customers)
        .where(eq(customers.id, data.customerId))
        .limit(1)
        .then((rows) => {
          const customerName = rows[0]?.full_name ?? "Customer"
          return notifyOrgRole(orgId, "owner+office", {
            type: "wo_created",
            urgency: "informational",
            title: "Work order created",
            body: `New WO: "${data.title}" for ${customerName}`,
            link: `/work-orders/${woId}`,
          })
        })
        .catch((err) =>
          console.error("[createWorkOrder] NOTIF-10 dispatch failed (non-blocking):", err)
        )
    }

    // ── 5. NOTIF-19: Notify assigned tech (fire-and-forget) ──────────────────
    if (woId && data.flaggedByTechId) {
      void notifyUser(data.flaggedByTechId, orgId, {
        type: "tech_assigned",
        urgency: "informational",
        title: "New work order assigned",
        body: `"${data.title}"`,
        link: `/work-orders/${woId}`,
      }).catch((err) =>
        console.error("[createWorkOrder] NOTIF-19 dispatch failed (non-blocking):", err)
      )
    }

    return woId
  } catch (err) {
    console.error("[createWorkOrder] Error:", err)
    return null
  }
}

// ---------------------------------------------------------------------------
// _notifyOfficeWoFlagged — internal helper for flagged WO office alerts
// ---------------------------------------------------------------------------

/**
 * Fires an office alert when a tech flags a WO from a service stop.
 * Uses adminDb because techs cannot INSERT into alerts (RLS: owner+office only).
 * Checks org_settings.wo_notify_office_on_flag before inserting.
 */
async function _notifyOfficeWoFlagged(
  orgId: string,
  woId: string,
  woTitle: string,
  severity: string | null,
  techId: string
): Promise<void> {
  try {
    // Check org_settings.wo_notify_office_on_flag
    const settingsRows = await adminDb
      .select({ wo_notify_office_on_flag: orgSettings.wo_notify_office_on_flag })
      .from(orgSettings)
      .where(eq(orgSettings.org_id, orgId))
      .limit(1)

    const notify = settingsRows[0]?.wo_notify_office_on_flag ?? true
    if (!notify) return

    // Fetch tech name for the alert message
    const techRows = await adminDb
      .select({ full_name: profiles.full_name })
      .from(profiles)
      .where(eq(profiles.id, techId))
      .limit(1)
    const techName = techRows[0]?.full_name ?? "Tech"

    // Map WO severity to alert severity: routine→info, urgent→warning, emergency→critical
    const alertSeverity =
      severity === "emergency" ? "critical"
      : severity === "urgent" ? "warning"
      : "info"

    await adminDb
      .insert(alerts)
      .values({
        org_id: orgId,
        alert_type: "work_order_flagged",
        severity: alertSeverity,
        reference_id: woId,
        reference_type: "work_order",
        title: `Issue flagged by ${techName}: ${woTitle}`,
        metadata: { techId, woId, severity },
      })
      .onConflictDoNothing()
  } catch (err) {
    // Non-fatal — alert is best-effort, don't fail the WO creation
    console.error("[createWorkOrder] Failed to create flagged-issue alert:", err)
  }
}

// ---------------------------------------------------------------------------
// updateWorkOrder
// ---------------------------------------------------------------------------

/**
 * Updates WO metadata fields and appends an activity_log event.
 */
export async function updateWorkOrder(
  id: string,
  data: UpdateWorkOrderInput
): Promise<{ success: boolean; error?: string }> {
  const token = await getRlsToken()
  if (!token) return { success: false, error: "Not authenticated" }

  const userId = token.sub

  try {
    await withRls(token, async (db) => {
      const updates: Partial<typeof workOrders.$inferInsert> = {
        updated_at: new Date(),
      }

      if (data.title !== undefined) updates.title = data.title
      if (data.description !== undefined) updates.description = data.description
      if (data.category !== undefined) updates.category = data.category
      if (data.priority !== undefined) updates.priority = data.priority
      if (data.assignedTechId !== undefined) updates.assigned_tech_id = data.assignedTechId
      if (data.targetDate !== undefined) updates.target_date = data.targetDate

      await db.update(workOrders).set(updates).where(eq(workOrders.id, id))

      await appendActivityEvent(db, id, {
        type: "updated",
        at: new Date().toISOString(),
        by_id: userId,
        note: null,
      })
    })

    revalidatePath("/work-orders")
    revalidatePath(`/work-orders/${id}`)
    return { success: true }
  } catch (err) {
    console.error("[updateWorkOrder] Error:", err)
    return { success: false, error: err instanceof Error ? err.message : "Unknown error" }
  }
}

// ---------------------------------------------------------------------------
// updateWorkOrderStatus
// ---------------------------------------------------------------------------

/**
 * Transitions WO status with validation of allowed transitions.
 * Handles status-specific side effects (scheduled, complete, cancelled).
 */
export async function updateWorkOrderStatus(
  id: string,
  newStatus: WorkOrderStatus,
  extra?: UpdateStatusExtra
): Promise<{ success: boolean; error?: string }> {
  const token = await getRlsToken()
  if (!token) return { success: false, error: "Not authenticated" }

  const userId = token.sub
  const orgId = token.org_id as string

  // Allowed transitions map
  const ALLOWED_TRANSITIONS: Record<string, WorkOrderStatus[]> = {
    draft: ["quoted", "approved", "cancelled"],
    quoted: ["approved", "cancelled"],
    approved: ["scheduled", "cancelled"],
    scheduled: ["in_progress", "cancelled"],
    in_progress: ["complete", "cancelled"],
    complete: ["invoiced"],
    invoiced: [],
    cancelled: [],
  }

  try {
    const result = await withRls(token, async (db) => {
      // Fetch current status
      const current = await db
        .select({ status: workOrders.status })
        .from(workOrders)
        .where(eq(workOrders.id, id))
        .limit(1)

      const currentStatus = current[0]?.status
      if (!currentStatus) {
        return { success: false, error: "Work order not found" }
      }

      const allowed = ALLOWED_TRANSITIONS[currentStatus] ?? []
      if (!allowed.includes(newStatus)) {
        return {
          success: false,
          error: `Cannot transition from '${currentStatus}' to '${newStatus}'`,
        }
      }

      const now = new Date()
      const updates: Partial<typeof workOrders.$inferInsert> = {
        status: newStatus,
        updated_at: now,
      }

      // Status-specific updates
      if (newStatus === "scheduled") {
        if (!extra?.assignedTechId) {
          return { success: false, error: "assignedTechId required for scheduling" }
        }
        if (!extra?.targetDate) {
          return { success: false, error: "targetDate required for scheduling" }
        }
        updates.assigned_tech_id = extra.assignedTechId
        updates.target_date = extra.targetDate
      }

      if (newStatus === "complete") {
        updates.completed_at = now
        if (extra?.completionNotes) updates.completion_notes = extra.completionNotes
        if (extra?.completionPhotoPaths) updates.completion_photo_paths = extra.completionPhotoPaths
      }

      if (newStatus === "cancelled") {
        if (!extra?.cancelReason) {
          return { success: false, error: "cancelReason required for cancellation" }
        }
        updates.cancelled_at = now
        updates.cancelled_by_id = userId
        updates.cancel_reason = extra.cancelReason
      }

      await db.update(workOrders).set(updates).where(eq(workOrders.id, id))

      await appendActivityEvent(db, id, {
        type: `status_${newStatus}`,
        at: now.toISOString(),
        by_id: userId,
        note: newStatus === "cancelled" ? (extra?.cancelReason ?? null) : null,
      })

      revalidatePath("/work-orders")
      revalidatePath(`/work-orders/${id}`)
      return { success: true }
    })

    // ── Customer notification on completion (best-effort, non-fatal) ───────
    // Note: Actual customer email/SMS is handled by Phase 7 notifications.
    // Here we insert an info alert for office visibility of the completion.
    if (result.success && newStatus === "complete") {
      void _notifyOfficeWoCompleted(orgId, id, userId)
    }

    // ── NOTIF-10: Notify owner+office of WO status change (fire-and-forget) ──
    if (result.success) {
      void adminDb
        .select({
          title: workOrders.title,
          customer_id: workOrders.customer_id,
          assigned_tech_id: workOrders.assigned_tech_id,
        })
        .from(workOrders)
        .where(eq(workOrders.id, id))
        .limit(1)
        .then(async (rows) => {
          const wo = rows[0]
          if (!wo) return

          const customerRows = await adminDb
            .select({ full_name: customers.full_name, phone: customers.phone })
            .from(customers)
            .where(eq(customers.id, wo.customer_id))
            .limit(1)
          const customerName = customerRows[0]?.full_name ?? "Customer"
          const customerPhone = customerRows[0]?.phone ?? null

          const notifType = newStatus === "complete" ? "wo_completed" : "wo_updated"
          await notifyOrgRole(orgId, "owner+office", {
            type: notifType,
            urgency: "informational",
            title: newStatus === "complete" ? "Work order completed" : "Work order updated",
            body: `"${wo.title}" for ${customerName} — status: ${newStatus}`,
            link: `/work-orders/${id}`,
          })

          // ── NOTIF-19: Notify assigned tech if status changed to 'scheduled' ──
          if (newStatus === "scheduled" && extra?.assignedTechId) {
            await notifyUser(extra.assignedTechId, orgId, {
              type: "tech_assigned",
              urgency: "informational",
              title: "Work order scheduled",
              body: `"${wo.title}" for ${customerName}`,
              link: `/work-orders/${id}`,
            })
          }

          // ── NOTIF-31: Send wo_status_sms to customer (fire-and-forget) ─────
          if (customerPhone) {
            try {
              const orgRows = await adminDb
                .select({ name: orgs.name })
                .from(orgs)
                .where(eq(orgs.id, orgId))
                .limit(1)
              const companyName = orgRows[0]?.name ?? "Your pool service"

              const smsTemplate = await getResolvedTemplate(orgId, "wo_status_sms", {
                customer_name: customerName,
                company_name: companyName,
                wo_title: wo.title,
                status: newStatus,
              })
              if (smsTemplate?.sms_text) {
                const adminSupabase = getAdminSupabaseClient()
                await adminSupabase.functions.invoke("send-sms", {
                  body: { to: customerPhone, text: smsTemplate.sms_text, orgId },
                })
              }
            } catch (smsErr) {
              console.error("[updateWorkOrderStatus] NOTIF-31 SMS failed (non-blocking):", smsErr)
            }
          }
        })
        .catch((err) =>
          console.error("[updateWorkOrderStatus] NOTIF-10/19/31 dispatch failed (non-blocking):", err)
        )
    }

    return result
  } catch (err) {
    console.error("[updateWorkOrderStatus] Error:", err)
    return { success: false, error: err instanceof Error ? err.message : "Unknown error" }
  }
}

// ---------------------------------------------------------------------------
// createFollowUpWorkOrder
// ---------------------------------------------------------------------------

/**
 * Creates a new draft WO pre-filled from a parent WO. Appends a
 * 'follow_up_created' event to the parent's activity log.
 *
 * Returns the new WO id, or null on failure.
 */
export async function createFollowUpWorkOrder(parentWoId: string): Promise<string | null> {
  const token = await getRlsToken()
  if (!token) return null

  const orgId = token.org_id as string
  const userId = token.sub

  try {
    return await withRls(token, async (db) => {
      // Fetch parent WO
      const parentRows = await db
        .select({
          customer_id: workOrders.customer_id,
          pool_id: workOrders.pool_id,
          category: workOrders.category,
          title: workOrders.title,
        })
        .from(workOrders)
        .where(eq(workOrders.id, parentWoId))
        .limit(1)

      const parent = parentRows[0]
      if (!parent) throw new Error("Parent work order not found")

      const now = new Date()

      const inserted = await db
        .insert(workOrders)
        .values({
          org_id: orgId,
          customer_id: parent.customer_id,
          pool_id: parent.pool_id,
          created_by_id: userId,
          parent_wo_id: parentWoId,
          title: `Follow-up: ${parent.title}`,
          category: parent.category,
          priority: "normal",
          status: "draft",
          activity_log: [
            {
              type: "created",
              at: now.toISOString(),
              by_id: userId,
              note: `Follow-up from WO ${parentWoId}`,
            },
          ] as Array<{ type: string; at: string; by_id: string; note: string | null }>,
          created_at: now,
          updated_at: now,
        })
        .returning({ id: workOrders.id })

      const newWoId = inserted[0]?.id
      if (!newWoId) throw new Error("Failed to insert follow-up work order")

      // Append event to parent's activity log
      await appendActivityEvent(db, parentWoId, {
        type: "follow_up_created",
        at: now.toISOString(),
        by_id: userId,
        note: `Follow-up WO created: ${newWoId}`,
      })

      revalidatePath("/work-orders")
      return newWoId
    })
  } catch (err) {
    console.error("[createFollowUpWorkOrder] Error:", err)
    return null
  }
}

// ---------------------------------------------------------------------------
// addLineItemToWorkOrder
// ---------------------------------------------------------------------------

export interface AddLineItemInput {
  catalogItemId?: string
  description: string
  itemType: "part" | "labor" | "other"
  laborType?: "hourly" | "flat_rate"
  quantity: string
  unit: string
  unitCost?: string
  unitPrice?: string
  markupPct?: string
  discountType?: "percent" | "fixed"
  discountValue?: string
  isTaxable: boolean
  isOptional: boolean
  actualHours?: string
}

/**
 * Adds a line item to a work order.
 * Returns the new line item id, or null on failure.
 */
export async function addLineItemToWorkOrder(
  workOrderId: string,
  data: AddLineItemInput
): Promise<{ success: boolean; id?: string; error?: string }> {
  const token = await getRlsToken()
  if (!token) return { success: false, error: "Not authenticated" }

  const orgId = token.org_id as string

  try {
    const result = await withRls(token, async (db) => {
      // Get current max sort_order for this WO
      const existing = await db
        .select({ sort_order: workOrderLineItems.sort_order })
        .from(workOrderLineItems)
        .where(eq(workOrderLineItems.work_order_id, workOrderId))
        .orderBy(desc(workOrderLineItems.sort_order))
        .limit(1)

      const nextSort = existing.length > 0 ? (existing[0].sort_order ?? 0) + 1 : 0

      const inserted = await db
        .insert(workOrderLineItems)
        .values({
          org_id: orgId,
          work_order_id: workOrderId,
          catalog_item_id: data.catalogItemId ?? null,
          description: data.description,
          item_type: data.itemType,
          labor_type: data.laborType ?? null,
          quantity: data.quantity,
          unit: data.unit,
          unit_cost: data.unitCost ?? null,
          unit_price: data.unitPrice ?? null,
          markup_pct: data.markupPct ?? null,
          discount_type: data.discountType ?? null,
          discount_value: data.discountValue ?? null,
          is_taxable: data.isTaxable,
          is_optional: data.isOptional,
          actual_hours: data.actualHours ?? null,
          sort_order: nextSort,
        })
        .returning({ id: workOrderLineItems.id })

      return inserted[0]?.id ?? null
    })

    revalidatePath(`/work-orders/${workOrderId}`)
    return { success: true, id: result ?? undefined }
  } catch (err) {
    console.error("[addLineItemToWorkOrder] Error:", err)
    return { success: false, error: err instanceof Error ? err.message : "Unknown error" }
  }
}

// ---------------------------------------------------------------------------
// updateLineItem
// ---------------------------------------------------------------------------

/**
 * Updates a line item's fields.
 */
export async function updateLineItem(
  lineItemId: string,
  data: Partial<AddLineItemInput> & { workOrderId?: string }
): Promise<{ success: boolean; error?: string }> {
  const token = await getRlsToken()
  if (!token) return { success: false, error: "Not authenticated" }

  try {
    await withRls(token, async (db) => {
      const updates: Partial<typeof workOrderLineItems.$inferInsert> = {}

      if (data.catalogItemId !== undefined) updates.catalog_item_id = data.catalogItemId
      if (data.description !== undefined) updates.description = data.description
      if (data.itemType !== undefined) updates.item_type = data.itemType
      if (data.laborType !== undefined) updates.labor_type = data.laborType
      if (data.quantity !== undefined) updates.quantity = data.quantity
      if (data.unit !== undefined) updates.unit = data.unit
      if (data.unitCost !== undefined) updates.unit_cost = data.unitCost
      if (data.unitPrice !== undefined) updates.unit_price = data.unitPrice
      if (data.markupPct !== undefined) updates.markup_pct = data.markupPct
      if (data.discountType !== undefined) updates.discount_type = data.discountType
      if (data.discountValue !== undefined) updates.discount_value = data.discountValue
      if (data.isTaxable !== undefined) updates.is_taxable = data.isTaxable
      if (data.isOptional !== undefined) updates.is_optional = data.isOptional
      if (data.actualHours !== undefined) updates.actual_hours = data.actualHours

      await db
        .update(workOrderLineItems)
        .set(updates)
        .where(eq(workOrderLineItems.id, lineItemId))
    })

    if (data.workOrderId) {
      revalidatePath(`/work-orders/${data.workOrderId}`)
    }
    return { success: true }
  } catch (err) {
    console.error("[updateLineItem] Error:", err)
    return { success: false, error: err instanceof Error ? err.message : "Unknown error" }
  }
}

// ---------------------------------------------------------------------------
// deleteLineItem
// ---------------------------------------------------------------------------

/**
 * Deletes a line item permanently.
 */
export async function deleteLineItem(
  lineItemId: string,
  workOrderId: string
): Promise<{ success: boolean; error?: string }> {
  const token = await getRlsToken()
  if (!token) return { success: false, error: "Not authenticated" }

  try {
    await withRls(token, async (db) => {
      await db
        .delete(workOrderLineItems)
        .where(eq(workOrderLineItems.id, lineItemId))
    })

    revalidatePath(`/work-orders/${workOrderId}`)
    return { success: true }
  } catch (err) {
    console.error("[deleteLineItem] Error:", err)
    return { success: false, error: err instanceof Error ? err.message : "Unknown error" }
  }
}

// ---------------------------------------------------------------------------
// reorderLineItems
// ---------------------------------------------------------------------------

/**
 * Updates sort_order for each line item based on orderedIds array position.
 */
export async function reorderLineItems(
  workOrderId: string,
  orderedIds: string[]
): Promise<{ success: boolean; error?: string }> {
  const token = await getRlsToken()
  if (!token) return { success: false, error: "Not authenticated" }

  try {
    await withRls(token, async (db) => {
      for (let i = 0; i < orderedIds.length; i++) {
        await db
          .update(workOrderLineItems)
          .set({ sort_order: i })
          .where(
            and(
              eq(workOrderLineItems.id, orderedIds[i]),
              eq(workOrderLineItems.work_order_id, workOrderId)
            )
          )
      }
    })

    revalidatePath(`/work-orders/${workOrderId}`)
    return { success: true }
  } catch (err) {
    console.error("[reorderLineItems] Error:", err)
    return { success: false, error: err instanceof Error ? err.message : "Unknown error" }
  }
}

// ---------------------------------------------------------------------------
// updateLineItemActualHours
// ---------------------------------------------------------------------------

/**
 * Updates actual_hours on a line item (used by techs at WO completion time).
 * Tech role is allowed per work_order_line_items RLS — owner+office only for updates.
 *
 * Note: The WO line_items UPDATE policy only allows owner+office. Techs log
 * actual hours by calling this action which uses the tech's RLS context.
 * If the RLS blocks the update, we gracefully surface the error.
 */
export async function updateLineItemActualHours(
  lineItemId: string,
  actualHours: string
): Promise<{ success: boolean; error?: string }> {
  const token = await getRlsToken()
  if (!token) return { success: false, error: "Not authenticated" }

  try {
    await withRls(token, async (db) => {
      await db
        .update(workOrderLineItems)
        .set({ actual_hours: actualHours })
        .where(eq(workOrderLineItems.id, lineItemId))
    })

    return { success: true }
  } catch (err) {
    console.error("[updateLineItemActualHours] Error:", err)
    return { success: false, error: err instanceof Error ? err.message : "Unknown error" }
  }
}

// ---------------------------------------------------------------------------
// getAssignedWorkOrders
// ---------------------------------------------------------------------------

/**
 * Fetches WOs assigned to the current tech user with status 'scheduled' or
 * 'in_progress'. Used for the tech's "My Work Orders" view.
 */
export async function getAssignedWorkOrders(): Promise<WorkOrderSummary[]> {
  const token = await getRlsToken()
  if (!token) return []

  const userId = token.sub

  try {
    return await withRls(token, async (db) => {
      const rows = await db
        .select({
          id: workOrders.id,
          org_id: workOrders.org_id,
          customer_id: workOrders.customer_id,
          pool_id: workOrders.pool_id,
          assigned_tech_id: workOrders.assigned_tech_id,
          title: workOrders.title,
          description: workOrders.description,
          category: workOrders.category,
          priority: workOrders.priority,
          status: workOrders.status,
          severity: workOrders.severity,
          target_date: workOrders.target_date,
          completed_at: workOrders.completed_at,
          cancelled_at: workOrders.cancelled_at,
          flagged_by_tech_id: workOrders.flagged_by_tech_id,
          tax_exempt: workOrders.tax_exempt,
          created_at: workOrders.created_at,
          updated_at: workOrders.updated_at,
          customerName: customers.full_name,
          poolName: pools.name,
          techName: profiles.full_name,
        })
        .from(workOrders)
        .leftJoin(customers, eq(workOrders.customer_id, customers.id))
        .leftJoin(pools, eq(workOrders.pool_id, pools.id))
        .leftJoin(profiles, eq(workOrders.assigned_tech_id, profiles.id))
        .where(
          and(
            eq(workOrders.assigned_tech_id, userId),
            inArray(workOrders.status, ["scheduled", "in_progress"])
          )
        )
        .orderBy(workOrders.target_date, desc(workOrders.created_at))

      return rows.map((r) => ({
        ...r,
        customerName: r.customerName ?? "Unknown Customer",
        poolName: r.poolName ?? null,
        techName: r.techName ?? null,
      }))
    })
  } catch (err) {
    console.error("[getAssignedWorkOrders] Error:", err)
    return []
  }
}

// ---------------------------------------------------------------------------
// _notifyOfficeWoCompleted — internal helper for WO completion office alert
// ---------------------------------------------------------------------------

/**
 * Inserts an info alert for the office when a WO is marked complete.
 * Uses adminDb. Checks org_settings.wo_notify_customer_on_complete for
 * customer notification intent (actual email/SMS is Phase 7).
 */
async function _notifyOfficeWoCompleted(
  orgId: string,
  woId: string,
  completedById: string
): Promise<void> {
  try {
    // Fetch WO title and customer name for the alert message
    const woRows = await adminDb
      .select({
        title: workOrders.title,
        customerName: customers.full_name,
      })
      .from(workOrders)
      .leftJoin(customers, eq(workOrders.customer_id, customers.id))
      .where(eq(workOrders.id, woId))
      .limit(1)

    const wo = woRows[0]
    if (!wo) return

    // Check org_settings.wo_notify_customer_on_complete
    const settingsRows = await adminDb
      .select({ wo_notify_customer_on_complete: orgSettings.wo_notify_customer_on_complete })
      .from(orgSettings)
      .where(eq(orgSettings.org_id, orgId))
      .limit(1)

    const notifyCustomer = settingsRows[0]?.wo_notify_customer_on_complete ?? true

    await adminDb
      .insert(alerts)
      .values({
        org_id: orgId,
        alert_type: "work_order_flagged", // re-use type for WO lifecycle events
        severity: "info",
        reference_id: woId,
        reference_type: "work_order",
        title: `Work order completed: ${wo.title}${notifyCustomer ? " — customer notification pending" : ""}`,
        metadata: { woId, completedById, customerName: wo.customerName, notifyCustomer },
      })
      .onConflictDoNothing()
  } catch (err) {
    // Non-fatal
    console.error("[updateWorkOrderStatus] Failed to create completion alert:", err)
  }
}
