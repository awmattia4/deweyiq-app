"use client"

import { useState } from "react"
import { Button } from "@/components/ui/button"
import { AddEquipmentDialog } from "./add-equipment-dialog"
import { Cog, Plus, Wrench } from "lucide-react"

// ─── Types ─────────────────────────────────────────────────────────────────────

type EquipmentItem = {
  id: string
  type: string
  brand: string | null
  model: string | null
  install_date: string | null
  notes: string | null
}

type Pool = {
  id: string
  name: string
  type: "pool" | "spa" | "fountain"
  equipment: EquipmentItem[]
}

interface EquipmentListProps {
  pools: Pool[]
}

// ─── Equipment Row ────────────────────────────────────────────────────────────

function EquipmentRow({ item }: { item: EquipmentItem }) {
  const brandModel = [item.brand, item.model].filter(Boolean).join(" / ")

  const formattedDate = item.install_date
    ? new Date(item.install_date + "T00:00:00").toLocaleDateString("en-US", {
        month: "short",
        day: "numeric",
        year: "numeric",
      })
    : null

  return (
    <div className="flex items-center justify-between gap-3 py-2 border-b border-border last:border-0">
      <div className="flex items-center gap-2 min-w-0">
        <Cog className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
        <div className="min-w-0">
          <span className="text-sm font-medium capitalize">{item.type}</span>
          {brandModel && (
            <span className="text-sm text-muted-foreground ml-1.5">— {brandModel}</span>
          )}
        </div>
      </div>
      {formattedDate && (
        <span className="text-xs text-muted-foreground shrink-0">{formattedDate}</span>
      )}
    </div>
  )
}

// ─── Pool Equipment Section ───────────────────────────────────────────────────

function PoolEquipmentSection({ pool }: { pool: Pool }) {
  const [dialogOpen, setDialogOpen] = useState(false)

  return (
    <div className="flex flex-col gap-2">
      {/* Pool section header */}
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-semibold capitalize">{pool.name}</h3>
        <Button size="sm" variant="outline" onClick={() => setDialogOpen(true)}>
          <Plus className="h-3.5 w-3.5 mr-1" />
          Add
        </Button>
      </div>

      {/* Equipment list or empty state */}
      {pool.equipment.length === 0 ? (
        <p className="text-xs text-muted-foreground py-3 text-center border border-dashed border-border rounded-md">
          No equipment tracked for this pool.
        </p>
      ) : (
        <div className="rounded-md border border-border px-3">
          {pool.equipment.map((item) => (
            <EquipmentRow key={item.id} item={item} />
          ))}
        </div>
      )}

      {/* Add Equipment dialog for this pool */}
      <AddEquipmentDialog
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        poolId={pool.id}
        poolName={pool.name}
      />
    </div>
  )
}

// ─── Component ────────────────────────────────────────────────────────────────

/**
 * EquipmentList — Equipment tab content showing equipment grouped by pool.
 *
 * Each pool has its own section with a header and compact equipment list.
 * The "+ Add" button per section opens AddEquipmentDialog for that pool.
 *
 * Empty state (no pools): guides user to add pools first.
 */
export function EquipmentList({ pools }: EquipmentListProps) {
  if (pools.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center gap-3 py-14 text-center rounded-lg border border-dashed border-border">
        <Wrench className="h-8 w-8 text-muted-foreground/50" />
        <div>
          <p className="text-sm font-medium text-muted-foreground">No pools yet</p>
          <p className="text-xs text-muted-foreground/70 mt-1">
            Add pools first, then track equipment for each pool.
          </p>
        </div>
      </div>
    )
  }

  return (
    <div className="flex flex-col gap-6">
      {pools.map((pool) => (
        <PoolEquipmentSection key={pool.id} pool={pool} />
      ))}
    </div>
  )
}
