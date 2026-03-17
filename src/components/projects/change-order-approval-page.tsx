"use client"

/**
 * ChangeOrderApprovalPage — Customer-facing change order approval component.
 *
 * Rendered on the public /change-order/[token] page with no auth required.
 * Shows clear before/after cost impact, schedule impact, line item breakdown,
 * and payment schedule preview.
 *
 * Approval requires: typed name + agreement checkbox
 * Decline: optional reason textarea
 *
 * Phase 12: Projects & Renovations — Plan 13
 */

import { useState } from "react"
import { approveChangeOrder, declineChangeOrder } from "@/actions/projects-change-orders"
import type { ChangeOrderPublicData } from "@/actions/projects-change-orders"

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function formatCurrency(n: number): string {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: 2,
  }).format(n)
}

function reasonLabel(reason: string): string {
  const map: Record<string, string> = {
    scope_change: "Scope Change",
    unforeseen_conditions: "Unforeseen Conditions",
    customer_request: "Customer Request",
    design_change: "Design Change",
    regulatory: "Regulatory / Code Requirement",
    other: "Other",
  }
  return map[reason] ?? reason
}

// ---------------------------------------------------------------------------
// ChangeOrderApprovalPage
// ---------------------------------------------------------------------------

interface ChangeOrderApprovalPageProps {
  data: ChangeOrderPublicData
}

type PageState = "review" | "approved" | "declined" | "declining"

export function ChangeOrderApprovalPage({ data }: ChangeOrderApprovalPageProps) {
  const { changeOrder, project, company, paymentMilestones } = data

  const costImpact = parseFloat(changeOrder.cost_impact)
  const currentContractAmount = parseFloat(project.contract_amount ?? "0")
  const newContractAmount = currentContractAmount + costImpact
  const isIncrease = costImpact > 0
  const hasCostImpact = costImpact !== 0
  const hasScheduleImpact = changeOrder.schedule_impact_days !== 0

  const [pageState, setPageState] = useState<PageState>("review")
  const [signedName, setSignedName] = useState("")
  const [agreed, setAgreed] = useState(false)
  const [declineReason, setDeclineReason] = useState("")
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // Already approved/declined — show static state
  if (changeOrder.status === "approved") {
    return (
      <div className="min-h-screen bg-[#0f172a] flex items-center justify-center p-4">
        <div className="max-w-lg w-full text-center">
          <div className="text-5xl mb-4">✓</div>
          <h1 className="text-2xl font-bold text-white mb-2">Change Order Approved</h1>
          <p className="text-[#94a3b8]">
            Change order {changeOrder.change_order_number} was approved
            {changeOrder.approved_signature ? ` by ${changeOrder.approved_signature}` : ""}.
            {changeOrder.approved_at
              ? ` on ${new Date(changeOrder.approved_at).toLocaleDateString()}`
              : ""}
          </p>
        </div>
      </div>
    )
  }

  if (changeOrder.status === "declined") {
    return (
      <div className="min-h-screen bg-[#0f172a] flex items-center justify-center p-4">
        <div className="max-w-lg w-full text-center">
          <h1 className="text-2xl font-bold text-white mb-2">Change Order Declined</h1>
          <p className="text-[#94a3b8]">
            You declined change order {changeOrder.change_order_number}. The {company.name} team
            has been notified.
          </p>
        </div>
      </div>
    )
  }

  if (pageState === "approved") {
    return (
      <div className="min-h-screen bg-[#0f172a] flex items-center justify-center p-4">
        <div className="max-w-lg w-full text-center">
          <div className="text-5xl mb-4">✓</div>
          <h1 className="text-2xl font-bold text-white mb-2">Change Order Approved</h1>
          <p className="text-[#94a3b8] mb-4">
            Thank you, {signedName}. Your approval of change order{" "}
            {changeOrder.change_order_number} has been recorded.
          </p>
          {hasCostImpact && (
            <p className="text-sm text-[#94a3b8]">
              Your updated contract total is{" "}
              <span className="font-semibold text-white">
                {formatCurrency(newContractAmount)}
              </span>
              .
            </p>
          )}
          {company.email && (
            <p className="text-sm text-[#94a3b8] mt-3">
              Contact us at{" "}
              <a href={`mailto:${company.email}`} className="text-[#60a5fa] underline">
                {company.email}
              </a>{" "}
              if you have any questions.
            </p>
          )}
        </div>
      </div>
    )
  }

  if (pageState === "declined") {
    return (
      <div className="min-h-screen bg-[#0f172a] flex items-center justify-center p-4">
        <div className="max-w-lg w-full text-center">
          <h1 className="text-2xl font-bold text-white mb-2">Change Order Declined</h1>
          <p className="text-[#94a3b8] mb-4">
            We&apos;ve notified the {company.name} team. They will follow up with you shortly.
          </p>
          {company.email && (
            <p className="text-sm text-[#94a3b8]">
              You can also reach us at{" "}
              <a href={`mailto:${company.email}`} className="text-[#60a5fa] underline">
                {company.email}
              </a>
              .
            </p>
          )}
        </div>
      </div>
    )
  }

  // ── Decline confirmation view ─────────────────────────────────────────────
  if (pageState === "declining") {
    async function handleDeclineConfirm() {
      setIsSubmitting(true)
      setError(null)
      try {
        const result = await declineChangeOrder(changeOrder.id, declineReason.trim() || undefined)
        if (!result.success) {
          setError(result.error ?? "An error occurred. Please try again.")
          return
        }
        setPageState("declined")
      } catch {
        setError("An unexpected error occurred. Please try again.")
      } finally {
        setIsSubmitting(false)
      }
    }

    return (
      <div className="min-h-screen bg-[#0f172a] flex items-center justify-center p-4">
        <div className="max-w-lg w-full">
          <div
            style={{
              backgroundColor: "#1e293b",
              border: "1px solid #334155",
              borderRadius: "12px",
              padding: "32px",
            }}
          >
            <h1 className="text-xl font-bold text-white mb-2">Decline Change Order</h1>
            <p className="text-sm text-[#94a3b8] mb-4">
              Please let us know if you have any concerns or if there is a specific reason for
              declining.
            </p>
            {error && (
              <div className="rounded-md bg-red-500/15 border border-red-500/30 px-3 py-2 text-sm text-red-400 mb-4">
                {error}
              </div>
            )}
            <textarea
              value={declineReason}
              onChange={(e) => setDeclineReason(e.target.value)}
              placeholder="Optional: reason for declining..."
              rows={3}
              className="w-full rounded-md border border-[#334155] bg-[#0f172a] text-white text-sm px-3 py-2 resize-none focus:outline-none focus:border-[#2563eb] mb-4"
            />
            <div className="flex gap-3">
              <button
                onClick={() => {
                  setPageState("review")
                  setError(null)
                }}
                className="flex-1 rounded-md border border-[#334155] text-[#94a3b8] text-sm font-medium py-2.5 hover:border-[#4f6a8e] transition-colors"
              >
                Go Back
              </button>
              <button
                onClick={handleDeclineConfirm}
                disabled={isSubmitting}
                className="flex-1 rounded-md bg-red-500/80 hover:bg-red-500 text-white text-sm font-semibold py-2.5 transition-colors disabled:opacity-50"
              >
                {isSubmitting ? "Declining..." : "Confirm Decline"}
              </button>
            </div>
          </div>
        </div>
      </div>
    )
  }

  // ── Main review view ──────────────────────────────────────────────────────

  async function handleApprove() {
    if (!signedName.trim() || !agreed) return
    setIsSubmitting(true)
    setError(null)
    try {
      const result = await approveChangeOrder(changeOrder.id, {
        signedName: signedName.trim(),
        agreedToTerms: agreed,
      })
      if (!result.success) {
        setError(result.error ?? "An error occurred. Please try again.")
        return
      }
      setPageState("approved")
    } catch {
      setError("An unexpected error occurred. Please try again.")
    } finally {
      setIsSubmitting(false)
    }
  }

  return (
    <div
      style={{
        minHeight: "100vh",
        backgroundColor: "#0f172a",
        fontFamily:
          "-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif",
        padding: "24px 16px 48px",
      }}
    >
      <div style={{ maxWidth: "640px", margin: "0 auto" }}>
        {/* ── Company Header ───────────────────────────────────────────── */}
        <div
          style={{
            backgroundColor: "#2563eb",
            borderRadius: "12px 12px 0 0",
            padding: "20px 24px",
          }}
        >
          <div
            style={{
              fontSize: "11px",
              fontWeight: 700,
              color: "rgba(255,255,255,0.8)",
              letterSpacing: "0.08em",
              textTransform: "uppercase",
              marginBottom: "4px",
            }}
          >
            {company.name}
          </div>
          <div style={{ fontSize: "20px", fontWeight: 800, color: "#ffffff" }}>
            Change Order {changeOrder.change_order_number}
          </div>
        </div>

        {/* ── Project Reference ────────────────────────────────────────── */}
        <SectionCard>
          <Row label="Project" value={project.name} />
          {project.address && <Row label="Property" value={project.address} />}
          {project.project_number && (
            <Row label="Project Number" value={project.project_number} />
          )}
        </SectionCard>

        {/* ── Description ──────────────────────────────────────────────── */}
        <SectionCard>
          <SectionLabel>Description of Change</SectionLabel>
          <p
            style={{
              margin: 0,
              fontSize: "14px",
              color: "#f1f5f9",
              lineHeight: "1.65",
              whiteSpace: "pre-wrap",
            }}
          >
            {changeOrder.description}
          </p>
          <div style={{ marginTop: "12px" }}>
            <Row label="Reason" value={reasonLabel(changeOrder.reason)} />
          </div>
        </SectionCard>

        {/* ── Line Items ───────────────────────────────────────────────── */}
        {changeOrder.line_items && changeOrder.line_items.length > 0 && (
          <SectionCard>
            <SectionLabel>Work Breakdown</SectionLabel>
            <table style={{ width: "100%", borderCollapse: "collapse" }}>
              <thead>
                <tr style={{ borderBottom: "1px solid #334155" }}>
                  <th style={thStyle}>Description</th>
                  <th style={{ ...thStyle, textAlign: "right" }}>Qty</th>
                  <th style={{ ...thStyle, textAlign: "right" }}>Unit Price</th>
                  <th style={{ ...thStyle, textAlign: "right" }}>Total</th>
                </tr>
              </thead>
              <tbody>
                {changeOrder.line_items.map((li, idx) => (
                  <tr
                    key={idx}
                    style={{
                      borderBottom: "1px solid #1e293b",
                    }}
                  >
                    <td style={tdStyle}>
                      <div style={{ color: "#f1f5f9", fontSize: "13px" }}>{li.description}</div>
                      <div style={{ color: "#64748b", fontSize: "11px", textTransform: "uppercase" }}>
                        {li.category}
                      </div>
                    </td>
                    <td style={{ ...tdStyle, textAlign: "right", color: "#94a3b8" }}>
                      {li.quantity}
                    </td>
                    <td style={{ ...tdStyle, textAlign: "right", color: "#94a3b8" }}>
                      {formatCurrency(li.unit_price)}
                    </td>
                    <td
                      style={{
                        ...tdStyle,
                        textAlign: "right",
                        fontWeight: 600,
                        color: li.total < 0 ? "#4ade80" : "#f1f5f9",
                      }}
                    >
                      {li.total < 0 ? "-" : ""}
                      {formatCurrency(Math.abs(li.total))}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </SectionCard>
        )}

        {/* ── Financial Impact ─────────────────────────────────────────── */}
        {hasCostImpact && (
          <SectionCard>
            <SectionLabel>Financial Impact</SectionLabel>
            <div
              style={{
                backgroundColor: isIncrease ? "rgba(239,68,68,0.08)" : "rgba(74,222,128,0.08)",
                border: `1px solid ${isIncrease ? "rgba(239,68,68,0.25)" : "rgba(74,222,128,0.25)"}`,
                borderRadius: "8px",
                padding: "16px",
                marginBottom: "12px",
              }}
            >
              <div style={{ fontSize: "12px", color: "#94a3b8", marginBottom: "4px" }}>
                This change order {isIncrease ? "increases" : "decreases"} your project total
              </div>
              <div
                style={{
                  fontSize: "22px",
                  fontWeight: 800,
                  color: isIncrease ? "#f87171" : "#4ade80",
                }}
              >
                {isIncrease ? "+" : ""}
                {formatCurrency(costImpact)}
              </div>
            </div>
            {currentContractAmount > 0 && (
              <>
                <Row label="Current contract total" value={formatCurrency(currentContractAmount)} />
                <Row
                  label="New contract total"
                  value={formatCurrency(newContractAmount)}
                  highlight
                />
              </>
            )}
          </SectionCard>
        )}

        {/* ── Schedule Impact ──────────────────────────────────────────── */}
        {hasScheduleImpact && (
          <SectionCard>
            <SectionLabel>Schedule Impact</SectionLabel>
            <div
              style={{
                padding: "12px",
                borderRadius: "8px",
                backgroundColor: "rgba(251,191,36,0.08)",
                border: "1px solid rgba(251,191,36,0.2)",
              }}
            >
              <div style={{ fontSize: "14px", color: "#fbbf24", fontWeight: 600 }}>
                {changeOrder.schedule_impact_days > 0
                  ? `This adds ${changeOrder.schedule_impact_days} day${changeOrder.schedule_impact_days === 1 ? "" : "s"} to the project timeline`
                  : `This removes ${Math.abs(changeOrder.schedule_impact_days)} day${Math.abs(changeOrder.schedule_impact_days) === 1 ? "" : "s"} from the project timeline`}
              </div>
            </div>
          </SectionCard>
        )}

        {/* ── Payment Schedule Preview ─────────────────────────────────── */}
        {paymentMilestones.length > 0 && (
          <SectionCard>
            <SectionLabel>Remaining Payment Schedule</SectionLabel>
            <p style={{ fontSize: "12px", color: "#64748b", margin: "0 0 12px" }}>
              Your current pending payments (before this change order is applied)
            </p>
            {paymentMilestones.map((m) => (
              <div
                key={m.id}
                style={{
                  display: "flex",
                  justifyContent: "space-between",
                  padding: "8px 0",
                  borderBottom: "1px solid #1e293b",
                  fontSize: "13px",
                }}
              >
                <span style={{ color: "#94a3b8" }}>{m.name}</span>
                <span style={{ color: "#f1f5f9", fontWeight: 600 }}>
                  {formatCurrency(parseFloat(m.amount))}
                </span>
              </div>
            ))}
          </SectionCard>
        )}

        {/* ── Approval Form ────────────────────────────────────────────── */}
        <SectionCard>
          <SectionLabel>Approve Change Order</SectionLabel>
          <p style={{ fontSize: "13px", color: "#94a3b8", margin: "0 0 16px" }}>
            By typing your name and checking the box below, you authorize {company.name} to
            proceed with the changes described in this change order.
          </p>

          {error && (
            <div
              style={{
                backgroundColor: "rgba(239,68,68,0.12)",
                border: "1px solid rgba(239,68,68,0.3)",
                borderRadius: "6px",
                padding: "10px 12px",
                fontSize: "13px",
                color: "#f87171",
                marginBottom: "12px",
              }}
            >
              {error}
            </div>
          )}

          <div style={{ marginBottom: "12px" }}>
            <label
              style={{
                display: "block",
                fontSize: "12px",
                color: "#94a3b8",
                marginBottom: "6px",
                fontWeight: 600,
                textTransform: "uppercase",
                letterSpacing: "0.05em",
              }}
            >
              Your Full Name (Signature)
            </label>
            <input
              type="text"
              value={signedName}
              onChange={(e) => setSignedName(e.target.value)}
              placeholder="Type your full name to sign"
              style={{
                width: "100%",
                backgroundColor: "#0f172a",
                border: "1px solid #334155",
                borderRadius: "8px",
                padding: "10px 12px",
                fontSize: "15px",
                fontStyle: "italic",
                color: "#f1f5f9",
                outline: "none",
                boxSizing: "border-box",
              }}
            />
          </div>

          <label
            style={{
              display: "flex",
              alignItems: "flex-start",
              gap: "10px",
              cursor: "pointer",
              marginBottom: "20px",
            }}
          >
            <input
              type="checkbox"
              checked={agreed}
              onChange={(e) => setAgreed(e.target.checked)}
              style={{ marginTop: "2px", width: "16px", height: "16px", accentColor: "#2563eb" }}
            />
            <span style={{ fontSize: "13px", color: "#94a3b8", lineHeight: "1.5" }}>
              I agree to the changes described in this change order and authorize {company.name} to
              proceed with the work and associated costs.
            </span>
          </label>

          <button
            onClick={handleApprove}
            disabled={!signedName.trim() || !agreed || isSubmitting}
            style={{
              width: "100%",
              padding: "14px",
              backgroundColor: !signedName.trim() || !agreed || isSubmitting ? "#1e3a6e" : "#2563eb",
              color: !signedName.trim() || !agreed || isSubmitting ? "#4a6490" : "#ffffff",
              border: "none",
              borderRadius: "8px",
              fontSize: "15px",
              fontWeight: 700,
              cursor: !signedName.trim() || !agreed || isSubmitting ? "not-allowed" : "pointer",
              transition: "background-color 0.15s",
            }}
          >
            {isSubmitting ? "Processing..." : "Approve Change Order"}
          </button>
        </SectionCard>

        {/* ── Decline ──────────────────────────────────────────────────── */}
        <SectionCard>
          <SectionLabel>Have Questions?</SectionLabel>
          <p style={{ fontSize: "13px", color: "#94a3b8", margin: "0 0 16px" }}>
            If you have concerns or questions about this change order, please contact us before
            approving or declining.
          </p>
          <div style={{ display: "flex", gap: "12px", flexWrap: "wrap" }}>
            {company.email && (
              <a
                href={`mailto:${company.email}`}
                style={{
                  display: "inline-block",
                  padding: "8px 16px",
                  backgroundColor: "transparent",
                  border: "1px solid #334155",
                  borderRadius: "6px",
                  color: "#94a3b8",
                  fontSize: "13px",
                  textDecoration: "none",
                }}
              >
                Email Us
              </a>
            )}
            {company.phone && (
              <a
                href={`tel:${company.phone}`}
                style={{
                  display: "inline-block",
                  padding: "8px 16px",
                  backgroundColor: "transparent",
                  border: "1px solid #334155",
                  borderRadius: "6px",
                  color: "#94a3b8",
                  fontSize: "13px",
                  textDecoration: "none",
                }}
              >
                Call Us
              </a>
            )}
            <button
              onClick={() => setPageState("declining")}
              style={{
                padding: "8px 16px",
                backgroundColor: "transparent",
                border: "1px solid rgba(239,68,68,0.3)",
                borderRadius: "6px",
                color: "#f87171",
                fontSize: "13px",
                cursor: "pointer",
              }}
            >
              Decline Change Order
            </button>
          </div>
        </SectionCard>

        {/* ── Footer ───────────────────────────────────────────────────── */}
        <div
          style={{
            textAlign: "center",
            paddingTop: "24px",
            fontSize: "11px",
            color: "#475569",
          }}
        >
          {company.name} &mdash; Powered by DeweyIQ
        </div>
      </div>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Tiny layout helpers (inline styles for the public page — no Tailwind)
// ---------------------------------------------------------------------------

function SectionCard({ children }: { children: React.ReactNode }) {
  return (
    <div
      style={{
        backgroundColor: "#1e293b",
        borderLeft: "1px solid #334155",
        borderRight: "1px solid #334155",
        borderBottom: "1px solid #334155",
        padding: "16px 24px",
      }}
    >
      {children}
    </div>
  )
}

function SectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <div
      style={{
        fontSize: "11px",
        fontWeight: 700,
        color: "#94a3b8",
        letterSpacing: "0.08em",
        textTransform: "uppercase" as const,
        paddingBottom: "10px",
        borderBottom: "1px solid #334155",
        marginBottom: "12px",
      }}
    >
      {children}
    </div>
  )
}

function Row({
  label,
  value,
  highlight,
}: {
  label: string
  value: string
  highlight?: boolean
}) {
  return (
    <div
      style={{
        display: "flex",
        justifyContent: "space-between",
        padding: "5px 0",
        fontSize: "13px",
      }}
    >
      <span style={{ color: "#94a3b8" }}>{label}</span>
      <span
        style={{
          color: highlight ? "#f1f5f9" : "#94a3b8",
          fontWeight: highlight ? 700 : 500,
        }}
      >
        {value}
      </span>
    </div>
  )
}

const thStyle: React.CSSProperties = {
  padding: "6px 8px 8px",
  fontSize: "11px",
  fontWeight: 600,
  color: "#64748b",
  textTransform: "uppercase",
  letterSpacing: "0.05em",
  textAlign: "left",
}

const tdStyle: React.CSSProperties = {
  padding: "8px 8px",
  verticalAlign: "top",
}
