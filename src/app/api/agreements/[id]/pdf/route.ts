/**
 * src/app/api/agreements/[id]/pdf/route.ts — PDF download route.
 *
 * Supports two authentication modes:
 *   1. Authenticated session (office/owner) — standard admin access
 *   2. Token query param (?token=JWT) — public customer access from approval page
 *
 * GET /api/agreements/[id]/pdf
 * GET /api/agreements/[id]/pdf?token=<JWT>
 * Returns: application/pdf with Content-Disposition attachment
 */

import { redirect } from "next/navigation"
import { createElement } from "react"
import { renderToBuffer } from "@react-pdf/renderer"
import { getCurrentUser } from "@/actions/auth"
import { adminDb } from "@/lib/db"
import {
  serviceAgreements,
  agreementPoolEntries,
  customers,
  orgs,
  pools,
} from "@/lib/db/schema"
import { eq, and } from "drizzle-orm"
import { AgreementDocument } from "@/lib/pdf/agreement-pdf"
import type { AgreementDocumentProps, AgreementPoolEntryPdfData } from "@/lib/pdf/agreement-pdf"
import { verifyAgreementToken } from "@/lib/agreements/agreement-token"

export async function GET(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params
  const url = new URL(req.url)
  const tokenParam = url.searchParams.get("token")

  // ── Auth: token-based (public customer access) ──────────────────────────
  if (tokenParam) {
    const tokenPayload = await verifyAgreementToken(tokenParam)
    if (!tokenPayload || tokenPayload.agreementId !== id) {
      return new Response("Invalid or expired link.", { status: 401 })
    }
    // Token valid — generate PDF without org_id restriction
    try {
      return await _generatePdfResponse(id)
    } catch (err) {
      console.error("[GET /api/agreements/[id]/pdf] Token path error:", err)
      return new Response("Failed to generate PDF", { status: 500 })
    }
  }

  // ── Auth: authenticated session (office/owner) ──────────────────────────
  const user = await getCurrentUser()
  if (!user) {
    redirect("/login")
  }

  if (user.role !== "owner" && user.role !== "office") {
    return new Response("Forbidden", { status: 403 })
  }

  try {
    // Verify the agreement belongs to the user's org
    const checkRows = await adminDb
      .select({ id: serviceAgreements.id })
      .from(serviceAgreements)
      .where(
        and(
          eq(serviceAgreements.id, id),
          eq(serviceAgreements.org_id, user.org_id)
        )
      )
      .limit(1)

    if (!checkRows[0]) {
      return new Response("Agreement not found", { status: 404 })
    }

    return await _generatePdfResponse(id)
  } catch (err) {
    console.error("[GET /api/agreements/[id]/pdf] Auth path error:", err)
    return new Response("Failed to generate PDF", { status: 500 })
  }
}

// ── Shared PDF generation helper ───────────────────────────────────────────────

async function _generatePdfResponse(agreementId: string): Promise<Response> {
  // ── Fetch agreement ────────────────────────────────────────────────────────
  const agreementRows = await adminDb
    .select()
    .from(serviceAgreements)
    .where(eq(serviceAgreements.id, agreementId))
    .limit(1)

  const agreement = agreementRows[0]
  if (!agreement) {
    return new Response("Agreement not found", { status: 404 })
  }

  // ── Fetch customer ─────────────────────────────────────────────────────────
  const customerRows = await adminDb
    .select({
      full_name: customers.full_name,
      email: customers.email,
      phone: customers.phone,
      address: customers.address,
    })
    .from(customers)
    .where(eq(customers.id, agreement.customer_id))
    .limit(1)

  const customer = customerRows[0]

  // ── Fetch org branding ─────────────────────────────────────────────────────
  const orgRows = await adminDb
    .select({ name: orgs.name, logo_url: orgs.logo_url })
    .from(orgs)
    .where(eq(orgs.id, agreement.org_id))
    .limit(1)

  const org = orgRows[0]
  const companyName = org?.name ?? "Pool Company"
  const companyLogoUrl = org?.logo_url ?? null

  // ── Fetch pool entries with pool data ──────────────────────────────────────
  const entryRows = await adminDb
    .select({
      id: agreementPoolEntries.id,
      pool_id: agreementPoolEntries.pool_id,
      frequency: agreementPoolEntries.frequency,
      preferred_day_of_week: agreementPoolEntries.preferred_day_of_week,
      pricing_model: agreementPoolEntries.pricing_model,
      monthly_amount: agreementPoolEntries.monthly_amount,
      per_visit_amount: agreementPoolEntries.per_visit_amount,
      tiered_threshold_visits: agreementPoolEntries.tiered_threshold_visits,
      tiered_base_amount: agreementPoolEntries.tiered_base_amount,
      tiered_overage_amount: agreementPoolEntries.tiered_overage_amount,
      notes: agreementPoolEntries.notes,
      pool_name: pools.name,
      pool_type: pools.type,
    })
    .from(agreementPoolEntries)
    .innerJoin(pools, eq(pools.id, agreementPoolEntries.pool_id))
    .where(eq(agreementPoolEntries.agreement_id, agreementId))

  // ── Build PDF props ────────────────────────────────────────────────────────
  const pdfPoolEntries: AgreementPoolEntryPdfData[] = entryRows.map((row) => ({
    poolId: row.pool_id,
    poolName: row.pool_name,
    poolType: row.pool_type ?? "pool",
    frequency: row.frequency,
    preferredDayOfWeek: row.preferred_day_of_week,
    pricingModel: row.pricing_model,
    monthlyAmount: row.monthly_amount,
    perVisitAmount: row.per_visit_amount,
    tieredThresholdVisits: row.tiered_threshold_visits,
    tieredBaseAmount: row.tiered_base_amount,
    tieredOverageAmount: row.tiered_overage_amount,
    notes: row.notes,
  }))

  const createdDate = (agreement.created_at ?? new Date()).toLocaleDateString(
    "en-US",
    { year: "numeric", month: "long", day: "numeric" }
  )

  const documentProps: AgreementDocumentProps = {
    agreementNumber: agreement.agreement_number,
    createdDate,
    termType: agreement.term_type,
    startDate: agreement.start_date,
    endDate: agreement.end_date,
    autoRenew: agreement.auto_renew,
    companyName,
    companyLogoUrl,
    customerName: customer?.full_name ?? "Customer",
    customerEmail: customer?.email ?? null,
    customerPhone: customer?.phone ?? null,
    serviceAddress: customer?.address ?? null,
    poolEntries: pdfPoolEntries,
    termsAndConditions: agreement.terms_and_conditions ?? null,
    cancellationPolicy: agreement.cancellation_policy ?? null,
    liabilityWaiver: agreement.liability_waiver ?? null,
  }

  // ── Generate PDF ───────────────────────────────────────────────────────────
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const buffer = await renderToBuffer(
    createElement(AgreementDocument, documentProps) as any
  )

  const filename = `agreement-${agreement.agreement_number}.pdf`
  const uint8Array = new Uint8Array(buffer)

  return new Response(uint8Array, {
    status: 200,
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `attachment; filename="${filename}"`,
      "Cache-Control": "private, no-cache",
    },
  })
}
