"use server"

/**
 * projects-change-orders.ts — Server actions for project change order CRUD,
 * customer approval, project auto-update, cumulative impact tracking, and
 * issue flag conversion.
 *
 * Phase 12: Projects & Renovations — Plan 13
 *
 * Key patterns:
 * - createChangeOrder: sequential CO-XXX numbering, line items JSONB, draft status
 * - sendChangeOrder: generates JWT token, sends email via Resend, pending_approval
 * - getChangeOrderPublicData: adminDb — no auth required for public page
 * - approveChangeOrder: adminDb — updates project contract_amount, materials, schedule, milestones
 * - declineChangeOrder: adminDb — notifies office via alert
 * - getChangeOrderImpact: cumulative CO impact dashboard for project financials
 * - convertIssueFlagToChangeOrder: pre-populate CO from issue flag, update flag status
 */

import { revalidatePath } from "next/cache"
import { createElement } from "react"
import { createClient } from "@/lib/supabase/server"
import { withRls, adminDb } from "@/lib/db"
import type { SupabaseToken } from "@/lib/db"
import {
  projects,
  projectChangeOrders,
  projectIssueFlags,
  projectPaymentMilestones,
  projectPhases,
  projectMaterials,
  customers,
  orgs,
  alerts,
} from "@/lib/db/schema"
import { eq, and, desc, asc, isNull } from "drizzle-orm"
import { render as renderEmail } from "@react-email/render"
import { Resend } from "resend"
import { signChangeOrderToken } from "@/lib/projects/change-order-token"
import { ChangeOrderEmail } from "@/lib/emails/change-order-email"
import { toLocalDateString } from "@/lib/date-utils"

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
// Types
// ---------------------------------------------------------------------------

export interface ChangeOrderLineItem {
  description: string
  category: string
  quantity: number
  unit_price: number
  total: number
}

export interface ChangeOrderSummary {
  id: string
  org_id: string
  project_id: string
  change_order_number: string | null
  description: string
  reason: string
  status: string
  cost_impact: string
  schedule_impact_days: number
  cost_allocation: string
  line_items: ChangeOrderLineItem[] | null
  issue_flag_id: string | null
  approved_at: Date | null
  approved_signature: string | null
  archived_at: Date | null
  created_at: Date
  updated_at: Date
}

export interface ChangeOrderImpact {
  originalContractAmount: number
  totalApprovedCostImpact: number
  currentContractAmount: number
  changeOrders: Array<{
    id: string
    change_order_number: string | null
    description: string
    status: string
    cost_impact: string
    schedule_impact_days: number
    approved_at: Date | null
    created_at: Date
  }>
}

export interface CreateChangeOrderInput {
  description: string
  reason: string
  line_items: ChangeOrderLineItem[]
  cost_impact: number
  schedule_impact_days: number
  cost_allocation: string
  issue_flag_id?: string | null
}

export interface ChangeOrderPublicData {
  changeOrder: ChangeOrderSummary
  project: {
    id: string
    name: string
    project_number: string | null
    project_type: string
    contract_amount: string | null
    customerName: string
    customerEmail: string | null
    address: string | null
  }
  company: {
    name: string
    email: string | null
    phone: string | null
    logo_url: string | null
  }
  paymentMilestones: Array<{
    id: string
    name: string
    amount: string
    status: string
    sort_order: number
  }>
}

// ---------------------------------------------------------------------------
// createChangeOrder
// ---------------------------------------------------------------------------

export async function createChangeOrder(
  projectId: string,
  data: CreateChangeOrderInput
): Promise<{ success: boolean; changeOrderId?: string; error?: string }> {
  const token = await getToken()
  if (!token) return { success: false, error: "Not authenticated" }

  try {
    const changeOrderId = await withRls(token, async (db) => {
      // Count existing COs for this project to generate sequential number
      const existingCOs = await db
        .select({ id: projectChangeOrders.id })
        .from(projectChangeOrders)
        .where(eq(projectChangeOrders.project_id, projectId))

      const coNumber = `CO-${String(existingCOs.length + 1).padStart(3, "0")}`

      // Get project for org_id
      const [project] = await db
        .select({ org_id: projects.org_id, activity_log: projects.activity_log })
        .from(projects)
        .where(eq(projects.id, projectId))
        .limit(1)

      if (!project) throw new Error("Project not found")

      const [co] = await db
        .insert(projectChangeOrders)
        .values({
          org_id: project.org_id,
          project_id: projectId,
          change_order_number: coNumber,
          description: data.description,
          reason: data.reason,
          status: "draft",
          cost_impact: String(data.cost_impact),
          schedule_impact_days: data.schedule_impact_days,
          cost_allocation: data.cost_allocation,
          line_items: data.line_items,
          issue_flag_id: data.issue_flag_id ?? null,
        })
        .returning({ id: projectChangeOrders.id })

      // Append activity log
      const newLogEntry = {
        type: "change_order_created",
        at: new Date().toISOString(),
        by_id: token.sub,
        note: `Change order ${coNumber} created: ${data.description}`,
      }
      const updatedLog = [...(project.activity_log ?? []), newLogEntry]
      await db
        .update(projects)
        .set({ activity_log: updatedLog, updated_at: new Date() })
        .where(eq(projects.id, projectId))

      return co.id
    })

    revalidatePath(`/projects/${projectId}`)
    return { success: true, changeOrderId }
  } catch (err) {
    console.error("createChangeOrder error:", err)
    return { success: false, error: "Failed to create change order" }
  }
}

// ---------------------------------------------------------------------------
// updateChangeOrder (draft only)
// ---------------------------------------------------------------------------

export async function updateChangeOrder(
  changeOrderId: string,
  data: Partial<CreateChangeOrderInput>
): Promise<{ success: boolean; error?: string }> {
  const token = await getToken()
  if (!token) return { success: false, error: "Not authenticated" }

  try {
    const projectId = await withRls(token, async (db) => {
      const [co] = await db
        .select({ project_id: projectChangeOrders.project_id })
        .from(projectChangeOrders)
        .where(eq(projectChangeOrders.id, changeOrderId))
        .limit(1)

      if (!co) throw new Error("Change order not found")

      await db
        .update(projectChangeOrders)
        .set({
          ...(data.description !== undefined && { description: data.description }),
          ...(data.reason !== undefined && { reason: data.reason }),
          ...(data.line_items !== undefined && { line_items: data.line_items }),
          ...(data.cost_impact !== undefined && { cost_impact: String(data.cost_impact) }),
          ...(data.schedule_impact_days !== undefined && {
            schedule_impact_days: data.schedule_impact_days,
          }),
          ...(data.cost_allocation !== undefined && { cost_allocation: data.cost_allocation }),
          updated_at: new Date(),
        })
        .where(
          and(
            eq(projectChangeOrders.id, changeOrderId),
            eq(projectChangeOrders.status, "draft")
          )
        )

      return co.project_id
    })

    revalidatePath("/projects")
    revalidatePath(`/projects/${projectId}`)
    return { success: true }
  } catch (err) {
    console.error("updateChangeOrder error:", err)
    return { success: false, error: "Failed to update change order" }
  }
}

// ---------------------------------------------------------------------------
// sendChangeOrder
// ---------------------------------------------------------------------------

export async function sendChangeOrder(
  changeOrderId: string
): Promise<{ success: boolean; error?: string }> {
  const token = await getToken()
  if (!token) return { success: false, error: "Not authenticated" }

  try {
    // Fetch CO + project + customer + company info via withRls
    const coData = await withRls(token, async (db) => {
      const [co] = await db
        .select({
          id: projectChangeOrders.id,
          project_id: projectChangeOrders.project_id,
          org_id: projectChangeOrders.org_id,
          change_order_number: projectChangeOrders.change_order_number,
          description: projectChangeOrders.description,
          cost_impact: projectChangeOrders.cost_impact,
          schedule_impact_days: projectChangeOrders.schedule_impact_days,
          status: projectChangeOrders.status,
        })
        .from(projectChangeOrders)
        .where(eq(projectChangeOrders.id, changeOrderId))
        .limit(1)

      if (!co) throw new Error("Change order not found")
      if (co.status !== "draft") throw new Error("Change order is not in draft status")

      const [project] = await db
        .select({
          id: projects.id,
          name: projects.name,
          project_number: projects.project_number,
          activity_log: projects.activity_log,
        })
        .from(projects)
        .where(eq(projects.id, co.project_id))
        .limit(1)

      if (!project) throw new Error("Project not found")

      const [customer] = await db
        .select({
          name: customers.full_name,
          email: customers.email,
          address: customers.address,
        })
        .from(customers)
        .innerJoin(projects, eq(projects.customer_id, customers.id))
        .where(eq(projects.id, co.project_id))
        .limit(1)

      const [orgRow] = await db
        .select({ name: orgs.name })
        .from(orgs)
        .where(eq(orgs.id, co.org_id))
        .limit(1)

      return { co, project, customer, orgRow }
    })

    // Generate JWT token for this change order
    const jwtToken = await signChangeOrderToken(changeOrderId)
    const baseUrl = process.env.NEXT_PUBLIC_APP_URL ?? "https://app.deweyiq.com"
    const approvalUrl = `${baseUrl}/change-order/${encodeURIComponent(jwtToken)}`

    // Render email
    const emailHtml = await renderEmail(
      createElement(ChangeOrderEmail, {
        companyName: coData.orgRow?.name ?? "Your Pool Company",
        customerName: coData.customer?.name ?? "Customer",
        changeOrderNumber: coData.co.change_order_number ?? changeOrderId.slice(0, 8),
        projectName: coData.project.name,
        description: coData.co.description,
        costImpact: parseFloat(coData.co.cost_impact ?? "0"),
        scheduleImpactDays: coData.co.schedule_impact_days,
        approvalUrl,
      })
    )

    // Send via Resend
    const resend = new Resend(process.env.RESEND_API_KEY)
    const customerEmail = coData.customer?.email
    if (!customerEmail) {
      throw new Error("Customer has no email address")
    }

    const { error: emailError } = await resend.emails.send({
      from: process.env.RESEND_FROM_EMAIL ?? "noreply@deweyiq.com",
      to: customerEmail,
      subject: `Change Order ${coData.co.change_order_number ?? ""} for ${coData.project.name} — Action Required`,
      html: emailHtml,
    })

    if (emailError) throw new Error(`Email send failed: ${emailError.message}`)

    // Update CO status to pending_approval
    await withRls(token, async (db) => {
      await db
        .update(projectChangeOrders)
        .set({ status: "pending_approval", updated_at: new Date() })
        .where(eq(projectChangeOrders.id, changeOrderId))

      // Activity log
      const [project] = await db
        .select({ activity_log: projects.activity_log })
        .from(projects)
        .where(eq(projects.id, coData.co.project_id))
        .limit(1)

      const newLogEntry = {
        type: "change_order_sent",
        at: new Date().toISOString(),
        by_id: token.sub,
        note: `Change order ${coData.co.change_order_number} sent to ${customerEmail} for approval`,
      }
      await db
        .update(projects)
        .set({
          activity_log: [...(project?.activity_log ?? []), newLogEntry],
          updated_at: new Date(),
        })
        .where(eq(projects.id, coData.co.project_id))
    })

    revalidatePath(`/projects/${coData.co.project_id}`)
    return { success: true }
  } catch (err) {
    console.error("sendChangeOrder error:", err)
    return { success: false, error: err instanceof Error ? err.message : "Failed to send change order" }
  }
}

// ---------------------------------------------------------------------------
// getChangeOrderPublicData (adminDb — no auth required)
// ---------------------------------------------------------------------------

export async function getChangeOrderPublicData(
  changeOrderId: string
): Promise<ChangeOrderPublicData | null> {
  try {
    const [co] = await adminDb
      .select()
      .from(projectChangeOrders)
      .where(eq(projectChangeOrders.id, changeOrderId))
      .limit(1)

    if (!co) return null

    const [project] = await adminDb
      .select({
        id: projects.id,
        name: projects.name,
        project_number: projects.project_number,
        project_type: projects.project_type,
        contract_amount: projects.contract_amount,
        customer_id: projects.customer_id,
      })
      .from(projects)
      .where(eq(projects.id, co.project_id))
      .limit(1)

    if (!project) return null

    const [customer] = await adminDb
      .select({
        name: customers.full_name,
        email: customers.email,
        address: customers.address,
      })
      .from(customers)
      .where(eq(customers.id, project.customer_id))
      .limit(1)

    const [org] = await adminDb
      .select({
        name: orgs.name,
      })
      .from(orgs)
      .where(eq(orgs.id, co.org_id))
      .limit(1)

    const [orgRow] = await adminDb
      .select({
        name: orgs.name,
        logo_url: orgs.logo_url,
      })
      .from(orgs)
      .where(eq(orgs.id, co.org_id))
      .limit(1)

    // Fetch unpaid payment milestones for payment schedule preview
    const milestones = await adminDb
      .select({
        id: projectPaymentMilestones.id,
        name: projectPaymentMilestones.name,
        amount: projectPaymentMilestones.amount,
        status: projectPaymentMilestones.status,
        sort_order: projectPaymentMilestones.sort_order,
      })
      .from(projectPaymentMilestones)
      .where(
        and(
          eq(projectPaymentMilestones.project_id, co.project_id),
          eq(projectPaymentMilestones.status, "pending")
        )
      )
      .orderBy(asc(projectPaymentMilestones.sort_order))

    return {
      changeOrder: {
        id: co.id,
        org_id: co.org_id,
        project_id: co.project_id,
        change_order_number: co.change_order_number,
        description: co.description,
        reason: co.reason,
        status: co.status,
        cost_impact: co.cost_impact ?? "0",
        schedule_impact_days: co.schedule_impact_days,
        cost_allocation: co.cost_allocation,
        line_items: co.line_items as ChangeOrderLineItem[] | null,
        issue_flag_id: co.issue_flag_id,
        approved_at: co.approved_at,
        approved_signature: co.approved_signature,
        archived_at: co.archived_at,
        created_at: co.created_at,
        updated_at: co.updated_at,
      },
      project: {
        id: project.id,
        name: project.name,
        project_number: project.project_number,
        project_type: project.project_type,
        contract_amount: project.contract_amount,
        customerName: customer?.name ?? "Customer",
        customerEmail: customer?.email ?? null,
        address: customer?.address ?? null,
      },
      company: {
        name: orgRow?.name ?? "Pool Company",
        email: null,
        phone: null,
        logo_url: orgRow?.logo_url ?? null,
      },
      paymentMilestones: milestones.map((m) => ({
        id: m.id,
        name: m.name,
        amount: m.amount ?? "0",
        status: m.status,
        sort_order: m.sort_order,
      })),
    }
  } catch (err) {
    console.error("getChangeOrderPublicData error:", err)
    return null
  }
}

// ---------------------------------------------------------------------------
// approveChangeOrder (adminDb — public page, no auth required)
// ---------------------------------------------------------------------------

export async function approveChangeOrder(
  changeOrderId: string,
  signatureData: {
    signedName: string
    agreedToTerms: boolean
    ipAddress?: string
  }
): Promise<{ success: boolean; error?: string }> {
  if (!signatureData.agreedToTerms || !signatureData.signedName.trim()) {
    return { success: false, error: "Signature and agreement are required" }
  }

  try {
    // Fetch change order
    const [co] = await adminDb
      .select()
      .from(projectChangeOrders)
      .where(eq(projectChangeOrders.id, changeOrderId))
      .limit(1)

    if (!co) return { success: false, error: "Change order not found" }
    if (co.status !== "pending_approval") {
      return { success: false, error: "Change order is not pending approval" }
    }

    const projectId = co.project_id
    const costImpact = parseFloat(co.cost_impact ?? "0")

    // Mark CO as approved
    await adminDb
      .update(projectChangeOrders)
      .set({
        status: "approved",
        approved_at: new Date(),
        approved_signature: signatureData.signedName.trim(),
        updated_at: new Date(),
      })
      .where(eq(projectChangeOrders.id, changeOrderId))

    // ── Auto-update project ───────────────────────────────────────────────

    // 1. Fetch current project state
    const [project] = await adminDb
      .select({
        org_id: projects.org_id,
        contract_amount: projects.contract_amount,
        activity_log: projects.activity_log,
        estimated_completion_date: projects.estimated_completion_date,
      })
      .from(projects)
      .where(eq(projects.id, projectId))
      .limit(1)

    if (!project) return { success: false, error: "Project not found" }

    const currentContract = parseFloat(project.contract_amount ?? "0")
    const newContractAmount = currentContract + costImpact

    const activityEntries: Array<{ type: string; at: string; by_id: string; note: string | null }> =
      [...(project.activity_log ?? [])]

    activityEntries.push({
      type: "change_order_approved",
      at: new Date().toISOString(),
      by_id: "customer",
      note: `Change order ${co.change_order_number} approved by ${signatureData.signedName.trim()}. Contract updated from $${currentContract.toFixed(2)} to $${newContractAmount.toFixed(2)}.`,
    })

    // 2. Update contract amount
    let updatedCompletionDate = project.estimated_completion_date
    if (co.schedule_impact_days > 0 && project.estimated_completion_date) {
      // Shift estimated completion date forward
      const currentDate = new Date(project.estimated_completion_date)
      currentDate.setDate(currentDate.getDate() + co.schedule_impact_days)
      updatedCompletionDate = toLocalDateString(currentDate)
      activityEntries.push({
        type: "schedule_updated",
        at: new Date().toISOString(),
        by_id: "system",
        note: `Project completion date shifted +${co.schedule_impact_days} days to ${updatedCompletionDate} due to ${co.change_order_number}.`,
      })
    }

    await adminDb
      .update(projects)
      .set({
        contract_amount: String(newContractAmount),
        estimated_completion_date: updatedCompletionDate,
        activity_log: activityEntries,
        last_activity_at: new Date(),
        updated_at: new Date(),
      })
      .where(eq(projects.id, projectId))

    // 3. Add material line items to project_materials if any
    const lineItems = co.line_items as ChangeOrderLineItem[] | null
    if (lineItems && lineItems.length > 0) {
      const materialItems = lineItems.filter(
        (li) => li.category === "material" || li.category === "materials"
      )
      if (materialItems.length > 0) {
        await adminDb.insert(projectMaterials).values(
          materialItems.map((li) => ({
            org_id: co.org_id,
            project_id: projectId,
            name: li.description,
            category: "material",
            unit: "each",
            quantity_estimated: String(li.quantity),
            unit_cost_estimated: String(li.unit_price),
            notes: `Added from change order ${co.change_order_number}`,
          }))
        )
      }
    }

    // 4. Update payment milestones based on cost_allocation
    if (costImpact !== 0) {
      const unpaidMilestones = await adminDb
        .select()
        .from(projectPaymentMilestones)
        .where(
          and(
            eq(projectPaymentMilestones.project_id, projectId),
            eq(projectPaymentMilestones.status, "pending")
          )
        )
        .orderBy(desc(projectPaymentMilestones.sort_order))

      if (co.cost_allocation === "add_to_final" && unpaidMilestones.length > 0) {
        // Add cost_impact to the last unpaid milestone
        const finalMilestone = unpaidMilestones[0]
        const newAmount = parseFloat(finalMilestone.amount ?? "0") + costImpact
        await adminDb
          .update(projectPaymentMilestones)
          .set({ amount: String(Math.max(0, newAmount)) })
          .where(eq(projectPaymentMilestones.id, finalMilestone.id))
      } else if (co.cost_allocation === "spread_remaining" && unpaidMilestones.length > 0) {
        // Distribute cost_impact evenly across all unpaid milestones
        const perMilestone = costImpact / unpaidMilestones.length
        for (const milestone of unpaidMilestones) {
          const newAmount = parseFloat(milestone.amount ?? "0") + perMilestone
          await adminDb
            .update(projectPaymentMilestones)
            .set({ amount: String(Math.max(0, newAmount)) })
            .where(eq(projectPaymentMilestones.id, milestone.id))
        }
      } else if (co.cost_allocation === "collect_immediately") {
        // Create a new milestone for the full CO amount
        const maxSortOrder =
          unpaidMilestones.length > 0
            ? Math.max(...unpaidMilestones.map((m) => m.sort_order))
            : 0

        // Count total milestones for sort order
        const allMilestones = await adminDb
          .select({ sort_order: projectPaymentMilestones.sort_order })
          .from(projectPaymentMilestones)
          .where(eq(projectPaymentMilestones.project_id, projectId))
          .orderBy(desc(projectPaymentMilestones.sort_order))
          .limit(1)

        const nextSort =
          allMilestones.length > 0 ? allMilestones[0].sort_order + 1 : maxSortOrder + 1

        await adminDb.insert(projectPaymentMilestones).values({
          org_id: co.org_id,
          project_id: projectId,
          name: `Change Order ${co.change_order_number}`,
          amount: String(Math.abs(costImpact)),
          status: "pending",
          sort_order: nextSort,
        })
      }
    }

    // 5. Shift remaining phases if schedule_impact_days > 0
    if (co.schedule_impact_days > 0) {
      const remainingPhases = await adminDb
        .select({
          id: projectPhases.id,
          estimated_start_date: projectPhases.estimated_start_date,
          estimated_end_date: projectPhases.estimated_end_date,
          status: projectPhases.status,
        })
        .from(projectPhases)
        .where(
          and(
            eq(projectPhases.project_id, projectId),
            eq(projectPhases.status, "not_started")
          )
        )

      for (const phase of remainingPhases) {
        const updates: Record<string, string | undefined> = {}
        if (phase.estimated_start_date) {
          const d = new Date(phase.estimated_start_date)
          d.setDate(d.getDate() + co.schedule_impact_days)
          updates.estimated_start_date = toLocalDateString(d)
        }
        if (phase.estimated_end_date) {
          const d = new Date(phase.estimated_end_date)
          d.setDate(d.getDate() + co.schedule_impact_days)
          updates.estimated_end_date = toLocalDateString(d)
        }
        if (Object.keys(updates).length > 0) {
          await adminDb
            .update(projectPhases)
            .set(updates)
            .where(eq(projectPhases.id, phase.id))
        }
      }
    }

    revalidatePath("/projects")
    revalidatePath(`/projects/${projectId}`)
    return { success: true }
  } catch (err) {
    console.error("approveChangeOrder error:", err)
    return { success: false, error: "Failed to approve change order" }
  }
}

// ---------------------------------------------------------------------------
// declineChangeOrder (adminDb — public page, no auth required)
// ---------------------------------------------------------------------------

export async function declineChangeOrder(
  changeOrderId: string,
  reason?: string
): Promise<{ success: boolean; error?: string }> {
  try {
    const [co] = await adminDb
      .select({
        id: projectChangeOrders.id,
        project_id: projectChangeOrders.project_id,
        org_id: projectChangeOrders.org_id,
        change_order_number: projectChangeOrders.change_order_number,
        status: projectChangeOrders.status,
      })
      .from(projectChangeOrders)
      .where(eq(projectChangeOrders.id, changeOrderId))
      .limit(1)

    if (!co) return { success: false, error: "Change order not found" }
    if (co.status !== "pending_approval") {
      return { success: false, error: "Change order is not pending approval" }
    }

    // Update status
    await adminDb
      .update(projectChangeOrders)
      .set({ status: "declined", updated_at: new Date() })
      .where(eq(projectChangeOrders.id, changeOrderId))

    // Create office alert
    await adminDb.insert(alerts).values({
      org_id: co.org_id,
      alert_type: "project_change_order_declined",
      severity: "warning",
      title: `Change Order ${co.change_order_number ?? ""} Declined`,
      description: reason
        ? `Customer declined change order ${co.change_order_number}. Reason: ${reason}`
        : `Customer declined change order ${co.change_order_number} without giving a reason.`,
      metadata: { project_id: co.project_id, change_order_id: changeOrderId, reason: reason ?? null },
    })

    // Activity log on project
    const [project] = await adminDb
      .select({ activity_log: projects.activity_log })
      .from(projects)
      .where(eq(projects.id, co.project_id))
      .limit(1)

    if (project) {
      await adminDb
        .update(projects)
        .set({
          activity_log: [
            ...(project.activity_log ?? []),
            {
              type: "change_order_declined",
              at: new Date().toISOString(),
              by_id: "customer",
              note: `Change order ${co.change_order_number} declined by customer. ${reason ? `Reason: ${reason}` : ""}`,
            },
          ],
          last_activity_at: new Date(),
          updated_at: new Date(),
        })
        .where(eq(projects.id, co.project_id))
    }

    revalidatePath("/projects")
    revalidatePath(`/projects/${co.project_id}`)
    return { success: true }
  } catch (err) {
    console.error("declineChangeOrder error:", err)
    return { success: false, error: "Failed to decline change order" }
  }
}

// ---------------------------------------------------------------------------
// getChangeOrders (for project detail page)
// ---------------------------------------------------------------------------

export async function getChangeOrders(projectId: string): Promise<ChangeOrderSummary[]> {
  const token = await getToken()
  if (!token) return []

  try {
    const cos = await withRls(token, async (db) => {
      return db
        .select()
        .from(projectChangeOrders)
        .where(
          and(
            eq(projectChangeOrders.project_id, projectId),
            isNull(projectChangeOrders.archived_at)
          )
        )
        .orderBy(desc(projectChangeOrders.created_at))
    })

    return cos.map((co) => ({
      id: co.id,
      org_id: co.org_id,
      project_id: co.project_id,
      change_order_number: co.change_order_number,
      description: co.description,
      reason: co.reason,
      status: co.status,
      cost_impact: co.cost_impact ?? "0",
      schedule_impact_days: co.schedule_impact_days,
      cost_allocation: co.cost_allocation,
      line_items: co.line_items as ChangeOrderLineItem[] | null,
      issue_flag_id: co.issue_flag_id,
      approved_at: co.approved_at,
      approved_signature: co.approved_signature,
      archived_at: co.archived_at,
      created_at: co.created_at,
      updated_at: co.updated_at,
    }))
  } catch (err) {
    console.error("getChangeOrders error:", err)
    return []
  }
}

// ---------------------------------------------------------------------------
// getChangeOrderImpact (cumulative impact tracking — PROJ-60)
// ---------------------------------------------------------------------------

export async function getChangeOrderImpact(
  projectId: string
): Promise<ChangeOrderImpact | null> {
  const token = await getToken()
  if (!token) return null

  try {
    const result = await withRls(token, async (db) => {
      const [project] = await db
        .select({
          contract_amount: projects.contract_amount,
        })
        .from(projects)
        .where(eq(projects.id, projectId))
        .limit(1)

      if (!project) return null

      const cos = await db
        .select({
          id: projectChangeOrders.id,
          change_order_number: projectChangeOrders.change_order_number,
          description: projectChangeOrders.description,
          status: projectChangeOrders.status,
          cost_impact: projectChangeOrders.cost_impact,
          schedule_impact_days: projectChangeOrders.schedule_impact_days,
          approved_at: projectChangeOrders.approved_at,
          created_at: projectChangeOrders.created_at,
        })
        .from(projectChangeOrders)
        .where(
          and(
            eq(projectChangeOrders.project_id, projectId),
            isNull(projectChangeOrders.archived_at)
          )
        )
        .orderBy(asc(projectChangeOrders.created_at))

      // Calculate cumulative approved impact
      const approvedCOs = cos.filter((co) => co.status === "approved")
      const totalApprovedCostImpact = approvedCOs.reduce(
        (sum, co) => sum + parseFloat(co.cost_impact ?? "0"),
        0
      )

      // Current contract = current projects.contract_amount (already updated by approvals)
      const currentContractAmount = parseFloat(project.contract_amount ?? "0")
      // Original = current - approved CO impacts
      const originalContractAmount = currentContractAmount - totalApprovedCostImpact

      return {
        originalContractAmount,
        totalApprovedCostImpact,
        currentContractAmount,
        changeOrders: cos,
      }
    })

    return result
  } catch (err) {
    console.error("getChangeOrderImpact error:", err)
    return null
  }
}

// ---------------------------------------------------------------------------
// convertIssueFlagToChangeOrder (PROJ-61)
// ---------------------------------------------------------------------------

export async function convertIssueFlagToChangeOrder(
  issueFlagId: string
): Promise<{ success: boolean; changeOrderId?: string; error?: string }> {
  const token = await getToken()
  if (!token) return { success: false, error: "Not authenticated" }

  try {
    const changeOrderId = await withRls(token, async (db) => {
      // Fetch the issue flag
      const [flag] = await db
        .select()
        .from(projectIssueFlags)
        .where(eq(projectIssueFlags.id, issueFlagId))
        .limit(1)

      if (!flag) throw new Error("Issue flag not found")
      if (flag.status === "converted_to_co") throw new Error("Already converted to change order")

      // Count existing COs for sequential numbering
      const existingCOs = await db
        .select({ id: projectChangeOrders.id })
        .from(projectChangeOrders)
        .where(eq(projectChangeOrders.project_id, flag.project_id))

      const coNumber = `CO-${String(existingCOs.length + 1).padStart(3, "0")}`

      // Determine reason mapping from severity
      const reasonMap: Record<string, string> = {
        low: "unforeseen_conditions",
        medium: "unforeseen_conditions",
        high: "scope_change",
        critical: "scope_change",
      }

      // Create the CO pre-populated from the flag
      const [co] = await db
        .insert(projectChangeOrders)
        .values({
          org_id: flag.org_id,
          project_id: flag.project_id,
          change_order_number: coNumber,
          description: flag.title + (flag.description ? `\n\n${flag.description}` : ""),
          reason: reasonMap[flag.severity] ?? "unforeseen_conditions",
          status: "draft",
          cost_impact: "0",
          schedule_impact_days: 0,
          cost_allocation: "add_to_final",
          line_items: [],
          issue_flag_id: issueFlagId,
        })
        .returning({ id: projectChangeOrders.id })

      // Update issue flag status to converted_to_co
      await db
        .update(projectIssueFlags)
        .set({
          status: "converted_to_co",
          change_order_id: co.id,
          updated_at: new Date(),
        })
        .where(eq(projectIssueFlags.id, issueFlagId))

      // Activity log on project
      const [project] = await db
        .select({ activity_log: projects.activity_log })
        .from(projects)
        .where(eq(projects.id, flag.project_id))
        .limit(1)

      await db
        .update(projects)
        .set({
          activity_log: [
            ...(project?.activity_log ?? []),
            {
              type: "issue_converted_to_co",
              at: new Date().toISOString(),
              by_id: token.sub,
              note: `Issue flag "${flag.title}" converted to change order ${coNumber}`,
            },
          ],
          updated_at: new Date(),
        })
        .where(eq(projects.id, flag.project_id))

      return co.id
    })

    return { success: true, changeOrderId }
  } catch (err) {
    console.error("convertIssueFlagToChangeOrder error:", err)
    return {
      success: false,
      error: err instanceof Error ? err.message : "Failed to convert issue flag",
    }
  }
}

// ---------------------------------------------------------------------------
// deleteChangeOrder (archive — PROJ-91)
// ---------------------------------------------------------------------------

export async function deleteChangeOrder(
  changeOrderId: string
): Promise<{ success: boolean; error?: string }> {
  const token = await getToken()
  if (!token) return { success: false, error: "Not authenticated" }

  try {
    const projectId = await withRls(token, async (db) => {
      const [co] = await db
        .select({ project_id: projectChangeOrders.project_id })
        .from(projectChangeOrders)
        .where(eq(projectChangeOrders.id, changeOrderId))
        .limit(1)

      if (!co) throw new Error("Change order not found")

      await db
        .update(projectChangeOrders)
        .set({ archived_at: new Date(), updated_at: new Date() })
        .where(
          and(
            eq(projectChangeOrders.id, changeOrderId),
            eq(projectChangeOrders.status, "draft")
          )
        )

      return co.project_id
    })

    revalidatePath("/projects")
    revalidatePath(`/projects/${projectId}`)
    return { success: true }
  } catch (err) {
    console.error("deleteChangeOrder error:", err)
    return { success: false, error: "Failed to archive change order" }
  }
}
