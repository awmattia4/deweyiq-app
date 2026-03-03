# Pool Company Management SaaS

## What This Is

A full-service pool company management platform that replaces Skimmer and the patchwork of tools pool companies use today (routing apps, QuickBooks, spreadsheets). It serves every stakeholder — field techs, office staff, company owners, and homeowners — through a modern, fast, intelligent platform.

## Core Value

A pool tech can run their entire day from one app with minimal friction — open, see route, service pools, log everything, done — while the office and customers stay in the loop automatically.

## Requirements

### Validated

<!-- Shipped and confirmed valuable. -->

(None yet — ship to validate)

### Active

<!-- Current scope. Building toward these. -->

- [ ] Field service workflow — techs see daily route, navigate to stops, log service with minimal taps
- [ ] Water chemistry logging — manual entry of chlorine, pH, alkalinity, CYA, TDS, calcium hardness
- [ ] Smart chemical dosing — app calculates exact chemicals/quantities based on readings, pool size, weather, history
- [ ] Device integration — connect to smart testers (LaMotte Spin, etc.) for auto-populated readings
- [ ] Photo/note capture — techs document pool condition per visit
- [ ] Route optimization — AI-driven efficient routing based on location, frequency, tech availability
- [ ] Auto-scheduling — automatically assign and balance workloads across techs
- [ ] Predictive alerts — flag pools trending toward problems before they happen
- [ ] Scheduling & dispatch — office builds routes, assigns techs, manages the work calendar
- [ ] Customer management — track pools, equipment, service history per customer
- [ ] Full accounting — invoicing, integrated payments (Stripe/ACH/card), expense tracking, reporting
- [ ] Customer portal — homeowners view service reports, pay invoices, request one-off services, message the company, manage account
- [ ] Owner dashboard — revenue tracking, team performance, business growth metrics
- [ ] Multi-role access — techs, office, owner, and customer roles with appropriate permissions

### Out of Scope

<!-- Explicit boundaries. Includes reasoning to prevent re-adding. -->

- Mobile native apps (v1) — web-first approach, native iOS/Android deferred to v2+
- Real-time chat between techs — not core to service workflow
- Equipment marketplace — out of domain for v1
- Multi-company/franchise management — single company focus first

## Context

- Building for the pool service industry — seasonal in many markets, year-round in Sun Belt
- Skimmer is the dominant competitor — widely used but criticized for clunky UX, too many clicks, dated feel
- Pool companies typically juggle 3-4 tools: Skimmer (service), routing app, QuickBooks (billing), maybe a CRM
- The "all-in-one that actually works" positioning is the core differentiator
- Water chemistry is the heart of pool service — getting this right is table stakes
- Field techs work from phones in bright sunlight, often with wet hands — UX must account for this
- Quality over speed — no hard deadline, build it right

## Constraints

- **Pricing model**: TBD — will be determined based on market research (per-user, tiered, or per-pool)
- **Tech stack**: Open — whatever gets to market fastest with the best experience (Claude decides)
- **Target market**: US pool service companies (English-only for v1)

## Key Decisions

| Decision | Rationale | Outcome |
|----------|-----------|---------|
| All-in-one platform vs. best-of-breed | Replace the 3-4 tool patchwork pool companies use today | — Pending |
| Web-first (PWA) vs. native mobile | Faster to market, single codebase, still installable on phones | — Pending |
| AI-powered features in v1 | Differentiate from Skimmer immediately, not as a future promise | — Pending |
| Full accounting built-in | Replace QuickBooks dependency, not just invoice generation | — Pending |

---
*Last updated: 2026-03-03 after initialization*
