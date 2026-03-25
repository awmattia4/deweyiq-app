"use client"

import { useState, useTransition } from "react"
import { toast } from "sonner"
import { cn } from "@/lib/utils"
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card"
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
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { Checkbox } from "@/components/ui/checkbox"
import {
  getAgreementTemplates,
  createAgreementTemplate,
  updateAgreementTemplate,
  deleteAgreementTemplate,
} from "@/actions/agreements"
import { updateOrgSettings } from "@/actions/company-settings"
import type { OrgSettings } from "@/actions/company-settings"

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface AgreementTemplate {
  id: string
  name: string
  default_term_type: string | null
  default_frequency: string | null
  default_pricing_model: string | null
  default_monthly_amount: string | null
  terms_and_conditions: string | null
  cancellation_policy: string | null
  liability_waiver: string | null
  service_description: string | null
  is_active: boolean
  created_at: Date
  updated_at: Date
}

interface AgreementTemplatesTabProps {
  initialTemplates: AgreementTemplate[]
  orgSettings: OrgSettings | null
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const TERM_TYPE_OPTIONS = [
  { value: "month_to_month", label: "Month to Month" },
  { value: "6_month", label: "6-Month Term" },
  { value: "12_month", label: "12-Month Term" },
]

const FREQUENCY_OPTIONS = [
  { value: "weekly", label: "Weekly" },
  { value: "biweekly", label: "Bi-weekly" },
  { value: "monthly", label: "Monthly" },
]

const PRICING_MODEL_OPTIONS = [
  { value: "monthly_flat", label: "Monthly Flat Rate" },
  { value: "per_visit", label: "Per Visit" },
  { value: "tiered", label: "Tiered" },
]

const DEFAULT_TERMS_AND_CONDITIONS = `SERVICE AGREEMENT TERMS AND CONDITIONS

1. SERVICE OBLIGATIONS
The service provider agrees to perform routine pool maintenance as specified in this agreement. Services include, but are not limited to: water testing and chemical balancing, skimming, brushing, and vacuuming of pool surfaces as needed, and inspection of pool equipment.

2. CUSTOMER RESPONSIBILITIES
Customer agrees to: (a) maintain safe and unobstructed access to the pool during scheduled service windows; (b) notify the service provider promptly of any equipment malfunctions or unusual water conditions; (c) maintain adequate pool water level; (d) not add chemicals within 24 hours before or after scheduled service without prior notice.

3. PAYMENT TERMS
Invoices are issued monthly. Payment is due within the number of days stated on each invoice. Accounts more than 30 days past due may result in service suspension. Returned payments are subject to a $35 fee.

4. CHEMICAL SUPPLY
Customer is responsible for maintaining adequate supplies of primary sanitizing chemicals (chlorine/salt cell). The service provider will perform chemical adjustments using materials on-hand and will notify the customer when replenishment is needed.

5. EQUIPMENT & LIABILITY
The service provider is not liable for pre-existing equipment deficiencies or damage resulting from deferred maintenance disclosed prior to or discovered during service. The customer is responsible for maintaining pool equipment in serviceable condition.

6. DISPUTE RESOLUTION
Any disputes arising from this agreement shall be resolved through good-faith negotiation. If unresolved within 30 days, the parties agree to submit to binding arbitration under applicable state law.`

const DEFAULT_CANCELLATION_POLICY = `CANCELLATION POLICY

Either party may cancel this service agreement by providing written notice as specified below.

Month-to-Month agreements: 30 days written notice required. Service will continue and invoices will be generated through the end of the notice period.

Term agreements (6-Month or 12-Month): Cancellation prior to the end of the agreed term may be subject to an early termination fee equal to one month's service charge. 30 days written notice is required.

Notice must be delivered via email or certified mail to the addresses on file. Verbal cancellations are not accepted.`

const DEFAULT_LIABILITY_WAIVER = `LIMITATION OF LIABILITY

To the fullest extent permitted by applicable law, the service provider's total liability to the customer for any claim arising from this agreement shall not exceed the total service fees paid by the customer in the 90 days preceding the claim.

The service provider is not liable for: (a) property damage resulting from pre-existing conditions, including but not limited to cracked decking, aging equipment, or structural deficiencies; (b) water chemistry imbalances caused by environmental factors, bather loads, or customer-added chemicals outside the scheduled service window; (c) equipment failure due to normal wear and deterioration; (d) delays or service interruptions caused by weather, acts of nature, or other force majeure events.

Customer acknowledges and accepts these limitations as a material condition of this agreement.`

// ---------------------------------------------------------------------------
// Empty form state
// ---------------------------------------------------------------------------

interface TemplateForm {
  name: string
  default_term_type: string
  default_frequency: string
  default_pricing_model: string
  default_monthly_amount: string
  terms_and_conditions: string
  cancellation_policy: string
  liability_waiver: string
  service_description: string
  is_active: boolean
}

function emptyForm(): TemplateForm {
  return {
    name: "",
    default_term_type: "month_to_month",
    default_frequency: "weekly",
    default_pricing_model: "monthly_flat",
    default_monthly_amount: "",
    terms_and_conditions: DEFAULT_TERMS_AND_CONDITIONS,
    cancellation_policy: DEFAULT_CANCELLATION_POLICY,
    liability_waiver: DEFAULT_LIABILITY_WAIVER,
    service_description: "",
    is_active: true,
  }
}

function templateToForm(tpl: AgreementTemplate): TemplateForm {
  return {
    name: tpl.name,
    default_term_type: tpl.default_term_type ?? "month_to_month",
    default_frequency: tpl.default_frequency ?? "weekly",
    default_pricing_model: tpl.default_pricing_model ?? "monthly_flat",
    default_monthly_amount: tpl.default_monthly_amount
      ? String(parseFloat(tpl.default_monthly_amount) || "")
      : "",
    terms_and_conditions: tpl.terms_and_conditions ?? DEFAULT_TERMS_AND_CONDITIONS,
    cancellation_policy: tpl.cancellation_policy ?? DEFAULT_CANCELLATION_POLICY,
    liability_waiver: tpl.liability_waiver ?? DEFAULT_LIABILITY_WAIVER,
    service_description: tpl.service_description ?? "",
    is_active: tpl.is_active,
  }
}

// ---------------------------------------------------------------------------
// Label helpers
// ---------------------------------------------------------------------------

function termLabel(v: string | null) {
  return TERM_TYPE_OPTIONS.find((o) => o.value === v)?.label ?? v ?? "—"
}

function freqLabel(v: string | null) {
  return FREQUENCY_OPTIONS.find((o) => o.value === v)?.label ?? v ?? "—"
}

function pricingLabel(v: string | null) {
  return PRICING_MODEL_OPTIONS.find((o) => o.value === v)?.label ?? v ?? "—"
}

// ---------------------------------------------------------------------------
// AgreementTemplatesTab
// ---------------------------------------------------------------------------

export function AgreementTemplatesTab({
  initialTemplates,
  orgSettings,
}: AgreementTemplatesTabProps) {
  const [templates, setTemplates] = useState<AgreementTemplate[]>(initialTemplates)
  const [isPending, startTransition] = useTransition()

  // Dialog state
  const [dialogOpen, setDialogOpen] = useState(false)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [form, setForm] = useState<TemplateForm>(emptyForm())
  const [formErrors, setFormErrors] = useState<Record<string, string>>({})
  const [deleteConfirmId, setDeleteConfirmId] = useState<string | null>(null)

  // Org settings state
  const [noticePeriodDays, setNoticePeriodDays] = useState<string>(
    String(orgSettings?.agreement_notice_period_days ?? 30)
  )
  const [renewalLeadDays, setRenewalLeadDays] = useState<string>(
    (orgSettings?.agreement_renewal_lead_days ?? [30, 7]).join(", ")
  )
  const [numberPrefix, setNumberPrefix] = useState<string>(
    orgSettings?.agreement_number_prefix ?? "SA"
  )
  const [savingSettings, setSavingSettings] = useState(false)

  // ── Handlers ────────────────────────────────────────────────────────────────

  function openCreate() {
    setEditingId(null)
    setForm(emptyForm())
    setFormErrors({})
    setDialogOpen(true)
  }

  function openEdit(tpl: AgreementTemplate) {
    setEditingId(tpl.id)
    setForm(templateToForm(tpl))
    setFormErrors({})
    setDialogOpen(true)
  }

  function validateForm(): boolean {
    const errors: Record<string, string> = {}
    if (!form.name.trim()) errors.name = "Name is required"
    setFormErrors(errors)
    return Object.keys(errors).length === 0
  }

  function handleSave() {
    if (!validateForm()) return

    startTransition(async () => {
      const payload = {
        name: form.name.trim(),
        default_term_type: form.default_term_type || null,
        default_frequency: form.default_frequency || null,
        default_pricing_model: form.default_pricing_model || null,
        default_monthly_amount: form.default_monthly_amount
          ? String(parseFloat(form.default_monthly_amount) || "")
          : null,
        terms_and_conditions: form.terms_and_conditions || null,
        cancellation_policy: form.cancellation_policy || null,
        liability_waiver: form.liability_waiver || null,
        service_description: form.service_description || null,
        is_active: form.is_active,
      }

      if (editingId) {
        const result = await updateAgreementTemplate(editingId, payload)
        if (!result.success) {
          toast.error(result.error ?? "Failed to update template")
          return
        }
        // Update local state
        setTemplates((prev) =>
          prev.map((t) =>
            t.id === editingId
              ? {
                  ...t,
                  ...payload,
                  default_monthly_amount: payload.default_monthly_amount ?? null,
                  updated_at: new Date(),
                }
              : t
          )
        )
        toast.success("Template updated")
      } else {
        const result = await createAgreementTemplate(payload)
        if (!result.success || !result.data) {
          toast.error(result.error ?? "Failed to create template")
          return
        }
        // Refresh list from server
        const refreshed = await getAgreementTemplates()
        if (refreshed.success && refreshed.data) {
          setTemplates(refreshed.data as AgreementTemplate[])
        }
        toast.success("Template created")
      }

      setDialogOpen(false)
    })
  }

  function handleDelete(id: string) {
    startTransition(async () => {
      const result = await deleteAgreementTemplate(id)
      if (!result.success) {
        toast.error(result.error ?? "Failed to delete template")
        return
      }
      setTemplates((prev) => prev.filter((t) => t.id !== id))
      setDeleteConfirmId(null)
      toast.success("Template deleted")
    })
  }

  async function handleSaveOrgSettings() {
    setSavingSettings(true)
    try {
      // Parse renewal lead days (comma or space separated integers)
      const rawLeadDays = renewalLeadDays
        .split(/[,\s]+/)
        .map((s) => parseInt(s.trim()))
        .filter((n) => !isNaN(n) && n > 0)

      const noticeDays = parseInt(noticePeriodDays)

      const result = await updateOrgSettings({
        agreement_notice_period_days: isNaN(noticeDays) ? 30 : noticeDays,
        agreement_renewal_lead_days: rawLeadDays.length > 0 ? rawLeadDays : [30, 7],
        agreement_number_prefix: numberPrefix.trim() || "SA",
      })

      if (!result.success) {
        toast.error("Failed to save settings")
      } else {
        toast.success("Agreement settings saved")
      }
    } finally {
      setSavingSettings(false)
    }
  }

  // ── Render ──────────────────────────────────────────────────────────────────

  return (
    <div className="flex flex-col gap-6">
      {/* ── Templates section ──────────────────────────────────────────────── */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between gap-3">
            <div>
              <CardTitle className="text-base">Agreement Templates</CardTitle>
              <CardDescription className="mt-1">
                Reusable templates pre-fill default terms, pricing, and frequency when creating new agreements.
              </CardDescription>
            </div>
            <Button type="button" size="sm" onClick={openCreate}>
              New template
            </Button>
          </div>
        </CardHeader>
        <CardContent>
          {templates.length === 0 ? (
            <p className="text-sm text-muted-foreground italic">
              No templates yet. Create one to speed up agreement creation.
            </p>
          ) : (
            <div className="flex flex-col gap-3">
              {templates.map((tpl) => (
                <div
                  key={tpl.id}
                  className={cn(
                    "flex items-start justify-between gap-3 rounded-lg border p-4 transition-colors hover:bg-muted/20",
                    !tpl.is_active && "opacity-60"
                  )}
                >
                  <div className="flex flex-col gap-1.5 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="text-sm font-medium">{tpl.name}</span>
                      {tpl.is_active ? (
                        <Badge variant="outline" className="text-xs text-emerald-400 border-emerald-800/50">
                          Active
                        </Badge>
                      ) : (
                        <Badge variant="outline" className="text-xs text-muted-foreground">
                          Inactive
                        </Badge>
                      )}
                    </div>
                    <p className="text-xs text-muted-foreground">
                      {termLabel(tpl.default_term_type)} &middot; {freqLabel(tpl.default_frequency)} &middot; {pricingLabel(tpl.default_pricing_model)}
                      {tpl.default_monthly_amount && (
                        <> &middot; ${parseFloat(tpl.default_monthly_amount).toFixed(2)}/mo</>
                      )}
                    </p>
                  </div>
                  <div className="flex items-center gap-1.5 shrink-0">
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      className="h-7 px-2 text-xs"
                      onClick={() => openEdit(tpl)}
                    >
                      Edit
                    </Button>
                    {deleteConfirmId === tpl.id ? (
                      <div className="flex items-center gap-1.5">
                        <Button
                          type="button"
                          variant="destructive"
                          size="sm"
                          className="h-7 px-2 text-xs"
                          disabled={isPending}
                          onClick={() => handleDelete(tpl.id)}
                        >
                          Confirm
                        </Button>
                        <Button
                          type="button"
                          variant="ghost"
                          size="sm"
                          className="h-7 px-2 text-xs"
                          onClick={() => setDeleteConfirmId(null)}
                        >
                          Cancel
                        </Button>
                      </div>
                    ) : (
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        className="h-7 px-2 text-xs text-muted-foreground hover:text-destructive"
                        onClick={() => setDeleteConfirmId(tpl.id)}
                      >
                        Delete
                      </Button>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* ── Agreement defaults ─────────────────────────────────────────────── */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Agreement Defaults</CardTitle>
          <CardDescription>
            Org-level defaults applied to all agreements.
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="flex flex-col gap-1.5">
              <Label className="text-sm">Agreement number prefix</Label>
              <div className="flex items-center gap-2">
                <Input
                  className="w-24"
                  value={numberPrefix}
                  onChange={(e) => setNumberPrefix(e.target.value.toUpperCase())}
                  maxLength={8}
                  placeholder="SA"
                />
                <span className="text-sm text-muted-foreground">e.g. SA-0001</span>
              </div>
            </div>

            <div className="flex flex-col gap-1.5">
              <Label className="text-sm">Cancellation notice period (days)</Label>
              <Input
                type="number"
                min={1}
                className="w-28"
                value={noticePeriodDays}
                onChange={(e) => setNoticePeriodDays(e.target.value)}
              />
            </div>
          </div>

          <div className="flex flex-col gap-1.5">
            <Label className="text-sm">Renewal reminder lead times (days)</Label>
            <Input
              className="w-48"
              value={renewalLeadDays}
              onChange={(e) => setRenewalLeadDays(e.target.value)}
              placeholder="30, 7"
            />
            <p className="text-xs text-muted-foreground">
              Comma-separated days before expiry to send reminders. e.g. 30, 7
            </p>
          </div>

          <div className="pt-1">
            <Button
              type="button"
              size="sm"
              variant="outline"
              disabled={savingSettings}
              onClick={handleSaveOrgSettings}
            >
              {savingSettings ? "Saving..." : "Save defaults"}
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* ── Create / Edit template dialog ──────────────────────────────────── */}
      <Dialog open={dialogOpen} onOpenChange={(open) => { if (!isPending) setDialogOpen(open) }}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{editingId ? "Edit Template" : "New Agreement Template"}</DialogTitle>
            <DialogDescription>
              {editingId
                ? "Update this template. Changes apply to new agreements — existing agreements are not affected."
                : "Create a reusable template to pre-fill agreement terms, pricing, and frequency."}
            </DialogDescription>
          </DialogHeader>

          <div className="flex flex-col gap-4 pt-2">
            {/* Name */}
            <div className="flex flex-col gap-1.5">
              <Label>Template name <span className="text-destructive">*</span></Label>
              <Input
                value={form.name}
                onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
                placeholder="e.g. Standard Weekly Service"
                className={formErrors.name ? "border-destructive" : ""}
              />
              {formErrors.name && (
                <p className="text-xs text-destructive">{formErrors.name}</p>
              )}
            </div>

            {/* Defaults row */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="flex flex-col gap-1.5">
                <Label className="text-sm">Default term type</Label>
                <Select
                  value={form.default_term_type}
                  onValueChange={(v) => setForm((f) => ({ ...f, default_term_type: v }))}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {TERM_TYPE_OPTIONS.map((opt) => (
                      <SelectItem key={opt.value} value={opt.value}>{opt.label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="flex flex-col gap-1.5">
                <Label className="text-sm">Default frequency</Label>
                <Select
                  value={form.default_frequency}
                  onValueChange={(v) => setForm((f) => ({ ...f, default_frequency: v }))}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {FREQUENCY_OPTIONS.map((opt) => (
                      <SelectItem key={opt.value} value={opt.value}>{opt.label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="flex flex-col gap-1.5">
                <Label className="text-sm">Default pricing model</Label>
                <Select
                  value={form.default_pricing_model}
                  onValueChange={(v) => setForm((f) => ({ ...f, default_pricing_model: v }))}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {PRICING_MODEL_OPTIONS.map((opt) => (
                      <SelectItem key={opt.value} value={opt.value}>{opt.label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              {form.default_pricing_model === "monthly_flat" && (
                <div className="flex flex-col gap-1.5">
                  <Label className="text-sm">Default monthly amount ($)</Label>
                  <Input
                    type="text"
                    inputMode="decimal"
                    value={form.default_monthly_amount}
                    onChange={(e) => setForm((f) => ({ ...f, default_monthly_amount: e.target.value }))}
                    placeholder="0.00"
                    className="w-36"
                  />
                </div>
              )}
            </div>

            {/* Active toggle */}
            <label className="flex items-center gap-2.5 cursor-pointer">
              <Checkbox
                checked={form.is_active}
                onCheckedChange={(v) => setForm((f) => ({ ...f, is_active: v === true }))}
              />
              <span className="text-sm">Active (shown in agreement builder)</span>
            </label>

            {/* Legal text */}
            <div className="flex flex-col gap-1.5">
              <Label className="text-sm">Terms &amp; Conditions</Label>
              <Textarea
                className="min-h-[100px] text-xs font-mono resize-y"
                value={form.terms_and_conditions}
                onChange={(e) => setForm((f) => ({ ...f, terms_and_conditions: e.target.value }))}
              />
            </div>

            <div className="flex flex-col gap-1.5">
              <Label className="text-sm">Cancellation Policy</Label>
              <Textarea
                className="min-h-[80px] text-xs font-mono resize-y"
                value={form.cancellation_policy}
                onChange={(e) => setForm((f) => ({ ...f, cancellation_policy: e.target.value }))}
              />
            </div>

            <div className="flex flex-col gap-1.5">
              <Label className="text-sm">Liability Waiver</Label>
              <Textarea
                className="min-h-[80px] text-xs font-mono resize-y"
                value={form.liability_waiver}
                onChange={(e) => setForm((f) => ({ ...f, liability_waiver: e.target.value }))}
              />
            </div>

            <div className="flex flex-col gap-1.5">
              <Label className="text-sm">Service Description</Label>
              <Textarea
                className="min-h-[60px] resize-y"
                placeholder="Describe what services are included (shown to customer)..."
                value={form.service_description}
                onChange={(e) => setForm((f) => ({ ...f, service_description: e.target.value }))}
              />
            </div>

            {/* Actions */}
            <div className="flex items-center justify-end gap-2 pt-2 border-t border-border">
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => setDialogOpen(false)}
                disabled={isPending}
              >
                Cancel
              </Button>
              <Button
                type="button"
                size="sm"
                onClick={handleSave}
                disabled={isPending}
              >
                {isPending ? "Saving..." : editingId ? "Save changes" : "Create template"}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  )
}
