"use client"

import { useState, useTransition, useCallback, useEffect } from "react"
import { toast } from "sonner"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Badge } from "@/components/ui/badge"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { setPaymentSchedule, getDefaultPaymentSchedule } from "@/actions/projects-proposals"
import type {
  ProposalDetail,
  PaymentMilestone,
  MilestoneInput,
} from "@/actions/projects-proposals"
import type { ProjectPhaseSummary } from "@/actions/projects"
import { cn } from "@/lib/utils"

// ─── Types ────────────────────────────────────────────────────────────────────

interface EditableMilestone {
  id?: string
  name: string
  trigger_phase_id: string | null
  percentage: string
  amount: string
  due_date: string | null
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function computeAmount(percentage: string, total: number): string {
  const pct = parseFloat(percentage) || 0
  return ((pct / 100) * total).toFixed(2)
}

function sumPercentages(milestones: EditableMilestone[]): number {
  return milestones.reduce((sum, m) => sum + (parseFloat(m.percentage) || 0), 0)
}

// ─── PaymentScheduleBuilder ───────────────────────────────────────────────────

interface PaymentScheduleBuilderProps {
  proposal: ProposalDetail
  projectId: string
  phases: ProjectPhaseSummary[]
  onProposalUpdate: (proposal: ProposalDetail) => void
}

/**
 * PaymentScheduleBuilder — Configure payment milestones for the proposal.
 *
 * First row is always Deposit. Last row is always Final Payment.
 * Middle rows are progress payments optionally tied to phase completions.
 * Percentages must sum to 100%. Amount is computed from percentage × contract total.
 *
 * Retainage display: shows how retainage_pct affects each milestone.
 */
export function PaymentScheduleBuilder({
  proposal,
  projectId,
  phases,
  onProposalUpdate,
}: PaymentScheduleBuilderProps) {
  const [isPending, startTransition] = useTransition()
  const [isEditing, setIsEditing] = useState(false)

  const contractTotal = parseFloat(proposal.total_amount ?? "0") || 0

  // Initialize editable milestones from saved milestones or defaults
  const initMilestones = (): EditableMilestone[] => {
    if (proposal.milestones.length > 0) {
      return proposal.milestones.map((m) => ({
        id: m.id,
        name: m.name,
        trigger_phase_id: m.trigger_phase_id,
        percentage: String(parseFloat(m.percentage ?? "0") || 0),
        amount: m.amount,
        due_date: m.due_date,
      }))
    }
    // Default: Deposit 30% + Final 70%
    return [
      { name: "Deposit", trigger_phase_id: null, percentage: "30", amount: computeAmount("30", contractTotal), due_date: null },
      { name: "Final Payment", trigger_phase_id: null, percentage: "70", amount: computeAmount("70", contractTotal), due_date: null },
    ]
  }

  const [milestones, setMilestones] = useState<EditableMilestone[]>(initMilestones)

  // When proposal milestones change from outside (server refresh), sync
  useEffect(() => {
    if (!isEditing) {
      setMilestones(initMilestones())
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [proposal.milestones])

  const totalPct = sumPercentages(milestones)
  const isValid = Math.abs(totalPct - 100) <= 0.01

  const handleLoadDefaults = useCallback(() => {
    startTransition(async () => {
      const defaults = await getDefaultPaymentSchedule(projectId)
      if (defaults) {
        setMilestones(
          defaults.map((d) => ({
            name: d.name,
            trigger_phase_id: d.trigger_phase_id ?? null,
            percentage: String(d.percentage ?? 0),
            amount: computeAmount(String(d.percentage ?? 0), contractTotal),
            due_date: null,
          }))
        )
        toast.success("Default schedule loaded")
      } else {
        toast.info("No template schedule available")
      }
    })
  }, [projectId, contractTotal])

  const updateMilestone = (idx: number, patch: Partial<EditableMilestone>) => {
    setMilestones((prev) => {
      const updated = [...prev]
      updated[idx] = { ...updated[idx], ...patch }
      // Recompute amount if percentage changed
      if (patch.percentage !== undefined) {
        updated[idx].amount = computeAmount(patch.percentage, contractTotal)
      }
      return updated
    })
  }

  const addMiddleMilestone = () => {
    setMilestones((prev) => {
      const last = prev[prev.length - 1]
      const rest = prev.slice(0, -1)
      return [
        ...rest,
        { name: "Progress Payment", trigger_phase_id: null, percentage: "0", amount: "0", due_date: null },
        last,
      ]
    })
  }

  const removeMilestone = (idx: number) => {
    if (milestones.length <= 2) {
      toast.error("Must have at least 2 milestones")
      return
    }
    setMilestones((prev) => prev.filter((_, i) => i !== idx))
  }

  const handleSave = () => {
    if (!isValid) {
      toast.error(`Percentages must sum to 100%. Current total: ${totalPct.toFixed(1)}%`)
      return
    }
    startTransition(async () => {
      const input: MilestoneInput[] = milestones.map((m, idx) => ({
        id: m.id,
        name: m.name,
        trigger_phase_id: m.trigger_phase_id || null,
        percentage: parseFloat(m.percentage) || 0,
        amount: m.amount,
        due_date: m.due_date || null,
        sort_order: idx,
      }))

      const result = await setPaymentSchedule(proposal.id, projectId, input)
      if ("error" in result) {
        toast.error(result.error)
      } else {
        onProposalUpdate(result.data)
        setIsEditing(false)
        toast.success("Payment schedule saved")
      }
    })
  }

  if (!isEditing && proposal.milestones.length > 0) {
    return (
      <div className="space-y-3">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border">
                <th className="text-left text-xs text-muted-foreground font-medium py-2 pr-4">
                  Milestone
                </th>
                <th className="text-left text-xs text-muted-foreground font-medium py-2 pr-4">
                  Trigger
                </th>
                <th className="text-right text-xs text-muted-foreground font-medium py-2 pr-4">
                  %
                </th>
                <th className="text-right text-xs text-muted-foreground font-medium py-2">
                  Amount
                </th>
              </tr>
            </thead>
            <tbody>
              {proposal.milestones.map((m) => (
                <tr key={m.id} className="border-b border-border/50 last:border-0">
                  <td className="py-2 pr-4 font-medium">{m.name}</td>
                  <td className="py-2 pr-4 text-muted-foreground text-xs">
                    {m.triggerPhaseName ?? (m.trigger_phase_id ? "Phase" : "—")}
                  </td>
                  <td className="py-2 pr-4 text-right">
                    {m.percentage ? `${parseFloat(m.percentage).toFixed(1)}%` : "—"}
                  </td>
                  <td className="py-2 text-right font-medium">
                    {parseFloat(m.amount).toLocaleString("en-US", {
                      style: "currency",
                      currency: "USD",
                    })}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={() => setIsEditing(true)}
          className="h-7 text-xs"
        >
          Edit Schedule
        </Button>
      </div>
    )
  }

  return (
    <div className="space-y-4">
      {/* Percentage validation indicator */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span className="text-sm text-muted-foreground">Total:</span>
          <Badge
            variant={isValid ? "default" : "destructive"}
            className={cn("text-xs", isValid && "bg-green-500/10 text-green-600 border-green-500/20")}
          >
            {totalPct.toFixed(1)}%
          </Badge>
          {!isValid && (
            <span className="text-xs text-destructive">
              Must equal 100%
            </span>
          )}
        </div>
        <Button
          type="button"
          variant="ghost"
          size="sm"
          onClick={handleLoadDefaults}
          disabled={isPending}
          className="h-7 text-xs text-muted-foreground"
        >
          Load Template Defaults
        </Button>
      </div>

      {/* Milestones */}
      <div className="space-y-2">
        {milestones.map((m, idx) => {
          const isFirst = idx === 0
          const isLast = idx === milestones.length - 1
          return (
            <div key={idx} className="grid grid-cols-[1fr_1fr_auto_auto_auto] gap-2 items-center">
              {/* Name */}
              <Input
                value={m.name}
                onChange={(e) => updateMilestone(idx, { name: e.target.value })}
                placeholder={isFirst ? "Deposit" : isLast ? "Final Payment" : "Progress Payment"}
                className="h-8 text-sm"
              />

              {/* Phase trigger */}
              <Select
                value={m.trigger_phase_id ?? "none"}
                onValueChange={(val) =>
                  updateMilestone(idx, { trigger_phase_id: val === "none" ? null : val })
                }
              >
                <SelectTrigger className="h-8 text-xs">
                  <SelectValue placeholder="On signing" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="none" className="text-xs">
                    On signing
                  </SelectItem>
                  {phases.map((p) => (
                    <SelectItem key={p.id} value={p.id} className="text-xs">
                      When: {p.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>

              {/* Percentage */}
              <div className="relative w-20">
                <Input
                  value={m.percentage}
                  onChange={(e) => updateMilestone(idx, { percentage: e.target.value })}
                  className="h-8 text-sm pr-6"
                  inputMode="decimal"
                />
                <span className="absolute right-2 top-1/2 -translate-y-1/2 text-xs text-muted-foreground">
                  %
                </span>
              </div>

              {/* Computed amount */}
              <div className="text-sm font-medium text-right w-24 shrink-0">
                {parseFloat(m.amount).toLocaleString("en-US", {
                  style: "currency",
                  currency: "USD",
                })}
              </div>

              {/* Remove (only for middle rows) */}
              {!isFirst && !isLast && milestones.length > 2 ? (
                <button
                  type="button"
                  onClick={() => removeMilestone(idx)}
                  className="text-muted-foreground hover:text-destructive text-lg leading-none"
                  aria-label="Remove milestone"
                >
                  &times;
                </button>
              ) : (
                <div className="w-5" />
              )}
            </div>
          )
        })}
      </div>

      {/* Add milestone + Save */}
      <div className="flex items-center gap-3 pt-1">
        <Button
          type="button"
          variant="ghost"
          size="sm"
          onClick={addMiddleMilestone}
          className="h-7 text-xs text-muted-foreground"
        >
          + Add Progress Payment
        </Button>
        <div className="flex-1" />
        {isEditing && (
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={() => {
              setMilestones(initMilestones())
              setIsEditing(false)
            }}
            disabled={isPending}
            className="h-7 text-xs"
          >
            Cancel
          </Button>
        )}
        <Button
          type="button"
          size="sm"
          onClick={handleSave}
          disabled={isPending || !isValid}
          className="h-7 text-xs"
        >
          {isPending ? "Saving..." : "Save Schedule"}
        </Button>
      </div>

      {/* Retainage note */}
      <p className="text-xs text-muted-foreground">
        Note: Retainage ({proposal ? "configured in project" : "N/A"}) will be withheld from each
        milestone invoice and released at final payment.
      </p>
    </div>
  )
}
