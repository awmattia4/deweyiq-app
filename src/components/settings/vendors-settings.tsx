"use client"

import { useState, useTransition } from "react"
import { toast } from "sonner"
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
} from "@/components/ui/dialog"
import {
  getAllVendors,
  createVendor,
  updateVendor,
  deactivateVendor,
} from "@/actions/vendor-bills"
import type { VendorRow, CreateVendorInput } from "@/actions/vendor-bills"
import { PencilIcon, PlusIcon, Trash2Icon } from "lucide-react"

// ---------------------------------------------------------------------------
// Form state
// ---------------------------------------------------------------------------

interface VendorForm {
  vendor_name: string
  contact_email: string
  contact_phone: string
  address: string
  notes: string
}

const EMPTY_FORM: VendorForm = {
  vendor_name: "",
  contact_email: "",
  contact_phone: "",
  address: "",
  notes: "",
}

// ---------------------------------------------------------------------------
// Props
// ---------------------------------------------------------------------------

interface VendorsSettingsProps {
  initialVendors: VendorRow[]
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function VendorsSettings({ initialVendors }: VendorsSettingsProps) {
  const [vendors, setVendors] = useState(initialVendors)
  const [isPending, startTransition] = useTransition()
  const [dialogOpen, setDialogOpen] = useState(false)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [form, setForm] = useState<VendorForm>(EMPTY_FORM)
  const [search, setSearch] = useState("")
  const [showInactive, setShowInactive] = useState(false)

  const filtered = vendors.filter((v) => {
    if (!showInactive && !v.is_active) return false
    if (search) {
      const q = search.toLowerCase()
      return (
        v.vendor_name.toLowerCase().includes(q) ||
        v.contact_email?.toLowerCase().includes(q) ||
        v.contact_phone?.toLowerCase().includes(q)
      )
    }
    return true
  })

  function openAddDialog() {
    setForm(EMPTY_FORM)
    setEditingId(null)
    setDialogOpen(true)
  }

  function openEditDialog(vendor: VendorRow) {
    setForm({
      vendor_name: vendor.vendor_name,
      contact_email: vendor.contact_email ?? "",
      contact_phone: vendor.contact_phone ?? "",
      address: vendor.address ?? "",
      notes: vendor.notes ?? "",
    })
    setEditingId(vendor.id)
    setDialogOpen(true)
  }

  function closeDialog() {
    setDialogOpen(false)
    setEditingId(null)
    setForm(EMPTY_FORM)
  }

  async function refreshVendors() {
    const result = await getAllVendors(showInactive)
    if (result.success) setVendors(result.vendors)
  }

  function handleSave() {
    if (!form.vendor_name.trim()) {
      toast.error("Vendor name is required")
      return
    }

    const input: CreateVendorInput = {
      vendor_name: form.vendor_name.trim(),
      contact_email: form.contact_email.trim() || null,
      contact_phone: form.contact_phone.trim() || null,
      address: form.address.trim() || null,
      notes: form.notes.trim() || null,
    }

    startTransition(async () => {
      if (editingId) {
        const result = await updateVendor(editingId, input)
        if (result.success) {
          toast.success("Vendor updated")
          closeDialog()
          await refreshVendors()
        } else {
          toast.error(result.error)
        }
      } else {
        const result = await createVendor(input)
        if (result.success) {
          toast.success("Vendor added")
          closeDialog()
          await refreshVendors()
        } else {
          toast.error(result.error)
        }
      }
    })
  }

  function handleDeactivate(vendor: VendorRow) {
    startTransition(async () => {
      const result = await deactivateVendor(vendor.id)
      if (result.success) {
        toast.success(`${vendor.vendor_name} removed`)
        await refreshVendors()
      } else {
        toast.error(result.error ?? "Failed to remove vendor")
      }
    })
  }

  return (
    <div className="flex flex-col gap-4">
      {/* Toolbar */}
      <div className="flex items-center gap-3">
        <Input
          placeholder="Search vendors..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="max-w-xs h-8 text-sm"
        />
        <Button size="sm" onClick={openAddDialog} className="ml-auto shrink-0">
          <PlusIcon className="h-4 w-4 mr-1.5" />
          Add Vendor
        </Button>
      </div>

      {/* Show inactive toggle */}
      <label className="flex items-center gap-2 text-xs text-muted-foreground cursor-pointer w-fit">
        <input
          type="checkbox"
          checked={showInactive}
          onChange={(e) => {
            setShowInactive(e.target.checked)
            startTransition(async () => {
              const result = await getAllVendors(e.target.checked)
              if (result.success) setVendors(result.vendors)
            })
          }}
          className="rounded border-border"
        />
        Show inactive vendors
      </label>

      {/* Vendor list */}
      {filtered.length === 0 ? (
        <p className="text-sm text-muted-foreground italic">
          {vendors.length === 0
            ? "No vendors yet. Add your first supplier to use them in purchase orders."
            : "No vendors match your search."}
        </p>
      ) : (
        <div className="flex flex-col gap-2">
          {filtered.map((vendor) => (
            <div
              key={vendor.id}
              className="flex items-start gap-3 rounded-lg border border-border bg-card px-4 py-3 hover:bg-muted/20 transition-colors"
            >
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="text-sm font-medium">{vendor.vendor_name}</span>
                  {!vendor.is_active && (
                    <Badge variant="outline" className="text-[10px] px-1.5 py-0 text-muted-foreground border-border">
                      Inactive
                    </Badge>
                  )}
                </div>
                <div className="flex flex-wrap items-center gap-x-4 gap-y-0.5 mt-1">
                  {vendor.contact_email && (
                    <span className="text-xs text-muted-foreground">{vendor.contact_email}</span>
                  )}
                  {vendor.contact_phone && (
                    <span className="text-xs text-muted-foreground">{vendor.contact_phone}</span>
                  )}
                </div>
                {vendor.address && (
                  <p className="text-xs text-muted-foreground mt-0.5">{vendor.address}</p>
                )}
                {vendor.notes && (
                  <p className="text-xs text-muted-foreground mt-0.5 italic">{vendor.notes}</p>
                )}
              </div>

              <div className="flex items-center gap-1 shrink-0">
                <button
                  onClick={() => openEditDialog(vendor)}
                  className="p-1.5 rounded-md text-muted-foreground hover:text-foreground hover:bg-muted transition-colors"
                  title="Edit"
                  disabled={isPending}
                >
                  <PencilIcon className="h-3.5 w-3.5" />
                </button>
                {vendor.is_active && (
                  <button
                    onClick={() => handleDeactivate(vendor)}
                    className="p-1.5 rounded-md text-muted-foreground hover:text-destructive hover:bg-destructive/10 transition-colors"
                    title="Remove"
                    disabled={isPending}
                  >
                    <Trash2Icon className="h-3.5 w-3.5" />
                  </button>
                )}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Add/Edit dialog */}
      <Dialog open={dialogOpen} onOpenChange={(isOpen) => { if (!isOpen) closeDialog() }}>
        <DialogContent className="sm:max-w-[460px]">
          <DialogHeader>
            <DialogTitle>{editingId ? "Edit Vendor" : "Add Vendor"}</DialogTitle>
          </DialogHeader>

          <div className="flex flex-col gap-4 py-2">
            <div>
              <Label htmlFor="vendor-name">Vendor Name</Label>
              <Input
                id="vendor-name"
                value={form.vendor_name}
                onChange={(e) => setForm({ ...form, vendor_name: e.target.value })}
                placeholder="e.g. Pool Supply World"
                className="mt-1"
                autoFocus
              />
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <Label htmlFor="vendor-email">Email</Label>
                <Input
                  id="vendor-email"
                  type="email"
                  value={form.contact_email}
                  onChange={(e) => setForm({ ...form, contact_email: e.target.value })}
                  placeholder="orders@supplier.com"
                  className="mt-1"
                />
              </div>
              <div>
                <Label htmlFor="vendor-phone">Phone</Label>
                <Input
                  id="vendor-phone"
                  type="tel"
                  value={form.contact_phone}
                  onChange={(e) => setForm({ ...form, contact_phone: e.target.value })}
                  placeholder="(555) 123-4567"
                  className="mt-1"
                />
              </div>
            </div>

            <div>
              <Label htmlFor="vendor-address">Address</Label>
              <Input
                id="vendor-address"
                value={form.address}
                onChange={(e) => setForm({ ...form, address: e.target.value })}
                placeholder="123 Main St, City, State ZIP"
                className="mt-1"
              />
            </div>

            <div>
              <Label htmlFor="vendor-notes">Notes</Label>
              <Textarea
                id="vendor-notes"
                value={form.notes}
                onChange={(e) => setForm({ ...form, notes: e.target.value })}
                placeholder="Account number, payment terms, etc."
                className="mt-1 text-sm"
                rows={2}
              />
            </div>
          </div>

          <div className="flex justify-end gap-2 mt-2">
            <Button variant="outline" onClick={closeDialog} disabled={isPending}>
              Cancel
            </Button>
            <Button onClick={handleSave} disabled={isPending}>
              {isPending ? "Saving..." : editingId ? "Update" : "Add Vendor"}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  )
}
