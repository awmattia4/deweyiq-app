"use client"

import { useState, useTransition, useCallback } from "react"
import { toast } from "sonner"
import { ChevronLeftIcon, ChevronRightIcon, CheckCircleIcon, Loader2Icon } from "lucide-react"
import { Button } from "@/components/ui/button"
import { cn } from "@/lib/utils"
import {
  getTimesheets,
  approveTimesheet,
  editTimeEntry,
  pushWeekToQbo,
  type TimesheetWeekResult,
  type TechWeeklyTimesheet,
  type DailyEntryRow,
} from "@/actions/timesheets"

// ─── Constants ─────────────────────────────────────────────────────────────────

const DAY_LABELS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"] as const

// ─── Helpers ───────────────────────────────────────────────────────────────────

function fmtHours(minutes: number): string {
  const h = Math.floor(minutes / 60)
  const m = minutes % 60
  if (h === 0 && m === 0) return "—"
  if (m === 0) return `${h}h`
  return `${h}h ${m}m`
}

/**
 * Get the Monday of the current week as YYYY-MM-DD.
 * Uses local date arithmetic (never toISOString per MEMORY.md).
 */
function getCurrentWeekMonday(): string {
  const today = new Date()
  const jsDay = today.getDay() // 0=Sun, 1=Mon, ...
  const daysFromMonday = jsDay === 0 ? -6 : 1 - jsDay
  const monday = new Date(today)
  monday.setDate(today.getDate() + daysFromMonday)
  return toLocalYMD(monday)
}

function toLocalYMD(d: Date): string {
  const pad = (n: number) => String(n).padStart(2, "0")
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
}

function addDays(dateStr: string, days: number): string {
  const d = new Date(dateStr + "T00:00:00")
  d.setDate(d.getDate() + days)
  return toLocalYMD(d)
}

function formatWeekRange(weekStart: string, weekEnd: string): string {
  const start = new Date(weekStart + "T00:00:00")
  const end = new Date(weekEnd + "T00:00:00")
  const opts: Intl.DateTimeFormatOptions = { month: "short", day: "numeric" }
  return `${start.toLocaleDateString("en-US", opts)} – ${end.toLocaleDateString("en-US", { ...opts, year: "numeric" })}`
}

// ─── Types ─────────────────────────────────────────────────────────────────────

interface TimesheetViewProps {
  /** Initial timesheet data from server */
  initialData: TimesheetWeekResult | null
}

// ─── Sub-component: Inline entry editor ────────────────────────────────────────

function EntryEditor({
  entry,
  onSaved,
}: {
  entry: DailyEntryRow
  onSaved: () => void
}) {
  const [isEditing, setIsEditing] = useState(false)
  const [isPending, startTransition] = useTransition()
  const [clockInStr, setClockInStr] = useState(
    entry.clockedInAt ? entry.clockedInAt.slice(0, 16) : ""
  )
  const [clockOutStr, setClockOutStr] = useState(
    entry.clockedOutAt ? entry.clockedOutAt.slice(0, 16) : ""
  )

  // Cannot edit already-synced entries
  if (entry.qboTimeActivityId) {
    return (
      <span className="text-xs text-emerald-400 flex items-center gap-1">
        <CheckCircleIcon className="h-3 w-3" />
        Synced
      </span>
    )
  }

  if (!isEditing) {
    const grossMin = entry.totalMinutes ?? 0
    const breakMin = entry.breakMinutes ?? 0
    const netMin = Math.max(0, grossMin - breakMin)
    return (
      <button
        type="button"
        onClick={() => setIsEditing(true)}
        className="text-xs text-muted-foreground hover:text-foreground underline-offset-2 hover:underline cursor-pointer"
        title="Click to edit clock times"
      >
        {fmtHours(netMin)}
      </button>
    )
  }

  function handleSave() {
    startTransition(async () => {
      const clockIn = clockInStr ? new Date(clockInStr) : undefined
      const clockOut = clockOutStr ? new Date(clockOutStr) : undefined

      if (clockIn && clockOut && clockIn >= clockOut) {
        toast.error("Clock-out must be after clock-in")
        return
      }

      const result = await editTimeEntry(entry.id, {
        clocked_in_at: clockIn,
        clocked_out_at: clockOut,
      })

      if (result.success) {
        toast.success("Entry updated")
        setIsEditing(false)
        onSaved()
      } else {
        toast.error(result.error ?? "Failed to update entry")
      }
    })
  }

  return (
    <div className="flex flex-col gap-1 min-w-[200px]">
      <label className="text-[10px] text-muted-foreground">Clock In</label>
      <input
        type="datetime-local"
        value={clockInStr}
        onChange={(e) => setClockInStr(e.target.value)}
        className="rounded border border-border bg-background text-xs px-1.5 py-1"
      />
      <label className="text-[10px] text-muted-foreground">Clock Out</label>
      <input
        type="datetime-local"
        value={clockOutStr}
        onChange={(e) => setClockOutStr(e.target.value)}
        className="rounded border border-border bg-background text-xs px-1.5 py-1"
      />
      <div className="flex gap-1 mt-1">
        <button
          type="button"
          onClick={handleSave}
          disabled={isPending}
          className="flex-1 text-[11px] bg-primary text-primary-foreground rounded px-2 py-1 font-medium hover:bg-primary/90 disabled:opacity-60 cursor-pointer"
        >
          {isPending ? "Saving…" : "Save"}
        </button>
        <button
          type="button"
          onClick={() => setIsEditing(false)}
          disabled={isPending}
          className="flex-1 text-[11px] bg-muted text-muted-foreground rounded px-2 py-1 hover:bg-muted/80 disabled:opacity-60 cursor-pointer"
        >
          Cancel
        </button>
      </div>
    </div>
  )
}

// ─── Sub-component: Tech row ────────────────────────────────────────────────────

function TechTimesheetRow({
  tech,
  weekStart,
  onRefresh,
}: {
  tech: TechWeeklyTimesheet
  weekStart: string
  onRefresh: () => void
}) {
  const [isApproving, setIsApproving] = useState(false)
  const [isPushing, setIsPushing] = useState(false)

  async function handleApprove() {
    setIsApproving(true)
    try {
      const result = await approveTimesheet(tech.techId, weekStart)
      if (result.success) {
        toast.success(`Approved ${tech.techName}'s timesheet`)
        onRefresh()
      } else {
        toast.error(result.error ?? "Failed to approve")
      }
    } catch {
      toast.error("Unexpected error approving timesheet")
    } finally {
      setIsApproving(false)
    }
  }

  async function handlePushToQbo() {
    setIsPushing(true)
    try {
      const result = await pushWeekToQbo(tech.techId, weekStart)
      if (result.pushed > 0) {
        toast.success(
          `Pushed ${result.pushed} entr${result.pushed === 1 ? "y" : "ies"} to QBO` +
          (result.failed > 0 ? ` (${result.failed} failed)` : "")
        )
      } else if (result.failed > 0) {
        toast.error(`${result.failed} entries failed to push`)
      } else {
        toast.info("No entries to push — all already synced or not yet approved")
      }
      onRefresh()
    } catch {
      toast.error("Unexpected error pushing to QBO")
    } finally {
      setIsPushing(false)
    }
  }

  const hasOvertimeHours = tech.overtimeHours > 0
  const totalNetHours = tech.totalNetMinutes / 60

  return (
    <div className="rounded-lg border border-border bg-card overflow-hidden">
      {/* ── Tech header ─────────────────────────────────────────────────── */}
      <div className="flex items-center justify-between gap-4 px-4 py-3 border-b border-border/60 bg-muted/20">
        <div className="flex items-center gap-3">
          <span className="text-sm font-semibold">{tech.techName}</span>
          {tech.isSynced ? (
            <span className="inline-flex items-center gap-1 text-[11px] font-medium text-emerald-400 bg-emerald-400/10 border border-emerald-400/20 rounded-full px-2 py-0.5">
              <CheckCircleIcon className="h-3 w-3" />
              QBO Synced
            </span>
          ) : tech.isApproved ? (
            <span className="inline-flex items-center gap-1 text-[11px] font-medium text-blue-400 bg-blue-400/10 border border-blue-400/20 rounded-full px-2 py-0.5">
              Approved
            </span>
          ) : (
            <span className="inline-flex text-[11px] font-medium text-amber-400 bg-amber-400/10 border border-amber-400/20 rounded-full px-2 py-0.5">
              Pending Review
            </span>
          )}
        </div>

        <div className="flex items-center gap-2">
          {!tech.isApproved && (
            <Button
              size="sm"
              variant="outline"
              onClick={handleApprove}
              disabled={isApproving || isPushing}
              className="h-7 text-xs"
            >
              {isApproving ? (
                <><Loader2Icon className="h-3 w-3 animate-spin mr-1" />Approving…</>
              ) : (
                "Approve Week"
              )}
            </Button>
          )}
          {tech.isApproved && !tech.isSynced && (
            <Button
              size="sm"
              variant="outline"
              onClick={handlePushToQbo}
              disabled={isPushing || isApproving}
              className="h-7 text-xs"
            >
              {isPushing ? (
                <><Loader2Icon className="h-3 w-3 animate-spin mr-1" />Pushing…</>
              ) : (
                "Push to QBO"
              )}
            </Button>
          )}
        </div>
      </div>

      {/* ── Daily breakdown table ────────────────────────────────────────── */}
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-border/40 text-xs text-muted-foreground">
              <th className="text-left px-4 py-2 font-medium w-32">Day</th>
              {DAY_LABELS.map((label) => (
                <th key={label} className="text-center px-2 py-2 font-medium w-20">
                  {label}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {/* Hours row */}
            <tr className="border-b border-border/30">
              <td className="px-4 py-2.5 text-xs text-muted-foreground">Net Hours</td>
              {tech.days.map((day) => {
                const netMin = day.netMinutes
                return (
                  <td key={day.date} className="px-2 py-2.5 text-center">
                    {day.entries.length > 0 ? (
                      day.entries.map((entry) => (
                        <EntryEditor
                          key={entry.id}
                          entry={entry}
                          onSaved={onRefresh}
                        />
                      ))
                    ) : (
                      <span className="text-xs text-muted-foreground/40">—</span>
                    )}
                  </td>
                )
              })}
            </tr>
            {/* Break row */}
            <tr className="border-b border-border/30">
              <td className="px-4 py-2.5 text-xs text-muted-foreground">Breaks</td>
              {tech.days.map((day) => (
                <td key={day.date} className="px-2 py-2.5 text-center text-xs text-muted-foreground/60">
                  {day.breakMinutes > 0 ? fmtHours(day.breakMinutes) : "—"}
                </td>
              ))}
            </tr>
          </tbody>
        </table>
      </div>

      {/* ── Weekly totals ──────────────────────────────────────────────────── */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-px border-t border-border/60 bg-border/20">
        <div className="bg-card px-4 py-3 text-center">
          <p className="text-[10px] text-muted-foreground uppercase tracking-wider mb-0.5">Regular</p>
          <p className="text-sm font-semibold">{tech.regularHours.toFixed(2)}h</p>
        </div>
        <div className={cn("bg-card px-4 py-3 text-center", hasOvertimeHours && "bg-amber-500/5")}>
          <p className={cn("text-[10px] uppercase tracking-wider mb-0.5", hasOvertimeHours ? "text-amber-400" : "text-muted-foreground")}>
            Overtime
          </p>
          <p className={cn("text-sm font-semibold", hasOvertimeHours && "text-amber-400")}>
            {tech.overtimeHours.toFixed(2)}h
          </p>
        </div>
        {tech.ptoHours > 0 && (
          <div className="bg-card px-4 py-3 text-center">
            <p className="text-[10px] text-muted-foreground uppercase tracking-wider mb-0.5">PTO</p>
            <p className="text-sm font-semibold">{tech.ptoHours.toFixed(2)}h</p>
          </div>
        )}
        <div className="bg-card px-4 py-3 text-center">
          <p className="text-[10px] text-muted-foreground uppercase tracking-wider mb-0.5">Total</p>
          <p className="text-sm font-semibold">{totalNetHours.toFixed(2)}h</p>
        </div>
      </div>
    </div>
  )
}

// ─── TimesheetView ─────────────────────────────────────────────────────────────

/**
 * TimesheetView — owner/office weekly timesheet review with approval and QBO push.
 *
 * Features:
 * - Week navigation (previous/next)
 * - Per-tech rows with Mon-Sun daily hours
 * - Inline clock-time editing (pre-sync only)
 * - Approve Week per employee
 * - Push to QBO per employee
 * - Overtime highlighted in amber
 * - QBO-synced entries show green checkmark
 */
export function TimesheetView({ initialData }: TimesheetViewProps) {
  const [weekStart, setWeekStart] = useState(
    initialData?.weekStart ?? getCurrentWeekMonday()
  )
  const [data, setData] = useState<TimesheetWeekResult | null>(initialData)
  const [isLoading, setIsLoading] = useState(false)

  const weekEnd = addDays(weekStart, 6)
  const weekLabel = formatWeekRange(weekStart, weekEnd)

  const fetchData = useCallback(async (ws: string) => {
    setIsLoading(true)
    try {
      const result = await getTimesheets(ws)
      if (result.success && result.data) {
        setData(result.data)
      } else {
        setData(null)
        if (result.error) toast.error(result.error)
      }
    } catch {
      toast.error("Failed to load timesheets")
    } finally {
      setIsLoading(false)
    }
  }, [])

  function goToPreviousWeek() {
    const newStart = addDays(weekStart, -7)
    setWeekStart(newStart)
    fetchData(newStart)
  }

  function goToNextWeek() {
    const newStart = addDays(weekStart, 7)
    setWeekStart(newStart)
    fetchData(newStart)
  }

  function handleRefresh() {
    fetchData(weekStart)
  }

  const techs = data?.techs ?? []
  const overtimeThreshold = data?.overtimeThresholdHours ?? 40

  return (
    <div className="flex flex-col gap-4">
      {/* ── Week navigator ──────────────────────────────────────────────────── */}
      <div className="flex items-center gap-3">
        <button
          type="button"
          onClick={goToPreviousWeek}
          disabled={isLoading}
          className="rounded-md p-1.5 text-muted-foreground hover:bg-muted hover:text-foreground transition-colors disabled:opacity-50 cursor-pointer"
          aria-label="Previous week"
        >
          <ChevronLeftIcon className="h-4 w-4" />
        </button>

        <div className="flex-1 text-center">
          <p className="text-sm font-medium">{weekLabel}</p>
          {overtimeThreshold !== 40 && (
            <p className="text-xs text-muted-foreground">
              Overtime after {overtimeThreshold}h/week
            </p>
          )}
        </div>

        <button
          type="button"
          onClick={goToNextWeek}
          disabled={isLoading}
          className="rounded-md p-1.5 text-muted-foreground hover:bg-muted hover:text-foreground transition-colors disabled:opacity-50 cursor-pointer"
          aria-label="Next week"
        >
          <ChevronRightIcon className="h-4 w-4" />
        </button>
      </div>

      {/* ── Loading state ────────────────────────────────────────────────────── */}
      {isLoading && (
        <div className="flex items-center justify-center gap-2 py-8 text-sm text-muted-foreground">
          <Loader2Icon className="h-4 w-4 animate-spin" />
          Loading timesheets…
        </div>
      )}

      {/* ── Empty state ───────────────────────────────────────────────────────── */}
      {!isLoading && techs.length === 0 && (
        <div className="rounded-lg border border-dashed border-border/60 px-6 py-10 text-center">
          <p className="text-sm text-muted-foreground italic">
            No time entries found for this week.
          </p>
          <p className="text-xs text-muted-foreground/60 mt-1">
            Techs need to be clocked in during this period for entries to appear here.
          </p>
        </div>
      )}

      {/* ── Tech rows ─────────────────────────────────────────────────────────── */}
      {!isLoading && techs.length > 0 && (
        <div className="flex flex-col gap-4">
          {techs.map((tech) => (
            <TechTimesheetRow
              key={tech.techId}
              tech={tech}
              weekStart={weekStart}
              onRefresh={handleRefresh}
            />
          ))}
        </div>
      )}
    </div>
  )
}
