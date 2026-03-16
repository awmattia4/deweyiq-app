// Schema barrel export — all domain schemas are exported from here.
// Drizzle Kit reads this file as the schema source (see drizzle.config.ts).
// Phase 01: orgs and profiles (core multi-tenant tables)
// Phase 02: customers, pools, equipment, service_visits (CRM data model)
// Phase 03: route_days, checklist_templates, checklist_tasks, visit_photos, chemical_products

export * from "./orgs"
export * from "./profiles"

// Phase 02 tables and enums
export * from "./customers"
export * from "./pools"
export * from "./equipment"
export * from "./service-visits"

// Phase 03 tables
export * from "./route-days"
export * from "./checklists"
export * from "./visit-photos"
export * from "./chemical-products"

// Phase 04 tables
export * from "./route-stops"
export * from "./schedule-rules"
export * from "./holidays"

// Phase 05 tables
export * from "./alerts"
export * from "./org-settings"

// Phase 06 tables
export * from "./work-orders"
export * from "./parts-catalog"
export * from "./quotes"
export * from "./invoices"

// Phase 07 tables
export * from "./payments"
export * from "./dunning"
export * from "./expenses"
export * from "./notification-templates"

// Phase 08 tables
export * from "./portal-messages"
export * from "./service-requests"

// Phase 10 tables
export * from "./equipment-readings"
export * from "./user-notifications"
export * from "./push-subscriptions"
export * from "./notification-prefs"
export * from "./weather-proposals"

// Phase 02-03 relational definitions (all cross-table relations in one place)
// CRITICAL: relations must be exported here for db.query.* relational queries to work.
// If xyzRelations is not exported, Drizzle's relational query builder silently fails.
export * from "./relations"
