"use client"

/**
 * Phase 13: Truck Load Templates Settings
 *
 * Settings tab for managing truck load templates.
 * Owner/office can create, edit, and delete templates.
 * Templates define standard truck loads that can be applied to techs.
 *
 * Features:
 * - Create/edit/delete templates (including editing items on existing templates)
 * - Catalog search: debounced search against parts_catalog + chemical_products
 * - Mobile-friendly stacked card layout per item
 * - Apply template to a tech
 */

import { useState, useTransition, useRef, useEffect, useCallback } from "react"
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
  replaceTemplateItems,
  getTemplateItems,
} from "@/actions/truck-inventory"
import type { CatalogSearchResult } from "@/actions/parts-catalog"

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
  catalog_item_id?: string | null
  chemical_product_id?: string | null
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
// Item Card Editor
// ---------------------------------------------------------------------------

interface ItemCardEditorProps {
  item: TemplateItem
  index: number
  onChange: (index: number, updated: TemplateItem) => void
  onRemove: (index: number) => void
}

function ItemCardEditor({ item, index, onChange, onRemove }: ItemCardEditorProps) {
  const [quantityStr, setQuantityStr] = useState(String(item.default_quantity))
  const [thresholdStr, setThresholdStr] = useState(String(item.min_threshold))
  const [nameInput, setNameInput] = useState(item.item_name)
  const [searchResults, setSearchResults] = useState<CatalogSearchResult[]>([])
  const [isSearching, setIsSearching] = useState(false)
  const [showDropdown, setShowDropdown] = useState(false)
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const containerRef = useRef<HTMLDivElement>(null)

  // Sync nameInput if parent item changes externally
  useEffect(() => {
    setNameInput(item.item_name)
  }, [item.item_name])

  const runSearch = useCallback(async (query: string) => {
    if (query.length < 2) {
      setSearchResults([])
      setShowDropdown(false)
      return
    }
    setIsSearching(true)
    try {
      const { searchCatalogAndChemicals } = await import("@/actions/parts-catalog")
      const results = await searchCatalogAndChemicals(query)
      setSearchResults(results)
      setShowDropdown(results.length > 0)
    } catch {
      setSearchResults([])
    } finally {
      setIsSearching(false)
    }
  }, [])

  function handleNameChange(e: React.ChangeEvent<HTMLInputElement>) {
    const val = e.target.value
    setNameInput(val)
    onChange(index, {
      ...item,
      item_name: val,
      catalog_item_id: null,
      chemical_product_id: null,
    })

    if (debounceRef.current) clearTimeout(debounceRef.current)
    debounceRef.current = setTimeout(() => runSearch(val), 300)
  }

  function handleSelectResult(result: CatalogSearchResult) {
    setNameInput(result.name)
    setShowDropdown(false)
    setSearchResults([])
    onChange(index, {
      ...item,
      item_name: result.name,
      category: result.category,
      unit: result.unit,
      catalog_item_id: result.catalogItemId ?? null,
      chemical_product_id: result.chemicalProductId ?? null,
    })
  }

  // Close dropdown on outside click
  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setShowDropdown(false)
      }
    }
    document.addEventListener("mousedown", handleClickOutside)
    return () => document.removeEventListener("mousedown", handleClickOutside)
  }, [])

  return (
    <div className="rounded-lg border border-border bg-muted/30 p-3 flex flex-col gap-3">
      {/* Item name with catalog search */}
      <div className="relative" ref={containerRef}>
        <Input
          value={nameInput}
          onChange={handleNameChange}
          onFocus={() => {
            if (searchResults.length > 0) setShowDropdown(true)
          }}
          placeholder="Item name — type to search catalog"
          className="h-9 text-sm"
          autoComplete="off"
        />
        {isSearching && (
          <span className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-muted-foreground">
            Searching...
          </span>
        )}
        {showDropdown && searchResults.length > 0 && (
          <div className="absolute z-50 mt-1 w-full rounded-md border border-border bg-popover shadow-lg">
            {searchResults.map((result) => (
              <button
                key={result.id}
                type="button"
                className="cursor-pointer w-full px-3 py-2 text-left text-sm hover:bg-accent hover:text-accent-foreground flex items-center justify-between gap-2"
                onMouseDown={(e) => {
                  e.preventDefault()
                  handleSelectResult(result)
                }}
              >
                <span>{result.name}</span>
                <span className="text-xs text-muted-foreground shrink-0">
                  {result.category} · {result.unit}
                </span>
              </button>
            ))}
          </div>
        )}
      </div>

      {/* Category + Unit row */}
      <div className="grid grid-cols-2 gap-2">
        <div className="flex flex-col gap-1">
          <Label className="text-xs text-muted-foreground">Category</Label>
          <Select
            value={item.category}
            onValueChange={(v) => onChange(index, { ...item, category: v })}
          >
            <SelectTrigger className="h-8 text-xs cursor-pointer">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {CATEGORIES.map((c) => (
                <SelectItem key={c} value={c} className="text-xs cursor-pointer">
                  {c.charAt(0).toUpperCase() + c.slice(1)}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div className="flex flex-col gap-1">
          <Label className="text-xs text-muted-foreground">Unit</Label>
          <Select
            value={item.unit}
            onValueChange={(v) => onChange(index, { ...item, unit: v })}
          >
            <SelectTrigger className="h-8 text-xs cursor-pointer">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {COMMON_UNITS.map((u) => (
                <SelectItem key={u} value={u} className="text-xs cursor-pointer">
                  {u}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>

      {/* Qty + Min + Remove row */}
      <div className="flex items-end gap-2">
        <div className="flex flex-col gap-1 flex-1">
          <Label className="text-xs text-muted-foreground">Qty</Label>
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
            className="h-8 text-sm"
            placeholder="1"
          />
        </div>

        <div className="flex flex-col gap-1 flex-1">
          <Label className="text-xs text-muted-foreground">Min threshold</Label>
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
            className="h-8 text-sm"
            placeholder="0"
          />
        </div>

        <Button
          type="button"
          variant="ghost"
          size="sm"
          className="h-8 px-2 text-destructive hover:text-destructive cursor-pointer shrink-0 mb-0"
          onClick={() => onRemove(index)}
        >
          ✕
        </Button>
      </div>
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
  const [loadingItems, setLoadingItems] = useState(false)

  // Load existing template items when editing
  useEffect(() => {
    if (!existingTemplate) return
    setLoadingItems(true)
    getTemplateItems(existingTemplate.id)
      .then((rows) => {
        setItems(
          rows.map((r) => ({
            item_name: r.item_name,
            category: r.category,
            default_quantity: parseFloat(r.default_quantity ?? "1") || 1,
            unit: r.unit,
            min_threshold: parseFloat(r.min_threshold ?? "0") || 0,
            sort_order: r.sort_order ?? 0,
            catalog_item_id: r.catalog_item_id ?? null,
            chemical_product_id: r.chemical_product_id ?? null,
          }))
        )
      })
      .catch(() => setItems([]))
      .finally(() => setLoadingItems(false))
  }, [existingTemplate])

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
        catalog_item_id: null,
        chemical_product_id: null,
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
        const validItems = items.filter((i) => i.item_name.trim())

        if (existingTemplate) {
          // Update metadata
          const updated = await updateTruckLoadTemplate(existingTemplate.id, {
            name: name.trim(),
            target_role: roleValue,
          })
          // Replace items
          await replaceTemplateItems(existingTemplate.id, validItems)
          if (updated) onSaved(updated as Template)
        } else {
          const created = await createTruckLoadTemplate({
            name: name.trim(),
            target_role: roleValue,
            items: validItems,
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
    <DialogContent className="sm:max-w-md max-h-[90dvh] flex flex-col">
      <DialogHeader className="shrink-0">
        <DialogTitle>
          {existingTemplate ? "Edit Template" : "New Truck Load Template"}
        </DialogTitle>
      </DialogHeader>

      <div className="flex flex-col gap-5 py-2 overflow-y-auto flex-1 pr-1">
        {error && <p className="text-sm text-destructive">{error}</p>}

        <div className="flex flex-col gap-4">
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
            <Select value={targetRole} onValueChange={setTargetRole}>
              <SelectTrigger className="cursor-pointer">
                <SelectValue placeholder="All roles" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="tech" className="cursor-pointer">Tech</SelectItem>
                <SelectItem value="all" className="cursor-pointer">All roles</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>

        <div className="flex flex-col gap-3">
          <div className="flex items-center justify-between">
            <Label>Template Items</Label>
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={addItem}
              className="cursor-pointer"
            >
              Add Item
            </Button>
          </div>

          {loadingItems && (
            <p className="text-sm text-muted-foreground italic">Loading items...</p>
          )}

          {!loadingItems && items.length === 0 && (
            <p className="text-sm text-muted-foreground italic">
              No items yet. Add items to define the standard load.
            </p>
          )}

          {!loadingItems && items.length > 0 && (
            <div className="flex flex-col gap-2">
              {items.map((item, index) => (
                <ItemCardEditor
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
      </div>

      <DialogFooter className="shrink-0 pt-2">
        <Button
          variant="outline"
          onClick={onClose}
          disabled={isPending}
          className="cursor-pointer"
        >
          Cancel
        </Button>
        <Button
          onClick={handleSave}
          disabled={isPending || loadingItems}
          className="cursor-pointer"
        >
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
    <DialogContent className="sm:max-w-sm">
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
                <SelectTrigger className="cursor-pointer">
                  <SelectValue placeholder="Select tech..." />
                </SelectTrigger>
                <SelectContent>
                  {allTechs.map((t) => (
                    <SelectItem key={t.id} value={t.id} className="cursor-pointer">
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
          <Button onClick={onClose} className="cursor-pointer">
            Done
          </Button>
        ) : (
          <>
            <Button
              variant="outline"
              onClick={onClose}
              disabled={isPending}
              className="cursor-pointer"
            >
              Cancel
            </Button>
            <Button onClick={handleApply} disabled={isPending} className="cursor-pointer">
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
        <Button
          variant="outline"
          size="sm"
          onClick={() => setShowCreateDialog(true)}
          className="cursor-pointer"
        >
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
            className="flex items-center justify-between rounded-lg border border-border bg-card px-4 py-3 gap-3"
          >
            <div className="min-w-0">
              <p className="text-sm font-medium truncate">{template.name}</p>
              {template.target_role && (
                <Badge variant="outline" className="text-[10px] mt-1">
                  {template.target_role}
                </Badge>
              )}
            </div>

            <div className="flex items-center gap-2 shrink-0">
              <Button
                variant="outline"
                size="sm"
                onClick={() => setApplyingTemplate(template)}
                className="cursor-pointer"
              >
                Apply to Tech
              </Button>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setEditingTemplate(template)}
                className="text-muted-foreground cursor-pointer"
              >
                Edit
              </Button>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => handleDelete(template.id)}
                className="text-destructive hover:text-destructive cursor-pointer"
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
