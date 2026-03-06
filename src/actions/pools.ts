"use server"

import { revalidatePath } from "next/cache"
import { getCurrentUser } from "./auth"
import { createClient } from "@/lib/supabase/server"
import { withRls } from "@/lib/db"
import type { SupabaseToken } from "@/lib/db"
import { pools } from "@/lib/db/schema"
import { eq } from "drizzle-orm"

// ─── Input types ───────────────────────────────────────────────────────────────

type AddPoolInput = {
  customer_id: string
  name: string
  type: "pool" | "spa" | "fountain"
  volume_gallons?: number
  surface_type?: "plaster" | "pebble" | "fiberglass" | "vinyl" | "tile"
  sanitizer_type?: "chlorine" | "salt" | "bromine" | "biguanide"
  notes?: string
}

type UpdatePoolInput = {
  id: string
  name?: string
  type?: "pool" | "spa" | "fountain"
  volume_gallons?: number | null
  surface_type?: "plaster" | "pebble" | "fiberglass" | "vinyl" | "tile" | null
  sanitizer_type?: "chlorine" | "salt" | "bromine" | "biguanide" | null
  notes?: string | null
}

type DeletePoolInput = {
  id: string
  customer_id: string
}

// ─── Helper: get RLS token ─────────────────────────────────────────────────────

async function getRlsToken(): Promise<SupabaseToken | null> {
  const supabase = await createClient()
  const { data: claimsData } = await supabase.auth.getClaims()
  if (!claimsData?.claims) return null
  return claimsData.claims as SupabaseToken
}

// ─── Server actions ────────────────────────────────────────────────────────────

/**
 * addPool — creates a new pool/spa/fountain for a customer.
 *
 * Auth: owner or office only (enforced by RLS insert policy + role check).
 * Revalidates: /customers/[customer_id] on success.
 */
export async function addPool(
  input: AddPoolInput
): Promise<{ success: boolean; poolId?: string; error?: string }> {
  const user = await getCurrentUser()

  if (!user) {
    return { success: false, error: "You must be logged in." }
  }

  if (user.role !== "owner" && user.role !== "office") {
    return { success: false, error: "Only owner and office staff can add pools." }
  }

  if (!input.name?.trim()) {
    return { success: false, error: "Pool name is required." }
  }

  if (!input.customer_id) {
    return { success: false, error: "Customer ID is required." }
  }

  const token = await getRlsToken()
  if (!token) {
    return { success: false, error: "Authentication error. Please sign in again." }
  }

  try {
    const result = await withRls(token, (db) =>
      db
        .insert(pools)
        .values({
          org_id: user.org_id,
          customer_id: input.customer_id,
          name: input.name.trim(),
          type: input.type,
          volume_gallons: input.volume_gallons ?? null,
          surface_type: input.surface_type ?? null,
          sanitizer_type: input.sanitizer_type ?? null,
          notes: input.notes?.trim() ?? null,
        })
        .returning({ id: pools.id })
    )

    revalidatePath(`/customers/${input.customer_id}`)

    return { success: true, poolId: result[0]?.id }
  } catch (err) {
    console.error("[addPool] DB error:", err)
    return { success: false, error: "Failed to add pool. Please try again." }
  }
}

/**
 * updatePool — updates an existing pool record.
 *
 * Auth: owner or office only.
 * Revalidates: requires customer_id — caller should pass it for revalidation.
 */
export async function updatePool(
  input: UpdatePoolInput & { customer_id: string }
): Promise<{ success: boolean; error?: string }> {
  const user = await getCurrentUser()

  if (!user) {
    return { success: false, error: "You must be logged in." }
  }

  if (user.role !== "owner" && user.role !== "office") {
    return { success: false, error: "Only owner and office staff can update pools." }
  }

  if (!input.id) {
    return { success: false, error: "Pool ID is required." }
  }

  const token = await getRlsToken()
  if (!token) {
    return { success: false, error: "Authentication error. Please sign in again." }
  }

  const updateValues: Record<string, unknown> = {
    updated_at: new Date(),
  }

  if (input.name !== undefined) updateValues.name = input.name.trim()
  if (input.type !== undefined) updateValues.type = input.type
  if (input.volume_gallons !== undefined) updateValues.volume_gallons = input.volume_gallons
  if (input.surface_type !== undefined) updateValues.surface_type = input.surface_type
  if (input.sanitizer_type !== undefined) updateValues.sanitizer_type = input.sanitizer_type
  if (input.notes !== undefined) updateValues.notes = input.notes

  try {
    await withRls(token, (db) =>
      db.update(pools).set(updateValues).where(eq(pools.id, input.id))
    )

    revalidatePath(`/customers/${input.customer_id}`)

    return { success: true }
  } catch (err) {
    console.error("[updatePool] DB error:", err)
    return { success: false, error: "Failed to update pool. Please try again." }
  }
}

/**
 * deletePool — permanently deletes a pool and its equipment (cascade).
 *
 * Auth: owner or office only.
 * Revalidates: /customers/[customer_id] on success.
 */
export async function deletePool(
  input: DeletePoolInput
): Promise<{ success: boolean; error?: string }> {
  const user = await getCurrentUser()

  if (!user) {
    return { success: false, error: "You must be logged in." }
  }

  if (user.role !== "owner" && user.role !== "office") {
    return { success: false, error: "Only owner and office staff can delete pools." }
  }

  if (!input.id || !input.customer_id) {
    return { success: false, error: "Pool ID and Customer ID are required." }
  }

  const token = await getRlsToken()
  if (!token) {
    return { success: false, error: "Authentication error. Please sign in again." }
  }

  try {
    await withRls(token, (db) =>
      db.delete(pools).where(eq(pools.id, input.id))
    )

    revalidatePath(`/customers/${input.customer_id}`)

    return { success: true }
  } catch (err) {
    console.error("[deletePool] DB error:", err)
    return { success: false, error: "Failed to delete pool. Please try again." }
  }
}
