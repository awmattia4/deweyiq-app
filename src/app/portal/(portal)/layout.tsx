import { redirect } from "next/navigation"
import { getCurrentUser } from "@/actions/auth"
import { PortalShell } from "@/components/shell/portal-shell"

/**
 * Authenticated portal layout — wraps all /portal/(portal)/* routes.
 *
 * Route group: (portal) — does NOT appear in the URL path.
 * Applies to authenticated customer pages: portal home, service history,
 * invoices, messages, etc. (Phase 8 content).
 *
 * Auth rules:
 * - Not authenticated → redirect to /portal/login
 * - Not a customer (staff visiting portal) → redirect to /dashboard
 * - Customer → render PortalShell with user data
 *
 * /portal/login is NOT in this route group — it sits at the /portal level
 * and uses the minimal root portal layout (no auth guard).
 *
 * Per user decision: "customer portal shows the pool company's own logo
 * and colors." Phase 1: placeholder branding. Phase 8: real company branding.
 */
export default async function AuthenticatedPortalLayout({
  children,
}: {
  children: React.ReactNode
}) {
  const user = await getCurrentUser()

  if (!user) {
    redirect("/portal/login")
  }

  if (user.role !== "customer") {
    // Staff accessing the customer portal → send back to their dashboard
    redirect("/dashboard")
  }

  return <PortalShell user={user}>{children}</PortalShell>
}
