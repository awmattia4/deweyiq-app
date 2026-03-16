"use client"

/**
 * EmployeeSchedule — Employee availability windows + blocked dates editor.
 *
 * Owner view:
 *   - Select employee from dropdown
 *   - 7-day availability grid: toggle day on/off, set start/end time
 *   - Blocked dates section: add/remove specific unavailable dates with reasons
 *   - Save availability button
 *
 * Office view:
 *   - Same as owner but read-only (no edit)
 *
 * (Tech can only see PTO tab, not schedule tab — enforced by parent page)
 */

import { useState, useTransition } from "react"
import {
  getAvailability,
  updateAvailability,
  addBlockedDate,
  removeBlockedDate,
  type AvailabilityWindow,
  type BlockedDate,
} from "@/actions/team-management"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { Switch } from "@/components/ui/switch"

// ─── Constants ────────────────────────────────────────────────────────────────

const DAYS = [
  { label: "Sunday", value: 0 },
  { label: "Monday", value: 1 },
  { label: "Tuesday", value: 2 },
  { label: "Wednesday", value: 3 },
  { label: "Thursday", value: 4 },
  { label: "Friday", value: 5 },
  { label: "Saturday", value: 6 },
]

const DEFAULT_START = "07:00"
const DEFAULT_END = "17:00"

// ─── Types ────────────────────────────────────────────────────────────────────

interface TeamMember {
  id: string
  full_name: string
  role: string
}

interface Props {
  teamMembers: TeamMember[]
  userRole: string
}

interface DayState {
  enabled: boolean
  startTime: string
  endTime: string
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function buildDayState(windows: AvailabilityWindow[]): Record<number, DayState> {
  const state: Record<number, DayState> = {}
  for (let day = 0; day <= 6; day++) {
    const win = windows.find((w) => w.day_of_week === day)
    state[day] = win
      ? { enabled: true, startTime: win.start_time, endTime: win.end_time }
      : { enabled: false, startTime: DEFAULT_START, endTime: DEFAULT_END }
  }
  return state
}

function formatBlockedDate(date: string): string {
  return new Date(date + "T12:00:00").toLocaleDateString("en-US", {
    weekday: "short",
    month: "short",
    day: "numeric",
    year: "numeric",
  })
}

// ─── Main component ───────────────────────────────────────────────────────────

export function EmployeeSchedule({ teamMembers, userRole }: Props) {
  const isOwner = userRole === "owner"

  // Eligible employees: techs only (scheduling applies to field staff)
  const eligibleMembers = teamMembers.filter((m) => ["tech", "owner"].includes(m.role))

  const [selectedTechId, setSelectedTechId] = useState<string>(eligibleMembers[0]?.id ?? "")
  const [dayState, setDayState] = useState<Record<number, DayState>>(buildDayState([]))
  const [blockedDates, setBlockedDates] = useState<BlockedDate[]>([])
  const [loaded, setLoaded] = useState(false)
  const [loading, setLoading] = useState(false)
  const [saveSuccess, setSaveSuccess] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [isPending, startTransition] = useTransition()

  // Blocked date form
  const [newDate, setNewDate] = useState("")
  const [newReason, setNewReason] = useState("")
  const [addingDate, setAddingDate] = useState(false)

  async function loadTechData(techId: string) {
    setLoading(true)
    setLoaded(false)
    setError(null)
    setSaveSuccess(false)
    try {
      const { windows, blockedDates: dates } = await getAvailability(techId)
      setDayState(buildDayState(windows))
      setBlockedDates(dates)
      setLoaded(true)
    } catch {
      setError("Failed to load availability data")
    } finally {
      setLoading(false)
    }
  }

  function handleTechChange(techId: string) {
    setSelectedTechId(techId)
    setLoaded(false)
    loadTechData(techId)
  }

  function toggleDay(day: number, enabled: boolean) {
    setDayState((prev) => ({
      ...prev,
      [day]: { ...prev[day], enabled },
    }))
  }

  function updateTime(day: number, field: "startTime" | "endTime", value: string) {
    setDayState((prev) => ({
      ...prev,
      [day]: { ...prev[day], [field]: value },
    }))
  }

  function handleSaveAvailability() {
    setError(null)
    setSaveSuccess(false)
    startTransition(async () => {
      const windows = Object.entries(dayState)
        .filter(([, state]) => state.enabled)
        .map(([day, state]) => ({
          dayOfWeek: parseInt(day),
          startTime: state.startTime,
          endTime: state.endTime,
        }))

      const result = await updateAvailability(selectedTechId, windows)
      if (result.success) {
        setSaveSuccess(true)
        setTimeout(() => setSaveSuccess(false), 3000)
      } else {
        setError(result.error ?? "Failed to save availability")
      }
    })
  }

  function handleAddBlockedDate() {
    if (!newDate) { setError("Select a date to block"); return }
    setError(null)
    setAddingDate(true)
    startTransition(async () => {
      const result = await addBlockedDate(selectedTechId, newDate, newReason)
      if (result.success) {
        // Refresh the blocked dates
        const { blockedDates: fresh } = await getAvailability(selectedTechId)
        setBlockedDates(fresh)
        setNewDate("")
        setNewReason("")
      } else {
        setError(result.error ?? "Failed to add blocked date")
      }
      setAddingDate(false)
    })
  }

  function handleRemoveBlockedDate(id: string) {
    startTransition(async () => {
      await removeBlockedDate(id)
      const { blockedDates: fresh } = await getAvailability(selectedTechId)
      setBlockedDates(fresh)
    })
  }

  if (eligibleMembers.length === 0) {
    return (
      <p className="text-sm text-muted-foreground italic">
        No team members to configure yet.
      </p>
    )
  }

  return (
    <div className="flex flex-col gap-6">
      {/* ── Employee selector ────────────────────────────────────────────────── */}
      <div className="flex flex-col gap-2">
        <Label>Employee</Label>
        <div className="flex items-center gap-3">
          <Select value={selectedTechId} onValueChange={handleTechChange}>
            <SelectTrigger className="w-64">
              <SelectValue placeholder="Select employee" />
            </SelectTrigger>
            <SelectContent>
              {eligibleMembers.map((m) => (
                <SelectItem key={m.id} value={m.id}>
                  {m.full_name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>

          {!loaded && !loading && (
            <Button
              size="sm"
              variant="outline"
              onClick={() => loadTechData(selectedTechId)}
              disabled={!selectedTechId}
            >
              Load Schedule
            </Button>
          )}
        </div>
      </div>

      {loading && (
        <p className="text-sm text-muted-foreground">Loading schedule...</p>
      )}

      {error && (
        <p className="text-sm text-destructive" role="alert">{error}</p>
      )}

      {loaded && (
        <>
          {/* ── Weekly availability grid ─────────────────────────────────────── */}
          <div className="flex flex-col gap-3">
            <h2 className="text-base font-semibold">Weekly Availability</h2>
            <p className="text-sm text-muted-foreground">
              Set the days and hours this employee is available for scheduling.
              {!isOwner && " Contact your owner to update availability."}
            </p>

            <div className="rounded-xl border border-border overflow-hidden">
              <div className="divide-y divide-border">
                {DAYS.map(({ label, value: day }) => {
                  const ds = dayState[day]
                  return (
                    <div
                      key={day}
                      className="flex items-center gap-4 px-4 py-3"
                    >
                      {/* Day toggle */}
                      <div className="w-28 flex items-center gap-3">
                        {isOwner && (
                          <Switch
                            checked={ds?.enabled ?? false}
                            onCheckedChange={(v) => toggleDay(day, v)}
                            disabled={isPending}
                          />
                        )}
                        <span
                          className={`text-sm font-medium ${
                            ds?.enabled ? "" : "text-muted-foreground"
                          }`}
                        >
                          {label}
                        </span>
                      </div>

                      {/* Time inputs */}
                      {ds?.enabled ? (
                        <div className="flex items-center gap-2">
                          <Input
                            type="time"
                            value={ds.startTime}
                            onChange={(e) => updateTime(day, "startTime", e.target.value)}
                            disabled={!isOwner || isPending}
                            className="h-8 w-32 text-sm"
                          />
                          <span className="text-muted-foreground text-sm">to</span>
                          <Input
                            type="time"
                            value={ds.endTime}
                            onChange={(e) => updateTime(day, "endTime", e.target.value)}
                            disabled={!isOwner || isPending}
                            className="h-8 w-32 text-sm"
                          />
                        </div>
                      ) : (
                        <span className="text-sm text-muted-foreground italic">Off</span>
                      )}
                    </div>
                  )
                })}
              </div>
            </div>

            {isOwner && (
              <div className="flex items-center gap-3">
                <Button
                  size="sm"
                  onClick={handleSaveAvailability}
                  disabled={isPending}
                >
                  {isPending ? "Saving..." : "Save Availability"}
                </Button>
                {saveSuccess && (
                  <p className="text-sm text-emerald-500 font-medium">Saved</p>
                )}
              </div>
            )}
          </div>

          {/* ── Blocked dates ─────────────────────────────────────────────────── */}
          <div className="flex flex-col gap-3">
            <h2 className="text-base font-semibold">Blocked Dates</h2>
            <p className="text-sm text-muted-foreground">
              Specific dates when this employee is unavailable (appointments, events, etc.)
            </p>

            {blockedDates.length === 0 ? (
              <p className="text-sm text-muted-foreground italic">No blocked dates.</p>
            ) : (
              <div className="rounded-xl border border-border overflow-hidden">
                <div className="divide-y divide-border">
                  {blockedDates.map((bd) => (
                    <div
                      key={bd.id}
                      className="flex items-center gap-4 px-4 py-3 hover:bg-muted/20 transition-colors"
                    >
                      <div className="flex flex-1 flex-col gap-0.5">
                        <span className="text-sm font-medium">
                          {formatBlockedDate(bd.blocked_date)}
                        </span>
                        {bd.reason && (
                          <span className="text-xs text-muted-foreground">{bd.reason}</span>
                        )}
                      </div>

                      {isOwner && (
                        <Button
                          size="sm"
                          variant="outline"
                          className="text-xs border-red-500/30 text-red-400 hover:bg-red-500/10 h-7 px-2"
                          onClick={() => handleRemoveBlockedDate(bd.id)}
                          disabled={isPending}
                        >
                          Remove
                        </Button>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Add blocked date form (owner only) */}
            {isOwner && (
              <div className="flex items-end gap-3 flex-wrap">
                <div className="flex flex-col gap-1.5">
                  <Label htmlFor="blocked-date">Date</Label>
                  <Input
                    id="blocked-date"
                    type="date"
                    value={newDate}
                    onChange={(e) => setNewDate(e.target.value)}
                    className="w-44"
                  />
                </div>
                <div className="flex flex-col gap-1.5">
                  <Label htmlFor="blocked-reason">Reason (optional)</Label>
                  <Input
                    id="blocked-reason"
                    value={newReason}
                    onChange={(e) => setNewReason(e.target.value)}
                    placeholder="Doctor appointment, etc."
                    className="w-56"
                  />
                </div>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={handleAddBlockedDate}
                  disabled={isPending || addingDate || !newDate}
                >
                  {addingDate ? "Adding..." : "Block Date"}
                </Button>
              </div>
            )}
          </div>
        </>
      )}
    </div>
  )
}
