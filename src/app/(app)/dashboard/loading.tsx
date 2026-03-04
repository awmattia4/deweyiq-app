import { Skeleton } from "@/components/ui/skeleton"
import { Card, CardContent, CardHeader } from "@/components/ui/card"

/**
 * Dashboard loading skeleton.
 *
 * Per user decision: "Loading experience: skeleton screens
 * (show layout structure with gray placeholders immediately),
 * not splash screen."
 *
 * Matches the dashboard layout:
 * - Page header (greeting + org/date line + role badge)
 * - 3-column metric cards
 * - Quick actions row
 */
export default function DashboardLoading() {
  return (
    <div className="flex flex-col gap-6">
      {/* Page header skeleton */}
      <div className="flex items-start justify-between">
        <div className="flex flex-col gap-2">
          <Skeleton className="h-8 w-48" />
          <Skeleton className="h-4 w-64" />
        </div>
        <Skeleton className="hidden sm:block h-6 w-20 rounded-full" />
      </div>

      {/* Metric cards skeleton */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {Array.from({ length: 3 }).map((_, i) => (
          <Card key={i}>
            <CardHeader className="pb-2">
              <div className="flex items-center justify-between">
                <Skeleton className="h-3.5 w-24" />
                <Skeleton className="h-4 w-4 rounded" />
              </div>
              <Skeleton className="h-9 w-16 mt-1" />
            </CardHeader>
            <CardContent>
              <Skeleton className="h-3 w-40" />
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Quick actions skeleton */}
      <div>
        <Skeleton className="h-3.5 w-28 mb-3" />
        <div className="flex gap-3">
          <Skeleton className="h-8 w-40 rounded-md" />
          <Skeleton className="h-8 w-32 rounded-md" />
        </div>
      </div>
    </div>
  )
}
