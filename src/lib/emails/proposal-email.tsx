/**
 * proposal-email.tsx — Branded React Email template for proposal delivery.
 *
 * Dark-themed email matching the app's dark-first design system.
 * CRITICAL: All colors are hex — NOT oklch() — email clients don't support oklch.
 *
 * Sent when office staff sends a proposal to a customer. Includes:
 * - Project summary (type, address)
 * - Proposal total amount
 * - "View & Approve Proposal" CTA button → approvalUrl (signed JWT link)
 * - Note that PDF is attached
 *
 * Mirrors quote-email.tsx with proposal-specific fields.
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

export interface ProposalEmailProps {
  companyName: string
  customerName: string
  proposalNumber: string
  proposalTotal: string
  projectType: string
  projectAddress: string | null
  approvalUrl: string
  scopeSnippet?: string | null
  // Optional customizations from notification template system
  customSubject?: string | null
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
  accentDark: "#1d4ed8",
  white: "#ffffff",
  green: "#4ade80",
}

// ---------------------------------------------------------------------------
// ProposalEmail component
// ---------------------------------------------------------------------------

export function ProposalEmail({
  companyName,
  customerName,
  proposalNumber,
  proposalTotal,
  projectType,
  projectAddress,
  approvalUrl,
  scopeSnippet,
  customBody,
  customFooter,
}: ProposalEmailProps) {
  // Trim scope snippet to first 200 chars
  const scopePreview =
    scopeSnippet && scopeSnippet.length > 200
      ? scopeSnippet.slice(0, 197) + "..."
      : scopeSnippet

  const projectTypeLabel = projectType
    .replace(/_/g, " ")
    .replace(/\b\w/g, (c) => c.toUpperCase())

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
              Your Project Proposal is Ready
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
              {customBody ||
                `${companyName} has prepared a project proposal for your review. Please see the details below and click the button to view and approve.`}
            </Text>
          </Section>

          {/* ── Proposal summary ──────────────────────────────────────────── */}
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
                margin: "0",
                backgroundColor: "#162032",
                color: C.muted,
                fontSize: "11px",
                fontWeight: "700",
                letterSpacing: "0.08em",
                textTransform: "uppercase",
                padding: "8px 0",
                borderBottom: `1px solid ${C.border}`,
                marginBottom: "12px",
              }}
            >
              Proposal Summary
            </Text>

            <table
              style={{
                width: "100%",
                borderCollapse: "collapse",
              }}
            >
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
                    Proposal Number
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
                    #{proposalNumber}
                  </td>
                </tr>
                <tr>
                  <td
                    style={{
                      padding: "4px 0",
                      color: C.muted,
                      fontSize: "13px",
                    }}
                  >
                    Project Type
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
                    {projectTypeLabel}
                  </td>
                </tr>
                {projectAddress && (
                  <tr>
                    <td
                      style={{
                        padding: "4px 0",
                        color: C.muted,
                        fontSize: "13px",
                      }}
                    >
                      Property
                    </td>
                    <td
                      style={{
                        padding: "4px 0",
                        color: C.text,
                        fontSize: "13px",
                        textAlign: "right",
                      }}
                    >
                      {projectAddress}
                    </td>
                  </tr>
                )}
                <tr>
                  <td
                    style={{
                      padding: "4px 0",
                      color: C.muted,
                      fontSize: "13px",
                    }}
                  >
                    Total Estimate
                  </td>
                  <td
                    style={{
                      padding: "4px 0",
                      color: C.text,
                      fontSize: "15px",
                      fontWeight: "700",
                      textAlign: "right",
                    }}
                  >
                    {proposalTotal}
                  </td>
                </tr>
              </tbody>
            </table>
          </Section>

          {/* ── Scope snippet ─────────────────────────────────────────────── */}
          {scopePreview && (
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
                }}
              >
                {scopePreview}
              </Text>
            </Section>
          )}

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
            <Hr
              style={{
                borderColor: C.border,
                margin: "0 0 20px",
              }}
            />
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
              View &amp; Approve Proposal
            </Button>
            <Text
              style={{
                margin: "12px 0 0",
                color: C.muted,
                fontSize: "12px",
                textAlign: "center",
              }}
            >
              The full proposal is also attached as a PDF to this email.
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
              {companyName} &mdash; This is an automated message.
            </Text>
          </Section>
        </Container>
      </Body>
    </Html>
  )
}
