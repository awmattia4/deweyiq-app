import type { Metadata } from "next"
import { redirect, notFound } from "next/navigation"
import Link from "next/link"
import { getCurrentUser } from "@/actions/auth"
import { resolveCustomerId } from "@/actions/portal-data"
import { getPortalProjectDetail, getPortalProjectFinancials } from "@/actions/projects-portal"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { cn } from "@/lib/utils"

export const metadata: Metadata = {
  title: "Project Financials",
}

export const dynamic = "force-dynamic"

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function formatCurrency(amount: number): string {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: 2,
  }).format(amount)
}

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------

export default async function PortalProjectFinancialsPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { id } = await params

  const user = await getCurrentUser()
  if (!user) redirect("/portal/login")
  if (user.role !== "customer") redirect("/dashboard")

  const customerId = await resolveCustomerId(user.org_id, user.email)
  if (!customerId) {
    return (
      <div className="flex flex-col gap-6">
        <h1 className="text-2xl font-bold tracking-tight">Project Financials</h1>
        <p className="text-sm text-muted-foreground italic">
          Your account is being set up. Please check back shortly.
        </p>
      </div>
    )
  }

  const [projectResult, financialsResult] = await Promise.all([
    getPortalProjectDetail(user.org_id, customerId, id),
    getPortalProjectFinancials(user.org_id, customerId, id),
  ])

  if ("error" in projectResult || "error" in financialsResult) {
    notFound()
  }

  const project = projectResult
  const fin = financialsResult

  return (
    <div className="flex flex-col gap-6">
      {/* Breadcrumb */}
      <nav className="text-sm text-muted-foreground">
        <Link href="/portal/projects" className="hover:text-foreground transition-colors">
          My Projects
        </Link>
        <span className="mx-1.5">/</span>
        <Link href={`/portal/projects/${id}`} className="hover:text-foreground transition-colors">
          {project.name}
        </Link>
        <span className="mx-1.5">/</span>
        <span className="text-foreground">Financials</span>
      </nav>

      <h1 className="text-2xl font-bold tracking-tight">Project Financials</h1>

      {/* Contract summary */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
        <Card>
          <CardContent className="p-4">
            <div className="text-xs text-muted-foreground mb-1">Original Contract</div>
            <div className="text-xl font-bold">{formatCurrency(fin.contract_amount)}</div>
          </CardContent>
        </Card>
        {fin.change_order_total !== 0 && (
          <Card>
            <CardContent className="p-4">
              <div className="text-xs text-muted-foreground mb-1">Change Orders</div>
              <div className={cn("text-xl font-bold", fin.change_order_total >= 0 ? "text-amber-500" : "text-emerald-500")}>
                {fin.change_order_total >= 0 ? "+" : ""}{formatCurrency(fin.change_order_total)}
              </div>
            </CardContent>
          </Card>
        )}
        <Card>
          <CardContent className="p-4">
            <div className="text-xs text-muted-foreground mb-1">Current Contract</div>
            <div className="text-xl font-bold">{formatCurrency(fin.current_contract)}</div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <div className="text-xs text-muted-foreground mb-1">Paid to Date</div>
            <div className="text-xl font-bold text-emerald-500">{formatCurrency(fin.total_paid)}</div>
          </CardContent>
        </Card>
        {fin.retainage_held > 0 && (
          <Card>
            <CardContent className="p-4">
              <div className="text-xs text-muted-foreground mb-1">Retainage Held</div>
              <div className="text-xl font-bold">{formatCurrency(fin.retainage_held)}</div>
              <div className="text-xs text-muted-foreground mt-1">Released on final completion</div>
            </CardContent>
          </Card>
        )}
        <Card>
          <CardContent className="p-4">
            <div className="text-xs text-muted-foreground mb-1">Balance Due</div>
            <div className={cn("text-xl font-bold", fin.balance_due > 0 ? "text-amber-500" : "text-emerald-500")}>
              {formatCurrency(fin.balance_due)}
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Payment schedule */}
      {fin.payments.length > 0 && (
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base">Payment Schedule</CardTitle>
          </CardHeader>
          <CardContent className="p-0">
            <div className="divide-y divide-border/40">
              {fin.payments.map((payment) => (
                <div key={payment.id} className="flex items-center justify-between gap-3 px-5 py-3">
                  <div className="flex-1 min-w-0">
                    <div className="text-sm font-medium">{payment.name}</div>
                    {payment.due_date && (
                      <div className="text-xs text-muted-foreground mt-0.5">
                        Due: {new Date(payment.due_date + "T12:00:00").toLocaleDateString("en-US", {
                          month: "short",
                          day: "numeric",
                          year: "numeric",
                        })}
                      </div>
                    )}
                    {payment.retainage_pct && (
                      <div className="text-xs text-muted-foreground">
                        Retainage: {payment.retainage_pct.toFixed(0)}%
                      </div>
                    )}
                    {payment.invoice_number && (
                      <div className="text-xs text-muted-foreground">
                        Invoice #{payment.invoice_number}
                      </div>
                    )}
                  </div>
                  <div className="flex items-center gap-3 shrink-0">
                    <span className="text-sm font-semibold">{formatCurrency(payment.amount)}</span>
                    <Badge
                      variant={
                        payment.status === "paid"
                          ? "default"
                          : payment.status === "invoiced"
                          ? "secondary"
                          : "outline"
                      }
                      className="text-[10px] px-1.5"
                    >
                      {payment.status === "paid"
                        ? "Paid"
                        : payment.status === "invoiced"
                        ? "Invoiced"
                        : "Pending"}
                    </Badge>
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Retainage note */}
      {fin.retainage_held > 0 && (
        <div className="rounded-lg border border-border/60 bg-muted/30 p-4">
          <p className="text-sm text-muted-foreground">
            <strong className="text-foreground">About retainage:</strong> {formatCurrency(fin.retainage_held)} is
            currently held as retainage. This amount will be released upon final project completion
            and your sign-off of the punch list.
          </p>
        </div>
      )}
    </div>
  )
}
