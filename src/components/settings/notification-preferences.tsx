"use client"

/**
 * NotificationPreferences — Per-user notification type toggles for push/email/in-app.
 *
 * Phase 10: Smart Features / Notifications — Plan 11
 *
 * Shows a grid of notification types grouped by category. Each row has three
 * channel toggles: In-App, Push, Email. Default state is all channels enabled
 * (no row in notification_preferences means all enabled).
 *
 * Groups:
 *   Route & Stops: stop_completed, stop_skipped, stop_cant_complete, route_started,
 *                  route_finished, chemistry_alert
 *   Work Orders: wo_created, wo_updated, wo_completed
 *   Billing: quote_approved, quote_rejected, payment_received, payment_failed,
 *            invoice_overdue
 *   Customer Activity: portal_message, service_request, customer_added,
 *                      customer_cancelled
 *   Weather: weather_proposal, tech_weather_alert
 *   Assignments: tech_assigned, tech_quote_approved, schedule_change
 *   System: system_event
 *
 * Roles see different notification types:
 *   - Owner + Office see management types (route/stops/billing/customers)
 *   - Tech sees assignment types (tech_assigned, tech_weather_alert, schedule_change, tech_quote_approved)
 *   All roles see all types in the preferences UI — they can toggle what they receive.
 */

import { useState, useTransition } from "react"
import { toast } from "sonner"
import { Checkbox } from "@/components/ui/checkbox"
import { Label } from "@/components/ui/label"
import { updateNotificationPreference } from "@/actions/user-notifications"
import type { NotificationPreferenceRow } from "@/actions/user-notifications"

// ---------------------------------------------------------------------------
// Type definitions
// ---------------------------------------------------------------------------

type NotificationTypeItem = {
  type: string
  label: string
}

type NotificationGroup = {
  groupLabel: string
  items: NotificationTypeItem[]
}

// ---------------------------------------------------------------------------
// All notification type groups
// ---------------------------------------------------------------------------

const NOTIFICATION_GROUPS: NotificationGroup[] = [
  {
    groupLabel: "Route & Stops",
    items: [
      { type: "stop_completed", label: "Stop completed" },
      { type: "stop_skipped", label: "Stop skipped" },
      { type: "stop_cant_complete", label: "Stop can't complete" },
      { type: "route_started", label: "Route started" },
      { type: "route_finished", label: "Route finished" },
      { type: "chemistry_alert", label: "Chemistry alert" },
    ],
  },
  {
    groupLabel: "Work Orders",
    items: [
      { type: "wo_created", label: "Work order created" },
      { type: "wo_updated", label: "Work order updated" },
      { type: "wo_completed", label: "Work order completed" },
    ],
  },
  {
    groupLabel: "Billing",
    items: [
      { type: "quote_approved", label: "Quote approved" },
      { type: "quote_rejected", label: "Quote rejected" },
      { type: "payment_received", label: "Payment received" },
      { type: "payment_failed", label: "Payment failed" },
      { type: "invoice_overdue", label: "Invoice overdue" },
    ],
  },
  {
    groupLabel: "Customer Activity",
    items: [
      { type: "portal_message", label: "Portal message received" },
      { type: "service_request", label: "Service request submitted" },
      { type: "customer_added", label: "New customer added" },
      { type: "customer_cancelled", label: "Customer cancelled" },
    ],
  },
  {
    groupLabel: "Weather",
    items: [
      { type: "weather_proposal", label: "Weather reschedule proposal" },
      { type: "tech_weather_alert", label: "Weather alert on route" },
    ],
  },
  {
    groupLabel: "Assignments",
    items: [
      { type: "tech_assigned", label: "New stop or route assigned" },
      { type: "tech_quote_approved", label: "Your quote was approved" },
      { type: "schedule_change", label: "Schedule change" },
    ],
  },
  {
    groupLabel: "System",
    items: [
      { type: "system_event", label: "System events" },
    ],
  },
]

// ---------------------------------------------------------------------------
// State model
// ---------------------------------------------------------------------------

type ChannelState = {
  in_app: boolean
  push: boolean
  email: boolean
}

type PreferenceState = Record<string, ChannelState>

function buildInitialState(savedPrefs: NotificationPreferenceRow[]): PreferenceState {
  const state: PreferenceState = {}

  // Initialize all types to defaults (all enabled)
  for (const group of NOTIFICATION_GROUPS) {
    for (const item of group.items) {
      state[item.type] = { in_app: true, push: true, email: true }
    }
  }

  // Apply saved preferences
  for (const pref of savedPrefs) {
    if (state[pref.notification_type]) {
      state[pref.notification_type] = {
        in_app: pref.in_app_enabled,
        push: pref.push_enabled,
        email: pref.email_enabled,
      }
    }
  }

  return state
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

interface NotificationPreferencesProps {
  initialPreferences: NotificationPreferenceRow[]
}

export function NotificationPreferences({ initialPreferences }: NotificationPreferencesProps) {
  const [prefs, setPrefs] = useState<PreferenceState>(() =>
    buildInitialState(initialPreferences)
  )
  const [isPending, startTransition] = useTransition()

  const handleToggle = (
    notificationType: string,
    channel: "in_app" | "push" | "email",
    checked: boolean
  ) => {
    // Optimistic update
    setPrefs((prev) => ({
      ...prev,
      [notificationType]: {
        ...prev[notificationType],
        [channel]: checked,
      },
    }))

    startTransition(async () => {
      const result = await updateNotificationPreference(
        notificationType,
        channel,
        checked
      )
      if (!result.success) {
        // Revert
        setPrefs((prev) => ({
          ...prev,
          [notificationType]: {
            ...prev[notificationType],
            [channel]: !checked,
          },
        }))
        toast.error("Failed to save preference", {
          description: result.error,
        })
      }
    })
  }

  return (
    <div className="flex flex-col gap-6">
      {NOTIFICATION_GROUPS.map((group) => (
        <div key={group.groupLabel} className="flex flex-col gap-1">
          {/* Group header */}
          <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider px-0.5 mb-1">
            {group.groupLabel}
          </h3>

          {/* Column headers — only show on first group to save space */}
          <div className="flex items-center gap-2 px-4 pb-1">
            <div className="flex-1 min-w-0" />
            <div className="flex items-center gap-6">
              <span className="w-12 text-center text-xs text-muted-foreground">In-App</span>
              <span className="w-12 text-center text-xs text-muted-foreground">Push</span>
              <span className="w-12 text-center text-xs text-muted-foreground">Email</span>
            </div>
          </div>

          {/* Rows */}
          <div className="rounded-xl border border-border/60 bg-muted/5 divide-y divide-border/40">
            {group.items.map((item) => {
              const pref = prefs[item.type] ?? { in_app: true, push: true, email: true }
              const rowId = `pref-${item.type}`

              return (
                <div key={item.type} className="flex items-center gap-2 px-4 py-3">
                  {/* Label */}
                  <Label
                    htmlFor={`${rowId}-in-app`}
                    className="flex-1 min-w-0 text-sm font-medium leading-tight cursor-pointer"
                  >
                    {item.label}
                  </Label>

                  {/* Channel toggles */}
                  <div className="flex items-center gap-6">
                    {/* In-App */}
                    <div className="w-12 flex justify-center">
                      <Checkbox
                        id={`${rowId}-in-app`}
                        checked={pref.in_app}
                        onCheckedChange={(checked) =>
                          handleToggle(item.type, "in_app", checked === true)
                        }
                        disabled={isPending}
                        className="cursor-pointer"
                        aria-label={`${item.label} in-app notifications`}
                      />
                    </div>

                    {/* Push */}
                    <div className="w-12 flex justify-center">
                      <Checkbox
                        id={`${rowId}-push`}
                        checked={pref.push}
                        onCheckedChange={(checked) =>
                          handleToggle(item.type, "push", checked === true)
                        }
                        disabled={isPending}
                        className="cursor-pointer"
                        aria-label={`${item.label} push notifications`}
                      />
                    </div>

                    {/* Email */}
                    <div className="w-12 flex justify-center">
                      <Checkbox
                        id={`${rowId}-email`}
                        checked={pref.email}
                        onCheckedChange={(checked) =>
                          handleToggle(item.type, "email", checked === true)
                        }
                        disabled={isPending}
                        className="cursor-pointer"
                        aria-label={`${item.label} email notifications`}
                      />
                    </div>
                  </div>
                </div>
              )
            })}
          </div>
        </div>
      ))}
    </div>
  )
}
