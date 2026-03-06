# Project State

## Project Reference

See: .planning/PROJECT.md (updated 2026-03-03)

**Core value:** A pool tech can run their entire day from one app with minimal friction — while office and customers stay in the loop automatically.
**Current focus:** Phase 2 — Customer & Pool Data Model

## Current Position

Phase: 2 of 10 (Customer & Pool Data Model) — IN PROGRESS
Plan: 3 of 4 complete (02-01 schema + 02-02 customer list + 02-03 customer profile page done; 02-04 pending)
Status: Ready — 02-03 executed; proceed to 02-04 (service history timeline)
Last activity: 2026-03-05 — Plan 02-03 complete; customer profile page + pool/equipment management

Progress: [█████░░░░░] 27%

## Performance Metrics

**Velocity:**
- Total plans completed: 4
- Average duration: 6 min
- Total execution time: 0.4 hours

**By Phase:**

| Phase | Plans | Total | Avg/Plan |
|-------|-------|-------|----------|
| 01-foundation | 6/6 COMPLETE | ~48 min | ~8 min |

**Recent Trend:**
- Last 6 plans: 01-01 (10 min), 01-02 (3 min), 01-04 (3 min), 01-03 (4 min), 01-05 (7 min), 01-06 (12 min)
- Trend: Stable

*Updated after each plan completion*
| Phase 02-customer-pool-data-model P01 | 11 | 2 tasks | 10 files |
| Phase 02-customer-pool-data-model P02 | 7 | 2 tasks | 7 files |
| Phase 02 P03 | 15 | 2 tasks | 10 files |

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
- [Phase 01-06]: Phase 1 user-verified 2026-03-05 — signup, login, dashboard, team invite, tech role restrictions, and PWA install all confirmed working; two minor UI defers noted (auth page button spacing, logo mismatch) — non-blocking
- [Phase 02-customer-pool-data-model]: relations.ts dedicated file: Drizzle v1 relations in single file to eliminate circular ESM imports between customers<->pools<->equipment
- [Phase 02-customer-pool-data-model]: service_visits write policy includes tech role from Phase 2 to avoid policy migration when Phase 3 techs write service records
- [Phase 02-customer-pool-data-model]: equipment type as text not pgEnum — open-ended categories avoid migration per new type; future check constraint if enforcement needed
- [Phase 02-customer-pool-data-model]: route_name free-text on customers for Phase 2; Phase 4 adds route_id FK and routes table without breaking Phase 2 string-match filter
- [Phase 02-02]: zod v4 + @hookform/resolvers v5 zodResolver type incompatibility — AddCustomerDialog uses plain React state + inline validation matching InviteDialog pattern; resolver incompatibility must be addressed before using Form component with zod schemas elsewhere
- [Phase 02-02]: ContactIcon used for Customers sidebar nav item — PersonStandingIcon in sidebar comment does not exist in lucide-react; ContactIcon is visually distinct from Team's UsersIcon
- [Phase 02-03]: History tab placeholder div — ServiceHistoryTimeline imported in Plan 02-04 only to avoid build-time missing-module error
- [Phase 02-03]: AddPoolDialog uses plain useState + inline validation — matches locked codebase pattern from 02-02 zod/hookform incompatibility decision

### Pending Todos

None.

### Blockers/Concerns

- [Phase 3]: Chemistry LSI formula and CYA correction must be validated against CPO curriculum before shipping to real pools — liability risk if wrong
- [Phase 7]: QBO bi-directional sync conflict resolution strategy must be mapped before building invoice UI — define which system wins per entity type
- [Phase 10]: AI route optimization algorithm choice (OSRM self-hosted vs. Google Routes Optimization API at $4-6/call) needs break-even analysis before Phase 10 planning
- [Phase 10]: Predictive chemistry alerts require 3+ months of per-pool reading history — cannot launch until that data exists

## Session Continuity

Last session: 2026-03-05
Stopped at: Completed 02-03-PLAN.md — customer profile page + inline edit + pool/equipment management
Resume file: .planning/phases/02-customer-pool-data-model/02-04-PLAN.md
