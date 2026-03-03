import type { Metadata } from "next"

export const metadata: Metadata = {
  title: {
    template: "%s | Customer Portal",
    default: "Customer Portal",
  },
}

/**
 * Portal root layout — minimal wrapper for all /portal/* routes.
 *
 * This layout intentionally has NO auth guard because /portal/login
 * must be accessible to unauthenticated users. The login page is a child
 * of this layout.
 *
 * Auth-guarded portal pages (Phase 8) will live under a nested route group:
 *   /portal/(portal)/layout.tsx → PortalShell + auth guard
 *   /portal/(portal)/dashboard, /portal/(portal)/invoices, etc.
 *
 * The proxy (proxy.ts) handles the core redirect:
 *   - Unauthenticated /portal/* (except /portal/login) → /portal/login
 *   - Authenticated customer /portal/login → /portal
 *
 * Per user decision: "customer portal shows the pool company's own logo
 * and colors." Phase 1: placeholder branding via PortalShell in the
 * (portal) route group layout.
 */
export default function PortalRootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return <>{children}</>
}
