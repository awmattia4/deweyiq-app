import type { Metadata } from "next"
import { redirect } from "next/navigation"
import { getCurrentUser } from "@/actions/auth"
import { TabsContent } from "@/components/ui/tabs"
import { ResponsiveTabs } from "@/components/ui/mobile-tab-select"
import { ArAgingView } from "@/components/reports/ar-aging-view"
import { RevenueReport } from "@/components/reports/revenue-report"
import { PnlReport } from "@/components/reports/pnl-report"
import { RevenueDashboard } from "@/components/reports/revenue-dashboard"
import { OperationsDashboard } from "@/components/reports/operations-dashboard"
import { TeamDashboard } from "@/components/reports/team-dashboard"
import { TechSelfScorecard } from "@/components/reports/tech-self-scorecard"
import { ProfitabilityDashboard } from "@/components/reports/profitability-dashboard"
import { ProjectReports } from "@/components/reports/project-reports"
import { ExpenseTracker } from "@/components/accounting/expense-tracker"
import { MileageLog } from "@/components/accounting/mileage-log"
import { getArAging, getRevenueByCustomer, getPnlReport } from "@/actions/reports"
import { getRevenueDashboard, getOperationsMetrics, getTeamMetrics, getPayrollPrep, getTechScorecard, getProfitabilityAnalysis } from "@/actions/reporting"
import { getExpenses, getExpenseSummary } from "@/actions/expenses"
import { getMileageLog, getMileageSummary } from "@/actions/mileage"
import { getProjectReports } from "@/actions/projects-reports"
import { getTechProfiles } from "@/actions/work-orders"
import { toLocalDateString } from "@/lib/date-utils"

export const metadata: Metadata = {
  title: "Reports",
}

/**
 * ReportsPage -- Server component for financial reports.
 *
 * Phase 7: Tabs: AR Aging, Revenue, P&L
 * Phase 9: Adds Revenue Dashboard, Operations, Team, Profitability tabs
 * Phase 11 (Plan 10): Adds Expenses and Mileage tabs
 *
 * Access:
 * - Owner: all tabs
 * - Office: all tabs except Team/Profitability (owner-only payroll/cost data)
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

  // Fetch initial data for all tabs in parallel
  const [
    arAging,
    revenueData,
    pnlData,
    expensesData,
    expenseSummaryData,
    mileageData,
    mileageSummaryData,
    revenueDashboardData,
    operationsData,
    teamData,
    payrollData,
    profitabilityData,
    techProfiles,
    projectReportsData,
  ] = await Promise.all([
    getArAging(),
    getRevenueByCustomer(defaultStartDate, defaultEndDate),
    getPnlReport(defaultStartDate, defaultEndDate),
    getExpenses(defaultStartDate, defaultEndDate),
    getExpenseSummary(defaultStartDate, defaultEndDate),
    isOwner ? getMileageLog(undefined, defaultStartDate, defaultEndDate) : Promise.resolve([]),
    isOwner ? getMileageSummary(defaultStartDate, defaultEndDate) : Promise.resolve({ totalMiles: 0, totalDeduction: 0, tripCount: 0 }),
    getRevenueDashboard(defaultStartDate, defaultEndDate),
    getOperationsMetrics(defaultStartDate, defaultEndDate),
    getTeamMetrics(defaultStartDate, defaultEndDate),
    isOwner ? getPayrollPrep(defaultStartDate, defaultEndDate) : Promise.resolve([]),
    isOwner ? getProfitabilityAnalysis(defaultStartDate, defaultEndDate) : Promise.resolve({ pools: [], flaggedPools: [], techCosts: [], thresholdPct: 20, totalChemicalCost: 0, totalRecurringRevenue: 0, overallMarginPct: 0 }),
    isOwner ? getTechProfiles() : Promise.resolve([]),
    isOwner ? getProjectReports({ startDate: defaultStartDate, endDate: defaultEndDate }) : Promise.resolve(null),
  ])

  return (
    <div className="flex flex-col gap-6">
      <h1 className="text-2xl font-bold tracking-tight">Reports</h1>

      <ResponsiveTabs
        defaultValue="ar-aging"
        className="w-full"
        tabsListClassName="hidden sm:inline-flex sm:flex sm:w-full sm:overflow-x-auto"
        tabs={[
          { value: "ar-aging", label: "AR Aging" },
          { value: "revenue", label: "Revenue" },
          { value: "pnl", label: "P&L" },
          { value: "expenses", label: "Expenses" },
          { value: "mileage", label: "Mileage" },
          { value: "revenue-dashboard", label: "Revenue Dashboard" },
          { value: "operations", label: "Operations" },
          { value: "team", label: "Team" },
          ...(isOwner ? [{ value: "projects", label: "Projects" }] : []),
          ...(isOwner ? [{ value: "profitability", label: "Profitability" }] : []),
        ]}
      >

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

        {/* Phase 11 Plan 10: Expense tracking tab */}
        <TabsContent value="expenses" className="mt-6">
          <ExpenseTracker
            initialExpenses={expensesData}
            initialSummary={expenseSummaryData}
            startDate={defaultStartDate}
            endDate={defaultEndDate}
            isOwner={isOwner}
          />
        </TabsContent>

        {/* Phase 11 Plan 10: Mileage log tab (owner only) */}
        {isOwner && (
          <TabsContent value="mileage" className="mt-6">
            <MileageLog
              initialEntries={mileageData}
              initialSummary={mileageSummaryData}
              startDate={defaultStartDate}
              endDate={defaultEndDate}
              isOwner={isOwner}
              techOptions={techProfiles.map((t) => ({ id: t.id, full_name: t.full_name }))}
              currentUserId={user.id}
            />
          </TabsContent>
        )}

        <TabsContent value="revenue-dashboard" className="mt-6">
          <RevenueDashboard
            initialData={revenueDashboardData}
            defaultStartDate={defaultStartDate}
            defaultEndDate={defaultEndDate}
            isOwner={isOwner}
          />
        </TabsContent>

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

        {isOwner && projectReportsData && !("error" in projectReportsData) && (
          <TabsContent value="projects" className="mt-6">
            <ProjectReports
              initialData={projectReportsData}
              defaultStartDate={defaultStartDate}
              defaultEndDate={defaultEndDate}
            />
          </TabsContent>
        )}

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
      </ResponsiveTabs>
    </div>
  )
}
