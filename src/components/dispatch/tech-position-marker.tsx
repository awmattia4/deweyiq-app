"use client"

import { useEffect, useRef } from "react"
import type { TechPosition } from "@/hooks/use-tech-positions"

// MapLibre Marker type (imported lazily with the parent component)
type MaplibreMap = import("maplibre-gl").Map
type MaplibreMarker = import("maplibre-gl").Marker

// Stale threshold: 2 minutes
const STALE_THRESHOLD_MS = 2 * 60 * 1000

interface TechPositionMarkerProps {
  map: MaplibreMap
  position: TechPosition
  techName: string
  color: string
  maplibregl: typeof import("maplibre-gl")
}

/**
 * TechPositionMarker — renders a colored pulsing pin for a tech's live GPS position.
 *
 * Uses MapLibre's Marker API with a custom HTML element so we get full CSS
 * control over the pulse animation and stale state styling.
 *
 * Pulse animation indicates a live (non-stale) position.
 * Stale (>2 minutes old): marker dims to 40% opacity.
 *
 * Tooltip on hover shows tech name and "last updated X seconds/minutes ago".
 */
export function TechPositionMarker({
  map,
  position,
  techName,
  color,
  maplibregl,
}: TechPositionMarkerProps) {
  const markerRef = useRef<MaplibreMarker | null>(null)
  const elementRef = useRef<HTMLDivElement | null>(null)

  useEffect(() => {
    // Create the marker element
    const el = document.createElement("div")
    el.className = "tech-position-marker"
    el.setAttribute("aria-label", `${techName} — live position`)
    el.setAttribute("role", "img")
    el.title = techName

    const isStale = Date.now() - position.updatedAt > STALE_THRESHOLD_MS
    const ageSeconds = Math.round((Date.now() - position.updatedAt) / 1000)
    const ageLabel =
      ageSeconds < 60
        ? `${ageSeconds}s ago`
        : `${Math.round(ageSeconds / 60)}m ago`

    el.title = `${techName} — last updated ${ageLabel}`

    el.style.cssText = `
      width: 20px;
      height: 20px;
      border-radius: 50%;
      background-color: ${color};
      border: 2px solid white;
      box-shadow: 0 0 0 2px ${color}40;
      cursor: default;
      position: relative;
      opacity: ${isStale ? "0.4" : "1"};
      transition: opacity 0.3s ease;
    `

    // Pulse ring (only for non-stale positions)
    if (!isStale) {
      const pulse = document.createElement("div")
      pulse.style.cssText = `
        position: absolute;
        top: -4px;
        left: -4px;
        width: 28px;
        height: 28px;
        border-radius: 50%;
        border: 2px solid ${color};
        opacity: 0;
        animation: tech-marker-pulse 2s ease-out infinite;
        pointer-events: none;
      `
      el.appendChild(pulse)
    }

    elementRef.current = el

    const marker = new maplibregl.Marker({ element: el, anchor: "center" })
      .setLngLat([position.lng, position.lat])
      .addTo(map)

    markerRef.current = marker

    return () => {
      marker.remove()
      markerRef.current = null
      elementRef.current = null
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [map, maplibregl])

  // Update position when it changes without recreating the marker
  useEffect(() => {
    if (!markerRef.current) return
    markerRef.current.setLngLat([position.lng, position.lat])

    // Update stale state on element
    if (elementRef.current) {
      const isStale = Date.now() - position.updatedAt > STALE_THRESHOLD_MS
      const ageSeconds = Math.round((Date.now() - position.updatedAt) / 1000)
      const ageLabel =
        ageSeconds < 60
          ? `${ageSeconds}s ago`
          : `${Math.round(ageSeconds / 60)}m ago`

      elementRef.current.style.opacity = isStale ? "0.4" : "1"
      elementRef.current.title = `${techName} — last updated ${ageLabel}`
    }
  }, [position.lat, position.lng, position.updatedAt, techName])

  return null
}
