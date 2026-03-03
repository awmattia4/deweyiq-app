# Phase 1: Foundation - Context

**Gathered:** 2026-03-03
**Status:** Ready for planning

<domain>
## Phase Boundary

Auth system (sign-up, login, password reset, invites, role-based access), multi-tenant Postgres schema with RLS on every table, and installable PWA shell with offline sync queue. This is the infrastructure every other phase depends on.

</domain>

<decisions>
## Implementation Decisions

### Auth flow design
- Sign-in: email + password with Google OAuth as convenience option
- Sign-up collects: full name, email, password, and company name (creates tenant)
- Team invites: owner sends email invite with pre-assigned role; invitee clicks link and sets password — no approval step
- Password reset: standard email link flow
- Customer auth: separate portal login page (/portal/login) with company branding; staff use the main app login

### Role landing experience
- Tech: lands directly on today's route list — no dashboard in between
- Owner/Office: lands on a dashboard with key metrics (today's stops, revenue snapshot, alerts, quick actions)
- Owner and office share the same view; owner gets additional tabs (billing settings, team management, reports)
- Phase 1 pages: minimal real content — basic dashboard with real data where available (user profile, team list), not just placeholder pages

### Offline indicators & sync feedback
- Offline status: subtle persistent banner (thin colored bar at top/bottom), disappears when back online
- Sync status: persistent icon in header showing synced/syncing/pending state
- Sync failure: auto-retry silently in background; only alert user on final failure after retries exhausted
- Pre-caching: cache today's full route data when app opens with connectivity — tech can work all day offline

### App identity & shell
- Product has a chosen name (user-provided — confirm in branding assets)
- Visual direction: bold & modern — deep blue or teal with vibrant accents, Linear/Vercel aesthetic, sharp and minimal
- Loading experience: skeleton screens (show layout structure with gray placeholders immediately), not splash screen
- Branding model: product brand for staff experience; customer portal shows the pool company's own logo and colors

### Claude's Discretion
- Exact skeleton screen layout and animation
- Specific shade selection within the blue/teal palette
- Typography choices (font family, scale)
- Error page design and copy
- Transition animations between routes
- Exact retry count and backoff strategy for sync failures

</decisions>

<specifics>
## Specific Ideas

- Tech landing should feel instant — "open app, see your route" with zero navigation required
- Dashboard should feel like a command center, not a report — key metrics and quick actions, not charts
- Offline banner should be noticeable but not alarming — techs work without signal regularly, it's normal
- Visual tone reference: Linear's sharp minimalism + Vercel's bold confidence — premium without being corporate

</specifics>

<deferred>
## Deferred Ideas

None — discussion stayed within phase scope

</deferred>

---

*Phase: 01-foundation*
*Context gathered: 2026-03-03*
