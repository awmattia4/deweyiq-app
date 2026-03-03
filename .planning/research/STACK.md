# Stack Research

**Domain:** Field service management SaaS (pool company platform)
**Researched:** 2026-03-03
**Confidence:** HIGH (core stack), MEDIUM (AI/maps integrations)

---

## Recommended Stack

### Core Technologies

| Technology | Version | Purpose | Why Recommended |
|------------|---------|---------|-----------------|
| Next.js | 15.5 / 16.x | Full-stack React framework | Official PWA support (manifest, service workers, push notifications built-in as of v16.1.6). App Router enables per-route caching, Server Actions for mutations, Node.js middleware now stable (v15.5). Largest ecosystem for SaaS. Turbopack builds in beta — faster CI. |
| React | 19.x | UI rendering | Ships with Next.js 15/16. React Compiler reduces unnecessary re-renders (important for real-time dashboard updates). Server Components cut JS payload for the office dashboard. |
| TypeScript | 5.x | Type safety | Non-negotiable for a multi-role SaaS. Next.js 15.5 adds typed routes (stable), auto-generated PageProps/LayoutProps types — catches broken links at compile time. |
| Tailwind CSS | 4.x | Utility-first styling | v4 is production-ready, fully supported by shadcn/ui as of Jan 2026. OKLCH color system is better for high-contrast displays (outdoor mobile use). No runtime CSS-in-JS overhead. |
| shadcn/ui | latest | Component library | Copy-paste model means no package lock-in. All components updated for Tailwind v4 + React 19. `data-slot` attributes enable per-primitive styling overrides. Radix UI primitives underneath = accessible by default. |
| Supabase | hosted (current) | PostgreSQL + Auth + Realtime + Storage | All-in-one: Postgres with RLS, auth (JWT + OAuth), row-level security for multi-tenancy, Realtime subscriptions for live dispatch board, Storage for tech photo uploads. Free tier viable for dev; Pro at $25/mo covers early production. Postgres = portable, not a proprietary DB. |
| Drizzle ORM | 0.x (latest) | Type-safe database queries | Code-first TypeScript schema (no separate schema language). No code generation = instant type feedback in dev. 7.4kb bundle (vs Prisma's ~50kb+). Edge/serverless native (no binary dependencies). SQL-like API matches developer mental model for complex joins. |
| Stripe | latest SDK | Payments + subscriptions + ACH | Industry standard for SaaS billing. Supports subscriptions, ACH direct debit (0.8%, cap $5 — ideal for pool companies paying monthly), automatic dunning recovers ~41% of failed payments. Stripe Billing handles prorations, trials, and plan changes without custom code. |

### Supporting Libraries

| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| TanStack Query | v5 | Server state management + caching | Use for all API data fetching on the client. Provides stale-while-revalidate, background refetch, optimistic updates, and offline mutation queuing. 12.3M weekly downloads (60% YoY growth). Superior to SWR for complex multi-entity invalidation patterns needed in dispatch board. |
| Zustand | v5 | UI/client state management | Use for UI state that doesn't belong in the server (selected route, tech GPS position, camera state, modal state). Single store, minimal boilerplate, no re-render traps. Avoid Redux — unnecessary complexity for this scale. |
| React Hook Form | v7 | Form management | All forms: customer creation, service report logging, chemical readings, invoicing. Zero-dependency, minimal re-renders on keystroke. Native integration with shadcn/ui form components. |
| Zod | v3 | Schema validation | Pair with React Hook Form via `@hookform/resolvers`. Single schema validates both client-side (instant feedback) and server-side (Server Actions) — critical for chemical reading validation where bad data causes customer harm. |
| Serwist | latest (`@serwist/next`) | PWA / Service Worker / Offline | Official Next.js docs recommend Serwist for offline support (as of Feb 2026, v16.1.6). next-pwa (original) unmaintained. Serwist wraps Workbox, supports Webpack (required by Next.js PWA plugin model). Handles caching strategies, background sync for offline service reports. |
| Dexie.js | v4 | IndexedDB wrapper for offline | Use for offline-first storage of tech's daily route, pending service reports, and chemical log queues. Cleaner API than raw IndexedDB. Pairs with Serwist background sync: writes go to Dexie when offline, sync to Supabase on reconnect. |
| Mapbox GL JS | v3 | Route map visualization | More affordable than Google Maps for multi-waypoint routing. Optimization v2 API handles duration-optimized routes. Google Routes API caps at 25 waypoints and costs $5-15/1000 requests; Mapbox is significantly cheaper at scale. Use for the tech route view and dispatch map. |
| Resend | latest | Transactional email | Developer-first API, native React Email template support. 100 free emails/day. Best for Next.js/React SaaS. Use for: service report PDFs to customers, invoice delivery, payment receipts, alert notifications. |
| React Email | latest | Email template rendering | Renders React components to HTML for Resend. Write email templates in JSX with full TypeScript safety. Use instead of HTML string templates. |
| Upstash QStash | latest | Serverless background jobs | HTTP-based job queue (no TCP connections = works in serverless/edge). Use for: AI route optimization runs, scheduled invoice generation, automated chemical dosing alerts, payment retry scheduling. Alternative to BullMQ which requires persistent Redis server. |
| next-intl | v3 | Internationalization | If bilingual (English/Spanish) support needed for techs. Minimal overhead. Integrate from the start — retrofitting i18n is painful. |

### Development Tools

| Tool | Purpose | Notes |
|------|---------|-------|
| Biome | Linting + formatting | Next.js 15.5 deprecates `next lint` in favor of ESLint CLI or Biome. Biome is significantly faster, handles both lint and format. Recommended for new projects in Next.js 15.5+ scaffolding. |
| Drizzle Kit | Schema migrations | `drizzle-kit push` for dev, `drizzle-kit migrate` for production. Schema-first migration workflow with TypeScript. |
| Vercel | Deployment | Optimal for Next.js — same team builds both. Preview deployments on PRs. Edge functions at 70+ locations. Use Vercel for hosting, Supabase for database (don't use Vercel Postgres — less capable). |
| Playwright | E2E testing | Test the tech mobile flow, service report submission, payment flows. Simulates real browser including PWA install. |
| Vitest | Unit + integration testing | Fast, native ESM, compatible with Next.js. Test Zod schemas, business logic (chemical dosing calculations, route optimization inputs). |
| Storybook | Component development | Build and test UI components in isolation — especially important for the mobile tech UI where sunlight readability and large touch targets matter. |

---

## Installation

```bash
# Scaffold Next.js project
npx create-next-app@latest pool-platform --typescript --tailwind --app --src-dir --import-alias "@/*"

# Core runtime
npm install @supabase/supabase-js @supabase/ssr drizzle-orm postgres

# UI
npm install @radix-ui/react-* class-variance-authority clsx tailwind-merge lucide-react

# shadcn/ui (use CLI, not manual install)
npx shadcn@latest init

# Data fetching + state
npm install @tanstack/react-query @tanstack/react-query-devtools zustand

# Forms + validation
npm install react-hook-form zod @hookform/resolvers

# PWA + offline
npm install @serwist/next serwist dexie

# Payments
npm install stripe @stripe/stripe-js @stripe/react-stripe-js

# Email
npm install resend @react-email/components

# Background jobs
npm install @upstash/qstash

# Maps
npm install mapbox-gl react-map-gl @mapbox/mapbox-sdk

# Dev dependencies
npm install -D drizzle-kit @biomejs/biome vitest @vitejs/plugin-react playwright @playwright/test
```

---

## Alternatives Considered

| Recommended | Alternative | When to Use Alternative |
|-------------|-------------|-------------------------|
| Next.js 15/16 | Remix 2 | If bundle size on 2G networks is a hard constraint (Remix sends 50kb less JS). Remix's server-first model is marginally better for progressive enhancement. But Next.js has more ecosystem momentum, better PWA tooling, and Vercel support. |
| Supabase | Neon + Clerk | If you want to separate concerns (DB-only from Neon, auth from Clerk). Neon had a 5.5-hour outage in May 2025. Supabase all-in-one reduces integration surface. |
| Drizzle ORM | Prisma | If team prefers schema-first workflow and abstracted API over SQL-like syntax. Prisma 7 improved serverless performance but still has larger bundle and binary dependencies. For Supabase + Vercel Edge, Drizzle is a better fit. |
| TanStack Query | SWR | If bundle size is critical (SWR is 4.2kb vs TanStack's 13.4kb). SWR lacks garbage collection, advanced mutation lifecycle, and pagination primitives — all needed for a dispatch board with live updates. |
| Zustand | Jotai | If UI state has complex atomic derivations (e.g., a calculated dashboard with many interdependent atoms). For this app's use case (route state, modal state, camera state), Zustand's centralized store is simpler. |
| Resend | SendGrid | If monthly email volume exceeds 500K and enterprise deliverability SLAs are needed. Resend has better DX and React Email integration for typical SaaS volumes. |
| Upstash QStash | BullMQ + Redis | If self-hosted infrastructure is acceptable. BullMQ requires a persistent Redis server — doesn't work in serverless. QStash is HTTP-native and works anywhere. |
| Mapbox | Google Maps Routes API | If your team already has Google Maps credits or the customer base is concentrated (no need for global coverage). Google Routes caps at 25 waypoints and costs 2-3x more per request. |
| Vercel | Railway | If cost optimization becomes critical at scale. Railway pricing is predictable ($8-15/mo for typical Next.js app) vs Vercel's per-seat + usage model. Migration is straightforward — Next.js is portable. |
| Serwist | next-pwa (shadowwalker) | Never. next-pwa is unmaintained (2+ years). Serwist is the actively maintained Workbox-based successor endorsed by Next.js official docs. |

---

## What NOT to Use

| Avoid | Why | Use Instead |
|-------|-----|-------------|
| Native mobile app (React Native / iOS / Android) | Pool platform's core is web-first. Two codebases = 2x maintenance. PWA covers 95% of field tech needs (offline, camera, GPS, push notifications, installable). iOS 16.4+ supports push notifications in installed PWAs. | PWA with Serwist + Next.js |
| Redux Toolkit | Massive boilerplate for state that's mostly server-state (handled by TanStack Query). Adds complexity without benefit for this domain. | Zustand for UI state, TanStack Query for server state |
| next-pwa (shadowwalker) | Unmaintained for 2+ years. No App Router support. Will break on Next.js 16. | Serwist (`@serwist/next`) |
| Prisma with Supabase on Edge | Prisma has binary dependencies and a larger runtime. Serverless cold starts are noticeably slower. Edge functions require the Prisma Accelerate proxy (additional cost/complexity). | Drizzle ORM (zero binaries, 7.4kb) |
| PlanetScale | Removed free tier in 2024. MySQL-based (vs Postgres-based Supabase). Supabase gives you Postgres + auth + realtime in one. | Supabase |
| Neon as primary DB | Had a 5.5-hour production outage in May 2025. Database-only (no auth, realtime, storage). Requires assembling more services. | Supabase for all-in-one; Neon if you specifically want serverless branching |
| CSS-in-JS (styled-components, Emotion) | Runtime style injection hurts performance on low-end Android phones. Creates hydration complexity with React Server Components. | Tailwind CSS v4 + CSS Modules for edge cases |
| Moment.js | 66kb bundle, deprecated by maintainers. | `date-fns` (tree-shakeable) or native `Intl` API |
| Charting: Chart.js | Larger bundle, poorer TypeScript support. | Recharts (for dashboards) or Tremor (pre-built analytics components for SaaS) |

---

## Stack Patterns by Variant

**Field tech mobile view (the "hot" path):**
- Render with Server Components for initial route load (fast paint)
- TanStack Query for real-time stop updates
- Dexie.js for optimistic offline writes (service logs, chemical readings)
- Serwist background sync to flush Dexie queue when reconnected
- Large touch targets (min 48px), high-contrast theme (outdoor sunlight)

**Office dashboard:**
- Server Components for initial data (customer list, schedule)
- TanStack Query for live dispatch board updates via Supabase Realtime
- Zustand for calendar/drag-drop UI state
- Server Actions for mutations (schedule change, tech assignment)

**Customer portal:**
- Statically rendered pages where possible (service history)
- TanStack Query for real-time billing status
- Stripe Customer Portal embedded for self-service billing

**Background/async work:**
- Upstash QStash for: route optimization jobs, scheduled invoice generation, automated chemical dosing reminders, AI predictive maintenance alerts
- Supabase Edge Functions or Next.js Route Handlers as QStash targets

**Multi-tenancy data isolation:**
- Every Supabase table gets `org_id` column
- JWT custom claims set on login via Supabase Auth hooks
- RLS policies enforce `auth.jwt()->>'org_id' = org_id` on every table
- Service role key server-side ONLY (never exposed to client)

---

## Version Compatibility

| Package | Compatible With | Notes |
|---------|-----------------|-------|
| Next.js 15.5 / 16.x | React 19.x | React 19 required for Server Components + React Compiler |
| shadcn/ui (Jan 2026) | Tailwind CSS v4, React 19 | CLI initializes with Tailwind v4 automatically; manual v3 installs will need migration |
| Drizzle ORM latest | Supabase Postgres (connection pooling) | Use `prepare: false` in connection config when using transaction pooler. Use Session Mode connection string for compatibility. |
| TanStack Query v5 | React 18+, React 19 | v5 API is stable; breaking change from v4 (no `useQuery` callbacks, `status` field changes) |
| Serwist latest | Next.js 15+ App Router | Requires Webpack config (not Turbopack compatible for service worker bundle). Use webpack for service worker compilation even if Turbopack for main app. |
| @serwist/next | Next.js 15.x | Check serwist GitHub for explicit Next.js 16 support as v16 exits canary. |
| react-hook-form v7.60+ | Zod v3, @hookform/resolvers v5 | `@hookform/resolvers@5.x` required for Zod v3 schema resolver |
| Stripe SDK (latest) | Node.js 18+ | Use webhook signature verification in Route Handlers (not middleware) to avoid edge runtime limitations |

---

## Sources

- [Next.js 15.5 blog post](https://nextjs.org/blog/next-15-5) — Turbopack builds beta, Node.js middleware stable, TypeScript typed routes stable. Confirmed Aug 2025.
- [Next.js PWA official guide](https://nextjs.org/docs/app/guides/progressive-web-apps) — Serwist recommendation, manifest API, push notification implementation. Confirmed Feb 27, 2026 (v16.1.6 docs).
- [Supabase RLS docs](https://supabase.com/docs/guides/database/postgres/row-level-security) — Multi-tenancy via JWT org_id claims. HIGH confidence.
- [Drizzle vs Prisma 2026 comparison](https://www.bytebase.com/blog/drizzle-vs-prisma/) — Bundle size, serverless compatibility, Supabase transaction pooler notes. MEDIUM confidence (multi-source verified).
- [TanStack Query official comparison](https://tanstack.com/query/v5/docs/react/comparison) — vs SWR, Apollo, RTK Query. HIGH confidence.
- [shadcn/ui Tailwind v4 docs](https://ui.shadcn.com/docs/tailwind-v4) — Confirmed Tailwind v4 + React 19 support. HIGH confidence.
- [Stripe SaaS integration docs](https://docs.stripe.com/saas) — ACH rates, subscription billing best practices. HIGH confidence.
- [Resend vs SendGrid 2026](https://forwardemail.net/en/blog/resend-vs-sendgrid-email-service-comparison) — DX comparison, volume thresholds. MEDIUM confidence.
- [Mapbox vs Google Maps 2026](https://radar.com/blog/mapbox-vs-google-maps-api) — Pricing, waypoint limits, route optimization APIs. MEDIUM confidence.
- [Vercel vs Railway vs Fly.io 2026](https://makerkit.dev/blog/tutorials/best-hosting-nextjs) — Cost structure analysis. MEDIUM confidence.
- [Zustand vs Redux 2025](https://dev.to/hijazi313/state-management-in-2025-when-to-use-context-redux-zustand-or-jotai-2d2k) — SaaS state management patterns. MEDIUM confidence.
- [Supabase pricing 2026](https://supabase.com/pricing) — Pro plan $25/mo, 8GB DB, 100GB storage. HIGH confidence.

---

*Stack research for: Pool company management SaaS ("Skimmer killer")*
*Researched: 2026-03-03*
