# Project State

## Project Reference

See: .planning/PROJECT.md (updated 2026-03-03)

**Core value:** A pool tech can run their entire day from one app with minimal friction — while office and customers stay in the loop automatically.
**Current focus:** Phase 3 — Field Tech App (Phase 2 complete)

## Current Position

Phase: 3 of 10 (Field Tech App) — IN PROGRESS
Plan: 6 of N (03-01 schema + 03-02 chemistry engine + 03-03 route view + 03-04 stop workflow + 03-05 tasks checklist + 03-06 photos/notes complete)
Status: In Progress — Photos tab (camera, compression, offline queue, Supabase Storage) and Notes tab complete; 03-07 visit completion sync next
Last activity: 2026-03-06 — 03-06 photo capture and notes complete

Progress: [█████░░░░░] 55%

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
| Phase 02-customer-pool-data-model P04 | 8 | 1 tasks | 2 files |
| Phase 02-customer-pool-data-model P04 | 12 | 2 tasks | 3 files |
| Phase 03-field-tech-app P01 | 4 | 2 tasks | 9 files |
| Phase 03-field-tech-app P02 | 10 | 3 tasks | 7 files |
| Phase 03-field-tech-app P03 | 6 | 2 tasks | 8 files |
| Phase 03 P04 | 6 | 2 tasks | 7 files |
| Phase 03-field-tech-app P05 | 2 | 1 tasks | 3 files |
| Phase 03-field-tech-app P06 | 15 | 2 tasks | 7 files |

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
- [Phase 02-01]: CRITICAL — drizzle-kit push creates RLS policies with NULL USING/WITH CHECK expressions. After any migration, verify policies with `SELECT policyname, qual, with_check FROM pg_catalog.pg_policies WHERE tablename = 'X'`. If NULL, recreate from migration SQL.
- [Phase 02-02]: CRITICAL — correlated SQL subqueries on RLS-protected tables return wrong results inside withRls transactions. Always use LEFT JOIN + GROUP BY + count() instead of `(SELECT COUNT(*) FROM table WHERE ...)` subqueries.
- [Phase 02-02]: zodResolver from @hookform/resolvers@5 incompatible with zod@4 — use plain React state + inline validation (matches InviteDialog pattern from Phase 1)
- [Phase 02-03]: Relations in dedicated relations.ts file to avoid customers ↔ pools circular ESM import
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
- [Phase 02-04]: tech field null in allVisits flatMap — serviceVisits relational query omits tech relation; Phase 3 adds with: { tech: true } when visits have real data
- [Phase 02-04]: ServiceHistoryTimeline filter chips use plain button with cn() conditionals — no zod/hookform, matches codebase pattern established in 02-02
- [Phase 02-customer-pool-data-model]: drizzle-kit push creates RLS policies with NULL conditions — verify pg_catalog.pg_policies after every migration and recreate policies if qual/with_check are NULL
- [Phase 02-customer-pool-data-model]: Correlated SQL subqueries on RLS-protected tables return wrong results inside withRls — always use LEFT JOIN + GROUP BY + count() for aggregate counts on RLS tables
- [Phase 02-customer-pool-data-model]: Server actions that mutate data visible on a list page must revalidatePath both the detail page AND the list page — addPool/deletePool now revalidate /customers in addition to /customers/[id]
- [Phase 03-01]: route_days.stop_order as JSONB array — minimal Phase 3 approach; Phase 4 replaces with relational stop rows without breaking Phase 3 data
- [Phase 03-01]: drizzle-kit push creates NULL RLS policies (confirmed again in Phase 3) — all 20 Phase 3 policies manually recreated via psql after every push
- [Phase 03-01]: PhotoQueueItem.blob NOT indexed in Dexie — indexing Blob columns corrupts IndexedDB performance
- [Phase 03-01]: VisitDraft.id is client-generated UUID — visit_id known before Supabase sync enabling optimistic offline writes
- [Phase 03-field-tech-app]: CSI balanced test assertion: formula gives -0.07 not -0.29 for balanced inputs; both in balanced zone; test updated to range-based assertion
- [Phase 03-field-tech-app]: interpretCSI boundary: -0.3 maps to 'low' per spec (csi <= -0.3), +0.3 maps to 'balanced' (csi <= +0.3)
- [Phase 03-field-tech-app]: vitest installed as test framework for lib/chemistry pure math modules; node environment, @/ alias
- [Phase 03-03]: Tech reorder client-only (Dexie) — route_days UPDATE policy is owner+office only; Phase 4 adds persistent tech reordering
- [Phase 03-03]: prefetchTodayRoutes clears routeCache on empty response — prevents stale day-prior routes
- [Phase 03-03]: openInMaps uses https:// URLs (not app:// deep links) — more reliable in PWA standalone mode
- [Phase 03]: Chemistry tab default: Chemistry is the default active tab as it is the primary tech action each stop
- [Phase 03]: Temperature has no TargetRanges key — ChemParam.key=null skips classifyReading, treated as 'ok'
- [Phase 03]: Pool volume default 15000 gallons when volume_gallons is null — prevents zero-division in dosing
- [Phase 03-05]: Checkbox UI component created manually (not via CLI) — @radix-ui/react-checkbox already installed
- [Phase 03-05]: TaskRow manages its own notesOpen state — avoids lifting N textarea open booleans to parent
- [Phase 03-05]: Notes textarea auto-expands on task uncheck — supports exception documentation flow
- [Phase 03-06]: PhotoQueueItem.orgId added (Dexie v3) — global photo sync processor in sync.ts needs orgId to construct org-scoped storage path without live session context
- [Phase 03-06]: Blob-first architecture confirmed — compressed blob written to Dexie before any upload attempt; photo never lost even if app closes mid-upload
- [Phase 03-06]: No custom Web Speech API — NotesField uses system keyboard dictation hint; Web Speech API broken in PWA standalone mode (per research)
- [Phase 03-06]: processAllPendingPhotos in sync.ts — global connectivity handler retries all pending photos on app-open and visibilitychange; not just current stop session
- [Phase 03-06]: visit-photos Supabase Storage bucket requires manual creation with RLS policy: storage.foldername(name)[1] = auth.jwt()->>'org_id'

### Pending Todos

- [UI Polish]: cursor-pointer missing on some interactive elements (buttons, cards, clickable rows) — add `cursor-pointer` class
- [UI Polish]: Low-contrast hover states on dark theme — some hover effects barely visible; review and increase contrast
- [UI Polish]: Auth page button spacing and logo mismatch (deferred from Phase 1)

### Blockers/Concerns

- [Phase 3]: Chemistry engine built — CSI formula and CYA correction implemented and tested; formula values should be validated against CPO curriculum or TFP calculator before shipping to real customer pools (liability risk if wrong)
- [Phase 7]: QBO bi-directional sync conflict resolution strategy must be mapped before building invoice UI — define which system wins per entity type
- [Phase 10]: AI route optimization algorithm choice (OSRM self-hosted vs. Google Routes Optimization API at $4-6/call) needs break-even analysis before Phase 10 planning
- [Phase 10]: Predictive chemistry alerts require 3+ months of per-pool reading history — cannot launch until that data exists

## Session Continuity

Last session: 2026-03-06
Stopped at: Completed 03-06-PLAN.md — photo capture with WebP compression + Dexie offline blob queue + Supabase Storage, and notes textarea with keyboard dictation hint; 7 files; FIELD-07, FIELD-08, FIELD-10 complete
Resume file: .planning/phases/03-field-tech-app/ (03-07 next — visit completion sync to Supabase)
