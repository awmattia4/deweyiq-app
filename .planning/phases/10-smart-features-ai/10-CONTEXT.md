# Phase 10: Smart Features & AI - Context

**Gathered:** 2026-03-16
**Status:** Ready for planning

<domain>
## Phase Boundary

Layer intelligence onto the existing platform — weather-aware scheduling with auto-reschedule suggestions, predictive chemistry alerts, ML route optimization, automated workload balancing, dynamic customer ETAs, equipment performance monitoring, safety alerts for unresponsive techs, comprehensive push/email/SMS notifications for all platform events, broadcast messaging, internal service notes, smart customer creation suggestions, and PWA install prompts. The system gets actively smarter with accumulated operational data.

</domain>

<decisions>
## Implementation Decisions

### Weather automation & rescheduling
- **Suggest & approve model** — system proposes a reschedule plan when weather is forecast; office reviews and approves with one click (not full auto)
- **All severe weather triggers** — rain (above threshold), lightning/thunderstorms, extreme heat (105F+), high winds (40mph+), and hail all trigger reschedule suggestions
- **Auto-notify with opt-out** — when office approves a reschedule, all affected customers are notified automatically by default; office can uncheck individual customers before approving
- **Smart slot finder** for displaced stops — system finds the optimal open slot considering tech availability, route geography, and customer preferences (could be same week or next)

### Notification strategy & push UX
- **PWA install prompt immediately on first login** — non-intrusive banner with clear benefit messaging (works offline, push notifications, faster access); dismissible with 7-day snooze before re-appearing
- **Push notification permission prompt immediately** — right after install/first login with explanation of what they'll receive; maximize opt-in while engagement is high
- **Per-org defaults with per-user override** — owner sets org-wide notification defaults (e.g. "all techs get push for new WOs"); individual users can override their own preferences in Settings
- **In-app notification center grouped by urgency** — bell icon with unread badge; notifications split into "Needs Action" (urgent, actionable items float to top) and "Informational" (FYI items below)

### Dynamic ETA & safety alerts
- **Two-touch ETA delivery** — initial "tech is on their way" notification at route start, then a refined ETA when tech is 2-3 stops away
- **Live countdown with map in portal** — customer portal shows real-time countdown timer plus a map showing the tech's approximate location along the route (Uber/DoorDash-style experience)
- **Auto-update ETA on significant change, capped at 2 updates** — if ETA shifts by 15+ minutes, automatically send updated SMS; maximum 2 update notifications per service visit to avoid spam
- **Configurable safety escalation chain** — owner defines in settings: who to alert for unresponsive tech, in what order, at what intervals (e.g. owner first, then emergency contact after 15 min, then all admins)

### Smart dosing & predictive alerts
- **AI as modifier badge on standard dose** — show the rule-based dose as the primary recommendation; when AI adjusts it (weather, history, pool specifics), show a small badge (e.g. weather icon + "Weather adjusted"); tap for details on why the recommendation changed
- **Predictive alerts visible to office + tech + customer** — office sees on dashboard, tech gets heads-up before arriving at a trending pool, customer gets proactive "we're monitoring your pool" notification (trust builder)
- **6-week minimum data with disclaimer** — predictions start after 6 weeks of readings, labeled as "Early prediction — accuracy improves with more data"; full confidence after 3+ months
- **Equipment degradation: alert + suggest WO** — when equipment performance drops (e.g. salt cell down 30%), alert office with performance data and a one-tap "Create Work Order" button; not auto-created

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

</decisions>

<specifics>
## Specific Ideas

- Live ETA should feel like Uber/DoorDash — customer sees a map with tech position and a countdown timer
- Weather reschedule should be a one-click approval, not a multi-step workflow — office is busy
- Predictive chemistry alerts to customers are a trust-building differentiator — "we caught this before it became a problem"
- AI dosing should be additive, not disruptive — techs trust the existing system, the AI badge enhances without replacing the familiar flow
- Safety alerts need configurable escalation because every company has different emergency contact structures

</specifics>

<deferred>
## Deferred Ideas

None — discussion stayed within phase scope

</deferred>

---

*Phase: 10-smart-features-ai*
*Context gathered: 2026-03-16*
