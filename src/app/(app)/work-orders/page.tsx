import type { Metadata } from "next"
import { redirect } from "next/navigation"
import { WrenchIcon } from "lucide-react"
import { getCurrentUser } from "@/actions/auth"
import { getWorkOrders } from "@/actions/work-orders"
import { getWoTemplates } from "@/actions/parts-catalog"
import { getInvoices } from "@/actions/invoices"
import { WoList } from "@/components/work-orders/wo-list"
import { WoCreateDialog } from "@/components/work-orders/wo-create-dialog"
import { WoInvoicesTabShell } from "@/components/work-orders/wo-invoices-tab-shell"

export const metadata: Metadata = {
  title: "Work Orders",
}

/**
 * WorkOrdersPage — Server component listing all open work orders.
 *
 * Role guard: owner and office only. Techs are redirected to /routes.
 * Fetches WOs, WO templates, and invoices in parallel.
 *
 * WoList handles WO client-side filtering.
 * InvoiceList handles invoice client-side filtering.
 * WoInvoicesTabShell (client) manages the WOs | Invoices tab toggle.
 */
export default async function WorkOrdersPage() {
  const user = await getCurrentUser()

  if (!user) redirect("/login")
  if (user.role === "tech") redirect("/routes")
  if (user.role === "customer") redirect("/portal")

  // Fetch WOs, templates, and invoices in parallel
  const [workOrders, templates, invoices] = await Promise.all([
    getWorkOrders(),
    getWoTemplates(),
    getInvoices(),
  ])

  return (
    <div className="flex flex-col gap-6">
      {/* ── Page header ──────────────────────────────────────────────────── */}
      <div className="flex items-start justify-between">
        <div>
          <div className="flex items-center gap-2">
            <WrenchIcon className="h-6 w-6 text-muted-foreground" aria-hidden="true" />
            <h1 className="text-2xl font-bold tracking-tight">Work Orders</h1>
          </div>
          <p className="mt-1 text-sm text-muted-foreground">
            Manage repairs, service calls, and equipment work
          </p>
        </div>

        {/* Create WO button (opens dialog) */}
        <WoCreateDialog templates={templates} />
      </div>

      {/* ── WOs | Invoices tab shell ──────────────────────────────────────── */}
      <WoInvoicesTabShell
        workOrders={workOrders}
        invoices={invoices}
      />
    </div>
  )
}
