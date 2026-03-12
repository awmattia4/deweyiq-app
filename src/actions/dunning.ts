"use server"

/**
 * dunning.ts -- Dunning scan logic, retry scheduling, email dispatch.
 *
 * Phase 7: Billing & Payments -- Plan 05
 *
 * Key patterns:
 * - runDunningScan: scans overdue invoices, sends dunning emails, retries AutoPay
 * - retryPayment: creates a new off-session PaymentIntent for AutoPay customers
 * - getDunningConfig: fetches dunning configuration for an org
 * - updateDunningConfig: owner-only upsert of dunning steps
 *
 * NOTE on Stripe Smart Retries: Smart Retries only work with Stripe Billing
 * (Subscriptions/Invoices). This project uses standalone PaymentIntents (direct
 * charges on connected accounts), so manual retry logic is the CORRECT approach.
 *
 * Uses adminDb for scan/retry (cron job has no user session).
 * Uses withRls for getDunningConfig/updateDunningConfig (settings UI context).
 */

import { revalidatePath } from "next/cache"
import { createClient } from "@/lib/supabase/server"
import { withRls, adminDb } from "@/lib/db"
import type { SupabaseToken } from "@/lib/db"
import {
  invoices,
  customers,
  orgSettings,
  orgs,
  dunningConfig,
  paymentRecords,
} from "@/lib/db/schema"
import type { DunningStep } from "@/lib/db/schema/dunning"
import { eq, and, or, lte, sql, isNotNull } from "drizzle-orm"
import { createElement } from "react"
import { render as renderEmail } from "@react-email/render"
import { DunningEmail } from "@/lib/emails/dunning-email"
import { Resend } from "resend"
import { signPayToken } from "@/lib/pay-token"
import { chargeAutoPay } from "@/actions/payments"
import { getResolvedTemplate } from "@/actions/notification-templates"

// ---------------------------------------------------------------------------
// Default dunning steps
// ---------------------------------------------------------------------------

const DEFAULT_STEPS: DunningStep[] = [
  {
    day_offset: 3,
    email_subject: "Payment Reminder: Invoice {number}",
    email_body: "",
  },
  {
    day_offset: 7,
    email_subject: "Second Notice: Invoice {number}",
    email_body: "",
  },
  {
    day_offset: 14,
    email_subject: "Final Notice: Invoice {number}",
    email_body: "",
  },
]

const DEFAULT_MAX_RETRIES = 3

// ---------------------------------------------------------------------------
// Auth helper
// ---------------------------------------------------------------------------

async function getRlsToken(): Promise<SupabaseToken | null> {
  const supabase = await createClient()
  const { data: claimsData } = await supabase.auth.getClaims()
  if (!claimsData?.claims) return null
  return claimsData.claims as SupabaseToken
}

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface DunningScanResult {
  orgsScanned: number
  invoicesScanned: number
  emailsSent: number
  retriesAttempted: number
  errors: string[]
}

// ---------------------------------------------------------------------------
// runDunningScan
// ---------------------------------------------------------------------------

/**
 * Scans for overdue invoices and processes dunning steps.
 * For each overdue invoice:
 * - Determines which dunning step applies based on days since due_date
 * - Sends dunning reminder email if a step matches and hasn't been sent
 * - For AutoPay customers, also retries the payment
 *
 * Uses adminDb -- called from cron job (no user session).
 */
export async function runDunningScan(
  orgId?: string
): Promise<DunningScanResult> {
  const result: DunningScanResult = {
    orgsScanned: 0,
    invoicesScanned: 0,
    emailsSent: 0,
    retriesAttempted: 0,
    errors: [],
  }

  try {
    // -- 1. Get orgs to scan ------------------------------------------------
    let orgIds: string[]

    if (orgId) {
      orgIds = [orgId]
    } else {
      // Scan all orgs with dunning_config
      const configs = await adminDb
        .select({ org_id: dunningConfig.org_id })
        .from(dunningConfig)

      orgIds = configs.map((c) => c.org_id)

      // Also scan orgs that have no dunning_config (use defaults)
      const allSettings = await adminDb
        .select({ org_id: orgSettings.org_id })
        .from(orgSettings)
        .where(isNotNull(orgSettings.stripe_account_id))

      const configOrgSet = new Set(orgIds)
      for (const s of allSettings) {
        if (!configOrgSet.has(s.org_id)) {
          orgIds.push(s.org_id)
        }
      }
    }

    // -- 2. Process each org ------------------------------------------------
    for (const scanOrgId of orgIds) {
      try {
        result.orgsScanned++

        // Load dunning config for this org
        const [config] = await adminDb
          .select()
          .from(dunningConfig)
          .where(eq(dunningConfig.org_id, scanOrgId))
          .limit(1)

        const steps: DunningStep[] =
          config?.steps && Array.isArray(config.steps) && config.steps.length > 0
            ? config.steps
            : DEFAULT_STEPS

        const maxRetries = config?.max_retries ?? DEFAULT_MAX_RETRIES

        // Load org info for emails
        const [org] = await adminDb
          .select({ name: orgs.name })
          .from(orgs)
          .where(eq(orgs.id, scanOrgId))
          .limit(1)

        if (!org) continue

        // Find overdue invoices (status = 'overdue' or status = 'sent' with due_date past)
        const now = new Date()
        const todayStr = now.toISOString().split("T")[0]

        const overdueInvoices = await adminDb
          .select()
          .from(invoices)
          .where(
            and(
              eq(invoices.org_id, scanOrgId),
              or(
                eq(invoices.status, "overdue"),
                and(
                  eq(invoices.status, "sent"),
                  lte(invoices.due_date, todayStr)
                )
              )
            )
          )

        for (const invoice of overdueInvoices) {
          result.invoicesScanned++

          if (!invoice.due_date) continue

          // Count existing payment attempts
          const attempts = await adminDb
            .select({ count: sql<number>`count(*)::int` })
            .from(paymentRecords)
            .where(eq(paymentRecords.invoice_id, invoice.id))

          const attemptCount = attempts[0]?.count ?? 0

          if (attemptCount >= maxRetries) {
            // Max retries reached -- skip
            continue
          }

          // Calculate days since due date
          const dueDate = new Date(invoice.due_date + "T00:00:00")
          const daysSinceDue = Math.floor(
            (now.getTime() - dueDate.getTime()) / (1000 * 60 * 60 * 24)
          )

          if (daysSinceDue < 0) continue // Not yet due

          // Find applicable dunning step (1-day window for cron timing)
          const applicableStep = steps.find(
            (step) =>
              daysSinceDue >= step.day_offset &&
              daysSinceDue <= step.day_offset + 1
          )

          if (!applicableStep) continue

          // Check if we already sent this step (simple: check if attempt_count >= step index + 1)
          const stepIndex = steps.indexOf(applicableStep)
          // Use a simple heuristic: if we've already sent more emails than this step index, skip
          // We track dunning progress via payment_records attempt_count
          if (attemptCount > stepIndex) continue

          // Fetch customer for email
          const [customer] = await adminDb
            .select()
            .from(customers)
            .where(eq(customers.id, invoice.customer_id))
            .limit(1)

          if (!customer) continue

          // Generate pay token for the payment link
          const payToken = await signPayToken(invoice.id)
          const appUrl = process.env.NEXT_PUBLIC_APP_URL || process.env.VERCEL_URL || "http://localhost:3000"
          const paymentUrl = `${appUrl}/pay/${payToken}`

          // Format amount
          const totalFormatted = new Intl.NumberFormat("en-US", {
            style: "currency",
            currency: "USD",
          }).format(parseFloat(invoice.total))

          // -- Send dunning email -------------------------------------------
          if (customer.email) {
            try {
              // Resolve org-level notification template for dunning_email
              const dunningTemplate = await getResolvedTemplate(scanOrgId, "dunning_email", {
                customer_name: customer.full_name,
                company_name: org.name,
                invoice_number: invoice.invoice_number ?? "N/A",
                invoice_total: totalFormatted,
                payment_link: paymentUrl,
              })

              // If dunning_email template is disabled, skip email entirely
              if (!dunningTemplate) continue

              // Subject priority: step-level > org-level template > default
              const emailSubject = (applicableStep.email_subject || dunningTemplate.subject || "Payment Reminder: Invoice {number}")
                .replace("{number}", invoice.invoice_number ?? "N/A")

              // Body priority: step-level > org-level template
              const customBody = applicableStep.email_body || dunningTemplate.body_html || null

              const emailHtml = await renderEmail(
                createElement(DunningEmail, {
                  companyName: org.name,
                  customerName: customer.full_name,
                  invoiceNumber: invoice.invoice_number ?? "N/A",
                  totalAmount: totalFormatted,
                  paymentUrl,
                  stepNumber: stepIndex + 1,
                  maxSteps: steps.length,
                  customBody,
                })
              )

              const resendApiKey = process.env.RESEND_API_KEY
              if (resendApiKey) {
                const resend = new Resend(resendApiKey)
                await resend.emails.send({
                  from: `${org.name} <billing@poolco.app>`,
                  to: [customer.email],
                  subject: emailSubject,
                  html: emailHtml,
                })
                result.emailsSent++
                console.log(
                  `[runDunningScan] Dunning email step ${stepIndex + 1} sent to:`,
                  customer.email,
                  "for invoice:",
                  invoice.id
                )
              }
            } catch (emailErr) {
              const msg = `Email failed for invoice ${invoice.id}: ${emailErr instanceof Error ? emailErr.message : "Unknown"}`
              result.errors.push(msg)
              console.error("[runDunningScan]", msg)
            }
          }

          // -- Retry payment for AutoPay customers --------------------------
          if (customer.autopay_enabled && customer.autopay_method_id) {
            try {
              const retryResult = await chargeAutoPay(invoice.id)
              result.retriesAttempted++
              if (retryResult.success) {
                console.log("[runDunningScan] AutoPay retry succeeded for invoice:", invoice.id)
              } else {
                console.warn("[runDunningScan] AutoPay retry failed:", retryResult.error)
              }
            } catch (retryErr) {
              const msg = `Retry failed for invoice ${invoice.id}: ${retryErr instanceof Error ? retryErr.message : "Unknown"}`
              result.errors.push(msg)
              console.error("[runDunningScan]", msg)
            }
          }

          // Mark invoice as overdue if it was still "sent"
          if (invoice.status === "sent") {
            await adminDb
              .update(invoices)
              .set({ status: "overdue", updated_at: new Date() })
              .where(eq(invoices.id, invoice.id))
          }
        }
      } catch (orgErr) {
        const msg = `Org ${scanOrgId}: ${orgErr instanceof Error ? orgErr.message : "Unknown error"}`
        result.errors.push(msg)
        console.error("[runDunningScan]", msg)
      }
    }

    console.log("[runDunningScan] Complete:", JSON.stringify(result))
    return result
  } catch (err) {
    console.error("[runDunningScan] Fatal error:", err)
    return {
      ...result,
      errors: [...result.errors, err instanceof Error ? err.message : "Fatal error"],
    }
  }
}

// ---------------------------------------------------------------------------
// retryPayment
// ---------------------------------------------------------------------------

/**
 * Retries a payment for an overdue invoice.
 * If customer has AutoPay, creates a new off-session PaymentIntent.
 * Uses adminDb (called from dunning scan / cron).
 */
export async function retryPayment(
  invoiceId: string
): Promise<{ success: boolean; error?: string }> {
  try {
    const [invoice] = await adminDb
      .select({ customer_id: invoices.customer_id })
      .from(invoices)
      .where(eq(invoices.id, invoiceId))
      .limit(1)

    if (!invoice) return { success: false, error: "Invoice not found" }

    const [customer] = await adminDb
      .select({
        autopay_enabled: customers.autopay_enabled,
        autopay_method_id: customers.autopay_method_id,
      })
      .from(customers)
      .where(eq(customers.id, invoice.customer_id))
      .limit(1)

    if (!customer?.autopay_enabled || !customer.autopay_method_id) {
      return { success: false, error: "Customer does not have AutoPay enabled" }
    }

    return chargeAutoPay(invoiceId)
  } catch (err) {
    console.error("[retryPayment] Error:", err)
    return {
      success: false,
      error: err instanceof Error ? err.message : "Failed to retry payment",
    }
  }
}

// ---------------------------------------------------------------------------
// getDunningConfig
// ---------------------------------------------------------------------------

/**
 * Fetches dunning configuration for the current user's org.
 * Returns defaults if no config exists.
 */
export async function getDunningConfig(): Promise<{
  steps: DunningStep[]
  maxRetries: number
}> {
  const token = await getRlsToken()
  if (!token) return { steps: DEFAULT_STEPS, maxRetries: DEFAULT_MAX_RETRIES }

  const orgId = token.org_id as string
  if (!orgId) return { steps: DEFAULT_STEPS, maxRetries: DEFAULT_MAX_RETRIES }

  try {
    const [config] = await withRls(token, (db) =>
      db
        .select()
        .from(dunningConfig)
        .where(eq(dunningConfig.org_id, orgId))
        .limit(1)
    )

    if (!config) {
      return { steps: DEFAULT_STEPS, maxRetries: DEFAULT_MAX_RETRIES }
    }

    return {
      steps:
        config.steps && Array.isArray(config.steps) && config.steps.length > 0
          ? config.steps
          : DEFAULT_STEPS,
      maxRetries: config.max_retries ?? DEFAULT_MAX_RETRIES,
    }
  } catch (err) {
    console.error("[getDunningConfig] Error:", err)
    return { steps: DEFAULT_STEPS, maxRetries: DEFAULT_MAX_RETRIES }
  }
}

// ---------------------------------------------------------------------------
// updateDunningConfig
// ---------------------------------------------------------------------------

/**
 * Upserts dunning configuration for the current user's org.
 * Owner only.
 */
export async function updateDunningConfig(
  steps: DunningStep[],
  maxRetries: number
): Promise<{ success: boolean; error?: string }> {
  const token = await getRlsToken()
  if (!token) return { success: false, error: "Not authenticated" }

  const userRole = token.user_role as string | undefined
  if (userRole !== "owner") {
    return { success: false, error: "Only owners can update dunning settings" }
  }

  const orgId = token.org_id as string
  if (!orgId) return { success: false, error: "No org found" }

  // Validate
  if (maxRetries < 1 || maxRetries > 10) {
    return { success: false, error: "Max retries must be between 1 and 10" }
  }

  if (steps.length > 5) {
    return { success: false, error: "Maximum 5 dunning steps allowed" }
  }

  for (const step of steps) {
    if (step.day_offset <= 0) {
      return { success: false, error: "Day offset must be greater than 0" }
    }
  }

  try {
    // Check if config exists
    const existing = await withRls(token, (db) =>
      db
        .select({ id: dunningConfig.id })
        .from(dunningConfig)
        .where(eq(dunningConfig.org_id, orgId))
        .limit(1)
    )

    const now = new Date()

    if (existing.length > 0) {
      await withRls(token, (db) =>
        db
          .update(dunningConfig)
          .set({
            steps,
            max_retries: maxRetries,
            updated_at: now,
          })
          .where(eq(dunningConfig.org_id, orgId))
      )
    } else {
      await withRls(token, (db) =>
        db.insert(dunningConfig).values({
          org_id: orgId,
          steps,
          max_retries: maxRetries,
          created_at: now,
          updated_at: now,
        })
      )
    }

    revalidatePath("/settings")
    return { success: true }
  } catch (err) {
    console.error("[updateDunningConfig] Error:", err)
    return {
      success: false,
      error: err instanceof Error ? err.message : "Failed to update dunning config",
    }
  }
}
