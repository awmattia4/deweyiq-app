"use server"

import { createClient } from "@/lib/supabase/server"
import { adminDb, withRls } from "@/lib/db"
import type { SupabaseToken } from "@/lib/db"
import {
  bankAccounts,
  bankTransactions,
  chartOfAccounts,
} from "@/lib/db/schema"
import { and, eq, not, inArray } from "drizzle-orm"
import { plaidClient } from "@/lib/plaid/client"
import { CountryCode, Products } from "plaid"

// ─── Auth helper ──────────────────────────────────────────────────────────────

async function getRlsToken(): Promise<SupabaseToken | null> {
  const supabase = await createClient()
  const { data: claimsData } = await supabase.auth.getClaims()
  if (!claimsData?.claims) return null
  return claimsData.claims as SupabaseToken
}

async function getOwnerToken(): Promise<{ token: SupabaseToken; orgId: string; userId: string } | { error: string }> {
  const token = await getRlsToken()
  if (!token) return { error: "Not authenticated" }
  if (token.user_role !== "owner") return { error: "Owner role required" }
  if (!token.org_id) return { error: "No org found" }
  return { token, orgId: token.org_id, userId: token.sub }
}

// ─── Plaid guard ──────────────────────────────────────────────────────────────

function getPlaidClient() {
  if (!plaidClient) {
    throw new Error("Plaid is not configured. Set PLAID_CLIENT_ID, PLAID_SECRET, and PLAID_ENV.")
  }
  return plaidClient
}

// ─── Types ────────────────────────────────────────────────────────────────────

export interface BankAccountRow {
  id: string
  account_name: string
  institution_name: string | null
  mask: string | null
  account_type: string
  current_balance: string | null
  available_balance: string | null
  last_synced_at: string | null
  is_active: boolean
}

export interface PlaidLinkMetadata {
  accountId: string
  accountName: string
  accountType: string
  mask: string | null
  institutionName: string | null
}

// ─── Actions ──────────────────────────────────────────────────────────────────

/**
 * createPlaidLinkToken — Generates a Plaid Link token for the owner to initiate bank connection.
 *
 * Owner only. The link token is short-lived (30 minutes) and used to open Plaid Link UI.
 * The link token is safe to return to the client — it's ephemeral and scoped to one session.
 */
export async function createPlaidLinkToken(): Promise<{ linkToken: string } | { error: string }> {
  const auth = await getOwnerToken()
  if ("error" in auth) return auth

  try {
    const client = getPlaidClient()
    const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? "https://app.deweyiq.com"

    const response = await client.linkTokenCreate({
      user: { client_user_id: auth.userId },
      client_name: "DeweyIQ",
      products: [Products.Transactions],
      country_codes: [CountryCode.Us],
      language: "en",
      webhook: `${appUrl}/api/webhooks/plaid`,
    })

    return { linkToken: response.data.link_token }
  } catch (err) {
    console.error("[bank-feeds] createPlaidLinkToken error:", err)
    return { error: "Failed to create Plaid Link token" }
  }
}

/**
 * exchangePublicToken — Exchanges the short-lived public_token from Plaid Link for a permanent access_token.
 *
 * Owner only. Stores the access_token + item_id in bank_accounts (server-side only — never returned to client).
 * Auto-links to chart_of_accounts: finds/creates a matching asset account based on account type.
 */
export async function exchangePublicToken(
  publicToken: string,
  metadata: PlaidLinkMetadata
): Promise<{ success: true; bankAccountId: string } | { error: string }> {
  const auth = await getOwnerToken()
  if ("error" in auth) return auth

  try {
    const client = getPlaidClient()

    // Exchange the short-lived public token for a permanent access token
    const exchangeResponse = await client.itemPublicTokenExchange({ public_token: publicToken })
    const { access_token, item_id } = exchangeResponse.data

    // Auto-link to chart_of_accounts: find a matching asset account
    // Checking -> account_number starting with 1000-range, savings -> same range, credit -> liability
    let chartAccountId: string | null = null
    try {
      const accountTypeMap: Record<string, string[]> = {
        checking: ["1000", "1001", "1002", "1010"],
        savings: ["1020", "1021", "1022", "1000"],
        credit: ["2100", "2101", "2000"],
        loan: ["2200", "2201", "2000"],
      }
      const accountNumbers = accountTypeMap[metadata.accountType] ?? ["1000"]

      const coaRows = await adminDb
        .select({ id: chartOfAccounts.id, account_number: chartOfAccounts.account_number })
        .from(chartOfAccounts)
        .where(
          and(
            eq(chartOfAccounts.org_id, auth.orgId),
            eq(chartOfAccounts.is_active, true),
            inArray(chartOfAccounts.account_number, accountNumbers)
          )
        )
        .limit(1)

      if (coaRows.length > 0) {
        chartAccountId = coaRows[0].id
      }
    } catch (coaErr) {
      // Non-fatal — bank account still gets created, just without CoA link
      console.warn("[bank-feeds] CoA auto-link failed:", coaErr)
    }

    // Insert bank account row using adminDb (access_token is sensitive — use service role)
    const inserted = await adminDb
      .insert(bankAccounts)
      .values({
        org_id: auth.orgId,
        plaid_item_id: item_id,
        plaid_access_token: access_token,
        plaid_account_id: metadata.accountId,
        account_name: metadata.accountName,
        account_type: metadata.accountType,
        mask: metadata.mask,
        institution_name: metadata.institutionName,
        chart_of_accounts_id: chartAccountId,
        is_active: true,
      })
      .returning({ id: bankAccounts.id })
      .onConflictDoUpdate({
        target: bankAccounts.plaid_account_id,
        set: {
          plaid_access_token: access_token,
          plaid_item_id: item_id,
          account_name: metadata.accountName,
          institution_name: metadata.institutionName,
          is_active: true,
          updated_at: new Date(),
        },
      })

    return { success: true, bankAccountId: inserted[0].id }
  } catch (err) {
    console.error("[bank-feeds] exchangePublicToken error:", err)
    return { error: "Failed to connect bank account" }
  }
}

/**
 * syncTransactions — Pulls incremental transaction updates from Plaid and upserts into bank_transactions.
 *
 * Uses adminDb (service role) — access_token is sensitive. Handles pagination (has_more loop).
 * Updates the plaid_cursor for incremental sync on next call.
 * Returns counts of added/modified/removed transactions.
 */
export async function syncTransactions(
  bankAccountId: string
): Promise<{ added: number; modified: number; removed: number } | { error: string }> {
  try {
    const client = getPlaidClient()

    // Fetch bank account row (access_token + cursor)
    const [account] = await adminDb
      .select({
        id: bankAccounts.id,
        org_id: bankAccounts.org_id,
        plaid_access_token: bankAccounts.plaid_access_token,
        plaid_cursor: bankAccounts.plaid_cursor,
      })
      .from(bankAccounts)
      .where(eq(bankAccounts.id, bankAccountId))
      .limit(1)

    if (!account) return { error: "Bank account not found" }

    let cursor = account.plaid_cursor ?? undefined
    let hasMore = true
    let totalAdded = 0
    let totalModified = 0
    let totalRemoved = 0

    // Paginate through all available updates
    while (hasMore) {
      const response = await client.transactionsSync({
        access_token: account.plaid_access_token,
        cursor,
      })

      const { added, modified, removed, next_cursor, has_more } = response.data

      // Upsert added transactions
      if (added.length > 0) {
        await adminDb
          .insert(bankTransactions)
          .values(
            added.map((txn) => ({
              org_id: account.org_id,
              bank_account_id: account.id,
              plaid_transaction_id: txn.transaction_id,
              amount: String(txn.amount),
              date: txn.date,
              name: txn.name ?? null,
              merchant_name: txn.merchant_name ?? null,
              category: txn.personal_finance_category?.primary ?? null,
              pending: txn.pending,
              status: "unmatched" as const,
            }))
          )
          .onConflictDoUpdate({
            target: bankTransactions.plaid_transaction_id,
            set: {
              amount: bankTransactions.amount,
              name: bankTransactions.name,
              merchant_name: bankTransactions.merchant_name,
              category: bankTransactions.category,
              pending: bankTransactions.pending,
              updated_at: new Date(),
            },
          })
        totalAdded += added.length
      }

      // Upsert modified transactions
      if (modified.length > 0) {
        for (const txn of modified) {
          await adminDb
            .update(bankTransactions)
            .set({
              amount: String(txn.amount),
              name: txn.name ?? null,
              merchant_name: txn.merchant_name ?? null,
              category: txn.personal_finance_category?.primary ?? null,
              pending: txn.pending,
              updated_at: new Date(),
            })
            .where(eq(bankTransactions.plaid_transaction_id, txn.transaction_id))
        }
        totalModified += modified.length
      }

      // Remove deleted transactions
      if (removed.length > 0) {
        const removedIds = removed.map((r) => r.transaction_id)
        await adminDb
          .delete(bankTransactions)
          .where(inArray(bankTransactions.plaid_transaction_id, removedIds))
        totalRemoved += removed.length
      }

      cursor = next_cursor
      hasMore = has_more
    }

    // Update cursor + last_synced_at
    await adminDb
      .update(bankAccounts)
      .set({ plaid_cursor: cursor, last_synced_at: new Date(), updated_at: new Date() })
      .where(eq(bankAccounts.id, bankAccountId))

    return { added: totalAdded, modified: totalModified, removed: totalRemoved }
  } catch (err) {
    console.error("[bank-feeds] syncTransactions error:", err)
    return { error: "Failed to sync transactions" }
  }
}

/**
 * getBankAccounts — Returns all active bank accounts for the org.
 *
 * Owner only. CRITICAL: plaid_access_token is NEVER returned — only safe display fields.
 */
export async function getBankAccounts(): Promise<BankAccountRow[] | { error: string }> {
  const auth = await getOwnerToken()
  if ("error" in auth) return auth

  try {
    const rows = await adminDb
      .select({
        id: bankAccounts.id,
        account_name: bankAccounts.account_name,
        institution_name: bankAccounts.institution_name,
        mask: bankAccounts.mask,
        account_type: bankAccounts.account_type,
        current_balance: bankAccounts.current_balance,
        available_balance: bankAccounts.available_balance,
        last_synced_at: bankAccounts.last_synced_at,
        is_active: bankAccounts.is_active,
      })
      .from(bankAccounts)
      .where(
        and(
          eq(bankAccounts.org_id, auth.orgId),
          eq(bankAccounts.is_active, true)
        )
      )
      .orderBy(bankAccounts.created_at)

    return rows.map((row) => ({
      id: row.id,
      account_name: row.account_name,
      institution_name: row.institution_name,
      mask: row.mask,
      account_type: row.account_type,
      current_balance: row.current_balance,
      available_balance: row.available_balance,
      last_synced_at: row.last_synced_at?.toISOString() ?? null,
      is_active: row.is_active,
    }))
  } catch (err) {
    console.error("[bank-feeds] getBankAccounts error:", err)
    return { error: "Failed to load bank accounts" }
  }
}

/**
 * disconnectBankAccount — Revokes Plaid access and removes the bank account + transactions.
 *
 * Owner only. Calls Plaid /item/remove to revoke the access token, then deletes local data.
 * Even if Plaid revocation fails, local data is deleted (clean up our side).
 */
export async function disconnectBankAccount(
  bankAccountId: string
): Promise<{ success: true } | { error: string }> {
  const auth = await getOwnerToken()
  if ("error" in auth) return auth

  try {
    const client = getPlaidClient()

    // Fetch account (verify it belongs to this org)
    const [account] = await adminDb
      .select({
        id: bankAccounts.id,
        org_id: bankAccounts.org_id,
        plaid_access_token: bankAccounts.plaid_access_token,
      })
      .from(bankAccounts)
      .where(
        and(
          eq(bankAccounts.id, bankAccountId),
          eq(bankAccounts.org_id, auth.orgId)
        )
      )
      .limit(1)

    if (!account) return { error: "Bank account not found" }

    // Revoke access token in Plaid (non-fatal if it fails — we still clean up locally)
    try {
      await client.itemRemove({ access_token: account.plaid_access_token })
    } catch (plaidErr) {
      console.warn("[bank-feeds] Plaid item/remove failed (continuing with local delete):", plaidErr)
    }

    // Delete local bank transactions first (FK constraint)
    await adminDb
      .delete(bankTransactions)
      .where(eq(bankTransactions.bank_account_id, bankAccountId))

    // Delete the bank account row
    await adminDb
      .delete(bankAccounts)
      .where(eq(bankAccounts.id, bankAccountId))

    return { success: true }
  } catch (err) {
    console.error("[bank-feeds] disconnectBankAccount error:", err)
    return { error: "Failed to disconnect bank account" }
  }
}

/**
 * refreshBankBalance — Fetches current account balances from Plaid and updates the DB.
 *
 * System function (adminDb). Safe to call server-side from webhooks or scheduled jobs.
 */
export async function refreshBankBalance(
  bankAccountId: string
): Promise<{ success: true } | { error: string }> {
  try {
    const client = getPlaidClient()

    const [account] = await adminDb
      .select({
        plaid_access_token: bankAccounts.plaid_access_token,
        plaid_account_id: bankAccounts.plaid_account_id,
      })
      .from(bankAccounts)
      .where(eq(bankAccounts.id, bankAccountId))
      .limit(1)

    if (!account) return { error: "Bank account not found" }

    const response = await client.accountsBalanceGet({
      access_token: account.plaid_access_token,
      options: { account_ids: [account.plaid_account_id] },
    })

    const balanceData = response.data.accounts[0]?.balances
    if (!balanceData) return { error: "No balance data returned" }

    await adminDb
      .update(bankAccounts)
      .set({
        current_balance: balanceData.current != null ? String(balanceData.current) : null,
        available_balance: balanceData.available != null ? String(balanceData.available) : null,
        updated_at: new Date(),
      })
      .where(eq(bankAccounts.id, bankAccountId))

    return { success: true }
  } catch (err) {
    console.error("[bank-feeds] refreshBankBalance error:", err)
    return { error: "Failed to refresh balance" }
  }
}
