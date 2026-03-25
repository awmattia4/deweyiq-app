import type { Metadata } from "next"
import { redirect } from "next/navigation"
import { getCurrentUser } from "@/actions/auth"
import { signOut } from "@/actions/auth"
import { withRls, adminDb } from "@/lib/db"
import { orgs, profiles, chemicalProducts } from "@/lib/db/schema"
import { and, eq, inArray } from "drizzle-orm"
import { createClient } from "@/lib/supabase/server"
import { SettingsTabs } from "@/components/settings/settings-tabs"
import { getOrgSettings, getChecklistTemplatesWithTasks, getOrgLogoUrl } from "@/actions/company-settings"
import { getCatalogItems, getWoTemplates } from "@/actions/parts-catalog"
import { getStripeAccountStatus } from "@/actions/stripe-connect"
import { getQboStatus } from "@/actions/qbo-sync"
import { getDunningConfig } from "@/actions/dunning"
import { getTemplates, getOrgTemplateSettings } from "@/actions/notification-templates"
import { getBroadcastHistory, getTechProfilesForBroadcast } from "@/actions/broadcast"
import { getNotificationPreferences } from "@/actions/user-notifications"
import type { BroadcastHistoryEntry } from "@/actions/broadcast"
import { getProjectTemplates } from "@/actions/projects"
import type { ProjectTemplate } from "@/actions/projects"
import { getSubcontractors } from "@/actions/projects-subcontractors"
import type { SubcontractorRow } from "@/actions/projects-subcontractors"
import { getTruckLoadTemplates } from "@/actions/truck-inventory"
import { getChemicalProducts } from "@/actions/chemical-products"
import { getAllVendors } from "@/actions/vendor-bills"
import type { VendorRow } from "@/actions/vendor-bills"
import type { ChemicalProduct } from "@/actions/chemical-products"

export const metadata: Metadata = {
  title: "Settings",
}

export default async function SettingsPage() {
  const user = await getCurrentUser()

  if (!user) redirect("/login")
  if (user.role === "customer") redirect("/portal")

  // Fetch org name and slug for display
  let orgName = "Your Organization"
  let orgSlug: string | null = null

  try {
    const supabase = await createClient()
    const { data: claimsData } = await supabase.auth.getClaims()

    if (claimsData?.claims) {
      const token = claimsData.claims as Parameters<typeof withRls>[0]
      const orgResult = await withRls(token, (db) =>
        db
          .select({ name: orgs.name, slug: orgs.slug })
          .from(orgs)
          .where(eq(orgs.id, user.org_id))
          .limit(1)
      )
      orgName = orgResult[0]?.name ?? "Your Organization"
      orgSlug = orgResult[0]?.slug ?? null
    }
  } catch (err) {
    console.error("[SettingsPage] Failed to fetch org data:", err)
  }

  const isOwner = user.role === "owner"

  // Fetch owner data in parallel
  const [orgSettings, checklistTemplates, logoUrl, catalogItems, woTemplateList, stripeStatus, qboStatus, dunningConfig, notifTemplates, orgTemplateSettings, projectTemplatesResult, subcontractorsResult, truckTemplatesResult, chemicalProductCatalogResult, vendorsResult] = isOwner
    ? await Promise.all([
        getOrgSettings(),
        getChecklistTemplatesWithTasks(),
        getOrgLogoUrl(),
        getCatalogItems(),
        getWoTemplates(),
        getStripeAccountStatus(),
        getQboStatus(),
        getDunningConfig(),
        getTemplates(),
        getOrgTemplateSettings(),
        getProjectTemplates(),
        getSubcontractors(true),
        getTruckLoadTemplates(),
        getChemicalProducts(),
        getAllVendors(true),
      ])
    : [null, [], null, [], [], null, null, null, [], null, [], [], [], [], null]

  const projectTemplateList: ProjectTemplate[] =
    isOwner && projectTemplatesResult && !("error" in projectTemplatesResult)
      ? (projectTemplatesResult as ProjectTemplate[])
      : []

  const subcontractorList: SubcontractorRow[] =
    isOwner && subcontractorsResult && !("error" in subcontractorsResult)
      ? (subcontractorsResult as SubcontractorRow[])
      : []

  const truckTemplateList = isOwner && Array.isArray(truckTemplatesResult)
    ? (truckTemplatesResult as Array<{ id: string; name: string; target_role: string | null; is_active: boolean }>)
    : []

  const chemicalProductCatalogList: ChemicalProduct[] = isOwner && Array.isArray(chemicalProductCatalogResult)
    ? (chemicalProductCatalogResult as ChemicalProduct[])
    : []

  const vendorList: VendorRow[] =
    isOwner && vendorsResult && typeof vendorsResult === "object" && "success" in vendorsResult && vendorsResult.success
      ? vendorsResult.vendors
      : []

  // Fetch team profiles for pay configuration and safety escalation (owner only)
  // adminDb bypasses RLS, so explicitly filter by org_id
  let techProfiles: Array<{ id: string; fullName: string; payType: string | null; payRate: string | null }> = []
  let safetyTeamMembers: Array<{ id: string; fullName: string; role: "owner" | "office" | "tech" }> = []
  if (isOwner && user.org_id) {
    try {
      const teamRows = await adminDb
        .select({
          id: profiles.id,
          full_name: profiles.full_name,
          role: profiles.role,
          pay_type: profiles.pay_type,
          pay_rate: profiles.pay_rate,
        })
        .from(profiles)
        .where(
          and(
            eq(profiles.org_id, user.org_id),
            inArray(profiles.role, ["tech", "owner", "office"])
          )
        )
      techProfiles = teamRows
        .filter((r) => r.role === "tech" || r.role === "owner")
        .map((r) => ({
          id: r.id,
          fullName: r.full_name,
          payType: r.pay_type ?? null,
          payRate: r.pay_rate ?? null,
        }))
      safetyTeamMembers = teamRows.map((r) => ({
        id: r.id,
        fullName: r.full_name,
        role: r.role as "owner" | "office" | "tech",
      }))
    } catch (err) {
      console.error("[SettingsPage] Failed to fetch team profiles:", err)
    }
  }

  // Fetch broadcast data (owner only)
  let broadcastTechProfileList: Array<{ id: string; fullName: string }> = []
  let broadcastHistoryList: BroadcastHistoryEntry[] = []
  if (isOwner) {
    try {
      const [techResult, historyResult] = await Promise.all([
        getTechProfilesForBroadcast(),
        getBroadcastHistory(),
      ])
      if (!("error" in techResult)) broadcastTechProfileList = techResult
      if (!("error" in historyResult)) broadcastHistoryList = historyResult
    } catch (err) {
      console.error("[SettingsPage] Failed to fetch broadcast data:", err)
    }
  }

  // Fetch chemical products for cost configuration (owner only)
  let chemicalProductList: Array<{ id: string; name: string; chemicalType: string; unit: string; costPerUnit: string | null }> = []
  if (isOwner && user.org_id) {
    try {
      const productRows = await adminDb
        .select({
          id: chemicalProducts.id,
          name: chemicalProducts.name,
          chemical_type: chemicalProducts.chemical_type,
          unit: chemicalProducts.unit,
          cost_per_unit: chemicalProducts.cost_per_unit,
        })
        .from(chemicalProducts)
        .where(
          and(
            eq(chemicalProducts.org_id, user.org_id),
            eq(chemicalProducts.is_active, true)
          )
        )
        .orderBy(chemicalProducts.chemical_type, chemicalProducts.name)
      chemicalProductList = productRows.map((r) => ({
        id: r.id,
        name: r.name,
        chemicalType: r.chemical_type,
        unit: r.unit,
        costPerUnit: r.cost_per_unit ?? null,
      }))
    } catch (err) {
      console.error("[SettingsPage] Failed to fetch chemical products:", err)
    }
  }

  // Fetch user's notification preferences (all roles)
  const notifPrefsResult = await getNotificationPreferences()
  const initialNotifPreferences = notifPrefsResult.success ? (notifPrefsResult.data ?? []) : []


  return (
    <div className="flex flex-col gap-6 max-w-xl">
      {/* ── Page header ──────────────────────────────────────────────────── */}
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Settings</h1>
        <p className="text-muted-foreground text-sm mt-1">
          {user.role === "tech"
            ? "Manage your field preferences."
            : isOwner
              ? "Manage company settings, notifications, and service requirements."
              : "Manage your profile and account settings."}
        </p>
      </div>

      <SettingsTabs
        role={user.role as "owner" | "office" | "tech"}
        userId={user.id}
        fullName={user.full_name || ""}
        email={user.email}
        orgName={orgName}
        orgSettings={orgSettings}
        checklistTemplates={checklistTemplates}
        logoUrl={logoUrl}
        orgSlug={orgSlug}
        catalogItems={catalogItems}
        woTemplates={woTemplateList}
        stripeStatus={stripeStatus}
        paymentProvider={orgSettings?.payment_provider ?? "none"}
        ccSurchargeEnabled={orgSettings?.cc_surcharge_enabled ?? false}
        ccSurchargePct={orgSettings?.cc_surcharge_pct ?? null}
        qboConnected={orgSettings?.qbo_connected ?? false}
        qboStatus={qboStatus ?? null}
        dunningSteps={dunningConfig?.steps ?? []}
        dunningMaxRetries={dunningConfig?.maxRetries ?? 3}
        techProfiles={techProfiles}
        chemicalProducts={chemicalProductList}
        safetyTeamMembers={safetyTeamMembers}
        notifTemplates={notifTemplates ?? []}
        orgTemplateSettings={orgTemplateSettings ?? null}
        broadcastTechProfiles={broadcastTechProfileList}
        broadcastHistory={broadcastHistoryList}
        initialNotifPreferences={initialNotifPreferences}
        projectTemplates={projectTemplateList}
        initialSubcontractors={subcontractorList}
        inventoryTemplates={truckTemplateList}
        inventoryTechProfiles={techProfiles.map(t => ({ id: t.id, fullName: t.fullName }))}
        chemicalProductCatalog={chemicalProductCatalogList}
        initialVendors={vendorList}
        signOutAction={async () => {
          "use server"
          await signOut()
        }}
      />
    </div>
  )
}
