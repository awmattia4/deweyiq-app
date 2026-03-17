"use client"

/**
 * SurveyChecklist — Survey-specific checklist component for site surveys.
 *
 * Renders the 15-item default checklist grouped by category:
 * Dimensions, Existing Equipment, Site Conditions, Access & Compliance, Photos.
 *
 * Each item has: checkbox, label, optional notes/measurement input.
 * Camera functionality is handled by the parent SiteSurveyWorkflow.
 *
 * Phase 12 Plan 04: Site Survey Workflow (PROJ-07, PROJ-08)
 */

import { Checkbox } from "@/components/ui/checkbox"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import type { SurveyChecklistCategory } from "@/actions/projects-survey"

// ─── Types ────────────────────────────────────────────────────────────────────

export interface ChecklistItemState {
  checked: boolean
  note: string
}

export type ChecklistState = Record<string, ChecklistItemState>

interface SurveyChecklistProps {
  categories: SurveyChecklistCategory[]
  state: ChecklistState
  onChange: (itemId: string, update: Partial<ChecklistItemState>) => void
  readonly?: boolean
}

// ─── Component ────────────────────────────────────────────────────────────────

/**
 * SurveyChecklist — Renders all survey checklist categories with checkboxes
 * and note inputs. Grouped by category for easy field navigation.
 */
export function SurveyChecklist({
  categories,
  state,
  onChange,
  readonly = false,
}: SurveyChecklistProps) {
  return (
    <div className="flex flex-col gap-6">
      {categories.map((category) => (
        <div key={category.id} className="flex flex-col gap-3">
          {/* Category header */}
          <h4 className="text-sm font-semibold text-foreground border-b border-border pb-1.5">
            {category.label}
          </h4>

          {/* Items */}
          <div className="flex flex-col gap-4">
            {category.items.map((item) => {
              const itemState = state[item.id] ?? { checked: false, note: "" }

              return (
                <div key={item.id} className="flex flex-col gap-1.5">
                  {/* Checkbox + label row */}
                  <div className="flex items-start gap-3">
                    {readonly ? (
                      <div
                        className={`w-4 h-4 mt-0.5 rounded-sm border flex-shrink-0 ${
                          itemState.checked
                            ? "bg-primary border-primary"
                            : "border-muted-foreground/40"
                        }`}
                      />
                    ) : (
                      <Checkbox
                        id={`checklist-${item.id}`}
                        checked={itemState.checked}
                        onCheckedChange={(checked) =>
                          onChange(item.id, { checked: checked === true })
                        }
                        className="mt-0.5 flex-shrink-0"
                      />
                    )}
                    <Label
                      htmlFor={readonly ? undefined : `checklist-${item.id}`}
                      className={`text-sm leading-snug cursor-pointer ${
                        itemState.checked && !readonly
                          ? "text-muted-foreground line-through"
                          : "text-foreground"
                      }`}
                    >
                      {item.label}
                    </Label>
                  </div>

                  {/* Note input — only show for items that have notes enabled */}
                  {(item.requiresNote || itemState.note) && (
                    <div className="ml-7">
                      {readonly ? (
                        itemState.note ? (
                          <p className="text-sm text-muted-foreground">{itemState.note}</p>
                        ) : null
                      ) : (
                        <Input
                          placeholder={item.placeholder ?? "Add note..."}
                          value={itemState.note}
                          onChange={(e) => onChange(item.id, { note: e.target.value })}
                          className="text-sm h-8"
                          disabled={readonly}
                        />
                      )}
                    </div>
                  )}
                </div>
              )
            })}
          </div>
        </div>
      ))}
    </div>
  )
}

// ─── Read-only summary variant ────────────────────────────────────────────────

interface SurveyChecklistSummaryProps {
  categories: SurveyChecklistCategory[]
  state: ChecklistState
}

/**
 * SurveyChecklistSummary — Compact read-only view showing checked items
 * with their notes. Used on the project detail page for completed surveys.
 */
export function SurveyChecklistSummary({
  categories,
  state,
}: SurveyChecklistSummaryProps) {
  const checkedItems = categories
    .flatMap((cat) =>
      cat.items
        .filter((item) => state[item.id]?.checked)
        .map((item) => ({
          ...item,
          categoryLabel: cat.label,
          note: state[item.id]?.note ?? "",
        }))
    )

  if (checkedItems.length === 0) {
    return (
      <p className="text-sm text-muted-foreground italic">
        No checklist items completed.
      </p>
    )
  }

  return (
    <div className="flex flex-col gap-1.5">
      {checkedItems.map((item) => (
        <div key={item.id} className="flex items-start gap-2 text-sm">
          <div className="w-3.5 h-3.5 mt-0.5 rounded-sm bg-primary flex-shrink-0" />
          <div className="flex-1 min-w-0">
            <span className="text-foreground">{item.label}</span>
            {item.note && (
              <span className="text-muted-foreground"> — {item.note}</span>
            )}
          </div>
        </div>
      ))}
    </div>
  )
}
