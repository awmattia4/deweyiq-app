# Phase 3: Field Tech App — Research

**Researched:** 2026-03-06
**Domain:** Offline-first PWA mobile UX, pool chemistry engine, Supabase Storage, drag-to-reorder, service report delivery
**Confidence:** HIGH (stack locked by prior phases; chemistry math verified against multiple authoritative sources)

---

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions

**Stop workflow flow**
- Tab-based sections: Chemistry | Tasks | Photos | Notes — tech can jump between tabs in any order
- Complete button always visible regardless of active tab
- On completion: quick summary screen flashes readings entered, tasks checked, and photos taken — tech taps confirm to finalize
- After completing a stop: auto-advance to the next stop in the route with a success toast
- Techs can skip stops (must provide a reason) and drag-to-reorder remaining stops on the fly

**Chemistry input & dosing**
- Quick-entry grid: all chemistry parameters visible in a compact grid, tap any cell to enter a value
- Previous visit's readings shown side by side in a muted column next to current entry fields
- LSI value and dosing recommendations appear inline below the chemistry grid, updating live as readings are entered
- Out-of-range readings: color-coded cells (green/yellow/red) plus badge text ('LOW' / 'HIGH') next to the value
- Exact dosing amounts (e.g., '12 oz muriatic acid'), not ranges
- Fluid ounces for liquid chemicals, pounds for dry chemicals
- Product-aware dosing: office configures which chemical products the company uses (including concentration percentages); doses adjust based on actual product concentration
- Which chemistry parameters are required vs optional is configurable per customer/pool by the office

**Route view & day progress**
- Stop list is the primary view when tech opens the app — ordered list of today's stops
- Map view available as a secondary toggle, not the default
- Each stop displayed as an info card: customer name, address, last service date, pool type, and special notes
- Progress bar at top showing 'X of Y stops' with visual fill, AND status badges on each stop card (upcoming, in progress, complete, skipped)
- Navigation: tech sets their preferred maps app (Apple Maps / Google Maps) in settings; navigation button on each stop card opens that app with the address

**Service checklist**
- Each checklist task has a checkbox AND an optional notes field for exceptions (e.g., 'filter pressure high — needs replacement')
- Checklist templates by service type (weekly maintenance, opening, closing, green pool cleanup) as the base
- Per-customer overrides on top of service-type templates — office can add/remove tasks per customer (e.g., 'check salt cell' for saltwater pools)
- 'Mark all complete' button at the top for routine visits where everything was done

**Photo capture**
- Quick camera button: tap to snap, photo auto-attaches to the visit
- After capture, tech can optionally tag the photo (before / after / issue / equipment) — tagging is skippable
- Soft limit: no hard cap on photos, but warning shown after 10 photos per visit
- Client-side compression before upload

**Notes**
- General notes field per visit with voice-to-text microphone button — optimized for techs with wet hands
- Notes visible in service history and customer reports

**Service reports**
- Photo inclusion in auto-emailed service reports is configurable per customer by the office — some customers want photos, others don't
- Service report auto-generated and queued for email delivery on stop completion

### Claude's Discretion
- Loading skeleton and transition animation design
- Exact spacing, typography, and color contrast for outdoor/sunlight visibility
- Photo compression quality and max dimensions
- Offline sync queue implementation details (Dexie + Serwist Background Sync architecture exists from Phase 1)
- Tab order and default active tab when opening a stop
- Voice-to-text implementation approach (Web Speech API vs native)

### Deferred Ideas (OUT OF SCOPE)
- Photo visibility in customer portal — Phase 8 decision (Customer Portal)
- Route building and scheduling — Phase 4 (Scheduling & Routing)
- Pre-arrival customer notifications — Phase 5 (Office Operations & Dispatch)
</user_constraints>

---

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|-----------------|
| FIELD-01 | Tech can view daily route with ordered stop list and map view | Dexie `routeCache` table stub exists from Phase 1; `prefetchTodayRoutes()` hook ready to activate; stop card UI pattern documented |
| FIELD-02 | Tech can navigate to next stop via map link (Apple Maps / Google Maps) | Deep-link URL scheme documented (`maps://` for Apple, `https://maps.google.com/?q=` for Google); user preference stored in settings |
| FIELD-03 | Tech can enter chemical readings (FC, CC, pH, alk, CYA, TDS, CH, phosphates, salt) | Chemistry grid pattern with `inputMode="decimal"` for numeric keypad; controlled state with plain React state (no zodResolver — matches existing pattern) |
| FIELD-04 | System calculates and displays LSI from entered readings | Full CSI/LSI formula verified from TFP wiki; pure TypeScript implementation, no library needed; runs client-side with no network dependency |
| FIELD-05 | System recommends chemical dosing based on readings, pool volume, sanitizer type, and target ranges | Dosing formula documented (target ppm delta × volume factor × product concentration factor); product-aware calculation pattern |
| FIELD-06 | Tech can complete customizable service checklists per stop | shadcn/ui Checkbox + optional notes field; checklist_templates + customer_overrides tables needed; `mark-all-complete` button pattern |
| FIELD-07 | Tech can capture and attach photos to each stop | `<input accept="image/*" capture="environment">` for camera; `browser-image-compression` for client-side compression; Supabase signed upload URL pattern; offline blob queue in Dexie |
| FIELD-08 | Tech can add notes per stop | Textarea with Web Speech API voice-to-text (with iOS PWA fallback caveat documented) |
| FIELD-09 | Tech can mark stop complete with one tap | Completion flow: summary modal → confirm → `enqueueWrite()` to POST visit record → auto-advance |
| FIELD-10 | All field operations work offline and sync automatically when connectivity returns | Dexie `offlineDb` v2 schema (add `visitDrafts` + `photoQueue` tables); existing `enqueueWrite` + `processSyncQueue` pattern; photo blobs stored in Dexie without indexing |
| FIELD-11 | Stop completion workflow optimized for speed (60-second target) | 44px tap targets, `mark-all-complete`, instant LSI calculation, no required photo tagging — all documented |
| FIELD-12 | System auto-generates branded service report after stop completion | Next.js Server Action generates HTML report template; stored in `service_visits.report_html`; triggered on completion |
| FIELD-13 | Service report automatically emailed to customer (configurable per customer) | Supabase Edge Function + Resend API pattern; triggered by `supabase.functions.invoke()`; customer `email_reports` flag controls delivery |
</phase_requirements>

---

## Summary

Phase 3 builds the daily-driver mobile interface for field technicians. The stack is entirely determined by prior phases: Next.js 16 PWA, Serwist 9.x service worker, Dexie 4.x IndexedDB, Supabase (Storage + Edge Functions), Drizzle ORM with `withRls()`. No new framework decisions are needed.

The two hardest technical problems are the chemistry engine and offline photo uploads. The chemistry engine (LSI/CSI calculation + product-aware dosing) must run entirely offline without any library — it is a deterministic pure math function using verified formulas from pool industry sources. The photo pipeline requires a two-phase approach: compress client-side with `browser-image-compression`, store the blob in Dexie IndexedDB when offline, and upload to Supabase Storage via signed URL when connectivity returns. The existing `enqueueWrite` pattern handles text mutations; photos need a parallel `photoQueue` table in Dexie because blobs cannot be JSON-serialized.

The UX north star is the 60-second routine stop. Every interaction — tab switching, chemistry grid entry, checklist mark-all, photo snap — must reach its server action in two taps or fewer. Drag-to-reorder uses `@dnd-kit/sortable` with touch sensor activation delay tuned for wet hands. Voice-to-text uses the Web Speech API with a documented iOS PWA limitation (does not work in standalone mode) requiring a graceful fallback.

**Primary recommendation:** Build the chemistry engine as a pure TypeScript module (`lib/chemistry/`) first — it is the most complex domain-specific logic and must be correct before any UI is built around it.

---

## Standard Stack

### Core (locked by prior phases)

| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| Next.js | 16.1.6 | App framework, server actions, routing | Already in project |
| Serwist (`@serwist/next`) | 9.5.6 | Service worker, precache, offline shell | Already in project |
| Dexie.js | 4.3.0 | IndexedDB wrapper, offline data persistence | Already in project |
| `@supabase/supabase-js` | 2.98.0 | Storage uploads, Edge Function invocation | Already in project |
| Drizzle ORM | 0.45.x | Database schema, RLS transactions | Already in project |
| shadcn/ui (Radix) | via `radix-ui@1.4.3` | Tabs, Checkbox, Dialog, Toast | Already in project |
| Tailwind CSS v4 | 4.x | Styling, OKLCH color, 44px tap targets | Already in project |
| `lucide-react` | 0.576.0 | Icons (camera, mic, check, nav) | Already in project |

### New Dependencies

| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| `@dnd-kit/core` + `@dnd-kit/sortable` | latest (6.x) | Drag-to-reorder stop list, touch sensor | Route view stop reordering |
| `browser-image-compression` | latest (2.x) | Client-side JPEG/PNG compression before upload | Photo capture before Supabase Storage upload |
| `dexie-react-hooks` | latest (1.x) | `useLiveQuery()` hook for reactive Dexie queries in React | Any component that reads Dexie data and needs to re-render on change |

**Installation:**
```bash
npm install @dnd-kit/core @dnd-kit/sortable @dnd-kit/utilities browser-image-compression dexie-react-hooks
```

### Alternatives Considered

| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| `browser-image-compression` | `compressorjs` | compressorjs uses canvas.toBlob directly (lossy, no web worker); browser-image-compression supports OffscreenCanvas for non-blocking compression — prefer for field use |
| `@dnd-kit` | `react-beautiful-dnd` | react-beautiful-dnd is unmaintained since 2023; dnd-kit is actively maintained with first-class touch support |
| `@dnd-kit` | Framer Motion Reorder | Framer Motion Reorder is animation-only, no collision detection or keyboard support |
| Web Speech API | No voice-to-text | Web Speech API does not work in iOS PWA standalone mode — see Pitfalls section |
| Supabase Edge Function (email) | Next.js API route | Server actions/API routes work for initial trigger; Edge Function runs globally with lower latency and handles Resend API key securely without exposing to client |

---

## Architecture Patterns

### Recommended Project Structure

```
src/
├── app/
│   ├── (field)/                   # Field tech route group
│   │   ├── layout.tsx             # Field shell: bottom nav, offline banner
│   │   ├── routes/                # Route list view (FIELD-01)
│   │   │   ├── page.tsx
│   │   │   └── [stopId]/          # Individual stop workflow
│   │   │       └── page.tsx
│   │   └── settings/              # Tech preferences (maps app selection)
│   │       └── page.tsx
│   └── api/
│       └── routes/
│           └── today/
│               └── route.ts       # GET today's stops for offline prefetch
├── actions/
│   ├── visits.ts                  # createVisit, completeStop server actions
│   └── storage.ts                 # createSignedUploadUrl server action
├── components/
│   └── field/
│       ├── stop-list.tsx          # Route view stop cards
│       ├── stop-card.tsx          # Individual stop card with status badge
│       ├── stop-workflow.tsx      # Tab host: Chemistry | Tasks | Photos | Notes
│       ├── chemistry-grid.tsx     # Quick-entry chemistry grid
│       ├── chemistry-dosing.tsx   # LSI + dosing panel below grid
│       ├── checklist.tsx          # Checklist with mark-all and task notes
│       ├── photo-capture.tsx      # Camera button + photo grid + tag sheet
│       ├── notes-field.tsx        # Textarea + voice-to-text mic button
│       └── completion-modal.tsx   # Summary + confirm flow
└── lib/
    ├── chemistry/
    │   ├── lsi.ts                 # LSI/CSI calculation (pure math, no deps)
    │   ├── dosing.ts              # Chemical dosing engine
    │   └── targets.ts             # Ideal ranges by sanitizer type
    ├── offline/
    │   ├── db.ts                  # Dexie schema v2 (add visitDrafts, photoQueue)
    │   └── sync.ts                # Existing sync engine (activate prefetchTodayRoutes)
    └── db/
        └── schema/
            ├── service-visits.ts  # Extend with chemistry_readings JSONB column
            ├── checklists.ts      # checklist_templates, checklist_tasks tables
            └── visit-photos.ts    # visit_photos table + RLS
```

### Pattern 1: Dexie Schema Version Migration

**What:** Dexie uses explicit version numbers. When Phase 3 adds new tables (`visitDrafts`, `photoQueue`), the existing `version(1)` definition stays unchanged and a new `version(2)` is added. Dexie runs the upgrade automatically.

**When to use:** Any time new IndexedDB object stores are needed.

```typescript
// Source: Dexie.js docs — https://dexie.org/docs/Version/Version.stores()
// src/lib/offline/db.ts — extend existing Phase 1 schema

class OfflineDB extends Dexie {
  syncQueue!: Table<SyncQueueItem>
  routeCache!: Table<CachedRoute>
  visitDrafts!: Table<VisitDraft>  // Phase 3
  photoQueue!: Table<PhotoQueueItem>  // Phase 3

  constructor() {
    super("poolco-offline")
    // KEEP version(1) unchanged — never modify existing versions
    this.version(1).stores({
      syncQueue: "++id, createdAt, retries, status",
      routeCache: "id, cachedAt, expiresAt",
    })
    // Add version(2) with new tables — Dexie auto-migrates
    this.version(2).stores({
      syncQueue: "++id, createdAt, retries, status",
      routeCache: "id, cachedAt, expiresAt",
      visitDrafts: "id, stopId, updatedAt, status",   // id = visit_id (UUID)
      photoQueue: "++id, visitId, status, createdAt",  // blob stored inline
    })
  }
}

// VisitDraft: the in-progress stop data before completion
export interface VisitDraft {
  id: string                    // visit UUID (generated client-side)
  stopId: string                // route stop ID
  chemistry: ChemistryReadings  // all reading values
  checklist: ChecklistState[]   // task completion + notes
  notes: string
  status: "draft" | "completed"
  updatedAt: number
}

// PhotoQueueItem: offline photo waiting to upload
// CRITICAL: store blob NOT as base64 string — IndexedDB handles Blob natively
// NEVER index the blob column — large binary indexes corrupt IDB performance
export interface PhotoQueueItem {
  id?: number           // auto-increment
  visitId: string       // foreign key to visitDrafts.id
  blob: Blob            // raw compressed image blob — not indexed
  tag?: string          // "before" | "after" | "issue" | "equipment" | undefined
  status: "pending" | "uploaded" | "failed"
  storagePath?: string  // filled after successful upload
  createdAt: number
}
```

### Pattern 2: Offline-First Visit Draft

**What:** The visit is created as a `VisitDraft` in Dexie on first tap. All chemistry, checklist, photo, and notes changes write to Dexie immediately. On completion, the complete draft is serialized and enqueued via `enqueueWrite()` to `POST /api/visits`. This means the tech never loses work if the app closes mid-stop.

**When to use:** Every field mutation during a stop.

```typescript
// Write pattern: immediate Dexie write + background sync
// src/components/field/chemistry-grid.tsx

async function updateChemistryReading(
  visitId: string,
  param: ChemParam,
  value: number | null
) {
  // 1. Immediate local write (zero latency)
  await offlineDb.visitDrafts.update(visitId, (draft) => {
    draft.chemistry[param] = value
  })
  // 2. Re-calculate LSI/dosing from updated state (client-side, no network)
  // 3. UI re-renders via useLiveQuery — no extra state management
}

// useLiveQuery: reactive Dexie reads — re-renders when IndexedDB changes
// Source: https://dexie.org/docs/dexie-react-hooks/useLiveQuery()
import { useLiveQuery } from "dexie-react-hooks"

function ChemistryGrid({ visitId }: { visitId: string }) {
  const draft = useLiveQuery(
    () => offlineDb.visitDrafts.get(visitId),
    [visitId]
  )
  // draft is undefined while loading, then auto-updates on any write
}
```

### Pattern 3: Photo Upload via Signed URL

**What:** Server action creates a signed upload URL. Client uploads directly to Supabase Storage from the browser — never proxied through the Next.js server (avoids 1MB body limit). Photos compressed before upload. If offline, blob stored in Dexie `photoQueue` and uploaded when online.

**When to use:** All photo attachments.

```typescript
// Step 1: Server action (runs only when online)
// src/actions/storage.ts
"use server"
export async function createPhotoUploadUrl(
  visitId: string,
  fileName: string
): Promise<{ signedUrl: string; token: string; path: string }> {
  const supabase = await createClient()
  const path = `visits/${visitId}/${fileName}`
  const { data, error } = await supabase.storage
    .from("visit-photos")
    .createSignedUploadUrl(path, { upsert: false })
  if (error) throw error
  return { signedUrl: data.signedUrl, token: data.token, path }
}

// Step 2: Client compression + upload
// src/components/field/photo-capture.tsx
import imageCompression from "browser-image-compression"

async function handlePhotoCapture(file: File, visitId: string) {
  // Compress first — target 800px max, 0.8 quality, ~300KB
  const compressed = await imageCompression(file, {
    maxSizeMB: 0.3,
    maxWidthOrHeight: 1200,
    useWebWorker: true,
    fileType: "image/webp",
  })

  if (!navigator.onLine) {
    // Store blob in Dexie — NEVER base64 encode, store raw Blob
    await offlineDb.photoQueue.add({
      visitId,
      blob: compressed,
      status: "pending",
      createdAt: Date.now(),
    })
    return
  }

  // Online: get signed URL and upload directly
  const { token, path } = await createPhotoUploadUrl(visitId, `${Date.now()}.webp`)
  const supabase = createBrowserClient()
  await supabase.storage.from("visit-photos").uploadToSignedUrl(path, token, compressed, {
    contentType: "image/webp",
    cacheControl: "3600",
  })
}
```

### Pattern 4: LSI/CSI Chemistry Calculation

**What:** Pure TypeScript function — no library, no network. Uses the Trouble Free Pool CSI formula which is more accurate than the classic LSI because it accounts for ionic strength and salt. Runs on every keystroke for instant feedback.

**When to use:** Any time chemistry readings change.

```typescript
// src/lib/chemistry/lsi.ts
// Source: Trouble Free Pool Wiki — https://www.troublefreepool.com/wiki/index.php?title=CSI_and_LSI

export interface ChemistryReadings {
  pH: number | null
  totalAlkalinity: number | null   // ppm
  calciumHardness: number | null   // ppm
  cya: number | null               // ppm cyanuric acid
  salt: number | null              // ppm
  borate: number | null            // ppm (optional)
  temperatureF: number | null      // Fahrenheit
}

export function calculateCSI(r: ChemistryReadings): number | null {
  const { pH, totalAlkalinity: TA, calciumHardness: CH, cya: CYA, salt, borate, temperatureF } = r
  if (pH == null || TA == null || CH == null || temperatureF == null) return null

  const T = (temperatureF - 32) * 5 / 9  // Fahrenheit to Celsius

  // Carbonate alkalinity corrected for CYA and borate
  const cyaFactor = CYA != null
    ? (0.38772 * CYA) / (1 + Math.pow(10, 6.83 - pH))
    : 0
  const borateFactor = borate != null
    ? (4.63 * borate) / (1 + Math.pow(10, 9.11 - pH))
    : 0
  const CarbAlk = TA - cyaFactor - borateFactor

  if (CarbAlk <= 0 || CH <= 0) return null

  // Ionic strength (accounts for calcium and salt dissolved solids)
  const extraNaCl = Math.max(0, (salt ?? 0) - 1.1678 * CH)
  const Ionic = (1.5 * CH + TA) / 50045 + extraNaCl / 58440

  // CSI = pH - 11.677 + log(CH) + log(CarbAlk) - ionic_correction - temp_correction + 4.7375
  const ionicCorrection = (2.56 * Math.sqrt(Ionic)) / (1 + 1.65 * Math.sqrt(Ionic))
  const tempCorrection = 1412.5 / (T + 273.15)

  return pH - 11.677 + Math.log10(CH) + Math.log10(CarbAlk) - ionicCorrection - tempCorrection + 4.7375
}

// CSI interpretation ranges:
// <= -0.6:  Plaster corrosion likely (etching)
// -0.6 to -0.3: Potential corrosion
// -0.3 to +0.3: Balanced (target zone)
// +0.3 to +0.6: Potential scaling
// >= +0.6:  Scaling likely
```

### Pattern 5: Product-Aware Chemical Dosing Engine

**What:** Dosing amounts are calculated as: `delta_ppm × volume_factor / product_factor`. The `product_factor` normalizes for the active ingredient percentage the office configures. Output is in fluid oz (liquid) or lbs (dry).

**When to use:** Generating dosing recommendations from readings.

```typescript
// src/lib/chemistry/dosing.ts

// Base dose rates are per 10,000 gallons to raise by 1 ppm
// Source: Pool Chemical Calculator documentation + industry CPO training materials
const BASE_DOSE_RATES = {
  // Chemical: { rate, unit, increases }
  sodiumHypochlorite_12pct: { rateOzPer1ppmPer10k: 10.7, unit: "floz" as const },
  calciumHypochlorite_67pct: { rateOzPer1ppmPer10k: 2.0,  unit: "oz" as const },
  sodiumBicarbonate:         { rateLbsPer10ppmPer10k: 1.4, unit: "lbs" as const },
  muriatic_31pct:            { rateOzPer1ppmPer10k: 8.0,  unit: "floz" as const }, // to lower pH/alk
} as const

export interface ChemicalProduct {
  id: string
  name: string             // e.g., "31.45% Muriatic Acid"
  chemical: keyof typeof BASE_DOSE_RATES
  concentrationPct: number // actual product %, e.g., 31.45
}

export function calcDose(
  deltaPpm: number,           // how much to raise/lower (positive = raise)
  volumeGallons: number,
  product: ChemicalProduct,
): { amount: number; unit: string } {
  const base = BASE_DOSE_RATES[product.chemical]
  const volumeFactor = volumeGallons / 10_000
  // Adjust for product concentration vs reference concentration
  const refConc = getReferenceConcentration(product.chemical)
  const concFactor = refConc / product.concentrationPct

  if ("rateOzPer1ppmPer10k" in base) {
    const amount = Math.round(base.rateOzPer1ppmPer10k * deltaPpm * volumeFactor * concFactor * 10) / 10
    return { amount, unit: base.unit }
  }
  // lbs-based chemical
  const amount = Math.round((base.rateLbsPer10ppmPer10k / 10) * deltaPpm * volumeFactor * concFactor * 10) / 10
  return { amount, unit: base.unit }
}
```

### Pattern 6: Drag-to-Reorder Stop List

**What:** `@dnd-kit/sortable` with `TouchSensor` configured for wet-hand use (250ms press delay, 5px tolerance). Order changes write to Dexie `routeCache` immediately.

**When to use:** Route view stop reordering.

```typescript
// src/components/field/stop-list.tsx
// Source: https://docs.dndkit.com/api-documentation/sensors/touch
import {
  DndContext,
  closestCenter,
  TouchSensor,
  MouseSensor,
  useSensor,
  useSensors,
} from "@dnd-kit/core"
import { SortableContext, verticalListSortingStrategy, arrayMove } from "@dnd-kit/sortable"

function StopList({ stops }: { stops: RouteStop[] }) {
  const sensors = useSensors(
    useSensor(TouchSensor, {
      // 250ms hold before drag starts — prevents accidental drags during scroll
      activationConstraint: { delay: 250, tolerance: 5 },
    }),
    useSensor(MouseSensor, {
      activationConstraint: { distance: 10 },
    })
  )

  function handleDragEnd(event: DragEndEvent) {
    const { active, over } = event
    if (active.id !== over?.id) {
      const oldIndex = stops.findIndex((s) => s.id === active.id)
      const newIndex = stops.findIndex((s) => s.id === over?.id)
      const reordered = arrayMove(stops, oldIndex, newIndex)
      // Write new order to Dexie — survives offline
      void saveRouteOrder(reordered)
    }
  }

  return (
    <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
      <SortableContext items={stops.map(s => s.id)} strategy={verticalListSortingStrategy}>
        {stops.map((stop) => <SortableStopCard key={stop.id} stop={stop} />)}
      </SortableContext>
    </DndContext>
  )
}
```

### Pattern 7: Service Report Email via Supabase Edge Function

**What:** On stop completion, the Next.js server action generates an HTML report string, saves it to `service_visits.report_html`, then invokes an Edge Function to send via Resend. The Edge Function is stateless and idempotent.

**When to use:** Stop completion when customer has `email_reports = true`.

```typescript
// src/actions/visits.ts — server action invokes edge function
import { createClient } from "@/lib/supabase/server"

export async function completeStop(visitId: string) {
  // ... save visit record with withRls() ...

  // Trigger email if customer configured for it
  if (customer.email_reports && customer.email) {
    const supabase = await createClient()
    const { error } = await supabase.functions.invoke("send-service-report", {
      body: {
        visitId,
        customerEmail: customer.email,
        customerName: customer.full_name,
      },
    })
    if (error) {
      // Log but don't fail the completion — report delivery is best-effort
      console.error("[completeStop] Edge function error:", error)
    }
  }
}

// supabase/functions/send-service-report/index.ts
// Source: https://resend.com/docs/send-with-supabase-edge-functions
const RESEND_API_KEY = Deno.env.get("RESEND_API_KEY")

Deno.serve(async (req) => {
  const { visitId, customerEmail, customerName } = await req.json()
  // Fetch visit data from DB (service role — bypasses RLS intentionally)
  // Build HTML report...
  await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Authorization": `Bearer ${RESEND_API_KEY}`,
    },
    body: JSON.stringify({
      from: "PoolCo <reports@poolco.app>",
      to: [customerEmail],
      subject: `Service Report — ${customerName}`,
      html: reportHtml,
    }),
  })
  return new Response("ok")
})
```

### Pattern 8: Maps Navigation Deep Links

**What:** Navigation button opens the customer's address in Apple Maps or Google Maps via deep-link URL. The tech's preference is stored in localStorage/settings.

```typescript
// Maps deep-link URLs (no library needed)
// Apple Maps: works on iOS; falls back to maps.apple.com on other platforms
// Google Maps: works cross-platform via browser redirect

function openInMaps(address: string, preference: "apple" | "google") {
  const encoded = encodeURIComponent(address)
  if (preference === "apple") {
    window.open(`maps://maps.apple.com/?q=${encoded}`, "_blank")
    // iOS fallback if maps:// doesn't work in PWA:
    // window.open(`https://maps.apple.com/?q=${encoded}`, "_blank")
  } else {
    window.open(`https://www.google.com/maps/search/?api=1&query=${encoded}`, "_blank")
  }
}
```

### Anti-Patterns to Avoid

- **Base64-encoding photos in Dexie:** Store raw `Blob` objects in IndexedDB — base64 inflates size ~33% and blocks the main thread during encoding. IndexedDB handles Blobs natively.
- **Indexing blob columns in Dexie:** Never put a blob column in the Dexie store definition string. Only declare columns you query on as indexes.
- **Uploading photos through Next.js server actions:** Next.js enforces a 1MB body size limit on server actions. Use signed URL + direct Supabase Storage upload from the browser instead.
- **Using `zodResolver` from `@hookform/resolvers@5` with `zod@4`:** Incompatible (documented in Phase 2 decisions). Use plain React state + inline validation for chemistry form, matching the pattern established in `invite-dialog.tsx`.
- **Correlated subqueries in `withRls` transactions:** Use LEFT JOIN + GROUP BY + count() pattern (documented Phase 2 pitfall). Applies when fetching stop list with visit counts.
- **Blocking the main thread on chemistry calculation:** The CSI formula involves `Math.log10`, `Math.sqrt`, and floating-point division — all synchronous and fast enough to run on every keystroke without a web worker.
- **Assuming Web Speech API works in iOS PWA standalone mode:** It does not. See Pitfalls section.

---

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Client-side image compression | Canvas resize loop | `browser-image-compression` | Handles OffscreenCanvas web worker, EXIF preservation, progressive JPEG, WebP conversion, cross-browser quirks |
| Drag-to-reorder with touch | Custom pointer event tracking | `@dnd-kit/sortable` | Touch activation constraints, keyboard accessibility, scroll-during-drag conflict resolution |
| Reactive IndexedDB reads | Manual event listeners on IDB | `useLiveQuery` from `dexie-react-hooks` | Handles cross-tab invalidation, service worker writes, proper React lifecycle |
| Email delivery | Custom SMTP client | Resend via Supabase Edge Function | DNS, deliverability, bounce handling, SPF/DKIM — not solvable in one sprint |
| Service worker management | Raw SW registration | Serwist (already in project) | Precache manifest, cache strategies, update flow — already working |

**Key insight:** The chemistry engine is the one place where hand-rolling is correct — there is no npm package with the full CSI formula + product-aware dosing + CYA correction. This must be custom TypeScript in `lib/chemistry/`.

---

## Common Pitfalls

### Pitfall 1: Web Speech API Does Not Work in iOS PWA Standalone Mode

**What goes wrong:** The microphone button appears, `SpeechRecognition` is defined in the browser, but `recognition.start()` silently fails or throws a permissions error when the PWA is installed to the home screen on iOS.

**Why it happens:** Safari iOS allows Speech Recognition in Safari browser tabs, but the API is blocked in standalone PWA mode due to unresolved microphone permission handling in the PWA context. This is a known, unresolved WebKit bug as of early 2026.

**How to avoid:** Show the mic button but detect capability with:
```typescript
const speechAvailable = typeof window !== "undefined" &&
  ("SpeechRecognition" in window || "webkitSpeechRecognition" in window) &&
  !window.matchMedia("(display-mode: standalone)").matches
```
When `speechAvailable === false`, hide the mic button rather than showing a broken UI. The notes textarea works fine for typing. Do not block the notes feature on voice-to-text availability.

**Warning signs:** Tech reports mic button does nothing on iPhone when app is installed to home screen.

---

### Pitfall 2: Dexie Schema Version Regression

**What goes wrong:** Developer modifies the existing `version(1).stores({...})` definition in `db.ts` instead of adding a new `version(2)`. Dexie throws `VersionError: The requested version (1) is lower than the existing version (1)` on any browser that already has the old schema.

**Why it happens:** IndexedDB versions are monotonically increasing. Once a browser has opened the DB at version 1, it can never re-open at version 1 with a different schema.

**How to avoid:** Treat existing version declarations as immutable. Always add a new `.version(N+1).stores({...})` block with the full schema. The existing `version(1)` in `db.ts` must not be modified.

**Warning signs:** Console error `VersionError` or `upgradeneeded` failures in dev tools.

---

### Pitfall 3: Photo Blob Lost on App Close During Upload

**What goes wrong:** Tech takes a photo, the upload starts, the app is closed (or goes offline), the upload fails, and the photo is gone because the in-memory file reference is lost.

**Why it happens:** File objects from `<input type="file">` are not persisted across app sessions. If the compressed blob is only in memory and not in Dexie, it disappears when the app closes.

**How to avoid:** Write the compressed blob to `offlineDb.photoQueue` IMMEDIATELY after compression, before attempting any upload. Only delete the Dexie row after confirmed successful upload (HTTP 200 from Supabase Storage). This is the same pattern as `enqueueWrite` for text mutations.

**Warning signs:** Photos missing from completed visits when tech had network issues during the stop.

---

### Pitfall 4: drizzle-kit push Creates RLS Policies with NULL Expressions

**What goes wrong:** After adding new tables (`checklists`, `visit_photos`) with `drizzle-kit push`, the RLS policies are created with NULL USING/WITH CHECK expressions, silently blocking all queries.

**Why it happens:** This is a confirmed Phase 2 bug documented in MEMORY.md. `drizzle-kit push` does not reliably serialize the `sql` template literal into policy conditions.

**How to avoid:** After every `drizzle-kit push` or migration, run:
```sql
SELECT policyname, cmd, qual, with_check
FROM pg_policies
WHERE tablename IN ('checklist_templates', 'checklist_tasks', 'visit_photos', 'service_visits');
```
Any row with `NULL` in `qual` or `with_check` must be manually patched in Supabase SQL editor.

**Warning signs:** All queries to new tables return empty results or permission denied, even with correct auth.

---

### Pitfall 5: correlated Subqueries Inside withRls Returning Wrong Results

**What goes wrong:** A query inside `withRls()` uses a correlated subquery on an RLS-protected table (e.g., counting service visits per stop). Returns 0 or wrong counts for all rows.

**Why it happens:** Documented Phase 2 pitfall. RLS re-evaluation inside correlated subqueries conflicts with the `SET LOCAL ROLE authenticated` transaction context.

**How to avoid:** Always use LEFT JOIN + GROUP BY + count() instead of subqueries when joining RLS-protected tables inside `withRls`:
```typescript
// WRONG — correlated subquery
db.select().from(stops)
  .where(eq(stops.org_id, orgId))
  // subquery here will return wrong results inside withRls

// CORRECT — LEFT JOIN
db.select({ stop: stops, visitCount: count(serviceVisits.id) })
  .from(stops)
  .leftJoin(serviceVisits, eq(serviceVisits.stop_id, stops.id))
  .where(eq(stops.org_id, orgId))
  .groupBy(stops.id)
```

---

### Pitfall 6: Chemistry Grid `inputMode` Must Be `"decimal"` Not `"number"`

**What goes wrong:** Using `<input type="number">` on iOS shows the numeric keypad but prevents entering decimal values like "7.4" for pH without a separate decimal point button. `type="text"` with `inputMode="decimal"` shows the decimal-capable numeric keypad on all mobile platforms.

**How to avoid:**
```tsx
<input
  type="text"
  inputMode="decimal"
  pattern="[0-9]*\.?[0-9]*"
  placeholder="7.4"
  // value and onChange managed with plain React state (not react-hook-form)
/>
```

**Warning signs:** Techs unable to enter pH values with decimal points on iPhone.

---

### Pitfall 7: Supabase Storage Bucket RLS Must Use org_id in Path

**What goes wrong:** Photos from different orgs can be read by any authenticated user if the storage policy only checks `auth.role() = 'authenticated'` without path scoping.

**How to avoid:** Structure the storage path as `{org_id}/visits/{visit_id}/{filename}.webp` and write the RLS policy using `storage.foldername()`:
```sql
-- storage.objects RLS policy
CREATE POLICY "org scoped photo access"
ON storage.objects
FOR SELECT TO authenticated
USING (
  bucket_id = 'visit-photos'
  AND (storage.foldername(name))[1] = (auth.jwt() ->> 'org_id')
);
```

---

## Code Examples

### Supabase Storage: Create Signed URL + Upload

```typescript
// Source: https://supabase.com/docs/reference/javascript/storage-from-uploadtosignedurl

// Server action — creates upload token (never exposed to client)
const { data, error } = await supabase.storage
  .from("visit-photos")
  .createSignedUploadUrl(`${orgId}/visits/${visitId}/${fileName}`, { upsert: false })
const { signedUrl, token, path } = data

// Client — upload directly to Supabase (NOT through Next.js server action)
const { data: uploadData, error: uploadError } = await supabase.storage
  .from("visit-photos")
  .uploadToSignedUrl(path, token, compressedBlob, {
    contentType: "image/webp",
    cacheControl: "3600",
  })
```

### Supabase Edge Function Invocation

```typescript
// Source: https://supabase.com/docs/reference/javascript/functions-invoke

const { data, error } = await supabase.functions.invoke("send-service-report", {
  body: {
    visitId,
    customerEmail: customer.email,
  },
})
// FunctionsHttpError = function returned error status
// FunctionsFetchError = network error reaching edge
```

### useLiveQuery for Visit Draft

```typescript
// Source: https://dexie.org/docs/dexie-react-hooks/useLiveQuery()
import { useLiveQuery } from "dexie-react-hooks"
import { offlineDb } from "@/lib/offline/db"

function StopWorkflow({ visitId }: { visitId: string }) {
  const draft = useLiveQuery(
    () => offlineDb.visitDrafts.get(visitId),
    [visitId]
  )

  if (draft === undefined) return <Skeleton />  // loading
  if (draft === null) return <EmptyDraft />      // not found
  // draft is fully typed VisitDraft — re-renders on any Dexie write
}
```

### dnd-kit Sortable Stop Card

```typescript
// Source: https://docs.dndkit.com/presets/sortable
import { useSortable } from "@dnd-kit/sortable"
import { CSS } from "@dnd-kit/utilities"

function SortableStopCard({ stop }: { stop: RouteStop }) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } =
    useSortable({ id: stop.id })

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
    touchAction: "none",  // REQUIRED for touch sensors — prevents scroll conflict
  }

  return (
    <div ref={setNodeRef} style={style} {...attributes} {...listeners}>
      <StopCard stop={stop} />
    </div>
  )
}
```

### Scrollable Tabs for Mobile

```tsx
// Source: https://glensea.com/snippets/shadcn-tab-component-mobile-responsive-overflow
// Chemistry | Tasks | Photos | Notes — 4 tabs on a 375px screen requires scroll

<div className="relative rounded-sm overflow-x-auto h-10 bg-muted">
  <TabsList className="absolute flex flex-row w-full min-w-max">
    <TabsTrigger value="chemistry" className="flex-1">Chemistry</TabsTrigger>
    <TabsTrigger value="tasks" className="flex-1">Tasks</TabsTrigger>
    <TabsTrigger value="photos" className="flex-1">Photos</TabsTrigger>
    <TabsTrigger value="notes" className="flex-1">Notes</TabsTrigger>
  </TabsList>
</div>
```

---

## Database Schema Extensions (Phase 3 Additions)

The Phase 2 `service_visits` stub table needs the following new columns and new tables. Phase 3 adds a Drizzle migration:

### Extend `service_visits` table

```typescript
// Add to service-visits.ts via new Drizzle columns:
chemistry_readings: jsonb("chemistry_readings"),      // ChemistryReadings object
checklist_completion: jsonb("checklist_completion"),  // ChecklistState[] array
photo_urls: jsonb("photo_urls"),                      // string[] of Storage paths
visit_type: text("visit_type"),                       // already exists, keep
status: text("status"),                               // "scheduled"|"in_progress"|"complete"|"skipped"
skip_reason: text("skip_reason"),                     // required when status="skipped"
report_html: text("report_html"),                     // generated HTML service report
completed_at: timestamp("completed_at"),              // when tech tapped Complete
```

### New table: `checklist_templates`

Stores service-type-level templates (weekly maintenance, opening, closing, green pool).

```typescript
// org_id scoped, RLS: owner+office can manage; tech can read
export const checklistTemplates = pgTable("checklist_templates", {
  id: uuid("id").defaultRandom().primaryKey(),
  org_id: uuid("org_id").notNull().references(() => orgs.id, { onDelete: "cascade" }),
  name: text("name").notNull(),         // "Weekly Maintenance"
  service_type: text("service_type"),   // "routine" | "opening" | "closing" | "green_pool"
  created_at: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
}, ...)
```

### New table: `checklist_tasks`

Individual tasks within a template, with optional customer-level override.

```typescript
export const checklistTasks = pgTable("checklist_tasks", {
  id: uuid("id").defaultRandom().primaryKey(),
  template_id: uuid("template_id").references(() => checklistTemplates.id, { onDelete: "cascade" }),
  customer_id: uuid("customer_id").references(() => customers.id, { onDelete: "cascade" }), // null = template-level
  label: text("label").notNull(),          // "Skim surface"
  is_required: boolean("is_required").notNull().default(true),
  sort_order: integer("sort_order").notNull().default(0),
  is_deleted: boolean("is_deleted").notNull().default(false), // soft delete for customer override removal
}, ...)
```

### New table: `visit_photos`

Tracks uploaded photos per visit for the service report.

```typescript
export const visitPhotos = pgTable("visit_photos", {
  id: uuid("id").defaultRandom().primaryKey(),
  visit_id: uuid("visit_id").notNull().references(() => serviceVisits.id, { onDelete: "cascade" }),
  org_id: uuid("org_id").notNull().references(() => orgs.id, { onDelete: "cascade" }),
  storage_path: text("storage_path").notNull(), // e.g., "{org_id}/visits/{visit_id}/photo.webp"
  tag: text("tag"),                              // "before" | "after" | "issue" | "equipment" | null
  created_at: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
}, ...)
// RLS: tech can insert for their own visits; org members can select
```

### New table: `chemical_products`

Office-configurable product library.

```typescript
export const chemicalProducts = pgTable("chemical_products", {
  id: uuid("id").defaultRandom().primaryKey(),
  org_id: uuid("org_id").notNull().references(() => orgs.id, { onDelete: "cascade" }),
  name: text("name").notNull(),                   // "31.45% Muriatic Acid"
  chemical_type: text("chemical_type").notNull(), // "muriatic_acid" | "sodium_bicarbonate" | etc.
  concentration_pct: real("concentration_pct"),   // 31.45
  unit: text("unit").notNull(),                   // "floz" | "lbs"
  is_active: boolean("is_active").notNull().default(true),
}, ...)
// RLS: owner+office manage; tech can read
```

---

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| `installSerwist()` from `serwist` | `new Serwist({...})` class API | Serwist 8.x | Must use class API — `installSerwist()` moved to `serwist/legacy` (already done in Phase 1) |
| `next-pwa` | `@serwist/next` | 2023 | next-pwa unmaintained; Serwist is the successor (already in project) |
| `react-beautiful-dnd` | `@dnd-kit` | 2023 | react-beautiful-dnd archived/unmaintained |
| Proxy photos through Next.js API | Direct browser upload via signed URL | 2024 | Avoids 1MB server action body limit |
| LSI (5-factor lookup table) | CSI (full ionic strength formula) | Industry shift ~2018 | CSI accounts for salt and ionic strength — more accurate for salt pools |

**Deprecated/outdated:**
- `react-sortable-hoc`: Unmaintained, replaced by `@dnd-kit/sortable`
- `compressorjs`: canvas.toBlob only, no web worker — prefer `browser-image-compression`
- `SpeechRecognition` in iOS PWA standalone mode: Broken in WebKit, no fix timeline

---

## Open Questions

1. **Route stop data model — how does Phase 3 know which stops to show the tech today?**
   - What we know: `prefetchTodayRoutes()` stub exists in `sync.ts`. The `customers` table has `assigned_tech_id` and `route_name`. There is no `route_stops` or `scheduled_stops` table yet.
   - What's unclear: Phase 4 owns scheduling. Does Phase 3 derive today's stops from customer `route_name` + `assigned_tech_id` (simple but fragile), or does Phase 3 create a minimal `route_stops` table that Phase 4 then extends?
   - Recommendation: Phase 3 creates a minimal `route_days` table (`tech_id`, `date`, `stop_order` as JSONB array of customer/pool IDs) that the planner can pivot on. Phase 4 replaces it with full scheduling. This avoids blocking Phase 3 on Phase 4 design. **Flag this for planner decision — the route data model affects plans 03-01 and 03-07.**

2. **Voice-to-text on iOS: Web Speech API vs native input**
   - What we know: `SpeechRecognition` does not work in iOS PWA standalone mode (confirmed). It does work in Safari browser tab on iOS.
   - What's unclear: Should we show a microphone button that opens a native Safari tab for voice, or rely on iOS's built-in dictation on the keyboard (which always works in text inputs)?
   - Recommendation: Use the `inputMode` and `enterKeyHint` attributes to trigger the keyboard on iOS, which includes a microphone key for system dictation. Skip custom Web Speech API integration — it adds complexity for broken iOS behavior. Notes field should have `<textarea inputMode="text">` — the system keyboard mic key provides voice input transparently. Mark this as resolved in favor of system keyboard dictation.

3. **Service report format: HTML template vs PDF**
   - What we know: Resend supports HTML email. PDF generation via Puppeteer in Edge Functions is possible but heavyweight and slow.
   - What's unclear: Does the customer want a PDF attachment or a well-formatted HTML email?
   - Recommendation: HTML email is sufficient for Phase 3. The HTML is rendered directly in the email body (works in all email clients). PDF generation can be added as a Phase 8+ enhancement if customers request it. **Mark as resolved: HTML email only.**

---

## Sources

### Primary (HIGH confidence)

- Existing codebase — `src/lib/offline/db.ts`, `sync.ts`, `schema/service-visits.ts`, `schema/pools.ts`, `src/lib/db/index.ts` — reviewed directly
- Supabase Storage docs — `https://supabase.com/docs/guides/storage/uploads/standard-uploads` — signed URL upload pattern
- Supabase Storage security — `https://supabase.com/docs/guides/storage/security/access-control` — RLS policy pattern with `storage.foldername()`
- Supabase JS reference — `https://supabase.com/docs/reference/javascript/storage-from-uploadtosignedurl` — `uploadToSignedUrl()` API
- Supabase JS reference — `https://supabase.com/docs/reference/javascript/functions-invoke` — `functions.invoke()` API
- Trouble Free Pool Wiki — `https://www.troublefreepool.com/wiki/index.php?title=CSI_and_LSI` — CSI formula with full ionic strength calculation
- Resend Supabase Edge Function docs — `https://resend.com/docs/send-with-supabase-edge-functions` — HTML email via Edge Function

### Secondary (MEDIUM confidence)

- dnd-kit docs — `https://docs.dndkit.com/api-documentation/sensors/touch` — TouchSensor activation constraints; verified via official docs
- dnd-kit sortable — `https://docs.dndkit.com/presets/sortable` — `useSortable`, `arrayMove` patterns; official docs
- Dexie.js docs — `https://dexie.org/docs/dexie-react-hooks/useLiveQuery()` — `useLiveQuery` hook; official docs
- Smashing Magazine (April 2025) — `https://www.smashingmagazine.com/2025/04/building-offline-friendly-image-upload-system/` — offline photo queue pattern; authoritative but single source
- LogRocket (2026) — `https://blog.logrocket.com/nextjs-16-pwa-offline-support/` — Serwist + Next.js 16 architecture; confirmed webpack requirement for Serwist build
- shadcn tab overflow — `https://glensea.com/snippets/shadcn-tab-component-mobile-responsive-overflow` — scrollable tab CSS pattern; single source, low-risk CSS

### Tertiary (LOW confidence)

- Pool chemical dosing rates (oz per 10,000 gallons) — multiple sources agree on `sodium bicarbonate 1.4 lbs/10ppm/10k gal` and `12% sodium hypochlorite 10.7 floz/1ppm/10k gal` — cross-verified with Indiana Dept. of Health pool chemical document and CPO training materials. **Validate exact dosing coefficients with a CPO or pool chemistry reference before launch.**

---

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH — fully locked by prior phases, installed packages verified
- LSI/CSI chemistry formula: HIGH — verified against Trouble Free Pool Wiki (the de facto reference) and cross-checked with multiple industry sources
- Dosing coefficients: MEDIUM — multiple sources agree on ballpark figures; exact numbers need CPO validation before production use
- Photo offline queue architecture: HIGH — Smashing Magazine article + Dexie blob storage pattern + Supabase signed URL all verified from authoritative sources
- Voice-to-text iOS PWA limitation: HIGH — confirmed by caniuse.com, Progressier.com, and WebKit tracker
- Architecture patterns: HIGH — patterns derived directly from existing codebase conventions

**Research date:** 2026-03-06
**Valid until:** 2026-06-06 (stable libraries; Supabase Storage and Serwist APIs unlikely to break changes within 3 months)
