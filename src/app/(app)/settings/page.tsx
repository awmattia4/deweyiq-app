import type { Metadata } from "next"
import { redirect } from "next/navigation"
import { getCurrentUser } from "@/actions/auth"
import { signOut } from "@/actions/auth"
import { withRls } from "@/lib/db"
import { orgs } from "@/lib/db/schema"
import { eq } from "drizzle-orm"
import { createClient } from "@/lib/supabase/server"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { ProfileForm } from "@/components/settings/profile-form"
import { LogOutIcon, BuildingIcon, UserIcon } from "lucide-react"

export const metadata: Metadata = {
  title: "Settings",
}

/**
 * Settings — Profile editing and org info for owner and office roles.
 *
 * Only accessible to owner and office.
 * Phase 1: basic profile editing. Org settings expand in later phases.
 */
export default async function SettingsPage() {
  const user = await getCurrentUser()

  if (!user) redirect("/login")
  if (user.role === "tech") redirect("/routes")
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

  return (
    <div className="flex flex-col gap-6 max-w-xl">
      {/* ── Page header ──────────────────────────────────────────────────── */}
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Settings</h1>
        <p className="text-muted-foreground text-sm mt-1">
          Manage your profile and account settings.
        </p>
      </div>

      {/* ── Profile section ──────────────────────────────────────────────── */}
      <Card>
        <CardHeader>
          <div className="flex items-center gap-2">
            <UserIcon className="h-4 w-4 text-muted-foreground" aria-hidden="true" />
            <CardTitle className="text-base">Your Profile</CardTitle>
          </div>
          <CardDescription>Update your display name.</CardDescription>
        </CardHeader>
        <CardContent>
          <ProfileForm
            userId={user.id}
            initialName={user.full_name || ""}
            email={user.email}
          />
        </CardContent>
      </Card>

      {/* ── Organization section ─────────────────────────────────────────── */}
      <Card>
        <CardHeader>
          <div className="flex items-center gap-2">
            <BuildingIcon className="h-4 w-4 text-muted-foreground" aria-hidden="true" />
            <CardTitle className="text-base">Organization</CardTitle>
          </div>
          <CardDescription>
            Your organization&apos;s details. Org settings expand in later phases.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex flex-col gap-3">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium">{orgName}</p>
                <p className="text-xs text-muted-foreground">Organization name</p>
              </div>
              <Badge variant="outline" className="capitalize">
                {user.role}
              </Badge>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* ── Sign out ─────────────────────────────────────────────────────── */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Account</CardTitle>
          <CardDescription>Sign out of your account on this device.</CardDescription>
        </CardHeader>
        <CardContent>
          <form
            action={async () => {
              "use server"
              await signOut()
            }}
          >
            <Button
              type="submit"
              variant="outline"
              size="sm"
              className="text-destructive hover:text-destructive hover:bg-destructive/10 border-destructive/30"
            >
              <LogOutIcon className="h-4 w-4" aria-hidden="true" />
              Sign out
            </Button>
          </form>
        </CardContent>
      </Card>
    </div>
  )
}
