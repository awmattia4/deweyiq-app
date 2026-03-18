"use server"

/**
 * payment-reconciliation.ts — Payment reconciliation, payment plans, customer
 * credits, and collections dashboard actions.
 *
 * Phase 11 — PAY-03 through PAY-07:
 *   PAY-03: Payment plan creation and management
 *   PAY-04: Customer credits — issue and apply
 *   PAY-05: Collections dashboard
 *   PAY-06: AR/AP aging (extends Phase 7 getArAging)
 *   PAY-07: Refund journal entry integration
 *
 * QBO payment reconciliation (ACCT-09):
 *   onQboPaymentReceived — triggered from QBO webhook, creates journal entry
 *
 * Key patterns:
 * - withRls for all user-facing queries
 * - createJournalEntry / createPaymentJournalEntry for accounting
 * - LEFT JOIN over correlated subqueries (MEMORY.md)
 * - toLocalDateString() from date-utils for YYYY-MM-DD (MEMORY.md)
 */

import { revalidatePath } from "next/cache"
import { createClient } from "@/lib/supabase/server"
import { withRls, getRlsToken, adminDb } from "@/lib/db"
import type { SupabaseToken } from "@/lib/db"
import {
  invoices,
  customers,
  paymentRecords,
  paymentPlans,
  paymentPlanInstallments,
  customerCredits,
  profiles,
} from "@/lib/db/schema"
import { and, eq, inArray, isNull, sql, desc, asc } from "drizzle-orm"
import {
  createJournalEntry,
  createPaymentJournalEntry,
  getJournalEntriesForSource,
  ensureChartOfAccounts,
} from "@/lib/accounting/journal"
import { toLocalDateString } from "@/lib/date-utils"

// ---------------------------------------------------------------------------
// Auth helper
// ---------------------------------------------------------------------------


// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface PaymentPlanInstallmentRow {
  id: string
  installment_number: number
  due_date: string
  amount: string
  status: string
  paid_at: Date | null
  payment_record_id: string | null
}

export interface PaymentPlanRow {
  id: string
  org_id: string
  invoice_id: string
  total_amount: string
  installment_count: number
  installment_amount: string
  frequency: string
  start_date: string
  status: string
  created_at: Date
  // Joined
  customerName: string
  invoiceNumber: string | null
  installments: PaymentPlanInstallmentRow[]
}

export interface CustomerCreditRow {
  id: string
  org_id: string
  customer_id: string
  customerName: string
  amount: string
  reason: string
  source_type: string
  source_id: string | null
  applied_to_invoice_id: string | null
  appliedInvoiceNumber: string | null
  status: string
  created_at: Date
}

export interface CollectionsDashboardCustomer {
  customerId: string
  customerName: string
  overdueAmount: number
  oldestInvoiceDate: string | null
  lastPaymentDate: string | null
  hasAutopay: boolean
  failedAutopayCount: number
  bucket: "30+" | "60+" | "90+"
  invoiceCount: number
}

export interface CollectionsDashboardResult {
  customers: CollectionsDashboardCustomer[]
  totalOverdue: number
  over30: number
  over60: number
  over90: number
}

// ---------------------------------------------------------------------------
// Helper: advance date by frequency
// ---------------------------------------------------------------------------

function advanceDate(dateStr: string, frequency: string): string {
  const d = new Date(dateStr + "T12:00:00")
  switch (frequency) {
    case "weekly":
      d.setDate(d.getDate() + 7)
      break
    case "bi_weekly":
      d.setDate(d.getDate() + 14)
      break
    case "monthly":
    default:
      d.setMonth(d.getMonth() + 1)
      break
  }
  const year = d.getFullYear()
  const month = String(d.getMonth() + 1).padStart(2, "0")
  const day = String(d.getDate()).padStart(2, "0")
  return `${year}-${month}-${day}`
}

// ---------------------------------------------------------------------------
// Helper: get account by number (using adminDb — for journal entry generation)
// ---------------------------------------------------------------------------

async function getAccountIdByNumber(orgId: string, accountNumber: string): Promise<string | null> {
  await ensureChartOfAccounts(orgId)
  const { chartOfAccounts } = await import("@/lib/db/schema")
  const [account] = await adminDb
    .select({ id: chartOfAccounts.id })
    .from(chartOfAccounts)
    .where(
      and(
        eq(chartOfAccounts.org_id, orgId),
        eq(chartOfAccounts.account_number, accountNumber),
        eq(chartOfAccounts.is_active, true)
      )
    )
    .limit(1)
  return account?.id ?? null
}

// ===========================================================================
// QBO Payment Reconciliation (ACCT-09)
// ===========================================================================

/**
 * QboPaymentWebhook — shape of a QBO payment event from the webhook handler.
 */
export interface QboPaymentWebhook {
  orgId: string
  qboPaymentId: string
  /** ISO date string (YYYY-MM-DD) */
  paymentDate: string
  amount: string
  /** Optional: if the QBO payment maps to a known invoice */
  invoiceId?: string
}

/**
 * onQboPaymentReceived — Called from the QBO webhook handler when a payment
 * is recorded in QuickBooks Online.
 *
 * Creates a journal entry:
 *   Dr Bank/Clearing (1000)           +amount
 *   Cr Accounts Receivable (1100)     -amount
 *
 * Idempotent: skips if a journal entry already exists for this QBO payment.
 * Uses adminDb (webhook handler — no user session available).
 */
export async function onQboPaymentReceived(paymentData: QboPaymentWebhook): Promise<void> {
  const { orgId, qboPaymentId, paymentDate, amount, invoiceId } = paymentData

  // Idempotency check
  const existing = await getJournalEntriesForSource("qbo_payment", qboPaymentId)
  if (existing.length > 0) {
    console.log(`[onQboPaymentReceived] Entry already exists for QBO payment ${qboPaymentId}, skipping`)
    return
  }

  const parsedAmount = parseFloat(amount)
  if (isNaN(parsedAmount) || parsedAmount <= 0) {
    console.log(`[onQboPaymentReceived] Invalid amount: ${amount}, skipping`)
    return
  }

  const bankAccountId = await getAccountIdByNumber(orgId, "1000")
  const arAccountId = await getAccountIdByNumber(orgId, "1100")

  if (!bankAccountId || !arAccountId) {
    console.error(`[onQboPaymentReceived] Required accounts not found for org ${orgId}`)
    return
  }

  try {
    await createJournalEntry({
      orgId,
      entryDate: paymentDate,
      description: `QBO Payment ${qboPaymentId}`,
      sourceType: "qbo_payment",
      sourceId: qboPaymentId,
      lines: [
        {
          accountId: bankAccountId,
          amount: parsedAmount.toFixed(2),
          description: "QBO payment received",
        },
        {
          accountId: arAccountId,
          amount: (-parsedAmount).toFixed(2),
          description: invoiceId ? `Clear AR: Invoice ${invoiceId}` : "Clear AR: QBO payment",
        },
      ],
    })
    console.log(`[onQboPaymentReceived] Journal entry created for QBO payment ${qboPaymentId}`)
  } catch (err) {
    console.error(`[onQboPaymentReceived] Failed to create journal entry:`, err)
  }
}

// ===========================================================================
// Payment Plans (PAY-03)
// ===========================================================================

/**
 * createPaymentPlan — Owner/office only. Splits invoice total into equal
 * installments. Creates payment_plan + payment_plan_installments rows.
 *
 * @param invoiceId — Invoice to split into a payment plan
 * @param installmentCount — Number of installments (2–12)
 * @param frequency — 'weekly' | 'bi_weekly' | 'monthly'
 * @param startDate — First installment due date (YYYY-MM-DD)
 */
export async function createPaymentPlan(
  invoiceId: string,
  installmentCount: number,
  frequency: string,
  startDate: string
): Promise<{ success: boolean; planId?: string; error?: string }> {
  if (installmentCount < 2 || installmentCount > 12) {
    return { success: false, error: "Installment count must be between 2 and 12" }
  }
  if (!["weekly", "bi_weekly", "monthly"].includes(frequency)) {
    return { success: false, error: "Invalid frequency" }
  }

  const token = await getRlsToken()
  if (!token) return { success: false, error: "Not authenticated" }

  const role = token["user_role"] as string | undefined
  if (!role || !["owner", "office"].includes(role)) {
    return { success: false, error: "Owner or office access required" }
  }

  try {
    return await withRls(token, async (db) => {
      // Fetch invoice to get total amount and org
      const [invoice] = await db
        .select({
          id: invoices.id,
          org_id: invoices.org_id,
          total: invoices.total,
          status: invoices.status,
        })
        .from(invoices)
        .where(eq(invoices.id, invoiceId))
        .limit(1)

      if (!invoice) return { success: false, error: "Invoice not found" }
      if (!["draft", "sent", "overdue"].includes(invoice.status)) {
        return { success: false, error: "Only unpaid invoices can have a payment plan" }
      }

      const totalAmount = parseFloat(invoice.total)
      if (isNaN(totalAmount) || totalAmount <= 0) {
        return { success: false, error: "Invoice total is invalid" }
      }

      // Calculate installment amount — last installment absorbs any rounding
      const installmentAmount = Math.floor((totalAmount / installmentCount) * 100) / 100
      const lastInstallmentAmount =
        Math.round((totalAmount - installmentAmount * (installmentCount - 1)) * 100) / 100

      // Create plan header
      const [plan] = await db
        .insert(paymentPlans)
        .values({
          org_id: invoice.org_id,
          invoice_id: invoiceId,
          total_amount: totalAmount.toFixed(2),
          installment_count: installmentCount,
          installment_amount: installmentAmount.toFixed(2),
          frequency,
          start_date: startDate,
          status: "active",
          created_by: token["sub"] as string | undefined,
        })
        .returning({ id: paymentPlans.id })

      if (!plan?.id) return { success: false, error: "Failed to create payment plan" }

      // Generate installment rows
      const installmentRows = []
      let currentDate = startDate
      for (let i = 1; i <= installmentCount; i++) {
        const isLast = i === installmentCount
        installmentRows.push({
          org_id: invoice.org_id,
          payment_plan_id: plan.id,
          installment_number: i,
          due_date: currentDate,
          amount: isLast
            ? lastInstallmentAmount.toFixed(2)
            : installmentAmount.toFixed(2),
          status: "pending" as const,
        })
        if (!isLast) {
          currentDate = advanceDate(currentDate, frequency)
        }
      }

      await db.insert(paymentPlanInstallments).values(installmentRows)

      revalidatePath("/billing")
      return { success: true, planId: plan.id }
    })
  } catch (err) {
    console.error("[createPaymentPlan] Error:", err)
    return { success: false, error: "Failed to create payment plan" }
  }
}

/**
 * getPaymentPlans — Owner/office. Returns active payment plans with installment
 * status, optionally filtered by customerId.
 */
export async function getPaymentPlans(
  customerId?: string
): Promise<PaymentPlanRow[]> {
  const token = await getRlsToken()
  if (!token) return []

  const role = token["user_role"] as string | undefined
  if (!role || !["owner", "office"].includes(role)) return []

  try {
    return await withRls(token, async (db) => {
      // Fetch plans with customer and invoice info via LEFT JOIN
      const plansQuery = db
        .select({
          id: paymentPlans.id,
          org_id: paymentPlans.org_id,
          invoice_id: paymentPlans.invoice_id,
          total_amount: paymentPlans.total_amount,
          installment_count: paymentPlans.installment_count,
          installment_amount: paymentPlans.installment_amount,
          frequency: paymentPlans.frequency,
          start_date: paymentPlans.start_date,
          status: paymentPlans.status,
          created_at: paymentPlans.created_at,
          customerName: customers.full_name,
          invoiceNumber: invoices.invoice_number,
          customerId: invoices.customer_id,
        })
        .from(paymentPlans)
        .leftJoin(invoices, eq(paymentPlans.invoice_id, invoices.id))
        .leftJoin(customers, eq(invoices.customer_id, customers.id))
        .where(
          customerId
            ? and(
                eq(paymentPlans.status, "active"),
                eq(invoices.customer_id, customerId)
              )
            : eq(paymentPlans.status, "active")
        )
        .orderBy(desc(paymentPlans.created_at))

      const plans = await plansQuery

      if (plans.length === 0) return []

      // Fetch all installments for these plans in one query
      const planIds = plans.map((p) => p.id)
      const allInstallments = await db
        .select()
        .from(paymentPlanInstallments)
        .where(inArray(paymentPlanInstallments.payment_plan_id, planIds))
        .orderBy(
          asc(paymentPlanInstallments.payment_plan_id),
          asc(paymentPlanInstallments.installment_number)
        )

      // Group installments by plan
      const installmentsByPlan = new Map<string, PaymentPlanInstallmentRow[]>()
      for (const inst of allInstallments) {
        if (!installmentsByPlan.has(inst.payment_plan_id)) {
          installmentsByPlan.set(inst.payment_plan_id, [])
        }
        installmentsByPlan.get(inst.payment_plan_id)!.push({
          id: inst.id,
          installment_number: inst.installment_number,
          due_date: inst.due_date,
          amount: inst.amount,
          status: inst.status,
          paid_at: inst.paid_at,
          payment_record_id: inst.payment_record_id,
        })
      }

      return plans.map((p) => ({
        id: p.id,
        org_id: p.org_id,
        invoice_id: p.invoice_id,
        total_amount: p.total_amount,
        installment_count: p.installment_count,
        installment_amount: p.installment_amount,
        frequency: p.frequency,
        start_date: p.start_date,
        status: p.status,
        created_at: p.created_at,
        customerName: p.customerName ?? "Unknown",
        invoiceNumber: p.invoiceNumber ?? null,
        installments: installmentsByPlan.get(p.id) ?? [],
      }))
    })
  } catch (err) {
    console.error("[getPaymentPlans] Error:", err)
    return []
  }
}

/**
 * recordInstallmentPayment — Marks a payment plan installment as paid.
 * Links it to a payment_record. If all installments are paid, completes the plan.
 */
export async function recordInstallmentPayment(
  installmentId: string,
  paymentRecordId: string
): Promise<{ success: boolean; planCompleted?: boolean; error?: string }> {
  const token = await getRlsToken()
  if (!token) return { success: false, error: "Not authenticated" }

  const role = token["user_role"] as string | undefined
  if (!role || !["owner", "office"].includes(role)) {
    return { success: false, error: "Owner or office access required" }
  }

  try {
    return await withRls(token, async (db) => {
      // Get installment
      const [installment] = await db
        .select()
        .from(paymentPlanInstallments)
        .where(eq(paymentPlanInstallments.id, installmentId))
        .limit(1)

      if (!installment) return { success: false, error: "Installment not found" }
      if (installment.status === "paid") return { success: false, error: "Already paid" }

      // Mark installment as paid
      await db
        .update(paymentPlanInstallments)
        .set({
          status: "paid",
          payment_record_id: paymentRecordId,
          paid_at: new Date(),
        })
        .where(eq(paymentPlanInstallments.id, installmentId))

      // Check if all installments in this plan are now paid
      const remaining = await db
        .select({ id: paymentPlanInstallments.id })
        .from(paymentPlanInstallments)
        .where(
          and(
            eq(paymentPlanInstallments.payment_plan_id, installment.payment_plan_id),
            sql`${paymentPlanInstallments.status} != 'paid'`,
            sql`${paymentPlanInstallments.id} != ${installmentId}`
          )
        )
        .limit(1)

      let planCompleted = false
      if (remaining.length === 0) {
        await db
          .update(paymentPlans)
          .set({ status: "completed", updated_at: new Date() })
          .where(eq(paymentPlans.id, installment.payment_plan_id))
        planCompleted = true
      }

      revalidatePath("/billing")
      return { success: true, planCompleted }
    })
  } catch (err) {
    console.error("[recordInstallmentPayment] Error:", err)
    return { success: false, error: "Failed to record payment" }
  }
}

// ===========================================================================
// Customer Credits (PAY-04)
// ===========================================================================

/**
 * issueCustomerCredit — Owner/office only. Creates a customer credit row with
 * status='available'. Generates a journal entry:
 *   Dr AR (1100)                     +amount   (or appropriate source account)
 *   Cr Customer Credits (2200)       -amount
 *
 * For 'refund' source type: Dr Stripe/Bank, Cr Customer Credits
 * For 'goodwill' or 'overpayment': Dr Revenue (4000), Cr Customer Credits
 */
export async function issueCustomerCredit(
  customerId: string,
  amount: string,
  reason: string,
  sourceType: string,
  sourceId?: string
): Promise<{ success: boolean; creditId?: string; error?: string }> {
  const token = await getRlsToken()
  if (!token) return { success: false, error: "Not authenticated" }

  const role = token["user_role"] as string | undefined
  if (!role || !["owner", "office"].includes(role)) {
    return { success: false, error: "Owner or office access required" }
  }

  const parsedAmount = parseFloat(amount)
  if (isNaN(parsedAmount) || parsedAmount <= 0) {
    return { success: false, error: "Credit amount must be a positive number" }
  }

  if (!["refund", "goodwill", "overpayment"].includes(sourceType)) {
    return { success: false, error: "Invalid source type" }
  }

  try {
    return await withRls(token, async (db) => {
      // Verify customer exists
      const [customer] = await db
        .select({ id: customers.id, org_id: customers.org_id })
        .from(customers)
        .where(eq(customers.id, customerId))
        .limit(1)

      if (!customer) return { success: false, error: "Customer not found" }

      // Create credit row
      const [credit] = await db
        .insert(customerCredits)
        .values({
          org_id: customer.org_id,
          customer_id: customerId,
          amount: parsedAmount.toFixed(2),
          reason,
          source_type: sourceType,
          source_id: sourceId ?? null,
          status: "available",
          created_by: token["sub"] as string | undefined,
        })
        .returning({ id: customerCredits.id })

      if (!credit?.id) return { success: false, error: "Failed to issue credit" }

      // Generate journal entry asynchronously (fire-and-forget)
      const orgId = customer.org_id
      setImmediate(async () => {
        try {
          const customerCreditsAccountId = await getAccountIdByNumber(orgId, "2200")
          if (!customerCreditsAccountId) return

          // Debit account depends on source type
          let debitAccountNumber = "4000" // Default: Revenue
          if (sourceType === "refund") {
            debitAccountNumber = "1100" // AR (refund reduces AR)
          } else if (sourceType === "overpayment") {
            debitAccountNumber = "1100" // AR (overpayment came from AR)
          }

          const debitAccountId = await getAccountIdByNumber(orgId, debitAccountNumber)
          if (!debitAccountId) return

          const today = toLocalDateString(new Date())
          await createJournalEntry({
            orgId,
            entryDate: today,
            description: `Customer credit issued: ${reason}`,
            sourceType: "customer_credit",
            sourceId: credit.id,
            lines: [
              {
                accountId: debitAccountId,
                amount: parsedAmount.toFixed(2),
                description: `Issue credit: ${sourceType}`,
              },
              {
                accountId: customerCreditsAccountId,
                amount: (-parsedAmount).toFixed(2),
                description: `Customer credit liability: ${reason}`,
              },
            ],
          })
        } catch (err) {
          console.error("[issueCustomerCredit] Journal entry failed:", err)
        }
      })

      revalidatePath("/billing")
      return { success: true, creditId: credit.id }
    })
  } catch (err) {
    console.error("[issueCustomerCredit] Error:", err)
    return { success: false, error: "Failed to issue credit" }
  }
}

/**
 * applyCustomerCredit — Owner/office only. Applies a credit as an offset on
 * an invoice. Updates credit status to 'applied', sets applied_to_invoice_id.
 *
 * Journal entry:
 *   Dr Customer Credits (2200)       +creditAmount  (reduce liability)
 *   Cr Accounts Receivable (1100)    -creditAmount  (reduce AR)
 */
export async function applyCustomerCredit(
  creditId: string,
  invoiceId: string
): Promise<{ success: boolean; error?: string }> {
  const token = await getRlsToken()
  if (!token) return { success: false, error: "Not authenticated" }

  const role = token["user_role"] as string | undefined
  if (!role || !["owner", "office"].includes(role)) {
    return { success: false, error: "Owner or office access required" }
  }

  try {
    return await withRls(token, async (db) => {
      // Atomic check-and-update: only apply if still available (prevents race condition)
      const [updated] = await db
        .update(customerCredits)
        .set({
          status: "applied",
          applied_to_invoice_id: invoiceId,
          updated_at: new Date(),
        })
        .where(
          and(
            eq(customerCredits.id, creditId),
            eq(customerCredits.status, "available")
          )
        )
        .returning()

      if (!updated) {
        return { success: false, error: "Credit not found or already applied" }
      }

      // Verify invoice belongs to same customer
      const [invoice] = await db
        .select({ id: invoices.id, total: invoices.total, customer_id: invoices.customer_id })
        .from(invoices)
        .where(eq(invoices.id, invoiceId))
        .limit(1)

      if (!invoice || invoice.customer_id !== updated.customer_id) {
        // Rollback: restore credit to available
        await db
          .update(customerCredits)
          .set({ status: "available", applied_to_invoice_id: null, updated_at: new Date() })
          .where(eq(customerCredits.id, creditId))
        return { success: false, error: "Invoice not found or belongs to a different customer" }
      }

      const credit = updated

      // Generate journal entry (fire-and-forget)
      const orgId = credit.org_id
      const creditAmount = parseFloat(credit.amount)
      setImmediate(async () => {
        try {
          const customerCreditsAccountId = await getAccountIdByNumber(orgId, "2200")
          const arAccountId = await getAccountIdByNumber(orgId, "1100")
          if (!customerCreditsAccountId || !arAccountId) return

          const today = toLocalDateString(new Date())
          await createJournalEntry({
            orgId,
            entryDate: today,
            description: `Customer credit applied to invoice ${invoiceId}`,
            sourceType: "credit_application",
            sourceId: creditId,
            lines: [
              {
                accountId: customerCreditsAccountId,
                // Dr Customer Credits: reduce liability (positive = debit)
                amount: creditAmount.toFixed(2),
                description: "Reduce customer credit liability",
              },
              {
                accountId: arAccountId,
                // Cr AR: reduce receivable (negative = credit)
                amount: (-creditAmount).toFixed(2),
                description: `Apply credit to invoice ${invoiceId}`,
              },
            ],
          })
        } catch (err) {
          console.error("[applyCustomerCredit] Journal entry failed:", err)
        }
      })

      revalidatePath("/billing")
      return { success: true }
    })
  } catch (err) {
    console.error("[applyCustomerCredit] Error:", err)
    return { success: false, error: "Failed to apply credit" }
  }
}

/**
 * getCustomerCredits — Returns all credits for a customer with status.
 */
export async function getCustomerCredits(customerId: string): Promise<CustomerCreditRow[]> {
  const token = await getRlsToken()
  if (!token) return []

  const role = token["user_role"] as string | undefined
  if (!role || !["owner", "office"].includes(role)) return []

  try {
    return await withRls(token, async (db) => {
      const rows = await db
        .select({
          id: customerCredits.id,
          org_id: customerCredits.org_id,
          customer_id: customerCredits.customer_id,
          customerName: customers.full_name,
          amount: customerCredits.amount,
          reason: customerCredits.reason,
          source_type: customerCredits.source_type,
          source_id: customerCredits.source_id,
          applied_to_invoice_id: customerCredits.applied_to_invoice_id,
          status: customerCredits.status,
          created_at: customerCredits.created_at,
        })
        .from(customerCredits)
        .leftJoin(customers, eq(customerCredits.customer_id, customers.id))
        .where(eq(customerCredits.customer_id, customerId))
        .orderBy(desc(customerCredits.created_at))

      // Get applied invoice numbers
      const appliedInvoiceIds = rows
        .filter((r) => r.applied_to_invoice_id)
        .map((r) => r.applied_to_invoice_id!)

      let invoiceNumbers = new Map<string, string | null>()
      if (appliedInvoiceIds.length > 0) {
        const invRows = await db
          .select({ id: invoices.id, invoice_number: invoices.invoice_number })
          .from(invoices)
          .where(inArray(invoices.id, appliedInvoiceIds))
        for (const inv of invRows) {
          invoiceNumbers.set(inv.id, inv.invoice_number)
        }
      }

      return rows.map((r) => ({
        id: r.id,
        org_id: r.org_id,
        customer_id: r.customer_id,
        customerName: r.customerName ?? "Unknown",
        amount: r.amount,
        reason: r.reason,
        source_type: r.source_type,
        source_id: r.source_id,
        applied_to_invoice_id: r.applied_to_invoice_id,
        appliedInvoiceNumber: r.applied_to_invoice_id
          ? (invoiceNumbers.get(r.applied_to_invoice_id) ?? null)
          : null,
        status: r.status,
        created_at: r.created_at,
      }))
    })
  } catch (err) {
    console.error("[getCustomerCredits] Error:", err)
    return []
  }
}

// ===========================================================================
// Collections Dashboard (PAY-05)
// ===========================================================================

/**
 * getCollectionsDashboard — Owner only. Returns customers with overdue invoices
 * grouped by severity bucket (30+, 60+, 90+ days overdue).
 *
 * Uses LEFT JOIN (not correlated subquery) per MEMORY.md.
 */
export async function getCollectionsDashboard(): Promise<CollectionsDashboardResult> {
  const token = await getRlsToken()
  const empty: CollectionsDashboardResult = {
    customers: [],
    totalOverdue: 0,
    over30: 0,
    over60: 0,
    over90: 0,
  }
  if (!token) return empty

  const role = token["user_role"] as string | undefined
  if (!role || role !== "owner") return empty

  try {
    return await withRls(token, async (db) => {
      // Fetch all overdue/sent unpaid invoices with customer info
      const rows = await db
        .select({
          customerId: invoices.customer_id,
          customerName: customers.full_name,
          invoiceId: invoices.id,
          total: invoices.total,
          dueDate: invoices.due_date,
          issuedAt: invoices.issued_at,
          sentAt: invoices.sent_at,
          stripePaymentIntentId: invoices.stripe_payment_intent_id,
        })
        .from(invoices)
        .leftJoin(customers, eq(invoices.customer_id, customers.id))
        .where(
          and(
            sql`${invoices.status} IN ('sent', 'overdue')`,
            isNull(invoices.paid_at),
            sql`${invoices.due_date} IS NOT NULL`
          )
        )

      if (rows.length === 0) return empty

      // Fetch last payment per customer (LEFT JOIN approach)
      const customerIds = [...new Set(rows.map((r) => r.customerId))]
      const lastPayments = await db
        .select({
          customerId: invoices.customer_id,
          lastPaymentDate: paymentRecords.settled_at,
        })
        .from(paymentRecords)
        .leftJoin(invoices, eq(paymentRecords.invoice_id, invoices.id))
        .where(
          and(
            inArray(invoices.customer_id, customerIds),
            eq(paymentRecords.status, "settled")
          )
        )
        .orderBy(desc(paymentRecords.settled_at))

      // Build map: customerId -> last payment date
      const lastPaymentMap = new Map<string, string | null>()
      for (const lp of lastPayments) {
        if (!lp.customerId) continue
        if (!lastPaymentMap.has(lp.customerId) && lp.lastPaymentDate) {
          lastPaymentMap.set(
            lp.customerId,
            toLocalDateString(lp.lastPaymentDate)
          )
        }
      }

      // Fetch failed autopay counts
      const failedPayments = await db
        .select({
          customerId: invoices.customer_id,
          failedCount: sql<number>`count(*)::int`,
        })
        .from(paymentRecords)
        .leftJoin(invoices, eq(paymentRecords.invoice_id, invoices.id))
        .where(
          and(
            inArray(invoices.customer_id, customerIds),
            eq(paymentRecords.status, "failed")
          )
        )
        .groupBy(invoices.customer_id)

      const failedMap = new Map<string, number>()
      for (const f of failedPayments) {
        if (!f.customerId) continue
        failedMap.set(f.customerId, f.failedCount)
      }

      // Aggregate by customer
      const today = new Date()
      today.setHours(0, 0, 0, 0)

      interface CustomerAgg {
        customerId: string
        customerName: string
        overdueAmount: number
        oldestDueDate: string | null
        hasAutopay: boolean
        invoiceCount: number
        maxDaysOverdue: number
      }

      const customerMap = new Map<string, CustomerAgg>()

      for (const row of rows) {
        const dueDate = row.dueDate
          ? new Date(row.dueDate + "T00:00:00")
          : null
        const daysOverdue = dueDate
          ? Math.floor((today.getTime() - dueDate.getTime()) / (1000 * 60 * 60 * 24))
          : 0

        if (daysOverdue < 30) continue // Only show 30+ days overdue

        const invoiceAmount = parseFloat(row.total ?? "0")
        const existing = customerMap.get(row.customerId)

        if (!existing) {
          customerMap.set(row.customerId, {
            customerId: row.customerId,
            customerName: row.customerName ?? "Unknown",
            overdueAmount: invoiceAmount,
            oldestDueDate: row.dueDate,
            hasAutopay: !!row.stripePaymentIntentId,
            invoiceCount: 1,
            maxDaysOverdue: daysOverdue,
          })
        } else {
          existing.overdueAmount += invoiceAmount
          existing.invoiceCount += 1
          existing.maxDaysOverdue = Math.max(existing.maxDaysOverdue, daysOverdue)
          if (row.dueDate && (!existing.oldestDueDate || row.dueDate < existing.oldestDueDate)) {
            existing.oldestDueDate = row.dueDate
          }
          if (row.stripePaymentIntentId) existing.hasAutopay = true
        }
      }

      const result: CollectionsDashboardCustomer[] = Array.from(customerMap.values())
        .map((c) => ({
          customerId: c.customerId,
          customerName: c.customerName,
          overdueAmount: c.overdueAmount,
          oldestInvoiceDate: c.oldestDueDate,
          lastPaymentDate: lastPaymentMap.get(c.customerId) ?? null,
          hasAutopay: c.hasAutopay,
          failedAutopayCount: failedMap.get(c.customerId) ?? 0,
          bucket:
            c.maxDaysOverdue >= 90
              ? ("90+" as const)
              : c.maxDaysOverdue >= 60
                ? ("60+" as const)
                : ("30+" as const),
          invoiceCount: c.invoiceCount,
        }))
        .sort((a, b) => {
          // Sort by severity first, then by amount
          const bucketOrder = { "90+": 0, "60+": 1, "30+": 2 }
          const bucketDiff = bucketOrder[a.bucket] - bucketOrder[b.bucket]
          if (bucketDiff !== 0) return bucketDiff
          return b.overdueAmount - a.overdueAmount
        })

      const totalOverdue = result.reduce((sum, c) => sum + c.overdueAmount, 0)
      const over30 = result
        .filter((c) => c.bucket === "30+")
        .reduce((sum, c) => sum + c.overdueAmount, 0)
      const over60 = result
        .filter((c) => c.bucket === "60+" || c.bucket === "90+")
        .reduce((sum, c) => sum + c.overdueAmount, 0)
      const over90 = result
        .filter((c) => c.bucket === "90+")
        .reduce((sum, c) => sum + c.overdueAmount, 0)

      return { customers: result, totalOverdue, over30, over60, over90 }
    })
  } catch (err) {
    console.error("[getCollectionsDashboard] Error:", err)
    return empty
  }
}

// ===========================================================================
// AR/AP Aging (PAY-06) — Extends Phase 7 getArAging
// ===========================================================================

export interface ArAgingCustomerExtended {
  id: string
  name: string
  current: number
  d1_30: number
  d31_60: number
  d61_90: number
  d90_plus: number
  total: number
}

export interface ArAgingResultExtended {
  customers: ArAgingCustomerExtended[]
  totals: {
    current: number
    d1_30: number
    d31_60: number
    d61_90: number
    d90_plus: number
    total: number
  }
}

/**
 * getArApAging — Owner only. Returns AR aging buckets (current, 30, 60, 90, 120+
 * days) with customer breakdown.
 *
 * Extends Phase 7's getArAging() with additional data for the collections
 * dashboard (credit balances, payment plan context).
 */
export async function getArApAging(): Promise<ArAgingResultExtended> {
  const token = await getRlsToken()
  const empty: ArAgingResultExtended = {
    customers: [],
    totals: { current: 0, d1_30: 0, d31_60: 0, d61_90: 0, d90_plus: 0, total: 0 },
  }
  if (!token) return empty

  const role = token["user_role"] as string | undefined
  if (!role || !["owner", "office"].includes(role)) return empty

  try {
    return await withRls(token, async (db) => {
      const rows = await db
        .select({
          invoiceId: invoices.id,
          total: invoices.total,
          dueDate: invoices.due_date,
          customerId: invoices.customer_id,
          customerName: customers.full_name,
        })
        .from(invoices)
        .leftJoin(customers, eq(invoices.customer_id, customers.id))
        .where(
          and(
            sql`${invoices.status} IN ('sent', 'overdue')`,
            isNull(invoices.paid_at)
          )
        )

      const customerMap = new Map<string, ArAgingCustomerExtended>()

      for (const row of rows) {
        const customerId = row.customerId
        const customerName = row.customerName ?? "Unknown"
        const invoiceTotal = parseFloat(row.total ?? "0")

        if (!customerMap.has(customerId)) {
          customerMap.set(customerId, {
            id: customerId,
            name: customerName,
            current: 0,
            d1_30: 0,
            d31_60: 0,
            d61_90: 0,
            d90_plus: 0,
            total: 0,
          })
        }

        const entry = customerMap.get(customerId)!

        let daysOverdue = 0
        if (row.dueDate) {
          const dueDate = new Date(row.dueDate + "T00:00:00")
          const now = new Date()
          now.setHours(0, 0, 0, 0)
          daysOverdue = Math.floor(
            (now.getTime() - dueDate.getTime()) / (1000 * 60 * 60 * 24)
          )
        }

        if (daysOverdue <= 0) {
          entry.current += invoiceTotal
        } else if (daysOverdue <= 30) {
          entry.d1_30 += invoiceTotal
        } else if (daysOverdue <= 60) {
          entry.d31_60 += invoiceTotal
        } else if (daysOverdue <= 90) {
          entry.d61_90 += invoiceTotal
        } else {
          entry.d90_plus += invoiceTotal
        }
        entry.total += invoiceTotal
      }

      const customerList = Array.from(customerMap.values()).sort(
        (a, b) => b.total - a.total
      )

      const totals = customerList.reduce(
        (acc, c) => ({
          current: acc.current + c.current,
          d1_30: acc.d1_30 + c.d1_30,
          d31_60: acc.d31_60 + c.d31_60,
          d61_90: acc.d61_90 + c.d61_90,
          d90_plus: acc.d90_plus + c.d90_plus,
          total: acc.total + c.total,
        }),
        { current: 0, d1_30: 0, d31_60: 0, d61_90: 0, d90_plus: 0, total: 0 }
      )

      return { customers: customerList, totals }
    })
  } catch (err) {
    console.error("[getArApAging] Error:", err)
    return empty
  }
}

// ===========================================================================
// Refund Journal Entry (PAY-07)
// ===========================================================================

/**
 * createRefundEntry — Creates a reversal journal entry for a refund.
 *
 * This wraps the existing createRefundJournalEntry from journal.ts but exposes
 * it as a server action for direct invocation from the UI.
 *
 * Entry (Stripe):
 *   Dr AR (1100)                +refundAmount
 *   Cr Stripe Clearing (1020)  -refundAmount
 *
 * Entry (manual):
 *   Dr AR (1100)                +refundAmount
 *   Cr Checking (1000)          -refundAmount
 */
export async function createRefundEntry(
  paymentId: string,
  refundAmount: string
): Promise<{ success: boolean; error?: string }> {
  const token = await getRlsToken()
  if (!token) return { success: false, error: "Not authenticated" }

  const role = token["user_role"] as string | undefined
  if (!role || role !== "owner") {
    return { success: false, error: "Owner access required" }
  }

  const parsedAmount = parseFloat(refundAmount)
  if (isNaN(parsedAmount) || parsedAmount <= 0) {
    return { success: false, error: "Refund amount must be a positive number" }
  }

  try {
    const { createRefundJournalEntry } = await import("@/lib/accounting/journal")
    await createRefundJournalEntry(paymentId, refundAmount)
    return { success: true }
  } catch (err) {
    console.error("[createRefundEntry] Error:", err)
    return { success: false, error: "Failed to create refund journal entry" }
  }
}

// ===========================================================================
// Helpers for UI: get all customer credits (across all customers)
// ===========================================================================

/**
 * getAllCustomerCredits — Owner/office. Returns all credits across all customers
 * for the org, sorted by most recent first.
 */
export async function getAllCustomerCredits(): Promise<CustomerCreditRow[]> {
  const token = await getRlsToken()
  if (!token) return []

  const role = token["user_role"] as string | undefined
  if (!role || !["owner", "office"].includes(role)) return []

  try {
    return await withRls(token, async (db) => {
      const rows = await db
        .select({
          id: customerCredits.id,
          org_id: customerCredits.org_id,
          customer_id: customerCredits.customer_id,
          customerName: customers.full_name,
          amount: customerCredits.amount,
          reason: customerCredits.reason,
          source_type: customerCredits.source_type,
          source_id: customerCredits.source_id,
          applied_to_invoice_id: customerCredits.applied_to_invoice_id,
          status: customerCredits.status,
          created_at: customerCredits.created_at,
        })
        .from(customerCredits)
        .leftJoin(customers, eq(customerCredits.customer_id, customers.id))
        .orderBy(desc(customerCredits.created_at))

      const appliedInvoiceIds = rows
        .filter((r) => r.applied_to_invoice_id)
        .map((r) => r.applied_to_invoice_id!)

      let invoiceNumbers = new Map<string, string | null>()
      if (appliedInvoiceIds.length > 0) {
        const invRows = await db
          .select({ id: invoices.id, invoice_number: invoices.invoice_number })
          .from(invoices)
          .where(inArray(invoices.id, appliedInvoiceIds))
        for (const inv of invRows) {
          invoiceNumbers.set(inv.id, inv.invoice_number)
        }
      }

      return rows.map((r) => ({
        id: r.id,
        org_id: r.org_id,
        customer_id: r.customer_id,
        customerName: r.customerName ?? "Unknown",
        amount: r.amount,
        reason: r.reason,
        source_type: r.source_type,
        source_id: r.source_id,
        applied_to_invoice_id: r.applied_to_invoice_id,
        appliedInvoiceNumber: r.applied_to_invoice_id
          ? (invoiceNumbers.get(r.applied_to_invoice_id) ?? null)
          : null,
        status: r.status,
        created_at: r.created_at,
      }))
    })
  } catch (err) {
    console.error("[getAllCustomerCredits] Error:", err)
    return []
  }
}

/**
 * getOpenInvoicesForCustomer — Returns open (unpaid) invoices for a customer.
 * Used by the Apply Credit UI.
 */
export async function getOpenInvoicesForCustomer(
  customerId: string
): Promise<Array<{ id: string; invoice_number: string | null; total: string; status: string }>> {
  const token = await getRlsToken()
  if (!token) return []

  const role = token["user_role"] as string | undefined
  if (!role || !["owner", "office"].includes(role)) return []

  try {
    return await withRls(token, async (db) => {
      return db
        .select({
          id: invoices.id,
          invoice_number: invoices.invoice_number,
          total: invoices.total,
          status: invoices.status,
        })
        .from(invoices)
        .where(
          and(
            eq(invoices.customer_id, customerId),
            sql`${invoices.status} IN ('draft', 'sent', 'overdue')`,
            isNull(invoices.paid_at)
          )
        )
        .orderBy(desc(invoices.created_at))
    })
  } catch (err) {
    console.error("[getOpenInvoicesForCustomer] Error:", err)
    return []
  }
}
