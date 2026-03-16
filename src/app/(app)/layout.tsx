import { redirect } from "next/navigation"
import { getCurrentUser } from "@/actions/auth"
import { getAlertCount } from "@/actions/alerts"
import { getOrgBranding } from "@/actions/company-settings"
import { getUnreadCount } from "@/actions/user-notifications"
import { AppShell } from "@/components/shell/app-shell"

/**
 * Protected staff layout — wraps all /(app)/* routes.
 *
 * Defense-in-depth: proxy.ts catches unauthenticated requests first,
 * but this layout provides a second auth check in case a request
 * bypasses the proxy (e.g. direct server render, ISR revalidation).
 *
 * Auth rules:
 * - Not authenticated → redirect to /login
 * - Customer role → redirect to /portal (customers have no staff access)
 * - Tech, office, owner → render AppShell with user data
 *
 * Note: Tech accessing /dashboard or /team pages is handled at the
 * page level (finer-grained control). This layout allows all staff roles.
 *
 * Calls initSyncListener() and prefetchTodayRoutes() via AppShell's
 * SyncInitializer client component (per locked decision on pre-caching).
 *
 * Phase 5: alertCount fetched for owner/office — powers sidebar badge.
 * Non-fatal: defaults to 0 if the query fails.
 */
export default async function AppLayout({
  children,
}: {
  children: React.ReactNode
}) {
  const user = await getCurrentUser()

  if (!user) {
    redirect("/login")
  }

  if (user.role === "customer") {
    redirect("/portal")
  }

  // Fetch alert count, org branding, and unread notification count in parallel
  const [alertCount, orgBranding, unreadNotificationCount] = await Promise.all([
    getAlertCount(),
    getOrgBranding(),
    getUnreadCount(),
  ])

  return (
    <AppShell
      user={user}
      alertCount={alertCount}
      orgName={orgBranding?.name ?? null}
      orgLogoUrl={orgBranding?.logoUrl ?? null}
      orgId={user.org_id}
      unreadNotificationCount={unreadNotificationCount}
    >
      {children}
    </AppShell>
  )
}
