---
phase: 01-foundation
plan: 06
subsystem: ui
tags: [nextjs, shadcn, skeleton, dashboard, routes, team, settings, portal, rls, drizzle, landing-pages]

# Dependency graph
requires:
  - phase: 01-01
    provides: Next.js project, shadcn/ui, design system, directory structure
  - phase: 01-02
    provides: Drizzle schema (orgs, profiles), withRls wrapper, adminDb, RLS client
  - phase: 01-03
    provides: getCurrentUser(), signOut(), AuthUser type, inviteTeamMember action
  - phase: 01-04
    provides: OfflineBanner, SyncStatusIcon (integrated in AppShell)
  - phase: 01-05
    provides: AppShell, AppSidebar, AppHeader, PortalShell, portal route group layout

provides:
  - Dashboard page: real org name + team count via withRls(); greeting, metric cards, quick actions
  - Dashboard loading.tsx: skeleton matching 3-column card grid + quick action row
  - Routes page: date header + Phase 3 empty state; role guard (customer→/portal)
  - Routes loading.tsx: date header skeleton + 5 stop-card skeletons
  - Team page: real profiles query via withRls(); member list with role badges + InviteDialog
  - Team loading.tsx: member row skeletons
  - Settings page: ProfileForm (name editing) + org display + sign out; owner/office only
  - Portal home: welcome message + coming-soon cards (Service History, Invoices, Messages)
  - InviteDialog client component: owner-only invite modal calling inviteTeamMember action
  - ProfileForm client component: name editing form calling updateProfile action
  - updateProfile server action: updates profiles.full_name via adminDb
  - shadcn dialog + select components added

affects:
  - Phase 2 (Customers: dashboard quick actions already link to /team; sidebar uncomment-ready)
  - Phase 3 (Routes: empty state placeholder ready for stop list cards; date header in place)
  - Phase 4 (Schedule: sidebar item uncomment-ready)
  - Phase 7 (Billing: sidebar item uncomment-ready)
  - Phase 8 (Portal: portal home skeleton in place; full content replaces "coming soon" cards)
  - Phase 9 (Reports: sidebar item uncomment-ready)

# Tech tracking
tech-stack:
  added:
    - shadcn dialog component
    - shadcn select component
  patterns:
    - "withRls() in server pages: getClaims() → token → withRls(token, (db) => query) for RLS-aware Drizzle queries"
    - "Parallel DB fetches: Promise.all() with multiple withRls calls for independent queries"
    - "Client invite/form components: 'use client' form components calling server actions via useTransition"
    - "Role guards at page level: if (user.role === X) redirect('/Y') after layout auth guard"

key-files:
  created:
    - src/app/(app)/dashboard/loading.tsx (skeleton: card grid + quick actions)
    - src/app/(app)/routes/loading.tsx (skeleton: date header + 5 stop cards)
    - src/app/(app)/team/page.tsx (real profiles from DB; InviteDialog for owners)
    - src/app/(app)/team/loading.tsx (member row skeletons)
    - src/app/(app)/settings/page.tsx (ProfileForm + org info + sign out)
    - src/actions/profile.ts (updateProfile server action)
    - src/components/team/invite-dialog.tsx (shadcn dialog invite form; useTransition)
    - src/components/settings/profile-form.tsx (name edit form; useTransition)
    - src/components/ui/dialog.tsx (shadcn)
    - src/components/ui/select.tsx (shadcn)
  modified:
    - src/app/(app)/dashboard/page.tsx (real data: org name + team count via withRls)
    - src/app/(app)/routes/page.tsx (date header + empty state; customer role guard)
    - src/app/portal/(portal)/page.tsx (welcome message + coming-soon cards for 3 sections)

key-decisions:
  - "Portal page file location: plan referenced src/app/portal/page.tsx but the correct file from Plan 05 route group architecture is src/app/portal/(portal)/page.tsx — updated the correct file to preserve the auth-guarded route group"
  - "updateProfile uses adminDb: profiles_update_policy RLS allows users to update their own row; adminDb is pragmatic for Phase 1; withRls() pattern preferred in later phases"
  - "InviteDialog only for owner role: plan says 'Invite Member button' — guard matches inviteTeamMember server action which only allows owners; office cannot invite"
  - "shadcn dialog + select installed inline: needed for InviteDialog; installed via npx shadcn@latest add — no architectural impact"

requirements-completed:
  - AUTH-05

# Metrics
duration: ~12min
completed: 2026-03-03
---

# Phase 01 Plan 06: Role Landing Pages Summary

**Role-specific landing pages with real Drizzle+RLS data queries: dashboard shows live org name and team count, team page lists real profiles, settings has editable name field, routes has date-anchored empty state, portal shows coming-soon sections — every page has a matching skeleton loading screen**

## Performance

- **Duration:** ~12 min
- **Started:** 2026-03-03T00:00:00Z
- **Completed:** 2026-03-03
- **Tasks:** 1/2 (Task 2 is a human-verify checkpoint — awaiting user)
- **Files created/modified:** 13 files (10 created, 3 modified)

## Accomplishments

- Dashboard upgraded from placeholder to real data: org name and team member count fetched via `withRls()` with parallel `Promise.all()` queries; greeting, 3 metric cards, quick action buttons
- Team page queries all org profiles from Drizzle with RLS; displays name, email, role badge, joined date; InviteDialog (owner-only) calls `inviteTeamMember` server action via `useTransition`
- Settings page with ProfileForm for name editing (`updateProfile` server action), org info card, and sign-out form action; owner/office only
- Routes page has date header showing today's date and clear Phase 3 empty state messaging
- Portal home upgraded from single placeholder to 3 section cards (Service History, Invoices, Messages) with "Coming in Phase 8" messaging
- Every new/modified page has a corresponding `loading.tsx` with skeleton screens matching the layout structure
- All role guards implemented at page level (defense-in-depth behind proxy + layout)

## Task Commits

1. **Task 1: Build role landing pages with real data and skeleton screens** - `f8368a4` (feat)
2. **Task 2: Verify complete Phase 1 Foundation** - checkpoint:human-verify (awaiting user)

## Files Created/Modified

- `src/app/(app)/dashboard/page.tsx` — Real data: withRls() fetches org name + team count; greeting + metric cards + quick actions; tech/customer redirected
- `src/app/(app)/dashboard/loading.tsx` — Skeleton: 3-column card grid + quick action row skeletons
- `src/app/(app)/routes/page.tsx` — Date header + Phase 3 empty state; customer→/portal redirect
- `src/app/(app)/routes/loading.tsx` — Skeleton: date header + 5 stop-card skeletons (address, name, time slot)
- `src/app/(app)/team/page.tsx` — withRls() profiles query; member list with avatars, role badges, joined dates; InviteDialog for owner
- `src/app/(app)/team/loading.tsx` — Skeleton: 4 member row skeletons
- `src/app/(app)/settings/page.tsx` — ProfileForm + org name card + sign out button; owner/office only
- `src/app/portal/(portal)/page.tsx` — Welcome message + Service History / Invoices / Messages coming-soon cards
- `src/actions/profile.ts` — updateProfile server action: updates profiles.full_name via adminDb
- `src/components/team/invite-dialog.tsx` — shadcn Dialog with email input + role select; calls inviteTeamMember; useTransition for pending state
- `src/components/settings/profile-form.tsx` — Name editing form; calls updateProfile; useTransition + save/error state
- `src/components/ui/dialog.tsx` — shadcn dialog component
- `src/components/ui/select.tsx` — shadcn select component

## Decisions Made

- **Portal page location**: Plan 06 listed `src/app/portal/page.tsx` but Plan 05 established the route group architecture where authenticated portal pages live at `src/app/portal/(portal)/page.tsx`. Updated the correct file to maintain the route group auth guard.

- **InviteDialog owner-only**: The invite button is only shown when `user.role === "owner"`. This matches the `inviteTeamMember` server action which enforces owner-only access. The plan says "Invite Member button" without specifying role restriction — applied the same constraint as the underlying action for consistency.

- **updateProfile uses adminDb**: The profiles_update_policy RLS allows `id = auth.uid()` updates. Using `adminDb` is pragmatic for Phase 1 name editing. In later phases when profile editing gets more complex, switch to `withRls()` for consistent patterns.

- **shadcn dialog + select added**: The InviteDialog required a modal component. Installed both via `npx shadcn@latest add` — Rule 3 auto-fix (missing component needed for task completion).

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] Installed shadcn dialog and select components**
- **Found during:** Task 1 (building InviteDialog for team page)
- **Issue:** InviteDialog requires a modal component and a role dropdown; neither was installed
- **Fix:** `npm_config_cache=/tmp/npm-cache npx shadcn@latest add dialog select`
- **Files modified:** `src/components/ui/dialog.tsx`, `src/components/ui/select.tsx`
- **Verification:** Build passes; dialog renders correctly
- **Committed in:** `f8368a4` (Task 1 commit)

**2. [Rule 2 - Missing Critical] Added updateProfile server action**
- **Found during:** Task 1 (building settings page with ProfileForm)
- **Issue:** ProfileForm needed a server action to persist name changes; no profile update action existed
- **Fix:** Created `src/actions/profile.ts` with `updateProfile()` — validates input, updates profiles row via adminDb, returns success/error
- **Files modified:** `src/actions/profile.ts`
- **Verification:** TypeScript passes; build succeeds
- **Committed in:** `f8368a4` (Task 1 commit)

---

**Total deviations:** 2 auto-fixed (1 blocking, 1 missing critical)
**Impact on plan:** Both auto-fixes required for task completion. No scope creep — dialog/select are standard shadcn installs; updateProfile is the minimal server-side backing for the settings form the plan specified.

## Issues Encountered

None — `npx tsc --noEmit` passed clean, `npm run build` succeeded on first attempt.

## User Setup Required

None for this plan — all features are UI + server actions using existing Supabase credentials. The full Phase 1 foundation (auth flows, RLS, PWA) requires the Supabase setup from Plans 02-04 (already documented in those plans' USER-SETUP sections).

## Next Phase Readiness

- **Ready:** Phase 2 (Customers) — dashboard and sidebar are ready; Customers nav item is a one-line uncomment in app-sidebar.tsx
- **Ready:** Phase 3 (Routes) — routes page has date header in place; empty state has clear "coming in a future update" message; Phase 3 drops in stop-card components
- **Awaiting:** Task 2 checkpoint — user must verify the complete Phase 1 foundation before marking Phase 1 complete

---
*Phase: 01-foundation*
*Completed: 2026-03-03*

## Self-Check: PASSED

All 13 key files verified present. Task commit f8368a4 confirmed in git history. `npx tsc --noEmit` passes. `npm run build` succeeds.
