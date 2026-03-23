"use client"

/**
 * RoutesTabsClient — tab host for Routes | Projects on the /routes page.
 *
 * Uses plain buttons with border-b-2 border-primary (matching schedule-tabs.tsx)
 * instead of shadcn TabsTrigger which overrides border colors.
 */

import { useState } from "react"
import { cn } from "@/lib/utils"
import { ProjectTab } from "@/components/field/project-tab"
import type { TechProjectSummary, ProjectBriefingData } from "@/actions/projects-field"

interface RoutesTabsClientProps {
  routesContent: React.ReactNode
  projects: TechProjectSummary[]
  briefing: ProjectBriefingData
  today: string
  showProjectsTab: boolean
}

export function RoutesTabsClient({
  routesContent,
  projects,
  briefing,
  today,
  showProjectsTab,
}: RoutesTabsClientProps) {
  const [activeTab, setActiveTab] = useState<"routes" | "projects">("routes")

  if (!showProjectsTab) {
    return <>{routesContent}</>
  }

  return (
    <div className="flex flex-col">
      {/* Tab bar — full-width 50/50 split with blue underline */}
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
      </div>

      {/* Tab content */}
      <div className="mt-4">
        {activeTab === "routes" ? (
          routesContent
        ) : (
          <ProjectTab projects={projects} briefing={briefing} today={today} />
        )}
      </div>
    </div>
  )
}
