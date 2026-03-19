"use client"

/**
 * SalesTaxManager — Sales tax rate configuration and quarterly reporting.
 *
 * Features:
 * - Per-jurisdiction tax rate configuration
 * - Default rate fallback from org_settings
 * - Quarterly tax summary (collected vs remitted)
 *
 * Visible in simplified mode — sales tax applies to all billing, not just
 * accountant features. Controlled decimal inputs per MEMORY.md.
 */

import { useState, useEffect } from "react"
import { toast } from "sonner"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Badge } from "@/components/ui/badge"
import {
  getSalesTaxRates,
  updateSalesTaxRates,
  getSalesTaxReport,
} from "@/actions/accounting"
import type { SalesTaxRate, SalesTaxReport } from "@/actions/accounting"

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function formatCurrency(amount: number): string {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
  }).format(amount)
}

function formatPct(rate: number): string {
  return `${(rate * 100).toFixed(4).replace(/\.?0+$/, "")}%`
}

function getCurrentQuarterRange(): { start: string; end: string } {
  const now = new Date()
  const year = now.getFullYear()
  const month = now.getMonth() + 1
  const q = Math.floor((month - 1) / 3)
  const qStart = q * 3 + 1
  const qEnd = qStart + 2
  return {
    start: `${year}-${String(qStart).padStart(2, "0")}-01`,
    end: `${year}-${String(qEnd).padStart(2, "0")}-${String(new Date(year, qEnd, 0).getDate()).padStart(2, "0")}`,
  }
}

// ---------------------------------------------------------------------------
// RateRow component (edit inline)
// ---------------------------------------------------------------------------

function RateRow({
  rate,
  onUpdate,
  onDelete,
}: {
  rate: SalesTaxRate
  onUpdate: (updated: SalesTaxRate) => void
  onDelete: () => void
}) {
  const [editing, setEditing] = useState(false)
  const [jurisdiction, setJurisdiction] = useState(rate.jurisdiction)
  // Controlled decimal input — store as string per MEMORY.md
  const [rateStr, setRateStr] = useState(String(rate.rate * 100))

  function save() {
    const parsed = parseFloat(rateStr)
    if (isNaN(parsed) || parsed < 0 || parsed > 100) {
      toast.error("Rate must be between 0 and 100")
      return
    }
    if (!jurisdiction.trim()) {
      toast.error("Jurisdiction name is required")
      return
    }
    onUpdate({ jurisdiction: jurisdiction.trim(), rate: parsed / 100 })
    setEditing(false)
  }

  if (!editing) {
    return (
      <div className="flex items-center justify-between py-2 border-b border-border last:border-0">
        <div>
          <span className="text-sm font-medium">{rate.jurisdiction}</span>
        </div>
        <div className="flex items-center gap-3">
          <Badge variant="outline" className="font-mono text-xs">
            {formatPct(rate.rate)}
          </Badge>
          <Button
            size="sm"
            variant="ghost"
            className="h-7 px-2 text-xs"
            onClick={() => setEditing(true)}
          >
            Edit
          </Button>
          <Button
            size="sm"
            variant="ghost"
            className="h-7 px-2 text-xs text-destructive hover:text-destructive"
            onClick={onDelete}
          >
            Remove
          </Button>
        </div>
      </div>
    )
  }

  return (
    <div className="flex items-center gap-2 py-2 border-b border-border last:border-0">
      <Input
        value={jurisdiction}
        onChange={(e) => setJurisdiction(e.target.value)}
        placeholder="Jurisdiction name"
        className="h-8 text-sm flex-1"
      />
      <div className="flex items-center gap-1">
        <Input
          value={rateStr}
          onChange={(e) => {
            const v = e.target.value
            if (v === "" || v === "-" || v.endsWith(".")) {
              setRateStr(v)
              return
            }
            const n = parseFloat(v)
            if (!isNaN(n)) setRateStr(v)
          }}
          onBlur={() => {
            const n = parseFloat(rateStr)
            if (!isNaN(n)) setRateStr(String(n))
          }}
          className="h-8 w-20 text-sm text-right"
          placeholder="7.0"
        />
        <span className="text-xs text-muted-foreground">%</span>
      </div>
      <Button size="sm" variant="outline" className="h-8 px-3 text-xs" onClick={save}>
        Save
      </Button>
      <Button
        size="sm"
        variant="ghost"
        className="h-8 px-2 text-xs"
        onClick={() => setEditing(false)}
      >
        Cancel
      </Button>
    </div>
  )
}

// ---------------------------------------------------------------------------
// SalesTaxManager
// ---------------------------------------------------------------------------

export function SalesTaxManager() {
  const [rates, setRates] = useState<SalesTaxRate[]>([])
  const [defaultRate, setDefaultRate] = useState(0.0875)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)

  // New rate form
  const [newJurisdiction, setNewJurisdiction] = useState("")
  const [newRateStr, setNewRateStr] = useState("")
  const [showAddForm, setShowAddForm] = useState(false)

  // Tax report
  const [report, setReport] = useState<SalesTaxReport | null>(null)
  const [reportLoading, setReportLoading] = useState(false)

  useEffect(() => {
    void loadRates()
    void loadReport()
  }, [])

  async function loadRates() {
    setLoading(true)
    try {
      const result = await getSalesTaxRates()
      if (result.success) {
        setRates(result.rates)
        setDefaultRate(result.defaultRate)
      } else {
        toast.error(result.error)
      }
    } finally {
      setLoading(false)
    }
  }

  async function loadReport() {
    setReportLoading(true)
    try {
      const { start, end } = getCurrentQuarterRange()
      const result = await getSalesTaxReport(start, end)
      if (result.success) {
        setReport(result.report)
      }
    } finally {
      setReportLoading(false)
    }
  }

  async function saveRates(updatedRates: SalesTaxRate[]) {
    setSaving(true)
    try {
      const result = await updateSalesTaxRates(updatedRates)
      if (result.success) {
        setRates(updatedRates)
        toast.success("Tax rates saved")
      } else {
        toast.error(result.error ?? "Failed to save")
      }
    } finally {
      setSaving(false)
    }
  }

  function handleUpdateRate(index: number, updated: SalesTaxRate) {
    const next = [...rates]
    next[index] = updated
    void saveRates(next)
  }

  function handleDeleteRate(index: number) {
    const next = rates.filter((_, i) => i !== index)
    void saveRates(next)
  }

  function handleAddRate() {
    const parsed = parseFloat(newRateStr)
    if (!newJurisdiction.trim()) {
      toast.error("Jurisdiction name is required")
      return
    }
    if (isNaN(parsed) || parsed < 0 || parsed > 100) {
      toast.error("Rate must be between 0 and 100 (e.g. 7 for 7%)")
      return
    }
    const next = [...rates, { jurisdiction: newJurisdiction.trim(), rate: parsed / 100 }]
    void saveRates(next)
    setNewJurisdiction("")
    setNewRateStr("")
    setShowAddForm(false)
  }

  return (
    <div className="space-y-6">
      {/* Rate configuration */}
      <div className="rounded-lg border border-border bg-card overflow-hidden">
        <div className="px-5 py-4 border-b border-border flex items-center justify-between">
          <div>
            <h3 className="font-semibold">Tax Rate Configuration</h3>
            <p className="text-xs text-muted-foreground mt-0.5">
              Rates applied to taxable invoice line items
            </p>
          </div>
          <Button
            size="sm"
            variant="outline"
            onClick={() => setShowAddForm(!showAddForm)}
          >
            {showAddForm ? "Cancel" : "Add Rate"}
          </Button>
        </div>

        <div className="px-5 py-3">
          {/* Default rate indicator */}
          <div className="flex items-center justify-between py-2 border-b border-border mb-1">
            <div className="flex items-center gap-2">
              <span className="text-sm font-medium">Default Rate</span>
              <Badge variant="secondary" className="text-xs">Default</Badge>
            </div>
            <Badge variant="outline" className="font-mono text-xs">
              {formatPct(defaultRate)}
            </Badge>
          </div>

          {loading ? (
            <p className="text-sm text-muted-foreground italic py-3">Loading rates...</p>
          ) : rates.length === 0 && !showAddForm ? (
            <p className="text-sm text-muted-foreground italic py-3">
              No custom jurisdictions — using default rate for all locations.
            </p>
          ) : (
            <div>
              {rates.map((rate, idx) => (
                <RateRow
                  key={idx}
                  rate={rate}
                  onUpdate={(updated) => handleUpdateRate(idx, updated)}
                  onDelete={() => handleDeleteRate(idx)}
                />
              ))}
            </div>
          )}

          {/* Add rate form */}
          {showAddForm && (
            <div className="flex items-center gap-2 pt-3 border-t border-border mt-2">
              <Input
                value={newJurisdiction}
                onChange={(e) => setNewJurisdiction(e.target.value)}
                placeholder="Jurisdiction (e.g. Orange County)"
                className="h-8 text-sm flex-1"
              />
              <div className="flex items-center gap-1">
                <Input
                  value={newRateStr}
                  onChange={(e) => {
                    const v = e.target.value
                    if (v === "" || v.endsWith(".")) {
                      setNewRateStr(v)
                      return
                    }
                    const n = parseFloat(v)
                    if (!isNaN(n)) setNewRateStr(v)
                  }}
                  onBlur={() => {
                    const n = parseFloat(newRateStr)
                    if (!isNaN(n)) setNewRateStr(String(n))
                  }}
                  className="h-8 w-20 text-sm text-right"
                  placeholder="7.0"
                />
                <span className="text-xs text-muted-foreground">%</span>
              </div>
              <Button
                size="sm"
                variant="outline"
                className="h-8 px-3 text-xs"
                onClick={handleAddRate}
                disabled={saving}
              >
                {saving ? "Saving..." : "Add"}
              </Button>
            </div>
          )}
        </div>
      </div>

      {/* Tax report — this quarter */}
      <div className="rounded-lg border border-border bg-card overflow-hidden">
        <div className="px-5 py-4 border-b border-border flex items-center justify-between">
          <div>
            <h3 className="font-semibold">Sales Tax Summary</h3>
            <p className="text-xs text-muted-foreground mt-0.5">This quarter</p>
          </div>
          <Button size="sm" variant="ghost" onClick={loadReport} disabled={reportLoading}>
            {reportLoading ? "Refreshing..." : "Refresh"}
          </Button>
        </div>

        <div className="px-5 py-4">
          {reportLoading ? (
            <p className="text-sm text-muted-foreground italic">Loading...</p>
          ) : !report ? (
            <p className="text-sm text-muted-foreground italic">No data available</p>
          ) : (
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <span className="text-sm text-muted-foreground">Tax Collected</span>
                <span className="font-medium tabular-nums text-green-400">
                  {formatCurrency(report.totalCollected)}
                </span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-sm text-muted-foreground">Tax Remitted</span>
                <span className="font-medium tabular-nums">
                  {formatCurrency(report.totalRemitted)}
                </span>
              </div>
              <div className="border-t border-border pt-3 flex items-center justify-between">
                <span className="text-sm font-semibold">Net Tax Owed</span>
                <span
                  className={
                    report.net > 0
                      ? "font-bold tabular-nums text-destructive"
                      : "font-bold tabular-nums text-green-400"
                  }
                >
                  {formatCurrency(report.net)}
                </span>
              </div>
              {report.net > 0 && (
                <p className="text-xs text-muted-foreground">
                  Collected but not yet remitted to tax authority
                </p>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
