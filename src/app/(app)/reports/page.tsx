import type { Metadata } from "next"
import { redirect } from "next/navigation"
import { getCurrentUser } from "@/actions/auth"
import { createClient } from "@/lib/supabase/server"
import { withRls } from "@/lib/db"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { ArAgingView } from "@/components/reports/ar-aging-view"
import { RevenueReport } from "@/components/reports/revenue-report"
import { PnlReport } from "@/components/reports/pnl-report"
import { getArAging, getRevenueByCustomer, getPnlReport } from "@/actions/reports"
import { getExpenses } from "@/actions/expenses"
import { toLocalDateString } from "@/lib/date-utils"

export const metadata: Metadata = {
  title: "Reports",
}

/**
 * ReportsPage -- Server component for financial reports.
 *
 * Tabs: AR Aging, Revenue, P&L
 * Access: Owner and office only.
 */
export default async function ReportsPage() {
  const user = await getCurrentUser()

  if (!user) redirect("/login")
  if (user.role === "tech") redirect("/routes")
  if (user.role === "customer") redirect("/portal")

  const isOwner = user.role === "owner"

  // Default date range: first day of current month to today
  const today = new Date()
  const startOfMonth = new Date(today.getFullYear(), today.getMonth(), 1)
  const defaultStartDate = toLocalDateString(startOfMonth)
  const defaultEndDate = toLocalDateString(today)

  // Fetch initial data for all tabs in parallel
  const [arAging, revenueData, pnlData, expensesData] = await Promise.all([
    getArAging(),
    getRevenueByCustomer(defaultStartDate, defaultEndDate),
    getPnlReport(defaultStartDate, defaultEndDate),
    getExpenses(defaultStartDate, defaultEndDate),
  ])

  return (
    <div className="flex flex-col gap-6">
      <h1 className="text-2xl font-bold tracking-tight">Reports</h1>

      <Tabs defaultValue="ar-aging" className="w-full">
        <TabsList className="grid w-full grid-cols-3">
          <TabsTrigger value="ar-aging">AR Aging</TabsTrigger>
          <TabsTrigger value="revenue">Revenue</TabsTrigger>
          <TabsTrigger value="pnl">P&L</TabsTrigger>
        </TabsList>

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
      </Tabs>
    </div>
  )
}
