import type { Metadata } from "next"
import { notFound, redirect } from "next/navigation"
import { getCurrentUser } from "@/actions/auth"
import { withRls } from "@/lib/db"
import { customers, profiles } from "@/lib/db/schema"
import { createClient } from "@/lib/supabase/server"
import { eq } from "drizzle-orm"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { CustomerHeader } from "@/components/customers/customer-header"
import { CustomerInlineEdit } from "@/components/customers/customer-inline-edit"
import { PoolList } from "@/components/customers/pool-list"
import { EquipmentList } from "@/components/customers/equipment-list"
import { ClipboardList } from "lucide-react"

export const metadata: Metadata = {
  title: "Customer Profile",
}

/**
 * CustomerProfilePage — Server component that fetches a single customer with
 * all related pools, equipment, and service visits, then renders a tabbed profile.
 *
 * Auth: owner and office only. Techs redirected to /routes.
 * 404: returned for invalid or cross-org customer IDs (RLS filters them out).
 */
export default async function CustomerProfilePage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { id } = await params

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

  let customer: Awaited<ReturnType<typeof fetchCustomer>> | null = null
  let techs: Array<{ id: string; full_name: string | null }> = []

  try {
    ;[customer, techs] = await Promise.all([
      fetchCustomer(token, id),
      fetchTechs(token),
    ])
  } catch (err) {
    console.error("[CustomerProfilePage] DB error:", err)
  }

  if (!customer) {
    notFound()
  }

  return (
    <div className="flex flex-col gap-6">
      {/* ── Always-visible customer header ────────────────────────────────── */}
      <CustomerHeader customer={customer} />

      {/* ── Tabbed sections ───────────────────────────────────────────────── */}
      <Tabs defaultValue="overview" className="w-full">
        <TabsList className="grid w-full grid-cols-4">
          <TabsTrigger value="overview">Overview</TabsTrigger>
          <TabsTrigger value="pools">Pools</TabsTrigger>
          <TabsTrigger value="equipment">Equipment</TabsTrigger>
          <TabsTrigger value="history">History</TabsTrigger>
        </TabsList>

        {/* Overview — inline edit for customer fields */}
        <TabsContent value="overview" className="mt-6">
          <CustomerInlineEdit customer={customer} techs={techs} />
        </TabsContent>

        {/* Pools — pool cards with Add Pool modal */}
        <TabsContent value="pools" className="mt-6">
          <PoolList pools={customer.pools} customerId={customer.id} />
        </TabsContent>

        {/* Equipment — compact equipment list grouped by pool */}
        <TabsContent value="equipment" className="mt-6">
          <EquipmentList pools={customer.pools} />
        </TabsContent>

        {/* History — placeholder (Plan 02-04 will replace with ServiceHistoryTimeline) */}
        <TabsContent value="history" className="mt-6">
          <div className="flex flex-col items-center justify-center gap-3 py-16 text-center">
            <ClipboardList className="h-10 w-10 text-muted-foreground/50" />
            <p className="text-sm font-medium text-muted-foreground">No service history yet</p>
            <p className="text-xs text-muted-foreground/70 max-w-xs">
              Service records will appear here automatically as technicians complete stops.
            </p>
          </div>
        </TabsContent>
      </Tabs>
    </div>
  )
}

// ─── Data fetching helpers ─────────────────────────────────────────────────────

async function fetchCustomer(
  token: Parameters<typeof withRls>[0],
  id: string
) {
  return withRls(token, (tx) =>
    tx.query.customers.findFirst({
      where: (c, { eq }) => eq(c.id, id),
      with: {
        assignedTech: {
          columns: { id: true, full_name: true },
        },
        pools: {
          with: {
            equipment: true,
            serviceVisits: {
              orderBy: (sv, { desc }) => [desc(sv.visited_at)],
            },
          },
        },
      },
    })
  )
}

async function fetchTechs(token: Parameters<typeof withRls>[0]) {
  return withRls(token, (db) =>
    db
      .select({ id: profiles.id, full_name: profiles.full_name })
      .from(profiles)
      .where(eq(profiles.role, "tech"))
  )
}
