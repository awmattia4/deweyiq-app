/**
 * journal.ts — Double-entry accounting engine for DeweyIQ.
 *
 * Core design:
 * - All journal entries use positive = debit, negative = credit convention.
 * - Entries are immutable once posted. Corrections use reversals only.
 * - Uses adminDb for all operations (system-generated entries, no user RLS context needed).
 * - All auto-generation functions are idempotent and fire-and-forget safe.
 *
 * Balance validation: sum(all line amounts) must equal 0 within 0.01 tolerance.
 *
 * Account number reference (pool company defaults):
 *   1000 — Checking Account
 *   1020 — Stripe Clearing Account
 *   1100 — Accounts Receivable
 *   2000 — Accounts Payable
 *   2100 — Sales Tax Payable
 *   4000 — Pool Maintenance Revenue
 *   5600 — Stripe Processing Fees
 */

import { adminDb } from "@/lib/db"
import {
  journalEntries,
  journalEntryLines,
  chartOfAccounts,
  accountingPeriods,
  invoices,
  invoiceLineItems,
  paymentRecords,
  orgSettings,
} from "@/lib/db/schema"
import { and, eq, sql } from "drizzle-orm"
import { seedChartOfAccounts } from "@/lib/accounting/chart-of-accounts"

// ============================================================
// Types
// ============================================================

export interface JournalEntryLine {
  accountId: string
  /** Positive = debit, negative = credit */
  amount: string
  description?: string
}

export interface CreateJournalEntryInput {
  orgId: string
  entryDate: string // YYYY-MM-DD
  description: string
  /** 'invoice' | 'payment' | 'expense' | 'payout' | 'manual' | 'refund' */
  sourceType: string
  sourceId?: string
  lines: JournalEntryLine[]
  createdBy?: string
}

// ============================================================
// Balance validation
// ============================================================

/**
 * Validates that all line amounts sum to zero (within 0.01 tolerance).
 *
 * Convention: positive = debit, negative = credit.
 * A balanced entry has Dr = Cr, so the net must equal 0.
 *
 * Throws an Error if the entry is imbalanced.
 */
export function validateEntryBalance(lines: JournalEntryLine[]): void {
  if (lines.length < 2) {
    throw new Error("Journal entry must have at least 2 lines")
  }

  let sum = 0
  for (const line of lines) {
    const amount = parseFloat(line.amount)
    if (isNaN(amount)) {
      throw new Error(`Invalid amount in journal entry line: "${line.amount}"`)
    }
    sum += amount
  }

  if (Math.abs(sum) > 0.01) {
    throw new Error(
      `Journal entry is not balanced. Net sum: ${sum.toFixed(2)} (must be 0.00 within ±0.01 tolerance)`
    )
  }
}

// ============================================================
// Period check
// ============================================================

/**
 * Checks if the given entry_date falls within a closed accounting period.
 * Returns true if the period is closed (entry should be rejected).
 */
async function isInClosedPeriod(orgId: string, entryDate: string): Promise<boolean> {
  const closedPeriods = await adminDb
    .select({ id: accountingPeriods.id })
    .from(accountingPeriods)
    .where(
      and(
        eq(accountingPeriods.org_id, orgId),
        eq(accountingPeriods.status, "closed"),
        sql`${accountingPeriods.period_start} <= ${entryDate}::date`,
        sql`${accountingPeriods.period_end} >= ${entryDate}::date`
      )
    )
    .limit(1)

  return closedPeriods.length > 0
}

// ============================================================
// Core: createJournalEntry
// ============================================================

/**
 * Creates an immutable, balanced journal entry with all its lines.
 *
 * Validates:
 * - Lines sum to zero (balanced)
 * - Entry date is not in a closed accounting period
 *
 * Uses adminDb (system operation — auto-generated entries bypass user RLS).
 *
 * @returns The created journal entry ID.
 * @throws Error if lines are imbalanced or period is closed.
 */
export async function createJournalEntry(input: CreateJournalEntryInput): Promise<string> {
  const { orgId, entryDate, description, sourceType, sourceId, lines, createdBy } = input

  // Validate balance
  validateEntryBalance(lines)

  // Check for closed period
  const closed = await isInClosedPeriod(orgId, entryDate)
  if (closed) {
    throw new Error(
      `Cannot create journal entry for ${entryDate}: accounting period is closed`
    )
  }

  // Insert journal_entries header
  const [entry] = await adminDb
    .insert(journalEntries)
    .values({
      org_id: orgId,
      entry_date: entryDate,
      description,
      source_type: sourceType,
      source_id: sourceId ?? null,
      is_posted: true,
      is_reversed: false,
      created_by: createdBy ?? null,
    })
    .returning({ id: journalEntries.id })

  if (!entry?.id) {
    throw new Error("Failed to create journal entry header")
  }

  // Insert all lines
  const lineValues = lines.map((line) => ({
    org_id: orgId,
    journal_entry_id: entry.id,
    account_id: line.accountId,
    amount: line.amount,
    description: line.description ?? null,
  }))

  await adminDb.insert(journalEntryLines).values(lineValues)

  return entry.id
}

// ============================================================
// Reversal
// ============================================================

/**
 * Creates a reversal journal entry for an existing posted entry.
 *
 * The reversal:
 * - Negates all line amounts (debits become credits, credits become debits)
 * - Links back to the original via reversal_of
 * - Marks the original entry as is_reversed=true
 *
 * Does NOT delete or modify the original entry (immutable ledger per ACCT-13).
 *
 * @returns The ID of the new reversal entry.
 */
export async function reverseJournalEntry(entryId: string, reason: string): Promise<string> {
  // Fetch original entry
  const [original] = await adminDb
    .select()
    .from(journalEntries)
    .where(eq(journalEntries.id, entryId))
    .limit(1)

  if (!original) {
    throw new Error(`Journal entry not found: ${entryId}`)
  }
  if (original.is_reversed) {
    throw new Error(`Journal entry ${entryId} has already been reversed`)
  }
  if (!original.is_posted) {
    throw new Error(`Cannot reverse an unposted journal entry: ${entryId}`)
  }

  // Fetch original lines
  const originalLines = await adminDb
    .select()
    .from(journalEntryLines)
    .where(eq(journalEntryLines.journal_entry_id, entryId))

  if (originalLines.length === 0) {
    throw new Error(`No lines found for journal entry: ${entryId}`)
  }

  // Today's date as YYYY-MM-DD for reversal entry date
  const today = new Date()
  const reversalDate = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, "0")}-${String(today.getDate()).padStart(2, "0")}`

  // Create reversal entry
  const [reversalEntry] = await adminDb
    .insert(journalEntries)
    .values({
      org_id: original.org_id,
      entry_date: reversalDate,
      description: `REVERSAL: ${original.description} — ${reason}`,
      source_type: original.source_type,
      source_id: original.source_id ?? null,
      is_posted: true,
      is_reversed: false,
      reversal_of: entryId,
    })
    .returning({ id: journalEntries.id })

  if (!reversalEntry?.id) {
    throw new Error("Failed to create reversal journal entry")
  }

  // Insert negated lines
  const reversalLineValues = originalLines.map((line) => ({
    org_id: original.org_id,
    journal_entry_id: reversalEntry.id,
    account_id: line.account_id,
    // Negate: debits become credits, credits become debits
    amount: String(-parseFloat(line.amount)),
    description: `REVERSAL: ${line.description ?? ""}`.trim(),
  }))

  await adminDb.insert(journalEntryLines).values(reversalLineValues)

  // Mark original as reversed (immutable — only the flag changes)
  await adminDb
    .update(journalEntries)
    .set({ is_reversed: true, updated_at: new Date() })
    .where(eq(journalEntries.id, entryId))

  return reversalEntry.id
}

// ============================================================
// Source lookup (idempotency helper)
// ============================================================

/**
 * Finds existing journal entries linked to a specific source document.
 *
 * Used by auto-generation functions to check idempotency before creating
 * a new entry. If an entry already exists for this source, skip.
 */
export async function getJournalEntriesForSource(
  sourceType: string,
  sourceId: string
): Promise<Array<{ id: string; org_id: string; entry_date: string; description: string }>> {
  return adminDb
    .select({
      id: journalEntries.id,
      org_id: journalEntries.org_id,
      entry_date: journalEntries.entry_date,
      description: journalEntries.description,
    })
    .from(journalEntries)
    .where(
      and(
        eq(journalEntries.source_type, sourceType),
        eq(journalEntries.source_id, sourceId)
      )
    )
}

// ============================================================
// Account lookup helper (adminDb-based for auto-generation)
// ============================================================

/**
 * Gets an account by number for a given org using adminDb.
 *
 * Used by auto-generation functions which run without a user token
 * (webhook handlers, fire-and-forget hooks).
 *
 * Calls ensureChartOfAccounts first to lazy-seed the CoA if needed.
 */
async function getAccountByNumberAdmin(
  orgId: string,
  accountNumber: string
): Promise<{ id: string; account_name: string } | null> {
  await ensureChartOfAccounts(orgId)

  const [account] = await adminDb
    .select({ id: chartOfAccounts.id, account_name: chartOfAccounts.account_name })
    .from(chartOfAccounts)
    .where(
      and(
        eq(chartOfAccounts.org_id, orgId),
        eq(chartOfAccounts.account_number, accountNumber),
        eq(chartOfAccounts.is_active, true)
      )
    )
    .limit(1)

  return account ?? null
}

// ============================================================
// Chart of accounts lazy seeding
// ============================================================

/**
 * Ensures the chart of accounts is seeded for the org.
 *
 * Checks if any accounts exist; if not, seeds from POOL_COMPANY_ACCOUNTS.
 * Safe to call multiple times — seedChartOfAccounts is idempotent.
 */
export async function ensureChartOfAccounts(orgId: string): Promise<void> {
  const [existing] = await adminDb
    .select({ id: chartOfAccounts.id })
    .from(chartOfAccounts)
    .where(eq(chartOfAccounts.org_id, orgId))
    .limit(1)

  if (!existing) {
    await seedChartOfAccounts(orgId)
  }
}

// ============================================================
// Accounting start date check
// ============================================================

/**
 * Checks if the org has an accounting_start_date and whether the given
 * event date falls before it. If so, journal entry generation should be skipped.
 *
 * Returns true if the entry should be SKIPPED (date is before accounting start).
 */
async function shouldSkipEntry(orgId: string, eventDate: string): Promise<boolean> {
  const [settings] = await adminDb
    .select({ accounting_start_date: orgSettings.accounting_start_date })
    .from(orgSettings)
    .where(eq(orgSettings.org_id, orgId))
    .limit(1)

  if (!settings?.accounting_start_date) {
    // No start date set — include all events
    return false
  }

  // Skip if event date is before the accounting start date
  return eventDate < settings.accounting_start_date
}

// ============================================================
// Auto-generation: Invoice Journal Entry
// ============================================================

/**
 * Auto-generates a balanced journal entry when an invoice is finalized.
 *
 * Entry:
 *   Dr Accounts Receivable (1100)  +total
 *   Cr Pool Revenue (4000)         -subtotal
 *   Cr Sales Tax Payable (2100)    -taxAmount
 *
 * Idempotent: skips if a journal entry already exists for this invoice.
 *
 * @param invoiceId — The invoice UUID.
 */
export async function createInvoiceJournalEntry(invoiceId: string): Promise<void> {
  // Idempotency: check if already created
  const existing = await getJournalEntriesForSource("invoice", invoiceId)
  if (existing.length > 0) {
    console.log(`[createInvoiceJournalEntry] Entry already exists for invoice ${invoiceId}, skipping`)
    return
  }

  // Fetch invoice
  const [invoice] = await adminDb
    .select({
      org_id: invoices.org_id,
      subtotal: invoices.subtotal,
      tax_amount: invoices.tax_amount,
      total: invoices.total,
      issued_at: invoices.issued_at,
      created_at: invoices.created_at,
      invoice_number: invoices.invoice_number,
    })
    .from(invoices)
    .where(eq(invoices.id, invoiceId))
    .limit(1)

  if (!invoice) {
    console.error(`[createInvoiceJournalEntry] Invoice not found: ${invoiceId}`)
    return
  }

  const orgId = invoice.org_id
  const entryDate = invoice.issued_at
    ? invoice.issued_at.toISOString().split("T")[0]
    : invoice.created_at.toISOString().split("T")[0]

  // Check accounting start date
  if (await shouldSkipEntry(orgId, entryDate)) {
    console.log(`[createInvoiceJournalEntry] Skipping: ${entryDate} is before accounting_start_date`)
    return
  }

  // Look up required accounts
  const arAccount = await getAccountByNumberAdmin(orgId, "1100") // Accounts Receivable
  const revenueAccount = await getAccountByNumberAdmin(orgId, "4000") // Pool Revenue
  const taxAccount = await getAccountByNumberAdmin(orgId, "2100") // Sales Tax Payable

  if (!arAccount || !revenueAccount) {
    console.error(`[createInvoiceJournalEntry] Required accounts not found for org ${orgId}`)
    return
  }

  const total = parseFloat(invoice.total)
  const subtotal = parseFloat(invoice.subtotal)
  const taxAmount = parseFloat(invoice.tax_amount ?? "0")

  if (isNaN(total) || total <= 0) {
    console.log(`[createInvoiceJournalEntry] Invoice total is 0 or invalid, skipping`)
    return
  }

  const lines: JournalEntryLine[] = [
    {
      accountId: arAccount.id,
      // Dr AR: positive = debit
      amount: total.toFixed(2),
      description: `AR: Invoice ${invoice.invoice_number ?? invoiceId}`,
    },
    {
      accountId: revenueAccount.id,
      // Cr Revenue: negative = credit
      amount: (-subtotal).toFixed(2),
      description: `Revenue: Invoice ${invoice.invoice_number ?? invoiceId}`,
    },
  ]

  // Only add tax line if there's a tax amount and tax account exists
  if (taxAmount > 0 && taxAccount) {
    lines.push({
      accountId: taxAccount.id,
      // Cr Tax Payable: negative = credit
      amount: (-taxAmount).toFixed(2),
      description: `Sales Tax: Invoice ${invoice.invoice_number ?? invoiceId}`,
    })
  }

  try {
    await createJournalEntry({
      orgId,
      entryDate,
      description: `Invoice ${invoice.invoice_number ?? invoiceId}`,
      sourceType: "invoice",
      sourceId: invoiceId,
      lines,
    })
    console.log(`[createInvoiceJournalEntry] Created journal entry for invoice ${invoiceId}`)
  } catch (err) {
    console.error(`[createInvoiceJournalEntry] Failed to create entry:`, err)
  }
}

// ============================================================
// Auto-generation: Payment Journal Entry
// ============================================================

/**
 * Auto-generates a balanced journal entry when a payment is recorded.
 *
 * For Stripe payments (has stripe_payment_intent_id):
 *   Dr Stripe Clearing (1020)      +netAmount
 *   Dr Stripe Fees (5600)          +feeAmount
 *   Cr Accounts Receivable (1100)  -grossAmount
 *
 * For manual payments (check/cash):
 *   Dr Checking (1000)             +amount
 *   Cr Accounts Receivable (1100)  -amount
 *
 * Idempotent: skips if a journal entry already exists for this payment record.
 *
 * @param paymentRecordId — The payment_records UUID.
 * @param stripeFeeAmountCents — Optional Stripe fee in cents (from charge metadata).
 */
export async function createPaymentJournalEntry(
  paymentRecordId: string,
  stripeFeeAmountCents?: number
): Promise<void> {
  // Idempotency
  const existing = await getJournalEntriesForSource("payment", paymentRecordId)
  if (existing.length > 0) {
    console.log(`[createPaymentJournalEntry] Entry already exists for payment ${paymentRecordId}, skipping`)
    return
  }

  // Fetch payment record + invoice for org
  const [payment] = await adminDb
    .select({
      id: paymentRecords.id,
      org_id: paymentRecords.org_id,
      amount: paymentRecords.amount,
      method: paymentRecords.method,
      status: paymentRecords.status,
      stripe_payment_intent_id: paymentRecords.stripe_payment_intent_id,
      settled_at: paymentRecords.settled_at,
      created_at: paymentRecords.created_at,
    })
    .from(paymentRecords)
    .where(eq(paymentRecords.id, paymentRecordId))
    .limit(1)

  if (!payment) {
    console.error(`[createPaymentJournalEntry] Payment record not found: ${paymentRecordId}`)
    return
  }

  // Only create entries for settled (successful) payments
  if (payment.status !== "settled") {
    console.log(`[createPaymentJournalEntry] Payment status is ${payment.status}, skipping`)
    return
  }

  const orgId = payment.org_id
  const gross = parseFloat(payment.amount)

  if (isNaN(gross) || gross <= 0) {
    console.log(`[createPaymentJournalEntry] Payment amount is 0 or invalid, skipping`)
    return
  }

  const entryDate = payment.settled_at
    ? payment.settled_at.toISOString().split("T")[0]
    : payment.created_at.toISOString().split("T")[0]

  // Check accounting start date
  if (await shouldSkipEntry(orgId, entryDate)) {
    console.log(`[createPaymentJournalEntry] Skipping: ${entryDate} is before accounting_start_date`)
    return
  }

  const arAccount = await getAccountByNumberAdmin(orgId, "1100") // Accounts Receivable
  if (!arAccount) {
    console.error(`[createPaymentJournalEntry] AR account not found for org ${orgId}`)
    return
  }

  const isStripe = !!payment.stripe_payment_intent_id

  let lines: JournalEntryLine[]

  if (isStripe) {
    const stripeClearingAccount = await getAccountByNumberAdmin(orgId, "1020")
    const stripeFeesAccount = await getAccountByNumberAdmin(orgId, "5600")

    if (!stripeClearingAccount) {
      console.error(`[createPaymentJournalEntry] Stripe clearing account not found for org ${orgId}`)
      return
    }

    const feeAmount = stripeFeeAmountCents ? stripeFeeAmountCents / 100 : 0
    const netAmount = gross - feeAmount

    lines = [
      {
        accountId: stripeClearingAccount.id,
        // Dr Stripe Clearing: positive = debit (net after fees)
        amount: netAmount.toFixed(2),
        description: "Stripe payment (net of fees)",
      },
      {
        accountId: arAccount.id,
        // Cr AR: negative = credit (full gross amount clears the AR)
        amount: (-gross).toFixed(2),
        description: "Clear AR on payment",
      },
    ]

    // Only add fee line if there's an actual fee and the account exists
    if (feeAmount > 0 && stripeFeesAccount) {
      lines.push({
        accountId: stripeFeesAccount.id,
        // Dr Stripe Fees: positive = debit
        amount: feeAmount.toFixed(2),
        description: "Stripe processing fee",
      })
    }
  } else {
    // Manual payment (check/cash)
    const checkingAccount = await getAccountByNumberAdmin(orgId, "1000")
    if (!checkingAccount) {
      console.error(`[createPaymentJournalEntry] Checking account not found for org ${orgId}`)
      return
    }

    lines = [
      {
        accountId: checkingAccount.id,
        // Dr Checking: positive = debit
        amount: gross.toFixed(2),
        description: `${payment.method} payment received`,
      },
      {
        accountId: arAccount.id,
        // Cr AR: negative = credit
        amount: (-gross).toFixed(2),
        description: "Clear AR on payment",
      },
    ]
  }

  try {
    await createJournalEntry({
      orgId,
      entryDate,
      description: `Payment received (${payment.method})`,
      sourceType: "payment",
      sourceId: paymentRecordId,
      lines,
    })
    console.log(`[createPaymentJournalEntry] Created journal entry for payment ${paymentRecordId}`)
  } catch (err) {
    console.error(`[createPaymentJournalEntry] Failed to create entry:`, err)
  }
}

// ============================================================
// Auto-generation: Expense Journal Entry
// ============================================================

/**
 * Auto-generates a balanced journal entry when an expense is recorded.
 *
 * If expense is paid (settled): Dr Expense account, Cr Checking (1000)
 * If expense is unpaid (pending): Dr Expense account, Cr Accounts Payable (2000)
 *
 * Expense account is determined by expense category (defaults to 5000 Chemical Costs).
 *
 * @param expenseId — The expense UUID.
 */
export async function createExpenseJournalEntry(expenseId: string): Promise<void> {
  // Idempotency
  const existing = await getJournalEntriesForSource("expense", expenseId)
  if (existing.length > 0) {
    console.log(`[createExpenseJournalEntry] Entry already exists for expense ${expenseId}, skipping`)
    return
  }

  // Dynamic import to avoid circular deps (expenses is a Phase 7 schema)
  const { expenses } = await import("@/lib/db/schema")

  const [expense] = await adminDb
    .select({
      id: expenses.id,
      org_id: expenses.org_id,
      amount: expenses.amount,
      category: expenses.category,
      description: expenses.description,
      date: expenses.date,
    })
    .from(expenses)
    .where(eq(expenses.id, expenseId))
    .limit(1)

  if (!expense) {
    console.error(`[createExpenseJournalEntry] Expense not found: ${expenseId}`)
    return
  }

  const orgId = expense.org_id
  const amount = parseFloat(expense.amount)

  if (isNaN(amount) || amount <= 0) {
    console.log(`[createExpenseJournalEntry] Expense amount is 0 or invalid, skipping`)
    return
  }

  const entryDate = expense.date ?? new Date().toISOString().split("T")[0]

  // Check accounting start date
  if (await shouldSkipEntry(orgId, entryDate)) {
    console.log(`[createExpenseJournalEntry] Skipping: ${entryDate} is before accounting_start_date`)
    return
  }

  // Map expense category to account number
  const categoryAccountMap: Record<string, string> = {
    chemicals: "5000",
    parts: "5100",
    fuel: "5200",
    vehicle: "5300",
    subcontractor: "5400",
    labor: "5500",
    insurance: "6000",
    marketing: "6100",
    office: "6200",
    mileage: "6300",
  }
  const expenseAccountNumber = categoryAccountMap[expense.category ?? ""] ?? "5000"

  const expenseAccount = await getAccountByNumberAdmin(orgId, expenseAccountNumber)
  if (!expenseAccount) {
    console.error(`[createExpenseJournalEntry] Expense account ${expenseAccountNumber} not found for org ${orgId}`)
    return
  }

  // Expenses in this schema are always recorded as paid (immediate cash expense).
  // AP accrual is a future enhancement when bill tracking is added.
  const isPaid = true
  const creditAccountNumber = isPaid ? "1000" : "2000"
  const creditAccount = await getAccountByNumberAdmin(orgId, creditAccountNumber)
  if (!creditAccount) {
    console.error(`[createExpenseJournalEntry] Credit account ${creditAccountNumber} not found for org ${orgId}`)
    return
  }

  const lines: JournalEntryLine[] = [
    {
      accountId: expenseAccount.id,
      // Dr Expense: positive = debit
      amount: amount.toFixed(2),
      description: expense.description ?? "Expense",
    },
    {
      accountId: creditAccount.id,
      // Cr Bank/AP: negative = credit
      amount: (-amount).toFixed(2),
      description: isPaid ? "Cash payment for expense" : "Expense accrual (AP)",
    },
  ]

  try {
    await createJournalEntry({
      orgId,
      entryDate,
      description: expense.description ?? "Expense",
      sourceType: "expense",
      sourceId: expenseId,
      lines,
    })
    console.log(`[createExpenseJournalEntry] Created journal entry for expense ${expenseId}`)
  } catch (err) {
    console.error(`[createExpenseJournalEntry] Failed to create entry:`, err)
  }
}

// ============================================================
// Auto-generation: Refund Journal Entry
// ============================================================

/**
 * Auto-generates a balanced journal entry when a refund is processed.
 *
 * Reversal pattern for Stripe refunds:
 *   Dr AR (1100)                   +refundAmount  (re-opens the receivable)
 *   Cr Stripe Clearing (1020)      -refundAmount  (money leaves clearing)
 *
 * For non-Stripe refunds:
 *   Dr AR (1100)                   +refundAmount
 *   Cr Checking (1000)             -refundAmount
 *
 * @param paymentRecordId — The refund payment_records UUID (status='refunded').
 * @param refundAmount — The refund amount as a string (positive value).
 */
export async function createRefundJournalEntry(
  paymentRecordId: string,
  refundAmount: string
): Promise<void> {
  // Idempotency
  const existing = await getJournalEntriesForSource("refund", paymentRecordId)
  if (existing.length > 0) {
    console.log(`[createRefundJournalEntry] Entry already exists for refund ${paymentRecordId}, skipping`)
    return
  }

  const [payment] = await adminDb
    .select({
      org_id: paymentRecords.org_id,
      method: paymentRecords.method,
      stripe_payment_intent_id: paymentRecords.stripe_payment_intent_id,
      settled_at: paymentRecords.settled_at,
      created_at: paymentRecords.created_at,
    })
    .from(paymentRecords)
    .where(eq(paymentRecords.id, paymentRecordId))
    .limit(1)

  if (!payment) {
    console.error(`[createRefundJournalEntry] Payment record not found: ${paymentRecordId}`)
    return
  }

  const orgId = payment.org_id
  const amount = parseFloat(refundAmount)

  if (isNaN(amount) || amount <= 0) {
    console.log(`[createRefundJournalEntry] Refund amount is 0 or invalid, skipping`)
    return
  }

  const entryDate = payment.settled_at
    ? payment.settled_at.toISOString().split("T")[0]
    : payment.created_at.toISOString().split("T")[0]

  // Check accounting start date
  if (await shouldSkipEntry(orgId, entryDate)) {
    console.log(`[createRefundJournalEntry] Skipping: ${entryDate} is before accounting_start_date`)
    return
  }

  const arAccount = await getAccountByNumberAdmin(orgId, "1100")
  const isStripe = !!payment.stripe_payment_intent_id
  const bankAccountNumber = isStripe ? "1020" : "1000"
  const bankAccount = await getAccountByNumberAdmin(orgId, bankAccountNumber)

  if (!arAccount || !bankAccount) {
    console.error(`[createRefundJournalEntry] Required accounts not found for org ${orgId}`)
    return
  }

  const lines: JournalEntryLine[] = [
    {
      accountId: arAccount.id,
      // Dr AR: positive = debit (re-opens the receivable for the refunded amount)
      amount: amount.toFixed(2),
      description: "Refund: AR adjustment",
    },
    {
      accountId: bankAccount.id,
      // Cr Bank/Clearing: negative = credit (money goes back to customer)
      amount: (-amount).toFixed(2),
      description: `Refund: ${isStripe ? "Stripe reversal" : "Cash/check refund"}`,
    },
  ]

  try {
    await createJournalEntry({
      orgId,
      entryDate,
      description: `Refund of ${refundAmount}`,
      sourceType: "refund",
      sourceId: paymentRecordId,
      lines,
    })
    console.log(`[createRefundJournalEntry] Created journal entry for refund ${paymentRecordId}`)
  } catch (err) {
    console.error(`[createRefundJournalEntry] Failed to create entry:`, err)
  }
}
