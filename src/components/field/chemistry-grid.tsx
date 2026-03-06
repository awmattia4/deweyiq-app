"use client"

import { useRef } from "react"
import { classifyReading } from "@/lib/chemistry/targets"
import type { SanitizerType, TargetRanges } from "@/lib/chemistry/targets"
import { cn } from "@/lib/utils"

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface ChemistryGridProps {
  chemistry: Record<string, number | null>
  previousChemistry: Record<string, number | null>
  sanitizerType: SanitizerType
  onUpdate: (param: string, value: number | null) => Promise<void>
}

// ---------------------------------------------------------------------------
// Parameter definitions (in display order)
// ---------------------------------------------------------------------------

type ParamKey = keyof TargetRanges

interface ChemParam {
  /** TargetRanges key — null for params with no range (e.g. temperature) */
  key: ParamKey | null
  /** Key used in chemistry record (matches FullChemistryReadings keys) */
  dataKey: string
  label: string
  unit: string
  placeholder: string
  /** Required for this sanitizer type by default */
  requiredFor: SanitizerType[]
}

const CHEMISTRY_PARAMS: ChemParam[] = [
  {
    key: "freeChlorine",
    dataKey: "freeChlorine",
    label: "Free Chlorine",
    unit: "ppm",
    placeholder: "2–4",
    requiredFor: ["chlorine", "salt"],
  },
  {
    key: "bromine",
    dataKey: "bromine",
    label: "Bromine",
    unit: "ppm",
    placeholder: "3–5",
    requiredFor: ["bromine"],
  },
  {
    key: "pH",
    dataKey: "pH",
    label: "pH",
    unit: "",
    placeholder: "7.2–7.8",
    requiredFor: ["chlorine", "salt", "bromine"],
  },
  {
    key: "totalAlkalinity",
    dataKey: "totalAlkalinity",
    label: "Total Alkalinity",
    unit: "ppm",
    placeholder: "80–120",
    requiredFor: ["chlorine", "salt", "bromine"],
  },
  {
    key: "cya",
    dataKey: "cya",
    label: "Cyanuric Acid",
    unit: "ppm",
    placeholder: "30–50",
    requiredFor: ["chlorine", "salt"],
  },
  {
    key: "calciumHardness",
    dataKey: "calciumHardness",
    label: "Calcium Hardness",
    unit: "ppm",
    placeholder: "200–400",
    requiredFor: [],
  },
  {
    key: "tds",
    dataKey: "tds",
    label: "TDS",
    unit: "ppm",
    placeholder: "< 1500",
    requiredFor: [],
  },
  {
    key: "phosphates",
    dataKey: "phosphates",
    label: "Phosphates",
    unit: "ppb",
    placeholder: "< 200",
    requiredFor: [],
  },
  {
    key: "salt",
    dataKey: "salt",
    label: "Salt",
    unit: "ppm",
    placeholder: "2700–3400",
    requiredFor: ["salt"],
  },
  {
    key: null, // Temperature has no range classification target
    dataKey: "temperatureF",
    label: "Temperature",
    unit: "°F",
    placeholder: "60–90",
    requiredFor: [],
  },
]

// ---------------------------------------------------------------------------
// Cell border + badge colors based on range classification
// ---------------------------------------------------------------------------

function getCellStyles(status: "low" | "ok" | "high") {
  switch (status) {
    case "low":
    case "high":
      return {
        inputClass: "border-red-500/70 bg-red-950/20 focus-visible:ring-red-500/50",
        badgeClass: "bg-red-500/15 text-red-400 border border-red-500/20",
      }
    default:
      return {
        inputClass: "border-input bg-background focus-visible:ring-ring",
        badgeClass: "",
      }
  }
}

// Classify a reading against its target range
function getExtendedStatus(
  param: ParamKey | null,
  value: number,
  sanitizerType: SanitizerType
): { status: "low" | "ok" | "high"; severity: "warn" | "error" | "ok" } {
  // Params with no target range (e.g. temperature) are always "ok"
  if (param === null) {
    return { status: "ok", severity: "ok" }
  }
  const { status } = classifyReading(param, value, sanitizerType)

  // For now all out-of-range is red; yellow warning zone could be added in future
  return {
    status,
    severity: status === "ok" ? "ok" : "error",
  }
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

/**
 * ChemistryGrid — quick-entry grid for all pool chemistry parameters.
 *
 * Per locked decisions:
 * - inputMode="decimal" for iOS decimal keypad (NOT type="number")
 * - Previous visit readings shown in muted column
 * - Out-of-range readings: color-coded cells (green/yellow/red) + LOW/HIGH badge
 * - Required params shown with asterisk
 * - On change: writes to Dexie via onUpdate (zero-latency, offline-first)
 */
export function ChemistryGrid({
  chemistry,
  previousChemistry,
  sanitizerType,
  onUpdate,
}: ChemistryGridProps) {
  // Track input element refs for focus management (per locked pattern — not react-hook-form)
  const inputRefs = useRef<Record<string, HTMLInputElement | null>>({})

  const handleChange = async (dataKey: string, raw: string) => {
    if (raw === "" || raw === "-") {
      await onUpdate(dataKey, null)
      return
    }
    const parsed = parseFloat(raw)
    if (isNaN(parsed)) return
    await onUpdate(dataKey, parsed)
  }

  return (
    <div className="rounded-xl border border-border/60 bg-card overflow-hidden">
      {/* Column headers */}
      <div className="grid grid-cols-[1fr_auto_auto] gap-x-3 px-4 py-2.5 bg-muted/30 border-b border-border/40">
        <span className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
          Parameter
        </span>
        <span className="text-xs font-medium text-muted-foreground uppercase tracking-wide text-right w-28">
          Reading
        </span>
        <span className="text-xs font-medium text-muted-foreground uppercase tracking-wide text-right w-14">
          Last
        </span>
      </div>

      {/* Parameter rows */}
      <div className="divide-y divide-border/30">
        {CHEMISTRY_PARAMS.map((param, idx) => {
          // Skip bromine for non-bromine pools, skip FC for bromine pools
          if (param.key === "bromine" && sanitizerType !== "bromine") return null
          if (param.key === "freeChlorine" && sanitizerType === "bromine") return null
          // Skip CYA for bromine
          if (param.key === "cya" && sanitizerType === "bromine") return null
          // Skip salt for non-salt pools
          if (param.key === "salt" && sanitizerType !== "salt") return null

          const currentValue = chemistry[param.dataKey]
          const previousValue = previousChemistry[param.dataKey]
          const isRequired = param.requiredFor.includes(sanitizerType)

          // Determine range status for current value
          let rangeStatus: "low" | "ok" | "high" = "ok"
          let severity: "warn" | "error" | "ok" = "ok"

          if (currentValue !== null && currentValue !== undefined) {
            const result = getExtendedStatus(param.key, currentValue, sanitizerType)
            rangeStatus = result.status
            severity = result.severity
          }

          const { inputClass, badgeClass } = getCellStyles(rangeStatus)

          const displayValue =
            currentValue !== null && currentValue !== undefined
              ? String(currentValue)
              : ""

          return (
            <div
              key={param.dataKey}
              className="grid grid-cols-[1fr_auto_auto] items-center gap-x-3 px-4 py-2.5"
            >
              {/* Parameter name + unit */}
              <div className="flex flex-col gap-0.5 min-w-0">
                <span className="text-sm font-medium leading-tight">
                  {param.label}
                  {isRequired && (
                    <span className="text-primary/60 ml-0.5" aria-label="required">
                      *
                    </span>
                  )}
                </span>
                {param.unit && (
                  <span className="text-xs text-muted-foreground">{param.unit}</span>
                )}
              </div>

              {/* Input cell */}
              <div className="flex items-center gap-1.5 w-28">
                {/* LOW/HIGH badge */}
                {rangeStatus !== "ok" && (
                  <span
                    className={cn(
                      "text-[10px] font-bold uppercase px-1.5 py-0.5 rounded leading-none shrink-0",
                      badgeClass
                    )}
                  >
                    {rangeStatus === "low" ? "LOW" : "HIGH"}
                  </span>
                )}
                <input
                  ref={(el) => {
                    inputRefs.current[param.dataKey] = el
                  }}
                  type="text"
                  inputMode="decimal"
                  pattern="[0-9]*\.?[0-9]*"
                  className={cn(
                    "flex h-11 w-full rounded-lg border px-3 py-2 text-sm ring-offset-background",
                    "placeholder:text-muted-foreground/50",
                    "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-1",
                    "transition-colors",
                    inputClass
                  )}
                  placeholder={param.placeholder}
                  value={displayValue}
                  onChange={(e) => handleChange(param.dataKey, e.target.value)}
                  aria-label={`${param.label}${param.unit ? ` (${param.unit})` : ""}`}
                />
              </div>

              {/* Previous reading (muted) */}
              <div className="w-14 text-right">
                <span className="text-sm text-muted-foreground/50 tabular-nums">
                  {previousValue !== null && previousValue !== undefined
                    ? String(previousValue)
                    : "—"}
                </span>
              </div>
            </div>
          )
        })}
      </div>

      {/* Footer note */}
      <div className="px-4 py-2 bg-muted/20 border-t border-border/40">
        <p className="text-[11px] text-muted-foreground/50">
          <span className="text-primary/60">*</span> Required parameter &nbsp;·&nbsp; Last column shows previous visit reading
        </p>
      </div>
    </div>
  )
}
