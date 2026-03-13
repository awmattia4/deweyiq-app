import type { Metadata } from "next"
import { headers } from "next/headers"
import { getOrgBranding, getOrgBySlug } from "@/actions/portal-data"
import { PortalLoginForm } from "./portal-login-form"

export const metadata: Metadata = {
  title: "Sign in to your portal",
}

/**
 * Portal login page — server wrapper that resolves company branding.
 *
 * Reads the x-portal-slug header set by the middleware for subdomain routing.
 * In dev/localhost, no slug → falls back to generic PoolCo branding.
 *
 * The actual form is a client component (PortalLoginForm) that handles
 * the magic link submission flow.
 */
export default async function PortalLoginPage() {
  const headersList = await headers()
  const portalSlug = headersList.get("x-portal-slug")

  let branding = null

  if (portalSlug) {
    const orgResult = await getOrgBySlug(portalSlug)
    if (orgResult) {
      branding = await getOrgBranding(orgResult.orgId)
    }
  }

  return (
    <PortalLoginForm branding={branding} />
  )
}
