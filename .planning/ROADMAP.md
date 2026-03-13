# Roadmap: Pool Company Management SaaS

## Overview

Sixteen phases that build the platform from the ground up, ordered by hard technical dependencies. Foundation (auth, schema, multi-tenancy, offline architecture) ships first because retrofitting any of these is a rewrite. Customer data model comes second because every field operation needs to know what pool it is servicing. Core field tech app is the daily driver and the source of all service records — it ships before billing, reporting, or AI because those downstream phases depend on the records it generates. Office dispatch, work orders, and billing follow in sequence, each unblocked by the previous. The customer portal and reporting dashboards surface existing data once it is stable and real. Smart AI features follow, then the platform becomes a complete QuickBooks replacement — native payroll with direct deposit and tax filing, full double-entry accounting with bank reconciliation, and payment reconciliation from Stripe Connect or QBO. Projects & Renovations adds full construction/remodel project management with deposits, progress billing, permits, subcontractors, and a dedicated tech field experience. Service Agreements formalizes recurring contracts with e-signature. Intelligent Billing Automation adds smart auto-invoice generation — techs log work, the system prices it based on per-customer rates and billing profiles, with bulk fee application, arrears billing, and anomaly detection. Subscription billing closes out the roadmap as it gates the business model but has no feature dependencies beyond auth.

## Phases

**Phase Numbering:**
- Integer phases (1, 2, 3): Planned milestone work
- Decimal phases (2.1, 2.2): Urgent insertions (marked with INSERTED)

Decimal phases appear between their surrounding integers in numeric order.

- [x] **Phase 1: Foundation** - Auth, database schema with multi-tenant RLS, and offline PWA shell — every other phase depends on this (completed 2026-03-05)
- [x] **Phase 2: Customer & Pool Data Model** - Customer CRM, pool profiles, equipment tracking, and service history store (completed 2026-03-06)
- [x] **Phase 3: Field Tech App** - The daily-driver mobile app — route view, service logging, chemistry, checklists, photos, offline sync (completed 2026-03-08)
- [x] **Phase 4: Scheduling & Routing** - Route builder, recurring schedules, live route progress, and one-click route optimization (completed 2026-03-09)
- [x] **Phase 5: Office Operations & Dispatch** - Real-time dispatch board, automated service reports, and customer notifications (completed 2026-03-10)
- [x] **Phase 6: Work Orders & Quoting** - Repair work orders, professional quotes, customer approval, and invoice conversion (completed 2026-03-11)
- [x] **Phase 7: Billing & Payments** - Invoicing, Stripe AutoPay/ACH, dunning, QuickBooks bi-directional sync, and built-in accounting (completed 2026-03-13)
- [ ] **Phase 8: Customer Portal** - Full self-service portal — service history, invoice payment, service requests, and messaging
- [ ] **Phase 9: Reporting & Team Analytics** - Owner dashboards, technician scorecards, chemical profitability, and financial reporting
- [ ] **Phase 10: Smart Features & AI** - AI route optimization, predictive chemistry alerts, and automated workload balancing
- [ ] **Phase 11: Payroll, Team Management & Full Accounting** - Native payroll (direct deposit, checks, tax filing, W-2/1099), time tracking, PTO, certifications, full double-entry accounting, bank reconciliation via Plaid, payment reconciliation, financial statements — complete QuickBooks replacement
- [ ] **Phase 12: Projects & Renovations** - Full project management for new pool construction, renovations, and remodels — lead pipeline, site surveys, multi-tier proposals, deposits, progress billing, permits, subcontractors, material procurement, change orders, inspections, warranties, and a dedicated tech project mode with task checklists, time tracking, and photo documentation
- [ ] **Phase 13: Truck Inventory & Shopping Lists** - Per-tech truck inventory with auto-decrement, shopping lists with full procurement lifecycle, purchasing dashboard, chemical usage tracking, and "What to Bring" pre-route summaries
- [ ] **Phase 14: Service Agreements & Contracts** - Recurring service agreements with e-signature, auto-schedule/billing setup, agreement lifecycle (pause/resume/cancel/renew), customer portal access, and compliance tracking
- [ ] **Phase 15: Intelligent Billing Automation** - Per-customer per-visit rates, smart pricing suggestions, bulk shop fee application, billing anomaly detection, and invoice generation preview
- [ ] **Phase 16: Subscription Billing** - Stripe subscription billing with tiered pricing, checkout, billing management UI, usage enforcement, and failed payment handling

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
**Goal**: The company can invoice customers across multiple billing models, collect payments via Stripe Connect (company's own Stripe) or QuickBooks Payments, handle failed payments gracefully, sync bidirectionally with QuickBooks Online, and run built-in financial reports — companies choose their payment stack or use both
**Depends on**: Phase 6
**Requirements**: BILL-01, BILL-02, BILL-03, BILL-04, BILL-05, BILL-06, BILL-07, BILL-08, BILL-09, BILL-10
**Success Criteria** (what must be TRUE):
  1. Office staff can generate a single invoice or batch-invoice all customers for a period, using per-stop, monthly flat rate, plus-chemicals, or custom line item billing models
  2. A pool company can connect their Stripe account via Stripe Connect in under 2 minutes — guided onboarding, KYC handled by Stripe
  3. A customer on AutoPay is automatically charged on invoice generation via saved card or ACH — and the invoice is only marked paid after webhook confirms settlement
  4. Failed payments trigger a configurable dunning sequence (retry schedule + reminder emails) without any manual office action
  5. Invoices, payments, and customers sync bidirectionally with QuickBooks Online — a payment recorded in QBO reflects in the platform and vice versa
  6. Companies can use Stripe Connect for direct payment processing, QuickBooks Payments via QBO sync, or both simultaneously — the system handles reconciliation for whichever path is active
  7. The company can add a credit card surcharge/convenience fee per payment method, with legally required disclosure on invoices and payment pages
  8. Office staff can export financial data for tax prep and view P&L, revenue by customer, and expense reports within the platform
**Plans**: 9 plans

Plans:
- [ ] 07-01-PLAN.md — Schema foundation: billing model columns, payment_records + dunning_config tables, Stripe packages, billing model actions, bulk invoice generation
- [ ] 07-02-PLAN.md — Invoice delivery: invoice email template with PDF + pay link, pay token system, SMS Edge Function, quote SMS delivery, batch send
- [ ] 07-03-PLAN.md — Stripe Connect: Stripe singleton, Connect onboarding API routes, payment stack selector, surcharge config with legal disclaimer
- [ ] 07-04-PLAN.md — Payment processing: branded /pay/[token] page, PaymentIntent creation, Stripe webhook handler (succeeded/failed/refunded), manual payment recording
- [ ] 07-05-PLAN.md — AutoPay + dunning: SetupIntent for saving methods, off-session auto-charge, configurable dunning sequence, pg_cron daily scan, dunning email template
- [ ] 07-06-PLAN.md — QBO sync: OAuth2 flow, entity mappers (customer/invoice/payment), real-time push, QBO webhook handler, settings UI
- [ ] 07-07-PLAN.md — Reports + overdue flags: AR aging (30/60/90 day buckets), revenue by customer, P&L, CSV export, overdue balance flags on customer profiles and route stops
- [ ] 07-08-PLAN.md — Customizable templates: notification_templates schema, merge tag engine, template editor UI, retrofit all Phase 5/6/7 send functions, Google review link + custom footer support
- [ ] 07-09-PLAN.md — Phase 7 end-to-end verification checkpoint


### Phase 8: Customer Portal
**Goal**: Customers can view their entire service history, pay invoices, request jobs, and message the company — all from a branded self-service portal on any device
**Depends on**: Phase 7
**Requirements**: PORT-01, PORT-02, PORT-03, PORT-04, PORT-05, PORT-06, PORT-07, PORT-08
**Success Criteria** (what must be TRUE):
  1. A customer can log into the portal and view every service visit — reports, chemical readings, photos, and checklist results — for their pool
  2. A customer can see all their invoices, pay outstanding balances by card or ACH, and update their saved payment method without calling the office
  3. A customer can submit a request for a one-off service (green pool cleanup, opening/closing, repair) from the portal; the office receives the request and can dispatch a work order
  4. A customer can send a message to the company through the portal and receive a reply in the same thread
  5. The portal displays the company's logo and brand colors — not generic platform branding
  6. A customer serviced by multiple companies on the platform can access each company's portal in a branded, isolated context
  7. When a customer leaves one company and joins another, their new portal works independently — old company data is no longer visible but preserved in the company's records
**Plans**: 5 plans

Plans:
- [ ] 08-01-PLAN.md — Portal foundation: magic link auth, subdomain routing, company branding, portal_messages + service_requests schema, multi-org company picker
- [ ] 08-02-PLAN.md — Service history view: per-pool tabs, visit timeline with expandable cards, chemistry display with color coding, photo gallery with lightbox
- [ ] 08-03-PLAN.md — Invoice and payment UI: invoice list with line items, Stripe Elements payment flow, SetupIntent payment method management, contact info editor
- [ ] 08-04-PLAN.md — Service requests: guided multi-step form with photo upload, office request queue, WO creation from request, status tracker
- [ ] 08-05-PLAN.md — Customer messaging: real-time chat via Supabase Realtime Broadcast, office inbox page, customer profile messages tab, unread badges, email notifications

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
**Requirements**: SMART-01, SMART-02, SMART-03, SMART-04, SMART-05, SMART-06, SMART-07, SMART-08, SCHED-07, SCHED-08, NOTIF-05 through NOTIF-34
**Success Criteria** (what must be TRUE):
  1. The system recommends chemical dosing that accounts for weather conditions and each pool's specific service history — not just current readings and generic tables
  2. Office staff can see a predictive alert for a pool whose chemistry readings are trending toward imbalance, triggered before the problem occurs (requires 3+ months of per-pool history)
  3. The system can auto-schedule recurring stops and distribute work across techs based on service level rules, tech availability, and geographic clustering — producing a ready-to-approve route plan
  4. The AI route optimizer produces measurably shorter drive routes than the rule-based one-click optimizer, with before/after drive time comparison visible to the office
  5. When rain or storms are forecasted, the system identifies affected stops and proposes a reschedule plan — office can approve with one click, and affected customers are automatically notified
  6. Techs see weather conditions on their route view — per-stop weather badges (rain, heat, lightning) so they can plan their day
  7. The system finds optimal reschedule windows for weather-displaced stops, considering tech availability, customer preferences, and when the forecast clears
  8. Every significant platform event triggers a notification to the relevant company users (owner/office/tech) via in-app push + email
  9. Every customer-facing notification is delivered via both email AND SMS — pre-arrival, service reports, invoices, payments, quotes, weather delays, WO updates, and portal messages
  10. All notification types are independently toggleable and use customizable templates with merge tags
  11. A customer receives a dynamic ETA for their upcoming service — calculated from the tech's current GPS, remaining stops, historical stop durations, and live drive time — delivered via SMS/email at configurable triggers, auto-updating when tech runs ahead/behind, and visible as a live countdown in the customer portal
  12. The system tracks equipment performance trends per pool — salt system output efficiency, pump pressure, filter PSI, heater temperature delta — surfaces degradation alerts when performance deviates from seasonal baselines, visible on the pool equipment profile and tech stop view
**Plans**: TBD

Plans:
- [ ] 10-01: Enhanced smart dosing — weather API integration, per-pool history weighting, sanitizer-type-specific model
- [ ] 10-02: Predictive chemistry alerts — linear regression on per-pool reading history, alert threshold validation, CPO-reviewed thresholds
- [ ] 10-03: Automated workload balancing — auto-schedule engine based on service level rules, tech availability, and geography
- [ ] 10-04: ML route optimization — algorithm selection (OSRM vs. Google ROA), Upstash QStash async job, before/after comparison UI
- [ ] 10-05: Smart customer creation — intelligent suggestions when adding pools/equipment (pool+spa auto-notes, service frequency recommendations, common equipment combos, gate code reminders)
- [ ] 10-06: Weather-aware scheduling — forecast API integration, auto-reschedule engine for rain/storm days, office approval workflow, optimal reschedule slot finder
- [ ] 10-07: Tech weather alerts — per-stop weather badges on route view (rain, extreme heat, lightning risk), daily weather summary on route start
- [ ] 10-08: Weather delay customer notifications — automatic SMS/email when a stop is rescheduled due to weather, with new expected date and re-notification if it shifts again
- [ ] 10-09: Comprehensive company notifications — in-app push + email for all platform events (stop complete/skip, route start/end, chemistry out-of-range, WO lifecycle, quote responses, payments, portal messages/requests, overdue invoices, system events)
- [ ] 10-10: Comprehensive customer notifications — email + SMS for every customer touchpoint (pre-arrival, service report, invoice, payment receipt/failure, quote, weather delay, WO status, portal replies)
- [ ] 10-11: Notification engine and template system — toggleable per-type, customizable templates with merge tags, SMS provider integration (Twilio/etc.), unified notification dispatch service
- [ ] 10-12: Dynamic ETA engine — real-time ETA calculation (tech GPS + remaining stops + historical avg stop duration + live drive time from routing API), ETA delivery via SMS/email at configurable triggers (route start, N stops away, on-demand), auto-updating ETA when tech runs ahead/behind, customer portal live ETA countdown, dispatch view per-stop ETA overlay for all active routes
- [ ] 10-13: Equipment performance monitoring — track per-pool equipment metrics over time (salt cell output efficiency by season, pump pressure trends, filter PSI differential, heater temp delta), seasonal baseline comparison, degradation alerts when performance drops below threshold (e.g., "salt cell output down 30% vs. last summer"), equipment health badges on tech stop view, equipment performance dashboard for office, integration with predictive maintenance recommendations

### Phase 11: Payroll, Team Management & Full Accounting
**Goal**: The platform is a complete QuickBooks replacement for pool companies — owner runs native payroll with direct deposit, check printing, and automatic tax filing; tracks employee time, PTO, certifications, and break compliance; manages full double-entry accounting with bank reconciliation via Plaid; and gets payment reconciliation from whichever payment path (Stripe Connect or QBO) they chose in Phase 7
**Depends on**: Phase 9 (tech scorecards, per-stop metrics), Phase 7 (billing/payments, Stripe Connect or QBO integration), Phase 3 (field tech route timestamps)
**Requirements**: TEAM-01, TEAM-02, TEAM-03, TEAM-04, TEAM-05, TEAM-06, TEAM-07, TEAM-08, TEAM-09, TEAM-10, TEAM-11, TEAM-12, TEAM-13, TEAM-14, PAYRL-01, PAYRL-02, PAYRL-03, PAYRL-04, PAYRL-05, PAYRL-06, PAYRL-07, PAYRL-08, PAYRL-09, PAYRL-10, PAYRL-11, PAYRL-12, PAYRL-13, PAYRL-14, PAYRL-15, ACCT-01, ACCT-02, ACCT-03, ACCT-04, ACCT-05, ACCT-06, ACCT-07, ACCT-08, ACCT-09, ACCT-10, ACCT-11, ACCT-12, ACCT-13, ACCT-14, ACCT-15, PAY-01, PAY-02, PAY-03, PAY-04, PAY-05, PAY-06, PAY-07
**Success Criteria** (what must be TRUE):
  1. A tech can clock in and clock out from the app via manual punch (single tap) OR the system auto-detects arrival/departure via geofence around each stop address — both modes work simultaneously; manual punch defines the shift, geofence gives per-stop granularity; office configures which modes are required
  2. The owner can view and approve weekly timesheets per employee — auto-populated with regular hours, overtime, drive time, on-site time, breaks, and PTO
  3. The owner can run payroll in one click — system calculates gross-to-net for each employee with federal, state, and local tax withholding, Social Security, Medicare, and all configured deductions
  4. Employees receive pay via direct deposit (ACH) or printed checks — employees set up bank accounts in-app, owner chooses payment method per employee
  5. System auto-files quarterly payroll taxes (Form 941, state equivalents) and generates year-end W-2s for employees and 1099-NECs for contractors
  6. The owner has a full chart of accounts pre-seeded for pool service — every invoice, payment, payroll run, and expense auto-creates balanced double-entry journal entries
  7. The owner can generate P&L, Balance Sheet, and Cash Flow statements for any date range with period comparison — replacing QuickBooks financial reports entirely
  8. The owner can connect bank accounts via Plaid, auto-import transactions daily, and reconcile against book entries
  9. Payment transactions from Stripe Connect or QBO Payments auto-reconcile to accounting entries with per-transaction fee tracking
  10. The owner can track expenses with receipt photos, manage accounts payable with vendor bills, and log mileage — all categorized against the chart of accounts
  11. The owner can manage PTO balances with accrual rules, request/approval workflow, employee certifications with expiration alerts, and break compliance tracking
  12. The owner can view a team dashboard with all employees (clock status, hours, PTO, overtime alerts, cert warnings) and a financial dashboard with cash position, revenue trends, AR/AP aging, and payroll cost breakdown
  13. The owner can configure deductions (health insurance, retirement, HSA), garnishments, commission structures (per upsell, per WO), and bonus payroll runs — every edge case covered
  14. The owner can offer payment plans for large invoices and apply customer credits/prepayments to future invoices
**Plans**: TBD

Plans:
- [ ] 11-01: Schema foundation — time_entries, pay_rates, pay_periods, payroll_runs, employees, journal_entries, accounts, bank_connections tables + RLS
- [ ] 11-02: Clock in/out system — manual punch in/out (single tap, GPS stamp), geofence-based auto per-stop tracking (configurable radius, background mode, arrival/departure logging), dual-mode support (punch defines shift, geofence gives stop-level detail), auto-close shift on inactivity, tech app UI, shift management server actions
- [ ] 11-03: Auto time tracking — drive time vs. on-site time from geofence + route timestamps, break detection, time categorization engine, real-time tech location map for office
- [ ] 11-04: Timesheet UI — weekly view per employee, auto-populated, editable, approvable, overtime calculation, PTO entries
- [ ] 11-05: Pay rate management — per-employee rate config (hourly/per-stop/hybrid), overtime rules, rate history, effective dates, W-2 vs 1099 classification
- [ ] 11-06: Tax calculation engine — federal income tax, state/local tax, Social Security, Medicare, FUTA/SUTA, employer-side FICA match, multi-state support
- [ ] 11-07: Payroll run processing — gross-to-net calculation, deductions, garnishments, pay stubs, pay period auto-close, bonus payroll runs
- [ ] 11-08: Direct deposit & checks — ACH integration for direct deposit, employee bank account setup, printable check generation with pay stub
- [ ] 11-09: Tax filing & year-end — quarterly 941 filing, W-2/W-3 generation, 1099-NEC generation, state equivalent filings
- [ ] 11-10: PTO & scheduling — accrual rules, balance tracking, request/approval flow, availability windows, blocked dates
- [ ] 11-11: Commission & bonus tracking — per upsell, per WO completion, configurable rates, running totals, bonus payroll runs
- [ ] 11-12: Certifications & documents — CPO, license, insurance tracking, expiration alerts, document upload to Supabase Storage
- [ ] 11-13: Chart of accounts & double-entry engine — pre-seeded accounts, auto journal entries for all transactions, manual journal entries, audit trail
- [ ] 11-14: Financial statements — P&L, Balance Sheet, Cash Flow, custom date ranges, period comparison, budget vs. actual
- [ ] 11-15: Bank feeds & reconciliation — Plaid integration, auto-import transactions, categorization suggestions, reconciliation workflow
- [ ] 11-16: Expense tracking & AP — expense categorization, receipt photo capture, mileage logging, vendor bills, AP aging
- [ ] 11-17: Payment reconciliation — Stripe payout reconciliation, QBO payment reconciliation, fee tracking, net deposit matching
- [ ] 11-18: Advanced collections — payment plans, customer credits/prepayments, auto-apply balances, collections dashboard
- [ ] 11-19: Sales tax management — tax liability tracking by jurisdiction, filing-ready reports, due date reminders
- [ ] 11-20: Team & financial dashboards — employee overview (clock, hours, PTO, certs), financial overview (cash, revenue, AR/AP, payroll costs), labor cost analysis
- [ ] 11-21: Payroll reports — payroll register, tax liability summary, deduction summary, labor distribution, retroactive adjustments
- [ ] 11-22: Period close & audit — monthly/quarterly/annual close, closing entries, complete audit trail, tax prep exports
- [ ] 11-23: End-to-end verification checkpoint

### Phase 12: Projects & Renovations
**Goal**: Pool service companies that also build, renovate, and remodel pools can manage the entire project lifecycle — from lead capture and site survey through multi-tier proposals with deposits, permitting, material procurement, subcontractor coordination, phased execution with tech field tools, inspections, change orders, progress billing, final walkthrough, and warranty activation — with full customer portal visibility and real-time profitability tracking
**Depends on**: Phase 7 (billing/payment infrastructure, Stripe Connect), Phase 6 (work orders, quoting, PDF generation, token-based approval pages), Phase 4 (scheduling, tech assignment), Phase 3 (field tech app, photo capture), Phase 8 (customer portal for project view)
**Requirements**: PROJ-01 through PROJ-92
**Success Criteria** (what must be TRUE):
  1. Office can create a project from a template (replaster, equipment upgrade, new pool, etc.) that pre-populates phases, tasks, materials, and a payment schedule — or build a custom project from scratch
  2. Office can build a multi-tier proposal (Good/Better/Best) with optional add-ons, generate a branded PDF, and send it to the customer for approval — customer can select their tier, pick add-ons, e-sign, and pay the deposit in a single flow without creating an account
  3. Deposits are collected at approval (card/ACH inline, split payments, or offline recording) and the project cannot advance to scheduling until deposit is received or office overrides
  4. Office can view a project pipeline (Lead → Survey → Proposal → Approved → Permitted → In Progress → Punch List → Complete → Warranty) with drag-and-drop and time-in-stage tracking
  5. Each project has ordered phases with dependencies, a Gantt-style timeline, assigned crew/subs, material lists with procurement tracking, and the system auto-shifts dates when delays occur
  6. Tech has a dedicated "Projects" tab in the field app — sees today's project tasks, can log time, track material usage, capture tagged photos (before/during/after), flag issues that trigger change orders, and complete quality self-inspection checklists per phase
  7. Change orders require customer approval (with cost/schedule impact clearly shown) before work proceeds — approved change orders auto-update the project budget, material list, and payment schedule
  8. Progress invoices are generated at milestones tied to the payment schedule, with retainage held until final completion — all project payments flow through the existing Stripe infrastructure
  9. Final walkthrough is a formal phase with a digital punch list — customer signs off from their device, triggering warranty activation and the final invoice
  10. Customer can view project progress (timeline, photos, financials, change orders) and approve change orders from their portal
  11. System tracks project profitability in real-time — budget vs. actual for materials, labor, and subs — and flags projects trending toward a loss before they finish
  12. Completed projects activate configurable warranties with claim tracking, and the system prompts office to transition new customers into recurring service agreements
**Plans**: 16 plans

Plans:
- [ ] 12-01-PLAN.md — Schema foundation: projects, project_phases, project_tasks, project_materials, project_photos, subcontractors, sub_assignments, permits, inspections, change_orders, warranties, warranty_claims tables with RLS, enums (project_type, project_status, phase_status, permit_status, change_order_status, warranty_status), project_templates table, relations
- [ ] 12-02-PLAN.md — Project templates & types: template CRUD (phase definitions, default tasks, default materials, default labor, default payment schedule), per-type defaults for all project types (new pool, replaster, equipment upgrade, etc.), "Good/Better/Best" tier template config, settings UI for template management
- [ ] 12-03-PLAN.md — Lead capture & pipeline: lead creation from multiple sources (manual, portal request, tech flag, referral), pipeline kanban view with drag-and-drop stage transitions, time-in-stage tracking, lead-to-close metrics, pipeline filters and search
- [ ] 12-04-PLAN.md — Site survey: survey as a schedulable stop type on tech route, survey-specific checklist (measurements, photos, conditions, access, utilities, HOA), field capture UI optimized for site assessment, survey data auto-populates into proposal builder
- [ ] 12-05-PLAN.md — Proposal builder: project scope editor (rich text + photos), phased work breakdown from template, itemized line items (materials, labor, subs, equipment, permits), configurable markup per category, multiple pricing models (lump sum, cost-plus, T&M, fixed-per-phase), "Good/Better/Best" tier builder with add-on upsells, payment schedule builder (deposit + milestone payments + retainage + final), proposal versioning
- [ ] 12-06-PLAN.md — Proposal PDF & delivery: @react-pdf/renderer proposal document with company branding, scope description, site survey photos, line items (detail or summary), payment schedule, terms/conditions, warranty info, cancellation policy, e-signature block; email delivery via Resend with optional SMS; secure token system
- [ ] 12-07-PLAN.md — Customer approval & deposit: public /project/[token] approval page (no auth), full proposal review, tier selection, add-on checkboxes, payment schedule display, e-signature capture (name + date + IP), "Pay Deposit Now" inline Stripe payment (card/ACH), split deposit support, offline payment recording, deposit reminder email sequence, consumer financing link option, request-changes flow
- [ ] 12-08-PLAN.md — Permitting & compliance: permit tracking per project (type, status, dates, inspector, documents), configurable permit requirements per project type, permit approval gate (blocks "In Progress" until permitted), permit expiration alerts, HOA documentation storage
- [ ] 12-09-PLAN.md — Material procurement: project material list from approved proposal, purchase order creation grouped by supplier (printable PO documents), delivery tracking and receiving (with photos), material cost variance tracking (estimated vs. actual), material returns/credits, tech field material usage logging, reorder alerts when materials run low
- [ ] 12-10-PLAN.md — Subcontractor management: sub directory (name, trade, contact, insurance, license, payment terms), sub assignment to project phases (scope, price, dates), work status tracking (not started → in progress → complete → needs rework), sub payment tracking (owed, paid, outstanding) with lien waiver uploads, sub schedule notifications
- [ ] 12-11-PLAN.md — Project scheduling & phase management: phase CRUD with dependencies (hard/soft), Gantt-style timeline view with drag-to-reschedule, crew assignment per phase (blocks tech route availability), auto-delay propagation (dependent phases shift when predecessors slip), project hold/resume, weather delay integration for outdoor phases, project calendar overlay on main schedule
- [ ] 12-12-PLAN.md — Tech field app project mode: "Projects" tab in field app, project dashboard (active projects, today's tasks, progress), phase task checklists (checkable with notes + photos per task), time logging (start/stop timer or manual), material usage from field, photo capture with auto-tagging (project/phase/task/before/during/after/issue), issue flagging → change order, equipment/tool tracking, daily project briefing, phase completion with quality self-inspection checklist, hybrid route+project scheduling suggestions
- [ ] 12-13-PLAN.md — Change orders: change order creation (scope change description, reason, added/removed line items, cost impact, schedule impact), customer approval via email link (same approval pattern), auto-update project on approval (materials, labor, payment schedule, timeline), change order tracking log, tech issue flag → change order conversion, cumulative change order impact dashboard
- [ ] 12-14-PLAN.md — Progress billing & payments: milestone-triggered progress invoice generation, payment schedule enforcement (from proposal + change orders), retainage accrual and release, final invoice calculation (remaining balance + retainage - previous payments), ACH-only threshold for large payments (configurable), project profitability tracking (budget vs. actual, projected margin, loss flags), cancellation settlement calculator (completed work value + non-returnable materials + fees), refund handling
- [ ] 12-15-PLAN.md — Inspections, walkthrough & warranty: inspection tracking (type, date, result, rework cycle), quality self-inspection checklists per phase, final walkthrough phase (digital punch list, customer sign-off, triggers warranty + final invoice), warranty certificate PDF generation, configurable warranty terms per project type, warranty claim submission from portal, warranty work order creation (covered vs. billable), warranty expiration reminders, post-completion service agreement offer, project archive on customer profile
- [ ] 12-16-PLAN.md — Dashboard, reporting & portal: project dashboard (pipeline, calendar, crew utilization, alerts), per-project financials (budget vs. actual, margin, cash flow), aggregate reports (revenue by period, margin by type, conversion rates, duration by type, sub spend), customer portal project view (timeline, photos, financials, change order approval, project messaging, digital punch list sign-off), project update notifications, lead-to-close pipeline metrics, end-to-end verification checkpoint

### Phase 13: Truck Inventory & Shopping Lists
**Goal**: Techs and office have full visibility into what's on every truck, what needs to be restocked, and what to bring for tomorrow's route — chemicals auto-decrement from dosing logs, shopping lists track the full procurement cycle, and a purchasing dashboard aggregates fleet-wide needs for bulk ordering
**Depends on**: Phase 6 (parts catalog, work orders, chemical dosing logging)
**Requirements**: INV-01, INV-02, INV-03, INV-04, INV-05, INV-06, INV-07, INV-08, INV-09, INV-10, INV-11, INV-12, INV-13
**Success Criteria** (what must be TRUE):
  1. Each tech has a persistent truck inventory that auto-decrements when chemical dosing is logged at stops; reorder alerts fire when items fall below configurable minimums
  2. Office can define standard truck load templates per tech role or route type; new techs get pre-loaded templates
  3. Tech can update truck inventory from the field app — mark items used, add loaded items, transfer to another tech — all synced to office in real-time
  4. Techs see a "What to Bring" pre-route summary showing all parts/chemicals needed for today's stops cross-referenced against their truck inventory, highlighting shortages
  5. Shopping lists aggregate needs from work orders, projects, low inventory alerts, schedule-based forecasting, and manual entries — items track through the full cycle from needed → ordered → received → loaded on truck → used
  6. Office has a purchasing dashboard showing all outstanding needs across all techs, grouped by supplier, with bulk PO generation and spending trends
  7. Chemical usage is tracked per tech, per route, per customer, and per pool — surfacing over/under-dosing patterns across the fleet
  8. Barcode/QR scanning is available (but optional) for logging usage, updating truck inventory, receiving deliveries, and adding items to shopping lists
**Plans**: 4 plans

Plans:
- [ ] 13-01-PLAN.md — Schema & truck inventory core: truck_inventory, truck_load_templates, shopping_lists, shopping_list_items tables with RLS; per-tech truck inventory CRUD with categories (chemical, part, tool, equipment); standard truck load templates per role/route type; auto-decrement on chemical dosing log at stop completion; reorder alert generation at configurable thresholds (alerts to tech + office); real-time inventory sync to office; transfer between techs
- [ ] 13-02-PLAN.md — Shopping lists & procurement lifecycle: shopping list creation sources (WO parts lists, project material lists, low inventory alerts, schedule-based forecasting, manual entry); item status lifecycle (needed → ordered → received → loaded → used) with timestamps and user attribution; tech field app shopping list view with barcode scanning to mark loaded; integration with WO/project parts-ready status; urgent need flagging for tomorrow's route
- [ ] 13-03-PLAN.md — Purchasing dashboard, chemical usage tracking & "What to Bring": office purchasing dashboard (aggregated needs across fleet, grouped by supplier, bulk PO generation, spending trends, most-ordered items, cost per unit over time); chemical usage tracking per tech/route/customer/pool feeding Phase 9 profitability reporting; "What to Bring" pre-route summary on tech daily route view (parts + chemicals needed based on pool size/history/WOs vs. truck inventory, shortage highlights); usage pattern analysis (over/under-dosing detection comparing techs on similar routes)
- [ ] 13-04-PLAN.md — Phase 13 end-to-end human verification checkpoint

### Phase 14: Service Agreements & Contracts
**Goal**: The company can create, send, and manage formal recurring service agreements — customers e-sign from a link, acceptance auto-creates the schedule and billing, and agreements track the full lifecycle (active, paused, renewed, cancelled) so both sides know exactly what's agreed to
**Depends on**: Phase 7 (billing/invoicing), Phase 6 (quote infrastructure — reuses PDF generation, token-based approval page, email delivery), Phase 4 (schedule rules — auto-created on acceptance)
**Requirements**: AGREE-01, AGREE-02, AGREE-03, AGREE-04, AGREE-05, AGREE-06, AGREE-07, AGREE-08, AGREE-09, AGREE-10, AGREE-11, AGREE-12
**Success Criteria** (what must be TRUE):
  1. Office staff can create a service agreement selecting customer, pool(s), frequency, included services, pricing, and term length — and generate a professional branded PDF
  2. Customer receives the agreement via email with a secure link, can review the full terms, and e-sign (name, date, IP captured) without creating an account
  3. Upon customer acceptance, the system automatically creates the schedule rule (recurring stops) and sets up recurring billing — zero manual re-entry
  4. Office can view all agreements filtered by status (draft, sent, active, paused, expired, cancelled) and see upcoming renewals/expirations at a glance
  5. Office can pause an agreement (stops and billing suspended), resume it (stops and billing restart), or cancel it (with notice period enforcement)
  6. Expiring agreements trigger renewal reminders, and office can renew or amend terms — amendments create a new version sent for customer re-approval
  7. Customer portal shows active agreements with service scope, pricing, billing schedule, and contract term
**Plans**: TBD

Plans:
- [ ] 14-01: Schema foundation — service_agreements, agreement_versions, agreement_signatures tables with RLS, agreement_templates table, enums (status, term_type), relations
- [ ] 14-02: Agreement builder — create agreement UI (customer/pool selector, frequency, services checklist, pricing, term config, cancellation terms), agreement template manager in settings
- [ ] 14-03: Agreement PDF + delivery — @react-pdf/renderer agreement document, branded template with terms/conditions, email delivery via Resend, secure token system (reuse quote pattern)
- [ ] 14-04: Customer approval page — public /agree/[token] page (no auth), agreement review with full terms display, e-signature capture (name + date + IP + user agent), accept/decline flow
- [ ] 14-05: Auto-provisioning on acceptance — auto-create schedule_rule, auto-configure recurring billing model, link agreement to billing cycle, status transition to active
- [ ] 14-06: Agreement lifecycle — pause/resume (suspend stops + billing), cancel (notice period enforcement, final invoice), expire (auto-flag at term end), auto-renew toggle, amendment flow with re-approval
- [ ] 14-07: Agreement manager UI — list page with status filters, expiration alerts, renewal dashboard, compliance flags (missed stops vs. agreed frequency)
- [ ] 14-08: Customer portal integration — active agreements view, service scope, pricing, next billing date, request changes/cancellation
- [ ] 14-09: End-to-end verification checkpoint

### Phase 15: Intelligent Billing Automation
**Goal**: Layer per-customer pricing, bulk operational fees, and smart anomaly detection onto the existing /billing page — so the owner sets a rate per customer once, applies shop fees in bulk, and the system catches billing mistakes before invoices go out
**Depends on**: Phase 7 (billing/invoicing foundation — generateAllInvoices, billing models, invoice list, insights dashboard all already built)
**Requirements**: TBD (to be defined during planning)
**Already built in Phase 7** (do NOT rebuild):
  - Bulk invoice generation for a date range (generateAllInvoices)
  - Billing models per customer (per_stop, flat_rate, plus_chemicals, custom)
  - flat_rate_amount per customer
  - Chemical line items extracted from dosing logs (getPlusChemicalsLineItems)
  - Billing in arrears — counts completed stops, applies rate, generates invoice
  - Single + batch invoice generation
  - Billing insights dashboard (drafts, overdue, outstanding, paid this month)
  - Action items panel (uninvoiced WOs, unsent drafts, overdue, no billing model)
  - Invoice list with status filters, search, sort by actionability
  - Draft editor with editable line items, multi-WO merge, discounts
  - AutoPay, dunning, send via email/SMS with templates
**Success Criteria** (what must be TRUE — all net-new):
  1. Each customer has their own per-visit rate (customers.per_stop_rate column), replacing the single org-wide default_hourly_rate — editable on the customer profile alongside billing model, with the org default as fallback when NULL
  2. When setting a new customer's rate, the system suggests a price based on pool volume, surface type, sanitizer type, and equipment count — derived from similar customers in the same org (not AI, just percentile matching)
  3. Bulk operational fees (gas surcharge, truck maintenance, shop fees) can be defined in Settings as reusable fee templates and applied across selected invoices with one action — configurable as flat $ or % of subtotal, per-invoice or per-stop
  4. The billing dashboard surfaces anomaly alerts: customer charged significantly less than their 3-month average, per-visit customer has missed stops not deducted, customer pricing hasn't been reviewed in 6+ months, uninvoiced completed work older than 30 days
  5. The generate-invoices flow gains a preview step — before creating drafts, office sees a table of every customer with: stop count, calculated total, applied fees, and any anomaly warnings — with the ability to adjust or exclude individual customers before confirming
**Plans**: TBD

Plans:
- [ ] TBD (run /gsd:plan-phase 15 to break down)

### Phase 16: Subscription Billing
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
- [ ] 16-01-PLAN.md — Schema + Stripe setup: subscriptions table with enums, src/lib/stripe.ts client singleton, tier config constants
- [ ] 16-02-PLAN.md — Checkout & onboarding: createCheckoutSession, trial creation on signup, success/cancel pages
- [ ] 16-03-PLAN.md — Stripe webhook handler: /api/webhooks/stripe route handling 6 event types (checkout, subscription lifecycle, invoices, trial ending)
- [ ] 16-04-PLAN.md — Billing management UI: /billing page with plan card, usage bar, invoice history, cancel/reactivate, trial + restricted banners
- [ ] 16-05-PLAN.md — Usage tracking & tier enforcement: pool count tracking, limit checking with grace periods, upgrade prompt dialog
- [ ] 16-06-PLAN.md — Failed payment & dunning: grace period management, account restriction (read-only mode), recovery flow
- [ ] 16-07-PLAN.md — End-to-end verification checkpoint: 7 manual test scenarios with Stripe test mode

## Progress

**Execution Order:**
Phases execute in numeric order: 1 → 2 → 3 → 4 → 5 → 6 → 7 → 8 → 9 → 10 → 11 → 12 → 13 → 14 → 15 → 16

| Phase | Plans Complete | Status | Completed |
|-------|----------------|--------|-----------|
| 1. Foundation | 0/6 | Complete | 2026-03-05 |
| 2. Customer & Pool Data Model | 0/4 | Complete | 2026-03-06 |
| 3. Field Tech App | 8/8 | Complete | 2026-03-08 |
| 4. Scheduling & Routing | 7/7 | Complete | 2026-03-09 |
| 5. Office Operations & Dispatch | 0/6 | Complete | 2026-03-10 |
| 6. Work Orders & Quoting | 0/8 | Complete | 2026-03-11 |
| 7. Billing & Payments | 0/9 | Complete | 2026-03-13 |
| 8. Customer Portal | 0/5 | Not started | - |
| 9. Reporting & Team Analytics | 0/5 | Not started | - |
| 10. Smart Features & AI | 0/13 | Not started | - |
| 11. Payroll, Team Mgmt & Accounting | 0/23 | Not started | - |
| 12. Projects & Renovations | 0/16 | Not started | - |
| 13. Truck Inventory & Shopping Lists | 0/4 | Not started | - |
| 14. Service Agreements & Contracts | 0/9 | Not started | - |
| 15. Intelligent Billing Automation | 0/0 | Not started | - |
| 16. Subscription Billing | 0/7 | Not started | - |
