# Roadmap: Pool Company Management SaaS

## Overview

Eighteen phases that build the platform from the ground up, ordered by hard technical dependencies. Foundation (auth, schema, multi-tenancy, offline architecture) ships first because retrofitting any of these is a rewrite. Customer data model comes second because every field operation needs to know what pool it is servicing. Core field tech app is the daily driver and the source of all service records — it ships before billing, reporting, or AI because those downstream phases depend on the records it generates. Office dispatch, work orders, and billing follow in sequence, each unblocked by the previous. The customer portal and reporting dashboards surface existing data once it is stable and real. Smart AI features follow, then the platform becomes a complete QuickBooks replacement — native payroll with direct deposit and tax filing, full double-entry accounting with bank reconciliation, and payment reconciliation from Stripe Connect or QBO. Projects & Renovations adds full construction/remodel project management with deposits, progress billing, permits, subcontractors, and a dedicated tech field experience. Service Agreements formalizes recurring contracts with e-signature. Intelligent Billing Automation adds smart auto-invoice generation — techs log work, the system prices it based on per-customer rates and billing profiles, with bulk fee application, arrears billing, and anomaly detection. Before launch, a comprehensive UI Polish & Launch Readiness phase audits and perfects every screen — fixing cursor states, hover effects, spacing inconsistencies, mobile responsiveness, accessibility, empty states, loading skeletons, error handling, and dark mode consistency across every single page and component. The marketing site and subscription billing phase converts pool company owners into paying customers with a stunning marketing experience, frictionless sign-up, and Stripe-powered subscription lifecycle. The final phase is Production Launch — flipping every service from test/dev to live, configuring production infrastructure, and verifying the entire platform works end-to-end in the real world.

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
- [x] **Phase 8: Customer Portal** - Full self-service portal — service history, invoice payment, service requests, and messaging (completed 2026-03-13)
- [x] **Phase 9: Reporting & Team Analytics** - Owner dashboards, technician scorecards, chemical profitability, and financial reporting (completed 2026-03-14)
- [x] **Phase 10: Smart Features & AI** - AI route optimization, predictive chemistry alerts, and automated workload balancing (completed 2026-03-15)
- [x] **Phase 11: Payroll, Team Management & Full Accounting** - Native payroll (direct deposit, checks, tax filing, W-2/1099), time tracking, PTO, certifications, full double-entry accounting, bank reconciliation via Plaid, payment reconciliation, financial statements — complete QuickBooks replacement (completed 2026-03-16)
- [x] **Phase 12: Projects & Renovations** - Full project management for new pool construction, renovations, and remodels — lead pipeline, site surveys, multi-tier proposals, deposits, progress billing, permits, subcontractors, material procurement, change orders, inspections, warranties, and a dedicated tech project mode with task checklists, time tracking, and photo documentation (completed 2026-03-17)
- [ ] **Phase 13: Truck Inventory & Shopping Lists** - Per-tech truck inventory with auto-decrement, shopping lists with full procurement lifecycle, purchasing dashboard, chemical usage tracking, and "What to Bring" pre-route summaries
- [x] **Phase 14: Service Agreements & Contracts** - Recurring service agreements with e-signature, auto-schedule/billing setup, agreement lifecycle (pause/resume/cancel/renew), customer portal access, and compliance tracking (completed 2026-03-25)
- [ ] **Phase 15: Intelligent Billing Automation** - Per-customer per-visit rates, smart pricing suggestions, bulk shop fee application, billing anomaly detection, and invoice generation preview
- [ ] **Phase 16: UI Polish & Launch Readiness** - Comprehensive audit and perfection of every screen, component, and interaction — cursor states, hover effects, button text visibility, spacing/typography consistency, mobile responsiveness, accessibility (keyboard nav, screen readers, contrast), loading skeletons, empty states, error pages, dark mode consistency, page transitions, toast notifications, and performance optimization
- [ ] **Phase 17: Marketing Site & Subscription Billing** - Conversion-optimized public marketing site with interactive app demos, competitor comparisons, ROI calculator, frictionless multi-step sign-up, plus Stripe subscription billing with tiered pricing, checkout, billing management UI, usage enforcement, and failed payment handling
- [ ] **Phase 18: Production Launch** - Deploy to production, switch all services from test to live (Stripe live keys, Twilio production number, Supabase production config), configure Vercel deployment with custom domain, set up monitoring/alerting, production smoke test of every feature end-to-end, and go live

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
**Plans**: 6 plans

Plans:
- [ ] 09-01-PLAN.md — Schema migrations + Recharts install + shared report infrastructure + reports page tab restructure
- [ ] 09-02-PLAN.md — Revenue Dashboard tab: KPI cards, trend chart, customer/tech tables, drill-down drawer, CSV export
- [ ] 09-03-PLAN.md — Operations Dashboard tab: route completion rates, missed stops, on-time %, per-tech breakdown chart
- [ ] 09-04-PLAN.md — Team Dashboard tab: tech scorecards (leaderboard + comparison), payroll prep CSV, tech self-view, pay settings
- [ ] 09-05-PLAN.md — Profitability Dashboard tab: chemical cost per pool, margin flagging, unprofitable pool alerts, per-tech dosing costs
- [ ] 09-06-PLAN.md — Gap closure: wire started_at capture (markStopStarted) and dosing_amounts capture (onDosingChange callback) in stop workflow

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
  13. If a tech hasn't completed any stop or moved in 30+ minutes during an active route, the system pings the owner/office with an "unresponsive tech" alert — safety feature for lone workers in the field
  14. Techs can leave internal service notes (visible only to office/owner, NOT the customer) for flagging issues, requesting follow-up, or leaving messages for the next tech on the route
  15. The owner can send a broadcast email or SMS to all customers, a filtered subset (by route, status, service type), or individual customers — for seasonal announcements, holiday schedule changes, promotions, or emergency notices
  16. Office staff can assign and schedule a work order directly from the WO detail page — the system recommends an optimal day and tech based on the WO address proximity to existing route stops, tech workload, and travel time; office can accept the recommendation or override with manual selection
  17. If the user hasn't added the app to their home screen, a smart install prompt appears — non-intrusive bottom banner or modal explaining the benefits ("Faster access, works offline, push notifications"), with a one-tap "Add to Home Screen" button that triggers the browser's native PWA install prompt (beforeinstallprompt API). Dismissible with "Not now" and doesn't re-appear for 7 days. On iOS (no beforeinstallprompt), shows step-by-step instructions with screenshots (Share → Add to Home Screen). Shown to all roles (tech, owner, office) since everyone benefits from the installed app experience
  18. On first login (or after app install), the app prompts the user to enable push notifications with a clear explanation of what they'll receive — "Get notified when stops are completed, new work orders come in, customers message you, payments arrive, and more." Uses the Web Push API (VAPID keys + service worker `push` event) to deliver real-time native-style push notifications to the device even when the app is closed. If the user declines, a persistent but non-intrusive banner in Settings reminds them they can enable notifications anytime. Push notifications fire for EVERY event that also sends email/SMS — stop complete/skip, route started, chemistry alerts, WO assigned/completed, quote approved/declined, invoice paid/overdue, payment received/failed, portal messages, service requests, weather delays, safety alerts, ETA updates — so the app feels like a real native app, not a website
**Plans**: 17 plans

Plans:
- [ ] 10-01-PLAN.md — Enhanced smart dosing with weather and history modifiers
- [ ] 10-02-PLAN.md — Predictive chemistry alerts using OLS regression
- [ ] 10-03-PLAN.md — Automated workload balancing and auto-schedule engine
- [ ] 10-04-PLAN.md — ML route optimization with historical service durations
- [ ] 10-05-PLAN.md — Smart customer creation with intelligent suggestions
- [ ] 10-06-PLAN.md — Weather-aware scheduling with auto-reschedule engine
- [ ] 10-07-PLAN.md — Tech weather alerts with per-stop badges
- [ ] 10-08-PLAN.md — Weather delay customer notifications
- [ ] 10-09-PLAN.md — Notification infrastructure (tables, push, dispatch)
- [ ] 10-10-PLAN.md — Comprehensive customer notifications (email + SMS)
- [ ] 10-11-PLAN.md — In-app notification center and user preferences
- [ ] 10-12-PLAN.md — Dynamic ETA engine with portal countdown
- [ ] 10-13-PLAN.md — Equipment performance monitoring and degradation alerts
- [ ] 10-14-PLAN.md — Safety alerts with configurable escalation chain
- [ ] 10-15-PLAN.md — Internal service notes and flagging system
- [ ] 10-16-PLAN.md — Broadcast messaging to customer segments
- [ ] 10-17-PLAN.md — PWA install prompt and Web Push notifications

### Phase 11: Payroll, Team Management & Full Accounting
**Goal**: DeweyIQ collects time data (clock-in/out, per-stop geofence timing, breaks, mileage) and pushes to QBO for payroll; provides full double-entry accounting with simplified owner view and accountant mode; tracks expenses with receipt capture; manages PTO, certifications, and employee scheduling; and extends billing with payment plans, customer credits, and collections — all without requiring the owner to understand accounting terminology. Bank feeds and reconciliation deferred to QBO (Plaid cut to reduce cost/complexity)
**Depends on**: Phase 9 (tech scorecards, per-stop metrics, **tech pay/commission tracking and payroll export** — review and extend what Phase 9 built, don't rebuild), Phase 7 (billing/payments, Stripe Connect or QBO integration), Phase 3 (field tech route timestamps)
**Requirements**: TEAM-01, TEAM-02, TEAM-03, TEAM-04, TEAM-05, TEAM-06, TEAM-07, TEAM-08, TEAM-09, TEAM-10, TEAM-11, TEAM-12, TEAM-13, TEAM-14, PAYRL-01, PAYRL-02, PAYRL-03, PAYRL-04, PAYRL-05, PAYRL-06, PAYRL-07, PAYRL-08, PAYRL-09, PAYRL-10, PAYRL-11, PAYRL-12, PAYRL-13, PAYRL-14, PAYRL-15, ACCT-01, ACCT-02, ACCT-03, ACCT-04, ACCT-05, ACCT-06, ACCT-07, ACCT-08, ACCT-09, ACCT-10, ACCT-11, ACCT-12, ACCT-13, ACCT-14, ACCT-15, PAY-01, PAY-02, PAY-03, PAY-04, PAY-05, PAY-06, PAY-07
**Success Criteria** (what must be TRUE):
  1. A tech can clock in and clock out from the app via manual punch (single tap) OR the system auto-detects arrival/departure via geofence around each stop address — both modes work simultaneously; manual punch defines the shift, geofence gives per-stop granularity; office configures which modes are required
  2. The owner can view and approve weekly timesheets per employee — auto-populated with regular hours, overtime, drive time, on-site time, breaks, and PTO
  3. The owner can run payroll in one click — system calculates gross-to-net for each employee with federal, state, and local tax withholding, Social Security, Medicare, and all configured deductions
  4. Employees receive pay via direct deposit (ACH) or printed checks — employees set up bank accounts in-app, owner chooses payment method per employee
  5. System auto-files quarterly payroll taxes (Form 941, state equivalents) and generates year-end W-2s for employees and 1099-NECs for contractors
  6. The owner has a full chart of accounts pre-seeded for pool service — every invoice, payment, payroll run, and expense auto-creates balanced double-entry journal entries
  7. The owner can generate P&L, Balance Sheet, and Cash Flow statements for any date range with period comparison — replacing QuickBooks financial reports entirely
  8. ~~The owner can connect bank accounts via Plaid, auto-import transactions daily, and reconcile against book entries~~ **CUT** — bank feeds and reconciliation handled by QBO instead. Plaid dependency removed to reduce cost and complexity. See Phase 15 note.
  9. Payment transactions from Stripe Connect or QBO Payments auto-reconcile to accounting entries with per-transaction fee tracking
  10. The owner can track expenses with receipt photos, manage accounts payable with vendor bills, and log mileage — all categorized against the chart of accounts
  11. The owner can manage PTO balances with accrual rules, request/approval workflow, employee certifications with expiration alerts, and break compliance tracking
  12. The owner can view a team dashboard with all employees (clock status, hours, PTO, overtime alerts, cert warnings) and a financial dashboard with cash position, revenue trends, AR/AP aging, and payroll cost breakdown
  13. The owner can configure deductions (health insurance, retirement, HSA), garnishments, commission structures (per upsell, per WO), and bonus payroll runs — every edge case covered
  14. The owner can offer payment plans for large invoices and apply customer credits/prepayments to future invoices
  15. Payroll data can be exported to QuickBooks Online — payroll runs, journal entries, tax liabilities, and employee records sync to QBO so companies using QBO as their accountant-facing system of record can keep their bookkeeper/CPA in the loop without manual re-entry
**Plans**: 14 plans

Plans:
- [ ] 11-01-PLAN.md — Schema foundation: time_entries, break_events, time_entry_stops, chart_of_accounts, journal_entries, journal_entry_lines, accounting_periods, bank_accounts, bank_transactions, pto_balances, pto_requests, employee_availability, employee_blocked_dates, employee_documents, mileage_logs, vendors tables + RLS + org_settings extensions + profiles.qbo_employee_id
- [ ] 11-02-PLAN.md — Clock in/out system: manual punch with GPS stamp, break start/end, break compliance alerts, ClockInBanner on routes page
- [ ] 11-03-PLAN.md — Geofence per-stop timing: haversine geofence detection in GPS hook, arrival/departure recording, drive time calculation, auto-break detection
- [ ] 11-04-PLAN.md — Timesheets + QBO push: weekly timesheet view, edit/approve workflow, QBO TimeActivity push, Employee sync, time tracking settings
- [ ] 11-05-PLAN.md — PTO, scheduling, certifications: PTO balance/accrual/request/approval, availability windows, blocked dates, document upload with expiry alerts
- [ ] 11-06-PLAN.md — Double-entry accounting engine: chart of accounts seed, journal entry creation/reversal, auto-generation for invoices/payments/expenses/refunds
- [ ] 11-07-PLAN.md — Financial statements + dashboard: P&L, Balance Sheet, Cash Flow, simplified owner view, accountant mode, /accounting page
- [ ] 11-08-PLAN.md — Plaid bank feeds: Plaid Link integration, transaction sync, webhook handler, bank account management in settings
- [ ] 11-09-PLAN.md — Bank reconciliation: smart auto-match algorithm, reconciliation UI, Stripe payout auto-reconciliation with fee tracking
- [ ] 11-10-PLAN.md — Expense tracking + mileage: receipt photo capture, category-to-account mapping, auto mileage from GPS, IRS-compliant mileage export
- [ ] 11-11-PLAN.md — Payment reconciliation + collections: QBO payment reconciliation, payment plans, customer credits, collections dashboard, refund entries
- [ ] 11-12-PLAN.md — Sales tax + period close + audit: per-jurisdiction tax rates, period close workflow, immutable audit trail
- [ ] 11-13-PLAN.md — Team dashboard + labor costs: live employee status, hours/PTO/alerts overview, labor cost per stop/route/customer
- [ ] 11-14-PLAN.md — End-to-end verification checkpoint

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
  9. Parts/items can be imported from QuickBooks Online — pulls the QBO Item catalog (products/services) into the parts catalog with name, description, SKU, unit cost, and sale price mapped automatically. This imports into the same parts catalog already used by work orders in Settings → Work Orders (not a separate inventory — the existing `CatalogItem` table is the single source of truth for parts across the app)
  10. Office has a dedicated `/inventory` page (sidebar entry) with tabs for: per-tech truck inventory view (what's on each truck, stock levels, reorder alerts), shopping lists (all active lists with status tracking), and purchasing dashboard (fleet-wide needs, supplier grouping, PO generation, spending trends). Parts catalog *definition* (adding/editing items, QBO import) stays in Settings → Work Orders — `/inventory` is the operational page for day-to-day inventory management
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
**Plans**: 7 plans

Plans:
- [ ] 14-01-PLAN.md — Schema foundation: service_agreements, agreement_pool_entries, agreement_amendments, agreement_templates tables with RLS, org_settings extensions, agreement CRUD server actions
- [ ] 14-02-PLAN.md — Agreement builder UI: multi-pool agreement creation with per-pool frequency/pricing/checklist, template selection, Settings "Agreements" tab for template management
- [ ] 14-03-PLAN.md — PDF generation + delivery: agreement PDF document with @react-pdf/renderer, JWT token system, email template, sendAgreement action with PDF attachment
- [ ] 14-04-PLAN.md — Customer approval page: public /agreement/[token] page with dual e-signature (typed + canvas draw), accept/decline flow, auto-provisioning of schedule rules and billing on acceptance
- [ ] 14-05-PLAN.md — Agreement manager: top-level /agreements page with status/customer/search filters, agreement detail page with actions and activity timeline, sidebar + header integration
- [ ] 14-06-PLAN.md — Lifecycle management: pause/resume (schedule rule control), cancel (notice period), renew, amendment system with major/minor classification and version history
- [ ] 14-07-PLAN.md — Renewal cron + compliance: daily cron for renewal reminders and expiration checks, compliance tracking (missed stops vs agreed frequency, billing alignment), compliance indicators in UI

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
  6. Automatic recurring invoice generation — owner configures a billing schedule (e.g., "every Monday" or "1st of each month") and the system auto-generates invoices for all customers with billing models, auto-charges AutoPay customers, and sends a summary email to the owner — no manual "Generate Invoices" click required for routine weekly/monthly billing cycles
  7. Each customer's profile shows their next auto-invoice date, billing frequency, and last invoice summary — making recurring billing status visible at a glance
  8. Office staff can record cash and check payments against any invoice (WO, recurring service, or project) — with payment method selection, check number tracking, receipt date, and optional receipt photo; the customer payment page also offers a "Paying by Cash or Check" option that notifies the office to expect manual payment instead of processing online
  9. Full QBO bidirectional sync covers ALL entity types — customers, invoices, payments, parts/items catalog, expenses, and chart of accounts — not just the basic three; parts imported from QBO populate the existing CatalogItem table
  10. Payout schedule configuration — pool company owner can set their Stripe payout frequency from Settings → Billing → Payments: daily (default), weekly (pick a day), or monthly (pick a date). Uses the Stripe Connect Account API to update the connected account's `settings.payouts.schedule`. Clear display of current schedule and next expected payout date
  11. **Plaid removal** — Complete cleanup of Plaid integration. Bank feeds and reconciliation are handled by QBO instead. Already deleted: `src/lib/plaid/client.ts`, `src/actions/bank-feeds.ts`, `src/components/settings/plaid-connect.tsx`, `src/components/accounting/bank-feed.tsx`, `src/app/api/webhooks/plaid/route.ts`, and all imports/references in `settings-tabs.tsx`, `settings/page.tsx`, `financial-dashboard.tsx`, `pnl-report.tsx`. **Still remaining to clean up:**
      - `src/actions/reconciliation.ts` — bank reconciliation server actions (imported by `accounting/page.tsx` and `reconcile-panel.tsx`)
      - `src/lib/accounting/reconciliation.ts` — reconciliation matching algorithm
      - `src/components/accounting/reconcile-panel.tsx` — reconciliation UI panel
      - `src/lib/db/schema/bank-accounts.ts` — schema for `bank_accounts` and `bank_transactions` tables (drop tables via migration)
      - `src/app/(app)/accounting/page.tsx` — remove `getBankAccountsForReconciliation` import and prop passing
      - `src/lib/stripe/webhook-handlers.ts` — remove Plaid-related comments (lines 809-812)
      - `src/lib/db/schema/expenses.ts` — remove Plaid reference in comment
      - `src/components/accounting/financial-dashboard.tsx` — remove unused `bankAccounts` prop from interface
      - Drop `bank_accounts` and `bank_transactions` tables via Drizzle migration
  12. Tiered billing model support — agreement pool entries with `pricing_model: "tiered"` (base amount up to N visits/month, per-visit overage above threshold) must generate correct invoice line items. Currently, tiered agreements are silently collapsed to flat_rate on sign, losing the overage tier. Add `tiered` to the `BillingModel` type, implement tiered line item calculation in `generateInvoiceForCustomer` (base charge + overage lines), and update the sign route to map `tiered` → `tiered` instead of falling back to `flat_rate`
**Plans**: TBD

Plans:
- [ ] TBD (run /gsd:plan-phase 15 to break down)

### Phase 16: UI Polish & Launch Readiness
**Goal**: Audit and perfect every single screen, component, and micro-interaction in the app — fix every broken hover state, missing cursor pointer, invisible button text, inconsistent spacing, janky transition, missing loading state, and accessibility gap — so the product feels polished, professional, and launch-ready before the marketing site showcases it
**Depends on**: All prior phases (every feature must be built before the polish pass)
**Requirements**: TBD (to be defined during planning)
**Known Issues** (reported by user):
  - Some buttons don't show pointer cursor on hover
  - Some button hover effects make text invisible/unreadable
  - Schedule page "Today" button goes to wrong day — if viewing a different day next week and clicking "Today", it navigates to the same weekday in the current week instead of actual today
  - Completed stops for the day can still be edited/dragged on the Schedule page — should be locked once complete
  - Dispatch page: all tech routes are the same blue color — need per-tech color coding so routes are visually distinguishable
  - Routes page (tech): map button exists but map doesn't work — needs functional route map for the current tech's route
  - Routes page (tech): no way to view previous or upcoming days' routes — needs day navigation (previous/next day)
  - Routes page (tech): stops at the same address (pool + spa) should be visually grouped for simplicity
  - Work Orders list page has emoji icons — remove them (user aesthetic preference: no codey icons)
  - Any other emoji/decorative icons found during audit should be removed app-wide
  - Billing invoice detail line items UI is basic — needs to match the work order line item quality (taxable indicator "T", better layout, inline editing feel)
  - Customer list needs sorting options — sort by recently serviced, alphabetical, route assignment, account status, etc.
  - Schedule page only shows Monday–Friday — no way to schedule or view Saturday/Sunday routes
  - Photo requirement enforcement gap: `requires_photo` flag exists on checklist tasks (schema + settings UI + customer overrides all wired) but `completeStop` server action doesn't validate it — techs can complete stops without photos even when `requires_photo: true`. Fix: add photo validation to the warn-but-allow enforcement block in `completeStop` (same pattern as chemistry/checklist enforcement)
  - Route page progress tracker lumps route stops and work orders together — should show them separately
  - Drive time on maps shows raw minutes ("90 mins") instead of human-friendly format ("1hr 30 mins")
  - Route page doesn't group co-located stops (pool + spa at same address) — shows them as separate cards
  - Stop card doesn't prominently show service type below customer name
  - No overdue/balance indicator visible in the field app — tech/owner can't see if customer owes money while on-site
  - Owner can't create/send estimates from the field app — must go back to office to use quote builder
  - Chemistry color indicators jump straight from green to red at range boundaries — no yellow warning zone at 7.2/7.8 pH or 60-80/120-140 alkalinity
  - **Tab styling inconsistency across pages**: Schedule page tabs look good (preferred style), but Settings, Accounting, Reports, and other pages use a different/worse tab style. All tabs app-wide must use the same component and styling as the Schedule page tabs
  - **Settings page tabs not mobile-friendly**: Settings tab list doesn't scroll or wrap properly on mobile — tabs get cut off or overflow. Needs horizontal scroll or a dropdown/accordion pattern on small screens
  - **Overall design consistency audit**: Every page must feel like it belongs to the same app. Audit ALL pages for consistent card styles, section headers, spacing, button patterns, tab components, form layouts, and visual rhythm. Fix any page that looks "off" compared to the rest
**Success Criteria** (what must be TRUE):

  *Interactive States:*
  1. Every clickable element (buttons, links, cards, tabs, toggles, dropdowns) shows `cursor: pointer` on hover — no exceptions
  2. Every button and interactive element has a visible, consistent hover/active/focus state that never makes text unreadable or invisible
  3. Every disabled button has a visually distinct disabled state with `cursor: not-allowed` and clear visual dimming
  4. Focus rings are visible on all interactive elements for keyboard navigation — consistent ring style across the entire app

  *Visual Consistency:*
  5. Every page follows the exact same spacing system — `gap-6` between sections, `gap-4` within sections, `p-5` card padding, consistent margins — no one-off spacing values
  6. Typography is consistent across all pages — same font sizes, weights, line heights, and tracking for equivalent elements (h1, h2, body, captions, labels)
  7. Color usage exclusively uses design system tokens — no hardcoded hex/rgb/oklch values outside globals.css — status colors, accent colors, and semantic colors are defined once and reused everywhere
  8. All cards, dialogs, sheets, and panels use the same border radius, shadow, and padding patterns
  9a. **All tabs use the same component and style** — the Schedule page tab style is the reference. Every page with tabs (Settings, Accounting, Reports, Customers, Billing, etc.) uses the identical tab component, sizing, active/inactive states, and spacing. No page has a different-looking tab bar
  9b. **Settings tabs are mobile-friendly** — on small screens, the tab list is horizontally scrollable (with scroll indicators) or collapses to a dropdown/select pattern. No tabs are cut off or inaccessible on mobile
  9c. **Cross-page design consistency verified** — a full audit confirms every page uses the same card styles, section headers, spacing rhythm, button variants, form layouts, empty states, and interactive patterns. No page looks like it belongs to a different app

  *Loading & Empty States:*
  9. Every data-loading view has a skeleton loader or spinner that matches the layout it will populate — no layout shift when data arrives
  10. Every list/table has a meaningful empty state with helpful text (not just blank space) — consistent italic muted text pattern across the app
  11. Every form submission shows a loading indicator on the submit button and disables double-submission

  *Error Handling:*
  12. Every server action failure shows a toast notification with a human-readable message — no silent failures, no raw error strings
  13. 404 and error pages are styled, branded, and provide navigation back to the app — not default Next.js error pages
  14. Network/offline errors show a clear, non-technical message with retry option where applicable

  *Mobile & Responsive:*
  15. Every page and dialog is fully usable on mobile (375px+) — no horizontal scroll, no cut-off content, no unreachable buttons
  16. Touch targets are minimum 44x44px on all mobile interactive elements
  17. Sheets and dialogs are properly sized on mobile — full-screen or bottom-sheet pattern, not desktop-sized modals on small screens

  *Accessibility:*
  18. All images and icons have appropriate alt text or aria-label
  19. Color contrast meets WCAG AA (4.5:1 for text, 3:1 for large text) across the entire app in dark mode
  20. Screen reader can navigate the full app — proper heading hierarchy, landmark regions, form labels, and live regions for dynamic content

  *Dark Mode:*
  21. Every component renders correctly in dark mode — no white flashes, no unreadable text, no missing borders that were only visible in light mode
  22. All third-party components (maps, date pickers, etc.) are themed to match dark mode

  *Dashboard Overhaul:*
  23. The owner dashboard is a comprehensive command center — not a sparse placeholder — showing today's route progress, tech locations, revenue snapshot (week/month/YTD), upcoming schedule density, overdue invoices, open work orders, recent customer activity, and quick-action shortcuts to the most common tasks
  24. Dashboard widgets are data-rich with sparklines, trend indicators (up/down arrows with percentages), and at-a-glance status badges — the owner should open the app and immediately know the health of their business without clicking into any other page
  25. Dashboard layout is responsive — cards reflow cleanly from a multi-column desktop grid to a single-column mobile stack

  *Navigation & Sidebar:*
  26. Sidebar items are reordered into a logical, usage-frequency-based hierarchy — most-used items at top (Dashboard, Schedule, Customers, Routes), operational items in the middle (Dispatch, Work Orders, Billing), and admin at the bottom (Settings) — matching industry-standard SaaS sidebar conventions
  27. Sidebar grouping uses visual separators or section labels to distinguish between daily operations, management, and configuration sections
  28. Active sidebar item is clearly highlighted, and the sidebar collapses/expands cleanly on mobile

  *Schedule Page Fixes:*
  29. The "Today" button always navigates to the actual current date — regardless of which day/week is currently selected
  30. Completed stops are locked on the Schedule page — cannot be dragged, reordered, or edited for that day once marked complete (read-only visual treatment)
  50. Schedule page shows all 7 days of the week (Monday–Sunday) — not just weekdays. Many pool companies run Saturday routes and some run Sunday emergency/catch-up routes. Weekend days are fully functional: drag-and-drop assignment, route building, recurring schedule rules, and optimization all work on Saturday and Sunday

  *Dispatch Page Fixes:*
  31. Each tech's route on the dispatch map uses a unique, distinguishable color — not all blue — with a matching color legend showing which color belongs to which tech

  *Routes Page (Tech) Enhancements:*
  32. The route map is fully functional — tech can see their stops plotted on a map with route lines, stop markers with indices, and the ability to tap a marker to see stop details
  33. Day navigation allows techs to view previous and upcoming days' routes — swipe or arrow buttons to browse days, with clear date display
  34. Stops at the same address (e.g. pool + spa) are visually grouped into a single card/entry showing all services, consistent with the co-located stops pattern used on schedule and dispatch maps

  *Icon & Emoji Cleanup:*
  35. No emoji or decorative icons anywhere in the app — Work Orders list, activity logs, page headers, status badges — all cleaned up to be text-driven per brand guidelines

  *Billing Page Polish:*
  36. Invoice detail line items match the work order line item UI quality — taxable indicator ("T" badge), consistent column layout (description, qty, rate, tax, total), inline edit feel, same component patterns as WO line items

  *Email & SMS Polish:*
  37. Every outbound email (service reports, invoices, quotes, receipts, dunning reminders, AutoPay confirmations, pre-arrival, portal messages) is visually polished — consistent branding (company logo, brand color), clean layout, proper spacing, readable on mobile, no broken images or unstyled fallbacks
  38. All emails render correctly across Gmail, Outlook, and Apple Mail — tested with real sends, no clipped content or missing styles
  39. Email subject lines are clear and contextual — not generic ("Invoice from PoolCo") but specific ("Invoice #1042 for March Pool Service — Blue Wave Pools")
  40. SMS messages are concise, professional, and include the company name — no raw URLs without context, no truncated messages

  *Developer Artifact Cleanup:*
  85. Zero references to "Phase X", "coming soon", "will be available", "not yet", "future", "placeholder", or "stub" in any user-facing UI — titles, tooltips, aria-labels, toast messages, empty states, disabled buttons. Code comments are fine but nothing a user can see or inspect should hint at phased development. Every button either works or doesn't exist. Every section either has real data or is hidden entirely. The app must feel like a finished product, not a work in progress. Known instances: routes page map button says "Map view coming in Phase 4" (Phase 4 is built — wire it up or remove), invoice PDF has "placeholder for Phase 7" comment in rendered output

  *Performance & Polish:*
  41. No Cumulative Layout Shift on any page — elements don't jump around as content loads
  42. Page transitions are smooth — no flash of unstyled content, no jarring route changes
  43. All toast notifications use consistent positioning, duration, and styling
  44. Sidebar, header, and navigation look and behave identically across all pages and roles

  *Customer List Polish:*
  45. Customer list supports sorting — by recently serviced (most recent first), alphabetical, route assignment, account status, and date added — with sort state persisted across navigation

  *Integrations Hub:*
  46. Settings page includes an "Integrations" tab showing all connected services (Stripe, QBO, Twilio) with connection status, last sync time, and connect/disconnect actions — single place to manage all third-party integrations

  *Tech Dashboard:*
  47. Tech landing page (dashboard) shows a focused daily summary — today's stop count, clock-in status, current route progress, next stop details, and relevant alerts — not the owner's analytics dashboard

  *Work Order Enhancements:*
  48. Work orders support file attachments (blueprints, plans, specs, manuals, diagrams) uploaded to Supabase Storage — techs see these attachments on their stop view so they know exactly what to do for specialized work (plumbing, equipment installs, etc.)
  80. Work orders support multiple assigned techs — office can assign a crew (2+ techs) to a single WO when the job requires it (e.g. equipment installs, heavy repairs, pool openings). Each assigned tech sees the WO on their route, can log their own time/notes/photos independently, and the WO tracks all contributors. Schema changes from single `assigned_tech_id` to a `work_order_assignments` join table

  *Invoice Hosted View:*
  81. The customer-facing `/pay/[token]` invoice page includes a "Download PDF" button — customer can view the invoice details and download a clean branded PDF without being forced into a payment flow. If the invoice is already paid, the page shows "Paid" status with the PDF download still available as a receipt

  *Calendar Schedule View:*
  49. All roles (owner, office, tech) have a calendar view of their route/schedule — monthly calendar showing stop counts per day, color-coded by status (scheduled, complete, skipped), with click-to-drill into any day's full route list. Owner/office see all techs' schedules overlaid or filterable by tech. Techs see only their own stops. Provides a big-picture view of workload density, coverage gaps, and schedule patterns that the current day-by-day list view doesn't surface

  *Route Page Enhancements:*
  51. Route progress tracker shows separate counts — "X route stops, X work order(s)" (plural when >1) plus a total — instead of lumping everything into "X of Y stops"
  52. Drive time on ALL maps (schedule, dispatch, route) formats as human-friendly durations — "1hr 30 mins" instead of "90 mins", "2hr 15 mins" instead of "135 mins"; under 60 minutes stays as "45 mins"
  53. When multiple services exist at the same stop address (pool + spa, or pool + work order), the route page groups them into a single stop card with a multi-service indicator showing each service as a swipeable page/tab (e.g. "Main Pool", "Spa", "WO: Replace pump") — tech can complete each service independently within the grouped card, and the stop workflow shows sub-pages for each service with its own chemistry/checklist/photos
  54. Stop card shows the service type prominently below the customer name — e.g. "Complete Care" for routine service or "Install new pump motor" for work orders — not buried in small text on a metadata line

  *Field App Overdue Visibility:*
  55. Owner/office see customer account balance and overdue status on the stop card in the field app (badge: "Overdue $X") — useful for knowing a customer hasn't paid while on-site. Techs see a simple "Account overdue" indicator without dollar amounts (role-appropriate: owner sees financials, tech sees status only)

  *Field Estimate/Quote Creation:*
  56. Owner can create and send a quote/estimate directly from the field app while at a job — tap "Create Estimate" from the stop detail or customer profile, add line items (parts + labor), generate PDF, and send via email/SMS to the customer on the spot. Uses the existing quote infrastructure (Phase 6) with a mobile-optimized creation UI

  *Chemistry Range Refinements:*
  57. Chemistry color indicators use a 3-zone system (green/yellow/red) with yellow warning zones at range boundaries — pH shows yellow at 7.2 and 7.8 (not jumping straight to red), alkalinity shows yellow at 60-80 and 120-140 (approaching out-of-range). Configurable via org_settings custom_chemistry_targets. Default ranges refined based on real pool tech feedback

  *Branding: PoolCo → DeweyIQ:*
  58. Replace every instance of "PoolCo" with "DeweyIQ" across the entire codebase — app name in manifest, page titles, login/auth pages, sidebar, header fallback, PWA metadata, portal shell, email from-names, PDF headers, QBO integration labels, Stripe descriptions, offline DB name, CSS comments, error messages — 97 occurrences across 37 source files. The product name is DeweyIQ, not PoolCo
  59. DeweyIQ logo (from `/Users/aaronmattia/Documents/DeweyIQ/Logos/Main Logo (req dark bg).png`) is displayed everywhere the brand appears — login page, sidebar header, app header, PWA splash screen, manifest icons, favicon, portal shell, auth pages, marketing site, loading screens. Logo requires dark background (matches dark-first design system)
  60. All customer-facing emails (service reports, invoices, quotes, receipts, dunning, pre-arrival, portal messages, AutoPay confirmations) show the pool company's own logo at the top (from org_settings company_logo), and include a "Powered by DeweyIQ" footer with the DeweyIQ logo at the bottom of every email — establishes the platform brand while letting each pool company own their customer relationship
  61. All PDF documents (quotes, invoices, service reports, proposals) follow the same pattern — pool company logo/branding at the top, "Powered by DeweyIQ" with small logo in the footer

  *Route Deviation & Tech Safety Monitoring:*
  62. During an active route, the system tracks each tech's GPS position at configurable intervals (30-60 seconds) and compares it against a "route corridor" around the planned route polyline (configurable width, default 0.5 mile) — when a tech leaves the corridor beyond a configurable grace period (default 5 minutes for gas/bathroom stops), escalating alerts fire to a configurable recipient chain (e.g. office first at 5 min, owner at 15 min, or both immediately — fully customizable per-tech or globally in Settings)
  63. The existing dispatch map is enhanced with real-time fleet tracking — tech markers update live with color-coded status: on-route (green), slightly off-route (yellow), significantly off-route (red), unresponsive (flashing red) — showing each tech's current GPS position overlaid on their planned route lines, not a separate map
  64. Off-route alerts include: tech name, map showing last known position vs planned route, distance off-route, duration off-route, and a "View Live Location" link — delivered via push notification, in-app alert, and SMS to the configured escalation chain recipients
  65. The existing break system (BreakButton / break_events from Phase 11 time tracking) automatically suppresses route deviation alerts while a tech is on break — no separate "taking a break" concept needed. Owner-configurable max break duration cap applies; when a break exceeds the cap, the system sends an "extended break" alert to the configured escalation chain (e.g. "Jake has been on break for 25 min — cap is 15 min") and deviation alerts resume. Break time is logged in both the time-tracking system and the route compliance report
  66. Emergency panic button on the tech app immediately sends live GPS location to all configured emergency contacts (owner, office, custom numbers) with highest-priority alerts — separate from passive deviation detection, works even if tech is on-route
  67. End-of-day route compliance report shows planned vs actual path overlay on a map, total off-route time, deviation count, break time taken, and flagged incidents — accessible per-tech and as a fleet summary for owner/office
  68. All alert thresholds are configurable per-tech or globally in Settings: corridor width, grace period before alert, escalation timing, notification recipients, break duration cap, panic button contacts
  69. Route deviation detection integrates with the existing Phase 10 "unresponsive tech" alert — a tech who is both off-route AND unresponsive triggers the highest severity alert level (combined signal)
  70. System logs all route deviations with timestamps, GPS coordinates, duration, and resolution (returned to route, on break, completed route, etc.) for historical review and accountability

  *Customizable Roles & Permissions:*
  71. Owner can create custom roles beyond the default three (owner, office, tech) — e.g. "Senior Tech", "Office Manager", "Dispatcher", "Trainee" — each with a display name and color badge
  72. Each role has granular permissions controlling what the user can see and do, organized by area: Customers (view/create/edit/delete), Schedule (view/assign/edit routes), Work Orders (view/create/approve/invoice), Billing (view invoices/send invoices/process payments/view reports), Settings (view/edit company settings/manage team/manage roles), Dispatch (view map/reassign stops), Reports (view revenue/view profitability/view payroll), Route Monitoring (view fleet map/configure alerts)
  73. Permissions UI in Settings shows a role editor with a matrix of areas vs. actions — owner toggles checkboxes per role, with sensible defaults for new roles based on the closest built-in role (tech, office, or owner)
  74. The three built-in roles (owner, office, tech) serve as immutable templates — owner always has full access, but office and tech defaults can be cloned into custom roles and modified. Built-in roles themselves cannot be deleted but their permissions can be adjusted (except owner which stays full-access)
  75. Sidebar navigation, page access, and UI elements (buttons, sections, tabs) respect the role's permissions — users only see pages and actions they have access to, no disabled/grayed-out items for things they can't do (hidden, not disabled)
  76. RLS policies and server actions enforce permissions server-side — not just UI hiding. A user without "Billing: process payments" permission gets denied at the API level, not just missing the button
  77. When assigning a team member, owner picks from the list of custom roles (or built-in roles) — the role's permissions apply immediately and the user's sidebar/access updates on next page load

  *SMS Compliance & Rate Limiting:*
  78. SMS opt-out handling is fully wired — Twilio's Advanced Opt-Out (STOP/UNSUBSCRIBE/CANCEL) is enabled and verified, opted-out numbers are synced to the app (webhook or Twilio API check before send), and the system never sends SMS to a customer who has opted out. Customer's opt-out status is visible on their profile. Legally required under TCPA/CTIA guidelines
  79. Internal SMS safety guardrails (completely invisible — no UI, no settings, no indication limits exist) — per-number throttle (max 4 SMS per number per hour for non-transactional messages), internal cost circuit breaker that alerts us (platform admin, not the customer) if an org's SMS spend looks anomalous so we can investigate bugs, and broadcast messages queued in batches to avoid carrier filtering. Limits exist purely to catch runaway bugs — normal usage never hits them. SMS is unlimited, period

  *Stripe Embedded Onboarding:*
  82. Stripe Connect onboarding uses embedded components (`ConnectAccountOnboarding` from `@stripe/react-connect-js`) so the pool company completes KYC/identity verification without leaving DeweyIQ — styled to match the app's dark-first design system. Replaces the current Stripe-hosted redirect flow from Phase 7. The embedded flow creates a connected Stripe account for the pool company automatically — they never need to visit stripe.com or know they have a "Stripe account." Fields are pre-filled from their DeweyIQ org profile (company name, address, email, phone) so they only enter what's new (EIN/SSN, bank account for payouts, ID verification). Before onboarding starts, a clear fee disclosure screen shows: "Stripe charges 2.9% + $0.30 per card payment and 0.8% per ACH payment (capped at $5). These fees are deducted from each payment before it reaches your bank — DeweyIQ does not add any additional fees." Fee info also permanently visible in Settings → Payments after setup. Every edge case handled:
      - Owner starts onboarding but closes the app mid-way → resumes exactly where they left off on next visit (Stripe persists onboarding state)
      - Stripe requests additional documents (ID verification, bank statement) → in-app notification + banner "Stripe needs more info" with one-tap return to the embedded onboarding component
      - Onboarding completes → webhook confirms `account.updated` with `charges_enabled: true` → Settings → Payments immediately reflects "Connected" status with no page refresh needed
      - Owner's Stripe account gets restricted after onboarding (disputes, compliance) → app detects `requirements.currently_due` via webhook and shows actionable banner "Action needed on your payment account" linking back to embedded remediation flow
      - Owner wants to disconnect Stripe → confirmation dialog explains impact (AutoPay stops, pending payouts still process, customers can't pay online), disconnect action revokes OAuth and clears connected account ID
      - Multiple failed identity verification attempts → clear error messaging from Stripe's embedded UI, not raw API errors
      - Owner tries to process payments before onboarding is complete → blocked with "Finish setting up payments first" prompt linking to the onboarding component
      - Owner already has an existing Stripe account → embedded flow detects and offers to link it instead of creating a new one
      - "Powered by Stripe" badge visible on the onboarding flow, Settings → Payments page, and every customer-facing payment page (/pay/[token]) — makes it clear Stripe is the payment processor, not DeweyIQ. Links to Stripe's terms of service and Stripe's privacy policy are shown during onboarding and accessible from Settings → Payments. The owner's agreement is with Stripe for payment processing — Coastal Bay Digital LLC / DeweyIQ is not a party to the payment processing relationship and bears no liability for payment disputes, chargebacks, or fund holds

  *Offline Verification:*
  83. Full offline capability audit and verification — every field tech workflow confirmed working without connectivity, every edge case handled:
      - Route view loads from Dexie cache with full customer/pool/equipment/checklist data
      - Chemistry logging saves locally with LSI calculation and dosing recommendations (all computed client-side, no server needed)
      - Checklist completion persists with per-task notes
      - Photos store as compressed blobs in IndexedDB and queue for Supabase Storage upload on reconnect — verified working with 50+ photos queued (stress test)
      - Stop completion queues the server action including all chemistry, checklist, photos, and notes — entire stop payload preserved
      - Clock in/out and break start/end persist locally and sync
      - Internal notes save locally
      - App killed mid-stop (force close, phone dies, battery dies) → on reopen, draft is intact in Dexie with all entered data, tech resumes where they left off
      - Signal drops mid-sync (partial upload) → sync queue retries with exponential backoff, no duplicate writes, no partial data on server
      - Tech works offline all day (rural area, no signal) → entire day's work (10+ completed stops with chemistry, photos, checklists) syncs successfully when they return to connectivity
      - Conflict resolution: if office edits a customer record while tech is offline and tech syncs stale data, server-side timestamp comparison prevents overwriting newer data — last-write-wins with server as authority for non-stop data, tech's stop data always wins (they were there)
      - Storage pressure: if device runs low on IndexedDB space, the app warns the tech before it becomes a problem — "Storage low, connect to sync" banner
      - Multiple tabs/windows: Dexie changes propagate across tabs so the tech doesn't see stale data if they have the app open in multiple browser tabs
  84. Offline data prefetch is verified — when a tech opens the app with connectivity, today's full route (customers, pools, equipment, checklists, previous chemistry readings, stop details, work order attachments) downloads to Dexie so the entire day's work is available offline before they leave the shop. Prefetch shows a progress indicator and confirms "Route data ready — you're good to go offline" before the tech heads out
**Plans**: TBD

Plans:
- [ ] TBD (run /gsd:plan-phase 16 to break down)

### Phase 17: Marketing Site & Subscription Billing
**Goal**: The public-facing marketing site converts pool company owners into paying customers with a visually stunning, conversion-optimized experience — interactive app demos, competitor comparisons, ROI calculator, and a frictionless multi-step sign-up flow — backed by Stripe subscription billing with tiered pricing, usage enforcement, and graceful failed payment handling
**Depends on**: Phase 1 (auth, multi-tenant RLS, org model). Marketing site benefits from all prior phases being complete (more features to showcase).
**Requirements**: SUB-01, SUB-02, SUB-03, SUB-04, SUB-05, SUB-06, SUB-07, SUB-08, SUB-09, SUB-10, MKT-01, MKT-02, MKT-03, MKT-04, MKT-05, MKT-06, MKT-07, MKT-08
**Success Criteria** (what must be TRUE):

  *Marketing Site:*
  1. A pool company owner lands on the marketing site and immediately understands what PoolCo does, who it's for, and why it's better — within 5 seconds of page load
  2. The hero section features an animated app mockup (phone + desktop) showing real PoolCo screens with auto-rotating feature highlights — not static screenshots
  3. Each major feature area (Field Tech, Scheduling & Routes, Dispatch, Billing, Customer Portal, Work Orders) has a dedicated deep-dive section with app mockups, benefit bullets, and visual workflow demonstrations
  4. A side-by-side competitor comparison table lets visitors toggle between Skimmer, Pool Brain, FieldPulse, and ServiceTitan — showing where PoolCo wins with honest, trust-building comparisons
  5. An interactive pricing calculator lets visitors slide their pool count and see which tier they fall into — Starter (1-79 pools, $99/mo), Pro (80-200 pools, $199/mo), Enterprise (200+ pools, $349/mo) — with annual savings callout (2 months free), all features included in every tier, no per-pool or per-tech fees
  6. An ROI calculator shows estimated time/money savings based on company size (pools, techs, hours spent on admin)
  7. A "Day in the Life" walkthrough section shows both the tech's morning (open app → see route → complete stops → auto-reports sent) and the owner's dashboard (dispatch map, billing insights, customer messages) — making the value tangible
  8. Social proof section includes testimonials, company logos, and live platform stats (stops completed, invoices generated, pools managed)
  9. The entire marketing site scores 90+ on Lighthouse for Performance, Accessibility, Best Practices, and SEO — loads in under 2 seconds on mobile
  10. The marketing site is fully responsive and looks stunning on mobile — pool company owners browse on their phones

  *Sign-Up & Onboarding:*
  11. A visitor can go from landing page to inside the app in under 2 minutes — email/password or Google OAuth, company name, "how many pools?" and they're in
  12. The sign-up flow is a multi-step wizard (account → company profile → team size → first customer or CSV import) with progress bar, 2-3 fields per step, and the ability to skip optional steps
  13. A "Switch from Skimmer" migration path guides users through CSV import with field mapping
  14. Progress is saved at every step — if a user leaves and returns, they resume exactly where they left off
  15. 14-day free trial starts immediately with no credit card required

  *Auth & Navigation Edge Cases:*
  16. The existing `/login` page "Sign Up" button links to the new marketing sign-up flow — not a separate auth-only registration page
  17. Every entry point to sign-up converges on the same onboarding wizard: marketing CTAs, `/login` sign-up link, direct `/signup` URL, pricing page "Start Free Trial", Google search landing
  18. Logged-out users hitting any `/app` route are redirected to `/login`, which prominently shows both "Log In" and "Sign Up" paths
  19. A user who signs up but abandons onboarding mid-wizard can log back in and resume — not stuck in limbo with a half-provisioned org
  20. A user who already has an account clicking "Sign Up" is recognized and redirected to login (not allowed to create a duplicate)
  21. Password reset, email verification, and OAuth error states all have polished, branded pages with clear next steps — no raw Supabase error screens
  22. After trial expiry, the login flow still works — user lands on the subscription paywall, not a broken dashboard

  *Subscription Billing:*
  23. An owner can select a plan — Starter ($99/mo, 1-79 pools), Pro ($199/mo, 80-200 pools), or Enterprise ($349/mo, 200+ pools), monthly or annual (2 months free) — and complete checkout via Stripe; subscription activates immediately
  24. An owner can view their current plan, pool usage, invoice history, and manage payment methods from the Settings → Billing tab
  25. Payment method management is fully in-app using Stripe Elements (PaymentElement + SetupIntent) — no redirect to Stripe-hosted portal; owner can add/remove cards, add bank accounts (ACH), update expired cards, and complete 3DS re-verification all within the Settings → Billing tab; styled to match the app's design system; never handles raw card data (Stripe.js handles PCI compliance)
  26. An owner can cancel their subscription (takes effect at period end) and reactivate before period end — cancel shows clear "active until [date]" messaging, not instant cutoff
  27. An owner can upgrade (immediate, prorated) or downgrade (takes effect next billing cycle) their tier
  28. Switching from monthly to annual (or vice versa) is seamless — prorated credit applied, no double-charge, clear confirmation of what changes and when
  29. Pool creation is soft-blocked when the tier's pool limit is exceeded (7-day grace period, then blocked with upgrade prompt)
  30. Failed payments trigger a 7-day grace period, after which the account enters read-only mode with a full-screen overlay guiding the owner to fix billing
  31. Successful payment after restriction lifts all restrictions automatically — no manual intervention, no support ticket needed
  32. If a card expires and auto-renewal fails, the owner gets an in-app banner + email notification with a direct link to update their payment method — before the grace period even starts
  33. Subscription status is always accurate in the app — webhook-synced, not stale; covers edge cases: partial refunds, disputed charges, Stripe-initiated cancellations, payment method removed externally via Stripe dashboard
  34. Only the owner role can access the Billing tab and manage the subscription — techs and office users see the trial/expiry banner but cannot change billing
  35. Subscription invoices are branded with the DeweyIQ logo and available as downloadable PDFs from the Settings → Billing invoice history — Stripe invoice branding configured with DeweyIQ logo, colors, and company info so invoices look professional whether viewed in-app or forwarded to an accountant

  *Legal & Compliance:*
  36. All legal documents identify **Coastal Bay Digital LLC** as the contracting entity operating DeweyIQ — "DeweyIQ is a product of Coastal Bay Digital LLC" appears in all legal page headers and footers until DeweyIQ is its own entity
  37. **Terms of Service** covers: account creation and eligibility, acceptable use, prohibited conduct, user content ownership, data processing, service availability (no uptime SLA guarantees beyond commercially reasonable efforts), subscription billing terms (auto-renewal, cancellation, refund policy), limitation of liability (cap at fees paid in prior 12 months), disclaimer of warranties (provided "as is"), indemnification (customer indemnifies Coastal Bay Digital LLC for misuse), governing law and jurisdiction, dispute resolution (binding arbitration with small claims exception), modification of terms (30-day notice for material changes), termination rights (either party, with data export window), and severability
  38. **Privacy Policy** covers: data collected (account info, pool/customer data, GPS location of techs, usage analytics, payment info via Stripe), how data is used, data sharing (only with service providers: Supabase, Stripe, Twilio, QuickBooks — never sold to third parties), data retention (active account + 90 days post-deletion for backups), user rights (access, correction, deletion, export), cookies and tracking, children's privacy (not directed at under-13), California/CCPA disclosures, international users notice, breach notification commitment (72 hours), and contact info for privacy inquiries
  39. **Data Processing Agreement (DPA)** covers: Coastal Bay Digital LLC as data processor, customer as data controller, GDPR-ready provisions (even if not currently required — future-proofing), sub-processors list (Supabase, Stripe, Twilio, Vercel, OpenRouteService), data location (US), security measures, breach notification, data deletion on termination, and audit rights
  40. **Acceptable Use Policy** covers: no scraping/reverse engineering, no sharing accounts, no uploading malicious content, no using the platform for illegal activity, usage limits (API rate limits, storage caps per tier), and consequences of violation (warning → suspension → termination)
  41. **Cookie Policy** covers: essential cookies (auth session, CSRF), functional cookies (user preferences, sidebar state), analytics cookies (if any — currently none), third-party cookies (Stripe), and how to manage cookie preferences
  42. **Billing Terms** covers: flat-tier pricing with no hidden fees, billing cycle (monthly or annual), auto-renewal, proration on plan changes, refund policy (prorated refund within 30 days for annual, no refund for monthly), failed payment handling (3 retry attempts over 7 days, then read-only mode), tax responsibility (customer responsible for applicable taxes), and price change notice (60 days for existing customers)
  43. Sign-up flow requires checkbox agreement to Terms of Service and Privacy Policy before account creation — with direct links to each document; agreement timestamp and IP are logged for legal record
  44. All legal pages are accessible from the marketing site footer, the in-app Settings page, and the sign-up flow — rendered as clean, readable pages (not raw text dumps), with a "Last updated" date and version history
  45. Legal documents are stored as versioned content — when terms change, existing users see an in-app banner requiring re-acceptance of updated terms before continuing to use the app, with a diff/summary of what changed

  *Account Lifecycle After Cancellation:*
  46. When a subscription ends (cancellation or failed payment not recovered), the account automatically transitions through: **Active → Read-Only (30 days) → Scheduled Deletion (email warning 7 days before) → Deleted**. No manual intervention needed — a scheduled job handles the entire lifecycle
  47. During the 30-day read-only window, the owner can still log in, view all data, and export — but cannot create/edit customers, complete stops, send invoices, or perform any write operations. A persistent banner shows "Your account is read-only. [Export Data] [Resubscribe] — data will be deleted on [date]"
  48. **"Export My Data"** button in Settings → Billing generates a full data export as a ZIP file containing: customers (CSV), pools & equipment (CSV), service history with chemistry readings (CSV), invoices & payments (CSV), quotes (CSV), work orders (CSV), photos (folder of originals from Supabase Storage), route history (CSV), team members (CSV), and org settings (JSON). The export runs as a background job — owner gets an email with a secure download link when it's ready (link expires in 7 days)
  49. The export button is available at all times (not just after cancellation) — an active subscriber can export their data whenever they want from Settings → Billing. This is also a legal requirement (CCPA/GDPR right to data portability)
  50. 7 days before scheduled deletion, the system sends a final warning email: "Your DeweyIQ data will be permanently deleted on [date]. [Export Data] [Resubscribe]" — with direct action links
  51. If the owner resubscribes during the read-only window, full access is restored immediately — all data intact, no re-import needed. If they resubscribe after deletion, they start fresh with a new empty org
  52. On deletion, the system permanently removes all org data (customers, pools, invoices, service history, photos, routes, team members, settings) from the database and Supabase Storage. Stripe subscription/payment records are retained by Stripe per their own retention policy. A deletion confirmation email is sent to the owner
**Plans**: 14 plans

Plans:
- [ ] 17-01-PLAN.md — Marketing site foundation: subdomain routing middleware (deweyiq.com → marketing pages, app.deweyiq.com → app behind auth, portal subdomain routing preserved), public route group layout under src/app/(marketing)/, shared marketing components (navigation, footer with legal links, CTA buttons), dark-first design system tokens for marketing pages, responsive grid system, Framer Motion setup, SEO infrastructure (meta tags, OG images, structured data, sitemap.xml, robots.txt), legal pages (Terms of Service, Privacy Policy, DPA, Cookie Policy, Acceptable Use, SLA, Billing Terms)
- [ ] 17-02-PLAN.md — Hero section & navigation: full-viewport cinematic hero with gradient mesh background, animated phone + desktop mockups showing real app screens, auto-rotating feature highlights with smooth transitions, bold headline + subhead + CTA, sticky navigation with smooth scroll to sections, mobile hamburger menu
- [ ] 17-03-PLAN.md — Feature deep-dive sections: 6 feature areas (Field Tech App, Scheduling & Routes, Real-Time Dispatch, Billing & Payments, Customer Portal, Work Orders & Quoting) — each with phone/desktop mockup, 3 benefit bullets, visual workflow demonstration, scroll-triggered entrance animations, tabbed feature switching within each section
- [ ] 17-04-PLAN.md — Interactive app demo: sandboxed read-only demo environment showing route view, chemistry logging, dispatch map, billing dashboard — visitors can click through real UI without signing up, guided tour overlay with hotspots, "Try it yourself" CTA at each feature section
- [ ] 17-05-PLAN.md — Competitor comparison & "Day in the Life": interactive comparison table with toggle between Skimmer/Pool Brain/FieldPulse/ServiceTitan, feature-by-feature breakdown with check/cross indicators, honest positioning, "Why companies switch" callouts; "Day in the Life" walkthrough section showing tech morning + owner dashboard with scroll-animated timeline
- [ ] 17-06-PLAN.md — Pricing & ROI calculator: interactive pricing section with pool count slider, 3 flat tiers (Starter $99/mo 1-79 pools, Pro $199/mo 80-200 pools, Enterprise $349/mo 200+ pools), annual toggle showing 2 months free ($990/$1,990/$3,490 per year), all-features-included emphasis, "unlimited SMS included" callout (vs Skimmer $0.029/msg), "unlimited techs & office users" callout (vs Pool Brain $55/tech), no per-pool or per-tech fees, competitor price comparison examples, FAQ accordion; ROI calculator (input: pools, techs, admin hours → output: time saved, money saved, payback period)
- [ ] 17-07-PLAN.md — Social proof & trust: testimonial cards with photos/company names, company logo bar, live platform stats with counter animations (pools managed, stops completed, invoices sent), case study preview cards, trust badges (SSL, Stripe, SOC2-ready), press mentions section
- [ ] 17-08-PLAN.md — Sign-up flow & onboarding wizard: multi-step wizard (account creation → company profile with logo upload → service details/pool count → invite team → first customer or CSV import → guided dashboard tour), progress bar, field validation, Google OAuth, step-level progress persistence, Skimmer migration path with CSV field mapping
- [ ] 17-09-PLAN.md — Schema + Stripe setup: subscriptions table with enums (status, tier, billing_interval), src/lib/stripe.ts client singleton, shared `src/lib/pricing-config.ts` single source of truth for tier definitions (name, pool limits, display prices, Stripe Price IDs — Starter 1-79 pools $99/$990, Pro 80-200 pools $199/$1990, Enterprise 200+ pools $349/$3490) imported by BOTH marketing pricing page AND checkout logic so prices stay in sync, webhook signature verification utility
- [ ] 17-10-PLAN.md — Checkout & trial: createCheckoutSession action with card + ACH bank transfer payment methods enabled, trial creation on signup (14-day, no card), Stripe Checkout redirect, success/cancel pages, trial banner component visible to all roles, "Save ~3% with bank transfer" nudge on annual plans
- [ ] 17-11-PLAN.md — Stripe webhook handler: /api/webhooks/stripe route handling checkout.session.completed, customer.subscription.created/updated/deleted, invoice.payment_succeeded/failed, customer.subscription.trial_will_end — with idempotent event processing
- [ ] 17-12-PLAN.md — Subscription management UI: owner-only "Billing" tab in /settings with current plan card, pool usage bar with tier limit, invoice history from Stripe API, cancel/reactivate flows, upgrade/downgrade with proration, in-app payment method management via Stripe Elements (PaymentElement + SetupIntent, styled to match app design system)
- [ ] 17-13-PLAN.md — Usage enforcement & failed payments: pool count tracking with real-time limit checking, 7-day grace period for over-limit, upgrade prompt dialog, failed payment grace period, account restriction (read-only mode with full-screen blocker), payment recovery flow, automatic restriction lift on successful payment
- [ ] 17-14-PLAN.md — End-to-end verification: marketing site Lighthouse audit (90+ all categories), sign-up flow end-to-end test, subscription lifecycle with Stripe test mode (trial → checkout → active → cancel → reactivate → failed payment → recovery), mobile responsiveness audit, competitor comparison accuracy review

### Phase 18: Production Launch
**Goal**: Deploy the entire platform to production, switch every external service from test/dev to live, configure production infrastructure, and verify the complete system works end-to-end in the real world — this is the "flip the switch" phase
**Depends on**: All prior phases complete
**Requirements**: TBD
**Success Criteria** (what must be TRUE):

  *Staging Environment:*
  1. Staging environment live at `staging.deweyiq.com` — separate Supabase project (free tier), Stripe test keys, Twilio test number, Resend sandbox — mirrors production architecture but with zero real money/data
  2. Staging auto-deploys from a `staging` branch on Vercel — every merge to staging is instantly testable
  3. Full end-to-end testing on staging before any production deploy: sign up → onboard → add customer → build route → complete stops → generate invoice → pay → QBO sync → customer portal — all verified working with test data
  4. Staging serves as the safe testing ground for all pre-launch QA — no risk of touching real data or live services

  *Vercel Production Deployment:*
  5. Next.js app deployed to Vercel Pro, connected to GitHub repo with automatic deployments on push to main
  6. Custom domain configured with SSL, DNS propagated, www redirect working
  7. All environment variables set in Vercel via CLI (`vercel env add`) — pulled from production credentials, not dev/test keys. Note: `RESEND_API_KEY` must be set in **both** Vercel env vars (for Next.js server actions) and Supabase secrets (for Edge Functions) — same key, two locations
  8. Preview deployments working on PR branches for future development

  *Stripe Live Mode:*
  9. Stripe account identity verification complete (business info, bank account for payouts)
  10. Live API keys (`pk_live_`, `sk_live_`) set in Vercel env vars, replacing test keys
  11. Stripe products/prices created in live mode matching the 3 tiers (Starter $99/$990, Pro $199/$1990, Enterprise $349/$3490)
  12. Production webhook endpoint configured in Stripe pointing to the live Vercel URL
  13. Stripe Connect onboarding tested end-to-end in live mode (pool company connects their own Stripe account)

  *Twilio Production:*
  14. Production Twilio phone number purchased and configured
  15. Supabase secrets updated with live Twilio credentials (`TWILIO_ACCOUNT_SID`, `TWILIO_AUTH_TOKEN`, `TWILIO_PHONE_NUMBER`)
  16. SMS sending verified — pre-arrival, invoice, quote, and weather delay messages all deliver successfully

  *Supabase Production:*
  17. Supabase project on Pro plan with spend cap raised/disabled for production traffic
  18. Auth redirect URLs updated to production domain (login, OAuth callbacks, magic links, password reset)
  19. Edge functions deployed and pointing to production secrets
  20. RLS policies verified — no NULL USING/WITH CHECK conditions (the known drizzle-kit push pitfall)
  21. Database backups enabled and verified (point-in-time recovery)

  *Monitoring & Alerting:*
  22. Vercel analytics enabled for Web Vitals monitoring (LCP, CLS, FID)
  23. Error tracking configured (Sentry or Vercel's built-in) — server action failures, client errors, and unhandled exceptions all captured
  24. Supabase spend alerts configured at 50%, 75%, 90% of budget thresholds
  25. Stripe webhook failure alerts enabled
  26. Uptime monitoring configured (ping production URL every 5 min, alert on downtime)

  *Production Smoke Test:*
  27. Complete end-to-end test with real data: sign up → onboard → add customer → add pool → create schedule → run route → complete stops → generate invoice → send invoice → collect payment → view reports — every feature touched
  28. PWA install and offline mode verified on real iOS and Android devices
  29. Email delivery verified (service reports, invoices, quotes) — check spam score, rendering across Gmail/Outlook/Apple Mail
  30. SMS delivery verified on real phone numbers
  31. Customer portal tested from a real customer's perspective (magic link login, view history, pay invoice, send message)
  32. Performance verified — production load times under 2s on 4G mobile connection

  *Security & Compliance:*
  33. All API keys and secrets are production-grade (no test/dev keys left anywhere)
  34. HTTPS enforced on all routes, no mixed content warnings
  35. CSP headers configured, XSS protection verified
  36. Legal pages (ToS, Privacy Policy, etc.) live and linked from footer
**Plans**: TBD

Plans:
- [ ] TBD (run /gsd:plan-phase 18 to break down)

## Progress

**Execution Order:**
Phases execute in numeric order: 1 → 2 → 3 → 4 → 5 → 6 → 7 → 8 → 9 → 10 → 11 → 12 → 13 → 14 → 15 → 16 → 17 → 18

| Phase | Plans Complete | Status | Completed |
|-------|----------------|--------|-----------|
| 1. Foundation | 0/6 | Complete | 2026-03-05 |
| 2. Customer & Pool Data Model | 0/4 | Complete | 2026-03-06 |
| 3. Field Tech App | 8/8 | Complete | 2026-03-08 |
| 4. Scheduling & Routing | 7/7 | Complete | 2026-03-09 |
| 5. Office Operations & Dispatch | 0/6 | Complete | 2026-03-10 |
| 6. Work Orders & Quoting | 0/8 | Complete | 2026-03-11 |
| 7. Billing & Payments | 0/9 | Complete | 2026-03-13 |
| 8. Customer Portal | 0/5 | Complete    | 2026-03-13 |
| 9. Reporting & Team Analytics | 0/5 | Not started | - |
| 10. Smart Features & AI | 0/13 | Not started | - |
| 11. Payroll, Team Mgmt & Accounting | 0/23 | Not started | - |
| 12. Projects & Renovations | 0/16 | Not started | - |
| 13. Truck Inventory & Shopping Lists | 0/4 | Not started | - |
| 14. Service Agreements & Contracts | 0/9 | Complete    | 2026-03-25 |
| 15. Intelligent Billing Automation | 0/0 | Not started | - |
| 16. UI Polish & Launch Readiness | 0/0 | Not started | - |
| 17. Marketing Site & Subscription Billing | 0/14 | Not started | - |
| 18. Production Launch | 0/0 | Not started | - |
