"use client"

/**
 * ChartOfAccountsEditor — Tree view of the chart of accounts with inline editing.
 *
 * Features:
 * - Tree view grouped by account type (Asset/Liability/Equity/Income/Expense)
 * - Each account shows: number, name, display name, type, balance
 * - Owner can add custom accounts, edit display names, deactivate non-system accounts
 * - System accounts show lock indicator (cannot delete)
 */

import { useState, useTransition } from "react"
import { LockIcon, PlusIcon, ChevronDownIcon, ChevronRightIcon } from "lucide-react"
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
import {
  createAccount,
  updateAccount,
  deleteAccount,
} from "@/actions/accounting"
import type { AccountRow } from "@/actions/accounting"

type AccountType = "asset" | "liability" | "equity" | "income" | "expense"

const ACCOUNT_TYPE_LABELS: Record<AccountType, string> = {
  asset: "Assets",
  liability: "Liabilities",
  equity: "Equity",
  income: "Income",
  expense: "Expenses",
}

const ACCOUNT_TYPE_ORDER: AccountType[] = ["asset", "liability", "equity", "income", "expense"]

interface ChartOfAccountsEditorProps {
  accounts: AccountRow[]
  isOwner: boolean
  onRefresh: () => void
}

export function ChartOfAccountsEditor({
  accounts,
  isOwner,
  onRefresh,
}: ChartOfAccountsEditorProps) {
  const [expandedTypes, setExpandedTypes] = useState<Set<string>>(
    new Set(ACCOUNT_TYPE_ORDER)
  )
  const [editingId, setEditingId] = useState<string | null>(null)
  const [editDisplayName, setEditDisplayName] = useState("")
  const [showAddDialog, setShowAddDialog] = useState(false)
  const [isPending, startTransition] = useTransition()

  // Group accounts by type
  const byType = new Map<AccountType, AccountRow[]>()
  for (const type of ACCOUNT_TYPE_ORDER) {
    byType.set(type, [])
  }
  for (const account of accounts) {
    const type = account.account_type as AccountType
    byType.get(type)?.push(account)
  }

  function toggleType(type: string) {
    setExpandedTypes((prev) => {
      const next = new Set(prev)
      if (next.has(type)) {
        next.delete(type)
      } else {
        next.add(type)
      }
      return next
    })
  }

  function startEdit(account: AccountRow) {
    setEditingId(account.id)
    setEditDisplayName(account.display_name)
  }

  function cancelEdit() {
    setEditingId(null)
    setEditDisplayName("")
  }

  function handleSaveEdit(accountId: string) {
    if (!editDisplayName.trim()) {
      toast.error("Display name cannot be empty")
      return
    }
    startTransition(async () => {
      const result = await updateAccount(accountId, {
        displayName: editDisplayName.trim(),
      })
      if (result.success) {
        toast.success("Account updated")
        setEditingId(null)
        onRefresh()
      } else {
        toast.error(result.error ?? "Failed to update account")
      }
    })
  }

  function handleDeactivate(account: AccountRow) {
    if (account.is_system) return
    startTransition(async () => {
      const result = await updateAccount(account.id, { isActive: false })
      if (result.success) {
        toast.success(`${account.display_name} deactivated`)
        onRefresh()
      } else {
        toast.error(result.error ?? "Failed to deactivate account")
      }
    })
  }

  function handleDelete(account: AccountRow) {
    if (account.is_system) return
    startTransition(async () => {
      const result = await deleteAccount(account.id)
      if (result.success) {
        toast.success(`${account.display_name} deleted`)
        onRefresh()
      } else {
        toast.error(result.error ?? "Failed to delete account")
      }
    })
  }

  function formatBalance(balance: string, accountType: string): string {
    const raw = parseFloat(balance)
    if (isNaN(raw) || raw === 0) return "$0.00"

    // Display positive for assets/expenses, positive for liabilities/equity/income
    const displayAmount =
      accountType === "asset" || accountType === "expense" ? raw : -raw

    const formatted = new Intl.NumberFormat("en-US", {
      style: "currency",
      currency: "USD",
    }).format(Math.abs(displayAmount))

    return displayAmount < 0 ? `(${formatted})` : formatted
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <p className="text-sm text-muted-foreground">
          Pool-industry accounts pre-configured. Add custom accounts or edit display names.
        </p>
        {isOwner && (
          <Button
            size="sm"
            variant="outline"
            onClick={() => setShowAddDialog(true)}
          >
            <PlusIcon className="h-4 w-4 mr-1.5" />
            Add Account
          </Button>
        )}
      </div>

      <div className="space-y-2">
        {ACCOUNT_TYPE_ORDER.map((type) => {
          const typeAccounts = byType.get(type) ?? []
          const isExpanded = expandedTypes.has(type)
          const typeTotal = typeAccounts.reduce((sum, a) => {
            const raw = parseFloat(a.balance)
            return sum + (isNaN(raw) ? 0 : raw)
          }, 0)

          return (
            <div key={type} className="rounded-lg border border-border overflow-hidden">
              {/* Type header */}
              <button
                type="button"
                onClick={() => toggleType(type)}
                className="w-full flex items-center justify-between px-4 py-3 bg-muted/40 hover:bg-muted/60 transition-colors text-left"
              >
                <div className="flex items-center gap-2">
                  {isExpanded ? (
                    <ChevronDownIcon className="h-4 w-4 text-muted-foreground" />
                  ) : (
                    <ChevronRightIcon className="h-4 w-4 text-muted-foreground" />
                  )}
                  <span className="font-medium text-sm">{ACCOUNT_TYPE_LABELS[type]}</span>
                  <span className="text-xs text-muted-foreground">
                    ({typeAccounts.length} accounts)
                  </span>
                </div>
                <span className="text-sm font-medium tabular-nums">
                  {formatBalance(String(typeTotal), type)}
                </span>
              </button>

              {/* Accounts in this type */}
              {isExpanded && (
                <div className="divide-y divide-border/50">
                  {typeAccounts.length === 0 ? (
                    <div className="px-4 py-3 text-sm text-muted-foreground italic">
                      No {ACCOUNT_TYPE_LABELS[type].toLowerCase()} accounts
                    </div>
                  ) : (
                    typeAccounts
                      .sort((a, b) => a.account_number.localeCompare(b.account_number))
                      .map((account) => (
                        <AccountRow
                          key={account.id}
                          account={account}
                          isOwner={isOwner}
                          isEditing={editingId === account.id}
                          editDisplayName={editDisplayName}
                          isPending={isPending}
                          onStartEdit={() => startEdit(account)}
                          onCancelEdit={cancelEdit}
                          onSaveEdit={() => handleSaveEdit(account.id)}
                          onDisplayNameChange={setEditDisplayName}
                          onDeactivate={() => handleDeactivate(account)}
                          onDelete={() => handleDelete(account)}
                          formatBalance={(balance) => formatBalance(balance, account.account_type)}
                        />
                      ))
                  )}
                </div>
              )}
            </div>
          )
        })}
      </div>

      {/* Add Account Dialog */}
      {showAddDialog && (
        <AddAccountDialog
          isOpen={showAddDialog}
          onClose={() => setShowAddDialog(false)}
          onSuccess={() => {
            setShowAddDialog(false)
            onRefresh()
          }}
        />
      )}
    </div>
  )
}

// ---------------------------------------------------------------------------
// Account row component
// ---------------------------------------------------------------------------

interface AccountRowProps {
  account: AccountRow
  isOwner: boolean
  isEditing: boolean
  editDisplayName: string
  isPending: boolean
  onStartEdit: () => void
  onCancelEdit: () => void
  onSaveEdit: () => void
  onDisplayNameChange: (value: string) => void
  onDeactivate: () => void
  onDelete: () => void
  formatBalance: (balance: string) => string
}

function AccountRow({
  account,
  isOwner,
  isEditing,
  editDisplayName,
  isPending,
  onStartEdit,
  onCancelEdit,
  onSaveEdit,
  onDisplayNameChange,
  onDeactivate,
  onDelete,
  formatBalance,
}: AccountRowProps) {
  const balance = parseFloat(account.balance)
  const hasActivity = !isNaN(balance) && Math.abs(balance) > 0.001

  return (
    <div className={cn("px-4 py-2.5 group", !account.is_active && "opacity-50")}>
      <div className="flex items-center gap-3">
        {/* Account number */}
        <span className="text-xs font-mono text-muted-foreground w-12 shrink-0">
          {account.account_number}
        </span>

        {/* Account name */}
        {isEditing ? (
          <div className="flex-1 flex items-center gap-2">
            <Input
              value={editDisplayName}
              onChange={(e) => onDisplayNameChange(e.target.value)}
              className="h-7 text-sm"
              autoFocus
              onKeyDown={(e) => {
                if (e.key === "Enter") onSaveEdit()
                if (e.key === "Escape") onCancelEdit()
              }}
            />
            <Button size="sm" className="h-7 px-2 text-xs" onClick={onSaveEdit} disabled={isPending}>
              Save
            </Button>
            <Button size="sm" variant="ghost" className="h-7 px-2 text-xs" onClick={onCancelEdit}>
              Cancel
            </Button>
          </div>
        ) : (
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2">
              <span className="text-sm font-medium truncate">{account.display_name}</span>
              {account.is_system && (
                <LockIcon className="h-3 w-3 text-muted-foreground/50 shrink-0" />
              )}
              {!account.is_active && (
                <Badge variant="outline" className="text-xs py-0">Inactive</Badge>
              )}
            </div>
            <span className="text-xs text-muted-foreground">{account.account_name}</span>
          </div>
        )}

        {/* Balance */}
        {!isEditing && (
          <span
            className={cn(
              "text-sm tabular-nums shrink-0",
              hasActivity ? "text-foreground" : "text-muted-foreground"
            )}
          >
            {formatBalance(account.balance)}
          </span>
        )}

        {/* Actions */}
        {isOwner && !isEditing && (
          <div className="hidden group-hover:flex items-center gap-1 shrink-0">
            <Button
              size="sm"
              variant="ghost"
              className="h-6 px-2 text-xs"
              onClick={onStartEdit}
            >
              Edit
            </Button>
            {!account.is_system && (
              <>
                {account.is_active && (
                  <Button
                    size="sm"
                    variant="ghost"
                    className="h-6 px-2 text-xs text-muted-foreground"
                    onClick={onDeactivate}
                    disabled={isPending}
                  >
                    Deactivate
                  </Button>
                )}
                <Button
                  size="sm"
                  variant="ghost"
                  className="h-6 px-2 text-xs text-destructive"
                  onClick={onDelete}
                  disabled={isPending || hasActivity}
                  title={hasActivity ? "Cannot delete: has transactions" : "Delete account"}
                >
                  Delete
                </Button>
              </>
            )}
          </div>
        )}
      </div>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Add Account Dialog
// ---------------------------------------------------------------------------

interface AddAccountDialogProps {
  isOpen: boolean
  onClose: () => void
  onSuccess: () => void
}

function AddAccountDialog({ isOpen, onClose, onSuccess }: AddAccountDialogProps) {
  const [accountNumber, setAccountNumber] = useState("")
  const [accountName, setAccountName] = useState("")
  const [displayName, setDisplayName] = useState("")
  const [accountType, setAccountType] = useState<AccountType>("expense")
  const [isPending, startTransition] = useTransition()

  function handleSubmit() {
    if (!accountNumber.trim() || !accountName.trim() || !displayName.trim()) {
      toast.error("All fields are required")
      return
    }

    startTransition(async () => {
      const result = await createAccount({
        accountNumber: accountNumber.trim(),
        accountName: accountName.trim(),
        accountType,
        displayName: displayName.trim(),
      })

      if (result.success) {
        toast.success("Account created")
        onSuccess()
      } else {
        toast.error(result.error ?? "Failed to create account")
      }
    })
  }

  return (
    <Dialog open={isOpen} onOpenChange={(open) => !open && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Add Custom Account</DialogTitle>
        </DialogHeader>
        <div className="space-y-4 py-2">
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <label className="text-sm font-medium">Account Number</label>
              <Input
                value={accountNumber}
                onChange={(e) => setAccountNumber(e.target.value)}
                placeholder="e.g. 5800"
                className="h-9"
              />
            </div>
            <div className="space-y-1.5">
              <label className="text-sm font-medium">Account Type</label>
              <Select value={accountType} onValueChange={(v) => setAccountType(v as AccountType)}>
                <SelectTrigger className="h-9">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {ACCOUNT_TYPE_ORDER.map((t) => (
                    <SelectItem key={t} value={t}>
                      {ACCOUNT_TYPE_LABELS[t]}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
          <div className="space-y-1.5">
            <label className="text-sm font-medium">Account Name</label>
            <Input
              value={accountName}
              onChange={(e) => setAccountName(e.target.value)}
              placeholder="Formal account name (e.g. Equipment Rental Expense)"
              className="h-9"
            />
          </div>
          <div className="space-y-1.5">
            <label className="text-sm font-medium">Display Name</label>
            <Input
              value={displayName}
              onChange={(e) => setDisplayName(e.target.value)}
              placeholder="Simplified name shown in reports (e.g. Equipment Rental)"
              className="h-9"
            />
            <p className="text-xs text-muted-foreground">
              This is the name shown in simplified reports.
            </p>
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose} disabled={isPending}>
            Cancel
          </Button>
          <Button onClick={handleSubmit} disabled={isPending}>
            {isPending ? "Adding..." : "Add Account"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
