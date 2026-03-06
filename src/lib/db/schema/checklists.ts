import { boolean, index, integer, pgTable, text, timestamp, uuid } from "drizzle-orm/pg-core"
import { pgPolicy } from "drizzle-orm/pg-core"
import { authenticatedRole } from "drizzle-orm/supabase"
import { sql } from "drizzle-orm"
import { orgs } from "./orgs"
import { customers } from "./customers"

/**
 * Checklist templates — office-configured task lists assigned to service types.
 *
 * A template (e.g., "Weekly Maintenance") contains multiple checklist_tasks.
 * When a tech opens a visit, the app merges:
 *   1. Template tasks for that service_type
 *   2. Customer-level task overrides (checklist_tasks with customer_id non-null)
 *
 * The `service_type` column matches service_visits.visit_type values:
 * "routine" | "opening" | "closing" | "green_pool" | null (generic/all visits)
 *
 * RLS: all org members can view; only owner+office can manage templates.
 */
export const checklistTemplates = pgTable(
  "checklist_templates",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    org_id: uuid("org_id")
      .notNull()
      .references(() => orgs.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    // Matches service_visits.visit_type: "routine" | "opening" | "closing" | "green_pool" | null
    service_type: text("service_type"),
    created_at: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    index("checklist_templates_org_id_idx").on(table.org_id),

    // RLS: all org members can view checklist templates
    pgPolicy("checklist_templates_select_policy", {
      for: "select",
      to: authenticatedRole,
      using: sql`org_id = (select auth.jwt() ->> 'org_id')::uuid`,
    }),
    // RLS: only owner+office can create templates
    pgPolicy("checklist_templates_insert_policy", {
      for: "insert",
      to: authenticatedRole,
      withCheck: sql`
        org_id = (select auth.jwt() ->> 'org_id')::uuid
        AND (select auth.jwt() ->> 'user_role') IN ('owner', 'office')
      `,
    }),
    // RLS: only owner+office can update templates
    pgPolicy("checklist_templates_update_policy", {
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
    // RLS: only owner+office can delete templates
    pgPolicy("checklist_templates_delete_policy", {
      for: "delete",
      to: authenticatedRole,
      using: sql`
        org_id = (select auth.jwt() ->> 'org_id')::uuid
        AND (select auth.jwt() ->> 'user_role') IN ('owner', 'office')
      `,
    }),
  ]
).enableRLS()

/**
 * Checklist tasks — individual items within a template or customer-level override.
 *
 * Two modes:
 *   1. template_id set, customer_id null → template-level task (inherited by all customers)
 *   2. template_id set (or null), customer_id set → customer-specific override or addition
 *
 * When customer_id is non-null and is_deleted is true, the task is suppressed for that
 * customer (soft-delete pattern for removing inherited template tasks per customer).
 *
 * The org_id column is duplicated here to allow RLS without a JOIN to checklist_templates.
 *
 * RLS: all org members can view; only owner+office can manage tasks.
 */
export const checklistTasks = pgTable(
  "checklist_tasks",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    org_id: uuid("org_id")
      .notNull()
      .references(() => orgs.id, { onDelete: "cascade" }),
    template_id: uuid("template_id").references(() => checklistTemplates.id, {
      onDelete: "cascade",
    }),
    customer_id: uuid("customer_id").references(() => customers.id, { onDelete: "cascade" }),
    label: text("label").notNull(),
    is_required: boolean("is_required").notNull().default(true),
    sort_order: integer("sort_order").notNull().default(0),
    // Soft delete: true = suppress this task for this customer (customer override removal)
    is_deleted: boolean("is_deleted").notNull().default(false),
    created_at: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    index("checklist_tasks_org_id_idx").on(table.org_id),
    index("checklist_tasks_template_id_idx").on(table.template_id),
    index("checklist_tasks_customer_id_idx").on(table.customer_id),

    // RLS: all org members can view checklist tasks
    pgPolicy("checklist_tasks_select_policy", {
      for: "select",
      to: authenticatedRole,
      using: sql`org_id = (select auth.jwt() ->> 'org_id')::uuid`,
    }),
    // RLS: only owner+office can create tasks
    pgPolicy("checklist_tasks_insert_policy", {
      for: "insert",
      to: authenticatedRole,
      withCheck: sql`
        org_id = (select auth.jwt() ->> 'org_id')::uuid
        AND (select auth.jwt() ->> 'user_role') IN ('owner', 'office')
      `,
    }),
    // RLS: only owner+office can update tasks
    pgPolicy("checklist_tasks_update_policy", {
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
    // RLS: only owner+office can delete tasks
    pgPolicy("checklist_tasks_delete_policy", {
      for: "delete",
      to: authenticatedRole,
      using: sql`
        org_id = (select auth.jwt() ->> 'org_id')::uuid
        AND (select auth.jwt() ->> 'user_role') IN ('owner', 'office')
      `,
    }),
  ]
).enableRLS()
