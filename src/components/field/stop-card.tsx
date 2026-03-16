"use client"

import type { CSSProperties } from "react"
import Link from "next/link"
import { MapPinIcon, GripVerticalIcon, WavesIcon, FlameIcon, SparklesIcon, TrendingDownIcon, TrendingUpIcon } from "lucide-react"
import { cn } from "@/lib/utils"
import type { RouteStop } from "@/actions/routes"
import type { WeatherType } from "@/lib/weather/open-meteo"
import { WeatherBadge } from "@/components/weather/weather-badge"
import type { DraggableSyntheticListeners, DraggableAttributes } from "@dnd-kit/core"

// ─── Predictive alert badge ────────────────────────────────────────────────────

export interface StopPredictiveAlert {
  parameter: string
  direction: "low" | "high"
  projectedNext: number
  unit: string
  isEarlyPrediction: boolean
}

function _formatParamLabel(param: string): string {
  switch (param) {
    case "freeChlorine": return "Free Chlorine"
    case "pH": return "pH"
    case "totalAlkalinity": return "Total Alkalinity"
    case "salt": return "Salt"
    case "cya": return "CYA"
    case "calciumHardness": return "Calcium Hardness"
    default: return param
  }
}

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

// High-contrast OKLCH colors for outdoor sunlight visibility (FIELD-11)
// Saturated, bright colors — distinguishable in direct sunlight, not muted pastels
const STATUS_CLASSES: Record<RouteStop["stopStatus"], string> = {
  upcoming: "bg-muted/80 text-muted-foreground border border-border/40",
  in_progress: "bg-blue-500/20 text-blue-300 border border-blue-400/60 font-semibold",
  complete: "bg-green-500/20 text-green-300 border border-green-400/60 font-semibold",
  skipped: "bg-amber-500/20 text-amber-300 border border-amber-400/60 font-semibold",
}

// High-contrast inline styles for status badges — OKLCH values per FIELD-11 spec
// Used alongside STATUS_CLASSES for color precision where Tailwind palette falls short
const STATUS_STYLES: Record<RouteStop["stopStatus"], CSSProperties> = {
  upcoming: {},
  in_progress: {
    backgroundColor: "oklch(0.70 0.17 250 / 0.22)",
    color: "oklch(0.78 0.15 250)",
    borderColor: "oklch(0.70 0.17 250 / 0.50)",
  },
  complete: {
    backgroundColor: "oklch(0.75 0.18 142 / 0.22)",
    color: "oklch(0.82 0.16 142)",
    borderColor: "oklch(0.75 0.18 142 / 0.50)",
  },
  skipped: {
    backgroundColor: "oklch(0.75 0.15 85 / 0.22)",
    color: "oklch(0.82 0.14 85)",
    borderColor: "oklch(0.75 0.15 85 / 0.50)",
  },
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
  /**
   * Today's weather classification for the route area.
   * Null when clear — no badge is rendered on the card.
   */
  weather?: { type: WeatherType; label: string } | null
  /**
   * Predictive chemistry alert for this pool, if any.
   * Shown as a compact amber badge on the stop card — heads-up before arrival.
   * Per locked decision: "tech gets heads-up before arriving at a trending pool."
   */
  predictiveAlert?: StopPredictiveAlert | null
}

/**
 * StopCard — individual stop card for the tech route view.
 *
 * Per locked decision: "Each stop displayed as an info card: customer name,
 * address, last service date, pool type, and special notes"
 *
 * FIELD-11: 44px minimum card height, generous padding for wet-hand tapping.
 * Navigate button opens Apple Maps or Google Maps based on stored preference.
 *
 * Phase 10-07: weather badge shown in the header row when weather is non-clear.
 * All stops share the same badge — daily forecast for the route area.
 */
export function StopCard({
  stop,
  showDragHandle = false,
  dragListeners,
  dragAttributes,
  className,
  weather,
  predictiveAlert,
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

  // Build the stop route: /routes/{customerId}-{poolId}
  const stopHref = `/routes/${stop.customerId}-${stop.poolId}`

  return (
    <div
      className={cn(
        "relative flex items-stretch gap-0 rounded-xl border border-border bg-card overflow-hidden",
        "transition-all duration-200",
        stop.stopStatus === "complete" && "opacity-70",
        className
      )}
    >
      {/* Drag handle — only visible when reordering is active */}
      {/* 44px minimum touch target via min-w-[44px] min-h-[44px] (FIELD-11) */}
      {showDragHandle && (
        <button
          className={cn(
            "flex items-center justify-center min-w-[44px] min-h-[44px] shrink-0",
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
      <div className="flex items-center justify-center w-10 shrink-0 pl-4 pointer-events-none">
        <span className="text-xs font-bold text-muted-foreground/60 tabular-nums">
          {stop.stopIndex + 1}
        </span>
      </div>

      {/* Main content — clickable link to stop workflow */}
      <Link
        href={stopHref}
        className="flex flex-1 flex-col py-3 pr-3 pl-2 gap-1 min-w-0 cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-primary/50 hover:bg-muted/10 transition-colors duration-150 active:bg-muted/20"
        aria-label={`Open stop for ${stop.customerName}`}
      >
        {/* Row 1: Customer name + status badge + weather badge */}
        <div className="flex items-center gap-2 min-w-0">
          <span className="font-semibold text-sm text-foreground truncate flex-1">
            {stop.customerName}
          </span>
          {/* Weather badge — only shown for non-clear conditions */}
          {weather && weather.type !== "clear" && (
            <WeatherBadge type={weather.type} label={weather.label} />
          )}
          <span
            className={cn(
              "inline-flex shrink-0 items-center rounded-full px-2 py-0.5 text-[10px] font-medium leading-none transition-colors duration-300",
              STATUS_CLASSES[stop.stopStatus]
            )}
            style={STATUS_STYLES[stop.stopStatus]}
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

        {/* Row 5: Predictive chemistry alert badge — heads-up before arrival */}
        {predictiveAlert && (
          <div className="mt-0.5 flex items-center gap-1.5 rounded-md bg-amber-500/10 border border-amber-400/30 px-2 py-1">
            {predictiveAlert.direction === "low" ? (
              <TrendingDownIcon className="h-3 w-3 shrink-0 text-amber-400" aria-hidden="true" />
            ) : (
              <TrendingUpIcon className="h-3 w-3 shrink-0 text-amber-400" aria-hidden="true" />
            )}
            <p className="text-[11px] text-amber-300/90 leading-snug">
              {_formatParamLabel(predictiveAlert.parameter)} trending {predictiveAlert.direction}
              {predictiveAlert.isEarlyPrediction && (
                <span className="text-amber-400/60 ml-1">(early)</span>
              )}
            </p>
          </div>
        )}
      </Link>

      {/* Navigate button — separate from the card link */}
      <div className="flex items-center pr-3 pl-1 shrink-0">
        <button
          type="button"
          onClick={(e) => {
            e.preventDefault()
            e.stopPropagation()
            if (stop.address) openInMaps(stop.address)
          }}
          disabled={!stop.address}
          className={cn(
            "flex h-11 w-11 items-center justify-center rounded-lg",
            "bg-primary/10 hover:bg-primary/20 active:bg-primary/30",
            "text-primary transition-colors duration-150",
            "disabled:opacity-30 disabled:cursor-not-allowed cursor-pointer",
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
