import Stripe from "stripe"

/**
 * Platform Stripe instance (server-side only).
 *
 * This is the platform-level Stripe client used for all Connect operations
 * (creating connected accounts, account links, payment intents on behalf of
 * connected accounts, etc.).
 *
 * NOT a per-connected-account client. For connected-account-specific operations,
 * pass the connected account ID via the `stripeAccount` option on individual calls.
 *
 * Uses lazy initialization to avoid build-time errors when STRIPE_SECRET_KEY
 * is not set (e.g. during `next build` in CI).
 */
let _stripe: Stripe | null = null

export function getStripe(): Stripe {
  if (!_stripe) {
    const key = process.env.STRIPE_SECRET_KEY
    if (!key) {
      throw new Error("STRIPE_SECRET_KEY is not set. Add it to your environment variables.")
    }
    _stripe = new Stripe(key, { typescript: true })
  }
  return _stripe
}

/** Convenience alias -- lazily initialized Stripe singleton. */
export const stripe = new Proxy({} as Stripe, {
  get(_target, prop, receiver) {
    return Reflect.get(getStripe(), prop, receiver)
  },
})
