"use client"

import { useState, useCallback } from "react"
import * as Collapsible from "@radix-ui/react-collapsible"
import { ChevronDownIcon } from "lucide-react"
import { Badge } from "@/components/ui/badge"
import { ChemistryDisplay } from "./chemistry-display"
import type { PortalVisit } from "@/actions/portal-data"

// Lightbox for photo viewing within a visit card.
// Lightbox component must be dynamically imported (accesses DOM APIs).
// Captions plugin is a plain function — safe to import statically.
import dynamic from "next/dynamic"
import Captions from "yet-another-react-lightbox/plugins/captions"
const Lightbox = dynamic(() => import("yet-another-react-lightbox"), { ssr: false })

interface VisitDetailCardProps {
  visit: PortalVisit
}

/**
 * Format a Date to a human-readable label: "Mar 8, 2026"
 */
function formatDate(date: Date): string {
  return date.toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  })
}

/**
 * Map visit_type to a display label.
 */
function visitTypeLabel(visitType: string | null): string {
  switch (visitType) {
    case "routine":
      return "Routine"
    case "repair":
      return "Repair"
    case "one_off":
    case "one-off":
      return "One-off"
    default:
      return visitType ?? "Service"
  }
}

/**
 * Build a brief chemistry summary line for the collapsed view.
 * Shows key readings: pH, Free Chlorine, Alkalinity.
 */
function buildChemistrySummary(readings: Record<string, number> | null): string | null {
  if (!readings) return null

  const parts: string[] = []

  const ph = readings.pH ?? readings.ph
  if (ph !== undefined) parts.push(`pH ${ph}`)

  const cl = readings.freeChlorine ?? readings.free_chlorine
  if (cl !== undefined) parts.push(`Cl ${cl}`)

  const alk = readings.totalAlkalinity ?? readings.total_alkalinity
  if (alk !== undefined) parts.push(`Alk ${alk}`)

  return parts.length > 0 ? parts.join(" · ") : null
}

/**
 * VisitDetailCard — expandable/collapsible visit record for the portal history page.
 *
 * Collapsed view: date, visit type badge, chemistry summary, status badge.
 * Expanded view: full chemistry readings, checklist items, photos, tech notes.
 *
 * Entire card header is clickable to toggle (per user preference: clickable cards).
 * Uses Radix Collapsible for accessible expand/collapse behavior.
 */
export function VisitDetailCard({ visit }: VisitDetailCardProps) {
  const [open, setOpen] = useState(false)
  const [lightboxOpen, setLightboxOpen] = useState(false)
  const [lightboxIndex, setLightboxIndex] = useState(0)

  const chemistrySummary = buildChemistrySummary(visit.chemistry_readings)
  const hasChemistry = visit.chemistry_readings && Object.keys(visit.chemistry_readings).length > 0
  const hasChecklist = visit.checklist_completion && Object.keys(visit.checklist_completion).length > 0
  const hasPhotos = visit.photo_urls && visit.photo_urls.length > 0
  const hasNotes = !!visit.notes
  const isSkipped = visit.status === "skipped"

  const openLightboxAt = useCallback((index: number) => {
    setLightboxIndex(index)
    setLightboxOpen(true)
  }, [])

  const photoSlides = (visit.photo_urls ?? []).map((url) => ({
    src: url,
    title: visit.pool_name ?? "Pool",
    description: formatDate(visit.visited_at),
  }))

  return (
    <Collapsible.Root open={open} onOpenChange={setOpen}>
      {/* ── Collapsed header (always visible) ──────────────────────────── */}
      <Collapsible.Trigger asChild>
        <button
          type="button"
          className="w-full text-left flex items-start gap-3 px-4 py-3.5 hover:bg-muted/30 active:bg-muted/50 transition-colors cursor-pointer rounded-t-lg data-[state=closed]:rounded-lg"
          aria-expanded={open}
        >
          {/* Left column: date */}
          <div className="flex flex-col items-center gap-0.5 shrink-0 w-14 pt-0.5">
            <span className="text-[10px] text-muted-foreground uppercase tracking-wide leading-none">
              {visit.visited_at.toLocaleDateString("en-US", { month: "short" })}
            </span>
            <span className="text-xl font-bold text-foreground leading-none tabular-nums">
              {visit.visited_at.getDate()}
            </span>
            <span className="text-[10px] text-muted-foreground leading-none">
              {visit.visited_at.getFullYear()}
            </span>
          </div>

          {/* Right column: summary info */}
          <div className="flex-1 min-w-0">
            <div className="flex flex-wrap items-center gap-1.5 mb-1">
              <Badge variant="outline" className="text-[10px] h-4 px-1.5">
                {visitTypeLabel(visit.visit_type)}
              </Badge>
              {isSkipped ? (
                <Badge
                  variant="outline"
                  className="text-[10px] h-4 px-1.5 border-amber-500/50 text-amber-400"
                >
                  Skipped
                </Badge>
              ) : (
                <Badge
                  variant="outline"
                  className="text-[10px] h-4 px-1.5 border-green-500/50 text-green-400"
                >
                  Complete
                </Badge>
              )}
            </div>

            {/* Chemistry summary or skip reason */}
            {isSkipped && visit.skip_reason ? (
              <p className="text-xs text-muted-foreground truncate">
                {visit.skip_reason}
              </p>
            ) : chemistrySummary ? (
              <p className="text-xs text-muted-foreground font-mono truncate">
                {chemistrySummary}
              </p>
            ) : (
              <p className="text-xs text-muted-foreground italic">No readings recorded</p>
            )}
          </div>

          {/* Expand/collapse indicator */}
          <ChevronDownIcon
            className={`h-4 w-4 text-muted-foreground shrink-0 mt-0.5 transition-transform duration-200 ${
              open ? "rotate-180" : ""
            }`}
          />
        </button>
      </Collapsible.Trigger>

      {/* ── Expanded content ────────────────────────────────────────────── */}
      <Collapsible.Content className="overflow-hidden data-[state=closed]:animate-out data-[state=open]:animate-in data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0">
        <div className="px-4 pb-4 pt-0 border-t border-border/50 space-y-4">

          {/* Skipped reason (full) */}
          {isSkipped ? (
            <div className="pt-3">
              <p className="text-xs font-medium text-muted-foreground mb-1 uppercase tracking-wide">
                Skip Reason
              </p>
              <p className="text-sm text-foreground">
                {visit.skip_reason || "No reason provided."}
              </p>
            </div>
          ) : (
            <>
              {/* Chemistry readings */}
              {hasChemistry && (
                <div className="pt-3">
                  <p className="text-xs font-medium text-muted-foreground mb-2 uppercase tracking-wide">
                    Chemical Readings
                  </p>
                  <ChemistryDisplay
                    readings={visit.chemistry_readings!}
                    sanitizerType={visit.sanitizer_type}
                  />
                </div>
              )}

              {/* Checklist */}
              {hasChecklist && (
                <div>
                  <p className="text-xs font-medium text-muted-foreground mb-2 uppercase tracking-wide">
                    Checklist
                  </p>
                  <div className="space-y-1">
                    {Object.entries(visit.checklist_completion!).map(([task, done]) => (
                      <div key={task} className="flex items-center gap-2">
                        <div
                          className={`h-3.5 w-3.5 rounded-sm border flex items-center justify-center shrink-0 ${
                            done
                              ? "bg-green-500/20 border-green-500/50"
                              : "bg-muted border-border"
                          }`}
                        >
                          {done && (
                            <svg
                              viewBox="0 0 12 12"
                              fill="none"
                              className="h-2.5 w-2.5 text-green-400"
                              aria-hidden="true"
                            >
                              <path
                                d="M2 6L5 9L10 3"
                                stroke="currentColor"
                                strokeWidth="1.5"
                                strokeLinecap="round"
                                strokeLinejoin="round"
                              />
                            </svg>
                          )}
                        </div>
                        <span
                          className={`text-xs ${
                            done ? "text-foreground" : "text-muted-foreground"
                          }`}
                        >
                          {/* Humanize the task key: "brush_walls" → "Brush walls" */}
                          {task
                            .replace(/_/g, " ")
                            .replace(/\b\w/g, (c) => c.toUpperCase())}
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Photos */}
              {hasPhotos && (
                <div>
                  <p className="text-xs font-medium text-muted-foreground mb-2 uppercase tracking-wide">
                    Photos
                  </p>
                  <div className="grid grid-cols-3 sm:grid-cols-4 gap-1.5">
                    {visit.photo_urls!.map((url, idx) => (
                      <button
                        key={url}
                        type="button"
                        onClick={() => openLightboxAt(idx)}
                        className="relative aspect-square overflow-hidden rounded bg-muted cursor-pointer group focus:outline-none focus:ring-2 focus:ring-primary"
                        aria-label={`View photo ${idx + 1}`}
                      >
                        <img
                          src={url}
                          alt={`Visit photo ${idx + 1}`}
                          className="w-full h-full object-cover transition-transform duration-200 group-hover:scale-105"
                          loading="lazy"
                        />
                        <div className="absolute inset-0 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity bg-black/30">
                          <svg
                            viewBox="0 0 24 24"
                            fill="none"
                            className="h-4 w-4 text-white"
                            aria-hidden="true"
                          >
                            <path
                              d="M15 3h6v6M9 21H3v-6M21 3l-7 7M3 21l7-7"
                              stroke="currentColor"
                              strokeWidth="2"
                              strokeLinecap="round"
                              strokeLinejoin="round"
                            />
                          </svg>
                        </div>
                      </button>
                    ))}
                  </div>

                  {/* Lightbox for this visit's photos */}
                  {lightboxOpen && (
                    <Lightbox
                      open={lightboxOpen}
                      close={() => setLightboxOpen(false)}
                      index={lightboxIndex}
                      slides={photoSlides}
                      plugins={[Captions]}
                      styles={{
                        container: { backgroundColor: "rgba(0, 0, 0, 0.95)" },
                      }}
                    />
                  )}
                </div>
              )}

              {/* Tech notes */}
              {hasNotes && (
                <div>
                  <p className="text-xs font-medium text-muted-foreground mb-1 uppercase tracking-wide">
                    Technician Notes
                  </p>
                  <p className="text-sm text-foreground whitespace-pre-line">{visit.notes}</p>
                </div>
              )}
            </>
          )}

          {/* Serviced by */}
          {visit.tech_name && (
            <p className="text-xs text-muted-foreground pt-1 border-t border-border/40">
              Serviced by {visit.tech_name}
            </p>
          )}
        </div>
      </Collapsible.Content>
    </Collapsible.Root>
  )
}
