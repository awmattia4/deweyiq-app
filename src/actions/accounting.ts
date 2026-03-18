"use server"

/**
 * accounting.ts — Server actions for chart of accounts, journal entries,
 * sales tax, period close, and audit trail.
 *
 * Access control:
 * - Chart of accounts: owner + office (read); owner only (write)
 * - Journal entries: owner + office (read); owner only (manual entries)
 * - Manual journal entries: owner only, accountant_mode_enabled required
 * - Sales tax / period close / audit trail: owner only
 *
 * Key patterns:
 * - withRls for all user-facing queries
 * - adminDb only for system operations (seeding)
 * - ensureChartOfAccounts called before any CoA read
 */

import { createClient } from "@/lib/supabase/server"
import { withRls, getRlsToken, adminDb } from "@/lib/db"
import type { SupabaseToken } from "@/lib/db"
import {
  chartOfAccounts,
  journalEntries,
  journalEntryLines,
  orgSettings,
  accountingPeriods,
  profiles,
} from "@/lib/db/schema"
import { and, asc, desc, eq, gte, lte, or, sql } from "drizzle-orm"
import { ensureChartOfAccounts } from "@/lib/accounting/journal"
import { createJournalEntry, validateEntryBalance } from "@/lib/accounting/journal"

// ---------------------------------------------------------------------------
// Auth helper
// ---------------------------------------------------------------------------


// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface AccountRow {
  id: string
  org_id: string
  account_number: string
  account_name: string
  account_type: string
  display_name: string
  parent_id: string | null
  is_system: boolean
  is_active: boolean
  created_at: Date
  updated_at: Date
  /** Running balance: sum of all journal_entry_lines (positive = net debit) */
  balance: string
}

export interface JournalEntryLineRow {
  id: string
  account_id: string
  accountName: string
  accountNumber: string
  amount: string
  description: string | null
}

export interface JournalEntryRow {
  id: string
  org_id: string
  entry_date: string
  description: string
  source_type: string
  source_id: string | null
  is_posted: boolean
  is_reversed: boolean
  reversal_of: string | null
  created_at: Date
  lines: JournalEntryLineRow[]
}

// ---------------------------------------------------------------------------
// getChartOfAccounts
// ---------------------------------------------------------------------------

/**
 * Returns all chart of accounts entries for the org, ordered by account number.
 *
 * Includes a running balance for each account (sum of all journal_entry_lines).
 * Calls ensureChartOfAccounts to lazy-seed if needed.
 *
 * Access: owner + office only.
 */
export async function getChartOfAccounts(): Promise<
  { success: true; accounts: AccountRow[] } | { success: false; error: string }
> {
  const token = await getRlsToken()
  if (!token) return { success: false, error: "Not authenticated" }

  const orgId = token.org_id as string
  const userRole = token.user_role as string | undefined

  if (!userRole || !["owner", "office"].includes(userRole)) {
    return { success: false, error: "Insufficient permissions" }
  }

  try {
    // Seed if needed (uses adminDb internally)
    await ensureChartOfAccounts(orgId)

    // Fetch all accounts
    const accountRows = await withRls(token, (db) =>
      db
        .select()
        .from(chartOfAccounts)
        .where(eq(chartOfAccounts.org_id, orgId))
        .orderBy(asc(chartOfAccounts.account_number))
    )

    // Fetch running balances for all accounts in one query
    // Balance = sum of journal_entry_lines.amount (positive = net debit)
    const balanceRows = await withRls(token, (db) =>
      db
        .select({
          account_id: journalEntryLines.account_id,
          balance: sql<string>`COALESCE(SUM(${journalEntryLines.amount}::numeric), 0)::text`,
        })
        .from(journalEntryLines)
        .where(eq(journalEntryLines.org_id, orgId))
        .groupBy(journalEntryLines.account_id)
    )

    const balanceMap = new Map(balanceRows.map((r) => [r.account_id, r.balance]))

    const accounts: AccountRow[] = accountRows.map((row) => ({
      id: row.id,
      org_id: row.org_id,
      account_number: row.account_number,
      account_name: row.account_name,
      account_type: row.account_type,
      display_name: row.display_name,
      parent_id: row.parent_id ?? null,
      is_system: row.is_system,
      is_active: row.is_active,
      created_at: row.created_at,
      updated_at: row.updated_at,
      balance: balanceMap.get(row.id) ?? "0",
    }))

    return { success: true, accounts }
  } catch (err) {
    console.error("[getChartOfAccounts] Error:", err)
    return {
      success: false,
      error: err instanceof Error ? err.message : "Failed to load chart of accounts",
    }
  }
}

// ---------------------------------------------------------------------------
// createAccount
// ---------------------------------------------------------------------------

/**
 * Creates a custom account in the chart of accounts.
 *
 * Access: owner only.
 * Cannot duplicate an existing account number within the org.
 */
export async function createAccount(input: {
  accountNumber: string
  accountName: string
  accountType: "asset" | "liability" | "equity" | "income" | "expense"
  displayName: string
  parentId?: string
}): Promise<{ success: boolean; accountId?: string; error?: string }> {
  const token = await getRlsToken()
  if (!token) return { success: false, error: "Not authenticated" }

  const orgId = token.org_id as string
  const userRole = token.user_role as string | undefined

  if (userRole !== "owner") {
    return { success: false, error: "Only owners can create accounts" }
  }

  try {
    // Check for duplicate account number
    const existing = await withRls(token, (db) =>
      db
        .select({ id: chartOfAccounts.id })
        .from(chartOfAccounts)
        .where(
          and(
            eq(chartOfAccounts.org_id, orgId),
            eq(chartOfAccounts.account_number, input.accountNumber)
          )
        )
        .limit(1)
    )

    if (existing.length > 0) {
      return {
        success: false,
        error: `Account number ${input.accountNumber} already exists`,
      }
    }

    const [created] = await withRls(token, (db) =>
      db
        .insert(chartOfAccounts)
        .values({
          org_id: orgId,
          account_number: input.accountNumber,
          account_name: input.accountName,
          account_type: input.accountType,
          display_name: input.displayName,
          parent_id: input.parentId ?? null,
          is_system: false,
          is_active: true,
        })
        .returning({ id: chartOfAccounts.id })
    )

    return { success: true, accountId: created?.id }
  } catch (err) {
    console.error("[createAccount] Error:", err)
    return {
      success: false,
      error: err instanceof Error ? err.message : "Failed to create account",
    }
  }
}

// ---------------------------------------------------------------------------
// updateAccount
// ---------------------------------------------------------------------------

/**
 * Updates an account's display name or account name.
 *
 * Access: owner only.
 * Cannot change the account_type or account_number of system accounts.
 */
export async function updateAccount(
  accountId: string,
  updates: {
    accountName?: string
    displayName?: string
    accountType?: "asset" | "liability" | "equity" | "income" | "expense"
    accountNumber?: string
    isActive?: boolean
  }
): Promise<{ success: boolean; error?: string }> {
  const token = await getRlsToken()
  if (!token) return { success: false, error: "Not authenticated" }

  const orgId = token.org_id as string
  const userRole = token.user_role as string | undefined

  if (userRole !== "owner") {
    return { success: false, error: "Only owners can update accounts" }
  }

  try {
    const [account] = await withRls(token, (db) =>
      db
        .select({ is_system: chartOfAccounts.is_system })
        .from(chartOfAccounts)
        .where(
          and(eq(chartOfAccounts.id, accountId), eq(chartOfAccounts.org_id, orgId))
        )
        .limit(1)
    )

    if (!account) {
      return { success: false, error: "Account not found" }
    }

    // System accounts: only name/display_name can be changed
    if (account.is_system) {
      if (updates.accountType !== undefined || updates.accountNumber !== undefined) {
        return {
          success: false,
          error: "Cannot change account_type or account_number of system accounts",
        }
      }
    }

    const setValues: Partial<typeof chartOfAccounts.$inferInsert> = {
      updated_at: new Date(),
    }
    if (updates.accountName !== undefined) setValues.account_name = updates.accountName
    if (updates.displayName !== undefined) setValues.display_name = updates.displayName
    if (updates.accountType !== undefined) setValues.account_type = updates.accountType
    if (updates.accountNumber !== undefined) setValues.account_number = updates.accountNumber
    if (updates.isActive !== undefined) setValues.is_active = updates.isActive

    await withRls(token, (db) =>
      db
        .update(chartOfAccounts)
        .set(setValues)
        .where(and(eq(chartOfAccounts.id, accountId), eq(chartOfAccounts.org_id, orgId)))
    )

    return { success: true }
  } catch (err) {
    console.error("[updateAccount] Error:", err)
    return {
      success: false,
      error: err instanceof Error ? err.message : "Failed to update account",
    }
  }
}

// ---------------------------------------------------------------------------
// deleteAccount
// ---------------------------------------------------------------------------

/**
 * Deletes a custom account.
 *
 * Access: owner only.
 * Cannot delete system accounts.
 * Cannot delete accounts with existing journal_entry_lines.
 */
export async function deleteAccount(
  accountId: string
): Promise<{ success: boolean; error?: string }> {
  const token = await getRlsToken()
  if (!token) return { success: false, error: "Not authenticated" }

  const orgId = token.org_id as string
  const userRole = token.user_role as string | undefined

  if (userRole !== "owner") {
    return { success: false, error: "Only owners can delete accounts" }
  }

  try {
    const [account] = await withRls(token, (db) =>
      db
        .select({ is_system: chartOfAccounts.is_system })
        .from(chartOfAccounts)
        .where(
          and(eq(chartOfAccounts.id, accountId), eq(chartOfAccounts.org_id, orgId))
        )
        .limit(1)
    )

    if (!account) {
      return { success: false, error: "Account not found" }
    }

    if (account.is_system) {
      return { success: false, error: "Cannot delete system accounts" }
    }

    // Check for existing journal_entry_lines
    const hasTransactions = await withRls(token, (db) =>
      db
        .select({ id: journalEntryLines.id })
        .from(journalEntryLines)
        .where(eq(journalEntryLines.account_id, accountId))
        .limit(1)
    )

    if (hasTransactions.length > 0) {
      return {
        success: false,
        error: "Cannot delete an account with existing transactions. Deactivate it instead.",
      }
    }

    await withRls(token, (db) =>
      db
        .delete(chartOfAccounts)
        .where(and(eq(chartOfAccounts.id, accountId), eq(chartOfAccounts.org_id, orgId)))
    )

    return { success: true }
  } catch (err) {
    console.error("[deleteAccount] Error:", err)
    return {
      success: false,
      error: err instanceof Error ? err.message : "Failed to delete account",
    }
  }
}

// ---------------------------------------------------------------------------
// getJournalEntries
// ---------------------------------------------------------------------------

/**
 * Returns a paginated list of journal entries with their lines.
 *
 * Access: owner + office only.
 */
export async function getJournalEntries(filters?: {
  startDate?: string
  endDate?: string
  sourceType?: string
  accountId?: string
  limit?: number
  offset?: number
}): Promise<
  | { success: true; entries: JournalEntryRow[]; total: number }
  | { success: false; error: string }
> {
  const token = await getRlsToken()
  if (!token) return { success: false, error: "Not authenticated" }

  const orgId = token.org_id as string
  const userRole = token.user_role as string | undefined

  if (!userRole || !["owner", "office"].includes(userRole)) {
    return { success: false, error: "Insufficient permissions" }
  }

  try {
    const pageLimit = filters?.limit ?? 50
    const pageOffset = filters?.offset ?? 0

    // Build conditions
    const conditions = [eq(journalEntries.org_id, orgId)]

    if (filters?.startDate) {
      conditions.push(gte(journalEntries.entry_date, filters.startDate))
    }
    if (filters?.endDate) {
      conditions.push(lte(journalEntries.entry_date, filters.endDate))
    }
    if (filters?.sourceType) {
      conditions.push(eq(journalEntries.source_type, filters.sourceType))
    }

    // Fetch entries
    const entryRows = await withRls(token, (db) =>
      db
        .select()
        .from(journalEntries)
        .where(and(...conditions))
        .orderBy(desc(journalEntries.entry_date), desc(journalEntries.created_at))
        .limit(pageLimit)
        .offset(pageOffset)
    )

    if (entryRows.length === 0) {
      return { success: true, entries: [], total: 0 }
    }

    const entryIds = entryRows.map((e) => e.id)

    // Fetch all lines for the returned entries with account info
    // Using two queries to avoid RLS correlated subquery pitfall (MEMORY.md)
    const lineRows = await withRls(token, (db) =>
      db
        .select({
          id: journalEntryLines.id,
          journal_entry_id: journalEntryLines.journal_entry_id,
          account_id: journalEntryLines.account_id,
          amount: journalEntryLines.amount,
          description: journalEntryLines.description,
        })
        .from(journalEntryLines)
        .where(eq(journalEntryLines.org_id, orgId))
    )

    // Fetch account info for line display
    const accountRows = await withRls(token, (db) =>
      db
        .select({
          id: chartOfAccounts.id,
          account_name: chartOfAccounts.account_name,
          account_number: chartOfAccounts.account_number,
        })
        .from(chartOfAccounts)
        .where(eq(chartOfAccounts.org_id, orgId))
    )

    const accountMap = new Map(
      accountRows.map((a) => [a.id, { name: a.account_name, number: a.account_number }])
    )

    // Group lines by entry ID (filter to only entries on this page)
    const entryIdSet = new Set(entryIds)
    const linesByEntry = new Map<string, JournalEntryLineRow[]>()

    for (const line of lineRows) {
      if (!entryIdSet.has(line.journal_entry_id)) continue

      const account = accountMap.get(line.account_id)
      const lineRow: JournalEntryLineRow = {
        id: line.id,
        account_id: line.account_id,
        accountName: account?.name ?? "Unknown Account",
        accountNumber: account?.number ?? "",
        amount: line.amount,
        description: line.description ?? null,
      }

      const existing = linesByEntry.get(line.journal_entry_id) ?? []
      existing.push(lineRow)
      linesByEntry.set(line.journal_entry_id, existing)
    }

    // Filter by accountId if requested
    let filteredEntryRows = entryRows
    if (filters?.accountId) {
      filteredEntryRows = entryRows.filter((entry) => {
        const lines = linesByEntry.get(entry.id) ?? []
        return lines.some((l) => l.account_id === filters.accountId)
      })
    }

    // Count total (approximate — full count without pagination)
    const [countResult] = await withRls(token, (db) =>
      db
        .select({ count: sql<string>`COUNT(*)::text` })
        .from(journalEntries)
        .where(and(...conditions))
    )
    const total = parseInt(countResult?.count ?? "0", 10)

    const entries: JournalEntryRow[] = filteredEntryRows.map((entry) => ({
      id: entry.id,
      org_id: entry.org_id,
      entry_date: entry.entry_date,
      description: entry.description,
      source_type: entry.source_type,
      source_id: entry.source_id ?? null,
      is_posted: entry.is_posted,
      is_reversed: entry.is_reversed,
      reversal_of: entry.reversal_of ?? null,
      created_at: entry.created_at,
      lines: linesByEntry.get(entry.id) ?? [],
    }))

    return { success: true, entries, total }
  } catch (err) {
    console.error("[getJournalEntries] Error:", err)
    return {
      success: false,
      error: err instanceof Error ? err.message : "Failed to load journal entries",
    }
  }
}

// ---------------------------------------------------------------------------
// createManualJournalEntry
// ---------------------------------------------------------------------------

/**
 * Creates a manual journal entry (accountant mode only).
 *
 * Access: owner only, and org_settings.accountant_mode_enabled must be true.
 * Validates balance before creating (must sum to zero within ±0.01).
 */
export async function createManualJournalEntry(input: {
  entryDate: string
  description: string
  lines: Array<{
    accountId: string
    amount: string
    description?: string
  }>
}): Promise<{ success: boolean; entryId?: string; error?: string }> {
  const token = await getRlsToken()
  if (!token) return { success: false, error: "Not authenticated" }

  const orgId = token.org_id as string
  const userRole = token.user_role as string | undefined
  const userId = token.sub as string | undefined

  if (userRole !== "owner") {
    return { success: false, error: "Only owners can create manual journal entries" }
  }

  try {
    // Check accountant_mode_enabled
    const [settings] = await withRls(token, (db) =>
      db
        .select({ accountant_mode_enabled: orgSettings.accountant_mode_enabled })
        .from(orgSettings)
        .where(eq(orgSettings.org_id, orgId))
        .limit(1)
    )

    if (!settings?.accountant_mode_enabled) {
      return {
        success: false,
        error: "Accountant mode must be enabled to create manual journal entries",
      }
    }

    // Validate balance
    validateEntryBalance(input.lines)

    // Create entry
    const entryId = await createJournalEntry({
      orgId,
      entryDate: input.entryDate,
      description: input.description,
      sourceType: "manual",
      lines: input.lines,
      createdBy: userId,
    })

    return { success: true, entryId }
  } catch (err) {
    console.error("[createManualJournalEntry] Error:", err)
    return {
      success: false,
      error: err instanceof Error ? err.message : "Failed to create journal entry",
    }
  }
}

// ===========================================================================
// Sales Tax Management
// ===========================================================================

export interface SalesTaxRate {
  jurisdiction: string
  rate: number
}

export interface SalesTaxReport {
  startDate: string
  endDate: string
  totalCollected: number
  totalRemitted: number
  net: number
}

/**
 * Returns the org's configured sales tax rates.
 *
 * Falls back to { jurisdiction: "Default", rate: default_tax_rate } when
 * no custom rates have been configured.
 *
 * Access: owner only.
 */
export async function getSalesTaxRates(): Promise<
  { success: true; rates: SalesTaxRate[]; defaultRate: number } | { success: false; error: string }
> {
  const token = await getRlsToken()
  if (!token) return { success: false, error: "Not authenticated" }

  const orgId = token.org_id as string
  const userRole = token.user_role as string | undefined

  if (userRole !== "owner") {
    return { success: false, error: "Only owners can manage sales tax" }
  }

  try {
    const [settings] = await withRls(token, (db) =>
      db
        .select({
          default_tax_rate: orgSettings.default_tax_rate,
          sales_tax_rates: orgSettings.sales_tax_rates,
        })
        .from(orgSettings)
        .where(eq(orgSettings.org_id, orgId))
        .limit(1)
    )

    const defaultRate = parseFloat(settings?.default_tax_rate ?? "0.0875")
    const rates: SalesTaxRate[] = settings?.sales_tax_rates ?? []

    return { success: true, rates, defaultRate }
  } catch (err) {
    console.error("[getSalesTaxRates] Error:", err)
    return {
      success: false,
      error: err instanceof Error ? err.message : "Failed to load tax rates",
    }
  }
}

/**
 * Updates the org's sales tax rate configuration.
 *
 * Access: owner only.
 */
export async function updateSalesTaxRates(
  rates: SalesTaxRate[]
): Promise<{ success: boolean; error?: string }> {
  const token = await getRlsToken()
  if (!token) return { success: false, error: "Not authenticated" }

  const orgId = token.org_id as string
  const userRole = token.user_role as string | undefined

  if (userRole !== "owner") {
    return { success: false, error: "Only owners can update sales tax rates" }
  }

  try {
    // Validate rates
    for (const rate of rates) {
      if (!rate.jurisdiction || rate.jurisdiction.trim() === "") {
        return { success: false, error: "Each tax rate must have a jurisdiction name" }
      }
      if (rate.rate < 0 || rate.rate > 1) {
        return { success: false, error: `Rate for "${rate.jurisdiction}" must be between 0 and 1 (e.g. 0.07 for 7%)` }
      }
    }

    await withRls(token, (db) =>
      db
        .update(orgSettings)
        .set({ sales_tax_rates: rates, updated_at: new Date() })
        .where(eq(orgSettings.org_id, orgId))
    )

    return { success: true }
  } catch (err) {
    console.error("[updateSalesTaxRates] Error:", err)
    return {
      success: false,
      error: err instanceof Error ? err.message : "Failed to update tax rates",
    }
  }
}

/**
 * Returns a summary of sales tax collected for a given date range.
 *
 * Reads credit-side journal_entry_lines on account 2100 (Sales Tax Payable).
 * Collected = sum of credits to 2100 (negative amounts in our convention).
 * Remitted = sum of debits to 2100 (positive amounts = payments to tax authority).
 *
 * Access: owner only.
 */
export async function getSalesTaxReport(
  startDate: string,
  endDate: string
): Promise<
  { success: true; report: SalesTaxReport } | { success: false; error: string }
> {
  const token = await getRlsToken()
  if (!token) return { success: false, error: "Not authenticated" }

  const orgId = token.org_id as string
  const userRole = token.user_role as string | undefined

  if (userRole !== "owner") {
    return { success: false, error: "Only owners can view tax reports" }
  }

  try {
    await ensureChartOfAccounts(orgId)

    // Find account 2100 — Sales Tax Payable
    const [taxAccount] = await withRls(token, (db) =>
      db
        .select({ id: chartOfAccounts.id })
        .from(chartOfAccounts)
        .where(
          and(
            eq(chartOfAccounts.org_id, orgId),
            eq(chartOfAccounts.account_number, "2100")
          )
        )
        .limit(1)
    )

    if (!taxAccount) {
      return { success: true, report: { startDate, endDate, totalCollected: 0, totalRemitted: 0, net: 0 } }
    }

    // Get all journal entries in the date range
    const entryRows = await withRls(token, (db) =>
      db
        .select({ id: journalEntries.id })
        .from(journalEntries)
        .where(
          and(
            eq(journalEntries.org_id, orgId),
            gte(journalEntries.entry_date, startDate),
            lte(journalEntries.entry_date, endDate)
          )
        )
    )

    if (entryRows.length === 0) {
      return { success: true, report: { startDate, endDate, totalCollected: 0, totalRemitted: 0, net: 0 } }
    }

    // Get tax account lines for these entries
    const [taxSums] = await withRls(token, (db) =>
      db
        .select({
          // Negative amounts = credits to tax payable (collected from customers)
          collected: sql<string>`COALESCE(SUM(CASE WHEN ${journalEntryLines.amount}::numeric < 0 THEN ABS(${journalEntryLines.amount}::numeric) ELSE 0 END), 0)::text`,
          // Positive amounts = debits to tax payable (paid to tax authority)
          remitted: sql<string>`COALESCE(SUM(CASE WHEN ${journalEntryLines.amount}::numeric > 0 THEN ${journalEntryLines.amount}::numeric ELSE 0 END), 0)::text`,
        })
        .from(journalEntryLines)
        .where(
          and(
            eq(journalEntryLines.org_id, orgId),
            eq(journalEntryLines.account_id, taxAccount.id)
          )
        )
    )

    const totalCollected = parseFloat(taxSums?.collected ?? "0")
    const totalRemitted = parseFloat(taxSums?.remitted ?? "0")

    return {
      success: true,
      report: {
        startDate,
        endDate,
        totalCollected,
        totalRemitted,
        net: totalCollected - totalRemitted,
      },
    }
  } catch (err) {
    console.error("[getSalesTaxReport] Error:", err)
    return {
      success: false,
      error: err instanceof Error ? err.message : "Failed to generate tax report",
    }
  }
}

// ===========================================================================
// Period Close Management
// ===========================================================================

export interface AccountingPeriodRow {
  id: string
  org_id: string
  period_start: string
  period_end: string
  status: string
  closed_at: Date | null
  closed_by: string | null
  closed_by_name: string | null
  created_at: Date
}

/**
 * Returns all accounting periods for the org, ordered newest first.
 *
 * Access: owner only.
 */
export async function getAccountingPeriods(): Promise<
  { success: true; periods: AccountingPeriodRow[] } | { success: false; error: string }
> {
  const token = await getRlsToken()
  if (!token) return { success: false, error: "Not authenticated" }

  const orgId = token.org_id as string
  const userRole = token.user_role as string | undefined

  if (userRole !== "owner") {
    return { success: false, error: "Only owners can manage accounting periods" }
  }

  try {
    const periodRows = await withRls(token, (db) =>
      db
        .select({
          id: accountingPeriods.id,
          org_id: accountingPeriods.org_id,
          period_start: accountingPeriods.period_start,
          period_end: accountingPeriods.period_end,
          status: accountingPeriods.status,
          closed_at: accountingPeriods.closed_at,
          closed_by: accountingPeriods.closed_by,
          created_at: accountingPeriods.created_at,
        })
        .from(accountingPeriods)
        .where(eq(accountingPeriods.org_id, orgId))
        .orderBy(desc(accountingPeriods.period_start))
    )

    // Fetch closed_by profile names in one query
    const closedByIds = periodRows
      .map((p) => p.closed_by)
      .filter(Boolean) as string[]

    const profileMap = new Map<string, string>()
    if (closedByIds.length > 0) {
      const profileRows = await withRls(token, (db) =>
        db
          .select({ id: profiles.id, full_name: profiles.full_name })
          .from(profiles)
          .where(eq(profiles.org_id, orgId))
      )
      for (const p of profileRows) {
        profileMap.set(p.id, p.full_name)
      }
    }

    const periods: AccountingPeriodRow[] = periodRows.map((p) => ({
      id: p.id,
      org_id: p.org_id,
      period_start: p.period_start,
      period_end: p.period_end,
      status: p.status,
      closed_at: p.closed_at,
      closed_by: p.closed_by,
      closed_by_name: p.closed_by ? (profileMap.get(p.closed_by) ?? null) : null,
      created_at: p.created_at,
    }))

    return { success: true, periods }
  } catch (err) {
    console.error("[getAccountingPeriods] Error:", err)
    return {
      success: false,
      error: err instanceof Error ? err.message : "Failed to load accounting periods",
    }
  }
}

/**
 * Creates a new accounting period.
 *
 * Validates that the period does not overlap with existing periods.
 * Access: owner only.
 */
export async function createAccountingPeriod(
  periodStart: string,
  periodEnd: string
): Promise<{ success: boolean; periodId?: string; error?: string }> {
  const token = await getRlsToken()
  if (!token) return { success: false, error: "Not authenticated" }

  const orgId = token.org_id as string
  const userRole = token.user_role as string | undefined

  if (userRole !== "owner") {
    return { success: false, error: "Only owners can create accounting periods" }
  }

  if (periodStart >= periodEnd) {
    return { success: false, error: "Period start must be before period end" }
  }

  try {
    // Check for overlapping periods
    const overlapping = await withRls(token, (db) =>
      db
        .select({ id: accountingPeriods.id })
        .from(accountingPeriods)
        .where(
          and(
            eq(accountingPeriods.org_id, orgId),
            // Overlap condition: new period overlaps if start < existing.end AND end > existing.start
            sql`${accountingPeriods.period_start} < ${periodEnd}::date`,
            sql`${accountingPeriods.period_end} > ${periodStart}::date`
          )
        )
        .limit(1)
    )

    if (overlapping.length > 0) {
      return { success: false, error: "This period overlaps with an existing accounting period" }
    }

    const [created] = await withRls(token, (db) =>
      db
        .insert(accountingPeriods)
        .values({
          org_id: orgId,
          period_start: periodStart,
          period_end: periodEnd,
          status: "open",
        })
        .returning({ id: accountingPeriods.id })
    )

    return { success: true, periodId: created?.id }
  } catch (err) {
    console.error("[createAccountingPeriod] Error:", err)
    return {
      success: false,
      error: err instanceof Error ? err.message : "Failed to create accounting period",
    }
  }
}

/**
 * Closes an accounting period.
 *
 * After closing, createJournalEntry will reject any entries dated within
 * this period (enforced in journal.ts). Sets closed_at and closed_by.
 *
 * Access: owner only.
 */
export async function closePeriod(
  periodId: string
): Promise<{ success: boolean; error?: string }> {
  const token = await getRlsToken()
  if (!token) return { success: false, error: "Not authenticated" }

  const orgId = token.org_id as string
  const userRole = token.user_role as string | undefined
  const userId = token.sub as string | undefined

  if (userRole !== "owner") {
    return { success: false, error: "Only owners can close accounting periods" }
  }

  try {
    const [period] = await withRls(token, (db) =>
      db
        .select({ id: accountingPeriods.id, status: accountingPeriods.status })
        .from(accountingPeriods)
        .where(
          and(
            eq(accountingPeriods.id, periodId),
            eq(accountingPeriods.org_id, orgId)
          )
        )
        .limit(1)
    )

    if (!period) {
      return { success: false, error: "Period not found" }
    }
    if (period.status === "closed") {
      return { success: false, error: "Period is already closed" }
    }

    await withRls(token, (db) =>
      db
        .update(accountingPeriods)
        .set({
          status: "closed",
          closed_at: new Date(),
          closed_by: userId ?? null,
          updated_at: new Date(),
        })
        .where(and(eq(accountingPeriods.id, periodId), eq(accountingPeriods.org_id, orgId)))
    )

    return { success: true }
  } catch (err) {
    console.error("[closePeriod] Error:", err)
    return {
      success: false,
      error: err instanceof Error ? err.message : "Failed to close period",
    }
  }
}

/**
 * Reopens a closed accounting period.
 *
 * Safety net for corrections. After reopening, journal entries can be
 * posted to dates within this period again.
 *
 * Access: owner only.
 */
export async function reopenPeriod(
  periodId: string
): Promise<{ success: boolean; error?: string }> {
  const token = await getRlsToken()
  if (!token) return { success: false, error: "Not authenticated" }

  const orgId = token.org_id as string
  const userRole = token.user_role as string | undefined

  if (userRole !== "owner") {
    return { success: false, error: "Only owners can reopen accounting periods" }
  }

  try {
    const [period] = await withRls(token, (db) =>
      db
        .select({ id: accountingPeriods.id, status: accountingPeriods.status })
        .from(accountingPeriods)
        .where(
          and(
            eq(accountingPeriods.id, periodId),
            eq(accountingPeriods.org_id, orgId)
          )
        )
        .limit(1)
    )

    if (!period) {
      return { success: false, error: "Period not found" }
    }
    if (period.status === "open") {
      return { success: false, error: "Period is already open" }
    }

    await withRls(token, (db) =>
      db
        .update(accountingPeriods)
        .set({
          status: "open",
          closed_at: null,
          closed_by: null,
          updated_at: new Date(),
        })
        .where(and(eq(accountingPeriods.id, periodId), eq(accountingPeriods.org_id, orgId)))
    )

    return { success: true }
  } catch (err) {
    console.error("[reopenPeriod] Error:", err)
    return {
      success: false,
      error: err instanceof Error ? err.message : "Failed to reopen period",
    }
  }
}

// ===========================================================================
// Audit Trail
// ===========================================================================

export interface AuditTrailEntry {
  id: string
  date: string
  action: string
  description: string
  source_type: string
  source_id: string | null
  user_name: string | null
  amount: number | null
  is_reversed: boolean
  reversal_of: string | null
  created_at: Date
}

export interface AuditTrailFilters {
  entityType?: string
  entityId?: string
  userId?: string
  startDate?: string
  endDate?: string
  limit?: number
  offset?: number
}

/**
 * Returns a chronological audit trail of financial events.
 *
 * Uses the immutable journal_entries table as the source of truth.
 * Reversals are linked to their originals via reversal_of.
 * Amounts shown are the total absolute debit value (sum of positive lines).
 *
 * Access: owner only.
 */
export async function getAuditTrail(
  filters?: AuditTrailFilters
): Promise<
  { success: true; entries: AuditTrailEntry[]; total: number } | { success: false; error: string }
> {
  const token = await getRlsToken()
  if (!token) return { success: false, error: "Not authenticated" }

  const orgId = token.org_id as string
  const userRole = token.user_role as string | undefined

  if (userRole !== "owner") {
    return { success: false, error: "Only owners can view the audit trail" }
  }

  try {
    const pageLimit = filters?.limit ?? 100
    const pageOffset = filters?.offset ?? 0

    const conditions = [eq(journalEntries.org_id, orgId)]

    if (filters?.startDate) {
      conditions.push(gte(journalEntries.entry_date, filters.startDate))
    }
    if (filters?.endDate) {
      conditions.push(lte(journalEntries.entry_date, filters.endDate))
    }
    if (filters?.entityType) {
      conditions.push(eq(journalEntries.source_type, filters.entityType))
    }
    if (filters?.entityId) {
      conditions.push(sql`${journalEntries.source_id} = ${filters.entityId}`)
    }
    if (filters?.userId) {
      conditions.push(sql`${journalEntries.created_by} = ${filters.userId}::uuid`)
    }

    const entryRows = await withRls(token, (db) =>
      db
        .select({
          id: journalEntries.id,
          entry_date: journalEntries.entry_date,
          description: journalEntries.description,
          source_type: journalEntries.source_type,
          source_id: journalEntries.source_id,
          is_reversed: journalEntries.is_reversed,
          reversal_of: journalEntries.reversal_of,
          created_by: journalEntries.created_by,
          created_at: journalEntries.created_at,
        })
        .from(journalEntries)
        .where(and(...conditions))
        .orderBy(desc(journalEntries.created_at))
        .limit(pageLimit)
        .offset(pageOffset)
    )

    // Count total
    const [countResult] = await withRls(token, (db) =>
      db
        .select({ count: sql<string>`COUNT(*)::text` })
        .from(journalEntries)
        .where(and(...conditions))
    )
    const total = parseInt(countResult?.count ?? "0", 10)

    if (entryRows.length === 0) {
      return { success: true, entries: [], total }
    }

    // Fetch creator profile names
    const creatorIds = entryRows.map((e) => e.created_by).filter(Boolean) as string[]
    const profileMap = new Map<string, string>()

    if (creatorIds.length > 0) {
      const profileRows = await withRls(token, (db) =>
        db
          .select({ id: profiles.id, full_name: profiles.full_name })
          .from(profiles)
          .where(eq(profiles.org_id, orgId))
      )
      for (const p of profileRows) {
        profileMap.set(p.id, p.full_name)
      }
    }

    // Fetch total debits per entry for amount display
    const entryIds = entryRows.map((e) => e.id)
    const amountRows = await withRls(token, (db) =>
      db
        .select({
          journal_entry_id: journalEntryLines.journal_entry_id,
          total_debit: sql<string>`COALESCE(SUM(CASE WHEN ${journalEntryLines.amount}::numeric > 0 THEN ${journalEntryLines.amount}::numeric ELSE 0 END), 0)::text`,
        })
        .from(journalEntryLines)
        .where(eq(journalEntryLines.org_id, orgId))
        .groupBy(journalEntryLines.journal_entry_id)
    )

    const entryIdSet = new Set(entryIds)
    const amountMap = new Map<string, number>()
    for (const row of amountRows) {
      if (entryIdSet.has(row.journal_entry_id)) {
        amountMap.set(row.journal_entry_id, parseFloat(row.total_debit))
      }
    }

    const entries: AuditTrailEntry[] = entryRows.map((entry) => ({
      id: entry.id,
      date: entry.entry_date,
      action: entry.reversal_of
        ? "Reversal"
        : entry.is_reversed
        ? "Reversed Entry"
        : "Journal Entry",
      description: entry.description,
      source_type: entry.source_type,
      source_id: entry.source_id,
      user_name: entry.created_by ? (profileMap.get(entry.created_by) ?? null) : null,
      amount: amountMap.get(entry.id) ?? null,
      is_reversed: entry.is_reversed,
      reversal_of: entry.reversal_of ?? null,
      created_at: entry.created_at,
    }))

    return { success: true, entries, total }
  } catch (err) {
    console.error("[getAuditTrail] Error:", err)
    return {
      success: false,
      error: err instanceof Error ? err.message : "Failed to load audit trail",
    }
  }
}
