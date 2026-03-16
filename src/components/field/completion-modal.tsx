"use client"

import { useState, useMemo } from "react"
import {
  CheckCircle2Icon,
  FlaskConicalIcon,
  ClipboardListIcon,
  CameraIcon,
  FileTextIcon,
  AlertTriangleIcon,
} from "lucide-react"
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
} from "@/components/ui/sheet"
import { Button } from "@/components/ui/button"
import { cn } from "@/lib/utils"
import type { VisitDraft } from "@/lib/offline/db"
import type { StopContext, CompleteStopWarnings } from "@/actions/visits"
import { calculateCSI, interpretCSI } from "@/lib/chemistry/lsi"
import {
  EquipmentReadingsSection,
} from "@/components/field/equipment-readings-section"
import type { EquipmentMetrics } from "@/actions/equipment-readings"

// ---------------------------------------------------------------------------
// Chemistry parameter display names
// ---------------------------------------------------------------------------

const PARAM_LABELS: Record<string, string> = {
  freeChlorine: "Free Chlorine",
  bromine: "Bromine",
  pH: "pH",
  totalAlkalinity: "Total Alkalinity",
  calciumHardness: "Calcium Hardness",
  cya: "CYA / Stabilizer",
  salt: "Salt",
  tds: "TDS",
  borate: "Borate",
  phosphates: "Phosphates",
  temperatureF: "Temperature",
}

// Checklist task ID to human-readable label
const CHECKLIST_LABELS: Record<string, string> = {
  skim: "Skim surface debris",
  brush: "Brush walls and floor",
  vacuum: "Vacuum pool",
  emptyBaskets: "Empty skimmer and pump baskets",
  backwash: "Backwash filter",
  checkEquipment: "Check equipment operation",
  cleanFilter: "Clean filter",
}

// Required parameters per sanitizer type — tech warned if missing (client-side defaults)
// Note: server-side validation uses org_settings. This is the fallback for offline/no-settings.
const DEFAULT_REQUIRED_PARAMS: Record<string, string[]> = {
  chlorine: ["freeChlorine", "pH", "totalAlkalinity", "calciumHardness"],
  salt: ["freeChlorine", "pH", "totalAlkalinity", "calciumHardness", "salt"],
  bromine: ["bromine", "pH", "totalAlkalinity", "calciumHardness"],
}

// ---------------------------------------------------------------------------
// OverrideWarningSheet
// ---------------------------------------------------------------------------

interface OverrideWarningSheetProps {
  open: boolean
  warnings: CompleteStopWarnings
  onGoBack: () => void
  onCompleteAnyway: () => void
  isSubmitting: boolean
}

/**
 * OverrideWarningSheet — shown after completeStop returns { success: false, warnings }.
 *
 * Lists missing required chemistry readings and/or incomplete required tasks.
 * Provides "Go Back" and "Complete Anyway" choices.
 * "Complete Anyway" re-calls completeStop with overrideWarnings: true.
 */
export function OverrideWarningSheet({
  open,
  warnings,
  onGoBack,
  onCompleteAnyway,
  isSubmitting,
}: OverrideWarningSheetProps) {
  const allMissing = [
    ...warnings.missingChemistry.map((k) => PARAM_LABELS[k] ?? k),
    ...warnings.missingChecklist.map((k) => CHECKLIST_LABELS[k] ?? k),
  ]

  return (
    <Sheet open={open} onOpenChange={(v) => !v && onGoBack()}>
      <SheetContent
        side="bottom"
        className="rounded-t-2xl max-h-[90dvh] overflow-y-auto pb-safe mx-auto max-w-lg"
      >
        <SheetHeader className="pb-4 border-b border-border/60">
          <SheetTitle className="flex items-center gap-2 text-lg text-amber-400">
            <AlertTriangleIcon className="h-5 w-5" />
            Missing Required Data
          </SheetTitle>
          <SheetDescription className="text-sm text-muted-foreground">
            Some required items are incomplete. You can go back to fill them in, or complete anyway.
          </SheetDescription>
        </SheetHeader>

        <div className="flex flex-col gap-5 px-4 pt-4">
          {/* Missing items list */}
          <div className="rounded-xl border border-amber-500/30 bg-amber-500/10 p-4">
            <p className="text-sm font-medium text-amber-300 mb-2">
              Missing required items:
            </p>
            <ul className="flex flex-col gap-1">
              {allMissing.map((item) => (
                <li key={item} className="text-xs text-amber-300/80 flex items-center gap-2">
                  <span className="h-1.5 w-1.5 rounded-full bg-amber-400 shrink-0" />
                  {item}
                </li>
              ))}
            </ul>
          </div>

          <p className="text-xs text-muted-foreground">
            Completing without required data will generate an alert for your office manager to review.
          </p>

          {/* Action buttons */}
          <div className="flex flex-col gap-3 pb-4">
            <Button
              className="w-full h-12 text-base font-semibold rounded-xl bg-amber-600 hover:bg-amber-700 text-white cursor-pointer"
              onClick={onCompleteAnyway}
              disabled={isSubmitting}
            >
              <AlertTriangleIcon className="h-4 w-4 mr-2" />
              {isSubmitting ? "Saving..." : "Complete Anyway"}
            </Button>
            <Button
              variant="ghost"
              className="w-full h-11 text-sm rounded-xl cursor-pointer"
              onClick={onGoBack}
              disabled={isSubmitting}
            >
              Go Back
            </Button>
          </div>
        </div>
      </SheetContent>
    </Sheet>
  )
}

// ---------------------------------------------------------------------------
// CompletionModal
// ---------------------------------------------------------------------------

interface CompletionModalProps {
  open: boolean
  onClose: () => void
  onConfirm: (equipmentReadings: Record<string, EquipmentMetrics>) => void
  draft: VisitDraft
  context: StopContext
  photoCount: number
  isSubmitting: boolean
  isEdit?: boolean
}

/**
 * CompletionModal — bottom sheet summary before finalizing a stop.
 *
 * Per locked decision: "On completion: quick summary screen flashes readings
 * entered, tasks checked, and photos taken — tech taps confirm to finalize"
 *
 * Implemented as a bottom Sheet (more natural on mobile than Dialog).
 *
 * Phase 10: Includes optional EquipmentReadingsSection for pools with tracked
 * equipment. Equipment readings are passed back via onConfirm callback.
 */
export function CompletionModal({
  open,
  onClose,
  onConfirm,
  draft,
  context,
  photoCount,
  isSubmitting,
  isEdit = false,
}: CompletionModalProps) {
  // ── Equipment readings state ─────────────────────────────────────────────
  // Keyed by equipment ID
  const [equipmentReadings, setEquipmentReadings] = useState<Record<string, EquipmentMetrics>>({})

  const handleEquipmentReadingChange = (equipmentId: string, metrics: EquipmentMetrics) => {
    setEquipmentReadings((prev) => ({ ...prev, [equipmentId]: metrics }))
  }

  // ── Chemistry summary ───────────────────────────────────────────────────

  const enteredParams = useMemo(() => {
    return Object.entries(draft.chemistry)
      .filter(([, v]) => v !== null && v !== undefined)
      .map(([key, val]) => ({
        key,
        label: PARAM_LABELS[key] ?? key,
        value: val as number,
      }))
  }, [draft.chemistry])

  const requiredParams =
    DEFAULT_REQUIRED_PARAMS[context.sanitizerType] ?? DEFAULT_REQUIRED_PARAMS.chlorine
  const missingRequired = requiredParams.filter((p) => {
    const v = draft.chemistry[p]
    return v === null || v === undefined
  })

  // ── CSI value ───────────────────────────────────────────────────────────

  const csiResult = useMemo(() => {
    const c = draft.chemistry
    const csi = calculateCSI({
      pH: c["pH"] ?? null,
      totalAlkalinity: c["totalAlkalinity"] ?? null,
      calciumHardness: c["calciumHardness"] ?? null,
      cya: c["cya"] ?? null,
      salt: c["salt"] ?? null,
      borate: c["borate"] ?? null,
      temperatureF: c["temperatureF"] ?? null,
    })
    if (csi === null) return null
    return { csi, interpretation: interpretCSI(csi) }
  }, [draft.chemistry])

  // ── Checklist summary ───────────────────────────────────────────────────

  const totalTasks = context.checklistTasks.length
  const completedTasks = draft.checklist.filter((t) => t.completed).length
  const allTasksComplete = totalTasks > 0 && completedTasks === totalTasks

  // ── Notes truncation ────────────────────────────────────────────────────

  const notesPreview =
    draft.notes.length > 100
      ? draft.notes.slice(0, 100) + "…"
      : draft.notes

  // ── CSI color class ─────────────────────────────────────────────────────

  const csiColorClass = csiResult
    ? csiResult.interpretation.color === "green"
      ? "text-green-400"
      : csiResult.interpretation.color === "yellow"
        ? "text-amber-400"
        : "text-red-400"
    : "text-muted-foreground"

  // ── Render ──────────────────────────────────────────────────────────────

  return (
    <Sheet open={open} onOpenChange={(v) => !v && onClose()}>
      <SheetContent
        side="bottom"
        className="rounded-t-2xl max-h-[90dvh] overflow-y-auto pb-safe mx-auto max-w-lg"
      >
        <SheetHeader className="pb-4 border-b border-border/60">
          <SheetTitle className="flex items-center gap-2 text-lg">
            <CheckCircle2Icon className="h-5 w-5 text-green-500" />
            {isEdit ? "Update Stop" : "Complete Stop"}
          </SheetTitle>
          <SheetDescription className="text-sm text-muted-foreground">
            {context.customerName} — {context.poolName}
          </SheetDescription>
        </SheetHeader>

        <div className="flex flex-col gap-5 px-4 pt-1">
          {/* ── Missing required readings warning ───────────────────────── */}
          {missingRequired.length > 0 && (
            <div className="flex items-start gap-3 rounded-xl border border-amber-500/30 bg-amber-500/10 px-3 py-3">
              <AlertTriangleIcon className="h-4 w-4 text-amber-400 shrink-0 mt-0.5" />
              <div>
                <p className="text-sm font-medium text-amber-300">
                  Missing required readings
                </p>
                <p className="text-xs text-amber-300/70 mt-0.5">
                  {missingRequired.map((p) => PARAM_LABELS[p] ?? p).join(", ")}
                </p>
              </div>
            </div>
          )}

          {/* ── Chemistry section ────────────────────────────────────────── */}
          <div className="flex flex-col gap-3">
            <div className="flex items-center gap-2">
              <FlaskConicalIcon className="h-4 w-4 text-muted-foreground" />
              <span className="text-sm font-semibold text-foreground">
                Chemistry
              </span>
              <span className="ml-auto text-sm text-muted-foreground">
                {enteredParams.length} reading
                {enteredParams.length !== 1 ? "s" : ""} entered
              </span>
            </div>

            {enteredParams.length > 0 ? (
              <div className="grid grid-cols-2 gap-x-4 gap-y-1.5 rounded-xl bg-muted/20 border border-border/40 px-3 py-3">
                {enteredParams.map(({ key, label, value }) => (
                  <div
                    key={key}
                    className="flex items-center justify-between gap-2"
                  >
                    <span className="text-xs text-muted-foreground truncate">
                      {label}
                    </span>
                    <span className="text-xs font-medium text-foreground tabular-nums">
                      {value}
                    </span>
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-xs text-muted-foreground/60 px-1">
                No readings entered
              </p>
            )}

            {/* CSI value */}
            {csiResult && (
              <div className="flex items-center justify-between rounded-xl bg-muted/20 border border-border/40 px-3 py-2.5">
                <span className="text-xs text-muted-foreground">
                  Water Balance (CSI)
                </span>
                <span className={cn("text-xs font-semibold", csiColorClass)}>
                  {csiResult.csi >= 0 ? "+" : ""}
                  {csiResult.csi.toFixed(2)} —{" "}
                  {csiResult.interpretation.label}
                </span>
              </div>
            )}
          </div>

          {/* ── Checklist section ────────────────────────────────────────── */}
          <div className="flex items-center gap-2">
            <ClipboardListIcon className="h-4 w-4 text-muted-foreground" />
            <span className="text-sm font-semibold text-foreground">Tasks</span>
            <span
              className={cn(
                "ml-auto text-sm",
                allTasksComplete
                  ? "text-green-400"
                  : completedTasks > 0
                    ? "text-amber-400"
                    : "text-muted-foreground"
              )}
            >
              {totalTasks === 0
                ? "No tasks"
                : `${completedTasks} of ${totalTasks} complete`}
            </span>
          </div>

          {/* ── Photos section ───────────────────────────────────────────── */}
          <div className="flex items-center gap-2">
            <CameraIcon className="h-4 w-4 text-muted-foreground" />
            <span className="text-sm font-semibold text-foreground">
              Photos
            </span>
            <span className="ml-auto text-sm text-muted-foreground">
              {photoCount} photo{photoCount !== 1 ? "s" : ""} attached
            </span>
          </div>

          {/* ── Notes section ────────────────────────────────────────────── */}
          {draft.notes.trim().length > 0 && (
            <div className="flex flex-col gap-2">
              <div className="flex items-center gap-2">
                <FileTextIcon className="h-4 w-4 text-muted-foreground" />
                <span className="text-sm font-semibold text-foreground">
                  Notes
                </span>
              </div>
              <p className="text-xs text-muted-foreground/80 leading-relaxed px-1">
                {notesPreview}
              </p>
            </div>
          )}

          {/* ── Equipment readings section (optional, only for pools with equipment) ── */}
          {context.poolEquipment && context.poolEquipment.length > 0 && (
            <EquipmentReadingsSection
              equipment={context.poolEquipment}
              readings={equipmentReadings}
              onChange={handleEquipmentReadingChange}
            />
          )}

          {/* ── Action buttons ───────────────────────────────────────────── */}
          <div className="flex flex-col gap-3 pt-2 pb-4">
            <Button
              className="w-full h-12 text-base font-semibold rounded-xl bg-green-600 hover:bg-green-700 text-white shadow-lg shadow-green-900/20 cursor-pointer"
              onClick={() => onConfirm(equipmentReadings)}
              disabled={isSubmitting}
            >
              <CheckCircle2Icon className="h-5 w-5 mr-2" />
              {isSubmitting ? "Saving…" : isEdit ? "Confirm & Update" : "Confirm & Complete"}
            </Button>
            <Button
              variant="ghost"
              className="w-full h-11 text-sm rounded-xl cursor-pointer"
              onClick={onClose}
              disabled={isSubmitting}
            >
              Go Back
            </Button>
          </div>
        </div>
      </SheetContent>
    </Sheet>
  )
}

// ---------------------------------------------------------------------------
// SkipStopDialog
// ---------------------------------------------------------------------------

interface SkipStopDialogProps {
  open: boolean
  onClose: () => void
  onConfirm: (reason: string) => void
  isSubmitting: boolean
}

/**
 * SkipStopDialog — requires a skip reason before confirming.
 *
 * Per locked decision: "Techs can skip stops (must provide a reason)"
 */
export function SkipStopDialog({
  open,
  onClose,
  onConfirm,
  isSubmitting,
}: SkipStopDialogProps) {
  const [reason, setReason] = useState("")
  const [error, setError] = useState("")

  const handleClose = () => {
    setReason("")
    setError("")
    onClose()
  }

  const handleSubmit = () => {
    if (!reason.trim()) {
      setError("Please provide a reason for skipping this stop.")
      return
    }
    onConfirm(reason.trim())
  }

  return (
    <Sheet open={open} onOpenChange={(v) => !v && handleClose()}>
      <SheetContent side="bottom" className="rounded-t-2xl max-h-[90dvh] overflow-y-auto pb-safe mx-auto max-w-lg">
        <SheetHeader className="pb-4 border-b border-border/60">
          <SheetTitle className="flex items-center gap-2 text-lg text-amber-400">
            <AlertTriangleIcon className="h-5 w-5" />
            Skip This Stop
          </SheetTitle>
          <SheetDescription className="text-sm text-muted-foreground">
            Provide a reason — this will be logged to the customer record.
          </SheetDescription>
        </SheetHeader>

        <div className="flex flex-col gap-5 px-4 pt-1">
          <div className="flex flex-col gap-2">
            <label
              htmlFor="skip-reason"
              className="text-sm font-medium text-foreground"
            >
              Reason for skipping
            </label>
            <textarea
              id="skip-reason"
              value={reason}
              onChange={(e) => {
                setReason(e.target.value)
                if (error) setError("")
              }}
              placeholder="e.g. No access — gate code not working, dog in yard, pool under renovation…"
              rows={3}
              className={cn(
                "w-full resize-none rounded-xl border bg-muted/20 px-4 py-3 text-sm text-foreground placeholder:text-muted-foreground/50 focus:outline-none focus:ring-2 focus:ring-ring",
                error ? "border-red-500/50" : "border-border/60"
              )}
            />
            {error && (
              <p className="text-xs text-red-400 px-1">{error}</p>
            )}
          </div>

          <div className="flex flex-col gap-3 pb-4">
            <Button
              className="w-full h-12 text-base font-semibold rounded-xl bg-amber-600 hover:bg-amber-700 text-white cursor-pointer"
              onClick={handleSubmit}
              disabled={isSubmitting || !reason.trim()}
            >
              {isSubmitting ? "Saving…" : "Skip Stop"}
            </Button>
            <Button
              variant="ghost"
              className="w-full h-11 text-sm rounded-xl cursor-pointer"
              onClick={handleClose}
              disabled={isSubmitting}
            >
              Cancel
            </Button>
          </div>
        </div>
      </SheetContent>
    </Sheet>
  )
}
