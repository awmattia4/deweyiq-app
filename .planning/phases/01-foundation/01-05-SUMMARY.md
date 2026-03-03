---
phase: 01-foundation
plan: 05
subsystem: ui
tags: [nextjs, shadcn, sidebar, shell, layout, role-based, pwa, offline, portal, proxy, auth]

# Dependency graph
requires:
  - phase: 01-01
    provides: Next.js project, shadcn/ui, design system, proxy.ts, directory structure
  - phase: 01-02
    provides: Drizzle schema, RLS, profiles table, AuthUser type
  - phase: 01-03
    provides: getCurrentUser() server action, signOut(), AuthUser type, portal/login page
  - phase: 01-04
    provides: OfflineBanner, SyncStatusIcon, initSyncListener, prefetchTodayRoutes, useSyncStatus

provides:
  - Role-based app shell: sidebar (collapsible), header (sync icon + user avatar), offline banner integrated
  - AppSidebar: tech sees [Routes, Profile]; office sees [Dashboard, Routes, Team, Settings]; owner same as office (Billing/Reports/Team Mgmt hidden until Phase 7/9)
  - AppHeader: breadcrumb/page title, SyncStatusIcon, user avatar dropdown with sign out
  - AppShell: SidebarProvider + SidebarInset + TooltipProvider wrapper — complete staff layout container
  - SyncInitializer: client component calling initSyncListener() + prefetchTodayRoutes() on mount
  - src/app/(app)/layout.tsx: protected staff layout with getCurrentUser() auth guard + role check
  - src/app/portal/(portal)/layout.tsx: authenticated portal route group with customer-only guard + PortalShell
  - PortalShell: customer-facing shell with placeholder company branding, stub nav links (Phase 8)
  - proxy.ts full role routing: owner/office→/dashboard, tech→/routes, customer→/portal on login redirect
  - Placeholder pages: /dashboard and /routes (full content in Plan 06 + Phase 3)

affects:
  - 01-06 (PWA testing uses the shell; offline banner and sync icon are now integrated)
  - Phase 2 (Customers nav item can be enabled by uncommenting in app-sidebar.tsx)
  - Phase 3 (Routes nav already present; prefetchTodayRoutes activates with route API)
  - Phase 4 (Schedule nav item can be enabled by uncommenting)
  - Phase 7 (Billing nav item for owner — uncomment in app-sidebar.tsx)
  - Phase 8 (Portal: PortalShell ready; /portal/(portal)/layout.tsx handles auth; nav links to activate)
  - Phase 9 (Reports nav item for owner — uncomment in app-sidebar.tsx)
  - All phases (AppShell is the staff app container for all subsequent features)

# Tech tracking
tech-stack:
  added:
    - shadcn sidebar component (via npx shadcn@latest add sidebar)
    - shadcn sheet component
    - shadcn avatar component
    - shadcn dropdown-menu component
    - use-mobile.ts hook (installed alongside sidebar component by shadcn)
  patterns:
    - "SidebarProvider + SidebarInset: shadcn sidebar layout pattern for collapsible sidebar"
    - "TooltipProvider in AppShell (not root layout): scoped tooltip context for staff app only"
    - "SyncInitializer: render-nothing client component pattern for side-effect initialization"
    - "Route group (portal): /portal/(portal)/ excludes login from auth-guarded layout without URL change"
    - "Defense-in-depth auth: proxy.ts catches unauthenticated → layout's getCurrentUser() is second guard"

key-files:
  created:
    - src/app/(app)/layout.tsx (protected staff layout with auth guard + role check)
    - src/app/(app)/dashboard/page.tsx (placeholder; tech redirected to /routes)
    - src/app/(app)/routes/page.tsx (placeholder; full content Phase 3)
    - src/components/shell/app-shell.tsx (root staff shell: OfflineBanner + SyncInitializer + SidebarProvider)
    - src/components/shell/app-sidebar.tsx (role-aware nav; future nav items commented with phase notes)
    - src/components/shell/app-header.tsx (page title + SyncStatusIcon + user avatar dropdown)
    - src/components/shell/portal-shell.tsx (customer portal shell; placeholder branding; Phase 8 nav stubs)
    - src/components/shell/sync-initializer.tsx (client component; initSyncListener + prefetchTodayRoutes on mount)
    - src/app/portal/(portal)/layout.tsx (authenticated portal route group; customer-only guard)
    - src/app/portal/(portal)/page.tsx (portal home placeholder; full content Phase 8)
    - src/components/ui/avatar.tsx (shadcn)
    - src/components/ui/dropdown-menu.tsx (shadcn)
    - src/components/ui/sheet.tsx (shadcn)
    - src/components/ui/sidebar.tsx (shadcn)
    - src/hooks/use-mobile.ts (shadcn sidebar dependency)
  modified:
    - src/lib/supabase/proxy.ts (full role-based routing: landing redirects, customer→portal guard)
    - src/app/portal/layout.tsx (simplified to minimal pass-through; auth guard moved to (portal) group)

key-decisions:
  - "Portal route group pattern: /portal/(portal)/layout.tsx handles auth-guarded pages; /portal/login stays outside this group (no auth guard) so unauthenticated users can reach the login page"
  - "SyncInitializer client component: render-null client component is the clean pattern for wiring useEffect-based init in a server-component-first layout"
  - "TooltipProvider scoped to AppShell: placed in the staff shell (not root layout) — portal and auth pages don't need tooltip context"
  - "Future nav items hidden (not disabled): sidebar only shows Phase 1 items; future items are commented with phase notes — cleaner UX than greyed-out items"
  - "proxy.ts handles landing redirects only: proxy enforces auth and role-landing redirect; page-level restrictions (tech hitting /dashboard) handled in the page itself"

patterns-established:
  - "Pattern: SyncInitializer — render-null client component for browser-only initialization in server-component layouts"
  - "Pattern: route group for layout split — /portal/(portal) excludes login from auth-guarded layout"
  - "Pattern: NAV_ITEMS with roles array + future items commented with phase notes — maintainable role-based nav"

requirements-completed:
  - AUTH-05

# Metrics
duration: 7min
completed: 2026-03-03
---

# Phase 01 Plan 05: App Shell Summary

**shadcn sidebar shell with role-aware navigation (tech=minimal, office/owner=full), OfflineBanner + SyncStatusIcon integrated, SyncInitializer calling initSyncListener() + prefetchTodayRoutes() on mount, and portal route group with customer-only auth guard**

## Performance

- **Duration:** 7 min
- **Started:** 2026-03-03T23:44:43Z
- **Completed:** 2026-03-03T23:51:48Z
- **Tasks:** 1/1
- **Files created/modified:** 17 created + 2 modified

## Accomplishments

- Complete staff app shell: shadcn collapsible sidebar + header with SyncStatusIcon + OfflineBanner fixed at top + SyncInitializer wiring background sync on mount
- Role-aware sidebar: tech sees only Routes + Profile (minimal, work-focused); office/owner see Dashboard, Routes, Team, Settings; future nav items (Billing, Reports, Schedule) commented with phase notes for clean activation
- proxy.ts updated with full role-based routing: unauthenticated users routed to correct login, authenticated users redirected to role-appropriate landing page
- Portal restructured with route group: `/portal/(portal)/layout.tsx` handles auth-guarded customer pages; `/portal/login` stays outside this group so unauthenticated users can access it without circular redirect
- TooltipProvider scoped to AppShell — SyncStatusIcon tooltips work throughout the staff app

## Task Commits

1. **Task 1: Build app shell, sidebar, header, portal shell, and role-based proxy routing** - `f8c1b26` (feat)

**Plan metadata:** (recorded in final docs commit below)

## Files Created/Modified

- `src/lib/supabase/proxy.ts` — Full role-based routing: landing redirects per role (owner/office→/dashboard, tech→/routes, customer→/portal); customer guard on staff routes; defense-in-depth on login paths
- `src/app/(app)/layout.tsx` — Protected staff layout; getCurrentUser() auth guard; customer→/portal redirect; renders AppShell with user prop
- `src/app/(app)/dashboard/page.tsx` — Placeholder; tech role redirected to /routes; full content in Plan 06
- `src/app/(app)/routes/page.tsx` — Placeholder; full content in Phase 3
- `src/components/shell/app-shell.tsx` — Staff app root: TooltipProvider + OfflineBanner + SyncInitializer + SidebarProvider + SidebarInset + AppHeader + main content
- `src/components/shell/app-sidebar.tsx` — Role-aware nav: tech=minimal (Routes/Profile), office/owner=full (Dashboard/Routes/Team/Settings); future items commented; user footer with avatar + sign out dropdown
- `src/components/shell/app-header.tsx` — SidebarTrigger + page title derived from pathname + SyncStatusIcon + user avatar dropdown
- `src/components/shell/portal-shell.tsx` — Customer shell: sticky header with placeholder company branding + stub nav links (Phase 8) + max-w-screen-lg content + "Powered by PoolCo" footer
- `src/components/shell/sync-initializer.tsx` — Render-null client component; useEffect calls initSyncListener() (returns cleanup) and prefetchTodayRoutes()
- `src/app/portal/layout.tsx` — Simplified to minimal pass-through (no auth guard); auth moved to (portal) route group
- `src/app/portal/(portal)/layout.tsx` — Authenticated customer route group; getCurrentUser() → redirect non-customers to /dashboard; renders PortalShell
- `src/app/portal/(portal)/page.tsx` — Portal home placeholder; full content Phase 8
- `src/components/ui/{avatar,dropdown-menu,sheet,sidebar}.tsx` — shadcn components added
- `src/hooks/use-mobile.ts` — shadcn sidebar dependency (mobile breakpoint hook)

## Decisions Made

- **Portal route group**: The `/portal/login` page lives under `/portal/layout.tsx` which now wraps all portal routes. If we put an auth guard in that layout, `/portal/login` would create a circular redirect (unauthenticated → redirect to /portal/login → layout redirects again). The clean solution: move auth-guarded portal pages into a `/portal/(portal)/` route group with its own layout. The top-level `/portal/layout.tsx` becomes a minimal pass-through. Only authenticated portal pages live under `(portal)`.

- **SyncInitializer client component**: The `(app)/layout.tsx` is a server component, but `initSyncListener` and `prefetchTodayRoutes` need `useEffect` (client-side, browser-only). The clean pattern: a render-null client component (`SyncInitializer`) dropped into AppShell handles the side effects. No "use client" needed on the layout.

- **TooltipProvider scoped to AppShell**: Plan 04 noted "TooltipProvider must be added to root layout." After review: placing it in AppShell is better — portal and auth pages don't need it, and scoping avoids leaking tooltip context to unrelated layouts.

- **Future nav items hidden**: Disabled/greyed-out nav items for future phases feel broken to users. Instead, items for Phase 2+ are commented out in `app-sidebar.tsx` with inline notes (e.g., `// Phase 2`, `// Phase 7`). Activation is a one-line uncomment per phase.

- **proxy.ts role landing redirects**: Proxy handles the role-landing redirect only (where does this role go after login?). Finer-grained access control (e.g., tech hitting /dashboard) is handled at the page level — dashboard/page.tsx redirects techs to /routes.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] Portal route group restructure to prevent circular redirect**
- **Found during:** Task 1 (portal layout auth guard implementation)
- **Issue:** `/portal/layout.tsx` applies to ALL routes under `/portal/`, including `/portal/login`. Adding an auth guard that redirects unauthenticated users to `/portal/login` would create an infinite redirect loop when an unauthenticated user hits `/portal/login` itself.
- **Fix:** Kept `/portal/layout.tsx` as a minimal pass-through (no auth guard). Created `/portal/(portal)/layout.tsx` as a route group for authenticated portal pages. The route group excludes `/portal/login` naturally since login is not inside the group.
- **Files modified:** `src/app/portal/layout.tsx` (simplified), `src/app/portal/(portal)/layout.tsx` (new), `src/app/portal/(portal)/page.tsx` (new portal home placeholder)
- **Verification:** Build passes; `/portal/login` renders without auth guard; `/portal/(portal)/` layout has auth guard for future authenticated pages
- **Committed in:** `f8c1b26` (Task 1 commit)

---

**Total deviations:** 1 auto-fixed (blocking — portal circular redirect architecture)
**Impact on plan:** The route group restructure is strictly an implementation detail. The external behavior matches the plan: unauthenticated users hitting portal routes go to `/portal/login` (via proxy); authenticated customers get wrapped in `PortalShell`. No scope change.

## Issues Encountered

- **npm cache permissions**: Same pre-existing issue as Plans 01/03/04 (`/Users/aaronmattia/.npm` root-owned). Worked around with `npm_config_cache=/tmp/npm-cache npx shadcn@latest add sidebar sheet avatar dropdown-menu`.

## User Setup Required

None — all shell components are client-side UI. No external service configuration required.

## Next Phase Readiness

- **Ready:** Plan 06 (PWA testing + skeleton screens) — AppShell is the container; OfflineBanner and SyncStatusIcon are integrated and visible
- **Ready:** Phase 2 (customers) — Dashboard nav item present; Customers nav item uncomment-ready in app-sidebar.tsx
- **Ready:** Phase 3 (routes) — Routes nav item present and active for all roles; prefetchTodayRoutes stub ready for activation
- **Note to Phase 8**: Portal shell (PortalShell component) is built and ready. Three things to activate: (1) replace placeholder branding in PortalShell with org settings, (2) uncomment nav links in PortalShell, (3) add real portal pages under `/portal/(portal)/`

---
*Phase: 01-foundation*
*Completed: 2026-03-03*

## Self-Check: PASSED

All 17 key files verified present. Task commit f8c1b26 confirmed in git history. `npx tsc --noEmit` passes. `npm run build` succeeds.
