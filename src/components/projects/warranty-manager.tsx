"use client"

/**
 * WarrantyManager — Warranty coverage, claims, and expiration tracking.
 *
 * Phase 12 Plan 15 (PROJ-73 through PROJ-77)
 *
 * Shows:
 * - Active warranty coverage with expiration countdown per type
 * - Warranty claims list with status and linked work orders
 * - Link to settings for global warranty term management
 * - Claim review (approve/deny) for office staff
 */

import { useState } from "react"
import { Card } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import {
  reviewWarrantyClaim,
  resolveWarrantyClaim,
  generateWarrantyCertificate,
  type WarrantyTerm,
  type WarrantyClaimSummary,
} from "@/actions/projects-warranty"

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function claimStatusBadgeVariant(
  status: string
): "default" | "secondary" | "destructive" | "outline" {
  switch (status) {
    case "resolved":
      return "default"
    case "approved":
      return "secondary"
    case "denied":
      return "destructive"
    case "under_review":
      return "secondary"
    case "submitted":
    default:
      return "outline"
  }
}

function claimStatusLabel(status: string): string {
  const map: Record<string, string> = {
    submitted: "Submitted",
    under_review: "Under Review",
    approved: "Approved",
    denied: "Denied",
    resolved: "Resolved",
  }
  return map[status] ?? status
}

function warrantyTypeLabel(type: string): string {
  const map: Record<string, string> = {
    workmanship: "Workmanship",
    equipment: "Equipment",
    surface: "Surface / Finish",
    structural: "Structural",
  }
  return map[type] ?? type
}

function daysUntilExpiryColor(days: number): string {
  if (days <= 30) return "text-destructive"
  if (days <= 90) return "text-amber-500"
  return "text-green-600"
}

function formatDate(dateStr: string): string {
  return new Date(dateStr + "T00:00:00").toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  })
}

// ---------------------------------------------------------------------------
// ActiveWarrantyCard
// ---------------------------------------------------------------------------

interface ActiveWarrantyCoverage {
  termId: string
  warrantyType: string
  durationMonths: number
  whatCovered: string
  exclusions: string | null
  activatedDate: string
  expirationDate: string
  daysUntilExpiry: number
}

function ActiveWarrantyCard({ coverage }: { coverage: ActiveWarrantyCoverage }) {
  const isExpired = coverage.daysUntilExpiry < 0
  const yearsAndMonths =
    coverage.durationMonths >= 12
      ? `${Math.floor(coverage.durationMonths / 12)} yr${Math.floor(coverage.durationMonths / 12) > 1 ? "s" : ""}`
      : `${coverage.durationMonths} mo`

  return (
    <div className="flex flex-col gap-1.5 p-3.5 border border-border rounded-lg">
      <div className="flex items-center justify-between gap-2">
        <span className="text-sm font-semibold">{warrantyTypeLabel(coverage.warrantyType)}</span>
        <span className="text-xs text-muted-foreground">{yearsAndMonths}</span>
      </div>
      <p className="text-xs text-muted-foreground">{coverage.whatCovered}</p>
      {coverage.exclusions && (
        <p className="text-xs text-muted-foreground/70">Excludes: {coverage.exclusions}</p>
      )}
      <div className="flex items-center justify-between mt-1">
        <span className="text-xs text-muted-foreground">
          Expires {formatDate(coverage.expirationDate)}
        </span>
        {isExpired ? (
          <Badge variant="destructive" className="text-xs">Expired</Badge>
        ) : (
          <span className={`text-xs font-medium ${daysUntilExpiryColor(coverage.daysUntilExpiry)}`}>
            {coverage.daysUntilExpiry} days left
          </span>
        )}
      </div>
    </div>
  )
}

// ---------------------------------------------------------------------------
// ReviewClaimDialog
// ---------------------------------------------------------------------------

function ReviewClaimDialog({
  claim,
  onReviewed,
  onClose,
}: {
  claim: WarrantyClaimSummary
  onReviewed: (claimId: string, updates: Partial<WarrantyClaimSummary>) => void
  onClose: () => void
}) {
  const [approved, setApproved] = useState<boolean | null>(null)
  const [isWarrantyCovered, setIsWarrantyCovered] = useState(true)
  const [notes, setNotes] = useState("")
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function handleSubmit() {
    if (approved === null) {
      setError("Please select approve or deny")
      return
    }

    setSaving(true)
    setError(null)

    const result = await reviewWarrantyClaim(null, claim.id, {
      approved,
      resolutionNotes: notes || null,
      isWarrantyCovered,
    })

    setSaving(false)

    if ("error" in result) {
      setError(result.error)
      return
    }

    onReviewed(claim.id, {
      status: approved ? "approved" : "denied",
      resolutionNotes: notes || null,
      isWarrantyCovered,
      workOrderId: result.data.workOrderId ?? null,
    })
    onClose()
  }

  return (
    <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
      <div className="bg-background border border-border rounded-lg w-full max-w-md p-6">
        <h3 className="text-base font-semibold mb-1">Review Warranty Claim</h3>
        <p className="text-sm text-muted-foreground mb-4 line-clamp-3">
          {claim.customerDescription}
        </p>

        <div className="flex flex-col gap-4">
          <div className="flex flex-col gap-1.5">
            <label className="text-sm font-medium">Decision</label>
            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => setApproved(true)}
                className={`flex-1 rounded-md border px-3 py-2 text-sm font-medium transition-colors ${
                  approved === true
                    ? "border-primary bg-primary text-primary-foreground"
                    : "border-border hover:bg-muted"
                }`}
              >
                Approve
              </button>
              <button
                type="button"
                onClick={() => setApproved(false)}
                className={`flex-1 rounded-md border px-3 py-2 text-sm font-medium transition-colors ${
                  approved === false
                    ? "border-destructive bg-destructive text-destructive-foreground"
                    : "border-border hover:bg-muted"
                }`}
              >
                Deny
              </button>
            </div>
          </div>

          {approved === true && (
            <div className="flex flex-col gap-1.5">
              <label className="text-sm font-medium">Coverage</label>
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={() => setIsWarrantyCovered(true)}
                  className={`flex-1 rounded-md border px-3 py-2 text-sm font-medium transition-colors ${
                    isWarrantyCovered
                      ? "border-primary bg-primary/10 text-primary"
                      : "border-border hover:bg-muted"
                  }`}
                >
                  Warranty Covered
                  <p className="text-xs font-normal text-muted-foreground mt-0.5">
                    No charge to customer
                  </p>
                </button>
                <button
                  type="button"
                  onClick={() => setIsWarrantyCovered(false)}
                  className={`flex-1 rounded-md border px-3 py-2 text-sm font-medium transition-colors ${
                    !isWarrantyCovered
                      ? "border-primary bg-primary/10 text-primary"
                      : "border-border hover:bg-muted"
                  }`}
                >
                  Billable
                  <p className="text-xs font-normal text-muted-foreground mt-0.5">
                    Standard work order
                  </p>
                </button>
              </div>
            </div>
          )}

          <div className="flex flex-col gap-1.5">
            <label className="text-sm font-medium">Notes</label>
            <textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Review notes, reason for decision..."
              rows={3}
              className="flex w-full rounded-md border border-input bg-transparent px-3 py-2 text-sm shadow-sm focus:outline-none focus:ring-1 focus:ring-ring resize-none"
            />
          </div>

          {error && <p className="text-sm text-destructive">{error}</p>}

          <div className="flex justify-end gap-2">
            <Button type="button" variant="outline" size="sm" onClick={onClose}>
              Cancel
            </Button>
            <Button size="sm" disabled={saving || approved === null} onClick={handleSubmit}>
              {saving ? "Saving..." : "Submit Review"}
            </Button>
          </div>
        </div>
      </div>
    </div>
  )
}

// ---------------------------------------------------------------------------
// WarrantyManager
// ---------------------------------------------------------------------------

interface WarrantyManagerProps {
  projectId: string
  projectStage: string
  activeWarranties: ActiveWarrantyCoverage[]
  initialClaims: WarrantyClaimSummary[]
  warrantyTerms: WarrantyTerm[]
}

export function WarrantyManager({
  projectId,
  projectStage,
  activeWarranties,
  initialClaims,
  warrantyTerms,
}: WarrantyManagerProps) {
  const [claims, setClaims] = useState(initialClaims)
  const [reviewingClaim, setReviewingClaim] = useState<WarrantyClaimSummary | null>(null)
  const [generatingCert, setGeneratingCert] = useState(false)
  const [certMessage, setCertMessage] = useState<string | null>(null)

  const isWarrantyActive =
    projectStage === "warranty_active" || projectStage === "complete"

  function handleClaimUpdated(
    claimId: string,
    updates: Partial<WarrantyClaimSummary>
  ) {
    setClaims((prev) =>
      prev.map((c) => (c.id === claimId ? { ...c, ...updates } : c))
    )
  }

  async function handleGenerateCertificate() {
    setGeneratingCert(true)
    setCertMessage(null)
    const result = await generateWarrantyCertificate(null, projectId)
    setGeneratingCert(false)
    if ("error" in result) {
      setCertMessage(`Failed: ${result.error}`)
    } else {
      setCertMessage("Certificate generated and stored.")
    }
  }

  async function handleResolveClaim(claimId: string) {
    const resolution = window.prompt("Resolution notes:")
    if (resolution === null) return

    const result = await resolveWarrantyClaim(null, claimId, resolution || "Resolved")
    if (!("error" in result)) {
      handleClaimUpdated(claimId, { status: "resolved", resolutionNotes: resolution || "Resolved" })
    }
  }

  return (
    <div className="flex flex-col gap-6">
      {/* Warranty Coverage */}
      <div className="flex flex-col gap-3">
        <div className="flex items-center justify-between">
          <h2 className="text-base font-semibold">Warranty Coverage</h2>
          {isWarrantyActive && (
            <Button
              size="sm"
              variant="outline"
              disabled={generatingCert}
              onClick={handleGenerateCertificate}
            >
              {generatingCert ? "Generating..." : "Generate Certificate"}
            </Button>
          )}
        </div>

        {certMessage && (
          <p className="text-xs text-muted-foreground">{certMessage}</p>
        )}

        {activeWarranties.length === 0 ? (
          <div>
            <p className="text-sm text-muted-foreground italic mb-2">
              No warranty terms configured for this project type.
            </p>
            {warrantyTerms.length === 0 && (
              <p className="text-xs text-muted-foreground">
                Set up warranty templates in Settings under Project Settings.
              </p>
            )}
          </div>
        ) : (
          <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
            {activeWarranties.map((coverage) => (
              <ActiveWarrantyCard key={coverage.termId} coverage={coverage} />
            ))}
          </div>
        )}
      </div>

      {/* Warranty Claims */}
      <div className="flex flex-col gap-3">
        <div className="flex items-center justify-between">
          <h2 className="text-base font-semibold">Claims</h2>
        </div>

        {claims.length === 0 ? (
          <p className="text-sm text-muted-foreground italic">No warranty claims submitted.</p>
        ) : (
          <div className="flex flex-col gap-2">
            {claims.map((claim) => (
              <Card key={claim.id} className="p-4">
                <div className="flex items-start justify-between gap-4">
                  <div className="flex flex-col gap-1 flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <Badge
                        variant={claimStatusBadgeVariant(claim.status)}
                        className="text-xs shrink-0"
                      >
                        {claimStatusLabel(claim.status)}
                      </Badge>
                      {!claim.isWarrantyCovered && claim.status === "approved" && (
                        <Badge variant="outline" className="text-xs shrink-0">
                          Billable
                        </Badge>
                      )}
                    </div>
                    <p className="text-sm mt-1">{claim.customerDescription}</p>
                    {claim.resolutionNotes && (
                      <p className="text-xs text-muted-foreground mt-0.5">
                        {claim.resolutionNotes}
                      </p>
                    )}
                    {claim.workOrderId && (
                      <p className="text-xs text-muted-foreground">
                        Work order created
                      </p>
                    )}
                    <p className="text-xs text-muted-foreground">
                      Submitted{" "}
                      {new Date(claim.submittedAt).toLocaleDateString("en-US", {
                        month: "short",
                        day: "numeric",
                        year: "numeric",
                      })}
                    </p>
                  </div>

                  <div className="flex flex-col gap-1.5 shrink-0">
                    {claim.status === "submitted" && (
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => setReviewingClaim(claim)}
                      >
                        Review
                      </Button>
                    )}
                    {claim.status === "approved" && !claim.workOrderId && (
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => handleResolveClaim(claim.id)}
                      >
                        Resolve
                      </Button>
                    )}
                  </div>
                </div>
              </Card>
            ))}
          </div>
        )}
      </div>

      {reviewingClaim && (
        <ReviewClaimDialog
          claim={reviewingClaim}
          onReviewed={handleClaimUpdated}
          onClose={() => setReviewingClaim(null)}
        />
      )}
    </div>
  )
}
