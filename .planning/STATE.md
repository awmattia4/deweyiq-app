# Project State

## Project Reference

See: .planning/PROJECT.md (updated 2026-03-03)

**Core value:** A pool tech can run their entire day from one app with minimal friction — while office and customers stay in the loop automatically.
**Current focus:** Phase 1 — Foundation

## Current Position

Phase: 1 of 10 (Foundation)
Plan: 6 of 6 in current phase
Status: Checkpoint — awaiting human verification
Last activity: 2026-03-03 — Plan 01-06 Task 1 complete; stopped at Task 2 (human-verify Phase 1)

Progress: [████░░░░░░] 14%

## Performance Metrics

**Velocity:**
- Total plans completed: 3
- Average duration: 6 min
- Total execution time: 0.3 hours

**By Phase:**

| Phase | Plans | Total | Avg/Plan |
|-------|-------|-------|----------|
| 01-foundation | 4.5/6 | ~36 min | ~7 min |

**Recent Trend:**
- Last 5 plans: 01-01 (10 min), 01-02 (3 min), 01-04 (3 min), 01-03 (4 min), 01-05 (7 min)
- Trend: Stable

*Updated after each plan completion*

## Accumulated Context

### Decisions

Decisions are logged in PROJECT.md Key Decisions table.
Recent decisions affecting current work:

- [Roadmap]: Web-first PWA (Next.js + Serwist) chosen over native mobile — faster to market, single codebase
- [Roadmap]: Supabase chosen as all-in-one backend (Postgres + Auth + Realtime + Storage)
- [Roadmap]: Drizzle ORM over Prisma — edge/serverless native, better Supabase pooler compatibility
- [Roadmap]: Offline-first architecture required from Phase 1 — Dexie.js + Background Sync, not retrofit
- [Roadmap]: Multi-tenant RLS must be in Postgres schema from day one — cannot add post-hoc
- [01-01]: Serwist uses new class-based API (new Serwist()) — legacy installSerwist() in serwist/legacy subpath only
- [01-01]: getClaims() returns { claims, header, signature } not { user } — proxy checks claimsData !== null for auth
- [01-01]: Dark-first design system — html class=dark in layout, brand palette is the dark theme
- [01-01]: prepare:false required for Supabase transaction-mode pooler — all Drizzle postgres client instances must use this
- [01-04]: MAX_RETRIES=5 with exponential backoff (baseDelay 1s, maxDelay 60s) — ~2min retry window before alerting user
- [01-04]: enqueueWrite pattern established — all write mutations use this instead of direct fetch() calls
- [01-04]: prefetchTodayRoutes stub in sync.ts ready for Phase 3 route API activation
- [Phase 01-02]: pgPolicy to/for fields: 'to' takes PgRole object (authenticatedRole), 'for' takes string literals — both required for correct migration
- [Phase 01-02]: (select auth.jwt()) subquery wrapping prevents per-row re-evaluation of auth.jwt() — required for performance at scale
- [Phase 01-02]: user_role claim name (not role) avoids collision with Supabase reserved 'role' JWT claim that is always 'authenticated'
- [Phase 01-03]: Auth callback single handler for OAuth, invite, and recovery — inviteUserByEmail uses one-time token (not PKCE) by Supabase design; exchangeCodeForSession handles all three transparently
- [Phase 01-03]: getCurrentUser() calls getUser() alongside getClaims() — email/full_name not in JWT claims by default in Supabase, fetched via getUser() on demand
- [Phase 01-03]: inviteTeamMember pre-creates profile row with adminDb — RLS requires profile to exist before invited user's first login
- [Phase 01-foundation]: Portal route group pattern: (portal) route group excludes login from auth-guarded layout; login stays at /portal level with no auth guard to prevent circular redirects
- [Phase 01-foundation]: SyncInitializer render-null client component: useEffect-based browser init (initSyncListener + prefetchTodayRoutes) in a server-component layout requires a render-null client component wrapper
- [Phase 01-foundation]: Future nav items hidden (not disabled): app-sidebar.tsx shows only Phase 1 items; future items (Billing Phase 7, Reports Phase 9, Schedule Phase 4) are commented with phase activation notes
- [Phase 01-06]: updateProfile uses adminDb: profiles_update_policy RLS allows own-row updates; adminDb pragmatic for Phase 1; withRls() preferred in later phases for consistency
- [Phase 01-06]: InviteDialog owner-only: invite button shown only for owner role — matches server action enforcement; office cannot invite
- [Phase 01-06]: Portal page at (portal)/page.tsx: plan referenced /portal/page.tsx but route group architecture from Plan 05 requires /portal/(portal)/page.tsx — correct file updated

### Pending Todos

None.

### Blockers/Concerns

- [Phase 3]: Chemistry LSI formula and CYA correction must be validated against CPO curriculum before shipping to real pools — liability risk if wrong
- [Phase 7]: QBO bi-directional sync conflict resolution strategy must be mapped before building invoice UI — define which system wins per entity type
- [Phase 10]: AI route optimization algorithm choice (OSRM self-hosted vs. Google Routes Optimization API at $4-6/call) needs break-even analysis before Phase 10 planning
- [Phase 10]: Predictive chemistry alerts require 3+ months of per-pool reading history — cannot launch until that data exists

## Session Continuity

Last session: 2026-03-03
Stopped at: 01-06-PLAN.md Task 2 checkpoint (human-verify complete Phase 1 Foundation). Task 1 committed f8368a4. Awaiting user to verify all 14 Phase 1 criteria.
Resume file: None
