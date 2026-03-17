"use client"

/**
 * ProjectChangeOrdersTab — Change orders section for the project detail page.
 *
 * Shows all change orders for a project with their status and cumulative impact.
 * Office can:
 * - Create new change orders
 * - Send draft COs for customer approval
 * - View CO details and cumulative impact
 * - Convert issue flags to COs (via button on the flag card)
 *
 * Phase 12: Projects & Renovations — Plan 13
 */

import { useState } from "react"
import { Card } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { ChangeOrderBuilderDialog } from "@/components/projects/change-order-builder"
import { sendChangeOrder, deleteChangeOrder } from "@/actions/projects-change-orders"
import type { ChangeOrderSummary, ChangeOrderImpact } from "@/actions/projects-change-orders"
import type { ProjectDetail } from "@/actions/projects"

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface ProjectChangeOrdersTabProps {
  project: ProjectDetail
  initialChangeOrders: ChangeOrderSummary[]
  initialImpact: ChangeOrderImpact | null
  onProjectUpdate?: (project: ProjectDetail) => void
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function formatCurrency(n: number | string): string {
  const num = typeof n === "string" ? parseFloat(n) : n
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: 2,
  }).format(num)
}

function statusBadgeVariant(status: string): "default" | "secondary" | "destructive" | "outline" {
  switch (status) {
    case "approved":
      return "default"
    case "pending_approval":
      return "secondary"
    case "declined":
      return "destructive"
    case "voided":
      return "destructive"
    default:
      return "outline"
  }
}

function statusLabel(status: string): string {
  const map: Record<string, string> = {
    draft: "Draft",
    pending_approval: "Awaiting Approval",
    approved: "Approved",
    declined: "Declined",
    voided: "Voided",
  }
  return map[status] ?? status
}

function reasonLabel(reason: string): string {
  const map: Record<string, string> = {
    scope_change: "Scope Change",
    unforeseen_conditions: "Unforeseen Conditions",
    customer_request: "Customer Request",
    design_change: "Design Change",
    regulatory: "Regulatory",
    other: "Other",
  }
  return map[reason] ?? reason
}

// ---------------------------------------------------------------------------
// ProjectChangeOrdersTab
// ---------------------------------------------------------------------------

export function ProjectChangeOrdersTab({
  project,
  initialChangeOrders,
  initialImpact,
  onProjectUpdate,
}: ProjectChangeOrdersTabProps) {
  const [changeOrders, setChangeOrders] = useState(initialChangeOrders)
  const [impact, setImpact] = useState(initialImpact)
  const [builderOpen, setBuilderOpen] = useState(false)
  const [editingCO, setEditingCO] = useState<ChangeOrderSummary | null>(null)
  const [sendingId, setSendingId] = useState<string | null>(null)
  const [deletingId, setDeletingId] = useState<string | null>(null)

  // After create/update success, reload the list and impact
  async function refreshData() {
    const [{ getChangeOrders, getChangeOrderImpact }] = await Promise.all([
      import("@/actions/projects-change-orders"),
    ])
    const [updatedCOs, updatedImpact] = await Promise.all([
      getChangeOrders(project.id),
      getChangeOrderImpact(project.id),
    ])
    setChangeOrders(updatedCOs)
    setImpact(updatedImpact)
  }

  async function handleBuilderSuccess(changeOrderId: string, sent: boolean) {
    await refreshData()
    setBuilderOpen(false)
    setEditingCO(null)
  }

  async function handleSendNow(co: ChangeOrderSummary) {
    setSendingId(co.id)
    try {
      const result = await sendChangeOrder(co.id)
      if (result.success) {
        await refreshData()
      }
    } finally {
      setSendingId(null)
    }
  }

  async function handleDelete(co: ChangeOrderSummary) {
    if (!confirm(`Archive draft change order ${co.change_order_number}?`)) return
    setDeletingId(co.id)
    try {
      const result = await deleteChangeOrder(co.id)
      if (result.success) {
        setChangeOrders((prev) => prev.filter((c) => c.id !== co.id))
      }
    } finally {
      setDeletingId(null)
    }
  }

  // ── Render ──────────────────────────────────────────────────────────────
  return (
    <div className="flex flex-col gap-6">
      {/* Header */}
      <div className="flex items-start justify-between">
        <div>
          <h2 className="text-base font-semibold">Change Orders</h2>
          <p className="text-sm text-muted-foreground mt-0.5">
            Formal documentation of scope, cost, and schedule changes. Customers approve via
            email link before work proceeds.
          </p>
        </div>
        <Button size="sm" onClick={() => { setEditingCO(null); setBuilderOpen(true) }}>
          New Change Order
        </Button>
      </div>

      {/* ── Cumulative Impact Summary ───────────────────────────────────── */}
      {impact && impact.changeOrders.some((co) => co.status === "approved") && (
        <Card className="p-4">
          <div className="text-xs font-semibold uppercase tracking-wide text-muted-foreground mb-3">
            Cumulative Impact
          </div>
          <div className="grid grid-cols-3 gap-4 text-sm">
            <div>
              <div className="text-muted-foreground text-xs mb-1">Original Contract</div>
              <div className="font-semibold">
                {formatCurrency(impact.originalContractAmount)}
              </div>
            </div>
            <div>
              <div className="text-muted-foreground text-xs mb-1">CO Adjustments</div>
              <div
                className={`font-semibold ${
                  impact.totalApprovedCostImpact > 0
                    ? "text-red-400"
                    : impact.totalApprovedCostImpact < 0
                      ? "text-emerald-400"
                      : ""
                }`}
              >
                {impact.totalApprovedCostImpact > 0 ? "+" : ""}
                {formatCurrency(impact.totalApprovedCostImpact)}
              </div>
            </div>
            <div>
              <div className="text-muted-foreground text-xs mb-1">Current Contract</div>
              <div className="font-semibold">
                {formatCurrency(impact.currentContractAmount)}
              </div>
            </div>
          </div>
        </Card>
      )}

      {/* ── Change Order List ───────────────────────────────────────────── */}
      {changeOrders.length === 0 ? (
        <p className="text-sm text-muted-foreground italic">
          No change orders yet. Create one when project scope changes.
        </p>
      ) : (
        <div className="flex flex-col gap-3">
          {changeOrders.map((co) => {
            const costImpact = parseFloat(co.cost_impact)
            return (
              <Card key={co.id} className="p-4">
                {/* Top row: number + status */}
                <div className="flex items-start justify-between gap-3 mb-3">
                  <div>
                    <div className="flex items-center gap-2">
                      <span className="font-semibold text-sm">
                        {co.change_order_number ?? "CO"}
                      </span>
                      <Badge variant={statusBadgeVariant(co.status)} className="text-xs">
                        {statusLabel(co.status)}
                      </Badge>
                      {co.issue_flag_id && (
                        <Badge variant="outline" className="text-xs">
                          From Issue Flag
                        </Badge>
                      )}
                    </div>
                    <p className="text-sm text-muted-foreground mt-0.5 line-clamp-2">
                      {co.description}
                    </p>
                  </div>
                  <div className="text-right shrink-0">
                    <div
                      className={`text-sm font-semibold tabular-nums ${
                        costImpact > 0
                          ? "text-red-400"
                          : costImpact < 0
                            ? "text-emerald-400"
                            : "text-muted-foreground"
                      }`}
                    >
                      {costImpact > 0 ? "+" : ""}
                      {formatCurrency(costImpact)}
                    </div>
                    {co.schedule_impact_days !== 0 && (
                      <div className="text-xs text-amber-400 mt-0.5">
                        {co.schedule_impact_days > 0 ? "+" : ""}
                        {co.schedule_impact_days}d
                      </div>
                    )}
                  </div>
                </div>

                {/* Meta row */}
                <div className="flex items-center gap-3 text-xs text-muted-foreground mb-3">
                  <span>{reasonLabel(co.reason)}</span>
                  {co.approved_at && (
                    <span>
                      Approved {new Date(co.approved_at).toLocaleDateString()}
                      {co.approved_signature && ` by ${co.approved_signature}`}
                    </span>
                  )}
                  <span>{new Date(co.created_at).toLocaleDateString()}</span>
                </div>

                {/* Actions */}
                <div className="flex items-center gap-2">
                  {co.status === "draft" && (
                    <>
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => {
                          setEditingCO(co)
                          setBuilderOpen(true)
                        }}
                      >
                        Edit
                      </Button>
                      <Button
                        size="sm"
                        onClick={() => handleSendNow(co)}
                        disabled={sendingId === co.id}
                      >
                        {sendingId === co.id ? "Sending..." : "Send for Approval"}
                      </Button>
                      <Button
                        variant="ghost"
                        size="sm"
                        className="text-muted-foreground hover:text-destructive ml-auto"
                        onClick={() => handleDelete(co)}
                        disabled={deletingId === co.id}
                      >
                        {deletingId === co.id ? "Archiving..." : "Archive"}
                      </Button>
                    </>
                  )}
                  {co.status === "pending_approval" && (
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => handleSendNow(co)}
                      disabled={sendingId === co.id}
                    >
                      {sendingId === co.id ? "Resending..." : "Resend Email"}
                    </Button>
                  )}
                </div>
              </Card>
            )
          })}
        </div>
      )}

      {/* ── Change Order Builder Dialog ─────────────────────────────────── */}
      <ChangeOrderBuilderDialog
        open={builderOpen}
        onOpenChange={(open) => {
          setBuilderOpen(open)
          if (!open) setEditingCO(null)
        }}
        title={editingCO ? `Edit ${editingCO.change_order_number}` : "Create Change Order"}
        projectId={project.id}
        contractAmount={project.contract_amount}
        estimatedCompletionDate={project.estimated_completion_date}
        existingChangeOrder={editingCO}
        onSuccess={handleBuilderSuccess}
        onClose={() => {
          setBuilderOpen(false)
          setEditingCO(null)
        }}
      />
    </div>
  )
}
