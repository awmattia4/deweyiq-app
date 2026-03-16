"use client"

/**
 * JournalEntryList — Filterable list of journal entries with expandable detail.
 *
 * Features:
 * - Filters: date range, source type, account
 * - Each entry: date, description, source type badge, total amount
 * - Expand to see individual lines with account name, debit/credit
 * - Manual entry form (accountant mode only)
 */

import { useState, useTransition } from "react"
import { ChevronDownIcon, ChevronRightIcon, PlusIcon } from "lucide-react"
import { cn } from "@/lib/utils"
import { toast } from "sonner"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Badge } from "@/components/ui/badge"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog"
import { getJournalEntries, createManualJournalEntry } from "@/actions/accounting"
import type { JournalEntryRow, AccountRow } from "@/actions/accounting"

// ---------------------------------------------------------------------------
// Source type label helpers
// ---------------------------------------------------------------------------

const SOURCE_TYPE_LABELS: Record<string, string> = {
  invoice: "Invoice",
  payment: "Payment",
  expense: "Expense",
  payout: "Payout",
  manual: "Manual",
  refund: "Refund",
}

const SOURCE_TYPE_COLORS: Record<string, string> = {
  invoice: "bg-blue-500/15 text-blue-400 border-blue-500/20",
  payment: "bg-green-500/15 text-green-400 border-green-500/20",
  expense: "bg-orange-500/15 text-orange-400 border-orange-500/20",
  payout: "bg-purple-500/15 text-purple-400 border-purple-500/20",
  manual: "bg-gray-500/15 text-gray-400 border-gray-500/20",
  refund: "bg-red-500/15 text-red-400 border-red-500/20",
}

function formatCurrency(amount: number): string {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
  }).format(Math.abs(amount))
}

// ---------------------------------------------------------------------------
// Main component
// ---------------------------------------------------------------------------

interface JournalEntryListProps {
  initialEntries: JournalEntryRow[]
  accounts: AccountRow[]
  accountantModeEnabled: boolean
  isOwner: boolean
}

export function JournalEntryList({
  initialEntries,
  accounts,
  accountantModeEnabled,
  isOwner,
}: JournalEntryListProps) {
  const [entries, setEntries] = useState(initialEntries)
  const [expandedIds, setExpandedIds] = useState<Set<string>>(new Set())
  const [showManualForm, setShowManualForm] = useState(false)
  const [isPending, startTransition] = useTransition()

  // Filters
  const [filterStartDate, setFilterStartDate] = useState("")
  const [filterEndDate, setFilterEndDate] = useState("")
  const [filterSourceType, setFilterSourceType] = useState("all")
  const [filterAccountId, setFilterAccountId] = useState("all")

  function toggleExpand(id: string) {
    setExpandedIds((prev) => {
      const next = new Set(prev)
      if (next.has(id)) {
        next.delete(id)
      } else {
        next.add(id)
      }
      return next
    })
  }

  function handleFilter() {
    startTransition(async () => {
      const result = await getJournalEntries({
        startDate: filterStartDate || undefined,
        endDate: filterEndDate || undefined,
        sourceType: filterSourceType !== "all" ? filterSourceType : undefined,
        accountId: filterAccountId !== "all" ? filterAccountId : undefined,
        limit: 100,
      })
      if (result.success) {
        setEntries(result.entries)
      } else {
        toast.error(result.error)
      }
    })
  }

  function handleClearFilters() {
    setFilterStartDate("")
    setFilterEndDate("")
    setFilterSourceType("all")
    setFilterAccountId("all")
    startTransition(async () => {
      const result = await getJournalEntries({ limit: 100 })
      if (result.success) {
        setEntries(result.entries)
      }
    })
  }

  // Compute entry total (sum of positive/debit side)
  function getEntryTotal(entry: JournalEntryRow): number {
    return entry.lines
      .filter((l) => parseFloat(l.amount) > 0)
      .reduce((sum, l) => sum + parseFloat(l.amount), 0)
  }

  return (
    <div className="space-y-4">
      {/* Filters */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Input
          type="date"
          value={filterStartDate}
          onChange={(e) => setFilterStartDate(e.target.value)}
          placeholder="Start date"
          className="h-9 text-sm"
        />
        <Input
          type="date"
          value={filterEndDate}
          onChange={(e) => setFilterEndDate(e.target.value)}
          placeholder="End date"
          className="h-9 text-sm"
        />
        <Select value={filterSourceType} onValueChange={setFilterSourceType}>
          <SelectTrigger className="h-9">
            <SelectValue placeholder="Source type" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All types</SelectItem>
            {Object.entries(SOURCE_TYPE_LABELS).map(([value, label]) => (
              <SelectItem key={value} value={value}>
                {label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select value={filterAccountId} onValueChange={setFilterAccountId}>
          <SelectTrigger className="h-9">
            <SelectValue placeholder="Account" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All accounts</SelectItem>
            {accounts
              .sort((a, b) => a.account_number.localeCompare(b.account_number))
              .map((account) => (
                <SelectItem key={account.id} value={account.id}>
                  {account.account_number} — {account.display_name}
                </SelectItem>
              ))}
          </SelectContent>
        </Select>
      </div>

      <div className="flex items-center justify-between">
        <div className="flex gap-2">
          <Button size="sm" variant="outline" onClick={handleFilter} disabled={isPending}>
            {isPending ? "Loading..." : "Apply Filters"}
          </Button>
          <Button
            size="sm"
            variant="ghost"
            onClick={handleClearFilters}
            disabled={isPending}
          >
            Clear
          </Button>
        </div>
        {isOwner && accountantModeEnabled && (
          <Button size="sm" variant="outline" onClick={() => setShowManualForm(true)}>
            <PlusIcon className="h-4 w-4 mr-1.5" />
            Manual Entry
          </Button>
        )}
      </div>

      {/* Entry list */}
      {entries.length === 0 ? (
        <div className="rounded-lg border border-border p-8 text-center">
          <p className="text-sm text-muted-foreground italic">No journal entries found</p>
        </div>
      ) : (
        <div className="rounded-lg border border-border overflow-hidden divide-y divide-border/50">
          {entries.map((entry) => {
            const isExpanded = expandedIds.has(entry.id)
            const total = getEntryTotal(entry)

            return (
              <div key={entry.id}>
                {/* Entry header row */}
                <button
                  type="button"
                  onClick={() => toggleExpand(entry.id)}
                  className="w-full flex items-center gap-3 px-4 py-3 hover:bg-muted/30 transition-colors text-left"
                >
                  {isExpanded ? (
                    <ChevronDownIcon className="h-4 w-4 text-muted-foreground shrink-0" />
                  ) : (
                    <ChevronRightIcon className="h-4 w-4 text-muted-foreground shrink-0" />
                  )}

                  <span className="text-sm text-muted-foreground w-24 shrink-0 tabular-nums">
                    {entry.entry_date}
                  </span>

                  <Badge
                    variant="outline"
                    className={cn(
                      "text-xs shrink-0",
                      SOURCE_TYPE_COLORS[entry.source_type] ?? SOURCE_TYPE_COLORS.manual
                    )}
                  >
                    {SOURCE_TYPE_LABELS[entry.source_type] ?? entry.source_type}
                  </Badge>

                  <span className="flex-1 text-sm truncate text-foreground">
                    {entry.description}
                  </span>

                  {entry.is_reversed && (
                    <Badge variant="outline" className="text-xs text-muted-foreground shrink-0">
                      Reversed
                    </Badge>
                  )}

                  <span className="text-sm font-medium tabular-nums shrink-0">
                    {formatCurrency(total)}
                  </span>
                </button>

                {/* Expanded lines */}
                {isExpanded && (
                  <div className="bg-muted/20 px-4 pb-3 pt-1">
                    <table className="w-full text-xs">
                      <thead>
                        <tr className="text-muted-foreground">
                          <th className="text-left py-1 pr-4 font-medium">Account</th>
                          <th className="text-right py-1 pr-4 font-medium w-24">Debit</th>
                          <th className="text-right py-1 font-medium w-24">Credit</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-border/30">
                        {entry.lines.map((line) => {
                          const amount = parseFloat(line.amount)
                          const isDebit = amount > 0
                          return (
                            <tr key={line.id} className="text-foreground">
                              <td className="py-1 pr-4">
                                <span className="font-mono text-muted-foreground mr-2">
                                  {line.accountNumber}
                                </span>
                                {line.accountName}
                                {line.description && (
                                  <span className="text-muted-foreground ml-2">
                                    — {line.description}
                                  </span>
                                )}
                              </td>
                              <td className="text-right py-1 pr-4 tabular-nums">
                                {isDebit ? formatCurrency(amount) : ""}
                              </td>
                              <td className="text-right py-1 tabular-nums">
                                {!isDebit ? formatCurrency(amount) : ""}
                              </td>
                            </tr>
                          )
                        })}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            )
          })}
        </div>
      )}

      {/* Manual Entry Dialog */}
      {showManualForm && (
        <ManualEntryDialog
          isOpen={showManualForm}
          accounts={accounts}
          onClose={() => setShowManualForm(false)}
          onSuccess={(newEntry) => {
            setShowManualForm(false)
            setEntries((prev) => [newEntry, ...prev])
          }}
        />
      )}
    </div>
  )
}

// ---------------------------------------------------------------------------
// Manual Entry Dialog
// ---------------------------------------------------------------------------

interface ManualEntryLine {
  accountId: string
  amount: string
  amountInput: string // local string state for controlled decimal input
  description: string
  isDebit: boolean
}

interface ManualEntryDialogProps {
  isOpen: boolean
  accounts: AccountRow[]
  onClose: () => void
  onSuccess: (entry: JournalEntryRow) => void
}

function ManualEntryDialog({ isOpen, accounts, onClose, onSuccess }: ManualEntryDialogProps) {
  const [entryDate, setEntryDate] = useState("")
  const [description, setDescription] = useState("")
  const [lines, setLines] = useState<ManualEntryLine[]>([
    { accountId: "", amount: "", amountInput: "", description: "", isDebit: true },
    { accountId: "", amount: "", amountInput: "", description: "", isDebit: false },
  ])
  const [isPending, startTransition] = useTransition()

  function addLine() {
    setLines((prev) => [
      ...prev,
      { accountId: "", amount: "", amountInput: "", description: "", isDebit: true },
    ])
  }

  function removeLine(index: number) {
    if (lines.length <= 2) return
    setLines((prev) => prev.filter((_, i) => i !== index))
  }

  function updateLine(index: number, updates: Partial<ManualEntryLine>) {
    setLines((prev) => prev.map((l, i) => (i === index ? { ...l, ...updates } : l)))
  }

  function handleAmountInput(index: number, value: string) {
    updateLine(index, { amountInput: value })
    // Only flush to amount if it's a complete number
    if (!value.endsWith(".") && !value.endsWith("-") && value !== "") {
      const parsed = parseFloat(value)
      if (!isNaN(parsed)) {
        updateLine(index, { amountInput: value, amount: String(Math.abs(parsed)) })
      }
    } else if (value === "") {
      updateLine(index, { amountInput: "", amount: "" })
    }
  }

  function handleAmountBlur(index: number) {
    const line = lines[index]
    if (line.amountInput && !line.amountInput.endsWith(".")) {
      const parsed = parseFloat(line.amountInput)
      if (!isNaN(parsed)) {
        updateLine(index, { amount: String(Math.abs(parsed)) })
      }
    }
  }

  // Compute balance: sum of debits - sum of credits
  const debitTotal = lines.reduce((sum, l) => {
    if (!l.isDebit || !l.amount) return sum
    return sum + (parseFloat(l.amount) || 0)
  }, 0)
  const creditTotal = lines.reduce((sum, l) => {
    if (l.isDebit || !l.amount) return sum
    return sum + (parseFloat(l.amount) || 0)
  }, 0)
  const isBalanced = Math.abs(debitTotal - creditTotal) < 0.01

  function handleSubmit() {
    if (!entryDate) {
      toast.error("Date is required")
      return
    }
    if (!description.trim()) {
      toast.error("Description is required")
      return
    }
    for (const line of lines) {
      if (!line.accountId) {
        toast.error("All lines must have an account selected")
        return
      }
      if (!line.amount || parseFloat(line.amount) <= 0) {
        toast.error("All lines must have a positive amount")
        return
      }
    }
    if (!isBalanced) {
      toast.error(`Entry is not balanced. Debits: ${formatCurrency(debitTotal)}, Credits: ${formatCurrency(creditTotal)}`)
      return
    }

    const apiLines = lines.map((l) => ({
      accountId: l.accountId,
      amount: l.isDebit ? String(parseFloat(l.amount)) : String(-parseFloat(l.amount)),
      description: l.description || undefined,
    }))

    startTransition(async () => {
      const result = await createManualJournalEntry({
        entryDate,
        description: description.trim(),
        lines: apiLines,
      })

      if (result.success) {
        toast.success("Journal entry created")
        // Build a basic entry object for immediate UI update
        const newEntry: JournalEntryRow = {
          id: result.entryId ?? "",
          org_id: "",
          entry_date: entryDate,
          description: description.trim(),
          source_type: "manual",
          source_id: null,
          is_posted: true,
          is_reversed: false,
          reversal_of: null,
          created_at: new Date(),
          lines: apiLines.map((l, i) => {
            const account = accounts.find((a) => a.id === l.accountId)
            return {
              id: `temp-${i}`,
              account_id: l.accountId,
              accountName: account?.account_name ?? "",
              accountNumber: account?.account_number ?? "",
              amount: l.amount,
              description: l.description ?? null,
            }
          }),
        }
        onSuccess(newEntry)
      } else {
        toast.error(result.error ?? "Failed to create journal entry")
      }
    })
  }

  return (
    <Dialog open={isOpen} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>Manual Journal Entry</DialogTitle>
        </DialogHeader>
        <div className="space-y-4 py-2">
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <label className="text-sm font-medium">Date</label>
              <Input
                type="date"
                value={entryDate}
                onChange={(e) => setEntryDate(e.target.value)}
                className="h-9"
              />
            </div>
            <div className="space-y-1.5">
              <label className="text-sm font-medium">Description</label>
              <Input
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder="Entry description"
                className="h-9"
              />
            </div>
          </div>

          {/* Lines */}
          <div>
            <div className="grid grid-cols-[1fr_1fr_6rem_1fr_2rem] gap-2 mb-2">
              <span className="text-xs font-medium text-muted-foreground">Account</span>
              <span className="text-xs font-medium text-muted-foreground">Description</span>
              <span className="text-xs font-medium text-muted-foreground text-right">Amount</span>
              <span className="text-xs font-medium text-muted-foreground">Dr / Cr</span>
              <span />
            </div>
            <div className="space-y-2">
              {lines.map((line, index) => (
                <div key={index} className="grid grid-cols-[1fr_1fr_6rem_1fr_2rem] gap-2 items-center">
                  <Select value={line.accountId} onValueChange={(v) => updateLine(index, { accountId: v })}>
                    <SelectTrigger className="h-8 text-xs">
                      <SelectValue placeholder="Select account" />
                    </SelectTrigger>
                    <SelectContent>
                      {accounts
                        .sort((a, b) => a.account_number.localeCompare(b.account_number))
                        .map((account) => (
                          <SelectItem key={account.id} value={account.id}>
                            {account.account_number} — {account.display_name}
                          </SelectItem>
                        ))}
                    </SelectContent>
                  </Select>

                  <Input
                    value={line.description}
                    onChange={(e) => updateLine(index, { description: e.target.value })}
                    placeholder="Optional"
                    className="h-8 text-xs"
                  />

                  <Input
                    value={line.amountInput}
                    onChange={(e) => handleAmountInput(index, e.target.value)}
                    onBlur={() => handleAmountBlur(index)}
                    placeholder="0.00"
                    className="h-8 text-xs text-right tabular-nums"
                    inputMode="decimal"
                  />

                  <Select
                    value={line.isDebit ? "debit" : "credit"}
                    onValueChange={(v) => updateLine(index, { isDebit: v === "debit" })}
                  >
                    <SelectTrigger className="h-8 text-xs">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="debit">Debit (Dr)</SelectItem>
                      <SelectItem value="credit">Credit (Cr)</SelectItem>
                    </SelectContent>
                  </Select>

                  <button
                    type="button"
                    onClick={() => removeLine(index)}
                    disabled={lines.length <= 2}
                    className="text-muted-foreground hover:text-destructive disabled:opacity-30 text-lg leading-none"
                  >
                    ×
                  </button>
                </div>
              ))}
            </div>

            <div className="mt-3 flex items-center justify-between">
              <Button size="sm" variant="ghost" className="text-xs h-7" onClick={addLine}>
                <PlusIcon className="h-3 w-3 mr-1" />
                Add Line
              </Button>
              <div className="text-xs space-x-4 text-right">
                <span className="text-muted-foreground">
                  Debits: <span className="text-foreground tabular-nums">{formatCurrency(debitTotal)}</span>
                </span>
                <span className="text-muted-foreground">
                  Credits: <span className="text-foreground tabular-nums">{formatCurrency(creditTotal)}</span>
                </span>
                <span className={cn("font-medium", isBalanced ? "text-green-400" : "text-destructive")}>
                  {isBalanced ? "Balanced" : `Off by ${formatCurrency(Math.abs(debitTotal - creditTotal))}`}
                </span>
              </div>
            </div>
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose} disabled={isPending}>
            Cancel
          </Button>
          <Button onClick={handleSubmit} disabled={isPending || !isBalanced}>
            {isPending ? "Creating..." : "Create Entry"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
