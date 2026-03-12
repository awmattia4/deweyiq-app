/**
 * QBO Entity Mappers — transforms between PoolCo and QuickBooks Online data shapes.
 *
 * Exported mappers:
 * - mapCustomerToQbo: PoolCo customer -> QBO Customer
 * - mapInvoiceToQbo: PoolCo invoice + line items -> QBO Invoice
 * - mapPaymentToQbo: PoolCo payment -> QBO Payment
 * - mapQboPaymentToPoolCo: QBO payment -> partial PoolCo payment record
 */

// ---------------------------------------------------------------------------
// Types (minimal shapes, not full DB row types)
// ---------------------------------------------------------------------------

export interface PoolCoCustomer {
  id: string
  full_name: string
  email: string | null
  phone: string | null
  address: string | null
  qbo_customer_id: string | null
}

export interface PoolCoInvoiceLineItem {
  description: string
  quantity: string
  unit_price: string
  line_total: string
}

export interface PoolCoInvoice {
  id: string
  invoice_number: string | null
  issued_at: Date | null
  due_date: string | null
  subtotal: string
  total: string
  qbo_invoice_id: string | null
}

export interface PoolCoPayment {
  id: string
  amount: string
  method: string
  settled_at: Date | null
  qbo_payment_id: string | null
}

// ---------------------------------------------------------------------------
// mapCustomerToQbo
// ---------------------------------------------------------------------------

export function mapCustomerToQbo(customer: PoolCoCustomer): Record<string, any> {
  const qboCustomer: Record<string, any> = {
    DisplayName: customer.full_name,
  }

  if (customer.email) {
    qboCustomer.PrimaryEmailAddr = { Address: customer.email }
  }

  if (customer.phone) {
    qboCustomer.PrimaryPhone = { FreeFormNumber: customer.phone }
  }

  if (customer.address) {
    // Parse address: try to split "123 Main St, City, ST 12345" format
    const parts = customer.address.split(",").map((p) => p.trim())
    qboCustomer.BillAddr = {
      Line1: parts[0] || customer.address,
      City: parts[1] || undefined,
      PostalCode: parts[2]?.match(/\d{5}(-\d{4})?/)?.[0] || undefined,
    }
  }

  // If updating an existing QBO customer, include Id for update
  if (customer.qbo_customer_id) {
    qboCustomer.Id = customer.qbo_customer_id
  }

  return qboCustomer
}

// ---------------------------------------------------------------------------
// mapInvoiceToQbo
// ---------------------------------------------------------------------------

export function mapInvoiceToQbo(
  invoice: PoolCoInvoice,
  lineItems: PoolCoInvoiceLineItem[],
  qboCustomerId: string
): Record<string, any> {
  const qboInvoice: Record<string, any> = {
    CustomerRef: { value: qboCustomerId },
    Line: lineItems.map((li) => ({
      DetailType: "SalesItemLineDetail",
      Amount: parseFloat(li.line_total) || 0,
      Description: li.description,
      SalesItemLineDetail: {
        Qty: parseFloat(li.quantity) || 1,
        UnitPrice: parseFloat(li.unit_price) || 0,
      },
    })),
  }

  if (invoice.issued_at) {
    qboInvoice.TxnDate = invoice.issued_at.toISOString().split("T")[0]
  }

  if (invoice.due_date) {
    qboInvoice.DueDate = invoice.due_date
  }

  if (invoice.invoice_number) {
    qboInvoice.DocNumber = invoice.invoice_number
  }

  // If updating an existing QBO invoice, include Id
  if (invoice.qbo_invoice_id) {
    qboInvoice.Id = invoice.qbo_invoice_id
  }

  return qboInvoice
}

// ---------------------------------------------------------------------------
// mapPaymentToQbo
// ---------------------------------------------------------------------------

/**
 * Maps a PoolCo payment record to a QBO Payment object.
 *
 * Payment method mapping:
 * - card -> Credit Card
 * - ach -> Check (ACH appears as "Check" in QBO)
 * - check -> Check
 * - cash -> Cash
 * - qbo -> Other (shouldn't happen, but safe fallback)
 */
export function mapPaymentToQbo(
  payment: PoolCoPayment,
  qboInvoiceId: string,
  qboCustomerId: string
): Record<string, any> {
  const amount = parseFloat(payment.amount) || 0

  const qboPayment: Record<string, any> = {
    CustomerRef: { value: qboCustomerId },
    TotalAmt: amount,
    Line: [
      {
        Amount: amount,
        LinkedTxn: [
          {
            TxnId: qboInvoiceId,
            TxnType: "Invoice",
          },
        ],
      },
    ],
  }

  if (payment.settled_at) {
    qboPayment.TxnDate = payment.settled_at.toISOString().split("T")[0]
  }

  // Map PoolCo payment method to QBO PaymentMethodRef
  const methodMap: Record<string, string> = {
    card: "Credit Card",
    ach: "Check",
    check: "Check",
    cash: "Cash",
  }
  const qboMethod = methodMap[payment.method] ?? "Other"
  qboPayment.PaymentMethodRef = { value: qboMethod }

  return qboPayment
}

// ---------------------------------------------------------------------------
// mapQboPaymentToPoolCo
// ---------------------------------------------------------------------------

/**
 * Maps a QBO Payment object to a partial PoolCo payment record shape.
 * Used for inbound webhook processing.
 */
export function mapQboPaymentToPoolCo(qboPayment: any): {
  amount: string
  method: string
  qboPaymentId: string
  linkedInvoiceId: string | null
  txnDate: string | null
} {
  const amount = String(qboPayment.TotalAmt ?? "0")
  const qboPaymentId = String(qboPayment.Id ?? "")

  // Determine method from QBO PaymentMethodRef
  let method = "qbo"
  const paymentMethodName =
    qboPayment.PaymentMethodRef?.name?.toLowerCase() ?? ""
  if (paymentMethodName.includes("credit") || paymentMethodName.includes("card")) {
    method = "card"
  } else if (paymentMethodName.includes("check") || paymentMethodName.includes("ach")) {
    method = "ach"
  } else if (paymentMethodName.includes("cash")) {
    method = "cash"
  }

  // Extract linked invoice QBO ID from Line items
  let linkedInvoiceId: string | null = null
  const lines = qboPayment.Line ?? []
  for (const line of lines) {
    const linkedTxns = line.LinkedTxn ?? []
    for (const txn of linkedTxns) {
      if (txn.TxnType === "Invoice") {
        linkedInvoiceId = String(txn.TxnId)
        break
      }
    }
    if (linkedInvoiceId) break
  }

  const txnDate = qboPayment.TxnDate ?? null

  return {
    amount,
    method,
    qboPaymentId,
    linkedInvoiceId,
    txnDate,
  }
}
