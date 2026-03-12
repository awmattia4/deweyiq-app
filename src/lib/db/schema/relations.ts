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
import { routeDays } from "./route-days"
import { checklistTemplates, checklistTasks } from "./checklists"
import { visitPhotos } from "./visit-photos"
import { chemicalProducts } from "./chemical-products"
import { routeStops } from "./route-stops"
import { scheduleRules } from "./schedule-rules"
import { holidays } from "./holidays"
import { alerts } from "./alerts"
import { orgSettings } from "./org-settings"
import { workOrders, workOrderLineItems } from "./work-orders"
import { quotes } from "./quotes"
import { invoices, invoiceLineItems } from "./invoices"
import { paymentRecords } from "./payments"
import { dunningConfig } from "./dunning"
import { expenses } from "./expenses"

// orgs has many customers, profiles (already in profiles.ts via FK, no existing relation)
export const customersRelations = relations(customers, ({ one, many }) => ({
  org: one(orgs, { fields: [customers.org_id], references: [orgs.id] }),
  assignedTech: one(profiles, {
    fields: [customers.assigned_tech_id],
    references: [profiles.id],
  }),
  pools: many(pools),
  serviceVisits: many(serviceVisits),
  checklistTasks: many(checklistTasks),
  routeStops: many(routeStops),
  scheduleRules: many(scheduleRules),
  // Phase 6
  workOrders: many(workOrders),
  invoices: many(invoices),
}))

export const poolsRelations = relations(pools, ({ one, many }) => ({
  org: one(orgs, { fields: [pools.org_id], references: [orgs.id] }),
  customer: one(customers, { fields: [pools.customer_id], references: [customers.id] }),
  equipment: many(equipment),
  serviceVisits: many(serviceVisits),
  routeStops: many(routeStops),
  scheduleRules: many(scheduleRules),
}))

export const equipmentRelations = relations(equipment, ({ one }) => ({
  org: one(orgs, { fields: [equipment.org_id], references: [orgs.id] }),
  pool: one(pools, { fields: [equipment.pool_id], references: [pools.id] }),
}))

export const serviceVisitsRelations = relations(serviceVisits, ({ one, many }) => ({
  org: one(orgs, { fields: [serviceVisits.org_id], references: [orgs.id] }),
  customer: one(customers, { fields: [serviceVisits.customer_id], references: [customers.id] }),
  pool: one(pools, { fields: [serviceVisits.pool_id], references: [pools.id] }),
  tech: one(profiles, { fields: [serviceVisits.tech_id], references: [profiles.id] }),
  // Phase 3: visit photos stored separately for storage path tracking
  photos: many(visitPhotos),
}))

// Phase 3 relations

export const routeDaysRelations = relations(routeDays, ({ one }) => ({
  org: one(orgs, { fields: [routeDays.org_id], references: [orgs.id] }),
  tech: one(profiles, { fields: [routeDays.tech_id], references: [profiles.id] }),
}))

export const checklistTemplatesRelations = relations(checklistTemplates, ({ one, many }) => ({
  org: one(orgs, { fields: [checklistTemplates.org_id], references: [orgs.id] }),
  tasks: many(checklistTasks),
}))

export const checklistTasksRelations = relations(checklistTasks, ({ one }) => ({
  org: one(orgs, { fields: [checklistTasks.org_id], references: [orgs.id] }),
  template: one(checklistTemplates, {
    fields: [checklistTasks.template_id],
    references: [checklistTemplates.id],
  }),
  customer: one(customers, {
    fields: [checklistTasks.customer_id],
    references: [customers.id],
  }),
}))

export const visitPhotosRelations = relations(visitPhotos, ({ one }) => ({
  org: one(orgs, { fields: [visitPhotos.org_id], references: [orgs.id] }),
  visit: one(serviceVisits, { fields: [visitPhotos.visit_id], references: [serviceVisits.id] }),
}))

export const chemicalProductsRelations = relations(chemicalProducts, ({ one }) => ({
  org: one(orgs, { fields: [chemicalProducts.org_id], references: [orgs.id] }),
}))

// Phase 4 relations

export const routeStopsRelations = relations(routeStops, ({ one }) => ({
  org: one(orgs, { fields: [routeStops.org_id], references: [orgs.id] }),
  tech: one(profiles, { fields: [routeStops.tech_id], references: [profiles.id] }),
  customer: one(customers, { fields: [routeStops.customer_id], references: [customers.id] }),
  pool: one(pools, { fields: [routeStops.pool_id], references: [pools.id] }),
  scheduleRule: one(scheduleRules, {
    fields: [routeStops.schedule_rule_id],
    references: [scheduleRules.id],
  }),
}))

export const scheduleRulesRelations = relations(scheduleRules, ({ one, many }) => ({
  org: one(orgs, { fields: [scheduleRules.org_id], references: [orgs.id] }),
  customer: one(customers, { fields: [scheduleRules.customer_id], references: [customers.id] }),
  pool: one(pools, { fields: [scheduleRules.pool_id], references: [pools.id] }),
  tech: one(profiles, { fields: [scheduleRules.tech_id], references: [profiles.id] }),
  routeStops: many(routeStops),
}))

export const holidaysRelations = relations(holidays, ({ one }) => ({
  org: one(orgs, { fields: [holidays.org_id], references: [orgs.id] }),
}))

// Phase 5 relations

export const alertsRelations = relations(alerts, ({ one }) => ({
  org: one(orgs, { fields: [alerts.org_id], references: [orgs.id] }),
}))

export const orgSettingsRelations = relations(orgSettings, ({ one }) => ({
  org: one(orgs, { fields: [orgSettings.org_id], references: [orgs.id] }),
}))

// Phase 6 relations

export const workOrdersRelations = relations(workOrders, ({ one, many }) => ({
  org: one(orgs, { fields: [workOrders.org_id], references: [orgs.id] }),
  customer: one(customers, { fields: [workOrders.customer_id], references: [customers.id] }),
  pool: one(pools, { fields: [workOrders.pool_id], references: [pools.id] }),
  createdBy: one(profiles, {
    fields: [workOrders.created_by_id],
    references: [profiles.id],
    relationName: "workOrder_createdBy",
  }),
  assignedTech: one(profiles, {
    fields: [workOrders.assigned_tech_id],
    references: [profiles.id],
    relationName: "workOrder_assignedTech",
  }),
  flaggedByTech: one(profiles, {
    fields: [workOrders.flagged_by_tech_id],
    references: [profiles.id],
    relationName: "workOrder_flaggedByTech",
  }),
  cancelledBy: one(profiles, {
    fields: [workOrders.cancelled_by_id],
    references: [profiles.id],
    relationName: "workOrder_cancelledBy",
  }),
  lineItems: many(workOrderLineItems),
  quotes: many(quotes),
}))

export const workOrderLineItemsRelations = relations(workOrderLineItems, ({ one }) => ({
  org: one(orgs, { fields: [workOrderLineItems.org_id], references: [orgs.id] }),
  workOrder: one(workOrders, {
    fields: [workOrderLineItems.work_order_id],
    references: [workOrders.id],
  }),
}))

export const quotesRelations = relations(quotes, ({ one }) => ({
  org: one(orgs, { fields: [quotes.org_id], references: [orgs.id] }),
  workOrder: one(workOrders, {
    fields: [quotes.work_order_id],
    references: [workOrders.id],
  }),
}))

export const invoicesRelations = relations(invoices, ({ one, many }) => ({
  org: one(orgs, { fields: [invoices.org_id], references: [orgs.id] }),
  customer: one(customers, { fields: [invoices.customer_id], references: [customers.id] }),
  lineItems: many(invoiceLineItems),
  // Phase 7
  payments: many(paymentRecords),
}))

export const invoiceLineItemsRelations = relations(invoiceLineItems, ({ one }) => ({
  org: one(orgs, { fields: [invoiceLineItems.org_id], references: [orgs.id] }),
  invoice: one(invoices, {
    fields: [invoiceLineItems.invoice_id],
    references: [invoices.id],
  }),
  // Phase 7: link to service visit for per-stop line items
  visit: one(serviceVisits, {
    fields: [invoiceLineItems.visit_id],
    references: [serviceVisits.id],
  }),
}))

// Phase 7 relations

export const paymentRecordsRelations = relations(paymentRecords, ({ one }) => ({
  org: one(orgs, { fields: [paymentRecords.org_id], references: [orgs.id] }),
  invoice: one(invoices, {
    fields: [paymentRecords.invoice_id],
    references: [invoices.id],
  }),
}))

export const dunningConfigRelations = relations(dunningConfig, ({ one }) => ({
  org: one(orgs, { fields: [dunningConfig.org_id], references: [orgs.id] }),
}))

export const expensesRelations = relations(expenses, ({ one }) => ({
  org: one(orgs, { fields: [expenses.org_id], references: [orgs.id] }),
  createdBy: one(profiles, {
    fields: [expenses.created_by],
    references: [profiles.id],
  }),
}))
