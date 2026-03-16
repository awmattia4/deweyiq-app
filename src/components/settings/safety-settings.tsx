"use client"

/**
 * SafetySettings -- Owner-configurable safety escalation chain UI.
 *
 * Phase 10 Plan 14
 *
 * Allows the owner to configure:
 * - Inactivity timeout (minutes without stop completion before alerting)
 * - Escalation chain: ordered list of contacts to notify with delays
 *
 * Plain React state, no zod/hookform (per MEMORY.md).
 */

import { useState, useCallback } from "react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Loader2, Plus, X, ChevronUp, ChevronDown, Save } from "lucide-react"
import { updateOrgSettings } from "@/actions/company-settings"
import type { OrgSettings } from "@/actions/company-settings"

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface EscalationStep {
  role: string
  delay_minutes: number
}

interface TeamMember {
  id: string
  fullName: string
  role: "owner" | "office" | "tech"
}

interface SafetySettingsProps {
  settings: OrgSettings
  teamMembers: TeamMember[]
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function getStepLabel(step: EscalationStep, teamMembers: TeamMember[]): string {
  if (step.role === "owner") return "Owner"
  if (step.role === "office") return "All office staff"
  const member = teamMembers.find((m) => m.id === step.role)
  return member ? member.fullName : "Unknown"
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function SafetySettings({ settings, teamMembers }: SafetySettingsProps) {
  const [timeoutMinutes, setTimeoutMinutes] = useState(
    settings.safety_timeout_minutes ?? 30
  )
  const [chain, setChain] = useState<EscalationStep[]>(
    (settings.safety_escalation_chain as EscalationStep[] | null) ?? [
      { role: "owner", delay_minutes: 0 },
    ]
  )
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [saved, setSaved] = useState(false)

  // Build options for the role dropdown
  const roleOptions: Array<{ value: string; label: string }> = [
    { value: "owner", label: "Owner" },
    { value: "office", label: "All office staff" },
    ...teamMembers
      .filter((m) => m.role !== "owner") // owner already covered above
      .map((m) => ({ value: m.id, label: m.fullName })),
  ]

  const addStep = useCallback(() => {
    if (chain.length >= 5) return
    const lastDelay =
      chain.length > 0 ? chain[chain.length - 1].delay_minutes : 0
    setChain((prev) => [
      ...prev,
      { role: "owner", delay_minutes: lastDelay + 15 },
    ])
    setSaved(false)
  }, [chain])

  const removeStep = useCallback((index: number) => {
    setChain((prev) => prev.filter((_, i) => i !== index))
    setSaved(false)
  }, [])

  const updateStep = useCallback(
    (index: number, field: keyof EscalationStep, value: string | number) => {
      setChain((prev) =>
        prev.map((step, i) =>
          i === index ? { ...step, [field]: value } : step
        )
      )
      setSaved(false)
    },
    []
  )

  const moveUp = useCallback((index: number) => {
    if (index === 0) return
    setChain((prev) => {
      const next = [...prev]
      ;[next[index - 1], next[index]] = [next[index], next[index - 1]]
      return next
    })
    setSaved(false)
  }, [])

  const moveDown = useCallback((index: number) => {
    setChain((prev) => {
      if (index === prev.length - 1) return prev
      const next = [...prev]
      ;[next[index], next[index + 1]] = [next[index + 1], next[index]]
      return next
    })
    setSaved(false)
  }, [])

  const handleSave = useCallback(async () => {
    setError(null)
    setSaving(true)
    setSaved(false)

    // Validate: at least one step required
    if (chain.length === 0) {
      setError("At least one escalation contact is required.")
      setSaving(false)
      return
    }

    // Validate: timeout >= 5 minutes
    if (timeoutMinutes < 5) {
      setError("Minimum timeout is 5 minutes.")
      setSaving(false)
      return
    }

    // Ensure first step has delay_minutes = 0
    const normalizedChain = chain.map((step, i) => ({
      ...step,
      delay_minutes: i === 0 ? 0 : step.delay_minutes,
    }))

    const result = await updateOrgSettings({
      safety_timeout_minutes: timeoutMinutes,
      safety_escalation_chain: normalizedChain,
    })

    setSaving(false)
    if (result.success) {
      setSaved(true)
    } else {
      setError(result.error ?? "Failed to save settings")
    }
  }, [chain, timeoutMinutes])

  // Build escalation preview text
  const previewLines = chain.map((step, i) => {
    const who = getStepLabel(step, teamMembers)
    if (i === 0) return `Immediately alert ${who}`
    return `After ${step.delay_minutes} min: alert ${who}`
  })

  return (
    <div className="flex flex-col gap-6">
      {/* ── Timeout ───────────────────────────────────────────────────────── */}
      <div className="flex flex-col gap-2">
        <Label htmlFor="safety-timeout" className="text-sm font-medium">
          Alert threshold
        </Label>
        <p className="text-xs text-muted-foreground">
          Alert if a tech has not completed any stop or started their route for this many minutes.
        </p>
        <div className="flex items-center gap-2">
          <Input
            id="safety-timeout"
            type="number"
            min={5}
            max={120}
            value={timeoutMinutes}
            onChange={(e) => {
              const v = parseInt(e.target.value, 10)
              if (!isNaN(v)) {
                setTimeoutMinutes(v)
                setSaved(false)
              }
            }}
            className="w-24"
          />
          <span className="text-sm text-muted-foreground">minutes</span>
        </div>
      </div>

      {/* ── Escalation chain ──────────────────────────────────────────────── */}
      <div className="flex flex-col gap-3">
        <div>
          <Label className="text-sm font-medium">Escalation chain</Label>
          <p className="text-xs text-muted-foreground mt-0.5">
            Who to notify, and in what order. The first contact is always alerted immediately.
          </p>
        </div>

        <div className="flex flex-col gap-2">
          {chain.map((step, index) => (
            <div
              key={index}
              className="flex items-center gap-2 rounded-lg border border-border bg-muted/20 p-3"
            >
              {/* Reorder buttons */}
              <div className="flex flex-col gap-0.5">
                <button
                  type="button"
                  onClick={() => moveUp(index)}
                  disabled={index === 0}
                  className="cursor-pointer p-0.5 rounded text-muted-foreground hover:text-foreground disabled:opacity-30 disabled:cursor-not-allowed"
                  aria-label="Move up"
                >
                  <ChevronUp className="h-3 w-3" />
                </button>
                <button
                  type="button"
                  onClick={() => moveDown(index)}
                  disabled={index === chain.length - 1}
                  className="cursor-pointer p-0.5 rounded text-muted-foreground hover:text-foreground disabled:opacity-30 disabled:cursor-not-allowed"
                  aria-label="Move down"
                >
                  <ChevronDown className="h-3 w-3" />
                </button>
              </div>

              {/* Step number */}
              <span className="text-xs font-medium text-muted-foreground w-4 shrink-0">
                {index + 1}.
              </span>

              {/* Who to notify */}
              <div className="flex flex-col gap-1 flex-1 min-w-0">
                <select
                  value={step.role}
                  onChange={(e) => updateStep(index, "role", e.target.value)}
                  className="w-full rounded-md border border-input bg-background px-2 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
                >
                  {roleOptions.map((opt) => (
                    <option key={opt.value} value={opt.value}>
                      {opt.label}
                    </option>
                  ))}
                </select>
              </div>

              {/* Delay — first step locked at 0 */}
              {index === 0 ? (
                <span className="text-xs text-muted-foreground shrink-0 w-24 text-right">
                  Immediately
                </span>
              ) : (
                <div className="flex items-center gap-1 shrink-0">
                  <span className="text-xs text-muted-foreground">after</span>
                  <Input
                    type="number"
                    min={1}
                    max={120}
                    value={step.delay_minutes}
                    onChange={(e) => {
                      const v = parseInt(e.target.value, 10)
                      if (!isNaN(v)) updateStep(index, "delay_minutes", v)
                    }}
                    className="w-16 h-7 text-sm px-2"
                  />
                  <span className="text-xs text-muted-foreground">min</span>
                </div>
              )}

              {/* Remove — not first step */}
              {chain.length > 1 && (
                <button
                  type="button"
                  onClick={() => removeStep(index)}
                  className="cursor-pointer p-1 rounded text-muted-foreground hover:text-destructive shrink-0"
                  aria-label="Remove step"
                >
                  <X className="h-3.5 w-3.5" />
                </button>
              )}
            </div>
          ))}
        </div>

        {chain.length < 5 && (
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={addStep}
            className="w-fit cursor-pointer"
          >
            <Plus className="h-4 w-4" />
            Add step
          </Button>
        )}
      </div>

      {/* ── Escalation preview ────────────────────────────────────────────── */}
      {previewLines.length > 0 && (
        <div className="rounded-lg bg-muted/30 border border-border px-4 py-3">
          <p className="text-xs font-medium text-muted-foreground mb-1.5">
            Preview — if a tech is unresponsive for {timeoutMinutes} min:
          </p>
          <ol className="flex flex-col gap-1">
            {previewLines.map((line, i) => (
              <li key={i} className="text-sm">
                {line}
              </li>
            ))}
          </ol>
        </div>
      )}

      {/* ── Feedback ──────────────────────────────────────────────────────── */}
      {error && (
        <p className="text-sm text-destructive">{error}</p>
      )}
      {saved && (
        <p className="text-sm text-green-500">Safety settings saved.</p>
      )}

      {/* ── Save ──────────────────────────────────────────────────────────── */}
      <div>
        <Button
          type="button"
          size="sm"
          onClick={handleSave}
          disabled={saving}
          className="cursor-pointer"
        >
          {saving ? (
            <>
              <Loader2 className="h-4 w-4 animate-spin" />
              Saving...
            </>
          ) : (
            <>
              <Save className="h-4 w-4" />
              Save safety settings
            </>
          )}
        </Button>
      </div>
    </div>
  )
}
