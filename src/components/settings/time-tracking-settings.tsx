"use client"

import { useState, useTransition } from "react"
import { toast } from "sonner"
import { Label } from "@/components/ui/label"
import { Input } from "@/components/ui/input"
import { Button } from "@/components/ui/button"
import { Switch } from "@/components/ui/switch"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { updateTimeTrackingSettings } from "@/actions/time-tracking"

// ─── Types ─────────────────────────────────────────────────────────────────────

interface TimeTrackingSettingsProps {
  /** Current org settings for time tracking configuration */
  initialSettings: {
    time_tracking_enabled: boolean
    geofence_radius_meters: number
    break_auto_detect_minutes: number
    overtime_threshold_hours: number
    pay_period_type: string
  }
}

// ─── TimeTrackingSettings ─────────────────────────────────────────────────────

/**
 * TimeTrackingSettings — configures time tracking for the org.
 *
 * Settings:
 * - time_tracking_enabled: global on/off
 * - geofence_radius_meters: 50-500m radius for auto-clock (future)
 * - break_auto_detect_minutes: idle threshold before break auto-starts
 * - overtime_threshold_hours: weekly hours before overtime kicks in (default 40)
 * - pay_period_type: weekly | bi_weekly | semi_monthly
 *
 * Owner only — gate enforced on the server action.
 */
export function TimeTrackingSettings({ initialSettings }: TimeTrackingSettingsProps) {
  const [isPending, startTransition] = useTransition()

  // Local state — strings for decimal-safe inputs (per MEMORY.md)
  const [enabled, setEnabled] = useState(initialSettings.time_tracking_enabled)
  const [geofenceRadius, setGeofenceRadius] = useState(
    String(initialSettings.geofence_radius_meters)
  )
  const [breakThreshold, setBreakThreshold] = useState(
    String(initialSettings.break_auto_detect_minutes)
  )
  const [overtimeThreshold, setOvertimeThreshold] = useState(
    String(initialSettings.overtime_threshold_hours)
  )
  const [payPeriodType, setPayPeriodType] = useState(initialSettings.pay_period_type)

  function handleSave() {
    const geofenceVal = parseInt(geofenceRadius, 10)
    const breakVal = parseInt(breakThreshold, 10)
    const overtimeVal = parseFloat(overtimeThreshold)

    if (isNaN(geofenceVal) || geofenceVal < 50 || geofenceVal > 500) {
      toast.error("Geofence radius must be between 50 and 500 meters")
      return
    }
    if (isNaN(breakVal) || breakVal < 5 || breakVal > 120) {
      toast.error("Break threshold must be between 5 and 120 minutes")
      return
    }
    if (isNaN(overtimeVal) || overtimeVal < 1 || overtimeVal > 80) {
      toast.error("Overtime threshold must be between 1 and 80 hours")
      return
    }

    startTransition(async () => {
      const result = await updateTimeTrackingSettings({
        time_tracking_enabled: enabled,
        geofence_radius_meters: geofenceVal,
        break_auto_detect_minutes: breakVal,
        overtime_threshold_hours: overtimeVal,
        pay_period_type: payPeriodType,
      })

      if (result.success) {
        toast.success("Time tracking settings saved")
      } else {
        toast.error(result.error ?? "Failed to save settings")
      }
    })
  }

  return (
    <div className="flex flex-col gap-6">
      {/* ── Enable / Disable ────────────────────────────────────────────────── */}
      <div className="flex items-center justify-between gap-4">
        <div className="flex flex-col gap-0.5">
          <Label className="text-sm font-medium">Enable Time Tracking</Label>
          <p className="text-xs text-muted-foreground">
            When on, techs and owners see a clock-in/out banner on the Routes page.
          </p>
        </div>
        <Switch
          checked={enabled}
          onCheckedChange={setEnabled}
          aria-label="Enable time tracking"
        />
      </div>

      {/* ── Configuration (shown regardless of enabled state) ─────────────── */}
      <div className="flex flex-col gap-5">
        {/* Pay period type */}
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="pay-period-type" className="text-sm font-medium">
            Pay Period
          </Label>
          <Select value={payPeriodType} onValueChange={setPayPeriodType}>
            <SelectTrigger id="pay-period-type" className="w-full max-w-xs">
              <SelectValue placeholder="Select pay period" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="weekly">Weekly (Mon–Sun)</SelectItem>
              <SelectItem value="bi_weekly">Bi-Weekly (every 2 weeks)</SelectItem>
              <SelectItem value="semi_monthly">Semi-Monthly (1st and 15th)</SelectItem>
            </SelectContent>
          </Select>
          <p className="text-xs text-muted-foreground">
            Used for timesheet grouping and payroll export. QBO payroll schedules should match.
          </p>
        </div>

        {/* Overtime threshold */}
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="overtime-threshold" className="text-sm font-medium">
            Overtime Threshold (hours/week)
          </Label>
          <Input
            id="overtime-threshold"
            type="number"
            min={1}
            max={80}
            step={0.5}
            value={overtimeThreshold}
            onChange={(e) => setOvertimeThreshold(e.target.value)}
            onBlur={() => {
              const parsed = parseFloat(overtimeThreshold)
              if (isNaN(parsed)) setOvertimeThreshold("40")
            }}
            className="w-full max-w-[120px]"
          />
          <p className="text-xs text-muted-foreground">
            Hours per week before overtime rate applies. Default is 40 (US standard).
          </p>
        </div>

        {/* Break auto-detect threshold */}
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="break-threshold" className="text-sm font-medium">
            Break Auto-Detect (minutes idle)
          </Label>
          <Input
            id="break-threshold"
            type="number"
            min={5}
            max={120}
            step={1}
            value={breakThreshold}
            onChange={(e) => setBreakThreshold(e.target.value)}
            onBlur={() => {
              const parsed = parseInt(breakThreshold, 10)
              if (isNaN(parsed)) setBreakThreshold("30")
            }}
            className="w-full max-w-[120px]"
          />
          <p className="text-xs text-muted-foreground">
            After this many minutes with no app activity, a break is automatically recorded.
          </p>
        </div>

        {/* Geofence radius */}
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="geofence-radius" className="text-sm font-medium">
            Geofence Radius (meters)
          </Label>
          <Input
            id="geofence-radius"
            type="number"
            min={50}
            max={500}
            step={10}
            value={geofenceRadius}
            onChange={(e) => setGeofenceRadius(e.target.value)}
            onBlur={() => {
              const parsed = parseInt(geofenceRadius, 10)
              if (isNaN(parsed)) setGeofenceRadius("100")
            }}
            className="w-full max-w-[120px]"
          />
          <p className="text-xs text-muted-foreground">
            GPS radius around a job site for arrival detection. Used for future auto clock-in.
          </p>
        </div>
      </div>

      {/* ── Save button ───────────────────────────────────────────────────────── */}
      <div className="flex justify-end">
        <Button
          onClick={handleSave}
          disabled={isPending}
          size="sm"
        >
          {isPending ? "Saving…" : "Save Settings"}
        </Button>
      </div>
    </div>
  )
}
