"use server"

/**
 * financial-reports.ts — Financial reporting server actions for DeweyIQ.
 *
 * Provides P&L, Balance Sheet, Cash Flow, and other financial report actions.
 * All queries use withRls. Chart of accounts auto-seeded on first call.
 *
 * Access control: owner + office only for all report actions.
 *
 * Accounting conventions used throughout:
 * - Positive line amount = debit (increases assets, decreases liabilities/equity/income)
 * - Negative line amount = credit (decreases assets, increases liabilities/equity/income)
 *
 * Display conventions:
 * - Income: shown as positive (credits are negative in DB, multiply by -1 to display)
 * - Expenses: shown as positive (debits are positive in DB, use as-is)
 * - Assets: shown as positive (debits are positive in DB, use as-is)
 * - Liabilities/Equity: shown as positive (credits are negative in DB, multiply by -1 to display)
 */

import { createClient } from "@/lib/supabase/server"
import { withRls } from "@/lib/db"
import type { SupabaseToken } from "@/lib/db"
import {
  chartOfAccounts,
  journalEntries,
  journalEntryLines,
} from "@/lib/db/schema"
import { and, eq, gte, lte, sql } from "drizzle-orm"
import { ensureChartOfAccounts } from "@/lib/accounting/journal"
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
// Shared types
// ---------------------------------------------------------------------------

export interface AccountLineItem {
  accountId: string
  accountNumber: string
  accountName: string
  displayName: string
  /** Amount formatted for display (always positive for simplified view) */
  amount: number
  /** Raw net amount from DB (positive = net debit) */
  rawAmount: number
}

export interface ReportSection {
  label: string
  accounts: AccountLineItem[]
  total: number
}

export interface ProfitAndLoss {
  startDate: string
  endDate: string
  income: ReportSection
  expenses: ReportSection
  netProfit: number
  isProfit: boolean
}

export interface BalanceSheet {
  asOfDate: string
  assets: ReportSection
  liabilities: ReportSection
  equity: ReportSection
  netIncome: number
  /** True if balanced: assets = liabilities + equity + netIncome (within 0.01) */
  isBalanced: boolean
  totalLiabilitiesAndEquity: number
}

export interface CashFlowSection {
  label: string
  items: Array<{
    description: string
    amount: number
  }>
  total: number
}

export interface CashFlowStatement {
  startDate: string
  endDate: string
  operating: CashFlowSection
  investing: CashFlowSection
  financing: CashFlowSection
  netCashChange: number
  openingCash: number
  closingCash: number
}

export interface FinancialSnapshot {
  /** Current month revenue (positive) */
  monthRevenue: number
  /** Current month expenses (positive) */
  monthExpenses: number
  /** Current month net profit */
  monthProfit: number
  /** Cash position: sum of checking/savings account balances */
  cashPosition: number
  /** Accounts Receivable outstanding (positive) */
  arBalance: number
  /** Accounts Payable outstanding (positive) */
  apBalance: number
  /** Prior month revenue for trend comparison */
  priorMonthRevenue: number
  /** Prior month expenses for trend comparison */
  priorMonthExpenses: number
  /** Month-over-month revenue change % */
  revenueChangePct: number | null
}

export interface TrialBalance {
  asOfDate: string
  accounts: Array<{
    accountNumber: string
    accountName: string
    accountType: string
    totalDebits: number
    totalCredits: number
    netBalance: number
  }>
  totalDebits: number
  totalCredits: number
  isBalanced: boolean
}

// ---------------------------------------------------------------------------
// Helper: account balance aggregation
// ---------------------------------------------------------------------------

/**
 * Aggregates journal_entry_lines by account for a given date range.
 * Returns a map of account_id -> net amount (positive = net debit).
 *
 * Uses LEFT JOIN pattern to avoid correlated subquery pitfall (MEMORY.md).
 */
async function getAccountBalances(
  token: SupabaseToken,
  orgId: string,
  opts: { startDate?: string; endDate?: string } = {}
): Promise<Map<string, number>> {
  const conditions = [eq(journalEntryLines.org_id, orgId)]

  // Join through journalEntries to filter by entry_date
  const balanceRows = await withRls(token, (db) =>
    db
      .select({
        account_id: journalEntryLines.account_id,
        balance: sql<string>`COALESCE(SUM(${journalEntryLines.amount}::numeric), 0)::text`,
      })
      .from(journalEntryLines)
      .innerJoin(
        journalEntries,
        eq(journalEntryLines.journal_entry_id, journalEntries.id)
      )
      .where(
        and(
          eq(journalEntryLines.org_id, orgId),
          opts.startDate ? gte(journalEntries.entry_date, opts.startDate) : undefined,
          opts.endDate ? lte(journalEntries.entry_date, opts.endDate) : undefined
        )
      )
      .groupBy(journalEntryLines.account_id)
  )

  const map = new Map<string, number>()
  for (const row of balanceRows) {
    map.set(row.account_id, parseFloat(row.balance))
  }
  return map
}

/**
 * Fetches all chart of accounts entries for the org (without balances).
 */
async function getOrgAccounts(
  token: SupabaseToken,
  orgId: string
): Promise<
  Array<{
    id: string
    account_number: string
    account_name: string
    account_type: string
    display_name: string
    parent_id: string | null
    is_active: boolean
  }>
> {
  await ensureChartOfAccounts(orgId)

  return withRls(token, (db) =>
    db
      .select({
        id: chartOfAccounts.id,
        account_number: chartOfAccounts.account_number,
        account_name: chartOfAccounts.account_name,
        account_type: chartOfAccounts.account_type,
        display_name: chartOfAccounts.display_name,
        parent_id: chartOfAccounts.parent_id,
        is_active: chartOfAccounts.is_active,
      })
      .from(chartOfAccounts)
      .where(and(eq(chartOfAccounts.org_id, orgId), eq(chartOfAccounts.is_active, true)))
  )
}

// ---------------------------------------------------------------------------
// getProfitAndLoss
// ---------------------------------------------------------------------------

/**
 * Returns a Profit & Loss statement for the given date range.
 *
 * - Income accounts: sum of line amounts (negative values = credits = revenue).
 *   Display as positive numbers.
 * - Expense accounts: sum of line amounts (positive values = debits = expenses).
 *   Display as positive numbers.
 *
 * Access: owner + office only.
 */
export async function getProfitAndLoss(
  startDate: string,
  endDate: string
): Promise<{ success: true; data: ProfitAndLoss } | { success: false; error: string }> {
  const token = await getRlsToken()
  if (!token) return { success: false, error: "Not authenticated" }

  const orgId = token.org_id as string
  const userRole = token.user_role as string | undefined

  if (!userRole || !["owner", "office"].includes(userRole)) {
    return { success: false, error: "Insufficient permissions" }
  }

  try {
    const [accounts, balanceMap] = await Promise.all([
      getOrgAccounts(token, orgId),
      getAccountBalances(token, orgId, { startDate, endDate }),
    ])

    const incomeAccounts: AccountLineItem[] = []
    const expenseAccounts: AccountLineItem[] = []

    for (const account of accounts) {
      const rawAmount = balanceMap.get(account.id) ?? 0

      if (account.account_type === "income") {
        // Income: credits (negative in DB) = positive revenue
        // Display as positive: negate the raw net debit
        const displayAmount = -rawAmount
        incomeAccounts.push({
          accountId: account.id,
          accountNumber: account.account_number,
          accountName: account.account_name,
          displayName: account.display_name,
          amount: displayAmount,
          rawAmount,
        })
      } else if (account.account_type === "expense") {
        // Expense: debits (positive in DB) = positive expense
        const displayAmount = rawAmount
        expenseAccounts.push({
          accountId: account.id,
          accountNumber: account.account_number,
          accountName: account.account_name,
          displayName: account.display_name,
          amount: displayAmount,
          rawAmount,
        })
      }
    }

    // Only include accounts with activity (non-zero amounts)
    const activeIncome = incomeAccounts.filter((a) => Math.abs(a.amount) > 0.001)
    const activeExpenses = expenseAccounts.filter((a) => Math.abs(a.amount) > 0.001)

    const totalRevenue = activeIncome.reduce((sum, a) => sum + a.amount, 0)
    const totalExpenses = activeExpenses.reduce((sum, a) => sum + a.amount, 0)
    const netProfit = totalRevenue - totalExpenses

    return {
      success: true,
      data: {
        startDate,
        endDate,
        income: {
          label: "Income",
          accounts: activeIncome.sort((a, b) => a.accountNumber.localeCompare(b.accountNumber)),
          total: totalRevenue,
        },
        expenses: {
          label: "Expenses",
          accounts: activeExpenses.sort((a, b) => a.accountNumber.localeCompare(b.accountNumber)),
          total: totalExpenses,
        },
        netProfit,
        isProfit: netProfit >= 0,
      },
    }
  } catch (err) {
    console.error("[getProfitAndLoss] Error:", err)
    return {
      success: false,
      error: err instanceof Error ? err.message : "Failed to generate P&L",
    }
  }
}

// ---------------------------------------------------------------------------
// getBalanceSheet
// ---------------------------------------------------------------------------

/**
 * Returns a Balance Sheet as of the given date.
 *
 * Assets: net debit balance of asset accounts (positive = asset)
 * Liabilities: net credit balance of liability accounts (negative in DB = liability, display positive)
 * Equity: net credit balance of equity accounts (negative in DB = equity, display positive)
 * Net Income: computed from income - expenses through asOfDate
 *
 * Accounting equation: Assets = Liabilities + Equity + Net Income
 *
 * Access: owner + office only.
 */
export async function getBalanceSheet(
  asOfDate: string
): Promise<{ success: true; data: BalanceSheet } | { success: false; error: string }> {
  const token = await getRlsToken()
  if (!token) return { success: false, error: "Not authenticated" }

  const orgId = token.org_id as string
  const userRole = token.user_role as string | undefined

  if (!userRole || !["owner", "office"].includes(userRole)) {
    return { success: false, error: "Insufficient permissions" }
  }

  try {
    const [accounts, balanceMap] = await Promise.all([
      getOrgAccounts(token, orgId),
      // Balance sheet uses ALL entries up to and including asOfDate
      getAccountBalances(token, orgId, { endDate: asOfDate }),
    ])

    const assetAccounts: AccountLineItem[] = []
    const liabilityAccounts: AccountLineItem[] = []
    const equityAccounts: AccountLineItem[] = []
    let incomeTotal = 0
    let expenseTotal = 0

    for (const account of accounts) {
      const rawAmount = balanceMap.get(account.id) ?? 0

      switch (account.account_type) {
        case "asset": {
          // Assets: positive debit = asset (display as-is)
          assetAccounts.push({
            accountId: account.id,
            accountNumber: account.account_number,
            accountName: account.account_name,
            displayName: account.display_name,
            amount: rawAmount,
            rawAmount,
          })
          break
        }
        case "liability": {
          // Liabilities: credits (negative) = liability. Display as positive.
          liabilityAccounts.push({
            accountId: account.id,
            accountNumber: account.account_number,
            accountName: account.account_name,
            displayName: account.display_name,
            amount: -rawAmount,
            rawAmount,
          })
          break
        }
        case "equity": {
          // Equity: credits (negative) = equity. Display as positive.
          equityAccounts.push({
            accountId: account.id,
            accountNumber: account.account_number,
            accountName: account.account_name,
            displayName: account.display_name,
            amount: -rawAmount,
            rawAmount,
          })
          break
        }
        case "income": {
          // Net income contribution: credits = positive revenue
          incomeTotal += -rawAmount
          break
        }
        case "expense": {
          // Net income contribution: debits = positive expense
          expenseTotal += rawAmount
          break
        }
      }
    }

    const netIncome = incomeTotal - expenseTotal

    // Filter to accounts with non-zero balances
    const activeAssets = assetAccounts.filter((a) => Math.abs(a.amount) > 0.001)
    const activeLiabilities = liabilityAccounts.filter((a) => Math.abs(a.amount) > 0.001)
    const activeEquity = equityAccounts.filter((a) => Math.abs(a.amount) > 0.001)

    const totalAssets = activeAssets.reduce((sum, a) => sum + a.amount, 0)
    const totalLiabilities = activeLiabilities.reduce((sum, a) => sum + a.amount, 0)
    const totalEquity = activeEquity.reduce((sum, a) => sum + a.amount, 0)
    const totalLiabilitiesAndEquity = totalLiabilities + totalEquity + netIncome

    // Check balance: Assets = Liabilities + Equity + Net Income (within 0.01)
    const isBalanced = Math.abs(totalAssets - totalLiabilitiesAndEquity) < 0.01

    return {
      success: true,
      data: {
        asOfDate,
        assets: {
          label: "Assets",
          accounts: activeAssets.sort((a, b) => a.accountNumber.localeCompare(b.accountNumber)),
          total: totalAssets,
        },
        liabilities: {
          label: "Liabilities",
          accounts: activeLiabilities.sort((a, b) =>
            a.accountNumber.localeCompare(b.accountNumber)
          ),
          total: totalLiabilities,
        },
        equity: {
          label: "Equity",
          accounts: activeEquity.sort((a, b) => a.accountNumber.localeCompare(b.accountNumber)),
          total: totalEquity,
        },
        netIncome,
        isBalanced,
        totalLiabilitiesAndEquity,
      },
    }
  } catch (err) {
    console.error("[getBalanceSheet] Error:", err)
    return {
      success: false,
      error: err instanceof Error ? err.message : "Failed to generate balance sheet",
    }
  }
}

// ---------------------------------------------------------------------------
// getCashFlowStatement
// ---------------------------------------------------------------------------

/**
 * Returns a Cash Flow statement for the given date range.
 *
 * Derives cash flow from journal entries:
 * - Operating: payments received (Cr AR cleared), expenses paid
 * - Investing: capital expenditures (equipment purchases)
 * - Financing: owner draws / contributions (equity account changes)
 *
 * Opening cash: sum of cash/bank asset accounts as of startDate - 1 day
 * Closing cash: opening + net cash change
 *
 * Access: owner + office only.
 */
export async function getCashFlowStatement(
  startDate: string,
  endDate: string
): Promise<{ success: true; data: CashFlowStatement } | { success: false; error: string }> {
  const token = await getRlsToken()
  if (!token) return { success: false, error: "Not authenticated" }

  const orgId = token.org_id as string
  const userRole = token.user_role as string | undefined

  if (!userRole || !["owner", "office"].includes(userRole)) {
    return { success: false, error: "Insufficient permissions" }
  }

  try {
    const accounts = await getOrgAccounts(token, orgId)

    // Opening cash: balances as of day BEFORE startDate
    const startDateObj = new Date(startDate + "T00:00:00")
    startDateObj.setDate(startDateObj.getDate() - 1)
    const priorDate = toLocalDateString(startDateObj)

    const [priorBalances, periodBalances] = await Promise.all([
      getAccountBalances(token, orgId, { endDate: priorDate }),
      getAccountBalances(token, orgId, { startDate, endDate }),
    ])

    // Cash accounts (checking + savings asset accounts)
    // Account numbers in 1000-1099 range are cash/bank accounts
    const cashAccountNumbers = new Set(["1000", "1010", "1020"])
    const cashAccounts = accounts.filter(
      (a) =>
        a.account_type === "asset" &&
        (cashAccountNumbers.has(a.account_number) ||
          a.account_name.toLowerCase().includes("checking") ||
          a.account_name.toLowerCase().includes("savings") ||
          a.account_name.toLowerCase().includes("cash"))
    )

    // Opening cash position
    const openingCash = cashAccounts.reduce((sum, a) => {
      const balance = priorBalances.get(a.id) ?? 0
      return sum + balance // Asset: positive debit = cash
    }, 0)

    // Operating activities: payment inflows and expense outflows
    // AR account (1100): when AR decreases (credits during period), cash was collected
    const arAccount = accounts.find((a) => a.account_number === "1100")
    const arPeriodBalance = arAccount ? (periodBalances.get(arAccount.id) ?? 0) : 0
    // If AR net balance is negative during period = more credits than debits = cash collected
    const cashFromCustomers = -arPeriodBalance // Negative AR net = positive cash inflow

    // Expense accounts: cash paid out for expenses
    const expenseAccountLines: Array<{ description: string; amount: number }> = []
    for (const account of accounts) {
      if (account.account_type !== "expense") continue
      const balance = periodBalances.get(account.id) ?? 0
      if (Math.abs(balance) < 0.001) continue
      // Expense: positive debit = cash out (show as negative for cash flow)
      expenseAccountLines.push({
        description: account.display_name,
        amount: -balance, // Negative because cash leaves
      })
    }

    // AP adjustment: expenses accrued via AP didn't use cash yet.
    // AP increase (net credit = negative balance) → add back (cash NOT paid).
    // AP decrease (net debit = positive balance) → subtract (cash WAS paid for prior accruals).
    const apAccount = accounts.find((a) => a.account_number === "2000")
    const apPeriodBalance = apAccount ? (periodBalances.get(apAccount.id) ?? 0) : 0
    // AP credits = negative → increase in AP → cash not spent → positive adjustment
    const apAdjustment = -apPeriodBalance

    const operatingItems: Array<{ description: string; amount: number }> = []
    if (Math.abs(cashFromCustomers) > 0.001) {
      operatingItems.push({ description: "Cash received from customers", amount: cashFromCustomers })
    }
    operatingItems.push(...expenseAccountLines)
    if (Math.abs(apAdjustment) > 0.001) {
      operatingItems.push({
        description: apAdjustment > 0 ? "Increase in accounts payable" : "Decrease in accounts payable",
        amount: apAdjustment,
      })
    }

    const operatingTotal = operatingItems.reduce((sum, i) => sum + i.amount, 0)

    // Investing activities: equipment/asset purchases (account 1500+ non-cash assets)
    const investingItems: Array<{ description: string; amount: number }> = []
    for (const account of accounts) {
      if (account.account_type !== "asset") continue
      if (cashAccountNumbers.has(account.account_number)) continue
      if (account.account_number.startsWith("1")) continue // Skip current assets (AR, etc.)
      const balance = periodBalances.get(account.id) ?? 0
      if (Math.abs(balance) < 0.001) continue
      // Increase in non-cash asset = cash out (negative in cash flow)
      investingItems.push({
        description: account.display_name,
        amount: -balance,
      })
    }

    const investingTotal = investingItems.reduce((sum, i) => sum + i.amount, 0)

    // Financing activities: equity changes (owner draws / contributions)
    const financingItems: Array<{ description: string; amount: number }> = []
    for (const account of accounts) {
      if (account.account_type !== "equity") continue
      const balance = periodBalances.get(account.id) ?? 0
      if (Math.abs(balance) < 0.001) continue
      // Equity increase (credits = negative) = financing inflow
      financingItems.push({
        description: account.display_name,
        amount: -balance,
      })
    }

    const financingTotal = financingItems.reduce((sum, i) => sum + i.amount, 0)

    const netCashChange = operatingTotal + investingTotal + financingTotal
    const closingCash = openingCash + netCashChange

    return {
      success: true,
      data: {
        startDate,
        endDate,
        operating: {
          label: "Operating Activities",
          items: operatingItems,
          total: operatingTotal,
        },
        investing: {
          label: "Investing Activities",
          items: investingItems,
          total: investingTotal,
        },
        financing: {
          label: "Financing Activities",
          items: financingItems,
          total: financingTotal,
        },
        netCashChange,
        openingCash,
        closingCash,
      },
    }
  } catch (err) {
    console.error("[getCashFlowStatement] Error:", err)
    return {
      success: false,
      error: err instanceof Error ? err.message : "Failed to generate cash flow statement",
    }
  }
}

// ---------------------------------------------------------------------------
// getFinancialSnapshot
// ---------------------------------------------------------------------------

/**
 * Returns a quick financial summary for the accounting dashboard.
 *
 * Current month: revenue, expenses, profit
 * Cash position: sum of bank account balances
 * AR/AP balances
 * Month-over-month trend
 *
 * Access: owner + office only.
 */
export async function getFinancialSnapshot(): Promise<
  { success: true; data: FinancialSnapshot } | { success: false; error: string }
> {
  const token = await getRlsToken()
  if (!token) return { success: false, error: "Not authenticated" }

  const orgId = token.org_id as string
  const userRole = token.user_role as string | undefined

  if (!userRole || !["owner", "office"].includes(userRole)) {
    return { success: false, error: "Insufficient permissions" }
  }

  try {
    const accounts = await getOrgAccounts(token, orgId)

    // Current month date range
    const now = new Date()
    const currentMonthStart = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-01`
    const currentMonthEnd = toLocalDateString(now)

    // Prior month date range
    const priorMonthDate = new Date(now.getFullYear(), now.getMonth() - 1, 1)
    const priorMonthStart = `${priorMonthDate.getFullYear()}-${String(priorMonthDate.getMonth() + 1).padStart(2, "0")}-01`
    const priorMonthLastDay = new Date(now.getFullYear(), now.getMonth(), 0)
    const priorMonthEnd = `${priorMonthLastDay.getFullYear()}-${String(priorMonthLastDay.getMonth() + 1).padStart(2, "0")}-${String(priorMonthLastDay.getDate()).padStart(2, "0")}`

    const [currentBalances, priorBalances, allTimeBalances] = await Promise.all([
      getAccountBalances(token, orgId, { startDate: currentMonthStart, endDate: currentMonthEnd }),
      getAccountBalances(token, orgId, { startDate: priorMonthStart, endDate: priorMonthEnd }),
      getAccountBalances(token, orgId), // All-time for balance sheet items (AR, AP, cash)
    ])

    // Cash accounts (checking/savings)
    const cashAccountNumbers = new Set(["1000", "1010"])
    const cashPosition = accounts
      .filter(
        (a) =>
          a.account_type === "asset" &&
          (cashAccountNumbers.has(a.account_number) ||
            a.account_name.toLowerCase().includes("checking") ||
            a.account_name.toLowerCase().includes("savings"))
      )
      .reduce((sum, a) => {
        return sum + (allTimeBalances.get(a.id) ?? 0)
      }, 0)

    // AR balance (1100)
    const arAccount = accounts.find((a) => a.account_number === "1100")
    const arBalance = arAccount ? Math.max(0, allTimeBalances.get(arAccount.id) ?? 0) : 0

    // AP balance (2000)
    const apAccount = accounts.find((a) => a.account_number === "2000")
    const apRaw = apAccount ? allTimeBalances.get(apAccount.id) ?? 0 : 0
    const apBalance = Math.max(0, -apRaw) // AP is credit (negative), display positive

    // Current month revenue and expenses
    let monthRevenue = 0
    let monthExpenses = 0
    let priorMonthRevenue = 0
    let priorMonthExpenses = 0

    for (const account of accounts) {
      const current = currentBalances.get(account.id) ?? 0
      const prior = priorBalances.get(account.id) ?? 0

      if (account.account_type === "income") {
        monthRevenue += -current // Income credits = positive revenue
        priorMonthRevenue += -prior
      } else if (account.account_type === "expense") {
        monthExpenses += current // Expense debits = positive expense
        priorMonthExpenses += prior
      }
    }

    const monthProfit = monthRevenue - monthExpenses

    // Month-over-month revenue change %
    let revenueChangePct: number | null = null
    if (priorMonthRevenue > 0) {
      revenueChangePct = ((monthRevenue - priorMonthRevenue) / priorMonthRevenue) * 100
    }

    return {
      success: true,
      data: {
        monthRevenue,
        monthExpenses,
        monthProfit,
        cashPosition,
        arBalance,
        apBalance,
        priorMonthRevenue,
        priorMonthExpenses,
        revenueChangePct,
      },
    }
  } catch (err) {
    console.error("[getFinancialSnapshot] Error:", err)
    return {
      success: false,
      error: err instanceof Error ? err.message : "Failed to load financial snapshot",
    }
  }
}

// ---------------------------------------------------------------------------
// getTrialBalance
// ---------------------------------------------------------------------------

/**
 * Returns a trial balance as of the given date (accountant mode).
 *
 * Lists all accounts with total debits and total credits.
 * Total debits must equal total credits (validates double-entry integrity).
 *
 * Access: owner + office only.
 */
export async function getTrialBalance(
  asOfDate: string
): Promise<{ success: true; data: TrialBalance } | { success: false; error: string }> {
  const token = await getRlsToken()
  if (!token) return { success: false, error: "Not authenticated" }

  const orgId = token.org_id as string
  const userRole = token.user_role as string | undefined

  if (!userRole || !["owner", "office"].includes(userRole)) {
    return { success: false, error: "Insufficient permissions" }
  }

  try {
    const accounts = await getOrgAccounts(token, orgId)

    // Fetch total debits and credits separately per account
    const debitCreditRows = await withRls(token, (db) =>
      db
        .select({
          account_id: journalEntryLines.account_id,
          total_debits: sql<string>`COALESCE(SUM(CASE WHEN ${journalEntryLines.amount}::numeric > 0 THEN ${journalEntryLines.amount}::numeric ELSE 0 END), 0)::text`,
          total_credits: sql<string>`COALESCE(SUM(CASE WHEN ${journalEntryLines.amount}::numeric < 0 THEN ABS(${journalEntryLines.amount}::numeric) ELSE 0 END), 0)::text`,
        })
        .from(journalEntryLines)
        .innerJoin(
          journalEntries,
          eq(journalEntryLines.journal_entry_id, journalEntries.id)
        )
        .where(
          and(
            eq(journalEntryLines.org_id, orgId),
            lte(journalEntries.entry_date, asOfDate)
          )
        )
        .groupBy(journalEntryLines.account_id)
    )

    const dcMap = new Map(
      debitCreditRows.map((r) => [
        r.account_id,
        {
          debits: parseFloat(r.total_debits),
          credits: parseFloat(r.total_credits),
        },
      ])
    )

    const accountMap = new Map(accounts.map((a) => [a.id, a]))

    const trialRows = debitCreditRows
      .map((row) => {
        const account = accountMap.get(row.account_id)
        if (!account) return null
        const debits = parseFloat(row.total_debits)
        const credits = parseFloat(row.total_credits)
        return {
          accountNumber: account.account_number,
          accountName: account.account_name,
          accountType: account.account_type,
          totalDebits: debits,
          totalCredits: credits,
          netBalance: debits - credits,
        }
      })
      .filter((r): r is NonNullable<typeof r> => r !== null)
      .sort((a, b) => a.accountNumber.localeCompare(b.accountNumber))

    const totalDebits = trialRows.reduce((sum, r) => sum + r.totalDebits, 0)
    const totalCredits = trialRows.reduce((sum, r) => sum + r.totalCredits, 0)
    const isBalanced = Math.abs(totalDebits - totalCredits) < 0.01

    return {
      success: true,
      data: {
        asOfDate,
        accounts: trialRows,
        totalDebits,
        totalCredits,
        isBalanced,
      },
    }
  } catch (err) {
    console.error("[getTrialBalance] Error:", err)
    return {
      success: false,
      error: err instanceof Error ? err.message : "Failed to generate trial balance",
    }
  }
}
