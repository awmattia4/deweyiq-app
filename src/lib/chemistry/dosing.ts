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
 */

import type { ChemistryReadings } from "./lsi"
import { getTargetRanges, classifyReading } from "./targets"
import type { SanitizerType } from "./targets"

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

export interface DosingRecommendation {
  chemical: ChemicalKey
  product: ChemicalProduct
  amount: number
  unit: string
  /** Action to take — always "add" (acids/reducers are still added to the water) */
  action: "add"
  reason: string
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

export interface DosingInput {
  readings: FullChemistryReadings
  pool: PoolInfo
  products: ChemicalProduct[]
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
// Recommendation engine
// ---------------------------------------------------------------------------

/**
 * Generates dosing recommendations for all out-of-range parameters.
 *
 * For each parameter that is out of range, finds a matching product from
 * the provided products list and calculates the exact dose needed.
 *
 * @param input - Readings, pool info, and available products
 * @returns Array of dosing recommendations (empty if all in range)
 */
export function generateDosingRecommendations(
  input: DosingInput
): DosingRecommendation[] {
  const { readings, pool, products } = input
  const { volumeGallons, sanitizerType } = pool
  const ranges = getTargetRanges(sanitizerType)
  const recommendations: DosingRecommendation[] = []

  // Helper: find a product for a given chemical
  function findProduct(chemical: ChemicalKey): ChemicalProduct | undefined {
    return products.find((p) => p.chemical === chemical)
  }

  // Helper: add recommendation if product available and delta > 0
  function addRec(
    chemical: ChemicalKey,
    deltaPpm: number,
    reason: string
  ) {
    if (deltaPpm <= 0) return
    const product = findProduct(chemical)
    if (!product) return
    const { amount, unit } = calcDose(deltaPpm, volumeGallons, product)
    if (amount <= 0) return
    recommendations.push({
      chemical,
      product,
      amount,
      unit,
      action: "add",
      reason,
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
        const { amount, unit } = calcDose(delta, volumeGallons, chlorineProduct)
        recommendations.push({
          chemical: chlorineProduct.chemical,
          product: chlorineProduct,
          amount,
          unit,
          action: "add",
          reason: `Free chlorine is ${readings.freeChlorine} ppm (target ${ranges.freeChlorine.min}–${ranges.freeChlorine.max} ppm)`,
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
