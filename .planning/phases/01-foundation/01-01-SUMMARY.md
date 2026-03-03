---
phase: 01-foundation
plan: 01
subsystem: infra
tags: [nextjs, tailwind, shadcn, serwist, pwa, supabase, drizzle, dexie, typescript]

# Dependency graph
requires: []
provides:
  - Next.js 16 project with App Router, TypeScript, Tailwind v4
  - All Phase 1 dependencies installed (supabase, drizzle, dexie, serwist)
  - Tailwind v4 design system (deep navy/sky-blue/cyan palette, Linear/Vercel aesthetic)
  - shadcn/ui initialized with Button, Card, Skeleton, Badge components
  - Serwist PWA: manifest.ts, sw.ts, sw.js compiled to public/
  - Next.js 16 proxy.ts at project root (replaces middleware.ts)
  - Supabase client utilities: browser, server, proxy (getClaims-based auth)
  - Drizzle db client with RLS wrapper (prepare:false for Supabase pooler)
  - Dexie offline schema: syncQueue + routeCache
  - useOnlineStatus hook for offline detection
  - Directory stubs: src/hooks/, src/components/shell/, src/lib/offline/
affects:
  - all subsequent plans and phases (every other plan depends on this foundation)
  - 01-02 (database schema uses drizzle config and db index)
  - 01-03 (auth pages use Supabase clients and proxy)
  - 01-04 (shell uses shadcn components, hooks, and offline db)

# Tech tracking
tech-stack:
  added:
    - next@16.1.6 (App Router, Turbopack dev, webpack build)
    - react@19.2.3
    - @supabase/supabase-js@2.98.0
    - "@supabase/ssr@0.9.0"
    - drizzle-orm@0.45.1
    - drizzle-kit@0.31.9
    - postgres@3.4.8
    - dexie@4.3.0
    - "@serwist/next@9.5.6"
    - serwist@9.5.6
    - tailwindcss@4.x (CSS-first @theme directive)
    - shadcn@3.8.5 (New York style, Tailwind v4 compat)
    - tw-animate-css (replaces tailwindcss-animate for v4)
    - class-variance-authority, clsx, tailwind-merge, lucide-react, radix-ui
  patterns:
    - Tailwind v4 CSS-first: all theme in globals.css @theme block (no tailwind.config.js)
    - Dark-first: HTML has class="dark", brand palette is the dark theme
    - Next.js 16 proxy.ts: replaces middleware.ts, exports proxy function not middleware
    - getClaims() over getSession(): local JWT signature validation, not cookie trust
    - Drizzle RLS wrapper: every user-facing query sets JWT claims via set_config before executing
    - prepare:false: required for Supabase transaction-mode pooler (Supavisor)
    - Serwist class API: new Serwist() + addEventListeners() (not legacy installSerwist)

key-files:
  created:
    - package.json (all dependencies)
    - next.config.ts (Serwist integration)
    - drizzle.config.ts (Drizzle Kit config)
    - .env.local.example (env var template)
    - proxy.ts (Next.js 16 route proxy, project root)
    - components.json (shadcn config)
    - src/app/globals.css (Tailwind v4 design system)
    - src/app/layout.tsx (root layout, Geist font, PWA metadata)
    - src/app/page.tsx (redirect to /login)
    - src/app/manifest.ts (PWA manifest)
    - src/app/sw.ts (Serwist service worker source)
    - src/lib/supabase/client.ts (browser client)
    - src/lib/supabase/server.ts (server client)
    - src/lib/supabase/proxy.ts (updateSession for proxy)
    - src/lib/db/index.ts (Drizzle with RLS wrapper)
    - src/lib/db/schema/index.ts (barrel export stub)
    - src/lib/offline/db.ts (Dexie schema)
    - src/hooks/use-online-status.ts (online/offline detection)
    - src/components/ui/button.tsx
    - src/components/ui/card.tsx
    - src/components/ui/skeleton.tsx
    - src/components/ui/badge.tsx
    - public/icons/icon-192.png
    - public/icons/icon-512.png
    - public/icons/icon-512-maskable.png
  modified:
    - src/app/globals.css (replaced scaffold with brand design system)
    - src/app/layout.tsx (replaced scaffold with PWA layout)
    - src/app/page.tsx (replaced scaffold with /login redirect)
    - .gitignore (added !.env.local.example exception)

key-decisions:
  - "Serwist uses new class-based API (new Serwist()) not legacy installSerwist() - the latter was in legacy/ subpath only"
  - "getClaims() returns { claims, header, signature } not { user } - proxy checks claimsData !== null for auth"
  - "Dark-first design: html class=dark set in layout, brand deep-navy/sky-blue palette defined in .dark block"
  - "placeholder PNG icons created programmatically via Node.js raw PNG generation - will be replaced with real brand icons"

patterns-established:
  - "Pattern: Tailwind v4 CSS-first - all theme variables in globals.css @theme block"
  - "Pattern: RLS-aware Drizzle - createDrizzleClient() wraps queries in set_config transaction"
  - "Pattern: proxy.ts at project root exports async function proxy (Next.js 16 breaking change from middleware.ts)"
  - "Pattern: getClaims() for server-side JWT validation (not getSession() which trusts cookie blindly)"

requirements-completed: []

# Metrics
duration: 10min
completed: 2026-03-03
---

# Phase 01 Plan 01: Project Scaffold & Foundation Summary

**Next.js 16 project scaffolded with Tailwind v4 deep-navy/sky-blue design system, Serwist PWA (sw.js compiled), shadcn/ui, Supabase SSR clients with getClaims() auth, and Drizzle ORM with RLS-wrapper ready for multi-tenant schema**

## Performance

- **Duration:** 10 min
- **Started:** 2026-03-03T22:42:10Z
- **Completed:** 2026-03-03T22:52:10Z
- **Tasks:** 2/2
- **Files created/modified:** 39

## Accomplishments

- Next.js 16 project running with all Phase 1 dependencies (Supabase, Drizzle, Dexie, Serwist, shadcn/ui)
- Tailwind v4 design system with deep navy background, sky-500 primary, cyan-400 accent — Linear/Vercel aesthetic applied dark-first
- Serwist PWA fully configured: manifest.ts generates webmanifest, sw.ts compiles to public/sw.js on `npm run build`
- All Supabase client utilities created with correct security patterns (getClaims not getSession)
- Drizzle db client with RLS-aware transaction wrapper established from day one
- Dexie offline schema with syncQueue and routeCache ready for Plan 04

## Task Commits

1. **Task 1: Create Next.js 16 project with all dependencies** - `f9b1489` (feat)
2. **Task 2: Configure Tailwind v4 design system, shadcn/ui, Supabase clients, and app shell files** - `1f38244` (feat)

**Plan metadata:** (created below in final docs commit)

## Files Created/Modified

- `package.json` - All Phase 1 dependencies; scripts: dev (Turbopack), build (webpack for Serwist)
- `next.config.ts` - Serwist integration; swSrc=src/app/sw.ts, swDest=public/sw.js
- `drizzle.config.ts` - Drizzle Kit config pointing to src/lib/db/schema/index.ts
- `.env.local.example` - All required env vars template (no actual secrets)
- `proxy.ts` - Next.js 16 proxy (replaces middleware.ts); exports async function proxy
- `src/app/globals.css` - Tailwind v4 @theme design system with brand colors in oklch
- `src/app/layout.tsx` - Root layout with Geist font, PWA metadata, dark theme default
- `src/app/page.tsx` - Redirect to /login (replaced Next.js scaffold)
- `src/app/manifest.ts` - PWA manifest (PoolCo placeholder; display:standalone; brand colors)
- `src/app/sw.ts` - Serwist service worker using Serwist class API + addEventListeners()
- `src/lib/supabase/client.ts` - Browser client via createBrowserClient
- `src/lib/supabase/server.ts` - Server client via createServerClient + cookies()
- `src/lib/supabase/proxy.ts` - updateSession() helper using getClaims() for JWT validation
- `src/lib/db/index.ts` - Drizzle instance + createDrizzleClient() RLS wrapper (prepare:false)
- `src/lib/db/schema/index.ts` - Empty barrel export (schemas added in Plan 02)
- `src/lib/offline/db.ts` - Dexie schema: syncQueue (++id, createdAt, retries) + routeCache (id, cachedAt)
- `src/hooks/use-online-status.ts` - navigator.onLine hook with online/offline event listeners
- `src/components/ui/{button,card,skeleton,badge}.tsx` - shadcn/ui base components
- `public/icons/icon-{192,512,512-maskable}.png` - Placeholder PNG icons for PWA manifest

## Decisions Made

- **Serwist class API**: Research docs referenced `installSerwist()` from `serwist` main package, but that export was removed and moved to `serwist/legacy`. The correct modern API is `new Serwist({ ... }).addEventListeners()`. Updated sw.ts to match.
- **getClaims() return type**: Research showed `getClaims()` returning `{ data: { user } }` but the actual @supabase/auth-js@2.x API returns `{ data: { claims, header, signature } }`. The proxy now checks `claimsData !== null` for authentication status.
- **Dark-first HTML class**: Set `className="dark"` directly on `<html>` in layout.tsx — the brand design IS the dark theme. No light/dark toggle at this stage.
- **Placeholder icons**: Created programmatic solid-color PNG icons (#0d1117 background) via Node.js raw PNG generation. Will be replaced with actual brand icons.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Corrected Serwist API from installSerwist to Serwist class**
- **Found during:** Task 2 (service worker setup), TypeScript compilation
- **Issue:** Research-documented `installSerwist()` function is in `serwist/legacy` subpath, not the main `serwist` package. Import from `"serwist"` fails with "has no exported member 'installSerwist'"
- **Fix:** Updated sw.ts to use `new Serwist({ ... }).addEventListeners()` — the correct current API
- **Files modified:** `src/app/sw.ts`
- **Verification:** `npx tsc --noEmit` passes with zero errors; `npm run build` succeeds
- **Committed in:** `1f38244` (Task 2 commit)

**2. [Rule 1 - Bug] Corrected getClaims() return type usage in proxy**
- **Found during:** Task 2 (Supabase proxy setup), TypeScript compilation
- **Issue:** Research pattern used `const { data: { user } } = await supabase.auth.getClaims()` but actual type returns `{ claims: JwtPayload, header: JwtHeader, signature: Uint8Array }` — `user` property does not exist
- **Fix:** Updated proxy.ts to check `claimsData !== null` for authentication; `getClaims()` returns null data when JWT is invalid/expired
- **Files modified:** `src/lib/supabase/proxy.ts`
- **Verification:** `npx tsc --noEmit` passes with zero errors
- **Committed in:** `1f38244` (Task 2 commit)

**3. [Rule 3 - Blocking] Fixed npm naming error during scaffold**
- **Found during:** Task 1 (project scaffold)
- **Issue:** `create-next-app . ` failed because "Pool Company management" contains capital letters and spaces — npm naming restriction
- **Fix:** Scaffolded into `/tmp/poolco` then rsync'd files to project root (excluding .git to preserve .planning)
- **Files modified:** All scaffold files
- **Verification:** Project root now has full scaffold; .planning/ preserved intact
- **Committed in:** `f9b1489` (Task 1 commit)

**4. [Rule 2 - Missing Critical] Added ServiceWorkerGlobalScope type reference to sw.ts**
- **Found during:** Task 2 (TypeScript compilation)
- **Issue:** tsconfig.json only has `"lib": ["dom", ...]` — ServiceWorkerGlobalScope type not available without explicit webworker lib reference
- **Fix:** Added `/// <reference lib="webworker" />` directive at top of sw.ts
- **Files modified:** `src/app/sw.ts`
- **Verification:** `npx tsc --noEmit` passes with zero errors
- **Committed in:** `1f38244` (Task 2 commit)

---

**Total deviations:** 4 auto-fixed (2 bug fixes, 1 blocking, 1 missing critical)
**Impact on plan:** All auto-fixes necessary for correctness. The Serwist and getClaims API differences are due to the research being slightly ahead of the actual installed package versions. No scope creep.

## Issues Encountered

- npm cache permissions (`/Users/aaronmattia/.npm` was root-owned) caused initial scaffold failure. Worked around by using `/tmp/npm-cache` as the npm cache directory for all installs.

## User Setup Required

None at this stage — no external services configured. Plan 02 will require Supabase project credentials in `.env.local`.

## Next Phase Readiness

- **Ready:** Plan 02 (database schema) can start immediately — drizzle.config.ts points to schema dir, db/index.ts has RLS wrapper ready
- **Ready:** Plan 03 (auth) can proceed — all Supabase client utilities are functional, proxy.ts guards routes
- **Ready:** Plan 04 (shell) can proceed — shadcn components available, hooks created, directory structure in place
- **Note:** PWA icons are placeholder solid-color PNGs — real brand icons needed before user-facing demo

---
*Phase: 01-foundation*
*Completed: 2026-03-03*

## Self-Check: PASSED

All 26 key files verified present. Both task commits (f9b1489, 1f38244) confirmed in git history.
