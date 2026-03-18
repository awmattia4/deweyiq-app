---
phase: 10-smart-features-ai
verified: 2026-03-16T18:09:57Z
status: gaps_found
score: 14/18 success criteria verified
gaps:
  - truth: "Office staff can assign and schedule a work order directly from the WO detail page — system recommends optimal day and tech based on WO address proximity to existing route stops, tech workload, and travel time"
    status: failed
    reason: "No plan in Phase 10 implements this. No getScheduleRecommendation action exists, no recommendation UI in wo-detail.tsx. The 17 plans cover all other success criteria but none claims this one. It was defined in ROADMAP.md as Success Criterion 16 but was never planned."
    artifacts:
      - path: "src/components/work-orders/wo-detail.tsx"
        issue: "No smart scheduling UI — no recommendation panel, no assign-from-detail flow"
      - path: "src/actions/work-orders.ts"
        issue: "No getScheduleRecommendation or recommendOptimalSlot function"
    missing:
      - "Server action: getScheduleRecommendation(woId) — queries WO address proximity to existing route stops, tech workload, returns top 3 recommended (date, techId, proximityScore, estimatedTravelMinutes)"
      - "UI: WO detail scheduling panel — shows recommendation with override capability, office can accept or select different date/tech"
      - "Integration: accepted recommendation writes route_stop + updates WO assigned_tech_id and target_date"

  - truth: "Every significant platform event triggers a notification via in-app push + email — specifically NOTIF-07 (cant-complete), NOTIF-08 (route finished), NOTIF-18 (weather proposal created), NOTIF-22 (tech weather alert)"
    status: partial
    reason: "NOTIF-07, NOTIF-08 (route_finished half), NOTIF-18, and NOTIF-22 have TODO comments in code and are explicitly not wired. The markCantComplete action does not exist yet. The weather cron creates proposals without notifying office. Tech weather badge exists but does not fire notifyUser."
    artifacts:
      - path: "src/actions/visits.ts"
        issue: "Line 1024: TODO(10-10) — NOTIF-07 stop_cant_complete wiring deferred"
      - path: "src/actions/notifications.ts"
        issue: "Lines 291-304: TODO(10-10) — NOTIF-08 route_finished, NOTIF-18 weather_proposal, NOTIF-22 tech_weather_alert all deferred"
      - path: "src/app/api/cron/weather-check/route.ts"
        issue: "Weather proposals created without triggering NOTIF-18 notification to owner/office"
    missing:
      - "NOTIF-07: Wire notifyOrgRole when stop is marked cant-complete (once markCantComplete action is added)"
      - "NOTIF-08 (route_finished half): Wire notifyOrgRole when tech finishes route (once finishRoute action is added)"
      - "NOTIF-18: In checkWeatherForOrg(), after creating a proposal, call notifyOrgRole(orgId, 'owner+office', { type: 'weather_proposal', ... })"
      - "NOTIF-22: In routes page weather fetch, after classifying weather as severe, call notifyUser(techId, orgId, { type: 'tech_weather_alert', ... })"

human_verification:
  - test: "Smart chemical dosing shows weather/history badges in completion modal"
    expected: "When tech opens completion modal on a hot day or for a pool with trending chemistry, dosing recommendations show modifier badges (e.g. '+15% heat adjustment')"
    why_human: "Weather API call + history query happens server-side; need to exercise in a live dev environment"
  - test: "Predictive chemistry alert appears on dashboard before imbalance occurs"
    expected: "Dashboard shows 'Predictive Chemistry Trends' section with pool name, parameter, and trend direction for pools that have 6+ service visits with trending chemistry"
    why_human: "Requires test data with 6+ service visits showing trend — can't verify programmatically"
  - test: "Auto-schedule produces balanced workload with before/after comparison"
    expected: "Clicking 'Balance Workload' on Schedule page opens dialog showing current tech distribution, then generates proposal with geographic clustering applied"
    why_human: "Requires populated route_stops data for a week to be meaningful"
  - test: "AI-Optimized badge appears in optimize preview"
    expected: "When >= 50% of stops have historical duration data, optimize preview shows 'AI-Optimized' badge; otherwise shows 'Standard Optimization'"
    why_human: "Requires completed stop data (started_at + completed_at) in route_stops"
  - test: "Weather reschedule proposal appears on Alerts page after cron runs"
    expected: "After weather-check cron runs and detects storm conditions, a proposal card appears on Alerts page with affected stops, proposed new dates, notify-customers toggle, and Approve/Deny actions"
    why_human: "Requires cron execution with stormy forecast data from Open-Meteo"
  - test: "ETA countdown visible in customer portal"
    expected: "Customer visiting /portal/eta sees a live countdown with tech's estimated arrival time, updating via Supabase Broadcast as tech GPS pings"
    why_human: "Requires active tech on a route with GPS broadcasting"
  - test: "Push notification delivers to device when stop is completed"
    expected: "After subscribing to push notifications, completing a stop on a different device triggers a native push notification on the subscribed device"
    why_human: "Requires VAPID keys configured in environment and a device with push subscription"
  - test: "PWA install prompt appears on first visit and snoozes correctly"
    expected: "Bottom banner appears when app is not installed; dismissing snoozes it for 7 days; on iOS, shows step-by-step instructions"
    why_human: "Requires testing on actual mobile device / non-PWA context"
---

# Phase 10: Smart Features & AI Verification Report

**Phase Goal:** The platform uses accumulated operational data to optimize routes with ML, predict chemistry problems before they happen, and automatically balance technician workloads — making the system actively smarter the longer it runs

**Verified:** 2026-03-16T18:09:57Z
**Status:** gaps_found
**Re-verification:** No — initial verification

---

## Goal Achievement

### Observable Truths (Success Criteria)

| #  | Truth | Status | Evidence |
|----|-------|--------|---------|
| 1  | Smart chemical dosing uses weather + service history modifiers | VERIFIED | `dosing.ts` exports `DosingContext` with `temperature_f` + `historyReadings`; `getWeatherModifier()` and `getHistoryModifier()` apply ±25%/±15% chlorine adjustments; `DoseModifier[]` returned on each recommendation for UI badge rendering |
| 2  | Predictive chemistry alerts shown to office before imbalance occurs | VERIFIED | `_generatePredictiveChemistryAlerts()` in `alerts.ts` runs OLS via `computeLinearTrend()`, requires R²>=0.4 and 6+ visits; `getPredictiveAlerts()` wired to dashboard page; `getPredictiveAlertsForPools()` wired to tech stop cards |
| 3  | Auto-schedule engine produces ready-to-approve weekly route proposal | VERIFIED | `autoScheduleWeek()` + `applyAutoSchedule()` in `schedule.ts`; `WorkloadBalancer` dialog with before/after comparison; `WorkloadBalancerTrigger` on Schedule page |
| 4  | AI route optimizer shows before/after drive time comparison with AI-Optimized badge | VERIFIED | `fetchHistoricalServiceDurations()` feeds VROOM job `service` times; `OptimizationResult` includes `currentTotalTimeMinutes`, `usedHistoricalDurations`, `historicalCoverage`; `OptimizePreview` shows AI-Optimized badge at >=50% coverage |
| 5  | Weather reschedule proposals created and approvable with one click | VERIFIED | `weather-proposals.ts` schema; `checkWeatherForOrg()` + `findRescheduleSlots()` + `approveProposal()`; `RescheduleProposalCard` on Alerts page; daily cron at `/api/cron/weather-check` |
| 6  | Techs see per-stop weather badges on route view | VERIFIED | `WeatherBadge` component; `getRouteAreaCoordinates()` in `routes.ts`; weather threaded through `StopList` → `StopCard`; null-as-clear pattern (no badge on clear days) |
| 7  | System finds optimal reschedule windows for weather-displaced stops | VERIFIED | `findRescheduleSlots()` in `reschedule-engine.ts` uses haversine + centroid scoring with 3 weighted factors (load 40%, proximity 35%, preferred day 25%); `manualWeatherCheck()` for office-initiated check |
| 8  | Every platform event triggers in-app + push notifications | PARTIAL — 4 gaps | NOTIF-07 (cant-complete), NOTIF-08 (route_finished half), NOTIF-18 (weather proposal), NOTIF-22 (tech weather alert) are TODO stubs; all others wired |
| 9  | Every customer-facing notification delivered via email + SMS | VERIFIED | NOTIF-24 through NOTIF-32 implemented: pre-arrival (email+SMS in `notifications.ts`), service report (`visits.ts`), invoice (`invoices.ts`), payment receipt/failure (`webhook-handlers.ts`), quote (`quotes.ts`), weather delay (`weather.ts`), WO status (`work-orders.ts`), portal reply (`portal-messages.ts`) |
| 10 | All notification types independently toggleable with customizable templates | VERIFIED | `notification_preferences` table + `NotificationPreferences` UI in Settings; `template_editor.tsx` with per-type subject/body/SMS/merge-tag editing; `getResolvedTemplate()` engine used everywhere |
| 11 | Dynamic ETA delivered to customers via SMS with live portal countdown | VERIFIED | `calculator.ts` haversine ETA engine; `eta.ts` with `triggerEtaNotifications()` + 2-send cap; `portal-eta.ts` + `EtaTracker` component at `/portal/eta`; `EtaOverlay` on dispatch page |
| 12 | Equipment performance trends tracked with degradation alerts | VERIFIED | `equipment_readings` table; `logEquipmentReading()` + `checkDegradation()` + `getEquipmentHealth()` in `equipment-readings.ts`; `EquipmentReadingsSection` in completion modal; `HealthBadge` on customer equipment tab |
| 13 | Unresponsive tech safety alert after 30+ minutes inactive | VERIFIED | `checkUnresponsiveTechs()` in `safety.ts`; 5-min cron at `/api/cron/safety-check`; configurable `safety_escalation_chain` in `org_settings`; `SafetySettings` UI in Settings > Service tab |
| 14 | Techs can leave internal service notes visible only to office/owner | VERIFIED | `internal_notes` + `internal_flags` columns on `service_visits`; `InternalNotes` component in `stop-workflow.tsx`; role-gated in `ServiceHistoryTimeline` (`canSeeInternalNotes = userRole === 'owner' or 'office'`) |
| 15 | Owner can send broadcast email/SMS to customer segments | VERIFIED | `sendBroadcast()` + `getSegmentCount()` in `broadcast.ts`; 4 segment types (all, active, tech_route, individual); `BroadcastMessaging` UI in Settings > Company tab; confirmation dialog with recipient counts |
| 16 | Office can schedule WO from WO detail page with smart recommendation | FAILED | No plan implemented this. No `getScheduleRecommendation()` action exists. `wo-detail.tsx` has no scheduling UI. The feature was defined in ROADMAP.md Success Criterion 16 but was never assigned to any plan. |
| 17 | PWA install prompt with 7-day snooze, iOS instructions | VERIFIED | `PwaInstallPrompt` component with `beforeinstallprompt` capture, iOS step-by-step, 7-day localStorage snooze; wired in `AppShell` |
| 18 | Push notification permission prompt with Web Push delivery | VERIFIED | `PushPermissionPrompt` + `subscribe.ts` VAPID client; service worker `push` event handler + `notificationclick` handler in `sw.ts`; `push_subscriptions` table; `sendPushToUser()` in `push.ts` |

**Score:** 14/18 truths verified (2 partial failures rolled into 2 gap items)

---

## Required Artifacts

| Artifact | Plan | Status | Notes |
|----------|------|--------|-------|
| `src/lib/weather/open-meteo.ts` | 10-01 | VERIFIED | 6611 bytes, substantive |
| `src/lib/chemistry/prediction.ts` | 10-01 | VERIFIED | `computeLinearTrend` + OLS implementation, R², slope, projectedNext |
| `src/lib/chemistry/dosing.ts` | 10-01 | VERIFIED | `DosingContext`, `DoseModifier`, weather + history modifiers wired |
| `src/actions/alerts.ts` | 10-02 | VERIFIED | `_generatePredictiveChemistryAlerts`, `getPredictiveAlerts`, `getPredictiveAlertsForPools` |
| `src/components/alerts/alert-card.tsx` | 10-02 | VERIFIED | `PredictiveChemistryDetail` sub-component with trend icons |
| `src/components/schedule/workload-balancer.tsx` | 10-03 | VERIFIED | 3-phase dialog: balance → proposal → applying |
| `src/components/schedule/workload-balancer-trigger.tsx` | 10-03 | VERIFIED | Wired to Schedule page header |
| `src/actions/optimize.ts` | 10-04 | VERIFIED | Historical durations, VROOM service field, AI badge logic |
| `src/components/schedule/optimize-preview.tsx` | 10-04 | VERIFIED | Drive+total time display, per-stop ClockIcon, AI-Optimized badge |
| `src/lib/db/schema/weather-proposals.ts` | 10-06 | VERIFIED | Schema with RLS |
| `src/lib/weather/reschedule-engine.ts` | 10-06 | VERIFIED | Haversine + centroid scoring |
| `src/actions/weather.ts` | 10-06 | VERIFIED | Full proposal lifecycle functions |
| `src/app/api/cron/weather-check/route.ts` | 10-06 | VERIFIED | CRON_SECRET protected |
| `src/components/weather/reschedule-proposal-card.tsx` | 10-06 | VERIFIED | Expandable, approve/deny actions |
| `src/components/weather/weather-badge.tsx` | 10-07 | VERIFIED | Rain/storm/heat/wind pills with hex colors |
| `src/lib/db/schema/user-notifications.ts` | 10-09 | VERIFIED | In-app notification table with RLS |
| `src/lib/db/schema/push-subscriptions.ts` | 10-09 | VERIFIED | Web Push subscription storage |
| `src/lib/db/schema/notification-prefs.ts` | 10-09 | VERIFIED | Per-user per-type channel overrides |
| `src/lib/notifications/dispatch.ts` | 10-09 | VERIFIED | `notifyUser`, `notifyOrgRole`, `NOTIFICATION_TYPE_CONFIG` |
| `src/actions/push.ts` | 10-09 | VERIFIED | `sendPushToUser`, subscription management |
| `src/actions/user-notifications.ts` | 10-11 | VERIFIED | 7 server actions including preferences |
| `src/components/notifications/notification-bell.tsx` | 10-11 | VERIFIED | Realtime unread count |
| `src/components/notifications/notification-panel.tsx` | 10-11 | VERIFIED | Grouped by urgency |
| `src/components/settings/notification-preferences.tsx` | 10-11 | VERIFIED | Per-type toggle grid |
| `src/lib/eta/calculator.ts` | 10-12 | VERIFIED | `computeEta` haversine engine |
| `src/actions/eta.ts` | 10-12 | VERIFIED | `triggerEtaNotifications`, `sendEtaNotification`, 2-cap enforcement |
| `src/components/dispatch/eta-overlay.tsx` | 10-12 | VERIFIED | Wired in `dispatch-client-shell.tsx` |
| `src/components/portal/eta-tracker.tsx` | 10-12 | VERIFIED | Supabase Broadcast GPS subscription |
| `src/app/portal/(portal)/eta/page.tsx` | 10-12 | VERIFIED | Portal ETA page server component |
| `src/lib/db/schema/equipment-readings.ts` | 10-13 | VERIFIED | JSONB metrics, RLS |
| `src/actions/equipment-readings.ts` | 10-13 | VERIFIED | `logEquipmentReading`, `getEquipmentHealth`, `checkDegradation` |
| `src/components/field/equipment-readings-section.tsx` | 10-13 | VERIFIED | Collapsible, wired in `completion-modal.tsx` |
| `src/actions/safety.ts` | 10-14 | VERIFIED | `checkUnresponsiveTechs`, `dismissSafetyAlert`, escalation chain |
| `src/app/api/cron/safety-check/route.ts` | 10-14 | VERIFIED | 5-min cron endpoint |
| `src/components/settings/safety-settings.tsx` | 10-14 | VERIFIED | Configurable escalation chain UI |
| `src/components/field/internal-notes.tsx` | 10-15 | VERIFIED | `InternalNotes` + `FlagBadge`, wired in `stop-workflow.tsx` |
| `src/actions/broadcast.ts` | 10-16 | VERIFIED | 4 segment types, batched delivery |
| `src/components/settings/broadcast-messaging.tsx` | 10-16 | VERIFIED | Compose UI with segment count preview |
| `src/lib/push/subscribe.ts` | 10-17 | VERIFIED | VAPID subscription lifecycle |
| `src/components/notifications/pwa-install-prompt.tsx` | 10-17 | VERIFIED | 7-day snooze, iOS instructions |
| `src/components/notifications/push-permission-prompt.tsx` | 10-17 | VERIFIED | 24-hour snooze, subscribes on consent |
| `src/app/sw.ts` | 10-17 | VERIFIED | Push event handler + notificationclick |
| **`src/components/work-orders/wo-detail.tsx`** | NONE | **MISSING FEATURE** | No smart scheduling panel — SC-16 not implemented |
| **`src/actions/work-orders.ts` (getScheduleRecommendation)** | NONE | **MISSING FEATURE** | Function does not exist |

---

## Key Link Verification

| From | To | Via | Status | Details |
|------|----|-----|--------|---------|
| `dashboard/page.tsx` | `alerts.ts` | `getPredictiveAlerts()` | WIRED | Line 5 import, line 118 call, lines 236-262 render |
| `routes/page.tsx` | `routes.ts` | `getRouteAreaCoordinates()` | WIRED | Weather fetched, passed to `StopList` as `weather=` prop |
| `stop-list.tsx` | `stop-card.tsx` | `weather` prop | WIRED | Prop threaded through to each stop card |
| `visits.ts` | `dispatch.ts` | `notifyOrgRole()` | WIRED | Lines 770, 804, 960 — stop_complete, stop_skipped, chemistry_alert |
| `webhook-handlers.ts` | `dispatch.ts` | `notifyOrgRole()` | WIRED | Lines 281-282, 444-445 — payment_received, payment_failed |
| `app-header.tsx` | `notification-bell.tsx` | Import + render | WIRED | Line 17 import, line 103 render |
| `app-shell.tsx` | `pwa-install-prompt.tsx` | Import + render | WIRED | Lines 9-10 import, lines 69-72 render |
| `completion-modal.tsx` | `equipment-readings-section.tsx` | Import + render | WIRED | Lines 25-26 import, line 393 render |
| `stop-workflow.tsx` | `internal-notes.tsx` | Import + render | WIRED | Line 34 import, line 606 render |
| `settings-tabs.tsx` | `broadcast-messaging.tsx` | Import + render | WIRED | Line 26 import, line 282 render |
| `dispatch-client-shell.tsx` | `eta-overlay.tsx` | Import + render | WIRED | Line 8 import, line 86 render |
| `portal/eta/page.tsx` | `eta-tracker.tsx` | Import + render | WIRED | Line 5 import, line 38 render |
| `weather.ts` (approveProposal) | `dispatchWeatherRescheduleNotifications()` | Fire-and-forget after approval | WIRED | Customer email + SMS sent on approval |
| `weather.ts` (checkWeatherForOrg) | `notifyOrgRole` (NOTIF-18) | Should notify office on proposal creation | **NOT WIRED** | No `notifyOrgRole` call after proposal insert |
| `notifications.ts` | `notifyOrgRole` (NOTIF-22) | Should notify tech of weather alert | **NOT WIRED** | TODO comment at line 301 |

---

## Requirements Coverage

| Requirement | Source Plan | Description | Status | Evidence |
|-------------|------------|-------------|--------|---------|
| SMART-01 | 10-01 | Smart chemical dosing with weather + history | SATISFIED | `dosing.ts` `DosingContext`, weather + history modifiers |
| SMART-02 | 10-02 | Predictive chemistry alerts | SATISFIED | `_generatePredictiveChemistryAlerts()`, OLS with R²>=0.4 gate |
| SMART-03 | 10-03 | Auto-schedule + workload balance | SATISFIED | `autoScheduleWeek()`, `WorkloadBalancer` dialog |
| SMART-04 | 10-06 | Auto-reschedule on rain/storm | SATISFIED | `checkWeatherForOrg()` + proposal system + `approveProposal()` |
| SMART-05 | 10-07 | Tech weather badges on route view | SATISFIED | `WeatherBadge` wired to `StopCard` via `routes/page.tsx` |
| SMART-06 | 10-06 | Optimal reschedule slot finder | SATISFIED | `findRescheduleSlots()` with haversine + load + preferred-day scoring |
| SMART-07 | 10-08 | Customer notifications for weather delays | SATISFIED | `dispatchWeatherRescheduleNotifications()` fires email + SMS on approval |
| SMART-08 | 10-13 | Equipment performance monitoring + degradation alerts | SATISFIED | `equipment_readings` table, health scoring, tech badges, degradation alerts |
| SCHED-07 | 10-04 | AI route optimization with ML durations | SATISFIED | Historical durations fed to VROOM, AI-Optimized badge, before/after times |
| SCHED-08 | 10-03 | Auto-schedule + workload balance | SATISFIED | Same implementation as SMART-03 |
| NOTIF-05 | 10-10 / 10-15 | Owner/office notified: stop completed | SATISFIED | `notifyOrgRole` in `visits.ts` line 770 |
| NOTIF-06 | 10-10 | Owner/office notified: stop skipped | SATISFIED | `notifyOrgRole` in `visits.ts` line 804 |
| NOTIF-07 | 10-10 | Owner/office notified: cant-complete | BLOCKED | TODO at `visits.ts:1024` — no `markCantComplete` action exists |
| NOTIF-08 | 10-10 | Owner/office notified: route started + finished | PARTIAL | Route_started fires in `notifications.ts:245`; route_finished is TODO at line 291 |
| NOTIF-09 | 10-10 | Owner/office notified: chemistry out of range | SATISFIED | `notifyOrgRole` in `visits.ts` line 960 |
| NOTIF-10 | 10-10 | Owner/office notified: WO created/updated/completed | SATISFIED | `notifyOrgRole` in `work-orders.ts` |
| NOTIF-11 | 10-10 | Owner/office notified: quote approved/rejected | SATISFIED | `notifyOrgRole` in `quotes/[id]/approve/route.ts` |
| NOTIF-12 | 10-10 | Owner/office notified: payment received | SATISFIED | `notifyOrgRole` in `webhook-handlers.ts` lines 281-282 |
| NOTIF-13 | 10-10 | Owner/office notified: payment failed | SATISFIED | `notifyOrgRole` in `webhook-handlers.ts` lines 444-445 |
| NOTIF-14 | 10-10 | Owner/office notified: portal message | SATISFIED | `notifyOrgRole` in `portal-messages.ts` |
| NOTIF-15 | 10-10 | Owner/office notified: service request | SATISFIED | `notifyOrgRole` in `service-requests.ts` |
| NOTIF-16 | 10-10 / 10-16 | Owner/office notified: customer added/cancelled | SATISFIED | `notifyOrgRole` in `customers.ts`; broadcast messaging also satisfies |
| NOTIF-17 | 10-10 | Owner/office notified: invoice overdue | SATISFIED | `notifyOrgRole` in `dunning.ts` |
| NOTIF-18 | 10-10 | Owner/office notified: weather proposal | BLOCKED | TODO at `notifications.ts:296` — `checkWeatherForOrg` creates proposals silently |
| NOTIF-19 | 10-10 | Tech notified: assigned to stop/WO | SATISFIED | `notifyUser` in `schedule.ts` (assignStopToRoute + bulkAssignStops) |
| NOTIF-20 | 10-10 | Tech notified: quote approved | SATISFIED | `notifyUser` in `quotes/[id]/approve/route.ts` |
| NOTIF-21 | 10-10 | Tech notified: schedule changes | SATISFIED | `notifyUser` in `schedule.ts` |
| NOTIF-22 | 10-10 | Tech notified: weather alerts on route | BLOCKED | TODO at `notifications.ts:301` — weather badge exists but push/in-app not sent |
| NOTIF-23 | 10-14 | Owner notified: system events (safety) | SATISFIED | `dismissSafetyAlert` + safety escalation chain uses `notifyUser`; `system_event` type in `NOTIFICATION_TYPE_CONFIG` |
| NOTIF-24 | 10-10 | Customer: pre-arrival email + SMS | SATISFIED | `sendPreArrivalNotifications()` with `getResolvedTemplate()` for both channels |
| NOTIF-25 | 10-10 | Customer: service completion + report link | SATISFIED | `notifyOrgRole` + SMS in `visits.ts` |
| NOTIF-26 | 10-10 | Customer: invoice email + SMS | SATISFIED | `getResolvedTemplate(orgId, "invoice_email")` + `"invoice_sms"` in `invoices.ts` |
| NOTIF-27 | 10-10 | Customer: payment confirmation | SATISFIED | Payment receipt email + SMS in `webhook-handlers.ts` |
| NOTIF-28 | 10-10 | Customer: payment failure / dunning | SATISFIED | Dunning email + SMS in `dunning.ts` |
| NOTIF-29 | 10-10 | Customer: quote ready | SATISFIED | `getResolvedTemplate(orgId, "quote_email")` + `"quote_sms"` in `quotes.ts` |
| NOTIF-30 | 10-08 | Customer: weather delay | SATISFIED | `dispatchWeatherRescheduleNotifications()` in `weather.ts` |
| NOTIF-31 | 10-10 | Customer: WO status updates | SATISFIED | WO status SMS via `getResolvedTemplate(orgId, "wo_status_sms")` in `work-orders.ts` |
| NOTIF-32 | 10-10 | Customer: portal message replies | SATISFIED | SMS dispatch in `portal-messages.ts` |
| NOTIF-33 | 10-11 / 10-17 | All types independently toggleable, customizable templates | SATISFIED | `notification_preferences` table + `NotificationPreferences` UI; `template_editor.tsx` with full edit capability; `getResolvedTemplate()` used across all sends |
| NOTIF-34 | 10-12 | Dynamic ETA engine + portal countdown | SATISFIED | `calculator.ts` + `eta.ts` + `EtaTracker` + `/portal/eta`; 2-send cap; dispatch overlay |

---

## Anti-Patterns Found

| File | Line | Pattern | Severity | Impact |
|------|------|---------|----------|--------|
| `src/actions/weather.ts` | 232 | `.select({ max_daily_capacity: orgSettings.id })` — using primary key as placeholder since `max_daily_capacity` column doesn't exist | Warning | `orgSettingsRow` is queried but never used — capacity checking is silently absent from reschedule slot finder |
| `src/actions/visits.ts` | 1024 | `// TODO(10-10): Wire NOTIF-07 (stop_cant_complete)` | Warning | Owner/office not notified when tech can't access a stop — useful for follow-up |
| `src/actions/notifications.ts` | 291–304 | Three TODO comments for NOTIF-08 route_finished, NOTIF-18 weather_proposal, NOTIF-22 tech_weather_alert | Warning | These notifications documented but not wired; affects SC-8 completeness |

---

## Human Verification Required

### 1. Smart Dosing Badge Display in Completion Modal

**Test:** Open a stop's completion modal on a hot day (>86°F) or for a pool with 3+ months of chemistry history. Check that dosing recommendations include modifier badges (e.g., "+15% heat adjustment", "+10% trend adjustment").

**Expected:** Recommendations show `DoseModifier[]` badges for applicable modifiers with descriptive labels.

**Why human:** Requires live weather fetch (`getTemperatureForToday()`) and real chemistry history data; cannot verify programmatically.

### 2. Predictive Chemistry Alert Threshold

**Test:** Create or identify a customer with 6+ service visits where a chemistry parameter is trending out of range. Run `generateAlerts()`. Check that a `predictive_chemistry` alert appears on the Alerts page and Dashboard with correct projected value and target range.

**Expected:** Alert shows trend direction (up/down arrow), projected value, target range, and early-prediction disclaimer if < 12 visits.

**Why human:** Requires test dataset with statistically significant trend (R²>=0.4) across service visits.

### 3. Auto-Schedule Proposal Quality

**Test:** On the Schedule page with populated routes, click "Balance Workload." Verify the proposal shows per-tech stop distributions with imbalance highlighting (>30% above avg highlighted red), then after clicking "Generate Plan," a geographic clustering proposal appears.

**Expected:** Before/after workload comparison with geographic assignment changes; apply button persists to database.

**Why human:** Requires populated route_stops data for the selected week.

### 4. AI-Optimized Route Optimization Badge

**Test:** On the Schedule page, click one-click optimize on a route where techs have completed stops with `started_at` and `completed_at` timestamps. Verify the AI-Optimized badge appears in the optimize preview dialog.

**Expected:** When >= 50% of stops have historical durations, dialog header shows "AI-Optimized" badge with coverage percentage. Otherwise shows "Standard Optimization."

**Why human:** Requires completed stop data (started_at + completed_at) in route_stops table.

### 5. Weather Proposal End-to-End Flow

**Test:** Manually trigger the weather-check cron (or call `manualWeatherCheck()`) for a date range that includes forecasted storms (>50% storm probability per Open-Meteo). Verify proposal appears on Alerts page, approve it, and confirm: (1) route_stops are updated to new dates, (2) customers receive email + SMS with original date and new date.

**Expected:** Proposal card shows affected stops with proposed reschedule dates; Approve fires weather notifications to non-excluded customers.

**Why human:** Requires actual severe weather forecast from Open-Meteo API or mocking the weather classification.

### 6. Customer Portal ETA Countdown

**Test:** With an active tech on a route broadcasting GPS via Supabase Dispatch, visit `/portal/eta` as a customer whose stop hasn't started yet. Verify a countdown appears and updates as the tech moves.

**Expected:** Countdown shows minutes to arrival, tech name, and updates live via Supabase Broadcast channel.

**Why human:** Requires active tech session with GPS broadcasting.

### 7. Web Push Notification Delivery

**Test:** Enable push notifications in Settings, complete a stop for a pool assigned to an owner/office user, verify a native push notification appears on the device even when the app is in the background.

**Expected:** Native notification with title and body appears within seconds of stop completion.

**Why human:** Requires VAPID_PUBLIC_KEY/VAPID_PRIVATE_KEY in env, a device with Web Push support, and a registered push subscription.

### 8. PWA Install Prompt Behavior

**Test:** Visit the app on a mobile device (Chrome Android or Safari iOS) without installing it. Verify: (1) install banner appears at bottom, (2) dismissing snoozes for 7 days, (3) on iOS shows step-by-step Share → Add to Home Screen instructions.

**Expected:** Non-intrusive bottom banner with dismiss option; correct platform-specific instructions.

**Why human:** Requires physical mobile device in non-installed context.

---

## Gaps Summary

**2 gaps blocking full goal achievement:**

### Gap 1: SC-16 — WO Smart Scheduling from Detail Page (NOT IMPLEMENTED)

Success Criterion 16 of 18 was defined in ROADMAP.md but never assigned to any of the 17 plans in Phase 10. The feature — "office can schedule a WO from the WO detail page with the system recommending an optimal day and tech based on address proximity to existing route stops" — has zero implementation. No server action, no UI component, no wiring. This is the most significant gap as it is a complete feature absence.

### Gap 2: SC-8 Partial — 4 Notification Types Not Wired (NOTIF-07, NOTIF-08 route_finished, NOTIF-18, NOTIF-22)

The notification infrastructure (tables, dispatch, bell, preferences) is fully built. 30 of 34 notification types are wired. However, 4 types remain as TODO stubs:

- **NOTIF-07** (cant-complete): Deferred because no `markCantComplete` server action exists
- **NOTIF-08** (route_finished): Deferred because no `finishRoute` server action exists — route_started fires but route_finished does not
- **NOTIF-18** (weather_proposal): `checkWeatherForOrg()` creates proposals without notifying owner/office in-app + push
- **NOTIF-22** (tech_weather_alert): Weather badge renders on tech stop view but no in-app/push notification is sent when severe weather is detected

These gaps don't prevent the notification system from being functionally useful (30/34 types fire), but they do leave holes in the stated goal of "every significant platform event triggers a notification."

---

*Verified: 2026-03-16T18:09:57Z*
*Verifier: Claude (gsd-verifier)*
