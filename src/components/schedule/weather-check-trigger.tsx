"use client"

import { useState, useTransition } from "react"
import { useRouter } from "next/navigation"
import { CloudIcon, ExternalLinkIcon, XIcon } from "lucide-react"
import { toast } from "sonner"
import { cn } from "@/lib/utils"
import { manualWeatherCheck } from "@/actions/weather"
import { Button } from "@/components/ui/button"
import Link from "next/link"

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function toLocalDateString(d: Date): string {
  const yyyy = d.getFullYear()
  const mm = String(d.getMonth() + 1).padStart(2, "0")
  const dd = String(d.getDate()).padStart(2, "0")
  return `${yyyy}-${mm}-${dd}`
}

function formatDateForInput(d: Date): string {
  return toLocalDateString(d)
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

interface WeatherCheckTriggerProps {
  /** The Monday of the currently-viewed week (YYYY-MM-DD) */
  weekStartDate: string
}

/**
 * WeatherCheckTrigger — "Check Weather" button for the Schedule page.
 *
 * Only rendered for owner and office roles (enforced server-side — this
 * component is only added to the Schedule page which already guards by role).
 *
 * Opens an inline popover/mini-dialog where office can select a date range
 * and trigger a manual weather check — creating reschedule proposals
 * on demand without waiting for the daily cron.
 */
export function WeatherCheckTrigger({ weekStartDate }: WeatherCheckTriggerProps) {
  const router = useRouter()
  const [isOpen, setIsOpen] = useState(false)
  const [isPending, startTransition] = useTransition()

  // Default date range: current week (Mon → Fri)
  const [startDate, setStartDate] = useState(() => weekStartDate)
  const [endDate, setEndDate] = useState(() => {
    const start = new Date(weekStartDate + "T00:00:00")
    const friday = new Date(start)
    friday.setDate(start.getDate() + 4)
    return toLocalDateString(friday)
  })

  const [result, setResult] = useState<{
    daysChecked: number
    proposalsCreated: number
    clearDays: number
  } | null>(null)

  function handleOpen() {
    // Reset result when reopening
    setResult(null)
    setIsOpen(true)
  }

  function handleClose() {
    setIsOpen(false)
    setResult(null)
  }

  function handleCheck() {
    setResult(null)
    startTransition(async () => {
      const response = await manualWeatherCheck(startDate, endDate)
      if (response.success && response.data) {
        setResult(response.data)
        if (response.data.proposalsCreated > 0) {
          toast.success(
            `${response.data.proposalsCreated} weather proposal${response.data.proposalsCreated !== 1 ? "s" : ""} created`
          )
          router.refresh()
        } else {
          toast.success("No severe weather found — all days are clear")
        }
      } else {
        toast.error(response.error ?? "Weather check failed")
      }
    })
  }

  return (
    <div className="relative">
      <Button
        variant="outline"
        size="sm"
        onClick={handleOpen}
        className="gap-1.5"
        aria-haspopup="dialog"
        aria-expanded={isOpen}
      >
        <CloudIcon className="h-3.5 w-3.5" />
        Check Weather
      </Button>

      {isOpen && (
        <>
          {/* Backdrop */}
          <div
            className="fixed inset-0 z-40"
            onClick={handleClose}
            aria-hidden="true"
          />

          {/* Popover panel */}
          <div
            role="dialog"
            aria-label="Weather check"
            className="absolute right-0 top-full z-50 mt-2 w-72 rounded-lg border border-border bg-card p-4 shadow-lg"
          >
            {/* Header */}
            <div className="mb-3 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <CloudIcon className="h-4 w-4 text-muted-foreground" />
                <h3 className="text-sm font-semibold">Weather Check</h3>
              </div>
              <button
                onClick={handleClose}
                className="cursor-pointer rounded p-0.5 text-muted-foreground hover:text-foreground transition-colors"
                aria-label="Close"
              >
                <XIcon className="h-4 w-4" />
              </button>
            </div>

            <p className="mb-3 text-xs text-muted-foreground">
              Check the forecast and create reschedule proposals for any severe
              weather days in this range.
            </p>

            {/* Date range inputs */}
            <div className="mb-3 flex flex-col gap-2">
              <div className="flex flex-col gap-1">
                <label className="text-xs font-medium text-muted-foreground">
                  Start date
                </label>
                <input
                  type="date"
                  value={startDate}
                  onChange={(e) => setStartDate(e.target.value)}
                  className="rounded-md border border-input bg-background px-2.5 py-1.5 text-xs focus:outline-none focus:ring-1 focus:ring-ring"
                />
              </div>
              <div className="flex flex-col gap-1">
                <label className="text-xs font-medium text-muted-foreground">
                  End date
                </label>
                <input
                  type="date"
                  value={endDate}
                  onChange={(e) => setEndDate(e.target.value)}
                  min={startDate}
                  className="rounded-md border border-input bg-background px-2.5 py-1.5 text-xs focus:outline-none focus:ring-1 focus:ring-ring"
                />
              </div>
            </div>

            {/* Results */}
            {result && (
              <div
                className={cn(
                  "mb-3 rounded-md border p-3 text-xs",
                  result.proposalsCreated > 0
                    ? "border-amber-500/30 bg-amber-500/10"
                    : "border-green-500/30 bg-green-500/10"
                )}
              >
                <p className="font-medium mb-1">
                  {result.proposalsCreated > 0
                    ? `${result.proposalsCreated} weather day${result.proposalsCreated !== 1 ? "s" : ""} flagged`
                    : "All clear"}
                </p>
                <ul className="text-muted-foreground space-y-0.5">
                  <li>{result.daysChecked} day{result.daysChecked !== 1 ? "s" : ""} checked</li>
                  <li>{result.clearDays} clear day{result.clearDays !== 1 ? "s" : ""}</li>
                  {result.proposalsCreated > 0 && (
                    <li>{result.proposalsCreated} proposal{result.proposalsCreated !== 1 ? "s" : ""} created</li>
                  )}
                </ul>

                {result.proposalsCreated > 0 && (
                  <Link
                    href="/alerts"
                    className="mt-2 flex items-center gap-1 font-medium text-foreground hover:underline underline-offset-2"
                    onClick={handleClose}
                  >
                    Review proposals
                    <ExternalLinkIcon className="h-3 w-3" />
                  </Link>
                )}
              </div>
            )}

            {/* Check button */}
            <Button
              onClick={handleCheck}
              disabled={isPending || !startDate || !endDate}
              size="sm"
              className="w-full"
            >
              {isPending ? "Checking forecast..." : "Check Forecast"}
            </Button>
          </div>
        </>
      )}
    </div>
  )
}
