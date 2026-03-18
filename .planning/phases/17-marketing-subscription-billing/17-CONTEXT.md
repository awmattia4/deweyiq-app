# Phase 16: Subscription Billing & Marketing Site - Context

**Gathered:** 2026-03-13
**Status:** Ready for planning

<domain>
## Phase Boundary

Two halves that complete the product:

**1. Marketing & Sign-Up Site** — The public-facing marketing website that sells PoolCo to pool service companies. This is NOT a basic landing page — it's a conversion-optimized, visually stunning marketing experience that makes pool company owners think "holy shit, I need this." Think Apple product pages meets modern SaaS marketing. Full-bleed hero sections, interactive app demos, feature deep-dives, social proof, pricing calculator, competitor comparison, and a frictionless sign-up flow. The site must look so good that pool company owners show it to their friends.

**2. Subscription Billing** — Pool companies pay for using the PoolCo SaaS platform via tiered subscriptions based on their pool count. Stripe handles payment processing, subscription lifecycle, and payment method storage. This covers: signup trial, checkout, plan management, usage enforcement, failed payments, and account restriction/recovery.

This is the SOFTWARE's billing system (billing pool companies for using the platform), NOT Phase 7 (pool companies billing their end customers for pool service).

</domain>

<decisions>
## Implementation Decisions

### Marketing Site Architecture
- Built as part of the Next.js app — NOT a separate site (shared auth, seamless transition from marketing → signup → app)
- Public routes under `/` — hero, features, pricing, about, blog (future)
- Modern, dark-first design that matches the app's design system
- Mobile-first — pool company owners browse on their phones
- Performance-optimized — under 2s LCP, perfect Lighthouse scores
- SEO-optimized — meta tags, structured data, OG images, sitemap

### Marketing Site Visual Design
- **Hero section**: Full-viewport cinematic hero with animated 3D phone mockup showing the app in action. Gradient mesh background matching brand colors. Bold headline + subhead + CTA. Auto-rotating feature showcase.
- **Interactive app previews**: NOT screenshots — actual interactive demos showing the route view, chemistry logging, dispatch map, billing dashboard. Users can click through a sandboxed demo without signing up.
- **Feature deep-dives**: Each major feature area (Field Tech, Scheduling, Billing, Dispatch, Customer Portal) gets its own scroll-animated section with:
  - Phone/desktop mockup showing the feature
  - 3 key benefit bullets
  - Micro-animation showing the workflow
  - "See it in action" → expands to interactive demo
- **Social proof**: Testimonial cards, logo bar, stats counters (stops completed, invoices generated, etc.), case study previews
- **Comparison section**: Side-by-side feature comparison table vs. Skimmer, Pool Brain, FieldPulse, ServiceTitan. Honest comparison — show where PoolCo wins AND where competitors might be better (builds trust). Interactive toggle between competitors.
- **Pricing section**: Interactive pricing calculator — slide pool count, see price update in real-time. Annual vs monthly toggle with savings callout. Feature list (all features included in every tier). "Start Free Trial" CTA.
- **Sign-up flow**: Multi-step onboarding wizard (company info → service details → invite team → explore app). Progress bar. Each step is fast (2-3 fields max). Auto-provisions trial org, creates first route template based on company size.
- **Mobile app showcase**: Side-by-side comparison of PoolCo mobile vs. competitors. Show the actual field tech experience — wet hands, bright sunlight, one-tap completion. "Your techs will actually USE this" messaging.

### Competitor Comparison Strategy
- Skimmer: position PoolCo as "Skimmer but with dispatch, work orders, billing, and a customer portal built in"
- Pool Brain: position PoolCo as "modern, mobile-first alternative — no desktop-era software"
- FieldPulse/ServiceTitan: position PoolCo as "purpose-built for pool service — not a generic field service tool adapted for pools"
- Key differentiators to highlight:
  1. Chemistry engine with LSI/CSI and dosing recommendations (pool-specific, not generic)
  2. Offline-first PWA (works in the backyard with no signal)
  3. Real-time dispatch with live tech tracking
  4. AutoPay + automatic invoicing (get paid without chasing)
  5. Customer portal (self-service reduces office calls)
  6. All-in-one: scheduling + field app + dispatch + billing + customer portal

### Animations & Interactions
- Scroll-triggered animations (Framer Motion) — elements animate in as you scroll
- Parallax depth on hero section
- Interactive pricing slider with real-time calculation
- Feature cards with hover effects showing quick previews
- Smooth page transitions between marketing sections
- App demo sections with tab-switching between features
- Counter animations for stats (stops completed, pools managed, etc.)
- Testimonial carousel with auto-advance

### Sign-Up & Onboarding Flow
- Step 1: Email + Password (or Google OAuth) — instant account creation
- Step 2: Company profile (name, phone, logo upload, service area)
- Step 3: "How many pools do you service?" → auto-selects tier, shows pricing
- Step 4: "Invite your team" — optional, skippable (tech invite by phone number)
- Step 5: "Add your first customer" or "Import from CSV/Skimmer"
- Step 6: "You're ready!" — guided tour of the dashboard
- 14-day free trial starts immediately, no credit card required
- Progress is saved at every step — if they leave and come back, they resume where they left off

### Tier structure
- Starter: 1–79 pools — $99/mo or $990/yr ($82.50/mo, 2 months free)
- Pro: 80–200 pools — $199/mo or $1,990/yr ($165.83/mo, 2 months free)
- Enterprise: 200+ pools — $349/mo or $3,490/yr ($290.83/mo, 2 months free)
- All features included in all tiers — no feature gating, flat pricing per tier
- No per-pool fees, no per-tech fees — simple flat tiers
- **Unlimited SMS included** — pre-arrival texts, service reports, invoice reminders, quote delivery, weather delay notifications — all included, no per-message charges (Skimmer charges $0.029/SMS on their lower plan)
- **Unlimited techs, unlimited office users** — no per-user fees (Pool Brain charges $55/tech/month)

### Marketing differentiation messaging
- "Unlimited SMS included" — call this out explicitly on pricing page, comparison table, and hero section
- "No per-pool fees" — direct counter to Skimmer's $1-3/pool model
- "No per-tech fees" — direct counter to Pool Brain's $55/tech and ServiceTitan's $250+/tech
- "All features, every plan" — no feature gating, no upsells, no "contact us for enterprise features"
- Price comparison callout: "A 5-tech company with 150 pools pays Pool Brain $285/mo + $10 admin = $295/mo for JUST scheduling. PoolCo gives you scheduling + billing + dispatch + customer portal + work orders for $199/mo."

### Legal requirements (marketing site pages)
- **Terms of Service** — platform usage terms, account responsibilities, acceptable use, termination, limitation of liability, dispute resolution, governing law
- **Privacy Policy** — data collection/processing/storage, CCPA compliance (California customers), cookie usage, third-party services (Stripe, Supabase, Twilio, Resend), data retention, user rights (access, deletion, portability)
- **Data Processing Agreement (DPA)** — required for B2B SaaS handling customer PII (pool company stores their customers' names, addresses, emails, payment info via Stripe); covers data processor obligations, security measures, breach notification, sub-processor list
- **Cookie Policy** — analytics cookies, functional cookies, consent banner
- **Acceptable Use Policy** — prohibited uses, content restrictions, API abuse limits
- **SLA** — uptime commitment (99.9%), planned maintenance windows, credit policy for downtime
- **Billing Terms** — subscription auto-renewal, cancellation policy, refund policy, price change notice period
- **DMCA / Copyright** — takedown procedure (required for user-generated content like photos)
- All legal pages accessible from marketing site footer and app settings
- Use a legal template service (Termly, Iubenda, or lawyer-reviewed templates) — do NOT write legal copy from scratch

### Payment processing
- Stripe for everything: Checkout Sessions, Customer Portal, webhooks
- No custom payment form — Stripe Checkout handles PCI compliance, 3DS, Apple Pay
- **ACH bank transfer** enabled as payment option alongside card — Stripe handles verification natively
  - ACH fee: 0.8% capped at $5/transaction (vs. card 2.9% + $0.30)
  - Nudge annual plan customers toward ACH: "Save ~3% with bank transfer" callout on checkout
  - Especially impactful on Enterprise annual ($3,490 → $5 ACH fee vs. $101 card fee)
- Payment method management fully in-app using Stripe Elements (PaymentElement + SetupIntent) — no redirect to Stripe; add/remove cards, add bank accounts (ACH), update expired cards, 3DS re-verification — all within Settings → Billing tab, styled to match the app's design system
- Local `subscriptions` table synced via webhooks (not live Stripe API on every page load)

### Trial period
- 14-day free trial, no credit card required (reduces signup friction)
- Stripe-native trial on the subscription object (Stripe handles reminders)
- Trial expiry without payment: full-screen blocker, app becomes read-only

### Pool count enforcement
- Soft enforcement with 7-day grace period when limit exceeded
- During grace: show warning banner, allow new pool creation
- After grace: block new pool creation only (existing pools remain functional)
- No auto-downgrade when pools are deleted below threshold (manual only)

### Failed payment handling
- 7-day grace period from first failure
- Stripe Smart Retries handle automatic retry schedule
- Day 7: account enters restricted mode (read-only, full-screen blocker)
- Payment method update + successful charge lifts all restrictions

### Claude's Discretion
- Tier pricing amounts (placeholder — owner sets actual prices in Stripe Dashboard)
- Trial banner dismissibility rules and visual treatment
- Invoice history pagination
- Webhook event deduplication strategy
- Account restriction enforcement granularity (which write operations to block)
- Marketing copy tone and specific wording (professional but approachable, not corporate-speak)
- Animation timing and easing curves
- Exact breakpoints for responsive marketing layouts
- Image/mockup generation approach (CSS mockups vs static images)

</decisions>

<specifics>
## Specific Ideas

### Marketing Site
- Hero headline options: "Pool service software that actually works" / "Run your pool company from your pocket" / "The all-in-one platform pool pros switch to"
- Show a "Day in the Life" section — walk through a tech's morning: open app, see route, navigate, log chemistry, complete stop, auto-report sent. Then show the owner's view: dispatch map, billing dashboard, customer portal messages
- ROI calculator: "How much time will PoolCo save you?" — input pools/techs/hours, output savings estimate
- "Switch from Skimmer in 10 minutes" — emphasize CSV import and guided migration
- Video testimonials > text testimonials (but text is fine for MVP)
- Trust signals: "Built by pool pros" / "Used by X companies managing Y pools"
- Blog/resources section (can be empty at launch — structure only)
- Live chat widget (Intercom/Crisp) for conversion support
- Exit-intent popup with special offer (only on pricing page)

### Subscription Billing
- Trial banner visible to ALL roles (not just owner) so techs understand if service is about to stop
- Account restriction is read-only (can view all data) not full lockout — owner needs to see data to decide to pay
- Subscription billing lives in `/settings` as a new "Billing" tab (owner-only — other roles don't see the tab)
- Payment method management fully in-app via Stripe Elements (no redirect) — never handle raw card data, Stripe.js handles PCI compliance
- Invoice list on billing page fetches directly from Stripe API (not cached) since billing page is rarely visited

</specifics>

<deferred>
## Deferred Ideas

- Usage-based pricing (per-stop charges) — future enhancement if needed
- Multi-currency support — US-only initially
- Coupon/discount codes — can add via Stripe Dashboard later without code changes
- Reseller/white-label billing — out of scope
- Blog CMS — structure the blog route but actual content management is post-launch
- A/B testing framework — manual iteration at this scale
- Affiliate/referral program — future growth feature

</deferred>

---

*Phase: 17-marketing-subscription-billing*
*Context gathered: 2026-03-13*
