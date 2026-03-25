/**
 * agreement-pdf.tsx — React PDF document component for service agreements.
 *
 * Uses @react-pdf/renderer primitives. All colors are hex — NOT oklch().
 * PDF renderer does not support oklch (same constraint as MapLibre GL).
 *
 * Requires serverExternalPackages: ['@react-pdf/renderer'] in next.config.ts
 * (already configured — see Phase 06-01 decision).
 */

import {
  Document,
  Page,
  Text,
  View,
  StyleSheet,
  Image,
} from "@react-pdf/renderer"

// ---------------------------------------------------------------------------
// Brand palette — all hex (no oklch for PDF compatibility)
// ---------------------------------------------------------------------------

const C = {
  white: "#ffffff",
  bg: "#f8fafc",
  text: "#0f172a",
  textMuted: "#475569",
  textLight: "#64748b",
  accent: "#2563eb",
  border: "#e2e8f0",
  rowAlt: "#f1f5f9",
  green: "#16a34a",
  signatureLine: "#cbd5e1",
  poweredBy: "#94a3b8",
}

// ---------------------------------------------------------------------------
// Styles
// ---------------------------------------------------------------------------

const styles = StyleSheet.create({
  page: {
    padding: 40,
    backgroundColor: C.white,
    fontFamily: "Helvetica",
    fontSize: 10,
    color: C.text,
  },

  // ── Header ────────────────────────────────────────────────────────────────
  header: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "flex-start",
    marginBottom: 28,
    paddingBottom: 20,
    borderBottomWidth: 2,
    borderBottomColor: C.accent,
  },
  headerLeft: {
    flexDirection: "column",
  },
  logo: {
    width: 100,
    height: 40,
    objectFit: "contain",
    marginBottom: 6,
  },
  companyName: {
    fontSize: 18,
    fontFamily: "Helvetica-Bold",
    color: C.text,
  },
  companyContact: {
    fontSize: 9,
    color: C.textMuted,
    marginTop: 2,
  },
  headerRight: {
    alignItems: "flex-end",
  },
  agreementLabel: {
    fontSize: 20,
    fontFamily: "Helvetica-Bold",
    color: C.accent,
    marginBottom: 4,
  },
  agreementMeta: {
    fontSize: 9,
    color: C.textMuted,
    marginBottom: 2,
  },

  // ── Section ───────────────────────────────────────────────────────────────
  section: {
    marginBottom: 16,
  },
  sectionLabel: {
    fontSize: 9,
    fontFamily: "Helvetica-Bold",
    color: C.textMuted,
    textTransform: "uppercase",
    letterSpacing: 0.8,
    marginBottom: 6,
    borderBottomWidth: 1,
    borderBottomColor: C.border,
    paddingBottom: 4,
  },
  sectionText: {
    fontSize: 10,
    color: C.text,
    lineHeight: 1.5,
  },
  sectionTextMuted: {
    fontSize: 10,
    color: C.textMuted,
  },
  sectionTextSmall: {
    fontSize: 9,
    color: C.textMuted,
    lineHeight: 1.5,
  },

  // ── Two-column layout ─────────────────────────────────────────────────────
  twoCol: {
    flexDirection: "row",
    gap: 20,
    marginBottom: 16,
  },
  col: {
    flex: 1,
  },
  colLabel: {
    fontSize: 9,
    fontFamily: "Helvetica-Bold",
    color: C.textMuted,
    textTransform: "uppercase",
    letterSpacing: 0.8,
    marginBottom: 4,
  },
  colText: {
    fontSize: 10,
    color: C.text,
    lineHeight: 1.5,
  },
  colTextMuted: {
    fontSize: 9,
    color: C.textMuted,
  },

  // ── Pool entry block ──────────────────────────────────────────────────────
  poolBlock: {
    backgroundColor: C.bg,
    borderRadius: 4,
    padding: "10 12",
    marginBottom: 10,
    borderWidth: 1,
    borderColor: C.border,
  },
  poolName: {
    fontSize: 11,
    fontFamily: "Helvetica-Bold",
    color: C.text,
    marginBottom: 4,
  },
  poolMeta: {
    flexDirection: "row",
    gap: 16,
    marginBottom: 6,
  },
  poolMetaItem: {
    flexDirection: "row",
    gap: 4,
  },
  poolMetaLabel: {
    fontSize: 9,
    color: C.textMuted,
  },
  poolMetaValue: {
    fontSize: 9,
    color: C.text,
    fontFamily: "Helvetica-Bold",
  },
  pricingRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginTop: 6,
    paddingTop: 6,
    borderTopWidth: 1,
    borderTopColor: C.border,
  },
  pricingLabel: {
    fontSize: 9,
    color: C.textMuted,
  },
  pricingValue: {
    fontSize: 10,
    fontFamily: "Helvetica-Bold",
    color: C.accent,
  },

  // ── Total row ─────────────────────────────────────────────────────────────
  totalRow: {
    flexDirection: "row",
    justifyContent: "flex-end",
    marginTop: 8,
    paddingTop: 8,
    borderTopWidth: 2,
    borderTopColor: C.accent,
  },
  totalLabel: {
    fontSize: 10,
    color: C.textMuted,
    marginRight: 16,
  },
  totalValue: {
    fontSize: 12,
    fontFamily: "Helvetica-Bold",
    color: C.accent,
  },

  // ── Body text ─────────────────────────────────────────────────────────────
  bodyText: {
    fontSize: 9,
    color: C.text,
    lineHeight: 1.6,
    marginBottom: 4,
  },
  bodyTextMuted: {
    fontSize: 8,
    color: C.textMuted,
    lineHeight: 1.5,
    marginBottom: 4,
  },

  // ── Signature block ───────────────────────────────────────────────────────
  sigBlock: {
    flexDirection: "row",
    gap: 40,
    marginTop: 8,
  },
  sigCol: {
    flex: 1,
  },
  sigLabel: {
    fontSize: 9,
    fontFamily: "Helvetica-Bold",
    color: C.textMuted,
    textTransform: "uppercase",
    letterSpacing: 0.8,
    marginBottom: 24,
  },
  sigLine: {
    borderBottomWidth: 1,
    borderBottomColor: C.signatureLine,
    marginBottom: 4,
  },
  sigFieldLabel: {
    fontSize: 8,
    color: C.textLight,
    marginBottom: 16,
  },
  sigNote: {
    fontSize: 7.5,
    color: C.textMuted,
    lineHeight: 1.5,
    marginTop: 12,
    fontStyle: "italic",
  },

  // ── Footer ────────────────────────────────────────────────────────────────
  footer: {
    position: "absolute",
    bottom: 20,
    left: 40,
    right: 40,
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  footerText: {
    fontSize: 8,
    color: C.poweredBy,
  },
})

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface AgreementPoolEntryPdfData {
  poolId: string
  poolName: string
  poolType: string // "pool" | "spa" | "fountain"
  frequency: string
  preferredDayOfWeek?: number | null
  pricingModel: string
  monthlyAmount?: string | null
  perVisitAmount?: string | null
  tieredThresholdVisits?: number | null
  tieredBaseAmount?: string | null
  tieredOverageAmount?: string | null
  notes?: string | null
}

export interface AgreementDocumentProps {
  agreementNumber: string
  createdDate: string
  termType: string
  startDate?: string | null
  endDate?: string | null
  autoRenew: boolean
  companyName: string
  companyLogoUrl?: string | null
  customerName: string
  customerEmail?: string | null
  customerPhone?: string | null
  serviceAddress?: string | null
  poolEntries: AgreementPoolEntryPdfData[]
  termsAndConditions?: string | null
  cancellationPolicy?: string | null
  liabilityWaiver?: string | null
}

// ---------------------------------------------------------------------------
// Helper functions
// ---------------------------------------------------------------------------

function formatFrequency(frequency: string, dayOfWeek?: number | null): string {
  const dayNames = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"]
  const dayLabel = dayOfWeek != null ? ` — Every ${dayNames[dayOfWeek]}` : ""

  switch (frequency) {
    case "weekly":
      return `Weekly${dayLabel}`
    case "biweekly":
      return `Bi-Weekly${dayLabel}`
    case "monthly":
      return `Monthly${dayLabel}`
    case "custom":
      return `Custom Schedule${dayLabel}`
    default:
      return frequency
  }
}

function formatPricingModel(entry: AgreementPoolEntryPdfData): string {
  switch (entry.pricingModel) {
    case "monthly_flat":
      return `Monthly Flat — $${parseFloat(entry.monthlyAmount ?? "0").toFixed(2)}/month`
    case "per_visit":
      return `Per Visit — $${parseFloat(entry.perVisitAmount ?? "0").toFixed(2)} per visit`
    case "tiered": {
      const threshold = entry.tieredThresholdVisits ?? 0
      const base = parseFloat(entry.tieredBaseAmount ?? "0").toFixed(2)
      const overage = parseFloat(entry.tieredOverageAmount ?? "0").toFixed(2)
      return `Tiered — First ${threshold} visits: $${base}/visit, Additional: $${overage}/visit`
    }
    default:
      return entry.pricingModel
  }
}

function formatTermType(termType: string): string {
  switch (termType) {
    case "month_to_month":
      return "Month-to-Month"
    case "6_month":
      return "6 Months"
    case "12_month":
      return "12 Months"
    default:
      return termType
  }
}

function calcMonthlyCost(entry: AgreementPoolEntryPdfData): number {
  switch (entry.pricingModel) {
    case "monthly_flat":
      return parseFloat(entry.monthlyAmount ?? "0")
    case "per_visit": {
      const rate = parseFloat(entry.perVisitAmount ?? "0")
      const visitsPerMonth = entry.frequency === "weekly" ? 4 : entry.frequency === "biweekly" ? 2 : 1
      return rate * visitsPerMonth
    }
    case "tiered": {
      const threshold = entry.tieredThresholdVisits ?? 4
      const base = parseFloat(entry.tieredBaseAmount ?? "0")
      return base * threshold
    }
    default:
      return 0
  }
}

function formatPoolType(poolType: string): string {
  switch (poolType) {
    case "pool":
      return "Pool"
    case "spa":
      return "Spa / Hot Tub"
    case "fountain":
      return "Fountain / Water Feature"
    default:
      return poolType
  }
}

// ---------------------------------------------------------------------------
// AgreementDocument
// ---------------------------------------------------------------------------

export function AgreementDocument(props: AgreementDocumentProps) {
  const {
    agreementNumber,
    createdDate,
    termType,
    startDate,
    endDate,
    autoRenew,
    companyName,
    companyLogoUrl,
    customerName,
    customerEmail,
    customerPhone,
    serviceAddress,
    poolEntries,
    termsAndConditions,
    cancellationPolicy,
    liabilityWaiver,
  } = props

  const termLabel = formatTermType(termType)
  const termDates =
    startDate && endDate
      ? `${startDate} – ${endDate}`
      : startDate
        ? `Starting ${startDate}`
        : "Ongoing"

  const totalMonthly = poolEntries.reduce(
    (sum, entry) => sum + calcMonthlyCost(entry),
    0
  )

  return (
    <Document
      title={`Service Agreement ${agreementNumber}`}
      author={companyName}
      creator="DeweyIQ"
    >
      <Page size="LETTER" style={styles.page}>

        {/* ── Header ───────────────────────────────────────────────────── */}
        <View style={styles.header}>
          <View style={styles.headerLeft}>
            {companyLogoUrl ? (
              <Image src={companyLogoUrl} style={styles.logo} />
            ) : (
              <Text style={styles.companyName}>{companyName}</Text>
            )}
            {companyLogoUrl && (
              <Text style={styles.companyName}>{companyName}</Text>
            )}
          </View>
          <View style={styles.headerRight}>
            <Text style={styles.agreementLabel}>SERVICE AGREEMENT</Text>
            <Text style={styles.agreementMeta}>{agreementNumber}</Text>
            <Text style={styles.agreementMeta}>Date: {createdDate}</Text>
            <Text style={styles.agreementMeta}>
              Term: {termLabel} ({termDates})
            </Text>
          </View>
        </View>

        {/* ── Parties ──────────────────────────────────────────────────── */}
        <Text style={styles.sectionLabel}>Parties to this Agreement</Text>
        <View style={[styles.twoCol, { marginBottom: 20 }]}>
          <View style={styles.col}>
            <Text style={styles.colLabel}>Service Provider</Text>
            <Text style={styles.colText}>{companyName}</Text>
          </View>
          <View style={styles.col}>
            <Text style={styles.colLabel}>Customer</Text>
            <Text style={styles.colText}>{customerName}</Text>
            {serviceAddress && (
              <Text style={styles.colTextMuted}>{serviceAddress}</Text>
            )}
            {customerPhone && (
              <Text style={styles.colTextMuted}>{customerPhone}</Text>
            )}
            {customerEmail && (
              <Text style={styles.colTextMuted}>{customerEmail}</Text>
            )}
          </View>
        </View>

        {/* ── Scope of Service ─────────────────────────────────────────── */}
        <Text style={[styles.sectionLabel, { marginBottom: 8 }]}>
          Scope of Service
        </Text>
        {poolEntries.map((entry, i) => (
          <View key={i} style={styles.poolBlock}>
            <Text style={styles.poolName}>{entry.poolName}</Text>
            <View style={styles.poolMeta}>
              <View style={styles.poolMetaItem}>
                <Text style={styles.poolMetaLabel}>Type:</Text>
                <Text style={styles.poolMetaValue}>
                  {formatPoolType(entry.poolType)}
                </Text>
              </View>
              <View style={styles.poolMetaItem}>
                <Text style={styles.poolMetaLabel}>Frequency:</Text>
                <Text style={styles.poolMetaValue}>
                  {formatFrequency(entry.frequency, entry.preferredDayOfWeek)}
                </Text>
              </View>
            </View>
            {entry.notes ? (
              <Text style={styles.sectionTextSmall}>{entry.notes}</Text>
            ) : null}
          </View>
        ))}

        {/* ── Pricing & Billing ─────────────────────────────────────────── */}
        <Text style={[styles.sectionLabel, { marginBottom: 8, marginTop: 8 }]}>
          Pricing &amp; Billing
        </Text>
        {poolEntries.map((entry, i) => (
          <View key={i} style={styles.poolBlock}>
            <Text style={styles.poolName}>{entry.poolName}</Text>
            <Text style={styles.sectionTextSmall}>
              {formatPricingModel(entry)}
            </Text>
          </View>
        ))}
        {totalMonthly > 0 && (
          <View style={styles.totalRow}>
            <Text style={styles.totalLabel}>
              Estimated Total Monthly Cost:
            </Text>
            <Text style={styles.totalValue}>
              ${totalMonthly.toFixed(2)}/mo
            </Text>
          </View>
        )}

        {/* Footer on page 1 */}
        <View style={styles.footer} fixed>
          <Text
            style={styles.footerText}
            render={({ pageNumber, totalPages }) =>
              `Page ${pageNumber} of ${totalPages}`
            }
          />
          <Text style={styles.footerText}>Powered by DeweyIQ</Text>
        </View>
      </Page>

      {/* ── Page 2: Terms ─────────────────────────────────────────────── */}
      <Page size="LETTER" style={styles.page}>

        {/* ── Term & Renewal ───────────────────────────────────────────── */}
        <View style={styles.section}>
          <Text style={styles.sectionLabel}>Term &amp; Renewal</Text>
          <Text style={styles.bodyText}>
            <Text style={{ fontFamily: "Helvetica-Bold" }}>Term Type: </Text>
            {termLabel}
          </Text>
          <Text style={styles.bodyText}>
            <Text style={{ fontFamily: "Helvetica-Bold" }}>Start Date: </Text>
            {startDate ?? "Upon signing"}
          </Text>
          {endDate ? (
            <Text style={styles.bodyText}>
              <Text style={{ fontFamily: "Helvetica-Bold" }}>End Date: </Text>
              {endDate}
            </Text>
          ) : (
            <Text style={styles.bodyText}>
              <Text style={{ fontFamily: "Helvetica-Bold" }}>End Date: </Text>
              Ongoing
            </Text>
          )}
          <Text style={styles.bodyText}>
            <Text style={{ fontFamily: "Helvetica-Bold" }}>Auto-Renewal: </Text>
            {autoRenew
              ? "This agreement renews automatically at the end of the term unless cancelled in writing."
              : "This agreement does not auto-renew and must be explicitly renewed at end of term."}
          </Text>
        </View>

        {/* ── Cancellation Policy ──────────────────────────────────────── */}
        {cancellationPolicy ? (
          <View style={styles.section}>
            <Text style={styles.sectionLabel}>Cancellation Policy</Text>
            {cancellationPolicy.split("\n").map((para, i) => (
              <Text key={i} style={styles.bodyText}>
                {para}
              </Text>
            ))}
          </View>
        ) : null}

        {/* ── Terms & Conditions ───────────────────────────────────────── */}
        {termsAndConditions ? (
          <View style={styles.section}>
            <Text style={styles.sectionLabel}>Terms &amp; Conditions</Text>
            {termsAndConditions.split("\n").map((para, i) => (
              <Text key={i} style={styles.bodyText}>
                {para}
              </Text>
            ))}
          </View>
        ) : null}

        {/* ── Liability & Limitations ──────────────────────────────────── */}
        {liabilityWaiver ? (
          <View style={styles.section}>
            <Text style={styles.sectionLabel}>
              Liability &amp; Limitations
            </Text>
            {liabilityWaiver.split("\n").map((para, i) => (
              <Text key={i} style={styles.bodyText}>
                {para}
              </Text>
            ))}
          </View>
        ) : null}

        {/* ── Signature Block ──────────────────────────────────────────── */}
        <View style={[styles.section, { marginTop: 24 }]}>
          <Text style={styles.sectionLabel}>Signatures</Text>
          <View style={styles.sigBlock}>
            {/* Company rep */}
            <View style={styles.sigCol}>
              <Text style={styles.sigLabel}>Service Provider</Text>
              <View style={styles.sigLine} />
              <Text style={styles.sigFieldLabel}>Authorized Representative</Text>
              <View style={styles.sigLine} />
              <Text style={styles.sigFieldLabel}>Printed Name</Text>
              <View style={styles.sigLine} />
              <Text style={styles.sigFieldLabel}>Date</Text>
            </View>
            {/* Customer */}
            <View style={styles.sigCol}>
              <Text style={styles.sigLabel}>Customer</Text>
              <View style={styles.sigLine} />
              <Text style={styles.sigFieldLabel}>Signature</Text>
              <View style={styles.sigLine} />
              <Text style={styles.sigFieldLabel}>Printed Name</Text>
              <View style={styles.sigLine} />
              <Text style={styles.sigFieldLabel}>Date</Text>
            </View>
          </View>
          <Text style={styles.sigNote}>
            This agreement is electronically signed via DeweyIQ. Signature,
            IP address, and timestamp are captured and stored securely.
          </Text>
        </View>

        {/* Footer */}
        <View style={styles.footer} fixed>
          <Text
            style={styles.footerText}
            render={({ pageNumber, totalPages }) =>
              `Page ${pageNumber} of ${totalPages}`
            }
          />
          <Text style={styles.footerText}>Powered by DeweyIQ</Text>
        </View>
      </Page>
    </Document>
  )
}
