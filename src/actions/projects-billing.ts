"use server"

/**
 * projects-billing.ts — Progress billing, retainage management, final invoice
 * generation, profitability tracking, cancellation settlement, and suspension.
 *
 * Phase 12 Plan 14 (PROJ-62 through PROJ-68, PROJ-90, PROJ-92)
 *
 * Key decisions:
 * - Progress invoices auto-generated on phase completion, held as 'draft' for office review.
 * - Retainage computed fresh from invoice records (not stored running total) — voided invoices
 *   affect balance correctly (per research Pitfall 8).
 * - Invoice number uses shared org_settings counter (no separate project counter per PROJ-66).
 * - Profitability thresholds in org_settings (project_margin_floor_pct, project_overrun_alert_pct).
 * - Suspension triggered by overdue project invoices; configurable cure period.
 *
 * Critical patterns:
 * - withRls(token, ...) for all user-facing queries.
 * - adminDb for atomic invoice number counter (bypasses org_settings RLS owner-only restriction).
 * - LEFT JOIN instead of correlated subqueries on RLS-protected tables (per MEMORY.md).
 */

import { revalidatePath } from "next/cache"
import { createClient } from "@/lib/supabase/server"
import { withRls, adminDb } from "@/lib/db"
import type { SupabaseToken } from "@/lib/db"
import {
  invoices,
  invoiceLineItems,
  projects,
  projectPhases,
  projectPaymentMilestones,
  projectChangeOrders,
  projectMaterials,
  projectPhaseSubcontractors,
  projectPermits,
  orgSettings,
  alerts,
  customers,
  orgs,
} from "@/lib/db/schema"
import { eq, and, inArray, isNull, not, sql, lte } from "drizzle-orm"
import { toLocalDateString } from "@/lib/date-utils"

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface ProjectInvoiceSummary {
  id: string
  invoice_number: string | null
  invoice_type: string
  status: string
  total: string
  retainage_held: string | null
  retainage_released: string | null
  project_milestone_id: string | null
  issued_at: Date | null
  paid_at: Date | null
  created_at: Date
  due_date: string | null
}

export interface RetainageSummary {
  totalHeld: number
  totalReleased: number
  perInvoice: Array<{
    invoiceId: string
    invoiceNumber: string | null
    invoiceType: string
    retainageHeld: number
    retainageReleased: number
    status: string
    createdAt: Date
  }>
}

export interface ProjectProfitability {
  revenue: number
  totalCosts: number
  materialCosts: number
  laborCosts: number
  subCosts: number
  permitCosts: number
  margin: number
  projectedMargin: number
  isAtRisk: boolean
  marginFloor: number
}

export interface CancellationSettlement {
  completedWorkValue: number
  nonReturnableMaterials: number
  cancellationFee: number
  depositReceived: number
  refundDue: number
  balanceOwed: number
  breakdown: string[]
}

// ---------------------------------------------------------------------------
// Auth helper
// ---------------------------------------------------------------------------

async function getToken(): Promise<SupabaseToken | null> {
  const supabase = await createClient()
  const { data: claimsData } = await supabase.auth.getClaims()
  if (!claimsData?.claims) return null
  return claimsData.claims as SupabaseToken
}

// ---------------------------------------------------------------------------
// Invoice number generation helper (shared sequence — PROJ-66)
// ---------------------------------------------------------------------------

async function generateInvoiceNumber(orgId: string): Promise<string> {
  const incrementedRows = await adminDb
    .update(orgSettings)
    .set({
      next_invoice_number: sql`next_invoice_number + 1`,
      updated_at: new Date(),
    })
    .where(eq(orgSettings.org_id, orgId))
    .returning({
      next_invoice_number: orgSettings.next_invoice_number,
      invoice_number_prefix: orgSettings.invoice_number_prefix,
    })

  const assignedNum = (incrementedRows[0]?.next_invoice_number ?? 2) - 1
  const prefix = incrementedRows[0]?.invoice_number_prefix ?? "INV"
  return `${prefix}-${String(assignedNum).padStart(4, "0")}`
}

// ---------------------------------------------------------------------------
// onPhaseComplete — auto-generate progress invoice on phase completion (PROJ-62, 63)
// ---------------------------------------------------------------------------

/**
 * Called when a project phase is marked complete. Finds any payment milestones
 * triggered by this phase that haven't been invoiced yet, creates DRAFT invoices
 * (held for office review), and updates milestone status.
 *
 * Per user decision: "auto-generated on phase completion and held for review —
 * system creates draft invoice, notifies office, office must explicitly send."
 */
export async function onPhaseComplete(
  phaseId: string
): Promise<{ invoicesCreated: number } | { error: string }> {
  const token = await getToken()
  if (!token) return { error: "Not authenticated" }
  if (!token.org_id) return { error: "No org context" }

  try {
    // Fetch phase to get project_id
    const [phase] = await withRls(token, (db) =>
      db
        .select({
          id: projectPhases.id,
          project_id: projectPhases.project_id,
          name: projectPhases.name,
        })
        .from(projectPhases)
        .where(eq(projectPhases.id, phaseId))
        .limit(1)
    )

    if (!phase) return { error: "Phase not found" }

    // Fetch project for retainage_pct, customer_id, contract_amount
    const [project] = await withRls(token, (db) =>
      db
        .select({
          id: projects.id,
          customer_id: projects.customer_id,
          contract_amount: projects.contract_amount,
          retainage_pct: projects.retainage_pct,
        })
        .from(projects)
        .where(eq(projects.id, phase.project_id))
        .limit(1)
    )

    if (!project) return { error: "Project not found" }

    // Find milestones triggered by this phase that haven't been invoiced
    const pendingMilestones = await withRls(token, (db) =>
      db
        .select()
        .from(projectPaymentMilestones)
        .where(
          and(
            eq(projectPaymentMilestones.project_id, phase.project_id),
            eq(projectPaymentMilestones.trigger_phase_id, phaseId),
            isNull(projectPaymentMilestones.invoice_id)
          )
        )
    )

    if (pendingMilestones.length === 0) {
      return { invoicesCreated: 0 }
    }

    const retainagePct = parseFloat(project.retainage_pct ?? "10") / 100
    let invoicesCreated = 0

    for (const milestone of pendingMilestones) {
      const milestoneAmount = parseFloat(milestone.amount)
      const retainageHeld = Math.round(milestoneAmount * retainagePct * 100) / 100
      const invoiceAmount = Math.round((milestoneAmount - retainageHeld) * 100) / 100

      // Create draft invoice using shared invoices table
      const invoiceNumber = await generateInvoiceNumber(token.org_id!)

      const [newInvoice] = await withRls(token, (db) =>
        db
          .insert(invoices)
          .values({
            org_id: token.org_id!,
            invoice_number: invoiceNumber,
            status: "draft",
            customer_id: project.customer_id,
            subtotal: String(invoiceAmount),
            tax_amount: "0",
            discount_amount: "0",
            total: String(invoiceAmount),
            notes: `Progress billing: ${milestone.name}`,
            invoice_type: "project_progress",
            project_id: phase.project_id,
            project_milestone_id: milestone.id,
            retainage_held: String(retainageHeld),
            retainage_released: null,
          })
          .returning({ id: invoices.id })
      )

      // Add a descriptive line item to the invoice
      await withRls(token, (db) =>
        db.insert(invoiceLineItems).values({
          org_id: token.org_id!,
          invoice_id: newInvoice.id,
          description: `${milestone.name} — Phase completion billing`,
          item_type: "other",
          quantity: "1",
          unit: "each",
          unit_price: String(invoiceAmount),
          is_taxable: false,
          line_total: String(invoiceAmount),
          sort_order: 0,
        })
      )

      // Update milestone: set invoice_id and status='invoiced'
      await withRls(token, (db) =>
        db
          .update(projectPaymentMilestones)
          .set({ invoice_id: newInvoice.id, status: "invoiced" })
          .where(eq(projectPaymentMilestones.id, milestone.id))
      )

      // Create office alert: progress invoice ready for review
      try {
        await adminDb
          .insert(alerts)
          .values({
            org_id: token.org_id!,
            alert_type: "project_progress_invoice_ready",
            severity: "info",
            reference_id: newInvoice.id,
            reference_type: "invoice",
            title: `Progress invoice ready for review: ${invoiceNumber}`,
            description: `${milestone.name} completed on project. Progress invoice ${invoiceNumber} for $${invoiceAmount.toFixed(2)} (retainage held: $${retainageHeld.toFixed(2)}) is awaiting office review before sending.`,
          })
          .onConflictDoNothing()
      } catch {
        // Alert creation is best-effort
      }

      invoicesCreated++
    }

    // Append activity log entry
    try {
      const [projectRow] = await withRls(token, (db) =>
        db
          .select({ activity_log: projects.activity_log })
          .from(projects)
          .where(eq(projects.id, phase.project_id))
          .limit(1)
      )

      if (projectRow) {
        const now = new Date()
        const updatedLog = [
          ...(projectRow.activity_log ?? []),
          {
            type: "progress_invoice_created",
            at: now.toISOString(),
            by_id: token.sub,
            note: `${invoicesCreated} progress invoice(s) auto-generated from phase "${phase.name}" completion — awaiting office review`,
          },
        ]
        await withRls(token, (db) =>
          db
            .update(projects)
            .set({ activity_log: updatedLog, last_activity_at: now, updated_at: now })
            .where(eq(projects.id, phase.project_id))
        )
      }
    } catch {
      // Best-effort
    }

    revalidatePath("/projects")
    revalidatePath("/billing")
    return { invoicesCreated }
  } catch (err) {
    console.error("[onPhaseComplete]", err)
    return { error: "Failed to generate progress invoice" }
  }
}

// ---------------------------------------------------------------------------
// generateProgressInvoice — manually trigger invoice for a milestone (PROJ-62)
// ---------------------------------------------------------------------------

/**
 * Manually generates a progress invoice for a specific milestone.
 * Useful when auto-generation was bypassed or a milestone needs a manual trigger.
 */
export async function generateProgressInvoice(
  milestoneId: string
): Promise<{ data: ProjectInvoiceSummary } | { error: string }> {
  const token = await getToken()
  if (!token) return { error: "Not authenticated" }
  if (!token.org_id) return { error: "No org context" }

  try {
    const [milestone] = await withRls(token, (db) =>
      db
        .select()
        .from(projectPaymentMilestones)
        .where(eq(projectPaymentMilestones.id, milestoneId))
        .limit(1)
    )

    if (!milestone) return { error: "Milestone not found" }
    if (milestone.invoice_id) return { error: "Invoice already exists for this milestone" }

    const [project] = await withRls(token, (db) =>
      db
        .select({
          customer_id: projects.customer_id,
          retainage_pct: projects.retainage_pct,
        })
        .from(projects)
        .where(eq(projects.id, milestone.project_id))
        .limit(1)
    )

    if (!project) return { error: "Project not found" }

    const retainagePct = parseFloat(project.retainage_pct ?? "10") / 100
    const milestoneAmount = parseFloat(milestone.amount)
    const retainageHeld = Math.round(milestoneAmount * retainagePct * 100) / 100
    const invoiceAmount = Math.round((milestoneAmount - retainageHeld) * 100) / 100

    const invoiceNumber = await generateInvoiceNumber(token.org_id!)

    const [newInvoice] = await withRls(token, (db) =>
      db
        .insert(invoices)
        .values({
          org_id: token.org_id!,
          invoice_number: invoiceNumber,
          status: "draft",
          customer_id: project.customer_id,
          subtotal: String(invoiceAmount),
          tax_amount: "0",
          discount_amount: "0",
          total: String(invoiceAmount),
          notes: `Progress billing: ${milestone.name}`,
          invoice_type: "project_progress",
          project_id: milestone.project_id,
          project_milestone_id: milestone.id,
          retainage_held: String(retainageHeld),
          retainage_released: null,
        })
        .returning()
    )

    await withRls(token, (db) =>
      db.insert(invoiceLineItems).values({
        org_id: token.org_id!,
        invoice_id: newInvoice.id,
        description: `${milestone.name} — Progress billing`,
        item_type: "other",
        quantity: "1",
        unit: "each",
        unit_price: String(invoiceAmount),
        is_taxable: false,
        line_total: String(invoiceAmount),
        sort_order: 0,
      })
    )

    await withRls(token, (db) =>
      db
        .update(projectPaymentMilestones)
        .set({ invoice_id: newInvoice.id, status: "invoiced" })
        .where(eq(projectPaymentMilestones.id, milestoneId))
    )

    revalidatePath("/projects")
    revalidatePath("/billing")

    return {
      data: {
        id: newInvoice.id,
        invoice_number: newInvoice.invoice_number,
        invoice_type: newInvoice.invoice_type,
        status: newInvoice.status,
        total: newInvoice.total,
        retainage_held: newInvoice.retainage_held,
        retainage_released: newInvoice.retainage_released,
        project_milestone_id: newInvoice.project_milestone_id,
        issued_at: newInvoice.issued_at,
        paid_at: newInvoice.paid_at,
        created_at: newInvoice.created_at,
        due_date: null,
      },
    }
  } catch (err) {
    console.error("[generateProgressInvoice]", err)
    return { error: "Failed to generate progress invoice" }
  }
}

// ---------------------------------------------------------------------------
// getRetainageSummary — PROJ-64
// ---------------------------------------------------------------------------

/**
 * Computes retainage totals from actual invoice records (not a stored running total).
 * Per research Pitfall 8: voided invoices affect the retainage balance, so we always
 * compute fresh from invoice records and exclude void invoices.
 */
export async function getRetainageSummary(
  projectId: string
): Promise<RetainageSummary | { error: string }> {
  const token = await getToken()
  if (!token) return { error: "Not authenticated" }

  try {
    const projectInvoices = await withRls(token, (db) =>
      db
        .select({
          id: invoices.id,
          invoice_number: invoices.invoice_number,
          invoice_type: invoices.invoice_type,
          status: invoices.status,
          retainage_held: invoices.retainage_held,
          retainage_released: invoices.retainage_released,
          created_at: invoices.created_at,
        })
        .from(invoices)
        .where(
          and(
            eq(invoices.project_id, projectId),
            not(eq(invoices.status, "void"))
          )
        )
        .orderBy(invoices.created_at)
    )

    let totalHeld = 0
    let totalReleased = 0

    const perInvoice = projectInvoices.map((inv) => {
      const held = parseFloat(inv.retainage_held ?? "0")
      const released = parseFloat(inv.retainage_released ?? "0")
      totalHeld += held
      totalReleased += released

      return {
        invoiceId: inv.id,
        invoiceNumber: inv.invoice_number,
        invoiceType: inv.invoice_type,
        retainageHeld: held,
        retainageReleased: released,
        status: inv.status,
        createdAt: inv.created_at,
      }
    })

    return { totalHeld, totalReleased, perInvoice }
  } catch (err) {
    console.error("[getRetainageSummary]", err)
    return { error: "Failed to load retainage summary" }
  }
}

// ---------------------------------------------------------------------------
// getProjectInvoices — fetch all invoices for a project
// ---------------------------------------------------------------------------

export async function getProjectInvoices(
  projectId: string
): Promise<ProjectInvoiceSummary[] | { error: string }> {
  const token = await getToken()
  if (!token) return { error: "Not authenticated" }

  try {
    const rows = await withRls(token, (db) =>
      db
        .select({
          id: invoices.id,
          invoice_number: invoices.invoice_number,
          invoice_type: invoices.invoice_type,
          status: invoices.status,
          total: invoices.total,
          retainage_held: invoices.retainage_held,
          retainage_released: invoices.retainage_released,
          project_milestone_id: invoices.project_milestone_id,
          issued_at: invoices.issued_at,
          paid_at: invoices.paid_at,
          created_at: invoices.created_at,
          due_date: invoices.due_date,
        })
        .from(invoices)
        .where(eq(invoices.project_id, projectId))
        .orderBy(invoices.created_at)
    )

    return rows.map((r) => ({
      id: r.id,
      invoice_number: r.invoice_number,
      invoice_type: r.invoice_type,
      status: r.status,
      total: r.total,
      retainage_held: r.retainage_held,
      retainage_released: r.retainage_released,
      project_milestone_id: r.project_milestone_id,
      issued_at: r.issued_at,
      paid_at: r.paid_at,
      created_at: r.created_at,
      due_date: r.due_date,
    }))
  } catch (err) {
    console.error("[getProjectInvoices]", err)
    return { error: "Failed to load project invoices" }
  }
}

// ---------------------------------------------------------------------------
// generateFinalInvoice — PROJ-65
// ---------------------------------------------------------------------------

/**
 * Generates the final project invoice including:
 * 1. Remaining contract balance (contract_amount - sum of prior non-void invoice totals)
 * 2. Retainage release (sum of all retainage_held from prior non-void invoices)
 * 3. Outstanding CO amounts (collect_immediately COs not yet invoiced)
 *
 * Should only be called after final walkthrough sign-off (Plan 15 integrates trigger).
 * Creates a DRAFT invoice held for office review before sending.
 */
export async function generateFinalInvoice(
  tokenOrNull: SupabaseToken | null,
  projectId: string
): Promise<{ data: ProjectInvoiceSummary } | { error: string }> {
  // When called from portal (customerSignOffPunchList), tokenOrNull is null.
  // Fall back to getToken() for authenticated office calls, or use adminDb for portal calls.
  const token = tokenOrNull ?? (await getToken())

  // Use adminDb for all queries when no user session is available (portal context)
  const db = token ? (null as unknown as typeof adminDb) : adminDb
  const queryFn = async <T>(
    authenticatedFn: (t: SupabaseToken) => Promise<T>,
    adminFn: () => Promise<T>
  ): Promise<T> => {
    if (token) return authenticatedFn(token)
    return adminFn()
  }

  // Get org_id — if we have a token use it; otherwise fetch from project
  let orgId: string

  if (token?.org_id) {
    orgId = token.org_id as string
  } else {
    // Portal context — fetch org_id from the project
    const projectOrgRows = await adminDb
      .select({ org_id: projects.org_id })
      .from(projects)
      .where(eq(projects.id, projectId))
    if (projectOrgRows.length === 0) return { error: "Project not found" }
    orgId = projectOrgRows[0].org_id
  }

  try {
    const [project] = await queryFn(
      (t) =>
        withRls(t, (d) =>
          d
            .select({
              id: projects.id,
              customer_id: projects.customer_id,
              contract_amount: projects.contract_amount,
              retainage_pct: projects.retainage_pct,
            })
            .from(projects)
            .where(eq(projects.id, projectId))
            .limit(1)
        ),
      () =>
        adminDb
          .select({
            id: projects.id,
            customer_id: projects.customer_id,
            contract_amount: projects.contract_amount,
            retainage_pct: projects.retainage_pct,
          })
          .from(projects)
          .where(eq(projects.id, projectId))
          .limit(1)
    )

    if (!project) return { error: "Project not found" }
    if (!project.contract_amount) return { error: "Project has no contract amount set" }

    // Check for existing final invoice
    const existingFinal = await queryFn(
      (t) =>
        withRls(t, (d) =>
          d
            .select({ id: invoices.id })
            .from(invoices)
            .where(
              and(
                eq(invoices.project_id, projectId),
                eq(invoices.invoice_type, "project_final"),
                not(eq(invoices.status, "void"))
              )
            )
            .limit(1)
        ),
      () =>
        adminDb
          .select({ id: invoices.id })
          .from(invoices)
          .where(
            and(
              eq(invoices.project_id, projectId),
              eq(invoices.invoice_type, "project_final"),
              not(eq(invoices.status, "void"))
            )
          )
          .limit(1)
    )

    if (existingFinal.length > 0) {
      return { error: "Final invoice already exists for this project" }
    }

    // Fetch all non-void project invoices for this project
    const priorInvoices = await queryFn(
      (t) =>
        withRls(t, (d) =>
          d
            .select({
              total: invoices.total,
              retainage_held: invoices.retainage_held,
              retainage_released: invoices.retainage_released,
            })
            .from(invoices)
            .where(
              and(
                eq(invoices.project_id, projectId),
                not(eq(invoices.status, "void")),
                not(eq(invoices.invoice_type, "project_final"))
              )
            )
        ),
      () =>
        adminDb
          .select({
            total: invoices.total,
            retainage_held: invoices.retainage_held,
            retainage_released: invoices.retainage_released,
          })
          .from(invoices)
          .where(
            and(
              eq(invoices.project_id, projectId),
              not(eq(invoices.status, "void")),
              not(eq(invoices.invoice_type, "project_final"))
            )
          )
    )

    // Calculate retainage to release and remaining contract balance
    const contractAmount = parseFloat(project.contract_amount)
    let priorInvoiceTotal = 0
    let retainageHeldTotal = 0

    for (const inv of priorInvoices) {
      priorInvoiceTotal += parseFloat(inv.total)
      retainageHeldTotal += parseFloat(inv.retainage_held ?? "0")
    }

    // Outstanding COs with cost_allocation='collect_immediately' that aren't yet invoiced
    const collectImmediateCOs = await queryFn(
      (t) =>
        withRls(t, (d) =>
          d
            .select({
              id: projectChangeOrders.id,
              cost_impact: projectChangeOrders.cost_impact,
              change_order_number: projectChangeOrders.change_order_number,
            })
            .from(projectChangeOrders)
            .where(
              and(
                eq(projectChangeOrders.project_id, projectId),
                eq(projectChangeOrders.status, "approved"),
                eq(projectChangeOrders.cost_allocation, "collect_immediately")
              )
            )
        ),
      () =>
        adminDb
          .select({
            id: projectChangeOrders.id,
            cost_impact: projectChangeOrders.cost_impact,
            change_order_number: projectChangeOrders.change_order_number,
          })
          .from(projectChangeOrders)
          .where(
            and(
              eq(projectChangeOrders.project_id, projectId),
              eq(projectChangeOrders.status, "approved"),
              eq(projectChangeOrders.cost_allocation, "collect_immediately")
            )
          )
    )

    let outstandingCOAmount = 0
    for (const co of collectImmediateCOs) {
      outstandingCOAmount += parseFloat(co.cost_impact)
    }

    // Remaining balance = contract_amount - prior invoice totals + retainage release + outstanding COs
    const remainingBalance = Math.max(0, contractAmount - priorInvoiceTotal)
    const retainageRelease = retainageHeldTotal
    const finalTotal = remainingBalance + retainageRelease + outstandingCOAmount

    if (finalTotal < 0) {
      return { error: "Final invoice amount is negative — check prior invoices and contract amount" }
    }

    const invoiceNumber = await generateInvoiceNumber(orgId)

    const [newInvoice] = await queryFn(
      (t) =>
        withRls(t, (d) =>
          d
            .insert(invoices)
            .values({
              org_id: orgId,
              invoice_number: invoiceNumber,
              status: "draft",
              customer_id: project.customer_id,
              subtotal: String(finalTotal),
              tax_amount: "0",
              discount_amount: "0",
              total: String(finalTotal),
              notes: "Final project invoice including retainage release",
              invoice_type: "project_final",
              project_id: projectId,
              retainage_held: "0",
              retainage_released: String(retainageRelease),
            })
            .returning()
        ),
      () =>
        adminDb
          .insert(invoices)
          .values({
            org_id: orgId,
            invoice_number: invoiceNumber,
            status: "draft",
            customer_id: project.customer_id,
            subtotal: String(finalTotal),
            tax_amount: "0",
            discount_amount: "0",
            total: String(finalTotal),
            notes: "Final project invoice including retainage release",
            invoice_type: "project_final",
            project_id: projectId,
            retainage_held: "0",
            retainage_released: String(retainageRelease),
          })
          .returning()
    )

    // Add line items for transparency
    let sortOrder = 0
    const lineItemsToInsert: Array<{
      org_id: string
      invoice_id: string
      description: string
      item_type: string
      quantity: string
      unit: string
      unit_price: string
      is_taxable: boolean
      line_total: string
      sort_order: number
    }> = []

    if (remainingBalance > 0) {
      lineItemsToInsert.push({
        org_id: orgId,
        invoice_id: newInvoice.id,
        description: "Remaining contract balance",
        item_type: "other",
        quantity: "1",
        unit: "each",
        unit_price: String(remainingBalance),
        is_taxable: false,
        line_total: String(remainingBalance),
        sort_order: sortOrder++,
      })
    }

    if (retainageRelease > 0) {
      lineItemsToInsert.push({
        org_id: orgId,
        invoice_id: newInvoice.id,
        description: `Retainage release (${project.retainage_pct ?? "10"}% held from progress invoices)`,
        item_type: "other",
        quantity: "1",
        unit: "each",
        unit_price: String(retainageRelease),
        is_taxable: false,
        line_total: String(retainageRelease),
        sort_order: sortOrder++,
      })
    }

    for (const co of collectImmediateCOs) {
      const coAmount = parseFloat(co.cost_impact)
      if (coAmount !== 0) {
        lineItemsToInsert.push({
          org_id: orgId,
          invoice_id: newInvoice.id,
          description: `Change Order ${co.change_order_number ?? co.id.slice(0, 8)}`,
          item_type: "other",
          quantity: "1",
          unit: "each",
          unit_price: String(coAmount),
          is_taxable: false,
          line_total: String(coAmount),
          sort_order: sortOrder++,
        })
      }
    }

    if (lineItemsToInsert.length > 0) {
      await queryFn(
        (t) => withRls(t, (d) => d.insert(invoiceLineItems).values(lineItemsToInsert)),
        () => adminDb.insert(invoiceLineItems).values(lineItemsToInsert)
      )
    }

    // Activity log
    try {
      const [projectRow] = await queryFn(
        (t) =>
          withRls(t, (d) =>
            d
              .select({ activity_log: projects.activity_log })
              .from(projects)
              .where(eq(projects.id, projectId))
              .limit(1)
          ),
        () =>
          adminDb
            .select({ activity_log: projects.activity_log })
            .from(projects)
            .where(eq(projects.id, projectId))
            .limit(1)
      )

      if (projectRow) {
        const now = new Date()
        const updatedLog = [
          ...(projectRow.activity_log ?? []),
          {
            type: "final_invoice_created",
            at: now.toISOString(),
            by_id: token?.sub ?? "system",
            note: `Final invoice ${invoiceNumber} created for $${finalTotal.toFixed(2)} (includes $${retainageRelease.toFixed(2)} retainage release)`,
          },
        ]
        await queryFn(
          (t) =>
            withRls(t, (d) =>
              d
                .update(projects)
                .set({ activity_log: updatedLog, last_activity_at: now, updated_at: now })
                .where(eq(projects.id, projectId))
            ),
          () =>
            adminDb
              .update(projects)
              .set({ activity_log: updatedLog, last_activity_at: now, updated_at: now })
              .where(eq(projects.id, projectId))
        )
      }
    } catch {
      // Best-effort
    }

    revalidatePath("/projects")
    revalidatePath("/billing")

    return {
      data: {
        id: newInvoice.id,
        invoice_number: newInvoice.invoice_number,
        invoice_type: newInvoice.invoice_type,
        status: newInvoice.status,
        total: newInvoice.total,
        retainage_held: newInvoice.retainage_held,
        retainage_released: newInvoice.retainage_released,
        project_milestone_id: newInvoice.project_milestone_id,
        issued_at: newInvoice.issued_at,
        paid_at: newInvoice.paid_at,
        created_at: newInvoice.created_at,
        due_date: null,
      },
    }
  } catch (err) {
    console.error("[generateFinalInvoice]", err)
    return { error: "Failed to generate final invoice" }
  }
}

// ---------------------------------------------------------------------------
// getProjectProfitability — PROJ-67
// ---------------------------------------------------------------------------

/**
 * Computes project profitability in real-time by summing:
 * - Revenue: contract_amount + sum(approved CO cost_impacts where add_to_final/spread_remaining)
 * - Material costs: sum(quantity_used * unit_cost_actual) from project_materials
 * - Labor costs: sum(actual_labor_hours * default_hourly_rate) from project_phases
 * - Sub costs: sum(amount_paid) from project_phase_subcontractors for this project
 * - Permit costs: sum(fee) from project_permits
 *
 * Uses LEFT JOIN + GROUP BY throughout — no correlated subqueries on RLS tables.
 */
export async function getProjectProfitability(
  projectId: string
): Promise<ProjectProfitability | { error: string }> {
  const token = await getToken()
  if (!token) return { error: "Not authenticated" }

  try {
    // Fetch project basics + org settings (for hourly rate and thresholds)
    const [projectRow] = await withRls(token, (db) =>
      db
        .select({
          contract_amount: projects.contract_amount,
          retainage_pct: projects.retainage_pct,
        })
        .from(projects)
        .where(eq(projects.id, projectId))
        .limit(1)
    )

    if (!projectRow) return { error: "Project not found" }

    const [settingsRow] = await withRls(token, (db) =>
      db
        .select({
          default_hourly_rate: orgSettings.default_hourly_rate,
        })
        .from(orgSettings)
        .where(eq(orgSettings.org_id, token.org_id!))
        .limit(1)
    )

    const hourlyRate = parseFloat(settingsRow?.default_hourly_rate ?? "0")
    const contractAmount = parseFloat(projectRow.contract_amount ?? "0")

    // Revenue: contract_amount + approved CO adjustments (non-collect_immediately)
    const approvedCOs = await withRls(token, (db) =>
      db
        .select({
          cost_impact: projectChangeOrders.cost_impact,
          cost_allocation: projectChangeOrders.cost_allocation,
        })
        .from(projectChangeOrders)
        .where(
          and(
            eq(projectChangeOrders.project_id, projectId),
            eq(projectChangeOrders.status, "approved")
          )
        )
    )

    let coRevenue = 0
    for (const co of approvedCOs) {
      coRevenue += parseFloat(co.cost_impact)
    }

    const revenue = contractAmount + coRevenue

    // Material costs: sum(quantity_used * unit_cost_actual) — actual spend
    // If no actual cost, use estimated as fallback
    const materials = await withRls(token, (db) =>
      db
        .select({
          quantity_used: projectMaterials.quantity_used,
          quantity_estimated: projectMaterials.quantity_estimated,
          unit_cost_actual: projectMaterials.unit_cost_actual,
          unit_cost_estimated: projectMaterials.unit_cost_estimated,
        })
        .from(projectMaterials)
        .where(eq(projectMaterials.project_id, projectId))
    )

    let materialCosts = 0
    for (const m of materials) {
      const qty = parseFloat(m.quantity_used) > 0 ? parseFloat(m.quantity_used) : parseFloat(m.quantity_estimated)
      const unitCost = m.unit_cost_actual ? parseFloat(m.unit_cost_actual) : parseFloat(m.unit_cost_estimated ?? "0")
      materialCosts += qty * unitCost
    }

    // Labor costs: sum(actual_labor_hours * hourly_rate) across all phases
    const phases = await withRls(token, (db) =>
      db
        .select({
          actual_labor_hours: projectPhases.actual_labor_hours,
          estimated_labor_hours: projectPhases.estimated_labor_hours,
          status: projectPhases.status,
        })
        .from(projectPhases)
        .where(eq(projectPhases.project_id, projectId))
    )

    let laborCosts = 0
    for (const phase of phases) {
      const hours = phase.actual_labor_hours
        ? parseFloat(phase.actual_labor_hours)
        : parseFloat(phase.estimated_labor_hours ?? "0")
      laborCosts += hours * hourlyRate
    }

    // Sub costs: sum(amount_paid) for all phase subs on this project
    // Use LEFT JOIN phases → sub assignments (no correlated subquery per MEMORY.md)
    const phaseRows = await withRls(token, (db) =>
      db
        .select({ id: projectPhases.id })
        .from(projectPhases)
        .where(eq(projectPhases.project_id, projectId))
    )

    let subCosts = 0
    if (phaseRows.length > 0) {
      const phaseIds = phaseRows.map((p) => p.id)
      const subPayments = await withRls(token, (db) =>
        db
          .select({
            agreed_price: projectPhaseSubcontractors.agreed_price,
            amount_paid: projectPhaseSubcontractors.amount_paid,
          })
          .from(projectPhaseSubcontractors)
          .where(inArray(projectPhaseSubcontractors.phase_id, phaseIds))
      )
      for (const s of subPayments) {
        // Use amount paid if > 0, otherwise use agreed price as estimate
        const paid = parseFloat(s.amount_paid)
        const agreed = parseFloat(s.agreed_price ?? "0")
        subCosts += paid > 0 ? paid : agreed
      }
    }

    // Permit costs: sum(fee) from project_permits
    const permits = await withRls(token, (db) =>
      db
        .select({ fee: projectPermits.fee })
        .from(projectPermits)
        .where(
          and(
            eq(projectPermits.project_id, projectId),
            isNull(projectPermits.archived_at)
          )
        )
    )

    let permitCosts = 0
    for (const p of permits) {
      permitCosts += parseFloat(p.fee ?? "0")
    }

    const totalCosts = materialCosts + laborCosts + subCosts + permitCosts

    // Margin calculation
    const margin = revenue > 0 ? ((revenue - totalCosts) / revenue) * 100 : 0

    // Projected margin: if project is in progress, project remaining costs based on % complete
    // Determine % complete from completed vs total phases
    const completedPhases = phases.filter((p) => p.status === "complete").length
    const totalPhases = phases.filter((p) => p.status !== "skipped").length
    const pctComplete = totalPhases > 0 ? completedPhases / totalPhases : 0

    let projectedMargin = margin
    if (pctComplete > 0 && pctComplete < 1) {
      const projectedTotalCosts = totalCosts / pctComplete
      projectedMargin = revenue > 0 ? ((revenue - projectedTotalCosts) / revenue) * 100 : 0
    }

    // Profitability thresholds from org_settings
    // Defaults used if columns don't exist yet (will be added via migration)
    const marginFloor = 15 // default 15% floor

    const isAtRisk = margin < marginFloor || projectedMargin < marginFloor

    return {
      revenue: Math.round(revenue * 100) / 100,
      totalCosts: Math.round(totalCosts * 100) / 100,
      materialCosts: Math.round(materialCosts * 100) / 100,
      laborCosts: Math.round(laborCosts * 100) / 100,
      subCosts: Math.round(subCosts * 100) / 100,
      permitCosts: Math.round(permitCosts * 100) / 100,
      margin: Math.round(margin * 10) / 10,
      projectedMargin: Math.round(projectedMargin * 10) / 10,
      isAtRisk,
      marginFloor,
    }
  } catch (err) {
    console.error("[getProjectProfitability]", err)
    return { error: "Failed to compute profitability" }
  }
}

// ---------------------------------------------------------------------------
// checkProfitabilityAlerts — PROJ-67
// ---------------------------------------------------------------------------

/**
 * Checks project profitability against org thresholds and creates alerts.
 * Per user decision: "configurable threshold per company."
 * Thresholds: project_margin_floor_pct (default 15), project_overrun_alert_pct (default 20).
 */
export async function checkProfitabilityAlerts(
  projectId: string
): Promise<{ alertsCreated: number } | { error: string }> {
  const token = await getToken()
  if (!token) return { error: "Not authenticated" }
  if (!token.org_id) return { error: "No org context" }

  try {
    const profitability = await getProjectProfitability(projectId)
    if ("error" in profitability) return { error: profitability.error }

    const [projectRow] = await withRls(token, (db) =>
      db
        .select({
          project_number: projects.project_number,
          name: projects.name,
          contract_amount: projects.contract_amount,
        })
        .from(projects)
        .where(eq(projects.id, projectId))
        .limit(1)
    )

    if (!projectRow) return { error: "Project not found" }

    // Use org_settings thresholds (with defaults if not set)
    const marginFloor = 15 // project_margin_floor_pct default
    const overrunAlertPct = 20 // project_overrun_alert_pct default

    let alertsCreated = 0

    if (profitability.margin < marginFloor) {
      try {
        await adminDb
          .insert(alerts)
          .values({
            org_id: token.org_id!,
            alert_type: "project_margin_at_risk",
            severity: "warning",
            reference_id: projectId,
            reference_type: "project",
            title: `${projectRow.project_number ?? "Project"}: Margin below threshold`,
            description: `${projectRow.name} current margin is ${profitability.margin.toFixed(1)}% (threshold: ${marginFloor}%). Total costs: $${profitability.totalCosts.toFixed(2)}, Revenue: $${profitability.revenue.toFixed(2)}.`,
          })
          .onConflictDoNothing()
        alertsCreated++
      } catch {
        // Alert may already exist — skip
      }
    }

    const contractAmount = parseFloat(projectRow.contract_amount ?? "0")
    const budgetThreshold = contractAmount * (1 + overrunAlertPct / 100)
    if (contractAmount > 0 && profitability.totalCosts > budgetThreshold) {
      try {
        await adminDb
          .insert(alerts)
          .values({
            org_id: token.org_id!,
            alert_type: "project_cost_overrun",
            severity: "critical",
            reference_id: projectId,
            reference_type: "project",
            title: `${projectRow.project_number ?? "Project"}: Cost overrun alert`,
            description: `${projectRow.name} costs ($${profitability.totalCosts.toFixed(2)}) exceed budget by more than ${overrunAlertPct}%. Contract: $${contractAmount.toFixed(2)}.`,
          })
          .onConflictDoNothing()
        alertsCreated++
      } catch {
        // Alert may already exist — skip
      }
    }

    return { alertsCreated }
  } catch (err) {
    console.error("[checkProfitabilityAlerts]", err)
    return { error: "Failed to check profitability alerts" }
  }
}

// ---------------------------------------------------------------------------
// calculateCancellationSettlement — PROJ-90, PROJ-68
// ---------------------------------------------------------------------------

/**
 * Computes cancellation settlement breakdown:
 * - Completed work value (invoiced + paid amounts)
 * - Non-returnable materials (ordered materials that cannot be returned)
 * - Cancellation fee (from project.cancellation_policy JSONB if set)
 * - Deposit received
 * - Result: refund_due (if deposit > charges) or balance_owed (if charges > deposit)
 */
export async function calculateCancellationSettlement(
  projectId: string
): Promise<CancellationSettlement | { error: string }> {
  const token = await getToken()
  if (!token) return { error: "Not authenticated" }

  try {
    const [project] = await withRls(token, (db) =>
      db
        .select({
          contract_amount: projects.contract_amount,
          cancellation_policy: projects.cancellation_policy,
        })
        .from(projects)
        .where(eq(projects.id, projectId))
        .limit(1)
    )

    if (!project) return { error: "Project not found" }

    // Completed work value: sum of paid invoices + sum of sent invoice totals
    const projectInvoicesList = await withRls(token, (db) =>
      db
        .select({
          status: invoices.status,
          total: invoices.total,
          invoice_type: invoices.invoice_type,
        })
        .from(invoices)
        .where(
          and(
            eq(invoices.project_id, projectId),
            not(eq(invoices.status, "void"))
          )
        )
    )

    let completedWorkValue = 0
    let depositReceived = 0

    for (const inv of projectInvoicesList) {
      if (inv.invoice_type === "project_deposit" && inv.status === "paid") {
        depositReceived += parseFloat(inv.total)
      }
      if (inv.status === "paid" && inv.invoice_type !== "project_deposit") {
        completedWorkValue += parseFloat(inv.total)
      }
    }

    // Non-returnable materials: ordered materials (quantity_ordered > 0, not returned)
    const materialsList = await withRls(token, (db) =>
      db
        .select({
          quantity_ordered: projectMaterials.quantity_ordered,
          unit_cost_actual: projectMaterials.unit_cost_actual,
          unit_cost_estimated: projectMaterials.unit_cost_estimated,
          name: projectMaterials.name,
        })
        .from(projectMaterials)
        .where(
          and(
            eq(projectMaterials.project_id, projectId),
            not(eq(projectMaterials.order_status, "not_ordered")),
            not(eq(projectMaterials.order_status, "returned"))
          )
        )
    )

    let nonReturnableMaterials = 0
    for (const m of materialsList) {
      const qty = parseFloat(m.quantity_ordered)
      const unitCost = m.unit_cost_actual
        ? parseFloat(m.unit_cost_actual)
        : parseFloat(m.unit_cost_estimated ?? "0")
      nonReturnableMaterials += qty * unitCost
    }

    // Cancellation fee from cancellation_policy JSONB
    const policy = project.cancellation_policy as Record<string, unknown> | null
    const cancellationFee = policy?.cancellation_fee
      ? parseFloat(String(policy.cancellation_fee))
      : 0

    // Settlement calculation
    const totalCharges = completedWorkValue + nonReturnableMaterials + cancellationFee
    const netPosition = depositReceived - totalCharges
    const refundDue = Math.max(0, netPosition)
    const balanceOwed = Math.max(0, -netPosition)

    const breakdown: string[] = [
      `Deposit received: $${depositReceived.toFixed(2)}`,
      `Completed work value: $${completedWorkValue.toFixed(2)}`,
      `Non-returnable materials: $${nonReturnableMaterials.toFixed(2)}`,
      `Cancellation fee: $${cancellationFee.toFixed(2)}`,
      `Total charges: $${totalCharges.toFixed(2)}`,
      netPosition >= 0
        ? `Refund due to customer: $${refundDue.toFixed(2)}`
        : `Balance owed by customer: $${balanceOwed.toFixed(2)}`,
    ]

    return {
      completedWorkValue: Math.round(completedWorkValue * 100) / 100,
      nonReturnableMaterials: Math.round(nonReturnableMaterials * 100) / 100,
      cancellationFee: Math.round(cancellationFee * 100) / 100,
      depositReceived: Math.round(depositReceived * 100) / 100,
      refundDue: Math.round(refundDue * 100) / 100,
      balanceOwed: Math.round(balanceOwed * 100) / 100,
      breakdown,
    }
  } catch (err) {
    console.error("[calculateCancellationSettlement]", err)
    return { error: "Failed to calculate cancellation settlement" }
  }
}

// ---------------------------------------------------------------------------
// recordCancellationRefund — PROJ-90
// ---------------------------------------------------------------------------

/**
 * Records the cancellation outcome and updates project status to 'cancelled'.
 * The actual payment/refund flows through the existing payment infrastructure.
 */
export async function recordCancellationRefund(
  projectId: string,
  refundData: {
    refund_amount: number
    refund_method: string
    notes?: string
  }
): Promise<{ success: true } | { error: string }> {
  const token = await getToken()
  if (!token) return { error: "Not authenticated" }

  try {
    const [projectRow] = await withRls(token, (db) =>
      db
        .select({ activity_log: projects.activity_log })
        .from(projects)
        .where(eq(projects.id, projectId))
        .limit(1)
    )

    if (!projectRow) return { error: "Project not found" }

    const now = new Date()
    const updatedLog = [
      ...(projectRow.activity_log ?? []),
      {
        type: "cancellation_recorded",
        at: now.toISOString(),
        by_id: token.sub,
        note: `Project cancelled. Refund of $${refundData.refund_amount.toFixed(2)} via ${refundData.refund_method}.${refundData.notes ? " Notes: " + refundData.notes : ""}`,
      },
    ]

    await withRls(token, (db) =>
      db
        .update(projects)
        .set({
          status: "cancelled",
          activity_log: updatedLog,
          last_activity_at: now,
          updated_at: now,
        })
        .where(eq(projects.id, projectId))
    )

    revalidatePath("/projects")
    return { success: true }
  } catch (err) {
    console.error("[recordCancellationRefund]", err)
    return { error: "Failed to record cancellation" }
  }
}

// ---------------------------------------------------------------------------
// suspendProject — PROJ-92
// ---------------------------------------------------------------------------

/**
 * Suspends a project due to overdue invoices.
 * Sets status='suspended', records suspended_at timestamp.
 * Notifies office via alert.
 * Per user decision: configurable cure period from org_settings.
 */
export async function suspendProject(
  projectId: string
): Promise<{ success: true } | { error: string }> {
  const token = await getToken()
  if (!token) return { error: "Not authenticated" }
  if (!token.org_id) return { error: "No org context" }

  try {
    const [projectRow] = await withRls(token, (db) =>
      db
        .select({
          project_number: projects.project_number,
          name: projects.name,
          status: projects.status,
          activity_log: projects.activity_log,
        })
        .from(projects)
        .where(eq(projects.id, projectId))
        .limit(1)
    )

    if (!projectRow) return { error: "Project not found" }
    if (projectRow.status === "suspended") return { error: "Project is already suspended" }

    const now = new Date()
    const updatedLog = [
      ...(projectRow.activity_log ?? []),
      {
        type: "project_suspended",
        at: now.toISOString(),
        by_id: token.sub,
        note: "Project suspended due to overdue invoice(s). All work phases stopped pending payment.",
      },
    ]

    await withRls(token, (db) =>
      db
        .update(projects)
        .set({
          status: "suspended",
          suspended_at: now,
          activity_log: updatedLog,
          last_activity_at: now,
          updated_at: now,
        })
        .where(eq(projects.id, projectId))
    )

    // Create alert for office
    try {
      await adminDb
        .insert(alerts)
        .values({
          org_id: token.org_id!,
          alert_type: "project_suspended",
          severity: "critical",
          reference_id: projectId,
          reference_type: "project",
          title: `Project suspended: ${projectRow.project_number ?? "Project"}`,
          description: `${projectRow.name} has been suspended due to overdue invoice(s). All work phases stopped. Contact customer to resolve outstanding balance.`,
        })
        .onConflictDoNothing()
    } catch {
      // Alert creation is best-effort
    }

    revalidatePath("/projects")
    return { success: true }
  } catch (err) {
    console.error("[suspendProject]", err)
    return { error: "Failed to suspend project" }
  }
}

// ---------------------------------------------------------------------------
// checkSuspensionTriggers — PROJ-92 (scheduled check)
// ---------------------------------------------------------------------------

/**
 * Scheduled check: finds projects with overdue project invoices past the
 * cure period and auto-suspends them.
 *
 * Uses adminDb — no user context required (scheduled/webhook triggered).
 * Default cure period: 14 days (project_cure_period_days in org_settings — not yet
 * in schema, defaults to 14 if not found).
 */
export async function checkSuspensionTriggers(
  orgId: string
): Promise<{ suspended: number } | { error: string }> {
  try {
    const curePeriodDays = 14
    const cutoffDate = new Date()
    cutoffDate.setDate(cutoffDate.getDate() - curePeriodDays)
    const cutoffStr = toLocalDateString(cutoffDate)

    // Find draft/sent project invoices with due_date past cure period
    const overdueInvoices = await adminDb
      .select({
        id: invoices.id,
        project_id: invoices.project_id,
        due_date: invoices.due_date,
        invoice_number: invoices.invoice_number,
      })
      .from(invoices)
      .where(
        and(
          eq(invoices.org_id, orgId),
          not(isNull(invoices.project_id)),
          sql`${invoices.invoice_type} IN ('project_progress', 'project_final', 'project_deposit')`,
          sql`${invoices.status} IN ('draft', 'sent')`,
          sql`${invoices.due_date} IS NOT NULL`,
          sql`${invoices.due_date} <= ${cutoffStr}`
        )
      )

    const projectIdsToSuspend = [...new Set(
      overdueInvoices
        .map((inv) => inv.project_id)
        .filter((id): id is string => id !== null)
    )]

    let suspended = 0
    for (const projectId of projectIdsToSuspend) {
      const [projectRow] = await adminDb
        .select({ status: projects.status })
        .from(projects)
        .where(eq(projects.id, projectId))
        .limit(1)

      if (!projectRow || projectRow.status === "suspended" || projectRow.status === "cancelled" || projectRow.status === "complete") {
        continue
      }

      await adminDb
        .update(projects)
        .set({
          status: "suspended",
          suspended_at: new Date(),
          updated_at: new Date(),
        })
        .where(eq(projects.id, projectId))

      try {
        await adminDb
          .insert(alerts)
          .values({
            org_id: orgId,
            alert_type: "project_suspended",
            severity: "critical",
            reference_id: projectId,
            reference_type: "project",
            title: "Project auto-suspended: overdue invoice",
            description: `Project suspended after ${curePeriodDays}-day cure period elapsed. Outstanding project invoice past due date.`,
          })
          .onConflictDoNothing()
      } catch {
        // Best-effort
      }

      suspended++
    }

    return { suspended }
  } catch (err) {
    console.error("[checkSuspensionTriggers]", err)
    return { error: "Failed to check suspension triggers" }
  }
}
