import type { Metadata } from "next"
import { redirect } from "next/navigation"
import { getCurrentUser } from "@/actions/auth"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { ArAgingView } from "@/components/reports/ar-aging-view"
import { RevenueReport } from "@/components/reports/revenue-report"
import { PnlReport } from "@/components/reports/pnl-report"
import { RevenueDashboard } from "@/components/reports/revenue-dashboard"
import { OperationsDashboard } from "@/components/reports/operations-dashboard"
import { TeamDashboard } from "@/components/reports/team-dashboard"
import { TechSelfScorecard } from "@/components/reports/tech-self-scorecard"
import { ProfitabilityDashboard } from "@/components/reports/profitability-dashboard"
import { getArAging, getRevenueByCustomer, getPnlReport } from "@/actions/reports"
import { getRevenueDashboard, getOperationsMetrics, getTeamMetrics, getPayrollPrep, getTechScorecard, getProfitabilityAnalysis } from "@/actions/reporting"
import { getExpenses } from "@/actions/expenses"
import { toLocalDateString } from "@/lib/date-utils"

export const metadata: Metadata = {
  title: "Reports",
}

/**
 * ReportsPage -- Server component for financial reports.
 *
 * Phase 7: Tabs: AR Aging, Revenue, P&L
 * Phase 9: Adds Revenue Dashboard, Operations, Team, Profitability tabs
 *
 * Access:
 * - Owner: all 7 tabs
 * - Office: all tabs except Team (owner-only payroll data)
 * - Tech: stripped-down "My Performance" view (no redirect)
 * - Customer: redirected to portal
 */
export default async function ReportsPage() {
  const user = await getCurrentUser()

  if (!user) redirect("/login")
  if (user.role === "customer") redirect("/portal")

  const isOwner = user.role === "owner"
  const isTech = user.role === "tech"

  // Default date range: first day of current month to today
  const today = new Date()
  const startOfMonth = new Date(today.getFullYear(), today.getMonth(), 1)
  const defaultStartDate = toLocalDateString(startOfMonth)
  const defaultEndDate = toLocalDateString(today)

  // Tech gets a stripped-down personal performance view (no tabbed layout)
  if (isTech) {
    const techScorecard = await getTechScorecard(user.id, defaultStartDate, defaultEndDate)
    return (
      <div className="flex flex-col gap-6">
        <h1 className="text-2xl font-bold tracking-tight">My Performance</h1>
        <TechSelfScorecard
          initialData={techScorecard}
          techId={user.id}
          defaultStartDate={defaultStartDate}
          defaultEndDate={defaultEndDate}
        />
      </div>
    )
  }

  // Fetch initial data for all tabs in parallel — Plans 02-05 add their fetches here
  const [arAging, revenueData, pnlData, expensesData, revenueDashboardData, operationsData, teamData, payrollData, profitabilityData] = await Promise.all([
    getArAging(),
    getRevenueByCustomer(defaultStartDate, defaultEndDate),
    getPnlReport(defaultStartDate, defaultEndDate),
    getExpenses(defaultStartDate, defaultEndDate),
    getRevenueDashboard(defaultStartDate, defaultEndDate),
    getOperationsMetrics(defaultStartDate, defaultEndDate),
    getTeamMetrics(defaultStartDate, defaultEndDate),
    isOwner ? getPayrollPrep(defaultStartDate, defaultEndDate) : Promise.resolve([]),
    isOwner ? getProfitabilityAnalysis(defaultStartDate, defaultEndDate) : Promise.resolve({ pools: [], flaggedPools: [], techCosts: [], thresholdPct: 20, totalChemicalCost: 0, totalRecurringRevenue: 0, overallMarginPct: 0 }),
  ])

  return (
    <div className="flex flex-col gap-6">
      <h1 className="text-2xl font-bold tracking-tight">Reports</h1>

      <Tabs defaultValue="ar-aging" className="w-full">
        {/* 7 tabs — scrollable horizontal layout fits all screen sizes */}
        <TabsList className="flex w-full overflow-x-auto">
          <TabsTrigger value="ar-aging" className="whitespace-nowrap">AR Aging</TabsTrigger>
          <TabsTrigger value="revenue" className="whitespace-nowrap">Revenue</TabsTrigger>
          <TabsTrigger value="pnl" className="whitespace-nowrap">P&L</TabsTrigger>
          {/* Phase 9: New reporting tabs — Plans 02-05 fill these in */}
          <TabsTrigger value="revenue-dashboard" className="whitespace-nowrap">Revenue Dashboard</TabsTrigger>
          <TabsTrigger value="operations" className="whitespace-nowrap">Operations</TabsTrigger>
          <TabsTrigger value="team" className="whitespace-nowrap">Team</TabsTrigger>
          {/* Profitability tab — owner only (chemical cost data is sensitive) */}
          {isOwner && (
            <TabsTrigger value="profitability" className="whitespace-nowrap">Profitability</TabsTrigger>
          )}
        </TabsList>

        {/* Existing tabs — unchanged */}
        <TabsContent value="ar-aging" className="mt-6">
          <ArAgingView data={arAging} isOwner={isOwner} />
        </TabsContent>

        <TabsContent value="revenue" className="mt-6">
          <RevenueReport
            initialData={revenueData}
            defaultStartDate={defaultStartDate}
            defaultEndDate={defaultEndDate}
            isOwner={isOwner}
          />
        </TabsContent>

        <TabsContent value="pnl" className="mt-6">
          <PnlReport
            initialData={pnlData}
            initialExpenses={expensesData}
            defaultStartDate={defaultStartDate}
            defaultEndDate={defaultEndDate}
            isOwner={isOwner}
          />
        </TabsContent>

        {/* Phase 9: Revenue Dashboard — Plan 02 */}
        <TabsContent value="revenue-dashboard" className="mt-6">
          <RevenueDashboard
            initialData={revenueDashboardData}
            defaultStartDate={defaultStartDate}
            defaultEndDate={defaultEndDate}
            isOwner={isOwner}
          />
        </TabsContent>

        {/* Phase 9: Operations Dashboard — Plan 03 */}
        <TabsContent value="operations" className="mt-6">
          <OperationsDashboard
            initialData={operationsData}
            defaultStartDate={defaultStartDate}
            defaultEndDate={defaultEndDate}
            isOwner={isOwner}
          />
        </TabsContent>

        <TabsContent value="team" className="mt-6">
          <TeamDashboard
            initialTeamData={teamData}
            initialPayrollData={payrollData}
            defaultStartDate={defaultStartDate}
            defaultEndDate={defaultEndDate}
            isOwner={isOwner}
          />
        </TabsContent>

        {/* Phase 9: Profitability Dashboard — Plan 05 (owner only — financial cost data is sensitive) */}
        {isOwner && (
          <TabsContent value="profitability" className="mt-6">
            <ProfitabilityDashboard
              initialData={profitabilityData}
              defaultStartDate={defaultStartDate}
              defaultEndDate={defaultEndDate}
              isOwner={isOwner}
            />
          </TabsContent>
        )}
      </Tabs>
    </div>
  )
}
