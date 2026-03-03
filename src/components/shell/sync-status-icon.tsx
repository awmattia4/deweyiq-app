"use client"

import { CloudIcon, CloudUploadIcon, CloudAlertIcon } from "lucide-react"
import { useSyncStatus } from "@/hooks/use-sync-status"
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip"

/**
 * SyncStatusIcon — Header icon showing the current sync queue state.
 *
 * Per user decision: "Sync status: persistent icon in header showing
 * synced/syncing/pending state."
 *
 * States:
 * - synced:  Cloud-check icon, muted green — everything up to date
 * - syncing: Cloud-upload icon with pulse animation — actively syncing
 * - pending: Cloud-upload icon with count badge — writes waiting to send
 * - error:   Cloud-alert icon, destructive red — writes failed after max retries
 *
 * Per user decision: "only alert user on final failure after retries exhausted"
 * The error state ONLY appears when items have status="failed" (MAX_RETRIES exceeded).
 * Transient errors during retry show as "pending" or "syncing".
 *
 * Integration: Drop inside the header/nav bar. Wrap a parent with TooltipProvider
 * (typically the root layout).
 */
export function SyncStatusIcon() {
  const { status, pendingCount, failedCount } = useSyncStatus()

  const tooltipText = getTooltipText(status, pendingCount, failedCount)

  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <button
          type="button"
          className="relative inline-flex items-center justify-center rounded-md p-1.5 transition-colors hover:bg-white/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/30"
          aria-label={tooltipText}
        >
          <SyncIcon status={status} />
          {status === "pending" && pendingCount > 0 && (
            <PendingBadge count={pendingCount} />
          )}
        </button>
      </TooltipTrigger>
      <TooltipContent side="bottom">
        {tooltipText}
      </TooltipContent>
    </Tooltip>
  )
}

// ─── Sub-components ────────────────────────────────────────────────────────────

function SyncIcon({ status }: { status: "synced" | "syncing" | "pending" | "error" }) {
  const baseClass = "h-5 w-5"

  switch (status) {
    case "synced":
      return (
        <CloudIcon
          className={`${baseClass} text-emerald-400`}
          aria-hidden="true"
        />
      )

    case "syncing":
      return (
        <CloudUploadIcon
          className={`${baseClass} animate-pulse text-sky-400`}
          aria-hidden="true"
        />
      )

    case "pending":
      return (
        <CloudUploadIcon
          className={`${baseClass} text-amber-400`}
          aria-hidden="true"
        />
      )

    case "error":
      return (
        <CloudAlertIcon
          className={`${baseClass} text-destructive`}
          aria-hidden="true"
        />
      )
  }
}

function PendingBadge({ count }: { count: number }) {
  return (
    <span
      className="absolute -top-0.5 -right-0.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-amber-400 px-0.5 text-[10px] font-bold leading-none text-amber-950"
      aria-hidden="true"
    >
      {count > 99 ? "99+" : count}
    </span>
  )
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function getTooltipText(
  status: "synced" | "syncing" | "pending" | "error",
  pendingCount: number,
  failedCount: number
): string {
  switch (status) {
    case "synced":
      return "All changes synced"
    case "syncing":
      return "Syncing changes..."
    case "pending":
      return `${pendingCount} ${pendingCount === 1 ? "change" : "changes"} pending`
    case "error":
      return `${failedCount} ${failedCount === 1 ? "change" : "changes"} failed to sync`
  }
}
