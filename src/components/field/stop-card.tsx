"use client"

import { MapPinIcon, GripVerticalIcon, WavesIcon, FlameIcon, SparklesIcon } from "lucide-react"
import { cn } from "@/lib/utils"
import type { RouteStop } from "@/actions/routes"
import type { DraggableSyntheticListeners, DraggableAttributes } from "@dnd-kit/core"

// ─── Map navigation ───────────────────────────────────────────────────────────

type MapsPreference = "apple" | "google"

/**
 * openInMaps — opens the address in the tech's preferred maps app.
 *
 * Per locked decision: "tech sets their preferred maps app in settings;
 * navigation button opens that app with the address"
 *
 * Reads preference from localStorage key `poolco-maps-pref`.
 * Defaults to "apple" on iOS (navigator.platform contains "iPhone"/"iPad"),
 * "google" on everything else.
 *
 * Uses https:// URLs (not app:// deep links) — more reliable in PWA standalone
 * mode. Apple Maps https URLs open the Maps app on iOS/macOS; on Android
 * they redirect to Google Maps or the configured handler.
 */
export function openInMaps(address: string): void {
  const encoded = encodeURIComponent(address)

  let preference: MapsPreference = "google"
  if (typeof window !== "undefined") {
    const stored = localStorage.getItem("poolco-maps-pref") as MapsPreference | null
    if (stored === "apple" || stored === "google") {
      preference = stored
    } else {
      // Default to Apple Maps on iOS devices
      const isIos =
        /iPhone|iPad|iPod/.test(navigator.userAgent) ||
        (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1)
      preference = isIos ? "apple" : "google"
    }
  }

  const url =
    preference === "apple"
      ? `https://maps.apple.com/?q=${encoded}`
      : `https://www.google.com/maps/search/?api=1&query=${encoded}`

  window.open(url, "_blank", "noopener,noreferrer")
}

// ─── Status badge ─────────────────────────────────────────────────────────────

const STATUS_LABEL: Record<RouteStop["stopStatus"], string> = {
  upcoming: "Upcoming",
  in_progress: "In Progress",
  complete: "Complete",
  skipped: "Skipped",
}

const STATUS_CLASSES: Record<RouteStop["stopStatus"], string> = {
  upcoming: "bg-muted text-muted-foreground",
  in_progress: "bg-blue-500/20 text-blue-400 border border-blue-500/30",
  complete: "bg-green-500/20 text-green-400 border border-green-500/30",
  skipped: "bg-amber-500/20 text-amber-400 border border-amber-500/30",
}

// ─── Pool type icon ───────────────────────────────────────────────────────────

function PoolTypeIcon({ type }: { type: RouteStop["poolType"] }) {
  if (type === "spa") return <FlameIcon className="h-3.5 w-3.5 shrink-0" />
  if (type === "fountain") return <SparklesIcon className="h-3.5 w-3.5 shrink-0" />
  return <WavesIcon className="h-3.5 w-3.5 shrink-0" />
}

// ─── StopCard ─────────────────────────────────────────────────────────────────

interface StopCardProps {
  stop: RouteStop
  showDragHandle?: boolean
  /** Pass dragListeners and dragAttributes from useSortable when in sortable context */
  dragListeners?: DraggableSyntheticListeners
  dragAttributes?: DraggableAttributes
  className?: string
}

/**
 * StopCard — individual stop card for the tech route view.
 *
 * Per locked decision: "Each stop displayed as an info card: customer name,
 * address, last service date, pool type, and special notes"
 *
 * FIELD-11: 44px minimum card height, generous padding for wet-hand tapping.
 * Navigate button opens Apple Maps or Google Maps based on stored preference.
 */
export function StopCard({
  stop,
  showDragHandle = false,
  dragListeners,
  dragAttributes,
  className,
}: StopCardProps) {
  const lastServiceLabel = stop.lastServiceDate
    ? new Date(stop.lastServiceDate).toLocaleDateString("en-US", {
        month: "short",
        day: "numeric",
      })
    : "No prior service"

  const hasNotes = !!(stop.accessNotes || stop.gateCode || stop.customerNotes)

  const notesText = [
    stop.gateCode ? `Gate: ${stop.gateCode}` : null,
    stop.accessNotes ?? null,
    stop.customerNotes ?? null,
  ]
    .filter(Boolean)
    .join(" · ")

  return (
    <div
      className={cn(
        "relative flex items-stretch gap-0 rounded-xl border border-border bg-card overflow-hidden",
        "transition-shadow duration-150",
        stop.stopStatus === "complete" && "opacity-70",
        className
      )}
    >
      {/* Drag handle — only visible when reordering is active */}
      {showDragHandle && (
        <button
          className={cn(
            "flex items-center justify-center w-10 shrink-0",
            "text-muted-foreground/40 hover:text-muted-foreground/70",
            "touch-none cursor-grab active:cursor-grabbing",
            "transition-colors duration-150",
          )}
          aria-label="Drag to reorder"
          {...dragListeners}
          {...dragAttributes}
        >
          <GripVerticalIcon className="h-5 w-5" />
        </button>
      )}

      {/* Stop number indicator */}
      <div className="flex items-center justify-center w-10 shrink-0 pl-4">
        <span className="text-xs font-bold text-muted-foreground/60 tabular-nums">
          {stop.stopIndex + 1}
        </span>
      </div>

      {/* Main content — flex-1 */}
      <div className="flex flex-1 flex-col py-3 pr-3 pl-2 gap-1 min-w-0">
        {/* Row 1: Customer name + status badge */}
        <div className="flex items-center gap-2 min-w-0">
          <span className="font-semibold text-sm text-foreground truncate flex-1">
            {stop.customerName}
          </span>
          <span
            className={cn(
              "inline-flex shrink-0 items-center rounded-full px-2 py-0.5 text-[10px] font-medium leading-none",
              STATUS_CLASSES[stop.stopStatus]
            )}
          >
            {STATUS_LABEL[stop.stopStatus]}
          </span>
        </div>

        {/* Row 2: Address */}
        {stop.address && (
          <p className="text-xs text-muted-foreground truncate leading-snug">
            {stop.address}
          </p>
        )}

        {/* Row 3: Pool type + last service date */}
        <div className="flex items-center gap-1.5 text-muted-foreground/70">
          <PoolTypeIcon type={stop.poolType} />
          <span className="text-xs truncate">
            {stop.poolName}
            <span className="mx-1 opacity-40">·</span>
            <span className="opacity-70">{lastServiceLabel}</span>
          </span>
        </div>

        {/* Row 4: Notes strip — yellow-tinted if non-empty */}
        {hasNotes && (
          <div className="mt-0.5 rounded-md bg-amber-500/10 border border-amber-500/20 px-2 py-1">
            <p className="text-[11px] text-amber-300/90 leading-snug line-clamp-2">
              {notesText}
            </p>
          </div>
        )}
      </div>

      {/* Navigate button */}
      <div className="flex items-center pr-3 pl-1 shrink-0">
        <button
          type="button"
          onClick={() => stop.address && openInMaps(stop.address)}
          disabled={!stop.address}
          className={cn(
            "flex h-11 w-11 items-center justify-center rounded-lg",
            "bg-primary/10 hover:bg-primary/20 active:bg-primary/30",
            "text-primary transition-colors duration-150",
            "disabled:opacity-30 disabled:cursor-not-allowed",
            "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/50"
          )}
          aria-label={`Navigate to ${stop.customerName}`}
          title={stop.address ? `Open in Maps: ${stop.address}` : "No address available"}
        >
          <MapPinIcon className="h-5 w-5" />
        </button>
      </div>
    </div>
  )
}
