"use client"

/**
 * ProposalApprovalPage — Full customer-facing proposal approval flow.
 *
 * Sections (vertical scroll):
 * 1. Company header: logo + company name + "Project Proposal"
 * 2. Project summary: customer name, project type, site address
 * 3. Scope description
 * 4. Tier selection (TierSelector): side-by-side columns on desktop
 * 5. Add-ons (AddonSelector): checkboxes with live total
 * 6. Payment schedule: milestone table (read-only)
 * 7. Running total: sticky bar showing selected tier + addons
 * 8. Consumer financing link (if org has financing_partner_url configured)
 * 9. Terms & Conditions (collapsible)
 * 10. E-Signature section (SignaturePad)
 * 11. Request Changes button → modal
 * 12. Deposit payment (Stripe PaymentElement, after signing)
 * 13. Confirmation message
 *
 * No authentication required. Light-themed, company-branded.
 */

import React, { useState, useCallback, useEffect } from "react"
import { loadStripe, type Stripe as StripeClient } from "@stripe/stripe-js"
import {
  Elements,
  PaymentElement,
  useStripe,
  useElements,
} from "@stripe/react-stripe-js"
import { Button } from "@/components/ui/button"
import { Textarea } from "@/components/ui/textarea"
import { TierSelector } from "./tier-selector"
import { AddonSelector } from "./addon-selector"
import { SignaturePad, type SignatureResult } from "./signature-pad"
import type { ProposalPublicData } from "@/actions/projects-approval"
import { approveProposal, submitChangeRequest } from "@/actions/projects-approval"

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function formatCurrency(amount: number): string {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: 0,
    maximumFractionDigits: 2,
  }).format(amount)
}

function formatProjectType(type: string): string {
  const MAP: Record<string, string> = {
    new_pool: "New Pool Construction",
    renovation: "Pool Renovation",
    equipment: "Equipment Upgrade",
    remodel: "Pool Remodel",
    replaster: "Replastering",
    other: "Custom Project",
  }
  return MAP[type] ?? type.replace(/_/g, " ")
}

// ---------------------------------------------------------------------------
// Section wrapper
// ---------------------------------------------------------------------------

function Section({
  title,
  children,
  className = "",
}: {
  title?: string
  children: React.ReactNode
  className?: string
}) {
  return (
    <div className={`bg-white rounded-xl border border-gray-200 shadow-sm p-6 ${className}`}>
      {title && (
        <h2 className="text-lg font-semibold text-gray-900 mb-4">{title}</h2>
      )}
      {children}
    </div>
  )
}

// ---------------------------------------------------------------------------
// RunningTotal — sticky bottom bar
// ---------------------------------------------------------------------------

function RunningTotal({
  tierPrice,
  addonsTotal,
  tierName,
}: {
  tierPrice: number
  addonsTotal: number
  tierName: string | null
}) {
  const total = tierPrice + addonsTotal

  return (
    <div className="sticky bottom-0 left-0 right-0 bg-white border-t border-gray-200 shadow-lg z-30 py-3 px-4">
      <div className="max-w-3xl mx-auto flex items-center justify-between gap-4">
        <div className="flex items-center gap-3 text-sm text-gray-600 flex-wrap">
          {tierName && (
            <span className="font-medium text-gray-900">{tierName}</span>
          )}
          {addonsTotal > 0 && (
            <>
              <span className="text-gray-400">+</span>
              <span>{formatCurrency(addonsTotal)} add-ons</span>
            </>
          )}
        </div>
        <div className="text-right flex-shrink-0">
          <div className="text-xs text-gray-500">Total</div>
          <div className="text-xl font-bold text-gray-900">{formatCurrency(total)}</div>
        </div>
      </div>
    </div>
  )
}

// ---------------------------------------------------------------------------
// ChangeRequestModal
// ---------------------------------------------------------------------------

function ChangeRequestModal({
  proposalId,
  token,
  onClose,
  onSubmitted,
}: {
  proposalId: string
  token: string
  onClose: () => void
  onSubmitted: () => void
}) {
  const [notes, setNotes] = useState("")
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function handleSubmit() {
    if (!notes.trim()) return
    setSubmitting(true)
    setError(null)
    try {
      const result = await submitChangeRequest(proposalId, notes.trim())
      if ("error" in result) {
        setError(result.error)
      } else {
        onSubmitted()
      }
    } catch {
      setError("Failed to submit change request. Please try again.")
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
      <div className="bg-white rounded-xl shadow-xl max-w-lg w-full p-6">
        <h3 className="text-lg font-semibold text-gray-900 mb-2">Request Changes</h3>
        <p className="text-sm text-gray-600 mb-4">
          Describe what you'd like changed. We'll review your request and send a revised
          proposal.
        </p>
        <Textarea
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          placeholder="e.g. I'd like to change the tile color, or can we include solar heating in the package?"
          rows={5}
          className="w-full mb-4 border-gray-300"
          disabled={submitting}
        />
        {error && (
          <p className="text-sm text-red-600 mb-3">{error}</p>
        )}
        <div className="flex gap-3 justify-end">
          <Button
            type="button"
            variant="outline"
            onClick={onClose}
            disabled={submitting}
          >
            Cancel
          </Button>
          <Button
            type="button"
            onClick={handleSubmit}
            disabled={submitting || !notes.trim()}
            className="bg-slate-900 text-white hover:bg-slate-800"
          >
            {submitting ? "Submitting..." : "Submit Request"}
          </Button>
        </div>
      </div>
    </div>
  )
}

// ---------------------------------------------------------------------------
// DepositPaymentForm — inner Stripe Elements form
// ---------------------------------------------------------------------------

function DepositPaymentForm({
  clientSecret,
  amount,
  onSuccess,
  onError,
}: {
  clientSecret: string
  amount: number
  onSuccess: () => void
  onError: (msg: string) => void
}) {
  const stripe = useStripe()
  const elements = useElements()
  const [paying, setPaying] = useState(false)

  async function handlePay() {
    if (!stripe || !elements) return
    setPaying(true)

    const { error } = await stripe.confirmPayment({
      elements,
      confirmParams: {
        return_url: window.location.href,
      },
      redirect: "if_required",
    })

    if (error) {
      onError(error.message ?? "Payment failed. Please try again.")
      setPaying(false)
    } else {
      onSuccess()
    }
  }

  return (
    <div className="space-y-4">
      <PaymentElement />
      <Button
        type="button"
        className="w-full bg-slate-900 text-white hover:bg-slate-800 text-base py-3 h-auto"
        onClick={handlePay}
        disabled={paying || !stripe || !elements}
      >
        {paying
          ? "Processing..."
          : `Pay Deposit — ${formatCurrency(amount)}`}
      </Button>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Main component
// ---------------------------------------------------------------------------

interface ProposalApprovalPageProps {
  token: string
  data: ProposalPublicData
}

export function ProposalApprovalPage({ token, data }: ProposalApprovalPageProps) {
  const { proposal, project, customer, tiers, addons, milestones } = data

  // ── State ─────────────────────────────────────────────────────────────────

  // Tier / addon selection
  const [selectedTierId, setSelectedTierId] = useState<string | null>(
    tiers.length > 0 ? tiers[0].id : null
  )
  const [selectedAddonIds, setSelectedAddonIds] = useState<string[]>([])

  // Signature
  const [signatureResult, setSignatureResult] = useState<SignatureResult | null>(null)
  const [signatureApplied, setSignatureApplied] = useState(false)

  // Change request modal
  const [showChangeRequest, setShowChangeRequest] = useState(false)
  const [changeRequestSent, setChangeRequestSent] = useState(false)

  // Terms expanded
  const [termsExpanded, setTermsExpanded] = useState(false)

  // Deposit payment flow
  const [depositClientSecret, setDepositClientSecret] = useState<string | null>(null)
  const [depositAmount, setDepositAmount] = useState(0)
  const [depositMilestoneId, setDepositMilestoneId] = useState<string | null>(null)
  const [splitDeposit, setSplitDeposit] = useState(false)
  const [fetchingIntent, setFetchingIntent] = useState(false)
  const [paymentError, setPaymentError] = useState<string | null>(null)
  const [paymentSuccess, setPaymentSuccess] = useState(false)

  // Overall approval status
  const [approving, setApproving] = useState(false)
  const [approvalError, setApprovalError] = useState<string | null>(null)
  const [approvalDone, setApprovalDone] = useState(false)

  // Stripe instance
  const [stripeInstance, setStripeInstance] = useState<StripeClient | null>(null)

  // Load Stripe
  useEffect(() => {
    if (data.stripePublishableKey && data.stripeConnected && !stripeInstance) {
      loadStripe(data.stripePublishableKey, {
        stripeAccount: data.stripeAccountId!,
      }).then((s) => {
        if (s) setStripeInstance(s)
      })
    }
  }, [data.stripePublishableKey, data.stripeConnected, data.stripeAccountId, stripeInstance])

  // ── Computed prices ───────────────────────────────────────────────────────

  const selectedTier = tiers.find((t) => t.id === selectedTierId) ?? null
  const tierPrice = selectedTier ? parseFloat(selectedTier.price) : 0

  const addonsTotal = selectedAddonIds.reduce((sum, id) => {
    const addon = addons.find((a) => a.id === id)
    return sum + (addon ? parseFloat(addon.price) : 0)
  }, 0)

  const grandTotal = tierPrice + addonsTotal

  // Recalculate deposit milestone amounts live
  const depositMilestone = milestones.find((m) =>
    m.name.toLowerCase().includes("deposit")
  ) ?? milestones[0] ?? null

  const computedDepositAmount = depositMilestone
    ? depositMilestone.percentage
      ? (grandTotal * parseFloat(depositMilestone.percentage)) / 100
      : parseFloat(depositMilestone.amount)
    : 0

  // Compute milestones with live amounts
  const computedMilestones = milestones.map((m) => ({
    ...m,
    computedAmount: m.percentage
      ? (grandTotal * parseFloat(m.percentage)) / 100
      : parseFloat(m.amount),
  }))

  // ── Handlers ──────────────────────────────────────────────────────────────

  const handleSignature = useCallback((result: SignatureResult) => {
    setSignatureResult(result)
    setSignatureApplied(true)
  }, [])

  const handleClearSignature = useCallback(() => {
    setSignatureResult(null)
    setSignatureApplied(false)
    setDepositClientSecret(null)
  }, [])

  const handleApproveAndProceedToPayment = useCallback(async () => {
    if (!signatureResult) return
    setApproving(true)
    setApprovalError(null)

    try {
      // 1. Record approval in DB
      const result = await approveProposal(proposal.id, {
        proposalToken: token,
        selectedTierId,
        selectedAddonIds,
        signatureDataUrl: signatureResult.dataUrl,
        signedName: signatureResult.signedName,
        signedIp: null, // Client IP not available in browser context
      })

      if ("error" in result) {
        setApprovalError(result.error)
        setApproving(false)
        return
      }

      setDepositMilestoneId(result.depositMilestoneId)
      setDepositAmount(result.depositAmount)

      // 2. If Stripe is connected and deposit > 0, fetch payment intent
      if (data.stripeConnected && result.depositAmount > 0 && result.depositMilestoneId) {
        setFetchingIntent(true)
        const res = await fetch("/api/projects/deposit", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            proposalToken: token,
            milestoneId: result.depositMilestoneId,
            splitDeposit,
          }),
        })

        if (res.ok) {
          const intentData = await res.json()
          setDepositClientSecret(intentData.clientSecret)
          setDepositAmount(intentData.amount)
        } else {
          // Non-fatal — show offline payment option instead
          console.error("Failed to create payment intent")
        }
        setFetchingIntent(false)
      } else {
        // No Stripe or no deposit — mark as approved done
        setApprovalDone(true)
      }
    } catch {
      setApprovalError("Something went wrong. Please try again.")
    } finally {
      setApproving(false)
    }
  }, [
    signatureResult,
    token,
    proposal.id,
    selectedTierId,
    selectedAddonIds,
    data.stripeConnected,
    splitDeposit,
  ])

  // ── Confirmation screen ───────────────────────────────────────────────────

  if (paymentSuccess || approvalDone) {
    return (
      <div className="space-y-4">
        <div className="bg-white rounded-xl border border-green-200 shadow-sm p-8 text-center">
          <div className="h-12 w-12 rounded-full bg-green-100 flex items-center justify-center mx-auto mb-4">
            <svg
              className="h-6 w-6 text-green-600"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
              strokeWidth={2}
            >
              <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
            </svg>
          </div>
          <h2 className="text-xl font-bold text-gray-900 mb-2">You're all set!</h2>
          <p className="text-gray-600 max-w-md mx-auto">
            Your proposal has been signed and{" "}
            {paymentSuccess ? "your deposit payment is being processed." : "we've received your approval."}
            {" "}We'll be in touch soon to schedule the work.
          </p>
          {data.companyName && (
            <p className="text-sm text-gray-500 mt-4">
              — {data.companyName}
            </p>
          )}
        </div>
      </div>
    )
  }

  // ── Change request sent screen ────────────────────────────────────────────

  if (changeRequestSent) {
    return (
      <div className="bg-white rounded-xl border border-blue-200 shadow-sm p-8 text-center">
        <div className="h-12 w-12 rounded-full bg-blue-100 flex items-center justify-center mx-auto mb-4">
          <svg
            className="h-6 w-6 text-blue-600"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
            strokeWidth={2}
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z"
            />
          </svg>
        </div>
        <h2 className="text-xl font-bold text-gray-900 mb-2">Change request sent</h2>
        <p className="text-gray-600 max-w-md mx-auto">
          We've received your feedback and will follow up with a revised proposal shortly.
        </p>
      </div>
    )
  }

  // ── Main approval page ────────────────────────────────────────────────────

  return (
    <>
      <div className="space-y-5 pb-28">

        {/* 2. Project summary */}
        <Section>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <div className="text-xs font-medium text-gray-500 uppercase tracking-wide mb-1">
                Customer
              </div>
              <div className="text-base font-semibold text-gray-900">
                {customer.full_name}
              </div>
            </div>
            <div>
              <div className="text-xs font-medium text-gray-500 uppercase tracking-wide mb-1">
                Project Type
              </div>
              <div className="text-base font-semibold text-gray-900">
                {formatProjectType(project.project_type)}
              </div>
            </div>
            {customer.address && (
              <div className="sm:col-span-2">
                <div className="text-xs font-medium text-gray-500 uppercase tracking-wide mb-1">
                  Site Address
                </div>
                <div className="text-sm text-gray-700">{customer.address}</div>
              </div>
            )}
            {proposal.version > 1 && (
              <div>
                <div className="text-xs font-medium text-gray-500 uppercase tracking-wide mb-1">
                  Version
                </div>
                <div className="text-sm text-gray-700">Revision {proposal.version}</div>
              </div>
            )}
          </div>
        </Section>

        {/* 3. Scope description */}
        {proposal.scope_description && (
          <Section title="Scope of Work">
            <p className="text-gray-700 whitespace-pre-wrap leading-relaxed text-sm">
              {proposal.scope_description}
            </p>
          </Section>
        )}

        {/* 4. Tier selection */}
        {tiers.length > 0 && (
          <Section title="Select Your Package">
            <p className="text-sm text-gray-600 mb-4">
              Choose the package that best fits your needs and budget.
            </p>
            <TierSelector
              tiers={tiers}
              selectedTierId={selectedTierId}
              onSelect={setSelectedTierId}
              disabled={!!depositClientSecret || approvalDone}
            />
          </Section>
        )}

        {/* 5. Add-ons */}
        {addons.length > 0 && (
          <Section title="Optional Add-Ons">
            <p className="text-sm text-gray-600 mb-4">
              Customize your project with these optional upgrades.
            </p>
            <AddonSelector
              addons={addons}
              selectedAddonIds={selectedAddonIds}
              onSelectionChange={setSelectedAddonIds}
              disabled={!!depositClientSecret || approvalDone}
            />
            {selectedAddonIds.length > 0 && (
              <div className="mt-3 pt-3 border-t border-gray-100 flex justify-between text-sm font-medium text-gray-700">
                <span>Selected add-ons total</span>
                <span>{formatCurrency(addonsTotal)}</span>
              </div>
            )}
          </Section>
        )}

        {/* 6. Payment schedule */}
        {computedMilestones.length > 0 && (
          <Section title="Payment Schedule">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-gray-100">
                    <th className="pb-2 text-left font-medium text-gray-500">Milestone</th>
                    <th className="pb-2 text-right font-medium text-gray-500">Amount</th>
                    {computedMilestones.some((m) => m.percentage) && (
                      <th className="pb-2 text-right font-medium text-gray-500 hidden sm:table-cell">
                        %
                      </th>
                    )}
                    {computedMilestones.some((m) => m.due_date) && (
                      <th className="pb-2 text-right font-medium text-gray-500 hidden sm:table-cell">
                        Due
                      </th>
                    )}
                  </tr>
                </thead>
                <tbody>
                  {computedMilestones.map((milestone) => (
                    <tr key={milestone.id} className="border-b border-gray-50 last:border-0">
                      <td className="py-2.5 text-gray-800">{milestone.name}</td>
                      <td className="py-2.5 text-right font-medium text-gray-900">
                        {formatCurrency(milestone.computedAmount)}
                      </td>
                      {computedMilestones.some((m) => m.percentage) && (
                        <td className="py-2.5 text-right text-gray-500 hidden sm:table-cell">
                          {milestone.percentage ? `${parseFloat(milestone.percentage).toFixed(0)}%` : "—"}
                        </td>
                      )}
                      {computedMilestones.some((m) => m.due_date) && (
                        <td className="py-2.5 text-right text-gray-500 hidden sm:table-cell">
                          {milestone.due_date ?? "—"}
                        </td>
                      )}
                    </tr>
                  ))}
                  <tr className="border-t border-gray-200">
                    <td className="pt-2.5 font-semibold text-gray-900">Total</td>
                    <td className="pt-2.5 text-right font-bold text-gray-900">
                      {formatCurrency(grandTotal)}
                    </td>
                    {computedMilestones.some((m) => m.percentage) && (
                      <td className="hidden sm:table-cell" />
                    )}
                    {computedMilestones.some((m) => m.due_date) && (
                      <td className="hidden sm:table-cell" />
                    )}
                  </tr>
                </tbody>
              </table>
            </div>
            <p className="mt-3 text-xs text-gray-500">
              Final payment amounts may vary based on retainage and change orders.
            </p>
          </Section>
        )}

        {/* 8. Consumer financing link */}
        {data.financingPartnerUrl && (
          <div className="bg-blue-50 rounded-xl border border-blue-100 p-5">
            <div className="flex items-start gap-3">
              <div className="flex-1">
                <h3 className="text-sm font-semibold text-blue-900 mb-1">
                  Financing available
                </h3>
                <p className="text-sm text-blue-700">
                  Spread the cost of your project with flexible financing options.
                </p>
              </div>
              <a
                href={`${data.financingPartnerUrl}?amount=${Math.round(grandTotal)}`}
                target="_blank"
                rel="noopener noreferrer"
                className="flex-shrink-0 inline-flex items-center px-3 py-1.5 rounded-lg bg-blue-600 text-white text-xs font-medium hover:bg-blue-700 transition-colors"
              >
                Explore Financing
              </a>
            </div>
          </div>
        )}

        {/* 9. Terms & Conditions */}
        {proposal.terms_and_conditions && (
          <Section>
            <button
              type="button"
              onClick={() => setTermsExpanded((v) => !v)}
              className="w-full flex items-center justify-between text-left"
            >
              <span className="font-semibold text-gray-900">Terms & Conditions</span>
              <svg
                className={`h-5 w-5 text-gray-400 transition-transform ${termsExpanded ? "rotate-180" : ""}`}
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
                strokeWidth={2}
              >
                <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
              </svg>
            </button>
            {termsExpanded && (
              <div className="mt-4 pt-4 border-t border-gray-100">
                <p className="text-sm text-gray-700 whitespace-pre-wrap leading-relaxed">
                  {proposal.terms_and_conditions}
                </p>
              </div>
            )}
          </Section>
        )}

        {/* Warranty info */}
        {proposal.warranty_info && (
          <div className="bg-green-50 rounded-xl border border-green-100 p-5">
            <h3 className="text-sm font-semibold text-green-900 mb-1">Warranty Information</h3>
            <p className="text-sm text-green-800 leading-relaxed">{proposal.warranty_info}</p>
          </div>
        )}

        {/* 10. E-Signature section */}
        {!depositClientSecret && !approvalDone && (
          <Section title="Your Signature">
            {!signatureApplied ? (
              <>
                <p className="text-sm text-gray-600 mb-4">
                  By signing below, you agree to the proposal terms and authorize us to
                  begin scheduling your project upon receipt of the deposit.
                </p>
                <SignaturePad
                  onSign={handleSignature}
                  onClear={handleClearSignature}
                  defaultName={customer.full_name}
                  disabled={approving}
                />
              </>
            ) : (
              <div className="space-y-4">
                <div className="flex items-center gap-3 p-4 rounded-lg bg-green-50 border border-green-200">
                  <div className="h-8 w-8 rounded-full bg-green-100 flex items-center justify-center flex-shrink-0">
                    <svg
                      className="h-4 w-4 text-green-600"
                      fill="none"
                      viewBox="0 0 24 24"
                      stroke="currentColor"
                      strokeWidth={2.5}
                    >
                      <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                    </svg>
                  </div>
                  <div>
                    <p className="text-sm font-medium text-green-800">
                      Signed by {signatureResult?.signedName}
                    </p>
                    <p className="text-xs text-green-700">
                      {signatureResult?.signedAt
                        ? new Date(signatureResult.signedAt).toLocaleString()
                        : ""}
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={handleClearSignature}
                    className="ml-auto text-xs text-gray-500 hover:text-gray-700 underline"
                    disabled={approving}
                  >
                    Clear
                  </button>
                </div>

                {/* Signature preview */}
                {signatureResult?.dataUrl && (
                  <div className="rounded-lg border border-gray-200 bg-white p-3">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                      src={signatureResult.dataUrl}
                      alt="Your signature"
                      className="max-w-full h-auto"
                      style={{ maxHeight: "80px" }}
                    />
                  </div>
                )}
              </div>
            )}
          </Section>
        )}

        {/* 11. Request Changes button */}
        {!depositClientSecret && !approvalDone && (
          <div className="text-center">
            <button
              type="button"
              onClick={() => setShowChangeRequest(true)}
              className="text-sm text-gray-500 hover:text-gray-700 underline underline-offset-2"
            >
              Need changes before signing?
            </button>
          </div>
        )}

        {/* Approve + Pay button (shows after signing) */}
        {signatureApplied && !depositClientSecret && !approvalDone && (
          <div className="space-y-3">
            {approvalError && (
              <div className="bg-red-50 border border-red-200 rounded-lg p-4">
                <p className="text-sm text-red-700">{approvalError}</p>
              </div>
            )}

            {/* Split deposit toggle */}
            {data.stripeConnected && computedDepositAmount > 0 && (
              <div className="bg-gray-50 rounded-xl border border-gray-200 p-4">
                <label className="flex items-center gap-3 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={splitDeposit}
                    onChange={(e) => setSplitDeposit(e.target.checked)}
                    className="h-4 w-4 rounded border-gray-300"
                    disabled={approving}
                  />
                  <div>
                    <span className="text-sm font-medium text-gray-800">
                      Split deposit — pay {formatCurrency(computedDepositAmount / 2)} now,{" "}
                      {formatCurrency(computedDepositAmount - computedDepositAmount / 2)} in 7 days
                    </span>
                  </div>
                </label>
              </div>
            )}

            <Button
              type="button"
              className="w-full bg-slate-900 text-white hover:bg-slate-800 text-base py-4 h-auto"
              onClick={handleApproveAndProceedToPayment}
              disabled={approving || fetchingIntent}
            >
              {approving || fetchingIntent
                ? "Processing..."
                : data.stripeConnected && computedDepositAmount > 0
                  ? `Sign & Pay Deposit — ${formatCurrency(splitDeposit ? computedDepositAmount / 2 : computedDepositAmount)}`
                  : "Sign & Approve Proposal"}
            </Button>

            {data.stripeConnected && computedDepositAmount > 0 && (
              <p className="text-xs text-center text-gray-500">
                By clicking above, you agree to the terms and authorize the deposit payment.
              </p>
            )}
          </div>
        )}

        {/* 12. Stripe deposit payment form */}
        {depositClientSecret && stripeInstance && !paymentSuccess && (
          <Section title="Deposit Payment">
            <p className="text-sm text-gray-600 mb-4">
              Your proposal is approved. Complete the deposit payment to confirm your
              project start.
            </p>

            {paymentError && (
              <div className="mb-4 bg-red-50 border border-red-200 rounded-lg p-3">
                <p className="text-sm text-red-700">{paymentError}</p>
              </div>
            )}

            <Elements
              stripe={stripeInstance}
              options={{
                clientSecret: depositClientSecret,
                appearance: {
                  theme: "stripe",
                  variables: {
                    colorPrimary: "#0f172a",
                    borderRadius: "8px",
                  },
                },
              }}
            >
              <DepositPaymentForm
                clientSecret={depositClientSecret}
                amount={depositAmount}
                onSuccess={() => setPaymentSuccess(true)}
                onError={(msg) => setPaymentError(msg)}
              />
            </Elements>

            {/* Offline payment option */}
            <div className="mt-6 pt-5 border-t border-gray-100">
              <p className="text-sm text-gray-500 text-center">
                Prefer to pay by check or cash?{" "}
                <button
                  type="button"
                  onClick={() => setApprovalDone(true)}
                  className="text-gray-700 underline underline-offset-2 hover:text-gray-900"
                >
                  Skip online payment
                </button>
                {" "}— our office will contact you to arrange.
              </p>
            </div>
          </Section>
        )}

        {/* Deposit payment: no Stripe connected, but deposit exists */}
        {depositClientSecret === null &&
          approvalDone === false &&
          depositMilestoneId !== null &&
          !data.stripeConnected &&
          signatureApplied && (
          <Section title="Deposit Payment">
            <div className="bg-gray-50 rounded-lg p-4 text-center">
              <p className="text-sm text-gray-600">
                Online payment is not available at this time.
                Our office will contact you to arrange the deposit payment of{" "}
                <strong>{formatCurrency(computedDepositAmount)}</strong>.
              </p>
            </div>
          </Section>
        )}

      </div>

      {/* Running total bar */}
      {!approvalDone && !paymentSuccess && (
        <RunningTotal
          tierPrice={tierPrice}
          addonsTotal={addonsTotal}
          tierName={selectedTier?.name ?? null}
        />
      )}

      {/* Change request modal */}
      {showChangeRequest && (
        <ChangeRequestModal
          proposalId={proposal.id}
          token={token}
          onClose={() => setShowChangeRequest(false)}
          onSubmitted={() => {
            setShowChangeRequest(false)
            setChangeRequestSent(true)
          }}
        />
      )}
    </>
  )
}
