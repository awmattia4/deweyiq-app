"use client"

import { useEffect } from "react"
import Link from "next/link"
import { usePathname } from "next/navigation"
import {
  LayoutDashboardIcon,
  MapIcon,
  UsersIcon,
  ContactIcon,
  CalendarIcon,
  MapPinIcon,
  BellIcon,
  SettingsIcon,
  UserCircleIcon,
  LogOutIcon,
  WrenchIcon,
  BarChart3Icon,
} from "lucide-react"
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarSeparator,
  useSidebar,
} from "@/components/ui/sidebar"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { Avatar, AvatarFallback } from "@/components/ui/avatar"
import { signOut } from "@/actions/auth"
import type { AuthUser } from "@/actions/auth"

// ─── Navigation item definitions ──────────────────────────────────────────────

type NavItem = {
  label: string
  href: string
  icon: React.ElementType
  /** Roles that can see this item */
  roles: Array<AuthUser["role"]>
}

/**
 * Nav items visible to staff roles.
 *
 * Items scoped to future phases are hidden entirely (not shown as disabled)
 * to keep the UI clean. Enable them when their phase ships:
 * - Schedule (Phase 4): add roles: ["owner", "office"]
 * - Billing (Phase 7): add roles: ["owner"]
 * - Reports (Phase 9): add roles: ["owner"]
 */
const NAV_ITEMS: NavItem[] = [
  // ── Available in Phase 1 ───────────────────────────────────────────────────
  {
    label: "Dashboard",
    href: "/dashboard",
    icon: LayoutDashboardIcon,
    roles: ["owner", "office"],
  },
  // ── Available in Phase 2 ───────────────────────────────────────────────────
  {
    label: "Customers",
    href: "/customers",
    icon: ContactIcon,
    roles: ["owner", "office"],
  },
  // ── Available in Phase 1 ───────────────────────────────────────────────────
  {
    label: "Routes",
    href: "/routes",
    icon: MapIcon,
    roles: ["owner", "office", "tech"],
  },
  {
    label: "Team",
    href: "/team",
    icon: UsersIcon,
    roles: ["owner", "office"],
  },
  {
    label: "Settings",
    href: "/settings",
    icon: SettingsIcon,
    roles: ["owner", "office"],
  },
  // ── Available in Phase 4 ───────────────────────────────────────────────────
  {
    label: "Schedule",
    href: "/schedule",
    icon: CalendarIcon,
    roles: ["owner", "office"],
  },
  {
    label: "Dispatch",
    href: "/dispatch",
    icon: MapPinIcon,
    roles: ["owner", "office"],
  },
  // ── Available in Phase 5 ───────────────────────────────────────────────────
  {
    label: "Alerts",
    href: "/alerts",
    icon: BellIcon,
    roles: ["owner", "office"], // Techs do NOT see the Alerts nav item (locked decision)
  },
  // ── Available in Phase 6 ───────────────────────────────────────────────────
  {
    label: "Work Orders",
    href: "/work-orders",
    icon: WrenchIcon,
    roles: ["owner", "office"],
  },
  // ── Available in Phase 7 ───────────────────────────────────────────────────
  {
    label: "Reports",
    href: "/reports",
    icon: BarChart3Icon,
    roles: ["owner", "office"],
  },
]

// Tech-only nav (minimal — just their work)
// Phase 3: Settings added for tech so they can set maps preference (FIELD-11)
const TECH_NAV_ITEMS: NavItem[] = [
  {
    label: "My Routes",
    href: "/routes",
    icon: MapIcon,
    roles: ["tech"],
  },
  {
    label: "Settings",
    href: "/settings",
    icon: SettingsIcon,
    roles: ["tech"],
  },
]

// ─── Helpers ──────────────────────────────────────────────────────────────────

function getInitials(name: string): string {
  return name
    .split(" ")
    .map((n) => n[0])
    .join("")
    .toUpperCase()
    .slice(0, 2)
}

function getRoleLabel(role: AuthUser["role"]): string {
  switch (role) {
    case "owner":
      return "Owner"
    case "office":
      return "Office"
    case "tech":
      return "Technician"
    case "customer":
      return "Customer"
  }
}

// ─── Component ────────────────────────────────────────────────────────────────

interface AppSidebarProps {
  user: AuthUser
  alertCount?: number
  orgName?: string | null
  orgLogoUrl?: string | null
}

/**
 * AppSidebar — Role-aware sidebar navigation for the staff app shell.
 *
 * Navigation items shown per role:
 * - Tech:  Routes, Profile (minimal — focused on daily work)
 * - Office: Dashboard, Routes, Team, Settings
 * - Owner: Everything Office sees (Phase 1 — Billing, Reports, Team Mgmt in future phases)
 *
 * Per user decision: "Owner and office share the same view; owner gets additional
 * tabs (billing settings, team management, reports)."
 * Those additional tabs are hidden until their phases ship (see NAV_ITEMS comments).
 */
export function AppSidebar({ user, alertCount = 0, orgName, orgLogoUrl }: AppSidebarProps) {
  const pathname = usePathname()
  const { setOpenMobile } = useSidebar()

  // Close mobile sidebar when route changes
  useEffect(() => {
    setOpenMobile(false)
  }, [pathname, setOpenMobile])

  // Select the correct nav set based on role
  const navItems =
    user.role === "tech"
      ? TECH_NAV_ITEMS
      : NAV_ITEMS.filter((item) => item.roles.includes(user.role))

  const initials = getInitials(user.full_name || user.email)
  const roleLabel = getRoleLabel(user.role)

  return (
    <Sidebar collapsible="icon">
      {/* ── Header: Software + company branding ─────────────────────────── */}
      <SidebarHeader className="border-b border-sidebar-border">
        <div className="flex flex-col gap-1.5 px-2 py-3">
          {/* Software branding — small */}
          <div className="flex items-center gap-1.5 group-data-[collapsible=icon]:justify-center">
            <div className="flex h-5 w-5 shrink-0 items-center justify-center rounded bg-primary/80">
              <svg
                viewBox="0 0 24 24"
                fill="none"
                className="h-3 w-3 text-primary-foreground"
                aria-hidden="true"
              >
                <path
                  d="M2 12C2 12 5 8 8 8C11 8 13 12 16 12C19 12 22 8 22 8"
                  stroke="currentColor"
                  strokeWidth="2.5"
                  strokeLinecap="round"
                />
              </svg>
            </div>
            <span className="text-[10px] font-medium tracking-wide uppercase text-sidebar-foreground/50 group-data-[collapsible=icon]:hidden">
              PoolCo
            </span>
          </div>

          {/* Company branding — prominent */}
          <div className="flex items-center gap-2 group-data-[collapsible=icon]:justify-center">
            {orgLogoUrl ? (
              <img
                src={orgLogoUrl}
                alt={orgName ?? "Company logo"}
                className="h-8 w-8 shrink-0 rounded-md object-contain"
              />
            ) : (
              <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md bg-primary">
                <span className="text-sm font-bold text-primary-foreground">
                  {(orgName ?? "C")[0].toUpperCase()}
                </span>
              </div>
            )}
            <span className="truncate font-semibold text-sidebar-foreground group-data-[collapsible=icon]:hidden">
              {orgName ?? "My Company"}
            </span>
          </div>
        </div>
      </SidebarHeader>

      {/* ── Navigation ─────────────────────────────────────────────────── */}
      <SidebarContent>
        <SidebarGroup>
          <SidebarGroupLabel className="group-data-[collapsible=icon]:hidden">
            {user.role === "tech" ? "Work" : "Navigation"}
          </SidebarGroupLabel>
          <SidebarGroupContent>
            <SidebarMenu>
              {navItems.map((item) => {
                const isActive =
                  pathname === item.href ||
                  (item.href !== "/" && pathname.startsWith(item.href + "/"))

                const isAlertsItem = item.href === "/alerts"
                const showBadge = isAlertsItem && alertCount > 0

                return (
                  <SidebarMenuItem key={item.href}>
                    <SidebarMenuButton
                      asChild
                      isActive={isActive}
                      tooltip={item.label}
                    >
                      <Link href={item.href}>
                        <item.icon className="h-4 w-4" aria-hidden="true" />
                        <span>{item.label}</span>
                        {showBadge && (
                          <span className="ml-auto flex h-5 min-w-5 items-center justify-center rounded-full bg-destructive text-xs font-medium text-destructive-foreground group-data-[collapsible=icon]:hidden">
                            {alertCount > 99 ? "99+" : alertCount}
                          </span>
                        )}
                      </Link>
                    </SidebarMenuButton>
                  </SidebarMenuItem>
                )
              })}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>
      </SidebarContent>

      {/* ── Footer: User identity + sign out ───────────────────────────── */}
      <SidebarFooter className="border-t border-sidebar-border">
        <SidebarMenu>
          <SidebarMenuItem>
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <SidebarMenuButton
                  size="lg"
                  className="data-[state=open]:bg-sidebar-accent data-[state=open]:text-sidebar-accent-foreground"
                  tooltip={`${user.full_name || user.email} — ${roleLabel}`}
                >
                  <Avatar className="h-8 w-8 rounded-md">
                    <AvatarFallback className="rounded-md bg-primary/20 text-primary text-xs font-semibold">
                      {initials}
                    </AvatarFallback>
                  </Avatar>
                  <div className="grid flex-1 text-left text-sm leading-tight group-data-[collapsible=icon]:hidden">
                    <span className="truncate font-medium">
                      {user.full_name || user.email}
                    </span>
                    <span className="truncate text-xs text-muted-foreground">
                      {roleLabel}
                    </span>
                  </div>
                </SidebarMenuButton>
              </DropdownMenuTrigger>

              <DropdownMenuContent
                className="w-56"
                side="top"
                align="start"
                sideOffset={4}
              >
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
                {user.role !== "tech" && (
                  <DropdownMenuItem asChild>
                    <Link href="/profile">
                      <UserCircleIcon className="h-4 w-4" aria-hidden="true" />
                      Profile
                    </Link>
                  </DropdownMenuItem>
                )}
                <DropdownMenuItem asChild>
                  <Link href="/settings">
                    <SettingsIcon className="h-4 w-4" aria-hidden="true" />
                    Settings
                  </Link>
                </DropdownMenuItem>
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
          </SidebarMenuItem>
        </SidebarMenu>
      </SidebarFooter>
    </Sidebar>
  )
}
