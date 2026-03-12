"use server"

/**
 * qbo-sync.ts -- QuickBooks Online bidirectional sync actions.
 *
 * Key patterns:
 * - syncCustomerToQbo: push customer to QBO (create or update)
 * - syncInvoiceToQbo: push invoice + line items to QBO
 * - syncPaymentToQbo: push payment to QBO
 * - handleQboWebhook: process inbound QBO payment notifications
 * - disconnectQbo: clear all QBO connection data
 * - getQboStatus: fetch connection status for settings UI
 *
 * All sync functions are fire-and-forget: QBO failure never blocks
 * the primary PoolCo operation. Errors are logged but not thrown.
 *
 * Uses adminDb for webhook handling (no user session).
 * Uses withRls for user-facing actions (disconnect, status).
 */

import { revalidatePath } from "next/cache"
import { createClient } from "@/lib/supabase/server"
import { withRls, adminDb } from "@/lib/db"
import type { SupabaseToken } from "@/lib/db"
import {
  customers,
  invoices,
  invoiceLineItems,
  orgSettings,
  paymentRecords,
} from "@/lib/db/schema"
import { eq, and } from "drizzle-orm"
import { getQboClient, isQboConnected, qboPromise } from "@/lib/qbo/client"
import {
  mapCustomerToQbo,
  mapInvoiceToQbo,
  mapPaymentToQbo,
  mapQboPaymentToPoolCo,
} from "@/lib/qbo/mappers"
import type {
  PoolCoCustomer,
  PoolCoInvoice,
  PoolCoInvoiceLineItem,
  PoolCoPayment,
} from "@/lib/qbo/mappers"

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
// syncCustomerToQbo
// ---------------------------------------------------------------------------

/**
 * Pushes a customer to QBO. Creates if new, updates if existing.
 * Silently returns on failure -- QBO sync is non-blocking.
 */
export async function syncCustomerToQbo(customerId: string): Promise<void> {
  try {
    // Fetch customer from DB (adminDb to avoid RLS context requirement)
    const custRows = await adminDb
      .select({
        id: customers.id,
        org_id: customers.org_id,
        full_name: customers.full_name,
        email: customers.email,
        phone: customers.phone,
        address: customers.address,
        qbo_customer_id: customers.qbo_customer_id,
      })
      .from(customers)
      .where(eq(customers.id, customerId))
      .limit(1)

    const cust = custRows[0]
    if (!cust) return

    // Check if org has QBO connected
    const connected = await isQboConnected(cust.org_id)
    if (!connected) return

    // Check payment provider includes QBO
    const settingsRows = await adminDb
      .select({ payment_provider: orgSettings.payment_provider })
      .from(orgSettings)
      .where(eq(orgSettings.org_id, cust.org_id))
      .limit(1)

    const provider = settingsRows[0]?.payment_provider ?? "none"
    if (provider !== "qbo" && provider !== "both") return

    const qbo = await getQboClient(cust.org_id)

    const poolCoCustomer: PoolCoCustomer = {
      id: cust.id,
      full_name: cust.full_name,
      email: cust.email,
      phone: cust.phone,
      address: cust.address,
      qbo_customer_id: cust.qbo_customer_id,
    }

    if (cust.qbo_customer_id) {
      // Update existing QBO customer -- need SyncToken
      const existing = await qboPromise<any>((cb) =>
        qbo.getCustomer(cust.qbo_customer_id!, cb)
      )
      const mapped = mapCustomerToQbo(poolCoCustomer)
      mapped.SyncToken = existing.SyncToken
      mapped.Id = cust.qbo_customer_id
      await qboPromise((cb) => qbo.updateCustomer(mapped, cb))
    } else {
      // Create new QBO customer
      const mapped = mapCustomerToQbo(poolCoCustomer)
      const created = await qboPromise<any>((cb) =>
        qbo.createCustomer(mapped, cb)
      )

      // Save QBO customer ID back to PoolCo
      if (created?.Id) {
        await adminDb
          .update(customers)
          .set({
            qbo_customer_id: String(created.Id),
            updated_at: new Date(),
          })
          .where(eq(customers.id, customerId))
      }
    }

    // Update last sync timestamp
    await adminDb
      .update(orgSettings)
      .set({ qbo_last_sync_at: new Date(), updated_at: new Date() })
      .where(eq(orgSettings.org_id, cust.org_id))
  } catch (err) {
    console.error("[syncCustomerToQbo] Error:", err)
    // QBO sync failure is non-fatal -- do not throw
  }
}

// ---------------------------------------------------------------------------
// syncInvoiceToQbo
// ---------------------------------------------------------------------------

/**
 * Pushes an invoice to QBO. Creates if new, updates if existing.
 * If customer has no qbo_customer_id, syncs customer first.
 * Silently returns on failure.
 */
export async function syncInvoiceToQbo(invoiceId: string): Promise<void> {
  try {
    // Fetch invoice with customer info
    const invoiceRows = await adminDb
      .select({
        id: invoices.id,
        org_id: invoices.org_id,
        customer_id: invoices.customer_id,
        invoice_number: invoices.invoice_number,
        issued_at: invoices.issued_at,
        due_date: invoices.due_date,
        subtotal: invoices.subtotal,
        total: invoices.total,
        qbo_invoice_id: invoices.qbo_invoice_id,
      })
      .from(invoices)
      .where(eq(invoices.id, invoiceId))
      .limit(1)

    const invoice = invoiceRows[0]
    if (!invoice) return

    // Check QBO connection
    const connected = await isQboConnected(invoice.org_id)
    if (!connected) return

    const settingsRows = await adminDb
      .select({ payment_provider: orgSettings.payment_provider })
      .from(orgSettings)
      .where(eq(orgSettings.org_id, invoice.org_id))
      .limit(1)

    const provider = settingsRows[0]?.payment_provider ?? "none"
    if (provider !== "qbo" && provider !== "both") return

    // Ensure customer is synced first
    const custRows = await adminDb
      .select({ qbo_customer_id: customers.qbo_customer_id })
      .from(customers)
      .where(eq(customers.id, invoice.customer_id))
      .limit(1)

    let qboCustomerId = custRows[0]?.qbo_customer_id
    if (!qboCustomerId) {
      await syncCustomerToQbo(invoice.customer_id)
      // Re-fetch after sync
      const refreshed = await adminDb
        .select({ qbo_customer_id: customers.qbo_customer_id })
        .from(customers)
        .where(eq(customers.id, invoice.customer_id))
        .limit(1)
      qboCustomerId = refreshed[0]?.qbo_customer_id
      if (!qboCustomerId) return // Customer sync failed
    }

    // Fetch line items
    const lineItemRows = await adminDb
      .select({
        description: invoiceLineItems.description,
        quantity: invoiceLineItems.quantity,
        unit_price: invoiceLineItems.unit_price,
        line_total: invoiceLineItems.line_total,
      })
      .from(invoiceLineItems)
      .where(eq(invoiceLineItems.invoice_id, invoiceId))

    const poolCoInvoice: PoolCoInvoice = {
      id: invoice.id,
      invoice_number: invoice.invoice_number,
      issued_at: invoice.issued_at,
      due_date: invoice.due_date,
      subtotal: invoice.subtotal,
      total: invoice.total,
      qbo_invoice_id: invoice.qbo_invoice_id,
    }

    const poolCoLineItems: PoolCoInvoiceLineItem[] = lineItemRows.map((li) => ({
      description: li.description,
      quantity: li.quantity,
      unit_price: li.unit_price,
      line_total: li.line_total,
    }))

    const qbo = await getQboClient(invoice.org_id)

    if (invoice.qbo_invoice_id) {
      // Update existing QBO invoice -- need SyncToken
      const existing = await qboPromise<any>((cb) =>
        qbo.getInvoice(invoice.qbo_invoice_id!, cb)
      )
      const mapped = mapInvoiceToQbo(poolCoInvoice, poolCoLineItems, qboCustomerId)
      mapped.SyncToken = existing.SyncToken
      mapped.Id = invoice.qbo_invoice_id
      await qboPromise((cb) => qbo.updateInvoice(mapped, cb))
    } else {
      // Create new QBO invoice
      const mapped = mapInvoiceToQbo(poolCoInvoice, poolCoLineItems, qboCustomerId)
      const created = await qboPromise<any>((cb) =>
        qbo.createInvoice(mapped, cb)
      )

      // Save QBO invoice ID
      if (created?.Id) {
        await adminDb
          .update(invoices)
          .set({
            qbo_invoice_id: String(created.Id),
            updated_at: new Date(),
          })
          .where(eq(invoices.id, invoiceId))
      }
    }

    // Update last sync timestamp
    await adminDb
      .update(orgSettings)
      .set({ qbo_last_sync_at: new Date(), updated_at: new Date() })
      .where(eq(orgSettings.org_id, invoice.org_id))
  } catch (err) {
    console.error("[syncInvoiceToQbo] Error:", err)
  }
}

// ---------------------------------------------------------------------------
// syncPaymentToQbo
// ---------------------------------------------------------------------------

/**
 * Pushes a payment to QBO. Creates a QBO Payment linked to the invoice.
 * If invoice or customer has no QBO ID, syncs them first.
 * Silently returns on failure.
 */
export async function syncPaymentToQbo(paymentRecordId: string): Promise<void> {
  try {
    // Fetch payment record
    const paymentRows = await adminDb
      .select({
        id: paymentRecords.id,
        org_id: paymentRecords.org_id,
        invoice_id: paymentRecords.invoice_id,
        amount: paymentRecords.amount,
        method: paymentRecords.method,
        settled_at: paymentRecords.settled_at,
        qbo_payment_id: paymentRecords.qbo_payment_id,
      })
      .from(paymentRecords)
      .where(eq(paymentRecords.id, paymentRecordId))
      .limit(1)

    const payment = paymentRows[0]
    if (!payment || payment.qbo_payment_id) return // Already synced or not found

    // Check QBO connection
    const connected = await isQboConnected(payment.org_id)
    if (!connected) return

    const settingsRows = await adminDb
      .select({ payment_provider: orgSettings.payment_provider })
      .from(orgSettings)
      .where(eq(orgSettings.org_id, payment.org_id))
      .limit(1)

    const provider = settingsRows[0]?.payment_provider ?? "none"
    if (provider !== "qbo" && provider !== "both") return

    // Ensure invoice is synced
    const invoiceRows = await adminDb
      .select({
        customer_id: invoices.customer_id,
        qbo_invoice_id: invoices.qbo_invoice_id,
      })
      .from(invoices)
      .where(eq(invoices.id, payment.invoice_id))
      .limit(1)

    const inv = invoiceRows[0]
    if (!inv) return

    let qboInvoiceId = inv.qbo_invoice_id
    if (!qboInvoiceId) {
      await syncInvoiceToQbo(payment.invoice_id)
      const refreshed = await adminDb
        .select({ qbo_invoice_id: invoices.qbo_invoice_id })
        .from(invoices)
        .where(eq(invoices.id, payment.invoice_id))
        .limit(1)
      qboInvoiceId = refreshed[0]?.qbo_invoice_id
      if (!qboInvoiceId) return
    }

    // Ensure customer is synced
    const custRows = await adminDb
      .select({ qbo_customer_id: customers.qbo_customer_id })
      .from(customers)
      .where(eq(customers.id, inv.customer_id))
      .limit(1)

    let qboCustomerId = custRows[0]?.qbo_customer_id
    if (!qboCustomerId) {
      await syncCustomerToQbo(inv.customer_id)
      const refreshed = await adminDb
        .select({ qbo_customer_id: customers.qbo_customer_id })
        .from(customers)
        .where(eq(customers.id, inv.customer_id))
        .limit(1)
      qboCustomerId = refreshed[0]?.qbo_customer_id
      if (!qboCustomerId) return
    }

    const poolCoPayment: PoolCoPayment = {
      id: payment.id,
      amount: payment.amount,
      method: payment.method,
      settled_at: payment.settled_at,
      qbo_payment_id: null,
    }

    const qbo = await getQboClient(payment.org_id)
    const mapped = mapPaymentToQbo(poolCoPayment, qboInvoiceId, qboCustomerId)
    const created = await qboPromise<any>((cb) =>
      qbo.createPayment(mapped, cb)
    )

    // Save QBO payment ID
    if (created?.Id) {
      await adminDb
        .update(paymentRecords)
        .set({ qbo_payment_id: String(created.Id) })
        .where(eq(paymentRecords.id, paymentRecordId))
    }

    // Update last sync timestamp
    await adminDb
      .update(orgSettings)
      .set({ qbo_last_sync_at: new Date(), updated_at: new Date() })
      .where(eq(orgSettings.org_id, payment.org_id))
  } catch (err) {
    console.error("[syncPaymentToQbo] Error:", err)
  }
}

// ---------------------------------------------------------------------------
// handleQboWebhook
// ---------------------------------------------------------------------------

/**
 * Processes QBO webhook notifications. Only handles Payment create/update.
 * PoolCo is source of truth for Customers and Invoices -- those events are ignored.
 *
 * Uses adminDb (webhook has no user session).
 */
export async function handleQboWebhook(
  realmId: string,
  eventNotifications: Array<{
    realmId: string
    dataChangeEvent?: {
      entities: Array<{
        name: string
        id: string
        operation: string
        lastUpdated: string
      }>
    }
  }>
): Promise<void> {
  try {
    // Find the org for this realmId
    const settingsRows = await adminDb
      .select({
        org_id: orgSettings.org_id,
        payment_provider: orgSettings.payment_provider,
      })
      .from(orgSettings)
      .where(eq(orgSettings.qbo_realm_id, realmId))
      .limit(1)

    const settings = settingsRows[0]
    if (!settings) {
      console.warn("[handleQboWebhook] No org found for realmId:", realmId)
      return
    }

    const orgId = settings.org_id

    for (const notification of eventNotifications) {
      if (notification.realmId !== realmId) continue

      const entities = notification.dataChangeEvent?.entities ?? []

      for (const entity of entities) {
        // Only process Payment create/update
        if (entity.name !== "Payment") continue
        if (entity.operation !== "Create" && entity.operation !== "Update") continue

        try {
          const qbo = await getQboClient(orgId)

          // Fetch the QBO payment
          const qboPayment = await qboPromise<any>((cb) =>
            qbo.getPayment(entity.id, cb)
          )

          if (!qboPayment) continue

          // Map to PoolCo shape
          const mapped = mapQboPaymentToPoolCo(qboPayment)
          if (!mapped.linkedInvoiceId) continue

          // Find PoolCo invoice by qbo_invoice_id
          const invoiceRows = await adminDb
            .select({
              id: invoices.id,
              org_id: invoices.org_id,
              total: invoices.total,
              status: invoices.status,
            })
            .from(invoices)
            .where(
              and(
                eq(invoices.org_id, orgId),
                eq(invoices.qbo_invoice_id, mapped.linkedInvoiceId)
              )
            )
            .limit(1)

          const poolCoInvoice = invoiceRows[0]
          if (!poolCoInvoice) continue

          // Check if we already have a payment_record for this qbo_payment_id
          const existingPayment = await adminDb
            .select({ id: paymentRecords.id })
            .from(paymentRecords)
            .where(
              and(
                eq(paymentRecords.org_id, orgId),
                eq(paymentRecords.qbo_payment_id, mapped.qboPaymentId)
              )
            )
            .limit(1)

          if (existingPayment.length > 0) continue // Already recorded

          const now = new Date()

          // Create payment_record
          await adminDb.insert(paymentRecords).values({
            org_id: orgId,
            invoice_id: poolCoInvoice.id,
            amount: mapped.amount,
            method: mapped.method,
            status: "settled",
            qbo_payment_id: mapped.qboPaymentId,
            settled_at: mapped.txnDate ? new Date(mapped.txnDate) : now,
            created_at: now,
          })

          // Update invoice status to 'paid' if fully paid
          const paymentAmount = parseFloat(mapped.amount) || 0
          const invoiceTotal = parseFloat(poolCoInvoice.total) || 0
          if (paymentAmount >= invoiceTotal && poolCoInvoice.status !== "paid") {
            await adminDb
              .update(invoices)
              .set({
                status: "paid",
                paid_at: now,
                payment_method: "qbo",
                updated_at: now,
              })
              .where(eq(invoices.id, poolCoInvoice.id))
          }
        } catch (entityErr) {
          console.error(
            `[handleQboWebhook] Error processing entity ${entity.name}/${entity.id}:`,
            entityErr
          )
        }
      }
    }
  } catch (err) {
    console.error("[handleQboWebhook] Error:", err)
  }
}

// ---------------------------------------------------------------------------
// disconnectQbo
// ---------------------------------------------------------------------------

/**
 * Disconnects QBO. Owner only via withRls.
 * Clears all QBO fields and updates payment_provider.
 */
export async function disconnectQbo(): Promise<{
  success: boolean
  error?: string
}> {
  const token = await getRlsToken()
  if (!token) return { success: false, error: "Not authenticated" }

  const userRole = token.user_role as string | undefined
  if (userRole !== "owner") {
    return { success: false, error: "Only owners can disconnect QuickBooks" }
  }

  const orgId = token.org_id as string
  if (!orgId) return { success: false, error: "No org found" }

  try {
    // Fetch current payment_provider to adjust
    const settingsRows = await adminDb
      .select({ payment_provider: orgSettings.payment_provider })
      .from(orgSettings)
      .where(eq(orgSettings.org_id, orgId))
      .limit(1)

    const currentProvider = settingsRows[0]?.payment_provider ?? "none"
    let newProvider = "none"
    if (currentProvider === "both") {
      newProvider = "stripe"
    } else if (currentProvider === "qbo") {
      newProvider = "none"
    } else {
      newProvider = currentProvider // Already 'none' or 'stripe'
    }

    await adminDb
      .update(orgSettings)
      .set({
        qbo_connected: false,
        qbo_realm_id: null,
        qbo_access_token: null,
        qbo_refresh_token: null,
        qbo_token_expires_at: null,
        qbo_last_sync_at: null,
        payment_provider: newProvider,
        updated_at: new Date(),
      })
      .where(eq(orgSettings.org_id, orgId))

    revalidatePath("/settings")
    return { success: true }
  } catch (err) {
    console.error("[disconnectQbo] Error:", err)
    return {
      success: false,
      error: err instanceof Error ? err.message : "Failed to disconnect QBO",
    }
  }
}

// ---------------------------------------------------------------------------
// getQboStatus
// ---------------------------------------------------------------------------

/**
 * Fetches QBO connection status for the settings UI.
 */
export async function getQboStatus(): Promise<{
  connected: boolean
  realmId: string | null
  lastSyncAt: Date | null
}> {
  const token = await getRlsToken()
  if (!token) {
    return { connected: false, realmId: null, lastSyncAt: null }
  }

  const orgId = token.org_id as string
  if (!orgId) {
    return { connected: false, realmId: null, lastSyncAt: null }
  }

  try {
    const rows = await adminDb
      .select({
        qbo_connected: orgSettings.qbo_connected,
        qbo_realm_id: orgSettings.qbo_realm_id,
        qbo_last_sync_at: orgSettings.qbo_last_sync_at,
      })
      .from(orgSettings)
      .where(eq(orgSettings.org_id, orgId))
      .limit(1)

    const settings = rows[0]
    if (!settings) {
      return { connected: false, realmId: null, lastSyncAt: null }
    }

    return {
      connected: settings.qbo_connected,
      realmId: settings.qbo_realm_id,
      lastSyncAt: settings.qbo_last_sync_at,
    }
  } catch (err) {
    console.error("[getQboStatus] Error:", err)
    return { connected: false, realmId: null, lastSyncAt: null }
  }
}
