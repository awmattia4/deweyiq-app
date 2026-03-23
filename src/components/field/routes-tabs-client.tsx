"use client"

/**
 * RoutesTabsClient — tab host for Routes | Projects on the /routes page.
 *
 * Per user decision: "Separate tabs for route stops and project work."
 * Default tab is Routes. Projects tab shows ProjectTab.
 *
 * This is a thin client wrapper — all data is passed from the server page as props.
 * Phase 12 Plan 12
 */

import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { ProjectTab } from "@/components/field/project-tab"
import type { TechProjectSummary, ProjectBriefingData } from "@/actions/projects-field"

interface RoutesTabsClientProps {
  /** Routes tab content — rendered by the server page and passed as children */
  routesContent: React.ReactNode
  /** Project data for the Projects tab */
  projects: TechProjectSummary[]
  briefing: ProjectBriefingData
  today: string
  /** If true, show the Projects tab (tech/owner role). Office doesn't do field project work. */
  showProjectsTab: boolean
}

export function RoutesTabsClient({
  routesContent,
  projects,
  briefing,
  today,
  showProjectsTab,
}: RoutesTabsClientProps) {
  // If no projects tab, just render routes content directly (no wrapping overhead)
  if (!showProjectsTab) {
    return <>{routesContent}</>
  }

  return (
    <Tabs defaultValue="routes" className="flex flex-col">
      <TabsList className="w-full rounded-none border-b border-border bg-transparent h-auto px-0 py-0 gap-1 shrink-0 justify-start">
        <TabsTrigger
          value="routes"
          className="rounded-none border-b-2 border-transparent -mb-px px-4 py-2 text-sm font-medium text-muted-foreground hover:text-foreground hover:border-border data-[state=active]:border-primary data-[state=active]:text-foreground data-[state=active]:bg-transparent data-[state=active]:shadow-none cursor-pointer transition-colors"
        >
          Routes
        </TabsTrigger>
        <TabsTrigger
          value="projects"
          className="rounded-none border-b-2 border-transparent -mb-px px-4 py-2 text-sm font-medium text-muted-foreground hover:text-foreground hover:border-border data-[state=active]:border-primary data-[state=active]:text-foreground data-[state=active]:bg-transparent data-[state=active]:shadow-none cursor-pointer transition-colors"
        >
          Projects
          {projects.length > 0 && (
            <span className="ml-1.5 rounded-full bg-primary/20 text-primary text-[10px] font-semibold px-1.5 py-0.5 leading-none">
              {projects.length}
            </span>
          )}
        </TabsTrigger>
      </TabsList>

      <TabsContent
        value="routes"
        className="mt-4 data-[state=active]:animate-in data-[state=active]:fade-in-0 data-[state=active]:duration-150"
      >
        {routesContent}
      </TabsContent>

      <TabsContent
        value="projects"
        className="mt-4 data-[state=active]:animate-in data-[state=active]:fade-in-0 data-[state=active]:duration-150"
      >
        <ProjectTab projects={projects} briefing={briefing} today={today} />
      </TabsContent>
    </Tabs>
  )
}
