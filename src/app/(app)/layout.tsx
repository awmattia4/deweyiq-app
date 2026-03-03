import { redirect } from "next/navigation"
import { getCurrentUser } from "@/actions/auth"
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

  return <AppShell user={user}>{children}</AppShell>
}
