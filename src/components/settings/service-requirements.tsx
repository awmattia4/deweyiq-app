"use client"

import { useState, useTransition } from "react"
import { toast } from "sonner"
import { Button } from "@/components/ui/button"
import { Checkbox } from "@/components/ui/checkbox"
import { Label } from "@/components/ui/label"
import { updateOrgSettings } from "@/actions/company-settings"
import type { OrgSettings } from "@/actions/company-settings"

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const SANITIZER_TYPES = [
  { key: "chlorine", label: "Chlorine" },
  { key: "salt", label: "Salt" },
  { key: "bromine", label: "Bromine" },
  { key: "other", label: "Other" },
] as const

const CHEMISTRY_PARAMS = [
  { key: "freeChlorine", label: "Free Chlorine" },
  { key: "pH", label: "pH" },
  { key: "totalAlkalinity", label: "Total Alkalinity" },
  { key: "cya", label: "CYA / Stabilizer" },
  { key: "calciumHardness", label: "Calcium Hardness" },
  { key: "tds", label: "TDS" },
  { key: "phosphates", label: "Phosphates" },
  { key: "salt", label: "Salt" },
] as const

// Default required chemistry per sanitizer type
const DEFAULT_CHEMISTRY_BY_SANITIZER: Record<string, string[]> = {
  chlorine: ["freeChlorine", "pH", "totalAlkalinity"],
  salt: ["freeChlorine", "pH", "totalAlkalinity", "salt"],
  bromine: ["pH", "totalAlkalinity"],
  other: ["pH", "totalAlkalinity"],
}

// Standard checklist task definitions
const STANDARD_CHECKLIST_TASKS = [
  { id: "skim", label: "Skim surface debris" },
  { id: "brush", label: "Brush walls and floor" },
  { id: "vacuum", label: "Vacuum pool" },
  { id: "emptyBaskets", label: "Empty skimmer and pump baskets" },
  { id: "backwash", label: "Backwash filter" },
  { id: "checkEquipment", label: "Check equipment operation" },
  { id: "cleanFilter", label: "Clean filter" },
] as const

// ---------------------------------------------------------------------------
// ServiceRequirements
// ---------------------------------------------------------------------------

interface ServiceRequirementsProps {
  settings: OrgSettings
}

/**
 * ServiceRequirements — configure which chemistry readings and checklist tasks
 * are required for stop completion.
 *
 * Two subsections:
 * a) Chemistry Requirements per Sanitizer Type
 * b) Required Checklist Tasks
 *
 * Uses plain React state + inline validation (no zod/hookform — codebase pattern).
 */
export function ServiceRequirements({ settings }: ServiceRequirementsProps) {
  // ── Chemistry requirements state ─────────────────────────────────────────

  const [chemistryByType, setChemistryByType] = useState<Record<string, string[]>>(
    () => settings.required_chemistry_by_sanitizer ?? DEFAULT_CHEMISTRY_BY_SANITIZER
  )
  const [chemSaving, startChemTransition] = useTransition()

  // ── Required checklist tasks state ───────────────────────────────────────

  const [requiredTaskIds, setRequiredTaskIds] = useState<string[]>(
    () => settings.required_checklist_task_ids ?? []
  )
  const [checklistSaving, startChecklistTransition] = useTransition()

  // ── Chemistry handlers ───────────────────────────────────────────────────

  const handleChemistryToggle = (sanitizerType: string, paramKey: string, checked: boolean) => {
    setChemistryByType((prev) => {
      const current = prev[sanitizerType] ?? []
      if (checked) {
        return { ...prev, [sanitizerType]: [...current, paramKey] }
      } else {
        return { ...prev, [sanitizerType]: current.filter((k) => k !== paramKey) }
      }
    })
  }

  const handleSaveChemistry = () => {
    startChemTransition(async () => {
      const result = await updateOrgSettings({
        required_chemistry_by_sanitizer: chemistryByType,
      })
      if (!result.success) {
        toast.error("Failed to save chemistry requirements", {
          description: result.error,
        })
      } else {
        toast.success("Chemistry requirements saved")
      }
    })
  }

  // ── Checklist handlers ───────────────────────────────────────────────────

  const handleChecklistToggle = (taskId: string, checked: boolean) => {
    setRequiredTaskIds((prev) => {
      if (checked) {
        return [...prev, taskId]
      } else {
        return prev.filter((id) => id !== taskId)
      }
    })
  }

  const handleSaveChecklist = () => {
    startChecklistTransition(async () => {
      const result = await updateOrgSettings({
        required_checklist_task_ids: requiredTaskIds,
      })
      if (!result.success) {
        toast.error("Failed to save checklist requirements", {
          description: result.error,
        })
      } else {
        toast.success("Checklist requirements saved")
      }
    })
  }

  // ── Render ───────────────────────────────────────────────────────────────

  return (
    <div className="flex flex-col gap-8">
      {/* ── Chemistry Requirements per Sanitizer Type ─────────────────────── */}
      <div className="flex flex-col gap-4">
        <div>
          <h3 className="text-sm font-semibold text-foreground">Chemistry Requirements</h3>
          <p className="text-xs text-muted-foreground mt-0.5">
            Choose which readings are required for each sanitizer type. Techs see a warning when missing required readings.
          </p>
        </div>

        <div className="flex flex-col gap-4">
          {SANITIZER_TYPES.map((sanitizer) => (
            <div
              key={sanitizer.key}
              className="rounded-xl border border-border/60 bg-muted/5 p-4"
            >
              <p className="text-sm font-medium text-foreground mb-3">
                {sanitizer.label} Pools
              </p>
              <div className="grid grid-cols-2 gap-x-6 gap-y-2.5">
                {CHEMISTRY_PARAMS.map((param) => {
                  const isChecked = (chemistryByType[sanitizer.key] ?? []).includes(param.key)
                  return (
                    <div key={param.key} className="flex items-center gap-2.5">
                      <Checkbox
                        id={`chem-${sanitizer.key}-${param.key}`}
                        checked={isChecked}
                        onCheckedChange={(checked) =>
                          handleChemistryToggle(sanitizer.key, param.key, !!checked)
                        }
                        className="cursor-pointer"
                      />
                      <Label
                        htmlFor={`chem-${sanitizer.key}-${param.key}`}
                        className="text-xs text-foreground/80 leading-tight cursor-pointer"
                      >
                        {param.label}
                      </Label>
                    </div>
                  )
                })}
              </div>
            </div>
          ))}
        </div>

        <div className="flex justify-end">
          <Button
            size="sm"
            onClick={handleSaveChemistry}
            disabled={chemSaving}
            className="cursor-pointer"
          >
            {chemSaving ? "Saving..." : "Save Chemistry Requirements"}
          </Button>
        </div>
      </div>

      {/* ── Required Checklist Tasks ─────────────────────────────────────── */}
      <div className="flex flex-col gap-4">
        <div>
          <h3 className="text-sm font-semibold text-foreground">Required Checklist Tasks</h3>
          <p className="text-xs text-muted-foreground mt-0.5">
            Mark which tasks must be completed at every stop. Techs are warned but not blocked.
          </p>
        </div>

        <div className="rounded-xl border border-border/60 bg-muted/5 divide-y divide-border/40">
          {STANDARD_CHECKLIST_TASKS.map((task) => {
            const isRequired = requiredTaskIds.includes(task.id)
            return (
              <div key={task.id} className="flex items-center gap-3 px-4 py-3">
                <Checkbox
                  id={`task-${task.id}`}
                  checked={isRequired}
                  onCheckedChange={(checked) =>
                    handleChecklistToggle(task.id, !!checked)
                  }
                  className="cursor-pointer"
                />
                <Label
                  htmlFor={`task-${task.id}`}
                  className="text-sm text-foreground/80 leading-tight cursor-pointer flex-1"
                >
                  {task.label}
                </Label>
                {isRequired && (
                  <span className="text-xs text-amber-400 font-medium shrink-0">
                    Required
                  </span>
                )}
              </div>
            )
          })}
        </div>

        <div className="flex justify-end">
          <Button
            size="sm"
            onClick={handleSaveChecklist}
            disabled={checklistSaving}
            className="cursor-pointer"
          >
            {checklistSaving ? "Saving..." : "Save Checklist Requirements"}
          </Button>
        </div>
      </div>
    </div>
  )
}
