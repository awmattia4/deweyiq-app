"use server"

/**
 * projects-reports.ts — Server actions for project analytics and dashboard data.
 *
 * Phase 12 Plan 16 (PROJ-80 through PROJ-83)
 *
 * Exports:
 * - getProjectDashboardData: pipeline overview, crew utilization, alerts, calendar
 * - getProjectReports: aggregate analytics (revenue, margin, conversion, duration, sub spend)
 *
 * Key patterns:
 * - withRls(token, ...) for all user-facing queries
 * - LEFT JOIN + GROUP BY instead of correlated subqueries (per MEMORY.md)
 * - adminDb only for cross-org queries (not used here — all org-scoped)
 */

import { createClient } from "@/lib/supabase/server"
import { withRls, adminDb } from "@/lib/db"
import type { SupabaseToken } from "@/lib/db"
import {
  projects,
  projectPhases,
  projectPaymentMilestones,
  projectChangeOrders,
  projectMaterials,
  projectPhaseSubcontractors,
  projectPermits,
  projectInspections,
  alerts,
  profiles,
  invoices,
} from "@/lib/db/schema"
import { eq, and, desc, asc, count, sql, isNull, gte, lte, inArray, not } from "drizzle-orm"
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

export interface ProjectDashboardAlert {
  type: "stalled" | "at_risk" | "permit_expiring" | "inspection_overdue"
  projectId: string
  projectName: string
  message: string
  severity: "warning" | "critical"
}

export interface CrewUtilization {
  techId: string
  techName: string
  projectHoursAllocated: number
  routeHoursEstimated: number
  utilizationPct: number
}

export interface CalendarMilestone {
  date: string
  projectId: string
  projectName: string
  type: "phase_start" | "phase_end" | "payment" | "inspection"
  label: string
}

export interface ProjectDashboardData {
  // Pipeline summary
  stageCounts: Record<string, number>
  activeCount: number
  stalledCount: number
  atRiskCount: number
  totalActiveValue: number
  totalCollected: number
  totalOutstanding: number
  // Crew utilization (this week)
  crewUtilization: CrewUtilization[]
  // Alerts
  alerts: ProjectDashboardAlert[]
  // Calendar — upcoming milestones this week
  calendarMilestones: CalendarMilestone[]
}

export interface ProjectRevenueByPeriod {
  period: string // YYYY-MM
  revenue: number
  projectCount: number
}

export interface MarginByType {
  projectType: string
  avgMarginPct: number
  projectCount: number
  totalRevenue: number
}

export interface ConversionFunnelData {
  leadsCreated: number
  proposalsSent: number
  proposalsApproved: number
  projectsCompleted: number
  avgDaysLeadToApproval: number | null
  avgDaysApprovalToComplete: number | null
}

export interface DurationByType {
  projectType: string
  avgDaysToComplete: number
  projectCount: number
}

export interface SubcontractorSpend {
  subId: string
  subName: string
  trade: string
  totalSpend: number
  projectCount: number
}

export interface ProjectReportsData {
  revenueByPeriod: ProjectRevenueByPeriod[]
  marginByType: MarginByType[]
  conversionFunnel: ConversionFunnelData
  durationByType: DurationByType[]
  subcontractorSpend: SubcontractorSpend[]
}

export interface ProjectReportsFilters {
  startDate?: string
  endDate?: string
  projectType?: string
  status?: string
}

// ---------------------------------------------------------------------------
// getProjectDashboardData
// ---------------------------------------------------------------------------

/**
 * PROJ-80: Aggregate dashboard data for the /projects page.
 * Returns pipeline counts, crew utilization, alerts, calendar milestones.
 */
export async function getProjectDashboardData(): Promise<
  ProjectDashboardData | { error: string }
> {
  try {
    const token = await getToken()
    if (!token) return { error: "Not authenticated" }

    const today = new Date()
    const todayStr = toLocalDateString(today)

    // Week range
    const weekStart = new Date(today)
    weekStart.setDate(today.getDate() - today.getDay()) // Sunday
    const weekEnd = new Date(weekStart)
    weekEnd.setDate(weekStart.getDate() + 6)
    const weekStartStr = toLocalDateString(weekStart)
    const weekEndStr = toLocalDateString(weekEnd)

    // 14 days from now for near-term milestones
    const twoWeeksOut = new Date(today)
    twoWeeksOut.setDate(today.getDate() + 14)
    const twoWeeksStr = toLocalDateString(twoWeeksOut)

    // Fetch all active projects with stage and financial data
    const projectRows = await withRls(token, (db) =>
      db
        .select({
          id: projects.id,
          name: projects.name,
          stage: projects.stage,
          status: projects.status,
          contract_amount: projects.contract_amount,
          stage_entered_at: projects.stage_entered_at,
          last_activity_at: projects.last_activity_at,
          estimated_completion_date: projects.estimated_completion_date,
        })
        .from(projects)
        .where(
          and(
            eq(projects.org_id, sql`(select auth.jwt() ->> 'org_id')::uuid`),
            not(eq(projects.status, "cancelled"))
          )
        )
        .orderBy(desc(projects.created_at))
    )

    // Stage counts
    const stageCounts: Record<string, number> = {}
    let activeCount = 0
    let stalledCount = 0
    let atRiskCount = 0
    let totalActiveValue = 0
    const dashAlerts: ProjectDashboardAlert[] = []

    for (const p of projectRows) {
      stageCounts[p.stage] = (stageCounts[p.stage] ?? 0) + 1

      if (!["complete", "cancelled"].includes(p.status)) {
        activeCount++
        totalActiveValue += parseFloat(p.contract_amount ?? "0")

        // Check stalled: no activity in 14+ days
        const lastActivity = p.last_activity_at ?? p.stage_entered_at
        if (lastActivity) {
          const daysSinceActivity = Math.floor(
            (today.getTime() - new Date(lastActivity).getTime()) / (1000 * 60 * 60 * 24)
          )
          if (daysSinceActivity >= 14) {
            stalledCount++
            dashAlerts.push({
              type: "stalled",
              projectId: p.id,
              projectName: p.name,
              message: `No activity for ${daysSinceActivity} days`,
              severity: daysSinceActivity >= 30 ? "critical" : "warning",
            })
          }
        }

        // Check at risk: completion date passed but not complete
        if (
          p.estimated_completion_date &&
          p.estimated_completion_date < todayStr &&
          !["complete", "warranty_active"].includes(p.stage)
        ) {
          atRiskCount++
          dashAlerts.push({
            type: "at_risk",
            projectId: p.id,
            projectName: p.name,
            message: `Estimated completion was ${p.estimated_completion_date}`,
            severity: "critical",
          })
        }
      }
    }

    // Total collected and outstanding from invoices
    const invoiceRows = await withRls(token, (db) =>
      db
        .select({
          project_id: invoices.project_id,
          total: invoices.total,
          status: invoices.status,
          paid_at: invoices.paid_at,
        })
        .from(invoices)
        .where(
          and(
            eq(invoices.org_id, sql`(select auth.jwt() ->> 'org_id')::uuid`),
            not(eq(invoices.status, "void")),
            sql`${invoices.project_id} IS NOT NULL`
          )
        )
    )

    let totalCollected = 0
    let totalOutstanding = 0
    for (const inv of invoiceRows) {
      const amount = parseFloat(inv.total?.toString() ?? "0")
      if (inv.status === "paid") {
        totalCollected += amount
      } else if (["sent", "draft", "overdue"].includes(inv.status)) {
        totalOutstanding += amount
      }
    }

    // Expiring permits (within 30 days)
    const thirtyDaysOut = new Date(today)
    thirtyDaysOut.setDate(today.getDate() + 30)
    const thirtyDaysStr = toLocalDateString(thirtyDaysOut)

    const expiringPermits = await withRls(token, (db) =>
      db
        .select({
          project_id: projectPermits.project_id,
          expiration_date: projectPermits.expiration_date,
        })
        .from(projectPermits)
        .where(
          and(
            eq(projectPermits.org_id, sql`(select auth.jwt() ->> 'org_id')::uuid`),
            not(eq(projectPermits.status, "expired")),
            isNull(projectPermits.archived_at),
            sql`${projectPermits.expiration_date} IS NOT NULL`,
            sql`${projectPermits.expiration_date} <= ${thirtyDaysStr}`,
            sql`${projectPermits.expiration_date} >= ${todayStr}`
          )
        )
        .limit(10)
    )

    // Map project IDs for permit alerts
    const projectMap = new Map(projectRows.map((p) => [p.id, p.name]))
    for (const permit of expiringPermits) {
      const pName = projectMap.get(permit.project_id) ?? "Unknown project"
      dashAlerts.push({
        type: "permit_expiring",
        projectId: permit.project_id,
        projectName: pName,
        message: `Permit expires ${permit.expiration_date}`,
        severity: "warning",
      })
    }

    // Overdue inspections
    const overdueInspections = await withRls(token, (db) =>
      db
        .select({
          project_id: projectInspections.project_id,
          scheduled_date: projectInspections.scheduled_date,
        })
        .from(projectInspections)
        .where(
          and(
            eq(projectInspections.org_id, sql`(select auth.jwt() ->> 'org_id')::uuid`),
            eq(projectInspections.status, "scheduled"),
            isNull(projectInspections.archived_at),
            sql`${projectInspections.scheduled_date} IS NOT NULL`,
            sql`${projectInspections.scheduled_date} < ${todayStr}`
          )
        )
        .limit(10)
    )

    for (const insp of overdueInspections) {
      const pName = projectMap.get(insp.project_id) ?? "Unknown project"
      dashAlerts.push({
        type: "inspection_overdue",
        projectId: insp.project_id,
        projectName: pName,
        message: `Inspection was scheduled for ${insp.scheduled_date}`,
        severity: "critical",
      })
    }

    // Crew utilization from project phases assigned to techs this week
    const weekPhases = await withRls(token, (db) =>
      db
        .select({
          assigned_tech_id: projectPhases.assigned_tech_id,
          estimated_labor_hours: projectPhases.estimated_labor_hours,
        })
        .from(projectPhases)
        .where(
          and(
            eq(projectPhases.org_id, sql`(select auth.jwt() ->> 'org_id')::uuid`),
            not(eq(projectPhases.status, "complete")),
            not(eq(projectPhases.status, "skipped")),
            isNull(projectPhases.assigned_tech_id).if(false) // only assigned phases
          )
        )
    )

    // Aggregate hours by tech
    const techHours = new Map<string, number>()
    for (const phase of weekPhases) {
      if (phase.assigned_tech_id) {
        const existing = techHours.get(phase.assigned_tech_id) ?? 0
        techHours.set(
          phase.assigned_tech_id,
          existing + parseFloat(phase.estimated_labor_hours ?? "0")
        )
      }
    }

    // Fetch tech profiles for those with hours
    const techIds = Array.from(techHours.keys())
    let crewUtilization: CrewUtilization[] = []
    if (techIds.length > 0) {
      const techProfiles = await withRls(token, (db) =>
        db
          .select({ id: profiles.id, full_name: profiles.full_name })
          .from(profiles)
          .where(and(inArray(profiles.id, techIds)))
      )

      crewUtilization = techProfiles.map((tech) => {
        const projectHours = techHours.get(tech.id) ?? 0
        // Route hours: estimate 6 hours/day * 5 days/week
        const routeHoursEstimated = 30
        const totalAllocated = projectHours + routeHoursEstimated
        const utilizationPct =
          totalAllocated > 0 ? Math.min(100, Math.round((projectHours / 40) * 100)) : 0
        return {
          techId: tech.id,
          techName: tech.full_name,
          projectHoursAllocated: Math.round(projectHours * 10) / 10,
          routeHoursEstimated,
          utilizationPct,
        }
      })
    }

    // Calendar milestones: upcoming phase end dates + payment milestones
    const upcomingPhases = await withRls(token, (db) =>
      db
        .select({
          project_id: projectPhases.project_id,
          name: projectPhases.name,
          estimated_end_date: projectPhases.estimated_end_date,
          status: projectPhases.status,
        })
        .from(projectPhases)
        .where(
          and(
            eq(projectPhases.org_id, sql`(select auth.jwt() ->> 'org_id')::uuid`),
            not(eq(projectPhases.status, "complete")),
            not(eq(projectPhases.status, "skipped")),
            sql`${projectPhases.estimated_end_date} IS NOT NULL`,
            sql`${projectPhases.estimated_end_date} >= ${todayStr}`,
            sql`${projectPhases.estimated_end_date} <= ${twoWeeksStr}`
          )
        )
        .limit(20)
    )

    const calendarMilestones: CalendarMilestone[] = upcomingPhases.map((phase) => ({
      date: phase.estimated_end_date!,
      projectId: phase.project_id,
      projectName: projectMap.get(phase.project_id) ?? "Unknown",
      type: "phase_end",
      label: `Phase: ${phase.name}`,
    }))

    // Sort alerts by severity (critical first)
    dashAlerts.sort((a, b) => {
      if (a.severity === "critical" && b.severity !== "critical") return -1
      if (a.severity !== "critical" && b.severity === "critical") return 1
      return 0
    })

    return {
      stageCounts,
      activeCount,
      stalledCount,
      atRiskCount,
      totalActiveValue: Math.round(totalActiveValue),
      totalCollected: Math.round(totalCollected),
      totalOutstanding: Math.round(totalOutstanding),
      crewUtilization,
      alerts: dashAlerts.slice(0, 10), // cap at 10 alerts
      calendarMilestones: calendarMilestones.sort((a, b) => a.date.localeCompare(b.date)),
    }
  } catch (err) {
    console.error("[getProjectDashboardData] Error:", err)
    return { error: err instanceof Error ? err.message : "Failed to load dashboard data" }
  }
}

// ---------------------------------------------------------------------------
// getProjectReports
// ---------------------------------------------------------------------------

/**
 * PROJ-82, PROJ-83: Aggregate project reports with filters.
 * Revenue by period, margin by type, conversion funnel, duration, sub spend.
 */
export async function getProjectReports(
  filters?: ProjectReportsFilters
): Promise<ProjectReportsData | { error: string }> {
  try {
    const token = await getToken()
    if (!token) return { error: "Not authenticated" }

    const today = new Date()
    const defaultStart = new Date(today.getFullYear() - 1, today.getMonth(), 1)
    const startDate = filters?.startDate ?? toLocalDateString(defaultStart)
    const endDate = filters?.endDate ?? toLocalDateString(today)

    // Revenue by period: completed projects grouped by actual_completion_date month
    const completedProjects = await withRls(token, (db) =>
      db
        .select({
          id: projects.id,
          project_type: projects.project_type,
          contract_amount: projects.contract_amount,
          actual_completion_date: projects.actual_completion_date,
          stage_entered_at: projects.stage_entered_at,
          stage: projects.stage,
          created_at: projects.created_at,
        })
        .from(projects)
        .where(
          and(
            eq(projects.org_id, sql`(select auth.jwt() ->> 'org_id')::uuid`),
            ...(filters?.projectType
              ? [eq(projects.project_type, filters.projectType)]
              : [])
          )
        )
        .orderBy(asc(projects.created_at))
    )

    // Revenue by period: group by YYYY-MM of completion
    const revenueMap = new Map<string, { revenue: number; count: number }>()
    for (const p of completedProjects) {
      if (
        !["complete", "warranty_active"].includes(p.stage) ||
        !p.actual_completion_date
      )
        continue

      const period = p.actual_completion_date.substring(0, 7) // YYYY-MM
      if (period < startDate.substring(0, 7) || period > endDate.substring(0, 7)) continue

      const existing = revenueMap.get(period) ?? { revenue: 0, count: 0 }
      revenueMap.set(period, {
        revenue: existing.revenue + parseFloat(p.contract_amount ?? "0"),
        count: existing.count + 1,
      })
    }

    const revenueByPeriod: ProjectRevenueByPeriod[] = Array.from(revenueMap.entries())
      .map(([period, data]) => ({
        period,
        revenue: Math.round(data.revenue),
        projectCount: data.count,
      }))
      .sort((a, b) => a.period.localeCompare(b.period))

    // Margin by type: we approximate margin using (contract_amount - material costs - sub costs)
    // Since this is a reports view, we work with completed projects
    const materialCosts = await withRls(token, (db) =>
      db
        .select({
          project_id: projectMaterials.project_id,
          total_cost: sql<string>`COALESCE(${projectMaterials.unit_cost_actual} * ${projectMaterials.quantity_used}, ${projectMaterials.unit_cost_estimated} * ${projectMaterials.quantity_estimated}, 0)`,
        })
        .from(projectMaterials)
        .where(eq(projectMaterials.org_id, sql`(select auth.jwt() ->> 'org_id')::uuid`))
    )

    const subCosts = await withRls(token, (db) =>
      db
        .select({
          project_id: projectPhases.project_id,
          total_paid: projectPhaseSubcontractors.amount_paid,
        })
        .from(projectPhaseSubcontractors)
        .innerJoin(
          projectPhases,
          eq(projectPhaseSubcontractors.phase_id, projectPhases.id)
        )
        .where(
          eq(projectPhases.org_id, sql`(select auth.jwt() ->> 'org_id')::uuid`)
        )
    )

    // Aggregate material and sub costs per project
    const materialCostByProject = new Map<string, number>()
    for (const m of materialCosts) {
      const existing = materialCostByProject.get(m.project_id) ?? 0
      materialCostByProject.set(m.project_id, existing + parseFloat(m.total_cost ?? "0"))
    }
    const subCostByProject = new Map<string, number>()
    for (const s of subCosts) {
      const existing = subCostByProject.get(s.project_id) ?? 0
      subCostByProject.set(s.project_id, existing + parseFloat(s.total_paid ?? "0"))
    }

    // Group margin by project type
    const marginByTypeMap = new Map<
      string,
      { totalRevenue: number; totalCost: number; count: number }
    >()
    for (const p of completedProjects) {
      if (!["complete", "warranty_active"].includes(p.stage)) continue
      const revenue = parseFloat(p.contract_amount ?? "0")
      const matCost = materialCostByProject.get(p.id) ?? 0
      const subCost = subCostByProject.get(p.id) ?? 0
      const totalCost = matCost + subCost

      const existing = marginByTypeMap.get(p.project_type) ?? {
        totalRevenue: 0,
        totalCost: 0,
        count: 0,
      }
      marginByTypeMap.set(p.project_type, {
        totalRevenue: existing.totalRevenue + revenue,
        totalCost: existing.totalCost + totalCost,
        count: existing.count + 1,
      })
    }

    const marginByType: MarginByType[] = Array.from(marginByTypeMap.entries()).map(
      ([projectType, data]) => {
        const grossMargin = data.totalRevenue - data.totalCost
        const avgMarginPct =
          data.totalRevenue > 0 ? Math.round((grossMargin / data.totalRevenue) * 100) : 0
        return {
          projectType,
          avgMarginPct,
          projectCount: data.count,
          totalRevenue: Math.round(data.totalRevenue),
        }
      }
    )

    // Conversion funnel (PROJ-83)
    const allProjects = completedProjects // already fetched all org projects
    const leadsCreated = allProjects.length
    // We need to check for proposals sent — proxy: projects that reached proposal_sent stage or beyond
    const proposalStages = [
      "proposal_sent",
      "proposal_approved",
      "deposit_received",
      "permitted",
      "in_progress",
      "punch_list",
      "complete",
      "warranty_active",
    ]
    const proposalsSent = allProjects.filter((p) =>
      proposalStages.includes(p.stage)
    ).length
    const proposalsApproved = allProjects.filter((p) =>
      [
        "proposal_approved",
        "deposit_received",
        "permitted",
        "in_progress",
        "punch_list",
        "complete",
        "warranty_active",
      ].includes(p.stage)
    ).length
    const projectsCompleted = allProjects.filter((p) =>
      ["complete", "warranty_active"].includes(p.stage)
    ).length

    const conversionFunnel: ConversionFunnelData = {
      leadsCreated,
      proposalsSent,
      proposalsApproved,
      projectsCompleted,
      avgDaysLeadToApproval: null, // requires stage_entered_at tracking per stage, not yet available
      avgDaysApprovalToComplete: null,
    }

    // Duration by type: actual_completion_date - actual_start_date for completed projects
    const durationByTypeMap = new Map<string, { totalDays: number; count: number }>()
    for (const p of completedProjects) {
      if (
        !["complete", "warranty_active"].includes(p.stage) ||
        !p.actual_completion_date
      )
        continue

      const startDate = p.actual_completion_date // fallback: use completion only
      const startDateCreated = toLocalDateString(new Date(p.created_at))
      const days = Math.ceil(
        (new Date(p.actual_completion_date).getTime() -
          new Date(startDateCreated).getTime()) /
          (1000 * 60 * 60 * 24)
      )
      if (days < 0 || days > 1000) continue // sanity check

      const existing = durationByTypeMap.get(p.project_type) ?? { totalDays: 0, count: 0 }
      durationByTypeMap.set(p.project_type, {
        totalDays: existing.totalDays + days,
        count: existing.count + 1,
      })
    }

    const durationByType: DurationByType[] = Array.from(durationByTypeMap.entries()).map(
      ([projectType, data]) => ({
        projectType,
        avgDaysToComplete: data.count > 0 ? Math.round(data.totalDays / data.count) : 0,
        projectCount: data.count,
      })
    )

    // Subcontractor spend
    const subRows = await withRls(token, (db) =>
      db
        .select({
          sub_id: projectPhaseSubcontractors.subcontractor_id,
          phase_id: projectPhaseSubcontractors.phase_id,
          amount_paid: projectPhaseSubcontractors.amount_paid,
        })
        .from(projectPhaseSubcontractors)
        .where(
          eq(projectPhaseSubcontractors.org_id, sql`(select auth.jwt() ->> 'org_id')::uuid`)
        )
    )

    // Get subcontractor details
    const subIds = [...new Set(subRows.map((s) => s.sub_id).filter(Boolean))]
    let subcontractorSpend: SubcontractorSpend[] = []
    if (subIds.length > 0) {
      const { subcontractors } = await import("@/lib/db/schema")
      const subDetails = await withRls(token, (db) =>
        db
          .select({
            id: subcontractors.id,
            company_name: subcontractors.name,
            trade: subcontractors.trade,
          })
          .from(subcontractors)
          .where(
            and(
              inArray(subcontractors.id, subIds as string[]),
              eq(subcontractors.org_id, sql`(select auth.jwt() ->> 'org_id')::uuid`)
            )
          )
      )

      const spendBySub = new Map<string, { totalSpend: number }>()
      for (const row of subRows) {
        if (!row.sub_id) continue
        const existing = spendBySub.get(row.sub_id) ?? { totalSpend: 0 }
        existing.totalSpend += parseFloat(row.amount_paid ?? "0")
        spendBySub.set(row.sub_id, existing)
      }

      subcontractorSpend = subDetails.map((sub) => {
        const spend = spendBySub.get(sub.id) ?? { totalSpend: 0 }
        return {
          subId: sub.id,
          subName: sub.company_name,
          trade: sub.trade,
          totalSpend: Math.round(spend.totalSpend),
          projectCount: 0, // simplified: requires phase->project join
        }
      })
    }

    return {
      revenueByPeriod,
      marginByType,
      conversionFunnel,
      durationByType,
      subcontractorSpend,
    }
  } catch (err) {
    console.error("[getProjectReports] Error:", err)
    return { error: err instanceof Error ? err.message : "Failed to load project reports" }
  }
}
