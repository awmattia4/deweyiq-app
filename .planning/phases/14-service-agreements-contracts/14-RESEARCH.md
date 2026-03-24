# Phase 14: Service Agreements & Contracts — Research

**Researched:** 2026-03-24
**Domain:** Contract lifecycle management, e-signature, PDF generation, token-based approval, recurring billing setup
**Confidence:** HIGH — all core infrastructure already exists in the codebase; this phase is primarily composition, not new technology

---

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions

**Phase boundary:**
- Create, send, and manage formal recurring service agreements
- Customers e-sign from a secure link, acceptance auto-creates schedule rule and billing setup
- Agreements track full lifecycle: active, paused, renewed, cancelled
- Reuses: PDF generation (Phase 6 pattern), token-based approval pages (quote pattern), email delivery (Resend), schedule rules (Phase 4), billing models (Phase 7)
- NOT about quotes or invoicing — this is the governing agreement for ongoing service

**Agreement builder UX:**
- Can start from a reusable template OR build from scratch — templates are optional time-savers
- Agreement templates managed in Settings (e.g. "Standard Weekly Service", "Premium Monthly")
- Multi-pool per agreement — one agreement can cover multiple pools for the same customer, each with its own frequency and services
- Three pricing models supported: monthly flat rate, per-visit, and tiered (first N visits at $X, additional at $Y) — selectable per pool within the agreement

**Agreement document & terms:**
- DeweyIQ provides default terms/conditions text out of the box — companies customize from there
- Terms editable at both levels: template sets defaults, office can override on individual agreements
- Agreement includes a detailed service checklist showing exactly what's included per visit (skim, vacuum, brush, chemicals, etc.)

**Customer approval flow:**
- Approval page shows key terms summary (services, price, term) at top with a link to download the full PDF — not the entire agreement inline
- E-signature supports both options: type full name OR draw signature on canvas — both legally valid, system captures name, timestamp, IP, user agent
- Decline flow: one-click decline with optional text field for feedback — office gets notified of decline and can see reason if provided

**Lifecycle management:**
- Cancellation notice period: company-wide default in settings (applied to all agreements, can be 0 for immediate)
- Auto-renew by default — agreements auto-renew unless office or customer opts out, renewal reminders sent before expiry
- Amendments depend on change type: price/term changes require customer re-sign, minor service adjustments take effect with notification only

**Structural decisions:**
- Service checklist in the agreement should pull from the existing service requirements system (Phase 3 checklists)
- Agreement manager page should live under a top-level nav item (not buried in settings)
- Reuse the quote approval page pattern (token-based, no auth required, branded) — same infrastructure, different content
- Reuse @react-pdf/renderer for agreement PDF generation

### Claude's Discretion

- Agreement builder form layout (wizard vs scrollable vs hybrid)
- PDF section structure and legal language depth
- Approval link expiration policy
- Pause behavior (stops + billing suspension approach)
- Auto-provisioning logic details (how schedule rules and billing models are created on acceptance)
- Amendment change-type classification (what's "major" requiring re-sign vs "minor" requiring notification only)
- Renewal reminder lead times and notification cadence
- Agreement compliance tracking approach (missed stops vs. agreed frequency)

### Deferred Ideas (OUT OF SCOPE)

None — discussion stayed within phase scope
</user_constraints>

---

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|-----------------|
| AGREE-01 | Office creates recurring service agreement — selecting pool(s), frequency, services checklist, pricing model, and term length | Schema: `service_agreements` + `agreement_pool_entries` tables; builder wizard component; pulls from `pools`, `checklist_tasks`, `schedule_rules` |
| AGREE-02 | Office generates professional agreement PDF from customizable templates | Reuse `@react-pdf/renderer` pattern from `quote-pdf.tsx`; new `agreement-pdf.tsx`; `agreement_templates` in settings |
| AGREE-03 | System sends agreement to customer via email with secure approval link | Reuse `signQuoteToken` pattern → `signAgreementToken`; new `agreement-email.tsx`; Resend with PDF attachment |
| AGREE-04 | Customer can review, e-sign (name + date + IP capture), and accept or decline from approval page | Reuse `QuoteApprovalPage` pattern; add canvas draw mode via `react-signature-canvas` (already installed); POST to `/api/agreements/[id]/sign` |
| AGREE-05 | Accepted agreement auto-creates schedule rule and sets up recurring billing | Server action triggered from sign handler: `createScheduleRule()` + set `customer.billing_model` per pool entry; mirrors quote→WO auto-conversion |
| AGREE-06 | Office views all agreements in agreement manager — filterable by status, customer, expiration | New `/agreements` page (top-level nav); server component + client filters; `PAGE_TITLES` entry required |
| AGREE-07 | System supports full lifecycle: pause/resume, cancel, expire, auto-renew | Status state machine on `service_agreements.status`; pause: deactivate schedule rules + flag billing; cancel: notice period from `org_settings.agreement_notice_period_days`; expire: cron check; auto-renew: cron before expiry |
| AGREE-08 | System sends renewal reminders before expiration — configurable lead time | Cron route `/api/cron/agreement-renewal` (mirrors dunning pattern); reads `agreement_renewal_lead_days` from `org_settings`; sends email via Resend |
| AGREE-09 | Office can amend active agreement — creates new version, sends for customer re-sign, preserves history | Versioned amendment model: `agreement_amendments` table; major vs minor classification; amendment approval reuses sign flow |
| AGREE-10 | Customer portal displays active agreements | Data model must include `customer_id` FK; portal page reads via `adminDb`; implementation deferred to Phase 17+ portal build |
| AGREE-11 | Agreement templates fully customizable per company — terms, cancellation policy, liability language, branding | `agreement_templates` table in settings (same org-scoped pattern); Settings "Agreements" tab |
| AGREE-12 | System tracks compliance — flags missed stops against agreed frequency, alerts if pricing doesn't match billed | Compliance check in cron or alert generation: compare `schedule_rules` completions vs `service_agreements` frequency; compare `invoices` total vs agreement price |
</phase_requirements>

---

## Summary

Phase 14 is almost entirely composition of existing infrastructure. The codebase already has: JWT-signed public tokens (jose), @react-pdf/renderer with server-side rendering, React Email + Resend for email delivery, schedule rules (Phase 4), billing models on customers (Phase 7), canvas signature via `react-signature-canvas` (already installed), alert system, push notifications, dunning cron pattern, and notification templates. No new npm packages are required.

The new work is: two new DB tables (`service_agreements`, `agreement_pool_entries`) with optional `agreement_templates` and `agreement_amendments` tables, a new JWT token utility (`agreement-token.ts`), a new public approval page (`/agreement/[token]`), a new `agreement-pdf.tsx`, a new email template, server actions for the full lifecycle, a new top-level `/agreements` page, a cron route for renewal reminders, compliance check logic wired into the alert system, and new `org_settings` fields for agreement defaults.

The most design-intensive parts are: the agreement builder UI (multi-pool, multi-frequency per pool, tiered pricing inputs), the PDF document structure (legal sections appropriate for pool service industry), and the auto-provisioning logic on acceptance (per-pool schedule rule creation + billing model assignment).

**Primary recommendation:** Model the entire phase as "quotes + schedule rules combined" — the token, approval page, PDF, and email patterns copy from Phase 6; the acceptance handler copies from Phase 4 schedule rule creation. The new DB surface is narrow.

---

## Standard Stack

### Core (all already installed — no new dependencies required)

| Library | Version (in package.json) | Purpose | Why Standard |
|---------|--------------------------|---------|--------------|
| `jose` | bundled with Next.js | JWT signing/verification for public agreement tokens | Same pattern as `quote-token.ts`, `pay-token.ts`, `report-token.ts` |
| `@react-pdf/renderer` | installed | Server-side agreement PDF generation | Already configured in `next.config.ts` with `serverExternalPackages` |
| `@react-email/components` + `resend` | installed | Agreement email delivery | Same pattern as all 12+ existing email templates |
| `react-signature-canvas` | installed | Canvas-based draw signature on approval page | Already in `package.json`; same lib used elsewhere |
| `drizzle-orm` | installed | ORM for new agreement schema tables | Project standard |
| Supabase `adminDb` | configured | All public-facing (unauthenticated) DB ops | Mandatory per pitfall in `quote/[token]/page.tsx` — customer has no Supabase session |

### Supporting

| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| `sonner` | installed | Toast notifications after agreement actions | Same usage as billing page |
| `lucide-react` | installed | Icons in agreement manager | Project standard |
| `@tanstack/react-table` | installed | Agreement manager list table with filters/sorting | Same pattern as billing/work-orders pages |

### Alternatives Considered

| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| `react-signature-canvas` (already installed) | `signature_pad` | No reason to add another library — react-signature-canvas is already installed |
| Versioned agreement rows (like quotes) | Separate amendment table | Amendment table is cleaner for history; simpler to query "current version" |
| JSONB for pool entries | Separate `agreement_pool_entries` table | Separate table allows per-pool FK to `pools`, proper queries, and future pool-level billing |

**Installation:** No new packages required. Everything is already in `package.json`.

---

## Architecture Patterns

### Recommended Project Structure

```
src/
├── lib/
│   ├── db/schema/
│   │   ├── service-agreements.ts      # agreements + pool entries tables
│   │   └── agreement-templates.ts     # org-level reusable templates
│   ├── agreements/
│   │   └── agreement-token.ts         # JWT sign/verify (mirrors quote-token.ts)
│   ├── pdf/
│   │   └── agreement-pdf.tsx          # @react-pdf/renderer document component
│   └── emails/
│       └── agreement-email.tsx        # React Email template
├── actions/
│   └── agreements.ts                  # All server actions for agreement CRUD + lifecycle
├── app/
│   ├── agreement/
│   │   └── [token]/
│   │       └── page.tsx               # Public approval page (no auth, adminDb)
│   ├── api/
│   │   ├── agreements/
│   │   │   └── [id]/
│   │   │       ├── sign/route.ts      # POST: accept/decline/sign
│   │   │       └── pdf/route.ts       # GET: authenticated PDF download
│   │   └── cron/
│   │       └── agreement-renewal/route.ts  # Daily renewal reminder scan
│   └── (app)/
│       └── agreements/
│           ├── page.tsx               # Agreement manager (top-level nav)
│           └── [id]/
│               └── page.tsx           # Agreement detail page
└── components/
    └── agreements/
        ├── agreement-builder.tsx      # Multi-pool agreement builder (wizard)
        ├── agreement-approval-page.tsx # Customer-facing approval component
        └── agreement-manager.tsx      # Agreement list with filters
```

### Pattern 1: Token-Based Public Approval (copy from quote pattern)

**What:** JWT signed with `AGREEMENT_TOKEN_SECRET` env var (separate secret per token type). Verified at page load. Uses `adminDb` for all DB access — customer has no Supabase session.

**When to use:** Any time an unauthenticated customer needs to act on an agreement.

**Example:**
```typescript
// src/lib/agreements/agreement-token.ts — mirrors quote-token.ts exactly
import { SignJWT, jwtVerify, type JWTPayload } from "jose"

interface AgreementTokenPayload extends JWTPayload {
  agreementId: string
}

export async function signAgreementToken(agreementId: string): Promise<string> {
  const secret = new TextEncoder().encode(process.env.AGREEMENT_TOKEN_SECRET)
  return new SignJWT({ agreementId })
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime("180d")  // 180 days — covers long agreement terms
    .sign(secret)
}

export async function verifyAgreementToken(token: string): Promise<{ agreementId: string } | null> {
  try {
    const secret = new TextEncoder().encode(process.env.AGREEMENT_TOKEN_SECRET)
    const { payload } = await jwtVerify(token, secret)
    const p = payload as AgreementTokenPayload
    if (!p.agreementId || typeof p.agreementId !== "string") return null
    return { agreementId: p.agreementId }
  } catch { return null }
}
```

**Token expiration policy (Claude's discretion):** 180 days. Agreement terms are 30 days to 12 months; the token must outlive the typical decision window. If a token expires before a customer acts, the office re-sends (same as quote re-send flow).

### Pattern 2: Agreement PDF Generation

**What:** Server-side PDF using `@react-pdf/renderer`. Called from `/api/agreements/[id]/pdf` (authenticated, office/owner only) and attached to outbound email.

**When to use:** Generating the agreement document for download/attachment.

**Critical:** Must use `serverExternalPackages: ["@react-pdf/renderer"]` in `next.config.ts` — **already configured**. All colors must be hex, not oklch (same constraint as existing PDFs).

**Example pattern (from `/api/quotes/[id]/pdf/route.ts`):**
```typescript
import { createElement } from "react"
import { renderToBuffer } from "@react-pdf/renderer"
import { AgreementDocument } from "@/lib/pdf/agreement-pdf"

const buffer = await renderToBuffer(createElement(AgreementDocument, documentProps) as any)
const uint8Array = new Uint8Array(buffer)
return new Response(uint8Array, {
  headers: { "Content-Type": "application/pdf", "Content-Disposition": `attachment; filename="agreement-${agreementNumber}.pdf"` }
})
```

**PDF section structure (Claude's discretion — pool service industry standard):**
1. Header: Company logo + name, "Service Agreement", agreement number, date, term dates
2. Parties: Company name/address + Customer name/service address
3. Scope of Service: Per-pool table (pool name, type, frequency, services checklist per visit)
4. Pricing & Billing: Pricing model breakdown per pool; total monthly/visit cost; payment terms
5. Term & Renewal: Start date, end date, auto-renew clause, cancellation notice period
6. Service Obligations: What company commits to; what customer commits to (access, chemicals top-up)
7. Cancellation Policy: Notice period, early termination language
8. Liability Waiver: Standard pool service limitation of liability
9. Payment Terms: Due dates, late fees, autopay authorization (if applicable)
10. Governing Law: State-level jurisdiction (left as placeholder for company to fill)
11. Signature Block: Customer name, signature image/typed name, date, IP captured in DB (not printed)

### Pattern 3: On-Acceptance Auto-Provisioning (AGREE-05)

**What:** When a customer signs, the server action runs 3 things atomically:
1. Mark `service_agreements.status = 'active'`, store signature data
2. For each `agreement_pool_entry`: create/update a `schedule_rules` row
3. For each pool entry: update `customers.billing_model` + `flat_rate_amount` (or per-visit rate) as appropriate

**When to use:** The sign API route (`/api/agreements/[id]/sign`) POSTs back, same as quote approve route.

**Key decision — billing setup:** The agreement captures the pricing model per-pool but the actual billing (invoice generation) still happens via the existing billing/dunning system. The agreement creates the `schedule_rules` and sets `billing_model` on the customer — the existing monthly invoice generation then picks up the correct model. No new billing engine needed.

**Example (mirrors `_handleApprove` in quote approve route):**
```typescript
// In /api/agreements/[id]/sign/route.ts
// For each pool_entry in agreement.pool_entries:
await adminDb.insert(scheduleRules).values({
  org_id: agreement.org_id,
  customer_id: agreement.customer_id,
  pool_id: entry.pool_id,
  frequency: entry.frequency,
  anchor_date: entry.start_date,
  preferred_day_of_week: entry.preferred_day_of_week,
  checklist_template_id: entry.checklist_template_id,
  active: true,
})
// Update customer billing model
await adminDb.update(customers)
  .set({ billing_model: entry.pricing_model, flat_rate_amount: entry.monthly_amount })
  .where(eq(customers.id, agreement.customer_id))
```

### Pattern 4: Cron-Based Renewal Reminders (AGREE-08)

**What:** Daily cron route that scans for agreements expiring within the configured lead time and sends renewal reminder emails. Mirrors `dunning` cron pattern exactly.

**When to use:** `/api/cron/agreement-renewal/route.ts` — called by Supabase pg_cron or Vercel cron.

```typescript
// src/app/api/cron/agreement-renewal/route.ts
export async function POST(req: NextRequest) {
  if (req.headers.get("authorization") !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }
  const result = await runAgreementRenewalScan()
  return NextResponse.json({ success: true, ...result })
}
```

**Renewal lead times (Claude's discretion):** Default 30 days. Options stored in `org_settings.agreement_renewal_lead_days` (array: [30, 7] → send at 30 days AND 7 days before). Last-reminder flag (`renewal_reminder_sent_at`) on agreement row prevents duplicate sends.

### Pattern 5: Dual Signature Mode (AGREE-04)

**What:** The approval page offers two signature input modes — typed name (same as current quote approval) OR canvas draw. Both are legally valid. `react-signature-canvas` handles the canvas mode.

**Implementation:**
```typescript
import SignatureCanvas from "react-signature-canvas"

// Canvas ref
const sigRef = useRef<SignatureCanvas>(null)

// On submit: get base64 PNG from canvas
const signatureImageBase64 = sigRef.current?.getTrimmedCanvas().toDataURL("image/png")
```

The `signature_image_base64` is stored in the `service_agreements` table for the customer's drawn signature. For typed names, store in `signature_name` (same as quotes). The approval page detects both modes and validates that at least one is filled before allowing submission.

### Pattern 6: Agreement Lifecycle State Machine

**Statuses:** `draft` → `sent` → `active` | `declined` → `paused` ↔ `active` → `expired` | `cancelled`

```
draft → sent (office sends) → active (customer signs) → paused (office pauses) → active (office resumes)
                            → declined (customer declines)
active → expired (cron: end_date reached + auto_renew=false)
active → cancelled (office cancels, respects notice_period_days)
expired → active (office renews, customer re-signs if needed)
active → amended (office amends) → active (amendment signed, new version)
```

**Pause behavior (Claude's discretion):**
- Sets all linked `schedule_rules.active = false` (stops are not generated)
- Does NOT generate invoices for the paused period (billing model on customer is preserved but invoice cron skips paused agreements)
- `paused_at` + `paused_reason` stored on agreement for audit
- Resuming: re-activates schedule rules, sets a new `anchor_date` = today (or next Monday)

### Pattern 7: Amendment Versioning (AGREE-09)

**Version model:** Each amendment creates a new row in `agreement_amendments` with `version_number` incrementing. The parent `service_agreements` row always reflects current state. Previous versions retained for audit.

**Amendment classification (Claude's discretion):**

| Change Type | Category | Customer Action Required |
|------------|----------|--------------------------|
| Price change (any amount) | Major | Re-sign |
| Term length change | Major | Re-sign |
| Frequency change (weekly → biweekly) | Major | Re-sign |
| Add/remove a pool | Major | Re-sign |
| Service checklist item addition | Minor | Email notification only |
| Service checklist item removal | Minor | Email notification only |
| Assigned tech change | Minor | No notification |
| Preferred service day change | Minor | Email notification only |

### Anti-Patterns to Avoid

- **Do NOT store pool entries in JSONB:** Use a separate `agreement_pool_entries` table with proper FKs to `pools`. JSONB loses referential integrity and makes queries awkward.
- **Do NOT reuse the same JWT secret as quotes:** Use `AGREEMENT_TOKEN_SECRET` (separate env var). Same pattern as all other token types.
- **Do NOT use `withRls()` on the public approval page:** Customer has no Supabase session. Use `adminDb` for all reads/writes from `/agreement/[token]` and `/api/agreements/[id]/sign`.
- **Do NOT call `router.refresh()` to update agreement list after mutations:** Server actions must return fresh data and call `setState(result.data)` directly. Same pitfall as invoice mutations.
- **Do NOT use oklch in PDF styles:** Only hex colors in `@react-pdf/renderer`. Already established constraint.
- **Do NOT forget PAGE_TITLES:** Add `/agreements` to the `PAGE_TITLES` map in `app-header.tsx`.

---

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| JWT signing for approval tokens | Custom token format | `jose` (already used) | Handles expiry, signature verification, algorithm selection |
| PDF rendering | HTML-to-PDF conversion | `@react-pdf/renderer` (already installed + configured) | Already handles serverExternalPackages edge, generates proper print-quality PDFs |
| Email delivery | SMTP client | `resend` (already installed) | Pre-authenticated, handles bounces, delivery tracking |
| Canvas signature | Custom canvas drawing | `react-signature-canvas` (already installed) | Handles touch, pressure, clear/undo, base64 export |
| Public page auth | Session cookies | Token-in-URL (JWT) | Customer has no Supabase session; URL token IS the authorization |

**Key insight:** This phase adds virtually no new technology. The 8–10 new files map 1:1 to existing files from Phase 6. The planner should treat each new file as "create this like [existing file] but for agreements."

---

## Common Pitfalls

### Pitfall 1: adminDb on Public Agreement Routes

**What goes wrong:** Using `withRls()` on the `/agreement/[token]` page or `/api/agreements/[id]/sign` endpoint causes empty query results — customer has no Supabase auth session, so JWT claims are null, and all RLS policies fail.

**Why it happens:** `withRls()` passes the user's JWT to Postgres to satisfy RLS policies. Customers don't have a Supabase login.

**How to avoid:** Use `adminDb` (service role) for all reads/writes from unauthenticated routes. See `src/app/quote/[token]/page.tsx` comment: "Uses adminDb for all DB access — customer has no Supabase auth session."

**Warning signs:** Empty arrays returned from queries despite data existing in the DB; no error thrown.

### Pitfall 2: Dynamic Slug Conflicts

**What goes wrong:** If the agreement approval route and agreement API route use different param names at the same directory level, Next.js throws `"You cannot use different slug names for the same dynamic path"` and crashes the app.

**Why it happens:** `app/api/agreements/[token]/sign` and `app/api/agreements/[id]/pdf` at the same `[...]` level would conflict.

**How to avoid:** Use `[id]` for ALL routes under `app/api/agreements/[id]/`. Extract the token value as `const token = (await params).id`. This is explicitly documented in project memory.

**Warning signs:** App crashes on startup with slug conflict error.

### Pitfall 3: Agreement Token Expiry vs. Link Expiry

**What goes wrong:** Using a short JWT expiry (e.g. 30 days) means customers can't sign if they wait. The DB tracks the actual agreement term — the JWT just needs to outlive typical customer response time.

**Why it happens:** Confusing "quote expiry" (business rule) with "token expiry" (security mechanism).

**How to avoid:** Set JWT expiry to 180 days (generous). Track actual agreement expiry in `service_agreements.end_date` (business rule enforced in server-side check before allowing sign action).

### Pitfall 4: Missing Fields After Auto-Provisioning

**What goes wrong:** On acceptance, schedule rules get created but the route system doesn't pick them up because the tech isn't assigned, or the anchor_date is wrong timezone (see MEMORY: toISOString pitfall).

**Why it happens:** `scheduleRules.anchor_date` is `text` in `YYYY-MM-DD` format. Using `new Date().toISOString().split("T")[0]` returns tomorrow's date at 9pm EST.

**How to avoid:** Use `toLocalDateString()` from `@/lib/date-utils` for all anchor_date values. The agreement captures `start_date` in local date format — use that directly.

### Pitfall 5: AGREE-05 Idempotency

**What goes wrong:** Customer double-taps the sign button, or network retry causes two sign POSTs. Two schedule rules get created for the same pool.

**Why it happens:** No guard against duplicate sign submissions.

**How to avoid:** Guard in the sign handler: check `service_agreements.status !== 'sent'` before processing (same pattern as quote approve handler line 94-108). On conflict, return 409 with appropriate message.

### Pitfall 6: Compliance Check False Positives (AGREE-12)

**What goes wrong:** Agreement compliance check flags "missed stops" during paused periods or when a stop was skipped with a valid reason.

**Why it happens:** Naive comparison of expected frequency vs. completed stops doesn't account for pauses, skips, or seasonal gaps.

**How to avoid:** Compliance check should: (1) only scan agreements with `status = 'active'` (not paused/cancelled), (2) exclude route stops where `skipped = true` or `skip_reason IS NOT NULL`, (3) use a rolling window (last 30 days) rather than counting from agreement start.

---

## Code Examples

Verified patterns from existing codebase:

### Reusable Token Pattern (High confidence — from source files)
```typescript
// src/lib/agreements/agreement-token.ts — copy of quote-token.ts with renamed vars
// Token expiry: 180d (longer than quote's 90d to cover 12-month agreement terms)
// Secret: AGREEMENT_TOKEN_SECRET env var
```

### PDF Render Route Pattern
```typescript
// From /api/quotes/[id]/pdf/route.ts — copy this pattern exactly
const buffer = await renderToBuffer(createElement(AgreementDocument, documentProps) as any)
const uint8Array = new Uint8Array(buffer)
return new Response(uint8Array, {
  status: 200,
  headers: {
    "Content-Type": "application/pdf",
    "Content-Disposition": `attachment; filename="agreement-${agreementNumber}.pdf"`,
    "Cache-Control": "private, no-cache",
  },
})
```

### Canvas Signature (react-signature-canvas, already installed)
```typescript
import SignatureCanvas from "react-signature-canvas"
const sigRef = useRef<SignatureCanvas>(null)
// Capture:
const dataUrl = sigRef.current?.getTrimmedCanvas().toDataURL("image/png")
// Clear:
sigRef.current?.clear()
// Check if signed:
const isEmpty = sigRef.current?.isEmpty()
```

### Cron Route Pattern (from dunning cron)
```typescript
// POST handler with CRON_SECRET bearer token guard
// Calls runAgreementRenewalScan() action
// Returns { success: true, processed: N, emailsSent: N }
```

### Activity Log JSONB Append (from quote approve handler)
```typescript
const activityEvent = JSON.stringify([{
  type: "agreement_signed",
  at: now.toISOString(),
  by_id: null,
  note: `Customer signed agreement. Signed as: ${signatureName}`,
}])
await adminDb.update(serviceAgreements)
  .set({ activity_log: sql`COALESCE(activity_log, '[]'::jsonb) || ${activityEvent}::jsonb` })
  .where(eq(serviceAgreements.id, agreementId))
```

---

## Database Schema Design

### New Tables Required

#### `service_agreements` — Core agreement table
```typescript
// Columns:
// id, org_id, customer_id, agreement_number (text, e.g. "SA-0001")
// status: 'draft' | 'sent' | 'active' | 'paused' | 'expired' | 'cancelled' | 'declined'
// term_type: 'month_to_month' | '6_month' | '12_month'
// start_date: text (YYYY-MM-DD)
// end_date: text (YYYY-MM-DD, nullable for month-to-month)
// auto_renew: boolean (default true)
// template_id: uuid FK → agreement_templates (nullable — null = built from scratch)
// terms_and_conditions: text (customized for this agreement)
// cancellation_policy: text
// liability_waiver: text
// internal_notes: text (office-only, not shown to customer)
// version: integer (increments on amendment)
// sent_at, signed_at, declined_at, cancelled_at, paused_at, renewed_at
// signature_name: text (typed name)
// signature_image_base64: text (canvas draw — large, consider storage)
// signature_ip: text
// signature_user_agent: text
// decline_reason: text
// activity_log: jsonb (audit trail)
// renewal_reminder_sent_at: timestamp (last reminder sent — prevents duplicates)
// created_at, updated_at
```

#### `agreement_pool_entries` — Per-pool service configuration within an agreement
```typescript
// Columns:
// id, agreement_id FK → service_agreements, pool_id FK → pools
// frequency: 'weekly' | 'biweekly' | 'monthly' | 'custom'
// custom_interval_days: integer (nullable)
// preferred_day_of_week: integer (0-6)
// pricing_model: 'monthly_flat' | 'per_visit' | 'tiered'
// monthly_amount: numeric (for monthly_flat)
// per_visit_amount: numeric (for per_visit)
// tiered_threshold_visits: integer (for tiered — first N visits)
// tiered_base_amount: numeric (for tiered — price per visit up to threshold)
// tiered_overage_amount: numeric (for tiered — price per visit above threshold)
// checklist_task_ids: jsonb (array of task IDs included in each visit)
// notes: text
// schedule_rule_id: uuid FK → schedule_rules (set on acceptance — the provisioned rule)
```

#### `agreement_templates` — Reusable org-level templates
```typescript
// Columns:
// id, org_id, name (e.g. "Standard Weekly Service")
// default_term_type: text
// default_frequency: text
// default_pricing_model: text
// default_monthly_amount: numeric
// terms_and_conditions: text (full default T&C)
// cancellation_policy: text
// liability_waiver: text
// service_description: text
// is_active: boolean
// created_at, updated_at
```

#### `agreement_amendments` — Version history for amendments (AGREE-09)
```typescript
// Columns:
// id, agreement_id FK → service_agreements
// version_number: integer
// amendment_type: 'major' | 'minor'
// change_summary: text
// changed_by_id: uuid FK → profiles
// status: 'pending_signature' | 'signed' | 'rejected'
// signed_at, rejected_at
// snapshot_json: jsonb (full agreement state at this version)
// created_at
```

### New org_settings Columns (add to existing table)
```typescript
// Agreement defaults
agreement_notice_period_days: integer (default: 30) — cancellation notice
agreement_renewal_lead_days: jsonb (default: [30, 7]) — when to send renewal reminders
next_agreement_number: integer (default: 1) — for SA-XXXX numbering
agreement_number_prefix: text (default: "SA")
```

### New Env Var Required
```
AGREEMENT_TOKEN_SECRET=<32+ char random string>
# Generate: openssl rand -hex 32
```

---

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| Hand-drawn signature on paper | react-signature-canvas base64 PNG stored in DB | Phase 14 (new) | Legally valid e-signature with timestamp + IP |
| Separate PDF library setup needed | @react-pdf/renderer already configured | Phase 6 | No setup work; just create new document component |
| CRON_SECRET pattern established | Same CRON_SECRET for all cron routes | Phase 7 dunning | Renewal cron reuses same secret |

**No deprecated patterns apply to this phase** — all infrastructure is from recent phases and current.

---

## Open Questions

1. **Signature image storage: DB vs Supabase Storage**
   - What we know: Base64 PNG of a signature is typically 5–30KB. The DB already stores `jsonb` blobs this large in other contexts.
   - What's unclear: At scale (thousands of agreements), storing base64 in Postgres may be slow to query if other columns are needed but signature column is loaded.
   - Recommendation: Store in Postgres `text` column for simplicity in Phase 14. Add a migration to move to Supabase Storage in a later phase if performance becomes an issue. For planning: `signature_image_base64` column on `service_agreements`.

2. **AGREE-10 (Customer Portal) scope in this phase**
   - What we know: Customer portal is Phase 17+. But data model must support it.
   - What's unclear: Does "ensure the data model supports it" mean any UI work now?
   - Recommendation: Zero UI work for AGREE-10 in Phase 14. The `service_agreements` table has `customer_id` FK — that's sufficient for future portal queries. Mark AGREE-10 as "data model complete, UI deferred to Phase 17."

3. **AGREE-12 Compliance tracking implementation approach**
   - What we know: Need to flag when service frequency isn't being met.
   - What's unclear: Real-time alert (triggers at missed stop) vs. daily batch scan.
   - Recommendation: Add compliance check to the existing missed-stop alert generation flow (Phase 5 alerts). When a `route_stop` is marked missed, cross-reference the customer's active agreement. If the pattern shows 2+ consecutive misses in the agreement period, generate a `compliance_breach` alert. This avoids a new cron job.

---

## Sources

### Primary (HIGH confidence)
- **Codebase — `src/lib/quotes/quote-token.ts`**: JWT signing pattern verified directly
- **Codebase — `src/app/api/quotes/[id]/approve/route.ts`**: Full approval/decline/auto-provision pattern
- **Codebase — `src/app/api/quotes/[id]/pdf/route.ts`**: PDF generation route pattern
- **Codebase — `src/app/quote/[token]/page.tsx`**: Public approval page pattern with adminDb note
- **Codebase — `src/lib/db/schema/quotes.ts`**: Schema column pattern to mirror
- **Codebase — `src/lib/db/schema/schedule-rules.ts`**: Schedule rule columns for auto-provisioning
- **Codebase — `src/lib/db/schema/org-settings.ts`**: Where new org_settings columns go
- **Codebase — `src/lib/db/schema/notification-templates.ts`**: Template table pattern
- **Codebase — `src/app/api/cron/dunning/route.ts`**: Cron route + CRON_SECRET pattern
- **Codebase — `package.json`**: Verified `react-signature-canvas` is already installed
- **Codebase — `next.config.ts`**: Verified `serverExternalPackages: ["@react-pdf/renderer"]` is already configured

### Secondary (MEDIUM confidence)
- **react-signature-canvas**: Standard canvas signature library; base64 PNG export via `getTrimmedCanvas().toDataURL()`; `isEmpty()` for validation check
- **Pool service agreement legal sections**: Industry standard structure (parties, scope, pricing, term, cancellation, liability, governing law, signature) — standard across pool service industry

### Tertiary (LOW confidence)
- **Tiered pricing model implementation**: No existing implementation in codebase to reference. Design follows common pool service billing patterns (first 4 visits/month at base rate, additional at overage rate). Needs careful UI design in builder.

---

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH — all libraries verified in package.json and already in use
- Architecture: HIGH — all patterns copied from verified existing files in codebase
- DB schema: HIGH — follows identical patterns from quotes, schedule_rules, notification_templates
- Pitfalls: HIGH — directly derived from project MEMORY.md and existing code comments
- Tiered pricing UI: MEDIUM — no existing reference; needs design during planning

**Research date:** 2026-03-24
**Valid until:** 2026-04-24 (stable domain — 30 days)
