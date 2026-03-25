"use server"

/**
 * agreements.ts — Service Agreement CRUD and Template CRUD server actions.
 *
 * Phase 14: Service Agreements & Contracts
 *
 * Patterns follow src/actions/quotes.ts exactly:
 * - withRls(token, ...) for all user-facing queries
 * - adminDb for atomic sequence increments (RLS on org_settings restricts to owner;
 *   adminDb lets office staff create agreements too)
 * - { success, data?, error? } return pattern
 * - "use server" directive + getRlsToken() for auth
 */

import { revalidatePath } from "next/cache"
import { withRls, getRlsToken, adminDb } from "@/lib/db"
import {
  serviceAgreements,
  agreementPoolEntries,
  agreementAmendments,
  agreementTemplates,
  orgSettings,
  customers,
} from "@/lib/db/schema"
import { eq, and, desc, inArray, sql, count } from "drizzle-orm"

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface AgreementPoolEntryInput {
  pool_id: string
  frequency: string
  custom_interval_days?: number | null
  preferred_day_of_week?: number | null
  pricing_model: string
  monthly_amount?: string | null
  per_visit_amount?: string | null
  tiered_threshold_visits?: number | null
  tiered_base_amount?: string | null
  tiered_overage_amount?: string | null
  checklist_task_ids?: string[]
  notes?: string | null
}

export interface CreateAgreementInput {
  customer_id: string
  term_type: string
  start_date?: string | null
  end_date?: string | null
  auto_renew?: boolean
  template_id?: string | null
  terms_and_conditions?: string | null
  cancellation_policy?: string | null
  liability_waiver?: string | null
  internal_notes?: string | null
  pool_entries: AgreementPoolEntryInput[]
}

export interface UpdateAgreementInput {
  term_type?: string
  start_date?: string | null
  end_date?: string | null
  auto_renew?: boolean
  template_id?: string | null
  terms_and_conditions?: string | null
  cancellation_policy?: string | null
  liability_waiver?: string | null
  internal_notes?: string | null
  // Pool entries may be replaced on update
  pool_entries?: AgreementPoolEntryInput[]
}

export interface AgreementFilters {
  status?: string | string[]
  customer_id?: string
  search?: string
}


export interface AgreementTemplateInput {
  name: string
  default_term_type?: string | null
  default_frequency?: string | null
  default_pricing_model?: string | null
  default_monthly_amount?: string | null
  terms_and_conditions?: string | null
  cancellation_policy?: string | null
  liability_waiver?: string | null
  service_description?: string | null
  is_active?: boolean
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function logEntry(actor: string, action: string, note?: string) {
  return { action, actor, at: new Date().toISOString(), ...(note ? { note } : {}) }
}

// ---------------------------------------------------------------------------
// createAgreement
// ---------------------------------------------------------------------------

/**
 * Creates a new draft service agreement with pool entries.
 *
 * Auto-generates agreement_number from org_settings (e.g. "SA-0001").
 * Atomically increments next_agreement_number via adminDb to allow office
 * staff (not just owners) to create agreements.
 *
 * Returns { success: true, data: { id, agreement_number } } or { success: false, error }.
 */
export async function createAgreement(
  input: CreateAgreementInput
): Promise<{ success: boolean; data?: { id: string; agreement_number: string }; error?: string }> {
  const token = await getRlsToken()
  if (!token) return { success: false, error: "Not authenticated" }

  const orgId = token.org_id as string
  const userId = token.sub
  const userRole = token.user_role as string | undefined

  if (!userRole || !["owner", "office"].includes(userRole)) {
    return { success: false, error: "Insufficient permissions" }
  }

  if (!input.pool_entries || input.pool_entries.length === 0) {
    return { success: false, error: "At least one pool entry is required" }
  }

  try {
    // ── 1. Atomic increment via adminDb ────────────────────────────────────
    // Same pattern as createQuote — owner RLS blocks office users on org_settings,
    // so we use adminDb for the number sequence increment.
    const incrementedRows = await adminDb
      .update(orgSettings)
      .set({
        next_agreement_number: sql`next_agreement_number + 1`,
        updated_at: new Date(),
      })
      .where(eq(orgSettings.org_id, orgId))
      .returning({ next_agreement_number: orgSettings.next_agreement_number, agreement_number_prefix: orgSettings.agreement_number_prefix })

    // After increment, returned value is N+1. Assigned number is N.
    const assignedNum = (incrementedRows[0]?.next_agreement_number ?? 2) - 1
    const prefix = incrementedRows[0]?.agreement_number_prefix ?? "SA"
    const agreementNumber = `${prefix}-${String(assignedNum).padStart(4, "0")}`

    // ── 2. Create agreement + pool entries in withRls transaction ──────────
    const result = await withRls(token, async (db) => {
      // Insert the master agreement row
      const [newAgreement] = await db
        .insert(serviceAgreements)
        .values({
          org_id: orgId,
          customer_id: input.customer_id,
          agreement_number: agreementNumber,
          status: "draft",
          term_type: input.term_type,
          start_date: input.start_date ?? null,
          end_date: input.end_date ?? null,
          auto_renew: input.auto_renew ?? true,
          template_id: input.template_id ?? null,
          terms_and_conditions: input.terms_and_conditions ?? null,
          cancellation_policy: input.cancellation_policy ?? null,
          liability_waiver: input.liability_waiver ?? null,
          internal_notes: input.internal_notes ?? null,
          version: 1,
          activity_log: sql`${JSON.stringify([logEntry(userId, "created", `Agreement ${agreementNumber} created`)])}::jsonb`,
          created_at: new Date(),
          updated_at: new Date(),
        })
        .returning({ id: serviceAgreements.id })

      if (!newAgreement) {
        throw new Error("Failed to insert service agreement")
      }

      // Insert all pool entries
      if (input.pool_entries.length > 0) {
        await db.insert(agreementPoolEntries).values(
          input.pool_entries.map((entry) => ({
            agreement_id: newAgreement.id,
            pool_id: entry.pool_id,
            frequency: entry.frequency,
            custom_interval_days: entry.custom_interval_days ?? null,
            preferred_day_of_week: entry.preferred_day_of_week ?? null,
            pricing_model: entry.pricing_model,
            monthly_amount: entry.monthly_amount ?? null,
            per_visit_amount: entry.per_visit_amount ?? null,
            tiered_threshold_visits: entry.tiered_threshold_visits ?? null,
            tiered_base_amount: entry.tiered_base_amount ?? null,
            tiered_overage_amount: entry.tiered_overage_amount ?? null,
            checklist_task_ids: sql`${JSON.stringify(entry.checklist_task_ids ?? [])}::jsonb`,
            notes: entry.notes ?? null,
          }))
        )
      }

      return { id: newAgreement.id, agreement_number: agreementNumber }
    })

    revalidatePath("/settings")
    revalidatePath(`/customers/${input.customer_id}`)

    return { success: true, data: result }
  } catch (err) {
    console.error("[createAgreement]", err)
    return { success: false, error: "Failed to create agreement" }
  }
}

// ---------------------------------------------------------------------------
// getAgreements
// ---------------------------------------------------------------------------

/**
 * Returns all agreements for the org, with customer and pool entry data.
 *
 * Accepts optional filters: status, customer_id, search (matches agreement_number).
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function getAgreements(filters?: AgreementFilters): Promise<{
  success: boolean
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  data?: any[]
  error?: string
}> {
  const token = await getRlsToken()
  if (!token) return { success: false, error: "Not authenticated" }

  try {
    const data = await withRls(token, async (db) => {
      // Build query with customer and pool entries joins
      const rows = await db.query.serviceAgreements.findMany({
        with: {
          customer: {
            columns: {
              id: true,
              full_name: true,
              email: true,
            },
          },
          poolEntries: {
            columns: {
              id: true,
              pool_id: true,
              frequency: true,
              pricing_model: true,
              monthly_amount: true,
              per_visit_amount: true,
            },
          },
        },
        orderBy: [desc(serviceAgreements.created_at)],
      })

      // Apply optional filters in-memory (simple filtering over small org dataset)
      return rows.filter((row) => {
        if (filters?.customer_id && row.customer_id !== filters.customer_id) return false
        if (filters?.status) {
          const statuses = Array.isArray(filters.status) ? filters.status : [filters.status]
          if (!statuses.includes(row.status)) return false
        }
        if (filters?.search) {
          const search = filters.search.toLowerCase()
          if (!row.agreement_number.toLowerCase().includes(search)) return false
        }
        return true
      })
    })

    return { success: true, data }
  } catch (err) {
    console.error("[getAgreements]", err)
    return { success: false, error: "Failed to load agreements" }
  }
}

// ---------------------------------------------------------------------------
// getAgreement
// ---------------------------------------------------------------------------

/**
 * Returns a single agreement with all relations:
 * customer, poolEntries (with pool), amendments, template.
 */
export async function getAgreement(id: string): Promise<{
  success: boolean
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  data?: any
  error?: string
}> {
  const token = await getRlsToken()
  if (!token) return { success: false, error: "Not authenticated" }

  try {
    const data = await withRls(token, async (db) => {
      return await db.query.serviceAgreements.findFirst({
        where: eq(serviceAgreements.id, id),
        with: {
          customer: {
            columns: {
              id: true,
              full_name: true,
              email: true,
              phone: true,
            },
          },
          poolEntries: {
            with: {
              pool: {
                columns: {
                  id: true,
                  name: true,
                },
              },
            },
          },
          amendments: {
            columns: {
              id: true,
              version_number: true,
              amendment_type: true,
              change_summary: true,
              status: true,
              signed_at: true,
              rejected_at: true,
              created_at: true,
            },
            orderBy: [desc(agreementAmendments.version_number)],
          },
          template: {
            columns: {
              id: true,
              name: true,
            },
          },
        },
      })
    })

    if (!data) return { success: false, error: "Agreement not found" }
    return { success: true, data }
  } catch (err) {
    console.error("[getAgreement]", err)
    return { success: false, error: "Failed to load agreement" }
  }
}

// ---------------------------------------------------------------------------
// updateAgreement
// ---------------------------------------------------------------------------

/**
 * Updates agreement fields.
 *
 * IMPORTANT: Does NOT allow updating if status is 'active'.
 * Active agreements require the amendment flow instead.
 *
 * If pool_entries are provided, replaces all existing entries atomically.
 */
export async function updateAgreement(
  id: string,
  data: UpdateAgreementInput
): Promise<{ success: boolean; error?: string }> {
  const token = await getRlsToken()
  if (!token) return { success: false, error: "Not authenticated" }

  const userId = token.sub
  const userRole = token.user_role as string | undefined

  if (!userRole || !["owner", "office"].includes(userRole)) {
    return { success: false, error: "Insufficient permissions" }
  }

  try {
    const result = await withRls(token, async (db) => {
      // Fetch current agreement to check status
      const existing = await db.query.serviceAgreements.findFirst({
        where: eq(serviceAgreements.id, id),
        columns: { id: true, status: true, customer_id: true, activity_log: true },
      })

      if (!existing) return { success: false, error: "Agreement not found" }
      if (existing.status === "active") {
        return { success: false, error: "Cannot update an active agreement. Use the amendment flow." }
      }

      // Build update payload
      const existingLog = (existing.activity_log as Array<{ action: string; actor: string; at: string; note?: string }>) ?? []
      const newLog = [...existingLog, logEntry(userId, "updated")]

      const updateFields: Record<string, unknown> = {
        updated_at: new Date(),
        activity_log: sql`${JSON.stringify(newLog)}::jsonb`,
      }

      if (data.term_type !== undefined) updateFields.term_type = data.term_type
      if (data.start_date !== undefined) updateFields.start_date = data.start_date
      if (data.end_date !== undefined) updateFields.end_date = data.end_date
      if (data.auto_renew !== undefined) updateFields.auto_renew = data.auto_renew
      if (data.template_id !== undefined) updateFields.template_id = data.template_id
      if (data.terms_and_conditions !== undefined) updateFields.terms_and_conditions = data.terms_and_conditions
      if (data.cancellation_policy !== undefined) updateFields.cancellation_policy = data.cancellation_policy
      if (data.liability_waiver !== undefined) updateFields.liability_waiver = data.liability_waiver
      if (data.internal_notes !== undefined) updateFields.internal_notes = data.internal_notes

      await db
        .update(serviceAgreements)
        .set(updateFields)
        .where(eq(serviceAgreements.id, id))

      // Replace pool entries if provided
      if (data.pool_entries !== undefined) {
        await db
          .delete(agreementPoolEntries)
          .where(eq(agreementPoolEntries.agreement_id, id))

        if (data.pool_entries.length > 0) {
          await db.insert(agreementPoolEntries).values(
            data.pool_entries.map((entry) => ({
              agreement_id: id,
              pool_id: entry.pool_id,
              frequency: entry.frequency,
              custom_interval_days: entry.custom_interval_days ?? null,
              preferred_day_of_week: entry.preferred_day_of_week ?? null,
              pricing_model: entry.pricing_model,
              monthly_amount: entry.monthly_amount ?? null,
              per_visit_amount: entry.per_visit_amount ?? null,
              tiered_threshold_visits: entry.tiered_threshold_visits ?? null,
              tiered_base_amount: entry.tiered_base_amount ?? null,
              tiered_overage_amount: entry.tiered_overage_amount ?? null,
              checklist_task_ids: sql`${JSON.stringify(entry.checklist_task_ids ?? [])}::jsonb`,
              notes: entry.notes ?? null,
            }))
          )
        }
      }

      revalidatePath("/settings")
      revalidatePath(`/customers/${existing.customer_id}`)

      return { success: true }
    })

    return result
  } catch (err) {
    console.error("[updateAgreement]", err)
    return { success: false, error: "Failed to update agreement" }
  }
}

// ---------------------------------------------------------------------------
// deleteAgreement
// ---------------------------------------------------------------------------

/**
 * Deletes a draft agreement.
 * Only draft status agreements can be deleted.
 */
export async function deleteAgreement(id: string): Promise<{ success: boolean; error?: string }> {
  const token = await getRlsToken()
  if (!token) return { success: false, error: "Not authenticated" }

  const userRole = token.user_role as string | undefined
  if (userRole !== "owner") {
    return { success: false, error: "Only owners can delete agreements" }
  }

  try {
    const result = await withRls(token, async (db) => {
      const existing = await db.query.serviceAgreements.findFirst({
        where: eq(serviceAgreements.id, id),
        columns: { id: true, status: true, customer_id: true },
      })

      if (!existing) return { success: false, error: "Agreement not found" }
      if (existing.status !== "draft") {
        return { success: false, error: "Only draft agreements can be deleted" }
      }

      await db.delete(serviceAgreements).where(eq(serviceAgreements.id, id))

      revalidatePath("/settings")
      revalidatePath(`/customers/${existing.customer_id}`)

      return { success: true }
    })

    return result
  } catch (err) {
    console.error("[deleteAgreement]", err)
    return { success: false, error: "Failed to delete agreement" }
  }
}

// ---------------------------------------------------------------------------
// sendAgreement
// ---------------------------------------------------------------------------

/**
 * Transitions agreement from draft to sent status.
 *
 * Sets status='sent' and sent_at. Called by Plan 03 (email delivery) after
 * building the email — this action handles the status transition + activity log.
 */
export async function sendAgreement(id: string): Promise<{ success: boolean; error?: string }> {
  const token = await getRlsToken()
  if (!token) return { success: false, error: "Not authenticated" }

  const userId = token.sub
  const userRole = token.user_role as string | undefined

  if (!userRole || !["owner", "office"].includes(userRole)) {
    return { success: false, error: "Insufficient permissions" }
  }

  try {
    const result = await withRls(token, async (db) => {
      const existing = await db.query.serviceAgreements.findFirst({
        where: eq(serviceAgreements.id, id),
        columns: { id: true, status: true, customer_id: true, activity_log: true },
      })

      if (!existing) return { success: false, error: "Agreement not found" }
      if (!["draft", "declined"].includes(existing.status)) {
        return { success: false, error: `Agreement cannot be sent from status: ${existing.status}` }
      }

      const existingLog = (existing.activity_log as Array<{ action: string; actor: string; at: string; note?: string }>) ?? []
      const newLog = [...existingLog, logEntry(userId, "sent")]

      await db
        .update(serviceAgreements)
        .set({
          status: "sent",
          sent_at: new Date(),
          activity_log: sql`${JSON.stringify(newLog)}::jsonb`,
          updated_at: new Date(),
        })
        .where(eq(serviceAgreements.id, id))

      revalidatePath(`/customers/${existing.customer_id}`)

      return { success: true }
    })

    return result
  } catch (err) {
    console.error("[sendAgreement]", err)
    return { success: false, error: "Failed to send agreement" }
  }
}

// ---------------------------------------------------------------------------
// Agreement Template CRUD
// ---------------------------------------------------------------------------

/**
 * Returns all active templates for the org, sorted by name.
 */
export async function getAgreementTemplates(): Promise<{
  success: boolean
  data?: Array<{
    id: string
    org_id: string
    name: string
    default_term_type: string | null
    default_frequency: string | null
    default_pricing_model: string | null
    default_monthly_amount: string | null
    terms_and_conditions: string | null
    cancellation_policy: string | null
    liability_waiver: string | null
    service_description: string | null
    is_active: boolean
    created_at: Date
    updated_at: Date
  }>
  error?: string
}> {
  const token = await getRlsToken()
  if (!token) return { success: false, error: "Not authenticated" }

  try {
    const data = await withRls(token, async (db) => {
      return await db.query.agreementTemplates.findMany({
        orderBy: [agreementTemplates.name],
      })
    })

    return { success: true, data }
  } catch (err) {
    console.error("[getAgreementTemplates]", err)
    return { success: false, error: "Failed to load templates" }
  }
}

/**
 * Creates a new agreement template.
 */
export async function createAgreementTemplate(
  input: AgreementTemplateInput
): Promise<{ success: boolean; data?: { id: string }; error?: string }> {
  const token = await getRlsToken()
  if (!token) return { success: false, error: "Not authenticated" }

  const orgId = token.org_id as string
  const userRole = token.user_role as string | undefined

  if (!userRole || !["owner", "office"].includes(userRole)) {
    return { success: false, error: "Insufficient permissions" }
  }

  try {
    const data = await withRls(token, async (db) => {
      const [newTemplate] = await db
        .insert(agreementTemplates)
        .values({
          org_id: orgId,
          name: input.name,
          default_term_type: input.default_term_type ?? null,
          default_frequency: input.default_frequency ?? null,
          default_pricing_model: input.default_pricing_model ?? null,
          default_monthly_amount: input.default_monthly_amount ?? null,
          terms_and_conditions: input.terms_and_conditions ?? null,
          cancellation_policy: input.cancellation_policy ?? null,
          liability_waiver: input.liability_waiver ?? null,
          service_description: input.service_description ?? null,
          is_active: input.is_active ?? true,
          created_at: new Date(),
          updated_at: new Date(),
        })
        .returning({ id: agreementTemplates.id })

      return newTemplate
    })

    revalidatePath("/settings")
    return { success: true, data }
  } catch (err) {
    console.error("[createAgreementTemplate]", err)
    return { success: false, error: "Failed to create template" }
  }
}

/**
 * Updates an agreement template.
 */
export async function updateAgreementTemplate(
  id: string,
  input: Partial<AgreementTemplateInput>
): Promise<{ success: boolean; error?: string }> {
  const token = await getRlsToken()
  if (!token) return { success: false, error: "Not authenticated" }

  const userRole = token.user_role as string | undefined
  if (!userRole || !["owner", "office"].includes(userRole)) {
    return { success: false, error: "Insufficient permissions" }
  }

  try {
    await withRls(token, async (db) => {
      const updateFields: Record<string, unknown> = { updated_at: new Date() }

      if (input.name !== undefined) updateFields.name = input.name
      if (input.default_term_type !== undefined) updateFields.default_term_type = input.default_term_type
      if (input.default_frequency !== undefined) updateFields.default_frequency = input.default_frequency
      if (input.default_pricing_model !== undefined) updateFields.default_pricing_model = input.default_pricing_model
      if (input.default_monthly_amount !== undefined) updateFields.default_monthly_amount = input.default_monthly_amount
      if (input.terms_and_conditions !== undefined) updateFields.terms_and_conditions = input.terms_and_conditions
      if (input.cancellation_policy !== undefined) updateFields.cancellation_policy = input.cancellation_policy
      if (input.liability_waiver !== undefined) updateFields.liability_waiver = input.liability_waiver
      if (input.service_description !== undefined) updateFields.service_description = input.service_description
      if (input.is_active !== undefined) updateFields.is_active = input.is_active

      await db
        .update(agreementTemplates)
        .set(updateFields)
        .where(eq(agreementTemplates.id, id))
    })

    revalidatePath("/settings")
    return { success: true }
  } catch (err) {
    console.error("[updateAgreementTemplate]", err)
    return { success: false, error: "Failed to update template" }
  }
}

/**
 * Deletes an agreement template.
 *
 * Safety check: template cannot be deleted if referenced by active agreements.
 */
export async function deleteAgreementTemplate(
  id: string
): Promise<{ success: boolean; error?: string }> {
  const token = await getRlsToken()
  if (!token) return { success: false, error: "Not authenticated" }

  const userRole = token.user_role as string | undefined
  if (userRole !== "owner") {
    return { success: false, error: "Only owners can delete templates" }
  }

  try {
    const result = await withRls(token, async (db) => {
      // Check for active agreements referencing this template
      const activeAgreements = await db
        .select({ id: serviceAgreements.id })
        .from(serviceAgreements)
        .where(
          and(
            eq(serviceAgreements.template_id, id),
            inArray(serviceAgreements.status, ["active", "sent", "paused"])
          )
        )
        .limit(1)

      if (activeAgreements.length > 0) {
        return {
          success: false,
          error: "Cannot delete: template is referenced by active or sent agreements",
        }
      }

      await db.delete(agreementTemplates).where(eq(agreementTemplates.id, id))

      revalidatePath("/settings")
      return { success: true }
    })

    return result
  } catch (err) {
    console.error("[deleteAgreementTemplate]", err)
    return { success: false, error: "Failed to delete template" }
  }
}
