"use client"

import { useState } from "react"
import { AlertTriangleIcon } from "lucide-react"
import { cn } from "@/lib/utils"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import type { OfficeServiceRequest } from "@/actions/service-requests"
import { RequestReviewPanel } from "@/components/requests/request-review-panel"

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface OfficeRequestListProps {
  requests: OfficeServiceRequest[]
  orgId: string
  officerName: string
}

type FilterTab = "all" | "new" | "in_progress" | "completed"

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
  submitted: "New",
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
  })
}

function filterRequests(requests: OfficeServiceRequest[], tab: FilterTab): OfficeServiceRequest[] {
  switch (tab) {
    case "new":
      return requests.filter((r) => r.status === "submitted")
    case "in_progress":
      return requests.filter((r) => r.status === "reviewed" || r.status === "scheduled")
    case "completed":
      return requests.filter((r) => r.status === "complete" || r.status === "declined")
    default:
      return requests
  }
}

// ---------------------------------------------------------------------------
// OfficeRequestList
// ---------------------------------------------------------------------------

/**
 * OfficeRequestList — office-side request queue with filter tabs and review panel.
 *
 * Filter tabs: All | New | In Progress | Completed
 * Urgent requests have amber left border.
 * Clicking opens RequestReviewPanel.
 */
export function OfficeRequestList({ requests, orgId, officerName }: OfficeRequestListProps) {
  const [activeTab, setActiveTab] = useState<FilterTab>("all")
  const [selectedRequest, setSelectedRequest] = useState<OfficeServiceRequest | null>(null)
  const [localRequests, setLocalRequests] = useState(requests)

  const filteredRequests = filterRequests(localRequests, activeTab)

  const newCount = localRequests.filter((r) => r.status === "submitted").length
  const inProgressCount = localRequests.filter(
    (r) => r.status === "reviewed" || r.status === "scheduled"
  ).length
  const completedCount = localRequests.filter(
    (r) => r.status === "complete" || r.status === "declined"
  ).length

  // Update request in local state after action
  function handleRequestUpdated(updatedRequest: OfficeServiceRequest) {
    setLocalRequests((prev) =>
      prev.map((r) => (r.id === updatedRequest.id ? updatedRequest : r))
    )
    setSelectedRequest(updatedRequest)
  }

  const tabs: { key: FilterTab; label: string; count: number }[] = [
    { key: "all", label: "All", count: localRequests.length },
    { key: "new", label: "New", count: newCount },
    { key: "in_progress", label: "In Progress", count: inProgressCount },
    { key: "completed", label: "Completed", count: completedCount },
  ]

  return (
    <div className="flex flex-col gap-4">
      {/* ── Filter tabs — mobile dropdown / desktop tab bar ─────────── */}
      <div className="sm:hidden">
        <Select value={activeTab} onValueChange={(v) => setActiveTab(v as FilterTab)}>
          <SelectTrigger>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {tabs.map((tab) => (
              <SelectItem key={tab.key} value={tab.key}>
                {tab.label} ({tab.count})
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
      <div className="hidden sm:flex items-center gap-1 border-b border-border/60">
        {tabs.map((tab) => (
          <button
            key={tab.key}
            type="button"
            onClick={() => setActiveTab(tab.key)}
            className={cn(
              "flex items-center gap-1.5 px-3 py-2.5 text-sm font-medium whitespace-nowrap border-b-2 -mb-px transition-colors cursor-pointer",
              activeTab === tab.key
                ? "border-primary text-foreground"
                : "border-transparent text-muted-foreground hover:text-foreground"
            )}
          >
            {tab.label}
            {tab.count > 0 && (
              <span
                className={cn(
                  "rounded-full px-1.5 py-0.5 text-[10px] font-semibold",
                  activeTab === tab.key
                    ? "bg-primary/20 text-primary"
                    : "bg-muted text-muted-foreground"
                )}
              >
                {tab.count}
              </span>
            )}
          </button>
        ))}
      </div>

      {/* ── Request list ─────────────────────────────────────────────── */}
      {filteredRequests.length === 0 ? (
        <div className="py-12 text-center">
          <p className="text-sm text-muted-foreground italic">No requests in this category.</p>
        </div>
      ) : (
        <div className="flex flex-col gap-2">
          {filteredRequests.map((request) => {
            const categoryLabel = CATEGORY_LABELS[request.category] ?? request.category
            const statusLabel = STATUS_LABELS[request.status] ?? request.status
            const statusColor = STATUS_COLORS[request.status] ?? STATUS_COLORS.submitted

            return (
              <button
                key={request.id}
                type="button"
                onClick={() => setSelectedRequest(request)}
                className={cn(
                  "flex items-start gap-3 rounded-xl border p-4 text-left transition-colors cursor-pointer hover:bg-muted/50",
                  request.is_urgent
                    ? "border-l-4 border-l-amber-500 border-border/60"
                    : "border-border/60",
                  selectedRequest?.id === request.id && "bg-muted/40"
                )}
              >
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap mb-1">
                    <span className="font-medium text-sm">{request.customer_name}</span>
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
                  <p className="text-sm text-muted-foreground">{categoryLabel}</p>
                  <p className="text-xs text-muted-foreground line-clamp-1 mt-0.5">
                    {request.description}
                  </p>
                  <p className="text-xs text-muted-foreground mt-1">
                    {formatDate(request.created_at)}
                    {request.pool_name && ` · ${request.pool_name}`}
                  </p>
                </div>
              </button>
            )
          })}
        </div>
      )}

      {/* ── Review panel (dialog/sheet) ───────────────────────────────── */}
      {selectedRequest && (
        <RequestReviewPanel
          request={selectedRequest}
          orgId={orgId}
          officerName={officerName}
          onClose={() => setSelectedRequest(null)}
          onRequestUpdated={handleRequestUpdated}
        />
      )}
    </div>
  )
}
