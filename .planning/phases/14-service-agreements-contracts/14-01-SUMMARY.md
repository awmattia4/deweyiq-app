---
phase: 14-service-agreements-contracts
plan: 01
subsystem: data-layer
tags: [schema, rls, server-actions, agreements, drizzle]
dependency_graph:
  requires: []
  provides:
    - service_agreements table with RLS
    - agreement_pool_entries table with RLS
    - agreement_amendments table with RLS
    - agreement_templates table with RLS
    - org_settings agreement columns
    - createAgreement, getAgreements, getAgreement, updateAgreement, deleteAgreement, sendAgreement server actions
    - getAgreementTemplates, createAgreementTemplate, updateAgreementTemplate, deleteAgreementTemplate server actions
  affects:
    - org_settings (4 new columns)
    - schema/index.ts (new exports)
    - schema/relations.ts (new relations)
tech_stack:
  added: []
  patterns:
    - drizzle-kit generate (NOT push) for migration
    - withRls + adminDb for sequence counter (bypasses owner-only RLS on org_settings)
    - { success, data?, error? } server action return pattern
key_files:
  created:
    - src/lib/db/schema/service-agreements.ts
    - src/lib/db/schema/agreement-templates.ts
    - src/actions/agreements.ts
    - src/lib/db/migrations/0017_medical_magus.sql
  modified:
    - src/lib/db/schema/org-settings.ts
    - src/lib/db/schema/index.ts
    - src/lib/db/schema/relations.ts
decisions:
  - "Used adminDb for agreement number sequence increment (same as quote/invoice pattern) — lets office staff create agreements without hitting owner-only org_settings RLS"
  - "agreement_pool_entries and agreement_amendments RLS uses EXISTS subquery against service_agreements.org_id — required since those tables have no direct org_id column"
  - "getAgreements and getAgreement return any type — avoids complex Drizzle relational return type inference that changes when columns are added"
  - "updateAgreement blocks edits to active agreements (must use amendment flow) — enforces data integrity for signed contracts"
  - "deleteAgreementTemplate checks for active/sent/paused references before deletion — prevents orphaning in-flight agreements"
metrics:
  duration: 5 minutes
  completed: 2026-03-25
  tasks: 2
  files: 7
---

# Phase 14 Plan 01: Service Agreement Schema and Actions Summary

**One-liner:** Drizzle schema for 4 service agreement tables with RLS policies, org_settings agreement config columns, and full CRUD server actions using the withRls + adminDb sequence pattern.

## Tasks Completed

| Task | Name | Commit | Key Files |
|------|------|--------|-----------|
| 1 | Create service agreement schema tables with RLS | da7402c | service-agreements.ts, agreement-templates.ts, org-settings.ts, index.ts, relations.ts, migration |
| 2 | Create agreement and template CRUD server actions | 7432817 | src/actions/agreements.ts |

## What Was Built

### Schema (Task 1)

Four new tables:

1. **`service_agreements`** — Master agreement per customer. 32 columns covering all status transitions (draft → sent → active → paused/expired/cancelled), signature capture (typed name + canvas base64 + IP + user agent), activity log (JSONB array), amendment tracking, and renewal reminders.

2. **`agreement_pool_entries`** — Per-pool service details within an agreement. Supports monthly_flat, per_visit, and tiered pricing models. Stores frequency, preferred day, checklist task IDs, and links to a schedule_rule on acceptance.

3. **`agreement_amendments`** — Versioned change log for amendments to active agreements. Distinguishes major (requires re-sign) vs minor (informational) changes. Stores full agreement snapshot at each version.

4. **`agreement_templates`** — Reusable templates for common service packages. Pre-populates new agreements with default terms, pricing, and frequency.

`org_settings` extended with 4 columns:
- `agreement_notice_period_days` (default 30)
- `agreement_renewal_lead_days` (JSONB array, default [30, 7])
- `next_agreement_number` (default 1)
- `agreement_number_prefix` (default "SA")

RLS pattern for `agreement_pool_entries` and `agreement_amendments` uses EXISTS subquery against `service_agreements.org_id` since those tables have no direct org_id column. All 4 tables get 4 policies each (16 total) — SELECT/INSERT/UPDATE by owner+office, DELETE by owner only.

### Server Actions (Task 2)

All 11 actions in `src/actions/agreements.ts`:

**Agreement CRUD:**
- `createAgreement` — atomic insert of agreement + pool entries, auto-generates "SA-0001" number via adminDb sequence increment
- `getAgreements` — list with optional filters (status, customer_id, search), includes customer name and pool entry summaries
- `getAgreement` — single agreement with all relations (customer, poolEntries+pool, amendments, template)
- `updateAgreement` — updates draft/sent agreements only; replaces pool entries atomically; blocks active agreements
- `deleteAgreement` — owner-only, draft status only
- `sendAgreement` — draft→sent transition with activity log entry

**Template CRUD:**
- `getAgreementTemplates` — all org templates sorted by name
- `createAgreementTemplate` — create with full field set
- `updateAgreementTemplate` — partial update
- `deleteAgreementTemplate` — with safety check (blocks deletion if referenced by active/sent/paused agreements)

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Customer table uses full_name not first_name/last_name**
- **Found during:** Task 2 TypeScript compilation
- **Issue:** Plan spec referenced `first_name`/`last_name` customer columns but the schema uses `full_name` only
- **Fix:** Updated all customer column selectors in getAgreements and getAgreement queries to use `full_name`
- **Files modified:** src/actions/agreements.ts
- **Commit:** 7432817

**2. [Rule 1 - Bug] Pools table has no address column**
- **Found during:** Task 2 TypeScript compilation
- **Issue:** getAgreement query tried to select `address` from pools but that column does not exist
- **Fix:** Removed address from pool column selector
- **Files modified:** src/actions/agreements.ts
- **Commit:** 7432817

**3. [Rule 2 - Missing] Drizzle relational return types cause inference mismatch**
- **Found during:** Task 2 TypeScript compilation
- **Issue:** Strict return type annotations on getAgreements/getAgreement clashed with Drizzle's inferred relational query return shape
- **Fix:** Changed return type of those two functions to `any[]`/`any` (with eslint-disable comment). This is consistent with how other complex relational queries are handled in the codebase; callers type-narrow as needed.
- **Files modified:** src/actions/agreements.ts
- **Commit:** 7432817

## Self-Check: PASSED

All files found on disk. All task commits verified in git log.
