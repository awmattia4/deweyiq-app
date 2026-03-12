/**
 * template-engine.ts -- Merge tag resolution engine for notification templates.
 *
 * Exports:
 * - MERGE_TAGS: descriptor array for the template editor UI (tag, description, example)
 * - resolveTemplate: replaces {{tag}} placeholders with context values
 *
 * Special tags:
 * - {{review_link_section}}: renders a "Leave us a review" block if review_link is set, else empty
 * - {{custom_footer}}: renders org's custom footer or empty string
 * - {{sms_signature}}: renders custom SMS signature or fallback "-- Company Name"
 */

// ---------------------------------------------------------------------------
// MERGE_TAGS — available tags for the template editor UI
// ---------------------------------------------------------------------------

export const MERGE_TAGS = [
  { tag: "{{customer_name}}", description: "Customer's full name", example: "John Smith" },
  { tag: "{{company_name}}", description: "Your company name", example: "Blue Wave Pools" },
  { tag: "{{tech_name}}", description: "Assigned technician name", example: "Mike Johnson" },
  { tag: "{{invoice_number}}", description: "Invoice number", example: "INV-0042" },
  { tag: "{{invoice_total}}", description: "Invoice total amount", example: "$285.00" },
  { tag: "{{due_date}}", description: "Invoice due date", example: "Apr 15, 2026" },
  { tag: "{{billing_period}}", description: "Service period range", example: "Mar 1 - Mar 31, 2026" },
  { tag: "{{payment_link}}", description: "Payment page URL", example: "https://app.poolco.com/pay/abc123" },
  { tag: "{{quote_link}}", description: "Quote approval URL", example: "https://app.poolco.com/quote/abc123" },
  { tag: "{{report_link}}", description: "Service report URL", example: "https://app.poolco.com/api/reports/abc123" },
  { tag: "{{review_link}}", description: "Google review URL (from settings)", example: "https://g.page/r/..." },
  { tag: "{{website_link}}", description: "Company website URL (from settings)", example: "https://bluewavepools.com" },
  { tag: "{{review_link_section}}", description: "Review link block (hidden if no URL set)", example: "Leave us a review!" },
  { tag: "{{custom_footer}}", description: "Custom email footer text (from settings)", example: "Licensed & Insured | Serving Phoenix since 2015" },
  { tag: "{{sms_signature}}", description: "SMS sign-off (from settings)", example: "-- Blue Wave Pools" },
] as const

// ---------------------------------------------------------------------------
// resolveTemplate
// ---------------------------------------------------------------------------

/**
 * Replaces all {{key}} merge tags in a template string with values from context.
 *
 * Special handling:
 * - {{review_link_section}}: if context.review_link is non-empty, renders a review block.
 *   Otherwise renders empty string.
 * - {{custom_footer}}: renders the value or empty string.
 * - {{sms_signature}}: renders the value or falls back to "-- {{company_name}}"
 *   (which itself gets resolved).
 *
 * After all replacements, any remaining unresolved {{...}} tags are stripped
 * as a safety net (prevents template syntax from leaking to customers).
 */
export function resolveTemplate(
  template: string,
  context: Record<string, string>
): string {
  let result = template

  // Handle {{review_link_section}} first since it may contain sub-tags
  const reviewLink = context.review_link ?? ""
  if (reviewLink) {
    result = result.replace(
      /\{\{review_link_section\}\}/g,
      `Leave us a review: ${reviewLink}`
    )
  } else {
    result = result.replace(/\{\{review_link_section\}\}/g, "")
  }

  // Handle {{custom_footer}} — render value or empty
  const customFooter = context.custom_footer ?? ""
  result = result.replace(/\{\{custom_footer\}\}/g, customFooter)

  // Handle {{sms_signature}} — render value or fallback
  const smsSignature = context.sms_signature ?? ""
  if (smsSignature) {
    result = result.replace(/\{\{sms_signature\}\}/g, smsSignature)
  } else {
    const companyName = context.company_name ?? ""
    result = result.replace(
      /\{\{sms_signature\}\}/g,
      companyName ? `-- ${companyName}` : ""
    )
  }

  // Replace all remaining {{key}} tags with context values
  for (const [key, value] of Object.entries(context)) {
    // Skip the special tags already handled above
    if (key === "review_link_section" || key === "custom_footer" || key === "sms_signature") {
      continue
    }
    const regex = new RegExp(`\\{\\{${key}\\}\\}`, "g")
    result = result.replace(regex, value)
  }

  // Strip any unresolved {{...}} tags (safety net)
  result = result.replace(/\{\{[^}]+\}\}/g, "")

  return result
}
