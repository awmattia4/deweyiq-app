"use client"

/**
 * wo-invoices-tab-shell.tsx — Client component for the WOs | Invoices tab toggle.
 *
 * Rendered in the /work-orders page as the content area below the header.
 * Manages the tab state (Work Orders vs Invoices) and renders the appropriate list.
 *
 * Both panels are rendered in DOM simultaneously (hidden/visible) to preserve
 * local filter state when switching tabs — same pattern as ScheduleTabs.
 */

import { useState } from "react"
import { cn } from "@/lib/utils"
import { WoList } from "@/components/work-orders/wo-list"
import { InvoiceList } from "@/components/work-orders/invoice-list"
import type { WorkOrderSummary } from "@/actions/work-orders"
import type { InvoiceSummary } from "@/actions/invoices"

interface WoInvoicesTabShellProps {
  workOrders: WorkOrderSummary[]
  invoices: InvoiceSummary[]
  /** Customer phone map: customerId -> phone | null. Used to gate SMS option in InvoiceList. */
  customerPhones?: Record<string, string | null>
}

export function WoInvoicesTabShell({
  workOrders,
  invoices,
  customerPhones,
}: WoInvoicesTabShellProps) {
  const [activeTab, setActiveTab] = useState<"work-orders" | "invoices">(
    "work-orders"
  )

  return (
    <div className="flex flex-col gap-4">
      {/* ── Tab toggle ──────────────────────────────────────────────────── */}
      <div className="flex items-center gap-1 rounded-lg border border-border bg-muted/30 p-1 w-fit">
        <button
          type="button"
          onClick={() => setActiveTab("work-orders")}
          className={cn(
            "cursor-pointer rounded-md px-4 py-1.5 text-sm font-medium transition-colors",
            activeTab === "work-orders"
              ? "bg-background text-foreground shadow-sm"
              : "text-muted-foreground hover:text-foreground"
          )}
        >
          Work Orders
          {workOrders.length > 0 && (
            <span
              className={cn(
                "ml-1.5 inline-flex h-5 min-w-5 items-center justify-center rounded-full px-1 text-xs",
                activeTab === "work-orders"
                  ? "bg-primary/15 text-primary"
                  : "bg-muted text-muted-foreground"
              )}
            >
              {workOrders.length}
            </span>
          )}
        </button>
        <button
          type="button"
          onClick={() => setActiveTab("invoices")}
          className={cn(
            "cursor-pointer rounded-md px-4 py-1.5 text-sm font-medium transition-colors",
            activeTab === "invoices"
              ? "bg-background text-foreground shadow-sm"
              : "text-muted-foreground hover:text-foreground"
          )}
        >
          Invoices
          {invoices.length > 0 && (
            <span
              className={cn(
                "ml-1.5 inline-flex h-5 min-w-5 items-center justify-center rounded-full px-1 text-xs",
                activeTab === "invoices"
                  ? "bg-primary/15 text-primary"
                  : "bg-muted text-muted-foreground"
              )}
            >
              {invoices.length}
            </span>
          )}
        </button>
      </div>

      {/* ── Tab panels — both in DOM, visibility toggled ─────────────────── */}
      <div className={activeTab === "work-orders" ? "block" : "hidden"}>
        <WoList workOrders={workOrders} />
      </div>
      <div className={activeTab === "invoices" ? "block" : "hidden"}>
        <InvoiceList invoices={invoices} customerPhones={customerPhones} />
      </div>
    </div>
  )
}
