"use client"

import { useState } from "react"
import Link from "next/link"
import { XIcon } from "lucide-react"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import type { ChurnPrediction, ChurnSummary } from "@/actions/ai-churn"

// ─── Types ─────────────────────────────────────────────────────────────────────

interface ChurnPredictionsProps {
  predictions: ChurnPrediction[]
  summary: ChurnSummary
}

// ─── Risk badge ────────────────────────────────────────────────────────────────

function RiskBadge({ level }: { level: ChurnPrediction["riskLevel"] }) {
  if (level === "high") {
    return (
      <Badge
        variant="outline"
        className="shrink-0 text-xs border-red-400/40 bg-red-400/10 text-red-400"
      >
        High
      </Badge>
    )
  }
  if (level === "medium") {
    return (
      <Badge
        variant="outline"
        className="shrink-0 text-xs border-amber-400/40 bg-amber-400/10 text-amber-400"
      >
        Medium
      </Badge>
    )
  }
  return (
    <Badge variant="outline" className="shrink-0 text-xs">
      Low
    </Badge>
  )
}

// ─── Customer row ──────────────────────────────────────────────────────────────

function CustomerRow({ prediction, onDismiss }: { prediction: ChurnPrediction; onDismiss: (e: React.MouseEvent, id: string) => void }) {
  const {
    customerId,
    customerName,
    riskLevel,
    factors,
    daysSinceLastService,
    recommendation,
  } = prediction

  return (
    <Link
      href={`/customers/${customerId}`}
      className="flex flex-col gap-1.5 rounded-lg border border-border bg-card px-4 py-3.5 hover:border-border/60 hover:bg-muted/30 transition-colors"
    >
      {/* Name + badge row */}
      <div className="flex items-center gap-2 justify-between">
        <span className="text-sm font-medium text-foreground leading-tight truncate">
          {customerName}
        </span>
        <div className="flex items-center gap-1.5 shrink-0">
          <RiskBadge level={riskLevel} />
          <button
            onClick={(e) => onDismiss(e, customerId)}
            className="p-0.5 rounded-sm text-muted-foreground hover:text-foreground hover:bg-muted transition-colors"
            title="Dismiss"
          >
            <XIcon className="h-3.5 w-3.5" />
          </button>
        </div>
      </div>

      {/* Risk factor chips */}
      {factors.length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          {factors.map((factor) => (
            <span
              key={factor}
              className="inline-flex text-xs text-muted-foreground bg-muted/60 border border-border/50 rounded px-1.5 py-0.5 leading-tight"
            >
              {factor}
            </span>
          ))}
        </div>
      )}

      {/* AI recommendation */}
      <p className="text-xs text-muted-foreground italic leading-relaxed">
        {recommendation}
      </p>

      {/* Last service */}
      {daysSinceLastService !== null && (
        <p className="text-xs text-muted-foreground">
          Last service:{" "}
          <span className="font-medium text-foreground">
            {daysSinceLastService === 0
              ? "today"
              : daysSinceLastService === 1
              ? "yesterday"
              : `${daysSinceLastService} days ago`}
          </span>
        </p>
      )}
    </Link>
  )
}

// ─── Main component ────────────────────────────────────────────────────────────

/**
 * ChurnPredictions — Dashboard card surfacing at-risk customers with
 * AI-generated retention recommendations.
 *
 * Rendered server-side on the dashboard page. Props are pre-fetched
 * by getChurnPredictions() in the page server component.
 *
 * Design rules (MEMORY.md):
 * - No icons next to section headers
 * - Dark-first — badge colors use /10 bg + /40 border tints
 * - Empty state uses text-sm text-muted-foreground italic
 * - Clickable cards over buttons
 */
export function ChurnPredictions({ predictions, summary }: ChurnPredictionsProps) {
  const [dismissedIds, setDismissedIds] = useState<Set<string>>(() => {
    if (typeof window === "undefined") return new Set()
    try {
      const saved = localStorage.getItem("churn-dismissed")
      return saved ? new Set(JSON.parse(saved) as string[]) : new Set()
    } catch {
      return new Set()
    }
  })

  function dismissCustomer(e: React.MouseEvent, customerId: string) {
    e.preventDefault()
    e.stopPropagation()
    const next = new Set(dismissedIds)
    next.add(customerId)
    setDismissedIds(next)
    localStorage.setItem("churn-dismissed", JSON.stringify([...next]))
  }

  function clearAllPredictions() {
    const allIds = new Set(predictions.map((p) => p.customerId))
    setDismissedIds(allIds)
    localStorage.setItem("churn-dismissed", JSON.stringify([...allIds]))
  }

  const activePredictions = predictions.filter((p) => !dismissedIds.has(p.customerId))
  const visiblePredictions = activePredictions.slice(0, 10)
  const hasMore = activePredictions.length > 10

  const atRiskTotal = summary.highRisk + summary.mediumRisk

  return (
    <div>
      {/* Section header — matches existing dashboard patterns */}
      <div className="flex items-center justify-between mb-3">
        <h2 className="text-sm font-medium text-muted-foreground uppercase tracking-wider">
          Customer Retention
        </h2>
        <div className="flex items-center gap-3">
          {atRiskTotal > 0 && (
            <span className="text-xs text-muted-foreground">
              {atRiskTotal === 1
                ? "1 customer at risk"
                : `${atRiskTotal} customers at risk`}
            </span>
          )}
          {activePredictions.length > 0 && (
            <button
              onClick={clearAllPredictions}
              className="text-xs text-muted-foreground hover:text-destructive transition-colors"
            >
              Clear all
            </button>
          )}
        </div>
      </div>

      {/* Empty state */}
      {activePredictions.length === 0 ? (
        <Card>
          <CardContent className="pt-5 pb-5">
            <p className="text-sm text-muted-foreground italic">
              All customers healthy — no churn signals detected.
            </p>
          </CardContent>
        </Card>
      ) : (
        <Card>
          {/* Summary row inside the card */}
          <CardHeader className="pb-3">
            <div className="flex items-start justify-between gap-4">
              <div>
                <CardTitle className="text-base font-semibold leading-snug">
                  {summary.highRisk > 0 && (
                    <span className="text-red-400">{summary.highRisk} high</span>
                  )}
                  {summary.highRisk > 0 && summary.mediumRisk > 0 && (
                    <span className="text-muted-foreground">, </span>
                  )}
                  {summary.mediumRisk > 0 && (
                    <span className="text-amber-400">{summary.mediumRisk} medium</span>
                  )}
                  {summary.highRisk === 0 && summary.mediumRisk === 0 && (
                    <span className="text-muted-foreground">No critical risk</span>
                  )}
                </CardTitle>
                <p className="text-xs text-muted-foreground mt-0.5 leading-relaxed">
                  {summary.insight}
                </p>
              </div>
              <span className="shrink-0 text-xs text-muted-foreground tabular-nums">
                of {summary.totalCustomers}
              </span>
            </div>
          </CardHeader>

          <CardContent className="pt-0">
            {/* Customer list */}
            <div className="flex flex-col gap-2">
              {visiblePredictions.map((prediction) => (
                <CustomerRow key={prediction.customerId} prediction={prediction} onDismiss={dismissCustomer} />
              ))}
            </div>

            {/* "View all" — only shown if there are more than 10 */}
            {hasMore && (
              <div className="mt-3 pt-3 border-t border-border">
                <Link
                  href="/customers"
                  className="text-xs text-primary hover:underline"
                >
                  View all {predictions.length} at-risk customers
                </Link>
              </div>
            )}
          </CardContent>
        </Card>
      )}
    </div>
  )
}
