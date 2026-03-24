"use client"

/**
 * ChemistryPrediction — AI-powered pre-visit chemistry forecast card.
 *
 * Displays predicted chemistry readings and preload recommendations
 * for a tech before they start a stop. Fetches from the predictChemistryNeeds
 * server action on mount.
 *
 * Design: compact, dark-first, field-readable.
 * Color coding: green = stable/good, amber = drifting, red = concerning.
 */

import { useEffect, useState } from "react"
import { cn } from "@/lib/utils"
import { predictChemistryNeeds } from "@/actions/ai-chemistry-predict"
import type { ChemistryPredictions } from "@/actions/ai-chemistry-predict"

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface ChemistryPredictionProps {
  poolId: string
}

// ---------------------------------------------------------------------------
// Parameter display metadata (label lookup)
// ---------------------------------------------------------------------------

const PARAM_LABELS: Record<string, string> = {
  freeChlorine: "Free Chlorine",
  bromine: "Bromine",
  pH: "pH",
  totalAlkalinity: "Total Alkalinity",
  cya: "Cyanuric Acid",
  calciumHardness: "Calcium Hardness",
  phosphates: "Phosphates",
  salt: "Salt",
  tds: "TDS",
  temperatureF: "Temperature",
}

// ---------------------------------------------------------------------------
// Sub-components
// ---------------------------------------------------------------------------

function TrendArrow({ trend }: { trend: "rising" | "stable" | "falling" }) {
  if (trend === "rising") return <span className="text-amber-400 font-bold">▲</span>
  if (trend === "falling") return <span className="text-blue-400 font-bold">▼</span>
  return <span className="text-muted-foreground">─</span>
}

function ConfidenceDot({ confidence }: { confidence: "high" | "medium" | "low" }) {
  const colorClass =
    confidence === "high"
      ? "bg-green-500"
      : confidence === "medium"
        ? "bg-amber-500"
        : "bg-muted-foreground/40"

  const label =
    confidence === "high" ? "High confidence" : confidence === "medium" ? "Medium confidence" : "Low confidence"

  return (
    <span
      className={cn("inline-block w-2 h-2 rounded-full shrink-0", colorClass)}
      title={label}
      aria-label={label}
    />
  )
}

function SkeletonRow() {
  return (
    <div className="flex items-center gap-3 py-2 border-b border-border/30 last:border-0 animate-pulse">
      <div className="h-3.5 w-28 bg-muted/40 rounded" />
      <div className="ml-auto h-3.5 w-10 bg-muted/40 rounded" />
      <div className="h-3.5 w-4 bg-muted/30 rounded" />
      <div className="h-2 w-2 rounded-full bg-muted/30" />
    </div>
  )
}

// ---------------------------------------------------------------------------
// Main component
// ---------------------------------------------------------------------------

export function ChemistryPrediction({ poolId }: ChemistryPredictionProps) {
  const [predictions, setPredictions] = useState<ChemistryPredictions | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false

    async function load() {
      setLoading(true)
      setError(null)
      try {
        const result = await predictChemistryNeeds(poolId)
        if (cancelled) return

        if (result.success && result.predictions) {
          setPredictions(result.predictions)
        } else {
          setError(result.error ?? "Failed to load predictions")
        }
      } catch (err) {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : "Unexpected error")
        }
      } finally {
        if (!cancelled) setLoading(false)
      }
    }

    load()
    return () => {
      cancelled = true
    }
  }, [poolId])

  // ---------------------------------------------------------------------------
  // Loading state
  // ---------------------------------------------------------------------------

  if (loading) {
    return (
      <div className="rounded-xl border border-border/60 bg-card overflow-hidden">
        <div className="px-4 py-3 border-b border-border/40 bg-muted/20">
          <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            AI Predictions
          </p>
        </div>
        <div className="px-4 py-3 space-y-1">
          {Array.from({ length: 4 }).map((_, i) => (
            <SkeletonRow key={i} />
          ))}
          <div className="pt-2 animate-pulse">
            <div className="h-3 w-full bg-muted/30 rounded mb-1" />
            <div className="h-3 w-3/4 bg-muted/30 rounded" />
          </div>
        </div>
      </div>
    )
  }

  // ---------------------------------------------------------------------------
  // Insufficient data / error state
  // ---------------------------------------------------------------------------

  if (error || !predictions) {
    return (
      <div className="rounded-xl border border-border/60 bg-card overflow-hidden">
        <div className="px-4 py-3 border-b border-border/40 bg-muted/20">
          <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            AI Predictions
          </p>
        </div>
        <div className="px-4 py-4">
          <p className="text-sm text-muted-foreground italic">
            {error?.includes("Insufficient history") || error?.includes("at least 3")
              ? "Not enough visit history yet. Predictions will appear after 3 or more service visits."
              : "Predictions unavailable for this visit."}
          </p>
        </div>
      </div>
    )
  }

  const { expectedReadings, recommendedPreload, alerts, insights } = predictions
  const readingEntries = Object.entries(expectedReadings)

  // Determine severity colors per reading based on alerts
  const alertMap = new Map(alerts.map((a) => [a.param, a.severity]))

  // Sort readings: concerning first (with alerts), then stable
  const sortedReadings = [...readingEntries].sort(([aKey], [bKey]) => {
    const aAlert = alertMap.get(aKey) ?? "none"
    const bAlert = alertMap.get(bKey) ?? "none"
    const rank = (s: string) => (s === "warning" ? 0 : s === "info" ? 1 : 2)
    return rank(aAlert) - rank(bAlert)
  })

  return (
    <div className="rounded-xl border border-border/60 bg-card overflow-hidden">
      {/* Header */}
      <div className="px-4 py-3 border-b border-border/40 bg-muted/20 flex items-center justify-between">
        <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
          AI Predictions
        </p>
        <span className="text-[10px] text-muted-foreground/50">Based on last {readingEntries.length > 0 ? "visits" : "data"}</span>
      </div>

      {/* Predicted readings table */}
      {sortedReadings.length > 0 && (
        <div className="divide-y divide-border/30">
          {sortedReadings.map(([param, pred]) => {
            const label = PARAM_LABELS[param] ?? param
            const alertSeverity = alertMap.get(param)

            let rowColorClass = "text-foreground"
            let valueColorClass = "text-foreground tabular-nums"

            if (alertSeverity === "warning") {
              rowColorClass = "text-red-300"
              valueColorClass = "text-red-300 tabular-nums font-semibold"
            } else if (alertSeverity === "info") {
              rowColorClass = "text-amber-300"
              valueColorClass = "text-amber-300 tabular-nums font-semibold"
            } else if (pred.trend === "stable" && !alertSeverity) {
              valueColorClass = "text-green-400/90 tabular-nums"
            }

            return (
              <div
                key={param}
                className="flex items-center gap-2 px-4 py-2 min-h-[40px]"
              >
                <span className={cn("text-sm flex-1 min-w-0 truncate", rowColorClass)}>
                  {label}
                </span>
                <span className={cn("text-sm shrink-0", valueColorClass)}>
                  {pred.predicted}
                </span>
                <TrendArrow trend={pred.trend} />
                <ConfidenceDot confidence={pred.confidence} />
              </div>
            )
          })}
        </div>
      )}

      {/* Alerts */}
      {alerts.length > 0 && (
        <div className="px-4 py-3 border-t border-border/40 space-y-1.5">
          {alerts.map((alert, i) => (
            <div
              key={i}
              className={cn(
                "flex items-start gap-2 text-xs rounded-md px-2.5 py-1.5",
                alert.severity === "warning"
                  ? "bg-red-500/10 text-red-300 border border-red-500/20"
                  : "bg-amber-500/10 text-amber-300 border border-amber-500/20"
              )}
            >
              <span className="shrink-0 mt-0.5">
                {alert.severity === "warning" ? "!" : "·"}
              </span>
              <span>{alert.message}</span>
            </div>
          ))}
        </div>
      )}

      {/* Recommended preload */}
      {recommendedPreload.length > 0 && (
        <div className="px-4 py-3 border-t border-border/40">
          <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground mb-2">
            Load on Truck
          </p>
          <div className="space-y-1.5">
            {recommendedPreload.map((item, i) => (
              <div key={i} className="flex items-start gap-2">
                <span className="text-sm font-medium shrink-0">
                  {item.amount} {item.unit}
                </span>
                <div className="min-w-0">
                  <span className="text-sm text-foreground">{item.chemical}</span>
                  {item.reason && (
                    <p className="text-xs text-muted-foreground truncate">{item.reason}</p>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* AI insight */}
      {insights && (
        <div className="px-4 py-3 border-t border-border/40 bg-muted/10">
          <p className="text-xs text-muted-foreground italic leading-relaxed">{insights}</p>
        </div>
      )}

      {/* Legend */}
      <div className="px-4 py-2 border-t border-border/30 bg-muted/10">
        <div className="flex items-center gap-3 text-[10px] text-muted-foreground/50">
          <span>▲ rising</span>
          <span>▼ falling</span>
          <span>─ stable</span>
          <span className="flex items-center gap-1">
            <span className="inline-block w-1.5 h-1.5 rounded-full bg-green-500" /> high confidence
          </span>
          <span className="flex items-center gap-1">
            <span className="inline-block w-1.5 h-1.5 rounded-full bg-amber-500" /> medium
          </span>
        </div>
      </div>
    </div>
  )
}
