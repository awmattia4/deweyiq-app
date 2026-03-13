/**
 * portal-message-email.tsx — Branded React Email template for portal message notifications.
 *
 * Sent in two directions:
 * 1. Customer sends message → office receives notification
 * 2. Office replies → customer receives notification
 *
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
  Button,
  Heading,
} from "@react-email/components"

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface PortalMessageEmailProps {
  companyName: string
  senderName: string
  recipientName: string
  bodyPreview: string
  viewUrl: string
  direction: "customer_to_office" | "office_to_customer"
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
  accent: "#7c3aed", // violet for messages
  accentDark: "#6d28d9",
  white: "#ffffff",
}

// ---------------------------------------------------------------------------
// PortalMessageEmail component
// ---------------------------------------------------------------------------

export function PortalMessageEmail({
  companyName,
  senderName,
  recipientName,
  bodyPreview,
  viewUrl,
  direction,
}: PortalMessageEmailProps) {
  const isCustomerToOffice = direction === "customer_to_office"
  const headline = isCustomerToOffice
    ? "New Message from Customer"
    : "New Message from Your Service Team"
  const callToAction = isCustomerToOffice ? "View in Inbox" : "View Message"

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
              {headline}
            </Heading>
          </Section>

          {/* -- Body ------------------------------------------------------- */}
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
              Hi {recipientName},
            </Text>
            <Text
              style={{
                margin: "0 0 16px",
                color: C.muted,
                fontSize: "14px",
                lineHeight: "1.6",
              }}
            >
              {isCustomerToOffice
                ? `${senderName} sent you a message through the customer portal.`
                : `${senderName} replied to your message.`}
            </Text>

            {/* Message preview */}
            <Section
              style={{
                backgroundColor: "#162032",
                borderLeft: `3px solid ${C.accent}`,
                borderRadius: "0 6px 6px 0",
                padding: "12px 16px",
                marginBottom: "0",
              }}
            >
              <Text
                style={{
                  margin: "0",
                  color: C.text,
                  fontSize: "14px",
                  lineHeight: "1.6",
                  fontStyle: "italic",
                }}
              >
                &ldquo;{bodyPreview}{bodyPreview.length >= 200 ? "…" : ""}&rdquo;
              </Text>
            </Section>
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
              href={viewUrl}
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
              {callToAction}
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
              This notification was sent by {companyName}. To reply, visit the link above.
            </Text>
          </Section>
        </Container>
      </Body>
    </Html>
  )
}
