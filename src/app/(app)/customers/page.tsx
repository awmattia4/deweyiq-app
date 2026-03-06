import type { Metadata } from "next"
import { redirect } from "next/navigation"
import { getCurrentUser } from "@/actions/auth"
import { withRls } from "@/lib/db"
import { customers, profiles } from "@/lib/db/schema"
import { pools } from "@/lib/db/schema/pools"
import { createClient } from "@/lib/supabase/server"
import { asc, eq, count } from "drizzle-orm"
import { CustomerTable } from "@/components/customers/customer-table"

export const metadata: Metadata = {
  title: "Customers",
}

/**
 * CustomersPage — Server component that fetches all customers for the org
 * and renders the CustomerTable with all filter props.
 *
 * Role guard: owner and office only. Techs are redirected to /routes.
 * Uses withRls for all queries to enforce org-level RLS policies.
 */
export default async function CustomersPage() {
  const user = await getCurrentUser()

  if (!user) redirect("/login")
  if (user.role === "tech") redirect("/routes")
  if (user.role === "customer") redirect("/portal")

  const supabase = await createClient()
  const { data: claimsData } = await supabase.auth.getClaims()

  if (!claimsData?.claims) {
    redirect("/login")
  }

  const token = claimsData.claims as Parameters<typeof withRls>[0]

  // Fetch customers with pool count subquery
  let customerRows: Array<{
    id: string
    full_name: string
    address: string | null
    phone: string | null
    route_name: string | null
    status: "active" | "paused" | "cancelled"
    pool_count: number
  }> = []

  let techs: Array<{ id: string; full_name: string | null }> = []
  let distinctRoutes: string[] = []

  try {
    const [customersResult, techsResult] = await Promise.all([
      withRls(token, (db) =>
        db
          .select({
            id: customers.id,
            full_name: customers.full_name,
            address: customers.address,
            phone: customers.phone,
            route_name: customers.route_name,
            status: customers.status,
            pool_count: count(pools.id),
          })
          .from(customers)
          .leftJoin(pools, eq(pools.customer_id, customers.id))
          .groupBy(customers.id)
          .orderBy(asc(customers.full_name))
      ),
      withRls(token, (db) =>
        db
          .select({ id: profiles.id, full_name: profiles.full_name })
          .from(profiles)
          .where(eq(profiles.role, "tech"))
      ),
    ])

    customerRows = customersResult.map((r) => ({ ...r, pool_count: Number(r.pool_count) }))
    techs = techsResult

    // Extract distinct route names (non-null only)
    const routeSet = new Set<string>()
    for (const row of customerRows) {
      if (row.route_name) {
        routeSet.add(row.route_name)
      }
    }
    distinctRoutes = Array.from(routeSet).sort()
  } catch (err) {
    console.error("[CustomersPage] Failed to fetch customer data:", err)
    // Page renders with empty state if DB is unreachable
  }

  return (
    <div className="flex flex-col gap-6">
      {/* ── Page header ──────────────────────────────────────────────────── */}
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Customers</h1>
        <p className="text-muted-foreground text-sm mt-1">
          Manage your customer accounts and service information.
        </p>
      </div>

      {/* ── Customer data table ───────────────────────────────────────────── */}
      <CustomerTable
        data={customerRows}
        techs={techs}
        routes={distinctRoutes}
      />
    </div>
  )
}
