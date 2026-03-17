/**
 * change-order-email.tsx — Branded React Email template for change order delivery.
 *
 * Dark-themed email matching the app's dark-first design system.
 * CRITICAL: All colors are hex — NOT oklch() — email clients don't support oklch.
 *
 * Sent when office staff sends a change order to a customer for approval.
 * Includes:
 * - Project reference
 * - Change order number and description
 * - Cost impact (clearly shows increase in red, savings in green)
 * - Schedule impact (if any)
 * - "Review & Approve" CTA button → approvalUrl (signed JWT link)
 *
 * Phase 12: Projects & Renovations — Plan 13
 * Mirrors proposal-email.tsx with change-order-specific fields.
 */

import {
  Html,
  Head,
  Body,
  Container,
  Section,
  Text,
  Hr,
  Button,
  Heading,
} from "@react-email/components"

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface ChangeOrderEmailProps {
  companyName: string
  customerName: string
  changeOrderNumber: string
  projectName: string
  description: string
  costImpact: number
  scheduleImpactDays: number
  approvalUrl: string
  // Optional customizations from notification template system
  customBody?: string | null
  customFooter?: string | null
}

// ---------------------------------------------------------------------------
// Brand palette — all hex (no oklch for email compatibility)
// ---------------------------------------------------------------------------

const C = {
  bg: "#0f172a",
  surface: "#1e293b",
  border: "#334155",
  text: "#f1f5f9",
  muted: "#94a3b8",
  accent: "#2563eb",
  white: "#ffffff",
  red: "#f87171",
  green: "#4ade80",
  amber: "#fbbf24",
}

// ---------------------------------------------------------------------------
// Helper: format currency
// ---------------------------------------------------------------------------

function formatCurrency(amount: number): string {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(Math.abs(amount))
}

// ---------------------------------------------------------------------------
// ChangeOrderEmail component
// ---------------------------------------------------------------------------

export function ChangeOrderEmail({
  companyName,
  customerName,
  changeOrderNumber,
  projectName,
  description,
  costImpact,
  scheduleImpactDays,
  approvalUrl,
  customBody,
  customFooter,
}: ChangeOrderEmailProps) {
  const hasCostChange = costImpact !== 0
  const isIncrease = costImpact > 0
  const costColor = isIncrease ? C.red : C.green
  const costLabel = isIncrease
    ? `+${formatCurrency(costImpact)} additional cost`
    : `-${formatCurrency(costImpact)} cost reduction`

  const hasScheduleImpact = scheduleImpactDays !== 0
  const scheduleLabel =
    scheduleImpactDays > 0
      ? `+${scheduleImpactDays} day${scheduleImpactDays === 1 ? "" : "s"} added to timeline`
      : scheduleImpactDays < 0
        ? `${Math.abs(scheduleImpactDays)} day${Math.abs(scheduleImpactDays) === 1 ? "" : "s"} removed from timeline`
        : "No schedule impact"

  return (
    <Html lang="en">
      <Head />
      <Body
        style={{
          backgroundColor: C.bg,
          fontFamily:
            "-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif",
          margin: "0",
          padding: "0",
        }}
      >
        <Container
          style={{
            maxWidth: "600px",
            margin: "0 auto",
            padding: "24px 16px",
          }}
        >
          {/* ── Header bar ───────────────────────────────────────────────── */}
          <Section
            style={{
              backgroundColor: C.accent,
              borderRadius: "12px 12px 0 0",
              padding: "20px 24px",
            }}
          >
            <Text
              style={{
                margin: "0",
                color: "rgba(255,255,255,0.85)",
                fontSize: "11px",
                fontWeight: "700",
                letterSpacing: "0.08em",
                textTransform: "uppercase",
              }}
            >
              {companyName}
            </Text>
            <Heading
              as="h1"
              style={{
                margin: "4px 0 0",
                color: C.white,
                fontSize: "22px",
                fontWeight: "800",
                lineHeight: "1.2",
              }}
            >
              Change Order {changeOrderNumber} — Action Required
            </Heading>
          </Section>

          {/* ── Greeting ─────────────────────────────────────────────────── */}
          <Section
            style={{
              backgroundColor: C.surface,
              borderLeft: `1px solid ${C.border}`,
              borderRight: `1px solid ${C.border}`,
              padding: "20px 24px",
            }}
          >
            <Text
              style={{
                margin: "0 0 12px",
                color: C.text,
                fontSize: "15px",
              }}
            >
              Hi {customerName},
            </Text>
            <Text
              style={{
                margin: "0",
                color: C.muted,
                fontSize: "14px",
                lineHeight: "1.6",
                whiteSpace: "pre-wrap",
              }}
            >
              {customBody ??
                `A change order has been prepared for your project that requires your review and approval before work can proceed. Please review the details below carefully.`}
            </Text>
          </Section>

          {/* ── Change order summary ────────────────────────────────────── */}
          <Section
            style={{
              backgroundColor: C.surface,
              borderLeft: `1px solid ${C.border}`,
              borderRight: `1px solid ${C.border}`,
              borderTop: `1px solid ${C.border}`,
              padding: "16px 24px",
            }}
          >
            <Text
              style={{
                margin: "0 0 12px",
                color: C.muted,
                fontSize: "11px",
                fontWeight: "700",
                letterSpacing: "0.08em",
                textTransform: "uppercase",
                paddingBottom: "8px",
                borderBottom: `1px solid ${C.border}`,
              }}
            >
              Change Order Summary
            </Text>

            <table style={{ width: "100%", borderCollapse: "collapse" }}>
              <tbody>
                <tr>
                  <td
                    style={{
                      padding: "4px 0",
                      color: C.muted,
                      fontSize: "13px",
                      width: "50%",
                    }}
                  >
                    Change Order
                  </td>
                  <td
                    style={{
                      padding: "4px 0",
                      color: C.text,
                      fontSize: "13px",
                      fontWeight: "600",
                      textAlign: "right",
                    }}
                  >
                    {changeOrderNumber}
                  </td>
                </tr>
                <tr>
                  <td style={{ padding: "4px 0", color: C.muted, fontSize: "13px" }}>
                    Project
                  </td>
                  <td
                    style={{
                      padding: "4px 0",
                      color: C.text,
                      fontSize: "13px",
                      fontWeight: "600",
                      textAlign: "right",
                    }}
                  >
                    {projectName}
                  </td>
                </tr>
                {hasCostChange && (
                  <tr>
                    <td style={{ padding: "4px 0", color: C.muted, fontSize: "13px" }}>
                      Cost Impact
                    </td>
                    <td
                      style={{
                        padding: "4px 0",
                        color: costColor,
                        fontSize: "15px",
                        fontWeight: "700",
                        textAlign: "right",
                      }}
                    >
                      {costLabel}
                    </td>
                  </tr>
                )}
                {hasScheduleImpact && (
                  <tr>
                    <td style={{ padding: "4px 0", color: C.muted, fontSize: "13px" }}>
                      Schedule Impact
                    </td>
                    <td
                      style={{
                        padding: "4px 0",
                        color: scheduleImpactDays > 0 ? C.amber : C.green,
                        fontSize: "13px",
                        fontWeight: "600",
                        textAlign: "right",
                      }}
                    >
                      {scheduleLabel}
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </Section>

          {/* ── Description ──────────────────────────────────────────────── */}
          <Section
            style={{
              backgroundColor: C.surface,
              borderLeft: `1px solid ${C.border}`,
              borderRight: `1px solid ${C.border}`,
              borderTop: `1px solid ${C.border}`,
              padding: "16px 24px",
            }}
          >
            <Text
              style={{
                margin: "0 0 8px",
                color: C.muted,
                fontSize: "11px",
                fontWeight: "700",
                letterSpacing: "0.08em",
                textTransform: "uppercase",
              }}
            >
              Description of Change
            </Text>
            <Text
              style={{
                margin: "0",
                color: C.text,
                fontSize: "14px",
                lineHeight: "1.6",
                whiteSpace: "pre-wrap",
              }}
            >
              {description}
            </Text>
          </Section>

          {/* ── CTA button ────────────────────────────────────────────────── */}
          <Section
            style={{
              backgroundColor: C.surface,
              borderLeft: `1px solid ${C.border}`,
              borderRight: `1px solid ${C.border}`,
              borderTop: `1px solid ${C.border}`,
              padding: "20px 24px",
            }}
          >
            <Hr style={{ borderColor: C.border, margin: "0 0 20px" }} />
            <Button
              href={approvalUrl}
              style={{
                display: "block",
                backgroundColor: C.accent,
                color: C.white,
                textDecoration: "none",
                textAlign: "center",
                padding: "14px 24px",
                borderRadius: "8px",
                fontSize: "15px",
                fontWeight: "700",
                width: "100%",
              }}
            >
              Review &amp; Approve Change Order
            </Button>
            <Text
              style={{
                margin: "12px 0 0",
                color: C.muted,
                fontSize: "12px",
                textAlign: "center",
                lineHeight: "1.5",
              }}
            >
              You can also decline the change order if you have questions or concerns.
              <br />
              Please contact us directly if you would like to discuss before deciding.
            </Text>
          </Section>

          {/* ── Footer ───────────────────────────────────────────────────── */}
          <Section
            style={{
              backgroundColor: C.surface,
              borderLeft: `1px solid ${C.border}`,
              borderRight: `1px solid ${C.border}`,
              borderTop: `1px solid ${C.border}`,
              borderBottom: `1px solid ${C.border}`,
              borderRadius: "0 0 12px 12px",
              padding: "16px 24px",
              textAlign: "center",
            }}
          >
            {customFooter && (
              <Text
                style={{
                  margin: "0 0 8px",
                  color: C.muted,
                  fontSize: "12px",
                  whiteSpace: "pre-wrap",
                }}
              >
                {customFooter}
              </Text>
            )}
            <Text
              style={{
                margin: "0",
                color: C.muted,
                fontSize: "12px",
              }}
            >
              {companyName} &mdash; This is an automated message. Do not reply to this email.
            </Text>
          </Section>
        </Container>
      </Body>
    </Html>
  )
}
