/**
 * /api/reports/[token] — Public route handler for signed service report links.
 *
 * Security model: The signed JWT token IS the authorization.
 * No Supabase auth required — token verification is sufficient.
 *
 * Flow:
 * 1. Verify token via verifyReportToken()
 * 2. If invalid/expired: 410 Gone
 * 3. If valid: fetch report_html from service_visits using adminDb (service role)
 * 4. If no report: 404 Not Found
 * 5. Return HTML with Content-Type: text/html
 */

import { type NextRequest } from "next/server"
import { verifyReportToken } from "@/lib/reports/report-token"
import { adminDb } from "@/lib/db"
import { serviceVisits } from "@/lib/db/schema"
import { eq } from "drizzle-orm"

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ token: string }> }
) {
  const { token } = await params

  // ── 1. Verify JWT token ─────────────────────────────────────────────────
  const payload = await verifyReportToken(token)

  if (!payload) {
    return new Response(
      "This report link has expired or is invalid. Report links are valid for 30 days.",
      {
        status: 410,
        headers: { "Content-Type": "text/plain" },
      }
    )
  }

  const { visitId } = payload

  // ── 2. Fetch report HTML from DB via adminDb (no RLS — token is auth) ───
  try {
    const rows = await adminDb
      .select({ reportHtml: serviceVisits.report_html })
      .from(serviceVisits)
      .where(eq(serviceVisits.id, visitId))
      .limit(1)

    const reportHtml = rows[0]?.reportHtml

    if (!reportHtml) {
      return new Response("Report not found.", {
        status: 404,
        headers: { "Content-Type": "text/plain" },
      })
    }

    return new Response(reportHtml, {
      status: 200,
      headers: {
        "Content-Type": "text/html; charset=utf-8",
        // Cache report for 1 hour — it can be updated via edits
        "Cache-Control": "public, max-age=3600, stale-while-revalidate=86400",
      },
    })
  } catch (err) {
    console.error("[/api/reports] Failed to fetch report:", err)
    return new Response("Internal server error.", {
      status: 500,
      headers: { "Content-Type": "text/plain" },
    })
  }
}
