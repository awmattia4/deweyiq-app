"use client"

import { useState } from "react"
import { ChevronDownIcon, ChevronRightIcon, LockIcon } from "lucide-react"
import { cn } from "@/lib/utils"

// ─── Flag definitions ─────────────────────────────────────────────────────────

export type InternalFlag =
  | "needs_follow_up"
  | "needs_parts"
  | "safety_concern"
  | "handoff_note"

interface FlagConfig {
  label: string
  colorClass: string
  activeClass: string
}

const FLAG_CONFIG: Record<InternalFlag, FlagConfig> = {
  needs_follow_up: {
    label: "Needs Follow-up",
    colorClass: "text-amber-400 border-amber-500/40 bg-amber-500/10",
    activeClass: "text-amber-300 border-amber-400 bg-amber-500/25 font-semibold",
  },
  needs_parts: {
    label: "Needs Parts",
    colorClass: "text-blue-400 border-blue-500/40 bg-blue-500/10",
    activeClass: "text-blue-300 border-blue-400 bg-blue-500/25 font-semibold",
  },
  safety_concern: {
    label: "Safety Concern",
    colorClass: "text-red-400 border-red-500/40 bg-red-500/10",
    activeClass: "text-red-300 border-red-400 bg-red-500/25 font-semibold",
  },
  handoff_note: {
    label: "Handoff Note",
    colorClass: "text-muted-foreground border-border bg-muted/40",
    activeClass: "text-foreground border-border bg-muted/70 font-semibold",
  },
}

const ALL_FLAGS: InternalFlag[] = [
  "needs_follow_up",
  "needs_parts",
  "safety_concern",
  "handoff_note",
]

// ─── FlagBadge — display-only (for previous notes and customer timeline) ──────

/**
 * FlagBadge — renders a single internal flag as a colored badge.
 * Used in the office timeline view and the "previous notes" display.
 */
export function FlagBadge({ flag }: { flag: string }) {
  const config = FLAG_CONFIG[flag as InternalFlag]
  if (!config) return null
  return (
    <span
      className={cn(
        "inline-flex items-center rounded-full border px-2 py-0.5 text-[11px] font-medium leading-none",
        config.colorClass
      )}
    >
      {config.label}
    </span>
  )
}

// ─── InternalNotes — input component for the stop workflow ───────────────────

interface InternalNotesProps {
  /** Current notes text */
  notes: string
  /** Current flag list */
  flags: string[]
  /** Called whenever notes or flags change */
  onChange: (notes: string, flags: string[]) => void
  /** Previous visit's internal notes (for handoff display) */
  previousNotes?: {
    notes: string | null
    flags: string[]
    visitedAt: string
  } | null
  /** Read-only mode — shown after stop is completed */
  readOnly?: boolean
}

/**
 * InternalNotes — tech-to-office internal notes with flag chips.
 *
 * Phase 10: Collapsible section with "Office only" badge.
 * - Textarea for free-text notes
 * - Flag chip toggles: "Needs Follow-up", "Needs Parts", "Safety Concern", "Handoff Note"
 * - Previous visit notes shown in a collapsed sub-section for tech handoff
 *
 * Distinct styling from customer-facing sections — uses a muted amber tint
 * to indicate "internal only" data. The lock icon reinforces office-only visibility.
 */
export function InternalNotes({
  notes,
  flags,
  onChange,
  previousNotes,
  readOnly = false,
}: InternalNotesProps) {
  const [expanded, setExpanded] = useState(false)
  const [prevExpanded, setPrevExpanded] = useState(false)

  const hasContent = notes.trim().length > 0 || flags.length > 0
  const hasPrevious = !!(previousNotes?.notes || (previousNotes?.flags && previousNotes.flags.length > 0))

  const toggleFlag = (flag: InternalFlag) => {
    if (readOnly) return
    const current = flags as InternalFlag[]
    const newFlags = current.includes(flag)
      ? current.filter((f) => f !== flag)
      : [...current, flag]
    onChange(notes, newFlags)
  }

  const formattedPrevDate = previousNotes?.visitedAt
    ? new Date(previousNotes.visitedAt).toLocaleDateString("en-US", {
        month: "short",
        day: "numeric",
      })
    : null

  return (
    <div className={cn(
      "rounded-xl border overflow-hidden",
      "border-amber-800/30 bg-amber-950/20"
    )}>
      {/* Header — always visible, toggles expansion */}
      <button
        type="button"
        onClick={() => setExpanded((v) => !v)}
        className="w-full flex items-center gap-2 px-4 py-3 text-left cursor-pointer hover:bg-amber-950/30 transition-colors duration-150"
      >
        {expanded ? (
          <ChevronDownIcon className="h-4 w-4 text-amber-500/70 shrink-0" />
        ) : (
          <ChevronRightIcon className="h-4 w-4 text-amber-500/70 shrink-0" />
        )}
        <LockIcon className="h-3.5 w-3.5 text-amber-500/60 shrink-0" />
        <span className="text-sm font-medium text-amber-200/80">
          Internal Notes
        </span>
        <span className="ml-1 inline-flex items-center rounded-full bg-amber-500/15 border border-amber-500/30 px-2 py-0.5 text-[10px] font-medium text-amber-300/80 leading-none">
          Office only
        </span>
        {/* Dot indicator — shows something has been entered */}
        {hasContent && !expanded && (
          <span className="ml-auto flex h-1.5 w-1.5 rounded-full bg-amber-400 shrink-0" />
        )}
        {flags.length > 0 && !expanded && (
          <span className="ml-auto flex gap-1 flex-wrap justify-end">
            {(flags as InternalFlag[]).slice(0, 2).map((f) => (
              <FlagBadge key={f} flag={f} />
            ))}
          </span>
        )}
      </button>

      {/* Expanded content */}
      {expanded && (
        <div className="flex flex-col gap-4 px-4 pb-4 border-t border-amber-800/20">
          {/* Previous visit notes — handoff section */}
          {hasPrevious && (
            <div className="mt-3">
              <button
                type="button"
                onClick={() => setPrevExpanded((v) => !v)}
                className="flex items-center gap-1.5 text-xs text-amber-300/60 hover:text-amber-300/80 cursor-pointer transition-colors mb-1.5"
              >
                {prevExpanded ? (
                  <ChevronDownIcon className="h-3.5 w-3.5 shrink-0" />
                ) : (
                  <ChevronRightIcon className="h-3.5 w-3.5 shrink-0" />
                )}
                Previous tech notes
                {formattedPrevDate && (
                  <span className="text-amber-400/50 ml-1">({formattedPrevDate})</span>
                )}
              </button>

              {prevExpanded && (
                <div className="rounded-lg border border-amber-800/25 bg-amber-950/30 px-3 py-2.5 space-y-2">
                  {previousNotes?.flags && previousNotes.flags.length > 0 && (
                    <div className="flex flex-wrap gap-1.5">
                      {previousNotes.flags.map((f) => (
                        <FlagBadge key={f} flag={f} />
                      ))}
                    </div>
                  )}
                  {previousNotes?.notes && (
                    <p className="text-xs text-amber-200/70 leading-relaxed whitespace-pre-wrap">
                      {previousNotes.notes}
                    </p>
                  )}
                </div>
              )}
            </div>
          )}

          {/* Flag chips */}
          <div className="flex flex-wrap gap-2 mt-3">
            {ALL_FLAGS.map((flag) => {
              const isActive = (flags as InternalFlag[]).includes(flag)
              const config = FLAG_CONFIG[flag]
              return (
                <button
                  key={flag}
                  type="button"
                  onClick={() => toggleFlag(flag)}
                  disabled={readOnly}
                  className={cn(
                    "inline-flex items-center rounded-full border px-3 py-1.5 text-xs leading-none transition-colors duration-150 cursor-pointer",
                    "disabled:cursor-default",
                    isActive ? config.activeClass : config.colorClass,
                    !readOnly && "hover:opacity-80"
                  )}
                >
                  {config.label}
                </button>
              )
            })}
          </div>

          {/* Notes textarea */}
          <textarea
            value={notes}
            onChange={(e) => onChange(e.target.value, flags)}
            placeholder="Notes for office (not visible to customer)…"
            rows={3}
            disabled={readOnly}
            className={cn(
              "w-full resize-none rounded-lg border bg-amber-950/30 px-3 py-2.5",
              "text-sm text-amber-100/80 placeholder:text-amber-400/30",
              "border-amber-800/30 focus:outline-none focus:ring-1 focus:ring-amber-500/40",
              "disabled:opacity-60 disabled:cursor-default"
            )}
          />

          {!readOnly && (
            <p className="text-[11px] text-amber-300/40 -mt-2">
              Internal only — never shared with the customer.
            </p>
          )}
        </div>
      )}
    </div>
  )
}
