"use client"

import { useState } from "react"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader } from "@/components/ui/card"
import { AddPoolDialog } from "./add-pool-dialog"
import { Droplets, Plus, Waves } from "lucide-react"

// ─── Types ─────────────────────────────────────────────────────────────────────

type Pool = {
  id: string
  name: string
  type: "pool" | "spa" | "fountain"
  volume_gallons: number | null
  surface_type: string | null
  sanitizer_type: string | null
  notes: string | null
  equipment: Array<{ id: string }>
}

interface PoolListProps {
  pools: Pool[]
  customerId: string
}

// ─── Type badge helpers ────────────────────────────────────────────────────────

type BadgeVariant = "default" | "secondary" | "outline"

const TYPE_LABELS: Record<string, string> = {
  pool: "Pool",
  spa: "Spa",
  fountain: "Fountain",
}

const TYPE_VARIANTS: Record<string, BadgeVariant> = {
  pool: "default",
  spa: "secondary",
  fountain: "outline",
}

const TYPE_ICONS: Record<string, React.ElementType> = {
  pool: Waves,
  spa: Droplets,
  fountain: Droplets,
}

// ─── Pool Card ────────────────────────────────────────────────────────────────

function PoolCard({ pool }: { pool: Pool }) {
  const typeLabel = TYPE_LABELS[pool.type] ?? pool.type
  const typeVariant = TYPE_VARIANTS[pool.type] ?? "outline"
  const TypeIcon = TYPE_ICONS[pool.type] ?? Waves

  const equipmentCount = pool.equipment.length

  return (
    <Card className="flex flex-col gap-0">
      <CardHeader className="pb-2 pt-4 px-4">
        <div className="flex items-start justify-between gap-2">
          <div className="flex items-center gap-2 min-w-0">
            <TypeIcon className="h-4 w-4 text-muted-foreground shrink-0" />
            <span className="font-medium truncate">{pool.name}</span>
          </div>
          <div className="flex items-center gap-1.5 shrink-0">
            <Badge variant={typeVariant}>{typeLabel}</Badge>
            {equipmentCount > 0 && (
              <Badge variant="outline" className="text-xs">
                {equipmentCount} equip.
              </Badge>
            )}
          </div>
        </div>
      </CardHeader>

      <CardContent className="px-4 pb-4">
        <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground">
          {pool.volume_gallons && (
            <span>{pool.volume_gallons.toLocaleString()} gal</span>
          )}
          {pool.surface_type && (
            <span className="capitalize">{pool.surface_type}</span>
          )}
          {pool.sanitizer_type && (
            <span className="capitalize">{pool.sanitizer_type}</span>
          )}
        </div>

        {pool.notes && (
          <p className="mt-2 text-xs text-muted-foreground line-clamp-2">{pool.notes}</p>
        )}
      </CardContent>
    </Card>
  )
}

// ─── Component ────────────────────────────────────────────────────────────────

/**
 * PoolList — Pools tab content showing pool cards with Add Pool button.
 *
 * Supports Pool, Spa, and Fountain types as distinct cards.
 * Empty state prompts user to add their first pool.
 */
export function PoolList({ pools, customerId }: PoolListProps) {
  const [dialogOpen, setDialogOpen] = useState(false)

  return (
    <div className="flex flex-col gap-4">
      {/* ── Header row ──────────────────────────────────────────────────── */}
      <div className="flex items-center justify-between">
        <h2 className="text-sm font-semibold">
          {pools.length === 0 ? "No Pools" : `${pools.length} ${pools.length === 1 ? "Pool" : "Pools / Spas / Fountains"}`}
        </h2>
        <Button size="sm" onClick={() => setDialogOpen(true)}>
          <Plus className="h-4 w-4 mr-1.5" />
          Add Pool
        </Button>
      </div>

      {/* ── Pool cards ──────────────────────────────────────────────────── */}
      {pools.length === 0 ? (
        <div className="flex flex-col items-center justify-center gap-3 py-14 text-center rounded-lg border border-dashed border-border">
          <Waves className="h-8 w-8 text-muted-foreground/50" />
          <div>
            <p className="text-sm font-medium text-muted-foreground">No pools added yet</p>
            <p className="text-xs text-muted-foreground/70 mt-1">
              Add a pool, spa, or fountain to get started.
            </p>
          </div>
          <Button size="sm" variant="outline" onClick={() => setDialogOpen(true)}>
            <Plus className="h-4 w-4 mr-1.5" />
            Add Pool
          </Button>
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          {pools.map((pool) => (
            <PoolCard key={pool.id} pool={pool} />
          ))}
        </div>
      )}

      {/* ── Add Pool dialog ─────────────────────────────────────────────── */}
      <AddPoolDialog
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        customerId={customerId}
        existingPools={pools}
      />
    </div>
  )
}
