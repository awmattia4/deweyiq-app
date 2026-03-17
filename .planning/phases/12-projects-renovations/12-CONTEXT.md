# Phase 12: Projects & Renovations - Context

**Gathered:** 2026-03-16
**Status:** Ready for planning

<domain>
## Phase Boundary

Full project lifecycle management for pool construction, renovations, and remodels — from lead capture and site survey through multi-tier proposals, permitting, material procurement, subcontractor coordination, phased execution with tech field tools, inspections, change orders, progress billing, final walkthrough, and warranty activation. Includes customer portal project visibility and real-time profitability tracking.

</domain>

<decisions>
## Implementation Decisions

### Proposal Builder UX
- Good/Better/Best tiers presented as **side-by-side columns** (SaaS pricing page style) — customer compares features and price at a glance
- Line item detail level is **office-configurable per proposal** — toggle in builder for "Show line item detail to customer"; some jobs benefit from transparency, others don't
- Add-on upsells appear as **checkboxes below the selected tier** — separate section with prices, total updates live as add-ons are toggled
- E-signature uses **draw/type signature** (canvas to draw or typed stylized) — produces a professional-looking signed PDF

### Tech Field Experience
- **Separate tabs** for route stops and project work — Routes tab (existing) and new Projects tab in the field app; each has its own list and workflow
- Time logging supports **both start/stop timer and manual entry** — timer for real-time tracking, manual entry as fallback for different work styles. NOTE: This is **task-level** time logging (per project task), distinct from the existing **shift-level** clock-in/out system (time_entries table, ClockInBanner). Both coexist — shift clock tracks the workday, project task times track granular work within it. Project task time should reference the parent time_entry_id for reconciliation.
- Photo capture uses **auto-context + manual tag** — system auto-fills project/phase/task from current context, tech picks the type (before/during/after/issue) from a quick-select bar
- Issue flags **create an alert for office** — tech's notes/photos go to office as an alert; office decides whether to create a change order (not auto-generated)

### Pipeline & Project Tracking
- Pipeline visualization: **Kanban board + list toggle** — default kanban with stage columns (Lead → Survey → Proposal → etc.), toggle to a sortable/filterable table view
- Gantt timeline is **interactive drag-to-reschedule** — drag phase bars to move dates, resize to change duration, dependencies auto-shift downstream phases
- Stalled project handling: **both manual hold/resume + automatic inactivity alerts** — office can explicitly hold with a reason, and system also detects no activity for X days
- Projects get a **top-level sidebar item** — own nav entry like Customers, Schedule, Billing; opens to pipeline/dashboard

### Billing & Financial Controls
- Milestone invoices are **auto-generated on phase completion and held for review** — system creates draft invoice per payment schedule, notifies office, office must explicitly send
- Retainage is a **fixed percentage per project** (e.g., 10%) — held from each progress invoice, released on final invoice after walkthrough sign-off
- Change order cost allocation: **office chooses per change order** — options: add to final payment, spread across remaining milestones, or collect immediately
- Profitability loss alerts: **configurable threshold per company** — company sets margin floor % and overrun % in settings; system alerts when actuals trend past threshold

### Claude's Discretion
- Kanban card information density (what shows on each pipeline card)
- Gantt chart implementation library/approach
- Site survey checklist default items
- Permit tracking field set and workflow
- Material procurement PO document layout
- Subcontractor directory field structure
- Warranty certificate PDF design
- Daily project briefing content and format
- Inactivity detection threshold (configurable in settings, Claude picks default)

</decisions>

<specifics>
## Specific Ideas

- Proposal approval page should feel like a polished product experience — side-by-side tier columns on desktop, stacked cards on mobile (responsive), live-updating total, signature canvas, deposit payment inline. No account creation required.
- Tech project mode should be simple like regular route stops — "just another tab." Don't overload with project management complexity. Task checklist, timer, camera, flag issue.
- Issue flag → office alert (not auto-change-order) because not every issue warrants a change order — office triages.
- Office chooses cost allocation per change order because pool renovation jobs vary widely — a plumbing surprise goes on final, a customer upgrade request might collect immediately.

</specifics>

<deferred>
## Deferred Ideas

None — discussion stayed within phase scope

</deferred>

---

*Phase: 12-projects-renovations*
*Context gathered: 2026-03-16*
