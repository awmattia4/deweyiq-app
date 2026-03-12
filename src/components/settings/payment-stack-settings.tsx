"use client"

import { useState, useTransition } from "react"
import { Label } from "@/components/ui/label"
import { Switch } from "@/components/ui/switch"
import { Input } from "@/components/ui/input"
import { Button } from "@/components/ui/button"
import { toast } from "sonner"
import { Loader2Icon } from "lucide-react"
import { updatePaymentProvider, updateSurchargeSettings } from "@/actions/stripe-connect"

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface PaymentStackSettingsProps {
  paymentProvider: string
  ccSurchargeEnabled: boolean
  ccSurchargePct: string | null
  stripeConnected: boolean
  qboConnected: boolean
}

const PROVIDER_OPTIONS = [
  { value: "none", label: "None (manual payments only)", requiresStripe: false, requiresQbo: false },
  { value: "stripe", label: "Stripe Connect", requiresStripe: true, requiresQbo: false },
  { value: "qbo", label: "QuickBooks Payments", requiresStripe: false, requiresQbo: true },
  { value: "both", label: "Both (Stripe + QBO)", requiresStripe: true, requiresQbo: true },
] as const

// Surcharge prohibited states
const SURCHARGE_DISCLAIMER =
  "Credit card surcharges are prohibited in Connecticut, Maine, Massachusetts, and California. It is your responsibility to ensure compliance with applicable state and local laws before enabling surcharges."

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function PaymentStackSettings({
  paymentProvider,
  ccSurchargeEnabled,
  ccSurchargePct,
  stripeConnected,
  qboConnected,
}: PaymentStackSettingsProps) {
  const [provider, setProvider] = useState(paymentProvider)
  const [isPendingProvider, startProviderTransition] = useTransition()

  // Surcharge state
  const [surchargeEnabled, setSurchargeEnabled] = useState(ccSurchargeEnabled)
  // Convert stored decimal back to percentage for display: "0.0299" -> "2.99"
  const initialPctDisplay = ccSurchargePct
    ? (parseFloat(ccSurchargePct) * 100).toFixed(2)
    : ""
  const [surchargePctInput, setSurchargePctInput] = useState(initialPctDisplay)
  const [isPendingSurcharge, startSurchargeTransition] = useTransition()

  // Determine if Stripe is active in current selection
  const stripeActive = provider === "stripe" || provider === "both"

  function handleProviderChange(newProvider: string) {
    setProvider(newProvider)
    startProviderTransition(async () => {
      const result = await updatePaymentProvider(newProvider)
      if (result.success) {
        toast.success("Payment provider updated")
      } else {
        toast.error(result.error || "Failed to update")
        setProvider(paymentProvider) // revert
      }
    })
  }

  function handleSurchargeToggle(enabled: boolean) {
    setSurchargeEnabled(enabled)
    if (!enabled) {
      // Disable and clear pct
      startSurchargeTransition(async () => {
        const result = await updateSurchargeSettings(false)
        if (result.success) {
          toast.success("Surcharge disabled")
        } else {
          toast.error(result.error || "Failed to update")
          setSurchargeEnabled(ccSurchargeEnabled) // revert
        }
      })
    }
  }

  function handleSaveSurcharge() {
    const pctStr = surchargePctInput.trim()
    if (!pctStr) {
      toast.error("Enter a surcharge percentage")
      return
    }
    const num = parseFloat(pctStr)
    if (isNaN(num) || num < 0) {
      toast.error("Surcharge must be a positive number")
      return
    }
    if (num > 3.0) {
      toast.error("Surcharge cannot exceed 3.00% (Visa network limit)")
      return
    }

    startSurchargeTransition(async () => {
      const result = await updateSurchargeSettings(true, pctStr)
      if (result.success) {
        toast.success("Surcharge settings saved")
      } else {
        toast.error(result.error || "Failed to save")
      }
    })
  }

  return (
    <div className="flex flex-col gap-6">
      {/* Payment Provider Selection */}
      <div className="flex flex-col gap-3">
        <Label className="text-sm font-medium">Payment Provider</Label>
        <div className="flex flex-col gap-2">
          {PROVIDER_OPTIONS.map((opt) => {
            const disabledStripe = opt.requiresStripe && !stripeConnected
            const disabledQbo = opt.requiresQbo && !qboConnected
            const isDisabled = disabledStripe || disabledQbo

            return (
              <label
                key={opt.value}
                className={`flex items-center gap-3 rounded-md border px-3 py-2.5 text-sm cursor-pointer transition-colors ${
                  provider === opt.value
                    ? "border-primary bg-primary/5"
                    : isDisabled
                      ? "border-border/40 opacity-50 cursor-not-allowed"
                      : "border-border hover:border-primary/50"
                }`}
              >
                <input
                  type="radio"
                  name="payment-provider"
                  value={opt.value}
                  checked={provider === opt.value}
                  disabled={isDisabled || isPendingProvider}
                  onChange={() => handleProviderChange(opt.value)}
                  className="accent-primary h-4 w-4 cursor-pointer"
                />
                <span className="flex-1">{opt.label}</span>
                {disabledStripe && (
                  <span className="text-xs text-muted-foreground">Stripe not connected</span>
                )}
                {disabledQbo && !disabledStripe && (
                  <span className="text-xs text-muted-foreground">QBO not connected</span>
                )}
              </label>
            )
          })}
        </div>
        {isPendingProvider && (
          <div className="flex items-center gap-2 text-xs text-muted-foreground">
            <Loader2Icon className="h-3 w-3 animate-spin" aria-hidden="true" />
            Saving...
          </div>
        )}
      </div>

      {/* Credit Card Surcharge — only visible when Stripe is active */}
      {stripeActive && (
        <div className="flex flex-col gap-3 border-t border-border/40 pt-4">
          <div className="flex items-center justify-between">
            <Label htmlFor="surcharge-toggle" className="text-sm font-medium">
              Credit Card Surcharge
            </Label>
            <Switch
              id="surcharge-toggle"
              checked={surchargeEnabled}
              onCheckedChange={handleSurchargeToggle}
              disabled={isPendingSurcharge}
              className="cursor-pointer"
            />
          </div>

          {surchargeEnabled && (
            <div className="flex flex-col gap-3">
              <div className="flex items-center gap-2">
                <Input
                  type="text"
                  inputMode="decimal"
                  placeholder="2.99"
                  value={surchargePctInput}
                  onChange={(e) => {
                    const val = e.target.value
                    // Allow digits, one decimal, and empty
                    if (/^(\d{0,2}\.?\d{0,2})?$/.test(val)) {
                      setSurchargePctInput(val)
                    }
                  }}
                  onBlur={() => {
                    // Flush on blur if value is a complete number
                    const val = surchargePctInput.trim()
                    if (val && !val.endsWith(".") && !val.endsWith("-")) {
                      // Let the user save manually via button
                    }
                  }}
                  className="w-24"
                />
                <span className="text-sm text-muted-foreground">%</span>
                <Button
                  onClick={handleSaveSurcharge}
                  disabled={isPendingSurcharge}
                  size="sm"
                  variant="outline"
                  className="cursor-pointer"
                >
                  {isPendingSurcharge ? (
                    <Loader2Icon className="h-3.5 w-3.5 animate-spin" aria-hidden="true" />
                  ) : (
                    "Save"
                  )}
                </Button>
              </div>
              <p className="text-xs text-muted-foreground leading-relaxed max-w-md">
                Maximum 3.00% (Visa network limit). Surcharge is added to the customer&apos;s
                total when paying by credit card.
              </p>
              <p className="text-xs text-yellow-500/80 leading-relaxed max-w-md">
                {SURCHARGE_DISCLAIMER}
              </p>
            </div>
          )}
        </div>
      )}
    </div>
  )
}
