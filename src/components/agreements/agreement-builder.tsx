"use client"

import { useState, useTransition } from "react"
import { useRouter } from "next/navigation"
import { toast } from "sonner"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { Badge } from "@/components/ui/badge"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { Checkbox } from "@/components/ui/checkbox"
import { PoolEntryForm } from "@/components/agreements/pool-entry-form"
import type { PoolEntryData, ChecklistTask } from "@/components/agreements/pool-entry-form"
import { createAgreement } from "@/actions/agreements"
import { toLocalDateString } from "@/lib/date-utils"
import type { AgreementTemplateInput } from "@/actions/agreements"

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface CustomerWithPools {
  id: string
  full_name: string
  pools: Array<{ id: string; name: string; type: string }>
}

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
}

interface AgreementBuilderProps {
  customers: CustomerWithPools[]
  checklistTasks: ChecklistTask[]
  templates: AgreementTemplate[]
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const TERM_TYPE_OPTIONS = [
  { value: "month_to_month", label: "Month to Month" },
  { value: "6_month", label: "6-Month Term" },
  { value: "12_month", label: "12-Month Term" },
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
// Helpers
// ---------------------------------------------------------------------------

function calcEndDate(startDate: string, termType: string): string | null {
  if (!startDate || termType === "month_to_month") return null
  const d = new Date(startDate + "T00:00:00")
  if (termType === "6_month") d.setMonth(d.getMonth() + 6)
  else if (termType === "12_month") d.setMonth(d.getMonth() + 12)
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`
}

function makeEmptyPoolEntry(poolId: string): PoolEntryData {
  return {
    pool_id: poolId,
    frequency: "weekly",
    custom_interval_days: null,
    preferred_day_of_week: null,
    pricing_model: "monthly_flat",
    monthly_amount: null,
    per_visit_amount: null,
    tiered_threshold_visits: null,
    tiered_base_amount: null,
    tiered_overage_amount: null,
    checklist_task_ids: [],
    notes: "",
  }
}

function calcMonthlyCost(entries: PoolEntryData[]): number {
  return entries.reduce((sum, e) => {
    if (e.pricing_model === "monthly_flat" && e.monthly_amount) {
      return sum + parseFloat(e.monthly_amount)
    }
    if (e.pricing_model === "per_visit" && e.per_visit_amount) {
      // Estimate: weekly = ~4.33 visits/month, biweekly = ~2.17, monthly = 1
      const visitsPerMonth =
        e.frequency === "weekly" ? 4.33
        : e.frequency === "biweekly" ? 2.17
        : e.frequency === "monthly" ? 1
        : 4 // custom — rough estimate
      return sum + parseFloat(e.per_visit_amount) * visitsPerMonth
    }
    if (e.pricing_model === "tiered" && e.tiered_base_amount && e.tiered_threshold_visits) {
      const base = parseFloat(e.tiered_base_amount) * e.tiered_threshold_visits
      return sum + base
    }
    return sum
  }, 0)
}

function validateEntry(entry: PoolEntryData): string | null {
  if (entry.pricing_model === "monthly_flat") {
    if (!entry.monthly_amount || parseFloat(entry.monthly_amount) <= 0) {
      return "Monthly amount is required"
    }
  } else if (entry.pricing_model === "per_visit") {
    if (!entry.per_visit_amount || parseFloat(entry.per_visit_amount) <= 0) {
      return "Per-visit amount is required"
    }
  } else if (entry.pricing_model === "tiered") {
    if (!entry.tiered_threshold_visits || entry.tiered_threshold_visits <= 0) {
      return "Visit threshold is required"
    }
    if (!entry.tiered_base_amount || parseFloat(entry.tiered_base_amount) <= 0) {
      return "Base rate is required"
    }
    if (!entry.tiered_overage_amount || parseFloat(entry.tiered_overage_amount) <= 0) {
      return "Overage rate is required"
    }
  }
  return null
}

// ---------------------------------------------------------------------------
// AgreementBuilder
// ---------------------------------------------------------------------------

export function AgreementBuilder({ customers, checklistTasks, templates }: AgreementBuilderProps) {
  const router = useRouter()
  const [isPending, startTransition] = useTransition()

  // ── Form state ─────────────────────────────────────────────────────────────

  // Template selection
  const [selectedTemplateId, setSelectedTemplateId] = useState<string>("none")

  // Customer selection
  const [customerId, setCustomerId] = useState<string>("")
  const [customerSearch, setCustomerSearch] = useState<string>("")
  const [showCustomerDropdown, setShowCustomerDropdown] = useState(false)

  // Pool selection
  const [selectedPoolIds, setSelectedPoolIds] = useState<string[]>([])
  const [poolEntries, setPoolEntries] = useState<PoolEntryData[]>([])

  // Agreement terms
  const [termType, setTermType] = useState<string>("month_to_month")
  const [startDate, setStartDate] = useState<string>(toLocalDateString(new Date()))
  const [autoRenew, setAutoRenew] = useState<boolean>(true)

  // Legal text
  const [termsAndConditions, setTermsAndConditions] = useState<string>(DEFAULT_TERMS_AND_CONDITIONS)
  const [cancellationPolicy, setCancellationPolicy] = useState<string>(DEFAULT_CANCELLATION_POLICY)
  const [liabilityWaiver, setLiabilityWaiver] = useState<string>(DEFAULT_LIABILITY_WAIVER)

  // Internal notes
  const [internalNotes, setInternalNotes] = useState<string>("")

  // Validation errors
  const [errors, setErrors] = useState<Record<string, string>>({})

  // ── Derived ─────────────────────────────────────────────────────────────────

  const selectedCustomer = customers.find((c) => c.id === customerId)
  const filteredCustomers = customers.filter((c) =>
    c.full_name.toLowerCase().includes(customerSearch.toLowerCase())
  )
  const endDate = calcEndDate(startDate, termType)
  const totalMonthly = calcMonthlyCost(poolEntries)
  const activeTemplates = templates.filter((t) => t.is_active)

  // ── Handlers ────────────────────────────────────────────────────────────────

  function applyTemplate(templateId: string) {
    setSelectedTemplateId(templateId)
    if (templateId === "none") return
    const tpl = templates.find((t) => t.id === templateId)
    if (!tpl) return
    if (tpl.default_term_type) setTermType(tpl.default_term_type)
    if (tpl.terms_and_conditions) setTermsAndConditions(tpl.terms_and_conditions)
    if (tpl.cancellation_policy) setCancellationPolicy(tpl.cancellation_policy)
    if (tpl.liability_waiver) setLiabilityWaiver(tpl.liability_waiver)
    // Apply template frequency/pricing to existing pool entries
    if (poolEntries.length > 0 && (tpl.default_frequency || tpl.default_pricing_model)) {
      setPoolEntries((prev) =>
        prev.map((entry) => ({
          ...entry,
          ...(tpl.default_frequency ? { frequency: tpl.default_frequency as PoolEntryData["frequency"] } : {}),
          ...(tpl.default_pricing_model ? { pricing_model: tpl.default_pricing_model as PoolEntryData["pricing_model"] } : {}),
          ...(tpl.default_pricing_model === "monthly_flat" && tpl.default_monthly_amount
            ? { monthly_amount: tpl.default_monthly_amount }
            : {}),
        }))
      )
    }
  }

  function selectCustomer(customer: CustomerWithPools) {
    setCustomerId(customer.id)
    setCustomerSearch(customer.full_name)
    setShowCustomerDropdown(false)
    setSelectedPoolIds([])
    setPoolEntries([])
    setErrors((prev) => ({ ...prev, customer: "", pools: "" }))
  }

  function togglePoolSelection(poolId: string) {
    const isSelected = selectedPoolIds.includes(poolId)
    if (isSelected) {
      setSelectedPoolIds((prev) => prev.filter((id) => id !== poolId))
      setPoolEntries((prev) => prev.filter((e) => e.pool_id !== poolId))
    } else {
      setSelectedPoolIds((prev) => [...prev, poolId])
      // Build default entry, applying template defaults if selected
      const tpl = selectedTemplateId !== "none" ? templates.find((t) => t.id === selectedTemplateId) : null
      const entry = makeEmptyPoolEntry(poolId)
      if (tpl) {
        if (tpl.default_frequency) entry.frequency = tpl.default_frequency as PoolEntryData["frequency"]
        if (tpl.default_pricing_model) entry.pricing_model = tpl.default_pricing_model as PoolEntryData["pricing_model"]
        if (tpl.default_monthly_amount) entry.monthly_amount = tpl.default_monthly_amount
      }
      setPoolEntries((prev) => [...prev, entry])
    }
  }

  function updatePoolEntry(poolId: string, data: PoolEntryData) {
    setPoolEntries((prev) => prev.map((e) => (e.pool_id === poolId ? data : e)))
    // Clear error for this pool if it exists
    setErrors((prev) => {
      const next = { ...prev }
      delete next[`pool_${poolId}`]
      return next
    })
  }

  function removePoolEntry(poolId: string) {
    setSelectedPoolIds((prev) => prev.filter((id) => id !== poolId))
    setPoolEntries((prev) => prev.filter((e) => e.pool_id !== poolId))
  }

  function validate(): boolean {
    const newErrors: Record<string, string> = {}

    if (!customerId) newErrors.customer = "Please select a customer"
    if (selectedPoolIds.length === 0) newErrors.pools = "Select at least one pool"
    if (!startDate) newErrors.startDate = "Start date is required"

    // Validate each pool entry
    for (const entry of poolEntries) {
      const entryError = validateEntry(entry)
      if (entryError) {
        newErrors[`pool_${entry.pool_id}`] = entryError
      }
    }

    setErrors(newErrors)
    return Object.keys(newErrors).length === 0
  }

  async function handleSubmit(saveAndSend: boolean) {
    if (!validate()) {
      toast.error("Please fix the errors before saving")
      return
    }

    startTransition(async () => {
      const result = await createAgreement({
        customer_id: customerId,
        term_type: termType,
        start_date: startDate || null,
        end_date: endDate || null,
        auto_renew: autoRenew,
        template_id: selectedTemplateId !== "none" ? selectedTemplateId : null,
        terms_and_conditions: termsAndConditions || null,
        cancellation_policy: cancellationPolicy || null,
        liability_waiver: liabilityWaiver || null,
        internal_notes: internalNotes || null,
        pool_entries: poolEntries,
      })

      if (!result.success) {
        toast.error(result.error ?? "Failed to create agreement")
        return
      }

      toast.success(`Agreement ${result.data?.agreement_number} created`)

      // Plan 03 will wire the send flow; for now just redirect to detail page
      if (saveAndSend) {
        router.push(`/agreements/${result.data?.id}`)
      } else {
        router.push(`/agreements/${result.data?.id}`)
      }
    })
  }

  // ── Render ──────────────────────────────────────────────────────────────────

  return (
    <div className="flex flex-col gap-6">

      {/* ── 1. Template selection ──────────────────────────────────────────── */}
      {activeTemplates.length > 0 && (
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base">Start from Template</CardTitle>
            <p className="text-sm text-muted-foreground">
              Pre-fill terms and pricing from a saved template, or build from scratch.
            </p>
          </CardHeader>
          <CardContent>
            <Select value={selectedTemplateId} onValueChange={applyTemplate}>
              <SelectTrigger className="w-full sm:w-72">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="none">Build from scratch</SelectItem>
                {activeTemplates.map((tpl) => (
                  <SelectItem key={tpl.id} value={tpl.id}>
                    {tpl.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </CardContent>
        </Card>
      )}

      {/* ── 2. Customer selection ──────────────────────────────────────────── */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base">Customer</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
          <div className="flex flex-col gap-1.5 relative">
            <Label>Customer name</Label>
            <Input
              placeholder="Search customers..."
              value={customerSearch}
              onChange={(e) => {
                setCustomerSearch(e.target.value)
                setShowCustomerDropdown(true)
                if (!e.target.value) {
                  setCustomerId("")
                  setSelectedPoolIds([])
                  setPoolEntries([])
                }
              }}
              onFocus={() => setShowCustomerDropdown(true)}
              onBlur={() => setTimeout(() => setShowCustomerDropdown(false), 150)}
              className={errors.customer ? "border-destructive" : ""}
            />
            {errors.customer && (
              <p className="text-xs text-destructive">{errors.customer}</p>
            )}

            {/* Dropdown */}
            {showCustomerDropdown && customerSearch && filteredCustomers.length > 0 && (
              <div className="absolute top-full left-0 right-0 z-20 mt-1 rounded-md border border-border bg-popover shadow-md max-h-48 overflow-y-auto">
                {filteredCustomers.map((c) => (
                  <button
                    key={c.id}
                    type="button"
                    className="w-full text-left px-3 py-2 text-sm hover:bg-muted transition-colors"
                    onMouseDown={() => selectCustomer(c)}
                  >
                    {c.full_name}
                    <span className="ml-2 text-xs text-muted-foreground">
                      {c.pools.length} pool{c.pools.length !== 1 ? "s" : ""}
                    </span>
                  </button>
                ))}
              </div>
            )}
          </div>

          {/* Pool selection */}
          {selectedCustomer && selectedCustomer.pools.length > 0 && (
            <div className="flex flex-col gap-2">
              <Label>Pools to include</Label>
              {errors.pools && (
                <p className="text-xs text-destructive">{errors.pools}</p>
              )}
              <div className="flex flex-col gap-1.5">
                {selectedCustomer.pools.map((pool) => (
                  <label key={pool.id} className="flex items-center gap-2.5 cursor-pointer py-1">
                    <Checkbox
                      checked={selectedPoolIds.includes(pool.id)}
                      onCheckedChange={() => togglePoolSelection(pool.id)}
                    />
                    <span className="text-sm">{pool.name}</span>
                    <Badge variant="outline" className="text-xs capitalize">{pool.type}</Badge>
                  </label>
                ))}
              </div>
            </div>
          )}

          {selectedCustomer && selectedCustomer.pools.length === 0 && (
            <p className="text-sm text-muted-foreground italic">
              This customer has no pools on record.
            </p>
          )}
        </CardContent>
      </Card>

      {/* ── 3. Pool configuration ─────────────────────────────────────────── */}
      {poolEntries.length > 0 && (
        <div className="flex flex-col gap-4">
          <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide">
            Pool Configuration
          </h2>
          {poolEntries.map((entry) => {
            const pool = selectedCustomer?.pools.find((p) => p.id === entry.pool_id)
            if (!pool) return null
            return (
              <PoolEntryForm
                key={entry.pool_id}
                pool={pool}
                checklistTasks={checklistTasks}
                value={entry}
                onChange={(data) => updatePoolEntry(entry.pool_id, data)}
                onRemove={() => removePoolEntry(entry.pool_id)}
                error={errors[`pool_${entry.pool_id}`]}
              />
            )
          })}
        </div>
      )}

      {/* ── 4. Agreement terms ────────────────────────────────────────────── */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base">Agreement Terms</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="flex flex-col gap-1.5">
              <Label>Term type</Label>
              <Select value={termType} onValueChange={setTermType}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {TERM_TYPE_OPTIONS.map((opt) => (
                    <SelectItem key={opt.value} value={opt.value}>
                      {opt.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="flex flex-col gap-1.5">
              <Label>Start date</Label>
              <Input
                type="date"
                value={startDate}
                onChange={(e) => setStartDate(e.target.value)}
                className={errors.startDate ? "border-destructive" : ""}
              />
              {errors.startDate && (
                <p className="text-xs text-destructive">{errors.startDate}</p>
              )}
            </div>
          </div>

          {termType !== "month_to_month" && endDate && (
            <p className="text-sm text-muted-foreground">
              Term ends: <span className="font-medium text-foreground">{endDate}</span>
            </p>
          )}

          <label className="flex items-center gap-2.5 cursor-pointer">
            <Checkbox checked={autoRenew} onCheckedChange={(v) => setAutoRenew(v === true)} />
            <div>
              <p className="text-sm font-medium">Auto-renew</p>
              <p className="text-xs text-muted-foreground">Automatically renew when term expires</p>
            </div>
          </label>
        </CardContent>
      </Card>

      {/* ── 5. Terms & Conditions ─────────────────────────────────────────── */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base">Legal Text</CardTitle>
          <p className="text-sm text-muted-foreground">
            Customize the legal language for this agreement. These will appear in the customer-facing document.
          </p>
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
          <div className="flex flex-col gap-1.5">
            <Label>Terms &amp; Conditions</Label>
            <Textarea
              className="min-h-[140px] text-xs font-mono resize-y"
              value={termsAndConditions}
              onChange={(e) => setTermsAndConditions(e.target.value)}
            />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label>Cancellation Policy</Label>
            <Textarea
              className="min-h-[100px] text-xs font-mono resize-y"
              value={cancellationPolicy}
              onChange={(e) => setCancellationPolicy(e.target.value)}
            />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label>Liability Waiver</Label>
            <Textarea
              className="min-h-[100px] text-xs font-mono resize-y"
              value={liabilityWaiver}
              onChange={(e) => setLiabilityWaiver(e.target.value)}
            />
          </div>
        </CardContent>
      </Card>

      {/* ── 6. Internal notes ─────────────────────────────────────────────── */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base">Internal Notes</CardTitle>
          <p className="text-sm text-muted-foreground">
            Office-only notes. Not visible to the customer.
          </p>
        </CardHeader>
        <CardContent>
          <Textarea
            className="min-h-[80px] resize-y"
            placeholder="Notes about this agreement, special terms discussed, etc."
            value={internalNotes}
            onChange={(e) => setInternalNotes(e.target.value)}
          />
        </CardContent>
      </Card>

      {/* ── 7. Summary ────────────────────────────────────────────────────── */}
      {poolEntries.length > 0 && (
        <Card className="border-primary/20 bg-primary/5">
          <CardHeader className="pb-2">
            <CardTitle className="text-base">Summary</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex flex-col gap-2 text-sm">
              <div className="flex justify-between">
                <span className="text-muted-foreground">Pools covered</span>
                <span className="font-medium">{poolEntries.length}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">Term</span>
                <span className="font-medium">
                  {TERM_TYPE_OPTIONS.find((o) => o.value === termType)?.label}
                </span>
              </div>
              {totalMonthly > 0 && (
                <div className="flex justify-between border-t border-border pt-2 mt-1">
                  <span className="text-muted-foreground">Est. monthly total</span>
                  <span className="font-semibold text-foreground">
                    ${totalMonthly.toFixed(2)}
                  </span>
                </div>
              )}
            </div>
          </CardContent>
        </Card>
      )}

      {/* ── 8. Actions ────────────────────────────────────────────────────── */}
      <div className="flex items-center justify-between gap-3 pb-6">
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={() => router.push("/agreements")}
          disabled={isPending}
        >
          Cancel
        </Button>
        <div className="flex items-center gap-2">
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => handleSubmit(false)}
            disabled={isPending}
          >
            {isPending ? "Saving..." : "Save as Draft"}
          </Button>
          <Button
            type="button"
            size="sm"
            onClick={() => handleSubmit(true)}
            disabled={isPending}
          >
            {isPending ? "Saving..." : "Save & Send"}
          </Button>
        </div>
      </div>
    </div>
  )
}
