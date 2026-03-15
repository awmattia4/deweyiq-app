"use server"

/**
 * reporting.ts -- Phase 9 reporting server actions.
 *
 * Phase 9: Reporting & Team Analytics
 *
 * This file is extended by Plans 02-05 sequentially:
 *   - Plan 02: Revenue Dashboard — getRevenueDashboard, getCustomerRevenueDetail, exportRevenueCsv
 *   - Plan 03: Operations Dashboard — getOperationsMetrics, exportOperationsCsv
 *   - Plan 04: Team Dashboard — getTeamMetrics, getTechScorecard, getPayrollPrep, exportPayrollCsv, exportTeamCsv
 *   - Plan 05: Profitability Dashboard — getProfitabilityDashboard
 *
 * Uses withRls for all queries. LEFT JOIN pattern per MEMORY.md (no correlated subqueries).
 * CHART_COLORS are hex-only — no oklch (SVG/WebGL cannot parse oklch).
 */

import { createClient } from "@/lib/supabase/server"
import { withRls, adminDb } from "@/lib/db"
import type { SupabaseToken } from "@/lib/db"
import { invoices, customers, profiles, routeStops, serviceVisits, workOrders, orgSettings } from "@/lib/db/schema"
import { and, eq, sql, isNull, inArray } from "drizzle-orm"
import { classifyReading } from "@/lib/chemistry/targets"
import type { SanitizerType } from "@/lib/chemistry/targets"

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
// Types — Team Dashboard (Plan 04)
// ---------------------------------------------------------------------------

export interface TechScorecardRow {
  techId: string
  techName: string
  // Speed/volume metrics
  completedStops: number
  daysWorked: number
  stopsPerDay: number
  // Avg stop time only includes stops with started_at data (Phase 9+)
  avgStopMinutes: number
  onTimeRate: number
  // Quality metrics
  chemistryAccuracy: number
  checklistCompletionRate: number
  photoRate: number
  // Trends (positive = improvement vs previous period)
  stopsPerDayTrend: number
  avgStopMinutesTrend: number
  onTimeRateTrend: number
  chemistryAccuracyTrend: number
}

export interface TeamMetricsData {
  techs: TechScorecardRow[]
  previousPeriodAvg: {
    stopsPerDay: number
    avgStopMinutes: number
    onTimeRate: number
    chemistryAccuracy: number
  }
}

export interface PayrollRow {
  techId: string
  name: string
  email: string
  payType: string
  completedStops: number
  hoursWorked: number | null
  payRate: number
  payRateConfigured: boolean
  basePay: number
  upsellCommissions: number
  totalGross: number
}

// ---------------------------------------------------------------------------
// computeChemAccuracy — helper: classify readings in JS per MEMORY.md pitfall
// (avoids correlated subquery on RLS-protected service_visits)
// ---------------------------------------------------------------------------

function computeChemAccuracy(
  visits: Array<{ chemistry_readings: unknown }>
): number {
  let inRange = 0
  let total = 0

  for (const visit of visits) {
    const readings = visit.chemistry_readings as Record<string, number | null> | null
    if (!readings) continue

    // Known chemistry params that have target ranges
    const params: Array<[string, SanitizerType]> = [
      ["freeChlorine", "chlorine"],
      ["pH", "chlorine"],
      ["totalAlkalinity", "chlorine"],
      ["calciumHardness", "chlorine"],
      ["cya", "chlorine"],
      ["phosphates", "chlorine"],
    ]

    for (const [param, sanitizer] of params) {
      const val = readings[param]
      if (val == null || typeof val !== "number") continue
      total++
      const result = classifyReading(param as Parameters<typeof classifyReading>[0], val, sanitizer)
      if (result.status === "ok") inRange++
    }
  }

  return total > 0 ? (inRange / total) * 100 : 0
}

// ---------------------------------------------------------------------------
// computeChecklistRate — helper: calculate checklist completion rate in JS
// ---------------------------------------------------------------------------

function computeChecklistRate(
  visits: Array<{ checklist_completion: unknown }>
): number {
  let completedItems = 0
  let totalItems = 0

  for (const visit of visits) {
    const checklist = visit.checklist_completion as Array<{ completed: boolean }> | null
    if (!Array.isArray(checklist)) continue
    for (const item of checklist) {
      totalItems++
      if (item.completed) completedItems++
    }
  }

  return totalItems > 0 ? (completedItems / totalItems) * 100 : 0
}

// ---------------------------------------------------------------------------
// computePhotoRate — helper: % of visits with at least 1 photo
// ---------------------------------------------------------------------------

function computePhotoRate(
  visits: Array<{ photo_urls: unknown }>
): number {
  if (visits.length === 0) return 0
  const withPhoto = visits.filter((v) => {
    const urls = v.photo_urls as string[] | null
    return Array.isArray(urls) && urls.length > 0
  })
  return (withPhoto.length / visits.length) * 100
}

// ---------------------------------------------------------------------------
// buildScorecardRow — merge stop metrics + visit metrics per tech
// ---------------------------------------------------------------------------

interface StopMetricRow {
  techId: string
  techName: string | null
  techEmail: string | null
  completedStops: number
  daysWorked: number
  avgStopMinutes: number | null
  onTimeStops: number
}

function buildScorecardRow(
  stopRow: StopMetricRow,
  visits: Array<{ chemistry_readings: unknown; checklist_completion: unknown; photo_urls: unknown }>,
  prevRow: StopMetricRow | undefined,
  prevVisits: Array<{ chemistry_readings: unknown; checklist_completion: unknown; photo_urls: unknown }>
): TechScorecardRow {
  const completed = stopRow.completedStops ?? 0
  const days = stopRow.daysWorked ?? 0
  const stopsPerDay = days > 0 ? completed / days : 0
  const avgStopMinutes = stopRow.avgStopMinutes ?? 0
  const onTimeRate = completed > 0 ? ((stopRow.onTimeStops ?? 0) / completed) * 100 : 0

  const chemAccuracy = computeChemAccuracy(visits)
  const checklistRate = computeChecklistRate(visits)
  const photoRate = computePhotoRate(visits)

  // Previous period metrics
  const prevCompleted = prevRow?.completedStops ?? 0
  const prevDays = prevRow?.daysWorked ?? 0
  const prevStopsPerDay = prevDays > 0 ? prevCompleted / prevDays : 0
  const prevAvgMinutes = prevRow?.avgStopMinutes ?? 0
  const prevOnTime = prevCompleted > 0 ? ((prevRow?.onTimeStops ?? 0) / prevCompleted) * 100 : 0
  const prevChemAccuracy = computeChemAccuracy(prevVisits)

  return {
    techId: stopRow.techId,
    techName: stopRow.techName ?? "Unknown",
    completedStops: completed,
    daysWorked: days,
    stopsPerDay,
    avgStopMinutes,
    onTimeRate,
    chemistryAccuracy: chemAccuracy,
    checklistCompletionRate: checklistRate,
    photoRate,
    stopsPerDayTrend: stopsPerDay - prevStopsPerDay,
    avgStopMinutesTrend: prevAvgMinutes - avgStopMinutes, // lower avg time = improvement = positive trend
    onTimeRateTrend: onTimeRate - prevOnTime,
    chemistryAccuracyTrend: chemAccuracy - prevChemAccuracy,
  }
}

// ---------------------------------------------------------------------------
// getTeamMetrics — owner + office: all techs' scorecards with trends
// ---------------------------------------------------------------------------

export async function getTeamMetrics(
  startDate: string,
  endDate: string
): Promise<TeamMetricsData> {
  const empty: TeamMetricsData = { techs: [], previousPeriodAvg: { stopsPerDay: 0, avgStopMinutes: 0, onTimeRate: 0, chemistryAccuracy: 0 } }

  const token = await getRlsToken()
  if (!token) return empty

  const role = token["user_role"] as string | undefined
  if (!role || !["owner", "office"].includes(role)) return empty

  try {
    // ------------------------------------------------------------------
    // a. Previous period window (same length)
    // ------------------------------------------------------------------
    const periodDays = Math.max(
      1,
      Math.ceil((new Date(endDate).getTime() - new Date(startDate).getTime()) / (1000 * 60 * 60 * 24)) + 1
    )
    const prevEndDate = new Date(startDate)
    prevEndDate.setDate(prevEndDate.getDate() - 1)
    const prevStartDate = new Date(prevEndDate)
    prevStartDate.setDate(prevStartDate.getDate() - periodDays + 1)
    const prevStartStr = `${prevStartDate.getFullYear()}-${String(prevStartDate.getMonth() + 1).padStart(2, "0")}-${String(prevStartDate.getDate()).padStart(2, "0")}`
    const prevEndStr = `${prevEndDate.getFullYear()}-${String(prevEndDate.getMonth() + 1).padStart(2, "0")}-${String(prevEndDate.getDate()).padStart(2, "0")}`

    return await withRls(token, async (db) => {
      // ------------------------------------------------------------------
      // b. Stop metrics per tech (current period) — LEFT JOIN pattern
      //    On-time = status='complete' AND updated_at::date = scheduled_date
      //    Avg stop time uses started_at → updated_at (proxy); NULL started_at excluded
      // ------------------------------------------------------------------
      const stopRows = await db
        .select({
          techId: routeStops.tech_id,
          techName: profiles.full_name,
          techEmail: profiles.email,
          completedStops: sql<number>`COUNT(*) FILTER (WHERE ${routeStops.status} = 'complete')::int`,
          daysWorked: sql<number>`COUNT(DISTINCT ${routeStops.scheduled_date}) FILTER (WHERE ${routeStops.status} = 'complete')::int`,
          avgStopMinutes: sql<number | null>`
            NULLIF(
              AVG(
                EXTRACT(EPOCH FROM (${routeStops.updated_at} - ${routeStops.started_at})) / 60.0
              ) FILTER (WHERE ${routeStops.status} = 'complete' AND ${routeStops.started_at} IS NOT NULL),
              0
            )
          `,
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
            sql`${routeStops.scheduled_date} <= ${endDate}`
          )
        )
        .groupBy(routeStops.tech_id, profiles.full_name, profiles.email)

      const techIds = stopRows
        .filter((r) => r.techId !== null)
        .map((r) => r.techId!)

      // ------------------------------------------------------------------
      // c. Service visits for chemistry/checklist/photo (current period)
      //    Two-step pattern per MEMORY.md: fetch visits separately, merge in JS
      // ------------------------------------------------------------------
      const visitRows = techIds.length > 0
        ? await db
            .select({
              techId: serviceVisits.tech_id,
              chemistry_readings: serviceVisits.chemistry_readings,
              checklist_completion: serviceVisits.checklist_completion,
              photo_urls: serviceVisits.photo_urls,
            })
            .from(serviceVisits)
            .where(
              and(
                inArray(serviceVisits.tech_id, techIds),
                sql`${serviceVisits.visited_at} >= ${startDate}::timestamptz`,
                sql`${serviceVisits.visited_at} < (${endDate}::date + interval '1 day')::timestamptz`,
                eq(serviceVisits.status, "complete")
              )
            )
        : []

      // Group visits by techId
      const visitsByTech = new Map<string, typeof visitRows>()
      for (const v of visitRows) {
        if (!v.techId) continue
        const arr = visitsByTech.get(v.techId) ?? []
        arr.push(v)
        visitsByTech.set(v.techId, arr)
      }

      // ------------------------------------------------------------------
      // d. Stop metrics per tech (previous period)
      // ------------------------------------------------------------------
      const prevStopRows = await db
        .select({
          techId: routeStops.tech_id,
          techName: profiles.full_name,
          techEmail: profiles.email,
          completedStops: sql<number>`COUNT(*) FILTER (WHERE ${routeStops.status} = 'complete')::int`,
          daysWorked: sql<number>`COUNT(DISTINCT ${routeStops.scheduled_date}) FILTER (WHERE ${routeStops.status} = 'complete')::int`,
          avgStopMinutes: sql<number | null>`
            NULLIF(
              AVG(
                EXTRACT(EPOCH FROM (${routeStops.updated_at} - ${routeStops.started_at})) / 60.0
              ) FILTER (WHERE ${routeStops.status} = 'complete' AND ${routeStops.started_at} IS NOT NULL),
              0
            )
          `,
          onTimeStops: sql<number>`COUNT(*) FILTER (
            WHERE ${routeStops.status} = 'complete'
            AND (${routeStops.updated_at})::date = (${routeStops.scheduled_date})::date
          )::int`,
        })
        .from(routeStops)
        .leftJoin(profiles, eq(routeStops.tech_id, profiles.id))
        .where(
          and(
            sql`${routeStops.scheduled_date} >= ${prevStartStr}`,
            sql`${routeStops.scheduled_date} <= ${prevEndStr}`
          )
        )
        .groupBy(routeStops.tech_id, profiles.full_name, profiles.email)

      // ------------------------------------------------------------------
      // e. Previous period visits for chemistry accuracy trend
      // ------------------------------------------------------------------
      const prevVisitRows = techIds.length > 0
        ? await db
            .select({
              techId: serviceVisits.tech_id,
              chemistry_readings: serviceVisits.chemistry_readings,
              checklist_completion: serviceVisits.checklist_completion,
              photo_urls: serviceVisits.photo_urls,
            })
            .from(serviceVisits)
            .where(
              and(
                inArray(serviceVisits.tech_id, techIds),
                sql`${serviceVisits.visited_at} >= ${prevStartStr}::timestamptz`,
                sql`${serviceVisits.visited_at} < (${prevEndStr}::date + interval '1 day')::timestamptz`,
                eq(serviceVisits.status, "complete")
              )
            )
        : []

      const prevVisitsByTech = new Map<string, typeof prevVisitRows>()
      for (const v of prevVisitRows) {
        if (!v.techId) continue
        const arr = prevVisitsByTech.get(v.techId) ?? []
        arr.push(v)
        prevVisitsByTech.set(v.techId, arr)
      }

      const prevStopByTech = new Map<string, StopMetricRow>()
      for (const r of prevStopRows) {
        if (!r.techId) continue
        prevStopByTech.set(r.techId, {
          techId: r.techId!,
          techName: r.techName,
          techEmail: r.techEmail,
          completedStops: r.completedStops ?? 0,
          daysWorked: r.daysWorked ?? 0,
          avgStopMinutes: r.avgStopMinutes ?? null,
          onTimeStops: r.onTimeStops ?? 0,
        })
      }

      // ------------------------------------------------------------------
      // f. Build scorecard rows
      // ------------------------------------------------------------------
      const techs: TechScorecardRow[] = stopRows
        .filter((r) => r.techId !== null)
        .map((r) => buildScorecardRow(
          {
            techId: r.techId!,
            techName: r.techName,
            techEmail: r.techEmail,
            completedStops: r.completedStops ?? 0,
            daysWorked: r.daysWorked ?? 0,
            avgStopMinutes: r.avgStopMinutes ?? null,
            onTimeStops: r.onTimeStops ?? 0,
          },
          visitsByTech.get(r.techId!) ?? [],
          prevStopByTech.get(r.techId!),
          prevVisitsByTech.get(r.techId!) ?? []
        ))
        .sort((a, b) => b.stopsPerDay - a.stopsPerDay)

      const previousPeriodAvg = techs.length > 0
        ? {
            stopsPerDay: techs.reduce((s, t) => s + (t.stopsPerDay - t.stopsPerDayTrend), 0) / techs.length,
            avgStopMinutes: techs.reduce((s, t) => s + (t.avgStopMinutes + t.avgStopMinutesTrend), 0) / techs.length,
            onTimeRate: techs.reduce((s, t) => s + (t.onTimeRate - t.onTimeRateTrend), 0) / techs.length,
            chemistryAccuracy: techs.reduce((s, t) => s + (t.chemistryAccuracy - t.chemistryAccuracyTrend), 0) / techs.length,
          }
        : { stopsPerDay: 0, avgStopMinutes: 0, onTimeRate: 0, chemistryAccuracy: 0 }

      return { techs, previousPeriodAvg }
    })
  } catch (err) {
    console.error("[getTeamMetrics] Error:", err)
    return empty
  }
}

// ---------------------------------------------------------------------------
// getTechScorecard — single tech's scorecard (for tech self-view)
// Role guard: tech can only query their own ID; owner/office can query any tech
// ---------------------------------------------------------------------------

export async function getTechScorecard(
  techId: string,
  startDate: string,
  endDate: string
): Promise<TechScorecardRow | null> {
  const token = await getRlsToken()
  if (!token) return null

  const role = token["user_role"] as string | undefined
  const userId = token["sub"] as string | undefined

  // Tech can only see their own data
  if (role === "tech" && userId !== techId) return null
  if (!role || !["owner", "office", "tech"].includes(role)) return null

  try {
    // Previous period window
    const periodDays = Math.max(
      1,
      Math.ceil((new Date(endDate).getTime() - new Date(startDate).getTime()) / (1000 * 60 * 60 * 24)) + 1
    )
    const prevEndDate = new Date(startDate)
    prevEndDate.setDate(prevEndDate.getDate() - 1)
    const prevStartDate = new Date(prevEndDate)
    prevStartDate.setDate(prevStartDate.getDate() - periodDays + 1)
    const prevStartStr = `${prevStartDate.getFullYear()}-${String(prevStartDate.getMonth() + 1).padStart(2, "0")}-${String(prevStartDate.getDate()).padStart(2, "0")}`
    const prevEndStr = `${prevEndDate.getFullYear()}-${String(prevEndDate.getMonth() + 1).padStart(2, "0")}-${String(prevEndDate.getDate()).padStart(2, "0")}`

    return await withRls(token, async (db) => {
      // Stop metrics — current period
      const [stopRow] = await db
        .select({
          techId: routeStops.tech_id,
          techName: profiles.full_name,
          techEmail: profiles.email,
          completedStops: sql<number>`COUNT(*) FILTER (WHERE ${routeStops.status} = 'complete')::int`,
          daysWorked: sql<number>`COUNT(DISTINCT ${routeStops.scheduled_date}) FILTER (WHERE ${routeStops.status} = 'complete')::int`,
          avgStopMinutes: sql<number | null>`
            NULLIF(
              AVG(
                EXTRACT(EPOCH FROM (${routeStops.updated_at} - ${routeStops.started_at})) / 60.0
              ) FILTER (WHERE ${routeStops.status} = 'complete' AND ${routeStops.started_at} IS NOT NULL),
              0
            )
          `,
          onTimeStops: sql<number>`COUNT(*) FILTER (
            WHERE ${routeStops.status} = 'complete'
            AND (${routeStops.updated_at})::date = (${routeStops.scheduled_date})::date
          )::int`,
        })
        .from(routeStops)
        .leftJoin(profiles, eq(routeStops.tech_id, profiles.id))
        .where(
          and(
            eq(routeStops.tech_id, techId),
            sql`${routeStops.scheduled_date} >= ${startDate}`,
            sql`${routeStops.scheduled_date} <= ${endDate}`
          )
        )
        .groupBy(routeStops.tech_id, profiles.full_name, profiles.email)

      if (!stopRow) return null

      // Visits — current period
      const visitRows = await db
        .select({
          techId: serviceVisits.tech_id,
          chemistry_readings: serviceVisits.chemistry_readings,
          checklist_completion: serviceVisits.checklist_completion,
          photo_urls: serviceVisits.photo_urls,
        })
        .from(serviceVisits)
        .where(
          and(
            eq(serviceVisits.tech_id, techId),
            sql`${serviceVisits.visited_at} >= ${startDate}::timestamptz`,
            sql`${serviceVisits.visited_at} < (${endDate}::date + interval '1 day')::timestamptz`,
            eq(serviceVisits.status, "complete")
          )
        )

      // Stop metrics — previous period
      const [prevStopRow] = await db
        .select({
          techId: routeStops.tech_id,
          techName: profiles.full_name,
          techEmail: profiles.email,
          completedStops: sql<number>`COUNT(*) FILTER (WHERE ${routeStops.status} = 'complete')::int`,
          daysWorked: sql<number>`COUNT(DISTINCT ${routeStops.scheduled_date}) FILTER (WHERE ${routeStops.status} = 'complete')::int`,
          avgStopMinutes: sql<number | null>`
            NULLIF(
              AVG(
                EXTRACT(EPOCH FROM (${routeStops.updated_at} - ${routeStops.started_at})) / 60.0
              ) FILTER (WHERE ${routeStops.status} = 'complete' AND ${routeStops.started_at} IS NOT NULL),
              0
            )
          `,
          onTimeStops: sql<number>`COUNT(*) FILTER (
            WHERE ${routeStops.status} = 'complete'
            AND (${routeStops.updated_at})::date = (${routeStops.scheduled_date})::date
          )::int`,
        })
        .from(routeStops)
        .leftJoin(profiles, eq(routeStops.tech_id, profiles.id))
        .where(
          and(
            eq(routeStops.tech_id, techId),
            sql`${routeStops.scheduled_date} >= ${prevStartStr}`,
            sql`${routeStops.scheduled_date} <= ${prevEndStr}`
          )
        )
        .groupBy(routeStops.tech_id, profiles.full_name, profiles.email)

      // Visits — previous period
      const prevVisitRows = await db
        .select({
          techId: serviceVisits.tech_id,
          chemistry_readings: serviceVisits.chemistry_readings,
          checklist_completion: serviceVisits.checklist_completion,
          photo_urls: serviceVisits.photo_urls,
        })
        .from(serviceVisits)
        .where(
          and(
            eq(serviceVisits.tech_id, techId),
            sql`${serviceVisits.visited_at} >= ${prevStartStr}::timestamptz`,
            sql`${serviceVisits.visited_at} < (${prevEndStr}::date + interval '1 day')::timestamptz`,
            eq(serviceVisits.status, "complete")
          )
        )

      return buildScorecardRow(
        {
          techId: stopRow.techId!,
          techName: stopRow.techName,
          techEmail: stopRow.techEmail,
          completedStops: stopRow.completedStops ?? 0,
          daysWorked: stopRow.daysWorked ?? 0,
          avgStopMinutes: stopRow.avgStopMinutes ?? null,
          onTimeStops: stopRow.onTimeStops ?? 0,
        },
        visitRows,
        prevStopRow
          ? {
              techId: prevStopRow.techId!,
              techName: prevStopRow.techName,
              techEmail: prevStopRow.techEmail,
              completedStops: prevStopRow.completedStops ?? 0,
              daysWorked: prevStopRow.daysWorked ?? 0,
              avgStopMinutes: prevStopRow.avgStopMinutes ?? null,
              onTimeStops: prevStopRow.onTimeStops ?? 0,
            }
          : undefined,
        prevVisitRows
      )
    })
  } catch (err) {
    console.error("[getTechScorecard] Error:", err)
    return null
  }
}

// ---------------------------------------------------------------------------
// getPayrollPrep — owner-only payroll data
// ---------------------------------------------------------------------------

export async function getPayrollPrep(
  startDate: string,
  endDate: string
): Promise<PayrollRow[]> {
  const token = await getRlsToken()
  if (!token) return []

  const role = token["user_role"] as string | undefined
  if (role !== "owner") return []

  try {
    // Use adminDb for cross-table JSONB commission query
    // Fetch all techs + owners in the org with pay config
    const orgId = token["org_id"] as string
    const techProfileRows = await adminDb
      .select({
        id: profiles.id,
        full_name: profiles.full_name,
        email: profiles.email,
        role: profiles.role,
        pay_type: profiles.pay_type,
        pay_rate: profiles.pay_rate,
      })
      .from(profiles)
      .where(
        and(
          eq(profiles.org_id, orgId),
          inArray(profiles.role, ["tech", "owner"])
        )
      )

    if (techProfileRows.length === 0) return []

    const techIds = techProfileRows.map((p) => p.id)

    // Completed stops per tech in date range
    const stopCountRows = await adminDb
      .select({
        techId: routeStops.tech_id,
        completedStops: sql<number>`COUNT(*) FILTER (WHERE ${routeStops.status} = 'complete')::int`,
        totalMinutes: sql<number | null>`
          SUM(
            EXTRACT(EPOCH FROM (${routeStops.updated_at} - ${routeStops.started_at})) / 60.0
          ) FILTER (WHERE ${routeStops.status} = 'complete' AND ${routeStops.started_at} IS NOT NULL)
        `,
      })
      .from(routeStops)
      .where(
        and(
          inArray(routeStops.tech_id, techIds),
          sql`${routeStops.scheduled_date} >= ${startDate}`,
          sql`${routeStops.scheduled_date} <= ${endDate}`
        )
      )
      .groupBy(routeStops.tech_id)

    const stopsByTech = new Map<string, { completedStops: number; totalMinutes: number | null }>()
    for (const r of stopCountRows) {
      if (!r.techId) continue
      stopsByTech.set(r.techId, {
        completedStops: r.completedStops ?? 0,
        totalMinutes: r.totalMinutes ?? null,
      })
    }

    // Org commission rate from org_settings
    const [settingsRow] = await adminDb
      .select({ wo_upsell_commission_pct: orgSettings.wo_upsell_commission_pct })
      .from(orgSettings)
      .where(eq(orgSettings.org_id, orgId))

    const commissionPct = parseFloat(settingsRow?.wo_upsell_commission_pct ?? "0") / 100

    // Tech-flagged WOs completed in date range, per tech
    // Step 1: fetch WOs flagged by each tech, completed in date range
    const flaggedWoRows = await adminDb
      .select({
        id: workOrders.id,
        flaggedByTechId: workOrders.flagged_by_tech_id,
      })
      .from(workOrders)
      .where(
        and(
          eq(workOrders.org_id, orgId),
          inArray(workOrders.status, ["complete", "invoiced"]),
          inArray(workOrders.flagged_by_tech_id, techIds),
          sql`${workOrders.updated_at} >= ${startDate}::timestamptz`,
          sql`${workOrders.updated_at} < (${endDate}::date + interval '1 day')::timestamptz`
        )
      )

    // Step 2: For each tech's WO IDs, find invoices using JSONB containment
    const commissionByTech = new Map<string, number>()

    // Group WO IDs by tech
    const wosByTech = new Map<string, string[]>()
    for (const wo of flaggedWoRows) {
      if (!wo.flaggedByTechId) continue
      const arr = wosByTech.get(wo.flaggedByTechId) ?? []
      arr.push(wo.id)
      wosByTech.set(wo.flaggedByTechId, arr)
    }

    // For each tech, find matching invoices via JSONB array containment
    for (const [techId, woIds] of wosByTech.entries()) {
      let totalInvoiced = 0
      for (const woId of woIds) {
        const matchingInvoices = await adminDb
          .select({
            total: invoices.total,
          })
          .from(invoices)
          .where(
            and(
              eq(invoices.org_id, orgId),
              inArray(invoices.status, ["sent", "paid"]),
              sql`${invoices.work_order_ids} @> ${JSON.stringify([woId])}::jsonb`
            )
          )
        for (const inv of matchingInvoices) {
          totalInvoiced += parseFloat(inv.total ?? "0")
        }
      }
      commissionByTech.set(techId, totalInvoiced * commissionPct)
    }

    // Assemble payroll rows
    const payrollRows: PayrollRow[] = techProfileRows.map((profile) => {
      const stopData = stopsByTech.get(profile.id) ?? { completedStops: 0, totalMinutes: null }
      const payType = profile.pay_type ?? "per_stop"
      const payRate = parseFloat(profile.pay_rate ?? "0")
      const payRateConfigured = payRate > 0

      const hoursWorked = stopData.totalMinutes != null
        ? Math.round((stopData.totalMinutes / 60) * 100) / 100
        : null

      let basePay = 0
      if (payType === "per_stop") {
        basePay = stopData.completedStops * payRate
      } else if (payType === "hourly") {
        basePay = (hoursWorked ?? 0) * payRate
      }

      const upsellCommissions = commissionByTech.get(profile.id) ?? 0
      const totalGross = basePay + upsellCommissions

      return {
        techId: profile.id,
        name: profile.full_name,
        email: profile.email,
        payType,
        completedStops: stopData.completedStops,
        hoursWorked,
        payRate,
        payRateConfigured,
        basePay,
        upsellCommissions,
        totalGross,
      }
    })

    return payrollRows.sort((a, b) => a.name.localeCompare(b.name))
  } catch (err) {
    console.error("[getPayrollPrep] Error:", err)
    return []
  }
}

// ---------------------------------------------------------------------------
// exportPayrollCsv — owner-only payroll CSV for Gusto/ADP
// ---------------------------------------------------------------------------

export async function exportPayrollCsv(
  startDate: string,
  endDate: string
): Promise<{ success: boolean; csv?: string; error?: string }> {
  const token = await getRlsToken()
  if (!token) return { success: false, error: "Not authenticated" }

  const role = token["user_role"] as string | undefined
  if (role !== "owner") return { success: false, error: "Only the owner can export payroll data" }

  try {
    const rows = await getPayrollPrep(startDate, endDate)

    const headers = [
      "Employee Name",
      "Employee Email",
      "Pay Type",
      "Period Start",
      "Period End",
      "Completed Stops",
      "Hours Worked",
      "Pay Rate",
      "Base Pay",
      "Upsell Commissions",
      "Total Gross Pay",
    ]

    const csvRows = rows.map((r) => [
      csvEscape(r.name),
      csvEscape(r.email),
      r.payType === "per_stop" ? "Per Stop" : "Hourly",
      startDate,
      endDate,
      String(r.completedStops),
      r.hoursWorked != null ? r.hoursWorked.toFixed(2) : "",
      r.payRate.toFixed(2),
      r.basePay.toFixed(2),
      r.upsellCommissions.toFixed(2),
      r.totalGross.toFixed(2),
    ])

    const csv = [headers.join(","), ...csvRows.map((r) => r.join(","))].join("\n")
    return { success: true, csv }
  } catch (err) {
    console.error("[exportPayrollCsv] Error:", err)
    return { success: false, error: "Failed to export payroll data" }
  }
}

// ---------------------------------------------------------------------------
// exportTeamCsv — owner-only scorecard CSV export
// ---------------------------------------------------------------------------

export async function exportTeamCsv(
  startDate: string,
  endDate: string
): Promise<{ success: boolean; csv?: string; error?: string }> {
  const token = await getRlsToken()
  if (!token) return { success: false, error: "Not authenticated" }

  const role = token["user_role"] as string | undefined
  if (role !== "owner") return { success: false, error: "Only the owner can export team data" }

  try {
    const data = await getTeamMetrics(startDate, endDate)

    const headers = [
      "Tech Name",
      "Stops/Day",
      "Avg Stop Time (min)",
      "On-Time Rate %",
      "Chemistry Accuracy %",
      "Checklist Rate %",
      "Photo Rate %",
    ]

    const csvRows = data.techs.map((t) => [
      csvEscape(t.techName),
      t.stopsPerDay.toFixed(1),
      t.avgStopMinutes.toFixed(1),
      t.onTimeRate.toFixed(1),
      t.chemistryAccuracy.toFixed(1),
      t.checklistCompletionRate.toFixed(1),
      t.photoRate.toFixed(1),
    ])

    const csv = [headers.join(","), ...csvRows.map((r) => r.join(","))].join("\n")
    return { success: true, csv }
  } catch (err) {
    console.error("[exportTeamCsv] Error:", err)
    return { success: false, error: "Failed to export team data" }
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
