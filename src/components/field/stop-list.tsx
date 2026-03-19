"use client"

import { useState, useCallback } from "react"
import {
  DndContext,
  closestCenter,
  TouchSensor,
  MouseSensor,
  KeyboardSensor,
  useSensor,
  useSensors,
  type DragEndEvent,
} from "@dnd-kit/core"
import {
  SortableContext,
  sortableKeyboardCoordinates,
  verticalListSortingStrategy,
  useSortable,
  arrayMove,
} from "@dnd-kit/sortable"
import { CSS } from "@dnd-kit/utilities"
import { MapPinIcon } from "lucide-react"
import { offlineDb } from "@/lib/offline/db"
import type { RouteStop } from "@/actions/routes"
import type { WeatherType } from "@/lib/weather/open-meteo"
import { StopCard } from "./stop-card"
import type { StopPredictiveAlert } from "./stop-card"
import { cn } from "@/lib/utils"

// ─── SortableStopCard wrapper ─────────────────────────────────────────────────

interface SortableStopCardProps {
  stop: RouteStop
  showDragHandle: boolean
  weather: { type: WeatherType; label: string } | null
  predictiveAlerts: Record<string, StopPredictiveAlert>
}

/**
 * SortableStopCard — wraps StopCard with @dnd-kit/sortable useSortable hook.
 *
 * touchAction: "none" on the container prevents scroll conflict during drags.
 * Drag handle receives listeners/attributes from useSortable for touch/mouse
 * activation.
 */
function SortableStopCard({ stop, showDragHandle, weather, predictiveAlerts }: SortableStopCardProps) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: `stop-${stop.stopIndex}` })

  const style: React.CSSProperties = {
    transform: CSS.Transform.toString(transform),
    transition,
    // Required: prevent iOS scroll conflict during drag
    touchAction: "none",
    // Lift dragged item visually
    zIndex: isDragging ? 10 : undefined,
    position: isDragging ? "relative" : undefined,
  }

  return (
    <div
      ref={setNodeRef}
      style={style}
      className={cn(
        "transition-opacity",
        isDragging && "opacity-80 shadow-2xl shadow-black/50"
      )}
    >
      <StopCard
        stop={stop}
        showDragHandle={showDragHandle}
        dragListeners={listeners ?? undefined}
        dragAttributes={attributes}
        weather={weather}
        predictiveAlert={predictiveAlerts[stop.poolId] ?? null}
      />
    </div>
  )
}

// ─── StopList ─────────────────────────────────────────────────────────────────

interface StopListProps {
  /** Initial stop list from SSR — mutated locally on drag reorder */
  initialStops: RouteStop[]
  /**
   * Today's weather classification for the route area.
   * Passed to each stop card. Null when clear (no badge shown).
   */
  weather: { type: WeatherType; label: string } | null
  /**
   * Predictive chemistry alerts keyed by pool_id.
   * Passed through to each stop card for optional alert badge display.
   * Phase 10-02: techs get a heads-up before arriving at a trending pool.
   */
  predictiveAlerts?: Record<string, StopPredictiveAlert>
  /**
   * When true, drag-to-reorder is disabled. Used for owner/office roles
   * viewing the routes page — reordering belongs on the Schedule page.
   */
  disableReorder?: boolean
}

/**
 * StopList — ordered stop list with drag-to-reorder for the tech route view.
 *
 * Per locked decision: "Techs can drag-to-reorder remaining stops on the fly"
 *
 * Drag sensors:
 * - TouchSensor: activationConstraint { delay: 250, tolerance: 5 }
 *   Prevents accidental drags during scroll (research pattern 6)
 * - MouseSensor: activationConstraint { distance: 10 }
 *   Desktop fallback; requires 10px movement before activating
 * - KeyboardSensor: accessibility support
 *
 * On drag end:
 * - arrayMove() reorders the stop list in React state
 * - Writes new order to Dexie routeCache for offline persistence
 * - Does NOT call reorderStops() server action (techs lack UPDATE on route_days)
 *   Phase 4 will add persistent reordering to the server when the scheduling
 *   system is overhauled.
 *
 * Empty state: "No stops scheduled for today" with map pin icon.
 *
 * Phase 10-07: weather prop passed through to each stop card for weather badges.
 * Phase 10-02: predictiveAlerts prop passed through to each stop card for alert badges.
 */
export function StopList({ initialStops, weather, predictiveAlerts = {}, disableReorder = false }: StopListProps) {
  const [stops, setStops] = useState<RouteStop[]>(initialStops)

  // Sensor configuration — increased delay/tolerance for better scroll vs drag
  // discrimination on mobile (400ms hold + 10px tolerance)
  const sensors = useSensors(
    useSensor(TouchSensor, {
      activationConstraint: {
        delay: 400,
        tolerance: 10,
      },
    }),
    // Mouse: 10px distance before drag activates (desktop fallback)
    useSensor(MouseSensor, {
      activationConstraint: {
        distance: 10,
      },
    }),
    // Keyboard: accessibility
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    })
  )

  const handleDragEnd = useCallback(
    async (event: DragEndEvent) => {
      const { active, over } = event
      if (!over || active.id === over.id) return

      setStops((currentStops) => {
        const oldIndex = currentStops.findIndex(
          (s) => `stop-${s.stopIndex}` === active.id
        )
        const newIndex = currentStops.findIndex(
          (s) => `stop-${s.stopIndex}` === over.id
        )

        if (oldIndex === -1 || newIndex === -1) return currentStops

        const reordered = arrayMove(currentStops, oldIndex, newIndex)

        // Persist reordered stops to Dexie routeCache for offline use.
        // Tech role cannot update route_days on server (RLS restriction) —
        // reorder is local-only until Phase 4 adds persistent tech reordering.
        const now = Date.now()
        const ttl = 24 * 60 * 60 * 1000
        void offlineDb.routeCache.bulkPut(
          reordered.map((stop, idx) => ({
            id: `stop-${idx}`,
            data: { ...stop, stopIndex: idx },
            cachedAt: now,
            expiresAt: now + ttl,
          }))
        )

        return reordered
      })
    },
    []
  )

  // Empty state
  if (stops.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center rounded-xl border border-dashed border-border/60 p-12 text-center gap-4">
        <div className="flex h-12 w-12 items-center justify-center rounded-full bg-muted">
          <MapPinIcon className="h-6 w-6 text-muted-foreground" aria-hidden="true" />
        </div>
        <div className="flex flex-col gap-1 max-w-sm">
          <p className="font-medium text-sm">No stops scheduled for today</p>
          <p className="text-sm text-muted-foreground">
            Your route will appear here once it has been assigned. Check back later or
            contact your dispatcher.
          </p>
        </div>
      </div>
    )
  }

  // Show drag handles only when reorder is enabled and there is more than 1 remaining stop
  const remainingCount = stops.filter(
    (s) => s.stopStatus !== "complete" && s.stopStatus !== "skipped"
  ).length
  const showDragHandles = !disableReorder && remainingCount > 1

  const stopIds = stops.map((s) => `stop-${s.stopIndex}`)

  // When reorder is disabled (owner/office viewing routes page), render a
  // plain list without DnD context — no drag sensors, no sortable wrappers.
  if (disableReorder) {
    return (
      <div className="flex flex-col gap-2.5" role="list" aria-label="Today's stops">
        {stops.map((stop) => (
          <StopCard
            key={`stop-${stop.stopIndex}-${stop.customerId}`}
            stop={stop}
            showDragHandle={false}
            weather={weather}
            predictiveAlert={predictiveAlerts[stop.poolId] ?? null}
          />
        ))}
      </div>
    )
  }

  return (
    <DndContext
      sensors={sensors}
      collisionDetection={closestCenter}
      onDragEnd={handleDragEnd}
    >
      <SortableContext items={stopIds} strategy={verticalListSortingStrategy}>
        <div className="flex flex-col gap-2.5" role="list" aria-label="Today's stops">
          {stops.map((stop) => (
            <SortableStopCard
              key={`stop-${stop.stopIndex}-${stop.customerId}`}
              stop={stop}
              showDragHandle={showDragHandles}
              weather={weather}
              predictiveAlerts={predictiveAlerts}
            />
          ))}
        </div>
      </SortableContext>
    </DndContext>
  )
}
