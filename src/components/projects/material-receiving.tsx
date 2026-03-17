"use client"

/**
 * material-receiving.tsx — Purchase orders list with status management and PDF download.
 *
 * Phase 12 Plan 09: Materials & Procurement
 *
 * Shows all POs for a project with:
 * - Status badge and update actions
 * - Line items with quantities and prices
 * - PDF download link per PO
 * - Receipt history context
 */

import { useState, useTransition } from "react"
import { toast } from "sonner"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { cn } from "@/lib/utils"
import { updatePurchaseOrderStatus } from "@/actions/projects-materials"
import type { PurchaseOrder } from "@/actions/projects-materials"

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const PO_STATUS_LABELS: Record<string, string> = {
  draft: "Draft",
  sent: "Sent",
  acknowledged: "Acknowledged",
  partial: "Partial",
  complete: "Complete",
  cancelled: "Cancelled",
}

const PO_STATUS_VARIANTS: Record<
  string,
  "secondary" | "default" | "outline" | "destructive"
> = {
  draft: "outline",
  sent: "secondary",
  acknowledged: "secondary",
  partial: "secondary",
  complete: "default",
  cancelled: "destructive",
}

const PO_STATUS_OPTIONS = [
  { value: "draft", label: "Draft" },
  { value: "sent", label: "Sent to Supplier" },
  { value: "acknowledged", label: "Acknowledged" },
  { value: "partial", label: "Partial Delivery" },
  { value: "complete", label: "Complete" },
  { value: "cancelled", label: "Cancelled" },
]

// ---------------------------------------------------------------------------
// Props
// ---------------------------------------------------------------------------

interface MaterialReceivingProps {
  purchaseOrders: PurchaseOrder[]
  onPurchaseOrdersChange: (pos: PurchaseOrder[]) => void
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function MaterialReceiving({
  purchaseOrders,
  onPurchaseOrdersChange,
}: MaterialReceivingProps) {
  const [updatingPoId, setUpdatingPoId] = useState<string | null>(null)
  const [isPending, startTransition] = useTransition()

  function handleStatusChange(poId: string, newStatus: string) {
    setUpdatingPoId(poId)
    startTransition(async () => {
      const result = await updatePurchaseOrderStatus(poId, newStatus)
      setUpdatingPoId(null)

      if ("error" in result) {
        toast.error(result.error)
        return
      }

      // Update local state
      onPurchaseOrdersChange(
        purchaseOrders.map((po) =>
          po.id === poId ? { ...po, status: newStatus } : po
        )
      )
      toast.success("Purchase order status updated")
    })
  }

  if (purchaseOrders.length === 0) {
    return (
      <div className="flex flex-col gap-4">
        <h2 className="text-base font-semibold">Purchase Orders</h2>
        <p className="text-sm text-muted-foreground italic py-6 text-center">
          No purchase orders yet. Select materials and click "Create PO" to generate one.
        </p>
      </div>
    )
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-between">
        <h2 className="text-base font-semibold">Purchase Orders</h2>
        <Badge variant="secondary" className="text-xs">
          {purchaseOrders.length}
        </Badge>
      </div>

      <div className="flex flex-col gap-4">
        {purchaseOrders.map((po) => (
          <Card key={po.id} className="overflow-hidden">
            <CardHeader className="pb-3">
              <div className="flex items-start justify-between gap-4">
                <div className="flex flex-col gap-1">
                  <div className="flex items-center gap-2">
                    <CardTitle className="text-base">
                      {po.po_number ?? "PO (draft)"}
                    </CardTitle>
                    <Badge
                      variant={PO_STATUS_VARIANTS[po.status] ?? "outline"}
                      className="text-xs"
                    >
                      {PO_STATUS_LABELS[po.status] ?? po.status}
                    </Badge>
                  </div>
                  <div className="text-sm text-muted-foreground">
                    {po.supplier_name}
                    {po.supplier_contact && (
                      <span className="ml-2 text-muted-foreground/70">
                        {po.supplier_contact}
                      </span>
                    )}
                  </div>
                  <div className="text-xs text-muted-foreground">
                    Created {formatDate(po.created_at)}
                  </div>
                </div>

                {/* Actions */}
                <div className="flex items-center gap-2 shrink-0">
                  {/* Status selector */}
                  <Select
                    value={po.status}
                    onValueChange={(val) => handleStatusChange(po.id, val)}
                    disabled={isPending && updatingPoId === po.id}
                  >
                    <SelectTrigger className="h-8 text-xs w-[140px]">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {PO_STATUS_OPTIONS.map((opt) => (
                        <SelectItem key={opt.value} value={opt.value} className="text-xs">
                          {opt.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>

                  {/* PDF download */}
                  <Button size="sm" variant="outline" asChild className="h-8 text-xs">
                    <a
                      href={`/api/projects/purchase-orders/${po.id}/pdf`}
                      target="_blank"
                      rel="noopener noreferrer"
                    >
                      PDF
                    </a>
                  </Button>
                </div>
              </div>
            </CardHeader>

            <CardContent className="pt-0">
              {/* Line items */}
              <div className="rounded-md border border-border overflow-hidden">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-border bg-muted/50">
                      <th className="px-3 py-2 text-left font-medium text-muted-foreground">Item</th>
                      <th className="px-3 py-2 text-right font-medium text-muted-foreground">Qty</th>
                      <th className="px-3 py-2 text-right font-medium text-muted-foreground">Unit Price</th>
                      <th className="px-3 py-2 text-right font-medium text-muted-foreground">Total</th>
                    </tr>
                  </thead>
                  <tbody>
                    {po.lineItems.map((li, idx) => (
                      <tr
                        key={li.id}
                        className={cn(
                          "border-b border-border last:border-0",
                          idx % 2 === 0 ? "bg-background" : "bg-muted/20"
                        )}
                      >
                        <td className="px-3 py-2">{li.materialName}</td>
                        <td className="px-3 py-2 text-right tabular-nums text-muted-foreground">
                          {parseFloat(li.quantity).toString()}
                        </td>
                        <td className="px-3 py-2 text-right tabular-nums text-muted-foreground">
                          ${parseFloat(li.unit_price).toFixed(2)}
                        </td>
                        <td className="px-3 py-2 text-right tabular-nums font-medium">
                          ${parseFloat(li.total).toFixed(2)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                  <tfoot>
                    <tr className="border-t-2 border-border bg-muted/40">
                      <td className="px-3 py-2.5 font-semibold" colSpan={3} align="right">
                        Total
                      </td>
                      <td className="px-3 py-2.5 text-right font-semibold tabular-nums">
                        ${parseFloat(po.total_amount).toFixed(2)}
                      </td>
                    </tr>
                  </tfoot>
                </table>
              </div>

              {/* Notes */}
              {po.notes && (
                <p className="text-xs text-muted-foreground mt-3 italic">{po.notes}</p>
              )}
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Helper
// ---------------------------------------------------------------------------

function formatDate(date: Date): string {
  return new Date(date).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  })
}
