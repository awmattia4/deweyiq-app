"use client"

import { useState } from "react"
import { useRouter } from "next/navigation"
import { Button } from "@/components/ui/button"
import { WorkloadBalancer } from "@/components/schedule/workload-balancer"

// ─── WorkloadBalancerTrigger ──────────────────────────────────────────────────

/**
 * WorkloadBalancerTrigger — client wrapper that owns the open/close state for WorkloadBalancer.
 *
 * Used in the Schedule page header (server component context). Separate from the dialog
 * itself so the dialog component can remain focused on its own logic.
 *
 * Only renders on owner/office pages (schedule page already role-guards at the page level).
 */
export function WorkloadBalancerTrigger({ weekStartDate }: { weekStartDate: string }) {
  const [open, setOpen] = useState(false)
  const router = useRouter()

  return (
    <>
      <Button
        variant="outline"
        size="sm"
        onClick={() => setOpen(true)}
        className="shrink-0"
      >
        Balance Workload
      </Button>

      <WorkloadBalancer
        open={open}
        onOpenChange={setOpen}
        weekStartDate={weekStartDate}
        onApplied={() => router.refresh()}
      />
    </>
  )
}
