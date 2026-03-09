/**
 * pre-arrival-email.tsx — Simple pre-arrival notification email template.
 *
 * Sent to customers without phone numbers when their tech is heading their way.
 * Minimal text notification — not a marketing email.
 *
 * All colors are hex — NOT oklch() — email clients don't support oklch.
 */

import {
  Html,
  Head,
  Body,
  Container,
  Section,
  Text,
} from "@react-email/components"

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface PreArrivalEmailProps {
  customerName: string
  techName: string
  stopNumber: number
}

// ---------------------------------------------------------------------------
// Brand palette — all hex
// ---------------------------------------------------------------------------

const C = {
  bg: "#0f172a", // slate-900
  surface: "#1e293b", // slate-800
  border: "#334155", // slate-700
  text: "#f1f5f9", // slate-100
  muted: "#94a3b8", // slate-400
  accent: "#3b82f6", // blue-500
  white: "#ffffff",
}

// ---------------------------------------------------------------------------
// PreArrivalEmail component
// ---------------------------------------------------------------------------

export function PreArrivalEmail({
  customerName,
  techName,
  stopNumber,
}: PreArrivalEmailProps) {
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
            maxWidth: "500px",
            margin: "0 auto",
            padding: "24px 16px",
          }}
        >
          {/* ── Header ───────────────────────────────────────────────────── */}
          <Section
            style={{
              backgroundColor: C.accent,
              borderRadius: "12px 12px 0 0",
              padding: "16px 24px",
            }}
          >
            <Text
              style={{
                margin: "0",
                color: C.white,
                fontSize: "16px",
                fontWeight: "700",
              }}
            >
              Your pool tech is on the way
            </Text>
          </Section>

          {/* ── Body ─────────────────────────────────────────────────────── */}
          <Section
            style={{
              backgroundColor: C.surface,
              border: `1px solid ${C.border}`,
              borderTop: "none",
              borderRadius: "0 0 12px 12px",
              padding: "20px 24px",
            }}
          >
            <Text
              style={{
                margin: "0",
                color: C.text,
                fontSize: "15px",
                lineHeight: "1.6",
              }}
            >
              Hi {customerName},{" "}
            </Text>
            <Text
              style={{
                margin: "12px 0 0",
                color: C.text,
                fontSize: "15px",
                lineHeight: "1.6",
              }}
            >
              Your pool tech{" "}
              <span style={{ fontWeight: "600" }}>{techName}</span> is heading
              your way. You&apos;re stop #{stopNumber} on today&apos;s route.
            </Text>
            <Text
              style={{
                margin: "16px 0 0",
                color: C.muted,
                fontSize: "12px",
              }}
            >
              No action needed — this is an automated notification.
            </Text>
          </Section>
        </Container>
      </Body>
    </Html>
  )
}
