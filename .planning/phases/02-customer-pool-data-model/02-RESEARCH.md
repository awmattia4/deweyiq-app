# Phase 2: Customer & Pool Data Model - Research

**Researched:** 2026-03-05
**Domain:** CRM schema design, relational queries, data tables, forms, inline editing
**Confidence:** HIGH (core stack verified via official docs and codebase inspection)

---

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions

#### Customer list & search
- Data table layout with sortable columns — efficient for scanning 100+ customers
- Default columns: Name, Address, Phone, Route, Status, Pool Count (6 columns)
- Instant filter search — table filters in real-time as user types, no submit button
- Dropdown filters above the table for Route, Status (active/paused/cancelled), and Assigned Tech — combinable

#### Customer profile page
- Tabbed sections: Overview, Pools, Equipment, History — one section visible at a time
- Full page navigation to /customers/[id] — standard web navigation with back button
- Header always visible above tabs: customer name, address, phone, status badge, assigned route
- Inline edit mode — click Edit and fields become editable in-place, no modal for editing existing data

#### Pool & equipment forms
- Pool types: Pool, Spa, Fountain — three distinct body-of-water types
- Add pool via modal form — click "Add Pool" on Pools tab, dialog opens with all fields
- Single form with visual grouping: Basic Info (name, type, volume) | Water Chemistry (surface, sanitizer) | Notes
- Equipment displayed as a compact list per pool (type, brand/model, install date) with [+ Add] button
- Add equipment via small modal form with brand, model, install date fields

#### Service history timeline
- Vertical timeline layout with date markers — each visit is a card
- Chemistry readings shown inline by default (pH, Cl, Alk) — no expand needed for basics
- All service types shown together chronologically, with filter chips (Routine, Repair, One-off) to narrow
- Photo thumbnails in horizontal strip below entries — click to open full-size gallery

### Claude's Discretion
- Exact table component library and pagination strategy
- Empty states for new customers with no pools/equipment/history
- Form validation rules and error messages
- Loading skeletons and transition animations
- Responsive behavior on smaller screens

### Deferred Ideas (OUT OF SCOPE)
None — discussion stayed within phase scope
</user_constraints>

---

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|-----------------|
| CUST-01 | Office can create customer profiles (name, address, phone, email, gate codes, access notes) | Drizzle schema + Server Action pattern, shadcn form with Zod validation |
| CUST-02 | Office can add pool profiles per customer (volume, surface type, sanitizer type, special notes) | One-to-many via Drizzle relations v1; pool schema with pgEnum for surface/sanitizer |
| CUST-03 | System supports multiple bodies of water per customer (pool, spa, fountain) with distinct configurations | `body_of_water_type` pgEnum on the pools table; same table, different type value |
| CUST-04 | Office can track equipment per pool (pump, filter, heater — brand, model, install date, service history) | equipment table with FK to pools; equipment_type text column; compact list + modal add |
| CUST-05 | Office can search and filter customers by name, address, route, or status | TanStack Table client-side filter on name/status/route/tech; ILIKE for server-side name search |
| CUST-06 | System stores complete service history per customer accessible from their profile | service_visits stub table (read-only in Phase 2); populated by Phase 3; timeline view in History tab |
</phase_requirements>

---

## Summary

Phase 2 is a CRM-core phase: schema design for customers, pools, and equipment; a data-table list view; a tabbed detail page; modal forms for adding pools/equipment; and inline editing for existing customer data. The existing Phase 1 codebase provides the exact patterns to follow — `withRls` + `adminDb` for Server Actions, `shadcn/ui` components, and the established dark-first design system.

The primary schema work is three new tables: `customers`, `pools` (covering all body-of-water types), and `equipment`. Each table requires RLS policies following the established `org_id = (select auth.jwt() ->> 'org_id')::uuid` pattern. A fourth stub table `service_visits` should be defined now (schema only, no data) to satisfy CUST-06's read requirement and avoid a migration later in Phase 3.

The UI stack is fully determined by the existing codebase: TanStack Table v8 (`@tanstack/react-table`) for the customer list, shadcn Tabs for the profile page, shadcn Dialog for add-pool/add-equipment modals, and the existing `useState` + `useTransition` + Server Action pattern for inline edit (no need to add react-hook-form — the codebase intentionally avoids it based on the profile form pattern).

**Primary recommendation:** Build schema first (one migration for all four tables), then UI in plan order: list page → profile page → pool/equipment modals → history timeline stub.

---

## Standard Stack

### Core
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| drizzle-orm | ^0.45.1 (installed) | Schema definition, migrations, SQL queries | Already in project; Supabase pooler compatible |
| drizzle-kit | ^0.31.9 (installed) | Migration generation | Already configured |
| @tanstack/react-table | 8.21.3 (not yet installed) | Headless table with sorting + filtering | shadcn data table guide uses this; headless = full UI control |
| shadcn/ui Tabs | (not yet installed) | Tabbed profile sections | Matches locked UI decision; Radix-based, accessible |
| shadcn/ui Table | (not yet installed) | Table markup primitives for TanStack Table | shadcn data table requires this as scaffolding |
| shadcn/ui Form | (not yet installed) | Form with FormField/FormItem/FormMessage | Zod integration, accessible labels and errors |
| zod | (not yet installed) | Schema validation for forms and server actions | Pairs with shadcn Form; type inference for form values |
| @hookform/resolvers | 5.x (not yet installed) | Bridges Zod to react-hook-form in shadcn Form | Required peer dep of shadcn Form component |
| react-hook-form | 7.x (not yet installed) | Form state management used by shadcn Form | Required by shadcn Form component pattern |

### Supporting
| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| lucide-react | ^0.576.0 (installed) | Icons for table actions, status badges, tabs | Already in project; consistent with Phase 1 |
| shadcn/ui Badge | (installed) | Status indicators (active/paused/cancelled) | Already used in dashboard and team pages |
| shadcn/ui Dialog | (installed) | Modal forms for Add Pool, Add Equipment | Already installed |
| shadcn/ui Select | (installed) | Dropdown filters (route, status, tech) | Already installed |
| shadcn/ui Skeleton | (installed) | Loading states per user discretion area | Already installed |

### Alternatives Considered
| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| @tanstack/react-table | Plain HTML table | TanStack provides sorting/filter state management for free; skip it only for read-only tables |
| react-hook-form + zod | Plain useState forms | Phase 1 uses useState pattern (see ProfileForm); either works, but shadcn Form component requires RHF |
| Client-side table filtering | Server-side search | Client-side is simpler and instant for <1000 customers; add server-side ILIKE query only if list grows beyond 1000 |

**Installation:**
```bash
npm install @tanstack/react-table react-hook-form @hookform/resolvers zod
npx shadcn@latest add tabs table form
```

---

## Architecture Patterns

### Recommended Project Structure
```
src/
├── app/(app)/customers/
│   ├── page.tsx                    # Customer list — server component, fetches all customers
│   ├── loading.tsx                 # Skeleton for list
│   ├── [id]/
│   │   ├── page.tsx                # Customer profile — server component
│   │   └── loading.tsx             # Skeleton for profile
├── components/customers/
│   ├── customer-table.tsx          # "use client" — TanStack Table with filters
│   ├── customer-columns.tsx        # Column definitions (ColumnDef[])
│   ├── customer-header.tsx         # Profile header (name, address, status badge)
│   ├── customer-inline-edit.tsx    # "use client" — inline edit form
│   ├── add-customer-dialog.tsx     # "use client" — create customer modal
│   ├── pool-list.tsx               # Pool cards with [+ Add] button
│   ├── add-pool-dialog.tsx         # "use client" — add pool modal form
│   ├── equipment-list.tsx          # Equipment compact list per pool
│   ├── add-equipment-dialog.tsx    # "use client" — add equipment modal form
│   └── service-history-timeline.tsx # "use client" — vertical timeline view
├── actions/customers.ts            # Server Actions: create, update, delete customer
├── actions/pools.ts                # Server Actions: add pool, update pool
├── actions/equipment.ts            # Server Actions: add equipment
└── lib/db/schema/
    ├── customers.ts                # customers table + RLS + relations
    ├── pools.ts                    # pools table + RLS + relations
    ├── equipment.ts                # equipment table + RLS + relations
    ├── service-visits.ts           # service_visits stub (Phase 3 will populate)
    └── index.ts                    # barrel — add all new schemas + relations here
```

### Pattern 1: Drizzle Schema with Relations (v1 API — matches installed drizzle-orm 0.45)

The project is on drizzle-orm 0.45, which uses the v1 relations API (`relations()` function, `db._query` or `db.query` inside transactions). The v2 `defineRelations` API is NOT available in 0.45 — it ships with drizzle-orm v1.0.0-beta.2.

**What:** Define `relations()` objects alongside each table, export them from the barrel, and pass `schema` (which includes all relation objects) to `drizzle()`. The `adminDb` already passes `schema` correctly.

**When to use:** Every new table that has a parent (FK) or children needs a relations definition. Relations definitions do NOT affect the database — they only enable the relational query builder.

**Example — customers table with relations:**
```typescript
// src/lib/db/schema/customers.ts
import { pgTable, text, timestamp, uuid, index } from "drizzle-orm/pg-core"
import { pgPolicy } from "drizzle-orm/pg-core"
import { authenticatedRole } from "drizzle-orm/supabase"
import { relations, sql } from "drizzle-orm"
import { orgs } from "./orgs"
import { profiles } from "./profiles"
import { pools } from "./pools"

export const customerStatusEnum = pgEnum("customer_status", [
  "active",
  "paused",
  "cancelled",
])

export const customers = pgTable(
  "customers",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    org_id: uuid("org_id")
      .notNull()
      .references(() => orgs.id, { onDelete: "cascade" }),
    // Core contact info (CUST-01)
    full_name: text("full_name").notNull(),
    address: text("address"),
    phone: text("phone"),
    email: text("email"),
    // Access info (CUST-01)
    gate_code: text("gate_code"),
    access_notes: text("access_notes"),
    // Status and routing
    status: customerStatusEnum("status").notNull().default("active"),
    assigned_tech_id: uuid("assigned_tech_id").references(() => profiles.id, {
      onDelete: "set null",
    }),
    route_name: text("route_name"),
    // Timestamps
    created_at: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    updated_at: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    index("customers_org_id_idx").on(table.org_id),
    index("customers_status_idx").on(table.status),
    index("customers_assigned_tech_idx").on(table.assigned_tech_id),
    // RLS: office/owner/tech can see all customers in their org
    pgPolicy("customers_select_policy", {
      for: "select",
      to: authenticatedRole,
      using: sql`org_id = (select auth.jwt() ->> 'org_id')::uuid`,
    }),
    pgPolicy("customers_insert_policy", {
      for: "insert",
      to: authenticatedRole,
      withCheck: sql`
        org_id = (select auth.jwt() ->> 'org_id')::uuid
        AND (select auth.jwt() ->> 'user_role') IN ('owner', 'office')
      `,
    }),
    pgPolicy("customers_update_policy", {
      for: "update",
      to: authenticatedRole,
      using: sql`
        org_id = (select auth.jwt() ->> 'org_id')::uuid
        AND (select auth.jwt() ->> 'user_role') IN ('owner', 'office')
      `,
      withCheck: sql`
        org_id = (select auth.jwt() ->> 'org_id')::uuid
        AND (select auth.jwt() ->> 'user_role') IN ('owner', 'office')
      `,
    }),
    pgPolicy("customers_delete_policy", {
      for: "delete",
      to: authenticatedRole,
      using: sql`
        org_id = (select auth.jwt() ->> 'org_id')::uuid
        AND (select auth.jwt() ->> 'user_role') IN ('owner', 'office')
      `,
    }),
  ]
).enableRLS()

// v1 relations — export alongside the table, imported by schema barrel
export const customersRelations = relations(customers, ({ one, many }) => ({
  org: one(orgs, { fields: [customers.org_id], references: [orgs.id] }),
  assignedTech: one(profiles, {
    fields: [customers.assigned_tech_id],
    references: [profiles.id],
  }),
  pools: many(pools),
}))
```

**Source:** https://orm.drizzle.team/docs/relations (v1 API, matches drizzle-orm 0.45)

### Pattern 2: RLS Query via withRls (established project pattern)

The project uses `withRls(token, (db) => db.select()...)` for all user-facing reads and writes. This wraps the query in a transaction that sets JWT claims and switches to the `authenticated` role.

**Critical:** The `withRls` callback receives a `DrizzleTx` (transaction). Relational queries (`db._query` / `db.query`) work inside transactions in drizzle-orm 0.45. Use `tx._query.customers.findMany({ with: { pools: true } })` to load nested data in a single SQL call.

```typescript
// Example: fetch customer with pools and pool count
const result = await withRls(token, (tx) =>
  tx._query.customers.findMany({
    where: (c, { eq }) => eq(c.org_id, user.org_id),
    with: {
      pools: {
        columns: { id: true }, // only need count — select minimal columns
      },
    },
    orderBy: (c, { asc }) => [asc(c.full_name)],
  })
)
```

**Source:** Existing codebase `/src/lib/db/index.ts` + https://orm.drizzle.team/docs/rqb

### Pattern 3: TanStack Table with shadcn Table (Client-Side Filtering)

The customer list is a client component that receives pre-fetched data from the server page and handles filtering/sorting entirely client-side for sub-100ms response time.

```typescript
// src/components/customers/customer-table.tsx
"use client"

import {
  ColumnFiltersState,
  SortingState,
  flexRender,
  getCoreRowModel,
  getFilteredRowModel,
  getSortedRowModel,
  useReactTable,
} from "@tanstack/react-table"
import { columns } from "./customer-columns"

interface CustomerTableProps {
  data: CustomerRow[]
}

export function CustomerTable({ data }: CustomerTableProps) {
  const [sorting, setSorting] = React.useState<SortingState>([])
  const [columnFilters, setColumnFilters] = React.useState<ColumnFiltersState>([])
  const [globalFilter, setGlobalFilter] = React.useState("")

  const table = useReactTable({
    data,
    columns,
    getCoreRowModel: getCoreRowModel(),
    getSortedRowModel: getSortedRowModel(),
    getFilteredRowModel: getFilteredRowModel(),
    onSortingChange: setSorting,
    onColumnFiltersChange: setColumnFilters,
    onGlobalFilterChange: setGlobalFilter,
    globalFilterFn: "includesString", // built-in fuzzy match
    state: { sorting, columnFilters, globalFilter },
  })
  // ... render Table, TableHeader, TableBody from shadcn
}
```

**Source:** https://ui.shadcn.com/docs/components/radix/data-table + https://tanstack.com/table/latest

### Pattern 4: shadcn Form with Zod (for Add Pool / Add Equipment modals)

The shadcn Form component requires react-hook-form + @hookform/resolvers + zod. Use this for the modal forms (Add Pool, Add Equipment), not for inline editing.

```typescript
// src/components/customers/add-pool-dialog.tsx
"use client"

import { useForm } from "react-hook-form"
import { zodResolver } from "@hookform/resolvers/zod"
import { z } from "zod"
import {
  Form, FormControl, FormField, FormItem, FormLabel, FormMessage,
} from "@/components/ui/form"

const poolSchema = z.object({
  name: z.string().min(1, "Name is required"),
  type: z.enum(["pool", "spa", "fountain"]),
  volume_gallons: z.coerce.number().int().positive().optional(),
  surface_type: z.enum(["plaster", "pebble", "fiberglass", "vinyl", "tile"]).optional(),
  sanitizer_type: z.enum(["chlorine", "salt", "bromine", "biguanide"]).optional(),
  notes: z.string().optional(),
})

type PoolFormValues = z.infer<typeof poolSchema>

export function AddPoolDialog({ customerId }: { customerId: string }) {
  const form = useForm<PoolFormValues>({
    resolver: zodResolver(poolSchema),
    defaultValues: { type: "pool" },
  })

  const [isPending, startTransition] = useTransition()

  function onSubmit(values: PoolFormValues) {
    startTransition(async () => {
      const result = await addPool({ customerId, ...values })
      if (result.success) {
        form.reset()
        // close dialog via parent state
      }
    })
  }

  return (
    <Form {...form}>
      <form onSubmit={form.handleSubmit(onSubmit)}>
        <FormField
          control={form.control}
          name="name"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Pool Name</FormLabel>
              <FormControl><Input placeholder="Main Pool" {...field} /></FormControl>
              <FormMessage />
            </FormItem>
          )}
        />
        {/* ... more fields */}
      </form>
    </Form>
  )
}
```

**Source:** https://ui.shadcn.com/docs/forms/react-hook-form (FormField pattern confirmed active 2025)

### Pattern 5: Inline Edit (matches existing ProfileForm pattern)

Inline editing reuses the project's established `useState` + `useTransition` + Server Action pattern from `ProfileForm`. NO react-hook-form needed for inline edit — just controlled inputs that toggle between read/edit mode.

```typescript
// src/components/customers/customer-inline-edit.tsx
"use client"

export function CustomerInlineEdit({ customer }: { customer: CustomerDetail }) {
  const [isEditing, setIsEditing] = useState(false)
  const [form, setForm] = useState({
    full_name: customer.full_name,
    address: customer.address ?? "",
    phone: customer.phone ?? "",
    email: customer.email ?? "",
    gate_code: customer.gate_code ?? "",
    access_notes: customer.access_notes ?? "",
  })
  const [isPending, startTransition] = useTransition()
  const [error, setError] = useState<string | null>(null)

  function handleSave() {
    startTransition(async () => {
      const result = await updateCustomer({ id: customer.id, ...form })
      if (result.success) {
        setIsEditing(false)
      } else {
        setError(result.error ?? "Failed to save.")
      }
    })
  }

  if (!isEditing) {
    return (
      <div>
        {/* read view */}
        <Button variant="outline" size="sm" onClick={() => setIsEditing(true)}>
          Edit
        </Button>
      </div>
    )
  }

  return (
    <div>
      {/* edit inputs */}
      <Button onClick={handleSave} disabled={isPending}>
        {isPending ? "Saving..." : "Save"}
      </Button>
      <Button variant="ghost" onClick={() => setIsEditing(false)}>
        Cancel
      </Button>
    </div>
  )
}
```

**Source:** Existing `/src/components/settings/profile-form.tsx` — same pattern, extend it.

### Pattern 6: Server Action Structure

All mutations follow the existing pattern: `"use server"`, `getCurrentUser()` for auth, `withRls()` for user queries, `adminDb` with explicit auth check for elevated ops, return `{ success: boolean; error?: string }`.

```typescript
// src/actions/customers.ts
"use server"

import { revalidatePath } from "next/cache"
import { getCurrentUser } from "./auth"
import { withRls } from "@/lib/db"
import { customers } from "@/lib/db/schema"
import { createClient } from "@/lib/supabase/server"

export async function createCustomer(
  input: CreateCustomerInput
): Promise<{ success: boolean; customerId?: string; error?: string }> {
  const user = await getCurrentUser()
  if (!user) return { success: false, error: "Not authenticated." }
  if (!["owner", "office"].includes(user.role)) {
    return { success: false, error: "Insufficient permissions." }
  }

  const supabase = await createClient()
  const { data: claimsData } = await supabase.auth.getClaims()
  if (!claimsData?.claims) return { success: false, error: "Session expired." }

  const token = claimsData.claims as Parameters<typeof withRls>[0]

  try {
    const [newCustomer] = await withRls(token, (db) =>
      db
        .insert(customers)
        .values({ org_id: user.org_id, ...input })
        .returning({ id: customers.id })
    )
    revalidatePath("/customers")
    return { success: true, customerId: newCustomer.id }
  } catch (err) {
    console.error("[createCustomer] DB error:", err)
    return { success: false, error: "Failed to create customer." }
  }
}
```

**Source:** Existing `/src/actions/profile.ts` + `/src/actions/invite.ts` patterns.

### Pattern 7: Pool Count for Customer List (Subquery Approach)

The customer list needs a `Pool Count` column. Use a correlated subquery in Drizzle rather than loading all pools and counting in JS.

```typescript
// In the list query:
import { count, eq, sql } from "drizzle-orm"

const customersWithCount = await withRls(token, (db) =>
  db
    .select({
      id: customers.id,
      full_name: customers.full_name,
      address: customers.address,
      phone: customers.phone,
      route_name: customers.route_name,
      status: customers.status,
      pool_count: sql<number>`(
        SELECT COUNT(*) FROM pools WHERE pools.customer_id = ${customers.id}
      )`.as("pool_count"),
    })
    .from(customers)
    .where(eq(customers.org_id, user.org_id))
    .orderBy(asc(customers.full_name))
)
```

**Source:** Drizzle `sql` tagged template — verified in existing codebase usage in `/src/lib/db/index.ts`.

### Anti-Patterns to Avoid

- **Loading all pools to count them:** Never `JOIN` or load pool rows just to count. Use `sql\`(SELECT COUNT(*)...)\`` or Drizzle's `count()` aggregate.
- **Using adminDb for user-facing reads:** Always use `withRls` for customer data — the RLS policies isolate org data at the DB level.
- **defineRelations in 0.45:** The `defineRelations` function from drizzle-orm v1.0.0-beta.2 does NOT exist in the currently installed drizzle-orm 0.45. Use the v1 `relations()` function.
- **Server Action redirect inside try/catch:** `redirect()` throws internally in Next.js. Call `redirect()` outside the try/catch or use `router.push()` on the client.
- **Putting table filter state in server component:** All filter/sort state must live in a client component. Server components pass pre-fetched data; client components own interactive state.

---

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Sortable/filterable table | Custom sort logic, filter handlers | `@tanstack/react-table` `getSortedRowModel()` + `getFilteredRowModel()` | Handles sort direction toggles, multi-column sort, global filter — 200+ edge cases |
| Form validation with error display | Manual error state per field | shadcn Form + Zod + `zodResolver` | Type-safe schema, coercion (string→number), nested errors, accessible error announcements |
| Modal dialog with focus trap | Custom overlay + ref management | shadcn Dialog (Radix) | Radix handles focus trap, scroll lock, escape key, ARIA attributes |
| Accessible tab panels | div with onClick | shadcn Tabs (Radix) | Keyboard nav (arrow keys), correct ARIA roles, roving tabindex |
| SQL correlated count | JS `.filter().length` after JOIN | Drizzle `sql\`(SELECT COUNT(*)...)\`` | Single SQL round-trip vs N+1 |

**Key insight:** The hardest part of a data table is sorting state that survives column header clicks, filter input debouncing, and pagination coordination. TanStack Table handles all of it; the project only needs to render the output.

---

## Common Pitfalls

### Pitfall 1: relations() not exported from schema barrel
**What goes wrong:** `adminDb.query.customers` (or `tx._query.customers`) returns undefined / TypeScript error about missing relations.
**Why it happens:** `drizzle({ client, schema })` reads the `schema` object at init time. If `customersRelations` is not exported from `schema/index.ts`, the relation is invisible to the query builder.
**How to avoid:** For every new `xyzRelations` export in a schema file, also add `export * from "./xyz"` in `schema/index.ts`.
**Warning signs:** `db.query.customers` is `undefined` at runtime; TypeScript shows no `with:` option for `customers` in RQB.

### Pitfall 2: pgEnum must be exported and referenced in schema barrel
**What goes wrong:** `drizzle-kit generate` produces migration with no enum; column gets `text` type instead.
**Why it happens:** `drizzle-kit` reads the schema barrel. If `pgEnum` is defined in `customers.ts` but not exported, kit never sees it.
**How to avoid:** Export every `pgEnum` from the schema file AND re-export via `schema/index.ts` barrel. Reference the enum in the table column definition (not just defined and unused).
**Warning signs:** Migration SQL shows `text` instead of the enum type name.

### Pitfall 3: relations() are NOT database constraints
**What goes wrong:** Developer adds `customersRelations` and expects Drizzle Kit to generate a FK constraint from it.
**Why it happens:** Drizzle v1 relations are application-level only — they only power RQB, not migrations.
**How to avoid:** Always add the FK via `.references(() => otherTable.id, { onDelete: ... })` on the column definition itself. Relations objects are separate and additive.
**Warning signs:** Migration SQL shows no `REFERENCES` clause on the FK column.

### Pitfall 4: TanStack Table requires a stable data reference
**What goes wrong:** Table re-renders every keystroke and flickers.
**Why it happens:** If `data` prop is created inline (e.g., `<CustomerTable data={customers.map(...)} />`), React creates a new array reference on every render, causing full table re-initialization.
**How to avoid:** Either fetch data in the server component (stable) and pass as prop, or `useMemo()` the data transformation in the client component.
**Warning signs:** Table scroll position resets on every filter character.

### Pitfall 5: withRls does not support nested transactions in Postgres
**What goes wrong:** Calling `withRls` inside another `withRls` callback throws "cannot begin a transaction within a transaction" (Postgres savepoint error).
**Why it happens:** `withRls` calls `adminDb.transaction()`. Postgres doesn't support true nested transactions without `SAVEPOINT`, which the `postgres` driver doesn't automatically use.
**How to avoid:** All operations for a single user action should happen inside a single `withRls` call. Do not compose multiple `withRls` calls in a Server Action.
**Warning signs:** `Error: current transaction is aborted, commands ignored until end of transaction block`.

### Pitfall 6: Supabase Storage — photo upload size limit in Server Actions
**What goes wrong:** Photo uploads fail silently or with 413 errors.
**Why it happens:** Next.js Server Actions have a default 1 MB body size limit. Photos routinely exceed this.
**How to avoid:** For Phase 2, photos are read-only (service history stub). When Phase 3 adds photo upload, use Supabase's signed URL pattern: generate the upload URL in a Server Action, return it to the client, upload directly from the browser to Supabase Storage.
**Warning signs:** This is a Phase 3 concern — document here so Phase 3 planning is aware.

### Pitfall 7: prepare: false required — already handled, don't break it
**What goes wrong:** If someone adds a new `postgres()` client without `{ prepare: false }`, Supavisor (transaction-mode pooler) rejects prepared statements.
**Why it happens:** Supabase's transaction-mode pooler doesn't support prepared statements (named queries).
**How to avoid:** The existing `src/lib/db/index.ts` client already has `{ prepare: false }`. Never instantiate a new `postgres()` client without it.
**Warning signs:** `Error: prepared statement "s1" does not exist` at runtime.

---

## Schema Design Reference

### Proposed Tables

#### customers

| Column | Type | Notes |
|--------|------|-------|
| id | uuid PRIMARY KEY | gen_random_uuid() |
| org_id | uuid NOT NULL → orgs.id CASCADE | Multi-tenant isolation |
| full_name | text NOT NULL | Primary search field |
| address | text | Street + city, free-form |
| phone | text | No format enforcement at DB level |
| email | text | For reports/portal link |
| gate_code | text | Access info (CUST-01) |
| access_notes | text | Dogs, alarm codes, etc. |
| status | customer_status ENUM | 'active' / 'paused' / 'cancelled' |
| assigned_tech_id | uuid → profiles.id SET NULL | For route filter dropdown |
| route_name | text | Named route (e.g., "Monday North") |
| created_at | timestamptz NOT NULL | |
| updated_at | timestamptz NOT NULL | |

RLS: select for all org members; insert/update/delete for owner+office only.

#### pools (all body-of-water types — CUST-02, CUST-03)

| Column | Type | Notes |
|--------|------|-------|
| id | uuid PRIMARY KEY | |
| org_id | uuid NOT NULL → orgs.id CASCADE | RLS anchor |
| customer_id | uuid NOT NULL → customers.id CASCADE | Parent |
| name | text NOT NULL | "Main Pool", "Hot Tub" |
| type | pool_type ENUM | 'pool' / 'spa' / 'fountain' |
| volume_gallons | integer | Nullable; for dosing calc |
| surface_type | pool_surface ENUM | 'plaster' / 'pebble' / 'fiberglass' / 'vinyl' / 'tile' |
| sanitizer_type | sanitizer_type ENUM | 'chlorine' / 'salt' / 'bromine' / 'biguanide' |
| notes | text | Special notes |
| created_at | timestamptz NOT NULL | |
| updated_at | timestamptz NOT NULL | |

RLS: same as customers (org_id gate, insert/update for owner+office).

**Design note:** Pool, spa, and fountain are the same table — differentiated by `type`. This simplifies queries and avoids 3-table JOINs for the pool list.

#### equipment (CUST-04)

| Column | Type | Notes |
|--------|------|-------|
| id | uuid PRIMARY KEY | |
| org_id | uuid NOT NULL → orgs.id CASCADE | RLS anchor |
| pool_id | uuid NOT NULL → pools.id CASCADE | Parent |
| type | text NOT NULL | 'pump' / 'filter' / 'heater' / 'cleaner' / 'light' / 'other' — text not enum (open-ended) |
| brand | text | |
| model | text | |
| install_date | date | Nullable |
| notes | text | |
| created_at | timestamptz NOT NULL | |
| updated_at | timestamptz NOT NULL | |

**Design note:** `type` is `text` not a pgEnum — equipment categories grow over time and an enum requires a migration for every new category. A check constraint can be added later if enforcement is needed.

RLS: same org_id gate; owner+office can write.

#### service_visits (stub for CUST-06 — Phase 3 populates)

| Column | Type | Notes |
|--------|------|-------|
| id | uuid PRIMARY KEY | |
| org_id | uuid NOT NULL → orgs.id CASCADE | RLS anchor |
| customer_id | uuid NOT NULL → customers.id CASCADE | For history tab |
| pool_id | uuid → pools.id SET NULL | Which pool was serviced |
| tech_id | uuid → profiles.id SET NULL | Who did the service |
| visit_type | text | 'routine' / 'repair' / 'one_off' |
| visited_at | timestamptz NOT NULL | When the service happened |
| notes | text | |
| created_at | timestamptz NOT NULL | |

Phase 2 only reads (empty) from this table. Phase 3 writes to it. Define now to avoid a data-migration in Phase 3 when customers already exist.

---

## Code Examples

Verified patterns from official sources and existing codebase:

### Drizzle v1 relations export (schema/customers.ts)
```typescript
// Source: https://orm.drizzle.team/docs/relations
import { relations } from "drizzle-orm"

export const customersRelations = relations(customers, ({ one, many }) => ({
  org: one(orgs, { fields: [customers.org_id], references: [orgs.id] }),
  assignedTech: one(profiles, {
    fields: [customers.assigned_tech_id],
    references: [profiles.id],
  }),
  pools: many(pools),
}))

export const poolsRelations = relations(pools, ({ one, many }) => ({
  org: one(orgs, { fields: [pools.org_id], references: [orgs.id] }),
  customer: one(customers, { fields: [pools.customer_id], references: [customers.id] }),
  equipment: many(equipment),
  serviceVisits: many(serviceVisits),
}))
```

### TanStack Table column definition with sorting
```typescript
// Source: https://ui.shadcn.com/docs/components/radix/data-table
import { ColumnDef } from "@tanstack/react-table"
import { Button } from "@/components/ui/button"
import { ArrowUpDown } from "lucide-react"

export const columns: ColumnDef<CustomerRow>[] = [
  {
    accessorKey: "full_name",
    header: ({ column }) => (
      <Button
        variant="ghost"
        onClick={() => column.toggleSorting(column.getIsSorted() === "asc")}
      >
        Name
        <ArrowUpDown className="ml-2 h-4 w-4" />
      </Button>
    ),
  },
  {
    accessorKey: "status",
    header: "Status",
    cell: ({ row }) => {
      const status = row.getValue<string>("status")
      return <StatusBadge status={status} />
    },
    filterFn: "equals", // used by the dropdown filter
  },
  {
    accessorKey: "pool_count",
    header: "Pools",
    enableSorting: true,
  },
]
```

### shadcn Tabs for customer profile
```typescript
// Source: https://ui.shadcn.com/docs/components/radix/tabs
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"

export function CustomerProfile({ customer, pools, equipment, visits }) {
  return (
    <div>
      {/* Always-visible header */}
      <CustomerHeader customer={customer} />

      <Tabs defaultValue="overview">
        <TabsList>
          <TabsTrigger value="overview">Overview</TabsTrigger>
          <TabsTrigger value="pools">Pools</TabsTrigger>
          <TabsTrigger value="equipment">Equipment</TabsTrigger>
          <TabsTrigger value="history">History</TabsTrigger>
        </TabsList>
        <TabsContent value="overview">
          <CustomerInlineEdit customer={customer} />
        </TabsContent>
        <TabsContent value="pools">
          <PoolList pools={pools} customerId={customer.id} />
        </TabsContent>
        <TabsContent value="equipment">
          <EquipmentList equipment={equipment} pools={pools} />
        </TabsContent>
        <TabsContent value="history">
          <ServiceHistoryTimeline visits={visits} />
        </TabsContent>
      </Tabs>
    </div>
  )
}
```

### pgEnum pattern (confirmed for drizzle-orm 0.45)
```typescript
// Source: https://orm.drizzle.team/docs/column-types/pg
import { pgEnum } from "drizzle-orm/pg-core"

// Must be exported and referenced in schema barrel
export const customerStatusEnum = pgEnum("customer_status", [
  "active",
  "paused",
  "cancelled",
])

export const poolTypeEnum = pgEnum("pool_type", ["pool", "spa", "fountain"])

export const poolSurfaceEnum = pgEnum("pool_surface", [
  "plaster", "pebble", "fiberglass", "vinyl", "tile",
])

export const sanitizerTypeEnum = pgEnum("sanitizer_type", [
  "chlorine", "salt", "bromine", "biguanide",
])
```

### RLS policy pattern (matches existing schema convention)
```typescript
// Source: existing /src/lib/db/schema/profiles.ts + /src/lib/db/schema/orgs.ts
pgPolicy("customers_select_policy", {
  for: "select",
  to: authenticatedRole,
  // (select auth.jwt() ->> 'org_id') subquery prevents per-row re-evaluation
  using: sql`org_id = (select auth.jwt() ->> 'org_id')::uuid`,
}),
```

---

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| Drizzle v1 `relations()` exported per-table | Drizzle v2 `defineRelations()` centralized | drizzle-orm v1.0.0-beta.2 (Feb 2025) | Not yet available in installed 0.45 — stick with v1 |
| shadcn `FormField` component | shadcn `Field` + `FieldLabel` + `FieldError` | Docs updated ~early 2025 | Both patterns work; shadcn Form component with FormField still widely documented and functional |
| `useFormState` hook | `useActionState` hook | React 19 / Next.js 15 | Project on Next.js 16 + React 19; `useActionState` is correct |
| `serial()` for auto-increment | `uuid().defaultRandom()` | Drizzle best practices 2024+ | Project already uses uuid pattern |

**Deprecated/outdated:**
- `db._query`: Still works in 0.45 but v2 uses `db.query` (without underscore). Both work identically in 0.45 — pick one and be consistent. The codebase has no existing relational queries yet, so start with `db.query` for forward compat.
- `getSession()`: Never use. Project already uses `getClaims()` correctly.

---

## Open Questions

1. **Route management scope in Phase 2**
   - What we know: The customer list has a "Route" column. The CONTEXT.md says filter by Route. Routes as entities (Phase 4) don't exist yet.
   - What's unclear: Is `route_name` a free-text field on the customer table, or should Phase 2 create a minimal `routes` table with a FK? A free-text field means route filter is just string matching. A routes table means Phase 4 has a real FK to link to.
   - Recommendation: Use `route_name` as a free-text column on customers for Phase 2. When Phase 4 adds proper route scheduling, add a `route_id` FK and populate it. Keep the filter working via string match now, FK join later. This avoids premature schema complexity.

2. **Assigned tech dropdown — profiles vs. tech-only profiles**
   - What we know: The customer list filter includes "Assigned Tech" and customers have `assigned_tech_id`. The profiles table has a `role` column with 'tech' value.
   - What's unclear: Does the dropdown show all profiles, or only profiles with `role = 'tech'`?
   - Recommendation: Filter to `role = 'tech'` only when populating the assigned tech dropdown. Customers are assigned to technicians, not office staff. Fetch the tech list alongside the customer list on page load.

3. **service_visits columns for Phase 2 stub**
   - What we know: Phase 3 will define the full schema for service stops. The stub needs enough columns that the history timeline can render something useful when Phase 3 populates it.
   - What's unclear: The exact column set Phase 3 will need (chemical readings, photos, checklists are all Phase 3 concerns).
   - Recommendation: Create a minimal stub with `id, org_id, customer_id, pool_id, tech_id, visit_type, visited_at, notes`. Phase 3 will add a migration to add chemistry readings, checklist completion, photo references. This avoids a destructive change if we only add columns.

---

## Sources

### Primary (HIGH confidence)
- Existing codebase `/src/lib/db/schema/orgs.ts`, `profiles.ts`, `schema/index.ts` — RLS pattern, schema conventions
- Existing codebase `/src/lib/db/index.ts` — `withRls`, `adminDb`, `prepare: false` constraint
- Existing codebase `/src/components/settings/profile-form.tsx` — inline edit pattern
- Existing codebase `/src/actions/profile.ts` — Server Action pattern
- https://orm.drizzle.team/docs/relations — v1 `relations()` API (matches drizzle-orm 0.45)
- https://orm.drizzle.team/docs/rqb — v1 relational query builder, `findMany` with `with:`
- https://orm.drizzle.team/docs/column-types/pg — pgEnum, text, integer, timestamp, jsonb
- https://ui.shadcn.com/docs/components/radix/data-table — TanStack Table + shadcn pattern
- https://orm.drizzle.team/docs/latest-releases/drizzle-orm-v1beta2 — confirmed `defineRelations` is v1.0.0-beta.2 only

### Secondary (MEDIUM confidence)
- https://tanstack.com/table/latest — TanStack Table v8, version 8.21.3
- https://ui.shadcn.com/docs/components/radix/tabs — Tabs component API
- https://ui.shadcn.com/docs/forms/react-hook-form — FormField/FormItem/FormControl/FormMessage pattern
- https://orm.drizzle.team/docs/transactions — tx.query works inside transactions

### Tertiary (LOW confidence)
- WebSearch: @tanstack/react-table current version 8.21.3 (needs verification at install time)
- WebSearch: @hookform/resolvers 5.x, react-hook-form 7.x (verify latest at install time)

---

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH — all libraries already in project or verified via official docs; install commands are standard
- Architecture: HIGH — follows established patterns from Phase 1 codebase exactly
- Schema design: HIGH — directly from requirements + Drizzle column type docs
- Drizzle relations v1 vs v2: HIGH — confirmed from official release notes that 0.45 ≠ v1beta2
- Pitfalls: HIGH — most from direct codebase inspection (prepare: false, RLS pattern) or official docs

**Research date:** 2026-03-05
**Valid until:** 2026-04-05 (30 days — drizzle-orm and shadcn stable; tanstack-table stable)
