/**
 * invoice-pdf.tsx — React PDF document component for invoices.
 *
 * Uses @react-pdf/renderer primitives. All colors are hex — NOT oklch().
 * PDF renderer does not support oklch (same constraint as MapLibre GL).
 *
 * Requires serverExternalPackages: ['@react-pdf/renderer'] in next.config.ts
 * (already configured — see Phase 06-01 decision).
 *
 * Matches quote-pdf.tsx branding style for visual consistency.
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
  red: "#dc2626",
  amber: "#d97706",
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
  companyAddress: {
    fontSize: 9,
    color: C.textMuted,
    marginTop: 4,
    lineHeight: 1.5,
  },
  headerRight: {
    alignItems: "flex-end",
  },
  invoiceLabel: {
    fontSize: 20,
    fontFamily: "Helvetica-Bold",
    color: C.accent,
    marginBottom: 4,
  },
  invoiceMeta: {
    fontSize: 9,
    color: C.textMuted,
    marginBottom: 2,
  },

  // ── Two-column info row ────────────────────────────────────────────────────
  infoRow: {
    flexDirection: "row",
    gap: 24,
    marginBottom: 20,
  },
  infoCol: {
    flex: 1,
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

  // ── Tax exempt badge ───────────────────────────────────────────────────────
  taxExemptBadge: {
    flexDirection: "row",
    backgroundColor: "#dcfce7",
    borderRadius: 4,
    padding: "4 8",
    marginBottom: 8,
    alignItems: "center",
    alignSelf: "flex-end",
  },
  taxExemptText: {
    fontSize: 8,
    fontFamily: "Helvetica-Bold",
    color: "#166534",
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

  // ── Work order references ─────────────────────────────────────────────────
  woRefContainer: {
    marginBottom: 16,
    padding: "8 10",
    backgroundColor: C.bg,
    borderRadius: 4,
    borderLeftWidth: 3,
    borderLeftColor: C.accent,
  },
  woRefLabel: {
    fontSize: 8,
    fontFamily: "Helvetica-Bold",
    color: C.textMuted,
    textTransform: "uppercase",
    letterSpacing: 0.8,
    marginBottom: 4,
  },
  woRefItem: {
    fontSize: 9,
    color: C.text,
    marginBottom: 2,
  },

  // ── Notes ─────────────────────────────────────────────────────────────────
  notesContainer: {
    marginBottom: 16,
  },

  // ── Payment ───────────────────────────────────────────────────────────────
  paymentContainer: {
    marginTop: 20,
    borderTopWidth: 1,
    borderTopColor: C.border,
    paddingTop: 12,
  },
  paymentText: {
    fontSize: 8,
    color: C.textLight,
    lineHeight: 1.5,
  },

  // ── Footer ────────────────────────────────────────────────────────────────
  footer: {
    position: "absolute",
    bottom: 30,
    left: 40,
    right: 40,
    borderTopWidth: 1,
    borderTopColor: C.border,
    paddingTop: 8,
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  footerText: {
    fontSize: 8,
    color: C.textLight,
  },
})

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface InvoiceDocumentProps {
  invoiceNumber: string
  invoiceDate: string
  companyName: string
  companyLogoUrl?: string | null
  companyAddress?: string | null
  customerName: string
  customerAddress?: string | null
  lineItems: Array<{
    description: string
    quantity: number
    unit: string
    unitPrice: number
    lineTotal: number
    isTaxable: boolean
  }>
  subtotal: number
  taxRate: number
  taxAmount: number
  discountAmount: number
  total: number
  notes?: string | null
  workOrderNumbers: string[]
  taxExempt?: boolean
}

// ---------------------------------------------------------------------------
// InvoiceDocument
// ---------------------------------------------------------------------------

export function InvoiceDocument(props: InvoiceDocumentProps) {
  const {
    invoiceNumber,
    invoiceDate,
    companyName,
    companyLogoUrl,
    companyAddress,
    customerName,
    customerAddress,
    lineItems,
    subtotal,
    taxRate,
    taxAmount,
    discountAmount,
    total,
    notes,
    workOrderNumbers,
    taxExempt = false,
  } = props

  return (
    <Document
      title={`Invoice #${invoiceNumber}`}
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
            {companyAddress && (
              <Text style={styles.companyAddress}>{companyAddress}</Text>
            )}
          </View>
          <View style={styles.headerRight}>
            <Text style={styles.invoiceLabel}>INVOICE #{invoiceNumber}</Text>
            <Text style={styles.invoiceMeta}>Date: {invoiceDate}</Text>
          </View>
        </View>

        {/* ── Bill To + Work Order Reference ────────────────────────── */}
        <View style={styles.infoRow}>
          <View style={styles.infoCol}>
            <Text style={styles.sectionLabel}>Bill To</Text>
            <Text style={styles.sectionText}>{customerName}</Text>
            {customerAddress && (
              <Text style={styles.sectionTextMuted}>{customerAddress}</Text>
            )}
          </View>
          {workOrderNumbers.length > 0 && (
            <View style={styles.infoCol}>
              <View style={styles.woRefContainer}>
                <Text style={styles.woRefLabel}>
                  Work Order{workOrderNumbers.length > 1 ? "s" : ""} Covered
                </Text>
                {workOrderNumbers.map((woNum, i) => (
                  <Text key={i} style={styles.woRefItem}>
                    • {woNum}
                  </Text>
                ))}
              </View>
            </View>
          )}
        </View>

        {/* ── Tax exempt badge ──────────────────────────────────────── */}
        {taxExempt && (
          <View style={styles.taxExemptBadge}>
            <Text style={styles.taxExemptText}>TAX EXEMPT CUSTOMER</Text>
          </View>
        )}

        {/* ── Line items table ─────────────────────────────────────── */}
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

            return (
              <View key={i} style={rowStyle}>
                <View style={styles.colDescription}>
                  <Text style={styles.tableRowText}>{item.description}</Text>
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
                    ${item.lineTotal.toFixed(2)}
                  </Text>
                </View>
              </View>
            )
          })}
        </View>

        {/* ── Totals ───────────────────────────────────────────────── */}
        <View style={styles.totalsContainer}>
          <View style={styles.totalRow}>
            <Text style={styles.totalLabel}>Subtotal</Text>
            <Text style={styles.totalValue}>${subtotal.toFixed(2)}</Text>
          </View>

          {discountAmount > 0 && (
            <View style={styles.totalRow}>
              <Text style={styles.totalLabel}>Discount</Text>
              <Text style={[styles.totalValue, { color: C.green }]}>
                -${discountAmount.toFixed(2)}
              </Text>
            </View>
          )}

          <View style={styles.totalRow}>
            <Text style={styles.totalLabel}>
              {taxExempt
                ? "Tax (Exempt)"
                : `Tax (${(taxRate * 100).toFixed(2)}%)`}
            </Text>
            <Text style={styles.totalValue}>
              {taxExempt ? "—" : `$${taxAmount.toFixed(2)}`}
            </Text>
          </View>

          <View style={styles.grandTotalRow}>
            <Text style={styles.grandTotalLabel}>Total Due</Text>
            <Text style={styles.grandTotalValue}>${total.toFixed(2)}</Text>
          </View>
        </View>

        {/* ── Notes ───────────────────────────────────────────────── */}
        {notes && (
          <View style={styles.notesContainer}>
            <Text style={[styles.sectionLabel, { marginBottom: 6 }]}>
              Notes
            </Text>
            <Text style={styles.sectionTextMuted}>{notes}</Text>
          </View>
        )}

        {/* ── Payment instructions (placeholder for Phase 7) ───────── */}
        <View style={styles.paymentContainer}>
          <Text style={styles.paymentText}>
            Payment is due upon receipt. Please reference invoice #{invoiceNumber}
            with your payment. For questions about this invoice, contact our office.
            {"\n"}
            Online payment available — a payment link will be included when available.
          </Text>
        </View>

        {/* ── Footer ──────────────────────────────────────────────── */}
        <View style={styles.footer} fixed>
          <Text style={styles.footerText}>
            Invoice #{invoiceNumber} · {companyName}
          </Text>
          <Text
            style={styles.footerText}
            render={({ pageNumber, totalPages }) =>
              `Page ${pageNumber} of ${totalPages}`
            }
          />
        </View>
      </Page>
    </Document>
  )
}
