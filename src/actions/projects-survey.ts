"use server"

/**
 * projects-survey.ts — Server actions for project site survey scheduling,
 * completion, and data retrieval.
 *
 * Phase 12 Plan 04: Site Survey Workflow
 *
 * Actions:
 * - scheduleSurvey: Creates a route_stop with stop_type='survey' + project_id FK.
 *   Updates project stage to 'site_survey_scheduled'. Logs activity.
 * - completeSurvey: Inserts into project_surveys with measurements, conditions,
 *   photos, notes. Updates project stage to 'survey_complete'. Logs activity.
 * - getSurveyData: Returns survey data for proposal builder pre-population.
 * - getSurveyChecklist: Returns default checklist items grouped by category.
 */

import { revalidatePath } from "next/cache"
import { createClient } from "@/lib/supabase/server"
import { withRls } from "@/lib/db"
import type { SupabaseToken } from "@/lib/db"
import {
  projects,
  projectSurveys,
  routeStops,
  customers,
  profiles,
} from "@/lib/db/schema"
import { eq, and, desc } from "drizzle-orm"
import { toLocalDateString } from "@/lib/date-utils"

// ---------------------------------------------------------------------------
// Auth helper
// ---------------------------------------------------------------------------

async function getToken(): Promise<SupabaseToken | null> {
  const supabase = await createClient()
  const { data: claimsData } = await supabase.auth.getClaims()
  if (!claimsData?.claims) return null
  return claimsData.claims as SupabaseToken
}

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface ScheduleSurveyInput {
  tech_id: string
  scheduled_date: string // YYYY-MM-DD
  time_window_start?: string | null // HH:MM (24h)
  time_window_end?: string | null // HH:MM (24h)
  notes?: string | null
}

export interface SurveyMeasurements {
  pool_length_ft?: string
  pool_width_ft?: string
  depth_shallow_ft?: string
  depth_deep_ft?: string
  deck_area_sqft?: string
  equipment_pad_size?: string
  plumbing_run_ft?: string
  electrical_capacity_amps?: string
  gas_line_distance_ft?: string
  [key: string]: string | undefined
}

export interface SurveyConditions {
  surface_condition?: string // 'good' | 'fair' | 'poor'
  equipment_condition?: string // 'good' | 'fair' | 'poor' | 'needs_replacement'
  structural_issues?: string // 'none' | 'minor_cracks' | 'major_cracks' | 'settling'
  drainage_condition?: string // 'good' | 'moderate' | 'poor'
  plumbing_condition?: string // 'good' | 'fair' | 'poor'
  [key: string]: string | undefined
}

export interface CompleteSurveyInput {
  measurements?: SurveyMeasurements
  existing_conditions?: SurveyConditions
  access_constraints?: string | null
  utility_locations?: string | null
  hoa_requirements?: string | null
  notes?: string | null
  photos?: string[] // Supabase Storage paths (uploaded client-side before calling this)
  // Checklist completion state: key=item id, value=checked + note
  checklist?: Record<string, { checked: boolean; note?: string }>
}

export interface SurveyData {
  id: string
  project_id: string
  route_stop_id: string | null
  surveyed_by: string | null
  surveyed_at: Date | null
  surveyorName: string | null
  measurements: SurveyMeasurements | null
  existing_conditions: SurveyConditions | null
  access_constraints: string | null
  utility_locations: string | null
  hoa_requirements: string | null
  photos: string[] | null
  notes: string | null
  created_at: Date
}

// ---------------------------------------------------------------------------
// Survey checklist definition
// ---------------------------------------------------------------------------

export interface SurveyChecklistItem {
  id: string
  category: string
  label: string
  placeholder?: string
  requiresNote?: boolean
}

export type SurveyChecklistCategory = {
  id: string
  label: string
  items: SurveyChecklistItem[]
}

/**
 * getSurveyChecklist — Returns the default site survey checklist items grouped
 * by category. These are the 15 items from PROJ-07/PROJ-08 requirements.
 */
export async function getSurveyChecklist(): Promise<SurveyChecklistCategory[]> {
  return [
    {
      id: "dimensions",
      label: "Dimensions",
      items: [
        {
          id: "pool_spa_dimensions",
          category: "dimensions",
          label: "Pool/spa dimensions (length, width, depth)",
          placeholder: "e.g. 15x30, 4ft shallow / 6ft deep",
          requiresNote: true,
        },
        {
          id: "deck_measurements",
          category: "dimensions",
          label: "Deck measurements and condition",
          placeholder: "e.g. ~400 sqft, concrete in good condition",
          requiresNote: true,
        },
        {
          id: "equipment_pad",
          category: "dimensions",
          label: "Equipment pad location and size",
          placeholder: "e.g. 5x8ft concrete pad, NE corner",
          requiresNote: true,
        },
      ],
    },
    {
      id: "existing_equipment",
      label: "Existing Equipment",
      items: [
        {
          id: "equipment_inventory",
          category: "existing_equipment",
          label: "Existing equipment inventory",
          placeholder: "Pump brand/model, filter type, heater, auto-cleaner...",
          requiresNote: true,
        },
        {
          id: "plumbing_access",
          category: "existing_equipment",
          label: "Plumbing access points",
          placeholder: "Location of main drains, returns, skimmer",
          requiresNote: true,
        },
        {
          id: "electrical_panel",
          category: "existing_equipment",
          label: "Electrical panel capacity",
          placeholder: "e.g. 200A main, 60A sub-panel at pad",
          requiresNote: true,
        },
        {
          id: "gas_line",
          category: "existing_equipment",
          label: "Gas line location (if applicable)",
          placeholder: "e.g. 3/4\" line stubbed to pad from meter",
          requiresNote: false,
        },
      ],
    },
    {
      id: "conditions",
      label: "Site Conditions",
      items: [
        {
          id: "drainage",
          category: "conditions",
          label: "Drainage assessment",
          placeholder: "Direction of slope, any low spots, French drain present?",
          requiresNote: true,
        },
        {
          id: "structural_condition",
          category: "conditions",
          label: "Structural condition (cracks, settling, heaving)",
          placeholder: "Any visible cracks, deck separation, soil movement?",
          requiresNote: true,
        },
        {
          id: "soil_conditions",
          category: "conditions",
          label: "Soil conditions (if excavation needed)",
          placeholder: "Sandy, clay, rocky, expansive? Any signs of tree roots?",
          requiresNote: false,
        },
      ],
    },
    {
      id: "access_compliance",
      label: "Access & Compliance",
      items: [
        {
          id: "hoa_restrictions",
          category: "access_compliance",
          label: "HOA restrictions (fence height, material, color)",
          placeholder: "e.g. Max 6ft wood fence, no chain link, natural colors",
          requiresNote: false,
        },
        {
          id: "neighbor_notification",
          category: "access_compliance",
          label: "Neighbor notification requirements",
          placeholder: "Any neighbors who need prior notice?",
          requiresNote: false,
        },
        {
          id: "utility_marking",
          category: "access_compliance",
          label: "Utility marking status (811 call)",
          placeholder: "811 call placed? Date? Any lines flagged in work area?",
          requiresNote: true,
        },
        {
          id: "equipment_access",
          category: "access_compliance",
          label: "Access for heavy equipment (gate width, overhead clearance)",
          placeholder: "e.g. 6ft double gate, no overhead obstructions",
          requiresNote: true,
        },
      ],
    },
    {
      id: "photos",
      label: "Required Photos",
      items: [
        {
          id: "photos_overview",
          category: "photos",
          label: "Photos: front approach, pool overview, equipment area, deck, any issues",
          placeholder: "Use camera button to capture all required angles",
          requiresNote: false,
        },
      ],
    },
  ]
}

// ---------------------------------------------------------------------------
// scheduleSurvey
// ---------------------------------------------------------------------------

/**
 * scheduleSurvey — Creates a route_stop with stop_type='survey' for the
 * specified tech on the specified date. Links the stop to the project via
 * project_id. Updates project stage to 'site_survey_scheduled'.
 *
 * Appends an activity_log entry to the project.
 *
 * Returns the created route_stop id and the updated project stage.
 */
export async function scheduleSurvey(
  projectId: string,
  data: ScheduleSurveyInput
): Promise<{ data: { routeStopId: string; stage: string } } | { error: string }> {
  const token = await getToken()
  if (!token) return { error: "Not authenticated" }
  if (!token.org_id) return { error: "No org context" }

  try {
    // Fetch the project to get customer_id, pool_id, and address
    const [project] = await withRls(token, (db) =>
      db
        .select({
          id: projects.id,
          customer_id: projects.customer_id,
          pool_id: projects.pool_id,
          name: projects.name,
          stage: projects.stage,
          activity_log: projects.activity_log,
          customerName: customers.full_name,
        })
        .from(projects)
        .leftJoin(customers, eq(projects.customer_id, customers.id))
        .where(and(eq(projects.id, projectId), eq(projects.org_id, token.org_id!)))
        .limit(1)
    )

    if (!project) return { error: "Project not found" }

    // Determine the next sort_index for that tech on that date
    const existingStops = await withRls(token, (db) =>
      db
        .select({ sort_index: routeStops.sort_index })
        .from(routeStops)
        .where(
          and(
            eq(routeStops.org_id, token.org_id!),
            eq(routeStops.tech_id, data.tech_id),
            eq(routeStops.scheduled_date, data.scheduled_date)
          )
        )
    )
    const maxSortIndex = existingStops.reduce(
      (max, s) => Math.max(max, s.sort_index),
      0
    )
    const nextSortIndex = maxSortIndex + 1

    // Create the survey route stop
    const [newStop] = await withRls(token, (db) =>
      db
        .insert(routeStops)
        .values({
          org_id: token.org_id!,
          tech_id: data.tech_id,
          customer_id: project.customer_id,
          pool_id: project.pool_id ?? null,
          scheduled_date: data.scheduled_date,
          sort_index: nextSortIndex,
          stop_type: "survey",
          project_id: projectId,
          window_start: data.time_window_start ?? null,
          window_end: data.time_window_end ?? null,
          status: "scheduled",
        })
        .returning({ id: routeStops.id })
    )

    // Update project stage to 'site_survey_scheduled' + append activity_log entry
    const now = new Date()
    const existingLog = Array.isArray(project.activity_log) ? project.activity_log : []
    const newLogEntry = {
      type: "stage_changed",
      at: now.toISOString(),
      by_id: token.sub,
      note: `Survey scheduled for ${data.scheduled_date}`,
    }

    await withRls(token, (db) =>
      db
        .update(projects)
        .set({
          stage: "site_survey_scheduled",
          stage_entered_at: now,
          last_activity_at: now,
          activity_log: [...existingLog, newLogEntry],
          updated_at: now,
        })
        .where(and(eq(projects.id, projectId), eq(projects.org_id, token.org_id!)))
    )

    revalidatePath(`/projects/${projectId}`)
    revalidatePath("/projects")
    revalidatePath(`/routes`)

    return { data: { routeStopId: newStop.id, stage: "site_survey_scheduled" } }
  } catch (err) {
    console.error("[scheduleSurvey]", err)
    return { error: "Failed to schedule survey" }
  }
}

// ---------------------------------------------------------------------------
// completeSurvey
// ---------------------------------------------------------------------------

/**
 * completeSurvey — Inserts survey data into project_surveys table.
 * Marks the route_stop as complete (if route_stop_id provided).
 * Updates project stage to 'survey_complete'.
 * Appends activity_log entry.
 */
export async function completeSurvey(
  projectId: string,
  surveyData: CompleteSurveyInput,
  routeStopId?: string | null
): Promise<{ data: SurveyData } | { error: string }> {
  const token = await getToken()
  if (!token) return { error: "Not authenticated" }
  if (!token.org_id) return { error: "No org context" }

  try {
    // Fetch the project to get activity_log
    const [project] = await withRls(token, (db) =>
      db
        .select({
          id: projects.id,
          activity_log: projects.activity_log,
          stage: projects.stage,
        })
        .from(projects)
        .where(and(eq(projects.id, projectId), eq(projects.org_id, token.org_id!)))
        .limit(1)
    )

    if (!project) return { error: "Project not found" }

    const now = new Date()

    // Insert survey record
    // Cast measurements/conditions to schema-compatible types (Record<string, string | number>)
    const measurementsForDb = surveyData.measurements
      ? Object.fromEntries(
          Object.entries(surveyData.measurements).filter(([, v]) => v !== undefined)
        ) as Record<string, string | number>
      : undefined
    const conditionsForDb = surveyData.existing_conditions
      ? Object.fromEntries(
          Object.entries(surveyData.existing_conditions).filter(([, v]) => v !== undefined)
        ) as Record<string, string | number>
      : undefined

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const surveyInsertValues: any = {
      org_id: token.org_id!,
      project_id: projectId,
      route_stop_id: routeStopId ?? undefined,
      surveyed_by: token.sub,
      surveyed_at: now,
      measurements: measurementsForDb,
      existing_conditions: conditionsForDb,
      access_constraints: surveyData.access_constraints ?? undefined,
      utility_locations: surveyData.utility_locations ?? undefined,
      hoa_requirements: surveyData.hoa_requirements ?? undefined,
      photos: surveyData.photos ?? undefined,
      notes: surveyData.notes ?? undefined,
    }
    const [survey] = await withRls(token, (db) =>
      db
        .insert(projectSurveys)
        .values(surveyInsertValues)
        .returning()
    )

    // Mark route stop as complete if provided
    if (routeStopId) {
      await withRls(token, (db) =>
        db
          .update(routeStops)
          .set({ status: "complete", updated_at: now })
          .where(and(eq(routeStops.id, routeStopId), eq(routeStops.org_id, token.org_id!)))
      )
    }

    // Update project stage to 'survey_complete' + append activity_log
    const existingLog = Array.isArray(project.activity_log) ? project.activity_log : []
    const newLogEntry = {
      type: "stage_changed",
      at: now.toISOString(),
      by_id: token.sub,
      note: "Site survey completed",
    }

    await withRls(token, (db) =>
      db
        .update(projects)
        .set({
          stage: "survey_complete",
          stage_entered_at: now,
          last_activity_at: now,
          activity_log: [...existingLog, newLogEntry],
          updated_at: now,
        })
        .where(and(eq(projects.id, projectId), eq(projects.org_id, token.org_id!)))
    )

    // Fetch the surveyor name for return value
    const [surveyor] = surveyData.notes
      ? await withRls(token, (db) =>
          db
            .select({ full_name: profiles.full_name })
            .from(profiles)
            .where(eq(profiles.id, token.sub))
            .limit(1)
        )
      : [null]

    revalidatePath(`/projects/${projectId}`)
    revalidatePath("/projects")

    return {
      data: {
        id: survey.id,
        project_id: survey.project_id,
        route_stop_id: survey.route_stop_id,
        surveyed_by: survey.surveyed_by,
        surveyed_at: survey.surveyed_at,
        surveyorName: (surveyor as { full_name: string } | null)?.full_name ?? null,
        measurements: survey.measurements as SurveyMeasurements | null,
        existing_conditions: survey.existing_conditions as SurveyConditions | null,
        access_constraints: survey.access_constraints,
        utility_locations: survey.utility_locations,
        hoa_requirements: survey.hoa_requirements,
        photos: survey.photos as string[] | null,
        notes: survey.notes,
        created_at: survey.created_at,
      },
    }
  } catch (err) {
    console.error("[completeSurvey]", err)
    return { error: "Failed to complete survey" }
  }
}

// ---------------------------------------------------------------------------
// getSurveyData
// ---------------------------------------------------------------------------

/**
 * getSurveyData — Fetches the most recent survey for a project.
 * Used by the proposal builder to pre-populate measurements and conditions.
 *
 * Returns null if no survey exists yet.
 */
export async function getSurveyData(projectId: string): Promise<SurveyData | null> {
  const token = await getToken()
  if (!token) return null

  try {
    const rows = await withRls(token, (db) =>
      db
        .select({
          id: projectSurveys.id,
          project_id: projectSurveys.project_id,
          route_stop_id: projectSurveys.route_stop_id,
          surveyed_by: projectSurveys.surveyed_by,
          surveyed_at: projectSurveys.surveyed_at,
          surveyorName: profiles.full_name,
          measurements: projectSurveys.measurements,
          existing_conditions: projectSurveys.existing_conditions,
          access_constraints: projectSurveys.access_constraints,
          utility_locations: projectSurveys.utility_locations,
          hoa_requirements: projectSurveys.hoa_requirements,
          photos: projectSurveys.photos,
          notes: projectSurveys.notes,
          created_at: projectSurveys.created_at,
        })
        .from(projectSurveys)
        .leftJoin(profiles, eq(projectSurveys.surveyed_by, profiles.id))
        .where(eq(projectSurveys.project_id, projectId))
        .orderBy(desc(projectSurveys.created_at))
        .limit(1)
    )

    if (rows.length === 0) return null

    const row = rows[0]
    return {
      id: row.id,
      project_id: row.project_id,
      route_stop_id: row.route_stop_id,
      surveyed_by: row.surveyed_by,
      surveyed_at: row.surveyed_at,
      surveyorName: row.surveyorName ?? null,
      measurements: row.measurements as SurveyMeasurements | null,
      existing_conditions: row.existing_conditions as SurveyConditions | null,
      access_constraints: row.access_constraints,
      utility_locations: row.utility_locations,
      hoa_requirements: row.hoa_requirements,
      photos: row.photos as string[] | null,
      notes: row.notes,
      created_at: row.created_at,
    }
  } catch (err) {
    console.error("[getSurveyData]", err)
    return null
  }
}

// ---------------------------------------------------------------------------
// getSurveySchedule — get the scheduled route stop for a project's survey
// ---------------------------------------------------------------------------

export interface SurveyScheduleInfo {
  routeStopId: string
  techId: string | null
  techName: string | null
  scheduledDate: string
  status: string
}

/**
 * getSurveySchedule — Returns the most recent survey route stop for a project.
 * Used to show survey status on the project detail page (scheduled/in_progress/complete).
 */
export async function getSurveySchedule(
  projectId: string
): Promise<SurveyScheduleInfo | null> {
  const token = await getToken()
  if (!token) return null

  try {
    const rows = await withRls(token, (db) =>
      db
        .select({
          routeStopId: routeStops.id,
          techId: routeStops.tech_id,
          techName: profiles.full_name,
          scheduledDate: routeStops.scheduled_date,
          status: routeStops.status,
        })
        .from(routeStops)
        .leftJoin(profiles, eq(routeStops.tech_id, profiles.id))
        .where(
          and(
            eq(routeStops.project_id, projectId),
            eq(routeStops.stop_type, "survey"),
            eq(routeStops.org_id, token.org_id!)
          )
        )
        .orderBy(desc(routeStops.created_at))
        .limit(1)
    )

    if (rows.length === 0) return null

    const row = rows[0]
    return {
      routeStopId: row.routeStopId,
      techId: row.techId,
      techName: row.techName ?? null,
      scheduledDate: row.scheduledDate,
      status: row.status,
    }
  } catch (err) {
    console.error("[getSurveySchedule]", err)
    return null
  }
}
