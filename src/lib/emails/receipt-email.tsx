/**
 * receipt-email.tsx -- Branded React Email template for payment receipt emails.
 *
 * Dark-themed email matching the app's dark-first design system.
 * CRITICAL: All colors are hex -- NOT oklch() -- email clients don't support oklch.
 *
 * Sent after every successful payment (both manual pay-now and AutoPay off-session).
 * Per locked decision: "saved card/ACH charged automatically on invoice generation
 * with receipt email."
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

export interface ReceiptEmailProps {
  companyName: string
  customerName: string
  invoiceNumber: string
  totalAmount: string
  paymentMethod: "card" | "ach" | "check" | "cash"
  paidAt: string
  paymentLast4?: string | null
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
  greenDark: "#16a34a",
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function formatPaymentMethod(
  method: ReceiptEmailProps["paymentMethod"],
  last4?: string | null
): string {
  switch (method) {
    case "card":
      return last4 ? `Credit Card ending in ${last4}` : "Credit Card"
    case "ach":
      return last4 ? `ACH Bank Transfer ending in ${last4}` : "ACH Bank Transfer"
    case "check":
      return "Check"
    case "cash":
      return "Cash"
    default:
      return "Online Payment"
  }
}

// ---------------------------------------------------------------------------
// ReceiptEmail component
// ---------------------------------------------------------------------------

export function ReceiptEmail({
  companyName,
  customerName,
  invoiceNumber,
  totalAmount,
  paymentMethod,
  paidAt,
  paymentLast4,
}: ReceiptEmailProps) {
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
              backgroundColor: C.green,
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
              Payment Receipt
            </Heading>
          </Section>

          {/* -- Greeting --------------------------------------------------- */}
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
              Thank you for your payment of{" "}
              <strong style={{ color: C.white }}>{totalAmount}</strong> for
              Invoice <strong style={{ color: C.white }}>#{invoiceNumber}</strong>.
              This email serves as your receipt.
            </Text>
          </Section>

          {/* -- Receipt details -------------------------------------------- */}
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
              Receipt Details
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
                    Invoice Number
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
                    #{invoiceNumber}
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
                    Amount Paid
                  </td>
                  <td
                    style={{
                      padding: "4px 0",
                      color: C.white,
                      fontSize: "18px",
                      fontWeight: "800",
                      textAlign: "right",
                    }}
                  >
                    {totalAmount}
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
                    Payment Method
                  </td>
                  <td
                    style={{
                      padding: "4px 0",
                      color: C.text,
                      fontSize: "13px",
                      textAlign: "right",
                    }}
                  >
                    {formatPaymentMethod(paymentMethod, paymentLast4)}
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
                    Date Paid
                  </td>
                  <td
                    style={{
                      padding: "4px 0",
                      color: C.green,
                      fontSize: "13px",
                      fontWeight: "600",
                      textAlign: "right",
                    }}
                  >
                    {paidAt}
                  </td>
                </tr>
              </tbody>
            </table>
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
            <Hr
              style={{
                borderColor: C.border,
                margin: "0 0 16px",
              }}
            />
            <Text
              style={{
                margin: "0",
                color: C.muted,
                fontSize: "12px",
              }}
            >
              This receipt was generated by {companyName}. If you have
              questions, reply to this email.
            </Text>
          </Section>
        </Container>
      </Body>
    </Html>
  )
}
