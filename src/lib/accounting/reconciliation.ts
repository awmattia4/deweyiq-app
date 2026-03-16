/**
 * reconciliation.ts — Smart bank transaction matching algorithm for DeweyIQ.
 *
 * Scoring algorithm:
 *   - Amount exact match (±$0.01): +50 points
 *   - Date within 1 day: +30 points; within 3 days: +20 points; within 7 days: +10 points
 *   - Description contains invoice number: +40 points
 *   - Description contains customer/vendor name: +20 points
 *
 * Score thresholds:
 *   - >= 80: auto-match (high confidence)
 *   - 50–79: suggest for review
 *   - < 50: unmatched
 *
 * Uses adminDb for all operations — called from server actions with owner token,
 * and from background processes (Stripe payout webhook).
 */

import { adminDb } from "@/lib/db"
import {
  bankTransactions,
  bankAccounts,
  journalEntries,
  journalEntryLines,
} from "@/lib/db/schema"
import { and, eq, isNull, sql } from "drizzle-orm"

// ============================================================
// Types
// ============================================================

export interface BankTxnForMatch {
  id: string
  org_id: string
  amount: string
  date: string
  name: string | null
  merchant_name: string | null
  category: string | null
  status: string
}

export interface JournalEntryForMatch {
  id: string
  org_id: string
  entry_date: string
  description: string
  source_type: string
  source_id: string | null
  /** Net absolute value of all debit lines (positive amounts) — represents the transaction size */
  net_amount: string
}

export interface MatchScore {
  journalEntryId: string
  score: number
  /** Human-readable reasons for this score */
  reasons: string[]
  entry: JournalEntryForMatch
}

export type MatchStatus = "auto" | "suggest" | "unmatched"

export interface AutoMatchResult {
  autoMatched: number
  suggestedReview: number
  unmatched: number
}

// ============================================================
// Scoring algorithm
// ============================================================

/**
 * Scores a single bank transaction against a single journal entry.
 *
 * Returns a score 0–100+ with reasons.
 * Score thresholds: >= 80 = auto-match, 50–79 = suggest review, < 50 = unmatched.
 */
export function scoreBankTransactionMatch(
  bankTxn: BankTxnForMatch,
  journalEntry: JournalEntryForMatch
): MatchScore {
  let score = 0
  const reasons: string[] = []

  const txnAmount = Math.abs(parseFloat(bankTxn.amount))
  const entryAmount = Math.abs(parseFloat(journalEntry.net_amount))

  // ── Amount match ──────────────────────────────────────────────────────────
  if (!isNaN(txnAmount) && !isNaN(entryAmount)) {
    const amountDiff = Math.abs(txnAmount - entryAmount)
    if (amountDiff <= 0.01) {
      score += 50
      reasons.push(`Exact amount match ($${txnAmount.toFixed(2)})`)
    } else if (amountDiff <= 1.0) {
      // Close but not exact (rounding differences in fees)
      score += 20
      reasons.push(`Near amount match ($${txnAmount.toFixed(2)} vs $${entryAmount.toFixed(2)})`)
    }
  }

  // ── Date proximity ────────────────────────────────────────────────────────
  if (bankTxn.date && journalEntry.entry_date) {
    const txnDate = new Date(bankTxn.date + "T00:00:00Z")
    const entryDate = new Date(journalEntry.entry_date + "T00:00:00Z")
    const daysDiff = Math.abs((txnDate.getTime() - entryDate.getTime()) / (1000 * 60 * 60 * 24))

    if (daysDiff <= 1) {
      score += 30
      reasons.push(`Date within 1 day`)
    } else if (daysDiff <= 3) {
      score += 20
      reasons.push(`Date within 3 days`)
    } else if (daysDiff <= 7) {
      score += 10
      reasons.push(`Date within 7 days`)
    }
    // > 7 days = no date points
  }

  // ── Description matching ─────────────────────────────────────────────────
  const txnDesc = `${bankTxn.name ?? ""} ${bankTxn.merchant_name ?? ""}`.toLowerCase()
  const entryDesc = journalEntry.description.toLowerCase()

  // Invoice number detection — look for patterns like "INV-1234", "#1234", "invoice 1234"
  const invoicePattern = /(?:inv[-#]?\s*\d+|invoice\s+\d+|#\d{3,})/gi
  const txnInvoiceMatches = txnDesc.match(invoicePattern) ?? []
  const entryInvoiceMatches = entryDesc.match(invoicePattern) ?? []

  if (txnInvoiceMatches.length > 0 && entryInvoiceMatches.length > 0) {
    // Check if any invoice numbers actually match
    const txnNums = txnInvoiceMatches.map((m) => m.replace(/\D/g, ""))
    const entryNums = entryInvoiceMatches.map((m) => m.replace(/\D/g, ""))
    const hasMatchingInvoice = txnNums.some((n) => entryNums.includes(n))
    if (hasMatchingInvoice) {
      score += 40
      reasons.push(`Invoice number match`)
    }
  }

  // Source ID in description — journal entries often include their source_id or source number
  if (journalEntry.source_id && txnDesc.includes(journalEntry.source_id.toLowerCase())) {
    score += 30
    reasons.push(`Source ID found in bank description`)
  }

  // Keyword overlap — shared significant words (3+ chars) between descriptions
  const significantWords = (s: string) =>
    s
      .replace(/[^a-z0-9\s]/g, " ")
      .split(/\s+/)
      .filter((w) => w.length >= 3)

  const txnWords = new Set(significantWords(txnDesc))
  const entryWords = significantWords(entryDesc)
  const matchingWords = entryWords.filter((w) => txnWords.has(w))

  if (matchingWords.length >= 2) {
    score += 20
    reasons.push(`Description overlap (${matchingWords.slice(0, 3).join(", ")})`)
  } else if (matchingWords.length === 1) {
    score += 10
    reasons.push(`Partial description match`)
  }

  return { journalEntryId: journalEntry.id, score, reasons, entry: journalEntry }
}

/**
 * Determines match status from score.
 */
export function getMatchStatus(score: number): MatchStatus {
  if (score >= 80) return "auto"
  if (score >= 50) return "suggest"
  return "unmatched"
}

// ============================================================
// matchBankTransaction
// ============================================================

/**
 * Fetches a bank transaction and scores it against all unmatched journal entries for the org.
 *
 * Returns top matches sorted by score (descending). Does NOT auto-match — caller decides.
 * Results limited to top 10 matches.
 */
export async function matchBankTransaction(
  bankTxnId: string,
  orgId: string
): Promise<{ bankTxn: BankTxnForMatch; matches: MatchScore[] } | { error: string }> {
  // Fetch the bank transaction
  const [txn] = await adminDb
    .select({
      id: bankTransactions.id,
      org_id: bankTransactions.org_id,
      amount: bankTransactions.amount,
      date: bankTransactions.date,
      name: bankTransactions.name,
      merchant_name: bankTransactions.merchant_name,
      category: bankTransactions.category,
      status: bankTransactions.status,
    })
    .from(bankTransactions)
    .where(and(eq(bankTransactions.id, bankTxnId), eq(bankTransactions.org_id, orgId)))
    .limit(1)

  if (!txn) {
    return { error: "Bank transaction not found" }
  }

  // Fetch all unmatched journal entries for this org
  // Use LEFT JOIN on journal_entry_lines to get net debit amount
  const entryRows = await adminDb
    .select({
      id: journalEntries.id,
      org_id: journalEntries.org_id,
      entry_date: journalEntries.entry_date,
      description: journalEntries.description,
      source_type: journalEntries.source_type,
      source_id: journalEntries.source_id,
      // Sum of positive (debit) amounts — the gross flow
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
        // Only unmatched entries (not already linked to a bank transaction)
        sql`NOT EXISTS (
          SELECT 1 FROM bank_transactions bt
          WHERE bt.matched_entry_id = ${journalEntries.id}
          AND bt.status = 'matched'
        )`
      )
    )

  // Score each entry
  const scores: MatchScore[] = entryRows
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
        entry as JournalEntryForMatch
      )
    )
    .filter((m) => m.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, 10)

  return { bankTxn: txn as BankTxnForMatch, matches: scores }
}

// ============================================================
// autoMatchTransactions
// ============================================================

/**
 * Batch auto-matching for all unmatched bank transactions on a given account.
 *
 * For each unmatched transaction, runs scoring against unmatched journal entries.
 * Auto-matches those scoring >= 80. Returns counts.
 *
 * Uses adminDb — designed to run from server actions or background processes.
 */
export async function autoMatchTransactions(bankAccountId: string): Promise<AutoMatchResult> {
  // Fetch the account to get org_id
  const [account] = await adminDb
    .select({ id: bankAccounts.id, org_id: bankAccounts.org_id })
    .from(bankAccounts)
    .where(eq(bankAccounts.id, bankAccountId))
    .limit(1)

  if (!account) {
    return { autoMatched: 0, suggestedReview: 0, unmatched: 0 }
  }

  const orgId = account.org_id

  // Fetch all unmatched transactions for this account
  const unmatchedTxns = await adminDb
    .select({
      id: bankTransactions.id,
      org_id: bankTransactions.org_id,
      amount: bankTransactions.amount,
      date: bankTransactions.date,
      name: bankTransactions.name,
      merchant_name: bankTransactions.merchant_name,
      category: bankTransactions.category,
      status: bankTransactions.status,
    })
    .from(bankTransactions)
    .where(
      and(
        eq(bankTransactions.bank_account_id, bankAccountId),
        eq(bankTransactions.status, "unmatched"),
        eq(bankTransactions.pending, false)
      )
    )

  if (unmatchedTxns.length === 0) {
    return { autoMatched: 0, suggestedReview: 0, unmatched: 0 }
  }

  // Fetch all unmatched journal entries for the org (once, reused for all txns)
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

  const entries = entryRows as JournalEntryForMatch[]

  // Track which journal entries have been auto-matched in this batch
  // (prevents double-matching the same entry to two transactions)
  const matchedEntryIds = new Set<string>()

  let autoMatched = 0
  let suggestedReview = 0
  let unmatched = 0

  for (const txn of unmatchedTxns) {
    // Score against all unmatched entries (excluding already matched in this batch)
    const scores = entries
      .filter((e) => !matchedEntryIds.has(e.id))
      .map((entry) =>
        scoreBankTransactionMatch(txn as BankTxnForMatch, entry)
      )
      .sort((a, b) => b.score - a.score)

    const topMatch = scores[0]

    if (!topMatch || topMatch.score === 0) {
      unmatched++
      continue
    }

    const status = getMatchStatus(topMatch.score)

    if (status === "auto") {
      // Auto-match: update bank transaction status and link
      await adminDb
        .update(bankTransactions)
        .set({
          status: "matched",
          matched_entry_id: topMatch.journalEntryId,
          matched_at: new Date(),
          updated_at: new Date(),
        })
        .where(eq(bankTransactions.id, txn.id))

      matchedEntryIds.add(topMatch.journalEntryId)
      autoMatched++
    } else if (status === "suggest") {
      suggestedReview++
    } else {
      unmatched++
    }
  }

  return { autoMatched, suggestedReview, unmatched }
}
