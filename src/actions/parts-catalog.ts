"use server"

import { revalidatePath } from "next/cache"
import { createClient } from "@/lib/supabase/server"
import { withRls } from "@/lib/db"
import type { SupabaseToken } from "@/lib/db"
import { partsCatalog, woTemplates } from "@/lib/db/schema"
import { eq, and, ilike, sql } from "drizzle-orm"

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface CatalogItem {
  id: string
  org_id: string
  name: string
  description: string | null
  category: string | null
  sku: string | null
  default_cost_price: string | null
  default_sell_price: string | null
  default_unit: string | null
  is_labor: boolean
  is_active: boolean
  created_at: Date
  updated_at: Date
}

export interface WoTemplate {
  id: string
  org_id: string
  name: string
  description: string | null
  category: string | null
  default_priority: string
  line_items_snapshot: Array<{
    description: string
    item_type: string
    labor_type?: string
    quantity: string
    unit: string
    unit_cost?: string
    unit_price?: string
    markup_pct?: string
    is_taxable: boolean
    is_optional: boolean
    sort_order: number
  }> | null
  is_active: boolean
  created_at: Date
  updated_at: Date
}

export interface AddCatalogItemInput {
  name: string
  description?: string
  category?: string
  sku?: string
  defaultCostPrice?: string
  defaultSellPrice?: string
  defaultUnit?: string
  isLabor?: boolean
}

export interface CreateWoTemplateInput {
  name: string
  description?: string
  category?: string
  defaultPriority?: string
  lineItemsSnapshot?: WoTemplate["line_items_snapshot"]
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
// getCatalogItems
// ---------------------------------------------------------------------------

/**
 * Fetches active catalog items for the org.
 * Optional ILIKE search on name, optional category filter.
 */
export async function getCatalogItems(
  search?: string,
  category?: string
): Promise<CatalogItem[]> {
  const token = await getRlsToken()
  if (!token) return []

  try {
    return await withRls(token, async (db) => {
      const conditions = [
        eq(partsCatalog.is_active, true),
        ...(search ? [ilike(partsCatalog.name, `%${search}%`)] : []),
        ...(category ? [eq(partsCatalog.category, category)] : []),
      ]

      const rows = await db
        .select()
        .from(partsCatalog)
        .where(and(...(conditions as [typeof conditions[0], ...typeof conditions])))
        .orderBy(partsCatalog.name)

      return rows.map((r) => ({
        ...r,
        default_cost_price: r.default_cost_price ?? null,
        default_sell_price: r.default_sell_price ?? null,
      }))
    })
  } catch (err) {
    console.error("[getCatalogItems] Error:", err)
    return []
  }
}

// ---------------------------------------------------------------------------
// addCatalogItem
// ---------------------------------------------------------------------------

/**
 * Creates a new catalog item.
 */
export async function addCatalogItem(
  data: AddCatalogItemInput
): Promise<{ success: boolean; id?: string; error?: string }> {
  const token = await getRlsToken()
  if (!token) return { success: false, error: "Not authenticated" }

  const orgId = token.org_id as string

  try {
    const result = await withRls(token, async (db) => {
      const inserted = await db
        .insert(partsCatalog)
        .values({
          org_id: orgId,
          name: data.name,
          description: data.description ?? null,
          category: data.category ?? null,
          sku: data.sku ?? null,
          default_cost_price: data.defaultCostPrice ?? null,
          default_sell_price: data.defaultSellPrice ?? null,
          default_unit: data.defaultUnit ?? null,
          is_labor: data.isLabor ?? false,
        })
        .returning({ id: partsCatalog.id })

      return inserted[0]?.id ?? null
    })

    revalidatePath("/settings")
    return { success: true, id: result ?? undefined }
  } catch (err) {
    console.error("[addCatalogItem] Error:", err)
    return { success: false, error: err instanceof Error ? err.message : "Unknown error" }
  }
}

// ---------------------------------------------------------------------------
// updateCatalogItem
// ---------------------------------------------------------------------------

/**
 * Updates a catalog item's fields.
 */
export async function updateCatalogItem(
  id: string,
  data: Partial<AddCatalogItemInput>
): Promise<{ success: boolean; error?: string }> {
  const token = await getRlsToken()
  if (!token) return { success: false, error: "Not authenticated" }

  try {
    await withRls(token, async (db) => {
      const updates: Partial<typeof partsCatalog.$inferInsert> = {
        updated_at: new Date(),
      }

      if (data.name !== undefined) updates.name = data.name
      if (data.description !== undefined) updates.description = data.description
      if (data.category !== undefined) updates.category = data.category
      if (data.sku !== undefined) updates.sku = data.sku
      if (data.defaultCostPrice !== undefined) updates.default_cost_price = data.defaultCostPrice
      if (data.defaultSellPrice !== undefined) updates.default_sell_price = data.defaultSellPrice
      if (data.defaultUnit !== undefined) updates.default_unit = data.defaultUnit
      if (data.isLabor !== undefined) updates.is_labor = data.isLabor

      await db.update(partsCatalog).set(updates).where(eq(partsCatalog.id, id))
    })

    revalidatePath("/settings")
    return { success: true }
  } catch (err) {
    console.error("[updateCatalogItem] Error:", err)
    return { success: false, error: err instanceof Error ? err.message : "Unknown error" }
  }
}

// ---------------------------------------------------------------------------
// deleteCatalogItem (soft delete)
// ---------------------------------------------------------------------------

/**
 * Soft-deletes a catalog item by setting is_active=false.
 * Preserves history for existing line items that reference this item.
 */
export async function deleteCatalogItem(
  id: string
): Promise<{ success: boolean; error?: string }> {
  const token = await getRlsToken()
  if (!token) return { success: false, error: "Not authenticated" }

  try {
    await withRls(token, async (db) => {
      await db
        .update(partsCatalog)
        .set({ is_active: false, updated_at: new Date() })
        .where(eq(partsCatalog.id, id))
    })

    revalidatePath("/settings")
    return { success: true }
  } catch (err) {
    console.error("[deleteCatalogItem] Error:", err)
    return { success: false, error: err instanceof Error ? err.message : "Unknown error" }
  }
}

// ---------------------------------------------------------------------------
// getWoTemplates
// ---------------------------------------------------------------------------

/**
 * Fetches active WO templates for the org.
 */
export async function getWoTemplates(): Promise<WoTemplate[]> {
  const token = await getRlsToken()
  if (!token) return []

  try {
    return await withRls(token, async (db) => {
      const rows = await db
        .select()
        .from(woTemplates)
        .where(eq(woTemplates.is_active, true))
        .orderBy(woTemplates.name)

      return rows as WoTemplate[]
    })
  } catch (err) {
    console.error("[getWoTemplates] Error:", err)
    return []
  }
}

// ---------------------------------------------------------------------------
// createWoTemplate
// ---------------------------------------------------------------------------

/**
 * Creates a new WO template with a line items snapshot.
 */
export async function createWoTemplate(
  data: CreateWoTemplateInput
): Promise<{ success: boolean; id?: string; error?: string }> {
  const token = await getRlsToken()
  if (!token) return { success: false, error: "Not authenticated" }

  const orgId = token.org_id as string

  try {
    const result = await withRls(token, async (db) => {
      const inserted = await db
        .insert(woTemplates)
        .values({
          org_id: orgId,
          name: data.name,
          description: data.description ?? null,
          category: data.category ?? null,
          default_priority: data.defaultPriority ?? "normal",
          line_items_snapshot: data.lineItemsSnapshot ?? null,
        })
        .returning({ id: woTemplates.id })

      return inserted[0]?.id ?? null
    })

    revalidatePath("/settings")
    return { success: true, id: result ?? undefined }
  } catch (err) {
    console.error("[createWoTemplate] Error:", err)
    return { success: false, error: err instanceof Error ? err.message : "Unknown error" }
  }
}

// ---------------------------------------------------------------------------
// deleteWoTemplate (soft delete)
// ---------------------------------------------------------------------------

/**
 * Soft-deletes a WO template by setting is_active=false.
 */
export async function deleteWoTemplate(
  id: string
): Promise<{ success: boolean; error?: string }> {
  const token = await getRlsToken()
  if (!token) return { success: false, error: "Not authenticated" }

  try {
    await withRls(token, async (db) => {
      await db
        .update(woTemplates)
        .set({ is_active: false, updated_at: new Date() })
        .where(eq(woTemplates.id, id))
    })

    revalidatePath("/settings")
    return { success: true }
  } catch (err) {
    console.error("[deleteWoTemplate] Error:", err)
    return { success: false, error: err instanceof Error ? err.message : "Unknown error" }
  }
}
