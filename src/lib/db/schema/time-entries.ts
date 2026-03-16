import { boolean, doublePrecision, index, integer, pgTable, text, timestamp, uuid } from "drizzle-orm/pg-core"
import { pgPolicy } from "drizzle-orm/pg-core"
import { authenticatedRole } from "drizzle-orm/supabase"
import { sql } from "drizzle-orm"
import { orgs } from "./orgs"
import { profiles } from "./profiles"
import { routeStops } from "./route-stops"

/**
 * Time entries — shift-level clock-in/out records for field technicians.
 *
 * Each row represents one work shift. A tech clocks in (creates a row with status='active'),
 * may go on break (status='on_break', break_events created), and clocks out (status='complete').
 *
 * GPS coordinates at clock-in/out are captured for geofence verification.
 * total_minutes and break_minutes are computed at clock-out for fast reporting.
 *
 * qbo_time_activity_id is populated when the entry is pushed to QuickBooks Online
 * via the time push integration (Phase 11).
 *
 * RLS:
 * - SELECT/INSERT/UPDATE/DELETE: tech can access own entries only; owner/office can access all in org
 */
export const timeEntries = pgTable(
  "time_entries",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    org_id: uuid("org_id")
      .notNull()
      .references(() => orgs.id, { onDelete: "cascade" }),
    tech_id: uuid("tech_id")
      .notNull()
      .references(() => profiles.id, { onDelete: "cascade" }),
    // YYYY-MM-DD local date string — avoids UTC timezone shift issues
    work_date: text("work_date").notNull(),
    // 'active' | 'on_break' | 'complete'
    status: text("status").notNull().default("active"),
    clocked_in_at: timestamp("clocked_in_at", { withTimezone: true }).notNull(),
    clocked_out_at: timestamp("clocked_out_at", { withTimezone: true }),
    // GPS coordinates at clock-in
    clock_in_lat: doublePrecision("clock_in_lat"),
    clock_in_lng: doublePrecision("clock_in_lng"),
    // GPS coordinates at clock-out
    clock_out_lat: doublePrecision("clock_out_lat"),
    clock_out_lng: doublePrecision("clock_out_lng"),
    // Computed at clock-out: gross shift minutes (clocked_in to clocked_out)
    total_minutes: integer("total_minutes"),
    // Sum of all break_events durations for this entry
    break_minutes: integer("break_minutes").default(0),
    // Notes the tech can add to a shift (e.g. "Traffic on 95 delayed start")
    notes: text("notes"),
    // QBO integration — populated when pushed to QuickBooks Online
    qbo_time_activity_id: text("qbo_time_activity_id"),
    qbo_synced_at: timestamp("qbo_synced_at", { withTimezone: true }),
    created_at: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    updated_at: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    // Fast "all entries for a tech" query
    index("time_entries_tech_id_idx").on(table.tech_id),
    // Fast "all entries for an org by date" query (payroll/reporting)
    index("time_entries_org_date_idx").on(table.org_id, table.work_date),
    // Fast "tech's entries by date" query (most common — tech views own timesheet)
    index("time_entries_tech_date_idx").on(table.tech_id, table.work_date),

    // RLS: tech reads/writes own entries; owner/office reads/writes all in org
    pgPolicy("time_entries_select_policy", {
      for: "select",
      to: authenticatedRole,
      using: sql`
        org_id = (select auth.jwt() ->> 'org_id')::uuid
        AND (
          tech_id = auth.uid()
          OR (select auth.jwt() ->> 'user_role') IN ('owner', 'office')
        )
      `,
    }),
    pgPolicy("time_entries_insert_policy", {
      for: "insert",
      to: authenticatedRole,
      withCheck: sql`
        org_id = (select auth.jwt() ->> 'org_id')::uuid
        AND (
          tech_id = auth.uid()
          OR (select auth.jwt() ->> 'user_role') IN ('owner', 'office')
        )
      `,
    }),
    pgPolicy("time_entries_update_policy", {
      for: "update",
      to: authenticatedRole,
      using: sql`
        org_id = (select auth.jwt() ->> 'org_id')::uuid
        AND (
          tech_id = auth.uid()
          OR (select auth.jwt() ->> 'user_role') IN ('owner', 'office')
        )
      `,
      withCheck: sql`
        org_id = (select auth.jwt() ->> 'org_id')::uuid
        AND (
          tech_id = auth.uid()
          OR (select auth.jwt() ->> 'user_role') IN ('owner', 'office')
        )
      `,
    }),
    pgPolicy("time_entries_delete_policy", {
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
 * Break events — individual break records linked to a time entry.
 *
 * A tech can take multiple breaks per shift. Each break is started and ended
 * separately. is_auto_detected is set when the system detects the tech has
 * been stationary for break_auto_detect_minutes (org_settings setting).
 *
 * RLS: same pattern as time_entries (tech reads own, owner/office reads all).
 */
export const breakEvents = pgTable(
  "break_events",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    org_id: uuid("org_id")
      .notNull()
      .references(() => orgs.id, { onDelete: "cascade" }),
    time_entry_id: uuid("time_entry_id")
      .notNull()
      .references(() => timeEntries.id, { onDelete: "cascade" }),
    started_at: timestamp("started_at", { withTimezone: true }).notNull(),
    ended_at: timestamp("ended_at", { withTimezone: true }),
    // True when system auto-detected break (tech was stationary too long)
    is_auto_detected: boolean("is_auto_detected").notNull().default(false),
    created_at: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    index("break_events_time_entry_idx").on(table.time_entry_id),

    pgPolicy("break_events_select_policy", {
      for: "select",
      to: authenticatedRole,
      using: sql`
        org_id = (select auth.jwt() ->> 'org_id')::uuid
        AND (
          (select tech_id FROM time_entries WHERE id = time_entry_id) = auth.uid()
          OR (select auth.jwt() ->> 'user_role') IN ('owner', 'office')
        )
      `,
    }),
    pgPolicy("break_events_insert_policy", {
      for: "insert",
      to: authenticatedRole,
      withCheck: sql`
        org_id = (select auth.jwt() ->> 'org_id')::uuid
        AND (
          (select tech_id FROM time_entries WHERE id = time_entry_id) = auth.uid()
          OR (select auth.jwt() ->> 'user_role') IN ('owner', 'office')
        )
      `,
    }),
    pgPolicy("break_events_update_policy", {
      for: "update",
      to: authenticatedRole,
      using: sql`
        org_id = (select auth.jwt() ->> 'org_id')::uuid
        AND (
          (select tech_id FROM time_entries WHERE id = time_entry_id) = auth.uid()
          OR (select auth.jwt() ->> 'user_role') IN ('owner', 'office')
        )
      `,
      withCheck: sql`
        org_id = (select auth.jwt() ->> 'org_id')::uuid
        AND (
          (select tech_id FROM time_entries WHERE id = time_entry_id) = auth.uid()
          OR (select auth.jwt() ->> 'user_role') IN ('owner', 'office')
        )
      `,
    }),
    pgPolicy("break_events_delete_policy", {
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
 * Time entry stops — per-stop timing within a shift.
 *
 * When a tech arrives at a stop and departs, these timestamps are recorded here.
 * onsite_minutes is computed at departure. drive_minutes_to_stop is the drive time
 * from the previous stop (computed from GPS track or ORS directions).
 *
 * Enables detailed per-stop productivity reporting (longest stops, avg drive time, etc).
 *
 * RLS: same pattern as time_entries.
 */
export const timeEntryStops = pgTable(
  "time_entry_stops",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    org_id: uuid("org_id")
      .notNull()
      .references(() => orgs.id, { onDelete: "cascade" }),
    time_entry_id: uuid("time_entry_id")
      .notNull()
      .references(() => timeEntries.id, { onDelete: "cascade" }),
    route_stop_id: uuid("route_stop_id")
      .notNull()
      .references(() => routeStops.id, { onDelete: "cascade" }),
    arrived_at: timestamp("arrived_at", { withTimezone: true }),
    departed_at: timestamp("departed_at", { withTimezone: true }),
    // Computed at departure: departed_at - arrived_at in minutes
    onsite_minutes: integer("onsite_minutes"),
    // Drive time from previous stop (null for first stop of day)
    drive_minutes_to_stop: integer("drive_minutes_to_stop"),
    created_at: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    index("time_entry_stops_entry_idx").on(table.time_entry_id),
    index("time_entry_stops_stop_idx").on(table.route_stop_id),

    pgPolicy("time_entry_stops_select_policy", {
      for: "select",
      to: authenticatedRole,
      using: sql`
        org_id = (select auth.jwt() ->> 'org_id')::uuid
        AND (
          (select tech_id FROM time_entries WHERE id = time_entry_id) = auth.uid()
          OR (select auth.jwt() ->> 'user_role') IN ('owner', 'office')
        )
      `,
    }),
    pgPolicy("time_entry_stops_insert_policy", {
      for: "insert",
      to: authenticatedRole,
      withCheck: sql`
        org_id = (select auth.jwt() ->> 'org_id')::uuid
        AND (
          (select tech_id FROM time_entries WHERE id = time_entry_id) = auth.uid()
          OR (select auth.jwt() ->> 'user_role') IN ('owner', 'office')
        )
      `,
    }),
    pgPolicy("time_entry_stops_update_policy", {
      for: "update",
      to: authenticatedRole,
      using: sql`
        org_id = (select auth.jwt() ->> 'org_id')::uuid
        AND (
          (select tech_id FROM time_entries WHERE id = time_entry_id) = auth.uid()
          OR (select auth.jwt() ->> 'user_role') IN ('owner', 'office')
        )
      `,
      withCheck: sql`
        org_id = (select auth.jwt() ->> 'org_id')::uuid
        AND (
          (select tech_id FROM time_entries WHERE id = time_entry_id) = auth.uid()
          OR (select auth.jwt() ->> 'user_role') IN ('owner', 'office')
        )
      `,
    }),
    pgPolicy("time_entry_stops_delete_policy", {
      for: "delete",
      to: authenticatedRole,
      using: sql`
        org_id = (select auth.jwt() ->> 'org_id')::uuid
        AND (select auth.jwt() ->> 'user_role') IN ('owner', 'office')
      `,
    }),
  ]
).enableRLS()
