/**
 * proposal-pdf.tsx — React PDF document component for project proposals.
 *
 * Uses @react-pdf/renderer primitives. All colors are hex — NOT oklch().
 * PDF renderer does not support oklch (same constraint as MapLibre GL).
 *
 * Requires serverExternalPackages: ['@react-pdf/renderer'] in next.config.ts
 * (already configured — see Phase 06-01 decision).
 *
 * Extended vs. quote-pdf.tsx: adds tiers comparison table, add-ons,
 * payment schedule table, warranty info, cancellation policy,
 * and a signature block area.
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
  tierGood: "#16a34a",
  tierBetter: "#2563eb",
  tierBest: "#7c3aed",
  yellow: "#d97706",
  sectionHeaderBg: "#1e3a5f",
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
  companyMeta: {
    fontSize: 9,
    color: C.textMuted,
    marginTop: 2,
  },
  headerRight: {
    alignItems: "flex-end",
  },
  proposalLabel: {
    fontSize: 20,
    fontFamily: "Helvetica-Bold",
    color: C.accent,
    marginBottom: 4,
  },
  proposalMeta: {
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

  // ── Two-column info row ───────────────────────────────────────────────────
  twoColRow: {
    flexDirection: "row",
    marginBottom: 16,
  },
  twoColLeft: {
    flex: 1,
    paddingRight: 12,
  },
  twoColRight: {
    flex: 1,
    paddingLeft: 12,
  },

  // ── Section divider ───────────────────────────────────────────────────────
  sectionDivider: {
    borderTopWidth: 1,
    borderTopColor: C.border,
    marginTop: 4,
    marginBottom: 16,
    paddingTop: 12,
  },

  // ── Line items table ──────────────────────────────────────────────────────
  table: {
    marginBottom: 16,
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
  colCategory: {
    flex: 1.5,
  },
  colDescription: {
    flex: 3,
  },
  colDescriptionFull: {
    flex: 5,
  },
  colQty: {
    flex: 0.8,
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

  // ── Category group header ─────────────────────────────────────────────────
  categoryHeader: {
    flexDirection: "row",
    backgroundColor: "#dbeafe",
    padding: "5 8",
    marginTop: 4,
  },
  categoryHeaderText: {
    fontSize: 9,
    fontFamily: "Helvetica-Bold",
    color: "#1e40af",
  },

  // ── Summary row (show_line_item_detail=false) ─────────────────────────────
  summaryRow: {
    flexDirection: "row",
    padding: "7 8",
    borderBottomWidth: 1,
    borderBottomColor: C.border,
  },
  summaryLabel: {
    flex: 4,
    fontSize: 10,
    color: C.text,
  },
  summaryValue: {
    flex: 1,
    fontSize: 10,
    color: C.text,
    textAlign: "right",
    fontFamily: "Helvetica-Bold",
  },

  // ── Tiers comparison table ────────────────────────────────────────────────
  tiersContainer: {
    flexDirection: "row",
    marginBottom: 16,
    borderWidth: 1,
    borderColor: C.border,
    borderRadius: 4,
    overflow: "hidden",
  },
  tierCol: {
    flex: 1,
    padding: 10,
    borderRightWidth: 1,
    borderRightColor: C.border,
  },
  tierColLast: {
    flex: 1,
    padding: 10,
  },
  tierBadge: {
    padding: "3 6",
    borderRadius: 3,
    marginBottom: 6,
    alignSelf: "flex-start",
  },
  tierBadgeText: {
    fontSize: 8,
    fontFamily: "Helvetica-Bold",
    color: C.white,
  },
  tierName: {
    fontSize: 13,
    fontFamily: "Helvetica-Bold",
    color: C.text,
    marginBottom: 4,
  },
  tierPrice: {
    fontSize: 16,
    fontFamily: "Helvetica-Bold",
    color: C.accent,
    marginBottom: 8,
  },
  tierDescription: {
    fontSize: 9,
    color: C.textMuted,
    marginBottom: 8,
    lineHeight: 1.4,
  },
  tierFeatureRow: {
    flexDirection: "row",
    alignItems: "flex-start",
    marginBottom: 3,
  },
  tierFeatureDot: {
    fontSize: 9,
    color: C.green,
    marginRight: 4,
    marginTop: 1,
  },
  tierFeatureText: {
    fontSize: 9,
    color: C.text,
    flex: 1,
    lineHeight: 1.4,
  },

  // ── Add-ons section ───────────────────────────────────────────────────────
  addonRow: {
    flexDirection: "row",
    padding: "6 8",
    borderBottomWidth: 1,
    borderBottomColor: C.border,
    alignItems: "center",
  },
  addonName: {
    flex: 4,
    fontSize: 10,
    color: C.text,
  },
  addonDescription: {
    flex: 4,
    fontSize: 9,
    color: C.textMuted,
  },
  addonPrice: {
    flex: 1,
    fontSize: 10,
    fontFamily: "Helvetica-Bold",
    color: C.text,
    textAlign: "right",
  },

  // ── Payment schedule ──────────────────────────────────────────────────────
  paymentRow: {
    flexDirection: "row",
    padding: "7 8",
    borderBottomWidth: 1,
    borderBottomColor: C.border,
  },
  paymentName: {
    flex: 3,
    fontSize: 10,
    color: C.text,
  },
  paymentAmount: {
    flex: 1.5,
    fontSize: 10,
    fontFamily: "Helvetica-Bold",
    color: C.text,
    textAlign: "right",
  },
  paymentPct: {
    flex: 1,
    fontSize: 9,
    color: C.textMuted,
    textAlign: "right",
  },

  // ── Totals ────────────────────────────────────────────────────────────────
  totalsContainer: {
    alignItems: "flex-end",
    marginBottom: 16,
  },
  totalRow: {
    flexDirection: "row",
    marginBottom: 4,
    minWidth: 240,
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
    width: 90,
    textAlign: "right",
  },
  grandTotalRow: {
    flexDirection: "row",
    borderTopWidth: 2,
    borderTopColor: C.accent,
    paddingTop: 8,
    marginTop: 4,
    minWidth: 240,
  },
  grandTotalLabel: {
    fontSize: 13,
    fontFamily: "Helvetica-Bold",
    color: C.text,
    flex: 1,
    textAlign: "right",
    paddingRight: 16,
  },
  grandTotalValue: {
    fontSize: 13,
    fontFamily: "Helvetica-Bold",
    color: C.accent,
    width: 90,
    textAlign: "right",
  },

  // ── Legal sections ────────────────────────────────────────────────────────
  legalContainer: {
    marginTop: 8,
    borderTopWidth: 1,
    borderTopColor: C.border,
    paddingTop: 12,
    marginBottom: 16,
  },
  legalTitle: {
    fontSize: 9,
    fontFamily: "Helvetica-Bold",
    color: C.textMuted,
    textTransform: "uppercase",
    letterSpacing: 0.8,
    marginBottom: 6,
  },
  legalText: {
    fontSize: 8,
    color: C.textLight,
    lineHeight: 1.5,
  },

  // ── Signature block ───────────────────────────────────────────────────────
  signatureBlock: {
    flexDirection: "row",
    marginTop: 24,
    borderTopWidth: 1,
    borderTopColor: C.border,
    paddingTop: 16,
  },
  signatureCol: {
    flex: 1,
    paddingRight: 20,
  },
  signatureColRight: {
    flex: 1,
    paddingLeft: 20,
  },
  signatureLine: {
    borderBottomWidth: 1,
    borderBottomColor: C.text,
    marginBottom: 4,
    height: 32,
  },
  signatureLabel: {
    fontSize: 8,
    color: C.textMuted,
  },

  // ── Footer ────────────────────────────────────────────────────────────────
  footer: {
    marginTop: 24,
    paddingTop: 12,
    borderTopWidth: 1,
    borderTopColor: C.border,
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  footerLeft: {
    fontSize: 8,
    color: C.textLight,
  },
  footerRight: {
    fontSize: 8,
    color: C.textLight,
    fontFamily: "Helvetica-Bold",
  },
})

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface ProposalTierPdf {
  tier_level: string
  name: string
  description: string | null
  price: string
  features: string[] | null
}

export interface ProposalLineItemPdf {
  category: string
  description: string
  quantity: string
  unit_price: string
  total: string
  tier_id: string | null
}

export interface ProposalAddonPdf {
  name: string
  description: string | null
  price: string
}

export interface ProposalPaymentMilestonePdf {
  name: string
  percentage: string | null
  amount: string
}

export interface ProposalDocumentProps {
  proposalNumber: string
  proposalVersion: number
  proposalDate: string
  companyName: string
  companyLogoUrl?: string | null
  companyAddress?: string | null
  customerName: string
  customerAddress: string | null
  projectType: string
  projectDescription: string | null
  scopeDescription: string | null
  showLineItemDetail: boolean
  tiers: ProposalTierPdf[]
  lineItems: ProposalLineItemPdf[]
  addons: ProposalAddonPdf[]
  milestones: ProposalPaymentMilestonePdf[]
  totalAmount: string | null
  termsAndConditions: string | null
  warrantyInfo: string | null
  cancellationPolicy: string | null
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function formatCurrency(value: string | number | null | undefined): string {
  const num = parseFloat(String(value ?? "0")) || 0
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
  }).format(num)
}

const TIER_COLORS: Record<string, string> = {
  good: "#16a34a",
  better: "#2563eb",
  best: "#7c3aed",
}

const TIER_LABELS: Record<string, string> = {
  good: "Good",
  better: "Better",
  best: "Best",
}

// ---------------------------------------------------------------------------
// ProposalDocument
// ---------------------------------------------------------------------------

export function ProposalDocument(props: ProposalDocumentProps) {
  const {
    proposalNumber,
    proposalVersion,
    proposalDate,
    companyName,
    companyLogoUrl,
    companyAddress,
    customerName,
    customerAddress,
    projectType,
    projectDescription,
    scopeDescription,
    showLineItemDetail,
    tiers,
    lineItems,
    addons,
    milestones,
    totalAmount,
    termsAndConditions,
    warrantyInfo,
    cancellationPolicy,
  } = props

  // Group line items by category (for detailed view)
  const lineItemsByCategory: Record<string, ProposalLineItemPdf[]> = {}
  for (const li of lineItems) {
    if (!lineItemsByCategory[li.category]) {
      lineItemsByCategory[li.category] = []
    }
    lineItemsByCategory[li.category].push(li)
  }

  // Category totals (for summary view)
  const categoryTotals: Record<string, number> = {}
  for (const li of lineItems) {
    categoryTotals[li.category] = (categoryTotals[li.category] ?? 0) + (parseFloat(li.total) || 0)
  }

  const hasTiers = tiers.length > 0
  const hasAddons = addons.length > 0
  const hasMilestones = milestones.length > 0
  const hasLineItems = lineItems.length > 0

  const projectTypeLabel = projectType
    .replace(/_/g, " ")
    .replace(/\b\w/g, (c) => c.toUpperCase())

  return (
    <Document
      title={`Proposal #${proposalNumber}`}
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
            {companyAddress && (
              <Text style={styles.companyMeta}>{companyAddress}</Text>
            )}
          </View>
          <View style={styles.headerRight}>
            <Text style={styles.proposalLabel}>PROPOSAL #{proposalNumber}</Text>
            {proposalVersion > 1 && (
              <Text style={styles.proposalMeta}>Version {proposalVersion}</Text>
            )}
            <Text style={styles.proposalMeta}>Date: {proposalDate}</Text>
            <Text style={styles.proposalMeta}>Project: {projectTypeLabel}</Text>
          </View>
        </View>

        {/* ── Customer + Project Info (two-column) ─────────────────────── */}
        <View style={styles.twoColRow}>
          <View style={styles.twoColLeft}>
            <Text style={styles.sectionLabel}>Prepared for</Text>
            <Text style={styles.sectionText}>{customerName}</Text>
            {customerAddress && (
              <Text style={styles.sectionTextMuted}>{customerAddress}</Text>
            )}
          </View>
          <View style={styles.twoColRight}>
            <Text style={styles.sectionLabel}>Project Type</Text>
            <Text style={styles.sectionText}>{projectTypeLabel}</Text>
            {projectDescription && (
              <Text style={styles.sectionTextMuted}>{projectDescription}</Text>
            )}
          </View>
        </View>

        {/* ── Scope Description ────────────────────────────────────────── */}
        {scopeDescription && (
          <View style={styles.section}>
            <Text style={styles.sectionLabel}>Scope of Work</Text>
            <Text style={styles.sectionText}>{scopeDescription}</Text>
          </View>
        )}

        {/* ── Line Items (if any) ───────────────────────────────────────── */}
        {hasLineItems && (
          <View style={styles.sectionDivider}>
            <Text style={[styles.sectionLabel, { marginBottom: 8 }]}>
              {showLineItemDetail ? "Line Items" : "Cost Summary"}
            </Text>

            {showLineItemDetail ? (
              // Detailed view: grouped by category
              <View style={styles.table}>
                <View style={styles.tableHeader}>
                  <View style={styles.colCategory}>
                    <Text style={styles.tableHeaderText}>Category</Text>
                  </View>
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

                {Object.entries(lineItemsByCategory).map(([category, items]) => (
                  <View key={category}>
                    <View style={styles.categoryHeader}>
                      <Text style={styles.categoryHeaderText}>
                        {category.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase())}
                      </Text>
                    </View>
                    {items.map((item, i) => {
                      const isEven = i % 2 === 0
                      const rowStyle = isEven ? styles.tableRowEven : styles.tableRowOdd
                      return (
                        <View key={i} style={rowStyle}>
                          <View style={styles.colCategory}>
                            <Text style={styles.tableRowTextMuted}></Text>
                          </View>
                          <View style={styles.colDescription}>
                            <Text style={styles.tableRowText}>{item.description}</Text>
                          </View>
                          <View style={styles.colQty}>
                            <Text style={[styles.tableRowTextMuted, { textAlign: "right" }]}>
                              {parseFloat(item.quantity) || 1}
                            </Text>
                          </View>
                          <View style={styles.colUnitPrice}>
                            <Text style={[styles.tableRowTextMuted, { textAlign: "right" }]}>
                              {formatCurrency(item.unit_price)}
                            </Text>
                          </View>
                          <View style={styles.colTotal}>
                            <Text style={[styles.tableRowText, { textAlign: "right" }]}>
                              {formatCurrency(item.total)}
                            </Text>
                          </View>
                        </View>
                      )
                    })}
                  </View>
                ))}
              </View>
            ) : (
              // Summary view: one row per category, no line detail
              <View style={styles.table}>
                <View style={styles.tableHeader}>
                  <View style={styles.colDescriptionFull}>
                    <Text style={styles.tableHeaderText}>Category</Text>
                  </View>
                  <View style={styles.colTotal}>
                    <Text style={[styles.tableHeaderText, { textAlign: "right" }]}>
                      Amount
                    </Text>
                  </View>
                </View>
                {Object.entries(categoryTotals).map(([category, total], i) => {
                  const isEven = i % 2 === 0
                  const rowStyle = isEven ? styles.tableRowEven : styles.tableRowOdd
                  return (
                    <View key={category} style={rowStyle}>
                      <View style={styles.colDescriptionFull}>
                        <Text style={styles.tableRowText}>
                          {category.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase())}
                        </Text>
                      </View>
                      <View style={styles.colTotal}>
                        <Text style={[styles.tableRowText, { textAlign: "right" }]}>
                          {formatCurrency(total)}
                        </Text>
                      </View>
                    </View>
                  )
                })}
              </View>
            )}
          </View>
        )}

        {/* ── Good / Better / Best Tier Comparison ─────────────────────── */}
        {hasTiers && (
          <View style={styles.sectionDivider}>
            <Text style={[styles.sectionLabel, { marginBottom: 10 }]}>
              Package Options
            </Text>
            <View style={styles.tiersContainer}>
              {tiers.map((tier, idx) => {
                const isLast = idx === tiers.length - 1
                const tierColor = TIER_COLORS[tier.tier_level] ?? C.accent
                const tierLabel = TIER_LABELS[tier.tier_level] ?? tier.tier_level
                return (
                  <View key={tier.tier_level} style={isLast ? styles.tierColLast : styles.tierCol}>
                    <View style={[styles.tierBadge, { backgroundColor: tierColor }]}>
                      <Text style={styles.tierBadgeText}>{tierLabel.toUpperCase()}</Text>
                    </View>
                    <Text style={styles.tierName}>{tier.name}</Text>
                    <Text style={styles.tierPrice}>{formatCurrency(tier.price)}</Text>
                    {tier.description && (
                      <Text style={styles.tierDescription}>{tier.description}</Text>
                    )}
                    {tier.features && tier.features.length > 0 && (
                      <View>
                        {tier.features.map((feature, fi) => (
                          <View key={fi} style={styles.tierFeatureRow}>
                            <Text style={styles.tierFeatureDot}>&#10003;</Text>
                            <Text style={styles.tierFeatureText}>{feature}</Text>
                          </View>
                        ))}
                      </View>
                    )}
                  </View>
                )
              })}
            </View>
          </View>
        )}

        {/* ── Add-ons ──────────────────────────────────────────────────── */}
        {hasAddons && (
          <View style={styles.sectionDivider}>
            <Text style={[styles.sectionLabel, { marginBottom: 8 }]}>
              Optional Add-ons
            </Text>
            <View style={styles.table}>
              <View style={styles.tableHeader}>
                <View style={[styles.colDescription, { flex: 3 }]}>
                  <Text style={styles.tableHeaderText}>Add-on</Text>
                </View>
                <View style={[styles.colDescription, { flex: 3 }]}>
                  <Text style={styles.tableHeaderText}>Description</Text>
                </View>
                <View style={styles.colTotal}>
                  <Text style={[styles.tableHeaderText, { textAlign: "right" }]}>
                    Price
                  </Text>
                </View>
              </View>
              {addons.map((addon, i) => {
                const isEven = i % 2 === 0
                const rowStyle = isEven ? styles.tableRowEven : styles.tableRowOdd
                return (
                  <View key={i} style={rowStyle}>
                    <View style={[styles.colDescription, { flex: 3 }]}>
                      <Text style={styles.tableRowText}>{addon.name}</Text>
                    </View>
                    <View style={[styles.colDescription, { flex: 3 }]}>
                      <Text style={styles.tableRowTextMuted}>{addon.description ?? ""}</Text>
                    </View>
                    <View style={styles.colTotal}>
                      <Text style={[styles.tableRowText, { textAlign: "right" }]}>
                        {formatCurrency(addon.price)}
                      </Text>
                    </View>
                  </View>
                )
              })}
            </View>
          </View>
        )}

        {/* ── Total ───────────────────────────────────────────────────── */}
        {totalAmount && (
          <View style={styles.totalsContainer}>
            {hasTiers ? (
              <View style={styles.totalRow}>
                <Text style={styles.totalLabel}>Starting from</Text>
                <Text style={styles.totalValue}>{formatCurrency(totalAmount)}</Text>
              </View>
            ) : (
              <View style={styles.grandTotalRow}>
                <Text style={styles.grandTotalLabel}>Total Estimate</Text>
                <Text style={styles.grandTotalValue}>{formatCurrency(totalAmount)}</Text>
              </View>
            )}
          </View>
        )}

        {/* ── Payment Schedule ─────────────────────────────────────────── */}
        {hasMilestones && (
          <View style={styles.sectionDivider}>
            <Text style={[styles.sectionLabel, { marginBottom: 8 }]}>
              Payment Schedule
            </Text>
            <View style={styles.table}>
              <View style={styles.tableHeader}>
                <View style={{ flex: 3 }}>
                  <Text style={styles.tableHeaderText}>Milestone</Text>
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={[styles.tableHeaderText, { textAlign: "right" }]}>
                    %
                  </Text>
                </View>
                <View style={{ flex: 1.5 }}>
                  <Text style={[styles.tableHeaderText, { textAlign: "right" }]}>
                    Amount
                  </Text>
                </View>
              </View>
              {milestones.map((milestone, i) => {
                const isEven = i % 2 === 0
                const rowStyle = isEven ? styles.tableRowEven : styles.tableRowOdd
                return (
                  <View key={i} style={rowStyle}>
                    <View style={{ flex: 3 }}>
                      <Text style={styles.tableRowText}>{milestone.name}</Text>
                    </View>
                    <View style={{ flex: 1 }}>
                      <Text style={[styles.tableRowTextMuted, { textAlign: "right" }]}>
                        {milestone.percentage ? `${parseFloat(milestone.percentage).toFixed(0)}%` : ""}
                      </Text>
                    </View>
                    <View style={{ flex: 1.5 }}>
                      <Text style={[styles.tableRowText, { fontFamily: "Helvetica-Bold", textAlign: "right" }]}>
                        {formatCurrency(milestone.amount)}
                      </Text>
                    </View>
                  </View>
                )
              })}
            </View>
          </View>
        )}

        {/* ── Terms & Conditions ───────────────────────────────────────── */}
        {termsAndConditions && (
          <View style={styles.legalContainer}>
            <Text style={styles.legalTitle}>Terms &amp; Conditions</Text>
            <Text style={styles.legalText}>{termsAndConditions}</Text>
          </View>
        )}

        {/* ── Warranty Info ────────────────────────────────────────────── */}
        {warrantyInfo && (
          <View style={styles.legalContainer}>
            <Text style={styles.legalTitle}>Warranty</Text>
            <Text style={styles.legalText}>{warrantyInfo}</Text>
          </View>
        )}

        {/* ── Cancellation Policy ──────────────────────────────────────── */}
        {cancellationPolicy && (
          <View style={styles.legalContainer}>
            <Text style={styles.legalTitle}>Cancellation Policy</Text>
            <Text style={styles.legalText}>{cancellationPolicy}</Text>
          </View>
        )}

        {/* ── Signature Block ──────────────────────────────────────────── */}
        <View style={styles.signatureBlock}>
          <View style={styles.signatureCol}>
            <View style={styles.signatureLine} />
            <Text style={styles.signatureLabel}>Customer Signature</Text>
            <Text style={[styles.signatureLabel, { marginTop: 4 }]}>{customerName}</Text>
          </View>
          <View style={styles.signatureColRight}>
            <View style={styles.signatureLine} />
            <Text style={styles.signatureLabel}>Date</Text>
          </View>
        </View>
        <View style={{ marginTop: 6, marginBottom: 16 }}>
          <Text style={[styles.sectionTextMuted, { fontSize: 8 }]}>
            By signing above, you acknowledge and agree to the terms set forth in this proposal. This signature is for record-keeping only — your digital approval on the proposal approval page serves as the binding agreement.
          </Text>
        </View>

        {/* ── Footer ──────────────────────────────────────────────────── */}
        <View style={styles.footer}>
          <Text style={styles.footerLeft}>
            {companyName} — Proposal #{proposalNumber}
          </Text>
          <Text style={styles.footerRight}>Powered by DeweyIQ</Text>
        </View>

      </Page>
    </Document>
  )
}
