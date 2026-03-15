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
  const [orgSettings, checklistTemplates, logoUrl, catalogItems, woTemplateList, stripeStatus, qboStatus, dunningConfig, notifTemplates, orgTemplateSettings] = isOwner
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
      ])
    : [null, [], null, [], [], null, null, null, [], null]

  // Fetch tech profiles for pay configuration (owner only)
  // adminDb bypasses RLS, so explicitly filter by org_id
  let techProfiles: Array<{ id: string; fullName: string; payType: string | null; payRate: string | null }> = []
  if (isOwner && user.org_id) {
    try {
      const techRows = await adminDb
        .select({
          id: profiles.id,
          full_name: profiles.full_name,
          pay_type: profiles.pay_type,
          pay_rate: profiles.pay_rate,
        })
        .from(profiles)
        .where(
          and(
            eq(profiles.org_id, user.org_id),
            inArray(profiles.role, ["tech", "owner"])
          )
        )
      techProfiles = techRows.map((r) => ({
        id: r.id,
        fullName: r.full_name,
        payType: r.pay_type ?? null,
        payRate: r.pay_rate ?? null,
      }))
    } catch (err) {
      console.error("[SettingsPage] Failed to fetch tech profiles:", err)
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
        notifTemplates={notifTemplates ?? []}
        orgTemplateSettings={orgTemplateSettings ?? null}
        signOutAction={async () => {
          "use server"
          await signOut()
        }}
      />
    </div>
  )
}
