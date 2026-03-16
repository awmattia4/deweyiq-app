# Phase 10: Smart Features & AI - Research

**Researched:** 2026-03-16
**Domain:** Weather APIs, Web Push Notifications, Predictive Analytics, Real-time ETA, Equipment Monitoring, In-app Notification Center
**Confidence:** HIGH (core stack), MEDIUM (prediction algorithms), HIGH (PWA/push)

---

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions

**Weather automation & rescheduling**
- Suggest & approve model — system proposes a reschedule plan when weather is forecast; office reviews and approves with one click (not full auto)
- All severe weather triggers — rain (above threshold), lightning/thunderstorms, extreme heat (105F+), high winds (40mph+), and hail all trigger reschedule suggestions
- Auto-notify with opt-out — when office approves a reschedule, all affected customers are notified automatically by default; office can uncheck individual customers before approving
- Smart slot finder for displaced stops — system finds the optimal open slot considering tech availability, route geography, and customer preferences (could be same week or next)

**Notification strategy & push UX**
- PWA install prompt immediately on first login — non-intrusive banner with clear benefit messaging (works offline, push notifications, faster access); dismissible with 7-day snooze before re-appearing
- Push notification permission prompt immediately — right after install/first login with explanation of what they'll receive; maximize opt-in while engagement is high
- Per-org defaults with per-user override — owner sets org-wide notification defaults (e.g. "all techs get push for new WOs"); individual users can override their own preferences in Settings
- In-app notification center grouped by urgency — bell icon with unread badge; notifications split into "Needs Action" (urgent, actionable items float to top) and "Informational" (FYI items below)

**Dynamic ETA & safety alerts**
- Two-touch ETA delivery — initial "tech is on their way" notification at route start, then a refined ETA when tech is 2-3 stops away
- Live countdown with map in portal — customer portal shows real-time countdown timer plus a map showing the tech's approximate location along the route (Uber/DoorDash-style experience)
- Auto-update ETA on significant change, capped at 2 updates — if ETA shifts by 15+ minutes, automatically send updated SMS; maximum 2 update notifications per service visit to avoid spam
- Configurable safety escalation chain — owner defines in settings: who to alert for unresponsive tech, in what order, at what intervals

**Smart dosing & predictive alerts**
- AI as modifier badge on standard dose — show the rule-based dose as primary; when AI adjusts it, show a small badge; tap for details
- Predictive alerts visible to office + tech + customer — office sees on dashboard, tech gets heads-up before arriving, customer gets proactive "we're monitoring your pool" notification
- 6-week minimum data with disclaimer — predictions start after 6 weeks of readings; full confidence after 3+ months
- Equipment degradation: alert + suggest WO — when equipment performance drops (e.g. salt cell down 30%), alert office with one-tap "Create Work Order" button; not auto-created

### Claude's Discretion
- Weather API provider choice and forecast threshold calibration
- Push notification payload structure and service worker implementation
- ETA calculation algorithm (GPS + stops + historical duration + drive time)
- Prediction model choice (linear regression vs. more sophisticated) for chemistry trends
- Equipment metric baseline calculation and seasonal adjustment approach
- Internal service notes data model and UI placement
- Broadcast messaging segmentation engine and delivery tracking
- Smart customer creation suggestion algorithm
- WO scheduling recommendation algorithm (address proximity + tech workload + travel time)

### Deferred Ideas (OUT OF SCOPE)
None — discussion stayed within phase scope
</user_constraints>

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|-----------------|
| SMART-01 | Smart chemical dosing recommendations based on readings, pool size, sanitizer type, weather, and service history | Dosing engine already exists in `src/lib/chemistry/dosing.ts`; weather modifier via Open-Meteo temperature data; history analysis via linear regression on `service_visits.chemistry_readings` |
| SMART-02 | Predictive alerts for pools trending toward chemical imbalance | OLS linear regression on last N visits' readings; existing `DECLINE_THRESHOLDS` in `alerts.ts` already seeds the pattern |
| SMART-03 | Auto-schedule recurring stops and balance workloads across techs | Existing `schedule_rules` + route stop generator; workload balancing = count stops-per-tech, suggest moves via ORS travel time |
| SMART-04 | Auto-reschedule stops when rain/storms forecast — move with office approval | Open-Meteo daily forecast API; weather_code WMO values 61-65 (rain), 95/96/99 (thunderstorm); new `weather_reschedule_proposals` table; office approve/deny action |
| SMART-05 | Tech weather condition warnings — per-stop weather badges | Open-Meteo hourly forecast for stop's scheduled time window; badge types: rain/heat/wind/storm |
| SMART-06 | Smart service day shifts — optimal reschedule slots considering tech availability, customer preferences, forecast clearing | Slot finder algorithm: query unbooked slots in next 7-10 days per tech, score by ORS proximity, return top 3 candidates |
| SMART-07 | Customer notifications about weather-related delays — auto SMS/email when stop rescheduled due to weather | New template type `weather_reschedule_sms` + `weather_reschedule_email`; sent via existing Supabase Edge Function pattern |
| SMART-08 | Equipment performance trend tracking — salt cell efficiency, pump pressure, filter PSI, heater temp delta — seasonal baselines, degradation alerts, equipment health badges | New `equipment_readings` table; linear trend over last 8 readings; 30% drop threshold for degradation alert |
| SCHED-07 | AI-powered route optimization using ML (traffic patterns, service duration history, geography) | ORS VROOM already implemented; enhancement: weight jobs by historical `started_at` → `completed_at` duration from `route_stops`; feed as `service` durations to ORS |
| SCHED-08 | Auto-schedule and balance workloads across techs based on service levels and availability | Workload balance dashboard widget; bulk-move suggestions via ORS; uses existing schedule rule + route stop infrastructure |
| NOTIF-05–NOTIF-23 | Company user notifications (owner/office/tech) for all platform events via in-app push + email | New `user_notifications` table; Supabase Realtime postgres_changes for live bell icon updates; `web-push` library for PWA push; per-user preferences table |
| NOTIF-24–NOTIF-32 | Customer notifications via email + SMS for all touchpoints | Extend existing notification template system; new template types; new Edge Function triggers or cron jobs |
| NOTIF-33 | All notification types independently toggleable and customizable with editable templates | Extend existing `notification_templates` table and `notification-settings.tsx`; per-user `notification_preferences` table for company users |
| NOTIF-34 | Dynamic ETA notification — real-time estimated arrival based on tech GPS, remaining stops, historical avg stop duration, live drive time | Uses existing `useGpsBroadcast` / `dispatch:${orgId}` Realtime channel; ETA computed from stop position + ORS directions + historical duration averages |
</phase_requirements>

---

## Summary

Phase 10 layers intelligence onto existing infrastructure without replacing it. The codebase already has a GPS broadcast system (`useGpsBroadcast` via Supabase Realtime), a route optimization engine (ORS VROOM), a chemistry dosing engine, an alert system, and a notification template framework. This phase extends each of those systems rather than building from scratch.

The three highest-value additions are: (1) the in-app notification center with Web Push — new infrastructure requiring a `user_notifications` table, `push_subscriptions` table, `web-push` library, and service worker push event handler wired into the existing Serwist SW; (2) weather-aware scheduling — requires Open-Meteo API integration and a proposal/approval workflow; and (3) predictive chemistry alerts — requires a pure-TypeScript OLS regression function applied to the existing `service_visits.chemistry_readings` JSONB data.

**Primary recommendation:** Build in dependency order — notification infrastructure first (everything else uses it), then weather system, then predictive analytics, then ETA enhancements, then equipment monitoring.

---

## Standard Stack

### Core
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| `web-push` | ^3.6 | Send VAPID-signed Web Push notifications from server | The standard Node.js Web Push library, recommended in official Next.js PWA docs (2026-02-27) |
| `@types/web-push` | ^3.6.4 | TypeScript types for web-push | DefinitelyTyped package for the above |
| Open-Meteo API | N/A (REST) | Free weather forecast API, no key required for non-commercial | Free tier, no API key, 7-16 day forecasts, WMO weather codes, no rate limit documented |

### Supporting (already in project)
| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| `@serwist/next` | ^9.5.6 (already installed) | Service worker management + PWA | Extend existing `src/app/sw.ts` for push event handler |
| Supabase Realtime | via `@supabase/supabase-js` | postgres_changes subscription for live notification bell | Notifications table → client bell badge without polling |
| ORS (OpenRouteService) | existing env var | Drive time for ETA and slot scoring | Already used in `optimize.ts` for VROOM + directions |
| Twilio / Resend | existing (via Edge Functions) | SMS + email customer notifications | Existing Edge Function infrastructure |

### Alternatives Considered
| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| Open-Meteo | OpenWeatherMap | OWM requires API key, has paid tiers; Open-Meteo is free for non-commercial with no key |
| `web-push` (VAPID) | Firebase Cloud Messaging | FCM adds Google dependency, requires native app project; VAPID works across all browsers including Safari iOS 16.4+ |
| OLS regression (custom) | TensorFlow.js / brain.js | Heavy bundles; OLS in 20 lines of TypeScript is sufficient for this linear chemistry trend use case |
| Supabase Realtime postgres_changes | Polling | Realtime is already used in this project (GPS broadcast); consistent pattern; lower latency |

### Installation
```bash
npm install web-push @types/web-push
# Open-Meteo: no package needed — direct fetch to https://api.open-meteo.com/v1/forecast
# Generate VAPID keys once:
npx web-push generate-vapid-keys
```

---

## Architecture Patterns

### Recommended Project Structure (new files this phase)
```
src/
├── lib/
│   ├── db/schema/
│   │   ├── user-notifications.ts   # In-app notification center rows
│   │   ├── push-subscriptions.ts   # Web Push endpoint + keys per user/device
│   │   ├── notification-prefs.ts   # Per-user notification preference overrides
│   │   ├── weather-proposals.ts    # Pending reschedule proposals from weather engine
│   │   └── equipment-readings.ts  # Equipment metric readings over time
│   ├── weather/
│   │   ├── open-meteo.ts          # API client + WMO code classifier
│   │   └── reschedule-engine.ts   # Slot finder algorithm
│   ├── chemistry/
│   │   └── prediction.ts          # OLS linear regression for chemistry trend
│   └── eta/
│       └── calculator.ts          # ETA calculation from GPS + remaining stops
├── actions/
│   ├── push.ts                    # subscribeUser, unsubscribeUser, sendPushToUser
│   ├── weather.ts                 # checkWeatherForDate, generateRescheduleProposals
│   ├── eta.ts                     # computeEta, sendEtaNotification
│   └── equipment-readings.ts     # logReading, checkDegradation, getHealthScore
├── app/
│   └── sw.ts                      # Extended: add push event handler to existing Serwist SW
└── components/
    ├── notifications/
    │   ├── notification-bell.tsx   # Bell icon with unread badge
    │   ├── notification-panel.tsx  # Slide-out panel grouped by urgency
    │   └── pwa-install-prompt.tsx  # Non-intrusive install banner
    ├── weather/
    │   ├── weather-badge.tsx       # Per-stop weather condition badge
    │   └── reschedule-proposal-card.tsx  # One-click approval UI
    └── portal/
        └── eta-tracker.tsx         # Live countdown + map (customer portal)
```

### Pattern 1: In-App Notification Center
**What:** `user_notifications` rows → Supabase Realtime postgres_changes → bell badge updates live. Grouped into "Needs Action" and "Informational" panels.
**When to use:** All system-generated events that a company user (owner/office/tech) needs to see.
**Schema:**
```typescript
// user_notifications table
{
  id: uuid primary key,
  org_id: uuid,           // RLS scope
  recipient_id: uuid,     // profiles.id — who receives this
  notification_type: text, // 'new_work_order' | 'stop_flagged' | 'payment_received' | ...
  urgency: text,          // 'needs_action' | 'informational'
  title: text,
  body: text,
  link: text | null,      // deep link e.g. /work-orders/[id]
  read_at: timestamp | null,
  dismissed_at: timestamp | null,
  expires_at: timestamp,  // auto-cleanup, default +30 days
  metadata: jsonb,        // arbitrary structured data for UI
  created_at: timestamp
}
```

**Realtime subscription (bell icon):**
```typescript
// Source: Supabase Realtime docs + makerkit.dev pattern
supabase
  .channel('user-notifications')
  .on('postgres_changes', {
    event: 'INSERT',
    schema: 'public',
    table: 'user_notifications',
    filter: `recipient_id=eq.${userId}`,
  }, (payload) => {
    setUnreadCount(c => c + 1)
    setNotifications(prev => [payload.new, ...prev])
  })
  .subscribe()
```

### Pattern 2: Web Push Notification
**What:** Browser subscribes via VAPID; subscription stored in `push_subscriptions` table; server calls `webpush.sendNotification()`.
**When to use:** High-priority events that need to reach the user even when the browser tab is closed (new WO assigned, safety alert, weather reschedule approval needed).
**Schema:**
```typescript
// push_subscriptions table (no RLS — adminDb only for send; user can see own)
{
  id: uuid primary key,
  user_id: uuid,          // profiles.id
  org_id: uuid,           // for org-wide sends
  endpoint: text unique,  // push service URL (browser-specific)
  p256dh: text,           // browser public key for payload encryption
  auth: text,             // browser auth secret
  device_hint: text | null, // 'ios' | 'android' | 'desktop' — best-effort from UA
  created_at: timestamp,
  last_used_at: timestamp
}
```

**Service worker push handler (extends existing `src/app/sw.ts`):**
```typescript
// Source: Next.js official PWA guide (2026-02-27)
self.addEventListener('push', function(event) {
  if (!event.data) return
  const data = event.data.json()
  event.waitUntil(
    self.registration.showNotification(data.title, {
      body: data.body,
      icon: '/icons/icon-192x192.png',
      badge: '/icons/badge-72x72.png',
      data: { url: data.url },
      vibrate: [100, 50, 100],
    })
  )
})

self.addEventListener('notificationclick', function(event) {
  event.notification.close()
  event.waitUntil(
    clients.openWindow(event.notification.data?.url ?? '/')
  )
})
```

**Server-side send:**
```typescript
// Source: web-push npm README pattern
import webpush from 'web-push'

webpush.setVapidDetails(
  'mailto:admin@poolco.app',
  process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY!,
  process.env.VAPID_PRIVATE_KEY!
)

export async function sendPushToUser(userId: string, payload: {
  title: string; body: string; url?: string
}) {
  const subs = await adminDb.select().from(pushSubscriptions)
    .where(eq(pushSubscriptions.user_id, userId))

  await Promise.allSettled(
    subs.map(sub =>
      webpush.sendNotification(
        { endpoint: sub.endpoint, keys: { p256dh: sub.p256dh, auth: sub.auth } },
        JSON.stringify(payload)
      ).catch(err => {
        // 410 Gone = subscription expired; clean it up
        if (err.statusCode === 410) {
          return adminDb.delete(pushSubscriptions)
            .where(eq(pushSubscriptions.endpoint, sub.endpoint))
        }
      })
    )
  )
}
```

### Pattern 3: Weather-Aware Scheduling
**What:** Daily cron checks Open-Meteo forecast for each org's stops 3-7 days out. When WMO codes or thresholds trigger, a `weather_reschedule_proposals` row is created. Office sees proposal card; one-click approve fires bulk reschedule + customer notifications.
**When to use:** Run once daily via existing cron pattern (`/api/cron/`).
**Open-Meteo endpoint:**
```typescript
// Source: open-meteo.com/en/docs — verified
const url = `https://api.open-meteo.com/v1/forecast?` +
  `latitude=${lat}&longitude=${lng}` +
  `&daily=weather_code,precipitation_sum,precipitation_probability_max,` +
  `wind_speed_10m_max,wind_gusts_10m_max,temperature_2m_max` +
  `&timezone=auto&forecast_days=7`
```

**WMO weather code thresholds (verified via open-meteo.com/en/docs):**
```typescript
// Severe weather triggers for reschedule proposals
const WEATHER_TRIGGERS = {
  thunderstorm: [95, 96, 99],         // WMO codes
  heavyRain: [63, 65],                // moderate/heavy rain
  precipProbabilityPct: 70,           // threshold for rain trigger
  precipSumMm: 10,                    // >10mm = significant rain day
  windGustMph: 40,                    // 40mph wind gust → 64 km/h
  heatF: 105,                         // 105°F → 40.6°C
}
// Note: thunderstorm+hail (96, 99) only reliable in Central Europe per Open-Meteo docs
// For US: use codes 95 + precipitation_probability >= 70% as proxy for storm risk
```

### Pattern 4: Chemistry Trend Prediction (OLS)
**What:** Pure TypeScript ordinary least squares on last N visit readings per chemical parameter. Returns slope, R², and projected value at next visit.
**When to use:** Run during `generateAlerts()` to feed predictive alerts. Also used for SMART-01 weather modifier on dosing.
**Implementation (no external library needed):**
```typescript
// Source: OLS formula — well-established mathematics
interface TrendResult {
  slope: number      // change per visit (negative = declining)
  intercept: number
  rSquared: number   // 0-1 confidence; < 0.5 = weak trend
  projectedNext: number
}

export function computeLinearTrend(values: number[]): TrendResult | null {
  const n = values.length
  if (n < 3) return null  // need minimum 3 points for meaningful trend

  const xs = values.map((_, i) => i)
  const meanX = xs.reduce((a, b) => a + b, 0) / n
  const meanY = values.reduce((a, b) => a + b, 0) / n

  let ssXX = 0, ssXY = 0, ssYY = 0
  for (let i = 0; i < n; i++) {
    ssXX += (xs[i] - meanX) ** 2
    ssXY += (xs[i] - meanX) * (values[i] - meanY)
    ssYY += (values[i] - meanY) ** 2
  }

  if (ssXX === 0) return null
  const slope = ssXY / ssXX
  const intercept = meanY - slope * meanX
  const rSquared = ssYY === 0 ? 1 : (ssXY ** 2) / (ssXX * ssYY)

  return {
    slope,
    intercept,
    rSquared,
    projectedNext: intercept + slope * n,  // extrapolate one step ahead
  }
}
```

**Prediction trigger thresholds (chemistry-specific):**
```typescript
// A pool is "trending toward imbalance" when:
// slope is negative AND projectedNext < target.min * 0.9 (within 10% of low threshold)
// OR slope is positive AND projectedNext > target.max * 1.1 (within 10% of high threshold)
// AND rSquared >= 0.4 (trend is real enough to alert on)
// AND data >= 6 visits (6-week minimum per user decision)
const MIN_VISITS_FOR_PREDICTION = 6
const TREND_CONFIDENCE_THRESHOLD = 0.4
```

### Pattern 5: ETA Calculation
**What:** Compute arrival time for customer N using tech's current GPS position, remaining stops before N, historical avg service duration per stop, and ORS drive time between stops.
**Algorithm:**
```typescript
// ETA for stop at position P in route:
// eta = now + sum(drive_time[i→i+1] for i=current..P-1) + sum(avg_service_duration for i=current..P-1)
//
// drive_time: from ORS directions (already have getRouteDirections() in optimize.ts)
// avg_service_duration: median of (completed_at - started_at) for last 20 stops by org
//                       stored as a pre-computed value in org_settings or computed fresh

// Historical duration: query service_visits where completed_at IS NOT NULL
// and started_at IS NOT NULL, group by pool_id for pool-specific duration
// or org-wide median as fallback (~25 minutes is typical for pool service)
const DEFAULT_SERVICE_DURATION_MINUTES = 25
```

**GPS data source:** `useGpsBroadcast` already broadcasts to `dispatch:${orgId}` Realtime channel. Customer portal can subscribe to same channel filtered by tech_id and use last known position for ETA calc.

### Pattern 6: Equipment Health Scoring
**What:** New `equipment_readings` table stores periodic metric readings (salt_ppm, filter_psi, pump_rpm, heater_delta_f). Compute trend vs seasonal baseline; fire alert when degradation exceeds threshold.
**Schema:**
```typescript
// equipment_readings table
{
  id: uuid,
  org_id: uuid,
  equipment_id: uuid,          // references equipment.id
  pool_id: uuid,
  recorded_at: timestamp,
  // Equipment-type-specific metrics stored as key-value in JSONB
  metrics: jsonb,              // { salt_ppm: 2800, filter_psi: 18, pump_flow_gpm: 45 }
  recorded_by_id: uuid,        // tech who logged it
  notes: text | null,
}

// Degradation threshold: 30% drop from rolling 8-reading baseline
// e.g. salt_ppm baseline = avg of first 4 readings; if latest < baseline * 0.70 → alert
const DEGRADATION_THRESHOLD_PCT = 0.30
```

### Anti-Patterns to Avoid
- **Never query service_visits JSONB in SQL for prediction:** Pull rows with Drizzle, parse JSONB in TypeScript, run OLS in memory. Postgres JSONB queries for time-series values are complex and hard to optimize.
- **Never block the cron response on push notifications:** Send push notifications asynchronously with `Promise.allSettled()`. A 410 Gone from the push service should silently clean up the subscription, not throw.
- **Never store the VAPID private key in `NEXT_PUBLIC_` env var:** Only `NEXT_PUBLIC_VAPID_PUBLIC_KEY` is client-safe. `VAPID_PRIVATE_KEY` must be server-only.
- **Never use alert_type deduplication for weather proposals:** Weather proposals change daily — each new forecast window is a new proposal. Use `weather_reschedule_proposals` table, not the `alerts` unique constraint.
- **Never subscribe to Supabase Realtime postgres_changes for DELETE events with a filter:** This is a documented Supabase limitation — filters are ignored on DELETE events. Use a `dismissed_at` pattern instead of hard deletes for notifications.
- **Never run OLS regression with fewer than 3 data points:** Return `null` and show no prediction UI; wait for sufficient data.

---

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Web Push encryption | Custom VAPID signing logic | `web-push` npm package | RFC 8030 + RFC 8291 encryption is non-trivial; web-push handles all browser push services |
| Weather data | Scraping or proprietary API | Open-Meteo REST API | Free, no key, 7-day forecast, WMO codes, JSON — 1 fetch call |
| Route drive time for ETA | Haversine distance estimate | `getRouteDirections()` in `optimize.ts` | Already implemented; returns real road time in minutes |
| Service worker offline + push | Custom SW from scratch | Extend existing Serwist `src/app/sw.ts` | Serwist already installed; just add push event listener to existing file |
| Notification delivery to customer (SMS/email) | New send infrastructure | Existing Edge Functions (send-pre-arrival pattern) | Consistent with Phases 5 + 7 pattern; same Twilio/Resend infrastructure |
| Linear regression | TensorFlow.js | 20-line pure TypeScript OLS | No bundle overhead; sufficient for linear chemistry trends |

**Key insight:** This phase is almost entirely extension of existing infrastructure. The GPS broadcast, route optimizer, chemistry engine, alert system, notification templates, and Edge Function pattern are all in place. The big new infrastructure is (1) the push subscription + notification center tables and (2) Open-Meteo integration.

---

## Common Pitfalls

### Pitfall 1: iOS Safari Push Notifications Require PWA Install First
**What goes wrong:** On iOS, Web Push only works when the PWA is installed to the home screen (iOS 16.4+). Trying to subscribe to push in a browser tab silently fails or throws.
**Why it happens:** Apple requires PWA installation before granting push permission on iOS for security reasons.
**How to avoid:** Check `window.matchMedia('(display-mode: standalone)').matches` before showing push permission prompt on iOS. Show install prompt first on iOS; show push prompt only after install or on non-iOS.
**Warning signs:** `pushManager.subscribe()` throws "AbortError" or permission is "denied" immediately on iOS Safari.

### Pitfall 2: Push Subscription 410 Gone Leaks
**What goes wrong:** Subscriptions expire or users revoke permission. Old subscriptions pile up in the DB. Sending to them throws 410 Gone errors.
**Why it happens:** Browser push subscriptions have no guaranteed TTL — they expire silently.
**How to avoid:** In `Promise.allSettled()` over push sends, catch errors with `statusCode === 410` and DELETE the subscription row immediately.
**Warning signs:** Growing `push_subscriptions` table with increasing send failures over time.

### Pitfall 3: Supabase Realtime Replica Identity
**What goes wrong:** postgres_changes subscription only receives `new` record on INSERT; UPDATE events show only changed columns without full record context.
**Why it happens:** Default Postgres REPLICA IDENTITY is `default` (primary key only). Without `FULL`, UPDATE events don't include old row values.
**How to avoid:** For `user_notifications`, only INSERT events are needed (mark as read via separate update + query). Don't subscribe to UPDATE events unless `REPLICA IDENTITY FULL` is set.
**Warning signs:** UPDATE event payload shows only `{ id: "...", read_at: "..." }` with no other fields.

### Pitfall 4: Weather API Missing Thunderstorm Detection for US Pools
**What goes wrong:** WMO codes 96 and 99 (thunderstorm with hail) are documented as "only available in Central Europe" by Open-Meteo. US pools will miss hail-specific alerts.
**Why it happens:** Open-Meteo's hail detection relies on European weather model data.
**How to avoid:** For US, use WMO code 95 (thunderstorm) plus `precipitation_probability_max >= 70%` as the combined trigger for storm-day reschedule suggestions. This is the same effective signal.
**Warning signs:** US customers never getting hail/storm reschedule proposals even on stormy days.

### Pitfall 5: OLS Regression False Positives on Noisy Pool Chemistry
**What goes wrong:** A single bad reading (mis-keyed value, carry-over from previous pool) skews the trend line and triggers a false predictive alert.
**Why it happens:** OLS is sensitive to outliers.
**How to avoid:** Clamp input values to [0, physical_max] before regression. Require R² >= 0.4 to consider trend reliable before alerting. Show "Early prediction" label for < 3 months of data.
**Warning signs:** Predictive alerts firing constantly or contradicting actual readings.

### Pitfall 6: ETA Drift Without Cap
**What goes wrong:** ETA is recalculated on every GPS ping (every 10-15 seconds). Customer receives SMS every time ETA shifts slightly. Customer gets spammed.
**Why it happens:** Naive re-notification on any ETA change.
**How to avoid:** Enforce the 2-update cap per visit, 15-minute minimum shift threshold (locked decisions). Track `eta_sms_count` on the route_stop row and check before sending.
**Warning signs:** Customer complaining about receiving multiple ETA texts per visit.

### Pitfall 7: Notification Fan-Out on Large Orgs
**What goes wrong:** A single event (e.g. weather reschedule affecting 40 stops) creates 40+ push notifications synchronously, causing timeouts in server actions.
**Why it happens:** `sendPushToUser()` called in a loop inside a server action.
**How to avoid:** Queue push sends via a Supabase Edge Function invoked after the server action returns. The Edge Function handles fan-out asynchronously with `Promise.allSettled()`.
**Warning signs:** Server action timeout (>10s) when approving large weather reschedule proposals.

### Pitfall 8: REPLICA IDENTITY and RLS on push_subscriptions
**What goes wrong:** RLS blocks admin queries on `push_subscriptions` when sending notifications from server.
**Why it happens:** `push_subscriptions` may be protected by RLS but the sending context is not user-scoped.
**How to avoid:** Use `adminDb` (service role) for all push subscription reads/writes in server-side send functions. The user can only manage their own subscriptions via `withRls` (subscribe/unsubscribe actions).

---

## Code Examples

### Fetch 7-Day Forecast from Open-Meteo
```typescript
// Source: open-meteo.com/en/docs — verified 2026-03-16
interface OpenMeteoForecast {
  daily: {
    time: string[]
    weather_code: number[]
    precipitation_sum: number[]
    precipitation_probability_max: number[]
    wind_gusts_10m_max: number[]
    temperature_2m_max: number[]
  }
}

export async function fetchWeatherForecast(
  lat: number,
  lng: number,
  timezone: string = 'auto'
): Promise<OpenMeteoForecast | null> {
  const url = new URL('https://api.open-meteo.com/v1/forecast')
  url.searchParams.set('latitude', String(lat))
  url.searchParams.set('longitude', String(lng))
  url.searchParams.set('daily', [
    'weather_code',
    'precipitation_sum',
    'precipitation_probability_max',
    'wind_gusts_10m_max',
    'temperature_2m_max',
  ].join(','))
  url.searchParams.set('timezone', timezone)
  url.searchParams.set('forecast_days', '7')
  url.searchParams.set('wind_speed_unit', 'mph')
  url.searchParams.set('temperature_unit', 'fahrenheit')
  url.searchParams.set('precipitation_unit', 'inch')

  const res = await fetch(url.toString(), {
    next: { revalidate: 3600 },  // cache 1 hour
  })
  if (!res.ok) return null
  return res.json()
}

export function classifyWeatherDay(forecast: OpenMeteoForecast, dayIndex: number): {
  type: 'clear' | 'rain' | 'storm' | 'heat' | 'wind'
  label: string
  shouldReschedule: boolean
} {
  const code = forecast.daily.weather_code[dayIndex]
  const precipProb = forecast.daily.precipitation_probability_max[dayIndex]
  const precipIn = forecast.daily.precipitation_sum[dayIndex]
  const windGustMph = forecast.daily.wind_gusts_10m_max[dayIndex]
  const tempMaxF = forecast.daily.temperature_2m_max[dayIndex]

  if ([95, 96, 99].includes(code) || (precipProb >= 70 && [61,63,65].includes(code))) {
    return { type: 'storm', label: 'Thunderstorm risk', shouldReschedule: true }
  }
  if (precipIn >= 0.4 || precipProb >= 70) {  // 0.4in = ~10mm
    return { type: 'rain', label: 'Heavy rain', shouldReschedule: true }
  }
  if (windGustMph >= 40) {
    return { type: 'wind', label: 'High winds', shouldReschedule: true }
  }
  if (tempMaxF >= 105) {
    return { type: 'heat', label: 'Extreme heat', shouldReschedule: true }
  }
  return { type: 'clear', label: 'Clear', shouldReschedule: false }
}
```

### Subscribe to Web Push (Client)
```typescript
// Source: Next.js official PWA guide (2026-02-27)
// Place in a client component that runs after first login

function urlBase64ToUint8Array(base64String: string): Uint8Array {
  const padding = '='.repeat((4 - (base64String.length % 4)) % 4)
  const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/')
  const rawData = window.atob(base64)
  return new Uint8Array([...rawData].map(c => c.charCodeAt(0)))
}

export async function subscribeToPush(): Promise<void> {
  if (!('serviceWorker' in navigator) || !('PushManager' in window)) return

  const registration = await navigator.serviceWorker.ready
  let sub = await registration.pushManager.getSubscription()

  if (!sub) {
    sub = await registration.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: urlBase64ToUint8Array(
        process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY!
      ),
    })
  }

  // Persist to DB via server action
  const serialized = JSON.parse(JSON.stringify(sub))
  await subscribeUserPush(serialized)  // server action
}
```

### PWA Install Prompt Component
```typescript
// Source: Next.js official PWA guide (2026-02-27) — adapted for 7-day snooze
'use client'
import { useState, useEffect } from 'react'

export function PwaInstallPrompt() {
  const [showPrompt, setShowPrompt] = useState(false)
  const [isIOS, setIsIOS] = useState(false)

  useEffect(() => {
    const isStandalone = window.matchMedia('(display-mode: standalone)').matches
    if (isStandalone) return  // already installed

    const snoozedUntil = localStorage.getItem('pwa-install-snoozed')
    if (snoozedUntil && Date.now() < Number(snoozedUntil)) return

    setIsIOS(/iPad|iPhone|iPod/.test(navigator.userAgent))
    setShowPrompt(true)
  }, [])

  function handleDismiss() {
    localStorage.setItem('pwa-install-snoozed', String(Date.now() + 7 * 24 * 3600 * 1000))
    setShowPrompt(false)
  }

  if (!showPrompt) return null

  return (
    <div className="fixed bottom-4 left-4 right-4 z-50 rounded-lg border bg-card p-4 shadow-lg">
      <p className="text-sm font-medium">Install PoolCo for the best experience</p>
      <p className="mt-1 text-xs text-muted-foreground">
        Works offline, faster, and supports push notifications
      </p>
      {isIOS && (
        <p className="mt-2 text-xs text-muted-foreground">
          Tap the share button and choose "Add to Home Screen"
        </p>
      )}
      <div className="mt-3 flex gap-2">
        <button onClick={handleDismiss} className="text-xs text-muted-foreground">
          Not now
        </button>
      </div>
    </div>
  )
}
```

---

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| next-pwa | @serwist/next | 2023 (already migrated in this project) | Maintained SW management with Workbox |
| GCM (Google Cloud Messaging) | VAPID Web Push standard | 2017 | No Google dependency; works on all browsers |
| Polling for notifications | Supabase Realtime postgres_changes | Available in project now | Zero-latency in-app bell updates |
| iOS push requires native app | iOS 16.4+ PWA push support | 2023 | Web push now viable for iOS field tech use |
| Alert-only chemistry monitoring | Predictive alerts with regression | This phase | Proactive vs reactive |

**Deprecated/outdated:**
- FCM for web push: Works but adds Google dependency and requires service account setup. VAPID is simpler and cross-browser including Safari.
- `next-pwa`: Superseded by `@serwist/next` which is already installed in this project.

---

## Open Questions

1. **Tech GPS broadcasting while screen is off (iOS)**
   - What we know: `navigator.geolocation.watchPosition` stops reporting when iOS screen turns off in a PWA. The existing `useGpsBroadcast` hook is explicit about this: "GPS tracked only while app is open."
   - What's unclear: For ETA purposes, how often does the GPS go stale? Is 10-minute staleness acceptable for customer ETA display?
   - Recommendation: Accept the iOS limitation. Show "Last updated X minutes ago" in the portal ETA view. Recalculate ETA based on last known position + schedule order when GPS is stale >5 min.

2. **Weather API rate limits for multi-org SaaS**
   - What we know: Open-Meteo docs don't disclose specific rate limits but mention "fair use" and recommend contacting them if exceeding 10,000 requests/day.
   - What's unclear: With many orgs each having a different location, how many forecast calls per day? Each org needs 1 call/day (caching 1 hour). 100 orgs = 100 calls/day — well within limits.
   - Recommendation: Cache forecast per org per day in `org_settings.weather_cache` JSONB or a simple Redis/Supabase key, refreshed at 6am. Batch all orgs in a single cron run.

3. **Push notification for tech role on non-PWA browser**
   - What we know: Push requires service worker. Techs using Chrome on Android will get push without PWA install. Techs on iOS must install PWA first.
   - What's unclear: Should push be gated behind PWA install, or attempted in browser too?
   - Recommendation: Attempt subscription in any browser that supports it (`'PushManager' in window`). The install prompt is separate UX — it's possible to have push without being installed on non-iOS.

4. **Equipment readings collection workflow**
   - What we know: Equipment model has no readings column. We need a new `equipment_readings` table. But when do techs log readings? During stop completion? Separately?
   - What's unclear: Whether readings should be added to the existing stop completion modal or be a separate equipment detail view.
   - Recommendation: Add equipment readings as an optional section within the stop completion modal — if the stop's pool has tracked equipment, show collapsible "Equipment readings" section. Store in `equipment_readings` linked to the service_visit_id.

5. **Broadcast messaging segmentation scope**
   - What we know: User decided broadcast messaging is in scope. But the spec doesn't define which segments are supported (all customers, by route, by tech, by service type, etc.).
   - What's unclear: How granular should the segmentation UI be in Phase 10 vs a later phase?
   - Recommendation: Phase 10 supports: "All active customers", "Customers on [tech]'s route", "All customers". Defer fine-grained segment builder (by pool type, by billing model, etc.) to a future phase.

---

## Sources

### Primary (HIGH confidence)
- `open-meteo.com/en/docs` — verified 2026-03-16: daily variables, WMO codes, free tier, no API key required
- `nextjs.org/docs/app/guides/progressive-web-apps` — official Next.js PWA + push guide, last updated 2026-02-27: service worker push handler, VAPID setup, install prompt pattern, `web-push` library usage
- Project source code — `src/lib/chemistry/dosing.ts`, `src/lib/chemistry/targets.ts`, `src/lib/chemistry/lsi.ts`: existing engine capabilities
- Project source code — `src/actions/optimize.ts`: existing ORS integration, `getRouteDirections()` already available
- Project source code — `src/hooks/use-gps-broadcast.ts`: GPS broadcast via `dispatch:${orgId}` Supabase Realtime already working
- Project source code — `src/lib/db/schema/alerts.ts`: existing alert system with `DECLINE_THRESHOLDS`
- `supabase.com/docs/guides/realtime/postgres-changes` — verified: filter syntax, RLS integration, DELETE limitation, REPLICA IDENTITY

### Secondary (MEDIUM confidence)
- `makerkit.dev/blog/tutorials/real-time-notifications-supabase-nextjs` — notification schema pattern, Realtime subscription with React Query; verified against Supabase official docs
- `npmjs.com/package/web-push` + `npmjs.com/package/@types/web-push` — existence and TypeScript types confirmed via search; version 3.6.x with types 3.6.4
- WMO weather codes from Open-Meteo docs: thunderstorm codes 95/96/99, rain codes 61/63/65 — confirmed

### Tertiary (LOW confidence)
- iOS watchPosition stops with screen off — documented behavior from multiple community sources, not official Apple/W3C spec language; treat as known behavior to design around but verify in testing
- Open-Meteo "~10,000 req/day" fair use guidance — from documentation but no hard SLA; verify at scale

---

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH — web-push and Open-Meteo are confirmed standard tools; Serwist already in project
- Architecture: HIGH — extends existing patterns (ORS, Supabase Realtime, Edge Functions, alert system)
- Pitfalls: HIGH — iOS push, 410 Gone cleanup, and OLS false positives are verified known issues
- Prediction algorithm: MEDIUM — OLS is correct math; the chemistry-specific thresholds need tuning in practice
- Equipment degradation thresholds: MEDIUM — 30% drop heuristic is reasonable but industry-specific; may need adjustment

**Research date:** 2026-03-16
**Valid until:** 2026-06-16 (stable stack; Open-Meteo API format unlikely to change)
