"use client"

/**
 * invoice-list.tsx — Filterable invoice list component with send capabilities.
 *
 * Displayed as a tab on the /work-orders page (Invoices tab).
 * Supports filtering by status, customer name search, and date range.
 *
 * Each row: invoice number, customer, date, total, status badge, PDF link, Send button.
 * Top bar: "Send All" button when draft invoices exist (for batch billing flow).
 *
 * Send options dropdown: Email Only, SMS Only, Email + SMS.
 * SMS options only shown if customer has phone number on file.
 */

import { useState, useTransition } from "react"
import Link from "next/link"
import {
  ChevronDownIcon,
  ExternalLinkIcon,
  Loader2Icon,
  MailIcon,
  MessageSquareIcon,
  ReceiptIcon,
  SearchIcon,
  SendIcon,
  XIcon,
} from "lucide-react"
import { cn } from "@/lib/utils"
import { toast } from "sonner"
import { sendInvoice, sendAllInvoices } from "@/actions/invoices"
import type { InvoiceSummary } from "@/actions/invoices"

// ─── Constants ────────────────────────────────────────────────────────────────

const STATUS_LABELS: Record<string, string> = {
  draft: "Draft",
  sent: "Sent",
  overdue: "Overdue",
  paid: "Paid",
  void: "Void",
}

const STATUS_COLORS: Record<string, string> = {
  draft: "bg-zinc-700 text-zinc-200",
  sent: "bg-blue-900/60 text-blue-300",
  overdue: "bg-red-900/60 text-red-300",
  paid: "bg-emerald-900/60 text-emerald-300",
  void: "bg-zinc-800/60 text-zinc-400",
}

const ALL_STATUSES = ["draft", "sent", "overdue", "paid", "void"]

// ─── Types ────────────────────────────────────────────────────────────────────

interface InvoiceListProps {
  invoices: InvoiceSummary[]
  /** Customer phone map: customerId -> phone | null. Used to gate SMS option. */
  customerPhones?: Record<string, string | null>
}

type DeliveryMethod = "email" | "sms" | "both"

// ─── InvoiceList ──────────────────────────────────────────────────────────────

export function InvoiceList({ invoices, customerPhones = {} }: InvoiceListProps) {
  const [searchQuery, setSearchQuery] = useState("")
  const [selectedStatuses, setSelectedStatuses] = useState<string[]>([])
  const [dateFrom, setDateFrom] = useState("")
  const [dateTo, setDateTo] = useState("")
  const [isBatchSending, startBatchTransition] = useTransition()

  // ── Filtering ───────────────────────────────────────────────────────────

  const filtered = invoices.filter((inv) => {
    // Status filter
    if (
      selectedStatuses.length > 0 &&
      !selectedStatuses.includes(inv.status)
    ) {
      return false
    }

    // Customer name search
    if (
      searchQuery.trim() &&
      !inv.customerName.toLowerCase().includes(searchQuery.toLowerCase()) &&
      !(inv.invoice_number ?? "")
        .toLowerCase()
        .includes(searchQuery.toLowerCase())
    ) {
      return false
    }

    // Date from
    if (dateFrom) {
      const from = new Date(dateFrom)
      if (inv.created_at < from) return false
    }

    // Date to
    if (dateTo) {
      const to = new Date(dateTo + "T23:59:59")
      if (inv.created_at > to) return false
    }

    return true
  })

  function toggleStatus(status: string) {
    setSelectedStatuses((prev) =>
      prev.includes(status)
        ? prev.filter((s) => s !== status)
        : [...prev, status]
    )
  }

  function clearFilters() {
    setSearchQuery("")
    setSelectedStatuses([])
    setDateFrom("")
    setDateTo("")
  }

  const hasFilters =
    searchQuery.trim() ||
    selectedStatuses.length > 0 ||
    dateFrom ||
    dateTo

  // Draft invoices in current filtered view
  const draftInvoiceIds = filtered
    .filter((inv) => inv.status === "draft")
    .map((inv) => inv.id)

  function handleSendAll() {
    if (draftInvoiceIds.length === 0) return
    startBatchTransition(async () => {
      const result = await sendAllInvoices(draftInvoiceIds)
      if (result.failed === 0) {
        toast.success(`${result.sent} invoice${result.sent !== 1 ? "s" : ""} sent`)
      } else {
        toast.error(
          `${result.sent} sent, ${result.failed} failed`,
          { description: result.errors[0] }
        )
      }
    })
  }

  return (
    <div className="flex flex-col gap-4">
      {/* ── Filter bar ─────────────────────────────────────────────────── */}
      <div className="flex flex-col gap-3 rounded-lg border border-border bg-card p-4">
        {/* Search */}
        <div className="relative">
          <SearchIcon className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search by customer name or invoice number..."
            className="w-full rounded-md border border-input bg-background pl-9 pr-3 py-2 text-sm placeholder:text-muted-foreground/60 focus:outline-none focus:ring-1 focus:ring-ring"
          />
          {searchQuery && (
            <button
              type="button"
              onClick={() => setSearchQuery("")}
              className="absolute right-2 top-1/2 -translate-y-1/2 rounded p-0.5 text-muted-foreground hover:text-foreground"
            >
              <XIcon className="h-3.5 w-3.5" />
            </button>
          )}
        </div>

        {/* Status chips + Send All */}
        <div className="flex items-center gap-2 flex-wrap">
          <span className="text-xs text-muted-foreground mr-1">Status:</span>
          {ALL_STATUSES.map((status) => (
            <button
              key={status}
              type="button"
              onClick={() => toggleStatus(status)}
              className={cn(
                "cursor-pointer rounded-full px-2.5 py-0.5 text-xs font-medium transition-colors",
                selectedStatuses.includes(status)
                  ? STATUS_COLORS[status]
                  : "bg-muted text-muted-foreground hover:bg-muted/80 hover:text-foreground"
              )}
            >
              {STATUS_LABELS[status]}
            </button>
          ))}

          {/* Send All button — visible when there are draft invoices */}
          {draftInvoiceIds.length > 0 && (
            <button
              type="button"
              onClick={handleSendAll}
              disabled={isBatchSending}
              className="ml-auto flex items-center gap-1.5 rounded-md bg-blue-600 px-3 py-1 text-xs font-medium text-white hover:bg-blue-700 transition-colors disabled:opacity-50 cursor-pointer"
            >
              {isBatchSending ? (
                <Loader2Icon className="h-3 w-3 animate-spin" />
              ) : (
                <SendIcon className="h-3 w-3" />
              )}
              Send All ({draftInvoiceIds.length})
            </button>
          )}
        </div>

        {/* Date range */}
        <div className="flex items-center gap-2 flex-wrap">
          <span className="text-xs text-muted-foreground">Date:</span>
          <input
            type="date"
            value={dateFrom}
            onChange={(e) => setDateFrom(e.target.value)}
            className="rounded-md border border-input bg-background px-2 py-1 text-xs focus:outline-none focus:ring-1 focus:ring-ring"
          />
          <span className="text-xs text-muted-foreground">to</span>
          <input
            type="date"
            value={dateTo}
            onChange={(e) => setDateTo(e.target.value)}
            className="rounded-md border border-input bg-background px-2 py-1 text-xs focus:outline-none focus:ring-1 focus:ring-ring"
          />
          {hasFilters && (
            <button
              type="button"
              onClick={clearFilters}
              className="ml-auto flex items-center gap-1 rounded-md px-2 py-1 text-xs text-muted-foreground hover:text-foreground transition-colors"
            >
              <XIcon className="h-3 w-3" />
              Clear filters
            </button>
          )}
        </div>
      </div>

      {/* ── Result count ───────────────────────────────────────────────── */}
      <p className="text-xs text-muted-foreground">
        {filtered.length} invoice{filtered.length !== 1 ? "s" : ""}
        {hasFilters && " matching filters"}
      </p>

      {/* ── Invoice list ───────────────────────────────────────────────── */}
      {filtered.length === 0 ? (
        <div className="flex flex-col items-center gap-3 rounded-lg border border-dashed border-border py-12 text-center">
          <ReceiptIcon className="h-8 w-8 text-muted-foreground/30" />
          <p className="text-sm font-medium text-muted-foreground">
            {hasFilters ? "No invoices match your filters" : "No invoices yet"}
          </p>
          {!hasFilters && (
            <p className="text-xs text-muted-foreground/60 max-w-xs">
              Invoices are created from completed work orders. Open a completed WO
              and click &quot;Prepare Invoice&quot; to get started.
            </p>
          )}
        </div>
      ) : (
        <div className="flex flex-col gap-2">
          {filtered.map((inv) => (
            <InvoiceRow
              key={inv.id}
              invoice={inv}
              hasPhone={!!customerPhones[inv.customer_id]}
            />
          ))}
        </div>
      )}
    </div>
  )
}

// ─── InvoiceRow ───────────────────────────────────────────────────────────────

function InvoiceRow({
  invoice,
  hasPhone,
}: {
  invoice: InvoiceSummary
  hasPhone: boolean
}) {
  const [showSendMenu, setShowSendMenu] = useState(false)
  const [isSending, startTransition] = useTransition()

  const statusLabel = STATUS_LABELS[invoice.status] ?? invoice.status
  const statusColor = STATUS_COLORS[invoice.status] ?? "bg-zinc-700 text-zinc-200"

  const total = parseFloat(invoice.total) || 0

  const dateDisplay = new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  }).format(new Date(invoice.created_at))

  const issuedDisplay = invoice.issued_at
    ? new Intl.DateTimeFormat("en-US", {
        month: "short",
        day: "numeric",
      }).format(new Date(invoice.issued_at))
    : null

  const canSend = invoice.status === "draft" || invoice.status === "sent"

  function handleSend(method: DeliveryMethod) {
    setShowSendMenu(false)
    startTransition(async () => {
      const options = {
        email: method === "email" || method === "both",
        sms: method === "sms" || method === "both",
      }
      const result = await sendInvoice(invoice.id, options)
      if (result.success) {
        toast.success(
          `Invoice ${result.invoiceNumber ?? ""} sent via ${
            method === "both" ? "email + SMS" : method
          }`
        )
      } else {
        toast.error(result.error ?? "Failed to send invoice")
      }
    })
  }

  return (
    <div className="flex items-center gap-3 rounded-lg border border-border bg-card px-4 py-3 hover:bg-card/80 transition-colors">
      {/* Invoice number + customer */}
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <span className="text-sm font-semibold text-foreground">
            {invoice.invoice_number ?? (
              <span className="text-muted-foreground italic">Draft</span>
            )}
          </span>
          <span
            className={cn(
              "rounded-full px-2 py-0.5 text-xs font-medium",
              statusColor
            )}
          >
            {statusLabel}
          </span>
        </div>
        <p className="text-sm text-muted-foreground">{invoice.customerName}</p>
        <p className="text-xs text-muted-foreground/60">
          Created {dateDisplay}
          {issuedDisplay && ` · Issued ${issuedDisplay}`}
        </p>
      </div>

      {/* Total */}
      <div className="text-right shrink-0">
        <p className="text-sm font-semibold">${total.toFixed(2)}</p>
        {invoice.paid_at && (
          <p className="text-xs text-emerald-400">Paid</p>
        )}
      </div>

      {/* Actions */}
      <div className="flex items-center gap-1.5 shrink-0">
        {invoice.invoice_number && (
          <Link
            href={`/api/invoices/${invoice.id}/pdf`}
            target="_blank"
            rel="noopener noreferrer"
            className="cursor-pointer rounded-md p-1.5 text-muted-foreground hover:bg-muted hover:text-foreground transition-colors"
            title="View PDF"
          >
            <ExternalLinkIcon className="h-4 w-4" />
          </Link>
        )}

        {/* Send button with dropdown */}
        {canSend && (
          <div className="relative">
            <button
              type="button"
              onClick={() => setShowSendMenu(!showSendMenu)}
              disabled={isSending}
              className="cursor-pointer flex items-center gap-1 rounded-md bg-blue-600 px-2.5 py-1.5 text-xs font-medium text-white hover:bg-blue-700 transition-colors disabled:opacity-50"
            >
              {isSending ? (
                <Loader2Icon className="h-3 w-3 animate-spin" />
              ) : (
                <SendIcon className="h-3 w-3" />
              )}
              Send
              <ChevronDownIcon className="h-3 w-3 ml-0.5" />
            </button>

            {showSendMenu && (
              <>
                {/* Backdrop */}
                <div
                  className="fixed inset-0 z-40"
                  onClick={() => setShowSendMenu(false)}
                />
                {/* Dropdown menu */}
                <div className="absolute right-0 top-full z-50 mt-1 min-w-[160px] rounded-lg border border-border bg-popover p-1 shadow-lg">
                  <button
                    type="button"
                    onClick={() => handleSend("email")}
                    className="cursor-pointer flex w-full items-center gap-2 rounded-md px-3 py-2 text-sm text-foreground hover:bg-muted transition-colors"
                  >
                    <MailIcon className="h-3.5 w-3.5 text-muted-foreground" />
                    Email Only
                  </button>
                  {hasPhone && (
                    <button
                      type="button"
                      onClick={() => handleSend("sms")}
                      className="cursor-pointer flex w-full items-center gap-2 rounded-md px-3 py-2 text-sm text-foreground hover:bg-muted transition-colors"
                    >
                      <MessageSquareIcon className="h-3.5 w-3.5 text-muted-foreground" />
                      SMS Only
                    </button>
                  )}
                  {hasPhone && (
                    <button
                      type="button"
                      onClick={() => handleSend("both")}
                      className="cursor-pointer flex w-full items-center gap-2 rounded-md px-3 py-2 text-sm text-foreground hover:bg-muted transition-colors"
                    >
                      <SendIcon className="h-3.5 w-3.5 text-muted-foreground" />
                      Email + SMS
                    </button>
                  )}
                </div>
              </>
            )}
          </div>
        )}
      </div>
    </div>
  )
}
