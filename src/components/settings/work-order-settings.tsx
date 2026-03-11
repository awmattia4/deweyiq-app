"use client"

import { useState, useTransition } from "react"
import { toast } from "sonner"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Switch } from "@/components/ui/switch"
import { updateOrgSettings } from "@/actions/company-settings"
import type { OrgSettings } from "@/actions/company-settings"

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface WorkOrderSettingsProps {
  settings: OrgSettings
}

// ---------------------------------------------------------------------------
// WorkOrderSettings
// ---------------------------------------------------------------------------

/**
 * Phase 6 org settings — rates, markup, tax, quote settings, invoice/quote prefixes,
 * terms & conditions, and WO notification toggles.
 *
 * All decimal inputs use local string state to avoid parseFloat("7.") pitfall per MEMORY.md.
 */
export function WorkOrderSettings({ settings }: WorkOrderSettingsProps) {
  // ── Numeric fields (string state per MEMORY.md controlled input pattern) ──
  const [hourlyRate, setHourlyRate] = useState<string>(
    (settings.default_hourly_rate as string | null | undefined) ?? ""
  )
  const [markupPct, setMarkupPct] = useState<string>(
    (settings.default_parts_markup_pct as string | null | undefined) ?? "30"
  )
  const [taxRate, setTaxRate] = useState<string>(
    settings.default_tax_rate
      ? (parseFloat(settings.default_tax_rate as string) * 100).toFixed(4).replace(/\.?0+$/, "")
      : "8.75"
  )
  const [quoteExpiryDays, setQuoteExpiryDays] = useState<string>(
    String(settings.default_quote_expiry_days ?? 30)
  )

  // ── Text fields ──────────────────────────────────────────────────────────
  const [invoicePrefix, setInvoicePrefix] = useState<string>(
    (settings.invoice_number_prefix as string | null | undefined) ?? "INV"
  )
  const [quotePrefix, setQuotePrefix] = useState<string>(
    (settings.quote_number_prefix as string | null | undefined) ?? "Q"
  )
  const [quoteTerms, setQuoteTerms] = useState<string>(
    (settings.quote_terms_and_conditions as string | null | undefined) ?? ""
  )

  // ── Toggle values ────────────────────────────────────────────────────────
  const [toggleValues, setToggleValues] = useState({
    wo_notify_office_on_flag: settings.wo_notify_office_on_flag ?? true,
    wo_notify_customer_on_scheduled: settings.wo_notify_customer_on_scheduled ?? true,
    wo_notify_customer_on_complete: settings.wo_notify_customer_on_complete ?? true,
  })

  const [isSavingRates, startRatesTransition] = useTransition()
  const [isSavingQuote, startQuoteTransition] = useTransition()
  const [isSavingTerms, startTermsTransition] = useTransition()
  const [isSavingToggles, startTogglesTransition] = useTransition()

  // ── Save rates (hourly rate, markup %, tax rate) ──────────────────────
  function handleSaveRates() {
    startRatesTransition(async () => {
      // Convert tax rate from display percentage to decimal for storage
      const taxRateDecimal = taxRate.trim()
        ? (parseFloat(taxRate) / 100).toFixed(6)
        : undefined

      const result = await updateOrgSettings({
        default_hourly_rate: hourlyRate.trim() || null,
        default_parts_markup_pct: markupPct.trim() || null,
        default_tax_rate: taxRateDecimal ?? null,
      })

      if (!result.success) {
        toast.error("Failed to save rates", { description: result.error })
      } else {
        toast.success("Rates saved")
      }
    })
  }

  // ── Save quote settings ───────────────────────────────────────────────
  function handleSaveQuoteSettings() {
    startQuoteTransition(async () => {
      const result = await updateOrgSettings({
        default_quote_expiry_days: parseInt(quoteExpiryDays) || 30,
        invoice_number_prefix: invoicePrefix.trim() || "INV",
        quote_number_prefix: quotePrefix.trim() || "Q",
      })

      if (!result.success) {
        toast.error("Failed to save quote settings", { description: result.error })
      } else {
        toast.success("Quote settings saved")
      }
    })
  }

  // ── Save terms ────────────────────────────────────────────────────────
  function handleSaveTerms() {
    startTermsTransition(async () => {
      const result = await updateOrgSettings({
        quote_terms_and_conditions: quoteTerms.trim() || null,
      })

      if (!result.success) {
        toast.error("Failed to save terms", { description: result.error })
      } else {
        toast.success("Terms saved")
      }
    })
  }

  // ── Toggle handler ────────────────────────────────────────────────────
  function handleToggle(key: keyof typeof toggleValues, checked: boolean) {
    setToggleValues((prev) => ({ ...prev, [key]: checked }))

    startTogglesTransition(async () => {
      const result = await updateOrgSettings({ [key]: checked } as Partial<OrgSettings>)
      if (!result.success) {
        setToggleValues((prev) => ({ ...prev, [key]: !checked }))
        toast.error("Failed to save notification setting", { description: result.error })
      } else {
        toast.success("Notification setting updated")
      }
    })
  }

  return (
    <div className="flex flex-col gap-6">
      {/* ── Rates ─────────────────────────────────────────────────────── */}
      <div className="flex flex-col gap-3">
        <div>
          <h3 className="text-sm font-semibold text-foreground">Default Rates</h3>
          <p className="text-xs text-muted-foreground mt-0.5">
            Used as defaults when adding labor and parts to work orders.
          </p>
        </div>

        <div className="grid grid-cols-3 gap-3">
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="ws-hourly-rate" className="text-xs text-muted-foreground">
              Hourly Labor Rate ($)
            </Label>
            <Input
              id="ws-hourly-rate"
              className="h-8 text-sm"
              inputMode="decimal"
              placeholder="0.00"
              value={hourlyRate}
              onChange={(e) => setHourlyRate(e.target.value)}
              onBlur={() => {
                const n = parseFloat(hourlyRate)
                if (!isNaN(n)) setHourlyRate(n.toFixed(2))
                else if (hourlyRate !== "") setHourlyRate("")
              }}
            />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="ws-markup" className="text-xs text-muted-foreground">
              Parts Markup (%)
            </Label>
            <Input
              id="ws-markup"
              className="h-8 text-sm"
              inputMode="decimal"
              placeholder="30"
              value={markupPct}
              onChange={(e) => setMarkupPct(e.target.value)}
              onBlur={() => {
                const n = parseFloat(markupPct)
                if (!isNaN(n)) setMarkupPct(String(n))
                else if (markupPct !== "") setMarkupPct("")
              }}
            />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="ws-tax-rate" className="text-xs text-muted-foreground">
              Tax Rate (%)
            </Label>
            <Input
              id="ws-tax-rate"
              className="h-8 text-sm"
              inputMode="decimal"
              placeholder="8.75"
              value={taxRate}
              onChange={(e) => setTaxRate(e.target.value)}
              onBlur={() => {
                const n = parseFloat(taxRate)
                if (!isNaN(n)) setTaxRate(String(n))
                else if (taxRate !== "") setTaxRate("")
              }}
            />
          </div>
        </div>

        <div className="flex justify-end">
          <Button
            type="button"
            size="sm"
            onClick={handleSaveRates}
            disabled={isSavingRates}
            className="cursor-pointer"
          >
            {isSavingRates ? "Saving…" : "Save Rates"}
          </Button>
        </div>
      </div>

      {/* ── Quote & Invoice Settings ───────────────────────────────────── */}
      <div className="flex flex-col gap-3">
        <div>
          <h3 className="text-sm font-semibold text-foreground">Quote &amp; Invoice Settings</h3>
          <p className="text-xs text-muted-foreground mt-0.5">
            Prefixes appear before the auto-incremented number (e.g. &quot;Q-0001&quot;).
          </p>
        </div>

        <div className="grid grid-cols-3 gap-3">
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="ws-expiry" className="text-xs text-muted-foreground">
              Quote Expiry (days)
            </Label>
            <Input
              id="ws-expiry"
              className="h-8 text-sm"
              inputMode="numeric"
              placeholder="30"
              value={quoteExpiryDays}
              onChange={(e) => setQuoteExpiryDays(e.target.value)}
              onBlur={() => {
                const n = parseInt(quoteExpiryDays)
                if (!isNaN(n) && n > 0) setQuoteExpiryDays(String(n))
                else setQuoteExpiryDays("30")
              }}
            />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="ws-invoice-prefix" className="text-xs text-muted-foreground">
              Invoice Prefix
            </Label>
            <Input
              id="ws-invoice-prefix"
              className="h-8 text-sm"
              placeholder="INV"
              maxLength={10}
              value={invoicePrefix}
              onChange={(e) => setInvoicePrefix(e.target.value.toUpperCase())}
            />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="ws-quote-prefix" className="text-xs text-muted-foreground">
              Quote Prefix
            </Label>
            <Input
              id="ws-quote-prefix"
              className="h-8 text-sm"
              placeholder="Q"
              maxLength={10}
              value={quotePrefix}
              onChange={(e) => setQuotePrefix(e.target.value.toUpperCase())}
            />
          </div>
        </div>

        <div className="flex justify-end">
          <Button
            type="button"
            size="sm"
            onClick={handleSaveQuoteSettings}
            disabled={isSavingQuote}
            className="cursor-pointer"
          >
            {isSavingQuote ? "Saving…" : "Save Quote Settings"}
          </Button>
        </div>
      </div>

      {/* ── Terms & Conditions ────────────────────────────────────────── */}
      <div className="flex flex-col gap-3">
        <div>
          <h3 className="text-sm font-semibold text-foreground">Quote Terms &amp; Conditions</h3>
          <p className="text-xs text-muted-foreground mt-0.5">
            Appears at the bottom of every quote sent to customers.
          </p>
        </div>

        <textarea
          className="w-full min-h-[100px] rounded-xl border border-border/60 bg-background px-3 py-2 text-sm placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-ring resize-y"
          placeholder="e.g. Payment is due upon completion. Labor warranty: 90 days. Parts warranty: per manufacturer."
          value={quoteTerms}
          onChange={(e) => setQuoteTerms(e.target.value)}
        />

        <div className="flex justify-end">
          <Button
            type="button"
            size="sm"
            onClick={handleSaveTerms}
            disabled={isSavingTerms}
            className="cursor-pointer"
          >
            {isSavingTerms ? "Saving…" : "Save Terms"}
          </Button>
        </div>
      </div>

      {/* ── WO Notification Toggles ───────────────────────────────────── */}
      <div className="flex flex-col gap-2">
        <div>
          <h3 className="text-sm font-semibold text-foreground">Work Order Notifications</h3>
          <p className="text-xs text-muted-foreground mt-0.5">
            Control automatic notifications triggered by work order status changes.
          </p>
        </div>

        <div className="rounded-xl border border-border/60 bg-muted/5 divide-y divide-border/40 px-4">
          {[
            {
              key: "wo_notify_office_on_flag" as const,
              label: "Notify office when tech flags an issue",
              description: "Send an office alert when a tech flags a work order from a service stop",
            },
            {
              key: "wo_notify_customer_on_scheduled" as const,
              label: "Notify customer when WO is scheduled",
              description: "Send the customer a notification when their work order is scheduled",
            },
            {
              key: "wo_notify_customer_on_complete" as const,
              label: "Notify customer when WO is complete",
              description: "Send the customer a notification when their work order is marked complete",
            },
          ].map((item) => (
            <div key={item.key} className="flex items-start justify-between gap-4 py-3">
              <div className="flex flex-col gap-0.5 min-w-0">
                <Label
                  htmlFor={item.key}
                  className="text-sm font-medium leading-tight cursor-pointer"
                >
                  {item.label}
                </Label>
                <p className="text-xs text-muted-foreground leading-relaxed">
                  {item.description}
                </p>
              </div>
              <Switch
                id={item.key}
                checked={toggleValues[item.key]}
                onCheckedChange={(checked) => handleToggle(item.key, checked)}
                disabled={isSavingToggles}
                className="shrink-0 mt-0.5 cursor-pointer"
              />
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}
