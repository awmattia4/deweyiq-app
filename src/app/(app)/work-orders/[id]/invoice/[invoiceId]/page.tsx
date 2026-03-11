import { notFound, redirect } from "next/navigation"
import { getCurrentUser } from "@/actions/auth"
import { getInvoice } from "@/actions/invoices"
import { InvoicePrep } from "@/components/work-orders/invoice-prep"

interface InvoicePrepPageProps {
  params: Promise<{ id: string; invoiceId: string }>
}

export async function generateMetadata({ params }: InvoicePrepPageProps) {
  const { invoiceId } = await params
  const invoice = await getInvoice(invoiceId)
  return {
    title: invoice?.invoice_number
      ? `Invoice ${invoice.invoice_number}`
      : "Prepare Invoice",
  }
}

/**
 * InvoicePrepPage — Server component for invoice preparation.
 *
 * Route: /work-orders/[id]/invoice/[invoiceId]
 *
 * Fetches the invoice with all line items, customer info, and WO references.
 * Renders InvoicePrep (client component) with all data.
 *
 * Role guard: owner and office only.
 */
export default async function InvoicePrepPage({ params }: InvoicePrepPageProps) {
  const user = await getCurrentUser()

  if (!user) redirect("/login")
  if (user.role === "tech") redirect("/routes")
  if (user.role === "customer") redirect("/portal")

  const { id, invoiceId } = await params

  const invoice = await getInvoice(invoiceId)

  if (!invoice) {
    notFound()
  }

  return <InvoicePrep invoice={invoice} workOrderId={id} />
}
