"use client"

import "maplibre-gl/dist/maplibre-gl.css"

import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import { MapPinIcon } from "lucide-react"
import type { DispatchData, DispatchStop, DispatchTech } from "@/actions/dispatch"
import type { TechPosition } from "@/hooks/use-tech-positions"
import { useTechPositions } from "@/hooks/use-tech-positions"
import { getRouteDirections } from "@/actions/optimize"
import { TechPositionMarker } from "./tech-position-marker"
import { StopMarker } from "./stop-marker"
import { StopPopup } from "./stop-popup"

// MapLibre types — resolved lazily
type MaplibreGl = typeof import("maplibre-gl")
type MaplibreMap = import("maplibre-gl").Map

// ─── Route line helpers ────────────────────────────────────────────────────────

/**
 * Build the waypoint coordinates for a tech's remaining stops.
 * Includes tech GPS position or home base as the first point.
 */
function buildStraightLineCoords(
  techId: string,
  stops: DispatchStop[],
  techPosition: TechPosition | undefined,
  homeBase: { lat: number; lng: number } | null
): [number, number][] {
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

  if (remainingStops.length === 0) return []

  const coordinates: [number, number][] = []
  if (techPosition) {
    coordinates.push([techPosition.lng, techPosition.lat])
  } else if (homeBase) {
    coordinates.push([homeBase.lng, homeBase.lat])
  }
  for (const stop of remainingStops) {
    coordinates.push([stop.lng!, stop.lat!])
  }

  return coordinates
}

/**
 * Draw or update a route line on the map for a given tech.
 */
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
      layout: {
        "line-join": "round",
        "line-cap": "round",
      },
      paint: {
        "line-color": techColor,
        "line-width": 3,
        "line-opacity": 0.8,
      },
    })
  }
}

// ─── Home base marker helper ─────────────────────────────────────────────────

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
  el.innerHTML = `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M15 21v-8a1 1 0 0 0-1-1h-4a1 1 0 0 0-1 1v8"/><path d="M3 10a2 2 0 0 1 .709-1.528l7-5.999a2 2 0 0 1 2.582 0l7 5.999A2 2 0 0 1 21 10v9a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/></svg>`
  el.title = "Home Base"
  return el
}

// ─── DispatchMapInner ──────────────────────────────────────────────────────────

interface DispatchMapInnerProps {
  initialData: DispatchData
  orgId: string
  selectedTechId: string | null
}

function DispatchMapInner({ initialData, orgId, selectedTechId }: DispatchMapInnerProps) {
  const mapContainerRef = useRef<HTMLDivElement>(null)
  const mapRef = useRef<MaplibreMap | null>(null)
  const maplibreRef = useRef<MaplibreGl | null>(null)
  const homeBaseMarkerRef = useRef<unknown>(null)
  const [mapReady, setMapReady] = useState(false)
  const [selectedStop, setSelectedStop] = useState<DispatchStop | null>(null)

  // ORS geometry per tech — keyed by techId
  const [orsGeometries, setOrsGeometries] = useState<Record<string, [number, number][]>>({})
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

      // Compute initial bounds from stops + home base
      const stopsWithCoords = initialData.stops.filter(
        (s) => s.lat !== null && s.lng !== null
      )

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

      map.addControl(
        new mgl.AttributionControl({ compact: true }),
        "bottom-right"
      )

      map.on("load", () => {
        if (cancelled) return
        mapRef.current = map

        // Fit bounds including home base
        if (allLngs.length > 1) {
          map.fitBounds(
            [
              [Math.min(...allLngs), Math.min(...allLats)],
              [Math.max(...allLngs), Math.max(...allLats)],
            ],
            { padding: 60, maxZoom: 14, duration: 0 }
          )
        }

        // Add home base marker
        if (initialData.homeBase) {
          const hbEl = createHomeBaseMarkerEl()
          const hbMarker = new mgl.Marker({ element: hbEl })
            .setLngLat([initialData.homeBase.lng, initialData.homeBase.lat])
            .addTo(map)
          homeBaseMarkerRef.current = hbMarker
        }

        setMapReady(true)
      })
    }

    void initMap()

    return () => {
      cancelled = true
      if (homeBaseMarkerRef.current) {
        ;(homeBaseMarkerRef.current as import("maplibre-gl").Marker).remove()
        homeBaseMarkerRef.current = null
      }
      if (mapRef.current) {
        mapRef.current.remove()
        mapRef.current = null
      }
      maplibreRef.current = null
      setMapReady(false)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []) // Init once

  // ── Fetch ORS directions per tech (debounced, with 5s timeout via server action) ──
  useEffect(() => {
    const requestId = ++orsRequestRef.current

    async function fetchOrsForTechs() {
      const results: Record<string, [number, number][]> = {}

      await Promise.all(
        visibleTechIds.map(async (techId) => {
          const coords = buildStraightLineCoords(
            techId,
            visibleStops,
            techPositions[techId],
            initialData.homeBase
          )
          if (coords.length < 2) return

          const result = await getRouteDirections(coords)
          if (orsRequestRef.current !== requestId) return

          if (result.success && result.geometry.length > 0) {
            results[techId] = result.geometry
          }
        })
      )

      if (orsRequestRef.current === requestId) {
        setOrsGeometries(results)
      }
    }

    // Debounce 500ms
    const timer = setTimeout(fetchOrsForTechs, 500)
    return () => clearTimeout(timer)
  }, [visibleTechIds, visibleStops, techPositions, initialData.homeBase])

  // ── Route lines — draw straight lines immediately, upgrade to ORS when ready ──
  useEffect(() => {
    const map = mapRef.current
    if (!map || !mapReady) return

    for (const techId of visibleTechIds) {
      const tech = techMap.get(techId)
      if (!tech) continue

      // Use ORS geometry if available, otherwise straight lines
      const orsGeo = orsGeometries[techId]
      if (orsGeo && orsGeo.length > 0) {
        setRouteLine(map, techId, orsGeo, tech.color)
      } else {
        const straightCoords = buildStraightLineCoords(
          techId,
          visibleStops,
          techPositions[techId],
          initialData.homeBase
        )
        setRouteLine(map, techId, straightCoords, tech.color)
      }
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
  }, [mapReady, techPositions, visibleStops, visibleTechIds, selectedTechId, initialData.techs, initialData.homeBase, techMap, orsGeometries])

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
    <div className="absolute inset-0">
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

export function DispatchMap(props: DispatchMapProps) {
  return <DispatchMapInner {...props} />
}
