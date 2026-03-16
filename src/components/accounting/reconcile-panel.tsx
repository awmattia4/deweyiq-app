"use client"

/**
 * ReconcilePanel — Slide-out dialog for matching, unmatching, and managing
 * a single bank transaction's reconciliation state.
 *
 * Shows:
 * - Transaction details (date, amount, merchant, category)
 * - Suggested matches with scores and "Confirm Match" button per suggestion
 * - Manual journal entry search
 * - "Create Entry" form for unmatched transactions
 * - Exclude / Restore / Unmatch actions
 *
 * Owner only — opened by clicking a row in BankFeed.
 */

import { useState, useTransition } from "react"
import { toast } from "sonner"
import { cn } from "@/lib/utils"
import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { Badge } from "@/components/ui/badge"
import { Loader2Icon, CheckIcon, LinkIcon, PlusIcon, XIcon, RotateCcwIcon } from "lucide-react"
import {
  confirmMatch,
  unmatchTransaction,
  excludeTransaction,
  restoreTransaction,
  createEntryFromTransaction,
  getTransactionSuggestions,
} from "@/actions/reconciliation"
import { getChartOfAccounts } from "@/actions/accounting"
import type { BankTransactionRow } from "@/actions/reconciliation"
import type { MatchScore } from "@/lib/accounting/reconciliation"
import type { AccountRow } from "@/actions/accounting"

// ─── Types ────────────────────────────────────────────────────────────────────

interface ReconcilePanelProps {
  transaction: BankTransactionRow
  orgId: string
  onClose: () => void
  /** Called after any successful match/unmatch/exclude action */
  onAction: () => void
}

// ─── Score badge ──────────────────────────────────────────────────────────────

function ScoreBadge({ score }: { score: number }) {
  const color =
    score >= 80
      ? "bg-emerald-500/15 text-emerald-400 border-emerald-500/30"
      : score >= 65
      ? "bg-amber-500/15 text-amber-400 border-amber-500/30"
      : "bg-muted/50 text-muted-foreground border-border"

  return (
    <Badge className={cn("text-xs font-mono", color, "hover:bg-opacity-100")}>
      {score}
    </Badge>
  )
}

// ─── Main component ────────────────────────────────────────────────────────────

export function ReconcilePanel({ transaction: txn, onClose, onAction }: ReconcilePanelProps) {
  const [suggestions, setSuggestions] = useState<MatchScore[]>(txn.suggestions ?? [])
  const [isSuggestionsLoaded, setIsSuggestionsLoaded] = useState(
    txn.suggestions !== undefined
  )
  const [isLoadingSuggestions, setIsLoadingSuggestions] = useState(false)

  // Chart of accounts for "Create Entry" form
  const [accounts, setAccounts] = useState<AccountRow[] | null>(null)
  const [isLoadingAccounts, setIsLoadingAccounts] = useState(false)

  // Create entry form state
  const [showCreateForm, setShowCreateForm] = useState(false)
  const [selectedAccountId, setSelectedAccountId] = useState("")
  const [entryDescription, setEntryDescription] = useState(
    txn.merchant_name ?? txn.name ?? ""
  )

  const [isConfirming, startConfirmTransition] = useTransition()
  const [isUnmatching, startUnmatchTransition] = useTransition()
  const [isExcluding, startExcludeTransition] = useTransition()
  const [isRestoring, startRestoreTransition] = useTransition()
  const [isCreating, startCreateTransition] = useTransition()

  // Format amount for display
  const amount = parseFloat(txn.amount)
  const isCredit = amount < 0
  const formattedAmount = `${isCredit ? "+" : "-"}$${Math.abs(amount).toFixed(2)}`

  // Load suggestions on demand
  async function loadSuggestions() {
    if (isSuggestionsLoaded) return
    setIsLoadingSuggestions(true)
    try {
      const result = await getTransactionSuggestions(txn.id)
      if (result.success) {
        setSuggestions(result.suggestions)
        setIsSuggestionsLoaded(true)
      } else {
        toast.error(result.error)
      }
    } catch {
      toast.error("Failed to load suggestions")
    } finally {
      setIsLoadingSuggestions(false)
    }
  }

  // Load chart of accounts for create form
  async function loadAccounts() {
    if (accounts !== null) return
    setIsLoadingAccounts(true)
    try {
      const result = await getChartOfAccounts()
      if (result.success) {
        setAccounts(result.accounts.filter((a) => a.is_active))
      } else {
        toast.error(result.error)
      }
    } catch {
      toast.error("Failed to load accounts")
    } finally {
      setIsLoadingAccounts(false)
    }
  }

  function handleShowCreateForm() {
    setShowCreateForm(true)
    loadAccounts()
  }

  // Confirm a specific match
  function handleConfirmMatch(journalEntryId: string, description: string) {
    startConfirmTransition(async () => {
      const result = await confirmMatch(txn.id, journalEntryId)
      if (result.success) {
        toast.success(`Matched to: ${description}`)
        onAction()
      } else {
        toast.error(result.error ?? "Failed to confirm match")
      }
    })
  }

  // Unmatch
  function handleUnmatch() {
    startUnmatchTransition(async () => {
      const result = await unmatchTransaction(txn.id)
      if (result.success) {
        toast.success("Transaction unmatched")
        onAction()
      } else {
        toast.error(result.error ?? "Failed to unmatch")
      }
    })
  }

  // Exclude
  function handleExclude() {
    startExcludeTransition(async () => {
      const result = await excludeTransaction(txn.id)
      if (result.success) {
        toast.success("Transaction excluded from reconciliation")
        onAction()
      } else {
        toast.error(result.error ?? "Failed to exclude")
      }
    })
  }

  // Restore excluded
  function handleRestore() {
    startRestoreTransition(async () => {
      const result = await restoreTransaction(txn.id)
      if (result.success) {
        toast.success("Transaction restored")
        onAction()
      } else {
        toast.error(result.error ?? "Failed to restore")
      }
    })
  }

  // Create entry from transaction
  function handleCreateEntry() {
    if (!selectedAccountId) {
      toast.error("Please select an account")
      return
    }
    if (!entryDescription.trim()) {
      toast.error("Please enter a description")
      return
    }
    startCreateTransition(async () => {
      const result = await createEntryFromTransaction(
        txn.id,
        selectedAccountId,
        entryDescription.trim()
      )
      if (result.success) {
        toast.success("Journal entry created and matched")
        onAction()
      } else {
        toast.error(result.error ?? "Failed to create entry")
      }
    })
  }

  const isProcessing =
    isConfirming || isUnmatching || isExcluding || isRestoring || isCreating

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Reconcile Transaction</DialogTitle>
          <DialogDescription>
            Match this bank transaction to a journal entry, or create a new entry.
          </DialogDescription>
        </DialogHeader>

        {/* ── Transaction details ──────────────────────────────────────────── */}
        <div className="rounded-lg border border-border bg-muted/20 p-4">
          <div className="flex items-start justify-between gap-2">
            <div className="min-w-0">
              <div className="font-semibold truncate">
                {txn.merchant_name ?? txn.name ?? "Unknown Merchant"}
              </div>
              {txn.category && (
                <div className="text-xs text-muted-foreground mt-0.5">{txn.category}</div>
              )}
            </div>
            <div
              className={cn(
                "shrink-0 text-lg font-bold tabular-nums",
                isCredit ? "text-emerald-400" : "text-foreground"
              )}
            >
              {formattedAmount}
            </div>
          </div>
          <div className="mt-2 flex items-center gap-3 text-xs text-muted-foreground">
            <span>{txn.date}</span>
            {txn.pending && (
              <Badge variant="outline" className="text-xs">
                Pending
              </Badge>
            )}
            <span
              className={cn(
                "font-medium",
                txn.status === "matched"
                  ? "text-emerald-400"
                  : txn.status === "excluded"
                  ? "text-muted-foreground"
                  : "text-red-400"
              )}
            >
              {txn.status.charAt(0).toUpperCase() + txn.status.slice(1)}
            </span>
          </div>
        </div>

        {/* ── Matched entry details ─────────────────────────────────────────── */}
        {txn.status === "matched" && txn.matchedEntry && (
          <div className="space-y-3">
            <div className="flex items-center gap-2 text-sm font-medium text-emerald-400">
              <CheckIcon className="h-4 w-4" />
              Matched to Journal Entry
            </div>
            <div className="rounded-lg border border-emerald-500/20 bg-emerald-500/5 p-3 text-sm">
              <div className="font-medium">{txn.matchedEntry.description}</div>
              <div className="mt-0.5 text-xs text-muted-foreground">
                {txn.matchedEntry.entry_date} · {txn.matchedEntry.source_type}
                {txn.matchedEntry.source_id && ` #${txn.matchedEntry.source_id.slice(0, 8)}...`}
              </div>
            </div>
            <Button
              variant="outline"
              size="sm"
              onClick={handleUnmatch}
              disabled={isProcessing}
              className="text-muted-foreground"
            >
              {isUnmatching ? (
                <Loader2Icon className="h-3.5 w-3.5 animate-spin" />
              ) : (
                <XIcon className="h-3.5 w-3.5" />
              )}
              Remove Match
            </Button>
          </div>
        )}

        {/* ── Suggested matches section ─────────────────────────────────────── */}
        {txn.status !== "matched" && txn.status !== "excluded" && (
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <span className="text-sm font-medium">Suggested Matches</span>
              {!isSuggestionsLoaded && (
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={loadSuggestions}
                  disabled={isLoadingSuggestions}
                >
                  {isLoadingSuggestions ? (
                    <Loader2Icon className="h-3.5 w-3.5 animate-spin" />
                  ) : (
                    "Load suggestions"
                  )}
                </Button>
              )}
            </div>

            {isLoadingSuggestions ? (
              <div className="flex items-center justify-center py-4">
                <Loader2Icon className="h-5 w-5 animate-spin text-muted-foreground" />
              </div>
            ) : suggestions.length === 0 && isSuggestionsLoaded ? (
              <p className="text-sm text-muted-foreground italic py-2">
                No suggested matches found. You can search manually or create a new entry below.
              </p>
            ) : (
              <div className="space-y-2">
                {suggestions.map((match) => (
                  <div
                    key={match.journalEntryId}
                    className="rounded-lg border border-border bg-card p-3"
                  >
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0">
                        <div className="text-sm font-medium truncate">
                          {match.entry.description}
                        </div>
                        <div className="mt-0.5 text-xs text-muted-foreground">
                          {match.entry.entry_date} · ${Math.abs(parseFloat(match.entry.net_amount)).toFixed(2)}
                        </div>
                        <div className="mt-1 flex flex-wrap gap-1">
                          {match.reasons.slice(0, 2).map((r, i) => (
                            <span
                              key={i}
                              className="inline-block rounded bg-muted/50 px-1.5 py-0.5 text-xs text-muted-foreground"
                            >
                              {r}
                            </span>
                          ))}
                        </div>
                      </div>
                      <div className="shrink-0 flex flex-col items-end gap-2">
                        <ScoreBadge score={match.score} />
                        <Button
                          size="sm"
                          onClick={() => handleConfirmMatch(match.journalEntryId, match.entry.description)}
                          disabled={isProcessing}
                        >
                          {isConfirming ? (
                            <Loader2Icon className="h-3.5 w-3.5 animate-spin" />
                          ) : (
                            <CheckIcon className="h-3.5 w-3.5" />
                          )}
                          Confirm
                        </Button>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* ── Create entry from transaction ──────────────────────────────────── */}
        {txn.status !== "matched" && txn.status !== "excluded" && (
          <div className="space-y-3 border-t border-border pt-3">
            {!showCreateForm ? (
              <Button
                variant="outline"
                size="sm"
                onClick={handleShowCreateForm}
                className="w-full"
              >
                <PlusIcon className="h-3.5 w-3.5" />
                Create Journal Entry from Transaction
              </Button>
            ) : (
              <div className="space-y-3">
                <div className="text-sm font-medium">Create Journal Entry</div>
                <div className="space-y-2">
                  <div>
                    <label className="text-xs text-muted-foreground">Account (debit)</label>
                    {isLoadingAccounts ? (
                      <div className="flex items-center gap-2 py-2">
                        <Loader2Icon className="h-4 w-4 animate-spin text-muted-foreground" />
                        <span className="text-sm text-muted-foreground">Loading accounts...</span>
                      </div>
                    ) : (
                      <Select value={selectedAccountId} onValueChange={setSelectedAccountId}>
                        <SelectTrigger className="mt-1">
                          <SelectValue placeholder="Select account" />
                        </SelectTrigger>
                        <SelectContent>
                          {accounts?.map((acct) => (
                            <SelectItem key={acct.id} value={acct.id}>
                              {acct.account_number} — {acct.display_name}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    )}
                  </div>
                  <div>
                    <label className="text-xs text-muted-foreground">Description</label>
                    <input
                      type="text"
                      value={entryDescription}
                      onChange={(e) => setEntryDescription(e.target.value)}
                      placeholder="e.g. Office supplies - Amazon"
                      className="mt-1 w-full rounded-md border border-input bg-background px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
                    />
                  </div>
                  <div className="flex gap-2">
                    <Button
                      size="sm"
                      onClick={handleCreateEntry}
                      disabled={isProcessing || !selectedAccountId || !entryDescription.trim()}
                    >
                      {isCreating ? (
                        <Loader2Icon className="h-3.5 w-3.5 animate-spin" />
                      ) : (
                        <LinkIcon className="h-3.5 w-3.5" />
                      )}
                      Create & Match
                    </Button>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => setShowCreateForm(false)}
                      disabled={isProcessing}
                    >
                      Cancel
                    </Button>
                  </div>
                </div>
              </div>
            )}
          </div>
        )}

        {/* ── Exclude / Restore actions ─────────────────────────────────────── */}
        <div className="flex items-center justify-between border-t border-border pt-3">
          <Button variant="ghost" size="sm" onClick={onClose} disabled={isProcessing}>
            Close
          </Button>

          <div className="flex gap-2">
            {txn.status === "excluded" ? (
              <Button
                variant="outline"
                size="sm"
                onClick={handleRestore}
                disabled={isProcessing}
              >
                {isRestoring ? (
                  <Loader2Icon className="h-3.5 w-3.5 animate-spin" />
                ) : (
                  <RotateCcwIcon className="h-3.5 w-3.5" />
                )}
                Restore
              </Button>
            ) : txn.status !== "matched" ? (
              <Button
                variant="outline"
                size="sm"
                onClick={handleExclude}
                disabled={isProcessing}
                className="text-muted-foreground"
              >
                {isExcluding ? (
                  <Loader2Icon className="h-3.5 w-3.5 animate-spin" />
                ) : (
                  <XIcon className="h-3.5 w-3.5" />
                )}
                Exclude
              </Button>
            ) : null}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  )
}
