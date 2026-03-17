"use server"

/**
 * projects-proposals.ts — Server actions for proposal CRUD, tier management,
 * line items, add-ons, payment schedule, and proposal versioning.
 *
 * Phase 12: Projects & Renovations — Plan 05
 *
 * Key patterns:
 * - All mutating actions return fresh state (per MEMORY.md invoicing pattern)
 * - LEFT JOIN for all relational fetches (no correlated subqueries per RLS pitfalls)
 * - Versioning: createNewProposalVersion supersedes current, copies all sub-records
 * - Payment schedule: percentages must sum to 100 (validated server-side)
 */

import { revalidatePath } from "next/cache"
import { createClient } from "@/lib/supabase/server"
import { withRls } from "@/lib/db"
import type { SupabaseToken } from "@/lib/db"
import {
  projects,
  projectProposals,
  projectProposalTiers,
  projectProposalLineItems,
  projectProposalAddons,
  projectPaymentMilestones,
  projectPhases,
  projectSurveys,
  projectTemplates,
} from "@/lib/db/schema"
import { eq, and, asc, desc, inArray, sql } from "drizzle-orm"

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

export interface ProposalTier {
  id: string
  org_id: string
  proposal_id: string
  tier_level: string
  name: string
  description: string | null
  price: string
  features: string[] | null
  photo_urls: string[] | null
  sort_order: number
  created_at: Date
}

export interface ProposalLineItem {
  id: string
  org_id: string
  proposal_id: string
  tier_id: string | null
  category: string
  description: string
  quantity: string
  unit_price: string
  markup_pct: string
  total: string
  sort_order: number
  created_at: Date
}

export interface ProposalAddon {
  id: string
  org_id: string
  proposal_id: string
  name: string
  description: string | null
  price: string
  is_selected: boolean
  sort_order: number
  created_at: Date
}

export interface PaymentMilestone {
  id: string
  org_id: string
  project_id: string
  proposal_id: string | null
  name: string
  trigger_phase_id: string | null
  triggerPhaseName: string | null
  percentage: string | null
  amount: string
  due_date: string | null
  invoice_id: string | null
  status: string
  sort_order: number
  created_at: Date
}

export interface ProposalDetail {
  id: string
  org_id: string
  project_id: string
  version: number
  status: string
  pricing_method: string
  show_line_item_detail: boolean
  scope_description: string | null
  terms_and_conditions: string | null
  warranty_info: string | null
  cancellation_policy: string | null
  selected_tier: string | null
  approved_at: Date | null
  sent_at: Date | null
  total_amount: string | null
  archived_at: Date | null
  created_at: Date
  updated_at: Date
  tiers: ProposalTier[]
  lineItems: ProposalLineItem[]
  addons: ProposalAddon[]
  milestones: PaymentMilestone[]
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Compute line item total: quantity * unit_price * (1 + markup_pct / 100) */
function computeLineItemTotal(
  quantity: string | number,
  unitPrice: string | number,
  markupPct: string | number
): string {
  const q = parseFloat(String(quantity)) || 0
  const p = parseFloat(String(unitPrice)) || 0
  const m = parseFloat(String(markupPct)) || 0
  const total = q * p * (1 + m / 100)
  return total.toFixed(2)
}

/** Recalculate proposal total from tiers + addons. */
async function recalculateProposalTotal(
  token: SupabaseToken,
  proposalId: string
): Promise<string> {
  // Sum selected tier price (or all tier prices if no tier selected) + all addon prices
  // For the builder total: sum all tier prices + sum of all addons
  const tiers = await withRls(token, (db) =>
    db
      .select({ price: projectProposalTiers.price })
      .from(projectProposalTiers)
      .where(eq(projectProposalTiers.proposal_id, proposalId))
  )

  const addons = await withRls(token, (db) =>
    db
      .select({ price: projectProposalAddons.price })
      .from(projectProposalAddons)
      .where(eq(projectProposalAddons.proposal_id, proposalId))
  )

  // Also sum line items (fallback: if no tiers, total from line items)
  const lineItems = await withRls(token, (db) =>
    db
      .select({ total: projectProposalLineItems.total })
      .from(projectProposalLineItems)
      .where(eq(projectProposalLineItems.proposal_id, proposalId))
  )

  const tierTotal = tiers.reduce((sum, t) => sum + (parseFloat(t.price) || 0), 0)
  const addonTotal = addons.reduce((sum, a) => sum + (parseFloat(a.price) || 0), 0)
  const lineItemTotal = lineItems.reduce((sum, li) => sum + (parseFloat(li.total) || 0), 0)

  // If tiers defined, proposal total = max tier + addons (best case basis)
  // For the builder: show aggregate total as max tier price + addons
  const base = tiers.length > 0 ? tierTotal : lineItemTotal
  return (base + addonTotal).toFixed(2)
}

// ---------------------------------------------------------------------------
// createProposal
// ---------------------------------------------------------------------------

export async function createProposal(
  projectId: string
): Promise<{ data: ProposalDetail } | { error: string }> {
  const token = await getToken()
  if (!token) return { error: "Not authenticated" }
  if (!token.org_id) return { error: "No org context" }

  try {
    // Check if there's an existing active proposal (non-superseded)
    const existing = await withRls(token, (db) =>
      db
        .select({ id: projectProposals.id, status: projectProposals.status })
        .from(projectProposals)
        .where(
          and(
            eq(projectProposals.project_id, projectId),
            eq(projectProposals.org_id, token.org_id!)
          )
        )
        .orderBy(desc(projectProposals.version))
        .limit(1)
    )

    const activeProposal = existing.find((p) => p.status !== "superseded")
    if (activeProposal) {
      // Return the existing active proposal
      const detail = await getProposal(activeProposal.id)
      if ("data" in detail) return detail
    }

    // Determine version (next after any existing)
    const maxVersion =
      existing.length > 0
        ? Math.max(...existing.map((p) => 0))
        : 0

    // Check for template tier_config on the project to pre-populate tiers
    const projectRow = await withRls(token, (db) =>
      db
        .select({ template_id: projects.template_id })
        .from(projects)
        .where(eq(projects.id, projectId))
        .limit(1)
    )

    let tierConfig: Record<string, { label: string; features: string[]; markup_pct: number }> | null = null
    if (projectRow[0]?.template_id) {
      const tmpl = await withRls(token, (db) =>
        db
          .select({ tier_config: projectTemplates.tier_config })
          .from(projectTemplates)
          .where(eq(projectTemplates.id, projectRow[0].template_id!))
          .limit(1)
      )
      tierConfig = tmpl[0]?.tier_config ?? null
    }

    // Check for survey data to pre-populate scope
    const surveyRow = await withRls(token, (db) =>
      db
        .select({ notes: projectSurveys.notes, measurements: projectSurveys.measurements })
        .from(projectSurveys)
        .where(eq(projectSurveys.project_id, projectId))
        .orderBy(desc(projectSurveys.created_at))
        .limit(1)
    )
    const surveyNotes = surveyRow[0]?.notes ?? null

    // Create proposal
    const [newProposal] = await withRls(token, (db) =>
      db
        .insert(projectProposals)
        .values({
          org_id: token.org_id!,
          project_id: projectId,
          version: maxVersion + 1,
          status: "draft",
          pricing_method: "lump_sum",
          show_line_item_detail: true,
          scope_description: surveyNotes,
        })
        .returning()
    )

    // Pre-populate tiers from template if available
    if (tierConfig) {
      const tierLevels = ["good", "better", "best"] as const
      for (const [idx, level] of tierLevels.entries()) {
        const cfg = tierConfig[level]
        if (cfg) {
          await withRls(token, (db) =>
            db.insert(projectProposalTiers).values({
              org_id: token.org_id!,
              proposal_id: newProposal.id,
              tier_level: level,
              name: cfg.label,
              description: null,
              price: "0",
              features: cfg.features ?? [],
              sort_order: idx,
            })
          )
        }
      }
    }

    const detail = await getProposal(newProposal.id)
    if ("data" in detail) return detail
    return { error: "Failed to fetch created proposal" }
  } catch (err) {
    console.error("[createProposal]", err)
    return { error: "Failed to create proposal" }
  }
}

// ---------------------------------------------------------------------------
// getProposal
// ---------------------------------------------------------------------------

export async function getProposal(
  proposalId: string
): Promise<{ data: ProposalDetail } | { error: string }> {
  const token = await getToken()
  if (!token) return { error: "Not authenticated" }

  try {
    const proposalRows = await withRls(token, (db) =>
      db
        .select()
        .from(projectProposals)
        .where(eq(projectProposals.id, proposalId))
        .limit(1)
    )

    if (proposalRows.length === 0) return { error: "Proposal not found" }
    const proposal = proposalRows[0]

    // Fetch tiers
    const tiers = await withRls(token, (db) =>
      db
        .select()
        .from(projectProposalTiers)
        .where(eq(projectProposalTiers.proposal_id, proposalId))
        .orderBy(asc(projectProposalTiers.sort_order))
    )

    // Fetch line items
    const lineItems = await withRls(token, (db) =>
      db
        .select()
        .from(projectProposalLineItems)
        .where(eq(projectProposalLineItems.proposal_id, proposalId))
        .orderBy(asc(projectProposalLineItems.sort_order))
    )

    // Fetch addons
    const addons = await withRls(token, (db) =>
      db
        .select()
        .from(projectProposalAddons)
        .where(eq(projectProposalAddons.proposal_id, proposalId))
        .orderBy(asc(projectProposalAddons.sort_order))
    )

    // Fetch milestones with trigger phase names via LEFT JOIN
    const milestoneRows = await withRls(token, (db) =>
      db
        .select({
          id: projectPaymentMilestones.id,
          org_id: projectPaymentMilestones.org_id,
          project_id: projectPaymentMilestones.project_id,
          proposal_id: projectPaymentMilestones.proposal_id,
          name: projectPaymentMilestones.name,
          trigger_phase_id: projectPaymentMilestones.trigger_phase_id,
          triggerPhaseName: projectPhases.name,
          percentage: projectPaymentMilestones.percentage,
          amount: projectPaymentMilestones.amount,
          due_date: projectPaymentMilestones.due_date,
          invoice_id: projectPaymentMilestones.invoice_id,
          status: projectPaymentMilestones.status,
          sort_order: projectPaymentMilestones.sort_order,
          created_at: projectPaymentMilestones.created_at,
        })
        .from(projectPaymentMilestones)
        .leftJoin(projectPhases, eq(projectPaymentMilestones.trigger_phase_id, projectPhases.id))
        .where(eq(projectPaymentMilestones.proposal_id, proposalId))
        .orderBy(asc(projectPaymentMilestones.sort_order))
    )

    const detail: ProposalDetail = {
      id: proposal.id,
      org_id: proposal.org_id,
      project_id: proposal.project_id,
      version: proposal.version,
      status: proposal.status,
      pricing_method: proposal.pricing_method,
      show_line_item_detail: proposal.show_line_item_detail,
      scope_description: proposal.scope_description,
      terms_and_conditions: proposal.terms_and_conditions,
      warranty_info: proposal.warranty_info,
      cancellation_policy: proposal.cancellation_policy,
      selected_tier: proposal.selected_tier,
      approved_at: proposal.approved_at,
      sent_at: proposal.sent_at,
      total_amount: proposal.total_amount,
      archived_at: proposal.archived_at,
      created_at: proposal.created_at,
      updated_at: proposal.updated_at,
      tiers: tiers.map((t) => ({
        id: t.id,
        org_id: t.org_id,
        proposal_id: t.proposal_id,
        tier_level: t.tier_level,
        name: t.name,
        description: t.description,
        price: t.price,
        features: t.features,
        photo_urls: t.photo_urls,
        sort_order: t.sort_order,
        created_at: t.created_at,
      })),
      lineItems: lineItems.map((li) => ({
        id: li.id,
        org_id: li.org_id,
        proposal_id: li.proposal_id,
        tier_id: li.tier_id,
        category: li.category,
        description: li.description,
        quantity: li.quantity,
        unit_price: li.unit_price,
        markup_pct: li.markup_pct,
        total: li.total,
        sort_order: li.sort_order,
        created_at: li.created_at,
      })),
      addons: addons.map((a) => ({
        id: a.id,
        org_id: a.org_id,
        proposal_id: a.proposal_id,
        name: a.name,
        description: a.description,
        price: a.price,
        is_selected: a.is_selected,
        sort_order: a.sort_order,
        created_at: a.created_at,
      })),
      milestones: milestoneRows.map((m) => ({
        id: m.id,
        org_id: m.org_id,
        project_id: m.project_id,
        proposal_id: m.proposal_id,
        name: m.name,
        trigger_phase_id: m.trigger_phase_id,
        triggerPhaseName: m.triggerPhaseName ?? null,
        percentage: m.percentage,
        amount: m.amount,
        due_date: m.due_date,
        invoice_id: m.invoice_id,
        status: m.status,
        sort_order: m.sort_order,
        created_at: m.created_at,
      })),
    }

    return { data: detail }
  } catch (err) {
    console.error("[getProposal]", err)
    return { error: "Failed to load proposal" }
  }
}

// ---------------------------------------------------------------------------
// getProposalForProject
// ---------------------------------------------------------------------------

export async function getProposalForProject(
  projectId: string
): Promise<{ data: ProposalDetail } | { error: string } | null> {
  const token = await getToken()
  if (!token) return { error: "Not authenticated" }

  try {
    // Get the active (non-superseded) proposal for this project
    const rows = await withRls(token, (db) =>
      db
        .select({ id: projectProposals.id })
        .from(projectProposals)
        .where(
          and(
            eq(projectProposals.project_id, projectId),
            eq(projectProposals.org_id, token.org_id!)
          )
        )
        .orderBy(desc(projectProposals.version))
    )

    const active = rows.find((r) => {
      // We need the status — re-query
      return true
    })

    if (rows.length === 0) return null

    // Get the latest non-superseded proposal
    const allProposals = await withRls(token, (db) =>
      db
        .select({ id: projectProposals.id, status: projectProposals.status })
        .from(projectProposals)
        .where(
          and(
            eq(projectProposals.project_id, projectId),
            eq(projectProposals.org_id, token.org_id!)
          )
        )
        .orderBy(desc(projectProposals.version))
    )

    const activeProposal = allProposals.find((p) => p.status !== "superseded")
    if (!activeProposal) {
      // All superseded — return latest
      const latest = allProposals[0]
      if (!latest) return null
      return getProposal(latest.id)
    }

    return getProposal(activeProposal.id)
  } catch (err) {
    console.error("[getProposalForProject]", err)
    return { error: "Failed to load proposal" }
  }
}

// ---------------------------------------------------------------------------
// updateProposal
// ---------------------------------------------------------------------------

export interface UpdateProposalInput {
  scope_description?: string | null
  terms_and_conditions?: string | null
  warranty_info?: string | null
  cancellation_policy?: string | null
  pricing_method?: string
  show_line_item_detail?: boolean
}

export async function updateProposal(
  proposalId: string,
  data: UpdateProposalInput
): Promise<{ data: ProposalDetail } | { error: string }> {
  const token = await getToken()
  if (!token) return { error: "Not authenticated" }

  try {
    const totalAmount = await recalculateProposalTotal(token, proposalId)

    await withRls(token, (db) =>
      db
        .update(projectProposals)
        .set({
          ...data,
          total_amount: totalAmount,
          updated_at: new Date(),
        })
        .where(eq(projectProposals.id, proposalId))
    )

    const detail = await getProposal(proposalId)
    if ("data" in detail) {
      revalidatePath(`/projects/${detail.data.project_id}/proposal`)
      return detail
    }
    return detail
  } catch (err) {
    console.error("[updateProposal]", err)
    return { error: "Failed to update proposal" }
  }
}

// ---------------------------------------------------------------------------
// Tier management
// ---------------------------------------------------------------------------

export interface CreateTierInput {
  tier_level: "good" | "better" | "best"
  name: string
  description?: string | null
  price: string | number
  features?: string[]
  photo_urls?: string[]
}

export async function createProposalTier(
  proposalId: string,
  data: CreateTierInput
): Promise<{ data: ProposalDetail } | { error: string }> {
  const token = await getToken()
  if (!token) return { error: "Not authenticated" }
  if (!token.org_id) return { error: "No org context" }

  try {
    // Determine sort_order (count existing tiers)
    const existing = await withRls(token, (db) =>
      db
        .select({ id: projectProposalTiers.id })
        .from(projectProposalTiers)
        .where(eq(projectProposalTiers.proposal_id, proposalId))
    )

    const sortOrder = {
      good: 0,
      better: 1,
      best: 2,
    }[data.tier_level] ?? existing.length

    await withRls(token, (db) =>
      db.insert(projectProposalTiers).values({
        org_id: token.org_id!,
        proposal_id: proposalId,
        tier_level: data.tier_level,
        name: data.name,
        description: data.description ?? null,
        price: String(data.price),
        features: data.features ?? [],
        photo_urls: data.photo_urls ?? [],
        sort_order: sortOrder,
      })
    )

    // Recalculate total
    const totalAmount = await recalculateProposalTotal(token, proposalId)
    await withRls(token, (db) =>
      db
        .update(projectProposals)
        .set({ total_amount: totalAmount, updated_at: new Date() })
        .where(eq(projectProposals.id, proposalId))
    )

    return getProposal(proposalId)
  } catch (err) {
    console.error("[createProposalTier]", err)
    return { error: "Failed to create tier" }
  }
}

export interface UpdateTierInput {
  name?: string
  description?: string | null
  price?: string | number
  features?: string[]
  photo_urls?: string[]
}

export async function updateProposalTier(
  tierId: string,
  proposalId: string,
  data: UpdateTierInput
): Promise<{ data: ProposalDetail } | { error: string }> {
  const token = await getToken()
  if (!token) return { error: "Not authenticated" }

  try {
    await withRls(token, (db) =>
      db
        .update(projectProposalTiers)
        .set({
          ...(data.name !== undefined && { name: data.name }),
          ...(data.description !== undefined && { description: data.description }),
          ...(data.price !== undefined && { price: String(data.price) }),
          ...(data.features !== undefined && { features: data.features }),
          ...(data.photo_urls !== undefined && { photo_urls: data.photo_urls }),
        })
        .where(eq(projectProposalTiers.id, tierId))
    )

    // Recalculate total
    const totalAmount = await recalculateProposalTotal(token, proposalId)
    await withRls(token, (db) =>
      db
        .update(projectProposals)
        .set({ total_amount: totalAmount, updated_at: new Date() })
        .where(eq(projectProposals.id, proposalId))
    )

    return getProposal(proposalId)
  } catch (err) {
    console.error("[updateProposalTier]", err)
    return { error: "Failed to update tier" }
  }
}

export async function deleteProposalTier(
  tierId: string,
  proposalId: string
): Promise<{ data: ProposalDetail } | { error: string }> {
  const token = await getToken()
  if (!token) return { error: "Not authenticated" }

  try {
    await withRls(token, (db) =>
      db
        .delete(projectProposalTiers)
        .where(eq(projectProposalTiers.id, tierId))
    )

    // Recalculate total
    const totalAmount = await recalculateProposalTotal(token, proposalId)
    await withRls(token, (db) =>
      db
        .update(projectProposals)
        .set({ total_amount: totalAmount, updated_at: new Date() })
        .where(eq(projectProposals.id, proposalId))
    )

    return getProposal(proposalId)
  } catch (err) {
    console.error("[deleteProposalTier]", err)
    return { error: "Failed to delete tier" }
  }
}

// ---------------------------------------------------------------------------
// Line items
// ---------------------------------------------------------------------------

export interface AddLineItemInput {
  category: string
  description: string
  quantity: string | number
  unit_price: string | number
  markup_pct?: string | number
  tier_id?: string | null
}

export async function addProposalLineItem(
  proposalId: string,
  data: AddLineItemInput
): Promise<{ data: ProposalDetail } | { error: string }> {
  const token = await getToken()
  if (!token) return { error: "Not authenticated" }
  if (!token.org_id) return { error: "No org context" }

  try {
    const existing = await withRls(token, (db) =>
      db
        .select({ id: projectProposalLineItems.id })
        .from(projectProposalLineItems)
        .where(eq(projectProposalLineItems.proposal_id, proposalId))
    )

    const total = computeLineItemTotal(data.quantity, data.unit_price, data.markup_pct ?? 0)

    await withRls(token, (db) =>
      db.insert(projectProposalLineItems).values({
        org_id: token.org_id!,
        proposal_id: proposalId,
        tier_id: data.tier_id ?? null,
        category: data.category,
        description: data.description,
        quantity: String(data.quantity),
        unit_price: String(data.unit_price),
        markup_pct: String(data.markup_pct ?? 0),
        total,
        sort_order: existing.length,
      })
    )

    // Recalculate proposal total
    const totalAmount = await recalculateProposalTotal(token, proposalId)
    await withRls(token, (db) =>
      db
        .update(projectProposals)
        .set({ total_amount: totalAmount, updated_at: new Date() })
        .where(eq(projectProposals.id, proposalId))
    )

    return getProposal(proposalId)
  } catch (err) {
    console.error("[addProposalLineItem]", err)
    return { error: "Failed to add line item" }
  }
}

export interface UpdateLineItemInput {
  category?: string
  description?: string
  quantity?: string | number
  unit_price?: string | number
  markup_pct?: string | number
  tier_id?: string | null
}

export async function updateProposalLineItem(
  itemId: string,
  proposalId: string,
  data: UpdateLineItemInput
): Promise<{ data: ProposalDetail } | { error: string }> {
  const token = await getToken()
  if (!token) return { error: "Not authenticated" }

  try {
    // Fetch existing to compute total
    const [existing] = await withRls(token, (db) =>
      db
        .select()
        .from(projectProposalLineItems)
        .where(eq(projectProposalLineItems.id, itemId))
        .limit(1)
    )

    if (!existing) return { error: "Line item not found" }

    const newQty = data.quantity !== undefined ? data.quantity : existing.quantity
    const newPrice = data.unit_price !== undefined ? data.unit_price : existing.unit_price
    const newMarkup = data.markup_pct !== undefined ? data.markup_pct : existing.markup_pct
    const total = computeLineItemTotal(newQty, newPrice, newMarkup)

    await withRls(token, (db) =>
      db
        .update(projectProposalLineItems)
        .set({
          ...(data.category !== undefined && { category: data.category }),
          ...(data.description !== undefined && { description: data.description }),
          ...(data.quantity !== undefined && { quantity: String(data.quantity) }),
          ...(data.unit_price !== undefined && { unit_price: String(data.unit_price) }),
          ...(data.markup_pct !== undefined && { markup_pct: String(data.markup_pct) }),
          ...(data.tier_id !== undefined && { tier_id: data.tier_id }),
          total,
        })
        .where(eq(projectProposalLineItems.id, itemId))
    )

    // Recalculate proposal total
    const totalAmount = await recalculateProposalTotal(token, proposalId)
    await withRls(token, (db) =>
      db
        .update(projectProposals)
        .set({ total_amount: totalAmount, updated_at: new Date() })
        .where(eq(projectProposals.id, proposalId))
    )

    return getProposal(proposalId)
  } catch (err) {
    console.error("[updateProposalLineItem]", err)
    return { error: "Failed to update line item" }
  }
}

export async function removeProposalLineItem(
  itemId: string,
  proposalId: string
): Promise<{ data: ProposalDetail } | { error: string }> {
  const token = await getToken()
  if (!token) return { error: "Not authenticated" }

  try {
    await withRls(token, (db) =>
      db
        .delete(projectProposalLineItems)
        .where(eq(projectProposalLineItems.id, itemId))
    )

    // Recalculate proposal total
    const totalAmount = await recalculateProposalTotal(token, proposalId)
    await withRls(token, (db) =>
      db
        .update(projectProposals)
        .set({ total_amount: totalAmount, updated_at: new Date() })
        .where(eq(projectProposals.id, proposalId))
    )

    return getProposal(proposalId)
  } catch (err) {
    console.error("[removeProposalLineItem]", err)
    return { error: "Failed to remove line item" }
  }
}

// ---------------------------------------------------------------------------
// Add-ons
// ---------------------------------------------------------------------------

export interface AddAddonInput {
  name: string
  description?: string | null
  price: string | number
}

export async function addProposalAddon(
  proposalId: string,
  data: AddAddonInput
): Promise<{ data: ProposalDetail } | { error: string }> {
  const token = await getToken()
  if (!token) return { error: "Not authenticated" }
  if (!token.org_id) return { error: "No org context" }

  try {
    const existing = await withRls(token, (db) =>
      db
        .select({ id: projectProposalAddons.id })
        .from(projectProposalAddons)
        .where(eq(projectProposalAddons.proposal_id, proposalId))
    )

    await withRls(token, (db) =>
      db.insert(projectProposalAddons).values({
        org_id: token.org_id!,
        proposal_id: proposalId,
        name: data.name,
        description: data.description ?? null,
        price: String(data.price),
        sort_order: existing.length,
      })
    )

    // Recalculate total
    const totalAmount = await recalculateProposalTotal(token, proposalId)
    await withRls(token, (db) =>
      db
        .update(projectProposals)
        .set({ total_amount: totalAmount, updated_at: new Date() })
        .where(eq(projectProposals.id, proposalId))
    )

    return getProposal(proposalId)
  } catch (err) {
    console.error("[addProposalAddon]", err)
    return { error: "Failed to add add-on" }
  }
}

export interface UpdateAddonInput {
  name?: string
  description?: string | null
  price?: string | number
}

export async function updateProposalAddon(
  addonId: string,
  proposalId: string,
  data: UpdateAddonInput
): Promise<{ data: ProposalDetail } | { error: string }> {
  const token = await getToken()
  if (!token) return { error: "Not authenticated" }

  try {
    await withRls(token, (db) =>
      db
        .update(projectProposalAddons)
        .set({
          ...(data.name !== undefined && { name: data.name }),
          ...(data.description !== undefined && { description: data.description }),
          ...(data.price !== undefined && { price: String(data.price) }),
        })
        .where(eq(projectProposalAddons.id, addonId))
    )

    // Recalculate total
    const totalAmount = await recalculateProposalTotal(token, proposalId)
    await withRls(token, (db) =>
      db
        .update(projectProposals)
        .set({ total_amount: totalAmount, updated_at: new Date() })
        .where(eq(projectProposals.id, proposalId))
    )

    return getProposal(proposalId)
  } catch (err) {
    console.error("[updateProposalAddon]", err)
    return { error: "Failed to update add-on" }
  }
}

export async function removeProposalAddon(
  addonId: string,
  proposalId: string
): Promise<{ data: ProposalDetail } | { error: string }> {
  const token = await getToken()
  if (!token) return { error: "Not authenticated" }

  try {
    await withRls(token, (db) =>
      db
        .delete(projectProposalAddons)
        .where(eq(projectProposalAddons.id, addonId))
    )

    // Recalculate total
    const totalAmount = await recalculateProposalTotal(token, proposalId)
    await withRls(token, (db) =>
      db
        .update(projectProposals)
        .set({ total_amount: totalAmount, updated_at: new Date() })
        .where(eq(projectProposals.id, proposalId))
    )

    return getProposal(proposalId)
  } catch (err) {
    console.error("[removeProposalAddon]", err)
    return { error: "Failed to remove add-on" }
  }
}

// ---------------------------------------------------------------------------
// Payment schedule
// ---------------------------------------------------------------------------

export interface MilestoneInput {
  id?: string
  name: string
  trigger_phase_id?: string | null
  percentage?: string | number | null
  amount?: string | number
  due_date?: string | null
  sort_order: number
}

export async function setPaymentSchedule(
  proposalId: string,
  projectId: string,
  milestones: MilestoneInput[]
): Promise<{ data: ProposalDetail } | { error: string }> {
  const token = await getToken()
  if (!token) return { error: "Not authenticated" }
  if (!token.org_id) return { error: "No org context" }

  try {
    // Validate percentages sum to 100 if all are provided
    const allHavePercentages = milestones.every((m) => m.percentage != null)
    if (allHavePercentages && milestones.length > 0) {
      const total = milestones.reduce((sum, m) => sum + (parseFloat(String(m.percentage ?? 0)) || 0), 0)
      if (Math.abs(total - 100) > 0.01) {
        return { error: `Payment schedule percentages must sum to 100%. Current total: ${total.toFixed(1)}%` }
      }
    }

    // Delete existing milestones for this proposal
    await withRls(token, (db) =>
      db
        .delete(projectPaymentMilestones)
        .where(
          and(
            eq(projectPaymentMilestones.proposal_id, proposalId),
            eq(projectPaymentMilestones.org_id, token.org_id!)
          )
        )
    )

    // Get proposal total for amount calculation
    const [proposalRow] = await withRls(token, (db) =>
      db
        .select({ total_amount: projectProposals.total_amount })
        .from(projectProposals)
        .where(eq(projectProposals.id, proposalId))
        .limit(1)
    )
    const contractTotal = parseFloat(proposalRow?.total_amount ?? "0") || 0

    // Insert new milestones
    if (milestones.length > 0) {
      await withRls(token, (db) =>
        db.insert(projectPaymentMilestones).values(
          milestones.map((m) => {
            const pct = m.percentage != null ? parseFloat(String(m.percentage)) : null
            const amount =
              m.amount !== undefined
                ? String(m.amount)
                : pct != null
                  ? ((contractTotal * pct) / 100).toFixed(2)
                  : "0"
            return {
              org_id: token.org_id!,
              project_id: projectId,
              proposal_id: proposalId,
              name: m.name,
              trigger_phase_id: m.trigger_phase_id ?? null,
              percentage: pct != null ? String(pct) : null,
              amount,
              due_date: m.due_date ?? null,
              status: "pending" as const,
              sort_order: m.sort_order,
            }
          })
        )
      )
    }

    return getProposal(proposalId)
  } catch (err) {
    console.error("[setPaymentSchedule]", err)
    return { error: "Failed to set payment schedule" }
  }
}

export async function getDefaultPaymentSchedule(
  projectId: string
): Promise<MilestoneInput[] | null> {
  const token = await getToken()
  if (!token) return null

  try {
    const [projectRow] = await withRls(token, (db) =>
      db
        .select({ template_id: projects.template_id })
        .from(projects)
        .where(eq(projects.id, projectId))
        .limit(1)
    )

    if (!projectRow?.template_id) return null

    const [tmpl] = await withRls(token, (db) =>
      db
        .select({ default_payment_schedule: projectTemplates.default_payment_schedule })
        .from(projectTemplates)
        .where(eq(projectTemplates.id, projectRow.template_id!))
        .limit(1)
    )

    if (!tmpl?.default_payment_schedule) return null

    return tmpl.default_payment_schedule.map((m, idx) => ({
      name: m.name,
      trigger_phase_id: null,
      percentage: m.percentage,
      amount: "0",
      sort_order: idx,
    }))
  } catch (err) {
    console.error("[getDefaultPaymentSchedule]", err)
    return null
  }
}

// ---------------------------------------------------------------------------
// Versioning (PROJ-16)
// ---------------------------------------------------------------------------

export async function createNewProposalVersion(
  proposalId: string
): Promise<{ data: ProposalDetail } | { error: string }> {
  const token = await getToken()
  if (!token) return { error: "Not authenticated" }
  if (!token.org_id) return { error: "No org context" }

  try {
    // Fetch current proposal
    const [current] = await withRls(token, (db) =>
      db
        .select()
        .from(projectProposals)
        .where(eq(projectProposals.id, proposalId))
        .limit(1)
    )

    if (!current) return { error: "Proposal not found" }

    // Supersede the current proposal
    await withRls(token, (db) =>
      db
        .update(projectProposals)
        .set({ status: "superseded", updated_at: new Date() })
        .where(eq(projectProposals.id, proposalId))
    )

    // Create new proposal as draft with version + 1
    const [newProposal] = await withRls(token, (db) =>
      db
        .insert(projectProposals)
        .values({
          org_id: current.org_id,
          project_id: current.project_id,
          version: current.version + 1,
          status: "draft",
          pricing_method: current.pricing_method,
          show_line_item_detail: current.show_line_item_detail,
          scope_description: current.scope_description,
          terms_and_conditions: current.terms_and_conditions,
          warranty_info: current.warranty_info,
          cancellation_policy: current.cancellation_policy,
          total_amount: current.total_amount,
        })
        .returning()
    )

    // Copy tiers
    const tiers = await withRls(token, (db) =>
      db
        .select()
        .from(projectProposalTiers)
        .where(eq(projectProposalTiers.proposal_id, proposalId))
    )

    const tierIdMap: Record<string, string> = {}

    for (const tier of tiers) {
      const [newTier] = await withRls(token, (db) =>
        db
          .insert(projectProposalTiers)
          .values({
            org_id: tier.org_id,
            proposal_id: newProposal.id,
            tier_level: tier.tier_level,
            name: tier.name,
            description: tier.description,
            price: tier.price,
            features: tier.features,
            photo_urls: tier.photo_urls,
            sort_order: tier.sort_order,
          })
          .returning({ id: projectProposalTiers.id })
      )
      tierIdMap[tier.id] = newTier.id
    }

    // Copy line items (remap tier_id to new tier IDs)
    const lineItems = await withRls(token, (db) =>
      db
        .select()
        .from(projectProposalLineItems)
        .where(eq(projectProposalLineItems.proposal_id, proposalId))
    )

    if (lineItems.length > 0) {
      await withRls(token, (db) =>
        db.insert(projectProposalLineItems).values(
          lineItems.map((li) => ({
            org_id: li.org_id,
            proposal_id: newProposal.id,
            tier_id: li.tier_id ? (tierIdMap[li.tier_id] ?? null) : null,
            category: li.category,
            description: li.description,
            quantity: li.quantity,
            unit_price: li.unit_price,
            markup_pct: li.markup_pct,
            total: li.total,
            sort_order: li.sort_order,
          }))
        )
      )
    }

    // Copy add-ons
    const addons = await withRls(token, (db) =>
      db
        .select()
        .from(projectProposalAddons)
        .where(eq(projectProposalAddons.proposal_id, proposalId))
    )

    if (addons.length > 0) {
      await withRls(token, (db) =>
        db.insert(projectProposalAddons).values(
          addons.map((a) => ({
            org_id: a.org_id,
            proposal_id: newProposal.id,
            name: a.name,
            description: a.description,
            price: a.price,
            is_selected: false,
            sort_order: a.sort_order,
          }))
        )
      )
    }

    // Copy milestones
    const milestones = await withRls(token, (db) =>
      db
        .select()
        .from(projectPaymentMilestones)
        .where(eq(projectPaymentMilestones.proposal_id, proposalId))
    )

    if (milestones.length > 0) {
      await withRls(token, (db) =>
        db.insert(projectPaymentMilestones).values(
          milestones.map((m) => ({
            org_id: m.org_id,
            project_id: m.project_id,
            proposal_id: newProposal.id,
            name: m.name,
            trigger_phase_id: m.trigger_phase_id,
            percentage: m.percentage,
            amount: m.amount,
            due_date: m.due_date,
            status: "pending" as const,
            sort_order: m.sort_order,
          }))
        )
      )
    }

    revalidatePath(`/projects/${current.project_id}/proposal`)

    return getProposal(newProposal.id)
  } catch (err) {
    console.error("[createNewProposalVersion]", err)
    return { error: "Failed to create new proposal version" }
  }
}
