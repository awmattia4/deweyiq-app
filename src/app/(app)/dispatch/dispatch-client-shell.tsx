"use client"

import { useRef, useState, useEffect, useCallback } from "react"
import dynamic from "next/dynamic"
import { MapPinIcon, RefreshCwIcon } from "lucide-react"
import type { DispatchData, DispatchStop } from "@/actions/dispatch"
import { getDispatchData } from "@/actions/dispatch"
import { TechFilter } from "@/components/dispatch/tech-filter"
import { EtaOverlay } from "@/components/dispatch/eta-overlay"
import { DispatchStopList } from "@/components/dispatch/dispatch-stop-list"

const DispatchMap = dynamic(
  () =>
    import("@/components/dispatch/dispatch-map").then((m) => m.DispatchMap),
  {
    ssr: false,
    loading: () => (
      <div className="flex items-center justify-center h-full">
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

export function DispatchClientShell({ initialData, orgId }: DispatchClientShellProps) {
  const [data, setData] = useState<DispatchData>(initialData)
  const [selectedTechId, setSelectedTechId] = useState<string | null>(null)
  const [selectedStop, setSelectedStop] = useState<DispatchStop | null>(null)
  const [isRefreshing, setIsRefreshing] = useState(false)
  const headerRef = useRef<HTMLDivElement>(null)
  const [availableHeight, setAvailableHeight] = useState<number>(0)

  const hasStops = data.stops.length > 0
  const hasTechs = data.techs.length > 0

  // Refresh dispatch data from server
  const refresh = useCallback(async () => {
    setIsRefreshing(true)
    try {
      const fresh = await getDispatchData()
      setData(fresh)
    } catch {
      // silently fail — stale data is better than no data
    } finally {
      setIsRefreshing(false)
    }
  }, [])

  // Auto-refresh every 30 seconds + on page focus (tab switch)
  useEffect(() => {
    const interval = setInterval(refresh, 30_000)
    const onFocus = () => refresh()
    document.addEventListener("visibilitychange", () => {
      if (document.visibilityState === "visible") onFocus()
    })
    return () => {
      clearInterval(interval)
      document.removeEventListener("visibilitychange", onFocus)
    }
  }, [refresh])

  // Measure header + filter, compute remaining height
  useEffect(() => {
    function measure() {
      if (!headerRef.current) return
      const headerBottom = headerRef.current.getBoundingClientRect().bottom
      setAvailableHeight(window.innerHeight - headerBottom)
    }
    measure()
    window.addEventListener("resize", measure)
    return () => window.removeEventListener("resize", measure)
  }, [])

  // Split: 55% map, 45% stop list
  const mapHeight = Math.round(availableHeight * 0.55)
  const listHeight = availableHeight - mapHeight

  return (
    <>
      {/* Header + filter — measured via ref */}
      <div ref={headerRef}>
        <div className="px-4 pt-4 pb-2">
          <h1 className="text-2xl font-bold tracking-tight">Dispatch</h1>
          <p className="text-sm text-muted-foreground mt-0.5">
            {hasStops
              ? `${data.stops.length} stop${data.stops.length !== 1 ? "s" : ""} across ${data.techs.length} tech${data.techs.length !== 1 ? "s" : ""} today`
              : "No stops scheduled for today"}
          </p>
        </div>
        {hasTechs && (
          <div className="border-b border-border/40">
            <TechFilter
              techs={data.techs}
              selectedTechId={selectedTechId}
              onSelectTech={setSelectedTechId}
            />
          </div>
        )}
      </div>

      {/* Map + Stop list */}
      {hasStops && availableHeight > 0 ? (
        <>
          {/* Map section */}
          <div style={{ height: mapHeight, position: "relative" }}>
            <DispatchMap
              initialData={data}
              orgId={orgId}
              selectedTechId={selectedTechId}
              mapHeight={mapHeight}
              selectedStop={selectedStop}
              onSelectStop={setSelectedStop}
            />
            {selectedTechId && (
              <div className="absolute top-3 right-3 z-10 pointer-events-auto">
                <EtaOverlay techId={selectedTechId} orgId={orgId} />
              </div>
            )}
          </div>

          {/* Stop list section */}
          <div style={{ height: listHeight }} className="border-t border-border/40 bg-background">
            <DispatchStopList
              stops={data.stops}
              techs={data.techs}
              selectedTechId={selectedTechId}
              selectedStopId={selectedStop?.id ?? null}
              onSelectStop={setSelectedStop}
            />
          </div>
        </>
      ) : !hasStops ? (
        <div className="flex-1 flex flex-col items-center justify-center gap-4 px-4 py-12">
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
      ) : null}
    </>
  )
}
