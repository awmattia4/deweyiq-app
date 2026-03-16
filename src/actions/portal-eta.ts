"use server"

/**
 * portal-eta.ts — portal-safe ETA data helpers.
 *
 * Uses adminDb (no RLS) — portal customers don't have org_id in JWT claims.
 * Explicit org_id + customer_id filtering enforces data isolation.
 */

import { adminDb } from "@/lib/db"
import { routeStops } from "@/lib/db/schema"
import { and, eq } from "drizzle-orm"

/**
 * getCustomerTechForToday — find the tech assigned to a customer's stop today.
 *
 * Returns techId if the customer has an active (non-completed, non-skipped) stop
 * today, or null if no stop exists.
 *
 * Uses adminDb — portal customers have no user session JWT for RLS.
 * Explicit org_id + customer_id provides equivalent data isolation.
 */
export async function getCustomerTechForToday(
  customerId: string,
  orgId: string,
  date: string
): Promise<string | null> {
  const [stop] = await adminDb
    .select({
      tech_id: routeStops.tech_id,
      status: routeStops.status,
    })
    .from(routeStops)
    .where(
      and(
        eq(routeStops.org_id, orgId),
        eq(routeStops.customer_id, customerId),
        eq(routeStops.scheduled_date, date)
      )
    )
    .limit(1)

  if (!stop) return null

  // Completed or skipped stops — no active route for this customer today
  if (stop.status === "complete" || stop.status === "skipped") return null

  return stop.tech_id
}
