/**
 * autopay-confirmation-email.tsx — Branded React Email template for AutoPay confirmation.
 *
 * Dark-themed email matching the app's dark-first design system.
 * CRITICAL: All colors are hex — NOT oklch() — email clients don't support oklch.
 *
 * Sent when a customer enables AutoPay from the payment page.
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

export interface AutoPayConfirmationEmailProps {
  companyName: string
  customerName: string
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
  green: "#22c55e",
}

// ---------------------------------------------------------------------------
// AutoPayConfirmationEmail component
// ---------------------------------------------------------------------------

export function AutoPayConfirmationEmail({
  companyName,
  customerName,
  customBody,
  customFooter,
}: AutoPayConfirmationEmailProps) {
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
              AutoPay Enabled
            </Heading>
          </Section>

          {/* -- Body ------------------------------------------------------ */}
          <Section
            style={{
              backgroundColor: C.surface,
              borderLeft: `1px solid ${C.border}`,
              borderRight: `1px solid ${C.border}`,
              padding: "20px 24px",
            }}
          >
            {!customBody && (
              <Text
                style={{
                  margin: "0 0 12px",
                  color: C.text,
                  fontSize: "15px",
                }}
              >
                Hi {customerName},
              </Text>
            )}
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
                `AutoPay has been enabled on your account with ${companyName}. Your saved payment method will be charged automatically when new invoices are generated.\n\nIf you have any questions or need to make changes, please contact us.`}
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
            <Hr
              style={{
                borderColor: C.border,
                margin: "0 0 16px",
              }}
            />
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
              This confirmation was sent by {companyName}. If you have
              questions, reply to this email.
            </Text>
          </Section>
        </Container>
      </Body>
    </Html>
  )
}
