/**
 * CSI/LSI Calculator — Pure TypeScript, no external dependencies.
 *
 * Implements the Trouble Free Pool (TFP) CSI formula which accounts for
 * ionic strength, CYA correction, borate correction, salt, and temperature.
 * More accurate than the classic 5-factor LSI.
 *
 * Source: TFP Wiki — https://www.troublefreepool.com/wiki/index.php?title=CSI_and_LSI
 */

export interface ChemistryReadings {
  /** pH of the water */
  pH: number | null
  /** Total alkalinity in ppm */
  totalAlkalinity: number | null
  /** Calcium hardness in ppm */
  calciumHardness: number | null
  /** Cyanuric acid (stabilizer) in ppm — optional, defaults to 0 */
  cya: number | null
  /** Salt (NaCl) in ppm — optional, defaults to 0 */
  salt: number | null
  /** Borate in ppm — optional, defaults to 0 */
  borate: number | null
  /** Water temperature in Fahrenheit */
  temperatureF: number | null
}

export interface CSIInterpretation {
  status: "corrosive" | "low" | "balanced" | "high" | "scaling"
  label: string
  color: "red" | "yellow" | "green"
}

/**
 * Calculates the Corrosion Saturation Index (CSI) from pool chemistry readings.
 *
 * Returns null if any required parameter is missing, or if the computed
 * carbonate alkalinity or calcium hardness is non-positive.
 *
 * @param r - Pool chemistry readings
 * @returns CSI value, or null if calculation is not possible
 */
export function calculateCSI(r: ChemistryReadings): number | null {
  const {
    pH,
    totalAlkalinity: TA,
    calciumHardness: CH,
    cya: CYA,
    salt,
    borate,
    temperatureF,
  } = r

  // Required parameters
  if (pH == null || TA == null || CH == null || temperatureF == null) return null

  // Convert Fahrenheit to Celsius for temperature correction
  const T = ((temperatureF - 32) * 5) / 9

  // Carbonate alkalinity: total alkalinity corrected for CYA and borate contributions
  // CYA correction factor (isocyanurate equilibrium)
  const cyaFactor =
    CYA != null && CYA > 0
      ? (0.38772 * CYA) / (1 + Math.pow(10, 6.83 - pH))
      : 0

  // Borate correction factor (borate/boric acid equilibrium)
  const borateFactor =
    borate != null && borate > 0
      ? (4.63 * borate) / (1 + Math.pow(10, 9.11 - pH))
      : 0

  const CarbAlk = TA - cyaFactor - borateFactor

  // Guard: log is undefined for zero or negative values
  if (CarbAlk <= 0 || CH <= 0) return null

  // Ionic strength (accounts for dissolved calcium salts and NaCl from salt systems)
  // Extra NaCl beyond what's already counted from calcium hardness
  const extraNaCl = Math.max(0, (salt ?? 0) - 1.1678 * CH)
  const Ionic = (1.5 * CH + TA) / 50045 + extraNaCl / 58440

  // Ionic correction to the saturation index (Davies equation approximation)
  const ionicCorrection =
    (2.56 * Math.sqrt(Ionic)) / (1 + 1.65 * Math.sqrt(Ionic))

  // Temperature correction factor
  const tempCorrection = 1412.5 / (T + 273.15)

  // CSI formula:
  // CSI = pH - pHs
  // pHs = 11.677 - log10(CH) - log10(CarbAlk) + ionicCorrection + tempCorrection - 4.7375
  const CSI =
    pH -
    11.677 +
    Math.log10(CH) +
    Math.log10(CarbAlk) -
    ionicCorrection -
    tempCorrection +
    4.7375

  return CSI
}

/**
 * Interprets a CSI value into a human-readable status with label and color.
 *
 * @param csi - The calculated CSI value
 * @returns Interpretation with status, label, and color
 */
export function interpretCSI(csi: number): CSIInterpretation {
  if (csi <= -0.6) {
    return { status: "corrosive", label: "Corrosive", color: "red" }
  }
  if (csi <= -0.3) {
    return { status: "low", label: "Slightly Corrosive", color: "yellow" }
  }
  if (csi <= 0.3) {
    return { status: "balanced", label: "Balanced", color: "green" }
  }
  if (csi <= 0.6) {
    return { status: "high", label: "Slightly Scaling", color: "yellow" }
  }
  return { status: "scaling", label: "Scaling", color: "red" }
}
