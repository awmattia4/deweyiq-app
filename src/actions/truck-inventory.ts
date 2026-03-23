"use server"

/**
 * Phase 13: Truck Inventory Actions
 *
 * Truck inventory CRUD, auto-decrement from dosing, template management,
 * inter-tech transfers, and reorder alerts.
 *
 * CRITICAL: decrementTruckInventoryFromDosing NEVER throws — it wraps everything
 * in a try/catch and returns an empty array on failure. This ensures inventory
 * decrement failures never block stop completion.
 */

import { createClient } from "@/lib/supabase/server"
import { withRls, getRlsToken, adminDb } from "@/lib/db"
import type { SupabaseToken } from "@/lib/db"
import {
  truckInventory,
  truckInventoryLog,
  truckLoadTemplates,
  truckLoadTemplateItems,
  barcodeCatalogLinks,
  alerts,
} from "@/lib/db/schema"
import { eq, and, inArray, isNull, sql } from "drizzle-orm"
import { convertUnits } from "@/lib/unit-conversion"
import { notifyUser, notifyOrgRole } from "@/lib/notifications/dispatch"

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface TruckInventoryItem {
  id: string
  org_id: string
  tech_id: string
  catalog_item_id: string | null
  chemical_product_id: string | null
  item_name: string
  category: string
  quantity: string
  unit: string
  min_threshold: string
  on_truck: boolean
  barcode: string | null
  reorder_alert_sent_at: Date | null
  created_at: Date
  updated_at: Date
}

export interface AddTruckInventoryItemInput {
  tech_id: string
  catalog_item_id?: string | null
  chemical_product_id?: string | null
  item_name: string
  category: string
  quantity: number
  unit: string
  min_threshold?: number
  on_truck?: boolean
  barcode?: string | null
}

export interface UpdateTruckInventoryItemInput {
  item_name?: string
  category?: string
  quantity?: number
  unit?: string
  min_threshold?: number
  on_truck?: boolean
  barcode?: string | null
}

export interface DosingAmount {
  chemical_product_id: string
  amount: number
  unit: string
}

export interface DeductedItem {
  inventoryItemId: string
  itemName: string
  unit: string
  deductedAmount: number
  quantityBefore: number
  quantityAfter: number
}

// ---------------------------------------------------------------------------
// getTruckInventory
// ---------------------------------------------------------------------------

export async function getTruckInventory(techId: string) {
  const token = await getRlsToken()
  if (!token) return []

  return withRls(token, async (db) => {
    return db
      .select()
      .from(truckInventory)
      .where(eq(truckInventory.tech_id, techId))
      .orderBy(truckInventory.category, truckInventory.item_name)
  })
}

// ---------------------------------------------------------------------------
// addTruckInventoryItem
// ---------------------------------------------------------------------------

export async function addTruckInventoryItem(data: AddTruckInventoryItemInput) {
  const token = await getRlsToken()
  if (!token || !token.org_id) throw new Error("Not authenticated")

  const orgId = token.org_id as string

  return withRls(token, async (db) => {
    const [newItem] = await db
      .insert(truckInventory)
      .values({
        org_id: orgId,
        tech_id: data.tech_id,
        catalog_item_id: data.catalog_item_id ?? null,
        chemical_product_id: data.chemical_product_id ?? null,
        item_name: data.item_name,
        category: data.category,
        quantity: String(data.quantity),
        unit: data.unit,
        min_threshold: String(data.min_threshold ?? 0),
        on_truck: data.on_truck ?? true,
        barcode: data.barcode ?? null,
      })
      .returning()

    // If a barcode was provided, also upsert into barcode_catalog_links
    if (data.barcode && newItem) {
      await db
        .insert(barcodeCatalogLinks)
        .values({
          org_id: orgId,
          barcode: data.barcode,
          catalog_item_id: data.catalog_item_id ?? null,
          chemical_product_id: data.chemical_product_id ?? null,
          item_name: data.item_name,
          created_by_id: token.sub,
        })
        .onConflictDoUpdate({
          target: [barcodeCatalogLinks.org_id, barcodeCatalogLinks.barcode],
          set: {
            item_name: data.item_name,
            catalog_item_id: data.catalog_item_id ?? null,
            chemical_product_id: data.chemical_product_id ?? null,
          },
        })
    }

    return newItem
  })
}

// ---------------------------------------------------------------------------
// updateTruckInventoryItem
// ---------------------------------------------------------------------------

export async function updateTruckInventoryItem(
  itemId: string,
  data: UpdateTruckInventoryItemInput
) {
  const token = await getRlsToken()
  if (!token || !token.org_id) throw new Error("Not authenticated")

  const orgId = token.org_id as string

  return withRls(token, async (db) => {
    // Fetch current state for the log
    const [current] = await db
      .select()
      .from(truckInventory)
      .where(and(eq(truckInventory.id, itemId), eq(truckInventory.org_id, orgId)))
      .limit(1)

    if (!current) throw new Error("Inventory item not found")

    const updatePayload: Record<string, unknown> = {
      updated_at: new Date(),
    }

    if (data.item_name !== undefined) updatePayload.item_name = data.item_name
    if (data.category !== undefined) updatePayload.category = data.category
    if (data.quantity !== undefined) updatePayload.quantity = String(data.quantity)
    if (data.unit !== undefined) updatePayload.unit = data.unit
    if (data.min_threshold !== undefined) updatePayload.min_threshold = String(data.min_threshold)
    if (data.on_truck !== undefined) updatePayload.on_truck = data.on_truck
    if (data.barcode !== undefined) updatePayload.barcode = data.barcode

    const [updated] = await db
      .update(truckInventory)
      .set(updatePayload)
      .where(and(eq(truckInventory.id, itemId), eq(truckInventory.org_id, orgId)))
      .returning()

    // Log quantity changes
    if (data.quantity !== undefined && data.quantity !== parseFloat(current.quantity)) {
      const qBefore = parseFloat(current.quantity)
      const qAfter = data.quantity
      const qChange = qAfter - qBefore

      await db.insert(truckInventoryLog).values({
        org_id: orgId,
        truck_inventory_item_id: itemId,
        tech_id: current.tech_id,
        change_type: "adjustment",
        quantity_before: String(qBefore),
        quantity_change: String(qChange),
        quantity_after: String(qAfter),
        source_type: "manual",
      })
    }

    // If restocked above threshold, clear the reorder alert flag
    if (
      data.quantity !== undefined &&
      data.quantity > parseFloat(current.min_threshold) &&
      current.reorder_alert_sent_at !== null
    ) {
      await db
        .update(truckInventory)
        .set({ reorder_alert_sent_at: null, updated_at: new Date() })
        .where(eq(truckInventory.id, itemId))
    }

    return updated
  })
}

// ---------------------------------------------------------------------------
// deleteTruckInventoryItem
// ---------------------------------------------------------------------------

export async function deleteTruckInventoryItem(itemId: string) {
  const token = await getRlsToken()
  if (!token || !token.org_id) throw new Error("Not authenticated")

  const orgId = token.org_id as string

  return withRls(token, async (db) => {
    await db
      .delete(truckInventory)
      .where(and(eq(truckInventory.id, itemId), eq(truckInventory.org_id, orgId)))
  })
}

// ---------------------------------------------------------------------------
// decrementTruckInventoryFromDosing
// CRITICAL: NEVER throws — wrap entire body in try/catch.
// Returns empty array on failure so completeStop is never blocked.
// ---------------------------------------------------------------------------

export async function decrementTruckInventoryFromDosing(
  techId: string,
  orgId: string,
  dosingAmounts: DosingAmount[],
  token: SupabaseToken
): Promise<DeductedItem[]> {
  try {
    if (!dosingAmounts || dosingAmounts.length === 0) return []

    const productIds = dosingAmounts
      .map((d) => d.chemical_product_id)
      .filter((id): id is string => !!id)

    if (productIds.length === 0) return []

    // Load matching inventory items for this tech
    const inventoryItems = await adminDb
      .select()
      .from(truckInventory)
      .where(
        and(
          eq(truckInventory.org_id, orgId),
          eq(truckInventory.tech_id, techId),
          inArray(truckInventory.chemical_product_id, productIds)
        )
      )

    if (inventoryItems.length === 0) return []

    const deducted: DeductedItem[] = []
    const now = new Date()

    for (const dosing of dosingAmounts) {
      if (!dosing.chemical_product_id || !dosing.amount) continue

      // Find matching inventory item
      const inventoryItem = inventoryItems.find(
        (item) => item.chemical_product_id === dosing.chemical_product_id
      )
      if (!inventoryItem) continue

      const currentQty = parseFloat(inventoryItem.quantity)
      const minThreshold = parseFloat(inventoryItem.min_threshold)

      // Convert dosing amount to inventory unit if needed
      const convertedAmount = convertUnits(dosing.amount, dosing.unit, inventoryItem.unit)

      // Calculate new quantity — clamp to 0
      const newQty = Math.max(0, currentQty - convertedAmount)
      const actualDeducted = currentQty - newQty  // may be less than convertedAmount if clamped

      // Update inventory quantity
      await adminDb
        .update(truckInventory)
        .set({
          quantity: String(newQty),
          updated_at: now,
        })
        .where(eq(truckInventory.id, inventoryItem.id))

      // Log the auto-decrement
      await adminDb.insert(truckInventoryLog).values({
        org_id: orgId,
        truck_inventory_item_id: inventoryItem.id,
        tech_id: techId,
        change_type: "auto_decrement",
        quantity_before: String(currentQty),
        quantity_change: String(-actualDeducted),
        quantity_after: String(newQty),
        source_type: "service_visit",
      })

      deducted.push({
        inventoryItemId: inventoryItem.id,
        itemName: inventoryItem.item_name,
        unit: inventoryItem.unit,
        deductedAmount: actualDeducted,
        quantityBefore: currentQty,
        quantityAfter: newQty,
      })

      // Fire reorder alert if below threshold and alert not already sent
      if (newQty <= minThreshold && inventoryItem.reorder_alert_sent_at === null) {
        try {
          // Create alert in the alerts table
          await adminDb
            .insert(alerts)
            .values({
              org_id: orgId,
              alert_type: "low_inventory",
              severity: "warning",
              reference_id: inventoryItem.id,
              reference_type: "truck_inventory",
              title: `Low inventory: ${inventoryItem.item_name}`,
              description: `${inventoryItem.item_name} on ${techId}'s truck is at ${newQty} ${inventoryItem.unit} (threshold: ${minThreshold} ${inventoryItem.unit})`,
              metadata: {
                techId,
                inventoryItemId: inventoryItem.id,
                itemName: inventoryItem.item_name,
                currentQty: newQty,
                minThreshold,
                unit: inventoryItem.unit,
              },
            })
            .onConflictDoNothing()

          // Mark alert sent on inventory item
          await adminDb
            .update(truckInventory)
            .set({ reorder_alert_sent_at: now })
            .where(eq(truckInventory.id, inventoryItem.id))

          // Push notification to tech
          void notifyUser(techId, orgId, {
            type: "low_inventory",
            urgency: "needs_action",
            title: "Low inventory alert",
            body: `${inventoryItem.item_name} is running low (${newQty} ${inventoryItem.unit} remaining)`,
            link: "/inventory",
          }).catch((err) =>
            console.error("[decrementTruckInventoryFromDosing] tech push failed:", err)
          )

          // Push notification to office
          void notifyOrgRole(orgId, "owner+office", {
            type: "low_inventory",
            urgency: "needs_action",
            title: "Truck inventory low",
            body: `Tech has ${inventoryItem.item_name} at ${newQty} ${inventoryItem.unit} — below reorder threshold`,
            link: "/inventory",
          }).catch((err) =>
            console.error("[decrementTruckInventoryFromDosing] office push failed:", err)
          )
        } catch (alertErr) {
          console.error("[decrementTruckInventoryFromDosing] reorder alert failed (non-blocking):", alertErr)
        }
      }
    }

    return deducted
  } catch (err) {
    console.error("[decrementTruckInventoryFromDosing] FAILED (non-blocking):", err)
    return []
  }
}

// ---------------------------------------------------------------------------
// resetReorderAlert
// ---------------------------------------------------------------------------

export async function resetReorderAlert(itemId: string) {
  const token = await getRlsToken()
  if (!token || !token.org_id) throw new Error("Not authenticated")

  const orgId = token.org_id as string

  return withRls(token, async (db) => {
    await db
      .update(truckInventory)
      .set({ reorder_alert_sent_at: null, updated_at: new Date() })
      .where(and(eq(truckInventory.id, itemId), eq(truckInventory.org_id, orgId)))
  })
}

// ---------------------------------------------------------------------------
// applyTruckLoadTemplate
// ---------------------------------------------------------------------------

export async function applyTruckLoadTemplate(techId: string, templateId: string) {
  const token = await getRlsToken()
  if (!token || !token.org_id) throw new Error("Not authenticated")

  const orgId = token.org_id as string

  // Load template items
  const templateItems = await adminDb
    .select()
    .from(truckLoadTemplateItems)
    .where(
      and(
        eq(truckLoadTemplateItems.template_id, templateId),
        eq(truckLoadTemplateItems.org_id, orgId)
      )
    )
    .orderBy(truckLoadTemplateItems.sort_order)

  if (templateItems.length === 0) return { applied: 0, skipped: 0 }

  // Load existing inventory for this tech to avoid duplicates
  const existing = await adminDb
    .select()
    .from(truckInventory)
    .where(and(eq(truckInventory.tech_id, techId), eq(truckInventory.org_id, orgId)))

  let applied = 0
  let skipped = 0

  for (const templateItem of templateItems) {
    // Skip if already exists — match on catalog_item_id, chemical_product_id, or item_name
    const alreadyExists = existing.some((item) => {
      if (templateItem.catalog_item_id && item.catalog_item_id === templateItem.catalog_item_id) {
        return true
      }
      if (
        templateItem.chemical_product_id &&
        item.chemical_product_id === templateItem.chemical_product_id
      ) {
        return true
      }
      // Fallback name match (case-insensitive)
      return item.item_name.toLowerCase() === templateItem.item_name.toLowerCase()
    })

    if (alreadyExists) {
      skipped++
      continue
    }

    await adminDb.insert(truckInventory).values({
      org_id: orgId,
      tech_id: techId,
      catalog_item_id: templateItem.catalog_item_id ?? null,
      chemical_product_id: templateItem.chemical_product_id ?? null,
      item_name: templateItem.item_name,
      category: templateItem.category,
      quantity: String(templateItem.default_quantity),
      unit: templateItem.unit,
      min_threshold: String(templateItem.min_threshold),
      on_truck: true,
    })

    applied++
  }

  return { applied, skipped }
}

// ---------------------------------------------------------------------------
// transferInventoryItem
// ---------------------------------------------------------------------------

export async function transferInventoryItem(
  fromTechId: string,
  toTechId: string,
  itemId: string,
  quantity: number
) {
  const token = await getRlsToken()
  if (!token || !token.org_id) throw new Error("Not authenticated")

  const orgId = token.org_id as string

  // Fetch the source item
  const [sourceItem] = await adminDb
    .select()
    .from(truckInventory)
    .where(
      and(
        eq(truckInventory.id, itemId),
        eq(truckInventory.tech_id, fromTechId),
        eq(truckInventory.org_id, orgId)
      )
    )
    .limit(1)

  if (!sourceItem) throw new Error("Source inventory item not found")

  const currentQty = parseFloat(sourceItem.quantity)
  if (quantity > currentQty) throw new Error("Transfer amount exceeds available quantity")

  const newSourceQty = currentQty - quantity
  const now = new Date()

  // Decrement from source
  await adminDb
    .update(truckInventory)
    .set({ quantity: String(newSourceQty), updated_at: now })
    .where(eq(truckInventory.id, itemId))

  // Log transfer_out on source
  await adminDb.insert(truckInventoryLog).values({
    org_id: orgId,
    truck_inventory_item_id: itemId,
    tech_id: fromTechId,
    change_type: "transfer_out",
    quantity_before: String(currentQty),
    quantity_change: String(-quantity),
    quantity_after: String(newSourceQty),
    source_type: "transfer",
    transfer_to_tech_id: toTechId,
  })

  // Find or create matching item on target tech's truck
  const [existingTarget] = await adminDb
    .select()
    .from(truckInventory)
    .where(
      and(
        eq(truckInventory.org_id, orgId),
        eq(truckInventory.tech_id, toTechId),
        sourceItem.chemical_product_id
          ? eq(truckInventory.chemical_product_id, sourceItem.chemical_product_id)
          : sql`FALSE`
      )
    )
    .limit(1)

  if (existingTarget) {
    // Increment existing target item
    const targetQty = parseFloat(existingTarget.quantity)
    const newTargetQty = targetQty + quantity

    await adminDb
      .update(truckInventory)
      .set({ quantity: String(newTargetQty), updated_at: now })
      .where(eq(truckInventory.id, existingTarget.id))

    await adminDb.insert(truckInventoryLog).values({
      org_id: orgId,
      truck_inventory_item_id: existingTarget.id,
      tech_id: toTechId,
      change_type: "transfer_in",
      quantity_before: String(targetQty),
      quantity_change: String(quantity),
      quantity_after: String(newTargetQty),
      source_type: "transfer",
      transfer_from_tech_id: fromTechId,
    })
  } else {
    // Create new item on target tech's truck
    const [newItem] = await adminDb
      .insert(truckInventory)
      .values({
        org_id: orgId,
        tech_id: toTechId,
        catalog_item_id: sourceItem.catalog_item_id,
        chemical_product_id: sourceItem.chemical_product_id,
        item_name: sourceItem.item_name,
        category: sourceItem.category,
        quantity: String(quantity),
        unit: sourceItem.unit,
        min_threshold: sourceItem.min_threshold,
        on_truck: true,
      })
      .returning()

    if (newItem) {
      await adminDb.insert(truckInventoryLog).values({
        org_id: orgId,
        truck_inventory_item_id: newItem.id,
        tech_id: toTechId,
        change_type: "transfer_in",
        quantity_before: "0",
        quantity_change: String(quantity),
        quantity_after: String(quantity),
        source_type: "transfer",
        transfer_from_tech_id: fromTechId,
      })
    }
  }

  return { success: true, newSourceQuantity: newSourceQty }
}

// ---------------------------------------------------------------------------
// getTruckLoadTemplates
// ---------------------------------------------------------------------------

export async function getTruckLoadTemplates() {
  const token = await getRlsToken()
  if (!token) return []

  return withRls(token, async (db) => {
    return db
      .select()
      .from(truckLoadTemplates)
      .where(eq(truckLoadTemplates.is_active, true))
      .orderBy(truckLoadTemplates.name)
  })
}

// ---------------------------------------------------------------------------
// createTruckLoadTemplate
// ---------------------------------------------------------------------------

export async function createTruckLoadTemplate(data: {
  name: string
  target_role?: string | null
  items?: Array<{
    catalog_item_id?: string | null
    chemical_product_id?: string | null
    item_name: string
    category: string
    default_quantity: number
    unit: string
    min_threshold?: number
    sort_order?: number
  }>
}) {
  const token = await getRlsToken()
  if (!token || !token.org_id) throw new Error("Not authenticated")

  const orgId = token.org_id as string

  const [template] = await adminDb
    .insert(truckLoadTemplates)
    .values({
      org_id: orgId,
      name: data.name,
      target_role: data.target_role ?? null,
    })
    .returning()

  if (template && data.items && data.items.length > 0) {
    await adminDb.insert(truckLoadTemplateItems).values(
      data.items.map((item, idx) => ({
        org_id: orgId,
        template_id: template.id,
        catalog_item_id: item.catalog_item_id ?? null,
        chemical_product_id: item.chemical_product_id ?? null,
        item_name: item.item_name,
        category: item.category,
        default_quantity: String(item.default_quantity),
        unit: item.unit,
        min_threshold: String(item.min_threshold ?? 0),
        sort_order: item.sort_order ?? idx,
      }))
    )
  }

  return template
}

// ---------------------------------------------------------------------------
// updateTruckLoadTemplate
// ---------------------------------------------------------------------------

export async function updateTruckLoadTemplate(
  id: string,
  data: { name?: string; target_role?: string | null; is_active?: boolean }
) {
  const token = await getRlsToken()
  if (!token || !token.org_id) throw new Error("Not authenticated")

  const orgId = token.org_id as string

  const [updated] = await adminDb
    .update(truckLoadTemplates)
    .set(data)
    .where(and(eq(truckLoadTemplates.id, id), eq(truckLoadTemplates.org_id, orgId)))
    .returning()

  return updated
}

// ---------------------------------------------------------------------------
// deleteTruckLoadTemplate
// ---------------------------------------------------------------------------

export async function deleteTruckLoadTemplate(id: string) {
  const token = await getRlsToken()
  if (!token || !token.org_id) throw new Error("Not authenticated")

  const orgId = token.org_id as string

  await adminDb
    .delete(truckLoadTemplates)
    .where(and(eq(truckLoadTemplates.id, id), eq(truckLoadTemplates.org_id, orgId)))
}
