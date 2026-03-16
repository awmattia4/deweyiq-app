/**
 * alerts/constants.ts — Shared constants and types for the alerts feature.
 *
 * Exported from a non-"use server" file so they can be imported by
 * both client components and server actions without violating Next.js
 * "use server" export rules (only async functions may be exported from
 * "use server" files).
 */

export const SNOOZE_OPTIONS = [
  { label: "1 hour", ms: 1 * 60 * 60 * 1000 },
  { label: "4 hours", ms: 4 * 60 * 60 * 1000 },
  { label: "1 day", ms: 24 * 60 * 60 * 1000 },
  { label: "1 week", ms: 7 * 24 * 60 * 60 * 1000 },
] as const

export type AlertType = "missed_stop" | "declining_chemistry" | "incomplete_data" | "work_order_flagged" | "unprofitable_pool" | "equipment_degradation" | "predictive_chemistry"
export type AlertSeverity = "info" | "warning" | "critical"

export interface Alert {
  id: string
  org_id: string
  alert_type: AlertType
  severity: AlertSeverity
  reference_id: string | null
  reference_type: string | null
  title: string
  description: string | null
  generated_at: Date
  dismissed_at: Date | null
  snoozed_until: Date | null
  metadata: Record<string, unknown> | null
  created_at: Date
}

export type AlertCounts = {
  total: number
  missed_stop: number
  declining_chemistry: number
  incomplete_data: number
  unprofitable_pool: number
  predictive_chemistry: number
}
