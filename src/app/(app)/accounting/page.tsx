import type { Metadata } from "next"
import { redirect } from "next/navigation"
import { getCurrentUser } from "@/actions/auth"
import { getFinancialSnapshot } from "@/actions/financial-reports"
import { withRls } from "@/lib/db"
import { createClient } from "@/lib/supabase/server"
import { orgSettings } from "@/lib/db/schema"
import { eq } from "drizzle-orm"
import { FinancialDashboard } from "@/components/accounting/financial-dashboard"
import { getBankAccountsForReconciliation } from "@/actions/reconciliation"
import type { SupabaseToken } from "@/lib/db"

export const metadata: Metadata = {
  title: "Accounting",
}

/**
 * AccountingPage — Financial statements and accounting dashboard.
 *
 * Role guard: owner and office only.
 * Fetches financial snapshot and org_settings on the server.
 * Renders FinancialDashboard client component with initial data.
 */
export default async function AccountingPage() {
  const user = await getCurrentUser()

  if (!user) redirect("/login")
  if (user.role === "tech") redirect("/routes")
  if (user.role === "customer") redirect("/portal")

  // Fetch accountant_mode_enabled from org_settings
  let accountantModeEnabled = false
  try {
    const supabase = await createClient()
    const { data: claimsData } = await supabase.auth.getClaims()
    if (claimsData?.claims) {
      const token = claimsData.claims as SupabaseToken
      const orgId = token.org_id as string | undefined
      if (orgId) {
        const [settings] = await withRls(token, (db) =>
          db
            .select({ accountant_mode_enabled: orgSettings.accountant_mode_enabled })
            .from(orgSettings)
            .where(eq(orgSettings.org_id, orgId))
            .limit(1)
        )
        accountantModeEnabled = settings?.accountant_mode_enabled ?? false
      }
    }
  } catch {
    // Non-fatal: accountant mode defaults to false
  }

  // Fetch financial snapshot and bank accounts in parallel
  const [snapshotResult, bankAccountsResult] = await Promise.all([
    getFinancialSnapshot(),
    user.role === "owner"
      ? getBankAccountsForReconciliation()
      : Promise.resolve({ success: true as const, accounts: [] }),
  ])
  const snapshot = snapshotResult.success ? snapshotResult.data : null
  const bankAccounts = bankAccountsResult.success ? bankAccountsResult.accounts : []

  return (
    <div className="flex flex-col gap-6">
      {/* Page header */}
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Accounting</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Financial statements and bookkeeping for your pool service business
        </p>
      </div>

      <FinancialDashboard
        snapshot={snapshot}
        accountantModeEnabled={accountantModeEnabled}
        isOwner={user.role === "owner"}
        bankAccounts={bankAccounts}
      />
    </div>
  )
}
