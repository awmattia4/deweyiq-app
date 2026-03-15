"use client"

import { useState } from "react"
import { Button } from "@/components/ui/button"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { updateTechPayConfig } from "@/actions/company-settings"
import { updateOrgSettings } from "@/actions/company-settings"
import { cn } from "@/lib/utils"
import type { OrgSettings } from "@/actions/company-settings"

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface TechProfile {
  id: string
  fullName: string
  payType: string | null
  payRate: string | null
}

interface TeamPaySettingsProps {
  techProfiles: TechProfile[]
  orgSettings: OrgSettings | null
}

// ---------------------------------------------------------------------------
// TechPayRow — per-tech pay config row
// ---------------------------------------------------------------------------

function TechPayRow({ profile }: { profile: TechProfile }) {
  const [payType, setPayType] = useState<"per_stop" | "hourly">(
    (profile.payType as "per_stop" | "hourly") ?? "per_stop"
  )
  // Local string state per MEMORY.md critical pattern — avoids eating decimal point
  const [payRateStr, setPayRateStr] = useState<string>(
    profile.payRate ? String(parseFloat(profile.payRate)) : ""
  )
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)
  const [error, setError] = useState<string | null>(null)

  function handleRateChange(value: string) {
    setPayRateStr(value)
    setSaved(false)
    setError(null)
  }

  function flushRate() {
    if (payRateStr.endsWith(".") || payRateStr === "-") return
    const parsed = parseFloat(payRateStr)
    if (!isNaN(parsed)) {
      setPayRateStr(String(parsed))
    }
  }

  async function handleSave() {
    const parsed = parseFloat(payRateStr)
    if (isNaN(parsed) || parsed < 0) {
      setError("Enter a valid pay rate")
      return
    }
    setSaving(true)
    setError(null)
    const result = await updateTechPayConfig(profile.id, payType, parsed)
    setSaving(false)
    if (result.success) {
      setSaved(true)
      setTimeout(() => setSaved(false), 2000)
    } else {
      setError(result.error ?? "Failed to save")
    }
  }

  return (
    <tr className="border-b border-border/50">
      <td className="px-3 py-3 font-medium text-sm">{profile.fullName}</td>
      <td className="px-3 py-3">
        <Select
          value={payType}
          onValueChange={(v) => {
            setPayType(v as "per_stop" | "hourly")
            setSaved(false)
          }}
        >
          <SelectTrigger className="w-32 h-8 text-sm">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="per_stop">Per-Stop</SelectItem>
            <SelectItem value="hourly">Hourly</SelectItem>
          </SelectContent>
        </Select>
      </td>
      <td className="px-3 py-3">
        <div className="flex items-center gap-1">
          <span className="text-muted-foreground text-sm">$</span>
          <input
            type="number"
            min="0"
            step="0.01"
            value={payRateStr}
            onChange={(e) => handleRateChange(e.target.value)}
            onBlur={flushRate}
            placeholder="0.00"
            className={cn(
              "h-8 w-24 rounded-md border bg-background px-2 py-1 text-sm shadow-sm transition-colors",
              "focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring",
              error ? "border-destructive" : "border-input"
            )}
          />
          <span className="text-xs text-muted-foreground">
            {payType === "per_stop" ? "/stop" : "/hr"}
          </span>
        </div>
      </td>
      <td className="px-3 py-3">
        <Button
          variant="outline"
          size="sm"
          onClick={handleSave}
          disabled={saving}
          className="cursor-pointer h-8"
        >
          {saving ? "Saving…" : saved ? "Saved" : "Save"}
        </Button>
        {error && <p className="text-xs text-destructive mt-1">{error}</p>}
      </td>
    </tr>
  )
}

// ---------------------------------------------------------------------------
// CommissionRateRow — org-wide upsell commission %
// ---------------------------------------------------------------------------

function CommissionRateRow({ orgSettings }: { orgSettings: OrgSettings | null }) {
  const initial = orgSettings?.wo_upsell_commission_pct != null
    ? String(parseFloat(orgSettings.wo_upsell_commission_pct))
    : "0"
  const [pctStr, setPctStr] = useState<string>(initial)
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)
  const [error, setError] = useState<string | null>(null)

  function flushPct() {
    if (pctStr.endsWith(".")) return
    const parsed = parseFloat(pctStr)
    if (!isNaN(parsed)) setPctStr(String(parsed))
  }

  async function handleSave() {
    const parsed = parseFloat(pctStr)
    if (isNaN(parsed) || parsed < 0 || parsed > 100) {
      setError("Enter a percentage between 0 and 100")
      return
    }
    setSaving(true)
    setError(null)
    const result = await updateOrgSettings({ wo_upsell_commission_pct: String(parsed) })
    setSaving(false)
    if (result.success) {
      setSaved(true)
      setTimeout(() => setSaved(false), 2000)
    } else {
      setError(result.error ?? "Failed to save")
    }
  }

  return (
    <div className="flex flex-wrap items-center gap-3 py-2 border-b border-border/50">
      <span className="text-sm font-medium w-52">Upsell Commission Rate</span>
      <div className="flex items-center gap-1">
        <input
          type="number"
          min="0"
          max="100"
          step="0.1"
          value={pctStr}
          onChange={(e) => { setPctStr(e.target.value); setSaved(false) }}
          onBlur={flushPct}
          placeholder="0"
          className={cn(
            "h-8 w-20 rounded-md border bg-background px-2 py-1 text-sm shadow-sm transition-colors",
            "focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring",
            error ? "border-destructive" : "border-input"
          )}
        />
        <span className="text-sm text-muted-foreground">% of invoiced WO total</span>
      </div>
      <Button
        variant="outline"
        size="sm"
        onClick={handleSave}
        disabled={saving}
        className="cursor-pointer h-8"
      >
        {saving ? "Saving…" : saved ? "Saved" : "Save"}
      </Button>
      {error && <p className="text-xs text-destructive">{error}</p>}
      <p className="text-xs text-muted-foreground w-full">
        Paid to techs who flagged a work order that was completed and invoiced in the period.
      </p>
    </div>
  )
}

// ---------------------------------------------------------------------------
// TeamPaySettings
// ---------------------------------------------------------------------------

export function TeamPaySettings({ techProfiles, orgSettings }: TeamPaySettingsProps) {
  if (techProfiles.length === 0) {
    return (
      <div className="text-sm text-muted-foreground italic">
        No technicians found. Invite team members from Settings to configure pay.
      </div>
    )
  }

  return (
    <div className="flex flex-col gap-4">
      {/* Commission rate — org-wide */}
      <CommissionRateRow orgSettings={orgSettings} />

      {/* Per-tech pay table */}
      <div className="overflow-x-auto rounded-md border border-border">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-border bg-muted/30">
              <th className="text-left px-3 py-2.5 font-medium text-muted-foreground">Name</th>
              <th className="text-left px-3 py-2.5 font-medium text-muted-foreground">Pay Type</th>
              <th className="text-left px-3 py-2.5 font-medium text-muted-foreground">Pay Rate</th>
              <th className="text-left px-3 py-2.5 font-medium text-muted-foreground"></th>
            </tr>
          </thead>
          <tbody>
            {techProfiles.map((p) => (
              <TechPayRow key={p.id} profile={p} />
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}
