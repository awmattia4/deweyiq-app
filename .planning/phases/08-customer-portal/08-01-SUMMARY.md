---
phase: 08-customer-portal
plan: "01"
subsystem: portal-foundation
tags:
  - auth
  - magic-link
  - subdomain-routing
  - branding
  - schema
  - portal
dependency_graph:
  requires:
    - 07-billing-payments (org_settings, orgs tables)
    - 01-foundation (auth, profiles, supabase setup)
    - 02-customer-pool-data-model (customers table)
  provides:
    - portal_messages table with RLS
    - service_requests table with RLS
    - brand_color/favicon_path/portal_welcome_message on org_settings
    - sendMagicLink / getCustomerOrgs / switchOrg actions
    - resolveCustomerId / getOrgBranding / getOrgBySlug helpers
    - portal-callback OTP route
    - PortalShell with real branding
    - CompanyPicker multi-org component
    - extractPortalSubdomain + x-portal-slug header injection
    - Portal Branding settings UI with favicon upload
  affects:
    - portal auth flow (replaces password login)
    - subdomain routing (proxy.ts)
    - settings page Company tab (new Portal Branding section)
    - 08-02 through 08-06 portal plans (depend on these foundations)
tech_stack:
  added:
    - portal-messages schema table
    - service-requests schema table
    - portal-auth.ts server actions
    - portal-data.ts server actions
    - portal-callback API route
  patterns:
    - shouldCreateUser:false on signInWithOtp prevents rogue account creation
    - adminDb for all portal-data queries (no user session on login page)
    - x-portal-slug header injected by middleware for subdomain org resolution
    - hardcoded window.location.href for org switch navigation (not router.push) — JWT claims require full reload
key_files:
  created:
    - src/lib/db/schema/portal-messages.ts
    - src/lib/db/schema/service-requests.ts
    - src/lib/db/migrations/0008_milky_golden_guardian.sql
    - src/actions/portal-auth.ts
    - src/actions/portal-data.ts
    - src/app/auth/portal-callback/route.ts
    - src/app/portal/login/portal-login-form.tsx
    - src/components/portal/company-picker.tsx
  modified:
    - src/lib/db/schema/org-settings.ts (brand_color, favicon_path, portal_welcome_message)
    - src/lib/db/schema/index.ts (Phase 8 exports)
    - src/lib/db/schema/relations.ts (Phase 8 relations)
    - src/app/portal/login/page.tsx (server wrapper for branding)
    - src/app/portal/(portal)/layout.tsx (branding + customerId + multi-org picker)
    - src/app/portal/(portal)/page.tsx (real content, no more placeholders)
    - src/components/shell/portal-shell.tsx (full rewrite with branding)
    - src/lib/supabase/proxy.ts (extractPortalSubdomain + x-portal-slug)
    - src/components/settings/company-profile-settings.tsx (Portal Branding section)
    - src/actions/company-settings.ts (Phase 8 fields + createFaviconUploadUrl)
    - src/components/settings/settings-tabs.tsx (orgSlug prop + new CompanyProfileSettings props)
    - src/app/(app)/settings/page.tsx (fetch orgSlug, pass to SettingsTabs)
decisions:
  - "shouldCreateUser:false on signInWithOtp — only customers with existing Supabase accounts receive magic links; prevents rogue account creation via portal login form"
  - "Always return success from sendMagicLink regardless of email existence — prevents email enumeration attacks"
  - "adminDb for portal-data.ts helpers — portal login page must load branding before user is authenticated; withRls not viable here"
  - "window.location.href for org switch navigation — JWT org_id change requires full page reload; router.push would not re-run server components with new claims"
  - "x-portal-slug injected as request header by middleware — portal layout and login page read it via headers() without needing query params or cookies"
  - "NULL RLS policy pitfall confirmed again for portal_messages and service_requests — all 5 policies manually fixed via ALTER POLICY after drizzle-kit push"
  - "portal-callback at /auth/portal-callback (not /(auth)/auth/callback) — separate route from staff auth callback, avoids mixing flows"
metrics:
  duration: 35
  completed_date: "2026-03-13"
  tasks_completed: 2
  files_changed: 20
---

# Phase 8 Plan 01: Portal Foundation Summary

Magic link auth, subdomain routing, company branding, portal_messages + service_requests schema, and all portal helper actions — replacing Phase 1 placeholder portal with a fully functional, branded foundation.

## What Was Built

### Task 1: Schema

- **`portal_messages`** table: chat messages between customers and office, with optional `service_request_id` FK for per-request threads, `sender_role`, `body`, `photo_path`, and read receipt timestamps. Two RLS policies: office (all CRUD) and customer (SELECT/INSERT via email lookup).
- **`service_requests`** table: customer-submitted service requests with category, description, urgency, photo_paths (JSONB), preferred scheduling, and status progression. Three policies: office (all), customer SELECT, customer INSERT.
- **`brand_color`**, **`favicon_path`**, **`portal_welcome_message`** columns added to `org_settings`.
- Migration 0008 generated and pushed. All 5 RLS policies manually fixed via `ALTER POLICY` (known drizzle-kit push pitfall from MEMORY.md).

### Task 2: Auth + Shell + Branding

- **`sendMagicLink(email)`**: Uses `signInWithOtp` with `shouldCreateUser: false`. Always returns success to prevent email enumeration.
- **`/auth/portal-callback`** route: Verifies `token_hash` + `type` OTP params, redirects to `/portal` on success or `/portal/login?error=invalid_link` on failure.
- **Portal login page**: Replaced password form with email-only magic link flow. Server wrapper resolves branding from `x-portal-slug` header. Client form shows confirmation state after submission.
- **`PortalShell`**: Full rewrite — real company logo/name from `org_settings`, `--portal-primary` CSS var for brand color accent, working `<Link>` nav (history, invoices, messages, requests), mobile bottom tab bar, user dropdown with sign out + switch company.
- **`CompanyPicker`**: Shown to multi-org customers. Calls `switchOrg()` → `supabase.auth.refreshSession()` → `window.location.href = '/portal'` (hard nav).
- **Portal home**: Replaced "Coming in Phase 8" placeholders with real quick-link cards and welcome message from `org_settings.portal_welcome_message`.
- **Subdomain routing**: `extractPortalSubdomain()` in `proxy.ts` parses `{slug}.poolco.app` (skips reserved subdomains), injects `x-portal-slug` header.
- **Settings Portal Branding section**: Brand color picker (hex input + color swatch + color input), favicon upload (PNG/ICO to company-assets bucket), welcome message textarea, subdomain preview.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] drizzle-kit push NULL RLS policies**
- **Found during:** Task 1
- **Issue:** `drizzle-kit push` created all 5 RLS policies with NULL USING/WITH CHECK expressions (known pitfall from MEMORY.md)
- **Fix:** Manually ran ALTER POLICY for each of the 5 policies via Node.js postgres client
- **Tables affected:** portal_messages (2 policies), service_requests (3 policies)
- **Commit:** 8674a20

### Minor Deviations

**Added `getOrgBySlug()` to portal-data.ts** — Plan specified `resolveCustomerId` and `getOrgBranding` only. Added `getOrgBySlug` to support the login page loading branding from the subdomain slug before auth. Low-risk addition required for the planned login page branding behavior.

**portal-login-form.tsx extracted as separate client component** — Plan described the login page as a server component with client form. Implemented as server page (`page.tsx`) wrapping a client form component (`portal-login-form.tsx`) to properly separate server-side branding resolution from client-side form state. Standard Next.js pattern.

## Self-Check: PASSED

**Files verified present:**
- src/lib/db/schema/portal-messages.ts — FOUND
- src/lib/db/schema/service-requests.ts — FOUND
- src/lib/db/migrations/0008_milky_golden_guardian.sql — FOUND
- src/actions/portal-auth.ts — FOUND
- src/actions/portal-data.ts — FOUND
- src/app/auth/portal-callback/route.ts — FOUND
- src/components/portal/company-picker.tsx — FOUND

**Commits verified:**
- 8674a20 — schema task (portal_messages, service_requests, org_settings columns, migration)
- 4dd49b3 — auth + shell task (magic link, portal-callback, PortalShell, CompanyPicker, proxy, settings)
