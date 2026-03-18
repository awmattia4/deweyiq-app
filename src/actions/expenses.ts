"use server"

/**
 * expenses.ts -- Expense CRUD actions for P&L reporting and expense tracking.
 *
 * Phase 7: Basic expense CRUD.
 * Phase 11 (Plan 10): Extended with receipt uploads, category-to-account mapping,
 *   journal entry auto-generation, vendor grouping, and expense summary.
 *
 * Uses withRls for all queries. Owner+office+tech can create/view.
 * Owner only can update/delete.
 */

import { revalidatePath } from "next/cache"
import { createClient } from "@/lib/supabase/server"
import { withRls, getRlsToken } from "@/lib/db"
import type { SupabaseToken } from "@/lib/db"
import { expenses, profiles } from "@/lib/db/schema"
import { EXPENSE_CATEGORIES, type ExpenseCategory } from "@/lib/db/schema/expenses"
import { and, between, desc, eq, inArray, sql } from "drizzle-orm"
import { createExpenseJournalEntry } from "@/lib/accounting/journal"

// ---------------------------------------------------------------------------
// Auth helper
// ---------------------------------------------------------------------------


// ---------------------------------------------------------------------------
// Category to Chart of Accounts mapping
// ---------------------------------------------------------------------------

/**
 * mapExpenseCategoryToAccount -- Maps an expense category to its chart of accounts number.
 */
export async function mapExpenseCategoryToAccount(category: string): Promise<string> {
  const map: Record<string, string> = {
    chemicals: "5000",
    parts: "5100",
    fuel: "5200",
    vehicle_maintenance: "5300",
    subcontractor: "5400",
    insurance: "6000",
    marketing: "6100",
    office: "6200",
    // Legacy categories for backward compatibility
    equipment: "5100",
    labor: "5400",
    vehicle: "5300",
    other: "6200",
    mileage: "6300",
  }
  return map[category] ?? "6200"
}

// ---------------------------------------------------------------------------
// createExpense
// ---------------------------------------------------------------------------

export async function createExpense(data: {
  amount: string
  category: string
  description?: string
  date: string
  receiptUrl?: string
  vendorName?: string
}): Promise<{ success: boolean; expenseId?: string; error?: string }> {
  const token = await getRlsToken()
  if (!token) return { success: false, error: "Not authenticated" }

  const role = token["user_role"] as string | undefined
  if (!role || !["owner", "office", "tech"].includes(role)) {
    return { success: false, error: "Unauthorized" }
  }

  const amount = parseFloat(data.amount)
  if (isNaN(amount) || amount <= 0) {
    return { success: false, error: "Amount must be a positive number" }
  }

  if (!EXPENSE_CATEGORIES.includes(data.category as ExpenseCategory)) {
    return { success: false, error: "Invalid expense category" }
  }

  if (!data.date || !/^\d{4}-\d{2}-\d{2}$/.test(data.date)) {
    return { success: false, error: "Invalid date format" }
  }

  const orgId = token["org_id"] as string
  const userId = token["sub"] as string

  try {
    const inserted = await withRls(token, (db) =>
      db
        .insert(expenses)
        .values({
          org_id: orgId,
          amount: amount.toFixed(2),
          category: data.category,
          description: data.description?.trim() || null,
          date: data.date,
          receipt_url: data.receiptUrl || null,
          vendor_name: data.vendorName?.trim() || null,
          created_by: userId,
        })
        .returning({ id: expenses.id })
    )

    const expenseId = inserted[0]?.id

    // Fire-and-forget journal entry generation (owner/office have CoA access)
    if (expenseId && (role === "owner" || role === "office")) {
      void createExpenseJournalEntry(expenseId).catch((err) => {
        console.error("[createExpense] Journal entry generation failed:", err)
      })
    }

    revalidatePath("/reports")
    return { success: true, expenseId }
  } catch (err) {
    console.error("[createExpense] Error:", err)
    return { success: false, error: "Failed to create expense" }
  }
}

// ---------------------------------------------------------------------------
// createReceiptUploadUrl
// ---------------------------------------------------------------------------

export async function createReceiptUploadUrl(
  expenseId: string
): Promise<{ success: boolean; uploadUrl?: string; filePath?: string; error?: string }> {
  const token = await getRlsToken()
  if (!token) return { success: false, error: "Not authenticated" }

  const role = token["user_role"] as string | undefined
  if (!role || !["owner", "office", "tech"].includes(role)) {
    return { success: false, error: "Unauthorized" }
  }

  const orgId = token["org_id"] as string
  const filePath = `${orgId}/${expenseId}/receipt.jpg`

  try {
    const supabase = await createClient()
    const { data, error } = await supabase.storage
      .from("expense-receipts")
      .createSignedUploadUrl(filePath)

    if (error || !data) {
      console.error("[createReceiptUploadUrl] Error:", error)
      return { success: false, error: "Failed to create upload URL" }
    }

    return { success: true, uploadUrl: data.signedUrl, filePath }
  } catch (err) {
    console.error("[createReceiptUploadUrl] Error:", err)
    return { success: false, error: "Failed to create upload URL" }
  }
}

// ---------------------------------------------------------------------------
// updateExpenseReceipt
// ---------------------------------------------------------------------------

export async function updateExpenseReceipt(
  expenseId: string,
  receiptUrl: string
): Promise<{ success: boolean; error?: string }> {
  const token = await getRlsToken()
  if (!token) return { success: false, error: "Not authenticated" }

  const role = token["user_role"] as string | undefined
  if (!role || !["owner", "office", "tech"].includes(role)) {
    return { success: false, error: "Unauthorized" }
  }

  try {
    await withRls(token, (db) =>
      db
        .update(expenses)
        .set({ receipt_url: receiptUrl })
        .where(eq(expenses.id, expenseId))
    )

    revalidatePath("/reports")
    return { success: true }
  } catch (err) {
    console.error("[updateExpenseReceipt] Error:", err)
    return { success: false, error: "Failed to update receipt" }
  }
}

// ---------------------------------------------------------------------------
// updateExpense
// ---------------------------------------------------------------------------

export async function updateExpense(
  expenseId: string,
  data: {
    amount?: string
    category?: string
    description?: string
    date?: string
    vendorName?: string
  }
): Promise<{ success: boolean; error?: string }> {
  const token = await getRlsToken()
  if (!token) return { success: false, error: "Not authenticated" }

  const role = token["user_role"] as string | undefined
  if (role !== "owner") {
    return { success: false, error: "Only the owner can update expenses" }
  }

  const updates: Record<string, unknown> = {}

  if (data.amount !== undefined) {
    const amount = parseFloat(data.amount)
    if (isNaN(amount) || amount <= 0) {
      return { success: false, error: "Amount must be a positive number" }
    }
    updates.amount = amount.toFixed(2)
  }

  if (data.category !== undefined) {
    if (!EXPENSE_CATEGORIES.includes(data.category as ExpenseCategory)) {
      return { success: false, error: "Invalid expense category" }
    }
    updates.category = data.category
  }

  if (data.description !== undefined) updates.description = data.description.trim() || null
  if (data.date !== undefined) updates.date = data.date
  if (data.vendorName !== undefined) updates.vendor_name = data.vendorName.trim() || null

  if (Object.keys(updates).length === 0) return { success: true }

  try {
    await withRls(token, (db) =>
      db.update(expenses).set(updates).where(eq(expenses.id, expenseId))
    )

    revalidatePath("/reports")
    return { success: true }
  } catch (err) {
    console.error("[updateExpense] Error:", err)
    return { success: false, error: "Failed to update expense" }
  }
}

// ---------------------------------------------------------------------------
// getExpenses
// ---------------------------------------------------------------------------

export async function getExpenses(
  startDate: string,
  endDate: string
): Promise<
  Array<{
    id: string
    amount: string
    category: string
    description: string | null
    date: string
    receipt_url: string | null
    vendor_name: string | null
    created_by_name: string | null
    created_at: Date
  }>
> {
  const token = await getRlsToken()
  if (!token) return []

  const role = token["user_role"] as string | undefined
  if (!role || !["owner", "office"].includes(role)) return []

  try {
    return await withRls(token, async (db) => {
      const rows = await db
        .select({
          id: expenses.id,
          amount: expenses.amount,
          category: expenses.category,
          description: expenses.description,
          date: expenses.date,
          receipt_url: expenses.receipt_url,
          vendor_name: expenses.vendor_name,
          created_by: expenses.created_by,
          created_at: expenses.created_at,
        })
        .from(expenses)
        .where(and(between(expenses.date, startDate, endDate)))
        .orderBy(desc(expenses.date))

      const creatorIds = [...new Set(rows.filter((r) => r.created_by).map((r) => r.created_by!))]
      const creatorMap = new Map<string, string>()
      if (creatorIds.length > 0) {
        const profileRows = await db
          .select({ id: profiles.id, full_name: profiles.full_name })
          .from(profiles)
          .where(inArray(profiles.id, creatorIds))
        for (const p of profileRows) {
          creatorMap.set(p.id, p.full_name ?? "Unknown")
        }
      }

      return rows.map((r) => ({
        id: r.id,
        amount: r.amount,
        category: r.category,
        description: r.description,
        date: r.date,
        receipt_url: r.receipt_url,
        vendor_name: r.vendor_name,
        created_by_name: r.created_by ? (creatorMap.get(r.created_by) ?? null) : null,
        created_at: r.created_at,
      }))
    })
  } catch (err) {
    console.error("[getExpenses] Error:", err)
    return []
  }
}

// ---------------------------------------------------------------------------
// getExpensesByVendor
// ---------------------------------------------------------------------------

export async function getExpensesByVendor(
  vendorName: string
): Promise<
  Array<{
    id: string
    amount: string
    category: string
    description: string | null
    date: string
    receipt_url: string | null
    created_at: Date
  }>
> {
  const token = await getRlsToken()
  if (!token) return []

  const role = token["user_role"] as string | undefined
  if (!role || !["owner", "office"].includes(role)) return []

  try {
    return await withRls(token, async (db) => {
      return db
        .select({
          id: expenses.id,
          amount: expenses.amount,
          category: expenses.category,
          description: expenses.description,
          date: expenses.date,
          receipt_url: expenses.receipt_url,
          created_at: expenses.created_at,
        })
        .from(expenses)
        .where(eq(expenses.vendor_name, vendorName))
        .orderBy(desc(expenses.date))
    })
  } catch (err) {
    console.error("[getExpensesByVendor] Error:", err)
    return []
  }
}

// ---------------------------------------------------------------------------
// getExpenseSummary
// ---------------------------------------------------------------------------

export async function getExpenseSummary(
  startDate: string,
  endDate: string
): Promise<Array<{ category: string; total: string; count: number }>> {
  const token = await getRlsToken()
  if (!token) return []

  const role = token["user_role"] as string | undefined
  if (!role || !["owner", "office"].includes(role)) return []

  try {
    return await withRls(token, async (db) => {
      return db
        .select({
          category: expenses.category,
          total: sql<string>`COALESCE(SUM(${expenses.amount}::numeric), 0)::text`,
          count: sql<number>`COUNT(*)::int`,
        })
        .from(expenses)
        .where(between(expenses.date, startDate, endDate))
        .groupBy(expenses.category)
        .orderBy(sql`SUM(${expenses.amount}::numeric) DESC`)
    })
  } catch (err) {
    console.error("[getExpenseSummary] Error:", err)
    return []
  }
}

// ---------------------------------------------------------------------------
// deleteExpense
// ---------------------------------------------------------------------------

export async function deleteExpense(
  expenseId: string
): Promise<{ success: boolean; error?: string }> {
  const token = await getRlsToken()
  if (!token) return { success: false, error: "Not authenticated" }

  const role = token["user_role"] as string | undefined
  if (role !== "owner") {
    return { success: false, error: "Only the owner can delete expenses" }
  }

  try {
    await withRls(token, (db) =>
      db.delete(expenses).where(eq(expenses.id, expenseId))
    )

    revalidatePath("/reports")
    return { success: true }
  } catch (err) {
    console.error("[deleteExpense] Error:", err)
    return { success: false, error: "Failed to delete expense" }
  }
}

// ---------------------------------------------------------------------------
// getExpensesByCategory (backward compatibility alias)
// ---------------------------------------------------------------------------

export async function getExpensesByCategory(
  startDate: string,
  endDate: string
): Promise<Array<{ category: string; total: string; count: number }>> {
  return getExpenseSummary(startDate, endDate)
}
