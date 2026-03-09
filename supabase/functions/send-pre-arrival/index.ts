// Deno Edge Function — send-pre-arrival
//
// Sends pre-arrival notifications to customers before the tech arrives.
// Primary channel: SMS via Twilio REST API
// Fallback channel: Email via Resend API
//
// Security:
// - TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN, TWILIO_PHONE_NUMBER read from Deno env secrets
// - RESEND_API_KEY read from Deno env secrets
// - Uses Supabase service role to update pre_arrival_sent_at after successful send
//
// Idempotency:
// - pre_arrival_sent_at is updated per stop after successful send
// - The calling server action should check pre_arrival_sent_at before calling
// - This function also skips stops where notificationsEnabled is false (safety net)
//
// Deployment:
//   supabase functions deploy send-pre-arrival
//   supabase secrets set TWILIO_ACCOUNT_SID=xxx TWILIO_AUTH_TOKEN=xxx TWILIO_PHONE_NUMBER=+1xxx
//
// CRITICAL: Do NOT import the Twilio npm package — it does not work in Deno.
// Use raw fetch + URLSearchParams + btoa for HTTP Basic auth (verified community pattern).

import { createClient } from "jsr:@supabase/supabase-js@2"

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface StopRequest {
  stopId: string              // route_stop id for pre_arrival_sent_at update
  customerName: string
  customerPhone: string | null
  customerEmail: string | null
  stopNumber: number          // position in route (e.g., 3) for the message
  notificationsEnabled: boolean
}

interface RequestBody {
  orgId: string
  techName: string
  stops: StopRequest[]
}

interface SendResult {
  stopId: string
  channel: "sms" | "email" | "skipped"
  success: boolean
  error?: string
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

  const { orgId, techName, stops } = body

  if (!orgId || !techName || !stops || !Array.isArray(stops) || stops.length === 0) {
    return new Response(
      JSON.stringify({ error: "Missing required fields: orgId, techName, stops[]" }),
      { status: 400, headers: { ...CORS_HEADERS, "Content-Type": "application/json" } }
    )
  }

  // ── Read env vars ─────────────────────────────────────────────────────────

  const supabaseUrl = Deno.env.get("SUPABASE_URL")!
  const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
  const accountSid = Deno.env.get("TWILIO_ACCOUNT_SID")
  const authToken = Deno.env.get("TWILIO_AUTH_TOKEN")
  const fromPhone = Deno.env.get("TWILIO_PHONE_NUMBER")
  const resendApiKey = Deno.env.get("RESEND_API_KEY")

  const twilioConfigured = !!(accountSid && authToken && fromPhone)
  const resendConfigured = !!resendApiKey

  // ── Initialize Supabase admin client ─────────────────────────────────────

  const supabase = createClient(supabaseUrl, supabaseServiceKey)

  // ── Process each stop ────────────────────────────────────────────────────

  const results: SendResult[] = []

  for (const stop of stops) {
    // Safety net: skip stops with notifications disabled
    if (!stop.notificationsEnabled) {
      results.push({ stopId: stop.stopId, channel: "skipped", success: true })
      continue
    }

    // Compose the message text (same content for SMS and email body)
    const messageText = `Hi ${stop.customerName}, your pool tech ${techName} is heading your way. You're stop #${stop.stopNumber} on today's route.`

    let sent = false
    let channel: "sms" | "email" | "skipped" = "skipped"
    let sendError: string | undefined

    // ── Try SMS first (Twilio REST API with HTTP Basic auth) ─────────────────

    if (stop.customerPhone && twilioConfigured) {
      try {
        // CRITICAL: Use raw fetch + URLSearchParams + btoa — no Twilio npm package in Deno
        const twilioUrl = `https://api.twilio.com/2010-04-01/Accounts/${accountSid}/Messages.json`
        const credentials = btoa(`${accountSid}:${authToken}`)

        const params = new URLSearchParams()
        params.append("To", stop.customerPhone)
        params.append("From", fromPhone!)
        params.append("Body", messageText)

        const twilioResponse = await fetch(twilioUrl, {
          method: "POST",
          headers: {
            Authorization: `Basic ${credentials}`,
            "Content-Type": "application/x-www-form-urlencoded",
          },
          body: params,
        })

        if (twilioResponse.ok) {
          sent = true
          channel = "sms"
          console.log(`[send-pre-arrival] SMS sent to ${stop.customerPhone} for stop ${stop.stopId}`)
        } else {
          const errorBody = await twilioResponse.text()
          sendError = `Twilio SMS failed (${twilioResponse.status}): ${errorBody}`
          console.error(`[send-pre-arrival] ${sendError}`)
        }
      } catch (err) {
        sendError = `Twilio SMS exception: ${err}`
        console.error(`[send-pre-arrival] ${sendError}`)
      }
    }

    // ── Fallback to email if SMS not sent ────────────────────────────────────

    if (!sent && stop.customerEmail && resendConfigured) {
      try {
        const emailHtml = `
          <p>Hi ${stop.customerName},</p>
          <p>Your pool tech <strong>${techName}</strong> is heading your way.</p>
          <p>You're stop <strong>#${stop.stopNumber}</strong> on today's route.</p>
          <p>They'll be there soon — make sure your gate is accessible.</p>
        `

        const resendResponse = await fetch("https://api.resend.com/emails", {
          method: "POST",
          headers: {
            Authorization: `Bearer ${resendApiKey}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            from: "Pool Company <notifications@poolco.app>",
            to: [stop.customerEmail],
            subject: `Your pool tech ${techName} is on the way`,
            html: emailHtml,
          }),
        })

        if (resendResponse.ok) {
          sent = true
          channel = "email"
          sendError = undefined
          console.log(`[send-pre-arrival] Email sent to ${stop.customerEmail} for stop ${stop.stopId}`)
        } else {
          const errorBody = await resendResponse.text()
          const emailError = `Resend email failed (${resendResponse.status}): ${errorBody}`
          // Keep original SMS error if present, append email error
          sendError = sendError ? `${sendError}; ${emailError}` : emailError
          console.error(`[send-pre-arrival] ${emailError}`)
        }
      } catch (err) {
        const emailError = `Resend email exception: ${err}`
        sendError = sendError ? `${sendError}; ${emailError}` : emailError
        console.error(`[send-pre-arrival] ${emailError}`)
      }
    }

    // ── No contact info available — skip ──────────────────────────────────────

    if (!sent && !stop.customerPhone && !stop.customerEmail) {
      results.push({ stopId: stop.stopId, channel: "skipped", success: true })
      continue
    }

    // ── Update pre_arrival_sent_at after successful send ──────────────────────

    if (sent) {
      const { error: updateErr } = await supabase
        .from("route_stops")
        .update({ pre_arrival_sent_at: new Date().toISOString() })
        .eq("id", stop.stopId)

      if (updateErr) {
        // Notification was sent but couldn't update the flag — log but don't fail
        // Next call may re-send (acceptable edge case)
        console.error(`[send-pre-arrival] Failed to set pre_arrival_sent_at for stop ${stop.stopId}:`, updateErr)
      }

      results.push({ stopId: stop.stopId, channel, success: true })
    } else {
      results.push({ stopId: stop.stopId, channel: "skipped", success: false, error: sendError })
    }
  }

  // ── Build response ────────────────────────────────────────────────────────

  const sentCount = results.filter((r) => r.success && r.channel !== "skipped").length
  const skippedCount = results.filter((r) => r.channel === "skipped").length
  const failedCount = results.filter((r) => !r.success).length

  console.log(
    `[send-pre-arrival] Completed: ${sentCount} sent, ${skippedCount} skipped, ${failedCount} failed`
  )

  return new Response(
    JSON.stringify({
      success: true,
      sentCount,
      skippedCount,
      failedCount,
      results,
    }),
    { status: 200, headers: { ...CORS_HEADERS, "Content-Type": "application/json" } }
  )
})
