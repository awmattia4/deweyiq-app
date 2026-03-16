import type { Metadata } from "next"
import { redirect } from "next/navigation"
import { getCurrentUser } from "@/actions/auth"
import { getInvoices, getCustomerPhonesForInvoices, getBillingInsights } from "@/actions/invoices"
import {
  getCollectionsDashboard,
  getPaymentPlans,
  getAllCustomerCredits,
} from "@/actions/payment-reconciliation"
import { BillingPageClient } from "@/components/billing/billing-page-client"
import { withRls } from "@/lib/db"
import { createClient } from "@/lib/supabase/server"
import { customers, invoices } from "@/lib/db/schema"
import { and, eq, isNull, sql } from "drizzle-orm"

export const metadata: Metadata = {
  title: "Billing",
}

/**
 * BillingPage — Top-level billing page for invoice management and generation.
 *
 * Role guard: owner and office only.
 * Fetches all invoices, customer phone data, billing insights, payment plans,
 * customer credits, and collections dashboard data.
 *
 * Tab structure:
 *   Invoices | Collections | Payment Plans | Credits
 */
export default async function BillingPage() {
  const user = await getCurrentUser()

  if (!user) redirect("/login")
  if (user.role === "tech") redirect("/routes")
  if (user.role === "customer") redirect("/portal")

  const isOwner = user.role === "owner"

  // Parallel fetch all billing data
  const [invoiceList, insights, collectionsDashboard, paymentPlans, credits] = await Promise.all([
    getInvoices(),
    getBillingInsights(),
    isOwner ? getCollectionsDashboard() : Promise.resolve(null),
    getPaymentPlans(),
    getAllCustomerCredits(),
  ])

  // Fetch customer phones for SMS option gating
  const customerPhones =
    invoiceList.length > 0
      ? await getCustomerPhonesForInvoices(
          invoiceList.map((inv) => inv.customer_id)
        )
      : {}

  // Fetch customer list for the credits form (owner/office can issue credits)
  let customerList: Array<{ id: string; full_name: string }> = []
  try {
    const supabase = await createClient()
    const { data: claimsData } = await supabase.auth.getClaims()
    if (claimsData?.claims) {
      const token = claimsData.claims as import("@/lib/db").SupabaseToken
      customerList = await withRls(token, async (db) =>
        db
          .select({ id: customers.id, full_name: customers.full_name })
          .from(customers)
          .where(eq(customers.status, "active"))
          .orderBy(customers.full_name)
      )
    }
  } catch {
    // Non-blocking — credits form will show empty customer list
  }

  // Fetch open invoices for payment plan creation (unpaid, sentable)
  let openInvoicesForPlans: Array<{
    id: string
    invoice_number: string | null
    total: string
    customerName: string
  }> = []
  try {
    const supabase = await createClient()
    const { data: claimsData } = await supabase.auth.getClaims()
    if (claimsData?.claims) {
      const token = claimsData.claims as import("@/lib/db").SupabaseToken
      const rows = await withRls(token, async (db) =>
        db
          .select({
            id: invoices.id,
            invoice_number: invoices.invoice_number,
            total: invoices.total,
            customer_id: invoices.customer_id,
          })
          .from(invoices)
          .where(
            and(
              sql`${invoices.status} IN ('draft', 'sent', 'overdue')`,
              isNull(invoices.paid_at)
            )
          )
          .orderBy(invoices.created_at)
      )

      if (rows.length > 0) {
        const customerIds = [...new Set(rows.map((r) => r.customer_id))]
        const { inArray } = await import("drizzle-orm")
        const custRows = await withRls(token, async (db) =>
          db
            .select({ id: customers.id, full_name: customers.full_name })
            .from(customers)
            .where(inArray(customers.id, customerIds))
        )
        const custMap = new Map(custRows.map((c) => [c.id, c.full_name]))
        openInvoicesForPlans = rows.map((r) => ({
          id: r.id,
          invoice_number: r.invoice_number,
          total: r.total,
          customerName: custMap.get(r.customer_id) ?? "Unknown",
        }))
      }
    }
  } catch {
    // Non-blocking
  }

  return (
    <div className="flex flex-col gap-6">
      {/* ── Page header ──────────────────────────────────────────────────── */}
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Billing</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Generate and manage invoices for your customers
        </p>
      </div>

      <BillingPageClient
        invoices={invoiceList}
        customerPhones={customerPhones}
        isOwner={isOwner}
        insights={insights}
        collectionsDashboard={collectionsDashboard}
        paymentPlans={paymentPlans}
        credits={credits}
        customers={customerList}
        openInvoicesForPlans={openInvoicesForPlans}
      />
    </div>
  )
}
