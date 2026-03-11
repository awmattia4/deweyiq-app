"use server"

import { revalidatePath } from "next/cache"
import { createClient } from "@/lib/supabase/server"
import { withRls } from "@/lib/db"
import type { SupabaseToken } from "@/lib/db"
import {
  workOrders,
  workOrderLineItems,
  customers,
  pools,
  profiles,
  quotes,
  woTemplates,
} from "@/lib/db/schema"
import {
  eq,
  and,
  desc,
  inArray,
  sql,
} from "drizzle-orm"

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
  flaggedByTechId?: string
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

  try {
    return await withRls(token, async (db) => {
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
        flagged_by_tech_id: data.flaggedByTechId ?? null,
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
      const woId = inserted[0]?.id
      if (!woId) throw new Error("Failed to insert work order")

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
            work_order_id: woId,
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
      return woId
    })
  } catch (err) {
    console.error("[createWorkOrder] Error:", err)
    return null
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
    return await withRls(token, async (db) => {
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
