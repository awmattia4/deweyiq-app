"use server"

import { revalidatePath } from "next/cache"
import { getCurrentUser } from "./auth"
import { createClient } from "@/lib/supabase/server"
import { withRls } from "@/lib/db"
import type { SupabaseToken } from "@/lib/db"
import { customers } from "@/lib/db/schema"
import { eq } from "drizzle-orm"

// ─── Input types ───────────────────────────────────────────────────────────────

type CreateCustomerInput = {
  full_name: string
  address?: string
  phone?: string
  email?: string
  gate_code?: string
  access_notes?: string
  status?: "active" | "paused" | "cancelled"
  assigned_tech_id?: string
  route_name?: string
}

type UpdateCustomerInput = {
  id: string
  full_name?: string
  address?: string
  phone?: string
  email?: string
  gate_code?: string
  access_notes?: string
  status?: "active" | "paused" | "cancelled"
  assigned_tech_id?: string | null
  route_name?: string
}

type DeleteCustomerInput = {
  id: string
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
 * createCustomer — creates a new customer record for the org.
 *
 * Auth: owner or office only (enforced by RLS insert policy + role check).
 * Revalidates: /customers on success.
 */
export async function createCustomer(
  input: CreateCustomerInput
): Promise<{ success: boolean; customerId?: string; error?: string }> {
  const user = await getCurrentUser()

  if (!user) {
    return { success: false, error: "You must be logged in." }
  }

  if (user.role !== "owner" && user.role !== "office") {
    return { success: false, error: "Only owner and office staff can create customers." }
  }

  if (!input.full_name?.trim()) {
    return { success: false, error: "Customer name is required." }
  }

  const token = await getRlsToken()
  if (!token) {
    return { success: false, error: "Authentication error. Please sign in again." }
  }

  try {
    const result = await withRls(token, (db) =>
      db
        .insert(customers)
        .values({
          org_id: user.org_id,
          full_name: input.full_name.trim(),
          address: input.address?.trim() || null,
          phone: input.phone?.trim() || null,
          email: input.email?.trim() || null,
          gate_code: input.gate_code?.trim() || null,
          access_notes: input.access_notes?.trim() || null,
          status: input.status ?? "active",
          assigned_tech_id: input.assigned_tech_id || null,
          route_name: input.route_name?.trim() || null,
        })
        .returning({ id: customers.id })
    )

    revalidatePath("/customers")

    return { success: true, customerId: result[0]?.id }
  } catch (err) {
    console.error("[createCustomer] DB error:", err)
    return { success: false, error: "Failed to create customer. Please try again." }
  }
}

/**
 * updateCustomer — updates an existing customer record.
 *
 * Auth: owner or office only (enforced by RLS update policy + role check).
 * Revalidates: /customers and /customers/[id] on success.
 */
export async function updateCustomer(
  input: UpdateCustomerInput
): Promise<{ success: boolean; error?: string }> {
  const user = await getCurrentUser()

  if (!user) {
    return { success: false, error: "You must be logged in." }
  }

  if (user.role !== "owner" && user.role !== "office") {
    return { success: false, error: "Only owner and office staff can update customers." }
  }

  if (!input.id) {
    return { success: false, error: "Customer ID is required." }
  }

  const token = await getRlsToken()
  if (!token) {
    return { success: false, error: "Authentication error. Please sign in again." }
  }

  // Build update values (only include defined fields)
  const updateValues: Record<string, unknown> = {
    updated_at: new Date(),
  }

  if (input.full_name !== undefined) updateValues.full_name = input.full_name.trim()
  if (input.address !== undefined) updateValues.address = input.address?.trim() || null
  if (input.phone !== undefined) updateValues.phone = input.phone?.trim() || null
  if (input.email !== undefined) updateValues.email = input.email?.trim() || null
  if (input.gate_code !== undefined) updateValues.gate_code = input.gate_code?.trim() || null
  if (input.access_notes !== undefined) updateValues.access_notes = input.access_notes?.trim() || null
  if (input.status !== undefined) updateValues.status = input.status
  if (input.assigned_tech_id !== undefined) updateValues.assigned_tech_id = input.assigned_tech_id
  if (input.route_name !== undefined) updateValues.route_name = input.route_name?.trim() || null

  try {
    await withRls(token, (db) =>
      db
        .update(customers)
        .set(updateValues)
        .where(eq(customers.id, input.id))
    )

    revalidatePath("/customers")
    revalidatePath(`/customers/${input.id}`)

    return { success: true }
  } catch (err) {
    console.error("[updateCustomer] DB error:", err)
    return { success: false, error: "Failed to update customer. Please try again." }
  }
}

/**
 * deleteCustomer — permanently deletes a customer record.
 *
 * Auth: owner only (not office). Enforced by RLS delete policy + role check.
 * Revalidates: /customers on success.
 */
export async function deleteCustomer(
  input: DeleteCustomerInput
): Promise<{ success: boolean; error?: string }> {
  const user = await getCurrentUser()

  if (!user) {
    return { success: false, error: "You must be logged in." }
  }

  if (user.role !== "owner") {
    return { success: false, error: "Only the owner can delete customers." }
  }

  if (!input.id) {
    return { success: false, error: "Customer ID is required." }
  }

  const token = await getRlsToken()
  if (!token) {
    return { success: false, error: "Authentication error. Please sign in again." }
  }

  try {
    await withRls(token, (db) =>
      db.delete(customers).where(eq(customers.id, input.id))
    )

    revalidatePath("/customers")

    return { success: true }
  } catch (err) {
    console.error("[deleteCustomer] DB error:", err)
    return { success: false, error: "Failed to delete customer. Please try again." }
  }
}
