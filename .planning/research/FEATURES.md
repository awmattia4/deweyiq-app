# Feature Research

**Domain:** Pool Service Management SaaS
**Researched:** 2026-03-03
**Confidence:** HIGH (multiple verified sources including competitor product pages, industry reports, user reviews)

---

## Feature Landscape

### Table Stakes (Users Expect These)

Features users assume exist. Missing these = product feels incomplete or unprofessional.

| Feature | Why Expected | Complexity | Notes |
|---------|--------------|------------|-------|
| Route view for techs (mobile) | Core daily driver — techs live in the app all day | LOW | Must show stop list, map view, navigation link per stop. Offline required. |
| Offline mode with sync | Dead zones are common in field work; data loss = lost trust | MEDIUM | Must handle photo, readings, checklist capture offline, auto-sync on reconnect |
| Chemical readings entry (chlorine, pH, alkalinity, CYA, etc.) | Core of pool service — every visit | LOW | Per-stop data entry form; must feel fast (under 10 seconds) |
| LSI / Langelier Saturation Index calculator | Industry-standard water balance metric; pros expect it | MEDIUM | Powered by Orenda is common; can build custom. Required at stop level. |
| Chemical dosing recommendations | Flow from readings — automated dosing guidance is expected | MEDIUM | Based on readings + pool volume. Competitors: Skimmer (Orenda-powered), PoolBrain (automatic) |
| Photo capture per service stop | Proof of service; customer peace of mind; dispute protection | LOW | Standard since 2020+. Must attach to stop, appear in service report. |
| Customizable service checklists | Consistent service quality across techs | LOW | Per-customer or per-service-type templates. Mandatory/optional items. |
| Service report (digital, emailed to customer) | Customers expect proof of service post-visit | MEDIUM | Branded PDF/email with photos, readings, checklist items, notes. Auto-send after stop completion. |
| Customer management (CRM) | Foundation of every service business | LOW | Name, address, contact, gate codes, notes, pool specs, service history |
| Multiple pools per customer / multiple bodies of water | Many residential customers have spa + pool; commercial properties have dozens | MEDIUM | PoolBrain supports custom color codes and service levels per body of water |
| Route scheduling and optimization | Reduce drive time, serve more pools per day | HIGH | One-click optimization is table stakes; drag-and-drop assignment is expected |
| Recurring service scheduling | Pool service is recurring by nature (weekly, bi-weekly) | MEDIUM | Define frequency, auto-generate stops. Most competitors support this. |
| Work orders for repairs and one-off jobs | Techs handle repairs outside of routine stops | MEDIUM | Separate from route stops. Attach parts, labor, photos. |
| Invoicing | Get paid — core of any service business | MEDIUM | Per-stop, monthly bulk, flat-rate, per-chemical. Multiple billing models needed. |
| AutoPay / recurring billing | 76% of pool service companies bill monthly; customers expect set-it-and-forget-it | MEDIUM | Credit card on file, ACH, auto-charge on invoice generation. Retry logic on declines. |
| Online payment acceptance (credit, debit, ACH) | Customers expect digital payment. Paper checks = friction. | MEDIUM | Stripe-backed. ACH saves on processing fees (1% vs. 2.9%). |
| Customer portal (service history, billing, invoices) | Customers expect 24/7 self-service access | MEDIUM | View past reports, pay invoices, update payment method, submit service requests |
| Service notifications (email/SMS to customer) | Customers want to know when tech is arriving and what was done | LOW | Pre-arrival SMS, post-service email with report link |
| QuickBooks Online integration | Most pool companies use QBO for accounting; not having it blocks adoption | MEDIUM | Bi-directional sync preferred. One-way (Skimmer) is a known pain point. |
| Mobile-first tech app (iOS + Android) | Techs are in the field on phones, not desktops | LOW | Must feel native, not web-wrapped. Crash-free is table stakes. |
| Role-based access (owner, office, tech) | Different users need different permissions | MEDIUM | Tech sees only their route; office manages all; owner sees financials |
| Basic reporting (revenue, chemical usage, route completion) | Owners need to understand business performance | MEDIUM | Standard dashboards showing revenue trends, stop completion rates |
| Equipment tracking per pool | Techs need pump/filter/heater details; service history attached to equipment | MEDIUM | Brand, model, install date, service history. Auto-updates after service. |
| Quoting / estimating for repairs | Pool companies sell repair jobs; need professional quotes | MEDIUM | Line-item estimates, customer approval, auto-convert to work order |

---

### Differentiators (Competitive Advantage)

Features that set the product apart. Not required by users today, but valued — and where you win against Skimmer.

| Feature | Value Proposition | Complexity | Notes |
|---------|-------------------|------------|-------|
| Dramatically fewer clicks per stop | Skimmer users explicitly complain about "too many clicks." A stop should take 60 seconds end-to-end. | MEDIUM | UX architecture decision more than a feature. Tab-forward forms, smart defaults, one-tap common actions. |
| Built-in full accounting (no QBO dependency) | No competitor does this well for pool-specific companies. Paythepoolman attempts it; everyone else defers to QBO. Eliminates $30+/month QBO cost and sync headaches. | HIGH | P&L, expense tracking, bank reconciliation, revenue reporting, tax prep exports. True competitive moat. |
| Technician pay / commission tracking | Skimmer users explicitly requested this as a missing feature. PoolBrain has it, Skimmer doesn't. | MEDIUM | Per-stop pay rates, commission on upsells, payroll export or built-in payroll |
| AI-powered route optimization (real, not rebranded) | 16% of pool pros use AI actively (Skimmer State of Pool Service 2026). Most "AI" is rule-based. Real ML route optimization accounting for traffic, weather, pool service duration is a genuine differentiator. | HIGH | Use OSRM or Google Maps Routes API + optimization algorithm. Prove it's better with before/after stats. |
| Predictive chemical alerts | Flag pools trending toward imbalance before they become problems. Pattern-based on historical readings. | HIGH | Requires sufficient historical data (months of readings). Use linear regression or simple ML on per-pool chemistry history. Real differentiation once data accumulates. |
| Auto-scheduling based on service level | Rules-based: "Weekly customers get scheduled every 7 days; bi-weekly every 14" with automatic slot filling. Reduces office admin. | MEDIUM | Service level configs automatically drive recurring stop generation and route assignment. PoolBrain does this; Skimmer does not. |
| Comprehensive alerts dashboard | Supervisors get notified: high chemical usage, missed stops, overdue invoices, equipment alerts. PoolBrain has this; Skimmer is weak here. | MEDIUM | Configurable alert types, notification channels (email, in-app, SMS), severity levels |
| Real-time route progress (live map) | Office staff can see where each tech is and which stops are done — without techs calling in. | MEDIUM | GPS polling from mobile app. PoolBrain has this on map with real-time updates. Skimmer lacks true GPS tracking. |
| Customer self-service portal with service requests | Customers can request additional services (green pool cleanup, opening/closing) without calling. Converts portal from "view-only" to revenue-generating. | MEDIUM | Service request form in portal, auto-creates work order, office approves/dispatches |
| Bi-directional QBO sync (if not building full accounting) | Skimmer is explicitly one-way, causing data pain. PoolBrain markets this as a differentiator against Skimmer. | MEDIUM | Real-time two-way sync: invoices, payments, customers, expense categories |
| Technician scorecards and performance reports | Enable managers to coach techs on consistency, chemical efficiency, stop completion time | MEDIUM | Per-tech dashboard: stops/day, avg stop time, chemical cost/pool, customer satisfaction proxy |
| Chemical cost per pool profitability analysis | Know which pools are unprofitable before they drain the business | MEDIUM | Track chemical spend per pool vs. recurring revenue. Flag negative-margin pools. |
| Surcharging / convenience fee passthrough | Pool companies want to pass credit card processing fees to customers (legal in most states). Skimmer supports it. | LOW | Configurable surcharge %, auto-applied to credit card payments |
| Inventory / shopping list with cost tracking | Track what chemicals are used per stop, auto-deduct from truck inventory, flag reorder needs | HIGH | Requires inventory module. Tracks product cost → feeds per-pool profitability. |
| In-app messaging (tech to office) | Reduce phone calls with in-app comms tied to specific customers/jobs | MEDIUM | Threaded messages per customer/job. Push notifications. |
| Branded customer-facing experience | Company logo, colors on portal, service reports, invoices, SMS. White-label feel. | LOW | Template customization. High perceived value, low build cost. |
| Multi-body-of-water with distinct service levels | Commercial properties, HOAs with multiple pools. Each body = distinct chemistry, schedule, pricing. | MEDIUM | PoolBrain supports color-coding, custom names, custom schedules per body of water. |
| Open API for integrations | Enterprise/larger operators want to connect to supplier portals (Pool360), payroll, etc. | HIGH | REST API with key auth. Required for enterprise customers. PoolBrain markets this; Skimmer lacks it. |
| Consumer financing at point of quote | For large repair/renovation jobs, offer customers payment plans via Sunbit or similar. Increases close rate. | MEDIUM | Skimmer already integrates with Sunbit. Match and offer alternative. |

---

### Anti-Features (Commonly Requested, Often Problematic)

Features that seem good but create problems. Build these wrong and they become liabilities.

| Feature | Why Requested | Why Problematic | Alternative |
|---------|---------------|-----------------|-------------|
| Full GPS fleet tracking (always-on) | Owners want to know where trucks are at all times | Battery drain on tech phones (PoolBrain has this complaint), privacy concerns from techs, requires background location permissions across iOS/Android versions — rejection risk on App Store | Use GPS polling only during active route (opt-in during shift) + route completion verification via stop check-ins. Don't run GPS continuously. |
| Native payroll (full W2/1099 compliance) | Pool companies want to avoid separate payroll software | Payroll compliance is a regulatory minefield (state taxes, garnishments, FLSA). Building it correctly requires ongoing legal maintenance. | Build technician pay calculation and commission tracking. Export to ADP/Gusto/QuickBooks Payroll. Don't own the compliance layer. |
| Real-time "AI chat" for customers | Modern, impressive demo feature | LLM hallucinations about pool chemistry could cause real damage. Liability risk if AI gives bad chemical dosing advice. | Use AI internally for office staff suggestions; keep customer-facing communication templated and human-reviewed. |
| IoT sensor integration (real-time chemical monitoring) | Futuristic, impressive feature | Hardware dependency is a separate sales motion. 78% of pool pros still buy supplies in-person. IoT sensors aren't standard at customer pools. Premature for v1 or v2. | Build the data model to accept sensor readings as a future data source. Don't build the integration now. |
| Pool construction project management | Pool companies often do construction in addition to service | Completely different workflow from service management. Different personas (project managers, subcontractors), different data models. Full separate product category (Poologics, ProDBX serve this). | Keep scope to service + maintenance. Document pool construction as a future vertical only after service product achieves PMF. |
| "AI for everything" marketing features | Trend-chasing, impressive in demos | AI in pool software is 16% adoption (Skimmer report). 40% would "never trust AI with invoicing and payments." Overpromising AI erodes trust. | Use AI where it genuinely reduces work (route optimization, chemical alerts). Don't label basic automation as AI. |
| Marketplace for pool supplies | Pool pros buy from local distributors; Pool360 exists for PoolCorp | Supplier relationships are local and complex. Margin is thin. This is a separate business, not a software feature. | Integrate with Pool360 API for ordering history. Don't build a marketplace. |
| Enterprise multi-company franchise management | Larger operators want to run multiple franchise locations from one account | Extreme complexity: separate billing, isolated data, cross-company reporting. Different product than SMB pool service software. | Build multi-location support (owner sees all locations) for single companies. Defer true franchise SaaS until v3+. |

---

## Feature Dependencies

```
[Customer / CRM record]
    └──requires──> [Pool profile (per customer)]
                       └──requires──> [Body of water configuration]
                                          └──enables──> [Chemical readings per stop]
                                          └──enables──> [Equipment tracking per pool]
                                          └──enables──> [Service level / recurring schedule]

[Service level / recurring schedule]
    └──requires──> [Scheduling engine]
                       └──enables──> [Route builder]
                                         └──enables──> [Route optimization]
                                         └──enables──> [Tech mobile app (route view)]

[Tech mobile app]
    └──requires──> [Offline mode]
    └──requires──> [Chemical readings entry]
    └──requires──> [Checklist completion]
    └──requires──> [Photo capture]
    └──enables──> [Service report generation]
                       └──enables──> [Customer notification (SMS/email)]
                       └──enables──> [Customer portal (report view)]

[Invoicing]
    └──requires──> [Customer record]
    └──requires──> [Completed service stops OR work orders]
    └──enables──> [AutoPay / recurring billing]
    └──enables──> [Payment processing (Stripe)]
    └──enables──> [QBO sync]

[Work orders]
    └──requires──> [Customer record]
    └──requires──> [Equipment tracking (for repair context)]
    └──enables──> [Quoting / estimating]
    └──enables──> [Invoicing]

[Reporting / analytics]
    └──requires──> [Chemical readings history (months of data)]
    └──requires──> [Invoicing data]
    └──requires──> [Route completion data]
    └──enables──> [Chemical cost per pool analysis]
    └──enables──> [Technician scorecards]

[Predictive chemical alerts]
    └──requires──> [Chemical readings history (3+ months per pool)]
    └──requires──> [Alerting engine]
    └──NOTE──> Phase 3+ feature; data must accumulate first

[AI route optimization]
    └──requires──> [Route builder (existing stops, addresses)]
    └──requires──> [External routing API (Google/OSRM)]
    └──enables──> [Better routes than rule-based optimization]

[Built-in accounting]
    └──requires──> [Invoicing (revenue side)]
    └──requires──> [Expense tracking]
    └──conflicts──> [Heavy QBO integration investment] (pick one direction)

[Customer portal]
    └──requires──> [Service report generation]
    └──requires──> [Invoicing]
    └──requires──> [Payment processing]
    └──enables──> [Customer self-service requests]

[Technician pay / commission tracking]
    └──requires──> [Route completion data (stops per tech)]
    └──requires──> [Work order completion data]
    └──enables──> [Payroll export]
```

### Dependency Notes

- **Customer portal requires service reports:** Portal is read-only until reports exist. Don't launch portal before the tech app can generate reports.
- **Predictive alerts require historical data:** Cannot ship this feature at launch. Must accumulate 3+ months of chemistry readings per pool. Plan for Phase 3+.
- **Built-in accounting conflicts with deep QBO integration:** Choose a direction early. Building both creates maintenance burden and confused positioning. Recommendation: start with strong QBO bi-directional sync (differentiator vs. Skimmer), defer full native accounting to v2 unless it's a founding principle.
- **AI route optimization requires the basic route builder first:** Ship rule-based optimization in Phase 1; layer ML optimization in Phase 2+.
- **Technician app offline mode is a prerequisite, not a feature:** Must be architected from day one. Retrofitting offline support to an online-only app is a painful rewrite.

---

## MVP Definition

### Launch With (v1)

Minimum viable product to displace Skimmer for a small-to-mid pool service company (5-50 pools).

- [ ] **Customer + pool profile management** — Foundation for everything. Gate codes, pool specs, equipment, notes.
- [ ] **Route builder with recurring stops** — Define weekly/bi-weekly routes, assign to techs.
- [ ] **Tech mobile app (iOS + Android, offline-capable)** — The daily driver. Must be fast, crash-free, offline-first.
- [ ] **Chemical readings + LSI calculator per stop** — Core of pool service. Non-negotiable.
- [ ] **Checklist completion per stop** — Customizable per customer or service type.
- [ ] **Photo capture attached to stop** — Proof of service.
- [ ] **Auto-generated service report (emailed to customer)** — Branded PDF/email. Auto-send on stop completion.
- [ ] **Route optimization (one-click)** — Rule-based is fine for v1. Must reduce drive time visibly.
- [ ] **Real-time route progress dashboard (office view)** — See which stops are done, where techs are.
- [ ] **Invoicing with multiple billing models** — Per-stop, monthly flat, plus-chemicals. Bulk invoice generation.
- [ ] **AutoPay with Stripe (credit + ACH)** — Set-and-forget billing. Retry on decline.
- [ ] **Customer portal (view reports, pay invoices)** — Read-only at first. Reduces customer support calls.
- [ ] **Multi-role access (owner, office, tech)** — Security and scope boundaries from day one.
- [ ] **QBO bi-directional sync** — Table stakes for adoption; differentiate vs. Skimmer's one-way.
- [ ] **Work orders for repair jobs** — Attach to customers, generate invoices.
- [ ] **Basic reporting (revenue, completion rates)** — Owner dashboard with key KPIs.
- [ ] **SMS + email customer notifications** — Pre-arrival and post-service.

### Add After Validation (v1.x)

Add once core is working and first cohort of customers validates the product.

- [ ] **Technician pay + commission tracking** — Triggered when: customers ask about payroll or managing tech compensation. Fills Skimmer gap.
- [ ] **Quoting / estimating for repairs** — Triggered when: techs regularly need to quote jobs in the field.
- [ ] **Comprehensive alerts dashboard** — Triggered when: office staff complain about monitoring gaps (missed stops, declining accounts).
- [ ] **Technician scorecards** — Triggered when: owners want to measure and coach tech performance.
- [ ] **Chemical cost per pool profitability** — Triggered when: customers ask "which pools am I losing money on?"
- [ ] **In-app messaging (tech to office)** — Triggered when: call volume between office and field becomes a pain point.
- [ ] **Customer self-service requests in portal** — Triggered when: admin workload from customer phone calls is measurable.
- [ ] **Surcharging / convenience fee passthrough** — Quick win, high revenue impact for customers. Low build complexity.
- [ ] **Multi-body-of-water with distinct service levels** — Triggered when: commercial or HOA customers are in pipeline.

### Future Consideration (v2+)

Defer until product-market fit is established and team has capacity.

- [ ] **Built-in full accounting (native P&L, expense tracking)** — High build cost, deep competitive moat. Only build if QBO sync proves insufficient or accounting is a founding priority.
- [ ] **AI route optimization (ML-based)** — After rule-based optimization ships and route data accumulates. Phase 2.
- [ ] **Predictive chemical alerts** — After 3+ months of chemistry data per pool. Phase 3.
- [ ] **Inventory management (truck stock, reorder alerts)** — High complexity. Defer unless customers are losing money on chemical reconciliation.
- [ ] **Open API** — Defer until enterprise customers are in pipeline. Build incrementally.
- [ ] **Consumer financing integration (Sunbit)** — Nice-to-have for repair sales. Defer.
- [ ] **IoT sensor integration** — Future data source. Design schema to accept it; don't build integration now.
- [ ] **Multi-company / enterprise accounts** — After PMF with SMB. Different product motion.

---

## Feature Prioritization Matrix

| Feature | User Value | Implementation Cost | Priority |
|---------|------------|---------------------|----------|
| Tech mobile app (offline, readings, photos, checklist) | HIGH | HIGH | P1 |
| Route builder + recurring scheduling | HIGH | MEDIUM | P1 |
| Service report auto-generation + email | HIGH | MEDIUM | P1 |
| Invoicing + AutoPay (Stripe) | HIGH | MEDIUM | P1 |
| Customer portal (view reports, pay) | HIGH | MEDIUM | P1 |
| Chemical readings + LSI calculator | HIGH | LOW | P1 |
| QBO bi-directional sync | HIGH | MEDIUM | P1 |
| Route optimization (rule-based) | HIGH | MEDIUM | P1 |
| Real-time route progress (office) | HIGH | MEDIUM | P1 |
| Multi-role access | HIGH | LOW | P1 |
| Basic reporting dashboard | MEDIUM | LOW | P1 |
| Work orders | HIGH | LOW | P1 |
| Technician pay / commission | HIGH | MEDIUM | P2 |
| Quoting / estimating | MEDIUM | MEDIUM | P2 |
| Comprehensive alerts dashboard | HIGH | MEDIUM | P2 |
| Technician scorecards | MEDIUM | MEDIUM | P2 |
| Chemical cost profitability per pool | HIGH | MEDIUM | P2 |
| Customer self-service requests | MEDIUM | LOW | P2 |
| Surcharging | MEDIUM | LOW | P2 |
| Multi-body-of-water | MEDIUM | MEDIUM | P2 |
| In-app messaging | MEDIUM | MEDIUM | P2 |
| Inventory management | MEDIUM | HIGH | P3 |
| AI route optimization (ML) | MEDIUM | HIGH | P3 |
| Predictive chemical alerts | HIGH | HIGH | P3 |
| Built-in full accounting | HIGH | HIGH | P3 |
| Open API | MEDIUM | HIGH | P3 |

**Priority key:**
- P1: Must have for launch — without these, product is not viable
- P2: Should have — add in v1.x after initial cohort validates core
- P3: Nice to have — future consideration, high moat when built

---

## Competitor Feature Analysis

| Feature | Skimmer | PoolBrain | Pool Office Manager | Our Approach |
|---------|---------|-----------|---------------------|--------------|
| Mobile tech app (offline) | Yes | Yes (native) | Yes | Must match or exceed |
| Chemical readings + LSI | Yes (Orenda) | Yes (auto-dosing) | Yes | Match + make faster per stop |
| Route optimization | Yes (one-click) | Yes (drag-and-drop map) | Yes | Match + add AI optimization later |
| Real-time route progress | No (no GPS) | Yes (live map) | Partial | Beat Skimmer; match PoolBrain |
| Service reports | Yes | Yes | Yes | Match + improve branding |
| AutoPay / Stripe | Yes (credit + ACH) | Yes | Yes | Match |
| Invoicing | Basic | Stronger (built-in) | Yes | Match PoolBrain's depth |
| QBO sync | One-way | Bi-directional | Yes | Beat Skimmer: bi-directional |
| Built-in accounting | No (QBO only) | No (QBO sync) | Partial | Differentiator: build natively or make QBO seamless |
| Customer portal | Yes | Yes | Yes | Match + add self-service requests |
| Technician pay/commission | No | Yes | Unknown | Beat Skimmer |
| Technician scorecards | No | Yes | No | Beat Skimmer |
| Alerts dashboard | Weak | Strong | Unknown | Match PoolBrain |
| Multi-body-of-water | Basic | Strong (color-coded, per-body configs) | Partial | Match PoolBrain |
| Equipment tracking | Basic | Yes (auto-updating workflows) | Yes | Match PoolBrain |
| Open API | No | Yes | No | Future differentiator |
| Inventory management | Shopping list (basic) | Partial | Yes | Phase 2 |
| GPS tracking | No | Yes | Partial | Phase 1 for live progress, not always-on |
| Payroll | No | Commission only | No | Commission tracking in P2; full payroll export in P3 |
| AI features | Route optimization (claimed) | Route optimization | No | Honest AI: real ML route opt + predictive chemistry |
| Pricing model | Per pool ($2/mo) | Per tech + per admin | Unknown | Per pool or flat tier; transparent |

---

## Sources

- [Skimmer Back Office Features](https://www.getskimmer.com/product/backoffice) — official product page, HIGH confidence
- [Skimmer Complete Guide to Best Pool Service Software](https://www.getskimmer.com/blog/the-best-pool-service-software-complete-guide) — Skimmer's own analysis of must-have features, MEDIUM confidence (vendor-produced but detailed)
- [Skimmer 2026 State of Pool Service Report](https://www.getskimmer.com/stateofpoolservice) — industry survey of 30,000+ pool pros, HIGH confidence for market trends
- [PoolBrain vs Skimmer Feature Comparison](https://poolcompanysoftware.poolbrain.com/skimmer-vs-poolbrain) — competitor-produced, MEDIUM confidence (vendor bias, but specific and detailed)
- [Pool Dial Software Landscape Analysis](https://www.pooldial.com/resources/articles/business/pool-service-software-landscape) — comprehensive third-party analysis including market segmentation and AI adoption stats, MEDIUM confidence
- [UpBuoy Pool Service Software Comparison 2025](https://www.upbuoy.com/blog/best-pool-service-management-software-2025) — multi-platform comparison with feature tables, MEDIUM confidence
- [SafetyCulture Pool Service Software Comparison](https://safetyculture.com/apps/pool-service-software/) — neutral third-party comparison matrix, MEDIUM confidence
- [Skimmer Capterra Reviews 2025-2026](https://www.capterra.com/p/177014/Skimmer/reviews/) — verified user reviews for pain points, HIGH confidence for user sentiment
- [Paythepoolman Feature Overview](https://www.paythepoolman.com/) — competitor with built-in payroll/accounting, MEDIUM confidence
- [Skimmer State of Pool Service (AI adoption data)](https://www.getskimmer.com/stateofpoolservice) — 16% active AI adoption, 40% would never trust AI with invoicing, HIGH confidence

---
*Feature research for: Pool Service Management SaaS ("Skimmer Killer")*
*Researched: 2026-03-03*
