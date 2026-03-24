"use client"

import { useState } from "react"
import { SparklesIcon, ChevronDownIcon, ChevronUpIcon, AlertTriangleIcon } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  CardDescription,
} from "@/components/ui/card"
import { cn } from "@/lib/utils"
import { diagnosePoolPhoto } from "@/actions/ai-diagnosis"
import type { PoolDiagnosis, DiagnosisIssue, PoolContext } from "@/actions/ai-diagnosis"

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface PhotoDiagnosisProps {
  photoUrl: string
  poolContext?: PoolContext
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const SEVERITY_STYLES: Record<
  DiagnosisIssue["severity"],
  { badge: string; bar: string; label: string }
> = {
  severe: {
    badge: "bg-red-500/15 text-red-400 border-red-500/30",
    bar: "bg-red-500",
    label: "Severe",
  },
  moderate: {
    badge: "bg-amber-500/15 text-amber-400 border-amber-500/30",
    bar: "bg-amber-500",
    label: "Moderate",
  },
  minor: {
    badge: "bg-blue-500/15 text-blue-400 border-blue-500/30",
    bar: "bg-blue-500",
    label: "Minor",
  },
  info: {
    badge: "bg-muted/60 text-muted-foreground border-border/40",
    bar: "bg-muted-foreground",
    label: "Info",
  },
}

const CONDITION_STYLES: Record<
  PoolDiagnosis["overallCondition"],
  { badge: string; label: string }
> = {
  excellent: {
    badge: "bg-emerald-500/15 text-emerald-400 border-emerald-500/30",
    label: "Excellent",
  },
  good: {
    badge: "bg-green-500/15 text-green-400 border-green-500/30",
    label: "Good",
  },
  fair: {
    badge: "bg-amber-500/15 text-amber-400 border-amber-500/30",
    label: "Fair",
  },
  poor: {
    badge: "bg-red-500/15 text-red-400 border-red-500/30",
    label: "Poor",
  },
}

const ISSUE_TYPE_LABELS: Record<DiagnosisIssue["type"], string> = {
  algae: "Algae",
  staining: "Staining",
  equipment: "Equipment",
  waterline: "Waterline",
  debris: "Debris",
  structural: "Structural",
  other: "Other",
}

// ---------------------------------------------------------------------------
// Skeleton shimmer
// ---------------------------------------------------------------------------

function DiagnosisSkeleton() {
  return (
    <div className="flex flex-col gap-3 animate-pulse">
      {/* Condition row */}
      <div className="flex items-center gap-3">
        <div className="h-5 w-24 rounded-full bg-muted/50" />
        <div className="h-4 w-48 rounded bg-muted/40" />
      </div>
      {/* Issue cards */}
      {[0, 1].map((i) => (
        <div
          key={i}
          className="rounded-xl border border-border/40 bg-muted/10 p-4 flex flex-col gap-2"
        >
          <div className="flex items-center gap-2">
            <div className="h-5 w-16 rounded-full bg-muted/50" />
            <div className="h-4 w-32 rounded bg-muted/40" />
          </div>
          <div className="h-3.5 w-full rounded bg-muted/30" />
          <div className="h-3.5 w-4/5 rounded bg-muted/30" />
          <div className="h-3 w-3/5 rounded bg-muted/20 mt-1" />
        </div>
      ))}
    </div>
  )
}

// ---------------------------------------------------------------------------
// Issue card
// ---------------------------------------------------------------------------

function IssueCard({ issue }: { issue: DiagnosisIssue }) {
  const severity = SEVERITY_STYLES[issue.severity]

  return (
    <div className="rounded-xl border border-border/40 bg-card/50 p-4 flex flex-col gap-2.5 transition-colors">
      {/* Header row */}
      <div className="flex items-start gap-2 flex-wrap">
        {/* Severity badge */}
        <span
          className={cn(
            "inline-flex shrink-0 items-center rounded-full border px-2 py-0.5 text-xs font-medium",
            severity.badge
          )}
        >
          {severity.label}
        </span>
        {/* Issue type label */}
        <span className="inline-flex shrink-0 items-center rounded-full border border-border/40 bg-muted/30 px-2 py-0.5 text-xs font-medium text-muted-foreground">
          {ISSUE_TYPE_LABELS[issue.type]}
        </span>
        {/* Title */}
        <p className="text-sm font-medium text-foreground leading-snug">{issue.title}</p>
      </div>

      {/* Description */}
      <p className="text-sm text-muted-foreground leading-relaxed">{issue.description}</p>

      {/* Recommendation */}
      <div className="flex items-start gap-2 rounded-lg border border-border/30 bg-muted/20 px-3 py-2.5">
        <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wide shrink-0 mt-0.5">
          Action
        </span>
        <p className="text-xs text-foreground/80 leading-relaxed">{issue.recommendation}</p>
      </div>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Main component
// ---------------------------------------------------------------------------

/**
 * PhotoDiagnosis — "Analyze with AI" button that sends a photo to Claude Vision
 * and renders severity-coded findings inline beneath the photo.
 *
 * Designed for the stop workflow photo grid. Keeps the UI compact:
 * - Shows just the analyze button before activation
 * - On success: collapsible results card with condition badge + issue list
 * - On error: inline error state with retry option
 */
export function PhotoDiagnosis({ photoUrl, poolContext }: PhotoDiagnosisProps) {
  const [state, setState] = useState<
    "idle" | "loading" | "success" | "error"
  >("idle")
  const [diagnosis, setDiagnosis] = useState<PoolDiagnosis | null>(null)
  const [errorMessage, setErrorMessage] = useState<string | null>(null)
  const [isCollapsed, setIsCollapsed] = useState(false)

  const handleAnalyze = async () => {
    setState("loading")
    setErrorMessage(null)

    const result = await diagnosePoolPhoto(photoUrl, poolContext)

    if (result.success && result.diagnosis) {
      setDiagnosis(result.diagnosis)
      setState("success")
      setIsCollapsed(false)
    } else {
      setErrorMessage(result.error ?? "Analysis failed")
      setState("error")
    }
  }

  // ── Idle: show analyze button ────────────────────────────────────────────
  if (state === "idle") {
    return (
      <Button
        type="button"
        variant="outline"
        size="sm"
        onClick={handleAnalyze}
        className="gap-1.5 text-xs"
      >
        <SparklesIcon className="size-3.5 shrink-0" />
        Analyze with AI
      </Button>
    )
  }

  // ── Loading: shimmer skeleton ─────────────────────────────────────────────
  if (state === "loading") {
    return (
      <Card className="border-border/50">
        <CardHeader className="pb-0">
          <div className="flex items-center gap-2">
            <SparklesIcon className="size-4 shrink-0 text-primary animate-pulse" />
            <CardTitle className="text-sm">Analyzing photo…</CardTitle>
          </div>
          <CardDescription className="text-xs">
            AI is examining the pool for issues
          </CardDescription>
        </CardHeader>
        <CardContent>
          <DiagnosisSkeleton />
        </CardContent>
      </Card>
    )
  }

  // ── Error: inline error with retry ────────────────────────────────────────
  if (state === "error") {
    return (
      <div className="flex items-start gap-3 rounded-xl border border-red-500/25 bg-red-500/8 px-4 py-3">
        <AlertTriangleIcon className="size-4 text-red-400 shrink-0 mt-0.5" />
        <div className="flex flex-col gap-1.5 flex-1 min-w-0">
          <p className="text-sm font-medium text-red-400">Analysis failed</p>
          <p className="text-xs text-muted-foreground">
            {errorMessage ?? "Something went wrong. Try again."}
          </p>
        </div>
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={() => setState("idle")}
          className="shrink-0 text-xs"
        >
          Retry
        </Button>
      </div>
    )
  }

  // ── Success: results card ─────────────────────────────────────────────────
  if (state === "success" && diagnosis) {
    const conditionStyle = CONDITION_STYLES[diagnosis.overallCondition]
    const hasIssues = diagnosis.issues.length > 0

    // Sort issues: severe first, then moderate, minor, info
    const SEVERITY_ORDER: DiagnosisIssue["severity"][] = [
      "severe",
      "moderate",
      "minor",
      "info",
    ]
    const sortedIssues = [...diagnosis.issues].sort(
      (a, b) =>
        SEVERITY_ORDER.indexOf(a.severity) - SEVERITY_ORDER.indexOf(b.severity)
    )

    return (
      <Card className="border-border/50">
        {/* Header with collapse toggle */}
        <CardHeader className="pb-0">
          <div className="flex items-center gap-2">
            <SparklesIcon className="size-4 shrink-0 text-primary" />
            <CardTitle className="text-sm flex-1">AI Analysis</CardTitle>
            {/* Overall condition badge */}
            <span
              className={cn(
                "inline-flex items-center rounded-full border px-2 py-0.5 text-xs font-medium",
                conditionStyle.badge
              )}
            >
              {conditionStyle.label}
            </span>
            {/* Collapse toggle */}
            <button
              type="button"
              onClick={() => setIsCollapsed((c) => !c)}
              className="flex items-center justify-center h-7 w-7 rounded-md hover:bg-muted/50 text-muted-foreground transition-colors cursor-pointer"
              aria-label={isCollapsed ? "Expand analysis" : "Collapse analysis"}
            >
              {isCollapsed ? (
                <ChevronDownIcon className="size-4" />
              ) : (
                <ChevronUpIcon className="size-4" />
              )}
            </button>
          </div>
          {!isCollapsed && (
            <CardDescription className="text-xs leading-relaxed">
              {diagnosis.summary}
            </CardDescription>
          )}
        </CardHeader>

        {!isCollapsed && (
          <CardContent>
            {hasIssues ? (
              <div className="flex flex-col gap-3">
                {sortedIssues.map((issue, i) => (
                  <IssueCard key={i} issue={issue} />
                ))}
              </div>
            ) : (
              <div className="flex items-center gap-3 rounded-xl border border-emerald-500/20 bg-emerald-500/8 px-4 py-3">
                <span className="text-lg" role="img" aria-label="No issues found">
                  ✓
                </span>
                <p className="text-sm text-emerald-400">
                  No issues detected — pool looks good
                </p>
              </div>
            )}

            {/* Re-analyze option */}
            <div className="mt-3 flex justify-end">
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={() => setState("idle")}
                className="text-xs text-muted-foreground hover:text-foreground gap-1.5"
              >
                <SparklesIcon className="size-3" />
                Re-analyze
              </Button>
            </div>
          </CardContent>
        )}
      </Card>
    )
  }

  return null
}
