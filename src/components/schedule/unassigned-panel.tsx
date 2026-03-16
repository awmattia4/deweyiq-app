"use client"

import { useState, useMemo } from "react"
import { SearchIcon, UserIcon, DropletIcon, CheckSquareIcon, SquareIcon } from "lucide-react"
import { cn } from "@/lib/utils"
import type { UnassignedCustomer, UnassignedWorkOrder } from "@/actions/schedule"

// ─── UnassignedPanel ──────────────────────────────────────────────────────────

interface UnassignedPanelProps {
  /** Customers without a route_stop for this tech+day */
  customers: UnassignedCustomer[]
  /** Approved work orders not yet on this tech+day route */
  workOrders?: UnassignedWorkOrder[]
  /** Currently multi-selected customer IDs */
  selectedIds: Set<string>
  onToggleSelect: (customerId: string) => void
  /** Called to assign one or more customers — receives array of {customerId, poolId} pairs */
  onAssign: (pairs: Array<{ customerId: string; poolId: string }>) => void
  /** Called to assign a work order stop — receives the work order id */
  onAssignWorkOrder?: (workOrderId: string) => void
  /** Whether a drag is hovering over this panel (for visual feedback) */
  isOver?: boolean
  isAssigning?: boolean
}

/**
 * UnassignedPanel — sidebar panel listing customers without route stops for the
 * selected tech+day.
 *
 * Features:
 * - Text search to filter by name or address (client-side)
 * - Checkbox multi-select
 * - Single-customer "Assign" button (click-to-assign)
 * - "Assign Selected (N)" bulk assign button when selection > 0
 *
 * Pool assignment strategy: When a customer has exactly one pool, assign that pool.
 * When a customer has multiple pools, assign each pool as a separate stop.
 * When a customer has no pools, assign with pool_id = null.
 */
export function UnassignedPanel({
  customers,
  workOrders = [],
  selectedIds,
  onToggleSelect,
  onAssign,
  onAssignWorkOrder,
  isOver = false,
  isAssigning = false,
}: UnassignedPanelProps) {
  const [search, setSearch] = useState("")

  // Client-side filter by name or address
  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase()
    if (!q) return customers
    return customers.filter(
      (c) =>
        c.name.toLowerCase().includes(q) ||
        (c.address?.toLowerCase().includes(q) ?? false)
    )
  }, [customers, search])

  // Build assignment pairs for a single customer (one pair per pool, or one pair with null pool)
  function getPairsForCustomer(customer: UnassignedCustomer): Array<{ customerId: string; poolId: string }> {
    if (customer.pools.length === 0) {
      return [{ customerId: customer.id, poolId: "" }]
    }
    return customer.pools.map((p) => ({ customerId: customer.id, poolId: p.id }))
  }

  // Build pairs for all selected customers
  function getSelectedPairs(): Array<{ customerId: string; poolId: string }> {
    return customers
      .filter((c) => selectedIds.has(c.id))
      .flatMap(getPairsForCustomer)
  }

  const selectedCount = selectedIds.size

  return (
    <div
      className={cn(
        "flex flex-col h-full border-r border-border bg-card/30 transition-colors",
        isOver && "bg-primary/5 border-primary/30"
      )}
    >
      {/* ── Header ─────────────────────────────────────────────────────────── */}
      <div className="flex-shrink-0 px-3 pt-3 pb-2 border-b border-border/60">
        <div className="flex items-center justify-between mb-2">
          <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
            Unassigned
          </h3>
          <span className="text-xs text-muted-foreground">
            {customers.length} customer{customers.length !== 1 ? "s" : ""}
          </span>
        </div>

        {/* Search input */}
        <div className="relative">
          <SearchIcon className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground/50 pointer-events-none" />
          <input
            type="text"
            placeholder="Filter customers..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full rounded-md border border-border/60 bg-background/60 pl-8 pr-3 py-1.5 text-xs placeholder:text-muted-foreground/50 focus:outline-none focus:ring-1 focus:ring-primary/40 focus:border-primary/40"
          />
        </div>
      </div>

      {/* ── Customer list ──────────────────────────────────────────────────── */}
      <div className="flex-1 overflow-y-auto min-h-0 px-2 py-2 flex flex-col gap-1">
        {filtered.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-8 text-center gap-2 text-muted-foreground">
            <UserIcon className="h-7 w-7 text-muted-foreground/30" />
            <p className="text-xs">
              {search ? "No customers match your search" : "All customers are assigned"}
            </p>
          </div>
        ) : (
          filtered.map((customer) => {
            const isSelected = selectedIds.has(customer.id)
            return (
              <div
                key={customer.id}
                className={cn(
                  "group flex items-start gap-2 rounded-md px-2.5 py-2 transition-colors cursor-pointer",
                  isSelected
                    ? "bg-primary/10 border border-primary/30"
                    : "hover:bg-muted/50 border border-transparent"
                )}
                onClick={() => onToggleSelect(customer.id)}
              >
                {/* Checkbox */}
                <button
                  type="button"
                  className="flex-shrink-0 mt-0.5 text-muted-foreground/50 hover:text-primary transition-colors cursor-pointer"
                  onClick={(e) => {
                    e.stopPropagation()
                    onToggleSelect(customer.id)
                  }}
                  aria-label={isSelected ? "Deselect" : "Select"}
                >
                  {isSelected ? (
                    <CheckSquareIcon className="h-4 w-4 text-primary" />
                  ) : (
                    <SquareIcon className="h-4 w-4" />
                  )}
                </button>

                {/* Customer info */}
                <div className="min-w-0 flex-1">
                  <p className="text-xs font-medium truncate leading-snug">{customer.name}</p>
                  {customer.address && (
                    <p className="text-[11px] text-muted-foreground/60 truncate leading-snug mt-0.5">
                      {customer.address}
                    </p>
                  )}
                  {customer.poolCount > 0 && (
                    <p className="text-[11px] text-muted-foreground/50 flex items-center gap-1 mt-0.5">
                      <DropletIcon className="h-2.5 w-2.5" />
                      {customer.poolCount} pool{customer.poolCount !== 1 ? "s" : ""}
                    </p>
                  )}
                </div>

                {/* Single assign button */}
                <button
                  type="button"
                  disabled={isAssigning}
                  onClick={(e) => {
                    e.stopPropagation()
                    onAssign(getPairsForCustomer(customer))
                  }}
                  className="flex-shrink-0 rounded text-[11px] font-medium px-2 py-0.5 bg-muted/60 text-muted-foreground hover:bg-primary/20 hover:text-primary transition-colors cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  Assign
                </button>
              </div>
            )
          })
        )}
      </div>

      {/* ── Bulk assign footer ─────────────────────────────────────────────── */}
      {selectedCount > 0 && (
        <div className="flex-shrink-0 px-3 py-2.5 border-t border-border/60 bg-card/50">
          <button
            type="button"
            disabled={isAssigning}
            onClick={() => onAssign(getSelectedPairs())}
            className="w-full rounded-md bg-primary px-3 py-2 text-xs font-semibold text-primary-foreground hover:bg-primary/90 transition-colors cursor-pointer disabled:opacity-60 disabled:cursor-not-allowed"
          >
            {isAssigning
              ? "Assigning..."
              : `Assign Selected (${selectedCount})`}
          </button>
        </div>
      )}
    </div>
  )
}
