/**
 * Target chemistry ranges by sanitizer type.
 *
 * Ranges sourced from CPO (Certified Pool/Spa Operator) curriculum
 * and industry standards for residential pool maintenance.
 */

export type SanitizerType = "chlorine" | "salt" | "bromine"

export type ReadingStatus = "low" | "ok" | "high"

export interface ParameterRange {
  /** Minimum acceptable value (null = no lower bound) */
  min: number | null
  /** Maximum acceptable value (null = no upper bound) */
  max: number | null
  /** Unit label for display */
  unit: string
}

export interface TargetRanges {
  freeChlorine: ParameterRange | null
  bromine: ParameterRange | null
  pH: ParameterRange
  totalAlkalinity: ParameterRange
  cya: ParameterRange | null
  calciumHardness: ParameterRange
  tds: ParameterRange | null
  phosphates: ParameterRange | null
  salt: ParameterRange | null
}

export interface ReadingClassification {
  status: ReadingStatus
  color: "red" | "green"
}

/**
 * Returns the ideal chemistry target ranges for the given sanitizer type.
 *
 * @param sanitizerType - The pool sanitization method
 * @returns Target ranges for all parameters
 */
export function getTargetRanges(sanitizerType: SanitizerType): TargetRanges {
  const sharedRanges = {
    pH: { min: 7.2, max: 7.8, unit: "" },
    totalAlkalinity: { min: 80, max: 120, unit: "ppm" },
    calciumHardness: { min: 200, max: 400, unit: "ppm" },
    phosphates: { min: 0, max: 200, unit: "ppb" },
  }

  switch (sanitizerType) {
    case "chlorine":
      return {
        freeChlorine: { min: 2, max: 4, unit: "ppm" },
        bromine: null,
        pH: sharedRanges.pH,
        totalAlkalinity: sharedRanges.totalAlkalinity,
        cya: { min: 30, max: 50, unit: "ppm" },
        calciumHardness: sharedRanges.calciumHardness,
        tds: { min: 0, max: 1500, unit: "ppm" },
        phosphates: sharedRanges.phosphates,
        salt: null,
      }

    case "salt":
      return {
        freeChlorine: { min: 2, max: 4, unit: "ppm" },
        bromine: null,
        pH: sharedRanges.pH,
        totalAlkalinity: sharedRanges.totalAlkalinity,
        cya: { min: 60, max: 80, unit: "ppm" },
        calciumHardness: sharedRanges.calciumHardness,
        tds: { min: 2700, max: 3400, unit: "ppm" },
        phosphates: sharedRanges.phosphates,
        salt: { min: 2700, max: 3400, unit: "ppm" },
      }

    case "bromine":
      return {
        freeChlorine: null,
        bromine: { min: 3, max: 5, unit: "ppm" },
        pH: sharedRanges.pH,
        totalAlkalinity: sharedRanges.totalAlkalinity,
        cya: null,
        calciumHardness: sharedRanges.calciumHardness,
        tds: { min: 0, max: 1500, unit: "ppm" },
        phosphates: sharedRanges.phosphates,
        salt: null,
      }
  }
}

/**
 * Classifies a reading value relative to its target range.
 *
 * @param param - The parameter name (key of TargetRanges)
 * @param value - The measured value
 * @param sanitizerType - The sanitizer type for range lookup
 * @returns Classification with status and color
 */
export function classifyReading(
  param: keyof TargetRanges,
  value: number,
  sanitizerType: SanitizerType
): ReadingClassification {
  const ranges = getTargetRanges(sanitizerType)
  const range = ranges[param]

  if (range == null) {
    // Parameter not applicable for this sanitizer type — treat as ok
    return { status: "ok", color: "green" }
  }

  if (range.min != null && value < range.min) {
    return { status: "low", color: "red" }
  }
  if (range.max != null && value > range.max) {
    return { status: "high", color: "red" }
  }
  return { status: "ok", color: "green" }
}
