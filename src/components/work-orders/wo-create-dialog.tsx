"use client"

import { useState, useEffect, useTransition } from "react"
import { useRouter } from "next/navigation"
import { PlusIcon, Loader2Icon } from "lucide-react"
import { cn } from "@/lib/utils"
import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
  DialogDescription,
} from "@/components/ui/dialog"
import { createWorkOrder, getCustomersForWo } from "@/actions/work-orders"
import type { CustomerForWo } from "@/actions/work-orders"
import type { WoTemplate } from "@/actions/parts-catalog"

// ─── Constants ────────────────────────────────────────────────────────────────

const CATEGORY_OPTIONS = [
  { value: "pump", label: "Pump" },
  { value: "filter", label: "Filter" },
  { value: "heater", label: "Heater" },
  { value: "plumbing_leak", label: "Plumbing / Leak" },
  { value: "surface", label: "Surface" },
  { value: "electrical", label: "Electrical" },
  { value: "other", label: "Other" },
]

const PRIORITY_OPTIONS = [
  { value: "low", label: "Low", color: "bg-zinc-700 text-zinc-200 border-zinc-600" },
  { value: "normal", label: "Normal", color: "bg-blue-900/60 text-blue-300 border-blue-800" },
  { value: "high", label: "High", color: "bg-amber-900/60 text-amber-300 border-amber-800" },
  { value: "emergency", label: "Emergency", color: "bg-red-900/60 text-red-300 border-red-800" },
]

// ─── Types ────────────────────────────────────────────────────────────────────

interface WoCreateDialogProps {
  templates?: WoTemplate[]
}

// ─── Component ────────────────────────────────────────────────────────────────

/**
 * WoCreateDialog — Dialog for creating a new Work Order.
 *
 * Fields: customer, pool (populated after customer select), title,
 * description, category, priority, template selector, skip-quote checkbox.
 *
 * Uses plain React state + inline validation (per project convention —
 * zodResolver/hookform incompatibility documented in MEMORY.md).
 */
export function WoCreateDialog({ templates = [] }: WoCreateDialogProps) {
  const router = useRouter()
  const [isPending, startTransition] = useTransition()
  const [open, setOpen] = useState(false)
  const [customersData, setCustomersData] = useState<CustomerForWo[]>([])
  const [loadingCustomers, setLoadingCustomers] = useState(false)

  // Form state
  const [customerId, setCustomerId] = useState("")
  const [poolId, setPoolId] = useState("")
  const [title, setTitle] = useState("")
  const [description, setDescription] = useState("")
  const [category, setCategory] = useState("other")
  const [priority, setPriority] = useState("normal")
  const [templateId, setTemplateId] = useState("")
  const [skipQuote, setSkipQuote] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // Pools for the selected customer
  const selectedCustomer = customersData.find((c) => c.id === customerId)
  const availablePools = selectedCustomer?.pools ?? []

  // Load customers when dialog opens
  useEffect(() => {
    if (open && customersData.length === 0) {
      setLoadingCustomers(true)
      getCustomersForWo()
        .then((data) => setCustomersData(data))
        .finally(() => setLoadingCustomers(false))
    }
  }, [open, customersData.length])

  // When template is selected, pre-fill fields from template
  function handleTemplateChange(tid: string) {
    setTemplateId(tid)
    if (!tid) return
    const tpl = templates.find((t) => t.id === tid)
    if (!tpl) return
    if (tpl.category) setCategory(tpl.category)
    setPriority(tpl.default_priority ?? "normal")
    if (tpl.name && !title) setTitle(tpl.name)
  }

  // Reset form on close
  function handleOpenChange(val: boolean) {
    setOpen(val)
    if (!val) {
      setCustomerId("")
      setPoolId("")
      setTitle("")
      setDescription("")
      setCategory("other")
      setPriority("normal")
      setTemplateId("")
      setSkipQuote(false)
      setError(null)
    }
  }

  // Customer change: reset pool
  function handleCustomerChange(cid: string) {
    setCustomerId(cid)
    setPoolId("")
  }

  function validate(): string | null {
    if (!customerId) return "Please select a customer."
    if (!title.trim()) return "Title is required."
    return null
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    const validationError = validate()
    if (validationError) {
      setError(validationError)
      return
    }
    setError(null)

    startTransition(async () => {
      const newWoId = await createWorkOrder({
        customerId,
        poolId: poolId || undefined,
        title: title.trim(),
        description: description.trim() || undefined,
        category,
        priority,
        templateId: templateId || undefined,
      })

      if (!newWoId) {
        setError("Failed to create work order. Please try again.")
        return
      }

      handleOpenChange(false)
      router.refresh()
      // Navigate to the new WO detail page
      router.push(`/work-orders/${newWoId}`)
    })
  }

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogTrigger asChild>
        <Button size="sm" className="gap-1.5">
          <PlusIcon className="h-4 w-4" />
          New Work Order
        </Button>
      </DialogTrigger>

      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>New Work Order</DialogTitle>
          <DialogDescription>
            Create a work order for a customer. You can add line items after creation.
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="flex flex-col gap-4">
          {/* ── Template selector ──────────────────────────────────────── */}
          {templates.length > 0 && (
            <div className="flex flex-col gap-1.5">
              <label className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
                Template (optional)
              </label>
              <select
                value={templateId}
                onChange={(e) => handleTemplateChange(e.target.value)}
                className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
              >
                <option value="">Select a template...</option>
                {templates.map((t) => (
                  <option key={t.id} value={t.id}>
                    {t.name}
                  </option>
                ))}
              </select>
            </div>
          )}

          {/* ── Customer selector ──────────────────────────────────────── */}
          <div className="flex flex-col gap-1.5">
            <label className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
              Customer <span className="text-destructive">*</span>
            </label>
            {loadingCustomers ? (
              <div className="flex items-center gap-2 rounded-md border border-input bg-background px-3 py-2 text-sm text-muted-foreground">
                <Loader2Icon className="h-3.5 w-3.5 animate-spin" />
                Loading customers...
              </div>
            ) : (
              <select
                value={customerId}
                onChange={(e) => handleCustomerChange(e.target.value)}
                className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
                required
              >
                <option value="">Select a customer...</option>
                {customersData.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.full_name}
                  </option>
                ))}
              </select>
            )}
          </div>

          {/* ── Pool selector (populated after customer selection) ──────── */}
          {customerId && (
            <div className="flex flex-col gap-1.5">
              <label className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
                Pool (optional)
              </label>
              <select
                value={poolId}
                onChange={(e) => setPoolId(e.target.value)}
                className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
              >
                <option value="">No specific pool</option>
                {availablePools.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name} ({p.type})
                  </option>
                ))}
              </select>
            </div>
          )}

          {/* ── Title ─────────────────────────────────────────────────────── */}
          <div className="flex flex-col gap-1.5">
            <label className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
              Title <span className="text-destructive">*</span>
            </label>
            <input
              type="text"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="e.g. Replace pump motor"
              className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm placeholder:text-muted-foreground/50 focus:outline-none focus:ring-2 focus:ring-ring"
              required
            />
          </div>

          {/* ── Description ───────────────────────────────────────────────── */}
          <div className="flex flex-col gap-1.5">
            <label className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
              Description (optional)
            </label>
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Additional details..."
              rows={3}
              className="w-full resize-none rounded-md border border-input bg-background px-3 py-2 text-sm placeholder:text-muted-foreground/50 focus:outline-none focus:ring-2 focus:ring-ring"
            />
          </div>

          {/* ── Category picker ───────────────────────────────────────────── */}
          <div className="flex flex-col gap-1.5">
            <label className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
              Category
            </label>
            <div className="flex flex-wrap gap-2">
              {CATEGORY_OPTIONS.map((opt) => (
                <button
                  key={opt.value}
                  type="button"
                  onClick={() => setCategory(opt.value)}
                  className={cn(
                    "cursor-pointer rounded-full px-3 py-1 text-xs font-medium transition-colors",
                    category === opt.value
                      ? "bg-primary text-primary-foreground"
                      : "bg-muted text-muted-foreground hover:bg-muted/80 hover:text-foreground"
                  )}
                >
                  {opt.label}
                </button>
              ))}
            </div>
          </div>

          {/* ── Priority picker ───────────────────────────────────────────── */}
          <div className="flex flex-col gap-1.5">
            <label className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
              Priority
            </label>
            <div className="flex flex-wrap gap-2">
              {PRIORITY_OPTIONS.map((opt) => (
                <button
                  key={opt.value}
                  type="button"
                  onClick={() => setPriority(opt.value)}
                  className={cn(
                    "cursor-pointer rounded-full border px-3 py-1 text-xs font-semibold transition-colors",
                    priority === opt.value
                      ? opt.color
                      : "border-border bg-muted text-muted-foreground hover:bg-muted/80 hover:text-foreground"
                  )}
                >
                  {opt.label}
                </button>
              ))}
            </div>
          </div>

          {/* ── Skip quote checkbox ────────────────────────────────────────── */}
          <div className="flex items-center gap-2">
            <input
              id="skip-quote"
              type="checkbox"
              checked={skipQuote}
              onChange={(e) => setSkipQuote(e.target.checked)}
              className="h-4 w-4 cursor-pointer rounded border border-input bg-background accent-primary"
            />
            <label
              htmlFor="skip-quote"
              className="cursor-pointer text-sm text-muted-foreground"
            >
              Skip quoting <span className="text-muted-foreground/60">(small job — approve directly)</span>
            </label>
          </div>

          {/* ── Error message ─────────────────────────────────────────────── */}
          {error && (
            <p className="rounded-md bg-destructive/10 px-3 py-2 text-sm text-destructive">
              {error}
            </p>
          )}

          {/* ── Actions ───────────────────────────────────────────────────── */}
          <div className="flex justify-end gap-2 pt-2">
            <Button
              type="button"
              variant="ghost"
              onClick={() => handleOpenChange(false)}
              disabled={isPending}
            >
              Cancel
            </Button>
            <Button type="submit" disabled={isPending}>
              {isPending && <Loader2Icon className="mr-1.5 h-4 w-4 animate-spin" />}
              Create Work Order
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  )
}
