"use server"

/**
 * Phase 13: Barcode Actions
 *
 * Barcode lookup, org-wide barcode registry, and UPC catalog integration.
 *
 * resolveBarcode:  Look up in org's barcode_catalog_links first, then UPC API.
 * lookupBarcode:   Call UPCitemdb for product info (24h cached via headers).
 * registerBarcode: Save barcode -> item mapping for the org.
 */

import { getRlsToken, withRls, adminDb } from "@/lib/db"
import { barcodeCatalogLinks, partsCatalog } from "@/lib/db/schema"
import { eq, and } from "drizzle-orm"

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface BarcodeResolveResult {
  found: boolean
  source: "org_catalog" | "parts_catalog" | "upc_api" | "not_found"
  barcode: string
  item_name?: string
  catalog_item_id?: string | null
  chemical_product_id?: string | null
  /** Category from the source (parts catalog category, UPC category, etc.) */
  catalog_category?: string | null
  /** Default unit from the source */
  catalog_unit?: string | null
  upc_data?: {
    name: string
    brand?: string
    description?: string
    category?: string
  } | null
}

export interface BarcodeRegisterInput {
  barcode: string
  item_name: string
  catalog_item_id?: string | null
  chemical_product_id?: string | null
}

// ---------------------------------------------------------------------------
// resolveBarcode
// ---------------------------------------------------------------------------

/**
 * Resolve a scanned barcode to a catalog item.
 * Checks org's barcode_catalog_links first (fast, no API call).
 * Falls back to UPC API lookup if not found in org catalog.
 */
export async function resolveBarcode(barcode: string): Promise<BarcodeResolveResult> {
  const token = await getRlsToken()
  if (!token || !token.org_id) {
    return { found: false, source: "not_found", barcode }
  }

  const orgId = token.org_id as string

  // 1. Check org's barcode catalog
  const [existingLink] = await withRls(token, async (db) => {
    return db
      .select()
      .from(barcodeCatalogLinks)
      .where(
        and(
          eq(barcodeCatalogLinks.org_id, orgId),
          eq(barcodeCatalogLinks.barcode, barcode)
        )
      )
      .limit(1)
  })

  if (existingLink) {
    return {
      found: true,
      source: "org_catalog",
      barcode,
      item_name: existingLink.item_name,
      catalog_item_id: existingLink.catalog_item_id,
      chemical_product_id: existingLink.chemical_product_id,
    }
  }

  // 2. Check parts_catalog by SKU (barcode saved as SKU when scanned in catalog)
  const [catalogMatch] = await withRls(token, async (db) => {
    return db
      .select({
        id: partsCatalog.id,
        name: partsCatalog.name,
        category: partsCatalog.category,
        default_unit: partsCatalog.default_unit,
      })
      .from(partsCatalog)
      .where(
        and(
          eq(partsCatalog.org_id, orgId),
          eq(partsCatalog.sku, barcode),
          eq(partsCatalog.is_active, true)
        )
      )
      .limit(1)
  })

  if (catalogMatch) {
    return {
      found: true,
      source: "parts_catalog",
      barcode,
      item_name: catalogMatch.name,
      catalog_item_id: catalogMatch.id,
      catalog_category: catalogMatch.category,
      catalog_unit: catalogMatch.default_unit,
    }
  }

  // 3. Fall back to UPC API
  const upcResult = await lookupBarcode(barcode)
  if (upcResult.found && upcResult.name) {
    return {
      found: true,
      source: "upc_api",
      barcode,
      item_name: upcResult.name,
      upc_data: {
        name: upcResult.name,
        brand: upcResult.brand ?? undefined,
        description: upcResult.description ?? undefined,
        category: upcResult.category ?? undefined,
      },
    }
  }

  return { found: false, source: "not_found", barcode }
}

// ---------------------------------------------------------------------------
// lookupBarcode
// ---------------------------------------------------------------------------

/**
 * Call UPCitemdb free trial API for product information.
 * Returns basic product data or found: false if unknown.
 *
 * API: https://api.upcitemdb.com/prod/trial/lookup?upc={barcode}
 * Rate limit: 100 requests/day on trial tier.
 */
export async function lookupBarcode(barcode: string): Promise<{
  found: boolean
  name?: string
  brand?: string
  description?: string
  category?: string
}> {
  try {
    const response = await fetch(
      `https://api.upcitemdb.com/prod/trial/lookup?upc=${encodeURIComponent(barcode)}`,
      {
        method: "GET",
        headers: {
          "Accept": "application/json",
          "User-Agent": "DeweyIQ/1.0",
        },
        // Cache for 24 hours
        next: { revalidate: 86400 },
      }
    )

    if (!response.ok) {
      return { found: false }
    }

    const data = await response.json()

    if (data.code !== "OK" || !data.items || data.items.length === 0) {
      return { found: false }
    }

    const item = data.items[0]
    return {
      found: true,
      name: item.title ?? item.description ?? undefined,
      brand: item.brand ?? undefined,
      description: item.description ?? undefined,
      category: item.category ?? undefined,
    }
  } catch (err) {
    console.error("[lookupBarcode] UPC API call failed:", err)
    return { found: false }
  }
}

// ---------------------------------------------------------------------------
// registerBarcode
// ---------------------------------------------------------------------------

/**
 * Save a barcode -> item mapping in the org's barcode_catalog_links.
 * Org-wide: once registered, all techs in the org can recognize this barcode.
 *
 * Uses upsert so re-scanning an already-registered barcode just updates the mapping.
 */
export async function registerBarcode(barcode: string, itemData: BarcodeRegisterInput) {
  const token = await getRlsToken()
  if (!token || !token.org_id) throw new Error("Not authenticated")

  const orgId = token.org_id as string

  // Check if we got UPC data to record
  let upcLookupRanAt: Date | null = null
  let upcLookupSucceeded: boolean | null = null

  // If this is a new registration from UPC API result, mark it
  const upcResult = await lookupBarcode(barcode)
  upcLookupRanAt = new Date()
  upcLookupSucceeded = upcResult.found

  return withRls(token, async (db) => {
    const [link] = await db
      .insert(barcodeCatalogLinks)
      .values({
        org_id: orgId,
        barcode,
        catalog_item_id: itemData.catalog_item_id ?? null,
        chemical_product_id: itemData.chemical_product_id ?? null,
        item_name: itemData.item_name,
        upc_lookup_ran_at: upcLookupRanAt,
        upc_lookup_succeeded: upcLookupSucceeded,
        created_by_id: token.sub,
      })
      .onConflictDoUpdate({
        target: [barcodeCatalogLinks.org_id, barcodeCatalogLinks.barcode],
        set: {
          item_name: itemData.item_name,
          catalog_item_id: itemData.catalog_item_id ?? null,
          chemical_product_id: itemData.chemical_product_id ?? null,
          upc_lookup_ran_at: upcLookupRanAt,
          upc_lookup_succeeded: upcLookupSucceeded,
        },
      })
      .returning()

    return link
  })
}
