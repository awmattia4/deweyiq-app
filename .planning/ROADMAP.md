# Roadmap: Pool Company Management SaaS

## Overview

Eleven phases that build the platform from the ground up, ordered by hard technical dependencies. Foundation (auth, schema, multi-tenancy, offline architecture) ships first because retrofitting any of these is a rewrite. Customer data model comes second because every field operation needs to know what pool it is servicing. Core field tech app is the daily driver and the source of all service records — it ships before billing, reporting, or AI because those downstream phases depend on the records it generates. Office dispatch, work orders, and billing follow in sequence, each unblocked by the previous. The customer portal and reporting dashboards surface existing data once it is stable and real. Smart AI features close out the roadmap because they require accumulated operational data to be useful rather than theatrical.

## Phases

**Phase Numbering:**
- Integer phases (1, 2, 3): Planned milestone work
- Decimal phases (2.1, 2.2): Urgent insertions (marked with INSERTED)

Decimal phases appear between their surrounding integers in numeric order.

- [x] **Phase 1: Foundation** - Auth, database schema with multi-tenant RLS, and offline PWA shell — every other phase depends on this (completed 2026-03-05)
- [x] **Phase 2: Customer & Pool Data Model** - Customer CRM, pool profiles, equipment tracking, and service history store (completed 2026-03-06)
- [x] **Phase 3: Field Tech App** - The daily-driver mobile app — route view, service logging, chemistry, checklists, photos, offline sync (completed 2026-03-08)
- [x] **Phase 4: Scheduling & Routing** - Route builder, recurring schedules, live route progress, and one-click route optimization (completed 2026-03-09)
- [ ] **Phase 5: Office Operations & Dispatch** - Real-time dispatch board, automated service reports, and customer notifications
- [ ] **Phase 6: Work Orders & Quoting** - Repair work orders, professional quotes, customer approval, and invoice conversion
- [ ] **Phase 7: Billing & Payments** - Invoicing, Stripe AutoPay/ACH, dunning, QuickBooks bi-directional sync, and built-in accounting
- [ ] **Phase 8: Customer Portal** - Full self-service portal — service history, invoice payment, service requests, and messaging
- [ ] **Phase 9: Reporting & Team Analytics** - Owner dashboards, technician scorecards, chemical profitability, and financial reporting
- [ ] **Phase 10: Smart Features & AI** - AI route optimization, predictive chemistry alerts, and automated workload balancing
- [ ] **Phase 11: Subscription Billing** - Stripe subscription billing with tiered pricing, checkout, billing management UI, usage enforcement, and failed payment handling

## Phase Details

### Phase 1: Foundation
**Goal**: The platform infrastructure exists — users can authenticate with roles, every table is multi-tenant from day one, and the PWA shell is installable with offline sync ready
**Depends on**: Nothing (first phase)
**Requirements**: AUTH-01, AUTH-02, AUTH-03, AUTH-04, AUTH-05, AUTH-06
**Success Criteria** (what must be TRUE):
  1. A user can sign up, log in, and remain logged in across browser refreshes and device restarts
  2. A user can reset their forgotten password via an email link
  3. An owner can invite a team member and assign them a role (office, tech, customer); that user receives an invite email and can activate their account
  4. Each role sees only what it is permitted to see — a tech cannot access the office dashboard, a customer cannot see another customer's data, and cross-org resource access returns 403
  5. The app is installable as a PWA on an iPhone and Android device, loads the shell offline, and queues any writes made without connectivity for automatic sync on reconnect
**Plans**: 6 plans

Plans:
- [ ] 01-01-PLAN.md — Project scaffolding: Next.js 16, Tailwind v4 design system, shadcn/ui, Serwist PWA config, Drizzle ORM, Supabase client utilities
- [ ] 01-02-PLAN.md — Database schema: Drizzle schema with multi-tenant RLS policies, .rls() transaction wrapper, Custom Access Token Hook, org-creation trigger
- [ ] 01-03-PLAN.md — Auth system: sign-up with org creation, login, Google OAuth, password reset, team invite flow, customer portal login
- [ ] 01-04-PLAN.md — Offline infrastructure: Dexie IndexedDB schema, sync queue with retry/backoff, route prefetch stub, online status hooks, offline banner, sync status icon
- [ ] 01-05-PLAN.md — Role-based app shell: proxy.ts route guards, role-aware sidebar, header with sync icon, portal shell, prefetch wiring
- [ ] 01-06-PLAN.md — Landing pages and verification: role landing pages with real data, skeleton screens, Phase 1 human verification checkpoint

### Phase 2: Customer & Pool Data Model
**Goal**: Office staff can create and manage the full customer record — contact info, pool profiles, equipment, and access notes — which becomes the shared data backbone for every downstream phase
**Depends on**: Phase 1
**Requirements**: CUST-01, CUST-02, CUST-03, CUST-04, CUST-05, CUST-06
**Success Criteria** (what must be TRUE):
  1. Office staff can create a customer with name, address, phone, email, gate codes, and access notes, and find them instantly via search
  2. Office staff can add one or more pool profiles to a customer (volume, surface type, sanitizer type, special notes) and a distinct spa or fountain as a separate body of water with its own configuration
  3. Office staff can log equipment per pool (pump, filter, heater — brand, model, install date) and see a full equipment service history
  4. A customer's profile page shows complete service history — every visit, reading, photo, and checklist — in chronological order
  5. Office staff can filter the customer list by name, address, assigned route, or account status and get results in under one second
**Plans**: 4 plans

Plans:
- [ ] 02-01-PLAN.md — Database schema: customers, pools, equipment, service_visits tables with RLS, enums, relations, deps install
- [ ] 02-02-PLAN.md — Customer list page: TanStack Table with search/filter, Add Customer dialog, sidebar nav activation
- [ ] 02-03-PLAN.md — Customer profile: tabbed layout (Overview/Pools/Equipment/History), inline edit, pool and equipment CRUD
- [ ] 02-04-PLAN.md — Service history timeline and Phase 2 end-to-end verification checkpoint

### Phase 3: Field Tech App
**Goal**: A field technician can complete an entire service stop — read the route, navigate, log chemistry, check off tasks, take photos, and mark complete — from their phone in 60 seconds for routine stops, even without cell signal
**Depends on**: Phase 2
**Requirements**: FIELD-01, FIELD-02, FIELD-03, FIELD-04, FIELD-05, FIELD-06, FIELD-07, FIELD-08, FIELD-09, FIELD-10, FIELD-11, FIELD-12, FIELD-13
**Success Criteria** (what must be TRUE):
  1. A tech opens the app and immediately sees today's ordered stop list with the pool address, customer name, and service notes — no setup required
  2. A tech can tap a stop and navigate to it via Apple Maps or Google Maps with one tap
  3. A tech can enter all chemistry readings (free chlorine, pH, alkalinity, CYA, TDS, calcium hardness, phosphates, salt), see the LSI calculated instantly, and see recommended chemical doses with amounts — all without internet connection
  4. A tech can complete a per-customer service checklist (skim, brush, vacuum, empty baskets, backwash) and capture photos with one-handed taps optimized for wet hands in bright sunlight
  5. A tech can mark a stop complete with one tap and the branded service report is auto-generated and queued for delivery — the entire routine stop workflow takes no more than 60 seconds of app interaction
  6. All data entered without signal is saved locally and syncs to the server automatically when connectivity returns — no data is lost if the app is closed or the phone dies mid-route
**Plans**: 8 plans

Plans:
- [ ] 03-01-PLAN.md — Schema foundation: extend service_visits, create route_days/checklists/visit_photos/chemical_products tables, Dexie v2, npm deps
- [ ] 03-02-PLAN.md — Chemistry engine (TDD): CSI/LSI calculator with CYA correction, product-aware dosing engine, target ranges by sanitizer type
- [ ] 03-03-PLAN.md — Route view: daily stop list with info cards, progress bar, drag-to-reorder, map navigation, offline prefetch
- [ ] 03-04-PLAN.md — Stop workflow + chemistry tab: tabbed page shell, chemistry grid with live LSI/dosing, visit draft management
- [ ] 03-05-PLAN.md — Service checklist tab: template + customer overrides, mark-all-complete, per-task notes
- [ ] 03-06-PLAN.md — Photos + notes tabs: camera capture with compression, offline blob queue, Supabase Storage upload, notes textarea
- [ ] 03-07-PLAN.md — Stop completion: summary confirmation modal, completeStop action, service report HTML, Resend email Edge Function
- [ ] 03-08-PLAN.md — Field UX polish: 44px tap targets, high-contrast OKLCH, 3-tap rule, tech settings, end-to-end verification

### Phase 4: Scheduling & Routing
**Goal**: Office staff can build routes, set recurring service schedules, and optimize route order in one click — while seeing real-time tech progress on a live map
**Depends on**: Phase 3
**Requirements**: SCHED-01, SCHED-02, SCHED-03, SCHED-04, SCHED-05, SCHED-06
**Success Criteria** (what must be TRUE):
  1. Office staff can assign customer stops to a tech's route and set a service frequency (weekly, bi-weekly, monthly, or custom); the system auto-generates future stops without further manual entry
  2. Office staff can drag and drop stops to reorder a route and the map updates instantly to reflect the new order
  3. Office staff can click "Optimize Route" and the system reorders stops to minimize drive time using rule-based geographic optimization
  4. Office staff can see a live map showing each tech's current position, which stops are complete, and which are upcoming — updating without page refresh
**Plans**: 7 plans

Plans:
- [ ] 04-01-PLAN.md — Schema foundation: route_stops, schedule_rules, holidays tables with RLS, geocoding columns on customers, maplibre-gl + react-map-gl install, tech app API migration to route_stops, sidebar activation
- [ ] 04-02-PLAN.md — Recurring schedules: schedule rule CRUD, holiday calendar management, rolling 4-week Edge Function generator, placeholder pages
- [ ] 04-03-PLAN.md — Route builder core: split-view layout (stop list + map), tech tabs, day-of-week picker, drag-and-drop reorder, lock-stop toggle, MapLibre route line
- [ ] 04-04-PLAN.md — Route builder assignment: unassigned customer panel, multi-container DnD (drag to assign), multi-select bulk assign, copy/duplicate route
- [ ] 04-05-PLAN.md — Live dispatch map: MapLibre map with tech GPS positions (Supabase Realtime Broadcast), stop markers with popup cards, route lines, tech filter
- [ ] 04-06-PLAN.md — Route optimization: OpenRouteService API integration, locked-stop support, before/after preview with drive time comparison, apply/cancel
- [ ] 04-07-PLAN.md — Phase 4 end-to-end human verification checkpoint

### Phase 5: Office Operations & Dispatch
**Goal**: The office stays in the loop automatically — service reports are sent to customers the moment a stop completes, pre-arrival notifications go out before techs arrive, and the alerts dashboard surfaces problems that need human attention
**Depends on**: Phase 4
**Requirements**: NOTIF-01, NOTIF-02, NOTIF-03, NOTIF-04
**Success Criteria** (what must be TRUE):
  1. A customer receives an SMS or email notification before their tech arrives (configurable lead time)
  2. A customer receives a branded email with a link to their service report within minutes of stop completion, without office staff doing anything manually
  3. Office staff can see an alerts dashboard that surfaces missed stops, overdue invoices, and declining chemical trends — not every reading, only actionable exceptions
  4. The company owner can configure which alert types are enabled and whether they route to email, in-app notification, or SMS per alert category
  5. The company owner can configure which chemistry readings and checklist tasks are required for techs, and set minimum data thresholds for stop completion
**Plans**: 6 plans

Plans:
- [ ] 05-01-PLAN.md — Schema foundation: alerts + org_settings tables with RLS, customers.notifications_enabled column, route_stops.pre_arrival_sent_at column, send-pre-arrival Edge Function
- [ ] 05-02-PLAN.md — Service report email: React Email branded template, signed JWT report tokens, public /api/reports/[token] route, completeStop rewire
- [ ] 05-03-PLAN.md — Pre-arrival notifications: sendPreArrivalNotifications server action, Start Route button on tech view, idempotency via pre_arrival_sent_at
- [ ] 05-04-PLAN.md — Alerts dashboard: alert generation (missed stops, declining chemistry, incomplete data), feed with filter chips, dismiss/snooze, sidebar badge, dashboard summary card
- [ ] 05-05-PLAN.md — Company settings + service requirements: notification channel toggles, required chemistry per sanitizer type, required checklist tasks, warn-but-allow enforcement in completeStop
- [ ] 05-06-PLAN.md — Phase 5 end-to-end human verification checkpoint

### Phase 6: Work Orders & Quoting
**Goal**: Office and field staff can create, quote, approve, and dispatch repair jobs — and completed jobs generate invoices automatically
**Depends on**: Phase 5
**Requirements**: WORK-01, WORK-02, WORK-03, WORK-04, WORK-05, WORK-06
**Success Criteria** (what must be TRUE):
  1. An office staff member or tech can create a work order for a repair job attached to a customer, with photos, notes, parts, and labor line items
  2. Office staff can generate a professional quote with line items and send it to a customer; the customer can approve it via a link in their email or through the portal
  3. An approved quote automatically converts to a work order with no manual re-entry
  4. When a work order is marked complete, office staff can convert it to an invoice with one click
**Plans**: 8 plans

Plans:
- [ ] 06-01-PLAN.md — Schema foundation: all Phase 6 tables (work_orders, line items, parts catalog, templates, quotes, invoices), org_settings extensions, @react-pdf/renderer install, core WO + catalog server actions
- [ ] 06-02-PLAN.md — WO office UI: work order list page with filters, WO detail page with timeline/status controls, create dialog, sidebar nav
- [ ] 06-03-PLAN.md — Tech field flow: flag-issue sheet in stop workflow (~10s flow), WO arrival/completion with photos/notes/hours
- [ ] 06-04-PLAN.md — Line items + catalog: line item editor with catalog search/auto-fill, parts catalog manager in settings, WO templates in settings, Phase 6 org settings fields
- [ ] 06-05-PLAN.md — Quote builder: quote PDF with @react-pdf/renderer, email delivery via Resend with PDF attachment, quote token system, versioning
- [ ] 06-06-PLAN.md — Customer quote approval: public approval page (no auth), approve/decline/request-changes flow, approved-to-WO auto-conversion
- [ ] 06-07-PLAN.md — Invoice conversion: WO-to-invoice preparation, invoice PDF, atomic invoice numbering, multi-WO invoicing, invoice list
- [ ] 06-08-PLAN.md — Phase 6 end-to-end human verification checkpoint

### Phase 7: Billing & Payments
**Goal**: The company can invoice customers across multiple billing models, collect payments automatically via Stripe, handle failed payments gracefully, sync with QuickBooks, and run financial reports — all without leaving the platform
**Depends on**: Phase 6
**Requirements**: BILL-01, BILL-02, BILL-03, BILL-04, BILL-05, BILL-06, BILL-07, BILL-08, BILL-09
**Success Criteria** (what must be TRUE):
  1. Office staff can generate a single invoice or batch-invoice all customers for a period, using per-stop, monthly flat rate, plus-chemicals, or custom line item billing models
  2. A customer on AutoPay is automatically charged on invoice generation via saved card or ACH — and the invoice is only marked paid after Stripe's webhook confirms settlement (not at authorization)
  3. Failed payments trigger a configurable dunning sequence (retry schedule + reminder emails) without any manual office action
  4. Invoices, payments, and customers sync bidirectionally with QuickBooks Online — a payment recorded in QBO reflects in the platform and vice versa
  5. The company can add a credit card surcharge/convenience fee that is disclosed to customers and passed through automatically on card payments
  6. Office staff can export financial data for tax prep and view P&L, revenue by customer, and expense reports within the platform
**Plans**: TBD

Plans:
- [ ] 07-01: Invoice model — multiple billing models, line items, bulk generation, PDF output
- [ ] 07-02: Stripe integration — credit card + ACH AutoPay, saved payment methods, Stripe Customer Portal
- [ ] 07-03: Stripe webhook handler — payment_intent.succeeded, payment_intent.payment_failed, charge.failed (ACH async)
- [ ] 07-04: Dunning engine — configurable retry schedule, automated reminder emails, failed payment notifications
- [ ] 07-05: QuickBooks Online bi-directional sync — OAuth, entity mapping, webhook handler, conflict resolution
- [ ] 07-06: Surcharging — credit card convenience fee calculation, disclosure, passthrough
- [ ] 07-07: Built-in accounting and reporting — P&L, expense tracking, revenue reports, tax export

### Phase 8: Customer Portal
**Goal**: Customers can view their entire service history, pay invoices, request jobs, and message the company — all from a branded self-service portal on any device
**Depends on**: Phase 7
**Requirements**: PORT-01, PORT-02, PORT-03, PORT-04, PORT-05, PORT-06
**Success Criteria** (what must be TRUE):
  1. A customer can log into the portal and view every service visit — reports, chemical readings, photos, and checklist results — for their pool
  2. A customer can see all their invoices, pay outstanding balances by card or ACH, and update their saved payment method without calling the office
  3. A customer can submit a request for a one-off service (green pool cleanup, opening/closing, repair) from the portal; the office receives the request and can dispatch a work order
  4. A customer can send a message to the company through the portal and receive a reply in the same thread
  5. The portal displays the company's logo and brand colors — not generic platform branding
**Plans**: TBD

Plans:
- [ ] 08-01: Portal shell — authenticated customer route group, mobile-optimized layout, company branding
- [ ] 08-02: Service history view — visit timeline, reports, chemical readings, photo gallery per pool
- [ ] 08-03: Invoice and payment UI — invoice list, Stripe payment flow, payment method management
- [ ] 08-04: Service requests — one-off job request form, work order creation trigger, status tracking
- [ ] 08-05: Customer messaging — threaded message UI, office inbox, reply from office dashboard

### Phase 9: Reporting & Team Analytics
**Goal**: The owner can see the full financial and operational picture — revenue, team performance, chemical costs, and profitability — without exporting to a spreadsheet
**Depends on**: Phase 8
**Requirements**: REPT-01, REPT-02, REPT-03, REPT-04, REPT-05, REPT-06
**Success Criteria** (what must be TRUE):
  1. The owner can view total revenue, revenue by customer, and revenue by tech for any time period on a single dashboard
  2. The owner can see route completion rates — how many stops were completed on schedule vs. missed — per tech and company-wide
  3. The owner can view each tech's pay and commission for any pay period, with a payroll export ready for ADP or Gusto
  4. The owner can see technician scorecards showing stops per day, average stop time, chemical cost per pool, and completion rate — and compare techs side by side
  5. The owner can see which pools are unprofitable based on chemical spend vs. recurring service revenue, with unprofitable pools flagged automatically
**Plans**: TBD

Plans:
- [ ] 09-01: Owner revenue dashboard — total, by customer, by tech, time-period filter, trend charts
- [ ] 09-02: Operational metrics — route completion rates, missed stop counts, on-time percentage per tech
- [ ] 09-03: Technician pay and commission — per-stop rates, upsell commission, pay period summary, payroll export
- [ ] 09-04: Technician scorecards — stops/day, avg stop time, chemical cost efficiency, completion rate, comparison view
- [ ] 09-05: Chemical profitability analysis — chemical spend per pool, revenue per pool, margin calculation, flagging unprofitable pools

### Phase 10: Smart Features & AI
**Goal**: The platform uses accumulated operational data to optimize routes with ML, predict chemistry problems before they happen, and automatically balance technician workloads — making the system actively smarter the longer it runs
**Depends on**: Phase 9
**Requirements**: SMART-01, SMART-02, SMART-03, SCHED-07, SCHED-08
**Success Criteria** (what must be TRUE):
  1. The system recommends chemical dosing that accounts for weather conditions and each pool's specific service history — not just current readings and generic tables
  2. Office staff can see a predictive alert for a pool whose chemistry readings are trending toward imbalance, triggered before the problem occurs (requires 3+ months of per-pool history)
  3. The system can auto-schedule recurring stops and distribute work across techs based on service level rules, tech availability, and geographic clustering — producing a ready-to-approve route plan
  4. The AI route optimizer produces measurably shorter drive routes than the rule-based one-click optimizer, with before/after drive time comparison visible to the office
**Plans**: TBD

Plans:
- [ ] 10-01: Enhanced smart dosing — weather API integration, per-pool history weighting, sanitizer-type-specific model
- [ ] 10-02: Predictive chemistry alerts — linear regression on per-pool reading history, alert threshold validation, CPO-reviewed thresholds
- [ ] 10-03: Automated workload balancing — auto-schedule engine based on service level rules, tech availability, and geography
- [ ] 10-04: ML route optimization — algorithm selection (OSRM vs. Google ROA), Upstash QStash async job, before/after comparison UI
- [ ] 10-05: Smart customer creation — intelligent suggestions when adding pools/equipment (pool+spa auto-notes, service frequency recommendations, common equipment combos, gate code reminders)

### Phase 11: Subscription Billing
**Goal**: Pool companies pay for using the PoolCo SaaS platform via tiered subscriptions based on pool count — Stripe handles checkout, payment methods, and subscription lifecycle; the app enforces tier limits and handles failed payments gracefully
**Depends on**: Phase 1 (auth, multi-tenant RLS, org model)
**Requirements**: SUB-01, SUB-02, SUB-03, SUB-04, SUB-05, SUB-06, SUB-07, SUB-08, SUB-09, SUB-10
**Success Criteria** (what must be TRUE):
  1. A new org starts with a 14-day free trial (no credit card required) and sees a trial banner counting down
  2. An owner can select a plan (Starter/Pro/Enterprise, monthly or annual) and complete checkout via Stripe — subscription activates immediately
  3. An owner can view their current plan, pool usage, invoice history, and manage payment methods from /billing
  4. An owner can cancel their subscription (takes effect at period end) and reactivate before period end
  5. Pool creation is soft-blocked when the tier's pool limit is exceeded (7-day grace period, then blocked with upgrade prompt)
  6. Failed payments trigger a 7-day grace period, after which the account enters read-only mode with a full-screen overlay guiding the owner to fix billing
  7. Successful payment after restriction lifts all restrictions automatically
**Plans**: 7 plans

Plans:
- [ ] 11-01-PLAN.md — Schema + Stripe setup: subscriptions table with enums, src/lib/stripe.ts client singleton, tier config constants
- [ ] 11-02-PLAN.md — Checkout & onboarding: createCheckoutSession, trial creation on signup, success/cancel pages
- [ ] 11-03-PLAN.md — Stripe webhook handler: /api/webhooks/stripe route handling 6 event types (checkout, subscription lifecycle, invoices, trial ending)
- [ ] 11-04-PLAN.md — Billing management UI: /billing page with plan card, usage bar, invoice history, cancel/reactivate, trial + restricted banners
- [ ] 11-05-PLAN.md — Usage tracking & tier enforcement: pool count tracking, limit checking with grace periods, upgrade prompt dialog
- [ ] 11-06-PLAN.md — Failed payment & dunning: grace period management, account restriction (read-only mode), recovery flow
- [ ] 11-07-PLAN.md — End-to-end verification checkpoint: 7 manual test scenarios with Stripe test mode

## Progress

**Execution Order:**
Phases execute in numeric order: 1 → 2 → 3 → 4 → 5 → 6 → 7 → 8 → 9 → 10 → 11

| Phase | Plans Complete | Status | Completed |
|-------|----------------|--------|-----------|
| 1. Foundation | 0/6 | Complete    | 2026-03-05 |
| 2. Customer & Pool Data Model | 0/4 | Complete    | 2026-03-06 |
| 3. Field Tech App | 8/8 | Complete    | 2026-03-08 |
| 4. Scheduling & Routing | 7/7 | Complete | 2026-03-09 |
| 5. Office Operations & Dispatch | 0/6 | Not started | - |
| 6. Work Orders & Quoting | 0/8 | Not started | - |
| 7. Billing & Payments | 0/7 | Not started | - |
| 8. Customer Portal | 0/5 | Not started | - |
| 9. Reporting & Team Analytics | 0/5 | Not started | - |
| 10. Smart Features & AI | 0/4 | Not started | - |
| 11. Subscription Billing | 0/7 | Not started | - |
