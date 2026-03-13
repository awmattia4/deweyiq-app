import type { Metadata } from "next"
import { redirect } from "next/navigation"
import { getCurrentUser } from "@/actions/auth"
import {
  resolveCustomerId,
  getServiceHistory,
  getVisitPhotos,
} from "@/actions/portal-data"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { VisitTimeline } from "@/components/portal/visit-timeline"
import { PhotoGallery } from "@/components/portal/photo-gallery"

export const metadata: Metadata = {
  title: "Service History",
}

/**
 * Portal Service History page.
 *
 * Shows the customer's complete service history across all their pools.
 * - Multiple pools: tabs (one per pool + "All" + "Photos")
 * - Single pool: no tabs, just the timeline directly
 * - Photos tab: full gallery with lightbox
 *
 * All data fetched server-side via adminDb (no RLS — portal customer pattern).
 */
export default async function ServiceHistoryPage() {
  const user = await getCurrentUser()
  if (!user) redirect("/portal/login")

  const customerId = await resolveCustomerId(user.org_id, user.email)
  if (!customerId) redirect("/portal")

  // Fetch service history and photos in parallel
  const [historyData, allPhotos] = await Promise.all([
    getServiceHistory(user.org_id, customerId),
    getVisitPhotos(user.org_id, customerId),
  ])

  const { pools, visits } = historyData
  const hasMultiplePools = pools.length > 1

  return (
    <div className="flex flex-col gap-6">
      {/* ── Page header ──────────────────────────────────────────────────── */}
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Service History</h1>
        <p className="text-sm text-muted-foreground mt-1">
          {visits.length > 0
            ? `${visits.length} completed visit${visits.length !== 1 ? "s" : ""} on record`
            : "Your service history will appear here after your first visit."}
        </p>
      </div>

      {/* ── No history empty state ───────────────────────────────────────── */}
      {visits.length === 0 && (
        <div className="rounded-lg border border-border/60 bg-card/50 p-8 text-center">
          <p className="text-sm text-muted-foreground italic">
            No service visits yet. Your service history will appear here after your first visit.
          </p>
        </div>
      )}

      {/* ── History with visits ──────────────────────────────────────────── */}
      {visits.length > 0 && (
        <>
          {hasMultiplePools ? (
            /* Multiple pools — show tabs */
            <Tabs defaultValue="all">
              <TabsList className="h-auto flex-wrap gap-1">
                <TabsTrigger value="all" className="text-xs">
                  All Pools
                </TabsTrigger>
                {pools.map((pool) => (
                  <TabsTrigger key={pool.id} value={pool.id} className="text-xs">
                    {pool.name ?? "Pool"}
                  </TabsTrigger>
                ))}
                <TabsTrigger value="photos" className="text-xs">
                  Photos
                </TabsTrigger>
              </TabsList>

              {/* All visits tab */}
              <TabsContent value="all" className="mt-4">
                <VisitTimeline visits={visits} />
              </TabsContent>

              {/* Per-pool tabs */}
              {pools.map((pool) => {
                const poolVisits = visits.filter((v) => v.pool_id === pool.id)
                return (
                  <TabsContent key={pool.id} value={pool.id} className="mt-4">
                    <VisitTimeline visits={poolVisits} />
                  </TabsContent>
                )
              })}

              {/* Photos tab */}
              <TabsContent value="photos" className="mt-4">
                <PhotoGallery photos={allPhotos} />
              </TabsContent>
            </Tabs>
          ) : (
            /* Single pool (or no pools assigned) — tabs only for Photos */
            <Tabs defaultValue="timeline">
              <TabsList>
                <TabsTrigger value="timeline" className="text-xs">
                  Timeline
                </TabsTrigger>
                {allPhotos.length > 0 && (
                  <TabsTrigger value="photos" className="text-xs">
                    Photos ({allPhotos.length})
                  </TabsTrigger>
                )}
              </TabsList>

              <TabsContent value="timeline" className="mt-4">
                <VisitTimeline visits={visits} />
              </TabsContent>

              {allPhotos.length > 0 && (
                <TabsContent value="photos" className="mt-4">
                  <PhotoGallery photos={allPhotos} />
                </TabsContent>
              )}
            </Tabs>
          )}
        </>
      )}
    </div>
  )
}
