"use client"

/**
 * RevenueDashboard — Phase 9 Plan 02
 *
 * Financial command center for the Revenue Dashboard tab:
 * - KPI cards: Total Revenue (with trend), Invoice Count, Avg Invoice Value, Outstanding AR
 * - AreaChart: Revenue trend by month
 * - Ranked tables: Revenue by customer (clickable → drill-down drawer), Revenue by tech
 * - Customer detail drawer: invoice list + billing model breakdown
 * - Time period selector
 * - CSV export (owner-only)
 *
 * All chart colors use hex — no oklch (SVG/WebGL cannot parse oklch per MEMORY.md).
 */

import { useState, useTransition } from "react"
import {
  AreaChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  BarChart,
  Bar,
  Cell,
} from "recharts"
import { DownloadIcon, LoaderIcon } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet"
import { Skeleton } from "@/components/ui/skeleton"
import {
  TimePeriodSelector,
  KpiCard,
  downloadCsv,
  formatCurrency,
  CHART_COLORS,
} from "@/components/reports/report-shared"
import {
  getRevenueDashboard,
  getCustomerRevenueDetail,
  exportRevenueCsv,
} from "@/actions/reporting"
import type { RevenueDashboardData, CustomerRevenueDetail } from "@/actions/reporting"

// ---------------------------------------------------------------------------
// Props
// ---------------------------------------------------------------------------

interface RevenueDashboardProps {
  initialData: RevenueDashboardData
  defaultStartDate: string
  defaultEndDate: string
  isOwner: boolean
}

// ---------------------------------------------------------------------------
// RevenueDashboard
// ---------------------------------------------------------------------------

export function RevenueDashboard({
  initialData,
  defaultStartDate,
  defaultEndDate,
  isOwner,
}: RevenueDashboardProps) {
  const [data, setData] = useState<RevenueDashboardData>(initialData)
  const [startDate, setStartDate] = useState(defaultStartDate)
  const [endDate, setEndDate] = useState(defaultEndDate)
  const [isPending, startTransition] = useTransition()
  const [isExporting, startExportTransition] = useTransition()

  // Drawer state
  const [drawerOpen, setDrawerOpen] = useState(false)
  const [drawerCustomerId, setDrawerCustomerId] = useState<string | null>(null)
  const [drawerDetail, setDrawerDetail] = useState<CustomerRevenueDetail | null>(null)
  const [isLoadingDetail, startDetailTransition] = useTransition()

  // ------------------------------------------------------------------
  // Handlers
  // ------------------------------------------------------------------

  function handlePeriodChange(start: string, end: string) {
    setStartDate(start)
    setEndDate(end)
    startTransition(async () => {
      const result = await getRevenueDashboard(start, end)
      setData(result)
    })
  }

  function handleCustomerClick(customerId: string) {
    setDrawerCustomerId(customerId)
    setDrawerDetail(null)
    setDrawerOpen(true)
    startDetailTransition(async () => {
      const detail = await getCustomerRevenueDetail(customerId, startDate, endDate)
      setDrawerDetail(detail)
    })
  }

  function handleExport() {
    startExportTransition(async () => {
      const result = await exportRevenueCsv(startDate, endDate)
      if (result.success && result.csv) {
        downloadCsv(
          result.csv,
          `revenue-by-customer-${startDate}-to-${endDate}.csv`
        )
      }
    })
  }

  // ------------------------------------------------------------------
  // Trend calculation
  // ------------------------------------------------------------------
  const revenueTrendPct =
    data.previousPeriodRevenue > 0
      ? ((data.totalRevenue - data.previousPeriodRevenue) /
          data.previousPeriodRevenue) *
        100
      : data.totalRevenue > 0
      ? 100
      : 0

  const invoiceCountPrev = 0 // previousPeriodRevenue used only for revenue trend
  void invoiceCountPrev

  // ------------------------------------------------------------------
  // Render
  // ------------------------------------------------------------------

  return (
    <div className="flex flex-col gap-6">

      {/* Time period selector + export */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center gap-3 justify-between">
        <TimePeriodSelector
          startDate={startDate}
          endDate={endDate}
          onChange={handlePeriodChange}
        />
        {isOwner && (
          <Button
            variant="outline"
            size="sm"
            onClick={handleExport}
            disabled={isExporting || isPending}
          >
            {isExporting ? (
              <LoaderIcon className="h-3.5 w-3.5 mr-1.5 animate-spin" />
            ) : (
              <DownloadIcon className="h-3.5 w-3.5 mr-1.5" />
            )}
            {isExporting ? "Exporting..." : "Export CSV"}
          </Button>
        )}
      </div>

      {/* Loading shimmer */}
      {isPending && (
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          {Array.from({ length: 4 }).map((_, i) => (
            <Card key={i}>
              <CardHeader className="pb-2">
                <Skeleton className="h-4 w-28" />
              </CardHeader>
              <CardContent>
                <Skeleton className="h-8 w-32 mb-2" />
                <Skeleton className="h-3 w-20" />
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {/* KPI cards */}
      {!isPending && (
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          <KpiCard
            title="Total Revenue"
            value={formatCurrency(data.totalRevenue)}
            trend={
              data.previousPeriodRevenue > 0 || data.totalRevenue > 0
                ? { value: revenueTrendPct, label: "vs previous period" }
                : undefined
            }
            subtitle={
              data.previousPeriodRevenue === 0 && data.totalRevenue === 0
                ? "No data for this period"
                : undefined
            }
          />
          <KpiCard
            title="Invoice Count"
            value={String(data.invoiceCount)}
            subtitle={data.invoiceCount > 0 ? "paid invoices" : "No paid invoices"}
          />
          <KpiCard
            title="Avg Invoice Value"
            value={formatCurrency(data.avgInvoiceValue)}
            subtitle={data.invoiceCount > 0 ? "per paid invoice" : undefined}
          />
          <KpiCard
            title="Outstanding AR"
            value={formatCurrency(data.outstandingAR)}
            subtitle={
              data.outstandingAR > 0
                ? "unpaid sent invoices"
                : "No outstanding balance"
            }
          />
        </div>
      )}

      {/* Revenue trend chart */}
      {!isPending && (
        <Card>
          <CardHeader>
            <CardTitle className="text-sm font-medium text-muted-foreground">
              Revenue Trend
            </CardTitle>
          </CardHeader>
          <CardContent>
            {data.revenueByMonth.length === 0 ? (
              <div className="flex items-center justify-center h-[280px]">
                <p className="text-sm text-muted-foreground italic">
                  No revenue data for this period
                </p>
              </div>
            ) : (
              <div style={{ height: 280 }}>
                <ResponsiveContainer width="100%" height="100%">
                  <AreaChart
                    data={data.revenueByMonth}
                    margin={{ top: 4, right: 4, left: 0, bottom: 0 }}
                  >
                    <defs>
                      <linearGradient id="revenueGradient" x1="0" y1="0" x2="0" y2="1">
                        <stop
                          offset="5%"
                          stopColor={CHART_COLORS.primary}
                          stopOpacity={0.3}
                        />
                        <stop
                          offset="95%"
                          stopColor={CHART_COLORS.primary}
                          stopOpacity={0}
                        />
                      </linearGradient>
                    </defs>
                    <CartesianGrid
                      strokeDasharray="3 3"
                      stroke={CHART_COLORS.grid}
                      vertical={false}
                    />
                    <XAxis
                      dataKey="month"
                      tick={{ fill: CHART_COLORS.text, fontSize: 12 }}
                      axisLine={false}
                      tickLine={false}
                    />
                    <YAxis
                      tick={{ fill: CHART_COLORS.text, fontSize: 12 }}
                      axisLine={false}
                      tickLine={false}
                      tickFormatter={(v: number) =>
                        v >= 1000 ? `$${(v / 1000).toFixed(0)}k` : `$${v}`
                      }
                      width={56}
                    />
                    <Tooltip
                      contentStyle={{
                        background: CHART_COLORS.bg,
                        border: `1px solid ${CHART_COLORS.grid}`,
                        borderRadius: 8,
                        color: "#f8fafc",
                        fontSize: 13,
                      }}
                      formatter={(value) => [
                        formatCurrency(typeof value === "number" ? value : parseFloat(String(value ?? 0))),
                        "Revenue",
                      ]}
                      labelStyle={{ color: CHART_COLORS.text }}
                    />
                    <Area
                      type="monotone"
                      dataKey="revenue"
                      stroke={CHART_COLORS.primary}
                      strokeWidth={2}
                      fill="url(#revenueGradient)"
                    />
                  </AreaChart>
                </ResponsiveContainer>
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {/* Customer + Tech tables */}
      {!isPending && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">

          {/* Revenue by Customer */}
          <Card>
            <CardHeader>
              <CardTitle className="text-sm font-medium text-muted-foreground">
                Revenue by Customer
              </CardTitle>
            </CardHeader>
            <CardContent className="p-0">
              {data.revenueByCustomer.length === 0 ? (
                <p className="text-sm text-muted-foreground italic px-5 pb-5">
                  No paid revenue for this period
                </p>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b border-border bg-muted/30">
                        <th className="px-4 py-2.5 text-left font-medium text-muted-foreground w-8">
                          #
                        </th>
                        <th className="px-4 py-2.5 text-left font-medium text-muted-foreground">
                          Customer
                        </th>
                        <th className="px-4 py-2.5 text-right font-medium text-muted-foreground">
                          Revenue
                        </th>
                        <th className="px-4 py-2.5 text-right font-medium text-muted-foreground">
                          Invoices
                        </th>
                      </tr>
                    </thead>
                    <tbody>
                      {data.revenueByCustomer.map((row, i) => (
                        <tr
                          key={row.customerId}
                          onClick={() => handleCustomerClick(row.customerId)}
                          className="border-b border-border/50 hover:bg-muted/20 transition-colors cursor-pointer"
                        >
                          <td className="px-4 py-2.5 text-muted-foreground tabular-nums">
                            {i + 1}
                          </td>
                          <td className="px-4 py-2.5 font-medium">
                            {row.customerName}
                          </td>
                          <td className="px-4 py-2.5 text-right tabular-nums font-medium">
                            {formatCurrency(row.totalRevenue)}
                          </td>
                          <td className="px-4 py-2.5 text-right tabular-nums text-muted-foreground">
                            {row.invoiceCount}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </CardContent>
          </Card>

          {/* Revenue by Tech */}
          <Card>
            <CardHeader>
              <CardTitle className="text-sm font-medium text-muted-foreground">
                Revenue by Tech
              </CardTitle>
            </CardHeader>
            <CardContent className="p-0">
              {data.revenueByTech.length === 0 ? (
                <p className="text-sm text-muted-foreground italic px-5 pb-5">
                  No tech assignment data for this period
                </p>
              ) : (
                <>
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="border-b border-border bg-muted/30">
                          <th className="px-4 py-2.5 text-left font-medium text-muted-foreground w-8">
                            #
                          </th>
                          <th className="px-4 py-2.5 text-left font-medium text-muted-foreground">
                            Tech
                          </th>
                          <th className="px-4 py-2.5 text-right font-medium text-muted-foreground">
                            Revenue
                          </th>
                          <th className="px-4 py-2.5 text-right font-medium text-muted-foreground">
                            Customers
                          </th>
                        </tr>
                      </thead>
                      <tbody>
                        {data.revenueByTech.map((row, i) => (
                          <tr
                            key={row.techId}
                            className="border-b border-border/50 hover:bg-muted/10 transition-colors"
                          >
                            <td className="px-4 py-2.5 text-muted-foreground tabular-nums">
                              {i + 1}
                            </td>
                            <td className="px-4 py-2.5 font-medium">
                              {row.techName}
                            </td>
                            <td className="px-4 py-2.5 text-right tabular-nums font-medium">
                              {formatCurrency(row.totalRevenue)}
                            </td>
                            <td className="px-4 py-2.5 text-right tabular-nums text-muted-foreground">
                              {row.customerCount}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                  <p className="px-4 py-2 text-xs text-muted-foreground border-t border-border/50">
                    Based on current tech assignment
                  </p>
                </>
              )}
            </CardContent>
          </Card>

        </div>
      )}

      {/* Customer detail drawer */}
      <Sheet open={drawerOpen} onOpenChange={setDrawerOpen}>
        <SheetContent side="right" className="w-full sm:max-w-lg overflow-y-auto">
          <SheetHeader className="mb-4">
            <SheetTitle>
              {isLoadingDetail
                ? "Loading..."
                : drawerDetail?.customerName ?? "Customer Detail"}
            </SheetTitle>
          </SheetHeader>

          {isLoadingDetail && (
            <div className="flex flex-col gap-3">
              <Skeleton className="h-16 w-full" />
              <Skeleton className="h-32 w-full" />
              <Skeleton className="h-48 w-full" />
            </div>
          )}

          {!isLoadingDetail && drawerDetail && (
            <div className="flex flex-col gap-5">

              {/* Total revenue */}
              <div className="flex items-baseline gap-2">
                <span className="text-2xl font-bold">
                  {formatCurrency(drawerDetail.totalRevenue)}
                </span>
                <span className="text-sm text-muted-foreground">
                  total revenue in period
                </span>
              </div>

              {/* Billing model breakdown */}
              {drawerDetail.billingModelBreakdown.length > 0 && (
                <div>
                  <p className="text-xs text-muted-foreground mb-3 uppercase tracking-wide font-medium">
                    By Billing Model
                  </p>
                  {drawerDetail.billingModelBreakdown.length === 1 ? (
                    // Single model — simple display
                    <div className="flex items-center justify-between text-sm">
                      <span className="capitalize">
                        {drawerDetail.billingModelBreakdown[0].model.replace(/_/g, " ")}
                      </span>
                      <span className="font-medium tabular-nums">
                        {formatCurrency(drawerDetail.billingModelBreakdown[0].total)}
                      </span>
                    </div>
                  ) : (
                    // Multiple models — bar chart
                    <div style={{ height: 120 }}>
                      <ResponsiveContainer width="100%" height="100%">
                        <BarChart
                          data={drawerDetail.billingModelBreakdown.map((b) => ({
                            model: b.model.replace(/_/g, " "),
                            total: b.total,
                          }))}
                          layout="vertical"
                          margin={{ top: 0, right: 8, left: 8, bottom: 0 }}
                        >
                          <CartesianGrid
                            strokeDasharray="3 3"
                            stroke={CHART_COLORS.grid}
                            horizontal={false}
                          />
                          <XAxis
                            type="number"
                            tick={{ fill: CHART_COLORS.text, fontSize: 11 }}
                            axisLine={false}
                            tickLine={false}
                            tickFormatter={(v: number) =>
                              v >= 1000 ? `$${(v / 1000).toFixed(0)}k` : `$${v}`
                            }
                          />
                          <YAxis
                            type="category"
                            dataKey="model"
                            tick={{ fill: CHART_COLORS.text, fontSize: 11 }}
                            axisLine={false}
                            tickLine={false}
                            width={80}
                          />
                          <Tooltip
                            contentStyle={{
                              background: CHART_COLORS.bg,
                              border: `1px solid ${CHART_COLORS.grid}`,
                              borderRadius: 8,
                              color: "#f8fafc",
                              fontSize: 12,
                            }}
                            formatter={(v) => [
                              formatCurrency(typeof v === "number" ? v : parseFloat(String(v ?? 0))),
                              "Revenue",
                            ]}
                          />
                          <Bar dataKey="total" radius={[0, 4, 4, 0]}>
                            {drawerDetail.billingModelBreakdown.map((_, idx) => (
                              <Cell
                                key={idx}
                                fill={
                                  [
                                    CHART_COLORS.primary,
                                    CHART_COLORS.secondary,
                                    CHART_COLORS.tertiary,
                                    CHART_COLORS.warning,
                                  ][idx % 4]
                                }
                              />
                            ))}
                          </Bar>
                        </BarChart>
                      </ResponsiveContainer>
                    </div>
                  )}
                </div>
              )}

              {/* Invoice list */}
              <div>
                <p className="text-xs text-muted-foreground mb-3 uppercase tracking-wide font-medium">
                  Invoices ({drawerDetail.invoices.length})
                </p>
                {drawerDetail.invoices.length === 0 ? (
                  <p className="text-sm text-muted-foreground italic">
                    No paid invoices in this period
                  </p>
                ) : (
                  <div className="overflow-x-auto rounded-lg border border-border">
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="border-b border-border bg-muted/30">
                          <th className="px-3 py-2 text-left font-medium text-muted-foreground">
                            Invoice
                          </th>
                          <th className="px-3 py-2 text-right font-medium text-muted-foreground">
                            Amount
                          </th>
                          <th className="px-3 py-2 text-right font-medium text-muted-foreground">
                            Paid
                          </th>
                        </tr>
                      </thead>
                      <tbody>
                        {drawerDetail.invoices.map((inv) => (
                          <tr
                            key={inv.id}
                            className="border-b border-border/50 last:border-b-0"
                          >
                            <td className="px-3 py-2 text-muted-foreground">
                              {inv.invoiceNumber ?? "Draft"}
                              {inv.billingModel && (
                                <span className="ml-1.5 text-xs text-muted-foreground/60">
                                  ({inv.billingModel.replace(/_/g, " ")})
                                </span>
                              )}
                            </td>
                            <td className="px-3 py-2 text-right tabular-nums font-medium">
                              {formatCurrency(inv.total)}
                            </td>
                            <td className="px-3 py-2 text-right tabular-nums text-muted-foreground">
                              {inv.paidAt ?? "—"}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            </div>
          )}

          {!isLoadingDetail && !drawerDetail && drawerCustomerId && (
            <p className="text-sm text-muted-foreground italic">
              No data available for this customer
            </p>
          )}
        </SheetContent>
      </Sheet>

    </div>
  )
}
