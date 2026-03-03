---
phase: 01-foundation
plan: 03
subsystem: auth
tags: [supabase, auth, oauth, google, jwt, invite, rls, nextjs, shadcn, server-actions]

# Dependency graph
requires:
  - 01-01: Next.js project with Supabase SSR clients, proxy.ts, shadcn/ui, design system
  - 01-02: Drizzle profiles table, adminDb, withRls wrapper, org-creation trigger
provides:
  - Staff login page (/login) — email/password + Google OAuth, role-based redirect on success
  - Owner signup page (/signup) — full name, email, password, company name; triggers org creation
  - Password reset pages (/reset-password) — request email + set-new-password recovery mode
  - Auth callback route (/auth/callback) — handles OAuth, invite, and recovery; role-based redirect
  - Auth form components — LoginForm, SignupForm, ResetPasswordForm, GoogleSignInButton
  - Auth layout — centered card, PoolCo branding, dark-first design system
  - getCurrentUser() server action — typed AuthUser from JWT claims (getClaims not getSession)
  - signOut() server action — supabase.auth.signOut + redirect
  - inviteTeamMember() server action — owner-only, service role key, sets app_metadata, pre-creates profile
  - revokeInvite() server action — owner-only, deletes uninvited user via admin API
  - Customer portal login (/portal/login) — separate login, no OAuth, no signup
  - Portal layout — lighter customer-facing header, placeholder branding
  - proxy.ts update — portal paths redirect to /portal/login; staff paths redirect to /login
affects:
  - 01-04 (shell layout uses getCurrentUser() for nav/role display)
  - all subsequent phases (every protected feature uses getCurrentUser() and the auth patterns established here)
  - 08 (portal phase — uses portal layout, portal login; needs company branding replacement)

# Tech tracking
tech-stack:
  added:
    - shadcn: input, label, separator, alert components
  patterns:
    - "Server actions with 'use server' directive — getCurrentUser, signOut, inviteTeamMember are all server-only"
    - "inviteTeamMember uses SUPABASE_SERVICE_ROLE_KEY (no NEXT_PUBLIC_ prefix) — server-only, never exposed to client"
    - "inviteUserByEmail + immediate updateUserById(app_metadata) — ensures JWT has correct role/org_id from first login"
    - "Dual-mode ResetPasswordForm — request email OR set-new-password based on isRecovery prop from page"
    - "Auth callback handles three flows with single handler: OAuth (code), invite (token), recovery (?type=recovery)"

key-files:
  created:
    - src/app/(auth)/layout.tsx (centered auth card layout, PoolCo branding)
    - src/app/(auth)/login/page.tsx (server page, role-based redirect if already authenticated)
    - src/app/(auth)/signup/page.tsx (server page, redirect to /dashboard if authenticated)
    - src/app/(auth)/reset-password/page.tsx (server page, detects ?type=recovery)
    - src/app/(auth)/auth/callback/route.ts (GET handler, exchangeCodeForSession, role-based redirect)
    - src/components/auth/login-form.tsx (email/password form, error messages, Google OAuth divider)
    - src/components/auth/signup-form.tsx (full name, email, password, company name)
    - src/components/auth/reset-password-form.tsx (dual-mode: request reset or set new password)
    - src/components/auth/google-sign-in-button.tsx (signInWithOAuth provider=google)
    - src/actions/auth.ts (getCurrentUser, signOut server actions)
    - src/actions/invite.ts (inviteTeamMember, revokeInvite server actions)
    - src/app/portal/layout.tsx (customer portal layout, lighter header)
    - src/app/portal/login/page.tsx (portal login — email/password only, no OAuth)
    - src/components/ui/input.tsx (shadcn)
    - src/components/ui/label.tsx (shadcn)
    - src/components/ui/separator.tsx (shadcn)
    - src/components/ui/alert.tsx (shadcn)
  modified:
    - src/lib/supabase/proxy.ts (split redirect logic: portal paths → /portal/login, staff → /login)

key-decisions:
  - "Auth callback handles OAuth, invite, AND recovery in one route — inviteUserByEmail uses one-time token not PKCE (Supabase design); exchangeCodeForSession handles all three transparently"
  - "getCurrentUser() calls getUser() alongside getClaims() to get email and full_name — email not in JWT claims by default in Supabase"
  - "Portal login is a client component (uses useState/useRouter) even though most auth pages are server components — required for form interaction without server round-trips"
  - "inviteTeamMember pre-creates profile row with adminDb to satisfy RLS before the invited user ever logs in"
  - "npm cache was root-owned — used npm_config_cache=/tmp/npm-cache for shadcn component installs (same workaround as Plan 01)"

patterns-established:
  - "Pattern: getCurrentUser() — the canonical way to get the authenticated user in server actions/components throughout all phases"
  - "Pattern: inviteTeamMember flow — invite email → app_metadata set immediately → profile pre-created → invitee clicks → /auth/callback → correct role/org from first login"
  - "Pattern: portal vs staff routing split in proxy — /portal/* unauthenticated goes to /portal/login, everything else goes to /login"

requirements-completed:
  - AUTH-01
  - AUTH-02
  - AUTH-03
  - AUTH-04

# Metrics
duration: 4min
completed: 2026-03-03
---

# Phase 01 Plan 03: Authentication System Summary

**Supabase auth with email/password login, Google OAuth, password recovery, team member invite (service-role + app_metadata), and separate customer portal login — all using getClaims() JWT validation and role-based routing**

## Performance

- **Duration:** 4 min
- **Started:** 2026-03-03T23:04:58Z
- **Completed:** 2026-03-03T23:09:38Z
- **Tasks:** 2/2
- **Files created/modified:** 18

## Accomplishments

- Complete auth flow: signup creates org (via Plan 02 trigger), login persists session, OAuth via Google, password recovery via email link
- Team member invite via `inviteTeamMember()` server action: owner-only, service role key, immediately sets `app_metadata.role` and `app_metadata.org_id`, pre-creates profile row — invitee arrives with correct JWT claims on first login
- Customer portal login at `/portal/login` with distinct styling and messaging; proxy routes unauthenticated portal users to portal login (not staff login)
- `getCurrentUser()` server action established as the canonical auth identity pattern for all subsequent phases

## Task Commits

1. **Task 1: Build sign-up, login, and password reset pages with Google OAuth** - `80af8f4` (feat)
2. **Task 2: Build team invite flow and customer portal login** - `e61f10c` (feat)

**Plan metadata:** (created in final docs commit)

## Files Created/Modified

- `src/app/(auth)/layout.tsx` — Centered auth card layout; PoolCo logo mark (SVG wave icon); dark-first design
- `src/app/(auth)/login/page.tsx` — Server page; redirects by role (tech→/routes, customer→/portal, others→/dashboard) if already authed
- `src/app/(auth)/signup/page.tsx` — Server page; redirects to /dashboard if already authenticated
- `src/app/(auth)/reset-password/page.tsx` — Server page; reads ?type=recovery from searchParams; verifies auth for recovery mode
- `src/app/(auth)/auth/callback/route.ts` — GET handler; exchangeCodeForSession; recovery→/reset-password?type=recovery; role-based redirect otherwise
- `src/components/auth/login-form.tsx` — Email/password form; friendly error messages; "or continue with" divider + GoogleSignInButton; forgot password link
- `src/components/auth/signup-form.tsx` — Full name, email, password, company name; signUp with user_metadata; success state shows confirmation message
- `src/components/auth/reset-password-form.tsx` — Dual-mode: isRecovery=false → request email; isRecovery=true → set new password with confirm field
- `src/components/auth/google-sign-in-button.tsx` — signInWithOAuth provider=google; redirectTo={origin}/auth/callback
- `src/actions/auth.ts` — getCurrentUser() (getClaims + getUser for email/full_name); signOut(redirectTo)
- `src/actions/invite.ts` — inviteTeamMember() + revokeInvite(); SUPABASE_SERVICE_ROLE_KEY; admin.inviteUserByEmail(); updateUserById app_metadata; adminDb profile insert
- `src/app/portal/layout.tsx` — Portal layout; lighter header with company logo placeholder; no auth guard
- `src/app/portal/login/page.tsx` — Client component; email/password only; no OAuth; "Contact your pool service company" messaging
- `src/lib/supabase/proxy.ts` — Updated: isPortalPath check; /portal/* unauthenticated → /portal/login; staff unauthenticated → /login
- `src/components/ui/{input,label,separator,alert}.tsx` — shadcn components added

## Decisions Made

- **Auth callback single handler**: One `/auth/callback` route handles OAuth, invite tokens, and recovery links. `inviteUserByEmail` uses one-time tokens (not PKCE) — `exchangeCodeForSession` handles this transparently. Recovery detected by `?type=recovery` param.
- **getCurrentUser() calls getUser()**: Email and full_name are not in JWT claims by default in Supabase — need a `getUser()` call alongside `getClaims()` for email. This is intentional: JWT payload size is kept small, user details fetched on demand.
- **Portal login is client component**: The portal login page uses `useState`/`useRouter` for form state — a client component. Most auth pages are server components but portal login needs interactive form without server round-trips to keep it fast.
- **Pre-create profile in inviteTeamMember**: Profile row created immediately (with placeholder full_name = email prefix) so RLS policies can resolve the invited user's org membership from their first login. Without this, the invited user would have a valid JWT but no profile row for RLS to allow reading.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] npm cache root-ownership — used custom cache path**
- **Found during:** Task 1 (installing shadcn components)
- **Issue:** `/Users/aaronmattia/.npm` is root-owned from a prior npm bug; `npx shadcn@latest add` fails with EACCES
- **Fix:** Used `npm_config_cache=/tmp/npm-cache npx shadcn@latest add input label separator alert`
- **Files modified:** `src/components/ui/{input,label,separator,alert}.tsx` (created successfully)
- **Verification:** Components installed and imported without errors; `npx tsc --noEmit` passes
- **Committed in:** `80af8f4` (Task 1 commit)

---

**Total deviations:** 1 auto-fixed (blocking — npm cache)
**Impact on plan:** Zero scope impact. Same workaround as Plan 01. Components installed correctly.

## Issues Encountered

None beyond the npm cache issue (documented as deviation above).

## User Setup Required

To enable Google OAuth in Supabase:
1. Supabase Dashboard > Authentication > Providers > Google > Enable
2. Add Google OAuth Client ID and Secret from Google Cloud Console
3. Add `{SUPABASE_URL}/auth/v1/callback` as authorized redirect URI in Google Cloud Console

To enable team member invites:
1. Add `SUPABASE_SERVICE_ROLE_KEY` to `.env.local` (from Supabase Dashboard > Settings > API)
2. Add `NEXT_PUBLIC_APP_URL=https://your-domain.com` to `.env.local` (used as invite redirect base)

To test the full auth flow:
- Signup → check email for confirmation → confirm → redirected to /dashboard
- Invite → owner calls inviteTeamMember() → invitee receives email → clicks link → /auth/callback → role landing page

## Next Phase Readiness

- **Ready:** Plan 01-04 (app shell) — getCurrentUser() available for nav; all auth layouts done
- **Ready:** All subsequent phases — getCurrentUser() is the canonical auth identity pattern; inviteTeamMember() is the canonical invite pattern
- **Note:** Google OAuth requires provider setup in Supabase Dashboard before it will work end-to-end
- **Note:** Invite flow requires SUPABASE_SERVICE_ROLE_KEY in .env.local

---
*Phase: 01-foundation*
*Completed: 2026-03-03*

## Self-Check: PASSED

All 13 key source files verified present. SUMMARY.md created. Both task commits (80af8f4, e61f10c) confirmed in git history.
