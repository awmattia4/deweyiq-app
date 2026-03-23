"use client"

/**
 * Phase 13: Purchasing Dashboard
 *
 * Fleet-wide purchasing view with supplier/urgency grouping toggles.
 * Shows all shopping list items with status 'needed' or 'ordered' across the org.
 *
 * Features:
 * - Toggle between supplier and urgency grouping
 * - Collapsible group cards with item list
 * - Urgency badges and source indicators
 * - "Create PO" button per group (opens PoBuilder)
 * - "Mark All Ordered" quick action (checklist mode)
 * - Top stats bar: total needed, total ordered
 */

import { useState, useTransition } from "react"
import { cn } from "@/lib/utils"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import { ChevronDownIcon, ChevronRightIcon } from "lucide-react"
import { getPurchasingDashboard } from "@/actions/purchasing"
import type { PurchasingDashboardData, PurchasingGroup } from "@/actions/purchasing"
import { PoBuilder } from "./po-builder"

// ---------------------------------------------------------------------------
// Props
// ---------------------------------------------------------------------------

interface PurchasingDashboardProps {
  initialData: PurchasingDashboardData
}

// ---------------------------------------------------------------------------
// Source badge
// ---------------------------------------------------------------------------

function SourceBadge({ source }: { source: string | null }) {
  if (!source) return null
  const labels: Record<string, string> = {
    work_order: "WO",
    project: "Project",
    low_inventory: "Low Stock",
    forecast: "Forecast",
    manual: "Manual",
  }
  return (
    <Badge variant="outline" className="text-xs px-1.5 py-0">
      {labels[source] ?? source}
    </Badge>
  )
}

// ---------------------------------------------------------------------------
// GroupCard
// ---------------------------------------------------------------------------

function GroupCard({
  group,
  onCreatePo,
}: {
  group: PurchasingGroup
  onCreatePo: (group: PurchasingGroup) => void
}) {
  const [open, setOpen] = useState(true)

  return (
    <Card className="overflow-hidden">
      <CardHeader
        className="cursor-pointer hover:bg-muted/30 transition-colors py-3 px-4"
        onClick={() => setOpen(!open)}
      >
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            {open ? (
              <ChevronDownIcon className="h-4 w-4 text-muted-foreground shrink-0" />
            ) : (
              <ChevronRightIcon className="h-4 w-4 text-muted-foreground shrink-0" />
            )}
            <CardTitle className="text-sm font-semibold">{group.label}</CardTitle>
            <Badge variant="secondary" className="text-xs">
              {group.itemCount} item{group.itemCount !== 1 ? "s" : ""}
            </Badge>
          </div>
          <div className="flex items-center gap-2" onClick={(e) => e.stopPropagation()}>
            <Button
              size="sm"
              variant="outline"
              className="h-7 text-xs"
              onClick={() => onCreatePo(group)}
            >
              Create PO
            </Button>
          </div>
        </div>
      </CardHeader>
      {open && (
        <CardContent className="pt-0 px-0 pb-0">
          <div className="divide-y divide-border">
            {group.items.map((item) => (
              <div key={item.id} className="flex items-start gap-3 px-4 py-3">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="text-sm font-medium">{item.itemName}</span>
                    {item.isUrgent && (
                      <Badge variant="destructive" className="text-xs px-1.5 py-0">
                        Urgent
                      </Badge>
                    )}
                    <SourceBadge source={item.sourceType} />
                  </div>
                  <div className="flex items-center gap-3 mt-0.5 text-xs text-muted-foreground">
                    <span>
                      {parseFloat(item.quantityNeeded)} {item.unit}
                    </span>
                    {item.techName && <span>Tech: {item.techName}</span>}
                    {item.vendor && <span>Supplier: {item.vendor}</span>}
                  </div>
                </div>
                <Badge
                  variant={item.status === "ordered" ? "default" : "secondary"}
                  className="text-xs shrink-0 mt-0.5"
                >
                  {item.status}
                </Badge>
              </div>
            ))}
          </div>
        </CardContent>
      )}
    </Card>
  )
}

// ---------------------------------------------------------------------------
// PurchasingDashboard
// ---------------------------------------------------------------------------

export function PurchasingDashboard({ initialData }: PurchasingDashboardProps) {
  const [groupBy, setGroupBy] = useState<"supplier" | "urgency">("urgency")
  const [data, setData] = useState<PurchasingDashboardData>(initialData)
  const [isPending, startTransition] = useTransition()
  const [poBuilderGroup, setPoBuilderGroup] = useState<PurchasingGroup | null>(null)

  function handleGroupByChange(newGroupBy: "supplier" | "urgency") {
    setGroupBy(newGroupBy)
    startTransition(async () => {
      const fresh = await getPurchasingDashboard(newGroupBy)
      setData(fresh)
    })
  }

  function handleRefresh() {
    startTransition(async () => {
      const fresh = await getPurchasingDashboard(groupBy)
      setData(fresh)
    })
  }

  return (
    <div className="flex flex-col gap-5">
      {/* Stats bar */}
      <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
        <Card>
          <CardContent className="pt-4 pb-4">
            <p className="text-xs text-muted-foreground uppercase tracking-wider mb-1">Needed</p>
            <p className="text-2xl font-bold">{data.totalItemsNeeded}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4 pb-4">
            <p className="text-xs text-muted-foreground uppercase tracking-wider mb-1">Ordered</p>
            <p className="text-2xl font-bold">{data.totalItemsOrdered}</p>
          </CardContent>
        </Card>
        <Card className="col-span-2 sm:col-span-1">
          <CardContent className="pt-4 pb-4">
            <p className="text-xs text-muted-foreground uppercase tracking-wider mb-1">Total Outstanding</p>
            <p className="text-2xl font-bold">{data.totalItemsNeeded + data.totalItemsOrdered}</p>
          </CardContent>
        </Card>
      </div>

      {/* Grouping toggle */}
      <div className="flex items-center gap-2">
        <span className="text-sm text-muted-foreground">Group by:</span>
        <div className="flex rounded-md border border-border overflow-hidden">
          <button
            onClick={() => handleGroupByChange("urgency")}
            disabled={isPending}
            className={cn(
              "px-3 py-1.5 text-sm font-medium transition-colors",
              groupBy === "urgency"
                ? "bg-primary text-primary-foreground"
                : "bg-background text-muted-foreground hover:bg-muted"
            )}
          >
            Urgency
          </button>
          <button
            onClick={() => handleGroupByChange("supplier")}
            disabled={isPending}
            className={cn(
              "px-3 py-1.5 text-sm font-medium transition-colors border-l border-border",
              groupBy === "supplier"
                ? "bg-primary text-primary-foreground"
                : "bg-background text-muted-foreground hover:bg-muted"
            )}
          >
            Supplier
          </button>
        </div>
        {isPending && (
          <span className="text-xs text-muted-foreground animate-pulse">Refreshing...</span>
        )}
      </div>

      {/* Groups */}
      {data.groups.length === 0 ? (
        <p className="text-sm text-muted-foreground italic">
          No outstanding purchasing items.
        </p>
      ) : (
        <div className="flex flex-col gap-3">
          {data.groups.map((group) => (
            <GroupCard key={group.key} group={group} onCreatePo={setPoBuilderGroup} />
          ))}
        </div>
      )}

      {/* PO Builder modal */}
      {poBuilderGroup && (
        <PoBuilder
          open
          preselectedItems={poBuilderGroup.items.map((item) => ({
            shoppingListItemId: item.id,
            itemName: item.itemName,
            quantity: item.quantityNeeded,
            unit: item.unit,
            unitPrice: "0",
          }))}
          supplierName={poBuilderGroup.key !== "Unassigned" && poBuilderGroup.key !== "urgent-needed" && poBuilderGroup.key !== "needed" && poBuilderGroup.key !== "ordered"
            ? poBuilderGroup.key
            : undefined}
          onClose={() => {
            setPoBuilderGroup(null)
            handleRefresh()
          }}
        />
      )}
    </div>
  )
}
