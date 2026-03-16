"use client"

import { useState, useCallback } from "react"
import { usePlaidLink } from "react-plaid-link"
import type { PlaidLinkOnSuccessMetadata } from "react-plaid-link"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog"
import {
  createPlaidLinkToken,
  exchangePublicToken,
  syncTransactions,
  disconnectBankAccount,
  getBankAccounts,
} from "@/actions/bank-feeds"
import type { BankAccountRow, PlaidLinkMetadata } from "@/actions/bank-feeds"

// ─── Types ────────────────────────────────────────────────────────────────────

interface PlaidConnectProps {
  initialAccounts: BankAccountRow[]
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function formatBalance(balance: string | null): string {
  if (balance == null) return "—"
  const num = parseFloat(balance)
  if (isNaN(num)) return "—"
  return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(num)
}

function formatLastSynced(isoString: string | null): string {
  if (!isoString) return "Never synced"
  const date = new Date(isoString)
  const now = new Date()
  const diffMs = now.getTime() - date.getTime()
  const diffMins = Math.floor(diffMs / 60000)
  if (diffMins < 1) return "Just now"
  if (diffMins < 60) return `${diffMins}m ago`
  const diffHrs = Math.floor(diffMins / 60)
  if (diffHrs < 24) return `${diffHrs}h ago`
  const diffDays = Math.floor(diffHrs / 24)
  return `${diffDays}d ago`
}

function accountTypeLabel(type: string): string {
  const map: Record<string, string> = {
    checking: "Checking",
    savings: "Savings",
    credit: "Credit Card",
    loan: "Loan",
  }
  return map[type.toLowerCase()] ?? type
}

// ─── Inner: Link trigger ──────────────────────────────────────────────────────

interface LinkButtonProps {
  linkToken: string
  onSuccess: (publicToken: string, metadata: PlaidLinkMetadata) => void
  onExit: () => void
}

function PlaidLinkButton({ linkToken, onSuccess, onExit }: LinkButtonProps) {
  const config = {
    token: linkToken,
    onSuccess: (publicToken: string, metadata: PlaidLinkOnSuccessMetadata) => {
      // Plaid Link returns accounts[] — use the first selected account
      const account = metadata.accounts[0]
      if (!account) return
      onSuccess(publicToken, {
        accountId: account.id,
        accountName: account.name,
        accountType: account.type,
        mask: account.mask ?? null,
        institutionName: metadata.institution?.name ?? null,
      })
    },
    onExit: () => onExit(),
  }

  const { open, ready } = usePlaidLink(config)

  return (
    <Button
      size="sm"
      onClick={() => open()}
      disabled={!ready}
    >
      Connect Account
    </Button>
  )
}

// ─── Main component ───────────────────────────────────────────────────────────

export function PlaidConnect({ initialAccounts }: PlaidConnectProps) {
  const [accounts, setAccounts] = useState<BankAccountRow[]>(initialAccounts)
  const [linkToken, setLinkToken] = useState<string | null>(null)
  const [isLoadingToken, setIsLoadingToken] = useState(false)
  const [syncingId, setSyncingId] = useState<string | null>(null)
  const [disconnectingId, setDisconnectingId] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [successMessage, setSuccessMessage] = useState<string | null>(null)

  // ── Refresh account list ──────────────────────────────────────────────────

  async function refreshAccounts() {
    const result = await getBankAccounts()
    if (!("error" in result)) {
      setAccounts(result)
    }
  }

  // ── Connect flow ──────────────────────────────────────────────────────────

  async function handleConnectClick() {
    setIsLoadingToken(true)
    setError(null)
    const result = await createPlaidLinkToken()
    if ("error" in result) {
      setError(result.error)
      setIsLoadingToken(false)
      return
    }
    setLinkToken(result.linkToken)
    setIsLoadingToken(false)
  }

  const handleLinkSuccess = useCallback(async (publicToken: string, metadata: PlaidLinkMetadata) => {
    setLinkToken(null) // Close the link UI
    setError(null)
    const result = await exchangePublicToken(publicToken, metadata)
    if ("error" in result) {
      setError(result.error)
      return
    }
    setSuccessMessage(`Connected ${metadata.institutionName ?? metadata.accountName} successfully.`)
    setTimeout(() => setSuccessMessage(null), 5000)
    // Trigger initial sync
    await syncTransactions(result.bankAccountId)
    await refreshAccounts()
  }, [])

  const handleLinkExit = useCallback(() => {
    setLinkToken(null)
  }, [])

  // ── Sync ─────────────────────────────────────────────────────────────────

  async function handleSync(accountId: string) {
    setSyncingId(accountId)
    setError(null)
    const result = await syncTransactions(accountId)
    if ("error" in result) {
      setError(result.error)
    } else {
      setSuccessMessage(`Synced: ${result.added} new, ${result.modified} updated, ${result.removed} removed.`)
      setTimeout(() => setSuccessMessage(null), 5000)
      await refreshAccounts()
    }
    setSyncingId(null)
  }

  // ── Disconnect ────────────────────────────────────────────────────────────

  async function handleDisconnect(accountId: string) {
    setDisconnectingId(accountId)
    setError(null)
    const result = await disconnectBankAccount(accountId)
    if ("error" in result) {
      setError(result.error)
    } else {
      setAccounts((prev) => prev.filter((a) => a.id !== accountId))
    }
    setDisconnectingId(null)
  }

  // ─── Render ───────────────────────────────────────────────────────────────

  return (
    <div className="flex flex-col gap-4">
      {/* Status messages */}
      {error && (
        <p className="text-sm text-destructive bg-destructive/10 border border-destructive/20 rounded-md px-3 py-2">
          {error}
        </p>
      )}
      {successMessage && (
        <p className="text-sm text-emerald-400 bg-emerald-500/10 border border-emerald-500/20 rounded-md px-3 py-2">
          {successMessage}
        </p>
      )}

      {/* Account list */}
      {accounts.length === 0 ? (
        <p className="text-sm text-muted-foreground italic">
          No bank accounts connected. Connect your business checking, savings, or credit card to automatically import transactions.
        </p>
      ) : (
        <div className="flex flex-col gap-3">
          {accounts.map((account) => (
            <div
              key={account.id}
              className="flex items-start justify-between gap-4 rounded-lg border border-border bg-muted/20 p-4"
            >
              <div className="flex flex-col gap-1 min-w-0">
                <div className="flex items-center gap-2">
                  <span className="text-sm font-medium truncate">
                    {account.institution_name ?? account.account_name}
                  </span>
                  <Badge variant="outline" className="text-xs shrink-0">
                    {accountTypeLabel(account.account_type)}
                  </Badge>
                </div>
                <p className="text-xs text-muted-foreground">
                  {account.account_name}
                  {account.mask ? ` ••••${account.mask}` : ""}
                </p>
                <div className="flex items-center gap-3 mt-1">
                  <span className="text-sm font-medium tabular-nums">
                    {formatBalance(account.current_balance)}
                  </span>
                  {account.available_balance != null && account.available_balance !== account.current_balance && (
                    <span className="text-xs text-muted-foreground">
                      {formatBalance(account.available_balance)} available
                    </span>
                  )}
                </div>
                <p className="text-xs text-muted-foreground">
                  Last synced: {formatLastSynced(account.last_synced_at)}
                </p>
              </div>

              <div className="flex items-center gap-2 shrink-0">
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => handleSync(account.id)}
                  disabled={syncingId === account.id}
                >
                  {syncingId === account.id ? "Syncing..." : "Sync Now"}
                </Button>

                <AlertDialog>
                  <AlertDialogTrigger asChild>
                    <Button
                      size="sm"
                      variant="outline"
                      className="text-destructive hover:text-destructive hover:bg-destructive/10 border-destructive/30"
                      disabled={disconnectingId === account.id}
                    >
                      {disconnectingId === account.id ? "Disconnecting..." : "Disconnect"}
                    </Button>
                  </AlertDialogTrigger>
                  <AlertDialogContent>
                    <AlertDialogHeader>
                      <AlertDialogTitle>Disconnect bank account?</AlertDialogTitle>
                      <AlertDialogDescription>
                        This will remove{" "}
                        <strong>
                          {account.institution_name ?? account.account_name}
                          {account.mask ? ` ••••${account.mask}` : ""}
                        </strong>{" "}
                        and delete all imported transactions. This cannot be undone.
                      </AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                      <AlertDialogCancel>Cancel</AlertDialogCancel>
                      <AlertDialogAction
                        onClick={() => handleDisconnect(account.id)}
                        className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                      >
                        Disconnect
                      </AlertDialogAction>
                    </AlertDialogFooter>
                  </AlertDialogContent>
                </AlertDialog>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Connect button / Link UI */}
      <div>
        {linkToken ? (
          <PlaidLinkButton
            linkToken={linkToken}
            onSuccess={handleLinkSuccess}
            onExit={handleLinkExit}
          />
        ) : (
          <Button
            size="sm"
            variant="outline"
            onClick={handleConnectClick}
            disabled={isLoadingToken}
          >
            {isLoadingToken ? "Loading..." : "Connect Bank Account"}
          </Button>
        )}
      </div>
    </div>
  )
}
