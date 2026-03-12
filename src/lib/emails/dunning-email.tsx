/**
 * dunning-email.tsx -- Branded React Email template for dunning reminder emails.
 *
 * Dark-themed email matching the app's dark-first design system.
 * CRITICAL: All colors are hex -- NOT oklch() -- email clients don't support oklch.
 *
 * Sent at configured intervals for overdue invoices. The dunning scan both
 * retries payments (for AutoPay customers) and sends these reminder emails.
 *
 * Supports custom subject/body per dunning step (configured by owner in settings).
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

export interface DunningEmailProps {
  companyName: string
  customerName: string
  invoiceNumber: string
  totalAmount: string
  paymentUrl: string
  stepNumber: number
  maxSteps: number
  customSubject?: string | null
  customBody?: string | null
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
  amber: "#f59e0b",
  amberDark: "#d97706",
  green: "#22c55e",
}

// ---------------------------------------------------------------------------
// DunningEmail component
// ---------------------------------------------------------------------------

export function DunningEmail({
  companyName,
  customerName,
  invoiceNumber,
  totalAmount,
  paymentUrl,
  stepNumber,
  maxSteps,
  customBody,
}: DunningEmailProps) {
  const defaultBody = `Your payment of ${totalAmount} for invoice #${invoiceNumber} is overdue. Please pay at your earliest convenience.`
  const bodyText = customBody || defaultBody

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
              backgroundColor: C.amber,
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
              {companyName}
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
              Payment Reminder
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
              {bodyText}
            </Text>
          </Section>

          {/* -- Invoice summary -------------------------------------------- */}
          <Section
            style={{
              backgroundColor: C.surface,
              borderLeft: `1px solid ${C.border}`,
              borderRight: `1px solid ${C.border}`,
              borderTop: `1px solid ${C.border}`,
              padding: "16px 24px",
            }}
          >
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
                    Amount Due
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
            <Hr
              style={{
                borderColor: C.border,
                margin: "0 0 20px",
              }}
            />
            <Button
              href={paymentUrl}
              style={{
                display: "block",
                backgroundColor: C.green,
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
              Pay Now
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
              This is reminder {stepNumber} of {maxSteps}. If you have already
              made this payment, please disregard this notice.
            </Text>
            <Text
              style={{
                margin: "8px 0 0",
                color: C.muted,
                fontSize: "12px",
              }}
            >
              This email was sent by {companyName}. If you have questions,
              reply to this email.
            </Text>
          </Section>
        </Container>
      </Body>
    </Html>
  )
}
