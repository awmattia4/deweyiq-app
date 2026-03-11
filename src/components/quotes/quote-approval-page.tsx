"use client"

/**
 * QuoteApprovalPage — Interactive customer-facing quote approval UI.
 *
 * Light-themed (customer-facing — not the dark admin theme).
 * Supports: approve (with optional e-signature), decline (with reason), request changes.
 *
 * Optional items can be toggled on/off by the customer. Totals update in real-time.
 *
 * After any action: shows a confirmation state — no page redirect.
 */

import { useState } from "react"
import { Loader2, Check, X, MessageSquare, ChevronDown } from "lucide-react"

// ── Types ──────────────────────────────────────────────────────────────────────

export interface QuoteLineItem {
  id: string
  description: string
  quantity: number
  unit: string
  unitPrice: number
  total: number
  isOptional: boolean
  isTaxable: boolean
}

interface QuoteApprovalPageProps {
  token: string
  quoteNumber: string
  version: number
  companyName: string
  logoUrl: string | null
  customerName: string
  propertyAddress: string | null
  scopeOfWork: string | null
  lineItems: QuoteLineItem[]
  subtotal: number
  taxRate: number
  taxAmount: number
  grandTotal: number
  termsAndConditions: string | null
  expirationDate: string
  flaggedByTechName: string | null
}

type ActionState =
  | { type: "idle" }
  | { type: "approve-confirm" }
  | { type: "decline-confirm" }
  | { type: "changes-confirm" }
  | { type: "loading"; action: "approve" | "decline" | "request_changes" }
  | { type: "success"; action: "approve" | "decline" | "request_changes" }
  | { type: "error"; message: string }

const DECLINE_REASONS = [
  "Too expensive",
  "Getting other quotes",
  "Not needed right now",
  "Other",
] as const

// ── Component ──────────────────────────────────────────────────────────────────

export function QuoteApprovalPage({
  token,
  quoteNumber,
  version,
  companyName,
  customerName,
  propertyAddress,
  scopeOfWork,
  lineItems,
  taxRate,
  termsAndConditions,
  expirationDate,
  flaggedByTechName,
}: QuoteApprovalPageProps) {
  // Track which optional items are selected (default: all included)
  const optionalItemIds = lineItems
    .filter((li) => li.isOptional)
    .map((li) => li.id)

  const [selectedOptionalIds, setSelectedOptionalIds] = useState<Set<string>>(
    new Set(optionalItemIds)
  )

  // Action state machine
  const [actionState, setActionState] = useState<ActionState>({ type: "idle" })

  // Approve form state
  const [signatureName, setSignatureName] = useState("")
  const [approveConsent, setApproveConsent] = useState(false)

  // Decline form state
  const [declineReason, setDeclineReason] = useState<string>("")
  const [declineOtherText, setDeclineOtherText] = useState("")

  // Changes form state
  const [changeNote, setChangeNote] = useState("")

  // ── Computed totals ──────────────────────────────────────────────────────────

  const activeLineItems = lineItems.filter(
    (li) => !li.isOptional || selectedOptionalIds.has(li.id)
  )
  const computedSubtotal = activeLineItems.reduce((sum, li) => sum + li.total, 0)
  const taxableSubtotal = activeLineItems
    .filter((li) => li.isTaxable)
    .reduce((sum, li) => sum + li.total, 0)
  const computedTax = taxableSubtotal * taxRate
  const computedTotal = computedSubtotal + computedTax

  // ── Format helpers ───────────────────────────────────────────────────────────

  function fmt(amount: number): string {
    return new Intl.NumberFormat("en-US", {
      style: "currency",
      currency: "USD",
    }).format(amount)
  }

  function toggleOptional(id: string) {
    setSelectedOptionalIds((prev) => {
      const next = new Set(prev)
      if (next.has(id)) {
        next.delete(id)
      } else {
        next.add(id)
      }
      return next
    })
  }

  // ── API call ─────────────────────────────────────────────────────────────────

  async function submitAction(
    action: "approve" | "decline" | "request_changes"
  ) {
    setActionState({ type: "loading", action })

    try {
      const body: Record<string, unknown> = { action }

      if (action === "approve") {
        body.signatureName = signatureName.trim() || null
        body.selectedOptionalItemIds = Array.from(selectedOptionalIds)
      } else if (action === "decline") {
        const reason =
          declineReason === "Other" ? declineOtherText.trim() : declineReason
        body.declineReason = reason
      } else if (action === "request_changes") {
        body.changeNote = changeNote.trim()
      }

      const res = await fetch(`/api/quotes/${token}/approve`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      })

      if (!res.ok) {
        const errData = await res.json().catch(() => ({}))
        throw new Error(
          (errData as { error?: string }).error ?? `Request failed: ${res.status}`
        )
      }

      setActionState({ type: "success", action })
    } catch (err) {
      setActionState({
        type: "error",
        message: err instanceof Error ? err.message : "Something went wrong. Please try again.",
      })
    }
  }

  // ── Success screen ───────────────────────────────────────────────────────────

  if (actionState.type === "success") {
    const configs = {
      approve: {
        icon: <Check className="w-12 h-12 text-green-600" strokeWidth={2.5} />,
        title: "Quote approved!",
        message:
          "Thank you for approving the quote. We'll be in touch shortly to schedule the work.",
        bg: "bg-green-50 border-green-200",
      },
      decline: {
        icon: <X className="w-12 h-12 text-red-500" strokeWidth={2.5} />,
        title: "Response received",
        message:
          "We've noted that you've declined this quote. If you change your mind, please don't hesitate to reach out.",
        bg: "bg-red-50 border-red-200",
      },
      request_changes: {
        icon: <MessageSquare className="w-12 h-12 text-blue-600" strokeWidth={2} />,
        title: "Change request sent",
        message:
          "We've received your change request and will send you a revised quote shortly.",
        bg: "bg-blue-50 border-blue-200",
      },
    }

    const cfg = configs[actionState.action]

    return (
      <div
        className={`bg-white rounded-xl border shadow-sm p-8 text-center ${cfg.bg}`}
      >
        <div className="flex justify-center mb-4">{cfg.icon}</div>
        <h2 className="text-xl font-semibold text-gray-900 mb-2">{cfg.title}</h2>
        <p className="text-gray-600 max-w-md mx-auto">{cfg.message}</p>
      </div>
    )
  }

  // ── Main render ──────────────────────────────────────────────────────────────

  const isLoading = actionState.type === "loading"

  return (
    <div className="space-y-6">
      {/* Quote header card */}
      <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
        {/* Quote meta */}
        <div className="px-6 py-5 border-b border-gray-100">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div>
              <h1 className="text-xl font-bold text-gray-900">
                Quote #{quoteNumber}
                {version > 1 && (
                  <span className="ml-2 text-sm font-normal text-gray-500">
                    (v{version})
                  </span>
                )}
              </h1>
              <p className="mt-1 text-sm text-gray-500">
                Prepared for:{" "}
                <span className="font-medium text-gray-700">{customerName}</span>
              </p>
              {propertyAddress && (
                <p className="mt-0.5 text-sm text-gray-500">{propertyAddress}</p>
              )}
            </div>
            <div className="text-right">
              <p className="text-sm text-gray-500">
                Expires:{" "}
                <span className="font-medium text-gray-700">{expirationDate}</span>
              </p>
              <p className="text-sm text-gray-500">
                From:{" "}
                <span className="font-medium text-gray-700">{companyName}</span>
              </p>
            </div>
          </div>
        </div>

        {/* Scope of work */}
        {scopeOfWork && (
          <div className="px-6 py-4 border-b border-gray-100 bg-gray-50">
            <h2 className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-2">
              Scope of Work
            </h2>
            <p className="text-sm text-gray-800 whitespace-pre-wrap leading-relaxed">
              {scopeOfWork}
            </p>
          </div>
        )}

        {/* Tech flagged note */}
        {flaggedByTechName && (
          <div className="px-6 py-3 bg-amber-50 border-b border-amber-100">
            <p className="text-sm text-amber-800">
              <span className="font-medium">Issue identified by technician:</span>{" "}
              {flaggedByTechName}
            </p>
          </div>
        )}

        {/* Line items table */}
        <div className="px-6 py-4">
          <h2 className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-3">
            Line Items
          </h2>
          <div className="divide-y divide-gray-100">
            {lineItems.map((item) => {
              const isSelected = !item.isOptional || selectedOptionalIds.has(item.id)
              return (
                <div
                  key={item.id}
                  className={`py-3 flex items-start gap-3 ${
                    !isSelected ? "opacity-50" : ""
                  }`}
                >
                  {/* Optional toggle checkbox */}
                  {item.isOptional && (
                    <label className="flex items-center mt-0.5 cursor-pointer shrink-0">
                      <input
                        type="checkbox"
                        checked={isSelected}
                        onChange={() => toggleOptional(item.id)}
                        disabled={isLoading}
                        className="h-4 w-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500 cursor-pointer"
                      />
                    </label>
                  )}
                  {/* Non-optional spacer */}
                  {!item.isOptional && <div className="w-4 shrink-0" />}

                  {/* Description */}
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-gray-800 leading-snug">
                      {item.description}
                    </p>
                    <p className="text-xs text-gray-500 mt-0.5">
                      {item.quantity} {item.unit} × {fmt(item.unitPrice)}
                    </p>
                    {item.isOptional && (
                      <span className="inline-block mt-1 text-xs bg-blue-50 text-blue-700 px-1.5 py-0.5 rounded font-medium">
                        Optional
                      </span>
                    )}
                  </div>

                  {/* Line total */}
                  <div className="text-sm font-semibold text-gray-900 shrink-0 tabular-nums">
                    {fmt(item.total)}
                  </div>
                </div>
              )
            })}
          </div>
        </div>

        {/* Totals */}
        <div className="px-6 py-4 border-t border-gray-100 bg-gray-50">
          <div className="space-y-2 max-w-xs ml-auto">
            <div className="flex justify-between text-sm text-gray-600">
              <span>Subtotal</span>
              <span className="tabular-nums">{fmt(computedSubtotal)}</span>
            </div>
            {computedTax > 0 && (
              <div className="flex justify-between text-sm text-gray-600">
                <span>Tax ({(taxRate * 100).toFixed(2)}%)</span>
                <span className="tabular-nums">{fmt(computedTax)}</span>
              </div>
            )}
            <div className="flex justify-between text-base font-bold text-gray-900 pt-2 border-t border-gray-200">
              <span>Total</span>
              <span className="tabular-nums">{fmt(computedTotal)}</span>
            </div>
          </div>
        </div>

        {/* Terms and conditions */}
        {termsAndConditions && (
          <div className="px-6 py-4 border-t border-gray-100">
            <details className="group">
              <summary className="flex items-center gap-1 text-xs font-semibold text-gray-500 uppercase tracking-wider cursor-pointer select-none list-none">
                Terms &amp; Conditions
                <ChevronDown className="w-3.5 h-3.5 transition-transform group-open:rotate-180" />
              </summary>
              <p className="mt-3 text-xs text-gray-600 whitespace-pre-wrap leading-relaxed">
                {termsAndConditions}
              </p>
            </details>
          </div>
        )}
      </div>

      {/* Error display */}
      {actionState.type === "error" && (
        <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          {actionState.message}
        </div>
      )}

      {/* Action section */}
      <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
        <div className="px-6 py-4 border-b border-gray-100">
          <h2 className="text-base font-semibold text-gray-900">
            Your Response
          </h2>
          <p className="text-sm text-gray-500 mt-0.5">
            Please review the quote above and let us know how you&apos;d like to proceed.
          </p>
        </div>

        <div className="p-6 space-y-4">
          {/* ── APPROVE ─────────────────────────────────────────────────── */}
          {(actionState.type === "idle" ||
            actionState.type === "approve-confirm") && (
            <div
              className={`rounded-lg border transition-colors ${
                actionState.type === "approve-confirm"
                  ? "border-green-300 bg-green-50"
                  : "border-gray-200"
              }`}
            >
              {actionState.type !== "approve-confirm" ? (
                <button
                  onClick={() =>
                    setActionState({ type: "approve-confirm" })
                  }
                  disabled={isLoading}
                  className="w-full px-4 py-3.5 flex items-center gap-3 text-left hover:bg-green-50 transition-colors rounded-lg"
                >
                  <span className="flex-1">
                    <span className="block font-semibold text-green-700">
                      Approve Quote
                    </span>
                    <span className="block text-sm text-gray-500 mt-0.5">
                      Accept this quote and authorize the work
                    </span>
                  </span>
                  <Check className="w-5 h-5 text-green-600 shrink-0" />
                </button>
              ) : (
                <div className="p-4 space-y-4">
                  <h3 className="font-semibold text-green-800">
                    Confirm Approval
                  </h3>

                  {/* Optional items summary */}
                  {optionalItemIds.length > 0 && (
                    <div className="text-sm text-gray-600 bg-white rounded-md border border-green-200 p-3">
                      <p className="font-medium text-gray-700 mb-2">
                        Optional items selected:
                      </p>
                      {lineItems
                        .filter((li) => li.isOptional)
                        .map((li) => (
                          <div
                            key={li.id}
                            className="flex items-center justify-between py-1"
                          >
                            <span
                              className={
                                selectedOptionalIds.has(li.id)
                                  ? "text-gray-800"
                                  : "text-gray-400 line-through"
                              }
                            >
                              {li.description}
                            </span>
                            <span
                              className={`text-xs font-medium px-1.5 py-0.5 rounded ${
                                selectedOptionalIds.has(li.id)
                                  ? "bg-green-100 text-green-700"
                                  : "bg-gray-100 text-gray-500"
                              }`}
                            >
                              {selectedOptionalIds.has(li.id)
                                ? "Included"
                                : "Excluded"}
                            </span>
                          </div>
                        ))}
                      <div className="mt-2 pt-2 border-t border-green-100 flex justify-between font-semibold text-gray-900">
                        <span>Approved Total</span>
                        <span>{fmt(computedTotal)}</span>
                      </div>
                    </div>
                  )}

                  {/* E-signature */}
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      Signature (optional)
                    </label>
                    <input
                      type="text"
                      value={signatureName}
                      onChange={(e) => setSignatureName(e.target.value)}
                      placeholder="Type your full name to sign"
                      disabled={isLoading}
                      className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-green-500 focus:border-transparent disabled:opacity-50 bg-white"
                    />
                    <p className="mt-1 text-xs text-gray-500">
                      Today&apos;s date:{" "}
                      {new Date().toLocaleDateString("en-US", {
                        year: "numeric",
                        month: "long",
                        day: "numeric",
                      })}
                    </p>
                  </div>

                  {/* Consent checkbox */}
                  <label className="flex items-start gap-3 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={approveConsent}
                      onChange={(e) => setApproveConsent(e.target.checked)}
                      disabled={isLoading}
                      className="mt-0.5 h-4 w-4 rounded border-gray-300 text-green-600 focus:ring-green-500 cursor-pointer"
                    />
                    <span className="text-sm text-gray-700">
                      I approve this quote and authorize the work described above.
                    </span>
                  </label>

                  {/* Actions */}
                  <div className="flex gap-3 pt-2">
                    <button
                      onClick={() => submitAction("approve")}
                      disabled={!approveConsent || isLoading}
                      className="flex-1 flex items-center justify-center gap-2 px-4 py-2.5 bg-green-600 text-white font-semibold rounded-lg hover:bg-green-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed text-sm"
                    >
                      {isLoading ? (
                        <Loader2 className="w-4 h-4 animate-spin" />
                      ) : (
                        <Check className="w-4 h-4" />
                      )}
                      Confirm Approval
                    </button>
                    <button
                      onClick={() => setActionState({ type: "idle" })}
                      disabled={isLoading}
                      className="px-4 py-2.5 border border-gray-300 text-gray-600 font-medium rounded-lg hover:bg-gray-50 transition-colors disabled:opacity-50 text-sm"
                    >
                      Cancel
                    </button>
                  </div>
                </div>
              )}
            </div>
          )}

          {/* ── DECLINE ─────────────────────────────────────────────────── */}
          {(actionState.type === "idle" ||
            actionState.type === "decline-confirm") && (
            <div
              className={`rounded-lg border transition-colors ${
                actionState.type === "decline-confirm"
                  ? "border-red-200 bg-red-50"
                  : "border-gray-200"
              }`}
            >
              {actionState.type !== "decline-confirm" ? (
                <button
                  onClick={() =>
                    setActionState({ type: "decline-confirm" })
                  }
                  disabled={isLoading}
                  className="w-full px-4 py-3.5 flex items-center gap-3 text-left hover:bg-red-50 transition-colors rounded-lg"
                >
                  <span className="flex-1">
                    <span className="block font-semibold text-red-600">
                      Decline Quote
                    </span>
                    <span className="block text-sm text-gray-500 mt-0.5">
                      Decline this quote — you can always request a revision
                    </span>
                  </span>
                  <X className="w-5 h-5 text-red-500 shrink-0" />
                </button>
              ) : (
                <div className="p-4 space-y-4">
                  <h3 className="font-semibold text-red-800">
                    Decline Quote
                  </h3>

                  <div>
                    <p className="text-sm font-medium text-gray-700 mb-2">
                      Reason for declining:
                    </p>
                    <div className="space-y-2">
                      {DECLINE_REASONS.map((reason) => (
                        <label
                          key={reason}
                          className="flex items-center gap-2.5 cursor-pointer"
                        >
                          <input
                            type="radio"
                            name="decline-reason"
                            value={reason}
                            checked={declineReason === reason}
                            onChange={() => setDeclineReason(reason)}
                            disabled={isLoading}
                            className="h-4 w-4 text-red-600 border-gray-300 focus:ring-red-500 cursor-pointer"
                          />
                          <span className="text-sm text-gray-700">{reason}</span>
                        </label>
                      ))}
                    </div>
                  </div>

                  {declineReason === "Other" && (
                    <textarea
                      value={declineOtherText}
                      onChange={(e) => setDeclineOtherText(e.target.value)}
                      placeholder="Please describe your reason..."
                      rows={3}
                      disabled={isLoading}
                      className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-red-500 focus:border-transparent disabled:opacity-50 resize-none bg-white"
                    />
                  )}

                  <div className="flex gap-3 pt-2">
                    <button
                      onClick={() => submitAction("decline")}
                      disabled={
                        !declineReason ||
                        (declineReason === "Other" && !declineOtherText.trim()) ||
                        isLoading
                      }
                      className="flex-1 flex items-center justify-center gap-2 px-4 py-2.5 bg-red-600 text-white font-semibold rounded-lg hover:bg-red-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed text-sm"
                    >
                      {isLoading ? (
                        <Loader2 className="w-4 h-4 animate-spin" />
                      ) : (
                        <X className="w-4 h-4" />
                      )}
                      Confirm Decline
                    </button>
                    <button
                      onClick={() => setActionState({ type: "idle" })}
                      disabled={isLoading}
                      className="px-4 py-2.5 border border-gray-300 text-gray-600 font-medium rounded-lg hover:bg-gray-50 transition-colors disabled:opacity-50 text-sm"
                    >
                      Cancel
                    </button>
                  </div>
                </div>
              )}
            </div>
          )}

          {/* ── REQUEST CHANGES ─────────────────────────────────────────── */}
          {(actionState.type === "idle" ||
            actionState.type === "changes-confirm") && (
            <div
              className={`rounded-lg border transition-colors ${
                actionState.type === "changes-confirm"
                  ? "border-blue-200 bg-blue-50"
                  : "border-gray-200"
              }`}
            >
              {actionState.type !== "changes-confirm" ? (
                <button
                  onClick={() =>
                    setActionState({ type: "changes-confirm" })
                  }
                  disabled={isLoading}
                  className="w-full px-4 py-3.5 flex items-center gap-3 text-left hover:bg-blue-50 transition-colors rounded-lg"
                >
                  <span className="flex-1">
                    <span className="block font-semibold text-blue-700">
                      Request Changes
                    </span>
                    <span className="block text-sm text-gray-500 mt-0.5">
                      Ask for revisions before approving
                    </span>
                  </span>
                  <MessageSquare className="w-5 h-5 text-blue-600 shrink-0" />
                </button>
              ) : (
                <div className="p-4 space-y-4">
                  <h3 className="font-semibold text-blue-800">
                    Request Changes
                  </h3>

                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      What would you like changed?
                    </label>
                    <textarea
                      value={changeNote}
                      onChange={(e) => setChangeNote(e.target.value)}
                      placeholder="Describe what you'd like changed..."
                      rows={4}
                      disabled={isLoading}
                      className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent disabled:opacity-50 resize-none bg-white"
                    />
                  </div>

                  <div className="flex gap-3 pt-2">
                    <button
                      onClick={() => submitAction("request_changes")}
                      disabled={!changeNote.trim() || isLoading}
                      className="flex-1 flex items-center justify-center gap-2 px-4 py-2.5 bg-blue-600 text-white font-semibold rounded-lg hover:bg-blue-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed text-sm"
                    >
                      {isLoading ? (
                        <Loader2 className="w-4 h-4 animate-spin" />
                      ) : (
                        <MessageSquare className="w-4 h-4" />
                      )}
                      Send Request
                    </button>
                    <button
                      onClick={() => setActionState({ type: "idle" })}
                      disabled={isLoading}
                      className="px-4 py-2.5 border border-gray-300 text-gray-600 font-medium rounded-lg hover:bg-gray-50 transition-colors disabled:opacity-50 text-sm"
                    >
                      Cancel
                    </button>
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
