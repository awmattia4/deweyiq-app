import type { Metadata } from "next"
import { redirect } from "next/navigation"
import dynamic from "next/dynamic"
import { getCurrentUser } from "@/actions/auth"
import { getDispatchData } from "@/actions/dispatch"
import { DispatchClientShell } from "./dispatch-client-shell"

export const metadata: Metadata = {
  title: "Dispatch",
}

/**
 * DispatchPage — live dispatch map for office and owner.
 *
 * Server component that:
 * - Guards access: tech → /routes, customer → /portal
 * - Fetches initial dispatch data (all techs + today's stops) server-side
 * - Passes data to DispatchClientShell (client component with TechFilter state)
 * - DispatchMap is loaded via dynamic() with ssr: false (MapLibre needs window)
 *
 * Phase 4 Plan 05: Full MapLibre dispatch map with:
 * - Live tech positions via Supabase Realtime Broadcast
 * - Route lines per tech through remaining stops
 * - Numbered stop markers (colored by tech)
 * - Completed stops grayed out
 * - Clickable stop markers → popup card
 * - Tech filter toggle (all-techs / single-tech)
 */
export default async function DispatchPage() {
  const user = await getCurrentUser()

  if (!user) redirect("/login")
  if (user.role === "tech") redirect("/routes")
  if (user.role === "customer") redirect("/portal")

  const dispatchData = await getDispatchData()

  return (
    <div className="flex flex-col" style={{ height: "calc(100dvh - 4rem)" }}>
      <DispatchClientShell
        initialData={dispatchData}
        orgId={user.org_id}
      />
    </div>
  )
}
