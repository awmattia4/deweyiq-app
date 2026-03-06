"use client"

import { useState, useTransition } from "react"
import { addEquipment } from "@/actions/equipment"
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
import { Button } from "@/components/ui/button"

// ─── Types ─────────────────────────────────────────────────────────────────────

type FormState = {
  type: string
  brand: string
  model: string
  install_date: string
  notes: string
}

const defaultState: FormState = {
  type: "",
  brand: "",
  model: "",
  install_date: "",
  notes: "",
}

// Common equipment types for datalist suggestions
const EQUIPMENT_SUGGESTIONS = [
  "Pump",
  "Filter",
  "Heater",
  "Cleaner",
  "Light",
  "Salt Cell",
  "Control System",
  "Other",
]

interface AddEquipmentDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  poolId: string
  poolName: string
}

// ─── Validation ────────────────────────────────────────────────────────────────

function validate(state: FormState): Record<string, string> {
  const errors: Record<string, string> = {}

  if (!state.type.trim()) {
    errors.type = "Equipment type is required."
  }

  return errors
}

// ─── Component ─────────────────────────────────────────────────────────────────

/**
 * AddEquipmentDialog — modal form for adding equipment to a pool.
 *
 * Fields: Type (input with datalist), Brand, Model, Install Date, Notes.
 * Uses plain useState + inline validation to match codebase pattern.
 */
export function AddEquipmentDialog({
  open,
  onOpenChange,
  poolId,
  poolName,
}: AddEquipmentDialogProps) {
  const [form, setForm] = useState<FormState>(defaultState)
  const [errors, setErrors] = useState<Record<string, string>>({})
  const [rootError, setRootError] = useState<string | null>(null)
  const [isPending, startTransition] = useTransition()

  function update(field: keyof FormState, value: string) {
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
      const result = await addEquipment({
        pool_id: poolId,
        type: form.type.trim(),
        brand: form.brand.trim() || undefined,
        model: form.model.trim() || undefined,
        install_date: form.install_date || undefined,
        notes: form.notes.trim() || undefined,
      })

      if (result.success) {
        handleOpenChange(false)
      } else {
        setRootError(result.error ?? "Failed to add equipment. Please try again.")
      }
    })
  }

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="sm:max-w-[440px]">
        <DialogHeader>
          <DialogTitle>Add Equipment</DialogTitle>
          <DialogDescription>
            Add equipment to <strong>{poolName}</strong>. Type is required.
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-4">

          {/* Type with datalist suggestions */}
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="eq-type">
              Type <span className="text-destructive">*</span>
            </Label>
            <Input
              id="eq-type"
              list="equipment-type-suggestions"
              placeholder="Pump, Filter, Heater..."
              value={form.type}
              onChange={(e) => update("type", e.target.value)}
              disabled={isPending}
              aria-invalid={!!errors.type}
              autoComplete="off"
            />
            <datalist id="equipment-type-suggestions">
              {EQUIPMENT_SUGGESTIONS.map((s) => (
                <option key={s} value={s} />
              ))}
            </datalist>
            {errors.type && (
              <p className="text-xs text-destructive" role="alert">{errors.type}</p>
            )}
          </div>

          <div className="grid grid-cols-2 gap-3">
            {/* Brand */}
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="eq-brand">Brand</Label>
              <Input
                id="eq-brand"
                placeholder="Pentair"
                value={form.brand}
                onChange={(e) => update("brand", e.target.value)}
                disabled={isPending}
              />
            </div>

            {/* Model */}
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="eq-model">Model</Label>
              <Input
                id="eq-model"
                placeholder="IntelliFlo VSF"
                value={form.model}
                onChange={(e) => update("model", e.target.value)}
                disabled={isPending}
              />
            </div>
          </div>

          {/* Install Date */}
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="eq-install-date">Install Date</Label>
            <Input
              id="eq-install-date"
              type="date"
              value={form.install_date}
              onChange={(e) => update("install_date", e.target.value)}
              disabled={isPending}
            />
          </div>

          {/* Notes */}
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="eq-notes">Notes</Label>
            <textarea
              id="eq-notes"
              className="flex min-h-[72px] w-full rounded-md border border-input bg-transparent px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50 resize-none"
              placeholder="Any notes about this equipment..."
              value={form.notes}
              onChange={(e) => update("notes", e.target.value)}
              disabled={isPending}
            />
          </div>

          {/* Root error */}
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
              {isPending ? "Adding..." : "Add Equipment"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
