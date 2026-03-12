"use client"

import { useEffect, useRef, useCallback, useMemo, useState } from "react"
import dynamic from "next/dynamic"
import { CarIcon, Loader2Icon } from "lucide-react"
import type { MapClientHandle } from "@/components/map/map-client"
import { getRouteDirections } from "@/actions/optimize"

// SSR-safe dynamic import — MapLibre accesses window on import
const MapClient = dynamic(
  () => import("@/components/map/map-client").then((m) => m.MapClient),
  { ssr: false }
)

// ─── Types ─────────────────────────────────────────────────────────────────────

export interface ScheduleStop {
  id: string
  customerName: string
  address: string | null
  poolName: string
  sortIndex: number
  positionLocked: boolean
  status: string
  lat: number | null
  lng: number | null
  workOrderId?: string | null
  workOrderTitle?: string | null
  overdueBalance?: number | null
}

export interface HomeBase {
  lat: number
  lng: number
  address?: string
}

interface RouteMapProps {
  stops: ScheduleStop[]
  selectedStopId?: string
  onSelectStop?: (stopId: string) => void
  homeBase?: HomeBase | null
  className?: string
}

// ─── Co-located stop grouping ────────────────────────────────────────────────────

interface ColocatedGroup {
  /** The stop ID that gets the visible marker (first in the group) */
  primaryId: string
  /** Display indices of all stops at this location, e.g. [4, 5] */
  indices: number[]
  /** All stop IDs in the group (primary + extras to skip) */
  allIds: Set<string>
}

/**
 * Group co-located stops (same lat/lng) so they render as one combined marker
 * showing all indices (e.g. "4 · 5"). Returns a map from primary stop id → group.
 */
function groupColocatedStops(
  stops: Array<{ id: string; lat: number | null; lng: number | null }>,
  /** Map from stop id → display index (1-based) */
  indexMap: Map<string, number>
): Map<string, ColocatedGroup> {
  // Group by coordinate key
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
    result.set(primaryId, {
      primaryId,
      indices,
      allIds: new Set(ids),
    })
  }
  return result
}

/**
 * Create a pill-shaped combined marker showing multiple stop indices
 * (e.g. "4 · 5" for pool + spa at the same address).
 */
function createCombinedMarkerEl(
  indices: number[],
  status: string,
  locked: boolean,
  selected: boolean
): HTMLElement {
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
    transform: ${selected ? "scale(1.25)" : "scale(1)"};
  `

  const isComplete = status === "complete" || status === "skipped"
  const isHoliday = status === "holiday"

  if (isComplete || isHoliday) {
    el.style.backgroundColor = "oklch(0.45 0 0)"
    el.style.color = "oklch(0.7 0 0)"
  } else if (locked) {
    el.style.backgroundColor = "oklch(0.75 0.18 85)"
    el.style.color = "oklch(0.2 0 0)"
    el.style.borderColor = "oklch(0.85 0.15 85)"
  } else if (selected) {
    el.style.backgroundColor = "oklch(0.65 0.2 250)"
    el.style.color = "oklch(1 0 0)"
    el.style.borderColor = "oklch(0.85 0.15 250)"
  } else {
    el.style.backgroundColor = "oklch(0.35 0.12 250)"
    el.style.color = "oklch(0.9 0 0)"
    el.style.borderColor = "oklch(0.5 0.15 250)"
  }

  el.textContent = indices.join(" · ")
  return el
}

// ─── Marker helpers ────────────────────────────────────────────────────────────

/** Wrench SVG for WO markers (inline to avoid DOM dependency on lucide) */
const WRENCH_SVG = `<svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M14.7 6.3a1 1 0 0 0 0 1.4l1.6 1.6a1 1 0 0 0 1.4 0l3.77-3.77a6 6 0 0 1-7.94 7.94l-6.91 6.91a2.12 2.12 0 0 1-3-3l6.91-6.91a6 6 0 0 1 7.94-7.94l-3.76 3.76z"/></svg>`

function createMarkerEl(
  index: number,
  status: string,
  locked: boolean,
  selected: boolean,
  isWorkOrder = false,
): HTMLElement {
  const isComplete = status === "complete" || status === "skipped"
  const isHoliday = status === "holiday"

  // WO stops use a pill badge with wrench icon + "WO" — matches the list badge
  if (isWorkOrder && !isComplete && !isHoliday) {
    const el = document.createElement("div")
    el.style.cssText = `
      height: 20px;
      padding: 0 6px;
      border-radius: 9999px;
      display: inline-flex;
      align-items: center;
      gap: 2px;
      font-size: 9px;
      font-weight: 500;
      font-family: system-ui, sans-serif;
      cursor: pointer;
      white-space: nowrap;
      box-shadow: 0 2px 6px rgba(0,0,0,0.4);
      background-color: rgba(245, 158, 11, 0.35);
      color: #fcd34d;
      border: 1px solid rgba(245, 158, 11, 0.55);
      line-height: 1.625;
      backdrop-filter: blur(4px);
      transform: ${selected ? "scale(1.25)" : "scale(1)"};
    `
    el.innerHTML = `${WRENCH_SVG}<span>WO</span>`
    return el
  }

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
    transform: ${selected ? "scale(1.25)" : "scale(1)"};
  `

  if (isComplete || isHoliday) {
    el.style.backgroundColor = "oklch(0.45 0 0)"
    el.style.color = "oklch(0.7 0 0)"
  } else if (locked) {
    el.style.backgroundColor = "oklch(0.75 0.18 85)"
    el.style.color = "oklch(0.2 0 0)"
    el.style.borderColor = "oklch(0.85 0.15 85)"
  } else if (selected) {
    el.style.backgroundColor = "oklch(0.65 0.2 250)"
    el.style.color = "oklch(1 0 0)"
    el.style.borderColor = "oklch(0.85 0.15 250)"
  } else {
    el.style.backgroundColor = "oklch(0.35 0.12 250)"
    el.style.color = "oklch(0.9 0 0)"
    el.style.borderColor = "oklch(0.5 0.15 250)"
  }

  el.textContent = String(index)
  return el
}

/** Home base marker — house icon with distinct green styling */
function createHomeBaseMarkerEl(): HTMLElement {
  const el = document.createElement("div")
  el.style.cssText = `
    width: 32px;
    height: 32px;
    border-radius: 50%;
    display: flex;
    align-items: center;
    justify-content: center;
    font-size: 16px;
    cursor: default;
    border: 2px solid #4ade80;
    box-shadow: 0 2px 8px rgba(0,0,0,0.5);
    background-color: #166534;
    color: #4ade80;
  `
  // House/home SVG icon
  el.innerHTML = `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M15 21v-8a1 1 0 0 0-1-1h-4a1 1 0 0 0-1 1v8"/><path d="M3 10a2 2 0 0 1 .709-1.528l7-5.999a2 2 0 0 1 2.582 0l7 5.999A2 2 0 0 1 21 10v9a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/></svg>`
  el.title = "Home Base"
  return el
}

// ─── Haversine fallback ──────────────────────────────────────────────────────

function haversineDistance(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const R = 6371
  const dLat = ((lat2 - lat1) * Math.PI) / 180
  const dLng = ((lng2 - lng1) * Math.PI) / 180
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos((lat1 * Math.PI) / 180) *
      Math.cos((lat2 * Math.PI) / 180) *
      Math.sin(dLng / 2) ** 2
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a))
}

function estimateDriveMinutes(
  stops: Array<{ lat: number | null; lng: number | null }>,
  homeBase?: HomeBase | null
): number {
  const geo = stops.filter((s): s is { lat: number; lng: number } => s.lat != null && s.lng != null)
  if (geo.length === 0) return 0

  // Build full waypoint list: home → stops → home
  const waypoints: { lat: number; lng: number }[] = []
  if (homeBase) waypoints.push(homeBase)
  waypoints.push(...geo)
  if (homeBase) waypoints.push(homeBase)

  let km = 0
  for (let i = 0; i < waypoints.length - 1; i++) {
    km += haversineDistance(waypoints[i].lat, waypoints[i].lng, waypoints[i + 1].lat, waypoints[i + 1].lng)
  }
  return Math.round((km / 48) * 60)
}

// ─── Route source/layer constants ─────────────────────────────────────────────

const ROUTE_SOURCE_ID = "route-line-source"
const ROUTE_LAYER_ID = "route-line-layer"

// ─── RouteMap ──────────────────────────────────────────────────────────────────

export function RouteMap({ stops, selectedStopId, onSelectStop, homeBase, className }: RouteMapProps) {
  // Haversine estimate shown instantly; ORS replaces it when ready
  const haversineMinutes = useMemo(() => estimateDriveMinutes(stops, homeBase), [stops, homeBase])
  const geocodedCount = useMemo(() => stops.filter((s) => s.lat != null && s.lng != null).length, [stops])

  const [orsDriveMinutes, setOrsDriveMinutes] = useState<number | null>(null)
  const [orsGeometry, setOrsGeometry] = useState<[number, number][] | null>(null)
  const [isFetchingRoute, setIsFetchingRoute] = useState(false)
  const [orsFailed, setOrsFailed] = useState(false)

  const mapHandleRef = useRef<MapClientHandle>(null)
  const markersRef = useRef<{ [id: string]: { marker: unknown; el: HTMLElement } }>({})
  const homeBaseMarkerRef = useRef<unknown>(null)
  const stopsRef = useRef(stops)
  const onSelectRef = useRef(onSelectStop)
  const mapReadyRef = useRef(false)
  const fittedStopIdsRef = useRef<string>("")
  const orsRequestRef = useRef(0) // for debounce/cancellation

  // Keep refs current
  useEffect(() => { stopsRef.current = stops }, [stops])
  useEffect(() => { onSelectRef.current = onSelectStop }, [onSelectStop])

  // ── Fetch ORS directions when stops change (debounced 500ms) ──────────────
  useEffect(() => {
    const geocoded = stops.filter((s) => s.lat != null && s.lng != null)

    // Need at least 1 geocoded stop + home base, or 2 geocoded stops
    const hasHomeBase = homeBase != null
    const minStops = hasHomeBase ? 1 : 2
    if (geocoded.length < minStops) {
      setOrsDriveMinutes(null)
      setOrsGeometry(null)
      return
    }

    const requestId = ++orsRequestRef.current
    setIsFetchingRoute(true)
    setOrsFailed(false)

    const timer = setTimeout(async () => {
      // Build waypoints: home → stops → home
      const stopCoords: [number, number][] = geocoded.map((s) => [s.lng!, s.lat!])
      const coords: [number, number][] = []
      if (hasHomeBase) coords.push([homeBase.lng, homeBase.lat])
      coords.push(...stopCoords)
      if (hasHomeBase) coords.push([homeBase.lng, homeBase.lat])

      const result = await getRouteDirections(coords)

      // Only apply if this is still the latest request
      if (orsRequestRef.current !== requestId) return

      if (result.success) {
        setOrsDriveMinutes(result.durationMinutes)
        setOrsGeometry(result.geometry)
      } else {
        // ORS failed — show straight-line fallback
        setOrsDriveMinutes(null)
        setOrsGeometry(null)
        setOrsFailed(true)
      }
      setIsFetchingRoute(false)
    }, 500)

    return () => clearTimeout(timer)
  }, [stops, homeBase])

  // Display value: ORS when available, Haversine as fallback
  const driveMinutes = orsDriveMinutes ?? haversineMinutes
  const isEstimate = orsDriveMinutes === null

  // ── Update markers + route line on map ────────────────────────────────────
  const updateMap = useCallback(() => {
    const map = mapHandleRef.current?.getMap()
    if (!map || !mapReadyRef.current) return

    const currentStops = stopsRef.current

    import("maplibre-gl").then((mgl) => {
      const stopsWithCoords = currentStops.filter(
        (s) => s.lat != null && s.lng != null
      )

      // ── Update route line ──────────────────────────────────────────────────
      // Show ORS road-following geometry when available.
      // Only fall back to straight lines if ORS failed (not while loading),
      // so we don't flash a straight-line before ORS resolves.
      const orsGeo = orsGeometry
      let lineCoords: [number, number][] | null = null
      if (orsGeo && orsGeo.length > 0) {
        lineCoords = orsGeo
      } else if (orsFailed && stopsWithCoords.length > 0) {
        // Straight-line fallback: home → stops → home
        const stopCoords: [number, number][] = stopsWithCoords.map((s) => [s.lng!, s.lat!])
        lineCoords = []
        if (homeBase) lineCoords.push([homeBase.lng, homeBase.lat])
        lineCoords.push(...stopCoords)
        if (homeBase) lineCoords.push([homeBase.lng, homeBase.lat])
      }

      if (lineCoords && lineCoords.length >= 2) {
        const lineGeoJSON = {
          type: "Feature" as const,
          geometry: {
            type: "LineString" as const,
            coordinates: lineCoords,
          },
          properties: {},
        }

        if (map.getSource(ROUTE_SOURCE_ID)) {
          ;(
            map.getSource(ROUTE_SOURCE_ID) as import("maplibre-gl").GeoJSONSource
          ).setData(lineGeoJSON)
        } else {
          map.addSource(ROUTE_SOURCE_ID, {
            type: "geojson",
            data: lineGeoJSON,
          })
          map.addLayer({
            id: ROUTE_LAYER_ID,
            type: "line",
            source: ROUTE_SOURCE_ID,
            layout: {
              "line-join": "round",
              "line-cap": "round",
            },
            paint: {
              "line-color": "#60a5fa",
              "line-width": 4,
              "line-opacity": 0.85,
            },
          })
        }
      } else {
        // Still loading or no coords — clear any existing line
        if (map.getLayer(ROUTE_LAYER_ID)) map.removeLayer(ROUTE_LAYER_ID)
        if (map.getSource(ROUTE_SOURCE_ID)) map.removeSource(ROUTE_SOURCE_ID)
      }

      // ── Sync markers ─────────────────────────────────────────────────────────
      const newStopIds = new Set(currentStops.map((s) => s.id))

      for (const id of Object.keys(markersRef.current)) {
        if (!newStopIds.has(id)) {
          ;(markersRef.current[id].marker as import("maplibre-gl").Marker).remove()
          delete markersRef.current[id]
        }
      }

      // Build index map and group co-located stops for combined markers
      const indexMap = new Map(stopsWithCoords.map((s, idx) => [s.id, idx + 1]))
      const colocatedGroups = groupColocatedStops(stopsWithCoords, indexMap)

      // Track which stop IDs are secondary in a group (skip individual markers)
      const secondaryIds = new Set<string>()
      for (const group of colocatedGroups.values()) {
        for (const id of group.allIds) {
          if (id !== group.primaryId) secondaryIds.add(id)
        }
      }

      stopsWithCoords.forEach((stop, idx) => {
        // Skip secondary stops — they're represented by the combined marker
        if (secondaryIds.has(stop.id)) {
          if (markersRef.current[stop.id]) {
            ;(markersRef.current[stop.id].marker as import("maplibre-gl").Marker).remove()
            delete markersRef.current[stop.id]
          }
          return
        }

        const isSelected = stop.id === selectedStopId
        const displayIndex = idx + 1
        const group = colocatedGroups.get(stop.id)

        // Remove existing marker before re-adding
        if (markersRef.current[stop.id]) {
          ;(markersRef.current[stop.id].marker as import("maplibre-gl").Marker).remove()
          delete markersRef.current[stop.id]
        }

        // Create single or combined marker
        const isWo = !!stop.workOrderId
        const el = group
          ? createCombinedMarkerEl(group.indices, stop.status, stop.positionLocked, isSelected)
          : createMarkerEl(displayIndex, stop.status, stop.positionLocked, isSelected, isWo)

        el.addEventListener("click", () => onSelectRef.current?.(stop.id))

        const marker = new mgl.Marker({ element: el })
          .setLngLat([stop.lng!, stop.lat!])
          .addTo(map)
        markersRef.current[stop.id] = { marker, el }
      })

      // ── Home base marker ──────────────────────────────────────────────────
      if (homeBaseMarkerRef.current) {
        ;(homeBaseMarkerRef.current as import("maplibre-gl").Marker).remove()
        homeBaseMarkerRef.current = null
      }
      if (homeBase) {
        const hbEl = createHomeBaseMarkerEl()
        const hbMarker = new mgl.Marker({ element: hbEl })
          .setLngLat([homeBase.lng, homeBase.lat])
          .addTo(map)
        homeBaseMarkerRef.current = hbMarker
      }

      // ── Fit bounds (only when stop set actually changes) ─────────────────────
      const stopIdKey = stopsWithCoords.map((s) => s.id).join(",") + (homeBase ? `,hb:${homeBase.lat},${homeBase.lng}` : "")
      if (stopIdKey !== fittedStopIdsRef.current) {
        fittedStopIdsRef.current = stopIdKey

        // Include home base in bounds calculation
        const allLngs = stopsWithCoords.map((s) => s.lng!)
        const allLats = stopsWithCoords.map((s) => s.lat!)
        if (homeBase) {
          allLngs.push(homeBase.lng)
          allLats.push(homeBase.lat)
        }

        if (allLngs.length > 1) {
          map.fitBounds(
            [
              [Math.min(...allLngs), Math.min(...allLats)],
              [Math.max(...allLngs), Math.max(...allLats)],
            ],
            { padding: 60, maxZoom: 15, duration: 0 }
          )
        } else if (allLngs.length === 1) {
          map.flyTo({
            center: [allLngs[0], allLats[0]],
            zoom: 14,
            animate: false,
          })
        }
      }
    })
  }, [selectedStopId, orsGeometry, orsFailed, homeBase])

  const handleMapReady = useCallback(
    (map: import("maplibre-gl").Map) => {
      mapReadyRef.current = true
      updateMap()
    },
    [updateMap]
  )

  useEffect(() => {
    updateMap()
  }, [stops, selectedStopId, updateMap])

  // Cleanup markers on unmount
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
    <div className={`relative h-full min-h-[300px] ${className ?? ""}`}>
      <MapClient
        ref={mapHandleRef}
        onMapReady={handleMapReady}
        className="h-full min-h-[300px] w-full rounded-lg overflow-hidden"
      />
      {/* Drive time overlay */}
      {(geocodedCount >= 2 || (geocodedCount >= 1 && homeBase)) && (
        <div className="absolute top-3 left-3 z-10 flex items-center gap-1.5 rounded-md bg-background/85 backdrop-blur-sm border border-border/60 px-2.5 py-1.5 shadow-lg pointer-events-none">
          {isFetchingRoute ? (
            <Loader2Icon className="h-3.5 w-3.5 text-muted-foreground animate-spin" />
          ) : (
            <CarIcon className="h-3.5 w-3.5 text-muted-foreground" />
          )}
          <span className="text-xs font-semibold text-foreground">
            {isEstimate ? "~" : ""}{driveMinutes} min
          </span>
          <span className="text-[10px] text-muted-foreground">
            total drive
          </span>
        </div>
      )}
      {stops.length === 0 && (
        <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
          <p className="text-sm text-muted-foreground bg-background/80 rounded px-3 py-1.5">
            No stops to display
          </p>
        </div>
      )}
    </div>
  )
}
