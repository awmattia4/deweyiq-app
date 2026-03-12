"use server"

/**
 * expenses.ts -- Expense CRUD actions for P&L reporting.
 *
 * Phase 7: Billing & Payments -- Plan 07
 *
 * Manual expense entry for the P&L report. Bank reconciliation
 * requires Plaid integration (Phase 11 -- ACCT-06, ACCT-07).
 *
 * Uses withRls for all queries. Owner+office can create/view.
 * Owner only can delete.
 */

import { revalidatePath } from "next/cache"
import { createClient } from "@/lib/supabase/server"
import { withRls } from "@/lib/db"
import type { SupabaseToken } from "@/lib/db"
import { expenses, profiles } from "@/lib/db/schema"
import { EXPENSE_CATEGORIES, type ExpenseCategory } from "@/lib/db/schema/expenses"
import { and, between, desc, eq, sql } from "drizzle-orm"

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
// createExpense
// ---------------------------------------------------------------------------

export async function createExpense(data: {
  amount: string
  category: string
  description?: string
  date: string
  receiptUrl?: string
}): Promise<{ success: boolean; error?: string }> {
  const token = await getRlsToken()
  if (!token) return { success: false, error: "Not authenticated" }

  const role = token["user_role"] as string | undefined
  if (!role || !["owner", "office"].includes(role)) {
    return { success: false, error: "Unauthorized" }
  }

  // Validate amount
  const amount = parseFloat(data.amount)
  if (isNaN(amount) || amount <= 0) {
    return { success: false, error: "Amount must be a positive number" }
  }

  // Validate category
  if (!EXPENSE_CATEGORIES.includes(data.category as ExpenseCategory)) {
    return { success: false, error: "Invalid expense category" }
  }

  // Validate date
  if (!data.date || !/^\d{4}-\d{2}-\d{2}$/.test(data.date)) {
    return { success: false, error: "Invalid date format" }
  }

  const orgId = token["org_id"] as string
  const userId = token["sub"] as string

  try {
    await withRls(token, (db) =>
      db.insert(expenses).values({
        org_id: orgId,
        amount: amount.toFixed(2),
        category: data.category,
        description: data.description?.trim() || null,
        date: data.date,
        receipt_url: data.receiptUrl || null,
        created_by: userId,
      })
    )

    revalidatePath("/reports")
    return { success: true }
  } catch (err) {
    console.error("[createExpense] Error:", err)
    return { success: false, error: "Failed to create expense" }
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
          created_by: expenses.created_by,
          created_at: expenses.created_at,
        })
        .from(expenses)
        .where(
          and(
            between(expenses.date, startDate, endDate)
          )
        )
        .orderBy(desc(expenses.date))

      // Batch fetch creator names
      const creatorIds = [...new Set(rows.filter((r) => r.created_by).map((r) => r.created_by!))]
      const creatorMap = new Map<string, string>()
      if (creatorIds.length > 0) {
        const profileRows = await db
          .select({ id: profiles.id, full_name: profiles.full_name })
          .from(profiles)
          .where(sql`${profiles.id} IN ${creatorIds}`)
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
// getExpensesByCategory
// ---------------------------------------------------------------------------

export async function getExpensesByCategory(
  startDate: string,
  endDate: string
): Promise<Array<{ category: string; total: string; count: number }>> {
  const token = await getRlsToken()
  if (!token) return []

  const role = token["user_role"] as string | undefined
  if (!role || !["owner", "office"].includes(role)) return []

  try {
    return await withRls(token, async (db) => {
      const rows = await db
        .select({
          category: expenses.category,
          total: sql<string>`COALESCE(SUM(${expenses.amount}::numeric), 0)::text`,
          count: sql<number>`COUNT(*)::int`,
        })
        .from(expenses)
        .where(between(expenses.date, startDate, endDate))
        .groupBy(expenses.category)
        .orderBy(sql`SUM(${expenses.amount}::numeric) DESC`)

      return rows
    })
  } catch (err) {
    console.error("[getExpensesByCategory] Error:", err)
    return []
  }
}
