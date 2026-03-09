# Phase 5: Office Operations & Dispatch - Research

**Researched:** 2026-03-09
**Domain:** Transactional email (React Email + Resend), SMS (Twilio via Supabase Edge Function), alerts dashboard, company service settings
**Confidence:** HIGH (core stack), MEDIUM (Twilio Deno pattern), HIGH (architecture)

---

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions

#### Pre-arrival notifications
- Trigger: Route-start based — notification fires when the tech starts their route for the day, not on a schedule timer
- Message content: Simple and short — "Hi [Name], your pool tech [Tech] is heading your way. You're stop #3 on today's route."
- Channel: SMS preferred (via Twilio), email fallback if no phone number on file
- Opt-out: Per-customer toggle on the customer profile, default enabled
- No ETA calculation needed — just route position info

#### Service report delivery
- Email content: Summary in email body (tech name, date, pool status snapshot), full detailed report behind a "View Full Report" link
- Template: Replace Phase 3 HTML report with new React Email branded template — cleaner, more maintainable, better mobile rendering
- Timing: Immediate — report email fires within minutes of stop completion
- No email on file: Skip silently — report is still viewable in app. No error, no office alert for missing email

#### Alerts dashboard
- Alert types (Phase 5): Missed stops, declining chemical trends (3+ visits), incomplete service data. NOT overdue invoices (Phase 7)
- Layout: Single priority-sorted feed with filter chips to narrow by alert type
- Alert actions: Dismiss (permanently remove from active list) or Snooze (reappear after configurable delay if unresolved)
- Visibility: Red badge count on sidebar Alerts nav item + summary card on main dashboard showing active alert count by type

#### Service settings & requirements
- Chemistry requirements: Configurable per sanitizer type (e.g., salt pools require salt reading, chlorine pools require free chlorine + pH)
- Checklist requirements: Also configurable — owner sets which checklist items are required for stop completion
- Enforcement: Warn but allow — tech sees warning listing missing required items, can override and complete anyway. Override generates an "incomplete service data" alert for office
- Settings UI: Dedicated "Company Settings" page accessible from sidebar — sections for notifications, service requirements, and company profile

### Claude's Discretion
- Snooze duration options (1 hour, 1 day, 1 week, etc.)
- Chemical trend detection algorithm (simple slope, moving average, etc.)
- React Email component structure and layout details
- Alert priority scoring logic
- Settings page section ordering and form layout
- Twilio SMS integration specifics (number provisioning, message formatting)

### Deferred Ideas (OUT OF SCOPE)
- Overdue invoice alerts — Phase 7 (Billing & Payments)
- GPS-proximity-based pre-arrival (send when tech is X minutes away) — Phase 10 or future enhancement
- Customer-facing notification preferences portal — Phase 8 (Customer Portal)
</user_constraints>

---

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|-----------------|
| NOTIF-01 | System sends pre-arrival SMS/email notification to customer before tech arrives | Twilio REST API via Supabase Edge Function (Deno fetch pattern), `send-pre-arrival` Edge Function mirrors existing `send-service-report` pattern |
| NOTIF-02 | System sends post-service email with service report link after stop completion | Resend SDK (v6.9.3) + React Email (v5.x) in Next.js server action, replaces existing `generateServiceReport` HTML string; `send-service-report` Edge Function already exists |
| NOTIF-03 | System provides alerts dashboard for office — missed stops, overdue invoices, declining chemical trends | New `alerts` table + server-computed alert queries against `service_visits` and `route_stops`; realtime badge via Supabase Realtime |
| NOTIF-04 | Office can configure alert types and notification channels (email, in-app, SMS) | New `org_notification_settings` JSONB column on `orgs` table (or separate `org_settings` table); owner-only update |
</phase_requirements>

---

## Summary

Phase 5 has two distinct technical domains: (1) outbound communications (email via Resend + React Email; SMS via Twilio REST API through a Supabase Edge Function) and (2) an in-app alerts system backed by scheduled or on-demand queries against `service_visits` and `route_stops`. The project already has the `send-service-report` Edge Function wired to Resend using raw `fetch` with the HTML parameter — Phase 5 replaces the HTML string generation with a React Email template rendered to HTML on the Next.js server, then passed to the existing Edge Function as-is. The Edge Function does not need to change its Resend call.

For SMS, the Twilio npm package does not run in Deno (Supabase Edge Functions). The correct pattern is direct HTTP calls to the Twilio REST API using `fetch` with `URLSearchParams` body and HTTP Basic auth via `btoa`. This is the established community pattern for Supabase Edge Functions. The new `send-pre-arrival` Edge Function follows the exact same structural template as the existing `send-service-report` function.

The alerts dashboard requires new schema work: an `alerts` table to persist dismissed/snoozed state, and a `org_settings` table (or JSONB column on `orgs`) for notification and service-requirement configuration. Alert generation logic runs server-side on page load (not via real-time subscription) — Supabase Realtime is only used for the badge count. The chemical trend detection uses a simple linear slope across the last 3+ visits for a given pool, which is computationally cheap and matches the user's intent.

**Primary recommendation:** Implement React Email templates in `src/lib/emails/` with `@react-email/components` and `@react-email/render`; call `render()` server-side in Next.js actions to produce the HTML string passed to the existing Edge Function. Build a new `send-pre-arrival` Supabase Edge Function using the Twilio REST API fetch pattern. Add new `alerts` and `org_settings` schema tables.

---

## Standard Stack

### Core
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| `@react-email/components` | 1.0.8 | React components for email templates (Html, Body, Section, Text, Button, etc.) | Official React Email component library, used with `@react-email/render` |
| `@react-email/render` | 2.0.4 | Renders React email components to HTML string | The only supported renderer for React Email; `renderAsync()` is the preferred async API |
| `resend` | 6.9.3 | Email delivery API SDK | Already decided; project already uses Resend in Edge Function; SDK simplifies auth |
| Twilio REST API | — | SMS delivery; called via raw `fetch` (no npm package) | Twilio npm package incompatible with Deno runtime; `fetch` + `URLSearchParams` + `btoa` Basic auth is the established Deno pattern |

### Supporting
| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| `jose` | built-in to Next.js | Sign/verify time-limited report link tokens | For the "View Full Report" public link — sign a JWT with `visitId` + `exp`, verify in a `GET /api/reports/[token]` route handler |
| Supabase Realtime | via `@supabase/supabase-js` | Push badge count updates to sidebar | For the red alert badge — subscribe to `alerts` table INSERT events on the client |

### Alternatives Considered
| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| React Email | Raw HTML string (current Phase 3 approach) | Raw HTML is already working but is not maintainable; React Email gives type safety, composability, and inline-style automatic handling |
| Resend SDK in Next.js action | Direct `fetch` to Resend API | SDK is simpler; direct fetch is what the Edge Function already does — mixing both is fine since the action calls the Edge Function |
| Twilio `fetch` pattern | Twilio npm package | Twilio npm package crashes on Deno; `fetch` pattern is verified working |
| `alerts` DB table | In-memory computed alerts | DB table needed to persist dismiss/snooze state; without it, dismissed alerts reappear on reload |

### Installation
```bash
npm install @react-email/components @react-email/render resend
```

No additional Twilio npm package needed — SMS goes through the Supabase Edge Function using raw `fetch`.

---

## Architecture Patterns

### Recommended Project Structure
```
src/
├── lib/
│   └── emails/                     # React Email templates
│       ├── service-report-email.tsx     # Replaces src/lib/reports/service-report.ts
│       └── pre-arrival-email.tsx        # Fallback email when no phone on file
├── actions/
│   ├── notifications.ts            # pre-arrival trigger server action
│   ├── alerts.ts                   # alert query + dismiss/snooze server actions
│   └── company-settings.ts         # org settings read/write server actions
├── app/(app)/
│   ├── alerts/                     # New: alerts dashboard page
│   │   └── page.tsx
│   └── settings/
│       └── page.tsx                # Expanded: add Company Settings sections
├── components/
│   ├── alerts/                     # Alert feed + filter chips + item card
│   └── settings/                   # Existing + new service-requirements UI
supabase/functions/
├── send-service-report/            # Existing — receives pre-rendered HTML, no change
└── send-pre-arrival/               # New — calls Twilio REST API for SMS
src/lib/db/schema/
├── alerts.ts                       # New table
└── org-settings.ts                 # New table (or JSONB on orgs)
```

### Pattern 1: React Email Render in Next.js Server Action

**What:** Call `renderAsync()` from `@react-email/render` inside a Next.js server action to produce an HTML string, then pass it to the existing `send-service-report` Edge Function.

**When to use:** Every time a stop completes (`completeStop` server action), on first completion only (not edits). The `render()` call is server-only — never runs in the browser.

**Key note on Next.js 16 + Turbopack:** There is a non-blocking prettier version warning when `@react-email/render` is loaded with Turbopack (discussion #1816). It is a warning only — pages compile and send correctly. Do NOT add `serverExternalPackages` unless the warning escalates to an error. The resend SDK issue (v6.1.0 Turbopack crash) was fixed in resend v6.2.2; with resend v6.9.3 this is not a concern.

```typescript
// Source: https://react.email/docs/utilities/render + https://resend.com/docs/send-with-nextjs
// src/lib/emails/service-report-email.tsx
import { Html, Body, Head, Container, Text, Section, Hr, Row, Column, Button } from "@react-email/components"

interface ServiceReportEmailProps {
  customerName: string
  techName: string
  companyName: string
  serviceDate: string
  poolName: string
  chemistry: Record<string, number | null>
  reportToken: string   // signed JWT for the public "View Full Report" link
}

export function ServiceReportEmail(props: ServiceReportEmailProps) {
  const reportUrl = `${process.env.NEXT_PUBLIC_APP_URL}/api/reports/${props.reportToken}`
  return (
    <Html lang="en">
      <Head />
      <Body style={{ backgroundColor: "#0f172a", fontFamily: "sans-serif" }}>
        <Container style={{ maxWidth: "600px", margin: "0 auto", padding: "24px" }}>
          <Section>
            <Text style={{ color: "#f1f5f9", fontSize: "20px", fontWeight: "700" }}>
              Service Report — {props.poolName}
            </Text>
            <Text style={{ color: "#94a3b8", fontSize: "14px" }}>
              {props.companyName} · {props.serviceDate}
            </Text>
            <Text style={{ color: "#cbd5e1", fontSize: "14px" }}>
              Serviced by {props.techName}
            </Text>
          </Section>
          <Hr style={{ borderColor: "#334155" }} />
          {/* Chemistry summary rows */}
          <Section>
            {Object.entries(props.chemistry)
              .filter(([, v]) => v !== null)
              .slice(0, 4)  // show top 4 readings in email body
              .map(([param, value]) => (
                <Row key={param}>
                  <Column style={{ color: "#94a3b8", fontSize: "13px" }}>{param}</Column>
                  <Column style={{ color: "#f1f5f9", fontSize: "13px", fontWeight: "600" }}>{value}</Column>
                </Row>
              ))}
          </Section>
          <Hr style={{ borderColor: "#334155" }} />
          <Button
            href={reportUrl}
            style={{
              backgroundColor: "#3b82f6",
              color: "#ffffff",
              padding: "12px 24px",
              borderRadius: "8px",
              fontSize: "14px",
              fontWeight: "600",
              textDecoration: "none",
            }}
          >
            View Full Report
          </Button>
        </Container>
      </Body>
    </Html>
  )
}
```

```typescript
// In completeStop server action (src/actions/visits.ts)
import { renderAsync } from "@react-email/render"
import { ServiceReportEmail } from "@/lib/emails/service-report-email"

// Generate signed token for public report link
const reportToken = await signReportToken(input.visitId)  // see Pattern 3

// Render React Email template to HTML string
const reportHtml = await renderAsync(
  ServiceReportEmail({
    customerName,
    techName: techProfile.full_name,
    companyName: orgName,
    serviceDate: now.toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" }),
    poolName,
    chemistry: input.chemistry,
    reportToken,
  })
)

// Pass HTML string to existing Edge Function (unchanged)
await supabase.functions.invoke("send-service-report", {
  body: { visitId: input.visitId, customerEmail, customerName, reportHtml, fromName: orgName },
})
```

### Pattern 2: Twilio SMS via Supabase Edge Function (Deno fetch)

**What:** New `send-pre-arrival` Edge Function calls Twilio Messages REST API using `fetch` with HTTP Basic auth and `application/x-www-form-urlencoded` body. The Twilio npm package does NOT work in Deno — only raw fetch.

**When to use:** Triggered by a new `startRoute` server action on the client when the tech taps "Start Route". The action calls the Edge Function once per customer stop on today's route (for customers with notifications enabled and a phone number on file).

```typescript
// Source: Verified Deno/Supabase community pattern (see Sources section)
// supabase/functions/send-pre-arrival/index.ts
import { createClient } from "jsr:@supabase/supabase-js@2"

interface RequestBody {
  orgId: string
  techName: string
  stops: Array<{
    customerName: string
    customerPhone: string | null
    customerEmail: string | null
    stopNumber: number
    notificationsEnabled: boolean
  }>
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 204, headers: CORS_HEADERS })
  }

  const body: RequestBody = await req.json()
  const accountSid = Deno.env.get("TWILIO_ACCOUNT_SID")!
  const authToken = Deno.env.get("TWILIO_AUTH_TOKEN")!
  const fromNumber = Deno.env.get("TWILIO_PHONE_NUMBER")!
  const resendApiKey = Deno.env.get("RESEND_API_KEY")!

  const results = []
  for (const stop of body.stops) {
    if (!stop.notificationsEnabled) continue

    if (stop.customerPhone) {
      // SMS via Twilio REST API (fetch — no npm package)
      const twilioUrl = `https://api.twilio.com/2010-04-01/Accounts/${accountSid}/Messages.json`
      const smsBody = `Hi ${stop.customerName}, your pool tech ${body.techName} is heading your way. You're stop #${stop.stopNumber} on today's route.`

      const res = await fetch(twilioUrl, {
        method: "POST",
        headers: {
          "Authorization": `Basic ${btoa(`${accountSid}:${authToken}`)}`,
          "Content-Type": "application/x-www-form-urlencoded",
        },
        body: new URLSearchParams({
          From: fromNumber,
          To: stop.customerPhone,
          Body: smsBody,
        }).toString(),
      })
      results.push({ phone: stop.customerPhone, status: res.status })

    } else if (stop.customerEmail) {
      // Email fallback via Resend REST API (same pattern as send-service-report)
      await fetch("https://api.resend.com/emails", {
        method: "POST",
        headers: {
          "Authorization": `Bearer ${resendApiKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          from: `${body.techName} <noreply@poolco.app>`,
          to: [stop.customerEmail],
          subject: `Your pool service is on the way`,
          html: `<p>Hi ${stop.customerName}, your pool tech <strong>${body.techName}</strong> is heading your way. You're stop #${stop.stopNumber} on today's route.</p>`,
        }),
      })
    }
  }

  return new Response(JSON.stringify({ sent: results.length }), { status: 200, headers: CORS_HEADERS })
})

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization",
}
```

### Pattern 3: Time-Limited Public Report Link (no login required)

**What:** Sign a short-lived JWT containing `visitId` using `jose`. Serve the full report HTML at `GET /api/reports/[token]` — a Next.js Route Handler that verifies the token and reads `report_html` from `service_visits`.

**When to use:** Link embedded in every service report email. Token expires after 30 days (configurable). No Supabase auth required — route handler uses `adminDb` (service role) to read the visit record after verifying the JWT signature.

```typescript
// src/lib/reports/report-token.ts
import { SignJWT, jwtVerify } from "jose"

const SECRET = new TextEncoder().encode(process.env.REPORT_TOKEN_SECRET!)

export async function signReportToken(visitId: string): Promise<string> {
  return new SignJWT({ visitId })
    .setProtectedHeader({ alg: "HS256" })
    .setExpirationTime("30d")
    .sign(SECRET)
}

export async function verifyReportToken(token: string): Promise<{ visitId: string } | null> {
  try {
    const { payload } = await jwtVerify(token, SECRET)
    return { visitId: payload.visitId as string }
  } catch {
    return null
  }
}

// src/app/api/reports/[token]/route.ts
import { verifyReportToken } from "@/lib/reports/report-token"
import { adminDb } from "@/lib/db"
import { serviceVisits } from "@/lib/db/schema"
import { eq } from "drizzle-orm"

export async function GET(_req: Request, { params }: { params: { token: string } }) {
  const payload = await verifyReportToken(params.token)
  if (!payload) return new Response("Link expired or invalid", { status: 410 })

  const rows = await adminDb
    .select({ reportHtml: serviceVisits.report_html })
    .from(serviceVisits)
    .where(eq(serviceVisits.id, payload.visitId))
    .limit(1)

  if (!rows[0]?.reportHtml) return new Response("Report not found", { status: 404 })

  return new Response(rows[0].reportHtml, {
    status: 200,
    headers: { "Content-Type": "text/html; charset=utf-8" },
  })
}
```

`jose` is already bundled with Next.js — no npm install needed.

### Pattern 4: Alerts Table + Query Pattern

**What:** Persistent `alerts` table stores generated alerts with `dismissed_at` and `snoozed_until` columns. Alert generation is a server-side query (not a background job) that runs on the alerts page load. Alert actions (dismiss/snooze) are server actions that update the row.

**Schema design:**

```typescript
// src/lib/db/schema/alerts.ts
export const alerts = pgTable("alerts", {
  id: uuid("id").defaultRandom().primaryKey(),
  org_id: uuid("org_id").notNull().references(() => orgs.id, { onDelete: "cascade" }),
  alert_type: text("alert_type").notNull(),  // "missed_stop" | "declining_chemistry" | "incomplete_data"
  severity: text("severity").notNull().default("warning"),  // "info" | "warning" | "critical"
  // Polymorphic reference — either a visit_id or a route_stop_id
  reference_id: uuid("reference_id"),
  reference_type: text("reference_type"),   // "service_visit" | "route_stop"
  // Human-readable summary shown in the feed
  title: text("title").notNull(),
  description: text("description"),
  // Lifecycle
  generated_at: timestamp("generated_at", { withTimezone: true }).defaultNow().notNull(),
  dismissed_at: timestamp("dismissed_at", { withTimezone: true }),
  snoozed_until: timestamp("snoozed_until", { withTimezone: true }),
  // Additional context (e.g., which customer, which chemical parameter)
  metadata: jsonb("metadata"),
  created_at: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
})
```

**Alert generation queries (run on alerts page load):**

```typescript
// src/actions/alerts.ts — generateAlerts()
// 1. Missed stops: route_stops with status = "scheduled" AND scheduled_date < today
//    AND no matching service_visit with status = "complete" or "skipped"
// 2. Incomplete data: service_visits with status = "complete" AND
//    chemistry_readings missing required params for the pool's sanitizer_type
// 3. Declining chemistry: for each pool, fetch last 3+ visits, compute slope
//    of each required parameter — flag if slope < -threshold
//    Simple slope: (last_value - first_value) / (n - 1). No complex stats needed.
```

**Snooze duration options (Claude's discretion):** 1 hour, 4 hours, 1 day, 1 week. Store as a select in the UI, map to `new Date(Date.now() + duration)` for `snoozed_until`.

### Pattern 5: Org Settings Table

**What:** Separate `org_settings` table (preferred over JSONB column on `orgs`) so it can grow independently and have its own RLS. Stores notification channel preferences and service requirements per sanitizer type.

```typescript
// src/lib/db/schema/org-settings.ts
export const orgSettings = pgTable("org_settings", {
  id: uuid("id").defaultRandom().primaryKey(),
  org_id: uuid("org_id").notNull().unique().references(() => orgs.id, { onDelete: "cascade" }),
  // Notification channels enabled
  pre_arrival_sms_enabled: boolean("pre_arrival_sms_enabled").notNull().default(true),
  pre_arrival_email_enabled: boolean("pre_arrival_email_enabled").notNull().default(true),
  service_report_email_enabled: boolean("service_report_email_enabled").notNull().default(true),
  // Service requirements per sanitizer type (JSONB for flexibility)
  // Structure: { chlorine: ["freeChlorine", "pH", "totalAlkalinity"], salt: ["salt", "freeChlorine", "pH"] }
  required_chemistry_by_sanitizer: jsonb("required_chemistry_by_sanitizer").$type<Record<string, string[]>>(),
  // Required checklist task IDs (applies to all sanitizer types)
  required_checklist_task_ids: jsonb("required_checklist_task_ids").$type<string[]>(),
  created_at: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  updated_at: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
})
```

### Pattern 6: Customer Notification Opt-Out Column

**What:** New boolean column on `customers` table: `notifications_enabled boolean NOT NULL DEFAULT true`. Checked before sending pre-arrival SMS/email.

**Implementation:** Add via Drizzle migration. The pre-arrival Edge Function receives this flag per-stop in its payload — the server action filters and only passes stops where `notifications_enabled = true`.

### Pattern 7: Chemical Trend Detection Algorithm

**What:** Simple linear slope across the last N (N ≥ 3) readings for a parameter. If slope < -threshold for a required parameter, generate a "declining_chemistry" alert.

**Recommendation (Claude's discretion):** Use slope of the simplest linear form — `(last - first) / (n - 1)` across the last 3 visits. Threshold: -0.5 per visit for pH, -0.3 ppm/visit for freeChlorine, etc. Per-parameter thresholds can be hardcoded initially.

```typescript
function detectDecliningTrend(values: number[]): boolean {
  if (values.length < 3) return false
  // Use last 3 values only for recency
  const recent = values.slice(-3)
  const slope = (recent[recent.length - 1] - recent[0]) / (recent.length - 1)
  return slope < -DECLINE_THRESHOLD
}

// Default thresholds (conservative, catches real problems):
const DECLINE_THRESHOLDS: Record<string, number> = {
  freeChlorine: 0.5,    // -0.5 ppm per visit
  pH: 0.15,             // -0.15 pH units per visit
  totalAlkalinity: 5,   // -5 ppm per visit
  salt: 100,            // -100 ppm per visit (salt pools)
}
```

### Anti-Patterns to Avoid

- **Calling Twilio npm package in Deno Edge Functions:** Will crash at runtime. Always use `fetch` + `URLSearchParams` + `btoa` Basic auth.
- **Using `react` parameter in Resend from Deno:** Deno runtime doesn't support JSX. Render to HTML string server-side in Next.js, then pass `html` string to the Edge Function.
- **Storing `report_html` in the Edge Function payload:** The HTML string can be 50-100KB. For the pre-arrival notification, don't send report HTML to the Edge Function — only the short message text.
- **Hard-blocking stop completion on missing required data:** The locked decision is "warn but allow." Never throw an error or prevent `completeStop` — surface the warning, allow override, generate an alert.
- **Computing alerts on every page render without caching:** Alert generation queries across `service_visits` and `route_stops` can be expensive. Cache with `unstable_cache` with a short TTL (60s) or revalidate on explicit actions.
- **Generating a new alert row every time the alerts page loads:** Insert alert rows only when newly detected (check `reference_id` not already in `alerts` with `dismissed_at IS NULL`).
- **Using oklch() colors in React Email inline styles:** React Email renders to email clients, not WebGL, but some older email clients don't support oklch. Use hex colors only in email templates.

---

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Email HTML generation | Custom `generateServiceReport` string builder | `@react-email/components` + `renderAsync()` | React Email handles inline CSS, entity escaping, email-client compatibility automatically |
| SMS sending in Deno | Custom Twilio SDK wrapper class | `fetch` + URLSearchParams + btoa (3 lines) | Nothing to abstract — the Twilio REST API is dead simple with fetch |
| JWT signing for report tokens | Custom HMAC implementation | `jose` (already in Next.js) | Edge-compatible, handles expiry, standard library |
| Alert persistence | React state / localStorage | `alerts` DB table | Must survive logout, show badge across sessions |
| Email deliverability | Raw SMTP | Resend API | Deliverability, domain verification, bounce handling |

**Key insight:** The Resend + React Email combination is the right tool because they're from the same team — the `react` parameter in `resend.emails.send()` automatically calls `@react-email/render`. But since this project uses a Deno Edge Function for sending, render manually server-side and pass the `html` string. This is explicitly documented by Resend for Supabase Edge Function usage.

---

## Common Pitfalls

### Pitfall 1: Twilio Package in Deno
**What goes wrong:** Importing `twilio` npm package in a Supabase Edge Function causes a runtime crash — Deno cannot execute Node.js-specific APIs that Twilio's SDK uses.
**Why it happens:** Twilio SDK relies on Node.js `http`, `https`, `crypto` modules not available in Deno.
**How to avoid:** Always use raw `fetch` to `https://api.twilio.com/2010-04-01/Accounts/${SID}/Messages.json` with Basic auth.
**Warning signs:** "Cannot find module" or "process is not defined" errors in Edge Function logs.

### Pitfall 2: Alert Deduplication
**What goes wrong:** The alerts page generates new `alerts` rows every time it loads, flooding the table with duplicate alerts for the same missed stop.
**Why it happens:** Alert generation logic doesn't check if an alert for the same `reference_id` already exists.
**How to avoid:** Before inserting, query for existing non-dismissed alerts with the same `(org_id, alert_type, reference_id)`. Use `INSERT ... ON CONFLICT DO NOTHING` with a unique constraint on `(org_id, alert_type, reference_id)`.
**Warning signs:** Alert count growing rapidly on repeated page loads.

### Pitfall 3: report_html Regeneration on Stop Edits
**What goes wrong:** The existing `completeStop` uses `ON CONFLICT DO UPDATE` — editing a completed stop regenerates and re-saves `report_html`. The email would send again on edit if the `isUpdate` check fails.
**Why it happens:** The `isUpdate` check was added for this reason, but the `reportToken` in the new email links to the visit by ID — editing must invalidate the old token OR the new report replaces the old at the same URL.
**How to avoid:** Keep `isUpdate` guard. On edits, update `report_html` in the DB (so `/api/reports/[token]` serves fresh content) but do NOT reinvoke `send-service-report`. The existing token continues to work and now returns updated content. This is the correct behavior.

### Pitfall 4: Pre-Arrival Sends on Every Route Restart
**What goes wrong:** If a tech closes the app and reopens it (triggering the "start route" action again), customers get a second SMS.
**Why it happens:** No idempotency check on pre-arrival sends.
**How to avoid:** Add `pre_arrival_sent_at` column to `route_stops`. The `startRoute` server action only calls the Edge Function for stops where `pre_arrival_sent_at IS NULL`. Update the column after successful Edge Function invocation.

### Pitfall 5: React Email Turbopack Warning
**What goes wrong:** Dev console shows "Package prettier can't be external" warning with Turbopack when `@react-email/render` is imported.
**Why it happens:** Version mismatch between prettier in `@react-email/render`'s dependencies and the project's prettier.
**How to avoid:** This is non-blocking. Do NOT add `serverExternalPackages: ["@react-email/render"]` unless compilation actually fails. The warning does not affect production builds. Monitor https://github.com/resend/react-email/discussions/1816 for fix status.

### Pitfall 6: Badge Count Staleness
**What goes wrong:** The red alert badge in the sidebar shows stale count after alerts are dismissed.
**Why it happens:** Badge rendered server-side; dismissals happen client-side.
**How to avoid:** Implement badge as a client component with Supabase Realtime subscription to `alerts` table. On INSERT/UPDATE, refetch the count. Alternatively, use router.refresh() after dismiss/snooze actions (simpler, good enough for this use case).

### Pitfall 7: Customer Opt-Out Column Migration
**What goes wrong:** Adding `notifications_enabled` to `customers` table with `DEFAULT true` but RLS UPDATE policy doesn't allow tech role — tech can't opt a customer out from the field.
**Why it happens:** `customers` UPDATE RLS is restricted to owner+office roles.
**How to avoid:** Opt-out toggle is managed only by office/owner via customer profile UI. Techs don't need this capability per the locked decisions. No RLS change needed.

### Pitfall 8: RLS on alerts Table (correlated subquery)
**What goes wrong:** Using a correlated subquery in the alerts table RLS policy inside a `withRls` transaction causes `ReadOnlyError` or performance issues (MEMORY.md critical pattern).
**Why it happens:** Drizzle's `withRls` wraps in a read transaction; correlated subqueries on RLS-protected tables inside the same transaction fail.
**How to avoid:** Use LEFT JOIN pattern for any query that joins `alerts` with other RLS-protected tables. RLS policy itself should use `(select auth.jwt() ->> 'org_id')::uuid` directly (not a subquery on another table).

---

## Code Examples

### Rendering React Email to HTML String (Next.js Server Action)

```typescript
// Source: https://react.email/docs/utilities/render + https://resend.com/docs/send-with-nextjs
import { renderAsync } from "@react-email/render"
import { ServiceReportEmail } from "@/lib/emails/service-report-email"

const reportHtml = await renderAsync(
  ServiceReportEmail({
    customerName: "Jane Smith",
    techName: "Mike",
    companyName: "PoolCo",
    serviceDate: "March 9, 2026",
    poolName: "Main Pool",
    chemistry: { freeChlorine: 2.5, pH: 7.4 },
    reportToken: "eyJ...",
  })
)
// reportHtml is a complete <!DOCTYPE html>... string
```

### Sending SMS via Twilio REST API in Deno

```typescript
// Source: Verified community pattern for Supabase Edge Functions
// https://www.twilio.com/en-us/blog/send-sms-notifications-supabase-users-node-js-twilio-messaging
const accountSid = Deno.env.get("TWILIO_ACCOUNT_SID")!
const authToken = Deno.env.get("TWILIO_AUTH_TOKEN")!
const fromNumber = Deno.env.get("TWILIO_PHONE_NUMBER")!

const res = await fetch(
  `https://api.twilio.com/2010-04-01/Accounts/${accountSid}/Messages.json`,
  {
    method: "POST",
    headers: {
      "Authorization": `Basic ${btoa(`${accountSid}:${authToken}`)}`,
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: new URLSearchParams({
      From: fromNumber,
      To: "+15551234567",
      Body: "Hi Jane, your pool tech Mike is heading your way. You're stop #3 on today's route.",
    }).toString(),
  }
)
if (!res.ok) {
  const err = await res.text()
  console.error("[send-pre-arrival] Twilio error:", err)
}
```

### Alert Generation Query Pattern (Missed Stops)

```typescript
// Source: project patterns — withRls + LEFT JOIN (per MEMORY.md)
// Missed stops: scheduled_date before today, status != "complete"|"skipped"
const today = new Date().toISOString().split("T")[0]

const missedStops = await withRls(token, async (db) => {
  return db
    .select({
      stopId: routeStops.id,
      customerId: routeStops.customer_id,
      poolId: routeStops.pool_id,
      techId: routeStops.tech_id,
      scheduledDate: routeStops.scheduled_date,
      customerName: customers.full_name,
    })
    .from(routeStops)
    .leftJoin(customers, eq(routeStops.customer_id, customers.id))
    .where(
      and(
        eq(routeStops.org_id, orgId),
        lt(routeStops.scheduled_date, today),        // before today
        notInArray(routeStops.status, ["complete", "skipped"])
      )
    )
})
```

### Dismiss/Snooze Alert Server Action

```typescript
// src/actions/alerts.ts
export async function dismissAlert(alertId: string) {
  const token = await getRlsToken()
  if (!token) return { success: false }
  await withRls(token, async (db) => {
    await db
      .update(alerts)
      .set({ dismissed_at: new Date() })
      .where(eq(alerts.id, alertId))
  })
  revalidatePath("/alerts")
  return { success: true }
}

export async function snoozeAlert(alertId: string, durationMs: number) {
  const token = await getRlsToken()
  if (!token) return { success: false }
  const snoozeUntil = new Date(Date.now() + durationMs)
  await withRls(token, async (db) => {
    await db
      .update(alerts)
      .set({ snoozed_until: snoozeUntil })
      .where(eq(alerts.id, alertId))
  })
  revalidatePath("/alerts")
  return { success: true }
}

// Duration constants (Claude's discretion: 4 options)
export const SNOOZE_OPTIONS = [
  { label: "1 hour",  ms: 1 * 60 * 60 * 1000 },
  { label: "4 hours", ms: 4 * 60 * 60 * 1000 },
  { label: "1 day",   ms: 24 * 60 * 60 * 1000 },
  { label: "1 week",  ms: 7 * 24 * 60 * 60 * 1000 },
] as const
```

---

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| `generateServiceReport()` — raw HTML string concatenation | React Email components + `renderAsync()` | Phase 5 (this phase) | Maintainable, type-safe, composable, better mobile rendering |
| `send-service-report` receives full `reportHtml` in body | Same — Edge Function continues receiving pre-rendered HTML | No change | Edge Function is already correct; only the HTML generator changes |
| No pre-arrival notifications | Route-start trigger → `send-pre-arrival` Edge Function | Phase 5 (this phase) | Customers get proactive communication |
| No alert system | `alerts` table + server-computed alert generation | Phase 5 (this phase) | Office has actionable exception feed |

**Deprecated/outdated:**
- `src/lib/reports/service-report.ts` (`generateServiceReport`): Replace with `@react-email/render` + React component in Phase 5. The file should be deleted after the new template is verified.
- `send-service-report` Edge Function `fromEmail` hardcoded to `reports@poolco.app`: Update to pull from `org_settings` when that table is added.

---

## Open Questions

1. **Resend domain verification for production**
   - What we know: The existing Edge Function hardcodes `from: "reports@poolco.app"` — Resend requires domain verification for non-sandbox sending.
   - What's unclear: Has `poolco.app` been verified in Resend, or is this still using sandbox? Sandbox only sends to the Resend account owner.
   - Recommendation: Planner should include a task to verify domain in Resend dashboard before testing email delivery to real customers. This is a one-time ops step, not code.

2. **Twilio number provisioning**
   - What we know: The Edge Function needs `TWILIO_PHONE_NUMBER` env var — a purchased Twilio phone number.
   - What's unclear: Has a Twilio number been purchased? US local numbers cost ~$1/month; toll-free ~$2/month.
   - Recommendation: Planner should note this as an ops prerequisite. The code path can be tested with Twilio trial account (sends to verified numbers only).

3. **`customers.notifications_enabled` migration timing**
   - What we know: We need to add this column to `customers` with `DEFAULT true`.
   - What's unclear: Does the existing customers RLS UPDATE policy need adjustment for this column specifically? No — office/owner manage opt-out.
   - Recommendation: Simple Drizzle migration. Add column, update `customers.ts` schema, `drizzle-kit generate` + deploy. No RLS change.

4. **`report_html` size vs Edge Function payload limit**
   - What we know: Service report HTML strings are 20-80KB based on the current `service-report.ts` output.
   - What's unclear: Supabase Edge Function request body size limit (default 6MB — this is fine).
   - Recommendation: No issue. The current pattern of sending full HTML in the invoke body is acceptable.

5. **Alerts page caching strategy**
   - What we know: Alert generation queries can be expensive at scale (many stops × many visits).
   - What's unclear: How many stops/visits will a typical org have at Phase 5?
   - Recommendation: Use `unstable_cache` with 60-second TTL on alert generation, keyed by `org_id`. Dismiss/snooze actions call `revalidatePath("/alerts")` to bust the cache immediately.

---

## Sources

### Primary (HIGH confidence)
- `src/actions/visits.ts` — Existing `completeStop` pattern; existing `send-service-report` Edge Function invocation
- `supabase/functions/send-service-report/index.ts` — Existing Edge Function structure (mirrors what `send-pre-arrival` will look like)
- `src/lib/db/schema/` — All existing table definitions; `alerts` and `org_settings` are new additions
- `src/components/shell/app-sidebar.tsx` — Sidebar nav structure; alerts nav item goes into `NAV_ITEMS` (owner/office only)
- https://resend.com/docs/send-with-nextjs — Resend + Next.js server action pattern
- https://resend.com/docs/send-with-supabase-edge-functions — Resend from Supabase Edge Functions (html parameter, not react)
- React Email version 5.x / react-email 5.2.9 — verified via npm search results (current as of 2026-03-09)
- resend 6.9.3 — verified via npm search results (current as of 2026-03-09)

### Secondary (MEDIUM confidence)
- Twilio REST API fetch pattern in Deno — verified by multiple community sources (Hashnode, Twilio blog, bootstrapped.app guide) showing the same `btoa` + `URLSearchParams` pattern
- https://github.com/resend/resend-node/issues/625 — Turbopack + react-email render issue; resolved in resend v6.2.2; not a concern with resend v6.9.3
- https://github.com/resend/react-email/discussions/1816 — prettier version warning with Turbopack; non-blocking, known issue

### Tertiary (LOW confidence)
- Chemical trend threshold values (0.5 ppm/visit for freeChlorine etc.) — derived from general pool chemistry knowledge, not from a verified source. The algorithm is sound but specific threshold values should be validated with pool service domain expertise.

---

## Metadata

**Confidence breakdown:**
- Standard stack (React Email, Resend, Twilio fetch pattern): HIGH — verified via npm, official docs, and active community usage
- Architecture patterns (Edge Function structure, schema design, token-based public links): HIGH — follows existing project patterns exactly
- Pitfalls (Twilio in Deno, alert deduplication, pre-arrival idempotency): HIGH — most derived from existing code analysis and verified community reports
- Chemical trend algorithm: MEDIUM — algorithm is sound, threshold values are estimates

**Research date:** 2026-03-09
**Valid until:** 2026-04-09 (30 days — Resend and React Email release frequently but API is stable)
