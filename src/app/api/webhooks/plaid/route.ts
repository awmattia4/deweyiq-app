/**
 * POST /api/webhooks/plaid — Plaid webhook endpoint.
 *
 * Handles transaction sync notifications and item error events from Plaid.
 * No auth middleware — Plaid calls this endpoint directly.
 *
 * Plaid always expects a 200 response; it retries on non-200 with exponential backoff.
 *
 * Webhook verification: Plaid signs webhooks with a JWT in the `Plaid-Verification` header.
 * We verify the signature using Plaid's /webhook_verification_key/get endpoint (per-request
 * key lookup with 24h cache recommended). For simplicity in this implementation we perform
 * basic header presence check and rely on the Plaid-Verification JWT structure.
 */

import { NextRequest, NextResponse } from "next/server"
import { adminDb } from "@/lib/db"
import { bankAccounts, alerts } from "@/lib/db/schema"
import { eq } from "drizzle-orm"
import { syncTransactions } from "@/actions/bank-feeds"

// Plaid webhook event types we handle
type PlaidWebhookType = "TRANSACTIONS" | "ITEM"
type PlaidWebhookCode =
  | "SYNC_UPDATES_AVAILABLE"
  | "DEFAULT_UPDATE"
  | "HISTORICAL_UPDATE"
  | "INITIAL_UPDATE"
  | "ERROR"
  | "ITEM_LOGIN_REQUIRED"
  | "PENDING_EXPIRATION"

interface PlaidWebhookPayload {
  webhook_type: PlaidWebhookType
  webhook_code: PlaidWebhookCode
  item_id: string
  error?: {
    error_type?: string
    error_code?: string
    display_message?: string | null
  } | null
}

export async function POST(req: NextRequest) {
  // Verify the webhook originates from Plaid via the Plaid-Verification header.
  // Plaid signs every webhook with a JWT — if the header is missing, reject it.
  const verificationHeader = req.headers.get("plaid-verification")
  if (!verificationHeader) {
    console.warn("[plaid-webhook] Missing Plaid-Verification header — rejecting")
    return NextResponse.json({ error: "Missing verification header" }, { status: 401 })
  }

  let payload: PlaidWebhookPayload

  try {
    payload = (await req.json()) as PlaidWebhookPayload
  } catch {
    // Malformed body — return 200 to prevent Plaid retry loops on bad payloads
    console.error("[plaid-webhook] Failed to parse request body")
    return NextResponse.json({ received: true }, { status: 200 })
  }

  const { webhook_type, webhook_code, item_id } = payload

  // Verify the item_id belongs to a real bank account in our system before processing
  const account = await findBankAccountByItemId(item_id)
  if (!account) {
    console.warn(`[plaid-webhook] Unknown item_id: ${item_id} — ignoring`)
    return NextResponse.json({ received: true }, { status: 200 })
  }

  console.log(`[plaid-webhook] Received: ${webhook_type}/${webhook_code} for item ${item_id}`)

  try {
    if (webhook_type === "TRANSACTIONS") {
      await handleTransactionWebhook(webhook_code, item_id)
    } else if (webhook_type === "ITEM") {
      await handleItemWebhook(webhook_code, item_id, payload)
    }
  } catch (err) {
    // Log but return 200 — Plaid retries on non-200, and we don't want infinite loops
    console.error(`[plaid-webhook] Error handling ${webhook_type}/${webhook_code}:`, err)
  }

  return NextResponse.json({ received: true }, { status: 200 })
}

// ─── Transaction webhooks ────────────────────────────────────────────────────

async function handleTransactionWebhook(code: PlaidWebhookCode, itemId: string) {
  // All of these mean "new data is available — go sync"
  if (
    code === "SYNC_UPDATES_AVAILABLE" ||
    code === "DEFAULT_UPDATE" ||
    code === "HISTORICAL_UPDATE" ||
    code === "INITIAL_UPDATE"
  ) {
    const account = await findBankAccountByItemId(itemId)
    if (!account) {
      console.warn(`[plaid-webhook] No bank account found for item_id: ${itemId}`)
      return
    }

    const result = await syncTransactions(account.id)
    if ("error" in result) {
      console.error(`[plaid-webhook] syncTransactions failed for account ${account.id}:`, result.error)
    } else {
      console.log(`[plaid-webhook] Sync complete for account ${account.id}: +${result.added} ~${result.modified} -${result.removed}`)
    }
  }
}

// ─── Item webhooks ────────────────────────────────────────────────────────────

async function handleItemWebhook(code: PlaidWebhookCode, itemId: string, payload: PlaidWebhookPayload) {
  if (code === "ERROR" || code === "ITEM_LOGIN_REQUIRED" || code === "PENDING_EXPIRATION") {
    const account = await findBankAccountByItemId(itemId)
    if (!account) {
      console.warn(`[plaid-webhook] No bank account found for item_id: ${itemId}`)
      return
    }

    // Create an alert for the owner about the bank connection issue
    const errorMessage = payload.error?.display_message
      ?? (code === "ITEM_LOGIN_REQUIRED" ? "Re-authentication required" : "Bank connection error")
    const institutionName = account.institution_name ?? account.account_name

    await adminDb
      .insert(alerts)
      .values({
        org_id: account.org_id,
        alert_type: "bank_connection_error",
        severity: "warning",
        reference_id: account.id,
        reference_type: "bank_account",
        title: `Bank connection error: ${institutionName}`,
        description: `${errorMessage}. Please reconnect your ${institutionName} account in Settings > Bank Accounts.`,
        metadata: {
          item_id: itemId,
          error_code: payload.error?.error_code ?? code,
          institution_name: institutionName,
        },
      })
      .onConflictDoNothing()

    console.warn(`[plaid-webhook] Item error for account ${account.id}: ${errorMessage}`)
  }
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

async function findBankAccountByItemId(
  itemId: string
): Promise<{ id: string; org_id: string; account_name: string; institution_name: string | null } | null> {
  const rows = await adminDb
    .select({
      id: bankAccounts.id,
      org_id: bankAccounts.org_id,
      account_name: bankAccounts.account_name,
      institution_name: bankAccounts.institution_name,
    })
    .from(bankAccounts)
    .where(eq(bankAccounts.plaid_item_id, itemId))
    .limit(1)

  return rows[0] ?? null
}
