"use client"

import { useState, useMemo } from "react"
import Link from "next/link"
import { useRouter } from "next/navigation"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { ScrollTextIcon } from "lucide-react"

// ─── Types ──────────────────────────────────────────────────────────────────

type AgreementStatus =
  | "draft"
  | "sent"
  | "active"
  | "paused"
  | "expired"
  | "cancelled"
  | "declined"

type ComplianceStatus = "compliant" | "warning" | "breach"

interface PoolEntry {
  id: string
  pricing_model: string
  monthly_amount: string | null
  per_visit_amount: string | null
}

interface Agreement {
  id: string
  agreement_number: string
  status: AgreementStatus
  term_type: string
  start_date: string | null
  end_date: string | null
  auto_renew: boolean | null
  created_at: string | null
  sent_at: string | null
  signed_at: string | null
  customer: {
    id: string
    full_name: string
    email: string
  }
  poolEntries: PoolEntry[]
}

interface CustomerOption {
  id: string
  full_name: string
}

interface ComplianceSummary {
  overall_status: string
  breach_count: number
  warning_count: number
}

interface AgreementManagerProps {
  agreements: Agreement[]
  customers: CustomerOption[]
  /** Map of agreement_id → compliance summary (active agreements only) */
  complianceData?: Record<string, ComplianceSummary>
}

// ─── Status helpers ──────────────────────────────────────────────────────────

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

/** Sort order: drafts first, then sent, then active, then paused, then the rest */
const STATUS_ORDER: Record<AgreementStatus, number> = {
  draft: 0,
  sent: 1,
  active: 2,
  paused: 3,
  expired: 4,
  cancelled: 5,
  declined: 5,
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

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

function formatCurrency(amount: number): string {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: 0,
    maximumFractionDigits: 2,
  }).format(amount)
}

function formatTermType(termType: string): string {
  if (termType === "month_to_month") return "Month-to-Month"
  const match = termType.match(/^(\d+)_month/)
  if (match) return `${match[1]}-Month Term`
  return termType
}

function formatDate(dateStr: string | null | undefined): string | null {
  if (!dateStr) return null
  const d = new Date(dateStr)
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })
}

function isExpiringSoon(endDate: string | null): boolean {
  if (!endDate) return false
  const end = new Date(endDate)
  const now = new Date()
  const diffDays = (end.getTime() - now.getTime()) / (1000 * 60 * 60 * 24)
  return diffDays >= 0 && diffDays <= 30
}

// ─── Component ───────────────────────────────────────────────────────────────

const ALL_STATUSES: AgreementStatus[] = [
  "draft",
  "sent",
  "active",
  "paused",
  "expired",
  "cancelled",
  "declined",
]

// ─── Compliance helpers ───────────────────────────────────────────────────────

const COMPLIANCE_BADGE_CLASS: Record<ComplianceStatus, string> = {
  compliant: "bg-green-500/15 text-green-700 dark:text-green-400",
  warning: "bg-yellow-500/15 text-yellow-700 dark:text-yellow-400",
  breach: "bg-red-500/15 text-red-700 dark:text-red-400",
}

const COMPLIANCE_LABELS: Record<ComplianceStatus, string> = {
  compliant: "Compliant",
  warning: "Warning",
  breach: "Breach",
}

export function AgreementManager({ agreements, customers, complianceData = {} }: AgreementManagerProps) {
  const router = useRouter()

  const [searchQuery, setSearchQuery] = useState("")
  const [statusFilter, setStatusFilter] = useState<"all" | AgreementStatus>("all")
  const [customerFilter, setCustomerFilter] = useState<string>("all")
  const [complianceFilter, setComplianceFilter] = useState<"all" | "issues">("all")

  // Count agreements with compliance issues (warnings or breaches)
  const complianceIssueCount = useMemo(() => {
    return agreements.filter((a) => {
      const c = complianceData[a.id]
      return c && (c.overall_status === "warning" || c.overall_status === "breach")
    }).length
  }, [agreements, complianceData])

  const filtered = useMemo(() => {
    return agreements
      .filter((a) => {
        if (statusFilter !== "all" && a.status !== statusFilter) return false
        if (customerFilter !== "all" && a.customer.id !== customerFilter) return false
        if (complianceFilter === "issues") {
          const c = complianceData[a.id]
          if (!c || c.overall_status === "compliant") return false
        }
        if (searchQuery) {
          const q = searchQuery.toLowerCase()
          const matchesNumber = a.agreement_number.toLowerCase().includes(q)
          const matchesName = a.customer.full_name.toLowerCase().includes(q)
          if (!matchesNumber && !matchesName) return false
        }
        return true
      })
      .sort((a, b) => {
        const orderDiff = STATUS_ORDER[a.status] - STATUS_ORDER[b.status]
        if (orderDiff !== 0) return orderDiff
        // Within same status group: newest first
        const aDate = new Date(a.created_at ?? 0).getTime()
        const bDate = new Date(b.created_at ?? 0).getTime()
        return bDate - aDate
      })
  }, [agreements, statusFilter, customerFilter, searchQuery, complianceFilter, complianceData])

  return (
    <div className="flex flex-col gap-4">
      {/* ── Compliance summary bar ─────────────────────────────────────── */}
      {complianceIssueCount > 0 && (
        <div className="flex items-center gap-2 rounded-lg border border-yellow-500/30 bg-yellow-500/5 px-4 py-2.5 text-sm">
          <span className="text-yellow-700 dark:text-yellow-400 font-medium">
            {complianceIssueCount} {complianceIssueCount === 1 ? "agreement" : "agreements"} with compliance issues
          </span>
          {complianceFilter !== "issues" && (
            <button
              type="button"
              onClick={() => setComplianceFilter("issues")}
              className="ml-auto text-xs text-yellow-700 dark:text-yellow-400 underline hover:no-underline"
            >
              Show only
            </button>
          )}
          {complianceFilter === "issues" && (
            <button
              type="button"
              onClick={() => setComplianceFilter("all")}
              className="ml-auto text-xs text-muted-foreground underline hover:no-underline"
            >
              Clear filter
            </button>
          )}
        </div>
      )}

      {/* ── Action bar ─────────────────────────────────────────────────── */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex flex-1 flex-col gap-2 sm:flex-row sm:items-center">
          {/* Search */}
          <Input
            placeholder="Search by agreement # or customer..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="sm:max-w-xs"
          />

          {/* Status filter */}
          <Select
            value={statusFilter}
            onValueChange={(v) => setStatusFilter(v as "all" | AgreementStatus)}
          >
            <SelectTrigger className="sm:w-40">
              <SelectValue placeholder="All statuses" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All statuses</SelectItem>
              {ALL_STATUSES.map((s) => (
                <SelectItem key={s} value={s}>
                  {STATUS_LABELS[s]}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>

          {/* Customer filter */}
          {customers.length > 0 && (
            <Select
              value={customerFilter}
              onValueChange={(v) => setCustomerFilter(v)}
            >
              <SelectTrigger className="sm:w-48">
                <SelectValue placeholder="All customers" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All customers</SelectItem>
                {customers.map((c) => (
                  <SelectItem key={c.id} value={c.id}>
                    {c.full_name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}

          {/* Compliance filter */}
          {Object.keys(complianceData).length > 0 && (
            <Select
              value={complianceFilter}
              onValueChange={(v) => setComplianceFilter(v as "all" | "issues")}
            >
              <SelectTrigger className="sm:w-44">
                <SelectValue placeholder="All agreements" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All agreements</SelectItem>
                <SelectItem value="issues">Compliance issues only</SelectItem>
              </SelectContent>
            </Select>
          )}
        </div>

        {/* New Agreement button */}
        <Button asChild size="sm" variant="outline">
          <Link href="/agreements/new">New Agreement</Link>
        </Button>
      </div>

      {/* ── Agreement list ─────────────────────────────────────────────── */}
      {filtered.length === 0 ? (
        <div className="rounded-lg border border-dashed p-10 text-center">
          <ScrollTextIcon className="mx-auto mb-3 h-8 w-8 text-muted-foreground/50" />
          <p className="text-sm text-muted-foreground italic">No agreements found</p>
          {agreements.length === 0 && (
            <div className="mt-3">
              <Button asChild size="sm" variant="outline">
                <Link href="/agreements/new">Create your first agreement</Link>
              </Button>
            </div>
          )}
        </div>
      ) : (
        <div className="flex flex-col gap-2">
          {filtered.map((agreement) => {
            const monthly = computeMonthlyTotal(agreement.poolEntries)
            const poolCount = agreement.poolEntries.length
            const expiringSoon =
              agreement.status === "active" && isExpiringSoon(agreement.end_date)
            const compliance = complianceData[agreement.id]
            const complianceStatus = compliance?.overall_status as ComplianceStatus | undefined

            // Determine most relevant date to display
            let dateLabel = ""
            let dateValue = ""
            if (agreement.signed_at) {
              dateLabel = "Signed"
              dateValue = formatDate(agreement.signed_at) ?? ""
            } else if (agreement.sent_at) {
              dateLabel = "Sent"
              dateValue = formatDate(agreement.sent_at) ?? ""
            } else if (agreement.created_at) {
              dateLabel = "Created"
              dateValue = formatDate(agreement.created_at) ?? ""
            }

            return (
              <div
                key={agreement.id}
                onClick={() => router.push(`/agreements/${agreement.id}`)}
                className="group flex cursor-pointer flex-col gap-2 rounded-lg border border-border bg-card p-4 transition-colors hover:bg-accent/40 sm:flex-row sm:items-center sm:gap-4"
                role="button"
                tabIndex={0}
                onKeyDown={(e) => {
                  if (e.key === "Enter" || e.key === " ") {
                    router.push(`/agreements/${agreement.id}`)
                  }
                }}
                aria-label={`View agreement ${agreement.agreement_number}`}
              >
                {/* Agreement number + status */}
                <div className="flex items-center gap-2 sm:min-w-32">
                  <span className="font-medium tabular-nums text-sm">
                    {agreement.agreement_number}
                  </span>
                  <Badge
                    className={`text-xs font-medium ${STATUS_BADGE_CLASS[agreement.status]}`}
                    variant="outline"
                  >
                    {STATUS_LABELS[agreement.status]}
                  </Badge>
                  {expiringSoon && (
                    <Badge
                      className="text-xs font-medium bg-orange-500/15 text-orange-700 dark:text-orange-400"
                      variant="outline"
                    >
                      Expires soon
                    </Badge>
                  )}
                  {complianceStatus && complianceStatus !== "compliant" && (
                    <Badge
                      className={`text-xs font-medium ${COMPLIANCE_BADGE_CLASS[complianceStatus]}`}
                      variant="outline"
                    >
                      {COMPLIANCE_LABELS[complianceStatus]}
                    </Badge>
                  )}
                </div>

                {/* Customer */}
                <div className="flex-1">
                  <p className="text-sm font-medium">{agreement.customer.full_name}</p>
                  <p className="text-xs text-muted-foreground">
                    {formatTermType(agreement.term_type)}
                    {agreement.auto_renew ? " · Auto-renew" : ""}
                  </p>
                </div>

                {/* Pool count */}
                <div className="text-sm text-muted-foreground sm:min-w-16">
                  {poolCount} {poolCount === 1 ? "pool" : "pools"}
                </div>

                {/* Monthly total */}
                <div className="text-sm font-medium sm:min-w-24 sm:text-right">
                  {monthly > 0 ? (
                    <span>{formatCurrency(monthly)}<span className="text-xs text-muted-foreground font-normal">/mo</span></span>
                  ) : (
                    <span className="text-muted-foreground">—</span>
                  )}
                </div>

                {/* Date */}
                {dateLabel && (
                  <div className="text-xs text-muted-foreground sm:min-w-28 sm:text-right">
                    {dateLabel} {dateValue}
                  </div>
                )}
              </div>
            )
          })}
        </div>
      )}

      {/* ── Result count ───────────────────────────────────────────────── */}
      {filtered.length > 0 && (
        <p className="text-xs text-muted-foreground">
          {filtered.length} {filtered.length === 1 ? "agreement" : "agreements"}
          {agreements.length !== filtered.length && ` of ${agreements.length} total`}
        </p>
      )}
    </div>
  )
}
