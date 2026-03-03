import type { Metadata } from "next"
import { redirect } from "next/navigation"
import { getCurrentUser } from "@/actions/auth"

export const metadata: Metadata = {
  title: "Dashboard",
}

/**
 * Dashboard — Owner and office landing page.
 *
 * Techs are redirected to /routes (they don't use the dashboard).
 * Full dashboard content arrives in Plan 06 (skeleton screens) and Phase 2+.
 */
export default async function DashboardPage() {
  const user = await getCurrentUser()

  // Techs don't have access to dashboard — redirect to their work view
  if (user?.role === "tech") {
    redirect("/routes")
  }

  return (
    <div className="flex flex-col gap-4">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Dashboard</h1>
        <p className="text-muted-foreground text-sm mt-1">
          Overview of your pool service business.
        </p>
      </div>

      {/* Placeholder — full content in Plan 06 (landing pages + skeleton screens) */}
      <div className="rounded-lg border border-dashed border-border/60 p-8 text-center">
        <p className="text-sm text-muted-foreground">
          Dashboard content coming in Plan 06.
        </p>
      </div>
    </div>
  )
}
