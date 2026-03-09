"use client"

import { SidebarProvider, SidebarInset } from "@/components/ui/sidebar"
import { TooltipProvider } from "@/components/ui/tooltip"
import { OfflineBanner } from "@/components/shell/offline-banner"
import { AppSidebar } from "@/components/shell/app-sidebar"
import { AppHeader } from "@/components/shell/app-header"
import { SyncInitializer } from "@/components/shell/sync-initializer"
import type { AuthUser } from "@/actions/auth"

interface AppShellProps {
  user: AuthUser
  children: React.ReactNode
  alertCount?: number
}

/**
 * AppShell — Root shell for the staff application.
 *
 * Layout:
 * - OfflineBanner: fixed 4px amber bar at viewport top (renders null when online)
 * - Sidebar: collapsible navigation on the left (collapses to icon rail on mobile)
 * - Header: top bar with sidebar trigger, page title, sync icon, user avatar
 * - Main content: fills remaining space
 *
 * Per user decision: "bold & modern — deep blue or teal, Linear/Vercel aesthetic,
 * sharp and minimal."
 *
 * TooltipProvider wraps everything here so SyncStatusIcon (and any future
 * tooltip-using components) render tooltips correctly. Note from Plan 04:
 * "TooltipProvider must be added to the root layout before SyncStatusIcon
 * renders correctly."
 *
 * SyncInitializer renders null but wires initSyncListener() and
 * prefetchTodayRoutes() on mount (per locked decision on pre-caching).
 */
export function AppShell({ user, children, alertCount = 0 }: AppShellProps) {
  return (
    <TooltipProvider>
      {/* Offline indicator — fixed at viewport top, renders null when online */}
      <OfflineBanner />

      {/* Sync engine initializer — no DOM output */}
      <SyncInitializer />

      {/* Sidebar layout */}
      <SidebarProvider>
        <AppSidebar user={user} alertCount={alertCount} />

        {/* Main content area (sidebar inset) */}
        <SidebarInset>
          {/* Top header bar */}
          <AppHeader user={user} />

          {/* Page content */}
          <main className="flex flex-1 flex-col gap-4 p-4 pt-4">
            {children}
          </main>
        </SidebarInset>
      </SidebarProvider>
    </TooltipProvider>
  )
}
