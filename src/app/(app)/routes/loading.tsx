import { Skeleton } from "@/components/ui/skeleton"

/**
 * Routes loading skeleton.
 *
 * Matches the routes page layout:
 * - Date header with label and date
 * - List of 5 stop card skeletons (address, customer name, time slot)
 *
 * Per user decision: skeleton screens, not splash screen.
 */
export default function RoutesLoading() {
  return (
    <div className="flex flex-col gap-6">
      {/* Date header skeleton */}
      <div className="flex flex-col gap-2">
        <Skeleton className="h-3.5 w-12" />
        <Skeleton className="h-8 w-56" />
      </div>

      {/* Stop card skeletons */}
      <div className="flex flex-col gap-3">
        {Array.from({ length: 5 }).map((_, i) => (
          <div
            key={i}
            className="flex items-center gap-4 rounded-xl border border-border bg-card p-4"
          >
            {/* Stop number / status indicator */}
            <Skeleton className="h-8 w-8 shrink-0 rounded-full" />

            {/* Stop details */}
            <div className="flex flex-1 flex-col gap-1.5">
              {/* Customer name */}
              <Skeleton className="h-4 w-36" />
              {/* Address */}
              <Skeleton className="h-3.5 w-52" />
            </div>

            {/* Time slot */}
            <div className="flex flex-col items-end gap-1 shrink-0">
              <Skeleton className="h-3.5 w-16" />
              <Skeleton className="h-5 w-14 rounded-full" />
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}
