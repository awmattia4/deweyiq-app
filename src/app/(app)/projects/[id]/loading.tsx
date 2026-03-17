import { Skeleton } from "@/components/ui/skeleton"

/**
 * Loading skeleton for the project detail page.
 * Matches the tabbed layout: header + 3 tab buttons + content area.
 */
export default function ProjectDetailLoading() {
  return (
    <div className="flex flex-col gap-6 p-6">
      {/* Header skeleton */}
      <div className="flex flex-col gap-3">
        <div className="flex items-center gap-2">
          <Skeleton className="h-4 w-24" />
        </div>
        <div className="flex items-start justify-between gap-4">
          <div className="flex flex-col gap-2">
            <Skeleton className="h-7 w-72" />
            <div className="flex gap-2">
              <Skeleton className="h-5 w-20" />
              <Skeleton className="h-5 w-24" />
            </div>
          </div>
          <div className="flex gap-2">
            <Skeleton className="h-8 w-20" />
            <Skeleton className="h-8 w-24" />
          </div>
        </div>
        {/* Stage progression */}
        <div className="flex gap-2 mt-2">
          {Array.from({ length: 6 }).map((_, i) => (
            <Skeleton key={i} className="h-2 flex-1 rounded-full" />
          ))}
        </div>
      </div>

      {/* Tab buttons skeleton */}
      <div className="flex gap-1 border-b border-border">
        {["Overview", "Phases", "Activity"].map((tab) => (
          <Skeleton key={tab} className="h-9 w-20 mb-0 rounded-b-none" />
        ))}
      </div>

      {/* Content skeleton */}
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        <div className="flex flex-col gap-4">
          <Skeleton className="h-48 w-full rounded-lg" />
          <Skeleton className="h-32 w-full rounded-lg" />
        </div>
        <div className="flex flex-col gap-4">
          <Skeleton className="h-64 w-full rounded-lg" />
        </div>
      </div>
    </div>
  )
}
