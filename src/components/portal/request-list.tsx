"use client"

import { useState } from "react"
import { AlertTriangleIcon, ChevronDownIcon, ChevronUpIcon, WrenchIcon } from "lucide-react"
import { cn } from "@/lib/utils"
import type { ServiceRequest } from "@/actions/service-requests"
import { getRequestMessages } from "@/actions/service-requests"
import { RequestStatusTracker } from "@/components/portal/request-status-tracker"
import { RequestThread } from "@/components/portal/request-thread"
import type { PortalMessage } from "@/actions/service-requests"

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface RequestListProps {
  requests: ServiceRequest[]
  orgId: string
  customerId: string
  senderName: string
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

const STATUS_LABELS: Record<string, string> = {
  submitted: "Submitted",
  reviewed: "Reviewed",
  scheduled: "Scheduled",
  complete: "Complete",
  declined: "Declined",
}

const STATUS_COLORS: Record<string, string> = {
  submitted: "bg-sky-500/15 text-sky-400 border-sky-500/30",
  reviewed: "bg-violet-500/15 text-violet-400 border-violet-500/30",
  scheduled: "bg-amber-500/15 text-amber-400 border-amber-500/30",
  complete: "bg-green-500/15 text-green-400 border-green-500/30",
  declined: "bg-destructive/15 text-destructive border-destructive/30",
}

function formatDate(date: Date | string): string {
  return new Date(date).toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
    year: "numeric",
  })
}

// ---------------------------------------------------------------------------
// RequestCard
// ---------------------------------------------------------------------------

function RequestCard({
  request,
  orgId,
  customerId,
  senderName,
}: {
  request: ServiceRequest
  orgId: string
  customerId: string
  senderName: string
}) {
  const [expanded, setExpanded] = useState(false)
  const [messages, setMessages] = useState<PortalMessage[] | null>(null)
  const [loadingMessages, setLoadingMessages] = useState(false)

  async function handleExpand() {
    const next = !expanded
    setExpanded(next)

    if (next && messages === null && !loadingMessages) {
      setLoadingMessages(true)
      try {
        const msgs = await getRequestMessages(orgId, request.id)
        setMessages(msgs)
      } catch {
        setMessages([])
      } finally {
        setLoadingMessages(false)
      }
    }
  }

  const categoryLabel = CATEGORY_LABELS[request.category] ?? request.category
  const statusLabel = STATUS_LABELS[request.status] ?? request.status
  const statusColor = STATUS_COLORS[request.status] ?? STATUS_COLORS.submitted

  return (
    <div className="rounded-xl border border-border/60 overflow-hidden">
      {/* Card header — always visible, clickable to expand */}
      <button
        type="button"
        onClick={() => void handleExpand()}
        className="w-full flex items-start gap-3 p-4 text-left hover:bg-muted/30 transition-colors cursor-pointer"
      >
        <div className="flex-1 min-w-0 flex flex-col gap-1.5">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="font-medium text-sm">{categoryLabel}</span>
            {request.is_urgent && (
              <span className="flex items-center gap-1 rounded-full border border-amber-500/40 bg-amber-500/10 px-2 py-0.5 text-xs font-medium text-amber-400">
                <AlertTriangleIcon className="h-3 w-3" />
                Urgent
              </span>
            )}
            <span
              className={cn(
                "rounded-full border px-2 py-0.5 text-xs font-medium",
                statusColor
              )}
            >
              {statusLabel}
            </span>
          </div>
          <p className="text-sm text-muted-foreground line-clamp-2">{request.description}</p>
          <div className="flex items-center gap-2 flex-wrap">
            {request.pool_name && (
              <span className="text-xs text-muted-foreground">{request.pool_name}</span>
            )}
            <span className="text-xs text-muted-foreground">
              Submitted {formatDate(request.created_at)}
            </span>
          </div>
        </div>
        <div className="shrink-0 mt-0.5">
          {expanded ? (
            <ChevronUpIcon className="h-4 w-4 text-muted-foreground" />
          ) : (
            <ChevronDownIcon className="h-4 w-4 text-muted-foreground" />
          )}
        </div>
      </button>

      {/* Expanded detail */}
      {expanded && (
        <div className="border-t border-border/60 flex flex-col gap-5 p-4">
          {/* Full description */}
          {request.description.length > 120 && (
            <div>
              <p className="text-xs font-medium text-muted-foreground mb-1">Description</p>
              <p className="text-sm">{request.description}</p>
            </div>
          )}

          {/* Photos */}
          {request.photo_paths.length > 0 && (
            <div>
              <p className="text-xs font-medium text-muted-foreground mb-2">
                Photos ({request.photo_paths.length})
              </p>
              <p className="text-xs text-muted-foreground italic">
                Photos available in your request confirmation.
              </p>
            </div>
          )}

          {/* Preferred date + time */}
          {request.preferred_date && (
            <div className="flex flex-col gap-1">
              <p className="text-xs font-medium text-muted-foreground">Preferred</p>
              <p className="text-sm">
                {new Date(request.preferred_date + "T12:00:00").toLocaleDateString(undefined, {
                  weekday: "short",
                  month: "short",
                  day: "numeric",
                  year: "numeric",
                })}
                {request.preferred_time_window && request.preferred_time_window !== "anytime" && (
                  <span className="text-muted-foreground">
                    {" "}
                    &middot;{" "}
                    {request.preferred_time_window === "morning" ? "Morning (8am–12pm)" : "Afternoon (12pm–5pm)"}
                  </span>
                )}
              </p>
            </div>
          )}

          {/* Status tracker */}
          <div>
            <p className="text-xs font-medium text-muted-foreground mb-3">Progress</p>
            <RequestStatusTracker status={request.status} officeNotes={request.office_notes} />
          </div>

          {/* Request thread */}
          {loadingMessages ? (
            <div className="h-20 flex items-center justify-center">
              <div className="w-5 h-5 border-2 border-primary border-t-transparent rounded-full animate-spin" />
            </div>
          ) : messages !== null ? (
            <RequestThread
              requestId={request.id}
              customerId={customerId}
              orgId={orgId}
              senderRole="customer"
              senderName={senderName}
              initialMessages={messages}
            />
          ) : null}
        </div>
      )}
    </div>
  )
}

// ---------------------------------------------------------------------------
// RequestList
// ---------------------------------------------------------------------------

/**
 * RequestList — customer's list of service requests.
 *
 * Each request card is expandable to show:
 * - Full details (description, photos, preferred date)
 * - Status tracker (Submitted → Reviewed → Scheduled → Complete)
 * - Per-request chat thread
 */
export function RequestList({ requests, orgId, customerId, senderName }: RequestListProps) {
  if (requests.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-16 text-center">
        <div className="flex h-12 w-12 items-center justify-center rounded-full bg-muted mb-4">
          <WrenchIcon className="h-6 w-6 text-muted-foreground" />
        </div>
        <p className="text-sm font-medium">No requests yet</p>
        <p className="text-sm text-muted-foreground italic mt-1">
          Need pool service? Submit a request and we&apos;ll take care of it.
        </p>
      </div>
    )
  }

  return (
    <div className="flex flex-col gap-3">
      {requests.map((request) => (
        <RequestCard
          key={request.id}
          request={request}
          orgId={orgId}
          customerId={customerId}
          senderName={senderName}
        />
      ))}
    </div>
  )
}
