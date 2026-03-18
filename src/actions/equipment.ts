"use server"

import { revalidatePath } from "next/cache"
import { getCurrentUser } from "./auth"
import { createClient } from "@/lib/supabase/server"
import { withRls, getRlsToken } from "@/lib/db"
import type { SupabaseToken } from "@/lib/db"
import { equipment, pools } from "@/lib/db/schema"
import { eq } from "drizzle-orm"

// ─── Input types ───────────────────────────────────────────────────────────────

type AddEquipmentInput = {
  pool_id: string
  type: string
  brand?: string
  model?: string
  install_date?: string // ISO date string (YYYY-MM-DD)
  notes?: string
}

type UpdateEquipmentInput = {
  id: string
  type?: string
  brand?: string | null
  model?: string | null
  install_date?: string | null
  notes?: string | null
  // for revalidation
  customer_id: string
}

type DeleteEquipmentInput = {
  id: string
  customer_id: string
}

// ─── Helper: get RLS token ─────────────────────────────────────────────────────


// ─── Server actions ────────────────────────────────────────────────────────────

/**
 * addEquipment — creates a new equipment record for a pool.
 *
 * Auth: owner or office only (enforced by RLS insert policy + role check).
 * Lookups pool to get customer_id and org_id for revalidation.
 * Revalidates: /customers/[customer_id] on success.
 */
export async function addEquipment(
  input: AddEquipmentInput
): Promise<{ success: boolean; equipmentId?: string; error?: string }> {
  const user = await getCurrentUser()

  if (!user) {
    return { success: false, error: "You must be logged in." }
  }

  if (user.role !== "owner" && user.role !== "office") {
    return { success: false, error: "Only owner and office staff can add equipment." }
  }

  if (!input.type?.trim()) {
    return { success: false, error: "Equipment type is required." }
  }

  if (!input.pool_id) {
    return { success: false, error: "Pool ID is required." }
  }

  const token = await getRlsToken()
  if (!token) {
    return { success: false, error: "Authentication error. Please sign in again." }
  }

  try {
    // Look up the pool to get customer_id for revalidation
    const [pool] = await withRls(token, (db) =>
      db
        .select({ id: pools.id, customer_id: pools.customer_id })
        .from(pools)
        .where(eq(pools.id, input.pool_id))
        .limit(1)
    )

    if (!pool) {
      return { success: false, error: "Pool not found." }
    }

    const result = await withRls(token, (db) =>
      db
        .insert(equipment)
        .values({
          org_id: user.org_id,
          pool_id: input.pool_id,
          type: input.type.trim(),
          brand: input.brand?.trim() || null,
          model: input.model?.trim() || null,
          install_date: input.install_date || null,
          notes: input.notes?.trim() || null,
        })
        .returning({ id: equipment.id })
    )

    revalidatePath(`/customers/${pool.customer_id}`)

    return { success: true, equipmentId: result[0]?.id }
  } catch (err) {
    console.error("[addEquipment] DB error:", err)
    return { success: false, error: "Failed to add equipment. Please try again." }
  }
}

/**
 * updateEquipment — updates an existing equipment record.
 *
 * Auth: owner or office only.
 * Revalidates: /customers/[customer_id] on success.
 */
export async function updateEquipment(
  input: UpdateEquipmentInput
): Promise<{ success: boolean; error?: string }> {
  const user = await getCurrentUser()

  if (!user) {
    return { success: false, error: "You must be logged in." }
  }

  if (user.role !== "owner" && user.role !== "office") {
    return { success: false, error: "Only owner and office staff can update equipment." }
  }

  if (!input.id) {
    return { success: false, error: "Equipment ID is required." }
  }

  const token = await getRlsToken()
  if (!token) {
    return { success: false, error: "Authentication error. Please sign in again." }
  }

  const updateValues: Record<string, unknown> = {
    updated_at: new Date(),
  }

  if (input.type !== undefined) updateValues.type = input.type.trim()
  if (input.brand !== undefined) updateValues.brand = input.brand?.trim() || null
  if (input.model !== undefined) updateValues.model = input.model?.trim() || null
  if (input.install_date !== undefined) updateValues.install_date = input.install_date || null
  if (input.notes !== undefined) updateValues.notes = input.notes?.trim() || null

  try {
    await withRls(token, (db) =>
      db.update(equipment).set(updateValues).where(eq(equipment.id, input.id))
    )

    revalidatePath(`/customers/${input.customer_id}`)

    return { success: true }
  } catch (err) {
    console.error("[updateEquipment] DB error:", err)
    return { success: false, error: "Failed to update equipment. Please try again." }
  }
}

/**
 * deleteEquipment — permanently deletes an equipment record.
 *
 * Auth: owner or office only.
 * Revalidates: /customers/[customer_id] on success.
 */
export async function deleteEquipment(
  input: DeleteEquipmentInput
): Promise<{ success: boolean; error?: string }> {
  const user = await getCurrentUser()

  if (!user) {
    return { success: false, error: "You must be logged in." }
  }

  if (user.role !== "owner" && user.role !== "office") {
    return { success: false, error: "Only owner and office staff can delete equipment." }
  }

  if (!input.id) {
    return { success: false, error: "Equipment ID is required." }
  }

  const token = await getRlsToken()
  if (!token) {
    return { success: false, error: "Authentication error. Please sign in again." }
  }

  try {
    await withRls(token, (db) =>
      db.delete(equipment).where(eq(equipment.id, input.id))
    )

    revalidatePath(`/customers/${input.customer_id}`)

    return { success: true }
  } catch (err) {
    console.error("[deleteEquipment] DB error:", err)
    return { success: false, error: "Failed to delete equipment. Please try again." }
  }
}
