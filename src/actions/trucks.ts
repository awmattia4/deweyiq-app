"use server"

/**
 * trucks.ts — Truck entity CRUD + tech assignment management.
 *
 * Core helper: getTechIdsOnSameTruck() — given a tech_id, returns all tech_ids
 * that share the same truck. Falls back to [techId] if no truck assignment exists.
 * This is the KEY function that enables shared truck inventory.
 */

import { withRls, getRlsToken, adminDb } from "@/lib/db"
import { trucks, techTruckAssignments, dailyTruckOverrides } from "@/lib/db/schema"
import { profiles } from "@/lib/db/schema"
import { eq, and, inArray, asc, isNull } from "drizzle-orm"
import { toLocalDateString } from "@/lib/date-utils"

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface TruckRow {
  id: string
  name: string
  is_active: boolean
  assignedTechs: Array<{ id: string; fullName: string }>
}

export interface CreateTruckInput {
  name: string
  techIds: string[]
}

// ---------------------------------------------------------------------------
// Core helper: getTechIdsOnSameTruck
// ---------------------------------------------------------------------------

/**
 * Given a tech_id, returns all tech_ids that share the same truck TODAY.
 *
 * Checks daily_truck_overrides first (per-day reassignment from schedule page),
 * then falls back to permanent tech_truck_assignments from Settings.
 *
 * If the tech is NOT assigned to any truck, returns [techId] (solo).
 * Uses adminDb for performance — called from auto-decrement which is non-blocking.
 */
export async function getTechIdsOnSameTruck(
  techId: string,
  orgId: string,
  date?: string
): Promise<string[]> {
  try {
    const effectiveDate = date ?? toLocalDateString()

    // 1. Check daily override for this tech + date
    const override = await adminDb
      .select({ truck_id: dailyTruckOverrides.truck_id })
      .from(dailyTruckOverrides)
      .where(
        and(
          eq(dailyTruckOverrides.tech_id, techId),
          eq(dailyTruckOverrides.org_id, orgId),
          eq(dailyTruckOverrides.override_date, effectiveDate)
        )
      )
      .limit(1)

    if (override.length > 0) {
      if (override[0].truck_id === null) {
        // Explicit solo override for today
        return [techId]
      }
      // Override to a specific truck — find all techs on that truck today
      return _getTechIdsForTruckOnDate(override[0].truck_id, orgId, effectiveDate, techId)
    }

    // 2. Fall back to permanent assignment
    const assignment = await adminDb
      .select({ truck_id: techTruckAssignments.truck_id })
      .from(techTruckAssignments)
      .where(
        and(
          eq(techTruckAssignments.tech_id, techId),
          eq(techTruckAssignments.org_id, orgId)
        )
      )
      .limit(1)

    if (assignment.length === 0) {
      return [techId]
    }

    const truckId = assignment[0].truck_id
    return _getTechIdsForTruckOnDate(truckId, orgId, effectiveDate, techId)
  } catch (err) {
    console.error("[getTechIdsOnSameTruck] Error:", err)
    return [techId]
  }
}

/**
 * Given a truck_id, returns all tech IDs on that truck for a specific date.
 * Checks daily overrides first — a tech with a solo override or override to
 * a different truck is excluded from this truck's crew for that day.
 */
async function _getTechIdsForTruckOnDate(
  truckId: string,
  orgId: string,
  date: string,
  requestingTechId: string
): Promise<string[]> {
  // Get all permanently assigned techs for this truck
  const permanentAssignments = await adminDb
    .select({ tech_id: techTruckAssignments.tech_id })
    .from(techTruckAssignments)
    .where(
      and(
        eq(techTruckAssignments.truck_id, truckId),
        eq(techTruckAssignments.org_id, orgId)
      )
    )

  const permanentTechIds = permanentAssignments.map((a) => a.tech_id)

  // Get any daily overrides for these techs on this date
  const overrides = permanentTechIds.length > 0
    ? await adminDb
        .select({
          tech_id: dailyTruckOverrides.tech_id,
          truck_id: dailyTruckOverrides.truck_id,
        })
        .from(dailyTruckOverrides)
        .where(
          and(
            eq(dailyTruckOverrides.org_id, orgId),
            eq(dailyTruckOverrides.override_date, date),
            inArray(dailyTruckOverrides.tech_id, permanentTechIds)
          )
        )
    : []

  const overrideMap = new Map(overrides.map((o) => [o.tech_id, o.truck_id]))

  // Filter: keep techs who are still on this truck today
  const activeTechIds = permanentTechIds.filter((tid) => {
    const dayOverride = overrideMap.get(tid)
    if (dayOverride === undefined) return true // no override, still on this truck
    if (dayOverride === null) return false // solo override, not on any truck today
    return dayOverride === truckId // overridden to same truck (no change)
  })

  // Also check if any techs are overridden TO this truck today (from other trucks)
  const incomingOverrides = await adminDb
    .select({ tech_id: dailyTruckOverrides.tech_id })
    .from(dailyTruckOverrides)
    .where(
      and(
        eq(dailyTruckOverrides.org_id, orgId),
        eq(dailyTruckOverrides.override_date, date),
        eq(dailyTruckOverrides.truck_id, truckId)
      )
    )

  for (const incoming of incomingOverrides) {
    if (!activeTechIds.includes(incoming.tech_id)) {
      activeTechIds.push(incoming.tech_id)
    }
  }

  // Ensure the requesting tech is always included
  if (!activeTechIds.includes(requestingTechId)) {
    activeTechIds.push(requestingTechId)
  }

  return activeTechIds.length > 0 ? activeTechIds : [requestingTechId]
}

/**
 * getTruckInfoForTech — returns the truck name and co-assigned techs for display.
 * Returns null if the tech isn't assigned to any truck.
 */
export async function getTruckInfoForTech(
  techId: string,
  orgId: string
): Promise<{ truckId: string; truckName: string; coTechs: Array<{ id: string; fullName: string }> } | null> {
  try {
    const assignment = await adminDb
      .select({
        truck_id: techTruckAssignments.truck_id,
        truck_name: trucks.name,
      })
      .from(techTruckAssignments)
      .innerJoin(trucks, eq(techTruckAssignments.truck_id, trucks.id))
      .where(
        and(
          eq(techTruckAssignments.tech_id, techId),
          eq(techTruckAssignments.org_id, orgId)
        )
      )
      .limit(1)

    if (assignment.length === 0) return null

    const { truck_id, truck_name } = assignment[0]

    // Get all OTHER techs on this truck
    const coAssignments = await adminDb
      .select({
        tech_id: techTruckAssignments.tech_id,
        full_name: profiles.full_name,
      })
      .from(techTruckAssignments)
      .innerJoin(profiles, eq(techTruckAssignments.tech_id, profiles.id))
      .where(
        and(
          eq(techTruckAssignments.truck_id, truck_id),
          eq(techTruckAssignments.org_id, orgId)
        )
      )

    return {
      truckId: truck_id,
      truckName: truck_name,
      coTechs: coAssignments
        .filter((a) => a.tech_id !== techId)
        .map((a) => ({ id: a.tech_id, fullName: a.full_name })),
    }
  } catch {
    return null
  }
}

/**
 * getTruckInfoForCurrentTech — server action wrapper that reads org from token.
 * Used by the inventory page client to show truck context.
 */
export async function getTruckInfoForCurrentTech(
  techId: string
): Promise<{ truckName: string; coTechs: Array<{ id: string; fullName: string }> } | null> {
  const token = await getRlsToken()
  if (!token) return null
  const orgId = token.org_id as string
  return getTruckInfoForTech(techId, orgId)
}

// ---------------------------------------------------------------------------
// Daily truck overrides
// ---------------------------------------------------------------------------

/**
 * setDailyTruckOverride — Override a tech's truck for a specific date.
 * truck_id = null means "solo for this day" (no sharing).
 * truck_id = some UUID means "on this truck for this day instead of their default".
 */
export async function setDailyTruckOverride(
  techId: string,
  date: string,
  truckId: string | null
): Promise<{ success: boolean; error?: string }> {
  const token = await getRlsToken()
  if (!token) return { success: false, error: "Not authenticated" }

  const orgId = token.org_id as string
  const userRole = token.user_role as string | undefined
  if (!userRole || !["owner", "office"].includes(userRole)) {
    return { success: false, error: "Insufficient permissions" }
  }

  try {
    // Upsert: insert or update on conflict (org_id, tech_id, override_date)
    await adminDb
      .insert(dailyTruckOverrides)
      .values({
        org_id: orgId,
        tech_id: techId,
        truck_id: truckId,
        override_date: date,
      })
      .onConflictDoUpdate({
        target: [dailyTruckOverrides.org_id, dailyTruckOverrides.tech_id, dailyTruckOverrides.override_date],
        set: { truck_id: truckId },
      })

    return { success: true }
  } catch (err) {
    console.error("[setDailyTruckOverride] Error:", err)
    return { success: false, error: "Failed to set override" }
  }
}

/**
 * removeDailyTruckOverride — Remove a daily override, reverting to the permanent assignment.
 */
export async function removeDailyTruckOverride(
  techId: string,
  date: string
): Promise<{ success: boolean; error?: string }> {
  const token = await getRlsToken()
  if (!token) return { success: false, error: "Not authenticated" }

  const orgId = token.org_id as string
  const userRole = token.user_role as string | undefined
  if (!userRole || !["owner", "office"].includes(userRole)) {
    return { success: false, error: "Insufficient permissions" }
  }

  try {
    await adminDb
      .delete(dailyTruckOverrides)
      .where(
        and(
          eq(dailyTruckOverrides.org_id, orgId),
          eq(dailyTruckOverrides.tech_id, techId),
          eq(dailyTruckOverrides.override_date, date)
        )
      )

    return { success: true }
  } catch (err) {
    console.error("[removeDailyTruckOverride] Error:", err)
    return { success: false, error: "Failed to remove override" }
  }
}

/**
 * getDailyOverridesForDate — Returns all overrides for a specific date.
 * Used by the schedule page to show which techs have truck changes today.
 */
export async function getDailyOverridesForDate(
  date: string
): Promise<Array<{ techId: string; truckId: string | null; truckName: string | null }>> {
  const token = await getRlsToken()
  if (!token) return []

  const orgId = token.org_id as string

  try {
    const overrides = await adminDb
      .select({
        tech_id: dailyTruckOverrides.tech_id,
        truck_id: dailyTruckOverrides.truck_id,
        truck_name: trucks.name,
      })
      .from(dailyTruckOverrides)
      .leftJoin(trucks, eq(dailyTruckOverrides.truck_id, trucks.id))
      .where(
        and(
          eq(dailyTruckOverrides.org_id, orgId),
          eq(dailyTruckOverrides.override_date, date)
        )
      )

    return overrides.map((o) => ({
      techId: o.tech_id,
      truckId: o.truck_id,
      truckName: o.truck_name,
    }))
  } catch {
    return []
  }
}

// ---------------------------------------------------------------------------
// CRUD: Trucks
// ---------------------------------------------------------------------------

/**
 * getTrucks — Returns all trucks for the org with assigned tech names.
 */
export async function getTrucks(): Promise<
  { success: true; trucks: TruckRow[] } | { success: false; error: string }
> {
  const token = await getRlsToken()
  if (!token) return { success: false, error: "Not authenticated" }

  const orgId = token.org_id as string
  const userRole = token.user_role as string | undefined
  if (!userRole || !["owner", "office"].includes(userRole)) {
    return { success: false, error: "Insufficient permissions" }
  }

  try {
    const truckRows = await withRls(token, (db) =>
      db
        .select({
          id: trucks.id,
          name: trucks.name,
          is_active: trucks.is_active,
        })
        .from(trucks)
        .where(eq(trucks.org_id, orgId))
        .orderBy(asc(trucks.name))
    )

    // Fetch all assignments for this org in one query
    const assignmentRows = await withRls(token, (db) =>
      db
        .select({
          truck_id: techTruckAssignments.truck_id,
          tech_id: techTruckAssignments.tech_id,
          full_name: profiles.full_name,
        })
        .from(techTruckAssignments)
        .innerJoin(profiles, eq(techTruckAssignments.tech_id, profiles.id))
        .where(eq(techTruckAssignments.org_id, orgId))
    )

    // Group assignments by truck
    const assignmentsByTruck = new Map<string, Array<{ id: string; fullName: string }>>()
    for (const a of assignmentRows) {
      if (!assignmentsByTruck.has(a.truck_id)) {
        assignmentsByTruck.set(a.truck_id, [])
      }
      assignmentsByTruck.get(a.truck_id)!.push({ id: a.tech_id, fullName: a.full_name })
    }

    const result: TruckRow[] = truckRows.map((t) => ({
      id: t.id,
      name: t.name,
      is_active: t.is_active,
      assignedTechs: assignmentsByTruck.get(t.id) ?? [],
    }))

    return { success: true, trucks: result }
  } catch (err) {
    console.error("[getTrucks] Error:", err)
    return { success: false, error: "Failed to load trucks" }
  }
}

/**
 * createTruck — Creates a truck and assigns techs to it.
 */
export async function createTruck(
  input: CreateTruckInput
): Promise<{ success: true; truck: TruckRow } | { success: false; error: string }> {
  const token = await getRlsToken()
  if (!token) return { success: false, error: "Not authenticated" }

  const orgId = token.org_id as string
  const userRole = token.user_role as string | undefined
  if (!userRole || !["owner", "office"].includes(userRole)) {
    return { success: false, error: "Insufficient permissions" }
  }

  if (!input.name?.trim()) {
    return { success: false, error: "Truck name is required" }
  }

  try {
    // Create the truck
    const [created] = await withRls(token, (db) =>
      db
        .insert(trucks)
        .values({
          org_id: orgId,
          name: input.name.trim(),
          is_active: true,
        })
        .returning()
    )

    // Remove any existing assignments for these techs (each tech can only be on one truck)
    if (input.techIds.length > 0) {
      await adminDb
        .delete(techTruckAssignments)
        .where(
          and(
            eq(techTruckAssignments.org_id, orgId),
            inArray(techTruckAssignments.tech_id, input.techIds)
          )
        )

      // Create new assignments
      await adminDb.insert(techTruckAssignments).values(
        input.techIds.map((techId) => ({
          org_id: orgId,
          tech_id: techId,
          truck_id: created.id,
        }))
      )
    }

    // Fetch assigned tech names for the response
    const techNames = input.techIds.length > 0
      ? await adminDb
          .select({ id: profiles.id, full_name: profiles.full_name })
          .from(profiles)
          .where(inArray(profiles.id, input.techIds))
      : []

    return {
      success: true,
      truck: {
        id: created.id,
        name: created.name,
        is_active: created.is_active,
        assignedTechs: techNames.map((t) => ({ id: t.id, fullName: t.full_name })),
      },
    }
  } catch (err) {
    console.error("[createTruck] Error:", err)
    return { success: false, error: "Failed to create truck" }
  }
}

/**
 * updateTruck — Updates truck name and reassigns techs.
 */
export async function updateTruck(
  truckId: string,
  input: CreateTruckInput
): Promise<{ success: true; truck: TruckRow } | { success: false; error: string }> {
  const token = await getRlsToken()
  if (!token) return { success: false, error: "Not authenticated" }

  const orgId = token.org_id as string
  const userRole = token.user_role as string | undefined
  if (!userRole || !["owner", "office"].includes(userRole)) {
    return { success: false, error: "Insufficient permissions" }
  }

  if (!input.name?.trim()) {
    return { success: false, error: "Truck name is required" }
  }

  try {
    // Update truck name
    const [updated] = await withRls(token, (db) =>
      db
        .update(trucks)
        .set({ name: input.name.trim(), updated_at: new Date() })
        .where(and(eq(trucks.id, truckId), eq(trucks.org_id, orgId)))
        .returning()
    )

    if (!updated) return { success: false, error: "Truck not found" }

    // Remove all existing assignments for this truck
    await adminDb
      .delete(techTruckAssignments)
      .where(
        and(
          eq(techTruckAssignments.truck_id, truckId),
          eq(techTruckAssignments.org_id, orgId)
        )
      )

    // Also remove any existing assignments for techs being reassigned
    // (each tech can only be on one truck)
    if (input.techIds.length > 0) {
      await adminDb
        .delete(techTruckAssignments)
        .where(
          and(
            eq(techTruckAssignments.org_id, orgId),
            inArray(techTruckAssignments.tech_id, input.techIds)
          )
        )

      // Create new assignments
      await adminDb.insert(techTruckAssignments).values(
        input.techIds.map((techId) => ({
          org_id: orgId,
          tech_id: techId,
          truck_id: truckId,
        }))
      )
    }

    // Fetch assigned tech names
    const techNames = input.techIds.length > 0
      ? await adminDb
          .select({ id: profiles.id, full_name: profiles.full_name })
          .from(profiles)
          .where(inArray(profiles.id, input.techIds))
      : []

    return {
      success: true,
      truck: {
        id: updated.id,
        name: updated.name,
        is_active: updated.is_active,
        assignedTechs: techNames.map((t) => ({ id: t.id, fullName: t.full_name })),
      },
    }
  } catch (err) {
    console.error("[updateTruck] Error:", err)
    return { success: false, error: "Failed to update truck" }
  }
}

/**
 * deactivateTruck — Soft-deletes a truck and removes all assignments.
 */
export async function deactivateTruck(
  truckId: string
): Promise<{ success: boolean; error?: string }> {
  const token = await getRlsToken()
  if (!token) return { success: false, error: "Not authenticated" }

  const orgId = token.org_id as string
  const userRole = token.user_role as string | undefined
  if (!userRole || !["owner", "office"].includes(userRole)) {
    return { success: false, error: "Insufficient permissions" }
  }

  try {
    // Remove all tech assignments for this truck
    await adminDb
      .delete(techTruckAssignments)
      .where(
        and(
          eq(techTruckAssignments.truck_id, truckId),
          eq(techTruckAssignments.org_id, orgId)
        )
      )

    // Soft-delete the truck
    await withRls(token, (db) =>
      db
        .update(trucks)
        .set({ is_active: false, updated_at: new Date() })
        .where(and(eq(trucks.id, truckId), eq(trucks.org_id, orgId)))
    )

    return { success: true }
  } catch (err) {
    console.error("[deactivateTruck] Error:", err)
    return { success: false, error: "Failed to deactivate truck" }
  }
}
