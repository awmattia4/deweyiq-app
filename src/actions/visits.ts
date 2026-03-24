"use server"

import { createClient } from "@/lib/supabase/server"
import { withRls, getRlsToken } from "@/lib/db"
import type { SupabaseToken } from "@/lib/db"
import { adminDb } from "@/lib/db"
import {
  customers,
  pools,
  equipment,
  chemicalProducts,
  checklistTemplates,
  checklistTasks,
  serviceVisits,
  alerts,
  orgs,
  profiles,
  routeStops,
  workOrders,
  workOrderLineItems,
} from "@/lib/db/schema"
import { eq, and, desc, asc, isNull } from "drizzle-orm"
import type { ChemicalProduct, ChemicalKey } from "@/lib/chemistry/dosing"
import type { SanitizerType } from "@/lib/chemistry/targets"
import { render as renderEmail } from "@react-email/render"
import { ServiceReportEmail } from "@/lib/emails/service-report-email"
import { signReportToken } from "@/lib/reports/report-token"
import { getOrgSettings } from "@/actions/company-settings"
import { toLocalDateString } from "@/lib/date-utils"
import { getResolvedTemplate } from "@/actions/notification-templates"
import { notifyOrgRole } from "@/lib/notifications/dispatch"

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
  /** Service type name (checklist template name) */
  serviceTypeName: string | null
  /** Phase 9 gap closure: route_stops.id for marking started_at */
  routeStopId: string | null
  /** Work order details (only present for WO stops) */
  workOrder: {
    title: string
    description: string | null
    category: string
    priority: string
    lineItems: Array<{
      description: string
      quantity: string
      unit: string
    }>
  } | null
  /**
   * Phase 10: Internal notes from the previous visit at this pool.
   * Used for tech handoff — current tech sees what the last tech flagged.
   * Only populated when the previous visit had internal_notes or internal_flags.
   */
  previousInternalNotes: {
    notes: string | null
    flags: string[]
    visitedAt: string
  } | null
  /**
   * Phase 10: Equipment tracked for this pool.
   * Used by EquipmentReadingsSection to show metric input fields during completion.
   * Empty array if no equipment is tracked.
   */
  poolEquipment: Array<{
    id: string
    type: string
    brand: string | null
    model: string | null
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
  /**
   * Phase 9: What the tech actually applied at this stop.
   * Optional — existing callers that don't pass it will write null.
   * Future: stop-workflow.tsx will pass calculated dosing amounts at completion time.
   */
  dosingAmounts?: Array<{ chemical: string; productId: string; amount: number; unit: string }>
  /**
   * Phase 10: Internal tech-to-office note.
   * NOT customer-facing — only visible to owner and office roles.
   */
  internalNotes?: string
  /**
   * Phase 10: Internal flags for flagging issues.
   * Valid values: "needs_follow_up" | "needs_parts" | "safety_concern" | "handoff_note"
   */
  internalFlags?: string[]
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
  routeStopId?: string | null
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

      // ── 3. Look up today's route_stop to get template + WO info ────────────
      const today = toLocalDateString()
      const routeStopRows = await db
        .select({
          id: routeStops.id,
          checklistTemplateId: routeStops.checklist_template_id,
          workOrderId: routeStops.work_order_id,
        })
        .from(routeStops)
        .where(
          and(
            eq(routeStops.org_id, orgId as string),
            eq(routeStops.customer_id, customerId),
            eq(routeStops.pool_id, poolId),
            eq(routeStops.scheduled_date, today)
          )
        )
        .limit(1)

      const currentStop = routeStopRows[0]
      let effectiveTemplateId = currentStop?.checklistTemplateId ?? null
      let serviceTypeName: string | null = null

      // If no template on the stop, find the org's default template
      if (!effectiveTemplateId) {
        const defaultTemplateRows = await db
          .select({ id: checklistTemplates.id, name: checklistTemplates.name })
          .from(checklistTemplates)
          .where(
            and(
              eq(checklistTemplates.org_id, orgId as string),
              eq(checklistTemplates.is_default, true)
            )
          )
          .limit(1)
        if (defaultTemplateRows[0]) {
          effectiveTemplateId = defaultTemplateRows[0].id
          serviceTypeName = defaultTemplateRows[0].name
        }
      } else {
        // Fetch the template name
        const templateNameRows = await db
          .select({ name: checklistTemplates.name })
          .from(checklistTemplates)
          .where(eq(checklistTemplates.id, effectiveTemplateId))
          .limit(1)
        serviceTypeName = templateNameRows[0]?.name ?? null
      }

      // ── 4. Fetch checklist tasks: template tasks + customer overrides ──────
      // Query A: Active template tasks (org-level, not customer-specific)
      const templateTaskRows = effectiveTemplateId
        ? await db
            .select({
              taskId: checklistTasks.id,
              label: checklistTasks.label,
              isRequired: checklistTasks.is_required,
              sortOrder: checklistTasks.sort_order,
            })
            .from(checklistTasks)
            .where(
              and(
                eq(checklistTasks.org_id, orgId as string),
                eq(checklistTasks.template_id, effectiveTemplateId),
                isNull(checklistTasks.customer_id),
                eq(checklistTasks.is_deleted, false)
              )
            )
        : []

      // Query B: All customer-level rows (both additions and tombstones)
      const customerTaskRows = customerId
        ? await db
            .select({
              taskId: checklistTasks.id,
              label: checklistTasks.label,
              isRequired: checklistTasks.is_required,
              sortOrder: checklistTasks.sort_order,
              isDeleted: checklistTasks.is_deleted,
              suppressesTaskId: checklistTasks.suppresses_task_id,
            })
            .from(checklistTasks)
            .where(
              and(
                eq(checklistTasks.org_id, orgId as string),
                eq(checklistTasks.customer_id, customerId)
              )
            )
        : []

      // Build suppression set from tombstones
      const suppressedIds = new Set(
        customerTaskRows
          .filter((t) => t.isDeleted && t.suppressesTaskId)
          .map((t) => t.suppressesTaskId!)
      )

      // Active customer additions (non-deleted, non-tombstone)
      const customerAdditions = customerTaskRows.filter((t) => !t.isDeleted)

      // Merge: template tasks (minus suppressed) + customer additions
      const mergedTasks = [
        ...templateTaskRows
          .filter((t) => !suppressedIds.has(t.taskId))
          .map((t) => ({
            taskId: t.taskId,
            label: t.label,
            isRequired: t.isRequired,
            sortOrder: t.sortOrder,
          })),
        ...customerAdditions.map((t) => ({
          taskId: t.taskId,
          label: t.label,
          isRequired: t.isRequired,
          sortOrder: t.sortOrder,
        })),
      ].sort((a, b) => a.sortOrder - b.sortOrder)

      // ── 5. Fetch WO details if this is a work order stop ───────────────────
      let workOrderContext: StopContext["workOrder"] = null
      if (currentStop?.workOrderId) {
        const [wo] = await db
          .select({
            title: workOrders.title,
            description: workOrders.description,
            category: workOrders.category,
            priority: workOrders.priority,
          })
          .from(workOrders)
          .where(eq(workOrders.id, currentStop.workOrderId))
          .limit(1)

        if (wo) {
          const lineItemRows = await db
            .select({
              description: workOrderLineItems.description,
              quantity: workOrderLineItems.quantity,
              unit: workOrderLineItems.unit,
            })
            .from(workOrderLineItems)
            .where(eq(workOrderLineItems.work_order_id, currentStop.workOrderId))
            .orderBy(asc(workOrderLineItems.sort_order))

          workOrderContext = {
            title: wo.title,
            description: wo.description,
            category: wo.category,
            priority: wo.priority,
            lineItems: lineItemRows.map((li) => ({
              description: li.description,
              quantity: li.quantity,
              unit: li.unit,
            })),
          }
        }
      }

      // ── 6. Fetch equipment for this pool ──────────────────────────────────────
      const equipmentRows = await db
        .select({
          id: equipment.id,
          type: equipment.type,
          brand: equipment.brand,
          model: equipment.model,
        })
        .from(equipment)
        .where(eq(equipment.pool_id, poolId))

      // ── 7. Fetch previous visit's chemistry readings + internal notes ────────
      let previousChemistry: Record<string, number | null> = {}
      let previousInternalNotes: StopContext["previousInternalNotes"] = null

      const previousVisitRows = await db
        .select({
          chemistryReadings: serviceVisits.chemistry_readings,
          internalNotes: serviceVisits.internal_notes,
          internalFlags: serviceVisits.internal_flags,
          visitedAt: serviceVisits.visited_at,
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

      // Only populate previousInternalNotes if the last visit had notes or flags
      if (previousVisitRows[0]) {
        const prevVisit = previousVisitRows[0]
        const prevFlags = (prevVisit.internalFlags as string[] | null) ?? []
        const hasNotes = prevVisit.internalNotes || prevFlags.length > 0
        if (hasNotes) {
          previousInternalNotes = {
            notes: prevVisit.internalNotes ?? null,
            flags: prevFlags,
            visitedAt: prevVisit.visitedAt instanceof Date
              ? prevVisit.visitedAt.toISOString()
              : String(prevVisit.visitedAt),
          }
        }
      }

      // ── 7. Assemble context ───────────────────────────────────────────────
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
        serviceTypeName,
        routeStopId: currentStop?.id ?? null,
        workOrder: workOrderContext,
        previousInternalNotes,
        poolEquipment: equipmentRows,
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
        dosingAmounts: input.dosingAmounts?.map((d) => ({
          chemical: d.chemical,
          amount: d.amount,
          unit: d.unit,
        })) ?? null,
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
          dosing_amounts: (input.dosingAmounts ?? null) as unknown as Record<string, unknown> | null,
          internal_notes: input.internalNotes || null,
          internal_flags: (input.internalFlags && input.internalFlags.length > 0 ? input.internalFlags : null) as unknown as string[] | null,
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
            dosing_amounts: (input.dosingAmounts ?? null) as unknown as Record<string, unknown> | null,
            internal_notes: input.internalNotes || null,
            internal_flags: (input.internalFlags && input.internalFlags.length > 0 ? input.internalFlags : null) as unknown as string[] | null,
          },
        })
    })

    // ── 9b. AI smart summary — non-blocking fire-and-forget ──────────────────
    // Generates a customer-friendly plain-language summary of the service visit.
    // Currently logs the result; persisting requires adding ai_summary column to
    // service_visits. Never blocks completion regardless of outcome.
    void (async () => {
      try {
        const { generateSmartSummary } = await import("@/actions/ai-reports")
        const summaryInput = {
          customerName,
          poolName,
          chemistryReadings: input.chemistry as Record<string, number | null>,
          dosingAmounts: input.dosingAmounts?.map((d) => ({
            chemical: d.chemical,
            amount: d.amount,
            unit: d.unit,
          })),
          checklistCompletion: input.checklist.map((item) => ({
            task: item.taskId,
            completed: item.completed,
          })),
          notes: input.notes || undefined,
        }
        const summaryResult = await generateSmartSummary(summaryInput)
        if (summaryResult.success && summaryResult.summary) {
          console.debug("[completeStop] AI smart summary generated for visit", input.visitId, ":", summaryResult.summary)
        }
      } catch (aiErr) {
        console.warn("[completeStop] Smart summary generation failed (non-blocking):", aiErr)
      }
    })()

    // ── 9c. Phase 13: Auto-decrement truck inventory from dosing amounts ────────
    // Non-blocking — inventory decrement failure NEVER blocks stop completion.
    if (input.dosingAmounts && input.dosingAmounts.length > 0) {
      try {
        const { decrementTruckInventoryFromDosing } = await import("@/actions/truck-inventory")
        await decrementTruckInventoryFromDosing(
          techId,
          orgId,
          input.dosingAmounts.map((d) => ({
            chemical_product_id: d.productId,
            amount: d.amount,
            unit: d.unit,
          })),
          token
        )
      } catch (invErr) {
        console.error("[completeStop] truck inventory decrement failed (non-blocking):", invErr)
      }
    }

    // ── 9c. Update route_stops.status to "complete" ─────────────────────────
    // The dispatch page reads from route_stops.status, not service_visits.
    // Without this, the dispatch page shows "scheduled" even after completion.
    // Look up the route_stop by pool + tech + today's date.
    try {
      const today = toLocalDateString(now)
      await adminDb
        .update(routeStops)
        .set({ status: "complete", updated_at: now })
        .where(
          and(
            eq(routeStops.org_id, token.org_id as string),
            eq(routeStops.pool_id, input.poolId),
            eq(routeStops.tech_id, techId),
            eq(routeStops.scheduled_date, today)
          )
        )
    } catch (rsErr) {
      console.error("[completeStop] route_stops status update failed (non-blocking):", rsErr)
    }

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

    // ── 12. NOTIF-05: Notify owner+office of stop completion (fire-and-forget) ──
    void notifyOrgRole(orgId, "owner+office", {
      type: "stop_completed",
      urgency: "informational",
      title: "Stop completed",
      body: `${techName} completed ${customerName}`,
      link: `/customers/${input.customerId}`,
    }).catch((err) =>
      console.error("[completeStop] NOTIF-05 dispatch failed (non-blocking):", err)
    )

    // ── 13. NOTIF-09: Chemistry alert if any readings are out of range ────────
    // Best-effort — we check chemistry readings after the fact so office can follow up.
    // Only fire on first completion (not edits).
    if (!isUpdate && input.chemistry && Object.keys(input.chemistry).length > 0) {
      try {
        const CHEMISTRY_LIMITS: Record<string, { min?: number; max?: number }> = {
          freeChlorine: { min: 1, max: 5 },
          pH: { min: 7.0, max: 7.9 },
          totalAlkalinity: { min: 60, max: 140 },
          calciumHardness: { min: 150, max: 450 },
          cya: { min: 20, max: 100 },
          bromine: { min: 2, max: 6 },
        }
        const outOfRangeParams: string[] = []
        for (const [param, val] of Object.entries(input.chemistry)) {
          if (val === null || val === undefined) continue
          const limits = CHEMISTRY_LIMITS[param]
          if (!limits) continue
          if ((limits.min !== undefined && val < limits.min) ||
              (limits.max !== undefined && val > limits.max)) {
            outOfRangeParams.push(`${param}: ${val}`)
          }
        }
        if (outOfRangeParams.length > 0) {
          void notifyOrgRole(orgId, "owner+office", {
            type: "chemistry_alert",
            urgency: "needs_action",
            title: "Chemistry out of range",
            body: `${outOfRangeParams.join(", ")} at ${customerName}`,
            link: `/customers/${input.customerId}`,
          }).catch((err) =>
            console.error("[completeStop] NOTIF-09 dispatch failed (non-blocking):", err)
          )
        }
      } catch (chemAlertErr) {
        // Non-fatal — chemistry alert check must never block completion
        console.error("[completeStop] Chemistry alert check failed (non-blocking):", chemAlertErr)
      }
    }

    // ── 14. NOTIF-25: Send service_report_sms to customer (best-effort) ─────
    // Only on first completion. Skip if no phone number.
    if (!isUpdate) {
      const customerPhone = await adminDb
        .select({ phone: customers.phone })
        .from(customers)
        .where(eq(customers.id, input.customerId))
        .limit(1)
        .then((rows) => rows[0]?.phone ?? null)

      if (customerPhone) {
        try {
          const smsTemplate = await getResolvedTemplate(orgId, "service_report_sms", {
            customer_name: customerName,
            company_name: companyName,
            tech_name: techName,
            report_link: reportUrl,
          })
          if (smsTemplate?.sms_text) {
            const supabase = await createClient()
            await supabase.functions.invoke("send-sms", {
              body: {
                to: customerPhone,
                text: smsTemplate.sms_text,
                orgId,
              },
            })
          }
        } catch (smsErr) {
          // Non-fatal — SMS failure must never block completion
          console.error("[completeStop] service_report_sms failed (non-blocking):", smsErr)
        }
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
// markStopStarted
// ---------------------------------------------------------------------------

/**
 * markStopStarted — records when a tech begins a stop (in_progress transition).
 *
 * Phase 9: Sets started_at on route_stops so stop duration can be calculated
 * as (completed_at - started_at) in the Operations and Team reports.
 *
 * This is best-effort and fire-and-forget — if the route_stop row doesn't
 * exist (e.g. Phase 3 fallback), the update is a no-op. Duration data will
 * simply be missing for those stops.
 *
 * @param routeStopId - The route_stops.id for the stop being started
 */
export async function markStopStarted(
  routeStopId: string
): Promise<{ success: boolean; error?: string }> {
  const token = await getRlsToken()
  if (!token) return { success: false, error: "Not authenticated" }

  try {
    await withRls(token, async (db) => {
      await db
        .update(routeStops)
        .set({ started_at: new Date() })
        .where(eq(routeStops.id, routeStopId))
    })
    return { success: true }
  } catch (err) {
    console.error("[markStopStarted] Error:", err)
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

    const orgId = token.org_id as string

    await withRls(token, async (db) => {
      await db
        .insert(serviceVisits)
        .values({
          id: input.visitId,
          org_id: orgId,
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

    // Update route_stops.status to "skipped" so dispatch page reflects it
    if (input.routeStopId) {
      try {
        await adminDb
          .update(routeStops)
          .set({ status: "skipped", updated_at: now })
          .where(eq(routeStops.id, input.routeStopId))
      } catch (rsErr) {
        console.error("[skipStop] route_stops status update failed (non-blocking):", rsErr)
      }
    }

    // ── NOTIF-06: Notify owner+office of skipped stop (fire-and-forget) ──────
    const techId = token.sub
    const [techRow, customerRow] = await Promise.allSettled([
      adminDb.select({ full_name: profiles.full_name }).from(profiles).where(eq(profiles.id, techId)).limit(1),
      adminDb.select({ full_name: customers.full_name }).from(customers).where(eq(customers.id, input.customerId)).limit(1),
    ])
    const techName = techRow.status === "fulfilled" ? (techRow.value[0]?.full_name ?? "Tech") : "Tech"
    const customerName = customerRow.status === "fulfilled" ? (customerRow.value[0]?.full_name ?? "Customer") : "Customer"

    void notifyOrgRole(orgId, "owner+office", {
      type: "stop_skipped",
      urgency: "needs_action",
      title: "Stop skipped",
      body: `${techName} skipped ${customerName}: ${input.skipReason.trim()}`,
      link: `/customers/${input.customerId}`,
    }).catch((err) =>
      console.error("[skipStop] NOTIF-06 dispatch failed (non-blocking):", err)
    )

    return { success: true }
  } catch (err) {
    console.error("[skipStop] Error:", err)
    return {
      success: false,
      error: err instanceof Error ? err.message : "Unknown error",
    }
  }
}

// ---------------------------------------------------------------------------
// updateInternalNotes
// ---------------------------------------------------------------------------

/**
 * updateInternalNotes — allows office/owner to add or edit internal notes on
 * a service visit after the fact.
 *
 * Phase 10: Separate from completeStop so office can annotate historic visits.
 * Tech can also update their own visit notes via this action.
 *
 * @param visitId - UUID of the service_visit row
 * @param notes   - Updated notes text (empty string clears the note)
 * @param flags   - Updated flag list (empty array clears all flags)
 */
export async function updateInternalNotes(
  visitId: string,
  notes: string,
  flags: string[]
): Promise<{ success: boolean; error?: string }> {
  const token = await getRlsToken()
  if (!token) return { success: false, error: "Not authenticated" }

  try {
    await withRls(token, async (db) => {
      await db
        .update(serviceVisits)
        .set({
          internal_notes: notes.trim() || null,
          internal_flags: (flags.length > 0 ? flags : null) as unknown as string[] | null,
        })
        .where(eq(serviceVisits.id, visitId))
    })

    return { success: true }
  } catch (err) {
    console.error("[updateInternalNotes] Error:", err)
    return {
      success: false,
      error: err instanceof Error ? err.message : "Unknown error",
    }
  }
}

// TODO(10-10): Wire NOTIF-07 (stop_cant_complete) when a markCantComplete() action is added.
// When a tech marks a stop as can't-complete, call:
//   notifyOrgRole(orgId, 'owner+office', { type: 'stop_cant_complete', urgency: 'needs_action',
//     title: 'Stop inaccessible', body: '{techName} could not service {customerName}: {reason}',
//     link: '/customers/{customerId}' })
