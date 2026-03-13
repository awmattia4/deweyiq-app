"use client"

import { CheckIcon } from "lucide-react"
import { cn } from "@/lib/utils"

interface RequestStatusTrackerProps {
  status: string
  officeNotes?: string | null
}

const STEPS = [
  { key: "submitted", label: "Submitted" },
  { key: "reviewed", label: "Reviewed" },
  { key: "scheduled", label: "Scheduled" },
  { key: "complete", label: "Complete" },
]

const STEP_ORDER = ["submitted", "reviewed", "scheduled", "complete"]

function getStepIndex(status: string): number {
  const idx = STEP_ORDER.indexOf(status)
  return idx === -1 ? 0 : idx
}

/**
 * RequestStatusTracker — horizontal (desktop) / vertical (mobile) step indicator.
 *
 * Shows the request lifecycle: Submitted → Reviewed → Scheduled → Complete.
 * Current step highlighted with primary color. Past steps show checkmarks.
 * Declined status shows an error state with office notes.
 */
export function RequestStatusTracker({ status, officeNotes }: RequestStatusTrackerProps) {
  if (status === "declined") {
    return (
      <div className="rounded-xl border border-destructive/30 bg-destructive/10 px-4 py-3">
        <p className="text-sm font-medium text-destructive">Request Declined</p>
        {officeNotes && (
          <p className="text-sm text-muted-foreground mt-1">{officeNotes}</p>
        )}
      </div>
    )
  }

  const currentIndex = getStepIndex(status)

  return (
    <div className="flex flex-col sm:flex-row gap-2 sm:gap-0">
      {STEPS.map((step, idx) => {
        const isPast = idx < currentIndex
        const isCurrent = idx === currentIndex
        const isFuture = idx > currentIndex

        return (
          <div
            key={step.key}
            className="flex sm:flex-1 items-center gap-2 sm:flex-col sm:items-start"
          >
            {/* Step indicator + connector */}
            <div className="flex items-center gap-0 sm:flex-row sm:w-full sm:items-center">
              {/* Circle */}
              <div
                className={cn(
                  "flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-xs font-semibold transition-colors",
                  isPast && "bg-primary text-primary-foreground",
                  isCurrent && "bg-primary text-primary-foreground ring-2 ring-primary ring-offset-2 ring-offset-background",
                  isFuture && "bg-muted text-muted-foreground border border-border/60"
                )}
              >
                {isPast ? (
                  <CheckIcon className="h-3.5 w-3.5" />
                ) : (
                  <span>{idx + 1}</span>
                )}
              </div>

              {/* Connector line (between steps, hidden after last) */}
              {idx < STEPS.length - 1 && (
                <div
                  className={cn(
                    "h-px flex-1 mx-2 hidden sm:block",
                    isPast ? "bg-primary" : "bg-border/60"
                  )}
                />
              )}
            </div>

            {/* Label */}
            <span
              className={cn(
                "text-xs font-medium leading-tight sm:mt-1",
                isCurrent && "text-foreground",
                isPast && "text-primary",
                isFuture && "text-muted-foreground"
              )}
            >
              {step.label}
            </span>
          </div>
        )
      })}
    </div>
  )
}
