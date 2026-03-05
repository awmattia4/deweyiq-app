// Schema barrel export — all domain schemas are exported from here.
// Drizzle Kit reads this file as the schema source (see drizzle.config.ts).
// Phase 01: orgs and profiles (core multi-tenant tables)
// Phase 02: customers, pools, equipment, service_visits (CRM data model)

export * from "./orgs"
export * from "./profiles"

// Phase 02 tables and enums
export * from "./customers"
export * from "./pools"
export * from "./equipment"
export * from "./service-visits"

// Phase 02 relational definitions (all cross-table relations in one place)
// CRITICAL: relations must be exported here for db.query.* relational queries to work.
// If xyzRelations is not exported, Drizzle's relational query builder silently fails.
export * from "./relations"
