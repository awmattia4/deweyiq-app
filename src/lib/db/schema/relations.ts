/**
 * Drizzle v1 relational definitions — all cross-table relations in one file.
 *
 * Keeping relations separate from table definitions eliminates circular import
 * issues (customers <-> pools <-> equipment chain). The schema barrel re-exports
 * all relations so Drizzle's relational query builder (db.query.*) can resolve
 * the full graph.
 *
 * Source: https://orm.drizzle.team/docs/relations
 */
import { relations } from "drizzle-orm"
import { orgs } from "./orgs"
import { profiles } from "./profiles"
import { customers } from "./customers"
import { pools } from "./pools"
import { equipment } from "./equipment"
import { serviceVisits } from "./service-visits"

// orgs has many customers, profiles (already in profiles.ts via FK, no existing relation)
export const customersRelations = relations(customers, ({ one, many }) => ({
  org: one(orgs, { fields: [customers.org_id], references: [orgs.id] }),
  assignedTech: one(profiles, {
    fields: [customers.assigned_tech_id],
    references: [profiles.id],
  }),
  pools: many(pools),
  serviceVisits: many(serviceVisits),
}))

export const poolsRelations = relations(pools, ({ one, many }) => ({
  org: one(orgs, { fields: [pools.org_id], references: [orgs.id] }),
  customer: one(customers, { fields: [pools.customer_id], references: [customers.id] }),
  equipment: many(equipment),
  serviceVisits: many(serviceVisits),
}))

export const equipmentRelations = relations(equipment, ({ one }) => ({
  org: one(orgs, { fields: [equipment.org_id], references: [orgs.id] }),
  pool: one(pools, { fields: [equipment.pool_id], references: [pools.id] }),
}))

export const serviceVisitsRelations = relations(serviceVisits, ({ one }) => ({
  org: one(orgs, { fields: [serviceVisits.org_id], references: [orgs.id] }),
  customer: one(customers, { fields: [serviceVisits.customer_id], references: [customers.id] }),
  pool: one(pools, { fields: [serviceVisits.pool_id], references: [pools.id] }),
  tech: one(profiles, { fields: [serviceVisits.tech_id], references: [profiles.id] }),
}))
