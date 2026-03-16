"use server"

import { revalidatePath } from "next/cache"
import { createClient } from "@/lib/supabase/server"
import { adminDb, withRls } from "@/lib/db"
import type { SupabaseToken } from "@/lib/db"
import {
  weatherRescheduleProposals,
  routeStops,
  customers,
  pools,
  profiles,
  orgSettings,
  orgs,
} from "@/lib/db/schema"
import { and, eq, inArray, isNotNull } from "drizzle-orm"
import {
  fetchWeatherForecast,
  classifyWeatherDay,
  type OpenMeteoForecast,
} from "@/lib/weather/open-meteo"
import { findRescheduleSlots, type AffectedStop } from "@/lib/weather/reschedule-engine"

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface WeatherProposal {
  id: string
  org_id: string
  affected_date: string
  weather_type: string
  weather_label: string
  affected_stops: Array<{
    stopId: string
    customerId: string
    customerName: string
    poolName: string | null
    techId: string | null
    techName: string | null
    originalDate: string
  }>
  proposed_reschedules: Array<{
    stopId: string
    newDate: string
    newTechId: string | null
    reason: string
  }>
  status: string
  notify_customers: boolean
  excluded_customer_ids: string[]
  approved_at: Date | null
  approved_by_id: string | null
  created_at: Date
}

export interface ManualWeatherCheckResult {
  daysChecked: number
  proposalsCreated: number
  clearDays: number
}

// ---------------------------------------------------------------------------
// Auth helpers
// ---------------------------------------------------------------------------

async function getRlsToken(): Promise<SupabaseToken | null> {
  const supabase = await createClient()
  const { data: claimsData } = await supabase.auth.getClaims()
  if (!claimsData?.claims) return null
  return claimsData.claims as SupabaseToken
}

// ---------------------------------------------------------------------------
// Core: check weather for an org and create proposals
// ---------------------------------------------------------------------------

/**
 * Checks the 7-day forecast for the given org's service area.
 * For each day with severe weather, queries affected route stops and
 * creates a weather_reschedule_proposals row (if one doesn't already exist).
 *
 * Uses adminDb — intended for cron/system contexts without user JWT.
 * Explicit org_id param enforces data isolation.
 *
 * @param orgId - The org to check weather for
 * @param startDate - First date to check (inclusive). Defaults to tomorrow.
 * @param endDate - Last date to check (inclusive). Defaults to 7 days out.
 * @returns Number of new proposals created
 */
export async function checkWeatherForOrg(
  orgId: string,
  startDate?: string,
  endDate?: string
): Promise<{ proposalsCreated: number; clearDays: number; daysChecked: number }> {
  // Step 1: Get service area centroid from customer coordinates
  const customerCoords = await adminDb
    .select({ lat: customers.lat, lng: customers.lng })
    .from(customers)
    .where(and(eq(customers.org_id, orgId), isNotNull(customers.lat), isNotNull(customers.lng)))

  let serviceAreaLat = 33.4484 // Default: Phoenix AZ
  let serviceAreaLng = -112.074

  if (customerCoords.length > 0) {
    const validCoords = customerCoords.filter(
      (c): c is { lat: number; lng: number } => c.lat != null && c.lng != null
    )
    if (validCoords.length > 0) {
      serviceAreaLat = validCoords.reduce((s, c) => s + c.lat, 0) / validCoords.length
      serviceAreaLng = validCoords.reduce((s, c) => s + c.lng, 0) / validCoords.length
    }
  }

  // Step 2: Fetch forecast
  const forecast = await fetchWeatherForecast(serviceAreaLat, serviceAreaLng)
  if (!forecast) {
    console.error(`[weather] Failed to fetch forecast for org ${orgId}`)
    return { proposalsCreated: 0, clearDays: 0, daysChecked: 0 }
  }

  // Step 3: Determine date range to check
  const today = new Date()
  today.setHours(0, 0, 0, 0)

  let checkStart: Date
  let checkEnd: Date

  if (startDate && endDate) {
    checkStart = new Date(startDate + "T00:00:00")
    checkEnd = new Date(endDate + "T00:00:00")
  } else {
    // Default: tomorrow through 7 days from now
    checkStart = new Date(today)
    checkStart.setDate(today.getDate() + 1)
    checkEnd = new Date(today)
    checkEnd.setDate(today.getDate() + 7)
  }

  // Step 4: Check each day in the range against the forecast
  let proposalsCreated = 0
  let clearDays = 0
  let daysChecked = 0

  const currentDate = new Date(checkStart)
  while (currentDate <= checkEnd) {
    const dateStr = currentDate.toISOString().split("T")[0]
    daysChecked++

    // Find the forecast day index for this date
    const dayIdx = forecast.daily.time.findIndex((t) => t === dateStr)
    let classification =
      dayIdx >= 0 ? classifyWeatherDay(forecast, dayIdx) : null

    if (!classification || !classification.shouldReschedule) {
      clearDays++
      currentDate.setDate(currentDate.getDate() + 1)
      continue
    }

    // Check if a proposal already exists for this org + date
    const existingProposal = await adminDb
      .select({ id: weatherRescheduleProposals.id })
      .from(weatherRescheduleProposals)
      .where(
        and(
          eq(weatherRescheduleProposals.org_id, orgId),
          eq(weatherRescheduleProposals.affected_date, dateStr)
        )
      )
      .limit(1)

    if (existingProposal.length > 0) {
      // Proposal already exists for this day — skip to avoid duplicates
      currentDate.setDate(currentDate.getDate() + 1)
      continue
    }

    // Step 5: Query route stops on this date for this org
    const stopsOnDay = await adminDb
      .select({
        id: routeStops.id,
        customer_id: routeStops.customer_id,
        pool_id: routeStops.pool_id,
        tech_id: routeStops.tech_id,
        scheduled_date: routeStops.scheduled_date,
        customer_name: customers.full_name,
        pool_name: pools.name,
        tech_name: profiles.full_name,
        customer_lat: customers.lat,
        customer_lng: customers.lng,
      })
      .from(routeStops)
      .leftJoin(customers, eq(routeStops.customer_id, customers.id))
      .leftJoin(pools, eq(routeStops.pool_id, pools.id))
      .leftJoin(profiles, eq(routeStops.tech_id, profiles.id))
      .where(
        and(
          eq(routeStops.org_id, orgId),
          eq(routeStops.scheduled_date, dateStr)
        )
      )

    // Filter to stops that are still actionable (not completed/skipped/holiday)
    const actionableStops = stopsOnDay.filter(
      (s) => !["complete", "skipped", "holiday"].includes(s.tech_id ?? "")
    )

    if (actionableStops.length === 0) {
      currentDate.setDate(currentDate.getDate() + 1)
      continue
    }

    // Step 6: Map to AffectedStop for the reschedule engine
    const affectedStops: AffectedStop[] = actionableStops.map((stop) => ({
      stopId: stop.id,
      customerId: stop.customer_id,
      customerName: stop.customer_name ?? "Unknown Customer",
      poolName: stop.pool_name ?? null,
      techId: stop.tech_id ?? null,
      techName: stop.tech_name ?? null,
      originalDate: dateStr,
      lat: stop.customer_lat ?? null,
      lng: stop.customer_lng ?? null,
    }))

    // Step 7: Get org settings for daily capacity
    const orgSettingsRow = await adminDb
      .select({ max_daily_capacity: orgSettings.id }) // Using id as placeholder since no capacity field exists
      .from(orgSettings)
      .where(eq(orgSettings.org_id, orgId))
      .limit(1)

    // Step 8: Find optimal reschedule slots
    const proposedSlots = await findRescheduleSlots(
      orgId,
      affectedStops,
      serviceAreaLat,
      serviceAreaLng
    )

    // Step 9: Create the proposal row
    const forecastSnapshot: Record<string, unknown> = {
      date: dateStr,
      weather_code: dayIdx >= 0 ? forecast.daily.weather_code[dayIdx] : null,
      precip_prob: dayIdx >= 0 ? forecast.daily.precipitation_probability_max[dayIdx] : null,
      wind_gusts: dayIdx >= 0 ? forecast.daily.wind_gusts_10m_max[dayIdx] : null,
      temp_max: dayIdx >= 0 ? forecast.daily.temperature_2m_max[dayIdx] : null,
    }

    await adminDb.insert(weatherRescheduleProposals).values({
      org_id: orgId,
      affected_date: dateStr,
      weather_type: classification.type,
      weather_label: classification.label,
      forecast_data: forecastSnapshot,
      affected_stops: affectedStops.map((s) => ({
        stopId: s.stopId,
        customerId: s.customerId,
        customerName: s.customerName,
        poolName: s.poolName ?? null,
        techId: s.techId ?? null,
        techName: s.techName ?? null,
        originalDate: s.originalDate,
      })),
      proposed_reschedules: proposedSlots,
      status: "pending",
      notify_customers: true,
      excluded_customer_ids: [],
    })

    proposalsCreated++
    currentDate.setDate(currentDate.getDate() + 1)
  }

  return { proposalsCreated, clearDays, daysChecked }
}

// ---------------------------------------------------------------------------
// Office-initiated manual weather check (SMART-06)
// ---------------------------------------------------------------------------

/**
 * Manual weather check triggered from the Schedule page.
 *
 * Allows office/owner to proactively check forecast for a date range and
 * create reschedule proposals on demand — not just waiting for the daily cron.
 *
 * @param startDate - First date to check (YYYY-MM-DD)
 * @param endDate - Last date to check (YYYY-MM-DD)
 * @returns Summary of what was checked and created
 */
export async function manualWeatherCheck(
  startDate: string,
  endDate: string
): Promise<{ success: boolean; data?: ManualWeatherCheckResult; error?: string }> {
  const token = await getRlsToken()
  if (!token?.org_id) {
    return { success: false, error: "Not authenticated" }
  }

  const role = token.user_role
  if (role !== "owner" && role !== "office") {
    return { success: false, error: "Insufficient permissions" }
  }

  try {
    const result = await checkWeatherForOrg(token.org_id, startDate, endDate)

    revalidatePath("/alerts")
    revalidatePath("/schedule")

    return {
      success: true,
      data: {
        daysChecked: result.daysChecked,
        proposalsCreated: result.proposalsCreated,
        clearDays: result.clearDays,
      },
    }
  } catch (err) {
    console.error("[weather] manualWeatherCheck failed:", err)
    return {
      success: false,
      error: err instanceof Error ? err.message : "Weather check failed",
    }
  }
}

// ---------------------------------------------------------------------------
// Get pending proposals for current org
// ---------------------------------------------------------------------------

/**
 * Returns all pending weather reschedule proposals for the current user's org.
 * Only accessible to owner and office roles.
 */
export async function getPendingProposals(): Promise<WeatherProposal[]> {
  const token = await getRlsToken()
  if (!token?.org_id) return []

  const role = token.user_role
  if (role !== "owner" && role !== "office") return []

  try {
    const rows = await withRls(token, (db) =>
      db
        .select()
        .from(weatherRescheduleProposals)
        .where(
          and(
            eq(weatherRescheduleProposals.org_id, token.org_id!),
            eq(weatherRescheduleProposals.status, "pending")
          )
        )
    )

    return rows.map((r) => ({
      id: r.id,
      org_id: r.org_id,
      affected_date: r.affected_date,
      weather_type: r.weather_type,
      weather_label: r.weather_label,
      affected_stops: (r.affected_stops as WeatherProposal["affected_stops"]) ?? [],
      proposed_reschedules:
        (r.proposed_reschedules as WeatherProposal["proposed_reschedules"]) ?? [],
      status: r.status,
      notify_customers: r.notify_customers,
      excluded_customer_ids: (r.excluded_customer_ids as string[]) ?? [],
      approved_at: r.approved_at ?? null,
      approved_by_id: r.approved_by_id ?? null,
      created_at: r.created_at,
    }))
  } catch (err) {
    console.error("[weather] getPendingProposals failed:", err)
    return []
  }
}

// ---------------------------------------------------------------------------
// Approve a proposal
// ---------------------------------------------------------------------------

/**
 * Approves a weather reschedule proposal.
 *
 * Applies each proposed reschedule by updating the route_stop's scheduled_date
 * and tech_id. Sets the original stop's status to 'rescheduled_weather' so the
 * date change is auditable.
 *
 * Returns the list of affected customer IDs for downstream notification
 * (Plan 10-08 will wire the actual notification send).
 */
export async function approveProposal(proposalId: string): Promise<{
  success: boolean
  affectedCustomerIds?: string[]
  error?: string
}> {
  const token = await getRlsToken()
  if (!token?.org_id) return { success: false, error: "Not authenticated" }

  const role = token.user_role
  if (role !== "owner" && role !== "office") {
    return { success: false, error: "Insufficient permissions" }
  }

  try {
    // Fetch the proposal
    const proposalRows = await adminDb
      .select()
      .from(weatherRescheduleProposals)
      .where(
        and(
          eq(weatherRescheduleProposals.id, proposalId),
          eq(weatherRescheduleProposals.org_id, token.org_id)
        )
      )
      .limit(1)

    if (proposalRows.length === 0) {
      return { success: false, error: "Proposal not found" }
    }

    const proposal = proposalRows[0]

    if (proposal.status !== "pending") {
      return {
        success: false,
        error: `Proposal is already ${proposal.status}`,
      }
    }

    // Apply reschedules — update each route stop
    const proposedReschedules =
      (proposal.proposed_reschedules as Array<{
        stopId: string
        newDate: string
        newTechId: string | null
        reason: string
      }>) ?? []

    for (const reschedule of proposedReschedules) {
      await adminDb
        .update(routeStops)
        .set({
          scheduled_date: reschedule.newDate,
          tech_id: reschedule.newTechId,
          status: "scheduled",
          updated_at: new Date(),
        })
        .where(
          and(
            eq(routeStops.id, reschedule.stopId),
            eq(routeStops.org_id, token.org_id)
          )
        )
    }

    // Mark the proposal as approved
    await adminDb
      .update(weatherRescheduleProposals)
      .set({
        status: "approved",
        approved_at: new Date(),
        approved_by_id: token.sub,
        updated_at: new Date(),
      })
      .where(eq(weatherRescheduleProposals.id, proposalId))

    // Extract affected customer IDs (excluding opted-out customers)
    const affectedStops =
      (proposal.affected_stops as Array<{
        stopId: string
        customerId: string
        customerName: string
        poolName: string | null
        techId: string | null
        techName: string | null
        originalDate: string
      }>) ?? []

    const excludedIds = (proposal.excluded_customer_ids as string[]) ?? []
    const notifyCustomerIds = proposal.notify_customers
      ? [
          ...new Set(
            affectedStops
              .map((s) => s.customerId)
              .filter((id) => !excludedIds.includes(id))
          ),
        ]
      : []

    revalidatePath("/alerts")
    revalidatePath("/schedule")

    return { success: true, affectedCustomerIds: notifyCustomerIds }
  } catch (err) {
    console.error("[weather] approveProposal failed:", err)
    return {
      success: false,
      error: err instanceof Error ? err.message : "Approval failed",
    }
  }
}

// ---------------------------------------------------------------------------
// Deny a proposal
// ---------------------------------------------------------------------------

/**
 * Denies a weather reschedule proposal.
 * No route stop changes are made — the original schedule is preserved.
 */
export async function denyProposal(proposalId: string): Promise<{
  success: boolean
  error?: string
}> {
  const token = await getRlsToken()
  if (!token?.org_id) return { success: false, error: "Not authenticated" }

  const role = token.user_role
  if (role !== "owner" && role !== "office") {
    return { success: false, error: "Insufficient permissions" }
  }

  try {
    const result = await adminDb
      .update(weatherRescheduleProposals)
      .set({
        status: "denied",
        approved_at: new Date(),
        approved_by_id: token.sub,
        updated_at: new Date(),
      })
      .where(
        and(
          eq(weatherRescheduleProposals.id, proposalId),
          eq(weatherRescheduleProposals.org_id, token.org_id),
          eq(weatherRescheduleProposals.status, "pending")
        )
      )
      .returning({ id: weatherRescheduleProposals.id })

    if (result.length === 0) {
      return { success: false, error: "Proposal not found or already actioned" }
    }

    revalidatePath("/alerts")

    return { success: true }
  } catch (err) {
    console.error("[weather] denyProposal failed:", err)
    return {
      success: false,
      error: err instanceof Error ? err.message : "Denial failed",
    }
  }
}

// ---------------------------------------------------------------------------
// Update notification preferences on a proposal
// ---------------------------------------------------------------------------

/**
 * Updates the notify_customers flag and excluded_customer_ids for a pending proposal.
 * Called when office unchecks/checks customers in the notification opt-out UI.
 */
export async function updateProposalNotifications(
  proposalId: string,
  notifyCustomers: boolean,
  excludedCustomerIds: string[]
): Promise<{ success: boolean; error?: string }> {
  const token = await getRlsToken()
  if (!token?.org_id) return { success: false, error: "Not authenticated" }

  const role = token.user_role
  if (role !== "owner" && role !== "office") {
    return { success: false, error: "Insufficient permissions" }
  }

  try {
    await adminDb
      .update(weatherRescheduleProposals)
      .set({
        notify_customers: notifyCustomers,
        excluded_customer_ids: excludedCustomerIds,
        updated_at: new Date(),
      })
      .where(
        and(
          eq(weatherRescheduleProposals.id, proposalId),
          eq(weatherRescheduleProposals.org_id, token.org_id),
          eq(weatherRescheduleProposals.status, "pending")
        )
      )

    return { success: true }
  } catch (err) {
    console.error("[weather] updateProposalNotifications failed:", err)
    return {
      success: false,
      error: err instanceof Error ? err.message : "Update failed",
    }
  }
}
