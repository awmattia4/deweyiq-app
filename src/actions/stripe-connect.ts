"use server"

import { revalidatePath } from "next/cache"
import { getCurrentUser } from "@/actions/auth"
import { adminDb } from "@/lib/db"
import { orgSettings } from "@/lib/db/schema"
import { eq } from "drizzle-orm"
import { stripe } from "@/lib/stripe/client"

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface StripeAccountStatus {
  connected: boolean
  chargesEnabled: boolean
  payoutsEnabled: boolean
  email: string | null
  businessName: string | null
  onboardingComplete: boolean
}

// ---------------------------------------------------------------------------
// getStripeAccountStatus
// ---------------------------------------------------------------------------

/**
 * Fetches the Stripe Connect account status for the current org.
 * Uses adminDb to read org_settings (consistent with other settings reads).
 */
export async function getStripeAccountStatus(): Promise<StripeAccountStatus> {
  const user = await getCurrentUser()
  if (!user) {
    return {
      connected: false,
      chargesEnabled: false,
      payoutsEnabled: false,
      email: null,
      businessName: null,
      onboardingComplete: false,
    }
  }

  try {
    const rows = await adminDb
      .select({
        stripe_account_id: orgSettings.stripe_account_id,
        stripe_onboarding_done: orgSettings.stripe_onboarding_done,
      })
      .from(orgSettings)
      .where(eq(orgSettings.org_id, user.org_id))
      .limit(1)

    const accountId = rows[0]?.stripe_account_id
    if (!accountId) {
      return {
        connected: false,
        chargesEnabled: false,
        payoutsEnabled: false,
        email: null,
        businessName: null,
        onboardingComplete: false,
      }
    }

    // Retrieve account details from Stripe
    const account = await stripe.accounts.retrieve(accountId)

    return {
      connected: true,
      chargesEnabled: account.charges_enabled ?? false,
      payoutsEnabled: account.payouts_enabled ?? false,
      email: account.email ?? null,
      businessName: (account.business_profile?.name ?? account.settings?.dashboard?.display_name) ?? null,
      onboardingComplete: rows[0]?.stripe_onboarding_done ?? false,
    }
  } catch (err) {
    console.error("[getStripeAccountStatus] Error:", err)
    return {
      connected: false,
      chargesEnabled: false,
      payoutsEnabled: false,
      email: null,
      businessName: null,
      onboardingComplete: false,
    }
  }
}

// ---------------------------------------------------------------------------
// updatePaymentProvider
// ---------------------------------------------------------------------------

/**
 * Updates the payment provider selection. Owner only.
 */
export async function updatePaymentProvider(
  provider: string
): Promise<{ success: boolean; error?: string }> {
  const user = await getCurrentUser()
  if (!user) return { success: false, error: "Not authenticated" }
  if (user.role !== "owner") return { success: false, error: "Only owners can change payment settings" }

  const validProviders = ["none", "stripe", "qbo", "both"]
  if (!validProviders.includes(provider)) {
    return { success: false, error: "Invalid payment provider" }
  }

  try {
    await adminDb
      .update(orgSettings)
      .set({
        payment_provider: provider,
        updated_at: new Date(),
      })
      .where(eq(orgSettings.org_id, user.org_id))

    revalidatePath("/settings")
    return { success: true }
  } catch (err) {
    console.error("[updatePaymentProvider] Error:", err)
    return {
      success: false,
      error: err instanceof Error ? err.message : "Failed to update payment provider",
    }
  }
}

// ---------------------------------------------------------------------------
// updateSurchargeSettings
// ---------------------------------------------------------------------------

/**
 * Updates credit card surcharge settings. Owner only.
 * Validates that the percentage does not exceed 3.00% (Visa limit).
 */
export async function updateSurchargeSettings(
  enabled: boolean,
  pct?: string
): Promise<{ success: boolean; error?: string }> {
  const user = await getCurrentUser()
  if (!user) return { success: false, error: "Not authenticated" }
  if (user.role !== "owner") return { success: false, error: "Only owners can change surcharge settings" }

  // Validate percentage if enabled
  let parsedPct: string | null = null
  if (enabled && pct !== undefined && pct !== "") {
    const num = parseFloat(pct)
    if (isNaN(num) || num < 0) {
      return { success: false, error: "Surcharge percentage must be a positive number" }
    }
    if (num > 3.0) {
      return { success: false, error: "Surcharge percentage cannot exceed 3.00% (Visa network limit)" }
    }
    // Store as decimal: 2.99% -> "0.0299"
    parsedPct = (num / 100).toFixed(4)
  }

  try {
    await adminDb
      .update(orgSettings)
      .set({
        cc_surcharge_enabled: enabled,
        cc_surcharge_pct: parsedPct,
        updated_at: new Date(),
      })
      .where(eq(orgSettings.org_id, user.org_id))

    revalidatePath("/settings")
    return { success: true }
  } catch (err) {
    console.error("[updateSurchargeSettings] Error:", err)
    return {
      success: false,
      error: err instanceof Error ? err.message : "Failed to update surcharge settings",
    }
  }
}
