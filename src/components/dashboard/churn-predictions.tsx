import Link from "next/link"
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

function CustomerRow({ prediction }: { prediction: ChurnPrediction }) {
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
        <RiskBadge level={riskLevel} />
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
  const visiblePredictions = predictions.slice(0, 10)
  const hasMore = predictions.length > 10

  const atRiskTotal = summary.highRisk + summary.mediumRisk

  return (
    <div>
      {/* Section header — matches existing dashboard patterns */}
      <div className="flex items-center justify-between mb-3">
        <h2 className="text-sm font-medium text-muted-foreground uppercase tracking-wider">
          Customer Retention
        </h2>
        {atRiskTotal > 0 && (
          <span className="text-xs text-muted-foreground">
            {atRiskTotal === 1
              ? "1 customer at risk"
              : `${atRiskTotal} customers at risk`}
          </span>
        )}
      </div>

      {/* Empty state */}
      {predictions.length === 0 ? (
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
                <CustomerRow key={prediction.customerId} prediction={prediction} />
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
