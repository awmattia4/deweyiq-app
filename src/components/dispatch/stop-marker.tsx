"use client"

import { useEffect, useRef } from "react"
import type { DispatchStop } from "@/actions/dispatch"

type MaplibreMap = import("maplibre-gl").Map
type MaplibreMarker = import("maplibre-gl").Marker

interface StopMarkerProps {
  map: MaplibreMap
  stop: DispatchStop
  techColor: string
  sortNumber: number
  onClick: (stop: DispatchStop) => void
  maplibregl: typeof import("maplibre-gl")
}

/**
 * Returns background/border colors for each stop status.
 * Completed stops use muted gray per user decision ("grayed out on the map").
 */
function getMarkerColors(
  status: string,
  techColor: string
): { bg: string; border: string; text: string } {
  switch (status) {
    case "complete":
      return { bg: "oklch(0.35 0.02 250)", border: "oklch(0.45 0.03 250)", text: "oklch(0.6 0.02 250)" }
    case "skipped":
      return { bg: "oklch(0.4 0.15 25)", border: "oklch(0.55 0.18 25)", text: "white" }
    case "holiday":
      return { bg: "oklch(0.4 0.12 280)", border: "oklch(0.55 0.14 280)", text: "white" }
    case "in_progress":
      return { bg: techColor, border: "white", text: "white" }
    default: // scheduled
      return { bg: techColor, border: "white", text: "white" }
  }
}

/**
 * StopMarker — renders a numbered stop pin on the dispatch map.
 *
 * Status states:
 * - scheduled: solid tech-colored circle with sort number
 * - in_progress: pulsing tech-colored circle (animated ring)
 * - complete: grayed-out circle (per user decision)
 * - skipped: red/amber circle with ✕
 * - holiday: purple circle with calendar icon
 *
 * Click handler opens the StopPopup with customer details.
 */
export function StopMarker({
  map,
  stop,
  techColor,
  sortNumber,
  onClick,
  maplibregl,
}: StopMarkerProps) {
  const markerRef = useRef<MaplibreMarker | null>(null)

  useEffect(() => {
    if (stop.lat === null || stop.lng === null) return

    const { bg, border, text } = getMarkerColors(stop.status, techColor)
    const isInProgress = stop.status === "in_progress"
    const isSkipped = stop.status === "skipped"
    const isHoliday = stop.status === "holiday"

    const el = document.createElement("div")
    el.className = "stop-marker"
    el.setAttribute("role", "button")
    el.setAttribute("aria-label", `Stop ${sortNumber}: ${stop.customerName}`)
    el.style.cssText = `
      width: 28px;
      height: 28px;
      border-radius: 50%;
      background-color: ${bg};
      border: 2px solid ${border};
      box-shadow: 0 2px 4px rgba(0,0,0,0.4);
      display: flex;
      align-items: center;
      justify-content: center;
      cursor: pointer;
      position: relative;
      font-family: system-ui, sans-serif;
      font-size: 11px;
      font-weight: 700;
      color: ${text};
      user-select: none;
    `

    // Inner label
    const label = document.createElement("span")
    if (isSkipped) {
      label.textContent = "✕"
    } else if (isHoliday) {
      label.textContent = "✦"
    } else {
      label.textContent = String(sortNumber)
    }
    el.appendChild(label)

    // Pulse ring for in-progress stops
    if (isInProgress) {
      const pulse = document.createElement("div")
      pulse.style.cssText = `
        position: absolute;
        top: -5px;
        left: -5px;
        width: 38px;
        height: 38px;
        border-radius: 50%;
        border: 2px solid ${techColor};
        opacity: 0;
        animation: tech-marker-pulse 1.5s ease-out infinite;
        pointer-events: none;
      `
      el.appendChild(pulse)
    }

    el.addEventListener("click", (e) => {
      e.stopPropagation()
      onClick(stop)
    })

    const marker = new maplibregl.Marker({ element: el, anchor: "center" })
      .setLngLat([stop.lng!, stop.lat!])
      .addTo(map)

    markerRef.current = marker

    return () => {
      marker.remove()
      markerRef.current = null
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [map, maplibregl, stop.id, stop.status, sortNumber, techColor])

  return null
}
