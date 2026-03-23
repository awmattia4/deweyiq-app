"use server"

/**
 * qbo-items.ts — Phase 13 QBO two-way item catalog sync.
 *
 * Exports:
 * - syncCatalogItemToQbo: Push a parts_catalog item to QBO (create or update)
 * - syncQboItemToDeweyIq: Pull a QBO Item into parts_catalog (called from webhook)
 * - reconcileCatalogWithQbo: Bulk sync — match by qbo_item_id or SKU
 * - importQboItems: One-time import of all QBO Items into parts_catalog
 *
 * Uses adminDb for all operations — these run in server action or webhook context.
 * QBO failures are non-blocking (fire-and-forget pattern per qbo-sync.ts).
 */

import { adminDb } from "@/lib/db"
import { partsCatalog, orgSettings } from "@/lib/db/schema"
import { and, eq, inArray, isNull, sql } from "drizzle-orm"
import { getQboClient, isQboConnected, qboPromise } from "@/lib/qbo/client"
import {
  mapCatalogItemToQboItem,
  mapQboItemToCatalogItem,
} from "@/lib/qbo/mappers"

// ---------------------------------------------------------------------------
// syncCatalogItemToQbo
// ---------------------------------------------------------------------------

/**
 * Pushes a parts_catalog item to QBO as an Item entity.
 * Creates if new (no qbo_item_id), updates if existing.
 * Saves returned qbo_item_id back to parts_catalog.
 */
export async function syncCatalogItemToQbo(itemId: string): Promise<void> {
  try {
    const itemRows = await adminDb
      .select()
      .from(partsCatalog)
      .where(eq(partsCatalog.id, itemId))
      .limit(1)

    const item = itemRows[0]
    if (!item) return

    const connected = await isQboConnected(item.org_id)
    if (!connected) return

    // Cast to any — node-quickbooks JS methods exist at runtime but lack full TS typings
    const qbo = await getQboClient(item.org_id) as any
    const qboPayload = mapCatalogItemToQboItem(item)

    if (item.qbo_item_id) {
      // Update existing QBO item
      // Need SyncToken for updates — fetch it first
      const existing = await qboPromise<any>((cb) => qbo.getItem(item.qbo_item_id!, cb))
      if (existing) {
        qboPayload.Id = item.qbo_item_id
        qboPayload.SyncToken = existing.SyncToken
        await qboPromise<any>((cb) => qbo.updateItem(qboPayload, cb))
      }
    } else {
      // Create new QBO item
      const created = await qboPromise<any>((cb) => qbo.createItem(qboPayload, cb))
      if (created?.Id) {
        await adminDb
          .update(partsCatalog)
          .set({ qbo_item_id: String(created.Id), updated_at: new Date() })
          .where(eq(partsCatalog.id, itemId))
      }
    }
  } catch (err) {
    console.error("[syncCatalogItemToQbo] Error:", err)
    // Non-blocking — QBO sync failure never blocks the primary operation
  }
}

// ---------------------------------------------------------------------------
// syncQboItemToDeweyIq
// ---------------------------------------------------------------------------

/**
 * Pulls a QBO Item into parts_catalog. Called from the QBO webhook handler.
 * Finds or creates a matching catalog entry by qbo_item_id.
 */
export async function syncQboItemToDeweyIq(
  qboItemId: string,
  orgId: string
): Promise<void> {
  try {
    // Cast to any — node-quickbooks JS methods exist at runtime but lack full TS typings
    const qbo = await getQboClient(orgId) as any

    const qboItem = await qboPromise<any>((cb) => qbo.getItem(qboItemId, cb))
    if (!qboItem) return

    const mapped = mapQboItemToCatalogItem(qboItem)

    // Find existing catalog item by qbo_item_id
    const existing = await adminDb
      .select({ id: partsCatalog.id })
      .from(partsCatalog)
      .where(and(eq(partsCatalog.org_id, orgId), eq(partsCatalog.qbo_item_id, qboItemId)))
      .limit(1)

    const now = new Date()

    if (existing.length > 0) {
      // Update existing catalog item
      await adminDb
        .update(partsCatalog)
        .set({
          name: mapped.name,
          description: mapped.description ?? null,
          sku: mapped.sku ?? null,
          default_cost_price: mapped.default_cost_price ?? null,
          default_sell_price: mapped.default_sell_price ?? null,
          is_labor: mapped.is_labor,
          is_active: mapped.is_active,
          updated_at: now,
        })
        .where(
          and(eq(partsCatalog.org_id, orgId), eq(partsCatalog.qbo_item_id, qboItemId))
        )
    } else {
      // Create new catalog item
      await adminDb.insert(partsCatalog).values({
        org_id: orgId,
        qbo_item_id: qboItemId,
        name: mapped.name,
        description: mapped.description ?? null,
        sku: mapped.sku ?? null,
        default_cost_price: mapped.default_cost_price ?? null,
        default_sell_price: mapped.default_sell_price ?? null,
        is_labor: mapped.is_labor,
        is_active: mapped.is_active,
        created_at: now,
        updated_at: now,
      })
    }
  } catch (err) {
    console.error("[syncQboItemToDeweyIq] Error:", err)
  }
}

// ---------------------------------------------------------------------------
// reconcileCatalogWithQbo
// ---------------------------------------------------------------------------

/**
 * Bulk sync: fetch all QBO Items, match against parts_catalog by qbo_item_id or SKU.
 * Creates missing items in DeweyIQ; pushes new DeweyIQ items to QBO.
 */
export async function reconcileCatalogWithQbo(orgId: string): Promise<{
  created: number
  updated: number
  conflicts: Array<{ itemId: string; issue: string }>
}> {
  let created = 0
  let updated = 0
  const conflicts: Array<{ itemId: string; issue: string }> = []

  try {
    // Cast to any — node-quickbooks JS methods exist at runtime but lack full TS typings
    const qbo = await getQboClient(orgId) as any

    // Fetch all QBO Items
    const qboItems = await qboPromise<any[]>((cb) =>
      qbo.findItems([{ field: "Active", value: "true", operator: "=" }], cb)
    )

    if (!Array.isArray(qboItems)) return { created, updated, conflicts }

    const now = new Date()

    for (const qboItem of qboItems) {
      const qboId = String(qboItem.Id ?? "")
      if (!qboId) continue

      const mapped = mapQboItemToCatalogItem(qboItem)

      // Look for existing by qbo_item_id first
      let existing = await adminDb
        .select({ id: partsCatalog.id, sku: partsCatalog.sku })
        .from(partsCatalog)
        .where(and(eq(partsCatalog.org_id, orgId), eq(partsCatalog.qbo_item_id, qboId)))
        .limit(1)

      // Fallback: match by SKU if no qbo_item_id match
      if (existing.length === 0 && mapped.sku) {
        existing = await adminDb
          .select({ id: partsCatalog.id, sku: partsCatalog.sku })
          .from(partsCatalog)
          .where(and(eq(partsCatalog.org_id, orgId), eq(partsCatalog.sku, mapped.sku)))
          .limit(1)

        if (existing.length > 0) {
          // Link existing item to QBO
          await adminDb
            .update(partsCatalog)
            .set({ qbo_item_id: qboId, updated_at: now })
            .where(eq(partsCatalog.id, existing[0].id))
        }
      }

      if (existing.length > 0) {
        // Update existing
        await adminDb
          .update(partsCatalog)
          .set({
            name: mapped.name,
            description: mapped.description ?? null,
            default_cost_price: mapped.default_cost_price ?? null,
            default_sell_price: mapped.default_sell_price ?? null,
            is_labor: mapped.is_labor,
            is_active: mapped.is_active,
            updated_at: now,
          })
          .where(eq(partsCatalog.id, existing[0].id))
        updated++
      } else {
        // Create in DeweyIQ
        await adminDb.insert(partsCatalog).values({
          org_id: orgId,
          qbo_item_id: qboId,
          name: mapped.name,
          description: mapped.description ?? null,
          sku: mapped.sku ?? null,
          default_cost_price: mapped.default_cost_price ?? null,
          default_sell_price: mapped.default_sell_price ?? null,
          is_labor: mapped.is_labor,
          is_active: mapped.is_active,
          created_at: now,
          updated_at: now,
        })
        created++
      }
    }
  } catch (err) {
    console.error("[reconcileCatalogWithQbo] Error:", err)
    conflicts.push({ itemId: "bulk", issue: String(err) })
  }

  return { created, updated, conflicts }
}

// ---------------------------------------------------------------------------
// importQboItems
// ---------------------------------------------------------------------------

/**
 * One-time import of all active QBO Items into the org's parts_catalog.
 * Used from the Settings > Integrations page.
 */
export async function importQboItems(orgId: string): Promise<{ count: number; error?: string }> {
  try {
    const result = await reconcileCatalogWithQbo(orgId)
    return { count: result.created + result.updated }
  } catch (err) {
    console.error("[importQboItems] Error:", err)
    return { count: 0, error: "Failed to import QBO items" }
  }
}
