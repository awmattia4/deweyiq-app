# Deferred Items — Phase 11 Payroll, Team Management & Full Accounting

## Pre-existing Build Errors (Out of Scope)

### TS Errors: company-settings.ts — Missing schema columns

- **File:** `src/actions/company-settings.ts`
- **Errors:**
  - `logo_url` does not exist in `orgs` table (lines 339, 369, 395)
  - `requires_photo` does not exist in `checklist_tasks` table (lines 503, 781, 1052, 1075)
  - `is_default` does not exist in `checklist_templates` table (lines 727, 737, 745, 755, 917, 962, 972, 1036)
  - `suppresses_task_id` does not exist in `checklist_tasks` table (line 1078)
  - Several no-overload-match errors (lines 570, 846, 1161, 1254)
- **Root cause:** `company-settings.ts` references columns not yet added to the schema files — schema migrations are pending
- **Discovered during:** Plan 11-03 build verification
- **Scope:** Pre-existing — none of these are caused by Phase 11 changes
- **Action needed:** Future plan to add missing schema columns and run migrations

### Module Import Warnings

- **Files:** `stop-workflow.tsx`, `wo-labor-section.tsx`, `billing/page.tsx`, `routes/page.tsx`
- **Warnings:** Missing exports (`processPhotoQueue`, `updateWorkOrderLabor`, `getBillingInsights`, `getPredictiveAlertsForPools`)
- **Discovered during:** Plan 11-03 build verification
- **Scope:** Pre-existing — not caused by Phase 11 changes
- **Action needed:** Plans that implement these features should add the missing exports
