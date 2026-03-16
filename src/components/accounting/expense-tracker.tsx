"use client"

/**
 * ExpenseTracker — Full expense management UI for the accounting page.
 *
 * Two views:
 * 1. Quick expense list — recent expenses, add form, category filter, receipt photo.
 * 2. AP workflow — expenses grouped by vendor, unpaid bill tracking.
 *
 * Receipt upload: uses createReceiptUploadUrl → uploads directly to Supabase Storage.
 * Category summary: recharts BarChart showing spend by category this period.
 *
 * Phase 11 (Plan 10): New component.
 */

import { useState, useRef, useCallback, useTransition } from "react"
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Cell } from "recharts"
import { PlusIcon, ReceiptIcon, ChevronDownIcon } from "lucide-react"
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
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import {
  createExpense,
  updateExpenseReceipt,
  deleteExpense,
  getExpenses,
  getExpenseSummary,
  createReceiptUploadUrl,
} from "@/actions/expenses"
import { EXPENSE_CATEGORY_LABELS } from "@/lib/db/schema/expenses"
import type { ExpenseCategory } from "@/lib/db/schema/expenses"
import { toLocalDateString } from "@/lib/date-utils"

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface Expense {
  id: string
  amount: string
  category: string
  description: string | null
  date: string
  receipt_url: string | null
  vendor_name: string | null
  created_by_name: string | null
  created_at: Date
}

interface CategorySummary {
  category: string
  total: string
  count: number
}

interface Props {
  initialExpenses: Expense[]
  initialSummary: CategorySummary[]
  startDate: string
  endDate: string
  isOwner: boolean
}

// ---------------------------------------------------------------------------
// Category colors for bar chart
// ---------------------------------------------------------------------------

const CATEGORY_COLORS: Record<string, string> = {
  chemicals: "#60a5fa",
  parts: "#34d399",
  fuel: "#f97316",
  vehicle_maintenance: "#a78bfa",
  subcontractor: "#fb7185",
  insurance: "#fbbf24",
  marketing: "#38bdf8",
  office: "#94a3b8",
  other: "#64748b",
}

// ---------------------------------------------------------------------------
// Add Expense Form
// ---------------------------------------------------------------------------

function AddExpenseForm({
  onSuccess,
}: {
  onSuccess: () => void
}) {
  const [isPending, startTransition] = useTransition()
  const [error, setError] = useState<string | null>(null)
  const [receiptFile, setReceiptFile] = useState<File | null>(null)
  const [uploadingReceipt, setUploadingReceipt] = useState(false)
  const fileInputRef = useRef<HTMLInputElement>(null)

  const today = toLocalDateString(new Date())

  const [form, setForm] = useState({
    amount: "",
    category: "chemicals" as ExpenseCategory,
    description: "",
    date: today,
    vendorName: "",
  })

  const handleReceiptChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (file) setReceiptFile(file)
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError(null)

    if (!form.amount || parseFloat(form.amount) <= 0) {
      setError("Amount is required")
      return
    }

    startTransition(async () => {
      // Create the expense first
      const result = await createExpense({
        amount: form.amount,
        category: form.category,
        description: form.description || undefined,
        date: form.date,
        vendorName: form.vendorName || undefined,
      })

      if (!result.success) {
        setError(result.error ?? "Failed to create expense")
        return
      }

      // Upload receipt if one was selected
      if (receiptFile && result.expenseId) {
        setUploadingReceipt(true)
        try {
          // Compress image before upload if browser-image-compression is available
          let fileToUpload: File | Blob = receiptFile

          try {
            const imageCompression = (await import("browser-image-compression")).default
            fileToUpload = await imageCompression(receiptFile, {
              maxSizeMB: 0.5,
              maxWidthOrHeight: 1200,
              useWebWorker: true,
            })
          } catch {
            // Compression failed — use original file
          }

          const urlResult = await createReceiptUploadUrl(result.expenseId)
          if (urlResult.success && urlResult.uploadUrl) {
            await fetch(urlResult.uploadUrl, {
              method: "PUT",
              body: fileToUpload,
              headers: { "Content-Type": "image/jpeg" },
            })

            // Build public URL from file path
            const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
            const publicUrl = `${supabaseUrl}/storage/v1/object/public/expense-receipts/${urlResult.filePath}`
            await updateExpenseReceipt(result.expenseId, publicUrl)
          }
        } catch {
          // Receipt upload failure doesn't block expense creation
          console.error("[ExpenseTracker] Receipt upload failed")
        } finally {
          setUploadingReceipt(false)
        }
      }

      // Reset form
      setForm({
        amount: "",
        category: "chemicals",
        description: "",
        date: today,
        vendorName: "",
      })
      setReceiptFile(null)
      if (fileInputRef.current) fileInputRef.current.value = ""
      onSuccess()
    })
  }

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-4">
      {error && (
        <p className="text-sm text-destructive">{error}</p>
      )}

      <div className="grid grid-cols-2 gap-3">
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="expense-amount">Amount</Label>
          <Input
            id="expense-amount"
            type="number"
            step="0.01"
            min="0.01"
            placeholder="0.00"
            value={form.amount}
            onChange={(e) => setForm((f) => ({ ...f, amount: e.target.value }))}
            required
          />
        </div>

        <div className="flex flex-col gap-1.5">
          <Label htmlFor="expense-date">Date</Label>
          <Input
            id="expense-date"
            type="date"
            value={form.date}
            onChange={(e) => setForm((f) => ({ ...f, date: e.target.value }))}
            required
          />
        </div>
      </div>

      <div className="flex flex-col gap-1.5">
        <Label htmlFor="expense-category">Category</Label>
        <Select
          value={form.category}
          onValueChange={(v) => setForm((f) => ({ ...f, category: v as ExpenseCategory }))}
        >
          <SelectTrigger id="expense-category">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {Object.entries(EXPENSE_CATEGORY_LABELS).map(([value, label]) => (
              <SelectItem key={value} value={value}>
                {label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <div className="flex flex-col gap-1.5">
        <Label htmlFor="expense-vendor">Vendor (optional)</Label>
        <Input
          id="expense-vendor"
          placeholder="Pool Supply Co., Amazon, Shell..."
          value={form.vendorName}
          onChange={(e) => setForm((f) => ({ ...f, vendorName: e.target.value }))}
        />
      </div>

      <div className="flex flex-col gap-1.5">
        <Label htmlFor="expense-description">Notes (optional)</Label>
        <Input
          id="expense-description"
          placeholder="What was purchased..."
          value={form.description}
          onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))}
        />
      </div>

      <div className="flex flex-col gap-1.5">
        <Label>Receipt Photo (optional)</Label>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => fileInputRef.current?.click()}
            className="flex items-center gap-2 rounded-md border border-dashed border-border/60 bg-muted/20 px-4 py-2.5 text-sm text-muted-foreground hover:border-border hover:text-foreground transition-colors"
          >
            <ReceiptIcon className="h-4 w-4" />
            {receiptFile ? receiptFile.name : "Attach receipt photo"}
          </button>
          {receiptFile && (
            <button
              type="button"
              onClick={() => {
                setReceiptFile(null)
                if (fileInputRef.current) fileInputRef.current.value = ""
              }}
              className="text-xs text-muted-foreground hover:text-destructive"
            >
              Remove
            </button>
          )}
        </div>
        <input
          ref={fileInputRef}
          type="file"
          accept="image/*"
          capture="environment"
          className="hidden"
          onChange={handleReceiptChange}
        />
      </div>

      <Button type="submit" disabled={isPending || uploadingReceipt} className="w-full">
        {isPending || uploadingReceipt ? "Saving..." : "Add Expense"}
      </Button>
    </form>
  )
}

// ---------------------------------------------------------------------------
// Expense Row
// ---------------------------------------------------------------------------

function ExpenseRow({
  expense,
  isOwner,
  onDelete,
}: {
  expense: Expense
  isOwner: boolean
  onDelete: (id: string) => void
}) {
  const amount = parseFloat(expense.amount)
  const label = EXPENSE_CATEGORY_LABELS[expense.category as ExpenseCategory] ?? expense.category

  return (
    <div className="flex items-center justify-between py-3 border-b border-border/40 last:border-0 gap-3">
      <div className="flex flex-col gap-0.5 min-w-0">
        <div className="flex items-center gap-2">
          <span className="text-sm font-medium">${amount.toFixed(2)}</span>
          <Badge variant="secondary" className="text-xs font-normal">
            {label}
          </Badge>
        </div>
        <div className="text-xs text-muted-foreground flex items-center gap-1.5 flex-wrap">
          <span>{expense.date}</span>
          {expense.vendor_name && (
            <>
              <span>·</span>
              <span>{expense.vendor_name}</span>
            </>
          )}
          {expense.description && (
            <>
              <span>·</span>
              <span className="truncate max-w-[200px]">{expense.description}</span>
            </>
          )}
        </div>
      </div>
      <div className="flex items-center gap-2 shrink-0">
        {expense.receipt_url && (
          <a
            href={expense.receipt_url}
            target="_blank"
            rel="noopener noreferrer"
            className="text-muted-foreground hover:text-foreground"
            title="View receipt"
          >
            <ReceiptIcon className="h-4 w-4" />
          </a>
        )}
        {isOwner && (
          <button
            type="button"
            onClick={() => onDelete(expense.id)}
            className="text-xs text-muted-foreground hover:text-destructive transition-colors"
          >
            Delete
          </button>
        )}
      </div>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Vendor Group (AP workflow view)
// ---------------------------------------------------------------------------

function VendorGroup({
  vendorName,
  expenses,
  isOwner,
  onDelete,
}: {
  vendorName: string
  expenses: Expense[]
  isOwner: boolean
  onDelete: (id: string) => void
}) {
  const [open, setOpen] = useState(false)
  const total = expenses.reduce((sum, e) => sum + parseFloat(e.amount), 0)

  return (
    <div className="border border-border/40 rounded-lg overflow-hidden">
      <button
        type="button"
        onClick={() => setOpen(!open)}
        className="w-full flex items-center justify-between p-3 text-left hover:bg-muted/20 transition-colors"
      >
        <div className="flex flex-col gap-0.5">
          <span className="text-sm font-medium">{vendorName}</span>
          <span className="text-xs text-muted-foreground">{expenses.length} expense{expenses.length !== 1 ? "s" : ""}</span>
        </div>
        <div className="flex items-center gap-2">
          <span className="text-sm font-medium">${total.toFixed(2)}</span>
          <ChevronDownIcon
            className={`h-4 w-4 text-muted-foreground transition-transform ${open ? "rotate-180" : ""}`}
          />
        </div>
      </button>
      {open && (
        <div className="border-t border-border/40 px-3">
          {expenses.map((e) => (
            <ExpenseRow key={e.id} expense={e} isOwner={isOwner} onDelete={onDelete} />
          ))}
        </div>
      )}
    </div>
  )
}

// ---------------------------------------------------------------------------
// Main Component
// ---------------------------------------------------------------------------

export function ExpenseTracker({
  initialExpenses,
  initialSummary,
  startDate,
  endDate,
  isOwner,
}: Props) {
  const [expenses, setExpenses] = useState<Expense[]>(initialExpenses)
  const [summary, setSummary] = useState<CategorySummary[]>(initialSummary)
  const [view, setView] = useState<"quick" | "ap">("quick")
  const [showAddForm, setShowAddForm] = useState(false)
  const [categoryFilter, setCategoryFilter] = useState<string>("all")
  const [isPending, startTransition] = useTransition()

  const refresh = useCallback(() => {
    startTransition(async () => {
      const [freshExpenses, freshSummary] = await Promise.all([
        getExpenses(startDate, endDate),
        getExpenseSummary(startDate, endDate),
      ])
      setExpenses(freshExpenses)
      setSummary(freshSummary)
      setShowAddForm(false)
    })
  }, [startDate, endDate])

  const handleDelete = useCallback(async (expenseId: string) => {
    const result = await deleteExpense(expenseId)
    if (result.success) {
      setExpenses((prev) => prev.filter((e) => e.id !== expenseId))
      // Refresh summary
      const freshSummary = await getExpenseSummary(startDate, endDate)
      setSummary(freshSummary)
    }
  }, [startDate, endDate])

  const totalExpenses = expenses.reduce((sum, e) => sum + parseFloat(e.amount), 0)

  const filteredExpenses =
    categoryFilter === "all"
      ? expenses
      : expenses.filter((e) => e.category === categoryFilter)

  // Group by vendor for AP view
  const vendorGroups = filteredExpenses.reduce<Record<string, Expense[]>>((acc, e) => {
    const key = e.vendor_name ?? "No vendor"
    if (!acc[key]) acc[key] = []
    acc[key].push(e)
    return acc
  }, {})

  // Chart data
  const chartData = summary.map((s) => ({
    name: EXPENSE_CATEGORY_LABELS[s.category as ExpenseCategory] ?? s.category,
    amount: parseFloat(s.total),
    category: s.category,
  }))

  return (
    <div className="flex flex-col gap-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex flex-col gap-0.5">
          <span className="text-sm text-muted-foreground">
            Total expenses ({startDate} to {endDate})
          </span>
          <span className="text-2xl font-bold">${totalExpenses.toFixed(2)}</span>
        </div>
        <Button size="sm" onClick={() => setShowAddForm(!showAddForm)}>
          <PlusIcon className="h-4 w-4 mr-1.5" />
          Add Expense
        </Button>
      </div>

      {/* Add form */}
      {showAddForm && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">New Expense</CardTitle>
          </CardHeader>
          <CardContent>
            <AddExpenseForm onSuccess={refresh} />
          </CardContent>
        </Card>
      )}

      {/* Category summary chart */}
      {chartData.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="text-sm font-medium text-muted-foreground">By Category</CardTitle>
          </CardHeader>
          <CardContent className="p-0 pb-4">
            <ResponsiveContainer width="100%" height={180}>
              <BarChart data={chartData} margin={{ top: 0, right: 16, left: 0, bottom: 0 }}>
                <XAxis
                  dataKey="name"
                  tick={{ fontSize: 11, fill: "#94a3b8" }}
                  axisLine={false}
                  tickLine={false}
                />
                <YAxis
                  tick={{ fontSize: 11, fill: "#94a3b8" }}
                  axisLine={false}
                  tickLine={false}
                  tickFormatter={(v) => `$${v}`}
                />
                <Tooltip
                  formatter={(value) => [`$${(Number(value)).toFixed(2)}`, "Amount"]}
                  contentStyle={{
                    backgroundColor: "#1e293b",
                    border: "1px solid #334155",
                    borderRadius: "6px",
                    fontSize: "12px",
                  }}
                />
                <Bar dataKey="amount" radius={[3, 3, 0, 0]}>
                  {chartData.map((entry) => (
                    <Cell
                      key={entry.category}
                      fill={CATEGORY_COLORS[entry.category] ?? "#64748b"}
                    />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>
      )}

      {/* View toggle + filters */}
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div className="flex rounded-md border border-border overflow-hidden text-sm">
          <button
            type="button"
            onClick={() => setView("quick")}
            className={`px-3 py-1.5 transition-colors ${
              view === "quick"
                ? "bg-primary text-primary-foreground"
                : "text-muted-foreground hover:text-foreground"
            }`}
          >
            All Expenses
          </button>
          <button
            type="button"
            onClick={() => setView("ap")}
            className={`px-3 py-1.5 border-l border-border transition-colors ${
              view === "ap"
                ? "bg-primary text-primary-foreground"
                : "text-muted-foreground hover:text-foreground"
            }`}
          >
            By Vendor
          </button>
        </div>

        <Select value={categoryFilter} onValueChange={setCategoryFilter}>
          <SelectTrigger className="w-[160px] h-8 text-sm">
            <SelectValue placeholder="All categories" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All categories</SelectItem>
            {Object.entries(EXPENSE_CATEGORY_LABELS).map(([value, label]) => (
              <SelectItem key={value} value={value}>
                {label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {/* Expense list */}
      {filteredExpenses.length === 0 ? (
        <p className="text-sm text-muted-foreground italic">
          No expenses found for the selected period.
        </p>
      ) : view === "quick" ? (
        <Card>
          <CardContent className="p-0 px-4">
            {filteredExpenses.map((expense) => (
              <ExpenseRow
                key={expense.id}
                expense={expense}
                isOwner={isOwner}
                onDelete={handleDelete}
              />
            ))}
          </CardContent>
        </Card>
      ) : (
        <div className="flex flex-col gap-3">
          {Object.entries(vendorGroups)
            .sort(([, a], [, b]) => {
              const totalA = a.reduce((s, e) => s + parseFloat(e.amount), 0)
              const totalB = b.reduce((s, e) => s + parseFloat(e.amount), 0)
              return totalB - totalA
            })
            .map(([vendorName, vendorExpenses]) => (
              <VendorGroup
                key={vendorName}
                vendorName={vendorName}
                expenses={vendorExpenses}
                isOwner={isOwner}
                onDelete={handleDelete}
              />
            ))}
        </div>
      )}
    </div>
  )
}
