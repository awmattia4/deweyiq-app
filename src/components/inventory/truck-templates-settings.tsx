"use client"

/**
 * Phase 13: Truck Load Templates Settings
 *
 * Settings tab for managing truck load templates.
 * Owner/office can create, edit, and delete templates.
 * Templates define standard truck loads that can be applied to techs.
 *
 * Features:
 * - Create/edit/delete templates
 * - Add items: name, category, default quantity, unit, min threshold
 * - Apply template to a tech
 */

import { useState, useTransition } from "react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { Badge } from "@/components/ui/badge"
import {
  createTruckLoadTemplate,
  updateTruckLoadTemplate,
  deleteTruckLoadTemplate,
  applyTruckLoadTemplate,
  getTruckLoadTemplates,
} from "@/actions/truck-inventory"

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface TemplateItem {
  item_name: string
  category: string
  default_quantity: number
  unit: string
  min_threshold: number
  sort_order: number
}

interface Template {
  id: string
  name: string
  target_role: string | null
  is_active: boolean
}

interface TechProfile {
  id: string
  fullName: string
}

interface TruckTemplatesSettingsProps {
  initialTemplates: Template[]
  allTechs: TechProfile[]
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const CATEGORIES = ["chemical", "part", "tool", "equipment", "other"]
const COMMON_UNITS = ["oz", "floz", "gallon", "quart", "cup", "lbs", "each", "box", "bag", "roll"]

// ---------------------------------------------------------------------------
// Template Item Editor Row
// ---------------------------------------------------------------------------

interface ItemEditorRowProps {
  item: TemplateItem
  index: number
  onChange: (index: number, updated: TemplateItem) => void
  onRemove: (index: number) => void
}

function ItemEditorRow({ item, index, onChange, onRemove }: ItemEditorRowProps) {
  const [quantityStr, setQuantityStr] = useState(String(item.default_quantity))
  const [thresholdStr, setThresholdStr] = useState(String(item.min_threshold))

  return (
    <div className="flex items-center gap-2 py-2 border-b border-border/50 last:border-0">
      <Input
        value={item.item_name}
        onChange={(e) => onChange(index, { ...item, item_name: e.target.value })}
        placeholder="Item name"
        className="flex-1 h-8 text-sm"
      />

      <Select
        value={item.category}
        onValueChange={(v) => onChange(index, { ...item, category: v })}
      >
        <SelectTrigger className="w-28 h-8 text-xs">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {CATEGORIES.map((c) => (
            <SelectItem key={c} value={c} className="text-xs">
              {c.charAt(0).toUpperCase() + c.slice(1)}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>

      <Input
        type="text"
        inputMode="decimal"
        value={quantityStr}
        onChange={(e) => {
          const v = e.target.value
          if (/^\d*\.?\d*$/.test(v)) setQuantityStr(v)
        }}
        onBlur={() => {
          const p = parseFloat(quantityStr)
          if (!isNaN(p)) {
            setQuantityStr(String(p))
            onChange(index, { ...item, default_quantity: p })
          }
        }}
        className="w-16 h-8 text-sm text-right"
        placeholder="Qty"
      />

      <Select
        value={item.unit}
        onValueChange={(v) => onChange(index, { ...item, unit: v })}
      >
        <SelectTrigger className="w-20 h-8 text-xs">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {COMMON_UNITS.map((u) => (
            <SelectItem key={u} value={u} className="text-xs">{u}</SelectItem>
          ))}
        </SelectContent>
      </Select>

      <Input
        type="text"
        inputMode="decimal"
        value={thresholdStr}
        onChange={(e) => {
          const v = e.target.value
          if (/^\d*\.?\d*$/.test(v)) setThresholdStr(v)
        }}
        onBlur={() => {
          const p = parseFloat(thresholdStr)
          if (!isNaN(p)) {
            setThresholdStr(String(p))
            onChange(index, { ...item, min_threshold: p })
          }
        }}
        className="w-16 h-8 text-sm text-right"
        placeholder="Min"
      />

      <Button
        type="button"
        variant="ghost"
        size="sm"
        className="h-8 px-2 text-destructive hover:text-destructive shrink-0"
        onClick={() => onRemove(index)}
      >
        ×
      </Button>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Template Editor Dialog
// ---------------------------------------------------------------------------

interface TemplateEditorDialogProps {
  existingTemplate?: Template | null
  onSaved: (template: Template) => void
  onClose: () => void
}

function TemplateEditorDialog({ existingTemplate, onSaved, onClose }: TemplateEditorDialogProps) {
  const [isPending, startTransition] = useTransition()
  const [error, setError] = useState<string | null>(null)
  const [name, setName] = useState(existingTemplate?.name ?? "")
  const [targetRole, setTargetRole] = useState(existingTemplate?.target_role ?? "all")
  const [items, setItems] = useState<TemplateItem[]>([])

  function addItem() {
    setItems((prev) => [
      ...prev,
      {
        item_name: "",
        category: "chemical",
        default_quantity: 1,
        unit: "oz",
        min_threshold: 0,
        sort_order: prev.length,
      },
    ])
  }

  function updateItem(index: number, updated: TemplateItem) {
    setItems((prev) => prev.map((item, i) => (i === index ? updated : item)))
  }

  function removeItem(index: number) {
    setItems((prev) => prev.filter((_, i) => i !== index))
  }

  function handleSave() {
    if (!name.trim()) {
      setError("Template name is required")
      return
    }
    setError(null)

    startTransition(async () => {
      try {
        const roleValue = targetRole === "all" ? null : targetRole
        if (existingTemplate) {
          const updated = await updateTruckLoadTemplate(existingTemplate.id, {
            name: name.trim(),
            target_role: roleValue,
          })
          if (updated) onSaved(updated as Template)
        } else {
          const created = await createTruckLoadTemplate({
            name: name.trim(),
            target_role: roleValue,
            items: items.filter((i) => i.item_name.trim()),
          })
          if (created) onSaved(created as Template)
        }
        onClose()
      } catch (err) {
        setError(err instanceof Error ? err.message : "Failed to save template")
      }
    })
  }

  return (
    <DialogContent className="sm:max-w-[600px] max-h-[80vh] overflow-y-auto">
      <DialogHeader>
        <DialogTitle>
          {existingTemplate ? "Edit Template" : "New Truck Load Template"}
        </DialogTitle>
      </DialogHeader>

      <div className="flex flex-col gap-5 py-2">
        {error && <p className="text-sm text-destructive">{error}</p>}

        <div className="grid grid-cols-2 gap-4">
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="template-name">Template Name</Label>
            <Input
              id="template-name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g. Standard Chem Load"
              autoFocus
            />
          </div>

          <div className="flex flex-col gap-1.5">
            <Label>Target Role</Label>
            <Select
              value={targetRole}
              onValueChange={setTargetRole}
            >
              <SelectTrigger>
                <SelectValue placeholder="All roles" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="tech">Tech</SelectItem>
                <SelectItem value="all">All roles</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>

        {!existingTemplate && (
          <div className="flex flex-col gap-2">
            <div className="flex items-center justify-between">
              <Label>Template Items</Label>
              <Button type="button" variant="outline" size="sm" onClick={addItem}>
                Add Item
              </Button>
            </div>

            {items.length === 0 && (
              <p className="text-sm text-muted-foreground italic">
                No items yet. Add items to define the standard load.
              </p>
            )}

            {items.length > 0 && (
              <div className="border border-border rounded-lg p-2">
                <div className="grid grid-cols-[1fr_7rem_4rem_5rem_4rem_2rem] gap-2 px-1 pb-1">
                  <span className="text-xs text-muted-foreground">Item</span>
                  <span className="text-xs text-muted-foreground">Category</span>
                  <span className="text-xs text-muted-foreground text-right">Qty</span>
                  <span className="text-xs text-muted-foreground">Unit</span>
                  <span className="text-xs text-muted-foreground text-right">Min</span>
                  <span />
                </div>
                {items.map((item, index) => (
                  <ItemEditorRow
                    key={index}
                    item={item}
                    index={index}
                    onChange={updateItem}
                    onRemove={removeItem}
                  />
                ))}
              </div>
            )}
          </div>
        )}

        {existingTemplate && (
          <p className="text-sm text-muted-foreground">
            To edit items, delete this template and create a new one with the updated items.
          </p>
        )}
      </div>

      <DialogFooter>
        <Button variant="outline" onClick={onClose} disabled={isPending}>
          Cancel
        </Button>
        <Button onClick={handleSave} disabled={isPending}>
          {isPending ? "Saving..." : existingTemplate ? "Save Changes" : "Create Template"}
        </Button>
      </DialogFooter>
    </DialogContent>
  )
}

// ---------------------------------------------------------------------------
// Apply Template Dialog
// ---------------------------------------------------------------------------

interface ApplyTemplateDialogProps {
  template: Template
  allTechs: TechProfile[]
  onClose: () => void
}

function ApplyTemplateDialog({ template, allTechs, onClose }: ApplyTemplateDialogProps) {
  const [isPending, startTransition] = useTransition()
  const [techId, setTechId] = useState("")
  const [result, setResult] = useState<{ applied: number; skipped: number } | null>(null)
  const [error, setError] = useState<string | null>(null)

  function handleApply() {
    if (!techId) {
      setError("Select a tech to apply to")
      return
    }
    setError(null)

    startTransition(async () => {
      try {
        const res = await applyTruckLoadTemplate(techId, template.id)
        setResult(res)
      } catch (err) {
        setError(err instanceof Error ? err.message : "Failed to apply template")
      }
    })
  }

  return (
    <DialogContent className="sm:max-w-[380px]">
      <DialogHeader>
        <DialogTitle>Apply Template: {template.name}</DialogTitle>
      </DialogHeader>

      <div className="flex flex-col gap-4 py-2">
        {error && <p className="text-sm text-destructive">{error}</p>}

        {result ? (
          <div className="flex flex-col gap-2">
            <p className="text-sm text-green-400">
              Template applied: {result.applied} item{result.applied !== 1 ? "s" : ""} added
              {result.skipped > 0 && `, ${result.skipped} already existed (skipped)`}
            </p>
          </div>
        ) : (
          <>
            <div className="flex flex-col gap-1.5">
              <Label>Apply to Tech</Label>
              <Select value={techId} onValueChange={setTechId}>
                <SelectTrigger>
                  <SelectValue placeholder="Select tech..." />
                </SelectTrigger>
                <SelectContent>
                  {allTechs.map((t) => (
                    <SelectItem key={t.id} value={t.id}>
                      {t.fullName}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <p className="text-xs text-muted-foreground">
              Items already on the tech's truck will be skipped.
            </p>
          </>
        )}
      </div>

      <DialogFooter>
        {result ? (
          <Button onClick={onClose}>Done</Button>
        ) : (
          <>
            <Button variant="outline" onClick={onClose} disabled={isPending}>
              Cancel
            </Button>
            <Button onClick={handleApply} disabled={isPending}>
              {isPending ? "Applying..." : "Apply Template"}
            </Button>
          </>
        )}
      </DialogFooter>
    </DialogContent>
  )
}

// ---------------------------------------------------------------------------
// Main Component
// ---------------------------------------------------------------------------

export function TruckTemplatesSettings({ initialTemplates, allTechs }: TruckTemplatesSettingsProps) {
  const [templates, setTemplates] = useState<Template[]>(initialTemplates)
  const [showCreateDialog, setShowCreateDialog] = useState(false)
  const [editingTemplate, setEditingTemplate] = useState<Template | null>(null)
  const [applyingTemplate, setApplyingTemplate] = useState<Template | null>(null)
  const [, startTransition] = useTransition()

  function handleSaved(saved: Template) {
    setTemplates((prev) => {
      const exists = prev.find((t) => t.id === saved.id)
      if (exists) return prev.map((t) => (t.id === saved.id ? saved : t))
      return [...prev, saved]
    })
  }

  function handleDelete(templateId: string) {
    startTransition(async () => {
      try {
        await deleteTruckLoadTemplate(templateId)
        setTemplates((prev) => prev.filter((t) => t.id !== templateId))
      } catch (err) {
        console.error("Delete template failed:", err)
      }
    })
  }

  const activeTemplates = templates.filter((t) => t.is_active)

  return (
    <div className="flex flex-col gap-5">
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-sm font-medium">Truck Load Templates</h3>
          <p className="text-sm text-muted-foreground mt-0.5">
            Define standard truck loads to apply to your techs.
          </p>
        </div>
        <Button variant="outline" size="sm" onClick={() => setShowCreateDialog(true)}>
          New Template
        </Button>
      </div>

      {activeTemplates.length === 0 && (
        <p className="text-sm text-muted-foreground italic">
          No templates yet. Create a template to define standard truck loads.
        </p>
      )}

      <div className="flex flex-col gap-2">
        {activeTemplates.map((template) => (
          <div
            key={template.id}
            className="flex items-center justify-between rounded-lg border border-border bg-card px-4 py-3"
          >
            <div>
              <p className="text-sm font-medium">{template.name}</p>
              {template.target_role && (
                <Badge variant="outline" className="text-[10px] mt-1">
                  {template.target_role}
                </Badge>
              )}
            </div>

            <div className="flex items-center gap-2">
              <Button
                variant="outline"
                size="sm"
                onClick={() => setApplyingTemplate(template)}
              >
                Apply to Tech
              </Button>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setEditingTemplate(template)}
                className="text-muted-foreground"
              >
                Edit
              </Button>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => handleDelete(template.id)}
                className="text-destructive hover:text-destructive"
              >
                Delete
              </Button>
            </div>
          </div>
        ))}
      </div>

      {/* Create dialog */}
      <Dialog open={showCreateDialog} onOpenChange={setShowCreateDialog}>
        <TemplateEditorDialog
          onSaved={handleSaved}
          onClose={() => setShowCreateDialog(false)}
        />
      </Dialog>

      {/* Edit dialog */}
      <Dialog open={!!editingTemplate} onOpenChange={() => setEditingTemplate(null)}>
        {editingTemplate && (
          <TemplateEditorDialog
            existingTemplate={editingTemplate}
            onSaved={handleSaved}
            onClose={() => setEditingTemplate(null)}
          />
        )}
      </Dialog>

      {/* Apply dialog */}
      <Dialog open={!!applyingTemplate} onOpenChange={() => setApplyingTemplate(null)}>
        {applyingTemplate && (
          <ApplyTemplateDialog
            template={applyingTemplate}
            allTechs={allTechs}
            onClose={() => setApplyingTemplate(null)}
          />
        )}
      </Dialog>
    </div>
  )
}
