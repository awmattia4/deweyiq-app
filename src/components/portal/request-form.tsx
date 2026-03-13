"use client"

import { useState, useRef } from "react"
import { useRouter } from "next/navigation"
import imageCompression from "browser-image-compression"
import {
  XIcon,
  ChevronRightIcon,
  ChevronLeftIcon,
  AlertTriangleIcon,
  CheckIcon,
} from "lucide-react"
import { cn } from "@/lib/utils"
import {
  submitServiceRequest,
  createRequestPhotoUploadUrl,
} from "@/actions/service-requests"
import type { CustomerPool } from "@/actions/portal-data"
import { toLocalDateString } from "@/lib/date-utils"

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

type Step = 1 | 2 | 3 | 4 | 5 | 6
const TOTAL_STEPS = 6

const CATEGORIES = [
  {
    key: "green_pool",
    label: "Green Pool Cleanup",
    description: "Algae, cloudy water, or green pool treatment",
  },
  {
    key: "opening_closing",
    label: "Opening / Closing",
    description: "Seasonal pool opening or winterization",
  },
  {
    key: "repair",
    label: "Repair",
    description: "Equipment repair, leak, or mechanical issue",
  },
  {
    key: "cleaning",
    label: "Cleaning",
    description: "One-time or extra cleaning service",
  },
  {
    key: "chemical",
    label: "Chemical Balance",
    description: "Water chemistry correction or balancing",
  },
  {
    key: "other",
    label: "Other",
    description: "Something else not listed above",
  },
]

const TIME_WINDOWS = [
  { key: "morning", label: "Morning", description: "8 AM – 12 PM" },
  { key: "afternoon", label: "Afternoon", description: "12 PM – 5 PM" },
  { key: "anytime", label: "Anytime", description: "No preference" },
]

interface RequestFormProps {
  orgId: string
  customerId: string
  pools: CustomerPool[]
}

interface UploadedPhoto {
  path: string
  previewUrl: string
  filename: string
}

// ---------------------------------------------------------------------------
// Helper
// ---------------------------------------------------------------------------

function formatCategoryLabel(key: string): string {
  return CATEGORIES.find((c) => c.key === key)?.label ?? key
}

function getTomorrow(): string {
  const tomorrow = new Date()
  tomorrow.setDate(tomorrow.getDate() + 1)
  return toLocalDateString(tomorrow)
}

// ---------------------------------------------------------------------------
// RequestForm
// ---------------------------------------------------------------------------

/**
 * RequestForm — 6-step guided service request form.
 *
 * Steps:
 * 1. Pool selection (skipped if only 1 pool)
 * 2. Category picker
 * 3. Describe + urgency toggle
 * 4. Photo upload (optional)
 * 5. Preferred date + time window
 * 6. Review & submit
 */
export function RequestForm({ orgId, customerId, pools }: RequestFormProps) {
  const router = useRouter()

  // Auto-select pool if only one
  const [selectedPoolId, setSelectedPoolId] = useState<string | null>(
    pools.length === 1 ? pools[0].id : null
  )
  const [category, setCategory] = useState<string>("")
  const [description, setDescription] = useState("")
  const [isUrgent, setIsUrgent] = useState(false)
  const [photos, setPhotos] = useState<UploadedPhoto[]>([])
  const [isUploadingPhoto, setIsUploadingPhoto] = useState(false)
  const [preferredDate, setPreferredDate] = useState(getTomorrow())
  const [preferredTimeWindow, setPreferredTimeWindow] = useState("anytime")
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [submitError, setSubmitError] = useState<string | null>(null)

  // Skip step 1 if only one pool
  const firstStep: Step = pools.length === 1 ? 2 : 1
  const [currentStep, setCurrentStep] = useState<Step>(firstStep)

  const fileInputRef = useRef<HTMLInputElement>(null)

  // ── Navigation ─────────────────────────────────────────────────────────────

  function canAdvance(): boolean {
    switch (currentStep) {
      case 1:
        return selectedPoolId !== null
      case 2:
        return category !== ""
      case 3:
        return description.trim().length >= 10
      case 4:
        return true // optional
      case 5:
        return preferredDate !== ""
      case 6:
        return true
      default:
        return true
    }
  }

  function handleNext() {
    if (!canAdvance()) return
    const next = currentStep + 1
    if (next <= TOTAL_STEPS) {
      setCurrentStep(next as Step)
    }
  }

  function handleBack() {
    const prev = currentStep - 1
    const minStep = pools.length === 1 ? 2 : 1
    if (prev >= minStep) {
      setCurrentStep(prev as Step)
    }
  }

  // ── Photo upload ────────────────────────────────────────────────────────────

  async function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return
    if (fileInputRef.current) fileInputRef.current.value = ""

    if (photos.length >= 5) return // max 5 photos

    setIsUploadingPhoto(true)
    try {
      const localUrl = URL.createObjectURL(file)

      const compressed = await imageCompression(file, {
        maxSizeMB: 0.5,
        maxWidthOrHeight: 1920,
        useWebWorker: true,
      })

      const uploadMeta = await createRequestPhotoUploadUrl(orgId, customerId, file.name)
      if (!uploadMeta) throw new Error("Could not get upload URL")

      const res = await fetch(uploadMeta.signedUrl, {
        method: "PUT",
        body: compressed,
        headers: { "Content-Type": compressed.type },
      })

      if (!res.ok) throw new Error(`Upload failed: ${res.statusText}`)

      setPhotos((prev) => [
        ...prev,
        { path: uploadMeta.path, previewUrl: localUrl, filename: file.name },
      ])
    } catch (err) {
      console.error("[RequestForm] Photo upload error:", err)
    } finally {
      setIsUploadingPhoto(false)
    }
  }

  function removePhoto(index: number) {
    setPhotos((prev) => prev.filter((_, i) => i !== index))
  }

  // ── Submit ──────────────────────────────────────────────────────────────────

  async function handleSubmit() {
    setIsSubmitting(true)
    setSubmitError(null)

    try {
      const result = await submitServiceRequest(orgId, customerId, {
        poolId: selectedPoolId,
        category,
        description,
        isUrgent,
        photoPaths: photos.map((p) => p.path),
        preferredDate,
        preferredTimeWindow,
      })

      if (result.success) {
        router.push("/portal/requests?submitted=1")
      } else {
        setSubmitError(result.error)
      }
    } catch (err) {
      setSubmitError("Something went wrong. Please try again.")
      console.error("[RequestForm] Submit error:", err)
    } finally {
      setIsSubmitting(false)
    }
  }

  // ── Step rendering ──────────────────────────────────────────────────────────

  const progressPct = ((currentStep - (pools.length === 1 ? 2 : 1)) / (TOTAL_STEPS - (pools.length === 1 ? 2 : 1))) * 100

  return (
    <div className="flex flex-col gap-6">
      {/* ── Progress bar ───────────────────────────────────────────────── */}
      <div>
        <div className="flex items-center justify-between mb-2">
          <span className="text-xs text-muted-foreground">
            Step {currentStep - (pools.length === 1 ? 1 : 0)} of {TOTAL_STEPS - (pools.length === 1 ? 1 : 0)}
          </span>
          {isUrgent && (
            <span className="flex items-center gap-1 text-xs font-medium text-amber-400">
              <AlertTriangleIcon className="h-3.5 w-3.5" />
              Marked Urgent
            </span>
          )}
        </div>
        <div className="h-1.5 rounded-full bg-muted overflow-hidden">
          <div
            className="h-full rounded-full bg-primary transition-all duration-300"
            style={{ width: `${Math.max(5, progressPct)}%` }}
          />
        </div>
      </div>

      {/* ── Step 1: Pool selection ──────────────────────────────────────── */}
      {currentStep === 1 && (
        <div className="flex flex-col gap-4">
          <div>
            <h2 className="text-lg font-semibold">Which pool?</h2>
            <p className="text-sm text-muted-foreground mt-1">
              Select the pool this request is about.
            </p>
          </div>
          <div className="flex flex-col gap-2">
            {pools.map((pool) => (
              <button
                key={pool.id}
                type="button"
                onClick={() => setSelectedPoolId(pool.id)}
                className={cn(
                  "flex items-center gap-3 rounded-xl border p-4 text-left transition-colors cursor-pointer",
                  selectedPoolId === pool.id
                    ? "border-primary bg-primary/10"
                    : "border-border/60 hover:bg-muted/50"
                )}
              >
                <div
                  className={cn(
                    "flex h-5 w-5 shrink-0 items-center justify-center rounded-full border-2 transition-colors",
                    selectedPoolId === pool.id
                      ? "border-primary bg-primary"
                      : "border-border"
                  )}
                >
                  {selectedPoolId === pool.id && (
                    <div className="h-2 w-2 rounded-full bg-white" />
                  )}
                </div>
                <div>
                  <p className="font-medium text-sm">{pool.name}</p>
                  <p className="text-xs text-muted-foreground capitalize">
                    {pool.pool_type}
                  </p>
                </div>
              </button>
            ))}
          </div>
        </div>
      )}

      {/* ── Step 2: Category ────────────────────────────────────────────── */}
      {currentStep === 2 && (
        <div className="flex flex-col gap-4">
          <div>
            <h2 className="text-lg font-semibold">What do you need?</h2>
            <p className="text-sm text-muted-foreground mt-1">
              Choose the category that best describes your request.
            </p>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
            {CATEGORIES.map((cat) => (
              <button
                key={cat.key}
                type="button"
                onClick={() => setCategory(cat.key)}
                className={cn(
                  "flex flex-col gap-1 rounded-xl border p-4 text-left transition-colors cursor-pointer",
                  category === cat.key
                    ? "border-primary bg-primary/10"
                    : "border-border/60 hover:bg-muted/50"
                )}
              >
                <div className="flex items-center justify-between">
                  <span className="font-medium text-sm">{cat.label}</span>
                  {category === cat.key && (
                    <CheckIcon className="h-4 w-4 text-primary shrink-0" />
                  )}
                </div>
                <span className="text-xs text-muted-foreground">{cat.description}</span>
              </button>
            ))}
          </div>
        </div>
      )}

      {/* ── Step 3: Describe + urgency ──────────────────────────────────── */}
      {currentStep === 3 && (
        <div className="flex flex-col gap-4">
          <div>
            <h2 className="text-lg font-semibold">Describe the issue</h2>
            <p className="text-sm text-muted-foreground mt-1">
              Give us more details. The more you tell us, the better we can help.
            </p>
          </div>
          <div className="flex flex-col gap-2">
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Describe what's happening with your pool..."
              rows={5}
              className="w-full resize-none rounded-xl border border-border bg-muted/30 px-4 py-3 text-sm leading-relaxed focus:outline-none focus:ring-1 focus:ring-ring placeholder:text-muted-foreground"
            />
            <p className="text-xs text-muted-foreground text-right">
              {description.length < 10 && description.length > 0
                ? `${10 - description.length} more characters required`
                : description.length > 0
                ? `${description.length} characters`
                : "Minimum 10 characters"}
            </p>
          </div>

          {/* Urgency toggle */}
          <button
            type="button"
            onClick={() => setIsUrgent(!isUrgent)}
            className={cn(
              "flex items-center gap-3 rounded-xl border p-4 transition-colors cursor-pointer text-left",
              isUrgent
                ? "border-amber-500/60 bg-amber-500/10"
                : "border-border/60 hover:bg-muted/50"
            )}
          >
            <div
              className={cn(
                "flex h-5 w-5 shrink-0 items-center justify-center rounded transition-colors",
                isUrgent ? "bg-amber-500" : "border border-border bg-background"
              )}
            >
              {isUrgent && <CheckIcon className="h-3.5 w-3.5 text-white" />}
            </div>
            <div>
              <p className={cn("font-medium text-sm", isUrgent ? "text-amber-400" : "")}>
                This is urgent
              </p>
              <p className="text-xs text-muted-foreground">
                Mark as urgent if this needs immediate attention
              </p>
            </div>
            {isUrgent && (
              <AlertTriangleIcon className="h-4 w-4 text-amber-400 ml-auto shrink-0" />
            )}
          </button>
        </div>
      )}

      {/* ── Step 4: Photos ─────────────────────────────────────────────── */}
      {currentStep === 4 && (
        <div className="flex flex-col gap-4">
          <div>
            <h2 className="text-lg font-semibold">Add photos</h2>
            <p className="text-sm text-muted-foreground mt-1">
              Optional — photos help us understand the issue faster.
            </p>
          </div>

          <input
            ref={fileInputRef}
            type="file"
            accept="image/*"
            capture="environment"
            className="hidden"
            onChange={handleFileChange}
          />

          {photos.length < 5 && (
            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              disabled={isUploadingPhoto}
              className={cn(
                "flex items-center justify-center gap-2 w-full rounded-xl border-2 border-dashed py-6 text-sm font-medium cursor-pointer transition-all",
                isUploadingPhoto
                  ? "border-border/30 text-muted-foreground cursor-wait"
                  : "border-primary/40 bg-primary/5 text-primary hover:bg-primary/10 hover:border-primary/60"
              )}
            >
              {isUploadingPhoto ? "Uploading..." : "Tap to add photo"}
            </button>
          )}

          {photos.length > 0 && (
            <div className="grid grid-cols-3 gap-2">
              {photos.map((photo, idx) => (
                <div
                  key={photo.path}
                  className="relative aspect-square rounded-xl overflow-hidden border border-border/40"
                >
                  <img
                    src={photo.previewUrl}
                    alt={`Photo ${idx + 1}`}
                    className="w-full h-full object-cover"
                  />
                  <button
                    type="button"
                    onClick={() => removePhoto(idx)}
                    className="absolute top-1 right-1 rounded-full bg-black/60 p-1 text-white cursor-pointer hover:bg-black/80"
                    aria-label="Remove photo"
                  >
                    <XIcon className="h-3 w-3" />
                  </button>
                </div>
              ))}
            </div>
          )}

          <p className="text-xs text-muted-foreground text-center">
            {photos.length} / 5 photos added
          </p>
        </div>
      )}

      {/* ── Step 5: Date + time window ──────────────────────────────────── */}
      {currentStep === 5 && (
        <div className="flex flex-col gap-4">
          <div>
            <h2 className="text-lg font-semibold">When works for you?</h2>
            <p className="text-sm text-muted-foreground mt-1">
              Let us know your preferred date and time. We&apos;ll do our best to
              accommodate you.
            </p>
          </div>

          <div className="flex flex-col gap-2">
            <label className="text-sm font-medium">Preferred date</label>
            <input
              type="date"
              value={preferredDate}
              min={toLocalDateString()}
              onChange={(e) => setPreferredDate(e.target.value)}
              className="rounded-xl border border-border bg-muted/30 px-4 py-2.5 text-sm focus:outline-none focus:ring-1 focus:ring-ring"
            />
          </div>

          <div className="flex flex-col gap-2">
            <label className="text-sm font-medium">Preferred time</label>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
              {TIME_WINDOWS.map((window) => (
                <button
                  key={window.key}
                  type="button"
                  onClick={() => setPreferredTimeWindow(window.key)}
                  className={cn(
                    "flex flex-col items-center rounded-xl border p-4 transition-colors cursor-pointer",
                    preferredTimeWindow === window.key
                      ? "border-primary bg-primary/10"
                      : "border-border/60 hover:bg-muted/50"
                  )}
                >
                  <span className="font-medium text-sm">{window.label}</span>
                  <span className="text-xs text-muted-foreground">{window.description}</span>
                </button>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* ── Step 6: Review & submit ─────────────────────────────────────── */}
      {currentStep === 6 && (
        <div className="flex flex-col gap-4">
          <div>
            <h2 className="text-lg font-semibold">Review your request</h2>
            <p className="text-sm text-muted-foreground mt-1">
              Confirm everything looks correct, then submit.
            </p>
          </div>

          <div className="rounded-xl border border-border/60 divide-y divide-border/40">
            {selectedPoolId && pools.length > 1 && (
              <div className="flex items-center gap-2 px-4 py-3">
                <span className="text-xs text-muted-foreground w-28 shrink-0">Pool</span>
                <span className="text-sm">
                  {pools.find((p) => p.id === selectedPoolId)?.name ?? "Unknown"}
                </span>
              </div>
            )}
            <div className="flex items-center gap-2 px-4 py-3">
              <span className="text-xs text-muted-foreground w-28 shrink-0">Category</span>
              <span className="text-sm">{formatCategoryLabel(category)}</span>
            </div>
            <div className="flex items-start gap-2 px-4 py-3">
              <span className="text-xs text-muted-foreground w-28 shrink-0 mt-0.5">Description</span>
              <span className="text-sm whitespace-pre-wrap">{description}</span>
            </div>
            {isUrgent && (
              <div className="flex items-center gap-2 px-4 py-3">
                <span className="text-xs text-muted-foreground w-28 shrink-0">Urgency</span>
                <span className="text-sm font-medium text-amber-400">Marked as urgent</span>
              </div>
            )}
            {photos.length > 0 && (
              <div className="flex items-center gap-2 px-4 py-3">
                <span className="text-xs text-muted-foreground w-28 shrink-0">Photos</span>
                <span className="text-sm">{photos.length} attached</span>
              </div>
            )}
            <div className="flex items-center gap-2 px-4 py-3">
              <span className="text-xs text-muted-foreground w-28 shrink-0">Preferred date</span>
              <span className="text-sm">
                {preferredDate
                  ? new Date(preferredDate + "T12:00:00").toLocaleDateString(undefined, {
                      weekday: "short",
                      month: "short",
                      day: "numeric",
                    })
                  : "Flexible"}
              </span>
            </div>
            <div className="flex items-center gap-2 px-4 py-3">
              <span className="text-xs text-muted-foreground w-28 shrink-0">Time window</span>
              <span className="text-sm capitalize">
                {TIME_WINDOWS.find((w) => w.key === preferredTimeWindow)?.label ?? preferredTimeWindow}
              </span>
            </div>
          </div>

          {submitError && (
            <div className="rounded-xl border border-destructive/30 bg-destructive/10 px-4 py-3">
              <p className="text-sm text-destructive">{submitError}</p>
            </div>
          )}
        </div>
      )}

      {/* ── Navigation buttons ──────────────────────────────────────────── */}
      <div className="flex items-center gap-3 pt-2">
        {currentStep > firstStep && (
          <button
            type="button"
            onClick={handleBack}
            className="flex items-center gap-1 rounded-xl border border-border/60 px-4 py-2.5 text-sm font-medium text-muted-foreground hover:bg-muted/50 transition-colors cursor-pointer"
          >
            <ChevronLeftIcon className="h-4 w-4" />
            Back
          </button>
        )}

        <div className="flex-1" />

        {currentStep < TOTAL_STEPS ? (
          <button
            type="button"
            onClick={handleNext}
            disabled={!canAdvance()}
            className="flex items-center gap-1 rounded-xl bg-primary px-5 py-2.5 text-sm font-medium text-primary-foreground hover:bg-primary/90 transition-colors disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer"
          >
            Next
            <ChevronRightIcon className="h-4 w-4" />
          </button>
        ) : (
          <button
            type="button"
            onClick={() => void handleSubmit()}
            disabled={isSubmitting}
            className="flex items-center gap-2 rounded-xl bg-primary px-5 py-2.5 text-sm font-medium text-primary-foreground hover:bg-primary/90 transition-colors disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer"
          >
            {isSubmitting ? (
              <>
                <div className="h-4 w-4 border-2 border-primary-foreground/60 border-t-primary-foreground rounded-full animate-spin" />
                Submitting...
              </>
            ) : (
              "Submit Request"
            )}
          </button>
        )}
      </div>
    </div>
  )
}
