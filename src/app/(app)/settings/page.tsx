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
import { MapsPreferenceSetting } from "@/components/settings/maps-preference"
import { NotificationSettings } from "@/components/settings/notification-settings"
import { ServiceRequirements } from "@/components/settings/service-requirements"
import { CompanyProfileSettings } from "@/components/settings/company-profile-settings"
import { getOrgSettings } from "@/actions/company-settings"
import { LogOutIcon, BuildingIcon, UserIcon, MapPinIcon, BellIcon, ClipboardCheckIcon } from "lucide-react"

export const metadata: Metadata = {
  title: "Settings",
}

/**
 * Settings — Profile editing and org info, plus tech-specific preferences.
 *
 * Phase 3: Accessible to all roles (owner, office, tech).
 * - Tech: sees maps preference + read-only profile
 * - Owner: sees full company settings (notifications, service requirements, company profile)
 * - Office: sees profile editing + org info + maps preference (read-only company settings)
 *
 * Tech redirect removed — tech needs access to set maps preference (FIELD-11).
 */
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

  const isTech = user.role === "tech"
  const isOwner = user.role === "owner"

  // Fetch org settings for owner (needed for notification toggles and service requirements)
  const orgSettings = isOwner ? await getOrgSettings() : null

  return (
    <div className="flex flex-col gap-6 max-w-xl">
      {/* ── Page header ──────────────────────────────────────────────────── */}
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Settings</h1>
        <p className="text-muted-foreground text-sm mt-1">
          {isTech
            ? "Manage your field preferences."
            : isOwner
              ? "Manage company settings, notifications, and service requirements."
              : "Manage your profile and account settings."}
        </p>
      </div>

      {/* ── Owner: Company Profile ──────────────────────────────────────── */}
      {isOwner && (
        <Card>
          <CardHeader>
            <div className="flex items-center gap-2">
              <BuildingIcon className="h-4 w-4 text-muted-foreground" aria-hidden="true" />
              <CardTitle className="text-base">Company Profile</CardTitle>
            </div>
            <CardDescription>
              Your company name appears in service reports and customer emails.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <CompanyProfileSettings orgName={orgName} />
          </CardContent>
        </Card>
      )}

      {/* ── Owner: Notification Settings ────────────────────────────────── */}
      {isOwner && orgSettings && (
        <Card>
          <CardHeader>
            <div className="flex items-center gap-2">
              <BellIcon className="h-4 w-4 text-muted-foreground" aria-hidden="true" />
              <CardTitle className="text-base">Notifications</CardTitle>
            </div>
            <CardDescription>
              Control which notifications are sent to customers and which alerts are generated for your office.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <NotificationSettings settings={orgSettings} />
          </CardContent>
        </Card>
      )}

      {/* ── Owner: Service Requirements ──────────────────────────────────── */}
      {isOwner && orgSettings && (
        <Card>
          <CardHeader>
            <div className="flex items-center gap-2">
              <ClipboardCheckIcon className="h-4 w-4 text-muted-foreground" aria-hidden="true" />
              <CardTitle className="text-base">Service Requirements</CardTitle>
            </div>
            <CardDescription>
              Configure required chemistry readings per sanitizer type and required checklist tasks. Techs see warnings but are never blocked from completing stops.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <ServiceRequirements settings={orgSettings} />
          </CardContent>
        </Card>
      )}

      {/* ── Maps app preference — visible to ALL roles (FIELD-11) ─────────── */}
      <Card>
        <CardHeader>
          <div className="flex items-center gap-2">
            <MapPinIcon className="h-4 w-4 text-muted-foreground" aria-hidden="true" />
            <CardTitle className="text-base">Navigation</CardTitle>
          </div>
          <CardDescription>
            Choose which maps app opens when you tap the navigate button on a stop.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <MapsPreferenceSetting />
        </CardContent>
      </Card>

      {/* ── Profile section — read-only for tech, editable for owner/office ── */}
      <Card>
        <CardHeader>
          <div className="flex items-center gap-2">
            <UserIcon className="h-4 w-4 text-muted-foreground" aria-hidden="true" />
            <CardTitle className="text-base">Your Profile</CardTitle>
          </div>
          <CardDescription>
            {isTech ? "Your account details." : "Update your display name."}
          </CardDescription>
        </CardHeader>
        <CardContent>
          {isTech ? (
            /* Tech: read-only profile view */
            <div className="flex flex-col gap-3">
              <div className="flex items-center justify-between py-1">
                <div>
                  <p className="text-sm font-medium">{user.full_name || "—"}</p>
                  <p className="text-xs text-muted-foreground">Display name</p>
                </div>
              </div>
              <div className="flex items-center justify-between py-1">
                <div>
                  <p className="text-sm font-medium">{user.email}</p>
                  <p className="text-xs text-muted-foreground">Email</p>
                </div>
                <Badge variant="outline" className="capitalize">
                  {user.role}
                </Badge>
              </div>
            </div>
          ) : (
            <ProfileForm
              userId={user.id}
              initialName={user.full_name || ""}
              email={user.email}
            />
          )}
        </CardContent>
      </Card>

      {/* ── Organization section — office role only (owner has company profile above) ── */}
      {!isTech && !isOwner && (
        <Card>
          <CardHeader>
            <div className="flex items-center gap-2">
              <BuildingIcon className="h-4 w-4 text-muted-foreground" aria-hidden="true" />
              <CardTitle className="text-base">Organization</CardTitle>
            </div>
            <CardDescription>
              Your organization&apos;s details.
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
      )}

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
              className="text-destructive hover:text-destructive hover:bg-destructive/10 border-destructive/30 cursor-pointer"
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
