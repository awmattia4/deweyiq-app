/**
 * POST /api/agreements/[id]/sign — Customer agreement sign/decline endpoint.
 *
 * Token IS the authorization (JWT signed with AGREEMENT_TOKEN_SECRET).
 * All DB operations use adminDb — customer has no Supabase auth session.
 *
 * Supported actions:
 *   accept  → agreement.status = 'active', captures signature metadata,
 *              auto-provisions schedule rules per pool, configures billing model.
 *   decline → agreement.status = 'declined', logs reason, emails office.
 *
 * Idempotency: if agreement.status !== 'sent', returns 409 immediately.
 *
 * Error responses:
 *   401 — invalid or expired token
 *   403 — token agreementId does not match route param
 *   400 — missing/invalid action or payload
 *   404 — agreement not found
 *   409 — agreement already processed
 *   500 — unexpected server error
 */

import { type NextRequest, NextResponse } from "next/server"
import { verifyAgreementToken } from "@/lib/agreements/agreement-token"
import { adminDb } from "@/lib/db"
import {
  serviceAgreements,
  agreementPoolEntries,
  agreementAmendments,
  scheduleRules,
  customers,
  profiles,
} from "@/lib/db/schema"
import { eq, inArray, sql } from "drizzle-orm"
import { Resend } from "resend"

// ── Types ──────────────────────────────────────────────────────────────────────

interface SignBody {
  action: "accept" | "decline"
  signatureName?: string | null
  signatureImageBase64?: string | null
  declineReason?: string | null
  token: string
}

// ── POST handler ───────────────────────────────────────────────────────────────

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id: agreementId } = await params

  // ── 1. Parse body ─────────────────────────────────────────────────────────
  let body: SignBody
  try {
    body = (await req.json()) as SignBody
  } catch {
    return NextResponse.json({ error: "Invalid request body." }, { status: 400 })
  }

  // ── 2. Verify JWT token ───────────────────────────────────────────────────
  const tokenPayload = await verifyAgreementToken(body.token)
  if (!tokenPayload) {
    return NextResponse.json(
      { error: "This link has expired or is invalid." },
      { status: 401 }
    )
  }

  // ── 3. Verify token matches route param ───────────────────────────────────
  if (tokenPayload.agreementId !== agreementId) {
    return NextResponse.json(
      { error: "Token does not match agreement." },
      { status: 403 }
    )
  }

  // ── 4. Validate action ────────────────────────────────────────────────────
  const { action } = body
  if (!action || !["accept", "decline"].includes(action)) {
    return NextResponse.json(
      { error: "Invalid action. Must be: accept | decline" },
      { status: 400 }
    )
  }

  // ── 5. Fetch agreement ────────────────────────────────────────────────────
  try {
    const agreementRows = await adminDb
      .select({
        id: serviceAgreements.id,
        org_id: serviceAgreements.org_id,
        customer_id: serviceAgreements.customer_id,
        agreement_number: serviceAgreements.agreement_number,
        status: serviceAgreements.status,
        activity_log: serviceAgreements.activity_log,
      })
      .from(serviceAgreements)
      .where(eq(serviceAgreements.id, agreementId))
      .limit(1)

    const agreement = agreementRows[0]

    if (!agreement) {
      return NextResponse.json({ error: "Agreement not found." }, { status: 404 })
    }

    // ── 6. Detect amendment sign vs. original sign ────────────────────────
    const isAmendmentSign = Boolean(tokenPayload.amendmentId)

    if (isAmendmentSign) {
      // Amendment sign: agreement must be 'active' with a pending amendment
      if (agreement.status !== "active") {
        return NextResponse.json(
          { error: "This agreement is not in an active state." },
          { status: 409 }
        )
      }
      // Verify the pending_amendment_id matches
      const fullAgreementRows = await adminDb
        .select({ pending_amendment_id: serviceAgreements.pending_amendment_id })
        .from(serviceAgreements)
        .where(eq(serviceAgreements.id, agreementId))
        .limit(1)
      const pendingAmendmentId = fullAgreementRows[0]?.pending_amendment_id
      if (!pendingAmendmentId) {
        return NextResponse.json(
          { error: "No pending amendment found for this agreement." },
          { status: 409 }
        )
      }

      const now = new Date()
      if (action === "accept") {
        await _handleAmendmentAccept(agreement, pendingAmendmentId, now)
      } else {
        // Decline the amendment (reject it, leave agreement active)
        await _handleAmendmentDecline(agreement, pendingAmendmentId, body, now)
      }
      return NextResponse.json({ success: true })
    }

    // ── 7. Original sign idempotency guard ────────────────────────────────
    if (agreement.status !== "sent") {
      return NextResponse.json(
        { error: "This agreement has already been processed." },
        { status: 409 }
      )
    }

    const now = new Date()

    // ── 8. Dispatch to handler ────────────────────────────────────────────
    if (action === "accept") {
      await _handleAccept(req, agreement, body, now)
    } else {
      await _handleDecline(agreement, body, now)
    }

    return NextResponse.json({ success: true })
  } catch (err) {
    console.error("[POST /api/agreements/[id]/sign] Error:", err)
    return NextResponse.json(
      { error: "An unexpected error occurred. Please try again." },
      { status: 500 }
    )
  }
}

// ── Agreement row shape ────────────────────────────────────────────────────────

interface AgreementRow {
  id: string
  org_id: string
  customer_id: string
  agreement_number: string
  status: string
  activity_log: Array<{ action: string; actor: string; at: string; note?: string }> | null
}

// ── _handleAccept ──────────────────────────────────────────────────────────────

async function _handleAccept(
  req: NextRequest,
  agreement: AgreementRow,
  body: SignBody,
  now: Date
): Promise<void> {
  const signatureName = body.signatureName?.trim() ?? null
  const signatureImageBase64 = body.signatureImageBase64 ?? null

  // Capture metadata
  const ip =
    req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ??
    req.headers.get("x-real-ip") ??
    null
  const userAgent = req.headers.get("user-agent") ?? null

  // ── a) Update agreement → active ─────────────────────────────────────────
  const activityEntry = JSON.stringify([{
    action: "agreement_signed",
    actor: "customer",
    at: now.toISOString(),
    note: `Customer signed agreement. Signed as: ${signatureName ?? "canvas signature"}`,
  }])

  await adminDb
    .update(serviceAgreements)
    .set({
      status: "active",
      signed_at: now,
      signature_name: signatureName,
      signature_image_base64: signatureImageBase64,
      signature_ip: ip,
      signature_user_agent: userAgent,
      updated_at: now,
      activity_log: sql`COALESCE(activity_log, '[]'::jsonb) || ${activityEntry}::jsonb`,
    })
    .where(eq(serviceAgreements.id, agreement.id))

  // ── b) Fetch pool entries ─────────────────────────────────────────────────
  const entries = await adminDb
    .select({
      id: agreementPoolEntries.id,
      pool_id: agreementPoolEntries.pool_id,
      frequency: agreementPoolEntries.frequency,
      custom_interval_days: agreementPoolEntries.custom_interval_days,
      preferred_day_of_week: agreementPoolEntries.preferred_day_of_week,
      pricing_model: agreementPoolEntries.pricing_model,
      monthly_amount: agreementPoolEntries.monthly_amount,
      per_visit_amount: agreementPoolEntries.per_visit_amount,
      tiered_base_amount: agreementPoolEntries.tiered_base_amount,
    })
    .from(agreementPoolEntries)
    .where(eq(agreementPoolEntries.agreement_id, agreement.id))

  // ── c) Auto-provision schedule rules ─────────────────────────────────────
  // Compute anchor_date: use today's date in local time (never toISOString())
  const today = new Date()
  const anchor =
    today.getFullYear() +
    "-" +
    String(today.getMonth() + 1).padStart(2, "0") +
    "-" +
    String(today.getDate()).padStart(2, "0")

  for (const entry of entries) {
    // Insert schedule rule
    const [insertedRule] = await adminDb
      .insert(scheduleRules)
      .values({
        org_id: agreement.org_id,
        customer_id: agreement.customer_id,
        pool_id: entry.pool_id,
        frequency: entry.frequency,
        custom_interval_days: entry.custom_interval_days,
        anchor_date: anchor,
        preferred_day_of_week: entry.preferred_day_of_week,
        active: true,
        created_at: now,
        updated_at: now,
      })
      .returning({ id: scheduleRules.id })

    if (insertedRule) {
      // Link pool entry back to its schedule rule
      await adminDb
        .update(agreementPoolEntries)
        .set({ schedule_rule_id: insertedRule.id })
        .where(eq(agreementPoolEntries.id, entry.id))
    }
  }

  // ── d) Auto-configure billing model ──────────────────────────────────────
  if (entries.length > 0) {
    const pricingModels = [...new Set(entries.map((e) => e.pricing_model))]
    const allMonthlyFlat = pricingModels.every((m) => m === "monthly_flat")
    const allPerVisit = pricingModels.every((m) => m === "per_visit")

    if (allMonthlyFlat) {
      // Sum all monthly amounts
      const totalMonthly = entries.reduce((sum, e) => {
        return sum + (e.monthly_amount ? parseFloat(e.monthly_amount) : 0)
      }, 0)

      await adminDb
        .update(customers)
        .set({
          billing_model: "flat_rate",
          flat_rate_amount: totalMonthly.toFixed(2),
          updated_at: now,
        })
        .where(eq(customers.id, agreement.customer_id))
    } else if (allPerVisit) {
      await adminDb
        .update(customers)
        .set({
          billing_model: "per_visit",
          updated_at: now,
        })
        .where(eq(customers.id, agreement.customer_id))
    } else {
      // Mixed or tiered — use flat_rate with total monthly equivalent
      const totalMonthly = entries.reduce((sum, e) => {
        if (e.pricing_model === "monthly_flat" && e.monthly_amount) {
          return sum + parseFloat(e.monthly_amount)
        }
        if (e.pricing_model === "tiered" && e.tiered_base_amount) {
          return sum + parseFloat(e.tiered_base_amount)
        }
        return sum
      }, 0)

      await adminDb
        .update(customers)
        .set({
          billing_model: "flat_rate",
          flat_rate_amount: totalMonthly > 0 ? totalMonthly.toFixed(2) : null,
          updated_at: now,
        })
        .where(eq(customers.id, agreement.customer_id))
    }
  }
}

// ── _handleAmendmentAccept ────────────────────────────────────────────────────

/**
 * Customer approved a major amendment:
 * - Mark amendment as signed
 * - Clear pending_amendment_id on agreement
 * - Agreement stays 'active'
 */
async function _handleAmendmentAccept(
  agreement: AgreementRow,
  amendmentId: string,
  now: Date
): Promise<void> {
  const activityEntry = JSON.stringify([{
    action: "amendment_signed",
    actor: "customer",
    at: now.toISOString(),
    note: "Customer approved amendment.",
  }])

  // Mark amendment signed
  await adminDb
    .update(agreementAmendments)
    .set({ status: "signed", signed_at: now })
    .where(eq(agreementAmendments.id, amendmentId))

  // Clear pending_amendment_id + append log
  await adminDb
    .update(serviceAgreements)
    .set({
      pending_amendment_id: null,
      updated_at: now,
      activity_log: sql`COALESCE(activity_log, '[]'::jsonb) || ${activityEntry}::jsonb`,
    })
    .where(eq(serviceAgreements.id, agreement.id))
}

// ── _handleAmendmentDecline ───────────────────────────────────────────────────

/**
 * Customer rejected a major amendment:
 * - Mark amendment as rejected
 * - Clear pending_amendment_id on agreement
 * - Agreement stays 'active' (changes NOT applied — they were already applied on create,
 *   but this signals the office that the customer rejected)
 */
async function _handleAmendmentDecline(
  agreement: AgreementRow,
  amendmentId: string,
  body: SignBody,
  now: Date
): Promise<void> {
  const declineReason = body.declineReason?.trim() ?? null

  const activityEntry = JSON.stringify([{
    action: "amendment_rejected",
    actor: "customer",
    at: now.toISOString(),
    note: `Customer rejected amendment. Reason: ${declineReason ?? "No reason provided"}`,
  }])

  // Mark amendment rejected
  await adminDb
    .update(agreementAmendments)
    .set({ status: "rejected", rejected_at: now })
    .where(eq(agreementAmendments.id, amendmentId))

  // Clear pending_amendment_id + append log
  await adminDb
    .update(serviceAgreements)
    .set({
      pending_amendment_id: null,
      updated_at: now,
      activity_log: sql`COALESCE(activity_log, '[]'::jsonb) || ${activityEntry}::jsonb`,
    })
    .where(eq(serviceAgreements.id, agreement.id))
}

// ── _handleDecline ─────────────────────────────────────────────────────────────

async function _handleDecline(
  agreement: AgreementRow,
  body: SignBody,
  now: Date
): Promise<void> {
  const declineReason = body.declineReason?.trim() ?? null

  // ── a) Update agreement → declined ───────────────────────────────────────
  const activityEntry = JSON.stringify([{
    action: "agreement_declined",
    actor: "customer",
    at: now.toISOString(),
    note: `Customer declined. Reason: ${declineReason ?? "No reason provided"}`,
  }])

  await adminDb
    .update(serviceAgreements)
    .set({
      status: "declined",
      declined_at: now,
      decline_reason: declineReason,
      updated_at: now,
      activity_log: sql`COALESCE(activity_log, '[]'::jsonb) || ${activityEntry}::jsonb`,
    })
    .where(eq(serviceAgreements.id, agreement.id))

  // ── b) Fetch customer name for notification email ─────────────────────────
  const customerRows = await adminDb
    .select({ full_name: customers.full_name })
    .from(customers)
    .where(eq(customers.id, agreement.customer_id))
    .limit(1)

  const customerName = customerRows[0]?.full_name ?? "A customer"

  // ── c) Email office — fetch owner/office emails ───────────────────────────
  const officeProfiles = await adminDb
    .select({ email: profiles.email, role: profiles.role })
    .from(profiles)
    .where(eq(profiles.org_id, agreement.org_id))

  const officeEmails = officeProfiles
    .filter((p) => p.role === "owner" || p.role === "office")
    .map((p) => p.email)
    .filter(Boolean)

  if (officeEmails.length === 0) return

  // ── d) Send decline notification via Resend ──────────────────────────────
  const resendApiKey = process.env.RESEND_API_KEY
  const isDev = process.env.NODE_ENV === "development"

  const subject = `Agreement ${agreement.agreement_number} Declined by ${customerName}`
  const htmlBody = `
    <p>Hello,</p>
    <p><strong>${customerName}</strong> has declined Service Agreement <strong>${agreement.agreement_number}</strong>.</p>
    ${declineReason ? `<p><strong>Reason:</strong> ${declineReason}</p>` : "<p>No reason was provided.</p>"}
    <p>You can review the agreement in your DeweyIQ dashboard.</p>
    <br>
    <p style="color:#6b7280;font-size:12px">Powered by DeweyIQ</p>
  `.trim()

  if (!resendApiKey) {
    if (isDev) {
      console.log("\n--- [DEV] Agreement Declined Notification -------------------")
      console.log(`To: ${officeEmails.join(", ")}`)
      console.log(`Subject: ${subject}`)
      console.log(`Reason: ${declineReason ?? "No reason provided"}`)
      console.log("-------------------------------------------------------------\n")
    }
    return
  }

  const resend = new Resend(resendApiKey)
  const fromAddress = isDev
    ? "DeweyIQ Dev <onboarding@resend.dev>"
    : "DeweyIQ Notifications <notifications@poolco.app>"

  try {
    await resend.emails.send({
      from: fromAddress,
      to: isDev ? ["delivered@resend.dev"] : officeEmails,
      subject,
      html: htmlBody,
    })
  } catch (emailErr) {
    // Non-blocking — decline is still recorded even if email fails
    console.error("[_handleDecline] Email send failed (non-blocking):", emailErr)
  }
}
