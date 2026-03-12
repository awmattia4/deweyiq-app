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
import {
  GripVerticalIcon,
  XIcon,
  MapPinIcon,
  CheckCircleIcon,
  SkipForwardIcon,
  MoreVerticalIcon,
  ArrowRightLeftIcon,
  UndoIcon,
  WrenchIcon,
} from "lucide-react"
import { cn } from "@/lib/utils"
import { updateStopOrder } from "@/actions/schedule"
import { StopLockToggle } from "./stop-lock-toggle"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import type { ScheduleStop } from "./route-map"

// ─── SortableStopRow ──────────────────────────────────────────────────────────

interface SortableStopRowProps {
  stop: ScheduleStop
  isLocked: boolean
  onToggleLock: (stopId: string) => void
  onRemoveStop: (stopId: string) => void
  onSkipStop?: (stopId: string) => void
  onUnskipStop?: (stopId: string) => void
  onMoveStop?: (stopId: string) => void
  onSelectStop?: (stopId: string) => void
  isSelected: boolean
}

function SortableStopRow({
  stop,
  isLocked,
  onToggleLock,
  onRemoveStop,
  onSkipStop,
  onUnskipStop,
  onMoveStop,
  onSelectStop,
  isSelected,
}: SortableStopRowProps) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: stop.id })

  const style: React.CSSProperties = {
    transform: CSS.Transform.toString(transform),
    transition,
    touchAction: "none",
    zIndex: isDragging ? 20 : undefined,
    position: isDragging ? "relative" : undefined,
  }

  const isComplete = stop.status === "complete" || stop.status === "skipped"
  const isHoliday = stop.status === "holiday"
  const isWorkOrder = !!stop.workOrderId

  // Status icon
  const StatusIcon =
    stop.status === "complete"
      ? CheckCircleIcon
      : stop.status === "skipped"
        ? SkipForwardIcon
        : null

  return (
    <div
      ref={setNodeRef}
      style={style}
      onClick={() => onSelectStop?.(stop.id)}
      className={cn(
        "group flex items-center gap-2 rounded-md border px-2.5 py-2 text-sm transition-colors cursor-pointer select-none",
        isDragging
          ? "border-border/80 bg-card shadow-2xl shadow-black/60 opacity-90"
          : isSelected
            ? "border-primary/50 bg-primary/5"
            : isWorkOrder
              ? "border-amber-500/30 bg-amber-500/5 hover:border-amber-500/50 hover:bg-amber-500/10"
              : "border-border bg-card hover:border-border/80 hover:bg-muted/20",
        (isComplete || isHoliday) && "opacity-60"
      )}
    >
      {/* ── Drag handle (hidden for locked stops) ─────────────────────────── */}
      <div
        className={cn(
          "flex-shrink-0 text-muted-foreground/30 transition-opacity",
          isLocked ? "opacity-0 pointer-events-none w-4" : "cursor-grab hover:text-muted-foreground active:cursor-grabbing"
        )}
        {...(!isLocked ? listeners : {})}
        {...(!isLocked ? attributes : {})}
      >
        <GripVerticalIcon className="h-4 w-4" />
      </div>

      {/* ── Stop number ──────────────────────────────────────────────────── */}
      <span
        className={cn(
          "flex-shrink-0 w-5 h-5 rounded-full text-[10px] font-bold flex items-center justify-center",
          isComplete || isHoliday
            ? "bg-muted text-muted-foreground"
            : isLocked
              ? "bg-amber-400/20 text-amber-400 ring-1 ring-amber-400/40"
              : isSelected
                ? "bg-primary text-primary-foreground"
                : "bg-muted/60 text-foreground"
        )}
      >
        {stop.sortIndex}
      </span>

      {/* ── Stop info ─────────────────────────────────────────────────────── */}
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-1.5">
          <p className={cn("font-medium truncate leading-snug", isComplete && "line-through decoration-muted-foreground/40")}>
            {stop.customerName}
          </p>
          {(stop.overdueBalance ?? 0) > 0 && (
            <span className="inline-flex shrink-0 items-center rounded-full bg-red-500/15 border border-red-500/30 px-1.5 py-0 text-[9px] font-medium text-red-400 leading-relaxed">
              Overdue
            </span>
          )}
          {isWorkOrder && (
            <span className="inline-flex shrink-0 items-center gap-0.5 rounded-full bg-amber-500/15 border border-amber-500/30 px-1.5 py-0 text-[9px] font-medium text-amber-300 leading-relaxed">
              <WrenchIcon className="h-2.5 w-2.5" />
              WO
            </span>
          )}
        </div>
        {isWorkOrder && stop.workOrderTitle && (
          <p className="text-xs font-medium text-amber-300/70 truncate leading-snug">
            {stop.workOrderTitle}
          </p>
        )}
        <p className="text-xs text-muted-foreground truncate leading-snug">
          {stop.poolName}
          {stop.address && (
            <span className="text-muted-foreground/60"> &middot; {stop.address}</span>
          )}
        </p>
      </div>

      {/* ── Status badge ─────────────────────────────────────────────────── */}
      {StatusIcon && (
        <StatusIcon
          className={cn(
            "h-4 w-4 flex-shrink-0",
            stop.status === "complete" ? "text-green-500" : "text-muted-foreground"
          )}
        />
      )}
      {isHoliday && (
        <span className="flex-shrink-0 text-[10px] font-medium text-muted-foreground bg-muted rounded px-1.5 py-0.5">
          Holiday
        </span>
      )}

      {/* ── Lock toggle ──────────────────────────────────────────────────── */}
      <StopLockToggle
        stopId={stop.id}
        locked={isLocked}
        onToggle={onToggleLock}
        className="flex-shrink-0"
      />

      {/* ── Actions menu ──────────────────────────────────────────────────── */}
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <button
            type="button"
            onClick={(e) => e.stopPropagation()}
            aria-label={`Actions for ${stop.customerName}`}
            className="flex-shrink-0 flex h-6 w-6 items-center justify-center rounded text-muted-foreground/40 hover:text-foreground hover:bg-muted transition-colors opacity-0 group-hover:opacity-100 focus:opacity-100 cursor-pointer"
          >
            <MoreVerticalIcon className="h-3.5 w-3.5" />
          </button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-44">
          {stop.status === "skipped" ? (
            <DropdownMenuItem
              onClick={() => onUnskipStop?.(stop.id)}
              className="gap-2 text-xs cursor-pointer"
            >
              <UndoIcon className="h-3.5 w-3.5" />
              Unskip
            </DropdownMenuItem>
          ) : stop.status === "scheduled" ? (
            <DropdownMenuItem
              onClick={() => onSkipStop?.(stop.id)}
              className="gap-2 text-xs cursor-pointer"
            >
              <SkipForwardIcon className="h-3.5 w-3.5" />
              Skip this stop
            </DropdownMenuItem>
          ) : null}
          {stop.status !== "complete" && (
            <DropdownMenuItem
              onClick={() => onMoveStop?.(stop.id)}
              className="gap-2 text-xs cursor-pointer"
            >
              <ArrowRightLeftIcon className="h-3.5 w-3.5" />
              Move to...
            </DropdownMenuItem>
          )}
          <DropdownMenuSeparator />
          <DropdownMenuItem
            onClick={() => onRemoveStop(stop.id)}
            className="gap-2 text-xs text-destructive focus:text-destructive cursor-pointer"
          >
            <XIcon className="h-3.5 w-3.5" />
            Remove from route
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  )
}

// ─── RouteStopList ────────────────────────────────────────────────────────────

interface RouteStopListProps {
  stops: ScheduleStop[]
  onReorder: (newOrder: ScheduleStop[]) => void
  onToggleLock: (stopId: string) => void
  onRemoveStop: (stopId: string) => void
  onSkipStop?: (stopId: string) => void
  onUnskipStop?: (stopId: string) => void
  onMoveStop?: (stopId: string) => void
  onSelectStop?: (stopId: string) => void
  selectedStopId?: string
}

/**
 * RouteStopList — sortable stop list for the route builder.
 *
 * Uses @dnd-kit/sortable with Phase 3 sensor pattern:
 * - TouchSensor: 250ms delay + 5px tolerance (prevents scroll conflict)
 * - MouseSensor: 10px distance (desktop fallback)
 * - KeyboardSensor: accessibility
 *
 * Locked stops:
 * - Cannot be dragged (no drag handle, not in sortable IDs)
 * - Displayed in their position but protected from reorder
 *
 * On drag end:
 * - Computes new order via arrayMove
 * - Rejects moves that would displace a locked stop
 * - Calls onReorder with updated stops
 * - Persists to server via updateStopOrder
 */
export function RouteStopList({
  stops,
  onReorder,
  onToggleLock,
  onRemoveStop,
  onSkipStop,
  onUnskipStop,
  onMoveStop,
  onSelectStop,
  selectedStopId,
}: RouteStopListProps) {
  const sensors = useSensors(
    useSensor(TouchSensor, {
      activationConstraint: { delay: 250, tolerance: 5 },
    }),
    useSensor(MouseSensor, {
      activationConstraint: { distance: 10 },
    }),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    })
  )

  const handleDragEnd = useCallback(
    async (event: DragEndEvent) => {
      const { active, over } = event
      if (!over || active.id === over.id) return

      const activeStop = stops.find((s) => s.id === active.id)
      const overStop = stops.find((s) => s.id === over.id)

      // Never allow dragging onto a locked stop position
      if (overStop?.positionLocked) return
      // Never allow dragging a locked stop
      if (activeStop?.positionLocked) return

      const oldIndex = stops.findIndex((s) => s.id === active.id)
      const newIndex = stops.findIndex((s) => s.id === over.id)

      if (oldIndex === -1 || newIndex === -1) return

      const reordered = arrayMove(stops, oldIndex, newIndex).map((s, idx) => ({
        ...s,
        sortIndex: idx + 1,
      }))

      // Optimistic update
      onReorder(reordered)

      // Persist to server
      await updateStopOrder(
        reordered.map((s) => ({ id: s.id, sortIndex: s.sortIndex }))
      )
    },
    [stops, onReorder]
  )

  // Empty state
  if (stops.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center gap-3 rounded-lg border border-dashed border-border/60 p-10 text-center">
        <div className="flex h-10 w-10 items-center justify-center rounded-full bg-muted">
          <MapPinIcon className="h-5 w-5 text-muted-foreground" />
        </div>
        <div>
          <p className="text-sm font-medium">No stops scheduled</p>
          <p className="text-xs text-muted-foreground mt-1">
            No stops for this technician on this day. Stops are generated from
            schedule rules.
          </p>
        </div>
      </div>
    )
  }

  // Only unlocked stops participate in sortable context
  const sortableIds = stops.filter((s) => !s.positionLocked).map((s) => s.id)

  return (
    <DndContext
      sensors={sensors}
      collisionDetection={closestCenter}
      onDragEnd={handleDragEnd}
    >
      <SortableContext items={sortableIds} strategy={verticalListSortingStrategy}>
        <div
          className="flex flex-col gap-1.5"
          role="list"
          aria-label="Route stops"
        >
          {stops.map((stop) => (
            <SortableStopRow
              key={stop.id}
              stop={stop}
              isLocked={stop.positionLocked}
              onToggleLock={onToggleLock}
              onRemoveStop={onRemoveStop}
              onSkipStop={onSkipStop}
              onUnskipStop={onUnskipStop}
              onMoveStop={onMoveStop}
              onSelectStop={onSelectStop}
              isSelected={stop.id === selectedStopId}
            />
          ))}
        </div>
      </SortableContext>
    </DndContext>
  )
}
