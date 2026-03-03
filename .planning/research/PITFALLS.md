# Pitfalls Research

**Domain:** Pool Service Management SaaS (Field Service + Accounting + Customer Portal)
**Researched:** 2026-03-03
**Confidence:** MEDIUM (domain-specific patterns verified across multiple sources; some findings from WebSearch only, flagged accordingly)

---

## Critical Pitfalls

### Pitfall 1: Offline-First is Not Optional — Then It's Bolted On Wrong

**What goes wrong:**
The mobile app is built assuming reliable connectivity. Techs in areas with spotty cell coverage (backyards, rural areas, inside equipment rooms) can't log readings, capture photos, or complete service records. The team then retrofits offline support as an afterthought — which almost always produces data loss bugs, sync conflicts, and corrupted records when devices reconnect.

**Why it happens:**
Development happens in offices and homes with reliable WiFi. No one tests the experience in a pool equipment room with zero signal. Offline is treated as an edge case rather than the primary mode for field techs.

**How to avoid:**
Design the tech mobile app as offline-first from day one. All writes go to the local device store first (SQLite via WatermelonDB or similar) and sync to the server asynchronously. Build a deterministic conflict resolution strategy before writing a single screen: last-write-wins for most fields, but server-wins for financial records. Implement sync status indicators so techs always know what is saved locally vs. confirmed to server.

**Warning signs:**
- If the app requires an API call to render the service checklist, you're not offline-first.
- If sync is described as "we'll add that later," it's already a problem.
- If techs report "I filled out the form but it didn't save," data loss is already happening.

**Phase to address:** Tech Mobile App (Phase 1/2) — must be foundational, not added later.

---

### Pitfall 2: Chemistry Calculations Are a Liability Surface, Not Just a Feature

**What goes wrong:**
Chemical dosing calculators display wrong quantities because of incorrect assumptions: treating all chlorine types identically (liquid chlorine, calcium hypochlorite, and trichlor dose very differently), not accounting for cyanuric acid's effect on alkalinity (CYA alkalinity must be subtracted from Total Alkalinity before LSI calculation), or rounding pool volume to a broad range rather than using the exact volume entered. Overcalculating chlorine or acid causes equipment damage and customer health incidents. Undercalculating results in algae outbreaks and failed health inspections for commercial pools.

**Why it happens:**
Developers use simplified formulas without consulting certified pool chemistry references. The Langelier Saturation Index formula was simplified (by Carrier in 1965) from Langelier's original and the simplified version has known accuracy limits that apps often ignore. CYA's contribution to alkalinity is a widely-misunderstood correction that most basic implementations skip.

**How to avoid:**
Use formulas validated against CPO (Certified Pool Operator) curriculum and cross-check with established calculators like Pool Math (Trouble Free Pool) or PoolCalculator.com. Support all common sanitizer types as separate calculation paths (liquid chlorine/sodium hypochlorite, calcium hypochlorite, lithium hypochlorite, dichlor, trichlor, salt/SWG). Always apply the CYA-to-carbonate alkalinity correction before LSI calculation. Add a disclaimer and recommend professional verification for commercial pools. Never display results without showing the inputs used.

**Warning signs:**
- Calculator uses a single "chlorine ppm" input without asking the sanitizer type.
- "Total Alkalinity" is used directly in LSI calculation without CYA correction.
- Pool volume is asked as a dropdown range (e.g., "10,000–15,000 gallons") rather than exact entry.
- No audit trail of what inputs produced which recommendation.

**Phase to address:** Chemistry/Service Logging features (Phase 1/2) — get this right before beta testing with real techs on real pools.

---

### Pitfall 3: Scope Collapse — Building Everything Before Anyone Pays You

**What goes wrong:**
The ambition to build a "Skimmer killer" with routing, chemistry, invoicing, accounting, customer portal, and AI features simultaneously results in 12–18 months of development before any customer pays. By launch, the market has shifted, Skimmer has shipped the features you differentiated on, or you've run out of runway. Alternatively, you ship everything at 60% quality and the app feels "feature-rich but broken."

**Why it happens:**
When competing against an established product, the instinct is to match all features before going to market. But established competitors built features over years; replicating that before launch means building 5 years of product in 6 months.

**How to avoid:**
Phase ruthlessly. The MVP is: tech mobile app (route view, service logging, basic chemistry), office scheduling dashboard, and invoicing with Stripe payments. That's it. Everything else — AI routing, predictive alerts, customer portal, full accounting — is Phase 2+. Find 3–5 pilot pool companies willing to use the MVP in exchange for input. The first dollar collected validates more than any internal feature review.

**Warning signs:**
- Roadmap has no defined "stop shipping new features" milestone before beta.
- No external customers are using the app at any point in the first 6 months.
- Conversations about features regularly outnumber conversations about actual user behavior.

**Phase to address:** Phase 0 (scoping) — this is a planning discipline, not a technical fix.

---

### Pitfall 4: Multi-Tenant Data Isolation Done After the Fact

**What goes wrong:**
The schema is built without tenant isolation — no `company_id` on every table, or row-level security policies added as an afterthought. As soon as a second company is onboarded, cross-tenant data leaks appear: tech A from Company X can see customers from Company Y. This is not just a UX bug — it's a data breach and a churn-inducing trust incident.

**Why it happens:**
Early prototyping often starts with a single company in mind. Adding multi-tenancy later requires auditing every query, every API endpoint, and every background job — it becomes a rewrite-scale effort.

**How to avoid:**
Add `company_id` as a non-nullable foreign key on every entity from day one: customers, pools, routes, service records, invoices, chemicals, everything. Use Postgres Row-Level Security (RLS) policies scoped to the authenticated tenant. Never bypass RLS in application code — if a query requires disabling it, that's a red flag. In Supabase, enable RLS at table creation time, not after data is in it.

**Warning signs:**
- Any API endpoint that accepts a resource ID without also validating the caller's `company_id`.
- RLS described as something to "add before launch."
- Admin views that query across all tenants using the same ORM as single-tenant queries.

**Phase to address:** Database schema / auth setup (Phase 1, Week 1) — no code goes in without this.

---

### Pitfall 5: Pricing Model That Punishes Growth (Per-Pool Pricing at the Wrong Tier)

**What goes wrong:**
Skimmer's model ($2/pool/month) is their biggest churn driver — users left specifically after Skimmer doubled from $1 to $2 per pool. A pool company with 300 pools pays $600/month just for the base management layer, before paying for any add-ons. At the same time, pricing too flat (a single monthly price regardless of usage) means small companies subsidize large ones and the economics don't work.

**Why it happens:**
Per-pool pricing feels logical (cost scales with usage), but it means successful customers pay exponentially more, which makes them the first to switch when a competitor offers a flat rate.

**How to avoid:**
Use tiered flat pricing with pool count bands, not pure per-pool. Example: $99/month up to 50 pools, $199/month up to 150 pools, $349/month unlimited. This gives predictability to customers and unit economics to you. Don't charge per-text-message for customer notifications — bundle SMS into the subscription. Test price sensitivity with pilot customers before locking in pricing.

**Warning signs:**
- Pricing model was chosen because "that's what Skimmer does."
- No conversation with real pool company owners about what they'd pay.
- The pricing page is built before any customer has seen the product.

**Phase to address:** Business model (Phase 0) — validate with pilot customers, not internally.

---

### Pitfall 6: Accounting Integration That Creates Double-Entry Hell

**What goes wrong:**
The app creates invoices internally, but owners still export to QuickBooks manually. Or the integration is built one-way (jobs sync to QBO, but payments collected in-app don't sync back), so the accountant sees "paid" in the app and "unpaid" in QuickBooks. Disputed invoices can't be resolved because the source of truth is split between two systems.

**Why it happens:**
Bidirectional accounting sync is genuinely hard. Most teams do the easy half (push invoices to QBO) and declare victory, leaving the other half (payments, refunds, voids, partial credits) for "later." Later never comes.

**How to avoid:**
Make a deliberate choice: either own the accounting fully (no QBO dependency, with your own GL, P&L, and balance sheet) or treat QBO as the system of record and build a true bidirectional sync from day one. The "Skimmer killer" framing suggests owning accounting fully. If you do, every financial event — invoice creation, payment, refund, write-off, expense — must flow through a proper ledger, not just a transactions table. Build the ledger data model before building UI.

**Warning signs:**
- "We'll add QuickBooks integration in Phase 3" with no plan for what happens to financial data before Phase 3.
- The word "sync" in project discussions without a defined sync direction and conflict resolution policy.
- Invoices exist in the app but there's no `payments` table yet.

**Phase to address:** Financial data model (Phase 1) — decide architecture before writing invoice UI.

---

### Pitfall 7: Tech Mobile UX Built for Office Staff, Not Field Conditions

**What goes wrong:**
The mobile app is designed on a laptop in good lighting with clean dry hands. In the field, techs use phones in direct sunlight (screens wash out), with wet or chlorine-sticky hands (fat-finger errors on small inputs), and they're in a hurry (completing 15–20 pools per day). An app requiring five taps to log a service reading is abandoned in favor of keeping notes on paper and entering them later, defeating the purpose of the app.

**Why it happens:**
Designers reference standard mobile UX patterns from app store showcases. Actual field testing is rarely done before shipping. The problem is invisible in internal demos.

**How to avoid:**
Minimum standards for the tech mobile UI: 44px minimum tap targets, high-contrast colors (minimum 4.5:1 ratio in sunlight conditions), no more than 3 taps to complete the most common action (log service), offline-first so techs don't wait for API responses. Use numeric keypads with large targets for chemistry readings — not text fields with phone keyboard. Photo capture must work one-handed. Conduct real-world field tests with a pilot tech before Phase 1 ships.

**Warning signs:**
- Service log form has more than 8 required fields.
- Dropdown menus are used for inputs that could be large-button selects.
- The app has never been tested outside in sunlight.

**Phase to address:** Tech mobile app UX (Phase 1/2) — do a field test before beta, not after.

---

## Technical Debt Patterns

Shortcuts that seem reasonable but create long-term problems.

| Shortcut | Immediate Benefit | Long-term Cost | When Acceptable |
|----------|-------------------|----------------|-----------------|
| Skip multi-tenant RLS, use app-level filtering | Ship faster | Data leak, full rewrite of all queries | Never |
| Use `Total Alkalinity` directly in LSI (skip CYA correction) | Simpler chemistry code | Wrong dosing recommendations, liability exposure | Never |
| Build offline support as "cache the last response" | Weeks saved | Data loss when tech submits offline form, corrupted sync | Never |
| One-way QBO sync (push invoices, don't pull payments) | Half the work | Double-entry for accountants, split source of truth | Only if QBO sync is explicitly out of scope in current phase |
| Per-tech GPS polling every 30 seconds for live tracking | Simple to implement | Battery drain complaints from techs, cellular cost at scale | Every 5 minutes max; on-demand check-in preferred |
| Store photos in app server filesystem rather than object storage | No S3 setup cost | Can't scale, breaks on server migration | Only for local dev/prototype |
| Roll your own auth | No third-party dependency | Security vulnerabilities, missing MFA/SSO | Never — use Supabase Auth or similar |
| Hard-code tax rate | Simplifies invoice UI | Breaks for multi-state customers, requires schema migration | Only if you're 100% single-state for the foreseeable future |

---

## Integration Gotchas

Common mistakes when connecting to external services.

| Integration | Common Mistake | Correct Approach |
|-------------|----------------|------------------|
| Stripe / ACH | Treating ACH as synchronous (it's not — it can fail days later) | Webhook handling for `payment_intent.payment_failed` and `charge.failed` events; don't mark invoice paid until webhook confirms |
| Stripe invoices | Assuming you can apply a payment across multiple invoices | Stripe applies one payment to one invoice; design invoice grouping accordingly |
| Stripe ACH / Direct Debit | Not setting up Smart Retries for failed payments | Enable automatic retries in Stripe Billing settings; implement dunning emails via webhook |
| QuickBooks Online | Building one-way sync and stopping there | Commit to bidirectional or own the full accounting stack — no middle ground |
| Google Maps / Route Optimization | Using Google Maps Directions API for routing 15+ stops | Directions API is point-to-point, not VRP. Use Google Routes Optimization API or OSRM for multi-stop route optimization |
| SMS Notifications | Sending SMS directly per notification event without rate limiting | Route all outbound SMS through a queue; implement per-customer daily message caps |
| Supabase RLS | Adding RLS policies after data is already in the table | Enable RLS at table creation; test with non-admin auth contexts before any data insertion |

---

## Performance Traps

Patterns that work at small scale but fail as usage grows.

| Trap | Symptoms | Prevention | When It Breaks |
|------|----------|------------|----------------|
| No database indexes on `company_id` + `date` for service records | Page loads fast at 100 pools; slow at 5,000 | Add composite indexes on all tables that will be filtered by tenant + date on schema creation | ~1,000 pools or 30+ day history |
| Loading full route with all customer details in one API response | Fast for a 10-stop route | Paginate; load customer detail on-demand when tech taps a stop | Routes >25 stops |
| Computing route optimization synchronously on web server | Works for one request | Move to background job queue (BullMQ/Inngest); return job ID immediately | Concurrent optimization requests from different companies |
| Storing all photos in a single bucket folder without partitioning | Works for early beta | Partition by `company_id/year/month/` in object storage key prefix | 50,000+ photos |
| Real-time dashboard polling every 10 seconds for tech locations | Works with 2 techs | Use Supabase Realtime or WebSockets with change events, not polling | 10+ concurrent techs in view |
| Recalculating all invoice balances on every page load | Unnoticeable with 50 invoices | Materialize balance as a column updated on payment events | 500+ open invoices per company |

---

## Security Mistakes

Domain-specific security issues beyond general web security.

| Mistake | Risk | Prevention |
|---------|------|------------|
| No tenant isolation at DB level (only at app level) | Any query bug becomes a data breach exposing all customers' pool chemistry, billing, and addresses | Postgres RLS with `auth.uid()` based policies; enforced at every table |
| Storing payment method details anywhere in your own DB | PCI compliance violation, massive liability | Never store raw card data; use Stripe payment methods tokens only |
| Displaying full ACH account numbers in customer portal | Bank account exposure | Show only last 4 digits; never store or display full account number |
| Tech can view/edit any company's data by manipulating IDs in API requests | Complete data breach | Validate `company_id` ownership on every resource lookup in API middleware |
| Customer portal allows unauthenticated invoice access via predictable URL | Neighbor can view your billing history | Require auth for all invoice/portal views; use signed short-lived URLs for PDF downloads |
| Chemistry reading history is world-readable | Competitor intel, privacy violation for residential customers | Scope all chemistry history reads to authenticated customer owning that pool |
| No audit log for financial record changes | Can't dispute invoice edits, no fraud detection | Append-only audit log for all invoice create/edit/void/payment events |

---

## UX Pitfalls

Common user experience mistakes in this domain.

| Pitfall | User Impact | Better Approach |
|---------|-------------|-----------------|
| Tech app requires login on every app open | Techs start their day logging in at 7am in a parking lot — friction causes "I'll do it later" → data loss | Remember session, require re-auth only after 24h inactivity or device change |
| Service log has no "quick complete" for pools with no issues | 20 pools a day, each requiring full form entry → app abandonment | One-tap "service complete — no issues" with pre-filled date/tech/reading from last visit |
| Invoice sent to customer with no context ("Invoice #1043 for $150 due 3/15") | Customer calls office to ask what they're paying for | Invoice must include service dates, tech name, chemicals added, photo thumbnail |
| Office dashboard shows all active work orders in a flat list | 50 pending work orders become unusable noise | Default to today's view, with color-coded status; archived completed WOs automatically |
| Customer portal requires account creation before viewing first invoice | Customer ignores email, invoice goes unpaid | Allow one-click invoice view via signed magic link; prompt account creation after payment |
| Chemistry alert fires for every pool in range without priority | Alert fatigue → alerts ignored | Only surface alerts requiring action within 48 hours; group by route for tech efficiency |
| Route map shows all pools as pins without real-time tech location | Office can't see where Mike is without calling him | Overlay tech GPS breadcrumb on route map in office dashboard |

---

## "Looks Done But Isn't" Checklist

Things that appear complete but are missing critical pieces.

- [ ] **Invoicing:** Often missing — failed payment handling. Verify: what happens when Stripe ACH payment fails on day 3? Does the invoice revert to unpaid? Does the customer get an email?
- [ ] **Offline sync:** Often missing — conflict resolution. Verify: two techs edit the same pool record (one offline, one online). What wins? Is there a merge strategy or does one silently overwrite the other?
- [ ] **Chemistry calculator:** Often missing — CYA correction for LSI. Verify: enter CYA = 50ppm and check that total alkalinity is corrected to carbonate alkalinity before LSI is calculated. Compare output against Pool Math (Trouble Free Pool).
- [ ] **Multi-tenant isolation:** Often missing — cross-tenant API tests. Verify: authenticated as Company A, can you GET `/api/customers/{id}` where that customer belongs to Company B?
- [ ] **Route optimization:** Often missing — real-world constraints. Verify: does the optimizer respect tech start/end location (home address vs. depot)? Does it handle "must arrive before 10am" service windows?
- [ ] **Customer portal:** Often missing — mobile-responsive invoice view. Verify: open the customer's invoice email on a phone. Is the PDF link usable or does it open a desktop layout?
- [ ] **Photo capture:** Often missing — storage size limits and compression. Verify: tech takes 20 photos across a route. What's the upload size? Is there client-side compression before upload?
- [ ] **Expense tracking:** Often missing — chemical cost attribution to specific pools. Verify: when a tech logs chemical additions, does the material cost flow into the job cost report or is it a separate entry?

---

## Recovery Strategies

When pitfalls occur despite prevention, how to recover.

| Pitfall | Recovery Cost | Recovery Steps |
|---------|---------------|----------------|
| Offline sync data loss discovered in production | HIGH | 1) Disable offline mode, require online-only temporarily. 2) Audit device-side logs to reconstruct lost records. 3) Contact affected techs for manual re-entry. 4) Redesign sync with proper local-first store before re-enabling. |
| Cross-tenant data leak discovered | CRITICAL | 1) Immediately revoke all active sessions. 2) Enable emergency maintenance mode. 3) Audit access logs to determine scope. 4) Notify affected customers per data breach requirements. 5) Add RLS policies before re-enabling. |
| Chemistry calculation error identified post-launch | HIGH | 1) Disable the calculator immediately. 2) Notify all affected accounts with what corrections to check. 3) Fix formula with CPO-validated reference. 4) Add regression tests for all known edge cases before re-enabling. |
| Stripe ACH payment misclassified as paid | MEDIUM | 1) Add webhook-driven status reconciliation job. 2) Re-check all ACH invoices created in affected window. 3) Send corrected statements to customers. |
| Per-pool pricing causes SMB churn at growth stage | MEDIUM | 1) Introduce tiered flat pricing bands as upgrade path. 2) Grandfather existing customers at old rate for 90 days. 3) Use winback campaign on churned customers. |
| Scope bloat delays MVP by 6+ months | MEDIUM | 1) Hard-cut feature list to field app + scheduling + basic invoicing. 2) Move everything else to post-MVP backlog. 3) Get one paying pilot customer as the forcing function to ship. |

---

## Pitfall-to-Phase Mapping

How roadmap phases should address these pitfalls.

| Pitfall | Prevention Phase | Verification |
|---------|------------------|--------------|
| Offline sync data loss | Phase 1 (Tech Mobile App foundation) | E2E test: complete service record offline, kill network, restore network, confirm record in server DB |
| Chemistry calculation errors | Phase 1–2 (Chemistry Logging) | Unit tests for all sanitizer types, CYA correction, and LSI edge cases; cross-check against Pool Math outputs |
| Scope collapse | Phase 0 (Planning) | Every feature not on MVP list is explicitly in a "backlog" column before development starts |
| Multi-tenant data isolation | Phase 1, Week 1 (Schema & Auth) | Automated test: create two tenant accounts, attempt cross-tenant resource access, verify 403 |
| Wrong pricing model | Phase 0 (Business model validation) | 5 conversations with real pool company owners about willingness to pay before pricing is set |
| Double-entry accounting | Phase 2–3 (Invoicing & Accounting) | Define ledger data model before building invoice UI; no QBO dependency without bidirectional sync plan |
| Field tech UX for outdoor conditions | Phase 1–2 (Tech Mobile UX) | Field test with at least one real tech in real conditions before beta; test in direct sunlight |
| Stripe ACH async failure handling | Phase 3 (Payments) | Webhook integration test: simulate ACH failure via Stripe test mode, confirm invoice reverts to unpaid and customer email fires |
| Performance at scale | Phase 3–4 (Hardening) | Load test with 500 concurrent techs submitting service records; profile slow queries with pg_stat_statements |
| Customer portal missing mobile UX | Phase 4 (Customer Portal) | Test entire portal flow on mobile Safari (iOS) and Chrome (Android) before launch |

---

## Sources

- [10 Common Pitfalls in Implementing Pool Management Software — The Pool Nest](https://thepoolnest.com/10-common-pitfalls-in-implementing-pool-management-software/)
- [Skimmer Reviews — Capterra](https://www.capterra.com/p/177014/Skimmer/) (pricing complaints, billing gaps, per-pool model criticism)
- [State of Pool Service 2025 — Skimmer](https://www.getskimmer.com/stateofpoolservice) (industry data)
- [Pool Service Scheduling Challenges — Zuper](https://www.zuper.co/blog/pool-service-scheduling-challenges) (route complexity, real-world constraints)
- [AI Route Optimization: Pros, Limits, and Risks — PTV Logistics](https://blog.ptvlogistics.com/en/route-optimisation-scheduling/leveraging-ai-for-route-optimization-pros-limits-and-risks/) (algorithm limitations)
- [Langelier Saturation Index Inaccuracies — CPO Class](https://cpoclass.com/langelier-saturation-index/) (CYA correction, formula accuracy issues)
- [Best Practices for Offline Mode in Field Service — Microsoft Dynamics 365 Blog, Part 1](https://www.microsoft.com/en-us/dynamics-365/blog/it-professional/2023/11/06/best-practices-for-offline-mode-in-the-field-service-mobile-app-part-1/) (offline sync pitfalls)
- [Best Practices for Offline Mode in Field Service — Microsoft Dynamics 365 Blog, Part 2](https://www.microsoft.com/en-us/dynamics-365/blog/it-professional/2023/11/08/best-practices-for-offline-mode-in-the-field-service-mobile-app-part-2/)
- [Invoicing and ACH Direct Debit — Stripe Documentation](https://docs.stripe.com/invoicing/ach-direct-debit) (async payment handling)
- [Stripe Connect Mistakes — BuildThatMVP](https://www.buildthatmvp.com/getting-started/stripe-connect) (KYC, webhook, compliance errors)
- [Multi-Tenant Data Isolation — AWS Prescriptive Guidance](https://docs.aws.amazon.com/prescriptive-guidance/latest/saas-multitenant-api-access-authorization/introduction.html)
- [Industrial UX: Sunlight Susceptible Screens — Medium / Callum](https://medium.com/@callumjcoe/industrial-ux-sunlight-susceptible-screens-2e52b1d9706b) (field UX constraints)
- [Comparing QuickBooks Integrations in Field Service — Lexul](https://www.lexul.com/comparing-10-quickbooks-integrations-in-field-service-software/) (double-entry, sync direction issues)
- [SaaS Scope Mistakes — VeryCreatives](https://verycreatives.com/blog/scoping-saas-mistakes) (scope creep, MVP discipline)
- [Pool Chemical Calculator 101 — Clear Swim Pools](https://clearswimpools.net/the-pool-chemical-calculator-101/) (formula accuracy, sanitizer type differences)

---
*Pitfalls research for: Pool Service Management SaaS ("Skimmer Killer")*
*Researched: 2026-03-03*
