import type { Metadata } from "next"
import Link from "next/link"
import { notFound, redirect } from "next/navigation"
import { getCurrentUser } from "@/actions/auth"
import { withRls } from "@/lib/db"
import { customers, profiles, serviceAgreements } from "@/lib/db/schema"
import { createClient } from "@/lib/supabase/server"
import { desc, eq } from "drizzle-orm"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { CustomerHeader } from "@/components/customers/customer-header"
import { CustomerInlineEdit } from "@/components/customers/customer-inline-edit"
import { PoolList } from "@/components/customers/pool-list"
import { EquipmentList } from "@/components/customers/equipment-list"
import { ServiceHistoryTimeline } from "@/components/customers/service-history-timeline"
import { CustomerChecklistEditor } from "@/components/customers/customer-checklist-editor"
import { getOrgSettings, getCustomerChecklistView } from "@/actions/company-settings"
import { InboxThread } from "@/components/inbox/inbox-thread"
import { getEquipmentHealth } from "@/actions/equipment-readings"
import type { EquipmentHealthResult } from "@/actions/equipment-readings"

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
  let orgSettings: Awaited<ReturnType<typeof getOrgSettings>> | null = null
  let checklistView: Awaited<ReturnType<typeof getCustomerChecklistView>> = {
    templateTasks: [],
    customTasks: [],
  }
  let customerAgreements: Array<{
    id: string; agreement_number: string; status: string;
    term_type: string; start_date: string | null; end_date: string | null;
    auto_renew: boolean; created_at: Date;
  }> = []

  try {
    ;[customer, techs, orgSettings, checklistView, customerAgreements] = await Promise.all([
      fetchCustomer(token, id),
      fetchTechs(token),
      getOrgSettings(),
      getCustomerChecklistView(id),
      withRls(token, (db) =>
        db.select({
          id: serviceAgreements.id,
          agreement_number: serviceAgreements.agreement_number,
          status: serviceAgreements.status,
          term_type: serviceAgreements.term_type,
          start_date: serviceAgreements.start_date,
          end_date: serviceAgreements.end_date,
          auto_renew: serviceAgreements.auto_renew,
          created_at: serviceAgreements.created_at,
        })
        .from(serviceAgreements)
        .where(eq(serviceAgreements.customer_id, id))
        .orderBy(desc(serviceAgreements.created_at))
      ),
    ])
  } catch (err) {
    console.error("[CustomerProfilePage] DB error:", err)
  }

  if (!customer) {
    notFound()
  }

  // Fetch equipment health in parallel for all equipment across all pools.
  // Only fetches health if there are 6+ readings (getEquipmentHealth returns null otherwise).
  // Fire-and-forget failures (non-fatal — health badges just won't show).
  const allEquipmentIds = customer.pools.flatMap((pool) =>
    pool.equipment.map((eq) => eq.id)
  )
  const healthResults = await Promise.all(
    allEquipmentIds.map((eqId) =>
      getEquipmentHealth(eqId).catch(() => null)
    )
  )
  // Build a lookup map: equipment ID → health result
  const equipmentHealthMap = new Map<string, EquipmentHealthResult>()
  for (let i = 0; i < allEquipmentIds.length; i++) {
    const result = healthResults[i]
    if (result) {
      equipmentHealthMap.set(allEquipmentIds[i], result)
    }
  }

  // Flatten service visits from all pools into a single list for the timeline.
  // Each visit gets the pool context attached so the timeline can show pool name.
  // Phase 10: include internal_notes and internal_flags for office/owner visibility.
  const allVisits = customer.pools.flatMap((pool) =>
    (pool.serviceVisits ?? []).map((sv) => ({
      id: sv.id,
      visit_type: sv.visit_type,
      visited_at: sv.visited_at instanceof Date
        ? sv.visited_at.toISOString()
        : String(sv.visited_at),
      notes: sv.notes,
      chemistry_readings: sv.chemistry_readings as Record<string, number | null> | null,
      internal_notes: (sv as { internal_notes?: string | null }).internal_notes ?? null,
      internal_flags: (sv as { internal_flags?: string[] | null }).internal_flags ?? null,
      pool: { id: pool.id, name: pool.name },
      tech: null as { id: string; full_name: string | null } | null,
    }))
  )

  return (
    <div className="flex flex-col gap-6">
      {/* ── Always-visible customer header ────────────────────────────────── */}
      <CustomerHeader customer={customer} />

      {/* ── Tabbed sections ───────────────────────────────────────────────── */}
      <Tabs defaultValue="overview" className="w-full">
        <TabsList className="grid w-full grid-cols-7">
          <TabsTrigger value="overview">Overview</TabsTrigger>
          <TabsTrigger value="pools">Pools</TabsTrigger>
          <TabsTrigger value="equipment">Equipment</TabsTrigger>
          <TabsTrigger value="checklist">Checklist</TabsTrigger>
          <TabsTrigger value="history">History</TabsTrigger>
          <TabsTrigger value="agreements">Agreements</TabsTrigger>
          <TabsTrigger value="messages">Messages</TabsTrigger>
        </TabsList>

        {/* Overview — inline edit for customer fields */}
        <TabsContent value="overview" className="mt-6">
          <CustomerInlineEdit
            customer={customer}
            techs={techs}
            userRole={user.role}
            defaultPerStopRate={(orgSettings?.default_hourly_rate as string | null | undefined) ?? null}
          />
        </TabsContent>

        {/* Pools — pool cards with Add Pool modal */}
        <TabsContent value="pools" className="mt-6">
          <PoolList pools={customer.pools} customerId={customer.id} />
        </TabsContent>

        {/* Equipment — compact equipment list grouped by pool, with health badges */}
        <TabsContent value="equipment" className="mt-6">
          <EquipmentList
            pools={customer.pools}
            equipmentHealth={Object.fromEntries(equipmentHealthMap)}
          />
        </TabsContent>

        {/* Checklist — per-customer task customization */}
        <TabsContent value="checklist" className="mt-6">
          <CustomerChecklistEditor
            customerId={customer.id}
            initialView={checklistView}
          />
        </TabsContent>

        {/* History — vertical timeline of service visits (Phase 3 populates with real data) */}
        <TabsContent value="history" className="mt-6">
          <ServiceHistoryTimeline visits={allVisits} userRole={user.role} />
        </TabsContent>

        {/* Agreements — customer's service agreements */}
        <TabsContent value="agreements" className="mt-6">
          {customerAgreements.length === 0 ? (
            <p className="text-sm text-muted-foreground italic">No agreements for this customer</p>
          ) : (
            <div className="flex flex-col gap-2">
              {customerAgreements.map((a) => {
                const statusClass: Record<string, string> = {
                  draft: "bg-muted text-muted-foreground",
                  sent: "bg-blue-500/15 text-blue-600 dark:text-blue-400",
                  active: "bg-green-500/15 text-green-700 dark:text-green-400",
                  paused: "bg-yellow-500/15 text-yellow-700 dark:text-yellow-400",
                  expired: "bg-orange-500/15 text-orange-700 dark:text-orange-400",
                  cancelled: "bg-destructive/15 text-destructive",
                  declined: "bg-destructive/15 text-destructive",
                }
                const termLabel = a.term_type === "month_to_month" ? "Month-to-Month"
                  : a.term_type.match(/^(\d+)_month/) ? `${a.term_type.match(/^(\d+)_month/)![1]}-Month`
                  : a.term_type
                return (
                  <Link
                    key={a.id}
                    href={`/agreements/${a.id}`}
                    className="flex items-center gap-3 rounded-lg border border-border bg-card p-3 transition-colors hover:bg-accent/40"
                  >
                    <span className="text-sm font-medium tabular-nums">{a.agreement_number}</span>
                    <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${statusClass[a.status] ?? "bg-muted text-muted-foreground"}`}>
                      {a.status.charAt(0).toUpperCase() + a.status.slice(1)}
                    </span>
                    <span className="text-xs text-muted-foreground">{termLabel}{a.auto_renew ? " · Auto-renew" : ""}</span>
                    <span className="ml-auto text-xs text-muted-foreground">
                      {a.created_at.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}
                    </span>
                  </Link>
                )
              })}
            </div>
          )}
        </TabsContent>

        {/* Messages — office-to-customer thread for this customer */}
        <TabsContent value="messages" className="mt-6">
          <div
            className="rounded-xl border border-border/60 bg-card overflow-hidden"
            style={{ height: "500px" }}
          >
            <InboxThread
              customerId={customer.id}
              customerName={customer.full_name}
              customerEmail={customer.email ?? ""}
              orgId={user.org_id}
              senderName={user.full_name || user.email}
            />
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
