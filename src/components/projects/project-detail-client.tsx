"use client"

import { useState } from "react"
import Link from "next/link"
import { ProjectDetailHeader } from "@/components/projects/project-detail-header"
import { ProjectOverviewTab } from "@/components/projects/project-overview-tab"
import { ProjectPhasesTab } from "@/components/projects/project-phases-tab"
import { ProjectActivityLog } from "@/components/projects/project-activity-log"
import type { ProjectDetail } from "@/actions/projects"
import type { SurveyData, SurveyScheduleInfo, SurveyChecklistCategory } from "@/actions/projects-survey"
import type { TechProfile } from "@/actions/work-orders"
import { cn } from "@/lib/utils"

interface ProjectDetailClientProps {
  project: ProjectDetail
  userId: string
  initialTab?: string
  // Survey data (Plan 04)
  surveyData?: SurveyData | null
  surveySchedule?: SurveyScheduleInfo | null
  techProfiles?: TechProfile[]
  checklistCategories?: SurveyChecklistCategory[]
}

const TABS = [
  { id: "overview", label: "Overview" },
  { id: "phases", label: "Phases" },
  { id: "activity", label: "Activity" },
  { id: "documents", label: "Documents", isLink: true },
]

/**
 * ProjectDetailClient — Client wrapper for the project detail tabbed layout.
 *
 * Manages tab state and renders the appropriate tab content.
 * The server page fetches all data upfront; this component handles presentation.
 */
export function ProjectDetailClient({
  project: initialProject,
  userId,
  initialTab = "overview",
  surveyData: initialSurveyData = null,
  surveySchedule: initialSurveySchedule = null,
  techProfiles = [],
  checklistCategories = [],
}: ProjectDetailClientProps) {
  const [project, setProject] = useState(initialProject)
  const [surveyData, setSurveyData] = useState(initialSurveyData)
  const [surveySchedule, setSurveySchedule] = useState(initialSurveySchedule)
  const [activeTab, setActiveTab] = useState(
    TABS.some((t) => t.id === initialTab) ? initialTab : "overview"
  )

  return (
    <div className="flex flex-col min-h-0">
      {/* Header — project name, badges, actions */}
      <ProjectDetailHeader
        project={project}
        onProjectUpdate={setProject}
      />

      {/* Tab bar */}
      <div className="flex border-b border-border px-6 shrink-0">
        {TABS.map((tab) =>
          "isLink" in tab && tab.isLink ? (
            <Link
              key={tab.id}
              href={`/projects/${project.id}/documents`}
              className={cn(
                "px-4 py-2.5 text-sm font-medium transition-colors border-b-2 -mb-px",
                "border-transparent text-muted-foreground hover:text-foreground hover:border-border"
              )}
            >
              {tab.label}
            </Link>
          ) : (
            <button
              key={tab.id}
              type="button"
              onClick={() => setActiveTab(tab.id)}
              className={cn(
                "px-4 py-2.5 text-sm font-medium transition-colors border-b-2 -mb-px",
                activeTab === tab.id
                  ? "border-primary text-foreground"
                  : "border-transparent text-muted-foreground hover:text-foreground hover:border-border"
              )}
            >
              {tab.label}
            </button>
          )
        )}
      </div>

      {/* Tab content */}
      <div className="flex-1 overflow-auto p-6">
        {activeTab === "overview" && (
          <ProjectOverviewTab
            project={project}
            onProjectUpdate={setProject}
            surveyData={surveyData}
            surveySchedule={surveySchedule}
            techProfiles={techProfiles}
            checklistCategories={checklistCategories}
            onSurveyScheduled={(schedule, updatedProject) => {
              setSurveySchedule(schedule)
              setProject(updatedProject)
            }}
            onSurveyCompleted={(survey, updatedProject) => {
              setSurveyData(survey)
              setSurveySchedule(null)
              setProject(updatedProject)
            }}
          />
        )}
        {activeTab === "phases" && (
          <ProjectPhasesTab
            project={project}
            onProjectUpdate={setProject}
          />
        )}
        {activeTab === "activity" && (
          <ProjectActivityLog
            activityLog={project.activity_log ?? []}
            projectId={project.id}
          />
        )}
      </div>
    </div>
  )
}
