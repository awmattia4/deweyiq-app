/**
 * Unit conversion utility for matching dosing engine units to truck inventory units.
 *
 * The dosing engine produces amounts in "floz" (fluid ounces) or "lbs" (pounds).
 * Truck inventory may store items in gallons, quarts, cups, lbs, oz, or other units.
 * This module normalizes between them.
 *
 * Supported conversions:
 * - floz <-> gallon  (128 floz = 1 gallon)
 * - floz <-> quart   (32 floz = 1 quart)
 * - floz <-> cup     (16 floz = 1 cup — note: UK cup differs, using US cup)
 * - lbs  <-> oz      (16 oz = 1 lb)
 * - same unit        (passthrough — no conversion)
 *
 * If the conversion is unknown, returns the original amount and logs a warning.
 */

type ConversionFactor = {
  toBase: number  // Multiply by this to get to the base unit
  base: string    // The base unit of this group
}

// Base units: floz for volume, lbs for weight
const UNIT_FACTORS: Record<string, ConversionFactor> = {
  // Volume — base unit: floz
  floz: { toBase: 1, base: "floz" },
  "fluid_oz": { toBase: 1, base: "floz" },
  "fl oz": { toBase: 1, base: "floz" },
  cup: { toBase: 16, base: "floz" },
  cups: { toBase: 16, base: "floz" },
  quart: { toBase: 32, base: "floz" },
  quarts: { toBase: 32, base: "floz" },
  qt: { toBase: 32, base: "floz" },
  gallon: { toBase: 128, base: "floz" },
  gallons: { toBase: 128, base: "floz" },
  gal: { toBase: 128, base: "floz" },

  // Weight — base unit: lbs
  lbs: { toBase: 1, base: "lbs" },
  lb: { toBase: 1, base: "lbs" },
  pounds: { toBase: 1, base: "lbs" },
  pound: { toBase: 1, base: "lbs" },
  oz: { toBase: 1 / 16, base: "lbs" },
  ounces: { toBase: 1 / 16, base: "lbs" },
  ounce: { toBase: 1 / 16, base: "lbs" },
}

/**
 * Convert `amount` from `fromUnit` to `toUnit`.
 *
 * Returns the original amount unchanged if:
 * - units are equal (case-insensitive)
 * - either unit is unknown
 * - units are from different groups (e.g., floz -> lbs)
 *
 * @param amount  - The numeric quantity to convert
 * @param fromUnit - The source unit (e.g., "floz", "gallon")
 * @param toUnit   - The target unit (e.g., "gallons", "lbs")
 * @returns Converted quantity
 */
export function convertUnits(amount: number, fromUnit: string, toUnit: string): number {
  const from = fromUnit.toLowerCase().trim()
  const to = toUnit.toLowerCase().trim()

  // Same unit — no conversion needed
  if (from === to) return amount

  const fromFactor = UNIT_FACTORS[from]
  const toFactor = UNIT_FACTORS[to]

  if (!fromFactor) {
    console.warn(`[convertUnits] Unknown source unit: "${fromUnit}" — returning amount unchanged`)
    return amount
  }

  if (!toFactor) {
    console.warn(`[convertUnits] Unknown target unit: "${toUnit}" — returning amount unchanged`)
    return amount
  }

  // Units must be in the same measurement group (volume or weight)
  if (fromFactor.base !== toFactor.base) {
    console.warn(
      `[convertUnits] Cannot convert between incompatible groups: "${fromUnit}" (${fromFactor.base}) -> "${toUnit}" (${toFactor.base}) — returning amount unchanged`
    )
    return amount
  }

  // Convert: amount -> base unit -> target unit
  const inBase = amount * fromFactor.toBase
  const result = inBase / toFactor.toBase

  return result
}
