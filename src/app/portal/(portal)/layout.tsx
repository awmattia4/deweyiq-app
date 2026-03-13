import type { Metadata } from "next"
import { redirect } from "next/navigation"
import { headers } from "next/headers"
import { getCurrentUser } from "@/actions/auth"
import { resolveCustomerId, getOrgBranding } from "@/actions/portal-data"
import { getCustomerOrgs } from "@/actions/portal-auth"
import { PortalShell } from "@/components/shell/portal-shell"
import { CompanyPicker } from "@/components/portal/company-picker"

/**
 * Authenticated portal layout — wraps all /portal/(portal)/* routes.
 *
 * Route group: (portal) — does NOT appear in the URL path.
 * Applies to authenticated customer pages: portal home, service history,
 * invoices, messages, requests.
 *
 * Auth rules:
 * - Not authenticated → redirect to /portal/login
 * - Not a customer (staff visiting portal) → redirect to /dashboard
 * - Multi-org customer without org_id set → show company picker
 * - Customer → render PortalShell with branding + customerId
 *
 * Portal dynamic favicon is handled via generateMetadata.
 */

export async function generateMetadata(): Promise<Metadata> {
  const user = await getCurrentUser()
  if (!user || user.role !== "customer") return {}

  const branding = await getOrgBranding(user.org_id)
  if (!branding?.faviconUrl) return {}

  return {
    icons: {
      icon: branding.faviconUrl,
    },
  }
}

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

  // Load branding and customer ID in parallel
  const [branding, customerId] = await Promise.all([
    getOrgBranding(user.org_id),
    resolveCustomerId(user.org_id, user.email),
  ])

  // Check if this is a multi-org customer who hasn't selected an org yet.
  // If the user has multiple orgs and we can't resolve a customer row,
  // they may need to pick an org.
  if (!customerId) {
    // Try to find their other orgs
    const customerOrgs = await getCustomerOrgs(user.id, user.email)

    if (customerOrgs.length > 1) {
      // Multi-org customer — show company picker
      return (
        <CompanyPicker
          companies={customerOrgs}
          currentOrgId={user.org_id}
        />
      )
    }

    // Single org but no customer row yet — account is being set up
    return (
      <div className="min-h-screen flex items-center justify-center p-4">
        <div className="max-w-sm text-center">
          <h1 className="text-xl font-semibold">Account being set up</h1>
          <p className="text-sm text-muted-foreground mt-2">
            Your portal is being prepared. Please check back shortly or
            contact your pool service company.
          </p>
        </div>
      </div>
    )
  }

  return (
    <PortalShell user={user} branding={branding} customerId={customerId}>
      {children}
    </PortalShell>
  )
}
