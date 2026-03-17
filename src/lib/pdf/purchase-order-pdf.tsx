/**
 * purchase-order-pdf.tsx — React PDF document component for purchase orders.
 *
 * Phase 12 Plan 09: Materials & Procurement
 *
 * Uses @react-pdf/renderer primitives. All colors are hex — NOT oklch().
 * PDF renderer does not support oklch (same constraint as MapLibre GL).
 *
 * Requires serverExternalPackages: ['@react-pdf/renderer'] in next.config.ts
 * (already configured — see Phase 06-01 decision).
 *
 * Layout:
 * 1. Company header (logo, name)
 * 2. "PURCHASE ORDER" title + PO number + date
 * 3. Supplier info (name, contact)
 * 4. Project reference (name, number)
 * 5. Line items table: description, quantity, unit, unit price, total
 * 6. Subtotal
 * 7. Notes section
 * 8. Authorized signature line
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
  amber: "#d97706",
  divider: "#cbd5e1",
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
  poLabel: {
    fontSize: 20,
    fontFamily: "Helvetica-Bold",
    color: C.accent,
    marginBottom: 4,
  },
  poMeta: {
    fontSize: 9,
    color: C.textMuted,
    marginBottom: 2,
  },

  // ── Info grid ─────────────────────────────────────────────────────────────
  infoGrid: {
    flexDirection: "row",
    marginBottom: 20,
    gap: 16,
  },
  infoBlock: {
    flex: 1,
  },
  infoLabel: {
    fontSize: 9,
    fontFamily: "Helvetica-Bold",
    color: C.textMuted,
    textTransform: "uppercase",
    letterSpacing: 0.8,
    marginBottom: 4,
  },
  infoText: {
    fontSize: 10,
    color: C.text,
    lineHeight: 1.5,
  },
  infoTextMuted: {
    fontSize: 9,
    color: C.textMuted,
    lineHeight: 1.5,
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
    borderBottomWidth: 1,
    borderBottomColor: C.border,
  },
  tableRowOdd: {
    flexDirection: "row",
    padding: "7 8",
    backgroundColor: C.rowAlt,
    borderBottomWidth: 1,
    borderBottomColor: C.border,
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
  colUnit: {
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
    marginBottom: 24,
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

  // ── Notes ─────────────────────────────────────────────────────────────────
  notesContainer: {
    marginBottom: 24,
    borderTopWidth: 1,
    borderTopColor: C.border,
    paddingTop: 12,
  },
  notesLabel: {
    fontSize: 9,
    fontFamily: "Helvetica-Bold",
    color: C.textMuted,
    textTransform: "uppercase",
    letterSpacing: 0.8,
    marginBottom: 4,
  },
  notesText: {
    fontSize: 10,
    color: C.textMuted,
    lineHeight: 1.5,
  },

  // ── Signature ─────────────────────────────────────────────────────────────
  signatureBlock: {
    marginTop: 8,
    borderTopWidth: 1,
    borderTopColor: C.divider,
    paddingTop: 16,
  },
  signatureRow: {
    flexDirection: "row",
    gap: 32,
  },
  signatureField: {
    flex: 1,
  },
  signatureLine: {
    borderBottomWidth: 1,
    borderBottomColor: C.text,
    marginBottom: 4,
    height: 28,
  },
  signatureLabel: {
    fontSize: 8,
    color: C.textMuted,
  },
})

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface PurchaseOrderDocumentProps {
  poNumber: string | null
  poDate: string
  companyName: string
  companyLogoUrl?: string | null
  supplierName: string
  supplierContact?: string | null
  projectName: string
  projectNumber?: string | null
  lineItems: Array<{
    materialName: string
    quantity: string
    unit: string
    unit_price: string
    total: string
  }>
  subtotal: number
  notes?: string | null
}

// ---------------------------------------------------------------------------
// PurchaseOrderDocument
// ---------------------------------------------------------------------------

export function PurchaseOrderDocument(props: PurchaseOrderDocumentProps) {
  const {
    poNumber,
    poDate,
    companyName,
    companyLogoUrl,
    supplierName,
    supplierContact,
    projectName,
    projectNumber,
    lineItems,
    subtotal,
    notes,
  } = props

  const poTitle = poNumber ? `PO #${poNumber}` : "PURCHASE ORDER"

  return (
    <Document
      title={poTitle}
      author={companyName}
      creator="DeweyIQ"
    >
      <Page size="LETTER" style={styles.page}>

        {/* ── Header ───────────────────────────────────────────────────── */}
        <View style={styles.header}>
          <View style={styles.headerLeft}>
            {companyLogoUrl ? (
              <Image src={companyLogoUrl} style={styles.logo} />
            ) : null}
            <Text style={styles.companyName}>{companyName}</Text>
          </View>
          <View style={styles.headerRight}>
            <Text style={styles.poLabel}>PURCHASE ORDER</Text>
            {poNumber && (
              <Text style={styles.poMeta}>PO #: {poNumber}</Text>
            )}
            <Text style={styles.poMeta}>Date: {poDate}</Text>
          </View>
        </View>

        {/* ── Supplier & Project info ───────────────────────────────────── */}
        <View style={styles.infoGrid}>
          <View style={styles.infoBlock}>
            <Text style={styles.infoLabel}>Supplier</Text>
            <Text style={styles.infoText}>{supplierName}</Text>
            {supplierContact && (
              <Text style={styles.infoTextMuted}>{supplierContact}</Text>
            )}
          </View>
          <View style={styles.infoBlock}>
            <Text style={styles.infoLabel}>Project</Text>
            <Text style={styles.infoText}>{projectName}</Text>
            {projectNumber && (
              <Text style={styles.infoTextMuted}>{projectNumber}</Text>
            )}
          </View>
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
            <View style={styles.colUnit}>
              <Text style={[styles.tableHeaderText, { textAlign: "right" }]}>
                Unit
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
            const qty = parseFloat(item.quantity)
            const unitPrice = parseFloat(item.unit_price)
            const total = parseFloat(item.total)

            return (
              <View key={i} style={rowStyle}>
                <View style={styles.colDescription}>
                  <Text style={styles.tableRowText}>{item.materialName}</Text>
                </View>
                <View style={styles.colQty}>
                  <Text style={[styles.tableRowTextMuted, { textAlign: "right" }]}>
                    {parseFloat(item.quantity).toString()}
                  </Text>
                </View>
                <View style={styles.colUnit}>
                  <Text style={[styles.tableRowTextMuted, { textAlign: "right" }]}>
                    {item.unit}
                  </Text>
                </View>
                <View style={styles.colUnitPrice}>
                  <Text style={[styles.tableRowTextMuted, { textAlign: "right" }]}>
                    ${unitPrice.toFixed(2)}
                  </Text>
                </View>
                <View style={styles.colTotal}>
                  <Text style={[styles.tableRowText, { textAlign: "right" }]}>
                    ${total.toFixed(2)}
                  </Text>
                </View>
              </View>
            )
          })}
        </View>

        {/* ── Total ────────────────────────────────────────────────────── */}
        <View style={styles.totalsContainer}>
          <View style={styles.grandTotalRow}>
            <Text style={styles.grandTotalLabel}>Total</Text>
            <Text style={styles.grandTotalValue}>${subtotal.toFixed(2)}</Text>
          </View>
        </View>

        {/* ── Notes ────────────────────────────────────────────────────── */}
        {notes && (
          <View style={styles.notesContainer}>
            <Text style={styles.notesLabel}>Notes</Text>
            <Text style={styles.notesText}>{notes}</Text>
          </View>
        )}

        {/* ── Authorized signature ─────────────────────────────────────── */}
        <View style={styles.signatureBlock}>
          <View style={styles.signatureRow}>
            <View style={styles.signatureField}>
              <View style={styles.signatureLine} />
              <Text style={styles.signatureLabel}>Authorized By</Text>
            </View>
            <View style={styles.signatureField}>
              <View style={styles.signatureLine} />
              <Text style={styles.signatureLabel}>Date</Text>
            </View>
            <View style={styles.signatureField}>
              <View style={styles.signatureLine} />
              <Text style={styles.signatureLabel}>Supplier Acknowledgement</Text>
            </View>
          </View>
        </View>

      </Page>
    </Document>
  )
}
