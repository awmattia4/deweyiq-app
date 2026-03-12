"use client"

/**
 * PayClient -- Stripe Elements payment form for the public payment page.
 *
 * Light theme, customer-facing. Matches the quote approval page style.
 * Loads Stripe with the connected account ID.
 * Shows invoice summary, surcharge disclosure, and PaymentElement.
 */

import { useState, useEffect, useCallback } from "react"
import { loadStripe, type Stripe as StripeType } from "@stripe/stripe-js"
import {
  Elements,
  PaymentElement,
  useStripe,
  useElements,
} from "@stripe/react-stripe-js"
import { Loader2, CheckCircle, CreditCard, Building2, ShieldCheck } from "lucide-react"
import { enableAutoPay } from "@/actions/payments"

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface PayClientProps {
  token: string
  invoiceNumber: string | null
  billingPeriodStart: string | null
  billingPeriodEnd: string | null
  customerName: string
  customerId: string
  subtotal: number
  taxAmount: number
  total: number
  lineItemsSummary: { description: string; amount: number }[]
  companyName: string
  brandColor: string | null
  connectedAccountId: string
  ccSurchargeEnabled: boolean
  ccSurchargePct: number
  notes: string | null
}

// ---------------------------------------------------------------------------
// Stripe loader cache per connected account
// ---------------------------------------------------------------------------

const stripePromiseCache = new Map<string, Promise<StripeType | null>>()

function getStripePromise(connectedAccountId: string) {
  const key = connectedAccountId
  if (!stripePromiseCache.has(key)) {
    const publishableKey = process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY
    if (!publishableKey) {
      console.error("NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY is not set")
      return null
    }
    stripePromiseCache.set(
      key,
      loadStripe(publishableKey, { stripeAccount: connectedAccountId })
    )
  }
  return stripePromiseCache.get(key)!
}

// ---------------------------------------------------------------------------
// Currency format
// ---------------------------------------------------------------------------

function fmt(amount: number): string {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
  }).format(amount)
}

// ---------------------------------------------------------------------------
// PayClient -- outer wrapper
// ---------------------------------------------------------------------------

export function PayClient(props: PayClientProps) {
  const [clientSecret, setClientSecret] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [autoPayChecked, setAutoPayChecked] = useState(false)

  // Fetch PaymentIntent on mount
  useEffect(() => {
    let cancelled = false

    async function createIntent() {
      try {
        setLoading(true)
        const res = await fetch(`/api/pay/${props.token}/intent`, {
          method: "POST",
        })

        if (!res.ok) {
          const data = await res.json().catch(() => ({}))
          throw new Error((data as { error?: string }).error ?? `Request failed: ${res.status}`)
        }

        const data = await res.json()
        if (!cancelled) {
          setClientSecret(data.clientSecret)
        }
      } catch (err) {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : "Failed to initialize payment")
        }
      } finally {
        if (!cancelled) {
          setLoading(false)
        }
      }
    }

    createIntent()
    return () => {
      cancelled = true
    }
  }, [props.token])

  const stripePromise = getStripePromise(props.connectedAccountId)

  if (loading) {
    return (
      <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-8 flex items-center justify-center gap-3 text-gray-500">
        <Loader2 className="w-5 h-5 animate-spin" />
        <span className="text-sm">Preparing payment form...</span>
      </div>
    )
  }

  if (error) {
    return (
      <div className="bg-white rounded-xl border border-red-200 shadow-sm p-8 text-center">
        <p className="text-red-600 font-medium mb-1">Payment Error</p>
        <p className="text-sm text-gray-600">{error}</p>
      </div>
    )
  }

  if (!clientSecret || !stripePromise) {
    return (
      <div className="bg-white rounded-xl border border-red-200 shadow-sm p-8 text-center">
        <p className="text-red-600 font-medium mb-1">Configuration Error</p>
        <p className="text-sm text-gray-600">
          Unable to initialize payment. Please contact the service provider.
        </p>
      </div>
    )
  }

  const brandColor = props.brandColor || "#3b82f6"

  return (
    <Elements
      stripe={stripePromise}
      options={{
        clientSecret,
        appearance: {
          theme: "stripe",
          variables: {
            colorPrimary: brandColor,
          },
        },
      }}
    >
      <PaymentForm
        {...props}
        autoPayChecked={autoPayChecked}
        onAutoPayChange={setAutoPayChecked}
      />
    </Elements>
  )
}

// ---------------------------------------------------------------------------
// PaymentForm -- inner form with Stripe hooks
// ---------------------------------------------------------------------------

function PaymentForm(
  props: PayClientProps & {
    autoPayChecked: boolean
    onAutoPayChange: (checked: boolean) => void
  }
) {
  const stripe = useStripe()
  const elements = useElements()
  const [submitting, setSubmitting] = useState(false)
  const [payError, setPayError] = useState<string | null>(null)
  const [paymentStatus, setPaymentStatus] = useState<
    "idle" | "processing" | "succeeded" | "autopay-enabled"
  >("idle")
  const [autoPaySaved, setAutoPaySaved] = useState(false)
  // Track selected payment method type to toggle surcharge display
  const [selectedMethodType, setSelectedMethodType] = useState<string>("card")

  // Check for return status from redirect (ACH processing)
  useEffect(() => {
    const url = new URL(window.location.href)
    const status = url.searchParams.get("status")
    if (status === "processing") {
      setPaymentStatus("processing")
    }

    // Also check if Stripe redirected back with payment_intent_client_secret
    const piClientSecret = url.searchParams.get("payment_intent_client_secret")
    if (piClientSecret && stripe) {
      stripe.retrievePaymentIntent(piClientSecret).then(async ({ paymentIntent }) => {
        if (paymentIntent?.status === "succeeded") {
          setPaymentStatus("succeeded")
          // If AutoPay was opted-in, save the payment method
          if (url.searchParams.get("autopay") === "true" && paymentIntent.payment_method) {
            const pmId = typeof paymentIntent.payment_method === "string"
              ? paymentIntent.payment_method
              : paymentIntent.payment_method.id
            await enableAutoPay(props.token, props.customerId, pmId)
            setAutoPaySaved(true)
          }
        } else if (paymentIntent?.status === "processing") {
          setPaymentStatus("processing")
        }
      })
    }
  }, [stripe, props.customerId, props.token])

  const handleSubmit = useCallback(
    async (e: React.FormEvent) => {
      e.preventDefault()

      if (!stripe || !elements) return

      setSubmitting(true)
      setPayError(null)

      const returnUrl = new URL(`${window.location.origin}/pay/${props.token}`)
      returnUrl.searchParams.set("status", "processing")
      if (props.autoPayChecked) {
        returnUrl.searchParams.set("autopay", "true")
      }

      const { error, paymentIntent } = await stripe.confirmPayment({
        elements,
        confirmParams: {
          return_url: returnUrl.toString(),
        },
        redirect: "if_required",
      })

      if (error) {
        // Error is shown inline when redirect doesn't happen (e.g. card errors)
        setPayError(error.message ?? "Payment failed. Please try again.")
        setSubmitting(false)
        return
      }

      // For card payments that don't require redirect
      if (paymentIntent?.status === "succeeded") {
        // If AutoPay was opted-in, save the payment method
        if (props.autoPayChecked && paymentIntent.payment_method) {
          const pmId = typeof paymentIntent.payment_method === "string"
            ? paymentIntent.payment_method
            : paymentIntent.payment_method.id
          try {
            await enableAutoPay(props.token, props.customerId, pmId)
            setAutoPaySaved(true)
          } catch (err) {
            console.error("Failed to enable AutoPay:", err)
          }
        }
        setPaymentStatus("succeeded")
      } else if (paymentIntent?.status === "processing") {
        setPaymentStatus("processing")
      }
    },
    [stripe, elements, props.token, props.autoPayChecked, props.customerId]
  )

  // ── Success state ──────────────────────────────────────────────────────
  if (paymentStatus === "succeeded") {
    return (
      <div className="bg-white rounded-xl border border-green-200 shadow-sm p-8 text-center">
        <div className="flex justify-center mb-4">
          <CheckCircle className="w-14 h-14 text-green-600" strokeWidth={1.5} />
        </div>
        <h2 className="text-xl font-semibold text-gray-900 mb-2">Payment successful!</h2>
        <p className="text-gray-600 max-w-md mx-auto">
          Thank you for your payment. You will receive a receipt via email.
        </p>
        {autoPaySaved && (
          <div className="mt-4 flex items-center justify-center gap-2 text-sm text-green-700 bg-green-50 border border-green-200 rounded-lg px-4 py-3 max-w-md mx-auto">
            <ShieldCheck className="w-4 h-4 flex-shrink-0" />
            <span>AutoPay enabled. Future invoices will be charged automatically.</span>
          </div>
        )}
      </div>
    )
  }

  // ── Processing state (ACH) ─────────────────────────────────────────────
  if (paymentStatus === "processing") {
    return (
      <div className="bg-white rounded-xl border border-blue-200 shadow-sm p-8 text-center">
        <div className="flex justify-center mb-4">
          <Building2 className="w-14 h-14 text-blue-600" strokeWidth={1.5} />
        </div>
        <h2 className="text-xl font-semibold text-gray-900 mb-2">Payment processing</h2>
        <p className="text-gray-600 max-w-md mx-auto">
          Your bank transfer is being processed. This typically takes 2-3 business days.
          You will receive a confirmation email once the payment settles.
        </p>
      </div>
    )
  }

  // ── Surcharge calculation (card only — no surcharge for ACH) ──────────
  const isCardSelected = selectedMethodType === "card"
  const surchargeAmount = props.ccSurchargeEnabled && isCardSelected
    ? props.total * props.ccSurchargePct
    : 0
  const totalWithSurcharge = props.total + surchargeAmount
  const showSurcharge = props.ccSurchargeEnabled && isCardSelected && surchargeAmount > 0

  return (
    <div className="space-y-6">
      {/* Invoice summary card */}
      <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
        <div className="px-6 py-5 border-b border-gray-100">
          <h1 className="text-xl font-bold text-gray-900">
            Invoice {props.invoiceNumber ? `#${props.invoiceNumber}` : ""}
          </h1>
          <p className="mt-1 text-sm text-gray-500">
            Bill to:{" "}
            <span className="font-medium text-gray-700">{props.customerName}</span>
          </p>
          {props.billingPeriodStart && props.billingPeriodEnd && (
            <p className="mt-0.5 text-sm text-gray-500">
              Period:{" "}
              <span className="font-medium text-gray-700">
                {new Date(props.billingPeriodStart + "T00:00:00").toLocaleDateString("en-US", {
                  month: "short",
                  day: "numeric",
                })}{" "}
                &ndash;{" "}
                {new Date(props.billingPeriodEnd + "T00:00:00").toLocaleDateString("en-US", {
                  month: "short",
                  day: "numeric",
                  year: "numeric",
                })}
              </span>
            </p>
          )}
        </div>

        {/* Line items */}
        {props.lineItemsSummary.length > 0 && (
          <div className="px-6 py-4 border-b border-gray-100">
            <h2 className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-3">
              Items
            </h2>
            <div className="divide-y divide-gray-100">
              {props.lineItemsSummary.map((item, i) => (
                <div key={i} className="py-2.5 flex items-center justify-between">
                  <span className="text-sm text-gray-800">{item.description}</span>
                  <span className="text-sm font-medium text-gray-900 tabular-nums">
                    {fmt(item.amount)}
                  </span>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Totals */}
        <div className="px-6 py-4 bg-gray-50">
          <div className="space-y-2 max-w-xs ml-auto">
            <div className="flex justify-between text-sm text-gray-600">
              <span>Subtotal</span>
              <span className="tabular-nums">{fmt(props.subtotal)}</span>
            </div>
            {props.taxAmount > 0 && (
              <div className="flex justify-between text-sm text-gray-600">
                <span>Tax</span>
                <span className="tabular-nums">{fmt(props.taxAmount)}</span>
              </div>
            )}

            {/* Surcharge line (card only) */}
            {showSurcharge && (
              <div className="flex justify-between text-sm text-amber-700">
                <span>
                  Credit Card Fee ({(props.ccSurchargePct * 100).toFixed(2)}%)
                </span>
                <span className="tabular-nums">{fmt(surchargeAmount)}</span>
              </div>
            )}

            <div className="flex justify-between text-base font-bold text-gray-900 pt-2 border-t border-gray-200">
              <span>Total</span>
              <span className="tabular-nums">
                {showSurcharge
                  ? fmt(totalWithSurcharge)
                  : fmt(props.total)}
              </span>
            </div>
          </div>
        </div>

        {/* Surcharge disclosure */}
        {props.ccSurchargeEnabled && (
          <div className="px-6 py-3 bg-amber-50 border-t border-amber-100">
            <p className="text-xs text-amber-800">
              A convenience fee of {(props.ccSurchargePct * 100).toFixed(2)}% is
              applied to credit card payments. This fee is not applied to ACH bank
              transfers.
            </p>
          </div>
        )}

        {/* Notes */}
        {props.notes && (
          <div className="px-6 py-3 border-t border-gray-100">
            <p className="text-xs text-gray-500">{props.notes}</p>
          </div>
        )}
      </div>

      {/* Payment form */}
      <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
        <div className="px-6 py-4 border-b border-gray-100">
          <h2 className="text-base font-semibold text-gray-900 flex items-center gap-2">
            <CreditCard className="w-5 h-5 text-gray-400" />
            Payment Details
          </h2>
          <p className="text-sm text-gray-500 mt-0.5">
            Pay with credit card or bank transfer
          </p>
        </div>

        <form onSubmit={handleSubmit} className="p-6 space-y-5">
          <PaymentElement
            options={{
              layout: "tabs",
            }}
            onChange={(event) => {
              // Track which payment method type is selected (card vs us_bank_account)
              if (event.value?.type) {
                setSelectedMethodType(event.value.type === "us_bank_account" ? "ach" : "card")
              }
            }}
          />

          {/* AutoPay opt-in */}
          <label className="flex items-start gap-3 cursor-pointer rounded-lg border border-gray-200 p-4 hover:border-gray-300 transition-colors select-none">
            <input
              type="checkbox"
              checked={props.autoPayChecked}
              onChange={(e) => props.onAutoPayChange(e.target.checked)}
              className="mt-0.5 h-4 w-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500 cursor-pointer"
            />
            <div>
              <span className="text-sm font-medium text-gray-900">
                Enable AutoPay
              </span>
              <p className="text-xs text-gray-500 mt-0.5">
                Save this payment method for future automatic payments.
                Your card or bank account will be charged automatically
                when future invoices are generated.
              </p>
            </div>
          </label>

          {/* Error message */}
          {payError && (
            <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
              {payError}
            </div>
          )}

          <button
            type="submit"
            disabled={!stripe || !elements || submitting}
            className="w-full flex items-center justify-center gap-2 px-4 py-3 bg-blue-600 text-white font-semibold rounded-lg hover:bg-blue-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed text-sm"
            style={{
              backgroundColor: (props.brandColor || "#3b82f6"),
            }}
          >
            {submitting ? (
              <>
                <Loader2 className="w-4 h-4 animate-spin" />
                Processing...
              </>
            ) : (
              <>
                Pay{" "}
                {showSurcharge
                  ? fmt(totalWithSurcharge)
                  : fmt(props.total)}
              </>
            )}
          </button>
        </form>
      </div>
    </div>
  )
}
