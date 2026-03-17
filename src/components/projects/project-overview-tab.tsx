"use client"

import { useState, useTransition } from "react"
import Link from "next/link"
import { toast } from "sonner"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Label } from "@/components/ui/label"
import { Input } from "@/components/ui/input"
import { Textarea } from "@/components/ui/textarea"
import {
  updateProjectSiteNotes,
  suggestServiceAgreement,
} from "@/actions/projects"
import type { ProjectDetail } from "@/actions/projects"
import { PROJECT_TYPE_LABELS, PROJECT_STAGE_LABELS } from "@/lib/projects-constants"

// ─── Site notes field config ───────────────────────────────────────────────────

const SITE_NOTES_FIELDS: Array<{
  key: string
  label: string
  placeholder: string
  multiline?: boolean
}> = [
  { key: "gate_code", label: "Gate Code", placeholder: "e.g. #1234 or tap 5 times" },
  { key: "access_instructions", label: "Access Instructions", placeholder: "How to enter the property...", multiline: true },
  { key: "utility_locations", label: "Utility Locations", placeholder: "Gas shutoff, electrical panel, water main..." },
  { key: "dig_alert_number", label: "Dig Alert Number", placeholder: "811 ticket or call-before-you-dig number" },
  { key: "hoa_contact", label: "HOA Contact", placeholder: "Name and phone number for HOA" },
  { key: "neighbor_notification", label: "Neighbor Notification", placeholder: "Any neighbors who need to be notified..." },
  { key: "parking_instructions", label: "Parking Instructions", placeholder: "Where crew should park..." },
  { key: "custom_notes", label: "Additional Notes", placeholder: "Any other site-specific information...", multiline: true },
]

interface ProjectOverviewTabProps {
  project: ProjectDetail
  onProjectUpdate: (project: ProjectDetail) => void
}

/**
 * ProjectOverviewTab — Left column: project summary + progress.
 * Right column: site notes editor (PROJ-52).
 * Bottom: daily briefing (PROJ-53).
 * If complete + no service agreement: recurring service prompt (PROJ-78).
 */
export function ProjectOverviewTab({ project, onProjectUpdate }: ProjectOverviewTabProps) {
  const [siteNotes, setSiteNotes] = useState<Record<string, string>>(project.site_notes ?? {})
  const [siteNotesEditing, setSiteNotesEditing] = useState(false)
  const [isPending, startTransition] = useTransition()
  const [showServicePrompt, setShowServicePrompt] = useState(false)
  const [checkedServiceAgreement, setCheckedServiceAgreement] = useState(false)

  // Check service agreement suggestion for completed projects
  if (project.status === "complete" && !checkedServiceAgreement) {
    setCheckedServiceAgreement(true)
    suggestServiceAgreement(project.id).then(({ shouldSuggest }) => {
      if (shouldSuggest) setShowServicePrompt(true)
    })
  }

  // Compute phases progress
  const totalPhases = project.phases.length
  const completedPhases = project.phases.filter((p) => p.status === "complete").length
  const progressPct = totalPhases > 0 ? Math.round((completedPhases / totalPhases) * 100) : 0

  function handleSiteNotesSave() {
    startTransition(async () => {
      const result = await updateProjectSiteNotes(project.id, siteNotes)
      if (!result.success) {
        toast.error(result.error ?? "Failed to save site notes")
      } else {
        toast.success("Site notes saved")
        setSiteNotesEditing(false)
        onProjectUpdate({ ...project, site_notes: siteNotes })
      }
    })
  }

  // Today's active phases (in_progress)
  const todayActivePhases = project.phases.filter((p) => p.status === "in_progress")

  return (
    <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
      {/* ── Left column ──────────────────────────────────────────────── */}
      <div className="flex flex-col gap-6">

        {/* Project summary card */}
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base">Project Summary</CardTitle>
          </CardHeader>
          <CardContent className="flex flex-col gap-3">
            <div className="grid grid-cols-2 gap-x-4 gap-y-2 text-sm">
              <div>
                <span className="text-muted-foreground">Type</span>
                <p className="font-medium mt-0.5">
                  {PROJECT_TYPE_LABELS[project.project_type] ?? project.project_type}
                </p>
              </div>
              <div>
                <span className="text-muted-foreground">Stage</span>
                <p className="font-medium mt-0.5">
                  {PROJECT_STAGE_LABELS[project.stage] ?? project.stage}
                </p>
              </div>
              {project.contract_amount && (
                <div>
                  <span className="text-muted-foreground">Contract Amount</span>
                  <p className="font-medium mt-0.5">
                    ${parseFloat(project.contract_amount).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                  </p>
                </div>
              )}
              {project.retainage_pct && (
                <div>
                  <span className="text-muted-foreground">Retainage</span>
                  <p className="font-medium mt-0.5">{parseFloat(project.retainage_pct)}%</p>
                </div>
              )}
              {project.estimated_start_date && (
                <div>
                  <span className="text-muted-foreground">Scheduled Start</span>
                  <p className="font-medium mt-0.5">{formatDate(project.estimated_start_date)}</p>
                </div>
              )}
              {project.estimated_completion_date && (
                <div>
                  <span className="text-muted-foreground">Scheduled Completion</span>
                  <p className="font-medium mt-0.5">{formatDate(project.estimated_completion_date)}</p>
                </div>
              )}
              {project.actual_start_date && (
                <div>
                  <span className="text-muted-foreground">Actual Start</span>
                  <p className="font-medium mt-0.5">{formatDate(project.actual_start_date)}</p>
                </div>
              )}
              {project.actual_completion_date && (
                <div>
                  <span className="text-muted-foreground">Actual Completion</span>
                  <p className="font-medium mt-0.5">{formatDate(project.actual_completion_date)}</p>
                </div>
              )}
              {project.lead_source && (
                <div>
                  <span className="text-muted-foreground">Lead Source</span>
                  <p className="font-medium mt-0.5 capitalize">{project.lead_source.replace("_", " ")}</p>
                </div>
              )}
              {project.financing_status && (
                <div>
                  <span className="text-muted-foreground">Financing</span>
                  <p className="font-medium mt-0.5 capitalize">{project.financing_status.replace("_", " ")}</p>
                </div>
              )}
            </div>

            {/* Phase progress bar */}
            {totalPhases > 0 && (
              <div className="flex flex-col gap-1.5 pt-2 border-t border-border">
                <div className="flex justify-between text-xs text-muted-foreground">
                  <span>Phase Progress</span>
                  <span>{completedPhases} / {totalPhases} phases complete</span>
                </div>
                <div className="h-2 rounded-full bg-muted overflow-hidden">
                  <div
                    className="h-full rounded-full bg-primary transition-all"
                    style={{ width: `${progressPct}%` }}
                  />
                </div>
              </div>
            )}

            {/* Lead notes */}
            {project.lead_notes && (
              <div className="pt-2 border-t border-border">
                <span className="text-xs text-muted-foreground">Lead Notes</span>
                <p className="text-sm mt-1 text-muted-foreground">{project.lead_notes}</p>
              </div>
            )}
          </CardContent>
        </Card>

        {/* Daily briefing card (PROJ-53) */}
        {todayActivePhases.length > 0 && (
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-base">Today's Briefing</CardTitle>
            </CardHeader>
            <CardContent className="flex flex-col gap-3 text-sm">
              <div>
                <span className="text-muted-foreground">Active Phases Today</span>
                <ul className="mt-1.5 space-y-1">
                  {todayActivePhases.map((phase) => (
                    <li key={phase.id} className="font-medium">
                      {phase.name}
                      {phase.techName && (
                        <span className="font-normal text-muted-foreground">
                          {" "}— {phase.techName}
                        </span>
                      )}
                    </li>
                  ))}
                </ul>
              </div>

              {/* Pending tasks across active phases */}
              {todayActivePhases.some((p) => p.tasks.some((t) => !t.is_completed && t.is_required)) && (
                <div>
                  <span className="text-muted-foreground">Outstanding Required Tasks</span>
                  <ul className="mt-1.5 space-y-1">
                    {todayActivePhases.flatMap((phase) =>
                      phase.tasks
                        .filter((t) => !t.is_completed && t.is_required)
                        .map((task) => (
                          <li key={task.id} className="text-muted-foreground">
                            {task.name}
                            <span className="text-xs ml-1 text-muted-foreground/60">
                              ({phase.name})
                            </span>
                          </li>
                        ))
                    )}
                  </ul>
                </div>
              )}
            </CardContent>
          </Card>
        )}

        {/* Recurring service prompt (PROJ-78) */}
        {showServicePrompt && (
          <Card className="border-primary/30 bg-primary/5">
            <CardContent className="pt-5 pb-5">
              <p className="text-sm font-medium">Offer Recurring Service</p>
              <p className="text-sm text-muted-foreground mt-1">
                This project is complete and the customer doesn't have an active service agreement.
                Consider offering ongoing maintenance.
              </p>
              <div className="flex gap-2 mt-3">
                <Button size="sm" asChild>
                  <Link href={`/customers/${project.customer_id}`}>
                    View Customer
                  </Link>
                </Button>
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={() => setShowServicePrompt(false)}
                >
                  Dismiss
                </Button>
              </div>
            </CardContent>
          </Card>
        )}
      </div>

      {/* ── Right column: Site Notes ──────────────────────────────────── */}
      <div className="flex flex-col gap-6">
        <Card>
          <CardHeader className="pb-3">
            <div className="flex items-center justify-between">
              <CardTitle className="text-base">Site Notes</CardTitle>
              {!siteNotesEditing && (
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => setSiteNotesEditing(true)}
                >
                  Edit
                </Button>
              )}
            </div>
          </CardHeader>
          <CardContent className="flex flex-col gap-4">
            {siteNotesEditing ? (
              <>
                {SITE_NOTES_FIELDS.map((field) => (
                  <div key={field.key} className="flex flex-col gap-1.5">
                    <Label htmlFor={`site-${field.key}`}>{field.label}</Label>
                    {field.multiline ? (
                      <Textarea
                        id={`site-${field.key}`}
                        placeholder={field.placeholder}
                        value={siteNotes[field.key] ?? ""}
                        onChange={(e) =>
                          setSiteNotes((prev) => ({
                            ...prev,
                            [field.key]: e.target.value,
                          }))
                        }
                        rows={2}
                        className="text-sm"
                      />
                    ) : (
                      <Input
                        id={`site-${field.key}`}
                        placeholder={field.placeholder}
                        value={siteNotes[field.key] ?? ""}
                        onChange={(e) =>
                          setSiteNotes((prev) => ({
                            ...prev,
                            [field.key]: e.target.value,
                          }))
                        }
                        className="text-sm"
                      />
                    )}
                  </div>
                ))}
                <div className="flex justify-end gap-2 pt-2">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => {
                      setSiteNotes(project.site_notes ?? {})
                      setSiteNotesEditing(false)
                    }}
                  >
                    Cancel
                  </Button>
                  <Button size="sm" onClick={handleSiteNotesSave} disabled={isPending}>
                    Save
                  </Button>
                </div>
              </>
            ) : (
              <div className="flex flex-col gap-3">
                {SITE_NOTES_FIELDS.filter(
                  (f) => siteNotes[f.key]?.trim()
                ).length === 0 ? (
                  <p className="text-sm text-muted-foreground italic">
                    No site notes added yet. Click Edit to add gate codes, utility locations, and other
                    site-specific information.
                  </p>
                ) : (
                  SITE_NOTES_FIELDS.filter((f) => siteNotes[f.key]?.trim()).map(
                    (field) => (
                      <div key={field.key}>
                        <span className="text-xs text-muted-foreground">{field.label}</span>
                        <p className="text-sm mt-0.5">{siteNotes[field.key]}</p>
                      </div>
                    )
                  )
                )}
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  )
}

// ─── Helper ────────────────────────────────────────────────────────────────────

function formatDate(dateStr: string): string {
  try {
    const [year, month, day] = dateStr.split("-").map(Number)
    const date = new Date(year, month - 1, day)
    return date.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })
  } catch {
    return dateStr
  }
}
