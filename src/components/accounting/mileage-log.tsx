"use client"

/**
 * MileageLog — Mileage log view with IRS export for the accounting page.
 *
 * Shows auto-calculated (GPS) and manual mileage entries.
 * Provides "Add Manual Entry" form for non-route trips.
 * "Export IRS Log" button generates a CSV download.
 *
 * Phase 11 (Plan 10): New component.
 */

import { useState, useTransition } from "react"
import { MapPinIcon, PencilIcon, PlusIcon, DownloadIcon } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import {
  addManualMileage,
  getMileageLog,
  exportMileageLog,
  getMileageSummary,
} from "@/actions/mileage"
import type { MileageLogEntry } from "@/actions/mileage"
import { toLocalDateString } from "@/lib/date-utils"

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface TechOption {
  id: string
  full_name: string
}

interface Props {
  initialEntries: MileageLogEntry[]
  initialSummary: { totalMiles: number; totalDeduction: number; tripCount: number }
  startDate: string
  endDate: string
  isOwner: boolean
  techOptions: TechOption[]
  currentUserId: string
}

// ---------------------------------------------------------------------------
// Add Manual Entry Form
// ---------------------------------------------------------------------------

function AddManualEntryForm({ onSuccess }: { onSuccess: () => void }) {
  const [isPending, startTransition] = useTransition()
  const [error, setError] = useState<string | null>(null)
  const today = toLocalDateString(new Date())

  const [form, setForm] = useState({
    workDate: today,
    originAddress: "",
    destinationAddress: "",
    purpose: "",
    miles: "",
  })

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError(null)

    const miles = parseFloat(form.miles)
    if (isNaN(miles) || miles <= 0) {
      setError("Miles must be a positive number")
      return
    }

    if (!form.purpose.trim()) {
      setError("Business purpose is required")
      return
    }

    startTransition(async () => {
      const result = await addManualMileage({
        workDate: form.workDate,
        originAddress: form.originAddress,
        destinationAddress: form.destinationAddress,
        purpose: form.purpose,
        miles,
      })

      if (!result.success) {
        setError(result.error ?? "Failed to add entry")
        return
      }

      setForm({ workDate: today, originAddress: "", destinationAddress: "", purpose: "", miles: "" })
      onSuccess()
    })
  }

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-4">
      {error && <p className="text-sm text-destructive">{error}</p>}

      <div className="grid grid-cols-2 gap-3">
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="mileage-date">Date</Label>
          <Input
            id="mileage-date"
            type="date"
            value={form.workDate}
            onChange={(e) => setForm((f) => ({ ...f, workDate: e.target.value }))}
            required
          />
        </div>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="mileage-miles">Miles</Label>
          <Input
            id="mileage-miles"
            type="number"
            step="0.1"
            min="0.1"
            placeholder="0.0"
            value={form.miles}
            onChange={(e) => setForm((f) => ({ ...f, miles: e.target.value }))}
            required
          />
        </div>
      </div>

      <div className="flex flex-col gap-1.5">
        <Label htmlFor="mileage-origin">Origin (optional)</Label>
        <Input
          id="mileage-origin"
          placeholder="Home / shop address..."
          value={form.originAddress}
          onChange={(e) => setForm((f) => ({ ...f, originAddress: e.target.value }))}
        />
      </div>

      <div className="flex flex-col gap-1.5">
        <Label htmlFor="mileage-dest">Destination (optional)</Label>
        <Input
          id="mileage-dest"
          placeholder="Customer address / supply store..."
          value={form.destinationAddress}
          onChange={(e) => setForm((f) => ({ ...f, destinationAddress: e.target.value }))}
        />
      </div>

      <div className="flex flex-col gap-1.5">
        <Label htmlFor="mileage-purpose">Business Purpose</Label>
        <Input
          id="mileage-purpose"
          placeholder="Pool service, supply run, training..."
          value={form.purpose}
          onChange={(e) => setForm((f) => ({ ...f, purpose: e.target.value }))}
          required
        />
      </div>

      <Button type="submit" disabled={isPending} className="w-full">
        {isPending ? "Adding..." : "Add Mileage Entry"}
      </Button>
    </form>
  )
}

// ---------------------------------------------------------------------------
// Mileage Entry Row
// ---------------------------------------------------------------------------

function MileageRow({ entry }: { entry: MileageLogEntry }) {
  const miles = parseFloat(entry.miles)
  const rate = parseFloat(entry.rate_per_mile)
  const deduction = parseFloat(entry.deduction_amount)

  return (
    <div className="flex items-start justify-between py-3 border-b border-border/40 last:border-0 gap-3">
      <div className="flex items-start gap-3 min-w-0">
        <div className="mt-0.5 shrink-0">
          {entry.is_auto_calculated ? (
            <MapPinIcon className="h-4 w-4 text-primary" aria-label="Auto-calculated from route" />
          ) : (
            <PencilIcon className="h-4 w-4 text-muted-foreground" aria-label="Manual entry" />
          )}
        </div>
        <div className="flex flex-col gap-0.5 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-sm font-medium">{miles.toFixed(1)} mi</span>
            {entry.is_auto_calculated ? (
              <Badge variant="secondary" className="text-xs font-normal">Auto</Badge>
            ) : (
              <Badge variant="outline" className="text-xs font-normal">Manual</Badge>
            )}
          </div>
          <span className="text-xs text-muted-foreground">{entry.work_date}</span>
          {entry.purpose && (
            <span className="text-xs text-muted-foreground">{entry.purpose}</span>
          )}
          {(entry.origin_address || entry.destination_address) && (
            <span className="text-xs text-muted-foreground truncate max-w-[260px]">
              {entry.origin_address && entry.destination_address
                ? `${entry.origin_address} → ${entry.destination_address}`
                : entry.origin_address || entry.destination_address}
            </span>
          )}
          {entry.tech_name && (
            <span className="text-xs text-muted-foreground">{entry.tech_name}</span>
          )}
        </div>
      </div>
      <div className="text-right shrink-0">
        <div className="text-sm font-medium">${deduction.toFixed(2)}</div>
        <div className="text-xs text-muted-foreground">${rate.toFixed(3)}/mi</div>
      </div>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Main Component
// ---------------------------------------------------------------------------

export function MileageLog({
  initialEntries,
  initialSummary,
  startDate,
  endDate,
  isOwner,
  techOptions,
  currentUserId,
}: Props) {
  const [entries, setEntries] = useState<MileageLogEntry[]>(initialEntries)
  const [summary, setSummary] = useState(initialSummary)
  const [selectedTechId, setSelectedTechId] = useState<string>("all")
  const [showAddForm, setShowAddForm] = useState(false)
  const [exporting, setExporting] = useState(false)
  const [isPending, startTransition] = useTransition()

  const refresh = () => {
    startTransition(async () => {
      const techId = selectedTechId === "all" ? undefined : selectedTechId
      const [freshEntries, freshSummary] = await Promise.all([
        getMileageLog(techId, startDate, endDate),
        getMileageSummary(startDate, endDate),
      ])
      setEntries(freshEntries)
      setSummary(freshSummary)
      setShowAddForm(false)
    })
  }

  const handleTechFilter = (techId: string) => {
    setSelectedTechId(techId)
    startTransition(async () => {
      const effectiveTechId = techId === "all" ? undefined : techId
      const freshEntries = await getMileageLog(effectiveTechId, startDate, endDate)
      setEntries(freshEntries)
    })
  }

  const handleExport = async () => {
    if (exporting) return
    setExporting(true)

    try {
      const exportTechId = selectedTechId === "all" ? (isOwner ? "" : currentUserId) : selectedTechId
      const year = startDate.split("-")[0]

      // Owner exporting "all" — export own ID as a fallback
      const techIdToExport = exportTechId || currentUserId
      const result = await exportMileageLog(techIdToExport, year)

      if (result.success && result.csv !== undefined) {
        const blob = new Blob([result.csv], { type: "text/csv" })
        const url = URL.createObjectURL(blob)
        const a = document.createElement("a")
        a.href = url
        a.download = result.filename ?? `mileage-log-${year}.csv`
        document.body.appendChild(a)
        a.click()
        document.body.removeChild(a)
        URL.revokeObjectURL(url)
      }
    } finally {
      setExporting(false)
    }
  }

  const currentYear = startDate.split("-")[0]

  return (
    <div className="flex flex-col gap-6">
      {/* Summary cards */}
      <div className="grid grid-cols-3 gap-3">
        <Card>
          <CardContent className="p-4">
            <div className="text-xs text-muted-foreground mb-1">Total Miles</div>
            <div className="text-xl font-bold">{summary.totalMiles.toFixed(1)}</div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <div className="text-xs text-muted-foreground mb-1">Tax Deduction</div>
            <div className="text-xl font-bold">${summary.totalDeduction.toFixed(2)}</div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <div className="text-xs text-muted-foreground mb-1">Trips</div>
            <div className="text-xl font-bold">{summary.tripCount}</div>
          </CardContent>
        </Card>
      </div>

      {/* Actions row */}
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div className="flex items-center gap-2 flex-wrap">
          <Button size="sm" variant="outline" onClick={() => setShowAddForm(!showAddForm)}>
            <PlusIcon className="h-4 w-4 mr-1.5" />
            Manual Entry
          </Button>
          <Button
            size="sm"
            variant="outline"
            onClick={handleExport}
            disabled={exporting || entries.length === 0}
          >
            <DownloadIcon className="h-4 w-4 mr-1.5" />
            {exporting ? "Exporting..." : `Export IRS Log ${currentYear}`}
          </Button>
        </div>

        {/* Tech filter — owner only */}
        {isOwner && techOptions.length > 0 && (
          <Select value={selectedTechId} onValueChange={handleTechFilter}>
            <SelectTrigger className="w-[160px] h-8 text-sm">
              <SelectValue placeholder="All techs" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All techs</SelectItem>
              {techOptions.map((t) => (
                <SelectItem key={t.id} value={t.id}>
                  {t.full_name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        )}
      </div>

      {/* Add manual entry form */}
      {showAddForm && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Add Manual Mileage</CardTitle>
          </CardHeader>
          <CardContent>
            <AddManualEntryForm onSuccess={refresh} />
          </CardContent>
        </Card>
      )}

      {/* Mileage log table */}
      {entries.length === 0 ? (
        <p className="text-sm text-muted-foreground italic">
          No mileage entries for the selected period. Auto-entries are created at clock-out when route coordinates are available.
        </p>
      ) : (
        <Card>
          <CardContent className="p-0 px-4">
            {entries.map((entry) => (
              <MileageRow key={entry.id} entry={entry} />
            ))}
          </CardContent>
        </Card>
      )}

      <p className="text-xs text-muted-foreground">
        IRS standard mileage rate: $0.725/mile (2026). Auto entries use a 1.2x road distance factor applied to GPS coordinates.
      </p>
    </div>
  )
}
