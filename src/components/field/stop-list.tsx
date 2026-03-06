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
import { StopCard } from "./stop-card"
import { cn } from "@/lib/utils"

// ─── SortableStopCard wrapper ─────────────────────────────────────────────────

interface SortableStopCardProps {
  stop: RouteStop
  showDragHandle: boolean
}

/**
 * SortableStopCard — wraps StopCard with @dnd-kit/sortable useSortable hook.
 *
 * touchAction: "none" on the container prevents scroll conflict during drags.
 * Drag handle receives listeners/attributes from useSortable for touch/mouse
 * activation.
 */
function SortableStopCard({ stop, showDragHandle }: SortableStopCardProps) {
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
      />
    </div>
  )
}

// ─── StopList ─────────────────────────────────────────────────────────────────

interface StopListProps {
  /** Initial stop list from SSR — mutated locally on drag reorder */
  initialStops: RouteStop[]
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
 */
export function StopList({ initialStops }: StopListProps) {
  const [stops, setStops] = useState<RouteStop[]>(initialStops)

  // Sensor configuration
  const sensors = useSensors(
    // Touch: 250ms hold before drag activates + 5px tolerance (prevents scroll conflict)
    useSensor(TouchSensor, {
      activationConstraint: {
        delay: 250,
        tolerance: 5,
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

  // Show drag handles only when there is more than 1 remaining (non-complete) stop
  const remainingCount = stops.filter(
    (s) => s.stopStatus !== "complete" && s.stopStatus !== "skipped"
  ).length
  const showDragHandles = remainingCount > 1

  const stopIds = stops.map((s) => `stop-${s.stopIndex}`)

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
            />
          ))}
        </div>
      </SortableContext>
    </DndContext>
  )
}
