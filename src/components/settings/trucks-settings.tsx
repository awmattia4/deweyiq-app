"use client"

import { useState, useTransition } from "react"
import { toast } from "sonner"
import { cn } from "@/lib/utils"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Badge } from "@/components/ui/badge"
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import {
  getTrucks,
  createTruck,
  updateTruck,
  deactivateTruck,
} from "@/actions/trucks"
import type { TruckRow } from "@/actions/trucks"
import { PencilIcon, PlusIcon, Trash2Icon } from "lucide-react"

// ---------------------------------------------------------------------------
// Form state
// ---------------------------------------------------------------------------

interface TruckForm {
  name: string
  techIds: string[]
}

const EMPTY_FORM: TruckForm = {
  name: "",
  techIds: [],
}

// ---------------------------------------------------------------------------
// Props
// ---------------------------------------------------------------------------

interface TrucksSettingsProps {
  initialTrucks: TruckRow[]
  allTechs: Array<{ id: string; fullName: string }>
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function TrucksSettings({ initialTrucks, allTechs }: TrucksSettingsProps) {
  const [truckList, setTruckList] = useState(initialTrucks)
  const [isPending, startTransition] = useTransition()
  const [dialogOpen, setDialogOpen] = useState(false)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [form, setForm] = useState<TruckForm>(EMPTY_FORM)
  const [search, setSearch] = useState("")
  const [showInactive, setShowInactive] = useState(false)

  // Build a map of techId → truck name (for showing "already on X" in dialog)
  const techToTruckMap = new Map<string, string>()
  for (const truck of truckList) {
    if (!truck.is_active) continue
    for (const tech of truck.assignedTechs) {
      techToTruckMap.set(tech.id, truck.name)
    }
  }

  const filtered = truckList.filter((t) => {
    if (!showInactive && !t.is_active) return false
    if (search) {
      const q = search.toLowerCase()
      return (
        t.name.toLowerCase().includes(q) ||
        t.assignedTechs.some((at) => at.fullName.toLowerCase().includes(q))
      )
    }
    return true
  })

  function openAddDialog() {
    setForm(EMPTY_FORM)
    setEditingId(null)
    setDialogOpen(true)
  }

  function openEditDialog(truck: TruckRow) {
    setForm({
      name: truck.name,
      techIds: truck.assignedTechs.map((t) => t.id),
    })
    setEditingId(truck.id)
    setDialogOpen(true)
  }

  function closeDialog() {
    setDialogOpen(false)
    setEditingId(null)
    setForm(EMPTY_FORM)
  }

  async function refreshTrucks() {
    const result = await getTrucks()
    if (result.success) setTruckList(result.trucks)
  }

  function toggleTech(techId: string) {
    setForm((f) => ({
      ...f,
      techIds: f.techIds.includes(techId)
        ? f.techIds.filter((id) => id !== techId)
        : [...f.techIds, techId],
    }))
  }

  function handleSave() {
    if (!form.name.trim()) {
      toast.error("Truck name is required")
      return
    }

    startTransition(async () => {
      if (editingId) {
        const result = await updateTruck(editingId, {
          name: form.name.trim(),
          techIds: form.techIds,
        })
        if (result.success) {
          toast.success("Truck updated")
          closeDialog()
          await refreshTrucks()
        } else {
          toast.error(result.error)
        }
      } else {
        const result = await createTruck({
          name: form.name.trim(),
          techIds: form.techIds,
        })
        if (result.success) {
          toast.success("Truck created")
          closeDialog()
          await refreshTrucks()
        } else {
          toast.error(result.error)
        }
      }
    })
  }

  function handleDeactivate(truck: TruckRow) {
    startTransition(async () => {
      const result = await deactivateTruck(truck.id)
      if (result.success) {
        toast.success(`${truck.name} removed`)
        await refreshTrucks()
      } else {
        toast.error(result.error ?? "Failed to remove truck")
      }
    })
  }

  return (
    <div className="flex flex-col gap-4">
      {/* Toolbar */}
      <div className="flex items-center gap-3">
        <Input
          placeholder="Search trucks..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="max-w-xs h-8 text-sm"
        />
        <Button size="sm" onClick={openAddDialog} className="ml-auto shrink-0">
          <PlusIcon className="h-4 w-4 mr-1.5" />
          Add Truck
        </Button>
      </div>

      {/* Show inactive toggle */}
      <label className="flex items-center gap-2 text-xs text-muted-foreground cursor-pointer w-fit">
        <input
          type="checkbox"
          checked={showInactive}
          onChange={(e) => {
            setShowInactive(e.target.checked)
          }}
          className="rounded border-border"
        />
        Show inactive trucks
      </label>

      {/* Truck list */}
      {filtered.length === 0 ? (
        <p className="text-sm text-muted-foreground italic">
          {truckList.length === 0
            ? "No trucks configured. When you create a truck and assign techs, they'll share the same inventory pool."
            : "No trucks match your search."}
        </p>
      ) : (
        <div className="flex flex-col gap-2">
          {filtered.map((truck) => (
            <div
              key={truck.id}
              className={cn(
                "flex items-start gap-3 rounded-lg border border-border bg-card px-4 py-3 hover:bg-muted/20 transition-colors",
                !truck.is_active && "opacity-50"
              )}
            >
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="text-sm font-medium">{truck.name}</span>
                  {!truck.is_active && (
                    <Badge variant="outline" className="text-[10px] px-1.5 py-0 text-muted-foreground border-border">
                      Inactive
                    </Badge>
                  )}
                </div>

                {truck.assignedTechs.length > 0 ? (
                  <div className="flex flex-wrap gap-1.5 mt-1.5">
                    {truck.assignedTechs.map((tech) => (
                      <span
                        key={tech.id}
                        className="inline-flex text-xs text-muted-foreground bg-muted/60 border border-border/50 rounded px-1.5 py-0.5"
                      >
                        {tech.fullName}
                      </span>
                    ))}
                  </div>
                ) : (
                  <p className="text-xs text-muted-foreground mt-1 italic">No techs assigned</p>
                )}
              </div>

              <div className="flex items-center gap-1 shrink-0">
                <button
                  onClick={() => openEditDialog(truck)}
                  className="p-1.5 rounded-md text-muted-foreground hover:text-foreground hover:bg-muted transition-colors"
                  title="Edit"
                  disabled={isPending}
                >
                  <PencilIcon className="h-3.5 w-3.5" />
                </button>
                {truck.is_active && (
                  <button
                    onClick={() => handleDeactivate(truck)}
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
            <DialogTitle>{editingId ? "Edit Truck" : "Add Truck"}</DialogTitle>
          </DialogHeader>

          <div className="flex flex-col gap-4 py-2">
            <div>
              <Label htmlFor="truck-name">Truck Name</Label>
              <Input
                id="truck-name"
                value={form.name}
                onChange={(e) => setForm({ ...form, name: e.target.value })}
                placeholder="e.g. Service Truck 1"
                className="mt-1"
                autoFocus
              />
            </div>

            <div>
              <Label>Assign Techs</Label>
              <p className="text-xs text-muted-foreground mt-0.5 mb-2">
                Techs on the same truck share one inventory pool. Each tech can only be on one truck.
              </p>
              <div className="flex flex-col gap-1 max-h-48 overflow-y-auto rounded-md border border-border/60 p-2">
                {allTechs.map((tech) => {
                  const isSelected = form.techIds.includes(tech.id)
                  const currentTruck = techToTruckMap.get(tech.id)
                  const isOnAnotherTruck = currentTruck && (!editingId || !truckList.find((t) => t.id === editingId)?.assignedTechs.some((at) => at.id === tech.id))

                  return (
                    <label
                      key={tech.id}
                      className={cn(
                        "flex items-center gap-2.5 rounded px-2 py-1.5 cursor-pointer transition-colors",
                        isSelected ? "bg-primary/10" : "hover:bg-muted/40"
                      )}
                    >
                      <input
                        type="checkbox"
                        checked={isSelected}
                        onChange={() => toggleTech(tech.id)}
                        className="rounded border-border"
                      />
                      <span className="text-sm">{tech.fullName}</span>
                      {isOnAnotherTruck && (
                        <span className="text-[11px] text-amber-400 ml-auto shrink-0">
                          on {currentTruck}
                        </span>
                      )}
                    </label>
                  )
                })}
                {allTechs.length === 0 && (
                  <p className="text-xs text-muted-foreground italic p-2">No techs in your organization yet.</p>
                )}
              </div>
            </div>
          </div>

          <div className="flex justify-end gap-2 mt-2">
            <Button variant="outline" onClick={closeDialog} disabled={isPending}>
              Cancel
            </Button>
            <Button onClick={handleSave} disabled={isPending}>
              {isPending ? "Saving..." : editingId ? "Update" : "Create Truck"}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  )
}
