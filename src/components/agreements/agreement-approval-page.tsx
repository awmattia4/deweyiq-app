"use client"

/**
 * AgreementApprovalPage — Customer-facing agreement review and e-signature UI.
 *
 * Light-themed (customer-facing — not the dark admin theme).
 * Supports:
 *   - Typed name signature
 *   - Canvas drawn signature (react-signature-canvas)
 *   - Accept flow: POST /api/agreements/[id]/sign with signature data
 *   - Decline flow: optional reason → POST /api/agreements/[id]/sign
 *
 * After any action: shows confirmation state inline — no page redirect.
 */

import { useState, useRef } from "react"
import SignatureCanvas from "react-signature-canvas"
import { Loader2 } from "lucide-react"

// ── Types ──────────────────────────────────────────────────────────────────────

export interface AgreementPoolEntry {
  id: string
  poolName: string
  poolType: string
  frequency: string
  preferredDayOfWeek: number | null
  pricingModel: string
  monthlyAmount: string | null
  perVisitAmount: string | null
  tieredThresholdVisits: number | null
  tieredBaseAmount: string | null
  tieredOverageAmount: string | null
  notes: string | null
}

interface AgreementApprovalPageProps {
  token: string
  agreementId: string
  agreementNumber: string
  termType: string
  startDate: string | null
  endDate: string | null
  autoRenew: boolean
  companyName: string
  customerName: string
  serviceAddress: string | null
  poolEntries: AgreementPoolEntry[]
  termsAndConditions?: string | null
  cancellationPolicy?: string | null
  /** When true, renders amendment-specific UI (no pool entry list) */
  isAmendment?: boolean
  amendmentChangeSummary?: string
  amendmentVersionNumber?: number
}

type SignMode = "type" | "draw"
type ActionState =
  | { type: "idle" }
  | { type: "loading"; action: "accept" | "decline" }
  | { type: "success"; action: "accept" | "decline" }
  | { type: "error"; message: string }
  | { type: "decline-form" }

// ── Helpers ────────────────────────────────────────────────────────────────────

const DAY_NAMES = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"]

function formatFrequency(frequency: string, preferredDayOfWeek: number | null): string {
  const day = preferredDayOfWeek != null ? ` — Every ${DAY_NAMES[preferredDayOfWeek]}` : ""
  switch (frequency) {
    case "weekly":
      return `Weekly${day}`
    case "biweekly":
      return `Bi-Weekly${day}`
    case "monthly":
      return `Monthly${day}`
    case "custom":
      return `Custom frequency${day}`
    default:
      return frequency
  }
}

function formatTermType(termType: string, startDate: string | null, endDate: string | null): string {
  const fmtDate = (d: string) =>
    new Date(d + "T12:00:00").toLocaleDateString("en-US", {
      month: "short",
      day: "numeric",
      year: "numeric",
    })

  switch (termType) {
    case "month_to_month":
      return "Month-to-Month"
    case "6_month":
      return startDate && endDate
        ? `6 Months (${fmtDate(startDate)} – ${fmtDate(endDate)})`
        : "6 Months"
    case "12_month":
      return startDate && endDate
        ? `12 Months (${fmtDate(startDate)} – ${fmtDate(endDate)})`
        : "12 Months"
    default:
      return termType
  }
}

function formatPricingSummary(entry: AgreementPoolEntry): string {
  switch (entry.pricingModel) {
    case "monthly_flat":
      return entry.monthlyAmount
        ? `$${parseFloat(entry.monthlyAmount).toFixed(2)}/month`
        : "Monthly flat rate"
    case "per_visit":
      return entry.perVisitAmount
        ? `$${parseFloat(entry.perVisitAmount).toFixed(2)}/visit`
        : "Per visit"
    case "tiered":
      if (entry.tieredBaseAmount && entry.tieredThresholdVisits) {
        return `$${parseFloat(entry.tieredBaseAmount).toFixed(2)} up to ${entry.tieredThresholdVisits} visits/mo`
      }
      return "Tiered pricing"
    default:
      return entry.pricingModel
  }
}

function computeTotalMonthly(entries: AgreementPoolEntry[]): number {
  let total = 0
  for (const entry of entries) {
    if (entry.pricingModel === "monthly_flat" && entry.monthlyAmount) {
      total += parseFloat(entry.monthlyAmount)
    } else if (entry.pricingModel === "tiered" && entry.tieredBaseAmount) {
      total += parseFloat(entry.tieredBaseAmount)
    }
    // per_visit: can't know monthly total without visit count — exclude from estimate
  }
  return total
}

function formatPoolType(type: string): string {
  switch (type) {
    case "pool":
      return "Pool"
    case "spa":
      return "Spa"
    case "fountain":
      return "Fountain"
    default:
      return type
  }
}

// ── Component ──────────────────────────────────────────────────────────────────

export function AgreementApprovalPage({
  token,
  agreementId,
  agreementNumber,
  termType,
  startDate,
  endDate,
  autoRenew,
  companyName,
  customerName,
  serviceAddress,
  poolEntries,
  termsAndConditions,
  cancellationPolicy,
  isAmendment = false,
  amendmentChangeSummary,
  amendmentVersionNumber,
}: AgreementApprovalPageProps) {
  // ── State ──────────────────────────────────────────────────────────────────
  const [signMode, setSignMode] = useState<SignMode>("type")
  const [typedName, setTypedName] = useState("")
  const sigCanvasRef = useRef<SignatureCanvas>(null)
  const [canvasHasContent, setCanvasHasContent] = useState(false)
  const [actionState, setActionState] = useState<ActionState>({ type: "idle" })
  const [declineReason, setDeclineReason] = useState("")
  // Separate error/loading tracking for the decline form (avoid ActionState narrowing conflicts)
  const [declineLoading, setDeclineLoading] = useState(false)
  const [declineError, setDeclineError] = useState<string | null>(null)
  const [showTerms, setShowTerms] = useState(false)
  const [showCancellation, setShowCancellation] = useState(false)

  const totalMonthly = computeTotalMonthly(poolEntries)
  const termLabel = formatTermType(termType, startDate, endDate)

  // ── Validation ─────────────────────────────────────────────────────────────
  const isSignatureReady =
    signMode === "type"
      ? typedName.trim().length > 2
      : canvasHasContent

  // ── Accept handler ─────────────────────────────────────────────────────────
  async function handleAccept() {
    if (!isSignatureReady) return

    let signatureName: string | null = null
    let signatureImageBase64: string | null = null

    if (signMode === "type") {
      signatureName = typedName.trim()
    } else {
      signatureName = customerName
      signatureImageBase64 = sigCanvasRef.current?.toDataURL("image/png") ?? null
    }

    setActionState({ type: "loading", action: "accept" })

    try {
      const res = await fetch(`/api/agreements/${agreementId}/sign`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "accept",
          signatureName,
          signatureImageBase64,
          token,
        }),
      })

      if (res.status === 409) {
        // Already signed
        setActionState({
          type: "error",
          message: "This agreement has already been processed.",
        })
        return
      }

      if (!res.ok) {
        const data = await res.json().catch(() => ({}))
        setActionState({
          type: "error",
          message: (data as { error?: string }).error ?? "Something went wrong. Please try again.",
        })
        return
      }

      setActionState({ type: "success", action: "accept" })
    } catch {
      setActionState({
        type: "error",
        message: "Network error. Please check your connection and try again.",
      })
    }
  }

  // ── Decline handler ────────────────────────────────────────────────────────
  async function handleDecline() {
    setDeclineLoading(true)
    setDeclineError(null)

    try {
      const res = await fetch(`/api/agreements/${agreementId}/sign`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "decline",
          declineReason: declineReason.trim() || null,
          token,
        }),
      })

      if (res.status === 409) {
        setDeclineError("This agreement has already been processed.")
        setDeclineLoading(false)
        return
      }

      if (!res.ok) {
        const data = await res.json().catch(() => ({}))
        setDeclineError(
          (data as { error?: string }).error ?? "Something went wrong. Please try again."
        )
        setDeclineLoading(false)
        return
      }

      setActionState({ type: "success", action: "decline" })
    } catch {
      setDeclineError("Network error. Please check your connection and try again.")
      setDeclineLoading(false)
    }
  }

  // ── Success states ─────────────────────────────────────────────────────────
  if (actionState.type === "success" && actionState.action === "accept") {
    return (
      <div className="bg-white rounded-xl border border-green-200 shadow-sm p-10 text-center">
        <div className="w-14 h-14 rounded-full bg-green-100 flex items-center justify-center mx-auto mb-4">
          <svg className="w-7 h-7 text-green-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
          </svg>
        </div>
        <h2 className="text-2xl font-semibold text-gray-900 mb-2">
          {isAmendment ? "Amendment Approved" : "Agreement Signed"}
        </h2>
        <p className="text-gray-600 max-w-sm mx-auto">
          {isAmendment
            ? `Thank you. The amendment to your service agreement has been approved. ${companyName} will apply the changes to your service.`
            : `Thank you, ${customerName.split(" ")[0]}. Your agreement has been signed and your service has been scheduled. ${companyName} will be in touch soon.`}
        </p>
      </div>
    )
  }

  if (actionState.type === "success" && actionState.action === "decline") {
    return (
      <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-10 text-center">
        <h2 className="text-xl font-semibold text-gray-900 mb-2">Agreement Declined</h2>
        <p className="text-gray-600 max-w-sm mx-auto">
          Your response has been recorded. If you change your mind or have questions, please contact {companyName} directly.
        </p>
      </div>
    )
  }

  // ── Main render ────────────────────────────────────────────────────────────
  return (
    <div className="space-y-5">

      {/* ── Agreement Header ──────────────────────────────────────────────── */}
      <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-6">
        {isAmendment && amendmentChangeSummary && (
          <div className="mb-4 rounded-lg bg-amber-50 border border-amber-200 p-4">
            <p className="text-sm font-semibold text-amber-800 mb-1">
              Amendment v{amendmentVersionNumber} — Changes Requiring Your Approval
            </p>
            <p className="text-sm text-amber-700 whitespace-pre-wrap">{amendmentChangeSummary}</p>
          </div>
        )}
        <div className="flex items-start justify-between flex-wrap gap-3">
          <div>
            <h1 className="text-2xl font-bold text-gray-900">
              {isAmendment ? `Amendment to Agreement ${agreementNumber}` : "Service Agreement"}
            </h1>
            <p className="text-sm text-gray-500 mt-0.5">
              {isAmendment
                ? `Please review the changes below and approve or decline.`
                : `Agreement ${agreementNumber}${startDate ? ` · Effective ${new Date(startDate + "T12:00:00").toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" })}` : ""}`}
            </p>
          </div>
          <a
            href={`/api/agreements/${agreementId}/pdf?token=${token}`}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1.5 text-sm font-medium text-blue-600 hover:text-blue-700 border border-blue-200 hover:border-blue-300 rounded-lg px-3 py-1.5 transition-colors"
          >
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 10v6m0 0l-3-3m3 3l3-3m2 8H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
            </svg>
            Download Full Agreement (PDF)
          </a>
        </div>
      </div>

      {/* ── Key Terms Summary ─────────────────────────────────────────────── */}
      <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-6">
        <h2 className="text-base font-semibold text-gray-900 mb-4">Agreement Summary</h2>

        <dl className="space-y-3">
          <div className="flex justify-between text-sm">
            <dt className="text-gray-500">Customer</dt>
            <dd className="font-medium text-gray-900">{customerName}</dd>
          </div>
          {serviceAddress && (
            <div className="flex justify-between text-sm">
              <dt className="text-gray-500">Service Address</dt>
              <dd className="font-medium text-gray-900 text-right max-w-[60%]">{serviceAddress}</dd>
            </div>
          )}
          <div className="flex justify-between text-sm">
            <dt className="text-gray-500">Term</dt>
            <dd className="font-medium text-gray-900">{termLabel}</dd>
          </div>
          {autoRenew && (
            <div className="flex justify-between text-sm">
              <dt className="text-gray-500">Auto-Renewal</dt>
              <dd className="font-medium text-gray-900">Yes — renews automatically</dd>
            </div>
          )}
        </dl>

        {/* Pool entries */}
        {poolEntries.length > 0 && (
          <>
            <div className="border-t border-gray-100 mt-4 pt-4">
              <h3 className="text-sm font-medium text-gray-700 mb-3">
                {poolEntries.length === 1 ? "Service Details" : `Service Details (${poolEntries.length} pools)`}
              </h3>
              <div className="space-y-3">
                {poolEntries.map((entry) => (
                  <div key={entry.id} className="bg-gray-50 rounded-lg p-3">
                    <div className="flex justify-between items-start">
                      <div>
                        <p className="text-sm font-medium text-gray-900">
                          {entry.poolName}
                          <span className="ml-1.5 text-xs text-gray-400 font-normal">
                            {formatPoolType(entry.poolType)}
                          </span>
                        </p>
                        <p className="text-xs text-gray-500 mt-0.5">
                          {formatFrequency(entry.frequency, entry.preferredDayOfWeek)}
                        </p>
                        {entry.notes && (
                          <p className="text-xs text-gray-500 mt-0.5 italic">{entry.notes}</p>
                        )}
                      </div>
                      <span className="text-sm font-semibold text-gray-900 ml-4 whitespace-nowrap">
                        {formatPricingSummary(entry)}
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {totalMonthly > 0 && (
              <div className="flex justify-between items-center pt-3 mt-3 border-t border-gray-100">
                <span className="text-sm font-medium text-gray-700">Estimated Monthly Total</span>
                <span className="text-base font-bold text-gray-900">
                  ${totalMonthly.toFixed(2)}/month
                </span>
              </div>
            )}
          </>
        )}
      </div>

      {/* ── Terms & Conditions (collapsible) ─────────────────────────────── */}
      {termsAndConditions && (
        <div className="bg-white rounded-xl border border-gray-200 shadow-sm">
          <button
            onClick={() => setShowTerms(!showTerms)}
            className="w-full flex items-center justify-between px-6 py-4 text-left"
          >
            <span className="text-sm font-semibold text-gray-700">Terms &amp; Conditions</span>
            <svg
              className={`w-4 h-4 text-gray-400 transition-transform ${showTerms ? "rotate-180" : ""}`}
              fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}
            >
              <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
            </svg>
          </button>
          {showTerms && (
            <div className="px-6 pb-5 text-sm text-gray-600 whitespace-pre-wrap leading-relaxed border-t border-gray-100">
              {termsAndConditions}
            </div>
          )}
        </div>
      )}

      {/* ── Cancellation Policy (collapsible) ────────────────────────────── */}
      {cancellationPolicy && (
        <div className="bg-white rounded-xl border border-gray-200 shadow-sm">
          <button
            onClick={() => setShowCancellation(!showCancellation)}
            className="w-full flex items-center justify-between px-6 py-4 text-left"
          >
            <span className="text-sm font-semibold text-gray-700">Cancellation Policy</span>
            <svg
              className={`w-4 h-4 text-gray-400 transition-transform ${showCancellation ? "rotate-180" : ""}`}
              fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}
            >
              <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
            </svg>
          </button>
          {showCancellation && (
            <div className="px-6 pb-5 text-sm text-gray-600 whitespace-pre-wrap leading-relaxed border-t border-gray-100">
              {cancellationPolicy}
            </div>
          )}
        </div>
      )}

      {/* ── Signature Section ─────────────────────────────────────────────── */}
      {actionState.type !== "decline-form" && (
        <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-6">
          <h2 className="text-base font-semibold text-gray-900 mb-4">Sign Agreement</h2>

          {/* Mode toggle */}
          <div className="flex rounded-lg border border-gray-200 overflow-hidden mb-5 w-fit">
            <button
              onClick={() => setSignMode("type")}
              className={`px-4 py-2 text-sm font-medium transition-colors ${
                signMode === "type"
                  ? "bg-blue-600 text-white"
                  : "bg-white text-gray-600 hover:bg-gray-50"
              }`}
            >
              Type Your Name
            </button>
            <button
              onClick={() => setSignMode("draw")}
              className={`px-4 py-2 text-sm font-medium border-l border-gray-200 transition-colors ${
                signMode === "draw"
                  ? "bg-blue-600 text-white"
                  : "bg-white text-gray-600 hover:bg-gray-50"
              }`}
            >
              Draw Signature
            </button>
          </div>

          {/* Type mode */}
          {signMode === "type" && (
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1.5">
                Full Legal Name
              </label>
              <input
                type="text"
                value={typedName}
                onChange={(e) => setTypedName(e.target.value)}
                placeholder="Type your full name"
                className="w-full border border-gray-300 rounded-lg px-3.5 py-2.5 text-gray-900 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              />
              <p className="text-xs text-gray-500 mt-2">
                By typing your full name above, you agree to the terms of this Service Agreement. Your typed name serves as your electronic signature.
              </p>
            </div>
          )}

          {/* Draw mode */}
          {signMode === "draw" && (
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1.5">
                Draw Your Signature
              </label>
              <div className="border border-gray-300 rounded-lg overflow-hidden bg-white">
                <SignatureCanvas
                  ref={sigCanvasRef}
                  penColor="#1e293b"
                  canvasProps={{
                    width: 560,
                    height: 140,
                    className: "w-full h-[140px] touch-none",
                  }}
                  onEnd={() => {
                    if (sigCanvasRef.current && !sigCanvasRef.current.isEmpty()) {
                      setCanvasHasContent(true)
                    }
                  }}
                />
              </div>
              <div className="flex items-center justify-between mt-2">
                <p className="text-xs text-gray-500">
                  By signing above, you agree to the terms of this Service Agreement.
                </p>
                <button
                  onClick={() => {
                    sigCanvasRef.current?.clear()
                    setCanvasHasContent(false)
                  }}
                  className="text-xs text-gray-500 hover:text-gray-700 underline"
                >
                  Clear
                </button>
              </div>
            </div>
          )}

          {/* Error message */}
          {actionState.type === "error" && (
            <div className="mt-4 p-3 rounded-lg bg-red-50 border border-red-200 text-sm text-red-700">
              {actionState.message}
            </div>
          )}

          {/* Action buttons */}
          <div className="flex flex-col sm:flex-row gap-3 mt-6">
            <button
              onClick={handleAccept}
              disabled={!isSignatureReady || actionState.type === "loading"}
              className="flex-1 inline-flex items-center justify-center gap-2 px-5 py-2.5 rounded-lg font-medium text-sm bg-blue-600 text-white hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
            >
              {actionState.type === "loading" && actionState.action === "accept" ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" />
                  Signing...
                </>
              ) : (
                "Accept & Sign Agreement"
              )}
            </button>
            <button
              onClick={() => { setDeclineError(null); setActionState({ type: "decline-form" }) }}
              disabled={actionState.type === "loading"}
              className="sm:flex-none inline-flex items-center justify-center px-5 py-2.5 rounded-lg font-medium text-sm border border-gray-300 text-gray-700 hover:bg-gray-50 disabled:opacity-50 transition-colors"
            >
              Decline
            </button>
          </div>
        </div>
      )}

      {/* ── Decline Form ──────────────────────────────────────────────────── */}
      {actionState.type === "decline-form" && (
        <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-6">
          <h2 className="text-base font-semibold text-gray-900 mb-1">Decline Agreement</h2>
          <p className="text-sm text-gray-500 mb-4">
            Are you sure you want to decline this agreement? You can optionally share a reason.
          </p>

          <label className="block text-sm font-medium text-gray-700 mb-1.5">
            Reason (optional)
          </label>
          <textarea
            value={declineReason}
            onChange={(e) => setDeclineReason(e.target.value)}
            placeholder="Let us know why you're declining..."
            rows={3}
            className="w-full border border-gray-300 rounded-lg px-3.5 py-2.5 text-gray-900 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 resize-none"
          />

          {/* Error message */}
          {declineError && (
            <div className="mt-3 p-3 rounded-lg bg-red-50 border border-red-200 text-sm text-red-700">
              {declineError}
            </div>
          )}

          <div className="flex flex-col sm:flex-row gap-3 mt-4">
            <button
              onClick={handleDecline}
              disabled={declineLoading}
              className="inline-flex items-center justify-center gap-2 px-5 py-2.5 rounded-lg font-medium text-sm bg-red-600 text-white hover:bg-red-700 disabled:opacity-50 transition-colors"
            >
              {declineLoading ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" />
                  Submitting...
                </>
              ) : (
                "Confirm Decline"
              )}
            </button>
            <button
              onClick={() => setActionState({ type: "idle" })}
              disabled={declineLoading}
              className="inline-flex items-center justify-center px-5 py-2.5 rounded-lg font-medium text-sm border border-gray-300 text-gray-700 hover:bg-gray-50 disabled:opacity-50 transition-colors"
            >
              Go Back
            </button>
          </div>
        </div>
      )}

    </div>
  )
}
