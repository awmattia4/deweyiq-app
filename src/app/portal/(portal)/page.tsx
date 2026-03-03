import type { Metadata } from "next"
import { getCurrentUser } from "@/actions/auth"

export const metadata: Metadata = {
  title: "My Portal",
}

/**
 * Portal home — Customer landing page after login.
 *
 * Full portal content (service history, upcoming visits, etc.) arrives in Phase 8.
 * Phase 1: placeholder to confirm the portal shell is working.
 */
export default async function PortalHomePage() {
  const user = await getCurrentUser()

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">
          Welcome back{user?.full_name ? `, ${user.full_name.split(" ")[0]}` : ""}
        </h1>
        <p className="text-muted-foreground text-sm mt-1">
          Your pool service portal.
        </p>
      </div>

      {/* Placeholder — full content in Phase 8 (customer portal) */}
      <div className="rounded-lg border border-dashed border-border/60 p-8 text-center">
        <p className="text-sm text-muted-foreground">
          Service history, upcoming visits, and invoices — coming in Phase 8.
        </p>
      </div>
    </div>
  )
}
