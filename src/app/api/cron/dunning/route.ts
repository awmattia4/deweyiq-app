/**
 * POST /api/cron/dunning -- Internal cron handler for daily dunning scan.
 *
 * Called by the pg_cron-triggered Edge Function (dunning-scan).
 * Protected by CRON_SECRET header to prevent unauthorized access.
 *
 * Scans all orgs for overdue invoices, sends reminder emails,
 * and retries payments for AutoPay customers.
 */

import { NextRequest, NextResponse } from "next/server"
import { runDunningScan } from "@/actions/dunning"

export async function POST(req: NextRequest) {
  // Verify cron secret
  const cronSecret = process.env.CRON_SECRET
  const authHeader = req.headers.get("authorization")

  if (!cronSecret) {
    console.error("[cron/dunning] CRON_SECRET not set")
    return NextResponse.json({ error: "Not configured" }, { status: 500 })
  }

  if (authHeader !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  try {
    const result = await runDunningScan()

    return NextResponse.json({
      success: true,
      ...result,
    })
  } catch (err) {
    console.error("[cron/dunning] Error:", err)
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Dunning scan failed" },
      { status: 500 }
    )
  }
}
