/**
 * GET /api/cron/weather-check — Daily weather forecast check for all orgs.
 *
 * Protected by CRON_SECRET Bearer token to prevent unauthorized access.
 *
 * Runs daily at 6am (configure in your external cron service to call:
 *   GET https://your-domain.com/api/cron/weather-check
 *   Authorization: Bearer <CRON_SECRET>
 *
 * For each org, fetches the 7-day forecast for the org's service area centroid,
 * identifies days with severe weather (storm, extreme heat, high wind, heavy rain),
 * and creates weather_reschedule_proposals for affected service days.
 *
 * Office staff review and approve/deny proposals via the Alerts page.
 */

import { NextRequest, NextResponse } from "next/server"
import { adminDb } from "@/lib/db"
import { orgs } from "@/lib/db/schema"
import { checkWeatherForOrg } from "@/actions/weather"

export async function GET(req: NextRequest) {
  // ── Auth guard ──────────────────────────────────────────────────────────────
  const cronSecret = process.env.CRON_SECRET
  const authHeader = req.headers.get("authorization")

  if (!cronSecret) {
    console.error("[cron/weather-check] CRON_SECRET not set")
    return NextResponse.json({ error: "Not configured" }, { status: 500 })
  }

  if (authHeader !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  // ── Process all orgs ────────────────────────────────────────────────────────
  try {
    const allOrgs = await adminDb.select({ id: orgs.id }).from(orgs)

    let totalProposals = 0
    let orgsChecked = 0
    const errors: string[] = []

    for (const org of allOrgs) {
      try {
        const result = await checkWeatherForOrg(org.id)
        totalProposals += result.proposalsCreated
        orgsChecked++
      } catch (err) {
        const msg = err instanceof Error ? err.message : "Unknown error"
        console.error(`[cron/weather-check] Failed for org ${org.id}: ${msg}`)
        errors.push(`org ${org.id}: ${msg}`)
      }
    }

    console.log(
      `[cron/weather-check] Complete — ${orgsChecked} orgs checked, ${totalProposals} proposals created`
    )

    return NextResponse.json({
      success: true,
      checked: orgsChecked,
      proposalsCreated: totalProposals,
      errors: errors.length > 0 ? errors : undefined,
    })
  } catch (err) {
    console.error("[cron/weather-check] Fatal error:", err)
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Weather check failed" },
      { status: 500 }
    )
  }
}
