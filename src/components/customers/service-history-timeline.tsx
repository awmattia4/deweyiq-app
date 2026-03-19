"use client"

import { useState, useTransition } from "react"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { ClipboardList, PencilIcon, CheckIcon, XIcon } from "lucide-react"
import { cn } from "@/lib/utils"
import { toLocalDateString } from "@/lib/date-utils"
import { FlagBadge } from "@/components/field/internal-notes"
import { updateInternalNotes } from "@/actions/visits"
import { toast } from "sonner"

// ─── Types ─────────────────────────────────────────────────────────────────────

type ServiceVisit = {
  id: string
  visit_type: string | null  // "routine" | "repair" | "one_off"
  visited_at: string         // ISO date string
  notes: string | null
  pool?: { id: string; name: string } | null
  tech?: { id: string; full_name: string | null } | null
  chemistry_readings?: Record<string, number | null> | null
  // Phase 10: internal notes (office/owner only — never shown to customers)
  internal_notes?: string | null
  internal_flags?: string[] | null
}

interface ServiceHistoryTimelineProps {
  visits: ServiceVisit[]
  /** User role — determines whether internal notes section is shown */
  userRole?: "owner" | "office" | "tech" | "customer" | string | null
}

// ─── Flag definitions (mirrors internal-notes.tsx but import-safe here) ───────

const ALL_FLAGS = [
  "needs_follow_up",
  "needs_parts",
  "safety_concern",
  "handoff_note",
] as const

type InternalFlag = (typeof ALL_FLAGS)[number]

const FLAG_CHIP_CONFIG: Record<
  InternalFlag,
  { label: string; colorClass: string; activeClass: string }
> = {
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

// ─── Filter chip types ─────────────────────────────────────────────────────────

type FilterValue = "all" | "routine" | "repair" | "one_off"

const FILTER_CHIPS: Array<{ value: FilterValue; label: string }> = [
  { value: "all", label: "All" },
  { value: "routine", label: "Routine" },
  { value: "repair", label: "Repair" },
  { value: "one_off", label: "One-off" },
]

// ─── Visit type badge helpers ──────────────────────────────────────────────────

const VISIT_TYPE_CONFIG: Record<
  string,
  { label: string; className: string; dotClass: string }
> = {
  routine: {
    label: "Routine",
    className: "bg-blue-500/15 text-blue-400 border-blue-500/30",
    dotClass: "bg-blue-400",
  },
  repair: {
    label: "Repair",
    className: "bg-orange-500/15 text-orange-400 border-orange-500/30",
    dotClass: "bg-orange-400",
  },
  one_off: {
    label: "One-off",
    className: "bg-purple-500/15 text-purple-400 border-purple-500/30",
    dotClass: "bg-purple-400",
  },
}

const DEFAULT_TYPE_CONFIG = {
  label: "Service",
  className: "bg-muted text-muted-foreground border-border",
  dotClass: "bg-muted-foreground",
}

function getTypeConfig(visitType: string | null) {
  if (!visitType) return DEFAULT_TYPE_CONFIG
  return VISIT_TYPE_CONFIG[visitType] ?? DEFAULT_TYPE_CONFIG
}

// ─── Chemistry param display labels ───────────────────────────────────────────

const PARAM_LABELS: Record<string, string> = {
  freeChlorine: "Cl",
  bromine: "Br",
  pH: "pH",
  totalAlkalinity: "Alk",
  calciumHardness: "Ca",
  cya: "CYA",
  salt: "Salt",
  tds: "TDS",
  borate: "Borate",
  phosphates: "Phos",
  temperatureF: "Temp",
}

// Priority order for chemistry display (most important first)
const CHEMISTRY_DISPLAY_ORDER = [
  "freeChlorine",
  "bromine",
  "pH",
  "totalAlkalinity",
  "calciumHardness",
  "cya",
  "salt",
  "temperatureF",
]

// ─── Date formatting ───────────────────────────────────────────────────────────

function formatVisitDate(isoDate: string): string {
  const date = new Date(isoDate)
  return date.toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  })
}

function getDateKey(isoDate: string): string {
  const date = new Date(isoDate)
  return toLocalDateString(date)
}

// ─── Internal Notes Edit Section (office/owner only) ──────────────────────────

interface InternalNotesEditProps {
  visitId: string
  initialNotes: string | null
  initialFlags: string[] | null
}

function InternalNotesEdit({
  visitId,
  initialNotes,
  initialFlags,
}: InternalNotesEditProps) {
  const [isEditing, setIsEditing] = useState(false)
  const [notes, setNotes] = useState(initialNotes ?? "")
  const [flags, setFlags] = useState<string[]>(initialFlags ?? [])
  const [isPending, startTransition] = useTransition()

  const hasContent = (notes.trim().length > 0 || flags.length > 0)

  const toggleFlag = (flag: string) => {
    setFlags((prev) =>
      prev.includes(flag) ? prev.filter((f) => f !== flag) : [...prev, flag]
    )
  }

  const handleSave = () => {
    startTransition(async () => {
      const result = await updateInternalNotes(visitId, notes, flags)
      if (result.success) {
        setIsEditing(false)
        toast.success("Internal notes saved")
      } else {
        toast.error("Failed to save internal notes", {
          description: result.error,
        })
      }
    })
  }

  const handleCancel = () => {
    setNotes(initialNotes ?? "")
    setFlags(initialFlags ?? [])
    setIsEditing(false)
  }

  return (
    <div className="mt-3 rounded-lg border border-amber-800/30 bg-amber-950/15 overflow-hidden">
      {/* Header */}
      <div className="flex items-center gap-2 px-3 py-2 border-b border-amber-800/20">
        <span className="text-xs font-medium text-amber-200/70">
          Internal Notes
        </span>
        <span className="inline-flex items-center rounded-full bg-amber-500/15 border border-amber-500/30 px-1.5 py-0.5 text-[10px] font-medium text-amber-300/70 leading-none">
          Office only
        </span>
        {!isEditing && (
          <Button
            variant="ghost"
            size="sm"
            className="ml-auto h-6 w-6 p-0 text-amber-400/60 hover:text-amber-300 hover:bg-amber-500/10 cursor-pointer"
            onClick={() => setIsEditing(true)}
            title="Edit internal notes"
          >
            <PencilIcon className="h-3 w-3" />
          </Button>
        )}
        {isEditing && (
          <div className="ml-auto flex items-center gap-1">
            <Button
              variant="ghost"
              size="sm"
              className="h-6 w-6 p-0 text-green-400/80 hover:text-green-300 hover:bg-green-500/10 cursor-pointer"
              onClick={handleSave}
              disabled={isPending}
              title="Save"
            >
              <CheckIcon className="h-3 w-3" />
            </Button>
            <Button
              variant="ghost"
              size="sm"
              className="h-6 w-6 p-0 text-muted-foreground hover:text-foreground cursor-pointer"
              onClick={handleCancel}
              disabled={isPending}
              title="Cancel"
            >
              <XIcon className="h-3 w-3" />
            </Button>
          </div>
        )}
      </div>

      <div className="px-3 py-2.5 space-y-2.5">
        {/* Flag chips — read or edit */}
        {isEditing ? (
          <div className="flex flex-wrap gap-1.5">
            {ALL_FLAGS.map((flag) => {
              const isActive = flags.includes(flag)
              const config = FLAG_CHIP_CONFIG[flag]
              return (
                <button
                  key={flag}
                  type="button"
                  onClick={() => toggleFlag(flag)}
                  className={cn(
                    "inline-flex items-center rounded-full border px-2.5 py-1 text-[11px] leading-none transition-colors duration-150 cursor-pointer hover:opacity-80",
                    isActive ? config.activeClass : config.colorClass
                  )}
                >
                  {config.label}
                </button>
              )
            })}
          </div>
        ) : (
          flags.length > 0 && (
            <div className="flex flex-wrap gap-1.5">
              {flags.map((f) => (
                <FlagBadge key={f} flag={f} />
              ))}
            </div>
          )
        )}

        {/* Notes text — read or edit */}
        {isEditing ? (
          <textarea
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            placeholder="Notes for office (not visible to customer)…"
            rows={3}
            className={cn(
              "w-full resize-none rounded-lg border border-amber-800/30 bg-amber-950/30",
              "px-3 py-2 text-sm text-amber-100/80 placeholder:text-amber-400/30",
              "focus:outline-none focus:ring-1 focus:ring-amber-500/40"
            )}
          />
        ) : (
          notes.trim().length > 0 && (
            <p className="text-xs text-amber-200/70 leading-relaxed whitespace-pre-wrap">
              {notes}
            </p>
          )
        )}

        {/* Empty state for read mode */}
        {!isEditing && !hasContent && (
          <p className="text-xs text-amber-400/40 italic">
            No internal notes — click edit to add.
          </p>
        )}
      </div>
    </div>
  )
}

// ─── Timeline card ─────────────────────────────────────────────────────────────

interface TimelineCardProps {
  visit: ServiceVisit
  /** Whether to show the internal notes section (owner/office only) */
  showInternalNotes: boolean
}

function TimelineCard({ visit, showInternalNotes }: TimelineCardProps) {
  const typeConfig = getTypeConfig(visit.visit_type)

  // Build chemistry display list — only show params that have values
  const chemistryParams = CHEMISTRY_DISPLAY_ORDER
    .filter((key) => {
      const val = visit.chemistry_readings?.[key]
      return val !== null && val !== undefined
    })
    .map((key) => ({
      key,
      label: PARAM_LABELS[key] ?? key,
      value: visit.chemistry_readings![key] as number,
    }))

  // Also include any extra params not in the display order
  const extraParams = visit.chemistry_readings
    ? Object.entries(visit.chemistry_readings)
        .filter(([key, val]) => {
          return (
            !CHEMISTRY_DISPLAY_ORDER.includes(key) &&
            val !== null &&
            val !== undefined
          )
        })
        .map(([key, val]) => ({
          key,
          label: PARAM_LABELS[key] ?? key,
          value: val as number,
        }))
    : []

  const allChemParams = [...chemistryParams, ...extraParams]
  const hasChemistry = allChemParams.length > 0

  // Whether this visit has internal notes or flags
  const hasInternalContent =
    showInternalNotes &&
    ((visit.internal_notes && visit.internal_notes.trim().length > 0) ||
      (visit.internal_flags && visit.internal_flags.length > 0))

  return (
    <div className="flex flex-col gap-3 rounded-lg border border-border bg-card p-4">
      {/* Card header — type badge + pool + tech */}
      <div className="flex flex-wrap items-center gap-2">
        <Badge
          variant="outline"
          className={cn("text-xs font-medium border", typeConfig.className)}
        >
          {typeConfig.label}
        </Badge>

        {visit.pool && (
          <span className="text-xs text-muted-foreground">
            {visit.pool.name}
          </span>
        )}

        {visit.tech?.full_name && (
          <span className="text-xs text-muted-foreground ml-auto">
            {visit.tech.full_name}
          </span>
        )}
      </div>

      {/* Notes */}
      {visit.notes && (
        <p className="text-sm text-foreground/80">{visit.notes}</p>
      )}

      {/* Chemistry readings — real data from Phase 3+ */}
      {hasChemistry ? (
        <div className="flex flex-wrap gap-x-4 gap-y-1.5 rounded-md bg-muted/40 px-3 py-2">
          {allChemParams.map(({ key, label, value }) => (
            <div key={key} className="flex flex-col items-center gap-0.5">
              <span className="text-[10px] uppercase tracking-wide text-muted-foreground/70">
                {label}
              </span>
              <span className="text-xs font-medium text-foreground tabular-nums">
                {value}
              </span>
            </div>
          ))}
        </div>
      ) : (
        <div className="flex flex-wrap gap-4 rounded-md bg-muted/40 px-3 py-2">
          <div className="flex flex-col items-center gap-0.5">
            <span className="text-[10px] uppercase tracking-wide text-muted-foreground/70">pH</span>
            <span className="text-xs font-medium text-muted-foreground">--</span>
          </div>
          <div className="flex flex-col items-center gap-0.5">
            <span className="text-[10px] uppercase tracking-wide text-muted-foreground/70">Cl</span>
            <span className="text-xs font-medium text-muted-foreground">--</span>
          </div>
          <div className="flex flex-col items-center gap-0.5">
            <span className="text-[10px] uppercase tracking-wide text-muted-foreground/70">Alk</span>
            <span className="text-xs font-medium text-muted-foreground">--</span>
          </div>
          <span className="text-[10px] text-muted-foreground/50 self-center ml-1">
            Chemistry readings recorded during service
          </span>
        </div>
      )}

      {/* Internal notes section — office/owner only */}
      {showInternalNotes && (
        hasInternalContent ? (
          // Show full edit-capable internal notes section
          <InternalNotesEdit
            visitId={visit.id}
            initialNotes={visit.internal_notes ?? null}
            initialFlags={visit.internal_flags ?? null}
          />
        ) : (
          // Show collapsed add-notes section
          <InternalNotesEdit
            visitId={visit.id}
            initialNotes={null}
            initialFlags={null}
          />
        )
      )}
    </div>
  )
}

// ─── Component ─────────────────────────────────────────────────────────────────

/**
 * ServiceHistoryTimeline — Vertical timeline of service visits for a customer.
 *
 * Shows a vertical line on the left with cards positioned to the right.
 * Date markers appear as section headers when the date changes.
 * Filter chips at the top allow filtering by visit type.
 *
 * Phase 10: Internal notes section shown to owner/office roles only.
 * Internal notes are NEVER shown to tech or customer roles.
 */
export function ServiceHistoryTimeline({ visits, userRole }: ServiceHistoryTimelineProps) {
  const [activeFilter, setActiveFilter] = useState<FilterValue>("all")

  // Only owner and office roles can see internal notes
  const canSeeInternalNotes = userRole === "owner" || userRole === "office"

  // Filter visits based on active filter chip
  const filteredVisits = activeFilter === "all"
    ? visits
    : visits.filter((v) => v.visit_type === activeFilter)

  // Sort visits by date descending (most recent first)
  const sortedVisits = [...filteredVisits].sort(
    (a, b) => new Date(b.visited_at).getTime() - new Date(a.visited_at).getTime()
  )

  // ── Empty state ──────────────────────────────────────────────────────────────
  if (visits.length === 0) {
    return (
      <div className="flex flex-col gap-4">
        {/* Filter chips — visible even for empty state so UI shape is clear */}
        <FilterChips active={activeFilter} onChange={setActiveFilter} />

        <div className="flex flex-col items-center justify-center gap-3 py-16 text-center">
          <ClipboardList className="h-10 w-10 text-muted-foreground/50" />
          <div>
            <p className="text-sm font-medium text-muted-foreground">No service history yet</p>
            <p className="text-xs text-muted-foreground/70 mt-1 max-w-xs">
              Service records will appear here automatically as technicians complete stops.
            </p>
          </div>
          <p className="text-[11px] text-muted-foreground/50 max-w-xs">
            Records include chemistry readings, service checklists, photos, and notes.
          </p>
        </div>
      </div>
    )
  }

  // ── Timeline ─────────────────────────────────────────────────────────────────
  // Group visits by date key so we can render date section headers
  let lastDateKey = ""

  return (
    <div className="flex flex-col gap-4">
      {/* Filter chips */}
      <FilterChips active={activeFilter} onChange={setActiveFilter} />

      {/* Filtered empty state */}
      {sortedVisits.length === 0 && (
        <div className="flex flex-col items-center justify-center gap-2 py-12 text-center">
          <p className="text-sm text-muted-foreground">
            No {FILTER_CHIPS.find((c) => c.value === activeFilter)?.label.toLowerCase()} visits found.
          </p>
        </div>
      )}

      {/* Vertical timeline */}
      <div className="relative pl-8">
        {/* Vertical line running down the left */}
        <div className="absolute left-3 top-0 bottom-0 w-px bg-border" />

        <div className="flex flex-col gap-0">
          {sortedVisits.map((visit) => {
            const dateKey = getDateKey(visit.visited_at)
            const showDateHeader = dateKey !== lastDateKey
            lastDateKey = dateKey

            return (
              <div key={visit.id} className="relative">
                {/* Date section header */}
                {showDateHeader && (
                  <div className="mb-3 mt-5 first:mt-0">
                    <span className="inline-block rounded-full bg-muted px-2.5 py-0.5 text-xs font-medium text-muted-foreground">
                      {formatVisitDate(visit.visited_at)}
                    </span>
                  </div>
                )}

                {/* Timeline dot on the vertical line */}
                <div
                  className={cn(
                    "absolute -left-5 top-4 h-2.5 w-2.5 rounded-full border-2 border-background",
                    getTypeConfig(visit.visit_type).dotClass
                  )}
                />

                {/* Card */}
                <div className="mb-4">
                  <TimelineCard visit={visit} showInternalNotes={canSeeInternalNotes} />
                </div>
              </div>
            )
          })}
        </div>
      </div>
    </div>
  )
}

// ─── Filter chips sub-component ────────────────────────────────────────────────

function FilterChips({
  active,
  onChange,
}: {
  active: FilterValue
  onChange: (v: FilterValue) => void
}) {
  return (
    <div className="flex flex-wrap gap-2">
      {FILTER_CHIPS.map((chip) => (
        <button
          key={chip.value}
          onClick={() => onChange(chip.value)}
          className={cn(
            "inline-flex items-center rounded-full border px-3 py-1 text-xs font-medium transition-colors",
            active === chip.value
              ? "border-primary bg-primary text-primary-foreground"
              : "border-border bg-muted text-muted-foreground hover:bg-muted/80"
          )}
        >
          {chip.label}
        </button>
      ))}
    </div>
  )
}
