"use server"

/**
 * reconciliation.ts — Server actions for bank transaction reconciliation.
 *
 * All actions are owner-only (bank account access is sensitive data).
 *
 * Key operations:
 * - View reconciliation status of bank transactions
 * - Confirm matches between bank transactions and journal entries
 * - Unmatch / exclude transactions
 * - Create journal entries from unmatched transactions
 * - Run batch auto-matching
 */

import { createClient } from "@/lib/supabase/server"
import { adminDb, withRls } from "@/lib/db"
import type { SupabaseToken } from "@/lib/db"
import {
  bankTransactions,
  bankAccounts,
  journalEntries,
  journalEntryLines,
  chartOfAccounts,
} from "@/lib/db/schema"
import { and, desc, eq, inArray, sql } from "drizzle-orm"
import {
  matchBankTransaction,
  autoMatchTransactions,
  scoreBankTransactionMatch,
} from "@/lib/accounting/reconciliation"
import type { MatchScore } from "@/lib/accounting/reconciliation"
import { createJournalEntry } from "@/lib/accounting/journal"
import { ensureChartOfAccounts } from "@/lib/accounting/journal"

// ─── Auth helpers ──────────────────────────────────────────────────────────────

async function getRlsToken(): Promise<SupabaseToken | null> {
  const supabase = await createClient()
  const { data: claimsData } = await supabase.auth.getClaims()
  if (!claimsData?.claims) return null
  return claimsData.claims as SupabaseToken
}

async function getOwnerToken(): Promise<
  { token: SupabaseToken; orgId: string; userId: string } | { error: string }
> {
  const token = await getRlsToken()
  if (!token) return { error: "Not authenticated" }
  if (token.user_role !== "owner") return { error: "Owner role required for reconciliation" }
  if (!token.org_id) return { error: "No org found" }
  return { token, orgId: token.org_id as string, userId: token.sub as string }
}

// ─── Types ────────────────────────────────────────────────────────────────────

export interface BankTransactionRow {
  id: string
  org_id: string
  bank_account_id: string
  amount: string
  date: string
  name: string | null
  merchant_name: string | null
  category: string | null
  pending: boolean
  status: "unmatched" | "matched" | "excluded"
  matched_entry_id: string | null
  matched_at: string | null
  /** For matched transactions — basic journal entry info */
  matchedEntry?: {
    id: string
    description: string
    entry_date: string
    source_type: string
    source_id: string | null
  }
  /** For unmatched/suggested transactions — top suggested matches */
  suggestions?: MatchScore[]
}

export interface ReconciliationViewResult {
  transactions: BankTransactionRow[]
  total: number
  stats: {
    total: number
    matched: number
    suggested: number
    unmatched: number
    excluded: number
  }
}

// ─── getReconciliationView ─────────────────────────────────────────────────────

/**
 * Returns bank transactions for an account with reconciliation status.
 *
 * Owner only. Includes:
 * - matched entries with journal entry details
 * - suggested matches (scored 50–79) — computed on-demand for unmatched txns
 * - unmatched transactions
 * - excluded transactions
 *
 * For performance, suggestions are only computed when status filter includes unmatched.
 */
export async function getReconciliationView(
  bankAccountId: string,
  filters?: {
    status?: "all" | "unmatched" | "matched" | "excluded" | "suggested"
    startDate?: string
    endDate?: string
    limit?: number
    offset?: number
  }
): Promise<
  | { success: true; data: ReconciliationViewResult }
  | { success: false; error: string }
> {
  const auth = await getOwnerToken()
  if ("error" in auth) return { success: false, error: auth.error }

  const { orgId, token } = auth

  try {
    // Verify bank account belongs to this org
    const [account] = await adminDb
      .select({ id: bankAccounts.id, org_id: bankAccounts.org_id })
      .from(bankAccounts)
      .where(and(eq(bankAccounts.id, bankAccountId), eq(bankAccounts.org_id, orgId)))
      .limit(1)

    if (!account) return { success: false, error: "Bank account not found" }

    const pageLimit = filters?.limit ?? 50
    const pageOffset = filters?.offset ?? 0

    // Build status filter
    const statusFilter = filters?.status
    const statusValues: string[] = []

    if (!statusFilter || statusFilter === "all") {
      // No filter — return all
    } else if (statusFilter === "suggested") {
      // "Suggested" means unmatched transactions that have potential matches
      // We'll fetch unmatched and filter by whether they have suggestions
      statusValues.push("unmatched")
    } else {
      statusValues.push(statusFilter)
    }

    // Fetch transactions
    const conditions = [
      eq(bankTransactions.bank_account_id, bankAccountId),
    ]

    if (statusValues.length > 0) {
      conditions.push(inArray(bankTransactions.status, statusValues))
    }

    if (filters?.startDate) {
      conditions.push(sql`${bankTransactions.date} >= ${filters.startDate}`)
    }
    if (filters?.endDate) {
      conditions.push(sql`${bankTransactions.date} <= ${filters.endDate}`)
    }

    const txnRows = await adminDb
      .select({
        id: bankTransactions.id,
        org_id: bankTransactions.org_id,
        bank_account_id: bankTransactions.bank_account_id,
        amount: bankTransactions.amount,
        date: bankTransactions.date,
        name: bankTransactions.name,
        merchant_name: bankTransactions.merchant_name,
        category: bankTransactions.category,
        pending: bankTransactions.pending,
        status: bankTransactions.status,
        matched_entry_id: bankTransactions.matched_entry_id,
        matched_at: bankTransactions.matched_at,
      })
      .from(bankTransactions)
      .where(and(...conditions))
      .orderBy(desc(bankTransactions.date), desc(bankTransactions.created_at))
      .limit(pageLimit)
      .offset(pageOffset)

    // Fetch matched journal entries for matched transactions
    const matchedEntryIds = txnRows
      .filter((t) => t.matched_entry_id)
      .map((t) => t.matched_entry_id!)

    const matchedEntryMap = new Map<
      string,
      { id: string; description: string; entry_date: string; source_type: string; source_id: string | null }
    >()

    if (matchedEntryIds.length > 0) {
      const entryRows = await adminDb
        .select({
          id: journalEntries.id,
          description: journalEntries.description,
          entry_date: journalEntries.entry_date,
          source_type: journalEntries.source_type,
          source_id: journalEntries.source_id,
        })
        .from(journalEntries)
        .where(
          and(
            eq(journalEntries.org_id, orgId),
            inArray(journalEntries.id, matchedEntryIds)
          )
        )

      for (const entry of entryRows) {
        matchedEntryMap.set(entry.id, {
          id: entry.id,
          description: entry.description,
          entry_date: entry.entry_date,
          source_type: entry.source_type,
          source_id: entry.source_id ?? null,
        })
      }
    }

    // For unmatched transactions, compute suggestions
    // (skip this for large datasets or when filtering to matched/excluded)
    const shouldComputeSuggestions =
      !statusFilter ||
      statusFilter === "all" ||
      statusFilter === "unmatched" ||
      statusFilter === "suggested"

    const suggestionMap = new Map<string, MatchScore[]>()

    if (shouldComputeSuggestions) {
      const unmatchedTxns = txnRows.filter((t) => t.status === "unmatched" && !t.pending)

      if (unmatchedTxns.length > 0) {
        // Fetch all unmatched journal entries for the org (once)
        const entryRows = await adminDb
          .select({
            id: journalEntries.id,
            org_id: journalEntries.org_id,
            entry_date: journalEntries.entry_date,
            description: journalEntries.description,
            source_type: journalEntries.source_type,
            source_id: journalEntries.source_id,
            net_amount: sql<string>`
              COALESCE(
                (SELECT SUM(jel.amount::numeric) FROM journal_entry_lines jel
                 WHERE jel.journal_entry_id = ${journalEntries.id}
                 AND jel.amount::numeric > 0),
                0
              )::text
            `,
          })
          .from(journalEntries)
          .where(
            and(
              eq(journalEntries.org_id, orgId),
              eq(journalEntries.is_reversed, false),
              sql`NOT EXISTS (
                SELECT 1 FROM bank_transactions bt
                WHERE bt.matched_entry_id = ${journalEntries.id}
                AND bt.status = 'matched'
              )`
            )
          )

        for (const txn of unmatchedTxns) {
          const scores = entryRows
            .map((entry) =>
              scoreBankTransactionMatch(
                {
                  id: txn.id,
                  org_id: txn.org_id,
                  amount: txn.amount,
                  date: txn.date,
                  name: txn.name,
                  merchant_name: txn.merchant_name,
                  category: txn.category,
                  status: txn.status,
                },
                entry as Parameters<typeof scoreBankTransactionMatch>[1]
              )
            )
            .filter((m) => m.score >= 50 && m.score < 80) // Suggestions only (auto-match range excluded)
            .sort((a, b) => b.score - a.score)
            .slice(0, 3)

          if (scores.length > 0) {
            suggestionMap.set(txn.id, scores)
          }
        }
      }
    }

    // Count total
    const [countRow] = await adminDb
      .select({ count: sql<string>`COUNT(*)::text` })
      .from(bankTransactions)
      .where(and(...conditions))

    const total = parseInt(countRow?.count ?? "0", 10)

    // Get overall stats for this account
    const statsRows = await adminDb
      .select({
        status: bankTransactions.status,
        count: sql<string>`COUNT(*)::text`,
      })
      .from(bankTransactions)
      .where(eq(bankTransactions.bank_account_id, bankAccountId))
      .groupBy(bankTransactions.status)

    const statsMap = new Map(statsRows.map((r) => [r.status, parseInt(r.count, 10)]))
    const matchedCount = statsMap.get("matched") ?? 0
    const unmatchedCount = statsMap.get("unmatched") ?? 0
    const excludedCount = statsMap.get("excluded") ?? 0
    const totalCount = matchedCount + unmatchedCount + excludedCount

    // Determine how many unmatched have suggestions (approximate — from current page)
    const suggestedCount = suggestionMap.size

    // Build result rows
    let transactions: BankTransactionRow[] = txnRows.map((txn) => ({
      id: txn.id,
      org_id: txn.org_id,
      bank_account_id: txn.bank_account_id,
      amount: txn.amount,
      date: txn.date,
      name: txn.name,
      merchant_name: txn.merchant_name,
      category: txn.category,
      pending: txn.pending,
      status: txn.status as BankTransactionRow["status"],
      matched_entry_id: txn.matched_entry_id ?? null,
      matched_at: txn.matched_at?.toISOString() ?? null,
      matchedEntry: txn.matched_entry_id
        ? matchedEntryMap.get(txn.matched_entry_id)
        : undefined,
      suggestions: suggestionMap.get(txn.id),
    }))

    // If filtering by "suggested", only return transactions that have suggestions
    if (statusFilter === "suggested") {
      transactions = transactions.filter((t) => (t.suggestions?.length ?? 0) > 0)
    }

    return {
      success: true,
      data: {
        transactions,
        total,
        stats: {
          total: totalCount,
          matched: matchedCount,
          suggested: suggestedCount,
          unmatched: unmatchedCount,
          excluded: excludedCount,
        },
      },
    }
  } catch (err) {
    console.error("[getReconciliationView] Error:", err)
    return {
      success: false,
      error: err instanceof Error ? err.message : "Failed to load reconciliation view",
    }
  }
}

// ─── confirmMatch ──────────────────────────────────────────────────────────────

/**
 * Confirms a match between a bank transaction and a journal entry.
 *
 * Owner only. Validates:
 * - Neither the bank transaction nor the journal entry is already matched elsewhere.
 * - Both belong to the same org.
 */
export async function confirmMatch(
  bankTxnId: string,
  journalEntryId: string
): Promise<{ success: boolean; error?: string }> {
  const auth = await getOwnerToken()
  if ("error" in auth) return { success: false, error: auth.error }

  const { orgId } = auth

  try {
    // Fetch bank transaction
    const [txn] = await adminDb
      .select({
        id: bankTransactions.id,
        org_id: bankTransactions.org_id,
        status: bankTransactions.status,
        matched_entry_id: bankTransactions.matched_entry_id,
      })
      .from(bankTransactions)
      .where(and(eq(bankTransactions.id, bankTxnId), eq(bankTransactions.org_id, orgId)))
      .limit(1)

    if (!txn) return { success: false, error: "Bank transaction not found" }

    if (txn.status === "matched") {
      return { success: false, error: "This transaction is already matched" }
    }

    if (txn.status === "excluded") {
      return { success: false, error: "Cannot match an excluded transaction. Restore it first." }
    }

    // Fetch journal entry
    const [entry] = await adminDb
      .select({ id: journalEntries.id, org_id: journalEntries.org_id })
      .from(journalEntries)
      .where(and(eq(journalEntries.id, journalEntryId), eq(journalEntries.org_id, orgId)))
      .limit(1)

    if (!entry) return { success: false, error: "Journal entry not found" }

    // Check if journal entry is already matched to another transaction
    const [alreadyMatched] = await adminDb
      .select({ id: bankTransactions.id })
      .from(bankTransactions)
      .where(
        and(
          eq(bankTransactions.matched_entry_id, journalEntryId),
          eq(bankTransactions.status, "matched")
        )
      )
      .limit(1)

    if (alreadyMatched && alreadyMatched.id !== bankTxnId) {
      return {
        success: false,
        error: "This journal entry is already matched to another transaction",
      }
    }

    // Confirm the match
    await adminDb
      .update(bankTransactions)
      .set({
        status: "matched",
        matched_entry_id: journalEntryId,
        matched_at: new Date(),
        updated_at: new Date(),
      })
      .where(eq(bankTransactions.id, bankTxnId))

    return { success: true }
  } catch (err) {
    console.error("[confirmMatch] Error:", err)
    return {
      success: false,
      error: err instanceof Error ? err.message : "Failed to confirm match",
    }
  }
}

// ─── unmatchTransaction ────────────────────────────────────────────────────────

/**
 * Breaks an existing match, returning the transaction to "unmatched" status.
 *
 * Owner only.
 */
export async function unmatchTransaction(
  bankTxnId: string
): Promise<{ success: boolean; error?: string }> {
  const auth = await getOwnerToken()
  if ("error" in auth) return { success: false, error: auth.error }

  const { orgId } = auth

  try {
    const [txn] = await adminDb
      .select({ id: bankTransactions.id, status: bankTransactions.status })
      .from(bankTransactions)
      .where(and(eq(bankTransactions.id, bankTxnId), eq(bankTransactions.org_id, orgId)))
      .limit(1)

    if (!txn) return { success: false, error: "Bank transaction not found" }

    if (txn.status !== "matched") {
      return { success: false, error: "Transaction is not currently matched" }
    }

    await adminDb
      .update(bankTransactions)
      .set({
        status: "unmatched",
        matched_entry_id: null,
        matched_at: null,
        updated_at: new Date(),
      })
      .where(eq(bankTransactions.id, bankTxnId))

    return { success: true }
  } catch (err) {
    console.error("[unmatchTransaction] Error:", err)
    return {
      success: false,
      error: err instanceof Error ? err.message : "Failed to unmatch transaction",
    }
  }
}

// ─── excludeTransaction ────────────────────────────────────────────────────────

/**
 * Marks a bank transaction as excluded from reconciliation.
 *
 * Owner only. Use for:
 * - Transfers between own accounts
 * - Personal charges on business card
 * - Any transaction that doesn't need a journal entry match
 *
 * Excluded transactions are hidden from "unmatched" views but still accessible
 * via the "Excluded" filter.
 */
export async function excludeTransaction(
  bankTxnId: string
): Promise<{ success: boolean; error?: string }> {
  const auth = await getOwnerToken()
  if ("error" in auth) return { success: false, error: auth.error }

  const { orgId } = auth

  try {
    const [txn] = await adminDb
      .select({ id: bankTransactions.id, status: bankTransactions.status })
      .from(bankTransactions)
      .where(and(eq(bankTransactions.id, bankTxnId), eq(bankTransactions.org_id, orgId)))
      .limit(1)

    if (!txn) return { success: false, error: "Bank transaction not found" }

    if (txn.status === "excluded") {
      return { success: false, error: "Transaction is already excluded" }
    }

    await adminDb
      .update(bankTransactions)
      .set({
        status: "excluded",
        // Clear any existing match when excluding
        matched_entry_id: null,
        matched_at: null,
        updated_at: new Date(),
      })
      .where(eq(bankTransactions.id, bankTxnId))

    return { success: true }
  } catch (err) {
    console.error("[excludeTransaction] Error:", err)
    return {
      success: false,
      error: err instanceof Error ? err.message : "Failed to exclude transaction",
    }
  }
}

// ─── restoreTransaction ────────────────────────────────────────────────────────

/**
 * Restores an excluded transaction back to unmatched status.
 *
 * Owner only.
 */
export async function restoreTransaction(
  bankTxnId: string
): Promise<{ success: boolean; error?: string }> {
  const auth = await getOwnerToken()
  if ("error" in auth) return { success: false, error: auth.error }

  const { orgId } = auth

  try {
    const [txn] = await adminDb
      .select({ id: bankTransactions.id, status: bankTransactions.status })
      .from(bankTransactions)
      .where(and(eq(bankTransactions.id, bankTxnId), eq(bankTransactions.org_id, orgId)))
      .limit(1)

    if (!txn) return { success: false, error: "Bank transaction not found" }

    if (txn.status !== "excluded") {
      return { success: false, error: "Transaction is not currently excluded" }
    }

    await adminDb
      .update(bankTransactions)
      .set({
        status: "unmatched",
        updated_at: new Date(),
      })
      .where(eq(bankTransactions.id, bankTxnId))

    return { success: true }
  } catch (err) {
    console.error("[restoreTransaction] Error:", err)
    return {
      success: false,
      error: err instanceof Error ? err.message : "Failed to restore transaction",
    }
  }
}

// ─── createEntryFromTransaction ────────────────────────────────────────────────

/**
 * Creates a journal entry from an unmatched bank transaction and immediately matches them.
 *
 * Owner only. Used for transactions that represent new expenses not yet in the books.
 *
 * Creates a balanced entry:
 *   Dr: selected expense/account         +amount
 *   Cr: bank account in chart of accounts -amount
 *
 * Then auto-matches the new entry to the bank transaction.
 */
export async function createEntryFromTransaction(
  bankTxnId: string,
  debitAccountId: string,
  description: string
): Promise<{ success: boolean; journalEntryId?: string; error?: string }> {
  const auth = await getOwnerToken()
  if ("error" in auth) return { success: false, error: auth.error }

  const { orgId } = auth

  try {
    // Fetch bank transaction
    const [txn] = await adminDb
      .select({
        id: bankTransactions.id,
        org_id: bankTransactions.org_id,
        bank_account_id: bankTransactions.bank_account_id,
        amount: bankTransactions.amount,
        date: bankTransactions.date,
        status: bankTransactions.status,
      })
      .from(bankTransactions)
      .where(and(eq(bankTransactions.id, bankTxnId), eq(bankTransactions.org_id, orgId)))
      .limit(1)

    if (!txn) return { success: false, error: "Bank transaction not found" }

    if (txn.status === "matched") {
      return { success: false, error: "Transaction is already matched" }
    }

    // Look up the credit account: the bank account's linked CoA account
    const [bankAccRow] = await adminDb
      .select({
        chart_of_accounts_id: bankAccounts.chart_of_accounts_id,
      })
      .from(bankAccounts)
      .where(eq(bankAccounts.id, txn.bank_account_id))
      .limit(1)

    // Ensure CoA is seeded
    await ensureChartOfAccounts(orgId)

    // Get credit account (bank account CoA link, fallback to account 1000 Checking)
    let creditAccountId = bankAccRow?.chart_of_accounts_id

    if (!creditAccountId) {
      // Fallback: find the checking account by number
      const [checkingAccount] = await adminDb
        .select({ id: chartOfAccounts.id })
        .from(chartOfAccounts)
        .where(
          and(
            eq(chartOfAccounts.org_id, orgId),
            eq(chartOfAccounts.account_number, "1000"),
            eq(chartOfAccounts.is_active, true)
          )
        )
        .limit(1)

      creditAccountId = checkingAccount?.id ?? null
    }

    if (!creditAccountId) {
      return { success: false, error: "Could not find bank account in chart of accounts" }
    }

    // Verify the debit account exists
    const [debitAccount] = await adminDb
      .select({ id: chartOfAccounts.id, account_name: chartOfAccounts.account_name })
      .from(chartOfAccounts)
      .where(and(eq(chartOfAccounts.id, debitAccountId), eq(chartOfAccounts.org_id, orgId)))
      .limit(1)

    if (!debitAccount) return { success: false, error: "Selected account not found" }

    const amount = Math.abs(parseFloat(txn.amount))

    if (isNaN(amount) || amount <= 0) {
      return { success: false, error: "Invalid transaction amount" }
    }

    // Create journal entry
    const journalEntryId = await createJournalEntry({
      orgId,
      entryDate: txn.date,
      description: description || `Bank transaction: ${txn.date}`,
      sourceType: "manual",
      lines: [
        {
          accountId: debitAccountId,
          amount: amount.toFixed(2), // Dr: positive = debit
          description: description,
        },
        {
          accountId: creditAccountId,
          amount: (-amount).toFixed(2), // Cr: negative = credit
          description: `Bank transaction ${txn.date}`,
        },
      ],
    })

    // Auto-match the new entry to this bank transaction
    await adminDb
      .update(bankTransactions)
      .set({
        status: "matched",
        matched_entry_id: journalEntryId,
        matched_at: new Date(),
        updated_at: new Date(),
      })
      .where(eq(bankTransactions.id, bankTxnId))

    return { success: true, journalEntryId }
  } catch (err) {
    console.error("[createEntryFromTransaction] Error:", err)
    return {
      success: false,
      error: err instanceof Error ? err.message : "Failed to create entry from transaction",
    }
  }
}

// ─── runAutoMatch ──────────────────────────────────────────────────────────────

/**
 * Triggers batch auto-matching for a bank account.
 *
 * Owner only. Runs autoMatchTransactions and returns counts.
 */
export async function runAutoMatch(
  bankAccountId: string
): Promise<
  | { success: true; autoMatched: number; suggestedReview: number; unmatched: number }
  | { success: false; error: string }
> {
  const auth = await getOwnerToken()
  if ("error" in auth) return { success: false, error: auth.error }

  const { orgId } = auth

  try {
    // Verify account belongs to this org
    const [account] = await adminDb
      .select({ id: bankAccounts.id })
      .from(bankAccounts)
      .where(and(eq(bankAccounts.id, bankAccountId), eq(bankAccounts.org_id, orgId)))
      .limit(1)

    if (!account) return { success: false, error: "Bank account not found" }

    const result = await autoMatchTransactions(bankAccountId)

    return { success: true, ...result }
  } catch (err) {
    console.error("[runAutoMatch] Error:", err)
    return {
      success: false,
      error: err instanceof Error ? err.message : "Failed to run auto-match",
    }
  }
}

// ─── getTransactionSuggestions ─────────────────────────────────────────────────

/**
 * Returns scored match suggestions for a specific bank transaction.
 *
 * Owner only. Used by ReconcilePanel to show options when user clicks a transaction.
 */
export async function getTransactionSuggestions(
  bankTxnId: string
): Promise<
  | { success: true; suggestions: MatchScore[]; bankTxn: { id: string; amount: string; date: string; name: string | null } }
  | { success: false; error: string }
> {
  const auth = await getOwnerToken()
  if ("error" in auth) return { success: false, error: auth.error }

  const { orgId } = auth

  try {
    const result = await matchBankTransaction(bankTxnId, orgId)

    if ("error" in result) {
      return { success: false, error: result.error }
    }

    return {
      success: true,
      suggestions: result.matches,
      bankTxn: {
        id: result.bankTxn.id,
        amount: result.bankTxn.amount,
        date: result.bankTxn.date,
        name: result.bankTxn.name,
      },
    }
  } catch (err) {
    console.error("[getTransactionSuggestions] Error:", err)
    return {
      success: false,
      error: err instanceof Error ? err.message : "Failed to get suggestions",
    }
  }
}

// ─── getBankAccountsForReconciliation ─────────────────────────────────────────

/**
 * Returns bank accounts for the account selector dropdown.
 *
 * Owner only. Returns id, name, institution, type — no sensitive data.
 */
export async function getBankAccountsForReconciliation(): Promise<
  | {
      success: true
      accounts: Array<{
        id: string
        account_name: string
        institution_name: string | null
        mask: string | null
        account_type: string
      }>
    }
  | { success: false; error: string }
> {
  const auth = await getOwnerToken()
  if ("error" in auth) return { success: false, error: auth.error }

  const { orgId } = auth

  try {
    const rows = await adminDb
      .select({
        id: bankAccounts.id,
        account_name: bankAccounts.account_name,
        institution_name: bankAccounts.institution_name,
        mask: bankAccounts.mask,
        account_type: bankAccounts.account_type,
      })
      .from(bankAccounts)
      .where(and(eq(bankAccounts.org_id, orgId), eq(bankAccounts.is_active, true)))
      .orderBy(bankAccounts.created_at)

    return { success: true, accounts: rows }
  } catch (err) {
    console.error("[getBankAccountsForReconciliation] Error:", err)
    return { success: false, error: "Failed to load bank accounts" }
  }
}
