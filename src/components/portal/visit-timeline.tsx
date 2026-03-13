"use client"

import { VisitDetailCard } from "./visit-detail-card"
import type { PortalVisit } from "@/actions/portal-data"

interface VisitTimelineProps {
  visits: PortalVisit[]
}

/**
 * Returns "Month YYYY" for a given date, e.g. "March 2026"
 */
function monthYearLabel(date: Date): string {
  return date.toLocaleDateString("en-US", { month: "long", year: "numeric" })
}

/**
 * Groups visits by "Month YYYY" header for the timeline section headers.
 */
function groupByMonth(visits: PortalVisit[]): { header: string; visits: PortalVisit[] }[] {
  const groups: { header: string; visits: PortalVisit[] }[] = []
  let currentHeader = ""
  let currentGroup: PortalVisit[] = []

  for (const visit of visits) {
    const header = monthYearLabel(visit.visited_at)
    if (header !== currentHeader) {
      if (currentGroup.length > 0) {
        groups.push({ header: currentHeader, visits: currentGroup })
      }
      currentHeader = header
      currentGroup = [visit]
    } else {
      currentGroup.push(visit)
    }
  }

  if (currentGroup.length > 0) {
    groups.push({ header: currentHeader, visits: currentGroup })
  }

  return groups
}

/**
 * VisitTimeline — vertical timeline of expandable service visit cards.
 *
 * Groups visits by month/year with section headers.
 * Each visit renders as a VisitDetailCard that expands on click.
 *
 * Timeline visual:
 * - Thin vertical line on the left (2px, border color)
 * - Dot indicator at each visit entry
 *
 * Visits must be sorted newest first before being passed in.
 */
export function VisitTimeline({ visits }: VisitTimelineProps) {
  if (visits.length === 0) {
    return (
      <p className="text-sm text-muted-foreground italic py-4">
        No service visits yet. Your service history will appear here after your first visit.
      </p>
    )
  }

  const groups = groupByMonth(visits)

  return (
    <div className="relative space-y-6">
      {groups.map((group) => (
        <div key={group.header}>
          {/* Month/year section header */}
          <div className="flex items-center gap-3 mb-3">
            <div className="h-px flex-1 bg-border/60" />
            <span className="text-xs font-medium text-muted-foreground whitespace-nowrap">
              {group.header}
            </span>
            <div className="h-px flex-1 bg-border/60" />
          </div>

          {/* Visit cards for this month */}
          <div className="relative space-y-2">
            {/* Vertical timeline connector line */}
            <div
              className="absolute left-[1.375rem] top-4 bottom-4 w-px bg-border/40 pointer-events-none"
              aria-hidden="true"
            />

            {group.visits.map((visit) => (
              <div key={visit.id} className="relative flex gap-3">
                {/* Timeline dot */}
                <div className="relative z-10 flex-shrink-0 mt-[1.0625rem]">
                  <div
                    className={`h-2.5 w-2.5 rounded-full border-2 ${
                      visit.status === "skipped"
                        ? "bg-card border-amber-500/60"
                        : "bg-card border-green-500/60"
                    }`}
                    aria-hidden="true"
                  />
                </div>

                {/* Visit card */}
                <div className="flex-1 min-w-0 border border-border/60 rounded-lg bg-card/50 overflow-hidden">
                  <VisitDetailCard visit={visit} />
                </div>
              </div>
            ))}
          </div>
        </div>
      ))}
    </div>
  )
}
