"use client"

import { useState, useTransition } from "react"
import { toast } from "sonner"
import { PlusIcon, TrashIcon, ChevronDownIcon, ChevronUpIcon } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { createHoliday, deleteHoliday, type Holiday } from "@/actions/schedule"

// ─── US holiday suggestions ───────────────────────────────────────────────────

function getUsHolidaySuggestions(year: number) {
  return [
    { name: "New Year's Day", date: `${year}-01-01` },
    { name: "Memorial Day", date: getMemorialDay(year) },
    { name: "Independence Day", date: `${year}-07-04` },
    { name: "Labor Day", date: getLaborDay(year) },
    { name: "Thanksgiving", date: getThanksgiving(year) },
    { name: "Christmas Eve", date: `${year}-12-24` },
    { name: "Christmas Day", date: `${year}-12-25` },
    { name: "New Year's Eve", date: `${year}-12-31` },
  ]
}

/** Last Monday of May */
function getMemorialDay(year: number): string {
  const may31 = new Date(year, 4, 31)
  const dayOfWeek = may31.getDay()
  const lastMonday = new Date(may31)
  lastMonday.setDate(31 - ((dayOfWeek + 6) % 7))
  return lastMonday.toISOString().split("T")[0]
}

/** First Monday of September */
function getLaborDay(year: number): string {
  const sep1 = new Date(year, 8, 1)
  const dayOfWeek = sep1.getDay()
  const firstMonday = new Date(sep1)
  firstMonday.setDate(1 + ((8 - dayOfWeek) % 7))
  return firstMonday.toISOString().split("T")[0]
}

/** Fourth Thursday of November */
function getThanksgiving(year: number): string {
  const nov1 = new Date(year, 10, 1)
  const dayOfWeek = nov1.getDay() // 0=Sun, 4=Thu
  // First Thursday: 1 + ((4 - dayOfWeek + 7) % 7)
  const firstThursday = 1 + ((4 - dayOfWeek + 7) % 7)
  const fourthThursday = firstThursday + 21
  return new Date(year, 10, fourthThursday).toISOString().split("T")[0]
}

// ─── Types ────────────────────────────────────────────────────────────────────

interface HolidayCalendarProps {
  /** Holidays pre-fetched on the server */
  holidays: Holiday[]
}

// ─── Component ─────────────────────────────────────────────────────────────────

/**
 * HolidayCalendar — manage the company holiday calendar.
 *
 * Shows holidays for the current year (expandable to other years).
 * Includes a US holiday suggestion list and inline add form.
 * All mutations call server actions and optimistically update the list.
 */
export function HolidayCalendar({ holidays: initialHolidays }: HolidayCalendarProps) {
  const currentYear = new Date().getFullYear()
  const [selectedYear, setSelectedYear] = useState(currentYear)
  const [holidays, setHolidays] = useState<Holiday[]>(initialHolidays)
  const [isPending, startTransition] = useTransition()

  // Add form state
  const [showAddForm, setShowAddForm] = useState(false)
  const [newDate, setNewDate] = useState("")
  const [newName, setNewName] = useState("")
  const [addErrors, setAddErrors] = useState<{ date?: string; name?: string }>({})

  // Suggestions panel
  const [showSuggestions, setShowSuggestions] = useState(false)
  const [deletingId, setDeletingId] = useState<string | null>(null)
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null)

  // Filter displayed holidays to selected year
  const displayedHolidays = holidays
    .filter((h) => h.date.startsWith(String(selectedYear)))
    .sort((a, b) => a.date.localeCompare(b.date))

  const suggestions = getUsHolidaySuggestions(selectedYear)
  const existingDates = new Set(displayedHolidays.map((h) => h.date))

  // ─── Add holiday ───────────────────────────────────────────────────────────

  function validateAdd(): boolean {
    const errs: typeof addErrors = {}
    if (!newDate) errs.date = "Date is required"
    else if (!/^\d{4}-\d{2}-\d{2}$/.test(newDate)) errs.date = "Enter date as YYYY-MM-DD"
    else if (existingDates.has(newDate)) errs.date = "This date is already a holiday"
    if (!newName.trim()) errs.name = "Holiday name is required"
    setAddErrors(errs)
    return Object.keys(errs).length === 0
  }

  function handleAdd(e: React.FormEvent) {
    e.preventDefault()
    if (!validateAdd()) return

    startTransition(async () => {
      const result = await createHoliday({ date: newDate, name: newName.trim() })

      if (result.success) {
        // Optimistic update
        const newHoliday: Holiday = {
          id: `temp-${Date.now()}`,
          org_id: "",
          date: newDate,
          name: newName.trim(),
          created_at: new Date(),
        }
        setHolidays((prev) => [...prev, newHoliday])
        toast.success(`${newName} added to holiday calendar`)
        setNewDate("")
        setNewName("")
        setShowAddForm(false)
        setAddErrors({})
      } else {
        toast.error(result.error ?? "Failed to add holiday")
      }
    })
  }

  function handleAddSuggestion(suggestion: { name: string; date: string }) {
    startTransition(async () => {
      const result = await createHoliday({ date: suggestion.date, name: suggestion.name })

      if (result.success) {
        const newHoliday: Holiday = {
          id: `temp-${Date.now()}`,
          org_id: "",
          date: suggestion.date,
          name: suggestion.name,
          created_at: new Date(),
        }
        setHolidays((prev) => [...prev, newHoliday])
        toast.success(`${suggestion.name} added to holiday calendar`)
      } else {
        toast.error(result.error ?? "Failed to add holiday")
      }
    })
  }

  // ─── Delete holiday ────────────────────────────────────────────────────────

  function handleDelete(holidayId: string) {
    if (confirmDeleteId !== holidayId) {
      setConfirmDeleteId(holidayId)
      return
    }

    setDeletingId(holidayId)
    setConfirmDeleteId(null)
    startTransition(async () => {
      const result = await deleteHoliday(holidayId)

      if (result.success) {
        setHolidays((prev) => prev.filter((h) => h.id !== holidayId))
        toast.success("Holiday removed")
      } else {
        toast.error(result.error ?? "Failed to remove holiday")
      }
      setDeletingId(null)
    })
  }

  // ─── Render ────────────────────────────────────────────────────────────────

  function formatDate(dateStr: string): string {
    const [year, month, day] = dateStr.split("-").map(Number)
    return new Date(year, month - 1, day).toLocaleDateString("en-US", {
      weekday: "short",
      month: "short",
      day: "numeric",
    })
  }

  return (
    <div className="space-y-4">
      {/* Header row */}
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div className="flex items-center gap-2">
          <h3 className="text-sm font-semibold">Holiday Calendar</h3>
          {/* Year selector */}
          <select
            value={selectedYear}
            onChange={(e) => setSelectedYear(Number(e.target.value))}
            className="h-7 rounded border border-input bg-transparent px-2 text-xs focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
          >
            {[currentYear - 1, currentYear, currentYear + 1].map((y) => (
              <option key={y} value={y}>
                {y}
              </option>
            ))}
          </select>
        </div>

        <div className="flex items-center gap-2">
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="h-7 text-xs gap-1"
            onClick={() => setShowSuggestions((prev) => !prev)}
          >
            {showSuggestions ? <ChevronUpIcon className="h-3 w-3" /> : <ChevronDownIcon className="h-3 w-3" />}
            US Holidays
          </Button>
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="h-7 text-xs gap-1"
            onClick={() => setShowAddForm((prev) => !prev)}
          >
            <PlusIcon className="h-3 w-3" />
            Add Holiday
          </Button>
        </div>
      </div>

      {/* US holiday suggestions */}
      {showSuggestions && (
        <div className="rounded-md border border-border bg-muted/20 p-3 space-y-1">
          <p className="text-xs text-muted-foreground mb-2">
            Click a holiday to add it to your calendar:
          </p>
          <div className="flex flex-wrap gap-2">
            {suggestions
              .filter((s) => !existingDates.has(s.date))
              .map((suggestion) => (
                <button
                  key={suggestion.date}
                  type="button"
                  onClick={() => handleAddSuggestion(suggestion)}
                  disabled={isPending}
                  className="inline-flex items-center gap-1 rounded-full border border-border bg-background px-2.5 py-0.5 text-xs hover:bg-accent hover:text-accent-foreground transition-colors disabled:opacity-50 cursor-pointer"
                >
                  <PlusIcon className="h-2.5 w-2.5" />
                  {suggestion.name}
                </button>
              ))}
            {suggestions.filter((s) => !existingDates.has(s.date)).length === 0 && (
              <p className="text-xs text-muted-foreground">All US holidays already added for {selectedYear}.</p>
            )}
          </div>
        </div>
      )}

      {/* Add holiday form */}
      {showAddForm && (
        <form
          onSubmit={handleAdd}
          className="rounded-md border border-border bg-muted/20 p-3 grid sm:grid-cols-[1fr_1fr_auto] gap-3 items-end"
        >
          <div className="grid gap-1">
            <Label htmlFor="holiday-date" className="text-xs">
              Date
            </Label>
            <Input
              id="holiday-date"
              type="date"
              value={newDate}
              onChange={(e) => setNewDate(e.target.value)}
              className="h-8 text-sm"
            />
            {addErrors.date && (
              <p className="text-xs text-destructive">{addErrors.date}</p>
            )}
          </div>

          <div className="grid gap-1">
            <Label htmlFor="holiday-name" className="text-xs">
              Holiday Name
            </Label>
            <Input
              id="holiday-name"
              type="text"
              placeholder="e.g. Company Retreat"
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
              className="h-8 text-sm"
            />
            {addErrors.name && (
              <p className="text-xs text-destructive">{addErrors.name}</p>
            )}
          </div>

          <div className="flex gap-2">
            <Button type="submit" size="sm" className="h-8" disabled={isPending}>
              {isPending ? "Adding..." : "Add"}
            </Button>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="h-8"
              onClick={() => {
                setShowAddForm(false)
                setNewDate("")
                setNewName("")
                setAddErrors({})
              }}
            >
              Cancel
            </Button>
          </div>
        </form>
      )}

      {/* Holiday list */}
      {displayedHolidays.length === 0 ? (
        <div className="rounded-md border border-dashed border-border bg-muted/10 px-4 py-6 text-center">
          <p className="text-sm text-muted-foreground">
            No holidays set for {selectedYear}.
          </p>
          <p className="text-xs text-muted-foreground mt-1">
            Add US holidays from the suggestions above, or enter a custom date.
          </p>
        </div>
      ) : (
        <div className="space-y-1">
          {displayedHolidays.map((holiday) => (
            <div
              key={holiday.id}
              className="flex items-center justify-between rounded-md px-3 py-2 hover:bg-muted/40 transition-colors group"
            >
              <div className="flex items-center gap-3 min-w-0">
                <span className="text-xs font-mono text-muted-foreground w-24 shrink-0">
                  {formatDate(holiday.date)}
                </span>
                <span className="text-sm truncate">{holiday.name}</span>
              </div>

              <div className="flex items-center gap-1.5 shrink-0">
                {confirmDeleteId === holiday.id ? (
                  <>
                    <span className="text-xs text-muted-foreground">Remove?</span>
                    <Button
                      type="button"
                      variant="destructive"
                      size="sm"
                      className="h-6 px-2 text-xs"
                      disabled={deletingId === holiday.id}
                      onClick={() => handleDelete(holiday.id)}
                    >
                      {deletingId === holiday.id ? "..." : "Yes"}
                    </Button>
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      className="h-6 px-2 text-xs"
                      onClick={() => setConfirmDeleteId(null)}
                    >
                      No
                    </Button>
                  </>
                ) : (
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    className="h-6 w-6 p-0 opacity-0 group-hover:opacity-100 transition-opacity text-muted-foreground hover:text-destructive"
                    onClick={() => handleDelete(holiday.id)}
                    aria-label={`Remove ${holiday.name}`}
                  >
                    <TrashIcon className="h-3.5 w-3.5" />
                  </Button>
                )}
              </div>
            </div>
          ))}
        </div>
      )}

      {displayedHolidays.length > 0 && (
        <p className="text-xs text-muted-foreground">
          {displayedHolidays.length} holiday{displayedHolidays.length !== 1 ? "s" : ""} set for {selectedYear}.
          Route stops on these dates will be marked as holiday.
        </p>
      )}
    </div>
  )
}
