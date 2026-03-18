"use client"

import { useState } from "react"
import { ArrowRightLeftIcon, CalendarIcon, UserIcon } from "lucide-react"
import { toast } from "sonner"
import { cn } from "@/lib/utils"
import { toLocalDateString } from "@/lib/date-utils"
import { moveStop } from "@/actions/schedule"
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog"
import { Button } from "@/components/ui/button"

// ─── Types ────────────────────────────────────────────────────────────────────

interface Tech {
  id: string
  name: string
}

interface MoveStopDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  stopId: string
  customerName: string
  currentTechId: string
  currentDate: string
  techs: Tech[]
  onMoveComplete: () => void
}

// ─── Day helpers ──────────────────────────────────────────────────────────────

const DAY_LABELS = ["Mon", "Tue", "Wed", "Thu", "Fri"] as const

function getMondayOfWeek(referenceDate: string, weekOffset: number): Date {
  const ref = new Date(referenceDate + "T00:00:00")
  const refDow = ref.getDay()
  const daysToMonday = refDow === 0 ? -6 : 1 - refDow
  const monday = new Date(ref)
  monday.setDate(ref.getDate() + daysToMonday + weekOffset * 7)
  monday.setHours(0, 0, 0, 0)
  return monday
}

function getDateForWeekday(targetDay: number, referenceDate: string, weekOffset: number): string {
  const monday = getMondayOfWeek(referenceDate, weekOffset)
  const target = new Date(monday)
  target.setDate(monday.getDate() + targetDay)
  return toLocalDateString(target)
}

function formatDate(dateStr: string): string {
  const d = new Date(dateStr + "T00:00:00")
  return d.toLocaleDateString("en-US", { weekday: "long", month: "short", day: "numeric" })
}

function formatShortDate(date: Date): string {
  return date.toLocaleDateString("en-US", { month: "short", day: "numeric" })
}

function getCurrentDayIndex(dateStr: string): number {
  const d = new Date(dateStr + "T00:00:00")
  const dow = d.getDay()
  return dow === 0 || dow === 6 ? 0 : dow - 1
}

// ─── MoveStopDialog ───────────────────────────────────────────────────────────

export function MoveStopDialog({
  open,
  onOpenChange,
  stopId,
  customerName,
  currentTechId,
  currentDate,
  techs,
  onMoveComplete,
}: MoveStopDialogProps) {
  const [targetTechId, setTargetTechId] = useState(currentTechId)
  const [targetDay, setTargetDay] = useState(getCurrentDayIndex(currentDate))
  const [weekOffset, setWeekOffset] = useState(0)
  const [isMoving, setIsMoving] = useState(false)

  const targetDate = getDateForWeekday(targetDay, currentDate, weekOffset)
  const isSameRoute = targetTechId === currentTechId && targetDate === currentDate
  const targetTech = techs.find((t) => t.id === targetTechId)

  async function handleMove() {
    if (isMoving || isSameRoute) return
    setIsMoving(true)

    try {
      const result = await moveStop(stopId, targetTechId, targetDate)

      if (result.success) {
        toast.success(
          `Moved ${customerName} to ${targetTech?.name ?? "selected tech"} on ${formatDate(targetDate)}`
        )
        onOpenChange(false)
        onMoveComplete()
      } else {
        toast.error(result.error ?? "Failed to move stop")
      }
    } catch {
      toast.error("An unexpected error occurred")
    } finally {
      setIsMoving(false)
    }
  }

  const monday = getMondayOfWeek(currentDate, weekOffset)

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <ArrowRightLeftIcon className="h-4 w-4 text-muted-foreground" />
            Move Stop
          </DialogTitle>
        </DialogHeader>

        <div className="flex flex-col gap-4 py-2">
          {/* Source info */}
          <div className="rounded-md border border-border/60 bg-muted/20 px-3 py-2.5 text-sm">
            <p className="text-muted-foreground text-xs font-medium uppercase tracking-wider mb-1">
              Moving
            </p>
            <p className="font-medium">{customerName}</p>
            <p className="text-xs text-muted-foreground mt-0.5">
              Currently on {formatDate(currentDate)}
            </p>
          </div>

          {/* Target tech selector */}
          <div className="flex flex-col gap-1.5">
            <label className="text-sm font-medium flex items-center gap-1.5">
              <UserIcon className="h-3.5 w-3.5 text-muted-foreground" />
              Target Technician
            </label>
            <select
              value={targetTechId}
              onChange={(e) => setTargetTechId(e.target.value)}
              className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-primary/40 cursor-pointer"
            >
              {techs.map((tech) => (
                <option key={tech.id} value={tech.id}>
                  {tech.name}
                </option>
              ))}
            </select>
          </div>

          {/* Target day selector with week navigation */}
          <div className="flex flex-col gap-1.5">
            <label className="text-sm font-medium flex items-center gap-1.5">
              <CalendarIcon className="h-3.5 w-3.5 text-muted-foreground" />
              Target Day
            </label>

            {/* Week navigation */}
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => setWeekOffset((w) => w - 1)}
                className="text-xs text-muted-foreground hover:text-foreground transition-colors cursor-pointer"
              >
                &lsaquo; Prev
              </button>
              <span className="flex-1 text-center text-xs text-muted-foreground">
                {weekOffset === 0
                  ? "This week"
                  : weekOffset === 1
                    ? "Next week"
                    : weekOffset === -1
                      ? "Last week"
                      : `Week of ${formatShortDate(monday)}`}
              </span>
              <button
                type="button"
                onClick={() => setWeekOffset((w) => w + 1)}
                className="text-xs text-muted-foreground hover:text-foreground transition-colors cursor-pointer"
              >
                Next &rsaquo;
              </button>
            </div>

            <div className="grid grid-cols-5 gap-1">
              {DAY_LABELS.map((label, idx) => {
                const dayDate = new Date(monday)
                dayDate.setDate(monday.getDate() + idx)
                return (
                  <button
                    key={label}
                    type="button"
                    onClick={() => setTargetDay(idx)}
                    className={cn(
                      "rounded py-1.5 text-xs font-medium transition-colors cursor-pointer flex flex-col items-center gap-0.5",
                      idx === targetDay
                        ? "bg-primary text-primary-foreground"
                        : "bg-muted/50 text-muted-foreground hover:bg-muted"
                    )}
                  >
                    <span>{label}</span>
                    <span className="text-[10px] opacity-80">{formatShortDate(dayDate)}</span>
                  </button>
                )
              })}
            </div>

            <p className="text-xs text-muted-foreground">
              Moving to: {formatDate(targetDate)}
            </p>
          </div>

          {/* Same-route warning */}
          {isSameRoute && (
            <p className="text-xs text-amber-400 flex items-center gap-1.5 bg-amber-400/10 rounded px-3 py-2">
              Choose a different technician or day to move to.
            </p>
          )}
        </div>

        <DialogFooter>
          <Button
            variant="outline"
            onClick={() => onOpenChange(false)}
            disabled={isMoving}
          >
            Cancel
          </Button>
          <Button
            onClick={handleMove}
            disabled={isMoving || isSameRoute}
          >
            {isMoving ? "Moving..." : "Move Stop"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
