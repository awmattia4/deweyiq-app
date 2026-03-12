import { notFound, redirect } from "next/navigation"
import { getCurrentUser } from "@/actions/auth"
import { getWorkOrder } from "@/actions/work-orders"
import { getInvoiceForWorkOrder, getCustomerPhonesForInvoices } from "@/actions/invoices"
import { getOrgSettings } from "@/actions/company-settings"
import { getQuotesForWorkOrder } from "@/actions/quotes"
import { WoDetail } from "@/components/work-orders/wo-detail"

interface WorkOrderDetailPageProps {
  params: Promise<{ id: string }>
}

/**
 * WorkOrderDetailPage — Server component for a single WO.
 *
 * Fetches the WO with all relations (customer, pool, line items, quotes,
 * activity log), tech profiles for the assignment dialog, and invoice info
 * (for the "Prepare Invoice" / "View Invoice" action on completed WOs).
 *
 * Role guard: owner and office only. Techs are redirected to /routes.
 */
export async function generateMetadata({ params }: WorkOrderDetailPageProps) {
  const { id } = await params
  const wo = await getWorkOrder(id)
  return {
    title: wo ? `WO: ${wo.title}` : "Work Order",
  }
}

export default async function WorkOrderDetailPage({ params }: WorkOrderDetailPageProps) {
  const user = await getCurrentUser()

  if (!user) redirect("/login")
  if (user.role === "tech") redirect("/routes")
  if (user.role === "customer") redirect("/portal")

  const { id } = await params

  // Fetch WO, tech profiles, invoice info, org settings, and quotes in parallel
  const [workOrder, invoiceInfo, orgSettings, quotes] = await Promise.all([
    getWorkOrder(id),
    getInvoiceForWorkOrder(id),
    getOrgSettings(),
    getQuotesForWorkOrder(id),
  ])

  if (!workOrder) {
    notFound()
  }

  // Find the latest active quote (not superseded)
  const latestQuote = quotes.find((q) => q.status !== "superseded") ?? null

  // Fetch customer phone for SMS delivery option in quote builder
  const phoneMap = await getCustomerPhonesForInvoices([workOrder.customer_id])
  const customerPhone = phoneMap[workOrder.customer_id] ?? null

  return (
    <WoDetail
      workOrder={workOrder}
      invoiceInfo={invoiceInfo}
      orgSettings={orgSettings}
      latestQuote={latestQuote}
      customerPhone={customerPhone}
    />
  )
}
