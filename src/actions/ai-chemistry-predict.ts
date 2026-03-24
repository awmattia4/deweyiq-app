"use server"

import { createClient } from "@/lib/supabase/server"
import { withRls, getRlsToken } from "@/lib/db"
import { serviceVisits } from "@/lib/db/schema"
import { eq, and, desc, isNotNull } from "drizzle-orm"
import { getAiClient, AI_MODEL } from "@/lib/ai/client"
import { computeLinearTrend } from "@/lib/chemistry/prediction"

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface ChemistryPrediction {
  predicted: number
  confidence: "high" | "medium" | "low"
  trend: "rising" | "stable" | "falling"
}

export interface PreloadRecommendation {
  chemical: string
  amount: number
  unit: string
  reason: string
}

export interface PredictionAlert {
  param: string
  message: string
  severity: "info" | "warning"
}

export interface ChemistryPredictions {
  expectedReadings: Record<string, ChemistryPrediction>
  recommendedPreload: PreloadRecommendation[]
  alerts: PredictionAlert[]
  insights: string
}

export interface PredictChemistryResult {
  success: boolean
  predictions?: ChemistryPredictions
  error?: string
}

// ---------------------------------------------------------------------------
// Chemistry parameter metadata
// ---------------------------------------------------------------------------

interface ParamMeta {
  label: string
  unit: string
  min: number | null
  max: number | null
}

const PARAM_META: Record<string, ParamMeta> = {
  freeChlorine: { label: "Free Chlorine", unit: "ppm", min: 2, max: 4 },
  bromine: { label: "Bromine", unit: "ppm", min: 3, max: 5 },
  pH: { label: "pH", unit: "", min: 7.2, max: 7.8 },
  totalAlkalinity: { label: "Total Alkalinity", unit: "ppm", min: 80, max: 120 },
  cya: { label: "Cyanuric Acid", unit: "ppm", min: 30, max: 80 },
  calciumHardness: { label: "Calcium Hardness", unit: "ppm", min: 200, max: 400 },
  phosphates: { label: "Phosphates", unit: "ppb", min: 0, max: 200 },
  salt: { label: "Salt", unit: "ppm", min: 2700, max: 3400 },
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Maps R² to a confidence level.
 * High confidence: R² >= 0.7, medium: >= 0.4, low: < 0.4
 */
function rSquaredToConfidence(rSquared: number): "high" | "medium" | "low" {
  if (rSquared >= 0.7) return "high"
  if (rSquared >= 0.4) return "medium"
  return "low"
}

/**
 * Maps slope to a trend direction.
 * Stable when slope is within ±0.5% of the mean value (or a small absolute threshold).
 */
function slopeToTrend(slope: number, meanValue: number): "rising" | "stable" | "falling" {
  // Threshold: consider stable if slope is < 2% of mean per step, or < 0.05 absolute
  const threshold = Math.max(meanValue * 0.02, 0.05)
  if (slope > threshold) return "rising"
  if (slope < -threshold) return "falling"
  return "stable"
}

/**
 * Rounds a predicted value to a reasonable display precision.
 * pH: 1 decimal; ppm values: 1 decimal; large values (>100): whole number.
 */
function roundPredicted(value: number, param: string): number {
  if (param === "pH") return Math.round(value * 10) / 10
  const meta = PARAM_META[param]
  if (meta && meta.max !== null && meta.max > 100) return Math.round(value)
  return Math.round(value * 10) / 10
}

// ---------------------------------------------------------------------------
// AI prompt
// ---------------------------------------------------------------------------

const SYSTEM_PROMPT = `You are a pool chemistry advisor helping a service technician prepare for a visit.
Based on historical chemistry data and trend analysis, provide:
1. A brief plain-language insight (2-3 sentences) about this pool's chemistry patterns
2. Specific chemical preload recommendations (what to bring on the truck)

You must respond with valid JSON in exactly this shape:
{
  "insights": "2-3 sentences about this pool's chemistry patterns, trends, and anything the tech should watch for",
  "preload": [
    { "chemical": "Muriatic Acid", "amount": 32, "unit": "floz", "reason": "pH has been trending high over last 3 visits" },
    ...
  ]
}

Rules:
- insights: plain language, mention specific patterns you see. E.g. "This pool consistently runs low on chlorine between visits, likely due to high bather load or sun exposure. pH is stable. Alkalinity has been slowly rising."
- preload: chemicals the tech should load on their truck before this visit. Only recommend chemicals that are actually needed based on the trends — don't pad the list.
- Use practical units: floz for liquids, lbs or oz for dry chemicals.
- If the data is insufficient or patterns are unclear, say so in insights and return an empty preload array.
- Never mention specific ppm numbers in insights — keep it practical for field use.`

// ---------------------------------------------------------------------------
// Action
// ---------------------------------------------------------------------------

/**
 * Predicts expected chemistry readings for a pool's next service visit
 * based on statistical trend analysis of the last 8 visits.
 *
 * Combines OLS linear regression (from @/lib/chemistry/prediction) with
 * Claude AI insights for recommended preload chemicals and pattern observations.
 *
 * Requires at least 3 historical visits with chemistry readings.
 */
export async function predictChemistryNeeds(poolId: string): Promise<PredictChemistryResult> {
  try {
    // Auth
    const token = await getRlsToken()
    if (!token) {
      return { success: false, error: "Not authenticated" }
    }

    // Fetch last 8 visits with chemistry readings for this pool
    const visits = await withRls(token, (db) =>
      db
        .select({
          id: serviceVisits.id,
          visited_at: serviceVisits.visited_at,
          chemistry_readings: serviceVisits.chemistry_readings,
          dosing_amounts: serviceVisits.dosing_amounts,
        })
        .from(serviceVisits)
        .where(
          and(
            eq(serviceVisits.pool_id, poolId),
            isNotNull(serviceVisits.chemistry_readings)
          )
        )
        .orderBy(desc(serviceVisits.visited_at))
        .limit(8)
    )

    // Need at least 3 visits for meaningful trend analysis
    if (visits.length < 3) {
      return {
        success: false,
        error: `Insufficient history: need at least 3 visits with chemistry readings, found ${visits.length}.`,
      }
    }

    // Reverse to chronological order (oldest first) for OLS regression
    const chronological = [...visits].reverse()

    // Extract all readings into a map of param -> [values in order]
    const paramValues: Record<string, number[]> = {}

    for (const visit of chronological) {
      const readings = visit.chemistry_readings as Record<string, unknown> | null
      if (!readings) continue

      for (const [param, rawValue] of Object.entries(readings)) {
        if (typeof rawValue !== "number") continue
        if (!paramValues[param]) paramValues[param] = []
        paramValues[param].push(rawValue)
      }
    }

    // Run OLS trend analysis for each parameter
    const expectedReadings: Record<string, ChemistryPrediction> = {}
    const alerts: PredictionAlert[] = []

    for (const [param, values] of Object.entries(paramValues)) {
      if (values.length < 3) continue

      const trend = computeLinearTrend(values)
      if (!trend) continue

      const meanValue = values.reduce((a, b) => a + b, 0) / values.length
      const predicted = roundPredicted(trend.projectedNext, param)
      const confidence = rSquaredToConfidence(trend.rSquared)
      const trendDir = slopeToTrend(trend.slope, meanValue)

      expectedReadings[param] = { predicted, confidence, trend: trendDir }

      // Generate alerts for out-of-range predictions
      const meta = PARAM_META[param]
      if (meta) {
        if (meta.min !== null && predicted < meta.min) {
          const severity = predicted < meta.min * 0.8 ? "warning" : "info"
          alerts.push({
            param,
            message: `${meta.label} predicted at ${predicted}${meta.unit ? ` ${meta.unit}` : ""} — below target range (${meta.min}–${meta.max ?? "∞"}${meta.unit ? ` ${meta.unit}` : ""})`,
            severity,
          })
        } else if (meta.max !== null && predicted > meta.max) {
          const severity = predicted > meta.max * 1.2 ? "warning" : "info"
          alerts.push({
            param,
            message: `${meta.label} predicted at ${predicted}${meta.unit ? ` ${meta.unit}` : ""} — above target range (${meta.min ?? 0}–${meta.max}${meta.unit ? ` ${meta.unit}` : ""})`,
            severity,
          })
        }
      }
    }

    // Build history summary for the AI prompt
    const historyRows = chronological.map((v, i) => {
      const readings = v.chemistry_readings as Record<string, unknown> | null
      const readingStr = readings
        ? Object.entries(readings)
            .filter(([, val]) => typeof val === "number")
            .map(([k, val]) => `${k}=${val}`)
            .join(", ")
        : "no readings"
      const dateStr = new Date(v.visited_at).toLocaleDateString("en-US", {
        month: "short",
        day: "numeric",
      })
      return `Visit ${i + 1} (${dateStr}): ${readingStr}`
    })

    const trendSummary = Object.entries(expectedReadings)
      .map(([param, pred]) => {
        const meta = PARAM_META[param]
        const label = meta?.label ?? param
        return `${label}: ${pred.trend} trend → predicted ${pred.predicted}${meta?.unit ? ` ${meta.unit}` : ""} (${pred.confidence} confidence)`
      })
      .join("\n")

    const userMessage = `
Pool history (${visits.length} most recent visits, oldest first):
${historyRows.join("\n")}

Statistical trend analysis:
${trendSummary || "No trends computed."}

${alerts.length > 0 ? `Predicted out-of-range parameters:\n${alerts.map((a) => `- ${a.message}`).join("\n")}` : "All predicted parameters are within normal range."}

Based on this history, what should the tech know and bring on their truck?`

    // Call Claude AI for insights and preload recommendations
    const ai = getAiClient()
    const response = await ai.messages.create({
      model: AI_MODEL,
      max_tokens: 500,
      system: SYSTEM_PROMPT,
      messages: [{ role: "user", content: userMessage }],
    })

    const raw = response.content[0]
    if (raw.type !== "text") {
      return { success: false, error: "Unexpected AI response format" }
    }

    const jsonText = raw.text.replace(/^```(?:json)?\s*/i, "").replace(/\s*```\s*$/, "").trim()
    const aiResult = JSON.parse(jsonText) as {
      insights: string
      preload: Array<{ chemical: string; amount: number; unit: string; reason: string }>
    }

    const recommendedPreload: PreloadRecommendation[] = Array.isArray(aiResult.preload)
      ? aiResult.preload.map((p) => ({
          chemical: p.chemical,
          amount: typeof p.amount === "number" ? p.amount : 0,
          unit: p.unit ?? "",
          reason: p.reason ?? "",
        }))
      : []

    return {
      success: true,
      predictions: {
        expectedReadings,
        recommendedPreload,
        alerts,
        insights: aiResult.insights ?? "",
      },
    }
  } catch (err) {
    console.error("[ai-chemistry-predict] predictChemistryNeeds error:", err)
    return {
      success: false,
      error: err instanceof Error ? err.message : "Failed to generate predictions",
    }
  }
}
