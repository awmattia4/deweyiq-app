# Architecture Research

**Domain:** Pool Service Management SaaS (Field Service vertical)
**Researched:** 2026-03-03
**Confidence:** MEDIUM-HIGH — patterns verified across Microsoft Dynamics 365 FSL docs, Salesforce FSL docs, industry PWA architecture references, and Supabase/Next.js ecosystem docs. Pool-specific SaaS internals (Skimmer) inferred from public product documentation.

## Standard Architecture

### System Overview

```
┌─────────────────────────────────────────────────────────────────────┐
│                         CLIENT LAYER                                 │
├──────────────────┬──────────────────┬──────────────────────────────┤
│   Field Tech PWA │  Office Dashboard│     Customer Portal           │
│   (offline-first)│  (real-time ops) │     (read-heavy)              │
│   Route + Log    │  Dispatch + CRM  │     Reports + Billing         │
└────────┬─────────┴────────┬─────────┴──────────────┬───────────────┘
         │                  │                          │
         └──────────────────┴──────────────────────────┘
                            │  HTTPS / WebSocket
┌───────────────────────────▼─────────────────────────────────────────┐
│                         API LAYER (Next.js)                          │
├──────────────┬───────────────┬──────────────┬───────────────────────┤
│  Auth + RBAC │  Route Planner│  Scheduling  │  Billing / Payments   │
│  (Clerk/JWT) │  (OR-Tools /  │  & Dispatch  │  (Stripe + Webhooks)  │
│              │   Google ROA) │  Service     │                       │
├──────────────┴───────────────┴──────────────┴───────────────────────┤
│              AI Services Layer (optional async)                      │
│   Chemical Dosing Calc  |  Predictive Alerts  |  Route AI           │
└───────────────────────────┬─────────────────────────────────────────┘
                            │
┌───────────────────────────▼─────────────────────────────────────────┐
│                       DATA LAYER (Supabase)                          │
├──────────────┬──────────────┬────────────────┬──────────────────────┤
│  PostgreSQL  │   Realtime   │  Storage       │  Edge Functions      │
│  (main DB)   │  (WebSocket) │  (photos/docs) │  (webhooks/async)    │
└──────────────┴──────────────┴────────────────┴──────────────────────┘

┌─────────────────────────────────────────────────────────────────────┐
│                   FIELD TECH OFFLINE LAYER (PWA)                     │
│   Service Worker   |   IndexedDB   |   Background Sync Queue        │
└─────────────────────────────────────────────────────────────────────┘
```

### Component Responsibilities

| Component | Responsibility | Typical Implementation |
|-----------|----------------|------------------------|
| Field Tech PWA | Offline route execution, service logging, chemistry readings, photo capture | Next.js PWA with Workbox service worker, IndexedDB via Dexie.js |
| Office Dashboard | Scheduling, dispatch, CRM, real-time route status, reporting | Next.js App Router, Supabase Realtime subscriptions |
| Customer Portal | Service history, invoices, payment, service requests, messaging | Next.js, server-side rendering for SEO-friendliness |
| API Layer | Business logic, auth, RBAC enforcement, integrations | Next.js API Routes / Server Actions |
| Auth + RBAC | Multi-role session management (tech/office/owner/customer) | Clerk with org-level roles, or NextAuth + Supabase RLS |
| Route Optimizer | Daily route sequencing, travel time minimization | Google Route Optimization API (managed) or OR-Tools (self-hosted) |
| Scheduling Engine | Job creation, assignment to techs, recurring work order generation | PostgreSQL + cron logic via pg_cron or Supabase Edge Functions |
| Billing / Payments | Invoice generation, Stripe charges, ACH, subscription management | Stripe Billing + Stripe Connect for multi-company payouts |
| Realtime Bus | Push schedule changes, alerts, and status updates to clients | Supabase Realtime (Postgres LISTEN/NOTIFY bridge via WebSocket) |
| AI/Smart Features | Chemical dosing suggestions, predictive alerts, anomaly detection | OpenAI API calls or lightweight rule engine; async via Edge Functions |
| Storage | Service report photos, signed documents, chemical log attachments | Supabase Storage (S3-compatible), signed URLs |
| Offline Sync | Queue writes made while offline, flush on reconnect, resolve conflicts | Service Worker + Background Sync API + IndexedDB outbound queue |

---

## Recommended Project Structure

```
src/
├── app/                        # Next.js App Router
│   ├── (auth)/                 # Login, signup, role onboarding
│   ├── (tech)/                 # Field tech interface (mobile-first)
│   │   ├── routes/             # Today's route view
│   │   ├── service-log/        # Log service for a stop
│   │   └── chemistry/          # Water test entry
│   ├── (office)/               # Office staff dashboard
│   │   ├── dispatch/           # Schedule board
│   │   ├── customers/          # CRM
│   │   ├── routes/             # Route management
│   │   └── reports/            # Business analytics
│   ├── (portal)/               # Customer-facing portal
│   │   ├── reports/            # Service history
│   │   ├── billing/            # Invoices + payments
│   │   └── requests/           # Service requests
│   └── api/                    # API routes (webhooks, integrations)
│       ├── stripe/             # Stripe webhook handler
│       ├── route-optimizer/    # Optimization trigger endpoint
│       └── sync/               # Offline sync reconciliation endpoint
├── components/
│   ├── ui/                     # Shared primitives (shadcn/ui)
│   ├── tech/                   # Tech-specific components
│   ├── office/                 # Office-specific components
│   └── portal/                 # Customer portal components
├── lib/
│   ├── db/                     # Supabase client, query helpers
│   ├── auth/                   # RBAC helpers, session utilities
│   ├── stripe/                 # Stripe client, billing helpers
│   ├── maps/                   # Route optimization wrappers
│   └── chemistry/              # Pool chemistry calculation logic
├── hooks/                      # React Query hooks, Supabase subscriptions
├── workers/                    # Service worker (Workbox config)
│   └── sw.ts                   # Offline cache + Background Sync
├── store/                      # IndexedDB schema (Dexie.js)
│   └── offline-queue.ts        # Outbound write queue for offline sync
└── types/                      # Shared TypeScript domain types
```

### Structure Rationale

- **`app/(tech)/`:** Grouped route segment isolates mobile-first, offline-capable UI from office and portal code — enables different layout, auth middleware, and bundle optimization per audience.
- **`app/(office)/`:** Office users need dense, real-time-capable UIs; isolated segment means different Supabase subscription patterns and larger bundle budget.
- **`app/(portal)/`:** Customer portal is largely read-only and SEO-optional; can be statically generated where appropriate.
- **`lib/chemistry/`:** Chemistry calculation logic (LSI, dosing, saturation index) is a pure function domain — isolated, unit-testable, shareable between server and client.
- **`workers/`:** Service worker lives outside `src/app` to avoid Next.js bundling it as a module; registered via `next-pwa` or manual registration.
- **`store/`:** IndexedDB layer is tech-facing only; Dexie.js schema enforced here so offline writes are typed.

---

## Architectural Patterns

### Pattern 1: Domain-Driven Module Boundaries

**What:** Organize server-side logic around business domains (Work Orders, Routes, Customers, Billing, Chemistry) rather than technical layers (controllers, services, repositories).
**When to use:** From the start — prevents cross-domain coupling that makes scheduling logic leak into billing code.
**Trade-offs:** Slightly more upfront planning; pays off when you add features like recurring service agreements.

**Example:**
```typescript
// lib/work-orders/create-work-order.ts
// Owns: validation, status transitions, recurring generation logic
// Does NOT import from: lib/billing or lib/routes directly — uses events

export async function createWorkOrder(input: CreateWorkOrderInput) {
  const workOrder = await db.workOrders.insert({ ...input, status: 'pending' });
  await eventBus.emit('work-order.created', workOrder); // billing & scheduling listen
  return workOrder;
}
```

### Pattern 2: Offline Queue with Idempotent Sync

**What:** Every write from the field tech PWA goes first to IndexedDB with a UUID key. Background Sync flushes the queue to the server when connectivity returns. Server uses the UUID to deduplicate.
**When to use:** Any data entered by field techs — service logs, chemistry readings, photos, status updates.
**Trade-offs:** Adds reconciliation complexity; required for field reliability in areas with poor cell coverage.

**Example:**
```typescript
// store/offline-queue.ts
interface QueuedWrite {
  id: string;          // UUID generated client-side (idempotency key)
  type: 'service-log' | 'chemistry-reading' | 'photo';
  payload: unknown;
  createdAt: number;
  attempts: number;
}

// Service worker Background Sync handler
self.addEventListener('sync', async (event) => {
  if (event.tag === 'flush-writes') {
    const pending = await db.queue.getAll();
    for (const write of pending) {
      await fetch('/api/sync', {
        method: 'POST',
        body: JSON.stringify(write),
        headers: { 'Idempotency-Key': write.id }
      });
      await db.queue.delete(write.id);
    }
  }
});
```

### Pattern 3: Multi-Role Auth with Supabase RLS

**What:** Roles (tech, office, owner, customer) stored in user metadata. Supabase Row Level Security policies enforce data access at the database level. Next.js middleware enforces UI-level routing.
**When to use:** From day one — retrofitting multi-tenancy or RBAC later is the most expensive architectural mistake in SaaS.
**Trade-offs:** RLS policies require careful testing; debugging unauthorized access is harder than application-level checks.

**Example:**
```sql
-- Policy: Techs can only see work orders assigned to them
CREATE POLICY "techs_own_work_orders" ON work_orders
  FOR SELECT USING (
    auth.uid() = assigned_tech_id
    OR EXISTS (
      SELECT 1 FROM user_roles
      WHERE user_id = auth.uid()
      AND role IN ('office', 'owner')
    )
  );
```

### Pattern 4: Event-Driven Async for Smart Features

**What:** AI features (dosing suggestions, predictive alerts, route optimization) run asynchronously via Supabase Edge Functions triggered by database events — not in the hot path of API responses.
**When to use:** Any feature that calls an external AI API or runs a heavy computation.
**Trade-offs:** Results are eventually consistent (shown when ready); avoids blocking the UI waiting for AI.

```typescript
// Supabase Edge Function triggered on chemistry reading insert
export const chemistryAlert = async (req: Request) => {
  const { record } = await req.json(); // new chemistry reading
  const suggestion = await calculateDosing(record);
  if (suggestion.action_required) {
    await supabase.from('alerts').insert({
      customer_id: record.customer_id,
      type: 'chemistry',
      message: suggestion.message,
    });
  }
};
```

---

## Data Flow

### Request Flow: Field Tech Logs a Service Visit

```
[Tech opens stop in PWA]
    ↓
[Loads from IndexedDB cache if offline] — OR — [fetches from API if online]
    ↓
[Tech completes service form, submits]
    ↓
[IndexedDB: write to local store + outbound queue]
    ↓ (immediate — UI confirms instantly)
[Service Worker Background Sync fires when online]
    ↓
[POST /api/sync with Idempotency-Key]
    ↓
[API Layer: validate, upsert to PostgreSQL]
    ↓
[Supabase Realtime: NOTIFY → office dashboard updates route status]
    ↓
[Edge Function triggered: chemistry alert check, invoice generation if final stop]
```

### Request Flow: Office Dispatches a Work Order

```
[Office creates work order in dashboard]
    ↓
[POST /api/work-orders → PostgreSQL insert]
    ↓
[Route Optimizer called async: Google ROA or OR-Tools]
    ↓
[Optimizer returns optimized stop sequence]
    ↓
[Work order linked to tech's route for that date]
    ↓
[Supabase Realtime: NOTIFY → tech's PWA updates today's route]
    ↓
[Push notification sent to tech's device]
```

### State Management

```
[Supabase PostgreSQL] — source of truth for all persisted state
    ↓ LISTEN/NOTIFY
[Supabase Realtime WebSocket]
    ↓ subscription
[React Query cache] ←→ [Supabase hooks] → [UI components]

[Field Tech Offline]
[IndexedDB] ←→ [React Query (offline adapter)] → [PWA UI]
    ↓ (reconnect)
[Background Sync Queue] → [API /api/sync] → [PostgreSQL]
```

### Key Data Flows

1. **Route Execution Flow:** PostgreSQL route plan → tech's IndexedDB cache → offline execution → Background Sync → back to PostgreSQL → Realtime push to office dashboard
2. **Billing Flow:** Completed work order → Stripe Invoice creation (API) → customer email → Stripe Webhook on payment → payment recorded in PostgreSQL → customer portal updated
3. **Chemistry Alert Flow:** Chemistry reading insert → Edge Function trigger → dosing calculation → alert row insert → Realtime push to office + customer portal
4. **Recurring Work Order Flow:** pg_cron or Supabase Edge Function scheduled job → checks service agreements → generates work orders for next billing/service period → assigns to routes

---

## Core Data Model

Drawn from Microsoft Dynamics 365 FSL and Salesforce FSL documented data models (verified MEDIUM confidence).

```
Account (Customer)
  └── Service Locations (pools)
        └── Customer Assets (equipment: pump, filter, heater)
              └── Work Orders (jobs to perform)
                    ├── Resource Requirements (scheduling constraints)
                    │     └── Bookings (assigned tech + time slot)
                    ├── Service Tasks (checklist items)
                    ├── Products Used (chemicals consumed)
                    └── Service Report → Invoice (Stripe)

Routes
  └── Route Stops (ordered list of Work Orders / Service Visits)
        └── assigned to: Bookable Resource (Tech)

Chemistry Readings
  └── linked to: Service Visit + Customer Asset (pool)
        └── triggers: Dosing Alert (async)

User
  ├── Role: tech | office | owner | customer
  └── Organization (the pool company — enables multi-company future)
```

---

## Scaling Considerations

| Scale | Architecture Adjustments |
|-------|--------------------------|
| 0-500 users | Supabase free/pro tier, single Next.js app on Vercel, no queue needed — direct Stripe calls inline |
| 500-5K users | Add Supabase Realtime connection pooling, move AI calls to Edge Functions to avoid Vercel timeout limits, add Redis (Upstash) for rate limiting |
| 5K-50K users | Separate route optimization into a dedicated worker service, add database read replicas for reporting queries, consider splitting customer portal to static CDN |
| 50K+ users | Evaluate microservices split around billing and scheduling domains, multi-region Supabase, dedicated message queue (BullMQ/Redis) for background jobs |

### Scaling Priorities

1. **First bottleneck:** Supabase Realtime connection limits — move to Supabase Pro early if dispatching to many simultaneous field techs; pool connections at API layer.
2. **Second bottleneck:** Route optimization API latency — Google ROA calls are synchronous and can take 2-10 seconds for large fleets; always run async and return results via Realtime push, never block the UI.
3. **Third bottleneck:** Reporting queries — aggregate queries on work orders, revenue, chemical usage hit the same OLTP database; add a materialized view or a dedicated reporting schema early rather than retrofitting.

---

## Anti-Patterns

### Anti-Pattern 1: Inline AI Calls in API Route Handlers

**What people do:** Call OpenAI or a route optimization API directly inside a Next.js API route, waiting for the response before returning to the client.
**Why it's wrong:** Vercel serverless functions timeout at 10-60 seconds; optimization calls for large fleets can exceed this. Also blocks the user from continuing work.
**Do this instead:** Fire the optimization job async (Supabase Edge Function or BullMQ), return a job ID immediately, push the result via Supabase Realtime when done.

### Anti-Pattern 2: Skipping RLS for "Speed" Early On

**What people do:** Disable Supabase Row Level Security during development to move faster, planning to add it later.
**Why it's wrong:** Adding RLS post-launch requires auditing every query, fixing N+1 patterns, and re-testing all data access paths — typically 2-4 weeks of rework. Also creates data leak risk if launched without it.
**Do this instead:** Implement RLS policies in the first sprint. Start permissive (owner sees all), tighten progressively. Use Supabase's `auth.uid()` and role claims from the start.

### Anti-Pattern 3: Single "Service Log" Table for All Event Types

**What people do:** Create one generic `events` or `service_logs` table with a `type` column and JSON payload for chemistry readings, photos, tasks completed, etc.
**Why it's wrong:** Chemistry readings need structured columns for pool chemistry calculations (pH, chlorine, alkalinity, CYA). JSON blobs kill query performance and make chemistry alert logic brittle.
**Do this instead:** Separate typed tables: `service_visits`, `chemistry_readings`, `service_photos`, `task_completions`. Use a `service_visit_id` foreign key to link them.

### Anti-Pattern 4: Treating the PWA as a Simple Mobile Web App

**What people do:** Build the field tech UI as a regular responsive web app without proper offline architecture, assuming techs will have cell service.
**Why it's wrong:** Pool techs work in neighborhoods with poor signal, inside equipment rooms, and in backyards with no WiFi. Any data loss in the field destroys trust and causes double-entry.
**Do this instead:** Architect offline-first from day one. Service worker caching strategy is planned in Phase 1 (Foundation), not retrofitted in Phase 4.

### Anti-Pattern 5: Building Accounting from Scratch

**What people do:** Build a full double-entry accounting system (GL, chart of accounts, journal entries) to handle invoicing and expense tracking.
**Why it's wrong:** Full accounting is a years-long engineering effort. Pool companies need QuickBooks-compatible output, not a competing accounting product.
**Do this instead:** Use Stripe Billing for invoice lifecycle management. Sync completed invoices to QuickBooks Online via their API. Track expenses in a simple PostgreSQL table with export. Only build what differentiates (the pool-specific billing triggers and chemical cost tracking).

---

## Integration Points

### External Services

| Service | Integration Pattern | Notes |
|---------|---------------------|-------|
| Stripe | Server-side API calls for invoice/charge creation; Stripe Webhooks → `/api/stripe` for payment events | Use Stripe's idempotency keys; store `stripe_customer_id` and `stripe_invoice_id` on your records |
| Google Route Optimization API | Async call from Edge Function, result stored and pushed via Realtime | Expensive at scale ($4-6 per optimization call for large fleets); cache results, only re-optimize on change |
| Google Maps (geocoding) | Client-side for address display, server-side for geocoding on customer create | Required for route stop ordering; store lat/lng on `service_locations` table at creation time |
| QuickBooks Online | Batch sync via QBO API on invoice close; not real-time | Use webhooks from QBO for reconciliation, not polling; many pool businesses already use QBO |
| LaMotte / Orenda (chemistry) | If integrating hardware readers: REST or Bluetooth data push to chemistry endpoint | Skimmer already has this integration; it's a differentiator worth pursuing but Phase 3+ work |
| Push Notifications | Web Push API via service worker; Supabase Edge Function sends push payload | Use for: new job assigned, route change, overdue payment, chemical alert |
| SMS | Twilio for customer appointment reminders; triggered by scheduled Edge Function | Not architecture-critical; optional enhancement, not MVP |

### Internal Boundaries

| Boundary | Communication | Notes |
|----------|---------------|-------|
| Office Dashboard ↔ Scheduling Engine | Direct PostgreSQL writes + Supabase Realtime for read push | Office writes work orders; Realtime updates schedule board live |
| Scheduling Engine ↔ Route Optimizer | API call on route change event; result written back to DB | Keep optimizer async; never block dispatch UI |
| Field Tech PWA ↔ API | REST POST for sync flush; GET for initial route load | All field writes go through the outbound queue — never direct DB from PWA |
| API Layer ↔ Stripe | Server-only Stripe client; never expose secret key to client | Stripe webhook signature verified at `/api/stripe` before processing |
| Chemistry Engine ↔ Alert System | Database trigger → Edge Function | Pure function: reading in → alert recommendation out; stateless |
| Customer Portal ↔ API | Server Actions (Next.js) for form submissions; Supabase Realtime for live invoice status | Portal is read-heavy; cache aggressively with Next.js `revalidate` |

---

## Build Order Implications

Components have hard dependencies that dictate phase order:

```
Phase 1: Foundation (blocks everything)
  → Database schema + RLS + Auth/RBAC + Multi-role routing
  → Offline PWA shell + Service Worker + IndexedDB schema
  REASON: Every other component depends on auth context and DB schema.
  Changing schema after billing is wired is expensive.

Phase 2: Core Field Operations (blocks billing + AI)
  → Work Orders + Service Visits + Route Management
  → Field Tech PWA: offline route view, service logging, chemistry entry
  → Offline sync queue + Background Sync
  REASON: Need real service data before testing billing flows or AI suggestions.

Phase 3: Office Operations (blocks customer portal)
  → Dispatch + Schedule Board (Supabase Realtime)
  → Customer CRM + Service Agreements (recurring work orders)
  → Reporting (basic)
  REASON: Office needs to see field data; customer portal needs completed service records to show.

Phase 4: Billing + Payments
  → Stripe integration: invoicing, ACH, AutoPay
  → QuickBooks sync
  → Invoice automation from completed work orders
  REASON: Billing depends on work order completion events; don't build payment flows until the service record that triggers them is stable.

Phase 5: Customer Portal
  → Service history, reports, invoices, messaging
  → Service request submission
  REASON: Portal is read-only over Phase 2-4 data. Build last so it shows real data.

Phase 6: Smart Features (non-blocking but depends on data volume)
  → AI route optimization
  → Chemical dosing calculations + predictive alerts
  → Automated scheduling suggestions
  REASON: AI features need real usage data to tune and validate. Route optimization needs geocoded customer records (Phase 3). Chemistry alerts need reading history (Phase 2).
```

---

## Sources

- Microsoft Dynamics 365 Field Service Architecture (verified, official): https://learn.microsoft.com/en-us/dynamics365/field-service/field-service-architecture
- Supabase Realtime with Next.js (official docs): https://supabase.com/docs/guides/realtime/realtime-with-nextjs
- PWA Offline-First Architecture patterns: https://wild.codes/candidate-toolkit-question/how-would-you-architect-a-pwa-for-offline-first-and-real-time-sync
- Stripe SaaS Integration (official): https://docs.stripe.com/saas
- Google Route Optimization API (official): https://developers.google.com/maps/documentation/route-optimization/overview
- Skimmer pool service software components (MEDIUM confidence — inferred from product docs): https://www.getskimmer.com/blog/the-best-pool-service-software-complete-guide
- Building Offline-First React Apps 2025: https://emirbalic.com/building-offline-first-react-apps-in-2025-pwa-rsc-service-workers/
- Multi-Tenant SaaS Architecture Next.js: https://vladimirsiedykh.com/blog/saas-architecture-patterns-nextjs
- Real-time notifications Supabase + Next.js: https://makerkit.dev/blog/tutorials/real-time-notifications-supabase-nextjs
- Field Service Management 2026 trends: https://entry.conntac.net/en/blog/field-service-management-2026

---
*Architecture research for: Pool Service Management SaaS ("Skimmer Killer")*
*Researched: 2026-03-03*
