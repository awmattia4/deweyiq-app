/**
 * src/app/api/projects/purchase-orders/[id]/pdf/route.ts
 *
 * Phase 12 Plan 09: Generate a branded PDF for a project purchase order.
 *
 * GET /api/projects/purchase-orders/[id]/pdf
 * Returns: application/pdf with Content-Disposition attachment
 *
 * Auth: office/owner only
 */

import { redirect } from "next/navigation"
import { createElement } from "react"
import { renderToBuffer } from "@react-pdf/renderer"
import { getCurrentUser } from "@/actions/auth"
import { getPurchaseOrderForPdf } from "@/actions/projects-materials"
import { PurchaseOrderDocument } from "@/lib/pdf/purchase-order-pdf"
import type { PurchaseOrderDocumentProps } from "@/lib/pdf/purchase-order-pdf"

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const user = await getCurrentUser()
  if (!user) {
    redirect("/login")
  }

  if (user.role !== "owner" && user.role !== "office") {
    return new Response("Forbidden", { status: 403 })
  }

  const { id } = await params

  try {
    const result = await getPurchaseOrderForPdf(id)

    if ("error" in result) {
      return new Response(result.error, { status: 404 })
    }

    const { data } = result

    const poDate = data.created_at.toLocaleDateString("en-US", {
      year: "numeric",
      month: "long",
      day: "numeric",
    })

    const subtotal = parseFloat(data.total_amount)

    const documentProps: PurchaseOrderDocumentProps = {
      poNumber: data.po_number,
      poDate,
      companyName: data.companyName,
      companyLogoUrl: data.companyLogoUrl,
      supplierName: data.supplier_name,
      supplierContact: data.supplier_contact,
      projectName: data.projectName,
      projectNumber: data.projectNumber,
      lineItems: data.lineItems,
      subtotal,
      notes: data.notes,
    }

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const buffer = await renderToBuffer(
      createElement(PurchaseOrderDocument, documentProps) as any
    )

    const filename = `purchase-order-${data.po_number ?? id}.pdf`
    const uint8Array = new Uint8Array(buffer)

    return new Response(uint8Array, {
      status: 200,
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `attachment; filename="${filename}"`,
        "Cache-Control": "private, no-cache",
      },
    })
  } catch (err) {
    console.error("[GET /api/projects/purchase-orders/[id]/pdf]", err)
    return new Response("Failed to generate purchase order PDF", { status: 500 })
  }
}
