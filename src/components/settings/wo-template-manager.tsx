"use client"

import { useState, useTransition } from "react"
import { toast } from "sonner"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { PlusIcon, Trash2Icon, FileTextIcon } from "lucide-react"
import {
  createWoTemplate,
  deleteWoTemplate,
  type WoTemplate,
  type CreateWoTemplateInput,
} from "@/actions/parts-catalog"

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const WO_CATEGORIES = [
  "pump",
  "filter",
  "heater",
  "plumbing_leak",
  "surface",
  "electrical",
  "other",
] as const

const CATEGORY_LABELS: Record<string, string> = {
  pump: "Pump",
  filter: "Filter",
  heater: "Heater",
  plumbing_leak: "Plumbing / Leak",
  surface: "Surface",
  electrical: "Electrical",
  other: "Other",
}

const PRIORITY_OPTIONS = [
  { value: "emergency", label: "Emergency" },
  { value: "high", label: "High" },
  { value: "normal", label: "Normal" },
  { value: "low", label: "Low" },
]

const PRIORITY_BADGE_CLASSES: Record<string, string> = {
  emergency: "bg-red-500/15 text-red-400 border-red-500/30",
  high: "bg-orange-500/15 text-orange-400 border-orange-500/30",
  normal: "bg-muted text-muted-foreground border-border/50",
  low: "bg-muted/50 text-muted-foreground/70 border-border/30",
}

// ---------------------------------------------------------------------------
// Form state
// ---------------------------------------------------------------------------

interface FormState {
  name: string
  description: string
  category: string
  defaultPriority: string
}

function emptyForm(): FormState {
  return {
    name: "",
    description: "",
    category: "other",
    defaultPriority: "normal",
  }
}

// ---------------------------------------------------------------------------
// WoTemplateManager
// ---------------------------------------------------------------------------

interface WoTemplateManagerProps {
  initialTemplates: WoTemplate[]
}

export function WoTemplateManager({ initialTemplates }: WoTemplateManagerProps) {
  const [templates, setTemplates] = useState<WoTemplate[]>(initialTemplates)
  const [dialogOpen, setDialogOpen] = useState(false)
  const [form, setForm] = useState<FormState>(emptyForm)
  const [deleteConfirmId, setDeleteConfirmId] = useState<string | null>(null)
  const [isPending, startTransition] = useTransition()

  function patchForm(patch: Partial<FormState>) {
    setForm((prev) => ({ ...prev, ...patch }))
  }

  function openCreate() {
    setForm(emptyForm())
    setDialogOpen(true)
  }

  function closeDialog() {
    setDialogOpen(false)
  }

  function handleCreate() {
    if (!form.name.trim()) {
      toast.error("Template name is required")
      return
    }

    startTransition(async () => {
      const input: CreateWoTemplateInput = {
        name: form.name.trim(),
        description: form.description.trim() || undefined,
        category: form.category || undefined,
        defaultPriority: form.defaultPriority,
      }

      const result = await createWoTemplate(input)
      if (!result.success) {
        toast.error("Failed to create template", { description: result.error })
        return
      }

      // Optimistic update
      const optimistic: WoTemplate = {
        id: result.id ?? crypto.randomUUID(),
        org_id: "",
        name: form.name.trim(),
        description: form.description.trim() || null,
        category: form.category || null,
        default_priority: form.defaultPriority,
        line_items_snapshot: null,
        is_active: true,
        created_at: new Date(),
        updated_at: new Date(),
      }
      setTemplates((prev) => [optimistic, ...prev])
      closeDialog()
      toast.success("Template created")
    })
  }

  function handleDelete(templateId: string) {
    startTransition(async () => {
      const result = await deleteWoTemplate(templateId)
      if (!result.success) {
        toast.error("Failed to delete template", { description: result.error })
        return
      }
      setTemplates((prev) => prev.filter((t) => t.id !== templateId))
      setDeleteConfirmId(null)
      toast.success("Template deleted")
    })
  }

  return (
    <div className="flex flex-col gap-4">
      {/* ── Header action ─────────────────────────────────────────────── */}
      <div className="flex justify-end">
        <Button
          type="button"
          size="sm"
          onClick={openCreate}
          className="cursor-pointer"
        >
          <PlusIcon className="h-3.5 w-3.5" />
          Create Template
        </Button>
      </div>

      {/* ── Template list ─────────────────────────────────────────────── */}
      {templates.length === 0 ? (
        <div className="rounded-xl border border-dashed border-border/60 bg-muted/5 px-4 py-6 text-center">
          <FileTextIcon className="h-8 w-8 text-muted-foreground/40 mx-auto mb-2" />
          <p className="text-sm text-muted-foreground">No templates yet.</p>
          <p className="text-xs text-muted-foreground/60 mt-1">
            Create templates for common repeat jobs to save time.
          </p>
        </div>
      ) : (
        <div className="flex flex-col gap-1">
          {templates.map((template) => {
            const itemCount = template.line_items_snapshot?.length ?? 0
            return (
              <div
                key={template.id}
                className="flex items-start justify-between gap-3 p-3 rounded-xl border border-border/60 bg-muted/5 hover:bg-muted/10 transition-colors"
              >
                <div className="flex flex-col gap-0.5 min-w-0 flex-1">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="text-sm font-medium leading-tight">{template.name}</span>
                    {template.category && (
                      <span className="text-[10px] bg-muted text-muted-foreground border border-border/50 px-1.5 py-0 rounded-sm font-medium">
                        {CATEGORY_LABELS[template.category] ?? template.category}
                      </span>
                    )}
                    <span
                      className={`text-[10px] px-1.5 py-0 rounded-sm border font-medium ${
                        PRIORITY_BADGE_CLASSES[template.default_priority] ?? PRIORITY_BADGE_CLASSES.normal
                      }`}
                    >
                      {template.default_priority.charAt(0).toUpperCase() + template.default_priority.slice(1)}
                    </span>
                  </div>
                  <div className="flex items-center gap-3 text-xs text-muted-foreground">
                    {template.description && (
                      <span className="truncate max-w-[200px]">{template.description}</span>
                    )}
                    <span>{itemCount} line item{itemCount !== 1 ? "s" : ""}</span>
                  </div>
                </div>

                <button
                  type="button"
                  onClick={() => setDeleteConfirmId(template.id)}
                  className="p-1.5 rounded-lg hover:bg-destructive/10 text-muted-foreground hover:text-destructive transition-colors cursor-pointer shrink-0"
                  aria-label="Delete template"
                >
                  <Trash2Icon className="h-3.5 w-3.5" />
                </button>
              </div>
            )
          })}
        </div>
      )}

      {/* ── Create dialog ────────────────────────────────────────────── */}
      <Dialog open={dialogOpen} onOpenChange={(open) => { if (!open) closeDialog() }}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Create Work Order Template</DialogTitle>
          </DialogHeader>

          <div className="flex flex-col gap-4">
            {/* Name */}
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="wt-name" className="text-xs text-muted-foreground">
                Template Name <span className="text-destructive">*</span>
              </Label>
              <Input
                id="wt-name"
                className="h-8 text-sm"
                placeholder="e.g. Pump Motor Replacement"
                value={form.name}
                onChange={(e) => patchForm({ name: e.target.value })}
              />
            </div>

            {/* Description */}
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="wt-description" className="text-xs text-muted-foreground">
                Description
              </Label>
              <Input
                id="wt-description"
                className="h-8 text-sm"
                placeholder="Brief description of when to use this template"
                value={form.description}
                onChange={(e) => patchForm({ description: e.target.value })}
              />
            </div>

            {/* Category + Priority row */}
            <div className="grid grid-cols-2 gap-3">
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="wt-category" className="text-xs text-muted-foreground">
                  Category
                </Label>
                <Select
                  value={form.category}
                  onValueChange={(v) => patchForm({ category: v })}
                >
                  <SelectTrigger id="wt-category" className="h-8 text-sm">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {WO_CATEGORIES.map((cat) => (
                      <SelectItem key={cat} value={cat}>
                        {CATEGORY_LABELS[cat] ?? cat}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="wt-priority" className="text-xs text-muted-foreground">
                  Default Priority
                </Label>
                <Select
                  value={form.defaultPriority}
                  onValueChange={(v) => patchForm({ defaultPriority: v })}
                >
                  <SelectTrigger id="wt-priority" className="h-8 text-sm">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {PRIORITY_OPTIONS.map((p) => (
                      <SelectItem key={p.value} value={p.value}>{p.label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>

            <p className="text-xs text-muted-foreground rounded-lg bg-muted/20 border border-border/40 p-2.5">
              Line items can be added after creating the template by opening a work order created from this template and editing the items.
            </p>
          </div>

          <DialogFooter className="flex gap-2 pt-2">
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={closeDialog}
              disabled={isPending}
              className="cursor-pointer"
            >
              Cancel
            </Button>
            <Button
              type="button"
              size="sm"
              onClick={handleCreate}
              disabled={isPending}
              className="cursor-pointer"
            >
              {isPending ? "Creating…" : "Create Template"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ── Delete confirmation ───────────────────────────────────────── */}
      <Dialog
        open={deleteConfirmId !== null}
        onOpenChange={(open) => { if (!open) setDeleteConfirmId(null) }}
      >
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>Delete Template?</DialogTitle>
          </DialogHeader>
          <p className="text-sm text-muted-foreground">
            This template will be permanently deleted. Work orders created from it are unaffected.
          </p>
          <DialogFooter className="flex gap-2 pt-2">
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => setDeleteConfirmId(null)}
              disabled={isPending}
              className="cursor-pointer"
            >
              Cancel
            </Button>
            <Button
              type="button"
              variant="destructive"
              size="sm"
              onClick={() => deleteConfirmId && handleDelete(deleteConfirmId)}
              disabled={isPending}
              className="cursor-pointer"
            >
              {isPending ? "Deleting…" : "Delete Template"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
