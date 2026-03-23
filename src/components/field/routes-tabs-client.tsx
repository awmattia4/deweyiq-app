"use client"

/**
 * RoutesTabsClient — tab host for Routes | Projects | Prep on the /routes page.
 *
 * Uses plain buttons with border-b-2 border-primary (matching schedule-tabs.tsx)
 * instead of shadcn TabsTrigger which overrides border colors.
 *
 * Phase 13: Added "Prep" tab for the What to Bring pre-route summary.
 */

import { useState } from "react"
import { cn } from "@/lib/utils"
import { ProjectTab } from "@/components/field/project-tab"
import { PrepTab } from "@/components/field/prep-tab"
import type { TechProjectSummary, ProjectBriefingData } from "@/actions/projects-field"
import type { WhatToBringResult } from "@/actions/what-to-bring"

interface RoutesTabsClientProps {
  routesContent: React.ReactNode
  projects: TechProjectSummary[]
  briefing: ProjectBriefingData
  today: string
  showProjectsTab: boolean
  // Phase 13: Prep tab
  techId?: string | null
  prepData?: WhatToBringResult | null
  showPrepTab?: boolean
}

export function RoutesTabsClient({
  routesContent,
  projects,
  briefing,
  today,
  showProjectsTab,
  techId,
  prepData,
  showPrepTab = false,
}: RoutesTabsClientProps) {
  type TabId = "routes" | "projects" | "prep"
  const [activeTab, setActiveTab] = useState<TabId>("routes")

  const hasTabs = showProjectsTab || showPrepTab

  if (!hasTabs) {
    return <>{routesContent}</>
  }

  return (
    <div className="flex flex-col">
      {/* Tab bar — full-width auto split with blue underline */}
      <div className="flex border-b border-border" role="tablist">
        <button
          role="tab"
          aria-selected={activeTab === "routes"}
          onClick={() => setActiveTab("routes")}
          className={cn(
            "flex-1 py-2.5 text-sm font-medium transition-colors cursor-pointer -mb-px border-b-2 text-center",
            activeTab === "routes"
              ? "border-primary text-foreground"
              : "border-transparent text-muted-foreground hover:text-foreground hover:border-border"
          )}
        >
          Routes
        </button>

        {showProjectsTab && (
          <button
            role="tab"
            aria-selected={activeTab === "projects"}
            onClick={() => setActiveTab("projects")}
            className={cn(
              "flex-1 py-2.5 text-sm font-medium transition-colors cursor-pointer -mb-px border-b-2 text-center",
              activeTab === "projects"
                ? "border-primary text-foreground"
                : "border-transparent text-muted-foreground hover:text-foreground hover:border-border"
            )}
          >
            Projects
            {projects.length > 0 && (
              <span className="ml-1.5 rounded-full bg-primary/20 text-primary text-[10px] font-semibold px-1.5 py-0.5 leading-none">
                {projects.length}
              </span>
            )}
          </button>
        )}

        {showPrepTab && (
          <button
            role="tab"
            aria-selected={activeTab === "prep"}
            onClick={() => setActiveTab("prep")}
            className={cn(
              "flex-1 py-2.5 text-sm font-medium transition-colors cursor-pointer -mb-px border-b-2 text-center",
              activeTab === "prep"
                ? "border-primary text-foreground"
                : "border-transparent text-muted-foreground hover:text-foreground hover:border-border"
            )}
          >
            Prep
          </button>
        )}
      </div>

      {/* Tab content */}
      <div className="mt-4">
        {activeTab === "routes" && routesContent}

        {activeTab === "projects" && showProjectsTab && (
          <ProjectTab projects={projects} briefing={briefing} today={today} />
        )}

        {activeTab === "prep" && showPrepTab && prepData && techId && (
          <PrepTab techId={techId} prepData={prepData} />
        )}

        {activeTab === "prep" && showPrepTab && (!prepData || !techId) && (
          <p className="text-sm text-muted-foreground italic text-center py-6">
            Prep data unavailable.
          </p>
        )}
      </div>
    </div>
  )
}
