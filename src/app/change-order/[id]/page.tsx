export const dynamic = "force-dynamic"

/**
 * Change Order Approval Page — public, no auth required.
 *
 * URL: /change-order/[token] where [token] is a signed JWT.
 * Per MEMORY.md slug conflict rule: always use [id] for dynamic segments at this level.
 * Extract the JWT token as: const token = (await params).id
 *
 * Flow:
 * 1. Extract JWT token from URL param (named [id] per slug conflict rule)
 * 2. Verify via verifyChangeOrderToken → extract changeOrderId
 * 3. Fetch public data via getChangeOrderPublicData (adminDb, no auth)
 * 4. Render ChangeOrderApprovalPage client component
 *
 * Phase 12: Projects & Renovations — Plan 13
 */

import { verifyChangeOrderToken } from "@/lib/projects/change-order-token"
import { getChangeOrderPublicData } from "@/actions/projects-change-orders"
import { ChangeOrderApprovalPage } from "@/components/projects/change-order-approval-page"

interface ChangeOrderPageProps {
  params: Promise<{ id: string }>
}

export async function generateMetadata({ params }: ChangeOrderPageProps) {
  const { id: token } = await params

  try {
    const payload = await verifyChangeOrderToken(token)
    if (!payload) return { title: "Change Order" }

    const data = await getChangeOrderPublicData(payload.changeOrderId)
    if (!data) return { title: "Change Order" }

    return {
      title: `Change Order ${data.changeOrder.change_order_number ?? ""} — ${data.project.name}`,
    }
  } catch {
    return { title: "Change Order" }
  }
}

export default async function ChangeOrderPage({ params }: ChangeOrderPageProps) {
  // Per MEMORY.md: "Use the same param name [id] for all routes at that level.
  // If the value is semantically a token, just extract it as const token = (await params).id"
  const token = (await params).id

  // ── Verify JWT token ──────────────────────────────────────────────────────
  const payload = await verifyChangeOrderToken(token)

  if (!payload) {
    return (
      <div className="min-h-screen bg-[#0f172a] flex items-center justify-center p-4">
        <div className="max-w-md w-full text-center">
          <div
            style={{
              backgroundColor: "#1e293b",
              border: "1px solid #334155",
              borderRadius: "12px",
              padding: "32px",
            }}
          >
            <h1 className="text-xl font-bold text-white mb-2">Invalid Link</h1>
            <p className="text-sm text-[#94a3b8]">
              This change order link is invalid or has expired. Please contact us for a new link.
            </p>
          </div>
        </div>
      </div>
    )
  }

  // ── Fetch public data ─────────────────────────────────────────────────────
  const data = await getChangeOrderPublicData(payload.changeOrderId)

  if (!data) {
    return (
      <div className="min-h-screen bg-[#0f172a] flex items-center justify-center p-4">
        <div className="max-w-md w-full text-center">
          <div
            style={{
              backgroundColor: "#1e293b",
              border: "1px solid #334155",
              borderRadius: "12px",
              padding: "32px",
            }}
          >
            <h1 className="text-xl font-bold text-white mb-2">Change Order Not Found</h1>
            <p className="text-sm text-[#94a3b8]">
              We could not find this change order. Please contact us for assistance.
            </p>
          </div>
        </div>
      </div>
    )
  }

  return <ChangeOrderApprovalPage data={data} />
}
