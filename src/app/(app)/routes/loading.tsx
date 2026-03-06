import { Skeleton } from "@/components/ui/skeleton"

/**
 * Routes loading skeleton.
 *
 * Matches the Phase 3 routes page layout:
 * - Date header with label and date
 * - Progress bar skeleton
 * - 4 stop card skeletons with pulsing animation
 *
 * Per user decision: skeleton screens, not splash screen.
 * Each skeleton card matches the StopCard shape (name, address, pool info, navigate button).
 */
export default function RoutesLoading() {
  return (
    <div className="flex flex-col gap-5">
      {/* Date header skeleton */}
      <div className="flex items-center justify-between">
        <div className="flex flex-col gap-2">
          <Skeleton className="h-3.5 w-12" />
          <Skeleton className="h-8 w-56" />
        </div>
        <Skeleton className="h-8 w-16 rounded-lg" />
      </div>

      {/* Progress bar skeleton */}
      <div className="flex flex-col gap-2 min-h-[44px] justify-center">
        <div className="flex justify-between">
          <Skeleton className="h-4 w-28" />
          <Skeleton className="h-4 w-8" />
        </div>
        <Skeleton className="h-2 w-full rounded-full" />
      </div>

      {/* Stop card skeletons — 4 cards matching StopCard layout */}
      <div className="flex flex-col gap-2.5">
        {Array.from({ length: 4 }).map((_, i) => (
          <div
            key={i}
            className="flex items-stretch gap-0 rounded-xl border border-border bg-card overflow-hidden"
          >
            {/* Stop number */}
            <div className="flex items-center justify-center w-10 shrink-0 pl-4">
              <Skeleton className="h-4 w-4 rounded" />
            </div>

            {/* Main content */}
            <div className="flex flex-1 flex-col py-3 pr-3 pl-2 gap-2">
              {/* Row 1: name + badge */}
              <div className="flex items-center justify-between gap-2">
                <Skeleton className="h-4 w-36" />
                <Skeleton className="h-4 w-16 rounded-full" />
              </div>
              {/* Row 2: address */}
              <Skeleton className="h-3.5 w-52" />
              {/* Row 3: pool info */}
              <div className="flex items-center gap-1.5">
                <Skeleton className="h-3.5 w-3.5 rounded" />
                <Skeleton className="h-3.5 w-40" />
              </div>
            </div>

            {/* Navigate button */}
            <div className="flex items-center pr-3 pl-1 shrink-0">
              <Skeleton className="h-11 w-11 rounded-lg" />
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}
