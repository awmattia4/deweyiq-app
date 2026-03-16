"use client"

/**
 * FinancialDashboard — Accounting page with simplified + accountant mode views.
 *
 * Tabs: Overview | P&L | Balance Sheet | Cash Flow | Journal Entries (accountant) | Chart of Accounts (accountant)
 *
 * Simplified view is the default. Owner can enable accountant mode to reveal
 * full double-entry detail, journal entries, and chart of accounts.
 *
 * Accounting never feels like "accounting software" to a pool company owner.
 */

import { useState, useTransition } from "react"
import {
  TrendingUpIcon,
  TrendingDownIcon,
  MinusIcon,
  AlertCircleIcon,
  RefreshCwIcon,
} from "lucide-react"
import { cn } from "@/lib/utils"
import { toast } from "sonner"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Switch } from "@/components/ui/switch"
import { Label } from "@/components/ui/label"
import { Button } from "@/components/ui/button"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { Input } from "@/components/ui/input"
import { Badge } from "@/components/ui/badge"
import { JournalEntryList } from "./journal-entry-list"
import { ChartOfAccountsEditor } from "./chart-of-accounts-editor"
import { BankFeed } from "./bank-feed"
import {
  getProfitAndLoss,
  getBalanceSheet,
  getCashFlowStatement,
  getFinancialSnapshot,
} from "@/actions/financial-reports"
import { getChartOfAccounts, getJournalEntries } from "@/actions/accounting"
import type {
  ProfitAndLoss,
  BalanceSheet,
  CashFlowStatement,
  FinancialSnapshot,
  ReportSection,
} from "@/actions/financial-reports"
import type { AccountRow, JournalEntryRow } from "@/actions/accounting"

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface BankAccountForFeed {
  id: string
  account_name: string
  institution_name: string | null
  mask: string | null
  account_type: string
}

interface FinancialDashboardProps {
  snapshot: FinancialSnapshot | null
  accountantModeEnabled: boolean
  isOwner: boolean
  bankAccounts?: BankAccountForFeed[]
}

// ---------------------------------------------------------------------------
// Date range helpers
// ---------------------------------------------------------------------------

type DateRangePreset = "this_month" | "last_month" | "this_quarter" | "this_year" | "custom"

function getDateRange(preset: DateRangePreset): { start: string; end: string } {
  const now = new Date()
  const year = now.getFullYear()
  const month = now.getMonth() + 1

  switch (preset) {
    case "this_month":
      return {
        start: `${year}-${String(month).padStart(2, "0")}-01`,
        end: `${year}-${String(month).padStart(2, "0")}-${String(
          new Date(year, month, 0).getDate()
        ).padStart(2, "0")}`,
      }
    case "last_month": {
      const lm = month === 1 ? 12 : month - 1
      const lmYear = month === 1 ? year - 1 : year
      const lmLastDay = new Date(lmYear, lm, 0).getDate()
      return {
        start: `${lmYear}-${String(lm).padStart(2, "0")}-01`,
        end: `${lmYear}-${String(lm).padStart(2, "0")}-${String(lmLastDay).padStart(2, "0")}`,
      }
    }
    case "this_quarter": {
      const q = Math.floor((month - 1) / 3)
      const qStart = q * 3 + 1
      const qEnd = qStart + 2
      const qLastDay = new Date(year, qEnd, 0).getDate()
      return {
        start: `${year}-${String(qStart).padStart(2, "0")}-01`,
        end: `${year}-${String(qEnd).padStart(2, "0")}-${String(qLastDay).padStart(2, "0")}`,
      }
    }
    case "this_year":
      return {
        start: `${year}-01-01`,
        end: `${year}-12-31`,
      }
    case "custom":
    default:
      return {
        start: `${year}-${String(month).padStart(2, "0")}-01`,
        end: `${year}-${String(month).padStart(2, "0")}-${String(
          new Date(year, month, 0).getDate()
        ).padStart(2, "0")}`,
      }
  }
}

// ---------------------------------------------------------------------------
// Currency formatters
// ---------------------------------------------------------------------------

function formatCurrency(amount: number, opts?: { alwaysSign?: boolean }): string {
  const formatted = new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
  }).format(Math.abs(amount))

  if (opts?.alwaysSign) {
    return amount >= 0 ? `+${formatted}` : `-${formatted}`
  }
  return amount < 0 ? `-${formatted}` : formatted
}

function formatPct(pct: number): string {
  return `${pct >= 0 ? "+" : ""}${pct.toFixed(1)}%`
}

// ---------------------------------------------------------------------------
// KPI Card component
// ---------------------------------------------------------------------------

interface KpiCardProps {
  label: string
  value: string
  trend?: {
    label: string
    pct: number | null
  }
  variant?: "default" | "profit" | "loss" | "neutral"
}

function KpiCard({ label, value, trend, variant = "default" }: KpiCardProps) {
  const valueColor =
    variant === "profit"
      ? "text-green-400"
      : variant === "loss"
        ? "text-destructive"
        : "text-foreground"

  return (
    <div className="rounded-lg border border-border bg-card p-5">
      <p className="text-sm text-muted-foreground">{label}</p>
      <p className={cn("mt-1 text-2xl font-bold tabular-nums", valueColor)}>{value}</p>
      {trend && trend.pct !== null && (
        <div className="mt-1 flex items-center gap-1">
          {trend.pct > 0 ? (
            <TrendingUpIcon className="h-3.5 w-3.5 text-green-400" />
          ) : trend.pct < 0 ? (
            <TrendingDownIcon className="h-3.5 w-3.5 text-destructive" />
          ) : (
            <MinusIcon className="h-3.5 w-3.5 text-muted-foreground" />
          )}
          <span
            className={cn(
              "text-xs",
              trend.pct > 0
                ? "text-green-400"
                : trend.pct < 0
                  ? "text-destructive"
                  : "text-muted-foreground"
            )}
          >
            {formatPct(trend.pct)} {trend.label}
          </span>
        </div>
      )}
    </div>
  )
}

// ---------------------------------------------------------------------------
// Report section component (simplified view)
// ---------------------------------------------------------------------------

function ReportSectionView({
  section,
  accountantMode,
}: {
  section: ReportSection
  accountantMode: boolean
}) {
  if (section.accounts.length === 0) {
    return (
      <div className="text-sm text-muted-foreground italic py-2">
        No activity in this period
      </div>
    )
  }

  return (
    <div className="space-y-1">
      {section.accounts.map((account) => (
        <div key={account.accountId} className="flex items-center justify-between py-1 text-sm">
          <div>
            {accountantMode && (
              <span className="font-mono text-xs text-muted-foreground mr-2">
                {account.accountNumber}
              </span>
            )}
            <span>{accountantMode ? account.accountName : account.displayName}</span>
          </div>
          <span className="tabular-nums font-medium">
            {formatCurrency(account.amount)}
          </span>
        </div>
      ))}
    </div>
  )
}

// ---------------------------------------------------------------------------
// Main FinancialDashboard component
// ---------------------------------------------------------------------------

export function FinancialDashboard({
  snapshot: initialSnapshot,
  accountantModeEnabled: initialAccountantMode,
  isOwner,
  bankAccounts = [],
}: FinancialDashboardProps) {
  const [accountantMode, setAccountantMode] = useState(initialAccountantMode)
  const [snapshot, setSnapshot] = useState(initialSnapshot)
  const [isPending, startTransition] = useTransition()

  // P&L state
  const [plPreset, setPlPreset] = useState<DateRangePreset>("this_month")
  const [plCustomStart, setPlCustomStart] = useState("")
  const [plCustomEnd, setPlCustomEnd] = useState("")
  const [pl, setPl] = useState<ProfitAndLoss | null>(null)
  const [plLoading, setPlLoading] = useState(false)

  // Balance Sheet state
  const today = new Date()
  const [bsDate, setBsDate] = useState(
    `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, "0")}-${String(today.getDate()).padStart(2, "0")}`
  )
  const [bs, setBs] = useState<BalanceSheet | null>(null)
  const [bsLoading, setBsLoading] = useState(false)

  // Cash Flow state
  const [cfPreset, setCfPreset] = useState<DateRangePreset>("this_month")
  const [cfCustomStart, setCfCustomStart] = useState("")
  const [cfCustomEnd, setCfCustomEnd] = useState("")
  const [cf, setCf] = useState<CashFlowStatement | null>(null)
  const [cfLoading, setCfLoading] = useState(false)

  // Journal entries state (lazy loaded)
  const [journalEntries, setJournalEntries] = useState<JournalEntryRow[] | null>(null)
  const [jeLoading, setJeLoading] = useState(false)

  // Chart of accounts state (lazy loaded)
  const [accounts, setAccounts] = useState<AccountRow[] | null>(null)
  const [coaLoading, setCoaLoading] = useState(false)

  function refreshSnapshot() {
    startTransition(async () => {
      const result = await getFinancialSnapshot()
      if (result.success) {
        setSnapshot(result.data)
      }
    })
  }

  async function loadPL() {
    const range =
      plPreset === "custom"
        ? { start: plCustomStart, end: plCustomEnd }
        : getDateRange(plPreset)
    if (!range.start || !range.end) {
      toast.error("Please select a date range")
      return
    }
    setPlLoading(true)
    try {
      const result = await getProfitAndLoss(range.start, range.end)
      if (result.success) {
        setPl(result.data)
      } else {
        toast.error(result.error)
      }
    } finally {
      setPlLoading(false)
    }
  }

  async function loadBS() {
    if (!bsDate) return
    setBsLoading(true)
    try {
      const result = await getBalanceSheet(bsDate)
      if (result.success) {
        setBs(result.data)
      } else {
        toast.error(result.error)
      }
    } finally {
      setBsLoading(false)
    }
  }

  async function loadCF() {
    const range =
      cfPreset === "custom"
        ? { start: cfCustomStart, end: cfCustomEnd }
        : getDateRange(cfPreset)
    if (!range.start || !range.end) {
      toast.error("Please select a date range")
      return
    }
    setCfLoading(true)
    try {
      const result = await getCashFlowStatement(range.start, range.end)
      if (result.success) {
        setCf(result.data)
      } else {
        toast.error(result.error)
      }
    } finally {
      setCfLoading(false)
    }
  }

  async function loadJournalEntries() {
    if (journalEntries !== null) return
    setJeLoading(true)
    try {
      const [jeResult, coaResult] = await Promise.all([
        getJournalEntries({ limit: 100 }),
        getChartOfAccounts(),
      ])
      if (jeResult.success) setJournalEntries(jeResult.entries)
      if (coaResult.success && accounts === null) setAccounts(coaResult.accounts)
    } finally {
      setJeLoading(false)
    }
  }

  async function loadChartOfAccounts() {
    if (accounts !== null) return
    setCoaLoading(true)
    try {
      const result = await getChartOfAccounts()
      if (result.success) {
        setAccounts(result.accounts)
      } else {
        toast.error(result.error)
      }
    } finally {
      setCoaLoading(false)
    }
  }

  function handleTabChange(value: string) {
    if (value === "journal" && journalEntries === null) {
      void loadJournalEntries()
    }
    if (value === "coa" && accounts === null) {
      void loadChartOfAccounts()
    }
    if (value === "pl" && pl === null) {
      void loadPL()
    }
    if (value === "bs" && bs === null) {
      void loadBS()
    }
    if (value === "cf" && cf === null) {
      void loadCF()
    }
  }

  const accountantTabsVisible = accountantMode

  return (
    <div className="space-y-6">
      {/* Accountant mode toggle */}
      <div className="flex items-center gap-3 rounded-lg border border-border bg-muted/30 px-4 py-3">
        <Switch
          id="accountant-mode"
          checked={accountantMode}
          onCheckedChange={setAccountantMode}
        />
        <Label htmlFor="accountant-mode" className="text-sm cursor-pointer">
          Accountant Mode
        </Label>
        <span className="text-xs text-muted-foreground">
          {accountantMode
            ? "Showing full double-entry detail, journal entries, and chart of accounts"
            : "Simplified view — toggle to reveal accounting detail for CPA handoff"}
        </span>
      </div>

      {/* Tabs */}
      <Tabs defaultValue="overview" onValueChange={handleTabChange}>
        <TabsList className="flex-wrap h-auto gap-1 p-1">
          <TabsTrigger value="overview">Overview</TabsTrigger>
          <TabsTrigger value="pl">Profit & Loss</TabsTrigger>
          <TabsTrigger value="bs">Balance Sheet</TabsTrigger>
          <TabsTrigger value="cf">Cash Flow</TabsTrigger>
          {/* Bank Feed tab — shown to owners who have Plaid connected */}
          {isOwner && (
            <TabsTrigger value="bank-feed">Bank Feed</TabsTrigger>
          )}
          {accountantTabsVisible && (
            <>
              <TabsTrigger value="journal">Journal Entries</TabsTrigger>
              <TabsTrigger value="coa">Chart of Accounts</TabsTrigger>
            </>
          )}
        </TabsList>

        {/* ── Overview tab ───────────────────────────────────────────────── */}
        <TabsContent value="overview" className="space-y-6 mt-6">
          {/* KPI cards */}
          <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
            <KpiCard
              label="Revenue This Month"
              value={formatCurrency(snapshot?.monthRevenue ?? 0)}
              trend={
                snapshot?.revenueChangePct !== undefined
                  ? { label: "vs last month", pct: snapshot.revenueChangePct }
                  : undefined
              }
              variant={snapshot?.monthRevenue ? "profit" : "neutral"}
            />
            <KpiCard
              label="Expenses This Month"
              value={formatCurrency(snapshot?.monthExpenses ?? 0)}
              variant="neutral"
            />
            <KpiCard
              label="Net Profit"
              value={formatCurrency(snapshot?.monthProfit ?? 0)}
              variant={
                (snapshot?.monthProfit ?? 0) > 0
                  ? "profit"
                  : (snapshot?.monthProfit ?? 0) < 0
                    ? "loss"
                    : "neutral"
              }
            />
            <KpiCard
              label="Cash Position"
              value={formatCurrency(snapshot?.cashPosition ?? 0)}
              variant="neutral"
            />
          </div>

          {/* Secondary metrics */}
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div className="rounded-lg border border-border bg-card p-5">
              <h3 className="text-sm font-medium text-muted-foreground mb-3">Outstanding Balances</h3>
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <span className="text-sm">Accounts Receivable</span>
                  <span className="font-medium tabular-nums">
                    {formatCurrency(snapshot?.arBalance ?? 0)}
                  </span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-sm">Accounts Payable</span>
                  <span className="font-medium tabular-nums">
                    {formatCurrency(snapshot?.apBalance ?? 0)}
                  </span>
                </div>
              </div>
            </div>

            <div className="rounded-lg border border-border bg-card p-5">
              <h3 className="text-sm font-medium text-muted-foreground mb-3">Month Comparison</h3>
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <span className="text-sm">Prior Month Revenue</span>
                  <span className="font-medium tabular-nums">
                    {formatCurrency(snapshot?.priorMonthRevenue ?? 0)}
                  </span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-sm">Prior Month Expenses</span>
                  <span className="font-medium tabular-nums">
                    {formatCurrency(snapshot?.priorMonthExpenses ?? 0)}
                  </span>
                </div>
              </div>
            </div>
          </div>

          <div className="flex justify-end">
            <Button size="sm" variant="ghost" onClick={refreshSnapshot} disabled={isPending}>
              <RefreshCwIcon className={cn("h-4 w-4 mr-1.5", isPending && "animate-spin")} />
              Refresh
            </Button>
          </div>
        </TabsContent>

        {/* ── Profit & Loss tab ──────────────────────────────────────────── */}
        <TabsContent value="pl" className="space-y-6 mt-6">
          {/* Date range picker */}
          <div className="flex flex-wrap items-center gap-3">
            <Select value={plPreset} onValueChange={(v) => setPlPreset(v as DateRangePreset)}>
              <SelectTrigger className="w-40 h-9">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="this_month">This Month</SelectItem>
                <SelectItem value="last_month">Last Month</SelectItem>
                <SelectItem value="this_quarter">This Quarter</SelectItem>
                <SelectItem value="this_year">This Year</SelectItem>
                <SelectItem value="custom">Custom Range</SelectItem>
              </SelectContent>
            </Select>
            {plPreset === "custom" && (
              <>
                <Input
                  type="date"
                  value={plCustomStart}
                  onChange={(e) => setPlCustomStart(e.target.value)}
                  className="w-40 h-9 text-sm"
                />
                <span className="text-sm text-muted-foreground">to</span>
                <Input
                  type="date"
                  value={plCustomEnd}
                  onChange={(e) => setPlCustomEnd(e.target.value)}
                  className="w-40 h-9 text-sm"
                />
              </>
            )}
            <Button size="sm" variant="outline" onClick={loadPL} disabled={plLoading}>
              {plLoading ? "Loading..." : "Load Report"}
            </Button>
          </div>

          {!pl ? (
            <div className="rounded-lg border border-border p-8 text-center text-sm text-muted-foreground">
              Select a date range and click Load Report
            </div>
          ) : (
            <div className="space-y-4">
              {/* P&L report */}
              <div className="rounded-lg border border-border bg-card overflow-hidden">
                {/* Income section */}
                <div className="px-5 py-4">
                  <div className="flex items-center justify-between mb-3">
                    <h3 className="font-semibold">{pl.income.label}</h3>
                    <span className="font-semibold tabular-nums text-green-400">
                      {formatCurrency(pl.income.total)}
                    </span>
                  </div>
                  <ReportSectionView section={pl.income} accountantMode={accountantMode} />
                </div>

                <div className="border-t border-border" />

                {/* Expense section */}
                <div className="px-5 py-4">
                  <div className="flex items-center justify-between mb-3">
                    <h3 className="font-semibold">{pl.expenses.label}</h3>
                    <span className="font-semibold tabular-nums text-destructive">
                      {formatCurrency(pl.expenses.total)}
                    </span>
                  </div>
                  <ReportSectionView section={pl.expenses} accountantMode={accountantMode} />
                </div>

                <div className="border-t border-border bg-muted/30" />

                {/* Net profit */}
                <div className="px-5 py-4 flex items-center justify-between">
                  <h3 className="font-bold text-lg">
                    {pl.isProfit ? "Net Profit" : "Net Loss"}
                  </h3>
                  <span
                    className={cn(
                      "text-xl font-bold tabular-nums",
                      pl.isProfit ? "text-green-400" : "text-destructive"
                    )}
                  >
                    {formatCurrency(pl.netProfit)}
                  </span>
                </div>
              </div>
            </div>
          )}
        </TabsContent>

        {/* ── Balance Sheet tab ──────────────────────────────────────────── */}
        <TabsContent value="bs" className="space-y-6 mt-6">
          {/* As-of date picker */}
          <div className="flex items-center gap-3">
            <span className="text-sm text-muted-foreground">As of:</span>
            <Input
              type="date"
              value={bsDate}
              onChange={(e) => setBsDate(e.target.value)}
              className="w-40 h-9 text-sm"
            />
            <Button size="sm" variant="outline" onClick={loadBS} disabled={bsLoading}>
              {bsLoading ? "Loading..." : "Load Report"}
            </Button>
          </div>

          {!bs ? (
            <div className="rounded-lg border border-border p-8 text-center text-sm text-muted-foreground">
              Select a date and click Load Report
            </div>
          ) : (
            <div className="space-y-4">
              {/* Balance check */}
              {!bs.isBalanced && (
                <div className="flex items-center gap-2 rounded-lg border border-destructive/30 bg-destructive/10 px-4 py-3 text-sm text-destructive">
                  <AlertCircleIcon className="h-4 w-4 shrink-0" />
                  Balance sheet does not balance. This may indicate missing journal entries.
                </div>
              )}

              <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
                {/* Assets */}
                <div className="rounded-lg border border-border bg-card overflow-hidden">
                  <div className="px-5 py-4">
                    <div className="flex items-center justify-between mb-3">
                      <h3 className="font-semibold">Assets</h3>
                      <span className="font-semibold tabular-nums">
                        {formatCurrency(bs.assets.total)}
                      </span>
                    </div>
                    <ReportSectionView section={bs.assets} accountantMode={accountantMode} />
                  </div>
                </div>

                {/* Liabilities + Equity */}
                <div className="space-y-4">
                  <div className="rounded-lg border border-border bg-card overflow-hidden">
                    <div className="px-5 py-4">
                      <div className="flex items-center justify-between mb-3">
                        <h3 className="font-semibold">Liabilities</h3>
                        <span className="font-semibold tabular-nums">
                          {formatCurrency(bs.liabilities.total)}
                        </span>
                      </div>
                      <ReportSectionView section={bs.liabilities} accountantMode={accountantMode} />
                    </div>
                  </div>

                  <div className="rounded-lg border border-border bg-card overflow-hidden">
                    <div className="px-5 py-4">
                      <div className="flex items-center justify-between mb-3">
                        <h3 className="font-semibold">Equity</h3>
                        <span className="font-semibold tabular-nums">
                          {formatCurrency(bs.equity.total)}
                        </span>
                      </div>
                      <ReportSectionView section={bs.equity} accountantMode={accountantMode} />
                      {/* Net income as equity component */}
                      {Math.abs(bs.netIncome) > 0.001 && (
                        <div className="flex items-center justify-between py-1 text-sm mt-1">
                          <span>Net Income (YTD)</span>
                          <span
                            className={cn(
                              "tabular-nums font-medium",
                              bs.netIncome >= 0 ? "text-green-400" : "text-destructive"
                            )}
                          >
                            {formatCurrency(bs.netIncome)}
                          </span>
                        </div>
                      )}
                    </div>
                  </div>

                  {/* Total L + E */}
                  <div className="rounded-lg border border-border bg-muted/30 px-5 py-3 flex items-center justify-between">
                    <span className="font-semibold text-sm">Total Liabilities & Equity</span>
                    <span className="font-semibold tabular-nums">
                      {formatCurrency(bs.totalLiabilitiesAndEquity)}
                    </span>
                  </div>
                </div>
              </div>
            </div>
          )}
        </TabsContent>

        {/* ── Cash Flow tab ──────────────────────────────────────────────── */}
        <TabsContent value="cf" className="space-y-6 mt-6">
          {/* Date range picker */}
          <div className="flex flex-wrap items-center gap-3">
            <Select value={cfPreset} onValueChange={(v) => setCfPreset(v as DateRangePreset)}>
              <SelectTrigger className="w-40 h-9">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="this_month">This Month</SelectItem>
                <SelectItem value="last_month">Last Month</SelectItem>
                <SelectItem value="this_quarter">This Quarter</SelectItem>
                <SelectItem value="this_year">This Year</SelectItem>
                <SelectItem value="custom">Custom Range</SelectItem>
              </SelectContent>
            </Select>
            {cfPreset === "custom" && (
              <>
                <Input
                  type="date"
                  value={cfCustomStart}
                  onChange={(e) => setCfCustomStart(e.target.value)}
                  className="w-40 h-9 text-sm"
                />
                <span className="text-sm text-muted-foreground">to</span>
                <Input
                  type="date"
                  value={cfCustomEnd}
                  onChange={(e) => setCfCustomEnd(e.target.value)}
                  className="w-40 h-9 text-sm"
                />
              </>
            )}
            <Button size="sm" variant="outline" onClick={loadCF} disabled={cfLoading}>
              {cfLoading ? "Loading..." : "Load Report"}
            </Button>
          </div>

          {!cf ? (
            <div className="rounded-lg border border-border p-8 text-center text-sm text-muted-foreground">
              Select a date range and click Load Report
            </div>
          ) : (
            <div className="space-y-4">
              {/* Opening position */}
              <div className="rounded-lg border border-border bg-muted/30 px-5 py-3 flex items-center justify-between">
                <span className="text-sm font-medium">Opening Cash Position</span>
                <span className="font-semibold tabular-nums">{formatCurrency(cf.openingCash)}</span>
              </div>

              {/* Three sections */}
              {[cf.operating, cf.investing, cf.financing].map((section) => (
                <div key={section.label} className="rounded-lg border border-border bg-card overflow-hidden">
                  <div className="px-5 py-4">
                    <div className="flex items-center justify-between mb-3">
                      <h3 className="font-semibold">{section.label}</h3>
                      <span
                        className={cn(
                          "font-semibold tabular-nums",
                          section.total > 0
                            ? "text-green-400"
                            : section.total < 0
                              ? "text-destructive"
                              : "text-muted-foreground"
                        )}
                      >
                        {formatCurrency(section.total, { alwaysSign: true })}
                      </span>
                    </div>
                    {section.items.length === 0 ? (
                      <p className="text-sm text-muted-foreground italic">
                        No activity in this period
                      </p>
                    ) : (
                      <div className="space-y-1">
                        {section.items.map((item, i) => (
                          <div key={i} className="flex items-center justify-between text-sm py-0.5">
                            <span>{item.description}</span>
                            <span
                              className={cn(
                                "tabular-nums",
                                item.amount > 0 ? "text-green-400" : "text-destructive"
                              )}
                            >
                              {formatCurrency(item.amount, { alwaysSign: true })}
                            </span>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                </div>
              ))}

              {/* Net change + closing */}
              <div className="rounded-lg border border-border bg-muted/30 px-5 py-4 space-y-2">
                <div className="flex items-center justify-between text-sm">
                  <span>Net Cash Change</span>
                  <span
                    className={cn(
                      "font-medium tabular-nums",
                      cf.netCashChange >= 0 ? "text-green-400" : "text-destructive"
                    )}
                  >
                    {formatCurrency(cf.netCashChange, { alwaysSign: true })}
                  </span>
                </div>
                <div className="flex items-center justify-between border-t border-border pt-2">
                  <span className="font-semibold">Closing Cash Position</span>
                  <span className="font-bold tabular-nums text-lg">
                    {formatCurrency(cf.closingCash)}
                  </span>
                </div>
              </div>
            </div>
          )}
        </TabsContent>

        {/* ── Bank Feed / Reconciliation tab ────────────────────────────── */}
        {isOwner && (
          <TabsContent value="bank-feed" className="mt-6">
            <BankFeed bankAccounts={bankAccounts} />
          </TabsContent>
        )}

        {/* ── Journal Entries tab (accountant mode) ─────────────────────── */}
        {accountantTabsVisible && (
          <TabsContent value="journal" className="mt-6">
            {jeLoading ? (
              <div className="text-center text-sm text-muted-foreground py-8">
                Loading journal entries...
              </div>
            ) : (
              <JournalEntryList
                initialEntries={journalEntries ?? []}
                accounts={accounts ?? []}
                accountantModeEnabled={initialAccountantMode}
                isOwner={isOwner}
              />
            )}
          </TabsContent>
        )}

        {/* ── Chart of Accounts tab (accountant mode) ───────────────────── */}
        {accountantTabsVisible && (
          <TabsContent value="coa" className="mt-6">
            {coaLoading ? (
              <div className="text-center text-sm text-muted-foreground py-8">
                Loading accounts...
              </div>
            ) : (
              <ChartOfAccountsEditor
                accounts={accounts ?? []}
                isOwner={isOwner}
                onRefresh={() => {
                  setAccounts(null)
                  void loadChartOfAccounts()
                }}
              />
            )}
          </TabsContent>
        )}
      </Tabs>
    </div>
  )
}
