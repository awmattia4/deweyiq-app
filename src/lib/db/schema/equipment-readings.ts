import { index, jsonb, pgTable, text, timestamp, uuid } from "drizzle-orm/pg-core"
import { pgPolicy } from "drizzle-orm/pg-core"
import { authenticatedRole } from "drizzle-orm/supabase"
import { sql } from "drizzle-orm"
import { orgs } from "./orgs"
import { equipment } from "./equipment"
import { pools } from "./pools"
import { serviceVisits } from "./service-visits"
import { profiles } from "./profiles"

/**
 * Equipment readings — periodic metric captures per equipment piece (Phase 10).
 *
 * Tracks performance over time for salt chlorine generators, pumps, filters,
 * and heaters. Metrics are equipment-type-specific stored as JSONB:
 *   - salt_chlorine_generator: { salt_ppm }
 *   - pump: { flow_gpm, rpm }
 *   - filter: { psi }
 *   - heater: { delta_f }
 *
 * Health scoring (via getEquipmentHealth server action):
 * - Baseline = average of first 4 readings for a metric
 * - Current = average of last 2 readings
 * - Degraded if current < baseline * 0.70 (30% drop)
 * - Critical if current < baseline * 0.50 (50% drop)
 *
 * RLS: All org members can read and log readings (techs log, office views).
 *       Owner + office can delete readings.
 */
export const equipmentReadings = pgTable(
  "equipment_readings",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    org_id: uuid("org_id")
      .notNull()
      .references(() => orgs.id, { onDelete: "cascade" }),
    equipment_id: uuid("equipment_id")
      .notNull()
      .references(() => equipment.id, { onDelete: "cascade" }),
    pool_id: uuid("pool_id")
      .notNull()
      .references(() => pools.id, { onDelete: "cascade" }),
    // Optional link to the service visit when this reading was taken
    service_visit_id: uuid("service_visit_id").references(() => serviceVisits.id, {
      onDelete: "set null",
    }),
    recorded_at: timestamp("recorded_at", { withTimezone: true }).defaultNow().notNull(),
    // Equipment-type-specific metrics:
    // salt_chlorine_generator: { salt_ppm: number }
    // pump: { flow_gpm: number, rpm: number }
    // filter: { psi: number }
    // heater: { delta_f: number }
    metrics: jsonb("metrics").notNull(),
    recorded_by_id: uuid("recorded_by_id").references(() => profiles.id, {
      onDelete: "set null",
    }),
    notes: text("notes"),
    created_at: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    index("equipment_readings_org_id_idx").on(table.org_id),
    index("equipment_readings_equipment_id_idx").on(table.equipment_id),
    index("equipment_readings_pool_id_idx").on(table.pool_id),
    index("equipment_readings_recorded_at_idx").on(table.recorded_at),

    // RLS: all org members can read and insert equipment readings
    pgPolicy("equipment_readings_select_policy", {
      for: "select",
      to: authenticatedRole,
      using: sql`org_id = (select auth.jwt() ->> 'org_id')::uuid`,
    }),
    pgPolicy("equipment_readings_insert_policy", {
      for: "insert",
      to: authenticatedRole,
      withCheck: sql`org_id = (select auth.jwt() ->> 'org_id')::uuid`,
    }),
    // RLS: only owner + office can update/delete readings
    pgPolicy("equipment_readings_update_policy", {
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
    pgPolicy("equipment_readings_delete_policy", {
      for: "delete",
      to: authenticatedRole,
      using: sql`
        org_id = (select auth.jwt() ->> 'org_id')::uuid
        AND (select auth.jwt() ->> 'user_role') IN ('owner', 'office')
      `,
    }),
  ]
).enableRLS()
