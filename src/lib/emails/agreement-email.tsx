/**
 * agreement-email.tsx — Branded React Email template for service agreement delivery.
 *
 * Dark-themed email matching the app's dark-first design system.
 * CRITICAL: All colors are hex — NOT oklch() — email clients don't support oklch.
 *
 * Sent when office staff sends a service agreement to a customer. Includes:
 * - Agreement summary (number, term type, start date, monthly cost)
 * - Pool count
 * - "Review & Sign Agreement" CTA button → approvalUrl (signed JWT link)
 * - Secondary PDF download link
 * - Company contact info footer + "Powered by DeweyIQ"
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
  Link,
} from "@react-email/components"

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface AgreementEmailProps {
  companyName: string
  customerName: string
  agreementNumber: string
  termType: string
  startDate: string
  totalMonthlyCost: string
  poolCount: number
  approvalUrl: string
  pdfUrl: string
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
  green: "#22c55e",
}

// ---------------------------------------------------------------------------
// AgreementEmail component
// ---------------------------------------------------------------------------

export function AgreementEmail({
  companyName,
  customerName,
  agreementNumber,
  termType,
  startDate,
  totalMonthlyCost,
  poolCount,
  approvalUrl,
  pdfUrl,
  customBody,
  customFooter,
}: AgreementEmailProps) {
  const poolLabel = poolCount === 1 ? "1 pool" : `${poolCount} pools`

  const defaultBody =
    `${companyName} has prepared a service agreement for ${poolLabel}. ` +
    `Please review the details below and click the button to review and sign.`

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
              Service Agreement Ready for Review
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
              {customBody || defaultBody}
            </Text>
          </Section>

          {/* ── Agreement summary ─────────────────────────────────────────── */}
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
              Agreement Summary
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
                    Agreement Number
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
                    {agreementNumber}
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
                    Term Type
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
                    {termType}
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
                    Start Date
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
                    {startDate}
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
                    Pools Covered
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
                    {poolLabel}
                  </td>
                </tr>
                {totalMonthlyCost && (
                  <tr>
                    <td
                      style={{
                        padding: "4px 0",
                        color: C.muted,
                        fontSize: "13px",
                      }}
                    >
                      Est. Monthly Cost
                    </td>
                    <td
                      style={{
                        padding: "4px 0",
                        color: C.green,
                        fontSize: "15px",
                        fontWeight: "700",
                        textAlign: "right",
                      }}
                    >
                      {totalMonthlyCost}
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
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
              Review &amp; Sign Agreement
            </Button>
            <Text
              style={{
                margin: "12px 0 4px",
                color: C.muted,
                fontSize: "12px",
                textAlign: "center",
              }}
            >
              The full agreement is also attached as a PDF to this email.
            </Text>
            <Text
              style={{
                margin: "0",
                color: C.muted,
                fontSize: "12px",
                textAlign: "center",
              }}
            >
              <Link
                href={pdfUrl}
                style={{
                  color: C.accent,
                  textDecoration: "underline",
                }}
              >
                Download Full Agreement (PDF)
              </Link>
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
