// Deno Edge Function — send-service-report
//
// Sends post-visit service report emails via Resend API.
//
// Security:
// - RESEND_API_KEY read from Deno environment secrets (never in source)
// - Uses Supabase service role to check + update email_sent_at
//
// Idempotency:
// - Checks service_visits.email_sent_at before sending
// - If already set: skips send and returns 200 (already sent)
// - After successful send: updates email_sent_at timestamp
//
// Deployment:
//   supabase functions deploy send-service-report
//   supabase secrets set RESEND_API_KEY=re_xxxxxxxxxxxx

import { createClient } from "jsr:@supabase/supabase-js@2"

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface RequestBody {
  visitId: string
  customerEmail: string
  customerName: string
  reportHtml: string
  fromName?: string
  fromEmail?: string
  customSubject?: string // Custom subject from notification template system
}

// ---------------------------------------------------------------------------
// CORS headers
// ---------------------------------------------------------------------------

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization",
}

// ---------------------------------------------------------------------------
// Handler
// ---------------------------------------------------------------------------

Deno.serve(async (req: Request) => {
  // Handle CORS preflight
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 204, headers: CORS_HEADERS })
  }

  if (req.method !== "POST") {
    return new Response(
      JSON.stringify({ error: "Method not allowed" }),
      { status: 405, headers: { ...CORS_HEADERS, "Content-Type": "application/json" } }
    )
  }

  // ── Parse request body ────────────────────────────────────────────────────

  let body: RequestBody
  try {
    body = await req.json() as RequestBody
  } catch {
    return new Response(
      JSON.stringify({ error: "Invalid JSON body" }),
      { status: 400, headers: { ...CORS_HEADERS, "Content-Type": "application/json" } }
    )
  }

  const {
    visitId,
    customerEmail,
    customerName,
    reportHtml,
    fromName = "Pool Company",
    fromEmail = "reports@poolco.app",
    customSubject,
  } = body

  if (!visitId || !customerEmail || !reportHtml) {
    return new Response(
      JSON.stringify({ error: "Missing required fields: visitId, customerEmail, reportHtml" }),
      { status: 400, headers: { ...CORS_HEADERS, "Content-Type": "application/json" } }
    )
  }

  // ── Initialize Supabase admin client for idempotency check ───────────────

  const supabaseUrl = Deno.env.get("SUPABASE_URL")!
  const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
  const supabase = createClient(supabaseUrl, supabaseServiceKey)

  // ── Idempotency check — skip if already sent ──────────────────────────────

  const { data: visitRow, error: fetchErr } = await supabase
    .from("service_visits")
    .select("email_sent_at")
    .eq("id", visitId)
    .single()

  if (fetchErr) {
    console.error("[send-service-report] Failed to fetch visit:", fetchErr)
    return new Response(
      JSON.stringify({ error: "Failed to fetch visit record" }),
      { status: 500, headers: { ...CORS_HEADERS, "Content-Type": "application/json" } }
    )
  }

  if (visitRow?.email_sent_at) {
    // Already sent — idempotent response
    console.log(`[send-service-report] Already sent for visit ${visitId} at ${visitRow.email_sent_at}`)
    return new Response(
      JSON.stringify({ success: true, alreadySent: true }),
      { status: 200, headers: { ...CORS_HEADERS, "Content-Type": "application/json" } }
    )
  }

  // ── Read Resend API key ───────────────────────────────────────────────────

  const resendApiKey = Deno.env.get("RESEND_API_KEY")
  if (!resendApiKey) {
    console.error("[send-service-report] RESEND_API_KEY not set")
    return new Response(
      JSON.stringify({ error: "Email service not configured" }),
      { status: 500, headers: { ...CORS_HEADERS, "Content-Type": "application/json" } }
    )
  }

  // ── Build subject line with today's date ─────────────────────────────────

  const dateStr = new Date().toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  })
  const subject = customSubject ?? `Service Report — ${customerName} — ${dateStr}`

  // ── Send via Resend API ───────────────────────────────────────────────────

  const resendResponse = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${resendApiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      from: `${fromName} <${fromEmail}>`,
      to: [customerEmail],
      subject,
      html: reportHtml,
    }),
  })

  if (!resendResponse.ok) {
    const errorBody = await resendResponse.text()
    console.error(
      `[send-service-report] Resend API error ${resendResponse.status}:`,
      errorBody
    )
    return new Response(
      JSON.stringify({ error: "Failed to send email", details: errorBody }),
      { status: 500, headers: { ...CORS_HEADERS, "Content-Type": "application/json" } }
    )
  }

  // ── Update email_sent_at to prevent duplicate sends ───────────────────────

  const { error: updateErr } = await supabase
    .from("service_visits")
    .update({ email_sent_at: new Date().toISOString() })
    .eq("id", visitId)

  if (updateErr) {
    // Email was sent but we couldn't update the flag — log but don't fail
    // Next call will re-send but this is an edge case
    console.error("[send-service-report] Failed to set email_sent_at:", updateErr)
  }

  console.log(`[send-service-report] Sent report for visit ${visitId} to ${customerEmail}`)

  return new Response(
    JSON.stringify({ success: true }),
    { status: 200, headers: { ...CORS_HEADERS, "Content-Type": "application/json" } }
  )
})
