---
phase: 12-projects-renovations
plan: 01
subsystem: database
tags: [drizzle, postgres, supabase, rls, schema, projects, renovations]

# Dependency graph
requires:
  - phase: 01-foundation
    provides: orgs, profiles, Supabase auth + RLS infrastructure
  - phase: 02-customer-pool-data-model
    provides: customers, pools tables that projects FK reference
  - phase: 06-work-orders-quoting
    provides: work_orders, invoices tables that project billing extends
  - phase: 11-payroll-team-accounting
    provides: time_entries table that project_time_logs references

provides:
  - projects table with 11-stage lifecycle (lead through warranty_active)
  - project_templates for Good/Better/Best tier defaults with phase seeding
  - project_phases with dependency tracking and labor hour estimates
  - project_phase_tasks for field completion by techs
  - project_surveys with measurement JSONB and route stop integration
  - project_proposals with versioning, tier selection, digital signature
  - project_proposal_tiers (good/better/best) with photos and feature lists
  - project_proposal_line_items with per-tier and shared line items
  - project_proposal_addons for customer-selectable optional upgrades
  - project_payment_milestones linking phases to invoices with retainage
  - proposal_change_requests for pre-approval customer feedback
  - project_materials with full quantity lifecycle tracking
  - project_purchase_orders and PO line items for supplier management
  - project_material_receipts, usage, and returns tables
  - project_change_orders with soft-archive per PROJ-91
  - project_inspections with correction tasks and document storage
  - project_permits with full lifecycle (not_applied through expired)
  - project_punch_list for final completion tracking
  - project_warranty_terms and warranty_claims with WO linkage
  - project_documents for HOA/permit/contract storage
  - subcontractors directory with insurance/license expiry tracking
  - project_phase_subcontractors with lien waiver and payment status
  - project_photos with before/during/after/issue tags and soft-archive
  - project_time_logs with timer/manual entry and time_entry parent link
  - project_issue_flags with severity, CO conversion, alert linkage
  - project_equipment_assignments for site equipment tracking
  - invoices table extended with project_id, invoice_type, milestone_id, retainage columns
  - org_settings extended with project_inactivity_alert_days

affects:
  - 12-02-PLAN (project detail UI)
  - 12-03-PLAN through 12-16-PLAN (all subsequent project plans)
  - phase-07-billing (invoices extended for project billing types)

# Tech tracking
tech-stack:
  added: []
  patterns:
    - Drizzle pgTable with pgPolicy + enableRLS() pattern (consistent with all prior phases)
    - archived_at timestamp soft-delete on all document tables per PROJ-91
    - JSONB for flexible structured data (measurements, existing_conditions, activity_log)
    - Text YYYY-MM-DD dates per date-utils convention (no toISOString())
    - Tiered proposal model: shared + per-tier line items via nullable tier_id FK

key-files:
  created:
    - src/lib/db/schema/projects.ts
    - src/lib/db/schema/project-proposals.ts
    - src/lib/db/schema/project-materials.ts
    - src/lib/db/schema/project-billing.ts
    - src/lib/db/schema/subcontractors.ts
    - src/lib/db/schema/project-field.ts
    - src/lib/db/migrations/0014_phase12_projects_renovations.sql
  modified:
    - src/lib/db/schema/relations.ts
    - src/lib/db/schema/index.ts
    - src/lib/db/schema/invoices.ts
    - src/lib/db/schema/org-settings.ts

key-decisions:
  - "All project document tables (proposals, change orders, inspections, photos) use archived_at soft-archive instead of hard DELETE per PROJ-91 immutability requirement"
  - "project_id and invoice_type added to invoices table (not a new table) to preserve backward compatibility with service billing flows"
  - "project_time_logs references parent time_entry_id for payroll reconciliation without breaking the time_entries shift model"
  - "Subcontractor SELECT RLS restricted to owner+office (financial/insurance info is sensitive) — unlike most other project tables which allow tech SELECT"
  - "project_proposal_line_items uses nullable tier_id FK: null = shared across all tiers, set = specific to one tier"
  - "org_settings gets project_inactivity_alert_days (default 7) for stalled project detection per research recommendation"

patterns-established:
  - "Pattern: All project tables get org_id FK for RLS isolation — consistent with all prior phase tables"
  - "Pattern: Tech INSERT access on field-facing tables (photos, time logs, receipts, usage, flags) — same as work_orders tech insert pattern"
  - "Pattern: All numeric financial columns use numeric(12,2) for currency, numeric(5,2) for percentages, numeric(10,3) for quantities"

requirements-completed:
  - PROJ-01
  - PROJ-39
  - PROJ-34
  - PROJ-91

# Metrics
duration: 8min
completed: 2026-03-17
---

# Phase 12 Plan 01: Projects & Renovations — Database Schema Foundation Summary

**~30 new Drizzle tables covering the full project lifecycle (lead to warranty) pushed to Supabase with RLS org isolation, retainage/milestone billing extension on invoices, and soft-archive on all document tables**

## Performance

- **Duration:** 8 min
- **Started:** 2026-03-17T15:22:54Z
- **Completed:** 2026-03-17T15:31:33Z
- **Tasks:** 2
- **Files modified:** 11

## Accomplishments

- Created 6 new schema files containing ~30 tables spanning project management, proposals, materials, billing, subcontractors, and field tools
- Extended the existing `invoices` table with project billing columns (project_id, invoice_type, project_milestone_id, retainage_held/released) — no new table, preserving service billing backward compatibility
- All tables pushed to local Supabase with enableRLS() and correctly structured pgPolicy() rules — RLS verified non-NULL via schema code review and Supabase API accessibility checks
- Soft-archive pattern (archived_at) applied to all document tables per PROJ-91 immutability requirement
- 150+ Drizzle relations defined across all new tables in relations.ts

## Task Commits

Each task was committed atomically:

1. **Task 1: Create core project schema files (projects, proposals, materials)** - `fdf68a4` (feat)
2. **Task 2: Create billing extension, subcontractor, field schema, relations, and push to DB** - `36a2359` (feat)

## Files Created/Modified

- `src/lib/db/schema/projects.ts` - projects, project_templates, project_phases, project_phase_tasks, project_surveys
- `src/lib/db/schema/project-proposals.ts` - project_proposals, tiers, line_items, addons, payment_milestones, change_requests
- `src/lib/db/schema/project-materials.ts` - project_materials, purchase_orders, PO line items, receipts, usage, returns
- `src/lib/db/schema/project-billing.ts` - change_orders, inspections, permits, punch_list, warranty_terms, warranty_claims, documents
- `src/lib/db/schema/subcontractors.ts` - subcontractors, project_phase_subcontractors
- `src/lib/db/schema/project-field.ts` - project_photos, time_logs, issue_flags, equipment_assignments
- `src/lib/db/schema/invoices.ts` - Added project_id, invoice_type, project_milestone_id, retainage_held, retainage_released
- `src/lib/db/schema/org-settings.ts` - Added project_inactivity_alert_days integer column
- `src/lib/db/schema/relations.ts` - Added ~150 Phase 12 relations across all new tables
- `src/lib/db/schema/index.ts` - Exports all 6 new Phase 12 schema files
- `src/lib/db/migrations/0014_phase12_projects_renovations.sql` - Generated migration

## Decisions Made

- `archived_at` soft-delete on all document tables (proposals, change orders, inspections, photos, warranty claims, documents) per PROJ-91 immutability requirement
- Extended `invoices` table rather than creating a separate project invoices table — preserves service billing compatibility and avoids JOIN complexity
- `project_time_logs.time_entry_id` references the parent shift (`time_entries`) for payroll reconciliation — per RESEARCH.md recommendation
- Subcontractor SELECT restricted to owner/office only (insurance/license/payment data is financially sensitive)
- `project_proposal_line_items.tier_id` is nullable — null means the line item applies across all tiers; a set value scopes it to a specific tier
- `org_settings.project_inactivity_alert_days` (default 7) added for future stalled-project detection

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered

- PostgreSQL NOTICE messages about FK constraint names being truncated to 63 chars (e.g., `project_proposal_line_items_tier_id_project_proposal_tiers_id_f`). These are informational only — Postgres auto-truncates long constraint names, the FKs still work correctly.

## User Setup Required

None - no external service configuration required. All changes are to the local Supabase database schema.

## Next Phase Readiness

- All ~30 project tables exist in Supabase with correct RLS policies
- FK references resolve: projects → customers/pools, proposals → projects, field tables → phases/tasks
- invoices table has project billing columns — plan 07-09 (project billing) can reference them
- Relations defined — drizzle relational query builder (db.query.*) can traverse all project graph edges
- Ready for Plan 02: Project List UI and Plan 03: Project Detail Page

---
*Phase: 12-projects-renovations*
*Completed: 2026-03-17*
