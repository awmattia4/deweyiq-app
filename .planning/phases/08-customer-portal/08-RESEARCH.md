# Phase 8: Customer Portal — Research

**Researched:** 2026-03-13
**Domain:** Customer-facing portal — magic link auth, subdomain routing, Realtime messaging, Stripe payment method management, Supabase Storage photos
**Confidence:** HIGH (all major findings verified against official docs or authoritative sources)

---

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions

#### Portal access & branding
- Magic link (email) authentication — no password, customer enters email and gets a one-time login link
- Multi-company customers see a company picker after login — select which company's portal to enter
- Full white-label branding — logo, colors, custom subdomain (bluewavepools.poolco.app), custom favicon
- Company subdomains — each company gets their own subdomain; customer navigates directly to their company's URL

#### Service history view
- Per-pool tabs with timeline — if customer has multiple pools, each pool gets its own tab with a dedicated timeline
- Summary cards that expand for detail — each visit is a compact card (date, status, chem summary); tap to expand full readings, checklist, photos, notes
- Chemistry shown as full numbers + color-coded status — actual values (pH 7.4, Cl 3.0) with green/amber/red indicators
- Photos: inline thumbnails per visit AND a separate photo gallery tab per pool — most complete view

#### Service request flow
- Guided form: select pool -> pick category -> describe issue -> add photos -> preferred date + time window -> submit
- Date + time window picker — customer picks date and window (Morning, Afternoon, Anytime); office has final say on scheduling
- Simple "This is urgent" toggle — urgent requests get flagged/highlighted in the office queue
- Status tracker with chat — request shows status badges (Submitted -> Reviewed -> Scheduled -> Complete) plus customer can add messages/photos to the request thread

#### Messaging experience
- Chat-style real-time messaging — iMessage/WhatsApp feel with bubbles, timestamps, real-time delivery via Supabase Realtime
- Photo attachments in messages — customer can send photos (no other file types)
- Office sees messages in both a dedicated inbox page AND on the customer profile tab — unified inbox for overview, profile tab for customer-specific context
- In-app alert + email notifications — sidebar badge for new messages + email to office; customer gets email when office replies

### Claude's Discretion
- Portal shell layout and navigation structure
- Magic link token expiry and session duration
- Subdomain routing implementation (middleware vs DNS)
- Message read receipts and typing indicators
- Service request category list (predefined set)
- Photo gallery grid layout and lightbox implementation
- Empty states for new customers with no history

### Deferred Ideas (OUT OF SCOPE)
None — discussion stayed within phase scope
</user_constraints>

---

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|-----------------|
| PORT-01 | Customer can view service history with reports, photos, and chemical readings | Existing `service_visits`, `visit_photos` tables have all data. RLS must be extended to grant `customer` role SELECT access scoped to their `customer_id`. `adminDb` pattern (already used for `/pay` and `/quote` pages) is the safe fallback. |
| PORT-02 | Customer can view and pay invoices through the portal | Existing `invoices` table + Stripe Connect flow already built for `/pay/[token]`. Portal needs authenticated equivalent. Stripe SetupIntent handles payment method collection; PaymentElement renders saved methods. |
| PORT-03 | Customer can update their payment method and contact information | Stripe SetupIntent + `setup_future_usage: 'off_session'` saves method to Stripe Customer. Contact info updates `customers` table. RLS needs customer-write policy for own contact fields only. |
| PORT-04 | Customer can request one-off services | New `service_requests` table needed. Guided form → creates WO-linked request row → work order spawned by office. Status badge progression (Submitted→Reviewed→Scheduled→Complete). |
| PORT-05 | Customer can send messages to the company through the portal | New `portal_messages` table + Supabase Realtime private broadcast channel. RLS on `realtime.messages` controls channel access. Office sees messages in unified inbox + customer profile tab. |
| PORT-06 | Portal displays company branding (logo, colors) | `orgs.logo_url` and `orgs.slug` already exist. `org_settings` has `website_url`, `social_media_urls`. Need to add `brand_color` (hex) to `org_settings`. Subdomain routing loads org by slug. |
| PORT-07 | Portal supports multi-company customers | Requires multi-org auth model: customer's `app_metadata` holds array of `{ org_id, customer_id, org_name, org_slug }` entries. Custom Access Token Hook populates JWT claim. Company picker shown post-login when multiple orgs. |
| PORT-08 | Portal handles company-switch gracefully — customer leaving org A still works for org B | When org removes customer: remove from `app_metadata` array, invalidate session so new JWT issues. Customer's data in org A preserved but no longer visible. Portal redirects to company picker or remaining org. |
</phase_requirements>

---

## Summary

Phase 8 is a significant surface-area phase that touches auth, subdomain routing, database schema, Realtime, Stripe, Storage, and email notifications. The good news is that the codebase has significant scaffolding already in place: `/portal/(portal)/layout.tsx` exists with auth guard, `PortalShell` exists with placeholder nav, magic link flow is straightforward with Supabase `signInWithOtp`, and all the data (visits, photos, invoices, payments) is already in the database — it just needs new RLS policies to expose it to the `customer` role.

The most architecturally complex decisions are (1) the multi-org customer model (PORT-07/PORT-08) which requires rethinking how `org_id` works in JWT claims for customers who belong to multiple companies, and (2) subdomain routing, which requires middleware changes and production DNS wildcard configuration. The existing proxy (`src/lib/supabase/proxy.ts`) already handles portal routing but needs extension to understand subdomains.

For messaging, Supabase Realtime with private Broadcast channels (not postgres_changes) is the right choice for chat — it's lower latency, scales better, and supports per-channel RLS authorization via `realtime.messages` policies. The existing `@supabase/supabase-js` client already in the project supports this.

**Primary recommendation:** Implement multi-org auth via an `org_memberships` JSONB array in `app_metadata` (updated by the Custom Access Token Hook), resolve the active org from the subdomain on every authenticated request, and use Supabase Realtime private Broadcast with `realtime.messages` RLS for chat.

---

## Standard Stack

### Core (already in project — no new installs)

| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| `@supabase/supabase-js` | ^2.98.0 | Magic link auth, Realtime subscriptions, Storage uploads | Already installed; signInWithOtp is the magic link API |
| `@supabase/ssr` | ^0.9.0 | Server-side auth session management | Already installed; powers the existing portal auth flow |
| `@stripe/react-stripe-js` | ^5.6.1 | PaymentElement for collecting/updating payment methods | Already installed; used in `/pay/[token]` |
| `@stripe/stripe-js` | ^8.9.0 | Stripe.js client initialization | Already installed |
| `stripe` | ^20.4.1 | Server-side: SetupIntent creation, payment method management | Already installed |
| `drizzle-orm` | ^0.45.1 | New schema tables (portal_messages, service_requests) | Already installed |
| `resend` | ^6.9.3 | Email notifications to office and customer on messages | Already installed |

### New Dependency: Photo Gallery Lightbox

| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| `yet-another-react-lightbox` | ^3.x | Full-screen photo viewer with swipe, zoom, keyboard nav | Active maintenance, React 19 support, Next.js example in official docs, next/image compatible via custom render.slide |

**Installation:**
```bash
npm install yet-another-react-lightbox
```

### Alternatives Considered

| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| yet-another-react-lightbox | Custom modal with next/image | Saves a dependency but loses swipe gestures, keyboard nav, zoom — poor mobile UX |
| yet-another-react-lightbox | PhotoSwipe | PhotoSwipe requires more setup and lacks native React 19 support |
| Supabase Realtime Broadcast | postgres_changes | Broadcast is lower latency and scales better; postgres_changes fires a DB query per event |
| Custom subdomain middleware | path-based routing (/portal/[slug]) | Subdomains are required by user decision; this is not an alternative to explore |

---

## Architecture Patterns

### Recommended Project Structure

```
src/
├── app/
│   └── portal/
│       ├── layout.tsx                     # Root portal layout (minimal, no auth)
│       ├── login/
│       │   └── page.tsx                   # Magic link login page (REPLACE password flow)
│       └── (portal)/
│           ├── layout.tsx                 # Auth guard → PortalShell (load org from subdomain)
│           ├── page.tsx                   # Dashboard: upcoming visit summary + action cards
│           ├── history/
│           │   └── page.tsx               # Service history (per-pool tabs + timeline)
│           ├── invoices/
│           │   └── page.tsx               # Invoice list + pay flow
│           ├── requests/
│           │   ├── page.tsx               # Service request list + status
│           │   └── new/
│           │       └── page.tsx           # New service request form
│           └── messages/
│               └── page.tsx               # Chat thread with company
├── components/
│   └── portal/
│       ├── portal-shell.tsx               # UPDATE: load real org branding, nav links
│       ├── visit-timeline.tsx             # Pool tab + timeline of visits
│       ├── visit-card.tsx                 # Collapsible visit card (chem + checklist + photos)
│       ├── photo-gallery.tsx              # Grid + yet-another-react-lightbox
│       ├── invoice-list-portal.tsx        # Customer invoice view
│       ├── portal-payment-form.tsx        # SetupIntent + PaymentElement for method update
│       ├── service-request-form.tsx       # Guided form wizard
│       ├── request-status-tracker.tsx     # Status badges + chat thread per request
│       ├── message-thread.tsx             # Real-time chat bubbles
│       └── company-picker.tsx             # Multi-org picker screen post-login
├── lib/
│   └── db/
│       └── schema/
│           ├── portal-messages.ts         # NEW: portal_messages table
│           └── service-requests.ts        # NEW: service_requests table
└── actions/
    ├── portal-auth.ts                     # Magic link send, org resolution, company picker
    ├── portal-data.ts                     # Service history, invoices, contact update queries
    ├── portal-messages.ts                 # Send/read messages, office inbox
    └── portal-requests.ts                 # Create/update service requests
```

### Pattern 1: Magic Link Authentication (replacing password flow)

**What:** Customer enters email → Supabase sends magic link → customer clicks → PKCE callback exchanges token hash for session.

**Current state:** `/portal/login/page.tsx` uses `signInWithPassword` (Phase 1 placeholder). This MUST be replaced.

**Flow:**
```typescript
// 1. Customer submits email
const { error } = await supabase.auth.signInWithOtp({
  email: customerEmail,
  options: {
    shouldCreateUser: false, // Customers must be invited — never auto-create
    emailRedirectTo: `https://${orgSlug}.poolco.app/auth/portal-callback`,
  },
})

// 2. Auth callback at /auth/portal-callback
// src/app/auth/portal-callback/route.ts
const { token_hash, type } = searchParams
const { error } = await supabase.auth.verifyOtp({ token_hash, type: 'email' })
// After verify → redirect to /portal or company picker
```

**PKCE requirement:** Must use `token_hash` exchange pattern (not magic link redirect) for SSR apps. The email template in Supabase dashboard must be updated to include `{{ .TokenHash }}` as a query param instead of `{{ .ConfirmationURL }}`.

**Token expiry (Claude's Discretion recommendation):** Set to 3600 seconds (1 hour) — the Supabase default. This is sufficient for customers checking email within a reasonable window. Maximum allowed is 86400 seconds (24 hours).

**Session duration (Claude's Discretion recommendation):** Use Supabase's default session duration (1 week) with JWT refresh. Customers should not be re-prompted for magic link on every visit — that creates friction.

**shouldCreateUser: false is critical** — customers are created by the pool company, never via self-signup. Without this flag, a typo in a customer's email could create a ghost account.

### Pattern 2: Subdomain Routing via Middleware

**What:** `bluewavepools.poolco.app` → middleware extracts `bluewavepools` as slug → looks up org by slug → injects org context into request headers → portal pages read org from header.

**Implementation approach (Claude's Discretion recommendation: middleware):**

The existing `proxy.ts` + `src/lib/supabase/proxy.ts` is the middleware entry point. Extend it:

```typescript
// In src/lib/supabase/proxy.ts (updateSession function)

const hostname = request.headers.get('host') ?? ''
// e.g. "bluewavepools.poolco.app" → "bluewavepools"
// In dev: "localhost:3000" → no subdomain
const subdomain = extractPortalSubdomain(hostname)
// subdomain = "bluewavepools" or null (for app.poolco.app, localhost, etc.)

if (subdomain && isPortalPath) {
  // Inject slug into request header for portal pages to consume
  const requestHeaders = new Headers(request.headers)
  requestHeaders.set('x-portal-slug', subdomain)
  supabaseResponse = NextResponse.next({ request: { headers: requestHeaders } })
}

function extractPortalSubdomain(host: string): string | null {
  // Remove port if present
  const hostname = host.split(':')[0]
  // Match *.poolco.app pattern
  const match = hostname.match(/^([^.]+)\.poolco\.app$/)
  return match ? match[1] : null
}
```

**Portal layout reads slug:**
```typescript
// src/app/portal/(portal)/layout.tsx
import { headers } from 'next/headers'

const headersList = await headers()
const slug = headersList.get('x-portal-slug') ?? null
// If slug is null → main domain portal → use org_id from JWT
// If slug is present → look up org by slug (adminDb, no RLS needed for public slug)
```

**DNS/Vercel configuration (production):** Add wildcard domain `*.poolco.app` in Vercel project → Domains settings. Vercel handles SSL automatically for wildcard certs. No per-org DNS configuration needed.

**Local development:** Subdomain routing does not work on `localhost`. In dev, use a fallback: if no subdomain detected, read org from the authenticated user's JWT `org_id` claim. This means dev always shows the primary org — acceptable.

### Pattern 3: Multi-Org Customer Auth Model (PORT-07/PORT-08)

**The problem:** The current auth model assumes each user has exactly one `org_id` in `app_metadata`. Customers can be associated with multiple pool companies.

**Solution: `org_memberships` array in `app_metadata`**

```typescript
// app_metadata shape for a multi-org customer
{
  "user_role": "customer",
  "org_id": "uuid-of-currently-active-org",  // The "active" org (for RLS policies)
  "org_memberships": [
    { "org_id": "uuid-a", "customer_id": "cust-uuid-a", "org_name": "Blue Wave Pools", "org_slug": "bluewavepools" },
    { "org_id": "uuid-b", "customer_id": "cust-uuid-b", "org_name": "Clean Pool Co", "org_slug": "cleanpoolco" }
  ]
}
```

**Custom Access Token Hook:** The hook fires on every token issue. When the customer navigates to `bluewavepools.poolco.app`, the portal's auth callback or session refresh triggers a hook that reads the subdomain (passed as a custom claim or via the `emailRedirectTo` callback URL's org context) and sets `org_id` to the matching org from `org_memberships`.

**Simpler alternative (recommended):** Rather than a dynamic hook, handle org switching at the application layer:
1. On login, read `org_memberships` from JWT claims
2. If one membership → go straight to portal
3. If multiple → show company picker UI
4. On company selection → call a server action that updates `app_metadata.org_id` to the selected org via Supabase Admin API and refreshes the session
5. All RLS policies continue to use `org_id` from JWT — no policy changes needed

**When org removes customer (PORT-08):**
```typescript
// adminDb used — this is an admin action
await supabase.auth.admin.updateUserById(userId, {
  app_metadata: {
    org_memberships: currentMemberships.filter(m => m.org_id !== removedOrgId),
    // If active org was removed, clear it; next login shows company picker
    org_id: currentActiveOrgId === removedOrgId ? null : currentActiveOrgId,
  }
})
// Force session refresh on next request — user sees company picker if needed
```

**Invite collision (existing portal user joins new org):** When office invites a customer email that already has a portal account, do NOT call `supabase.auth.admin.createUser`. Instead:
1. Look up existing auth user by email via `supabase.auth.admin.listUsers()` filtered by email
2. If found → append new org to their `app_metadata.org_memberships` array
3. If not found → create new user as normal

### Pattern 4: Customer RLS Policies

**The problem:** All existing RLS policies scope data by `org_id = JWT.org_id`. The `customer` role needs to see their OWN data, but only their own rows within that org.

**New RLS policies needed for customer role:**

```sql
-- service_visits: customers can see visits for their customer_id
-- Add to existing policy OR create new one
CREATE POLICY "customer_visits_select" ON service_visits
FOR SELECT TO authenticated
USING (
  org_id = (select auth.jwt() ->> 'org_id')::uuid
  AND (
    -- Staff can see all
    (select auth.jwt() ->> 'user_role') IN ('owner', 'office', 'tech')
    OR
    -- Customer can only see their own
    (
      (select auth.jwt() ->> 'user_role') = 'customer'
      AND customer_id = (
        SELECT id FROM customers
        WHERE org_id = (select auth.jwt() ->> 'org_id')::uuid
        AND email = (select auth.email())  -- match by email
        LIMIT 1
      )
    )
  )
);
```

**Drizzle policy syntax (matching existing patterns):**
```typescript
pgPolicy("service_visits_customer_select_policy", {
  for: "select",
  to: authenticatedRole,
  using: sql`
    org_id = (select auth.jwt() ->> 'org_id')::uuid
    AND (
      (select auth.jwt() ->> 'user_role') IN ('owner', 'office', 'tech')
      OR (
        (select auth.jwt() ->> 'user_role') = 'customer'
        AND customer_id IN (
          SELECT id FROM customers
          WHERE email = (select auth.email())
          AND org_id = (select auth.jwt() ->> 'org_id')::uuid
        )
      )
    )
  `,
})
```

**Tables needing customer-accessible policies:**
- `service_visits` — SELECT own visits
- `visit_photos` — SELECT photos for own visits
- `invoices` — SELECT own invoices
- `invoice_line_items` — SELECT line items for own invoices
- `payment_records` — SELECT own payment records
- `pools` — SELECT own pools
- `customers` — SELECT + limited UPDATE own row (contact info only)
- `portal_messages` (new) — SELECT + INSERT own messages in own thread
- `service_requests` (new) — SELECT + INSERT + limited UPDATE own requests

**Alternative: Use `adminDb` for all portal queries (simpler, no RLS changes).** The `/pay/[token]` and `/quote/[token]` pages already use `adminDb` with manual customer-ID filtering. Portal pages can use the same pattern — customer is authenticated via Supabase session, server action extracts their `customer_id` from the JWT or a lookup, then queries with `adminDb` filtered by that ID. This avoids modifying RLS on existing tables entirely.

**Recommendation:** Use `adminDb` + manual customer_id filtering for Phase 8 portal queries. This matches the pattern already established for customer-facing pages and avoids RLS migration risk on existing tables. New tables (`portal_messages`, `service_requests`) get proper RLS from the start.

### Pattern 5: Supabase Realtime for Chat

**What:** Chat messages sent via Supabase Realtime Broadcast private channels. Messages persisted to `portal_messages` table. Realtime delivers instant updates; DB is the source of truth for history.

**Channel naming:** `portal-thread-{customer_id}` — scoped per customer, not per org (since customer IDs are unique UUIDs globally).

**RLS on `realtime.messages` table:**
```sql
-- Customer can read their own thread
CREATE POLICY "customer_can_read_own_thread" ON realtime.messages
FOR SELECT TO authenticated
USING (
  realtime.topic() = 'portal-thread-' || (
    SELECT id::text FROM customers
    WHERE email = auth.email()
    AND org_id = (auth.jwt() ->> 'org_id')::uuid
    LIMIT 1
  )
);

-- Customer can write to their own thread
CREATE POLICY "customer_can_write_own_thread" ON realtime.messages
FOR INSERT TO authenticated
WITH CHECK (
  extension = 'broadcast'
  AND realtime.topic() = 'portal-thread-' || (
    SELECT id::text FROM customers
    WHERE email = auth.email()
    AND org_id = (auth.jwt() ->> 'org_id')::uuid
    LIMIT 1
  )
);
```

**Client subscription pattern:**
```typescript
// In message-thread.tsx (client component)
useEffect(() => {
  const channel = supabase
    .channel(`portal-thread-${customerId}`, { config: { private: true } })
    .on('broadcast', { event: 'message' }, ({ payload }) => {
      setMessages(prev => [...prev, payload])
    })
    .subscribe()

  return () => { supabase.removeChannel(channel) }
}, [customerId])

// Sending a message
async function sendMessage(text: string) {
  // 1. Persist to DB
  await sendPortalMessage(customerId, orgId, text)
  // 2. Broadcast to Realtime channel (server action also broadcasts)
}
```

**Server-side broadcast (in server action):**
```typescript
const supabase = await createClient()
await supabase.channel(`portal-thread-${customerId}`).send({
  type: 'broadcast',
  event: 'message',
  payload: { id, text, sender, sent_at },
})
```

**Read receipts and typing indicators (Claude's Discretion):** Do NOT implement in Phase 8. Read receipts require additional DB column + Realtime presence updates; typing indicators require Supabase Presence feature. Both add significant complexity. Keep Phase 8 chat simple: messages in, messages out, timestamps, unread count badge.

### Pattern 6: Stripe SetupIntent for Payment Method Update (PORT-03)

**What:** Customer opens "Update payment method" in portal → server creates SetupIntent → customer fills PaymentElement → method saved to Stripe Customer object for future off-session charges.

```typescript
// Server action: createSetupIntent
const setupIntent = await stripe.setupIntents.create({
  customer: stripeCustomerId,        // From customers.stripe_customer_id
  usage: 'off_session',              // For AutoPay / future invoices
  automatic_payment_methods: { enabled: true },
})
return { clientSecret: setupIntent.client_secret }

// Client: render PaymentElement
<Elements stripe={stripePromise} options={{ clientSecret }}>
  <PaymentElement />
  <button onClick={handleConfirm}>Save Payment Method</button>
</Elements>

// After confirmSetup → stripe.confirmSetup() → method attached to Customer
// Server webhook or callback: update customers.autopay_method_id with new pm_xxx
```

**Connected account consideration:** Since Stripe Connect is used (Phase 7), SetupIntents for customer portal payment methods should be created on the connected account:
```typescript
const setupIntent = await stripe.setupIntents.create(
  { customer: stripeCustomerId, usage: 'off_session' },
  { stripeAccount: connectedAccountId }  // The org's connected Stripe account
)
```

### Pattern 7: Photo Uploads from Portal (Service Requests + Messages)

**Bucket:** Reuse existing Supabase Storage bucket. New path prefix: `{org_id}/portal/{customer_id}/{context}/{filename}.webp`

**Upload flow (signed URLs for security):**
```typescript
// 1. Server action generates signed upload URL
const { data } = await adminDb.storage
  .from('company-assets')
  .createSignedUploadUrl(`${orgId}/portal/${customerId}/requests/${filename}`)
// Returns { signedUrl, token, path }

// 2. Client uploads directly to signed URL (no server proxy needed)
await fetch(signedUrl, { method: 'PUT', body: compressedFile })

// 3. After upload, store path in service_request.photo_paths or message.photo_path
```

**Browser compression:** `browser-image-compression` (already in dependencies) should compress to <500KB before upload. Matches pattern from `photo-capture.tsx` in field app.

### Pattern 8: Org Branding in Portal

**Current state:** `orgs.slug` and `orgs.logo_url` exist. `org_settings` has `website_url`, `social_media_urls`, `google_review_url`.

**Missing field:** Brand color (hex). Add `brand_color text` to `org_settings`. Portal shell applies it as a CSS custom property:
```css
/* Applied to portal root element */
--portal-primary: #1e9cc0;  /* from org_settings.brand_color */
```

**Loading org data in portal layout:**
```typescript
// src/app/portal/(portal)/layout.tsx
// Read x-portal-slug from headers → look up org by slug via adminDb
const org = await adminDb
  .select({ id: orgs.id, name: orgs.name, logo_url: orgs.logo_url })
  .from(orgs)
  .where(eq(orgs.slug, slug))
  .limit(1)
// Pass to PortalShell
```

**Favicon:** Cannot be dynamically set via Next.js metadata API per-request (it's static in `app/` or `public/`). Recommendation: skip dynamic favicon in Phase 8. The company logo in the header is sufficient branding.

---

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Photo lightbox | Custom modal with prev/next | `yet-another-react-lightbox` | Swipe gestures, keyboard nav, pinch-to-zoom, accessibility — 200+ edge cases |
| Magic link flow | Custom email token system | Supabase `signInWithOtp` | Rate limiting, PKCE security, Supabase dashboard config, expiry management all handled |
| Real-time message delivery | Long-polling or SSE | Supabase Realtime Broadcast | WebSocket management, reconnection, auth token refresh on Realtime handled by SDK |
| Payment method form | Raw Stripe API + custom UI | Stripe PaymentElement | PCI compliance, 3DS, saved method display, validation, ACH support all handled |
| Photo compression | Canvas API resize | `browser-image-compression` (already in project) | Handles EXIF orientation, progressive JPEG, quality tuning |

---

## Common Pitfalls

### Pitfall 1: Customer Using `withRls()` Returns Empty Results

**What goes wrong:** Portal server actions call `withRls(token, db => ...)` but customer's JWT `org_id` doesn't match the RLS policy for `service_visits` (which currently only checks `org_id`, not `customer_id`). Result: empty array, no error.

**Why it happens:** Existing RLS on `service_visits` grants SELECT to all org members — but the "customer" role needs to be explicitly included AND scoped to their own customer_id.

**How to avoid:** Use `adminDb` for all portal data queries with explicit `AND customer_id = $customerId` filters. The `customerId` comes from a lookup: find `customers` row where `email = user.email AND org_id = user.org_id` (using adminDb). Cache this in the layout and pass as a prop.

**Warning signs:** Portal history page loads but shows 0 visits despite known service history.

### Pitfall 2: Multi-Org JWT Claims Race

**What goes wrong:** Customer switches companies via picker → server action updates `app_metadata.org_id` → but cached JWT still has old `org_id` → next requests use wrong org → wrong data appears.

**Why it happens:** Supabase JWTs are cached client-side until they expire (default: 1 hour). Updating `app_metadata` server-side doesn't invalidate the cached token immediately.

**How to avoid:** After updating `app_metadata`, call `supabase.auth.refreshSession()` on the client to force a new JWT. The refreshed token will contain the updated `org_id`. Then do a full page navigation (not soft router.push) to clear React state: `window.location.href = '/portal'`.

**Warning signs:** After company switch, visits/invoices from the old company still appear.

### Pitfall 3: Realtime Channel Auth Not Set Before Subscribe

**What goes wrong:** Customer subscribes to `portal-thread-{customerId}` private channel but gets `CHANNEL_ERROR` or subscription silently fails.

**Why it happens:** For private channels, the client must call `supabase.realtime.setAuth(accessToken)` before subscribing. The standard Supabase client does this automatically when initialized with the user's session, but if the session token hasn't been set on the Realtime connection yet, the channel join will be rejected.

**How to avoid:** Ensure `supabase.realtime.setAuth(session.access_token)` is called before channel subscribe. When using `createClient()` from `@supabase/ssr`, the auth token is automatically injected. Only a problem if using a manually constructed client.

**Warning signs:** `channel.subscribe()` callback receives `'CHANNEL_ERROR'` status; no messages delivered.

### Pitfall 4: Subdomain Missing in Local Dev

**What goes wrong:** Middleware `extractPortalSubdomain('localhost:3000')` returns `null` → portal layout gets no slug → org branding fails to load → TypeError or blank branding.

**Why it happens:** localhost has no subdomain. The `.poolco.app` pattern doesn't match.

**How to avoid:** In portal layout, treat `null` slug as "use org_id from JWT." For dev, org is identified by the user's `org_id` JWT claim directly. Add a fallback: `const orgId = slug ? await resolveOrgBySlug(slug) : user.org_id`.

**Warning signs:** Portal shows placeholder branding in production when it should show real branding; OR TypeError accessing `org.name` when org is null.

### Pitfall 5: signInWithOtp Creates New Users (shouldCreateUser default is true)

**What goes wrong:** A visitor types any email into the portal login form → Supabase auto-creates a new user account with no org association → Custom Access Token Hook fails → user lands in broken state.

**Why it happens:** `signInWithOtp` default `shouldCreateUser` is `true`. Without the `shouldCreateUser: false` option, Supabase creates a user for any email that doesn't exist.

**How to avoid:** Always pass `shouldCreateUser: false` in portal's `signInWithOtp` call. Show a generic "If an account exists for this email, you'll receive a link" message regardless of whether the email exists (prevents email enumeration).

**Warning signs:** Supabase auth.users table grows with emails that have no corresponding `customers` row.

### Pitfall 6: Stripe SetupIntent on Wrong Account

**What goes wrong:** SetupIntent created without `{ stripeAccount: connectedAccountId }` → payment method saved to the platform account, not the pool company's connected account → AutoPay charges fail when they attempt to use the method on the connected account.

**Why it happens:** Phase 7 uses Stripe Connect. All payment operations must specify the connected account. SetupIntents created for portal payment method management are no different.

**How to avoid:** Always pass `{ stripeAccount: org_settings.stripe_account_id }` when creating SetupIntents and PaymentIntents in the portal. Match the pattern in `/pay/[token]/pay-client.tsx`.

**Warning signs:** Payment method appears saved but AutoPay charges fail with "No such payment_method" on the connected account.

### Pitfall 7: Drizzle RLS Policy USING Clause is NULL After Push

**What goes wrong:** New customer-role RLS policies on `portal_messages` and `service_requests` created via `drizzle-kit push` show empty USING/WITH CHECK clauses in Supabase dashboard → all access is denied silently.

**Why it happens:** `drizzle-kit push` can generate policies with empty condition bodies in certain configurations. (Documented in MEMORY.md as a critical pitfall.)

**How to avoid:** After every `drizzle-kit push` or `migrate`, inspect new policies in Supabase dashboard → Authentication → Policies. Verify USING and WITH CHECK show the expected SQL. If empty, drop and recreate manually via SQL migration.

**Warning signs:** New portal pages return empty arrays; no error is thrown.

---

## Code Examples

Verified patterns from official sources and project codebase:

### Magic Link Send (portal login)
```typescript
// src/actions/portal-auth.ts
"use server"
import { createClient } from "@/lib/supabase/server"

export async function sendMagicLink(email: string, orgSlug: string | null) {
  const supabase = await createClient()
  const baseUrl = process.env.NEXT_PUBLIC_APP_URL ?? 'https://app.poolco.app'
  const redirectTo = orgSlug
    ? `https://${orgSlug}.poolco.app/auth/portal-callback`
    : `${baseUrl}/auth/portal-callback`

  const { error } = await supabase.auth.signInWithOtp({
    email,
    options: {
      shouldCreateUser: false,  // CRITICAL: customers are invited, never self-signup
      emailRedirectTo: redirectTo,
    },
  })

  // Always return success message regardless of whether email exists
  // (prevents email enumeration)
  if (error && !error.message.includes('rate limit')) {
    console.error('Magic link error:', error.message)
  }
  return { success: true }
}
```

### Auth Callback Route (PKCE flow)
```typescript
// src/app/auth/portal-callback/route.ts
import { NextRequest, NextResponse } from "next/server"
import { createClient } from "@/lib/supabase/server"

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url)
  const token_hash = searchParams.get('token_hash')
  const type = searchParams.get('type') as 'email' | null
  const next = searchParams.get('next') ?? '/portal'

  if (token_hash && type) {
    const supabase = await createClient()
    const { error } = await supabase.auth.verifyOtp({ token_hash, type })
    if (!error) {
      return NextResponse.redirect(new URL(next, request.url))
    }
  }
  return NextResponse.redirect(new URL('/portal/login?error=invalid_link', request.url))
}
```

### Realtime Chat Subscription (client component)
```typescript
// src/components/portal/message-thread.tsx
"use client"
import { useEffect, useState } from "react"
import { createClient } from "@/lib/supabase/client"

export function MessageThread({ customerId, initialMessages }: Props) {
  const [messages, setMessages] = useState(initialMessages)

  useEffect(() => {
    const supabase = createClient()
    const channel = supabase
      .channel(`portal-thread-${customerId}`, {
        config: { private: true },
      })
      .on('broadcast', { event: 'message' }, ({ payload }) => {
        setMessages(prev => {
          // Deduplicate by id (broadcast fires for sender too)
          if (prev.some(m => m.id === payload.id)) return prev
          return [...prev, payload]
        })
      })
      .subscribe()

    return () => { supabase.removeChannel(channel) }
  }, [customerId])

  // ...render chat bubbles
}
```

### Subdomain Extraction in Middleware
```typescript
// src/lib/supabase/proxy.ts — add to updateSession()
function extractPortalSubdomain(host: string): string | null {
  const hostname = host.split(':')[0]  // remove port
  const match = hostname.match(/^([a-z0-9-]+)\.poolco\.app$/)
  if (!match) return null
  const sub = match[1]
  // Exclude reserved subdomains
  if (['www', 'app', 'api', 'portal', 'admin'].includes(sub)) return null
  return sub
}
```

### SetupIntent for Payment Method Update
```typescript
// src/actions/portal-data.ts
export async function createPortalSetupIntent(orgId: string, customerId: string) {
  const [org] = await adminDb
    .select({ stripe_account_id: orgSettings.stripe_account_id })
    .from(orgSettings)
    .where(eq(orgSettings.org_id, orgId))

  const [customer] = await adminDb
    .select({ stripe_customer_id: customers.stripe_customer_id })
    .from(customers)
    .where(eq(customers.id, customerId))

  if (!org?.stripe_account_id || !customer?.stripe_customer_id) {
    return { error: 'Payment not configured' }
  }

  const stripe = getStripe()
  const setupIntent = await stripe.setupIntents.create(
    {
      customer: customer.stripe_customer_id,
      usage: 'off_session',
      automatic_payment_methods: { enabled: true },
    },
    { stripeAccount: org.stripe_account_id }
  )

  return { clientSecret: setupIntent.client_secret }
}
```

---

## New Schema Required

### `portal_messages` table

```typescript
// src/lib/db/schema/portal-messages.ts
export const portalMessages = pgTable("portal_messages", {
  id: uuid("id").defaultRandom().primaryKey(),
  org_id: uuid("org_id").notNull().references(() => orgs.id, { onDelete: "cascade" }),
  customer_id: uuid("customer_id").notNull().references(() => customers.id, { onDelete: "cascade" }),
  // 'customer' | 'office' — who sent it
  sender_role: text("sender_role").notNull(),
  sender_name: text("sender_name").notNull(),
  body: text("body"),
  // Supabase Storage path for photo attachment (null if text-only)
  photo_path: text("photo_path"),
  // null until office reads it
  read_by_office_at: timestamp("read_by_office_at", { withTimezone: true }),
  // null until customer reads it
  read_by_customer_at: timestamp("read_by_customer_at", { withTimezone: true }),
  created_at: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
}, (table) => [
  index("portal_messages_customer_id_idx").on(table.customer_id),
  index("portal_messages_org_id_idx").on(table.org_id),
  // RLS: office can SELECT/INSERT all messages for their org
  pgPolicy("portal_messages_office_policy", { for: "all", to: authenticatedRole,
    using: sql`org_id = (select auth.jwt() ->> 'org_id')::uuid
      AND (select auth.jwt() ->> 'user_role') IN ('owner', 'office')`,
  }),
  // RLS: customer can SELECT/INSERT their own thread
  pgPolicy("portal_messages_customer_policy", { for: "all", to: authenticatedRole,
    using: sql`
      org_id = (select auth.jwt() ->> 'org_id')::uuid
      AND (select auth.jwt() ->> 'user_role') = 'customer'
      AND customer_id IN (
        SELECT id FROM customers WHERE email = (select auth.email())
        AND org_id = (select auth.jwt() ->> 'org_id')::uuid
      )
    `,
  }),
]).enableRLS()
```

### `service_requests` table

```typescript
// src/lib/db/schema/service-requests.ts
export const serviceRequests = pgTable("service_requests", {
  id: uuid("id").defaultRandom().primaryKey(),
  org_id: uuid("org_id").notNull().references(() => orgs.id, { onDelete: "cascade" }),
  customer_id: uuid("customer_id").notNull().references(() => customers.id, { onDelete: "cascade" }),
  pool_id: uuid("pool_id").references(() => pools.id, { onDelete: "set null" }),
  // Work order created from this request (null until reviewed)
  work_order_id: uuid("work_order_id"),
  // Category: green_pool | opening_closing | repair | cleaning | chemical | other
  category: text("category").notNull(),
  description: text("description").notNull(),
  is_urgent: boolean("is_urgent").notNull().default(false),
  // Photo paths in Supabase Storage
  photo_paths: jsonb("photo_paths").$type<string[]>(),
  // Customer's preferred date (YYYY-MM-DD)
  preferred_date: text("preferred_date"),
  // 'morning' | 'afternoon' | 'anytime'
  preferred_time_window: text("preferred_time_window"),
  // Status: submitted | reviewed | scheduled | complete | declined
  status: text("status").notNull().default("submitted"),
  // Internal office notes
  office_notes: text("office_notes"),
  created_at: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  updated_at: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
}, (table) => [
  index("service_requests_org_id_idx").on(table.org_id),
  index("service_requests_customer_id_idx").on(table.customer_id),
  index("service_requests_status_idx").on(table.status),
  // RLS: office can see/manage all requests
  pgPolicy("service_requests_office_policy", { ... }),
  // RLS: customer can see/create their own requests
  pgPolicy("service_requests_customer_policy", { ... }),
]).enableRLS()
```

### `org_settings` additions

Add `brand_color text` column to `org_settings` for portal theming (hex value like `#1e9cc0`).

---

## Existing Codebase — What's Already There

| Component | Status | Notes |
|-----------|--------|-------|
| `/portal/layout.tsx` | Exists | Minimal wrapper, no auth |
| `/portal/login/page.tsx` | Exists but WRONG | Uses password auth — MUST replace with magic link |
| `/portal/(portal)/layout.tsx` | Exists | Auth guard works; needs org branding load from subdomain |
| `/portal/(portal)/page.tsx` | Exists (placeholder) | Has "Coming in Phase 8" cards — replace entirely |
| `PortalShell` | Exists | Has hardcoded "Your Pool Company" — needs real branding |
| `proxy.ts` / `updateSession` | Exists | Handles portal auth routing; needs subdomain extraction |
| `orgs.slug` column | Exists | Already in schema, used for portal URLs |
| `orgs.logo_url` column | Exists | Already in schema |
| `customers.stripe_customer_id` | Exists | All payment method updates reference this |
| `service_visits` (all data) | Exists | Chemistry readings, checklist, photos — all in DB |
| `visit_photos` table | Exists | Storage paths: `{org_id}/visits/{visit_id}/{filename}.webp` |
| `invoices` + `invoice_line_items` | Exists | Full invoice data available |
| `payment_records` | Exists | Payment history |
| Stripe Connect flow | Exists | Connected accounts, surcharges all implemented |
| `browser-image-compression` | Installed | Use for portal photo uploads |
| `resend` | Installed | Office notification emails on new message |
| `AuthUser` type | Exists | `{ id, email, role, org_id, full_name }` — extend for `customer_id` |

---

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| Magic link via `confirmationURL` redirect | PKCE with `token_hash` exchange | Supabase SSR v0.5+ | More secure for server-rendered apps; required for this project |
| Supabase Realtime postgres_changes for chat | Realtime Broadcast private channels | Supabase 2024 | Lower latency, scales better, explicit auth via RLS on realtime.messages |
| Wildcard favicon per tenant | Static favicon only | N/A | Next.js metadata doesn't support per-request favicon; skip for Phase 8 |
| Stripe Customer Portal (hosted by Stripe) | Custom portal with SetupIntent | Ongoing | Stripe Customer Portal would handle method update but is generic branding; custom is required here |

**Deprecated/outdated:**
- `signInWithPassword` in portal login: Phase 1 placeholder, must be replaced with `signInWithOtp`
- Disabled nav links in `PortalShell` (`cursor-not-allowed` spans): replace with real `<Link>` elements

---

## Open Questions

1. **Active org_id in JWT for multi-org customers**
   - What we know: JWT `org_id` claim must match the org whose data the customer is viewing; RLS checks it.
   - What's unclear: Should the active org be set via `app_metadata` update + session refresh, or via a separate mechanism (e.g. a short-lived token)?
   - Recommendation: Use `app_metadata` update + `supabase.auth.refreshSession()` on the client after company switch. This keeps the single-claim JWT model intact and avoids any custom token infrastructure.

2. **Office inbox page location**
   - What we know: Office needs to see all customer messages. User decision: "dedicated inbox page AND on customer profile tab."
   - What's unclear: Whether this belongs in the existing `/(app)/` staff routes (alongside Alerts, Dashboard) or is a new route.
   - Recommendation: Add as `/(app)/inbox/page.tsx` — consistent with the staff app route group. The customer profile tab (`/customers/[id]`) shows the thread specific to that customer.

3. **Photo paths for portal uploads (service requests + messages)**
   - What we know: Existing photos use `{org_id}/visits/{visit_id}/{filename}.webp`.
   - What's unclear: Whether portal photos (uploaded by customers) go in the same bucket or a separate one.
   - Recommendation: Same bucket (`company-assets`), new path prefix: `{org_id}/portal/requests/{request_id}/{filename}.webp` and `{org_id}/portal/messages/{message_id}/{filename}.webp`. Signed upload URLs keep it secure.

4. **Visit photo signed URL expiry**
   - What we know: Visit photos are in private Supabase Storage. Portal needs to display them to customers.
   - What's unclear: Signed URL expiry duration. Too short → photos expire mid-session; too long → minor security risk.
   - Recommendation: Generate signed URLs server-side in the portal data action with 1-hour expiry. Re-fetch on page load, not on every render.

---

## Sources

### Primary (HIGH confidence)
- Supabase official docs — `signInWithOtp`, `shouldCreateUser`, PKCE flow, magic link config: https://supabase.com/docs/guides/auth/auth-email-passwordless
- Supabase official docs — Realtime Authorization, private channels, RLS on `realtime.messages`: https://supabase.com/docs/guides/realtime/authorization
- Supabase official docs — Custom Access Token Hook: https://supabase.com/docs/guides/auth/auth-hooks/custom-access-token-hook
- Supabase official docs — Realtime postgres_changes + Broadcast: https://supabase.com/docs/guides/realtime/subscribing-to-database-changes
- Stripe official docs — SetupIntents, off_session usage: https://docs.stripe.com/payments/save-and-reuse
- Stripe official docs — Save customer payment methods: https://docs.stripe.com/payments/save-customer-payment-methods
- Codebase: `src/lib/supabase/proxy.ts` — existing auth routing middleware
- Codebase: `src/app/portal/(portal)/layout.tsx` — existing portal auth guard
- Codebase: `src/app/pay/[token]/page.tsx` — established `adminDb` pattern for customer-facing pages
- Codebase: `src/lib/db/schema/` — all existing table/RLS definitions

### Secondary (MEDIUM confidence)
- Next.js subdomain routing patterns — middleware host extraction, `NextResponse.rewrite`: multiple verified community guides consistent with official Next.js docs
- yet-another-react-lightbox official site + npm — React 19 support, Next.js integration confirmed: https://yet-another-react-lightbox.com/examples/nextjs

### Tertiary (LOW confidence)
- Multi-org JWT claim management via `app_metadata` array — community discussion pattern, no official single-source documentation: https://github.com/orgs/supabase/discussions/20732

---

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH — all libraries already in project or well-documented (yet-another-react-lightbox)
- Architecture: HIGH — built on verified existing patterns (adminDb for customer pages, proxy.ts for routing)
- Multi-org auth model: MEDIUM — pattern is sound but involves custom app_metadata management without a Supabase-blessed reference implementation
- Pitfalls: HIGH — most are documented in MEMORY.md or traced from existing code patterns

**Research date:** 2026-03-13
**Valid until:** 2026-04-13 (30 days — stable APIs)
