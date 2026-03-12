"use client"

/**
 * DunningSettings -- Owner-configurable dunning sequence UI.
 *
 * Allows the owner to configure:
 * - Max retries (1-10)
 * - Dunning steps: day offset, email subject, email body per step (max 5)
 *
 * Plain React state, no zod/hookform (per MEMORY.md).
 */

import { useState, useCallback } from "react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Textarea } from "@/components/ui/textarea"
import { Label } from "@/components/ui/label"
import { Loader2, Plus, X, Save } from "lucide-react"
import { updateDunningConfig } from "@/actions/dunning"
import type { DunningStep } from "@/lib/db/schema/dunning"

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface DunningSettingsProps {
  initialSteps: DunningStep[]
  initialMaxRetries: number
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function DunningSettings({
  initialSteps,
  initialMaxRetries,
}: DunningSettingsProps) {
  const [steps, setSteps] = useState<DunningStep[]>(initialSteps)
  const [maxRetries, setMaxRetries] = useState(initialMaxRetries)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [saved, setSaved] = useState(false)

  const addStep = useCallback(() => {
    if (steps.length >= 5) return
    const lastOffset = steps.length > 0 ? steps[steps.length - 1].day_offset : 0
    setSteps((prev) => [
      ...prev,
      {
        day_offset: lastOffset + 7,
        email_subject: "",
        email_body: "",
      },
    ])
    setSaved(false)
  }, [steps])

  const removeStep = useCallback((index: number) => {
    setSteps((prev) => prev.filter((_, i) => i !== index))
    setSaved(false)
  }, [])

  const updateStep = useCallback(
    (index: number, field: keyof DunningStep, value: string | number) => {
      setSteps((prev) =>
        prev.map((step, i) =>
          i === index ? { ...step, [field]: value } : step
        )
      )
      setSaved(false)
    },
    []
  )

  const handleSave = useCallback(async () => {
    setError(null)
    setSaving(true)
    setSaved(false)

    const result = await updateDunningConfig(steps, maxRetries)

    setSaving(false)

    if (result.success) {
      setSaved(true)
    } else {
      setError(result.error ?? "Failed to save")
    }
  }, [steps, maxRetries])

  return (
    <div className="flex flex-col gap-6">
      {/* Max retries */}
      <div className="flex flex-col gap-2">
        <Label htmlFor="max-retries" className="text-sm font-medium">
          Maximum retry attempts
        </Label>
        <div className="flex items-center gap-2">
          <Input
            id="max-retries"
            type="number"
            min={1}
            max={10}
            value={maxRetries}
            onChange={(e) => {
              setMaxRetries(parseInt(e.target.value) || 1)
              setSaved(false)
            }}
            className="w-20"
          />
          <span className="text-sm text-muted-foreground">
            retries before stopping
          </span>
        </div>
      </div>

      {/* Dunning steps */}
      <div className="flex flex-col gap-4">
        <div className="flex items-center justify-between">
          <Label className="text-sm font-medium">
            Reminder steps ({steps.length}/5)
          </Label>
          {steps.length < 5 && (
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={addStep}
              className="cursor-pointer"
            >
              <Plus className="h-3.5 w-3.5" />
              Add Step
            </Button>
          )}
        </div>

        {steps.length === 0 && (
          <p className="text-sm text-muted-foreground italic">
            No dunning steps configured. Add at least one step to enable payment reminders.
          </p>
        )}

        {steps.map((step, index) => (
          <div
            key={index}
            className="rounded-lg border border-border bg-muted/20 p-4 flex flex-col gap-3"
          >
            <div className="flex items-center justify-between">
              <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                Step {index + 1}
              </span>
              <button
                type="button"
                onClick={() => removeStep(index)}
                className="p-1 rounded hover:bg-destructive/10 text-muted-foreground hover:text-destructive transition-colors cursor-pointer"
                aria-label={`Remove step ${index + 1}`}
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            {/* Day offset */}
            <div className="flex items-center gap-2">
              <Label className="text-sm text-muted-foreground w-24 flex-shrink-0">
                Send after
              </Label>
              <Input
                type="number"
                min={1}
                max={90}
                value={step.day_offset}
                onChange={(e) =>
                  updateStep(index, "day_offset", parseInt(e.target.value) || 1)
                }
                className="w-20"
              />
              <span className="text-sm text-muted-foreground">
                days past due
              </span>
            </div>

            {/* Email subject */}
            <div className="flex flex-col gap-1.5">
              <Label className="text-sm text-muted-foreground">
                Email subject
              </Label>
              <Input
                type="text"
                value={step.email_subject}
                onChange={(e) =>
                  updateStep(index, "email_subject", e.target.value)
                }
                placeholder={`Payment Reminder: Invoice {number}`}
              />
              <p className="text-xs text-muted-foreground">
                Use {"{number}"} for the invoice number.
              </p>
            </div>

            {/* Email body */}
            <div className="flex flex-col gap-1.5">
              <Label className="text-sm text-muted-foreground">
                Custom message (optional)
              </Label>
              <Textarea
                value={step.email_body}
                onChange={(e) =>
                  updateStep(index, "email_body", e.target.value)
                }
                placeholder="Leave blank to use the default reminder message."
                rows={2}
              />
            </div>
          </div>
        ))}
      </div>

      {/* Error / success */}
      {error && (
        <div className="rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive">
          {error}
        </div>
      )}

      {saved && (
        <div className="rounded-md border border-green-600/30 bg-green-600/10 px-3 py-2 text-sm text-green-500">
          Dunning settings saved.
        </div>
      )}

      {/* Save button */}
      <div className="flex justify-end">
        <Button
          type="button"
          onClick={handleSave}
          disabled={saving}
          className="cursor-pointer"
        >
          {saving ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            <Save className="h-4 w-4" />
          )}
          {saving ? "Saving..." : "Save Dunning Settings"}
        </Button>
      </div>
    </div>
  )
}
