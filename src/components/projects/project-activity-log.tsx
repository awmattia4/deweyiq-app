"use client"

/**
 * ProjectActivityLog — Immutable event timeline for the project detail page.
 *
 * Renders the activity_log JSONB array stored on the projects row.
 * Per PROJ-91: all entries are append-only — never edited or deleted.
 * Newest entries appear first. Text-only, no decorative icons per user preferences.
 */

// ─── Activity type → readable label ───────────────────────────────────────────

const ACTIVITY_LABELS: Record<string, string> = {
  created: "Project created",
  stage_changed: "Stage changed",
  put_on_hold: "Placed on hold",
  resumed: "Project resumed",
  site_notes_updated: "Site notes updated",
  phase_created: "Phase added",
  phase_updated: "Phase updated",
  phase_skipped: "Phase removed",
  phase_complete: "Phase completed",
  note_added: "Note added",
  document_uploaded: "Document uploaded",
  proposal_sent: "Proposal sent",
  proposal_approved: "Proposal approved",
  deposit_received: "Deposit received",
  permit_submitted: "Permit submitted",
  permit_approved: "Permit approved",
  inspection_scheduled: "Inspection scheduled",
  inspection_passed: "Inspection passed",
  inspection_failed: "Inspection failed",
  change_order_created: "Change order created",
  change_order_approved: "Change order approved",
  milestone_paid: "Milestone paid",
  warranty_issued: "Warranty issued",
}

interface ActivityLogEntry {
  type: string
  at: string
  by_id: string
  note: string | null
}

interface ProjectActivityLogProps {
  activityLog: ActivityLogEntry[]
  projectId: string
}

export function ProjectActivityLog({ activityLog }: ProjectActivityLogProps) {
  if (activityLog.length === 0) {
    return (
      <p className="text-sm text-muted-foreground italic">No activity recorded yet.</p>
    )
  }

  // Newest first — reverse without mutating
  const reversed = activityLog.slice().reverse()

  return (
    <div className="flex flex-col">
      {reversed.map((entry, i) => {
        const label = ACTIVITY_LABELS[entry.type] ?? entry.type.replace(/_/g, " ")
        const date = formatActivityDate(entry.at)

        return (
          <div
            key={i}
            className="flex gap-3 py-3 border-b border-border last:border-0"
          >
            {/* Timeline dot */}
            <div className="flex-shrink-0 flex flex-col items-center pt-1">
              <div className="w-2 h-2 rounded-full bg-muted-foreground/40 mt-0.5" />
              {i < reversed.length - 1 && (
                <div className="w-px flex-1 bg-border mt-1" />
              )}
            </div>

            {/* Content */}
            <div className="flex-1 min-w-0 pb-1">
              <div className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5">
                <span className="text-sm font-medium">{label}</span>
                <span className="text-xs text-muted-foreground">{date}</span>
              </div>
              {entry.note && entry.note !== label && (
                <p className="text-sm text-muted-foreground mt-0.5">{entry.note}</p>
              )}
            </div>
          </div>
        )
      })}
    </div>
  )
}

// ─── Helper ────────────────────────────────────────────────────────────────────

function formatActivityDate(isoString: string): string {
  try {
    const date = new Date(isoString)
    const now = new Date()
    const diffMs = now.getTime() - date.getTime()
    const diffMinutes = Math.floor(diffMs / (1000 * 60))
    const diffHours = Math.floor(diffMs / (1000 * 60 * 60))
    const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24))

    if (diffMinutes < 1) return "just now"
    if (diffMinutes < 60) return `${diffMinutes}m ago`
    if (diffHours < 24) return `${diffHours}h ago`
    if (diffDays < 7) return `${diffDays}d ago`

    return date.toLocaleDateString("en-US", {
      month: "short",
      day: "numeric",
      year: date.getFullYear() !== now.getFullYear() ? "numeric" : undefined,
    })
  } catch {
    return isoString
  }
}
