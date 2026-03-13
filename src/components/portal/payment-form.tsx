"use client"

/**
 * PaymentForm — Stripe Elements payment form for portal invoice payment.
 *
 * Dark-first design to match portal theme. Uses PaymentElement which
 * automatically renders card and ACH payment options.
 *
 * Flow:
 * 1. Parent calls createPortalPaymentIntent and passes clientSecret here
 * 2. Customer fills in payment details via PaymentElement
 * 3. On submit: stripe.confirmPayment → redirect to ?payment=success
 */

import { useState, useCallback } from "react"
import { loadStripe, type Stripe as StripeType } from "@stripe/stripe-js"
import {
  Elements,
  PaymentElement,
  useStripe,
  useElements,
} from "@stripe/react-stripe-js"
import { Loader2, CheckCircle, AlertCircle } from "lucide-react"
import { Button } from "@/components/ui/button"

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
// Currency format
// ---------------------------------------------------------------------------

function fmt(amount: number): string {
  return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(amount)
}

// ---------------------------------------------------------------------------
// Props
// ---------------------------------------------------------------------------

export interface PaymentFormProps {
  invoiceId: string
  invoiceNumber: string | null
  clientSecret: string
  publishableKey: string
  stripeAccount: string
  amount: number
  surchargeAmount: number
  ccSurchargeEnabled: boolean
  onSuccess: () => void
}

// ---------------------------------------------------------------------------
// PaymentForm — outer Elements wrapper
// ---------------------------------------------------------------------------

export function PaymentForm(props: PaymentFormProps) {
  const stripePromise = getStripePromise(props.publishableKey, props.stripeAccount)

  return (
    <Elements
      stripe={stripePromise}
      options={{
        clientSecret: props.clientSecret,
        appearance: {
          theme: "stripe",
          variables: {
            colorPrimary: "#0ea5e9",
            borderRadius: "8px",
          },
        },
      }}
    >
      <PaymentFormInner {...props} />
    </Elements>
  )
}

// ---------------------------------------------------------------------------
// PaymentFormInner — uses Stripe hooks (must be inside <Elements>)
// ---------------------------------------------------------------------------

function PaymentFormInner({
  invoiceNumber,
  amount,
  surchargeAmount,
  ccSurchargeEnabled,
  onSuccess,
}: PaymentFormProps) {
  const stripe = useStripe()
  const elements = useElements()
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [selectedMethodType, setSelectedMethodType] = useState<"card" | "ach">("card")

  const isCard = selectedMethodType === "card"
  const effectiveSurcharge = ccSurchargeEnabled && isCard ? surchargeAmount : 0
  const displayAmount = amount + effectiveSurcharge - (ccSurchargeEnabled ? surchargeAmount : 0)
  // Note: the PaymentIntent was created with surcharge included for card.
  // We show the full amount (which already includes surcharge for card).
  const totalAmount = ccSurchargeEnabled && isCard ? amount : amount - surchargeAmount

  const handleSubmit = useCallback(
    async (e: React.FormEvent) => {
      e.preventDefault()
      if (!stripe || !elements) return

      setSubmitting(true)
      setError(null)

      const returnUrl = `${window.location.origin}/portal/invoices?payment=success`

      const { error: stripeError } = await stripe.confirmPayment({
        elements,
        confirmParams: { return_url: returnUrl },
        redirect: "if_required",
      })

      if (stripeError) {
        setError(stripeError.message ?? "Payment failed. Please try again.")
        setSubmitting(false)
        return
      }

      // Payment succeeded without redirect (card payments)
      setSubmitting(false)
      onSuccess()
    },
    [stripe, elements, onSuccess]
  )

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      {/* Invoice reference */}
      <div className="flex items-center justify-between text-sm border-b border-border/50 pb-3 mb-1">
        <span className="text-muted-foreground">
          {invoiceNumber ? `Invoice #${invoiceNumber}` : "Invoice"}
        </span>
        <span className="font-semibold tabular-nums">
          {fmt(ccSurchargeEnabled && isCard ? amount : amount - surchargeAmount)}
        </span>
      </div>

      {/* Stripe PaymentElement */}
      <PaymentElement
        options={{ layout: "tabs" }}
        onChange={(event) => {
          if (event.value?.type) {
            setSelectedMethodType(
              event.value.type === "us_bank_account" ? "ach" : "card"
            )
          }
        }}
      />

      {/* Surcharge disclosure (card only) */}
      {ccSurchargeEnabled && isCard && surchargeAmount > 0 && (
        <p className="text-xs text-amber-600 dark:text-amber-400 bg-amber-500/10 rounded-lg px-3 py-2">
          A credit card convenience fee of {fmt(surchargeAmount)} is included in the total.
          Switch to ACH bank transfer to avoid this fee.
        </p>
      )}

      {/* Error */}
      {error && (
        <div className="flex items-start gap-2 rounded-lg border border-destructive/30 bg-destructive/10 px-3 py-2.5 text-sm text-destructive">
          <AlertCircle className="h-4 w-4 shrink-0 mt-0.5" />
          <span>{error}</span>
        </div>
      )}

      {/* Submit */}
      <Button
        type="submit"
        disabled={!stripe || !elements || submitting}
        className="w-full"
        size="lg"
      >
        {submitting ? (
          <>
            <Loader2 className="h-4 w-4 animate-spin" />
            Processing...
          </>
        ) : (
          <>Pay {fmt(ccSurchargeEnabled && isCard ? amount : amount - surchargeAmount)}</>
        )}
      </Button>
    </form>
  )
}

// ---------------------------------------------------------------------------
// PaymentSuccess — inline success state shown after payment
// ---------------------------------------------------------------------------

export function PaymentSuccess({ invoiceNumber }: { invoiceNumber: string | null }) {
  return (
    <div className="flex flex-col items-center gap-3 py-6 text-center">
      <CheckCircle className="h-12 w-12 text-green-500" strokeWidth={1.5} />
      <div>
        <p className="font-semibold text-foreground">Payment successful!</p>
        <p className="text-sm text-muted-foreground mt-1">
          {invoiceNumber ? `Invoice #${invoiceNumber} is paid.` : "Your invoice has been paid."}
          {" "}You will receive a receipt by email.
        </p>
      </div>
    </div>
  )
}
