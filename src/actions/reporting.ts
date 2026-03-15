"use server"

/**
 * reporting.ts -- Phase 9 reporting server actions.
 *
 * Phase 9: Reporting & Team Analytics
 *
 * This file is extended by Plans 02-05 sequentially:
 *   - Plan 02: Revenue Dashboard — getRevenueDashboard, getCustomerRevenueDetail, exportRevenueCsv
 *   - Plan 03: Operations Dashboard — getOperationsMetrics, exportOperationsCsv
 *   - Plan 04: Team Dashboard — getTeamDashboard
 *   - Plan 05: Profitability Dashboard — getProfitabilityDashboard
 *
 * Uses withRls for all queries. LEFT JOIN pattern per MEMORY.md (no correlated subqueries).
 * CHART_COLORS are hex-only — no oklch (SVG/WebGL cannot parse oklch).
 */

import { createClient } from "@/lib/supabase/server"
import { withRls } from "@/lib/db"
import type { SupabaseToken } from "@/lib/db"
import { invoices, customers, profiles, routeStops } from "@/lib/db/schema"
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
// Types — Operations Dashboard (Plan 03)
// ---------------------------------------------------------------------------

export interface TechOperationsMetric {
  techId: string
  techName: string
  totalStops: number
  completedStops: number
  skippedStops: number
  missedStops: number
  completionRate: number
  onTimeRate: number
}

export interface DailyCompletionPoint {
  date: string  // YYYY-MM-DD
  completed: number
  skipped: number
  missed: number
}

export interface OperationsMetricsData {
  // Company-wide summary
  totalStops: number
  completedStops: number
  skippedStops: number
  missedStops: number
  completionRate: number
  previousCompletionRate: number
  onTimeRate: number
  previousOnTimeRate: number
  // Per-tech breakdown
  techMetrics: TechOperationsMetric[]
  // Daily completion data for stacked bar chart
  dailyCompletion: DailyCompletionPoint[]
}

// ---------------------------------------------------------------------------
// getOperationsMetrics — Plan 03
// ---------------------------------------------------------------------------

export async function getOperationsMetrics(
  startDate: string,
  endDate: string
): Promise<OperationsMetricsData> {
  const empty: OperationsMetricsData = {
    totalStops: 0,
    completedStops: 0,
    skippedStops: 0,
    missedStops: 0,
    completionRate: 0,
    previousCompletionRate: 0,
    onTimeRate: 0,
    previousOnTimeRate: 0,
    techMetrics: [],
    dailyCompletion: [],
  }

  const token = await getRlsToken()
  if (!token) return empty

  const role = token["user_role"] as string | undefined
  if (!role || !["owner", "office"].includes(role)) return empty

  try {
    return await withRls(token, async (db) => {
      // Today's date in YYYY-MM-DD (local) — only count stops where date has passed
      const today = new Date()
      const todayStr = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, "0")}-${String(today.getDate()).padStart(2, "0")}`

      // ------------------------------------------------------------------
      // a. Per-tech metrics — LEFT JOIN route_stops → profiles
      //    Only count past stops (scheduled_date < today).
      //    Exclude holiday status from all counts.
      //    On-time = status='complete' AND updated_at::date = scheduled_date
      //    (route_stops has no completed_at column — updated_at is the proxy)
      // ------------------------------------------------------------------
      const techRows = await db
        .select({
          techId: routeStops.tech_id,
          techName: profiles.full_name,
          totalStops: sql<number>`COUNT(*) FILTER (WHERE ${routeStops.status} != 'holiday')::int`,
          completedStops: sql<number>`COUNT(*) FILTER (WHERE ${routeStops.status} = 'complete')::int`,
          skippedStops: sql<number>`COUNT(*) FILTER (WHERE ${routeStops.status} = 'skipped')::int`,
          missedStops: sql<number>`COUNT(*) FILTER (
            WHERE ${routeStops.status} NOT IN ('complete', 'skipped', 'holiday')
          )::int`,
          onTimeStops: sql<number>`COUNT(*) FILTER (
            WHERE ${routeStops.status} = 'complete'
            AND (${routeStops.updated_at})::date = (${routeStops.scheduled_date})::date
          )::int`,
        })
        .from(routeStops)
        .leftJoin(profiles, eq(routeStops.tech_id, profiles.id))
        .where(
          and(
            sql`${routeStops.scheduled_date} >= ${startDate}`,
            sql`${routeStops.scheduled_date} <= ${endDate}`,
            sql`${routeStops.scheduled_date} < ${todayStr}`
          )
        )
        .groupBy(routeStops.tech_id, profiles.full_name)
        .orderBy(sql`COUNT(*) FILTER (WHERE ${routeStops.status} = 'complete') DESC`)

      const techMetrics: TechOperationsMetric[] = techRows
        .filter((r) => r.techId !== null)
        .map((r) => {
          const total = r.totalStops ?? 0
          const completed = r.completedStops ?? 0
          const onTime = r.onTimeStops ?? 0
          const completionRate = total > 0 ? (completed / total) * 100 : 0
          const onTimeRate = completed > 0 ? (onTime / completed) * 100 : 0
          return {
            techId: r.techId!,
            techName: r.techName ?? "Unknown",
            totalStops: total,
            completedStops: completed,
            skippedStops: r.skippedStops ?? 0,
            missedStops: r.missedStops ?? 0,
            completionRate,
            onTimeRate,
          }
        })
        .sort((a, b) => b.completionRate - a.completionRate)

      // ------------------------------------------------------------------
      // b. Company-wide totals — aggregate from techMetrics
      // ------------------------------------------------------------------
      const totalStops = techMetrics.reduce((s, t) => s + t.totalStops, 0)
      const completedStops = techMetrics.reduce((s, t) => s + t.completedStops, 0)
      const skippedStops = techMetrics.reduce((s, t) => s + t.skippedStops, 0)
      const missedStops = techMetrics.reduce((s, t) => s + t.missedStops, 0)
      const completionRate = totalStops > 0 ? (completedStops / totalStops) * 100 : 0

      // Company-wide on-time: sum completed-on-time across all techs, divide by total completed
      const totalOnTimeStops = techRows
        .filter((r) => r.techId !== null)
        .reduce((s, r) => s + (r.onTimeStops ?? 0), 0)
      const onTimeRate = completedStops > 0 ? (totalOnTimeStops / completedStops) * 100 : 0

      // ------------------------------------------------------------------
      // c. Previous period — same-length window before startDate
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

      const prevStartStr = `${prevStartDate.getFullYear()}-${String(prevStartDate.getMonth() + 1).padStart(2, "0")}-${String(prevStartDate.getDate()).padStart(2, "0")}`
      const prevEndStr = `${prevEndDate.getFullYear()}-${String(prevEndDate.getMonth() + 1).padStart(2, "0")}-${String(prevEndDate.getDate()).padStart(2, "0")}`

      const [prevTotalsRow] = await db
        .select({
          totalStops: sql<number>`COUNT(*) FILTER (WHERE ${routeStops.status} != 'holiday')::int`,
          completedStops: sql<number>`COUNT(*) FILTER (WHERE ${routeStops.status} = 'complete')::int`,
          onTimeStops: sql<number>`COUNT(*) FILTER (
            WHERE ${routeStops.status} = 'complete'
            AND (${routeStops.updated_at})::date = (${routeStops.scheduled_date})::date
          )::int`,
        })
        .from(routeStops)
        .where(
          and(
            sql`${routeStops.scheduled_date} >= ${prevStartStr}`,
            sql`${routeStops.scheduled_date} <= ${prevEndStr}`,
            sql`${routeStops.scheduled_date} < ${todayStr}`
          )
        )

      const prevTotal = prevTotalsRow?.totalStops ?? 0
      const prevCompleted = prevTotalsRow?.completedStops ?? 0
      const prevOnTime = prevTotalsRow?.onTimeStops ?? 0
      const previousCompletionRate = prevTotal > 0 ? (prevCompleted / prevTotal) * 100 : 0
      const previousOnTimeRate = prevCompleted > 0 ? (prevOnTime / prevCompleted) * 100 : 0

      // ------------------------------------------------------------------
      // d. Daily completion data — for stacked bar chart
      //    Group by scheduled_date, COUNT FILTER per status
      //    Only past dates (scheduled_date < today)
      // ------------------------------------------------------------------
      const dailyRows = await db
        .select({
          date: routeStops.scheduled_date,
          completed: sql<number>`COUNT(*) FILTER (WHERE ${routeStops.status} = 'complete')::int`,
          skipped: sql<number>`COUNT(*) FILTER (WHERE ${routeStops.status} = 'skipped')::int`,
          missed: sql<number>`COUNT(*) FILTER (
            WHERE ${routeStops.status} NOT IN ('complete', 'skipped', 'holiday')
          )::int`,
        })
        .from(routeStops)
        .where(
          and(
            sql`${routeStops.scheduled_date} >= ${startDate}`,
            sql`${routeStops.scheduled_date} <= ${endDate}`,
            sql`${routeStops.scheduled_date} < ${todayStr}`
          )
        )
        .groupBy(routeStops.scheduled_date)
        .orderBy(routeStops.scheduled_date)

      const dailyCompletion: DailyCompletionPoint[] = dailyRows.map((r) => ({
        date: r.date,
        completed: r.completed ?? 0,
        skipped: r.skipped ?? 0,
        missed: r.missed ?? 0,
      }))

      return {
        totalStops,
        completedStops,
        skippedStops,
        missedStops,
        completionRate,
        previousCompletionRate,
        onTimeRate,
        previousOnTimeRate,
        techMetrics,
        dailyCompletion,
      }
    })
  } catch (err) {
    console.error("[getOperationsMetrics] Error:", err)
    return empty
  }
}

// ---------------------------------------------------------------------------
// exportOperationsCsv — owner-only CSV export
// ---------------------------------------------------------------------------

export async function exportOperationsCsv(
  startDate: string,
  endDate: string
): Promise<{ success: boolean; csv?: string; error?: string }> {
  const token = await getRlsToken()
  if (!token) return { success: false, error: "Not authenticated" }

  const role = token["user_role"] as string | undefined
  if (role !== "owner") {
    return { success: false, error: "Only the owner can export operations data" }
  }

  try {
    const data = await getOperationsMetrics(startDate, endDate)

    const headers = [
      "Tech Name",
      "Total Stops",
      "Completed",
      "Skipped",
      "Missed",
      "Completion Rate %",
      "On-Time Rate %",
    ]

    const rows = data.techMetrics.map((t) => [
      csvEscape(t.techName),
      String(t.totalStops),
      String(t.completedStops),
      String(t.skippedStops),
      String(t.missedStops),
      t.completionRate.toFixed(1),
      t.onTimeRate.toFixed(1),
    ])

    const csv = [headers.join(","), ...rows.map((r) => r.join(","))].join("\n")
    return { success: true, csv }
  } catch (err) {
    console.error("[exportOperationsCsv] Error:", err)
    return { success: false, error: "Failed to export operations data" }
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
