"use client"

import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import dynamic from "next/dynamic"
import type { MapClientHandle } from "@/components/map/map-client"
import type { DispatchData, DispatchStop, DispatchTech } from "@/actions/dispatch"
import type { TechPosition } from "@/hooks/use-tech-positions"
import { useTechPositions } from "@/hooks/use-tech-positions"
import { getRouteDirections } from "@/actions/optimize"

// SSR-safe dynamic import — MapLibre accesses window on import (same as route-map.tsx)
const MapClient = dynamic(
  () => import("@/components/map/map-client").then((m) => m.MapClient),
  { ssr: false }
)

// ─── Co-located stop grouping (identical to route-map.tsx) ────────────────────

interface ColocatedGroup {
  primaryId: string
  indices: number[]
  allIds: Set<string>
}

function groupColocatedStops(
  stops: Array<{ id: string; lat: number | null; lng: number | null }>,
  indexMap: Map<string, number>
): Map<string, ColocatedGroup> {
  const coordGroups = new Map<string, string[]>()
  for (const s of stops) {
    if (s.lat == null || s.lng == null) continue
    const key = `${s.lat},${s.lng}`
    const group = coordGroups.get(key) ?? []
    group.push(s.id)
    coordGroups.set(key, group)
  }
  const result = new Map<string, ColocatedGroup>()
  for (const ids of coordGroups.values()) {
    if (ids.length < 2) continue
    const primaryId = ids[0]
    const indices = ids.map((id) => indexMap.get(id) ?? 0).sort((a, b) => a - b)
    result.set(primaryId, { primaryId, indices, allIds: new Set(ids) })
  }
  return result
}

// ─── Marker creation (tech-colored, matching route-map style) ─────────────────

function createStopMarkerEl(
  index: number,
  status: string,
  techColor: string,
  isInProgress: boolean
): HTMLElement {
  const isComplete = status === "complete" || status === "skipped"
  const isHoliday = status === "holiday"

  const el = document.createElement("div")
  el.style.cssText = `
    width: 28px; height: 28px; border-radius: 50%;
    display: flex; align-items: center; justify-content: center;
    font-size: 11px; font-weight: 700; font-family: system-ui, sans-serif;
    cursor: pointer; border: 2px solid transparent;
    box-shadow: 0 2px 6px rgba(0,0,0,0.5); position: relative; user-select: none;
  `
  if (isComplete || isHoliday) {
    el.style.backgroundColor = "#374151"
    el.style.color = "#9ca3af"
    el.style.borderColor = "#4b5563"
  } else {
    el.style.backgroundColor = techColor
    el.style.color = "white"
    el.style.borderColor = "white"
  }

  const label = document.createElement("span")
  label.textContent = status === "skipped" ? "✕" : isHoliday ? "✦" : String(index)
  el.appendChild(label)

  if (isInProgress) {
    // Inject pulse CSS once
    if (!document.getElementById("dispatch-pulse-css")) {
      const style = document.createElement("style")
      style.id = "dispatch-pulse-css"
      style.textContent = `@keyframes dispatch-pulse{0%{opacity:.8;transform:scale(1)}100%{opacity:0;transform:scale(2)}}`
      document.head.appendChild(style)
    }
    const pulse = document.createElement("div")
    pulse.style.cssText = `position:absolute;top:-5px;left:-5px;width:38px;height:38px;border-radius:50%;border:2px solid ${techColor};opacity:0;animation:dispatch-pulse 1.5s ease-out infinite;pointer-events:none;`
    el.appendChild(pulse)
  }
  return el
}

function createCombinedMarkerEl(indices: number[], status: string, techColor: string): HTMLElement {
  const isComplete = status === "complete" || status === "skipped"
  const isHoliday = status === "holiday"
  const el = document.createElement("div")
  el.style.cssText = `
    height: 28px; padding: 0 10px; border-radius: 14px;
    display: flex; align-items: center; justify-content: center;
    font-size: 11px; font-weight: 700; font-family: system-ui, sans-serif;
    cursor: pointer; border: 2px solid transparent;
    box-shadow: 0 2px 6px rgba(0,0,0,0.5); white-space: nowrap; user-select: none;
  `
  if (isComplete || isHoliday) {
    el.style.backgroundColor = "#374151"; el.style.color = "#9ca3af"; el.style.borderColor = "#4b5563"
  } else {
    el.style.backgroundColor = techColor; el.style.color = "white"; el.style.borderColor = "white"
  }
  el.textContent = indices.join(" · ")
  return el
}

function createHomeBaseMarkerEl(): HTMLElement {
  const el = document.createElement("div")
  el.style.cssText = `width:32px;height:32px;border-radius:50%;display:flex;align-items:center;justify-content:center;cursor:default;border:2px solid #4ade80;box-shadow:0 2px 8px rgba(0,0,0,0.5);background-color:#166534;color:#4ade80;`
  el.innerHTML = `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M15 21v-8a1 1 0 0 0-1-1h-4a1 1 0 0 0-1 1v8"/><path d="M3 10a2 2 0 0 1 .709-1.528l7-5.999a2 2 0 0 1 2.582 0l7 5.999A2 2 0 0 1 21 10v9a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/></svg>`
  el.title = "Home Base"
  return el
}

// ─── Route line helpers ────────────────────────────────────────────────────────

function buildAllStopCoords(
  techId: string, stops: DispatchStop[], homeBase: { lat: number; lng: number } | null
): [number, number][] {
  const techStops = stops
    .filter((s) => s.techId === techId && s.lat != null && s.lng != null)
    .sort((a, b) => a.sortIndex - b.sortIndex)
  if (techStops.length === 0) return []
  const coords: [number, number][] = []
  if (homeBase) coords.push([homeBase.lng, homeBase.lat])
  for (const s of techStops) coords.push([s.lng!, s.lat!])
  if (homeBase) coords.push([homeBase.lng, homeBase.lat])
  return coords
}

function setRouteLine(
  map: import("maplibre-gl").Map, techId: string, coordinates: [number, number][], techColor: string
) {
  const layerId = `route-line-${techId}`
  const sourceId = `route-source-${techId}`
  if (coordinates.length < 2) {
    if (map.getLayer(layerId)) map.removeLayer(layerId)
    if (map.getSource(sourceId)) map.removeSource(sourceId)
    return
  }
  const geojson: GeoJSON.Feature<GeoJSON.LineString> = {
    type: "Feature", properties: {},
    geometry: { type: "LineString", coordinates },
  }
  if (map.getSource(sourceId)) {
    ;(map.getSource(sourceId) as import("maplibre-gl").GeoJSONSource).setData(geojson)
  } else {
    map.addSource(sourceId, { type: "geojson", data: geojson })
    map.addLayer({
      id: layerId, type: "line", source: sourceId,
      layout: { "line-join": "round", "line-cap": "round" },
      paint: { "line-color": techColor, "line-width": 3, "line-opacity": 0.8 },
    })
  }
}

// ─── DispatchMapInner ──────────────────────────────────────────────────────────

interface DispatchMapInnerProps {
  initialData: DispatchData
  orgId: string
  selectedTechId: string | null
  mapHeight?: number
  selectedStop?: DispatchStop | null
  onSelectStop?: (stop: DispatchStop | null) => void
}

function DispatchMapInner({ initialData, orgId, selectedTechId, mapHeight, selectedStop, onSelectStop }: DispatchMapInnerProps) {
  // Use the SAME MapClient + ref pattern as route-map.tsx
  const mapHandleRef = useRef<MapClientHandle>(null)
  const markersRef = useRef<Record<string, { marker: unknown; el: HTMLElement }>>({})
  const homeBaseMarkerRef = useRef<unknown>(null)
  const mapReadyRef = useRef(false)
  const fittedRef = useRef(false)
  const onSelectRef = useRef(onSelectStop)
  const [mapReadyState, setMapReadyState] = useState(false)

  useEffect(() => { onSelectRef.current = onSelectStop }, [onSelectStop])

  // ORS state
  const [orsGeometries, setOrsGeometries] = useState<Record<string, [number, number][]>>({})
  const [driveMinutes, setDriveMinutes] = useState<Record<string, number>>({})
  const [orsFailed, setOrsFailed] = useState(false)
  const orsRequestRef = useRef(0)

  const techPositions = useTechPositions(orgId)

  const techMap = useMemo(
    () => new Map<string, DispatchTech>(initialData.techs.map((t) => [t.id, t])),
    [initialData.techs]
  )
  const visibleStops = useMemo(
    () => selectedTechId ? initialData.stops.filter((s) => s.techId === selectedTechId) : initialData.stops,
    [selectedTechId, initialData.stops]
  )
  const visibleTechIds = useMemo(
    () => selectedTechId ? [selectedTechId] : initialData.techs.map((t) => t.id),
    [selectedTechId, initialData.techs]
  )
  const stopsRef = useRef(visibleStops)
  useEffect(() => { stopsRef.current = visibleStops }, [visibleStops])

  // ── Update markers + route lines (same pattern as route-map.tsx updateMap) ──
  const updateMap = useCallback(() => {
    const map = mapHandleRef.current?.getMap()
    if (!map || !mapReadyRef.current) return

    import("maplibre-gl").then((mgl) => {
      const currentStops = stopsRef.current
      const stopsWithCoords = currentStops.filter((s) => s.lat != null && s.lng != null)

      // ── Sync markers ────────────────────────────────────────────────────
      const indexMap = new Map(stopsWithCoords.map((s, idx) => [s.id, idx + 1]))
      const colocatedGroups = groupColocatedStops(stopsWithCoords, indexMap)
      const secondaryIds = new Set<string>()
      for (const group of colocatedGroups.values()) {
        for (const id of group.allIds) {
          if (id !== group.primaryId) secondaryIds.add(id)
        }
      }

      // Remove old markers
      const newStopIds = new Set(currentStops.map((s) => s.id))
      for (const id of Object.keys(markersRef.current)) {
        if (!newStopIds.has(id) || secondaryIds.has(id)) {
          ;(markersRef.current[id].marker as import("maplibre-gl").Marker).remove()
          delete markersRef.current[id]
        }
      }

      stopsWithCoords.forEach((stop) => {
        if (secondaryIds.has(stop.id)) {
          if (markersRef.current[stop.id]) {
            ;(markersRef.current[stop.id].marker as import("maplibre-gl").Marker).remove()
            delete markersRef.current[stop.id]
          }
          return
        }

        const tech = stop.techId ? techMap.get(stop.techId) : undefined
        const techColor = tech?.color ?? "#60a5fa"
        const displayIndex = indexMap.get(stop.id) ?? 1
        const group = colocatedGroups.get(stop.id)

        if (markersRef.current[stop.id]) {
          ;(markersRef.current[stop.id].marker as import("maplibre-gl").Marker).remove()
          delete markersRef.current[stop.id]
        }

        const el = group
          ? createCombinedMarkerEl(group.indices, stop.status, techColor)
          : createStopMarkerEl(displayIndex, stop.status, techColor, stop.status === "in_progress")

        el.addEventListener("click", (e) => {
          e.stopPropagation()
          onSelectRef.current?.(stop)
        })

        // No anchor option — same as route-map.tsx line 477
        const marker = new mgl.Marker({ element: el })
          .setLngLat([stop.lng!, stop.lat!])
          .addTo(map)
        markersRef.current[stop.id] = { marker, el }
      })

      // ── Home base marker ──────────────────────────────────────────────
      if (homeBaseMarkerRef.current) {
        ;(homeBaseMarkerRef.current as import("maplibre-gl").Marker).remove()
        homeBaseMarkerRef.current = null
      }
      if (initialData.homeBase) {
        const hbEl = createHomeBaseMarkerEl()
        const hbMarker = new mgl.Marker({ element: hbEl })
          .setLngLat([initialData.homeBase.lng, initialData.homeBase.lat])
          .addTo(map)
        homeBaseMarkerRef.current = hbMarker
      }

      // ── Fit bounds (only first time) ──────────────────────────────────
      if (!fittedRef.current) {
        fittedRef.current = true
        const allLngs = stopsWithCoords.map((s) => s.lng!)
        const allLats = stopsWithCoords.map((s) => s.lat!)
        if (initialData.homeBase) {
          allLngs.push(initialData.homeBase.lng)
          allLats.push(initialData.homeBase.lat)
        }
        if (allLngs.length > 1) {
          map.fitBounds(
            [[Math.min(...allLngs), Math.min(...allLats)], [Math.max(...allLngs), Math.max(...allLats)]],
            { padding: 60, maxZoom: 14, duration: 0 }
          )
        }
      }
    })
  }, [techMap, initialData.homeBase])

  // ── Map ready handler (identical to route-map.tsx handleMapReady) ──────────
  const handleMapReady = useCallback(() => {
    mapReadyRef.current = true
    updateMap()
    setMapReadyState(true)
  }, [updateMap])

  // Re-sync markers when stops change
  useEffect(() => { updateMap() }, [visibleStops, updateMap])

  // ── Fly to selected stop ──────────────────────────────────────────────────
  useEffect(() => {
    const map = mapHandleRef.current?.getMap()
    if (!map || !mapReadyRef.current) return

    // Reset marker sizes
    for (const { el } of Object.values(markersRef.current)) {
      el.style.width = "28px"; el.style.height = "28px"
      el.style.fontSize = "11px"; el.style.zIndex = ""
    }

    if (selectedStop?.lat != null && selectedStop?.lng != null) {
      map.flyTo({ center: [selectedStop.lng, selectedStop.lat], zoom: Math.max(map.getZoom(), 13), duration: 600 })
      const entry = markersRef.current[selectedStop.id]
      if (entry) {
        entry.el.style.width = "36px"; entry.el.style.height = "36px"
        entry.el.style.fontSize = "13px"; entry.el.style.zIndex = "10"
      }
    }
  }, [selectedStop])

  // ── ORS directions per tech ───────────────────────────────────────────────
  useEffect(() => {
    const requestId = ++orsRequestRef.current
    setOrsFailed(false)
    async function fetchOrs() {
      const geoResults: Record<string, [number, number][]> = {}
      const timeResults: Record<string, number> = {}
      let anySuccess = false
      await Promise.all(
        visibleTechIds.map(async (techId) => {
          const coords = buildAllStopCoords(techId, visibleStops, initialData.homeBase)
          if (coords.length < 2) return
          const result = await getRouteDirections(coords)
          if (orsRequestRef.current !== requestId) return
          if (result.success && result.geometry.length > 0) {
            geoResults[techId] = result.geometry
            timeResults[techId] = result.durationMinutes
            anySuccess = true
          }
        })
      )
      if (orsRequestRef.current === requestId) {
        setOrsGeometries(geoResults)
        setDriveMinutes(timeResults)
        if (!anySuccess) setOrsFailed(true)
      }
    }
    const timer = setTimeout(fetchOrs, 500)
    return () => clearTimeout(timer)
  }, [visibleTechIds, visibleStops, techPositions, initialData.homeBase])

  // ── Route lines ───────────────────────────────────────────────────────────
  useEffect(() => {
    const map = mapHandleRef.current?.getMap()
    if (!map || !mapReadyRef.current) return
    for (const techId of visibleTechIds) {
      const tech = techMap.get(techId)
      if (!tech) continue
      const orsGeo = orsGeometries[techId]
      if (orsGeo && orsGeo.length > 0) {
        setRouteLine(map, techId, orsGeo, tech.color)
      } else if (orsFailed) {
        setRouteLine(map, techId, buildAllStopCoords(techId, visibleStops, initialData.homeBase), tech.color)
      } else {
        setRouteLine(map, techId, [], tech.color)
      }
    }
    if (selectedTechId) {
      for (const tech of initialData.techs) {
        if (tech.id !== selectedTechId) {
          const layerId = `route-line-${tech.id}`
          const sourceId = `route-source-${tech.id}`
          if (map.getLayer(layerId)) map.removeLayer(layerId)
          if (map.getSource(sourceId)) map.removeSource(sourceId)
        }
      }
    }
  }, [techPositions, visibleStops, visibleTechIds, selectedTechId, initialData.techs, initialData.homeBase, techMap, orsGeometries, orsFailed])

  // ── Close on map background click ─────────────────────────────────────────
  useEffect(() => {
    const map = mapHandleRef.current?.getMap()
    if (!map || !mapReadyRef.current) return
    const handler = () => onSelectRef.current?.(null)
    map.on("click", handler)
    return () => { map.off("click", handler) }
  }, [mapReadyState])

  // Cleanup
  useEffect(() => {
    return () => {
      for (const { marker } of Object.values(markersRef.current)) {
        ;(marker as import("maplibre-gl").Marker).remove()
      }
      if (homeBaseMarkerRef.current) {
        ;(homeBaseMarkerRef.current as import("maplibre-gl").Marker).remove()
      }
      markersRef.current = {}
      mapReadyRef.current = false
    }
  }, [])

  return (
    <div style={{ width: "100%", height: mapHeight ?? "100%", position: "relative" }}>
      <MapClient
        ref={mapHandleRef}
        onMapReady={handleMapReady}
        className="h-full w-full"
      />

      {/* Drive time overlay */}
      {Object.keys(driveMinutes).length > 0 && (
        <div className="absolute top-3 left-3 z-10 flex flex-col gap-1.5 pointer-events-none">
          {visibleTechIds.map((techId) => {
            const mins = driveMinutes[techId]
            if (mins == null) return null
            const tech = techMap.get(techId)
            return (
              <div key={techId} className="flex items-center gap-1.5 rounded-md bg-background/85 backdrop-blur-sm border border-border/60 px-2.5 py-1.5 shadow-lg">
                {!selectedTechId && tech && (
                  <div className="h-2.5 w-2.5 rounded-full shrink-0" style={{ backgroundColor: tech.color }} />
                )}
                <svg className="h-3.5 w-3.5 text-muted-foreground shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M19 17h2c.6 0 1-.4 1-1v-3c0-.9-.7-1.7-1.5-1.9C18.7 10.6 16 10 16 10s-1.3-1.4-2.2-2.3c-.5-.4-1.1-.7-1.8-.7H5c-.6 0-1.1.4-1.4.9l-1.4 2.9A3.7 3.7 0 0 0 2 12v4c0 .6.4 1 1 1h2"/><circle cx="7" cy="17" r="2"/><path d="M9 17h6"/><circle cx="17" cy="17" r="2"/></svg>
                <span className="text-xs font-semibold text-foreground">{mins} min</span>
                <span className="text-[10px] text-muted-foreground">total drive</span>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}

// ─── Public export ────────────────────────────────────────────────────────────

interface DispatchMapProps {
  initialData: DispatchData
  orgId: string
  selectedTechId: string | null
  mapHeight?: number
  selectedStop?: DispatchStop | null
  onSelectStop?: (stop: DispatchStop | null) => void
}

export function DispatchMap(props: DispatchMapProps) {
  return <DispatchMapInner {...props} />
}
