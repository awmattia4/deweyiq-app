"use server"

import { revalidatePath } from "next/cache"
import { withRls, getRlsToken } from "@/lib/db"
import { chemicalProducts } from "@/lib/db/schema"
import { eq, and } from "drizzle-orm"

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface ChemicalProduct {
  id: string
  org_id: string
  name: string
  chemical_type: string
  concentration_pct: number | null
  unit: string
  cost_per_unit: string | null
  is_active: boolean
  created_at: Date
}

export interface AddChemicalProductInput {
  name: string
  chemicalType: string
  concentrationPct?: string
  unit: string
  costPerUnit?: string
}

// ---------------------------------------------------------------------------
// getChemicalProducts
// ---------------------------------------------------------------------------

/**
 * Fetches all chemical products for the org (including inactive so manager can see them).
 */
export async function getChemicalProducts(): Promise<ChemicalProduct[]> {
  const token = await getRlsToken()
  if (!token) return []

  try {
    return await withRls(token, async (db) => {
      const rows = await db
        .select()
        .from(chemicalProducts)
        .orderBy(chemicalProducts.chemical_type, chemicalProducts.name)

      return rows.map((r) => ({
        ...r,
        concentration_pct: r.concentration_pct ?? null,
        cost_per_unit: r.cost_per_unit ?? null,
      }))
    })
  } catch (err) {
    console.error("[getChemicalProducts] Error:", err)
    return []
  }
}

// ---------------------------------------------------------------------------
// addChemicalProduct
// ---------------------------------------------------------------------------

/**
 * Creates a new chemical product for the org.
 */
export async function addChemicalProduct(
  data: AddChemicalProductInput
): Promise<{ success: boolean; id?: string; error?: string }> {
  const token = await getRlsToken()
  if (!token) return { success: false, error: "Not authenticated" }

  const orgId = token.org_id as string

  try {
    const result = await withRls(token, async (db) => {
      const inserted = await db
        .insert(chemicalProducts)
        .values({
          org_id: orgId,
          name: data.name,
          chemical_type: data.chemicalType,
          concentration_pct: data.concentrationPct ? parseFloat(data.concentrationPct) : null,
          unit: data.unit,
          cost_per_unit: data.costPerUnit ?? null,
          is_active: true,
        })
        .returning({ id: chemicalProducts.id })

      return inserted[0]?.id ?? null
    })

    revalidatePath("/settings")
    return { success: true, id: result ?? undefined }
  } catch (err) {
    console.error("[addChemicalProduct] Error:", err)
    return { success: false, error: err instanceof Error ? err.message : "Unknown error" }
  }
}

// ---------------------------------------------------------------------------
// updateChemicalProduct
// ---------------------------------------------------------------------------

/**
 * Updates a chemical product's fields.
 */
export async function updateChemicalProduct(
  id: string,
  data: Partial<AddChemicalProductInput>
): Promise<{ success: boolean; error?: string }> {
  const token = await getRlsToken()
  if (!token) return { success: false, error: "Not authenticated" }

  try {
    await withRls(token, async (db) => {
      const updates: Partial<typeof chemicalProducts.$inferInsert> = {}

      if (data.name !== undefined) updates.name = data.name
      if (data.chemicalType !== undefined) updates.chemical_type = data.chemicalType
      if (data.concentrationPct !== undefined)
        updates.concentration_pct = data.concentrationPct ? parseFloat(data.concentrationPct) : null
      if (data.unit !== undefined) updates.unit = data.unit
      if (data.costPerUnit !== undefined) updates.cost_per_unit = data.costPerUnit ?? null

      await db.update(chemicalProducts).set(updates).where(eq(chemicalProducts.id, id))
    })

    revalidatePath("/settings")
    return { success: true }
  } catch (err) {
    console.error("[updateChemicalProduct] Error:", err)
    return { success: false, error: err instanceof Error ? err.message : "Unknown error" }
  }
}

// ---------------------------------------------------------------------------
// deleteChemicalProduct (soft delete)
// ---------------------------------------------------------------------------

/**
 * Soft-deletes a chemical product by setting is_active=false.
 * Preserves historical references (dosing logs, service visits).
 */
export async function deleteChemicalProduct(
  id: string
): Promise<{ success: boolean; error?: string }> {
  const token = await getRlsToken()
  if (!token) return { success: false, error: "Not authenticated" }

  try {
    await withRls(token, async (db) => {
      await db
        .update(chemicalProducts)
        .set({ is_active: false })
        .where(eq(chemicalProducts.id, id))
    })

    revalidatePath("/settings")
    return { success: true }
  } catch (err) {
    console.error("[deleteChemicalProduct] Error:", err)
    return { success: false, error: err instanceof Error ? err.message : "Unknown error" }
  }
}
