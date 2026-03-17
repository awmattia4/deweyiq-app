"use client"

import Link from "next/link"
import { usePathname } from "next/navigation"
import { useState } from "react"
import { HistoryIcon, FileTextIcon, MessageCircleIcon, WrenchIcon, MapPinIcon, ChevronDownIcon, LogOutIcon, BuildingIcon, HammerIcon } from "lucide-react"
import { signOut } from "@/actions/auth"
import type { AuthUser } from "@/actions/auth"
import type { OrgBranding } from "@/actions/portal-data"
import { UnreadDot } from "@/components/inbox/unread-badge"

interface PortalShellProps {
  user: AuthUser
  branding: OrgBranding | null
  customerId: string
  children: React.ReactNode
}

interface NavItem {
  label: string
  href: string
  icon: React.FC<{ className?: string }>
}

const NAV_ITEMS: NavItem[] = [
  { label: "Service History", href: "/portal/history", icon: HistoryIcon },
  { label: "Invoices", href: "/portal/invoices", icon: FileTextIcon },
  { label: "Projects", href: "/portal/projects", icon: HammerIcon },
  { label: "Messages", href: "/portal/messages", icon: MessageCircleIcon },
  { label: "Request Service", href: "/portal/requests", icon: WrenchIcon },
  { label: "Track Service", href: "/portal/eta", icon: MapPinIcon },
]

/**
 * PortalShell — Customer-facing shell for /portal/* routes.
 *
 * Shows real company branding (name, logo, brand color) from org_settings.
 * Applies brand_color as --portal-primary CSS custom property for accent elements.
 *
 * Navigation:
 * - Desktop: horizontal nav links in header
 * - Mobile: bottom tab bar (sm and below)
 *
 * User dropdown: customer name + email, sign out, switch company (if applicable).
 */
export function PortalShell({ user, branding, customerId, children }: PortalShellProps) {
  const pathname = usePathname()
  const [dropdownOpen, setDropdownOpen] = useState(false)

  const companyName = branding?.name ?? "Your Pool Company"
  const logoUrl = branding?.logoUrl ?? null
  const brandColor = branding?.brandColor ?? null
  const firstName = user.full_name?.split(" ")[0] || "there"

  const cssVars = brandColor
    ? ({ "--portal-primary": brandColor } as React.CSSProperties)
    : undefined

  function handleSignOut() {
    signOut("/portal/login")
  }

  return (
    <div
      className="min-h-screen bg-background pb-16 sm:pb-0"
      data-portal="true"
      style={cssVars}
    >
      {/* ── Portal header ──────────────────────────────────────────────── */}
      <header
        className="sticky top-0 z-30 border-b border-border/40 bg-card/80 backdrop-blur-sm"
        style={brandColor ? { borderBottomColor: `${brandColor}40` } : undefined}
      >
        <div className="max-w-screen-lg mx-auto px-4 h-14 flex items-center justify-between gap-4">
          {/* Company branding */}
          <Link href="/portal" className="flex items-center gap-2.5 shrink-0">
            <div className="flex h-8 w-8 items-center justify-center rounded-md bg-primary/10 overflow-hidden shrink-0">
              {logoUrl ? (
                <img
                  src={logoUrl}
                  alt={`${companyName} logo`}
                  className="w-full h-full object-contain"
                />
              ) : (
                <svg
                  viewBox="0 0 24 24"
                  fill="none"
                  className="h-4 w-4 text-primary"
                  aria-hidden="true"
                >
                  <path
                    d="M2 12C2 12 5 8 8 8C11 8 13 12 16 12C19 12 22 8 22 8"
                    stroke="currentColor"
                    strokeWidth="2"
                    strokeLinecap="round"
                  />
                </svg>
              )}
            </div>
            <div className="flex flex-col">
              <span className="text-sm font-semibold text-foreground leading-tight">
                {companyName}
              </span>
              <span className="text-[10px] text-muted-foreground leading-tight">
                Customer Portal
              </span>
            </div>
          </Link>

          {/* Desktop navigation */}
          <nav
            className="hidden sm:flex items-center gap-1"
            aria-label="Portal navigation"
          >
            {NAV_ITEMS.map((item) => {
              const isActive = pathname === item.href || pathname.startsWith(item.href + "/")
              const isMessages = item.href === "/portal/messages"
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  className={`relative px-3 py-1.5 text-sm rounded-md transition-colors ${
                    isActive
                      ? "text-foreground bg-muted font-medium"
                      : "text-muted-foreground hover:text-foreground hover:bg-muted/50"
                  }`}
                >
                  {item.label}
                  {isMessages && (
                    <UnreadDot
                      orgId={user.org_id}
                      role="customer"
                      customerId={customerId}
                    />
                  )}
                </Link>
              )
            })}
          </nav>

          {/* User dropdown */}
          <div className="relative">
            <button
              type="button"
              onClick={() => setDropdownOpen((open) => !open)}
              className="flex items-center gap-1.5 px-2 py-1 rounded-md text-sm text-muted-foreground hover:text-foreground hover:bg-muted/50 transition-colors cursor-pointer"
              aria-expanded={dropdownOpen}
            >
              <span className="hidden sm:block max-w-[120px] truncate">{firstName}</span>
              <ChevronDownIcon className="h-3.5 w-3.5 shrink-0" />
            </button>

            {dropdownOpen && (
              <>
                {/* Backdrop to close dropdown */}
                <div
                  className="fixed inset-0 z-40"
                  onClick={() => setDropdownOpen(false)}
                />
                <div className="absolute right-0 top-full mt-1 z-50 w-52 rounded-lg border border-border bg-card shadow-lg py-1">
                  {/* User info */}
                  <div className="px-3 py-2 border-b border-border">
                    <p className="text-sm font-medium text-foreground truncate">
                      {user.full_name || "Customer"}
                    </p>
                    <p className="text-xs text-muted-foreground truncate">{user.email}</p>
                  </div>

                  {/* Switch company */}
                  <button
                    type="button"
                    onClick={() => {
                      setDropdownOpen(false)
                      window.location.href = "/portal?switch=1"
                    }}
                    className="w-full flex items-center gap-2 px-3 py-2 text-sm text-muted-foreground hover:text-foreground hover:bg-muted/50 transition-colors cursor-pointer"
                  >
                    <BuildingIcon className="h-3.5 w-3.5 shrink-0" />
                    Switch company
                  </button>

                  {/* Sign out */}
                  <button
                    type="button"
                    onClick={handleSignOut}
                    className="w-full flex items-center gap-2 px-3 py-2 text-sm text-destructive hover:bg-destructive/10 transition-colors cursor-pointer"
                  >
                    <LogOutIcon className="h-3.5 w-3.5 shrink-0" />
                    Sign out
                  </button>
                </div>
              </>
            )}
          </div>
        </div>
      </header>

      {/* ── Page content ───────────────────────────────────────────────── */}
      <main className="max-w-screen-lg mx-auto px-4 py-6">{children}</main>

      {/* ── Mobile bottom tab nav ───────────────────────────────────────── */}
      <nav
        className="fixed bottom-0 left-0 right-0 z-30 border-t border-border/40 bg-card/90 backdrop-blur-sm sm:hidden"
        aria-label="Mobile portal navigation"
      >
        <div className="flex items-stretch">
          {NAV_ITEMS.map((item) => {
            const isActive = pathname === item.href || pathname.startsWith(item.href + "/")
            const Icon = item.icon
            const isMessages = item.href === "/portal/messages"
            return (
              <Link
                key={item.href}
                href={item.href}
                className={`flex-1 flex flex-col items-center justify-center gap-0.5 py-2 text-[10px] transition-colors ${
                  isActive
                    ? "text-primary"
                    : "text-muted-foreground"
                }`}
              >
                <div className="relative">
                  <Icon className="h-5 w-5" />
                  {isMessages && (
                    <UnreadDot
                      orgId={user.org_id}
                      role="customer"
                      customerId={customerId}
                    />
                  )}
                </div>
                <span className="leading-tight">
                  {item.label === "Request Service" ? "Request" : item.label}
                </span>
              </Link>
            )
          })}
        </div>
      </nav>

      {/* ── Footer ─────────────────────────────────────────────────────── */}
      <footer className="border-t border-border/40 hidden sm:block">
        <div className="max-w-screen-lg mx-auto px-4 py-4">
          <p className="text-xs text-muted-foreground text-center">
            Powered by{" "}
            <span className="text-primary font-medium">PoolCo</span>
          </p>
        </div>
      </footer>
    </div>
  )
}
