"use client"

import { MapPinIcon, ClockIcon, NavigationIcon, CheckCircle2Icon, PlayIcon, CalendarOffIcon, SkipForwardIcon } from "lucide-react"
import type { DispatchStop, DispatchTech } from "@/actions/dispatch"

// ─── Status helpers ──────────────────────────────────────────────────────────

function getStatusConfig(status: string) {
  switch (status) {
    case "complete":
      return { label: "Complete", icon: CheckCircle2Icon, bg: "bg-emerald-500/15", text: "text-emerald-400", border: "border-emerald-500/30" }
    case "in_progress":
      return { label: "In Progress", icon: PlayIcon, bg: "bg-primary/15", text: "text-primary", border: "border-primary/30" }
    case "skipped":
      return { label: "Skipped", icon: SkipForwardIcon, bg: "bg-amber-500/15", text: "text-amber-400", border: "border-amber-500/30" }
    case "holiday":
      return { label: "Holiday", icon: CalendarOffIcon, bg: "bg-violet-500/15", text: "text-violet-400", border: "border-violet-500/30" }
    default:
      return { label: "Scheduled", icon: ClockIcon, bg: "bg-muted/40", text: "text-muted-foreground", border: "border-border" }
  }
}

function formatTime(timeStr: string | null): string | null {
  if (!timeStr) return null
  const [h, m] = timeStr.split(":")
  const hour = parseInt(h, 10)
  const ampm = hour >= 12 ? "PM" : "AM"
  const h12 = hour === 0 ? 12 : hour > 12 ? hour - 12 : hour
  return `${h12}:${m} ${ampm}`
}

// ─── DispatchStopList ─────────────────────────────────────────────────────────

interface DispatchStopListProps {
  stops: DispatchStop[]
  techs: DispatchTech[]
  selectedTechId: string | null
  selectedStopId: string | null
  onSelectStop: (stop: DispatchStop | null) => void
}

export function DispatchStopList({
  stops,
  techs,
  selectedTechId,
  selectedStopId,
  onSelectStop,
}: DispatchStopListProps) {
  const techMap = new Map(techs.map((t) => [t.id, t]))

  // Filter by selected tech
  const filteredStops = selectedTechId
    ? stops.filter((s) => s.techId === selectedTechId)
    : stops

  // Group by tech for "All Techs" view
  const groupedByTech = !selectedTechId
    ? techs.map((tech) => ({
        tech,
        stops: filteredStops
          .filter((s) => s.techId === tech.id)
          .sort((a, b) => a.sortIndex - b.sortIndex),
      })).filter((g) => g.stops.length > 0)
    : null

  // Summary stats
  const totalStops = filteredStops.length
  const completedStops = filteredStops.filter((s) => s.status === "complete").length
  const inProgressStop = filteredStops.find((s) => s.status === "in_progress")

  return (
    <div className="flex flex-col h-full">
      {/* ── Summary bar ─────────────────────────────────────────────────── */}
      <div className="flex items-center justify-between px-4 py-2.5 border-b border-border/40">
        <div className="flex items-center gap-3">
          <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
            Today&apos;s Stops
          </p>
          <span className="text-xs text-muted-foreground">
            {completedStops}/{totalStops} complete
          </span>
        </div>
        {inProgressStop && (
          <div className="flex items-center gap-1.5">
            <span className="relative flex h-2 w-2">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-primary opacity-75" />
              <span className="relative inline-flex rounded-full h-2 w-2 bg-primary" />
            </span>
            <span className="text-xs font-medium text-primary truncate max-w-[140px]">
              {inProgressStop.customerName}
            </span>
          </div>
        )}
      </div>

      {/* ── Progress bar ────────────────────────────────────────────────── */}
      {totalStops > 0 && (
        <div className="px-4 pt-2 pb-1">
          <div className="h-1 w-full rounded-full bg-muted/40 overflow-hidden">
            <div
              className="h-full rounded-full bg-emerald-500 transition-all duration-500"
              style={{ width: `${Math.round((completedStops / totalStops) * 100)}%` }}
            />
          </div>
        </div>
      )}

      {/* ── Stop list ───────────────────────────────────────────────────── */}
      <div className="flex-1 overflow-y-auto min-h-0">
        {filteredStops.length === 0 ? (
          <div className="flex flex-col items-center justify-center gap-2 py-8 px-4 text-center">
            <MapPinIcon className="h-6 w-6 text-muted-foreground/30" />
            <p className="text-sm text-muted-foreground italic">No stops for this tech today</p>
          </div>
        ) : groupedByTech ? (
          // All-techs view: grouped by tech
          groupedByTech.map(({ tech, stops: techStops }) => (
            <div key={tech.id}>
              <div className="sticky top-0 z-10 flex items-center gap-2 px-4 py-1.5 bg-background/95 backdrop-blur-sm border-b border-border/20">
                <div className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: tech.color }} />
                <span className="text-xs font-medium">{tech.name}</span>
                <span className="text-xs text-muted-foreground ml-auto">
                  {techStops.filter((s) => s.status === "complete").length}/{techStops.length}
                </span>
              </div>
              {techStops.map((stop) => (
                <StopRow
                  key={stop.id}
                  stop={stop}
                  tech={tech}
                  isSelected={stop.id === selectedStopId}
                  onSelect={onSelectStop}
                />
              ))}
            </div>
          ))
        ) : (
          // Single-tech view: flat list
          filteredStops
            .sort((a, b) => a.sortIndex - b.sortIndex)
            .map((stop) => (
              <StopRow
                key={stop.id}
                stop={stop}
                tech={stop.techId ? techMap.get(stop.techId) : undefined}
                isSelected={stop.id === selectedStopId}
                onSelect={onSelectStop}
              />
            ))
        )}
      </div>
    </div>
  )
}

// ─── StopRow ──────────────────────────────────────────────────────────────────

function StopRow({
  stop,
  tech,
  isSelected,
  onSelect,
}: {
  stop: DispatchStop
  tech?: DispatchTech
  isSelected: boolean
  onSelect: (stop: DispatchStop | null) => void
}) {
  const status = getStatusConfig(stop.status)
  const StatusIcon = status.icon
  const formattedTime = formatTime(stop.scheduledTime)

  return (
    <button
      type="button"
      onClick={() => onSelect(isSelected ? null : stop)}
      className={`w-full text-left px-4 py-2.5 flex items-start gap-3 border-b border-border/20 transition-colors hover:bg-muted/20 ${
        isSelected ? "bg-primary/5 border-l-2 border-l-primary" : ""
      }`}
    >
      {/* Sort index badge */}
      <div
        className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-[10px] font-bold mt-0.5"
        style={{
          backgroundColor: stop.status === "complete" || stop.status === "skipped"
            ? "#374151"
            : (tech?.color ?? "#60a5fa"),
          color: "white",
        }}
      >
        {stop.status === "skipped" ? "✕" : stop.sortIndex}
      </div>

      {/* Stop info */}
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2">
          <p className={`text-sm font-medium truncate ${stop.status === "complete" ? "text-muted-foreground line-through" : ""}`}>
            {stop.customerName}
          </p>
        </div>
        <div className="flex items-center gap-2 mt-0.5">
          {stop.address && (
            <span className="flex items-center gap-1 text-xs text-muted-foreground truncate">
              <NavigationIcon className="h-2.5 w-2.5 shrink-0" />
              {stop.address}
            </span>
          )}
        </div>
        {stop.poolName && stop.poolName !== "Pool" && (
          <p className="text-xs text-muted-foreground/70 mt-0.5 truncate">{stop.poolName}</p>
        )}
      </div>

      {/* Right side: time + status */}
      <div className="flex flex-col items-end gap-1 shrink-0">
        {formattedTime && (
          <span className="text-xs text-muted-foreground">{formattedTime}</span>
        )}
        <span className={`inline-flex items-center gap-1 rounded-full px-1.5 py-0.5 text-[10px] font-medium ${status.bg} ${status.text} border ${status.border}`}>
          <StatusIcon className="h-2.5 w-2.5" />
          {status.label}
        </span>
      </div>
    </button>
  )
}
