// Deno Edge Function — generate-schedule
//
// Generates route_stops for the next 4 weeks based on active schedule rules.
// Designed to be called weekly via pg_cron:
//
//   SELECT cron.schedule(
//     'generate-weekly-schedule',
//     '0 2 * * 1',  -- every Monday at 2:00 AM
//     $$
//       SELECT net.http_post(
//         url := current_setting('app.supabase_url') || '/functions/v1/generate-schedule',
//         headers := jsonb_build_object(
//           'Content-Type', 'application/json',
//           'Authorization', 'Bearer ' || current_setting('app.service_role_key')
//         )
//       );
//     $$
//   );
//
// Security:
// - Uses Supabase service role key (bypasses RLS) for cross-org generation
// - Intended for internal cron triggering only; not exposed to client
//
// Algorithm (per RESEARCH.md):
// - weekly: every 7 days from anchor_date
// - biweekly: every 14 days from anchor_date
// - monthly: same day-of-month each month (clamped to month-end for short months)
// - custom: every custom_interval_days days from anchor_date
//
// Idempotency:
// - Uses onConflict: ignoreDuplicates on (org_id, customer_id, pool_id, scheduled_date)
// - Safe to run multiple times; existing stops are not modified

// deno-lint-ignore-file no-explicit-any
import { createClient } from "jsr:@supabase/supabase-js@2"

// ─── Types ────────────────────────────────────────────────────────────────────

interface ScheduleRule {
  id: string
  org_id: string
  customer_id: string
  pool_id: string | null
  tech_id: string | null
  frequency: string
  custom_interval_days: number | null
  anchor_date: string
  active: boolean
}

interface Holiday {
  date: string
  org_id: string
}

// ─── Date generation algorithm ────────────────────────────────────────────────

/**
 * Generate all service dates for a schedule rule within [windowStart, windowEnd].
 */
function generateDatesForRule(
  rule: ScheduleRule,
  windowStart: Date,
  windowEnd: Date
): Date[] {
  const anchor = new Date(rule.anchor_date + "T00:00:00")
  const dates: Date[] = []

  if (rule.frequency === "monthly") {
    const anchorDay = anchor.getDate()

    // Fast-forward to first monthly occurrence >= windowStart
    let current = new Date(anchor)
    while (current < windowStart) {
      const next = new Date(current.getFullYear(), current.getMonth() + 1, 1)
      const daysInMonth = new Date(next.getFullYear(), next.getMonth() + 1, 0).getDate()
      current = new Date(next.getFullYear(), next.getMonth(), Math.min(anchorDay, daysInMonth))
    }

    while (current <= windowEnd) {
      dates.push(new Date(current))
      const next = new Date(current.getFullYear(), current.getMonth() + 1, 1)
      const daysInMonth = new Date(next.getFullYear(), next.getMonth() + 1, 0).getDate()
      current = new Date(next.getFullYear(), next.getMonth(), Math.min(anchorDay, daysInMonth))
    }

    return dates
  }

  // Interval-based: weekly (7), biweekly (14), or custom N days
  const intervalDays =
    rule.frequency === "weekly" ? 7
    : rule.frequency === "biweekly" ? 14
    : (rule.custom_interval_days ?? 7)

  const msPerDay = 86_400_000

  // Fast-forward anchor to first occurrence >= windowStart
  let current = new Date(anchor)
  if (current < windowStart) {
    const daysDiff = Math.ceil((windowStart.getTime() - current.getTime()) / msPerDay)
    const steps = Math.floor(daysDiff / intervalDays)
    current = new Date(anchor.getTime() + steps * intervalDays * msPerDay)
    while (current < windowStart) {
      current = new Date(current.getTime() + intervalDays * msPerDay)
    }
  }

  while (current <= windowEnd) {
    dates.push(new Date(current))
    current = new Date(current.getTime() + intervalDays * msPerDay)
  }

  return dates
}

// ─── Main handler ─────────────────────────────────────────────────────────────

Deno.serve(async (_req: Request) => {
  const supabaseUrl = Deno.env.get("SUPABASE_URL")
  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")

  if (!supabaseUrl || !serviceRoleKey) {
    return new Response(
      JSON.stringify({ error: "Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY" }),
      { status: 500, headers: { "Content-Type": "application/json" } }
    )
  }

  // Use service role to bypass RLS — this function runs for all orgs
  const supabase = createClient(supabaseUrl, serviceRoleKey)

  const today = new Date()
  today.setHours(0, 0, 0, 0)
  const windowEnd = new Date(today)
  windowEnd.setDate(today.getDate() + 28)

  const todayStr = today.toISOString().split("T")[0]
  const windowEndStr = windowEnd.toISOString().split("T")[0]

  try {
    // Fetch all active schedule rules across all orgs
    const { data: rules, error: rulesError } = await supabase
      .from("schedule_rules")
      .select("*")
      .eq("active", true)

    if (rulesError) throw rulesError

    // Fetch holidays within the generation window (across all orgs)
    const { data: holidaysData, error: holidaysError } = await supabase
      .from("holidays")
      .select("date, org_id")
      .gte("date", todayStr)
      .lte("date", windowEndStr)

    if (holidaysError) throw holidaysError

    // Build a set of "org_id:date" strings for O(1) holiday lookups
    const holidaySet = new Set<string>(
      (holidaysData as Holiday[] ?? []).map((h) => `${h.org_id}:${h.date}`)
    )

    let totalGenerated = 0
    let totalSkipped = 0

    for (const rule of (rules as ScheduleRule[] ?? [])) {
      const dates = generateDatesForRule(rule, today, windowEnd)

      for (const date of dates) {
        const dateStr = date.toISOString().split("T")[0]

        // Skip holiday dates
        if (holidaySet.has(`${rule.org_id}:${dateStr}`)) {
          totalSkipped++
          continue
        }

        const { error } = await supabase
          .from("route_stops")
          .upsert(
            {
              org_id: rule.org_id,
              customer_id: rule.customer_id,
              pool_id: rule.pool_id,
              tech_id: rule.tech_id,
              schedule_rule_id: rule.id,
              scheduled_date: dateStr,
              sort_index: 999,
              status: "scheduled",
            },
            {
              onConflict: "org_id,customer_id,pool_id,scheduled_date",
              ignoreDuplicates: true,
            }
          )

        if (!error) {
          totalGenerated++
        } else {
          console.error(`[generate-schedule] Failed to upsert stop for rule ${rule.id} on ${dateStr}:`, error)
        }
      }
    }

    console.log(`[generate-schedule] Generated ${totalGenerated} stops, skipped ${totalSkipped} holiday dates`)

    return new Response(
      JSON.stringify({
        success: true,
        generated: totalGenerated,
        skipped: totalSkipped,
        rules_processed: (rules as any[])?.length ?? 0,
        window: { start: todayStr, end: windowEndStr },
      }),
      { headers: { "Content-Type": "application/json" } }
    )
  } catch (err) {
    console.error("[generate-schedule] Error:", err)
    return new Response(
      JSON.stringify({ success: false, error: String(err) }),
      { status: 500, headers: { "Content-Type": "application/json" } }
    )
  }
})
