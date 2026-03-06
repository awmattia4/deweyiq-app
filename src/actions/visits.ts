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
} from "@/lib/db/schema"
import { eq, and, desc, isNull } from "drizzle-orm"
import type { ChemicalProduct, ChemicalKey } from "@/lib/chemistry/dosing"
import type { SanitizerType } from "@/lib/chemistry/targets"

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface StopContext {
  customerId: string
  poolId: string
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
// Server action
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
      // Using adminDb here because chemical_products is org-scoped and
      // the RLS context is already established via withRls above.
      // We filter by org_id derived from the pools table result.
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
      // Get tasks from templates with service_type = 'routine' or null
      // plus customer-level overrides — using LEFT JOIN + GROUP BY avoids
      // correlated subqueries on RLS-protected tables.
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
      // Customer-specific tasks (customerId == this customer) override/supplement template tasks
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
      // Using LEFT JOIN ensures no correlated subquery on RLS-protected table
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
      const sanitizerType = (poolRow.sanitizerType as SanitizerType | null) ?? "chlorine"

      return {
        customerId: poolRow.customerId ?? customerId,
        poolId: poolRow.poolId,
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
