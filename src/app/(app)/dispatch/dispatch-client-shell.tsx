"use client"

import { useState } from "react"
import dynamic from "next/dynamic"
import { MapPinIcon } from "lucide-react"
import type { DispatchData } from "@/actions/dispatch"
import { TechFilter } from "@/components/dispatch/tech-filter"

// DispatchMap MUST be loaded client-side only — MapLibre accesses window on import.
const DispatchMap = dynamic(
  () =>
    import("@/components/dispatch/dispatch-map").then((m) => m.DispatchMap),
  {
    ssr: false,
    loading: () => (
      <div className="flex-1 flex items-center justify-center">
        <div className="flex flex-col items-center gap-3 text-center px-4">
          <div className="rounded-full bg-muted/30 p-4 animate-pulse">
            <MapPinIcon className="h-8 w-8 text-muted-foreground/40" />
          </div>
          <p className="text-sm text-muted-foreground">Loading map&hellip;</p>
        </div>
      </div>
    ),
  }
)

interface DispatchClientShellProps {
  initialData: DispatchData
  orgId: string
}

/**
 * DispatchClientShell — client wrapper that owns TechFilter selection state.
 *
 * Sits between the server-side DispatchPage and the client-side DispatchMap.
 * Holds `selectedTechId` state so TechFilter and DispatchMap can communicate.
 *
 * Layout:
 * - Page header "Dispatch" at the top
 * - TechFilter bar below the header
 * - Full-bleed DispatchMap filling remaining viewport height
 */
export function DispatchClientShell({ initialData, orgId }: DispatchClientShellProps) {
  const [selectedTechId, setSelectedTechId] = useState<string | null>(null)

  const hasStops = initialData.stops.length > 0

  return (
    <div className="flex flex-col h-full">
      {/* ── Page header ───────────────────────────────────────────────────── */}
      <div className="flex items-center justify-between px-4 pt-4 pb-2 flex-shrink-0">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Dispatch</h1>
          <p className="text-sm text-muted-foreground mt-0.5">
            {hasStops
              ? `${initialData.stops.length} stop${initialData.stops.length !== 1 ? "s" : ""} across ${initialData.techs.length} tech${initialData.techs.length !== 1 ? "s" : ""} today`
              : "No stops scheduled for today"}
          </p>
        </div>
      </div>

      {/* ── Tech filter bar ───────────────────────────────────────────────── */}
      {initialData.techs.length > 0 && (
        <div className="flex-shrink-0 border-b border-border/40">
          <TechFilter
            techs={initialData.techs}
            selectedTechId={selectedTechId}
            onSelectTech={setSelectedTechId}
          />
        </div>
      )}

      {/* ── Dispatch map — fills remaining height ────────────────────────── */}
      {hasStops ? (
        <div className="flex-1 min-h-0 relative">
          <DispatchMap
            initialData={initialData}
            orgId={orgId}
            selectedTechId={selectedTechId}
          />
        </div>
      ) : (
        /* Empty state when no stops today */
        <div className="flex-1 flex flex-col items-center justify-center gap-4 px-4">
          <div className="rounded-full bg-muted/20 p-6">
            <MapPinIcon className="h-12 w-12 text-muted-foreground/30" />
          </div>
          <div className="text-center max-w-xs">
            <p className="text-sm font-medium">No route stops today</p>
            <p className="text-xs text-muted-foreground mt-1">
              Use the Schedule page to assign stops to techs for today&apos;s route.
            </p>
          </div>
        </div>
      )}
    </div>
  )
}
