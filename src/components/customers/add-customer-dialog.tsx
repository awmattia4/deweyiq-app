"use client"

import { useState, useTransition } from "react"
import { createCustomer } from "@/actions/customers"
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
import { AddressAutocomplete } from "@/components/ui/address-autocomplete"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { Button } from "@/components/ui/button"
import { Separator } from "@/components/ui/separator"
import { Lightbulb, X } from "lucide-react"

// ─── Form state type ───────────────────────────────────────────────────────────

type FormState = {
  full_name: string
  address: string
  phone: string
  email: string
  gate_code: string
  access_notes: string
  status: "active" | "paused" | "cancelled"
  route_name: string
}

const defaultState: FormState = {
  full_name: "",
  address: "",
  phone: "",
  email: "",
  gate_code: "",
  access_notes: "",
  status: "active",
  route_name: "",
}

// ─── Props ─────────────────────────────────────────────────────────────────────

interface AddCustomerDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
}

// ─── Validation ────────────────────────────────────────────────────────────────

function validate(state: FormState): Record<string, string> {
  const errors: Record<string, string> = {}

  if (!state.full_name.trim()) {
    errors.full_name = "Name is required."
  } else if (state.full_name.trim().length > 200) {
    errors.full_name = "Name must be 200 characters or fewer."
  }

  if (state.email.trim() && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(state.email.trim())) {
    errors.email = "Invalid email address."
  }

  return errors
}

// ─── Component ─────────────────────────────────────────────────────────────────

export function AddCustomerDialog({ open, onOpenChange }: AddCustomerDialogProps) {
  const [form, setForm] = useState<FormState>(defaultState)
  const [coords, setCoords] = useState<{ lat: number; lng: number } | null>(null)
  const [errors, setErrors] = useState<Record<string, string>>({})
  const [rootError, setRootError] = useState<string | null>(null)
  const [isPending, startTransition] = useTransition()
  const [gateCodeDismissed, setGateCodeDismissed] = useState(false)

  function update(field: keyof FormState, value: string) {
    setForm((prev) => ({ ...prev, [field]: value }))
    // Clear field error on change
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
      setCoords(null)
      setErrors({})
      setRootError(null)
      setGateCodeDismissed(false)
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
      const result = await createCustomer({
        full_name: form.full_name.trim(),
        address: form.address.trim() || undefined,
        lat: coords?.lat,
        lng: coords?.lng,
        phone: form.phone.trim() || undefined,
        email: form.email.trim() || undefined,
        gate_code: form.gate_code.trim() || undefined,
        access_notes: form.access_notes.trim() || undefined,
        status: form.status,
        route_name: form.route_name.trim() || undefined,
      })

      if (result.success) {
        handleOpenChange(false)
      } else {
        setRootError(result.error ?? "Failed to create customer. Please try again.")
      }
    })
  }

  // Show gate code reminder when address is filled but gate code is empty
  const showGateCodeHint = form.address.trim().length > 0 && !form.gate_code.trim() && !gateCodeDismissed

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="sm:max-w-[520px] max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Add Customer</DialogTitle>
          <DialogDescription>
            Create a new customer record. Only Name is required.
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-5">

          {/* ── Contact Info ──────────────────────────────────────────── */}
          <div className="space-y-3">
            <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
              Contact Info
            </p>

            {/* Full Name */}
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="customer-name">
                Full Name <span className="text-destructive">*</span>
              </Label>
              <Input
                id="customer-name"
                placeholder="Jane Smith"
                value={form.full_name}
                onChange={(e) => update("full_name", e.target.value)}
                disabled={isPending}
                aria-invalid={!!errors.full_name}
              />
              {errors.full_name && (
                <p className="text-xs text-destructive" role="alert">{errors.full_name}</p>
              )}
            </div>

            {/* Address */}
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="customer-address">Address</Label>
              <AddressAutocomplete
                id="customer-address"
                value={form.address}
                onChange={(address, newCoords) => {
                  update("address", address)
                  if (newCoords) setCoords(newCoords)
                }}
                disabled={isPending}
              />
            </div>

            <div className="grid grid-cols-2 gap-3">
              {/* Phone */}
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="customer-phone">Phone</Label>
                <Input
                  id="customer-phone"
                  placeholder="(555) 123-4567"
                  value={form.phone}
                  onChange={(e) => update("phone", e.target.value)}
                  disabled={isPending}
                />
              </div>

              {/* Email */}
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="customer-email">Email</Label>
                <Input
                  id="customer-email"
                  type="email"
                  placeholder="jane@example.com"
                  value={form.email}
                  onChange={(e) => update("email", e.target.value)}
                  disabled={isPending}
                  aria-invalid={!!errors.email}
                />
                {errors.email && (
                  <p className="text-xs text-destructive" role="alert">{errors.email}</p>
                )}
              </div>
            </div>
          </div>

          <Separator />

          {/* ── Access Info ───────────────────────────────────────────── */}
          <div className="space-y-3">
            <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
              Access Info
            </p>

            {/* Gate Code */}
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="customer-gate-code">Gate Code</Label>
              <Input
                id="customer-gate-code"
                placeholder="1234#"
                value={form.gate_code}
                onChange={(e) => update("gate_code", e.target.value)}
                disabled={isPending}
              />
            </div>

            {/* Gate code smart suggestion */}
            {showGateCodeHint && (
              <div className="flex items-start gap-2 rounded-md border border-border bg-muted/40 px-3 py-2">
                <Lightbulb className="h-3.5 w-3.5 mt-0.5 shrink-0 text-muted-foreground" />
                <p className="text-xs text-muted-foreground flex-1">
                  Does this property have a gate? Adding the code now saves techs time on every visit.
                </p>
                <button
                  type="button"
                  onClick={() => setGateCodeDismissed(true)}
                  className="shrink-0 text-muted-foreground/60 hover:text-muted-foreground transition-colors"
                  aria-label="Dismiss suggestion"
                >
                  <X className="h-3 w-3" />
                </button>
              </div>
            )}

            {/* Access Notes */}
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="customer-access-notes">Access Notes</Label>
              <textarea
                id="customer-access-notes"
                className="flex min-h-[80px] w-full rounded-md border border-input bg-transparent px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50 resize-none"
                placeholder="Dog in backyard, use side gate..."
                value={form.access_notes}
                onChange={(e) => update("access_notes", e.target.value)}
                disabled={isPending}
              />
            </div>
          </div>

          <Separator />

          {/* ── Settings ──────────────────────────────────────────────── */}
          <div className="space-y-3">
            <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
              Settings
            </p>

            <div className="grid grid-cols-2 gap-3">
              {/* Status */}
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="customer-status">Status</Label>
                <Select
                  value={form.status}
                  onValueChange={(v) => update("status", v as FormState["status"])}
                  disabled={isPending}
                >
                  <SelectTrigger id="customer-status">
                    <SelectValue placeholder="Select status" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="active">Active</SelectItem>
                    <SelectItem value="paused">Paused</SelectItem>
                    <SelectItem value="cancelled">Cancelled</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              {/* Route Name */}
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="customer-route">Route</Label>
                <Input
                  id="customer-route"
                  placeholder="Monday North"
                  value={form.route_name}
                  onChange={(e) => update("route_name", e.target.value)}
                  disabled={isPending}
                />
              </div>
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
              {isPending ? "Creating..." : "Create Customer"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
