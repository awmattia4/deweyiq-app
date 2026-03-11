import { notFound, redirect } from "next/navigation"
import { getCurrentUser } from "@/actions/auth"
import { getWorkOrder } from "@/actions/work-orders"
import { getTechProfiles } from "@/actions/work-orders"
import { WoDetail } from "@/components/work-orders/wo-detail"

interface WorkOrderDetailPageProps {
  params: Promise<{ id: string }>
}

/**
 * WorkOrderDetailPage — Server component for a single WO.
 *
 * Fetches the WO with all relations (customer, pool, line items, quotes,
 * activity log) and tech profiles for the assignment dialog.
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

  // Fetch WO and tech profiles in parallel
  const [workOrder, techs] = await Promise.all([
    getWorkOrder(id),
    getTechProfiles(),
  ])

  if (!workOrder) {
    notFound()
  }

  return <WoDetail workOrder={workOrder} techs={techs} />
}
