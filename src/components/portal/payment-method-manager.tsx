"use client"

/**
 * PaymentMethodManager — saved payment methods + contact info editor.
 *
 * Three sections:
 * 1. Saved Payment Methods — list with brand/last4, default badge, "Set as default" button
 * 2. Add Payment Method — SetupIntent flow to save a new card/bank account
 * 3. Contact Info — phone and email editor
 *
 * Uses SetupIntent for saving methods without charging — proper for AutoPay enrollment.
 */

import { useState, useCallback, useEffect } from "react"
import { loadStripe, type Stripe as StripeType } from "@stripe/stripe-js"
import {
  Elements,
  PaymentElement,
  useStripe,
  useElements,
} from "@stripe/react-stripe-js"
import { Loader2, AlertCircle, CheckCircle, CreditCardIcon, BuildingIcon, PlusIcon } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Card } from "@/components/ui/card"
import {
  createPortalSetupIntent,
  confirmPaymentMethodUpdate,
  updateCustomerContactInfo,
  getCustomerPaymentMethods,
} from "@/actions/portal-data"
import type { PortalPaymentMethod } from "@/actions/portal-data"

// ---------------------------------------------------------------------------
// Stripe loader cache per connected account
// ---------------------------------------------------------------------------

const stripePromiseCache = new Map<string, Promise<StripeType | null>>()

function getStripePromise(publishableKey: string, stripeAccount: string) {
  const key = `${publishableKey}:${stripeAccount}`
  if (!stripePromiseCache.has(key)) {
    stripePromiseCache.set(key, loadStripe(publishableKey, { stripeAccount }))
  }
  return stripePromiseCache.get(key)!
}

// ---------------------------------------------------------------------------
// Props
// ---------------------------------------------------------------------------

interface PaymentMethodManagerProps {
  orgId: string
  customerId: string
  stripeAvailable: boolean
  stripeAccountId: string | null
  publishableKey: string | null
  savedMethods: PortalPaymentMethod[]
  currentPhone: string | null
  currentEmail: string | null
}

// ---------------------------------------------------------------------------
// PaymentMethodManager
// ---------------------------------------------------------------------------

export function PaymentMethodManager({
  orgId,
  customerId,
  stripeAvailable,
  stripeAccountId,
  publishableKey,
  savedMethods,
  currentPhone,
  currentEmail,
}: PaymentMethodManagerProps) {
  // Handle ?setup=success redirect from Stripe
  useEffect(() => {
    const params = new URLSearchParams(window.location.search)
    if (params.get("setup") === "success") {
      window.history.replaceState({}, "", "/portal/invoices")
    }
  }, [])

  return (
    <div className="space-y-6">
      {/* ── Saved payment methods ─────────────────────────────────────── */}
      {stripeAvailable && stripeAccountId && publishableKey && (
        <Card className="p-5">
          <h3 className="text-sm font-semibold mb-4">Saved Payment Methods</h3>
          <SavedMethodsList
            orgId={orgId}
            customerId={customerId}
            stripeAccountId={stripeAccountId}
            publishableKey={publishableKey}
            savedMethods={savedMethods}
          />
        </Card>
      )}

      {/* ── Contact info ─────────────────────────────────────────────── */}
      <Card className="p-5">
        <h3 className="text-sm font-semibold mb-4">Contact Information</h3>
        <ContactInfoEditor
          orgId={orgId}
          customerId={customerId}
          currentPhone={currentPhone}
          currentEmail={currentEmail}
        />
      </Card>
    </div>
  )
}

// ---------------------------------------------------------------------------
// SavedMethodsList
// ---------------------------------------------------------------------------

interface SavedMethodsListProps {
  orgId: string
  customerId: string
  stripeAccountId: string
  publishableKey: string
  savedMethods: PortalPaymentMethod[]
}

function SavedMethodsList({
  orgId,
  customerId,
  stripeAccountId,
  publishableKey,
  savedMethods,
}: SavedMethodsListProps) {
  const [methods, setMethods] = useState<PortalPaymentMethod[]>(savedMethods)
  const [showSetupForm, setShowSetupForm] = useState(false)
  const [loadingSI, setLoadingSI] = useState(false)
  const [siData, setSiData] = useState<{
    clientSecret: string
    publishableKey: string
    stripeAccount: string
  } | null>(null)
  const [siError, setSiError] = useState<string | null>(null)
  const [setupSuccess, setSetupSuccess] = useState(false)

  const handleAddMethod = useCallback(async () => {
    setLoadingSI(true)
    setSiError(null)
    setShowSetupForm(true)
    setSetupSuccess(false)

    try {
      const result = await createPortalSetupIntent(orgId, customerId)
      if ("error" in result) {
        setSiError(result.error)
        setLoadingSI(false)
        return
      }
      setSiData(result)
    } catch (err) {
      setSiError(err instanceof Error ? err.message : "Failed to initialize setup")
    } finally {
      setLoadingSI(false)
    }
  }, [orgId, customerId])

  const handleSetupSuccess = useCallback(
    async (paymentMethodId: string) => {
      // Save this as the default payment method
      await confirmPaymentMethodUpdate(orgId, customerId, paymentMethodId)
      // Fetch fresh list from Stripe so the newly saved method appears
      const fresh = await getCustomerPaymentMethods(orgId, customerId)
      setMethods(fresh)
      setSetupSuccess(true)
      setShowSetupForm(false)
      setSiData(null)
    },
    [orgId, customerId]
  )

  const stripePromise = getStripePromise(publishableKey, stripeAccountId)

  return (
    <div className="space-y-4">
      {/* Method list */}
      {methods.length === 0 && !setupSuccess ? (
        <p className="text-sm text-muted-foreground italic">No saved payment methods.</p>
      ) : (
        <div className="space-y-2">
          {methods.map((method) => (
            <PaymentMethodRow key={method.id} method={method} />
          ))}
        </div>
      )}

      {/* Setup success */}
      {setupSuccess && (
        <div className="flex items-center gap-2 text-sm text-green-500">
          <CheckCircle className="h-4 w-4 shrink-0" />
          <span>Payment method saved and set as default for AutoPay.</span>
        </div>
      )}

      {/* Add / Update button */}
      {!showSetupForm && (
        <Button
          variant="outline"
          size="sm"
          onClick={handleAddMethod}
          disabled={loadingSI}
          className="gap-1.5"
        >
          {loadingSI ? (
            <Loader2 className="h-3.5 w-3.5 animate-spin" />
          ) : (
            <PlusIcon className="h-3.5 w-3.5" />
          )}
          {methods.length === 0 ? "Add Payment Method" : "Update Payment Method"}
        </Button>
      )}

      {/* Setup form */}
      {showSetupForm && (
        <div className="border border-border rounded-lg p-4 space-y-4">
          <div className="flex items-center justify-between">
            <p className="text-sm font-medium">Add Payment Method</p>
            <button
              type="button"
              onClick={() => { setShowSetupForm(false); setSiData(null); setSiError(null) }}
              className="text-xs text-muted-foreground hover:text-foreground cursor-pointer"
            >
              Cancel
            </button>
          </div>

          {loadingSI && (
            <div className="flex items-center gap-2 text-sm text-muted-foreground justify-center py-3">
              <Loader2 className="h-4 w-4 animate-spin" />
              Preparing form...
            </div>
          )}

          {siError && (
            <div className="flex items-start gap-2 rounded-lg border border-destructive/30 bg-destructive/10 px-3 py-2.5 text-sm text-destructive">
              <AlertCircle className="h-4 w-4 shrink-0 mt-0.5" />
              <span>{siError}</span>
            </div>
          )}

          {siData && !loadingSI && (
            <Elements
              stripe={stripePromise}
              options={{
                clientSecret: siData.clientSecret,
                appearance: {
                  theme: "stripe",
                  variables: {
                    colorPrimary: "#0ea5e9",
                    borderRadius: "8px",
                  },
                },
              }}
            >
              <SetupForm onSuccess={handleSetupSuccess} />
            </Elements>
          )}
        </div>
      )}
    </div>
  )
}

// ---------------------------------------------------------------------------
// SetupForm — inner form that must live inside <Elements>
// ---------------------------------------------------------------------------

function SetupForm({ onSuccess }: { onSuccess: (paymentMethodId: string) => void }) {
  const stripe = useStripe()
  const elements = useElements()
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const handleSubmit = useCallback(
    async (e: React.FormEvent) => {
      e.preventDefault()
      if (!stripe || !elements) return

      setSubmitting(true)
      setError(null)

      const returnUrl = `${window.location.origin}/portal/invoices?setup=success`

      const { error: stripeError, setupIntent } = await stripe.confirmSetup({
        elements,
        confirmParams: { return_url: returnUrl },
        redirect: "if_required",
      })

      if (stripeError) {
        setError(stripeError.message ?? "Setup failed. Please try again.")
        setSubmitting(false)
        return
      }

      // Setup succeeded without redirect (card setups)
      if (setupIntent?.payment_method) {
        const pmId =
          typeof setupIntent.payment_method === "string"
            ? setupIntent.payment_method
            : setupIntent.payment_method.id

        setSubmitting(false)
        onSuccess(pmId)
      } else {
        setSubmitting(false)
        // For redirects, the return URL will handle success
        setError("Something went wrong. Please check back shortly.")
      }
    },
    [stripe, elements, onSuccess]
  )

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <PaymentElement options={{ layout: "tabs" }} />

      {error && (
        <div className="flex items-start gap-2 rounded-lg border border-destructive/30 bg-destructive/10 px-3 py-2.5 text-sm text-destructive">
          <AlertCircle className="h-4 w-4 shrink-0 mt-0.5" />
          <span>{error}</span>
        </div>
      )}

      <Button type="submit" disabled={!stripe || !elements || submitting} className="w-full">
        {submitting ? (
          <>
            <Loader2 className="h-4 w-4 animate-spin" />
            Saving...
          </>
        ) : (
          "Save Payment Method"
        )}
      </Button>

      <p className="text-xs text-muted-foreground text-center">
        This payment method will be saved for future AutoPay charges.
      </p>
    </form>
  )
}

// ---------------------------------------------------------------------------
// PaymentMethodRow — individual method display
// ---------------------------------------------------------------------------

function PaymentMethodRow({ method }: { method: PortalPaymentMethod }) {
  const isCard = method.type === "card"

  return (
    <div className="flex items-center gap-3 rounded-lg border border-border px-3 py-2.5">
      {isCard ? (
        <CreditCardIcon className="h-4 w-4 text-muted-foreground shrink-0" />
      ) : (
        <BuildingIcon className="h-4 w-4 text-muted-foreground shrink-0" />
      )}

      <div className="flex-1 min-w-0 text-sm">
        {isCard ? (
          <span className="text-foreground">
            {method.brand ? capitalize(method.brand) : "Card"} ···· {method.last4}
            {method.exp_month && method.exp_year && (
              <span className="text-muted-foreground ml-2 text-xs">
                {String(method.exp_month).padStart(2, "0")}/{String(method.exp_year).slice(-2)}
              </span>
            )}
          </span>
        ) : (
          <span className="text-foreground">
            {method.bank_name ?? "Bank"} ···· {method.last4}
          </span>
        )}
      </div>

      {method.isDefault && (
        <Badge
          variant="outline"
          className="text-[10px] h-4 px-1.5 border-primary/40 text-primary shrink-0"
        >
          Default
        </Badge>
      )}
    </div>
  )
}

function capitalize(str: string): string {
  return str.charAt(0).toUpperCase() + str.slice(1)
}

// ---------------------------------------------------------------------------
// ContactInfoEditor
// ---------------------------------------------------------------------------

interface ContactInfoEditorProps {
  orgId: string
  customerId: string
  currentPhone: string | null
  currentEmail: string | null
}

function ContactInfoEditor({
  orgId,
  customerId,
  currentPhone,
  currentEmail,
}: ContactInfoEditorProps) {
  const [phone, setPhone] = useState(currentPhone ?? "")
  const [email, setEmail] = useState(currentEmail ?? "")
  const [saving, setSaving] = useState(false)
  const [saveError, setSaveError] = useState<string | null>(null)
  const [saveSuccess, setSaveSuccess] = useState(false)

  const hasChanges = phone !== (currentPhone ?? "") || email !== (currentEmail ?? "")

  const handleSave = useCallback(
    async (e: React.FormEvent) => {
      e.preventDefault()
      setSaving(true)
      setSaveError(null)
      setSaveSuccess(false)

      const data: { phone?: string; email?: string } = {}
      if (phone !== (currentPhone ?? "")) data.phone = phone
      if (email !== (currentEmail ?? "")) data.email = email

      if (Object.keys(data).length === 0) {
        setSaving(false)
        return
      }

      try {
        const result = await updateCustomerContactInfo(orgId, customerId, data)
        if (!result.success) {
          setSaveError(result.error ?? "Failed to save changes")
        } else {
          setSaveSuccess(true)
        }
      } catch (err) {
        setSaveError(err instanceof Error ? err.message : "Failed to save changes")
      } finally {
        setSaving(false)
      }
    },
    [orgId, customerId, phone, email, currentPhone, currentEmail]
  )

  return (
    <form onSubmit={handleSave} className="space-y-4">
      {/* Phone */}
      <div className="space-y-1.5">
        <label htmlFor="contact-phone" className="text-xs font-medium text-muted-foreground">
          Phone
        </label>
        <input
          id="contact-phone"
          type="tel"
          value={phone}
          onChange={(e) => { setPhone(e.target.value); setSaveSuccess(false) }}
          placeholder="(555) 123-4567"
          className="w-full rounded-lg border border-input bg-background px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-1 focus:ring-offset-background"
        />
      </div>

      {/* Email */}
      <div className="space-y-1.5">
        <label htmlFor="contact-email" className="text-xs font-medium text-muted-foreground">
          Email
        </label>
        <input
          id="contact-email"
          type="email"
          value={email}
          onChange={(e) => { setEmail(e.target.value); setSaveSuccess(false) }}
          placeholder="you@example.com"
          className="w-full rounded-lg border border-input bg-background px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-1 focus:ring-offset-background"
        />
      </div>

      {/* Error */}
      {saveError && (
        <div className="flex items-start gap-2 rounded-lg border border-destructive/30 bg-destructive/10 px-3 py-2.5 text-sm text-destructive">
          <AlertCircle className="h-4 w-4 shrink-0 mt-0.5" />
          <span>{saveError}</span>
        </div>
      )}

      {/* Success */}
      {saveSuccess && (
        <div className="flex items-center gap-2 text-sm text-green-500">
          <CheckCircle className="h-4 w-4 shrink-0" />
          <span>Contact info updated.</span>
        </div>
      )}

      {/* Save button */}
      <Button
        type="submit"
        size="sm"
        variant="outline"
        disabled={!hasChanges || saving}
      >
        {saving ? (
          <>
            <Loader2 className="h-3.5 w-3.5 animate-spin" />
            Saving...
          </>
        ) : (
          "Save Changes"
        )}
      </Button>

      <p className="text-xs text-muted-foreground">
        Only you can update your contact info. Name and address changes must be requested from your service provider.
      </p>
    </form>
  )
}
