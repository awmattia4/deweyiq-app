"use client"

import { cn } from "@/lib/utils"

// ─── Types ─────────────────────────────────────────────────────────────────────

interface Tech {
  id: string
  name: string
}

interface TechDaySelectorProps {
  techs: Tech[]
  selectedTechId: string
  /** 0=Mon, 1=Tue, 2=Wed, 3=Thu, 4=Fri */
  selectedDay: number
  onTechChange: (techId: string) => void
  onDayChange: (day: number) => void
}

// ─── Day labels ────────────────────────────────────────────────────────────────

const DAY_LABELS = ["Mon", "Tue", "Wed", "Thu", "Fri"] as const

// ─── TechDaySelector ──────────────────────────────────────────────────────────

/**
 * TechDaySelector — tech tabs across the top with a day-of-week picker below.
 *
 * Layout per locked decision:
 * - Tech tabs: horizontal scrollable row, each showing tech name
 * - Day picker: Mon–Fri selectable buttons below the tech tabs
 * - Active tech and active day are highlighted with the accent color
 */
export function TechDaySelector({
  techs,
  selectedTechId,
  selectedDay,
  onTechChange,
  onDayChange,
}: TechDaySelectorProps) {
  return (
    <div className="flex flex-col gap-2 border-b border-border pb-3">
      {/* ── Tech tabs ──────────────────────────────────────────────────────── */}
      <div
        className="flex gap-1.5 overflow-x-auto scrollbar-none"
        role="tablist"
        aria-label="Select technician"
      >
        {techs.length === 0 ? (
          <p className="text-xs text-muted-foreground px-1 py-1.5 italic">No technicians found</p>
        ) : (
          techs.map((tech) => {
            const isActive = tech.id === selectedTechId
            return (
              <button
                key={tech.id}
                role="tab"
                aria-selected={isActive}
                onClick={() => onTechChange(tech.id)}
                className={cn(
                  "shrink-0 rounded-md px-3.5 py-1.5 text-sm font-medium transition-colors cursor-pointer whitespace-nowrap",
                  isActive
                    ? "bg-primary text-primary-foreground shadow-sm"
                    : "bg-muted/50 text-muted-foreground hover:bg-muted hover:text-foreground"
                )}
              >
                {tech.name}
              </button>
            )
          })
        )}
      </div>

      {/* ── Day picker ─────────────────────────────────────────────────────── */}
      <div
        className="flex gap-1"
        role="group"
        aria-label="Select day of week"
      >
        {DAY_LABELS.map((label, idx) => {
          const isActive = idx === selectedDay
          return (
            <button
              key={label}
              onClick={() => onDayChange(idx)}
              className={cn(
                "flex-1 rounded px-2 py-1 text-xs font-medium transition-colors cursor-pointer",
                isActive
                  ? "bg-accent text-accent-foreground"
                  : "text-muted-foreground hover:bg-muted/60 hover:text-foreground"
              )}
            >
              {label}
            </button>
          )
        })}
      </div>
    </div>
  )
}
