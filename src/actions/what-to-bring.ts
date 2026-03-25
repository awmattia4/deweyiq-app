"use server"

/**
 * Phase 13: What to Bring — Pre-Route Summary Aggregation
 *
 * Aggregates all requirements for a tech's route on a given date:
 * 1. WO parts for work orders on this route
 * 2. Predicted chemical needs from dosing history (avg of last 4 visits)
 * Cross-references against current truck inventory to classify items as
 * missing / low / stocked, sorted by urgency.
 *
 * CRITICAL: Uses LEFT JOIN + GROUP BY — no correlated subqueries inside withRls.
 */

import { withRls, getRlsToken } from "@/lib/db"
import {
  routeStops,
  workOrders,
  workOrderLineItems,
  truckInventory,
  serviceVisits,
} from "@/lib/db/schema"
import { eq, and, inArray, isNotNull, desc } from "drizzle-orm"
import { convertUnits } from "@/lib/unit-conversion"

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type WhatToBringUrgency = "missing" | "low" | "stocked"
export type WhatToBringSource = "wo" | "schedule" | "forecast"

export interface WhatToBringItem {
  itemName: string
  category: string
  unit: string
  quantityNeeded: number
  quantityOnTruck: number
  shortfall: number
  source: WhatToBringSource
  urgency: WhatToBringUrgency
  // Optional: links to the source item for "Add to List" actions
  catalogItemId?: string | null
  chemicalProductId?: string | null
  workOrderId?: string | null
}

export interface WhatToBringResult {
  missing: WhatToBringItem[]
  low: WhatToBringItem[]
  stocked: WhatToBringItem[]
  /** Separate section: forecast-based items clearly labeled as estimates */
  predicted: WhatToBringItem[]
}

// ---------------------------------------------------------------------------
// getWhatToBring
// ---------------------------------------------------------------------------

/**
 * Aggregates route requirements vs truck inventory for a tech's route date.
 * Returns items grouped by urgency: missing, low, stocked, predicted.
 */
export async function getWhatToBring(
  techId: string,
  routeDate: string
): Promise<WhatToBringResult> {
  const token = await getRlsToken()
  if (!token || !token.org_id) {
    return { missing: [], low: [], stocked: [], predicted: [] }
  }

  const orgId = token.org_id as string

  return withRls(token, async (db) => {
    // ── 1. Get today's stops for this tech ────────────────────────────────
    const stops = await db
      .select({
        pool_id: routeStops.pool_id,
        work_order_id: routeStops.work_order_id,
      })
      .from(routeStops)
      .where(
        and(
          eq(routeStops.org_id, orgId),
          eq(routeStops.tech_id, techId),
          eq(routeStops.scheduled_date, routeDate)
        )
      )

    if (stops.length === 0) {
      return { missing: [], low: [], stocked: [], predicted: [] }
    }

    const poolIds = stops.map((s) => s.pool_id).filter((id): id is string => !!id)
    const workOrderIds = stops
      .map((s) => s.work_order_id)
      .filter((id): id is string => !!id)

    // ── 2. Get WO parts for work orders on this route ─────────────────────
    const woParts: Array<{
      description: string
      quantity: number
      unit: string
      catalogItemId: string | null
      workOrderId: string
    }> = []

    if (workOrderIds.length > 0) {
      const lineItems = await db
        .select()
        .from(workOrderLineItems)
        .where(
          and(
            eq(workOrderLineItems.org_id, orgId),
            inArray(workOrderLineItems.work_order_id, workOrderIds),
            eq(workOrderLineItems.item_type, "part")
          )
        )

      for (const li of lineItems) {
        woParts.push({
          description: li.description,
          quantity: parseFloat(li.quantity),
          unit: li.unit,
          catalogItemId: li.catalog_item_id ?? null,
          workOrderId: li.work_order_id,
        })
      }
    }

    // ── 3. Get predicted chemical needs from dosing history ───────────────
    // CRITICAL: avoid correlated subqueries — fetch all visits and group in JS
    const chemicalPredictions: Record<
      string,
      { name: string; total: number; count: number; unit: string; chemicalProductId: string }
    > = {}

    if (poolIds.length > 0) {
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

      // Track how many visits we've counted per pool (cap at 4)
      const visitCountByPool: Record<string, number> = {}

      for (const visit of recentVisits) {
        if (!visit.pool_id || !visit.dosing_amounts) continue
        visitCountByPool[visit.pool_id] = (visitCountByPool[visit.pool_id] ?? 0) + 1
        if (visitCountByPool[visit.pool_id] > 4) continue

        const dosing = visit.dosing_amounts as Array<{
          chemical_product_id?: string
          amount?: number
          unit?: string
          name?: string
        }>

        for (const d of dosing) {
          if (!d.chemical_product_id || !d.amount) continue
          if (!chemicalPredictions[d.chemical_product_id]) {
            chemicalPredictions[d.chemical_product_id] = {
              name: d.name ?? "Chemical",
              total: 0,
              count: 0,
              unit: d.unit ?? "oz",
              chemicalProductId: d.chemical_product_id,
            }
          }
          chemicalPredictions[d.chemical_product_id].total += d.amount
          chemicalPredictions[d.chemical_product_id].count++
        }
      }
    }

    // ── 4. Get tech's truck inventory ──────────────────────────────────────
    // Shared truck support: get all tech IDs on the same truck
    const { getTechIdsOnSameTruck } = await import("@/actions/trucks")
    const truckTechIds = await getTechIdsOnSameTruck(techId, orgId)

    const inventoryItems = await db
      .select()
      .from(truckInventory)
      .where(
        and(
          eq(truckInventory.org_id, orgId),
          inArray(truckInventory.tech_id, truckTechIds)
        )
      )

    // Build lookup maps for inventory
    const invByCatalogId = new Map(
      inventoryItems
        .filter((i) => i.catalog_item_id)
        .map((i) => [i.catalog_item_id!, i])
    )
    const invByChemicalId = new Map(
      inventoryItems
        .filter((i) => i.chemical_product_id)
        .map((i) => [i.chemical_product_id!, i])
    )
    const invByName = new Map(
      inventoryItems.map((i) => [i.item_name.toLowerCase(), i])
    )

    // ── 5. Cross-reference and classify ───────────────────────────────────
    const missing: WhatToBringItem[] = []
    const low: WhatToBringItem[] = []
    const stocked: WhatToBringItem[] = []
    const predicted: WhatToBringItem[] = []

    // Process WO parts
    for (const part of woParts) {
      const invItem =
        (part.catalogItemId ? invByCatalogId.get(part.catalogItemId) : null) ??
        invByName.get(part.description.toLowerCase()) ??
        null

      const onTruck = invItem ? parseFloat(invItem.quantity) : 0
      const shortfall = Math.max(0, part.quantity - onTruck)

      const item: WhatToBringItem = {
        itemName: part.description,
        category: "part",
        unit: part.unit,
        quantityNeeded: part.quantity,
        quantityOnTruck: onTruck,
        shortfall,
        source: "wo",
        urgency: onTruck === 0 ? "missing" : shortfall > 0 ? "low" : "stocked",
        catalogItemId: part.catalogItemId,
        workOrderId: part.workOrderId,
      }

      if (item.urgency === "missing") missing.push(item)
      else if (item.urgency === "low") low.push(item)
      else stocked.push(item)
    }

    // Process chemical predictions (goes into predicted section, separate from confirmed)
    for (const pred of Object.values(chemicalPredictions)) {
      const avgPerVisit = pred.total / pred.count
      const avgForRoute = avgPerVisit * poolIds.length

      const invItem = invByChemicalId.get(pred.chemicalProductId)
      const onTruck = invItem
        ? parseFloat(
            convertUnits(parseFloat(invItem.quantity), invItem.unit, pred.unit).toFixed(3)
          )
        : 0
      const shortfall = Math.max(0, avgForRoute - onTruck)

      const item: WhatToBringItem = {
        itemName: pred.name,
        category: "chemical",
        unit: pred.unit,
        quantityNeeded: Math.ceil(avgForRoute * 100) / 100,
        quantityOnTruck: onTruck,
        shortfall,
        source: "forecast",
        urgency: onTruck === 0 ? "missing" : shortfall > 0 ? "low" : "stocked",
        chemicalProductId: pred.chemicalProductId,
      }

      // Forecasts go in predicted, not in confirmed missing/low/stocked
      predicted.push(item)
    }

    // Sort each group: missing and low by shortfall desc, stocked by name
    missing.sort((a, b) => b.shortfall - a.shortfall)
    low.sort((a, b) => b.shortfall - a.shortfall)
    stocked.sort((a, b) => a.itemName.localeCompare(b.itemName))
    // Predicted: show highest shortfall first
    predicted.sort((a, b) => b.shortfall - a.shortfall)

    return { missing, low, stocked, predicted }
  })
}
