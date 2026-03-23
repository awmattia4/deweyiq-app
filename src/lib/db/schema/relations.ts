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
import { notificationTemplates } from "./notification-templates"
import { portalMessages } from "./portal-messages"
import { serviceRequests } from "./service-requests"
import { userNotifications } from "./user-notifications"
import { pushSubscriptions } from "./push-subscriptions"
import { notificationPreferences } from "./notification-prefs"
import { weatherRescheduleProposals } from "./weather-proposals"
import { timeEntries, breakEvents, timeEntryStops } from "./time-entries"
import { chartOfAccounts, journalEntries, journalEntryLines, accountingPeriods } from "./accounting"
import { bankAccounts, bankTransactions } from "./bank-accounts"
import {
  ptoBalances,
  ptoRequests,
  employeeAvailability,
  employeeBlockedDates,
  employeeDocuments,
  mileageLogs,
  vendors,
} from "./team-management"
import { vendorBills } from "./vendor-bills"
import {
  projects,
  projectTemplates,
  projectPhases,
  projectPhaseTasks,
  projectSurveys,
} from "./projects"
import {
  projectProposals,
  projectProposalTiers,
  projectProposalLineItems,
  projectProposalAddons,
  projectPaymentMilestones,
  proposalChangeRequests,
} from "./project-proposals"
import {
  projectMaterials,
  projectPurchaseOrders,
  projectPoLineItems,
  projectMaterialReceipts,
  projectMaterialUsage,
  projectMaterialReturns,
} from "./project-materials"
import {
  projectChangeOrders,
  projectInspections,
  projectPermits,
  projectPunchList,
  projectWarrantyTerms,
  warrantyClaims,
  projectDocuments,
} from "./project-billing"
import { subcontractors, projectPhaseSubcontractors } from "./subcontractors"
import {
  projectPhotos,
  projectTimeLogs,
  projectIssueFlags,
  projectEquipmentAssignments,
} from "./project-field"
import {
  truckInventory,
  truckInventoryLog,
  truckLoadTemplates,
  truckLoadTemplateItems,
} from "./truck-inventory"
import { shoppingListItems, purchaseOrders, poLineItems } from "./shopping-lists"
import { barcodeCatalogLinks } from "./barcode-catalog"
import { partsCatalog } from "./parts-catalog"

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
  // Phase 8
  portalMessages: many(portalMessages),
  serviceRequests: many(serviceRequests),
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
  checklistTemplate: one(checklistTemplates, {
    fields: [routeStops.checklist_template_id],
    references: [checklistTemplates.id],
  }),
}))

export const scheduleRulesRelations = relations(scheduleRules, ({ one, many }) => ({
  org: one(orgs, { fields: [scheduleRules.org_id], references: [orgs.id] }),
  customer: one(customers, { fields: [scheduleRules.customer_id], references: [customers.id] }),
  pool: one(pools, { fields: [scheduleRules.pool_id], references: [pools.id] }),
  tech: one(profiles, { fields: [scheduleRules.tech_id], references: [profiles.id] }),
  checklistTemplate: one(checklistTemplates, {
    fields: [scheduleRules.checklist_template_id],
    references: [checklistTemplates.id],
  }),
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

// Phase 7-08 relations

export const notificationTemplatesRelations = relations(notificationTemplates, ({ one }) => ({
  org: one(orgs, { fields: [notificationTemplates.org_id], references: [orgs.id] }),
}))

// Phase 8 relations

export const portalMessagesRelations = relations(portalMessages, ({ one }) => ({
  org: one(orgs, { fields: [portalMessages.org_id], references: [orgs.id] }),
  customer: one(customers, { fields: [portalMessages.customer_id], references: [customers.id] }),
  serviceRequest: one(serviceRequests, {
    fields: [portalMessages.service_request_id],
    references: [serviceRequests.id],
  }),
}))

export const serviceRequestsRelations = relations(serviceRequests, ({ one, many }) => ({
  org: one(orgs, { fields: [serviceRequests.org_id], references: [orgs.id] }),
  customer: one(customers, { fields: [serviceRequests.customer_id], references: [customers.id] }),
  pool: one(pools, { fields: [serviceRequests.pool_id], references: [pools.id] }),
  portalMessages: many(portalMessages),
}))

// Phase 10 relations

export const userNotificationsRelations = relations(userNotifications, ({ one }) => ({
  org: one(orgs, { fields: [userNotifications.org_id], references: [orgs.id] }),
  recipient: one(profiles, {
    fields: [userNotifications.recipient_id],
    references: [profiles.id],
  }),
}))

export const pushSubscriptionsRelations = relations(pushSubscriptions, ({ one }) => ({
  user: one(profiles, { fields: [pushSubscriptions.user_id], references: [profiles.id] }),
}))

export const notificationPreferencesRelations = relations(notificationPreferences, ({ one }) => ({
  org: one(orgs, { fields: [notificationPreferences.org_id], references: [orgs.id] }),
  user: one(profiles, { fields: [notificationPreferences.user_id], references: [profiles.id] }),
}))

// Phase 10-06 relations

export const weatherRescheduleProposalsRelations = relations(
  weatherRescheduleProposals,
  ({ one }) => ({
    org: one(orgs, { fields: [weatherRescheduleProposals.org_id], references: [orgs.id] }),
    approvedBy: one(profiles, {
      fields: [weatherRescheduleProposals.approved_by_id],
      references: [profiles.id],
    }),
  })
)

// Phase 11 relations

export const timeEntriesRelations = relations(timeEntries, ({ one, many }) => ({
  org: one(orgs, { fields: [timeEntries.org_id], references: [orgs.id] }),
  tech: one(profiles, { fields: [timeEntries.tech_id], references: [profiles.id] }),
  breakEvents: many(breakEvents),
  timeEntryStops: many(timeEntryStops),
  mileageLogs: many(mileageLogs),
}))

export const breakEventsRelations = relations(breakEvents, ({ one }) => ({
  org: one(orgs, { fields: [breakEvents.org_id], references: [orgs.id] }),
  timeEntry: one(timeEntries, {
    fields: [breakEvents.time_entry_id],
    references: [timeEntries.id],
  }),
}))

export const timeEntryStopsRelations = relations(timeEntryStops, ({ one }) => ({
  org: one(orgs, { fields: [timeEntryStops.org_id], references: [orgs.id] }),
  timeEntry: one(timeEntries, {
    fields: [timeEntryStops.time_entry_id],
    references: [timeEntries.id],
  }),
  routeStop: one(routeStops, {
    fields: [timeEntryStops.route_stop_id],
    references: [routeStops.id],
  }),
}))

export const chartOfAccountsRelations = relations(chartOfAccounts, ({ one, many }) => ({
  org: one(orgs, { fields: [chartOfAccounts.org_id], references: [orgs.id] }),
  // Self-referencing parent account
  parent: one(chartOfAccounts, {
    fields: [chartOfAccounts.parent_id],
    references: [chartOfAccounts.id],
    relationName: "account_parent",
  }),
  children: many(chartOfAccounts, { relationName: "account_parent" }),
  journalEntryLines: many(journalEntryLines),
  bankAccounts: many(bankAccounts),
}))

export const journalEntriesRelations = relations(journalEntries, ({ one, many }) => ({
  org: one(orgs, { fields: [journalEntries.org_id], references: [orgs.id] }),
  createdBy: one(profiles, {
    fields: [journalEntries.created_by],
    references: [profiles.id],
  }),
  lines: many(journalEntryLines),
  // Self-referencing reversal
  reversalOf: one(journalEntries, {
    fields: [journalEntries.reversal_of],
    references: [journalEntries.id],
    relationName: "entry_reversal",
  }),
  reversals: many(journalEntries, { relationName: "entry_reversal" }),
  bankTransactions: many(bankTransactions),
}))

export const journalEntryLinesRelations = relations(journalEntryLines, ({ one }) => ({
  org: one(orgs, { fields: [journalEntryLines.org_id], references: [orgs.id] }),
  journalEntry: one(journalEntries, {
    fields: [journalEntryLines.journal_entry_id],
    references: [journalEntries.id],
  }),
  account: one(chartOfAccounts, {
    fields: [journalEntryLines.account_id],
    references: [chartOfAccounts.id],
  }),
}))

export const accountingPeriodsRelations = relations(accountingPeriods, ({ one }) => ({
  org: one(orgs, { fields: [accountingPeriods.org_id], references: [orgs.id] }),
  closedBy: one(profiles, {
    fields: [accountingPeriods.closed_by],
    references: [profiles.id],
  }),
}))

export const bankAccountsRelations = relations(bankAccounts, ({ one, many }) => ({
  org: one(orgs, { fields: [bankAccounts.org_id], references: [orgs.id] }),
  chartOfAccount: one(chartOfAccounts, {
    fields: [bankAccounts.chart_of_accounts_id],
    references: [chartOfAccounts.id],
  }),
  transactions: many(bankTransactions),
}))

export const bankTransactionsRelations = relations(bankTransactions, ({ one }) => ({
  org: one(orgs, { fields: [bankTransactions.org_id], references: [orgs.id] }),
  bankAccount: one(bankAccounts, {
    fields: [bankTransactions.bank_account_id],
    references: [bankAccounts.id],
  }),
  matchedEntry: one(journalEntries, {
    fields: [bankTransactions.matched_entry_id],
    references: [journalEntries.id],
  }),
}))

export const ptoBalancesRelations = relations(ptoBalances, ({ one }) => ({
  org: one(orgs, { fields: [ptoBalances.org_id], references: [orgs.id] }),
  tech: one(profiles, { fields: [ptoBalances.tech_id], references: [profiles.id] }),
}))

export const ptoRequestsRelations = relations(ptoRequests, ({ one }) => ({
  org: one(orgs, { fields: [ptoRequests.org_id], references: [orgs.id] }),
  tech: one(profiles, {
    fields: [ptoRequests.tech_id],
    references: [profiles.id],
    relationName: "ptoRequest_tech",
  }),
  reviewedBy: one(profiles, {
    fields: [ptoRequests.reviewed_by],
    references: [profiles.id],
    relationName: "ptoRequest_reviewedBy",
  }),
}))

export const employeeAvailabilityRelations = relations(employeeAvailability, ({ one }) => ({
  org: one(orgs, { fields: [employeeAvailability.org_id], references: [orgs.id] }),
  tech: one(profiles, { fields: [employeeAvailability.tech_id], references: [profiles.id] }),
}))

export const employeeBlockedDatesRelations = relations(employeeBlockedDates, ({ one }) => ({
  org: one(orgs, { fields: [employeeBlockedDates.org_id], references: [orgs.id] }),
  tech: one(profiles, { fields: [employeeBlockedDates.tech_id], references: [profiles.id] }),
}))

export const employeeDocumentsRelations = relations(employeeDocuments, ({ one }) => ({
  org: one(orgs, { fields: [employeeDocuments.org_id], references: [orgs.id] }),
  tech: one(profiles, { fields: [employeeDocuments.tech_id], references: [profiles.id] }),
}))

export const mileageLogsRelations = relations(mileageLogs, ({ one }) => ({
  org: one(orgs, { fields: [mileageLogs.org_id], references: [orgs.id] }),
  tech: one(profiles, { fields: [mileageLogs.tech_id], references: [profiles.id] }),
  timeEntry: one(timeEntries, {
    fields: [mileageLogs.time_entry_id],
    references: [timeEntries.id],
  }),
}))

export const vendorsRelations = relations(vendors, ({ one, many }) => ({
  org: one(orgs, { fields: [vendors.org_id], references: [orgs.id] }),
  bills: many(vendorBills),
}))

export const vendorBillsRelations = relations(vendorBills, ({ one }) => ({
  org: one(orgs, { fields: [vendorBills.org_id], references: [orgs.id] }),
  vendor: one(vendors, { fields: [vendorBills.vendor_id], references: [vendors.id] }),
  categoryAccount: one(chartOfAccounts, { fields: [vendorBills.category_account_id], references: [chartOfAccounts.id] }),
  paidBy: one(profiles, { fields: [vendorBills.paid_by], references: [profiles.id], relationName: "vendorBillPaidBy" }),
  createdBy: one(profiles, { fields: [vendorBills.created_by], references: [profiles.id], relationName: "vendorBillCreatedBy" }),
}))

// Phase 12 relations — Projects & Renovations

export const projectsRelations = relations(projects, ({ one, many }) => ({
  org: one(orgs, { fields: [projects.org_id], references: [orgs.id] }),
  customer: one(customers, { fields: [projects.customer_id], references: [customers.id] }),
  pool: one(pools, { fields: [projects.pool_id], references: [pools.id] }),
  phases: many(projectPhases),
  surveys: many(projectSurveys),
  proposals: many(projectProposals),
  paymentMilestones: many(projectPaymentMilestones),
  materials: many(projectMaterials),
  purchaseOrders: many(projectPurchaseOrders),
  changeOrders: many(projectChangeOrders),
  inspections: many(projectInspections),
  permits: many(projectPermits),
  punchList: many(projectPunchList),
  warrantyClaims: many(warrantyClaims),
  documents: many(projectDocuments),
  photos: many(projectPhotos),
  timeLogs: many(projectTimeLogs),
  issueFlags: many(projectIssueFlags),
  equipmentAssignments: many(projectEquipmentAssignments),
}))

export const projectTemplatesRelations = relations(projectTemplates, ({ one }) => ({
  org: one(orgs, { fields: [projectTemplates.org_id], references: [orgs.id] }),
}))

export const projectPhasesRelations = relations(projectPhases, ({ one, many }) => ({
  org: one(orgs, { fields: [projectPhases.org_id], references: [orgs.id] }),
  project: one(projects, { fields: [projectPhases.project_id], references: [projects.id] }),
  assignedTech: one(profiles, {
    fields: [projectPhases.assigned_tech_id],
    references: [profiles.id],
  }),
  tasks: many(projectPhaseTasks),
  subcontractors: many(projectPhaseSubcontractors),
  materialUsage: many(projectMaterialUsage),
  timeLogs: many(projectTimeLogs),
  photos: many(projectPhotos),
  issueFlags: many(projectIssueFlags),
}))

export const projectPhaseTasksRelations = relations(projectPhaseTasks, ({ one }) => ({
  org: one(orgs, { fields: [projectPhaseTasks.org_id], references: [orgs.id] }),
  phase: one(projectPhases, { fields: [projectPhaseTasks.phase_id], references: [projectPhases.id] }),
  completedBy: one(profiles, {
    fields: [projectPhaseTasks.completed_by],
    references: [profiles.id],
  }),
}))

export const projectSurveysRelations = relations(projectSurveys, ({ one }) => ({
  org: one(orgs, { fields: [projectSurveys.org_id], references: [orgs.id] }),
  project: one(projects, { fields: [projectSurveys.project_id], references: [projects.id] }),
  routeStop: one(routeStops, {
    fields: [projectSurveys.route_stop_id],
    references: [routeStops.id],
  }),
  surveyedBy: one(profiles, {
    fields: [projectSurveys.surveyed_by],
    references: [profiles.id],
  }),
}))

export const projectProposalsRelations = relations(projectProposals, ({ one, many }) => ({
  org: one(orgs, { fields: [projectProposals.org_id], references: [orgs.id] }),
  project: one(projects, { fields: [projectProposals.project_id], references: [projects.id] }),
  tiers: many(projectProposalTiers),
  lineItems: many(projectProposalLineItems),
  addons: many(projectProposalAddons),
  paymentMilestones: many(projectPaymentMilestones),
  changeRequests: many(proposalChangeRequests),
}))

export const projectProposalTiersRelations = relations(projectProposalTiers, ({ one, many }) => ({
  org: one(orgs, { fields: [projectProposalTiers.org_id], references: [orgs.id] }),
  proposal: one(projectProposals, {
    fields: [projectProposalTiers.proposal_id],
    references: [projectProposals.id],
  }),
  lineItems: many(projectProposalLineItems),
}))

export const projectProposalLineItemsRelations = relations(projectProposalLineItems, ({ one }) => ({
  org: one(orgs, { fields: [projectProposalLineItems.org_id], references: [orgs.id] }),
  proposal: one(projectProposals, {
    fields: [projectProposalLineItems.proposal_id],
    references: [projectProposals.id],
  }),
  tier: one(projectProposalTiers, {
    fields: [projectProposalLineItems.tier_id],
    references: [projectProposalTiers.id],
  }),
}))

export const projectProposalAddonsRelations = relations(projectProposalAddons, ({ one }) => ({
  org: one(orgs, { fields: [projectProposalAddons.org_id], references: [orgs.id] }),
  proposal: one(projectProposals, {
    fields: [projectProposalAddons.proposal_id],
    references: [projectProposals.id],
  }),
}))

export const projectPaymentMilestonesRelations = relations(projectPaymentMilestones, ({ one }) => ({
  org: one(orgs, { fields: [projectPaymentMilestones.org_id], references: [orgs.id] }),
  project: one(projects, { fields: [projectPaymentMilestones.project_id], references: [projects.id] }),
  proposal: one(projectProposals, {
    fields: [projectPaymentMilestones.proposal_id],
    references: [projectProposals.id],
  }),
  triggerPhase: one(projectPhases, {
    fields: [projectPaymentMilestones.trigger_phase_id],
    references: [projectPhases.id],
  }),
  invoice: one(invoices, {
    fields: [projectPaymentMilestones.invoice_id],
    references: [invoices.id],
  }),
}))

export const proposalChangeRequestsRelations = relations(proposalChangeRequests, ({ one }) => ({
  org: one(orgs, { fields: [proposalChangeRequests.org_id], references: [orgs.id] }),
  proposal: one(projectProposals, {
    fields: [proposalChangeRequests.proposal_id],
    references: [projectProposals.id],
  }),
}))

export const projectMaterialsRelations = relations(projectMaterials, ({ one, many }) => ({
  org: one(orgs, { fields: [projectMaterials.org_id], references: [orgs.id] }),
  project: one(projects, { fields: [projectMaterials.project_id], references: [projects.id] }),
  proposalLineItem: one(projectProposalLineItems, {
    fields: [projectMaterials.proposal_line_item_id],
    references: [projectProposalLineItems.id],
  }),
  receipts: many(projectMaterialReceipts),
  usage: many(projectMaterialUsage),
  returns: many(projectMaterialReturns),
  poLineItems: many(projectPoLineItems),
}))

export const projectPurchaseOrdersRelations = relations(projectPurchaseOrders, ({ one, many }) => ({
  org: one(orgs, { fields: [projectPurchaseOrders.org_id], references: [orgs.id] }),
  project: one(projects, { fields: [projectPurchaseOrders.project_id], references: [projects.id] }),
  lineItems: many(projectPoLineItems),
  receipts: many(projectMaterialReceipts),
}))

export const projectPoLineItemsRelations = relations(projectPoLineItems, ({ one }) => ({
  org: one(orgs, { fields: [projectPoLineItems.org_id], references: [orgs.id] }),
  purchaseOrder: one(projectPurchaseOrders, {
    fields: [projectPoLineItems.po_id],
    references: [projectPurchaseOrders.id],
  }),
  material: one(projectMaterials, {
    fields: [projectPoLineItems.material_id],
    references: [projectMaterials.id],
  }),
}))

export const projectMaterialReceiptsRelations = relations(projectMaterialReceipts, ({ one }) => ({
  org: one(orgs, { fields: [projectMaterialReceipts.org_id], references: [orgs.id] }),
  material: one(projectMaterials, {
    fields: [projectMaterialReceipts.material_id],
    references: [projectMaterials.id],
  }),
  purchaseOrder: one(projectPurchaseOrders, {
    fields: [projectMaterialReceipts.po_id],
    references: [projectPurchaseOrders.id],
  }),
  receivedBy: one(profiles, {
    fields: [projectMaterialReceipts.received_by],
    references: [profiles.id],
  }),
}))

export const projectMaterialUsageRelations = relations(projectMaterialUsage, ({ one }) => ({
  org: one(orgs, { fields: [projectMaterialUsage.org_id], references: [orgs.id] }),
  material: one(projectMaterials, {
    fields: [projectMaterialUsage.material_id],
    references: [projectMaterials.id],
  }),
  project: one(projects, { fields: [projectMaterialUsage.project_id], references: [projects.id] }),
  phase: one(projectPhases, {
    fields: [projectMaterialUsage.phase_id],
    references: [projectPhases.id],
  }),
  loggedBy: one(profiles, {
    fields: [projectMaterialUsage.logged_by],
    references: [profiles.id],
  }),
}))

export const projectMaterialReturnsRelations = relations(projectMaterialReturns, ({ one }) => ({
  org: one(orgs, { fields: [projectMaterialReturns.org_id], references: [orgs.id] }),
  material: one(projectMaterials, {
    fields: [projectMaterialReturns.material_id],
    references: [projectMaterials.id],
  }),
  returnedBy: one(profiles, {
    fields: [projectMaterialReturns.returned_by],
    references: [profiles.id],
  }),
}))

export const projectChangeOrdersRelations = relations(projectChangeOrders, ({ one }) => ({
  org: one(orgs, { fields: [projectChangeOrders.org_id], references: [orgs.id] }),
  project: one(projects, { fields: [projectChangeOrders.project_id], references: [projects.id] }),
}))

export const projectInspectionsRelations = relations(projectInspections, ({ one }) => ({
  org: one(orgs, { fields: [projectInspections.org_id], references: [orgs.id] }),
  project: one(projects, { fields: [projectInspections.project_id], references: [projects.id] }),
  phase: one(projectPhases, {
    fields: [projectInspections.phase_id],
    references: [projectPhases.id],
  }),
}))

export const projectPermitsRelations = relations(projectPermits, ({ one }) => ({
  org: one(orgs, { fields: [projectPermits.org_id], references: [orgs.id] }),
  project: one(projects, { fields: [projectPermits.project_id], references: [projects.id] }),
}))

export const projectPunchListRelations = relations(projectPunchList, ({ one }) => ({
  org: one(orgs, { fields: [projectPunchList.org_id], references: [orgs.id] }),
  project: one(projects, { fields: [projectPunchList.project_id], references: [projects.id] }),
  assignedTo: one(profiles, {
    fields: [projectPunchList.assigned_to],
    references: [profiles.id],
  }),
}))

export const projectWarrantyTermsRelations = relations(projectWarrantyTerms, ({ one, many }) => ({
  org: one(orgs, { fields: [projectWarrantyTerms.org_id], references: [orgs.id] }),
  claims: many(warrantyClaims),
}))

export const warrantyClaimsRelations = relations(warrantyClaims, ({ one }) => ({
  org: one(orgs, { fields: [warrantyClaims.org_id], references: [orgs.id] }),
  project: one(projects, { fields: [warrantyClaims.project_id], references: [projects.id] }),
  warrantyTerm: one(projectWarrantyTerms, {
    fields: [warrantyClaims.warranty_term_id],
    references: [projectWarrantyTerms.id],
  }),
  workOrder: one(workOrders, {
    fields: [warrantyClaims.work_order_id],
    references: [workOrders.id],
  }),
}))

export const projectDocumentsRelations = relations(projectDocuments, ({ one }) => ({
  org: one(orgs, { fields: [projectDocuments.org_id], references: [orgs.id] }),
  project: one(projects, { fields: [projectDocuments.project_id], references: [projects.id] }),
  uploadedBy: one(profiles, {
    fields: [projectDocuments.uploaded_by],
    references: [profiles.id],
  }),
}))

export const subcontractorsRelations = relations(subcontractors, ({ one, many }) => ({
  org: one(orgs, { fields: [subcontractors.org_id], references: [orgs.id] }),
  phaseAssignments: many(projectPhaseSubcontractors),
}))

export const projectPhaseSubcontractorsRelations = relations(
  projectPhaseSubcontractors,
  ({ one }) => ({
    org: one(orgs, { fields: [projectPhaseSubcontractors.org_id], references: [orgs.id] }),
    phase: one(projectPhases, {
      fields: [projectPhaseSubcontractors.phase_id],
      references: [projectPhases.id],
    }),
    subcontractor: one(subcontractors, {
      fields: [projectPhaseSubcontractors.subcontractor_id],
      references: [subcontractors.id],
    }),
  })
)

export const projectPhotosRelations = relations(projectPhotos, ({ one }) => ({
  org: one(orgs, { fields: [projectPhotos.org_id], references: [orgs.id] }),
  project: one(projects, { fields: [projectPhotos.project_id], references: [projects.id] }),
  phase: one(projectPhases, {
    fields: [projectPhotos.phase_id],
    references: [projectPhases.id],
  }),
  task: one(projectPhaseTasks, {
    fields: [projectPhotos.task_id],
    references: [projectPhaseTasks.id],
  }),
  takenBy: one(profiles, {
    fields: [projectPhotos.taken_by],
    references: [profiles.id],
  }),
}))

export const projectTimeLogsRelations = relations(projectTimeLogs, ({ one }) => ({
  org: one(orgs, { fields: [projectTimeLogs.org_id], references: [orgs.id] }),
  project: one(projects, { fields: [projectTimeLogs.project_id], references: [projects.id] }),
  phase: one(projectPhases, {
    fields: [projectTimeLogs.phase_id],
    references: [projectPhases.id],
  }),
  task: one(projectPhaseTasks, {
    fields: [projectTimeLogs.task_id],
    references: [projectPhaseTasks.id],
  }),
  tech: one(profiles, {
    fields: [projectTimeLogs.tech_id],
    references: [profiles.id],
  }),
  timeEntry: one(timeEntries, {
    fields: [projectTimeLogs.time_entry_id],
    references: [timeEntries.id],
  }),
}))

export const projectIssueFlagsRelations = relations(projectIssueFlags, ({ one }) => ({
  org: one(orgs, { fields: [projectIssueFlags.org_id], references: [orgs.id] }),
  project: one(projects, { fields: [projectIssueFlags.project_id], references: [projects.id] }),
  phase: one(projectPhases, {
    fields: [projectIssueFlags.phase_id],
    references: [projectPhases.id],
  }),
  task: one(projectPhaseTasks, {
    fields: [projectIssueFlags.task_id],
    references: [projectPhaseTasks.id],
  }),
  flaggedBy: one(profiles, {
    fields: [projectIssueFlags.flagged_by],
    references: [profiles.id],
  }),
  changeOrder: one(projectChangeOrders, {
    fields: [projectIssueFlags.change_order_id],
    references: [projectChangeOrders.id],
  }),
  alert: one(alerts, {
    fields: [projectIssueFlags.alert_id],
    references: [alerts.id],
  }),
}))

export const projectEquipmentAssignmentsRelations = relations(
  projectEquipmentAssignments,
  ({ one }) => ({
    org: one(orgs, { fields: [projectEquipmentAssignments.org_id], references: [orgs.id] }),
    project: one(projects, {
      fields: [projectEquipmentAssignments.project_id],
      references: [projects.id],
    }),
    assignedBy: one(profiles, {
      fields: [projectEquipmentAssignments.assigned_by],
      references: [profiles.id],
    }),
  })
)

// Phase 13 relations — Truck Inventory & Shopping Lists

export const truckInventoryRelations = relations(truckInventory, ({ one, many }) => ({
  org: one(orgs, { fields: [truckInventory.org_id], references: [orgs.id] }),
  tech: one(profiles, { fields: [truckInventory.tech_id], references: [profiles.id] }),
  catalogItem: one(partsCatalog, {
    fields: [truckInventory.catalog_item_id],
    references: [partsCatalog.id],
  }),
  chemicalProduct: one(chemicalProducts, {
    fields: [truckInventory.chemical_product_id],
    references: [chemicalProducts.id],
  }),
  logs: many(truckInventoryLog),
  shoppingListItems: many(shoppingListItems),
}))

export const truckInventoryLogRelations = relations(truckInventoryLog, ({ one }) => ({
  org: one(orgs, { fields: [truckInventoryLog.org_id], references: [orgs.id] }),
  inventoryItem: one(truckInventory, {
    fields: [truckInventoryLog.truck_inventory_item_id],
    references: [truckInventory.id],
  }),
  tech: one(profiles, {
    fields: [truckInventoryLog.tech_id],
    references: [profiles.id],
    relationName: "truckLog_tech",
  }),
  transferToTech: one(profiles, {
    fields: [truckInventoryLog.transfer_to_tech_id],
    references: [profiles.id],
    relationName: "truckLog_transferTo",
  }),
  transferFromTech: one(profiles, {
    fields: [truckInventoryLog.transfer_from_tech_id],
    references: [profiles.id],
    relationName: "truckLog_transferFrom",
  }),
}))

export const truckLoadTemplatesRelations = relations(truckLoadTemplates, ({ one, many }) => ({
  org: one(orgs, { fields: [truckLoadTemplates.org_id], references: [orgs.id] }),
  items: many(truckLoadTemplateItems),
}))

export const truckLoadTemplateItemsRelations = relations(truckLoadTemplateItems, ({ one }) => ({
  org: one(orgs, { fields: [truckLoadTemplateItems.org_id], references: [orgs.id] }),
  template: one(truckLoadTemplates, {
    fields: [truckLoadTemplateItems.template_id],
    references: [truckLoadTemplates.id],
  }),
  catalogItem: one(partsCatalog, {
    fields: [truckLoadTemplateItems.catalog_item_id],
    references: [partsCatalog.id],
  }),
  chemicalProduct: one(chemicalProducts, {
    fields: [truckLoadTemplateItems.chemical_product_id],
    references: [chemicalProducts.id],
  }),
}))

export const shoppingListItemsRelations = relations(shoppingListItems, ({ one }) => ({
  org: one(orgs, { fields: [shoppingListItems.org_id], references: [orgs.id] }),
  tech: one(profiles, {
    fields: [shoppingListItems.tech_id],
    references: [profiles.id],
    relationName: "shoppingItem_tech",
  }),
  catalogItem: one(partsCatalog, {
    fields: [shoppingListItems.catalog_item_id],
    references: [partsCatalog.id],
  }),
  chemicalProduct: one(chemicalProducts, {
    fields: [shoppingListItems.chemical_product_id],
    references: [chemicalProducts.id],
  }),
  sourceWorkOrder: one(workOrders, {
    fields: [shoppingListItems.source_work_order_id],
    references: [workOrders.id],
  }),
  sourceInventoryItem: one(truckInventory, {
    fields: [shoppingListItems.source_inventory_item_id],
    references: [truckInventory.id],
  }),
  orderedBy: one(profiles, {
    fields: [shoppingListItems.ordered_by_id],
    references: [profiles.id],
    relationName: "shoppingItem_orderedBy",
  }),
  receivedBy: one(profiles, {
    fields: [shoppingListItems.received_by_id],
    references: [profiles.id],
    relationName: "shoppingItem_receivedBy",
  }),
  loadedBy: one(profiles, {
    fields: [shoppingListItems.loaded_by_id],
    references: [profiles.id],
    relationName: "shoppingItem_loadedBy",
  }),
  usedBy: one(profiles, {
    fields: [shoppingListItems.used_by_id],
    references: [profiles.id],
    relationName: "shoppingItem_usedBy",
  }),
}))

export const purchaseOrdersRelations = relations(purchaseOrders, ({ one, many }) => ({
  org: one(orgs, { fields: [purchaseOrders.org_id], references: [orgs.id] }),
  createdBy: one(profiles, {
    fields: [purchaseOrders.created_by_id],
    references: [profiles.id],
  }),
  lineItems: many(poLineItems),
}))

export const poLineItemsRelations = relations(poLineItems, ({ one }) => ({
  org: one(orgs, { fields: [poLineItems.org_id], references: [orgs.id] }),
  purchaseOrder: one(purchaseOrders, {
    fields: [poLineItems.po_id],
    references: [purchaseOrders.id],
  }),
  shoppingListItem: one(shoppingListItems, {
    fields: [poLineItems.shopping_list_item_id],
    references: [shoppingListItems.id],
  }),
}))

export const barcodeCatalogLinksRelations = relations(barcodeCatalogLinks, ({ one }) => ({
  org: one(orgs, { fields: [barcodeCatalogLinks.org_id], references: [orgs.id] }),
  catalogItem: one(partsCatalog, {
    fields: [barcodeCatalogLinks.catalog_item_id],
    references: [partsCatalog.id],
  }),
  chemicalProduct: one(chemicalProducts, {
    fields: [barcodeCatalogLinks.chemical_product_id],
    references: [chemicalProducts.id],
  }),
  createdBy: one(profiles, {
    fields: [barcodeCatalogLinks.created_by_id],
    references: [profiles.id],
  }),
}))
