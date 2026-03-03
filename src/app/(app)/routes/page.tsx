import type { Metadata } from "next"

export const metadata: Metadata = {
  title: "Routes",
}

/**
 * Routes — Tech landing page (and accessible to office/owner too).
 *
 * Full route content (today's stops, map, etc.) arrives in Phase 3.
 * Plan 06 provides skeleton screens.
 */
export default async function RoutesPage() {
  return (
    <div className="flex flex-col gap-4">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Routes</h1>
        <p className="text-muted-foreground text-sm mt-1">
          Today&apos;s service stops and route management.
        </p>
      </div>

      {/* Placeholder — full content in Phase 3 (route management) */}
      <div className="rounded-lg border border-dashed border-border/60 p-8 text-center">
        <p className="text-sm text-muted-foreground">
          Route management content coming in Phase 3.
        </p>
      </div>
    </div>
  )
}
