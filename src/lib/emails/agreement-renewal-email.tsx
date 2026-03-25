/**
 * agreement-renewal-email.tsx -- React Email template for agreement renewal reminders.
 *
 * Sent to office/owner users (NOT the customer) when an agreement is approaching
 * its expiry date. Informs whether it will auto-renew or needs manual action.
 *
 * CRITICAL: All colors are hex -- NOT oklch() -- email clients don't support oklch.
 * Customer-facing emails: pool company logo at top, "Powered by DeweyIQ" footer.
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

export interface AgreementRenewalEmailProps {
  companyName: string
  customerName: string
  agreementNumber: string
  endDate: string
  daysUntilExpiry: number
  autoRenew: boolean
  /** e.g. "6_month" | "12_month" | "month_to_month" */
  termType: string
  poolCount: number
  monthlyAmount: string
  agreementUrl: string
}

// ---------------------------------------------------------------------------
// Brand palette -- all hex (no oklch for email compatibility)
// ---------------------------------------------------------------------------

const C = {
  bg: "#0f172a",
  surface: "#1e293b",
  border: "#334155",
  text: "#f1f5f9",
  muted: "#94a3b8",
  accent: "#2563eb",
  white: "#ffffff",
  green: "#22c55e",
  amber: "#f59e0b",
  orange: "#f97316",
  red: "#ef4444",
}

function formatTermType(termType: string): string {
  if (termType === "month_to_month") return "Month-to-Month"
  const match = termType.match(/^(\d+)_month/)
  if (match) return `${match[1]}-Month Term`
  return termType
}

// ---------------------------------------------------------------------------
// AgreementRenewalEmail component
// ---------------------------------------------------------------------------

export function AgreementRenewalEmail({
  companyName,
  customerName,
  agreementNumber,
  endDate,
  daysUntilExpiry,
  autoRenew,
  termType,
  poolCount,
  monthlyAmount,
  agreementUrl,
}: AgreementRenewalEmailProps) {
  const isUrgent = daysUntilExpiry <= 7
  const headerColor = isUrgent ? C.orange : C.amber

  const actionMessage = autoRenew
    ? "This agreement will automatically renew. No action needed unless you want to change terms."
    : "This agreement will NOT auto-renew. Take action to renew it or let it expire."

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
          {/* -- Header bar ------------------------------------------------- */}
          <Section
            style={{
              backgroundColor: headerColor,
              borderRadius: "12px 12px 0 0",
              padding: "20px 24px",
            }}
          >
            <Text
              style={{
                margin: "0",
                color: "rgba(0,0,0,0.6)",
                fontSize: "11px",
                fontWeight: "700",
                letterSpacing: "0.08em",
                textTransform: "uppercase",
              }}
            >
              {companyName} — Agreement Renewal
            </Text>
            <Heading
              as="h1"
              style={{
                margin: "4px 0 0",
                color: "#000000",
                fontSize: "22px",
                fontWeight: "800",
                lineHeight: "1.2",
              }}
            >
              {isUrgent ? "Urgent: " : ""}Renewal Reminder — {agreementNumber}
            </Heading>
          </Section>

          {/* -- Context ---------------------------------------------------- */}
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
                fontWeight: "600",
              }}
            >
              {customerName}
            </Text>
            <Text
              style={{
                margin: "0 0 12px",
                color: C.muted,
                fontSize: "14px",
                lineHeight: "1.6",
              }}
            >
              This agreement expires on <strong style={{ color: C.text }}>{endDate}</strong>{" "}
              ({daysUntilExpiry} {daysUntilExpiry === 1 ? "day" : "days"} from now).
            </Text>
            <Text
              style={{
                margin: "0",
                color: autoRenew ? C.green : C.orange,
                fontSize: "14px",
                fontWeight: "600",
                lineHeight: "1.6",
                padding: "10px 14px",
                backgroundColor: autoRenew ? "rgba(34,197,94,0.1)" : "rgba(249,115,22,0.1)",
                borderRadius: "6px",
                borderLeft: `3px solid ${autoRenew ? C.green : C.orange}`,
              }}
            >
              {actionMessage}
            </Text>
          </Section>

          {/* -- Agreement summary ------------------------------------------ */}
          <Section
            style={{
              backgroundColor: C.surface,
              borderLeft: `1px solid ${C.border}`,
              borderRight: `1px solid ${C.border}`,
              borderTop: `1px solid ${C.border}`,
              padding: "16px 24px",
            }}
          >
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
                    Agreement
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
                    Term
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
                    {formatTermType(termType)}
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
                    Pools covered
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
                    {poolCount} {poolCount === 1 ? "pool" : "pools"}
                  </td>
                </tr>
                {monthlyAmount && (
                  <tr>
                    <td
                      style={{
                        padding: "4px 0",
                        color: C.muted,
                        fontSize: "13px",
                      }}
                    >
                      Monthly amount
                    </td>
                    <td
                      style={{
                        padding: "4px 0",
                        color: C.white,
                        fontSize: "16px",
                        fontWeight: "800",
                        textAlign: "right",
                      }}
                    >
                      {monthlyAmount}/mo
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </Section>

          {/* -- CTA button ------------------------------------------------- */}
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
              href={agreementUrl}
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
              View Agreement
            </Button>
          </Section>

          {/* -- Footer ----------------------------------------------------- */}
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
              This is an internal notification sent to your office account.
              Your customer has not received this email.
            </Text>
            <Text
              style={{
                margin: "8px 0 0",
                color: C.muted,
                fontSize: "12px",
              }}
            >
              Powered by DeweyIQ
            </Text>
          </Section>
        </Container>
      </Body>
    </Html>
  )
}
