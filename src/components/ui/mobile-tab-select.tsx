"use client"

/**
 * ResponsiveTabs — Wraps shadcn Tabs with a mobile-friendly Select dropdown.
 *
 * On mobile (< sm): shows a <Select> dropdown for tab navigation.
 * On desktop (>= sm): shows the normal TabsList inline.
 *
 * Usage:
 *   <ResponsiveTabs defaultValue="tab1" tabs={[{value:"tab1",label:"Tab 1"}, ...]}>
 *     <TabsContent value="tab1">...</TabsContent>
 *   </ResponsiveTabs>
 */

import { useState, type ReactNode } from "react"
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"

interface TabOption {
  value: string
  label: string
}

interface ResponsiveTabsProps {
  tabs: TabOption[]
  defaultValue: string
  children: ReactNode
  className?: string
  tabsListClassName?: string
}

export function ResponsiveTabs({
  tabs,
  defaultValue,
  children,
  className,
  tabsListClassName,
}: ResponsiveTabsProps) {
  const [activeTab, setActiveTab] = useState(defaultValue)

  return (
    <Tabs value={activeTab} onValueChange={setActiveTab} className={className}>
      {/* Mobile: dropdown select */}
      <div className="sm:hidden">
        <Select value={activeTab} onValueChange={setActiveTab}>
          <SelectTrigger>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {tabs.map((t) => (
              <SelectItem key={t.value} value={t.value}>
                {t.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
      {/* Desktop: tab bar */}
      <TabsList className={tabsListClassName ?? "hidden sm:inline-flex"}>
        {tabs.map((t) => (
          <TabsTrigger key={t.value} value={t.value} className="whitespace-nowrap">
            {t.label}
          </TabsTrigger>
        ))}
      </TabsList>
      {children}
    </Tabs>
  )
}
