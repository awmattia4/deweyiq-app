"use client"

import type { DispatchTech } from "@/actions/dispatch"

interface TechFilterProps {
  techs: DispatchTech[]
  selectedTechId: string | null
  onSelectTech: (techId: string | null) => void
}

/**
 * TechFilter — toggles between all-techs and single-tech focused view.
 *
 * "All Techs" button is the default active state (selectedTechId = null).
 * Clicking a tech chip filters the map to show only that tech's stops
 * and position. Clicking "All Techs" or the active tech chip resets to all.
 *
 * Color dots match the tech's assigned OKLCH map color for visual consistency.
 */
export function TechFilter({ techs, selectedTechId, onSelectTech }: TechFilterProps) {
  if (techs.length === 0) return null

  return (
    <div className="flex items-center gap-2 px-4 py-2 overflow-x-auto scrollbar-none">
      {/* All Techs button */}
      <button
        type="button"
        onClick={() => onSelectTech(null)}
        className={`
          flex-shrink-0 px-3 py-1.5 rounded-full text-xs font-medium transition-colors duration-150 cursor-pointer
          ${selectedTechId === null
            ? "bg-foreground text-background"
            : "bg-muted/60 text-muted-foreground hover:bg-muted hover:text-foreground border border-border/40"
          }
        `}
        aria-pressed={selectedTechId === null}
      >
        All Techs
      </button>

      {/* Individual tech chips */}
      {techs.map((tech) => {
        const isSelected = selectedTechId === tech.id
        return (
          <button
            key={tech.id}
            type="button"
            onClick={() => onSelectTech(isSelected ? null : tech.id)}
            className={`
              flex-shrink-0 flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium transition-colors duration-150 cursor-pointer
              ${isSelected
                ? "bg-foreground text-background"
                : "bg-muted/60 text-muted-foreground hover:bg-muted hover:text-foreground border border-border/40"
              }
            `}
            aria-pressed={isSelected}
          >
            {/* Color dot matches tech's map marker color */}
            <span
              className="inline-block w-2 h-2 rounded-full flex-shrink-0"
              style={{ backgroundColor: tech.color }}
              aria-hidden="true"
            />
            {tech.name.split(" ")[0]}
          </button>
        )
      })}
    </div>
  )
}
