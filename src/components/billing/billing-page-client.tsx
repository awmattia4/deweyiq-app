"use client"

/**
 * billing-page-client.tsx — Client component for the Billing page.
 *
 * Tab structure:
 *   Invoices   — insights, generate invoices, invoice list (existing)
 *   Collections — overdue accounts by severity bucket (owner only)
 *   Payment Plans — installment schedule management
 *   Credits     — customer credit issuance and application
 */

import { useState, useTransition } from "react"
import Link from "next/link"
import {
  AlertTriangleIcon,
  CheckCircleIcon,
  ClockIcon,
  FileTextIcon,
  Loader2Icon,
  SparklesIcon,
  UsersIcon,
  WrenchIcon,
} from "lucide-react"
import { cn } from "@/lib/utils"
import { toast } from "sonner"
import { generateAllInvoices } from "@/actions/billing"
import { InvoiceList } from "@/components/work-orders/invoice-list"
import { CollectionsDashboard } from "@/components/billing/collections-dashboard"
import { PaymentPlans } from "@/components/billing/payment-plans"
import { CustomerCredits } from "@/components/billing/customer-credits"
import type { InvoiceSummary, BillingInsights } from "@/actions/invoices"
import type {
  CollectionsDashboardResult,
  PaymentPlanRow,
  CustomerCreditRow,
} from "@/actions/payment-reconciliation"

// ─── Props ────────────────────────────────────────────────────────────────────

interface BillingPageClientProps {
  invoices: InvoiceSummary[]
  customerPhones: Record<string, string | null>
  isOwner: boolean
  insights: BillingInsights | null
  collectionsDashboard: CollectionsDashboardResult | null
  paymentPlans: PaymentPlanRow[]
  credits: CustomerCreditRow[]
  customers: Array<{ id: string; full_name: string }>
  openInvoicesForPlans: Array<{
    id: string
    invoice_number: string | null
    total: string
    customerName: string
  }>
}

// ─── Tab definition ───────────────────────────────────────────────────────────

type TabKey = "invoices" | "collections" | "payment_plans" | "credits"

const TABS: Array<{ key: TabKey; label: string; ownerOnly?: boolean }> = [
  { key: "invoices", label: "Invoices" },
  { key: "collections", label: "Collections", ownerOnly: true },
  { key: "payment_plans", label: "Payment Plans" },
  { key: "credits", label: "Credits" },
]

// ─── Component ────────────────────────────────────────────────────────────────

export function BillingPageClient({
  invoices,
  customerPhones,
  isOwner,
  insights,
  collectionsDashboard,
  paymentPlans,
  credits,
  customers,
  openInvoicesForPlans,
}: BillingPageClientProps) {
  const [activeTab, setActiveTab] = useState<TabKey>("invoices")

  // Default billing period: 1st to last day of previous month
  const now = new Date()
  const prevMonthEnd = new Date(now.getFullYear(), now.getMonth(), 0)
  const prevMonthStart = new Date(prevMonthEnd.getFullYear(), prevMonthEnd.getMonth(), 1)

  const [periodStart, setPeriodStart] = useState(formatDateInput(prevMonthStart))
  const [periodEnd, setPeriodEnd] = useState(formatDateInput(prevMonthEnd))
  const [isGenerating, startTransition] = useTransition()

  function handleGenerate() {
    if (!periodStart || !periodEnd) {
      toast.error("Please select a billing period")
      return
    }
    if (periodStart > periodEnd) {
      toast.error("Start date must be before end date")
      return
    }

    startTransition(async () => {
      const result = await generateAllInvoices(periodStart, periodEnd)

      if (result.errors.length > 0) {
        toast.error(
          `${result.created} created, ${result.errors.length} error${result.errors.length !== 1 ? "s" : ""}`,
          { description: result.errors[0] }
        )
      } else if (result.created === 0 && result.skipped > 0) {
        toast.info(
          `All ${result.skipped} customer${result.skipped !== 1 ? "s" : ""} already invoiced for this period`
        )
      } else if (result.created === 0) {
        toast.info("No customers with billing models found")
      } else {
        const msg = `${result.created} invoice${result.created !== 1 ? "s" : ""} generated`
        const skipped =
          result.skipped > 0 ? ` (${result.skipped} already invoiced)` : ""
        toast.success(msg + skipped)
      }
    })
  }

  // Determine if there are action items
  const hasActionItems =
    insights &&
    (insights.draftsReadyToSend > 0 ||
      insights.overdueCount > 0 ||
      insights.uninvoicedWoCount > 0 ||
      insights.customersNoBillingModel > 0)

  // Visible tabs (hide Collections if not owner)
  const visibleTabs = TABS.filter((t) => !t.ownerOnly || isOwner)

  // Collections badge: number of 90+ day accounts
  const severe90Count = collectionsDashboard?.customers.filter(
    (c) => c.bucket === "90+"
  ).length ?? 0

  return (
    <div className="flex flex-col gap-6">
      {/* ── Tab navigation ──────────────────────────────────────────────── */}
      <div className="flex gap-1 border-b border-border">
        {visibleTabs.map((tab) => {
          const isActive = activeTab === tab.key
          const badge =
            tab.key === "collections" && severe90Count > 0
              ? severe90Count
              : tab.key === "credits"
                ? credits.filter((c) => c.status === "available").length
                : tab.key === "payment_plans"
                  ? paymentPlans.length
                  : 0

          return (
            <button
              key={tab.key}
              type="button"
              onClick={() => setActiveTab(tab.key)}
              className={cn(
                "relative px-4 py-2.5 text-sm font-medium transition-colors cursor-pointer",
                "border-b-2 -mb-px",
                isActive
                  ? "border-primary text-foreground"
                  : "border-transparent text-muted-foreground hover:text-foreground"
              )}
            >
              {tab.label}
              {badge > 0 && (
                <span
                  className={cn(
                    "ml-1.5 inline-flex items-center justify-center rounded-full text-xs font-medium",
                    "h-4 min-w-4 px-1",
                    tab.key === "collections" && severe90Count > 0
                      ? "bg-red-500/20 text-red-400"
                      : "bg-muted text-muted-foreground"
                  )}
                >
                  {badge}
                </span>
              )}
            </button>
          )
        })}
      </div>

      {/* ── Invoices tab ─────────────────────────────────────────────────── */}
      {activeTab === "invoices" && (
        <div className="flex flex-col gap-6">
          {/* Billing Insights */}
          {insights && (
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
              <InsightCard
                label="Drafts"
                value={insights.draftsReadyToSend}
                subtitle={
                  insights.draftsReadyToSend > 0
                    ? `$${fmtMoney(insights.draftsTotal)} to send`
                    : "None pending"
                }
                icon={<FileTextIcon className="h-4 w-4" />}
                variant={insights.draftsReadyToSend > 0 ? "warning" : "neutral"}
              />
              <InsightCard
                label="Overdue"
                value={insights.overdueCount}
                subtitle={
                  insights.overdueCount > 0
                    ? `$${fmtMoney(insights.overdueTotal)} past due`
                    : "All current"
                }
                icon={<AlertTriangleIcon className="h-4 w-4" />}
                variant={insights.overdueCount > 0 ? "danger" : "neutral"}
              />
              <InsightCard
                label="Outstanding"
                value={`$${fmtMoney(insights.outstandingTotal)}`}
                subtitle={
                  insights.outstandingCount > 0
                    ? `${insights.outstandingCount} invoice${insights.outstandingCount !== 1 ? "s" : ""} unpaid`
                    : "All paid up"
                }
                icon={<ClockIcon className="h-4 w-4" />}
                variant={insights.outstandingCount > 0 ? "info" : "neutral"}
              />
              <InsightCard
                label="Paid This Month"
                value={`$${fmtMoney(insights.paidThisMonthTotal)}`}
                subtitle={
                  insights.paidThisMonth > 0
                    ? `${insights.paidThisMonth} invoice${insights.paidThisMonth !== 1 ? "s" : ""}`
                    : "No payments yet"
                }
                icon={<CheckCircleIcon className="h-4 w-4" />}
                variant="success"
              />
            </div>
          )}

          {/* Action Items */}
          {hasActionItems && (
            <div className="rounded-lg border border-border bg-card p-4">
              <h2 className="text-sm font-semibold mb-3">Needs Attention</h2>
              <div className="flex flex-col gap-2">
                {insights!.uninvoicedWoCount > 0 && (
                  <ActionItem
                    icon={<WrenchIcon className="h-3.5 w-3.5" />}
                    variant="warning"
                  >
                    <span className="font-medium">{insights!.uninvoicedWoCount}</span>{" "}
                    completed work order{insights!.uninvoicedWoCount !== 1 ? "s" : ""}{" "}
                    {insights!.uninvoicedWoCount !== 1 ? "need" : "needs"} invoicing.{" "}
                    <Link
                      href="/work-orders"
                      className="underline underline-offset-2 hover:text-foreground transition-colors"
                    >
                      View
                    </Link>
                  </ActionItem>
                )}
                {insights!.draftsReadyToSend > 0 && (
                  <ActionItem
                    icon={<FileTextIcon className="h-3.5 w-3.5" />}
                    variant="info"
                  >
                    <span className="font-medium">{insights!.draftsReadyToSend}</span>{" "}
                    draft invoice{insights!.draftsReadyToSend !== 1 ? "s" : ""} ready
                    to review and send ($
                    <span className="font-medium">{fmtMoney(insights!.draftsTotal)}</span>).
                  </ActionItem>
                )}
                {insights!.overdueCount > 0 && (
                  <ActionItem
                    icon={<AlertTriangleIcon className="h-3.5 w-3.5" />}
                    variant="danger"
                  >
                    <span className="font-medium">{insights!.overdueCount}</span>{" "}
                    overdue invoice{insights!.overdueCount !== 1 ? "s" : ""} totaling $
                    <span className="font-medium">{fmtMoney(insights!.overdueTotal)}</span>.{" "}
                    <button
                      type="button"
                      onClick={() => setActiveTab("collections")}
                      className="underline underline-offset-2 hover:text-foreground transition-colors cursor-pointer"
                    >
                      View Collections
                    </button>
                  </ActionItem>
                )}
                {insights!.customersNoBillingModel > 0 && (
                  <ActionItem
                    icon={<UsersIcon className="h-3.5 w-3.5" />}
                    variant="muted"
                  >
                    <span className="font-medium">
                      {insights!.customersNoBillingModel}
                    </span>{" "}
                    active customer{insights!.customersNoBillingModel !== 1 ? "s" : ""}{" "}
                    {insights!.customersNoBillingModel !== 1 ? "don't" : "doesn't"} have a
                    billing model set.{" "}
                    <Link
                      href="/customers"
                      className="underline underline-offset-2 hover:text-foreground transition-colors"
                    >
                      Customers
                    </Link>
                  </ActionItem>
                )}
              </div>
            </div>
          )}

          {/* Generate Invoices */}
          {isOwner && (
            <div className="rounded-lg border border-border bg-card p-5">
              <h2 className="text-sm font-semibold mb-3">Generate Invoices</h2>
              <p className="text-xs text-muted-foreground mb-4">
                Generate invoices for all customers with a billing model set.
                Customers already invoiced for this period will be skipped.
              </p>
              <div className="flex flex-wrap items-end gap-3">
                <div className="flex flex-col gap-1">
                  <label className="text-xs text-muted-foreground">Period Start</label>
                  <input
                    type="date"
                    value={periodStart}
                    onChange={(e) => setPeriodStart(e.target.value)}
                    className="rounded-md border border-input bg-background px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-ring"
                  />
                </div>
                <div className="flex flex-col gap-1">
                  <label className="text-xs text-muted-foreground">Period End</label>
                  <input
                    type="date"
                    value={periodEnd}
                    onChange={(e) => setPeriodEnd(e.target.value)}
                    className="rounded-md border border-input bg-background px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-ring"
                  />
                </div>
                <button
                  type="button"
                  onClick={handleGenerate}
                  disabled={isGenerating}
                  className="flex items-center gap-2 rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90 transition-colors disabled:opacity-50 cursor-pointer"
                >
                  {isGenerating ? (
                    <Loader2Icon className="h-4 w-4 animate-spin" />
                  ) : (
                    <SparklesIcon className="h-4 w-4" />
                  )}
                  Generate Invoices
                </button>
              </div>
            </div>
          )}

          {/* Invoice List */}
          <InvoiceList invoices={invoices} customerPhones={customerPhones} />
        </div>
      )}

      {/* ── Collections tab ──────────────────────────────────────────────── */}
      {activeTab === "collections" && isOwner && (
        <div className="flex flex-col gap-4">
          <div>
            <h2 className="text-base font-semibold">Collections</h2>
            <p className="text-sm text-muted-foreground mt-0.5">
              Overdue accounts sorted by severity. Take action on the most urgent accounts first.
            </p>
          </div>
          {collectionsDashboard ? (
            <CollectionsDashboard data={collectionsDashboard} />
          ) : (
            <div className="rounded-lg border border-border bg-card p-8 text-center">
              <p className="text-sm text-muted-foreground italic">
                Collections data not available.
              </p>
            </div>
          )}
        </div>
      )}

      {/* ── Payment Plans tab ────────────────────────────────────────────── */}
      {activeTab === "payment_plans" && (
        <div className="flex flex-col gap-4">
          <div>
            <h2 className="text-base font-semibold">Payment Plans</h2>
            <p className="text-sm text-muted-foreground mt-0.5">
              Split invoices into manageable installment schedules for customers.
            </p>
          </div>
          <PaymentPlans
            plans={paymentPlans}
            openInvoices={openInvoicesForPlans}
            isOwner={isOwner}
          />
        </div>
      )}

      {/* ── Credits tab ──────────────────────────────────────────────────── */}
      {activeTab === "credits" && (
        <div className="flex flex-col gap-4">
          <div>
            <h2 className="text-base font-semibold">Customer Credits</h2>
            <p className="text-sm text-muted-foreground mt-0.5">
              Issue credits to customers and apply them against open invoices.
            </p>
          </div>
          <CustomerCredits
            credits={credits}
            customers={customers}
            isOwner={isOwner}
          />
        </div>
      )}
    </div>
  )
}

// ─── Sub-components ──────────────────────────────────────────────────────────

type InsightVariant = "neutral" | "warning" | "danger" | "info" | "success"

const VARIANT_STYLES: Record<InsightVariant, string> = {
  neutral: "text-muted-foreground",
  warning: "text-amber-400",
  danger: "text-red-400",
  info: "text-blue-400",
  success: "text-emerald-400",
}

function InsightCard({
  label,
  value,
  subtitle,
  icon,
  variant = "neutral",
}: {
  label: string
  value: string | number
  subtitle: string
  icon: React.ReactNode
  variant?: InsightVariant
}) {
  return (
    <div className="rounded-lg border border-border bg-card p-4">
      <div className="flex items-center gap-2 mb-2">
        <span className={cn("shrink-0", VARIANT_STYLES[variant])}>{icon}</span>
        <span className="text-xs text-muted-foreground">{label}</span>
      </div>
      <p className="text-xl font-bold tracking-tight">{value}</p>
      <p className="text-xs text-muted-foreground mt-0.5">{subtitle}</p>
    </div>
  )
}

const ACTION_VARIANT_STYLES: Record<string, string> = {
  warning: "text-amber-400",
  danger: "text-red-400",
  info: "text-blue-400",
  muted: "text-muted-foreground",
}

function ActionItem({
  children,
  icon,
  variant = "muted",
}: {
  children: React.ReactNode
  icon: React.ReactNode
  variant?: string
}) {
  return (
    <div className="flex items-start gap-2.5 text-sm text-muted-foreground">
      <span
        className={cn(
          "shrink-0 mt-0.5",
          ACTION_VARIANT_STYLES[variant] ?? ACTION_VARIANT_STYLES.muted
        )}
      >
        {icon}
      </span>
      <span>{children}</span>
    </div>
  )
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function formatDateInput(d: Date): string {
  const year = d.getFullYear()
  const month = String(d.getMonth() + 1).padStart(2, "0")
  const day = String(d.getDate()).padStart(2, "0")
  return `${year}-${month}-${day}`
}

function fmtMoney(amount: string | number): string {
  const n = typeof amount === "number" ? amount : parseFloat(amount) || 0
  return n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })
}
