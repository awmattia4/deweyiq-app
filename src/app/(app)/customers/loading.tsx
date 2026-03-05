import { Skeleton } from "@/components/ui/skeleton"

/**
 * CustomersLoading — Skeleton loading state for the customers page.
 *
 * Mirrors the layout of CustomerTable: toolbar row + table with 6 columns.
 * Shown while the server component fetches customer data.
 */
export default function CustomersLoading() {
  return (
    <div className="flex flex-col gap-6">
      {/* ── Page header skeleton ─────────────────────────────────────────── */}
      <div className="flex flex-col gap-2">
        <Skeleton className="h-8 w-40" />
        <Skeleton className="h-4 w-64" />
      </div>

      {/* ── Toolbar skeleton ─────────────────────────────────────────────── */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex flex-wrap gap-2">
          <Skeleton className="h-9 w-48" />
          <Skeleton className="h-9 w-36" />
          <Skeleton className="h-9 w-32" />
          <Skeleton className="h-9 w-36" />
        </div>
        <Skeleton className="h-9 w-32" />
      </div>

      {/* ── Table skeleton ───────────────────────────────────────────────── */}
      <div className="rounded-md border border-border overflow-hidden">
        {/* Table header */}
        <div className="flex gap-4 px-4 py-3 border-b border-border bg-muted/30">
          {[140, 180, 110, 100, 90, 60].map((width, i) => (
            <Skeleton key={i} className="h-5" style={{ width }} />
          ))}
        </div>

        {/* Table rows */}
        {Array.from({ length: 8 }).map((_, i) => (
          <div
            key={i}
            className="flex gap-4 px-4 py-3.5 border-b border-border last:border-0"
          >
            <Skeleton className="h-4 w-36" />
            <Skeleton className="h-4 w-44" />
            <Skeleton className="h-4 w-28" />
            <Skeleton className="h-4 w-24" />
            <Skeleton className="h-5 w-20 rounded-full" />
            <Skeleton className="h-4 w-8" />
          </div>
        ))}
      </div>
    </div>
  )
}
