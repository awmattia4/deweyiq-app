import type { Metadata } from "next"
import { redirect } from "next/navigation"
import { getCurrentUser } from "@/actions/auth"
import { getCustomersForAgreement } from "@/actions/agreements"
import { getAgreementTemplates } from "@/actions/agreements"
import { getChecklistTemplatesWithTasks } from "@/actions/company-settings"
import { AgreementBuilder } from "@/components/agreements/agreement-builder"

export const metadata: Metadata = {
  title: "New Agreement",
}

export default async function NewAgreementPage() {
  const user = await getCurrentUser()
  if (!user) redirect("/login")
  if (!["owner", "office"].includes(user.role)) redirect("/dashboard")

  const [customersData, templatesResult, checklistTemplates] = await Promise.all([
    getCustomersForAgreement(),
    getAgreementTemplates(),
    getChecklistTemplatesWithTasks(),
  ])

  const templates = templatesResult.success ? (templatesResult.data ?? []) : []

  // Flatten all checklist tasks from all templates for the pool entry form
  const allChecklistTasks = checklistTemplates.flatMap((tpl) =>
    tpl.tasks.map((t) => ({
      id: t.id,
      label: t.label,
      is_required: t.is_required,
    }))
  )

  // Deduplicate tasks by id (in case tasks appear in multiple templates)
  const seenTaskIds = new Set<string>()
  const checklistTasks = allChecklistTasks.filter((t) => {
    if (seenTaskIds.has(t.id)) return false
    seenTaskIds.add(t.id)
    return true
  })

  return (
    <div className="flex flex-col gap-6 max-w-2xl">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">New Service Agreement</h1>
        <p className="text-muted-foreground text-sm mt-1">
          Select a customer, configure per-pool services and pricing, then save or send for signature.
        </p>
      </div>

      <AgreementBuilder
        customers={customersData}
        checklistTasks={checklistTasks}
        templates={templates}
      />
    </div>
  )
}
