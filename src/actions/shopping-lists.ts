"use server"

/**
 * Phase 13: Shopping List Actions
 *
 * Full CRUD and procurement lifecycle for shopping list items:
 * needed -> ordered -> received -> loaded -> used
 *
 * Also provides:
 * - Auto-generation from WO parts, low truck inventory, and route forecasting
 * - Parts-ready status check for work orders
 * - Urgency flag management
 *
 * CRITICAL: Uses LEFT JOIN + GROUP BY for aggregation (never correlated subqueries
 * inside withRls — per MEMORY.md drizzle-rls-pitfalls).
 */

import { createClient } from "@/lib/supabase/server"
import { withRls, getRlsToken, adminDb } from "@/lib/db"
import {
  shoppingListItems,
  workOrderLineItems,
  truckInventory,
  routeStops,
  serviceVisits,
} from "@/lib/db/schema"
import { eq, and, or, isNull, inArray, sql, desc, asc, notInArray } from "drizzle-orm"

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type ShoppingListStatus = "needed" | "ordered" | "received" | "loaded" | "used"

export interface ShoppingListItem {
  id: string
  org_id: string
  tech_id: string | null
  catalog_item_id: string | null
  chemical_product_id: string | null
  item_name: string
  category: string
  quantity_needed: string
  unit: string
  source_type: string | null
  source_work_order_id: string | null
  source_project_id: string | null
  source_inventory_item_id: string | null
  status: string
  ordered_at: Date | null
  ordered_by_id: string | null
  vendor: string | null
  po_reference: string | null
  received_at: Date | null
  received_by_id: string | null
  loaded_at: Date | null
  loaded_by_id: string | null
  used_at: Date | null
  used_by_id: string | null
  is_urgent: boolean
  urgent_reason: string | null
  notes: string | null
  created_at: Date
  updated_at: Date
}

export interface AddShoppingListItemInput {
  itemName: string
  category: string
  quantityNeeded: number
  unit: string
  techId?: string | null
  sourceType?: string | null
  sourceWorkOrderId?: string | null
  sourceProjectId?: string | null
  sourceInventoryItemId?: string | null
  isUrgent?: boolean
  urgentReason?: string | null
  notes?: string | null
  catalogItemId?: string | null
  chemicalProductId?: string | null
}

export interface TransitionData {
  vendor?: string
  po_reference?: string
}

export interface PartsReadyStatus {
  ready: boolean
  total: number
  loaded: number
  items: Array<{
    id: string
    description: string
    quantity: string
    unit: string
    status: string | null
    shoppingListItemId: string | null
  }>
}

// Valid lifecycle transitions
const VALID_TRANSITIONS: Record<ShoppingListStatus, ShoppingListStatus | null> = {
  needed: "ordered",
  ordered: "received",
  received: "loaded",
  loaded: "used",
  used: null,
}

// ---------------------------------------------------------------------------
// getShoppingList
// ---------------------------------------------------------------------------

/**
 * Fetches shopping list items.
 * - If techId provided: tech's items + shared org items (null tech_id)
 * - If null: all org items (for office view)
 * Ordered: urgent first, then by status (needed first), then by created_at desc
 */
export async function getShoppingList(techId?: string | null) {
  const token = await getRlsToken()
  if (!token) return []

  return withRls(token, async (db) => {
    const items = await db
      .select()
      .from(shoppingListItems)
      .where(
        techId
          ? or(
              eq(shoppingListItems.tech_id, techId),
              isNull(shoppingListItems.tech_id)
            )
          : undefined
      )
      .orderBy(
        desc(shoppingListItems.is_urgent),
        // Status sort: needed < ordered < received < loaded < used
        sql`CASE ${shoppingListItems.status}
          WHEN 'needed' THEN 0
          WHEN 'ordered' THEN 1
          WHEN 'received' THEN 2
          WHEN 'loaded' THEN 3
          WHEN 'used' THEN 4
          ELSE 5
        END`,
        desc(shoppingListItems.created_at)
      )

    return items as ShoppingListItem[]
  })
}

// ---------------------------------------------------------------------------
// addShoppingListItem
// ---------------------------------------------------------------------------

export async function addShoppingListItem(data: AddShoppingListItemInput) {
  const token = await getRlsToken()
  if (!token || !token.org_id) throw new Error("Not authenticated")

  const orgId = token.org_id as string

  return withRls(token, async (db) => {
    const [newItem] = await db
      .insert(shoppingListItems)
      .values({
        org_id: orgId,
        tech_id: data.techId ?? null,
        catalog_item_id: data.catalogItemId ?? null,
        chemical_product_id: data.chemicalProductId ?? null,
        item_name: data.itemName,
        category: data.category,
        quantity_needed: String(data.quantityNeeded),
        unit: data.unit,
        source_type: data.sourceType ?? "manual",
        source_work_order_id: data.sourceWorkOrderId ?? null,
        source_project_id: data.sourceProjectId ?? null,
        source_inventory_item_id: data.sourceInventoryItemId ?? null,
        is_urgent: data.isUrgent ?? false,
        urgent_reason: data.urgentReason ?? null,
        notes: data.notes ?? null,
      })
      .returning()

    return newItem as ShoppingListItem
  })
}

// ---------------------------------------------------------------------------
// transitionShoppingListItem
// ---------------------------------------------------------------------------

/**
 * Moves a shopping list item through the lifecycle:
 * needed -> ordered -> received -> loaded -> used
 *
 * Validates transitions are sequential. Records timestamps and user attribution.
 */
export async function transitionShoppingListItem(
  itemId: string,
  newStatus: ShoppingListStatus,
  data?: TransitionData
) {
  const token = await getRlsToken()
  if (!token || !token.org_id || !token.sub) throw new Error("Not authenticated")

  const orgId = token.org_id as string
  const userId = token.sub

  return withRls(token, async (db) => {
    // Fetch current item
    const [current] = await db
      .select()
      .from(shoppingListItems)
      .where(and(eq(shoppingListItems.id, itemId), eq(shoppingListItems.org_id, orgId)))
      .limit(1)

    if (!current) throw new Error("Shopping list item not found")

    const currentStatus = current.status as ShoppingListStatus
    const expectedNext = VALID_TRANSITIONS[currentStatus]

    if (expectedNext !== newStatus) {
      throw new Error(
        `Invalid transition: cannot go from '${currentStatus}' to '${newStatus}'. ` +
          `Expected next status: '${expectedNext ?? "none (already at end)"}'`
      )
    }

    const now = new Date()
    const updatePayload: Record<string, unknown> = {
      status: newStatus,
      updated_at: now,
    }

    // Set timestamp and user attribution for each transition
    switch (newStatus) {
      case "ordered":
        updatePayload.ordered_at = now
        updatePayload.ordered_by_id = userId
        if (data?.vendor) updatePayload.vendor = data.vendor
        if (data?.po_reference) updatePayload.po_reference = data.po_reference
        break
      case "received":
        updatePayload.received_at = now
        updatePayload.received_by_id = userId
        break
      case "loaded":
        updatePayload.loaded_at = now
        updatePayload.loaded_by_id = userId
        break
      case "used":
        updatePayload.used_at = now
        updatePayload.used_by_id = userId
        break
    }

    const [updated] = await db
      .update(shoppingListItems)
      .set(updatePayload)
      .where(and(eq(shoppingListItems.id, itemId), eq(shoppingListItems.org_id, orgId)))
      .returning()

    return updated as ShoppingListItem
  })
}

// ---------------------------------------------------------------------------
// autoGenerateFromWO
// ---------------------------------------------------------------------------

/**
 * Reads work order line items and creates shopping list items for each part.
 * - Only creates items for 'part' type line items (not labor/other)
 * - Deduplicates by (catalog_item_id + source_work_order_id) OR (description + source_work_order_id)
 * - Assigns to the tech assigned to the WO
 */
export async function autoGenerateFromWO(workOrderId: string) {
  const token = await getRlsToken()
  if (!token || !token.org_id) throw new Error("Not authenticated")

  const orgId = token.org_id as string

  return withRls(token, async (db) => {
    // Fetch WO line items (parts only)
    const lineItems = await db
      .select()
      .from(workOrderLineItems)
      .where(
        and(
          eq(workOrderLineItems.work_order_id, workOrderId),
          eq(workOrderLineItems.org_id, orgId),
          eq(workOrderLineItems.item_type, "part")
        )
      )

    if (lineItems.length === 0) return { created: 0, skipped: 0 }

    // Find existing shopping list items for this WO (to deduplicate)
    const existing = await db
      .select()
      .from(shoppingListItems)
      .where(
        and(
          eq(shoppingListItems.org_id, orgId),
          eq(shoppingListItems.source_work_order_id, workOrderId)
        )
      )

    const existingCatalogIds = new Set(
      existing.map((e) => e.catalog_item_id).filter(Boolean)
    )
    const existingDescriptions = new Set(
      existing.map((e) => e.item_name.toLowerCase())
    )

    // Fetch the WO to get the assigned tech_id
    const { workOrders } = await import("@/lib/db/schema")
    const [wo] = await db
      .select({ assigned_tech_id: workOrders.assigned_tech_id })
      .from(workOrders)
      .where(and(eq(workOrders.id, workOrderId), eq(workOrders.org_id, orgId)))
      .limit(1)

    const techId = wo?.assigned_tech_id ?? null

    let created = 0
    let skipped = 0

    for (const lineItem of lineItems) {
      // Deduplicate: skip if already on list for this WO
      const isDuplicate =
        (lineItem.catalog_item_id && existingCatalogIds.has(lineItem.catalog_item_id)) ||
        existingDescriptions.has(lineItem.description.toLowerCase())

      if (isDuplicate) {
        skipped++
        continue
      }

      await db.insert(shoppingListItems).values({
        org_id: orgId,
        tech_id: techId,
        catalog_item_id: lineItem.catalog_item_id ?? null,
        item_name: lineItem.description,
        category: "part",
        quantity_needed: lineItem.quantity,
        unit: lineItem.unit,
        source_type: "work_order",
        source_work_order_id: workOrderId,
      })

      created++
    }

    return { created, skipped }
  })
}

// ---------------------------------------------------------------------------
// autoGenerateFromLowInventory
// ---------------------------------------------------------------------------

/**
 * Scans truck inventory for items below min_threshold.
 * Creates shopping list items with source_type='low_inventory'.
 * Skips items already on the shopping list.
 */
export async function autoGenerateFromLowInventory(techId: string) {
  const token = await getRlsToken()
  if (!token || !token.org_id) throw new Error("Not authenticated")

  const orgId = token.org_id as string

  return withRls(token, async (db) => {
    // Find truck inventory items below threshold
    const lowItems = await db
      .select()
      .from(truckInventory)
      .where(
        and(
          eq(truckInventory.org_id, orgId),
          eq(truckInventory.tech_id, techId),
          // quantity < min_threshold (both are numeric strings from DB)
          sql`CAST(${truckInventory.quantity} AS numeric) < CAST(${truckInventory.min_threshold} AS numeric)`,
          sql`CAST(${truckInventory.min_threshold} AS numeric) > 0`
        )
      )

    if (lowItems.length === 0) return { created: 0, skipped: 0 }

    // Find existing low_inventory items for this tech (to deduplicate)
    const existing = await db
      .select({ source_inventory_item_id: shoppingListItems.source_inventory_item_id })
      .from(shoppingListItems)
      .where(
        and(
          eq(shoppingListItems.org_id, orgId),
          eq(shoppingListItems.tech_id, techId),
          eq(shoppingListItems.source_type, "low_inventory"),
          // Only check active items (not yet ordered/received/loaded/used)
          inArray(shoppingListItems.status, ["needed", "ordered"])
        )
      )

    const existingInventoryItemIds = new Set(
      existing.map((e) => e.source_inventory_item_id).filter(Boolean)
    )

    let created = 0
    let skipped = 0

    for (const item of lowItems) {
      if (existingInventoryItemIds.has(item.id)) {
        skipped++
        continue
      }

      const currentQty = parseFloat(item.quantity)
      const minThreshold = parseFloat(item.min_threshold)
      const needed = Math.max(0, minThreshold - currentQty)

      await db.insert(shoppingListItems).values({
        org_id: orgId,
        tech_id: techId,
        catalog_item_id: item.catalog_item_id ?? null,
        chemical_product_id: item.chemical_product_id ?? null,
        item_name: item.item_name,
        category: item.category,
        quantity_needed: String(needed),
        unit: item.unit,
        source_type: "low_inventory",
        source_inventory_item_id: item.id,
        is_urgent: true,
        urgent_reason: `Below minimum threshold (${currentQty} ${item.unit} remaining, threshold: ${minThreshold} ${item.unit})`,
      })

      created++
    }

    return { created, skipped }
  })
}

// ---------------------------------------------------------------------------
// autoGenerateFromScheduleForecast
// ---------------------------------------------------------------------------

/**
 * Looks at scheduled stops for routeDate, checks dosing history for those pools
 * (average chemical usage from last 4 service visits), and creates shopping list
 * items with source_type='forecast'.
 *
 * CRITICAL: Uses LEFT JOIN + GROUP BY (no correlated subqueries inside withRls).
 */
export async function autoGenerateFromScheduleForecast(techId: string, routeDate: string) {
  const token = await getRlsToken()
  if (!token || !token.org_id) throw new Error("Not authenticated")

  const orgId = token.org_id as string

  return withRls(token, async (db) => {
    // Get today's stops for this tech
    const stops = await db
      .select({ pool_id: routeStops.pool_id })
      .from(routeStops)
      .where(
        and(
          eq(routeStops.org_id, orgId),
          eq(routeStops.tech_id, techId),
          eq(routeStops.scheduled_date, routeDate)
        )
      )

    const poolIds = stops.map((s) => s.pool_id).filter((id): id is string => !!id)
    if (poolIds.length === 0) return { created: 0, skipped: 0 }

    // Get last 4 service visits per pool to calculate avg dosing
    // CRITICAL: Use raw SQL aggregate to avoid correlated subqueries inside withRls
    const recentVisits = await db
      .select({
        pool_id: serviceVisits.pool_id,
        dosing_amounts: serviceVisits.dosing_amounts,
      })
      .from(serviceVisits)
      .where(
        and(
          eq(serviceVisits.org_id, orgId),
          inArray(serviceVisits.pool_id, poolIds)
        )
      )
      .orderBy(desc(serviceVisits.visited_at))
      .limit(poolIds.length * 4)

    // Aggregate dosing data: chemical_product_id -> {total, count, unit, name}
    const chemicalUsage: Record<
      string,
      { total: number; count: number; unit: string; name: string }
    > = {}

    // Cap at 4 visits per pool to prevent skewed data
    const visitCountByPool: Record<string, number> = {}
    for (const visit of recentVisits) {
      if (!visit.pool_id) continue
      visitCountByPool[visit.pool_id] = (visitCountByPool[visit.pool_id] ?? 0) + 1
      if (visitCountByPool[visit.pool_id] > 4) continue
      if (!visit.dosing_amounts) continue
      const dosing = visit.dosing_amounts as Array<{
        chemical_product_id?: string
        amount?: number
        unit?: string
        name?: string
      }>

      for (const d of dosing) {
        if (!d.chemical_product_id || !d.amount) continue
        if (!chemicalUsage[d.chemical_product_id]) {
          chemicalUsage[d.chemical_product_id] = {
            total: 0,
            count: 0,
            unit: d.unit ?? "oz",
            name: d.name ?? d.chemical_product_id,
          }
        }
        chemicalUsage[d.chemical_product_id].total += d.amount
        chemicalUsage[d.chemical_product_id].count++
      }
    }

    if (Object.keys(chemicalUsage).length === 0) return { created: 0, skipped: 0 }

    // Find existing forecast items for this tech on this date to deduplicate
    const existing = await db
      .select({ chemical_product_id: shoppingListItems.chemical_product_id })
      .from(shoppingListItems)
      .where(
        and(
          eq(shoppingListItems.org_id, orgId),
          eq(shoppingListItems.tech_id, techId),
          eq(shoppingListItems.source_type, "forecast"),
          inArray(shoppingListItems.status, ["needed", "ordered"])
        )
      )

    const existingChemicalIds = new Set(
      existing.map((e) => e.chemical_product_id).filter(Boolean)
    )

    let created = 0
    let skipped = 0

    for (const [chemicalProductId, usage] of Object.entries(chemicalUsage)) {
      if (existingChemicalIds.has(chemicalProductId)) {
        skipped++
        continue
      }

      const avgAmount = usage.total / usage.count

      await db.insert(shoppingListItems).values({
        org_id: orgId,
        tech_id: techId,
        chemical_product_id: chemicalProductId,
        item_name: usage.name,
        category: "chemical",
        quantity_needed: String(Math.ceil(avgAmount * poolIds.length)),
        unit: usage.unit,
        source_type: "forecast",
        notes: `Predicted based on avg dosing from ${usage.count} recent visit(s) across ${poolIds.length} scheduled pool(s)`,
      })

      created++
    }

    return { created, skipped }
  })
}

// ---------------------------------------------------------------------------
// getPartsReadyStatus
// ---------------------------------------------------------------------------

/**
 * Checks if all WO part line items have corresponding shopping list items
 * with status 'loaded' or 'used'.
 * Returns: { ready, total, loaded, items }
 */
export async function getPartsReadyStatus(workOrderId: string): Promise<PartsReadyStatus> {
  const token = await getRlsToken()
  if (!token || !token.org_id) {
    return { ready: false, total: 0, loaded: 0, items: [] }
  }

  const orgId = token.org_id as string

  return withRls(token, async (db) => {
    // Get all part line items for this WO
    const lineItems = await db
      .select()
      .from(workOrderLineItems)
      .where(
        and(
          eq(workOrderLineItems.work_order_id, workOrderId),
          eq(workOrderLineItems.org_id, orgId),
          eq(workOrderLineItems.item_type, "part")
        )
      )
      .orderBy(workOrderLineItems.sort_order)

    if (lineItems.length === 0) {
      return { ready: true, total: 0, loaded: 0, items: [] }
    }

    // Get shopping list items linked to this WO — LEFT JOIN approach
    const shoppingItems = await db
      .select()
      .from(shoppingListItems)
      .where(
        and(
          eq(shoppingListItems.org_id, orgId),
          eq(shoppingListItems.source_work_order_id, workOrderId)
        )
      )

    // Build lookup: catalog_item_id -> shopping list item; fallback name match
    const byCatalogId = new Map(
      shoppingItems.filter((s) => s.catalog_item_id).map((s) => [s.catalog_item_id!, s])
    )
    const byName = new Map(
      shoppingItems.map((s) => [s.item_name.toLowerCase(), s])
    )

    let loadedCount = 0
    const items = lineItems.map((li) => {
      const shoppingItem =
        (li.catalog_item_id ? byCatalogId.get(li.catalog_item_id) : null) ??
        byName.get(li.description.toLowerCase()) ??
        null

      const isLoaded =
        shoppingItem?.status === "loaded" || shoppingItem?.status === "used"
      if (isLoaded) loadedCount++

      return {
        id: li.id,
        description: li.description,
        quantity: li.quantity,
        unit: li.unit,
        status: shoppingItem?.status ?? null,
        shoppingListItemId: shoppingItem?.id ?? null,
      }
    })

    return {
      ready: loadedCount === lineItems.length,
      total: lineItems.length,
      loaded: loadedCount,
      items,
    }
  })
}

// ---------------------------------------------------------------------------
// deleteShoppingListItem
// ---------------------------------------------------------------------------

export async function deleteShoppingListItem(itemId: string) {
  const token = await getRlsToken()
  if (!token || !token.org_id) throw new Error("Not authenticated")

  const orgId = token.org_id as string

  return withRls(token, async (db) => {
    await db
      .delete(shoppingListItems)
      .where(and(eq(shoppingListItems.id, itemId), eq(shoppingListItems.org_id, orgId)))
  })
}

// ---------------------------------------------------------------------------
// flagUrgent / unflagUrgent
// ---------------------------------------------------------------------------

export async function flagUrgent(itemId: string, reason: string) {
  const token = await getRlsToken()
  if (!token || !token.org_id) throw new Error("Not authenticated")

  const orgId = token.org_id as string

  return withRls(token, async (db) => {
    const [updated] = await db
      .update(shoppingListItems)
      .set({
        is_urgent: true,
        urgent_reason: reason,
        updated_at: new Date(),
      })
      .where(and(eq(shoppingListItems.id, itemId), eq(shoppingListItems.org_id, orgId)))
      .returning()

    return updated as ShoppingListItem
  })
}

export async function unflagUrgent(itemId: string) {
  const token = await getRlsToken()
  if (!token || !token.org_id) throw new Error("Not authenticated")

  const orgId = token.org_id as string

  return withRls(token, async (db) => {
    const [updated] = await db
      .update(shoppingListItems)
      .set({
        is_urgent: false,
        urgent_reason: null,
        updated_at: new Date(),
      })
      .where(and(eq(shoppingListItems.id, itemId), eq(shoppingListItems.org_id, orgId)))
      .returning()

    return updated as ShoppingListItem
  })
}
