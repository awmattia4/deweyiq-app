"use client"

/**
 * Phase 13: Prep Tab — "What to Bring" Summary
 *
 * Displays pre-route summary organized by urgency:
 * - Missing (red): items needed but not on truck
 * - Low (amber): items on truck but below needed quantity
 * - Stocked (neutral): items at or above needed quantity (collapsed by default)
 * - Predicted (collapsible): forecast-based estimates from dosing history
 *
 * Per plan: sorted by urgency, color-coded.
 * Actionable: "Add to List" button on missing/low items creates a shopping list entry.
 */

import { useState, useTransition } from "react"
import { cn } from "@/lib/utils"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { addShoppingListItem } from "@/actions/shopping-lists"
import type { WhatToBringItem, WhatToBringResult } from "@/actions/what-to-bring"

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface PrepTabProps {
  techId: string
  prepData: WhatToBringResult
}

// ---------------------------------------------------------------------------
// Item Row
// ---------------------------------------------------------------------------

interface PrepItemRowProps {
  item: WhatToBringItem
  techId: string
  showAddToList: boolean
}

function PrepItemRow({ item, techId, showAddToList }: PrepItemRowProps) {
  const [isPending, startTransition] = useTransition()
  const [added, setAdded] = useState(false)

  function handleAddToList() {
    startTransition(async () => {
      try {
        await addShoppingListItem({
          itemName: item.itemName,
          category: item.category,
          quantityNeeded: item.shortfall > 0 ? item.shortfall : item.quantityNeeded,
          unit: item.unit,
          techId,
          sourceType: item.source === "wo" ? "work_order" : "forecast",
          isUrgent: item.urgency === "missing",
          catalogItemId: item.catalogItemId ?? null,
          chemicalProductId: item.chemicalProductId ?? null,
        })
        setAdded(true)
      } catch (err) {
        console.error("Failed to add to shopping list:", err)
      }
    })
  }

  return (
    <div className="flex items-center gap-3 py-2 border-b border-border/40 last:border-0">
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2">
          <span className="text-sm font-medium truncate">{item.itemName}</span>
          {item.source === "wo" && (
            <Badge variant="outline" className="text-[10px] border-blue-500/40 text-blue-400 shrink-0">
              WO
            </Badge>
          )}
        </div>

        <div className="flex items-center gap-3 mt-0.5 text-xs text-muted-foreground">
          <span>Need: {Math.ceil(item.quantityNeeded * 100) / 100} {item.unit}</span>
          {item.urgency === "missing" ? (
            <span className="text-red-400">0 on truck</span>
          ) : item.urgency === "low" ? (
            <span className="text-amber-400">
              {Math.ceil(item.quantityOnTruck * 100) / 100} on truck
              &nbsp;·&nbsp;
              short {Math.ceil(item.shortfall * 100) / 100}
            </span>
          ) : (
            <span className="text-green-400/80">
              {Math.ceil(item.quantityOnTruck * 100) / 100} on truck
            </span>
          )}
        </div>
      </div>

      {showAddToList && (
        <div className="shrink-0">
          {added ? (
            <span className="text-xs text-green-400">Added</span>
          ) : (
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="h-7 px-2 text-xs text-muted-foreground hover:text-foreground"
              onClick={handleAddToList}
              disabled={isPending}
            >
              {isPending ? "..." : "Add to List"}
            </Button>
          )}
        </div>
      )}
    </div>
  )
}

// ---------------------------------------------------------------------------
// Section
// ---------------------------------------------------------------------------

interface SectionProps {
  title: string
  count: number
  items: WhatToBringItem[]
  techId: string
  colorClass: string
  borderClass: string
  bgClass: string
  defaultCollapsed?: boolean
  showAddToList?: boolean
  estimateNote?: string
}

function Section({
  title,
  count,
  items,
  techId,
  colorClass,
  borderClass,
  bgClass,
  defaultCollapsed = false,
  showAddToList = false,
  estimateNote,
}: SectionProps) {
  const [collapsed, setCollapsed] = useState(defaultCollapsed)

  if (items.length === 0) return null

  return (
    <div className={cn("rounded-lg border overflow-hidden", borderClass, bgClass)}>
      <button
        type="button"
        onClick={() => setCollapsed((c) => !c)}
        className="flex items-center justify-between w-full px-4 py-3 text-left"
      >
        <div className="flex items-center gap-2">
          <span className={cn("text-sm font-semibold", colorClass)}>{title}</span>
          <span
            className={cn(
              "text-xs font-semibold rounded-full px-2 py-0.5",
              colorClass,
              "bg-current/10"
            )}
            style={{ color: "inherit" }}
          >
            {count}
          </span>
        </div>
        <span className="text-xs text-muted-foreground">{collapsed ? "Show" : "Hide"}</span>
      </button>

      {!collapsed && (
        <div className="px-4 pb-3">
          {estimateNote && (
            <p className="text-xs text-muted-foreground mb-2 italic">{estimateNote}</p>
          )}
          {items.map((item, i) => (
            <PrepItemRow key={i} item={item} techId={techId} showAddToList={showAddToList} />
          ))}
        </div>
      )}
    </div>
  )
}

// ---------------------------------------------------------------------------
// Main Component
// ---------------------------------------------------------------------------

export function PrepTab({ techId, prepData }: PrepTabProps) {
  const { missing, low, stocked, predicted } = prepData

  const totalConfirmed = missing.length + low.length + stocked.length
  const hasIssues = missing.length > 0 || low.length > 0

  return (
    <div className="flex flex-col gap-4">
      {/* Summary header */}
      <div>
        <h2 className="text-base font-semibold">What to Bring</h2>
        <p className="text-sm text-muted-foreground mt-0.5">
          {totalConfirmed === 0 && predicted.length === 0
            ? "No requirements found for today's route."
            : hasIssues
              ? `${missing.length + low.length} item${missing.length + low.length !== 1 ? "s" : ""} need${missing.length + low.length === 1 ? "s" : ""} attention before you head out.`
              : "You're fully stocked for today's route."}
        </p>
      </div>

      {/* Empty state */}
      {totalConfirmed === 0 && predicted.length === 0 && (
        <p className="text-sm text-muted-foreground italic text-center py-6">
          No stops scheduled for today, or no inventory data to compare against.
        </p>
      )}

      {/* Missing — red */}
      <Section
        title="Missing"
        count={missing.length}
        items={missing}
        techId={techId}
        colorClass="text-red-400"
        borderClass="border-red-500/30"
        bgClass="bg-red-500/5"
        showAddToList
      />

      {/* Low — amber */}
      <Section
        title="Running Low"
        count={low.length}
        items={low}
        techId={techId}
        colorClass="text-amber-400"
        borderClass="border-amber-500/30"
        bgClass="bg-amber-500/5"
        showAddToList
      />

      {/* Stocked — neutral, collapsed by default */}
      <Section
        title="Stocked"
        count={stocked.length}
        items={stocked}
        techId={techId}
        colorClass="text-green-400"
        borderClass="border-green-500/20"
        bgClass="bg-green-500/5"
        defaultCollapsed
      />

      {/* Predicted Needs — separate section, clearly estimated */}
      <Section
        title="Predicted Needs"
        count={predicted.length}
        items={predicted}
        techId={techId}
        colorClass="text-cyan-400"
        borderClass="border-cyan-500/20"
        bgClass="bg-cyan-500/5"
        defaultCollapsed
        showAddToList
        estimateNote="Estimated based on average chemical usage from recent visits. These are predictions, not confirmed requirements."
      />
    </div>
  )
}
