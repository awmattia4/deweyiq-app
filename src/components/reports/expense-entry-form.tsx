"use client"

import { useState, useTransition } from "react"
import { PlusIcon, XIcon } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
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
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog"
import { EXPENSE_CATEGORIES } from "@/lib/db/schema/expenses"
import { createExpense } from "@/actions/expenses"
import { toLocalDateString } from "@/lib/date-utils"

// ---------------------------------------------------------------------------
// Category labels
// ---------------------------------------------------------------------------

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

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

interface ExpenseEntryFormProps {
  onExpenseCreated?: () => void
}

export function ExpenseEntryForm({ onExpenseCreated }: ExpenseEntryFormProps) {
  const [open, setOpen] = useState(false)
  const [isPending, startTransition] = useTransition()
  const [error, setError] = useState<string | null>(null)

  // Form state -- plain React state per MEMORY.md (no zod/hookform)
  // Amount uses local string state per MEMORY.md decimal input pattern
  const [amountStr, setAmountStr] = useState("")
  const [category, setCategory] = useState<string>("")
  const [date, setDate] = useState(toLocalDateString())
  const [description, setDescription] = useState("")

  function resetForm() {
    setAmountStr("")
    setCategory("")
    setDate(toLocalDateString())
    setDescription("")
    setError(null)
  }

  function handleSubmit() {
    // Validate
    const amount = parseFloat(amountStr)
    if (isNaN(amount) || amount <= 0) {
      setError("Amount must be a positive number")
      return
    }
    if (!category) {
      setError("Please select a category")
      return
    }
    if (!date) {
      setError("Please select a date")
      return
    }

    setError(null)

    startTransition(async () => {
      const result = await createExpense({
        amount: amount.toFixed(2),
        category,
        date,
        description: description.trim() || undefined,
      })

      if (!result.success) {
        setError(result.error ?? "Failed to create expense")
        return
      }

      resetForm()
      setOpen(false)
      onExpenseCreated?.()
    })
  }

  return (
    <Dialog open={open} onOpenChange={(v) => { setOpen(v); if (!v) resetForm() }}>
      <DialogTrigger asChild>
        <Button variant="outline" size="sm">
          <PlusIcon className="h-3.5 w-3.5 mr-1.5" />
          Add Expense
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Add Expense</DialogTitle>
          <DialogDescription>
            Record a business expense for P&L tracking.
          </DialogDescription>
        </DialogHeader>

        <div className="flex flex-col gap-4 mt-2">
          {error && (
            <p className="text-sm text-destructive" role="alert">
              {error}
            </p>
          )}

          {/* Amount */}
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="expense-amount">
              Amount <span className="text-destructive">*</span>
            </Label>
            <div className="relative">
              <span className="absolute left-3 top-1/2 -translate-y-1/2 text-sm text-muted-foreground">
                $
              </span>
              <Input
                id="expense-amount"
                type="text"
                inputMode="decimal"
                value={amountStr}
                onChange={(e) => {
                  const val = e.target.value
                  // Allow digits, decimal point, empty
                  if (/^(\d+\.?\d{0,2})?$/.test(val)) {
                    setAmountStr(val)
                  }
                }}
                onBlur={() => {
                  // Format on blur
                  const num = parseFloat(amountStr)
                  if (!isNaN(num) && num > 0) {
                    setAmountStr(num.toFixed(2))
                  }
                }}
                className="pl-7"
                placeholder="0.00"
                disabled={isPending}
              />
            </div>
          </div>

          {/* Category */}
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="expense-category">
              Category <span className="text-destructive">*</span>
            </Label>
            <Select
              value={category}
              onValueChange={setCategory}
              disabled={isPending}
            >
              <SelectTrigger id="expense-category">
                <SelectValue placeholder="Select category" />
              </SelectTrigger>
              <SelectContent>
                {EXPENSE_CATEGORIES.map((cat) => (
                  <SelectItem key={cat} value={cat}>
                    {CATEGORY_LABELS[cat] ?? cat}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* Date */}
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="expense-date">
              Date <span className="text-destructive">*</span>
            </Label>
            <Input
              id="expense-date"
              type="date"
              value={date}
              onChange={(e) => setDate(e.target.value)}
              disabled={isPending}
            />
          </div>

          {/* Description */}
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="expense-desc">Description</Label>
            <Input
              id="expense-desc"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Optional description..."
              disabled={isPending}
            />
          </div>

          {/* Actions */}
          <div className="flex justify-end gap-2 pt-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() => { setOpen(false); resetForm() }}
              disabled={isPending}
            >
              Cancel
            </Button>
            <Button
              size="sm"
              onClick={handleSubmit}
              disabled={isPending}
            >
              {isPending ? "Saving..." : "Add Expense"}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  )
}
