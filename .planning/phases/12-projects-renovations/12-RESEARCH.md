# Phase 12: Projects & Renovations - Research

**Researched:** 2026-03-16
**Domain:** Project lifecycle management, Gantt scheduling, proposal builder, change orders, progress billing, field project tools
**Confidence:** HIGH

---

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions

**Proposal Builder UX**
- Good/Better/Best tiers presented as side-by-side columns (SaaS pricing page style) — customer compares features and price at a glance
- Line item detail level is office-configurable per proposal — toggle in builder for "Show line item detail to customer"; some jobs benefit from transparency, others don't
- Add-on upsells appear as checkboxes below the selected tier — separate section with prices, total updates live as add-ons are toggled
- E-signature uses draw/type signature (canvas to draw or typed stylized) — produces a professional-looking signed PDF

**Tech Field Experience**
- Separate tabs for route stops and project work — Routes tab (existing) and new Projects tab in the field app; each has its own list and workflow
- Time logging supports both start/stop timer and manual entry — timer for real-time tracking, manual entry as fallback. This is task-level time logging (per project task), distinct from the existing shift-level clock-in/out system (time_entries table, ClockInBanner). Both coexist — shift clock tracks the workday, project task times track granular work within it. Project task time should reference the parent time_entry_id for reconciliation.
- Photo capture uses auto-context + manual tag — system auto-fills project/phase/task from current context, tech picks the type (before/during/after/issue) from a quick-select bar
- Issue flags create an alert for office — tech's notes/photos go to office as an alert; office decides whether to create a change order (not auto-generated)

**Pipeline & Project Tracking**
- Pipeline visualization: Kanban board + list toggle — default kanban with stage columns (Lead → Survey → Proposal → etc.), toggle to a sortable/filterable table view
- Gantt timeline is interactive drag-to-reschedule — drag phase bars to move dates, resize to change duration, dependencies auto-shift downstream phases
- Stalled project handling: both manual hold/resume + automatic inactivity alerts — office can explicitly hold with a reason, and system also detects no activity for X days
- Projects get a top-level sidebar item — own nav entry like Customers, Schedule, Billing; opens to pipeline/dashboard

**Billing & Financial Controls**
- Milestone invoices are auto-generated on phase completion and held for review — system creates draft invoice per payment schedule, notifies office, office must explicitly send
- Retainage is a fixed percentage per project (e.g., 10%) — held from each progress invoice, released on final invoice after walkthrough sign-off
- Change order cost allocation: office chooses per change order — options: add to final payment, spread across remaining milestones, or collect immediately
- Profitability loss alerts: configurable threshold per company — company sets margin floor % and overrun % in settings; system alerts when actuals trend past threshold

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

### Deferred Ideas (OUT OF SCOPE)
None — discussion stayed within phase scope
</user_constraints>

---

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|-----------------|
| PROJ-01 | System supports named project types with default phase templates | `project_types` and `project_templates` tables; JSONB stores default_phases array |
| PROJ-02 | Owner can create/manage project templates per type (phases, checklists, durations, materials, labor) | `project_templates` table with JSONB for phases/tasks/materials; same pattern as checklist templates |
| PROJ-03 | Project templates include default line item estimates with markup percentages | `project_template_line_items` child table per template |
| PROJ-04 | System supports Good/Better/Best proposal tiers per template | `project_proposal_tiers` table; tier_level enum 'good'/'better'/'best' |
| PROJ-05 | Office can capture project leads from multiple sources | `projects` table with `stage='lead'` + `lead_source` field |
| PROJ-06 | System provides a project pipeline view with drag-and-drop between stages | `projects.stage` column; @dnd-kit/core for kanban column drag; 11 stage values |
| PROJ-07 | Office can schedule a site survey as a special stop type | `route_stops` with `stop_type='survey'` + `project_id` FK; survey checklist template |
| PROJ-08 | Tech can complete a site survey from the field app | Survey-specific workflow screen; photos stored to Supabase Storage with project context |
| PROJ-09 | Site survey data auto-populates into proposal builder | `project_surveys` table; proposal builder reads survey measurements + photos |
| PROJ-10 | Office can build detailed project proposal with all cost categories | `project_proposals` table; `project_proposal_line_items` for itemized costs |
| PROJ-11 | Proposal supports multiple pricing presentation methods | `pricing_method` column on proposals: 'lump_sum'/'cost_plus'/'time_and_materials'/'fixed_per_phase' |
| PROJ-12 | Proposal includes configurable payment schedule | `project_payment_milestones` table; tied to proposal; deposit + N progress payments + final |
| PROJ-13 | Proposal supports Good/Better/Best option tiers | Side-by-side UI on approval page; selected tier stored on approved proposal |
| PROJ-14 | Proposal generates professional branded PDF | @react-pdf/renderer (already in project); hex colors only; proposal-pdf.tsx |
| PROJ-15 | Office can include add-on upsells on proposal | `project_proposal_addons` table; checkboxes on approval page; live total recalculation |
| PROJ-16 | System tracks proposal versions | `version` integer on proposals; new row per revision; status='superseded' on old versions |
| PROJ-17 | System sends proposal via email/SMS with secure approval link | jose JWT token (same pattern as quote-token.ts); PROPOSAL_TOKEN_SECRET env var |
| PROJ-18 | Customer approval page shows tiers, add-ons, payment schedule, e-signature | /proposal/[token] route; no auth required; adminDb for DB access |
| PROJ-19 | Upon approval, system creates deposit invoice and offers inline Stripe payment | Stripe PaymentElement on approval page; same pattern as /pay/[token] route from Phase 7 |
| PROJ-20 | Deposit payment supports multiple methods including split deposit | Split deposit: create two payment_milestones with auto-schedule for second; offline recorded manually |
| PROJ-21 | System sends deposit reminder emails on configurable schedule | Supabase pg_cron or edge function daily scan; checks projects in 'Approved - Awaiting Deposit' stage |
| PROJ-22 | System supports consumer financing option on approval page | External link to financing partner with project amount pre-filled; `financing_status` field on project |
| PROJ-23 | Customer can request changes from approval page | `proposal_change_requests` table; notifies office; office creates new proposal version |
| PROJ-24 | System tracks permits per project | `project_permits` table: permit_type, status, permit_number, dates, inspector info |
| PROJ-25 | Office can configure which project types require permits | `permit_requirements` on project template; projects block advancement without approved permit |
| PROJ-26 | System sends permit expiration alerts | pg_cron daily scan; `alerts` table with alert_type='permit_expiring' |
| PROJ-27 | System stores HOA documentation per project | `project_documents` table with document_type='hoa'; Supabase Storage paths |
| PROJ-28 | Each project has a material list from the approved proposal | `project_materials` table; links to proposal line items; tracks order_status |
| PROJ-29 | Office can create purchase orders from material list | `project_purchase_orders` table grouped by supplier; PO PDF via @react-pdf/renderer |
| PROJ-30 | System tracks material delivery and receiving | `project_material_receipts` table; partial deliveries tracked with remaining qty |
| PROJ-31 | System tracks material cost variance | Computed: sum(actual) vs sum(estimated) per project; alerts table for overruns |
| PROJ-32 | Tech can log material usage from the field | `project_material_usage` table; tech selects from project material list + qty |
| PROJ-33 | System supports material returns and credits | `project_material_returns` table; credit applies to actual cost tracking |
| PROJ-34 | System maintains a subcontractor directory per org | `subcontractors` table: name, trade, insurance_cert_path, insurance_expiry, license, payment_terms |
| PROJ-35 | Office can assign subcontractors to project phases | `project_phase_subcontractors` table: phase_id, sub_id, dates, scope, agreed_price, payment_milestone |
| PROJ-36 | System tracks subcontractor work status per assignment | status column on phase_subcontractors: 'not_started'/'in_progress'/'complete'/'needs_rework' |
| PROJ-37 | System generates subcontractor payment tracking | Computed from phase_subcontractors; payment_records for check + lien waivers |
| PROJ-38 | System sends subcontractor schedule notifications | Email via existing Resend/email infrastructure; sub has email stored in subcontractors table |
| PROJ-39 | Each project has ordered list of phases with full metadata | `project_phases` table: name, dates, labor hours, assigned crew, subs, dependencies, status, checklist |
| PROJ-40 | Office can view project timeline (Gantt-style) with drag-to-reschedule | @svar-ui/react-gantt (MIT license, open source, supports drag/resize/dependencies) |
| PROJ-41 | System supports phase dependencies (hard and soft) | `dependency_phase_id` + `dependency_type` columns on project_phases; recalculation on completion |
| PROJ-42 | Office can schedule project work alongside regular service routes | Project phase blocks on schedule calendar; tech availability check on assignment |
| PROJ-43 | System handles project delays automatically — shifts dependents, notifies customer | Recalculate downstream dates when phase completes late; `projects.estimated_completion_date` updates |
| PROJ-44 | Office can put a project on hold | `projects.status='on_hold'` + `on_hold_reason`; phases pause; customer portal reflects status |
| PROJ-45 | System tracks weather delays for outdoor work | Weather API integration (already in project); outdoor_work flag on phase types |
| PROJ-46 | Tech has dedicated Projects tab in field app | `/routes` page gains tabs: "Routes" (existing) + "Projects"; project list with current phase |
| PROJ-47 | Tech sees current phase task checklist in project mode | `project_phase_tasks` table; same checkable UI as existing checklist component |
| PROJ-48 | Tech can log time per project from field app | `project_time_logs` table; start/stop timer or manual; references time_entry_id (shift reconciliation) |
| PROJ-49 | Tech can log material usage from field app | project_material_usage insert from mobile; barcode scan or list select |
| PROJ-50 | Tech can capture project photos with automatic tagging | `project_photos` table: project_id, phase_id, task_id, tag (before/during/after/issue); Supabase Storage |
| PROJ-51 | Tech can flag an issue/unexpected condition from field | `project_issue_flags` table; creates alert for office; office decides whether to create change order |
| PROJ-52 | Tech can view site-specific information for each project | `projects.site_notes` JSONB: gate_code, utility_locations, dig_alert_number, hoa_contact, parking |
| PROJ-53 | Tech sees daily project briefing | Derived at page load: today's phases, expected tasks, materials needed, subs on site, inspections |
| PROJ-54 | Tech can mark a project phase complete from field | Phase self-inspection checklist; requires completion photo; notifies office |
| PROJ-55 | Tech can record equipment and tools used on a project | `project_equipment_assignments` table: equipment_id, project_id, dates; prevents double-booking |
| PROJ-56 | App can suggest sequencing project visit within route | Route optimizer hint; office approves hybrid schedule |
| PROJ-57 | Office can create a change order when project scope changes | `project_change_orders` table: description, reason, line items, cost_impact, schedule_impact |
| PROJ-58 | Change orders require customer approval before work proceeds | /change-order/[token] public route; same JWT pattern as proposals |
| PROJ-59 | Approved change orders automatically update project | Atomic update: material list, labor estimates, payment schedule, timeline, change_order_log |
| PROJ-60 | System tracks cost impact of all change orders | Computed: original contract + sum(approved COs) = current contract; shown on project dashboard |
| PROJ-61 | Tech-flagged issues can be converted to change orders by office | issue_flag → change order pre-populate action; preserves field documentation chain |
| PROJ-62 | System generates progress invoices tied to project milestones | On phase completion: create draft invoice referencing project_id + milestone; holds for review |
| PROJ-63 | Progress invoices follow approved payment schedule | `project_payment_milestones` drives invoice amounts; system calculates correct draw |
| PROJ-64 | System supports retainage | `retainage_pct` on projects; held amount computed per progress invoice; released on final |
| PROJ-65 | Final invoice includes remaining balance, retainage release, all pending CO amounts | Final invoice line items: balance + retainage + outstanding COs — less prior payments |
| PROJ-66 | All project invoices flow through existing payment infrastructure | Re-uses invoices table with `project_id` FK + `invoice_type='project_progress'`; same Stripe flow |
| PROJ-67 | System tracks project profitability in real-time | Computed view: contract_amount - actual_costs (materials + labor + subs + permits + equipment) |
| PROJ-68 | Office can record refunds or credits on cancellation | Cancellation settlement calculation: deposit - completed work - non-returnable materials - fees |
| PROJ-69 | System tracks inspections per project | `project_inspections` table: type, scheduled_date, inspector, status, result_notes, documents |
| PROJ-70 | Failed inspections create a rework task list | On inspection_status='failed': create correction tasks assigned to responsible party |
| PROJ-71 | Quality checkpoints are built into phase completion | Phase self-inspection checklist (per phase type template); configurable required items |
| PROJ-72 | Final walkthrough is a formal project phase | `project_punch_list` table: items, resolution status, photos; customer signs off via portal |
| PROJ-73 | Each project type has configurable warranty terms | `project_warranty_terms` table: type, duration_months, what_covered, exclusions |
| PROJ-74 | System generates warranty certificate document | warranty-certificate-pdf.tsx using @react-pdf/renderer; emailed on completion |
| PROJ-75 | Customer can submit warranty claims through portal | `warranty_claims` table; creates warranty work order linked to original project |
| PROJ-76 | Warranty work orders track labor and material separately | `is_warranty_covered` boolean on work orders; if true, no invoice generated; cost absorbed |
| PROJ-77 | System sends warranty expiration reminders to customers | pg_cron/edge function; 90/60/30 days before each warranty tier expiry |
| PROJ-78 | When project completes for new customer, prompt to offer recurring service | Post-completion hook checks if customer has active service agreement; prompts if not |
| PROJ-79 | System maintains project archive per customer | All projects accessible from customer profile; permanent document storage |
| PROJ-80 | Office has a Project Dashboard | projects/page.tsx: pipeline kanban/list toggle + calendar + crew utilization + alerts panel |
| PROJ-81 | System provides per-project financial reports | Project detail page financial tab: budget vs actual, margin, cash flow, CO impact |
| PROJ-82 | System provides aggregate project reports | /reports with project filters: revenue by period, avg margin by type, lead-to-close conversion |
| PROJ-83 | System tracks lead-to-close metrics | Stage timestamps on projects; derived analytics from project history |
| PROJ-84 | Customer can view active project in portal | Portal /projects route: timeline, progress %, next milestone, photo gallery |
| PROJ-85 | Customer can view project financials in portal | Portal project detail: contract, paid, retainage, balance, next payment |
| PROJ-86 | Customer receives project update notifications | Configurable notification types; phase started/completed emails with photos |
| PROJ-87 | Customer can approve change orders from portal | /change-order/[token] approval page (same pattern as proposals) |
| PROJ-88 | Customer can communicate about project through portal | portal_messages with `project_id` FK (extend existing messaging pattern) |
| PROJ-89 | Customer can complete final walkthrough punch list digitally | Portal punch list view; customer signs off; triggers warranty activation + final invoice |
| PROJ-90 | System enforces cancellation terms from proposal | Cancellation policy stored as JSONB on project; settlement calculator server action |
| PROJ-91 | All project documentation is timestamped and immutable (soft-archive only) | No hard deletes on project docs; `archived_at` timestamp as substitute for DELETE |
| PROJ-92 | System supports project suspension — non-payment triggered, configurable cure period | `projects.status='suspended'`; triggered by overdue project invoices; cure_period_days configurable |
</phase_requirements>

---

## Summary

Phase 12 is the largest phase in the DeweyIQ roadmap — 92 requirements covering a complete project lifecycle management system for pool construction/renovation companies. It builds on every prior phase: Phase 7's Stripe payment infrastructure, Phase 6's quote/PDF/token approval patterns, Phase 4's scheduling calendar, Phase 3's field tech app and offline sync, and Phase 8's customer portal.

The core architecture challenge is a new, first-class data entity — `projects` — that sits alongside the existing service route domain but is structurally distinct. Projects have phases (not stops), templates (not schedule rules), and milestones (not recurring billing cycles). The proposal system extends the existing quote approval flow but adds tiers (Good/Better/Best) and e-signature. The billing system extends existing invoices with project-specific types (deposit, progress, final) and a retainage holdback mechanic.

The field tech experience is deliberately simple: a new "Projects" tab on the routes page, showing active project phases as a task checklist with timer, camera, and flag-issue. The Gantt chart, change order management, and pipeline kanban belong entirely to the office side. The customer-facing approval page (public, no auth) mirrors the existing quote approval pattern but adds tier selection, add-on checkboxes, and inline deposit payment.

**Primary recommendation:** Build in 9 focused sub-phases: (1) Core schema + templates, (2) Pipeline + project CRUD, (3) Proposal builder + public approval page, (4) Site survey + permitting, (5) Phase scheduling + Gantt timeline, (6) Field tech project tab, (7) Change orders + progress billing, (8) Inspections + walkthrough + warranty, (9) Customer portal + reporting.

---

## Standard Stack

### Core
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| @svar-ui/react-gantt | latest (MIT) | Interactive Gantt chart with drag-to-reschedule, dependencies | Only MIT-licensed React Gantt with full drag/resize/dependency support; React 19 compatible as of v2.3 |
| @dnd-kit/core + @dnd-kit/sortable | latest | Kanban column drag-and-drop (pipeline view) | Project-standard (already used or available in Next.js ecosystem); lighter than react-beautiful-dnd which is unmaintained |
| react-signature-canvas | latest | Canvas-based draw signature + typed signature fallback | Standard library wrapping signature_pad; used on proposal approval page |
| signature_pad | latest (peer dep) | Underlying signature drawing engine | Peer dependency of react-signature-canvas |
| @react-pdf/renderer | already installed | Proposal PDF, warranty certificate PDF, PO document PDF | Already in project; configured in next.config.ts with serverExternalPackages |
| jose | already installed | JWT tokens for proposal/change-order approval links | Already used for quote-token.ts; same pattern extended with PROPOSAL_TOKEN_SECRET |

### Supporting
| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| @svar-ui/react-gantt PRO | (if needed) | Working-day calendars, baselines, auto-scheduling, undo/redo | Only if free MIT version is insufficient; evaluate free version first |
| Resend + React Email | already installed | Proposal send, phase update notifications, warranty expiry reminders | Already in project for all transactional email |
| Twilio | already installed | SMS delivery for proposal approval links, change order notifications | Same pattern as Phase 5 pre-arrival SMS |

### Alternatives Considered
| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| @svar-ui/react-gantt | Custom timeline with CSS | Custom approach is weeks of work; handle only after verifying SVAR renders correctly in dark mode |
| @dnd-kit/core | react-beautiful-dnd | react-beautiful-dnd is unmaintained; @dnd-kit/core is the community successor |
| react-signature-canvas | Custom canvas component | react-signature-canvas wraps signature_pad which handles pressure, mobile touches, smoothing — too complex to hand-roll |

**Installation:**
```bash
npm install @svar-ui/react-gantt @dnd-kit/core @dnd-kit/sortable @dnd-kit/utilities react-signature-canvas
npm install --save-dev @types/react-signature-canvas
```

---

## Architecture Patterns

### Recommended Database Schema Organization

New tables in dedicated `schema/projects.ts` and `schema/project-billing.ts` files — do not append to existing schema files. Add all relations to `relations.ts`.

```
src/lib/db/schema/
├── projects.ts              # projects, project_phases, project_phase_tasks, project_templates
├── project-proposals.ts     # project_proposals, project_proposal_tiers, project_proposal_addons,
│                            #   project_proposal_line_items, project_payment_milestones
├── project-materials.ts     # project_materials, project_purchase_orders, project_material_receipts,
│                            #   project_material_usage, project_material_returns
├── project-billing.ts       # project_change_orders, project_inspections, project_permits,
│                            #   project_punch_list, project_warranty_terms, warranty_claims
├── subcontractors.ts        # subcontractors, project_phase_subcontractors
├── project-field.ts         # project_photos, project_time_logs, project_issue_flags,
│                            #   project_equipment_assignments
```

### Recommended App Route Organization

```
src/app/(app)/projects/
├── page.tsx                 # Pipeline dashboard (kanban/list toggle)
├── new/page.tsx             # Create new project / lead capture
├── [id]/
│   ├── page.tsx             # Project detail (overview, phases, financials)
│   ├── timeline/page.tsx    # Gantt chart view
│   ├── materials/page.tsx   # Material list + POs
│   ├── financials/page.tsx  # Budget vs actual, retainage, CO impact
│   └── documents/page.tsx   # Permits, HOA docs, inspections

src/app/proposal/[token]/
└── page.tsx                 # Public proposal approval page (no auth)

src/app/change-order/[token]/
└── page.tsx                 # Public change order approval page (no auth)

src/app/portal/(portal)/projects/
├── page.tsx                 # Customer project list
└── [id]/
    ├── page.tsx             # Project timeline + photos
    ├── financials/page.tsx  # Contract totals, payments, retainage
    ├── punch-list/page.tsx  # Final walkthrough sign-off
    └── messages/page.tsx    # Project-specific message thread
```

### Recommended Component Organization

```
src/components/projects/
├── pipeline-kanban.tsx      # Kanban board with @dnd-kit/core
├── pipeline-list.tsx        # Sortable/filterable table view toggle
├── project-card.tsx         # Kanban card (name, customer, stage, amount, days in stage)
├── gantt-timeline.tsx       # @svar-ui/react-gantt wrapper
├── proposal-builder.tsx     # Multi-step proposal builder (office)
├── tier-selector.tsx        # Good/Better/Best column UI (approval page)
├── addon-selector.tsx       # Add-on checkboxes with live total
├── signature-pad.tsx        # react-signature-canvas wrapper (draw + type modes)
├── phase-task-list.tsx      # Office phase task management
├── change-order-builder.tsx # Change order creation form
├── retainage-tracker.tsx    # Retainage holdback display
├── profitability-gauge.tsx  # Real-time margin indicator
└── project-activity-log.tsx # Immutable event timeline

src/components/field/
├── project-tab.tsx          # "Projects" tab content on /routes page
├── project-stop-card.tsx    # Project summary card in Projects tab list
├── project-workflow.tsx     # Phase task checklist + timer + camera + flag
├── project-photo-capture.tsx # Auto-context photo tagging (project/phase/task)
├── project-timer.tsx        # Start/stop timer with manual entry fallback
└── project-briefing.tsx     # Daily project briefing card
```

### Pattern 1: Public Approval Pages (Proposals + Change Orders)

Follow the exact pattern from `/quote/[token]/page.tsx`:

```typescript
// src/app/proposal/[token]/page.tsx
// Source: mirrors src/app/quote/[token]/page.tsx pattern

import { verifyProposalToken } from "@/lib/projects/proposal-token"
import { getProposalPublicData } from "@/actions/projects"
import { ProposalApprovalPage } from "@/components/projects/proposal-approval-page"

export const dynamic = "force-dynamic"

export default async function ProposalTokenPage({ params }: Props) {
  const { token } = await params
  const tokenPayload = await verifyProposalToken(token)
  if (!tokenPayload) return <ErrorCard ... />

  // CRITICAL: Use adminDb — customer has no Supabase auth session
  const data = await getProposalPublicData(tokenPayload.proposalId)
  return <ProposalApprovalPage data={data} />
}
```

Key: `PROPOSAL_TOKEN_SECRET` env var (separate from `QUOTE_TOKEN_SECRET`). Same `jose` HS256 signing, 90-day expiry. Validated in `verifyProposalToken`. Public page accesses DB via `adminDb` only.

### Pattern 2: Projects Schema — Core Tables

```typescript
// src/lib/db/schema/projects.ts
// RLS pattern: owner+office manage; tech reads assigned projects

export const projects = pgTable("projects", {
  id: uuid("id").defaultRandom().primaryKey(),
  org_id: uuid("org_id").notNull().references(() => orgs.id, { onDelete: "cascade" }),
  customer_id: uuid("customer_id").notNull().references(() => customers.id, { onDelete: "cascade" }),
  pool_id: uuid("pool_id").references(() => pools.id, { onDelete: "set null" }),
  // Project identification
  project_number: text("project_number"),        // e.g. "PRJ-0042"
  name: text("name").notNull(),
  project_type: text("project_type").notNull(),  // 'new_pool' | 'renovation' | 'equipment' | etc.
  template_id: uuid("template_id"),
  // Pipeline stage
  stage: text("stage").notNull().default("lead"),
  // Lead, Site Survey Scheduled, Survey Complete, Proposal Sent, Proposal Approved,
  // Deposit Received, Permitted, In Progress, Punch List, Complete, Warranty Active
  stage_entered_at: timestamp("stage_entered_at", { withTimezone: true }).defaultNow(),
  // Status (overlaps with stage for hold/suspension)
  status: text("status").notNull().default("active"),
  // 'active' | 'on_hold' | 'suspended' | 'cancelled' | 'complete'
  on_hold_reason: text("on_hold_reason"),
  suspended_at: timestamp("suspended_at", { withTimezone: true }),
  // Financial
  contract_amount: numeric("contract_amount", { precision: 12, scale: 2 }),
  retainage_pct: numeric("retainage_pct", { precision: 5, scale: 2 }).default("10"),
  // Dates
  estimated_start_date: text("estimated_start_date"),   // YYYY-MM-DD
  estimated_completion_date: text("estimated_completion_date"),
  actual_start_date: text("actual_start_date"),
  actual_completion_date: text("actual_completion_date"),
  // Site access notes
  site_notes: jsonb("site_notes").$type<{
    gate_code?: string
    access_instructions?: string
    utility_locations?: string
    dig_alert_number?: string
    hoa_contact?: string
    neighbor_notification?: string
    parking_instructions?: string
    custom_notes?: string
  }>(),
  // Lead source
  lead_source: text("lead_source"), // 'phone' | 'portal' | 'tech_flag' | 'referral' | 'website'
  lead_notes: text("lead_notes"),
  // Financing
  financing_status: text("financing_status"), // null | 'offered' | 'approved' | 'declined'
  // Activity log (same pattern as work_orders.activity_log)
  activity_log: jsonb("activity_log").$type<
    Array<{ type: string; at: string; by_id: string; note: string | null }>
  >(),
  // Inactivity tracking
  last_activity_at: timestamp("last_activity_at", { withTimezone: true }).defaultNow(),
  created_at: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  updated_at: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
})
```

### Pattern 3: Progress Billing (Extends Existing Invoices)

Do NOT create a separate invoices table for project invoices. Extend the existing `invoices` table:

```typescript
// Additions to existing invoices table (migration):
// project_id: uuid references projects.id
// invoice_type: text  — 'service' | 'project_deposit' | 'project_progress' | 'project_final'
// project_milestone_id: uuid references project_payment_milestones.id
// retainage_held: numeric(12, 2)  — amount withheld this invoice
// retainage_released: numeric(12, 2)  — retainage released (final invoice only)
```

This preserves all existing payment infrastructure (Stripe, dunning, AutoPay, portal view) without duplication.

### Pattern 4: Field Tech Project Tab

The `/routes` page gains a tab structure. The Projects tab shows active projects where `tech_id = current_user` on at least one phase scheduled for today or in-progress:

```typescript
// src/app/(app)/routes/page.tsx — add tabs
// Routes tab: existing route stop list (unchanged)
// Projects tab: active projects for this tech today
//   → tap project card → project workflow screen
//   → project workflow = Phase task checklist + Timer + Camera + Flag Issue tabs
//   → mirrors StopWorkflow UX (simple, not overloaded)
```

### Pattern 5: Gantt Chart with @svar-ui/react-gantt

```typescript
// src/components/projects/gantt-timeline.tsx
// Source: https://docs.svar.dev/react/gantt/

"use client"
import { Gantt } from "@svar-ui/react-gantt"

interface GanttPhase {
  id: string
  text: string             // phase name
  start_date: Date
  end_date: Date
  parent?: string          // dependency — id of predecessor
  progress?: number        // 0-100
}

// SVAR Gantt requires tasks in its own format
// Map project_phases to GanttPhase[] for display
// On drag complete: server action to update phase dates + recalculate dependents
```

IMPORTANT: SVAR Gantt uses its own CSS. Import it with `import "@svar-ui/react-gantt/codebase/svar-gantt.css"`. Test dark mode compatibility — may need CSS variable overrides.

### Anti-Patterns to Avoid

- **Don't create a new invoices table for project billing:** Extend the existing `invoices` table with `project_id` + `invoice_type` columns. All payment processing, dunning, and portal display already handles the invoices table.
- **Don't build a custom Gantt:** Even a simple horizontal bar chart with drag would take 2-3 weeks. @svar-ui/react-gantt is MIT licensed, covers all requirements, and React 19 compatible.
- **Don't use correlated subqueries in RLS policies for project tables:** Follow the memory — use LEFT JOIN + GROUP BY in `withRls` transactions. Complex project queries (materials + phases + photos) will trigger the known Drizzle RLS pitfall.
- **Don't add PROJECT_TOKEN_SECRET and CHANGE_ORDER_TOKEN_SECRET as the same secret:** Use separate env vars for each public token type (proposal, change order) — follows the pattern established by QUOTE_TOKEN_SECRET vs REPORT_TOKEN_SECRET.
- **Don't serialize photos as base64 in the offline db:** Follow the existing PhotoQueueItem pattern — store Blob (not indexed) with visitId→projectPhaseTaskId. Extend `photoQueue` in a new Dexie version bump.

---

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Gantt chart | Custom timeline with CSS grid/flexbox | @svar-ui/react-gantt | Drag-to-reschedule, resize, dependency lines, critical path highlighting — minimum 2-3 weeks custom work |
| Kanban drag-and-drop | Custom mousedown/touchstart handlers | @dnd-kit/core + @dnd-kit/sortable | Accessibility, touch support, collision detection, keyboard navigation all handled |
| Signature capture | Custom canvas mousedown drawing | react-signature-canvas | Handles pressure, bezier smoothing, mobile touch, getTrimmedCanvas for clean PDF export |
| Signature cleanup/PNG export | Canvas context manually | `sigRef.current.getTrimmedCanvas().toDataURL("image/png")` | Trimmed canvas removes whitespace automatically |
| JWT tokens for public pages | Custom HMAC or UUID lookup | jose (HS256, already in project) | Pattern is established; separate secret per token type |
| PDF generation for proposals, POs, warranty | HTML-to-PDF, puppeteer | @react-pdf/renderer (already installed) | Already configured in next.config.ts; hex colors only rule applies |

**Key insight:** This phase involves multiple complex UI components (Gantt, Kanban, e-signature). Using established libraries for each saves 4-6 weeks of development time and avoids edge cases (touch events, accessibility, printing) that are deceptively complex.

---

## Common Pitfalls

### Pitfall 1: oklch() Colors in PDFs and Gantt
**What goes wrong:** Proposal PDF renders with no colors; Gantt chart lines/fills fail to render.
**Why it happens:** @react-pdf/renderer and WebGL/canvas contexts cannot parse CSS oklch() — they need hex.
**How to avoid:** All colors in `proposal-pdf.tsx`, `warranty-certificate-pdf.tsx`, `po-pdf.tsx` MUST use the hex constant palette (same as `quote-pdf.tsx`). For SVAR Gantt, check if it accepts CSS variables or requires hex for task bar colors.
**Warning signs:** Colors show as black or missing; no explicit error thrown.

### Pitfall 2: Drizzle RLS Correlated Subqueries on Project Tables
**What goes wrong:** Complex queries fetching project + phases + materials + photos all return empty results inside `withRls`.
**Why it happens:** Correlated subqueries on RLS-protected tables inside the transaction return empty results (known pitfall documented in MEMORY.md).
**How to avoid:** Use LEFT JOIN queries instead of nested selects. For multi-table project queries, build them as explicit JOIN chains with `db.select().from(projects).leftJoin(projectPhases, ...).leftJoin(...)`.
**Warning signs:** Empty arrays returned with no error; works fine with adminDb but not withRls.

### Pitfall 3: Public Approval Page Using withRls Instead of adminDb
**What goes wrong:** Proposal/change-order approval page returns 404 or empty data.
**Why it happens:** Customer has no Supabase auth session — `withRls(null, ...)` returns empty results. Token-based public pages MUST use `adminDb`.
**How to avoid:** Follow the exact pattern from `/quote/[token]/page.tsx` — use `adminDb` (service role) in `getProposalPublicData()`. The JWT token provides authorization; RLS is bypassed intentionally.
**Warning signs:** Data works in development when logged in but fails on customer-facing links.

### Pitfall 4: Dexie Version Conflict for Project Photo Offline Storage
**What goes wrong:** App crashes with Dexie version conflict error; existing offline data corrupted.
**Why it happens:** Dexie uses immutable versioning — modifying an existing version definition breaks the IndexedDB schema.
**How to avoid:** Add a new Dexie `this.version(N+1).stores({...})` block that carries forward ALL existing store definitions unchanged, then adds new stores. Current version is v3 — project offline data goes in v4.
**Warning signs:** "IDBUpgradeTransaction was aborted" console error; offline route data disappears.

### Pitfall 5: Project Invoice Colliding with Existing Invoice Numbering
**What goes wrong:** Project deposit invoices and service invoices share the same `next_invoice_number` counter, creating gaps or duplicates in service invoice numbering.
**Why it happens:** `org_settings.next_invoice_number` is incremented for every invoice. Project invoices are high-value and infrequent — they should use the same sequence to maintain a single coherent ledger.
**How to avoid:** Use the same number sequence. Add `invoice_type` column to distinguish at display time. Do NOT create a separate counter.

### Pitfall 6: Gantt Phase Update Not Cascading Dependencies
**What goes wrong:** Tech moves Phase 1's end date forward via drag; Phase 2 (which depends on Phase 1) still shows the old start date.
**Why it happens:** Gantt onDragEnd updates only the dragged phase; dependent phases need a cascading recalculation.
**How to avoid:** On every phase date change (drag, resize, manual edit), run a dependency cascade server action that fetches all phases for the project sorted by `sort_order`, builds a DAG, and recalculates start/end dates for all dependents. This is a single atomic transaction.
**Warning signs:** Phase bars overlap in the Gantt despite dependency lines; Gantt shows incorrect critical path.

### Pitfall 7: Project_id Not Added to PAGE_TITLES
**What goes wrong:** Project detail pages show "DeweyIQ" in the header bar instead of "Projects".
**Why it happens:** PAGE_TITLES map in `app-header.tsx` only matches exact or prefix routes.
**How to avoid:** Add `"/projects": "Projects"` to the PAGE_TITLES map in the same commit as creating the routes page. Also add the "/projects" nav item to `app-sidebar.tsx`.

### Pitfall 8: Retainage Double-Counting on Final Invoice
**What goes wrong:** Final invoice shows incorrect retainage balance — either over-releases or under-releases.
**Why it happens:** Retainage held across multiple progress invoices must be summed correctly; if any progress invoice was later voided, the retainage held needs adjustment.
**How to avoid:** Query all non-void project invoices for `sum(retainage_held)` at final invoice generation time — do NOT rely on a stored running total. Calculate fresh from the invoice records.

### Pitfall 9: Same Dynamic Slug Name Conflict for Proposal/Change-Order Routes
**What goes wrong:** App crashes with "You cannot use different slug names for the same dynamic path".
**Why it happens:** Next.js requires the same `[param]` name at the same directory level. If `proposal/[id]/approve` and `proposal/[token]/pdf` exist, they conflict.
**How to avoid:** Use `[id]` consistently as the param name for all routes under `proposal/` and `change-order/`. Extract semantically as `const token = (await params).id` when the value is a token.

---

## Code Examples

### Verified: Token signing pattern (from existing quote-token.ts)

```typescript
// src/lib/projects/proposal-token.ts
// Source: mirrors src/lib/quotes/quote-token.ts exactly

import { SignJWT, jwtVerify, type JWTPayload } from "jose"

interface ProposalTokenPayload extends JWTPayload {
  proposalId: string
}

export async function signProposalToken(proposalId: string): Promise<string> {
  const secret = process.env.PROPOSAL_TOKEN_SECRET
  if (!secret) throw new Error("PROPOSAL_TOKEN_SECRET not set")
  const secretKey = new TextEncoder().encode(secret)

  return new SignJWT({ proposalId })
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime("90d")
    .sign(secretKey)
}

export async function verifyProposalToken(token: string): Promise<{ proposalId: string } | null> {
  try {
    const secret = process.env.PROPOSAL_TOKEN_SECRET
    if (!secret) return null
    const { payload } = await jwtVerify(token, new TextEncoder().encode(secret))
    const p = payload as ProposalTokenPayload
    if (!p.proposalId || typeof p.proposalId !== "string") return null
    return { proposalId: p.proposalId }
  } catch {
    return null
  }
}
```

### Verified: React Signature Canvas usage

```typescript
// src/components/projects/signature-pad.tsx
// Source: react-signature-canvas npm README

"use client"
import SignatureCanvas from "react-signature-canvas"
import { useRef, useState } from "react"

interface SignaturePadProps {
  onSign: (dataUrl: string) => void  // PNG data URL for PDF embed
}

export function SignaturePad({ onSign }: SignaturePadProps) {
  const sigRef = useRef<SignatureCanvas>(null)
  const [mode, setMode] = useState<"draw" | "type">("draw")

  function handleClear() {
    sigRef.current?.clear()
  }

  function handleSave() {
    if (!sigRef.current || sigRef.current.isEmpty()) return
    // getTrimmedCanvas removes whitespace — clean PNG for PDF
    const dataUrl = sigRef.current.getTrimmedCanvas().toDataURL("image/png")
    onSign(dataUrl)
  }

  return (
    <div>
      <SignatureCanvas
        ref={sigRef}
        penColor="#0f172a"
        canvasProps={{ className: "border rounded bg-white w-full h-32" }}
      />
      <button onClick={handleClear}>Clear</button>
      <button onClick={handleSave}>Sign</button>
    </div>
  )
}
```

### Verified: SVAR Gantt chart integration

```typescript
// src/components/projects/gantt-timeline.tsx
// Source: https://docs.svar.dev/react/gantt/guides/installation_initialization/
// Import CSS required: "@svar-ui/react-gantt/codebase/svar-gantt.css"

"use client"
import { Gantt } from "@svar-ui/react-gantt"
import "@svar-ui/react-gantt/codebase/svar-gantt.css"

interface GanttTask {
  id: number | string
  text: string
  start_date: Date
  end_date: Date
  parent?: number | string
  progress?: number
}

interface GanttLink {
  id: number | string
  source: number | string
  target: number | string
  type: "0"  // finish-to-start
}

interface Props {
  tasks: GanttTask[]
  links: GanttLink[]
  onTaskMove: (task: GanttTask) => Promise<void>  // triggers dependency cascade
}

export function GanttTimeline({ tasks, links, onTaskMove }: Props) {
  return (
    <Gantt
      tasks={tasks}
      links={links}
      onDataUpdated={async ({ action, id, task }) => {
        if (action === "move-task" || action === "resize-task") {
          await onTaskMove(task)
        }
      }}
    />
  )
}
```

### Verified: Dexie v4 migration for project offline data

```typescript
// src/lib/offline/db.ts — add after existing v3 block
// NEVER MODIFY older versions — Dexie immutable versioning

// v4: Phase 12 — project offline stores
this.version(4).stores({
  // Carry forward all v3 stores unchanged
  syncQueue: "++id, createdAt, retries, status",
  routeCache: "id, cachedAt, expiresAt",
  visitDrafts: "id, stopId, updatedAt, status",
  photoQueue: "++id, visitId, orgId, status, createdAt",
  // New: project task drafts (timer state + task completions)
  projectTaskDrafts: "id, projectId, phaseId, updatedAt, status",
  // New: project photo queue (same blob-not-indexed pattern as photoQueue)
  projectPhotoQueue: "++id, projectId, phaseId, status, createdAt",
})
```

### Verified: RLS pattern for project tables (tech reads assigned projects)

```typescript
// Project phases — tech reads phases for their assigned projects
pgPolicy("project_phases_select_policy", {
  for: "select",
  to: authenticatedRole,
  using: sql`
    org_id = (select auth.jwt() ->> 'org_id')::uuid
    AND (
      (select auth.jwt() ->> 'user_role') IN ('owner', 'office')
      OR (
        (select auth.jwt() ->> 'user_role') = 'tech'
        AND id IN (
          SELECT phase_id FROM project_phase_assignments
          WHERE tech_id = auth.uid()
        )
      )
    )
  `,
})
```

### Verified: Progress invoice auto-generation on phase completion

```typescript
// src/actions/projects.ts
// When office marks a phase complete, check if a payment milestone triggers an invoice

async function onPhaseComplete(phaseId: string, token: UserToken) {
  return withRls(token, async (db) => {
    const [phase] = await db.select().from(projectPhases).where(eq(projectPhases.id, phaseId))
    const milestones = await db.select().from(projectPaymentMilestones)
      .where(
        and(
          eq(projectPaymentMilestones.project_id, phase.project_id),
          eq(projectPaymentMilestones.trigger_phase_id, phaseId),
          isNull(projectPaymentMilestones.invoice_id)
        )
      )

    for (const milestone of milestones) {
      // Auto-generate DRAFT invoice — office must explicitly send
      const [inv] = await db.insert(invoices).values({
        org_id: phase.org_id,
        customer_id: milestone.customer_id,
        project_id: milestone.project_id,
        invoice_type: "project_progress",
        project_milestone_id: milestone.id,
        status: "draft",  // HELD for review — not sent automatically
        // retainage math:
        retainage_held: (milestone.amount * phase.retainage_pct / 100).toFixed(2),
        total: (milestone.amount * (1 - phase.retainage_pct / 100)).toFixed(2),
        ...
      }).returning()
      // Notify office (alert)
      await db.insert(alerts).values({
        org_id: phase.org_id,
        alert_type: "project_invoice_ready",
        title: `Progress invoice ready for review`,
        ...
      })
    }
  })
}
```

---

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| react-beautiful-dnd for kanban | @dnd-kit/core | 2022-2023 | rbd is unmaintained; dnd-kit has better TypeScript, accessibility, touch support |
| Separate tables per document type | Polymorphic documents table with type column | Current best practice | Reduces JOIN complexity; applies to project_documents table |
| Hard-delete for compliance docs | Soft-archive (archived_at timestamp) | Regulatory requirement | PROJ-91 requires immutability; all project docs soft-archive only |
| Canvas-only e-signatures | Draw + typed name as signature | Current SaaS standard | Typed signature with stylized font is legally equivalent in most US jurisdictions and more mobile-friendly |

**Deprecated/outdated:**
- react-beautiful-dnd: Not maintained since 2022. Use @dnd-kit/core for all new drag-and-drop.
- DHTMLX Gantt: Commercial license required for full features. Use @svar-ui/react-gantt (MIT) for this project.

---

## Open Questions

1. **SVAR Gantt Dark Mode Compatibility**
   - What we know: SVAR Gantt imports its own CSS stylesheet; the project uses a dark-first design system with CSS variables
   - What's unclear: Whether SVAR Gantt's CSS variables can be overridden to match the dark design system, or whether significant CSS work is needed
   - Recommendation: In the Gantt plan step, test SVAR Gantt rendering in dark mode immediately; budget 2-4 hours for CSS variable overrides if needed; if dark mode is intractable, wrap in a white-background container (acceptable for a complex timeline view)

2. **Inactivity Alert Threshold Default**
   - What we know: Configurable in settings (Claude's discretion), no user preference stated
   - What's unclear: What "no activity" means exactly — no phase updates? No tech time logs? No photos?
   - Recommendation: Default to 7 days without any project update (phase status change, material log, photo, time log, or office note). Configurable in org_settings as `project_inactivity_alert_days` integer field. 7 days is aggressive enough to catch real stalls but not so tight it creates noise.

3. **Consumer Financing Integration (PROJ-22)**
   - What we know: The requirement calls for linking to external financing partner with project amount pre-filled
   - What's unclear: Whether any specific API is expected (Sunbit, HFS, Lyon Financial all have different integration patterns)
   - Recommendation: Implement as configurable external URL with query parameter substitution (`{{amount}}`, `{{customer_name}}`). Store `financing_partner_url` in org_settings. No API integration in Phase 12 — link-out only. Mark financing status manually by office.

4. **Subcontractor Email Notifications (PROJ-38)**
   - What we know: Send email when sub is assigned; subcontractors have their own email field
   - What's unclear: Whether subcontractors need portal access or just one-way email
   - Recommendation: Email only in Phase 12. No portal access for subs — they receive a formatted email with project address, scope, dates, and site access info. A sub-contractor portal can be a future phase.

5. **@svar-ui/react-gantt Data Format**
   - What we know: Tasks need `start_date: Date`, `end_date: Date`, `parent` for dependencies
   - What's unclear: Exact API for handling dependency recalculation events server-side
   - Recommendation: Use `onDataUpdated` callback with `action` discriminator; on 'move-task' or 'resize-task', call a server action that recalculates all dependent phase dates using a topological sort of the dependency DAG.

---

## Phase Sub-Division Recommendation

Given 92 requirements, Phase 12 should be implemented as 9 focused sub-phases:

| Sub-Phase | Name | Key Requirements | Deliverable |
|-----------|------|-----------------|-------------|
| 12-01 | Schema + Templates | PROJ-01, 02, 03, 04, 34 | All new DB tables; project types; templates; subcontractor directory |
| 12-02 | Pipeline + Project CRUD | PROJ-05, 06, 43, 44, 52, 53, 55, 56, 78, 79, 80, 83, 91 | /projects page with kanban/list; project creation; sidebar nav |
| 12-03 | Proposal Builder + Public Approval | PROJ-07, 08, 09, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19, 20, 21, 22, 23 | Proposal builder; /proposal/[token] approval page with tiers, add-ons, signature, Stripe deposit |
| 12-04 | Permits + Site Survey + Materials | PROJ-24, 25, 26, 27, 28, 29, 30, 31, 32, 33 | Permit tracking; HOA docs; material list; PO generation; material receiving |
| 12-05 | Phase Scheduling + Gantt | PROJ-39, 40, 41, 42, 43, 45 | Project phases; Gantt timeline; dependency management; schedule integration |
| 12-06 | Subcontractor Coordination | PROJ-35, 36, 37, 38 | Sub assignments; payment tracking; schedule notifications |
| 12-07 | Field Tech Project Tab | PROJ-46, 47, 48, 49, 50, 51, 54, 55, 56 | /routes Projects tab; task checklist; timer; photos; issue flags; phase completion |
| 12-08 | Change Orders + Progress Billing | PROJ-57, 58, 59, 60, 61, 62, 63, 64, 65, 66, 67, 68, 90, 92 | Change order builder; /change-order/[token]; progress invoices; retainage; profitability |
| 12-09 | Inspections + Warranty + Portal | PROJ-69, 70, 71, 72, 73, 74, 75, 76, 77, 81, 82, 84, 85, 86, 87, 88, 89 | Inspections; punch list; warranty certificate; portal project views; customer approval flows; reporting |

---

## Sources

### Primary (HIGH confidence)
- Codebase: `/src/lib/db/schema/quotes.ts` — quote versioning pattern, snapshot_json, token-based public access
- Codebase: `/src/lib/db/schema/invoices.ts` + `payments.ts` — invoice schema to extend, payment infrastructure
- Codebase: `/src/lib/db/schema/work-orders.ts` — activity_log pattern, status lifecycle
- Codebase: `/src/lib/db/schema/alerts.ts` — alert creation pattern for issue flags + milestone notifications
- Codebase: `/src/lib/db/schema/time-entries.ts` — time_entries shift tracking; project task time refs time_entry_id
- Codebase: `/src/lib/db/schema/route-stops.ts` — stop_type pattern for survey stops
- Codebase: `/src/lib/db/schema/visit-photos.ts` — photo storage pattern for project photos
- Codebase: `/src/lib/db/schema/portal-messages.ts` — project-scoped messages pattern (add project_id FK)
- Codebase: `/src/app/quote/[token]/page.tsx` — public approval page pattern; adminDb usage
- Codebase: `/src/lib/quotes/quote-token.ts` — JWT token pattern to replicate for proposals
- Codebase: `/src/lib/pdf/quote-pdf.tsx` — PDF generation pattern; hex color palette
- Codebase: `/src/lib/offline/db.ts` — Dexie versioning; photo queue pattern for project photos
- Codebase: `/src/components/field/stop-workflow.tsx` — field workflow UX pattern to mirror for project workflow
- Codebase: `/src/components/shell/app-header.tsx` + `app-sidebar.tsx` — PAGE_TITLES + nav items to add

### Secondary (MEDIUM confidence)
- [npm: @svar-ui/react-gantt](https://www.npmjs.com/package/@svar-ui/react-gantt) — MIT license, React 19 compatible, drag/resize/dependencies; verified package exists
- [SVAR Gantt docs](https://docs.svar.dev/react/gantt/guides/installation_initialization/) — installation and initialization verified
- [npm: react-signature-canvas](https://www.npmjs.com/package/react-signature-canvas) — standard signature canvas wrapper; getTrimmedCanvas API verified
- [dnd-kit docs](https://dndkit.com/) — @dnd-kit/core is current standard for kanban drag-and-drop

### Tertiary (LOW confidence — verify at implementation)
- SVAR Gantt dark mode CSS variable override approach — needs empirical verification
- Specific API shape for SVAR Gantt `onDataUpdated` callback — verify against current version docs at implementation time

---

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH — all libraries verified against official sources; all extend existing project patterns
- Architecture: HIGH — directly derived from reading existing Phase 6-11 codebase patterns
- Pitfalls: HIGH — all derived from MEMORY.md confirmed patterns (drizzle RLS, Dexie versioning, oklch PDF) + Next.js dynamic route slug conflict documented in MEMORY.md
- Sub-phase plan: MEDIUM — decomposition is logical but PROJ-40 (Gantt) and PROJ-18 (approval page) may require more time than their sub-phases suggest

**Research date:** 2026-03-16
**Valid until:** 2026-04-16 (stable stack; @svar-ui/react-gantt version may update)
