---
phase: 08-customer-portal
verified: 2026-03-13T00:00:00Z
status: passed
score: 7/7 success criteria verified
re_verification: false
human_verification:
  - test: "Magic link email delivery"
    expected: "Customer receives email with clickable link that logs them into the portal"
    why_human: "Requires live Resend + Supabase OTP email to be sent and received; cannot verify email delivery in code"
  - test: "Stripe Elements payment form renders and accepts payment"
    expected: "Customer can enter card or bank details, submit, and see a success confirmation"
    why_human: "Stripe Elements requires a live Stripe publishable key and connected account; payment flow cannot be exercised programmatically"
  - test: "Supabase Realtime messages appear without page refresh"
    expected: "Customer sends a message; office sees it appear in their inbox without reloading"
    why_human: "Realtime Broadcast requires live WebSocket connection to Supabase; cannot be verified via static code analysis"
  - test: "Portal subdomain routing"
    expected: "bluewavepools.poolco.app resolves the correct company's branding and portal"
    why_human: "Subdomain routing via x-portal-slug header requires a deployed environment with wildcard DNS; dev uses localhost"
  - test: "PORT-08 — old company data isolation after customer transfer"
    expected: "Customer who moved from Company A to Company B cannot see Company A's invoices, history, or messages"
    why_human: "Isolation is enforced by JWT org_id + adminDb org-scoped queries. Correct by code inspection, but end-to-end verification requires two real orgs and a customer profile transfer"
---

# Phase 8: Customer Portal Verification Report

**Phase Goal:** Customers can view their entire service history, pay invoices, request jobs, and message the company — all from a branded self-service portal on any device
**Verified:** 2026-03-13
**Status:** passed (5 items noted for human verification)
**Re-verification:** No — initial verification

---

## Goal Achievement

### Observable Truths (from ROADMAP.md Success Criteria)

| # | Truth | Status | Evidence |
|---|-------|--------|----------|
| 1 | Customer can log into portal and view service visits with reports, chemistry, photos, checklist results | VERIFIED | `/portal/history` page calls `getServiceHistory`; `VisitDetailCard` renders chemistry (color-coded via `classifyReading`), checklist, photos, and tech notes; `PhotoGallery` with lightbox present |
| 2 | Customer can see invoices, pay by card or ACH, update payment method without calling office | VERIFIED | `/portal/invoices` page calls `getCustomerInvoices`; `PaymentForm` uses Stripe Elements `PaymentElement` (card + ACH); `PaymentMethodManager` uses `createPortalSetupIntent`; `updateCustomerContactInfo` in place |
| 3 | Customer can submit a one-off service request; office receives it and can dispatch a WO | VERIFIED | 6-step `RequestForm` calls `submitServiceRequest`; `/requests` office page calls `getOfficeRequests`; `RequestReviewPanel` calls `createWoFromRequest` and `reviewRequest` |
| 4 | Customer can send a message to the company and receive a reply in the same thread | VERIFIED | `MessageThread` subscribes to `portal-thread-${customerId}` Realtime channel; `sendMessage` inserts + broadcasts; `InboxThread` on office side uses same channel; email notifications fire both ways via `PortalMessageEmail` |
| 5 | Portal displays company's logo and brand colors — not generic platform branding | VERIFIED | `PortalShell` accepts `branding: OrgBranding` prop; applies `--portal-primary` CSS var from `brand_color`; renders logo URL or fallback SVG; `getOrgBranding()` loads from `org_settings.brand_color` + `orgs.logo_url` |
| 6 | Multi-company customer can access each company's portal in a branded, isolated context | VERIFIED | `CompanyPicker` component shown when `resolveCustomerId` returns null + `getCustomerOrgs` returns >1 result; `switchOrg` updates JWT `app_metadata.org_id`; hard nav via `window.location.href` forces session reload |
| 7 | When customer leaves one company and joins another, new portal works independently; old data not visible | VERIFIED (by code) | All portal data queries (`getServiceHistory`, `getCustomerInvoices`, `getMessages`, etc.) scope by both `orgId` AND `customerId`; JWT `org_id` controls which org's data is returned; old org data excluded because customer's `org_id` in JWT points to new org |

**Score:** 7/7 success criteria verified

---

### Required Artifacts

**Plan 01 — Portal Foundation (PORT-06, PORT-07, PORT-08)**

| Artifact | Status | Evidence |
|----------|--------|----------|
| `src/lib/db/schema/portal-messages.ts` | VERIFIED | File exists; `portalMessages` table with `service_request_id` FK, read receipts, RLS policies for office + customer |
| `src/lib/db/schema/service-requests.ts` | VERIFIED | File exists; `serviceRequests` table with all required columns; 3 RLS policies (office all, customer SELECT, customer INSERT) |
| `src/actions/portal-auth.ts` | VERIFIED | `sendMagicLink`, `getCustomerOrgs`, `switchOrg` all exported and substantive |
| `src/app/auth/portal-callback/route.ts` | VERIFIED | GET handler verifies `token_hash` + `type`, redirects to `/portal` on success or `/portal/login?error=invalid_link` on failure |
| `src/app/portal/login/page.tsx` | VERIFIED | Server wrapper reads `x-portal-slug` header, loads branding, renders `PortalLoginForm` client component |
| `src/components/shell/portal-shell.tsx` | VERIFIED | Full rewrite — real branding props, `--portal-primary` CSS var, working `<Link>` nav to all 4 routes, mobile bottom tab bar, user dropdown with sign out + switch company, `UnreadDot` on Messages link |
| `src/actions/portal-data.ts` | VERIFIED | `resolveCustomerId`, `getOrgBranding`, `getOrgBySlug` exported; all substantive |
| `src/lib/supabase/proxy.ts` | VERIFIED | `extractPortalSubdomain` function parses `{slug}.poolco.app`, skips reserved subdomains; `x-portal-slug` header injected in `updateSession` |
| `src/lib/db/schema/org-settings.ts` | VERIFIED | `brand_color`, `favicon_path`, `portal_welcome_message` columns present at lines 90-92 |
| `src/components/portal/company-picker.tsx` | VERIFIED | `CompanyPicker` calls `switchOrg` → `supabase.auth.refreshSession()` → `window.location.href = '/portal'` |

**Plan 02 — Service History (PORT-01)**

| Artifact | Status | Evidence |
|----------|--------|----------|
| `src/app/portal/(portal)/history/page.tsx` | VERIFIED | Calls `getServiceHistory` + `getVisitPhotos` in parallel; multi-pool tabs; Photos tab |
| `src/components/portal/visit-timeline.tsx` | VERIFIED | Groups visits by month; renders `VisitDetailCard`; vertical timeline with dot indicators |
| `src/components/portal/visit-detail-card.tsx` | VERIFIED | Radix Collapsible; collapsed shows date + badges + chemistry summary; expanded shows `ChemistryDisplay`, checklist, photos, notes, tech name |
| `src/components/portal/chemistry-display.tsx` | VERIFIED | Imports `classifyReading` from `lib/chemistry/targets.ts`; color codes green/amber/red; KEY_ALIASES normalization |
| `src/components/portal/photo-gallery.tsx` | VERIFIED | Grid layout; `yet-another-react-lightbox` dynamic import; Captions plugin |
| `src/actions/portal-data.ts` (getServiceHistory) | VERIFIED | `getServiceHistory` and `getVisitPhotos` exported; `chemistry_readings` explicitly listed in SELECT + mapping (MEMORY.md critical note followed) |

**Plan 03 — Invoices & Payments (PORT-02, PORT-03)**

| Artifact | Status | Evidence |
|----------|--------|----------|
| `src/app/portal/(portal)/invoices/page.tsx` | VERIFIED | Calls `getCustomerInvoices`, `getCustomerPaymentMethods`; passes to client components |
| `src/components/portal/invoice-list.tsx` | VERIFIED | Calls `createPortalPaymentIntent` on Pay Now; renders `PaymentForm` and `InvoiceDetail` |
| `src/components/portal/invoice-detail.tsx` | VERIFIED | Renders line items table + payment history |
| `src/components/portal/payment-form.tsx` | VERIFIED | Uses Stripe Elements `PaymentElement`; `loadStripe` with `stripeAccount` option; surcharge display |
| `src/components/portal/payment-method-manager.tsx` | VERIFIED | Calls `createPortalSetupIntent`; lists payment methods; contact info form calls `updateCustomerContactInfo` |
| `src/actions/portal-data.ts` (billing) | VERIFIED | `getCustomerInvoices`, `createPortalPaymentIntent`, `createPortalSetupIntent`, `confirmPaymentMethodUpdate`, `getCustomerPaymentMethods`, `updateCustomerContactInfo` all exported and substantive; PI uses `{ stripeAccount }` |

**Plan 04 — Service Requests (PORT-04)**

| Artifact | Status | Evidence |
|----------|--------|----------|
| `src/app/portal/(portal)/requests/page.tsx` | VERIFIED | Calls `getCustomerRequests`; renders `RequestList` |
| `src/app/portal/(portal)/requests/new/page.tsx` | VERIFIED | Fetches `getCustomerPools`; renders `RequestForm` |
| `src/components/portal/request-form.tsx` | VERIFIED | 6-step guided form; calls `submitServiceRequest`; photo upload via `createRequestPhotoUploadUrl` |
| `src/components/portal/request-list.tsx` | VERIFIED | Expandable cards; imports `RequestThread`; renders `RequestThread` on expand |
| `src/components/portal/request-status-tracker.tsx` | VERIFIED | 4-step tracker (Submitted → Reviewed → Scheduled → Complete); declined state |
| `src/components/portal/request-thread.tsx` | VERIFIED | Subscribes to `portal-request-${requestId}` Realtime channel; calls `sendRequestMessage` |
| `src/actions/service-requests.ts` | VERIFIED | All required exports present: `submitServiceRequest`, `getCustomerRequests`, `getOfficeRequests`, `reviewRequest`, `createWoFromRequest`, `getRequestMessages`, `sendRequestMessage` |
| `src/app/(app)/requests/page.tsx` | VERIFIED | Office page; role-guards techs/customers; calls `getOfficeRequests` |
| `src/components/requests/office-request-list.tsx` | VERIFIED | Filter tabs; amber border for urgent; opens `RequestReviewPanel` |
| `src/components/requests/request-review-panel.tsx` | VERIFIED | Calls `createWoFromRequest`, `reviewRequest`; embeds `RequestThread` for office replies |

**Plan 05 — Messaging (PORT-05)**

| Artifact | Status | Evidence |
|----------|--------|----------|
| `src/app/portal/(portal)/messages/page.tsx` | VERIFIED | Calls `getMessages` + `markAsRead`; renders `MessageThread` |
| `src/components/portal/message-thread.tsx` | VERIFIED | Subscribes to `portal-thread-${customerId}` Realtime Broadcast; calls `sendMessage`; deduplicates by ID; auto-scroll |
| `src/components/portal/message-bubble.tsx` | VERIFIED | Own messages right-aligned; other left-aligned; photo thumbnail support |
| `src/components/portal/message-input.tsx` | VERIFIED | Auto-growing textarea; photo attach; Enter-to-send; calls `createMessagePhotoUploadUrl` |
| `src/app/(app)/inbox/page.tsx` | VERIFIED | Calls `getInboxThreads`; renders `InboxClientShell` |
| `src/components/inbox/inbox-list.tsx` | VERIFIED | Thread list with unread badges; relative timestamps |
| `src/components/inbox/inbox-thread.tsx` | VERIFIED | Subscribes to Realtime; calls `markAsRead` on open; `sendMessage` with `senderRole='office'` |
| `src/actions/portal-messages.ts` | VERIFIED | `sendMessage`, `getMessages`, `getInboxThreads`, `markAsRead`, `getUnreadCount`, `createMessagePhotoUploadUrl` all exported and substantive; Realtime broadcast present; email notifications via Resend |

---

### Key Link Verification

| From | To | Via | Status | Evidence |
|------|----|-----|--------|----------|
| `portal/login/page.tsx` | `portal-auth.ts` | `sendMagicLink` | WIRED | `portal-login-form.tsx` imports and calls `sendMagicLink` |
| `auth/portal-callback/route.ts` | `/portal` | `verifyOtp` + redirect | WIRED | `supabase.auth.verifyOtp` on line 25; `NextResponse.redirect(${origin}/portal)` on line 36 |
| `portal/(portal)/layout.tsx` | `portal-data.ts` | `resolveCustomerId` + `getOrgBranding` | WIRED | Both called in `Promise.all` on lines 57-60 of layout.tsx |
| `proxy.ts` | portal layout | `extractPortalSubdomain` → `x-portal-slug` | WIRED | `extractPortalSubdomain` called in `updateSession`; result set as `x-portal-slug` header; login page reads via `headers().get("x-portal-slug")` |
| `history/page.tsx` | `portal-data.ts` | `getServiceHistory` | WIRED | Imported and called on line 36 |
| `chemistry-display.tsx` | `lib/chemistry/targets.ts` | `classifyReading` | WIRED | Imported on line 4; called on line 110 |
| `invoice-list.tsx` | `portal-data.ts` | `createPortalPaymentIntent` | WIRED | Imported on line 21; called on line 194 |
| `payment-method-manager.tsx` | `portal-data.ts` | `createPortalSetupIntent` | WIRED | Imported on line 27; called on line 151 |
| `request-form.tsx` | `service-requests.ts` | `submitServiceRequest` | WIRED | Imported on line 15; called on line 220 |
| `(app)/requests/page.tsx` | `service-requests.ts` | `getOfficeRequests` | WIRED | Imported on line 4; called on line 26 |
| `request-review-panel.tsx` | `service-requests.ts` | `reviewRequest` + `createWoFromRequest` | WIRED | Both imported and called in action handlers |
| `request-list.tsx` | `request-thread.tsx` | `RequestThread` component | WIRED | Imported on line 9; rendered on line 202 |
| `request-thread.tsx` | `service-requests.ts` | `sendRequestMessage` | WIRED | Imported on line 6; called on line 207 |
| `message-thread.tsx` | Supabase Realtime | `portal-thread-${customerId}` broadcast | WIRED | `supabase.channel(portal-thread-${customerId})` + `.on("broadcast", ...)` at lines 53-66 |
| `portal-messages.ts` | `portal-messages` schema | adminDb insert/select | WIRED | `adminDb.insert(portalMessages)` and `adminDb.select().from(portalMessages)` throughout |
| `app-sidebar.tsx` | `portal-messages.ts` | `getUnreadCount` via `UnreadBadge` | WIRED | `UnreadBadge` imported on line 22; rendered for Messages nav item at line 300 |
| `portal-shell.tsx` | `portal-messages.ts` | `getUnreadCount` via `UnreadDot` | WIRED | `UnreadDot` imported from `@/components/inbox/unread-badge`; rendered on Messages nav links (desktop + mobile) |
| `customers/[id]/page.tsx` | `inbox-thread.tsx` | Messages tab | WIRED | `InboxThread` imported on line 16; rendered on line 145 |

---

### Requirements Coverage

| Requirement | Source Plans | Description | Status | Evidence |
|-------------|-------------|-------------|--------|----------|
| PORT-01 | 08-02 | Customer can view service history with reports, photos, and chemical readings | SATISFIED | `/portal/history` with full visit timeline, chemistry color coding, photo gallery with lightbox |
| PORT-02 | 08-03 | Customer can view and pay invoices through the portal | SATISFIED | `/portal/invoices` with invoice list, Stripe Elements payment form (card + ACH) |
| PORT-03 | 08-03 | Customer can update their payment method and contact information | SATISFIED | `PaymentMethodManager` with SetupIntent flow; `updateCustomerContactInfo` for phone/email |
| PORT-04 | 08-04 | Customer can request one-off services; office can dispatch a WO | SATISFIED | 6-step request form, office queue at `/requests`, WO creation from request |
| PORT-05 | 08-05 | Customer can send messages to the company through the portal | SATISFIED | Real-time messaging via Supabase Realtime Broadcast, office inbox, email notifications both ways |
| PORT-06 | 08-01 | Portal displays company branding (logo, colors) | SATISFIED | `PortalShell` applies `--portal-primary` from `brand_color`; renders company logo URL |
| PORT-07 | 08-01 | Portal supports multi-company customers | SATISFIED | `CompanyPicker` shown on login, `switchOrg` updates JWT `org_id`, company-isolated data queries |
| PORT-08 | 08-01 | Portal handles company-switch gracefully | SATISFIED (code) | All portal data queries scope by JWT `org_id`; old org data excluded by design; isolation enforced at query level |

**No orphaned requirements.** REQUIREMENTS.md lists PORT-01 through PORT-06 as Phase 8 (PORT-07/PORT-08 not in the requirements table but covered in ROADMAP.md success criteria and PLAN frontmatter).

---

### Anti-Patterns Scan

No blocking anti-patterns found. All `placeholder` occurrences are legitimate HTML input placeholder attributes. No `return null`, `return {}`, or stub function bodies found in portal feature files. No disabled buttons, hardcoded `--` values, or "coming soon" text found.

Notable design observation (not a blocker): The portal home page (`/portal/(portal)/page.tsx`) does not yet show a live "Next scheduled visit" or "Outstanding balance" summary — the page has descriptive cards linking to the detail pages instead. The comments note this data will be populated in subsequent plans. This is acceptable UX and not a stub; it was an acknowledged deferral.

---

### Human Verification Required

#### 1. Magic link email delivery

**Test:** Enter a real customer email on `/portal/login`, click "Send Sign-in Link," check inbox for magic link email, click the link.
**Expected:** Email arrives from `notifications@poolco.app` (or Resend dev address); clicking the link calls `/auth/portal-callback?token_hash=...&type=magiclink`; redirects to `/portal` with customer session active.
**Why human:** Email delivery requires live Resend service. OTP verification requires a valid unexpired token from Supabase.

#### 2. Stripe Elements payment form

**Test:** On `/portal/invoices`, click "Pay Now" on a sent invoice.
**Expected:** Stripe PaymentElement renders with card/ACH tabs; entering test card 4242 4242 4242 4242 and submitting redirects to `/portal/invoices?payment=success`; invoice shows as paid.
**Why human:** Requires live Stripe connected account with `stripe_account_id` configured in `org_settings` and `NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY` set.

#### 3. Supabase Realtime message delivery

**Test:** Open portal messages in one browser tab (customer), open office inbox in another (office staff). Customer sends a message.
**Expected:** Message appears in office inbox without page refresh; office replies; customer sees reply without page refresh.
**Why human:** Requires live Supabase project with Realtime enabled on the `portal-thread-*` broadcast channel.

#### 4. Portal subdomain routing

**Test:** Navigate to `bluewavepools.poolco.app/portal/login`.
**Expected:** Header shows Blue Wave Pools branding (logo, name, brand color) instead of generic PoolCo branding.
**Why human:** Requires deployed environment with wildcard DNS `*.poolco.app` pointing to the app. Local dev uses localhost and falls back to generic branding.

#### 5. PORT-08 company data isolation

**Test:** Create two orgs (Company A, Company B). Invite same customer email to both. After customer logs into Company B, verify Company A's invoices, service history, and messages are not accessible.
**Expected:** Portal shows only Company B data when `org_id` in JWT points to Company B.
**Why human:** Requires two live orgs, a transferred customer, and a session with the correct JWT org claim. Code inspection confirms isolation by orgId scoping in all queries, but end-to-end behavior requires running the app.

---

## Summary

Phase 8 fully achieves its goal. All 5 plans executed completely — the portal has:

- Magic link authentication with subdomain routing and company branding
- Service history with per-pool tabs, chemistry color coding, photo gallery, and lightbox
- Invoice viewing and Stripe payment (card + ACH) with SetupIntent payment method management
- 6-step guided service request form with photo upload, office review queue, WO creation, and status tracking
- Real-time bidirectional messaging (Supabase Realtime Broadcast) with office inbox, customer profile tab, unread badges, and email notifications

All 8 requirements (PORT-01 through PORT-08) are satisfied. No stubs, placeholders, or orphaned artifacts found. 5 items require human verification due to external service dependencies (Resend email, Stripe, Supabase Realtime WebSocket, DNS subdomain routing).

---

*Verified: 2026-03-13*
*Verifier: Claude (gsd-verifier)*
