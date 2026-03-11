---
phase: 06-work-orders-quoting
plan: 07
subsystem: billing
tags: [invoices, pdf, react-pdf, drizzle, nextjs, server-actions]

# Dependency graph
requires:
  - phase: 06-01
    provides: invoices and invoice_line_items schema, org_settings invoice fields
  - phase: 06-02
    provides: work orders list and detail page structure, WoDetail component
  - phase: 06-03
    provides: updateWorkOrderStatus server action, WO lifecycle management
  - phase: 06-05
    provides: QuoteDocument PDF pattern, renderToBuffer usage, quote PDF route handler

provides:
  - prepareInvoice, addWorkOrderToInvoice, finalizeInvoice server actions in src/actions/invoices.ts
  - InvoiceDocument React PDF component in src/lib/pdf/invoice-pdf.tsx
  - GET /api/invoices/[id]/pdf route handler
  - InvoicePrep component: editable invoice preparation screen
  - InvoiceList component: filterable invoice list with status/customer/date filters
  - WoInvoicesTabShell: WOs | Invoices tab toggle on /work-orders page
  - /work-orders/[id]/invoice/[invoiceId] page route
  - Atomic invoice numbering via adminDb counter (INV-0042 format)
  - Credit note creation via createCreditNote action

affects:
  - phase-07-billing: payment collection will use invoice records created here
  - phase-09-reporting: invoice totals and status will feed revenue reports

# Tech tracking
tech-stack:
  added: []
  patterns:
    - Atomic invoice number generation via adminDb UPDATE...RETURNING (same pattern as quote numbers)
    - Two-query pattern for invoice fetches (fetch invoices, then customer names separately) to avoid RLS correlated subquery pitfall
    - calculateTotals helper for consistent subtotal/tax/discount/total computation
    - InvoiceDocument PDF component matching QuoteDocument branding (hex colors only)
    - WoInvoicesTabShell: both panels rendered in DOM with hidden/visible toggle for filter state preservation (same as ScheduleTabs)
    - handlePrepareInvoice: creates invoice on first click, navigates to existing on subsequent clicks

key-files:
  created:
    - src/actions/invoices.ts
    - src/lib/pdf/invoice-pdf.tsx
    - src/app/api/invoices/[id]/pdf/route.ts
    - src/components/work-orders/invoice-prep.tsx
    - src/components/work-orders/invoice-list.tsx
    - src/components/work-orders/wo-invoices-tab-shell.tsx
    - src/app/(app)/work-orders/[id]/invoice/[invoiceId]/page.tsx
  modified:
    - src/app/(app)/work-orders/[id]/page.tsx
    - src/app/(app)/work-orders/page.tsx
    - src/components/work-orders/wo-detail.tsx

key-decisions:
  - "adminDb for finalizeInvoice atomic counter — org_settings UPDATE RLS is owner-only; adminDb lets office staff finalize invoices without owner role (same pattern as quote numbers)"
  - "Two-query invoice fetch pattern — fetch invoices then customer names separately to avoid RLS correlated subquery pitfall per MEMORY.md"
  - "Invoice line items store pre-calculated line_total per row — avoids recomputing on every render; recalculateInvoiceTotals helper called after any mutation"
  - "InvoiceDocument PDF component: hex colors only (#2563eb, #0f172a etc) — not oklch(); same PDF rendering constraint as MapLibre GL and QuoteDocument"
  - "WoDetail invoiceInfo prop: server pre-fetches invoice for WO; 'Prepare Invoice' creates new invoice on first click, 'View Invoice' navigates to existing on subsequent"
  - "WoInvoicesTabShell both panels in DOM with hidden/visible — preserves local filter state when switching tabs without refetching"
  - "getCompletedWorkOrdersForCustomer excludes already-included WO ids — prevents duplicate WOs in multi-WO invoice picker"
  - "Credit notes use negative total (not separate void mechanism) — creates new invoice record with negative amounts for accounting trail"

patterns-established:
  - "Decimal inputs in InvoicePrep use local useState<string> per MEMORY.md controlled-input pattern"
  - "Invoice prep is a server-rendered page with client InvoicePrep component — server SSRs invoice data, client manages edits"
  - "Finalize action requires confirmation dialog before assigning invoice number — prevents accidental finalization"

requirements-completed:
  - WORK-06

# Metrics
duration: 11min
completed: 2026-03-11
---

# Phase 6 Plan 07: Invoice Preparation and Generation Summary

**Work-order-to-invoice conversion with editable line items, multi-WO invoicing, atomic number generation, React PDF component matching quote branding, and filterable invoice list**

## Performance

- **Duration:** 11 min
- **Started:** 2026-03-11T~18:49Z
- **Completed:** 2026-03-11T~19:00Z
- **Tasks:** 2
- **Files modified:** 10

## Accomplishments

- Complete invoice server action layer: prepareInvoice, addWorkOrderToInvoice, updateInvoiceLineItem, addInvoiceLineItem, removeInvoiceLineItem, finalizeInvoice (atomic numbering), getInvoices, getInvoice, getInvoiceForWorkOrder, getCompletedWorkOrdersForCustomer, createCreditNote
- InvoiceDocument React PDF component matching QuoteDocument branding style with hex-only colors, tax exempt badge, WO reference section, payment instructions placeholder for Phase 7
- GET /api/invoices/[id]/pdf route handler following same pattern as quote PDF route
- InvoicePrep UI: editable line item table (description/qty/price inline editing), AddItemForm, AddWoPickerDialog for multi-WO selection, totals section with tax-exempt support, notes, Preview PDF link, Finalize confirmation dialog
- InvoiceList: filterable by status chips, customer name search, date range, with PDF link per finalized invoice
- WO detail page wired: "Prepare Invoice" button creates invoice on first click, navigates to existing on subsequent; "invoiced" status shows green banner with "View Invoice" link
- /work-orders page now has WOs | Invoices tab toggle (WoInvoicesTabShell)

## Task Commits

Each task was committed atomically:

1. **Task 1: Invoice server actions, PDF component, and PDF route handler** - `62d882a` (feat)
2. **Task 2: Invoice preparation UI and invoice list page** - `9431fc5` (feat)

## Files Created/Modified

- `src/actions/invoices.ts` - All invoice CRUD, preparation, finalization, credit note actions
- `src/lib/pdf/invoice-pdf.tsx` - React PDF document component with company branding
- `src/app/api/invoices/[id]/pdf/route.ts` - Authenticated PDF route handler
- `src/components/work-orders/invoice-prep.tsx` - Invoice preparation/review screen
- `src/components/work-orders/invoice-list.tsx` - Filterable invoice list component
- `src/components/work-orders/wo-invoices-tab-shell.tsx` - WOs | Invoices tab toggle
- `src/app/(app)/work-orders/[id]/invoice/[invoiceId]/page.tsx` - Invoice prep page route
- `src/app/(app)/work-orders/[id]/page.tsx` - Updated: fetches invoiceInfo in parallel, passes to WoDetail
- `src/app/(app)/work-orders/page.tsx` - Updated: fetches invoices, renders WoInvoicesTabShell
- `src/components/work-orders/wo-detail.tsx` - Updated: ReceiptIcon, prepareInvoice handler, invoiceInfo prop wired to status bar

## Decisions Made

- adminDb for finalizeInvoice atomic counter — org_settings UPDATE RLS is owner-only; office staff need to finalize invoices too
- Two-query fetch pattern for invoice lists — avoids RLS correlated subquery pitfall per MEMORY.md
- Invoice line_total stored pre-calculated per row — same pattern as WO line items; recalculate helper called after mutations
- InvoiceDocument hex-only colors — PDF renderer constraint, same as QuoteDocument and MapLibre GL
- WoInvoicesTabShell both panels in DOM — preserves filter state across tab switches without refetching data

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered

None - TypeScript clean, Next.js build succeeded on first run.

## User Setup Required

None - no external service configuration required. Invoice numbering uses existing org_settings table (already has invoice_number_prefix and next_invoice_number columns from Phase 06-01).

## Next Phase Readiness

- Full WO lifecycle from draft → complete → invoiced is now implemented end-to-end
- Invoice records in place for Phase 7 payment collection (paid_at timestamp, status='paid')
- PDF route handler ready for Phase 7 email delivery of invoices to customers
- Credit note action ready for Phase 7 refund workflows
- Invoice totals available for Phase 9 revenue reporting

---
*Phase: 06-work-orders-quoting*
*Completed: 2026-03-11*
