"use server"

import { createClient } from "@/lib/supabase/server"
import { withRls } from "@/lib/db"
import type { SupabaseToken } from "@/lib/db"
import { adminDb } from "@/lib/db"
import {
  customers,
  pools,
  chemicalProducts,
  checklistTemplates,
  checklistTasks,
  serviceVisits,
  alerts,
  orgs,
  profiles,
} from "@/lib/db/schema"
import { eq, and, desc } from "drizzle-orm"
import type { ChemicalProduct, ChemicalKey } from "@/lib/chemistry/dosing"
import type { SanitizerType } from "@/lib/chemistry/targets"
import { render as renderEmail } from "@react-email/render"
import { ServiceReportEmail } from "@/lib/emails/service-report-email"
import { signReportToken } from "@/lib/reports/report-token"
import { getOrgSettings } from "@/actions/company-settings"
import { getResolvedTemplate } from "@/actions/notification-templates"

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface StopContext {
  customerId: string
  poolId: string
  /** Organization ID — needed for photo storage path scoping */
  orgId: string
  customerName: string
  poolName: string
  poolVolumeGallons: number | null
  sanitizerType: SanitizerType
  /** Last visit's chemistry readings keyed by param name */
  previousChemistry: Record<string, number | null>
  /** Products configured for this org, mapped to dosing engine format */
  chemicalProducts: ChemicalProduct[]
  /** Checklist tasks merged from template + customer overrides */
  checklistTasks: Array<{
    taskId: string
    label: string
    isRequired: boolean
    sortOrder: number
  }>
}

export interface CompleteStopInput {
  visitId: string
  customerId: string
  poolId: string
  chemistry: Record<string, number | null>
  checklist: Array<{ taskId: string; completed: boolean; notes: string }>
  notes: string
  photoStoragePaths: string[]
  /** When true, bypasses requirement warnings and completes anyway, generating an incomplete_data alert */
  overrideWarnings?: boolean
}

export interface CompleteStopWarnings {
  missingChemistry: string[]
  missingChecklist: string[]
}

export interface SkipStopInput {
  visitId: string
  customerId: string
  poolId: string
  skipReason: string
}

// Map DB chemical_type strings to dosing engine ChemicalKey values
const CHEMICAL_TYPE_MAP: Record<string, ChemicalKey | null> = {
  chlorine: "sodiumHypochlorite_12pct",
  shock: "calciumHypochlorite_67pct",
  acid: "muriatic_31pct",
  soda_ash: "sodaAsh",
  baking_soda: "sodiumBicarbonate",
  cya: "cyanuricAcid",
  // calcium, algaecide, salt — no dosing engine key yet; return null to skip
  calcium: null,
  algaecide: null,
  salt: null,
}

// ---------------------------------------------------------------------------
// Helper: get RLS token
// ---------------------------------------------------------------------------

async function getRlsToken(): Promise<SupabaseToken | null> {
  const supabase = await createClient()
  const { data: claimsData } = await supabase.auth.getClaims()
  if (!claimsData?.claims) return null
  return claimsData.claims as SupabaseToken
}

// ---------------------------------------------------------------------------
// getStopContext
// ---------------------------------------------------------------------------

/**
 * getStopContext — fetches all data needed for the stop workflow page.
 *
 * Returns pool info, customer info, chemical products for the org,
 * checklist tasks (template + customer overrides), and previous visit chemistry.
 *
 * Uses LEFT JOIN pattern throughout (not correlated subqueries — per MEMORY.md
 * critical pattern for RLS-protected tables inside withRls transactions).
 *
 * @param customerId - Customer UUID
 * @param poolId     - Pool UUID
 * @returns StopContext or null if not found / unauthorized
 */
export async function getStopContext(
  customerId: string,
  poolId: string
): Promise<StopContext | null> {
  const token = await getRlsToken()
  if (!token) return null

  try {
    return await withRls(token, async (db) => {
      // ── 1. Fetch customer + pool in a single round-trip via LEFT JOIN ──────
      const poolRows = await db
        .select({
          poolId: pools.id,
          poolName: pools.name,
          volumeGallons: pools.volume_gallons,
          sanitizerType: pools.sanitizer_type,
          customerId: customers.id,
          customerName: customers.full_name,
          customerEmail: customers.email,
        })
        .from(pools)
        .leftJoin(customers, eq(pools.customer_id, customers.id))
        .where(
          and(
            eq(pools.id, poolId),
            eq(pools.customer_id, customerId)
          )
        )
        .limit(1)

      const poolRow = poolRows[0]
      if (!poolRow) return null

      // ── 2. Fetch chemical products for this org ───────────────────────────
      const orgId = token.org_id
      let products: ChemicalProduct[] = []

      if (orgId) {
        const productRows = await db
          .select({
            id: chemicalProducts.id,
            name: chemicalProducts.name,
            chemicalType: chemicalProducts.chemical_type,
            concentrationPct: chemicalProducts.concentration_pct,
          })
          .from(chemicalProducts)
          .where(
            and(
              eq(chemicalProducts.org_id, orgId as string),
              eq(chemicalProducts.is_active, true)
            )
          )

        products = productRows
          .map((row) => {
            const chemicalKey = CHEMICAL_TYPE_MAP[row.chemicalType]
            if (!chemicalKey) return null
            return {
              id: row.id,
              name: row.name,
              chemical: chemicalKey,
              concentrationPct: row.concentrationPct ?? 100,
            } satisfies ChemicalProduct
          })
          .filter(Boolean) as ChemicalProduct[]
      }

      // ── 3. Fetch checklist tasks (template for "routine" + customer overrides)
      const taskRows = await db
        .select({
          taskId: checklistTasks.id,
          label: checklistTasks.label,
          isRequired: checklistTasks.is_required,
          sortOrder: checklistTasks.sort_order,
          isDeleted: checklistTasks.is_deleted,
          customerId: checklistTasks.customer_id,
        })
        .from(checklistTasks)
        .leftJoin(
          checklistTemplates,
          eq(checklistTasks.template_id, checklistTemplates.id)
        )
        .where(
          and(
            eq(checklistTasks.org_id, orgId as string),
            eq(checklistTasks.is_deleted, false)
          )
        )

      // Merge template tasks + customer overrides
      const mergedTasks = taskRows
        .filter(
          (task) =>
            task.customerId === null || task.customerId === customerId
        )
        .map((task) => ({
          taskId: task.taskId,
          label: task.label,
          isRequired: task.isRequired,
          sortOrder: task.sortOrder,
        }))
        .sort((a, b) => a.sortOrder - b.sortOrder)

      // ── 4. Fetch previous visit's chemistry readings ──────────────────────
      let previousChemistry: Record<string, number | null> = {}

      const previousVisitRows = await db
        .select({
          chemistryReadings: serviceVisits.chemistry_readings,
        })
        .from(serviceVisits)
        .where(
          and(
            eq(serviceVisits.pool_id, poolId),
            eq(serviceVisits.customer_id, customerId)
          )
        )
        .orderBy(desc(serviceVisits.visited_at))
        .limit(1)

      if (previousVisitRows[0]?.chemistryReadings) {
        const raw = previousVisitRows[0].chemistryReadings
        if (raw && typeof raw === "object" && !Array.isArray(raw)) {
          previousChemistry = raw as Record<string, number | null>
        }
      }

      // ── 5. Assemble context ───────────────────────────────────────────────
      const sanitizerType =
        (poolRow.sanitizerType as SanitizerType | null) ?? "chlorine"

      return {
        customerId: poolRow.customerId ?? customerId,
        poolId: poolRow.poolId,
        orgId: orgId as string,
        customerName: poolRow.customerName ?? "Unknown Customer",
        poolName: poolRow.poolName,
        poolVolumeGallons: poolRow.volumeGallons,
        sanitizerType,
        previousChemistry,
        chemicalProducts: products,
        checklistTasks: mergedTasks,
      } satisfies StopContext
    })
  } catch (err) {
    console.error("[getStopContext] Error:", err)
    return null
  }
}

// ---------------------------------------------------------------------------
// completeStop
// ---------------------------------------------------------------------------

/**
 * completeStop — saves a completed visit to service_visits.
 *
 * 1. Inserts/updates the service_visits row via withRls
 * 2. Generates the HTML service report
 * 3. Saves report_html to the row
 * 4. If customer has email_reports enabled: invokes send-service-report Edge Function
 *    (best-effort — failures are logged but don't block the response)
 *
 * @returns { success: true } on success, { success: false, error: string } on failure
 */
export async function completeStop(
  input: CompleteStopInput
): Promise<{ success: boolean; error?: string; warnings?: CompleteStopWarnings }> {
  const token = await getRlsToken()
  if (!token) return { success: false, error: "Not authenticated" }

  try {
    // ── 1. Resolve tech profile ID ──────────────────────────────────────────
    // token.sub is the auth.uid() — we need the profiles.id (same UUID in our schema)
    const techId = token.sub

    // ── 2. Check service requirements (warn-but-allow pattern) ───────────────
    // Fetch org_settings to validate required chemistry and checklist items.
    // This is best-effort — if settings can't be fetched, we skip validation.
    const missingChemistry: string[] = []
    const missingChecklist: string[] = []

    if (!input.overrideWarnings) {
      try {
        const settings = await getOrgSettings()

        if (settings) {
          // ── Chemistry requirements: check per sanitizer type ───────────────
          if (settings.required_chemistry_by_sanitizer) {
            // Fetch pool's sanitizer type to know which requirements apply
            const poolRow = await adminDb
              .select({ sanitizerType: pools.sanitizer_type })
              .from(pools)
              .where(eq(pools.id, input.poolId))
              .limit(1)

            const sanitizerType = (poolRow[0]?.sanitizerType ?? "chlorine") as string
            const requiredParams =
              settings.required_chemistry_by_sanitizer[sanitizerType] ?? []

            for (const param of requiredParams) {
              const val = input.chemistry[param]
              if (val === null || val === undefined) {
                missingChemistry.push(param)
              }
            }
          }

          // ── Checklist requirements ─────────────────────────────────────────
          if (
            settings.required_checklist_task_ids &&
            settings.required_checklist_task_ids.length > 0
          ) {
            const completedTaskIds = new Set(
              input.checklist
                .filter((t) => t.completed)
                .map((t) => t.taskId)
            )

            for (const requiredId of settings.required_checklist_task_ids) {
              if (!completedTaskIds.has(requiredId)) {
                missingChecklist.push(requiredId)
              }
            }
          }
        }
      } catch (settingsErr) {
        // Non-fatal — skip validation if settings fetch fails
        console.error("[completeStop] Could not fetch org settings for validation:", settingsErr)
      }

      // Return warnings without completing — tech must explicitly override
      if (missingChemistry.length > 0 || missingChecklist.length > 0) {
        return {
          success: false,
          warnings: { missingChemistry, missingChecklist },
        }
      }
    }

    // ── 2. Fetch customer info for report and email check ───────────────────
    // Use adminDb to bypass RLS for this read — we just verified auth via token
    const customerRows = await adminDb
      .select({
        id: customers.id,
        fullName: customers.full_name,
        email: customers.email,
      })
      .from(customers)
      .where(eq(customers.id, input.customerId))
      .limit(1)

    const customer = customerRows[0]
    const customerEmail = customer?.email ?? null
    const customerName = customer?.fullName ?? "Customer"

    // ── 3. Fetch pool name for report ───────────────────────────────────────
    const poolRows = await adminDb
      .select({ name: pools.name })
      .from(pools)
      .where(eq(pools.id, input.poolId))
      .limit(1)

    const poolName = poolRows[0]?.name ?? "Pool"

    // ── 4. Fetch tech display name from profiles ─────────────────────────────
    const techRows = await adminDb
      .select({ fullName: profiles.full_name })
      .from(profiles)
      .where(eq(profiles.id, techId))
      .limit(1)

    const techName = techRows[0]?.fullName ?? "Technician"

    // ── 5. Fetch org name for email branding ────────────────────────────────
    const orgId = token.org_id as string
    const orgRows = await adminDb
      .select({ name: orgs.name })
      .from(orgs)
      .where(eq(orgs.id, orgId))
      .limit(1)

    const companyName = orgRows[0]?.name ?? "Pool Company"

    // ── 6. Generate signed report token and public URL ─────────────────────
    const now = new Date()
    const reportToken = await signReportToken(input.visitId)
    const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000"
    const reportUrl = `${appUrl}/api/reports/${reportToken}`

    // ── 7. Resolve service report email template ────────────────────────────
    const serviceDate = now.toLocaleDateString("en-US", {
      weekday: "long",
      year: "numeric",
      month: "long",
      day: "numeric",
    })

    const reportTemplate = await getResolvedTemplate(orgId, "service_report_email", {
      customer_name: customerName,
      company_name: companyName,
      tech_name: techName,
      service_date: serviceDate,
      pool_name: poolName,
    })

    const reportHtml = await renderEmail(
      ServiceReportEmail({
        customerName,
        techName,
        companyName,
        serviceDate,
        poolName,
        chemistry: input.chemistry,
        checklist: input.checklist.map((item) => ({
          task: item.taskId,
          completed: item.completed,
        })),
        reportUrl,
        customFooter: reportTemplate?.body_html ?? null,
      })
    )

    // ── 8. Check if this visit already exists (edit vs first completion) ─────
    const existingVisit = await adminDb
      .select({ id: serviceVisits.id })
      .from(serviceVisits)
      .where(eq(serviceVisits.id, input.visitId))
      .limit(1)
    const isUpdate = existingVisit.length > 0

    // ── 9. Insert or update the service visit record via withRls ─────────────
    await withRls(token, async (db) => {
      await db
        .insert(serviceVisits)
        .values({
          id: input.visitId,
          org_id: token.org_id as string,
          customer_id: input.customerId,
          pool_id: input.poolId,
          tech_id: techId,
          visit_type: "routine",
          visited_at: now,
          status: "complete",
          completed_at: now,
          notes: input.notes || null,
          chemistry_readings: input.chemistry as Record<string, unknown>,
          checklist_completion: input.checklist as unknown as Record<
            string,
            unknown
          >,
          photo_urls: input.photoStoragePaths,
          report_html: reportHtml,
        })
        .onConflictDoUpdate({
          target: serviceVisits.id,
          set: {
            status: "complete",
            completed_at: now,
            notes: input.notes || null,
            chemistry_readings: input.chemistry as Record<string, unknown>,
            checklist_completion: input.checklist as unknown as Record<
              string,
              unknown
            >,
            photo_urls: input.photoStoragePaths,
            report_html: reportHtml,
          },
        })
    })

    // ── 10. If tech overrode warnings, generate an incomplete_data alert ────
    // This is best-effort — alert generation failure must never block completion.
    if (input.overrideWarnings && (missingChemistry.length > 0 || missingChecklist.length > 0)) {
      try {
        const visitDate = now.toLocaleDateString("en-US", {
          month: "short",
          day: "numeric",
        })
        await adminDb
          .insert(alerts)
          .values({
            org_id: orgId,
            alert_type: "incomplete_data",
            severity: "warning",
            reference_id: input.visitId,
            reference_type: "service_visit",
            title: `${customerName}'s service has incomplete data (tech override)`,
            description: `Stop completed on ${visitDate} with tech override. Missing: ${[...missingChemistry, ...missingChecklist].join(", ")}`,
            metadata: {
              customerId: input.customerId,
              poolId: input.poolId,
              techId,
              missingChemistry,
              missingChecklist,
            },
          })
          .onConflictDoNothing()
      } catch (alertErr) {
        // Best-effort — don't fail the completion if alert generation fails
        console.error("[completeStop] Alert generation failed (non-blocking):", alertErr)
      }
    }

    // ── 11. Best-effort: send email report via Edge Function ────────────────
    // Only send on first completion — edits update report_html silently (no resend).
    // If customer has no email: skip silently — no error, no alert.
    // If service_report_email template is disabled: skip silently.
    if (customerEmail && !isUpdate && reportTemplate) {
      try {
        const supabase = await createClient()
        await supabase.functions.invoke("send-service-report", {
          body: {
            visitId: input.visitId,
            customerEmail,
            customerName,
            reportHtml,
            fromName: companyName,
            fromEmail: "reports@poolco.app",
            customSubject: reportTemplate.subject ?? undefined,
          },
        })
      } catch (emailErr) {
        // Best-effort — don't fail the completion if email fails
        console.error("[completeStop] Email delivery failed (non-blocking):", emailErr)
      }
    }

    return { success: true }
  } catch (err) {
    console.error("[completeStop] Error:", err)
    return {
      success: false,
      error: err instanceof Error ? err.message : "Unknown error",
    }
  }
}

// ---------------------------------------------------------------------------
// skipStop
// ---------------------------------------------------------------------------

/**
 * skipStop — records a skipped visit with a required reason.
 *
 * Per locked decision: "Techs can skip stops (must provide a reason)"
 */
export async function skipStop(
  input: SkipStopInput
): Promise<{ success: boolean; error?: string }> {
  const token = await getRlsToken()
  if (!token) return { success: false, error: "Not authenticated" }

  if (!input.skipReason?.trim()) {
    return { success: false, error: "Skip reason is required" }
  }

  try {
    const now = new Date()

    await withRls(token, async (db) => {
      await db
        .insert(serviceVisits)
        .values({
          id: input.visitId,
          org_id: token.org_id as string,
          customer_id: input.customerId,
          pool_id: input.poolId,
          tech_id: token.sub,
          visit_type: "routine",
          visited_at: now,
          status: "skipped",
          skip_reason: input.skipReason.trim(),
        })
        .onConflictDoUpdate({
          target: serviceVisits.id,
          set: {
            status: "skipped",
            skip_reason: input.skipReason.trim(),
          },
        })
    })

    return { success: true }
  } catch (err) {
    console.error("[skipStop] Error:", err)
    return {
      success: false,
      error: err instanceof Error ? err.message : "Unknown error",
    }
  }
}
