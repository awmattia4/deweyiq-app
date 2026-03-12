/**
 * default-templates.ts -- Hardcoded default templates for all notification types.
 *
 * These are used when an org has not customized a particular template type.
 * Every email template includes {{custom_footer}} and {{review_link_section}}
 * placeholders at the bottom. Every SMS template includes {{sms_signature}}.
 *
 * Template types correspond 1:1 with the notification_templates.template_type column.
 */

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface DefaultTemplate {
  subject?: string
  body_html?: string
  sms_text?: string
}

export type TemplateType =
  | "service_report_email"
  | "pre_arrival_email"
  | "pre_arrival_sms"
  | "quote_email"
  | "quote_sms"
  | "invoice_email"
  | "invoice_sms"
  | "receipt_email"
  | "dunning_email"
  | "autopay_confirmation_email"

// ---------------------------------------------------------------------------
// Template type metadata (labels for the UI)
// ---------------------------------------------------------------------------

export const TEMPLATE_TYPE_META: Record<TemplateType, { label: string; channel: "email" | "sms" }> = {
  service_report_email: { label: "Service Report", channel: "email" },
  pre_arrival_email: { label: "Pre-Arrival", channel: "email" },
  pre_arrival_sms: { label: "Pre-Arrival SMS", channel: "sms" },
  quote_email: { label: "Quote", channel: "email" },
  quote_sms: { label: "Quote SMS", channel: "sms" },
  invoice_email: { label: "Invoice", channel: "email" },
  invoice_sms: { label: "Invoice SMS", channel: "sms" },
  receipt_email: { label: "Payment Receipt", channel: "email" },
  dunning_email: { label: "Payment Reminder", channel: "email" },
  autopay_confirmation_email: { label: "AutoPay Confirmation", channel: "email" },
}

export const ALL_TEMPLATE_TYPES: TemplateType[] = [
  "service_report_email",
  "pre_arrival_email",
  "pre_arrival_sms",
  "quote_email",
  "quote_sms",
  "invoice_email",
  "invoice_sms",
  "receipt_email",
  "dunning_email",
  "autopay_confirmation_email",
]

// ---------------------------------------------------------------------------
// Default templates
// ---------------------------------------------------------------------------

export const DEFAULT_TEMPLATES: Record<TemplateType, DefaultTemplate> = {
  service_report_email: {
    subject: "Service Report for {{customer_name}}",
    body_html: `Hi {{customer_name}},

Your pool was serviced today by {{tech_name}}. A full service report is available at the link below.

View Full Report: {{report_link}}

{{review_link_section}}

{{custom_footer}}`,
  },

  pre_arrival_email: {
    subject: "{{company_name}} -- Service Today",
    body_html: `Hi {{customer_name}},

Your pool technician {{tech_name}} is heading your way. Please make sure your gate is accessible.

No action needed -- this is an automated notification.

{{custom_footer}}`,
  },

  pre_arrival_sms: {
    sms_text: `{{company_name}}: Your pool tech is on the way! {{tech_name}} will arrive shortly. {{sms_signature}}`,
  },

  quote_email: {
    subject: "Quote from {{company_name}}",
    body_html: `Hi {{customer_name}},

{{company_name}} has prepared a quote for your review. Please click the link below to view the details and approve.

View & Approve Quote: {{quote_link}}

The full quote is also attached as a PDF to this email.

{{review_link_section}}

{{custom_footer}}`,
  },

  quote_sms: {
    sms_text: `{{company_name}}: You have a new quote ready. View & approve: {{quote_link}} {{sms_signature}}`,
  },

  invoice_email: {
    subject: "Invoice {{invoice_number}} from {{company_name}}",
    body_html: `Hi {{customer_name}},

{{company_name}} has sent you an invoice for {{invoice_total}}.

Invoice Number: {{invoice_number}}
Amount Due: {{invoice_total}}
Due Date: {{due_date}}

Pay online: {{payment_link}}

The full invoice is also attached as a PDF to this email.

{{review_link_section}}

{{custom_footer}}`,
  },

  invoice_sms: {
    sms_text: `{{company_name}}: Invoice {{invoice_number}} for {{invoice_total}} is ready. Pay online: {{payment_link}} {{sms_signature}}`,
  },

  receipt_email: {
    subject: "Payment Receipt from {{company_name}}",
    body_html: `Hi {{customer_name}},

Thank you for your payment of {{invoice_total}} for Invoice #{{invoice_number}}. This email serves as your receipt.

{{review_link_section}}

{{custom_footer}}`,
  },

  dunning_email: {
    subject: "Payment Reminder -- Invoice {{invoice_number}}",
    body_html: `Hi {{customer_name}},

Your payment of {{invoice_total}} for Invoice #{{invoice_number}} is overdue. Please pay at your earliest convenience.

Pay online: {{payment_link}}

{{custom_footer}}`,
  },

  autopay_confirmation_email: {
    subject: "AutoPay Enabled -- {{company_name}}",
    body_html: `Hi {{customer_name}},

AutoPay has been enabled on your account with {{company_name}}. Your saved payment method will be charged automatically when new invoices are generated.

If you have any questions or need to make changes, please contact us.

{{custom_footer}}`,
  },
}
