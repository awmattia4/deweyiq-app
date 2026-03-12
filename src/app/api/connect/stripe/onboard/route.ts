import { NextResponse } from "next/server"
import { getCurrentUser } from "@/actions/auth"
import { adminDb } from "@/lib/db"
import { orgSettings } from "@/lib/db/schema"
import { eq } from "drizzle-orm"
import { stripe } from "@/lib/stripe/client"

/**
 * POST /api/connect/stripe/onboard
 *
 * Creates a Stripe Standard connected account (if not already created) and
 * returns an Account Link URL for the owner to complete onboarding.
 *
 * Owner-only. Uses adminDb for org_settings consistency with other settings writes.
 */
export async function POST() {
  try {
    const user = await getCurrentUser()
    if (!user) {
      return NextResponse.json({ error: "Not authenticated" }, { status: 401 })
    }
    if (user.role !== "owner") {
      return NextResponse.json({ error: "Only owners can connect Stripe" }, { status: 403 })
    }

    // Fetch current org settings
    const rows = await adminDb
      .select({
        id: orgSettings.id,
        stripe_account_id: orgSettings.stripe_account_id,
      })
      .from(orgSettings)
      .where(eq(orgSettings.org_id, user.org_id))
      .limit(1)

    if (!rows[0]) {
      return NextResponse.json(
        { error: "Org settings not found. Please refresh and try again." },
        { status: 404 }
      )
    }

    let accountId = rows[0].stripe_account_id

    // Create a Standard connected account if none exists
    if (!accountId) {
      const account = await stripe.accounts.create({
        type: "standard",
        email: user.email,
      })
      accountId = account.id

      // Persist the account ID
      await adminDb
        .update(orgSettings)
        .set({
          stripe_account_id: accountId,
          updated_at: new Date(),
        })
        .where(eq(orgSettings.id, rows[0].id))
    }

    // Create an Account Link for onboarding
    const appUrl = process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000"
    const accountLink = await stripe.accountLinks.create({
      account: accountId,
      refresh_url: `${appUrl}/settings?stripe=refresh`,
      return_url: `${appUrl}/api/connect/stripe/return`,
      type: "account_onboarding",
    })

    return NextResponse.json({ url: accountLink.url })
  } catch (err) {
    console.error("[stripe/onboard] Error:", err)
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Failed to create Stripe onboarding link" },
      { status: 500 }
    )
  }
}
