import { Skeleton } from "@/components/ui/skeleton"

/**
 * Projects page loading skeleton — matches the kanban board layout.
 */
export default function ProjectsLoading() {
  return (
    <div className="flex flex-col gap-6">
      {/* Header */}
      <div className="flex items-center justify-between gap-4">
        <Skeleton className="h-8 w-28" />
        <div className="flex items-center gap-2">
          <Skeleton className="h-8 w-[120px]" />
          <Skeleton className="h-8 w-[120px]" />
        </div>
      </div>

      {/* Metrics row */}
      <div className="flex gap-3">
        {[1, 2, 3, 4].map((i) => (
          <Skeleton key={i} className="h-[80px] w-[130px] rounded-lg" />
        ))}
      </div>

      {/* Kanban columns skeleton */}
      <div className="flex gap-3 overflow-x-auto pb-4">
        {[1, 2, 3, 4, 5].map((col) => (
          <div
            key={col}
            className="flex flex-col gap-2 min-w-[220px] w-[220px] shrink-0 rounded-lg border border-border/40 bg-muted/20 p-2.5"
          >
            <div className="flex items-center justify-between px-0.5 py-0.5">
              <Skeleton className="h-3 w-20" />
              <Skeleton className="h-5 w-5 rounded-full" />
            </div>
            {[1, 2, 3].map((card) => (
              <div key={card} className="rounded-lg border border-border/40 bg-card p-3 flex flex-col gap-2">
                <Skeleton className="h-4 w-full" />
                <Skeleton className="h-3 w-3/4" />
                <div className="flex items-center justify-between">
                  <Skeleton className="h-5 w-16 rounded-full" />
                  <Skeleton className="h-3 w-14" />
                </div>
              </div>
            ))}
          </div>
        ))}
      </div>
    </div>
  )
}
