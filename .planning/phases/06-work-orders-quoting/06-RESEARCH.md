# Phase 6: Work Orders & Quoting - Research

**Researched:** 2026-03-10
**Domain:** Work order lifecycle, quote PDF generation, customer approval flow, invoice creation, parts catalog
**Confidence:** HIGH (core patterns — all from codebase analysis and verified sources)

---

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions

#### Work Order Lifecycle

**Creation sources:**
- Office staff create WOs directly from the dashboard (full form)
- Techs quick-flag issues during service stops → creates a Draft WO for office review
- Future: Phase 8 adds customer portal service requests that become Draft WOs

**Tech field flagging (must take ~10 seconds):**
- Category picker: pump, filter, heater, plumbing/leak, surface, electrical, other
- Snap one or more photos (reuses Phase 3 camera/compression pipeline)
- One-line note field (voice dictation hint like Phase 3 notes)
- Severity: routine / urgent / emergency (affects office triage)
- Auto-attaches to current customer + pool context from the stop
- Appears in office WO inbox as a draft with "Flagged by [Tech Name]" badge

**Status flow:**
```
Draft → Quoted → Approved → Scheduled → In Progress → Complete
                                                        ↓
                                                    Invoiced
  ↕ (any status except Complete/Invoiced can be Cancelled)
```
- **Draft:** Created but not yet quoted. Office reviews, adds line items, assigns priority
- **Quoted:** Quote sent to customer, awaiting response
- **Approved:** Customer approved the quote (or office skipped quoting for small jobs)
- **Scheduled:** Assigned to a tech with a target date
- **In Progress:** Tech has started the work (marked on arrival)
- **Complete:** Work finished, photos/notes captured, ready to invoice
- **Invoiced:** Invoice generated from this WO (terminal state)
- **Cancelled:** Cancelled at any point before Complete — requires reason field, tracks who cancelled and when

**Skip-quote shortcut:**
- For small/warranty/goodwill jobs, office can move Draft → Approved directly without generating a quote
- "Skip Quote" button on draft WOs — requires confirmation

**Priority levels:**
- Low (routine — schedule when convenient)
- Normal (standard turnaround)
- High (needs attention this week)
- Emergency (same-day/next-day — surfaces at top of office dashboard with visual urgency)

**Assignment:**
- Office assigns a tech + target date when moving to Scheduled
- If the assigned tech is unavailable, office can reassign to another tech (tracks reassignment history)
- Unassigned WOs appear in an "Unassigned" queue on the WO list page

**Follow-up WOs:**
- One visit per WO. Multi-day repairs use linked follow-up WOs
- "Create Follow-Up" button on a completed WO pre-fills customer, pool, category, and references the parent WO
- Follow-up chain visible on customer profile

**Completion flow (tech side):**
- Tech marks "Arrived" (→ In Progress)
- Tech does the work
- Tech captures completion photos + notes describing what was done
- Tech marks "Complete" — triggers auto-notification to customer
- If parts were used that weren't on the original WO, tech can add them at completion

**Auto-notifications throughout lifecycle:**
- Draft created from tech flag → office gets in-app alert + optional email
- Quote sent → customer gets email with PDF + approval link
- Customer approves/declines/requests changes → office gets in-app alert + email
- WO scheduled → customer gets "Your repair is scheduled for [date]" notification
- WO complete → customer gets "Your repair is complete" summary with photos
- Invoice generated → feeds into Phase 7 delivery

#### Quote Presentation & Approval

**Delivery:**
- Email with branded PDF attachment + link to branded web approval page
- PDF and web page show identical information — web page adds interactive approve/decline/change buttons
- Signed JWT token in the approval link (same pattern as service report tokens from Phase 5)

**Quote detail shown to customer:**
- Company logo + branding (pulled from org settings)
- Quote number + date + expiration date
- Customer name + property address
- Job description / scope of work (rich text)
- Full line-item breakdown: description, quantity, unit price, line total per item
- Subtotal, tax (itemized), grand total
- Terms and conditions (configurable in company settings)
- Tech who identified the issue (if flagged from field)

**Customer response options:**
- **Approve** — one-tap, optionally with e-signature capture (name + date, not drawn signature)
- **Decline** — requires selecting a reason: too expensive, getting other quotes, not needed, other (free text)
- **Request Changes** — customer writes a note describing what they want modified

**Quote versioning:**
- Each revision creates a new version (v1, v2, v3...) — previous versions preserved for audit trail
- Customer always sees the latest version on the approval page
- Office can see version history with diff of what changed between versions

**Expiration:**
- Configurable default expiration (e.g. 30 days) — set per company in org settings
- Can be overridden per quote
- 7 days before expiration: auto-reminder email to customer
- Expired quotes: approval page shows "This quote has expired"
- Office can "Extend" an expired quote

**Optional line items:**
- Individual line items can be marked as "optional" — customer can include or exclude them when approving
- Approved total adjusts based on which optional items the customer selected

#### Line Items & Pricing

**Parts entry:**
- Saved parts/materials catalog with: name, description, default cost price, default sell price, category, SKU (optional)
- Catalog builds organically — when adding a custom item to a WO, option to "Save to catalog"
- Search/filter catalog by name or category
- Quantity + unit (each, foot, gallon, hour, etc.)
- Free-form custom items always available

**Labor pricing (per line item):**
- **Hourly:** Set rate × hours. Tech can log actual hours at completion
- **Flat rate:** Fixed price for the job type
- Each line item independently chooses hourly or flat rate
- Company default hourly rate configurable in org settings

**Parts markup:**
- Configurable default markup percentage in org settings (e.g. 30%)
- Override per item if needed
- Cost price never shown to customer

**Tax handling:**
- Per-item taxability flag (default: parts taxable, labor not taxable — configurable)
- Company tax rate configured in org settings
- Tax line shown separately on quotes and invoices
- "Tax exempt" flag per customer

**Discounts:**
- Per-item discount (percentage or fixed amount)
- Whole-order discount (percentage or fixed amount)
- Discount reason field (optional)

**WO templates for common jobs:**
- Save a WO as a template: pre-filled line items, descriptions, typical labor hours
- Template selection when creating a new WO pre-populates everything
- Templates managed in company settings

#### WO-to-Invoice Conversion

**Conversion flow:**
- "Prepare Invoice" button on completed WOs opens a review/edit screen
- Review screen shows all line items from the WO, pre-filled
- Office can: adjust quantities, modify prices, add/remove line items, apply additional discounts, add notes
- "Finalize Invoice" creates the invoice record and assigns an invoice number
- Side-by-side or diff view: original WO line items vs final invoice

**Invoice record (Phase 6 scope):**
- Invoice number: auto-incrementing, configurable prefix
- Stores: all line items, tax, discounts, subtotal, total, customer info, WO reference, dates
- Status: Draft → Sent → Paid (Phase 7 manages Sent → Paid transition)
- PDF generation: branded invoice PDF matching quote PDF style
- Invoice list page: filterable by status, customer, date range, amount

**Multi-WO invoicing:**
- Multiple completed WOs for the same customer can be combined into a single invoice

**Credit notes / adjustments:**
- If a completed invoice needs adjustment, create a credit note

#### Work Order Dashboard & List

**Office WO inbox:**
- Default view: all open WOs sorted by priority then date
- Filter chips: by status, priority, tech, customer, date range
- "Needs Attention" badge count
- Quick-action buttons on each row

**WO detail page:**
- Header: customer name, pool, category, priority badge, current status
- Timeline/activity log: every status change, note, photo, quote sent, customer response
- Line items section (editable until invoiced)
- Photos section
- Linked quotes (with version history)
- Linked invoice (if invoiced)
- Follow-up WOs (if any)
- Assignment history

**Customer profile integration:**
- Customer profile shows a "Work Orders" tab
- WO count badge on customer card
- Service history timeline includes WO completions

### Claude's Discretion
- Work order list page layout details
- Quote PDF template exact design and typography
- Parts catalog management UI specifics
- Invoice number generation scheme and prefix format
- WO assignment UI interaction pattern
- Notification email template designs
- Activity timeline component styling
- Mobile-responsive layout decisions for WO detail page
- Search/autocomplete behavior in parts catalog
- How "Save as Template" flow works in the UI

### Deferred Ideas (OUT OF SCOPE)
None — discussion stayed within phase scope
</user_constraints>

---

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|-----------------|
| WORK-01 | Office or tech can create work orders for repairs and one-off jobs | New `work_orders` table + `createWorkOrder` server action + office form + tech quick-flag sheet in StopWorkflow |
| WORK-02 | Work orders attach to customer with photos, notes, parts, and labor | `work_order_line_items` table + `work_order_photos` Supabase Storage bucket (mirrors `visit-photos` pattern) + JSONB notes field |
| WORK-03 | Office can create professional quotes with line items for customer approval | `quotes` + `quote_versions` tables + `@react-pdf/renderer` PDF generation in Next.js route handler + `sendQuote` server action via Resend with PDF attachment |
| WORK-04 | Customer can approve quotes through the portal or email link | Public `/api/quotes/[token]` route handler + signed JWT (same `jose` pattern as service report tokens) + approve/decline/change actions that write back without auth |
| WORK-05 | Approved quotes auto-convert to work orders | `approveQuote` action sets WO status to `approved`, copies approved line items to WO; no re-entry needed |
| WORK-06 | Completed work orders can generate invoices | `invoices` + `invoice_line_items` tables + `prepareInvoice` / `finalizeInvoice` server actions + `@react-pdf/renderer` invoice PDF |
</phase_requirements>

---

## Summary

Phase 6 is primarily a data-model and server-action phase, not a new library phase. All the infrastructure already exists — Drizzle ORM with `withRls`, Supabase Storage for photos, React Email for transactional email, `jose` for signed public links, `@react-email/components` for email templates, and shadcn/ui for UI components. The new additions are: (1) five new database tables (`work_orders`, `work_order_line_items`, `quotes`, `quote_versions`, `invoices` + `invoice_line_items`), (2) PDF generation via `@react-pdf/renderer` for quote and invoice PDFs, and (3) a public unauthenticated quote approval page using the same JWT-signed token pattern already used for service reports.

The most technically sensitive area is PDF generation with `@react-pdf/renderer`. The project uses Next.js 16.1.6 with Turbopack for development and webpack for builds (`next build --webpack` per `package.json`). The library requires `serverExternalPackages: ['@react-pdf/renderer']` in `next.config.ts` to prevent bundling crashes — this is the established fix for Next.js 14.1.1+ and must be added. Quote PDFs and invoice PDFs are generated in a Next.js **Route Handler** (not a Server Action), using `renderToBuffer()` from `@react-pdf/renderer`. The buffer is base64-encoded and attached to Resend emails directly from the Next.js action calling Resend SDK (not through the Edge Function, because PDF buffers should not traverse the Edge Function boundary).

The parts catalog, WO templates, invoice numbering, and quote versioning are standard application-layer patterns that build on existing Drizzle schema conventions. Invoice number generation uses a per-org `invoice_counter` column (or separate `invoice_sequences` table) incremented atomically inside a Drizzle transaction to ensure no duplicates under concurrent load.

**Primary recommendation:** Add `serverExternalPackages: ['@react-pdf/renderer']` to `next.config.ts`, add 5+ new schema tables following existing RLS patterns, generate PDFs in Route Handlers using `renderToBuffer`, attach PDFs to Resend via base64, and implement the quote approval public page using signed JWTs identically to the Phase 5 service report token pattern.

---

## Standard Stack

### Core
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| `@react-pdf/renderer` | 4.3.2 | Server-side PDF generation for quotes and invoices | Only library producing real PDFs (not HTML print-to-PDF) from React components; compatible with React 19 since v4.1.0 |
| `drizzle-orm` | 0.45.1 (already installed) | New schema tables and queries | Already the project ORM; five new tables follow existing RLS patterns exactly |
| `@react-email/components` + `@react-email/render` | already installed | Quote/invoice notification email templates | Already installed and in use; same pattern as service report email |
| `resend` | already installed | Email delivery with PDF attachment | Resend supports `attachments` array with `{ filename, content (base64) }` — no new library needed |
| `jose` | already in Next.js | Signed JWT tokens for public quote approval links | Already used for service report tokens in Phase 5; identical pattern |

### Supporting
| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| `browser-image-compression` | already installed | Photo compression for WO field flagging photos | Reuse existing Phase 3 camera/compression pipeline |
| `sonner` | already installed | Toast notifications for WO actions | Already the project toast library |
| `@tanstack/react-table` | already installed | WO list and invoice list with filtering | Already installed; sortable/filterable table for WO inbox |

### Alternatives Considered
| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| `@react-pdf/renderer` server-side | Puppeteer headless PDF | Puppeteer requires a Chrome binary, adds ~150MB to cold starts, is overkill for structured documents. `@react-pdf/renderer` is purpose-built and has no headless browser dependency |
| `@react-pdf/renderer` | `pdfmake` | `pdfmake` lacks a React component model, requires manual layout coordinates. `@react-pdf/renderer` is a proper React renderer |
| `@react-pdf/renderer` | `jspdf` | `jspdf` is canvas-based, not a layout engine, doesn't handle page breaks reliably |
| Resend SDK for PDF email | Supabase Edge Function | PDF buffers (50-300KB) should NOT be serialized into Edge Function bodies. Call Resend SDK directly from Next.js server action where the buffer lives |

### Installation
```bash
npm install @react-pdf/renderer
```

No other new packages required — all other dependencies already installed.

**Required config change in `next.config.ts`:**
```typescript
const nextConfig: NextConfig = {
  turbopack: {},
  serverExternalPackages: ['@react-pdf/renderer'],
}
```

---

## Architecture Patterns

### Recommended Project Structure
```
src/
├── lib/db/schema/
│   ├── work-orders.ts           # work_orders + work_order_line_items tables
│   ├── parts-catalog.ts         # parts_catalog + wo_templates tables
│   ├── quotes.ts                # quotes + quote_versions tables
│   ├── invoices.ts              # invoices + invoice_line_items tables
│   └── index.ts                 # add new exports
├── lib/db/schema/relations.ts   # add WO/quote/invoice relations
├── actions/
│   ├── work-orders.ts           # createWorkOrder, updateWorkOrder, deleteWorkOrder
│   ├── quotes.ts                # createQuote, sendQuote, approveQuote, declineQuote, extendQuote
│   ├── invoices.ts              # prepareInvoice, finalizeInvoice, getInvoices
│   └── parts-catalog.ts        # getCatalogItems, addCatalogItem, updateCatalogItem
├── lib/pdf/
│   ├── quote-pdf.tsx            # QuoteDocument React component for @react-pdf/renderer
│   └── invoice-pdf.tsx          # InvoiceDocument React component for @react-pdf/renderer
├── lib/quotes/
│   └── quote-token.ts           # signQuoteToken, verifyQuoteToken (same pattern as report-token.ts)
├── app/
│   ├── (app)/
│   │   ├── work-orders/         # Office WO list + detail pages
│   │   │   ├── page.tsx
│   │   │   └── [id]/
│   │   │       └── page.tsx
│   │   └── settings/
│   │       └── page.tsx         # Extend with WO templates + parts catalog + tax/labor settings
│   └── api/
│       ├── quotes/
│       │   ├── [token]/
│       │   │   └── route.ts     # Public approval page (no auth)
│       │   └── [id]/
│       │       └── pdf/
│       │           └── route.ts # PDF download (authenticated)
│       └── invoices/
│           └── [id]/
│               └── pdf/
│                   └── route.ts # PDF download (authenticated)
├── components/
│   ├── work-orders/             # WO list, WO detail, WO create form, flag-issue sheet
│   │   ├── wo-list.tsx
│   │   ├── wo-detail.tsx
│   │   ├── wo-create-form.tsx
│   │   └── flag-issue-sheet.tsx
│   ├── quotes/
│   │   ├── quote-approval-page.tsx   # Public-facing quote approval UI
│   │   └── quote-builder.tsx
│   └── invoices/
│       └── invoice-list.tsx
```

### Pattern 1: PDF Generation with @react-pdf/renderer in a Route Handler

**What:** PDF documents are React components using `@react-pdf/renderer` primitives. `renderToBuffer()` is called in a Next.js Route Handler (not a Server Action — Server Actions can't return binary `Response` objects). The buffer is returned directly as a PDF response, or base64-encoded for Resend attachment.

**When to use:** Every time a quote is sent or an invoice is generated.

**Required config change first** (must be in `next.config.ts` or PDF route handler will crash):
```typescript
// next.config.ts
const nextConfig: NextConfig = {
  turbopack: {},
  serverExternalPackages: ['@react-pdf/renderer'],  // REQUIRED
}
```

**PDF document component:**
```typescript
// src/lib/pdf/quote-pdf.tsx
// Source: https://react-pdf.org/components
// CRITICAL: All colors must be hex, NOT oklch() — @react-pdf uses a non-browser PDF renderer
// that does not support oklch color format (same constraint as MapLibre GL paint properties).
import { Document, Page, Text, View, StyleSheet, Image } from '@react-pdf/renderer'

const styles = StyleSheet.create({
  page: { padding: 40, backgroundColor: '#ffffff', fontFamily: 'Helvetica' },
  header: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 24 },
  logo: { width: 80, height: 40, objectFit: 'contain' },
  companyName: { fontSize: 20, fontWeight: 'bold', color: '#0f172a' },
  quoteTitle: { fontSize: 14, color: '#475569', marginBottom: 4 },
  section: { marginBottom: 16 },
  tableHeader: { flexDirection: 'row', backgroundColor: '#f1f5f9', padding: 8 },
  tableRow: { flexDirection: 'row', padding: 8, borderBottomWidth: 1, borderBottomColor: '#e2e8f0' },
  colDescription: { flex: 3, fontSize: 10, color: '#0f172a' },
  colQty: { flex: 1, fontSize: 10, color: '#475569', textAlign: 'right' },
  colPrice: { flex: 1, fontSize: 10, color: '#475569', textAlign: 'right' },
  colTotal: { flex: 1, fontSize: 10, fontWeight: 'bold', color: '#0f172a', textAlign: 'right' },
  totalsSection: { alignItems: 'flex-end', marginTop: 8 },
  totalRow: { flexDirection: 'row', marginBottom: 4 },
  totalLabel: { fontSize: 11, color: '#475569', width: 100, textAlign: 'right', marginRight: 16 },
  totalValue: { fontSize: 11, color: '#0f172a', width: 80, textAlign: 'right' },
  grandTotal: { fontSize: 13, fontWeight: 'bold', color: '#0f172a' },
})

export interface QuoteDocumentProps {
  quoteNumber: string
  quoteDate: string
  expirationDate: string
  companyName: string
  companyLogoUrl?: string | null
  customerName: string
  propertyAddress: string | null
  scopeOfWork: string
  lineItems: Array<{
    description: string
    quantity: number
    unit: string
    unitPrice: number
    total: number
    isOptional: boolean
    isTaxable: boolean
  }>
  subtotal: number
  taxRate: number
  taxAmount: number
  grandTotal: number
  termsAndConditions: string | null
  flaggedByTechName?: string | null
}

export function QuoteDocument(props: QuoteDocumentProps) {
  return (
    <Document>
      <Page size="LETTER" style={styles.page}>
        {/* Header */}
        <View style={styles.header}>
          <View>
            {props.companyLogoUrl && (
              <Image src={props.companyLogoUrl} style={styles.logo} />
            )}
            <Text style={styles.companyName}>{props.companyName}</Text>
          </View>
          <View>
            <Text style={styles.quoteTitle}>QUOTE #{props.quoteNumber}</Text>
            <Text style={{ fontSize: 10, color: '#475569' }}>Date: {props.quoteDate}</Text>
            <Text style={{ fontSize: 10, color: '#475569' }}>Expires: {props.expirationDate}</Text>
          </View>
        </View>

        {/* Customer info */}
        <View style={styles.section}>
          <Text style={{ fontSize: 11, fontWeight: 'bold', color: '#0f172a', marginBottom: 4 }}>
            Prepared for:
          </Text>
          <Text style={{ fontSize: 11, color: '#334155' }}>{props.customerName}</Text>
          {props.propertyAddress && (
            <Text style={{ fontSize: 11, color: '#475569' }}>{props.propertyAddress}</Text>
          )}
        </View>

        {/* Scope of work */}
        <View style={styles.section}>
          <Text style={{ fontSize: 11, fontWeight: 'bold', color: '#0f172a', marginBottom: 4 }}>
            Scope of Work
          </Text>
          <Text style={{ fontSize: 10, color: '#334155', lineHeight: 1.5 }}>
            {props.scopeOfWork}
          </Text>
        </View>

        {/* Line items */}
        <View style={styles.section}>
          <View style={styles.tableHeader}>
            <Text style={styles.colDescription}>Description</Text>
            <Text style={styles.colQty}>Qty</Text>
            <Text style={styles.colPrice}>Unit Price</Text>
            <Text style={styles.colTotal}>Total</Text>
          </View>
          {props.lineItems.map((item, i) => (
            <View key={i} style={styles.tableRow}>
              <Text style={styles.colDescription}>
                {item.description}{item.isOptional ? ' (optional)' : ''}
              </Text>
              <Text style={styles.colQty}>{item.quantity} {item.unit}</Text>
              <Text style={styles.colPrice}>${item.unitPrice.toFixed(2)}</Text>
              <Text style={styles.colTotal}>${item.total.toFixed(2)}</Text>
            </View>
          ))}
        </View>

        {/* Totals */}
        <View style={styles.totalsSection}>
          <View style={styles.totalRow}>
            <Text style={styles.totalLabel}>Subtotal</Text>
            <Text style={styles.totalValue}>${props.subtotal.toFixed(2)}</Text>
          </View>
          <View style={styles.totalRow}>
            <Text style={styles.totalLabel}>Tax ({(props.taxRate * 100).toFixed(1)}%)</Text>
            <Text style={styles.totalValue}>${props.taxAmount.toFixed(2)}</Text>
          </View>
          <View style={[styles.totalRow, { borderTopWidth: 1, borderTopColor: '#e2e8f0', paddingTop: 8 }]}>
            <Text style={[styles.totalLabel, styles.grandTotal]}>Total</Text>
            <Text style={[styles.totalValue, styles.grandTotal]}>${props.grandTotal.toFixed(2)}</Text>
          </View>
        </View>

        {/* Terms */}
        {props.termsAndConditions && (
          <View style={{ marginTop: 24 }}>
            <Text style={{ fontSize: 9, color: '#64748b', lineHeight: 1.4 }}>
              {props.termsAndConditions}
            </Text>
          </View>
        )}
      </Page>
    </Document>
  )
}
```

**Route Handler for PDF generation and download:**
```typescript
// src/app/api/quotes/[id]/pdf/route.ts
import { renderToBuffer } from '@react-pdf/renderer'
import { QuoteDocument } from '@/lib/pdf/quote-pdf'
import { adminDb } from '@/lib/db'
import { getCurrentUser } from '@/actions/auth'
import { redirect } from 'next/navigation'

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const user = await getCurrentUser()
  if (!user) redirect('/login')

  const { id } = await params

  // Fetch quote data (adminDb — auth already verified above)
  const quoteData = await fetchQuoteData(id)
  if (!quoteData) return new Response('Not found', { status: 404 })

  const buffer = await renderToBuffer(<QuoteDocument {...quoteData} />)

  return new Response(buffer, {
    status: 200,
    headers: {
      'Content-Type': 'application/pdf',
      'Content-Disposition': `attachment; filename="quote-${quoteData.quoteNumber}.pdf"`,
    },
  })
}
```

**Sending PDF email via Resend SDK (from Next.js server action, NOT Edge Function):**
```typescript
// src/actions/quotes.ts
import { Resend } from 'resend'
import { renderToBuffer } from '@react-pdf/renderer'
import { QuoteDocument } from '@/lib/pdf/quote-pdf'
import { renderAsync } from '@react-email/render'
import { QuoteEmailTemplate } from '@/lib/emails/quote-email'

const resend = new Resend(process.env.RESEND_API_KEY)

export async function sendQuote(quoteId: string) {
  // ... auth + fetch quote data ...

  // Generate PDF buffer
  const pdfBuffer = await renderToBuffer(<QuoteDocument {...quoteDocumentProps} />)

  // Generate approval token (same pattern as report tokens)
  const approvalToken = await signQuoteToken(quoteId)
  const approvalUrl = `${process.env.NEXT_PUBLIC_APP_URL}/api/quotes/${approvalToken}`

  // Render email HTML
  const emailHtml = await renderAsync(QuoteEmailTemplate({ ...emailProps, approvalUrl }))

  // Send email with PDF attachment via Resend SDK (not Edge Function)
  await resend.emails.send({
    from: `${companyName} <quotes@poolco.app>`,
    to: [customerEmail],
    subject: `Quote #${quoteNumber} from ${companyName}`,
    html: emailHtml,
    attachments: [
      {
        filename: `quote-${quoteNumber}.pdf`,
        content: Buffer.from(pdfBuffer).toString('base64'),
      },
    ],
  })

  // Update WO status to 'quoted'
  await withRls(token, (db) =>
    db.update(workOrders).set({ status: 'quoted' }).where(eq(workOrders.id, workOrderId))
  )
}
```

### Pattern 2: Public Quote Approval Page (JWT Token, No Auth)

**What:** Public unauthenticated route at `/api/quotes/[token]` — same exact pattern as the Phase 5 service report token. A signed JWT contains `quoteId` + `exp`. The customer approves, declines, or requests changes via a Next.js Route Handler with `POST` actions.

**When to use:** Quote approval page and all three customer response actions.

```typescript
// src/lib/quotes/quote-token.ts
// Source: Mirrors src/lib/reports/report-token.ts exactly
import { SignJWT, jwtVerify } from 'jose'

const SECRET = new TextEncoder().encode(process.env.QUOTE_TOKEN_SECRET!)

export async function signQuoteToken(quoteId: string): Promise<string> {
  return new SignJWT({ quoteId })
    .setProtectedHeader({ alg: 'HS256' })
    .setExpirationTime('90d')  // quote expiry is tracked in DB; token just needs to last
    .sign(SECRET)
}

export async function verifyQuoteToken(token: string): Promise<{ quoteId: string } | null> {
  try {
    const { payload } = await jwtVerify(token, SECRET)
    return { quoteId: payload.quoteId as string }
  } catch {
    return null
  }
}
```

**Approval Route Handler (handles GET for the page, POST for responses):**
```typescript
// src/app/api/quotes/[token]/route.ts
// GET: render the public approval page
// POST with action=approve|decline|request_changes: record customer response
export async function GET(_req: Request, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params
  const payload = await verifyQuoteToken(token)
  if (!payload) return new Response('Link expired or invalid', { status: 410 })

  const quoteData = await fetchPublicQuoteData(payload.quoteId)  // adminDb, no RLS needed
  if (!quoteData) return new Response('Quote not found', { status: 404 })

  // Return HTML for the branded approval page
  // (Or redirect to a Next.js page route — see Pattern 3 for the page approach)
  const html = await renderQuoteApprovalPage(quoteData)
  return new Response(html, { status: 200, headers: { 'Content-Type': 'text/html; charset=utf-8' } })
}

export async function POST(req: Request, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params
  const payload = await verifyQuoteToken(token)
  if (!payload) return Response.json({ error: 'Invalid token' }, { status: 410 })

  const { action, signatureName, declineReason, changeNote, selectedOptionals } = await req.json()

  // Use adminDb — customer has no Supabase auth
  switch (action) {
    case 'approve':
      await adminDb.update(quotes).set({
        status: 'approved',
        approved_at: new Date(),
        signature_name: signatureName,
        approved_optional_item_ids: selectedOptionals,
      }).where(eq(quotes.id, payload.quoteId))
      // Update parent WO status to 'approved'
      await updateWoStatusFromQuoteApproval(payload.quoteId)
      break
    case 'decline':
      await adminDb.update(quotes).set({
        status: 'declined',
        declined_at: new Date(),
        decline_reason: declineReason,
      }).where(eq(quotes.id, payload.quoteId))
      break
    case 'request_changes':
      await adminDb.update(quotes).set({
        status: 'changes_requested',
        change_note: changeNote,
      }).where(eq(quotes.id, payload.quoteId))
      break
  }

  // Notify office (in-app alert via adminDb insert into alerts)
  await notifyOfficeOfQuoteResponse(payload.quoteId, action)

  return Response.json({ success: true })
}
```

**Approval page as a Next.js page route (recommended over HTML-in-route):**
```
app/
└── quote/
    └── [token]/
        └── page.tsx   # Server component — renders QuoteApprovalPage
```

The page is outside `(app)` layout (no sidebar), fetches data server-side using `verifyQuoteToken` + `adminDb`. The interactive approve/decline/change buttons are client components that call the POST endpoint. This is cleaner than rendering raw HTML from the route handler.

### Pattern 3: Work Order Schema Design

**What:** The core data model with RLS patterns following every existing table.

```typescript
// src/lib/db/schema/work-orders.ts
import { boolean, integer, numeric, pgTable, text, timestamp, uuid, jsonb, index } from 'drizzle-orm/pg-core'
import { pgPolicy } from 'drizzle-orm/pg-core'
import { authenticatedRole } from 'drizzle-orm/supabase'
import { sql } from 'drizzle-orm'
import { orgs } from './orgs'
import { customers } from './customers'
import { pools } from './pools'
import { profiles } from './profiles'

// WO Status enum as text (not pgEnum) for Phase flexibility — same convention as service_visits.status
// 'draft' | 'quoted' | 'approved' | 'scheduled' | 'in_progress' | 'complete' | 'invoiced' | 'cancelled'

// WO Priority as text:
// 'low' | 'normal' | 'high' | 'emergency'

// WO Category as text:
// 'pump' | 'filter' | 'heater' | 'plumbing_leak' | 'surface' | 'electrical' | 'other'

export const workOrders = pgTable('work_orders', {
  id: uuid('id').defaultRandom().primaryKey(),
  org_id: uuid('org_id').notNull().references(() => orgs.id, { onDelete: 'cascade' }),
  customer_id: uuid('customer_id').notNull().references(() => customers.id, { onDelete: 'cascade' }),
  pool_id: uuid('pool_id').references(() => pools.id, { onDelete: 'set null' }),
  // Who created the WO
  created_by_id: uuid('created_by_id').references(() => profiles.id, { onDelete: 'set null' }),
  // Assigned tech
  assigned_tech_id: uuid('assigned_tech_id').references(() => profiles.id, { onDelete: 'set null' }),
  // Follow-up chain
  parent_wo_id: uuid('parent_wo_id'),  // Self-ref; no FK in Drizzle — use app-level integrity
  // Core fields
  title: text('title').notNull(),
  description: text('description'),
  category: text('category').notNull().default('other'),
  priority: text('priority').notNull().default('normal'),
  status: text('status').notNull().default('draft'),
  severity: text('severity'),  // 'routine' | 'urgent' | 'emergency' — from tech flag
  // Scheduling
  target_date: text('target_date'),    // YYYY-MM-DD local date string (per date-utils.ts pattern)
  // Completion
  completed_at: timestamp('completed_at', { withTimezone: true }),
  completion_notes: text('completion_notes'),
  completion_photo_paths: jsonb('completion_photo_paths').$type<string[]>(),
  // Cancellation
  cancelled_at: timestamp('cancelled_at', { withTimezone: true }),
  cancelled_by_id: uuid('cancelled_by_id').references(() => profiles.id, { onDelete: 'set null' }),
  cancel_reason: text('cancel_reason'),
  // Tech flagging metadata
  flagged_by_tech_id: uuid('flagged_by_tech_id').references(() => profiles.id, { onDelete: 'set null' }),
  flagged_from_visit_id: uuid('flagged_from_visit_id'),  // service_visit.id — no FK for simplicity
  // Tax exempt override for this WO specifically
  tax_exempt: boolean('tax_exempt').notNull().default(false),
  // Whole-order discount
  discount_type: text('discount_type'),   // 'percent' | 'fixed'
  discount_value: numeric('discount_value', { precision: 10, scale: 2 }),
  discount_reason: text('discount_reason'),
  // Template tracking
  template_id: uuid('template_id'),  // wo_templates.id — no FK for simplicity
  // Activity log (JSONB array of events for the timeline)
  activity_log: jsonb('activity_log').$type<Array<{
    type: string
    at: string
    by_id: string | null
    note: string | null
  }>>(),
  created_at: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  updated_at: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
}, (table) => [
  index('work_orders_org_id_idx').on(table.org_id),
  index('work_orders_customer_id_idx').on(table.customer_id),
  index('work_orders_status_idx').on(table.status),
  index('work_orders_assigned_tech_idx').on(table.assigned_tech_id),

  // RLS: all org members can view WOs
  pgPolicy('work_orders_select_policy', {
    for: 'select', to: authenticatedRole,
    using: sql`org_id = (select auth.jwt() ->> 'org_id')::uuid`,
  }),
  // RLS: owner + office + tech can create WOs (tech creates via field flag)
  pgPolicy('work_orders_insert_policy', {
    for: 'insert', to: authenticatedRole,
    withCheck: sql`
      org_id = (select auth.jwt() ->> 'org_id')::uuid
      AND (select auth.jwt() ->> 'user_role') IN ('owner', 'office', 'tech')
    `,
  }),
  // RLS: owner + office can update; techs can update their assigned WOs (mark arrived/complete)
  pgPolicy('work_orders_update_policy', {
    for: 'update', to: authenticatedRole,
    using: sql`
      org_id = (select auth.jwt() ->> 'org_id')::uuid
      AND (
        (select auth.jwt() ->> 'user_role') IN ('owner', 'office')
        OR (
          (select auth.jwt() ->> 'user_role') = 'tech'
          AND assigned_tech_id = (select auth.jwt() ->> 'sub')::uuid
        )
      )
    `,
    withCheck: sql`
      org_id = (select auth.jwt() ->> 'org_id')::uuid
      AND (
        (select auth.jwt() ->> 'user_role') IN ('owner', 'office')
        OR (
          (select auth.jwt() ->> 'user_role') = 'tech'
          AND assigned_tech_id = (select auth.jwt() ->> 'sub')::uuid
        )
      )
    `,
  }),
  // RLS: owner only can delete
  pgPolicy('work_orders_delete_policy', {
    for: 'delete', to: authenticatedRole,
    using: sql`
      org_id = (select auth.jwt() ->> 'org_id')::uuid
      AND (select auth.jwt() ->> 'user_role') = 'owner'
    `,
  }),
]).enableRLS()

export const workOrderLineItems = pgTable('work_order_line_items', {
  id: uuid('id').defaultRandom().primaryKey(),
  org_id: uuid('org_id').notNull().references(() => orgs.id, { onDelete: 'cascade' }),
  work_order_id: uuid('work_order_id').notNull().references(() => workOrders.id, { onDelete: 'cascade' }),
  // Catalog reference (optional — null means custom item)
  catalog_item_id: uuid('catalog_item_id'),
  // Line item details
  description: text('description').notNull(),
  item_type: text('item_type').notNull().default('part'),  // 'part' | 'labor' | 'other'
  labor_type: text('labor_type'),  // 'hourly' | 'flat_rate' — only for item_type='labor'
  quantity: numeric('quantity', { precision: 10, scale: 3 }).notNull().default('1'),
  unit: text('unit').notNull().default('each'),  // 'each' | 'hour' | 'foot' | 'gallon' | etc.
  unit_cost: numeric('unit_cost', { precision: 10, scale: 2 }),  // cost price (never shown to customer)
  unit_price: numeric('unit_price', { precision: 10, scale: 2 }).notNull(),  // sell price
  markup_pct: numeric('markup_pct', { precision: 5, scale: 2 }),  // applied markup (for audit)
  // Per-item discount
  discount_type: text('discount_type'),   // 'percent' | 'fixed'
  discount_value: numeric('discount_value', { precision: 10, scale: 2 }),
  // Tax
  is_taxable: boolean('is_taxable').notNull().default(true),
  // Optional item (customer can include/exclude)
  is_optional: boolean('is_optional').notNull().default(false),
  // Actual hours logged by tech at completion (for hourly labor items)
  actual_hours: numeric('actual_hours', { precision: 6, scale: 2 }),
  sort_order: integer('sort_order').notNull().default(0),
  created_at: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
}, (table) => [
  index('wo_line_items_wo_id_idx').on(table.work_order_id),
  // RLS: same as work_orders — all org members read, owner+office write
  pgPolicy('wo_line_items_select_policy', {
    for: 'select', to: authenticatedRole,
    using: sql`org_id = (select auth.jwt() ->> 'org_id')::uuid`,
  }),
  pgPolicy('wo_line_items_insert_policy', {
    for: 'insert', to: authenticatedRole,
    withCheck: sql`
      org_id = (select auth.jwt() ->> 'org_id')::uuid
      AND (select auth.jwt() ->> 'user_role') IN ('owner', 'office', 'tech')
    `,
  }),
  pgPolicy('wo_line_items_update_policy', {
    for: 'update', to: authenticatedRole,
    using: sql`
      org_id = (select auth.jwt() ->> 'org_id')::uuid
      AND (select auth.jwt() ->> 'user_role') IN ('owner', 'office')
    `,
    withCheck: sql`
      org_id = (select auth.jwt() ->> 'org_id')::uuid
      AND (select auth.jwt() ->> 'user_role') IN ('owner', 'office')
    `,
  }),
  pgPolicy('wo_line_items_delete_policy', {
    for: 'delete', to: authenticatedRole,
    using: sql`
      org_id = (select auth.jwt() ->> 'org_id')::uuid
      AND (select auth.jwt() ->> 'user_role') IN ('owner', 'office')
    `,
  }),
]).enableRLS()
```

### Pattern 4: Invoice Number Generation (Atomic Per-Org Counter)

**What:** Invoice numbers must be unique per org, auto-incrementing, and safe under concurrent inserts. The correct pattern for Postgres is an atomic `UPDATE ... RETURNING` on a counter row, not an application-level `SELECT max(invoice_number) + 1` (which has a race condition).

**Recommendation:** Store a `next_invoice_number` integer in `org_settings` (or a separate `invoice_sequences` table). Increment atomically inside a Drizzle transaction:

```typescript
// src/actions/invoices.ts — inside finalizeInvoice()
// Atomic counter increment — safe for concurrent invoice creation
const invoicePrefix = orgSettings.invoice_number_prefix ?? 'INV'

// Atomic: increment + return new value in one statement
await adminDb.execute(sql`
  UPDATE org_settings
  SET next_invoice_number = next_invoice_number + 1
  WHERE org_id = ${orgId}
`)
const counterRows = await adminDb
  .select({ next: orgSettings.next_invoice_number })
  .from(orgSettings)
  .where(eq(orgSettings.org_id, orgId))
  .limit(1)

// Format: INV-0001, INV-0042, etc.
const invoiceNumber = `${invoicePrefix}-${String(counterRows[0].next - 1).padStart(4, '0')}`
```

**Alternative (cleaner):** Use a Postgres sequence per org. However, creating per-org sequences dynamically requires raw SQL and can't be declared in Drizzle schema files. The `org_settings.next_invoice_number` counter approach is simpler and correct for low concurrency (pool service companies).

### Pattern 5: Activity Log Pattern (JSONB Timeline)

**What:** The WO detail timeline ("every status change, note, photo, quote sent, customer response") is stored as a JSONB array in `work_orders.activity_log`. Appending an event uses Postgres `jsonb_insert` or application-side array concat.

**When to use:** Every WO status transition and significant event triggers an append.

```typescript
// Append to activity log — safe concurrent-append via SQL function
// Called from server actions on every WO status change
async function appendActivityEvent(
  db: DrizzleTx,
  workOrderId: string,
  event: { type: string; at: string; by_id: string | null; note: string | null }
) {
  await db.execute(sql`
    UPDATE work_orders
    SET
      activity_log = COALESCE(activity_log, '[]'::jsonb) || ${JSON.stringify([event])}::jsonb,
      updated_at = NOW()
    WHERE id = ${workOrderId}
  `)
}
```

**Alternative:** Separate `work_order_activity` table with one row per event. More queryable, but adds a JOIN to every WO detail fetch. JSONB array is sufficient for Phase 6 since the timeline is only displayed on the detail page and never filtered.

**Recommendation:** Use JSONB for Phase 6 simplicity. Document that Phase 9 (Reports) may migrate to a separate table if event-level queries are needed.

### Pattern 6: Quote Versioning

**What:** Each time office edits a quote, a new version record is created. The `quotes` table stores the current version; `quote_versions` stores all prior versions with snapshot of line items.

```typescript
// src/lib/db/schema/quotes.ts
export const quotes = pgTable('quotes', {
  id: uuid('id').defaultRandom().primaryKey(),
  org_id: uuid('org_id').notNull().references(() => orgs.id, { onDelete: 'cascade' }),
  work_order_id: uuid('work_order_id').notNull().references(() => workOrders.id, { onDelete: 'cascade' }),
  // Display number
  quote_number: text('quote_number').notNull(),  // e.g. "Q-0042"
  version: integer('version').notNull().default(1),
  status: text('status').notNull().default('draft'),
  // 'draft' | 'sent' | 'approved' | 'declined' | 'expired' | 'changes_requested'
  // Expiration
  expires_at: timestamp('expires_at', { withTimezone: true }),
  // Customer response
  approved_at: timestamp('approved_at', { withTimezone: true }),
  signature_name: text('signature_name'),
  approved_optional_item_ids: jsonb('approved_optional_item_ids').$type<string[]>(),
  declined_at: timestamp('declined_at', { withTimezone: true }),
  decline_reason: text('decline_reason'),
  change_note: text('change_note'),
  // Snapshot of sent quote (for PDF regeneration and audit)
  snapshot_json: jsonb('snapshot_json'),
  sent_at: timestamp('sent_at', { withTimezone: true }),
  created_at: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  updated_at: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
}, (table) => [
  index('quotes_wo_id_idx').on(table.work_order_id),
  // RLS: owner + office manage quotes; customers access via public token endpoint only
  pgPolicy('quotes_select_policy', {
    for: 'select', to: authenticatedRole,
    using: sql`
      org_id = (select auth.jwt() ->> 'org_id')::uuid
      AND (select auth.jwt() ->> 'user_role') IN ('owner', 'office')
    `,
  }),
  pgPolicy('quotes_insert_policy', {
    for: 'insert', to: authenticatedRole,
    withCheck: sql`
      org_id = (select auth.jwt() ->> 'org_id')::uuid
      AND (select auth.jwt() ->> 'user_role') IN ('owner', 'office')
    `,
  }),
  pgPolicy('quotes_update_policy', {
    for: 'update', to: authenticatedRole,
    using: sql`
      org_id = (select auth.jwt() ->> 'org_id')::uuid
      AND (select auth.jwt() ->> 'user_role') IN ('owner', 'office')
    `,
    withCheck: sql`
      org_id = (select auth.jwt() ->> 'org_id')::uuid
      AND (select auth.jwt() ->> 'user_role') IN ('owner', 'office')
    `,
  }),
  pgPolicy('quotes_delete_policy', {
    for: 'delete', to: authenticatedRole,
    using: sql`
      org_id = (select auth.jwt() ->> 'org_id')::uuid
      AND (select auth.jwt() ->> 'user_role') = 'owner'
    `,
  }),
]).enableRLS()
```

**Version revision flow:**
```typescript
// When office edits a sent quote:
// 1. Snapshot current version into quote_versions (JSONB copy)
// 2. Increment quote.version
// 3. Update quote.status back to 'draft'
// 4. Re-send: quote.status → 'sent', quote.sent_at = now(), new version number shown
```

### Pattern 7: Tech Field Flagging in StopWorkflow

**What:** A `FlagIssueSheet` bottom sheet triggered from inside `StopWorkflow`. The sheet uses the same photo capture + notes pattern already in the stop workflow, but is a much simpler form (category picker + severity + note + photos). On submit, it calls `createWorkOrder` server action with `status: 'draft'`, `flagged_by_tech_id`, and `flagged_from_visit_id` populated.

**When to use:** Tech taps "Flag Issue" button in the StopWorkflow component.

```typescript
// In StopWorkflow, add a "Flag Issue" action:
<Button variant="outline" size="sm" onClick={() => setFlagIssueOpen(true)}>
  <FlagIcon className="h-4 w-4 mr-2" />
  Flag Issue
</Button>

// FlagIssueSheet — minimal form (10-second flow target):
// 1. Category picker (7 options — pill buttons, not dropdown)
// 2. Severity (3 options — pill buttons)
// 3. Note field (one-line textarea, voice dictation hint)
// 4. Photos (reuse PhotoCapture component)
// 5. Submit → createWorkOrder({ status: 'draft', category, severity, notes, photoStoragePaths, flaggedByTechId, flaggedFromVisitId })
```

The `createWorkOrder` server action creates the WO + uploads photos to a new Supabase Storage bucket: `work-order-photos` (separate from `visit-photos`). Storage path: `{org_id}/work-orders/{wo_id}/{filename}.webp`.

### Anti-Patterns to Avoid

- **PDF generation in a Server Action:** Server Actions cannot return binary `Response` objects — they must return serializable values. PDF generation (`renderToBuffer`) must live in a **Route Handler** (`GET /api/quotes/[id]/pdf`) or the buffer must be base64-encoded and stored somewhere. For email attachment, generate the buffer in the server action that calls Resend (not in a separate route handler). The pattern: `sendQuote` server action generates the PDF buffer inline and passes it as a base64 attachment to Resend.
- **Sending PDF buffers through Supabase Edge Functions:** The Edge Function pattern (used for SMS pre-arrival and service report emails) is designed for small JSON payloads. A PDF attachment (50-300KB) base64-encoded would be 67-400KB in the Edge Function body — wasteful and potentially over the Edge Function cold-start time budget. Call Resend SDK directly from the Next.js server action.
- **Using `oklch()` colors in @react-pdf/renderer styles:** `@react-pdf/renderer` uses its own PDF renderer, not a browser. `oklch()` will crash PDF generation. All colors in `StyleSheet.create()` must be hex strings. Same constraint as MapLibre GL paint properties.
- **Storing quote snapshots without a JSONB snapshot column:** When a quote is revised (v1 → v2), the old line items must be preserved for audit. Without `snapshot_json` or a `quote_versions` table, there is no audit trail. Store `snapshot_json` on the `quotes` table before each revision.
- **Using `new Date().toISOString().split('T')[0]` for WO target dates:** Per MEMORY.md critical pitfall — always use `toLocalDateString()` from `@/lib/date-utils` for YYYY-MM-DD local date strings. WO `target_date` is stored as `text('target_date')` to match this pattern.
- **Correlated subquery in WO list RLS policy:** Per MEMORY.md, never use correlated SQL subqueries in RLS-protected tables inside `withRls` transactions. WO list queries must use `LEFT JOIN` for tech-profile filtering, not `WHERE tech_id = (SELECT id FROM profiles WHERE ...)`.
- **Writing inside useLiveQuery for offline WO draft state:** If the tech field flag sheet uses Dexie for offline persistence (unlikely, but possible), any Dexie write must happen in a `useEffect`, not inside a `useLiveQuery` callback.

---

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| PDF document layout | Custom HTML→CSS→print PDF pipeline | `@react-pdf/renderer` | Correct page breaks, columns, headers, fonts — browser print-to-PDF is inconsistent across OS/browser combinations |
| Email with PDF attachment | Custom multipart MIME assembly | Resend SDK `attachments` array | Resend handles MIME boundary, Content-Transfer-Encoding, attachment headers automatically |
| Public quote approval JWT | Custom HMAC cookie or URL query param | `jose` SignJWT (already in Next.js) | jose is edge-compatible, handles expiry, tamper-proof, already used for report tokens |
| Concurrent invoice numbering | `SELECT MAX(invoice_number) + 1` | Atomic `UPDATE ... SET n = n + 1 RETURNING n` | Race condition: two concurrent inserts both read the same max and produce the same number |
| Line item totals calculation | Real-time JS calculation in renders | Server-computed, stored in `line_total` column (or computed in action) | Floating point precision errors compound across line items; canonical total must be server-authoritative |
| Parts search/autocomplete | Custom fuzzy search | Postgres `ILIKE '%query%'` with existing Drizzle query | No need for Elasticsearch or a dedicated search library for a catalog of <1000 items |

**Key insight:** The existing project already has all the infrastructure needed. Phase 6 is about composing new tables and actions using established patterns — not introducing new systems.

---

## Common Pitfalls

### Pitfall 1: @react-pdf/renderer Crashes Without serverExternalPackages
**What goes wrong:** `renderToBuffer()` throws `TypeError: ba.Component is not a constructor` or `PDFDocument is not a constructor` when called from a Next.js Route Handler.
**Why it happens:** Next.js bundles `@react-pdf/renderer` server-side, and the bundled version has incompatible React internals. The library needs to run as a native Node.js module.
**How to avoid:** Add `serverExternalPackages: ['@react-pdf/renderer']` to `next.config.ts` before writing any PDF generation code. Verify by running a test PDF generation in dev.
**Warning signs:** Crash during first PDF generation attempt, error mentions "Component is not a constructor".

### Pitfall 2: oklch() Colors in @react-pdf StyleSheet
**What goes wrong:** PDF generation throws an error or silently produces black/white output instead of the intended color.
**Why it happens:** `@react-pdf/renderer` does not use a browser — its PDF renderer parses colors using a custom CSS color parser that does not support `oklch()`. Tailwind v4 uses `oklch()` for its design tokens.
**How to avoid:** All `StyleSheet.create()` values must use hex colors (`#0f172a`, `#f1f5f9`, etc.). Never pull Tailwind CSS variables or oklch values into `@react-pdf/renderer` components. Maintain a shared `PDF_COLORS` constant object with hex values.
**Warning signs:** PDF renders with no color, or PDF generation throws a color-parsing error.

### Pitfall 3: Quote Token vs Report Token — Different Secrets
**What goes wrong:** Using the same `REPORT_TOKEN_SECRET` for both service report tokens and quote approval tokens means an attacker with one valid report token could theoretically probe the quote approval endpoint.
**Why it happens:** Copy-paste from `report-token.ts` without changing the secret env var.
**How to avoid:** Add a separate `QUOTE_TOKEN_SECRET` environment variable. `src/lib/quotes/quote-token.ts` uses `QUOTE_TOKEN_SECRET`. Document in the planner that a new env var is needed.
**Warning signs:** `signQuoteToken` referencing `process.env.REPORT_TOKEN_SECRET`.

### Pitfall 4: Resend SDK Direct Call vs Edge Function for PDF Emails
**What goes wrong:** Developer routes quote email through the existing `send-service-report` Edge Function by stuffing the PDF buffer in the payload, causing over-limit payloads or Edge Function timeouts.
**Why it happens:** Reusing the existing Edge Function pattern without considering that PDF attachments are binary and large.
**How to avoid:** Quote and invoice emails (with PDF attachments) call Resend SDK DIRECTLY from the Next.js server action. Only pre-arrival and service report emails go through Edge Functions (no attachments). Keep the boundary clear: Edge Functions = notifications without attachments; Next.js server actions = emails with attachments.
**Warning signs:** Base64-encoded PDF being JSON-serialized into a Supabase Edge Function invoke body.

### Pitfall 5: Customer-Facing Quote Approval — No Supabase Auth
**What goes wrong:** The `quotes` table RLS policy blocks reads for unauthenticated users. The quote approval Route Handler uses `adminDb` to bypass RLS — but if a developer accidentally uses `withRls(token, ...)` where token is null (no logged-in user), the query returns zero rows.
**Why it happens:** Inconsistency between the auth-required app and the public approval page.
**How to avoid:** The public quote approval route handler MUST use `adminDb` (service role). Never use `withRls` for customer-facing unauthenticated routes. Add a comment to `GET /api/quotes/[token]/route.ts` clarifying this is intentional.
**Warning signs:** Quote approval page returns 404 or "not authorized" for the customer.

### Pitfall 6: Race Condition on Invoice Number Generation
**What goes wrong:** Two concurrent "Finalize Invoice" clicks create two invoices with the same number.
**Why it happens:** Application reads `next_invoice_number`, increments in JS, and writes back — another request reads the same value before the write completes.
**How to avoid:** Use a Postgres-level atomic increment: `UPDATE org_settings SET next_invoice_number = next_invoice_number + 1 WHERE org_id = $1 RETURNING next_invoice_number`. Read the returned value; never compute from SELECT + JS.
**Warning signs:** Duplicate invoice numbers in the invoice list.

### Pitfall 7: WO Photos Storage Bucket — Missing or Wrong Bucket
**What goes wrong:** Photos attached to WOs (both from tech field flagging and completion photos) go to the wrong Supabase Storage bucket, or the bucket doesn't exist yet.
**Why it happens:** The existing `visit-photos` bucket exists for Phase 3 service visits. WO photos should go to a separate `work-order-photos` bucket for clean separation and independent RLS.
**How to avoid:** Create `work-order-photos` bucket in Supabase with the same RLS policies as `visit-photos` (path-based: `{org_id}/work-orders/{wo_id}/...`). Add bucket creation to the planner's setup checklist.
**Warning signs:** Photo uploads failing with "Bucket not found" error.

### Pitfall 8: Tech Update RLS on work_orders — assigned_tech_id UUID Comparison
**What goes wrong:** The tech UPDATE RLS policy uses `assigned_tech_id = (select auth.jwt() ->> 'sub')::uuid` — but `auth.jwt() ->> 'sub'` is the auth UUID, and `assigned_tech_id` references `profiles.id` which is the same UUID. If the UUID types don't align (text vs UUID), the cast fails.
**Why it happens:** `auth.jwt() ->> 'sub'` returns text; casting to `::uuid` is required. This is the same pattern used in `service_visits_update_policy` — it is correct. Just verify the cast is present.
**How to avoid:** Always include `::uuid` cast when comparing JWT string claims to UUID columns. Cross-reference the existing `service_visits_update_policy` for the correct pattern.
**Warning signs:** Tech update permission denied even for their assigned WO.

### Pitfall 9: Line Item Totals Floating Point
**What goes wrong:** Line item totals displayed as `$14.999999999` instead of `$15.00`.
**Why it happens:** JavaScript floating-point arithmetic: `4.99 * 3 = 14.969999...`.
**How to avoid:** Store `unit_price`, `quantity`, `discount_value`, `markup_pct` as `numeric` (exact decimal) in Postgres. Compute the `line_total` in Postgres (not JS) using `numeric` arithmetic. Return already-formatted values or use `toFixed(2)` only for display — never for storage.
**Warning signs:** Invoice totals don't add up, or customer sees $14.99... on the approval page.

---

## Code Examples

### org_settings Schema Extensions for Phase 6

```typescript
// Add to existing src/lib/db/schema/org-settings.ts — Phase 6 additions
// Add these fields to the existing orgSettings pgTable definition:

// Work order settings
default_hourly_rate: numeric('default_hourly_rate', { precision: 10, scale: 2 }),
default_parts_markup_pct: numeric('default_parts_markup_pct', { precision: 5, scale: 2 }).default('30'),
default_tax_rate: numeric('default_tax_rate', { precision: 5, scale: 4 }).default('0.0875'),
default_quote_expiry_days: integer('default_quote_expiry_days').default(30),
invoice_number_prefix: text('invoice_number_prefix').default('INV'),
next_invoice_number: integer('next_invoice_number').notNull().default(1),
next_quote_number: integer('next_quote_number').notNull().default(1),
quote_terms_and_conditions: text('quote_terms_and_conditions'),
// Tax exempt flag is per-customer on the customers table (already set up for Phase 6)
// Notification toggles for WO lifecycle (reuses existing notification settings pattern)
wo_notify_office_on_flag: boolean('wo_notify_office_on_flag').notNull().default(true),
wo_notify_customer_on_scheduled: boolean('wo_notify_customer_on_scheduled').notNull().default(true),
wo_notify_customer_on_complete: boolean('wo_notify_customer_on_complete').notNull().default(true),
```

### Parts Catalog Schema

```typescript
// src/lib/db/schema/parts-catalog.ts
export const partsCatalog = pgTable('parts_catalog', {
  id: uuid('id').defaultRandom().primaryKey(),
  org_id: uuid('org_id').notNull().references(() => orgs.id, { onDelete: 'cascade' }),
  name: text('name').notNull(),
  description: text('description'),
  category: text('category'),  // 'pump', 'filter', 'chemical', 'plumbing', 'electrical', 'other'
  sku: text('sku'),
  default_cost_price: numeric('default_cost_price', { precision: 10, scale: 2 }),
  default_sell_price: numeric('default_sell_price', { precision: 10, scale: 2 }),
  default_unit: text('default_unit').notNull().default('each'),
  is_labor: boolean('is_labor').notNull().default(false),  // true = labor line item type
  is_active: boolean('is_active').notNull().default(true),
  created_at: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  updated_at: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
}, (table) => [
  index('parts_catalog_org_id_idx').on(table.org_id),
  // RLS: all org members can read catalog (tech sees parts when adding at completion)
  pgPolicy('parts_catalog_select_policy', {
    for: 'select', to: authenticatedRole,
    using: sql`org_id = (select auth.jwt() ->> 'org_id')::uuid`,
  }),
  pgPolicy('parts_catalog_insert_policy', {
    for: 'insert', to: authenticatedRole,
    withCheck: sql`
      org_id = (select auth.jwt() ->> 'org_id')::uuid
      AND (select auth.jwt() ->> 'user_role') IN ('owner', 'office')
    `,
  }),
  pgPolicy('parts_catalog_update_policy', {
    for: 'update', to: authenticatedRole,
    using: sql`
      org_id = (select auth.jwt() ->> 'org_id')::uuid
      AND (select auth.jwt() ->> 'user_role') IN ('owner', 'office')
    `,
    withCheck: sql`
      org_id = (select auth.jwt() ->> 'org_id')::uuid
      AND (select auth.jwt() ->> 'user_role') IN ('owner', 'office')
    `,
  }),
  pgPolicy('parts_catalog_delete_policy', {
    for: 'delete', to: authenticatedRole,
    using: sql`
      org_id = (select auth.jwt() ->> 'org_id')::uuid
      AND (select auth.jwt() ->> 'user_role') IN ('owner', 'office')
    `,
  }),
]).enableRLS()

// WO Templates — save a WO structure as a reusable starting point
export const woTemplates = pgTable('wo_templates', {
  id: uuid('id').defaultRandom().primaryKey(),
  org_id: uuid('org_id').notNull().references(() => orgs.id, { onDelete: 'cascade' }),
  name: text('name').notNull(),
  description: text('description'),
  category: text('category'),
  default_priority: text('default_priority').notNull().default('normal'),
  // Pre-filled line items snapshot
  line_items_snapshot: jsonb('line_items_snapshot').$type<Array<{
    description: string
    item_type: string
    labor_type?: string
    quantity: number
    unit: string
    unit_price: number
    is_optional: boolean
    is_taxable: boolean
    sort_order: number
  }>>(),
  is_active: boolean('is_active').notNull().default(true),
  created_at: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  updated_at: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
}, (table) => [
  index('wo_templates_org_id_idx').on(table.org_id),
  pgPolicy('wo_templates_select_policy', {
    for: 'select', to: authenticatedRole,
    using: sql`org_id = (select auth.jwt() ->> 'org_id')::uuid`,
  }),
  pgPolicy('wo_templates_write_policy', {
    for: 'all', to: authenticatedRole,
    using: sql`
      org_id = (select auth.jwt() ->> 'org_id')::uuid
      AND (select auth.jwt() ->> 'user_role') IN ('owner', 'office')
    `,
  }),
]).enableRLS()
```

### WO List Query with Priority Sort (LEFT JOIN pattern)

```typescript
// src/actions/work-orders.ts
// Source: project pattern — withRls + LEFT JOIN (per MEMORY.md)
export async function getWorkOrders(filters?: {
  status?: string[]
  priority?: string
  techId?: string
  customerId?: string
}) {
  const token = await getRlsToken()
  if (!token) return []

  return withRls(token, async (db) => {
    return db
      .select({
        id: workOrders.id,
        title: workOrders.title,
        category: workOrders.category,
        status: workOrders.status,
        priority: workOrders.priority,
        targetDate: workOrders.target_date,
        customerName: customers.full_name,
        poolName: pools.name,
        techName: profiles.full_name,
        createdAt: workOrders.created_at,
        updatedAt: workOrders.updated_at,
      })
      .from(workOrders)
      .leftJoin(customers, eq(workOrders.customer_id, customers.id))
      .leftJoin(pools, eq(workOrders.pool_id, pools.id))
      .leftJoin(profiles, eq(workOrders.assigned_tech_id, profiles.id))
      .where(
        and(
          eq(workOrders.org_id, token.org_id as string),
          filters?.status?.length
            ? inArray(workOrders.status, filters.status)
            : undefined,
          filters?.priority
            ? eq(workOrders.priority, filters.priority)
            : undefined,
        )
      )
      // Emergency first, then high, then normal, then low; then by created_at desc
      .orderBy(
        sql`CASE priority WHEN 'emergency' THEN 0 WHEN 'high' THEN 1 WHEN 'normal' THEN 2 ELSE 3 END`,
        desc(workOrders.created_at)
      )
  })
}
```

### Sidebar Navigation Addition

```typescript
// Add to NAV_ITEMS in src/components/shell/app-sidebar.tsx (after Dispatch):
{
  label: 'Work Orders',
  href: '/work-orders',
  icon: WrenchIcon,         // from lucide-react
  roles: ['owner', 'office'],
},
```

Tech nav does NOT get a Work Orders link. Techs access their assigned WOs from their Routes page or via a "My Work Orders" tab on the routes page (Claude's discretion for layout).

---

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| `experimental.serverComponentsExternalPackages` | `serverExternalPackages` (top-level) | Next.js 15+ (stable) | Must use top-level key, not under `experimental` |
| Turbopack `serverExternalPackages` resolution broken for transitive deps | Fixed in Next.js 16.1 | Next.js 16.1 | `@react-pdf/renderer` in `serverExternalPackages` works with Turbopack 16.1+ without manual workarounds |
| @react-pdf/renderer v3 (React 18 only) | v4.1+ (React 19 compatible) | @react-pdf v4.1.0, Nov 2024 | React 19 support is stable in v4.1.0; v4.3.2 is current |

**Deprecated/outdated:**
- `experimental.serverComponentsExternalPackages`: Replaced by `serverExternalPackages` at the top level of `nextConfig`. Using the `experimental` key still works as an alias in Next.js 15/16, but use the stable key.
- React 18 patterns in `@react-pdf/renderer` docs: Some older blog posts show `require('@react-pdf/renderer')` workarounds — not needed with v4.1+ and React 19.

---

## Open Questions

1. **`tax_exempt` column on `customers` table — needs migration**
   - What we know: The locked decisions specify a "Tax exempt flag per customer." The existing `customers` table does not have a `tax_exempt` boolean column.
   - What's unclear: Should it go on `customers` (applies to all WOs for that customer) or on `work_orders` (override per WO)? The decisions say "per customer."
   - Recommendation: Add `tax_exempt: boolean('tax_exempt').notNull().default(false)` to the existing `customers` table via a Drizzle migration. Also keep the `work_orders.tax_exempt` override column for per-WO exceptions.

2. **QUOTE_TOKEN_SECRET env var**
   - What we know: Phase 5 added `REPORT_TOKEN_SECRET`. Phase 6 needs a separate secret for quote tokens.
   - What's unclear: Should the planner add this to a `.env.local` setup checklist, or can it reuse `REPORT_TOKEN_SECRET`?
   - Recommendation: Use a separate `QUOTE_TOKEN_SECRET`. The planner should add it to `user_setup` in the first plan.

3. **`work-order-photos` Supabase Storage bucket — must be created**
   - What we know: The existing `visit-photos` bucket exists. WO photos need a separate bucket.
   - What's unclear: Whether Supabase bucket creation should be in migrations (using `supabase/migrations`) or documented as a manual setup step.
   - Recommendation: Document as manual setup step in the planner's `user_setup` section (same as how Phase 3's `visit-photos` bucket was handled). The bucket name is `work-order-photos`, private, same 5MB limit and image-type restrictions as `visit-photos`.

4. **E-signature capture — name + date approach**
   - What we know: Locked decision specifies "name + date, not drawn signature" for approvals.
   - What's unclear: Should the name field be required for quote approval, or optional?
   - Recommendation: Make it optional with a placeholder "Type your name to sign" — if left blank, approval is still recorded but `signature_name` is null. The approval timestamp is always recorded. This matches industry practice for low-stakes service quotes.

5. **WO photos storage path format**
   - What we know: Service visit photos use `{org_id}/visits/{visit_id}/{filename}.webp`.
   - What's unclear: Whether WO photos go into `visit-photos` bucket (same bucket, different path prefix) or a new `work-order-photos` bucket.
   - Recommendation: Use a **separate bucket** (`work-order-photos`) with path `{org_id}/work-orders/{wo_id}/{filename}.webp`. Separate buckets allow independent storage policies, quota management, and backup rules. Do not mix WO and visit photos.

6. **Multi-WO invoicing UI complexity**
   - What we know: The locked decisions include "multiple completed WOs for the same customer can be combined into a single invoice."
   - What's unclear: Does Phase 6 need to implement the full multi-WO selection UI (customer filter → checkbox selection of WOs → combined invoice), or is single-WO-to-invoice the MVP with multi-WO as an enhancement?
   - Recommendation: Implement single-WO-to-invoice as the primary flow. Add a "Add another WO to this invoice" button on the invoice preparation screen that lets office select additional WOs from the same customer. This is additive and doesn't require a separate multi-WO flow. The `invoices` table has a `work_order_ids` JSONB array to support this.

---

## Sources

### Primary (HIGH confidence)
- `src/lib/db/schema/` — All existing schema patterns used as templates for new tables
- `src/lib/db/index.ts` — `withRls` and `adminDb` patterns; confirmed LEFT JOIN requirement (MEMORY.md)
- `src/actions/visits.ts` — `completeStop` pattern; confirmed `adminDb` for cross-table reads, `withRls` for user-facing queries
- `src/lib/reports/report-token.ts` — JWT token pattern for public links; reused identically for quote tokens
- `src/actions/company-settings.ts` — `upsert` + `onConflictDoUpdate` pattern for settings; atomic counter pattern
- `src/actions/storage.ts` — Supabase Storage signed upload URL pattern
- `src/components/shell/app-sidebar.tsx` — Nav item addition pattern
- `package.json` — Confirmed: `@react-pdf/renderer` NOT yet installed; all other libraries already installed
- `next.config.ts` — Confirmed: no `serverExternalPackages` entry yet; must be added
- https://react-pdf.org/compatibility — React 19 support confirmed since v4.1.0; Next.js 14.1.1+ fix confirmed
- https://resend.com/docs/dashboard/emails/attachments — Resend attachments API: `{ filename, content (base64) }` format confirmed; 40MB limit
- https://nextjs.org/docs/app/api-reference/config/next-config-js/serverExternalPackages — `serverExternalPackages` stable top-level config confirmed for Next.js 15+

### Secondary (MEDIUM confidence)
- GitHub issue diegomura/react-pdf #3074 — renderToBuffer + Next.js 15 fix confirmed as React 19 upgrade; resolved Nov 2024
- GitHub issue diegomura/react-pdf #2966 — React 19 + Reconciler mismatch was user-caused (version mismatch), not library bug; closed Nov 2024
- Next.js 16.1 blog post — Turbopack `serverExternalPackages` transitive dep fix confirmed
- nesin.io/blog/send-email-attachment-resend — Resend attachment pattern: `Buffer.from(pdfBuffer).toString('base64')` pattern verified with Resend SDK

### Tertiary (LOW confidence)
- Invoice number counter via `UPDATE ... SET n = n + 1` — standard Postgres pattern; not specifically verified against Drizzle ORM docs. The pattern uses `adminDb.execute(sql\`...\`)` which is verified working. The atomic UPDATE itself is standard Postgres.

---

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH — `@react-pdf/renderer` v4.3.2 verified compatible with React 19 via official docs; Resend attachment pattern verified via official docs; all other libs already installed
- Architecture patterns: HIGH — all new tables follow verified existing schema/RLS patterns; PDF route handler follows documented Next.js Route Handler pattern
- PDF generation pitfalls: HIGH — `serverExternalPackages` requirement verified; oklch restriction derived from same `@react-pdf` non-browser-renderer constraint as MapLibre GL (documented in MEMORY.md)
- Invoice number atomicity: MEDIUM — standard Postgres pattern, verified approach, but Drizzle-specific syntax for the atomic UPDATE not verified against Context7 docs
- Quote versioning: HIGH — JSONB snapshot pattern is straightforward Postgres; no library-specific risk

**Research date:** 2026-03-10
**Valid until:** 2026-04-10 (30 days — @react-pdf/renderer is stable; Resend API is stable)
