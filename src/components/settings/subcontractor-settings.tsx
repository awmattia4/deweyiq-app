"use client"

import { useState, useTransition } from "react"
import { toast } from "sonner"
import { cn } from "@/lib/utils"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { Badge } from "@/components/ui/badge"
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog"
import {
  getSubcontractors,
  createSubcontractor,
  updateSubcontractor,
  deactivateSubcontractor,
} from "@/actions/projects-subcontractors"
import type { SubcontractorRow, SubTrade, CreateSubcontractorInput } from "@/actions/projects-subcontractors"

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const TRADES: { value: SubTrade; label: string }[] = [
  { value: "plumbing", label: "Plumbing" },
  { value: "electrical", label: "Electrical" },
  { value: "excavation", label: "Excavation" },
  { value: "decking", label: "Decking" },
  { value: "masonry", label: "Masonry" },
  { value: "plastering", label: "Plastering" },
  { value: "painting", label: "Painting" },
  { value: "landscaping", label: "Landscaping" },
  { value: "other", label: "Other" },
]

const INSURANCE_STATUS_STYLES: Record<
  "valid" | "expiring" | "expired" | "none",
  { badge: string; label: string }
> = {
  valid: { badge: "bg-emerald-900/50 text-emerald-300 border-emerald-800/50", label: "Valid" },
  expiring: { badge: "bg-amber-900/50 text-amber-300 border-amber-800/50", label: "Expiring" },
  expired: { badge: "bg-red-900/50 text-red-300 border-red-800/50", label: "Expired" },
  none: { badge: "bg-zinc-800/50 text-zinc-400 border-zinc-700/50", label: "Not on file" },
}

// ---------------------------------------------------------------------------
// Empty form
// ---------------------------------------------------------------------------

interface SubForm {
  name: string
  trade: SubTrade
  contact_name: string
  email: string
  phone: string
  address: string
  insurance_expiry: string
  license_number: string
  license_expiry: string
  payment_terms: string
  notes: string
}

const EMPTY_FORM: SubForm = {
  name: "",
  trade: "other",
  contact_name: "",
  email: "",
  phone: "",
  address: "",
  insurance_expiry: "",
  license_number: "",
  license_expiry: "",
  payment_terms: "",
  notes: "",
}

// ---------------------------------------------------------------------------
// Props
// ---------------------------------------------------------------------------

interface SubcontractorSettingsProps {
  initialSubs: SubcontractorRow[]
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function SubcontractorSettings({ initialSubs }: SubcontractorSettingsProps) {
  const [subs, setSubs] = useState(initialSubs)
  const [isPending, startTransition] = useTransition()
  const [dialogOpen, setDialogOpen] = useState(false)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [form, setForm] = useState<SubForm>(EMPTY_FORM)
  const [tradeFilter, setTradeFilter] = useState("")
  const [showInactive, setShowInactive] = useState(false)

  // Filtered view
  const filtered = subs.filter((s) => {
    if (!showInactive && !s.is_active) return false
    if (tradeFilter && s.trade !== tradeFilter) return false
    return true
  })

  function openAddDialog() {
    setForm(EMPTY_FORM)
    setEditingId(null)
    setDialogOpen(true)
  }

  function openEditDialog(sub: SubcontractorRow) {
    setForm({
      name: sub.name,
      trade: sub.trade as SubTrade,
      contact_name: sub.contact_name ?? "",
      email: sub.email ?? "",
      phone: sub.phone ?? "",
      address: sub.address ?? "",
      insurance_expiry: sub.insurance_expiry ?? "",
      license_number: sub.license_number ?? "",
      license_expiry: sub.license_expiry ?? "",
      payment_terms: sub.payment_terms ?? "",
      notes: sub.notes ?? "",
    })
    setEditingId(sub.id)
    setDialogOpen(true)
  }

  function closeDialog() {
    setDialogOpen(false)
    setEditingId(null)
    setForm(EMPTY_FORM)
  }

  async function refreshSubs() {
    const result = await getSubcontractors(showInactive)
    if (!("error" in result)) setSubs(result)
  }

  function handleSave() {
    if (!form.name.trim()) {
      toast.error("Name is required")
      return
    }

    const input: CreateSubcontractorInput = {
      name: form.name.trim(),
      trade: form.trade,
      contact_name: form.contact_name.trim() || null,
      email: form.email.trim() || null,
      phone: form.phone.trim() || null,
      address: form.address.trim() || null,
      insurance_expiry: form.insurance_expiry || null,
      license_number: form.license_number.trim() || null,
      license_expiry: form.license_expiry || null,
      payment_terms: form.payment_terms.trim() || null,
      notes: form.notes.trim() || null,
    }

    startTransition(async () => {
      if (editingId) {
        const result = await updateSubcontractor(editingId, input)
        if ("error" in result) {
          toast.error(result.error)
        } else {
          toast.success("Subcontractor updated")
          closeDialog()
          await refreshSubs()
        }
      } else {
        const result = await createSubcontractor(input)
        if ("error" in result) {
          toast.error(result.error)
        } else {
          toast.success("Subcontractor added")
          closeDialog()
          await refreshSubs()
        }
      }
    })
  }

  function handleDeactivate(sub: SubcontractorRow) {
    startTransition(async () => {
      const result = await deactivateSubcontractor(sub.id)
      if ("error" in result) {
        toast.error(result.error)
      } else {
        toast.success(`${sub.name} deactivated`)
        await refreshSubs()
      }
    })
  }

  return (
    <div className="flex flex-col gap-4">
      {/* Controls */}
      <div className="flex flex-wrap items-center gap-3">
        <select
          className="flex h-8 rounded-md border border-input bg-background px-3 py-1 text-sm shadow-sm"
          value={tradeFilter}
          onChange={(e) => setTradeFilter(e.target.value)}
        >
          <option value="">All trades</option>
          {TRADES.map((t) => (
            <option key={t.value} value={t.value}>
              {t.label}
            </option>
          ))}
        </select>

        <label className="flex items-center gap-2 text-sm text-muted-foreground cursor-pointer">
          <input
            type="checkbox"
            className="h-3.5 w-3.5 rounded border-border"
            checked={showInactive}
            onChange={(e) => setShowInactive(e.target.checked)}
          />
          Show inactive
        </label>

        <Button size="sm" variant="outline" className="ml-auto" onClick={openAddDialog}>
          Add Subcontractor
        </Button>
      </div>

      {/* List */}
      {filtered.length === 0 ? (
        <p className="text-sm text-muted-foreground italic py-6 text-center">
          No subcontractors found.
          {!tradeFilter && !showInactive && " Add your first subcontractor above."}
        </p>
      ) : (
        <div className="flex flex-col divide-y divide-border rounded-md border border-border overflow-hidden">
          {filtered.map((sub) => {
            const insuranceStyle = INSURANCE_STATUS_STYLES[sub.insurance_status]
            const licenseStyle = INSURANCE_STATUS_STYLES[sub.license_status]
            const tradeDef = TRADES.find((t) => t.value === sub.trade)

            return (
              <div
                key={sub.id}
                className={cn(
                  "flex items-start gap-3 p-4",
                  !sub.is_active && "opacity-50"
                )}
              >
                <div className="flex-1 min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="font-medium text-sm">{sub.name}</span>
                    {tradeDef && (
                      <span className="text-xs text-muted-foreground bg-muted/40 rounded px-1.5 py-0.5">
                        {tradeDef.label}
                      </span>
                    )}
                    {!sub.is_active && (
                      <span className="text-xs text-muted-foreground">Inactive</span>
                    )}
                  </div>

                  <div className="flex flex-wrap gap-x-4 gap-y-1 mt-1 text-xs text-muted-foreground">
                    {sub.contact_name && <span>{sub.contact_name}</span>}
                    {sub.email && <span>{sub.email}</span>}
                    {sub.phone && <span>{sub.phone}</span>}
                  </div>

                  {/* Insurance & license badges */}
                  <div className="flex flex-wrap gap-2 mt-2">
                    <span
                      className={cn(
                        "inline-flex items-center rounded px-1.5 py-0.5 text-xs font-medium border",
                        insuranceStyle.badge
                      )}
                    >
                      Insurance: {insuranceStyle.label}
                      {sub.insurance_expiry && sub.insurance_status !== "none" && (
                        <span className="ml-1 opacity-70">{sub.insurance_expiry}</span>
                      )}
                    </span>
                    <span
                      className={cn(
                        "inline-flex items-center rounded px-1.5 py-0.5 text-xs font-medium border",
                        licenseStyle.badge
                      )}
                    >
                      License: {licenseStyle.label}
                      {sub.license_expiry && sub.license_status !== "none" && (
                        <span className="ml-1 opacity-70">{sub.license_expiry}</span>
                      )}
                    </span>
                  </div>

                  {sub.payment_terms && (
                    <p className="text-xs text-muted-foreground mt-1">
                      Payment terms: {sub.payment_terms}
                    </p>
                  )}
                </div>

                <div className="flex items-center gap-2 flex-shrink-0">
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => openEditDialog(sub)}
                    disabled={isPending}
                  >
                    Edit
                  </Button>
                  {sub.is_active && (
                    <Button
                      size="sm"
                      variant="ghost"
                      className="text-destructive hover:text-destructive"
                      onClick={() => handleDeactivate(sub)}
                      disabled={isPending}
                    >
                      Deactivate
                    </Button>
                  )}
                </div>
              </div>
            )
          })}
        </div>
      )}

      {/* Add / Edit Dialog */}
      <Dialog open={dialogOpen} onOpenChange={(open) => { if (!open) closeDialog() }}>
        <DialogContent className="max-w-lg max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{editingId ? "Edit Subcontractor" : "Add Subcontractor"}</DialogTitle>
            <DialogDescription>
              {editingId
                ? "Update subcontractor details. Changes apply immediately."
                : "Add a subcontractor to your directory. Insurance and license expiry dates will be tracked automatically."}
            </DialogDescription>
          </DialogHeader>

          <div className="flex flex-col gap-4 mt-2">
            <div className="grid grid-cols-2 gap-3">
              <div className="flex flex-col gap-1.5 col-span-2">
                <Label htmlFor="sub-name">Company / Name *</Label>
                <Input
                  id="sub-name"
                  placeholder="e.g. ABC Plumbing"
                  value={form.name}
                  onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
                />
              </div>

              <div className="flex flex-col gap-1.5">
                <Label htmlFor="sub-trade">Trade *</Label>
                <select
                  id="sub-trade"
                  className="flex h-9 w-full rounded-md border border-input bg-background px-3 py-1 text-sm shadow-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
                  value={form.trade}
                  onChange={(e) => setForm((f) => ({ ...f, trade: e.target.value as SubTrade }))}
                >
                  {TRADES.map((t) => (
                    <option key={t.value} value={t.value}>
                      {t.label}
                    </option>
                  ))}
                </select>
              </div>

              <div className="flex flex-col gap-1.5">
                <Label htmlFor="sub-contact">Contact Name</Label>
                <Input
                  id="sub-contact"
                  placeholder="Primary contact"
                  value={form.contact_name}
                  onChange={(e) => setForm((f) => ({ ...f, contact_name: e.target.value }))}
                />
              </div>

              <div className="flex flex-col gap-1.5">
                <Label htmlFor="sub-email">Email</Label>
                <Input
                  id="sub-email"
                  type="email"
                  placeholder="contact@example.com"
                  value={form.email}
                  onChange={(e) => setForm((f) => ({ ...f, email: e.target.value }))}
                />
              </div>

              <div className="flex flex-col gap-1.5">
                <Label htmlFor="sub-phone">Phone</Label>
                <Input
                  id="sub-phone"
                  type="tel"
                  placeholder="(555) 555-5555"
                  value={form.phone}
                  onChange={(e) => setForm((f) => ({ ...f, phone: e.target.value }))}
                />
              </div>
            </div>

            <div className="flex flex-col gap-1.5">
              <Label htmlFor="sub-address">Business Address</Label>
              <Input
                id="sub-address"
                placeholder="123 Main St, City, FL 00000"
                value={form.address}
                onChange={(e) => setForm((f) => ({ ...f, address: e.target.value }))}
              />
            </div>

            <div className="border-t border-border pt-3">
              <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide mb-3">
                Compliance
              </p>
              <div className="grid grid-cols-2 gap-3">
                <div className="flex flex-col gap-1.5">
                  <Label htmlFor="sub-ins-expiry">Insurance Expiry</Label>
                  <Input
                    id="sub-ins-expiry"
                    type="date"
                    value={form.insurance_expiry}
                    onChange={(e) => setForm((f) => ({ ...f, insurance_expiry: e.target.value }))}
                  />
                </div>

                <div className="flex flex-col gap-1.5">
                  <Label htmlFor="sub-license">License Number</Label>
                  <Input
                    id="sub-license"
                    placeholder="e.g. CPC1234567"
                    value={form.license_number}
                    onChange={(e) => setForm((f) => ({ ...f, license_number: e.target.value }))}
                  />
                </div>

                <div className="flex flex-col gap-1.5">
                  <Label htmlFor="sub-lic-expiry">License Expiry</Label>
                  <Input
                    id="sub-lic-expiry"
                    type="date"
                    value={form.license_expiry}
                    onChange={(e) => setForm((f) => ({ ...f, license_expiry: e.target.value }))}
                  />
                </div>

                <div className="flex flex-col gap-1.5">
                  <Label htmlFor="sub-payment-terms">Payment Terms</Label>
                  <Input
                    id="sub-payment-terms"
                    placeholder="e.g. Net 30, 50% upfront"
                    value={form.payment_terms}
                    onChange={(e) => setForm((f) => ({ ...f, payment_terms: e.target.value }))}
                  />
                </div>
              </div>
            </div>

            <div className="flex flex-col gap-1.5">
              <Label htmlFor="sub-notes">Notes</Label>
              <Textarea
                id="sub-notes"
                placeholder="Any notes about this subcontractor..."
                value={form.notes}
                onChange={(e) => setForm((f) => ({ ...f, notes: e.target.value }))}
                rows={2}
              />
            </div>

            <div className="flex justify-end gap-2 pt-2">
              <Button variant="outline" onClick={closeDialog}>
                Cancel
              </Button>
              <Button
                onClick={handleSave}
                disabled={isPending || !form.name.trim()}
              >
                {editingId ? "Save Changes" : "Add Subcontractor"}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  )
}
