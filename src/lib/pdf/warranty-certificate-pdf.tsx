/**
 * warranty-certificate-pdf.tsx — React PDF document for pool construction
 * warranty certificates.
 *
 * Uses @react-pdf/renderer primitives. All colors are hex — NOT oklch().
 * PDF renderer does not support oklch (same constraint as MapLibre GL and quote-pdf).
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
  accentLight: "#eff6ff",
  border: "#e2e8f0",
  rowAlt: "#f1f5f9",
  green: "#16a34a",
  greenLight: "#f0fdf4",
  headerBg: "#1e3a5f",
  gold: "#b45309",
  goldLight: "#fffbeb",
  sealBg: "#dbeafe",
}

// ---------------------------------------------------------------------------
// Styles
// ---------------------------------------------------------------------------

const styles = StyleSheet.create({
  page: {
    padding: 0,
    backgroundColor: C.white,
    fontFamily: "Helvetica",
    fontSize: 10,
    color: C.text,
  },

  // ── Header band ───────────────────────────────────────────────────────────
  headerBand: {
    backgroundColor: C.headerBg,
    padding: "28 40 24 40",
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "flex-start",
  },
  headerLeft: {
    flexDirection: "column",
    flex: 1,
  },
  logo: {
    width: 90,
    height: 36,
    objectFit: "contain",
    marginBottom: 8,
  },
  companyName: {
    fontSize: 16,
    fontFamily: "Helvetica-Bold",
    color: C.white,
    marginBottom: 2,
  },
  companyTagline: {
    fontSize: 9,
    color: "#93c5fd",
  },
  headerRight: {
    alignItems: "flex-end",
    flexDirection: "column",
  },
  certificateTitle: {
    fontSize: 22,
    fontFamily: "Helvetica-Bold",
    color: C.white,
    letterSpacing: 1.5,
    marginBottom: 4,
  },
  certificateSubtitle: {
    fontSize: 9,
    color: "#93c5fd",
    letterSpacing: 0.5,
  },

  // ── Certificate number band ────────────────────────────────────────────────
  certNumberBand: {
    backgroundColor: C.accentLight,
    borderBottomWidth: 1,
    borderBottomColor: "#bfdbfe",
    padding: "8 40",
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  certNumberLabel: {
    fontSize: 8,
    color: C.textMuted,
    fontFamily: "Helvetica-Bold",
    textTransform: "uppercase",
    letterSpacing: 0.8,
  },
  certNumberValue: {
    fontSize: 12,
    fontFamily: "Helvetica-Bold",
    color: C.accent,
    letterSpacing: 1,
  },

  // ── Body ──────────────────────────────────────────────────────────────────
  body: {
    padding: "24 40",
  },

  // ── Party info row ────────────────────────────────────────────────────────
  partyRow: {
    flexDirection: "row",
    marginBottom: 20,
    gap: 16,
  },
  partyBlock: {
    flex: 1,
    backgroundColor: C.bg,
    borderRadius: 4,
    padding: "10 14",
    borderWidth: 1,
    borderColor: C.border,
  },
  partyLabel: {
    fontSize: 8,
    fontFamily: "Helvetica-Bold",
    color: C.textMuted,
    textTransform: "uppercase",
    letterSpacing: 0.8,
    marginBottom: 4,
  },
  partyName: {
    fontSize: 11,
    fontFamily: "Helvetica-Bold",
    color: C.text,
    marginBottom: 2,
  },
  partyDetail: {
    fontSize: 9,
    color: C.textMuted,
    lineHeight: 1.4,
  },

  // ── Section header ─────────────────────────────────────────────────────────
  sectionHeader: {
    fontSize: 9,
    fontFamily: "Helvetica-Bold",
    color: C.textMuted,
    textTransform: "uppercase",
    letterSpacing: 0.8,
    marginBottom: 6,
    marginTop: 4,
  },

  // ── Project info ──────────────────────────────────────────────────────────
  projectBox: {
    backgroundColor: C.greenLight,
    borderRadius: 4,
    padding: "10 14",
    borderWidth: 1,
    borderColor: "#bbf7d0",
    marginBottom: 20,
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "flex-start",
  },
  projectLeft: {
    flex: 1,
  },
  projectLabel: {
    fontSize: 8,
    fontFamily: "Helvetica-Bold",
    color: "#166534",
    textTransform: "uppercase",
    letterSpacing: 0.8,
    marginBottom: 3,
  },
  projectName: {
    fontSize: 13,
    fontFamily: "Helvetica-Bold",
    color: C.text,
    marginBottom: 2,
  },
  projectMeta: {
    fontSize: 9,
    color: C.textMuted,
  },
  completionBadge: {
    backgroundColor: C.green,
    borderRadius: 4,
    padding: "4 10",
    alignItems: "center",
  },
  completionBadgeLabel: {
    fontSize: 7,
    fontFamily: "Helvetica-Bold",
    color: C.white,
    textTransform: "uppercase",
    letterSpacing: 0.5,
    marginBottom: 2,
  },
  completionBadgeDate: {
    fontSize: 10,
    fontFamily: "Helvetica-Bold",
    color: C.white,
  },

  // ── Coverage table ─────────────────────────────────────────────────────────
  table: {
    marginBottom: 20,
    borderRadius: 4,
    overflow: "hidden",
    borderWidth: 1,
    borderColor: C.border,
  },
  tableHeader: {
    flexDirection: "row",
    backgroundColor: C.accent,
    padding: "7 10",
  },
  tableHeaderText: {
    fontSize: 8,
    fontFamily: "Helvetica-Bold",
    color: C.white,
    textTransform: "uppercase",
    letterSpacing: 0.5,
  },
  tableRowEven: {
    flexDirection: "row",
    padding: "8 10",
    backgroundColor: C.white,
    borderBottomWidth: 1,
    borderBottomColor: C.border,
  },
  tableRowOdd: {
    flexDirection: "row",
    padding: "8 10",
    backgroundColor: C.rowAlt,
    borderBottomWidth: 1,
    borderBottomColor: C.border,
  },
  tableRowLast: {
    borderBottomWidth: 0,
  },
  colType: { flex: 1.2 },
  colDuration: { flex: 0.8 },
  colCovered: { flex: 2 },
  colExpires: { flex: 1 },
  tableCellBold: {
    fontSize: 9,
    fontFamily: "Helvetica-Bold",
    color: C.text,
  },
  tableCell: {
    fontSize: 9,
    color: C.text,
    lineHeight: 1.4,
  },
  tableCellMuted: {
    fontSize: 8,
    color: C.textMuted,
    lineHeight: 1.3,
    marginTop: 2,
  },
  expirationText: {
    fontSize: 9,
    fontFamily: "Helvetica-Bold",
    color: C.accent,
  },

  // ── Terms & conditions ────────────────────────────────────────────────────
  termsBox: {
    backgroundColor: C.bg,
    borderRadius: 4,
    padding: "10 14",
    borderWidth: 1,
    borderColor: C.border,
    marginBottom: 20,
  },
  termsText: {
    fontSize: 8,
    color: C.textLight,
    lineHeight: 1.6,
  },

  // ── Signature row ─────────────────────────────────────────────────────────
  signatureRow: {
    flexDirection: "row",
    marginBottom: 24,
    gap: 20,
  },
  signatureBlock: {
    flex: 1,
    borderTopWidth: 1,
    borderTopColor: C.text,
    paddingTop: 6,
  },
  signatureLabel: {
    fontSize: 8,
    color: C.textMuted,
  },
  signatureName: {
    fontSize: 10,
    fontFamily: "Helvetica-Bold",
    color: C.text,
    marginTop: 2,
  },
  signatureTitle: {
    fontSize: 8,
    color: C.textMuted,
  },

  // ── Footer ────────────────────────────────────────────────────────────────
  footer: {
    borderTopWidth: 1,
    borderTopColor: C.border,
    padding: "10 40",
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    backgroundColor: C.bg,
    position: "absolute",
    bottom: 0,
    left: 0,
    right: 0,
  },
  footerLeft: {
    fontSize: 8,
    color: C.textLight,
  },
  footerRight: {
    fontSize: 8,
    color: C.textLight,
  },
})

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface WarrantyCoverageItem {
  warrantyType: string
  durationMonths: number
  whatCovered: string
  exclusions: string
  expirationDate: string
}

export interface WarrantyCertificateDocumentProps {
  certificateNumber: string
  companyName: string
  companyLogoUrl?: string | null
  customerName: string
  propertyAddress: string | null
  projectDescription: string
  completionDate: string
  coverageItems: WarrantyCoverageItem[]
}

// ---------------------------------------------------------------------------
// Helper: Format warranty type label
// ---------------------------------------------------------------------------

function formatWarrantyType(warrantyType: string): string {
  const map: Record<string, string> = {
    workmanship: "Workmanship",
    equipment: "Equipment",
    surface: "Surface / Finish",
    structural: "Structural",
  }
  return map[warrantyType] ?? warrantyType
}

// ---------------------------------------------------------------------------
// WarrantyCertificateDocument
// ---------------------------------------------------------------------------

export function WarrantyCertificateDocument(props: WarrantyCertificateDocumentProps) {
  const {
    certificateNumber,
    companyName,
    companyLogoUrl,
    customerName,
    propertyAddress,
    projectDescription,
    completionDate,
    coverageItems,
  } = props

  const issuedDate = new Date().toLocaleDateString("en-US", {
    year: "numeric",
    month: "long",
    day: "numeric",
  })

  const completionDateFormatted = new Date(completionDate + "T00:00:00").toLocaleDateString(
    "en-US",
    { year: "numeric", month: "long", day: "numeric" }
  )

  const defaultTerms = `This warranty certificate is issued to the registered owner(s) of the property listed above and is not transferable without written consent from ${companyName}.

GENERAL TERMS: Coverage applies to defects in materials and workmanship as described herein. This warranty does not cover damage resulting from normal wear and tear, chemical damage from improper water balance or use of non-approved chemicals, physical damage, negligence, misuse, acts of nature (including flooding, lightning, earthquakes), or failure to perform required maintenance.

EQUIPMENT WARRANTIES: Equipment manufacturer warranties are separate from and in addition to this workmanship warranty. Consult individual manufacturer warranty documentation for equipment-specific coverage.

WARRANTY SERVICE: To request warranty service, contact ${companyName} in writing. We will respond within 5 business days. Unauthorized repairs by third parties may void this warranty.

LIMITATION OF LIABILITY: The total liability under this warranty shall not exceed the original contract price. Consequential or incidental damages are excluded.`

  return (
    <Document
      title={`Warranty Certificate ${certificateNumber}`}
      author={companyName}
      creator="DeweyIQ"
    >
      <Page size="LETTER" style={styles.page}>

        {/* ── Header band ────────────────────────────────────────────── */}
        <View style={styles.headerBand}>
          <View style={styles.headerLeft}>
            {companyLogoUrl ? (
              <Image src={companyLogoUrl} style={styles.logo} />
            ) : null}
            <Text style={styles.companyName}>{companyName}</Text>
            <Text style={styles.companyTagline}>Professional Pool Construction</Text>
          </View>
          <View style={styles.headerRight}>
            <Text style={styles.certificateTitle}>WARRANTY</Text>
            <Text style={styles.certificateTitle}>CERTIFICATE</Text>
            <Text style={styles.certificateSubtitle}>Issued: {issuedDate}</Text>
          </View>
        </View>

        {/* ── Certificate number band ──────────────────────────────── */}
        <View style={styles.certNumberBand}>
          <Text style={styles.certNumberLabel}>Certificate Number</Text>
          <Text style={styles.certNumberValue}>{certificateNumber}</Text>
        </View>

        {/* ── Body ─────────────────────────────────────────────────── */}
        <View style={styles.body}>

          {/* ── Party info ────────────────────────────────────────── */}
          <View style={styles.partyRow}>
            <View style={styles.partyBlock}>
              <Text style={styles.partyLabel}>Warranty Holder</Text>
              <Text style={styles.partyName}>{customerName}</Text>
              {propertyAddress && (
                <Text style={styles.partyDetail}>{propertyAddress}</Text>
              )}
            </View>
            <View style={styles.partyBlock}>
              <Text style={styles.partyLabel}>Issuing Company</Text>
              <Text style={styles.partyName}>{companyName}</Text>
              <Text style={styles.partyDetail}>Licensed & Insured Pool Contractor</Text>
            </View>
          </View>

          {/* ── Project info ──────────────────────────────────────── */}
          <View style={styles.projectBox}>
            <View style={styles.projectLeft}>
              <Text style={styles.projectLabel}>Project Completed</Text>
              <Text style={styles.projectName}>{projectDescription}</Text>
              {propertyAddress && (
                <Text style={styles.projectMeta}>{propertyAddress}</Text>
              )}
            </View>
            <View style={styles.completionBadge}>
              <Text style={styles.completionBadgeLabel}>Completed</Text>
              <Text style={styles.completionBadgeDate}>{completionDateFormatted}</Text>
            </View>
          </View>

          {/* ── Coverage table ────────────────────────────────────── */}
          <Text style={styles.sectionHeader}>Warranty Coverage</Text>

          {coverageItems.length > 0 ? (
            <View style={styles.table}>
              {/* Table header */}
              <View style={styles.tableHeader}>
                <View style={styles.colType}>
                  <Text style={styles.tableHeaderText}>Type</Text>
                </View>
                <View style={styles.colDuration}>
                  <Text style={styles.tableHeaderText}>Duration</Text>
                </View>
                <View style={styles.colCovered}>
                  <Text style={styles.tableHeaderText}>What Is Covered</Text>
                </View>
                <View style={styles.colExpires}>
                  <Text style={[styles.tableHeaderText, { textAlign: "right" }]}>
                    Expires
                  </Text>
                </View>
              </View>

              {/* Table rows */}
              {coverageItems.map((item, i) => {
                const isLast = i === coverageItems.length - 1
                const rowStyle = [
                  i % 2 === 0 ? styles.tableRowEven : styles.tableRowOdd,
                  isLast ? styles.tableRowLast : {},
                ]
                return (
                  <View key={i} style={rowStyle}>
                    <View style={styles.colType}>
                      <Text style={styles.tableCellBold}>
                        {formatWarrantyType(item.warrantyType)}
                      </Text>
                    </View>
                    <View style={styles.colDuration}>
                      <Text style={styles.tableCell}>
                        {item.durationMonths >= 12
                          ? `${Math.floor(item.durationMonths / 12)} yr${Math.floor(item.durationMonths / 12) > 1 ? "s" : ""}`
                          : `${item.durationMonths} mo`}
                      </Text>
                    </View>
                    <View style={styles.colCovered}>
                      <Text style={styles.tableCell}>{item.whatCovered}</Text>
                      {item.exclusions && (
                        <Text style={styles.tableCellMuted}>
                          Excludes: {item.exclusions}
                        </Text>
                      )}
                    </View>
                    <View style={styles.colExpires}>
                      <Text style={[styles.expirationText, { textAlign: "right" }]}>
                        {new Date(item.expirationDate + "T00:00:00").toLocaleDateString(
                          "en-US",
                          { month: "short", day: "numeric", year: "numeric" }
                        )}
                      </Text>
                    </View>
                  </View>
                )
              })}
            </View>
          ) : (
            <View style={[styles.termsBox, { marginBottom: 16 }]}>
              <Text style={styles.termsText}>
                No specific warranty terms have been configured for this project type.
                Please contact {companyName} for warranty coverage details.
              </Text>
            </View>
          )}

          {/* ── Terms & conditions ────────────────────────────────── */}
          <Text style={styles.sectionHeader}>Terms and Conditions</Text>
          <View style={styles.termsBox}>
            <Text style={styles.termsText}>{defaultTerms}</Text>
          </View>

          {/* ── Authorized signature ─────────────────────────────── */}
          <View style={styles.signatureRow}>
            <View style={styles.signatureBlock}>
              <Text style={[styles.signatureLabel, { marginBottom: 20 }]}> </Text>
              <Text style={styles.signatureName}>{companyName}</Text>
              <Text style={styles.signatureTitle}>Authorized Representative</Text>
            </View>
            <View style={styles.signatureBlock}>
              <Text style={[styles.signatureLabel, { marginBottom: 20 }]}> </Text>
              <Text style={styles.signatureName}>{completionDateFormatted}</Text>
              <Text style={styles.signatureTitle}>Date of Issue</Text>
            </View>
          </View>

        </View>

        {/* ── Footer ────────────────────────────────────────────────── */}
        <View style={styles.footer} fixed>
          <Text style={styles.footerLeft}>
            {certificateNumber} · {companyName}
          </Text>
          <Text style={styles.footerRight}>
            Powered by DeweyIQ
          </Text>
        </View>

      </Page>
    </Document>
  )
}
