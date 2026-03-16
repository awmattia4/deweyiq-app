/**
 * Chart of Accounts — Pool Company Seed Data
 *
 * Pre-seeded chart of accounts designed for pool service companies.
 * Uses the standard account numbering convention (1xxx=assets, 2xxx=liabilities,
 * 3xxx=equity, 4xxx=income, 5xxx-6xxx=expenses).
 *
 * display_name is the user-friendly label shown in DeweyIQ's simplified accounting view.
 * account_name is the formal accounting name used in reports and exports.
 *
 * Usage:
 *   - seedChartOfAccounts(orgId) — called once when owner enables accountant mode
 *   - getChartOfAccounts(token) — list all accounts for the org
 *   - getAccountByNumber(token, orgId, number) — fetch a specific account (for JE generation)
 */

import { adminDb, withRls, type SupabaseToken } from "@/lib/db"
import { chartOfAccounts } from "@/lib/db/schema"
import { and, asc, eq } from "drizzle-orm"

// ============================================================
// Seed data — 22 pool-company-specific accounts
// ============================================================

export type PoolAccountSeed = {
  account_number: string
  account_name: string
  account_type: "asset" | "liability" | "equity" | "income" | "expense"
  display_name: string
  is_system: boolean
}

export const POOL_COMPANY_ACCOUNTS: PoolAccountSeed[] = [
  // ─── ASSETS (1xxx) ───────────────────────────────────────────
  {
    account_number: "1000",
    account_name: "Checking Account",
    account_type: "asset",
    display_name: "Checking Account",
    is_system: true,
  },
  {
    account_number: "1010",
    account_name: "Savings Account",
    account_type: "asset",
    display_name: "Savings Account",
    is_system: true,
  },
  {
    account_number: "1020",
    account_name: "Stripe Clearing Account",
    account_type: "asset",
    display_name: "Stripe Clearing",
    is_system: true,
  },
  {
    account_number: "1100",
    account_name: "Accounts Receivable",
    account_type: "asset",
    display_name: "Money Owed to Us",
    is_system: true,
  },
  {
    account_number: "1200",
    account_name: "Chemical Inventory",
    account_type: "asset",
    display_name: "Chemical Inventory",
    is_system: true,
  },

  // ─── LIABILITIES (2xxx) ──────────────────────────────────────
  {
    account_number: "2000",
    account_name: "Accounts Payable",
    account_type: "liability",
    display_name: "Bills to Pay",
    is_system: true,
  },
  {
    account_number: "2100",
    account_name: "Sales Tax Payable",
    account_type: "liability",
    display_name: "Sales Tax Owed",
    is_system: true,
  },
  {
    account_number: "2200",
    account_name: "Customer Credits",
    account_type: "liability",
    display_name: "Customer Credits",
    is_system: true,
  },

  // ─── EQUITY (3xxx) ───────────────────────────────────────────
  {
    account_number: "3000",
    account_name: "Owner's Equity",
    account_type: "equity",
    display_name: "Owner's Equity",
    is_system: true,
  },
  {
    account_number: "3100",
    account_name: "Retained Earnings",
    account_type: "equity",
    display_name: "Retained Earnings",
    is_system: true,
  },

  // ─── INCOME (4xxx) ───────────────────────────────────────────
  {
    account_number: "4000",
    account_name: "Pool Maintenance Revenue",
    account_type: "income",
    display_name: "Pool Service Revenue",
    is_system: true,
  },
  {
    account_number: "4100",
    account_name: "Repair and Work Order Revenue",
    account_type: "income",
    display_name: "Repair Revenue",
    is_system: true,
  },
  {
    account_number: "4200",
    account_name: "Chemical Sales Revenue",
    account_type: "income",
    display_name: "Chemical Sales",
    is_system: true,
  },
  {
    account_number: "4300",
    account_name: "Other Revenue",
    account_type: "income",
    display_name: "Other Revenue",
    is_system: true,
  },

  // ─── EXPENSES (5xxx-6xxx) ─────────────────────────────────────
  {
    account_number: "5000",
    account_name: "Chemical Costs",
    account_type: "expense",
    display_name: "Chemicals",
    is_system: true,
  },
  {
    account_number: "5100",
    account_name: "Parts and Equipment",
    account_type: "expense",
    display_name: "Parts & Equipment",
    is_system: true,
  },
  {
    account_number: "5200",
    account_name: "Fuel Expense",
    account_type: "expense",
    display_name: "Fuel",
    is_system: true,
  },
  {
    account_number: "5300",
    account_name: "Vehicle Maintenance",
    account_type: "expense",
    display_name: "Vehicle Maintenance",
    is_system: true,
  },
  {
    account_number: "5400",
    account_name: "Subcontractor Labor",
    account_type: "expense",
    display_name: "Subcontractors",
    is_system: true,
  },
  {
    account_number: "5500",
    account_name: "Employee Labor",
    account_type: "expense",
    display_name: "Labor",
    is_system: true,
  },
  {
    account_number: "5600",
    account_name: "Stripe Processing Fees",
    account_type: "expense",
    display_name: "Stripe Fees",
    is_system: true,
  },
  {
    account_number: "6000",
    account_name: "Insurance Expense",
    account_type: "expense",
    display_name: "Insurance",
    is_system: true,
  },
  {
    account_number: "6100",
    account_name: "Marketing and Advertising",
    account_type: "expense",
    display_name: "Marketing",
    is_system: true,
  },
  {
    account_number: "6200",
    account_name: "Office and Administrative Expense",
    account_type: "expense",
    display_name: "Office Expenses",
    is_system: true,
  },
  {
    account_number: "6300",
    account_name: "Mileage and Vehicle Allowance",
    account_type: "expense",
    display_name: "Mileage",
    is_system: true,
  },
]

// ============================================================
// Seed function — idempotent, safe to call multiple times
// ============================================================

/**
 * Seed the chart of accounts for a new org.
 *
 * Uses adminDb (service role) because this is called during org setup
 * before the owner's RLS context is fully established.
 *
 * Idempotent: uses onConflictDoNothing keyed on (org_id, account_number).
 * Safe to call multiple times — existing accounts are not modified.
 */
export async function seedChartOfAccounts(orgId: string): Promise<void> {
  const accounts = POOL_COMPANY_ACCOUNTS.map((account) => ({
    org_id: orgId,
    account_number: account.account_number,
    account_name: account.account_name,
    account_type: account.account_type,
    display_name: account.display_name,
    is_system: account.is_system,
    is_active: true,
  }))

  // Insert in batches to avoid overly large single queries
  const BATCH_SIZE = 10
  for (let i = 0; i < accounts.length; i += BATCH_SIZE) {
    const batch = accounts.slice(i, i + BATCH_SIZE)
    await adminDb
      .insert(chartOfAccounts)
      .values(batch)
      .onConflictDoNothing({
        target: [chartOfAccounts.org_id, chartOfAccounts.account_number],
      })
  }
}

// ============================================================
// Query helpers — used by journal entry auto-generation
// ============================================================

export type ChartOfAccountsRow = typeof chartOfAccounts.$inferSelect

/**
 * Get a single account by its account number within an org.
 *
 * Used by journal entry auto-generation (e.g. "get account 4000 for this org
 * to post Pool Service Revenue").
 *
 * Uses withRls — caller must provide a valid token with owner/office role
 * (chart_of_accounts RLS requires owner or office).
 */
export async function getAccountByNumber(
  token: SupabaseToken,
  orgId: string,
  accountNumber: string
): Promise<ChartOfAccountsRow | null> {
  const result = await withRls(token, (db) =>
    db
      .select()
      .from(chartOfAccounts)
      .where(
        and(
          eq(chartOfAccounts.org_id, orgId),
          eq(chartOfAccounts.account_number, accountNumber)
        )
      )
      .limit(1)
  )

  return result[0] ?? null
}

/**
 * Get all accounts for an org, ordered by account_number.
 *
 * Returns both the formal account_name and the user-friendly display_name.
 * Used by the accounting UI to render the chart of accounts view.
 *
 * Uses withRls — caller must provide a valid token with owner/office role.
 */
export async function getChartOfAccounts(
  token: SupabaseToken,
  orgId: string
): Promise<ChartOfAccountsRow[]> {
  return withRls(token, (db) =>
    db
      .select()
      .from(chartOfAccounts)
      .where(eq(chartOfAccounts.org_id, orgId))
      .orderBy(asc(chartOfAccounts.account_number))
  )
}

/**
 * Get only active accounts for an org — used in dropdowns/selectors.
 *
 * Inactive accounts (soft-deleted) are excluded from the list.
 */
export async function getActiveAccounts(
  token: SupabaseToken,
  orgId: string
): Promise<ChartOfAccountsRow[]> {
  return withRls(token, (db) =>
    db
      .select()
      .from(chartOfAccounts)
      .where(
        and(
          eq(chartOfAccounts.org_id, orgId),
          eq(chartOfAccounts.is_active, true)
        )
      )
      .orderBy(asc(chartOfAccounts.account_number))
  )
}
