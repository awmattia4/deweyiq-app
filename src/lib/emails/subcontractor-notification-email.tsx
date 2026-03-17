/**
 * subcontractor-notification-email.tsx — Schedule notification email sent to
 * subcontractors when they are assigned to a project phase.
 *
 * Dark-themed React Email template.
 * CRITICAL: All colors are hex — NOT oklch() — email clients don't support oklch.
 */

import {
  Html,
  Head,
  Body,
  Container,
  Section,
  Text,
  Hr,
  Heading,
} from "@react-email/components"

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface SubcontractorNotificationEmailProps {
  companyName: string
  subName: string
  projectAddress: string
  phaseName: string
  scopeOfWork: string | null
  scheduledStart: string | null
  scheduledEnd: string | null
  agreedPrice: string | null
  siteNotes: string | null
  specialInstructions: string | null
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
  green: "#10b981",
}

// ---------------------------------------------------------------------------
// SubcontractorNotificationEmail component
// ---------------------------------------------------------------------------

export function SubcontractorNotificationEmail({
  companyName,
  subName,
  projectAddress,
  phaseName,
  scopeOfWork,
  scheduledStart,
  scheduledEnd,
  agreedPrice,
  siteNotes,
  specialInstructions,
}: SubcontractorNotificationEmailProps) {
  const dateRange =
    scheduledStart && scheduledEnd
      ? `${scheduledStart} – ${scheduledEnd}`
      : scheduledStart
        ? `Starting ${scheduledStart}`
        : "Dates to be confirmed"

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
          {/* ── Header ────────────────────────────────────────────────────── */}
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
              Project Work Scheduled
            </Heading>
          </Section>

          {/* ── Greeting ──────────────────────────────────────────────────── */}
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
              Hi {subName},
            </Text>
            <Text
              style={{
                margin: "0",
                color: C.muted,
                fontSize: "14px",
                lineHeight: "1.6",
              }}
            >
              {companyName} has scheduled you for work on the project below. Please review
              the scope, dates, and site access information.
            </Text>
          </Section>

          {/* ── Project details ───────────────────────────────────────────── */}
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
              }}
            >
              Assignment Details
            </Text>

            <table style={{ width: "100%", borderCollapse: "collapse" }}>
              <tbody>
                <tr>
                  <td
                    style={{
                      padding: "5px 0",
                      color: C.muted,
                      fontSize: "13px",
                      width: "40%",
                      verticalAlign: "top",
                    }}
                  >
                    Project Address
                  </td>
                  <td
                    style={{
                      padding: "5px 0",
                      color: C.text,
                      fontSize: "13px",
                      fontWeight: "600",
                    }}
                  >
                    {projectAddress}
                  </td>
                </tr>
                <tr>
                  <td
                    style={{
                      padding: "5px 0",
                      color: C.muted,
                      fontSize: "13px",
                      verticalAlign: "top",
                    }}
                  >
                    Phase
                  </td>
                  <td
                    style={{
                      padding: "5px 0",
                      color: C.text,
                      fontSize: "13px",
                      fontWeight: "600",
                    }}
                  >
                    {phaseName}
                  </td>
                </tr>
                <tr>
                  <td
                    style={{
                      padding: "5px 0",
                      color: C.muted,
                      fontSize: "13px",
                      verticalAlign: "top",
                    }}
                  >
                    Scheduled Dates
                  </td>
                  <td
                    style={{
                      padding: "5px 0",
                      color: C.green,
                      fontSize: "13px",
                      fontWeight: "600",
                    }}
                  >
                    {dateRange}
                  </td>
                </tr>
                {agreedPrice && (
                  <tr>
                    <td
                      style={{
                        padding: "5px 0",
                        color: C.muted,
                        fontSize: "13px",
                        verticalAlign: "top",
                      }}
                    >
                      Agreed Price
                    </td>
                    <td
                      style={{
                        padding: "5px 0",
                        color: C.text,
                        fontSize: "13px",
                        fontWeight: "600",
                      }}
                    >
                      ${parseFloat(agreedPrice).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </Section>

          {/* ── Scope of work ─────────────────────────────────────────────── */}
          {scopeOfWork && (
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
                Scope of Work
              </Text>
              <Text
                style={{
                  margin: "0",
                  color: C.text,
                  fontSize: "13px",
                  lineHeight: "1.6",
                  whiteSpace: "pre-wrap",
                }}
              >
                {scopeOfWork}
              </Text>
            </Section>
          )}

          {/* ── Site access notes ─────────────────────────────────────────── */}
          {siteNotes && (
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
                Site Access
              </Text>
              <Text
                style={{
                  margin: "0",
                  color: C.text,
                  fontSize: "13px",
                  lineHeight: "1.6",
                  whiteSpace: "pre-wrap",
                }}
              >
                {siteNotes}
              </Text>
            </Section>
          )}

          {/* ── Special instructions ──────────────────────────────────────── */}
          {specialInstructions && (
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
                Special Instructions
              </Text>
              <Text
                style={{
                  margin: "0",
                  color: C.text,
                  fontSize: "13px",
                  lineHeight: "1.6",
                  whiteSpace: "pre-wrap",
                }}
              >
                {specialInstructions}
              </Text>
            </Section>
          )}

          {/* ── Footer ────────────────────────────────────────────────────── */}
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
            <Hr style={{ borderColor: C.border, margin: "0 0 12px" }} />
            <Text
              style={{
                margin: "0",
                color: C.muted,
                fontSize: "12px",
              }}
            >
              {companyName} &mdash; This is an automated schedule notification.
            </Text>
          </Section>
        </Container>
      </Body>
    </Html>
  )
}
