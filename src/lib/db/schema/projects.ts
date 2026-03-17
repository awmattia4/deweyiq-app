/**
 * Phase 12: Projects & Renovations — Core Project Schema
 *
 * Tables: projects, project_templates, project_phases, project_phase_tasks, project_surveys
 *
 * RLS:
 * - projects: SELECT all org members (tech sees all for assignment lookup), INSERT/UPDATE owner+office, DELETE owner
 * - project_templates: SELECT all org, INSERT/UPDATE/DELETE owner+office
 * - project_phases: SELECT all org, INSERT/UPDATE/DELETE owner+office
 * - project_phase_tasks: SELECT all org, INSERT/UPDATE owner+office+tech, DELETE owner+office
 * - project_surveys: SELECT all org, INSERT owner+office+tech, UPDATE/DELETE owner+office
 */
import {
  boolean,
  index,
  integer,
  jsonb,
  numeric,
  pgTable,
  text,
  timestamp,
  uuid,
} from "drizzle-orm/pg-core"
import { pgPolicy } from "drizzle-orm/pg-core"
import { authenticatedRole } from "drizzle-orm/supabase"
import { sql } from "drizzle-orm"
import { orgs } from "./orgs"
import { customers } from "./customers"
import { pools } from "./pools"
import { profiles } from "./profiles"
import { routeStops } from "./route-stops"

// ---------------------------------------------------------------------------
// projects
// ---------------------------------------------------------------------------

export const projects = pgTable(
  "projects",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    org_id: uuid("org_id")
      .notNull()
      .references(() => orgs.id, { onDelete: "cascade" }),
    customer_id: uuid("customer_id")
      .notNull()
      .references(() => customers.id, { onDelete: "cascade" }),
    pool_id: uuid("pool_id").references(() => pools.id, { onDelete: "set null" }),
    // Sequential project number with prefix (e.g. "PROJ-0001")
    project_number: text("project_number"),
    name: text("name").notNull(),
    // project_type: 'new_pool' | 'renovation' | 'equipment' | 'remodel' | 'replaster' | 'other'
    project_type: text("project_type").notNull().default("renovation"),
    template_id: uuid("template_id"),
    // stage lifecycle: lead -> site_survey_scheduled -> survey_complete -> proposal_sent ->
    //   proposal_approved -> deposit_received -> permitted -> in_progress -> punch_list -> complete -> warranty_active
    stage: text("stage").notNull().default("lead"),
    stage_entered_at: timestamp("stage_entered_at", { withTimezone: true }).defaultNow(),
    // status: 'active' | 'on_hold' | 'suspended' | 'cancelled' | 'complete'
    status: text("status").notNull().default("active"),
    on_hold_reason: text("on_hold_reason"),
    suspended_at: timestamp("suspended_at", { withTimezone: true }),
    // Financial
    contract_amount: numeric("contract_amount", { precision: 12, scale: 2 }),
    retainage_pct: numeric("retainage_pct", { precision: 5, scale: 2 }).default("10"),
    // Dates stored as YYYY-MM-DD text (per date-utils convention — never use toISOString().split("T")[0])
    estimated_start_date: text("estimated_start_date"),
    estimated_completion_date: text("estimated_completion_date"),
    actual_start_date: text("actual_start_date"),
    actual_completion_date: text("actual_completion_date"),
    // Structured site-specific notes (access, HOA rules, utility locations, etc.)
    site_notes: jsonb("site_notes").$type<Record<string, string>>(),
    // lead_source: 'phone' | 'portal' | 'tech_flag' | 'referral' | 'website'
    lead_source: text("lead_source"),
    lead_notes: text("lead_notes"),
    // financing_status: 'not_needed' | 'pending' | 'approved' | 'denied' | null
    financing_status: text("financing_status"),
    // Audit trail — JSONB array of { type, at, by_id, note } events
    activity_log: jsonb("activity_log").$type<
      Array<{ type: string; at: string; by_id: string; note: string | null }>
    >(),
    last_activity_at: timestamp("last_activity_at", { withTimezone: true }),
    // Cancellation policy snapshot (copied from proposal at signing)
    cancellation_policy: jsonb("cancellation_policy").$type<Record<string, unknown>>(),
    created_at: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    updated_at: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    index("projects_org_id_idx").on(table.org_id),
    index("projects_customer_id_idx").on(table.customer_id),
    index("projects_stage_idx").on(table.stage),
    index("projects_status_idx").on(table.status),

    // RLS: all org members can view projects
    pgPolicy("projects_select_policy", {
      for: "select",
      to: authenticatedRole,
      using: sql`org_id = (select auth.jwt() ->> 'org_id')::uuid`,
    }),
    // RLS: owner+office can create projects
    pgPolicy("projects_insert_policy", {
      for: "insert",
      to: authenticatedRole,
      withCheck: sql`
        org_id = (select auth.jwt() ->> 'org_id')::uuid
        AND (select auth.jwt() ->> 'user_role') IN ('owner', 'office')
      `,
    }),
    // RLS: owner+office can update projects
    pgPolicy("projects_update_policy", {
      for: "update",
      to: authenticatedRole,
      using: sql`
        org_id = (select auth.jwt() ->> 'org_id')::uuid
        AND (select auth.jwt() ->> 'user_role') IN ('owner', 'office')
      `,
      withCheck: sql`
        org_id = (select auth.jwt() ->> 'org_id')::uuid
        AND (select auth.jwt() ->> 'user_role') IN ('owner', 'office')
      `,
    }),
    // RLS: only owner can delete projects
    pgPolicy("projects_delete_policy", {
      for: "delete",
      to: authenticatedRole,
      using: sql`
        org_id = (select auth.jwt() ->> 'org_id')::uuid
        AND (select auth.jwt() ->> 'user_role') = 'owner'
      `,
    }),
  ]
).enableRLS()

// ---------------------------------------------------------------------------
// project_templates
// ---------------------------------------------------------------------------

export const projectTemplates = pgTable(
  "project_templates",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    org_id: uuid("org_id")
      .notNull()
      .references(() => orgs.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    // project_type: 'new_pool' | 'renovation' | 'equipment' | 'remodel' | 'replaster' | 'other'
    project_type: text("project_type").notNull().default("renovation"),
    // Array of phase definitions: [{ name, sort_order, estimated_days, tasks: [{ name, sort_order, is_required }], materials: [...] }]
    default_phases: jsonb("default_phases").$type<
      Array<{
        name: string
        sort_order: number
        estimated_days: number
        tasks: Array<{ name: string; sort_order: number; is_required: boolean }>
        materials: Array<{ name: string; category: string; unit: string; quantity_estimated: number }>
      }>
    >(),
    // Default payment schedule: [{ name, percentage, trigger_stage }]
    default_payment_schedule: jsonb("default_payment_schedule").$type<
      Array<{ name: string; percentage: number; trigger_stage: string }>
    >(),
    // Good/Better/Best tier config: { good: { label, features, markup_pct }, better: {...}, best: {...} }
    tier_config: jsonb("tier_config").$type<Record<string, { label: string; features: string[]; markup_pct: number }>>(),
    is_active: boolean("is_active").notNull().default(true),
    created_at: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    updated_at: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    index("project_templates_org_id_idx").on(table.org_id),

    // RLS: all org members can view templates
    pgPolicy("project_templates_select_policy", {
      for: "select",
      to: authenticatedRole,
      using: sql`org_id = (select auth.jwt() ->> 'org_id')::uuid`,
    }),
    // RLS: owner+office can manage templates
    pgPolicy("project_templates_insert_policy", {
      for: "insert",
      to: authenticatedRole,
      withCheck: sql`
        org_id = (select auth.jwt() ->> 'org_id')::uuid
        AND (select auth.jwt() ->> 'user_role') IN ('owner', 'office')
      `,
    }),
    pgPolicy("project_templates_update_policy", {
      for: "update",
      to: authenticatedRole,
      using: sql`
        org_id = (select auth.jwt() ->> 'org_id')::uuid
        AND (select auth.jwt() ->> 'user_role') IN ('owner', 'office')
      `,
      withCheck: sql`
        org_id = (select auth.jwt() ->> 'org_id')::uuid
        AND (select auth.jwt() ->> 'user_role') IN ('owner', 'office')
      `,
    }),
    pgPolicy("project_templates_delete_policy", {
      for: "delete",
      to: authenticatedRole,
      using: sql`
        org_id = (select auth.jwt() ->> 'org_id')::uuid
        AND (select auth.jwt() ->> 'user_role') IN ('owner', 'office')
      `,
    }),
  ]
).enableRLS()

// ---------------------------------------------------------------------------
// project_phases
// ---------------------------------------------------------------------------

export const projectPhases = pgTable(
  "project_phases",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    org_id: uuid("org_id")
      .notNull()
      .references(() => orgs.id, { onDelete: "cascade" }),
    project_id: uuid("project_id")
      .notNull()
      .references(() => projects.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    sort_order: integer("sort_order").notNull().default(0),
    // status: 'not_started' | 'in_progress' | 'complete' | 'skipped' | 'on_hold'
    status: text("status").notNull().default("not_started"),
    // Self-reference for phase dependencies (no FK to avoid cascade complexity)
    dependency_phase_id: uuid("dependency_phase_id"),
    // dependency_type: 'hard' (cannot start until dependency complete) | 'soft' (warning only)
    dependency_type: text("dependency_type").default("hard"),
    assigned_tech_id: uuid("assigned_tech_id").references(() => profiles.id, {
      onDelete: "set null",
    }),
    // Dates stored as YYYY-MM-DD text
    estimated_start_date: text("estimated_start_date"),
    estimated_end_date: text("estimated_end_date"),
    actual_start_date: text("actual_start_date"),
    actual_end_date: text("actual_end_date"),
    estimated_labor_hours: numeric("estimated_labor_hours", { precision: 8, scale: 2 }),
    actual_labor_hours: numeric("actual_labor_hours", { precision: 8, scale: 2 }),
    is_outdoor: boolean("is_outdoor").notNull().default(false),
    notes: text("notes"),
    created_at: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    updated_at: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    index("project_phases_project_id_idx").on(table.project_id),
    index("project_phases_org_id_idx").on(table.org_id),

    // RLS: all org members can view phases
    pgPolicy("project_phases_select_policy", {
      for: "select",
      to: authenticatedRole,
      using: sql`org_id = (select auth.jwt() ->> 'org_id')::uuid`,
    }),
    // RLS: owner+office can create phases
    pgPolicy("project_phases_insert_policy", {
      for: "insert",
      to: authenticatedRole,
      withCheck: sql`
        org_id = (select auth.jwt() ->> 'org_id')::uuid
        AND (select auth.jwt() ->> 'user_role') IN ('owner', 'office')
      `,
    }),
    // RLS: owner+office can update phases
    pgPolicy("project_phases_update_policy", {
      for: "update",
      to: authenticatedRole,
      using: sql`
        org_id = (select auth.jwt() ->> 'org_id')::uuid
        AND (select auth.jwt() ->> 'user_role') IN ('owner', 'office')
      `,
      withCheck: sql`
        org_id = (select auth.jwt() ->> 'org_id')::uuid
        AND (select auth.jwt() ->> 'user_role') IN ('owner', 'office')
      `,
    }),
    // RLS: owner+office can delete phases
    pgPolicy("project_phases_delete_policy", {
      for: "delete",
      to: authenticatedRole,
      using: sql`
        org_id = (select auth.jwt() ->> 'org_id')::uuid
        AND (select auth.jwt() ->> 'user_role') IN ('owner', 'office')
      `,
    }),
  ]
).enableRLS()

// ---------------------------------------------------------------------------
// project_phase_tasks
// ---------------------------------------------------------------------------

export const projectPhaseTasks = pgTable(
  "project_phase_tasks",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    org_id: uuid("org_id")
      .notNull()
      .references(() => orgs.id, { onDelete: "cascade" }),
    phase_id: uuid("phase_id")
      .notNull()
      .references(() => projectPhases.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    sort_order: integer("sort_order").notNull().default(0),
    is_completed: boolean("is_completed").notNull().default(false),
    completed_at: timestamp("completed_at", { withTimezone: true }),
    completed_by: uuid("completed_by").references(() => profiles.id, { onDelete: "set null" }),
    notes: text("notes"),
    is_required: boolean("is_required").notNull().default(true),
    created_at: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    index("project_phase_tasks_phase_id_idx").on(table.phase_id),

    // RLS: all org members can view tasks
    pgPolicy("project_phase_tasks_select_policy", {
      for: "select",
      to: authenticatedRole,
      using: sql`org_id = (select auth.jwt() ->> 'org_id')::uuid`,
    }),
    // RLS: owner+office+tech can create/update tasks (techs complete tasks in field)
    pgPolicy("project_phase_tasks_insert_policy", {
      for: "insert",
      to: authenticatedRole,
      withCheck: sql`
        org_id = (select auth.jwt() ->> 'org_id')::uuid
        AND (select auth.jwt() ->> 'user_role') IN ('owner', 'office', 'tech')
      `,
    }),
    pgPolicy("project_phase_tasks_update_policy", {
      for: "update",
      to: authenticatedRole,
      using: sql`
        org_id = (select auth.jwt() ->> 'org_id')::uuid
        AND (select auth.jwt() ->> 'user_role') IN ('owner', 'office', 'tech')
      `,
      withCheck: sql`
        org_id = (select auth.jwt() ->> 'org_id')::uuid
        AND (select auth.jwt() ->> 'user_role') IN ('owner', 'office', 'tech')
      `,
    }),
    // RLS: owner+office can delete tasks
    pgPolicy("project_phase_tasks_delete_policy", {
      for: "delete",
      to: authenticatedRole,
      using: sql`
        org_id = (select auth.jwt() ->> 'org_id')::uuid
        AND (select auth.jwt() ->> 'user_role') IN ('owner', 'office')
      `,
    }),
  ]
).enableRLS()

// ---------------------------------------------------------------------------
// project_surveys
// ---------------------------------------------------------------------------

export const projectSurveys = pgTable(
  "project_surveys",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    org_id: uuid("org_id")
      .notNull()
      .references(() => orgs.id, { onDelete: "cascade" }),
    project_id: uuid("project_id")
      .notNull()
      .references(() => projects.id, { onDelete: "cascade" }),
    // Optional link to a route stop for scheduling the survey visit
    route_stop_id: uuid("route_stop_id").references(() => routeStops.id, { onDelete: "set null" }),
    surveyed_by: uuid("surveyed_by").references(() => profiles.id, { onDelete: "set null" }),
    surveyed_at: timestamp("surveyed_at", { withTimezone: true }),
    // Freeform measurements JSONB: { pool_length_ft, pool_width_ft, depth_shallow, depth_deep, ... }
    measurements: jsonb("measurements").$type<Record<string, number | string>>(),
    // Existing conditions assessment: { surface_condition, equipment_condition, plumbing_condition, ... }
    existing_conditions: jsonb("existing_conditions").$type<Record<string, string>>(),
    access_constraints: text("access_constraints"),
    utility_locations: text("utility_locations"),
    hoa_requirements: text("hoa_requirements"),
    // Array of Supabase Storage paths for survey photos
    photos: jsonb("photos").$type<string[]>(),
    notes: text("notes"),
    created_at: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    index("project_surveys_project_id_idx").on(table.project_id),

    // RLS: all org members can view surveys
    pgPolicy("project_surveys_select_policy", {
      for: "select",
      to: authenticatedRole,
      using: sql`org_id = (select auth.jwt() ->> 'org_id')::uuid`,
    }),
    // RLS: owner+office+tech can create surveys (tech performs site surveys)
    pgPolicy("project_surveys_insert_policy", {
      for: "insert",
      to: authenticatedRole,
      withCheck: sql`
        org_id = (select auth.jwt() ->> 'org_id')::uuid
        AND (select auth.jwt() ->> 'user_role') IN ('owner', 'office', 'tech')
      `,
    }),
    // RLS: owner+office can update surveys
    pgPolicy("project_surveys_update_policy", {
      for: "update",
      to: authenticatedRole,
      using: sql`
        org_id = (select auth.jwt() ->> 'org_id')::uuid
        AND (select auth.jwt() ->> 'user_role') IN ('owner', 'office')
      `,
      withCheck: sql`
        org_id = (select auth.jwt() ->> 'org_id')::uuid
        AND (select auth.jwt() ->> 'user_role') IN ('owner', 'office')
      `,
    }),
    // RLS: owner+office can delete surveys
    pgPolicy("project_surveys_delete_policy", {
      for: "delete",
      to: authenticatedRole,
      using: sql`
        org_id = (select auth.jwt() ->> 'org_id')::uuid
        AND (select auth.jwt() ->> 'user_role') IN ('owner', 'office')
      `,
    }),
  ]
).enableRLS()
