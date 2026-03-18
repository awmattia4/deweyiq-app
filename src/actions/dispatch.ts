"use server"

import { createClient } from "@/lib/supabase/server"
import { withRls, getRlsToken } from "@/lib/db"
import type { SupabaseToken } from "@/lib/db"
import { routeStops, customers, pools, profiles, orgSettings } from "@/lib/db/schema"
import { and, eq, asc } from "drizzle-orm"
import { toLocalDateString } from "@/lib/date-utils"

// ─── Types ─────────────────────────────────────────────────────────────────────

/**
 * A tech as shown on the dispatch map.
 * Color is pre-assigned from a fixed OKLCH palette so each tech
 * gets a consistent color across map markers, route lines, and filter chips.
 */
export interface DispatchTech {
  id: string
  name: string
  /** Hex color string for this tech's markers and route line */
  color: string
}

/**
 * A single stop on the dispatch map.
 * Used for stop markers, route lines, and popup cards.
 */
export interface DispatchStop {
  id: string
  techId: string | null
  customerId: string
  customerName: string
  address: string | null
  poolName: string
  /** 'scheduled' | 'in_progress' | 'complete' | 'skipped' | 'holiday' */
  status: string
  sortIndex: number
  /** HH:MM:SS from window_start if set — displayed as scheduled time in popup */
  scheduledTime: string | null
  lat: number | null
  lng: number | null
}

/**
 * The full data payload for the dispatch map page.
 */
export interface DispatchData {
  techs: DispatchTech[]
  stops: DispatchStop[]
  homeBase: { lat: number; lng: number } | null
}

// ─── Color palette ─────────────────────────────────────────────────────────────

/**
 * 10 visually distinct hex colors for tech map markers.
 * MUST be hex — MapLibre WebGL paint properties cannot parse oklch().
 * Cycles if there are more than 10 techs (unusual for a pool company).
 */
const TECH_COLORS = [
  "#3b82f6",  // blue
  "#22c55e",  // green
  "#f97316",  // orange
  "#a855f7",  // purple
  "#14b8a6",  // teal
  "#84cc16",  // yellow-green
  "#ef4444",  // red
  "#8b5cf6",  // violet
  "#06b6d4",  // cyan
  "#eab308",  // yellow
]

// ─── Helpers ───────────────────────────────────────────────────────────────────


// ─── Server actions ─────────────────────────────────────────────────────────────

/**
 * getDispatchData — fetches all route_stops for today across all techs in the org.
 *
 * Returns techs (with assigned colors) and stops (with customer/pool details).
 * Owner/office only — tech role is blocked by the page-level role guard.
 *
 * Uses LEFT JOINs (no correlated subqueries) per the RLS pitfall in MEMORY.md.
 */
export async function getDispatchData(): Promise<DispatchData> {
  const token = await getRlsToken()
  if (!token) return { techs: [], stops: [], homeBase: null }

  const orgId = token["org_id"] as string | undefined
  const userRole = token["user_role"] as string | undefined

  if (!orgId) return { techs: [], stops: [], homeBase: null }
  if (!userRole || !["owner", "office"].includes(userRole)) {
    return { techs: [], stops: [], homeBase: null }
  }

  const today = toLocalDateString()

  try {
    return await withRls(token, async (db) => {
      // ── Fetch today's route stops for the entire org ────────────────────────
      const stopRows = await db
        .select({
          id: routeStops.id,
          tech_id: routeStops.tech_id,
          customer_id: routeStops.customer_id,
          pool_id: routeStops.pool_id,
          sort_index: routeStops.sort_index,
          status: routeStops.status,
          window_start: routeStops.window_start,
        })
        .from(routeStops)
        .where(
          and(
            eq(routeStops.org_id, orgId),
            eq(routeStops.scheduled_date, today)
          )
        )
        .orderBy(asc(routeStops.sort_index))

      if (stopRows.length === 0) return { techs: [], stops: [], homeBase: null }

      // ── Fetch all customers in org ──────────────────────────────────────────
      const customerRows = await db
        .select({
          id: customers.id,
          full_name: customers.full_name,
          address: customers.address,
          lat: customers.lat,
          lng: customers.lng,
        })
        .from(customers)
        .where(eq(customers.org_id, orgId))

      const customerMap = new Map(customerRows.map((c) => [c.id, c]))

      // ── Fetch all pools in org ─────────────────────────────────────────────
      const poolRows = await db
        .select({
          id: pools.id,
          name: pools.name,
        })
        .from(pools)
        .where(eq(pools.org_id, orgId))

      const poolMap = new Map(poolRows.map((p) => [p.id, p]))

      // ── Fetch all tech profiles in org ─────────────────────────────────────
      const techIds = [...new Set(stopRows.map((s) => s.tech_id).filter(Boolean))] as string[]

      const techProfiles =
        techIds.length > 0
          ? await db
              .select({
                id: profiles.id,
                full_name: profiles.full_name,
              })
              .from(profiles)
              .where(eq(profiles.org_id, orgId))
          : []

      // Filter to only profiles that are actually assigned as techs today
      const assignedTechProfiles = techProfiles.filter((p) =>
        techIds.includes(p.id)
      )

      // ── Assign colors to techs ──────────────────────────────────────────────
      const techs: DispatchTech[] = assignedTechProfiles.map((profile, idx) => ({
        id: profile.id,
        name: profile.full_name,
        color: TECH_COLORS[idx % TECH_COLORS.length],
      }))

      // ── Build stop records ─────────────────────────────────────────────────
      const stops: DispatchStop[] = stopRows.map((stop) => {
        const customer = stop.customer_id ? customerMap.get(stop.customer_id) : undefined
        const pool = stop.pool_id ? poolMap.get(stop.pool_id) : undefined

        return {
          id: stop.id,
          techId: stop.tech_id,
          customerId: stop.customer_id,
          customerName: customer?.full_name ?? "Unknown Customer",
          address: customer?.address ?? null,
          poolName: pool?.name ?? "Pool",
          status: stop.status,
          sortIndex: stop.sort_index,
          scheduledTime: stop.window_start ?? null,
          lat: customer?.lat ?? null,
          lng: customer?.lng ?? null,
        }
      })

      // ── Fetch home base from org settings ────────────────────────────────
      const homeBaseRows = await db
        .select({
          lat: orgSettings.home_base_lat,
          lng: orgSettings.home_base_lng,
        })
        .from(orgSettings)
        .where(eq(orgSettings.org_id, orgId))
        .limit(1)

      const hb = homeBaseRows[0]
      const homeBase =
        hb?.lat != null && hb?.lng != null
          ? { lat: hb.lat, lng: hb.lng }
          : null

      return { techs, stops, homeBase }
    })
  } catch (error) {
    console.error("[getDispatchData] Error:", error)
    return { techs: [], stops: [], homeBase: null }
  }
}
