/**
 * quote-pdf.tsx — React PDF document component for quotes.
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
  totalBg: "#f8fafc",
  green: "#16a34a",
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
  headerRight: {
    alignItems: "flex-end",
  },
  quoteLabel: {
    fontSize: 20,
    fontFamily: "Helvetica-Bold",
    color: C.accent,
    marginBottom: 4,
  },
  quoteMeta: {
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
    marginBottom: 4,
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

  // ── Flagged by ────────────────────────────────────────────────────────────
  flaggedBadge: {
    flexDirection: "row",
    backgroundColor: "#fef3c7",
    borderRadius: 4,
    padding: "4 8",
    marginBottom: 16,
    alignItems: "center",
  },
  flaggedText: {
    fontSize: 9,
    color: "#92400e",
  },

  // ── Line items table ──────────────────────────────────────────────────────
  table: {
    marginBottom: 20,
  },
  tableHeader: {
    flexDirection: "row",
    backgroundColor: C.accent,
    padding: "6 8",
    borderRadius: 2,
  },
  tableHeaderText: {
    fontSize: 9,
    fontFamily: "Helvetica-Bold",
    color: C.white,
  },
  tableRowEven: {
    flexDirection: "row",
    padding: "7 8",
    backgroundColor: C.white,
  },
  tableRowOdd: {
    flexDirection: "row",
    padding: "7 8",
    backgroundColor: C.rowAlt,
  },
  tableRowText: {
    fontSize: 9,
    color: C.text,
  },
  tableRowTextMuted: {
    fontSize: 9,
    color: C.textMuted,
  },
  colDescription: {
    flex: 3,
  },
  colQty: {
    flex: 1,
    textAlign: "right",
  },
  colUnitPrice: {
    flex: 1,
    textAlign: "right",
  },
  colTotal: {
    flex: 1,
    textAlign: "right",
  },

  // ── Totals ────────────────────────────────────────────────────────────────
  totalsContainer: {
    alignItems: "flex-end",
    marginBottom: 20,
  },
  totalRow: {
    flexDirection: "row",
    marginBottom: 4,
    minWidth: 200,
  },
  totalLabel: {
    fontSize: 10,
    color: C.textMuted,
    flex: 1,
    textAlign: "right",
    paddingRight: 16,
  },
  totalValue: {
    fontSize: 10,
    color: C.text,
    width: 80,
    textAlign: "right",
  },
  grandTotalRow: {
    flexDirection: "row",
    borderTopWidth: 1,
    borderTopColor: C.border,
    paddingTop: 8,
    marginTop: 4,
    minWidth: 200,
  },
  grandTotalLabel: {
    fontSize: 12,
    fontFamily: "Helvetica-Bold",
    color: C.text,
    flex: 1,
    textAlign: "right",
    paddingRight: 16,
  },
  grandTotalValue: {
    fontSize: 12,
    fontFamily: "Helvetica-Bold",
    color: C.accent,
    width: 80,
    textAlign: "right",
  },

  // ── Terms ─────────────────────────────────────────────────────────────────
  termsContainer: {
    marginTop: 24,
    borderTopWidth: 1,
    borderTopColor: C.border,
    paddingTop: 12,
  },
  termsText: {
    fontSize: 8,
    color: C.textLight,
    lineHeight: 1.5,
  },
})

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface QuoteDocumentProps {
  quoteNumber: string
  quoteDate: string
  expirationDate: string
  companyName: string
  companyLogoUrl?: string | null
  customerName: string
  propertyAddress: string | null
  scopeOfWork: string
  lineItems: Array<{
    description: string
    quantity: number
    unit: string
    unitPrice: number
    total: number
    isOptional: boolean
    isTaxable: boolean
  }>
  subtotal: number
  taxRate: number
  taxAmount: number
  discountAmount?: number | null
  grandTotal: number
  termsAndConditions: string | null
  flaggedByTechName?: string | null
  laborHours?: number | null
  laborRate?: number | null
  laborCost?: number | null
}

// ---------------------------------------------------------------------------
// QuoteDocument
// ---------------------------------------------------------------------------

export function QuoteDocument(props: QuoteDocumentProps) {
  const {
    quoteNumber,
    quoteDate,
    expirationDate,
    companyName,
    companyLogoUrl,
    customerName,
    propertyAddress,
    scopeOfWork,
    lineItems,
    subtotal,
    taxRate,
    taxAmount,
    discountAmount,
    grandTotal,
    termsAndConditions,
    flaggedByTechName,
  } = props

  return (
    <Document
      title={`Quote #${quoteNumber}`}
      author={companyName}
      creator="PoolCo Management"
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
            <Text style={styles.quoteLabel}>QUOTE #{quoteNumber}</Text>
            <Text style={styles.quoteMeta}>Date: {quoteDate}</Text>
            <Text style={styles.quoteMeta}>Expires: {expirationDate}</Text>
          </View>
        </View>

        {/* ── Flagged by tech ──────────────────────────────────────────── */}
        {flaggedByTechName && (
          <View style={styles.flaggedBadge}>
            <Text style={styles.flaggedText}>
              Issue identified by: {flaggedByTechName}
            </Text>
          </View>
        )}

        {/* ── Customer info ────────────────────────────────────────────── */}
        <View style={styles.section}>
          <Text style={styles.sectionLabel}>Prepared for</Text>
          <Text style={styles.sectionText}>{customerName}</Text>
          {propertyAddress && (
            <Text style={styles.sectionTextMuted}>{propertyAddress}</Text>
          )}
        </View>

        {/* ── Scope of work ────────────────────────────────────────────── */}
        <View style={styles.section}>
          <Text style={styles.sectionLabel}>Scope of Work</Text>
          <Text style={styles.sectionText}>{scopeOfWork}</Text>
        </View>

        {/* ── Line items table ─────────────────────────────────────────── */}
        <View style={styles.table}>
          {/* Table header */}
          <View style={styles.tableHeader}>
            <View style={styles.colDescription}>
              <Text style={styles.tableHeaderText}>Description</Text>
            </View>
            <View style={styles.colQty}>
              <Text style={[styles.tableHeaderText, { textAlign: "right" }]}>
                Qty
              </Text>
            </View>
            <View style={styles.colUnitPrice}>
              <Text style={[styles.tableHeaderText, { textAlign: "right" }]}>
                Unit Price
              </Text>
            </View>
            <View style={styles.colTotal}>
              <Text style={[styles.tableHeaderText, { textAlign: "right" }]}>
                Total
              </Text>
            </View>
          </View>

          {/* Table rows */}
          {lineItems.map((item, i) => {
            const isEven = i % 2 === 0
            const rowStyle = isEven ? styles.tableRowEven : styles.tableRowOdd
            const descriptionText = item.isOptional
              ? `${item.description} (optional)`
              : item.description

            return (
              <View key={i} style={rowStyle}>
                <View style={styles.colDescription}>
                  <Text style={styles.tableRowText}>{descriptionText}</Text>
                </View>
                <View style={styles.colQty}>
                  <Text
                    style={[styles.tableRowTextMuted, { textAlign: "right" }]}
                  >
                    {item.quantity} {item.unit}
                  </Text>
                </View>
                <View style={styles.colUnitPrice}>
                  <Text
                    style={[styles.tableRowTextMuted, { textAlign: "right" }]}
                  >
                    ${item.unitPrice.toFixed(2)}
                  </Text>
                </View>
                <View style={styles.colTotal}>
                  <Text
                    style={[styles.tableRowText, { textAlign: "right" }]}
                  >
                    ${item.total.toFixed(2)}
                  </Text>
                </View>
              </View>
            )
          })}
        </View>

        {/* ── Totals ───────────────────────────────────────────────────── */}
        <View style={styles.totalsContainer}>
          <View style={styles.totalRow}>
            <Text style={styles.totalLabel}>Subtotal</Text>
            <Text style={styles.totalValue}>${subtotal.toFixed(2)}</Text>
          </View>

          {discountAmount != null && discountAmount > 0 && (
            <View style={styles.totalRow}>
              <Text style={styles.totalLabel}>Discount</Text>
              <Text style={[styles.totalValue, { color: C.green }]}>
                -${discountAmount.toFixed(2)}
              </Text>
            </View>
          )}

          <View style={styles.totalRow}>
            <Text style={styles.totalLabel}>
              Tax ({(taxRate * 100).toFixed(2)}%)
            </Text>
            <Text style={styles.totalValue}>${taxAmount.toFixed(2)}</Text>
          </View>

          <View style={styles.grandTotalRow}>
            <Text style={styles.grandTotalLabel}>Total</Text>
            <Text style={styles.grandTotalValue}>${grandTotal.toFixed(2)}</Text>
          </View>
        </View>

        {/* ── Terms & conditions ───────────────────────────────────────── */}
        {termsAndConditions && (
          <View style={styles.termsContainer}>
            <Text
              style={[
                styles.sectionLabel,
                { marginBottom: 6 },
              ]}
            >
              Terms &amp; Conditions
            </Text>
            <Text style={styles.termsText}>{termsAndConditions}</Text>
          </View>
        )}
      </Page>
    </Document>
  )
}
