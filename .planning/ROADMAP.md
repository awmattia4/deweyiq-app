# Roadmap: Pool Company Management SaaS

## Overview

Ten phases that build the platform from the ground up, ordered by hard technical dependencies. Foundation (auth, schema, multi-tenancy, offline architecture) ships first because retrofitting any of these is a rewrite. Customer data model comes second because every field operation needs to know what pool it is servicing. Core field tech app is the daily driver and the source of all service records — it ships before billing, reporting, or AI because those downstream phases depend on the records it generates. Office dispatch, work orders, and billing follow in sequence, each unblocked by the previous. The customer portal and reporting dashboards surface existing data once it is stable and real. Smart AI features close out the roadmap because they require accumulated operational data to be useful rather than theatrical.

## Phases

**Phase Numbering:**
- Integer phases (1, 2, 3): Planned milestone work
- Decimal phases (2.1, 2.2): Urgent insertions (marked with INSERTED)

Decimal phases appear between their surrounding integers in numeric order.

- [ ] **Phase 1: Foundation** - Auth, database schema with multi-tenant RLS, and offline PWA shell — every other phase depends on this
- [ ] **Phase 2: Customer & Pool Data Model** - Customer CRM, pool profiles, equipment tracking, and service history store
- [ ] **Phase 3: Field Tech App** - The daily-driver mobile app — route view, service logging, chemistry, checklists, photos, offline sync
- [ ] **Phase 4: Scheduling & Routing** - Route builder, recurring schedules, live route progress, and one-click route optimization
- [ ] **Phase 5: Office Operations & Dispatch** - Real-time dispatch board, automated service reports, and customer notifications
- [ ] **Phase 6: Work Orders & Quoting** - Repair work orders, professional quotes, customer approval, and invoice conversion
- [ ] **Phase 7: Billing & Payments** - Invoicing, Stripe AutoPay/ACH, dunning, QuickBooks bi-directional sync, and built-in accounting
- [ ] **Phase 8: Customer Portal** - Full self-service portal — service history, invoice payment, service requests, and messaging
- [ ] **Phase 9: Reporting & Team Analytics** - Owner dashboards, technician scorecards, chemical profitability, and financial reporting
- [ ] **Phase 10: Smart Features & AI** - AI route optimization, predictive chemistry alerts, and automated workload balancing

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
**Plans**: TBD

Plans:
- [ ] 01-01: Project scaffolding — Next.js 15/16, TypeScript, Tailwind v4, shadcn/ui, Vercel deployment
- [ ] 01-02: Supabase project — Postgres schema with org_id on all tables, RLS policies, multi-tenant isolation tests
- [ ] 01-03: Auth system — Supabase Auth, JWT multi-role middleware, invite flow, password reset
- [ ] 01-04: PWA offline shell — Serwist service worker, Dexie.js IndexedDB schema, Background Sync outbound queue
- [ ] 01-05: Role-based routing — Next.js App Router route groups for tech, office, portal, and protected middleware

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
**Plans**: TBD

Plans:
- [ ] 02-01: Customer schema and CRM UI — customer model, search, filter, create/edit forms
- [ ] 02-02: Pool and body-of-water profiles — multi-pool per customer, surface/sanitizer/volume config
- [ ] 02-03: Equipment tracking — equipment records per pool, install dates, service history log
- [ ] 02-04: Service history view — unified timeline of all visits, readings, photos per customer profile

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
**Plans**: TBD

Plans:
- [ ] 03-01: Tech route view — daily stop list, ordered stops, map view, navigation link
- [ ] 03-02: Chemistry readings form — all parameters, LSI calculator with CYA correction, sanitizer-type-aware validation
- [ ] 03-03: Chemical dosing engine — dosing recommendations by reading, pool volume, sanitizer type, and target ranges
- [ ] 03-04: Service checklist — customizable per customer/service type, one-handed UX
- [ ] 03-05: Photo and notes capture — camera integration, client-side compression, Supabase Storage upload
- [ ] 03-06: Stop completion flow — one-tap complete, service report auto-generation, auto-email trigger
- [ ] 03-07: Offline-first sync — Dexie.js write queue, Serwist Background Sync, idempotent server merge
- [ ] 03-08: Field UX polish — 44px tap targets, high-contrast OKLCH palette, 3-tap rule for most-common actions

### Phase 4: Scheduling & Routing
**Goal**: Office staff can build routes, set recurring service schedules, and optimize route order in one click — while seeing real-time tech progress on a live map
**Depends on**: Phase 3
**Requirements**: SCHED-01, SCHED-02, SCHED-03, SCHED-04, SCHED-05, SCHED-06
**Success Criteria** (what must be TRUE):
  1. Office staff can assign customer stops to a tech's route and set a service frequency (weekly, bi-weekly, monthly, or custom); the system auto-generates future stops without further manual entry
  2. Office staff can drag and drop stops to reorder a route and the map updates instantly to reflect the new order
  3. Office staff can click "Optimize Route" and the system reorders stops to minimize drive time using rule-based geographic optimization
  4. Office staff can see a live map showing each tech's current position, which stops are complete, and which are upcoming — updating without page refresh
**Plans**: TBD

Plans:
- [ ] 04-01: Route builder — assign stops to techs, drag-and-drop reorder, calendar view
- [ ] 04-02: Recurring schedules — frequency rules, auto-generation of future stops via pg_cron/Edge Functions
- [ ] 04-03: Rule-based route optimizer — one-click geographic stop reordering (Mapbox Optimization API)
- [ ] 04-04: Live dispatch board — Supabase Realtime WebSocket, tech GPS position polling, stop status overlay on Mapbox map

### Phase 5: Office Operations & Dispatch
**Goal**: The office stays in the loop automatically — service reports are sent to customers the moment a stop completes, pre-arrival notifications go out before techs arrive, and the alerts dashboard surfaces problems that need human attention
**Depends on**: Phase 4
**Requirements**: NOTIF-01, NOTIF-02, NOTIF-03, NOTIF-04
**Success Criteria** (what must be TRUE):
  1. A customer receives an SMS or email notification before their tech arrives (configurable lead time)
  2. A customer receives a branded email with a link to their service report within minutes of stop completion, without office staff doing anything manually
  3. Office staff can see an alerts dashboard that surfaces missed stops, overdue invoices, and declining chemical trends — not every reading, only actionable exceptions
  4. The company owner can configure which alert types are enabled and whether they route to email, in-app notification, or SMS per alert category
**Plans**: TBD

Plans:
- [ ] 05-01: Pre-arrival notifications — SMS/email trigger before tech arrival (Resend + Twilio), configurable lead time
- [ ] 05-02: Post-service report delivery — branded email with service report link, React Email template, Resend send
- [ ] 05-03: Alerts dashboard — missed stop detection, overdue invoice query, chemical trend flag, in-app alert UI
- [ ] 05-04: Notification configuration — per-company alert settings, channel routing (email/SMS/in-app), per-customer opt-in

### Phase 6: Work Orders & Quoting
**Goal**: Office and field staff can create, quote, approve, and dispatch repair jobs — and completed jobs generate invoices automatically
**Depends on**: Phase 5
**Requirements**: WORK-01, WORK-02, WORK-03, WORK-04, WORK-05, WORK-06
**Success Criteria** (what must be TRUE):
  1. An office staff member or tech can create a work order for a repair job attached to a customer, with photos, notes, parts, and labor line items
  2. Office staff can generate a professional quote with line items and send it to a customer; the customer can approve it via a link in their email or through the portal
  3. An approved quote automatically converts to a work order with no manual re-entry
  4. When a work order is marked complete, office staff can convert it to an invoice with one click
**Plans**: TBD

Plans:
- [ ] 06-01: Work order model — create, assign, status workflow, attach to customer/pool
- [ ] 06-02: Work order details — photos, notes, parts list, labor entries, cost tracking
- [ ] 06-03: Quote builder — line-item editor, professional PDF output, email delivery
- [ ] 06-04: Customer quote approval — email link approval, portal approval, approved-to-work-order conversion
- [ ] 06-05: Work order to invoice conversion — one-click invoice generation from completed work order

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

## Progress

**Execution Order:**
Phases execute in numeric order: 1 → 2 → 3 → 4 → 5 → 6 → 7 → 8 → 9 → 10

| Phase | Plans Complete | Status | Completed |
|-------|----------------|--------|-----------|
| 1. Foundation | 0/5 | Not started | - |
| 2. Customer & Pool Data Model | 0/4 | Not started | - |
| 3. Field Tech App | 0/8 | Not started | - |
| 4. Scheduling & Routing | 0/4 | Not started | - |
| 5. Office Operations & Dispatch | 0/4 | Not started | - |
| 6. Work Orders & Quoting | 0/5 | Not started | - |
| 7. Billing & Payments | 0/7 | Not started | - |
| 8. Customer Portal | 0/5 | Not started | - |
| 9. Reporting & Team Analytics | 0/5 | Not started | - |
| 10. Smart Features & AI | 0/4 | Not started | - |
