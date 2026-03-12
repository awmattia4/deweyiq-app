"use client"

import { useState, useTransition } from "react"
import { updateCustomer } from "@/actions/customers"
import { updateCustomerBillingModel } from "@/actions/billing"
import { Button } from "@/components/ui/button"
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
import { Separator } from "@/components/ui/separator"
import { Pencil } from "lucide-react"

// ─── Types ─────────────────────────────────────────────────────────────────────

type CustomerStatus = "active" | "paused" | "cancelled"

const BILLING_MODEL_LABELS: Record<string, string> = {
  per_stop: "Per Stop",
  flat_rate: "Monthly Flat Rate",
  plus_chemicals: "Plus Chemicals",
  custom: "Custom Line Items",
}

interface CustomerInlineEditProps {
  customer: {
    id: string
    full_name: string
    address: string | null
    phone: string | null
    email: string | null
    gate_code: string | null
    access_notes: string | null
    status: CustomerStatus
    route_name: string | null
    assigned_tech_id: string | null
    assignedTech?: { id: string; full_name: string | null } | null
    billing_model: string | null
    flat_rate_amount: string | null
  }
  techs: Array<{ id: string; full_name: string | null }>
}

type FormState = {
  full_name: string
  address: string
  phone: string
  email: string
  gate_code: string
  access_notes: string
  status: CustomerStatus
  route_name: string
  assigned_tech_id: string
  billing_model: string
  flat_rate_amount: string
}

// ─── Helper: build form state from customer ────────────────────────────────────

function customerToForm(customer: CustomerInlineEditProps["customer"]): FormState {
  return {
    full_name: customer.full_name,
    address: customer.address ?? "",
    phone: customer.phone ?? "",
    email: customer.email ?? "",
    gate_code: customer.gate_code ?? "",
    access_notes: customer.access_notes ?? "",
    status: customer.status,
    route_name: customer.route_name ?? "",
    assigned_tech_id: customer.assigned_tech_id ?? "",
    billing_model: customer.billing_model ?? "",
    flat_rate_amount: customer.flat_rate_amount ?? "",
  }
}

// ─── Read-mode field display ───────────────────────────────────────────────────

function ReadField({ label, value }: { label: string; value: string | null | undefined }) {
  return (
    <div className="flex flex-col gap-0.5">
      <span className="text-xs font-medium text-muted-foreground">{label}</span>
      <span className="text-sm">{value || <span className="text-muted-foreground/60 italic">Not set</span>}</span>
    </div>
  )
}

// ─── Component ─────────────────────────────────────────────────────────────────

/**
 * CustomerInlineEdit — Overview tab content with read/edit toggle.
 *
 * Pattern: useState for isEditing + form state, useTransition for pending state.
 * No react-hook-form — follows the established codebase pattern (ProfileForm,
 * AddCustomerDialog).
 */
export function CustomerInlineEdit({ customer, techs }: CustomerInlineEditProps) {
  const [isEditing, setIsEditing] = useState(false)
  const [form, setForm] = useState<FormState>(() => customerToForm(customer))
  const [coords, setCoords] = useState<{ lat: number; lng: number } | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [isPending, startTransition] = useTransition()

  function update(field: keyof FormState, value: string) {
    setForm((prev) => ({ ...prev, [field]: value }))
  }

  function handleEdit() {
    // Reset form to current customer values before editing
    setForm(customerToForm(customer))
    setCoords(null)
    setError(null)
    setIsEditing(true)
  }

  function handleCancel() {
    setForm(customerToForm(customer))
    setCoords(null)
    setError(null)
    setIsEditing(false)
  }

  function handleSave() {
    if (!form.full_name.trim()) {
      setError("Customer name is required.")
      return
    }

    setError(null)

    startTransition(async () => {
      // Update core customer fields
      const result = await updateCustomer({
        id: customer.id,
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
        assigned_tech_id: form.assigned_tech_id || null,
      })

      if (!result.success) {
        setError(result.error ?? "Failed to save. Please try again.")
        return
      }

      // Update billing model separately
      const billingResult = await updateCustomerBillingModel(
        customer.id,
        form.billing_model || null,
        form.flat_rate_amount || undefined
      )

      if (!billingResult.success) {
        setError(billingResult.error ?? "Failed to save billing model.")
        return
      }

      setIsEditing(false)
    })
  }

  // ── READ MODE ─────────────────────────────────────────────────────────────────

  if (!isEditing) {
    const assignedTechName =
      techs.find((t) => t.id === customer.assigned_tech_id)?.full_name ??
      customer.assignedTech?.full_name ??
      null

    const billingModelLabel = customer.billing_model
      ? BILLING_MODEL_LABELS[customer.billing_model] ?? customer.billing_model
      : null

    const flatRateDisplay =
      customer.billing_model === "flat_rate" && customer.flat_rate_amount
        ? `$${parseFloat(customer.flat_rate_amount).toFixed(2)}/mo`
        : null

    return (
      <div className="flex flex-col gap-6">
        <div className="flex items-center justify-between">
          <h2 className="text-sm font-semibold">Customer Details</h2>
          <Button variant="outline" size="sm" onClick={handleEdit}>
            <Pencil className="h-3.5 w-3.5 mr-1.5" />
            Edit
          </Button>
        </div>

        {/* Contact Info */}
        <div className="space-y-4">
          <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
            Contact Info
          </p>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <ReadField label="Full Name" value={customer.full_name} />
            <ReadField label="Email" value={customer.email} />
            <ReadField label="Phone" value={customer.phone} />
            <ReadField label="Address" value={customer.address} />
          </div>
        </div>

        <Separator />

        {/* Access Info */}
        <div className="space-y-4">
          <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
            Access Info
          </p>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <ReadField label="Gate Code" value={customer.gate_code} />
            <ReadField label="Access Notes" value={customer.access_notes} />
          </div>
        </div>

        <Separator />

        {/* Billing */}
        <div className="space-y-4">
          <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
            Billing
          </p>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <ReadField label="Billing Model" value={billingModelLabel} />
            {flatRateDisplay && <ReadField label="Flat Rate" value={flatRateDisplay} />}
          </div>
        </div>

        <Separator />

        {/* Settings */}
        <div className="space-y-4">
          <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
            Settings
          </p>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <ReadField label="Status" value={customer.status.charAt(0).toUpperCase() + customer.status.slice(1)} />
            <ReadField label="Route" value={customer.route_name} />
            <ReadField label="Assigned Tech" value={assignedTechName} />
          </div>
        </div>
      </div>
    )
  }

  // ── EDIT MODE ─────────────────────────────────────────────────────────────────

  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-center justify-between">
        <h2 className="text-sm font-semibold">Edit Customer</h2>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={handleCancel} disabled={isPending}>
            Cancel
          </Button>
          <Button size="sm" onClick={handleSave} disabled={isPending}>
            {isPending ? "Saving..." : "Save"}
          </Button>
        </div>
      </div>

      {error && (
        <p className="text-sm text-destructive" role="alert">
          {error}
        </p>
      )}

      {/* Contact Info */}
      <div className="space-y-3">
        <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
          Contact Info
        </p>

        <div className="flex flex-col gap-1.5">
          <Label htmlFor="edit-full-name">
            Full Name <span className="text-destructive">*</span>
          </Label>
          <Input
            id="edit-full-name"
            value={form.full_name}
            onChange={(e) => update("full_name", e.target.value)}
            disabled={isPending}
            placeholder="Jane Smith"
          />
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="edit-email">Email</Label>
            <Input
              id="edit-email"
              type="email"
              value={form.email}
              onChange={(e) => update("email", e.target.value)}
              disabled={isPending}
              placeholder="jane@example.com"
            />
          </div>

          <div className="flex flex-col gap-1.5">
            <Label htmlFor="edit-phone">Phone</Label>
            <Input
              id="edit-phone"
              value={form.phone}
              onChange={(e) => update("phone", e.target.value)}
              disabled={isPending}
              placeholder="(555) 123-4567"
            />
          </div>
        </div>

        <div className="flex flex-col gap-1.5">
          <Label htmlFor="edit-address">Address</Label>
          <AddressAutocomplete
            id="edit-address"
            value={form.address}
            onChange={(address, newCoords) => {
              update("address", address)
              if (newCoords) setCoords(newCoords)
            }}
            disabled={isPending}
          />
        </div>
      </div>

      <Separator />

      {/* Access Info */}
      <div className="space-y-3">
        <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
          Access Info
        </p>

        <div className="flex flex-col gap-1.5">
          <Label htmlFor="edit-gate-code">Gate Code</Label>
          <Input
            id="edit-gate-code"
            value={form.gate_code}
            onChange={(e) => update("gate_code", e.target.value)}
            disabled={isPending}
            placeholder="1234#"
          />
        </div>

        <div className="flex flex-col gap-1.5">
          <Label htmlFor="edit-access-notes">Access Notes</Label>
          <textarea
            id="edit-access-notes"
            className="flex min-h-[80px] w-full rounded-md border border-input bg-transparent px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50 resize-none"
            value={form.access_notes}
            onChange={(e) => update("access_notes", e.target.value)}
            disabled={isPending}
            placeholder="Dog in backyard, use side gate..."
          />
        </div>
      </div>

      <Separator />

      {/* Billing */}
      <div className="space-y-3">
        <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
          Billing
        </p>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="edit-billing-model">Billing Model</Label>
            <Select
              value={form.billing_model || "none"}
              onValueChange={(v) => update("billing_model", v === "none" ? "" : v)}
              disabled={isPending}
            >
              <SelectTrigger id="edit-billing-model">
                <SelectValue placeholder="Not Set" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="none">Not Set</SelectItem>
                <SelectItem value="per_stop">Per Stop</SelectItem>
                <SelectItem value="flat_rate">Monthly Flat Rate</SelectItem>
                <SelectItem value="plus_chemicals">Plus Chemicals</SelectItem>
                <SelectItem value="custom">Custom Line Items</SelectItem>
              </SelectContent>
            </Select>
          </div>

          {form.billing_model === "flat_rate" && (
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="edit-flat-rate">Monthly Rate ($)</Label>
              <Input
                id="edit-flat-rate"
                type="number"
                step="0.01"
                min="0"
                value={form.flat_rate_amount}
                onChange={(e) => update("flat_rate_amount", e.target.value)}
                disabled={isPending}
                placeholder="150.00"
              />
            </div>
          )}
        </div>
      </div>

      <Separator />

      {/* Settings */}
      <div className="space-y-3">
        <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
          Settings
        </p>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          {/* Status */}
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="edit-status">Status</Label>
            <Select
              value={form.status}
              onValueChange={(v) => update("status", v as CustomerStatus)}
              disabled={isPending}
            >
              <SelectTrigger id="edit-status">
                <SelectValue />
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
            <Label htmlFor="edit-route">Route</Label>
            <Input
              id="edit-route"
              value={form.route_name}
              onChange={(e) => update("route_name", e.target.value)}
              disabled={isPending}
              placeholder="Monday North"
            />
          </div>

          {/* Assigned Tech */}
          <div className="flex flex-col gap-1.5 sm:col-span-2">
            <Label htmlFor="edit-tech">Assigned Tech</Label>
            <Select
              value={form.assigned_tech_id || "none"}
              onValueChange={(v) => update("assigned_tech_id", v === "none" ? "" : v)}
              disabled={isPending}
            >
              <SelectTrigger id="edit-tech">
                <SelectValue placeholder="Unassigned" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="none">Unassigned</SelectItem>
                {techs.map((tech) => (
                  <SelectItem key={tech.id} value={tech.id}>
                    {tech.full_name ?? "Unnamed Tech"}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>
      </div>
    </div>
  )
}
