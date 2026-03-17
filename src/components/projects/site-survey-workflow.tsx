"use client"

/**
 * SiteSurveyWorkflow — Full survey completion workflow for field techs.
 *
 * Sections:
 * 1. Site info header (customer, address, project type)
 * 2. Survey checklist (15 items across 5 categories)
 * 3. Measurements form (pool dimensions, deck, equipment pad, electrical, etc.)
 * 4. Existing conditions (surface, equipment, structural, drainage)
 * 5. Notes textarea for general observations
 * 6. Photo capture (Supabase Storage upload)
 * 7. Submit button → calls completeSurvey
 *
 * Uses controlled decimal input pattern from MEMORY.md:
 * local string state, flush parsed number on blur.
 *
 * Phase 12 Plan 04: Site Survey Workflow (PROJ-07, PROJ-08, PROJ-09)
 */

import { useState, useTransition, useRef } from "react"
import { toast } from "sonner"
import { createClient } from "@/lib/supabase/client"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { Badge } from "@/components/ui/badge"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { SurveyChecklist } from "./survey-checklist"
import type { ChecklistState } from "./survey-checklist"
import {
  completeSurvey,
  getSurveyChecklist,
} from "@/actions/projects-survey"
import type {
  SurveyChecklistCategory,
  SurveyMeasurements,
  SurveyConditions,
  SurveyData,
} from "@/actions/projects-survey"
import type { ProjectDetail } from "@/actions/projects"
import { PROJECT_TYPE_LABELS } from "@/lib/projects-constants"

// ─── Types ────────────────────────────────────────────────────────────────────

interface SiteSurveyWorkflowProps {
  project: ProjectDetail
  routeStopId?: string | null
  checklistCategories: SurveyChecklistCategory[]
  onComplete: (survey: SurveyData) => void
  onCancel?: () => void
}

// ─── Measurement field config ──────────────────────────────────────────────

const MEASUREMENT_FIELDS: Array<{
  key: keyof SurveyMeasurements
  label: string
  unit: string
  placeholder: string
}> = [
  { key: "pool_length_ft", label: "Pool Length", unit: "ft", placeholder: "e.g. 30" },
  { key: "pool_width_ft", label: "Pool Width", unit: "ft", placeholder: "e.g. 15" },
  { key: "depth_shallow_ft", label: "Shallow End Depth", unit: "ft", placeholder: "e.g. 4" },
  { key: "depth_deep_ft", label: "Deep End Depth", unit: "ft", placeholder: "e.g. 6" },
  { key: "deck_area_sqft", label: "Deck Area", unit: "sqft", placeholder: "e.g. 400" },
  { key: "equipment_pad_size", label: "Equipment Pad Size", unit: "ft²", placeholder: "e.g. 5x8" },
  { key: "plumbing_run_ft", label: "Plumbing Run", unit: "ft", placeholder: "e.g. 40" },
  { key: "electrical_capacity_amps", label: "Electrical Capacity", unit: "A", placeholder: "e.g. 200" },
  { key: "gas_line_distance_ft", label: "Gas Line Distance", unit: "ft", placeholder: "n/a if none" },
]

// ─── Condition option config ───────────────────────────────────────────────

const CONDITION_OPTIONS = [
  { value: "good", label: "Good" },
  { value: "fair", label: "Fair" },
  { value: "poor", label: "Poor" },
]

const CONDITION_FIELDS: Array<{
  key: keyof SurveyConditions
  label: string
  options?: Array<{ value: string; label: string }>
}> = [
  {
    key: "surface_condition",
    label: "Surface Condition",
    options: CONDITION_OPTIONS,
  },
  {
    key: "equipment_condition",
    label: "Equipment Condition",
    options: [
      ...CONDITION_OPTIONS,
      { value: "needs_replacement", label: "Needs Replacement" },
    ],
  },
  {
    key: "structural_issues",
    label: "Structural Issues",
    options: [
      { value: "none", label: "None" },
      { value: "minor_cracks", label: "Minor Cracks" },
      { value: "major_cracks", label: "Major Cracks" },
      { value: "settling", label: "Settling / Heaving" },
    ],
  },
  {
    key: "drainage_condition",
    label: "Drainage",
    options: [
      { value: "good", label: "Good" },
      { value: "moderate", label: "Moderate" },
      { value: "poor", label: "Poor" },
    ],
  },
  {
    key: "plumbing_condition",
    label: "Plumbing Condition",
    options: CONDITION_OPTIONS,
  },
]

// ─── Component ────────────────────────────────────────────────────────────────

/**
 * SiteSurveyWorkflow — Full workflow for completing a site survey in the field.
 *
 * Uses a multi-section layout optimized for mobile use on-site.
 */
export function SiteSurveyWorkflow({
  project,
  routeStopId,
  checklistCategories,
  onComplete,
  onCancel,
}: SiteSurveyWorkflowProps) {
  // ── Checklist state ────────────────────────────────────────────────────────
  const [checklistState, setChecklistState] = useState<ChecklistState>({})

  // ── Measurement string states (controlled decimal inputs per MEMORY.md) ────
  const [measurementStrings, setMeasurementStrings] = useState<
    Record<string, string>
  >({})
  const [measurements, setMeasurements] = useState<SurveyMeasurements>({})

  // ── Conditions ────────────────────────────────────────────────────────────
  const [conditions, setConditions] = useState<SurveyConditions>({})

  // ── Text fields ────────────────────────────────────────────────────────────
  const [accessConstraints, setAccessConstraints] = useState("")
  const [utilityLocations, setUtilityLocations] = useState("")
  const [hoaRequirements, setHoaRequirements] = useState("")
  const [notes, setNotes] = useState("")

  // ── Photos ────────────────────────────────────────────────────────────────
  const [photos, setPhotos] = useState<string[]>([]) // Supabase Storage paths
  const [photoUploading, setPhotoUploading] = useState(false)
  const fileInputRef = useRef<HTMLInputElement>(null)

  // ── Submission ────────────────────────────────────────────────────────────
  const [isPending, startTransition] = useTransition()

  // ── Checklist handler ──────────────────────────────────────────────────────

  function handleChecklistChange(
    itemId: string,
    update: Partial<{ checked: boolean; note: string }>
  ) {
    setChecklistState((prev) => ({
      ...prev,
      [itemId]: {
        checked: prev[itemId]?.checked ?? false,
        note: prev[itemId]?.note ?? "",
        ...update,
      },
    }))
  }

  // ── Measurement input handlers (controlled decimal per MEMORY.md) ──────────

  function handleMeasurementChange(key: string, value: string) {
    setMeasurementStrings((prev) => ({ ...prev, [key]: value }))
    // Only flush to measurements store if it's a complete number (no trailing '.' or '-')
    if (value && !value.endsWith(".") && !value.endsWith("-")) {
      setMeasurements((prev) => ({ ...prev, [key]: value }))
    }
  }

  function handleMeasurementBlur(key: string, value: string) {
    // Safety flush on blur: write the current string value even if incomplete
    if (value.trim()) {
      setMeasurements((prev) => ({ ...prev, [key]: value.trim() }))
    }
  }

  // ── Photo upload ───────────────────────────────────────────────────────────

  async function handlePhotoCapture(files: FileList | null) {
    if (!files || files.length === 0) return
    setPhotoUploading(true)

    try {
      const supabase = createClient()
      const uploadedPaths: string[] = []

      for (const file of Array.from(files)) {
        const ext = file.name.split(".").pop() ?? "jpg"
        const path = `projects/${project.id}/survey/${Date.now()}-${Math.random().toString(36).slice(2)}.${ext}`

        const { error } = await supabase.storage
          .from("project-photos")
          .upload(path, file, { upsert: false })

        if (error) {
          toast.error(`Failed to upload ${file.name}: ${error.message}`)
        } else {
          uploadedPaths.push(path)
        }
      }

      if (uploadedPaths.length > 0) {
        setPhotos((prev) => [...prev, ...uploadedPaths])
        toast.success(`${uploadedPaths.length} photo${uploadedPaths.length > 1 ? "s" : ""} added`)
      }
    } finally {
      setPhotoUploading(false)
    }
  }

  function removePhoto(path: string) {
    setPhotos((prev) => prev.filter((p) => p !== path))
  }

  // ── Submit ─────────────────────────────────────────────────────────────────

  function handleSubmit() {
    startTransition(async () => {
      const result = await completeSurvey(
        project.id,
        {
          measurements: Object.keys(measurements).length > 0 ? measurements : undefined,
          existing_conditions: Object.keys(conditions).length > 0 ? conditions : undefined,
          access_constraints: accessConstraints.trim() || null,
          utility_locations: utilityLocations.trim() || null,
          hoa_requirements: hoaRequirements.trim() || null,
          notes: notes.trim() || null,
          photos: photos.length > 0 ? photos : undefined,
          checklist: Object.keys(checklistState).length > 0 ? checklistState : undefined,
        },
        routeStopId
      )

      if ("error" in result) {
        toast.error(result.error)
      } else {
        toast.success("Survey completed")
        onComplete(result.data)
      }
    })
  }

  // ── Render ─────────────────────────────────────────────────────────────────

  return (
    <div className="flex flex-col gap-6">
      {/* Site info header */}
      <Card>
        <CardContent className="pt-5 pb-4">
          <div className="flex flex-col gap-1">
            <p className="text-base font-semibold">{project.customerName}</p>
            {project.customerAddress && (
              <p className="text-sm text-muted-foreground">{project.customerAddress}</p>
            )}
            <div className="flex items-center gap-2 mt-1">
              <Badge variant="secondary" className="text-xs">
                {PROJECT_TYPE_LABELS[project.project_type] ?? project.project_type}
              </Badge>
              {project.project_number && (
                <span className="text-xs text-muted-foreground">{project.project_number}</span>
              )}
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Survey checklist */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base">Survey Checklist</CardTitle>
        </CardHeader>
        <CardContent>
          <SurveyChecklist
            categories={checklistCategories}
            state={checklistState}
            onChange={handleChecklistChange}
          />
        </CardContent>
      </Card>

      {/* Measurements */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base">Measurements</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-2 gap-x-4 gap-y-3 sm:grid-cols-3">
            {MEASUREMENT_FIELDS.map((field) => (
              <div key={field.key} className="flex flex-col gap-1">
                <Label htmlFor={`measure-${field.key}`} className="text-xs text-muted-foreground">
                  {field.label}
                </Label>
                <div className="relative">
                  <Input
                    id={`measure-${field.key}`}
                    inputMode="decimal"
                    placeholder={field.placeholder}
                    value={measurementStrings[field.key] ?? ""}
                    onChange={(e) => handleMeasurementChange(field.key as string, e.target.value)}
                    onBlur={(e) => handleMeasurementBlur(field.key as string, e.target.value)}
                    className="text-sm h-8 pr-9"
                  />
                  <span className="absolute right-2.5 top-1.5 text-xs text-muted-foreground pointer-events-none">
                    {field.unit}
                  </span>
                </div>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>

      {/* Existing conditions */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base">Existing Conditions</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-2 gap-x-4 gap-y-3 sm:grid-cols-3">
            {CONDITION_FIELDS.map((field) => (
              <div key={field.key} className="flex flex-col gap-1">
                <Label className="text-xs text-muted-foreground">{field.label}</Label>
                <Select
                  value={conditions[field.key] ?? ""}
                  onValueChange={(value) =>
                    setConditions((prev) => ({ ...prev, [field.key]: value }))
                  }
                >
                  <SelectTrigger className="h-8 text-sm">
                    <SelectValue placeholder="Select..." />
                  </SelectTrigger>
                  <SelectContent>
                    {(field.options ?? CONDITION_OPTIONS).map((opt) => (
                      <SelectItem key={opt.value} value={opt.value}>
                        {opt.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>

      {/* Site-specific text fields */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base">Site Details</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="access-constraints" className="text-sm">
              Access Constraints
            </Label>
            <Textarea
              id="access-constraints"
              placeholder="Gate width, overhead clearances, equipment access route..."
              value={accessConstraints}
              onChange={(e) => setAccessConstraints(e.target.value)}
              rows={2}
              className="text-sm"
            />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="utility-locations" className="text-sm">
              Utility Locations
            </Label>
            <Textarea
              id="utility-locations"
              placeholder="Gas shutoff, electrical panel, water main, 811 markings..."
              value={utilityLocations}
              onChange={(e) => setUtilityLocations(e.target.value)}
              rows={2}
              className="text-sm"
            />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="hoa-requirements" className="text-sm">
              HOA Requirements
            </Label>
            <Textarea
              id="hoa-requirements"
              placeholder="Fence restrictions, material/color requirements, work hours..."
              value={hoaRequirements}
              onChange={(e) => setHoaRequirements(e.target.value)}
              rows={2}
              className="text-sm"
            />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="survey-notes" className="text-sm">
              General Notes
            </Label>
            <Textarea
              id="survey-notes"
              placeholder="Any other observations, concerns, or recommendations..."
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              rows={3}
              className="text-sm"
            />
          </div>
        </CardContent>
      </Card>

      {/* Photos */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base">
            Photos
            {photos.length > 0 && (
              <span className="ml-2 text-sm font-normal text-muted-foreground">
                ({photos.length} captured)
              </span>
            )}
          </CardTitle>
        </CardHeader>
        <CardContent className="flex flex-col gap-3">
          <p className="text-xs text-muted-foreground">
            Capture: front approach, pool overview, equipment area, deck, and any issues found.
          </p>

          {/* Photo thumbnails */}
          {photos.length > 0 && (
            <div className="flex flex-wrap gap-2">
              {photos.map((path, i) => (
                <div
                  key={path}
                  className="relative w-16 h-16 rounded-md overflow-hidden bg-muted border border-border"
                >
                  <div className="w-full h-full flex items-center justify-center text-xs text-muted-foreground">
                    {i + 1}
                  </div>
                  <button
                    type="button"
                    onClick={() => removePhoto(path)}
                    className="absolute top-0.5 right-0.5 w-4 h-4 rounded-full bg-destructive text-destructive-foreground text-xs flex items-center justify-center leading-none"
                    aria-label="Remove photo"
                  >
                    ×
                  </button>
                </div>
              ))}
            </div>
          )}

          {/* Camera button */}
          <div>
            <input
              ref={fileInputRef}
              type="file"
              accept="image/*"
              multiple
              capture="environment"
              className="hidden"
              onChange={(e) => handlePhotoCapture(e.target.files)}
            />
            <Button
              type="button"
              variant="outline"
              size="sm"
              disabled={photoUploading}
              onClick={() => fileInputRef.current?.click()}
            >
              {photoUploading ? "Uploading..." : photos.length > 0 ? "Add More Photos" : "Take Photo"}
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Action buttons */}
      <div className="flex justify-end gap-2 pb-4">
        {onCancel && (
          <Button variant="outline" size="sm" onClick={onCancel} disabled={isPending}>
            Cancel
          </Button>
        )}
        <Button size="sm" onClick={handleSubmit} disabled={isPending}>
          {isPending ? "Saving..." : "Complete Survey"}
        </Button>
      </div>
    </div>
  )
}
