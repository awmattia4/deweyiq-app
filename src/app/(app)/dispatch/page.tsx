import type { Metadata } from "next"
import { redirect } from "next/navigation"
import { getCurrentUser } from "@/actions/auth"
import { MapPinIcon } from "lucide-react"

export const metadata: Metadata = {
  title: "Dispatch",
}

/**
 * DispatchPage — placeholder for the live dispatch map.
 *
 * Phase 4 plan 02: Shows a placeholder div for the map.
 * Phase 4 plan 05 builds the real MapLibre-based dispatch map.
 *
 * Role guard: owner and office only. Techs are redirected to /routes.
 */
export default async function DispatchPage() {
  const user = await getCurrentUser()

  if (!user) redirect("/login")
  if (user.role === "tech") redirect("/routes")
  if (user.role === "customer") redirect("/portal")

  return (
    <div className="flex flex-col gap-6">
      {/* ── Page header ──────────────────────────────────────────────────── */}
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Dispatch Map</h1>
        <p className="text-muted-foreground text-sm mt-1">
          Live tech locations and real-time route progress
        </p>
      </div>

      {/* ── Map placeholder ───────────────────────────────────────────────── */}
      <div className="rounded-lg border border-dashed border-border bg-muted/10 flex flex-col items-center justify-center gap-4 min-h-[480px]">
        <div className="rounded-full bg-muted/30 p-4">
          <MapPinIcon className="h-10 w-10 text-muted-foreground/40" />
        </div>
        <div className="text-center max-w-sm px-4">
          <p className="text-sm font-medium">Live dispatch map coming soon</p>
          <p className="text-xs text-muted-foreground mt-1">
            Phase 4 plan 05 will build the full MapLibre dispatch map with live tech
            tracking, route overlays, and one-click stop reassignment.
          </p>
        </div>
      </div>
    </div>
  )
}
