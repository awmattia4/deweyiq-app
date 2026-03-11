# Project State

## Project Reference

See: .planning/PROJECT.md (updated 2026-03-03)

**Core value:** A pool tech can run their entire day from one app with minimal friction — while office and customers stay in the loop automatically.
**Current focus:** Phase 6 — Work Orders & Quoting (Phase 5 complete)

## Current Position

Phase: 6 of 11 (Work Orders & Quoting) — IN PROGRESS
Plan: 6/6 complete (01, 03, 04, 05, 06 done; 02 remaining)
Status: Phase 6 Plan 06 complete — Public customer quote approval page at /quote/[token], POST endpoint /api/quotes/[token]/approve, approved quotes auto-convert WO to 'approved', office alerts for all customer responses
Last activity: 2026-03-11 — Phase 6 Plan 06 executed: customer quote approval portal + API endpoint + WO auto-conversion

Progress: [█████████░] 90%

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
| Phase 03-field-tech-app P07 | 76 | 2 tasks | 10 files |
| Phase 03-field-tech-app P08 | 4 | 1 tasks | 8 files |
| Phase 04-scheduling-routing P02 | 10 | 2 tasks | 8 files |
| Phase 04-scheduling-routing P01 | 12 | 2 tasks | 13 files |
| Phase 04-scheduling-routing P05 | 5 | 2 tasks | 12 files |
| Phase 04-scheduling-routing P04 | 8 | 2 tasks | 6 files |
| Phase 05-office-operations-dispatch P01 | 6 | 2 tasks | 8 files |
| Phase 05-office-operations-dispatch P02 | 6 | 2 tasks | 8 files |
| Phase 05-office-operations-dispatch P04 | 7 | 2 tasks | 9 files |
| Phase 05-office-operations-dispatch P03 | 7 | 2 tasks | 4 files |
| Phase 06-work-orders-quoting P01 | 9 | 2 tasks | 12 files |
| Phase 06-work-orders-quoting P02 | 9 | 2 tasks | 9 files |
| Phase 06-work-orders-quoting P03 | 15 | 2 tasks | 6 files |
| Phase 06-work-orders-quoting P04 | 14 | 2 tasks | 7 files |
| Phase 06-work-orders-quoting P05 | 10 | 2 tasks | 7 files |
| Phase 06-work-orders-quoting P06 | 4 | 2 tasks | 4 files |

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
- [Phase 03-07]: completeStop uses onConflictDoUpdate — same visitId can be submitted multiple times safely (offline sync idempotency)
- [Phase 03-07]: sonner installed for toast notifications — root layout Toaster with dark theme; completion feedback is critical UX
- [Phase 03-07]: supabase/functions excluded from Node.js tsconfig — Deno Edge Function files cannot be type-checked by Node.js TypeScript compiler
- [Phase 03-07]: email_reports deferred to Phase 4 — customers table lacks toggle; Phase 7 sends to any customer with email (best-effort)
- [Phase 03-08]: Stop card main area is a Next.js Link to /routes/{customerId}-{poolId}; navigate button uses stopPropagation to prevent link conflict
- [Phase 03-08]: OKLCH inline CSSProperties for status badge colors — Tailwind v4 arbitrary value oklch() with slash opacity unreliable; inline styles provide exact color values
- [Phase 03-08]: Chemistry grid: amber=LOW, red=HIGH — amber means reading needs to go up (too low), red means reading needs to come down (too high); directionally intuitive
- [Phase 03-08 BUG FIX]: Dexie useLiveQuery ReadOnlyError — useVisitDraft was writing (.put) inside useLiveQuery callback which uses read-only transactions; fix: moved draft creation to useEffect, liveQuery is read-only
- [Phase 03-08 BUG FIX]: "Mark All Complete" only marked 1 task — updateChecklist captured stale `draft` in useCallback closure; concurrent Promise.all calls all read same empty checklist array and last-write-wins. Even reading fresh from Dexie inside each callback failed (all reads before any write). Final fix: added `markAllChecklistComplete` that writes all tasks in a single atomic Dexie update.
- [Phase 03-08 BUG FIX]: CompletionModal/SkipStopDialog too wide on desktop — Sheet (side="bottom") had no max-width; fix: added `max-w-lg mx-auto`
- [Phase 03-08 BUG FIX]: CompletionModal/SkipStopDialog content smushed against edges on mobile — Sheet base has no padding; content sections (headers, buttons) were flush with edge; fix: added `px-4` to content wrapper div
- [Phase 03-08 BUG FIX]: stopStatus always "upcoming" after completing a stop — `fetchStopsForTech` in routes.ts and API route hardcoded `stopStatus: "upcoming"`; fix: added `todayVisitStatusMap` that cross-references `service_visits` for today's date and maps their status per pool_id
- [Phase 03-08 BUG FIX]: pH decimal input eaten — `parseFloat("7.")` returns `7`; typing "7." immediately flushed as 7 to Dexie, losing the decimal; fix: created `ChemInput` component with local `useState<string>` state, only flushes complete numbers (not ending in "." or "-") to Dexie, with blur handler as safety net
- [Phase 03-08 KNOWN]: SidebarProvider hydration mismatch — pre-existing shadcn sidebar issue; server renders defaultOpen=true but client cookie state may differ; recoverable error, does not break functionality
- [Phase 04-scheduling-routing]: generateDatesForRule fast-forward from anchor using modular arithmetic — avoids day-by-day iteration for efficiency with distant anchors
- [Phase 04-scheduling-routing]: Destructive frequency change on schedule rules: delete future stops + regenerate rather than diff — simpler, predictable, UI warns user
- [Phase 04-scheduling-routing]: Holiday bidirectional sync: createHoliday marks scheduled stops as holiday; deleteHoliday resets holiday stops back to scheduled
- [Phase 04-scheduling-routing]: Edge Function uses jsr:@supabase/supabase-js@2 (not esm.sh from plan template) — matches existing send-service-report pattern in project
- [Phase 04-01]: route_stops UPDATE policy allows tech role — app layer enforces which fields techs can write (not RLS column-level)
- [Phase 04-01]: fetchStopsForTech exported from routes.ts — shared between server action and API route; eliminates ~80 lines of duplicated query code
- [Phase 04-01]: Phase 3 fallback in fetchStopsForTech — route_days JSONB path used when no route_stops exist for the day; logs warning to prompt migration
- [Phase 04-01]: reorderStops overloaded — detects Phase 4 {id, sortIndex} vs Phase 3 {customer_id, pool_id, sort_index} by shape of first item in newOrder array
- [Phase 04-03]: MapClient uses dynamic import inside useEffect for maplibre-gl — avoids window access during SSR even when component file is imported server-side; consumers use next/dynamic ssr:false as belt-and-suspenders
- [Phase 04-03]: Locked stops excluded from SortableContext.items array (not just visually disabled) — dnd-kit requires items to be in context to allow dropping onto that position; excluding prevents any drag interaction with locked positions
- [Phase 04-03]: getStopsForDay extended with address/lat/lng from customers — required for route map marker placement and stop list address display; lat/lng are null until geocoding Phase adds them
- [Phase 04-03]: ScheduleTabs renders all three panels in DOM with hidden toggle — preserves RouteBuilder React state (selected tech/day/stops) across tab switches without refetching
- [Phase 04-05]: StopPopup as React overlay (not MapLibre Popup API) — allows Next.js Link and full React rendering without setHTML string
- [Phase 04-05]: DispatchClientShell pattern: server page SSRs data, client shell owns TechFilter selectedTechId state
- [Phase 04-05]: OKLCH color palette pre-assigned to techs by index in getDispatchData for consistent colors across markers, route lines, and filter chips
- [Phase 04-scheduling-routing]: LEFT JOIN for unassigned customers: getUnassignedCustomers fetches all org customers and assigned IDs separately, filters in JS — avoids RLS correlated subquery pitfall
- [Phase 04-scheduling-routing]: Multi-container DnD handleDragOver inserts temp ScheduleStop for visual feedback; handleDragEnd persists via assignStopToRoute then refreshes from server
- [Phase 04 BUG FIX]: MapLibre oklch() colors don't work in WebGL paint properties (line-color, fill-color) — only CSS DOM elements support oklch(). Use hex colors (#60a5fa) for all MapLibre layer paint properties.
- [Phase 04 BUG FIX]: Dispatch map rewritten to use shared MapClient component — original custom map init had multiple issues (oklch in paint, broken layout, marker stacking). Always reuse MapClient + dynamic import pattern from map-client.tsx.
- [Phase 04 BUG FIX]: NEVER use `transition: transform` on MapLibre marker elements — MapLibre updates marker CSS `transform` to reposition during pan/zoom; a CSS transition causes markers to lag behind the map creating a jitter effect. Dispatch map was fine (no transition), schedule map had it.
- [Phase 04 BUG FIX]: Dashboard had hardcoded "0" stop count — always wire real queries for data cards, never leave placeholder values that look like real data.
- [Phase 04 POST-APPROVAL]: Per-pool schedule assignment — `getUnassignedCustomers` now tracks assigned `customer_id:pool_id` pairs (not just customer_id), filters each customer's pools to only unassigned ones. UnassignedPanel redesigned with per-pool selection (composite keys), multi-pool group headers with indeterminate checkbox, individual pool Assign buttons. Route builder drag-drop uses `bulkAssignStops(pairs)` for all pools instead of `assignStopToRoute(pairs[0])` for first pool only.
- [Phase 04 POST-APPROVAL]: Co-located stop markers — stops at same lat/lng (e.g. pool + spa at same address) render as a single pill-shaped combined marker showing all indices ("4 · 5"). Geographic offset approach (0.00025 degrees) was invisible at normal zoom — pill markers work at every zoom level. Applied to both schedule route-map and dispatch dispatch-map.
- [Phase 04 POST-APPROVAL]: Dispatch stop rows now show pool name — customer name on first line, pool name + address on second line, so two stops for the same customer are distinguishable.
- [Phase 05-01]: Twilio via raw fetch + URLSearchParams + btoa in Deno — Twilio npm package does not work in Deno runtime
- [Phase 05-01]: drizzle-kit push NULL RLS policy pitfall confirmed again in Phase 5 — manually recreated all 8 policies for alerts and org_settings via psql
- [Phase 05-01]: org_settings SELECT for all org members (owner, office, tech) — tech needs requirements config at stop completion time
- [Phase 05-02]: @react-email/render exports `render` (not `renderAsync`) — older docs reference renderAsync but v1+ API is render() returning Promise<string>
- [Phase 05-02]: Next.js "use server" files may only export async functions — non-async consts (SNOOZE_OPTIONS) and interface exports cause `invalid-use-server-value` build error; move to @/lib/*/constants.ts
- [Phase 05-02]: Report token references visitId (not content hash) — token stays valid across stop edits; public link always serves latest report_html for that visitId
- [Phase 05-04]: SNOOZE_OPTIONS extracted to src/lib/alerts/constants.ts — Next.js use server files can only export async functions; const/types must live in non-server files
- [Phase 05-04]: adminDb for alert generation (not withRls) — generation scans all org data without RLS filtering complexities; caller validates org membership before calling
- [Phase 05-04]: alertCount fetched in layout.tsx server component and passed as prop through AppShell to AppSidebar — sidebar is client component so count is injected from server
- [Phase 05-03]: Two-step withRls queries (stops then customers) for sendPreArrivalNotifications — avoids RLS correlated subquery pitfall per MEMORY.md
- [Phase 05-03]: getRouteStartedStatus pre-fetched in parallel with getTodayStops via Promise.all — button renders in correct SSR state without client-side loading flicker
- [Phase 06-01]: drizzle-kit push NULL RLS policy confirmed again in Phase 6 — manually fixed all 28 policies via ALTER POLICY for 7 new tables (work_orders, work_order_line_items, parts_catalog, wo_templates, quotes, invoices, invoice_line_items)
- [Phase 06-01]: appendActivityEvent uses COALESCE(activity_log, '[]'::jsonb) || event::jsonb — safe null handling for new WOs with no existing log
- [Phase 06-01]: getWorkOrder fetches profiles in a single inArray query, not multiple self-joins — avoids Drizzle alias complexity for createdBy/assignedTech/flaggedBy
- [Phase 06-01]: getWorkOrders priority sort in application layer (emergency→high→normal→low) — simpler than CASE WHEN SQL
- [Phase 06-01]: @react-pdf/renderer requires serverExternalPackages in next.config.ts to prevent 'Component is not a constructor' crash
- [Phase 06-01]: parent_wo_id has no FK constraint — avoids cascade issues when parent WO is deleted
- [Phase 06-01]: invoices.work_order_ids is JSONB string[] for multi-WO combined invoicing
- [Phase 06-01]: Phase 6 hex-only colors convention — all PDF-related code must use hex colors (#60a5fa etc), not oklch(); documented in work-orders.ts header
- [Phase 06-02]: WoList uses local useState filter over pre-fetched server data — avoids URL param complexity for single-page list
- [Phase 06-02]: getCustomersForWo two-query pattern — fetch customers then pools separately to avoid RLS correlated subquery pitfall (MEMORY.md)
- [Phase 06-02]: getTechProfiles added to work-orders.ts — keeps WO-related actions co-located, avoids importing from dispatch patterns
- [Phase 06-02]: WoDetail inline edit with optimistic setWo + router.refresh() — immediate UI feedback without full refetch latency
- [Phase 06-04]: No @radix-ui/react-icons in project — use lucide-react only
- [Phase 06-04]: workOrderLineItems schema has no updated_at column — removed from updateLineItem and reorderLineItems
- [Phase 06-04]: OrgSettings Phase 6 fields now include all numeric/text/boolean fields from org_settings schema; DEFAULT_SETTINGS updated
- [Phase 06-03]: flagFromCurrentUser boolean flag: server action resolves flaggedByTechId from JWT token.sub — avoids requiring client to read auth context
- [Phase 06-03]: Alert insertion for tech-flagged WOs uses adminDb (not withRls) — alerts INSERT RLS is owner+office only; tech cannot insert directly; matches generateAlerts pattern
- [Phase 06-03]: WO notification helpers are void fire-and-forget — alert failure must never roll back WO mutation; non-fatal by design
- [Phase 06-03]: updateWorkOrderStatus and createWorkOrder restructured from return-await-withRls to const-result-await pattern — required for post-transaction notification side effects
- [Phase 06-03]: work-order-photos bucket requires manual creation in Supabase Storage with org-scoped RLS before photos can upload
- [Phase 06-05]: renderToBuffer requires 'as any' cast for React element — @react-pdf/renderer Document type expects DocumentProps but QuoteDocument is a React function component; types don't align
- [Phase 06-05]: adminDb for next_quote_number atomic increment — org_settings UPDATE RLS is owner-only; adminDb lets office staff create quotes without owner role
- [Phase 06-05]: QUOTE_TOKEN_SECRET separate from REPORT_TOKEN_SECRET — per 06-RESEARCH.md Pitfall 3
- [Phase 06-05]: new Uint8Array(buffer) for Web Response API — Node.js Buffer is not assignable to BodyInit; Uint8Array is the correct type
- [Phase 06-06]: adminDb throughout public quote routes — customer has no Supabase auth session (per 06-RESEARCH.md Pitfall 5); token verification is the sole authorization
- [Phase 06-06]: approved_optional_item_ids stored on quote row — Plan 07 (invoicing) will use this list to include only customer-approved optional items on the invoice
- [Phase 06-06]: onConflictDoNothing for quote response alerts — unique (org_id, alert_type, reference_id) constraint with reference_id=quote.id ensures exactly one alert per quote per action type
- [Phase 06-06]: Status guard on approval API — only 'sent' quotes can be acted on; prevents double-approval race conditions
- [Phase 06-06]: Light theme for /quote/[token] public page — customer-facing portal uses white/gray design system, not dark admin theme

### Pending Todos

- [UI Polish]: cursor-pointer missing on some interactive elements (buttons, cards, clickable rows) — add `cursor-pointer` class
- [UI Polish]: Low-contrast hover states on dark theme — some hover effects barely visible; review and increase contrast
- [UI Polish]: Auth page button spacing and logo mismatch (deferred from Phase 1)
- [Phase 4/5]: Team invite dialog should allow setting display name when inviting — currently display name is not editable by the invited user or the inviter; add name field to invite flow and allow techs to edit their own display name in settings
- [Phase 5]: Customizable tech requirements — owner/office should be able to configure: required chemistry readings per sanitizer type, required checklist tasks, minimum data for stop completion. Currently hardcoded in REQUIRED_PARAMS (completion-modal.tsx) and requiredFor (chemistry-grid.tsx). Added as plan 05-05 in roadmap.

### Blockers/Concerns

- [Phase 3]: Chemistry engine built — CSI formula and CYA correction implemented and tested; formula values should be validated against CPO curriculum or TFP calculator before shipping to real customer pools (liability risk if wrong)
- [Phase 7]: QBO bi-directional sync conflict resolution strategy must be mapped before building invoice UI — define which system wins per entity type
- [Phase 10]: AI route optimization algorithm choice (OSRM self-hosted vs. Google Routes Optimization API at $4-6/call) needs break-even analysis before Phase 10 planning
- [Phase 10]: Predictive chemistry alerts require 3+ months of per-pool reading history — cannot launch until that data exists

## Session Continuity

Last session: 2026-03-11
Stopped at: Completed 06-06-PLAN.md — Customer quote approval portal at /quote/[token], POST /api/quotes/[token]/approve, WO auto-conversion on approval, office alerts
Resume file: N/A — Phase 6 complete (Plan 02 WO detail page still remaining); consider Phase 7 (Invoicing) or cleanup Plan 02
