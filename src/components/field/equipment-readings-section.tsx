"use client"

import { useState } from "react"
import { WrenchIcon, ChevronDownIcon, ChevronUpIcon } from "lucide-react"
import { cn } from "@/lib/utils"
import type { EquipmentMetrics } from "@/actions/equipment-readings"

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface EquipmentItem {
  id: string
  type: string
  brand: string | null
  model: string | null
}

// Metric field definitions per equipment type
// Maps equipment type strings to the metrics they support

interface MetricField {
  key: keyof EquipmentMetrics
  label: string
  unit: string
  min: number
  max: number
  step: number
  placeholder: string
}

const METRIC_FIELDS_BY_TYPE: Record<string, MetricField[]> = {
  // Salt chlorine generator
  salt_cell: [
    { key: "salt_ppm", label: "Salt", unit: "ppm", min: 0, max: 6000, step: 50, placeholder: "e.g. 3200" },
  ],
  salt_chlorine_generator: [
    { key: "salt_ppm", label: "Salt", unit: "ppm", min: 0, max: 6000, step: 50, placeholder: "e.g. 3200" },
  ],
  // Pump
  pump: [
    { key: "flow_gpm", label: "Flow rate", unit: "GPM", min: 0, max: 200, step: 1, placeholder: "e.g. 45" },
    { key: "rpm", label: "RPM", unit: "RPM", min: 0, max: 4000, step: 100, placeholder: "e.g. 2700" },
  ],
  // Filter
  filter: [
    { key: "psi", label: "Filter pressure", unit: "PSI", min: 0, max: 60, step: 1, placeholder: "e.g. 18" },
  ],
  // Heater
  heater: [
    { key: "delta_f", label: "Temp delta (out - in)", unit: "°F", min: 0, max: 50, step: 0.5, placeholder: "e.g. 8.5" },
  ],
}

/** Returns metric fields for an equipment type (case-insensitive, kebab/snake normalized). */
function getMetricFields(type: string): MetricField[] {
  const normalized = type.toLowerCase().replace(/[-\s]+/g, "_")
  return METRIC_FIELDS_BY_TYPE[normalized] ?? []
}

// ---------------------------------------------------------------------------
// ChemInput-pattern numeric input
//
// Per MEMORY.md: NEVER use parseFloat() directly on change.
// Use local string state, only flush on complete number.
// ---------------------------------------------------------------------------

interface MetricInputProps {
  field: MetricField
  value: EquipmentMetrics
  onChange: (updated: EquipmentMetrics) => void
}

function MetricInput({ field, value, onChange }: MetricInputProps) {
  // Local string state per MEMORY.md ChemInput pattern
  const [localStr, setLocalStr] = useState<string>(
    value[field.key] !== undefined ? String(value[field.key]) : ""
  )

  const handleChange = (str: string) => {
    setLocalStr(str)
    // Flush if it's a valid complete number (not ending in "." or "-")
    if (str === "" || str === "-") {
      // Don't flush intermediate state
      return
    }
    if (!str.endsWith(".") && !str.endsWith("-")) {
      const num = parseFloat(str)
      if (!isNaN(num)) {
        onChange({ ...value, [field.key]: num })
      } else {
        // Clear the metric from the output on invalid input
        const next = { ...value }
        delete next[field.key]
        onChange(next)
      }
    }
  }

  const handleBlur = () => {
    // Flush on blur as safety net (handles "7." case)
    const num = parseFloat(localStr)
    if (!isNaN(num)) {
      onChange({ ...value, [field.key]: num })
    } else if (localStr !== "") {
      setLocalStr("")
      const next = { ...value }
      delete next[field.key]
      onChange(next)
    }
  }

  return (
    <div className="flex flex-col gap-1">
      <label className="text-xs text-muted-foreground">
        {field.label}
        <span className="ml-1 text-muted-foreground/60">({field.unit})</span>
      </label>
      <input
        type="number"
        inputMode="decimal"
        min={field.min}
        max={field.max}
        step={field.step}
        value={localStr}
        placeholder={field.placeholder}
        onChange={(e) => handleChange(e.target.value)}
        onBlur={handleBlur}
        className="h-10 w-full rounded-lg border border-border/60 bg-muted/20 px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground/40 focus:outline-none focus:ring-2 focus:ring-ring focus:border-transparent transition-colors"
      />
    </div>
  )
}

// ---------------------------------------------------------------------------
// Single equipment piece reading block
// ---------------------------------------------------------------------------

interface EquipmentReadingBlockProps {
  item: EquipmentItem
  value: EquipmentMetrics
  onChange: (updated: EquipmentMetrics) => void
}

function EquipmentReadingBlock({ item, value, onChange }: EquipmentReadingBlockProps) {
  const fields = getMetricFields(item.type)

  if (fields.length === 0) {
    // Equipment type not tracked — don't render anything
    return null
  }

  const brandModel = [item.brand, item.model].filter(Boolean).join(" ")
  const equipLabel = [_capitalize(item.type.replace(/_/g, " ")), brandModel]
    .filter(Boolean)
    .join(" — ")

  return (
    <div className="flex flex-col gap-3 py-3 border-b border-border/40 last:border-0">
      <p className="text-sm font-medium text-foreground">{equipLabel}</p>
      <div className="grid grid-cols-2 gap-x-3 gap-y-2">
        {fields.map((field) => (
          <MetricInput
            key={field.key}
            field={field}
            value={value}
            onChange={onChange}
          />
        ))}
      </div>
    </div>
  )
}

function _capitalize(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1)
}

// ---------------------------------------------------------------------------
// EquipmentReadingsSection
// ---------------------------------------------------------------------------

export interface EquipmentReadingEntry {
  equipmentId: string
  metrics: EquipmentMetrics
}

interface EquipmentReadingsSectionProps {
  /** Equipment items for this pool. Section only renders if this has items with trackable metrics. */
  equipment: EquipmentItem[]
  /** Current readings state — keyed by equipment ID */
  readings: Record<string, EquipmentMetrics>
  /** Called when any reading changes */
  onChange: (equipmentId: string, metrics: EquipmentMetrics) => void
}

/**
 * EquipmentReadingsSection — collapsible section for logging equipment metrics
 * during stop completion.
 *
 * Only renders for equipment types that have defined metric fields.
 * All fields are optional — tech can skip this section entirely.
 * Uses ChemInput pattern (local string state) for decimal-safe input.
 */
export function EquipmentReadingsSection({
  equipment,
  readings,
  onChange,
}: EquipmentReadingsSectionProps) {
  const [expanded, setExpanded] = useState(false)

  // Only show equipment with trackable metrics
  const trackableEquipment = equipment.filter((item) => getMetricFields(item.type).length > 0)

  if (trackableEquipment.length === 0) return null

  const hasAnyReadings = Object.values(readings).some(
    (m) => Object.keys(m).length > 0
  )

  return (
    <div className="flex flex-col gap-0">
      {/* ── Section header / toggle button ─────────────────────────────── */}
      <button
        type="button"
        onClick={() => setExpanded((v) => !v)}
        className="flex w-full items-center justify-between gap-2 py-2 text-left focus:outline-none cursor-pointer"
        aria-expanded={expanded}
      >
        <div className="flex items-center gap-2">
          <WrenchIcon className="h-4 w-4 text-muted-foreground" />
          <span className="text-sm font-semibold text-foreground">Equipment Readings</span>
          {hasAnyReadings && !expanded && (
            <span className="text-xs text-green-400 font-medium">— entered</span>
          )}
        </div>
        <div className="flex items-center gap-1 text-xs text-muted-foreground">
          <span className="opacity-60">optional</span>
          {expanded ? (
            <ChevronUpIcon className="h-4 w-4" />
          ) : (
            <ChevronDownIcon className="h-4 w-4" />
          )}
        </div>
      </button>

      {/* ── Expandable content ──────────────────────────────────────────── */}
      {expanded && (
        <div className={cn("rounded-xl border border-border/40 bg-muted/10 px-3 pb-1 pt-0")}>
          {trackableEquipment.map((item) => (
            <EquipmentReadingBlock
              key={item.id}
              item={item}
              value={readings[item.id] ?? {}}
              onChange={(updated) => onChange(item.id, updated)}
            />
          ))}
        </div>
      )}
    </div>
  )
}
