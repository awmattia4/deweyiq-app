/**
 * POST /api/quotes/[token]/approve — Customer quote response endpoint.
 *
 * No auth required — token IS the authorization (JWT signed with QUOTE_TOKEN_SECRET).
 * All DB operations use adminDb (no RLS — customer has no Supabase auth session).
 *
 * Supported actions:
 *   approve         → quote.status = 'approved', WO.status = 'approved', office alert
 *   decline         → quote.status = 'declined', office alert (WO stays 'quoted')
 *   request_changes → quote.status = 'changes_requested', office alert (WO stays 'quoted')
 *
 * On approval, the approved_optional_item_ids list is stored on the quote row so that
 * Plan 07 (invoicing) can include only customer-approved optional items.
 *
 * Error responses:
 *   410 Gone        — invalid or expired token
 *   400 Bad Request — missing/invalid action or payload
 *   500             — unexpected server error
 */

import { type NextRequest, NextResponse } from "next/server"
import { verifyQuoteToken } from "@/lib/quotes/quote-token"
import { adminDb } from "@/lib/db"
import { quotes, workOrders, alerts } from "@/lib/db/schema"
import { eq, and } from "drizzle-orm"
import { sql } from "drizzle-orm"

// ── Types ──────────────────────────────────────────────────────────────────────

interface ApproveBody {
  action: "approve" | "decline" | "request_changes"
  signatureName?: string | null
  selectedOptionalItemIds?: string[]
  declineReason?: string
  changeNote?: string
}

// ── POST handler ───────────────────────────────────────────────────────────────

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ token: string }> }
) {
  const { token } = await params

  // ── 1. Verify JWT token ────────────────────────────────────────────────────
  const tokenPayload = await verifyQuoteToken(token)
  if (!tokenPayload) {
    return NextResponse.json(
      { error: "This quote link has expired or is invalid." },
      { status: 410 }
    )
  }

  const { quoteId } = tokenPayload

  // ── 2. Parse and validate body ────────────────────────────────────────────
  let body: ApproveBody
  try {
    body = (await req.json()) as ApproveBody
  } catch {
    return NextResponse.json({ error: "Invalid request body." }, { status: 400 })
  }

  const { action } = body
  if (!action || !["approve", "decline", "request_changes"].includes(action)) {
    return NextResponse.json(
      { error: "Invalid action. Must be: approve | decline | request_changes" },
      { status: 400 }
    )
  }

  // ── 3. Fetch quote + WO via adminDb ──────────────────────────────────────
  try {
    const quoteRows = await adminDb
      .select({
        id: quotes.id,
        org_id: quotes.org_id,
        work_order_id: quotes.work_order_id,
        quote_number: quotes.quote_number,
        status: quotes.status,
        expires_at: quotes.expires_at,
      })
      .from(quotes)
      .where(eq(quotes.id, quoteId))
      .limit(1)

    const quote = quoteRows[0]
    if (!quote) {
      return NextResponse.json({ error: "Quote not found." }, { status: 404 })
    }

    // Guard: only 'sent' quotes can be acted upon
    if (quote.status !== "sent") {
      const msgMap: Record<string, string> = {
        approved: "This quote has already been approved.",
        declined: "This quote has already been declined.",
        changes_requested: "A change request is already pending for this quote.",
        draft: "This quote has not been sent yet.",
        superseded: "This quote has been superseded by a newer version.",
        expired: "This quote has expired.",
      }
      return NextResponse.json(
        { error: msgMap[quote.status] ?? "This quote cannot be acted upon." },
        { status: 409 }
      )
    }

    // Guard: expiration check
    if (quote.expires_at && new Date(quote.expires_at) < new Date()) {
      return NextResponse.json(
        { error: "This quote has expired. Please contact us for an updated quote." },
        { status: 409 }
      )
    }

    const now = new Date()

    // ── 4. Handle each action ──────────────────────────────────────────────
    if (action === "approve") {
      await _handleApprove(quote, body, now)
    } else if (action === "decline") {
      await _handleDecline(quote, body, now)
    } else if (action === "request_changes") {
      await _handleRequestChanges(quote, body, now)
    }

    return NextResponse.json({ success: true })
  } catch (err) {
    console.error("[/api/quotes/approve] Error:", err)
    return NextResponse.json(
      { error: "An unexpected error occurred. Please try again." },
      { status: 500 }
    )
  }
}

// ── Action handlers ────────────────────────────────────────────────────────────

interface QuoteRow {
  id: string
  org_id: string
  work_order_id: string
  quote_number: string | null
  status: string
  expires_at: Date | null
}

/**
 * _handleApprove — Approves the quote and auto-converts the parent WO to 'approved'.
 *
 * Per WORK-05: "Approved quotes auto-convert to work orders."
 * WO status → 'approved', activity_log appended, office alert inserted.
 * approved_optional_item_ids stored on quote for Plan 07 (invoice line item filtering).
 */
async function _handleApprove(
  quote: QuoteRow,
  body: ApproveBody,
  now: Date
): Promise<void> {
  const signatureName = body.signatureName?.trim() || null
  const selectedOptionalItemIds = body.selectedOptionalItemIds ?? []

  // ── a) Update quote → approved ───────────────────────────────────────────
  await adminDb
    .update(quotes)
    .set({
      status: "approved",
      approved_at: now,
      signature_name: signatureName,
      approved_optional_item_ids: selectedOptionalItemIds,
      updated_at: now,
    })
    .where(eq(quotes.id, quote.id))

  // ── b) Auto-convert WO → approved ────────────────────────────────────────
  // Fetch current WO for activity log context
  const woRows = await adminDb
    .select({ id: workOrders.id, title: workOrders.title, status: workOrders.status })
    .from(workOrders)
    .where(eq(workOrders.id, quote.work_order_id))
    .limit(1)

  const wo = woRows[0]

  if (wo) {
    const activityEvent = JSON.stringify([{
      type: "quote_approved",
      at: now.toISOString(),
      by_id: null,
      note: `Customer approved quote #${quote.quote_number ?? quote.id}`,
    }])

    await adminDb
      .update(workOrders)
      .set({
        status: "approved",
        updated_at: now,
        activity_log: sql`COALESCE(activity_log, '[]'::jsonb) || ${activityEvent}::jsonb`,
      })
      .where(eq(workOrders.id, quote.work_order_id))

    // ── c) Notify office — insert alert (adminDb, RLS bypass) ─────────────
    // Uses onConflictDoNothing on (org_id, alert_type, reference_id) unique constraint.
    // reference_id = quote.id so each approval generates exactly one alert.
    await adminDb
      .insert(alerts)
      .values({
        org_id: quote.org_id,
        alert_type: "quote_approved",
        severity: "info",
        reference_id: quote.id,
        reference_type: "quote",
        title: `Customer approved quote #${quote.quote_number ?? quote.id} for "${wo.title}"`,
        description: signatureName
          ? `Signed by: ${signatureName}`
          : "Approved without signature",
        metadata: {
          quoteId: quote.id,
          workOrderId: quote.work_order_id,
          quoteNumber: quote.quote_number,
          approvedOptionalItemIds: selectedOptionalItemIds,
        },
      })
      .onConflictDoNothing()
  }
}

/**
 * _handleDecline — Marks quote as declined; WO remains 'quoted' for revision.
 */
async function _handleDecline(
  quote: QuoteRow,
  body: ApproveBody,
  now: Date
): Promise<void> {
  const declineReason = body.declineReason?.trim() || null

  // ── a) Update quote → declined ───────────────────────────────────────────
  await adminDb
    .update(quotes)
    .set({
      status: "declined",
      declined_at: now,
      decline_reason: declineReason,
      updated_at: now,
    })
    .where(eq(quotes.id, quote.id))

  // ── b) Append decline event to WO activity log ────────────────────────────
  const activityEvent = JSON.stringify([{
    type: "quote_declined",
    at: now.toISOString(),
    by_id: null,
    note: declineReason
      ? `Customer declined quote #${quote.quote_number ?? quote.id}: ${declineReason}`
      : `Customer declined quote #${quote.quote_number ?? quote.id}`,
  }])

  await adminDb
    .update(workOrders)
    .set({
      updated_at: now,
      activity_log: sql`COALESCE(activity_log, '[]'::jsonb) || ${activityEvent}::jsonb`,
    })
    .where(eq(workOrders.id, quote.work_order_id))

  // ── c) Notify office ───────────────────────────────────────────────────────
  await adminDb
    .insert(alerts)
    .values({
      org_id: quote.org_id,
      alert_type: "quote_declined",
      severity: "warning",
      reference_id: quote.id,
      reference_type: "quote",
      title: `Customer declined quote #${quote.quote_number ?? quote.id}`,
      description: declineReason ? `Reason: ${declineReason}` : undefined,
      metadata: {
        quoteId: quote.id,
        workOrderId: quote.work_order_id,
        quoteNumber: quote.quote_number,
        declineReason,
      },
    })
    .onConflictDoNothing()
}

/**
 * _handleRequestChanges — Records change request on quote; WO remains 'quoted' for revision.
 */
async function _handleRequestChanges(
  quote: QuoteRow,
  body: ApproveBody,
  now: Date
): Promise<void> {
  const changeNote = body.changeNote?.trim() || null

  // ── a) Update quote → changes_requested ──────────────────────────────────
  await adminDb
    .update(quotes)
    .set({
      status: "changes_requested",
      change_note: changeNote,
      updated_at: now,
    })
    .where(eq(quotes.id, quote.id))

  // ── b) Append event to WO activity log ────────────────────────────────────
  const activityEvent = JSON.stringify([{
    type: "quote_changes_requested",
    at: now.toISOString(),
    by_id: null,
    note: changeNote
      ? `Customer requested changes on quote #${quote.quote_number ?? quote.id}: ${changeNote}`
      : `Customer requested changes on quote #${quote.quote_number ?? quote.id}`,
  }])

  await adminDb
    .update(workOrders)
    .set({
      updated_at: now,
      activity_log: sql`COALESCE(activity_log, '[]'::jsonb) || ${activityEvent}::jsonb`,
    })
    .where(and(eq(workOrders.id, quote.work_order_id)))

  // ── c) Notify office ───────────────────────────────────────────────────────
  await adminDb
    .insert(alerts)
    .values({
      org_id: quote.org_id,
      alert_type: "quote_changes_requested",
      severity: "info",
      reference_id: quote.id,
      reference_type: "quote",
      title: `Customer requested changes on quote #${quote.quote_number ?? quote.id}`,
      description: changeNote ? changeNote : undefined,
      metadata: {
        quoteId: quote.id,
        workOrderId: quote.work_order_id,
        quoteNumber: quote.quote_number,
        changeNote,
      },
    })
    .onConflictDoNothing()
}
