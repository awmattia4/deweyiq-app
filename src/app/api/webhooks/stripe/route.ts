/**
 * POST /api/webhooks/stripe -- Stripe webhook endpoint.
 *
 * Handles both Connect events (payment events on connected accounts) and
 * platform events (account.updated). Uses raw body for signature verification.
 *
 * CRITICAL: No auth middleware -- Stripe calls this endpoint directly.
 *
 * Webhook secrets:
 * - STRIPE_CONNECT_WEBHOOK_SECRET: for Connect events (payment_intent.*, charge.*)
 * - STRIPE_WEBHOOK_SECRET: for platform events (account.updated)
 *
 * For simplicity, uses a single endpoint and tries both secrets.
 */

import { NextRequest, NextResponse } from "next/server"
import { getStripe } from "@/lib/stripe/client"
import type Stripe from "stripe"
import {
  handlePaymentSucceeded,
  handlePaymentFailed,
  handleAccountUpdated,
  handleChargeRefunded,
  handlePayoutPaid,
} from "@/lib/stripe/webhook-handlers"

export async function POST(req: NextRequest) {
  const body = await req.text()
  const signature = req.headers.get("stripe-signature")

  if (!signature) {
    return NextResponse.json({ error: "Missing stripe-signature header" }, { status: 400 })
  }

  const stripe = getStripe()

  // Try to construct the event using available webhook secrets
  let event: Stripe.Event | null = null

  // Try Connect webhook secret first (most common for payment events)
  const connectSecret = process.env.STRIPE_CONNECT_WEBHOOK_SECRET
  if (connectSecret) {
    try {
      event = stripe.webhooks.constructEvent(body, signature, connectSecret)
    } catch {
      // Will try platform secret next
    }
  }

  // Try platform webhook secret if Connect secret didn't work
  if (!event) {
    const platformSecret = process.env.STRIPE_WEBHOOK_SECRET
    if (platformSecret) {
      try {
        event = stripe.webhooks.constructEvent(body, signature, platformSecret)
      } catch {
        // Both failed
      }
    }
  }

  if (!event) {
    console.error("[Stripe Webhook] Signature verification failed")
    return NextResponse.json(
      { error: "Webhook signature verification failed" },
      { status: 400 }
    )
  }

  // ── Route to handlers ────────────────────────────────────────────────────
  try {
    switch (event.type) {
      case "payment_intent.succeeded":
        await handlePaymentSucceeded(event.data.object as Stripe.PaymentIntent)
        break

      case "payment_intent.payment_failed":
        await handlePaymentFailed(event.data.object as Stripe.PaymentIntent)
        break

      case "account.updated":
        await handleAccountUpdated(event.data.object as Stripe.Account)
        break

      case "charge.refunded":
        await handleChargeRefunded(event.data.object as Stripe.Charge)
        break

      case "payout.paid":
        // Auto-creates journal entry and matches to bank transaction
        await handlePayoutPaid(event.data.object as Stripe.Payout)
        break

      default:
        // Unhandled event type -- acknowledge but ignore
        console.log("[Stripe Webhook] Unhandled event type:", event.type)
    }
  } catch (err) {
    // Log but still return 200 to prevent Stripe from retrying
    // (we don't want to be stuck in a retry loop on handler errors)
    console.error("[Stripe Webhook] Handler error:", err)
  }

  return NextResponse.json({ received: true })
}
