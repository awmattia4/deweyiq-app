import type { Metadata } from "next"
import { redirect } from "next/navigation"
import { getCurrentUser } from "@/actions/auth"
import { signOut } from "@/actions/auth"
import { withRls } from "@/lib/db"
import { orgs } from "@/lib/db/schema"
import { eq } from "drizzle-orm"
import { createClient } from "@/lib/supabase/server"
import { SettingsTabs } from "@/components/settings/settings-tabs"
import { getOrgSettings, getChecklistTasks, getOrgLogoUrl } from "@/actions/company-settings"
import { getCatalogItems, getWoTemplates } from "@/actions/parts-catalog"
import { getStripeAccountStatus } from "@/actions/stripe-connect"

export const metadata: Metadata = {
  title: "Settings",
}

export default async function SettingsPage() {
  const user = await getCurrentUser()

  if (!user) redirect("/login")
  if (user.role === "customer") redirect("/portal")

  // Fetch org name for display
  let orgName = "Your Organization"

  try {
    const supabase = await createClient()
    const { data: claimsData } = await supabase.auth.getClaims()

    if (claimsData?.claims) {
      const token = claimsData.claims as Parameters<typeof withRls>[0]
      const orgResult = await withRls(token, (db) =>
        db
          .select({ name: orgs.name })
          .from(orgs)
          .where(eq(orgs.id, user.org_id))
          .limit(1)
      )
      orgName = orgResult[0]?.name ?? "Your Organization"
    }
  } catch (err) {
    console.error("[SettingsPage] Failed to fetch org data:", err)
  }

  const isOwner = user.role === "owner"

  // Fetch owner data in parallel
  const [orgSettings, checklistTasks, logoUrl, catalogItems, woTemplateList, stripeStatus] = isOwner
    ? await Promise.all([
        getOrgSettings(),
        getChecklistTasks(),
        getOrgLogoUrl(),
        getCatalogItems(),
        getWoTemplates(),
        getStripeAccountStatus(),
      ])
    : [null, [], null, [], [], null]

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
        checklistTasks={checklistTasks}
        logoUrl={logoUrl}
        catalogItems={catalogItems}
        woTemplates={woTemplateList}
        stripeStatus={stripeStatus}
        paymentProvider={orgSettings?.payment_provider ?? "none"}
        ccSurchargeEnabled={orgSettings?.cc_surcharge_enabled ?? false}
        ccSurchargePct={orgSettings?.cc_surcharge_pct ?? null}
        qboConnected={orgSettings?.qbo_connected ?? false}
        signOutAction={async () => {
          "use server"
          await signOut()
        }}
      />
    </div>
  )
}
