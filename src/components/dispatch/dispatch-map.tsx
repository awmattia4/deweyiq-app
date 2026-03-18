"use client"

import "maplibre-gl/dist/maplibre-gl.css"

import { useCallback, useEffect, useRef, useState } from "react"
import { MapPinIcon } from "lucide-react"
import type { DispatchData, DispatchStop, DispatchTech } from "@/actions/dispatch"
import type { TechPosition } from "@/hooks/use-tech-positions"
import { useTechPositions } from "@/hooks/use-tech-positions"
import { TechPositionMarker } from "./tech-position-marker"
import { StopMarker } from "./stop-marker"
import { StopPopup } from "./stop-popup"

// MapLibre types — resolved lazily
type MaplibreGl = typeof import("maplibre-gl")
type MaplibreMap = import("maplibre-gl").Map

// ─── Route line helpers ────────────────────────────────────────────────────────

/**
 * Draws or updates a GeoJSON route line for a single tech through their
 * remaining (non-complete, non-skipped) stops.
 *
 * If techPosition is available, the line starts from the tech's current GPS position.
 * Otherwise it starts from the first remaining stop.
 *
 * Per user decision: completed stops are grayed out, their segments dashed.
 */
function updateRouteLine(
  map: MaplibreMap,
  techId: string,
  stops: DispatchStop[],
  techColor: string,
  techPosition: TechPosition | undefined
) {
  const layerId = `route-line-${techId}`
  const sourceId = `route-source-${techId}`

  const remainingStops = stops
    .filter(
      (s) =>
        s.techId === techId &&
        s.status !== "complete" &&
        s.status !== "skipped" &&
        s.status !== "holiday" &&
        s.lat !== null &&
        s.lng !== null
    )
    .sort((a, b) => a.sortIndex - b.sortIndex)

  if (remainingStops.length === 0) {
    // No remaining stops — remove line if it exists
    if (map.getLayer(layerId)) map.removeLayer(layerId)
    if (map.getSource(sourceId)) map.removeSource(sourceId)
    return
  }

  // Build coordinate array: tech position first (if available), then remaining stops
  const coordinates: [number, number][] = []
  if (techPosition) {
    coordinates.push([techPosition.lng, techPosition.lat])
  }
  for (const stop of remainingStops) {
    coordinates.push([stop.lng!, stop.lat!])
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
      paint: {
        "line-color": techColor,
        "line-width": 2.5,
        "line-dasharray": [3, 2],
        "line-opacity": 0.75,
      },
    })
  }
}

// ─── DispatchMapInner ──────────────────────────────────────────────────────────

interface DispatchMapInnerProps {
  initialData: DispatchData
  orgId: string
  selectedTechId: string | null
}

/**
 * DispatchMapInner — the actual MapLibre map with all markers and route lines.
 *
 * This component is rendered inside DispatchMap which is loaded via next/dynamic
 * with ssr: false. MapLibre accesses window on import — never SSR this.
 *
 * Tech position markers are colored pulsing pins from useTechPositions (Supabase Broadcast).
 * Stop markers are numbered, color-coded by tech. Completed stops are grayed out.
 * Route lines are drawn through remaining stops per tech.
 * Clicking a stop marker opens StopPopup.
 *
 * Fit bounds: on initial load, zooms to show all stops with coordinates.
 * selectedTechId: when set, only that tech's stops and position are shown.
 */
function DispatchMapInner({ initialData, orgId, selectedTechId }: DispatchMapInnerProps) {
  const mapContainerRef = useRef<HTMLDivElement>(null)
  const mapRef = useRef<MaplibreMap | null>(null)
  const maplibreRef = useRef<MaplibreGl | null>(null)
  const [mapReady, setMapReady] = useState(false)
  const [selectedStop, setSelectedStop] = useState<DispatchStop | null>(null)

  // Live tech positions via Supabase Broadcast
  const techPositions = useTechPositions(orgId)

  // Map of techId → DispatchTech for quick lookup
  const techMap = new Map<string, DispatchTech>(
    initialData.techs.map((t) => [t.id, t])
  )

  // Filter stops and techs based on selectedTechId
  const visibleStops = selectedTechId
    ? initialData.stops.filter((s) => s.techId === selectedTechId)
    : initialData.stops

  const visibleTechIds = selectedTechId
    ? [selectedTechId]
    : initialData.techs.map((t) => t.id)

  // ── Map initialization ────────────────────────────────────────────────────
  useEffect(() => {
    const maptilerKey = process.env.NEXT_PUBLIC_MAPTILER_KEY
    if (!maptilerKey || !mapContainerRef.current) return

    let cancelled = false

    async function initMap() {
      const mgl = await import("maplibre-gl")
      if (cancelled || !mapContainerRef.current) return

      maplibreRef.current = mgl

      // Inject pulse animation CSS once
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

      // Compute initial center from stops with coordinates
      const stopsWithCoords = initialData.stops.filter(
        (s) => s.lat !== null && s.lng !== null
      )

      let center: [number, number] = [-96, 39]
      let zoom = 5
      if (stopsWithCoords.length > 0) {
        const avgLng =
          stopsWithCoords.reduce((sum, s) => sum + s.lng!, 0) / stopsWithCoords.length
        const avgLat =
          stopsWithCoords.reduce((sum, s) => sum + s.lat!, 0) / stopsWithCoords.length
        center = [avgLng, avgLat]
        zoom = 11
      }

      const map = new mgl.Map({
        container: mapContainerRef.current,
        style: `https://api.maptiler.com/maps/streets-v2-dark/style.json?key=${maptilerKey}`,
        center,
        zoom,
        attributionControl: false,
      })

      map.addControl(
        new mgl.AttributionControl({ compact: true }),
        "bottom-right"
      )

      map.on("load", () => {
        if (cancelled) return
        mapRef.current = map

        // Fit to show all stops on initial load
        if (stopsWithCoords.length > 1) {
          const lngs = stopsWithCoords.map((s) => s.lng!)
          const lats = stopsWithCoords.map((s) => s.lat!)
          map.fitBounds(
            [
              [Math.min(...lngs), Math.min(...lats)],
              [Math.max(...lngs), Math.max(...lats)],
            ],
            { padding: 60, maxZoom: 14, duration: 0 }
          )
        }

        setMapReady(true)
      })
    }

    void initMap()

    return () => {
      cancelled = true
      if (mapRef.current) {
        mapRef.current.remove()
        mapRef.current = null
      }
      maplibreRef.current = null
      setMapReady(false)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []) // Init once

  // ── Route lines — update when positions or selection changes ─────────────
  useEffect(() => {
    const map = mapRef.current
    if (!map || !mapReady) return

    for (const techId of visibleTechIds) {
      const tech = techMap.get(techId)
      if (!tech) continue
      const position = techPositions[techId]
      updateRouteLine(map, techId, visibleStops, tech.color, position)
    }

    // Clean up route lines for hidden techs (when filter changes)
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
  }, [mapReady, techPositions, visibleStops, visibleTechIds, selectedTechId, initialData.techs, techMap])

  // ── Close popup on map click ──────────────────────────────────────────────
  const handleMapClick = useCallback(() => {
    setSelectedStop(null)
  }, [])

  useEffect(() => {
    const map = mapRef.current
    if (!map || !mapReady) return
    map.on("click", handleMapClick)
    return () => {
      map.off("click", handleMapClick)
    }
  }, [mapReady, handleMapClick])

  // ─────────────────────────────────────────────────────────────────────────────

  const maptilerKey = process.env.NEXT_PUBLIC_MAPTILER_KEY

  if (!maptilerKey) {
    return (
      <div className="flex flex-col items-center justify-center gap-3 h-full text-center px-4">
        <MapPinIcon className="h-10 w-10 text-muted-foreground/40" />
        <div>
          <p className="text-sm font-medium">Map unavailable</p>
          <p className="text-xs text-muted-foreground mt-1">
            Set{" "}
            <code className="rounded bg-muted px-1 py-0.5 font-mono text-xs">
              NEXT_PUBLIC_MAPTILER_KEY
            </code>{" "}
            to enable the dispatch map.
          </p>
        </div>
      </div>
    )
  }

  return (
    <div className="relative w-full h-full" style={{ minHeight: 0 }}>
      {/* Map canvas */}
      <div ref={mapContainerRef} className="absolute inset-0" />

      {/* Markers — rendered via React but attached to map imperatively */}
      {mapReady && mapRef.current && maplibreRef.current && (
        <>
          {/* Tech position markers */}
          {visibleTechIds.map((techId) => {
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

          {/* Stop markers */}
          {visibleStops.map((stop, idx) => {
            if (stop.lat === null || stop.lng === null) return null
            const tech = stop.techId ? techMap.get(stop.techId) : undefined
            const techColor = tech?.color ?? "#60a5fa"
            return (
              <StopMarker
                key={stop.id}
                map={mapRef.current!}
                stop={stop}
                techColor={techColor}
                sortNumber={idx + 1}
                onClick={setSelectedStop}
                maplibregl={maplibreRef.current!}
              />
            )
          })}
        </>
      )}

      {/* Stop detail popup */}
      {selectedStop && (
        <StopPopup
          stop={selectedStop}
          tech={selectedStop.techId ? techMap.get(selectedStop.techId) : undefined}
          onClose={() => setSelectedStop(null)}
        />
      )}
    </div>
  )
}

// ─── DispatchMap ───────────────────────────────────────────────────────────────

interface DispatchMapProps {
  initialData: DispatchData
  orgId: string
  selectedTechId: string | null
}

/**
 * DispatchMap — public export wrapping DispatchMapInner.
 *
 * This component MUST be imported via next/dynamic with { ssr: false }
 * by the dispatch page. MapLibre accesses window on import.
 *
 * Props are passed through to DispatchMapInner.
 */
export function DispatchMap(props: DispatchMapProps) {
  return <DispatchMapInner {...props} />
}
