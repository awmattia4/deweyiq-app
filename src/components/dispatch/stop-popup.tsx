"use client"

import Link from "next/link"
import { XIcon, UserIcon, MapPinIcon, ClockIcon } from "lucide-react"
import type { DispatchStop, DispatchTech } from "@/actions/dispatch"

interface StopPopupProps {
  stop: DispatchStop
  tech: DispatchTech | undefined
  onClose: () => void
}

/**
 * STATUS_LABELS and STATUS_COLORS — display text and color for each stop status.
 */
const STATUS_LABELS: Record<string, string> = {
  scheduled: "Scheduled",
  in_progress: "In Progress",
  complete: "Complete",
  skipped: "Skipped",
  holiday: "Holiday",
}

function getStatusStyle(status: string) {
  switch (status) {
    case "complete":
      return { backgroundColor: "oklch(0.5 0.15 140 / 0.2)", color: "oklch(0.65 0.15 140)", borderColor: "oklch(0.5 0.15 140 / 0.3)" }
    case "in_progress":
      return { backgroundColor: "oklch(0.5 0.18 60 / 0.2)", color: "oklch(0.7 0.18 60)", borderColor: "oklch(0.5 0.18 60 / 0.3)" }
    case "skipped":
      return { backgroundColor: "oklch(0.5 0.18 25 / 0.2)", color: "oklch(0.65 0.18 25)", borderColor: "oklch(0.5 0.18 25 / 0.3)" }
    case "holiday":
      return { backgroundColor: "oklch(0.5 0.14 280 / 0.2)", color: "oklch(0.65 0.14 280)", borderColor: "oklch(0.5 0.14 280 / 0.3)" }
    default: // scheduled
      return { backgroundColor: "oklch(0.4 0.05 250 / 0.2)", color: "oklch(0.65 0.05 250)", borderColor: "oklch(0.4 0.05 250 / 0.3)" }
  }
}

function formatTime(timeStr: string | null): string | null {
  if (!timeStr) return null
  // HH:MM:SS → HH:MM AM/PM
  const [hourStr, minuteStr] = timeStr.split(":")
  const hour = parseInt(hourStr, 10)
  const minute = minuteStr ?? "00"
  const ampm = hour >= 12 ? "PM" : "AM"
  const displayHour = hour % 12 || 12
  return `${displayHour}:${minute} ${ampm}`
}

/**
 * StopPopup — quick info card shown when a stop marker is clicked.
 *
 * Rendered as a React overlay above the map (not a MapLibre Popup) so
 * we get full React rendering including Link components.
 *
 * Per user decision contents:
 * - Customer name
 * - Address
 * - Status badge
 * - Scheduled time (from window_start)
 * - Tech name
 * - Link to full customer profile
 */
export function StopPopup({ stop, tech, onClose }: StopPopupProps) {
  const statusStyle = getStatusStyle(stop.status)
  const formattedTime = formatTime(stop.scheduledTime)

  return (
    <div className="absolute bottom-16 left-1/2 -translate-x-1/2 z-30 w-72 max-w-[calc(100vw-2rem)] pointer-events-auto">
      <div className="rounded-xl border border-border/60 bg-card/95 backdrop-blur-sm shadow-2xl p-4">
        {/* Header row: customer name + close button */}
        <div className="flex items-start justify-between gap-2 mb-3">
          <div className="min-w-0">
            <p className="font-semibold text-sm leading-tight truncate">{stop.customerName}</p>
            <p className="text-xs text-muted-foreground truncate mt-0.5">{stop.poolName}</p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="flex-shrink-0 rounded-md p-1 text-muted-foreground hover:text-foreground hover:bg-muted/60 transition-colors cursor-pointer -mt-0.5 -mr-0.5"
            aria-label="Close"
          >
            <XIcon className="h-3.5 w-3.5" />
          </button>
        </div>

        {/* Details grid */}
        <div className="space-y-2">
          {/* Status badge */}
          <div className="flex items-center gap-2">
            <span
              className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium border"
              style={statusStyle}
            >
              {STATUS_LABELS[stop.status] ?? stop.status}
            </span>
          </div>

          {/* Address */}
          {stop.address && (
            <div className="flex items-start gap-1.5 text-xs text-muted-foreground">
              <MapPinIcon className="h-3.5 w-3.5 flex-shrink-0 mt-0.5" aria-hidden="true" />
              <span className="leading-tight">{stop.address}</span>
            </div>
          )}

          {/* Scheduled time */}
          {formattedTime && (
            <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
              <ClockIcon className="h-3.5 w-3.5 flex-shrink-0" aria-hidden="true" />
              <span>{formattedTime}</span>
            </div>
          )}

          {/* Tech name */}
          {tech && (
            <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
              <UserIcon className="h-3.5 w-3.5 flex-shrink-0" aria-hidden="true" />
              <span
                className="font-medium"
                style={{ color: tech.color }}
              >
                {tech.name}
              </span>
            </div>
          )}
        </div>

        {/* Customer profile link */}
        <Link
          href={`/customers/${stop.customerId}`}
          className="mt-3 flex w-full items-center justify-center rounded-lg bg-muted/60 hover:bg-muted px-3 py-2 text-xs font-medium text-foreground transition-colors cursor-pointer"
          onClick={onClose}
        >
          View Customer Profile
        </Link>
      </div>
    </div>
  )
}
