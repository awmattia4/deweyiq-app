"use server"

/**
 * reports.ts -- Report data queries and CSV export for the Reports page.
 *
 * Phase 7: Billing & Payments -- Plan 07
 *
 * Key reports:
 * - AR Aging: buckets unpaid invoices by days overdue (Current, 1-30, 31-60, 61-90, 90+)
 * - Revenue by Customer: paid invoices grouped by customer for any date range
 * - P&L Report: real revenue from invoices + real expenses from expenses table
 * - CSV Export: invoices, payments, AR aging snapshot, expenses
 *
 * Uses withRls for all queries. LEFT JOIN pattern per MEMORY.md (no correlated subqueries).
 */

import { createClient } from "@/lib/supabase/server"
import { withRls } from "@/lib/db"
import type { SupabaseToken } from "@/lib/db"
import { invoices, customers, paymentRecords, expenses } from "@/lib/db/schema"
import { and, eq, sql, between, isNull } from "drizzle-orm"

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
// Types
// ---------------------------------------------------------------------------

export interface ArAgingCustomer {
  id: string
  name: string
  current: number
  d1_30: number
  d31_60: number
  d61_90: number
  d90_plus: number
  total: number
}

export interface ArAgingResult {
  customers: ArAgingCustomer[]
  totals: {
    current: number
    d1_30: number
    d31_60: number
    d61_90: number
    d90_plus: number
    total: number
  }
}

export interface RevenueCustomer {
  id: string
  name: string
  totalRevenue: number
  invoiceCount: number
}

export interface RevenueResult {
  customers: RevenueCustomer[]
  grandTotal: number
}

export interface PnlResult {
  revenue: {
    total: number
    byModel: Array<{ model: string; total: number }>
    byMonth: Array<{ month: string; total: number }>
  }
  expenses: {
    total: number
    byCategory: Array<{ category: string; total: number }>
    byMonth: Array<{ month: string; total: number }>
  }
  netIncome: number
}

// ---------------------------------------------------------------------------
// getArAging
// ---------------------------------------------------------------------------

export async function getArAging(): Promise<ArAgingResult> {
  const token = await getRlsToken()
  if (!token) return { customers: [], totals: { current: 0, d1_30: 0, d31_60: 0, d61_90: 0, d90_plus: 0, total: 0 } }

  const role = token["user_role"] as string | undefined
  if (!role || !["owner", "office"].includes(role)) {
    return { customers: [], totals: { current: 0, d1_30: 0, d31_60: 0, d61_90: 0, d90_plus: 0, total: 0 } }
  }

  try {
    return await withRls(token, async (db) => {
      // Fetch all unpaid invoices with customer info using LEFT JOIN (not correlated subquery)
      const rows = await db
        .select({
          invoiceId: invoices.id,
          total: invoices.total,
          dueDate: invoices.due_date,
          customerId: invoices.customer_id,
          customerName: customers.full_name,
        })
        .from(invoices)
        .leftJoin(customers, eq(invoices.customer_id, customers.id))
        .where(
          and(
            sql`${invoices.status} IN ('sent', 'overdue')`,
            isNull(invoices.paid_at)
          )
        )

      // Group by customer and bucket by days overdue
      const customerMap = new Map<
        string,
        ArAgingCustomer
      >()

      for (const row of rows) {
        const customerId = row.customerId
        const customerName = row.customerName ?? "Unknown"
        const invoiceTotal = parseFloat(row.total ?? "0")

        if (!customerMap.has(customerId)) {
          customerMap.set(customerId, {
            id: customerId,
            name: customerName,
            current: 0,
            d1_30: 0,
            d31_60: 0,
            d61_90: 0,
            d90_plus: 0,
            total: 0,
          })
        }

        const entry = customerMap.get(customerId)!

        // Calculate days overdue from due_date
        let daysOverdue = 0
        if (row.dueDate) {
          const dueDate = new Date(row.dueDate + "T00:00:00")
          const now = new Date()
          now.setHours(0, 0, 0, 0)
          daysOverdue = Math.floor(
            (now.getTime() - dueDate.getTime()) / (1000 * 60 * 60 * 24)
          )
        }

        if (daysOverdue <= 0) {
          entry.current += invoiceTotal
        } else if (daysOverdue <= 30) {
          entry.d1_30 += invoiceTotal
        } else if (daysOverdue <= 60) {
          entry.d31_60 += invoiceTotal
        } else if (daysOverdue <= 90) {
          entry.d61_90 += invoiceTotal
        } else {
          entry.d90_plus += invoiceTotal
        }
        entry.total += invoiceTotal
      }

      const customerList = Array.from(customerMap.values()).sort(
        (a, b) => b.total - a.total
      )

      const totals = customerList.reduce(
        (acc, c) => ({
          current: acc.current + c.current,
          d1_30: acc.d1_30 + c.d1_30,
          d31_60: acc.d31_60 + c.d31_60,
          d61_90: acc.d61_90 + c.d61_90,
          d90_plus: acc.d90_plus + c.d90_plus,
          total: acc.total + c.total,
        }),
        { current: 0, d1_30: 0, d31_60: 0, d61_90: 0, d90_plus: 0, total: 0 }
      )

      return { customers: customerList, totals }
    })
  } catch (err) {
    console.error("[getArAging] Error:", err)
    return { customers: [], totals: { current: 0, d1_30: 0, d31_60: 0, d61_90: 0, d90_plus: 0, total: 0 } }
  }
}

// ---------------------------------------------------------------------------
// getRevenueByCustomer
// ---------------------------------------------------------------------------

export async function getRevenueByCustomer(
  startDate: string,
  endDate: string
): Promise<RevenueResult> {
  const token = await getRlsToken()
  if (!token) return { customers: [], grandTotal: 0 }

  const role = token["user_role"] as string | undefined
  if (!role || !["owner", "office"].includes(role)) {
    return { customers: [], grandTotal: 0 }
  }

  try {
    return await withRls(token, async (db) => {
      // We need paid invoices in date range -- use paid_at for the filter
      // LEFT JOIN pattern with customers table per MEMORY.md
      const rows = await db
        .select({
          customerId: invoices.customer_id,
          customerName: customers.full_name,
          totalRevenue: sql<string>`COALESCE(SUM(${invoices.total}::numeric), 0)::text`,
          invoiceCount: sql<number>`COUNT(*)::int`,
        })
        .from(invoices)
        .leftJoin(customers, eq(invoices.customer_id, customers.id))
        .where(
          and(
            eq(invoices.status, "paid"),
            sql`${invoices.paid_at} >= ${startDate}::timestamptz`,
            sql`${invoices.paid_at} < (${endDate}::date + interval '1 day')::timestamptz`
          )
        )
        .groupBy(invoices.customer_id, customers.full_name)
        .orderBy(sql`SUM(${invoices.total}::numeric) DESC`)

      const customerList: RevenueCustomer[] = rows.map((r) => ({
        id: r.customerId,
        name: r.customerName ?? "Unknown",
        totalRevenue: parseFloat(r.totalRevenue),
        invoiceCount: r.invoiceCount,
      }))

      const grandTotal = customerList.reduce((acc, c) => acc + c.totalRevenue, 0)

      return { customers: customerList, grandTotal }
    })
  } catch (err) {
    console.error("[getRevenueByCustomer] Error:", err)
    return { customers: [], grandTotal: 0 }
  }
}

// ---------------------------------------------------------------------------
// getPnlReport
// ---------------------------------------------------------------------------

export async function getPnlReport(
  startDate: string,
  endDate: string
): Promise<PnlResult> {
  const token = await getRlsToken()
  if (!token) return { revenue: { total: 0, byModel: [], byMonth: [] }, expenses: { total: 0, byCategory: [], byMonth: [] }, netIncome: 0 }

  const role = token["user_role"] as string | undefined
  if (!role || !["owner", "office"].includes(role)) {
    return { revenue: { total: 0, byModel: [], byMonth: [] }, expenses: { total: 0, byCategory: [], byMonth: [] }, netIncome: 0 }
  }

  try {
    return await withRls(token, async (db) => {
      // Revenue: paid invoices in date range
      const [revenueTotal] = await db
        .select({
          total: sql<string>`COALESCE(SUM(${invoices.total}::numeric), 0)::text`,
        })
        .from(invoices)
        .where(
          and(
            eq(invoices.status, "paid"),
            sql`${invoices.paid_at} >= ${startDate}::timestamptz`,
            sql`${invoices.paid_at} < (${endDate}::date + interval '1 day')::timestamptz`
          )
        )

      // Revenue by billing model
      const revenueByModel = await db
        .select({
          model: sql<string>`COALESCE(${invoices.billing_model}, 'custom')`,
          total: sql<string>`COALESCE(SUM(${invoices.total}::numeric), 0)::text`,
        })
        .from(invoices)
        .where(
          and(
            eq(invoices.status, "paid"),
            sql`${invoices.paid_at} >= ${startDate}::timestamptz`,
            sql`${invoices.paid_at} < (${endDate}::date + interval '1 day')::timestamptz`
          )
        )
        .groupBy(sql`COALESCE(${invoices.billing_model}, 'custom')`)
        .orderBy(sql`SUM(${invoices.total}::numeric) DESC`)

      // Revenue by month
      const revenueByMonth = await db
        .select({
          month: sql<string>`TO_CHAR(${invoices.paid_at}, 'YYYY-MM')`,
          total: sql<string>`COALESCE(SUM(${invoices.total}::numeric), 0)::text`,
        })
        .from(invoices)
        .where(
          and(
            eq(invoices.status, "paid"),
            sql`${invoices.paid_at} >= ${startDate}::timestamptz`,
            sql`${invoices.paid_at} < (${endDate}::date + interval '1 day')::timestamptz`
          )
        )
        .groupBy(sql`TO_CHAR(${invoices.paid_at}, 'YYYY-MM')`)
        .orderBy(sql`TO_CHAR(${invoices.paid_at}, 'YYYY-MM')`)

      // Expenses: from expenses table in date range
      const [expenseTotal] = await db
        .select({
          total: sql<string>`COALESCE(SUM(${expenses.amount}::numeric), 0)::text`,
        })
        .from(expenses)
        .where(between(expenses.date, startDate, endDate))

      // Expenses by category
      const expensesByCategory = await db
        .select({
          category: expenses.category,
          total: sql<string>`COALESCE(SUM(${expenses.amount}::numeric), 0)::text`,
        })
        .from(expenses)
        .where(between(expenses.date, startDate, endDate))
        .groupBy(expenses.category)
        .orderBy(sql`SUM(${expenses.amount}::numeric) DESC`)

      // Expenses by month
      const expensesByMonth = await db
        .select({
          month: sql<string>`TO_CHAR(${expenses.date}::date, 'YYYY-MM')`,
          total: sql<string>`COALESCE(SUM(${expenses.amount}::numeric), 0)::text`,
        })
        .from(expenses)
        .where(between(expenses.date, startDate, endDate))
        .groupBy(sql`TO_CHAR(${expenses.date}::date, 'YYYY-MM')`)
        .orderBy(sql`TO_CHAR(${expenses.date}::date, 'YYYY-MM')`)

      const revTotal = parseFloat(revenueTotal?.total ?? "0")
      const expTotal = parseFloat(expenseTotal?.total ?? "0")

      return {
        revenue: {
          total: revTotal,
          byModel: revenueByModel.map((r) => ({
            model: r.model,
            total: parseFloat(r.total),
          })),
          byMonth: revenueByMonth.map((r) => ({
            month: r.month,
            total: parseFloat(r.total),
          })),
        },
        expenses: {
          total: expTotal,
          byCategory: expensesByCategory.map((r) => ({
            category: r.category,
            total: parseFloat(r.total),
          })),
          byMonth: expensesByMonth.map((r) => ({
            month: r.month,
            total: parseFloat(r.total),
          })),
        },
        netIncome: revTotal - expTotal,
      }
    })
  } catch (err) {
    console.error("[getPnlReport] Error:", err)
    return { revenue: { total: 0, byModel: [], byMonth: [] }, expenses: { total: 0, byCategory: [], byMonth: [] }, netIncome: 0 }
  }
}

// ---------------------------------------------------------------------------
// exportFinancialCsv
// ---------------------------------------------------------------------------

export async function exportFinancialCsv(
  type: "invoices" | "payments" | "ar_aging" | "expenses",
  startDate?: string,
  endDate?: string
): Promise<{ success: boolean; csv?: string; error?: string }> {
  const token = await getRlsToken()
  if (!token) return { success: false, error: "Not authenticated" }

  const role = token["user_role"] as string | undefined
  if (role !== "owner") {
    return { success: false, error: "Only the owner can export financial data" }
  }

  try {
    const csv = await withRls(token, async (db) => {
      switch (type) {
        case "invoices": {
          const rows = await db
            .select({
              invoice_number: invoices.invoice_number,
              customer_name: customers.full_name,
              issued_at: invoices.issued_at,
              due_date: invoices.due_date,
              total: invoices.total,
              tax: invoices.tax_amount,
              status: invoices.status,
              paid_at: invoices.paid_at,
              payment_method: invoices.payment_method,
              billing_model: invoices.billing_model,
              billing_period_start: invoices.billing_period_start,
              billing_period_end: invoices.billing_period_end,
            })
            .from(invoices)
            .leftJoin(customers, eq(invoices.customer_id, customers.id))
            .where(
              startDate && endDate
                ? and(
                    sql`${invoices.created_at} >= ${startDate}::timestamptz`,
                    sql`${invoices.created_at} < (${endDate}::date + interval '1 day')::timestamptz`
                  )
                : sql`TRUE`
            )
            .orderBy(invoices.created_at)

          const headers = [
            "Invoice Number",
            "Customer",
            "Issued Date",
            "Due Date",
            "Total",
            "Tax",
            "Status",
            "Paid Date",
            "Payment Method",
            "Billing Model",
            "Period Start",
            "Period End",
          ]

          const csvRows = rows.map((r) => [
            r.invoice_number ?? "",
            csvEscape(r.customer_name ?? ""),
            r.issued_at ? new Date(r.issued_at).toLocaleDateString() : "",
            r.due_date ?? "",
            r.total,
            r.tax,
            r.status,
            r.paid_at ? new Date(r.paid_at).toLocaleDateString() : "",
            r.payment_method ?? "",
            r.billing_model ?? "",
            r.billing_period_start ?? "",
            r.billing_period_end ?? "",
          ])

          return [headers.join(","), ...csvRows.map((r) => r.join(","))].join("\n")
        }

        case "payments": {
          const rows = await db
            .select({
              invoice_number: invoices.invoice_number,
              customer_name: customers.full_name,
              amount: paymentRecords.amount,
              method: paymentRecords.method,
              settled_at: paymentRecords.settled_at,
              stripe_pi: paymentRecords.stripe_payment_intent_id,
            })
            .from(paymentRecords)
            .leftJoin(invoices, eq(paymentRecords.invoice_id, invoices.id))
            .leftJoin(customers, eq(invoices.customer_id, customers.id))
            .where(
              startDate && endDate
                ? and(
                    eq(paymentRecords.status, "settled"),
                    sql`${paymentRecords.settled_at} >= ${startDate}::timestamptz`,
                    sql`${paymentRecords.settled_at} < (${endDate}::date + interval '1 day')::timestamptz`
                  )
                : eq(paymentRecords.status, "settled")
            )
            .orderBy(paymentRecords.settled_at)

          const headers = [
            "Invoice Number",
            "Customer",
            "Amount",
            "Method",
            "Settled Date",
            "Stripe Payment Intent ID",
          ]

          const csvRows = rows.map((r) => [
            r.invoice_number ?? "",
            csvEscape(r.customer_name ?? ""),
            r.amount,
            r.method,
            r.settled_at ? new Date(r.settled_at).toLocaleDateString() : "",
            r.stripe_pi ?? "",
          ])

          return [headers.join(","), ...csvRows.map((r) => r.join(","))].join("\n")
        }

        case "ar_aging": {
          // AR aging snapshot with per-invoice detail
          const rows = await db
            .select({
              customer_name: customers.full_name,
              invoice_number: invoices.invoice_number,
              total: invoices.total,
              due_date: invoices.due_date,
            })
            .from(invoices)
            .leftJoin(customers, eq(invoices.customer_id, customers.id))
            .where(
              and(
                sql`${invoices.status} IN ('sent', 'overdue')`,
                isNull(invoices.paid_at)
              )
            )
            .orderBy(invoices.due_date)

          const headers = [
            "Customer",
            "Invoice Number",
            "Total",
            "Due Date",
            "Days Overdue",
            "Aging Bucket",
          ]

          const now = new Date()
          now.setHours(0, 0, 0, 0)

          const csvRows = rows.map((r) => {
            let daysOverdue = 0
            let bucket = "Current"
            if (r.due_date) {
              const dueDate = new Date(r.due_date + "T00:00:00")
              daysOverdue = Math.max(
                0,
                Math.floor((now.getTime() - dueDate.getTime()) / (1000 * 60 * 60 * 24))
              )
              if (daysOverdue === 0) bucket = "Current"
              else if (daysOverdue <= 30) bucket = "1-30 days"
              else if (daysOverdue <= 60) bucket = "31-60 days"
              else if (daysOverdue <= 90) bucket = "61-90 days"
              else bucket = "90+ days"
            }

            return [
              csvEscape(r.customer_name ?? ""),
              r.invoice_number ?? "",
              r.total,
              r.due_date ?? "",
              String(daysOverdue),
              bucket,
            ]
          })

          return [headers.join(","), ...csvRows.map((r) => r.join(","))].join("\n")
        }

        case "expenses": {
          const rows = await db
            .select({
              date: expenses.date,
              category: expenses.category,
              amount: expenses.amount,
              description: expenses.description,
              created_by: expenses.created_by,
            })
            .from(expenses)
            .where(
              startDate && endDate
                ? between(expenses.date, startDate, endDate)
                : sql`TRUE`
            )
            .orderBy(expenses.date)

          const headers = ["Date", "Category", "Amount", "Description"]

          const csvRows = rows.map((r) => [
            r.date,
            r.category,
            r.amount,
            csvEscape(r.description ?? ""),
          ])

          return [headers.join(","), ...csvRows.map((r) => r.join(","))].join("\n")
        }

        default:
          return ""
      }
    })

    return { success: true, csv }
  } catch (err) {
    console.error("[exportFinancialCsv] Error:", err)
    return { success: false, error: "Failed to export data" }
  }
}

// ---------------------------------------------------------------------------
// CSV helpers
// ---------------------------------------------------------------------------

function csvEscape(value: string): string {
  if (value.includes(",") || value.includes('"') || value.includes("\n")) {
    return `"${value.replace(/"/g, '""')}"`
  }
  return value
}
