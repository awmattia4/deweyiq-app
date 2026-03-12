"use client"

import { useState, useTransition } from "react"
import { useRouter } from "next/navigation"
import Link from "next/link"
import {
  UserIcon,
  ClockIcon,
  ChevronLeftIcon,
  PencilIcon,
  CheckIcon,
  XIcon,
  Loader2Icon,
  ImageIcon,
  ReceiptIcon,
} from "lucide-react"
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
  updateWorkOrderStatus,
  updateWorkOrder,
  createFollowUpWorkOrder,
} from "@/actions/work-orders"
import type { WorkOrderDetail, WorkOrderLineItem } from "@/actions/work-orders"
import { prepareInvoice } from "@/actions/invoices"
import { LineItemEditor } from "@/components/work-orders/line-item-editor"
import { QuoteBuilder } from "@/components/work-orders/quote-builder"
import { WoLaborSection } from "@/components/work-orders/wo-labor-section"
import type { OrgSettings } from "@/actions/company-settings"
import type { QuoteDetail } from "@/actions/quotes"

// ─── Constants ────────────────────────────────────────────────────────────────

const CATEGORY_LABELS: Record<string, string> = {
  pump: "Pump",
  filter: "Filter",
  heater: "Heater",
  plumbing_leak: "Plumbing / Leak",
  surface: "Surface",
  electrical: "Electrical",
  other: "Other",
}


const STATUS_LABELS: Record<string, string> = {
  draft: "Draft",
  quoted: "Quoted",
  approved: "Approved",
  scheduled: "Scheduled",
  in_progress: "In Progress",
  complete: "Complete",
  invoiced: "Invoiced",
  cancelled: "Cancelled",
}

const STATUS_COLORS: Record<string, string> = {
  draft: "bg-zinc-700 text-zinc-200",
  quoted: "bg-blue-900/60 text-blue-300",
  approved: "bg-green-900/60 text-green-300",
  scheduled: "bg-purple-900/60 text-purple-300",
  in_progress: "bg-amber-900/60 text-amber-300",
  complete: "bg-emerald-900/60 text-emerald-300",
  invoiced: "bg-slate-700 text-slate-300",
  cancelled: "bg-red-900/60 text-red-300",
}

const PRIORITY_COLORS: Record<string, string> = {
  emergency: "bg-red-500 text-white",
  high: "bg-amber-500 text-black",
  normal: "bg-blue-600 text-white",
  low: "bg-zinc-600 text-zinc-200",
}

const PRIORITY_LABELS: Record<string, string> = {
  emergency: "Emergency",
  high: "High",
  normal: "Normal",
  low: "Low",
}

const PRIORITY_LEFT_BORDER: Record<string, string> = {
  emergency: "border-l-red-500",
  high: "border-l-amber-500",
  normal: "border-l-blue-500",
  low: "border-l-zinc-500",
}

const ACTIVITY_DOT_COLORS: Record<string, string> = {
  created: "bg-zinc-400",
  updated: "bg-zinc-400",
  status_draft: "bg-zinc-500",
  status_quoted: "bg-blue-400",
  status_approved: "bg-green-400",
  status_scheduled: "bg-purple-400",
  status_in_progress: "bg-amber-400",
  status_complete: "bg-emerald-400",
  status_invoiced: "bg-slate-400",
  status_cancelled: "bg-red-400",
  assigned: "bg-blue-400",
  reassigned: "bg-blue-400",
  note_added: "bg-zinc-400",
  quote_sent: "bg-blue-400",
  quote_approved: "bg-green-400",
  quote_declined: "bg-red-400",
  changes_requested: "bg-amber-400",
  completed: "bg-emerald-400",
  cancelled: "bg-red-400",
  follow_up_created: "bg-purple-400",
  invoiced: "bg-slate-400",
}

const ACTIVITY_DESCRIPTIONS: Record<string, string> = {
  created: "Work order created",
  updated: "Work order updated",
  status_draft: "Status set to Draft",
  status_quoted: "Quote sent to customer",
  status_approved: "Work order approved",
  status_scheduled: "Work order scheduled",
  status_in_progress: "Work started",
  status_complete: "Work completed",
  status_invoiced: "Invoice created",
  status_cancelled: "Work order cancelled",
  assigned: "Technician assigned",
  reassigned: "Technician reassigned",
  note_added: "Note added",
  quote_sent: "Quote sent",
  quote_approved: "Quote approved",
  quote_declined: "Quote declined",
  changes_requested: "Customer requested changes",
  completed: "Work completed",
  follow_up_created: "Follow-up work order created",
  invoiced: "Invoice created",
}

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
  { value: "low", label: "Low" },
  { value: "normal", label: "Normal" },
  { value: "high", label: "High" },
  { value: "emergency", label: "Emergency" },
]

// ─── Component ────────────────────────────────────────────────────────────────

interface WoDetailProps {
  workOrder: WorkOrderDetail
  invoiceInfo?: { id: string; invoice_number: string | null; status: string } | null
  orgSettings?: OrgSettings | null
  latestQuote?: QuoteDetail | null
  /** Customer phone number — passed to QuoteBuilder for SMS delivery option */
  customerPhone?: string | null
}

/**
 * WoDetail — Full WO detail view with all sections:
 * - Header (customer, pool, category, priority, status)
 * - Status action bar (contextual buttons per status)
 * - Assignment section
 * - Line items list (read-only until Plan 04 editor)
 * - Photos grid
 * - Activity timeline
 * - Linked quotes section
 * - Follow-up WO links
 */
export function WoDetail({
  workOrder: initialWo,
  invoiceInfo,
  orgSettings,
  latestQuote,
  customerPhone,
}: WoDetailProps) {
  const router = useRouter()
  const [isPending, startTransition] = useTransition()
  const [wo, setWo] = useState(initialWo)
  const [prepareInvoicePending, setPrepareInvoicePending] = useState(false)
  const [showQuoteBuilder, setShowQuoteBuilder] = useState(false)
  const initLaborHours = parseFloat(wo.labor_hours ?? "0") || 0
  const initLaborRate = parseFloat(wo.labor_rate ?? "0") || 0
  const [laborCost, setLaborCost] = useState(initLaborHours * initLaborRate)

  // Edit mode state
  const [isEditing, setIsEditing] = useState(false)
  const [editTitle, setEditTitle] = useState(wo.title)
  const [editDescription, setEditDescription] = useState(wo.description ?? "")
  const [editCategory, setEditCategory] = useState(wo.category)
  const [editPriority, setEditPriority] = useState(wo.priority)

  // Dialog state
  const [cancelDialogOpen, setCancelDialogOpen] = useState(false)
  const [cancelReason, setCancelReason] = useState("")
  const [approveDialogOpen, setApproveDialogOpen] = useState(false)
  const [followUpPending, setFollowUpPending] = useState(false)

  // ── Inline edit handlers ────────────────────────────────────────────────

  function handleEditStart() {
    setEditTitle(wo.title)
    setEditDescription(wo.description ?? "")
    setEditCategory(wo.category)
    setEditPriority(wo.priority)
    setIsEditing(true)
  }

  function handleEditCancel() {
    setIsEditing(false)
  }

  async function handleEditSave() {
    if (!editTitle.trim()) {
      toast.error("Title is required")
      return
    }

    startTransition(async () => {
      const result = await updateWorkOrder(wo.id, {
        title: editTitle.trim(),
        description: editDescription.trim() || undefined,
        category: editCategory,
        priority: editPriority,
      })

      if (result.success) {
        toast.success("Work order updated")
        setIsEditing(false)
        router.refresh()
        // Optimistic update of local state
        setWo((prev) => ({
          ...prev,
          title: editTitle.trim(),
          description: editDescription.trim() || null,
          category: editCategory,
          priority: editPriority,
        }))
      } else {
        toast.error(result.error ?? "Failed to update work order")
      }
    })
  }

  // ── Status transitions ──────────────────────────────────────────────────

  async function handleSkipQuoteApprove() {
    setApproveDialogOpen(false)
    startTransition(async () => {
      const result = await updateWorkOrderStatus(wo.id, "approved")
      if (result.success) {
        toast.success("Work order approved")
        router.refresh()
      } else {
        toast.error(result.error ?? "Failed to approve work order")
      }
    })
  }

  async function handleCancel() {
    if (!cancelReason.trim()) {
      toast.error("Please provide a cancellation reason")
      return
    }
    startTransition(async () => {
      const result = await updateWorkOrderStatus(wo.id, "cancelled", {
        cancelReason: cancelReason.trim(),
      })
      if (result.success) {
        toast.success("Work order cancelled")
        setCancelDialogOpen(false)
        setCancelReason("")
        router.refresh()
      } else {
        toast.error(result.error ?? "Failed to cancel work order")
      }
    })
  }

  async function handleCreateFollowUp() {
    setFollowUpPending(true)
    const newWoId = await createFollowUpWorkOrder(wo.id)
    setFollowUpPending(false)
    if (newWoId) {
      toast.success("Follow-up work order created")
      router.push(`/work-orders/${newWoId}`)
    } else {
      toast.error("Failed to create follow-up work order")
    }
  }

  // ── Prepare invoice handler ─────────────────────────────────────────────

  async function handlePrepareInvoice() {
    // If invoice already exists, navigate directly to it
    if (invoiceInfo) {
      router.push(`/work-orders/${wo.id}/invoice/${invoiceInfo.id}`)
      return
    }

    // Create a new invoice from this WO
    setPrepareInvoicePending(true)
    const invoiceId = await prepareInvoice(wo.id)
    setPrepareInvoicePending(false)

    if (invoiceId) {
      toast.success("Invoice prepared")
      router.push(`/work-orders/${wo.id}/invoice/${invoiceId}`)
    } else {
      toast.error("Failed to prepare invoice")
    }
  }

  // ── Line items change handler ──────────────────────────────────────────

  function handleLineItemsChange(items: WorkOrderLineItem[]) {
    setWo((prev) => ({ ...prev, lineItems: items }))
  }

  // ── Derived values ──────────────────────────────────────────────────────

  const statusLabel = STATUS_LABELS[wo.status] ?? wo.status
  const statusColor = STATUS_COLORS[wo.status] ?? "bg-zinc-700 text-zinc-200"
  const priorityLabel = PRIORITY_LABELS[wo.priority] ?? wo.priority
  const priorityColor = PRIORITY_COLORS[wo.priority] ?? PRIORITY_COLORS.normal
  const borderColor = PRIORITY_LEFT_BORDER[wo.priority] ?? "border-l-zinc-500"
  const categoryLabel = CATEGORY_LABELS[wo.category] ?? wo.category
  // Category icon removed — user prefers clean text-only UI

  const createdAt = new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
  }).format(new Date(wo.created_at))

  const scheduledDateDisplay = wo.target_date
    ? new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric", year: "numeric" }).format(
        new Date(wo.target_date + "T00:00:00")
      )
    : null

  return (
    <div className="flex flex-col gap-6">
      {/* ── Back navigation ─────────────────────────────────────────────── */}
      <Link
        href="/work-orders"
        className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground transition-colors"
      >
        <ChevronLeftIcon className="h-4 w-4" />
        Work Orders
      </Link>

      {/* ── Header card ─────────────────────────────────────────────────── */}
      <div
        className={cn(
          "rounded-lg border-l-4 border border-border bg-card p-5",
          borderColor
        )}
      >
        {isEditing ? (
          /* ── Edit mode ─────────────────────────────────────────── */
          <div className="flex flex-col gap-4">
            <div className="flex items-center justify-between">
              <h2 className="text-sm font-medium text-muted-foreground uppercase tracking-wide">
                Editing Work Order
              </h2>
              <div className="flex items-center gap-2">
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={handleEditCancel}
                  disabled={isPending}
                >
                  <XIcon className="h-4 w-4 mr-1" />
                  Cancel
                </Button>
                <Button size="sm" onClick={handleEditSave} disabled={isPending}>
                  {isPending ? (
                    <Loader2Icon className="h-4 w-4 mr-1 animate-spin" />
                  ) : (
                    <CheckIcon className="h-4 w-4 mr-1" />
                  )}
                  Save
                </Button>
              </div>
            </div>

            <input
              type="text"
              value={editTitle}
              onChange={(e) => setEditTitle(e.target.value)}
              placeholder="Work order title"
              className="w-full rounded-md border border-input bg-background px-3 py-2 text-lg font-semibold focus:outline-none focus:ring-2 focus:ring-ring"
            />

            <textarea
              value={editDescription}
              onChange={(e) => setEditDescription(e.target.value)}
              placeholder="Description (optional)"
              rows={3}
              className="w-full resize-none rounded-md border border-input bg-background px-3 py-2 text-sm placeholder:text-muted-foreground/50 focus:outline-none focus:ring-2 focus:ring-ring"
            />

            <div className="flex flex-col gap-1.5">
              <span className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
                Category
              </span>
              <div className="flex flex-wrap gap-2">
                {CATEGORY_OPTIONS.map((opt) => (
                  <button
                    key={opt.value}
                    type="button"
                    onClick={() => setEditCategory(opt.value)}
                    className={cn(
                      "cursor-pointer rounded-full px-3 py-1 text-xs font-medium transition-colors",
                      editCategory === opt.value
                        ? "bg-primary text-primary-foreground"
                        : "bg-muted text-muted-foreground hover:bg-muted/80 hover:text-foreground"
                    )}
                  >
                    {opt.label}
                  </button>
                ))}
              </div>
            </div>

            <div className="flex flex-col gap-1.5">
              <span className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
                Priority
              </span>
              <div className="flex flex-wrap gap-2">
                {PRIORITY_OPTIONS.map((opt) => (
                  <button
                    key={opt.value}
                    type="button"
                    onClick={() => setEditPriority(opt.value)}
                    className={cn(
                      "cursor-pointer rounded-full px-3 py-1 text-xs font-semibold transition-colors",
                      editPriority === opt.value
                        ? PRIORITY_COLORS[opt.value]
                        : "bg-muted text-muted-foreground hover:bg-muted/80 hover:text-foreground"
                    )}
                  >
                    {opt.label}
                  </button>
                ))}
              </div>
            </div>
          </div>
        ) : (
          /* ── View mode ─────────────────────────────────────────── */
          <div className="flex flex-col gap-3">
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0 flex-1">
                <h1 className="text-xl font-bold tracking-tight truncate">{wo.title}</h1>
                <div className="mt-1 flex items-center gap-2 flex-wrap text-sm text-muted-foreground">
                  <Link
                    href={`/customers/${wo.customer_id}`}
                    className="hover:text-foreground transition-colors font-medium"
                  >
                    {wo.customerName}
                  </Link>
                  {wo.poolName && (
                    <>
                      <span className="text-muted-foreground/40">·</span>
                      <span>{wo.poolName}</span>
                    </>
                  )}
                </div>
                {wo.description && (
                  <p className="mt-2 text-sm text-muted-foreground">{wo.description}</p>
                )}
              </div>

              {/* Edit button */}
              {wo.status !== "invoiced" && wo.status !== "cancelled" && (
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={handleEditStart}
                  className="shrink-0"
                >
                  <PencilIcon className="h-4 w-4" />
                  <span className="sr-only">Edit</span>
                </Button>
              )}
            </div>

            {/* Badges row */}
            <div className="flex flex-wrap items-center gap-2">
              <span className={cn("rounded-full px-2 py-0.5 text-xs font-semibold", priorityColor)}>
                {priorityLabel}
              </span>
              <span className={cn("rounded-full px-2 py-0.5 text-xs font-medium", statusColor)}>
                {statusLabel}
              </span>
              <span className="rounded-full bg-muted px-2 py-0.5 text-xs text-muted-foreground">
                {categoryLabel}
              </span>
              <span className="ml-auto text-xs text-muted-foreground">
                Created {createdAt}
              </span>
            </div>

            {/* Flagged by tech note */}
            {wo.flaggedByTechName && (
              <div className="flex items-center gap-1.5 rounded-md border border-amber-500/30 bg-amber-500/10 px-3 py-1.5 text-sm text-amber-300">
                <span>⚑</span>
                <span>Flagged by {wo.flaggedByTechName}</span>
                {wo.severity && (
                  <span className="ml-1 text-xs text-amber-400/70">({wo.severity})</span>
                )}
              </div>
            )}
          </div>
        )}
      </div>

      {/* ── Draft guidance banner ─────────────────────────────────────────── */}
      {wo.status === "draft" && (
        <div className="rounded-lg border border-primary/30 bg-primary/5 px-4 py-3">
          <p className="text-sm font-medium text-primary">
            {wo.lineItems.length === 0 && !wo.labor_hours
              ? "Step 1: Set labor hours and add parts & materials below."
              : "Items added. Next: Create a quote to send to the customer, or skip quoting and approve directly."}
          </p>
        </div>
      )}

      {/* ── Status action bar ────────────────────────────────────────────── */}
      <StatusActionBar
        wo={wo}
        isPending={isPending}
        onSkipQuoteApprove={() => setApproveDialogOpen(true)}
        onCreateQuote={() => setShowQuoteBuilder(true)}
        onCancel={() => setCancelDialogOpen(true)}
        onFollowUp={handleCreateFollowUp}
        followUpPending={followUpPending}
        onPrepareInvoice={handlePrepareInvoice}
        prepareInvoicePending={prepareInvoicePending}
        invoiceInfo={invoiceInfo}
      />

      {/* ── Assignment section ───────────────────────────────────────────── */}
      <Section title="Assignment">
        {wo.techName ? (
          <div className="flex items-center gap-3">
            <div className="flex h-8 w-8 items-center justify-center rounded-full bg-primary/20">
              <UserIcon className="h-4 w-4 text-primary" />
            </div>
            <div>
              <p className="text-sm font-medium">{wo.techName}</p>
              {scheduledDateDisplay && (
                <p className="text-xs text-muted-foreground">Scheduled: {scheduledDateDisplay}</p>
              )}
            </div>
          </div>
        ) : (
          <p className="text-sm text-muted-foreground italic">
            Not assigned — assign via the Schedule page
          </p>
        )}
        {wo.status === "cancelled" && wo.cancel_reason && (
          <div className="mt-2 rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2">
            <p className="text-xs font-medium text-destructive">Cancellation reason:</p>
            <p className="mt-0.5 text-sm text-muted-foreground">{wo.cancel_reason}</p>
          </div>
        )}
      </Section>

      {/* ── Labor section ──────────────────────────────────────────────── */}
      <Section title="Labor">
        <WoLaborSection
          workOrderId={wo.id}
          laborHours={wo.labor_hours}
          laborRate={wo.labor_rate}
          laborActualHours={wo.labor_actual_hours}
          defaultHourlyRate={(orgSettings?.default_hourly_rate as string | null | undefined) ?? null}
          editable={wo.status !== "invoiced" && wo.status !== "cancelled"}
          showActualHours={wo.status === "in_progress" || wo.status === "complete"}
          onLaborChange={setLaborCost}
        />
      </Section>

      {/* ── Line items section ───────────────────────────────────────────── */}
      <Section title="Parts & Materials">
        <LineItemEditor
          workOrderId={wo.id}
          lineItems={wo.lineItems}
          orgSettings={orgSettings ?? null}
          editable={wo.status !== "invoiced" && wo.status !== "cancelled"}
          onLineItemsChange={handleLineItemsChange}
          laborCost={laborCost}
        />
      </Section>

      {/* ── Quote builder section ─────────────────────────────────────────── */}
      {(showQuoteBuilder || latestQuote) &&
        wo.status !== "cancelled" &&
        orgSettings && (
          <Section title="Quote">
            <QuoteBuilder
              workOrder={wo}
              orgSettings={orgSettings}
              existingQuote={latestQuote}
              customerPhone={customerPhone}
              onQuoteCreated={() => router.refresh()}
              onSent={() => router.refresh()}
            />
          </Section>
        )}

      {/* ── Photos section ───────────────────────────────────────────────── */}
      {wo.completion_photo_paths && wo.completion_photo_paths.length > 0 && (
        <Section title="Photos">
          <div className="grid grid-cols-3 gap-2 sm:grid-cols-4">
            {wo.completion_photo_paths.map((path, idx) => (
              <a
                key={idx}
                href={path}
                target="_blank"
                rel="noopener noreferrer"
                className="group relative aspect-square overflow-hidden rounded-lg border border-border bg-muted"
              >
                <img
                  src={path}
                  alt={`Photo ${idx + 1}`}
                  className="h-full w-full object-cover transition-opacity group-hover:opacity-80"
                />
                <div className="absolute inset-0 flex items-center justify-center opacity-0 transition-opacity group-hover:opacity-100">
                  <ImageIcon className="h-6 w-6 text-white drop-shadow" />
                </div>
              </a>
            ))}
          </div>
        </Section>
      )}

      {/* ── Linked quotes section ────────────────────────────────────────── */}
      {wo.quoteSummaries.length > 0 && (
        <Section title="Quotes">
          <div className="flex flex-col gap-2">
            {wo.quoteSummaries.map((q) => (
              <div
                key={q.id}
                className="flex items-center justify-between rounded-lg border border-border bg-card/50 px-3 py-2"
              >
                <div>
                  <p className="text-sm font-medium">
                    {q.quote_number ?? `Quote v${q.version}`}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    {q.sent_at
                      ? `Sent ${new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric" }).format(new Date(q.sent_at))}`
                      : "Not sent"}
                  </p>
                </div>
                <span
                  className={cn(
                    "rounded-full px-2 py-0.5 text-xs font-medium",
                    STATUS_COLORS[q.status] ?? "bg-zinc-700 text-zinc-200"
                  )}
                >
                  {STATUS_LABELS[q.status] ?? q.status}
                </span>
              </div>
            ))}
          </div>
        </Section>
      )}

      {/* ── Parent / follow-up WO links ──────────────────────────────────── */}
      {wo.parent_wo_id && (
        <Section title="Parent Work Order">
          <Link
            href={`/work-orders/${wo.parent_wo_id}`}
            className="inline-flex items-center gap-1.5 text-sm text-primary hover:underline"
          >
            View parent work order →
          </Link>
        </Section>
      )}

      {/* ── Activity timeline ────────────────────────────────────────────── */}
      <Section title="Activity">
        {!wo.activity_log || wo.activity_log.length === 0 ? (
          <p className="text-sm text-muted-foreground italic">No activity recorded yet</p>
        ) : (
          <div className="flex flex-col gap-0">
            {[...wo.activity_log].reverse().map((event, idx) => {
              const dotColor = ACTIVITY_DOT_COLORS[event.type] ?? "bg-zinc-400"
              const description =
                ACTIVITY_DESCRIPTIONS[event.type] ??
                event.type.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase())

              const eventTime = new Intl.DateTimeFormat("en-US", {
                month: "short",
                day: "numeric",
                hour: "numeric",
                minute: "2-digit",
              }).format(new Date(event.at))

              return (
                <div key={idx} className="flex gap-3">
                  {/* Timeline line + dot */}
                  <div className="flex flex-col items-center">
                    <div className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full border border-border bg-card">
                      <div className={cn("h-2.5 w-2.5 rounded-full", dotColor)} />
                    </div>
                    {idx < (wo.activity_log?.length ?? 0) - 1 && (
                      <div className="w-px flex-1 bg-border my-1" />
                    )}
                  </div>

                  {/* Event content */}
                  <div className="min-w-0 flex-1 pb-4">
                    <p className="text-sm font-medium">{description}</p>
                    {event.note && (
                      <p className="mt-0.5 text-sm text-muted-foreground">{event.note}</p>
                    )}
                    <p className="mt-0.5 text-xs text-muted-foreground/60">{eventTime}</p>
                  </div>
                </div>
              )
            })}
          </div>
        )}
      </Section>

      {/* ── Cancel dialog ────────────────────────────────────────────────── */}
      <Dialog open={cancelDialogOpen} onOpenChange={setCancelDialogOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Cancel Work Order</DialogTitle>
            <DialogDescription>
              Provide a reason for cancellation. This cannot be undone.
            </DialogDescription>
          </DialogHeader>
          <div className="flex flex-col gap-4">
            <textarea
              value={cancelReason}
              onChange={(e) => setCancelReason(e.target.value)}
              placeholder="Reason for cancellation..."
              rows={3}
              className="w-full resize-none rounded-md border border-input bg-background px-3 py-2 text-sm placeholder:text-muted-foreground/50 focus:outline-none focus:ring-2 focus:ring-ring"
            />
            <div className="flex justify-end gap-2">
              <Button
                variant="ghost"
                onClick={() => {
                  setCancelDialogOpen(false)
                  setCancelReason("")
                }}
                disabled={isPending}
              >
                Back
              </Button>
              <Button
                variant="destructive"
                onClick={handleCancel}
                disabled={isPending || !cancelReason.trim()}
              >
                {isPending && <Loader2Icon className="mr-1.5 h-4 w-4 animate-spin" />}
                Cancel Work Order
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* ── Skip quote / approve dialog ──────────────────────────────────── */}
      <Dialog open={approveDialogOpen} onOpenChange={setApproveDialogOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Skip Quoting and Approve</DialogTitle>
            <DialogDescription>
              This will approve the work order directly without sending a quote to the customer.
              Use this for small jobs where prior approval isn't needed.
            </DialogDescription>
          </DialogHeader>
          <div className="flex justify-end gap-2">
            <Button variant="ghost" onClick={() => setApproveDialogOpen(false)} disabled={isPending}>
              Back
            </Button>
            <Button onClick={handleSkipQuoteApprove} disabled={isPending}>
              {isPending && <Loader2Icon className="mr-1.5 h-4 w-4 animate-spin" />}
              Approve Work Order
            </Button>
          </div>
        </DialogContent>
      </Dialog>

    </div>
  )
}

// ─── Status Action Bar ─────────────────────────────────────────────────────────

interface StatusActionBarProps {
  wo: WorkOrderDetail
  isPending: boolean
  onSkipQuoteApprove: () => void
  onCreateQuote: () => void
  onCancel: () => void
  onFollowUp: () => void
  followUpPending: boolean
  onPrepareInvoice: () => void
  prepareInvoicePending: boolean
  invoiceInfo?: { id: string; invoice_number: string | null; status: string } | null
}

function StatusActionBar({
  wo,
  isPending,
  onSkipQuoteApprove,
  onCreateQuote,
  onCancel,
  onFollowUp,
  followUpPending,
  onPrepareInvoice,
  prepareInvoicePending,
  invoiceInfo,
}: StatusActionBarProps) {
  if (wo.status === "cancelled") {
    return null
  }

  // Invoiced status: show invoice link instead of action bar
  if (wo.status === "invoiced") {
    return (
      <div className="flex items-center gap-3 rounded-lg border border-emerald-500/30 bg-emerald-500/10 px-4 py-3">
        <ReceiptIcon className="h-4 w-4 text-emerald-400 shrink-0" />
        <span className="text-sm font-medium text-emerald-300">Invoiced</span>
        {invoiceInfo && (
          <Link
            href={`/work-orders/${wo.id}/invoice/${invoiceInfo.id}`}
            className="ml-auto text-sm font-medium text-emerald-300 hover:text-emerald-200 underline underline-offset-2 transition-colors"
          >
            {invoiceInfo.invoice_number
              ? `View Invoice ${invoiceInfo.invoice_number}`
              : "View Invoice"}
          </Link>
        )}
      </div>
    )
  }

  return (
    <div className="flex flex-wrap items-center gap-2 rounded-lg border border-border bg-card/50 px-4 py-3">
      <div className="flex flex-1 flex-wrap items-center gap-2 justify-end">
        {/* Draft status actions */}
        {wo.status === "draft" && (
          <>
            <Button
              size="sm"
              variant="outline"
              onClick={onCreateQuote}
              disabled={isPending || wo.lineItems.length === 0}
            >
              Create Quote
            </Button>
            <Button
              size="sm"
              variant="outline"
              onClick={onSkipQuoteApprove}
              disabled={isPending}
            >
              Skip Quote → Approve
            </Button>
            <Button
              size="sm"
              variant="outline"
              className="text-destructive border-destructive/30 hover:bg-destructive/10 hover:text-destructive"
              onClick={onCancel}
              disabled={isPending}
            >
              Cancel
            </Button>
          </>
        )}

        {/* Quoted status actions */}
        {wo.status === "quoted" && (
          <Button
            size="sm"
            variant="outline"
            className="text-destructive border-destructive/30 hover:bg-destructive/10 hover:text-destructive"
            onClick={onCancel}
            disabled={isPending}
          >
            Cancel
          </Button>
        )}

        {/* Approved status actions */}
        {wo.status === "approved" && (
          <Button
            size="sm"
            variant="outline"
            className="text-destructive border-destructive/30 hover:bg-destructive/10 hover:text-destructive"
            onClick={onCancel}
            disabled={isPending}
          >
            Cancel
          </Button>
        )}

        {/* Scheduled status actions */}
        {wo.status === "scheduled" && (
          <Button
            size="sm"
            variant="outline"
            className="text-destructive border-destructive/30 hover:bg-destructive/10 hover:text-destructive"
            onClick={onCancel}
            disabled={isPending}
          >
            Cancel
          </Button>
        )}

        {/* In progress status */}
        {wo.status === "in_progress" && (
          <div className="flex items-center gap-2 text-sm text-amber-300">
            <ClockIcon className="h-4 w-4" />
            <span>
              In progress{wo.techName ? ` by ${wo.techName}` : ""}
            </span>
          </div>
        )}

        {/* Complete status actions */}
        {wo.status === "complete" && (
          <>
            <Button
              size="sm"
              onClick={onPrepareInvoice}
              disabled={isPending || prepareInvoicePending}
            >
              {prepareInvoicePending && (
                <Loader2Icon className="mr-1.5 h-4 w-4 animate-spin" />
              )}
              <ReceiptIcon className="mr-1.5 h-4 w-4" />
              {invoiceInfo ? "View Invoice" : "Prepare Invoice"}
            </Button>
            <Button
              size="sm"
              variant="outline"
              onClick={onFollowUp}
              disabled={isPending || followUpPending}
            >
              {followUpPending && <Loader2Icon className="mr-1.5 h-4 w-4 animate-spin" />}
              Create Follow-Up
            </Button>
          </>
        )}
      </div>
    </div>
  )
}

// ─── Section wrapper ──────────────────────────────────────────────────────────

function Section({
  title,
  children,
}: {
  title: string
  children: React.ReactNode
}) {
  return (
    <div className="flex flex-col gap-3 rounded-lg border border-border bg-card p-5">
      <h2 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">
        {title}
      </h2>
      {children}
    </div>
  )
}
