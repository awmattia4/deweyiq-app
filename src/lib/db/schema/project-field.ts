/**
 * Phase 12: Projects & Renovations — Field Tools Schema
 *
 * Tables: project_photos, project_time_logs, project_issue_flags,
 *         project_equipment_assignments
 *
 * Field-facing tables that tech uses on site. Techs can insert in all tables;
 * office/owner can manage all. Photos use soft-archive (PROJ-91).
 *
 * RLS: all org members SELECT, tech INSERT, owner+office full CRUD
 */
import {
  index,
  jsonb,
  numeric,
  pgTable,
  text,
  timestamp,
  uuid,
  integer,
} from "drizzle-orm/pg-core"
import { pgPolicy } from "drizzle-orm/pg-core"
import { authenticatedRole } from "drizzle-orm/supabase"
import { sql } from "drizzle-orm"
import { orgs } from "./orgs"
import { projects } from "./projects"
import { projectPhases, projectPhaseTasks } from "./projects"
import { projectChangeOrders } from "./project-billing"
import { profiles } from "./profiles"
import { alerts } from "./alerts"
import { timeEntries } from "./time-entries"

// ---------------------------------------------------------------------------
// project_photos
// ---------------------------------------------------------------------------

export const projectPhotos = pgTable(
  "project_photos",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    org_id: uuid("org_id")
      .notNull()
      .references(() => orgs.id, { onDelete: "cascade" }),
    project_id: uuid("project_id")
      .notNull()
      .references(() => projects.id, { onDelete: "cascade" }),
    phase_id: uuid("phase_id").references(() => projectPhases.id, { onDelete: "set null" }),
    task_id: uuid("task_id").references(() => projectPhaseTasks.id, { onDelete: "set null" }),
    // tag: 'before' | 'during' | 'after' | 'issue' | 'inspection' | 'survey'
    tag: text("tag").notNull().default("during"),
    // Supabase Storage path
    file_path: text("file_path").notNull(),
    thumbnail_path: text("thumbnail_path"),
    caption: text("caption"),
    taken_by: uuid("taken_by").references(() => profiles.id, { onDelete: "set null" }),
    taken_at: timestamp("taken_at", { withTimezone: true }).defaultNow().notNull(),
    // Soft-archive (PROJ-91)
    archived_at: timestamp("archived_at", { withTimezone: true }),
    created_at: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    index("project_photos_project_id_idx").on(table.project_id),
    index("project_photos_phase_id_idx").on(table.phase_id),

    // RLS: all org members can view project photos
    pgPolicy("project_photos_select_policy", {
      for: "select",
      to: authenticatedRole,
      using: sql`org_id = (select auth.jwt() ->> 'org_id')::uuid`,
    }),
    // RLS: owner+office+tech can upload photos
    pgPolicy("project_photos_insert_policy", {
      for: "insert",
      to: authenticatedRole,
      withCheck: sql`
        org_id = (select auth.jwt() ->> 'org_id')::uuid
        AND (select auth.jwt() ->> 'user_role') IN ('owner', 'office', 'tech')
      `,
    }),
    pgPolicy("project_photos_update_policy", {
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
    pgPolicy("project_photos_delete_policy", {
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
// project_time_logs
// ---------------------------------------------------------------------------

export const projectTimeLogs = pgTable(
  "project_time_logs",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    org_id: uuid("org_id")
      .notNull()
      .references(() => orgs.id, { onDelete: "cascade" }),
    project_id: uuid("project_id")
      .notNull()
      .references(() => projects.id, { onDelete: "cascade" }),
    phase_id: uuid("phase_id").references(() => projectPhases.id, { onDelete: "set null" }),
    task_id: uuid("task_id").references(() => projectPhaseTasks.id, { onDelete: "set null" }),
    tech_id: uuid("tech_id")
      .notNull()
      .references(() => profiles.id, { onDelete: "cascade" }),
    // Optional reference to the parent time entry (shift) for payroll reconciliation
    time_entry_id: uuid("time_entry_id").references(() => timeEntries.id, { onDelete: "set null" }),
    start_time: timestamp("start_time", { withTimezone: true }).notNull(),
    end_time: timestamp("end_time", { withTimezone: true }),
    // For manual entry (when start/end not captured): duration in minutes
    duration_minutes: integer("duration_minutes"),
    // entry_type: 'timer' | 'manual'
    entry_type: text("entry_type").notNull().default("timer"),
    notes: text("notes"),
    created_at: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    index("project_time_logs_project_id_idx").on(table.project_id),
    index("project_time_logs_tech_id_idx").on(table.tech_id),

    // RLS: all org members can view time logs
    pgPolicy("project_time_logs_select_policy", {
      for: "select",
      to: authenticatedRole,
      using: sql`org_id = (select auth.jwt() ->> 'org_id')::uuid`,
    }),
    // RLS: owner+office+tech can log time
    pgPolicy("project_time_logs_insert_policy", {
      for: "insert",
      to: authenticatedRole,
      withCheck: sql`
        org_id = (select auth.jwt() ->> 'org_id')::uuid
        AND (select auth.jwt() ->> 'user_role') IN ('owner', 'office', 'tech')
      `,
    }),
    pgPolicy("project_time_logs_update_policy", {
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
    pgPolicy("project_time_logs_delete_policy", {
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
// project_issue_flags
// ---------------------------------------------------------------------------

export const projectIssueFlags = pgTable(
  "project_issue_flags",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    org_id: uuid("org_id")
      .notNull()
      .references(() => orgs.id, { onDelete: "cascade" }),
    project_id: uuid("project_id")
      .notNull()
      .references(() => projects.id, { onDelete: "cascade" }),
    phase_id: uuid("phase_id").references(() => projectPhases.id, { onDelete: "set null" }),
    task_id: uuid("task_id").references(() => projectPhaseTasks.id, { onDelete: "set null" }),
    flagged_by: uuid("flagged_by")
      .notNull()
      .references(() => profiles.id, { onDelete: "cascade" }),
    title: text("title").notNull(),
    description: text("description"),
    // severity: 'low' | 'medium' | 'high' | 'critical'
    severity: text("severity").notNull().default("medium"),
    // Array of Supabase Storage paths for issue photos
    photo_urls: jsonb("photo_urls").$type<string[]>(),
    // status: 'open' | 'acknowledged' | 'resolved' | 'converted_to_co'
    status: text("status").notNull().default("open"),
    // Set when this issue flag is converted into a change order
    change_order_id: uuid("change_order_id").references(() => projectChangeOrders.id, {
      onDelete: "set null",
    }),
    // Optional link to system alert created for this flag
    alert_id: uuid("alert_id").references(() => alerts.id, { onDelete: "set null" }),
    created_at: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    updated_at: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    index("project_issue_flags_project_id_idx").on(table.project_id),
    index("project_issue_flags_org_id_idx").on(table.org_id),

    // RLS: all org members can view issue flags
    pgPolicy("project_issue_flags_select_policy", {
      for: "select",
      to: authenticatedRole,
      using: sql`org_id = (select auth.jwt() ->> 'org_id')::uuid`,
    }),
    // RLS: owner+office+tech can flag issues
    pgPolicy("project_issue_flags_insert_policy", {
      for: "insert",
      to: authenticatedRole,
      withCheck: sql`
        org_id = (select auth.jwt() ->> 'org_id')::uuid
        AND (select auth.jwt() ->> 'user_role') IN ('owner', 'office', 'tech')
      `,
    }),
    pgPolicy("project_issue_flags_update_policy", {
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
    pgPolicy("project_issue_flags_delete_policy", {
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
// project_equipment_assignments
// ---------------------------------------------------------------------------

export const projectEquipmentAssignments = pgTable(
  "project_equipment_assignments",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    org_id: uuid("org_id")
      .notNull()
      .references(() => orgs.id, { onDelete: "cascade" }),
    project_id: uuid("project_id")
      .notNull()
      .references(() => projects.id, { onDelete: "cascade" }),
    // Free-text description of the equipment (owned or rented)
    equipment_description: text("equipment_description").notNull(),
    // YYYY-MM-DD dates
    assigned_date: text("assigned_date").notNull(),
    returned_date: text("returned_date"),
    assigned_by: uuid("assigned_by").references(() => profiles.id, { onDelete: "set null" }),
    notes: text("notes"),
    created_at: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    index("project_equipment_assignments_project_id_idx").on(table.project_id),

    pgPolicy("project_equipment_assignments_select_policy", {
      for: "select",
      to: authenticatedRole,
      using: sql`org_id = (select auth.jwt() ->> 'org_id')::uuid`,
    }),
    pgPolicy("project_equipment_assignments_insert_policy", {
      for: "insert",
      to: authenticatedRole,
      withCheck: sql`
        org_id = (select auth.jwt() ->> 'org_id')::uuid
        AND (select auth.jwt() ->> 'user_role') IN ('owner', 'office')
      `,
    }),
    pgPolicy("project_equipment_assignments_update_policy", {
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
    pgPolicy("project_equipment_assignments_delete_policy", {
      for: "delete",
      to: authenticatedRole,
      using: sql`
        org_id = (select auth.jwt() ->> 'org_id')::uuid
        AND (select auth.jwt() ->> 'user_role') IN ('owner', 'office')
      `,
    }),
  ]
).enableRLS()
