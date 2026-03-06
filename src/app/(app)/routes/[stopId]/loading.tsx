import { Skeleton } from "@/components/ui/skeleton"

/**
 * Stop workflow loading skeleton.
 *
 * Matches the stop workflow layout:
 * - Header with back button, customer name, pool name
 * - Tab bar with 4 tabs
 * - Chemistry grid skeleton rows
 * - Complete button at bottom
 */
export default function StopWorkflowLoading() {
  return (
    <div className="flex flex-col min-h-[calc(100dvh-4rem)]">
      {/* Header skeleton */}
      <div className="flex items-center gap-3 px-4 pt-4 pb-3 border-b border-border/60">
        <Skeleton className="h-10 w-10 rounded-md shrink-0" />
        <div className="flex flex-col gap-1.5 min-w-0">
          <Skeleton className="h-5 w-40" />
          <Skeleton className="h-4 w-24" />
        </div>
      </div>

      {/* Tab bar skeleton */}
      <div className="flex gap-0 px-4 border-b border-border/60">
        {["Chemistry", "Tasks", "Photos", "Notes"].map((tab) => (
          <div key={tab} className="px-3 py-3 shrink-0">
            <Skeleton className="h-4 w-16" />
          </div>
        ))}
      </div>

      {/* Chemistry grid skeleton */}
      <div className="px-4 py-4 flex flex-col gap-3">
        {/* Section header */}
        <Skeleton className="h-4 w-28" />

        {/* Grid rows */}
        {Array.from({ length: 10 }).map((_, i) => (
          <div key={i} className="flex items-center gap-3 py-2">
            {/* Parameter name */}
            <Skeleton className="h-4 w-32 shrink-0" />
            {/* Input cell */}
            <Skeleton className="h-10 flex-1" />
            {/* Previous reading */}
            <Skeleton className="h-4 w-12 shrink-0" />
          </div>
        ))}

        {/* Divider */}
        <div className="h-px bg-border/60 my-2" />

        {/* LSI section skeleton */}
        <Skeleton className="h-4 w-20" />
        <div className="rounded-xl border border-border/60 bg-card p-4 flex items-center justify-between">
          <Skeleton className="h-4 w-24" />
          <Skeleton className="h-6 w-16 rounded-full" />
        </div>

        {/* Dosing rows skeleton */}
        {Array.from({ length: 2 }).map((_, i) => (
          <div key={i} className="rounded-lg border border-border/60 bg-card p-3 flex gap-3 items-start">
            <Skeleton className="h-8 w-8 rounded-md shrink-0" />
            <div className="flex flex-col gap-1.5 flex-1">
              <Skeleton className="h-4 w-48" />
              <Skeleton className="h-3.5 w-36" />
            </div>
          </div>
        ))}
      </div>

      {/* Complete button skeleton at bottom */}
      <div className="fixed bottom-0 left-0 right-0 p-4 border-t border-border/60 bg-background">
        <Skeleton className="h-12 w-full rounded-xl" />
      </div>
    </div>
  )
}
