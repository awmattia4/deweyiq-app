/**
 * POST /api/cron/agreement-renewal -- Daily cron for renewal reminders and expiration checks.
 *
 * Called by the pg_cron-triggered Edge Function or Vercel Cron.
 * Protected by CRON_SECRET header to prevent unauthorized access.
 *
 * 1. runAgreementRenewalScan() — sends renewal reminder emails at configured
 *    lead times (e.g. 30 days and 7 days before expiry). Prevents duplicate
 *    sends within 24 hours via renewal_reminder_sent_at tracking.
 *
 * 2. checkExpiredAgreements() — transitions expired agreements:
 *    - auto_renew = true: extends end_date by term duration
 *    - auto_renew = false: sets status to 'expired', deactivates schedule rules
 */

import { NextRequest, NextResponse } from "next/server"
import { runAgreementRenewalScan, checkExpiredAgreements } from "@/actions/agreements"

export async function POST(req: NextRequest) {
  // Verify cron secret
  const cronSecret = process.env.CRON_SECRET
  const authHeader = req.headers.get("authorization")

  if (!cronSecret) {
    console.error("[cron/agreement-renewal] CRON_SECRET not set")
    return NextResponse.json({ error: "Not configured" }, { status: 500 })
  }

  if (authHeader !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  try {
    const [renewalResult, expirationResult] = await Promise.all([
      runAgreementRenewalScan(),
      checkExpiredAgreements(),
    ])

    if (!renewalResult.success) {
      console.error("[cron/agreement-renewal] Renewal scan failed:", renewalResult.error)
    }

    if (!expirationResult.success) {
      console.error("[cron/agreement-renewal] Expiration check failed:", expirationResult.error)
    }

    return NextResponse.json({
      success: true,
      remindersProcessed: renewalResult.remindersProcessed ?? 0,
      remindersSent: renewalResult.remindersSent ?? 0,
      expired: expirationResult.expired_count ?? 0,
      renewed: expirationResult.renewed_count ?? 0,
    })
  } catch (err) {
    console.error("[cron/agreement-renewal] Error:", err)
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Agreement renewal cron failed" },
      { status: 500 }
    )
  }
}
