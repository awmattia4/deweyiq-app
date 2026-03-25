"use client"

import { useState, useTransition } from "react"
import { useRouter } from "next/navigation"
import Link from "next/link"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Separator } from "@/components/ui/separator"
import { sendAgreement, deleteAgreement } from "@/actions/agreements"

// ─── Types ────────────────────────────────────────────────────────────────────

type AgreementStatus =
  | "draft"
  | "sent"
  | "active"
  | "paused"
  | "expired"
  | "cancelled"
  | "declined"

interface Pool {
  id: string
  name: string
}

interface PoolEntry {
  id: string
  pool_id: string
  pool: Pool | null
  frequency: string
  preferred_day_of_week: number | null
  pricing_model: string
  monthly_amount: string | null
  per_visit_amount: string | null
  tiered_threshold_visits: number | null
  tiered_base_amount: string | null
  tiered_overage_amount: string | null
  checklist_task_ids: string[] | null
  notes: string | null
}

interface Amendment {
  id: string
  version_number: number
  amendment_type: string
  change_summary: string | null
  status: string
  signed_at: string | null
  rejected_at: string | null
  created_at: string | null
}

interface ActivityEntry {
  action: string
  actor: string
  at: string
  note?: string
}

interface Agreement {
  id: string
  agreement_number: string
  status: AgreementStatus
  term_type: string
  start_date: string | null
  end_date: string | null
  auto_renew: boolean | null
  version: number | null
  created_at: string | null
  sent_at: string | null
  signed_at: string | null
  signed_by_name: string | null
  signature_image_url: string | null
  signer_ip: string | null
  terms_and_conditions: string | null
  cancellation_policy: string | null
  liability_waiver: string | null
  internal_notes: string | null
  activity_log: ActivityEntry[] | null
  customer: {
    id: string
    full_name: string
    email: string
    phone: string | null
  }
  poolEntries: PoolEntry[]
  amendments: Amendment[]
  template: { id: string; name: string } | null
}

interface AgreementDetailProps {
  agreement: Agreement
  isOwner: boolean
}

// ─── Status helpers ───────────────────────────────────────────────────────────

const STATUS_LABELS: Record<AgreementStatus, string> = {
  draft: "Draft",
  sent: "Sent",
  active: "Active",
  paused: "Paused",
  expired: "Expired",
  cancelled: "Cancelled",
  declined: "Declined",
}

const STATUS_BADGE_CLASS: Record<AgreementStatus, string> = {
  draft: "bg-muted text-muted-foreground",
  sent: "bg-blue-500/15 text-blue-600 dark:text-blue-400",
  active: "bg-green-500/15 text-green-700 dark:text-green-400",
  paused: "bg-yellow-500/15 text-yellow-700 dark:text-yellow-400",
  expired: "bg-orange-500/15 text-orange-700 dark:text-orange-400",
  cancelled: "bg-destructive/15 text-destructive",
  declined: "bg-destructive/15 text-destructive",
}

// ─── Formatting helpers ───────────────────────────────────────────────────────

const DAYS_OF_WEEK = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"]

function formatDate(dateStr: string | null | undefined): string {
  if (!dateStr) return "—"
  const d = new Date(dateStr)
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })
}

function formatDateTime(dateStr: string | null | undefined): string {
  if (!dateStr) return "—"
  const d = new Date(dateStr)
  return d.toLocaleString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
  })
}

function formatTermType(termType: string): string {
  if (termType === "month_to_month") return "Month-to-Month"
  const match = termType.match(/^(\d+)_month/)
  if (match) return `${match[1]}-Month Term`
  return termType
}

function formatFrequency(frequency: string, preferredDay: number | null): string {
  const dayStr = preferredDay != null ? ` — ${DAYS_OF_WEEK[preferredDay]}s` : ""
  switch (frequency) {
    case "weekly": return `Weekly${dayStr}`
    case "biweekly": return `Bi-Weekly${dayStr}`
    case "monthly": return "Monthly"
    case "custom": return "Custom Interval"
    default: return frequency
  }
}

function formatPricing(entry: PoolEntry): string {
  switch (entry.pricing_model) {
    case "flat_monthly":
      return entry.monthly_amount
        ? `$${parseFloat(entry.monthly_amount).toFixed(2)}/mo (Flat)`
        : "Flat monthly"
    case "per_visit":
      return entry.per_visit_amount
        ? `$${parseFloat(entry.per_visit_amount).toFixed(2)}/visit`
        : "Per visit"
    case "tiered":
      return entry.tiered_base_amount
        ? `$${parseFloat(entry.tiered_base_amount).toFixed(2)}/mo (Tiered)`
        : "Tiered"
    default:
      return entry.pricing_model
  }
}

function formatCurrency(amount: number): string {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: 0,
    maximumFractionDigits: 2,
  }).format(amount)
}

function computeMonthlyTotal(entries: PoolEntry[]): number {
  return entries.reduce((sum, entry) => {
    if (entry.pricing_model === "flat_monthly" || entry.pricing_model === "tiered") {
      return sum + parseFloat(entry.monthly_amount ?? "0")
    }
    if (entry.pricing_model === "per_visit") {
      return sum + parseFloat(entry.per_visit_amount ?? "0")
    }
    return sum
  }, 0)
}

function formatActionLabel(action: string): string {
  const labels: Record<string, string> = {
    created: "Agreement created",
    updated: "Agreement updated",
    sent: "Sent to customer",
    signed: "Signed by customer",
    declined: "Declined by customer",
    cancelled: "Agreement cancelled",
    paused: "Agreement paused",
    resumed: "Agreement resumed",
    expired: "Agreement expired",
    amended: "Amendment created",
  }
  return labels[action] ?? action
}

// ─── Expandable text section ──────────────────────────────────────────────────

function ExpandableText({ title, content }: { title: string; content: string | null }) {
  const [expanded, setExpanded] = useState(false)
  if (!content) return null

  const preview = content.length > 200 ? content.slice(0, 200) + "…" : content
  const showToggle = content.length > 200

  return (
    <div className="space-y-1">
      <p className="text-sm font-medium">{title}</p>
      <p className="text-sm text-muted-foreground whitespace-pre-wrap">
        {expanded ? content : preview}
      </p>
      {showToggle && (
        <button
          type="button"
          onClick={() => setExpanded(!expanded)}
          className="text-xs text-primary hover:underline"
        >
          {expanded ? "Show less" : "Show more"}
        </button>
      )}
    </div>
  )
}

// ─── Component ────────────────────────────────────────────────────────────────

export function AgreementDetail({ agreement, isOwner }: AgreementDetailProps) {
  const router = useRouter()
  const [isPending, startTransition] = useTransition()
  const [localAgreement, setLocalAgreement] = useState(agreement)
  const [error, setError] = useState<string | null>(null)

  const status = localAgreement.status
  const monthlyTotal = computeMonthlyTotal(localAgreement.poolEntries)

  // ── Action handlers ────────────────────────────────────────────────────────

  function handleSend() {
    setError(null)
    startTransition(async () => {
      const result = await sendAgreement(localAgreement.id)
      if (result.success) {
        setLocalAgreement((prev) => ({
          ...prev,
          status: "sent" as AgreementStatus,
          sent_at: new Date().toISOString(),
        }))
      } else {
        setError(result.error ?? "Failed to send agreement")
      }
    })
  }

  function handleDelete() {
    if (!confirm(`Delete agreement ${localAgreement.agreement_number}? This cannot be undone.`)) {
      return
    }
    setError(null)
    startTransition(async () => {
      const result = await deleteAgreement(localAgreement.id)
      if (result.success) {
        router.push("/agreements")
      } else {
        setError(result.error ?? "Failed to delete agreement")
      }
    })
  }

  function handleDownloadPdf() {
    window.open(`/api/agreements/${localAgreement.id}/pdf`, "_blank")
  }

  // ── Activity log (reverse chronological) ──────────────────────────────────
  const activityLog = [...(localAgreement.activity_log ?? [])].reverse()

  return (
    <div className="flex flex-col gap-6">
      {/* ── Page header ──────────────────────────────────────────────────── */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div className="flex flex-col gap-1">
          <div className="flex items-center gap-2">
            <h1 className="text-2xl font-bold tracking-tight">
              {localAgreement.agreement_number}
            </h1>
            <Badge
              className={`text-xs font-medium ${STATUS_BADGE_CLASS[status]}`}
              variant="outline"
            >
              {STATUS_LABELS[status]}
            </Badge>
          </div>
          <p className="text-sm text-muted-foreground">
            <Link
              href={`/customers/${localAgreement.customer.id}`}
              className="hover:underline text-foreground font-medium"
            >
              {localAgreement.customer.full_name}
            </Link>
            {" · "}
            {formatTermType(localAgreement.term_type)}
            {localAgreement.auto_renew ? " · Auto-renew" : ""}
          </p>
        </div>

        {/* Back link */}
        <Button asChild variant="outline" size="sm">
          <Link href="/agreements">All Agreements</Link>
        </Button>
      </div>

      {/* ── Error banner ─────────────────────────────────────────────────── */}
      {error && (
        <div className="rounded-md border border-destructive/40 bg-destructive/10 px-4 py-3 text-sm text-destructive">
          {error}
        </div>
      )}

      {/* ── Two-column layout ─────────────────────────────────────────────── */}
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        {/* ── Left column: Agreement details ──────────────────────────── */}
        <div className="flex flex-col gap-5 lg:col-span-2">

          {/* Term & Dates */}
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-sm font-semibold">Agreement Details</CardTitle>
            </CardHeader>
            <CardContent className="grid grid-cols-2 gap-4 text-sm sm:grid-cols-3">
              <div>
                <p className="text-xs text-muted-foreground mb-0.5">Term</p>
                <p className="font-medium">{formatTermType(localAgreement.term_type)}</p>
              </div>
              {localAgreement.start_date && (
                <div>
                  <p className="text-xs text-muted-foreground mb-0.5">Start date</p>
                  <p>{formatDate(localAgreement.start_date)}</p>
                </div>
              )}
              {localAgreement.end_date && (
                <div>
                  <p className="text-xs text-muted-foreground mb-0.5">End date</p>
                  <p>{formatDate(localAgreement.end_date)}</p>
                </div>
              )}
              <div>
                <p className="text-xs text-muted-foreground mb-0.5">Auto-renew</p>
                <p>{localAgreement.auto_renew ? "Yes" : "No"}</p>
              </div>
              <div>
                <p className="text-xs text-muted-foreground mb-0.5">Version</p>
                <p>v{localAgreement.version ?? 1}</p>
              </div>
              {localAgreement.template && (
                <div>
                  <p className="text-xs text-muted-foreground mb-0.5">Template</p>
                  <p>{localAgreement.template.name}</p>
                </div>
              )}
              <div>
                <p className="text-xs text-muted-foreground mb-0.5">Created</p>
                <p>{formatDate(localAgreement.created_at)}</p>
              </div>
              {localAgreement.sent_at && (
                <div>
                  <p className="text-xs text-muted-foreground mb-0.5">Sent</p>
                  <p>{formatDate(localAgreement.sent_at)}</p>
                </div>
              )}
              {localAgreement.signed_at && (
                <div>
                  <p className="text-xs text-muted-foreground mb-0.5">Signed</p>
                  <p>{formatDate(localAgreement.signed_at)}</p>
                </div>
              )}
            </CardContent>
          </Card>

          {/* Pool Services */}
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-sm font-semibold">
                Pool Services
                <span className="ml-2 text-xs font-normal text-muted-foreground">
                  ({localAgreement.poolEntries.length} {localAgreement.poolEntries.length === 1 ? "pool" : "pools"})
                </span>
              </CardTitle>
            </CardHeader>
            <CardContent className="flex flex-col gap-4">
              {localAgreement.poolEntries.length === 0 ? (
                <p className="text-sm text-muted-foreground italic">No pool entries</p>
              ) : (
                localAgreement.poolEntries.map((entry, idx) => (
                  <div key={entry.id}>
                    {idx > 0 && <Separator className="mb-4" />}
                    <div className="space-y-2">
                      <div className="flex items-center justify-between">
                        <p className="text-sm font-medium">
                          {entry.pool?.name ?? "Unknown pool"}
                        </p>
                        <p className="text-sm font-medium">{formatPricing(entry)}</p>
                      </div>
                      <p className="text-xs text-muted-foreground">
                        {formatFrequency(entry.frequency, entry.preferred_day_of_week)}
                      </p>
                      {entry.notes && (
                        <p className="text-xs text-muted-foreground italic">{entry.notes}</p>
                      )}
                    </div>
                  </div>
                ))
              )}

              {/* Monthly total */}
              {monthlyTotal > 0 && (
                <>
                  <Separator />
                  <div className="flex items-center justify-between text-sm">
                    <p className="font-medium">Total monthly</p>
                    <p className="font-semibold">{formatCurrency(monthlyTotal)}/mo</p>
                  </div>
                </>
              )}
            </CardContent>
          </Card>

          {/* Terms & Conditions */}
          {(localAgreement.terms_and_conditions ||
            localAgreement.cancellation_policy ||
            localAgreement.liability_waiver) && (
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-sm font-semibold">Terms & Conditions</CardTitle>
              </CardHeader>
              <CardContent className="flex flex-col gap-4">
                <ExpandableText
                  title="Terms and Conditions"
                  content={localAgreement.terms_and_conditions}
                />
                <ExpandableText
                  title="Cancellation Policy"
                  content={localAgreement.cancellation_policy}
                />
                <ExpandableText
                  title="Liability Waiver"
                  content={localAgreement.liability_waiver}
                />
              </CardContent>
            </Card>
          )}

          {/* Internal Notes (office-only) */}
          {localAgreement.internal_notes && (
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-sm font-semibold">Internal Notes</CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-sm text-muted-foreground whitespace-pre-wrap">
                  {localAgreement.internal_notes}
                </p>
              </CardContent>
            </Card>
          )}
        </div>

        {/* ── Right column: Actions + Timeline ──────────────────────────── */}
        <div className="flex flex-col gap-5">

          {/* Actions */}
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-sm font-semibold">Actions</CardTitle>
            </CardHeader>
            <CardContent className="flex flex-col gap-2">
              {/* Draft actions */}
              {status === "draft" && (
                <>
                  <Button
                    size="sm"
                    onClick={handleSend}
                    disabled={isPending}
                    className="w-full"
                  >
                    {isPending ? "Sending…" : "Send to Customer"}
                  </Button>
                  <Button asChild size="sm" variant="outline" className="w-full">
                    <Link href={`/agreements/new?edit=${localAgreement.id}`}>
                      Edit
                    </Link>
                  </Button>
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={handleDownloadPdf}
                    disabled={isPending}
                    className="w-full"
                  >
                    Download PDF
                  </Button>
                  {isOwner && (
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={handleDelete}
                      disabled={isPending}
                      className="w-full text-destructive hover:text-destructive"
                    >
                      Delete
                    </Button>
                  )}
                </>
              )}

              {/* Sent actions */}
              {status === "sent" && (
                <>
                  <Button
                    size="sm"
                    onClick={handleSend}
                    disabled={isPending}
                    className="w-full"
                  >
                    {isPending ? "Sending…" : "Resend"}
                  </Button>
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={handleDownloadPdf}
                    disabled={isPending}
                    className="w-full"
                  >
                    Download PDF
                  </Button>
                  <Button
                    size="sm"
                    variant="outline"
                    disabled
                    className="w-full text-destructive hover:text-destructive"
                  >
                    Cancel (Plan 06)
                  </Button>
                </>
              )}

              {/* Active actions */}
              {status === "active" && (
                <>
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={handleDownloadPdf}
                    disabled={isPending}
                    className="w-full"
                  >
                    Download PDF
                  </Button>
                  <Button size="sm" variant="outline" disabled className="w-full">
                    Pause (Plan 06)
                  </Button>
                  <Button size="sm" variant="outline" disabled className="w-full">
                    Amend (Plan 06)
                  </Button>
                  <Button
                    size="sm"
                    variant="outline"
                    disabled
                    className="w-full text-destructive hover:text-destructive"
                  >
                    Cancel (Plan 06)
                  </Button>
                </>
              )}

              {/* Paused actions */}
              {status === "paused" && (
                <>
                  <Button size="sm" variant="outline" disabled className="w-full">
                    Resume (Plan 06)
                  </Button>
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={handleDownloadPdf}
                    disabled={isPending}
                    className="w-full"
                  >
                    Download PDF
                  </Button>
                  <Button
                    size="sm"
                    variant="outline"
                    disabled
                    className="w-full text-destructive hover:text-destructive"
                  >
                    Cancel (Plan 06)
                  </Button>
                </>
              )}

              {/* Expired actions */}
              {status === "expired" && (
                <>
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={handleDownloadPdf}
                    disabled={isPending}
                    className="w-full"
                  >
                    Download PDF
                  </Button>
                  <Button size="sm" variant="outline" disabled className="w-full">
                    Renew (Plan 06)
                  </Button>
                </>
              )}

              {/* Cancelled / Declined actions */}
              {(status === "cancelled" || status === "declined") && (
                <>
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={handleDownloadPdf}
                    disabled={isPending}
                    className="w-full"
                  >
                    Download PDF
                  </Button>
                  <Button size="sm" variant="outline" disabled className="w-full">
                    Create New from This (Plan 06)
                  </Button>
                </>
              )}
            </CardContent>
          </Card>

          {/* Signature Info */}
          {localAgreement.signed_at && (
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-sm font-semibold">Signature</CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                {localAgreement.signed_by_name && (
                  <div>
                    <p className="text-xs text-muted-foreground mb-0.5">Signed by</p>
                    <p className="text-sm">{localAgreement.signed_by_name}</p>
                  </div>
                )}
                <div>
                  <p className="text-xs text-muted-foreground mb-0.5">Signed at</p>
                  <p className="text-sm">{formatDateTime(localAgreement.signed_at)}</p>
                </div>
                {localAgreement.signer_ip && (
                  <div>
                    <p className="text-xs text-muted-foreground mb-0.5">IP address</p>
                    <p className="text-sm font-mono text-xs">{localAgreement.signer_ip}</p>
                  </div>
                )}
                {localAgreement.signature_image_url && (
                  <div>
                    <p className="text-xs text-muted-foreground mb-1.5">Signature</p>
                    <div className="rounded-md border bg-white p-2">
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img
                        src={localAgreement.signature_image_url}
                        alt="Customer signature"
                        className="h-16 w-full object-contain"
                      />
                    </div>
                  </div>
                )}
              </CardContent>
            </Card>
          )}

          {/* Amendments */}
          {localAgreement.amendments.length > 0 && (
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-sm font-semibold">
                  Amendments
                  <span className="ml-2 text-xs font-normal text-muted-foreground">
                    ({localAgreement.amendments.length})
                  </span>
                </CardTitle>
              </CardHeader>
              <CardContent className="flex flex-col gap-3">
                {localAgreement.amendments.map((amendment) => (
                  <div key={amendment.id} className="space-y-1">
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-sm font-medium">
                        v{amendment.version_number} — {amendment.amendment_type === "major" ? "Major" : "Minor"}
                      </span>
                      <Badge
                        variant="outline"
                        className={`text-xs ${
                          amendment.status === "signed"
                            ? "bg-green-500/15 text-green-700 dark:text-green-400"
                            : amendment.status === "rejected"
                            ? "bg-destructive/15 text-destructive"
                            : "bg-muted text-muted-foreground"
                        }`}
                      >
                        {amendment.status}
                      </Badge>
                    </div>
                    {amendment.change_summary && (
                      <p className="text-xs text-muted-foreground">{amendment.change_summary}</p>
                    )}
                    <p className="text-xs text-muted-foreground">
                      {formatDate(amendment.created_at)}
                    </p>
                  </div>
                ))}
              </CardContent>
            </Card>
          )}

          {/* Activity Timeline */}
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-sm font-semibold">Activity</CardTitle>
            </CardHeader>
            <CardContent>
              {activityLog.length === 0 ? (
                <p className="text-sm text-muted-foreground italic">No activity recorded</p>
              ) : (
                <div className="relative flex flex-col gap-0">
                  {activityLog.map((entry, idx) => (
                    <div key={idx} className="flex gap-3 pb-4 last:pb-0">
                      {/* Timeline line + dot */}
                      <div className="flex flex-col items-center">
                        <div className="mt-1 h-2 w-2 shrink-0 rounded-full bg-primary/50" />
                        {idx < activityLog.length - 1 && (
                          <div className="mt-1 w-px flex-1 bg-border" />
                        )}
                      </div>
                      {/* Content */}
                      <div className="flex flex-col gap-0.5 pb-1">
                        <p className="text-sm">{formatActionLabel(entry.action)}</p>
                        {entry.note && (
                          <p className="text-xs text-muted-foreground">{entry.note}</p>
                        )}
                        <p className="text-xs text-muted-foreground">
                          {formatDateTime(entry.at)}
                        </p>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  )
}
