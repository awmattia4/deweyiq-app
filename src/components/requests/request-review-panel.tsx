"use client"

import { useState, useEffect } from "react"
import { useRouter } from "next/navigation"
import { XIcon, AlertTriangleIcon } from "lucide-react"
import { cn } from "@/lib/utils"
import type { OfficeServiceRequest, PortalMessage } from "@/actions/service-requests"
import {
  reviewRequest,
  createWoFromRequest,
  getRequestMessages,
} from "@/actions/service-requests"
import { RequestThread } from "@/components/portal/request-thread"

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface RequestReviewPanelProps {
  request: OfficeServiceRequest
  orgId: string
  officerName: string
  onClose: () => void
  onRequestUpdated: (updated: OfficeServiceRequest) => void
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const CATEGORY_LABELS: Record<string, string> = {
  green_pool: "Green Pool Cleanup",
  opening_closing: "Opening / Closing",
  repair: "Repair",
  cleaning: "Cleaning",
  chemical: "Chemical Balance",
  other: "Other",
}

const TIME_WINDOW_LABELS: Record<string, string> = {
  morning: "Morning (8am–12pm)",
  afternoon: "Afternoon (12pm–5pm)",
  anytime: "Anytime",
}

function formatDate(date: Date | string): string {
  return new Date(date).toLocaleDateString(undefined, {
    weekday: "short",
    month: "short",
    day: "numeric",
    year: "numeric",
  })
}

// ---------------------------------------------------------------------------
// RequestReviewPanel
// ---------------------------------------------------------------------------

/**
 * RequestReviewPanel — side panel for reviewing a service request.
 *
 * Shows full request details. Action buttons:
 * - Create Work Order: calls createWoFromRequest and navigates to WO detail
 * - Mark Reviewed: calls reviewRequest({ status: 'reviewed' })
 * - Decline: shows textarea for reason, calls reviewRequest({ status: 'declined' })
 *
 * Includes per-request chat thread at the bottom.
 */
export function RequestReviewPanel({
  request,
  orgId,
  officerName,
  onClose,
  onRequestUpdated,
}: RequestReviewPanelProps) {
  const router = useRouter()
  const [isCreatingWo, setIsCreatingWo] = useState(false)
  const [isReviewing, setIsReviewing] = useState(false)
  const [isDeclineMode, setIsDeclineMode] = useState(false)
  const [declineReason, setDeclineReason] = useState("")
  const [officeNotes, setOfficeNotes] = useState(request.office_notes ?? "")
  const [actionError, setActionError] = useState<string | null>(null)
  const [messages, setMessages] = useState<PortalMessage[] | null>(null)
  const [loadingMessages, setLoadingMessages] = useState(true)

  // Load messages on mount
  useEffect(() => {
    void (async () => {
      try {
        const msgs = await getRequestMessages(orgId, request.id)
        setMessages(msgs)
      } catch {
        setMessages([])
      } finally {
        setLoadingMessages(false)
      }
    })()
  }, [orgId, request.id])

  const categoryLabel = CATEGORY_LABELS[request.category] ?? request.category
  const canDecline =
    request.status === "submitted" || request.status === "reviewed"
  const canReview = request.status === "submitted"
  const canCreateWo = request.status !== "complete" && request.status !== "declined"

  // ── Action handlers ──────────────────────────────────────────────────────

  async function handleCreateWo() {
    setIsCreatingWo(true)
    setActionError(null)
    try {
      const result = await createWoFromRequest(request.id)
      if (result.success) {
        onRequestUpdated({ ...request, status: "reviewed", work_order_id: result.woId })
        router.push(`/work-orders/${result.woId}`)
      } else {
        setActionError(result.error)
      }
    } catch {
      setActionError("Failed to create work order. Please try again.")
    } finally {
      setIsCreatingWo(false)
    }
  }

  async function handleMarkReviewed() {
    setIsReviewing(true)
    setActionError(null)
    try {
      const result = await reviewRequest(request.id, {
        status: "reviewed",
        officeNotes: officeNotes || undefined,
      })
      if (result.success) {
        onRequestUpdated({
          ...request,
          status: "reviewed",
          office_notes: officeNotes || null,
        })
      } else {
        setActionError(result.error ?? "Failed to update request.")
      }
    } catch {
      setActionError("Failed to update request. Please try again.")
    } finally {
      setIsReviewing(false)
    }
  }

  async function handleDecline() {
    setIsReviewing(true)
    setActionError(null)
    try {
      const result = await reviewRequest(request.id, {
        status: "declined",
        officeNotes: declineReason || undefined,
      })
      if (result.success) {
        onRequestUpdated({
          ...request,
          status: "declined",
          office_notes: declineReason || null,
        })
        setIsDeclineMode(false)
      } else {
        setActionError(result.error ?? "Failed to decline request.")
      }
    } catch {
      setActionError("Failed to decline request. Please try again.")
    } finally {
      setIsReviewing(false)
    }
  }

  // ── Render ────────────────────────────────────────────────────────────────

  return (
    <>
      {/* Backdrop */}
      <div
        className="fixed inset-0 z-40 bg-black/40 backdrop-blur-sm"
        onClick={onClose}
      />

      {/* Side panel */}
      <div className="fixed right-0 top-0 bottom-0 z-50 w-full max-w-md flex flex-col bg-background border-l border-border shadow-2xl overflow-hidden">
        {/* ── Header ─────────────────────────────────────────────────── */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-border">
          <div>
            <h2 className="font-semibold">Service Request</h2>
            <p className="text-xs text-muted-foreground mt-0.5">
              {request.customer_name} &middot; {categoryLabel}
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-2 rounded-lg text-muted-foreground hover:text-foreground hover:bg-muted transition-colors cursor-pointer"
            aria-label="Close panel"
          >
            <XIcon className="h-4 w-4" />
          </button>
        </div>

        {/* ── Content (scrollable) ───────────────────────────────────── */}
        <div className="flex-1 overflow-y-auto">
          <div className="flex flex-col gap-5 px-5 py-5">
            {/* Request details */}
            <div className="rounded-xl border border-border/60 divide-y divide-border/40">
              <div className="flex items-start gap-2 px-4 py-3">
                <span className="text-xs text-muted-foreground w-24 shrink-0 mt-0.5">Customer</span>
                <span className="text-sm">{request.customer_name}</span>
              </div>
              {request.pool_name && (
                <div className="flex items-center gap-2 px-4 py-3">
                  <span className="text-xs text-muted-foreground w-24 shrink-0">Pool</span>
                  <span className="text-sm">{request.pool_name}</span>
                </div>
              )}
              <div className="flex items-center gap-2 px-4 py-3">
                <span className="text-xs text-muted-foreground w-24 shrink-0">Category</span>
                <span className="text-sm">{categoryLabel}</span>
              </div>
              {request.is_urgent && (
                <div className="flex items-center gap-2 px-4 py-3">
                  <span className="text-xs text-muted-foreground w-24 shrink-0">Urgency</span>
                  <span className="flex items-center gap-1 text-sm font-medium text-amber-400">
                    <AlertTriangleIcon className="h-3.5 w-3.5" />
                    Urgent
                  </span>
                </div>
              )}
              <div className="flex items-start gap-2 px-4 py-3">
                <span className="text-xs text-muted-foreground w-24 shrink-0 mt-0.5">Description</span>
                <span className="text-sm whitespace-pre-wrap">{request.description}</span>
              </div>
              {request.photo_paths.length > 0 && (
                <div className="flex items-center gap-2 px-4 py-3">
                  <span className="text-xs text-muted-foreground w-24 shrink-0">Photos</span>
                  <span className="text-sm">{request.photo_paths.length} attached</span>
                </div>
              )}
              {request.preferred_date && (
                <div className="flex items-center gap-2 px-4 py-3">
                  <span className="text-xs text-muted-foreground w-24 shrink-0">Preferred</span>
                  <span className="text-sm">
                    {formatDate(request.preferred_date + "T12:00:00")}
                    {request.preferred_time_window && (
                      <span className="text-muted-foreground">
                        {" "}
                        &middot;{" "}
                        {TIME_WINDOW_LABELS[request.preferred_time_window] ?? request.preferred_time_window}
                      </span>
                    )}
                  </span>
                </div>
              )}
              <div className="flex items-center gap-2 px-4 py-3">
                <span className="text-xs text-muted-foreground w-24 shrink-0">Submitted</span>
                <span className="text-sm">{formatDate(request.created_at)}</span>
              </div>
            </div>

            {/* Office notes */}
            <div className="flex flex-col gap-2">
              <label className="text-sm font-medium">Internal notes</label>
              <textarea
                value={officeNotes}
                onChange={(e) => setOfficeNotes(e.target.value)}
                placeholder="Add internal notes (not visible to customer)..."
                rows={3}
                className="resize-none rounded-xl border border-border bg-muted/30 px-4 py-3 text-sm leading-relaxed focus:outline-none focus:ring-1 focus:ring-ring placeholder:text-muted-foreground"
              />
            </div>

            {/* Error */}
            {actionError && (
              <div className="rounded-xl border border-destructive/30 bg-destructive/10 px-4 py-3">
                <p className="text-sm text-destructive">{actionError}</p>
              </div>
            )}

            {/* Action buttons */}
            {!isDeclineMode ? (
              <div className="flex flex-col gap-2">
                {canCreateWo && (
                  <button
                    type="button"
                    onClick={() => void handleCreateWo()}
                    disabled={isCreatingWo}
                    className="flex items-center justify-center gap-2 w-full rounded-xl bg-primary px-4 py-2.5 text-sm font-medium text-primary-foreground hover:bg-primary/90 transition-colors disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer"
                  >
                    {isCreatingWo ? (
                      <>
                        <div className="w-4 h-4 border-2 border-primary-foreground/60 border-t-primary-foreground rounded-full animate-spin" />
                        Creating Work Order...
                      </>
                    ) : (
                      "Create Work Order"
                    )}
                  </button>
                )}
                {canReview && (
                  <button
                    type="button"
                    onClick={() => void handleMarkReviewed()}
                    disabled={isReviewing}
                    className="w-full rounded-xl border border-border/60 px-4 py-2.5 text-sm font-medium hover:bg-muted/50 transition-colors disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer"
                  >
                    Mark Reviewed
                  </button>
                )}
                {canDecline && (
                  <button
                    type="button"
                    onClick={() => setIsDeclineMode(true)}
                    className="w-full rounded-xl border border-destructive/40 px-4 py-2.5 text-sm font-medium text-destructive hover:bg-destructive/10 transition-colors cursor-pointer"
                  >
                    Decline Request
                  </button>
                )}
              </div>
            ) : (
              <div className="flex flex-col gap-3 rounded-xl border border-destructive/30 bg-destructive/5 p-4">
                <p className="text-sm font-medium text-destructive">Decline this request?</p>
                <textarea
                  value={declineReason}
                  onChange={(e) => setDeclineReason(e.target.value)}
                  placeholder="Reason for declining (visible to customer)..."
                  rows={3}
                  className="resize-none rounded-xl border border-border bg-background px-4 py-3 text-sm leading-relaxed focus:outline-none focus:ring-1 focus:ring-ring placeholder:text-muted-foreground"
                />
                <div className="flex gap-2">
                  <button
                    type="button"
                    onClick={() => setIsDeclineMode(false)}
                    className="flex-1 rounded-xl border border-border/60 px-4 py-2 text-sm font-medium hover:bg-muted/50 transition-colors cursor-pointer"
                  >
                    Cancel
                  </button>
                  <button
                    type="button"
                    onClick={() => void handleDecline()}
                    disabled={isReviewing}
                    className="flex-1 rounded-xl bg-destructive px-4 py-2 text-sm font-medium text-destructive-foreground hover:bg-destructive/90 transition-colors disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer"
                  >
                    {isReviewing ? "Declining..." : "Confirm Decline"}
                  </button>
                </div>
              </div>
            )}

            {/* Per-request chat thread */}
            <div>
              <p className="text-sm font-medium mb-3">Customer Thread</p>
              {loadingMessages ? (
                <div className="h-20 flex items-center justify-center">
                  <div className="w-5 h-5 border-2 border-primary border-t-transparent rounded-full animate-spin" />
                </div>
              ) : messages !== null ? (
                <RequestThread
                  requestId={request.id}
                  customerId={request.customer_id}
                  orgId={orgId}
                  senderRole="office"
                  senderName={officerName}
                  initialMessages={messages}
                />
              ) : null}
            </div>
          </div>
        </div>
      </div>
    </>
  )
}
