"use server"

/**
 * projects-portal.ts — Portal-specific data fetching for customer project views.
 *
 * Phase 12 Plan 16 (PROJ-84 through PROJ-89)
 *
 * ALL queries use adminDb with explicit customer ownership validation.
 * Customer portal uses magic-link auth — these actions run from portal server components.
 *
 * Exports:
 * - getPortalProjects: list of customer's projects
 * - getPortalProjectDetail: project timeline, phases, photos (no internal data)
 * - getPortalProjectFinancials: contract amount, payments, retainage (no cost/margin)
 * - getPortalPunchList: punch list items for customer sign-off
 * - sendProjectUpdateNotification: email/notification on project events
 *
 * Key decisions:
 * - Uses adminDb (portal customers use magic-link auth, not staff JWT)
 * - Validates customer ownership: project.customer_id must match resolved customer
 * - Excludes: cost breakdowns, margin data, sub payment details, internal notes
 * - Signed URLs generated for photo_paths via Supabase Storage
 */

import { adminDb } from "@/lib/db"
import {
  projects,
  projectPhases,
  projectPhaseTasks,
  projectPhotos,
  projectPaymentMilestones,
  projectPunchList,
  projectChangeOrders,
  projectWarrantyTerms,
  warrantyClaims,
  invoices,
  customers,
  orgs,
  orgSettings,
  alerts,
} from "@/lib/db/schema"
import { eq, and, asc, desc, isNull, not, inArray } from "drizzle-orm"
import { createClient as createSupabaseAdmin } from "@supabase/supabase-js"
import { Resend } from "resend"
import { PROJECT_STAGE_LABELS } from "@/lib/projects-constants"

// ---------------------------------------------------------------------------
// Admin Supabase client (for signed URLs)
// ---------------------------------------------------------------------------

function createAdminStorageClient() {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!supabaseUrl || !serviceRoleKey) {
    throw new Error("Missing SUPABASE_SERVICE_ROLE_KEY or NEXT_PUBLIC_SUPABASE_URL")
  }
  return createSupabaseAdmin(supabaseUrl, serviceRoleKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  })
}

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface PortalProjectSummary {
  id: string
  project_number: string | null
  name: string
  project_type: string
  stage: string
  stageLabel: string
  status: string
  progress_pct: number
  contract_amount: string | null
  estimated_completion_date: string | null
  next_milestone_name: string | null
  created_at: Date
}

export interface PortalPhase {
  id: string
  name: string
  sort_order: number
  status: string
  estimated_start_date: string | null
  estimated_end_date: string | null
  actual_start_date: string | null
  actual_end_date: string | null
  photos: PortalPhoto[]
}

export interface PortalPhoto {
  id: string
  file_path: string
  signed_url: string | null
  caption: string | null
  tag: string
  taken_at: Date
}

export interface PortalChangeOrderSummary {
  id: string
  change_order_number: string | null
  description: string
  cost_impact: string
  schedule_impact_days: number
  status: string
  approved_at: Date | null
  created_at: Date
}

export interface PortalProjectDetail {
  id: string
  project_number: string | null
  name: string
  project_type: string
  stage: string
  stageLabel: string
  status: string
  progress_pct: number
  estimated_completion_date: string | null
  actual_completion_date: string | null
  phases: PortalPhase[]
  // Change orders (customer-appropriate subset)
  changeOrders: PortalChangeOrderSummary[]
  // Warranty info (high level only)
  hasActiveWarranty: boolean
  warrantyActivatedAt: string | null
}

export interface PortalPayment {
  id: string
  name: string
  amount: number
  retainage_pct: number | null
  status: string
  due_date: string | null
  invoice_number: string | null
}

export interface PortalProjectFinancials {
  contract_amount: number
  change_order_total: number
  current_contract: number
  total_paid: number
  retainage_held: number
  retainage_released: number
  balance_due: number
  payments: PortalPayment[]
}

export interface PortalPunchListItem {
  id: string
  item_description: string
  status: string
  resolution_notes: string | null
  photo_urls: string[] // signed URLs
  resolved_at: Date | null
  customer_accepted_at: Date | null
}

export interface PortalPunchList {
  projectId: string
  items: PortalPunchListItem[]
  allResolved: boolean
  signedOffAt: Date | null
}

// ---------------------------------------------------------------------------
// validateCustomerOwnsProject
// ---------------------------------------------------------------------------

/**
 * Verify the customer owns the project (security boundary).
 * Returns customer row or null if unauthorized.
 */
async function validateCustomerOwnsProject(
  orgId: string,
  customerId: string,
  projectId: string
): Promise<boolean> {
  const [project] = await adminDb
    .select({ customer_id: projects.customer_id, org_id: projects.org_id })
    .from(projects)
    .where(and(eq(projects.id, projectId), eq(projects.org_id, orgId)))
    .limit(1)

  if (!project) return false
  return project.customer_id === customerId
}

// ---------------------------------------------------------------------------
// calculateProgressPct
// ---------------------------------------------------------------------------

/**
 * Compute progress percentage from project stage.
 * Customers see a simple 0-100 number, not internal phase details.
 */
function calculateProgressFromStage(stage: string): number {
  const STAGE_PROGRESS: Record<string, number> = {
    lead: 5,
    site_survey_scheduled: 10,
    survey_complete: 15,
    proposal_sent: 20,
    proposal_approved: 30,
    deposit_received: 35,
    permitted: 40,
    in_progress: 60,
    punch_list: 85,
    complete: 100,
    warranty_active: 100,
  }
  return STAGE_PROGRESS[stage] ?? 50
}

// ---------------------------------------------------------------------------
// getPortalProjects
// ---------------------------------------------------------------------------

/**
 * PROJ-84: Fetch projects for the logged-in customer.
 * Active first, completed at bottom.
 */
export async function getPortalProjects(
  orgId: string,
  customerId: string
): Promise<PortalProjectSummary[] | { error: string }> {
  try {
    const customerRows = await adminDb
      .select({ id: customers.id })
      .from(customers)
      .where(and(eq(customers.id, customerId), eq(customers.org_id, orgId)))
      .limit(1)

    if (customerRows.length === 0) return { error: "Customer not found" }

    const projectRows = await adminDb
      .select({
        id: projects.id,
        project_number: projects.project_number,
        name: projects.name,
        project_type: projects.project_type,
        stage: projects.stage,
        status: projects.status,
        contract_amount: projects.contract_amount,
        estimated_completion_date: projects.estimated_completion_date,
        created_at: projects.created_at,
      })
      .from(projects)
      .where(
        and(
          eq(projects.org_id, orgId),
          eq(projects.customer_id, customerId),
          not(eq(projects.status, "cancelled"))
        )
      )
      .orderBy(desc(projects.created_at))

    // Get next milestone for each project from payment milestones
    const projectIds = projectRows.map((p) => p.id)
    let milestoneMap = new Map<string, string>()
    if (projectIds.length > 0) {
      const nextMilestones = await adminDb
        .select({
          project_id: projectPaymentMilestones.project_id,
          name: projectPaymentMilestones.name,
        })
        .from(projectPaymentMilestones)
        .where(
          and(
            inArray(projectPaymentMilestones.project_id, projectIds),
            not(eq(projectPaymentMilestones.status, "paid"))
          )
        )
        .orderBy(asc(projectPaymentMilestones.sort_order))
        .limit(projectIds.length)

      // Map each project to its first unpaid milestone
      for (const m of nextMilestones) {
        if (!milestoneMap.has(m.project_id)) {
          milestoneMap.set(m.project_id, m.name)
        }
      }
    }

    const results: PortalProjectSummary[] = projectRows.map((p) => ({
      id: p.id,
      project_number: p.project_number,
      name: p.name,
      project_type: p.project_type,
      stage: p.stage,
      stageLabel: PROJECT_STAGE_LABELS[p.stage as keyof typeof PROJECT_STAGE_LABELS] ?? p.stage,
      status: p.status,
      progress_pct: calculateProgressFromStage(p.stage),
      contract_amount: p.contract_amount,
      estimated_completion_date: p.estimated_completion_date,
      next_milestone_name: milestoneMap.get(p.id) ?? null,
      created_at: p.created_at,
    }))

    // Sort: active/in_progress first, complete/warranty last
    results.sort((a, b) => {
      const aComplete = ["complete", "warranty_active"].includes(a.stage)
      const bComplete = ["complete", "warranty_active"].includes(b.stage)
      if (aComplete && !bComplete) return 1
      if (!aComplete && bComplete) return -1
      return b.created_at.getTime() - a.created_at.getTime()
    })

    return results
  } catch (err) {
    console.error("[getPortalProjects] Error:", err)
    return { error: err instanceof Error ? err.message : "Failed to load projects" }
  }
}

// ---------------------------------------------------------------------------
// getPortalProjectDetail
// ---------------------------------------------------------------------------

/**
 * PROJ-84: Project detail for portal.
 * Returns timeline (phases), photos grouped by phase, change orders.
 * EXCLUDES: internal notes, profitability data, sub payment details.
 */
export async function getPortalProjectDetail(
  orgId: string,
  customerId: string,
  projectId: string
): Promise<PortalProjectDetail | { error: string }> {
  try {
    const authorized = await validateCustomerOwnsProject(orgId, customerId, projectId)
    if (!authorized) return { error: "Not authorized" }

    const [project] = await adminDb
      .select({
        id: projects.id,
        project_number: projects.project_number,
        name: projects.name,
        project_type: projects.project_type,
        stage: projects.stage,
        status: projects.status,
        estimated_completion_date: projects.estimated_completion_date,
        actual_completion_date: projects.actual_completion_date,
        stage_entered_at: projects.stage_entered_at,
      })
      .from(projects)
      .where(eq(projects.id, projectId))
      .limit(1)

    if (!project) return { error: "Project not found" }

    // Phases (sorted, no internal notes exposed)
    const phaseRows = await adminDb
      .select({
        id: projectPhases.id,
        name: projectPhases.name,
        sort_order: projectPhases.sort_order,
        status: projectPhases.status,
        estimated_start_date: projectPhases.estimated_start_date,
        estimated_end_date: projectPhases.estimated_end_date,
        actual_start_date: projectPhases.actual_start_date,
        actual_end_date: projectPhases.actual_end_date,
      })
      .from(projectPhases)
      .where(
        and(
          eq(projectPhases.project_id, projectId),
          eq(projectPhases.org_id, orgId)
        )
      )
      .orderBy(asc(projectPhases.sort_order))

    // Photos for all phases (tag: before/during/after/inspection — NOT 'issue' or internal)
    const allPhotos = await adminDb
      .select({
        id: projectPhotos.id,
        phase_id: projectPhotos.phase_id,
        file_path: projectPhotos.file_path,
        caption: projectPhotos.caption,
        tag: projectPhotos.tag,
        taken_at: projectPhotos.taken_at,
      })
      .from(projectPhotos)
      .where(
        and(
          eq(projectPhotos.project_id, projectId),
          eq(projectPhotos.org_id, orgId),
          isNull(projectPhotos.archived_at)
          // Show photos — all non-archived photos are customer-visible
        )
      )
      .orderBy(asc(projectPhotos.taken_at))

    // Generate signed URLs for photos
    let signedUrlMap = new Map<string, string>()
    if (allPhotos.length > 0) {
      try {
        const supabaseAdmin = createAdminStorageClient()
        const signedUrls = await Promise.all(
          allPhotos.map(async (photo) => {
            try {
              const { data } = await supabaseAdmin.storage
                .from("company-assets")
                .createSignedUrl(photo.file_path, 3600)
              return { id: photo.id, url: data?.signedUrl ?? null }
            } catch {
              return { id: photo.id, url: null }
            }
          })
        )
        for (const { id, url } of signedUrls) {
          if (url) signedUrlMap.set(id, url)
        }
      } catch {
        // Non-fatal — photos without signed URLs just won't show
      }
    }

    // Group photos by phase
    const photosByPhase = new Map<string | null, PortalPhoto[]>()
    for (const photo of allPhotos) {
      const key = photo.phase_id
      if (!photosByPhase.has(key)) photosByPhase.set(key, [])
      photosByPhase.get(key)!.push({
        id: photo.id,
        file_path: photo.file_path,
        signed_url: signedUrlMap.get(photo.id) ?? null,
        caption: photo.caption,
        tag: photo.tag,
        taken_at: photo.taken_at,
      })
    }

    const phases: PortalPhase[] = phaseRows.map((phase) => ({
      id: phase.id,
      name: phase.name,
      sort_order: phase.sort_order,
      status: phase.status,
      estimated_start_date: phase.estimated_start_date,
      estimated_end_date: phase.estimated_end_date,
      actual_start_date: phase.actual_start_date,
      actual_end_date: phase.actual_end_date,
      photos: photosByPhase.get(phase.id) ?? [],
    }))

    // Change orders (customer-appropriate: pending_approval or approved only)
    const coRows = await adminDb
      .select({
        id: projectChangeOrders.id,
        change_order_number: projectChangeOrders.change_order_number,
        description: projectChangeOrders.description,
        cost_impact: projectChangeOrders.cost_impact,
        schedule_impact_days: projectChangeOrders.schedule_impact_days,
        status: projectChangeOrders.status,
        approved_at: projectChangeOrders.approved_at,
        created_at: projectChangeOrders.created_at,
      })
      .from(projectChangeOrders)
      .where(
        and(
          eq(projectChangeOrders.project_id, projectId),
          eq(projectChangeOrders.org_id, orgId),
          isNull(projectChangeOrders.archived_at),
          inArray(projectChangeOrders.status, ["pending_approval", "approved"])
        )
      )
      .orderBy(desc(projectChangeOrders.created_at))

    const changeOrders: PortalChangeOrderSummary[] = coRows.map((co) => ({
      id: co.id,
      change_order_number: co.change_order_number,
      description: co.description,
      cost_impact: co.cost_impact,
      schedule_impact_days: co.schedule_impact_days,
      status: co.status,
      approved_at: co.approved_at,
      created_at: co.created_at,
    }))

    // Check warranty active
    const hasActiveWarranty = ["warranty_active"].includes(project.stage)
    const warrantyActivatedAt = hasActiveWarranty
      ? project.stage_entered_at?.toISOString() ?? null
      : null

    return {
      id: project.id,
      project_number: project.project_number,
      name: project.name,
      project_type: project.project_type,
      stage: project.stage,
      stageLabel:
        PROJECT_STAGE_LABELS[project.stage as keyof typeof PROJECT_STAGE_LABELS] ?? project.stage,
      status: project.status,
      progress_pct: calculateProgressFromStage(project.stage),
      estimated_completion_date: project.estimated_completion_date,
      actual_completion_date: project.actual_completion_date,
      phases,
      changeOrders,
      hasActiveWarranty,
      warrantyActivatedAt,
    }
  } catch (err) {
    console.error("[getPortalProjectDetail] Error:", err)
    return { error: err instanceof Error ? err.message : "Failed to load project detail" }
  }
}

// ---------------------------------------------------------------------------
// getPortalProjectFinancials
// ---------------------------------------------------------------------------

/**
 * PROJ-85: Customer financial view.
 * Shows contract amount, payment schedule, payments made, retainage.
 * DOES NOT expose cost breakdown, margin data, or subcontractor payment details.
 */
export async function getPortalProjectFinancials(
  orgId: string,
  customerId: string,
  projectId: string
): Promise<PortalProjectFinancials | { error: string }> {
  try {
    const authorized = await validateCustomerOwnsProject(orgId, customerId, projectId)
    if (!authorized) return { error: "Not authorized" }

    const [project] = await adminDb
      .select({
        contract_amount: projects.contract_amount,
        retainage_pct: projects.retainage_pct,
      })
      .from(projects)
      .where(eq(projects.id, projectId))
      .limit(1)

    if (!project) return { error: "Project not found" }

    // Approved change orders affecting contract amount
    const approvedCOs = await adminDb
      .select({ cost_impact: projectChangeOrders.cost_impact })
      .from(projectChangeOrders)
      .where(
        and(
          eq(projectChangeOrders.project_id, projectId),
          eq(projectChangeOrders.status, "approved"),
          isNull(projectChangeOrders.archived_at)
        )
      )

    const contractAmount = parseFloat(project.contract_amount ?? "0")
    const changeOrderTotal = approvedCOs.reduce(
      (sum, co) => sum + parseFloat(co.cost_impact ?? "0"),
      0
    )
    const currentContract = contractAmount + changeOrderTotal

    // Payment milestones
    const milestoneRows = await adminDb
      .select({
        id: projectPaymentMilestones.id,
        name: projectPaymentMilestones.name,
        amount: projectPaymentMilestones.amount,
        retainage_pct: projectPaymentMilestones.percentage,
        status: projectPaymentMilestones.status,
        due_date: projectPaymentMilestones.due_date,
        invoice_id: projectPaymentMilestones.invoice_id,
        sort_order: projectPaymentMilestones.sort_order,
      })
      .from(projectPaymentMilestones)
      .where(eq(projectPaymentMilestones.project_id, projectId))
      .orderBy(asc(projectPaymentMilestones.sort_order))

    // Get invoice numbers for paid milestones
    const invoiceIds = milestoneRows
      .map((m) => m.invoice_id)
      .filter(Boolean) as string[]
    const invoiceNumbers = new Map<string, string>()
    if (invoiceIds.length > 0) {
      const invRows = await adminDb
        .select({ id: invoices.id, invoice_number: invoices.invoice_number })
        .from(invoices)
        .where(inArray(invoices.id, invoiceIds))
      for (const inv of invRows) {
        if (inv.invoice_number) invoiceNumbers.set(inv.id, inv.invoice_number)
      }
    }

    const payments: PortalPayment[] = milestoneRows.map((m) => ({
      id: m.id,
      name: m.name,
      amount: parseFloat(m.amount ?? "0"),
      retainage_pct: m.retainage_pct ? parseFloat(m.retainage_pct.toString()) : null,
      status: m.status,
      due_date: m.due_date,
      invoice_number: m.invoice_id ? (invoiceNumbers.get(m.invoice_id) ?? null) : null,
    }))

    // Calculate totals
    const totalPaid = payments
      .filter((p) => p.status === "paid")
      .reduce((sum, p) => sum + p.amount, 0)

    // Retainage from project invoices
    const projectInvoices = await adminDb
      .select({
        retainage_held: invoices.retainage_held,
        retainage_released: invoices.retainage_released,
        status: invoices.status,
      })
      .from(invoices)
      .where(
        and(
          eq(invoices.project_id, projectId),
          not(eq(invoices.status, "void"))
        )
      )

    const retainageHeld = projectInvoices.reduce(
      (sum, inv) => sum + parseFloat(inv.retainage_held?.toString() ?? "0"),
      0
    )
    const retainageReleased = projectInvoices.reduce(
      (sum, inv) => sum + parseFloat(inv.retainage_released?.toString() ?? "0"),
      0
    )

    const balanceDue = currentContract - totalPaid

    return {
      contract_amount: Math.round(contractAmount * 100) / 100,
      change_order_total: Math.round(changeOrderTotal * 100) / 100,
      current_contract: Math.round(currentContract * 100) / 100,
      total_paid: Math.round(totalPaid * 100) / 100,
      retainage_held: Math.round(retainageHeld * 100) / 100,
      retainage_released: Math.round(retainageReleased * 100) / 100,
      balance_due: Math.round(balanceDue * 100) / 100,
      payments,
    }
  } catch (err) {
    console.error("[getPortalProjectFinancials] Error:", err)
    return { error: err instanceof Error ? err.message : "Failed to load financials" }
  }
}

// ---------------------------------------------------------------------------
// getPortalPunchList
// ---------------------------------------------------------------------------

/**
 * PROJ-89: Punch list for customer sign-off.
 * Shows items with status and evidence photos.
 */
export async function getPortalPunchList(
  orgId: string,
  customerId: string,
  projectId: string
): Promise<PortalPunchList | { error: string }> {
  try {
    const authorized = await validateCustomerOwnsProject(orgId, customerId, projectId)
    if (!authorized) return { error: "Not authorized" }

    const items = await adminDb
      .select({
        id: projectPunchList.id,
        item_description: projectPunchList.item_description,
        status: projectPunchList.status,
        resolution_notes: projectPunchList.resolution_notes,
        photo_urls: projectPunchList.photo_urls,
        resolved_at: projectPunchList.resolved_at,
        customer_accepted_at: projectPunchList.customer_accepted_at,
      })
      .from(projectPunchList)
      .where(
        and(
          eq(projectPunchList.project_id, projectId),
          eq(projectPunchList.org_id, orgId)
        )
      )
      .orderBy(asc(projectPunchList.created_at))

    const allResolved = items.length > 0 && items.every((i) =>
      ["resolved", "accepted"].includes(i.status)
    )

    // Find sign-off time: earliest customer_accepted_at or project stage_entered_at for complete
    const signedOffAt =
      items.find((i) => i.customer_accepted_at)?.customer_accepted_at ?? null

    // Generate signed URLs for photo_urls (storage paths)
    const punchListItems: PortalPunchListItem[] = await Promise.all(
      items.map(async (item) => {
        const photoPaths = item.photo_urls ?? []
        let signedUrls: string[] = []
        if (photoPaths.length > 0) {
          try {
            const supabaseAdmin = createAdminStorageClient()
            signedUrls = (
              await Promise.all(
                photoPaths.map(async (path) => {
                  try {
                    const { data } = await supabaseAdmin.storage
                      .from("company-assets")
                      .createSignedUrl(path, 3600)
                    return data?.signedUrl ?? null
                  } catch {
                    return null
                  }
                })
              )
            ).filter(Boolean) as string[]
          } catch {
            signedUrls = []
          }
        }
        return {
          id: item.id,
          item_description: item.item_description,
          status: item.status,
          resolution_notes: item.resolution_notes,
          photo_urls: signedUrls,
          resolved_at: item.resolved_at,
          customer_accepted_at: item.customer_accepted_at,
        }
      })
    )

    return {
      projectId,
      items: punchListItems,
      allResolved,
      signedOffAt,
    }
  } catch (err) {
    console.error("[getPortalPunchList] Error:", err)
    return { error: err instanceof Error ? err.message : "Failed to load punch list" }
  }
}

// ---------------------------------------------------------------------------
// sendProjectUpdateNotification
// ---------------------------------------------------------------------------

/**
 * PROJ-86: Send project update notification to customer.
 * updateType: 'phase_started' | 'phase_completed' | 'change_order_pending' |
 *             'inspection_result' | 'punch_list_ready' | 'warranty_activated'
 */
export async function sendProjectUpdateNotification(
  projectId: string,
  updateType: string,
  details?: { phaseName?: string; inspectionResult?: string; changeOrderNumber?: string }
): Promise<{ success: boolean; error?: string }> {
  try {
    const [project] = await adminDb
      .select({
        id: projects.id,
        name: projects.name,
        org_id: projects.org_id,
        customer_id: projects.customer_id,
        project_number: projects.project_number,
      })
      .from(projects)
      .where(eq(projects.id, projectId))
      .limit(1)

    if (!project) return { success: false, error: "Project not found" }

    // Get customer email
    const [customer] = await adminDb
      .select({ email: customers.email, full_name: customers.full_name })
      .from(customers)
      .where(eq(customers.id, project.customer_id))
      .limit(1)

    if (!customer?.email) return { success: true } // No email on file, skip silently

    // Get org info for branding
    const [orgRow] = await adminDb
      .select({ name: orgs.name })
      .from(orgs)
      .where(eq(orgs.id, project.org_id))
      .limit(1)
    const companyName = orgRow?.name ?? "Your Pool Company"

    const resendApiKey = process.env.RESEND_API_KEY
    if (!resendApiKey) return { success: true } // No email configured, skip silently

    // Build notification message
    const projectRef = project.project_number
      ? `${project.project_number} — ${project.name}`
      : project.name

    const notificationMessages: Record<string, { subject: string; body: string }> = {
      phase_started: {
        subject: `Project Update: Work has started — ${projectRef}`,
        body: `Good news! ${details?.phaseName ? `The "${details.phaseName}" phase` : "The next phase"} of your project has started. Log into your portal to view the latest timeline and progress.`,
      },
      phase_completed: {
        subject: `Project Update: Phase complete — ${projectRef}`,
        body: `${details?.phaseName ? `The "${details.phaseName}" phase` : "A project phase"} is now complete. New photos may be available in your portal.`,
      },
      change_order_pending: {
        subject: `Action Required: Change order needs your approval — ${projectRef}`,
        body: `A change order${details?.changeOrderNumber ? ` (${details.changeOrderNumber})` : ""} has been submitted for your project and requires your approval. Please log into your portal to review and approve.`,
      },
      inspection_result: {
        subject: `Inspection Update — ${projectRef}`,
        body: `An inspection for your project has been completed${details?.inspectionResult ? ` with result: ${details.inspectionResult}` : ""}. View details in your portal.`,
      },
      punch_list_ready: {
        subject: `Ready for Final Walkthrough — ${projectRef}`,
        body: `Your project is in the final walkthrough stage! Please review the punch list in your portal and sign off to activate your warranty and release final payment.`,
      },
      warranty_activated: {
        subject: `Warranty Activated — ${projectRef}`,
        body: `Your project is complete and your warranty is now active! You can view your warranty certificate and submit claims through your portal at any time.`,
      },
    }

    const notification = notificationMessages[updateType] ?? {
      subject: `Project Update — ${projectRef}`,
      body: `There's an update on your project. Log into your portal to view the latest information.`,
    }

    const portalUrl = process.env.NEXT_PUBLIC_PORTAL_URL ?? process.env.NEXT_PUBLIC_APP_URL ?? ""
    const projectPortalUrl = `${portalUrl}/portal/projects/${projectId}`

    const isDev = process.env.NODE_ENV === "development"
    const fromAddress = isDev
      ? "DeweyIQ <onboarding@resend.dev>"
      : `${companyName} <notifications@deweyiq.app>`
    const toAddress = isDev ? "delivered@resend.dev" : customer.email

    const resend = new Resend(resendApiKey)
    await resend.emails.send({
      from: fromAddress,
      to: [toAddress],
      subject: notification.subject,
      html: `
        <div style="font-family: system-ui, sans-serif; max-width: 600px; margin: 0 auto; padding: 24px;">
          <p style="font-size: 16px; color: #111;">Hi ${customer.full_name?.split(" ")[0] ?? "there"},</p>
          <p style="font-size: 16px; color: #374151;">${notification.body}</p>
          <div style="margin: 24px 0;">
            <a href="${projectPortalUrl}" style="background: #0ea5e9; color: white; padding: 12px 24px; border-radius: 8px; text-decoration: none; font-weight: 600;">
              View Project Portal
            </a>
          </div>
          <p style="font-size: 14px; color: #6b7280; margin-top: 32px;">
            This notification was sent by ${companyName}.
            <br>Powered by <strong>DeweyIQ</strong>
          </p>
        </div>
      `,
    })

    // Also create an in-app alert for the office (non-blocking, best-effort)
    try {
      await adminDb.insert(alerts).values({
        org_id: project.org_id,
        alert_type: "project_update_sent",
        severity: "info",
        title: `Notification sent: ${updateType.replace(/_/g, " ")}`,
        description: `Sent to ${customer.email} for project ${projectRef}`,
        reference_type: "project",
        reference_id: projectId,
      })
    } catch {
      // Ignore duplicate alert inserts (unique constraint)
    }

    return { success: true }
  } catch (err) {
    console.error("[sendProjectUpdateNotification] Error:", err)
    return { success: false, error: err instanceof Error ? err.message : "Failed to send notification" }
  }
}
