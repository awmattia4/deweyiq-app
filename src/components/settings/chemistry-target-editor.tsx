"use client"

import { useState, useTransition, useCallback } from "react"
import { toast } from "sonner"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { updateOrgSettings } from "@/actions/company-settings"
import type { OrgSettings } from "@/actions/company-settings"
import { RotateCcwIcon } from "lucide-react"

// ---------------------------------------------------------------------------
// Constants — default target ranges from CPO curriculum (mirrors targets.ts)
// ---------------------------------------------------------------------------

const SANITIZER_TYPES = [
  { key: "chlorine", label: "Chlorine" },
  { key: "salt", label: "Salt" },
  { key: "bromine", label: "Bromine" },
] as const

const CHEMISTRY_PARAMS = [
  { key: "freeChlorine", label: "Free Chlorine", unit: "ppm" },
  { key: "bromine", label: "Bromine", unit: "ppm" },
  { key: "pH", label: "pH", unit: "" },
  { key: "totalAlkalinity", label: "Total Alkalinity", unit: "ppm" },
  { key: "cya", label: "CYA / Stabilizer", unit: "ppm" },
  { key: "calciumHardness", label: "Calcium Hardness", unit: "ppm" },
  { key: "tds", label: "TDS", unit: "ppm" },
  { key: "phosphates", label: "Phosphates", unit: "ppb" },
  { key: "salt", label: "Salt", unit: "ppm" },
] as const

// Default ranges per sanitizer (from targets.ts)
const DEFAULT_TARGETS: Record<string, Record<string, { min: number; max: number }>> = {
  chlorine: {
    freeChlorine: { min: 2, max: 4 },
    pH: { min: 7.2, max: 7.8 },
    totalAlkalinity: { min: 80, max: 120 },
    cya: { min: 30, max: 50 },
    calciumHardness: { min: 200, max: 400 },
    tds: { min: 0, max: 1500 },
    phosphates: { min: 0, max: 200 },
  },
  salt: {
    freeChlorine: { min: 2, max: 4 },
    pH: { min: 7.2, max: 7.8 },
    totalAlkalinity: { min: 80, max: 120 },
    cya: { min: 60, max: 80 },
    calciumHardness: { min: 200, max: 400 },
    tds: { min: 2700, max: 3400 },
    phosphates: { min: 0, max: 200 },
    salt: { min: 2700, max: 3400 },
  },
  bromine: {
    bromine: { min: 3, max: 5 },
    pH: { min: 7.2, max: 7.8 },
    totalAlkalinity: { min: 80, max: 120 },
    calciumHardness: { min: 200, max: 400 },
    tds: { min: 0, max: 1500 },
    phosphates: { min: 0, max: 200 },
  },
}

// Which params are relevant for each sanitizer
const PARAMS_BY_SANITIZER: Record<string, string[]> = {
  chlorine: ["freeChlorine", "pH", "totalAlkalinity", "cya", "calciumHardness", "tds", "phosphates"],
  salt: ["freeChlorine", "pH", "totalAlkalinity", "cya", "calciumHardness", "tds", "phosphates", "salt"],
  bromine: ["bromine", "pH", "totalAlkalinity", "calciumHardness", "tds", "phosphates"],
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

interface ChemistryTargetEditorProps {
  settings: OrgSettings
}

type TargetData = Record<string, Record<string, { min: number; max: number }>>

export function ChemistryTargetEditor({ settings }: ChemistryTargetEditorProps) {
  const [targets, setTargets] = useState<TargetData>(() => {
    // Merge saved custom targets over defaults
    const merged: TargetData = {}
    for (const san of SANITIZER_TYPES) {
      merged[san.key] = { ...DEFAULT_TARGETS[san.key] }
      if (settings.custom_chemistry_targets?.[san.key]) {
        merged[san.key] = {
          ...merged[san.key],
          ...settings.custom_chemistry_targets[san.key],
        }
      }
    }
    return merged
  })
  const [isSaving, startTransition] = useTransition()

  // Track local string state for inputs to handle decimal entry
  const [inputValues, setInputValues] = useState<Record<string, string>>({})

  const getInputKey = (san: string, param: string, bound: "min" | "max") =>
    `${san}-${param}-${bound}`

  const getDisplayValue = (san: string, param: string, bound: "min" | "max") => {
    const key = getInputKey(san, param, bound)
    if (key in inputValues) return inputValues[key]
    return String(targets[san]?.[param]?.[bound] ?? "")
  }

  const handleInputChange = (san: string, param: string, bound: "min" | "max", value: string) => {
    const key = getInputKey(san, param, bound)
    setInputValues((prev) => ({ ...prev, [key]: value }))

    // Only flush to targets if it's a complete number
    if (value !== "" && !value.endsWith(".") && !value.endsWith("-")) {
      const num = parseFloat(value)
      if (!isNaN(num)) {
        setTargets((prev) => ({
          ...prev,
          [san]: {
            ...prev[san],
            [param]: {
              ...prev[san]?.[param],
              [bound]: num,
            },
          },
        }))
      }
    }
  }

  const handleInputBlur = (san: string, param: string, bound: "min" | "max") => {
    const key = getInputKey(san, param, bound)
    const val = inputValues[key]
    if (val !== undefined) {
      const num = parseFloat(val)
      if (!isNaN(num)) {
        setTargets((prev) => ({
          ...prev,
          [san]: {
            ...prev[san],
            [param]: {
              ...prev[san]?.[param],
              [bound]: num,
            },
          },
        }))
      }
      // Clear local string state on blur
      setInputValues((prev) => {
        const next = { ...prev }
        delete next[key]
        return next
      })
    }
  }

  const handleSave = () => {
    startTransition(async () => {
      const result = await updateOrgSettings({
        custom_chemistry_targets: targets,
      })
      if (result.success) {
        toast.success("Chemistry targets saved")
      } else {
        toast.error(result.error ?? "Failed to save")
      }
    })
  }

  const handleResetToDefaults = () => {
    const reset: TargetData = {}
    for (const san of SANITIZER_TYPES) {
      reset[san.key] = { ...DEFAULT_TARGETS[san.key] }
    }
    setTargets(reset)
    setInputValues({})
    toast.info("Reset to CPO defaults — save to apply")
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-start justify-between gap-2">
        <div>
          <h3 className="text-sm font-semibold text-foreground">Chemistry Target Ranges</h3>
          <p className="text-xs text-muted-foreground mt-0.5">
            Customize the ideal min/max range for each reading. Used for color-coding in the chemistry grid and dosing recommendations.
          </p>
        </div>
        <Button
          variant="ghost"
          size="sm"
          onClick={handleResetToDefaults}
          className="shrink-0 text-muted-foreground hover:text-foreground cursor-pointer"
        >
          <RotateCcwIcon className="h-3.5 w-3.5" />
          Reset
        </Button>
      </div>

      {SANITIZER_TYPES.map((sanitizer) => {
        const relevantParams = PARAMS_BY_SANITIZER[sanitizer.key] ?? []
        return (
          <div
            key={sanitizer.key}
            className="rounded-xl border border-border/60 bg-muted/5 p-4"
          >
            <p className="text-sm font-medium text-foreground mb-3">
              {sanitizer.label} Pools
            </p>
            <div className="flex flex-col gap-2">
              {/* Header */}
              <div className="grid grid-cols-[1fr_80px_80px] gap-2 items-center px-0.5">
                <span className="text-xs text-muted-foreground">Parameter</span>
                <span className="text-xs text-muted-foreground text-center">Min</span>
                <span className="text-xs text-muted-foreground text-center">Max</span>
              </div>
              {relevantParams.map((paramKey) => {
                const paramMeta = CHEMISTRY_PARAMS.find((p) => p.key === paramKey)
                if (!paramMeta) return null
                return (
                  <div
                    key={paramKey}
                    className="grid grid-cols-[1fr_80px_80px] gap-2 items-center"
                  >
                    <Label className="text-xs text-foreground/80 truncate">
                      {paramMeta.label}
                      {paramMeta.unit && (
                        <span className="text-muted-foreground ml-1">({paramMeta.unit})</span>
                      )}
                    </Label>
                    <Input
                      type="text"
                      inputMode="decimal"
                      value={getDisplayValue(sanitizer.key, paramKey, "min")}
                      onChange={(e) =>
                        handleInputChange(sanitizer.key, paramKey, "min", e.target.value)
                      }
                      onBlur={() => handleInputBlur(sanitizer.key, paramKey, "min")}
                      className="h-7 text-xs text-center"
                    />
                    <Input
                      type="text"
                      inputMode="decimal"
                      value={getDisplayValue(sanitizer.key, paramKey, "max")}
                      onChange={(e) =>
                        handleInputChange(sanitizer.key, paramKey, "max", e.target.value)
                      }
                      onBlur={() => handleInputBlur(sanitizer.key, paramKey, "max")}
                      className="h-7 text-xs text-center"
                    />
                  </div>
                )
              })}
            </div>
          </div>
        )
      })}

      <div className="flex justify-end">
        <Button
          size="sm"
          onClick={handleSave}
          disabled={isSaving}
          className="cursor-pointer"
        >
          {isSaving ? "Saving..." : "Save Target Ranges"}
        </Button>
      </div>
    </div>
  )
}
