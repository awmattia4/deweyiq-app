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
  orgs,
  pools,
  scheduleRules,
  profiles,
  routeStops,
  invoices,
} from "@/lib/db/schema"
import { eq, and, desc, inArray, sql, count, lte, isNotNull } from "drizzle-orm"
import { createElement } from "react"
import { renderToBuffer } from "@react-pdf/renderer"
import { render as renderEmail } from "@react-email/render"
import { Resend } from "resend"
import { signAgreementToken } from "@/lib/agreements/agreement-token"
import { AgreementDocument } from "@/lib/pdf/agreement-pdf"
import type { AgreementDocumentProps, AgreementPoolEntryPdfData } from "@/lib/pdf/agreement-pdf"
import { AgreementEmail } from "@/lib/emails/agreement-email"
import { AgreementAmendmentEmail } from "@/lib/emails/agreement-amendment-email"
import { AgreementRenewalEmail } from "@/lib/emails/agreement-renewal-email"
import { toLocalDateString } from "@/lib/date-utils"

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
                  type: true,
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
 * Sends a service agreement to the customer via email with PDF attachment.
 *
 * Full delivery pipeline:
 * 1. Fetch agreement with all relations (customer, pool entries with pool data)
 * 2. Validate sendability (draft or declined status only)
 * 3. Generate PDF buffer via renderToBuffer(<AgreementDocument />)
 * 4. Sign 180-day JWT via signAgreementToken
 * 5. Generate approval URL: /agreement/{token}
 * 6. Render email HTML via @react-email/render
 * 7. Send via Resend SDK with PDF attachment
 * 8. Update agreement: status='sent', sent_at=now, append activity_log
 * 9. Return success
 */
export async function sendAgreement(id: string): Promise<{
  success: boolean
  data?: { agreementId: string; status: string }
  error?: string
}> {
  const token = await getRlsToken()
  if (!token) return { success: false, error: "Not authenticated" }

  const orgId = token.org_id as string
  const userId = token.sub
  const userRole = token.user_role as string | undefined

  if (!userRole || !["owner", "office"].includes(userRole)) {
    return { success: false, error: "Insufficient permissions" }
  }

  try {
    // ── 1. Fetch agreement + customer + pool entries via adminDb ─────────
    const agreementRows = await adminDb
      .select()
      .from(serviceAgreements)
      .where(and(eq(serviceAgreements.id, id), eq(serviceAgreements.org_id, orgId)))
      .limit(1)

    const agreement = agreementRows[0]
    if (!agreement) return { success: false, error: "Agreement not found" }

    if (!["draft", "declined"].includes(agreement.status)) {
      return {
        success: false,
        error: `Agreement cannot be sent from status: ${agreement.status}`,
      }
    }

    const customerRows = await adminDb
      .select({
        id: customers.id,
        full_name: customers.full_name,
        email: customers.email,
        phone: customers.phone,
        address: customers.address,
      })
      .from(customers)
      .where(eq(customers.id, agreement.customer_id))
      .limit(1)

    const customer = customerRows[0]
    if (!customer) return { success: false, error: "Customer not found" }
    if (!customer.email) {
      return { success: false, error: "Customer has no email address on file" }
    }

    // ── Fetch org branding ───────────────────────────────────────────────
    const orgRows = await adminDb
      .select({ name: orgs.name, logo_url: orgs.logo_url })
      .from(orgs)
      .where(eq(orgs.id, orgId))
      .limit(1)

    const org = orgRows[0]
    const companyName = org?.name ?? "Pool Company"
    const companyLogoUrl = org?.logo_url ?? null

    // ── Fetch pool entries with pool data ─────────────────────────────────
    const entryRows = await adminDb
      .select({
        pool_id: agreementPoolEntries.pool_id,
        frequency: agreementPoolEntries.frequency,
        preferred_day_of_week: agreementPoolEntries.preferred_day_of_week,
        pricing_model: agreementPoolEntries.pricing_model,
        monthly_amount: agreementPoolEntries.monthly_amount,
        per_visit_amount: agreementPoolEntries.per_visit_amount,
        tiered_threshold_visits: agreementPoolEntries.tiered_threshold_visits,
        tiered_base_amount: agreementPoolEntries.tiered_base_amount,
        tiered_overage_amount: agreementPoolEntries.tiered_overage_amount,
        notes: agreementPoolEntries.notes,
        pool_name: pools.name,
        pool_type: pools.type,
      })
      .from(agreementPoolEntries)
      .innerJoin(pools, eq(pools.id, agreementPoolEntries.pool_id))
      .where(eq(agreementPoolEntries.agreement_id, id))

    const pdfPoolEntries: AgreementPoolEntryPdfData[] = entryRows.map((row) => ({
      poolId: row.pool_id,
      poolName: row.pool_name,
      poolType: row.pool_type ?? "pool",
      frequency: row.frequency,
      preferredDayOfWeek: row.preferred_day_of_week,
      pricingModel: row.pricing_model,
      monthlyAmount: row.monthly_amount,
      perVisitAmount: row.per_visit_amount,
      tieredThresholdVisits: row.tiered_threshold_visits,
      tieredBaseAmount: row.tiered_base_amount,
      tieredOverageAmount: row.tiered_overage_amount,
      notes: row.notes,
    }))

    // ── 3. Generate PDF buffer ─────────────────────────────────────────────
    const createdDate = (agreement.created_at ?? new Date()).toLocaleDateString(
      "en-US",
      { year: "numeric", month: "long", day: "numeric" }
    )

    const documentProps: AgreementDocumentProps = {
      agreementNumber: agreement.agreement_number,
      createdDate,
      termType: agreement.term_type,
      startDate: agreement.start_date,
      endDate: agreement.end_date,
      autoRenew: agreement.auto_renew,
      companyName,
      companyLogoUrl,
      customerName: customer.full_name,
      customerEmail: customer.email,
      customerPhone: customer.phone,
      serviceAddress: customer.address ?? null,
      poolEntries: pdfPoolEntries,
      termsAndConditions: agreement.terms_and_conditions ?? null,
      cancellationPolicy: agreement.cancellation_policy ?? null,
      liabilityWaiver: agreement.liability_waiver ?? null,
    }

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const pdfBuffer = await renderToBuffer(
      createElement(AgreementDocument, documentProps) as any
    )

    // ── 4. Sign approval token + build URLs ───────────────────────────────
    const approvalToken = await signAgreementToken(id)
    const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? "https://app.poolco.app"
    const approvalUrl = `${appUrl}/agreement/${approvalToken}`
    // PDF link uses the same token — the public agreement page can proxy the PDF
    // For now link to the authenticated route (customer will be on the page anyway)
    const pdfUrl = `${appUrl}/api/agreements/${id}/pdf`

    // ── 5. Calculate total monthly cost for email summary ─────────────────
    function calcMonthlyCost(entry: AgreementPoolEntryPdfData): number {
      switch (entry.pricingModel) {
        case "monthly_flat":
          return parseFloat(entry.monthlyAmount ?? "0")
        case "per_visit": {
          const rate = parseFloat(entry.perVisitAmount ?? "0")
          const visitsPerMonth =
            entry.frequency === "weekly"
              ? 4
              : entry.frequency === "biweekly"
                ? 2
                : 1
          return rate * visitsPerMonth
        }
        case "tiered": {
          const threshold = entry.tieredThresholdVisits ?? 4
          const base = parseFloat(entry.tieredBaseAmount ?? "0")
          return base * threshold
        }
        default:
          return 0
      }
    }

    const totalMonthly = pdfPoolEntries.reduce(
      (sum, entry) => sum + calcMonthlyCost(entry),
      0
    )
    const totalMonthlyCost =
      totalMonthly > 0
        ? new Intl.NumberFormat("en-US", {
            style: "currency",
            currency: "USD",
          }).format(totalMonthly) + "/mo"
        : ""

    function formatTermType(termType: string): string {
      switch (termType) {
        case "month_to_month":
          return "Month-to-Month"
        case "6_month":
          return "6 Months"
        case "12_month":
          return "12 Months"
        default:
          return termType
      }
    }

    // ── 6. Render email HTML ──────────────────────────────────────────────
    const emailHtml = await renderEmail(
      createElement(AgreementEmail, {
        companyName,
        customerName: customer.full_name,
        agreementNumber: agreement.agreement_number,
        termType: formatTermType(agreement.term_type),
        startDate: agreement.start_date ?? "Upon signing",
        totalMonthlyCost,
        poolCount: pdfPoolEntries.length,
        approvalUrl,
        pdfUrl,
      })
    )

    // ── 7. Send via Resend SDK ────────────────────────────────────────────
    const resendApiKey = process.env.RESEND_API_KEY
    const isDev = process.env.NODE_ENV === "development"

    if (!resendApiKey) {
      if (isDev) {
        console.log("\n--- [DEV] Agreement Email ------------------------------------")
        console.log(`To: ${customer.email}`)
        console.log(`Subject: Service Agreement ${agreement.agreement_number} from ${companyName}`)
        console.log(`Approval URL: ${approvalUrl}`)
        console.log(`PDF: ${pdfBuffer.byteLength} bytes`)
        console.log("--------------------------------------------------------------\n")
      } else {
        return { success: false, error: "RESEND_API_KEY not configured" }
      }
    } else {
      const resend = new Resend(resendApiKey)

      const fromAddress = isDev
        ? "DeweyIQ Dev <onboarding@resend.dev>"
        : `${companyName} <agreements@poolco.app>`

      const { error: resendError } = await resend.emails.send({
        from: fromAddress,
        to: isDev ? ["delivered@resend.dev"] : [customer.email],
        subject: `Service Agreement ${agreement.agreement_number} from ${companyName}`,
        html: emailHtml,
        attachments: [
          {
            filename: `Agreement-${agreement.agreement_number}.pdf`,
            content: Buffer.from(pdfBuffer).toString("base64"),
          },
        ],
      })

      if (resendError) {
        console.error("[sendAgreement] Resend error:", resendError)
        return {
          success: false,
          error: `Email delivery failed: ${resendError.message}`,
        }
      }
    }

    // ── 8. Update agreement status + activity log ─────────────────────────
    const updated = await withRls(token, async (db) => {
      const existing = await db.query.serviceAgreements.findFirst({
        where: eq(serviceAgreements.id, id),
        columns: { activity_log: true, customer_id: true },
      })

      if (!existing) return null

      const existingLog =
        (existing.activity_log as Array<{
          action: string
          actor: string
          at: string
          note?: string
        }>) ?? []

      const newLog = [
        ...existingLog,
        logEntry(
          userId,
          "agreement_sent",
          `Agreement sent to ${customer.email}`
        ),
      ]

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
      revalidatePath("/settings")

      return existing.customer_id
    })

    if (!updated) {
      return { success: false, error: "Failed to update agreement status" }
    }

    return { success: true, data: { agreementId: id, status: "sent" } }
  } catch (err) {
    console.error("[sendAgreement]", err)
    return {
      success: false,
      error: err instanceof Error ? err.message : "Failed to send agreement",
    }
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

// ---------------------------------------------------------------------------
// getCustomersForAgreement
// ---------------------------------------------------------------------------

export interface CustomerForAgreement {
  id: string
  full_name: string
  pools: Array<{ id: string; name: string; type: string }>
}

/**
 * Returns all customers with their pools for the agreement builder.
 * Two separate queries to avoid RLS correlated subquery pitfall (MEMORY.md).
 */
export async function getCustomersForAgreement(): Promise<CustomerForAgreement[]> {
  const token = await getRlsToken()
  if (!token) return []

  try {
    return await withRls(token, async (db) => {
      const customerRows = await db
        .select({ id: customers.id, full_name: customers.full_name })
        .from(customers)
        .orderBy(customers.full_name)

      if (customerRows.length === 0) return []

      const customerIds = customerRows.map((c) => c.id)
      const poolRows = await db
        .select({
          id: pools.id,
          customer_id: pools.customer_id,
          name: pools.name,
          type: pools.type,
        })
        .from(pools)
        .where(inArray(pools.customer_id, customerIds))

      const poolsByCustomer: Record<string, Array<{ id: string; name: string; type: string }>> = {}
      for (const p of poolRows) {
        if (!poolsByCustomer[p.customer_id]) poolsByCustomer[p.customer_id] = []
        poolsByCustomer[p.customer_id].push({ id: p.id, name: p.name, type: p.type })
      }

      return customerRows.map((c) => ({
        id: c.id,
        full_name: c.full_name,
        pools: poolsByCustomer[c.id] ?? [],
      }))
    })
  } catch (err) {
    console.error("[getCustomersForAgreement]", err)
    return []
  }
}

// ---------------------------------------------------------------------------
// pauseAgreement
// ---------------------------------------------------------------------------

/**
 * Pauses an active agreement:
 * - Deactivates all linked schedule rules
 * - Suspends customer billing (sets billing_model = 'paused') if no other active agreements
 * - Saves previous billing_model in activity_log for restore on resume
 */
export async function pauseAgreement(
  id: string,
  reason?: string
): Promise<{ success: boolean; data?: Record<string, unknown>; error?: string }> {
  const token = await getRlsToken()
  if (!token) return { success: false, error: "Not authenticated" }

  const userId = token.sub
  const userRole = token.user_role as string | undefined

  if (!userRole || !["owner", "office"].includes(userRole)) {
    return { success: false, error: "Insufficient permissions" }
  }

  try {
    const result = await withRls(token, async (db) => {
      // 1. Fetch agreement
      const existing = await db.query.serviceAgreements.findFirst({
        where: eq(serviceAgreements.id, id),
        columns: {
          id: true,
          status: true,
          customer_id: true,
          activity_log: true,
        },
        with: {
          poolEntries: {
            columns: { id: true, schedule_rule_id: true },
          },
        },
      })

      if (!existing) return { success: false, error: "Agreement not found" }
      if (existing.status !== "active") {
        return { success: false, error: "Only active agreements can be paused" }
      }

      const now = new Date()

      // 2. Deactivate linked schedule rules
      const ruleIds = existing.poolEntries
        .map((e) => e.schedule_rule_id)
        .filter((id): id is string => Boolean(id))

      if (ruleIds.length > 0) {
        await db
          .update(scheduleRules)
          .set({ active: false, updated_at: now })
          .where(inArray(scheduleRules.id, ruleIds))
      }

      // 3. Check if customer has other active agreements — only suspend billing if ALL paused
      const otherActiveAgreements = await db
        .select({ id: serviceAgreements.id })
        .from(serviceAgreements)
        .where(
          and(
            eq(serviceAgreements.customer_id, existing.customer_id),
            eq(serviceAgreements.status, "active")
          )
        )
        .limit(1)

      // Fetch customer's current billing model
      const customerRow = await db
        .select({ billing_model: customers.billing_model })
        .from(customers)
        .where(eq(customers.id, existing.customer_id))
        .limit(1)

      const previousBillingModel = customerRow[0]?.billing_model ?? null

      // 4. Build activity log entry
      const existingLog = (existing.activity_log as Array<{ action: string; actor: string; at: string; note?: string; previous_billing_model?: string }>) ?? []
      const logEntryData: { action: string; actor: string; at: string; note: string; previous_billing_model?: string } = {
        action: "agreement_paused",
        actor: userId,
        at: now.toISOString(),
        note: `Agreement paused${reason ? `. Reason: ${reason}` : ""}`,
        ...(previousBillingModel ? { previous_billing_model: previousBillingModel } : {}),
      }
      const newLog = [...existingLog, logEntryData]

      // 5. Update agreement status
      await db
        .update(serviceAgreements)
        .set({
          status: "paused",
          paused_at: now,
          paused_reason: reason ?? null,
          activity_log: sql`${JSON.stringify(newLog)}::jsonb`,
          updated_at: now,
        })
        .where(eq(serviceAgreements.id, id))

      // 6. Suspend billing only if no other active agreements
      if (otherActiveAgreements.length === 0 && previousBillingModel !== "paused") {
        await db
          .update(customers)
          .set({ billing_model: "paused", updated_at: now })
          .where(eq(customers.id, existing.customer_id))
      }

      // 7. Return fresh agreement data
      const updated = await db.query.serviceAgreements.findFirst({
        where: eq(serviceAgreements.id, id),
        with: {
          customer: { columns: { id: true, full_name: true, email: true, phone: true } },
          poolEntries: { with: { pool: { columns: { id: true, name: true } } } },
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
          template: { columns: { id: true, name: true } },
        },
      })

      revalidatePath(`/agreements/${id}`)
      revalidatePath(`/customers/${existing.customer_id}`)

      return { success: true, data: updated }
    })

    return result
  } catch (err) {
    console.error("[pauseAgreement]", err)
    return { success: false, error: "Failed to pause agreement" }
  }
}

// ---------------------------------------------------------------------------
// resumeAgreement
// ---------------------------------------------------------------------------

/**
 * Resumes a paused agreement:
 * - Reactivates all linked schedule rules with fresh anchor_date (today)
 * - Restores customer billing_model from the pause log entry
 */
export async function resumeAgreement(
  id: string
): Promise<{ success: boolean; data?: Record<string, unknown>; error?: string }> {
  const token = await getRlsToken()
  if (!token) return { success: false, error: "Not authenticated" }

  const userId = token.sub
  const userRole = token.user_role as string | undefined

  if (!userRole || !["owner", "office"].includes(userRole)) {
    return { success: false, error: "Insufficient permissions" }
  }

  try {
    const result = await withRls(token, async (db) => {
      // 1. Fetch agreement with pool entries
      const existing = await db.query.serviceAgreements.findFirst({
        where: eq(serviceAgreements.id, id),
        columns: {
          id: true,
          status: true,
          customer_id: true,
          activity_log: true,
        },
        with: {
          poolEntries: {
            columns: { id: true, schedule_rule_id: true },
          },
        },
      })

      if (!existing) return { success: false, error: "Agreement not found" }
      if (existing.status !== "paused") {
        return { success: false, error: "Only paused agreements can be resumed" }
      }

      const now = new Date()
      const todayStr = toLocalDateString(now)

      // 2. Reactivate schedule rules with fresh anchor_date
      const ruleIds = existing.poolEntries
        .map((e) => e.schedule_rule_id)
        .filter((ruleId): ruleId is string => Boolean(ruleId))

      if (ruleIds.length > 0) {
        await db
          .update(scheduleRules)
          .set({ active: true, anchor_date: todayStr, updated_at: now })
          .where(inArray(scheduleRules.id, ruleIds))
      }

      // 3. Restore billing model from activity log
      const existingLog = (existing.activity_log as Array<{ action: string; actor: string; at: string; note?: string; previous_billing_model?: string }>) ?? []

      // Find the most recent pause entry with a saved billing model
      const pauseEntry = [...existingLog]
        .reverse()
        .find((e) => e.action === "agreement_paused" && e.previous_billing_model)

      const previousBillingModel = pauseEntry?.previous_billing_model ?? null

      if (previousBillingModel) {
        await db
          .update(customers)
          .set({ billing_model: previousBillingModel, updated_at: now })
          .where(eq(customers.id, existing.customer_id))
      }

      // 4. Append to activity log
      const newLog = [
        ...existingLog,
        logEntry(userId, "agreement_resumed", "Agreement resumed"),
      ]

      // 5. Update agreement status
      await db
        .update(serviceAgreements)
        .set({
          status: "active",
          paused_at: null,
          paused_reason: null,
          activity_log: sql`${JSON.stringify(newLog)}::jsonb`,
          updated_at: now,
        })
        .where(eq(serviceAgreements.id, id))

      // 6. Return fresh agreement
      const updated = await db.query.serviceAgreements.findFirst({
        where: eq(serviceAgreements.id, id),
        with: {
          customer: { columns: { id: true, full_name: true, email: true, phone: true } },
          poolEntries: { with: { pool: { columns: { id: true, name: true } } } },
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
          template: { columns: { id: true, name: true } },
        },
      })

      revalidatePath(`/agreements/${id}`)
      revalidatePath(`/customers/${existing.customer_id}`)

      return { success: true, data: updated }
    })

    return result
  } catch (err) {
    console.error("[resumeAgreement]", err)
    return { success: false, error: "Failed to resume agreement" }
  }
}

// ---------------------------------------------------------------------------
// cancelAgreement
// ---------------------------------------------------------------------------

/**
 * Cancels an active or paused agreement.
 *
 * Respects `org_settings.agreement_notice_period_days`:
 * - If > 0: sets end_date to today + N days (agreement stays active until then)
 * - If 0: immediate cancellation, deactivates schedule rules
 */
export async function cancelAgreement(
  id: string
): Promise<{ success: boolean; data?: Record<string, unknown>; error?: string }> {
  const token = await getRlsToken()
  if (!token) return { success: false, error: "Not authenticated" }

  const orgId = token.org_id as string
  const userId = token.sub
  const userRole = token.user_role as string | undefined

  if (!userRole || !["owner", "office"].includes(userRole)) {
    return { success: false, error: "Insufficient permissions" }
  }

  try {
    // Fetch org settings for notice period (uses adminDb since owner-only RLS on updates)
    const settingsRows = await adminDb
      .select({ agreement_notice_period_days: orgSettings.agreement_notice_period_days })
      .from(orgSettings)
      .where(eq(orgSettings.org_id, orgId))
      .limit(1)

    const noticeDays = settingsRows[0]?.agreement_notice_period_days ?? 30

    const result = await withRls(token, async (db) => {
      // 1. Fetch agreement
      const existing = await db.query.serviceAgreements.findFirst({
        where: eq(serviceAgreements.id, id),
        columns: {
          id: true,
          status: true,
          customer_id: true,
          activity_log: true,
        },
        with: {
          poolEntries: {
            columns: { id: true, schedule_rule_id: true },
          },
        },
      })

      if (!existing) return { success: false, error: "Agreement not found" }
      if (!["active", "paused"].includes(existing.status)) {
        return { success: false, error: "Only active or paused agreements can be cancelled" }
      }

      const now = new Date()
      const existingLog = (existing.activity_log as Array<{ action: string; actor: string; at: string; note?: string }>) ?? []

      if (noticeDays > 0) {
        // Notice period — set end_date, agreement remains active until then
        const effectiveDate = new Date(now)
        effectiveDate.setDate(effectiveDate.getDate() + noticeDays)
        const effectiveDateStr = toLocalDateString(effectiveDate)

        const newLog = [
          ...existingLog,
          logEntry(
            userId,
            "agreement_cancelled",
            `Cancellation requested. Effective ${effectiveDateStr} (${noticeDays}-day notice period).`
          ),
        ]

        await db
          .update(serviceAgreements)
          .set({
            end_date: effectiveDateStr,
            activity_log: sql`${JSON.stringify(newLog)}::jsonb`,
            updated_at: now,
          })
          .where(eq(serviceAgreements.id, id))

        revalidatePath(`/agreements/${id}`)
        revalidatePath(`/customers/${existing.customer_id}`)

        const updated = await db.query.serviceAgreements.findFirst({
          where: eq(serviceAgreements.id, id),
          with: {
            customer: { columns: { id: true, full_name: true, email: true, phone: true } },
            poolEntries: { with: { pool: { columns: { id: true, name: true } } } },
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
            template: { columns: { id: true, name: true } },
          },
        })

        return { success: true, data: updated }
      } else {
        // Immediate cancellation — deactivate schedule rules
        const ruleIds = existing.poolEntries
          .map((e) => e.schedule_rule_id)
          .filter((ruleId): ruleId is string => Boolean(ruleId))

        if (ruleIds.length > 0) {
          await db
            .update(scheduleRules)
            .set({ active: false, updated_at: now })
            .where(inArray(scheduleRules.id, ruleIds))
        }

        const newLog = [
          ...existingLog,
          logEntry(userId, "agreement_cancelled", "Agreement cancelled immediately."),
        ]

        await db
          .update(serviceAgreements)
          .set({
            status: "cancelled",
            cancelled_at: now,
            activity_log: sql`${JSON.stringify(newLog)}::jsonb`,
            updated_at: now,
          })
          .where(eq(serviceAgreements.id, id))

        revalidatePath(`/agreements/${id}`)
        revalidatePath(`/customers/${existing.customer_id}`)

        const updated = await db.query.serviceAgreements.findFirst({
          where: eq(serviceAgreements.id, id),
          with: {
            customer: { columns: { id: true, full_name: true, email: true, phone: true } },
            poolEntries: { with: { pool: { columns: { id: true, name: true } } } },
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
            template: { columns: { id: true, name: true } },
          },
        })

        return { success: true, data: updated }
      }
    })

    return result
  } catch (err) {
    console.error("[cancelAgreement]", err)
    return { success: false, error: "Failed to cancel agreement" }
  }
}

// ---------------------------------------------------------------------------
// renewAgreement
// ---------------------------------------------------------------------------

/**
 * Renews an expired (or active) agreement by creating a new draft.
 * Copies all fields + pool entries from the current agreement.
 */
export async function renewAgreement(
  id: string
): Promise<{ success: boolean; data?: { id: string; agreement_number: string }; error?: string }> {
  const token = await getRlsToken()
  if (!token) return { success: false, error: "Not authenticated" }

  const orgId = token.org_id as string
  const userId = token.sub
  const userRole = token.user_role as string | undefined

  if (!userRole || !["owner", "office"].includes(userRole)) {
    return { success: false, error: "Insufficient permissions" }
  }

  try {
    // Atomic increment for new agreement number
    const incrementedRows = await adminDb
      .update(orgSettings)
      .set({
        next_agreement_number: sql`next_agreement_number + 1`,
        updated_at: new Date(),
      })
      .where(eq(orgSettings.org_id, orgId))
      .returning({
        next_agreement_number: orgSettings.next_agreement_number,
        agreement_number_prefix: orgSettings.agreement_number_prefix,
      })

    const assignedNum = (incrementedRows[0]?.next_agreement_number ?? 2) - 1
    const prefix = incrementedRows[0]?.agreement_number_prefix ?? "SA"
    const newAgreementNumber = `${prefix}-${String(assignedNum).padStart(4, "0")}`

    const result = await withRls(token, async (db) => {
      // 1. Fetch original agreement
      const existing = await db.query.serviceAgreements.findFirst({
        where: eq(serviceAgreements.id, id),
        with: {
          poolEntries: true,
        },
      })

      if (!existing) return { success: false, error: "Agreement not found" }
      if (!["expired", "active"].includes(existing.status)) {
        return { success: false, error: "Only expired or active agreements can be renewed" }
      }

      const now = new Date()
      const todayStr = toLocalDateString(now)

      // 2. Calculate new start/end dates
      const newStartDate = existing.end_date ?? todayStr
      let newEndDate: string | null = null
      if (existing.term_type !== "month_to_month" && existing.end_date) {
        const startDateObj = new Date(newStartDate)
        const monthMatch = existing.term_type.match(/^(\d+)_month/)
        if (monthMatch) {
          const months = parseInt(monthMatch[1])
          const endDateObj = new Date(startDateObj)
          endDateObj.setMonth(endDateObj.getMonth() + months)
          newEndDate = toLocalDateString(endDateObj)
        }
      }

      // 3. Create new draft agreement
      const [newAgreement] = await db
        .insert(serviceAgreements)
        .values({
          org_id: orgId,
          customer_id: existing.customer_id,
          agreement_number: newAgreementNumber,
          status: "draft",
          term_type: existing.term_type,
          start_date: newStartDate,
          end_date: newEndDate,
          auto_renew: existing.auto_renew,
          template_id: existing.template_id ?? null,
          terms_and_conditions: existing.terms_and_conditions ?? null,
          cancellation_policy: existing.cancellation_policy ?? null,
          liability_waiver: existing.liability_waiver ?? null,
          internal_notes: existing.internal_notes ?? null,
          version: 1,
          activity_log: sql`${JSON.stringify([logEntry(userId, "created", `Renewed from ${existing.agreement_number}`)])}::jsonb`,
          created_at: now,
          updated_at: now,
        })
        .returning({ id: serviceAgreements.id })

      if (!newAgreement) throw new Error("Failed to create renewal agreement")

      // 4. Copy pool entries (without schedule_rule_id)
      if (existing.poolEntries.length > 0) {
        await db.insert(agreementPoolEntries).values(
          existing.poolEntries.map((entry) => ({
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

      // 5. Append to original agreement's log
      const existingLog = (existing.activity_log as Array<{ action: string; actor: string; at: string; note?: string }>) ?? []
      const updatedLog = [
        ...existingLog,
        logEntry(userId, "renewed", `Renewed — new agreement ${newAgreementNumber} created`),
      ]
      await db
        .update(serviceAgreements)
        .set({
          renewed_at: now,
          activity_log: sql`${JSON.stringify(updatedLog)}::jsonb`,
          updated_at: now,
        })
        .where(eq(serviceAgreements.id, id))

      revalidatePath("/agreements")
      revalidatePath(`/agreements/${id}`)
      revalidatePath(`/customers/${existing.customer_id}`)

      return { success: true, data: { id: newAgreement.id, agreement_number: newAgreementNumber } }
    })

    return result
  } catch (err) {
    console.error("[renewAgreement]", err)
    return { success: false, error: "Failed to renew agreement" }
  }
}

// ---------------------------------------------------------------------------
// getAgreementCompliance
// ---------------------------------------------------------------------------

export interface PoolComplianceResult {
  pool_id: string
  pool_name: string
  entry_id: string
  frequency: string
  custom_interval_days: number | null
  expected_stops: number
  actual_stops: number
  frequency_status: "compliant" | "warning" | "breach"
  billing_status: "compliant" | "mismatch" | "unchecked"
  details: string
}

/**
 * Computes compliance for a single active agreement over a rolling 30-day window.
 *
 * Checks:
 * 1. Service frequency: counts completed route_stops vs expected based on agreement frequency
 * 2. Billing: for flat_monthly — compares agreement monthly_amount vs invoiced total
 *
 * Only checks status = 'active' agreements (avoids false positives during pauses).
 *
 * Uses withRls() — called from user-facing pages.
 */
export async function getAgreementCompliance(
  agreementId: string
): Promise<{
  success: boolean
  data?: PoolComplianceResult[]
  error?: string
}> {
  const token = await getRlsToken()
  if (!token) return { success: false, error: "Not authenticated" }

  try {
    const data = await withRls(token, async (db) => {
      // Verify agreement is active
      const agreement = await db.query.serviceAgreements.findFirst({
        where: and(
          eq(serviceAgreements.id, agreementId),
          eq(serviceAgreements.status, "active")
        ),
        columns: { id: true, customer_id: true, status: true },
      })

      if (!agreement) return []

      // Fetch pool entries for this agreement
      const entries = await db
        .select({
          id: agreementPoolEntries.id,
          pool_id: agreementPoolEntries.pool_id,
          pool_name: pools.name,
          frequency: agreementPoolEntries.frequency,
          custom_interval_days: agreementPoolEntries.custom_interval_days,
          pricing_model: agreementPoolEntries.pricing_model,
          monthly_amount: agreementPoolEntries.monthly_amount,
          per_visit_amount: agreementPoolEntries.per_visit_amount,
        })
        .from(agreementPoolEntries)
        .innerJoin(pools, eq(pools.id, agreementPoolEntries.pool_id))
        .where(eq(agreementPoolEntries.agreement_id, agreementId))

      if (entries.length === 0) return []

      // Rolling 30-day window
      const now = new Date()
      const thirtyDaysAgo = new Date(now)
      thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30)
      const windowStart = toLocalDateString(thirtyDaysAgo)
      const windowEnd = toLocalDateString(now)

      // Count completed stops per pool over the last 30 days
      // "complete" status = stop was finished; exclude "skipped" and "holiday"
      const stopCountRows = await db
        .select({
          pool_id: routeStops.pool_id,
          completed_count: count(routeStops.id),
        })
        .from(routeStops)
        .where(
          and(
            eq(routeStops.status, "complete"),
            lte(routeStops.scheduled_date, windowEnd),
            sql`${routeStops.scheduled_date} >= ${windowStart}`,
            inArray(
              routeStops.pool_id,
              entries.map((e) => e.pool_id)
            )
          )
        )
        .groupBy(routeStops.pool_id)

      const stopCountMap = new Map(
        stopCountRows.map((r) => [r.pool_id, Number(r.completed_count)])
      )

      // Billing compliance: sum invoices for this customer in the last 30 days
      const invoiceRows = await db
        .select({
          total_sum: sql<string>`SUM(${invoices.total})`,
        })
        .from(invoices)
        .where(
          and(
            eq(invoices.customer_id, agreement.customer_id),
            inArray(invoices.status, ["sent", "paid"]),
            sql`${invoices.created_at} >= ${thirtyDaysAgo.toISOString()}`
          )
        )

      const totalBilled = parseFloat(invoiceRows[0]?.total_sum ?? "0") || 0

      // Build compliance results per pool entry
      const results: PoolComplianceResult[] = entries.map((entry) => {
        // Expected stops over 30 days based on frequency
        let expectedStops: number
        if (entry.frequency === "weekly") {
          expectedStops = 4
        } else if (entry.frequency === "biweekly") {
          expectedStops = 2
        } else if (entry.frequency === "monthly") {
          expectedStops = 1
        } else if (entry.frequency === "custom" && entry.custom_interval_days) {
          expectedStops = Math.floor(30 / entry.custom_interval_days)
        } else {
          expectedStops = 1
        }

        const actualStops = stopCountMap.get(entry.pool_id) ?? 0
        const deficit = expectedStops - actualStops

        let frequencyStatus: "compliant" | "warning" | "breach"
        let details: string

        if (deficit <= 1) {
          // Allow 1 miss buffer
          frequencyStatus = "compliant"
          details = `${actualStops}/${expectedStops} stops completed in last 30 days`
        } else if (deficit === 2) {
          frequencyStatus = "warning"
          details = `${actualStops}/${expectedStops} stops completed — ${deficit} behind schedule`
        } else {
          frequencyStatus = "breach"
          details = `${actualStops}/${expectedStops} stops completed — ${deficit} stops missed (critical breach)`
        }

        // Billing compliance (flat_monthly only — simplest to check)
        let billingStatus: "compliant" | "mismatch" | "unchecked" = "unchecked"
        if (entry.pricing_model === "monthly_flat" && entry.monthly_amount) {
          const expectedMonthly = parseFloat(entry.monthly_amount)
          // totalBilled is for the whole customer; per-pool check uses the entry amount
          // We flag if billed amount is off by more than $1
          const billingDiff = Math.abs(totalBilled - expectedMonthly)
          if (totalBilled === 0) {
            billingStatus = "unchecked" // No invoices in window — can't determine
          } else if (billingDiff > 1) {
            billingStatus = "mismatch"
            details +=
              `. Billing: expected $${expectedMonthly.toFixed(2)}/mo, found $${totalBilled.toFixed(2)} invoiced`
          } else {
            billingStatus = "compliant"
          }
        } else if (entry.pricing_model === "per_visit") {
          const perVisit = parseFloat(entry.per_visit_amount ?? "0")
          const expectedTotal = actualStops * perVisit
          if (totalBilled > 0 && perVisit > 0) {
            const billingDiff = Math.abs(totalBilled - expectedTotal)
            if (billingDiff > 1) {
              billingStatus = "mismatch"
              details += `. Billing: expected $${expectedTotal.toFixed(2)} (${actualStops} visits × $${perVisit.toFixed(2)}), found $${totalBilled.toFixed(2)} invoiced`
            } else {
              billingStatus = "compliant"
            }
          }
        }

        return {
          pool_id: entry.pool_id,
          pool_name: entry.pool_name,
          entry_id: entry.id,
          frequency: entry.frequency,
          custom_interval_days: entry.custom_interval_days,
          expected_stops: expectedStops,
          actual_stops: actualStops,
          frequency_status: frequencyStatus,
          billing_status: billingStatus,
          details,
        }
      })

      return results
    })

    return { success: true, data }
  } catch (err) {
    console.error("[getAgreementCompliance]", err)
    return { success: false, error: "Failed to compute compliance" }
  }
}

// ---------------------------------------------------------------------------
// getAgreementsWithCompliance (bulk)
// ---------------------------------------------------------------------------

export interface AgreementComplianceSummary {
  agreement_id: string
  overall_status: "compliant" | "warning" | "breach"
  breach_count: number
  warning_count: number
  pool_results: PoolComplianceResult[]
}

/**
 * Bulk compliance check: computes compliance for ALL active agreements in the org.
 *
 * Uses a single pass with LEFT JOINs and GROUP BY to avoid N+1 queries.
 * Returns a map from agreement_id → compliance summary.
 *
 * Used by the agreement manager list view.
 */
export async function getAgreementsWithCompliance(): Promise<{
  success: boolean
  data?: Map<string, AgreementComplianceSummary>
  error?: string
}> {
  const token = await getRlsToken()
  if (!token) return { success: false, error: "Not authenticated" }

  try {
    const data = await withRls(token, async (db) => {
      // Fetch all active agreements
      const activeAgreements = await db.query.serviceAgreements.findMany({
        where: eq(serviceAgreements.status, "active"),
        columns: { id: true, customer_id: true },
      })

      if (activeAgreements.length === 0) return new Map<string, AgreementComplianceSummary>()

      // Get compliance for each active agreement
      // We batch the inner queries rather than doing N+1 calls
      const agreementIds = activeAgreements.map((a) => a.id)

      // Fetch all pool entries for active agreements in one query
      const allEntries = await db
        .select({
          agreement_id: agreementPoolEntries.agreement_id,
          id: agreementPoolEntries.id,
          pool_id: agreementPoolEntries.pool_id,
          pool_name: pools.name,
          frequency: agreementPoolEntries.frequency,
          custom_interval_days: agreementPoolEntries.custom_interval_days,
          pricing_model: agreementPoolEntries.pricing_model,
          monthly_amount: agreementPoolEntries.monthly_amount,
          per_visit_amount: agreementPoolEntries.per_visit_amount,
        })
        .from(agreementPoolEntries)
        .innerJoin(pools, eq(pools.id, agreementPoolEntries.pool_id))
        .where(inArray(agreementPoolEntries.agreement_id, agreementIds))

      if (allEntries.length === 0) return new Map<string, AgreementComplianceSummary>()

      const poolIds = [...new Set(allEntries.map((e) => e.pool_id))]

      // Rolling 30-day window
      const now = new Date()
      const thirtyDaysAgo = new Date(now)
      thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30)
      const windowStart = toLocalDateString(thirtyDaysAgo)
      const windowEnd = toLocalDateString(now)

      // Bulk stop counts per pool over last 30 days
      const stopCountRows = await db
        .select({
          pool_id: routeStops.pool_id,
          completed_count: count(routeStops.id),
        })
        .from(routeStops)
        .where(
          and(
            eq(routeStops.status, "complete"),
            lte(routeStops.scheduled_date, windowEnd),
            sql`${routeStops.scheduled_date} >= ${windowStart}`,
            inArray(routeStops.pool_id, poolIds)
          )
        )
        .groupBy(routeStops.pool_id)

      const stopCountMap = new Map(
        stopCountRows.map((r) => [r.pool_id, Number(r.completed_count)])
      )

      // Bulk invoice totals per customer over last 30 days
      const customerIds = [...new Set(activeAgreements.map((a) => a.customer_id))]
      const invoiceRows = await db
        .select({
          customer_id: invoices.customer_id,
          total_sum: sql<string>`SUM(${invoices.total})`,
        })
        .from(invoices)
        .where(
          and(
            inArray(invoices.customer_id, customerIds),
            inArray(invoices.status, ["sent", "paid"]),
            sql`${invoices.created_at} >= ${thirtyDaysAgo.toISOString()}`
          )
        )
        .groupBy(invoices.customer_id)

      const billedMap = new Map(
        invoiceRows.map((r) => [r.customer_id, parseFloat(r.total_sum ?? "0") || 0])
      )

      // Group entries by agreement
      const entriesByAgreement = new Map<string, typeof allEntries>()
      for (const entry of allEntries) {
        const list = entriesByAgreement.get(entry.agreement_id) ?? []
        list.push(entry)
        entriesByAgreement.set(entry.agreement_id, list)
      }

      // Build compliance map
      const complianceMap = new Map<string, AgreementComplianceSummary>()

      for (const agreement of activeAgreements) {
        const entries = entriesByAgreement.get(agreement.id) ?? []
        const totalBilled = billedMap.get(agreement.customer_id) ?? 0
        const poolResults: PoolComplianceResult[] = []

        for (const entry of entries) {
          let expectedStops: number
          if (entry.frequency === "weekly") {
            expectedStops = 4
          } else if (entry.frequency === "biweekly") {
            expectedStops = 2
          } else if (entry.frequency === "monthly") {
            expectedStops = 1
          } else if (entry.frequency === "custom" && entry.custom_interval_days) {
            expectedStops = Math.floor(30 / entry.custom_interval_days)
          } else {
            expectedStops = 1
          }

          const actualStops = stopCountMap.get(entry.pool_id) ?? 0
          const deficit = expectedStops - actualStops

          let frequencyStatus: "compliant" | "warning" | "breach"
          let details: string

          if (deficit <= 1) {
            frequencyStatus = "compliant"
            details = `${actualStops}/${expectedStops} stops in last 30 days`
          } else if (deficit === 2) {
            frequencyStatus = "warning"
            details = `${actualStops}/${expectedStops} stops — ${deficit} behind`
          } else {
            frequencyStatus = "breach"
            details = `${actualStops}/${expectedStops} stops — ${deficit} missed`
          }

          let billingStatus: "compliant" | "mismatch" | "unchecked" = "unchecked"
          if (entry.pricing_model === "monthly_flat" && entry.monthly_amount) {
            const expectedMonthly = parseFloat(entry.monthly_amount)
            if (totalBilled > 0) {
              billingStatus =
                Math.abs(totalBilled - expectedMonthly) > 1 ? "mismatch" : "compliant"
            }
          } else if (entry.pricing_model === "per_visit" && entry.per_visit_amount) {
            const expectedTotal = actualStops * parseFloat(entry.per_visit_amount)
            if (totalBilled > 0 && expectedTotal > 0) {
              billingStatus =
                Math.abs(totalBilled - expectedTotal) > 1 ? "mismatch" : "compliant"
            }
          }

          poolResults.push({
            pool_id: entry.pool_id,
            pool_name: entry.pool_name,
            entry_id: entry.id,
            frequency: entry.frequency,
            custom_interval_days: entry.custom_interval_days,
            expected_stops: expectedStops,
            actual_stops: actualStops,
            frequency_status: frequencyStatus,
            billing_status: billingStatus,
            details,
          })
        }

        // Overall status: worst of all pool results
        const breachCount = poolResults.filter((r) => r.frequency_status === "breach").length
        const warningCount = poolResults.filter((r) => r.frequency_status === "warning").length
        const billingMismatches = poolResults.filter(
          (r) => r.billing_status === "mismatch"
        ).length

        let overallStatus: "compliant" | "warning" | "breach"
        if (breachCount > 0 || billingMismatches > 0) {
          overallStatus = "breach"
        } else if (warningCount > 0) {
          overallStatus = "warning"
        } else {
          overallStatus = "compliant"
        }

        complianceMap.set(agreement.id, {
          agreement_id: agreement.id,
          overall_status: overallStatus,
          breach_count: breachCount + billingMismatches,
          warning_count: warningCount,
          pool_results: poolResults,
        })
      }

      return complianceMap
    })

    return { success: true, data }
  } catch (err) {
    console.error("[getAgreementsWithCompliance]", err)
    return { success: false, error: "Failed to compute bulk compliance" }
  }
}

// ---------------------------------------------------------------------------
// runAgreementRenewalScan
// ---------------------------------------------------------------------------

/**
 * Cron-only: scans ALL orgs for agreements approaching expiry and sends
 * renewal reminder emails to office/owner users.
 *
 * Uses adminDb (no user session — called from cron route).
 *
 * Logic:
 * 1. Load all active agreements with a non-null end_date
 * 2. For each org, read agreement_renewal_lead_days (default [30, 7])
 * 3. For each agreement: if days_until_expiry matches a lead day AND
 *    renewal_reminder_sent_at is null or was set >24h ago → send reminder
 * 4. Prevent duplicates: after sending, update renewal_reminder_sent_at
 */
export async function runAgreementRenewalScan(): Promise<{
  success: boolean
  remindersProcessed?: number
  remindersSent?: number
  error?: string
}> {
  try {
    const todayStr = toLocalDateString()
    const now = new Date()
    const resendApiKey = process.env.RESEND_API_KEY
    const isDev = process.env.NODE_ENV === "development"
    const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? "https://app.poolco.app"

    // 1. Fetch all active agreements with end_date (across ALL orgs via adminDb)
    const activeAgreements = await adminDb
      .select({
        id: serviceAgreements.id,
        org_id: serviceAgreements.org_id,
        agreement_number: serviceAgreements.agreement_number,
        customer_id: serviceAgreements.customer_id,
        end_date: serviceAgreements.end_date,
        auto_renew: serviceAgreements.auto_renew,
        term_type: serviceAgreements.term_type,
        renewal_reminder_sent_at: serviceAgreements.renewal_reminder_sent_at,
        activity_log: serviceAgreements.activity_log,
      })
      .from(serviceAgreements)
      .where(
        and(
          eq(serviceAgreements.status, "active"),
          isNotNull(serviceAgreements.end_date)
        )
      )

    if (activeAgreements.length === 0) {
      return { success: true, remindersProcessed: 0, remindersSent: 0 }
    }

    // 2. Get unique org IDs to batch-fetch settings + profiles
    const orgIds = [...new Set(activeAgreements.map((a) => a.org_id))]

    // Fetch org settings (for lead days)
    const orgSettingsRows = await adminDb
      .select({
        org_id: orgSettings.org_id,
        agreement_renewal_lead_days: orgSettings.agreement_renewal_lead_days,
      })
      .from(orgSettings)
      .where(inArray(orgSettings.org_id, orgIds))

    const orgSettingsMap = new Map(
      orgSettingsRows.map((row) => [
        row.org_id,
        (row.agreement_renewal_lead_days as number[] | null) ?? [30, 7],
      ])
    )

    // Fetch org names for email
    const orgRows = await adminDb
      .select({ id: orgs.id, name: orgs.name })
      .from(orgs)
      .where(inArray(orgs.id, orgIds))

    const orgNameMap = new Map(orgRows.map((r) => [r.id, r.name]))

    // Fetch office/owner profiles for each org (recipients)
    const officeProfiles = await adminDb
      .select({
        org_id: profiles.org_id,
        email: profiles.email,
        role: profiles.role,
      })
      .from(profiles)
      .where(
        and(
          inArray(profiles.org_id, orgIds),
          inArray(profiles.role, ["owner", "office"])
        )
      )

    // Group office emails by org
    const officeEmailsMap = new Map<string, string[]>()
    for (const p of officeProfiles) {
      const existing = officeEmailsMap.get(p.org_id) ?? []
      existing.push(p.email)
      officeEmailsMap.set(p.org_id, existing)
    }

    // Fetch customer names for email content
    const customerIds = [...new Set(activeAgreements.map((a) => a.customer_id))]
    const customerRows = await adminDb
      .select({ id: customers.id, full_name: customers.full_name })
      .from(customers)
      .where(inArray(customers.id, customerIds))

    const customerNameMap = new Map(customerRows.map((r) => [r.id, r.full_name]))

    // Fetch pool entry counts per agreement
    const poolEntryCounts = await adminDb
      .select({
        agreement_id: agreementPoolEntries.agreement_id,
        pool_count: count(agreementPoolEntries.id),
        monthly_sum: sql<string>`SUM(
          CASE
            WHEN ${agreementPoolEntries.pricing_model} IN ('monthly_flat', 'tiered')
              THEN COALESCE(${agreementPoolEntries.monthly_amount}::numeric, 0)
            WHEN ${agreementPoolEntries.pricing_model} = 'per_visit'
              THEN COALESCE(${agreementPoolEntries.per_visit_amount}::numeric, 0)
            ELSE 0
          END
        )`,
      })
      .from(agreementPoolEntries)
      .where(
        inArray(
          agreementPoolEntries.agreement_id,
          activeAgreements.map((a) => a.id)
        )
      )
      .groupBy(agreementPoolEntries.agreement_id)

    const poolCountMap = new Map(
      poolEntryCounts.map((r) => [
        r.agreement_id,
        { count: Number(r.pool_count), monthly: parseFloat(r.monthly_sum ?? "0") },
      ])
    )

    // 3. Process each agreement
    let remindersProcessed = 0
    let remindersSent = 0
    const oneDayMs = 24 * 60 * 60 * 1000

    for (const agreement of activeAgreements) {
      if (!agreement.end_date) continue

      // Calculate days until expiry
      const endDateObj = new Date(agreement.end_date + "T00:00:00")
      const diffMs = endDateObj.getTime() - now.getTime()
      const daysUntilExpiry = Math.floor(diffMs / (1000 * 60 * 60 * 24))

      const leadDays = orgSettingsMap.get(agreement.org_id) ?? [30, 7]

      // Only send on days that exactly match a configured lead day
      if (!leadDays.includes(daysUntilExpiry)) continue

      remindersProcessed++

      // Duplicate prevention: skip if sent within the last 24 hours
      if (agreement.renewal_reminder_sent_at) {
        const sentAt = new Date(agreement.renewal_reminder_sent_at).getTime()
        if (now.getTime() - sentAt < oneDayMs) {
          continue
        }
      }

      // Determine recipients
      const recipients = officeEmailsMap.get(agreement.org_id) ?? []
      if (recipients.length === 0) continue

      const companyName = orgNameMap.get(agreement.org_id) ?? "Pool Company"
      const customerName = customerNameMap.get(agreement.customer_id) ?? "Unknown Customer"
      const poolInfo = poolCountMap.get(agreement.id) ?? { count: 0, monthly: 0 }

      const monthlyFormatted =
        poolInfo.monthly > 0
          ? new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(
              poolInfo.monthly
            )
          : ""

      const endDateFormatted = new Date(agreement.end_date + "T00:00:00").toLocaleDateString(
        "en-US",
        { month: "long", day: "numeric", year: "numeric" }
      )

      const agreementUrl = `${appUrl}/agreements/${agreement.id}`

      // Send email
      try {
        const emailHtml = await renderEmail(
          createElement(AgreementRenewalEmail, {
            companyName,
            customerName,
            agreementNumber: agreement.agreement_number,
            endDate: endDateFormatted,
            daysUntilExpiry,
            autoRenew: agreement.auto_renew ?? false,
            termType: agreement.term_type,
            poolCount: poolInfo.count,
            monthlyAmount: monthlyFormatted,
            agreementUrl,
          })
        )

        let emailSent = false
        if (!resendApiKey) {
          if (isDev) {
            console.log("\n--- [DEV] Agreement Renewal Reminder ---")
            console.log(`To: ${recipients.join(", ")}`)
            console.log(`Agreement: ${agreement.agreement_number} (${daysUntilExpiry} days)`)
            console.log(`Customer: ${customerName}`)
            console.log(`Auto-renew: ${agreement.auto_renew}`)
            console.log("---------------------------------------\n")
            emailSent = true // In dev, treat log as "sent"
          }
          // In production without API key: skip — don't mark as sent
        } else {
          const resend = new Resend(resendApiKey)
          const fromAddress = isDev
            ? "DeweyIQ Dev <onboarding@resend.dev>"
            : `DeweyIQ <notifications@deweyiq.com>`

          await resend.emails.send({
            from: fromAddress,
            to: isDev ? ["delivered@resend.dev"] : recipients,
            subject: `Agreement Renewal Reminder: ${agreement.agreement_number} expires in ${daysUntilExpiry} days`,
            html: emailHtml,
          })
          emailSent = true
        }

        // Only mark as sent if email was actually delivered (or logged in dev)
        if (emailSent) {
          const existingLog =
            (agreement.activity_log as Array<{
              action: string
              actor: string
              at: string
              note?: string
            }>) ?? []

          await adminDb
            .update(serviceAgreements)
            .set({
              renewal_reminder_sent_at: now,
              activity_log: sql`${JSON.stringify([
                ...existingLog,
                logEntry(
                  "system",
                  "renewal_reminder_sent",
                  `Renewal reminder sent — ${daysUntilExpiry} days until expiry`
                ),
              ])}::jsonb`,
              updated_at: now,
            })
            .where(eq(serviceAgreements.id, agreement.id))

          remindersSent++
        }
      } catch (emailErr) {
        console.error(
          `[runAgreementRenewalScan] Failed to send reminder for ${agreement.agreement_number}:`,
          emailErr
        )
      }
    }

    return { success: true, remindersProcessed, remindersSent }
  } catch (err) {
    console.error("[runAgreementRenewalScan]", err)
    return { success: false, error: "Renewal scan failed" }
  }
}

// checkExpiredAgreements
// ---------------------------------------------------------------------------

/**
 * Utility: transitions all past-due active agreements to 'expired' or auto-renews them.
 * Called by the cron job in Plan 07.
 *
 * - auto_renew = true: extend end_date by the term duration (6 or 12 months),
 *   set renewed_at = now, log "Auto-renewed"
 * - auto_renew = false: transition to 'expired', deactivate schedule rules
 *
 * Uses adminDb since this runs from a cron route (no user session).
 */
export async function checkExpiredAgreements(): Promise<{
  success: boolean
  expired_count?: number
  renewed_count?: number
  error?: string
}> {
  try {
    const todayStr = toLocalDateString()
    const now = new Date()

    // Find all active agreements with end_date <= today (across ALL orgs)
    const expiredCandidates = await adminDb
      .select({
        id: serviceAgreements.id,
        org_id: serviceAgreements.org_id,
        customer_id: serviceAgreements.customer_id,
        auto_renew: serviceAgreements.auto_renew,
        term_type: serviceAgreements.term_type,
        end_date: serviceAgreements.end_date,
        activity_log: serviceAgreements.activity_log,
      })
      .from(serviceAgreements)
      .where(
        and(
          eq(serviceAgreements.status, "active"),
          isNotNull(serviceAgreements.end_date),
          lte(serviceAgreements.end_date, todayStr)
        )
      )

    if (expiredCandidates.length === 0) {
      return { success: true, expired_count: 0, renewed_count: 0 }
    }

    // Fetch pool entries for schedule rule deactivation (non-auto-renew only)
    const agreementIds = expiredCandidates.map((a) => a.id)
    const entryRows = await adminDb
      .select({
        agreement_id: agreementPoolEntries.agreement_id,
        id: agreementPoolEntries.id,
        schedule_rule_id: agreementPoolEntries.schedule_rule_id,
      })
      .from(agreementPoolEntries)
      .where(inArray(agreementPoolEntries.agreement_id, agreementIds))

    // Group entries by agreement
    const entriesByAgreement = new Map<string, typeof entryRows>()
    for (const entry of entryRows) {
      const existing = entriesByAgreement.get(entry.agreement_id) ?? []
      existing.push(entry)
      entriesByAgreement.set(entry.agreement_id, existing)
    }

    let expiredCount = 0
    let renewedCount = 0

    for (const agreement of expiredCandidates) {
      const existingLog =
        (agreement.activity_log as Array<{
          action: string
          actor: string
          at: string
          note?: string
        }>) ?? []

      if (agreement.auto_renew) {
        // ── Auto-renew: extend end_date by term duration ──────────────────
        let monthsToAdd = 12
        if (agreement.term_type === "6_month") monthsToAdd = 6
        else if (agreement.term_type === "12_month") monthsToAdd = 12

        const currentEnd = new Date(agreement.end_date! + "T00:00:00")
        currentEnd.setMonth(currentEnd.getMonth() + monthsToAdd)
        const newEndDate = toLocalDateString(currentEnd)

        await adminDb
          .update(serviceAgreements)
          .set({
            end_date: newEndDate,
            renewed_at: now,
            renewal_reminder_sent_at: null, // reset so reminders fire again for new term
            activity_log: sql`${JSON.stringify([
              ...existingLog,
              logEntry(
                "system",
                "auto_renewed",
                `Auto-renewed for another ${monthsToAdd}-month period. New end date: ${newEndDate}`
              ),
            ])}::jsonb`,
            updated_at: now,
          })
          .where(eq(serviceAgreements.id, agreement.id))

        revalidatePath(`/agreements/${agreement.id}`)
        revalidatePath(`/customers/${agreement.customer_id}`)
        renewedCount++
      } else {
        // ── Expire: deactivate schedule rules, set status ─────────────────
        const entries = entriesByAgreement.get(agreement.id) ?? []
        const ruleIds = entries
          .map((e) => e.schedule_rule_id)
          .filter((ruleId): ruleId is string => Boolean(ruleId))

        if (ruleIds.length > 0) {
          await adminDb
            .update(scheduleRules)
            .set({ active: false, updated_at: now })
            .where(inArray(scheduleRules.id, ruleIds))
        }

        await adminDb
          .update(serviceAgreements)
          .set({
            status: "expired",
            activity_log: sql`${JSON.stringify([
              ...existingLog,
              logEntry("system", "agreement_expired", `Agreement expired on ${todayStr}`),
            ])}::jsonb`,
            updated_at: now,
          })
          .where(eq(serviceAgreements.id, agreement.id))

        revalidatePath(`/agreements/${agreement.id}`)
        revalidatePath(`/customers/${agreement.customer_id}`)
        expiredCount++
      }
    }

    return { success: true, expired_count: expiredCount, renewed_count: renewedCount }
  } catch (err) {
    console.error("[checkExpiredAgreements]", err)
    return { success: false, error: "Failed to check expired agreements" }
  }
}

// ---------------------------------------------------------------------------
// amendAgreement
// ---------------------------------------------------------------------------

/**
 * Creates an amendment for an active agreement.
 *
 * Classification:
 * - Major (requires re-sign): price change, term_type change, frequency change, add/remove pool
 * - Minor (immediate): checklist change, preferred_day change, notes change
 *
 * Major: creates amendment with pending_signature status, sets pending_amendment_id,
 *        generates new token, sends amendment email.
 * Minor: applies changes immediately, auto-approves amendment, sends notification email.
 */

export interface AmendmentChanges {
  // Pricing changes per pool entry (keyed by pool_entry_id)
  priceChanges?: Record<string, { monthly_amount?: string; per_visit_amount?: string; pricing_model?: string }>
  // Frequency/day changes per pool entry (keyed by pool_entry_id)
  frequencyChanges?: Record<string, { frequency?: string; preferred_day_of_week?: number | null }>
  // Term type change
  term_type?: string
  // Notes change
  notes?: string
  // Checklist changes per pool entry (keyed by pool_entry_id)
  checklistChanges?: Record<string, { checklist_task_ids: string[] }>
}

export async function amendAgreement(
  id: string,
  changes: AmendmentChanges,
  changeSummary: string
): Promise<{ success: boolean; data?: Record<string, unknown>; error?: string }> {
  const token = await getRlsToken()
  if (!token) return { success: false, error: "Not authenticated" }

  const orgId = token.org_id as string
  const userId = token.sub
  const userRole = token.user_role as string | undefined

  if (!userRole || !["owner", "office"].includes(userRole)) {
    return { success: false, error: "Insufficient permissions" }
  }

  // Classify: major if any price/term/frequency/pool changes
  const isMajor = Boolean(
    (changes.priceChanges && Object.keys(changes.priceChanges).length > 0) ||
    changes.term_type ||
    (changes.frequencyChanges && Object.keys(changes.frequencyChanges).length > 0)
  )
  const amendmentType = isMajor ? "major" : "minor"

  try {
    const result = await withRls(token, async (db) => {
      // 1. Fetch agreement with full data
      const existing = await db.query.serviceAgreements.findFirst({
        where: eq(serviceAgreements.id, id),
        with: {
          customer: { columns: { id: true, full_name: true, email: true } },
          poolEntries: { with: { pool: { columns: { id: true, name: true } } } },
        },
      })

      if (!existing) return { success: false, error: "Agreement not found" }
      if (existing.status !== "active") {
        return { success: false, error: "Only active agreements can be amended" }
      }

      const now = new Date()
      const newVersion = (existing.version ?? 1) + 1

      // 2. Create amendment record with snapshot
      const [newAmendment] = await db
        .insert(agreementAmendments)
        .values({
          agreement_id: id,
          version_number: newVersion,
          amendment_type: amendmentType,
          change_summary: changeSummary,
          changed_by_id: userId,
          status: isMajor ? "pending_signature" : "signed",
          signed_at: isMajor ? null : now,
          snapshot_json: JSON.parse(JSON.stringify(existing)) as Record<string, unknown>,
          created_at: now,
        })
        .returning({ id: agreementAmendments.id })

      if (!newAmendment) throw new Error("Failed to create amendment record")

      // 3. Increment agreement version
      await db
        .update(serviceAgreements)
        .set({ version: newVersion, updated_at: now })
        .where(eq(serviceAgreements.id, id))

      // 4. Apply pool entry changes
      if (changes.priceChanges) {
        for (const [entryId, priceChange] of Object.entries(changes.priceChanges)) {
          const updateFields: Record<string, unknown> = {}
          if (priceChange.pricing_model !== undefined) updateFields.pricing_model = priceChange.pricing_model
          if (priceChange.monthly_amount !== undefined) updateFields.monthly_amount = priceChange.monthly_amount
          if (priceChange.per_visit_amount !== undefined) updateFields.per_visit_amount = priceChange.per_visit_amount
          if (Object.keys(updateFields).length > 0) {
            await db
              .update(agreementPoolEntries)
              .set(updateFields)
              .where(eq(agreementPoolEntries.id, entryId))
          }
        }
      }

      if (changes.frequencyChanges) {
        for (const [entryId, freqChange] of Object.entries(changes.frequencyChanges)) {
          const updateFields: Record<string, unknown> = {}
          if (freqChange.frequency !== undefined) updateFields.frequency = freqChange.frequency
          if (freqChange.preferred_day_of_week !== undefined) updateFields.preferred_day_of_week = freqChange.preferred_day_of_week
          if (Object.keys(updateFields).length > 0) {
            await db
              .update(agreementPoolEntries)
              .set(updateFields)
              .where(eq(agreementPoolEntries.id, entryId))
          }

          // Update linked schedule rule if minor (major waits for re-sign)
          if (!isMajor) {
            const entry = existing.poolEntries.find((e) => e.id === entryId)
            if (entry?.schedule_rule_id) {
              const ruleUpdate: Record<string, unknown> = { updated_at: now }
              if (freqChange.frequency !== undefined) ruleUpdate.frequency = freqChange.frequency
              if (freqChange.preferred_day_of_week !== undefined) ruleUpdate.preferred_day_of_week = freqChange.preferred_day_of_week
              await db
                .update(scheduleRules)
                .set(ruleUpdate)
                .where(eq(scheduleRules.id, entry.schedule_rule_id))
            }
          }
        }
      }

      if (changes.checklistChanges) {
        for (const [entryId, checklistChange] of Object.entries(changes.checklistChanges)) {
          await db
            .update(agreementPoolEntries)
            .set({
              checklist_task_ids: sql`${JSON.stringify(checklistChange.checklist_task_ids)}::jsonb`,
            })
            .where(eq(agreementPoolEntries.id, entryId))
        }
      }

      if (changes.term_type) {
        await db
          .update(serviceAgreements)
          .set({ term_type: changes.term_type, updated_at: now })
          .where(eq(serviceAgreements.id, id))
      }

      const existingLog = (existing.activity_log as Array<{ action: string; actor: string; at: string; note?: string }>) ?? []

      if (isMajor) {
        // 5. Set pending_amendment_id — agreement stays 'active'
        await db
          .update(serviceAgreements)
          .set({
            pending_amendment_id: newAmendment.id,
            activity_log: sql`${JSON.stringify([
              ...existingLog,
              logEntry(userId, "amended", `Major amendment (v${newVersion}) — sent for customer re-approval`),
            ])}::jsonb`,
            updated_at: now,
          })
          .where(eq(serviceAgreements.id, id))

        // 6. Generate amendment token and send email
        const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? "https://app.poolco.app"
        const amendmentToken = await signAgreementToken(id, newAmendment.id)
        const approvalUrl = `${appUrl}/agreement/${amendmentToken}?amendment=${newAmendment.id}`

        // Fetch org branding
        const orgRows = await adminDb
          .select({ name: orgs.name })
          .from(orgs)
          .where(eq(orgs.id, orgId))
          .limit(1)
        const companyName = orgRows[0]?.name ?? "Pool Company"

        const emailHtml = await renderEmail(
          createElement(AgreementAmendmentEmail, {
            companyName,
            customerName: existing.customer.full_name,
            agreementNumber: existing.agreement_number,
            amendmentType: "major",
            changeSummary,
            versionNumber: newVersion,
            approvalUrl,
          })
        )

        const resendApiKey = process.env.RESEND_API_KEY
        const isDev = process.env.NODE_ENV === "development"

        if (!resendApiKey) {
          if (isDev) {
            console.log("\n--- [DEV] Amendment Email ----------------------------------------")
            console.log(`To: ${existing.customer.email}`)
            console.log(`Subject: Amendment to Your Service Agreement ${existing.agreement_number}`)
            console.log(`Approval URL: ${approvalUrl}`)
            console.log("------------------------------------------------------------------\n")
          }
        } else {
          const resend = new Resend(resendApiKey)
          const fromAddress = isDev
            ? "DeweyIQ Dev <onboarding@resend.dev>"
            : `${companyName} <agreements@poolco.app>`

          await resend.emails.send({
            from: fromAddress,
            to: isDev ? ["delivered@resend.dev"] : [existing.customer.email ?? ""],
            subject: `Amendment to Your Service Agreement ${existing.agreement_number}`,
            html: emailHtml,
          })
        }
      } else {
        // Minor amendment — notify only
        await db
          .update(serviceAgreements)
          .set({
            activity_log: sql`${JSON.stringify([
              ...existingLog,
              logEntry(userId, "amended", `Minor amendment (v${newVersion}) applied — ${changeSummary}`),
            ])}::jsonb`,
            updated_at: now,
          })
          .where(eq(serviceAgreements.id, id))

        // Send informational notification email (non-blocking)
        try {
          const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? "https://app.poolco.app"
          const orgRows = await adminDb
            .select({ name: orgs.name })
            .from(orgs)
            .where(eq(orgs.id, orgId))
            .limit(1)
          const companyName = orgRows[0]?.name ?? "Pool Company"

          const emailHtml = await renderEmail(
            createElement(AgreementAmendmentEmail, {
              companyName,
              customerName: existing.customer.full_name,
              agreementNumber: existing.agreement_number,
              amendmentType: "minor",
              changeSummary,
              versionNumber: newVersion,
              approvalUrl: `${appUrl}/agreement`,
            })
          )

          const resendApiKey = process.env.RESEND_API_KEY
          const isDev = process.env.NODE_ENV === "development"

          if (!resendApiKey && isDev) {
            console.log("\n--- [DEV] Minor Amendment Notification ---")
            console.log(`To: ${existing.customer.email}`)
            console.log(`Change: ${changeSummary}`)
            console.log("------------------------------------------\n")
          } else if (resendApiKey) {
            const resend = new Resend(resendApiKey)
            const fromAddress = isDev
              ? "DeweyIQ Dev <onboarding@resend.dev>"
              : `${companyName} <agreements@poolco.app>`

            await resend.emails.send({
              from: fromAddress,
              to: isDev ? ["delivered@resend.dev"] : [existing.customer.email ?? ""],
              subject: `Update to Your Service Agreement ${existing.agreement_number}`,
              html: emailHtml,
            })
          }
        } catch (emailErr) {
          // Non-blocking — amendment is applied even if notification fails
          console.error("[amendAgreement] Minor amendment notification failed (non-blocking):", emailErr)
        }
      }

      // Return fresh agreement data
      const updated = await db.query.serviceAgreements.findFirst({
        where: eq(serviceAgreements.id, id),
        with: {
          customer: { columns: { id: true, full_name: true, email: true, phone: true } },
          poolEntries: { with: { pool: { columns: { id: true, name: true } } } },
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
          template: { columns: { id: true, name: true } },
        },
      })

      revalidatePath(`/agreements/${id}`)
      revalidatePath(`/customers/${existing.customer_id}`)

      return { success: true, data: updated }
    })

    return result
  } catch (err) {
    console.error("[amendAgreement]", err)
    return { success: false, error: "Failed to amend agreement" }
  }
}
