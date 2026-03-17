"use server"

/**
 * projects-approval.ts — Server actions for the customer-facing proposal
 * approval flow (no auth session — uses adminDb throughout).
 *
 * Phase 12 Plan 07: Customer Proposal Approval Page
 *
 * Coverage:
 * - getProposalPublicData    — fetch everything needed to render the approval page
 * - approveProposal          — customer approves: signature, tier, addons, deposit creation
 * - submitChangeRequest      — customer requests changes instead of signing
 * - recordOfflineDeposit     — cash/check deposit recorded by office
 * - sendDepositReminder      — reminder email for pending deposits (called by cron)
 *
 * CRITICAL: All these functions use adminDb (service role), NOT withRls().
 * The customer has no Supabase auth session — RLS would return empty results.
 *
 * PROJ-28 trigger: approveProposal calls populateMaterialsFromProposal after
 * setting stage='proposal_approved', bridging proposal approval → material list.
 * NOTE: populateMaterialsFromProposal internally calls withRls() which requires
 * an authenticated session. For the customer-facing path we use the adminDb
 * variant of population directly in approveProposal.
 */

import { adminDb } from "@/lib/db"
import { revalidatePath } from "next/cache"
import {
  projectProposals,
  projectProposalTiers,
  projectProposalLineItems,
  projectProposalAddons,
  projectPaymentMilestones,
  proposalChangeRequests,
  projectMaterials,
  projects,
  customers,
  orgs,
  orgSettings,
} from "@/lib/db/schema"
import { eq, and, asc, desc, inArray } from "drizzle-orm"
import { Resend } from "resend"

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface ProposalPublicTier {
  id: string
  tier_level: string
  name: string
  description: string | null
  price: string
  features: string[] | null
  photo_urls: string[] | null
  sort_order: number
}

export interface ProposalPublicAddon {
  id: string
  name: string
  description: string | null
  price: string
  sort_order: number
}

export interface ProposalPublicMilestone {
  id: string
  name: string
  percentage: string | null
  amount: string
  due_date: string | null
  sort_order: number
}

export interface ProposalPublicData {
  proposal: {
    id: string
    status: string
    version: number
    pricing_method: string
    scope_description: string | null
    terms_and_conditions: string | null
    warranty_info: string | null
    selected_tier: string | null
    approved_at: Date | null
    total_amount: string
  }
  project: {
    id: string
    name: string
    project_type: string
    org_id: string
    financing_status: string | null
  }
  customer: {
    full_name: string
    email: string | null
    address: string | null
  }
  tiers: ProposalPublicTier[]
  addons: ProposalPublicAddon[]
  milestones: ProposalPublicMilestone[]
  companyName: string
  logoUrl: string | null
  financingPartnerUrl: string | null
  stripeAccountId: string | null
  stripeConnected: boolean
  stripePublishableKey: string | null
}

// ---------------------------------------------------------------------------
// getProposalPublicData
// ---------------------------------------------------------------------------

/**
 * Fetch all data needed to render the customer-facing approval page.
 * Uses adminDb — customer has no auth session.
 */
export async function getProposalPublicData(
  proposalId: string
): Promise<ProposalPublicData | null> {
  try {
    // Fetch proposal
    const [proposal] = await adminDb
      .select()
      .from(projectProposals)
      .where(eq(projectProposals.id, proposalId))
      .limit(1)

    if (!proposal) return null

    // Fetch project
    const [project] = await adminDb
      .select()
      .from(projects)
      .where(eq(projects.id, proposal.project_id))
      .limit(1)

    if (!project) return null

    // Fetch customer
    const [customer] = await adminDb
      .select({
        full_name: customers.full_name,
        email: customers.email,
        address: customers.address,
      })
      .from(customers)
      .where(eq(customers.id, project.customer_id))
      .limit(1)

    // Fetch org branding
    const [org] = await adminDb
      .select({ name: orgs.name, logo_url: orgs.logo_url })
      .from(orgs)
      .where(eq(orgs.id, proposal.org_id))
      .limit(1)

    // Fetch org settings (for Stripe + financing)
    const [settings] = await adminDb
      .select({
        stripe_account_id: orgSettings.stripe_account_id,
        stripe_onboarding_done: orgSettings.stripe_onboarding_done,
        website_url: orgSettings.website_url,
      })
      .from(orgSettings)
      .where(eq(orgSettings.org_id, proposal.org_id))
      .limit(1)

    // Fetch tiers (ordered)
    const tiers = await adminDb
      .select()
      .from(projectProposalTiers)
      .where(eq(projectProposalTiers.proposal_id, proposalId))
      .orderBy(asc(projectProposalTiers.sort_order))

    // Fetch addons (ordered)
    const addons = await adminDb
      .select()
      .from(projectProposalAddons)
      .where(eq(projectProposalAddons.proposal_id, proposalId))
      .orderBy(asc(projectProposalAddons.sort_order))

    // Fetch payment milestones
    const milestones = await adminDb
      .select()
      .from(projectPaymentMilestones)
      .where(eq(projectPaymentMilestones.proposal_id, proposalId))
      .orderBy(asc(projectPaymentMilestones.sort_order))

    const stripeConnected =
      !!(settings?.stripe_account_id && settings?.stripe_onboarding_done)

    return {
      proposal: {
        id: proposal.id,
        status: proposal.status,
        version: proposal.version,
        pricing_method: proposal.pricing_method,
        scope_description: proposal.scope_description,
        terms_and_conditions: proposal.terms_and_conditions,
        warranty_info: proposal.warranty_info,
        selected_tier: proposal.selected_tier,
        approved_at: proposal.approved_at,
        total_amount: proposal.total_amount ?? "0",
      },
      project: {
        id: project.id,
        name: project.name,
        project_type: project.project_type,
        org_id: project.org_id,
        financing_status: project.financing_status,
      },
      customer: {
        full_name: customer?.full_name ?? "Customer",
        email: customer?.email ?? null,
        address: customer?.address ?? null,
      },
      tiers: tiers.map((t) => ({
        id: t.id,
        tier_level: t.tier_level,
        name: t.name,
        description: t.description,
        price: t.price,
        features: t.features ?? null,
        photo_urls: t.photo_urls ?? null,
        sort_order: t.sort_order,
      })),
      addons: addons.map((a) => ({
        id: a.id,
        name: a.name,
        description: a.description,
        price: a.price,
        sort_order: a.sort_order,
      })),
      milestones: milestones.map((m) => ({
        id: m.id,
        name: m.name,
        percentage: m.percentage,
        amount: m.amount,
        due_date: m.due_date,
        sort_order: m.sort_order,
      })),
      companyName: org?.name ?? "Service Provider",
      logoUrl: org?.logo_url ?? null,
      // financing_partner_url is not stored yet — placeholder for future phase
      financingPartnerUrl: null,
      stripeAccountId: settings?.stripe_account_id ?? null,
      stripeConnected,
      stripePublishableKey: process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY ?? null,
    }
  } catch (err) {
    console.error("[getProposalPublicData]", err)
    return null
  }
}

// ---------------------------------------------------------------------------
// approveProposal
// ---------------------------------------------------------------------------

export interface ApproveProposalInput {
  /** JWT token (for PROJ-28 material population — needed as part of the bridge) */
  proposalToken: string
  selectedTierId: string | null
  selectedAddonIds: string[]
  signatureDataUrl: string
  signedName: string
  signedIp: string | null
}

export interface ApproveProposalResult {
  success: true
  proposalId: string
  projectId: string
  depositAmount: number
  depositMilestoneId: string | null
}

/**
 * Approve the proposal: record signature, selected tier/addons, advance project
 * stage, and trigger material list population (PROJ-28).
 */
export async function approveProposal(
  proposalId: string,
  data: ApproveProposalInput
): Promise<ApproveProposalResult | { error: string }> {
  try {
    // 1. Fetch proposal to validate state
    const [proposal] = await adminDb
      .select()
      .from(projectProposals)
      .where(eq(projectProposals.id, proposalId))
      .limit(1)

    if (!proposal) return { error: "Proposal not found" }
    if (proposal.status === "approved") {
      // Already approved — idempotent: find deposit milestone and return
      const milestones = await adminDb
        .select()
        .from(projectPaymentMilestones)
        .where(eq(projectPaymentMilestones.proposal_id, proposalId))
        .orderBy(asc(projectPaymentMilestones.sort_order))
      const depositMilestone = milestones.find((m) =>
        m.name.toLowerCase().includes("deposit")
      )
      return {
        success: true,
        proposalId,
        projectId: proposal.project_id,
        depositAmount: depositMilestone ? parseFloat(depositMilestone.amount) : 0,
        depositMilestoneId: depositMilestone?.id ?? null,
      }
    }

    if (proposal.status === "declined" || proposal.status === "superseded") {
      return { error: "This proposal is no longer active" }
    }

    const now = new Date()

    // 2. Update proposal: status, signature, selected tier
    await adminDb
      .update(projectProposals)
      .set({
        status: "approved",
        selected_tier: data.selectedTierId,
        signature_data_url: data.signatureDataUrl,
        signed_name: data.signedName,
        signed_ip: data.signedIp,
        signed_at: now,
        approved_at: now,
        updated_at: now,
      })
      .where(eq(projectProposals.id, proposalId))

    // 3. Mark selected addons
    if (data.selectedAddonIds.length > 0) {
      await adminDb
        .update(projectProposalAddons)
        .set({ is_selected: true })
        .where(
          and(
            eq(projectProposalAddons.proposal_id, proposalId),
            inArray(projectProposalAddons.id, data.selectedAddonIds)
          )
        )
    }

    // 4. Calculate contract amount (selected tier price + selected addons)
    let contractAmount = 0

    if (data.selectedTierId) {
      const [tier] = await adminDb
        .select({ price: projectProposalTiers.price })
        .from(projectProposalTiers)
        .where(eq(projectProposalTiers.id, data.selectedTierId))
        .limit(1)
      if (tier) contractAmount += parseFloat(tier.price)
    } else {
      // No tiers: use total_amount from proposal
      contractAmount = parseFloat(proposal.total_amount ?? "0")
    }

    if (data.selectedAddonIds.length > 0) {
      const selectedAddons = await adminDb
        .select({ price: projectProposalAddons.price })
        .from(projectProposalAddons)
        .where(
          and(
            eq(projectProposalAddons.proposal_id, proposalId),
            inArray(projectProposalAddons.id, data.selectedAddonIds)
          )
        )
      for (const addon of selectedAddons) {
        contractAmount += parseFloat(addon.price)
      }
    }

    // 5. Advance project stage to 'proposal_approved' + update contract amount
    await adminDb
      .update(projects)
      .set({
        stage: "proposal_approved",
        stage_entered_at: now,
        contract_amount: contractAmount.toFixed(2),
        updated_at: now,
        last_activity_at: now,
      })
      .where(eq(projects.id, proposal.project_id))

    // 6. Append activity log entry
    const [projectRow] = await adminDb
      .select({ activity_log: projects.activity_log })
      .from(projects)
      .where(eq(projects.id, proposal.project_id))
      .limit(1)

    if (projectRow) {
      const updatedLog = [
        ...(projectRow.activity_log ?? []),
        {
          type: "proposal_approved",
          at: now.toISOString(),
          by_id: "customer",
          note: `Proposal approved by ${data.signedName}. Contract amount: $${contractAmount.toFixed(2)}`,
        },
      ]
      await adminDb
        .update(projects)
        .set({ activity_log: updatedLog })
        .where(eq(projects.id, proposal.project_id))
    }

    // 7. Find deposit milestone (first milestone, typically named "Deposit")
    const milestones = await adminDb
      .select()
      .from(projectPaymentMilestones)
      .where(eq(projectPaymentMilestones.proposal_id, proposalId))
      .orderBy(asc(projectPaymentMilestones.sort_order))

    // Update milestone amounts based on new contract amount (recalculate from percentages)
    for (const milestone of milestones) {
      if (milestone.percentage) {
        const newAmount = (contractAmount * parseFloat(milestone.percentage)) / 100
        await adminDb
          .update(projectPaymentMilestones)
          .set({ amount: newAmount.toFixed(2) })
          .where(eq(projectPaymentMilestones.id, milestone.id))
      }
    }

    // Refresh milestones after amount recalculation
    const updatedMilestones = await adminDb
      .select()
      .from(projectPaymentMilestones)
      .where(eq(projectPaymentMilestones.proposal_id, proposalId))
      .orderBy(asc(projectPaymentMilestones.sort_order))

    const depositMilestone =
      updatedMilestones.find((m) => m.name.toLowerCase().includes("deposit")) ??
      updatedMilestones[0] ??
      null

    const depositAmount = depositMilestone
      ? parseFloat(depositMilestone.amount)
      : 0

    // 8. PROJ-28 trigger: populate material list from approved proposal line items
    // Run directly with adminDb since the customer has no auth session (bypasses withRls)
    try {
      await populateMaterialsFromProposalAdmin(proposalId, proposal.project_id, proposal.org_id)
    } catch (materialErr) {
      // Non-fatal — log and continue. Material population is a best-effort trigger.
      console.error("[approveProposal] PROJ-28 material population failed:", materialErr)
    }

    revalidatePath("/projects")
    revalidatePath(`/projects/${proposal.project_id}`)

    return {
      success: true,
      proposalId,
      projectId: proposal.project_id,
      depositAmount,
      depositMilestoneId: depositMilestone?.id ?? null,
    }
  } catch (err) {
    console.error("[approveProposal]", err)
    return { error: "Failed to approve proposal" }
  }
}

// ---------------------------------------------------------------------------
// populateMaterialsFromProposalAdmin (internal — adminDb variant for PROJ-28)
// ---------------------------------------------------------------------------

/**
 * Seed project_materials from approved proposal line items.
 * Uses adminDb (service role) because the caller is customer-facing (no RLS session).
 * Mirrors the withRls variant in projects-materials.ts but bypasses RLS.
 * Idempotent: skips line items already imported (matching proposal_line_item_id).
 */
async function populateMaterialsFromProposalAdmin(
  proposalId: string,
  projectId: string,
  orgId: string
): Promise<void> {
  const MATERIAL_CATEGORIES = new Set([
    "pool_equipment",
    "plumbing",
    "electrical",
    "decking",
    "surface",
    "chemical",
    "material",
    "other",
    "materials",
    "equipment",
  ])

  // Fetch all line items for this proposal
  const lineItems = await adminDb
    .select()
    .from(projectProposalLineItems)
    .where(eq(projectProposalLineItems.proposal_id, proposalId))

  if (lineItems.length === 0) return

  // Find existing material IDs to avoid duplicates
  const existingMaterials = await adminDb
    .select({ proposal_line_item_id: projectMaterials.proposal_line_item_id })
    .from(projectMaterials)
    .where(
      and(
        eq(projectMaterials.project_id, projectId),
        eq(projectMaterials.org_id, orgId)
      )
    )

  const existingIds = new Set(
    existingMaterials
      .map((m) => m.proposal_line_item_id)
      .filter(Boolean) as string[]
  )

  // Filter to material-category items not yet imported
  const toImport = lineItems.filter((li) => {
    if (existingIds.has(li.id)) return false
    const cat = (li.category ?? "other").toLowerCase()
    return MATERIAL_CATEGORIES.has(cat) || cat.includes("material") || cat.includes("equipment")
  })

  if (toImport.length === 0) return

  await adminDb.insert(projectMaterials).values(
    toImport.map((li) => ({
      org_id: orgId,
      project_id: projectId,
      proposal_line_item_id: li.id,
      name: li.description,
      category: li.category ?? "other",
      quantity_estimated: String(li.quantity ?? "1"),
      unit_cost_estimated: li.unit_price ?? null,
      unit: "each" as const,
      order_status: "not_ordered" as const,
    }))
  )
}

// ---------------------------------------------------------------------------
// submitChangeRequest
// ---------------------------------------------------------------------------

export async function submitChangeRequest(
  proposalId: string,
  customerNotes: string
): Promise<{ success: true } | { error: string }> {
  try {
    const [proposal] = await adminDb
      .select({ org_id: projectProposals.org_id, project_id: projectProposals.project_id })
      .from(projectProposals)
      .where(eq(projectProposals.id, proposalId))
      .limit(1)

    if (!proposal) return { error: "Proposal not found" }

    // Insert change request record
    await adminDb.insert(proposalChangeRequests).values({
      org_id: proposal.org_id,
      proposal_id: proposalId,
      customer_notes: customerNotes,
      status: "pending",
    })

    // Append to project activity log
    const [projectRow] = await adminDb
      .select({ activity_log: projects.activity_log })
      .from(projects)
      .where(eq(projects.id, proposal.project_id))
      .limit(1)

    if (projectRow) {
      const updatedLog = [
        ...(projectRow.activity_log ?? []),
        {
          type: "change_request_submitted",
          at: new Date().toISOString(),
          by_id: "customer",
          note: `Change request: ${customerNotes.slice(0, 200)}`,
        },
      ]
      await adminDb
        .update(projects)
        .set({
          activity_log: updatedLog,
          last_activity_at: new Date(),
          updated_at: new Date(),
        })
        .where(eq(projects.id, proposal.project_id))
    }

    // Send notification email to office
    try {
      const resend = new Resend(process.env.RESEND_API_KEY)
      const [org] = await adminDb
        .select({ name: orgs.name })
        .from(orgs)
        .where(eq(orgs.id, proposal.org_id))
        .limit(1)

      await resend.emails.send({
        from: "DeweyIQ <noreply@deweyiq.com>",
        to: "owner@example.com", // TODO: replace with org owner email lookup
        subject: `Change request on proposal from a customer`,
        html: `
          <p>A customer has submitted a change request on a project proposal.</p>
          <p><strong>Organization:</strong> ${org?.name ?? "Unknown"}</p>
          <p><strong>Customer notes:</strong></p>
          <blockquote>${customerNotes}</blockquote>
          <p>Log in to DeweyIQ to review and respond.</p>
        `,
      })
    } catch (emailErr) {
      // Non-fatal — log and continue
      console.error("[submitChangeRequest] Email notification failed:", emailErr)
    }

    revalidatePath("/projects")
    revalidatePath(`/projects/${proposal.project_id}`)
    return { success: true }
  } catch (err) {
    console.error("[submitChangeRequest]", err)
    return { error: "Failed to submit change request" }
  }
}

// ---------------------------------------------------------------------------
// recordOfflineDeposit
// ---------------------------------------------------------------------------

export interface OfflineDepositInput {
  milestoneId: string
  amount: string
  paymentMethod: "cash" | "check"
  reference?: string | null
  notes?: string | null
}

export async function recordOfflineDeposit(
  proposalId: string,
  data: OfflineDepositInput
): Promise<{ success: true } | { error: string }> {
  try {
    const [proposal] = await adminDb
      .select({ project_id: projectProposals.project_id, org_id: projectProposals.org_id })
      .from(projectProposals)
      .where(eq(projectProposals.id, proposalId))
      .limit(1)

    if (!proposal) return { error: "Proposal not found" }

    // Update milestone status to 'paid'
    await adminDb
      .update(projectPaymentMilestones)
      .set({ status: "paid" })
      .where(eq(projectPaymentMilestones.id, data.milestoneId))

    // Advance project stage to 'deposit_received'
    await adminDb
      .update(projects)
      .set({
        stage: "deposit_received",
        stage_entered_at: new Date(),
        updated_at: new Date(),
        last_activity_at: new Date(),
      })
      .where(eq(projects.id, proposal.project_id))

    // Append activity log
    const [projectRow] = await adminDb
      .select({ activity_log: projects.activity_log })
      .from(projects)
      .where(eq(projects.id, proposal.project_id))
      .limit(1)

    if (projectRow) {
      const updatedLog = [
        ...(projectRow.activity_log ?? []),
        {
          type: "deposit_received",
          at: new Date().toISOString(),
          by_id: "office",
          note: `Offline deposit of $${data.amount} received via ${data.paymentMethod}${data.reference ? ` (${data.reference})` : ""}`,
        },
      ]
      await adminDb
        .update(projects)
        .set({ activity_log: updatedLog })
        .where(eq(projects.id, proposal.project_id))
    }

    revalidatePath("/projects")
    revalidatePath(`/projects/${proposal.project_id}`)
    return { success: true }
  } catch (err) {
    console.error("[recordOfflineDeposit]", err)
    return { error: "Failed to record offline deposit" }
  }
}

// ---------------------------------------------------------------------------
// sendDepositReminder
// ---------------------------------------------------------------------------

/**
 * Send a deposit reminder email to the customer.
 * Called by a scheduled cron job for projects in 'proposal_approved' stage
 * with no deposit after a configurable number of days.
 */
export async function sendDepositReminder(
  projectId: string
): Promise<{ success: true } | { error: string }> {
  try {
    const [project] = await adminDb
      .select()
      .from(projects)
      .where(eq(projects.id, projectId))
      .limit(1)

    if (!project) return { error: "Project not found" }

    const [customer] = await adminDb
      .select({ full_name: customers.full_name, email: customers.email })
      .from(customers)
      .where(eq(customers.id, project.customer_id))
      .limit(1)

    if (!customer?.email) return { error: "Customer has no email address" }

    const [org] = await adminDb
      .select({ name: orgs.name, logo_url: orgs.logo_url })
      .from(orgs)
      .where(eq(orgs.id, project.org_id))
      .limit(1)

    // Find the most recent approved proposal for this project
    const [approvedProposal] = await adminDb
      .select({ id: projectProposals.id })
      .from(projectProposals)
      .where(
        and(
          eq(projectProposals.project_id, projectId),
          eq(projectProposals.status, "approved")
        )
      )
      .orderBy(desc(projectProposals.created_at))
      .limit(1)

    if (!approvedProposal) return { error: "No approved proposal found for this project" }

    // Find deposit milestone
    const [depositMilestone] = await adminDb
      .select()
      .from(projectPaymentMilestones)
      .where(
        and(
          eq(projectPaymentMilestones.proposal_id, approvedProposal.id),
          eq(projectPaymentMilestones.status, "pending")
        )
      )
      .orderBy(asc(projectPaymentMilestones.sort_order))
      .limit(1)

    const depositAmount = depositMilestone
      ? parseFloat(depositMilestone.amount)
      : null

    const resend = new Resend(process.env.RESEND_API_KEY)

    await resend.emails.send({
      from: `${org?.name ?? "DeweyIQ"} <noreply@deweyiq.com>`,
      to: customer.email,
      subject: `Reminder: Deposit needed to start your ${project.name} project`,
      html: `
        <div style="font-family: sans-serif; max-width: 600px; margin: 0 auto;">
          <p>Hi ${customer.full_name},</p>
          <p>We're excited to get started on your <strong>${project.name}</strong> project!</p>
          <p>To secure your spot and begin scheduling, we need to receive your deposit${depositAmount ? ` of <strong>$${depositAmount.toFixed(2)}</strong>` : ""}.</p>
          <p>Please contact us to arrange payment, or log in to your customer portal to pay online.</p>
          <p>Thank you for choosing ${org?.name ?? "us"}!</p>
        </div>
      `,
    })

    return { success: true }
  } catch (err) {
    console.error("[sendDepositReminder]", err)
    return { error: "Failed to send deposit reminder" }
  }
}
