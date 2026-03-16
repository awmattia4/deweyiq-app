"use client"

import Link from "next/link"
import { usePathname } from "next/navigation"
import { LogOutIcon, UserCircleIcon, SettingsIcon } from "lucide-react"
import { SidebarTrigger } from "@/components/ui/sidebar"
import { Separator } from "@/components/ui/separator"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { Avatar, AvatarFallback } from "@/components/ui/avatar"
import { SyncStatusIcon } from "@/components/shell/sync-status-icon"
import { NotificationBell } from "@/components/notifications/notification-bell"
import { signOut } from "@/actions/auth"
import type { AuthUser } from "@/actions/auth"

// ─── Route → readable page title mapping ──────────────────────────────────────

const PAGE_TITLES: Record<string, string> = {
  "/dashboard": "Dashboard",
  "/routes": "Routes",
  "/team": "Team",
  "/settings": "Settings",
  "/profile": "Profile",
  "/customers": "Customers",
  "/schedule": "Schedule",
  "/dispatch": "Dispatch",
  "/work-orders": "Work Orders",
  "/alerts": "Alerts",
  "/billing": "Billing",
  "/reports": "Reports",
  "/inbox": "Messages",
  "/requests": "Service Requests",
}

function getPageTitle(pathname: string): string {
  // Exact match first
  if (PAGE_TITLES[pathname]) return PAGE_TITLES[pathname]

  // Prefix match for nested routes (e.g. /routes/123 → "Routes")
  for (const [route, title] of Object.entries(PAGE_TITLES)) {
    if (pathname.startsWith(route + "/")) return title
  }

  return "DeweyIQ"
}

function getInitials(name: string): string {
  return name
    .split(" ")
    .map((n) => n[0])
    .join("")
    .toUpperCase()
    .slice(0, 2)
}

// ─── Component ────────────────────────────────────────────────────────────────

interface AppHeaderProps {
  user: AuthUser
  unreadNotificationCount?: number
}

/**
 * AppHeader — Top navigation bar for the staff app shell.
 *
 * Left side: Mobile hamburger menu trigger + current page title.
 * Right side: SyncStatusIcon (from Plan 04), user avatar with dropdown.
 *
 * Per user decision: "bold & modern — deep blue or teal, Linear/Vercel aesthetic."
 * Uses the sidebar's background style for seamless look with the sidebar.
 *
 * Note: TooltipProvider must be in an ancestor component for SyncStatusIcon
 * tooltips to render. The AppShell wraps in TooltipProvider via root layout.
 */
export function AppHeader({ user, unreadNotificationCount = 0 }: AppHeaderProps) {
  const pathname = usePathname()
  const pageTitle = getPageTitle(pathname)
  const initials = getInitials(user.full_name || user.email)

  return (
    <header className="flex h-14 shrink-0 items-center gap-2 border-b border-border/60 bg-background/95 backdrop-blur-sm px-4">
      {/* ── Left: sidebar trigger + page title ────────────────────────── */}
      <div className="flex items-center gap-2">
        <SidebarTrigger className="-ml-1" />
        <Separator orientation="vertical" className="mr-1 h-4" />
        <span className="text-sm font-medium text-foreground">{pageTitle}</span>
      </div>

      {/* ── Spacer ─────────────────────────────────────────────────────── */}
      <div className="flex-1" />

      {/* ── Right: sync icon + notification bell + user avatar ──────── */}
      <div className="flex items-center gap-1">
        {/* Sync status icon — shows synced/syncing/pending/error state */}
        <SyncStatusIcon />

        {/* Notification bell — live unread count via Supabase Realtime */}
        <NotificationBell
          userId={user.id}
          initialCount={unreadNotificationCount}
        />

        <Separator orientation="vertical" className="mx-1 h-4" />

        {/* User avatar with dropdown */}
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <button
              type="button"
              className="flex items-center gap-2 rounded-md p-1.5 text-sm transition-colors hover:bg-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              aria-label="User menu"
            >
              <Avatar className="h-7 w-7 rounded-md">
                <AvatarFallback className="rounded-md bg-primary/20 text-primary text-xs font-semibold">
                  {initials}
                </AvatarFallback>
              </Avatar>
              <span className="hidden text-sm font-medium sm:block">
                {user.full_name || user.email}
              </span>
            </button>
          </DropdownMenuTrigger>

          <DropdownMenuContent align="end" sideOffset={8} className="w-56">
            <div className="flex items-center gap-2 px-2 py-1.5">
              <Avatar className="h-8 w-8 rounded-md">
                <AvatarFallback className="rounded-md bg-primary/20 text-primary text-xs font-semibold">
                  {initials}
                </AvatarFallback>
              </Avatar>
              <div className="grid text-sm">
                <span className="font-medium">
                  {user.full_name || user.email}
                </span>
                <span className="text-xs text-muted-foreground">
                  {user.email}
                </span>
              </div>
            </div>
            <DropdownMenuSeparator />
            <DropdownMenuItem asChild>
              <Link href="/profile">
                <UserCircleIcon className="h-4 w-4" aria-hidden="true" />
                Profile
              </Link>
            </DropdownMenuItem>
            {user.role !== "tech" && (
              <DropdownMenuItem asChild>
                <Link href="/settings">
                  <SettingsIcon className="h-4 w-4" aria-hidden="true" />
                  Settings
                </Link>
              </DropdownMenuItem>
            )}
            <DropdownMenuSeparator />
            <DropdownMenuItem
              className="text-destructive focus:text-destructive"
              onSelect={async () => {
                await signOut()
              }}
            >
              <LogOutIcon className="h-4 w-4" aria-hidden="true" />
              Sign out
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </header>
  )
}
