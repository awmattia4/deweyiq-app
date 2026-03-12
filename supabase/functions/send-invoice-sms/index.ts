// Deno Edge Function — send-invoice-sms
//
// Sends SMS notifications for invoices and quotes via Twilio REST API.
// Single Edge Function handles both types to avoid duplicate functions.
//
// For type='invoice': sends payment link SMS
// For type='quote': sends approval link SMS
//
// Security:
// - TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN, TWILIO_PHONE_NUMBER read from Deno env secrets
//
// Deployment:
//   supabase functions deploy send-invoice-sms
//   supabase secrets set TWILIO_ACCOUNT_SID=xxx TWILIO_AUTH_TOKEN=xxx TWILIO_PHONE_NUMBER=+1xxx
//
// CRITICAL: Do NOT import the Twilio npm package — it does not work in Deno.
// Use raw fetch + URLSearchParams + btoa for HTTP Basic auth (verified community pattern).

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface RequestBody {
  phone: string
  paymentUrl?: string
  approvalUrl?: string
  invoiceNumber?: string
  quoteNumber?: string
  total?: string
  companyName: string
  type: "invoice" | "quote"
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

  const { phone, companyName, type } = body

  if (!phone || !companyName || !type) {
    return new Response(
      JSON.stringify({ error: "Missing required fields: phone, companyName, type" }),
      { status: 400, headers: { ...CORS_HEADERS, "Content-Type": "application/json" } }
    )
  }

  // ── Read env vars ─────────────────────────────────────────────────────────

  const accountSid = Deno.env.get("TWILIO_ACCOUNT_SID")
  const authToken = Deno.env.get("TWILIO_AUTH_TOKEN")
  const fromPhone = Deno.env.get("TWILIO_PHONE_NUMBER")

  if (!accountSid || !authToken || !fromPhone) {
    console.error("[send-invoice-sms] Twilio credentials not configured")
    return new Response(
      JSON.stringify({ error: "SMS service not configured" }),
      { status: 500, headers: { ...CORS_HEADERS, "Content-Type": "application/json" } }
    )
  }

  // ── Compose SMS body ───────────────────────────────────────────────────────

  let smsBody: string

  if (type === "invoice") {
    const { paymentUrl, invoiceNumber, total } = body
    if (!paymentUrl || !invoiceNumber) {
      return new Response(
        JSON.stringify({ error: "Missing required fields for invoice SMS: paymentUrl, invoiceNumber" }),
        { status: 400, headers: { ...CORS_HEADERS, "Content-Type": "application/json" } }
      )
    }
    smsBody = `${companyName}: Invoice ${invoiceNumber} for ${total ?? "your balance"} is ready. Pay online: ${paymentUrl}`
  } else if (type === "quote") {
    const { approvalUrl, quoteNumber } = body
    if (!approvalUrl || !quoteNumber) {
      return new Response(
        JSON.stringify({ error: "Missing required fields for quote SMS: approvalUrl, quoteNumber" }),
        { status: 400, headers: { ...CORS_HEADERS, "Content-Type": "application/json" } }
      )
    }
    smsBody = `${companyName}: You have a new quote (${quoteNumber}) ready for review. View & approve: ${approvalUrl}`
  } else {
    return new Response(
      JSON.stringify({ error: "Invalid type — must be 'invoice' or 'quote'" }),
      { status: 400, headers: { ...CORS_HEADERS, "Content-Type": "application/json" } }
    )
  }

  // ── Send via Twilio REST API ──────────────────────────────────────────────

  try {
    const twilioUrl = `https://api.twilio.com/2010-04-01/Accounts/${accountSid}/Messages.json`
    const credentials = btoa(`${accountSid}:${authToken}`)

    const params = new URLSearchParams()
    params.append("To", phone)
    params.append("From", fromPhone)
    params.append("Body", smsBody)

    const twilioResponse = await fetch(twilioUrl, {
      method: "POST",
      headers: {
        Authorization: `Basic ${credentials}`,
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body: params,
    })

    if (twilioResponse.ok) {
      console.log(`[send-invoice-sms] ${type} SMS sent to ${phone}`)
      return new Response(
        JSON.stringify({ success: true, type }),
        { status: 200, headers: { ...CORS_HEADERS, "Content-Type": "application/json" } }
      )
    } else {
      const errorBody = await twilioResponse.text()
      console.error(`[send-invoice-sms] Twilio error (${twilioResponse.status}): ${errorBody}`)
      return new Response(
        JSON.stringify({
          error: `SMS delivery failed (${twilioResponse.status})`,
          details: errorBody,
        }),
        { status: 500, headers: { ...CORS_HEADERS, "Content-Type": "application/json" } }
      )
    }
  } catch (err) {
    console.error(`[send-invoice-sms] Exception:`, err)
    return new Response(
      JSON.stringify({ error: `SMS delivery exception: ${err}` }),
      { status: 500, headers: { ...CORS_HEADERS, "Content-Type": "application/json" } }
    )
  }
})
