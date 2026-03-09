"use client"

import { useState, useTransition } from "react"
import { toast } from "sonner"
import { Switch } from "@/components/ui/switch"
import { Label } from "@/components/ui/label"
import { updateOrgSettings } from "@/actions/company-settings"
import type { OrgSettings } from "@/actions/company-settings"

// ---------------------------------------------------------------------------
// NotificationSettings
// ---------------------------------------------------------------------------

interface NotificationSettingsProps {
  settings: OrgSettings
}

interface ToggleItem {
  key: keyof OrgSettings
  label: string
  description: string
}

const CUSTOMER_NOTIFICATION_TOGGLES: ToggleItem[] = [
  {
    key: "pre_arrival_sms_enabled",
    label: "Pre-arrival SMS",
    description: "Send an SMS to the customer before the tech arrives",
  },
  {
    key: "pre_arrival_email_enabled",
    label: "Pre-arrival email",
    description: "Send an email to the customer before the tech arrives",
  },
  {
    key: "service_report_email_enabled",
    label: "Service report email",
    description: "Email a service report to the customer after each stop",
  },
]

const OFFICE_ALERT_TOGGLES: ToggleItem[] = [
  {
    key: "alert_missed_stop_enabled",
    label: "Missed stop alerts",
    description: "Alert when a scheduled stop was not completed or skipped",
  },
  {
    key: "alert_declining_chemistry_enabled",
    label: "Declining chemistry alerts",
    description: "Alert when pool chemistry is trending out of range",
  },
  {
    key: "alert_incomplete_data_enabled",
    label: "Incomplete data alerts",
    description: "Alert when a stop is completed with missing required readings",
  },
]

/**
 * NotificationSettings — toggle switches for notification channel configuration.
 *
 * Grouped into two sections: "Customer Notifications" and "Office Alerts".
 * Each toggle immediately calls updateOrgSettings with the changed field.
 */
export function NotificationSettings({ settings }: NotificationSettingsProps) {
  const [values, setValues] = useState<Record<string, boolean>>({
    pre_arrival_sms_enabled: settings.pre_arrival_sms_enabled,
    pre_arrival_email_enabled: settings.pre_arrival_email_enabled,
    service_report_email_enabled: settings.service_report_email_enabled,
    alert_missed_stop_enabled: settings.alert_missed_stop_enabled,
    alert_declining_chemistry_enabled: settings.alert_declining_chemistry_enabled,
    alert_incomplete_data_enabled: settings.alert_incomplete_data_enabled,
  })
  const [isPending, startTransition] = useTransition()

  const handleToggle = (key: string, checked: boolean) => {
    // Optimistic update
    setValues((prev) => ({ ...prev, [key]: checked }))

    startTransition(async () => {
      const result = await updateOrgSettings({ [key]: checked } as Partial<OrgSettings>)
      if (!result.success) {
        // Revert optimistic update
        setValues((prev) => ({ ...prev, [key]: !checked }))
        toast.error("Failed to save setting", {
          description: result.error,
        })
      } else {
        toast.success("Settings updated")
      }
    })
  }

  const renderToggleGroup = (items: ToggleItem[]) =>
    items.map((item) => (
      <div key={item.key as string} className="flex items-start justify-between gap-4 py-3">
        <div className="flex flex-col gap-0.5 min-w-0">
          <Label
            htmlFor={item.key as string}
            className="text-sm font-medium leading-tight cursor-pointer"
          >
            {item.label}
          </Label>
          <p className="text-xs text-muted-foreground leading-relaxed">
            {item.description}
          </p>
        </div>
        <Switch
          id={item.key as string}
          checked={values[item.key as string] ?? false}
          onCheckedChange={(checked) => handleToggle(item.key as string, checked)}
          disabled={isPending}
          className="shrink-0 mt-0.5 cursor-pointer"
        />
      </div>
    ))

  return (
    <div className="flex flex-col gap-6">
      {/* Customer Notifications section */}
      <div className="flex flex-col gap-1">
        <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider px-0.5 mb-1">
          Customer Notifications
        </h3>
        <div className="rounded-xl border border-border/60 bg-muted/5 divide-y divide-border/40 px-4">
          {renderToggleGroup(CUSTOMER_NOTIFICATION_TOGGLES)}
        </div>
      </div>

      {/* Office Alerts section */}
      <div className="flex flex-col gap-1">
        <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider px-0.5 mb-1">
          Office Alerts
        </h3>
        <div className="rounded-xl border border-border/60 bg-muted/5 divide-y divide-border/40 px-4">
          {renderToggleGroup(OFFICE_ALERT_TOGGLES)}
        </div>
      </div>
    </div>
  )
}
