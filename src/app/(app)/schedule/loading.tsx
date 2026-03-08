import { Skeleton } from "@/components/ui/skeleton"

/**
 * ScheduleLoading — Skeleton loading state for the schedule page.
 *
 * Mirrors the layout of the schedule rules list:
 * header + "Add Rule" button + table rows + holiday calendar card.
 */
export default function ScheduleLoading() {
  return (
    <div className="flex flex-col gap-6">
      {/* ── Page header skeleton ─────────────────────────────────────────── */}
      <div className="flex items-start justify-between flex-wrap gap-3">
        <div className="flex flex-col gap-2">
          <Skeleton className="h-8 w-36" />
          <Skeleton className="h-4 w-52" />
        </div>
        <Skeleton className="h-9 w-28" />
      </div>

      {/* ── Schedule rules table skeleton ────────────────────────────────── */}
      <div className="rounded-md border border-border overflow-hidden">
        {/* Table header */}
        <div className="hidden sm:flex gap-4 px-4 py-2.5 border-b border-border bg-muted/30">
          {[160, 140, 140, 90, 100].map((width, i) => (
            <Skeleton key={i} className="h-4" style={{ width }} />
          ))}
        </div>

        {/* Table rows */}
        {Array.from({ length: 5 }).map((_, i) => (
          <div
            key={i}
            className="flex sm:grid sm:grid-cols-[2fr_1.5fr_1.5fr_1fr_1fr_auto] gap-4 px-4 py-4 border-b border-border last:border-0 items-center"
          >
            <div className="flex flex-col gap-1.5 min-w-0">
              <Skeleton className="h-4 w-36" />
              <Skeleton className="h-3 w-24 sm:hidden" />
            </div>
            <Skeleton className="hidden sm:block h-4 w-32" />
            <Skeleton className="hidden sm:block h-4 w-28" />
            <Skeleton className="hidden sm:block h-5 w-20 rounded-full" />
            <Skeleton className="hidden sm:block h-4 w-24" />
            <Skeleton className="h-8 w-20 ml-auto" />
          </div>
        ))}
      </div>

      {/* ── Holiday calendar skeleton ────────────────────────────────────── */}
      <div className="rounded-lg border border-border p-4 flex flex-col gap-4">
        <div className="flex items-center justify-between">
          <Skeleton className="h-5 w-44" />
          <Skeleton className="h-4 w-24" />
        </div>
        <div className="flex items-center justify-between">
          <div className="flex gap-2">
            <Skeleton className="h-7 w-16" />
            <Skeleton className="h-7 w-24" />
          </div>
          <Skeleton className="h-7 w-28" />
        </div>
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className="flex items-center justify-between gap-4 px-1 py-1.5">
            <Skeleton className="h-4 w-24 shrink-0" />
            <Skeleton className="h-4 flex-1 max-w-48" />
            <Skeleton className="h-6 w-6 rounded" />
          </div>
        ))}
      </div>
    </div>
  )
}
