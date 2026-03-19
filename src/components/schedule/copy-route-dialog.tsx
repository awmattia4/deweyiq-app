"use client"

import { useState } from "react"
import { CopyIcon, CalendarIcon, UserIcon } from "lucide-react"
import { toast } from "sonner"
import { cn } from "@/lib/utils"
import { toLocalDateString } from "@/lib/date-utils"
import { copyRoute } from "@/actions/schedule"
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

interface CopyRouteDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  sourceTechId: string
  sourceTechName: string
  sourceDate: string
  sourceStopCount: number
  techs: Tech[]
  onCopyComplete: () => void
}

// ─── Day helpers ──────────────────────────────────────────────────────────────

const DAY_LABELS = ["Mon", "Tue", "Wed", "Thu", "Fri"] as const

/**
 * Given a target day (0=Mon–4=Fri) and the source date (YYYY-MM-DD),
 * compute a date string for the same week as the source date.
 * If the source date is also Mon-Fri, keep the same week; otherwise use current week.
 */
function getDateForWeekday(targetDay: number, referenceDate: string): string {
  const ref = new Date(referenceDate + "T00:00:00")
  // Find the Monday of the reference week
  const refDow = ref.getDay() // 0=Sun, 1=Mon,...
  const daysToMonday = refDow === 0 ? -6 : 1 - refDow
  const monday = new Date(ref)
  monday.setDate(ref.getDate() + daysToMonday)

  // Add targetDay (0=Mon through 4=Fri)
  const targetDate = new Date(monday)
  targetDate.setDate(monday.getDate() + targetDay)
  return toLocalDateString(targetDate)
}

/** Parse YYYY-MM-DD into a readable string like "Monday, Mar 8" */
function formatDate(dateStr: string): string {
  const d = new Date(dateStr + "T00:00:00")
  return d.toLocaleDateString("en-US", { weekday: "long", month: "short", day: "numeric" })
}

// ─── CopyRouteDialog ─────────────────────────────────────────────────────────

/**
 * CopyRouteDialog — dialog for duplicating an entire day's route to another tech+day.
 *
 * Workflow:
 * 1. Shows source tech + date info
 * 2. User picks target tech (dropdown)
 * 3. User picks target day (Mon-Fri buttons) — defaults to same day
 * 4. User clicks "Copy" — calls copyRoute server action
 * 5. Shows success toast with copied stop count
 */
export function CopyRouteDialog({
  open,
  onOpenChange,
  sourceTechId,
  sourceTechName,
  sourceDate,
  sourceStopCount,
  techs,
  onCopyComplete,
}: CopyRouteDialogProps) {
  const [targetTechId, setTargetTechId] = useState(sourceTechId)
  const [targetDay, setTargetDay] = useState<number>(() => {
    // Default to same day of week as source
    const d = new Date(sourceDate + "T00:00:00")
    const dow = d.getDay() // 0=Sun, 1=Mon,...
    return dow === 0 || dow === 6 ? 0 : dow - 1 // Map to 0-4 (Mon-Fri)
  })
  const [isCopying, setIsCopying] = useState(false)

  const targetDate = getDateForWeekday(targetDay, sourceDate)

  async function handleCopy() {
    if (isCopying) return
    setIsCopying(true)

    try {
      const result = await copyRoute(sourceTechId, sourceDate, targetTechId, targetDate)

      if (result.success) {
        const targetTech = techs.find((t) => t.id === targetTechId)
        toast.success(
          `Copied ${result.count} stop${result.count !== 1 ? "s" : ""} to ${targetTech?.name ?? "selected tech"} on ${formatDate(targetDate)}`
        )
        onOpenChange(false)
        onCopyComplete()
      } else {
        toast.error(result.error ?? "Failed to copy route")
      }
    } catch {
      toast.error("An unexpected error occurred")
    } finally {
      setIsCopying(false)
    }
  }

  // Don't allow copying to the exact same tech+date
  const isSameRoute = targetTechId === sourceTechId && targetDate === sourceDate

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <CopyIcon className="h-4 w-4 text-muted-foreground" />
            Copy Route
          </DialogTitle>
        </DialogHeader>

        <div className="flex flex-col gap-4 py-2">
          {/* Source info */}
          <div className="rounded-md border border-border/60 bg-muted/20 px-3 py-2.5 text-sm">
            <p className="text-muted-foreground text-xs font-medium uppercase tracking-wider mb-1">
              Copying from
            </p>
            <p className="font-medium">
              {sourceTechName}&rsquo;s route — {formatDate(sourceDate)}
            </p>
            <p className="text-xs text-muted-foreground mt-0.5">
              {sourceStopCount} stop{sourceStopCount !== 1 ? "s" : ""}
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

          {/* Target day selector */}
          <div className="flex flex-col gap-1.5">
            <label className="text-sm font-medium flex items-center gap-1.5">
              <CalendarIcon className="h-3.5 w-3.5 text-muted-foreground" />
              Target Day
            </label>
            <div className="grid grid-cols-5 gap-1">
              {DAY_LABELS.map((label, idx) => (
                <button
                  key={label}
                  type="button"
                  onClick={() => setTargetDay(idx)}
                  className={cn(
                    "rounded py-1.5 text-xs font-medium transition-colors cursor-pointer",
                    idx === targetDay
                      ? "bg-primary text-primary-foreground"
                      : "bg-muted/50 text-muted-foreground hover:bg-muted"
                  )}
                >
                  {label}
                </button>
              ))}
            </div>
            <p className="text-xs text-muted-foreground">
              Copying to: {formatDate(targetDate)}
            </p>
          </div>

          {/* Same-route warning */}
          {isSameRoute && (
            <p className="text-xs text-amber-400 flex items-center gap-1.5 bg-amber-400/10 rounded px-3 py-2">
              Choose a different technician or day to copy to.
            </p>
          )}
        </div>

        <DialogFooter>
          <Button
            variant="outline"
            onClick={() => onOpenChange(false)}
            disabled={isCopying}
          >
            Cancel
          </Button>
          <Button
            onClick={handleCopy}
            disabled={isCopying || isSameRoute || sourceStopCount === 0}
          >
            {isCopying ? "Copying..." : `Copy ${sourceStopCount} Stop${sourceStopCount !== 1 ? "s" : ""}`}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
