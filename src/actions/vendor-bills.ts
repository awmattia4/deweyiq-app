"use server"

/**
 * vendor-bills.ts — Accounts payable workflow for vendor bill management.
 *
 * Access control:
 * - All actions: owner only (AP is a financial control function)
 *
 * Key patterns:
 * - createJournalEntry called after bill creation (Dr Expense, Cr AP 2000)
 * - recordBillPayment creates reversal AP entry (Dr AP 2000, Cr Bank 1000)
 * - Overdue detection done at query time (status='unpaid' && due_date < today)
 * - Aging buckets computed from due_date relative to today
 */

import { createClient } from "@/lib/supabase/server"
import { withRls, adminDb } from "@/lib/db"
import type { SupabaseToken } from "@/lib/db"
import {
  vendorBills,
  vendors,
  chartOfAccounts,
} from "@/lib/db/schema"
import { and, asc, desc, eq, gte, lte, or, sql } from "drizzle-orm"
import { createJournalEntry, ensureChartOfAccounts } from "@/lib/accounting/journal"
import { toLocalDateString } from "@/lib/date-utils"

// ---------------------------------------------------------------------------
// Auth helper
// ---------------------------------------------------------------------------

async function getRlsToken(): Promise<SupabaseToken | null> {
  const supabase = await createClient()
  const { data: claimsData } = await supabase.auth.getClaims()
  if (!claimsData?.claims) return null
  return claimsData.claims as SupabaseToken
}

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface VendorBillRow {
  id: string
  org_id: string
  vendor_id: string
  vendor_name: string
  bill_number: string | null
  bill_date: string
  due_date: string
  description: string
  amount: string
  /** Derived: 'unpaid' | 'scheduled' | 'paid' | 'void' | 'overdue' */
  status: string
  scheduled_date: string | null
  payment_method: string | null
  payment_reference: string | null
  paid_at: Date | null
  days_until_due: number | null
  created_at: Date
}

export interface ApAgingBucket {
  label: string
  days: string
  count: number
  total: number
  bills: Array<{
    id: string
    vendor_name: string
    bill_number: string | null
    amount: string
    due_date: string
    description: string
    days_overdue: number
  }>
}

export interface ApAging {
  current: ApAgingBucket
  days1to30: ApAgingBucket
  days31to60: ApAgingBucket
  days61to90: ApAgingBucket
  days90plus: ApAgingBucket
  grandTotal: number
}

export interface ApSummary {
  totalOutstanding: number
  totalOverdue: number
  dueThisWeek: number
  dueThisMonth: number
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Gets a chart of accounts account by number for the given org.
 * Uses adminDb (system operation — no user token needed for account lookup).
 */
async function getAccountByNumber(
  orgId: string,
  accountNumber: string
): Promise<{ id: string } | null> {
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

  return account ?? null
}

/**
 * Derives the effective status for a bill.
 * Bills with status='unpaid' and due_date < today are treated as 'overdue'.
 */
function deriveStatus(status: string, dueDate: string, today: string): string {
  if (status === "unpaid" && dueDate < today) return "overdue"
  return status
}

// ---------------------------------------------------------------------------
// createVendorBill
// ---------------------------------------------------------------------------

/**
 * Creates a vendor bill and auto-generates the AP journal entry.
 *
 * Journal entry:
 *   Dr Expense account (categoryAccountId or default 5000)
 *   Cr Accounts Payable (2000)
 *
 * Access: owner only.
 */
export async function createVendorBill(input: {
  vendorId: string
  billNumber?: string
  billDate: string
  dueDate: string
  description: string
  amount: string
  categoryAccountId?: string
}): Promise<{ success: boolean; billId?: string; error?: string }> {
  const token = await getRlsToken()
  if (!token) return { success: false, error: "Not authenticated" }

  const orgId = token.org_id as string
  const userRole = token.user_role as string | undefined
  const userId = token.sub as string | undefined

  if (userRole !== "owner") {
    return { success: false, error: "Only owners can create vendor bills" }
  }

  const amount = parseFloat(input.amount)
  if (isNaN(amount) || amount <= 0) {
    return { success: false, error: "Amount must be a positive number" }
  }

  try {
    // Verify vendor belongs to org
    const [vendor] = await withRls(token, (db) =>
      db
        .select({ id: vendors.id })
        .from(vendors)
        .where(and(eq(vendors.id, input.vendorId), eq(vendors.org_id, orgId)))
        .limit(1)
    )

    if (!vendor) {
      return { success: false, error: "Vendor not found" }
    }

    // Get expense account for debit side
    await ensureChartOfAccounts(orgId)

    let expenseAccountId = input.categoryAccountId

    if (!expenseAccountId) {
      // Default to account 5000 (Chemical Costs / General Expense)
      const defaultExpenseAccount = await getAccountByNumber(orgId, "5000")
      if (!defaultExpenseAccount) {
        return { success: false, error: "Default expense account (5000) not found. Ensure chart of accounts is seeded." }
      }
      expenseAccountId = defaultExpenseAccount.id
    }

    // Get AP account (2000)
    const apAccount = await getAccountByNumber(orgId, "2000")
    if (!apAccount) {
      return { success: false, error: "Accounts Payable account (2000) not found." }
    }

    // Create the vendor bill record
    const [created] = await withRls(token, (db) =>
      db
        .insert(vendorBills)
        .values({
          org_id: orgId,
          vendor_id: input.vendorId,
          bill_number: input.billNumber ?? null,
          bill_date: input.billDate,
          due_date: input.dueDate,
          description: input.description,
          amount: amount.toFixed(2),
          category_account_id: expenseAccountId!,
          status: "unpaid",
          created_by: userId ?? null,
        })
        .returning({ id: vendorBills.id })
    )

    if (!created?.id) {
      return { success: false, error: "Failed to create vendor bill" }
    }

    // Auto-generate AP journal entry: Dr Expense, Cr AP
    try {
      const entryId = await createJournalEntry({
        orgId,
        entryDate: input.billDate,
        description: `Vendor Bill: ${input.description}${input.billNumber ? ` (${input.billNumber})` : ""}`,
        sourceType: "vendor_bill",
        sourceId: created.id,
        lines: [
          {
            accountId: expenseAccountId!,
            amount: amount.toFixed(2), // Dr Expense: positive = debit
            description: input.description,
          },
          {
            accountId: apAccount.id,
            amount: (-amount).toFixed(2), // Cr AP: negative = credit
            description: `AP: ${input.description}`,
          },
        ],
        createdBy: userId,
      })

      // Store journal entry ID on the bill
      await withRls(token, (db) =>
        db
          .update(vendorBills)
          .set({ journal_entry_id: entryId, updated_at: new Date() })
          .where(and(eq(vendorBills.id, created.id), eq(vendorBills.org_id, orgId)))
      )
    } catch (jeErr) {
      console.error("[createVendorBill] Journal entry creation failed:", jeErr)
      // Bill was created — don't fail the whole action for accounting error
    }

    return { success: true, billId: created.id }
  } catch (err) {
    console.error("[createVendorBill] Error:", err)
    return {
      success: false,
      error: err instanceof Error ? err.message : "Failed to create vendor bill",
    }
  }
}

// ---------------------------------------------------------------------------
// getVendorBills
// ---------------------------------------------------------------------------

/**
 * Returns vendor bills with vendor names and derived statuses.
 *
 * Access: owner only.
 */
export async function getVendorBills(filters?: {
  vendorId?: string
  status?: "unpaid" | "scheduled" | "paid" | "overdue" | "void"
  startDate?: string
  endDate?: string
}): Promise<
  { success: true; bills: VendorBillRow[] } | { success: false; error: string }
> {
  const token = await getRlsToken()
  if (!token) return { success: false, error: "Not authenticated" }

  const orgId = token.org_id as string
  const userRole = token.user_role as string | undefined

  if (!userRole || !["owner", "office"].includes(userRole)) {
    return { success: false, error: "Insufficient permissions" }
  }

  try {
    const today = toLocalDateString(new Date())

    const conditions = [eq(vendorBills.org_id, orgId)]

    if (filters?.vendorId) {
      conditions.push(eq(vendorBills.vendor_id, filters.vendorId))
    }
    if (filters?.startDate) {
      conditions.push(gte(vendorBills.bill_date, filters.startDate))
    }
    if (filters?.endDate) {
      conditions.push(lte(vendorBills.bill_date, filters.endDate))
    }

    // For overdue filter — stored as 'unpaid' with past due_date
    if (filters?.status === "overdue") {
      conditions.push(eq(vendorBills.status, "unpaid"))
      conditions.push(sql`${vendorBills.due_date} < ${today}::date`)
    } else if (filters?.status) {
      conditions.push(eq(vendorBills.status, filters.status))
    }

    // Fetch bills
    const billRows = await withRls(token, (db) =>
      db
        .select({
          id: vendorBills.id,
          org_id: vendorBills.org_id,
          vendor_id: vendorBills.vendor_id,
          bill_number: vendorBills.bill_number,
          bill_date: vendorBills.bill_date,
          due_date: vendorBills.due_date,
          description: vendorBills.description,
          amount: vendorBills.amount,
          status: vendorBills.status,
          scheduled_date: vendorBills.scheduled_date,
          payment_method: vendorBills.payment_method,
          payment_reference: vendorBills.payment_reference,
          paid_at: vendorBills.paid_at,
          created_at: vendorBills.created_at,
        })
        .from(vendorBills)
        .where(and(...conditions))
        .orderBy(asc(vendorBills.due_date))
    )

    if (billRows.length === 0) {
      return { success: true, bills: [] }
    }

    // Fetch vendor names in one query
    const vendorIds = [...new Set(billRows.map((b) => b.vendor_id))]
    const vendorRows = await withRls(token, (db) =>
      db
        .select({ id: vendors.id, vendor_name: vendors.vendor_name })
        .from(vendors)
        .where(eq(vendors.org_id, orgId))
    )
    const vendorMap = new Map(vendorRows.map((v) => [v.id, v.vendor_name]))

    const bills: VendorBillRow[] = billRows.map((bill) => {
      const effectiveStatus = deriveStatus(bill.status, bill.due_date, today)
      const dueMs = new Date(bill.due_date).getTime() - new Date(today).getTime()
      const daysUntilDue = Math.ceil(dueMs / (1000 * 60 * 60 * 24))

      return {
        id: bill.id,
        org_id: bill.org_id,
        vendor_id: bill.vendor_id,
        vendor_name: vendorMap.get(bill.vendor_id) ?? "Unknown Vendor",
        bill_number: bill.bill_number,
        bill_date: bill.bill_date,
        due_date: bill.due_date,
        description: bill.description,
        amount: bill.amount,
        status: effectiveStatus,
        scheduled_date: bill.scheduled_date,
        payment_method: bill.payment_method,
        payment_reference: bill.payment_reference,
        paid_at: bill.paid_at,
        days_until_due: ["unpaid", "scheduled"].includes(bill.status) ? daysUntilDue : null,
        created_at: bill.created_at,
      }
    })

    return { success: true, bills }
  } catch (err) {
    console.error("[getVendorBills] Error:", err)
    return {
      success: false,
      error: err instanceof Error ? err.message : "Failed to load vendor bills",
    }
  }
}

// ---------------------------------------------------------------------------
// updateVendorBill
// ---------------------------------------------------------------------------

/**
 * Updates an unpaid vendor bill.
 *
 * If the amount changes, reverses the original journal entry and creates a new one.
 * Access: owner only.
 */
export async function updateVendorBill(
  billId: string,
  updates: {
    dueDate?: string
    description?: string
    amount?: string
    categoryAccountId?: string
  }
): Promise<{ success: boolean; error?: string }> {
  const token = await getRlsToken()
  if (!token) return { success: false, error: "Not authenticated" }

  const orgId = token.org_id as string
  const userRole = token.user_role as string | undefined
  const userId = token.sub as string | undefined

  if (userRole !== "owner") {
    return { success: false, error: "Only owners can update vendor bills" }
  }

  try {
    const [bill] = await withRls(token, (db) =>
      db
        .select({
          id: vendorBills.id,
          status: vendorBills.status,
          amount: vendorBills.amount,
          bill_date: vendorBills.bill_date,
          description: vendorBills.description,
          journal_entry_id: vendorBills.journal_entry_id,
          category_account_id: vendorBills.category_account_id,
        })
        .from(vendorBills)
        .where(and(eq(vendorBills.id, billId), eq(vendorBills.org_id, orgId)))
        .limit(1)
    )

    if (!bill) {
      return { success: false, error: "Vendor bill not found" }
    }
    if (bill.status !== "unpaid") {
      return { success: false, error: "Can only edit unpaid bills" }
    }

    const setValues: Partial<typeof vendorBills.$inferInsert> = {
      updated_at: new Date(),
    }
    if (updates.dueDate !== undefined) setValues.due_date = updates.dueDate
    if (updates.description !== undefined) setValues.description = updates.description
    if (updates.amount !== undefined) setValues.amount = parseFloat(updates.amount).toFixed(2)
    if (updates.categoryAccountId !== undefined) setValues.category_account_id = updates.categoryAccountId

    await withRls(token, (db) =>
      db
        .update(vendorBills)
        .set(setValues)
        .where(and(eq(vendorBills.id, billId), eq(vendorBills.org_id, orgId)))
    )

    // If amount changed, reverse old journal entry and create new one
    if (updates.amount !== undefined && bill.journal_entry_id) {
      const { reverseJournalEntry } = await import("@/lib/accounting/journal")
      try {
        await reverseJournalEntry(bill.journal_entry_id, "Bill amount updated")

        const newAmount = parseFloat(updates.amount)
        const categoryId = updates.categoryAccountId ?? bill.category_account_id
        const apAccount = await getAccountByNumber(orgId, "2000")

        if (categoryId && apAccount) {
          const newEntryId = await createJournalEntry({
            orgId,
            entryDate: bill.bill_date,
            description: `Vendor Bill (amended): ${updates.description ?? bill.description}`,
            sourceType: "vendor_bill",
            sourceId: billId,
            lines: [
              {
                accountId: categoryId,
                amount: newAmount.toFixed(2),
                description: updates.description ?? bill.description,
              },
              {
                accountId: apAccount.id,
                amount: (-newAmount).toFixed(2),
                description: `AP: ${updates.description ?? bill.description}`,
              },
            ],
            createdBy: userId,
          })

          await withRls(token, (db) =>
            db
              .update(vendorBills)
              .set({ journal_entry_id: newEntryId, updated_at: new Date() })
              .where(and(eq(vendorBills.id, billId), eq(vendorBills.org_id, orgId)))
          )
        }
      } catch (jeErr) {
        console.error("[updateVendorBill] Journal entry reversal failed:", jeErr)
      }
    }

    return { success: true }
  } catch (err) {
    console.error("[updateVendorBill] Error:", err)
    return {
      success: false,
      error: err instanceof Error ? err.message : "Failed to update vendor bill",
    }
  }
}

// ---------------------------------------------------------------------------
// schedulePayment
// ---------------------------------------------------------------------------

/**
 * Schedules a future payment for a vendor bill.
 *
 * Sets status to 'scheduled' and records the planned payment date.
 * Journal entry is created when payment is actually recorded (recordBillPayment).
 *
 * Access: owner only.
 */
export async function schedulePayment(
  billId: string,
  scheduledDate: string
): Promise<{ success: boolean; error?: string }> {
  const token = await getRlsToken()
  if (!token) return { success: false, error: "Not authenticated" }

  const orgId = token.org_id as string
  const userRole = token.user_role as string | undefined

  if (userRole !== "owner") {
    return { success: false, error: "Only owners can schedule payments" }
  }

  try {
    const [bill] = await withRls(token, (db) =>
      db
        .select({ id: vendorBills.id, status: vendorBills.status })
        .from(vendorBills)
        .where(and(eq(vendorBills.id, billId), eq(vendorBills.org_id, orgId)))
        .limit(1)
    )

    if (!bill) {
      return { success: false, error: "Vendor bill not found" }
    }
    if (bill.status === "paid" || bill.status === "void") {
      return { success: false, error: "Cannot schedule payment for a paid or voided bill" }
    }

    await withRls(token, (db) =>
      db
        .update(vendorBills)
        .set({
          status: "scheduled",
          scheduled_date: scheduledDate,
          updated_at: new Date(),
        })
        .where(and(eq(vendorBills.id, billId), eq(vendorBills.org_id, orgId)))
    )

    return { success: true }
  } catch (err) {
    console.error("[schedulePayment] Error:", err)
    return {
      success: false,
      error: err instanceof Error ? err.message : "Failed to schedule payment",
    }
  }
}

// ---------------------------------------------------------------------------
// recordBillPayment
// ---------------------------------------------------------------------------

/**
 * Records payment of a vendor bill.
 *
 * Marks bill as 'paid'. Creates journal entry:
 *   Dr Accounts Payable (2000)
 *   Cr Checking/Bank (1000)
 *
 * Access: owner only.
 */
export async function recordBillPayment(
  billId: string,
  paymentMethod: "check" | "bank_transfer" | "cash",
  referenceNumber?: string
): Promise<{ success: boolean; error?: string }> {
  const token = await getRlsToken()
  if (!token) return { success: false, error: "Not authenticated" }

  const orgId = token.org_id as string
  const userRole = token.user_role as string | undefined
  const userId = token.sub as string | undefined

  if (userRole !== "owner") {
    return { success: false, error: "Only owners can record bill payments" }
  }

  try {
    const [bill] = await withRls(token, (db) =>
      db
        .select({
          id: vendorBills.id,
          status: vendorBills.status,
          amount: vendorBills.amount,
          description: vendorBills.description,
          bill_date: vendorBills.bill_date,
        })
        .from(vendorBills)
        .where(and(eq(vendorBills.id, billId), eq(vendorBills.org_id, orgId)))
        .limit(1)
    )

    if (!bill) {
      return { success: false, error: "Vendor bill not found" }
    }
    if (bill.status === "paid") {
      return { success: false, error: "Bill is already paid" }
    }
    if (bill.status === "void") {
      return { success: false, error: "Cannot pay a voided bill" }
    }

    const paidAt = new Date()
    const today = toLocalDateString(paidAt)

    await withRls(token, (db) =>
      db
        .update(vendorBills)
        .set({
          status: "paid",
          payment_method: paymentMethod,
          payment_reference: referenceNumber ?? null,
          paid_at: paidAt,
          paid_by: userId ?? null,
          updated_at: new Date(),
        })
        .where(and(eq(vendorBills.id, billId), eq(vendorBills.org_id, orgId)))
    )

    // Create payment journal entry: Dr AP (2000), Cr Bank (1000)
    try {
      await ensureChartOfAccounts(orgId)

      const apAccount = await getAccountByNumber(orgId, "2000")
      const bankAccount = await getAccountByNumber(orgId, "1000")

      if (apAccount && bankAccount) {
        const amount = parseFloat(bill.amount)
        const entryId = await createJournalEntry({
          orgId,
          entryDate: today,
          description: `Bill Payment (${paymentMethod}): ${bill.description}`,
          sourceType: "bill_payment",
          sourceId: billId,
          lines: [
            {
              accountId: apAccount.id,
              amount: amount.toFixed(2), // Dr AP: positive = debit (clears the liability)
              description: `Pay bill: ${bill.description}`,
            },
            {
              accountId: bankAccount.id,
              amount: (-amount).toFixed(2), // Cr Bank: negative = credit (money leaves bank)
              description: `${paymentMethod} payment${referenceNumber ? ` #${referenceNumber}` : ""}`,
            },
          ],
          createdBy: userId,
        })

        await withRls(token, (db) =>
          db
            .update(vendorBills)
            .set({ payment_journal_entry_id: entryId, updated_at: new Date() })
            .where(and(eq(vendorBills.id, billId), eq(vendorBills.org_id, orgId)))
        )
      }
    } catch (jeErr) {
      console.error("[recordBillPayment] Journal entry creation failed:", jeErr)
      // Payment recorded — don't fail for accounting error
    }

    return { success: true }
  } catch (err) {
    console.error("[recordBillPayment] Error:", err)
    return {
      success: false,
      error: err instanceof Error ? err.message : "Failed to record bill payment",
    }
  }
}

// ---------------------------------------------------------------------------
// getApAging
// ---------------------------------------------------------------------------

/**
 * Returns AP aging buckets for all outstanding (unpaid + scheduled + overdue) bills.
 *
 * Buckets:
 *   - Current: not yet due (due_date >= today)
 *   - 1-30: 1 to 30 days overdue
 *   - 31-60: 31 to 60 days overdue
 *   - 61-90: 61 to 90 days overdue
 *   - 90+: more than 90 days overdue
 *
 * Access: owner only.
 */
export async function getApAging(): Promise<
  { success: true; aging: ApAging } | { success: false; error: string }
> {
  const token = await getRlsToken()
  if (!token) return { success: false, error: "Not authenticated" }

  const orgId = token.org_id as string
  const userRole = token.user_role as string | undefined

  if (userRole !== "owner") {
    return { success: false, error: "Only owners can view AP aging" }
  }

  try {
    const today = toLocalDateString(new Date())

    // Fetch all outstanding bills (not paid/void)
    const billRows = await withRls(token, (db) =>
      db
        .select({
          id: vendorBills.id,
          vendor_id: vendorBills.vendor_id,
          bill_number: vendorBills.bill_number,
          amount: vendorBills.amount,
          due_date: vendorBills.due_date,
          description: vendorBills.description,
          status: vendorBills.status,
        })
        .from(vendorBills)
        .where(
          and(
            eq(vendorBills.org_id, orgId),
            or(
              eq(vendorBills.status, "unpaid"),
              eq(vendorBills.status, "scheduled")
            )
          )
        )
        .orderBy(asc(vendorBills.due_date))
    )

    // Fetch vendor names
    const vendorRows = await withRls(token, (db) =>
      db
        .select({ id: vendors.id, vendor_name: vendors.vendor_name })
        .from(vendors)
        .where(eq(vendors.org_id, orgId))
    )
    const vendorMap = new Map(vendorRows.map((v) => [v.id, v.vendor_name]))

    const current: ApAgingBucket = { label: "Current", days: "Not yet due", count: 0, total: 0, bills: [] }
    const days1to30: ApAgingBucket = { label: "1-30 Days", days: "1-30 days overdue", count: 0, total: 0, bills: [] }
    const days31to60: ApAgingBucket = { label: "31-60 Days", days: "31-60 days overdue", count: 0, total: 0, bills: [] }
    const days61to90: ApAgingBucket = { label: "61-90 Days", days: "61-90 days overdue", count: 0, total: 0, bills: [] }
    const days90plus: ApAgingBucket = { label: "90+ Days", days: "90+ days overdue", count: 0, total: 0, bills: [] }

    const todayMs = new Date(today).getTime()

    for (const bill of billRows) {
      const amount = parseFloat(bill.amount)
      const dueDateMs = new Date(bill.due_date).getTime()
      const daysOverdue = Math.floor((todayMs - dueDateMs) / (1000 * 60 * 60 * 24))

      const billEntry = {
        id: bill.id,
        vendor_name: vendorMap.get(bill.vendor_id) ?? "Unknown",
        bill_number: bill.bill_number,
        amount: bill.amount,
        due_date: bill.due_date,
        description: bill.description,
        days_overdue: daysOverdue,
      }

      if (daysOverdue <= 0) {
        current.count++
        current.total += amount
        current.bills.push(billEntry)
      } else if (daysOverdue <= 30) {
        days1to30.count++
        days1to30.total += amount
        days1to30.bills.push(billEntry)
      } else if (daysOverdue <= 60) {
        days31to60.count++
        days31to60.total += amount
        days31to60.bills.push(billEntry)
      } else if (daysOverdue <= 90) {
        days61to90.count++
        days61to90.total += amount
        days61to90.bills.push(billEntry)
      } else {
        days90plus.count++
        days90plus.total += amount
        days90plus.bills.push(billEntry)
      }
    }

    const grandTotal =
      current.total + days1to30.total + days31to60.total + days61to90.total + days90plus.total

    return {
      success: true,
      aging: { current, days1to30, days31to60, days61to90, days90plus, grandTotal },
    }
  } catch (err) {
    console.error("[getApAging] Error:", err)
    return {
      success: false,
      error: err instanceof Error ? err.message : "Failed to load AP aging",
    }
  }
}

// ---------------------------------------------------------------------------
// getApSummary
// ---------------------------------------------------------------------------

/**
 * Returns a quick summary of AP obligations.
 *
 * Access: owner only.
 */
export async function getApSummary(): Promise<
  { success: true; summary: ApSummary } | { success: false; error: string }
> {
  const token = await getRlsToken()
  if (!token) return { success: false, error: "Not authenticated" }

  const orgId = token.org_id as string
  const userRole = token.user_role as string | undefined

  if (userRole !== "owner") {
    return { success: false, error: "Only owners can view AP summary" }
  }

  try {
    const today = toLocalDateString(new Date())

    // End of this week (Sunday)
    const todayDate = new Date(today)
    const dayOfWeek = todayDate.getDay() // 0=Sun
    const daysUntilEndOfWeek = 6 - dayOfWeek
    const endOfWeekDate = new Date(todayDate)
    endOfWeekDate.setDate(endOfWeekDate.getDate() + daysUntilEndOfWeek)
    const endOfWeek = toLocalDateString(endOfWeekDate)

    // End of this month
    const year = todayDate.getFullYear()
    const month = todayDate.getMonth() + 1
    const endOfMonth = `${year}-${String(month).padStart(2, "0")}-${String(new Date(year, month, 0).getDate()).padStart(2, "0")}`

    // Fetch all outstanding bills
    const billRows = await withRls(token, (db) =>
      db
        .select({
          amount: vendorBills.amount,
          due_date: vendorBills.due_date,
          status: vendorBills.status,
        })
        .from(vendorBills)
        .where(
          and(
            eq(vendorBills.org_id, orgId),
            or(
              eq(vendorBills.status, "unpaid"),
              eq(vendorBills.status, "scheduled")
            )
          )
        )
    )

    let totalOutstanding = 0
    let totalOverdue = 0
    let dueThisWeek = 0
    let dueThisMonth = 0

    for (const bill of billRows) {
      const amount = parseFloat(bill.amount)
      totalOutstanding += amount

      if (bill.due_date < today) {
        totalOverdue += amount
      }
      if (bill.due_date >= today && bill.due_date <= endOfWeek) {
        dueThisWeek += amount
      }
      if (bill.due_date >= today && bill.due_date <= endOfMonth) {
        dueThisMonth += amount
      }
    }

    return {
      success: true,
      summary: { totalOutstanding, totalOverdue, dueThisWeek, dueThisMonth },
    }
  } catch (err) {
    console.error("[getApSummary] Error:", err)
    return {
      success: false,
      error: err instanceof Error ? err.message : "Failed to load AP summary",
    }
  }
}

// ---------------------------------------------------------------------------
// getVendors (helper for AP workflow UI)
// ---------------------------------------------------------------------------

/**
 * Returns active vendors for the org (used by AP bill entry form).
 *
 * Access: owner + office.
 */
export async function getVendors(): Promise<
  { success: true; vendors: Array<{ id: string; vendor_name: string; contact_email: string | null; contact_phone: string | null }> } | { success: false; error: string }
> {
  const token = await getRlsToken()
  if (!token) return { success: false, error: "Not authenticated" }

  const orgId = token.org_id as string
  const userRole = token.user_role as string | undefined

  if (!userRole || !["owner", "office"].includes(userRole)) {
    return { success: false, error: "Insufficient permissions" }
  }

  try {
    const vendorRows = await withRls(token, (db) =>
      db
        .select({
          id: vendors.id,
          vendor_name: vendors.vendor_name,
          contact_email: vendors.contact_email,
          contact_phone: vendors.contact_phone,
        })
        .from(vendors)
        .where(and(eq(vendors.org_id, orgId), eq(vendors.is_active, true)))
        .orderBy(asc(vendors.vendor_name))
    )

    return { success: true, vendors: vendorRows }
  } catch (err) {
    console.error("[getVendors] Error:", err)
    return {
      success: false,
      error: err instanceof Error ? err.message : "Failed to load vendors",
    }
  }
}

// ---------------------------------------------------------------------------
// createVendorQuick (inline vendor creation from AP form)
// ---------------------------------------------------------------------------

/**
 * Creates a new vendor inline from the AP bill form.
 *
 * Access: owner + office.
 */
export async function createVendorQuick(
  name: string
): Promise<{ success: boolean; vendorId?: string; error?: string }> {
  const token = await getRlsToken()
  if (!token) return { success: false, error: "Not authenticated" }

  const orgId = token.org_id as string
  const userRole = token.user_role as string | undefined

  if (!userRole || !["owner", "office"].includes(userRole)) {
    return { success: false, error: "Insufficient permissions" }
  }

  if (!name || name.trim() === "") {
    return { success: false, error: "Vendor name is required" }
  }

  try {
    const [created] = await withRls(token, (db) =>
      db
        .insert(vendors)
        .values({
          org_id: orgId,
          vendor_name: name.trim(),
          is_active: true,
        })
        .returning({ id: vendors.id })
    )

    return { success: true, vendorId: created?.id }
  } catch (err) {
    console.error("[createVendorQuick] Error:", err)
    return {
      success: false,
      error: err instanceof Error ? err.message : "Failed to create vendor",
    }
  }
}
