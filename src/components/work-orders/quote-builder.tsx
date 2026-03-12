"use client"

/**
 * quote-builder.tsx — Quote builder UI component.
 *
 * Displayed on the WO detail page when office staff clicks "Create Quote"
 * or "Edit Quote". Allows editing scope of work, optional item flags,
 * expiration, terms, and a live totals preview before sending.
 *
 * Key patterns:
 * - Local string state for all decimal inputs (NEVER parseFloat on change)
 * - Full flow: save draft, send with confirmation dialog, preview PDF
 * - If changes_requested: shows customer change note + "Revise Quote" button
 */

import React, { useState, useTransition } from "react"
import { cn } from "@/lib/utils"
import { Button } from "@/components/ui/button"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { Input } from "@/components/ui/input"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Badge } from "@/components/ui/badge"
import { Separator } from "@/components/ui/separator"
import { Switch } from "@/components/ui/switch"
import {
  Send,
  FileText,
  Plus,
  AlertTriangle,
  CheckCircle,
  Clock,
  RefreshCw,
  Loader2,
} from "lucide-react"
import { toast } from "sonner"
import {
  createQuote,
  sendQuote,
  reviseQuote,
  updateQuoteDraft,
} from "@/actions/quotes"
import type { WorkOrderDetail } from "@/actions/work-orders"
import type { OrgSettings } from "@/actions/company-settings"
import type { QuoteDetail } from "@/actions/quotes"

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface LineItemRow {
  id: string
  description: string
  quantity: string
  unit: string
  unit_price: string | null
  is_taxable: boolean
  is_optional: boolean
}

interface QuoteBuilderProps {
  workOrder: WorkOrderDetail
  orgSettings: Pick<
    OrgSettings,
    | "default_tax_rate"
    | "default_quote_expiry_days"
    | "quote_terms_and_conditions"
    | "quote_number_prefix"
  >
  existingQuote?: QuoteDetail | null
  /** Customer phone number — if present, enables SMS delivery option */
  customerPhone?: string | null
  /** Called after successful create/send so parent can refresh */
  onQuoteCreated?: (quoteId: string) => void
  onSent?: () => void
}

type QuoteDeliveryMethod = "email" | "sms" | "both"

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function formatCurrency(amount: number): string {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
  }).format(amount)
}

function addDays(date: Date, days: number): Date {
  const result = new Date(date)
  result.setDate(result.getDate() + days)
  return result
}

function toDateInputValue(date: Date): string {
  // Use local date, not UTC (per MEMORY.md Critical: Date String Timezone Pitfall)
  const year = date.getFullYear()
  const month = String(date.getMonth() + 1).padStart(2, "0")
  const day = String(date.getDate()).padStart(2, "0")
  return `${year}-${month}-${day}`
}

function getStatusBadge(status: string) {
  switch (status) {
    case "draft":
      return <Badge variant="outline">Draft</Badge>
    case "sent":
      return <Badge className="bg-blue-600 text-white">Sent</Badge>
    case "approved":
      return <Badge className="bg-green-600 text-white">Approved</Badge>
    case "declined":
      return (
        <Badge className="bg-red-600 text-white">Declined</Badge>
      )
    case "changes_requested":
      return (
        <Badge className="bg-yellow-600 text-white">Changes Requested</Badge>
      )
    case "expired":
      return <Badge variant="destructive">Expired</Badge>
    case "superseded":
      return (
        <Badge
          variant="outline"
          className="text-muted-foreground"
        >
          Superseded
        </Badge>
      )
    default:
      return <Badge variant="outline">{status}</Badge>
  }
}

// ---------------------------------------------------------------------------
// QuoteBuilder
// ---------------------------------------------------------------------------

export function QuoteBuilder({
  workOrder,
  orgSettings,
  existingQuote,
  customerPhone,
  onQuoteCreated,
  onSent,
}: QuoteBuilderProps) {
  const [isPending, startTransition] = useTransition()

  // ── State ──────────────────────────────────────────────────────────────
  const [quoteId, setQuoteId] = useState<string | null>(existingQuote?.id ?? null)
  const [quoteStatus, setQuoteStatus] = useState<string>(
    existingQuote?.status ?? "none"
  )

  // Scope of work — defaults to WO description
  const initialScope =
    ((existingQuote?.snapshot_json as Record<string, unknown> | null)
      ?.scope_of_work as string | undefined) ??
    workOrder.description ??
    ""
  const [scopeOfWork, setScopeOfWork] = useState(initialScope)

  // Terms — defaults to org terms
  const initialTerms =
    ((existingQuote?.snapshot_json as Record<string, unknown> | null)
      ?.terms as string | undefined) ??
    orgSettings.quote_terms_and_conditions ??
    ""
  const [terms, setTerms] = useState(initialTerms)

  // Expiration date — defaults to org expiry days from today
  const defaultExpiry = addDays(
    new Date(),
    orgSettings.default_quote_expiry_days ?? 30
  )
  const existingExpiry = existingQuote?.expires_at
    ? new Date(existingQuote.expires_at)
    : null
  const [expirationDateStr, setExpirationDateStr] = useState(
    toDateInputValue(existingExpiry ?? defaultExpiry)
  )

  // Line items — local state with optional/taxable toggles
  const [lineItems, setLineItems] = useState<LineItemRow[]>(
    workOrder.lineItems.map((li) => ({
      id: li.id,
      description: li.description,
      quantity: li.quantity ?? "1",
      unit: li.unit ?? "each",
      unit_price: li.unit_price,
      is_taxable: li.is_taxable,
      is_optional: li.is_optional,
    }))
  )

  // UI state
  const [showSendDialog, setShowSendDialog] = useState(false)
  const [deliveryMethod, setDeliveryMethod] = useState<QuoteDeliveryMethod>("email")
  const hasPhone = !!customerPhone

  // ── Calculations ──────────────────────────────────────────────────────
  const taxRate = parseFloat(orgSettings.default_tax_rate ?? "0.0875")

  // WO-level labor cost (not taxable)
  const laborHours = parseFloat(workOrder.labor_hours ?? "0") || 0
  const laborRate = parseFloat(workOrder.labor_rate ?? "0") || 0
  const laborCost = laborHours * laborRate

  const partsSubtotal = lineItems.reduce((sum, li) => {
    const qty = parseFloat(li.quantity) || 0
    const price = parseFloat(li.unit_price ?? "0") || 0
    return sum + qty * price
  }, 0)

  const subtotal = partsSubtotal + laborCost

  const taxableSubtotal = lineItems
    .filter((li) => li.is_taxable)
    .reduce((sum, li) => {
      const qty = parseFloat(li.quantity) || 0
      const price = parseFloat(li.unit_price ?? "0") || 0
      return sum + qty * price
    }, 0)

  const taxAmount = taxableSubtotal * taxRate
  const grandTotal = subtotal + taxAmount

  // ── Handlers ──────────────────────────────────────────────────────────

  function handleToggleOptional(id: string) {
    setLineItems((prev) =>
      prev.map((li) =>
        li.id === id ? { ...li, is_optional: !li.is_optional } : li
      )
    )
  }

  function handleToggleTaxable(id: string) {
    setLineItems((prev) =>
      prev.map((li) =>
        li.id === id ? { ...li, is_taxable: !li.is_taxable } : li
      )
    )
  }

  function handleSaveDraft() {
    startTransition(async () => {
      if (!quoteId) {
        // Create new quote
        const newId = await createQuote(workOrder.id)
        if (!newId) {
          toast.error("Failed to create quote")
          return
        }
        setQuoteId(newId)
        setQuoteStatus("draft")
        onQuoteCreated?.(newId)

        // Update with current scope/terms/expiry
        await updateQuoteDraft(newId, {
          scopeOfWork,
          expiresAt: new Date(expirationDateStr),
          terms,
        })
        toast.success("Quote draft saved")
      } else {
        // Update existing draft
        const result = await updateQuoteDraft(quoteId, {
          scopeOfWork,
          expiresAt: new Date(expirationDateStr),
          terms,
        })
        if (result.success) {
          toast.success("Draft saved")
        } else {
          toast.error(result.error ?? "Failed to save draft")
        }
      }
    })
  }

  function handleSendClick() {
    setShowSendDialog(true)
  }

  function handleConfirmSend() {
    setShowSendDialog(false)
    startTransition(async () => {
      let targetQuoteId = quoteId

      // If no quote yet, create one first
      if (!targetQuoteId) {
        targetQuoteId = await createQuote(workOrder.id)
        if (!targetQuoteId) {
          toast.error("Failed to create quote")
          return
        }
        setQuoteId(targetQuoteId)
        onQuoteCreated?.(targetQuoteId)
      }

      // Save latest scope/terms/expiry before sending
      await updateQuoteDraft(targetQuoteId, {
        scopeOfWork,
        expiresAt: new Date(expirationDateStr),
        terms,
      })

      // Send the quote with selected delivery method
      const smsEnabled = deliveryMethod === "sms" || deliveryMethod === "both"
      const result = await sendQuote(targetQuoteId, { smsEnabled })
      if (result.success) {
        setQuoteStatus("sent")
        const methodLabel = deliveryMethod === "both"
          ? "email + SMS"
          : deliveryMethod
        toast.success(`Quote sent via ${methodLabel}`)
        onSent?.()
      } else {
        toast.error(result.error ?? "Failed to send quote")
      }
    })
  }

  function handleRevise() {
    if (!quoteId) return
    startTransition(async () => {
      const result = await reviseQuote(quoteId)
      if (result.success && result.newQuoteId) {
        setQuoteId(result.newQuoteId)
        setQuoteStatus("draft")
        toast.success("New revision created — edit and resend")
      } else {
        toast.error(result.error ?? "Failed to create revision")
      }
    })
  }

  function handlePreviewPDF() {
    if (!quoteId) {
      toast.info("Save draft first to preview PDF")
      return
    }
    window.open(`/api/quotes/${quoteId}/pdf`, "_blank")
  }

  // ── Render: Changes Requested Banner ──────────────────────────────────
  const changeNote = existingQuote?.change_note
  const showChangesRequested =
    quoteStatus === "changes_requested" && changeNote

  // ── Render ─────────────────────────────────────────────────────────────
  const customerEmail = workOrder.customerName
    ? `customer's email`
    : "customer"

  const isSending = isPending && quoteStatus !== "sent"

  return (
    <div className="space-y-6">
      {/* ── Header ──────────────────────────────────────────────────── */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <FileText className="h-5 w-5 text-muted-foreground" />
          <h3 className="font-semibold">Quote Builder</h3>
          {quoteStatus !== "none" && getStatusBadge(quoteStatus)}
        </div>
        <div className="flex items-center gap-2">
          {quoteId && (
            <Button
              variant="outline"
              size="sm"
              onClick={handlePreviewPDF}
              disabled={isPending}
            >
              <FileText className="mr-1.5 h-3.5 w-3.5" />
              Preview PDF
            </Button>
          )}
        </div>
      </div>

      {/* ── Changes Requested Banner ─────────────────────────────────── */}
      {showChangesRequested && (
        <div className="rounded-lg border border-yellow-500/30 bg-yellow-500/10 p-4">
          <div className="flex items-start gap-3">
            <AlertTriangle className="mt-0.5 h-4 w-4 text-yellow-500 shrink-0" />
            <div className="space-y-2">
              <p className="text-sm font-medium text-yellow-400">
                Customer requested changes
              </p>
              <p className="text-sm text-muted-foreground">{changeNote}</p>
              <Button
                variant="outline"
                size="sm"
                onClick={handleRevise}
                disabled={isPending}
                className="mt-1"
              >
                {isPending ? (
                  <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />
                ) : (
                  <RefreshCw className="mr-1.5 h-3.5 w-3.5" />
                )}
                Create Revision
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* ── Approved Banner ──────────────────────────────────────────── */}
      {quoteStatus === "approved" && (
        <div className="rounded-lg border border-green-500/30 bg-green-500/10 p-4">
          <div className="flex items-center gap-3">
            <CheckCircle className="h-4 w-4 text-green-500" />
            <p className="text-sm text-green-400 font-medium">
              Customer approved this quote
            </p>
          </div>
        </div>
      )}

      {/* ── Sent Banner ──────────────────────────────────────────────── */}
      {quoteStatus === "sent" && (
        <div className="rounded-lg border border-blue-500/30 bg-blue-500/10 p-4">
          <div className="flex items-center gap-3">
            <Clock className="h-4 w-4 text-blue-400" />
            <p className="text-sm text-blue-300">
              Quote sent — awaiting customer response
            </p>
          </div>
        </div>
      )}

      {/* ── Scope of Work ────────────────────────────────────────────── */}
      <div className="space-y-2">
        <Label htmlFor="scope">Scope of Work</Label>
        <Textarea
          id="scope"
          value={scopeOfWork}
          onChange={(e: React.ChangeEvent<HTMLTextAreaElement>) => setScopeOfWork(e.target.value)}
          placeholder="Describe the work to be performed..."
          rows={4}
          className="resize-none"
          disabled={!["draft", "none"].includes(quoteStatus)}
        />
      </div>

      {/* ── Line Items ───────────────────────────────────────────────── */}
      <div className="space-y-3">
        <Label>Line Items</Label>

        {lineItems.length === 0 ? (
          <p className="text-sm text-muted-foreground border rounded-lg p-4 text-center">
            No line items. Add them from the Work Order line items section above.
          </p>
        ) : (
          <div className="border rounded-lg overflow-hidden">
            {/* Header */}
            <div className="grid grid-cols-[1fr_80px_80px_100px_80px_80px] gap-2 px-3 py-2 bg-muted/40 text-xs font-medium text-muted-foreground border-b">
              <span>Description</span>
              <span className="text-right">Qty</span>
              <span className="text-right">Price</span>
              <span className="text-right">Total</span>
              <span className="text-center">Optional</span>
              <span className="text-center">Taxable</span>
            </div>

            {/* Rows */}
            {lineItems.map((li) => {
              const qty = parseFloat(li.quantity) || 0
              const price = parseFloat(li.unit_price ?? "0") || 0
              const total = qty * price
              const isEditable = ["draft", "none"].includes(quoteStatus)

              return (
                <div
                  key={li.id}
                  className="grid grid-cols-[1fr_80px_80px_100px_80px_80px] gap-2 px-3 py-2.5 border-b last:border-0 items-center text-sm"
                >
                  <div>
                    <span>{li.description}</span>
                    {li.is_optional && (
                      <span className="ml-1.5 text-xs text-muted-foreground">
                        (optional)
                      </span>
                    )}
                  </div>
                  <span className="text-right text-muted-foreground">
                    {li.quantity} {li.unit}
                  </span>
                  <span className="text-right text-muted-foreground">
                    {li.unit_price
                      ? `$${parseFloat(li.unit_price).toFixed(2)}`
                      : "—"}
                  </span>
                  <span className="text-right font-medium">
                    {formatCurrency(total)}
                  </span>
                  <div className="flex justify-center">
                    <Switch
                      checked={li.is_optional}
                      onCheckedChange={() =>
                        isEditable && handleToggleOptional(li.id)
                      }
                      disabled={!isEditable}
                      aria-label={`Mark ${li.description} as optional`}
                    />
                  </div>
                  <div className="flex justify-center">
                    <Switch
                      checked={li.is_taxable}
                      onCheckedChange={() =>
                        isEditable && handleToggleTaxable(li.id)
                      }
                      disabled={!isEditable}
                      aria-label={`Mark ${li.description} as taxable`}
                    />
                  </div>
                </div>
              )
            })}
          </div>
        )}
      </div>

      {/* ── Totals Preview ───────────────────────────────────────────── */}
      <div className="rounded-lg border bg-muted/20 p-4">
        <h4 className="text-sm font-medium mb-3">Totals</h4>
        <div className="space-y-1.5 text-sm">
          {partsSubtotal > 0 && (
            <div className="flex justify-between">
              <span className="text-muted-foreground">Parts & Materials</span>
              <span>{formatCurrency(partsSubtotal)}</span>
            </div>
          )}
          {laborCost > 0 && (
            <div className="flex justify-between">
              <span className="text-muted-foreground">
                Labor ({laborHours} hrs × ${laborRate.toFixed(2)}/hr)
              </span>
              <span>{formatCurrency(laborCost)}</span>
            </div>
          )}
          <div className="flex justify-between">
            <span className="text-muted-foreground">
              Tax ({(taxRate * 100).toFixed(2)}%)
            </span>
            <span>{formatCurrency(taxAmount)}</span>
          </div>
          <Separator className="my-2" />
          <div className="flex justify-between font-semibold">
            <span>Total</span>
            <span className="text-blue-400">{formatCurrency(grandTotal)}</span>
          </div>
        </div>
      </div>

      {/* ── Expiration Date ──────────────────────────────────────────── */}
      <div className="space-y-2">
        <Label htmlFor="expiration">Expiration Date</Label>
        <Input
          id="expiration"
          type="date"
          value={expirationDateStr}
          onChange={(e) => setExpirationDateStr(e.target.value)}
          disabled={!["draft", "none"].includes(quoteStatus)}
          className="max-w-[200px]"
        />
      </div>

      {/* ── Terms & Conditions ───────────────────────────────────────── */}
      <div className="space-y-2">
        <Label htmlFor="terms">Terms &amp; Conditions</Label>
        <Textarea
          id="terms"
          value={terms}
          onChange={(e: React.ChangeEvent<HTMLTextAreaElement>) => setTerms(e.target.value)}
          placeholder="Enter any applicable terms and conditions..."
          rows={3}
          className="resize-none text-sm"
          disabled={!["draft", "none"].includes(quoteStatus)}
        />
      </div>

      {/* ── Actions ──────────────────────────────────────────────────── */}
      {["draft", "none"].includes(quoteStatus) && (
        <div className="flex gap-3">
          <Button
            variant="outline"
            onClick={handleSaveDraft}
            disabled={isPending}
          >
            {isPending && !showSendDialog ? (
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            ) : (
              <Plus className="mr-2 h-4 w-4" />
            )}
            Save Draft
          </Button>
          <Button
            onClick={handleSendClick}
            disabled={isPending || lineItems.length === 0}
            className="bg-blue-600 hover:bg-blue-700 text-white"
          >
            <Send className="mr-2 h-4 w-4" />
            Send to Customer
          </Button>
        </div>
      )}

      {/* ── Confirm Send Dialog ───────────────────────────────────────── */}
      <Dialog open={showSendDialog} onOpenChange={setShowSendDialog}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Send Quote to Customer</DialogTitle>
            <DialogDescription className="space-y-1">
              <span className="block">
                This will send{" "}
                {quoteId ? `the draft quote` : "a new quote"} to{" "}
                <strong>{workOrder.customerName}</strong>.
              </span>
              <span className="block text-muted-foreground text-xs mt-1">
                The customer will receive an email with the quote PDF attached
                and an approval link. You cannot unsend a quote.
              </span>
            </DialogDescription>
          </DialogHeader>

          <div className="rounded-lg border bg-muted/30 p-3 text-sm space-y-1">
            <div className="flex justify-between">
              <span className="text-muted-foreground">Customer</span>
              <span className="font-medium">{workOrder.customerName}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">Total</span>
              <span className="font-medium">{formatCurrency(grandTotal)}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">Expires</span>
              <span>{expirationDateStr}</span>
            </div>
          </div>

          {/* ── Delivery method selector ──────────────────────────────── */}
          <div className="space-y-2">
            <Label className="text-sm">Delivery Method</Label>
            <div className="flex flex-col gap-1.5">
              <button
                type="button"
                onClick={() => setDeliveryMethod("email")}
                className={cn(
                  "cursor-pointer flex items-center gap-3 rounded-lg border px-3 py-2.5 text-sm transition-colors text-left",
                  deliveryMethod === "email"
                    ? "border-blue-500 bg-blue-500/10 text-foreground"
                    : "border-border hover:bg-muted/50 text-muted-foreground"
                )}
              >
                <Send className="h-4 w-4 shrink-0" />
                <div>
                  <span className="font-medium text-foreground">Email</span>
                  <span className="block text-xs text-muted-foreground">
                    PDF attachment with approval link
                  </span>
                </div>
              </button>

              {hasPhone && (
                <button
                  type="button"
                  onClick={() => setDeliveryMethod("sms")}
                  className={cn(
                    "cursor-pointer flex items-center gap-3 rounded-lg border px-3 py-2.5 text-sm transition-colors text-left",
                    deliveryMethod === "sms"
                      ? "border-blue-500 bg-blue-500/10 text-foreground"
                      : "border-border hover:bg-muted/50 text-muted-foreground"
                  )}
                >
                  <Send className="h-4 w-4 shrink-0" />
                  <div>
                    <span className="font-medium text-foreground">SMS</span>
                    <span className="block text-xs text-muted-foreground">
                      Text with approval link
                    </span>
                  </div>
                </button>
              )}

              {hasPhone && (
                <button
                  type="button"
                  onClick={() => setDeliveryMethod("both")}
                  className={cn(
                    "cursor-pointer flex items-center gap-3 rounded-lg border px-3 py-2.5 text-sm transition-colors text-left",
                    deliveryMethod === "both"
                      ? "border-blue-500 bg-blue-500/10 text-foreground"
                      : "border-border hover:bg-muted/50 text-muted-foreground"
                  )}
                >
                  <Send className="h-4 w-4 shrink-0" />
                  <div>
                    <span className="font-medium text-foreground">
                      Email + SMS
                    </span>
                    <span className="block text-xs text-muted-foreground">
                      Both channels for fastest response
                    </span>
                  </div>
                </button>
              )}
            </div>
          </div>

          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setShowSendDialog(false)}
              disabled={isSending}
            >
              Cancel
            </Button>
            <Button
              onClick={handleConfirmSend}
              disabled={isSending}
              className="bg-blue-600 hover:bg-blue-700 text-white"
            >
              {isSending ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Sending...
                </>
              ) : (
                <>
                  <Send className="mr-2 h-4 w-4" />
                  Send Quote
                </>
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
