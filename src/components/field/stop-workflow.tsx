"use client"

import { useMemo } from "react"
import { useRouter } from "next/navigation"
import { ArrowLeftIcon, CheckCircleIcon, FlaskConicalIcon, ClipboardListIcon, CameraIcon, FileTextIcon } from "lucide-react"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Button } from "@/components/ui/button"
import { ChemistryGrid } from "@/components/field/chemistry-grid"
import { ChemistryDosing } from "@/components/field/chemistry-dosing"
import { Checklist } from "@/components/field/checklist"
import { PhotoCapture } from "@/components/field/photo-capture"
import { NotesField } from "@/components/field/notes-field"
import { useVisitDraft } from "@/hooks/use-visit-draft"
import type { StopContext } from "@/actions/visits"
import type { FullChemistryReadings } from "@/lib/chemistry/dosing"
import { cn } from "@/lib/utils"

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface StopWorkflowProps {
  stopId: string
  visitId: string
  context: StopContext
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

/**
 * StopWorkflow — tab host for Chemistry | Tasks | Photos | Notes.
 *
 * Per locked decisions:
 * - Chemistry is the default active tab
 * - Complete button always visible at the bottom, regardless of active tab
 * - Complete button disabled until at least one chemistry reading or task is completed
 */
export function StopWorkflow({ stopId, visitId, context }: StopWorkflowProps) {
  const router = useRouter()

  const { draft, updateChemistry, updateChecklist, updateNotes, completeDraft } =
    useVisitDraft(stopId, context.customerId, context.poolId, visitId)

  // Wrap updateChecklist to match the Checklist component's onUpdate signature
  const handleChecklistUpdate = (taskId: string, completed: boolean, notes: string) =>
    updateChecklist(taskId, completed, notes)

  // Derive chemistry readings in the format used by the dosing engine
  const chemistryReadings = useMemo((): FullChemistryReadings => {
    const c = draft?.chemistry ?? {}
    return {
      pH: c["pH"] ?? null,
      totalAlkalinity: c["totalAlkalinity"] ?? null,
      calciumHardness: c["calciumHardness"] ?? null,
      cya: c["cya"] ?? null,
      salt: c["salt"] ?? null,
      borate: c["borate"] ?? null,
      temperatureF: c["temperatureF"] ?? null,
      freeChlorine: c["freeChlorine"] ?? null,
      bromine: c["bromine"] ?? null,
      tds: c["tds"] ?? null,
      phosphates: c["phosphates"] ?? null,
    }
  }, [draft?.chemistry])

  // Determine if Complete button should be enabled
  const hasMinimumData = useMemo(() => {
    if (!draft) return false
    const hasChemistryReading = Object.values(draft.chemistry).some(
      (v) => v !== null && v !== undefined
    )
    const hasCompletedTask = draft.checklist.some((t) => t.completed)
    return hasChemistryReading || hasCompletedTask
  }, [draft])

  const handleComplete = async () => {
    await completeDraft()
    router.push("/routes")
  }

  return (
    <div className="flex flex-col min-h-[calc(100dvh-4rem)]">
      {/* ── Header ──────────────────────────────────────────────────────────── */}
      <div className="flex items-center gap-3 px-4 pt-4 pb-3 border-b border-border/60">
        <Button
          variant="ghost"
          size="icon"
          className="h-10 w-10 shrink-0 cursor-pointer"
          onClick={() => router.push("/routes")}
          aria-label="Back to routes"
        >
          <ArrowLeftIcon className="h-5 w-5" />
        </Button>
        <div className="min-w-0">
          <h1 className="font-semibold text-base leading-tight truncate">
            {context.customerName}
          </h1>
          <p className="text-sm text-muted-foreground truncate">{context.poolName}</p>
        </div>
      </div>

      {/* ── Tab shell ───────────────────────────────────────────────────────── */}
      <Tabs defaultValue="chemistry" className="flex flex-col flex-1">
        {/* Tab list — horizontally scrollable on narrow viewports */}
        <TabsList className="w-full overflow-x-auto justify-start rounded-none border-b border-border/60 bg-transparent h-auto px-4 py-0 gap-0 shrink-0">
          <TabsTrigger
            value="chemistry"
            className="flex items-center gap-1.5 rounded-none border-b-2 border-transparent data-[state=active]:border-primary data-[state=active]:bg-transparent px-3 py-3 text-sm font-medium text-muted-foreground data-[state=active]:text-foreground cursor-pointer whitespace-nowrap"
          >
            <FlaskConicalIcon className="h-4 w-4" />
            Chemistry
          </TabsTrigger>
          <TabsTrigger
            value="tasks"
            className="flex items-center gap-1.5 rounded-none border-b-2 border-transparent data-[state=active]:border-primary data-[state=active]:bg-transparent px-3 py-3 text-sm font-medium text-muted-foreground data-[state=active]:text-foreground cursor-pointer whitespace-nowrap"
          >
            <ClipboardListIcon className="h-4 w-4" />
            Tasks
          </TabsTrigger>
          <TabsTrigger
            value="photos"
            className="flex items-center gap-1.5 rounded-none border-b-2 border-transparent data-[state=active]:border-primary data-[state=active]:bg-transparent px-3 py-3 text-sm font-medium text-muted-foreground data-[state=active]:text-foreground cursor-pointer whitespace-nowrap"
          >
            <CameraIcon className="h-4 w-4" />
            Photos
          </TabsTrigger>
          <TabsTrigger
            value="notes"
            className="flex items-center gap-1.5 rounded-none border-b-2 border-transparent data-[state=active]:border-primary data-[state=active]:bg-transparent px-3 py-3 text-sm font-medium text-muted-foreground data-[state=active]:text-foreground cursor-pointer whitespace-nowrap"
          >
            <FileTextIcon className="h-4 w-4" />
            Notes
          </TabsTrigger>
        </TabsList>

        {/* ── Chemistry tab ──────────────────────────────────────────────────── */}
        <TabsContent value="chemistry" className="flex-1 overflow-y-auto mt-0 px-4 py-4 space-y-4 pb-28">
          <ChemistryGrid
            chemistry={draft?.chemistry ?? {}}
            previousChemistry={context.previousChemistry}
            sanitizerType={context.sanitizerType}
            onUpdate={updateChemistry}
          />
          <ChemistryDosing
            readings={chemistryReadings}
            pool={{
              volumeGallons: context.poolVolumeGallons ?? 15000,
              sanitizerType: context.sanitizerType,
            }}
            products={context.chemicalProducts}
          />
        </TabsContent>

        {/* ── Tasks tab ──────────────────────────────────────────────────────── */}
        <TabsContent value="tasks" className="flex-1 overflow-y-auto mt-0 px-4 py-4 pb-28">
          {draft ? (
            <Checklist
              tasks={context.checklistTasks}
              draft={draft}
              onUpdate={handleChecklistUpdate}
            />
          ) : (
            <div className="flex flex-col items-center justify-center rounded-xl border border-dashed border-border/60 p-10 text-center gap-3">
              <ClipboardListIcon className="h-10 w-10 text-muted-foreground/40" />
              <div className="flex flex-col gap-1">
                <p className="text-sm font-medium text-muted-foreground">Loading tasks...</p>
              </div>
            </div>
          )}
        </TabsContent>

        {/* ── Photos tab ─────────────────────────────────────────────────────── */}
        <TabsContent value="photos" className="flex-1 overflow-y-auto mt-0 px-4 py-4 pb-28">
          <PhotoCapture
            visitId={visitId}
            orgId={context.orgId}
          />
        </TabsContent>

        {/* ── Notes tab ───────────────────────────────────────────────────────── */}
        <TabsContent value="notes" className="flex-1 overflow-y-auto mt-0 px-4 py-4 pb-28">
          {draft ? (
            <NotesField draft={draft} onUpdate={updateNotes} />
          ) : (
            <div className="flex flex-col items-center justify-center rounded-xl border border-dashed border-border/60 p-10 text-center gap-3">
              <p className="text-sm text-muted-foreground">Loading...</p>
            </div>
          )}
        </TabsContent>
      </Tabs>

      {/* ── Always-visible Complete button ──────────────────────────────────── */}
      <div className="fixed bottom-0 left-0 right-0 z-50 p-4 bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/80 border-t border-border/60 safe-area-inset-bottom">
        <Button
          className={cn(
            "w-full h-12 text-base font-semibold rounded-xl transition-all cursor-pointer",
            hasMinimumData
              ? "bg-green-600 hover:bg-green-700 text-white shadow-lg shadow-green-900/20"
              : "bg-muted text-muted-foreground cursor-not-allowed"
          )}
          disabled={!hasMinimumData || draft?.status === "completed"}
          onClick={handleComplete}
        >
          <CheckCircleIcon className="h-5 w-5 mr-2" />
          {draft?.status === "completed" ? "Stop Completed" : "Complete Stop"}
        </Button>
      </div>
    </div>
  )
}
