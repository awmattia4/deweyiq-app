import { notFound, redirect } from "next/navigation"
import { getCurrentUser } from "@/actions/auth"
import { getMaterials, getPurchaseOrders } from "@/actions/projects-materials"
import { getProjectDetail } from "@/actions/projects"
import { MaterialsPageClient } from "@/components/projects/materials-page-client"

interface MaterialsPageProps {
  params: Promise<{ id: string }>
}

/**
 * MaterialsPage — Server component for /projects/[id]/materials.
 *
 * Fetches project, materials, and purchase orders upfront.
 * Renders the tabbed materials/PO client.
 *
 * Role guard: owner and office only.
 */
export default async function MaterialsPage({ params }: MaterialsPageProps) {
  const user = await getCurrentUser()

  if (!user) redirect("/login")
  if (user.role === "tech") redirect("/routes")
  if (user.role === "customer") redirect("/portal")

  const { id } = await params

  const [project, materialsResult, purchaseOrdersResult] = await Promise.all([
    getProjectDetail(id),
    getMaterials(id),
    getPurchaseOrders(id),
  ])

  if (!project) notFound()

  const materials = "error" in materialsResult ? [] : materialsResult
  const purchaseOrders = "error" in purchaseOrdersResult ? [] : purchaseOrdersResult

  return (
    <MaterialsPageClient
      project={project}
      initialMaterials={materials}
      initialPurchaseOrders={purchaseOrders}
    />
  )
}
