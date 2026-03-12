import { NextRequest, NextResponse } from "next/server"
import { createHmac } from "crypto"
import { handleQboWebhook } from "@/actions/qbo-sync"

/**
 * POST /api/webhooks/qbo
 *
 * QuickBooks Online webhook handler.
 *
 * CRITICAL: No auth middleware -- QBO calls this directly.
 * Verification uses HMAC-SHA256 with QBO_WEBHOOK_VERIFIER_TOKEN.
 *
 * Returns 200 immediately -- QBO expects a fast response.
 * Actual processing happens after the response is sent.
 */
export async function POST(request: NextRequest) {
  try {
    const verifierToken = process.env.QBO_WEBHOOK_VERIFIER_TOKEN
    if (!verifierToken) {
      console.error("[qbo/webhook] QBO_WEBHOOK_VERIFIER_TOKEN not set")
      return NextResponse.json({ error: "Webhook not configured" }, { status: 500 })
    }

    // Read raw body for signature verification
    const rawBody = await request.text()

    // Verify webhook signature
    const signature = request.headers.get("intuit-signature")
    if (!signature) {
      console.error("[qbo/webhook] Missing intuit-signature header")
      return NextResponse.json({ error: "Missing signature" }, { status: 401 })
    }

    const hash = createHmac("sha256", verifierToken)
      .update(rawBody)
      .digest("base64")

    if (hash !== signature) {
      console.error("[qbo/webhook] Signature verification failed")
      return NextResponse.json({ error: "Invalid signature" }, { status: 401 })
    }

    // Parse payload
    const payload = JSON.parse(rawBody)
    const eventNotifications = payload.eventNotifications ?? []

    if (eventNotifications.length === 0) {
      // QBO sends a validation request with empty notifications
      return NextResponse.json({ ok: true })
    }

    // Extract realmId from first notification
    const realmId = eventNotifications[0]?.realmId
    if (!realmId) {
      return NextResponse.json({ ok: true })
    }

    // Process webhook asynchronously (fire-and-forget)
    // We respond 200 immediately as QBO requires fast response times
    handleQboWebhook(realmId, eventNotifications).catch((err) => {
      console.error("[qbo/webhook] Async processing error:", err)
    })

    return NextResponse.json({ ok: true })
  } catch (err) {
    console.error("[qbo/webhook] Error:", err)
    // Always return 200 to prevent QBO from retrying
    return NextResponse.json({ ok: true })
  }
}
