import { Skeleton } from "@/components/ui/skeleton"

/**
 * DispatchLoading — Skeleton loading state for the dispatch page.
 *
 * Shows a large map placeholder rectangle with a sidebar skeleton,
 * matching the intended layout of the real dispatch map in plan 04-05.
 */
export default function DispatchLoading() {
  return (
    <div className="flex flex-col gap-6">
      {/* ── Page header skeleton ─────────────────────────────────────────── */}
      <div className="flex flex-col gap-2">
        <Skeleton className="h-8 w-48" />
        <Skeleton className="h-4 w-72" />
      </div>

      {/* ── Map + sidebar skeleton ────────────────────────────────────────── */}
      <div className="flex flex-col lg:flex-row gap-4">
        {/* Map area */}
        <Skeleton className="rounded-lg flex-1 min-h-[480px]" />

        {/* Sidebar — tech list / stop details */}
        <div className="lg:w-72 flex flex-col gap-3">
          {/* Header */}
          <Skeleton className="h-6 w-32" />

          {/* Tech cards */}
          {Array.from({ length: 4 }).map((_, i) => (
            <div
              key={i}
              className="rounded-md border border-border p-3 flex flex-col gap-2"
            >
              <div className="flex items-center gap-2">
                <Skeleton className="h-7 w-7 rounded-full" />
                <Skeleton className="h-4 w-28" />
                <Skeleton className="h-5 w-14 ml-auto rounded-full" />
              </div>
              <Skeleton className="h-3 w-40" />
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}
