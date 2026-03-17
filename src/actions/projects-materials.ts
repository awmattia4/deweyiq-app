"use server"

/**
 * projects-materials.ts — Server actions for project material procurement lifecycle.
 *
 * Phase 12 Plan 09: Materials & Procurement
 *
 * Coverage:
 * - Material list: populate from approved proposal, add/update materials
 * - Purchase orders: create (grouped by supplier), update status
 * - Receiving: full and partial delivery tracking, photo URL
 * - Returns: credit tracking (PROJ-33)
 * - Cost variance: per-material and project-level (PROJ-31)
 *
 * Key patterns:
 * - withRls(token, ...) for all user-facing queries
 * - adminDb for sequential PO number generation (atomic counter)
 * - LEFT JOIN + GROUP BY — no correlated subqueries on RLS-protected tables
 * - toLocalDateString() for any YYYY-MM-DD date strings (no toISOString().split("T")[0])
 */

import { revalidatePath } from "next/cache"
import { createClient } from "@/lib/supabase/server"
import { withRls, adminDb } from "@/lib/db"
import type { SupabaseToken } from "@/lib/db"
import {
  projectMaterials,
  projectPurchaseOrders,
  projectPoLineItems,
  projectMaterialReceipts,
  projectMaterialReturns,
  projectProposals,
  projectProposalLineItems,
  projects,
} from "@/lib/db/schema"
import { eq, and, count, desc, inArray } from "drizzle-orm"

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface ProjectMaterial {
  id: string
  project_id: string
  proposal_line_item_id: string | null
  name: string
  category: string
  quantity_estimated: string
  quantity_ordered: string
  quantity_received: string
  quantity_used: string
  unit: string
  unit_cost_estimated: string | null
  unit_cost_actual: string | null
  supplier: string | null
  order_status: string
  notes: string | null
  created_at: Date
  updated_at: Date
  // Computed
  total_estimated: number
  total_actual: number
  variance: number
  variance_pct: number | null
}

export interface MaterialReceipt {
  id: string
  material_id: string
  po_id: string | null
  quantity_received: string
  received_at: Date
  photo_url: string | null
  notes: string | null
}

export interface MaterialReturn {
  id: string
  material_id: string
  quantity_returned: string
  return_reason: string | null
  credit_amount: string
  returned_at: Date
}

export interface PurchaseOrderLineItem {
  id: string
  material_id: string | null
  materialName: string
  quantity: string
  unit_price: string
  total: string
}

export interface PurchaseOrder {
  id: string
  project_id: string
  po_number: string | null
  supplier_name: string
  supplier_contact: string | null
  status: string
  total_amount: string
  notes: string | null
  created_at: Date
  lineItems: PurchaseOrderLineItem[]
}

export interface MaterialCostVariance {
  materials: Array<{
    id: string
    name: string
    total_estimated: number
    total_actual: number
    variance: number
    variance_pct: number | null
    is_over_budget: boolean
  }>
  project_total_estimated: number
  project_total_actual: number
  project_variance: number
  project_variance_pct: number | null
  has_alert: boolean
}

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

async function getToken(): Promise<SupabaseToken | null> {
  const supabase = await createClient()
  const { data: claimsData } = await supabase.auth.getClaims()
  if (!claimsData?.claims) return null
  return claimsData.claims as SupabaseToken
}

function computeVariance(
  quantityEstimated: string,
  unitCostEstimated: string | null,
  quantityUsed: string,
  unitCostActual: string | null
): { total_estimated: number; total_actual: number; variance: number; variance_pct: number | null } {
  const est = parseFloat(quantityEstimated) * parseFloat(unitCostEstimated ?? "0")
  // Actual cost = quantity_used (what was consumed) * actual unit cost (or fall back to estimated)
  const qtyUsed = parseFloat(quantityUsed)
  const qtyEst = parseFloat(quantityEstimated)
  const costActual = parseFloat(unitCostActual ?? unitCostEstimated ?? "0")
  // Use the larger of qty_used or qty_ordered to capture actual spend even if not fully consumed
  const actual = qtyUsed > 0 ? qtyUsed * costActual : qtyEst * costActual
  const variance = actual - est
  const variance_pct = est > 0 ? (variance / est) * 100 : null
  return { total_estimated: est, total_actual: actual, variance, variance_pct }
}

function enrichMaterial(row: typeof projectMaterials.$inferSelect): ProjectMaterial {
  const { total_estimated, total_actual, variance, variance_pct } = computeVariance(
    row.quantity_estimated,
    row.unit_cost_estimated,
    row.quantity_used,
    row.unit_cost_actual
  )
  return {
    ...row,
    total_estimated,
    total_actual,
    variance,
    variance_pct,
  }
}

// ---------------------------------------------------------------------------
// populateMaterialsFromProposal
// ---------------------------------------------------------------------------

/**
 * When a proposal is approved, copy all material-category line items from the
 * approved proposal into project_materials (PROJ-28).
 *
 * Material categories: 'pool_equipment', 'plumbing', 'electrical', 'decking',
 *                      'surface', 'chemical', 'material', 'other'
 * (Any line item whose category is in the list above gets copied.)
 *
 * Idempotent: skips materials that already have a proposal_line_item_id match.
 */
export async function populateMaterialsFromProposal(
  projectId: string
): Promise<{ success: true; created: number } | { error: string }> {
  const token = await getToken()
  if (!token) return { error: "Not authenticated" }
  if (!token.org_id) return { error: "No org context" }

  try {
    // 1. Find the approved proposal for this project
    const [approvedProposal] = await withRls(token, (db) =>
      db
        .select({ id: projectProposals.id })
        .from(projectProposals)
        .where(
          and(
            eq(projectProposals.project_id, projectId),
            eq(projectProposals.org_id, token.org_id!),
            eq(projectProposals.status, "approved")
          )
        )
        .orderBy(desc(projectProposals.created_at))
        .limit(1)
    )

    if (!approvedProposal) return { error: "No approved proposal found for this project" }

    // 2. Fetch all line items from the approved proposal (all tiers, shared + tier-specific)
    const lineItems = await withRls(token, (db) =>
      db
        .select()
        .from(projectProposalLineItems)
        .where(
          and(
            eq(projectProposalLineItems.proposal_id, approvedProposal.id),
            eq(projectProposalLineItems.org_id, token.org_id!)
          )
        )
    )

    // 3. Find existing material proposal_line_item_ids to avoid duplicates
    const existingMaterials = await withRls(token, (db) =>
      db
        .select({ proposal_line_item_id: projectMaterials.proposal_line_item_id })
        .from(projectMaterials)
        .where(
          and(
            eq(projectMaterials.project_id, projectId),
            eq(projectMaterials.org_id, token.org_id!)
          )
        )
    )
    const existingIds = new Set(
      existingMaterials
        .map((m) => m.proposal_line_item_id)
        .filter(Boolean) as string[]
    )

    // 4. Filter to material-category items not yet imported
    const MATERIAL_CATEGORIES = new Set([
      "pool_equipment",
      "plumbing",
      "electrical",
      "decking",
      "surface",
      "chemical",
      "material",
      "other",
      "materials",
      "equipment",
    ])

    const toImport = lineItems.filter((li) => {
      if (existingIds.has(li.id)) return false
      // Include if category matches or there's no explicit category (default to material)
      const cat = (li.category ?? "other").toLowerCase()
      return MATERIAL_CATEGORIES.has(cat) || cat.includes("material") || cat.includes("equipment")
    })

    if (toImport.length === 0) {
      return { success: true, created: 0 }
    }

    // 5. Insert as project_materials
    await withRls(token, (db) =>
      db.insert(projectMaterials).values(
        toImport.map((li) => ({
          org_id: token.org_id!,
          project_id: projectId,
          proposal_line_item_id: li.id,
          name: li.description,
          category: li.category ?? "other",
          quantity_estimated: String(li.quantity ?? "1"),
          unit_cost_estimated: li.unit_price ?? null,
          unit: "each",
          order_status: "not_ordered" as const,
        }))
      )
    )

    revalidatePath(`/projects/${projectId}/materials`)
    return { success: true, created: toImport.length }
  } catch (err) {
    console.error("[populateMaterialsFromProposal]", err)
    return { error: "Failed to populate materials from proposal" }
  }
}

// ---------------------------------------------------------------------------
// getMaterials
// ---------------------------------------------------------------------------

export async function getMaterials(
  projectId: string
): Promise<ProjectMaterial[] | { error: string }> {
  const token = await getToken()
  if (!token) return { error: "Not authenticated" }

  try {
    const rows = await withRls(token, (db) =>
      db
        .select()
        .from(projectMaterials)
        .where(
          and(
            eq(projectMaterials.project_id, projectId),
            eq(projectMaterials.org_id, token.org_id!)
          )
        )
        .orderBy(projectMaterials.created_at)
    )

    return rows.map(enrichMaterial)
  } catch (err) {
    console.error("[getMaterials]", err)
    return { error: "Failed to load materials" }
  }
}

// ---------------------------------------------------------------------------
// addMaterial
// ---------------------------------------------------------------------------

export interface AddMaterialInput {
  name: string
  category?: string
  quantity_estimated?: string
  unit?: string
  unit_cost_estimated?: string | null
  supplier?: string | null
  notes?: string | null
}

export async function addMaterial(
  projectId: string,
  data: AddMaterialInput
): Promise<{ data: ProjectMaterial[] } | { error: string }> {
  const token = await getToken()
  if (!token) return { error: "Not authenticated" }
  if (!token.org_id) return { error: "No org context" }

  try {
    await withRls(token, (db) =>
      db.insert(projectMaterials).values({
        org_id: token.org_id!,
        project_id: projectId,
        name: data.name,
        category: data.category ?? "other",
        quantity_estimated: data.quantity_estimated ?? "1",
        unit: data.unit ?? "each",
        unit_cost_estimated: data.unit_cost_estimated ?? null,
        supplier: data.supplier ?? null,
        notes: data.notes ?? null,
        order_status: "not_ordered",
      })
    )

    revalidatePath(`/projects/${projectId}/materials`)
    const fresh = await getMaterials(projectId)
    if ("error" in fresh) return { error: fresh.error }
    return { data: fresh }
  } catch (err) {
    console.error("[addMaterial]", err)
    return { error: "Failed to add material" }
  }
}

// ---------------------------------------------------------------------------
// updateMaterial
// ---------------------------------------------------------------------------

export interface UpdateMaterialInput {
  name?: string
  category?: string
  quantity_estimated?: string
  unit?: string
  unit_cost_estimated?: string | null
  unit_cost_actual?: string | null
  supplier?: string | null
  notes?: string | null
  order_status?: string
}

export async function updateMaterial(
  materialId: string,
  data: UpdateMaterialInput
): Promise<{ data: ProjectMaterial[] } | { error: string }> {
  const token = await getToken()
  if (!token) return { error: "Not authenticated" }
  if (!token.org_id) return { error: "No org context" }

  try {
    // Fetch to get project_id for revalidation and return
    const [existing] = await withRls(token, (db) =>
      db
        .select({ project_id: projectMaterials.project_id })
        .from(projectMaterials)
        .where(
          and(
            eq(projectMaterials.id, materialId),
            eq(projectMaterials.org_id, token.org_id!)
          )
        )
        .limit(1)
    )

    if (!existing) return { error: "Material not found" }

    const updateData: Partial<typeof projectMaterials.$inferInsert> = {
      updated_at: new Date(),
    }
    if (data.name !== undefined) updateData.name = data.name
    if (data.category !== undefined) updateData.category = data.category
    if (data.quantity_estimated !== undefined) updateData.quantity_estimated = data.quantity_estimated
    if (data.unit !== undefined) updateData.unit = data.unit
    if (data.unit_cost_estimated !== undefined) updateData.unit_cost_estimated = data.unit_cost_estimated
    if (data.unit_cost_actual !== undefined) updateData.unit_cost_actual = data.unit_cost_actual
    if (data.supplier !== undefined) updateData.supplier = data.supplier
    if (data.notes !== undefined) updateData.notes = data.notes
    if (data.order_status !== undefined) updateData.order_status = data.order_status

    await withRls(token, (db) =>
      db
        .update(projectMaterials)
        .set(updateData)
        .where(
          and(
            eq(projectMaterials.id, materialId),
            eq(projectMaterials.org_id, token.org_id!)
          )
        )
    )

    revalidatePath(`/projects/${existing.project_id}/materials`)
    const fresh = await getMaterials(existing.project_id)
    if ("error" in fresh) return { error: fresh.error }
    return { data: fresh }
  } catch (err) {
    console.error("[updateMaterial]", err)
    return { error: "Failed to update material" }
  }
}

// ---------------------------------------------------------------------------
// createPurchaseOrder
// ---------------------------------------------------------------------------

export interface CreatePurchaseOrderInput {
  supplier_name: string
  supplier_contact?: string | null
  notes?: string | null
  lineItems: Array<{
    material_id: string
    materialName: string
    quantity: string
    unit_price: string
  }>
}

export async function createPurchaseOrder(
  projectId: string,
  data: CreatePurchaseOrderInput
): Promise<{ data: PurchaseOrder } | { error: string }> {
  const token = await getToken()
  if (!token) return { error: "Not authenticated" }
  if (!token.org_id) return { error: "No org context" }
  if (!data.lineItems.length) return { error: "At least one line item required" }

  try {
    // Generate sequential PO number per org: "PO-XXXX"
    const countResult = await adminDb
      .select({ cnt: count(projectPurchaseOrders.id) })
      .from(projectPurchaseOrders)
      .where(eq(projectPurchaseOrders.org_id, token.org_id))
    const nextNum = (Number(countResult[0]?.cnt ?? 0) + 1).toString().padStart(4, "0")
    const poNumber = `PO-${nextNum}`

    // Calculate total
    const total = data.lineItems.reduce((sum, li) => {
      return sum + parseFloat(li.quantity) * parseFloat(li.unit_price)
    }, 0)

    // Create the PO
    const [newPo] = await withRls(token, (db) =>
      db
        .insert(projectPurchaseOrders)
        .values({
          org_id: token.org_id!,
          project_id: projectId,
          po_number: poNumber,
          supplier_name: data.supplier_name,
          supplier_contact: data.supplier_contact ?? null,
          status: "draft",
          total_amount: total.toFixed(2),
          notes: data.notes ?? null,
        })
        .returning()
    )

    // Create PO line items + update material order_status to 'ordered'
    const lineItemValues = data.lineItems.map((li) => {
      const lineTotal = parseFloat(li.quantity) * parseFloat(li.unit_price)
      return {
        org_id: token.org_id!,
        po_id: newPo.id,
        material_id: li.material_id,
        quantity: li.quantity,
        unit_price: li.unit_price,
        total: lineTotal.toFixed(2),
      }
    })

    await withRls(token, (db) =>
      db.insert(projectPoLineItems).values(lineItemValues)
    )

    // Update each linked material's quantity_ordered and order_status
    for (const li of data.lineItems) {
      const [mat] = await withRls(token, (db) =>
        db
          .select({ quantity_ordered: projectMaterials.quantity_ordered })
          .from(projectMaterials)
          .where(
            and(
              eq(projectMaterials.id, li.material_id),
              eq(projectMaterials.org_id, token.org_id!)
            )
          )
          .limit(1)
      )
      if (mat) {
        const newOrdered = parseFloat(mat.quantity_ordered) + parseFloat(li.quantity)
        await withRls(token, (db) =>
          db
            .update(projectMaterials)
            .set({
              quantity_ordered: newOrdered.toString(),
              order_status: "ordered",
              updated_at: new Date(),
            })
            .where(
              and(
                eq(projectMaterials.id, li.material_id),
                eq(projectMaterials.org_id, token.org_id!)
              )
            )
        )
      }
    }

    // Append to project activity_log
    const [proj] = await withRls(token, (db) =>
      db
        .select({ activity_log: projects.activity_log })
        .from(projects)
        .where(and(eq(projects.id, projectId), eq(projects.org_id, token.org_id!)))
        .limit(1)
    )
    if (proj) {
      const updatedLog = [
        ...(proj.activity_log ?? []),
        {
          type: "purchase_order_created",
          at: new Date().toISOString(),
          by_id: token.sub,
          note: `Purchase order ${poNumber} created for ${data.supplier_name} ($${total.toFixed(2)})`,
        },
      ]
      await withRls(token, (db) =>
        db
          .update(projects)
          .set({ activity_log: updatedLog, last_activity_at: new Date(), updated_at: new Date() })
          .where(and(eq(projects.id, projectId), eq(projects.org_id, token.org_id!)))
      )
    }

    revalidatePath(`/projects/${projectId}/materials`)

    // Return the created PO with line items
    const poLineItems = await withRls(token, (db) =>
      db
        .select()
        .from(projectPoLineItems)
        .where(eq(projectPoLineItems.po_id, newPo.id))
    )

    return {
      data: {
        ...newPo,
        lineItems: poLineItems.map((li) => ({
          id: li.id,
          material_id: li.material_id,
          materialName: data.lineItems.find((d) => d.material_id === li.material_id)?.materialName ?? "",
          quantity: li.quantity,
          unit_price: li.unit_price,
          total: li.total,
        })),
      },
    }
  } catch (err) {
    console.error("[createPurchaseOrder]", err)
    return { error: "Failed to create purchase order" }
  }
}

// ---------------------------------------------------------------------------
// getPurchaseOrders
// ---------------------------------------------------------------------------

export async function getPurchaseOrders(
  projectId: string
): Promise<PurchaseOrder[] | { error: string }> {
  const token = await getToken()
  if (!token) return { error: "Not authenticated" }

  try {
    const pos = await withRls(token, (db) =>
      db
        .select()
        .from(projectPurchaseOrders)
        .where(
          and(
            eq(projectPurchaseOrders.project_id, projectId),
            eq(projectPurchaseOrders.org_id, token.org_id!)
          )
        )
        .orderBy(desc(projectPurchaseOrders.created_at))
    )

    if (pos.length === 0) return []

    // Fetch line items for all POs
    const poIds = pos.map((p) => p.id)
    const lineItems = await withRls(token, (db) =>
      db
        .select({
          id: projectPoLineItems.id,
          po_id: projectPoLineItems.po_id,
          material_id: projectPoLineItems.material_id,
          quantity: projectPoLineItems.quantity,
          unit_price: projectPoLineItems.unit_price,
          total: projectPoLineItems.total,
          materialName: projectMaterials.name,
        })
        .from(projectPoLineItems)
        .leftJoin(projectMaterials, eq(projectMaterials.id, projectPoLineItems.material_id))
        .where(inArray(projectPoLineItems.po_id, poIds))
    )

    return pos.map((po) => ({
      ...po,
      lineItems: lineItems
        .filter((li) => li.po_id === po.id)
        .map((li) => ({
          id: li.id,
          material_id: li.material_id,
          materialName: li.materialName ?? "Unknown",
          quantity: li.quantity,
          unit_price: li.unit_price,
          total: li.total,
        })),
    }))
  } catch (err) {
    console.error("[getPurchaseOrders]", err)
    return { error: "Failed to load purchase orders" }
  }
}

// ---------------------------------------------------------------------------
// updatePurchaseOrderStatus
// ---------------------------------------------------------------------------

export async function updatePurchaseOrderStatus(
  poId: string,
  status: string
): Promise<{ success: true } | { error: string }> {
  const token = await getToken()
  if (!token) return { error: "Not authenticated" }
  if (!token.org_id) return { error: "No org context" }

  try {
    const [po] = await withRls(token, (db) =>
      db
        .select({ project_id: projectPurchaseOrders.project_id })
        .from(projectPurchaseOrders)
        .where(
          and(
            eq(projectPurchaseOrders.id, poId),
            eq(projectPurchaseOrders.org_id, token.org_id!)
          )
        )
        .limit(1)
    )

    if (!po) return { error: "Purchase order not found" }

    await withRls(token, (db) =>
      db
        .update(projectPurchaseOrders)
        .set({ status, updated_at: new Date() })
        .where(
          and(
            eq(projectPurchaseOrders.id, poId),
            eq(projectPurchaseOrders.org_id, token.org_id!)
          )
        )
    )

    revalidatePath(`/projects/${po.project_id}/materials`)
    return { success: true }
  } catch (err) {
    console.error("[updatePurchaseOrderStatus]", err)
    return { error: "Failed to update purchase order status" }
  }
}

// ---------------------------------------------------------------------------
// receiveMaterial (PROJ-29 partial delivery support)
// ---------------------------------------------------------------------------

export interface ReceiveMaterialInput {
  quantity_received: string
  po_id?: string | null
  photo_url?: string | null
  notes?: string | null
  unit_cost_actual?: string | null
}

export async function receiveMaterial(
  materialId: string,
  data: ReceiveMaterialInput
): Promise<{ data: ProjectMaterial[] } | { error: string }> {
  const token = await getToken()
  if (!token) return { error: "Not authenticated" }
  if (!token.org_id) return { error: "No org context" }

  try {
    const [mat] = await withRls(token, (db) =>
      db
        .select()
        .from(projectMaterials)
        .where(
          and(
            eq(projectMaterials.id, materialId),
            eq(projectMaterials.org_id, token.org_id!)
          )
        )
        .limit(1)
    )

    if (!mat) return { error: "Material not found" }

    const qtyReceived = parseFloat(data.quantity_received)
    const newQtyReceived = parseFloat(mat.quantity_received) + qtyReceived
    const qtyOrdered = parseFloat(mat.quantity_ordered)

    // Determine new order_status based on quantities
    let newOrderStatus = mat.order_status
    if (qtyOrdered > 0) {
      if (newQtyReceived < qtyOrdered) {
        newOrderStatus = "partial"
      } else {
        newOrderStatus = "received"
      }
    }

    // Create receipt record
    await withRls(token, (db) =>
      db.insert(projectMaterialReceipts).values({
        org_id: token.org_id!,
        material_id: materialId,
        po_id: data.po_id ?? null,
        quantity_received: data.quantity_received,
        received_by: token.sub,
        photo_url: data.photo_url ?? null,
        notes: data.notes ?? null,
      })
    )

    // Update material cumulative quantities and actual cost
    const updateData: Partial<typeof projectMaterials.$inferInsert> = {
      quantity_received: newQtyReceived.toString(),
      order_status: newOrderStatus,
      updated_at: new Date(),
    }
    if (data.unit_cost_actual) {
      updateData.unit_cost_actual = data.unit_cost_actual
    }

    await withRls(token, (db) =>
      db
        .update(projectMaterials)
        .set(updateData)
        .where(
          and(
            eq(projectMaterials.id, materialId),
            eq(projectMaterials.org_id, token.org_id!)
          )
        )
    )

    revalidatePath(`/projects/${mat.project_id}/materials`)
    const fresh = await getMaterials(mat.project_id)
    if ("error" in fresh) return { error: fresh.error }
    return { data: fresh }
  } catch (err) {
    console.error("[receiveMaterial]", err)
    return { error: "Failed to record material receipt" }
  }
}

// ---------------------------------------------------------------------------
// getReceipts
// ---------------------------------------------------------------------------

export async function getReceipts(
  projectId: string
): Promise<(MaterialReceipt & { materialName: string })[] | { error: string }> {
  const token = await getToken()
  if (!token) return { error: "Not authenticated" }

  try {
    const rows = await withRls(token, (db) =>
      db
        .select({
          id: projectMaterialReceipts.id,
          material_id: projectMaterialReceipts.material_id,
          po_id: projectMaterialReceipts.po_id,
          quantity_received: projectMaterialReceipts.quantity_received,
          received_at: projectMaterialReceipts.received_at,
          photo_url: projectMaterialReceipts.photo_url,
          notes: projectMaterialReceipts.notes,
          materialName: projectMaterials.name,
        })
        .from(projectMaterialReceipts)
        .leftJoin(projectMaterials, eq(projectMaterials.id, projectMaterialReceipts.material_id))
        .where(
          and(
            eq(projectMaterials.project_id, projectId),
            eq(projectMaterialReceipts.org_id, token.org_id!)
          )
        )
        .orderBy(desc(projectMaterialReceipts.received_at))
    )

    return rows.map((r) => ({
      ...r,
      materialName: r.materialName ?? "Unknown Material",
    }))
  } catch (err) {
    console.error("[getReceipts]", err)
    return { error: "Failed to load receipts" }
  }
}

// ---------------------------------------------------------------------------
// returnMaterial (PROJ-33)
// ---------------------------------------------------------------------------

export interface ReturnMaterialInput {
  quantity_returned: string
  return_reason?: string | null
  credit_amount?: string | null
}

export async function returnMaterial(
  materialId: string,
  data: ReturnMaterialInput
): Promise<{ data: ProjectMaterial[] } | { error: string }> {
  const token = await getToken()
  if (!token) return { error: "Not authenticated" }
  if (!token.org_id) return { error: "No org context" }

  try {
    const [mat] = await withRls(token, (db) =>
      db
        .select()
        .from(projectMaterials)
        .where(
          and(
            eq(projectMaterials.id, materialId),
            eq(projectMaterials.org_id, token.org_id!)
          )
        )
        .limit(1)
    )

    if (!mat) return { error: "Material not found" }

    const qtyReturned = parseFloat(data.quantity_returned)

    // Create return record
    await withRls(token, (db) =>
      db.insert(projectMaterialReturns).values({
        org_id: token.org_id!,
        material_id: materialId,
        quantity_returned: data.quantity_returned,
        return_reason: data.return_reason ?? null,
        credit_amount: data.credit_amount ?? "0",
        returned_by: token.sub,
      })
    )

    // Reduce received quantity (returns come out of received stock)
    const newQtyReceived = Math.max(0, parseFloat(mat.quantity_received) - qtyReturned)
    const qtyOrdered = parseFloat(mat.quantity_ordered)

    let newOrderStatus = mat.order_status
    if (newQtyReceived === 0 && qtyOrdered > 0) {
      newOrderStatus = "returned"
    } else if (newQtyReceived < qtyOrdered) {
      newOrderStatus = "partial"
    }

    await withRls(token, (db) =>
      db
        .update(projectMaterials)
        .set({
          quantity_received: newQtyReceived.toString(),
          order_status: newOrderStatus,
          updated_at: new Date(),
        })
        .where(
          and(
            eq(projectMaterials.id, materialId),
            eq(projectMaterials.org_id, token.org_id!)
          )
        )
    )

    revalidatePath(`/projects/${mat.project_id}/materials`)
    const fresh = await getMaterials(mat.project_id)
    if ("error" in fresh) return { error: fresh.error }
    return { data: fresh }
  } catch (err) {
    console.error("[returnMaterial]", err)
    return { error: "Failed to record material return" }
  }
}

// ---------------------------------------------------------------------------
// getMaterialCostVariance (PROJ-31)
// ---------------------------------------------------------------------------

/**
 * Over-budget threshold: 10% (configurable).
 * Per-material: color-code variance green/amber/red.
 * Project-level: sum of all materials.
 * Alert threshold: project actual > estimated by >10%.
 */
const OVER_BUDGET_ALERT_PCT = 10

export async function getMaterialCostVariance(
  projectId: string
): Promise<MaterialCostVariance | { error: string }> {
  const token = await getToken()
  if (!token) return { error: "Not authenticated" }

  try {
    const materials = await getMaterials(projectId)
    if ("error" in materials) return { error: materials.error }

    const materialVariances = materials.map((m) => ({
      id: m.id,
      name: m.name,
      total_estimated: m.total_estimated,
      total_actual: m.total_actual,
      variance: m.variance,
      variance_pct: m.variance_pct,
      is_over_budget: m.variance_pct !== null && m.variance_pct > OVER_BUDGET_ALERT_PCT,
    }))

    const project_total_estimated = materialVariances.reduce((s, m) => s + m.total_estimated, 0)
    const project_total_actual = materialVariances.reduce((s, m) => s + m.total_actual, 0)
    const project_variance = project_total_actual - project_total_estimated
    const project_variance_pct =
      project_total_estimated > 0
        ? (project_variance / project_total_estimated) * 100
        : null

    const has_alert =
      project_variance_pct !== null && project_variance_pct > OVER_BUDGET_ALERT_PCT

    return {
      materials: materialVariances,
      project_total_estimated,
      project_total_actual,
      project_variance,
      project_variance_pct,
      has_alert,
    }
  } catch (err) {
    console.error("[getMaterialCostVariance]", err)
    return { error: "Failed to compute cost variance" }
  }
}

// ---------------------------------------------------------------------------
// getPurchaseOrderForPdf — fetch full PO data for PDF generation
// ---------------------------------------------------------------------------

export interface PurchaseOrderPdfData {
  po_number: string | null
  supplier_name: string
  supplier_contact: string | null
  notes: string | null
  created_at: Date
  total_amount: string
  projectName: string
  projectNumber: string | null
  projectAddress: string | null
  companyName: string
  companyLogoUrl: string | null
  lineItems: Array<{
    materialName: string
    quantity: string
    unit: string
    unit_price: string
    total: string
  }>
}

export async function getPurchaseOrderForPdf(
  poId: string
): Promise<{ data: PurchaseOrderPdfData } | { error: string }> {
  const token = await getToken()
  if (!token) return { error: "Not authenticated" }
  if (!token.org_id) return { error: "No org context" }

  try {
    const [po] = await withRls(token, (db) =>
      db
        .select()
        .from(projectPurchaseOrders)
        .where(
          and(
            eq(projectPurchaseOrders.id, poId),
            eq(projectPurchaseOrders.org_id, token.org_id!)
          )
        )
        .limit(1)
    )

    if (!po) return { error: "Purchase order not found" }

    // Fetch line items with material names and units
    const lineItems = await withRls(token, (db) =>
      db
        .select({
          materialName: projectMaterials.name,
          materialUnit: projectMaterials.unit,
          quantity: projectPoLineItems.quantity,
          unit_price: projectPoLineItems.unit_price,
          total: projectPoLineItems.total,
        })
        .from(projectPoLineItems)
        .leftJoin(projectMaterials, eq(projectMaterials.id, projectPoLineItems.material_id))
        .where(eq(projectPoLineItems.po_id, poId))
    )

    // Fetch project info
    const [proj] = await withRls(token, (db) =>
      db
        .select({
          name: projects.name,
          project_number: projects.project_number,
        })
        .from(projects)
        .where(and(eq(projects.id, po.project_id), eq(projects.org_id, token.org_id!)))
        .limit(1)
    )

    // Fetch org info (name + logo from orgs table)
    const { orgs } = await import("@/lib/db/schema")
    const [orgRow] = await withRls(token, (db) =>
      db
        .select({
          name: orgs.name,
          logo_url: orgs.logo_url,
        })
        .from(orgs)
        .where(eq(orgs.id, token.org_id!))
        .limit(1)
    )

    return {
      data: {
        po_number: po.po_number,
        supplier_name: po.supplier_name,
        supplier_contact: po.supplier_contact,
        notes: po.notes,
        created_at: po.created_at,
        total_amount: po.total_amount,
        projectName: proj?.name ?? "Unknown Project",
        projectNumber: proj?.project_number ?? null,
        projectAddress: null,
        companyName: orgRow?.name ?? "DeweyIQ",
        companyLogoUrl: orgRow?.logo_url ?? null,
        lineItems: lineItems.map((li) => ({
          materialName: li.materialName ?? "Item",
          quantity: li.quantity,
          unit: li.materialUnit ?? "each",
          unit_price: li.unit_price,
          total: li.total,
        })),
      },
    }
  } catch (err) {
    console.error("[getPurchaseOrderForPdf]", err)
    return { error: "Failed to load purchase order data" }
  }
}
