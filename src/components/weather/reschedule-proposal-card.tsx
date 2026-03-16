"use client"

import { useState, useTransition } from "react"
import {
  CloudRainIcon,
  CloudLightningIcon,
  ThermometerIcon,
  WindIcon,
  ChevronDownIcon,
  ChevronUpIcon,
  CheckIcon,
  XIcon,
  BellIcon,
  BellOffIcon,
} from "lucide-react"
import { toast } from "sonner"
import { cn } from "@/lib/utils"
import { approveProposal, denyProposal, updateProposalNotifications } from "@/actions/weather"
import type { WeatherProposal } from "@/actions/weather"

// ---------------------------------------------------------------------------
// Weather type config
// ---------------------------------------------------------------------------

interface WeatherConfig {
  Icon: React.FC<React.SVGProps<SVGSVGElement>>
  bgColor: string
  textColor: string
  borderColor: string
  label: string
}

const WEATHER_CONFIG: Record<string, WeatherConfig> = {
  rain: {
    Icon: CloudRainIcon as React.FC<React.SVGProps<SVGSVGElement>>,
    bgColor: "rgba(59, 130, 246, 0.08)",
    textColor: "#93c5fd",
    borderColor: "rgba(59, 130, 246, 0.25)",
    label: "Rain",
  },
  storm: {
    Icon: CloudLightningIcon as React.FC<React.SVGProps<SVGSVGElement>>,
    bgColor: "rgba(245, 158, 11, 0.08)",
    textColor: "#fcd34d",
    borderColor: "rgba(245, 158, 11, 0.25)",
    label: "Storm",
  },
  heat: {
    Icon: ThermometerIcon as React.FC<React.SVGProps<SVGSVGElement>>,
    bgColor: "rgba(239, 68, 68, 0.08)",
    textColor: "#fca5a5",
    borderColor: "rgba(239, 68, 68, 0.25)",
    label: "Heat",
  },
  wind: {
    Icon: WindIcon as React.FC<React.SVGProps<SVGSVGElement>>,
    bgColor: "rgba(107, 114, 128, 0.08)",
    textColor: "#d1d5db",
    borderColor: "rgba(107, 114, 128, 0.25)",
    label: "Wind",
  },
}

const DEFAULT_WEATHER_CONFIG: WeatherConfig = {
  Icon: CloudRainIcon as React.FC<React.SVGProps<SVGSVGElement>>,
  bgColor: "rgba(59, 130, 246, 0.08)",
  textColor: "#93c5fd",
  borderColor: "rgba(59, 130, 246, 0.25)",
  label: "Weather",
}

// ---------------------------------------------------------------------------
// Format date helper
// ---------------------------------------------------------------------------

function formatDate(dateStr: string): string {
  const [year, month, day] = dateStr.split("-").map(Number)
  const d = new Date(year, month - 1, day)
  return d.toLocaleDateString("en-US", {
    weekday: "long",
    month: "long",
    day: "numeric",
  })
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

interface RescheduleProposalCardProps {
  proposal: WeatherProposal
  onActioned?: () => void
}

/**
 * RescheduleProposalCard — displays a weather reschedule proposal with:
 * - Weather type icon + label + affected date
 * - Expandable list of affected stops with current → proposed date
 * - Customer notification opt-out (per MEMORY.md: auto-notify with opt-out)
 * - Approve (green) and Deny (outline) action buttons
 */
export function RescheduleProposalCard({
  proposal,
  onActioned,
}: RescheduleProposalCardProps) {
  const [stopsExpanded, setStopsExpanded] = useState(false)
  const [notifyExpanded, setNotifyExpanded] = useState(false)
  const [notifyCustomers, setNotifyCustomers] = useState(proposal.notify_customers)
  const [excludedIds, setExcludedIds] = useState<string[]>(
    proposal.excluded_customer_ids ?? []
  )
  const [isPending, startTransition] = useTransition()

  const config = WEATHER_CONFIG[proposal.weather_type] ?? DEFAULT_WEATHER_CONFIG
  const IconComponent = config.Icon

  const affectedStops = proposal.affected_stops ?? []
  const proposedReschedules = proposal.proposed_reschedules ?? []

  // Build a lookup from stopId to newDate
  const newDateByStopId: Record<string, string> = {}
  for (const pr of proposedReschedules) {
    newDateByStopId[pr.stopId] = pr.newDate
  }

  // Unique customers for notification opt-out list
  const uniqueCustomers = Array.from(
    new Map(affectedStops.map((s) => [s.customerId, s.customerName])).entries()
  ).map(([id, name]) => ({ id, name }))

  function toggleCustomerExclusion(customerId: string) {
    const newExcluded = excludedIds.includes(customerId)
      ? excludedIds.filter((id) => id !== customerId)
      : [...excludedIds, customerId]
    setExcludedIds(newExcluded)

    // Persist change to DB (fire-and-forget — non-blocking)
    startTransition(async () => {
      await updateProposalNotifications(proposal.id, notifyCustomers, newExcluded)
    })
  }

  function toggleNotifyAll(checked: boolean) {
    setNotifyCustomers(checked)

    startTransition(async () => {
      await updateProposalNotifications(proposal.id, checked, excludedIds)
    })
  }

  function handleApprove() {
    startTransition(async () => {
      const result = await approveProposal(proposal.id)
      if (result.success) {
        const customerCount = result.affectedCustomerIds?.length ?? 0
        toast.success(
          `Reschedule approved — ${affectedStops.length} stop${affectedStops.length !== 1 ? "s" : ""} rescheduled${customerCount > 0 ? `, ${customerCount} customer${customerCount !== 1 ? "s" : ""} will be notified` : ""}`
        )
        onActioned?.()
      } else {
        toast.error(result.error ?? "Failed to approve reschedule")
      }
    })
  }

  function handleDeny() {
    startTransition(async () => {
      const result = await denyProposal(proposal.id)
      if (result.success) {
        toast.success("Proposal declined — original schedule kept")
        onActioned?.()
      } else {
        toast.error(result.error ?? "Failed to decline proposal")
      }
    })
  }

  return (
    <div
      className="rounded-lg border overflow-hidden"
      style={{ borderColor: config.borderColor, backgroundColor: config.bgColor }}
    >
      {/* ── Header ─────────────────────────────────────────────────────────── */}
      <div className="flex items-start gap-3 p-4">
        <div
          className="mt-0.5 shrink-0 rounded-full p-1.5"
          style={{
            backgroundColor: "rgba(0,0,0,0.15)",
            border: `1px solid ${config.borderColor}`,
          }}
        >
          <IconComponent
            className="h-4 w-4"
            style={{ color: config.textColor }}
            aria-hidden="true"
          />
        </div>

        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-sm font-semibold" style={{ color: config.textColor }}>
              {proposal.weather_label}
            </span>
            <span className="text-xs text-muted-foreground">
              {formatDate(proposal.affected_date)}
            </span>
          </div>
          <p className="mt-0.5 text-xs text-muted-foreground">
            {affectedStops.length} stop{affectedStops.length !== 1 ? "s" : ""} affected — system
            found optimal reschedule dates for each
          </p>
        </div>
      </div>

      {/* ── Affected stops (expandable) ─────────────────────────────────────── */}
      <div className="border-t border-border/40">
        <button
          onClick={() => setStopsExpanded((prev) => !prev)}
          className="flex w-full cursor-pointer items-center justify-between px-4 py-2.5 text-left hover:bg-black/10 transition-colors"
          aria-expanded={stopsExpanded}
        >
          <span className="text-xs font-medium text-muted-foreground">
            View affected stops
          </span>
          {stopsExpanded ? (
            <ChevronUpIcon className="h-3.5 w-3.5 text-muted-foreground" />
          ) : (
            <ChevronDownIcon className="h-3.5 w-3.5 text-muted-foreground" />
          )}
        </button>

        {stopsExpanded && (
          <div className="px-4 pb-3">
            {affectedStops.length === 0 ? (
              <p className="text-xs text-muted-foreground italic">No stops on this day</p>
            ) : (
              <div className="flex flex-col gap-2">
                {affectedStops.map((stop) => {
                  const newDate = newDateByStopId[stop.stopId]
                  return (
                    <div
                      key={stop.stopId}
                      className="flex items-start justify-between gap-3 rounded-md bg-black/10 px-3 py-2"
                    >
                      <div className="min-w-0">
                        <p className="text-xs font-medium text-foreground truncate">
                          {stop.customerName}
                          {stop.poolName ? (
                            <span className="ml-1 font-normal text-muted-foreground">
                              · {stop.poolName}
                            </span>
                          ) : null}
                        </p>
                        {stop.techName && (
                          <p className="text-[11px] text-muted-foreground">
                            {stop.techName}
                          </p>
                        )}
                      </div>
                      {newDate && (
                        <div className="shrink-0 text-right">
                          <p className="text-[10px] text-muted-foreground line-through">
                            {formatDate(stop.originalDate)}
                          </p>
                          <p className="text-[11px] font-medium text-foreground">
                            {formatDate(newDate)}
                          </p>
                        </div>
                      )}
                    </div>
                  )
                })}
              </div>
            )}
          </div>
        )}
      </div>

      {/* ── Customer notification opt-out ───────────────────────────────────── */}
      <div className="border-t border-border/40">
        <button
          onClick={() => setNotifyExpanded((prev) => !prev)}
          className="flex w-full cursor-pointer items-center justify-between px-4 py-2.5 text-left hover:bg-black/10 transition-colors"
          aria-expanded={notifyExpanded}
        >
          <div className="flex items-center gap-2">
            {notifyCustomers ? (
              <BellIcon className="h-3.5 w-3.5 text-muted-foreground" />
            ) : (
              <BellOffIcon className="h-3.5 w-3.5 text-muted-foreground" />
            )}
            <span className="text-xs font-medium text-muted-foreground">
              {notifyCustomers
                ? excludedIds.length > 0
                  ? `Notify customers (${uniqueCustomers.length - excludedIds.length} of ${uniqueCustomers.length})`
                  : `Notify all ${uniqueCustomers.length} customer${uniqueCustomers.length !== 1 ? "s" : ""}`
                : "Notifications off"}
            </span>
          </div>
          {notifyExpanded ? (
            <ChevronUpIcon className="h-3.5 w-3.5 text-muted-foreground" />
          ) : (
            <ChevronDownIcon className="h-3.5 w-3.5 text-muted-foreground" />
          )}
        </button>

        {notifyExpanded && (
          <div className="px-4 pb-3 flex flex-col gap-2">
            {/* Master toggle */}
            <label className="flex cursor-pointer items-center gap-2.5">
              <div
                className={cn(
                  "flex h-4 w-4 shrink-0 items-center justify-center rounded border transition-colors",
                  notifyCustomers
                    ? "border-primary bg-primary"
                    : "border-border bg-transparent"
                )}
                onClick={() => toggleNotifyAll(!notifyCustomers)}
                role="checkbox"
                aria-checked={notifyCustomers}
                tabIndex={0}
                onKeyDown={(e) => e.key === " " && toggleNotifyAll(!notifyCustomers)}
              >
                {notifyCustomers && (
                  <CheckIcon className="h-2.5 w-2.5 text-primary-foreground" strokeWidth={3} />
                )}
              </div>
              <span className="text-xs text-foreground font-medium">
                Notify customers of reschedule
              </span>
            </label>

            {/* Per-customer opt-out list */}
            {notifyCustomers && uniqueCustomers.length > 0 && (
              <div className="ml-6 flex flex-col gap-1.5 border-l border-border/40 pl-3">
                {uniqueCustomers.map((customer) => {
                  const isExcluded = excludedIds.includes(customer.id)
                  return (
                    <label
                      key={customer.id}
                      className="flex cursor-pointer items-center gap-2"
                    >
                      <div
                        className={cn(
                          "flex h-3.5 w-3.5 shrink-0 items-center justify-center rounded border transition-colors",
                          !isExcluded
                            ? "border-primary bg-primary"
                            : "border-border bg-transparent"
                        )}
                        onClick={() => toggleCustomerExclusion(customer.id)}
                        role="checkbox"
                        aria-checked={!isExcluded}
                        tabIndex={0}
                        onKeyDown={(e) =>
                          e.key === " " && toggleCustomerExclusion(customer.id)
                        }
                      >
                        {!isExcluded && (
                          <CheckIcon
                            className="h-2 w-2 text-primary-foreground"
                            strokeWidth={3}
                          />
                        )}
                      </div>
                      <span className="text-xs text-muted-foreground">
                        {customer.name}
                      </span>
                    </label>
                  )
                })}
              </div>
            )}
          </div>
        )}
      </div>

      {/* ── Action buttons ──────────────────────────────────────────────────── */}
      <div className="flex items-center gap-3 border-t border-border/40 px-4 py-3">
        <button
          onClick={handleApprove}
          disabled={isPending}
          className={cn(
            "flex cursor-pointer items-center gap-1.5 rounded-md px-3 py-1.5 text-xs font-medium transition-colors",
            isPending
              ? "bg-green-600/40 text-green-200 cursor-not-allowed"
              : "bg-green-600 text-white hover:bg-green-500"
          )}
        >
          <CheckIcon className="h-3.5 w-3.5" />
          {isPending ? "Applying..." : "Approve & Reschedule"}
        </button>

        <button
          onClick={handleDeny}
          disabled={isPending}
          className={cn(
            "flex cursor-pointer items-center gap-1.5 rounded-md border px-3 py-1.5 text-xs font-medium transition-colors",
            isPending
              ? "border-border text-muted-foreground cursor-not-allowed"
              : "border-border text-muted-foreground hover:border-foreground/40 hover:text-foreground"
          )}
        >
          <XIcon className="h-3.5 w-3.5" />
          Deny
        </button>
      </div>
    </div>
  )
}
