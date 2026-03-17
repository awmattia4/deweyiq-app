"use client"

/**
 * ChangeOrderBuilder — Office-facing form for creating and editing change orders.
 *
 * Features:
 * - Description textarea
 * - Reason dropdown (scope_change, unforeseen_conditions, customer_request, etc.)
 * - Line items with add/remove (description, category, quantity, unit_price, total)
 * - Cost impact auto-calculated from line items (supports negative amounts)
 * - Schedule impact field (positive = delay, 0 = no impact, negative = acceleration)
 * - Cost allocation selector (add_to_final / spread_remaining / collect_immediately)
 * - Preview: new contract total, schedule impact
 * - Save Draft + Send for Approval buttons
 * - Pre-populate from issue flag when converting (PROJ-61)
 *
 * Phase 12: Projects & Renovations — Plan 13
 */

import { useState, useEffect, useCallback } from "react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Textarea } from "@/components/ui/textarea"
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
  DialogClose,
} from "@/components/ui/dialog"
import { Card } from "@/components/ui/card"
import {
  createChangeOrder,
  updateChangeOrder,
  sendChangeOrder,
  type ChangeOrderSummary,
  type ChangeOrderLineItem,
  type CreateChangeOrderInput,
} from "@/actions/projects-change-orders"

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface ChangeOrderBuilderProps {
  projectId: string
  contractAmount: string | null
  estimatedCompletionDate: string | null
  // Pre-populate from issue flag
  prefillFromFlag?: {
    issueFlagId: string
    title: string
    description: string | null
    severity: string
  } | null
  // If editing an existing draft
  existingChangeOrder?: ChangeOrderSummary | null
  onSuccess?: (changeOrderId: string, sent: boolean) => void
  onClose?: () => void
}

interface LineItemRow {
  id: string // local temp ID
  description: string
  category: string
  quantityStr: string
  unitPriceStr: string
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const REASONS = [
  { value: "scope_change", label: "Scope Change" },
  { value: "unforeseen_conditions", label: "Unforeseen Conditions" },
  { value: "customer_request", label: "Customer Request" },
  { value: "design_change", label: "Design Change" },
  { value: "regulatory", label: "Regulatory / Code Requirement" },
  { value: "other", label: "Other" },
]

const LINE_ITEM_CATEGORIES = [
  { value: "material", label: "Material" },
  { value: "labor", label: "Labor" },
  { value: "subcontractor", label: "Subcontractor" },
  { value: "equipment", label: "Equipment" },
  { value: "permit", label: "Permit / Fee" },
  { value: "other", label: "Other" },
]

const COST_ALLOCATIONS = [
  {
    value: "add_to_final",
    label: "Add to final payment",
    description: "Increase the last unpaid milestone by this amount",
  },
  {
    value: "spread_remaining",
    label: "Spread across remaining milestones",
    description: "Distribute evenly across all unpaid milestones",
  },
  {
    value: "collect_immediately",
    label: "Collect immediately",
    description: "Create a new payment milestone for this amount",
  },
]

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function parseNum(s: string): number {
  const n = parseFloat(s)
  return isNaN(n) ? 0 : n
}

function formatCurrency(n: number): string {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: 2,
  }).format(n)
}

function newLineItem(): LineItemRow {
  return {
    id: crypto.randomUUID(),
    description: "",
    category: "material",
    quantityStr: "1",
    unitPriceStr: "",
  }
}

// ---------------------------------------------------------------------------
// ChangeOrderBuilder component
// ---------------------------------------------------------------------------

export function ChangeOrderBuilder({
  projectId,
  contractAmount,
  estimatedCompletionDate,
  prefillFromFlag,
  existingChangeOrder,
  onSuccess,
  onClose,
}: ChangeOrderBuilderProps) {
  // ── Form state ────────────────────────────────────────────────────────────
  const [description, setDescription] = useState("")
  const [reason, setReason] = useState("scope_change")
  const [lineItems, setLineItems] = useState<LineItemRow[]>([newLineItem()])
  const [scheduleImpactStr, setScheduleImpactStr] = useState("0")
  const [costAllocation, setCostAllocation] = useState("add_to_final")
  const [isSaving, setIsSaving] = useState(false)
  const [isSending, setIsSending] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // ── Pre-populate from issue flag or existing CO ───────────────────────────
  useEffect(() => {
    if (prefillFromFlag) {
      setDescription(
        prefillFromFlag.title +
          (prefillFromFlag.description ? `\n\n${prefillFromFlag.description}` : "")
      )
      const reasonMap: Record<string, string> = {
        low: "unforeseen_conditions",
        medium: "unforeseen_conditions",
        high: "scope_change",
        critical: "scope_change",
      }
      setReason(reasonMap[prefillFromFlag.severity] ?? "unforeseen_conditions")
    } else if (existingChangeOrder) {
      setDescription(existingChangeOrder.description)
      setReason(existingChangeOrder.reason)
      setScheduleImpactStr(String(existingChangeOrder.schedule_impact_days))
      setCostAllocation(existingChangeOrder.cost_allocation)
      if (existingChangeOrder.line_items && existingChangeOrder.line_items.length > 0) {
        setLineItems(
          existingChangeOrder.line_items.map((li) => ({
            id: crypto.randomUUID(),
            description: li.description,
            category: li.category,
            quantityStr: String(li.quantity),
            unitPriceStr: String(li.unit_price),
          }))
        )
      }
    }
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  // ── Computed values ───────────────────────────────────────────────────────
  const totalCostImpact = lineItems.reduce((sum, li) => {
    return sum + parseNum(li.quantityStr) * parseNum(li.unitPriceStr)
  }, 0)

  const currentContractAmount = parseFloat(contractAmount ?? "0")
  const newContractAmount = currentContractAmount + totalCostImpact
  const scheduleImpact = parseInt(scheduleImpactStr, 10) || 0

  // ── Line item handlers ────────────────────────────────────────────────────
  const addLineItem = useCallback(() => {
    setLineItems((prev) => [...prev, newLineItem()])
  }, [])

  const removeLineItem = useCallback((id: string) => {
    setLineItems((prev) => {
      if (prev.length === 1) return [newLineItem()]
      return prev.filter((li) => li.id !== id)
    })
  }, [])

  const updateLineItem = useCallback(
    (id: string, field: keyof LineItemRow, value: string) => {
      setLineItems((prev) =>
        prev.map((li) => (li.id === id ? { ...li, [field]: value } : li))
      )
    },
    []
  )

  // ── Build CreateChangeOrderInput from form state ──────────────────────────
  function buildInput(): CreateChangeOrderInput {
    const coLineItems: ChangeOrderLineItem[] = lineItems
      .filter((li) => li.description.trim() !== "")
      .map((li) => {
        const qty = parseNum(li.quantityStr)
        const price = parseNum(li.unitPriceStr)
        return {
          description: li.description.trim(),
          category: li.category,
          quantity: qty,
          unit_price: price,
          total: qty * price,
        }
      })

    return {
      description: description.trim(),
      reason,
      line_items: coLineItems,
      cost_impact: totalCostImpact,
      schedule_impact_days: scheduleImpact,
      cost_allocation: costAllocation,
      issue_flag_id: prefillFromFlag?.issueFlagId ?? null,
    }
  }

  function validate(): string | null {
    if (!description.trim()) return "Description is required"
    return null
  }

  // ── Save as draft ─────────────────────────────────────────────────────────
  async function handleSaveDraft() {
    const validationError = validate()
    if (validationError) {
      setError(validationError)
      return
    }
    setError(null)
    setIsSaving(true)

    try {
      const input = buildInput()
      let changeOrderId: string

      if (existingChangeOrder) {
        const result = await updateChangeOrder(existingChangeOrder.id, input)
        if (!result.success) {
          setError(result.error ?? "Failed to save change order")
          return
        }
        changeOrderId = existingChangeOrder.id
      } else {
        const result = await createChangeOrder(projectId, input)
        if (!result.success || !result.changeOrderId) {
          setError(result.error ?? "Failed to create change order")
          return
        }
        changeOrderId = result.changeOrderId
      }

      onSuccess?.(changeOrderId, false)
    } finally {
      setIsSaving(false)
    }
  }

  // ── Save + Send for Approval ──────────────────────────────────────────────
  async function handleSendForApproval() {
    const validationError = validate()
    if (validationError) {
      setError(validationError)
      return
    }
    setError(null)
    setIsSending(true)

    try {
      const input = buildInput()
      let changeOrderId: string

      // Always create/update first
      if (existingChangeOrder) {
        const updateResult = await updateChangeOrder(existingChangeOrder.id, input)
        if (!updateResult.success) {
          setError(updateResult.error ?? "Failed to save change order")
          return
        }
        changeOrderId = existingChangeOrder.id
      } else {
        const createResult = await createChangeOrder(projectId, input)
        if (!createResult.success || !createResult.changeOrderId) {
          setError(createResult.error ?? "Failed to create change order")
          return
        }
        changeOrderId = createResult.changeOrderId
      }

      // Now send
      const sendResult = await sendChangeOrder(changeOrderId)
      if (!sendResult.success) {
        setError(sendResult.error ?? "Failed to send change order email")
        return
      }

      onSuccess?.(changeOrderId, true)
    } finally {
      setIsSending(false)
    }
  }

  // ── Render ────────────────────────────────────────────────────────────────
  return (
    <div className="flex flex-col gap-5">
      {error && (
        <div className="rounded-md border border-destructive/40 bg-destructive/10 px-4 py-3 text-sm text-destructive">
          {error}
        </div>
      )}

      {/* ── Description ────────────────────────────────────────────────── */}
      <div className="flex flex-col gap-1.5">
        <label className="text-sm font-medium">Description of Change</label>
        <Textarea
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          placeholder="Describe what is changing and why..."
          rows={3}
          className="resize-none"
        />
      </div>

      {/* ── Reason ─────────────────────────────────────────────────────── */}
      <div className="flex flex-col gap-1.5">
        <label className="text-sm font-medium">Reason for Change</label>
        <Select value={reason} onValueChange={setReason}>
          <SelectTrigger>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {REASONS.map((r) => (
              <SelectItem key={r.value} value={r.value}>
                {r.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {/* ── Line Items ─────────────────────────────────────────────────── */}
      <div className="flex flex-col gap-2">
        <div className="flex items-center justify-between">
          <label className="text-sm font-medium">Line Items</label>
          <Button variant="outline" size="sm" onClick={addLineItem} type="button">
            Add Item
          </Button>
        </div>

        <div className="flex flex-col gap-2">
          {/* Header row */}
          <div className="grid grid-cols-[2fr_1fr_1fr_1fr_auto] gap-2 px-1 text-xs text-muted-foreground">
            <span>Description</span>
            <span>Category</span>
            <span>Qty</span>
            <span>Unit Price</span>
            <span className="w-8" />
          </div>

          {lineItems.map((li) => {
            const lineTotal = parseNum(li.quantityStr) * parseNum(li.unitPriceStr)
            return (
              <div
                key={li.id}
                className="grid grid-cols-[2fr_1fr_1fr_1fr_auto] gap-2 items-start"
              >
                <Input
                  value={li.description}
                  onChange={(e) => updateLineItem(li.id, "description", e.target.value)}
                  placeholder="Description"
                  className="h-8 text-sm"
                />
                <Select
                  value={li.category}
                  onValueChange={(v) => updateLineItem(li.id, "category", v)}
                >
                  <SelectTrigger className="h-8 text-sm">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {LINE_ITEM_CATEGORIES.map((c) => (
                      <SelectItem key={c.value} value={c.value} className="text-sm">
                        {c.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <Input
                  value={li.quantityStr}
                  onChange={(e) => updateLineItem(li.id, "quantityStr", e.target.value)}
                  placeholder="1"
                  className="h-8 text-sm"
                  type="number"
                  step="0.01"
                />
                <Input
                  value={li.unitPriceStr}
                  onChange={(e) => updateLineItem(li.id, "unitPriceStr", e.target.value)}
                  placeholder="0.00"
                  className="h-8 text-sm"
                  type="number"
                  step="0.01"
                />
                <div className="flex items-center gap-1">
                  {lineTotal !== 0 && (
                    <span
                      className={`text-xs font-medium tabular-nums w-20 text-right ${lineTotal < 0 ? "text-emerald-400" : "text-foreground"}`}
                    >
                      {formatCurrency(lineTotal)}
                    </span>
                  )}
                  <button
                    type="button"
                    onClick={() => removeLineItem(li.id)}
                    className="ml-1 text-muted-foreground hover:text-destructive transition-colors text-sm leading-none"
                  >
                    ×
                  </button>
                </div>
              </div>
            )
          })}
        </div>

        {/* Total cost impact */}
        <div className="flex items-center justify-between rounded-md bg-muted/40 px-3 py-2 mt-1">
          <span className="text-sm text-muted-foreground">Total Cost Impact</span>
          <span
            className={`text-base font-bold tabular-nums ${
              totalCostImpact > 0
                ? "text-red-400"
                : totalCostImpact < 0
                  ? "text-emerald-400"
                  : "text-muted-foreground"
            }`}
          >
            {totalCostImpact > 0 ? "+" : ""}
            {formatCurrency(totalCostImpact)}
          </span>
        </div>
      </div>

      {/* ── Schedule Impact ─────────────────────────────────────────────── */}
      <div className="flex flex-col gap-1.5">
        <label className="text-sm font-medium">Schedule Impact (days)</label>
        <p className="text-xs text-muted-foreground -mt-0.5">
          Positive = delay, 0 = no impact, negative = acceleration
        </p>
        <Input
          value={scheduleImpactStr}
          onChange={(e) => setScheduleImpactStr(e.target.value)}
          type="number"
          placeholder="0"
          className="w-32"
        />
      </div>

      {/* ── Cost Allocation ─────────────────────────────────────────────── */}
      <div className="flex flex-col gap-1.5">
        <label className="text-sm font-medium">Cost Allocation</label>
        <div className="flex flex-col gap-2">
          {COST_ALLOCATIONS.map((ca) => (
            <label
              key={ca.value}
              className={`flex items-start gap-3 rounded-md border px-3 py-2.5 cursor-pointer transition-colors ${
                costAllocation === ca.value
                  ? "border-primary bg-primary/5"
                  : "border-border hover:border-primary/50"
              }`}
            >
              <input
                type="radio"
                name="cost_allocation"
                value={ca.value}
                checked={costAllocation === ca.value}
                onChange={() => setCostAllocation(ca.value)}
                className="mt-0.5 accent-primary"
              />
              <div>
                <div className="text-sm font-medium">{ca.label}</div>
                <div className="text-xs text-muted-foreground">{ca.description}</div>
              </div>
            </label>
          ))}
        </div>
      </div>

      {/* ── Preview ─────────────────────────────────────────────────────── */}
      {(totalCostImpact !== 0 || scheduleImpact !== 0) && (
        <Card className="p-4 border-primary/30 bg-primary/5">
          <div className="text-xs font-semibold uppercase tracking-wide text-muted-foreground mb-3">
            Impact Preview
          </div>
          <div className="flex flex-col gap-2">
            {totalCostImpact !== 0 && (
              <div className="flex items-center justify-between text-sm">
                <span className="text-muted-foreground">New contract total</span>
                <span className="font-semibold">{formatCurrency(newContractAmount)}</span>
              </div>
            )}
            {totalCostImpact !== 0 && contractAmount && (
              <div className="flex items-center justify-between text-xs text-muted-foreground">
                <span>Current total</span>
                <span>{formatCurrency(currentContractAmount)}</span>
              </div>
            )}
            {scheduleImpact !== 0 && (
              <div className="flex items-center justify-between text-sm">
                <span className="text-muted-foreground">Schedule change</span>
                <span
                  className={
                    scheduleImpact > 0 ? "text-amber-400 font-medium" : "text-emerald-400 font-medium"
                  }
                >
                  {scheduleImpact > 0 ? `+${scheduleImpact}` : scheduleImpact} day
                  {Math.abs(scheduleImpact) !== 1 ? "s" : ""}
                </span>
              </div>
            )}
          </div>
        </Card>
      )}

      {/* ── Actions ─────────────────────────────────────────────────────── */}
      <div className="flex items-center justify-end gap-3 pt-2 border-t border-border">
        {onClose && (
          <Button variant="ghost" size="sm" onClick={onClose} type="button">
            Cancel
          </Button>
        )}
        <Button
          variant="outline"
          size="sm"
          onClick={handleSaveDraft}
          disabled={isSaving || isSending}
          type="button"
        >
          {isSaving ? "Saving..." : "Save Draft"}
        </Button>
        <Button
          size="sm"
          onClick={handleSendForApproval}
          disabled={isSaving || isSending}
          type="button"
        >
          {isSending ? "Sending..." : "Send for Approval"}
        </Button>
      </div>
    </div>
  )
}

// ---------------------------------------------------------------------------
// ChangeOrderBuilderDialog — wraps the builder in a Dialog
// ---------------------------------------------------------------------------

export interface ChangeOrderBuilderDialogProps extends ChangeOrderBuilderProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  title?: string
}

export function ChangeOrderBuilderDialog({
  open,
  onOpenChange,
  title,
  onClose,
  onSuccess,
  ...props
}: ChangeOrderBuilderDialogProps) {
  function handleSuccess(changeOrderId: string, sent: boolean) {
    onSuccess?.(changeOrderId, sent)
    onOpenChange(false)
  }

  function handleClose() {
    onClose?.()
    onOpenChange(false)
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{title ?? "Create Change Order"}</DialogTitle>
        </DialogHeader>
        <ChangeOrderBuilder
          {...props}
          onSuccess={handleSuccess}
          onClose={handleClose}
        />
      </DialogContent>
    </Dialog>
  )
}
