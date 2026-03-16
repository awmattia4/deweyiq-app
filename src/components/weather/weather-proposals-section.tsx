"use client"

import { useState } from "react"
import { useRouter } from "next/navigation"
import { CloudIcon } from "lucide-react"
import { RescheduleProposalCard } from "@/components/weather/reschedule-proposal-card"
import type { WeatherProposal } from "@/actions/weather"

interface WeatherProposalsSectionProps {
  initialProposals: WeatherProposal[]
}

/**
 * WeatherProposalsSection — client wrapper for the weather proposals list.
 *
 * Owns the dismissed state so that when a proposal is approved/denied
 * it disappears from the list without requiring a full page refresh.
 */
export function WeatherProposalsSection({
  initialProposals,
}: WeatherProposalsSectionProps) {
  const router = useRouter()
  const [dismissedIds, setDismissedIds] = useState<Set<string>>(new Set())

  const visibleProposals = initialProposals.filter(
    (p) => !dismissedIds.has(p.id)
  )

  function handleActioned(proposalId: string) {
    setDismissedIds((prev) => new Set([...prev, proposalId]))
    // Also revalidate so the count in the sidebar stays accurate
    router.refresh()
  }

  if (visibleProposals.length === 0) return null

  return (
    <div className="flex flex-col gap-3">
      {/* Section header */}
      <div className="flex items-center gap-2">
        <CloudIcon className="h-4 w-4 text-muted-foreground" />
        <h2 className="text-sm font-semibold text-foreground">
          Weather Reschedule Proposals
        </h2>
        <span className="rounded-full bg-amber-500/15 px-2 py-0.5 text-[11px] font-medium text-amber-300">
          {visibleProposals.length} pending
        </span>
      </div>

      {/* Proposals */}
      <div className="flex flex-col gap-3">
        {visibleProposals.map((proposal) => (
          <RescheduleProposalCard
            key={proposal.id}
            proposal={proposal}
            onActioned={() => handleActioned(proposal.id)}
          />
        ))}
      </div>
    </div>
  )
}
