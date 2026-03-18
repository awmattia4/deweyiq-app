"use client"

import "maplibre-gl/dist/maplibre-gl.css"

import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import { MapPinIcon } from "lucide-react"
import type { DispatchData, DispatchStop, DispatchTech } from "@/actions/dispatch"
import type { TechPosition } from "@/hooks/use-tech-positions"
import { useTechPositions } from "@/hooks/use-tech-positions"
import { getRouteDirections } from "@/actions/optimize"
import { TechPositionMarker } from "./tech-position-marker"

// MapLibre types — resolved lazily
type MaplibreGl = typeof import("maplibre-gl")
type MaplibreMap = import("maplibre-gl").Map

// ─── Co-located stop grouping (matches route-map.tsx) ─────────────────────────

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

// ─── Imperative marker creation (matches route-map.tsx, color-coded by tech) ──

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
    width: 28px;
    height: 28px;
    border-radius: 50%;
    display: flex;
    align-items: center;
    justify-content: center;
    font-size: 11px;
    font-weight: 700;
    font-family: system-ui, sans-serif;
    cursor: pointer;
    border: 2px solid transparent;
    box-shadow: 0 2px 6px rgba(0,0,0,0.5);
    position: relative;
    user-select: none;
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
  if (status === "skipped") {
    label.textContent = "✕"
  } else if (isHoliday) {
    label.textContent = "✦"
  } else {
    label.textContent = String(index)
  }
  el.appendChild(label)

  // Pulse ring for in-progress stops
  if (isInProgress) {
    const pulse = document.createElement("div")
    pulse.style.cssText = `
      position: absolute;
      top: -5px; left: -5px;
      width: 38px; height: 38px;
      border-radius: 50%;
      border: 2px solid ${techColor};
      opacity: 0;
      animation: tech-marker-pulse 1.5s ease-out infinite;
      pointer-events: none;
    `
    el.appendChild(pulse)
  }

  return el
}

function createCombinedMarkerEl(
  indices: number[],
  status: string,
  techColor: string
): HTMLElement {
  const isComplete = status === "complete" || status === "skipped"
  const isHoliday = status === "holiday"

  const el = document.createElement("div")
  el.style.cssText = `
    height: 28px;
    padding: 0 10px;
    border-radius: 14px;
    display: flex;
    align-items: center;
    justify-content: center;
    font-size: 11px;
    font-weight: 700;
    font-family: system-ui, sans-serif;
    cursor: pointer;
    border: 2px solid transparent;
    box-shadow: 0 2px 6px rgba(0,0,0,0.5);
    white-space: nowrap;
    user-select: none;
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

  el.textContent = indices.join(" · ")
  return el
}

function createHomeBaseMarkerEl(): HTMLElement {
  const el = document.createElement("div")
  el.style.cssText = `
    width: 32px; height: 32px; border-radius: 50%;
    display: flex; align-items: center; justify-content: center;
    font-size: 16px; cursor: default;
    border: 2px solid #4ade80;
    box-shadow: 0 2px 8px rgba(0,0,0,0.5);
    background-color: #166534; color: #4ade80;
  `
  el.innerHTML = `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M15 21v-8a1 1 0 0 0-1-1h-4a1 1 0 0 0-1 1v8"/><path d="M3 10a2 2 0 0 1 .709-1.528l7-5.999a2 2 0 0 1 2.582 0l7 5.999A2 2 0 0 1 21 10v9a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/></svg>`
  el.title = "Home Base"
  return el
}

// ─── Route line helpers ────────────────────────────────────────────────────────

/**
 * Build route coords for ALL stops of a tech (home → all stops → home).
 * Matches the schedule map behavior — shows the full route including completed stops.
 */
function buildAllStopCoords(
  techId: string,
  stops: DispatchStop[],
  homeBase: { lat: number; lng: number } | null
): [number, number][] {
  const techStops = stops
    .filter((s) => s.techId === techId && s.lat !== null && s.lng !== null)
    .sort((a, b) => a.sortIndex - b.sortIndex)

  if (techStops.length === 0) return []

  const coordinates: [number, number][] = []
  if (homeBase) coordinates.push([homeBase.lng, homeBase.lat])
  for (const stop of techStops) {
    coordinates.push([stop.lng!, stop.lat!])
  }
  if (homeBase) coordinates.push([homeBase.lng, homeBase.lat])
  return coordinates
}

function setRouteLine(
  map: MaplibreMap,
  techId: string,
  coordinates: [number, number][],
  techColor: string
) {
  const layerId = `route-line-${techId}`
  const sourceId = `route-source-${techId}`

  if (coordinates.length < 2) {
    if (map.getLayer(layerId)) map.removeLayer(layerId)
    if (map.getSource(sourceId)) map.removeSource(sourceId)
    return
  }

  const geojson: GeoJSON.Feature<GeoJSON.LineString> = {
    type: "Feature",
    properties: {},
    geometry: { type: "LineString", coordinates },
  }

  if (map.getSource(sourceId)) {
    ;(map.getSource(sourceId) as import("maplibre-gl").GeoJSONSource).setData(geojson)
  } else {
    map.addSource(sourceId, { type: "geojson", data: geojson })
    map.addLayer({
      id: layerId,
      type: "line",
      source: sourceId,
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
  const mapContainerRef = useRef<HTMLDivElement>(null)
  const mapRef = useRef<MaplibreMap | null>(null)
  const maplibreRef = useRef<MaplibreGl | null>(null)
  const homeBaseMarkerRef = useRef<unknown>(null)
  const markersRef = useRef<Record<string, { marker: unknown; el: HTMLElement }>>({})
  const resizeObserverRef = useRef<ResizeObserver | null>(null)
  const [mapReady, setMapReady] = useState(false)
  const onSelectRef = useRef(onSelectStop)

  // Keep callback ref current
  useEffect(() => { onSelectRef.current = onSelectStop }, [onSelectStop])

  // ORS geometry + drive time per tech
  const [orsGeometries, setOrsGeometries] = useState<Record<string, [number, number][]>>({})
  const [driveMinutes, setDriveMinutes] = useState<Record<string, number>>({})
  const [orsFailed, setOrsFailed] = useState(false)
  const orsRequestRef = useRef(0)

  // Live tech positions via Supabase Broadcast
  const techPositions = useTechPositions(orgId)

  // Stable references via useMemo
  const techMap = useMemo(
    () => new Map<string, DispatchTech>(initialData.techs.map((t) => [t.id, t])),
    [initialData.techs]
  )

  const visibleStops = useMemo(
    () =>
      selectedTechId
        ? initialData.stops.filter((s) => s.techId === selectedTechId)
        : initialData.stops,
    [selectedTechId, initialData.stops]
  )

  const visibleTechIds = useMemo(
    () =>
      selectedTechId
        ? [selectedTechId]
        : initialData.techs.map((t) => t.id),
    [selectedTechId, initialData.techs]
  )

  // Stable ref for visibleStops to avoid stale closures in updateMarkers
  const visibleStopsRef = useRef(visibleStops)
  useEffect(() => { visibleStopsRef.current = visibleStops }, [visibleStops])

  // ── Map initialization ────────────────────────────────────────────────────
  useEffect(() => {
    const maptilerKey = process.env.NEXT_PUBLIC_MAPTILER_KEY
    if (!maptilerKey || !mapContainerRef.current) return

    let cancelled = false

    async function initMap() {
      const mgl = await import("maplibre-gl")
      if (cancelled || !mapContainerRef.current) return

      maplibreRef.current = mgl

      if (!document.getElementById("dispatch-map-styles")) {
        const style = document.createElement("style")
        style.id = "dispatch-map-styles"
        style.textContent = `
          @keyframes tech-marker-pulse {
            0% { opacity: 0.8; transform: scale(1); }
            100% { opacity: 0; transform: scale(2); }
          }
        `
        document.head.appendChild(style)
      }

      const stopsWithCoords = initialData.stops.filter((s) => s.lat !== null && s.lng !== null)
      const allLngs: number[] = stopsWithCoords.map((s) => s.lng!)
      const allLats: number[] = stopsWithCoords.map((s) => s.lat!)
      if (initialData.homeBase) {
        allLngs.push(initialData.homeBase.lng)
        allLats.push(initialData.homeBase.lat)
      }

      let center: [number, number] = [-96, 39]
      let zoom = 5
      if (allLngs.length > 0) {
        center = [
          allLngs.reduce((a, b) => a + b, 0) / allLngs.length,
          allLats.reduce((a, b) => a + b, 0) / allLats.length,
        ]
        zoom = 11
      }

      const map = new mgl.Map({
        container: mapContainerRef.current,
        style: `https://api.maptiler.com/maps/streets-v2-dark/style.json?key=${maptilerKey}`,
        center,
        zoom,
        attributionControl: false,
      })

      map.addControl(new mgl.AttributionControl({ compact: true }), "bottom-right")

      map.on("load", () => {
        if (cancelled) return
        mapRef.current = map
        map.resize()

        if (allLngs.length > 1) {
          map.fitBounds(
            [[Math.min(...allLngs), Math.min(...allLats)], [Math.max(...allLngs), Math.max(...allLats)]],
            { padding: 60, maxZoom: 14, duration: 0 }
          )
        }

        if (initialData.homeBase) {
          const hbEl = createHomeBaseMarkerEl()
          const hbMarker = new mgl.Marker({ element: hbEl })
            .setLngLat([initialData.homeBase.lng, initialData.homeBase.lat])
            .addTo(map)
          homeBaseMarkerRef.current = hbMarker
        }

        // Wait for resize + fitBounds to fully settle before allowing
        // marker creation — without this, markers are positioned relative
        // to the pre-resize viewport and appear in the wrong place.
        requestAnimationFrame(() => {
          requestAnimationFrame(() => {
            if (!cancelled) setMapReady(true)
          })
        })
      })

      const ro = new ResizeObserver(() => { if (mapRef.current) mapRef.current.resize() })
      ro.observe(mapContainerRef.current)
      resizeObserverRef.current = ro
    }

    void initMap()

    return () => {
      cancelled = true
      resizeObserverRef.current?.disconnect()
      if (homeBaseMarkerRef.current) {
        ;(homeBaseMarkerRef.current as import("maplibre-gl").Marker).remove()
        homeBaseMarkerRef.current = null
      }
      for (const { marker } of Object.values(markersRef.current)) {
        ;(marker as import("maplibre-gl").Marker).remove()
      }
      markersRef.current = {}
      if (mapRef.current) { mapRef.current.remove(); mapRef.current = null }
      maplibreRef.current = null
      setMapReady(false)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // ── Imperative marker sync (matches route-map pattern) ─────────────────────
  const updateMarkers = useCallback(() => {
    const map = mapRef.current
    const mgl = maplibreRef.current
    if (!map || !mgl) return

    const currentStops = visibleStopsRef.current
    const stopsWithCoords = currentStops.filter((s) => s.lat != null && s.lng != null)

    // Build index map and co-located groups
    const indexMap = new Map(stopsWithCoords.map((s, idx) => [s.id, idx + 1]))
    const colocatedGroups = groupColocatedStops(stopsWithCoords, indexMap)

    const secondaryIds = new Set<string>()
    for (const group of colocatedGroups.values()) {
      for (const id of group.allIds) {
        if (id !== group.primaryId) secondaryIds.add(id)
      }
    }

    // Remove markers for stops no longer visible
    const newStopIds = new Set(currentStops.map((s) => s.id))
    for (const id of Object.keys(markersRef.current)) {
      if (!newStopIds.has(id) || secondaryIds.has(id)) {
        ;(markersRef.current[id].marker as import("maplibre-gl").Marker).remove()
        delete markersRef.current[id]
      }
    }

    stopsWithCoords.forEach((stop) => {
      if (secondaryIds.has(stop.id)) return

      const tech = stop.techId ? techMap.get(stop.techId) : undefined
      const techColor = tech?.color ?? "#60a5fa"
      const displayIndex = indexMap.get(stop.id) ?? 1
      const group = colocatedGroups.get(stop.id)

      // Remove existing marker before re-adding (handles sortNumber/status changes)
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

      const marker = new mgl.Marker({ element: el, anchor: "center" })
        .setLngLat([stop.lng!, stop.lat!])
        .addTo(map)
      markersRef.current[stop.id] = { marker, el }
    })
  }, [techMap])

  // Run marker sync when stops/map change
  useEffect(() => {
    if (!mapReady) return
    updateMarkers()
  }, [mapReady, visibleStops, updateMarkers])

  // ── Fly to selected stop + highlight marker ────────────────────────────────
  useEffect(() => {
    const map = mapRef.current
    if (!map || !mapReady) return

    // Reset all marker scales
    for (const { el } of Object.values(markersRef.current)) {
      el.style.transform = "scale(1)"
      el.style.zIndex = "0"
    }

    if (selectedStop?.lat != null && selectedStop?.lng != null) {
      map.flyTo({ center: [selectedStop.lng, selectedStop.lat], zoom: Math.max(map.getZoom(), 13), duration: 600 })

      // Highlight the selected marker
      const entry = markersRef.current[selectedStop.id]
      if (entry) {
        entry.el.style.transform = "scale(1.35)"
        entry.el.style.zIndex = "10"
      }
    }
  }, [selectedStop, mapReady])

  // ── Fetch ORS directions per tech ──────────────────────────────────────────
  useEffect(() => {
    const requestId = ++orsRequestRef.current
    setOrsFailed(false)

    async function fetchOrsForTechs() {
      const geoResults: Record<string, [number, number][]> = {}
      const timeResults: Record<string, number> = {}
      let anySuccess = false

      await Promise.all(
        visibleTechIds.map(async (techId) => {
          // Use ALL stops for the route (matching schedule map behavior)
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

    const timer = setTimeout(fetchOrsForTechs, 500)
    return () => clearTimeout(timer)
  }, [visibleTechIds, visibleStops, techPositions, initialData.homeBase])

  // ── Route lines ────────────────────────────────────────────────────────────
  useEffect(() => {
    const map = mapRef.current
    if (!map || !mapReady) return

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
  }, [mapReady, techPositions, visibleStops, visibleTechIds, selectedTechId, initialData.techs, initialData.homeBase, techMap, orsGeometries, orsFailed])

  // ── Close popup on map click ──────────────────────────────────────────────
  useEffect(() => {
    const map = mapRef.current
    if (!map || !mapReady) return
    const handler = () => onSelectRef.current?.(null)
    map.on("click", handler)
    return () => { map.off("click", handler) }
  }, [mapReady])

  const maptilerKey = process.env.NEXT_PUBLIC_MAPTILER_KEY

  if (!maptilerKey) {
    return (
      <div className="flex flex-col items-center justify-center gap-3 h-full text-center px-4">
        <MapPinIcon className="h-10 w-10 text-muted-foreground/40" />
        <div>
          <p className="text-sm font-medium">Map unavailable</p>
          <p className="text-xs text-muted-foreground mt-1">
            Set <code className="rounded bg-muted px-1 py-0.5 font-mono text-xs">NEXT_PUBLIC_MAPTILER_KEY</code> to enable.
          </p>
        </div>
      </div>
    )
  }

  return (
    <div style={{ width: "100%", height: mapHeight ?? "100%", position: "relative" }}>
      <div ref={mapContainerRef} style={{ width: "100%", height: "100%" }} />

      {/* Tech position markers (live GPS) — still React-managed since they update frequently */}
      {mapReady && mapRef.current && maplibreRef.current && visibleTechIds.map((techId) => {
        const position = techPositions[techId]
        const tech = techMap.get(techId)
        if (!position || !tech) return null
        return (
          <TechPositionMarker
            key={techId}
            map={mapRef.current!}
            position={position}
            techName={tech.name}
            color={tech.color}
            maplibregl={maplibreRef.current!}
          />
        )
      })}

      {/* Drive time overlay — per tech */}
      {Object.keys(driveMinutes).length > 0 && (
        <div className="absolute top-3 left-3 z-10 flex flex-col gap-1.5 pointer-events-none">
          {visibleTechIds.map((techId) => {
            const mins = driveMinutes[techId]
            if (mins == null) return null
            const tech = techMap.get(techId)
            return (
              <div
                key={techId}
                className="flex items-center gap-1.5 rounded-md bg-background/85 backdrop-blur-sm border border-border/60 px-2.5 py-1.5 shadow-lg"
              >
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

// ─── DispatchMap (public export) ───────────────────────────────────────────────

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
