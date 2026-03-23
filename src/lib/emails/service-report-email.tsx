/**
 * service-report-email.tsx — Branded React Email service report template.
 *
 * Dark-themed email matching the app's dark-first design system.
 * CRITICAL: All colors are hex — NOT oklch() — email clients don't support oklch.
 *
 * Content sections are conditionally rendered based on org settings:
 * - includeChemistry: show/hide chemistry readings grid
 * - includeChecklist: show/hide checklist summary
 * - includePhotos: show/hide photo thumbnails
 * - includeTechName: show/hide technician name
 */

import {
  Html,
  Head,
  Body,
  Container,
  Section,
  Text,
  Hr,
  Row,
  Column,
  Button,
  Heading,
  Img,
} from "@react-email/components"

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface ServiceReportEmailProps {
  customerName: string
  techName: string
  companyName: string
  companyLogoUrl?: string | null
  serviceDate: string
  poolName: string
  chemistry: Record<string, number | null>
  dosingAmounts?: Array<{ chemical: string; amount: number; unit: string }> | null
  checklist?: Array<{ task: string; completed: boolean }>
  photoUrls?: string[]
  reportUrl: string
  // Content toggles (defaults to true for backward compat)
  includeChemistry?: boolean
  includeChecklist?: boolean
  includePhotos?: boolean
  includeTechName?: boolean
  // Optional customizations from notification template system
  customSubject?: string | null
  customBody?: string | null
  customFooter?: string | null
}

// ---------------------------------------------------------------------------
// Chemistry parameter display metadata
// ---------------------------------------------------------------------------

const PARAM_META: Record<string, { label: string; unit: string }> = {
  freeChlorine: { label: "Free Chlorine", unit: "ppm" },
  bromine: { label: "Bromine", unit: "ppm" },
  pH: { label: "pH", unit: "" },
  totalAlkalinity: { label: "Total Alkalinity", unit: "ppm" },
  calciumHardness: { label: "Calcium Hardness", unit: "ppm" },
  cya: { label: "CYA / Stabilizer", unit: "ppm" },
  salt: { label: "Salt", unit: "ppm" },
  tds: { label: "TDS", unit: "ppm" },
  borate: { label: "Borate", unit: "ppm" },
  phosphates: { label: "Phosphates", unit: "ppb" },
  temperatureF: { label: "Water Temp", unit: "°F" },
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
  accent: "#3b82f6",
  accentDark: "#1d4ed8",
  green: "#22c55e",
  white: "#ffffff",
}

// ---------------------------------------------------------------------------
// ServiceReportEmail component
// ---------------------------------------------------------------------------

export function ServiceReportEmail({
  customerName,
  techName,
  companyName,
  companyLogoUrl,
  serviceDate,
  poolName,
  chemistry,
  checklist,
  photoUrls,
  reportUrl,
  dosingAmounts,
  includeChemistry = true,
  includeChecklist = true,
  includePhotos = true,
  includeTechName = true,
  customFooter,
}: ServiceReportEmailProps) {
  const nonNullReadings = Object.entries(chemistry)
    .filter(([, v]) => v !== null && v !== undefined)
    .slice(0, 6)

  const completedCount = checklist?.filter((t) => t.completed).length ?? 0
  const totalCount = checklist?.length ?? 0
  const hasChecklist = totalCount > 0

  const hasPhotos = (photoUrls?.length ?? 0) > 0

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
            {companyLogoUrl ? (
              <Img
                src={companyLogoUrl}
                alt={companyName}
                width="120"
                height="40"
                style={{
                  objectFit: "contain",
                  marginBottom: "8px",
                }}
              />
            ) : (
              <Text
                style={{
                  margin: "0",
                  color: "rgba(255,255,255,0.8)",
                  fontSize: "11px",
                  fontWeight: "700",
                  letterSpacing: "0.08em",
                  textTransform: "uppercase",
                }}
              >
                {companyName}
              </Text>
            )}
            <Heading
              as="h1"
              style={{
                margin: "4px 0 0",
                color: C.white,
                fontSize: "24px",
                fontWeight: "800",
                lineHeight: "1.2",
              }}
            >
              Service Report
            </Heading>
            <Text
              style={{
                margin: "4px 0 0",
                color: "rgba(255,255,255,0.9)",
                fontSize: "14px",
              }}
            >
              {serviceDate}
            </Text>
          </Section>

          {/* ── Visit info ────────────────────────────────────────────────── */}
          <Section
            style={{
              backgroundColor: C.surface,
              borderLeft: `1px solid ${C.border}`,
              borderRight: `1px solid ${C.border}`,
              padding: "16px 24px",
            }}
          >
            {includeTechName && (
              <Text
                style={{
                  margin: "0 0 4px",
                  color: C.muted,
                  fontSize: "12px",
                }}
              >
                Serviced by{" "}
                <span style={{ color: C.text, fontWeight: "600" }}>
                  {techName}
                </span>
              </Text>
            )}
            <Text
              style={{
                margin: "0",
                color: C.muted,
                fontSize: "12px",
              }}
            >
              Pool:{" "}
              <span style={{ color: C.text, fontWeight: "600" }}>
                {poolName}
              </span>
            </Text>
          </Section>

          {/* ── Chemistry summary ─────────────────────────────────────────── */}
          {includeChemistry && nonNullReadings.length > 0 && (
            <Section
              style={{
                backgroundColor: C.surface,
                borderLeft: `1px solid ${C.border}`,
                borderRight: `1px solid ${C.border}`,
                borderTop: `1px solid ${C.border}`,
                padding: "0",
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
                  padding: "10px 16px",
                  borderBottom: `1px solid ${C.border}`,
                }}
              >
                Chemistry Readings
              </Text>

              {nonNullReadings.map(([param, value], idx) => {
                const meta = PARAM_META[param]
                const label = meta?.label ?? param
                const unit = meta?.unit ?? ""
                const isLastRow = idx === nonNullReadings.length - 1
                return (
                  <Row
                    key={param}
                    style={{
                      borderBottom: isLastRow
                        ? "none"
                        : `1px solid ${C.border}`,
                    }}
                  >
                    <Column
                      style={{
                        padding: "10px 16px",
                        color: C.muted,
                        fontSize: "12px",
                        width: "50%",
                      }}
                    >
                      {label}
                    </Column>
                    <Column
                      style={{
                        padding: "10px 16px",
                        color: C.text,
                        fontSize: "13px",
                        fontWeight: "600",
                        textAlign: "right",
                      }}
                    >
                      {String(value)}
                      {unit ? (
                        <span
                          style={{
                            color: C.muted,
                            fontWeight: "400",
                            fontSize: "11px",
                            marginLeft: "2px",
                          }}
                        >
                          {unit}
                        </span>
                      ) : null}
                    </Column>
                  </Row>
                )
              })}
            </Section>
          )}

          {/* ── Chemicals applied ──────────────────────────────────────────── */}
          {dosingAmounts && dosingAmounts.length > 0 && (
            <Section
              style={{
                backgroundColor: C.surface,
                borderLeft: `1px solid ${C.border}`,
                borderRight: `1px solid ${C.border}`,
                borderTop: `1px solid ${C.border}`,
                padding: "0",
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
                  padding: "10px 16px",
                  borderBottom: `1px solid ${C.border}`,
                }}
              >
                Chemicals Applied
              </Text>

              {dosingAmounts.map((dose, idx) => {
                const isLastRow = idx === dosingAmounts.length - 1
                return (
                  <Row
                    key={idx}
                    style={{
                      borderBottom: isLastRow ? "none" : `1px solid ${C.border}`,
                    }}
                  >
                    <Column
                      style={{
                        padding: "10px 16px",
                        color: C.muted,
                        fontSize: "12px",
                        width: "50%",
                      }}
                    >
                      {dose.chemical}
                    </Column>
                    <Column
                      style={{
                        padding: "10px 16px",
                        color: C.text,
                        fontSize: "13px",
                        fontWeight: "600",
                        textAlign: "right",
                      }}
                    >
                      {dose.amount}
                      <span
                        style={{
                          color: C.muted,
                          fontWeight: "400",
                          fontSize: "11px",
                          marginLeft: "2px",
                        }}
                      >
                        {dose.unit}
                      </span>
                    </Column>
                  </Row>
                )
              })}
            </Section>
          )}

          {/* ── Checklist summary ─────────────────────────────────────────── */}
          {includeChecklist && hasChecklist && (
            <Section
              style={{
                backgroundColor: C.surface,
                borderLeft: `1px solid ${C.border}`,
                borderRight: `1px solid ${C.border}`,
                borderTop: `1px solid ${C.border}`,
                padding: "12px 16px",
              }}
            >
              <Text
                style={{
                  margin: "0",
                  color: C.muted,
                  fontSize: "12px",
                }}
              >
                Service checklist:{" "}
                <span
                  style={{
                    color:
                      completedCount === totalCount ? C.green : C.text,
                    fontWeight: "600",
                  }}
                >
                  {completedCount} of {totalCount} tasks completed
                </span>
              </Text>
            </Section>
          )}

          {/* ── Photos ────────────────────────────────────────────────────── */}
          {includePhotos && hasPhotos && (
            <Section
              style={{
                backgroundColor: C.surface,
                borderLeft: `1px solid ${C.border}`,
                borderRight: `1px solid ${C.border}`,
                borderTop: `1px solid ${C.border}`,
                padding: "12px 16px",
              }}
            >
              <Text
                style={{
                  margin: "0 0 8px",
                  backgroundColor: "#162032",
                  color: C.muted,
                  fontSize: "11px",
                  fontWeight: "700",
                  letterSpacing: "0.08em",
                  textTransform: "uppercase",
                }}
              >
                Service Photos
              </Text>
              <Row>
                {photoUrls!.slice(0, 4).map((url, idx) => (
                  <Column key={idx} style={{ width: "25%", padding: "0 4px" }}>
                    <Img
                      src={url}
                      alt={`Service photo ${idx + 1}`}
                      width="120"
                      height="90"
                      style={{
                        objectFit: "cover",
                        borderRadius: "6px",
                        width: "100%",
                      }}
                    />
                  </Column>
                ))}
              </Row>
              {photoUrls!.length > 4 && (
                <Text
                  style={{
                    margin: "8px 0 0",
                    color: C.muted,
                    fontSize: "11px",
                    textAlign: "center",
                  }}
                >
                  +{photoUrls!.length - 4} more photo{photoUrls!.length - 4 > 1 ? "s" : ""} in full report
                </Text>
              )}
            </Section>
          )}

          {/* ── Separator + CTA ────────────────────────────────────────────── */}
          <Section
            style={{
              backgroundColor: C.surface,
              borderLeft: `1px solid ${C.border}`,
              borderRight: `1px solid ${C.border}`,
              borderTop: `1px solid ${C.border}`,
              padding: "16px 24px",
            }}
          >
            <Hr
              style={{
                borderColor: C.border,
                margin: "0 0 20px",
              }}
            />

            <Button
              href={reportUrl}
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
              View Full Report
            </Button>
          </Section>

          {/* ── Footer ────────────────────────────────────────────────────── */}
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
              This report was generated automatically by {companyName}
            </Text>
          </Section>
        </Container>
      </Body>
    </Html>
  )
}
