"use server"

/**
 * reporting.ts -- Phase 9 reporting server actions.
 *
 * Phase 9: Reporting & Team Analytics
 *
 * This file is extended by Plans 02-05 sequentially:
 *   - Plan 02 (this plan): Revenue Dashboard — getRevenueDashboard, getCustomerRevenueDetail, exportRevenueCsv
 *   - Plan 03: Operations Dashboard — getOperationsDashboard
 *   - Plan 04: Team Dashboard — getTeamDashboard
 *   - Plan 05: Profitability Dashboard — getProfitabilityDashboard
 *
 * Uses withRls for all queries. LEFT JOIN pattern per MEMORY.md (no correlated subqueries).
 * CHART_COLORS are hex-only — no oklch (SVG/WebGL cannot parse oklch).
 */

import { createClient } from "@/lib/supabase/server"
import { withRls } from "@/lib/db"
import type { SupabaseToken } from "@/lib/db"
import { invoices, customers, profiles } from "@/lib/db/schema"
import { and, eq, sql, isNull } from "drizzle-orm"

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
// Types — Revenue Dashboard
// ---------------------------------------------------------------------------

export interface RevenueDashboardData {
  totalRevenue: number
  previousPeriodRevenue: number
  invoiceCount: number
  avgInvoiceValue: number
  outstandingAR: number
  revenueByMonth: Array<{ month: string; revenue: number }>
  revenueByCustomer: Array<{
    customerId: string
    customerName: string
    totalRevenue: number
    invoiceCount: number
    lastPaymentDate: string | null
  }>
  revenueByTech: Array<{
    techId: string
    techName: string
    totalRevenue: number
    customerCount: number
  }>
}

export interface CustomerRevenueDetail {
  customerName: string
  invoices: Array<{
    id: string
    invoiceNumber: string | null
    total: number
    paidAt: string | null
    billingModel: string | null
    status: string
  }>
  totalRevenue: number
  billingModelBreakdown: Array<{ model: string; total: number }>
}

// ---------------------------------------------------------------------------
// getRevenueDashboard
// ---------------------------------------------------------------------------

export async function getRevenueDashboard(
  startDate: string,
  endDate: string
): Promise<RevenueDashboardData> {
  const empty: RevenueDashboardData = {
    totalRevenue: 0,
    previousPeriodRevenue: 0,
    invoiceCount: 0,
    avgInvoiceValue: 0,
    outstandingAR: 0,
    revenueByMonth: [],
    revenueByCustomer: [],
    revenueByTech: [],
  }

  const token = await getRlsToken()
  if (!token) return empty

  const role = token["user_role"] as string | undefined
  if (!role || !["owner", "office"].includes(role)) return empty

  try {
    return await withRls(token, async (db) => {
      // ------------------------------------------------------------------
      // a. Total revenue + count + average for the date range
      // ------------------------------------------------------------------
      const [totalsRow] = await db
        .select({
          totalRevenue: sql<string>`COALESCE(SUM(${invoices.total}::numeric), 0)::text`,
          invoiceCount: sql<number>`COUNT(*)::int`,
        })
        .from(invoices)
        .where(
          and(
            eq(invoices.status, "paid"),
            sql`${invoices.paid_at} >= ${startDate}::timestamptz`,
            sql`${invoices.paid_at} < (${endDate}::date + interval '1 day')::timestamptz`
          )
        )

      const totalRevenue = parseFloat(totalsRow?.totalRevenue ?? "0")
      const invoiceCount = totalsRow?.invoiceCount ?? 0
      const avgInvoiceValue = invoiceCount > 0 ? totalRevenue / invoiceCount : 0

      // ------------------------------------------------------------------
      // Previous period for trend comparison
      // Calculate the same-length period immediately preceding startDate
      // ------------------------------------------------------------------
      const periodDays = Math.max(
        1,
        Math.ceil(
          (new Date(endDate).getTime() - new Date(startDate).getTime()) /
            (1000 * 60 * 60 * 24)
        ) + 1
      )
      const prevEndDate = new Date(startDate)
      prevEndDate.setDate(prevEndDate.getDate() - 1)
      const prevStartDate = new Date(prevEndDate)
      prevStartDate.setDate(prevStartDate.getDate() - periodDays + 1)

      const prevStartStr = prevStartDate.toISOString().split("T")[0]
      const prevEndStr = prevEndDate.toISOString().split("T")[0]

      const [prevTotalsRow] = await db
        .select({
          totalRevenue: sql<string>`COALESCE(SUM(${invoices.total}::numeric), 0)::text`,
        })
        .from(invoices)
        .where(
          and(
            eq(invoices.status, "paid"),
            sql`${invoices.paid_at} >= ${prevStartStr}::timestamptz`,
            sql`${invoices.paid_at} < (${prevEndStr}::date + interval '1 day')::timestamptz`
          )
        )

      const previousPeriodRevenue = parseFloat(prevTotalsRow?.totalRevenue ?? "0")

      // ------------------------------------------------------------------
      // b. Outstanding AR — unpaid sent invoices (current snapshot, no date filter)
      // ------------------------------------------------------------------
      const [arRow] = await db
        .select({
          outstandingAR: sql<string>`COALESCE(SUM(${invoices.total}::numeric), 0)::text`,
        })
        .from(invoices)
        .where(
          and(
            sql`${invoices.status} IN ('sent', 'overdue')`,
            isNull(invoices.paid_at)
          )
        )

      const outstandingAR = parseFloat(arRow?.outstandingAR ?? "0")

      // ------------------------------------------------------------------
      // c. Revenue by month — for AreaChart
      // ------------------------------------------------------------------
      const monthRows = await db
        .select({
          month: sql<string>`TO_CHAR(${invoices.paid_at}, 'YYYY-MM')`,
          revenue: sql<string>`COALESCE(SUM(${invoices.total}::numeric), 0)::text`,
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

      const revenueByMonth = monthRows.map((r) => ({
        month: r.month,
        revenue: parseFloat(r.revenue),
      }))

      // ------------------------------------------------------------------
      // d. Revenue by customer — LEFT JOIN invoices → customers, GROUP BY customer_id
      // ------------------------------------------------------------------
      const customerRows = await db
        .select({
          customerId: invoices.customer_id,
          customerName: customers.full_name,
          totalRevenue: sql<string>`COALESCE(SUM(${invoices.total}::numeric), 0)::text`,
          invoiceCount: sql<number>`COUNT(*)::int`,
          lastPaymentDate: sql<string | null>`MAX(${invoices.paid_at})::text`,
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

      const revenueByCustomer = customerRows.map((r) => ({
        customerId: r.customerId,
        customerName: r.customerName ?? "Unknown",
        totalRevenue: parseFloat(r.totalRevenue),
        invoiceCount: r.invoiceCount,
        lastPaymentDate: r.lastPaymentDate
          ? new Date(r.lastPaymentDate).toLocaleDateString()
          : null,
      }))

      // ------------------------------------------------------------------
      // e. Revenue by tech — LEFT JOIN invoices → customers (on customer_id),
      //    then LEFT JOIN customers → profiles (on assigned_tech_id).
      //    Revenue attribution is based on CURRENT tech assignment.
      //    LEFT JOIN + GROUP BY pattern per MEMORY.md (no correlated subqueries).
      // ------------------------------------------------------------------
      const techRows = await db
        .select({
          techId: customers.assigned_tech_id,
          techName: profiles.full_name,
          totalRevenue: sql<string>`COALESCE(SUM(${invoices.total}::numeric), 0)::text`,
          customerCount: sql<number>`COUNT(DISTINCT ${invoices.customer_id})::int`,
        })
        .from(invoices)
        .leftJoin(customers, eq(invoices.customer_id, customers.id))
        .leftJoin(profiles, eq(customers.assigned_tech_id, profiles.id))
        .where(
          and(
            eq(invoices.status, "paid"),
            sql`${invoices.paid_at} >= ${startDate}::timestamptz`,
            sql`${invoices.paid_at} < (${endDate}::date + interval '1 day')::timestamptz`
          )
        )
        .groupBy(customers.assigned_tech_id, profiles.full_name)
        .orderBy(sql`SUM(${invoices.total}::numeric) DESC`)

      const revenueByTech = techRows
        .filter((r) => r.techId !== null)
        .map((r) => ({
          techId: r.techId!,
          techName: r.techName ?? "Unknown",
          totalRevenue: parseFloat(r.totalRevenue),
          customerCount: r.customerCount,
        }))

      return {
        totalRevenue,
        previousPeriodRevenue,
        invoiceCount,
        avgInvoiceValue,
        outstandingAR,
        revenueByMonth,
        revenueByCustomer,
        revenueByTech,
      }
    })
  } catch (err) {
    console.error("[getRevenueDashboard] Error:", err)
    return empty
  }
}

// ---------------------------------------------------------------------------
// getCustomerRevenueDetail — for drill-down drawer
// ---------------------------------------------------------------------------

export async function getCustomerRevenueDetail(
  customerId: string,
  startDate: string,
  endDate: string
): Promise<CustomerRevenueDetail> {
  const empty: CustomerRevenueDetail = {
    customerName: "",
    invoices: [],
    totalRevenue: 0,
    billingModelBreakdown: [],
  }

  const token = await getRlsToken()
  if (!token) return empty

  const role = token["user_role"] as string | undefined
  if (!role || !["owner", "office"].includes(role)) return empty

  try {
    return await withRls(token, async (db) => {
      // Get customer name — separate query to avoid correlated subquery pitfall
      const [customerRow] = await db
        .select({ fullName: customers.full_name })
        .from(customers)
        .where(eq(customers.id, customerId))

      const customerName = customerRow?.fullName ?? "Unknown"

      // Get paid invoices for this customer in date range
      const invoiceRows = await db
        .select({
          id: invoices.id,
          invoiceNumber: invoices.invoice_number,
          total: invoices.total,
          paidAt: sql<string | null>`${invoices.paid_at}::text`,
          billingModel: invoices.billing_model,
          status: invoices.status,
        })
        .from(invoices)
        .where(
          and(
            eq(invoices.customer_id, customerId),
            eq(invoices.status, "paid"),
            sql`${invoices.paid_at} >= ${startDate}::timestamptz`,
            sql`${invoices.paid_at} < (${endDate}::date + interval '1 day')::timestamptz`
          )
        )
        .orderBy(sql`${invoices.paid_at} DESC`)

      const totalRevenue = invoiceRows.reduce(
        (sum, r) => sum + parseFloat(r.total ?? "0"),
        0
      )

      // Billing model breakdown — GROUP BY billing_model
      const modelRows = await db
        .select({
          model: sql<string>`COALESCE(${invoices.billing_model}, 'custom')`,
          total: sql<string>`COALESCE(SUM(${invoices.total}::numeric), 0)::text`,
        })
        .from(invoices)
        .where(
          and(
            eq(invoices.customer_id, customerId),
            eq(invoices.status, "paid"),
            sql`${invoices.paid_at} >= ${startDate}::timestamptz`,
            sql`${invoices.paid_at} < (${endDate}::date + interval '1 day')::timestamptz`
          )
        )
        .groupBy(sql`COALESCE(${invoices.billing_model}, 'custom')`)
        .orderBy(sql`SUM(${invoices.total}::numeric) DESC`)

      return {
        customerName,
        invoices: invoiceRows.map((r) => ({
          id: r.id,
          invoiceNumber: r.invoiceNumber,
          total: parseFloat(r.total ?? "0"),
          paidAt: r.paidAt ? new Date(r.paidAt).toLocaleDateString() : null,
          billingModel: r.billingModel,
          status: r.status,
        })),
        totalRevenue,
        billingModelBreakdown: modelRows.map((r) => ({
          model: r.model,
          total: parseFloat(r.total),
        })),
      }
    })
  } catch (err) {
    console.error("[getCustomerRevenueDetail] Error:", err)
    return empty
  }
}

// ---------------------------------------------------------------------------
// exportRevenueCsv — owner-only CSV export
// ---------------------------------------------------------------------------

export async function exportRevenueCsv(
  startDate: string,
  endDate: string
): Promise<{ success: boolean; csv?: string; error?: string }> {
  const token = await getRlsToken()
  if (!token) return { success: false, error: "Not authenticated" }

  const role = token["user_role"] as string | undefined
  if (role !== "owner") {
    return { success: false, error: "Only the owner can export revenue data" }
  }

  try {
    const csv = await withRls(token, async (db) => {
      // Revenue by customer with assigned tech name
      // LEFT JOIN pattern — no correlated subqueries per MEMORY.md
      const rows = await db
        .select({
          customerName: customers.full_name,
          totalRevenue: sql<string>`COALESCE(SUM(${invoices.total}::numeric), 0)::text`,
          invoiceCount: sql<number>`COUNT(${invoices.id})::int`,
          lastPayment: sql<string | null>`MAX(${invoices.paid_at})::text`,
          techName: profiles.full_name,
        })
        .from(invoices)
        .leftJoin(customers, eq(invoices.customer_id, customers.id))
        .leftJoin(profiles, eq(customers.assigned_tech_id, profiles.id))
        .where(
          and(
            eq(invoices.status, "paid"),
            sql`${invoices.paid_at} >= ${startDate}::timestamptz`,
            sql`${invoices.paid_at} < (${endDate}::date + interval '1 day')::timestamptz`
          )
        )
        .groupBy(
          invoices.customer_id,
          customers.full_name,
          profiles.full_name
        )
        .orderBy(sql`SUM(${invoices.total}::numeric) DESC`)

      const headers = [
        "Customer",
        "Total Revenue",
        "Invoice Count",
        "Last Payment",
        "Assigned Tech",
      ]

      const csvRows = rows.map((r) => [
        csvEscape(r.customerName ?? ""),
        parseFloat(r.totalRevenue).toFixed(2),
        String(r.invoiceCount),
        r.lastPayment ? new Date(r.lastPayment).toLocaleDateString() : "",
        csvEscape(r.techName ?? "Unassigned"),
      ])

      return [headers.join(","), ...csvRows.map((r) => r.join(","))].join("\n")
    })

    return { success: true, csv }
  } catch (err) {
    console.error("[exportRevenueCsv] Error:", err)
    return { success: false, error: "Failed to export revenue data" }
  }
}

// ---------------------------------------------------------------------------
// CSV helper
// ---------------------------------------------------------------------------

function csvEscape(value: string): string {
  if (value.includes(",") || value.includes('"') || value.includes("\n")) {
    return `"${value.replace(/"/g, '""')}"`
  }
  return value
}
