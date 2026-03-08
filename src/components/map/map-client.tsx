"use client"

import { useEffect, useRef, useCallback, forwardRef, useImperativeHandle } from "react"
import { MapPinIcon } from "lucide-react"

// MapLibre is loaded lazily to avoid SSR issues (window access on import).
// This component must be consumed via next/dynamic with { ssr: false }.
let maplibregl: typeof import("maplibre-gl") | null = null

// ─── Types ─────────────────────────────────────────────────────────────────────

export interface MapClientHandle {
  getMap: () => import("maplibre-gl").Map | null
}

interface MapClientProps {
  /** [lng, lat] initial center. Defaults to geographic center of the US. */
  center?: [number, number]
  /** Initial zoom level. Defaults to 11. */
  zoom?: number
  /** Additional CSS class for the map container div. */
  className?: string
  /** Called once the MapLibre Map instance is ready for imperative use. */
  onMapReady?: (map: import("maplibre-gl").Map) => void
}

// ─── MapClient ─────────────────────────────────────────────────────────────────

/**
 * MapClient — SSR-safe MapLibre GL JS wrapper.
 *
 * CRITICAL: MapLibre accesses `window` on import. This component MUST be
 * loaded via next/dynamic with { ssr: false } by consuming components.
 *
 * Tile source: MapTiler dark streets variant (NEXT_PUBLIC_MAPTILER_KEY).
 * Falls back to a placeholder if the key is not set.
 *
 * Exposes a handle (via forwardRef) so parent components can access the
 * underlying Map instance for imperative operations (add sources, layers, etc.).
 */
export const MapClient = forwardRef<MapClientHandle, MapClientProps>(
  function MapClient(
    { center = [-96, 39], zoom = 11, className, onMapReady },
    ref
  ) {
    const mapContainerRef = useRef<HTMLDivElement>(null)
    const mapRef = useRef<import("maplibre-gl").Map | null>(null)
    const onMapReadyRef = useRef(onMapReady)

    // Keep callback ref current without triggering re-initialization
    useEffect(() => {
      onMapReadyRef.current = onMapReady
    }, [onMapReady])

    // Expose map instance via ref handle
    useImperativeHandle(ref, () => ({
      getMap: () => mapRef.current,
    }))

    useEffect(() => {
      const maptilerKey = process.env.NEXT_PUBLIC_MAPTILER_KEY

      // If no API key, skip map init — fallback placeholder renders instead
      if (!maptilerKey) return
      if (!mapContainerRef.current) return

      let cancelled = false

      async function initMap() {
        // Dynamic import avoids SSR window access
        const mgl = await import("maplibre-gl")
        if (cancelled || !mapContainerRef.current) return

        maplibregl = mgl

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
          onMapReadyRef.current?.(map)
        })
      }

      void initMap()

      return () => {
        cancelled = true
        if (mapRef.current) {
          mapRef.current.remove()
          mapRef.current = null
        }
      }
      // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []) // Init once — center/zoom are initial values only

    const maptilerKey = process.env.NEXT_PUBLIC_MAPTILER_KEY

    if (!maptilerKey) {
      return (
        <div
          className={`flex flex-col items-center justify-center gap-3 rounded-lg border border-dashed border-border/60 bg-muted/10 text-center ${className ?? "h-full min-h-[300px]"}`}
        >
          <MapPinIcon className="h-8 w-8 text-muted-foreground/40" />
          <div>
            <p className="text-sm font-medium text-muted-foreground">Map unavailable</p>
            <p className="text-xs text-muted-foreground/70 mt-1">
              Set{" "}
              <code className="rounded bg-muted px-1 py-0.5 font-mono text-xs">
                NEXT_PUBLIC_MAPTILER_KEY
              </code>{" "}
              to enable the route map.
            </p>
          </div>
        </div>
      )
    }

    return (
      <div
        ref={mapContainerRef}
        className={className ?? "h-full min-h-[300px] w-full rounded-lg overflow-hidden"}
      />
    )
  }
)
