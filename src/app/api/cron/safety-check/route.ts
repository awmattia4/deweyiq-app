/**
 * GET /api/cron/safety-check — Periodic unresponsive tech detection.
 *
 * Phase 10 Plan 14 (NOTIF-23)
 *
 * Called every 5 minutes by an external cron service (pg_cron Edge Function
 * or Vercel Cron). Protected by CRON_SECRET Bearer token to prevent
 * unauthorized triggering.
 *
 * For each org: calls checkUnresponsiveTechs to detect techs who haven't
 * completed a stop within the org's configured safety_timeout_minutes.
 * Fires the escalation chain for unresponsive techs.
 *
 * Returns: { checked: N, alertsCreated: N, alertsEscalated: N }
 */

import { NextRequest, NextResponse } from "next/server"
import { adminDb } from "@/lib/db"
import { orgs } from "@/lib/db/schema"
import { checkUnresponsiveTechs } from "@/actions/safety"

export async function GET(req: NextRequest) {
  // Verify cron secret
  const cronSecret = process.env.CRON_SECRET
  const authHeader = req.headers.get("authorization")

  if (!cronSecret) {
    console.error("[cron/safety-check] CRON_SECRET not set")
    return NextResponse.json({ error: "Not configured" }, { status: 500 })
  }

  if (authHeader !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  try {
    // Fetch all org IDs
    const allOrgs = await adminDb
      .select({ id: orgs.id })
      .from(orgs)

    let totalChecked = 0
    let totalAlertsCreated = 0
    let totalAlertsEscalated = 0

    // Process each org sequentially to avoid DB connection pressure
    for (const org of allOrgs) {
      try {
        const result = await checkUnresponsiveTechs(org.id)
        totalChecked += result.checked
        totalAlertsCreated += result.alertsCreated
        totalAlertsEscalated += result.alertsEscalated
      } catch (orgErr) {
        // Non-fatal: log and continue with remaining orgs
        console.error(`[cron/safety-check] Error processing org ${org.id}:`, orgErr)
      }
    }

    console.log(
      `[cron/safety-check] Done — orgs: ${allOrgs.length}, ` +
      `techs checked: ${totalChecked}, ` +
      `alerts created: ${totalAlertsCreated}, ` +
      `alerts escalated: ${totalAlertsEscalated}`
    )

    return NextResponse.json({
      success: true,
      orgs: allOrgs.length,
      checked: totalChecked,
      alertsCreated: totalAlertsCreated,
      alertsEscalated: totalAlertsEscalated,
    })
  } catch (err) {
    console.error("[cron/safety-check] Fatal error:", err)
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Safety check failed" },
      { status: 500 }
    )
  }
}
