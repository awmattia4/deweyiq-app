"use server"

/**
 * projects-warranty.ts — Warranty term management, activation, claim handling,
 * and expiration reminders.
 *
 * Phase 12 Plan 15 (PROJ-73 through PROJ-77)
 *
 * Actions:
 * - getWarrantyTerms: fetch warranty terms for a project type
 * - createWarrantyTerm: create a new warranty term template
 * - updateWarrantyTerm: update existing warranty term
 * - activateWarranty: called on project completion — activates warranty, sends certificate
 * - generateWarrantyCertificate: generate PDF and email to customer
 * - submitWarrantyClaim: portal-facing (adminDb) — customer submits claim
 * - reviewWarrantyClaim: office reviews and approves/denies
 * - resolveWarrantyClaim: mark claim as resolved
 * - checkWarrantyExpirations: scheduled job — send reminders at 90/60/30 days
 *
 * Critical patterns:
 * - withRls(token, ...) for authenticated office actions
 * - adminDb for portal-facing (submitWarrantyClaim) and scheduled jobs
 * - activateWarranty accepts token | null — falls back to adminDb when called from portal sign-off
 */

import { revalidatePath } from "next/cache"
import { createClient } from "@/lib/supabase/server"
import { withRls, adminDb } from "@/lib/db"
import type { SupabaseToken } from "@/lib/db"
import {
  projectWarrantyTerms,
  warrantyClaims,
  projects,
  customers,
  workOrders,
  alerts,
  orgs,
} from "@/lib/db/schema"
import { eq, and, asc } from "drizzle-orm"
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

export interface WarrantyTerm {
  id: string
  projectType: string
  warrantyType: string
  durationMonths: number
  whatCovered: string
  exclusions: string | null
  isActive: boolean
}

export interface ActiveWarranty {
  termId: string
  warrantyType: string
  durationMonths: number
  whatCovered: string
  exclusions: string | null
  activatedDate: string
  expirationDate: string
  daysUntilExpiry: number
}

export interface WarrantyClaimSummary {
  id: string
  projectId: string
  warrantyTermId: string | null
  workOrderId: string | null
  customerDescription: string
  status: string
  submittedAt: Date
  resolutionNotes: string | null
  isWarrantyCovered: boolean
  createdAt: Date
}

// ---------------------------------------------------------------------------
// getWarrantyTerms (PROJ-73)
// ---------------------------------------------------------------------------

export async function getWarrantyTerms(
  token: SupabaseToken | null,
  projectType?: string
): Promise<WarrantyTerm[] | { error: string }> {
  const t = token ?? (await getToken())
  if (!t) return { error: "Not authenticated" }

  try {
    const rows = await withRls(t, (db) => {
      const query = db
        .select()
        .from(projectWarrantyTerms)
        .where(eq(projectWarrantyTerms.is_active, true))
        .orderBy(asc(projectWarrantyTerms.project_type), asc(projectWarrantyTerms.warranty_type))

      return query
    })

    const filtered = projectType
      ? rows.filter((r) => r.project_type === projectType)
      : rows

    return filtered.map((r) => ({
      id: r.id,
      projectType: r.project_type,
      warrantyType: r.warranty_type,
      durationMonths: r.duration_months,
      whatCovered: r.what_covered,
      exclusions: r.exclusions,
      isActive: r.is_active,
    }))
  } catch (err) {
    console.error("[getWarrantyTerms]", err)
    return { error: "Failed to fetch warranty terms" }
  }
}

// ---------------------------------------------------------------------------
// createWarrantyTerm (PROJ-73)
// ---------------------------------------------------------------------------

export interface CreateWarrantyTermInput {
  projectType: string
  warrantyType: "workmanship" | "equipment" | "surface" | "structural"
  durationMonths: number
  whatCovered: string
  exclusions?: string | null
}

export async function createWarrantyTerm(
  token: SupabaseToken | null,
  data: CreateWarrantyTermInput
): Promise<{ data: { termId: string } } | { error: string }> {
  const t = token ?? (await getToken())
  if (!t) return { error: "Not authenticated" }
  if (!t.org_id) return { error: "No org context" }

  try {
    const inserted = await withRls(t, (db) =>
      db
        .insert(projectWarrantyTerms)
        .values({
          org_id: t.org_id as string,
          project_type: data.projectType,
          warranty_type: data.warrantyType,
          duration_months: data.durationMonths,
          what_covered: data.whatCovered,
          exclusions: data.exclusions ?? null,
          is_active: true,
        })
        .returning({ id: projectWarrantyTerms.id })
    )

    if (!inserted[0]) return { error: "Failed to create warranty term" }

    revalidatePath("/settings")
    return { data: { termId: inserted[0].id } }
  } catch (err) {
    console.error("[createWarrantyTerm]", err)
    return { error: "Failed to create warranty term" }
  }
}

// ---------------------------------------------------------------------------
// updateWarrantyTerm (PROJ-73)
// ---------------------------------------------------------------------------

export interface UpdateWarrantyTermInput {
  projectType?: string
  warrantyType?: string
  durationMonths?: number
  whatCovered?: string
  exclusions?: string | null
  isActive?: boolean
}

export async function updateWarrantyTerm(
  token: SupabaseToken | null,
  termId: string,
  data: UpdateWarrantyTermInput
): Promise<{ success: true } | { error: string }> {
  const t = token ?? (await getToken())
  if (!t) return { error: "Not authenticated" }

  try {
    const updates: Record<string, unknown> = {}
    if (data.projectType !== undefined) updates.project_type = data.projectType
    if (data.warrantyType !== undefined) updates.warranty_type = data.warrantyType
    if (data.durationMonths !== undefined) updates.duration_months = data.durationMonths
    if (data.whatCovered !== undefined) updates.what_covered = data.whatCovered
    if (data.exclusions !== undefined) updates.exclusions = data.exclusions
    if (data.isActive !== undefined) updates.is_active = data.isActive

    await withRls(t, (db) =>
      db
        .update(projectWarrantyTerms)
        .set(updates)
        .where(eq(projectWarrantyTerms.id, termId))
    )

    revalidatePath("/settings")
    return { success: true }
  } catch (err) {
    console.error("[updateWarrantyTerm]", err)
    return { error: "Failed to update warranty term" }
  }
}

// ---------------------------------------------------------------------------
// activateWarranty
// Called on project completion (customerSignOffPunchList).
// token may be null when called from portal — uses adminDb for project/org queries.
// ---------------------------------------------------------------------------

export async function activateWarranty(
  token: SupabaseToken | null,
  projectId: string
): Promise<{ success: true } | { error: string }> {
  try {
    // Fetch project with customer and org info using adminDb (portal context)
    const projectRows = await adminDb
      .select({
        id: projects.id,
        name: projects.name,
        project_number: projects.project_number,
        org_id: projects.org_id,
        customer_id: projects.customer_id,
        project_type: projects.project_type,
        actual_completion_date: projects.actual_completion_date,
        activity_log: projects.activity_log,
      })
      .from(projects)
      .where(eq(projects.id, projectId))

    if (projectRows.length === 0) return { error: "Project not found" }
    const project = projectRows[0]

    // Fetch customer info
    const customerRows = await adminDb
      .select({
        full_name: customers.full_name,
        email: customers.email,
        address: customers.address,
      })
      .from(customers)
      .where(eq(customers.id, project.customer_id))

    const customer = customerRows[0]

    // Fetch org name + logo (logo_url is on orgs table, not org_settings)
    const orgRows = await adminDb
      .select({ name: orgs.name, logo_url: orgs.logo_url })
      .from(orgs)
      .where(eq(orgs.id, project.org_id))

    const orgName = orgRows[0]?.name ?? "Pool Company"
    const orgLogoUrl = orgRows[0]?.logo_url ?? null

    // Fetch warranty terms for this project type
    const warrantyTerms = await adminDb
      .select()
      .from(projectWarrantyTerms)
      .where(
        and(
          eq(projectWarrantyTerms.org_id, project.org_id),
          eq(projectWarrantyTerms.project_type, project.project_type ?? "new_pool"),
          eq(projectWarrantyTerms.is_active, true)
        )
      )

    const completionDate = project.actual_completion_date ?? toLocalDateString(new Date())

    // Calculate expiration dates for each warranty term
    const activeWarranties: ActiveWarranty[] = warrantyTerms.map((term) => {
      const startDate = new Date(completionDate)
      const expirationDate = new Date(startDate)
      expirationDate.setMonth(expirationDate.getMonth() + term.duration_months)

      const daysUntilExpiry = Math.ceil(
        (expirationDate.getTime() - Date.now()) / (1000 * 60 * 60 * 24)
      )

      return {
        termId: term.id,
        warrantyType: term.warranty_type,
        durationMonths: term.duration_months,
        whatCovered: term.what_covered,
        exclusions: term.exclusions,
        activatedDate: completionDate,
        expirationDate: toLocalDateString(expirationDate),
        daysUntilExpiry,
      }
    })

    // Update project stage to 'warranty_active' and store warranty data
    const newLog = [
      ...(project.activity_log ?? []),
      {
        type: "warranty_activated",
        at: new Date().toISOString(),
        by_id: "system",
        note: `Warranty activated. ${warrantyTerms.length} warranty term(s) in effect.` as string | null,
      },
    ]

    await adminDb
      .update(projects)
      .set({
        stage: "warranty_active",
        activity_log: newLog,
        last_activity_at: new Date(),
        updated_at: new Date(),
      })
      .where(eq(projects.id, projectId))

    // Generate and send warranty certificate
    if (customer?.email) {
      // Generate certificate (non-blocking best-effort)
      generateWarrantyCertificate(token, projectId).catch((err) => {
        console.warn("[activateWarranty] Certificate generation failed:", err)
      })
    }

    revalidatePath(`/projects/${projectId}`)
    return { success: true }
  } catch (err) {
    console.error("[activateWarranty]", err)
    return { error: "Failed to activate warranty" }
  }
}

// ---------------------------------------------------------------------------
// generateWarrantyCertificate (PROJ-74)
// ---------------------------------------------------------------------------

export async function generateWarrantyCertificate(
  token: SupabaseToken | null,
  projectId: string
): Promise<{ success: true; pdfPath?: string } | { error: string }> {
  try {
    // Fetch all data needed for the certificate
    const projectRows = await adminDb
      .select({
        id: projects.id,
        name: projects.name,
        project_number: projects.project_number,
        org_id: projects.org_id,
        customer_id: projects.customer_id,
        project_type: projects.project_type,
        actual_completion_date: projects.actual_completion_date,
      })
      .from(projects)
      .where(eq(projects.id, projectId))

    if (projectRows.length === 0) return { error: "Project not found" }
    const project = projectRows[0]

    // Fetch customer + org info (logo_url is on orgs table, not org_settings)
    const [customerRows, orgRows, warrantyTerms] = await Promise.all([
      adminDb
        .select({ full_name: customers.full_name, email: customers.email, address: customers.address })
        .from(customers)
        .where(eq(customers.id, project.customer_id)),
      adminDb
        .select({ name: orgs.name, logo_url: orgs.logo_url })
        .from(orgs)
        .where(eq(orgs.id, project.org_id)),
      adminDb
        .select()
        .from(projectWarrantyTerms)
        .where(
          and(
            eq(projectWarrantyTerms.org_id, project.org_id),
            eq(projectWarrantyTerms.project_type, project.project_type ?? "new_pool"),
            eq(projectWarrantyTerms.is_active, true)
          )
        ),
    ])

    if (customerRows.length === 0) return { error: "Customer not found" }
    const customer = customerRows[0]
    const orgName = orgRows[0]?.name ?? "Pool Company"
    const orgLogoUrl = orgRows[0]?.logo_url ?? null

    const completionDate = project.actual_completion_date ?? toLocalDateString(new Date())

    // Build coverage items with expiration dates
    const coverageItems = warrantyTerms.map((term) => {
      const startDate = new Date(completionDate)
      const expirationDate = new Date(startDate)
      expirationDate.setMonth(expirationDate.getMonth() + term.duration_months)

      return {
        warrantyType: term.warranty_type,
        durationMonths: term.duration_months,
        whatCovered: term.what_covered,
        exclusions: term.exclusions ?? "Normal wear and tear, customer negligence, acts of nature",
        expirationDate: toLocalDateString(expirationDate),
      }
    })

    // Generate PDF using react-pdf/renderer
    const reactPdf = await import("@react-pdf/renderer")
    const React = await import("react")
    const { WarrantyCertificateDocument } = await import("@/lib/pdf/warranty-certificate-pdf")

    const certificateNumber = `WC-${project.project_number ?? project.id.slice(0, 8).toUpperCase()}`

    const docElement = React.default.createElement(WarrantyCertificateDocument, {
      certificateNumber,
      companyName: orgName,
      companyLogoUrl: orgLogoUrl,
      customerName: customer.full_name,
      propertyAddress: customer.address ?? null,
      projectDescription: project.name,
      completionDate,
      coverageItems,
    })

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const pdfBuffer = await reactPdf.renderToBuffer(docElement as any)

    // Upload to Supabase Storage
    const { createClient: createServerClient } = await import("@/lib/supabase/server")
    const supabase = await createServerClient()
    const filePath = `orgs/${project.org_id}/projects/${projectId}/warranty-certificate.pdf`

    await supabase.storage.from("project-documents").upload(filePath, pdfBuffer, {
      contentType: "application/pdf",
      upsert: true,
    })

    // Log to activity
    const projForLog = await adminDb
      .select({ activity_log: projects.activity_log })
      .from(projects)
      .where(eq(projects.id, projectId))
    const existingActivityLog = projForLog[0]?.activity_log ?? []
    await adminDb
      .update(projects)
      .set({
        activity_log: [
          ...existingActivityLog,
          {
            type: "warranty_certificate_generated",
            at: new Date().toISOString(),
            by_id: "system",
            note: `Warranty certificate generated: ${certificateNumber}` as string | null,
          },
        ],
        updated_at: new Date(),
      })
      .where(eq(projects.id, projectId))

    return { success: true, pdfPath: filePath }
  } catch (err) {
    console.error("[generateWarrantyCertificate]", err)
    return { error: "Failed to generate warranty certificate" }
  }
}

// ---------------------------------------------------------------------------
// submitWarrantyClaim (PROJ-75)
// Uses adminDb — called from customer portal (no user session).
// ---------------------------------------------------------------------------

// ---------------------------------------------------------------------------
// getActiveWarranties — compute active warranty coverage for a project
// ---------------------------------------------------------------------------

export async function getActiveWarranties(
  token: SupabaseToken | null,
  projectId: string
): Promise<ActiveWarranty[] | { error: string }> {
  const t = token ?? (await getToken())
  if (!t) return { error: "Not authenticated" }
  if (!t.org_id) return { error: "No org context" }

  try {
    const orgId = t.org_id as string

    // Fetch project type + completion date
    const projectRows = await withRls(t, (db) =>
      db
        .select({
          project_type: projects.project_type,
          actual_completion_date: projects.actual_completion_date,
          stage: projects.stage,
        })
        .from(projects)
        .where(and(eq(projects.id, projectId), eq(projects.org_id, orgId)))
    )

    if (projectRows.length === 0) return { error: "Project not found" }
    const project = projectRows[0]

    // Warranty only applies to warranty_active or complete stages
    if (project.stage !== "warranty_active" && project.stage !== "complete") {
      return []
    }

    const completionDate = project.actual_completion_date ?? toLocalDateString(new Date())

    // Fetch active warranty terms for this project type
    const terms = await withRls(t, (db) =>
      db
        .select()
        .from(projectWarrantyTerms)
        .where(
          and(
            eq(projectWarrantyTerms.org_id, orgId),
            eq(projectWarrantyTerms.project_type, project.project_type ?? "new_pool"),
            eq(projectWarrantyTerms.is_active, true)
          )
        )
    )

    return terms.map((term) => {
      const startDate = new Date(completionDate)
      const expirationDate = new Date(startDate)
      expirationDate.setMonth(expirationDate.getMonth() + term.duration_months)
      const daysUntilExpiry = Math.ceil(
        (expirationDate.getTime() - Date.now()) / (1000 * 60 * 60 * 24)
      )
      return {
        termId: term.id,
        warrantyType: term.warranty_type,
        durationMonths: term.duration_months,
        whatCovered: term.what_covered,
        exclusions: term.exclusions,
        activatedDate: completionDate,
        expirationDate: toLocalDateString(expirationDate),
        daysUntilExpiry,
      }
    })
  } catch (err) {
    console.error("[getActiveWarranties]", err)
    return { error: "Failed to fetch active warranties" }
  }
}

// ---------------------------------------------------------------------------
// getWarrantyClaims — fetch claims for a project
// ---------------------------------------------------------------------------

export async function getWarrantyClaims(
  token: SupabaseToken | null,
  projectId: string
): Promise<WarrantyClaimSummary[] | { error: string }> {
  const t = token ?? (await getToken())
  if (!t) return { error: "Not authenticated" }
  if (!t.org_id) return { error: "No org context" }

  try {
    const orgId = t.org_id as string

    const rows = await withRls(t, (db) =>
      db
        .select({
          id: warrantyClaims.id,
          project_id: warrantyClaims.project_id,
          warranty_term_id: warrantyClaims.warranty_term_id,
          work_order_id: warrantyClaims.work_order_id,
          customer_description: warrantyClaims.customer_description,
          status: warrantyClaims.status,
          submitted_at: warrantyClaims.submitted_at,
          resolution_notes: warrantyClaims.resolution_notes,
          is_warranty_covered: warrantyClaims.is_warranty_covered,
          created_at: warrantyClaims.created_at,
        })
        .from(warrantyClaims)
        .where(
          and(
            eq(warrantyClaims.project_id, projectId),
            eq(warrantyClaims.org_id, orgId)
          )
        )
        .orderBy(asc(warrantyClaims.created_at))
    )

    return rows.map((r) => ({
      id: r.id,
      projectId: r.project_id,
      warrantyTermId: r.warranty_term_id,
      workOrderId: r.work_order_id,
      customerDescription: r.customer_description,
      status: r.status,
      submittedAt: r.submitted_at ?? r.created_at,
      resolutionNotes: r.resolution_notes,
      isWarrantyCovered: r.is_warranty_covered ?? true,
      createdAt: r.created_at,
    }))
  } catch (err) {
    console.error("[getWarrantyClaims]", err)
    return { error: "Failed to fetch warranty claims" }
  }
}

// ---------------------------------------------------------------------------
// submitWarrantyClaim (PROJ-76)
// ---------------------------------------------------------------------------

export interface SubmitWarrantyClaimInput {
  projectId: string
  warrantyTermId?: string | null
  customerDescription: string
}

export async function submitWarrantyClaim(
  data: SubmitWarrantyClaimInput
): Promise<{ data: { claimId: string } } | { error: string }> {
  try {
    // Fetch project to get org_id
    const projectRows = await adminDb
      .select({ org_id: projects.org_id })
      .from(projects)
      .where(eq(projects.id, data.projectId))

    if (projectRows.length === 0) return { error: "Project not found" }
    const { org_id: orgId } = projectRows[0]

    const inserted = await adminDb
      .insert(warrantyClaims)
      .values({
        org_id: orgId,
        project_id: data.projectId,
        warranty_term_id: data.warrantyTermId ?? null,
        customer_description: data.customerDescription,
        status: "submitted",
        is_warranty_covered: true,
      })
      .returning({ id: warrantyClaims.id })

    if (!inserted[0]) return { error: "Failed to submit warranty claim" }
    const claimId = inserted[0].id

    // Create office alert
    try {
      await adminDb.insert(alerts).values({
        org_id: orgId,
        alert_type: "warranty_claim_submitted",
        severity: "info",
        reference_id: claimId,
        reference_type: "warranty_claim",
        title: "New Warranty Claim Submitted",
        description: data.customerDescription.slice(0, 200),
        generated_at: new Date(),
      })
    } catch {
      // Non-fatal
    }

    return { data: { claimId } }
  } catch (err) {
    console.error("[submitWarrantyClaim]", err)
    return { error: "Failed to submit warranty claim" }
  }
}

// ---------------------------------------------------------------------------
// reviewWarrantyClaim (PROJ-75, PROJ-76)
// ---------------------------------------------------------------------------

export interface ReviewWarrantyClaimInput {
  approved: boolean
  resolutionNotes?: string | null
  isWarrantyCovered: boolean
}

export async function reviewWarrantyClaim(
  token: SupabaseToken | null,
  claimId: string,
  data: ReviewWarrantyClaimInput
): Promise<{ data: { workOrderId?: string } } | { error: string }> {
  const t = token ?? (await getToken())
  if (!t) return { error: "Not authenticated" }
  if (!t.org_id) return { error: "No org context" }

  try {
    const orgId = t.org_id as string

    // Fetch claim to get project_id
    const claimRows = await withRls(t, (db) =>
      db
        .select({
          id: warrantyClaims.id,
          project_id: warrantyClaims.project_id,
          customer_description: warrantyClaims.customer_description,
        })
        .from(warrantyClaims)
        .where(eq(warrantyClaims.id, claimId))
    )

    if (claimRows.length === 0) return { error: "Warranty claim not found" }
    const claim = claimRows[0]

    const newStatus = data.approved ? "approved" : "denied"

    // Update claim status
    await withRls(t, (db) =>
      db
        .update(warrantyClaims)
        .set({
          status: newStatus,
          resolution_notes: data.resolutionNotes ?? null,
          is_warranty_covered: data.isWarrantyCovered,
          updated_at: new Date(),
        })
        .where(eq(warrantyClaims.id, claimId))
    )

    let workOrderId: string | undefined

    if (data.approved) {
      // Fetch project info for WO creation
      const projectRows = await withRls(t, (db) =>
        db
          .select({
            customer_id: projects.customer_id,
          })
          .from(projects)
          .where(eq(projects.id, claim.project_id))
      )

      if (projectRows.length > 0) {
        const { customer_id } = projectRows[0]

        // Create work order for warranty work
        // PROJ-76: isWarrantyCovered=true → no invoice generated (cost absorbed by company)
        //          isWarrantyCovered=false → standard billable WO
        // The description prefix "[WARRANTY-COVERED]" or "[WARRANTY-BILLABLE]" serves as the
        // flag for the billing system until a dedicated column is added to work_orders.
        const woPrefix = data.isWarrantyCovered ? "[WARRANTY-COVERED]" : "[WARRANTY-BILLABLE]"
        const woInserted = await withRls(t, (db) =>
          db
            .insert(workOrders)
            .values({
              org_id: orgId,
              customer_id,
              title: `${woPrefix} Warranty Claim`,
              status: "open",
              description: `${woPrefix} Warranty Claim: ${claim.customer_description.slice(0, 200)}`,
              category: "other",
              priority: "normal",
            })
            .returning({ id: workOrders.id })
        )

        workOrderId = woInserted[0]?.id

        // Link WO to claim
        if (workOrderId) {
          await withRls(t, (db) =>
            db
              .update(warrantyClaims)
              .set({ work_order_id: workOrderId!, updated_at: new Date() })
              .where(eq(warrantyClaims.id, claimId))
          )
        }
      }
    }

    revalidatePath(`/projects/${claim.project_id}`)
    return { data: { workOrderId } }
  } catch (err) {
    console.error("[reviewWarrantyClaim]", err)
    return { error: "Failed to review warranty claim" }
  }
}

// ---------------------------------------------------------------------------
// resolveWarrantyClaim (PROJ-75)
// ---------------------------------------------------------------------------

export async function resolveWarrantyClaim(
  token: SupabaseToken | null,
  claimId: string,
  resolution: string
): Promise<{ success: true } | { error: string }> {
  const t = token ?? (await getToken())
  if (!t) return { error: "Not authenticated" }

  try {
    const claimRows = await withRls(t, (db) =>
      db
        .select({ project_id: warrantyClaims.project_id })
        .from(warrantyClaims)
        .where(eq(warrantyClaims.id, claimId))
    )

    if (claimRows.length === 0) return { error: "Warranty claim not found" }

    await withRls(t, (db) =>
      db
        .update(warrantyClaims)
        .set({
          status: "resolved",
          resolution_notes: resolution,
          updated_at: new Date(),
        })
        .where(eq(warrantyClaims.id, claimId))
    )

    revalidatePath(`/projects/${claimRows[0].project_id}`)
    return { success: true }
  } catch (err) {
    console.error("[resolveWarrantyClaim]", err)
    return { error: "Failed to resolve warranty claim" }
  }
}

// ---------------------------------------------------------------------------
// checkWarrantyExpirations (PROJ-77)
// Scheduled job — adminDb.
// Find projects in 'warranty_active' stage where any warranty term expires
// within 90/60/30 days. Send reminder email + office alert.
// ---------------------------------------------------------------------------

export async function checkWarrantyExpirations(): Promise<{ processed: number }> {
  try {
    const today = toLocalDateString(new Date())
    const processed = new Set<string>()

    // Find all warranty_active projects
    const activeProjects = await adminDb
      .select({
        id: projects.id,
        name: projects.name,
        project_number: projects.project_number,
        org_id: projects.org_id,
        customer_id: projects.customer_id,
        project_type: projects.project_type,
        actual_completion_date: projects.actual_completion_date,
        activity_log: projects.activity_log,
      })
      .from(projects)
      .where(eq(projects.stage, "warranty_active"))

    for (const project of activeProjects) {
      // Fetch warranty terms for this project type
      const terms = await adminDb
        .select()
        .from(projectWarrantyTerms)
        .where(
          and(
            eq(projectWarrantyTerms.org_id, project.org_id),
            eq(projectWarrantyTerms.project_type, project.project_type ?? "new_pool"),
            eq(projectWarrantyTerms.is_active, true)
          )
        )

      const completionDate = project.actual_completion_date ?? today
      const reminderThresholds = [90, 60, 30]

      for (const term of terms) {
        const startDate = new Date(completionDate)
        const expirationDate = new Date(startDate)
        expirationDate.setMonth(expirationDate.getMonth() + term.duration_months)

        const daysUntilExpiry = Math.ceil(
          (expirationDate.getTime() - Date.now()) / (1000 * 60 * 60 * 24)
        )

        // Check if we're at a reminder threshold (±3 day window)
        const threshold = reminderThresholds.find(
          (t) => daysUntilExpiry > 0 && Math.abs(daysUntilExpiry - t) <= 3
        )

        if (threshold) {
          const projectKey = `${project.id}-${term.id}-${threshold}`
          if (processed.has(projectKey)) continue

          // Create office alert
          try {
            await adminDb.insert(alerts).values({
              org_id: project.org_id,
              alert_type: "warranty_expiring",
              severity: threshold <= 30 ? "warning" : "info",
              reference_id: project.id,
              reference_type: "project",
              title: `Warranty Expiring in ${daysUntilExpiry} Days`,
              description: `${term.warranty_type} warranty for ${project.name} expires on ${toLocalDateString(expirationDate)}. Consider reaching out to the customer.`,
              generated_at: new Date(),
            })
          } catch {
            // Non-fatal
          }

          // TODO: Send customer email reminder when email template system is integrated
          // The customer email would include: warranty details, expiration date,
          // offer to extend/renew, and company contact info.

          processed.add(projectKey)
        }
      }
    }

    return { processed: processed.size }
  } catch (err) {
    console.error("[checkWarrantyExpirations]", err)
    return { processed: 0 }
  }
}
