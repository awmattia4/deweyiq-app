"use client"

import { useEffect, useRef, useCallback } from "react"
import dynamic from "next/dynamic"
import type { MapClientHandle } from "@/components/map/map-client"

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
}

interface RouteMapProps {
  stops: ScheduleStop[]
  selectedStopId?: string
  onSelectStop?: (stopId: string) => void
  className?: string
}

// ─── Marker helpers ────────────────────────────────────────────────────────────

/**
 * Create a numbered SVG marker element for a route stop.
 * - Normal stops: dark blue circle with white number
 * - Locked stops: amber/gold circle (lock-icon visually distinct)
 * - Completed stops: gray circle (de-emphasized)
 * - Selected stop: accent ring
 */
function createMarkerEl(
  index: number,
  status: string,
  locked: boolean,
  selected: boolean
): HTMLElement {
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
    transition: transform 0.15s ease;
    transform: ${selected ? "scale(1.25)" : "scale(1)"};
  `

  const isComplete = status === "complete" || status === "skipped"
  const isHoliday = status === "holiday"

  if (isComplete || isHoliday) {
    el.style.backgroundColor = "oklch(0.45 0 0)" // gray
    el.style.color = "oklch(0.7 0 0)"
  } else if (locked) {
    el.style.backgroundColor = "oklch(0.75 0.18 85)" // amber/gold
    el.style.color = "oklch(0.2 0 0)"
    el.style.borderColor = "oklch(0.85 0.15 85)"
  } else if (selected) {
    el.style.backgroundColor = "oklch(0.65 0.2 250)" // blue accent
    el.style.color = "oklch(1 0 0)"
    el.style.borderColor = "oklch(0.85 0.15 250)"
  } else {
    el.style.backgroundColor = "oklch(0.35 0.12 250)" // dark blue
    el.style.color = "oklch(0.9 0 0)"
    el.style.borderColor = "oklch(0.5 0.15 250)"
  }

  el.textContent = String(index)
  return el
}

// ─── Route source/layer constants ─────────────────────────────────────────────

const ROUTE_SOURCE_ID = "route-line-source"
const ROUTE_LAYER_ID = "route-line-layer"

// ─── RouteMap ──────────────────────────────────────────────────────────────────

/**
 * RouteMap — renders a MapLibre map with numbered stop markers and a route line.
 *
 * - Markers are numbered by sort_index and color-coded by status/lock state
 * - Route line connects stops in sort_index order (only those with lat/lng)
 * - When stops prop changes (reorder/add/remove), map updates instantly
 * - Fits bounds to show all stops on change
 * - Locked stops show amber markers to indicate they cannot be moved
 * - Completed/skipped/holiday stops are grayed out
 */
export function RouteMap({ stops, selectedStopId, onSelectStop, className }: RouteMapProps) {
  const mapHandleRef = useRef<MapClientHandle>(null)
  const markersRef = useRef<{ [id: string]: { marker: unknown; el: HTMLElement } }>({})
  const stopsRef = useRef(stops)
  const onSelectRef = useRef(onSelectStop)
  const mapReadyRef = useRef(false)

  // Keep refs current
  useEffect(() => {
    stopsRef.current = stops
  }, [stops])
  useEffect(() => {
    onSelectRef.current = onSelectStop
  }, [onSelectStop])

  // Update map when stops or selectedStopId changes
  const updateMap = useCallback(() => {
    const map = mapHandleRef.current?.getMap()
    if (!map || !mapReadyRef.current) return

    const currentStops = stopsRef.current

    // Dynamically import maplibre-gl for marker creation
    import("maplibre-gl").then((mgl) => {
      const stopsWithCoords = currentStops.filter(
        (s) => s.lat != null && s.lng != null
      )

      // ── Update route line ────────────────────────────────────────────────────
      const lineCoords = stopsWithCoords.map((s) => [s.lng!, s.lat!])

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
            "line-color": "oklch(0.65 0.2 250)",
            "line-width": 2.5,
            "line-dasharray": [2, 2],
            "line-opacity": 0.7,
          },
        })
      }

      // ── Sync markers ─────────────────────────────────────────────────────────
      const newStopIds = new Set(currentStops.map((s) => s.id))

      // Remove markers for stops that no longer exist
      for (const id of Object.keys(markersRef.current)) {
        if (!newStopIds.has(id)) {
          ;(markersRef.current[id].marker as import("maplibre-gl").Marker).remove()
          delete markersRef.current[id]
        }
      }

      // Add/update markers for each stop
      stopsWithCoords.forEach((stop, idx) => {
        const isSelected = stop.id === selectedStopId
        const displayIndex = idx + 1

        if (markersRef.current[stop.id]) {
          // Update existing marker: re-create el with updated state
          const { marker, el: oldEl } = markersRef.current[stop.id]
          const mapMarker = marker as import("maplibre-gl").Marker
          const newEl = createMarkerEl(displayIndex, stop.status, stop.positionLocked, isSelected)
          newEl.addEventListener("click", () => onSelectRef.current?.(stop.id))

          // Replace element by removing and re-adding the marker
          mapMarker.remove()
          const updatedMarker = new mgl.Marker({ element: newEl })
            .setLngLat([stop.lng!, stop.lat!])
            .addTo(map)
          markersRef.current[stop.id] = { marker: updatedMarker, el: newEl }
        } else {
          // Create new marker
          const el = createMarkerEl(displayIndex, stop.status, stop.positionLocked, isSelected)
          el.addEventListener("click", () => onSelectRef.current?.(stop.id))

          const marker = new mgl.Marker({ element: el })
            .setLngLat([stop.lng!, stop.lat!])
            .addTo(map)
          markersRef.current[stop.id] = { marker, el }
        }
      })

      // ── Fit bounds ───────────────────────────────────────────────────────────
      if (stopsWithCoords.length > 1) {
        const lngs = stopsWithCoords.map((s) => s.lng!)
        const lats = stopsWithCoords.map((s) => s.lat!)
        map.fitBounds(
          [
            [Math.min(...lngs), Math.min(...lats)],
            [Math.max(...lngs), Math.max(...lats)],
          ],
          { padding: 60, maxZoom: 15, animate: true }
        )
      } else if (stopsWithCoords.length === 1) {
        map.flyTo({
          center: [stopsWithCoords[0].lng!, stopsWithCoords[0].lat!],
          zoom: 14,
          animate: true,
        })
      }
    })
  }, [selectedStopId])

  const handleMapReady = useCallback(
    (map: import("maplibre-gl").Map) => {
      mapReadyRef.current = true
      updateMap()
    },
    [updateMap]
  )

  // Re-render when stops or selectedStopId changes
  useEffect(() => {
    updateMap()
  }, [stops, selectedStopId, updateMap])

  // Cleanup markers on unmount
  useEffect(() => {
    return () => {
      for (const { marker } of Object.values(markersRef.current)) {
        ;(marker as import("maplibre-gl").Marker).remove()
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
