/**
 * projects-constants.ts — Shared constants for the Projects module.
 *
 * These are extracted from actions/projects.ts because Next.js "use server"
 * files can only export async functions — non-async values must live here.
 *
 * Import from here in both server components and client components.
 */

export const PROJECT_STAGES = [
  "lead",
  "site_survey_scheduled",
  "survey_complete",
  "proposal_sent",
  "proposal_approved",
  "deposit_received",
  "permitted",
  "in_progress",
  "punch_list",
  "complete",
  "warranty_active",
] as const

export type ProjectStage = (typeof PROJECT_STAGES)[number]

export const PROJECT_STAGE_LABELS: Record<string, string> = {
  lead: "Lead",
  site_survey_scheduled: "Survey Scheduled",
  survey_complete: "Survey Complete",
  proposal_sent: "Proposal Sent",
  proposal_approved: "Proposal Approved",
  deposit_received: "Deposit Received",
  permitted: "Permitted",
  in_progress: "In Progress",
  punch_list: "Punch List",
  complete: "Complete",
  warranty_active: "Warranty Active",
}

export const PROJECT_TYPE_LABELS: Record<string, string> = {
  new_pool: "New Pool",
  renovation: "Renovation",
  equipment: "Equipment",
  remodel: "Remodel",
  replaster: "Replaster",
  other: "Other",
}
