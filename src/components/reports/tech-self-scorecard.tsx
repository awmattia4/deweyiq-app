"use client"

import { useState, useTransition } from "react"
import { TimePeriodSelector, KpiCard, formatPercent } from "@/components/reports/report-shared"
import { getTechScorecard } from "@/actions/reporting"
import type { TechScorecardRow } from "@/actions/reporting"

// ---------------------------------------------------------------------------
// TechSelfScorecard — stripped-down personal performance view for techs
// No other tech data, no financial data.
// ---------------------------------------------------------------------------

interface TechSelfScorecardProps {
  initialData: TechScorecardRow | null
  techId: string
  defaultStartDate: string
  defaultEndDate: string
}

export function TechSelfScorecard({
  initialData,
  techId,
  defaultStartDate,
  defaultEndDate,
}: TechSelfScorecardProps) {
  const [data, setData] = useState(initialData)
  const [startDate, setStartDate] = useState(defaultStartDate)
  const [endDate, setEndDate] = useState(defaultEndDate)
  const [loading, startTransition] = useTransition()

  function handlePeriodChange(start: string, end: string) {
    setStartDate(start)
    setEndDate(end)
    startTransition(async () => {
      const result = await getTechScorecard(techId, start, end)
      setData(result)
    })
  }

  return (
    <div className="flex flex-col gap-6">
      <TimePeriodSelector
        startDate={startDate}
        endDate={endDate}
        onChange={handlePeriodChange}
      />

      {loading ? (
        <div className="text-sm text-muted-foreground italic text-center py-8">Loading…</div>
      ) : !data || data.completedStops === 0 ? (
        <div className="text-sm text-muted-foreground italic">
          No completed stops in this period.
        </div>
      ) : (
        <>
          {/* Primary KPIs — 2×2 grid */}
          <div className="grid grid-cols-2 gap-4">
            <KpiCard
              title="Stops/Day"
              value={data.stopsPerDay.toFixed(1)}
              trend={{
                value: data.stopsPerDayTrend,
                label: "vs previous period",
              }}
            />
            <KpiCard
              title="Avg Stop Time"
              value={data.avgStopMinutes > 0 ? `${data.avgStopMinutes.toFixed(0)} min` : "—"}
              trend={
                data.avgStopMinutes > 0
                  ? {
                      // For avg stop time, negative trend = improvement (less time = better)
                      value: -data.avgStopMinutesTrend,
                      label: "vs previous period",
                    }
                  : undefined
              }
            />
            <KpiCard
              title="On-Time Rate"
              value={formatPercent(data.onTimeRate)}
              trend={{
                value: data.onTimeRateTrend,
                label: "vs previous period",
              }}
            />
            <KpiCard
              title="Chemistry Accuracy"
              value={formatPercent(data.chemistryAccuracy)}
              trend={{
                value: data.chemistryAccuracyTrend,
                label: "vs previous period",
              }}
            />
          </div>

          {/* Secondary metrics */}
          <div className="grid grid-cols-2 gap-4">
            <KpiCard
              title="Checklist Rate"
              value={formatPercent(data.checklistCompletionRate)}
              subtitle={`${data.completedStops} stops completed`}
            />
            <KpiCard
              title="Photo Rate"
              value={formatPercent(data.photoRate)}
              subtitle={`${data.daysWorked} days worked`}
            />
          </div>
        </>
      )}
    </div>
  )
}
