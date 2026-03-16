---
phase: 11
plan: 08
subsystem: bank-feeds
tags: [plaid, bank-feeds, transactions, settings, webhook]
dependency_graph:
  requires: [11-01]
  provides: [bank-account-connection, plaid-link-flow, transaction-sync, plaid-webhook]
  affects: [settings-page, billing-tab]
tech_stack:
  added: [plaid@^31, react-plaid-link@^3]
  patterns: [plaid-link-flow, access-token-security, webhook-handler, adminDb-only-sensitive-data]
key_files:
  created:
    - src/lib/plaid/client.ts
    - src/actions/bank-feeds.ts
    - src/components/settings/plaid-connect.tsx
    - src/app/api/webhooks/plaid/route.ts
  modified:
    - src/app/(app)/settings/page.tsx
    - src/components/settings/settings-tabs.tsx
decisions:
  - "Use adminDb (service role) for all Plaid access_token operations — never exposed through withRls"
  - "Plaid Link onSuccess returns accounts[] (plural) — take first account for single-account flow"
  - "Webhook returns 200 on all events (including errors) to prevent Plaid retry loops"
  - "CoA auto-link is best-effort — bank account is created even if no matching account found"
  - "Bank connection errors create alerts via adminDb (webhook has no user JWT context)"
metrics:
  duration: 5 min
  tasks_completed: 2
  files_created: 4
  files_modified: 2
  completed_date: "2026-03-16"
---

# Phase 11 Plan 08: Plaid Bank Feed Integration Summary

Plaid OAuth bank connection flow with automated transaction sync and webhook processing — owner connects business bank accounts from Settings, transactions import incrementally via cursor-based sync.

## What Was Built

### Task 1: Plaid SDK client and bank feed server actions (commit `39e42dd`)

**`src/lib/plaid/client.ts`**
- Factory function `createPlaidClient()` that checks `PLAID_CLIENT_ID` + `PLAID_SECRET` env vars
- Exports `plaidClient` as `PlaidApi | null` — callers check before using
- Switches between sandbox and production based on `PLAID_ENV`

**`src/actions/bank-feeds.ts`** — 6 server actions:

| Action | Auth | Notes |
|--------|------|-------|
| `createPlaidLinkToken()` | owner only | Creates ephemeral link token for Plaid Link UI |
| `exchangePublicToken(token, meta)` | owner only | Exchanges for permanent access_token, stores in DB via adminDb |
| `syncTransactions(bankAccountId)` | system (adminDb) | Cursor-based pagination with has_more loop |
| `getBankAccounts()` | owner only | Returns display fields only — access_token never returned |
| `disconnectBankAccount(bankAccountId)` | owner only | Calls Plaid /item/remove then deletes local data |
| `refreshBankBalance(bankAccountId)` | system (adminDb) | Updates current/available balance from Plaid |

**Security:** `plaid_access_token` is only read server-side via `adminDb`. It is never selected in `getBankAccounts()` or any RLS-wrapped query.

### Task 2: Plaid Connect UI, webhook handler, settings integration (commit `8bb5bd1`)

**`src/components/settings/plaid-connect.tsx`**
- "Connect Bank Account" button → `createPlaidLinkToken()` → opens Plaid Link
- `onSuccess` callback → `exchangePublicToken()` → triggers initial sync → refreshes list
- Account list: institution name, account name, masked number, type badge, balance, last synced
- Per-account: "Sync Now" button + "Disconnect" with confirmation AlertDialog
- Empty state when no accounts connected
- Error/success inline messages

**`src/app/api/webhooks/plaid/route.ts`**
- Handles `TRANSACTIONS` events: `SYNC_UPDATES_AVAILABLE`, `DEFAULT_UPDATE`, `HISTORICAL_UPDATE`, `INITIAL_UPDATE` — all trigger `syncTransactions()`
- Handles `ITEM` events: `ERROR`, `ITEM_LOGIN_REQUIRED`, `PENDING_EXPIRATION` — creates owner alert with description and reconnect instructions
- Always returns 200 (Plaid retries on non-200)
- Looks up `bank_account` by `plaid_item_id` to find org context

**Settings integration:**
- `settings/page.tsx`: fetches `getBankAccounts()` server-side, passes as `initialBankAccounts`
- `settings-tabs.tsx`: "Bank Accounts" card added to Billing tab, renders `PlaidConnect`

## Deviations from Plan

None — plan executed exactly as written.

Pre-existing build errors noted in unrelated files (`company-settings.ts logo_url`, `work-orders.ts labor_hours`, etc.) are from schema changes in 11-01 that haven't been propagated yet. Out of scope for this plan.

## Self-Check

Files created/exist:
- `src/lib/plaid/client.ts` — FOUND
- `src/actions/bank-feeds.ts` — FOUND
- `src/components/settings/plaid-connect.tsx` — FOUND
- `src/app/api/webhooks/plaid/route.ts` — FOUND

Commits exist:
- `39e42dd` — FOUND
- `8bb5bd1` — FOUND

## Self-Check: PASSED
