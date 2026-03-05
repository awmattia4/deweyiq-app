# Phase 2: Customer & Pool Data Model - Context

**Gathered:** 2026-03-05
**Status:** Ready for planning

<domain>
## Phase Boundary

Office staff can create and manage the full customer record — contact info, pool profiles, equipment, and access notes — which becomes the shared data backbone for every downstream phase. This is the CRM core: customer CRUD, pool/spa/fountain profiles, equipment tracking, and a unified service history view. Creating service records, scheduling, and billing are separate phases.

</domain>

<decisions>
## Implementation Decisions

### Customer list & search
- Data table layout with sortable columns — efficient for scanning 100+ customers
- Default columns: Name, Address, Phone, Route, Status, Pool Count (6 columns)
- Instant filter search — table filters in real-time as user types, no submit button
- Dropdown filters above the table for Route, Status (active/paused/cancelled), and Assigned Tech — combinable

### Customer profile page
- Tabbed sections: Overview, Pools, Equipment, History — one section visible at a time
- Full page navigation to /customers/[id] — standard web navigation with back button
- Header always visible above tabs: customer name, address, phone, status badge, assigned route
- Inline edit mode — click Edit and fields become editable in-place, no modal for editing existing data

### Pool & equipment forms
- Pool types: Pool, Spa, Fountain — three distinct body-of-water types
- Add pool via modal form — click "Add Pool" on Pools tab, dialog opens with all fields
- Single form with visual grouping: Basic Info (name, type, volume) | Water Chemistry (surface, sanitizer) | Notes
- Equipment displayed as a compact list per pool (type, brand/model, install date) with [+ Add] button
- Add equipment via small modal form with brand, model, install date fields

### Service history timeline
- Vertical timeline layout with date markers — each visit is a card
- Chemistry readings shown inline by default (pH, Cl, Alk) — no expand needed for basics
- All service types shown together chronologically, with filter chips (Routine, Repair, One-off) to narrow
- Photo thumbnails in horizontal strip below entries — click to open full-size gallery

### Claude's Discretion
- Exact table component library and pagination strategy
- Empty states for new customers with no pools/equipment/history
- Form validation rules and error messages
- Loading skeletons and transition animations
- Responsive behavior on smaller screens

</decisions>

<specifics>
## Specific Ideas

No specific product references — open to standard CRM patterns. The overall direction is clean, data-dense, and functional for office staff who manage dozens of customers daily. Table for the list, tabs for the profile, modals for adding, inline for editing.

</specifics>

<deferred>
## Deferred Ideas

None — discussion stayed within phase scope

</deferred>

---

*Phase: 02-customer-pool-data-model*
*Context gathered: 2026-03-05*
