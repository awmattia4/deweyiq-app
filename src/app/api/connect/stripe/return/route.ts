import { NextResponse } from "next/server"
import { getCurrentUser } from "@/actions/auth"
import { adminDb } from "@/lib/db"
import { orgSettings } from "@/lib/db/schema"
import { eq } from "drizzle-orm"
import { stripe } from "@/lib/stripe/client"

/**
 * GET /api/connect/stripe/return
 *
 * Stripe redirects here after the owner completes (or partially completes)
 * the Connect onboarding flow. We check the account status and update
 * org_settings accordingly, then redirect to settings with a status param.
 */
export async function GET() {
  try {
    const user = await getCurrentUser()
    if (!user) {
      return NextResponse.redirect(
        new URL("/login", process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000")
      )
    }

    const appUrl = process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000"

    // Fetch the org's stripe_account_id
    const rows = await adminDb
      .select({
        id: orgSettings.id,
        stripe_account_id: orgSettings.stripe_account_id,
        payment_provider: orgSettings.payment_provider,
      })
      .from(orgSettings)
      .where(eq(orgSettings.org_id, user.org_id))
      .limit(1)

    if (!rows[0]?.stripe_account_id) {
      return NextResponse.redirect(new URL("/settings?stripe=incomplete", appUrl))
    }

    // Check account status with Stripe
    const account = await stripe.accounts.retrieve(rows[0].stripe_account_id)

    if (account.charges_enabled && account.details_submitted) {
      // Onboarding complete -- update org_settings
      const updates: Record<string, unknown> = {
        stripe_onboarding_done: true,
        updated_at: new Date(),
      }

      // If payment_provider is 'none', auto-set to 'stripe'
      if (rows[0].payment_provider === "none") {
        updates.payment_provider = "stripe"
      }

      await adminDb
        .update(orgSettings)
        .set(updates)
        .where(eq(orgSettings.id, rows[0].id))

      return NextResponse.redirect(new URL("/settings?stripe=success", appUrl))
    }

    // Onboarding incomplete (user may have exited early)
    return NextResponse.redirect(new URL("/settings?stripe=incomplete", appUrl))
  } catch (err) {
    console.error("[stripe/return] Error:", err)
    const appUrl = process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000"
    return NextResponse.redirect(new URL("/settings?stripe=incomplete", appUrl))
  }
}
