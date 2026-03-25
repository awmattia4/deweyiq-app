/**
 * agreement-amendment-email.tsx — React Email template for agreement amendment notifications.
 *
 * Used for both major and minor amendments:
 * - Major: includes "Review & Approve" CTA button (requires customer re-sign)
 * - Minor: informational only, no action required
 *
 * Design mirrors agreement-email.tsx (dark-first, all hex colors).
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

export interface AgreementAmendmentEmailProps {
  companyName: string
  customerName: string
  agreementNumber: string
  amendmentType: "major" | "minor"
  changeSummary: string
  versionNumber: number
  approvalUrl: string
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
  yellow: "#f59e0b",
  green: "#22c55e",
}

// ---------------------------------------------------------------------------
// AgreementAmendmentEmail component
// ---------------------------------------------------------------------------

export function AgreementAmendmentEmail({
  companyName,
  customerName,
  agreementNumber,
  amendmentType,
  changeSummary,
  versionNumber,
  approvalUrl,
}: AgreementAmendmentEmailProps) {
  const isMajor = amendmentType === "major"

  const headerTitle = isMajor
    ? "Amendment to Your Service Agreement"
    : "Update to Your Service Agreement"

  const bodyText = isMajor
    ? `${companyName} has made changes to your service agreement (${agreementNumber}) that require your review and approval. Please review the amendment details below and click the button to approve.`
    : `${companyName} has made a minor update to your service agreement (${agreementNumber}). This change takes effect immediately and does not require any action from you.`

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
              backgroundColor: isMajor ? C.accent : C.surface,
              borderRadius: "12px 12px 0 0",
              padding: "20px 24px",
              borderTop: isMajor ? undefined : `2px solid ${C.yellow}`,
            }}
          >
            <Text
              style={{
                margin: "0",
                color: isMajor ? "rgba(255,255,255,0.85)" : C.muted,
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
              {headerTitle}
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
              }}
            >
              {bodyText}
            </Text>
          </Section>

          {/* ── Amendment details ─────────────────────────────────────────── */}
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
              Amendment Details
            </Text>

            <table style={{ width: "100%", borderCollapse: "collapse" }}>
              <tbody>
                <tr>
                  <td style={{ padding: "4px 0", color: C.muted, fontSize: "13px", width: "50%" }}>
                    Agreement
                  </td>
                  <td style={{ padding: "4px 0", color: C.text, fontSize: "13px", fontWeight: "600", textAlign: "right" }}>
                    {agreementNumber}
                  </td>
                </tr>
                <tr>
                  <td style={{ padding: "4px 0", color: C.muted, fontSize: "13px" }}>
                    Amendment Version
                  </td>
                  <td style={{ padding: "4px 0", color: C.text, fontSize: "13px", fontWeight: "600", textAlign: "right" }}>
                    v{versionNumber}
                  </td>
                </tr>
                <tr>
                  <td style={{ padding: "4px 0", color: C.muted, fontSize: "13px" }}>
                    Type
                  </td>
                  <td style={{ padding: "4px 0", color: isMajor ? C.yellow : C.green, fontSize: "13px", fontWeight: "600", textAlign: "right" }}>
                    {isMajor ? "Requires Approval" : "Informational"}
                  </td>
                </tr>
              </tbody>
            </table>

            <Hr style={{ borderColor: C.border, margin: "12px 0" }} />

            <Text style={{ margin: "0 0 6px", color: C.muted, fontSize: "12px", fontWeight: "600", textTransform: "uppercase", letterSpacing: "0.06em" }}>
              What changed
            </Text>
            <Text style={{ margin: "0", color: C.text, fontSize: "14px", lineHeight: "1.6", whiteSpace: "pre-wrap" }}>
              {changeSummary}
            </Text>
          </Section>

          {/* ── CTA (major only) ──────────────────────────────────────────── */}
          {isMajor && (
            <Section
              style={{
                backgroundColor: C.surface,
                borderLeft: `1px solid ${C.border}`,
                borderRight: `1px solid ${C.border}`,
                borderTop: `1px solid ${C.border}`,
                padding: "20px 24px",
              }}
            >
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
                Review &amp; Approve Amendment
              </Button>
              <Text
                style={{
                  margin: "12px 0 0",
                  color: C.muted,
                  fontSize: "12px",
                  textAlign: "center",
                }}
              >
                Your current service continues as normal while this amendment is pending review.
              </Text>
            </Section>
          )}

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
