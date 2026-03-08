"use client"

import { useState } from "react"
import { cn } from "@/lib/utils"

// ─── Types ─────────────────────────────────────────────────────────────────────

type ScheduleTab = "routes" | "rules" | "holidays"

interface ScheduleTabsProps {
  children: {
    routes: React.ReactNode
    rules: React.ReactNode
    holidays: React.ReactNode
  }
  defaultTab?: ScheduleTab
}

// ─── ScheduleTabs ─────────────────────────────────────────────────────────────

/**
 * ScheduleTabs — top-level tab switcher for the /schedule page.
 *
 * Three tabs: Routes (route builder), Rules (schedule rules), Holidays.
 * Client-side tab switching only — no URL changes needed.
 */
export function ScheduleTabs({ children, defaultTab = "routes" }: ScheduleTabsProps) {
  const [activeTab, setActiveTab] = useState<ScheduleTab>(defaultTab)

  const tabs: Array<{ id: ScheduleTab; label: string }> = [
    { id: "routes", label: "Routes" },
    { id: "rules", label: "Rules" },
    { id: "holidays", label: "Holidays" },
  ]

  return (
    <div className="flex flex-col gap-4">
      {/* ── Tab bar ──────────────────────────────────────────────────────── */}
      <div
        className="flex gap-1 border-b border-border"
        role="tablist"
        aria-label="Schedule sections"
      >
        {tabs.map((tab) => {
          const isActive = tab.id === activeTab
          return (
            <button
              key={tab.id}
              role="tab"
              aria-selected={isActive}
              aria-controls={`schedule-tab-${tab.id}`}
              onClick={() => setActiveTab(tab.id)}
              className={cn(
                "px-4 py-2 text-sm font-medium transition-colors cursor-pointer -mb-px border-b-2",
                isActive
                  ? "border-primary text-foreground"
                  : "border-transparent text-muted-foreground hover:text-foreground hover:border-border"
              )}
            >
              {tab.label}
            </button>
          )
        })}
      </div>

      {/* ── Tab panels ───────────────────────────────────────────────────── */}
      <div
        id="schedule-tab-routes"
        role="tabpanel"
        hidden={activeTab !== "routes"}
        className={activeTab === "routes" ? "block" : "hidden"}
      >
        {children.routes}
      </div>
      <div
        id="schedule-tab-rules"
        role="tabpanel"
        hidden={activeTab !== "rules"}
        className={activeTab === "rules" ? "block" : "hidden"}
      >
        {children.rules}
      </div>
      <div
        id="schedule-tab-holidays"
        role="tabpanel"
        hidden={activeTab !== "holidays"}
        className={activeTab === "holidays" ? "block" : "hidden"}
      >
        {children.holidays}
      </div>
    </div>
  )
}
