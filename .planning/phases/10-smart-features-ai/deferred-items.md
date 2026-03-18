# Deferred Items — Phase 10 Smart Features AI

## Pre-existing Build Errors (Out of Scope)

### TS Error: company-settings.ts logo_url field missing from orgs schema
- **File:** `src/actions/company-settings.ts:333:16`
- **Error:** `logo_url` does not exist in the orgs table type — org schema update is missing the `logo_url` column
- **Discovered during:** Plan 10-05 build verification
- **Action needed:** Add `logo_url` column to `orgs` schema or remove/replace the field in the action
- **Scope:** Pre-existing issue in repo before Phase 10 work began — not caused by 10-05 changes
