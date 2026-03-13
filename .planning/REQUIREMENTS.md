# Requirements: Pool Company Management SaaS

**Defined:** 2026-03-03
**Core Value:** A pool tech can run their entire day from one app with minimal friction — while office and customers stay in the loop automatically.

## v1 Requirements

Requirements for initial release. Each maps to roadmap phases.

### Authentication & Access

- [ ] **AUTH-01**: User can sign up with email and password
- [ ] **AUTH-02**: User can log in and session persists across browser refresh
- [ ] **AUTH-03**: User can reset password via email link
- [ ] **AUTH-04**: Owner can invite team members (office staff, techs) with role assignment
- [ ] **AUTH-05**: System enforces role-based permissions (owner sees all, office manages operations, tech sees own route, customer sees own data)
- [ ] **AUTH-06**: Multi-tenant isolation ensures companies cannot see each other's data

### Customer Management

- [ ] **CUST-01**: Office can create customer profiles (name, address, phone, email, gate codes, access notes)
- [ ] **CUST-02**: Office can add pool profiles per customer (volume, surface type, sanitizer type, special notes)
- [ ] **CUST-03**: System supports multiple bodies of water per customer (pool, spa, fountain) with distinct configurations
- [ ] **CUST-04**: Office can track equipment per pool (pump, filter, heater — brand, model, install date, service history)
- [ ] **CUST-05**: Office can search and filter customers by name, address, route, or status
- [ ] **CUST-06**: System stores complete service history per customer accessible from their profile

### Field Operations

- [ ] **FIELD-01**: Tech can view daily route with ordered stop list and map view
- [ ] **FIELD-02**: Tech can navigate to next stop via map link (Apple Maps / Google Maps)
- [ ] **FIELD-03**: Tech can enter chemical readings per stop (free chlorine, combined chlorine, pH, alkalinity, CYA, TDS, calcium hardness, phosphates, salt)
- [ ] **FIELD-04**: System calculates and displays LSI (Langelier Saturation Index) from entered readings
- [ ] **FIELD-05**: System recommends chemical dosing based on readings, pool volume, sanitizer type, and target ranges
- [ ] **FIELD-06**: Tech can complete customizable service checklists per stop (skim, brush, vacuum, empty baskets, backwash, etc.)
- [ ] **FIELD-07**: Tech can capture and attach photos to each stop
- [ ] **FIELD-08**: Tech can add notes per stop
- [ ] **FIELD-09**: Tech can mark stop as complete with one tap after entering data
- [ ] **FIELD-10**: All field operations work offline and sync automatically when connectivity returns
- [ ] **FIELD-11**: Stop completion workflow is optimized for speed — target 60 seconds per routine stop
- [ ] **FIELD-12**: System auto-generates branded service report after stop completion
- [ ] **FIELD-13**: Service report is automatically emailed to customer (configurable per customer)

### Scheduling & Routing

- [ ] **SCHED-01**: Office can build routes and assign stops to techs
- [ ] **SCHED-02**: Office can set recurring service schedules per customer (weekly, bi-weekly, monthly, custom)
- [ ] **SCHED-03**: System auto-generates recurring stops based on service schedules
- [ ] **SCHED-04**: Office can drag-and-drop to reorder stops within a route
- [ ] **SCHED-05**: System provides one-click route optimization to minimize drive time
- [ ] **SCHED-06**: Office can view real-time route progress on a live map (tech locations, completed stops)
- [ ] **SCHED-07**: System provides AI-powered route optimization using ML (traffic patterns, service duration history, geography)
- [ ] **SCHED-08**: System auto-schedules and balances workloads across techs based on service levels and availability

### Billing & Payments

- [ ] **BILL-01**: Office can create invoices with multiple billing models (per-stop, monthly flat rate, per-chemical, custom line items)
- [ ] **BILL-02**: System supports bulk invoice generation (batch invoicing for all customers)
- [ ] **BILL-03**: Customers can pay invoices online via credit card or ACH — through Stripe Connect (company's own Stripe) or QuickBooks Payments
- [ ] **BILL-04**: System supports AutoPay — customers can save payment method and auto-charge on invoice generation
- [ ] **BILL-05**: System retries failed payments with configurable dunning schedule
- [ ] **BILL-06**: System provides bi-directional sync with QuickBooks Online (customers, invoices, payments, expenses)
- [ ] **BILL-07**: System includes built-in accounting — P&L, expense tracking, revenue reporting, bank reconciliation
- [ ] **BILL-08**: System supports surcharging / convenience fee passthrough on credit card payments, configurable per payment method
- [ ] **BILL-09**: System provides tax prep exports and financial reporting
- [ ] **BILL-10**: Companies choose their payment stack — Stripe Connect for direct processing, QuickBooks Payments via QBO sync, or both simultaneously

### Customer Portal

- [ ] **PORT-01**: Customer can view service history with reports, photos, and chemical readings
- [ ] **PORT-02**: Customer can view and pay invoices through the portal
- [ ] **PORT-03**: Customer can update their payment method and contact information
- [ ] **PORT-04**: Customer can request one-off services (green pool cleanup, opening/closing, repairs)
- [ ] **PORT-05**: Customer can send messages to the company through the portal
- [ ] **PORT-06**: Portal displays company branding (logo, colors)
- [ ] **PORT-07**: Portal supports multi-company customers — a homeowner serviced by multiple companies on the platform can see each company's data in a branded, separated context (company picker on login or unified dashboard with company sections)
- [ ] **PORT-08**: Portal handles company-switch gracefully — if a customer leaves Company A and joins Company B, their Company B portal works independently; Company A data is no longer visible (but preserved in Company A's records)

> **Edge case notes (PORT-07 / PORT-08):**
> - A single email may be a customer at multiple orgs. Auth must support multiple org associations for the `customer` role (unlike staff who belong to one org).
> - Portal login should resolve which org(s) the email belongs to. If only one → go straight in. If multiple → show a company picker with each company's branding.
> - Each company's data is fully isolated — service history, invoices, messages, and branding are scoped per org. No cross-company data leakage.
> - When a company removes a customer, their portal access to that company's data is revoked, but their account and access to other companies remain intact.
> - Invite collision: if Company B invites an email that already has a portal account with Company A, link the new org to the existing account rather than failing or creating a duplicate.

### Notifications & Alerts

- [ ] **NOTIF-01**: System sends pre-arrival SMS/email notification to customer before tech arrives
- [ ] **NOTIF-02**: System sends post-service email with service report link after stop completion
- [ ] **NOTIF-03**: System provides alerts dashboard for office — missed stops, overdue invoices, declining chemical trends
- [ ] **NOTIF-04**: Office can configure alert types and notification channels (email, in-app, SMS)
- [ ] **NOTIF-34**: Dynamic ETA notification — system calculates real-time estimated arrival for each upcoming customer based on tech's current GPS position, number of remaining stops before them, historical average service duration per stop (from completed stop data), and live drive time from routing API — customer receives ETA via SMS/email at configurable triggers (when route starts, when tech is N stops away, or on-demand from office); ETA auto-updates if tech is running ahead or behind schedule; customer portal shows live ETA countdown for their next scheduled service; office dispatch view shows per-stop ETA for all active routes

### Work Orders & Quoting

- [ ] **WORK-01**: Office or tech can create work orders for repairs and one-off jobs
- [ ] **WORK-02**: Work orders attach to customer with photos, notes, parts, and labor
- [ ] **WORK-03**: Office can create professional quotes with line items for customer approval
- [ ] **WORK-04**: Customer can approve quotes through the portal or email link
- [ ] **WORK-05**: Approved quotes auto-convert to work orders
- [ ] **WORK-06**: Completed work orders can generate invoices

### Truck Inventory & Shopping Lists

> **Principle:** A tech's truck IS their warehouse. Every pool company tracks what's on the truck — chemicals, parts, filters, o-rings — but most do it on paper or in their head. The system should know what each tech has, automatically decrement when they log usage, alert when stock is low, and generate shopping lists from upcoming work. This eliminates "I forgot the part" return trips and gives the office visibility into chemical spend and inventory levels across the fleet.

- [ ] **INV-01**: Each tech has a truck inventory — a persistent list of parts, chemicals, and equipment currently on their vehicle; each item has: name, category (chemical, part, tool, equipment), quantity, unit (gallons, lbs, each, case), minimum threshold (triggers reorder alert), and "on the truck" status
- [ ] **INV-02**: Office can define standard truck load templates per tech role or route type — default quantities of common chemicals (liquid chlorine, muriatic acid, tabs, CYA, calcium, phosphate remover, algaecide), common parts (o-rings, baskets, gaskets, lube, union fittings), and tools — new techs get the template pre-loaded; office adjusts per tech based on their route's typical needs
- [ ] **INV-03**: Tech can update truck inventory from the field app — mark items as used (quantity decrements), add items (loaded at warehouse), damaged/returned, or transferred to another tech — all updates sync to office in real-time
- [ ] **INV-04**: When a tech completes a stop and logs chemical dosing amounts, the system auto-decrements the corresponding chemicals from their truck inventory — e.g., tech adds 2 gallons liquid chlorine at a stop → truck inventory drops by 2 gallons; no double-entry
- [ ] **INV-05**: System generates reorder alerts when truck inventory items fall below configurable minimum thresholds — alerts go to the tech ("Low on muriatic acid — 1 gallon remaining") and to office ("3 techs low on liquid chlorine — total needed: 15 gallons"); office can dismiss, acknowledge, or convert to a purchase order
- [ ] **INV-06**: Office and techs can create shopping lists — lists of parts, chemicals, or equipment needed for upcoming work; items can come from: work order parts lists, project material lists, low truck inventory alerts, schedule-based forecasting ("Monday's route needs 20 gallons chlorine, you have 8"), or manual entry
- [ ] **INV-07**: Shopping list items have statuses that track through the full procurement cycle: needed → ordered (with vendor/PO reference) → received at warehouse → loaded on truck → used — each transition is timestamped and attributed to a user
- [ ] **INV-08**: Tech can view and manage their shopping list from the field app — see what's been ordered vs. what they still need to pick up, scan items to mark as "loaded on truck" when they restock at the warehouse, and flag urgent needs ("need this for tomorrow's route")
- [ ] **INV-09**: Shopping lists integrate with work orders and projects — when a WO requires specific parts, those parts auto-appear on the assigned tech's shopping list; when a project phase needs materials, they appear on the project shopping list; when items are marked "on truck" or "delivered," the WO/project shows parts-ready status
- [ ] **INV-10**: Office has a purchasing dashboard — all outstanding shopping list items across all techs aggregated, grouped by supplier/vendor, with bulk ordering capability (select items, generate a single PO per supplier); shows spending trends, most-ordered items, and cost per unit over time
- [ ] **INV-11**: System tracks chemical usage per tech, per route, per customer, and per pool — gallons of chlorine, pounds of acid, tabs used, etc. — feeds into Phase 9 chemical profitability reporting and surfaces over/under-dosing patterns (e.g., "Tech A uses 40% more chlorine per pool than Tech B on similar routes")
- [ ] **INV-12**: Tech's daily route view shows a "What to Bring" pre-route summary — before heading out, the tech sees all parts and chemicals needed for today's stops based on: scheduled regular service (estimated chemical needs from pool size + history), assigned work orders (required parts), and any flagged items from previous visits — cross-referenced against their current truck inventory to highlight shortages they need to load before departing
- [ ] **INV-13**: System supports barcode/QR scanning for inventory management — tech scans a product to log usage, update truck inventory, or add to shopping list; office scans to receive deliveries and update warehouse stock; scanning is optional (manual entry always available) but speeds up high-volume inventory tasks

### Reporting & Team Management

- [ ] **REPT-01**: Owner can view revenue dashboard (total revenue, by customer, by tech, trends)
- [ ] **REPT-02**: Owner can view route completion rates and operational metrics
- [ ] **REPT-03**: Owner can track technician pay and commission per stop and per upsell
- [ ] **REPT-04**: Owner can view technician scorecards (stops/day, avg stop time, chemical efficiency, customer ratings)
- [ ] **REPT-05**: Owner can view chemical cost per pool profitability analysis (chemical spend vs recurring revenue)
- [ ] **REPT-06**: System flags unprofitable pools based on chemical cost vs revenue

### Smart Features

- [ ] **SMART-01**: System provides smart chemical dosing recommendations based on readings, pool size, sanitizer type, weather, and service history
- [ ] **SMART-02**: System generates predictive alerts for pools trending toward chemical imbalance (based on historical readings)
- [ ] **SMART-03**: System auto-schedules recurring stops and balances workloads across techs based on rules and availability
- [ ] **SMART-04**: System auto-reschedules stops when rain or storms are forecasted — moves affected stops to the next available weather window with office approval
- [ ] **SMART-05**: System warns techs about weather conditions on their route — rain, extreme heat, lightning risk — with per-stop weather badges on the route view
- [ ] **SMART-06**: System shifts service days based on weather windows — identifies optimal reschedule slots considering tech availability, customer preferences, and forecast clearing
- [ ] **SMART-07**: System sends customer notifications about weather-related delays — automatic SMS/email when their stop is rescheduled due to weather, with the new expected date
- [ ] **SMART-08**: System tracks equipment performance trends per pool over time — salt cell output efficiency (salt PPM vs. chlorine production) by season, pump pressure readings, filter PSI differential (clean vs. dirty), heater temperature delta (set point vs. actual), automation system uptime — establishes seasonal baselines per equipment type and surfaces degradation alerts when performance deviates significantly (e.g., "Pool X salt cell output dropped 30% vs. same period last year — likely needs cleaning or replacement"); trends visible on pool equipment profile with historical charts; techs see equipment health badges on their stop view (green/yellow/red); office equipment health dashboard shows all equipment across all pools with sortable health scores; integrates with work order creation (one-click "Create repair WO" from a degradation alert)

### Comprehensive Notifications

> **Principle:** Company users (owner, office, tech) receive in-app push + email notifications for every significant platform event. All customer-facing notifications are delivered via both email AND SMS — no in-app-only customer notifications.

**Company user notifications (in-app push + email):**
- [ ] **NOTIF-05**: Owner/office notified when a tech completes a stop
- [ ] **NOTIF-06**: Owner/office notified when a tech skips a stop
- [ ] **NOTIF-07**: Owner/office notified when a tech marks a stop as can't-complete (gate locked, dog, etc.)
- [ ] **NOTIF-08**: Owner/office notified when a route is started and when it's finished for the day
- [ ] **NOTIF-09**: Owner/office notified when chemistry readings are out of range at any pool
- [ ] **NOTIF-10**: Owner/office notified when a work order is created, updated, or completed
- [ ] **NOTIF-11**: Owner/office notified when a quote is approved or rejected by a customer
- [ ] **NOTIF-12**: Owner/office notified when a payment is received (invoice paid, AutoPay charge succeeded)
- [ ] **NOTIF-13**: Owner/office notified when a payment fails (declined card, ACH failure, dunning triggered)
- [ ] **NOTIF-14**: Owner/office notified when a customer sends a message through the portal
- [ ] **NOTIF-15**: Owner/office notified when a customer submits a service request through the portal
- [ ] **NOTIF-16**: Owner/office notified when a new customer is added or a customer cancels service
- [ ] **NOTIF-17**: Owner/office notified when an invoice becomes overdue (configurable threshold — 7, 14, 30 days)
- [ ] **NOTIF-18**: Owner/office notified of weather reschedule proposals requiring approval
- [ ] **NOTIF-19**: Tech notified when they are assigned a new stop, work order, or route change
- [ ] **NOTIF-20**: Tech notified when a customer approves a quote they're assigned to
- [ ] **NOTIF-21**: Tech notified of schedule changes (stop added, removed, reordered, or rescheduled)
- [ ] **NOTIF-22**: Tech notified of weather alerts on their upcoming route
- [ ] **NOTIF-23**: Owner notified of system events — subscription billing, failed integrations (QBO sync error), expired certifications

**Customer notifications (always email + SMS):**
- [ ] **NOTIF-24**: Customer receives email + SMS for pre-arrival notification
- [ ] **NOTIF-25**: Customer receives email + SMS for service completion with report link
- [ ] **NOTIF-26**: Customer receives email + SMS for new invoice
- [ ] **NOTIF-27**: Customer receives email + SMS for payment confirmation/receipt
- [ ] **NOTIF-28**: Customer receives email + SMS for payment failure / dunning reminder
- [ ] **NOTIF-29**: Customer receives email + SMS for quote ready for review
- [ ] **NOTIF-30**: Customer receives email + SMS for weather-related schedule change
- [ ] **NOTIF-31**: Customer receives email + SMS for work order status updates (scheduled, in-progress, complete)
- [ ] **NOTIF-32**: Customer receives email + SMS for portal message replies from the company
- [ ] **NOTIF-33**: All notification types are independently toggleable per company and customizable with editable templates (subject, body, SMS text, merge tags)

### Employee Time Tracking & Team Management

- [ ] **TEAM-01**: Owner can define pay rates per employee — hourly base rate, per-stop rate, overtime multiplier, and effective date (rate history preserved)
- [ ] **TEAM-02**: System auto-tracks employee clock-in/clock-out times with GPS stamp — techs clock in from the app, clock out at end of day
- [ ] **TEAM-03**: System auto-logs drive time vs. on-site time per stop using route start, arrival, departure, and next-stop timestamps
- [ ] **TEAM-04**: Owner can view and edit weekly timesheets per employee — with auto-calculated regular hours, overtime hours (configurable threshold, default 40hr/week), and PTO/sick time entries
- [ ] **TEAM-05**: Owner can manage PTO balances per employee — accrual rules (hours per pay period), manual adjustments, request/approval workflow, and balance tracking
- [ ] **TEAM-06**: Owner can set and manage employee schedules — availability windows per day of week, blocked dates, and the system respects these when assigning routes
- [ ] **TEAM-07**: System tracks commission and bonus per employee — configurable per upsell, per work order completion, per new customer signup, with running totals on the pay summary
- [ ] **TEAM-08**: Owner can view a team management dashboard — all employees with current status (clocked in/out, on route, idle), today's hours, weekly hours, PTO balance, and alerts (approaching overtime, expired certifications)
- [ ] **TEAM-09**: Owner can store and track employee certifications and documents — CPO certification, driver's license, insurance, with expiration date alerts and document upload
- [ ] **TEAM-10**: Owner can configure pay periods (weekly, bi-weekly, semi-monthly) and the system auto-generates pay period summaries at close
- [ ] **TEAM-11**: System enforces break compliance — configurable rules (e.g., 30min break after 6 hours), alerts if employee skips required break, logged for compliance records
- [ ] **TEAM-12**: Owner can view labor cost analysis — labor cost per stop, per route, per customer, comparing actual time vs. budgeted time, with trend reporting
- [ ] **TEAM-13**: Geofence-based automatic per-stop time tracking — when a tech enters a configurable geofence radius (default 200ft) around a stop's address, system auto-logs arrival time; when they leave the geofence, auto-logs departure time — gives per-stop on-site time and drive time granularity without any manual taps; works in background even when app is backgrounded; geofence events sync when back online; office can view a real-time map of which tech is at which stop
- [ ] **TEAM-14**: Traditional punch in/out clock — tech can manually clock in at start of shift and clock out at end of shift with a single tap; the daily shift clock is independent of per-stop geofence tracking; supports both modes simultaneously (geofence gives per-stop detail, manual punch defines the shift window); office can require one or both modes per company policy; manual punch captures GPS location at clock-in and clock-out for verification; if tech forgets to clock out, system auto-closes the shift after configurable inactivity (e.g., 2 hours after last stop completion)

### Payroll Processing

- [ ] **PAYRL-01**: Owner can run payroll — system calculates gross-to-net for each employee with all withholdings, deductions, and contributions in one click
- [ ] **PAYRL-02**: System calculates federal income tax, Social Security, Medicare, state income tax, and local tax withholding per employee based on W-4 and state equivalent data
- [ ] **PAYRL-03**: System initiates direct deposit via ACH — employees set up bank accounts (checking/savings, routing/account number), funds deposited on payday
- [ ] **PAYRL-04**: System generates printable payroll checks for employees not on direct deposit — proper check formatting with pay stub attachment
- [ ] **PAYRL-05**: System auto-files quarterly payroll taxes (Form 941, state equivalents) and generates year-end W-2s and W-3 transmittals
- [ ] **PAYRL-06**: System generates 1099-NEC for independent contractors with annual filing
- [ ] **PAYRL-07**: System supports both W-2 employees (full withholding) and 1099 contractors (no withholding) — separate payment flows, separate tax documents
- [ ] **PAYRL-08**: Each employee can view detailed digital pay stubs — gross pay, every deduction line, net pay, YTD totals — accessible in-app
- [ ] **PAYRL-09**: System handles wage garnishments — court-ordered garnishments, child support withholding with proper legal priority ordering and disposable income limits
- [ ] **PAYRL-10**: Owner can configure pre-tax and post-tax deductions per employee — health insurance, retirement (401k/IRA), HSA, life insurance, custom deductions
- [ ] **PAYRL-11**: System handles multi-state payroll — employees working across state lines get proper state withholding based on work location, with reciprocity agreement support
- [ ] **PAYRL-12**: Owner can process retroactive payroll adjustments — correct errors from prior pay periods with automatic tax recalculation and adjustment entries
- [ ] **PAYRL-13**: System generates payroll reports — payroll register, tax liability summary, deduction summary, labor distribution by department/route, per-period and YTD
- [ ] **PAYRL-14**: System calculates employer-side taxes and contributions — employer FICA match, FUTA, SUTA, workers' comp estimates — tracked as expenses automatically
- [ ] **PAYRL-15**: Owner can set up and run bonus payroll runs separately from regular payroll — with correct supplemental wage tax withholding rates

### Full Accounting

- [ ] **ACCT-01**: System provides a chart of accounts pre-seeded for pool service companies — fully customizable (add, edit, deactivate accounts and sub-accounts)
- [ ] **ACCT-02**: Every financial transaction (invoice, payment, payroll run, expense, refund) auto-creates balanced double-entry journal entries — debits always equal credits
- [ ] **ACCT-03**: Owner can generate a Profit & Loss statement for any date range with comparison to prior period, budget, or prior year
- [ ] **ACCT-04**: Owner can generate a Balance Sheet showing assets, liabilities, and equity at any point in time
- [ ] **ACCT-05**: Owner can generate a Cash Flow statement — operating, investing, and financing activities
- [ ] **ACCT-06**: Owner can connect bank and credit card accounts via Plaid — transactions auto-import daily with categorization suggestions
- [ ] **ACCT-07**: Owner can reconcile bank statements — match imported transactions to book entries, flag discrepancies, mark reconciled, generate reconciliation reports
- [ ] **ACCT-08**: Owner can track expenses — categorize against chart of accounts, attach receipt photos, split transactions across categories, and log mileage for techs
- [ ] **ACCT-09**: System provides accounts receivable aging — current, 30, 60, 90+ day buckets with drill-down to individual invoices and automated collection reminders
- [ ] **ACCT-10**: Owner can track accounts payable — enter vendor bills, schedule payments, track due dates, and run AP aging reports
- [ ] **ACCT-11**: System tracks sales tax liability by jurisdiction — auto-calculated from invoices, generates filing-ready reports with reminders for due dates
- [ ] **ACCT-12**: Owner can view financial dashboards — real-time P&L summary, cash position, revenue trends, expense breakdown, AR/AP status, cash flow forecast
- [ ] **ACCT-13**: Owner can create manual journal entries for adjustments, accruals, or corrections — with required memo and audit trail
- [ ] **ACCT-14**: System maintains a complete audit trail — every journal entry, edit, and deletion is logged with timestamp, user, and reason
- [ ] **ACCT-15**: Owner can close accounting periods (monthly/quarterly/annually) — prevents edits to prior periods, generates closing entries

### Advanced Payment & Collections (extends Phase 7 billing)

- [ ] **PAY-01**: Stripe Connect guided onboarding — pool company connects existing or creates new Stripe account in under 2 minutes, KYC handled by Stripe
- [ ] **PAY-02**: Stripe payouts auto-reconcile to accounting entries — settlement reports, per-transaction fee tracking, net deposit matching to bank feed
- [ ] **PAY-03**: QBO Payments transactions auto-reconcile to accounting entries when QBO sync is the chosen payment path
- [ ] **PAY-04**: Owner can offer payment plans for large invoices — split total into installments, auto-charge on schedule, track remaining balance
- [ ] **PAY-05**: Owner can apply customer credits and account balances — credit memos, prepayments, and overpayments tracked and auto-applied to future invoices
- [ ] **PAY-06**: System provides a collections dashboard — outstanding balances, payment method status, failed payment history, aging by customer, collection effectiveness metrics
- [ ] **PAY-07**: Refunds auto-create reversing accounting entries — full or partial, through whichever payment provider the company uses

### Service Agreements & Contracts

- [ ] **AGREE-01**: Office can create a recurring service agreement for a customer — selecting pool(s), service frequency, included services (checklist), pricing model (monthly flat rate or per-visit), and term length (month-to-month, 6-month, 12-month)
- [ ] **AGREE-02**: Office can generate a professional agreement document (PDF) from customizable templates — includes service scope, pricing, payment terms, cancellation policy, liability waiver, and company branding
- [ ] **AGREE-03**: System sends the agreement to the customer via email with a secure approval link — same pattern as quotes (branded PDF + public approval page, no auth required)
- [ ] **AGREE-04**: Customer can review, e-sign (name + date + IP capture), and accept the agreement from the approval page — or decline with reason
- [ ] **AGREE-05**: Accepted agreement auto-creates the schedule rule (recurring stops) and sets up recurring billing — no manual re-entry needed
- [ ] **AGREE-06**: Office can view all agreements in an agreement manager — filtered by status (draft, sent, active, paused, expired, cancelled), customer, and expiration date
- [ ] **AGREE-07**: System supports agreement lifecycle — pause/resume (suspends stops and billing), cancel (with configurable notice period), expire (auto-flag at term end), and auto-renew (configurable per agreement)
- [ ] **AGREE-08**: System sends renewal reminders before agreement expiration — configurable lead time (30/60/90 days), with one-click renewal or renegotiation from the office
- [ ] **AGREE-09**: Office can amend an active agreement (change frequency, pricing, services) — creates a new version, sends amendment for customer approval, preserves version history
- [ ] **AGREE-10**: Customer portal displays active agreements — service scope, pricing, next billing date, contract term, and option to request changes or cancellation
- [ ] **AGREE-11**: Agreement templates are fully customizable per company — terms and conditions, cancellation policy, liability language, service descriptions, and branding (logo, colors)
- [ ] **AGREE-12**: System tracks agreement compliance — flags if service frequency isn't being met (missed stops), alerts if pricing doesn't match what's being billed

### Projects & Renovations

> **Principle:** Pool service companies that also build, renovate, and remodel pools need project management that's purpose-built for the pool industry — not generic PM tools bolted on. A project is fundamentally different from a recurring service stop: it has phases, milestones, deposits, permits, subcontractors, material procurement, inspections, change orders, warranties, and progress billing. The tech experience is different too — project work means multi-day task lists, material tracking, photo documentation at each stage, and crew coordination. Every dollar must be tracked from proposal through final payment, and the customer should be able to watch their project come to life from their portal.

#### Project Types & Templates

- [ ] **PROJ-01**: System supports named project types — New Pool Construction (gunite/shotcrete, fiberglass, vinyl liner), Pool Renovation (replaster/refinish, retile, coping, deck), Equipment Upgrade (pump, heater, automation, salt system), Water Feature (waterfall, spillover spa, deck jets, bubblers, fire bowl), Pool Remodel (shape change, add spa, tanning ledge, beach entry), Safety Installation (fence, alarm, auto cover, safety net), Lighting (LED conversion, fiber optic, landscape), Structural Repair (crack, settling, beam, skimmer), Plumbing (leak detection, replumb, returns/drains), Electrical (rewire, panel, bonding/grounding), Seasonal (pool opening, pool closing), and Green Pool Recovery — each with default phase templates
- [ ] **PROJ-02**: Owner can create and manage project templates per type — each template defines default phases (e.g., for a replaster: Drain → Prep → Bond Coat → Plaster Application → Fill → Startup Chemistry → Final Walkthrough), default task checklists per phase, estimated duration per phase, default material list, and default labor hours — so starting a new project of that type pre-populates everything
- [ ] **PROJ-03**: Project templates include a default line item estimate with material categories, labor categories, and typical markup percentages — office adjusts per project but starts from a proven baseline
- [ ] **PROJ-04**: System supports "Good / Better / Best" proposal tiers per template — e.g., for a replaster: Standard white plaster ($X) / Quartz finish ($Y) / Pebble finish ($Z) — customer sees all three options with descriptions and photos of each finish type

#### Lead Capture & Site Survey

- [ ] **PROJ-05**: Office can capture project leads from multiple sources — phone call (manual entry), customer portal request (auto-created), tech field flag ("this pool needs a replaster"), referral from existing customer, or website form (future API) — each lead captures customer info, project type, urgency, source, and initial notes
- [ ] **PROJ-06**: System provides a project pipeline view — leads flow through stages: Lead → Site Survey Scheduled → Survey Complete → Proposal Sent → Proposal Approved → Deposit Received → Permitted → In Progress → Punch List → Complete → Warranty Active — with drag-and-drop between stages and time-in-stage tracking
- [ ] **PROJ-07**: Office can schedule a site survey as a special stop type — appears on the assigned tech's route for that day, includes customer address, project type, and what to assess — tech has a survey-specific checklist (measurements, photos, existing conditions, access constraints, utility locations, HOA requirements)
- [ ] **PROJ-08**: Tech can complete a site survey from the field app — captures pool dimensions/measurements, takes condition photos (tagged by area: deck, coping, interior, equipment pad, plumbing, electrical), notes existing problems, flags permit-likely items, records customer's stated preferences and budget range, and notes site access constraints (crane access, fence gate width, backyard slope, overhead wires)
- [ ] **PROJ-09**: Site survey data auto-populates into the proposal builder — measurements feed into material quantity estimates, photos attach to the proposal, and condition notes inform scope recommendations

#### Proposal Builder & Pricing

- [ ] **PROJ-10**: Office can build a detailed project proposal with: project scope description (rich text), phased work breakdown, itemized material list with quantities and unit costs, labor hours per phase with hourly rates, equipment rental costs, subcontractor line items, permit fees, a configurable markup percentage per line item category (materials, labor, subs), and a total project price — all from a template or from scratch
- [ ] **PROJ-11**: Proposal supports multiple pricing presentations — lump sum (single total), cost-plus (materials at cost + markup % + labor), time-and-materials (hourly + materials as used), or fixed-price-per-phase — owner configures preferred method per project type
- [ ] **PROJ-12**: Proposal includes a payment schedule — deposit amount (fixed dollar or percentage, e.g., 33% upfront), progress payments tied to milestone completion (e.g., 33% when excavation complete, 33% when plaster applied), and final payment (balance due on completion) — fully configurable per proposal with as many milestones as needed
- [ ] **PROJ-13**: Proposal supports "Good / Better / Best" option tiers — office creates up to 3 tiers with different scope, materials, and pricing; customer selects their preferred tier when approving; selected tier determines the project scope and payment schedule
- [ ] **PROJ-14**: Proposal generates a professional branded PDF — company logo, colors, customer info, project scope with photos from site survey, detailed line items (or summarized by category — owner chooses detail level), payment schedule with deposit amount, estimated start date, estimated completion date, terms and conditions, warranty information, cancellation policy, and e-signature block
- [ ] **PROJ-15**: Office can include add-on upsells on the proposal — optional line items the customer can accept or decline independently (e.g., "Add LED lighting for $X", "Upgrade to variable speed pump for $Y") — each add-on has its own price and description, and selected add-ons fold into the project total and payment schedule
- [ ] **PROJ-16**: System tracks proposal versions — if office revises scope or pricing after customer feedback, a new version is created (V1, V2, V3...) with change notes, and the customer always sees the latest version; all versions are preserved for audit

#### Customer Approval & Deposits

- [ ] **PROJ-17**: System sends the proposal to the customer via email (and optionally SMS) with a secure approval link — same pattern as quotes: branded PDF preview + public approval page, no auth required — customer can view on any device
- [ ] **PROJ-18**: Customer approval page shows the full proposal with tier selection (if applicable), add-on selection checkboxes, the payment schedule based on their selections, and an e-signature capture (typed name + date + IP + user agent) — customer can approve, request changes (with a message), or decline (with a reason)
- [ ] **PROJ-19**: Upon approval, system immediately creates a deposit invoice — if deposit is required (configurable), the approval page includes a "Pay Deposit Now" button that launches Stripe payment (card or ACH) inline, so the customer can approve AND pay deposit in one flow without leaving the page
- [ ] **PROJ-20**: Deposit payment supports multiple methods — full deposit via card/ACH on the approval page, partial deposit split (e.g., half now and half in 7 days — auto-scheduled), or offline payment (check/cash recorded manually by office) — system tracks deposit status separately from project approval
- [ ] **PROJ-21**: If customer approves but doesn't pay deposit immediately, system sends deposit reminder emails on a configurable schedule (3 days, 7 days, 14 days) — project status stays "Approved — Awaiting Deposit" and cannot advance to scheduling until deposit is received or office manually overrides
- [ ] **PROJ-22**: System supports consumer financing for large projects — when configured, the approval page shows a "Finance This Project" option alongside "Pay Deposit" — links to configured financing partner (Sunbit, Lyon Financial, HFS, etc.) with project amount pre-filled; office marks financing as approved/declined when notified by the financing company
- [ ] **PROJ-23**: Customer can request changes from the approval page — enters specific change requests in a text field, office receives notification with the change requests, can create a revised proposal (new version), and re-send for approval — prevents back-and-forth phone tag

#### Permitting & Compliance

- [ ] **PROJ-24**: System tracks permits per project — permit type (building, electrical, plumbing, fence, HOA approval), status (not needed, application submitted, pending review, approved, failed inspection, final approved), permit number, submission date, approval date, expiration date, inspector name/contact, and attached permit documents (uploaded PDFs/photos)
- [ ] **PROJ-25**: Office can mark which project types typically require permits (configurable per jurisdiction) — when a project of that type is created, the permit tracking section auto-appears with required permit types pre-populated; projects requiring permits cannot advance to "In Progress" until at least one permit is marked approved (or office manually overrides with a documented reason)
- [ ] **PROJ-26**: System sends permit expiration alerts — if a permit has an expiration date and the project is still in progress, alerts fire 30/14/7 days before expiration so office can renew
- [ ] **PROJ-27**: System stores HOA documentation per project — HOA approval letter, architectural review board submission, approved plans, and any HOA-specific requirements (color restrictions, fence height, setback rules) — attached to the project record

#### Material Procurement & Inventory

- [ ] **PROJ-28**: Each project has a material list derived from the approved proposal — itemized with: material name, specification (e.g., "NPT Stonescapes French Gray"), quantity needed, unit (bags, sq ft, linear ft, each), unit cost, supplier, order status (not ordered, ordered, partial received, fully received, backordered), expected delivery date, and actual delivery date
- [ ] **PROJ-29**: Office can create purchase orders from the project material list — grouped by supplier, with quantities, specs, delivery address (customer site or office/warehouse), and requested delivery date — PO generates a printable/emailable document with PO number
- [ ] **PROJ-30**: System tracks material delivery and receiving — when materials arrive (at site or warehouse), office or tech can mark items received with quantity, condition notes, and photo of delivery — partial deliveries tracked with remaining quantities highlighted
- [ ] **PROJ-31**: System tracks material cost variance — compares estimated material cost (from proposal) vs. actual material cost (from POs and receipts) per line item and total; flags cost overruns over a configurable threshold (e.g., 10%) for office attention
- [ ] **PROJ-32**: Tech can log material usage from the field — when working on a project, tech records what materials were used, quantity, and from which delivery/stock — this feeds into cost tracking and remaining material calculations; if a material runs short, tech can flag it and office gets an alert to reorder
- [ ] **PROJ-33**: System supports material returns and credits — if material is unused or wrong spec, office can record a return with quantity, reason, and credit amount — credit applies to the project's actual cost tracking

#### Subcontractor Management

- [ ] **PROJ-34**: System maintains a subcontractor directory per org — sub name, company, trade/specialty (electrical, plumbing, concrete, tile, fencing, excavation, landscaping), contact info, insurance cert on file (with expiration), license number, and payment terms (Net 15/30/60)
- [ ] **PROJ-35**: Office can assign subcontractors to project phases — each assignment includes: sub name, trade, scheduled dates, scope of work description, agreed price (fixed bid or T&M), and payment milestone (when the sub gets paid — on phase completion, on project completion, or custom)
- [ ] **PROJ-36**: System tracks subcontractor work status per assignment — not started, in progress, complete, needs rework — with completion date, notes, and quality rating (1-5 stars for office internal tracking)
- [ ] **PROJ-37**: System generates subcontractor payment tracking — what's owed to each sub based on completed assignments, what's been paid, and what's outstanding — with payment recording (check number, date, amount) and lien waiver tracking (uploaded per payment)
- [ ] **PROJ-38**: System sends subcontractor schedule notifications — when a sub is assigned to a project phase, they receive an email with project address, scope, dates, site access instructions, and customer contact — configurable per sub

#### Project Scheduling & Phase Management

- [ ] **PROJ-39**: Each project has an ordered list of phases — created from the template or custom-built — each phase has: name, description, estimated start date, estimated end date, estimated labor hours, assigned crew (one or more techs), assigned subcontractors, dependency (which phase must complete first), status (not started, in progress, on hold, complete, skipped), and a task checklist
- [ ] **PROJ-40**: Office can view a project timeline (Gantt-style) — showing all phases as horizontal bars with dependencies as connecting lines, actual progress overlaid on estimated dates, critical path highlighted, and the ability to drag phases to reschedule (respecting dependencies)
- [ ] **PROJ-41**: System supports phase dependencies — Phase B cannot start until Phase A is marked complete (hard dependency) or Phase A reaches a certain percentage (soft dependency) — prevents scheduling conflicts and ensures work order logic
- [ ] **PROJ-42**: Office can schedule project work alongside regular service routes — project phases appear as blocks on the scheduling calendar, techs assigned to project work have those hours blocked from route availability, and the system prevents double-booking a tech for route stops and project work on the same time block
- [ ] **PROJ-43**: System handles project delays automatically — if a phase takes longer than estimated, dependent phases shift forward, the overall completion date updates, the customer sees the updated timeline in their portal, and office gets an alert with the delay impact analysis (days delayed, affected phases, new estimated completion)
- [ ] **PROJ-44**: Office can put a project on hold — all scheduled phases pause, affected techs/subs are notified, the customer sees "Project On Hold" status with the reason, and when resumed, dates recalculate from the resume date forward
- [ ] **PROJ-45**: System tracks weather delays for outdoor project work — integrates with the same weather API as route scheduling, flags phases that involve outdoor work (excavation, concrete, plaster, paint) and surfaces weather conflict warnings when those phases are scheduled during forecast rain/cold

#### Tech Field App — Project Mode

- [ ] **PROJ-46**: Tech has a dedicated "Projects" tab in the field app (separate from daily route) — shows all active projects they're assigned to with: project name, customer name, address, current phase, today's tasks, and overall progress percentage
- [ ] **PROJ-47**: When a tech taps into a project, they see the current phase's task checklist — each task is specific to the phase (e.g., for "Prep" phase of a replaster: "Drain pool," "Acid wash surface," "Chip loose plaster," "Inspect for cracks," "Mark crack repairs," "Clean and prep bond surface") — tasks are checkable with optional notes and photo attachment per task
- [ ] **PROJ-48**: Tech can log time per project from the field app — start/stop timer or manual entry — time is categorized by phase and task, feeds into labor cost tracking, and is visible to office on the project dashboard for billing verification
- [ ] **PROJ-49**: Tech can log material usage from the field app — scan barcode or select from the project's material list, enter quantity used, and add notes — remaining quantities update in real-time so office can reorder before running out
- [ ] **PROJ-50**: Tech can capture project photos with automatic tagging — photos are tagged by project, phase, task, and date — tech can also tag photos as "before," "during," or "after" for the progress timeline, and "issue" for problem documentation
- [ ] **PROJ-51**: Tech can flag an issue/unexpected condition from the field — e.g., "Found rebar corrosion under old plaster" or "Plumbing runs not where expected" — the flag includes photos, description, severity (informational, delays work, requires change order), and immediately notifies office so they can create a change order or adjust the plan
- [ ] **PROJ-52**: Tech can view site-specific information for each project — gate codes, access instructions, utility shutoff locations, dig alert ticket number, HOA contact, neighbor notification status, parking instructions for crew trucks, and any customer-specific notes (dogs, working from home, preferred contact method)
- [ ] **PROJ-53**: Tech sees a daily project briefing — when they have project work scheduled, the app shows: which project(s), what phase, what tasks are expected today, what materials are needed (and whether they've been delivered), which subs are expected on site, and any safety notes or inspection appointments
- [ ] **PROJ-54**: Tech can mark a project phase complete from the field — triggers a self-inspection checklist (configurable per phase type, e.g., "plaster surface smooth and even," "no visible cracks," "waterline tile aligned," "all returns flowing"), requires at least one completion photo, and notifies office that the phase is done for review
- [ ] **PROJ-55**: Tech can record equipment and tools used on a project — system tracks which company-owned equipment (e.g., jackhammer, diamond saw, pump, compressor) is at which project site — prevents equipment conflicts between projects and aids in maintenance scheduling
- [ ] **PROJ-56**: When a tech is doing regular route stops AND has a project nearby, the app can suggest sequencing the project visit within the route to minimize drive time — office approves the hybrid schedule

#### Change Orders

- [ ] **PROJ-57**: Office can create a change order when project scope changes — change order includes: description of change, reason (customer request, unforeseen condition, code requirement, design change), added/removed line items with cost impact, schedule impact (days added/removed), updated project total, and updated payment schedule
- [ ] **PROJ-58**: Change orders require customer approval before work proceeds — system sends the change order via email with approval link (same pattern as proposals), customer can approve, request modifications, or decline — unapproved change orders are tracked as pending and block the affected work
- [ ] **PROJ-59**: Approved change orders automatically update the project — material list adjusts, labor estimates adjust, payment schedule recalculates, timeline shifts if needed, and a "Changes" log on the project record shows all change orders chronologically with approval dates
- [ ] **PROJ-60**: System tracks cost impact of all change orders — original contract amount, sum of all approved change orders (additions and deductions), current contract amount — visible on the project dashboard and financial reports
- [ ] **PROJ-61**: Tech-flagged issues (PROJ-51) can be directly converted to a change order by office — pre-populates the change order with the tech's photos, description, and estimated impact, saving office time and preserving the field documentation chain

#### Progress Billing & Payment Collection

- [ ] **PROJ-62**: System generates progress invoices tied to project milestones — when a phase reaches its billing milestone (e.g., "Invoice 33% when excavation complete"), office can generate the progress invoice with one click; invoice shows: work completed this period, materials used, cumulative percentage complete, amount due this draw, total paid to date, and remaining balance
- [ ] **PROJ-63**: Progress invoices follow the payment schedule from the approved proposal (as modified by change orders) — system auto-calculates the correct amount based on milestone completion and total contract value; office can adjust before sending if needed
- [ ] **PROJ-64**: System supports retainage — configurable percentage (typically 5-10%) held back from each progress payment until final completion and customer satisfaction; retainage accrues across all progress payments and is invoiced separately at project close
- [ ] **PROJ-65**: Final invoice includes: remaining contract balance, retainage release, any pending change order amounts, less all previous payments — clearly itemized so the customer sees exactly what they owe and why
- [ ] **PROJ-66**: All project invoices flow through the same payment infrastructure as service invoices (Stripe Connect, AutoPay, dunning) — customer can pay via card, ACH, or check; large project payments may use ACH to avoid credit card processing fees, so the system can be configured to only offer ACH for invoices over a configurable threshold
- [ ] **PROJ-67**: System tracks project profitability in real-time — compares actual costs (materials + labor + subs + equipment + permits) against contract price (including change orders) to show current margin, projected final margin, and flags projects trending toward losing money before they finish
- [ ] **PROJ-68**: Office can record refunds or credits on project invoices — if customer cancels mid-project, system calculates: deposit received, work completed value, materials on site (non-returnable), restocking fees, and generates a settlement invoice showing amount owed to customer or remaining balance due to company, per the cancellation terms in the contract

#### Inspections & Quality

- [ ] **PROJ-69**: System tracks inspections per project — inspection type (rough plumbing, rough electrical, structural, barrier/fence, final), scheduling (date, time window, inspector name), status (scheduled, passed, failed, conditional pass), result notes, and attached inspection reports/photos
- [ ] **PROJ-70**: Failed inspections create a rework task list — office documents what failed, creates correction tasks assigned to the responsible tech or sub, schedules the re-inspection, and tracks the correction → re-inspect cycle until passed
- [ ] **PROJ-71**: Quality checkpoints are built into phase completion — before a tech can mark a phase complete, they must complete a quality self-inspection checklist specific to that phase type (configurable per template); failed self-inspection items must be resolved or documented with photos before sign-off
- [ ] **PROJ-72**: Final walkthrough is a formal project phase — includes a customer-facing punch list where office/tech and customer walk the project together, customer can flag items (cosmetic issues, incomplete work, damage), each punch list item is tracked to resolution with photos, and customer signs off on the walkthrough when satisfied

#### Warranty & Post-Completion

- [ ] **PROJ-73**: Each project type has configurable warranty terms — warranty duration (e.g., 10 years structural, 5 years surface, 2 years equipment, 1 year workmanship), what's covered vs. excluded, and warranty start date (tied to project completion + customer sign-off)
- [ ] **PROJ-74**: System generates a warranty certificate document — branded PDF with project details, warranty terms, start/end dates, what's covered, claim instructions, and company contact info — automatically emailed to customer on project completion and accessible in their portal
- [ ] **PROJ-75**: Customer can submit warranty claims through the portal — selects the project, describes the issue, uploads photos, and the system creates a warranty work order linked to the original project; office reviews the claim, approves/denies (with reason), and if approved, dispatches a tech
- [ ] **PROJ-76**: Warranty work orders track labor and material separately — if work is covered under warranty, no invoice is generated (cost absorbed by company, tracked for profitability reporting); if work falls outside warranty terms, office can explain why and create a regular billable work order instead
- [ ] **PROJ-77**: System sends warranty expiration reminders to customers — configurable lead time (90/60/30 days before each warranty tier expires) — serves as a touchpoint for the company to offer extended warranty, renovation refresh, or recurring service if the customer isn't already on service
- [ ] **PROJ-78**: When a project completes for a NEW customer (not already on service), system prompts office to offer a recurring service agreement — auto-populates the agreement with the new pool's specs, recommended service frequency, and chemical plan based on the pool type that was built/renovated
- [ ] **PROJ-79**: System maintains a project archive per customer — every completed project with all documentation (proposal, photos, permits, inspections, change orders, invoices, warranty) is permanently accessible from the customer's profile, providing a complete construction/renovation history

#### Project Dashboard & Reporting

- [ ] **PROJ-80**: Office has a Project Dashboard — active projects pipeline (kanban or list view), project calendar (all projects and their phases on a timeline), crew utilization (which techs are on projects vs. routes and available capacity), and alerts (overdue phases, budget overruns, pending approvals, expiring permits)
- [ ] **PROJ-81**: System provides per-project financial reports — budget vs. actual (materials, labor, subs, total), profit margin (estimated vs. current vs. projected), cash flow (payments received vs. costs incurred, when next payment is due), and change order impact summary
- [ ] **PROJ-82**: System provides aggregate project reports — total project revenue by period, average project margin by type, lead-to-close conversion rate, average project duration by type, subcontractor spend analysis, and top projects by revenue/margin
- [ ] **PROJ-83**: System tracks lead-to-close metrics — how many leads, conversion rate by project type, average time from lead to proposal, proposal to approval, approval to start, start to completion — identifies bottlenecks in the sales pipeline

#### Customer Portal — Project View

- [ ] **PROJ-84**: Customer can view their active project(s) in the portal — project timeline showing all phases with status (upcoming, in progress, complete), current progress percentage, next milestone, estimated completion date, and a photo gallery that updates as techs document work
- [ ] **PROJ-85**: Customer can view project financials in the portal — total contract amount, deposit paid, progress payments paid, retainage held, current balance, next payment milestone and amount — no surprises at any point
- [ ] **PROJ-86**: Customer receives project update notifications — configurable by the company: phase started, phase completed (with photos), inspection passed, milestone reached, schedule change, and weekly progress summary email with photo highlights
- [ ] **PROJ-87**: Customer can approve change orders directly from the portal — same approval flow as the initial proposal, with clear cost/schedule impact shown and e-signature capture
- [ ] **PROJ-88**: Customer can communicate about the project through the portal — project-specific message thread (separate from general messages), can share photos/screenshots, and all messages are visible to the project's assigned office staff
- [ ] **PROJ-89**: Customer can complete the final walkthrough punch list digitally — view the punch list items with photos, mark items as satisfactory or flag concerns, sign off on the final walkthrough from their device, and the signed walkthrough triggers warranty activation + final invoice

#### Cancellation & Dispute Handling

- [ ] **PROJ-90**: System enforces cancellation terms from the proposal — if customer cancels before work starts: refundable deposit minus cancellation fee (configurable, e.g., 15%); if customer cancels during work: deposit + completed work value + non-returnable materials + restocking fees; office generates a settlement calculation and can adjust within policy bounds
- [ ] **PROJ-91**: All project documentation is timestamped and immutable — proposals, approvals, change orders, photos, and communications cannot be deleted (only soft-archived), creating an auditable trail in case of disputes
- [ ] **PROJ-92**: System supports project suspension — distinct from on-hold (which is office-initiated), suspension is triggered by non-payment of progress invoices; work stops, subs are notified, customer receives notice, and a configurable cure period (e.g., 15 days) runs before the company can terminate the contract per the agreed terms

## v2 Requirements

Deferred to future release. Tracked but not in current roadmap.

### Advanced Integrations

- **INTG-01**: Consumer financing integration (Sunbit-style) for large repair quotes
- **INTG-02**: Open API for enterprise integrations (Pool360, payroll systems)
- **INTG-03**: IoT sensor integration for auto-populated chemistry readings (LaMotte Spin, etc.)

### Enterprise Features

- **ENT-01**: Multi-company / franchise management
- **ENT-02**: Native mobile apps (iOS/Android) for field techs

### Advanced Analytics

- **ANLYT-02**: Seasonal trend analysis and demand forecasting

## Out of Scope

Explicitly excluded. Documented to prevent scope creep.

| Feature | Reason |
|---------|--------|
| Real-time chat between techs | Not core to service workflow; phone/text sufficient |
| Equipment marketplace | Separate business, not a software feature; Pool360 exists |
| Full GPS fleet tracking (always-on) | Battery drain, privacy concerns; use route progress polling instead |
| IoT-triggered automatic chemical ordering | Supply chain is a separate business; track usage, don't auto-order |
| AI chatbot for customers | Hallucination risk for chemistry advice; keep customer comms templated |
| IoT sensor hardware sales | Hardware is a separate sales motion; 78% of pros buy supplies in-person |
| Multi-language support | English-only for US market in v1 |

## Traceability

Which phases cover which requirements. Updated during roadmap creation.

| Requirement | Phase | Status |
|-------------|-------|--------|
| AUTH-01 | Phase 1 — Foundation | Pending |
| AUTH-02 | Phase 1 — Foundation | Pending |
| AUTH-03 | Phase 1 — Foundation | Pending |
| AUTH-04 | Phase 1 — Foundation | Pending |
| AUTH-05 | Phase 1 — Foundation | Pending |
| AUTH-06 | Phase 1 — Foundation | Pending |
| CUST-01 | Phase 2 — Customer & Pool Data Model | Pending |
| CUST-02 | Phase 2 — Customer & Pool Data Model | Pending |
| CUST-03 | Phase 2 — Customer & Pool Data Model | Pending |
| CUST-04 | Phase 2 — Customer & Pool Data Model | Pending |
| CUST-05 | Phase 2 — Customer & Pool Data Model | Pending |
| CUST-06 | Phase 2 — Customer & Pool Data Model | Pending |
| FIELD-01 | Phase 3 — Field Tech App | Pending |
| FIELD-02 | Phase 3 — Field Tech App | Pending |
| FIELD-03 | Phase 3 — Field Tech App | Pending |
| FIELD-04 | Phase 3 — Field Tech App | Pending |
| FIELD-05 | Phase 3 — Field Tech App | Pending |
| FIELD-06 | Phase 3 — Field Tech App | Pending |
| FIELD-07 | Phase 3 — Field Tech App | Pending |
| FIELD-08 | Phase 3 — Field Tech App | Pending |
| FIELD-09 | Phase 3 — Field Tech App | Pending |
| FIELD-10 | Phase 3 — Field Tech App | Pending |
| FIELD-11 | Phase 3 — Field Tech App | Pending |
| FIELD-12 | Phase 3 — Field Tech App | Pending |
| FIELD-13 | Phase 3 — Field Tech App | Pending |
| SCHED-01 | Phase 4 — Scheduling & Routing | Pending |
| SCHED-02 | Phase 4 — Scheduling & Routing | Pending |
| SCHED-03 | Phase 4 — Scheduling & Routing | Pending |
| SCHED-04 | Phase 4 — Scheduling & Routing | Pending |
| SCHED-05 | Phase 4 — Scheduling & Routing | Pending |
| SCHED-06 | Phase 4 — Scheduling & Routing | Pending |
| SCHED-07 | Phase 10 — Smart Features & AI | Pending |
| SCHED-08 | Phase 10 — Smart Features & AI | Pending |
| NOTIF-01 | Phase 5 — Office Operations & Dispatch | Pending |
| NOTIF-02 | Phase 5 — Office Operations & Dispatch | Pending |
| NOTIF-03 | Phase 5 — Office Operations & Dispatch | Pending |
| NOTIF-04 | Phase 5 — Office Operations & Dispatch | Pending |
| BILL-01 | Phase 7 — Billing & Payments | Pending |
| BILL-02 | Phase 7 — Billing & Payments | Pending |
| BILL-03 | Phase 7 — Billing & Payments | Pending |
| BILL-04 | Phase 7 — Billing & Payments | Pending |
| BILL-05 | Phase 7 — Billing & Payments | Pending |
| BILL-06 | Phase 7 — Billing & Payments | Pending |
| BILL-07 | Phase 7 — Billing & Payments | Pending |
| BILL-08 | Phase 7 — Billing & Payments | Pending |
| BILL-09 | Phase 7 — Billing & Payments | Pending |
| BILL-10 | Phase 7 — Billing & Payments | Pending |
| PORT-01 | Phase 8 — Customer Portal | Pending |
| PORT-02 | Phase 8 — Customer Portal | Pending |
| PORT-03 | Phase 8 — Customer Portal | Pending |
| PORT-04 | Phase 8 — Customer Portal | Pending |
| PORT-05 | Phase 8 — Customer Portal | Pending |
| PORT-06 | Phase 8 — Customer Portal | Pending |
| WORK-01 | Phase 6 — Work Orders & Quoting | Pending |
| WORK-02 | Phase 6 — Work Orders & Quoting | Pending |
| WORK-03 | Phase 6 — Work Orders & Quoting | Pending |
| WORK-04 | Phase 6 — Work Orders & Quoting | Pending |
| WORK-05 | Phase 6 — Work Orders & Quoting | Pending |
| WORK-06 | Phase 6 — Work Orders & Quoting | Pending |
| REPT-01 | Phase 9 — Reporting & Team Analytics | Pending |
| REPT-02 | Phase 9 — Reporting & Team Analytics | Pending |
| REPT-03 | Phase 9 — Reporting & Team Analytics | Pending |
| REPT-04 | Phase 9 — Reporting & Team Analytics | Pending |
| REPT-05 | Phase 9 — Reporting & Team Analytics | Pending |
| REPT-06 | Phase 9 — Reporting & Team Analytics | Pending |
| SMART-01 | Phase 10 — Smart Features & AI | Pending |
| SMART-02 | Phase 10 — Smart Features & AI | Pending |
| SMART-03 | Phase 10 — Smart Features & AI | Pending |
| TEAM-01 | Phase 11 — Payroll, Team Mgmt & Accounting | Pending |
| TEAM-02 | Phase 11 — Payroll, Team Mgmt & Accounting | Pending |
| TEAM-03 | Phase 11 — Payroll, Team Mgmt & Accounting | Pending |
| TEAM-04 | Phase 11 — Payroll, Team Mgmt & Accounting | Pending |
| TEAM-05 | Phase 11 — Payroll, Team Mgmt & Accounting | Pending |
| TEAM-06 | Phase 11 — Payroll, Team Mgmt & Accounting | Pending |
| TEAM-07 | Phase 11 — Payroll, Team Mgmt & Accounting | Pending |
| TEAM-08 | Phase 11 — Payroll, Team Mgmt & Accounting | Pending |
| TEAM-09 | Phase 11 — Payroll, Team Mgmt & Accounting | Pending |
| TEAM-10 | Phase 11 — Payroll, Team Mgmt & Accounting | Pending |
| TEAM-11 | Phase 11 — Payroll, Team Mgmt & Accounting | Pending |
| TEAM-12 | Phase 11 — Payroll, Team Mgmt & Accounting | Pending |
| PAYRL-01 | Phase 11 — Payroll, Team Mgmt & Accounting | Pending |
| PAYRL-02 | Phase 11 — Payroll, Team Mgmt & Accounting | Pending |
| PAYRL-03 | Phase 11 — Payroll, Team Mgmt & Accounting | Pending |
| PAYRL-04 | Phase 11 — Payroll, Team Mgmt & Accounting | Pending |
| PAYRL-05 | Phase 11 — Payroll, Team Mgmt & Accounting | Pending |
| PAYRL-06 | Phase 11 — Payroll, Team Mgmt & Accounting | Pending |
| PAYRL-07 | Phase 11 — Payroll, Team Mgmt & Accounting | Pending |
| PAYRL-08 | Phase 11 — Payroll, Team Mgmt & Accounting | Pending |
| PAYRL-09 | Phase 11 — Payroll, Team Mgmt & Accounting | Pending |
| PAYRL-10 | Phase 11 — Payroll, Team Mgmt & Accounting | Pending |
| PAYRL-11 | Phase 11 — Payroll, Team Mgmt & Accounting | Pending |
| PAYRL-12 | Phase 11 — Payroll, Team Mgmt & Accounting | Pending |
| PAYRL-13 | Phase 11 — Payroll, Team Mgmt & Accounting | Pending |
| PAYRL-14 | Phase 11 — Payroll, Team Mgmt & Accounting | Pending |
| PAYRL-15 | Phase 11 — Payroll, Team Mgmt & Accounting | Pending |
| ACCT-01 | Phase 11 — Payroll, Team Mgmt & Accounting | Pending |
| ACCT-02 | Phase 11 — Payroll, Team Mgmt & Accounting | Pending |
| ACCT-03 | Phase 11 — Payroll, Team Mgmt & Accounting | Pending |
| ACCT-04 | Phase 11 — Payroll, Team Mgmt & Accounting | Pending |
| ACCT-05 | Phase 11 — Payroll, Team Mgmt & Accounting | Pending |
| ACCT-06 | Phase 11 — Payroll, Team Mgmt & Accounting | Pending |
| ACCT-07 | Phase 11 — Payroll, Team Mgmt & Accounting | Pending |
| ACCT-08 | Phase 11 — Payroll, Team Mgmt & Accounting | Pending |
| ACCT-09 | Phase 11 — Payroll, Team Mgmt & Accounting | Pending |
| ACCT-10 | Phase 11 — Payroll, Team Mgmt & Accounting | Pending |
| ACCT-11 | Phase 11 — Payroll, Team Mgmt & Accounting | Pending |
| ACCT-12 | Phase 11 — Payroll, Team Mgmt & Accounting | Pending |
| ACCT-13 | Phase 11 — Payroll, Team Mgmt & Accounting | Pending |
| ACCT-14 | Phase 11 — Payroll, Team Mgmt & Accounting | Pending |
| ACCT-15 | Phase 11 — Payroll, Team Mgmt & Accounting | Pending |
| PAY-01 | Phase 11 — Payroll, Team Mgmt & Accounting | Pending |
| PAY-02 | Phase 11 — Payroll, Team Mgmt & Accounting | Pending |
| PAY-03 | Phase 11 — Payroll, Team Mgmt & Accounting | Pending |
| PAY-04 | Phase 11 — Payroll, Team Mgmt & Accounting | Pending |
| PAY-05 | Phase 11 — Payroll, Team Mgmt & Accounting | Pending |
| PAY-06 | Phase 11 — Payroll, Team Mgmt & Accounting | Pending |
| PAY-07 | Phase 11 — Payroll, Team Mgmt & Accounting | Pending |

| AGREE-01 | Phase 14 — Service Agreements & Contracts | Pending |
| AGREE-02 | Phase 14 — Service Agreements & Contracts | Pending |
| AGREE-03 | Phase 14 — Service Agreements & Contracts | Pending |
| AGREE-04 | Phase 14 — Service Agreements & Contracts | Pending |
| AGREE-05 | Phase 14 — Service Agreements & Contracts | Pending |
| AGREE-06 | Phase 14 — Service Agreements & Contracts | Pending |
| AGREE-07 | Phase 14 — Service Agreements & Contracts | Pending |
| AGREE-08 | Phase 14 — Service Agreements & Contracts | Pending |
| AGREE-09 | Phase 14 — Service Agreements & Contracts | Pending |
| AGREE-10 | Phase 14 — Service Agreements & Contracts | Pending |
| AGREE-11 | Phase 14 — Service Agreements & Contracts | Pending |
| AGREE-12 | Phase 14 — Service Agreements & Contracts | Pending |
| TEAM-13 | Phase 11 — Payroll, Team Mgmt & Accounting | Pending |
| TEAM-14 | Phase 11 — Payroll, Team Mgmt & Accounting | Pending |
| SMART-08 | Phase 10 — Smart Features & AI | Pending |
| NOTIF-34 | Phase 10 — Smart Features & AI | Pending |
| INV-01 | Phase 13 — Truck Inventory & Shopping Lists | Pending |
| INV-02 | Phase 13 — Truck Inventory & Shopping Lists | Pending |
| INV-03 | Phase 13 — Truck Inventory & Shopping Lists | Pending |
| INV-04 | Phase 13 — Truck Inventory & Shopping Lists | Pending |
| INV-05 | Phase 13 — Truck Inventory & Shopping Lists | Pending |
| INV-06 | Phase 13 — Truck Inventory & Shopping Lists | Pending |
| INV-07 | Phase 13 — Truck Inventory & Shopping Lists | Pending |
| INV-08 | Phase 13 — Truck Inventory & Shopping Lists | Pending |
| INV-09 | Phase 13 — Truck Inventory & Shopping Lists | Pending |
| INV-10 | Phase 13 — Truck Inventory & Shopping Lists | Pending |
| INV-11 | Phase 13 — Truck Inventory & Shopping Lists | Pending |
| INV-12 | Phase 13 — Truck Inventory & Shopping Lists | Pending |
| INV-13 | Phase 13 — Truck Inventory & Shopping Lists | Pending |
| PROJ-01 | Phase 12 — Projects & Renovations | Pending |
| PROJ-02 | Phase 12 — Projects & Renovations | Pending |
| PROJ-03 | Phase 12 — Projects & Renovations | Pending |
| PROJ-04 | Phase 12 — Projects & Renovations | Pending |
| PROJ-05 | Phase 12 — Projects & Renovations | Pending |
| PROJ-06 | Phase 12 — Projects & Renovations | Pending |
| PROJ-07 | Phase 12 — Projects & Renovations | Pending |
| PROJ-08 | Phase 12 — Projects & Renovations | Pending |
| PROJ-09 | Phase 12 — Projects & Renovations | Pending |
| PROJ-10 | Phase 12 — Projects & Renovations | Pending |
| PROJ-11 | Phase 12 — Projects & Renovations | Pending |
| PROJ-12 | Phase 12 — Projects & Renovations | Pending |
| PROJ-13 | Phase 12 — Projects & Renovations | Pending |
| PROJ-14 | Phase 12 — Projects & Renovations | Pending |
| PROJ-15 | Phase 12 — Projects & Renovations | Pending |
| PROJ-16 | Phase 12 — Projects & Renovations | Pending |
| PROJ-17 | Phase 12 — Projects & Renovations | Pending |
| PROJ-18 | Phase 12 — Projects & Renovations | Pending |
| PROJ-19 | Phase 12 — Projects & Renovations | Pending |
| PROJ-20 | Phase 12 — Projects & Renovations | Pending |
| PROJ-21 | Phase 12 — Projects & Renovations | Pending |
| PROJ-22 | Phase 12 — Projects & Renovations | Pending |
| PROJ-23 | Phase 12 — Projects & Renovations | Pending |
| PROJ-24 | Phase 12 — Projects & Renovations | Pending |
| PROJ-25 | Phase 12 — Projects & Renovations | Pending |
| PROJ-26 | Phase 12 — Projects & Renovations | Pending |
| PROJ-27 | Phase 12 — Projects & Renovations | Pending |
| PROJ-28 | Phase 12 — Projects & Renovations | Pending |
| PROJ-29 | Phase 12 — Projects & Renovations | Pending |
| PROJ-30 | Phase 12 — Projects & Renovations | Pending |
| PROJ-31 | Phase 12 — Projects & Renovations | Pending |
| PROJ-32 | Phase 12 — Projects & Renovations | Pending |
| PROJ-33 | Phase 12 — Projects & Renovations | Pending |
| PROJ-34 | Phase 12 — Projects & Renovations | Pending |
| PROJ-35 | Phase 12 — Projects & Renovations | Pending |
| PROJ-36 | Phase 12 — Projects & Renovations | Pending |
| PROJ-37 | Phase 12 — Projects & Renovations | Pending |
| PROJ-38 | Phase 12 — Projects & Renovations | Pending |
| PROJ-39 | Phase 12 — Projects & Renovations | Pending |
| PROJ-40 | Phase 12 — Projects & Renovations | Pending |
| PROJ-41 | Phase 12 — Projects & Renovations | Pending |
| PROJ-42 | Phase 12 — Projects & Renovations | Pending |
| PROJ-43 | Phase 12 — Projects & Renovations | Pending |
| PROJ-44 | Phase 12 — Projects & Renovations | Pending |
| PROJ-45 | Phase 12 — Projects & Renovations | Pending |
| PROJ-46 | Phase 12 — Projects & Renovations | Pending |
| PROJ-47 | Phase 12 — Projects & Renovations | Pending |
| PROJ-48 | Phase 12 — Projects & Renovations | Pending |
| PROJ-49 | Phase 12 — Projects & Renovations | Pending |
| PROJ-50 | Phase 12 — Projects & Renovations | Pending |
| PROJ-51 | Phase 12 — Projects & Renovations | Pending |
| PROJ-52 | Phase 12 — Projects & Renovations | Pending |
| PROJ-53 | Phase 12 — Projects & Renovations | Pending |
| PROJ-54 | Phase 12 — Projects & Renovations | Pending |
| PROJ-55 | Phase 12 — Projects & Renovations | Pending |
| PROJ-56 | Phase 12 — Projects & Renovations | Pending |
| PROJ-57 | Phase 12 — Projects & Renovations | Pending |
| PROJ-58 | Phase 12 — Projects & Renovations | Pending |
| PROJ-59 | Phase 12 — Projects & Renovations | Pending |
| PROJ-60 | Phase 12 — Projects & Renovations | Pending |
| PROJ-61 | Phase 12 — Projects & Renovations | Pending |
| PROJ-62 | Phase 12 — Projects & Renovations | Pending |
| PROJ-63 | Phase 12 — Projects & Renovations | Pending |
| PROJ-64 | Phase 12 — Projects & Renovations | Pending |
| PROJ-65 | Phase 12 — Projects & Renovations | Pending |
| PROJ-66 | Phase 12 — Projects & Renovations | Pending |
| PROJ-67 | Phase 12 — Projects & Renovations | Pending |
| PROJ-68 | Phase 12 — Projects & Renovations | Pending |
| PROJ-69 | Phase 12 — Projects & Renovations | Pending |
| PROJ-70 | Phase 12 — Projects & Renovations | Pending |
| PROJ-71 | Phase 12 — Projects & Renovations | Pending |
| PROJ-72 | Phase 12 — Projects & Renovations | Pending |
| PROJ-73 | Phase 12 — Projects & Renovations | Pending |
| PROJ-74 | Phase 12 — Projects & Renovations | Pending |
| PROJ-75 | Phase 12 — Projects & Renovations | Pending |
| PROJ-76 | Phase 12 — Projects & Renovations | Pending |
| PROJ-77 | Phase 12 — Projects & Renovations | Pending |
| PROJ-78 | Phase 12 — Projects & Renovations | Pending |
| PROJ-79 | Phase 12 — Projects & Renovations | Pending |
| PROJ-80 | Phase 12 — Projects & Renovations | Pending |
| PROJ-81 | Phase 12 — Projects & Renovations | Pending |
| PROJ-82 | Phase 12 — Projects & Renovations | Pending |
| PROJ-83 | Phase 12 — Projects & Renovations | Pending |
| PROJ-84 | Phase 12 — Projects & Renovations | Pending |
| PROJ-85 | Phase 12 — Projects & Renovations | Pending |
| PROJ-86 | Phase 12 — Projects & Renovations | Pending |
| PROJ-87 | Phase 12 — Projects & Renovations | Pending |
| PROJ-88 | Phase 12 — Projects & Renovations | Pending |
| PROJ-89 | Phase 12 — Projects & Renovations | Pending |
| PROJ-90 | Phase 12 — Projects & Renovations | Pending |
| PROJ-91 | Phase 12 — Projects & Renovations | Pending |
| PROJ-92 | Phase 12 — Projects & Renovations | Pending |

**Coverage:**
- v1 requirements: 238 total
- Mapped to phases: 238
- Unmapped: 0

---
*Requirements defined: 2026-03-03*
*Last updated: 2026-03-13 — Added Phase 12 Projects & Renovations (PROJ-01 through PROJ-92); TEAM-13/14 (geofence + punch clock); NOTIF-34 (dynamic ETA, Phase 10); SMART-08 (equipment performance monitoring); INV-01 through INV-13 (truck inventory & shopping lists, Phase 13); ANLYT-01 promoted from v2 to v1; Phases renumbered: Truck Inventory = Phase 13, Service Agreements = Phase 14, Subscription Billing = Phase 15*
