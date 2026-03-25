"use client"

import { useState, useTransition } from "react"
import { useRouter } from "next/navigation"
import Link from "next/link"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Separator } from "@/components/ui/separator"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog"
import {
  sendAgreement,
  deleteAgreement,
  pauseAgreement,
  resumeAgreement,
  cancelAgreement,
  renewAgreement,
  amendAgreement,
  type AmendmentChanges,
  type PoolComplianceResult,
} from "@/actions/agreements"
import { AmendmentDialog } from "@/components/agreements/amendment-dialog"

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
  schedule_rule_id: string | null
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
  /** Notice period in days from org_settings — 0 = immediate cancellation */
  noticePeriodDays?: number
  /** Compliance results for active agreements — per pool entry frequency/billing status */
  complianceResults?: PoolComplianceResult[]
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
    case "monthly_flat":
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
    if (entry.pricing_model === "monthly_flat" || entry.pricing_model === "tiered") {
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
    agreement_sent: "Sent to customer",
    signed: "Signed by customer",
    agreement_signed: "Signed by customer",
    declined: "Declined by customer",
    agreement_declined: "Declined by customer",
    cancelled: "Agreement cancelled",
    agreement_cancelled: "Cancellation recorded",
    paused: "Agreement paused",
    agreement_paused: "Agreement paused",
    resumed: "Agreement resumed",
    agreement_resumed: "Agreement resumed",
    expired: "Agreement expired",
    agreement_expired: "Agreement expired",
    amended: "Amendment created",
    amendment_signed: "Amendment approved by customer",
    amendment_rejected: "Amendment rejected by customer",
    renewed: "Agreement renewed",
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

export function AgreementDetail({ agreement, isOwner, noticePeriodDays = 30, complianceResults }: AgreementDetailProps) {
  const router = useRouter()
  const [isPending, startTransition] = useTransition()
  const [localAgreement, setLocalAgreement] = useState(agreement)
  const [error, setError] = useState<string | null>(null)

  // Pause dialog
  const [pauseDialogOpen, setPauseDialogOpen] = useState(false)
  const [pauseReason, setPauseReason] = useState("")

  // Cancel dialog
  const [cancelDialogOpen, setCancelDialogOpen] = useState(false)

  // Amendment dialog
  const [amendDialogOpen, setAmendDialogOpen] = useState(false)
  const [isAmending, setIsAmending] = useState(false)

  const status = localAgreement.status
  const monthlyTotal = computeMonthlyTotal(localAgreement.poolEntries)

  // ── Helpers ───────────────────────────────────────────────────────────────

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  function applyFreshData(freshData: Record<string, any>) {
    if (freshData) {
      setLocalAgreement(freshData as Agreement)
    }
  }

  // Calculate the effective cancellation date for notice period display
  function getCancellationEffectiveDate(): string {
    if (noticePeriodDays === 0) return "immediately"
    const d = new Date()
    d.setDate(d.getDate() + noticePeriodDays)
    return d.toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" })
  }

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

  function handlePause() {
    setError(null)
    startTransition(async () => {
      const result = await pauseAgreement(localAgreement.id, pauseReason.trim() || undefined)
      if (result.success && result.data) {
        applyFreshData(result.data)
        setPauseDialogOpen(false)
        setPauseReason("")
      } else {
        setError(result.error ?? "Failed to pause agreement")
        setPauseDialogOpen(false)
      }
    })
  }

  function handleResume() {
    if (!confirm("Resume this agreement? Schedule rules will be reactivated with today as the new anchor date.")) return
    setError(null)
    startTransition(async () => {
      const result = await resumeAgreement(localAgreement.id)
      if (result.success && result.data) {
        applyFreshData(result.data)
      } else {
        setError(result.error ?? "Failed to resume agreement")
      }
    })
  }

  function handleCancel() {
    setError(null)
    startTransition(async () => {
      const result = await cancelAgreement(localAgreement.id)
      if (result.success && result.data) {
        applyFreshData(result.data)
        setCancelDialogOpen(false)
      } else {
        setError(result.error ?? "Failed to cancel agreement")
        setCancelDialogOpen(false)
      }
    })
  }

  function handleRenew() {
    setError(null)
    startTransition(async () => {
      const result = await renewAgreement(localAgreement.id)
      if (result.success && result.data) {
        router.push(`/agreements/${result.data.id}`)
      } else {
        setError(result.error ?? "Failed to renew agreement")
      }
    })
  }

  async function handleAmend(changes: AmendmentChanges, changeSummary: string) {
    setError(null)
    setIsAmending(true)
    try {
      const result = await amendAgreement(localAgreement.id, changes, changeSummary)
      if (result.success && result.data) {
        applyFreshData(result.data)
        setAmendDialogOpen(false)
      } else {
        setError(result.error ?? "Failed to amend agreement")
        setAmendDialogOpen(false)
      }
    } finally {
      setIsAmending(false)
    }
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
                      <div className="flex items-center gap-2">
                        <p className="text-xs text-muted-foreground">
                          {formatFrequency(entry.frequency, entry.preferred_day_of_week)}
                        </p>
                        {entry.schedule_rule_id ? (
                          <span className="text-xs text-green-600 dark:text-green-400">· Scheduled</span>
                        ) : status === "active" ? (
                          <span className="text-xs text-yellow-600 dark:text-yellow-400">· Not linked to schedule</span>
                        ) : null}
                      </div>
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

          {/* Compliance (active agreements only) */}
          {status === "active" && complianceResults && complianceResults.length > 0 && (
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-sm font-semibold">
                  Compliance
                  <span className="ml-2 text-xs font-normal text-muted-foreground">
                    — last 30 days
                  </span>
                </CardTitle>
              </CardHeader>
              <CardContent className="flex flex-col gap-4">
                {complianceResults.map((result, idx) => {
                  const freqColor =
                    result.frequency_status === "breach"
                      ? "text-red-600 dark:text-red-400"
                      : result.frequency_status === "warning"
                        ? "text-yellow-600 dark:text-yellow-400"
                        : "text-green-600 dark:text-green-400"
                  const billingColor =
                    result.billing_status === "mismatch"
                      ? "text-red-600 dark:text-red-400"
                      : result.billing_status === "compliant"
                        ? "text-green-600 dark:text-green-400"
                        : "text-muted-foreground"

                  return (
                    <div key={result.pool_id}>
                      {idx > 0 && <Separator className="mb-4" />}
                      <div className="space-y-2">
                        <p className="text-sm font-medium">{result.pool_name}</p>
                        <div className="grid grid-cols-2 gap-3 text-xs">
                          <div>
                            <p className="text-muted-foreground mb-0.5">Service frequency</p>
                            <p className={`font-medium ${freqColor}`}>
                              {result.actual_stops}/{result.expected_stops} stops
                              {result.frequency_status === "compliant"
                                ? " — on track"
                                : result.frequency_status === "warning"
                                  ? " — behind schedule"
                                  : " — critical breach"}
                            </p>
                          </div>
                          <div>
                            <p className="text-muted-foreground mb-0.5">Billing</p>
                            <p className={`font-medium ${billingColor}`}>
                              {result.billing_status === "compliant"
                                ? "Matches agreement"
                                : result.billing_status === "mismatch"
                                  ? "Billing mismatch"
                                  : "No invoices yet"}
                            </p>
                          </div>
                        </div>
                        {(result.frequency_status === "breach" || result.billing_status === "mismatch") && (
                          <p className="text-xs text-muted-foreground bg-destructive/5 border border-destructive/20 rounded p-2">
                            {result.details}
                          </p>
                        )}
                      </div>
                    </div>
                  )
                })}
              </CardContent>
            </Card>
          )}

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
                    onClick={() => setCancelDialogOpen(true)}
                    disabled={isPending}
                    className="w-full text-destructive hover:text-destructive"
                  >
                    Cancel
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
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => setPauseDialogOpen(true)}
                    disabled={isPending}
                    className="w-full"
                  >
                    Pause
                  </Button>
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => setAmendDialogOpen(true)}
                    disabled={isPending}
                    className="w-full"
                  >
                    Amend
                  </Button>
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => setCancelDialogOpen(true)}
                    disabled={isPending}
                    className="w-full text-destructive hover:text-destructive"
                  >
                    Cancel
                  </Button>
                </>
              )}

              {/* Paused actions */}
              {status === "paused" && (
                <>
                  <Button
                    size="sm"
                    onClick={handleResume}
                    disabled={isPending}
                    className="w-full"
                  >
                    {isPending ? "Resuming…" : "Resume"}
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
                    onClick={() => setCancelDialogOpen(true)}
                    disabled={isPending}
                    className="w-full text-destructive hover:text-destructive"
                  >
                    Cancel
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
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={handleRenew}
                    disabled={isPending}
                    className="w-full"
                  >
                    {isPending ? "Creating…" : "Renew"}
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
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={handleRenew}
                    disabled={isPending}
                    className="w-full"
                  >
                    {isPending ? "Creating…" : "Create New from This"}
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

      {/* ── Pause Dialog ─────────────────────────────────────────────────── */}
      <Dialog open={pauseDialogOpen} onOpenChange={setPauseDialogOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Pause Agreement</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-1">
            <p className="text-sm text-muted-foreground">
              Pausing will deactivate all schedule rules and suspend billing for this customer.
              You can resume at any time.
            </p>
            <div className="space-y-2">
              <Label className="text-sm">Reason (optional)</Label>
              <Textarea
                value={pauseReason}
                onChange={(e) => setPauseReason(e.target.value)}
                placeholder="e.g. Customer on vacation until March"
                rows={2}
                className="text-sm"
              />
            </div>
          </div>
          <DialogFooter className="gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() => { setPauseDialogOpen(false); setPauseReason("") }}
              disabled={isPending}
            >
              Cancel
            </Button>
            <Button size="sm" onClick={handlePause} disabled={isPending}>
              {isPending ? "Pausing…" : "Pause Agreement"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ── Cancel Dialog ─────────────────────────────────────────────────── */}
      <Dialog open={cancelDialogOpen} onOpenChange={setCancelDialogOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Cancel Agreement</DialogTitle>
          </DialogHeader>
          <div className="space-y-3 py-1">
            {noticePeriodDays > 0 ? (
              <>
                <p className="text-sm text-muted-foreground">
                  This agreement will be cancelled effective{" "}
                  <strong>{getCancellationEffectiveDate()}</strong> ({noticePeriodDays}-day notice period).
                  Service will continue until that date.
                </p>
                <p className="text-sm text-muted-foreground">
                  Schedule rules and billing will remain active until the effective date.
                </p>
              </>
            ) : (
              <p className="text-sm text-muted-foreground">
                This agreement will be cancelled <strong>immediately</strong>. All schedule rules
                will be deactivated and no further invoices will be generated.
              </p>
            )}
            <div className="rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive">
              This action cannot be undone.
            </div>
          </div>
          <DialogFooter className="gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() => setCancelDialogOpen(false)}
              disabled={isPending}
            >
              Keep Agreement
            </Button>
            <Button
              size="sm"
              variant="destructive"
              onClick={handleCancel}
              disabled={isPending}
            >
              {isPending ? "Cancelling…" : "Cancel Agreement"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ── Amendment Dialog ──────────────────────────────────────────────── */}
      <AmendmentDialog
        open={amendDialogOpen}
        onOpenChange={setAmendDialogOpen}
        agreementNumber={localAgreement.agreement_number}
        termType={localAgreement.term_type}
        poolEntries={localAgreement.poolEntries}
        onSubmit={handleAmend}
        isSubmitting={isAmending}
      />
    </div>
  )
}
