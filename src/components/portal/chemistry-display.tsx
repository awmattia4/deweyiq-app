"use client"

import {
  classifyReading,
  getTargetRanges,
  type SanitizerType,
  type TargetRanges,
} from "@/lib/chemistry/targets"

interface ChemistryDisplayProps {
  readings: Record<string, number>
  sanitizerType: string | null
}

/**
 * Parameter definition for display ordering and labels.
 */
interface ParamDef {
  key: keyof TargetRanges
  label: string
  unit: string
}

/**
 * All chemistry parameters in preferred display order.
 * Unit is pulled from target ranges when available; falls back to the default here.
 */
const PARAM_DEFS: ParamDef[] = [
  { key: "freeChlorine", label: "Free Chlorine", unit: "ppm" },
  { key: "bromine", label: "Bromine", unit: "ppm" },
  { key: "pH", label: "pH", unit: "" },
  { key: "totalAlkalinity", label: "Total Alkalinity", unit: "ppm" },
  { key: "cya", label: "CYA", unit: "ppm" },
  { key: "calciumHardness", label: "Calcium Hardness", unit: "ppm" },
  { key: "salt", label: "Salt", unit: "ppm" },
  { key: "tds", label: "TDS", unit: "ppm" },
  { key: "phosphates", label: "Phosphates", unit: "ppb" },
]

/**
 * Map chemistry readings keys (as stored by field app) to TargetRanges keys.
 *
 * The field app stores keys like "freeChlorine", "pH", "totalAlkalinity" etc.
 * which already match TargetRanges keys — no translation needed.
 * This also accepts legacy snake_case variants that may appear in older records.
 */
const KEY_ALIASES: Record<string, keyof TargetRanges> = {
  // camelCase (primary)
  freeChlorine: "freeChlorine",
  pH: "pH",
  ph: "pH",
  totalAlkalinity: "totalAlkalinity",
  cya: "cya",
  calciumHardness: "calciumHardness",
  salt: "salt",
  tds: "tds",
  phosphates: "phosphates",
  bromine: "bromine",
  // snake_case (legacy)
  free_chlorine: "freeChlorine",
  total_alkalinity: "totalAlkalinity",
  calcium_hardness: "calciumHardness",
}

/**
 * ChemistryDisplay — renders a grid of chemistry readings with color-coded status.
 *
 * Uses classifyReading from chemistry/targets.ts to determine if each value
 * is LOW, NORMAL, or HIGH relative to target ranges for the given sanitizer type.
 *
 * Color coding:
 * - Green (text-green-400) — within target range
 * - Amber (text-amber-400) — below target (LOW), needs to go up
 * - Red (text-red-400) — above target (HIGH), needs to come down
 *
 * Parameters not applicable to the pool's sanitizer type are hidden.
 * (e.g. CYA is hidden for bromine pools, Bromine is hidden for chlorine pools)
 */
export function ChemistryDisplay({ readings, sanitizerType }: ChemistryDisplayProps) {
  const sanitizer = (sanitizerType as SanitizerType) || "chlorine"
  const targetRanges = getTargetRanges(sanitizer)

  // Normalize readings keys to TargetRanges keys
  const normalizedReadings: Partial<Record<keyof TargetRanges, number>> = {}
  for (const [rawKey, value] of Object.entries(readings)) {
    const normalized = KEY_ALIASES[rawKey]
    if (normalized && typeof value === "number") {
      normalizedReadings[normalized] = value
    }
  }

  // Collect params that have both a target range AND a recorded reading
  const displayedParams = PARAM_DEFS.filter((param) => {
    const range = targetRanges[param.key]
    const value = normalizedReadings[param.key]
    // Show only if: range exists (applicable to sanitizer type) AND reading was recorded
    return range !== null && value !== undefined
  })

  if (displayedParams.length === 0) {
    return (
      <p className="text-sm text-muted-foreground italic">No chemistry readings recorded.</p>
    )
  }

  return (
    <div className="grid grid-cols-2 gap-x-6 gap-y-2 sm:grid-cols-3">
      {displayedParams.map((param) => {
        const value = normalizedReadings[param.key]!
        const classification = classifyReading(param.key, value, sanitizer)
        const range = targetRanges[param.key]

        // Color by status — amber for LOW (needs to go up), red for HIGH (needs to come down)
        const statusColor =
          classification.status === "ok"
            ? "text-green-400"
            : classification.status === "low"
              ? "text-amber-400"
              : "text-red-400"

        const dotColor =
          classification.status === "ok"
            ? "bg-green-400"
            : classification.status === "low"
              ? "bg-amber-400"
              : "bg-red-400"

        const unit = range?.unit || param.unit
        const displayValue = `${value}${unit ? " " + unit : ""}`

        return (
          <div key={param.key} className="flex items-center justify-between gap-2 py-0.5">
            <span className="text-xs text-muted-foreground truncate">{param.label}</span>
            <div className="flex items-center gap-1.5 shrink-0">
              <span className={`text-xs font-mono font-medium tabular-nums ${statusColor}`}>
                {displayValue}
              </span>
              <div
                className={`h-1.5 w-1.5 rounded-full shrink-0 ${dotColor}`}
                title={classification.status}
                aria-label={`Status: ${classification.status}`}
              />
            </div>
          </div>
        )
      })}
    </div>
  )
}
