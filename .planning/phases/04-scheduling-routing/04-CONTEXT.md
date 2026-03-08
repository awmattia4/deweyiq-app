# Phase 4: Scheduling & Routing - Context

**Gathered:** 2026-03-08
**Status:** Ready for planning

<domain>
## Phase Boundary

Office staff can build routes, set recurring service schedules, optimize route order in one click, and see real-time tech progress on a live map. This phase converts the Phase 3 "tech sees today's route" into a managed, office-controlled scheduling system with geographic optimization and live dispatch visibility.

</domain>

<decisions>
## Implementation Decisions

### Route builder layout
- Split view: ordered stop list on the left, map with plotted route on the right
- Tech tabs across the top to switch between techs
- Day-of-week picker (Mon–Fri) above the stop list — one tech + one day visible at a time
- Unassigned customers shown in a sidebar panel — drag onto the stop list or click to assign
- Multi-select supported in the unassigned panel for bulk assignment
- Copy/duplicate an entire day's route to another day or tech

### Recurring schedule rules
- Rolling 4-week generation window — new stops appear as the current week completes
- On frequency change (e.g., weekly → bi-weekly), delete all future stops and regenerate from today based on new frequency
- Company holiday calendar in settings — auto-generated stops skip holidays, shown as "holiday — no service"
- Tech absences: office can choose per-situation — reassign some stops to another tech, skip others, or postpone to next service day

### Live dispatch map
- Tech current position shown as colored pin (GPS tracked only while app is open and tech is on route — no background tracking)
- Planned route line drawn through remaining stops with estimated arrival times at each stop
- Completed stops grayed out on the map
- Click a stop marker → quick popup card (customer name, address, status, scheduled time, tech name) with link to full customer profile
- Default view shows all techs simultaneously, color-coded per tech
- Can filter to a single tech for focused view — toggle between all-techs and single-tech modes

### Route optimization
- One-click "Optimize Route" minimizes total drive time for a single day's route
- Office can lock any stop to its position before optimizing (e.g., "Mrs. Johnson must be stop #3") — optimizer works around locked stops
- Before/after preview: shows optimized order side-by-side with current order, displays estimated drive time saved — office clicks "Apply" or "Cancel"
- Scope is single day only — does not move stops across days

### Claude's Discretion
- Map provider choice (Mapbox vs alternatives)
- Optimization API selection and algorithm
- GPS polling interval when app is active
- ETA calculation method
- Exact drag-and-drop interaction library
- Calendar view design for week overview

</decisions>

<specifics>
## Specific Ideas

- Route builder should feel like a project management tool — drag stops around easily, see the impact on the map instantly
- The optimization preview with drive time saved is key — office needs to trust the optimizer before applying
- Locking stops is critical for real-world pool service where some customers have specific time requirements (morning-only gates, appointment windows)

</specifics>

<deferred>
## Deferred Ideas

None — discussion stayed within phase scope

</deferred>

---

*Phase: 04-scheduling-routing*
*Context gathered: 2026-03-08*
