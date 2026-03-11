import type { Metadata } from "next"
import { redirect } from "next/navigation"
import { WrenchIcon } from "lucide-react"
import { getCurrentUser } from "@/actions/auth"
import { getWorkOrders } from "@/actions/work-orders"
import { getWoTemplates } from "@/actions/parts-catalog"
import { WoList } from "@/components/work-orders/wo-list"
import { WoCreateDialog } from "@/components/work-orders/wo-create-dialog"

export const metadata: Metadata = {
  title: "Work Orders",
}

/**
 * WorkOrdersPage — Server component listing all open work orders.
 *
 * Role guard: owner and office only. Techs are redirected to /routes.
 * Fetches WOs (no filters = all WOs) and WO templates in parallel.
 *
 * WoList handles client-side filtering; WoCreateDialog handles creation.
 */
export default async function WorkOrdersPage() {
  const user = await getCurrentUser()

  if (!user) redirect("/login")
  if (user.role === "tech") redirect("/routes")
  if (user.role === "customer") redirect("/portal")

  // Fetch WOs and templates in parallel
  const [workOrders, templates] = await Promise.all([
    getWorkOrders(),
    getWoTemplates(),
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

      {/* ── Work order list with filters ─────────────────────────────────── */}
      <WoList workOrders={workOrders} />
    </div>
  )
}
