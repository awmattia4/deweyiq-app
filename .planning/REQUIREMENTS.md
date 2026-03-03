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
- [ ] **BILL-03**: Customers can pay invoices online via credit card or ACH through Stripe
- [ ] **BILL-04**: System supports AutoPay — customers can save payment method and auto-charge on invoice generation
- [ ] **BILL-05**: System retries failed payments with configurable dunning schedule
- [ ] **BILL-06**: System provides bi-directional sync with QuickBooks Online (customers, invoices, payments, expenses)
- [ ] **BILL-07**: System includes built-in accounting — P&L, expense tracking, revenue reporting, bank reconciliation
- [ ] **BILL-08**: System supports surcharging / convenience fee passthrough on credit card payments
- [ ] **BILL-09**: System provides tax prep exports and financial reporting

### Customer Portal

- [ ] **PORT-01**: Customer can view service history with reports, photos, and chemical readings
- [ ] **PORT-02**: Customer can view and pay invoices through the portal
- [ ] **PORT-03**: Customer can update their payment method and contact information
- [ ] **PORT-04**: Customer can request one-off services (green pool cleanup, opening/closing, repairs)
- [ ] **PORT-05**: Customer can send messages to the company through the portal
- [ ] **PORT-06**: Portal displays company branding (logo, colors)

### Notifications & Alerts

- [ ] **NOTIF-01**: System sends pre-arrival SMS/email notification to customer before tech arrives
- [ ] **NOTIF-02**: System sends post-service email with service report link after stop completion
- [ ] **NOTIF-03**: System provides alerts dashboard for office — missed stops, overdue invoices, declining chemical trends
- [ ] **NOTIF-04**: Office can configure alert types and notification channels (email, in-app, SMS)

### Work Orders & Quoting

- [ ] **WORK-01**: Office or tech can create work orders for repairs and one-off jobs
- [ ] **WORK-02**: Work orders attach to customer with photos, notes, parts, and labor
- [ ] **WORK-03**: Office can create professional quotes with line items for customer approval
- [ ] **WORK-04**: Customer can approve quotes through the portal or email link
- [ ] **WORK-05**: Approved quotes auto-convert to work orders
- [ ] **WORK-06**: Completed work orders can generate invoices

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

- **ANLYT-01**: Inventory management (truck stock, chemical usage tracking, reorder alerts)
- **ANLYT-02**: Seasonal trend analysis and demand forecasting

## Out of Scope

Explicitly excluded. Documented to prevent scope creep.

| Feature | Reason |
|---------|--------|
| Real-time chat between techs | Not core to service workflow; phone/text sufficient |
| Equipment marketplace | Separate business, not a software feature; Pool360 exists |
| Pool construction project management | Completely different workflow and persona; separate product category |
| Full GPS fleet tracking (always-on) | Battery drain, privacy concerns; use route progress polling instead |
| Native payroll (W2/1099 compliance) | Regulatory minefield; build pay tracking, export to ADP/Gusto |
| AI chatbot for customers | Hallucination risk for chemistry advice; keep customer comms templated |
| IoT sensor hardware sales | Hardware is a separate sales motion; 78% of pros buy supplies in-person |
| Multi-language support | English-only for US market in v1 |

## Traceability

Which phases cover which requirements. Updated during roadmap creation.

| Requirement | Phase | Status |
|-------------|-------|--------|
| (To be populated by roadmapper) | | |

**Coverage:**
- v1 requirements: 56 total
- Mapped to phases: 0
- Unmapped: 56 (awaiting roadmap)

---
*Requirements defined: 2026-03-03*
*Last updated: 2026-03-03 after initial definition*
