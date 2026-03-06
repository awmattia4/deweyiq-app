import { notFound } from "next/navigation"
import { getStopContext } from "@/actions/visits"
import { StopWorkflow } from "@/components/field/stop-workflow"

/**
 * Stop workflow page — the tech's main work surface for a single stop.
 *
 * The stopId param is a composite key format: {customerId}-{poolId}.
 * This avoids a dedicated route_stops table in Phase 3 (Phase 4 replaces
 * with relational stop rows per locked decision).
 *
 * Server component: fetches stop context (pool info, previous visit chemistry,
 * checklist tasks, chemical products) and passes to the client StopWorkflow.
 *
 * The StopWorkflow client component handles Dexie draft creation/loading on
 * mount, so all chemistry entry is offline-first from the start.
 */
export default async function StopWorkflowPage({
  params,
}: {
  params: Promise<{ stopId: string }>
}) {
  const { stopId } = await params

  // stopId format: {customerId}-{poolId} — both are UUIDs (36 chars each + hyphen = 73 chars)
  // UUID format: xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx (36 chars)
  // Composite: {uuid1}-{uuid2} — split on the boundary between the two UUIDs
  const parts = stopId.split("-")

  // UUIDs have 5 groups separated by hyphens (8-4-4-4-12 = 32 hex chars + 4 dashes = 36 chars)
  // Two UUIDs joined: 10 groups total — first 5 are customerId, last 5 are poolId
  if (parts.length !== 10) {
    notFound()
  }

  const customerId = parts.slice(0, 5).join("-")
  const poolId = parts.slice(5, 10).join("-")

  // Fetch stop context from the server (online-first; Dexie routeCache used offline)
  const context = await getStopContext(customerId, poolId)

  if (!context) {
    notFound()
  }

  // Generate a visit UUID server-side so the client knows the visit_id
  // before any Supabase sync (optimistic offline writes — per locked decision)
  const visitId = crypto.randomUUID()

  return (
    <StopWorkflow
      stopId={stopId}
      visitId={visitId}
      context={context}
    />
  )
}
