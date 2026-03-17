import { notFound, redirect } from "next/navigation"
import Link from "next/link"
import { getCurrentUser } from "@/actions/auth"
import { getProjectDetail } from "@/actions/projects"
import {
  getProjectProfitability,
  getRetainageSummary,
  getProjectInvoices,
} from "@/actions/projects-billing"
import { ProfitabilityGauge } from "@/components/projects/profitability-gauge"
import { RetainageTracker } from "@/components/projects/retainage-tracker"
import { ProjectInvoiceList } from "@/components/projects/project-invoice-list"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"

interface FinancialsPageProps {
  params: Promise<{ id: string }>
}

function formatCurrency(amount: number): string {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(amount)
}

function formatCurrencyExact(amount: number): string {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: 2,
  }).format(amount)
}

/**
 * FinancialsPage — Server component for /projects/[id]/financials.
 *
 * Fetches and renders all financial data for a project:
 * - Profitability summary (revenue, costs, margin)
 * - Budget vs actual per category
 * - Retainage tracker
 * - Change order impact on contract
 * - All project invoices
 * - At-risk warning banner
 *
 * Role guard: owner and office only.
 */
export default async function FinancialsPage({ params }: FinancialsPageProps) {
  const user = await getCurrentUser()

  if (!user) redirect("/login")
  if (user.role === "tech") redirect("/routes")
  if (user.role === "customer") redirect("/portal")

  const { id } = await params

  const [project, profitabilityResult, retainageResult, invoicesResult] = await Promise.all([
    getProjectDetail(id),
    getProjectProfitability(id),
    getRetainageSummary(id),
    getProjectInvoices(id),
  ])

  if (!project) notFound()

  const profitability = "error" in profitabilityResult ? null : profitabilityResult
  const retainage = "error" in retainageResult ? null : retainageResult
  const projectInvoices = "error" in invoicesResult ? [] : invoicesResult

  const contractAmount = parseFloat(project.contract_amount ?? "0")
  const retainagePct = parseFloat(project.retainage_pct ?? "10")

  // Calculate total billed and paid from invoices
  const totalBilled = projectInvoices
    .filter((inv) => inv.status !== "void")
    .reduce((sum, inv) => sum + parseFloat(inv.total), 0)
  const totalPaid = projectInvoices
    .filter((inv) => inv.status === "paid")
    .reduce((sum, inv) => sum + parseFloat(inv.total), 0)

  // Show at-risk banner prominently
  const isAtRisk = profitability?.isAtRisk ?? false

  return (
    <div className="flex flex-col min-h-0">
      {/* Page header */}
      <div className="flex items-center gap-4 px-6 pt-5 pb-4 border-b border-border shrink-0">
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <Link href="/projects" className="hover:text-foreground transition-colors">
            Projects
          </Link>
          <span>/</span>
          <Link href={`/projects/${id}`} className="hover:text-foreground transition-colors">
            {project.project_number ?? "Project"}
          </Link>
          <span>/</span>
          <span className="text-foreground">Financials</span>
        </div>
      </div>

      {/* Tab bar — mirroring project detail page navigation */}
      <div className="flex border-b border-border px-6 shrink-0">
        {[
          { label: "Overview", href: `/projects/${id}` },
          { label: "Phases", href: `/projects/${id}?tab=phases` },
          { label: "Timeline", href: `/projects/${id}/timeline` },
          { label: "Materials", href: `/projects/${id}/materials` },
          { label: "Financials", href: `/projects/${id}/financials`, active: true },
          { label: "Documents", href: `/projects/${id}/documents` },
        ].map((tab) => (
          <Link
            key={tab.href}
            href={tab.href}
            className={
              tab.active
                ? "px-4 py-2.5 text-sm font-medium transition-colors border-b-2 -mb-px border-primary text-foreground"
                : "px-4 py-2.5 text-sm font-medium transition-colors border-b-2 -mb-px border-transparent text-muted-foreground hover:text-foreground hover:border-border"
            }
          >
            {tab.label}
          </Link>
        ))}
      </div>

      <div className="flex-1 overflow-auto p-6">
        <div className="flex flex-col gap-6 max-w-6xl">

          {/* At-risk warning banner */}
          {isAtRisk && (
            <div className="flex items-start gap-3 p-4 rounded-lg bg-destructive/10 border border-destructive/20">
              <div className="flex flex-col gap-1">
                <p className="text-sm font-semibold text-destructive">Project margin is below threshold</p>
                <p className="text-sm text-muted-foreground">
                  Current margin of {profitability?.margin.toFixed(1)}% is below the configured floor of {profitability?.marginFloor}%.
                  Review costs to identify overruns before proceeding.
                </p>
              </div>
            </div>
          )}

          {/* Profitability summary cards */}
          <section>
            <h2 className="text-base font-semibold mb-3">Financial Overview</h2>
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
              <Card>
                <CardContent className="p-4">
                  <p className="text-xs text-muted-foreground uppercase tracking-wide mb-1">Contract Value</p>
                  <p className="text-xl font-bold tabular-nums">
                    {contractAmount > 0 ? formatCurrency(contractAmount) : <span className="text-muted-foreground">—</span>}
                  </p>
                </CardContent>
              </Card>
              <Card>
                <CardContent className="p-4">
                  <p className="text-xs text-muted-foreground uppercase tracking-wide mb-1">Total Costs</p>
                  <p className="text-xl font-bold tabular-nums">
                    {profitability ? formatCurrency(profitability.totalCosts) : <span className="text-muted-foreground">—</span>}
                  </p>
                </CardContent>
              </Card>
              <Card>
                <CardContent className="p-4">
                  <p className="text-xs text-muted-foreground uppercase tracking-wide mb-1">Total Billed</p>
                  <p className="text-xl font-bold tabular-nums">{formatCurrency(totalBilled)}</p>
                  <p className="text-xs text-muted-foreground mt-0.5">Paid: {formatCurrency(totalPaid)}</p>
                </CardContent>
              </Card>
              <Card>
                <CardContent className="p-4">
                  <p className="text-xs text-muted-foreground uppercase tracking-wide mb-1">Gross Margin</p>
                  <p className={`text-xl font-bold tabular-nums ${
                    profitability && profitability.margin < (profitability.marginFloor)
                      ? "text-destructive"
                      : profitability && profitability.margin < (profitability.marginFloor + 5)
                      ? "text-amber-500"
                      : "text-emerald-500"
                  }`}>
                    {profitability ? `${profitability.margin.toFixed(1)}%` : <span className="text-muted-foreground">—</span>}
                  </p>
                </CardContent>
              </Card>
            </div>
          </section>

          {/* Profitability gauge */}
          {profitability && (
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-sm font-semibold">Profitability</CardTitle>
              </CardHeader>
              <CardContent>
                <ProfitabilityGauge
                  margin={profitability.margin}
                  projectedMargin={profitability.projectedMargin}
                  marginFloor={profitability.marginFloor}
                  isAtRisk={profitability.isAtRisk}
                />
              </CardContent>
            </Card>
          )}

          {/* Budget vs Actual */}
          {profitability && (
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-sm font-semibold">Budget vs Actual by Category</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="rounded-lg border border-border overflow-hidden">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b border-border bg-muted/30">
                        <th className="text-left px-3 py-2 text-xs font-medium text-muted-foreground">Category</th>
                        <th className="text-right px-3 py-2 text-xs font-medium text-muted-foreground">Actual</th>
                        <th className="text-right px-3 py-2 text-xs font-medium text-muted-foreground">% of Revenue</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-border/50">
                      {[
                        { label: "Materials", value: profitability.materialCosts },
                        { label: "Labor", value: profitability.laborCosts },
                        { label: "Subcontractors", value: profitability.subCosts },
                        { label: "Permits & Fees", value: profitability.permitCosts },
                      ].map((row) => {
                        const pctOfRevenue = profitability.revenue > 0
                          ? (row.value / profitability.revenue) * 100
                          : 0

                        return (
                          <tr key={row.label} className="hover:bg-muted/20 transition-colors">
                            <td className="px-3 py-2.5">{row.label}</td>
                            <td className="px-3 py-2.5 text-right tabular-nums">
                              {row.value > 0 ? formatCurrencyExact(row.value) : <span className="text-muted-foreground">$0.00</span>}
                            </td>
                            <td className="px-3 py-2.5 text-right tabular-nums text-muted-foreground">
                              {pctOfRevenue > 0 ? `${pctOfRevenue.toFixed(1)}%` : "—"}
                            </td>
                          </tr>
                        )
                      })}
                    </tbody>
                    <tfoot>
                      <tr className="border-t border-border bg-muted/30">
                        <td className="px-3 py-2 text-xs font-semibold">Total Costs</td>
                        <td className="px-3 py-2 text-right tabular-nums font-semibold">
                          {formatCurrencyExact(profitability.totalCosts)}
                        </td>
                        <td className="px-3 py-2 text-right tabular-nums font-semibold text-muted-foreground">
                          {profitability.revenue > 0
                            ? `${((profitability.totalCosts / profitability.revenue) * 100).toFixed(1)}%`
                            : "—"}
                        </td>
                      </tr>
                    </tfoot>
                  </table>
                </div>
              </CardContent>
            </Card>
          )}

          {/* Retainage tracker */}
          {retainage && (
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-sm font-semibold">Retainage</CardTitle>
              </CardHeader>
              <CardContent>
                <RetainageTracker
                  summary={retainage}
                  retainagePct={retainagePct}
                  estimatedCompletionDate={project.estimated_completion_date ?? null}
                />
              </CardContent>
            </Card>
          )}

          {/* Invoice list */}
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-sm font-semibold">Project Invoices</CardTitle>
            </CardHeader>
            <CardContent>
              <ProjectInvoiceList invoices={projectInvoices} />
            </CardContent>
          </Card>

        </div>
      </div>
    </div>
  )
}
