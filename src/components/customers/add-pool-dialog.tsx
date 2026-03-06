"use client"

import { useState, useTransition } from "react"
import { addPool } from "@/actions/pools"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { Button } from "@/components/ui/button"
import { Separator } from "@/components/ui/separator"

// ─── Types ─────────────────────────────────────────────────────────────────────

type PoolType = "pool" | "spa" | "fountain"
type SurfaceType = "plaster" | "pebble" | "fiberglass" | "vinyl" | "tile"
type SanitizerType = "chlorine" | "salt" | "bromine" | "biguanide"

type FormState = {
  name: string
  type: PoolType
  volume_gallons: string
  surface_type: SurfaceType | ""
  sanitizer_type: SanitizerType | ""
  notes: string
}

const defaultState: FormState = {
  name: "",
  type: "pool",
  volume_gallons: "",
  surface_type: "",
  sanitizer_type: "",
  notes: "",
}

interface AddPoolDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  customerId: string
}

// ─── Validation ────────────────────────────────────────────────────────────────

function validate(state: FormState): Record<string, string> {
  const errors: Record<string, string> = {}

  if (!state.name.trim()) {
    errors.name = "Pool name is required."
  }

  if (state.volume_gallons !== "") {
    const vol = Number(state.volume_gallons)
    if (!Number.isInteger(vol) || vol <= 0) {
      errors.volume_gallons = "Volume must be a positive whole number."
    }
  }

  return errors
}

// ─── Component ─────────────────────────────────────────────────────────────────

/**
 * AddPoolDialog — modal form for adding a pool, spa, or fountain.
 *
 * Uses plain useState + inline validation (no react-hook-form + zod)
 * to match the established codebase pattern (AddCustomerDialog).
 *
 * Three visual sections: Basic Info, Water Chemistry, Notes.
 */
export function AddPoolDialog({ open, onOpenChange, customerId }: AddPoolDialogProps) {
  const [form, setForm] = useState<FormState>(defaultState)
  const [errors, setErrors] = useState<Record<string, string>>({})
  const [rootError, setRootError] = useState<string | null>(null)
  const [isPending, startTransition] = useTransition()

  function update<K extends keyof FormState>(field: K, value: FormState[K]) {
    setForm((prev) => ({ ...prev, [field]: value }))
    if (errors[field]) {
      setErrors((prev) => {
        const next = { ...prev }
        delete next[field]
        return next
      })
    }
  }

  function handleOpenChange(next: boolean) {
    if (!next) {
      setForm(defaultState)
      setErrors({})
      setRootError(null)
    }
    onOpenChange(next)
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setRootError(null)

    const validationErrors = validate(form)
    if (Object.keys(validationErrors).length > 0) {
      setErrors(validationErrors)
      return
    }

    startTransition(async () => {
      const result = await addPool({
        customer_id: customerId,
        name: form.name.trim(),
        type: form.type,
        volume_gallons: form.volume_gallons !== "" ? Number(form.volume_gallons) : undefined,
        surface_type: form.surface_type || undefined,
        sanitizer_type: form.sanitizer_type || undefined,
        notes: form.notes.trim() || undefined,
      })

      if (result.success) {
        handleOpenChange(false)
      } else {
        setRootError(result.error ?? "Failed to add pool. Please try again.")
      }
    })
  }

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="sm:max-w-[500px] max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Add Pool / Spa / Fountain</DialogTitle>
          <DialogDescription>
            Add a body of water to this customer. Name and type are required.
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-5">

          {/* ── Basic Info ────────────────────────────────────────────── */}
          <div className="space-y-3">
            <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
              Basic Info
            </p>

            {/* Name */}
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="pool-name">
                Name <span className="text-destructive">*</span>
              </Label>
              <Input
                id="pool-name"
                placeholder="Main Pool"
                value={form.name}
                onChange={(e) => update("name", e.target.value)}
                disabled={isPending}
                aria-invalid={!!errors.name}
              />
              {errors.name && (
                <p className="text-xs text-destructive" role="alert">{errors.name}</p>
              )}
            </div>

            <div className="grid grid-cols-2 gap-3">
              {/* Type */}
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="pool-type">Type</Label>
                <Select
                  value={form.type}
                  onValueChange={(v) => update("type", v as PoolType)}
                  disabled={isPending}
                >
                  <SelectTrigger id="pool-type">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="pool">Pool</SelectItem>
                    <SelectItem value="spa">Spa</SelectItem>
                    <SelectItem value="fountain">Fountain</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              {/* Volume */}
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="pool-volume">Volume (gallons)</Label>
                <Input
                  id="pool-volume"
                  type="number"
                  placeholder="15000"
                  min="1"
                  step="1"
                  value={form.volume_gallons}
                  onChange={(e) => update("volume_gallons", e.target.value)}
                  disabled={isPending}
                  aria-invalid={!!errors.volume_gallons}
                />
                {errors.volume_gallons && (
                  <p className="text-xs text-destructive" role="alert">{errors.volume_gallons}</p>
                )}
              </div>
            </div>
          </div>

          <Separator />

          {/* ── Water Chemistry ───────────────────────────────────────── */}
          <div className="space-y-3">
            <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
              Water Chemistry
            </p>

            <div className="grid grid-cols-2 gap-3">
              {/* Surface Type */}
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="pool-surface">Surface Type</Label>
                <Select
                  value={form.surface_type || "none"}
                  onValueChange={(v) => update("surface_type", v === "none" ? "" : v as SurfaceType)}
                  disabled={isPending}
                >
                  <SelectTrigger id="pool-surface">
                    <SelectValue placeholder="Select surface" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">Not specified</SelectItem>
                    <SelectItem value="plaster">Plaster</SelectItem>
                    <SelectItem value="pebble">Pebble</SelectItem>
                    <SelectItem value="fiberglass">Fiberglass</SelectItem>
                    <SelectItem value="vinyl">Vinyl</SelectItem>
                    <SelectItem value="tile">Tile</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              {/* Sanitizer Type */}
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="pool-sanitizer">Sanitizer Type</Label>
                <Select
                  value={form.sanitizer_type || "none"}
                  onValueChange={(v) => update("sanitizer_type", v === "none" ? "" : v as SanitizerType)}
                  disabled={isPending}
                >
                  <SelectTrigger id="pool-sanitizer">
                    <SelectValue placeholder="Select sanitizer" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">Not specified</SelectItem>
                    <SelectItem value="chlorine">Chlorine</SelectItem>
                    <SelectItem value="salt">Salt</SelectItem>
                    <SelectItem value="bromine">Bromine</SelectItem>
                    <SelectItem value="biguanide">Biguanide</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
          </div>

          <Separator />

          {/* ── Notes ─────────────────────────────────────────────────── */}
          <div className="space-y-3">
            <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
              Notes
            </p>

            <div className="flex flex-col gap-1.5">
              <Label htmlFor="pool-notes">Notes</Label>
              <textarea
                id="pool-notes"
                className="flex min-h-[80px] w-full rounded-md border border-input bg-transparent px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50 resize-none"
                placeholder="Any additional notes about this pool..."
                value={form.notes}
                onChange={(e) => update("notes", e.target.value)}
                disabled={isPending}
              />
            </div>
          </div>

          {/* ── Root error ────────────────────────────────────────────── */}
          {rootError && (
            <p className="text-sm text-destructive" role="alert">
              {rootError}
            </p>
          )}

          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => handleOpenChange(false)}
              disabled={isPending}
            >
              Cancel
            </Button>
            <Button type="submit" disabled={isPending}>
              {isPending ? "Adding..." : "Add Pool"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
