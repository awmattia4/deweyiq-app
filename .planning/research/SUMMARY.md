# Project Research Summary

**Project:** Pool Company Management SaaS ("Skimmer Killer")
**Domain:** Field Service Management SaaS — pool service vertical
**Researched:** 2026-03-03
**Confidence:** HIGH (stack, features), MEDIUM-HIGH (architecture, pitfalls)

## Executive Summary

This is a field service management SaaS targeting pool service companies, built to displace Skimmer as the dominant player in the market. The product has three distinct user audiences with very different needs: field technicians who work outdoors with unreliable cell coverage and need a fast, crash-free mobile experience; office staff who need real-time dispatch visibility and CRM; and customers who want self-service access to service history and billing. The technical complexity is high because these three surfaces must share a single database while remaining architecturally isolated — and the field tech surface requires genuine offline-first design, not a bolted-on cache.

The recommended approach is a Next.js 15/16 PWA (not a native app) backed by Supabase for Postgres, Auth, Realtime, and Storage, with Drizzle ORM for type-safe queries, Stripe for billing, and Dexie.js + Serwist for offline-first field operations. The architecture follows a proven field service management pattern with domain-driven module boundaries: Foundation (auth, schema, RLS, offline shell) must ship first because every downstream component depends on it. Core field operations — route management, service logging, chemistry readings — come second and unblock billing and AI features. Billing and customer portal build on top of validated service records. Smart features (AI routing, predictive chemistry alerts) come last because they require accumulated real data to be useful.

The top risks are: (1) treating offline as an afterthought — pool equipment rooms have zero signal and data loss destroys trust; (2) chemistry calculation errors — wrong LSI formulas and missing CYA corrections are a liability surface, not just a bug; (3) scope collapse — Skimmer was built over years and trying to match it at launch guarantees an 18-month no-revenue run; and (4) multi-tenant data isolation done post-hoc, which requires a full rewrite to fix correctly. All four of these must be addressed in Phase 1 or they become structural problems.

## Key Findings

### Recommended Stack

The stack is modern, well-integrated, and optimized for the three primary constraints: offline field operations, real-time office dispatch, and Vercel/serverless deployment. Next.js 15.5/16 with React 19 and TypeScript 5.x is the clear framework choice — its PWA support via Serwist (the official Workbox-based successor to next-pwa) is mature as of Feb 2026, and App Router enables per-audience bundle optimization by route group. Supabase is the right all-in-one backend: it provides Postgres (portable, not proprietary), JWT-based auth with Row Level Security for multi-tenancy, Realtime subscriptions for live dispatch boards, and Storage for tech photo uploads — all avoiding the assembly cost of Neon + Clerk + S3 separately.

The offline layer is non-negotiable: Dexie.js (IndexedDB) for typed local writes paired with Serwist's Background Sync to flush the queue when connectivity returns. TanStack Query v5 manages server state with stale-while-revalidate and optimistic updates; Zustand handles UI-only state (selected route, modal state). The key deliberate choice to avoid: native mobile apps (React Native/iOS/Android). A Next.js PWA with Serwist covers 95% of field tech needs — installable, offline-capable, camera-enabled, push-notification-enabled — at half the maintenance cost.

**Core technologies:**
- Next.js 15/16 + React 19 + TypeScript 5.x: Full-stack framework with PWA support, App Router for per-audience routes, typed routes at compile time
- Supabase: All-in-one Postgres + Auth (JWT/RLS) + Realtime WebSocket + Storage — eliminates multi-service assembly
- Drizzle ORM: Type-safe, 7.4kb, edge/serverless native, SQL-like API — superior to Prisma for Supabase on Vercel Edge
- Tailwind CSS v4 + shadcn/ui: Production-ready as of Jan 2026, OKLCH color system better for outdoor high-contrast displays
- Serwist (@serwist/next): Official PWA/offline solution (next-pwa is unmaintained — never use it)
- Dexie.js v4: IndexedDB wrapper for offline writes — typed, pairs with Serwist Background Sync
- TanStack Query v5: Server state, stale-while-revalidate, optimistic updates — needed for dispatch board live data
- Stripe: Invoicing, ACH (0.8% capped at $5), subscriptions, automatic dunning
- Mapbox GL JS v3: Route visualization, cheaper than Google Maps for multi-waypoint routing at scale
- Upstash QStash: Serverless background jobs (route optimization, scheduled invoicing, chemistry alerts)
- Resend + React Email: Transactional email with JSX templates

### Expected Features

Research confirms a two-tier feature landscape. Table stakes are large — Skimmer has been training the market for years — but with clear gaps that represent genuine differentiation opportunities: real GPS route progress, bi-directional QBO sync (vs. Skimmer's one-way), technician pay/commission tracking (absent from Skimmer), and a cleaner UX with dramatically fewer clicks per stop (the most cited user complaint about Skimmer).

**Must have (table stakes — v1 launch):**
- Tech mobile app: route view, offline-capable, fast (Skimmer's most-used surface)
- Chemical readings entry + LSI calculator per stop (must validate against CPO curriculum)
- Customizable service checklists per customer/service type
- Photo capture attached to stop with auto-send service report (branded PDF/email)
- Route builder with recurring scheduling (weekly/bi-weekly)
- One-click route optimization (rule-based for v1)
- Real-time route progress in office dashboard (GPS breadcrumb — Skimmer has no live GPS)
- Work orders for repair/one-off jobs
- Invoicing with multiple billing models (per-stop, monthly flat, plus-chemicals)
- AutoPay with Stripe (credit + ACH) with retry logic
- Customer portal: view reports, pay invoices
- QBO bi-directional sync (Skimmer is one-way — this is a v1 differentiator)
- Multi-role access (owner, office, tech, customer)
- Basic reporting (revenue, completion rates, KPI dashboard)
- SMS + email customer notifications (pre-arrival, post-service)

**Should have (competitive differentiators — v1.x after validation):**
- Technician pay + commission tracking (explicitly missing from Skimmer, present in PoolBrain)
- Comprehensive alerts dashboard (missed stops, high chemical usage, overdue invoices)
- Chemical cost per pool profitability analysis (which pools cost more than they generate?)
- Technician scorecards (stop time, chemical efficiency, completion rate per tech)
- Customer self-service requests in portal (submit green pool cleanup, opening/closing — revenue-generating)
- Quoting/estimating for repair jobs (convert to work order)
- Multi-body-of-water with distinct service levels (commercial/HOA pipeline trigger)
- Surcharging/convenience fee passthrough (low build cost, high revenue impact)

**Defer to v2+:**
- Built-in full native accounting (P&L, GL, expense tracking) — huge moat but years of build; start with QBO bi-directional sync
- AI route optimization (ML-based) — ship rule-based first; ML needs accumulated route data
- Predictive chemical alerts — requires 3+ months of per-pool reading history; cannot ship at launch
- Inventory management (truck stock, reorder alerts) — high complexity, defer unless customers demand it
- Open API for integrations — build when enterprise customers are in pipeline
- IoT sensor integration — design schema to accept sensor reads; don't build integration now
- Full payroll (W2/1099 compliance) — build commission tracking + payroll export instead; don't own compliance

**Anti-features to avoid building:**
- Always-on GPS fleet tracking: battery drain, privacy complaints from techs; use active-route polling only
- Native payroll: regulatory minefield (state taxes, garnishments, FLSA) — export to ADP/Gusto instead
- Customer-facing AI chat: LLM hallucinations about pool chemistry are a liability; keep AI internal
- "AI for everything" marketing: 40% of pool pros would never trust AI with invoicing; use AI only where it genuinely reduces work

### Architecture Approach

The architecture follows the field service management (FSM) pattern established by Dynamics 365 FSL and Salesforce FSL, adapted for a Next.js + Supabase stack. Three isolated route groups serve three audiences with different performance budgets and data patterns: the tech PWA is offline-first with minimal initial payload; the office dashboard is real-time-heavy with Supabase Realtime subscriptions; the customer portal is read-heavy with aggressive server-side caching. Domain-driven module boundaries (Work Orders, Routes, Customers, Billing, Chemistry) prevent cross-domain coupling — chemistry alert logic stays in `lib/chemistry/`, billing logic stays in `lib/stripe/`, and they communicate via events rather than direct imports.

The offline sync pattern is idempotent: every field write gets a client-generated UUID, goes to IndexedDB first, and is flushed to the server via Serwist Background Sync on reconnect. The server uses the UUID as an idempotency key to deduplicate. Supabase Realtime (Postgres LISTEN/NOTIFY over WebSocket) pushes route status changes to the office dashboard without polling. AI and route optimization features run async via Supabase Edge Functions or Upstash QStash — never blocking the UI in synchronous API response paths.

**Major components:**
1. Field Tech PWA (offline-first) — Serwist service worker, Dexie.js IndexedDB, Background Sync outbound queue; isolated `app/(tech)/` route group
2. Office Dashboard (real-time) — Supabase Realtime subscriptions for live dispatch board; `app/(office)/` route group; TanStack Query for cache management
3. Customer Portal (read-heavy) — Server-side rendering, aggressive caching, Stripe Customer Portal embedded; `app/(portal)/` route group
4. API Layer (Next.js) — Server Actions for mutations, Route Handlers for webhooks (Stripe, QBO); RLS enforcement at DB level
5. Scheduling Engine — pg_cron or Supabase Edge Functions for recurring work order generation; route optimizer called async only
6. Chemistry Engine — Pure function domain in `lib/chemistry/`; LSI + dosing calculations are unit-testable and isolated from UI; Edge Function triggers on reading insert for async alert generation
7. Offline Sync Layer — UUID-keyed outbound queue in IndexedDB, flushed via Background Sync to `/api/sync` with idempotency enforcement

### Critical Pitfalls

1. **Offline as an afterthought** — Pool equipment rooms have zero cell signal. If the first architecture decision isn't offline-first (all writes to IndexedDB first, server sync on reconnect), it becomes a full rewrite to fix later. Address in Phase 1 Week 1, not Phase 3.

2. **Chemistry calculation errors as liability** — Wrong LSI formulas and missing CYA-to-carbonate alkalinity corrections cause real damage (overcalculated chlorine, equipment failures, health incidents for commercial pools). Validate formulas against CPO curriculum, support all sanitizer types as separate calculation paths, add an audit trail. Never simplify this for speed.

3. **Scope collapse** — Skimmer was built over years. Trying to match it before launch = 18-month no-revenue run. MVP is: tech mobile app + office scheduling + basic invoicing. Ship pilot with 3-5 real pool companies first. Everything else is backlog.

4. **Multi-tenant isolation done post-hoc** — `company_id` on every table and Supabase RLS policies must be in place on Day 1 of schema creation. Adding them after data is in the table requires auditing every query and every API endpoint — it's a rewrite-scale effort. A cross-tenant data leak is a churn-ending trust incident.

5. **Stripe ACH treated as synchronous** — ACH payments can fail 3-5 days after authorization. Never mark an invoice paid until the `payment_intent.succeeded` webhook confirms. Build webhook handling for `charge.failed` and `payment_intent.payment_failed` before launching billing.

## Implications for Roadmap

Based on the combined research findings, the architecture's build order, the feature dependency graph, and the pitfall-to-phase mapping, six phases are recommended. The ordering is dictated by hard technical dependencies, not feature priority.

### Phase 1: Foundation (Auth, Schema, Offline Shell)

**Rationale:** Every other component depends on auth context, Postgres schema with RLS, and the offline PWA architecture. Changing schema after billing is wired is expensive. Retrofitting RLS after data exists is a rewrite. Retrofitting offline after the app is built is also a rewrite. All three must be in place before any feature development begins.

**Delivers:**
- Next.js project with App Router, TypeScript, Tailwind v4, shadcn/ui initialized
- Supabase project with Postgres schema: `organizations`, `users`, `pools`, `service_locations`, `routes`, `work_orders` — all with `org_id` foreign key
- Supabase RLS policies for all tables from day one
- JWT multi-role auth (owner, office, tech, customer) with Next.js middleware route protection
- PWA shell: Serwist service worker installed, Dexie.js schema defined, offline cache strategy configured
- Background Sync outbound queue (UUID-keyed `QueuedWrite` schema in IndexedDB)
- Multi-tenant isolation verified: automated test — create two orgs, confirm cross-org resource access returns 403

**Features addressed:** Multi-role access, mobile-first PWA install baseline
**Pitfalls avoided:** Multi-tenant data isolation (Pitfall 4), Offline as afterthought (Pitfall 1), rolling your own auth

**Research flag:** Standard patterns — well-documented Supabase RLS + Next.js App Router setup. No deep research needed for planning.

---

### Phase 2: Core Field Operations (Tech Mobile App)

**Rationale:** The tech mobile app is the daily driver — techs use it all day across 15-20 pools. It must be fast, offline-capable, and correct before any other surface is built. Service data (readings, photos, checklists) is the raw material that billing and the customer portal depend on. Do not build billing before the service record that triggers it is stable.

**Delivers:**
- Tech mobile app (`app/(tech)/`): today's route view, stop list, per-stop service log form
- Chemical readings entry form (LSI calculator with CYA correction, all sanitizer types — validated against CPO curriculum)
- Service checklist completion (customizable per customer)
- Photo capture (one-handed, compressed client-side before upload to Supabase Storage)
- Offline-first: all writes go to Dexie.js IndexedDB; sync via Serwist Background Sync to `/api/sync`
- Route builder with recurring stop generation (weekly/bi-weekly rules)
- Basic rule-based route optimization (one-click)
- Field-tested UX: 44px tap targets, high-contrast (OKLCH), 3 taps max for most-common action (log service complete)

**Features addressed:** Tech mobile app, chemical readings, LSI calculator, checklist, photo capture, route view, route optimization (rule-based), recurring scheduling
**Pitfalls avoided:** Offline as afterthought (Pitfall 1), chemistry calculation errors (Pitfall 2), tech UX built for office not field (Pitfall 7)

**Research flag:** Chemistry calculation logic needs deep validation against CPO curriculum before shipping. Run against Pool Math (Trouble Free Pool) as reference. Do not ship this without unit test coverage for all sanitizer types and CYA edge cases.

---

### Phase 3: Office Operations and Dispatch (Real-Time Dashboard)

**Rationale:** Office staff need to see field data as it arrives — which means this phase can only build meaningfully once Phase 2 is generating real service records. The Supabase Realtime dispatch board, customer CRM, and service report generation all depend on having live work order data flowing from the field app. The customer portal is blocked on service reports existing.

**Delivers:**
- Office dashboard (`app/(office)/`): live dispatch board with Supabase Realtime (LISTEN/NOTIFY → WebSocket → TanStack Query)
- Real-time route progress: GPS breadcrumb overlay per tech on route map (Mapbox GL JS)
- Customer CRM: customer + pool profile management, gate codes, equipment tracking, service history
- Service report auto-generation: branded PDF/email sent to customer on stop completion (Resend + React Email)
- SMS + email customer notifications (pre-arrival, post-service)
- Work orders for repair/one-off jobs
- Comprehensive alerts dashboard: missed stops, high chemical usage, overdue check-ins
- Basic reporting dashboard (revenue, completion rates, chemical usage KPIs)

**Features addressed:** Office dispatch, CRM, service reports, customer notifications, work orders, reporting, real-time route progress
**Pitfalls avoided:** Alert fatigue (surface only actionable alerts, not every reading in range)

**Research flag:** Supabase Realtime at scale — connection pooling needs to be in place before 50+ concurrent techs. Monitor Pro tier connection limits. Standard pattern but needs scale-aware configuration.

---

### Phase 4: Billing and Payments

**Rationale:** Billing depends on completed work order events. Building payment flows before the service record that triggers them is stable leads to invoicing bugs that touch real money. QBO sync direction must be decided before building invoice UI — not after.

**Delivers:**
- Invoicing: multiple billing models (per-stop, monthly flat, plus-chemicals), bulk invoice generation
- Stripe integration: credit card + ACH AutoPay with Smart Retries, dunning email flows
- Stripe webhook handler: `payment_intent.succeeded`, `payment_intent.payment_failed`, `charge.failed` — ACH is async, never mark paid until webhook confirms
- QBO bi-directional sync (invoices, payments, customers, expense categories — true two-way, not one-way like Skimmer)
- Invoice automation: triggered by work order completion event, auto-generated per billing model
- Surcharging/convenience fee passthrough (low complexity, high customer revenue impact)
- Customer portal billing: view invoices, pay via Stripe, update payment method, one-click magic link for unauthenticated invoice access

**Features addressed:** Invoicing, AutoPay, Stripe ACH, QBO bi-directional sync, customer portal billing, surcharging
**Pitfalls avoided:** Stripe ACH async failure handling (Pitfall 5), double-entry accounting hell (Pitfall 6)

**Research flag:** QBO bi-directional sync is moderately complex. Plan for webhook handling from QBO for reconciliation (not polling). Map conflict resolution strategy (app wins vs. QBO wins per entity type) before implementation.

---

### Phase 5: Customer Portal (Full Self-Service)

**Rationale:** The customer portal is read-only over Phase 2-4 data. Build it last so it shows real data — service history requires completed service reports (Phase 3), billing requires invoices (Phase 4), and service requests require work orders (Phase 3). Launching the portal before these exist means launching an empty app.

**Delivers:**
- Full customer portal (`app/(portal)/`): service history, reports, equipment history, photo archive
- Customer self-service requests: submit green pool cleanup, opening/closing, repair requests — auto-creates work order, office approves/dispatches
- In-app messaging: threaded messages per customer/job between portal and office
- Mobile-optimized portal (tested on iOS Safari + Android Chrome before launch)
- Signed short-lived URLs for PDF invoice downloads (never unauthenticated predictable URLs)
- Branded customer-facing experience: company logo, colors on portal, reports, invoices

**Features addressed:** Customer portal (full), self-service requests, in-app messaging, branded experience
**Pitfalls avoided:** Customer portal mobile UX (must test on mobile before launch per pitfall checklist)

**Research flag:** Standard patterns — SSR-heavy Next.js page with Stripe Customer Portal embedded. No deep research needed.

---

### Phase 6: Smart Features and Growth (AI, Analytics, Tech Management)

**Rationale:** AI features need real data to tune and validate. Route optimization ML needs geocoded customer records and historical route data (accumulated in Phase 3). Chemistry alerts need 3+ months of per-pool reading history (accumulated in Phase 2). Technician pay tracking needs route completion data (Phase 2-3). This phase cannot move up — data volume is a prerequisite, not a scheduling choice.

**Delivers:**
- AI route optimization (ML-based, Upstash QStash async job): proves better than rule-based with before/after stats
- Predictive chemical alerts: linear regression on per-pool reading history to flag pools trending toward imbalance (3+ months of data required)
- Technician pay + commission tracking: per-stop pay rates, commission on upsells, payroll export (ADP/Gusto — do not own compliance layer)
- Technician scorecards: stops/day, avg stop time, chemical cost/pool, completion rate
- Chemical cost per pool profitability analysis: flag negative-margin pools before they drain the business
- Automated scheduling suggestions based on service level rules
- Quoting/estimating for repair jobs (line-item estimates, customer approval, convert to work order)
- Multi-body-of-water with distinct service levels (commercial/HOA customer unlock)

**Features addressed:** AI route optimization, predictive chemistry alerts, technician pay, scorecards, chemical profitability, quoting, multi-body-of-water
**Pitfalls avoided:** AI overpromising — only label features as AI where genuine ML is running (not rule-based automation); 16% AI adoption rate in pool industry means honesty wins over hype

**Research flag:** AI route optimization and predictive chemistry alerts both need deeper research during planning — algorithm selection (OSRM vs. Google ROA), ML model choice for chemistry prediction, and accuracy validation against domain experts. Flag these for `/gsd:research-phase` during roadmap planning.

---

### Phase Ordering Rationale

- **Foundation before everything:** Auth context, schema with RLS, and offline architecture are prerequisites that cannot be added later without rewrites. The pitfall research is explicit: "no code goes in without this."
- **Field operations before billing:** The service record is the trigger for invoice generation. Building payment flows before the triggering event is stable means invoicing bugs that touch real money.
- **Office before customer portal:** The portal displays service reports (Phase 3 output) and invoices (Phase 4 output). Launching a portal with no data is a poor first impression for customers.
- **Data accumulation before AI:** Predictive chemistry alerts require 3+ months of per-pool reading history. AI route optimization requires geocoded customers and historical route data. Both are explicitly Phase 3+ in the features research.
- **Schema is permanent, UI is cheap:** The dependency graph in FEATURES.md confirms that customer → pool → body of water → service level → route is a strict chain. If the data model gets this wrong, every upstream feature breaks.

### Research Flags

Phases needing deeper research during roadmap planning:
- **Phase 2 (Chemistry Engine):** Validate LSI formula and CYA correction implementation against CPO curriculum. Cross-check outputs against Pool Math (Trouble Free Pool). This is a liability surface — get domain expert review before shipping to real pools.
- **Phase 4 (QBO Sync):** Map the full bidirectional sync entity model before building invoice UI. Define conflict resolution strategy per entity type. QBO webhooks vs. polling strategy. Moderately complex integration with poor error documentation.
- **Phase 6 (AI Route Optimization):** Algorithm selection (OSRM self-hosted vs. Google Routes Optimization API at $4-6/call), ML model for chemistry prediction (linear regression vs. simple neural net), accuracy validation approach. Needs dedicated research before implementation.
- **Phase 6 (Predictive Chemistry Alerts):** Requires domain validation — what constitutes an "actionable" alert vs. noise? What thresholds are CPO-validated? Risk of alert fatigue if thresholds are wrong.

Phases with standard patterns (safe to skip research-phase):
- **Phase 1 (Foundation):** Next.js + Supabase RLS + multi-role auth is a well-documented pattern with official references. Serwist PWA setup has official Next.js docs as of Feb 2026.
- **Phase 3 (Supabase Realtime dispatch):** Well-documented Supabase + Next.js Realtime pattern with official examples.
- **Phase 5 (Customer Portal):** Standard SSR Next.js with Stripe Customer Portal embed. No novel patterns.

## Confidence Assessment

| Area | Confidence | Notes |
|------|------------|-------|
| Stack | HIGH | Core stack (Next.js, Supabase, Drizzle, Stripe, Serwist) verified against official docs and multiple community sources. Serwist recommendation from official Next.js docs (Feb 2026). Tailwind v4 + shadcn/ui compatibility confirmed Jan 2026. Version compatibility table cross-checked. |
| Features | HIGH | Competitor feature analysis grounded in Skimmer's official product page, PoolBrain comparison pages, Capterra reviews, and Skimmer's own 2026 State of Pool Service report (30,000+ pool pro survey). Feature prioritization matches well across multiple independent sources. |
| Architecture | MEDIUM-HIGH | FSM architecture patterns verified against Microsoft Dynamics 365 FSL and Salesforce FSL official docs. Offline-first patterns verified against Microsoft Dynamics 365 Field Service Mobile blog series. Supabase-specific patterns from official docs. Pool company SaaS internals (Skimmer architecture) inferred from product docs — not confirmed directly. |
| Pitfalls | MEDIUM | Chemistry formula accuracy verified against CPO curriculum references and Pool Math. Offline sync pitfalls verified against Microsoft FSM best practices. Pricing model pitfall grounded in Skimmer Capterra reviews (high confidence for sentiment, MEDIUM for generalizing to all competitors). Some technical debt patterns are engineering inference, not sourced findings. |

**Overall confidence:** HIGH for core technical and feature decisions. MEDIUM for business model validation (pricing bands not tested with real pool company owners yet) and AI/ML feature complexity.

### Gaps to Address

- **Pricing validation:** Suggested tiered flat pricing ($99/50 pools, $199/150 pools, $349/unlimited) is informed by pitfall research on Skimmer's per-pool churn pattern, but not validated with real pool company owners. Must have 5+ conversations before locking pricing model.
- **Chemistry formula domain review:** The CYA correction and sanitizer-type-specific LSI formulas must be reviewed by a CPO-certified pool professional before shipping to production. Engineering research confirms what to check; a domain expert must confirm the implementation is correct.
- **AI routing cost model:** Google Route Optimization API costs $4-6 per optimization call for large fleets. At scale this becomes a significant cost driver. The build-vs-buy threshold (self-hosted OSRM vs. Google ROA) needs a fleet-size-based break-even analysis during Phase 6 planning.
- **QBO API rate limits and webhook reliability:** QuickBooks Online's API has documented rate limits (500 requests/minute per company). For pool companies with 200+ pools and weekly service, invoice volume could hit limits. Needs load testing before Phase 4 ships.
- **Serwist + Next.js 16 compatibility:** STACK.md notes that @serwist/next explicit Next.js 16 support should be confirmed as v16 exits canary. Check serwist GitHub releases before Phase 1 starts.

## Sources

### Primary (HIGH confidence)
- [Next.js PWA Official Guide](https://nextjs.org/docs/app/guides/progressive-web-apps) — Serwist recommendation, manifest API, push notifications. Confirmed Feb 27, 2026 (v16.1.6 docs).
- [Supabase RLS Official Docs](https://supabase.com/docs/guides/database/postgres/row-level-security) — Multi-tenancy via JWT org_id claims.
- [TanStack Query Official Comparison](https://tanstack.com/query/v5/docs/react/comparison) — vs SWR, Apollo, RTK Query.
- [shadcn/ui Tailwind v4 Docs](https://ui.shadcn.com/docs/tailwind-v4) — Tailwind v4 + React 19 support confirmed.
- [Stripe SaaS Integration Docs](https://docs.stripe.com/saas) — ACH rates, subscription billing, dunning.
- [Skimmer 2026 State of Pool Service Report](https://www.getskimmer.com/stateofpoolservice) — 30,000+ pool pro survey; AI adoption data (16%), trust data (40% would never trust AI with invoicing).
- [Skimmer Capterra Reviews 2025-2026](https://www.capterra.com/p/177014/Skimmer/) — Per-pool pricing complaints, billing gaps, feature sentiment.
- [Microsoft Dynamics 365 Field Service Architecture](https://learn.microsoft.com/en-us/dynamics365/field-service/field-service-architecture) — FSM architecture patterns.
- [Microsoft Dynamics 365 FSM Offline Best Practices (Part 1 & 2)](https://www.microsoft.com/en-us/dynamics-365/blog/it-professional/2023/11/06/best-practices-for-offline-mode-in-the-field-service-mobile-app-part-1/) — Offline sync design.
- [Invoicing and ACH Direct Debit — Stripe Docs](https://docs.stripe.com/invoicing/ach-direct-debit) — Async payment handling, webhook requirements.

### Secondary (MEDIUM confidence)
- [Skimmer Back Office Features](https://www.getskimmer.com/product/backoffice) — Vendor-produced feature page.
- [PoolBrain vs Skimmer Comparison](https://poolcompanysoftware.poolbrain.com/skimmer-vs-poolbrain) — Competitor-produced, specific and detailed despite vendor bias.
- [Pool Dial Software Landscape Analysis](https://www.pooldial.com/resources/articles/business/pool-service-software-landscape) — Third-party analysis; AI adoption stats.
- [Drizzle vs Prisma 2026](https://www.bytebase.com/blog/drizzle-vs-prisma/) — Bundle size, serverless compatibility, Supabase pooler notes.
- [Mapbox vs Google Maps 2026](https://radar.com/blog/mapbox-vs-google-maps-api) — Pricing, waypoint limits.
- [Langelier Saturation Index Inaccuracies — CPO Class](https://cpoclass.com/langelier-saturation-index/) — CYA correction, formula accuracy issues.
- [Comparing QuickBooks Integrations in Field Service — Lexul](https://www.lexul.com/comparing-10-quickbooks-integrations-in-field-service-software/) — Double-entry, sync direction issues.
- [Multi-Tenant SaaS Architecture Next.js](https://vladimirsiedykh.com/blog/saas-architecture-patterns-nextjs) — Multi-tenancy patterns.
- [Supabase Realtime with Next.js](https://supabase.com/docs/guides/realtime/realtime-with-nextjs) — Official Realtime patterns.
- [Building Offline-First React Apps 2025](https://emirbalic.com/building-offline-first-react-apps-in-2025-pwa-rsc-service-workers/) — PWA + RSC offline patterns.
- [AWS Multi-Tenant Data Isolation Prescriptive Guidance](https://docs.aws.amazon.com/prescriptive-guidance/latest/saas-multitenant-api-access-authorization/introduction.html) — RLS isolation patterns.

### Tertiary (LOW confidence — needs validation)
- Pricing band suggestion ($99/$199/$349) — Inferred from Skimmer churn data and per-pool model analysis. Not validated with real pool company owners. Must validate before finalizing.
- Pool company AI adoption willingness — 16% active AI use from Skimmer's survey; extrapolation to future adoption is speculative.

---
*Research completed: 2026-03-03*
*Ready for roadmap: yes*
