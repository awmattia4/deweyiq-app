import { Skeleton } from "@/components/ui/skeleton"

/**
 * Team page loading skeleton.
 *
 * Matches the team page layout:
 * - Page header with member count and invite button
 * - Rows of member cards (avatar, name, email, role badge, joined date)
 */
export default function TeamLoading() {
  return (
    <div className="flex flex-col gap-6">
      {/* Page header skeleton */}
      <div className="flex items-center justify-between">
        <div className="flex flex-col gap-2">
          <Skeleton className="h-8 w-20" />
          <Skeleton className="h-4 w-40" />
        </div>
        <Skeleton className="h-8 w-32 rounded-md" />
      </div>

      {/* Member list skeleton */}
      <div className="rounded-xl border border-border overflow-hidden">
        <div className="divide-y divide-border">
          {Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="flex items-center gap-4 px-4 py-3">
              {/* Avatar */}
              <Skeleton className="h-9 w-9 shrink-0 rounded-full" />

              {/* Name + email */}
              <div className="flex flex-1 flex-col gap-1.5">
                <Skeleton className="h-4 w-36" />
                <Skeleton className="h-3.5 w-48" />
              </div>

              {/* Role badge + date */}
              <div className="flex flex-col items-end gap-1 shrink-0">
                <Skeleton className="h-5 w-20 rounded-full" />
                <Skeleton className="h-3.5 w-24" />
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}
