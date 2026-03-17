"use client"

/**
 * ProjectBriefing — daily project briefing card shown at the top of the Projects tab.
 *
 * Shows:
 * - Today's phases and task progress
 * - Materials needed (estimated vs used)
 * - Subs on site today
 * - Upcoming inspections (next 3 days)
 *
 * Text-only, clean layout per user aesthetic preferences.
 * Phase 12 Plan 12 (PROJ-53)
 */

import type { ProjectBriefingData } from "@/actions/projects-field"

interface ProjectBriefingProps {
  briefing: ProjectBriefingData
  today: string
}

export function ProjectBriefing({ briefing, today }: ProjectBriefingProps) {
  const hasContent =
    briefing.todayPhases.length > 0 ||
    briefing.materialsNeeded.length > 0 ||
    briefing.subsOnSite.length > 0 ||
    briefing.upcomingInspections.length > 0

  if (!hasContent) return null

  return (
    <div className="rounded-2xl border border-border/60 bg-card p-4 space-y-4">
      <div>
        <h2 className="text-sm font-semibold text-foreground">Today's Briefing</h2>
        <p className="text-xs text-muted-foreground">{today}</p>
      </div>

      {/* Phases overview */}
      {briefing.todayPhases.length > 0 && (
        <div className="space-y-2">
          <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
            Active Phases
          </p>
          <div className="space-y-2">
            {briefing.todayPhases.map((phase) => {
              const pct =
                phase.tasksTotal > 0
                  ? Math.round((phase.tasksComplete / phase.tasksTotal) * 100)
                  : 0
              return (
                <div
                  key={phase.phaseId}
                  className="flex items-start gap-3"
                >
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-medium text-foreground truncate">
                      {phase.phaseName}
                    </p>
                    <p className="text-xs text-muted-foreground truncate">
                      {phase.customerName} · {phase.projectName}
                    </p>
                  </div>
                  <div className="text-right shrink-0">
                    <p className="text-sm font-medium text-foreground">
                      {phase.tasksComplete}/{phase.tasksTotal}
                    </p>
                    <p className="text-xs text-muted-foreground">{pct}% done</p>
                  </div>
                </div>
              )
            })}
          </div>
        </div>
      )}

      {/* Materials needed */}
      {briefing.materialsNeeded.length > 0 && (
        <div className="space-y-2">
          <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
            Materials Needed
          </p>
          <div className="space-y-1">
            {briefing.materialsNeeded.slice(0, 5).map((m, i) => (
              <div key={i} className="flex items-center justify-between gap-3">
                <p className="text-sm text-foreground truncate">
                  {m.materialName}
                  <span className="text-muted-foreground ml-1.5 text-xs">
                    ({m.projectName})
                  </span>
                </p>
                <p className="text-sm text-muted-foreground shrink-0">
                  {parseFloat(m.quantityNeeded).toFixed(2)} {m.unit}
                </p>
              </div>
            ))}
            {briefing.materialsNeeded.length > 5 && (
              <p className="text-xs text-muted-foreground italic">
                +{briefing.materialsNeeded.length - 5} more materials
              </p>
            )}
          </div>
        </div>
      )}

      {/* Subs on site */}
      {briefing.subsOnSite.length > 0 && (
        <div className="space-y-2">
          <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
            Subcontractors On Site
          </p>
          <div className="space-y-1">
            {briefing.subsOnSite.map((s, i) => (
              <div key={i} className="text-sm">
                <span className="text-foreground">{s.subName}</span>
                {s.scopeOfWork && (
                  <span className="text-muted-foreground ml-1.5">— {s.scopeOfWork}</span>
                )}
                <span className="text-muted-foreground ml-1.5 text-xs">
                  ({s.projectName})
                </span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Upcoming inspections */}
      {briefing.upcomingInspections.length > 0 && (
        <div className="space-y-2">
          <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
            Upcoming Inspections
          </p>
          <div className="space-y-1">
            {briefing.upcomingInspections.map((insp, i) => (
              <div key={i} className="flex items-center justify-between gap-3">
                <p className="text-sm text-foreground truncate capitalize">
                  {insp.inspectionType.replace(/_/g, " ")} inspection
                  <span className="text-muted-foreground ml-1.5 text-xs">
                    ({insp.projectName})
                  </span>
                </p>
                {insp.scheduledDate && (
                  <p className="text-xs text-amber-400 shrink-0 font-medium">
                    {insp.scheduledDate}
                  </p>
                )}
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
