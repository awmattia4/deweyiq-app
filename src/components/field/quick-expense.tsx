"use client"

/**
 * QuickExpense — Minimal expense entry for field techs.
 *
 * Friction-free design: amount + category quick-select + optional receipt.
 * Used from the routes page for rapid field expense logging.
 *
 * Phase 11 (Plan 10): New component.
 */

import { useState, useRef, useTransition } from "react"
import { DollarSignIcon, ReceiptIcon, XIcon } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { createExpense, createReceiptUploadUrl, updateExpenseReceipt } from "@/actions/expenses"
import { toLocalDateString } from "@/lib/date-utils"

// ---------------------------------------------------------------------------
// Quick category options for field techs
// ---------------------------------------------------------------------------

const QUICK_CATEGORIES = [
  { value: "chemicals", label: "Chemicals" },
  { value: "parts", label: "Parts" },
  { value: "fuel", label: "Fuel" },
  { value: "other", label: "Other" },
] as const

type QuickCategory = (typeof QUICK_CATEGORIES)[number]["value"]

// ---------------------------------------------------------------------------
// Props
// ---------------------------------------------------------------------------

interface Props {
  onClose?: () => void
  onSuccess?: () => void
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function QuickExpense({ onClose, onSuccess }: Props) {
  const [isPending, startTransition] = useTransition()
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState(false)
  const [receiptFile, setReceiptFile] = useState<File | null>(null)
  const [category, setCategory] = useState<QuickCategory>("chemicals")
  const [amountStr, setAmountStr] = useState("")
  const fileInputRef = useRef<HTMLInputElement>(null)

  const today = toLocalDateString(new Date())

  const handleReceiptChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (file) setReceiptFile(file)
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError(null)

    const amount = parseFloat(amountStr)
    if (isNaN(amount) || amount <= 0) {
      setError("Enter a valid amount")
      return
    }

    startTransition(async () => {
      const result = await createExpense({
        amount: amountStr,
        category,
        date: today,
      })

      if (!result.success) {
        setError(result.error ?? "Failed to save expense")
        return
      }

      // Upload receipt if provided
      if (receiptFile && result.expenseId) {
        try {
          let fileToUpload: File | Blob = receiptFile
          try {
            const imageCompression = (await import("browser-image-compression")).default
            fileToUpload = await imageCompression(receiptFile, {
              maxSizeMB: 0.5,
              maxWidthOrHeight: 1200,
              useWebWorker: true,
            })
          } catch {
            // Compression failed — use original
          }

          const urlResult = await createReceiptUploadUrl(result.expenseId)
          if (urlResult.success && urlResult.uploadUrl) {
            await fetch(urlResult.uploadUrl, {
              method: "PUT",
              body: fileToUpload,
              headers: { "Content-Type": "image/jpeg" },
            })

            const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
            const publicUrl = `${supabaseUrl}/storage/v1/object/public/expense-receipts/${urlResult.filePath}`
            await updateExpenseReceipt(result.expenseId, publicUrl)
          }
        } catch {
          // Receipt failure is non-blocking
        }
      }

      setSuccess(true)
      setTimeout(() => {
        setSuccess(false)
        setAmountStr("")
        setCategory("chemicals")
        setReceiptFile(null)
        if (fileInputRef.current) fileInputRef.current.value = ""
        onSuccess?.()
        onClose?.()
      }, 1200)
    })
  }

  return (
    <div className="bg-card border border-border rounded-xl p-4 shadow-lg w-full max-w-sm">
      {/* Header */}
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2">
          <DollarSignIcon className="h-4 w-4 text-primary" />
          <span className="text-sm font-semibold">Log Expense</span>
        </div>
        {onClose && (
          <button
            type="button"
            onClick={onClose}
            className="text-muted-foreground hover:text-foreground"
          >
            <XIcon className="h-4 w-4" />
          </button>
        )}
      </div>

      {success ? (
        <div className="py-4 text-center">
          <p className="text-sm font-medium text-primary">Expense saved.</p>
        </div>
      ) : (
        <form onSubmit={handleSubmit} className="flex flex-col gap-4">
          {error && <p className="text-xs text-destructive">{error}</p>}

          {/* Amount */}
          <div className="relative">
            <span className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground text-sm">
              $
            </span>
            <Input
              type="number"
              step="0.01"
              min="0.01"
              placeholder="0.00"
              value={amountStr}
              onChange={(e) => setAmountStr(e.target.value)}
              className="pl-7 text-lg h-12"
              autoFocus
              required
            />
          </div>

          {/* Category quick-select */}
          <div className="grid grid-cols-4 gap-1.5">
            {QUICK_CATEGORIES.map((cat) => (
              <button
                key={cat.value}
                type="button"
                onClick={() => setCategory(cat.value)}
                className={`py-2 px-1 rounded-md text-xs font-medium transition-colors border ${
                  category === cat.value
                    ? "bg-primary text-primary-foreground border-primary"
                    : "bg-muted/20 text-muted-foreground border-border/40 hover:border-border"
                }`}
              >
                {cat.label}
              </button>
            ))}
          </div>

          {/* Receipt photo */}
          <div>
            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              className="w-full flex items-center justify-center gap-2 rounded-md border border-dashed border-border/60 bg-muted/10 py-2.5 text-sm text-muted-foreground hover:border-border hover:text-foreground transition-colors"
            >
              <ReceiptIcon className="h-4 w-4" />
              {receiptFile ? (
                <span className="truncate max-w-[180px]">{receiptFile.name}</span>
              ) : (
                "Attach receipt (optional)"
              )}
            </button>
            <input
              ref={fileInputRef}
              type="file"
              accept="image/*"
              capture="environment"
              className="hidden"
              onChange={handleReceiptChange}
            />
          </div>

          <Button type="submit" disabled={isPending} className="w-full h-11">
            {isPending ? "Saving..." : "Save Expense"}
          </Button>
        </form>
      )}
    </div>
  )
}

// ---------------------------------------------------------------------------
// QuickExpenseButton — Floating trigger for the routes page
// ---------------------------------------------------------------------------

interface QuickExpenseButtonProps {
  className?: string
}

export function QuickExpenseButton({ className }: QuickExpenseButtonProps) {
  const [open, setOpen] = useState(false)

  return (
    <div className={className}>
      <Button
        size="sm"
        variant="outline"
        onClick={() => setOpen(!open)}
        className="flex items-center gap-1.5"
      >
        <DollarSignIcon className="h-4 w-4" />
        Log Expense
      </Button>

      {open && (
        <div className="mt-2">
          <QuickExpense onClose={() => setOpen(false)} />
        </div>
      )}
    </div>
  )
}
