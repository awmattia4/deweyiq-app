/**
 * invoice-email.tsx — Branded React Email template for invoice delivery.
 *
 * Dark-themed email matching the app's dark-first design system.
 * CRITICAL: All colors are hex — NOT oklch() — email clients don't support oklch.
 *
 * Sent when office staff sends an invoice to a customer. Includes:
 * - Invoice summary (number, total, due date)
 * - Billing period info (for recurring billing)
 * - "Pay Now" CTA button -> paymentUrl (signed JWT link)
 * - Note that PDF is attached
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

export interface InvoiceEmailProps {
  companyName: string
  customerName: string
  invoiceNumber: string
  invoiceTotal: string
  dueDate: string | null
  paymentUrl: string
  billingPeriod: string | null
  billingModel: string | null
  stopCount: number | null
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
// InvoiceEmail component
// ---------------------------------------------------------------------------

export function InvoiceEmail({
  companyName,
  customerName,
  invoiceNumber,
  invoiceTotal,
  dueDate,
  paymentUrl,
  billingPeriod,
  billingModel,
  stopCount,
}: InvoiceEmailProps) {
  // Build the service description line
  let serviceDescription = "Service"
  if (billingModel === "per_stop" && stopCount) {
    serviceDescription = `${stopCount} service visit${stopCount !== 1 ? "s" : ""}`
  } else if (billingModel === "flat_rate") {
    serviceDescription = "Monthly Service"
  } else if (billingModel === "plus_chemicals") {
    serviceDescription = "Service + Chemicals"
  }

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
              Invoice Ready
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
              {companyName} has sent you an invoice. Please review the details
              below and use the button to pay online.
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
              Invoice Summary
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
                    {invoiceTotal}
                  </td>
                </tr>
                {billingPeriod && (
                  <tr>
                    <td
                      style={{
                        padding: "4px 0",
                        color: C.muted,
                        fontSize: "13px",
                      }}
                    >
                      Service Period
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
                      {billingPeriod}
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
                    Service
                  </td>
                  <td
                    style={{
                      padding: "4px 0",
                      color: C.text,
                      fontSize: "13px",
                      textAlign: "right",
                    }}
                  >
                    {serviceDescription}
                  </td>
                </tr>
                {dueDate && (
                  <tr>
                    <td
                      style={{
                        padding: "4px 0",
                        color: C.muted,
                        fontSize: "13px",
                      }}
                    >
                      Due Date
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
                      {dueDate}
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
            <Text
              style={{
                margin: "12px 0 0",
                color: C.muted,
                fontSize: "12px",
                textAlign: "center",
              }}
            >
              The full invoice is also attached as a PDF to this email.
            </Text>
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
              This invoice was generated by {companyName}. If you have
              questions, reply to this email.
            </Text>
          </Section>
        </Container>
      </Body>
    </Html>
  )
}
