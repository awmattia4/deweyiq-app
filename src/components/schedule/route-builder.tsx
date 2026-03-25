"use client"

import { useState, useCallback, useTransition, useEffect, useRef } from "react"
import { toLocalDateString } from "@/lib/date-utils"
import {
  DndContext,
  DragOverlay,
  closestCenter,
  TouchSensor,
  MouseSensor,
  KeyboardSensor,
  useSensor,
  useSensors,
  type DragStartEvent,
  type DragOverEvent,
  type DragEndEvent,
  type UniqueIdentifier,
} from "@dnd-kit/core"
import {
  SortableContext,
  verticalListSortingStrategy,
  sortableKeyboardCoordinates,
  arrayMove,
} from "@dnd-kit/sortable"
import {
  Loader2Icon,
  CopyIcon,
  PanelLeftIcon,
  PanelLeftCloseIcon,
  Wand2Icon,
} from "lucide-react"
import { toast } from "sonner"
import { TechDaySelector } from "./tech-day-selector"
import { RouteStopList } from "./route-stop-list"
import { RouteMap, type ScheduleStop, type HomeBase } from "./route-map"
import { UnassignedPanel } from "./unassigned-panel"
import { CopyRouteDialog } from "./copy-route-dialog"
import { OptimizePreview } from "./optimize-preview"
import {
  getStopsForDay,
  getUnassignedCustomers,
  getApprovedWorkOrders,
  removeStopFromRoute,
  bulkAssignStops,
  assignWorkOrderToRoute,
  skipStop,
  unskipStop,
  type UnassignedCustomer,
  type UnassignedWorkOrder,
} from "@/actions/schedule"
import { MoveStopDialog } from "./move-stop-dialog"
import { optimizeRoute, type OptimizationResult } from "@/actions/optimize"
import { setDailyTruckOverride, removeDailyTruckOverride, getDailyOverridesForDate, getTrucks } from "@/actions/trucks"
import type { TruckRow } from "@/actions/trucks"
import { Button } from "@/components/ui/button"
import { cn } from "@/lib/utils"

// ─── Day-of-week helpers ───────────────────────────────────────────────────────

/**
 * Convert a Mon-indexed day number (0=Mon … 4=Fri) to a YYYY-MM-DD string
 * for the corresponding day in the given week (offset from current week).
 */
function dayIndexToDate(dayIndex: number, weekOffset: number = 0): string {
  const today = new Date()
  const jsDay = today.getDay() // 0=Sun, 1=Mon ... 6=Sat
  const daysFromMonday = jsDay === 0 ? -6 : 1 - jsDay
  const monday = new Date(today)
  monday.setDate(today.getDate() + daysFromMonday + weekOffset * 7)
  monday.setHours(0, 0, 0, 0)

  const target = new Date(monday)
  target.setDate(monday.getDate() + dayIndex)
  return toLocalDateString(target)
}

/** Get today's Mon-indexed day (0-4). Weekends clamp to 4 (Friday). */
function getTodayDayIndex(): number {
  const jsDay = new Date().getDay()
  if (jsDay === 0) return 4
  if (jsDay === 6) return 4
  return jsDay - 1
}

// ─── Container IDs for multi-container DnD ───────────────────────────────────

const UNASSIGNED_CONTAINER = "unassigned"
const STOPS_CONTAINER = "stops"

// ─── Types ────────────────────────────────────────────────────────────────────

interface Tech {
  id: string
  name: string
}

interface RouteBuilderProps {
  techs: Tech[]
  initialTechId: string
  initialStops: ScheduleStop[]
  initialUnassigned?: UnassignedCustomer[]
  homeBase?: HomeBase | null
}

// ─── Server stop → ScheduleStop mapper ────────────────────────────────────────

type ServerStop = Awaited<ReturnType<typeof getStopsForDay>>[number]

function mapToScheduleStop(s: ServerStop): ScheduleStop {
  return {
    id: s.id,
    customerName: s.customerName,
    address: s.address,
    poolName: s.poolName ?? "",
    sortIndex: s.sortIndex,
    positionLocked: s.positionLocked,
    status: s.status,
    lat: s.lat,
    lng: s.lng,
    workOrderId: s.workOrderId ?? null,
    workOrderTitle: s.workOrderTitle ?? null,
    overdueBalance: s.overdueBalance ?? null,
  }
}

// ─── DragGhost — ghost card for DragOverlay ──────────────────────────────────

function DragGhost({
  id,
  stops,
  unassigned,
}: {
  id: UniqueIdentifier
  stops: ScheduleStop[]
  unassigned: UnassignedCustomer[]
}) {
  const stop = stops.find((s) => s.id === id)
  if (stop) {
    return (
      <div className="flex items-center gap-2 rounded-md border border-primary/40 bg-card px-2.5 py-2 text-sm shadow-xl shadow-black/50 opacity-90 max-w-[280px]">
        <span className="flex h-5 w-5 items-center justify-center rounded-full bg-primary/20 text-[10px] font-bold text-primary">
          {stop.sortIndex}
        </span>
        <div className="min-w-0">
          <p className="font-medium truncate">{stop.customerName}</p>
          {stop.poolName && (
            <p className="text-xs text-muted-foreground truncate">{stop.poolName}</p>
          )}
        </div>
      </div>
    )
  }

  const customer = unassigned.find((c) => c.id === id)
  if (customer) {
    return (
      <div className="flex items-center gap-2 rounded-md border border-primary/40 bg-card px-2.5 py-2 text-sm shadow-xl shadow-black/50 opacity-90 max-w-[280px]">
        <div className="min-w-0">
          <p className="text-xs font-medium truncate">{customer.name}</p>
          {customer.address && (
            <p className="text-[11px] text-muted-foreground/60 truncate">{customer.address}</p>
          )}
        </div>
      </div>
    )
  }

  return null
}

// ─── RouteBuilder ─────────────────────────────────────────────────────────────

/**
 * RouteBuilder — split-view route builder with multi-container DnD.
 *
 * Layout (locked decisions from CONTEXT.md):
 * - Tech tabs + day picker at the top (TechDaySelector)
 * - Three-column layout on desktop: Unassigned Panel | Stop List | Route Map
 * - Two-column on tablet: (Unassigned + Stop list) | Map
 * - Stacked on mobile: unassigned panel (collapsible) | stop list | map
 *
 * Multi-container DnD (Pattern 2 from RESEARCH.md):
 * - Single DndContext wraps both UnassignedPanel and RouteStopList
 * - Dragging FROM unassigned → stops: creates a route_stop at drop position
 * - Dragging WITHIN stops: reorders (existing plan 03-04 behavior)
 * - Cannot drag FROM stops → unassigned (use Remove button instead)
 *
 * State management:
 * - stops: from server, updated optimistically on reorder/lock/remove/assign
 * - unassigned: from server, updated optimistically on assign
 * - activeId: tracks what's being dragged for DragOverlay and container detection
 */
export function RouteBuilder({
  techs,
  initialTechId,
  initialStops,
  initialUnassigned = [],
  homeBase,
}: RouteBuilderProps) {
  const [selectedTechId, setSelectedTechId] = useState(initialTechId)
  const [selectedDay, setSelectedDay] = useState(getTodayDayIndex())
  const [weekOffset, setWeekOffset] = useState(0)
  const [stops, setStops] = useState<ScheduleStop[]>(initialStops)
  const [unassigned, setUnassigned] = useState<UnassignedCustomer[]>(initialUnassigned)
  const [approvedWOs, setApprovedWOs] = useState<UnassignedWorkOrder[]>([])

  // Load approved WOs on mount
  useEffect(() => {
    getApprovedWorkOrders().then(setApprovedWOs)
  }, [])
  const [selectedStopId, setSelectedStopId] = useState<string | undefined>()
  const [selectedUnassignedIds, setSelectedUnassignedIds] = useState<Set<string>>(new Set())
  const [isPending, startTransition] = useTransition()
  const [isAssigning, setIsAssigning] = useState(false)
  const [showUnassigned, setShowUnassigned] = useState(true)
  const [showCopyDialog, setShowCopyDialog] = useState(false)

  // Optimization state
  const [isOptimizing, setIsOptimizing] = useState(false)
  const [optimizationResult, setOptimizationResult] = useState<OptimizationResult | null>(null)
  const [showOptimizePreview, setShowOptimizePreview] = useState(false)
  const [isApplyingOptimization, setIsApplyingOptimization] = useState(false)

  // Move dialog state
  const [moveStopId, setMoveStopId] = useState<string | null>(null)
  const [moveStopName, setMoveStopName] = useState("")

  // Multi-container DnD state
  const [activeId, setActiveId] = useState<UniqueIdentifier | null>(null)

  // Truck override state
  const [truckOverrideOpen, setTruckOverrideOpen] = useState(false)
  const [allTrucks, setAllTrucks] = useState<TruckRow[]>([])
  const [dailyOverrides, setDailyOverrides] = useState<Map<string, { truckId: string | null; truckName: string | null }>>(new Map())
  const truckDropdownRef = useRef<HTMLDivElement>(null)

  // Load trucks + daily overrides when date changes
  useEffect(() => {
    const dateStr = dayIndexToDate(selectedDay, weekOffset)
    Promise.all([
      getTrucks(),
      getDailyOverridesForDate(dateStr),
    ]).then(([trucksResult, overrides]) => {
      if (trucksResult.success) setAllTrucks(trucksResult.trucks)
      const map = new Map<string, { truckId: string | null; truckName: string | null }>()
      for (const o of overrides) {
        map.set(o.techId, { truckId: o.truckId, truckName: o.truckName })
      }
      setDailyOverrides(map)
    })
  }, [selectedDay, weekOffset])

  // Close truck dropdown on outside click
  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (truckDropdownRef.current && !truckDropdownRef.current.contains(e.target as Node)) {
        setTruckOverrideOpen(false)
      }
    }
    document.addEventListener("mousedown", handleClick)
    return () => document.removeEventListener("mousedown", handleClick)
  }, [])

  // Get the effective truck for the selected tech on the current date
  const selectedTechOverride = dailyOverrides.get(selectedTechId)
  const selectedTechTruck = selectedTechOverride !== undefined
    ? (selectedTechOverride.truckName ?? "Solo")
    : (currentTech?.name.includes("·") ? currentTech.name.split("·")[1]?.trim() : null)

  async function handleTruckOverride(truckId: string | null) {
    const dateStr = dayIndexToDate(selectedDay, weekOffset)
    if (truckId === "__reset__") {
      await removeDailyTruckOverride(selectedTechId, dateStr)
      toast.success("Truck override removed — back to default")
    } else {
      await setDailyTruckOverride(selectedTechId, dateStr, truckId)
      toast.success(truckId === null ? "Set to solo for today" : "Truck overridden for today")
    }
    setTruckOverrideOpen(false)
    // Refresh overrides
    const overrides = await getDailyOverridesForDate(dateStr)
    const map = new Map<string, { truckId: string | null; truckName: string | null }>()
    for (const o of overrides) {
      map.set(o.techId, { truckId: o.truckId, truckName: o.truckName })
    }
    setDailyOverrides(map)
  }

  // DnD sensors — same as Phase 3 pattern
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

  // ── Current date string ──────────────────────────────────────────────────────

  const currentDate = dayIndexToDate(selectedDay, weekOffset)
  const currentTech = techs.find((t) => t.id === selectedTechId)

  // ── Container detection ──────────────────────────────────────────────────────

  function getContainer(id: UniqueIdentifier): string | null {
    if (stops.some((s) => s.id === id)) return STOPS_CONTAINER
    if (unassigned.some((c) => c.id === id)) return UNASSIGNED_CONTAINER
    return null
  }

  // ── Data fetching ────────────────────────────────────────────────────────────

  const fetchAll = useCallback((techId: string, dayIndex: number, wOffset: number = 0) => {
    const dateStr = dayIndexToDate(dayIndex, wOffset)
    startTransition(async () => {
      const [newStops, newUnassigned, newWOs] = await Promise.all([
        getStopsForDay(techId, dateStr),
        getUnassignedCustomers(techId, dateStr),
        getApprovedWorkOrders(),
      ])

      setStops(newStops.map(mapToScheduleStop))
      setUnassigned(newUnassigned)
      setApprovedWOs(newWOs)
      setSelectedStopId(undefined)
      setSelectedUnassignedIds(new Set())
    })
  }, [])

  const handleTechChange = useCallback(
    (techId: string) => {
      setSelectedTechId(techId)
      fetchAll(techId, selectedDay, weekOffset)
    },
    [selectedDay, weekOffset, fetchAll]
  )

  const handleDayChange = useCallback(
    (day: number) => {
      setSelectedDay(day)
      fetchAll(selectedTechId, day, weekOffset)
    },
    [selectedTechId, weekOffset, fetchAll]
  )

  const handleWeekChange = useCallback(
    (offset: number) => {
      setWeekOffset(offset)
      fetchAll(selectedTechId, selectedDay, offset)
    },
    [selectedTechId, selectedDay, fetchAll]
  )

  // ── Assignment ───────────────────────────────────────────────────────────────

  const handleAssign = useCallback(
    async (pairs: Array<{ customerId: string; poolId: string }>) => {
      if (isAssigning || pairs.length === 0) return
      setIsAssigning(true)

      try {
        const result = await bulkAssignStops(pairs, selectedTechId, currentDate)

        if (result.success) {
          // Optimistically remove assigned pools from unassigned list
          const assignedPoolKeys = new Set(
            pairs.map((p) => `${p.customerId}:${p.poolId}`)
          )
          setUnassigned((current) =>
            current
              .map((c) => ({
                ...c,
                pools: c.pools.filter(
                  (p) => !assignedPoolKeys.has(`${c.id}:${p.id}`)
                ),
              }))
              // Remove customer if no unassigned pools remain
              .filter((c) => c.pools.length > 0 || (c.poolCount === 0 && !assignedPoolKeys.has(`${c.id}:`)))
          )
          setSelectedUnassignedIds(new Set())

          // Refresh the stop list (server assigned order)
          const newStops = await getStopsForDay(selectedTechId, currentDate)
          setStops(newStops.map(mapToScheduleStop))

          toast.success(`Assigned ${result.count} stop${result.count !== 1 ? "s" : ""}`)
        } else {
          toast.error(result.error ?? "Failed to assign stops")
        }
      } catch {
        toast.error("Failed to assign stops")
      } finally {
        setIsAssigning(false)
      }
    },
    [selectedTechId, currentDate, isAssigning]
  )

  const handleToggleUnassignedSelect = useCallback((key: string) => {
    setSelectedUnassignedIds((current) => {
      const next = new Set(current)
      if (next.has(key)) {
        next.delete(key)
      } else {
        next.add(key)
      }
      return next
    })
  }, [])

  // ── Work order assignment ──────────────────────────────────────────────────

  const handleAssignWorkOrder = useCallback(
    async (workOrderId: string) => {
      if (isAssigning) return
      setIsAssigning(true)

      try {
        const result = await assignWorkOrderToRoute(workOrderId, selectedTechId, currentDate)

        if (result.success) {
          // Refresh everything
          const [newStops, newUnassigned, newWOs] = await Promise.all([
            getStopsForDay(selectedTechId, currentDate),
            getUnassignedCustomers(selectedTechId, currentDate),
            getApprovedWorkOrders(),
          ])
          setStops(newStops.map(mapToScheduleStop))
          setUnassigned(newUnassigned)
          setApprovedWOs(newWOs)
          toast.success("Work order scheduled")
        } else {
          toast.error(result.error ?? "Failed to schedule work order")
        }
      } catch {
        toast.error("Failed to schedule work order")
      } finally {
        setIsAssigning(false)
      }
    },
    [selectedTechId, currentDate, isAssigning]
  )

  // ── Stop list handlers ───────────────────────────────────────────────────────

  const handleReorder = useCallback((newOrder: ScheduleStop[]) => {
    setStops(newOrder)
  }, [])

  const handleToggleLock = useCallback((stopId: string) => {
    setStops((current) =>
      current.map((s) =>
        s.id === stopId ? { ...s, positionLocked: !s.positionLocked } : s
      )
    )
  }, [])

  const handleRemoveStop = useCallback(
    async (stopId: string) => {
      // Optimistic remove
      const removedStop = stops.find((s) => s.id === stopId)
      setStops((current) =>
        current
          .filter((s) => s.id !== stopId)
          .map((s, idx) => ({ ...s, sortIndex: idx + 1 }))
      )
      if (selectedStopId === stopId) setSelectedStopId(undefined)

      await removeStopFromRoute(stopId)

      // Refresh unassigned list + approved WOs (removing a WO stop reverts it)
      if (removedStop) {
        const [newUnassigned, newWOs] = await Promise.all([
          getUnassignedCustomers(selectedTechId, currentDate),
          removedStop.workOrderId ? getApprovedWorkOrders() : Promise.resolve(approvedWOs),
        ])
        setUnassigned(newUnassigned)
        setApprovedWOs(newWOs)
      }
    },
    [stops, selectedStopId, selectedTechId, currentDate, approvedWOs]
  )

  const handleSelectStop = useCallback((stopId: string) => {
    setSelectedStopId((current) => (current === stopId ? undefined : stopId))
  }, [])

  const handleSkipStop = useCallback(
    async (stopId: string) => {
      // Optimistic update
      setStops((current) =>
        current.map((s) => (s.id === stopId ? { ...s, status: "skipped" } : s))
      )

      const result = await skipStop(stopId)
      if (result.success) {
        toast.success("Stop skipped")
      } else {
        toast.error(result.error ?? "Failed to skip stop")
        fetchAll(selectedTechId, selectedDay, weekOffset)
      }
    },
    [fetchAll, selectedTechId, selectedDay, weekOffset]
  )

  const handleUnskipStop = useCallback(
    async (stopId: string) => {
      // Optimistic update
      setStops((current) =>
        current.map((s) => (s.id === stopId ? { ...s, status: "scheduled" } : s))
      )

      const result = await unskipStop(stopId)
      if (result.success) {
        toast.success("Stop restored")
      } else {
        toast.error(result.error ?? "Failed to restore stop")
        fetchAll(selectedTechId, selectedDay, weekOffset)
      }
    },
    [fetchAll, selectedTechId, selectedDay, weekOffset]
  )

  const handleMoveStop = useCallback(
    (stopId: string) => {
      const stop = stops.find((s) => s.id === stopId)
      setMoveStopId(stopId)
      setMoveStopName(stop?.customerName ?? "")
    },
    [stops]
  )

  const handleMoveComplete = useCallback(() => {
    setMoveStopId(null)
    fetchAll(selectedTechId, selectedDay, weekOffset)
  }, [fetchAll, selectedTechId, selectedDay, weekOffset])

  // ── Multi-container DnD handlers ─────────────────────────────────────────────

  function handleDragStart(event: DragStartEvent) {
    setActiveId(event.active.id)
  }

  function handleDragOver(event: DragOverEvent) {
    const { active, over } = event
    if (!over) return

    const activeContainer = getContainer(active.id)
    const overContainer = getContainer(over.id) ?? over.id

    // Only handle cross-container moves (unassigned → stops)
    if (activeContainer === overContainer || activeContainer !== UNASSIGNED_CONTAINER) return

    // Move customer from unassigned temporarily to stops for visual feedback
    const draggedCustomer = unassigned.find((c) => c.id === active.id)
    if (!draggedCustomer) return

    const overIndex = stops.findIndex((s) => s.id === over.id)
    const insertAt = overIndex >= 0 ? overIndex : stops.length

    // Create a temporary stop entry for the dragged customer (first pool only)
    const tempStop: ScheduleStop = {
      id: String(active.id),
      customerName: draggedCustomer.name,
      address: draggedCustomer.address,
      poolName: draggedCustomer.pools[0]?.name ?? "",
      sortIndex: insertAt + 1,
      positionLocked: false,
      status: "scheduled",
      lat: null,
      lng: null,
    }

    setStops((current) => {
      const filtered = current.filter((s) => s.id !== active.id)
      const newStops = [...filtered]
      newStops.splice(insertAt, 0, tempStop)
      return newStops.map((s, i) => ({ ...s, sortIndex: i + 1 }))
    })
    setUnassigned((current) => current.filter((c) => c.id !== active.id))
  }

  async function handleDragEnd(event: DragEndEvent) {
    const { active, over } = event
    setActiveId(null)

    if (!over) {
      // Drag cancelled — revert to server state
      fetchAll(selectedTechId, selectedDay, weekOffset)
      return
    }

    const wasInUnassigned = unassigned.some((c) => c.id === active.id)
    const activeContainer = getContainer(active.id)
    const overContainer = getContainer(over.id) ?? over.id

    // ── Cross-container: unassigned → stops ─────────────────────────────────
    if (activeContainer !== overContainer || stops.some((s) => s.id === active.id && !wasInUnassigned)) {
      // The temp stop was already inserted by handleDragOver. Now persist it.
      const draggedCustomer = initialUnassigned.find((c) => c.id === active.id) ||
        // Customer was removed from unassigned by onDragOver; find from name in stops
        null

      // Assign: create stops for ALL unassigned pools of this customer
      const tempStopIndex = stops.findIndex((s) => s.id === active.id)
      if (tempStopIndex >= 0) {
        setIsAssigning(true)
        try {
          const pairs = draggedCustomer
            ? draggedCustomer.pools.length > 0
              ? draggedCustomer.pools.map((p) => ({ customerId: String(active.id), poolId: p.id }))
              : [{ customerId: String(active.id), poolId: "" }]
            : [{ customerId: String(active.id), poolId: "" }]

          // Use bulkAssignStops for ALL pools (not just the first)
          await bulkAssignStops(pairs, selectedTechId, currentDate)

          // Refresh both lists from server
          const [newStops, newUnassigned] = await Promise.all([
            getStopsForDay(selectedTechId, currentDate),
            getUnassignedCustomers(selectedTechId, currentDate),
          ])

          setStops(newStops.map(mapToScheduleStop))
          setUnassigned(newUnassigned)
          const poolLabel = pairs.length === 1 ? "stop" : "stops"
          toast.success(`Assigned ${pairs.length} ${poolLabel}`)
        } catch {
          toast.error("Failed to assign stop — please try again")
          fetchAll(selectedTechId, selectedDay, weekOffset)
        } finally {
          setIsAssigning(false)
        }
      }
      return
    }

    // ── Same-container: reorder within stops ─────────────────────────────────
    if (activeContainer === STOPS_CONTAINER && overContainer === STOPS_CONTAINER) {
      const activeStop = stops.find((s) => s.id === active.id)
      const overStop = stops.find((s) => s.id === over.id)

      if (!activeStop || !overStop) return
      if (activeStop.positionLocked || overStop.positionLocked) return

      const oldIndex = stops.indexOf(activeStop)
      const newIndex = stops.indexOf(overStop)
      if (oldIndex === newIndex) return

      const reordered = arrayMove(stops, oldIndex, newIndex).map((s, idx) => ({
        ...s,
        sortIndex: idx + 1,
      }))

      setStops(reordered)

      const { updateStopOrder } = await import("@/actions/schedule")
      await updateStopOrder(reordered.map((s) => ({ id: s.id, sortIndex: s.sortIndex })))
    }
  }

  // ── Copy route handler ───────────────────────────────────────────────────────

  const handleCopyComplete = useCallback(() => {
    fetchAll(selectedTechId, selectedDay, weekOffset)
  }, [fetchAll, selectedTechId, selectedDay])

  // ── Optimize route handler ───────────────────────────────────────────────────

  const handleOptimize = useCallback(async () => {
    if (isOptimizing || stops.length === 0) return

    setIsOptimizing(true)
    try {
      const result = await optimizeRoute(selectedTechId, currentDate)

      if (result.success) {
        setOptimizationResult(result)
        setShowOptimizePreview(true)
      } else {
        toast.error(result.error ?? "Optimization failed — please try again")
      }
    } catch {
      toast.error("An error occurred during optimization")
    } finally {
      setIsOptimizing(false)
    }
  }, [isOptimizing, stops.length, selectedTechId, currentDate])

  const handleOptimizationApplied = useCallback(() => {
    setShowOptimizePreview(false)
    setOptimizationResult(null)
    fetchAll(selectedTechId, selectedDay, weekOffset)
  }, [fetchAll, selectedTechId, selectedDay])

  // ── Render ───────────────────────────────────────────────────────────────────

  const stopIds = stops.map((s) => s.id)
  const unassignedIds = unassigned.map((c) => c.id)

  return (
    <div className="flex flex-col gap-3 h-full">
      {/* ── Toolbar ────────────────────────────────────────────────────────── */}
      <div className="flex items-center gap-3 flex-wrap">
        <div className="flex-1 min-w-0">
          <TechDaySelector
            techs={techs}
            selectedTechId={selectedTechId}
            selectedDay={selectedDay}
            weekOffset={weekOffset}
            onTechChange={handleTechChange}
            onDayChange={handleDayChange}
            onWeekChange={handleWeekChange}
          />

          {/* Truck override — shows when trucks exist */}
          {allTrucks.length > 0 && (
            <div className="flex items-center gap-2 mt-1 relative" ref={truckDropdownRef}>
              <span className="text-xs text-muted-foreground">
                Truck today:{" "}
                <span className="font-medium text-foreground">
                  {selectedTechOverride !== undefined
                    ? (selectedTechOverride.truckId === null ? "Solo" : selectedTechOverride.truckName ?? "Unknown")
                    : (selectedTechTruck ?? "Not assigned")}
                </span>
                {selectedTechOverride !== undefined && (
                  <span className="text-amber-400 ml-1 text-[10px]">override</span>
                )}
              </span>
              <button
                onClick={() => setTruckOverrideOpen(!truckOverrideOpen)}
                className="text-[11px] text-primary hover:underline cursor-pointer"
              >
                Change
              </button>

              {truckOverrideOpen && (
                <div className="absolute left-0 top-full mt-1 z-50 rounded-md border border-border bg-popover shadow-lg py-1 min-w-[180px]">
                  <button
                    onClick={() => handleTruckOverride(null)}
                    className="w-full px-3 py-1.5 text-left text-sm hover:bg-muted/50 transition-colors"
                  >
                    Solo (no sharing)
                  </button>
                  {allTrucks.filter((t) => t.is_active).map((truck) => (
                    <button
                      key={truck.id}
                      onClick={() => handleTruckOverride(truck.id)}
                      className="w-full px-3 py-1.5 text-left text-sm hover:bg-muted/50 transition-colors"
                    >
                      {truck.name}
                      {truck.assignedTechs.length > 0 && (
                        <span className="text-xs text-muted-foreground ml-1.5">
                          ({truck.assignedTechs.map((t) => t.fullName).join(", ")})
                        </span>
                      )}
                    </button>
                  ))}
                  {selectedTechOverride !== undefined && (
                    <>
                      <div className="border-t border-border my-1" />
                      <button
                        onClick={() => handleTruckOverride("__reset__")}
                        className="w-full px-3 py-1.5 text-left text-xs text-muted-foreground hover:bg-muted/50 transition-colors"
                      >
                        Reset to default
                      </button>
                    </>
                  )}
                </div>
              )}
            </div>
          )}
        </div>
        <div className="flex items-center gap-2 flex-shrink-0">
          {/* Toggle unassigned panel */}
          <Button
            variant="ghost"
            size="sm"
            onClick={() => setShowUnassigned((v) => !v)}
            title={showUnassigned ? "Hide unassigned panel" : "Show unassigned panel"}
            className="hidden sm:flex gap-1.5"
          >
            {showUnassigned ? (
              <PanelLeftCloseIcon className="h-4 w-4" />
            ) : (
              <PanelLeftIcon className="h-4 w-4" />
            )}
            <span className="hidden md:inline">
              {showUnassigned ? "Hide" : "Unassigned"}
              {!showUnassigned && unassigned.length > 0 && (
                <span className="ml-1 rounded-full bg-muted px-1.5 py-0.5 text-[10px] font-medium">
                  {unassigned.length}
                </span>
              )}
            </span>
          </Button>

          {/* Copy route button */}
          <Button
            variant="outline"
            size="sm"
            onClick={() => setShowCopyDialog(true)}
            disabled={stops.length === 0}
            className="gap-1.5"
          >
            <CopyIcon className="h-4 w-4" />
            <span className="hidden sm:inline">Copy Route</span>
          </Button>

          {/* Optimize route button */}
          <Button
            variant="outline"
            size="sm"
            onClick={handleOptimize}
            disabled={
              isOptimizing ||
              stops.length === 0 ||
              stops.every((s) => s.positionLocked)
            }
            className="gap-1.5"
            title={
              stops.every((s) => s.positionLocked)
                ? "All stops are locked — unlock at least one to optimize"
                : "Optimize route to minimize drive time"
            }
          >
            {isOptimizing ? (
              <Loader2Icon className="h-4 w-4 animate-spin" />
            ) : (
              <Wand2Icon className="h-4 w-4" />
            )}
            <span className="hidden sm:inline">
              {isOptimizing ? "Optimizing…" : "Optimize Route"}
            </span>
          </Button>
        </div>
      </div>

      {/* ── Loading indicator ──────────────────────────────────────────────── */}
      {isPending && (
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <Loader2Icon className="h-4 w-4 animate-spin" />
          Loading&hellip;
        </div>
      )}

      {/* ── Main DnD context wrapping all containers ──────────────────────── */}
      <DndContext
        sensors={sensors}
        collisionDetection={closestCenter}
        onDragStart={handleDragStart}
        onDragOver={handleDragOver}
        onDragEnd={handleDragEnd}
      >
        <div className="flex flex-col lg:flex-row gap-3 flex-1 min-h-0">
          {/* ── Unassigned panel (left sidebar on desktop) ─────────────────── */}
          {showUnassigned && (
            <div className="lg:w-[220px] xl:w-[260px] flex-shrink-0 rounded-lg border border-border overflow-hidden max-h-[340px] lg:max-h-none">
              <SortableContext items={unassignedIds} strategy={verticalListSortingStrategy}>
                <UnassignedPanel
                  customers={unassigned}
                  workOrders={approvedWOs}
                  selectedIds={selectedUnassignedIds}
                  onToggleSelect={handleToggleUnassignedSelect}
                  onAssign={handleAssign}
                  onAssignWorkOrder={handleAssignWorkOrder}
                  isOver={false}
                  isAssigning={isAssigning}
                />
              </SortableContext>
            </div>
          )}

          {/* ── Center: stop list ──────────────────────────────────────────── */}
          <div className="flex flex-col gap-2 min-h-0 overflow-y-auto lg:flex-1 lg:min-w-0 lg:max-w-xs xl:max-w-sm">
            <div className="flex items-center justify-between flex-shrink-0">
              <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
                {stops.length} stop{stops.length !== 1 ? "s" : ""}
              </p>
              {stops.some((s) => s.positionLocked) && (
                <p className="text-xs text-amber-400">
                  {stops.filter((s) => s.positionLocked).length} locked
                </p>
              )}
            </div>
            <SortableContext items={stopIds} strategy={verticalListSortingStrategy}>
              <RouteStopList
                stops={stops}
                onReorder={handleReorder}
                onToggleLock={handleToggleLock}
                onRemoveStop={handleRemoveStop}
                onSkipStop={handleSkipStop}
                onUnskipStop={handleUnskipStop}
                onMoveStop={handleMoveStop}
                onSelectStop={handleSelectStop}
                selectedStopId={selectedStopId}
              />
            </SortableContext>
          </div>

          {/* ── Right: route map ───────────────────────────────────────────── */}
          <div className="flex-1 min-h-[300px] lg:min-h-0">
            <RouteMap
              stops={stops}
              selectedStopId={selectedStopId}
              onSelectStop={handleSelectStop}
              homeBase={homeBase}
              className="h-full min-h-[300px] lg:min-h-[500px]"
            />
          </div>
        </div>

        {/* ── DragOverlay — ghost of dragged item ───────────────────────── */}
        <DragOverlay>
          {activeId ? (
            <DragGhost id={activeId} stops={stops} unassigned={unassigned} />
          ) : null}
        </DragOverlay>
      </DndContext>

      {/* ── Copy Route dialog ──────────────────────────────────────────────── */}
      {currentTech && (
        <CopyRouteDialog
          open={showCopyDialog}
          onOpenChange={setShowCopyDialog}
          sourceTechId={selectedTechId}
          sourceTechName={currentTech.name}
          sourceDate={currentDate}
          sourceStopCount={stops.length}
          techs={techs}
          onCopyComplete={handleCopyComplete}
        />
      )}

      {/* ── Optimize Preview dialog ─────────────────────────────────────────── */}
      {optimizationResult && (
        <OptimizePreview
          open={showOptimizePreview}
          onOpenChange={(open) => {
            setShowOptimizePreview(open)
            if (!open) setOptimizationResult(null)
          }}
          result={optimizationResult}
          techId={selectedTechId}
          date={currentDate}
          onApplied={handleOptimizationApplied}
          isApplying={isApplyingOptimization}
          onApplyingChange={setIsApplyingOptimization}
        />
      )}

      {/* ── Move Stop dialog ───────────────────────────────────────────────── */}
      {moveStopId && (
        <MoveStopDialog
          open={!!moveStopId}
          onOpenChange={(open) => {
            if (!open) setMoveStopId(null)
          }}
          stopId={moveStopId}
          customerName={moveStopName}
          currentTechId={selectedTechId}
          currentDate={currentDate}
          techs={techs}
          onMoveComplete={handleMoveComplete}
        />
      )}
    </div>
  )
}
