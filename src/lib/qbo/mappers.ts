/**
 * QBO Entity Mappers — transforms between DeweyIQ and QuickBooks Online data shapes.
 *
 * Exported mappers:
 * - mapCustomerToQbo: DeweyIQ customer -> QBO Customer
 * - mapInvoiceToQbo: DeweyIQ invoice + line items -> QBO Invoice
 * - mapPaymentToQbo: DeweyIQ payment -> QBO Payment
 * - mapQboPaymentToPoolCo: QBO payment -> partial DeweyIQ payment record
 * - mapTimeEntryToQboTimeActivity: DeweyIQ time_entry -> QBO TimeActivity (Phase 11-04)
 * - mapProfileToQboEmployee: DeweyIQ profile -> QBO Employee (Phase 11-04)
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

// Phase 11-04: Time entry + employee shapes

export interface PoolCoTimeEntry {
  id: string
  /** YYYY-MM-DD local date */
  work_date: string
  /** Net minutes (gross minus breaks) — QBO receives net work time */
  total_minutes: number
}

export interface PoolCoProfile {
  id: string
  full_name: string
  email: string | null
  qbo_employee_id: string | null
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
 * Maps a DeweyIQ payment record to a QBO Payment object.
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

  // Map DeweyIQ payment method to QBO PaymentMethodRef
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
 * Maps a QBO Payment object to a partial DeweyIQ payment record shape.
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

// ---------------------------------------------------------------------------
// mapTimeEntryToQboTimeActivity — Phase 11-04
// ---------------------------------------------------------------------------

/**
 * Maps a DeweyIQ time_entry to a QBO TimeActivity payload.
 *
 * QBO TimeActivity fields:
 * - TxnDate: the work date (YYYY-MM-DD)
 * - NameOf: "Employee" (identifies the entity type)
 * - EmployeeRef: { value: qboEmployeeId }
 * - Hours: whole hours portion of net work time
 * - Minutes: remaining minutes (0-59)
 * - Description: short narrative for the payroll record
 * - BillableStatus: "NotBillable" (internal time — not billed to customers)
 *
 * @param entry          - minimal time_entry row shape (net minutes, not gross)
 * @param qboEmployeeRef - QBO Employee.Id for the tech
 */
export function mapTimeEntryToQboTimeActivity(
  entry: PoolCoTimeEntry,
  qboEmployeeRef: string
): Record<string, any> {
  const hours = Math.floor(entry.total_minutes / 60)
  const minutes = entry.total_minutes % 60

  return {
    TxnDate: entry.work_date,
    NameOf: "Employee",
    EmployeeRef: { value: qboEmployeeRef },
    Hours: hours,
    Minutes: minutes,
    Description: `Field route - ${entry.work_date}`,
    BillableStatus: "NotBillable",
  }
}

// ---------------------------------------------------------------------------
// mapProfileToQboEmployee — Phase 11-04
// ---------------------------------------------------------------------------

/**
 * Maps a DeweyIQ profiles row to a QBO Employee create payload.
 *
 * QBO Employee fields:
 * - DisplayName: required — shown in QBO payroll UI
 * - GivenName / FamilyName: parsed from full_name (last-space split)
 * - PrimaryEmailAddr: optional
 *
 * For updates, caller adds Id + SyncToken to the returned object.
 *
 * @param profile - minimal profile shape
 */
export function mapProfileToQboEmployee(
  profile: PoolCoProfile
): Record<string, any> {
  const nameParts = profile.full_name.trim().split(/\s+/)
  const familyName = nameParts.length > 1 ? nameParts[nameParts.length - 1] : ""
  const givenName =
    nameParts.length > 1
      ? nameParts.slice(0, -1).join(" ")
      : profile.full_name

  const qboEmployee: Record<string, any> = {
    DisplayName: profile.full_name,
    GivenName: givenName,
    FamilyName: familyName,
  }

  if (profile.email) {
    qboEmployee.PrimaryEmailAddr = { Address: profile.email }
  }

  return qboEmployee
}
