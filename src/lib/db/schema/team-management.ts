import { boolean, date, index, integer, numeric, pgTable, text, timestamp, uuid } from "drizzle-orm/pg-core"
import { pgPolicy } from "drizzle-orm/pg-core"
import { authenticatedRole } from "drizzle-orm/supabase"
import { sql } from "drizzle-orm"
import { orgs } from "./orgs"
import { profiles } from "./profiles"
import { timeEntries } from "./time-entries"

/**
 * PTO balances — current PTO hour balances per tech per type.
 *
 * One row per tech per pto_type. Balances accrue each pay period
 * at accrual_rate_hours (configurable per tech).
 *
 * pto_type: 'vacation' | 'sick' | 'personal'
 *
 * RLS: tech reads own balance, owner reads/writes all.
 */
export const ptoBalances = pgTable(
  "pto_balances",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    org_id: uuid("org_id")
      .notNull()
      .references(() => orgs.id, { onDelete: "cascade" }),
    tech_id: uuid("tech_id")
      .notNull()
      .references(() => profiles.id, { onDelete: "cascade" }),
    // 'vacation' | 'sick' | 'personal'
    pto_type: text("pto_type").notNull(),
    // Current available balance in hours
    balance_hours: numeric("balance_hours", { precision: 8, scale: 2 }).notNull().default("0"),
    // Hours accrued per pay period
    accrual_rate_hours: numeric("accrual_rate_hours", { precision: 8, scale: 2 }).notNull().default("0"),
    last_accrual_at: timestamp("last_accrual_at", { withTimezone: true }),
    created_at: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    updated_at: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    index("pto_balances_tech_idx").on(table.tech_id),
    index("pto_balances_org_idx").on(table.org_id),

    pgPolicy("pto_balances_select_policy", {
      for: "select",
      to: authenticatedRole,
      using: sql`
        org_id = (select auth.jwt() ->> 'org_id')::uuid
        AND (
          tech_id = auth.uid()
          OR (select auth.jwt() ->> 'user_role') = 'owner'
        )
      `,
    }),
    pgPolicy("pto_balances_insert_policy", {
      for: "insert",
      to: authenticatedRole,
      withCheck: sql`
        org_id = (select auth.jwt() ->> 'org_id')::uuid
        AND (select auth.jwt() ->> 'user_role') = 'owner'
      `,
    }),
    pgPolicy("pto_balances_update_policy", {
      for: "update",
      to: authenticatedRole,
      using: sql`
        org_id = (select auth.jwt() ->> 'org_id')::uuid
        AND (select auth.jwt() ->> 'user_role') = 'owner'
      `,
      withCheck: sql`
        org_id = (select auth.jwt() ->> 'org_id')::uuid
        AND (select auth.jwt() ->> 'user_role') = 'owner'
      `,
    }),
    pgPolicy("pto_balances_delete_policy", {
      for: "delete",
      to: authenticatedRole,
      using: sql`
        org_id = (select auth.jwt() ->> 'org_id')::uuid
        AND (select auth.jwt() ->> 'user_role') = 'owner'
      `,
    }),
  ]
).enableRLS()

/**
 * PTO requests — tech-submitted time-off requests.
 *
 * Tech submits a request (status='pending'). Owner approves or denies it,
 * setting reviewed_by and reviewed_at. Approved requests deduct from pto_balances.
 *
 * RLS: tech reads/creates own requests, owner reads/updates all.
 */
export const ptoRequests = pgTable(
  "pto_requests",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    org_id: uuid("org_id")
      .notNull()
      .references(() => orgs.id, { onDelete: "cascade" }),
    tech_id: uuid("tech_id")
      .notNull()
      .references(() => profiles.id, { onDelete: "cascade" }),
    // 'vacation' | 'sick' | 'personal'
    pto_type: text("pto_type").notNull(),
    // YYYY-MM-DD strings
    start_date: text("start_date").notNull(),
    end_date: text("end_date").notNull(),
    // Total hours requested
    hours: numeric("hours", { precision: 8, scale: 2 }).notNull(),
    // 'pending' | 'approved' | 'denied'
    status: text("status").notNull().default("pending"),
    notes: text("notes"),
    reviewed_by: uuid("reviewed_by").references(() => profiles.id, { onDelete: "set null" }),
    reviewed_at: timestamp("reviewed_at", { withTimezone: true }),
    created_at: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    updated_at: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    index("pto_requests_tech_idx").on(table.tech_id),
    index("pto_requests_org_status_idx").on(table.org_id, table.status),

    pgPolicy("pto_requests_select_policy", {
      for: "select",
      to: authenticatedRole,
      using: sql`
        org_id = (select auth.jwt() ->> 'org_id')::uuid
        AND (
          tech_id = auth.uid()
          OR (select auth.jwt() ->> 'user_role') = 'owner'
        )
      `,
    }),
    pgPolicy("pto_requests_insert_policy", {
      for: "insert",
      to: authenticatedRole,
      withCheck: sql`
        org_id = (select auth.jwt() ->> 'org_id')::uuid
        AND (
          tech_id = auth.uid()
          OR (select auth.jwt() ->> 'user_role') = 'owner'
        )
      `,
    }),
    pgPolicy("pto_requests_update_policy", {
      for: "update",
      to: authenticatedRole,
      using: sql`
        org_id = (select auth.jwt() ->> 'org_id')::uuid
        AND (select auth.jwt() ->> 'user_role') = 'owner'
      `,
      withCheck: sql`
        org_id = (select auth.jwt() ->> 'org_id')::uuid
        AND (select auth.jwt() ->> 'user_role') = 'owner'
      `,
    }),
    pgPolicy("pto_requests_delete_policy", {
      for: "delete",
      to: authenticatedRole,
      using: sql`
        org_id = (select auth.jwt() ->> 'org_id')::uuid
        AND (select auth.jwt() ->> 'user_role') = 'owner'
      `,
    }),
  ]
).enableRLS()

/**
 * Employee availability — recurring weekly availability windows.
 *
 * One row per tech per day of week. Used by the scheduler to know when
 * a tech is available for assignment.
 *
 * day_of_week: 0=Sunday, 1=Monday, ..., 6=Saturday
 * start_time / end_time: HH:MM strings in the org's local timezone
 *
 * RLS: tech reads own, owner reads/writes all.
 */
export const employeeAvailability = pgTable(
  "employee_availability",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    org_id: uuid("org_id")
      .notNull()
      .references(() => orgs.id, { onDelete: "cascade" }),
    tech_id: uuid("tech_id")
      .notNull()
      .references(() => profiles.id, { onDelete: "cascade" }),
    // 0 = Sunday, 1 = Monday, ..., 6 = Saturday
    day_of_week: integer("day_of_week").notNull(),
    // HH:MM format in org's local timezone
    start_time: text("start_time").notNull(),
    end_time: text("end_time").notNull(),
    created_at: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    updated_at: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    index("employee_availability_tech_idx").on(table.tech_id),

    pgPolicy("employee_availability_select_policy", {
      for: "select",
      to: authenticatedRole,
      using: sql`
        org_id = (select auth.jwt() ->> 'org_id')::uuid
        AND (
          tech_id = auth.uid()
          OR (select auth.jwt() ->> 'user_role') = 'owner'
        )
      `,
    }),
    pgPolicy("employee_availability_insert_policy", {
      for: "insert",
      to: authenticatedRole,
      withCheck: sql`
        org_id = (select auth.jwt() ->> 'org_id')::uuid
        AND (select auth.jwt() ->> 'user_role') = 'owner'
      `,
    }),
    pgPolicy("employee_availability_update_policy", {
      for: "update",
      to: authenticatedRole,
      using: sql`
        org_id = (select auth.jwt() ->> 'org_id')::uuid
        AND (select auth.jwt() ->> 'user_role') = 'owner'
      `,
      withCheck: sql`
        org_id = (select auth.jwt() ->> 'org_id')::uuid
        AND (select auth.jwt() ->> 'user_role') = 'owner'
      `,
    }),
    pgPolicy("employee_availability_delete_policy", {
      for: "delete",
      to: authenticatedRole,
      using: sql`
        org_id = (select auth.jwt() ->> 'org_id')::uuid
        AND (select auth.jwt() ->> 'user_role') = 'owner'
      `,
    }),
  ]
).enableRLS()

/**
 * Employee blocked dates — specific dates when a tech is unavailable.
 *
 * One row per tech per blocked date. Reason is optional (e.g. "Doctor appointment").
 * The scheduler excludes techs with blocked dates from auto-assignment.
 *
 * RLS: tech reads own, owner reads/writes all.
 */
export const employeeBlockedDates = pgTable(
  "employee_blocked_dates",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    org_id: uuid("org_id")
      .notNull()
      .references(() => orgs.id, { onDelete: "cascade" }),
    tech_id: uuid("tech_id")
      .notNull()
      .references(() => profiles.id, { onDelete: "cascade" }),
    blocked_date: date("blocked_date").notNull(),
    reason: text("reason"),
    created_at: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    index("employee_blocked_dates_tech_idx").on(table.tech_id),
    index("employee_blocked_dates_date_idx").on(table.org_id, table.blocked_date),

    pgPolicy("employee_blocked_dates_select_policy", {
      for: "select",
      to: authenticatedRole,
      using: sql`
        org_id = (select auth.jwt() ->> 'org_id')::uuid
        AND (
          tech_id = auth.uid()
          OR (select auth.jwt() ->> 'user_role') = 'owner'
        )
      `,
    }),
    pgPolicy("employee_blocked_dates_insert_policy", {
      for: "insert",
      to: authenticatedRole,
      withCheck: sql`
        org_id = (select auth.jwt() ->> 'org_id')::uuid
        AND (select auth.jwt() ->> 'user_role') = 'owner'
      `,
    }),
    pgPolicy("employee_blocked_dates_update_policy", {
      for: "update",
      to: authenticatedRole,
      using: sql`
        org_id = (select auth.jwt() ->> 'org_id')::uuid
        AND (select auth.jwt() ->> 'user_role') = 'owner'
      `,
      withCheck: sql`
        org_id = (select auth.jwt() ->> 'org_id')::uuid
        AND (select auth.jwt() ->> 'user_role') = 'owner'
      `,
    }),
    pgPolicy("employee_blocked_dates_delete_policy", {
      for: "delete",
      to: authenticatedRole,
      using: sql`
        org_id = (select auth.jwt() ->> 'org_id')::uuid
        AND (select auth.jwt() ->> 'user_role') = 'owner'
      `,
    }),
  ]
).enableRLS()

/**
 * Employee documents — certifications, licenses, and other documents.
 *
 * Tracks CPO certification, driver's licenses, insurance cards, etc.
 * file_url is a Supabase Storage path (not a full URL — constructed at render time).
 * expires_at enables expiration tracking and alerts.
 *
 * doc_type: 'cpo' | 'drivers_license' | 'insurance' | 'other'
 *
 * RLS: tech reads own, owner reads/writes all.
 */
export const employeeDocuments = pgTable(
  "employee_documents",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    org_id: uuid("org_id")
      .notNull()
      .references(() => orgs.id, { onDelete: "cascade" }),
    tech_id: uuid("tech_id")
      .notNull()
      .references(() => profiles.id, { onDelete: "cascade" }),
    // 'cpo' | 'drivers_license' | 'insurance' | 'other'
    doc_type: text("doc_type").notNull(),
    doc_name: text("doc_name").notNull(),
    // Supabase Storage path (server constructs signed URL on demand)
    file_url: text("file_url"),
    expires_at: date("expires_at"),
    notes: text("notes"),
    created_at: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    updated_at: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    index("employee_documents_tech_idx").on(table.tech_id),
    // Fast lookup for expiring documents (org-wide compliance check)
    index("employee_documents_org_expires_idx").on(table.org_id, table.expires_at),

    pgPolicy("employee_documents_select_policy", {
      for: "select",
      to: authenticatedRole,
      using: sql`
        org_id = (select auth.jwt() ->> 'org_id')::uuid
        AND (
          tech_id = auth.uid()
          OR (select auth.jwt() ->> 'user_role') = 'owner'
        )
      `,
    }),
    pgPolicy("employee_documents_insert_policy", {
      for: "insert",
      to: authenticatedRole,
      withCheck: sql`
        org_id = (select auth.jwt() ->> 'org_id')::uuid
        AND (select auth.jwt() ->> 'user_role') = 'owner'
      `,
    }),
    pgPolicy("employee_documents_update_policy", {
      for: "update",
      to: authenticatedRole,
      using: sql`
        org_id = (select auth.jwt() ->> 'org_id')::uuid
        AND (select auth.jwt() ->> 'user_role') = 'owner'
      `,
      withCheck: sql`
        org_id = (select auth.jwt() ->> 'org_id')::uuid
        AND (select auth.jwt() ->> 'user_role') = 'owner'
      `,
    }),
    pgPolicy("employee_documents_delete_policy", {
      for: "delete",
      to: authenticatedRole,
      using: sql`
        org_id = (select auth.jwt() ->> 'org_id')::uuid
        AND (select auth.jwt() ->> 'user_role') = 'owner'
      `,
    }),
  ]
).enableRLS()

/**
 * Mileage logs — tracked mileage for reimbursement and tax purposes.
 *
 * Techs log business miles driven (origin, destination, purpose, miles).
 * rate_per_mile defaults to the current IRS standard mileage rate (2026: $0.725/mile).
 *
 * is_auto_calculated=true when miles were computed from GPS route data.
 * time_entry_id links this log to a shift when auto-calculated during time tracking.
 *
 * work_date: YYYY-MM-DD local date string.
 *
 * RLS: tech reads/creates own, owner reads/writes all.
 */
export const mileageLogs = pgTable(
  "mileage_logs",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    org_id: uuid("org_id")
      .notNull()
      .references(() => orgs.id, { onDelete: "cascade" }),
    tech_id: uuid("tech_id")
      .notNull()
      .references(() => profiles.id, { onDelete: "cascade" }),
    // YYYY-MM-DD local date string
    work_date: text("work_date").notNull(),
    origin_address: text("origin_address"),
    destination_address: text("destination_address"),
    // Purpose for IRS audit trail (e.g. "Pool service route")
    purpose: text("purpose"),
    miles: numeric("miles", { precision: 8, scale: 2 }).notNull(),
    // Default: 2026 IRS standard mileage rate ($0.725/mile)
    rate_per_mile: numeric("rate_per_mile", { precision: 6, scale: 4 }).notNull().default("0.7250"),
    // True when miles computed from GPS/route data (not manually entered)
    is_auto_calculated: boolean("is_auto_calculated").notNull().default(false),
    // Links to the shift this mileage was generated during (auto-calculated only)
    time_entry_id: uuid("time_entry_id").references(() => timeEntries.id, { onDelete: "set null" }),
    created_at: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    updated_at: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    index("mileage_logs_tech_date_idx").on(table.tech_id, table.work_date),
    index("mileage_logs_org_date_idx").on(table.org_id, table.work_date),

    pgPolicy("mileage_logs_select_policy", {
      for: "select",
      to: authenticatedRole,
      using: sql`
        org_id = (select auth.jwt() ->> 'org_id')::uuid
        AND (
          tech_id = auth.uid()
          OR (select auth.jwt() ->> 'user_role') = 'owner'
        )
      `,
    }),
    pgPolicy("mileage_logs_insert_policy", {
      for: "insert",
      to: authenticatedRole,
      withCheck: sql`
        org_id = (select auth.jwt() ->> 'org_id')::uuid
        AND (
          tech_id = auth.uid()
          OR (select auth.jwt() ->> 'user_role') = 'owner'
        )
      `,
    }),
    pgPolicy("mileage_logs_update_policy", {
      for: "update",
      to: authenticatedRole,
      using: sql`
        org_id = (select auth.jwt() ->> 'org_id')::uuid
        AND (select auth.jwt() ->> 'user_role') = 'owner'
      `,
      withCheck: sql`
        org_id = (select auth.jwt() ->> 'org_id')::uuid
        AND (select auth.jwt() ->> 'user_role') = 'owner'
      `,
    }),
    pgPolicy("mileage_logs_delete_policy", {
      for: "delete",
      to: authenticatedRole,
      using: sql`
        org_id = (select auth.jwt() ->> 'org_id')::uuid
        AND (select auth.jwt() ->> 'user_role') = 'owner'
      `,
    }),
  ]
).enableRLS()

/**
 * Vendors — third-party suppliers used for parts, chemicals, and services.
 *
 * Used for expense tracking (expense.vendor_id) and purchase orders.
 * is_active allows soft-deleting vendors that are no longer used.
 *
 * RLS: owner + office read/write.
 */
export const vendors = pgTable(
  "vendors",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    org_id: uuid("org_id")
      .notNull()
      .references(() => orgs.id, { onDelete: "cascade" }),
    vendor_name: text("vendor_name").notNull(),
    contact_email: text("contact_email"),
    contact_phone: text("contact_phone"),
    address: text("address"),
    notes: text("notes"),
    is_active: boolean("is_active").notNull().default(true),
    created_at: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    updated_at: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    index("vendors_org_idx").on(table.org_id),

    pgPolicy("vendors_select_policy", {
      for: "select",
      to: authenticatedRole,
      using: sql`
        org_id = (select auth.jwt() ->> 'org_id')::uuid
        AND (select auth.jwt() ->> 'user_role') IN ('owner', 'office')
      `,
    }),
    pgPolicy("vendors_insert_policy", {
      for: "insert",
      to: authenticatedRole,
      withCheck: sql`
        org_id = (select auth.jwt() ->> 'org_id')::uuid
        AND (select auth.jwt() ->> 'user_role') IN ('owner', 'office')
      `,
    }),
    pgPolicy("vendors_update_policy", {
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
    pgPolicy("vendors_delete_policy", {
      for: "delete",
      to: authenticatedRole,
      using: sql`
        org_id = (select auth.jwt() ->> 'org_id')::uuid
        AND (select auth.jwt() ->> 'user_role') IN ('owner', 'office')
      `,
    }),
  ]
).enableRLS()
