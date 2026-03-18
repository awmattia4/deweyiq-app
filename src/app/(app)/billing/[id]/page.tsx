import type { Metadata } from "next"
import { notFound, redirect } from "next/navigation"
import { getCurrentUser } from "@/actions/auth"
import { getInvoice, getCustomerPhonesForInvoices } from "@/actions/invoices"
import { InvoicePrep } from "@/components/work-orders/invoice-prep"
import { InvoiceDetailView } from "@/components/billing/invoice-detail-view"

interface Props {
  params: Promise<{ id: string }>
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { id } = await params
  const invoice = await getInvoice(id)
  return {
    title: invoice?.invoice_number
      ? `Invoice ${invoice.invoice_number}`
      : "Invoice",
  }
}

/**
 * BillingDetailPage — View or edit a single invoice.
 *
 * Draft invoices render InvoicePrep (edit mode).
 * Sent/paid/void/overdue invoices render InvoiceDetailView (read-only).
 */
export default async function BillingDetailPage({ params }: Props) {
  const user = await getCurrentUser()

  if (!user) redirect("/login")
  if (user.role === "tech") redirect("/routes")
  if (user.role === "customer") redirect("/portal")

  const { id } = await params
  const invoice = await getInvoice(id)

  if (!invoice) notFound()

  // Draft → editable invoice prep
  if (invoice.status === "draft") {
    const primaryWoId = (invoice.work_order_ids ?? [])[0] ?? ""
    return <InvoicePrep invoice={invoice} workOrderId={primaryWoId} backHref="/billing" />
  }

  // Sent/paid/void/overdue → read-only detail
  const customerPhones = await getCustomerPhonesForInvoices([invoice.customer_id])
  const hasPhone = !!customerPhones[invoice.customer_id]

  return <InvoiceDetailView invoice={invoice} hasPhone={hasPhone} />
}
