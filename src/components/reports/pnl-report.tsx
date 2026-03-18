"use client"

import { useState, useTransition } from "react"
import { DownloadIcon, Trash2Icon } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Separator } from "@/components/ui/separator"
import { cn } from "@/lib/utils"
import { getPnlReport, exportFinancialCsv } from "@/actions/reports"
import { getExpenses, deleteExpense } from "@/actions/expenses"
import { ExpenseEntryForm } from "./expense-entry-form"
import type { PnlResult } from "@/actions/reports"

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function formatCurrency(value: number): string {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: 2,
  }).format(value)
}

function downloadCsv(csv: string, filename: string) {
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" })
  const url = URL.createObjectURL(blob)
  const a = document.createElement("a")
  a.href = url
  a.download = filename
  document.body.appendChild(a)
  a.click()
  document.body.removeChild(a)
  URL.revokeObjectURL(url)
}

const MODEL_LABELS: Record<string, string> = {
  per_stop: "Per Stop",
  flat_rate: "Flat Rate",
  plus_chemicals: "Plus Chemicals",
  custom: "Custom",
}

const CATEGORY_LABELS: Record<string, string> = {
  chemicals: "Chemicals",
  fuel: "Fuel",
  equipment: "Equipment",
  labor: "Labor",
  insurance: "Insurance",
  marketing: "Marketing",
  office: "Office",
  vehicle: "Vehicle",
  other: "Other",
}

function formatMonth(month: string): string {
  const [year, m] = month.split("-")
  const date = new Date(parseInt(year), parseInt(m) - 1)
  return date.toLocaleDateString("en-US", { month: "short", year: "numeric" })
}

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface ExpenseRow {
  id: string
  amount: string
  category: string
  description: string | null
  date: string
  created_by_name: string | null
  created_at: Date
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

interface PnlReportProps {
  initialData: PnlResult
  initialExpenses: ExpenseRow[]
  defaultStartDate: string
  defaultEndDate: string
  isOwner: boolean
}

export function PnlReport({
  initialData,
  initialExpenses,
  defaultStartDate,
  defaultEndDate,
  isOwner,
}: PnlReportProps) {
  const [data, setData] = useState<PnlResult>(initialData)
  const [recentExpenses, setRecentExpenses] = useState<ExpenseRow[]>(initialExpenses)
  const [startDate, setStartDate] = useState(defaultStartDate)
  const [endDate, setEndDate] = useState(defaultEndDate)
  const [isPending, startTransition] = useTransition()
  const [isExportingPayments, startPaymentsExport] = useTransition()
  const [isExportingExpenses, startExpensesExport] = useTransition()
  const [deletingId, setDeletingId] = useState<string | null>(null)

  function refreshData(start: string, end: string) {
    startTransition(async () => {
      const [pnl, exp] = await Promise.all([
        getPnlReport(start, end),
        getExpenses(start, end),
      ])
      setData(pnl)
      setRecentExpenses(exp)
    })
  }

  function handleDateChange(start: string, end: string) {
    setStartDate(start)
    setEndDate(end)
    refreshData(start, end)
  }

  function handleExportPayments() {
    startPaymentsExport(async () => {
      const result = await exportFinancialCsv("payments", startDate, endDate)
      if (result.success && result.csv) {
        downloadCsv(result.csv, `payments-${startDate}-to-${endDate}.csv`)
      }
    })
  }

  function handleExportExpenses() {
    startExpensesExport(async () => {
      const result = await exportFinancialCsv("expenses", startDate, endDate)
      if (result.success && result.csv) {
        downloadCsv(result.csv, `expenses-${startDate}-to-${endDate}.csv`)
      }
    })
  }

  async function handleDeleteExpense(expenseId: string) {
    setDeletingId(expenseId)
    const result = await deleteExpense(expenseId)
    if (result.success) {
      refreshData(startDate, endDate)
    }
    setDeletingId(null)
  }

  // Merge revenue & expense months for the monthly table
  const allMonths = new Set<string>()
  data.revenue.byMonth.forEach((m) => allMonths.add(m.month))
  data.expenses.byMonth.forEach((m) => allMonths.add(m.month))
  const sortedMonths = Array.from(allMonths).sort()

  const revenueByMonthMap = new Map(
    data.revenue.byMonth.map((m) => [m.month, m.total])
  )
  const expenseByMonthMap = new Map(
    data.expenses.byMonth.map((m) => [m.month, m.total])
  )

  return (
    <div className="flex flex-col gap-6">
      {/* Date range and export */}
      <div className="flex flex-col sm:flex-row items-start sm:items-end gap-3">
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="pnl-start" className="text-xs text-muted-foreground">
            Start Date
          </Label>
          <Input
            id="pnl-start"
            type="date"
            value={startDate}
            onChange={(e) => handleDateChange(e.target.value, endDate)}
            className="w-40"
          />
        </div>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="pnl-end" className="text-xs text-muted-foreground">
            End Date
          </Label>
          <Input
            id="pnl-end"
            type="date"
            value={endDate}
            onChange={(e) => handleDateChange(startDate, e.target.value)}
            className="w-40"
          />
        </div>
        <div className="flex-1" />
        <div className="flex gap-2">
          <ExpenseEntryForm
            onExpenseCreated={() => refreshData(startDate, endDate)}
          />
          {isOwner && (
            <>
              <Button
                variant="outline"
                size="sm"
                onClick={handleExportPayments}
                disabled={isExportingPayments}
              >
                <DownloadIcon className="h-3.5 w-3.5 mr-1.5" />
                {isExportingPayments ? "..." : "Payments CSV"}
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={handleExportExpenses}
                disabled={isExportingExpenses}
              >
                <DownloadIcon className="h-3.5 w-3.5 mr-1.5" />
                {isExportingExpenses ? "..." : "Expenses CSV"}
              </Button>
            </>
          )}
        </div>
      </div>

      {/* Loading indicator */}
      {isPending && (
        <p className="text-xs text-muted-foreground animate-pulse">
          Loading...
        </p>
      )}

      {/* ── Net Income Summary ──────────────────────────────────────────── */}
      <div className="grid gap-4 sm:grid-cols-3">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              Revenue
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-bold text-emerald-500 tabular-nums">
              {formatCurrency(data.revenue.total)}
            </p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              Expenses
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-bold text-red-400 tabular-nums">
              {formatCurrency(data.expenses.total)}
            </p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              Net Income
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p
              className={cn(
                "text-2xl font-bold tabular-nums",
                data.netIncome >= 0 ? "text-emerald-500" : "text-red-400"
              )}
            >
              {formatCurrency(data.netIncome)}
            </p>
          </CardContent>
        </Card>
      </div>

      {/* ── Revenue Breakdown ──────────────────────────────────────────── */}
      {data.revenue.byModel.length > 0 && (
        <div className="space-y-3">
          <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
            Revenue by Billing Model
          </p>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            {data.revenue.byModel.map((item) => (
              <Card key={item.model}>
                <CardContent className="pt-4 pb-3 px-4">
                  <p className="text-xs text-muted-foreground">
                    {MODEL_LABELS[item.model] ?? item.model}
                  </p>
                  <p className="text-lg font-semibold tabular-nums mt-0.5">
                    {formatCurrency(item.total)}
                  </p>
                </CardContent>
              </Card>
            ))}
          </div>
        </div>
      )}

      {/* ── Expense Breakdown ──────────────────────────────────────────── */}
      {data.expenses.byCategory.length > 0 && (
        <div className="space-y-3">
          <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
            Expenses by Category
          </p>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            {data.expenses.byCategory.map((item) => (
              <Card key={item.category}>
                <CardContent className="pt-4 pb-3 px-4">
                  <p className="text-xs text-muted-foreground">
                    {CATEGORY_LABELS[item.category] ?? item.category}
                  </p>
                  <p className="text-lg font-semibold tabular-nums mt-0.5">
                    {formatCurrency(item.total)}
                  </p>
                </CardContent>
              </Card>
            ))}
          </div>
        </div>
      )}

      {/* ── Monthly Breakdown Table ────────────────────────────────────── */}
      {sortedMonths.length > 0 && (
        <div className="space-y-3">
          <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
            Monthly Breakdown
          </p>
          <div className="overflow-x-auto rounded-lg border border-border">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border bg-muted/30">
                  <th className="px-4 py-3 text-left font-medium text-muted-foreground">
                    Month
                  </th>
                  <th className="px-4 py-3 text-right font-medium text-muted-foreground">
                    Revenue
                  </th>
                  <th className="px-4 py-3 text-right font-medium text-muted-foreground">
                    Expenses
                  </th>
                  <th className="px-4 py-3 text-right font-medium text-muted-foreground">
                    Net
                  </th>
                </tr>
              </thead>
              <tbody>
                {sortedMonths.map((month) => {
                  const rev = revenueByMonthMap.get(month) ?? 0
                  const exp = expenseByMonthMap.get(month) ?? 0
                  const net = rev - exp
                  return (
                    <tr
                      key={month}
                      className="border-b border-border/50 hover:bg-muted/10 transition-colors"
                    >
                      <td className="px-4 py-2.5 font-medium">
                        {formatMonth(month)}
                      </td>
                      <td className="px-4 py-2.5 text-right tabular-nums text-emerald-500">
                        {formatCurrency(rev)}
                      </td>
                      <td className="px-4 py-2.5 text-right tabular-nums text-red-400">
                        {formatCurrency(exp)}
                      </td>
                      <td
                        className={cn(
                          "px-4 py-2.5 text-right tabular-nums font-medium",
                          net >= 0 ? "text-emerald-500" : "text-red-400"
                        )}
                      >
                        {formatCurrency(net)}
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      <Separator />

      {/* ── Recent Expenses ────────────────────────────────────────────── */}
      <div className="space-y-3">
        <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
          Recent Expenses
        </p>
        {recentExpenses.length === 0 ? (
          <p className="text-sm text-muted-foreground italic">
            No expenses recorded for this period
          </p>
        ) : (
          <div className="overflow-x-auto rounded-lg border border-border">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border bg-muted/30">
                  <th className="px-4 py-3 text-left font-medium text-muted-foreground">
                    Date
                  </th>
                  <th className="px-4 py-3 text-left font-medium text-muted-foreground">
                    Category
                  </th>
                  <th className="px-4 py-3 text-right font-medium text-muted-foreground">
                    Amount
                  </th>
                  <th className="px-4 py-3 text-left font-medium text-muted-foreground">
                    Description
                  </th>
                  {isOwner && (
                    <th className="px-4 py-3 text-right font-medium text-muted-foreground w-16">
                      &nbsp;
                    </th>
                  )}
                </tr>
              </thead>
              <tbody>
                {recentExpenses.slice(0, 10).map((expense) => (
                  <tr
                    key={expense.id}
                    className="border-b border-border/50 hover:bg-muted/10 transition-colors"
                  >
                    <td className="px-4 py-2.5 tabular-nums">
                      {expense.date}
                    </td>
                    <td className="px-4 py-2.5">
                      {CATEGORY_LABELS[expense.category] ?? expense.category}
                    </td>
                    <td className="px-4 py-2.5 text-right tabular-nums font-medium">
                      {formatCurrency(parseFloat(expense.amount))}
                    </td>
                    <td className="px-4 py-2.5 text-muted-foreground truncate max-w-[200px]">
                      {expense.description || "--"}
                    </td>
                    {isOwner && (
                      <td className="px-4 py-2.5 text-right">
                        <button
                          type="button"
                          onClick={() => handleDeleteExpense(expense.id)}
                          disabled={deletingId === expense.id}
                          className="inline-flex items-center justify-center h-7 w-7 rounded text-muted-foreground hover:text-destructive hover:bg-destructive/10 transition-colors cursor-pointer disabled:opacity-50"
                          aria-label="Delete expense"
                        >
                          <Trash2Icon className="h-3.5 w-3.5" />
                        </button>
                      </td>
                    )}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  )
}
