# Phase 1: Foundation - Research

**Researched:** 2026-03-03
**Domain:** Next.js 16 / Supabase Auth / Drizzle ORM RLS / PWA offline shell
**Confidence:** HIGH (core stack verified against official docs and Context7-equivalent sources)

---

<user_constraints>

## User Constraints (from CONTEXT.md)

### Locked Decisions

#### Auth flow design
- Sign-in: email + password with Google OAuth as convenience option
- Sign-up collects: full name, email, password, and company name (creates tenant)
- Team invites: owner sends email invite with pre-assigned role; invitee clicks link and sets password — no approval step
- Password reset: standard email link flow
- Customer auth: separate portal login page (/portal/login) with company branding; staff use the main app login

#### Role landing experience
- Tech: lands directly on today's route list — no dashboard in between
- Owner/Office: lands on a dashboard with key metrics (today's stops, revenue snapshot, alerts, quick actions)
- Owner and office share the same view; owner gets additional tabs (billing settings, team management, reports)
- Phase 1 pages: minimal real content — basic dashboard with real data where available (user profile, team list), not just placeholder pages

#### Offline indicators & sync feedback
- Offline status: subtle persistent banner (thin colored bar at top/bottom), disappears when back online
- Sync status: persistent icon in header showing synced/syncing/pending state
- Sync failure: auto-retry silently in background; only alert user on final failure after retries exhausted
- Pre-caching: cache today's full route data when app opens with connectivity — tech can work all day offline

#### App identity & shell
- Product has a chosen name (user-provided — confirm in branding assets)
- Visual direction: bold & modern — deep blue or teal with vibrant accents, Linear/Vercel aesthetic, sharp and minimal
- Loading experience: skeleton screens (show layout structure with gray placeholders immediately), not splash screen
- Branding model: product brand for staff experience; customer portal shows the pool company's own logo and colors

### Claude's Discretion
- Exact skeleton screen layout and animation
- Specific shade selection within the blue/teal palette
- Typography choices (font family, scale)
- Error page design and copy
- Transition animations between routes
- Exact retry count and backoff strategy for sync failures

### Deferred Ideas (OUT OF SCOPE)
None — discussion stayed within phase scope

</user_constraints>

---

<phase_requirements>

## Phase Requirements

| ID | Description | Research Support |
|----|-------------|-----------------|
| AUTH-01 | User can sign up with email and password | Supabase Auth `signUp()` with `user_metadata` for full_name + company name; org created via DB trigger on insert to orgs table |
| AUTH-02 | User can log in and session persists across browser refresh | Supabase SSR cookie-based sessions via `@supabase/ssr`; `proxy.ts` refreshes JWT on every request |
| AUTH-03 | User can reset password via email link | Supabase `resetPasswordForEmail()` + `/auth/callback` route handler with `type=recovery` check |
| AUTH-04 | Owner can invite team members with role assignment | Supabase `auth.admin.inviteUserByEmail()` with role stored in `app_metadata`; Custom Access Token Hook promotes role into JWT |
| AUTH-05 | System enforces role-based permissions | Custom Access Token Hook injects `org_id` + `role` into JWT; Drizzle `.rls()` wrapper sets `request.jwt.claims` per transaction; RLS policies on every table use `auth.jwt() ->> 'role'` |
| AUTH-06 | Multi-tenant isolation ensures companies cannot see each other's data | All tables have `org_id` column; RLS SELECT policy: `org_id = (auth.jwt() ->> 'org_id')::uuid`; enforced at DB level, cannot be bypassed by application code |

</phase_requirements>

---

## Summary

Phase 1 builds the permanent infrastructure layer — every architectural choice made here propagates forward into all 9 subsequent phases. The technology stack is locked by prior roadmap decisions: Next.js 16 (stable since October 2025) with App Router, Supabase for auth and Postgres, Drizzle ORM for schema + RLS management, Serwist for the PWA service worker, and Dexie.js for IndexedDB. All of these are current, well-maintained, and have explicit integration documentation.

The most critical architectural concern is the **Drizzle + Supabase RLS session boundary**: Drizzle bypasses Supabase's built-in RLS by connecting directly to Postgres. Every query that must respect RLS must use a custom `.rls()` transaction wrapper that calls `set_config('request.jwt.claims', ...)` and `SET LOCAL ROLE authenticated` before each query, then resets afterward. Failing to do this silently runs queries as the Postgres superuser, meaning RLS policies are ignored. This is the single most dangerous pitfall in the stack.

The second major concern is **Next.js 16 breaking changes**. The file `middleware.ts` is now `proxy.ts` and the export is renamed from `middleware` to `proxy`. Supabase's official SSR documentation now shows `proxy.ts` examples. Since the roadmap specifies "Next.js 15/16," this research recommends targeting Next.js 16 from the start rather than migrating later. The CVE-2025-29927 middleware auth bypass was patched in 15.2.3+ and is fully resolved in 16.x. The Serwist PWA plugin requires `--webpack` for production builds (Turbopack is used for dev), which requires a split npm script strategy.

**Primary recommendation:** Scaffold with Next.js 16 and `create-next-app`, immediately configure `proxy.ts` (not `middleware.ts`), add Supabase Auth with the Custom Access Token Hook for role/org_id JWT claims, add Drizzle with the `.rls()` transaction wrapper from day one, and set up Serwist with webpack build flag.

---

## Standard Stack

### Core

| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| next | 16.x (latest) | App framework, routing, SSR, RSC | Locked by roadmap; 16 is current stable |
| @supabase/supabase-js | ^2.x | Supabase client (auth, DB, realtime) | Official Supabase JS client |
| @supabase/ssr | ^0.x | Cookie-based SSR auth helpers | Required for Next.js App Router auth |
| drizzle-orm | ^0.40+ | Type-safe query builder + schema + RLS | Locked by roadmap; edge-native |
| drizzle-kit | ^0.30+ | Migration CLI | Pairs with drizzle-orm |
| postgres | ^3.x | Postgres driver for Drizzle | node-postgres alternative, works with pooler |
| @serwist/next | ^9.x | Next.js PWA / service worker plugin | Successor to next-pwa, actively maintained |
| serwist | ^9.x | Service worker runtime (peer dep) | Required by @serwist/next |
| dexie | ^4.x | IndexedDB wrapper for offline store | Locked by roadmap; best API in class |

### Supporting

| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| tailwindcss | ^4.x | Utility-first CSS | Locked by roadmap; v4 has CSS-first config |
| shadcn/ui | latest | Component library (copied source) | Locked by roadmap; Tailwind v4 compatible |
| tw-animate-css | latest | Tailwind v4 animation replacement | Replaces tailwindcss-animate (deprecated in v4) |
| typescript | ^5.1+ | Type safety | Required by Next.js 16 minimum |
| react | 19.x | UI runtime | Next.js 16 ships with React 19.2 |

### Alternatives Considered

| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| Drizzle ORM | Prisma | Prisma has better migration GUI; Drizzle is edge-native and better with Supabase pooler — locked decision |
| Serwist | next-pwa | next-pwa is abandoned; Serwist is the community fork and successor |
| Dexie.js | idb / wa-sqlite | Dexie has the best API surface for complex schemas and versioned migrations |
| @supabase/ssr | next-auth | next-auth adds complexity and JWT customization is harder; Supabase native auth is simpler with built-in invite/magic-link |

**Installation (new project):**

```bash
npx create-next-app@latest poolco --ts --tailwind --eslint --app --src-dir --import-alias "@/*"
cd poolco

# Supabase
npm install @supabase/supabase-js @supabase/ssr

# Drizzle
npm install drizzle-orm postgres
npm install -D drizzle-kit

# PWA
npm install @serwist/next
npm install -D serwist

# Offline store
npm install dexie

# shadcn (interactive CLI)
npx shadcn@latest init
```

---

## Architecture Patterns

### Recommended Project Structure

```
src/
├── app/
│   ├── (auth)/              # Public auth pages (login, signup, reset, invite)
│   │   ├── login/
│   │   ├── signup/
│   │   ├── reset-password/
│   │   └── auth/callback/   # OAuth + magic-link + invite callback handler
│   ├── (app)/               # Protected staff app (owner, office, tech)
│   │   ├── dashboard/       # Owner/Office landing (key metrics)
│   │   ├── routes/          # Tech landing (today's route list)
│   │   ├── team/
│   │   └── layout.tsx       # Auth guard: redirects unauthenticated
│   ├── portal/              # Customer portal (separate branding)
│   │   ├── login/
│   │   └── layout.tsx
│   ├── manifest.ts          # PWA manifest (Next.js built-in)
│   ├── sw.ts                # Serwist service worker source
│   └── layout.tsx           # Root layout
├── lib/
│   ├── supabase/
│   │   ├── client.ts        # Browser client (createBrowserClient)
│   │   ├── server.ts        # Server client (createServerClient + cookies)
│   │   └── proxy.ts         # updateSession helper for proxy.ts
│   ├── db/
│   │   ├── index.ts         # Drizzle instance with .rls() wrapper
│   │   ├── schema/          # One file per domain (orgs, users, etc.)
│   │   └── migrations/      # Generated by drizzle-kit
│   └── offline/
│       └── db.ts            # Dexie schema and instance
├── components/
│   ├── ui/                  # shadcn copied components
│   └── shell/               # AppShell, OfflineBanner, SyncIcon
├── hooks/
│   └── use-online-status.ts # navigator.onLine + online/offline events
└── proxy.ts                 # Next.js 16 network proxy (formerly middleware.ts)
```

### Pattern 1: Supabase Auth with Next.js 16 proxy.ts

**What:** Cookie-based session management via Next.js proxy that refreshes JWTs on every request.
**When to use:** All authenticated routes in the App Router.

```typescript
// Source: https://supabase.com/docs/guides/auth/server-side/nextjs
// proxy.ts (root of project, NOT in src/)
import { type NextRequest } from "next/server"
import { updateSession } from "@/lib/supabase/proxy"

export async function proxy(request: NextRequest) {
  return await updateSession(request)
}

export const config = {
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)",
  ],
}
```

```typescript
// src/lib/supabase/proxy.ts
import { createServerClient } from "@supabase/ssr"
import { NextResponse, type NextRequest } from "next/server"

export async function updateSession(request: NextRequest) {
  let supabaseResponse = NextResponse.next({ request })

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!,
    {
      cookies: {
        getAll() { return request.cookies.getAll() },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value }) =>
            request.cookies.set(name, value))
          supabaseResponse = NextResponse.next({ request })
          cookiesToSet.forEach(({ name, value, options }) =>
            supabaseResponse.cookies.set(name, value, options))
        },
      },
    }
  )

  // CRITICAL: Use getClaims(), NOT getSession()
  // getClaims() validates JWT signature. getSession() trusts the cookie blindly.
  const { data: { user } } = await supabase.auth.getClaims()

  // Role-based redirect
  if (!user && !request.nextUrl.pathname.startsWith("/auth") &&
      !request.nextUrl.pathname.startsWith("/portal/login")) {
    const url = request.nextUrl.clone()
    url.pathname = "/login"
    return NextResponse.redirect(url)
  }

  return supabaseResponse
}
```

```typescript
// src/lib/supabase/server.ts — for Server Components and Actions
import { createServerClient } from "@supabase/ssr"
import { cookies } from "next/headers"

export async function createClient() {
  const cookieStore = await cookies()
  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!,
    {
      cookies: {
        getAll() { return cookieStore.getAll() },
        setAll(cookiesToSet) {
          try {
            cookiesToSet.forEach(({ name, value, options }) =>
              cookieStore.set(name, value, options))
          } catch { /* Server Component — no-op */ }
        },
      },
    }
  )
}
```

### Pattern 2: Drizzle ORM with Supabase RLS (the critical pattern)

**What:** Custom Drizzle client that wraps every query in a PostgreSQL transaction that sets JWT claims before executing, enabling RLS policies to see the user's role and org_id.
**When to use:** Every query that must respect row-level security (virtually all application queries).

```typescript
// Source: https://github.com/rphlmr/drizzle-supabase-rls
// src/lib/db/index.ts
import { drizzle } from "drizzle-orm/postgres-js"
import postgres from "postgres"
import { sql } from "drizzle-orm"

// CRITICAL: prepare: false required for Supabase transaction-mode pooler
const client = postgres(process.env.DATABASE_URL!, { prepare: false })
const baseDb = drizzle({ client })

type SupabaseToken = {
  sub: string
  role: string
  org_id: string
  // ...other JWT claims
}

// Use this for all user-facing queries — sets RLS context
export function createDrizzleClient(token: SupabaseToken) {
  return baseDb.$transaction(async (tx) => {
    // Set JWT claims for RLS policies to read via auth.jwt()
    await tx.execute(sql`
      select set_config('request.jwt.claims', ${JSON.stringify(token)}, TRUE),
             set_config('request.jwt.claim.sub', ${token.sub}, TRUE),
             set local role authenticated
    `)
    return tx
  })
}

// Usage in Server Action or Route Handler:
// const supabase = await createClient()
// const { data: { user } } = await supabase.auth.getClaims()
// const db = await createDrizzleClient(user.app_metadata)
// const results = await db.select().from(stops).where(...)
// RLS policy on stops: org_id = (auth.jwt() ->> 'org_id')::uuid

// Admin client — bypasses RLS (use only for invite/webhook handlers)
export const adminDb = baseDb
```

### Pattern 3: Multi-Tenant RLS Schema (Drizzle)

**What:** Every table gets `org_id` with a NOT NULL constraint and RLS policies enforcing tenant isolation.
**When to use:** Every domain table in the schema.

```typescript
// Source: https://orm.drizzle.team/docs/rls
// src/lib/db/schema/orgs.ts
import { pgTable, uuid, text, timestamp, pgPolicy } from "drizzle-orm/pg-core"
import { sql } from "drizzle-orm"
import { authenticatedRole } from "drizzle-orm/supabase"

export const orgs = pgTable("orgs", {
  id: uuid("id").defaultRandom().primaryKey(),
  name: text("name").notNull(),
  created_at: timestamp("created_at", { withTimezone: true }).defaultNow(),
}, (t) => [
  pgPolicy("org members can view own org", {
    for: "select",
    to: authenticatedRole,
    using: sql`id = (auth.jwt() ->> 'org_id')::uuid`,
  }),
])

// Example domain table with org_id
export const profiles = pgTable("profiles", {
  id: uuid("id").primaryKey().references(() => authUsers.id, { onDelete: "cascade" }),
  org_id: uuid("org_id").notNull().references(() => orgs.id),
  full_name: text("full_name").notNull(),
  role: text("role").notNull(), // 'owner' | 'office' | 'tech' | 'customer'
}, (t) => [
  pgPolicy("users can view profiles in own org", {
    for: "select",
    to: authenticatedRole,
    using: sql`org_id = (auth.jwt() ->> 'org_id')::uuid`,
  }),
  pgPolicy("users can update own profile", {
    for: "update",
    to: authenticatedRole,
    using: sql`id = auth.uid()`,
  }),
])
```

### Pattern 4: Custom Access Token Hook (inject org_id + role into JWT)

**What:** A Postgres function that runs before every Supabase JWT is issued, promoting `org_id` and `role` from `app_metadata` into top-level JWT claims where RLS policies can read them efficiently.
**When to use:** Required for org_id + role to be available in `auth.jwt()` for RLS.

```sql
-- Source: https://supabase.com/docs/guides/auth/auth-hooks/custom-access-token-hook
-- Run in Supabase SQL editor once during setup
create or replace function public.custom_access_token_hook(event jsonb)
returns jsonb
language plpgsql
stable
as $$
declare
  claims jsonb;
  user_org_id uuid;
  user_role text;
begin
  claims := event -> 'claims';

  -- Read from app_metadata (NOT user_metadata — users can modify user_metadata)
  user_org_id := (event -> 'claims' -> 'app_metadata' ->> 'org_id')::uuid;
  user_role := event -> 'claims' -> 'app_metadata' ->> 'role';

  -- Promote to top-level JWT claims for RLS efficiency
  if user_org_id is not null then
    claims := jsonb_set(claims, '{org_id}', to_jsonb(user_org_id));
  end if;

  if user_role is not null then
    claims := jsonb_set(claims, '{user_role}', to_jsonb(user_role));
  end if;

  return jsonb_build_object('claims', claims);
end;
$$;

-- Grant execute permission to the supabase_auth_admin role
grant execute on function public.custom_access_token_hook to supabase_auth_admin;
revoke execute on function public.custom_access_token_hook from authenticated, anon, public;
```

### Pattern 5: Invite Flow (Supabase admin API)

**What:** Owner uses `supabase.auth.admin.inviteUserByEmail()` from a Server Action. Role is stored in `app_metadata` immediately after invite is created.
**When to use:** Team member invitation (tech, office, customer).

```typescript
// Source: https://supabase.com/docs/reference/javascript/auth-admin-inviteuserbyemail
// Server Action (requires service role key — NEVER expose to client)
"use server"
import { createClient } from "@supabase/supabase-js"

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!, // service role — server only
)

export async function inviteTeamMember(
  email: string,
  role: "office" | "tech",
  orgId: string
) {
  // Step 1: Send invite email
  const { data, error } = await supabaseAdmin.auth.admin.inviteUserByEmail(email, {
    redirectTo: `${process.env.NEXT_PUBLIC_APP_URL}/auth/callback?type=invite`,
  })

  if (error || !data.user) throw new Error(error?.message ?? "Invite failed")

  // Step 2: Set role and org_id in app_metadata immediately
  // CRITICAL: Use app_metadata (not user_metadata) — users cannot modify app_metadata
  await supabaseAdmin.auth.admin.updateUserById(data.user.id, {
    app_metadata: { role, org_id: orgId },
  })

  return { success: true }
}

// NOTE: PKCE is NOT supported with inviteUserByEmail
// The invite email contains a one-time token (OTP), not a PKCE code
// Callback handler uses exchangeCodeForSession() with the token from URL
```

### Pattern 6: Serwist PWA Setup

**What:** Service worker setup with Serwist for offline shell caching and precaching.
**When to use:** Required for PWA installability and offline support.

```typescript
// Source: https://serwist.pages.dev/docs/next/getting-started
// next.config.ts
import type { NextConfig } from "next"
import withSerwistInit from "@serwist/next"

const withSerwist = withSerwistInit({
  swSrc: "src/app/sw.ts",
  swDest: "public/sw.js",
  // Disable in development — Serwist requires webpack for SW compilation
  disable: process.env.NODE_ENV === "development",
})

const nextConfig: NextConfig = {
  // ... other config
}

export default withSerwist(nextConfig)
```

```json
// package.json scripts — CRITICAL: build must use --webpack, dev can use Turbopack
{
  "scripts": {
    "dev": "next dev --turbopack",
    "build": "next build --webpack",
    "start": "next start"
  }
}
```

```typescript
// src/app/sw.ts — Service worker source
import { defaultCache } from "@serwist/next/worker"
import { installSerwist } from "serwist"

installSerwist({
  precacheEntries: self.__SW_MANIFEST,
  skipWaiting: true,
  clientsClaim: true,
  navigationPreload: false,
  runtimeCaching: defaultCache,
})
```

```typescript
// src/app/manifest.ts — PWA manifest (Next.js built-in)
import type { MetadataRoute } from "next"

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "PoolCo",  // Confirm actual product name from branding assets
    short_name: "PoolCo",
    description: "Pool service management",
    start_url: "/",
    display: "standalone",
    background_color: "#0f172a",   // Deep navy — confirm shade in Claude's discretion
    theme_color: "#0ea5e9",        // Sky blue — confirm shade in Claude's discretion
    icons: [
      { src: "/icons/icon-192.png", sizes: "192x192", type: "image/png" },
      { src: "/icons/icon-512.png", sizes: "512x512", type: "image/png" },
      { src: "/icons/icon-512-maskable.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
  }
}
```

### Pattern 7: Dexie.js Offline Schema and Write Queue

**What:** IndexedDB schema for caching today's route data and queuing outbound writes when offline.
**When to use:** Any write operation that must survive connectivity loss.

```typescript
// Source: https://dexie.org/docs
// src/lib/offline/db.ts
import Dexie, { type Table } from "dexie"

export interface SyncQueueItem {
  id?: number
  url: string
  method: string
  body: string
  headers: Record<string, string>
  createdAt: number
  retries: number
}

export interface CachedRoute {
  id: string          // stop_id
  data: unknown       // full route stop data
  cachedAt: number
}

class OfflineDB extends Dexie {
  syncQueue!: Table<SyncQueueItem>
  routeCache!: Table<CachedRoute>

  constructor() {
    super("poolco-offline")
    this.version(1).stores({
      syncQueue: "++id, createdAt, retries",
      routeCache: "id, cachedAt",
    })
  }
}

export const offlineDb = new OfflineDB()

// Enqueue a write for background sync
export async function enqueueWrite(
  url: string,
  method: string,
  body: unknown,
  headers: Record<string, string> = {}
) {
  await offlineDb.syncQueue.add({
    url,
    method,
    body: JSON.stringify(body),
    headers,
    createdAt: Date.now(),
    retries: 0,
  })

  // Register background sync tag if service worker is available
  if ("serviceWorker" in navigator && "sync" in ServiceWorkerRegistration.prototype) {
    const registration = await navigator.serviceWorker.ready
    await (registration as any).sync.register("poolco-outbound-sync")
  }
}
```

### Pattern 8: Online Status Hook

**What:** React hook for tracking connectivity state, used by the offline banner component.
**When to use:** The persistent offline banner and sync status icon in the shell.

```typescript
// src/hooks/use-online-status.ts
import { useState, useEffect } from "react"

export function useOnlineStatus() {
  const [isOnline, setIsOnline] = useState(
    typeof navigator !== "undefined" ? navigator.onLine : true
  )

  useEffect(() => {
    const handleOnline = () => setIsOnline(true)
    const handleOffline = () => setIsOnline(false)

    window.addEventListener("online", handleOnline)
    window.addEventListener("offline", handleOffline)

    return () => {
      window.removeEventListener("online", handleOnline)
      window.removeEventListener("offline", handleOffline)
    }
  }, [])

  return isOnline
}
```

### Pattern 9: Skeleton Screen Loading (shadcn/ui)

**What:** Route-level loading.tsx files using shadcn Skeleton component to show structural placeholders immediately.
**When to use:** Every page that fetches data — appears while React Suspense resolves.

```typescript
// Source: https://ui.shadcn.com/docs/components/radix/skeleton
// src/app/(app)/dashboard/loading.tsx
import { Skeleton } from "@/components/ui/skeleton"

export default function DashboardLoading() {
  return (
    <div className="space-y-6 p-6">
      {/* Header metrics row */}
      <div className="grid grid-cols-4 gap-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <Skeleton key={i} className="h-24 w-full rounded-lg" />
        ))}
      </div>
      {/* Quick actions */}
      <div className="flex gap-3">
        <Skeleton className="h-10 w-32 rounded-md" />
        <Skeleton className="h-10 w-32 rounded-md" />
      </div>
      {/* Content area */}
      <Skeleton className="h-64 w-full rounded-lg" />
    </div>
  )
}
```

### Anti-Patterns to Avoid

- **Using `middleware.ts` instead of `proxy.ts` in Next.js 16:** Next.js 16 deprecated `middleware.ts`. New projects should use `proxy.ts` with the `proxy` export. The old file name still works but generates deprecation warnings and will be removed.
- **Reading roles from `user_metadata` in RLS policies:** `user_metadata` is user-modifiable. Roles MUST live in `app_metadata` or a separate `user_roles` table, promoted via the Custom Access Token Hook.
- **Calling `supabase.auth.getSession()` in server code:** `getSession()` trusts the cookie without validating the JWT signature. Always use `supabase.auth.getClaims()` in server components, actions, and the proxy.
- **Running Drizzle queries without the `.rls()` wrapper:** Drizzle connects directly to Postgres as the Postgres superuser, bypassing RLS entirely. Every user-facing query MUST be wrapped to set JWT claims.
- **Using connection pooler with `prepare: true` (the default):** Supabase's transaction-mode pooler does not support prepared statements. Always pass `{ prepare: false }` to the postgres driver.
- **Using Turbopack for production builds with Serwist:** Serwist's Next.js plugin requires webpack to compile the service worker. Use `--webpack` flag for builds only, keep Turbopack for dev.
- **Storing the service role key in `NEXT_PUBLIC_` env vars:** The service role key bypasses RLS. It must only exist in server-only env vars (no `NEXT_PUBLIC_` prefix) and used exclusively in Server Actions and Route Handlers.

---

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Auth session management | Custom JWT cookie handling | `@supabase/ssr` + Supabase Auth | Token refresh, PKCE, cookie rotation, expiry all handled automatically |
| Role claims in JWT | Manual JWT signing | Custom Access Token Hook (Postgres function) | Supabase validates hook output; prevents JWT tampering |
| Offline data persistence | Raw IndexedDB API | Dexie.js | IndexedDB API is notoriously error-prone; Dexie handles schema versioning, migrations, transactions |
| Service worker registration | Manual SW code | Serwist | Workbox precaching, runtime caching strategies, revision hashing |
| PWA manifest | Static JSON file | `app/manifest.ts` (Next.js built-in) | Dynamic manifest enables per-tenant branding in portal later |
| Password reset flow | Custom token generation | `supabase.auth.resetPasswordForEmail()` | Supabase handles token generation, expiry, and secure email delivery |
| OAuth callback | Custom token exchange | Supabase `/auth/callback` route handler | PKCE exchange is complex; errors are subtle and security-critical |
| Schema migrations | Raw SQL files | Drizzle Kit (`drizzle-kit generate` + `migrate`) | Tracks migration state, generates diffs, avoids collision |
| RLS policy testing | Manual psql | Supabase SQL editor with `set role authenticated` + `set_config` | Simulates RLS context accurately |

**Key insight:** Every item in this table has subtle edge cases (token expiry timing, concurrency, schema drift) that have caused production incidents at scale. The libraries have absorbed years of real-world bug reports.

---

## Common Pitfalls

### Pitfall 1: Drizzle Silently Bypasses RLS

**What goes wrong:** Queries run without errors, but return data from all tenants. A tech sees other companies' customers.
**Why it happens:** Drizzle connects to Postgres as the database owner (superuser), which RLS does not apply to. Without `SET LOCAL ROLE authenticated` and `set_config('request.jwt.claims', ...)` inside a transaction, RLS policies see no user context.
**How to avoid:** Create a custom db client wrapper (Pattern 2 above) on day one. Never use `baseDb` directly for user-facing queries. Add an integration test that asserts cross-org queries return empty results.
**Warning signs:** Queries return more rows than expected; a logged-in user can see records with mismatched `org_id`.

### Pitfall 2: getSession() vs getClaims() in Server Code

**What goes wrong:** Users can forge valid-looking sessions by crafting cookies, bypassing auth checks.
**Why it happens:** `getSession()` trusts the cookie value without verifying the JWT signature against Supabase's public keys. `getClaims()` performs cryptographic verification on every call.
**How to avoid:** Never use `getSession()` in server-side code. Use `getClaims()` in all Server Components, Server Actions, and the proxy.
**Warning signs:** Auth checks pass even with an expired or tampered token.

### Pitfall 3: user_metadata Used for Roles

**What goes wrong:** A user calls `supabase.auth.updateUser({ data: { role: 'owner' } })` from their browser and escalates their own privileges.
**Why it happens:** `user_metadata` is writable by the authenticated user via the public Supabase JS client. `app_metadata` is only writable via the service role.
**How to avoid:** Always store roles in `app_metadata` (set via service role in Server Actions only). The Custom Access Token Hook must read from `app_metadata`, not `user_metadata`. Write an E2E test: attempt to self-escalate via `updateUser`, verify role is unchanged.
**Warning signs:** Role stored in `raw_user_meta_data` instead of `raw_app_meta_data` in the Supabase dashboard.

### Pitfall 4: Missing invite PKCE Limitation

**What goes wrong:** Implementing invite flow with PKCE enabled causes a "code challenge required" error when the invitee clicks the link from a different browser.
**Why it happens:** PKCE requires the same browser session that initiated the flow to complete it. Invite emails are opened in a different browser instance (often mobile email client vs desktop). Supabase explicitly documents that `inviteUserByEmail` does not support PKCE.
**How to avoid:** The `/auth/callback` route must handle invite tokens with `supabase.auth.exchangeCodeForSession(token)` without PKCE. Do not set the PKCE flow type for invite callbacks.
**Warning signs:** Invitees get "invalid grant" errors when clicking email links.

### Pitfall 5: Serwist Build Fails with Turbopack

**What goes wrong:** `next build` fails with a Serwist/webpack loader error when Turbopack is the default.
**Why it happens:** Next.js 16 makes Turbopack the default bundler. Serwist's Next.js plugin is a webpack plugin that cannot run under Turbopack.
**How to avoid:** Add `--webpack` to the `build` script in package.json. Keep Turbopack for `dev` only. This is documented on the official Serwist site.
**Warning signs:** Build error mentioning "withSerwist" or "sw.ts" loader not found.

### Pitfall 6: iOS PWA Install Requires Manual User Action

**What goes wrong:** Android users see an install prompt automatically; iOS users don't and assume the app isn't installable.
**Why it happens:** Safari iOS does not support the `beforeinstallprompt` event. Users must manually tap Share → Add to Home Screen.
**How to avoid:** Add an iOS-specific instructional banner (detect with `navigator.userAgent` + `(display-mode: standalone)` check). The Next.js official PWA docs include a reference `InstallPrompt` component for exactly this case.
**Warning signs:** Techs on iPhones don't know how to install; the offline indicator never shows (app is running in Safari, not standalone mode).

### Pitfall 7: Parallel Route Slots Missing default.js (Next.js 16)

**What goes wrong:** Build fails with "Missing default.js" in Next.js 16 when using parallel routes.
**Why it happens:** Next.js 16 made `default.js` required for all parallel route slots (previously optional). This was a breaking change.
**How to avoid:** If using `@slot` parallel routes, always add `default.js` that calls `notFound()`. Prefer route groups `(group)` over parallel routes for the role-based layout patterns in this phase.
**Warning signs:** Build error: "Parallel route slot requires a default.js file."

### Pitfall 8: Supabase Connection Pooler Breaks Transactions

**What goes wrong:** Drizzle transactions fail with "prepared statement already exists" or "transaction not supported" errors in production.
**Why it happens:** Supabase's transaction-mode pooler (Supavisor, port 6543) does not support prepared statements or server-side transactions that span pooler connections.
**How to avoid:** Always use `{ prepare: false }` in the postgres client constructor. For the `.rls()` pattern, wrap the `set_config` and query in a single `db.$transaction()` call to ensure they share the same connection.
**Warning signs:** Works locally (direct connection) but fails on Vercel (pooler connection).

---

## Code Examples

Verified patterns from official sources:

### Google OAuth Sign-In Button

```typescript
// Source: https://supabase.com/docs/guides/auth/social-login/auth-google
// src/components/auth/google-sign-in-button.tsx
"use client"
import { createClient } from "@/lib/supabase/client"

export function GoogleSignInButton() {
  const supabase = createClient()

  async function handleGoogleSignIn() {
    await supabase.auth.signInWithOAuth({
      provider: "google",
      options: {
        redirectTo: `${location.origin}/auth/callback`,
      },
    })
  }

  return (
    <button onClick={handleGoogleSignIn}>
      Continue with Google
    </button>
  )
}
```

### Auth Callback Route Handler

```typescript
// Source: https://supabase.com/docs/guides/auth/server-side/nextjs
// src/app/auth/callback/route.ts
import { NextResponse } from "next/server"
import { createClient } from "@/lib/supabase/server"

export async function GET(request: Request) {
  const { searchParams, origin } = new URL(request.url)
  const code = searchParams.get("code")
  const type = searchParams.get("type") // 'invite', 'recovery', etc.
  const next = searchParams.get("next") ?? "/"

  if (code) {
    const supabase = await createClient()
    const { error } = await supabase.auth.exchangeCodeForSession(code)
    if (!error) {
      // Role-based redirect after successful auth
      const { data: { user } } = await supabase.auth.getClaims()
      const role = user?.app_metadata?.role
      const redirectPath = role === "tech" ? "/routes" : "/dashboard"
      return NextResponse.redirect(`${origin}${redirectPath}`)
    }
  }

  return NextResponse.redirect(`${origin}/auth/error`)
}
```

### RLS Policy Test (SQL — verifies isolation)

```sql
-- Source: https://supabase.com/docs/guides/database/postgres/row-level-security
-- Run in Supabase SQL editor to verify RLS is enforced

-- Simulate being an authenticated user from org A
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"<user-id>","org_id":"<org-a-id>","user_role":"tech"}', TRUE);

-- This should return 0 rows for Org B's data
select count(*) from stops where org_id = '<org-b-id>';
-- Expected: 0

-- Reset
reset role;
```

### Drizzle Schema Migration Commands

```bash
# Generate migration from schema changes
npx drizzle-kit generate

# Apply migrations to Supabase (use direct connection URL for migrations, not pooler)
DATABASE_URL="postgresql://postgres:<password>@db.<project-ref>.supabase.co:5432/postgres" \
  npx drizzle-kit migrate

# Introspect existing schema (useful for initial setup)
npx drizzle-kit introspect
```

---

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| `middleware.ts` + `middleware` export | `proxy.ts` + `proxy` export | Next.js 16 (Oct 2025) | All new projects use proxy.ts; middleware.ts deprecated |
| `supabase.auth.getSession()` in server | `supabase.auth.getClaims()` in server | Late 2024 (Supabase SSR update) | Security: getClaims validates JWT signature |
| tailwindcss-animate | tw-animate-css | Tailwind v4 release (early 2025) | tailwindcss-animate incompatible with v4 CSS-first config |
| `tailwind.config.js` | `@theme` directive in globals.css | Tailwind v4 | No more JS config file; all config in CSS |
| next-pwa | Serwist (@serwist/next) | 2023-2024 | next-pwa abandoned; Serwist is the maintained fork |
| Prisma over Drizzle | Drizzle preferred for Supabase | 2024 | Drizzle edge-native, pooler-compatible; Prisma has proxy workarounds |
| forwardRef in shadcn | Removed in shadcn v2 (React 19) | 2025 | React 19 `ref` as prop; forwardRef removed from all components |
| webpack default bundler | Turbopack default bundler | Next.js 16 (Oct 2025) | 2-5x faster builds; Serwist builds still need --webpack |

**Deprecated/outdated:**
- `middleware.ts` filename: Deprecated in Next.js 16. Still works but will be removed in future version. New projects: use `proxy.ts`.
- `supabase.auth.getSession()` in server code: Still exists but documented as insecure for server use. Always use `getClaims()`.
- `tailwindcss-animate`: Incompatible with Tailwind v4. Replace with `tw-animate-css`.
- CVE-2025-29927 (middleware bypass): Fully patched in Next.js 15.2.3+ and 16.x. Not a concern for new projects starting on 16.

---

## Open Questions

1. **Product name for PWA manifest**
   - What we know: CONTEXT.md says "Product has a chosen name (user-provided — confirm in branding assets)"
   - What's unclear: The actual product name is not in any planning file
   - Recommendation: Block on this before shipping the manifest. Planner should add a task to confirm product name with user before manifest.ts is finalized. A placeholder like "PoolCo" can be used initially.

2. **Supabase project tier and region**
   - What we know: Supabase free tier has a 500MB DB limit, pauses after 1 week of inactivity, and has lower connection limits
   - What's unclear: Whether this is a new Supabase project or existing; which region
   - Recommendation: Use Pro tier ($25/mo) for production from the start — free tier pausing would break tech workflows. Region: choose closest to the customer's primary operating geography.

3. **Email provider for Supabase transactional emails**
   - What we know: Supabase built-in email has a 3 emails/hour rate limit on free tier; invite + password reset + welcome could hit this quickly
   - What's unclear: Whether to configure a custom SMTP provider (Resend, Postmark) in Phase 1 or defer
   - Recommendation: Configure Resend (simple Supabase integration) in Phase 1 to avoid invite email failures during testing. Rate limits will block the invite flow testing immediately on free tier.

4. **Drizzle migrations vs Supabase CLI migrations**
   - What we know: Both tools can manage Postgres migrations; they track state differently
   - What's unclear: Whether to use `drizzle-kit` alone or integrate with Supabase CLI's migration system
   - Recommendation: Use Drizzle Kit exclusively for schema and migrations. Do not mix with Supabase CLI migrations — they track state separately and conflicts are difficult to resolve. Apply migrations with Drizzle Kit against the direct connection (not pooler).

5. **Background Sync API browser support for iOS**
   - What we know: Background Sync API (for syncing writes when the app is closed) is not supported on iOS Safari as of early 2026. It works on Chrome Android.
   - What's unclear: This may affect the "Sync failure: auto-retry silently in background" requirement on iOS
   - Recommendation: For Phase 1, implement sync on the `online` event (reliable cross-platform). Background Sync (when app is closed) works only on Android. Document this iOS limitation clearly — the CONTEXT.md requirement for background retry is achievable when the app is open; when closed on iOS it will sync on next app open.

---

## Sources

### Primary (HIGH confidence)
- https://nextjs.org/blog/next-16 — Next.js 16 release notes, breaking changes, proxy.ts rename, Turbopack stable
- https://supabase.com/docs/guides/auth/server-side/nextjs — Supabase SSR auth setup, proxy.ts pattern, getClaims() guidance
- https://supabase.com/docs/reference/javascript/auth-admin-inviteuserbyemail — inviteUserByEmail API, PKCE limitation
- https://supabase.com/docs/guides/auth/auth-hooks/custom-access-token-hook — Custom Access Token Hook for JWT claims
- https://supabase.com/docs/guides/database/postgres/custom-claims-and-role-based-access-control-rbac — RBAC pattern, app_metadata vs user_metadata
- https://orm.drizzle.team/docs/rls — Drizzle RLS API, pgPolicy, authenticatedRole
- https://orm.drizzle.team/docs/tutorials/drizzle-with-supabase — Drizzle + Supabase setup, prepare:false requirement
- https://github.com/rphlmr/drizzle-supabase-rls — set_config RLS session pattern
- https://serwist.pages.dev/docs/next/getting-started — Serwist Next.js setup
- https://nextjs.org/docs/app/guides/progressive-web-apps — Next.js official PWA guide, manifest.ts, iOS install limitation
- https://ui.shadcn.com/docs/tailwind-v4 — shadcn/ui Tailwind v4 compatibility, tw-animate-css migration

### Secondary (MEDIUM confidence)
- https://projectdiscovery.io/blog/nextjs-middleware-authorization-bypass — CVE-2025-29927 technical analysis (verified against Vercel postmortem)
- https://vercel.com/blog/postmortem-on-next-js-middleware-bypass — Vercel official postmortem on CVE-2025-29927
- https://dexie.org/product — Dexie.js features and Background Sync integration overview
- https://blog.logrocket.com/nextjs-16-pwa-offline-support/ — Next.js 16 + Serwist PWA guide
- https://aurorascharff.no/posts/dynamically-generating-pwa-app-icons-nextjs-16-serwist/ — Dynamic PWA icons with Serwist in Next.js 16

### Tertiary (LOW confidence — flag for validation)
- Multiple community blog posts on skeleton screen patterns (verified pattern is correct but exact shadcn API may shift with updates)
- Background Sync API iOS limitation: based on MDN/Can I Use data; verify at implementation time as Safari has been incrementally improving PWA support

---

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH — all libraries verified against official documentation; versions confirmed stable as of March 2026
- Architecture patterns: HIGH — code examples taken from official Supabase + Next.js + Drizzle docs
- Drizzle RLS session pattern: HIGH — verified against rphlmr/drizzle-supabase-rls and Drizzle docs
- Pitfalls: HIGH — CVE verified against Vercel postmortem; role escalation verified against Supabase security docs; all others verified against official documentation
- iOS PWA Background Sync limitation: MEDIUM — browser support tables can change; verify at implementation

**Research date:** 2026-03-03
**Valid until:** 2026-04-03 (30 days — stack is mature but Next.js and Supabase move fast; re-verify proxy.ts API and getClaims() signature before implementation if delayed)
