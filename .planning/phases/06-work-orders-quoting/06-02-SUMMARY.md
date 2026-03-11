---
phase: 06-work-orders-quoting
plan: 02
subsystem: work-orders-ui
tags: [next.js, react, work-orders, dark-ui, server-actions, filter-chips, activity-log]

# Dependency graph
requires:
  - phase: 06-01
    provides: work_orders, work_order_line_items, quotes tables + WO server actions

provides:
  - /work-orders list page with status + priority filter chips
  - /work-orders/[id] detail page with full WO sections
  - WoList component (filterable, priority-sorted WO cards)
  - WoCreateDialog component (customer/pool/category/priority/template selection)
  - WoDetail component (inline edit, status actions, assignment, line items, photos, timeline, quotes, follow-ups)
  - getCustomersForWo() action (customers with pools, RLS-safe two-query pattern)
  - getTechProfiles() action (tech-role profiles for assignment dialogs)
  - Work Orders sidebar nav item for owner/office roles

affects:
  - 06-03 (Quote builder wires into "Create Quote" button on WO detail)
  - 06-04 (Invoice builder wires into "Prepare Invoice" button on WO detail)
  - 06-05 (Parts catalog action buttons in line-item editor)

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Two-query customer+pools fetch to avoid RLS correlated subquery pitfall"
    - "Local useState filter over pre-fetched server data (no URL search params)"
    - "Inline edit mode with optimistic local state update + router.refresh() for revalidation"
    - "StatusActionBar component: contextual action buttons per WO status"
    - "Activity timeline: JSONB array reversed, icon + description mapping per event type"
    - "Separate getTechProfiles() action for assignment dialog (avoids coupling to dispatch patterns)"

key-files:
  created:
    - src/app/(app)/work-orders/page.tsx
    - src/app/(app)/work-orders/[id]/page.tsx
    - src/components/work-orders/wo-list.tsx
    - src/components/work-orders/wo-create-dialog.tsx
    - src/components/work-orders/wo-detail.tsx
  modified:
    - src/components/shell/app-sidebar.tsx
    - src/actions/work-orders.ts
    - src/components/alerts/alert-card.tsx
    - src/components/alerts/alert-feed.tsx

decisions:
  - "WoList uses local useState filter over pre-fetched data — avoids URL param complexity for single-page list"
  - "Two-query pattern for getCustomersForWo: fetch customers then pools separately to avoid RLS correlated subquery pitfall (per MEMORY.md)"
  - "getTechProfiles added to work-orders.ts: keeps WO-related actions co-located, avoids importing from dispatch"
  - "Inline edit mode with setWo optimistic update + router.refresh(): immediate UI feedback without full refetch"
  - "StatusActionBar as separate component: clean separation of status-conditional logic from header/sections"

metrics:
  duration: "9 minutes"
  completed: "2026-03-11"
  tasks: 2
  files: 9
---

# Phase 6 Plan 02: Work Orders UI Summary

**One-liner:** Office-facing WO management UI — list with filter chips, create dialog with customer/pool/template selection, full detail page with inline edit, status action bar, assignment, line items, activity timeline, and linked quotes.

## What Was Built

### Task 1: WO List Page, Create Dialog, Sidebar Nav

**`/work-orders` page** (`src/app/(app)/work-orders/page.tsx`):
- Server component — fetches all WOs + templates in parallel
- Role guard: owner/office only; techs redirect to /routes
- Passes data to `WoList` and `WoCreateDialog` as props

**`WoList` component** (`src/components/work-orders/wo-list.tsx`):
- Filter chips row for status (All Open, Draft, Quoted, Approved, Scheduled, In Progress, Complete, Invoiced, Cancelled)
- Filter chips row for priority (All, Emergency, High, Normal, Low)
- "Needs Attention" banner showing count of draft WOs
- Priority-sorted WO cards with left-border color coding (red=emergency, amber=high, blue=normal, zinc=low)
- Each card shows: category icon, title, customer+pool, priority badge, status badge, tech name (or "Unassigned"), target date, created date
- Dark-first design matching existing alert-feed and customer-table patterns

**`WoCreateDialog` component** (`src/components/work-orders/wo-create-dialog.tsx`):
- Lazy-loads customers + pools via `getCustomersForWo()` when dialog opens
- Customer selector → pool selector (populated after customer selection)
- Title + description inputs
- Category pill-button picker (pump/filter/heater/plumbing_leak/surface/electrical/other)
- Priority pill-button picker with color-coded active state
- Template selector: when selected, pre-fills category, priority, title
- Skip-quote checkbox for future use by WO detail status bar
- Plain React state + inline validation (per project convention — no zodResolver)

**`getCustomersForWo()` action** (`src/actions/work-orders.ts`):
- Two separate queries: customers first, then pools for all customer IDs
- Avoids RLS correlated subquery pitfall documented in MEMORY.md
- Groups pools by customer for efficient lookup

**Sidebar nav** (`src/components/shell/app-sidebar.tsx`):
- Added `WrenchIcon` import from lucide-react
- Added Work Orders nav item with `/work-orders` href for `['owner', 'office']` roles
- Placed after Alerts in nav order

### Task 2: WO Detail Page, Timeline, Status Controls, Assignment

**`/work-orders/[id]` page** (`src/app/(app)/work-orders/[id]/page.tsx`):
- Fetches WO + tech profiles in parallel
- `notFound()` if WO doesn't exist
- Generates metadata with WO title

**`WoDetail` component** (`src/components/work-orders/wo-detail.tsx`):

All sections implemented:

1. **Header** — category icon, title, customer name (linked), pool name, priority badge, status badge, created timestamp, flagged-by-tech indicator with severity. Edit button toggles inline edit mode (category/priority pill pickers, title input, description textarea).

2. **Status action bar** (`StatusActionBar`) — contextual buttons:
   - `draft`: "Create Quote" (disabled, wires in Plan 03), "Skip Quote → Approve" (confirmation dialog), "Cancel"
   - `quoted`: "Cancel"
   - `approved`: "Schedule" (tech picker + date picker dialog), "Cancel"
   - `scheduled`: "Reassign" (same schedule dialog), "Cancel"
   - `in_progress`: shows "In progress by [tech]" badge (no action buttons)
   - `complete`: "Prepare Invoice" (disabled, wires in Plan 04), "Create Follow-Up"
   - `invoiced`/`cancelled`: bar hidden entirely

3. **Assignment section** — shows tech name + target date; Assign/Reassign button for approved/scheduled status. Cancel reason displayed for cancelled WOs.

4. **Line items** — table with description, type, qty/unit, unit price, line total, subtotal footer. "Add Line Item" placeholder button (disabled until Plan 04 line-item editor). Read-only for invoiced/cancelled.

5. **Photos grid** — 3-col grid of completion photos, each clickable to full-size. Hidden if no photos.

6. **Activity timeline** — reversed activity_log array (newest first), each event with icon + description label + timestamp. Event type mapping covers: created, updated, all status transitions, assigned, reassigned, note_added, quote events, follow_up_created.

7. **Linked quotes** — list of quote summaries with quote number/version, sent date, status badge.

8. **Parent/follow-up WO** — link to parent WO if `parent_wo_id` is set.

**Three dialogs:**
- Cancel dialog: textarea for required cancel reason
- Skip-quote approval dialog: confirmation before calling `updateWorkOrderStatus('approved')`
- Schedule/assign dialog: tech select + date input, calls `updateWorkOrderStatus('scheduled', { assignedTechId, targetDate })`

**`getTechProfiles()` action** (`src/actions/work-orders.ts`):
- Queries profiles table filtered by `role = 'tech'`, ordered by full_name
- Used by schedule/assign dialog in WoDetail

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Fixed `work_order_flagged` AlertType missing from alert-card.tsx and alert-feed.tsx**
- **Found during:** TypeScript check after Task 1
- **Issue:** `constants.ts` already defines `work_order_flagged` in the `AlertType` union (added by Phase 6 Plan 01 preparatory work), but `alert-card.tsx` only handled 3 types in its config object (causing TS error), and `alert-feed.tsx` `countByType` was missing the 4th key required by `Record<FilterValue, number>`
- **Fix:** Added `work_order_flagged: { label: "Issue Flagged", className: "text-amber-400" }` to alert-card config; added `work_order_flagged` count to alert-feed `countByType`
- **Files modified:** `src/components/alerts/alert-card.tsx`, `src/components/alerts/alert-feed.tsx`
- **Commits:** de8764a

**2. [Rule 2 - Missing Functionality] Added `getCustomersForWo()` to work-orders.ts**
- **Found during:** WoCreateDialog needs customers with pools, no existing action existed
- **Issue:** No server action provided customers+pools combined for WO creation flow
- **Fix:** Added `getCustomersForWo()` using two-query RLS-safe pattern
- **Files modified:** `src/actions/work-orders.ts`
- **Commit:** de8764a

**3. [Rule 2 - Missing Functionality] Added `getTechProfiles()` to work-orders.ts**
- **Found during:** WoDetail assignment/schedule dialogs need tech list
- **Issue:** No dedicated server action for fetching tech profiles; dispatch.ts had similar but tightly coupled logic
- **Fix:** Added `getTechProfiles()` — simple profiles query filtered by role='tech'
- **Files modified:** `src/actions/work-orders.ts`
- **Commit:** ca21654

### Pre-existing Out-of-Scope Issues (Deferred)

- `src/lib/chemistry/__tests__/dosing.test.ts`: Missing `borate` and `temperatureF` fields in test fixtures. Pre-existing; not caused by this plan. Deferred.
- `src/components/work-orders/line-item-editor.tsx`: Pre-existing file with errors (`@radix-ui/react-icons` missing, OrgSettings field name mismatches). Not created by this plan. Deferred.

## Commits

| Hash    | Description                                                        |
|---------|--------------------------------------------------------------------|
| de8764a | feat(06-02): WO list page, create dialog, sidebar nav, getCustomersForWo action |
| ca21654 | feat(06-02): WO detail page with timeline, status controls, and assignment |

## Self-Check: PASSED

All created files verified present:
- `src/app/(app)/work-orders/page.tsx` — FOUND
- `src/app/(app)/work-orders/[id]/page.tsx` — FOUND
- `src/components/work-orders/wo-list.tsx` — FOUND
- `src/components/work-orders/wo-create-dialog.tsx` — FOUND
- `src/components/work-orders/wo-detail.tsx` — FOUND
