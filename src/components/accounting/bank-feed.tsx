"use client"

/**
 * BankFeed — Bank transaction list with reconciliation status and actions.
 *
 * Displays bank transactions for a connected bank account with color-coded
 * match status. Supports filtering, auto-matching, and opening the reconcile panel.
 *
 * Status colors:
 *   matched = green
 *   suggested = amber
 *   unmatched = red
 *   excluded = muted
 *
 * Owner only — reconciliation is a sensitive financial operation.
 */

import { useState, useTransition, useCallback } from "react"
import { toast } from "sonner"
import { cn } from "@/lib/utils"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { Loader2Icon, SparklesIcon, RefreshCwIcon } from "lucide-react"
import {
  getReconciliationView,
  runAutoMatch,
} from "@/actions/reconciliation"
import type { BankTransactionRow, ReconciliationViewResult } from "@/actions/reconciliation"
import { ReconcilePanel } from "@/components/accounting/reconcile-panel"

// ─── Types ────────────────────────────────────────────────────────────────────

interface BankAccount {
  id: string
  account_name: string
  institution_name: string | null
  mask: string | null
  account_type: string
}

type StatusFilter = "all" | "unmatched" | "suggested" | "matched" | "excluded"

interface BankFeedProps {
  bankAccounts: BankAccount[]
}

// ─── Status helpers ────────────────────────────────────────────────────────────

function getStatusBadge(txn: BankTransactionRow) {
  const hasSuggestions = (txn.suggestions?.length ?? 0) > 0

  if (txn.status === "matched") {
    return (
      <Badge className="bg-emerald-500/15 text-emerald-400 border-emerald-500/30 hover:bg-emerald-500/15">
        Matched
      </Badge>
    )
  }
  if (txn.status === "excluded") {
    return (
      <Badge variant="outline" className="text-muted-foreground">
        Excluded
      </Badge>
    )
  }
  if (hasSuggestions) {
    return (
      <Badge className="bg-amber-500/15 text-amber-400 border-amber-500/30 hover:bg-amber-500/15">
        Review
      </Badge>
    )
  }
  return (
    <Badge className="bg-red-500/15 text-red-400 border-red-500/30 hover:bg-red-500/15">
      Unmatched
    </Badge>
  )
}

function formatAmount(amount: string, pending: boolean): { formatted: string; isCredit: boolean } {
  const val = parseFloat(amount)
  // Plaid: positive = debit (money out), negative = credit (money in)
  // But in our convention: positive = deposit, negative = withdrawal
  // Plaid uses the opposite: positive means the customer spent money
  const isCredit = val < 0
  const formatted = `${isCredit ? "+" : "-"}$${Math.abs(val).toFixed(2)}`
  return { formatted: pending ? `${formatted} (pending)` : formatted, isCredit }
}

// ─── Filter chip bar ─────────────────────────────────────────────────────────

interface FilterChipProps {
  label: string
  count?: number
  active: boolean
  onClick: () => void
}

function FilterChip({ label, count, active, onClick }: FilterChipProps) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-medium transition-colors",
        active
          ? "bg-primary text-primary-foreground"
          : "bg-muted/50 text-muted-foreground hover:bg-muted hover:text-foreground"
      )}
    >
      {label}
      {count !== undefined && (
        <span
          className={cn(
            "rounded-full px-1.5 py-0.5 text-xs",
            active ? "bg-primary-foreground/20 text-primary-foreground" : "bg-muted text-muted-foreground"
          )}
        >
          {count}
        </span>
      )}
    </button>
  )
}

// ─── Main component ────────────────────────────────────────────────────────────

export function BankFeed({ bankAccounts }: BankFeedProps) {
  const [selectedAccountId, setSelectedAccountId] = useState<string>(
    bankAccounts[0]?.id ?? ""
  )
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("all")
  const [startDate, setStartDate] = useState("")
  const [endDate, setEndDate] = useState("")
  const [data, setData] = useState<ReconciliationViewResult | null>(null)
  const [isLoading, setIsLoading] = useState(false)
  const [selectedTxn, setSelectedTxn] = useState<BankTransactionRow | null>(null)
  const [isPanelOpen, setIsPanelOpen] = useState(false)
  const [isAutoMatching, startAutoMatchTransition] = useTransition()

  const loadTransactions = useCallback(
    async (accountId: string, filter: StatusFilter, start?: string, end?: string) => {
      if (!accountId) return
      setIsLoading(true)
      try {
        const result = await getReconciliationView(accountId, {
          status: filter,
          startDate: start || undefined,
          endDate: end || undefined,
          limit: 100,
        })
        if (result.success) {
          setData(result.data)
        } else {
          toast.error(result.error)
        }
      } catch {
        toast.error("Failed to load transactions")
      } finally {
        setIsLoading(false)
      }
    },
    []
  )

  function handleAccountChange(accountId: string) {
    setSelectedAccountId(accountId)
    setData(null)
    loadTransactions(accountId, statusFilter, startDate, endDate)
  }

  function handleFilterChange(filter: StatusFilter) {
    setStatusFilter(filter)
    if (selectedAccountId) {
      loadTransactions(selectedAccountId, filter, startDate, endDate)
    }
  }

  function handleDateFilter() {
    if (selectedAccountId) {
      loadTransactions(selectedAccountId, statusFilter, startDate, endDate)
    }
  }

  function handleTxnClick(txn: BankTransactionRow) {
    setSelectedTxn(txn)
    setIsPanelOpen(true)
  }

  function handlePanelClose() {
    setIsPanelOpen(false)
    setSelectedTxn(null)
  }

  function handleMatchAction() {
    // Refresh after a match/unmatch/exclude action
    if (selectedAccountId) {
      loadTransactions(selectedAccountId, statusFilter, startDate, endDate)
    }
    setIsPanelOpen(false)
    setSelectedTxn(null)
  }

  function handleAutoMatch() {
    if (!selectedAccountId) return
    startAutoMatchTransition(async () => {
      const result = await runAutoMatch(selectedAccountId)
      if (result.success) {
        const { autoMatched, suggestedReview, unmatched } = result
        if (autoMatched > 0) {
          toast.success(
            `Auto-matched ${autoMatched} transaction${autoMatched !== 1 ? "s" : ""}`,
            {
              description:
                suggestedReview > 0
                  ? `${suggestedReview} need${suggestedReview !== 1 ? "" : "s"} manual review`
                  : undefined,
            }
          )
        } else {
          toast.info("No high-confidence matches found", {
            description:
              suggestedReview > 0
                ? `${suggestedReview} transaction${suggestedReview !== 1 ? "s" : ""} have suggested matches to review`
                : "All transactions reviewed",
          })
        }
        // Refresh data
        loadTransactions(selectedAccountId, statusFilter, startDate, endDate)
      } else {
        toast.error(result.error)
      }
    })
  }

  // Initial load when account is selected
  const handleLoad = () => {
    loadTransactions(selectedAccountId, statusFilter, startDate, endDate)
  }

  if (bankAccounts.length === 0) {
    return (
      <div className="rounded-lg border border-dashed border-border p-8 text-center">
        <p className="text-sm font-medium text-foreground">No bank accounts connected</p>
        <p className="mt-1 text-sm text-muted-foreground italic">
          Connect a bank account in Settings to start reconciling transactions.
        </p>
      </div>
    )
  }

  return (
    <div className="flex flex-col gap-4">
      {/* ── Controls bar ───────────────────────────────────────────────────── */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        {/* Account selector */}
        <div className="flex flex-col gap-1.5">
          <span className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
            Bank Account
          </span>
          <Select value={selectedAccountId} onValueChange={handleAccountChange}>
            <SelectTrigger className="w-64">
              <SelectValue placeholder="Select account" />
            </SelectTrigger>
            <SelectContent>
              {bankAccounts.map((acct) => (
                <SelectItem key={acct.id} value={acct.id}>
                  <span className="font-medium">{acct.institution_name ?? "Bank"}</span>
                  {" — "}
                  {acct.account_name}
                  {acct.mask ? ` ···${acct.mask}` : ""}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        {/* Date range */}
        <div className="flex items-end gap-2">
          <div className="flex flex-col gap-1.5">
            <span className="text-xs font-medium text-muted-foreground">From</span>
            <input
              type="date"
              value={startDate}
              onChange={(e) => setStartDate(e.target.value)}
              className="rounded-md border border-input bg-background px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
            />
          </div>
          <div className="flex flex-col gap-1.5">
            <span className="text-xs font-medium text-muted-foreground">To</span>
            <input
              type="date"
              value={endDate}
              onChange={(e) => setEndDate(e.target.value)}
              className="rounded-md border border-input bg-background px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
            />
          </div>
          <Button variant="outline" size="sm" onClick={handleDateFilter}>
            Apply
          </Button>
        </div>

        {/* Actions */}
        <div className="flex gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={handleAutoMatch}
            disabled={isAutoMatching || !selectedAccountId || !data}
          >
            {isAutoMatching ? (
              <Loader2Icon className="h-3.5 w-3.5 animate-spin" />
            ) : (
              <SparklesIcon className="h-3.5 w-3.5" />
            )}
            {isAutoMatching ? "Matching..." : "Auto-Match"}
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={handleLoad}
            disabled={isLoading || !selectedAccountId}
          >
            {isLoading ? (
              <Loader2Icon className="h-3.5 w-3.5 animate-spin" />
            ) : (
              <RefreshCwIcon className="h-3.5 w-3.5" />
            )}
            Load
          </Button>
        </div>
      </div>

      {/* ── Stats summary ───────────────────────────────────────────────────── */}
      {data && (
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          {[
            { label: "Matched", count: data.stats.matched, color: "text-emerald-400" },
            { label: "Review", count: data.stats.suggested, color: "text-amber-400" },
            { label: "Unmatched", count: data.stats.unmatched, color: "text-red-400" },
            { label: "Excluded", count: data.stats.excluded, color: "text-muted-foreground" },
          ].map((stat) => (
            <div
              key={stat.label}
              className="rounded-lg border border-border bg-card p-3 text-center"
            >
              <div className={cn("text-2xl font-bold tabular-nums", stat.color)}>
                {stat.count}
              </div>
              <div className="mt-0.5 text-xs text-muted-foreground">{stat.label}</div>
            </div>
          ))}
        </div>
      )}

      {/* ── Filter chips ────────────────────────────────────────────────────── */}
      {data && (
        <div className="flex flex-wrap gap-2">
          <FilterChip
            label="All"
            count={data.stats.total}
            active={statusFilter === "all"}
            onClick={() => handleFilterChange("all")}
          />
          <FilterChip
            label="Unmatched"
            count={data.stats.unmatched}
            active={statusFilter === "unmatched"}
            onClick={() => handleFilterChange("unmatched")}
          />
          <FilterChip
            label="Suggested"
            count={data.stats.suggested}
            active={statusFilter === "suggested"}
            onClick={() => handleFilterChange("suggested")}
          />
          <FilterChip
            label="Matched"
            count={data.stats.matched}
            active={statusFilter === "matched"}
            onClick={() => handleFilterChange("matched")}
          />
          <FilterChip
            label="Excluded"
            count={data.stats.excluded}
            active={statusFilter === "excluded"}
            onClick={() => handleFilterChange("excluded")}
          />
        </div>
      )}

      {/* ── Transaction list ─────────────────────────────────────────────────── */}
      {isLoading ? (
        <div className="flex items-center justify-center py-12">
          <Loader2Icon className="h-6 w-6 animate-spin text-muted-foreground" />
        </div>
      ) : !data ? (
        <div className="rounded-lg border border-dashed border-border p-8 text-center">
          <p className="text-sm text-muted-foreground italic">
            Select a bank account and click Load to view transactions.
          </p>
        </div>
      ) : data.transactions.length === 0 ? (
        <div className="rounded-lg border border-dashed border-border p-8 text-center">
          <p className="text-sm text-muted-foreground italic">
            No transactions found for the selected filters.
          </p>
        </div>
      ) : (
        <div className="overflow-hidden rounded-lg border border-border">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border bg-muted/30">
                <th className="px-4 py-2.5 text-left text-xs font-medium text-muted-foreground">
                  Date
                </th>
                <th className="px-4 py-2.5 text-left text-xs font-medium text-muted-foreground">
                  Description
                </th>
                <th className="px-4 py-2.5 text-right text-xs font-medium text-muted-foreground">
                  Amount
                </th>
                <th className="px-4 py-2.5 text-center text-xs font-medium text-muted-foreground">
                  Status
                </th>
                <th className="px-4 py-2.5 text-left text-xs font-medium text-muted-foreground">
                  Match
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {data.transactions.map((txn) => {
                const { formatted, isCredit } = formatAmount(txn.amount, txn.pending)
                return (
                  <tr
                    key={txn.id}
                    className="cursor-pointer transition-colors hover:bg-muted/30"
                    onClick={() => handleTxnClick(txn)}
                  >
                    <td className="px-4 py-3 tabular-nums text-muted-foreground">
                      {txn.date}
                    </td>
                    <td className="max-w-[240px] px-4 py-3">
                      <div className="truncate font-medium">
                        {txn.merchant_name ?? txn.name ?? "Unknown"}
                      </div>
                      {txn.category && (
                        <div className="truncate text-xs text-muted-foreground">
                          {txn.category}
                        </div>
                      )}
                    </td>
                    <td
                      className={cn(
                        "px-4 py-3 text-right tabular-nums font-medium",
                        isCredit ? "text-emerald-400" : "text-foreground"
                      )}
                    >
                      {formatted}
                    </td>
                    <td className="px-4 py-3 text-center">
                      {getStatusBadge(txn)}
                    </td>
                    <td className="max-w-[200px] px-4 py-3 text-xs text-muted-foreground">
                      {txn.status === "matched" && txn.matchedEntry ? (
                        <span className="truncate block">{txn.matchedEntry.description}</span>
                      ) : (txn.suggestions?.length ?? 0) > 0 ? (
                        <span className="text-amber-400">
                          {txn.suggestions!.length} suggestion{txn.suggestions!.length !== 1 ? "s" : ""}
                        </span>
                      ) : txn.status === "excluded" ? (
                        <span className="italic">Excluded</span>
                      ) : (
                        <span className="italic">No match found</span>
                      )}
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}

      {/* ── Reconcile panel ─────────────────────────────────────────────────── */}
      {isPanelOpen && selectedTxn && (
        <ReconcilePanel
          transaction={selectedTxn}
          orgId={selectedTxn.org_id}
          onClose={handlePanelClose}
          onAction={handleMatchAction}
        />
      )}
    </div>
  )
}
