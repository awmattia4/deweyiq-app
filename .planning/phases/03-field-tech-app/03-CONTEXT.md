# Phase 3: Field Tech App - Context

**Gathered:** 2026-03-06
**Status:** Ready for planning

<domain>
## Phase Boundary

The daily-driver mobile app for field technicians. A tech opens the app, sees today's ordered stop list, taps into a stop, logs chemistry readings, completes a checklist, takes photos, and marks complete — all in under 60 seconds for routine stops, even without cell signal. Route building, scheduling, and dispatch are Phase 4/5. Customer portal visibility is Phase 8.

</domain>

<decisions>
## Implementation Decisions

### Stop workflow flow
- Tab-based sections: Chemistry | Tasks | Photos | Notes — tech can jump between tabs in any order
- Complete button always visible regardless of active tab
- On completion: quick summary screen flashes readings entered, tasks checked, and photos taken — tech taps confirm to finalize
- After completing a stop: auto-advance to the next stop in the route with a success toast
- Techs can skip stops (must provide a reason) and drag-to-reorder remaining stops on the fly

### Chemistry input & dosing
- Quick-entry grid: all chemistry parameters visible in a compact grid, tap any cell to enter a value
- Previous visit's readings shown side by side in a muted column next to current entry fields
- LSI value and dosing recommendations appear inline below the chemistry grid, updating live as readings are entered
- Out-of-range readings: color-coded cells (green/yellow/red) plus badge text ('LOW' / 'HIGH') next to the value
- Exact dosing amounts (e.g., '12 oz muriatic acid'), not ranges
- Fluid ounces for liquid chemicals, pounds for dry chemicals
- Product-aware dosing: office configures which chemical products the company uses (including concentration percentages); doses adjust based on actual product concentration
- Which chemistry parameters are required vs optional is configurable per customer/pool by the office

### Route view & day progress
- Stop list is the primary view when tech opens the app — ordered list of today's stops
- Map view available as a secondary toggle, not the default
- Each stop displayed as an info card: customer name, address, last service date, pool type, and special notes
- Progress bar at top showing 'X of Y stops' with visual fill, AND status badges on each stop card (upcoming, in progress, complete, skipped)
- Navigation: tech sets their preferred maps app (Apple Maps / Google Maps) in settings; navigation button on each stop card opens that app with the address

### Service checklist
- Each checklist task has a checkbox AND an optional notes field for exceptions (e.g., 'filter pressure high — needs replacement')
- Checklist templates by service type (weekly maintenance, opening, closing, green pool cleanup) as the base
- Per-customer overrides on top of service-type templates — office can add/remove tasks per customer (e.g., 'check salt cell' for saltwater pools)
- 'Mark all complete' button at the top for routine visits where everything was done

### Photo capture
- Quick camera button: tap to snap, photo auto-attaches to the visit
- After capture, tech can optionally tag the photo (before / after / issue / equipment) — tagging is skippable
- Soft limit: no hard cap on photos, but warning shown after 10 photos per visit
- Client-side compression before upload

### Notes
- General notes field per visit with voice-to-text microphone button — optimized for techs with wet hands
- Notes visible in service history and customer reports

### Service reports
- Photo inclusion in auto-emailed service reports is configurable per customer by the office — some customers want photos, others don't
- Service report auto-generated and queued for email delivery on stop completion

### Claude's Discretion
- Loading skeleton and transition animation design
- Exact spacing, typography, and color contrast for outdoor/sunlight visibility
- Photo compression quality and max dimensions
- Offline sync queue implementation details (Dexie + Serwist Background Sync architecture exists from Phase 1)
- Tab order and default active tab when opening a stop
- Voice-to-text implementation approach (Web Speech API vs native)

</decisions>

<specifics>
## Specific Ideas

- The 60-second routine stop target is the north star — every UX decision should optimize for speed
- Chemistry grid should feel like a spreadsheet cell you tap into, not a long form you scroll through
- 'Mark all complete' on checklist is critical for the 60-second goal — most routine visits are "everything normal"
- Product-aware dosing means the office configures products once (e.g., "We use 31.45% muriatic acid"), and all techs see doses calibrated to those products
- Voice-to-text notes are for when the tech's hands are wet and typing is impractical

</specifics>

<deferred>
## Deferred Ideas

- Photo visibility in customer portal — Phase 8 decision (Customer Portal)
- Route building and scheduling — Phase 4 (Scheduling & Routing)
- Pre-arrival customer notifications — Phase 5 (Office Operations & Dispatch)

</deferred>

---

*Phase: 03-field-tech-app*
*Context gathered: 2026-03-06*
