"use client"

import { useState, useEffect, useRef } from "react"
import { useRouter } from "next/navigation"
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import {
  createProject,
  getCustomersForProjectCreation,
} from "@/actions/projects"
import type { ProjectTemplate, ProjectSummary } from "@/actions/projects"
import { PROJECT_TYPE_LABELS } from "@/lib/projects-constants"

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

const PROJECT_TYPES = Object.entries(PROJECT_TYPE_LABELS)

const LEAD_SOURCES: Array<{ value: string; label: string }> = [
  { value: "phone", label: "Phone" },
  { value: "website", label: "Website" },
  { value: "portal", label: "Customer Portal" },
  { value: "tech_flag", label: "Tech Flagged" },
  { value: "referral", label: "Referral" },
  { value: "other", label: "Other" },
]

interface CreateProjectDialogProps {
  open: boolean
  onClose: () => void
  templates: ProjectTemplate[]
  onCreated: (project: ProjectSummary) => void
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function CreateProjectDialog({
  open,
  onClose,
  templates,
  onCreated,
}: CreateProjectDialogProps) {
  const router = useRouter()

  const [customers, setCustomers] = useState<Array<{ id: string; name: string }>>([])
  const [customersLoaded, setCustomersLoaded] = useState(false)

  const [customerId, setCustomerId] = useState("")
  const [customerSearch, setCustomerSearch] = useState("")
  const [showCustomerDropdown, setShowCustomerDropdown] = useState(false)
  const [projectType, setProjectType] = useState("renovation")
  const [name, setName] = useState("")
  const [leadSource, setLeadSource] = useState("")
  const [templateId, setTemplateId] = useState("")
  const [notes, setNotes] = useState("")
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const customerInputRef = useRef<HTMLInputElement>(null)

  // Load customers when dialog opens
  useEffect(() => {
    if (!open || customersLoaded) return
    getCustomersForProjectCreation().then((result) => {
      if (!("error" in result)) {
        setCustomers(result)
        setCustomersLoaded(true)
      }
    })
  }, [open, customersLoaded])

  // Auto-suggest project name when type + customer change
  useEffect(() => {
    if (customerId && projectType && !name) {
      const customer = customers.find((c) => c.id === customerId)
      if (customer) {
        const typeLabel = PROJECT_TYPE_LABELS[projectType] ?? projectType
        setName(`${customer.name} — ${typeLabel}`)
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [customerId, projectType])

  // Filter customers by search
  const filteredCustomers = customerSearch
    ? customers.filter((c) => c.name.toLowerCase().includes(customerSearch.toLowerCase()))
    : customers.slice(0, 20) // Show first 20 when no search

  function selectCustomer(customer: { id: string; name: string }) {
    setCustomerId(customer.id)
    setCustomerSearch(customer.name)
    setShowCustomerDropdown(false)
  }

  function reset() {
    setCustomerId("")
    setCustomerSearch("")
    setProjectType("renovation")
    setName("")
    setLeadSource("")
    setTemplateId("")
    setNotes("")
    setError(null)
  }

  function handleClose() {
    reset()
    onClose()
  }

  async function handleSubmit() {
    setError(null)

    if (!customerId) {
      setError("Please select a customer")
      return
    }
    if (!name.trim()) {
      setError("Project name is required")
      return
    }

    setSaving(true)
    try {
      const result = await createProject({
        customer_id: customerId,
        project_type: projectType,
        name: name.trim(),
        lead_source: leadSource || null,
        lead_notes: notes.trim() || null,
        template_id: templateId || null,
      })

      if ("error" in result) {
        setError(result.error)
        return
      }

      onCreated(result.data)
      handleClose()
      router.push(`/projects/${result.data.id}`)
    } finally {
      setSaving(false)
    }
  }

  // Filter templates by selected type
  const relevantTemplates = templates.filter(
    (t) => t.project_type === projectType || projectType === "other"
  )
  const allTemplatesForType = templates.length > 0

  return (
    <Dialog open={open} onOpenChange={(v) => !v && handleClose()}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>New Project</DialogTitle>
          <DialogDescription>
            Create a project from a lead. You can add more details — proposals, phases, and
            materials — on the project page.
          </DialogDescription>
        </DialogHeader>

        <div className="flex flex-col gap-4 py-2">
          {/* Customer */}
          <div className="flex flex-col gap-1.5 relative">
            <Label htmlFor="project-customer">Customer</Label>
            <Input
              id="project-customer"
              ref={customerInputRef}
              value={customerSearch}
              onChange={(e) => {
                setCustomerSearch(e.target.value)
                setCustomerId("")
                setShowCustomerDropdown(true)
              }}
              onFocus={() => setShowCustomerDropdown(true)}
              onBlur={() => {
                // Delay to allow click to register
                setTimeout(() => setShowCustomerDropdown(false), 150)
              }}
              placeholder="Search customers..."
              autoComplete="off"
            />
            {showCustomerDropdown && filteredCustomers.length > 0 && (
              <div className="absolute top-full z-50 mt-1 w-full rounded-md border border-border bg-popover shadow-md">
                <div className="max-h-48 overflow-y-auto py-1">
                  {filteredCustomers.map((c) => (
                    <button
                      key={c.id}
                      type="button"
                      className="w-full px-3 py-2 text-left text-sm hover:bg-accent hover:text-accent-foreground transition-colors"
                      onMouseDown={() => selectCustomer(c)}
                    >
                      {c.name}
                    </button>
                  ))}
                </div>
              </div>
            )}
            {customersLoaded && filteredCustomers.length === 0 && customerSearch && (
              <p className="text-xs text-muted-foreground">No matching customers found.</p>
            )}
          </div>

          {/* Project Type */}
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="project-type">Project Type</Label>
            <Select
              value={projectType}
              onValueChange={(v) => {
                setProjectType(v)
                setTemplateId("") // reset template when type changes
              }}
            >
              <SelectTrigger id="project-type">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {PROJECT_TYPES.map(([value, label]) => (
                  <SelectItem key={value} value={value}>
                    {label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* Name */}
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="project-name">Project Name</Label>
            <Input
              id="project-name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g. Smith — Pool Renovation"
            />
          </div>

          {/* Lead Source */}
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="project-lead-source">Lead Source</Label>
            <Select value={leadSource} onValueChange={setLeadSource}>
              <SelectTrigger id="project-lead-source">
                <SelectValue placeholder="Select source..." />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="">None</SelectItem>
                {LEAD_SOURCES.map((s) => (
                  <SelectItem key={s.value} value={s.value}>
                    {s.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* Template */}
          {allTemplatesForType && (
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="project-template">Template</Label>
              <Select value={templateId} onValueChange={setTemplateId}>
                <SelectTrigger id="project-template">
                  <SelectValue placeholder="No template (start blank)" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="">No template (start blank)</SelectItem>
                  {relevantTemplates.map((t) => (
                    <SelectItem key={t.id} value={t.id}>
                      {t.name}
                    </SelectItem>
                  ))}
                  {relevantTemplates.length === 0 && templates.length > 0 && (
                    <>
                      {templates.map((t) => (
                        <SelectItem key={t.id} value={t.id}>
                          {t.name}
                        </SelectItem>
                      ))}
                    </>
                  )}
                </SelectContent>
              </Select>
              {templateId && (
                <p className="text-xs text-muted-foreground">
                  {(() => {
                    const t = templates.find((t) => t.id === templateId)
                    if (!t?.default_phases?.length) return null
                    return `Will create ${t.default_phases.length} phase${t.default_phases.length !== 1 ? "s" : ""} automatically`
                  })()}
                </p>
              )}
            </div>
          )}

          {/* Notes */}
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="project-notes">Notes (optional)</Label>
            <Textarea
              id="project-notes"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Lead details, initial requirements..."
              rows={3}
            />
          </div>

          {error && <p className="text-sm text-destructive">{error}</p>}
        </div>

        <DialogFooter>
          <Button type="button" variant="outline" onClick={handleClose} disabled={saving}>
            Cancel
          </Button>
          <Button type="button" onClick={handleSubmit} disabled={saving || !customerId}>
            {saving ? "Creating..." : "Create Project"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
