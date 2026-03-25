"use client"

import { useState, useMemo } from "react"
import { SearchIcon, UserIcon, DropletIcon, CheckSquareIcon, SquareIcon, SquareMinus } from "lucide-react"
import { cn } from "@/lib/utils"
import type { UnassignedCustomer, UnassignedWorkOrder } from "@/actions/schedule"

// ─── UnassignedPanel ──────────────────────────────────────────────────────────

interface UnassignedPanelProps {
  /** Customers without a route_stop for this tech+day */
  customers: UnassignedCustomer[]
  /** Approved work orders not yet on this tech+day route */
  workOrders?: UnassignedWorkOrder[]
  /**
   * Currently multi-selected keys.
   * For customers with 1+ pools: composite "customerId:poolId" keys.
   * For customers with 0 pools: composite "customerId:" keys.
   */
  selectedIds: Set<string>
  /** Called with a composite "customerId:poolId" key to toggle a single pool */
  onToggleSelect: (key: string) => void
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
 * - Checkbox multi-select with per-pool granularity
 *   - Customers with 0 pools: single-row, no sub-tree
 *   - Customers with 1 pool: single-row showing pool name inline, no sub-tree
 *   - Customers with 2+ pools: collapsible tree; parent checkbox is indeterminate
 *     when some (but not all) pools are checked
 * - Single-customer "Assign" button assigns ALL pools for that customer
 * - "Assign Selected (N)" bulk assigns only the individually checked pools
 * - The count N reflects pool count, not customer count
 *
 * Selection key format: "customerId:poolId" (poolId is "" for no-pool customers)
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

  // ── Key helpers ──────────────────────────────────────────────────────────────

  /** Composite key for a customer+pool pair */
  function poolKey(customerId: string, poolId: string): string {
    return `${customerId}:${poolId}`
  }

  /** All composite keys for a customer (one per pool, or one "" key if no pools) */
  function keysForCustomer(customer: UnassignedCustomer): string[] {
    if (customer.pools.length === 0) {
      return [poolKey(customer.id, "")]
    }
    return customer.pools.map((p) => poolKey(customer.id, p.id))
  }

  // ── Per-customer selection state ─────────────────────────────────────────────

  /** How many of this customer's keys are currently selected */
  function selectedCountForCustomer(customer: UnassignedCustomer): number {
    return keysForCustomer(customer).filter((k) => selectedIds.has(k)).length
  }

  /** true if ALL pools for this customer are selected */
  function isCustomerAllSelected(customer: UnassignedCustomer): boolean {
    const keys = keysForCustomer(customer)
    return keys.length > 0 && keys.every((k) => selectedIds.has(k))
  }

  /** true if SOME (but not all) pools are selected — drives indeterminate state */
  function isCustomerIndeterminate(customer: UnassignedCustomer): boolean {
    const count = selectedCountForCustomer(customer)
    return count > 0 && count < keysForCustomer(customer).length
  }

  // ── Toggle helpers ────────────────────────────────────────────────────────────

  /**
   * Toggle a customer's parent checkbox:
   * - If all selected → deselect all
   * - If none or partial → select all
   */
  function handleToggleCustomer(customer: UnassignedCustomer) {
    const keys = keysForCustomer(customer)
    const allSelected = isCustomerAllSelected(customer)
    for (const key of keys) {
      const isSelected = selectedIds.has(key)
      if (allSelected && isSelected) {
        // deselect all
        onToggleSelect(key)
      } else if (!allSelected && !isSelected) {
        // select remaining
        onToggleSelect(key)
      }
    }
  }

  // ── Assignment pair helpers ───────────────────────────────────────────────────

  /** Build assignment pairs for a single customer (all their pools) */
  function getPairsForCustomer(customer: UnassignedCustomer): Array<{ customerId: string; poolId: string }> {
    if (customer.pools.length === 0) {
      return [{ customerId: customer.id, poolId: "" }]
    }
    return customer.pools.map((p) => ({ customerId: customer.id, poolId: p.id }))
  }

  /**
   * Build pairs for all selected composite keys.
   * Each key is "customerId:poolId" — split on first colon only.
   */
  function getSelectedPairs(): Array<{ customerId: string; poolId: string }> {
    const pairs: Array<{ customerId: string; poolId: string }> = []
    for (const key of selectedIds) {
      const colonIdx = key.indexOf(":")
      const customerId = colonIdx >= 0 ? key.slice(0, colonIdx) : key
      const poolId = colonIdx >= 0 ? key.slice(colonIdx + 1) : ""
      pairs.push({ customerId, poolId })
    }
    return pairs
  }

  // Pool count of selected items (one entry per pool key)
  const selectedPoolCount = selectedIds.size

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
            const multiPool = customer.pools.length >= 2
            const singlePool = customer.pools.length === 1
            const noPool = customer.pools.length === 0

            // For single-pool and no-pool, the whole card is keyed by one composite key
            const singleKey = singlePool
              ? poolKey(customer.id, customer.pools[0].id)
              : noPool
              ? poolKey(customer.id, "")
              : null

            const isAllSelected = isCustomerAllSelected(customer)
            const isIndeterminate = isCustomerIndeterminate(customer)
            // For single-pool / no-pool row: is this key selected?
            const isSingleSelected = singleKey != null && selectedIds.has(singleKey)

            // The card is "highlighted" if any of its pools are selected
            const isAnySelected = multiPool ? (isAllSelected || isIndeterminate) : isSingleSelected

            return (
              <div key={customer.id} className="flex flex-col">
                {/* ── Customer row ── */}
                <div
                  className={cn(
                    "group flex items-start gap-2 rounded-md px-2.5 py-2 transition-colors cursor-pointer",
                    isAnySelected
                      ? "bg-primary/10 border border-primary/30"
                      : "hover:bg-muted/50 border border-transparent"
                  )}
                  onClick={() => {
                    if (multiPool) {
                      handleToggleCustomer(customer)
                    } else if (singleKey != null) {
                      onToggleSelect(singleKey)
                    }
                  }}
                >
                  {/* Checkbox */}
                  <button
                    type="button"
                    className="flex-shrink-0 mt-0.5 text-muted-foreground/50 hover:text-primary transition-colors cursor-pointer"
                    onClick={(e) => {
                      e.stopPropagation()
                      if (multiPool) {
                        handleToggleCustomer(customer)
                      } else if (singleKey != null) {
                        onToggleSelect(singleKey)
                      }
                    }}
                    aria-label={isAllSelected ? "Deselect all pools" : "Select all pools"}
                  >
                    {multiPool ? (
                      isAllSelected ? (
                        <CheckSquareIcon className="h-4 w-4 text-primary" />
                      ) : isIndeterminate ? (
                        <SquareMinus className="h-4 w-4 text-primary/70" />
                      ) : (
                        <SquareIcon className="h-4 w-4" />
                      )
                    ) : isSingleSelected ? (
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
                    {/* Single-pool: show pool name inline */}
                    {singlePool && (
                      <p className="text-[11px] text-muted-foreground/50 flex items-center gap-1 mt-0.5">
                        <DropletIcon className="h-2.5 w-2.5" />
                        {customer.pools[0].name}
                      </p>
                    )}
                    {/* Multi-pool: show count */}
                    {multiPool && (
                      <p className="text-[11px] text-muted-foreground/50 flex items-center gap-1 mt-0.5">
                        <DropletIcon className="h-2.5 w-2.5" />
                        {customer.pools.length} pools
                      </p>
                    )}
                  </div>

                  {/* Single assign button — always assigns ALL pools for this customer */}
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

                {/* ── Pool sub-tree (only for 2+ pools) ── */}
                {multiPool && (
                  <div className="flex flex-col gap-0.5 pb-0.5">
                    {customer.pools.map((pool) => {
                      const key = poolKey(customer.id, pool.id)
                      const isPoolSelected = selectedIds.has(key)
                      return (
                        <div
                          key={pool.id}
                          className={cn(
                            "flex items-center gap-2 rounded-md pl-7 pr-2.5 py-1 transition-colors cursor-pointer",
                            isPoolSelected
                              ? "bg-primary/10 border border-primary/20"
                              : "hover:bg-muted/40 border border-transparent"
                          )}
                          onClick={() => onToggleSelect(key)}
                        >
                          {/* Pool checkbox */}
                          <button
                            type="button"
                            className="flex-shrink-0 text-muted-foreground/40 hover:text-primary transition-colors cursor-pointer"
                            onClick={(e) => {
                              e.stopPropagation()
                              onToggleSelect(key)
                            }}
                            aria-label={isPoolSelected ? `Deselect ${pool.name}` : `Select ${pool.name}`}
                          >
                            {isPoolSelected ? (
                              <CheckSquareIcon className="h-3.5 w-3.5 text-primary" />
                            ) : (
                              <SquareIcon className="h-3.5 w-3.5" />
                            )}
                          </button>

                          {/* Pool name */}
                          <div className="flex items-center gap-1 min-w-0 flex-1">
                            <DropletIcon className="h-2.5 w-2.5 flex-shrink-0 text-muted-foreground/40" />
                            <span className="text-xs text-muted-foreground truncate">{pool.name}</span>
                          </div>
                        </div>
                      )
                    })}
                  </div>
                )}
              </div>
            )
          })
        )}
      </div>

      {/* ── Bulk assign footer ─────────────────────────────────────────────── */}
      {selectedPoolCount > 0 && (
        <div className="flex-shrink-0 px-3 py-2.5 border-t border-border/60 bg-card/50">
          <button
            type="button"
            disabled={isAssigning}
            onClick={() => onAssign(getSelectedPairs())}
            className="w-full rounded-md bg-primary px-3 py-2 text-xs font-semibold text-primary-foreground hover:bg-primary/90 transition-colors cursor-pointer disabled:opacity-60 disabled:cursor-not-allowed"
          >
            {isAssigning
              ? "Assigning..."
              : `Assign Selected (${selectedPoolCount})`}
          </button>
        </div>
      )}
    </div>
  )
}
