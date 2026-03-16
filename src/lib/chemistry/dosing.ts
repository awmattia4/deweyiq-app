/**
 * Product-Aware Chemical Dosing Engine
 *
 * Calculates exact chemical dosing amounts based on:
 * - Delta ppm needed (how much to raise/lower a parameter)
 * - Pool volume in gallons
 * - Product concentration (actual vs reference)
 *
 * Base dose rates from CPO (Certified Pool/Spa Operator) training materials
 * and Pool Chemical Calculator industry standards.
 *
 * Output units:
 * - Liquid chemicals (hypochlorite, muriatic acid): fluid ounces (floz)
 * - Dry/granular chemicals (cal-hypo, bicarb): ounces (oz) or pounds (lbs)
 *
 * Smart modifiers (Phase 10):
 * - Weather modifier: adjusts chlorine dose based on ambient temperature
 * - History modifier: preemptive adjustment based on OLS trend of past readings
 */

import type { ChemistryReadings } from "./lsi"
import { getTargetRanges, classifyReading } from "./targets"
import type { SanitizerType } from "./targets"
import { computeLinearTrend } from "./prediction"

// ---------------------------------------------------------------------------
// Base dose rate definitions
// ---------------------------------------------------------------------------

/**
 * Reference dose rates per 10,000 gallons at the reference concentration.
 * "rateOzPer1ppmPer10k" = oz of product to change 1 ppm in 10,000 gallons.
 * "rateLbsPer10ppmPer10k" = lbs of product to change 10 ppm in 10,000 gallons.
 */
const BASE_DOSE_RATES = {
  sodiumHypochlorite_12pct: {
    rateOzPer1ppmPer10k: 10.7,
    unit: "floz" as const,
    referenceConcentrationPct: 12,
  },
  calciumHypochlorite_67pct: {
    rateOzPer1ppmPer10k: 2.0,
    unit: "oz" as const,
    referenceConcentrationPct: 67,
  },
  sodiumBicarbonate: {
    rateLbsPer10ppmPer10k: 1.4,
    unit: "lbs" as const,
    referenceConcentrationPct: 100,
  },
  muriatic_31pct: {
    rateOzPer1ppmPer10k: 8.0,
    unit: "floz" as const,
    referenceConcentrationPct: 31,
  },
  sodaAsh: {
    // 6.3 oz per 0.1 pH unit per 10k gal = 63 oz per 1 pH unit
    rateOzPer1ppmPer10k: 63.0,
    unit: "oz" as const,
    referenceConcentrationPct: 100,
  },
  cyanuricAcid: {
    // 13 oz per 10 ppm per 10k gal = 1.3 oz per 1 ppm
    rateOzPer1ppmPer10k: 1.3,
    unit: "oz" as const,
    referenceConcentrationPct: 100,
  },
} as const

export type ChemicalKey = keyof typeof BASE_DOSE_RATES

/**
 * Chlorine-related chemical keys — weather temperature modifier applies to these only.
 * Heat accelerates chlorine burn-off; cold slows it.
 */
const CHLORINE_CHEMICALS = new Set<ChemicalKey>([
  "sodiumHypochlorite_12pct",
  "calciumHypochlorite_67pct",
])

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface ChemicalProduct {
  id: string
  /** Display name, e.g. "31.45% Muriatic Acid" */
  name: string
  /** Which base chemical this product contains */
  chemical: ChemicalKey
  /** Actual product concentration percentage, e.g. 31.45 */
  concentrationPct: number
}

export interface DoseResult {
  amount: number
  unit: string
}

/**
 * Describes an AI-based modifier applied to a dosing recommendation.
 * Rendered as a badge in the UI (per user decision: AI as modifier badge on standard dose).
 */
export interface DoseModifier {
  /** Source of the modifier */
  type: "weather" | "history"
  /** Human-readable label describing why the dose was adjusted */
  label: string
  /**
   * Adjustment percentage applied to the base dose.
   * Positive = dose increased, negative = dose decreased.
   * e.g., 15 means "+15% for heat", -10 means "-10% for cold"
   */
  adjustmentPct: number
}

export interface DosingRecommendation {
  chemical: ChemicalKey
  product: ChemicalProduct
  amount: number
  unit: string
  /** Action to take — always "add" (acids/reducers are still added to the water) */
  action: "add"
  reason: string
  /**
   * Optional modifiers that adjusted this recommendation beyond the base dose.
   * Present only when weather or history context was provided and an adjustment applied.
   * The UI renders these as small badges (e.g. "Weather +15%", "Trend +10%").
   */
  modifiers?: DoseModifier[]
}

/** Extended readings for dosing (includes sanitizer readings not in lsi.ts) */
export interface FullChemistryReadings extends ChemistryReadings {
  freeChlorine?: number | null
  bromine?: number | null
  tds?: number | null
  phosphates?: number | null
}

export interface PoolInfo {
  volumeGallons: number
  sanitizerType: SanitizerType
}

/**
 * Optional context for smart dosing modifiers.
 *
 * When provided, the dosing engine applies weather and history adjustments
 * on top of the standard rule-based dose. If not provided, the engine
 * behaves identically to the original version (backward compatible).
 */
export interface DosingContext {
  /**
   * Today's maximum temperature in Fahrenheit.
   * Obtained via getTemperatureForToday() from open-meteo.ts.
   * Used to adjust chlorine doses for heat/cold effects on burn-off rate.
   */
  temperature_f?: number
  /**
   * Array of past chemistry readings for this pool, chronological order (oldest first).
   * Used to compute OLS trend and apply preemptive dose adjustments.
   * Recommended: last 5–10 service visits.
   */
  historyReadings?: FullChemistryReadings[]
  /** Pool ID — reserved for future per-pool context logging */
  poolId?: string
}

export interface DosingInput {
  readings: FullChemistryReadings
  pool: PoolInfo
  products: ChemicalProduct[]
  /**
   * Optional context for smart dosing modifiers (weather + history).
   * If omitted, the engine produces standard rule-based recommendations.
   */
  context?: DosingContext
}

// ---------------------------------------------------------------------------
// Core calculation
// ---------------------------------------------------------------------------

/**
 * Calculates the exact dose of a chemical product needed to change a
 * parameter by deltaPpm in a pool of volumeGallons.
 *
 * Adjusts for product concentration relative to the reference concentration
 * used for the base dose rate.
 *
 * @param deltaPpm - Amount to raise (positive) the parameter
 * @param volumeGallons - Pool volume in gallons
 * @param product - The chemical product being used
 * @returns Amount and unit for the dose
 */
export function calcDose(
  deltaPpm: number,
  volumeGallons: number,
  product: ChemicalProduct
): DoseResult {
  const base = BASE_DOSE_RATES[product.chemical]
  const volumeFactor = volumeGallons / 10_000

  // Concentration factor: if product is weaker than reference, need more of it
  const concFactor = base.referenceConcentrationPct / product.concentrationPct

  let rawAmount: number

  if ("rateOzPer1ppmPer10k" in base) {
    rawAmount = base.rateOzPer1ppmPer10k * deltaPpm * volumeFactor * concFactor
  } else {
    // lbs-based: rate is per 10 ppm, so divide by 10 to get per-ppm rate
    rawAmount =
      (base.rateLbsPer10ppmPer10k / 10) * deltaPpm * volumeFactor * concFactor
  }

  // Round to 1 decimal place
  const amount = Math.round(rawAmount * 10) / 10

  return { amount, unit: base.unit }
}

// ---------------------------------------------------------------------------
// Smart modifier helpers
// ---------------------------------------------------------------------------

/**
 * Computes the weather-based dose multiplier for a chlorine product.
 *
 * Returns a modifier object if an adjustment applies, or null if temp is in
 * the normal range (50°F–90°F) where no adjustment is warranted.
 *
 * Thresholds from research (Phase 10):
 * - temp > 100°F: +25% (extreme heat, rapid burn-off)
 * - temp > 90°F:  +15% (moderate heat, elevated burn-off)
 * - temp < 50°F:  -10% (cold, slowed burn-off)
 *
 * @param temperatureF - Today's max temperature in Fahrenheit
 * @returns Modifier descriptor, or null if no adjustment
 */
function getWeatherModifier(temperatureF: number): DoseModifier | null {
  if (temperatureF > 100) {
    return {
      type: "weather",
      label: `Extreme heat (${Math.round(temperatureF)}°F) — chlorine burns off faster`,
      adjustmentPct: 25,
    }
  }
  if (temperatureF > 90) {
    return {
      type: "weather",
      label: `Hot day (${Math.round(temperatureF)}°F) — chlorine burns off faster`,
      adjustmentPct: 15,
    }
  }
  if (temperatureF < 50) {
    return {
      type: "weather",
      label: `Cold day (${Math.round(temperatureF)}°F) — chlorine burns off slower`,
      adjustmentPct: -10,
    }
  }
  return null
}

/**
 * Extracts the numeric value for a given chemistry parameter from a readings object.
 * Returns null if the parameter is not present or not applicable.
 */
function extractReadingValue(
  readings: FullChemistryReadings,
  param: keyof FullChemistryReadings
): number | null {
  const value = readings[param]
  return typeof value === "number" ? value : null
}

/**
 * Maps a ChemicalKey to the reading parameter it most directly affects.
 * Used to look up the right history values when computing trend modifiers.
 */
const CHEMICAL_TO_PARAM: Partial<Record<ChemicalKey, keyof FullChemistryReadings>> = {
  sodiumHypochlorite_12pct: "freeChlorine",
  calciumHypochlorite_67pct: "freeChlorine",
  sodiumBicarbonate: "totalAlkalinity",
  muriatic_31pct: "pH",
  sodaAsh: "pH",
  cyanuricAcid: "cya",
}

/**
 * Computes a history-based dose modifier for a given chemical parameter.
 *
 * Uses OLS trend analysis on past readings to detect consistently declining
 * or rising parameters and applies a preemptive adjustment.
 *
 * Conditions for +10% preemptive increase (declining trend toward low):
 * - slope < 0 (parameter declining over time)
 * - R² >= 0.4 (moderately confident linear trend)
 * - projectedNext < target.min * 0.9 (projected value is 10%+ below minimum)
 *
 * Conditions for -10% preemptive reduction (rising trend toward high):
 * - slope > 0 (parameter rising over time)
 * - R² >= 0.4 (moderately confident linear trend)
 * - projectedNext > target.max * 1.1 (projected value is 10%+ above maximum)
 *
 * @param chemical - Chemical being dosed
 * @param historyReadings - Past readings in chronological order (oldest first)
 * @param sanitizerType - Pool sanitizer type (for range lookup)
 * @returns Modifier descriptor, or null if no adjustment
 */
function getHistoryModifier(
  chemical: ChemicalKey,
  historyReadings: FullChemistryReadings[],
  sanitizerType: SanitizerType
): DoseModifier | null {
  const param = CHEMICAL_TO_PARAM[chemical]
  if (!param) return null

  // Extract the historical values for this parameter
  const values: number[] = []
  for (const reading of historyReadings) {
    const val = extractReadingValue(reading, param)
    if (val != null) {
      values.push(val)
    }
  }

  const trend = computeLinearTrend(values)
  if (!trend) return null

  // Not confident enough in the trend
  if (trend.rSquared < 0.4) return null

  const ranges = getTargetRanges(sanitizerType)
  const range = ranges[param as keyof typeof ranges]
  if (!range) return null

  // Check for declining trend toward low
  if (trend.slope < 0 && range.min != null) {
    if (trend.projectedNext < range.min * 0.9) {
      return {
        type: "history",
        label: `${param} trending low (${trend.projectedNext.toFixed(1)} projected)`,
        adjustmentPct: 10,
      }
    }
  }

  // Check for rising trend toward high
  if (trend.slope > 0 && range.max != null) {
    if (trend.projectedNext > range.max * 1.1) {
      return {
        type: "history",
        label: `${param} trending high (${trend.projectedNext.toFixed(1)} projected)`,
        adjustmentPct: -10,
      }
    }
  }

  return null
}

/**
 * Applies modifier adjustment percentages to a base dose amount.
 *
 * Multiple modifiers stack additively (not multiplicatively) to avoid
 * compounding effects. e.g., +15% weather and +10% history = +25% total.
 *
 * @param baseAmount - The rule-based dose amount
 * @param modifiers - Array of modifier adjustments to apply
 * @returns Adjusted amount (rounded to 1 decimal place)
 */
function applyModifiers(baseAmount: number, modifiers: DoseModifier[]): number {
  const totalPct = modifiers.reduce((sum, m) => sum + m.adjustmentPct, 0)
  const adjusted = baseAmount * (1 + totalPct / 100)
  return Math.round(adjusted * 10) / 10
}

// ---------------------------------------------------------------------------
// Recommendation engine
// ---------------------------------------------------------------------------

/**
 * Generates dosing recommendations for all out-of-range parameters.
 *
 * For each parameter that is out of range, finds a matching product from
 * the provided products list and calculates the exact dose needed.
 *
 * When `context` is provided, applies optional smart modifiers:
 * - Weather modifier: adjusts chlorine doses based on temperature
 * - History modifier: preemptive adjustment based on per-pool reading trends
 *
 * The `context` parameter is optional — omitting it produces identical output
 * to the original function (fully backward compatible).
 *
 * @param input - Readings, pool info, available products, and optional context
 * @returns Array of dosing recommendations (empty if all in range)
 */
export function generateDosingRecommendations(
  input: DosingInput
): DosingRecommendation[] {
  const { readings, pool, products, context } = input
  const { volumeGallons, sanitizerType } = pool
  const ranges = getTargetRanges(sanitizerType)
  const recommendations: DosingRecommendation[] = []

  // Helper: find a product for a given chemical
  function findProduct(chemical: ChemicalKey): ChemicalProduct | undefined {
    return products.find((p) => p.chemical === chemical)
  }

  // Helper: add recommendation if product available and delta > 0
  // Applies weather and history modifiers when context is provided.
  function addRec(
    chemical: ChemicalKey,
    deltaPpm: number,
    reason: string
  ) {
    if (deltaPpm <= 0) return
    const product = findProduct(chemical)
    if (!product) return

    const { amount: baseAmount, unit } = calcDose(deltaPpm, volumeGallons, product)
    if (baseAmount <= 0) return

    // Collect modifiers when context is available
    const modifiers: DoseModifier[] = []

    if (context) {
      // Weather modifier: applies only to chlorine chemicals
      if (
        context.temperature_f != null &&
        CHLORINE_CHEMICALS.has(chemical)
      ) {
        const weatherMod = getWeatherModifier(context.temperature_f)
        if (weatherMod) modifiers.push(weatherMod)
      }

      // History modifier: applies to all chemicals with a known param mapping
      if (
        context.historyReadings &&
        context.historyReadings.length >= 3
      ) {
        const historyMod = getHistoryModifier(
          chemical,
          context.historyReadings,
          sanitizerType
        )
        if (historyMod) modifiers.push(historyMod)
      }
    }

    // Apply modifiers to the base amount
    const finalAmount =
      modifiers.length > 0 ? applyModifiers(baseAmount, modifiers) : baseAmount

    recommendations.push({
      chemical,
      product,
      amount: finalAmount,
      unit,
      action: "add",
      reason,
      ...(modifiers.length > 0 ? { modifiers } : {}),
    })
  }

  // Free chlorine (chlorine and salt pools)
  if (
    sanitizerType !== "bromine" &&
    readings.freeChlorine != null &&
    ranges.freeChlorine != null
  ) {
    const status = classifyReading("freeChlorine", readings.freeChlorine, sanitizerType)
    if (status.status === "low") {
      const delta = ranges.freeChlorine.min! - readings.freeChlorine
      const chlorineProduct =
        findProduct("sodiumHypochlorite_12pct") ??
        findProduct("calciumHypochlorite_67pct")
      if (chlorineProduct) {
        const { amount: baseAmount, unit } = calcDose(delta, volumeGallons, chlorineProduct)
        const modifiers: DoseModifier[] = []

        if (context) {
          if (
            context.temperature_f != null &&
            CHLORINE_CHEMICALS.has(chlorineProduct.chemical)
          ) {
            const weatherMod = getWeatherModifier(context.temperature_f)
            if (weatherMod) modifiers.push(weatherMod)
          }

          if (context.historyReadings && context.historyReadings.length >= 3) {
            const historyMod = getHistoryModifier(
              chlorineProduct.chemical,
              context.historyReadings,
              sanitizerType
            )
            if (historyMod) modifiers.push(historyMod)
          }
        }

        const finalAmount =
          modifiers.length > 0 ? applyModifiers(baseAmount, modifiers) : baseAmount

        recommendations.push({
          chemical: chlorineProduct.chemical,
          product: chlorineProduct,
          amount: finalAmount,
          unit,
          action: "add",
          reason: `Free chlorine is ${readings.freeChlorine} ppm (target ${ranges.freeChlorine.min}–${ranges.freeChlorine.max} ppm)`,
          ...(modifiers.length > 0 ? { modifiers } : {}),
        })
      }
    }
  }

  // Bromine
  if (
    sanitizerType === "bromine" &&
    readings.bromine != null &&
    ranges.bromine != null
  ) {
    const status = classifyReading("bromine", readings.bromine, sanitizerType)
    if (status.status === "low") {
      // No specific bromine product key — would need to be added; skip for now
    }
  }

  // pH
  if (readings.pH != null && ranges.pH != null) {
    const status = classifyReading("pH", readings.pH, sanitizerType)
    if (status.status === "high") {
      // Lower pH with muriatic acid
      // For muriatic acid, deltaPpm represents pH units × 10 (approximate)
      // 1 ppm in the dosing table corresponds roughly to 0.1 pH unit change
      // Muriatic acid rate: 8 floz per "1 ppm" per 10k gal where 1 ppm ≈ 0.1 pH unit
      const phDelta = readings.pH - ranges.pH.max!
      // Convert pH delta to "ppm equivalent" for the dosing table:
      // 8 floz per 0.1 pH unit per 10k gal → multiply phDelta by 10
      const ppmEquivalent = phDelta * 10
      addRec(
        "muriatic_31pct",
        ppmEquivalent,
        `pH is ${readings.pH} (target ${ranges.pH.min}–${ranges.pH.max})`
      )
    } else if (status.status === "low") {
      const phDelta = ranges.pH.min! - readings.pH
      const ppmEquivalent = phDelta * 10
      addRec(
        "sodaAsh",
        ppmEquivalent,
        `pH is ${readings.pH} (target ${ranges.pH.min}–${ranges.pH.max})`
      )
    }
  }

  // Total alkalinity
  if (readings.totalAlkalinity != null && ranges.totalAlkalinity != null) {
    const status = classifyReading(
      "totalAlkalinity",
      readings.totalAlkalinity,
      sanitizerType
    )
    if (status.status === "low") {
      const delta = ranges.totalAlkalinity.min! - readings.totalAlkalinity
      addRec(
        "sodiumBicarbonate",
        delta,
        `Total alkalinity is ${readings.totalAlkalinity} ppm (target ${ranges.totalAlkalinity.min}–${ranges.totalAlkalinity.max} ppm)`
      )
    }
    // High alkalinity: lower with muriatic acid (same treatment as high pH)
    if (status.status === "high") {
      const delta = readings.totalAlkalinity - ranges.totalAlkalinity.max!
      addRec(
        "muriatic_31pct",
        delta,
        `Total alkalinity is ${readings.totalAlkalinity} ppm (target ${ranges.totalAlkalinity.min}–${ranges.totalAlkalinity.max} ppm)`
      )
    }
  }

  // CYA
  if (
    readings.cya != null &&
    ranges.cya != null
  ) {
    const status = classifyReading("cya", readings.cya, sanitizerType)
    if (status.status === "low") {
      const delta = ranges.cya.min! - readings.cya
      addRec(
        "cyanuricAcid",
        delta,
        `CYA is ${readings.cya} ppm (target ${ranges.cya.min}–${ranges.cya.max} ppm)`
      )
    }
  }

  return recommendations
}
