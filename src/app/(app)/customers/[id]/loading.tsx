import { Skeleton } from "@/components/ui/skeleton"

/**
 * CustomerProfileLoading — skeleton for the customer profile page.
 *
 * Mirrors the layout: header section + tab list + content area.
 * Shown while the server component fetches customer + pools + equipment.
 */
export default function CustomerProfileLoading() {
  return (
    <div className="flex flex-col gap-6">
      {/* ── Header skeleton ───────────────────────────────────────────────── */}
      <div className="rounded-lg border border-border bg-card p-5 flex flex-col gap-3">
        <div className="flex items-start justify-between gap-4">
          <div className="flex flex-col gap-2">
            <Skeleton className="h-7 w-48" />
            <Skeleton className="h-4 w-64" />
            <Skeleton className="h-4 w-32" />
          </div>
          <div className="flex items-center gap-2">
            <Skeleton className="h-6 w-20 rounded-full" />
            <Skeleton className="h-8 w-20" />
          </div>
        </div>
        <div className="flex gap-4">
          <Skeleton className="h-4 w-28" />
          <Skeleton className="h-4 w-24" />
        </div>
      </div>

      {/* ── Tab list skeleton ─────────────────────────────────────────────── */}
      <div className="grid grid-cols-4 gap-1 rounded-md bg-muted p-1">
        {Array.from({ length: 4 }).map((_, i) => (
          <Skeleton key={i} className="h-8 rounded-sm" />
        ))}
      </div>

      {/* ── Content area skeleton ─────────────────────────────────────────── */}
      <div className="flex flex-col gap-4">
        {Array.from({ length: 6 }).map((_, i) => (
          <div key={i} className="flex flex-col gap-1.5">
            <Skeleton className="h-4 w-24" />
            <Skeleton className="h-9 w-full" />
          </div>
        ))}
      </div>
    </div>
  )
}
