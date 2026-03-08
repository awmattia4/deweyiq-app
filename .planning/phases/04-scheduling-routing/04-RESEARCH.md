# Phase 4: Scheduling & Routing — Research

**Researched:** 2026-03-08
**Domain:** Maps, drag-and-drop scheduling, route optimization, real-time GPS dispatch
**Confidence:** HIGH (core libraries verified), MEDIUM (optimization API selection)

---

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions

**Route builder layout**
- Split view: ordered stop list on the left, map with plotted route on the right
- Tech tabs across the top to switch between techs
- Day-of-week picker (Mon–Fri) above the stop list — one tech + one day visible at a time
- Unassigned customers shown in a sidebar panel — drag onto the stop list or click to assign
- Multi-select supported in the unassigned panel for bulk assignment
- Copy/duplicate an entire day's route to another day or tech

**Recurring schedule rules**
- Rolling 4-week generation window — new stops appear as the current week completes
- On frequency change (e.g., weekly → bi-weekly), delete all future stops and regenerate from today based on new frequency
- Frequency change is destructive — purge all future and regenerate from today
- Company holiday calendar in settings — auto-generated stops skip holidays, shown as "holiday — no service"
- Tech absences: office can choose per-situation — reassign some stops to another tech, skip others, or postpone to next service day

**Live dispatch map**
- Tech current position shown as colored pin (GPS tracked only while app is open and tech is on route — no background tracking)
- Planned route line drawn through remaining stops with estimated arrival times at each stop
- Completed stops grayed out on the map
- Click a stop marker → quick popup card (customer name, address, status, scheduled time, tech name) with link to full customer profile
- Default view shows all techs simultaneously, color-coded per tech
- Can filter to a single tech for focused view — toggle between all-techs and single-tech modes

**Route optimization**
- One-click "Optimize Route" minimizes total drive time for a single day's route
- Office can lock any stop to its position before optimizing (e.g., "Mrs. Johnson must be stop #3") — optimizer works around locked stops
- Before/after preview: shows optimized order side-by-side with current order, displays estimated drive time saved — office clicks "Apply" or "Cancel"
- Scope is single day only — does not move stops across days

### Claude's Discretion
- Map provider choice (Mapbox vs alternatives)
- Optimization API selection and algorithm
- GPS polling interval when app is active
- ETA calculation method
- Exact drag-and-drop interaction library
- Calendar view design for week overview

### Deferred Ideas (OUT OF SCOPE)
None — discussion stayed within phase scope
</user_constraints>

---

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|-----------------|
| SCHED-01 | Office can build routes and assign stops to techs | dnd-kit multi-container pattern (unassigned panel → ordered stop list), new `route_stops` relational schema replaces Phase 3 `stop_order` JSONB |
| SCHED-02 | Office can set recurring service schedules (weekly, bi-weekly, monthly, custom) | `schedule_rules` table with frequency enum + anchor date; application-level generator triggered by pg_cron/Edge Function |
| SCHED-03 | System auto-generates future service stops based on schedule rules | Rolling 4-week generator as Supabase Edge Function invoked by pg_cron on weekly cadence |
| SCHED-04 | Office can drag-and-drop reorder stops within a route | `@dnd-kit/sortable` (already installed), `verticalListSortingStrategy`, persist `sort_index` to `route_stops` table |
| SCHED-05 | System provides one-click route optimization to minimize drive time | OpenRouteService optimization API (VROOM-backed, free tier adequate for pool fleet) with locked-stop support via pre-anchored positions |
| SCHED-06 | Office can view live dispatch map showing tech positions and stop statuses | MapLibre GL JS + react-map-gl (MIT license), Supabase Realtime Broadcast for ephemeral GPS position, MapTiler for free tile serving |
</phase_requirements>

---

## Summary

Phase 4 is fundamentally a schema migration + three distinct UI surfaces: a route builder (office desktop), a live dispatch map (office), and GPS broadcasting (tech PWA). The Phase 3 `route_days` table stores stops as a JSONB array — this must be migrated to a normalized `route_stops` table so individual stops can carry metadata (lock status, time windows, scheduled time, status). The migration is the highest-risk work in the phase and must be planned as a backward-compatible path.

For the map, **MapLibre GL JS with react-map-gl** is the recommended approach. MapLibre is fully open-source (MIT), uses the same API surface as Mapbox GL JS, and tiles can be served free via MapTiler's free tier (sufficient for an internal fleet management tool). **Mapbox GL JS** is the alternative — stronger managed tile infrastructure and an Optimization API — but requires a paid API key for production tile serving. For optimization, **OpenRouteService's optimization endpoint** (backed by VROOM) is the recommended starting point: free, supports time windows and multi-vehicle VRP, and handles 50-stop routes easily. Mapbox's Optimization v2 API is in public beta and requires a sign-up; save it as an upgrade path if ORS limits are hit.

GPS location sharing uses **Supabase Realtime Broadcast channels** (ephemeral, low-latency, no DB writes per ping). The tech app sends position via `channel.send()` on a `watchPosition` callback; the office dispatch map receives it via the same channel subscription and updates marker state. This matches the existing project pattern of using Supabase for real-time features and avoids writing GPS pings to Postgres.

**Primary recommendation:** MapLibre GL JS + react-map-gl + MapTiler tiles + OpenRouteService optimization + Supabase Realtime Broadcast for GPS. All free/open-source for the scale of a pool service company.

---

## Standard Stack

### Core

| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| `maplibre-gl` | ^4.x | WebGL map rendering | MIT license, Mapbox GL JS fork, identical API, no API key for the renderer itself |
| `react-map-gl` | ^8.x | React wrapper for MapLibre/Mapbox GL | Official vis.gl library; provides Map, Marker, Popup, Layer, Source components as React primitives |
| `@dnd-kit/core` | ^6.3.1 (installed) | Drag-and-drop core | Already in project; used in Phase 3 stop-list |
| `@dnd-kit/sortable` | ^10.0.0 (installed) | Sortable lists | Already in project; used in Phase 3 stop-list |
| `@dnd-kit/utilities` | ^3.2.2 (installed) | CSS transform utilities | Already in project |
| Supabase Realtime | (via `@supabase/supabase-js`) | Ephemeral GPS broadcast | Already in project; `channel.send()` broadcast requires no schema change |

### Supporting

| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| MapTiler tiles | free tier | Vector tile serving for MapLibre | Required when using MapLibre (needs a tile source); free tier provides 100k monthly map loads |
| OpenRouteService API | hosted, free tier | VRP/TSP route optimization | One-click "Optimize Route" button; handles up to 50 routes, 3 vehicles per request on free tier |
| Supabase Cron (pg_cron) | built into Supabase | Rolling schedule generation | Trigger Edge Function weekly to generate the next week of stops |
| Supabase Edge Functions | Deno runtime | Schedule generation logic | Runs the rolling-4-week generation algorithm outside the request cycle |

### Alternatives Considered

| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| MapLibre GL JS | Mapbox GL JS | Mapbox has better managed tile infrastructure and a unified Optimization API, but requires paid API key at production volumes; MapLibre avoids this for an internal tool |
| OpenRouteService | Mapbox Optimization API v2 | Mapbox v2 is in public beta (requires sign-up); ORS is production-stable and free; upgrade to Mapbox if ORS 50-vehicle limit is hit |
| OpenRouteService | Self-hosted VROOM | ORS is backed by VROOM; self-hosting gives unlimited requests but adds infrastructure complexity |
| Supabase pg_cron | App-level cron (Vercel Cron) | pg_cron runs inside the database avoiding cold starts; Vercel Cron is simpler to configure for Next.js but adds a network hop |
| Geolocation watchPosition | Background GPS | Background tracking was explicitly deferred; watchPosition fires only while app is open and page is active — this is the correct match |

### Installation

```bash
# Map rendering
npm install maplibre-gl react-map-gl

# dnd-kit is already installed — no action needed
# Supabase is already installed — no action needed
```

---

## Architecture Patterns

### Recommended Project Structure

```
src/
├── app/(app)/schedule/          # New: office schedule builder page
│   ├── page.tsx                 # Server component; SSR initial data
│   └── [tech]/
│       └── [day]/
│           └── page.tsx         # Optional: deep-link to tech+day view
├── app/(app)/dispatch/          # New: live dispatch map (office only)
│   └── page.tsx
├── components/schedule/         # New: scheduling-specific components
│   ├── route-builder.tsx        # Split-view route builder (client)
│   ├── unassigned-panel.tsx     # Sidebar with unassigned customers
│   ├── route-stop-list.tsx      # Ordered stop list with drag handles
│   ├── stop-lock-toggle.tsx     # Lock/unlock stop position button
│   ├── tech-day-selector.tsx    # Tech tabs + day-of-week picker
│   └── optimize-preview.tsx     # Before/after optimization preview modal
├── components/dispatch/         # New: dispatch map components
│   ├── dispatch-map.tsx         # MapLibre map with real-time markers
│   ├── tech-position-marker.tsx # Colored pin per tech
│   ├── stop-marker.tsx          # Stop pin (scheduled/completed/in-progress)
│   └── stop-popup.tsx           # Click popup card
├── components/map/              # Shared: map utilities
│   └── map-client.tsx           # dynamic(() => import, ssr: false) wrapper
├── lib/db/schema/
│   ├── route-stops.ts           # New: relational stop rows (replaces JSONB)
│   ├── schedule-rules.ts        # New: recurring schedule rule per customer/pool
│   └── holidays.ts              # New: company holiday calendar
├── actions/
│   ├── schedule.ts              # CRUD for schedule rules, route stops
│   └── dispatch.ts              # Read route status for dispatch map
└── supabase/functions/
    └── generate-schedule/       # Edge Function: rolling 4-week generation
        └── index.ts
```

### Pattern 1: MapLibre in Next.js (SSR-safe dynamic import)

**What:** MapLibre GL JS accesses `window` on import, which crashes Next.js SSR. Wrap in `next/dynamic` with `ssr: false`.

**When to use:** Any component that imports `maplibre-gl` or `react-map-gl`.

```typescript
// src/components/map/map-client.tsx
// Source: https://dev.to/dqunbp/using-mapbox-gl-in-react-with-next-js-2glg (verified pattern)
"use client"

import { useEffect, useRef } from "react"
import maplibregl from "maplibre-gl"
import "maplibre-gl/dist/maplibre-gl.css"

export function MapClient({ stops, techPositions }: MapClientProps) {
  const mapContainer = useRef<HTMLDivElement>(null)
  const map = useRef<maplibregl.Map | null>(null)

  useEffect(() => {
    if (map.current || !mapContainer.current) return
    map.current = new maplibregl.Map({
      container: mapContainer.current,
      // MapTiler tile style — replace with your MapTiler API key
      style: `https://api.maptiler.com/maps/streets-v2/style.json?key=${process.env.NEXT_PUBLIC_MAPTILER_KEY}`,
      center: [-87.6298, 41.8781], // org's service area center — make configurable
      zoom: 11,
    })
    return () => { map.current?.remove(); map.current = null }
  }, [])

  // ... marker management in separate useEffects
  return <div ref={mapContainer} style={{ width: "100%", height: "100%" }} />
}

// src/app/(app)/dispatch/page.tsx
import dynamic from "next/dynamic"

const DispatchMap = dynamic(
  () => import("@/components/dispatch/dispatch-map").then(m => m.DispatchMap),
  { ssr: false, loading: () => <div className="animate-pulse bg-muted rounded-lg h-full" /> }
)
```

### Pattern 2: dnd-kit Multi-Container (Unassigned → Route List)

**What:** Two `SortableContext` providers inside one `DndContext`. The unassigned panel and the ordered stop list are separate containers. Items can be dragged from unassigned into the route list.

**When to use:** Route builder: drag customer from unassigned panel onto the day's stop list at a specific position.

```typescript
// Source: https://dndkit.com/presets/sortable (official docs)
"use client"

import {
  DndContext, DragOverlay, closestCenter, TouchSensor, MouseSensor,
  useSensor, useSensors, type DragEndEvent, type DragOverEvent,
} from "@dnd-kit/core"
import {
  SortableContext, verticalListSortingStrategy, arrayMove, useSortable,
} from "@dnd-kit/sortable"
import { useState } from "react"

// Single DndContext wraps BOTH containers
export function RouteBuilder() {
  const [unassigned, setUnassigned] = useState<Customer[]>(...)
  const [routeStops, setRouteStops] = useState<RouteStop[]>(...)
  const [activeId, setActiveId] = useState<string | null>(null)

  function handleDragOver(event: DragOverEvent) {
    const { active, over } = event
    if (!over) return
    const activeContainer = getContainer(active.id)
    const overContainer = getContainer(over.id)
    if (activeContainer !== overContainer) {
      // Move item from unassigned → route stops mid-drag for visual feedback
      moveItemBetweenContainers(active.id, activeContainer, overContainer, over.id)
    }
  }

  function handleDragEnd(event: DragEndEvent) {
    // Finalize position, persist to server
    persistRouteOrder()
  }

  return (
    <DndContext
      sensors={sensors}
      collisionDetection={closestCenter}
      onDragStart={(e) => setActiveId(String(e.active.id))}
      onDragOver={handleDragOver}
      onDragEnd={handleDragEnd}
    >
      {/* Unassigned panel */}
      <SortableContext items={unassigned.map(c => c.id)} strategy={verticalListSortingStrategy}>
        <UnassignedPanel customers={unassigned} />
      </SortableContext>

      {/* Route stop list */}
      <SortableContext items={routeStops.map(s => s.id)} strategy={verticalListSortingStrategy}>
        <RouteStopList stops={routeStops} />
      </SortableContext>

      {/* DragOverlay prevents ID collisions; renders ghost of dragged item */}
      <DragOverlay>
        {activeId ? <DragGhost id={activeId} /> : null}
      </DragOverlay>
    </DndContext>
  )
}
```

### Pattern 3: Supabase Realtime Broadcast for GPS

**What:** Tech app sends position via `channel.send()` on `watchPosition` callback. Office dispatch map receives via channel subscription. Ephemeral — no GPS pings written to Postgres.

**When to use:** Tech is on route (route page is open). The channel is org-scoped.

```typescript
// Source: https://supabase.com/docs/guides/realtime/broadcast (official docs)

// TECH APP — send position
const channel = supabase.channel(`dispatch:${orgId}`)

channel.subscribe((status) => {
  if (status !== "SUBSCRIBED") return

  const watchId = navigator.geolocation.watchPosition(
    (position) => {
      channel.send({
        type: "broadcast",
        event: "tech_location",
        payload: {
          tech_id: userId,
          lat: position.coords.latitude,
          lng: position.coords.longitude,
          accuracy: position.coords.accuracy,
          timestamp: Date.now(),
        },
      })
    },
    (error) => console.error("GPS error:", error),
    {
      enableHighAccuracy: true,
      maximumAge: 10_000,   // accept cached position up to 10s old
      timeout: 15_000,
    }
  )

  // Cleanup: stop watching when component unmounts
  return () => {
    navigator.geolocation.clearWatch(watchId)
    channel.unsubscribe()
  }
})

// OFFICE DISPATCH MAP — receive positions
const dispatchChannel = supabase.channel(`dispatch:${orgId}`)

dispatchChannel
  .on("broadcast", { event: "tech_location" }, ({ payload }) => {
    setTechPositions(prev => ({
      ...prev,
      [payload.tech_id]: { lat: payload.lat, lng: payload.lng, updatedAt: payload.timestamp }
    }))
  })
  .subscribe()
```

### Pattern 4: Schema Migration Strategy (Phase 3 → Phase 4)

**What:** Phase 3 stores stops as a JSONB array in `route_days.stop_order`. Phase 4 needs a relational `route_stops` table so stops can carry lock status, scheduled time windows, status, and schedule rule FK.

**When to use:** This is the first migration task in Phase 4.

```typescript
// src/lib/db/schema/route-stops.ts (NEW TABLE)
import { boolean, index, integer, pgTable, text, time, timestamp, uuid } from "drizzle-orm/pg-core"
import { orgs } from "./orgs"
import { customers } from "./customers"
import { pools } from "./pools"
import { profiles } from "./profiles"
import { scheduleRules } from "./schedule-rules"

export const routeStops = pgTable(
  "route_stops",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    org_id: uuid("org_id").notNull().references(() => orgs.id, { onDelete: "cascade" }),
    tech_id: uuid("tech_id").references(() => profiles.id, { onDelete: "set null" }),
    customer_id: uuid("customer_id").notNull().references(() => customers.id, { onDelete: "cascade" }),
    pool_id: uuid("pool_id").references(() => pools.id, { onDelete: "set null" }),
    schedule_rule_id: uuid("schedule_rule_id").references(() => scheduleRules.id, { onDelete: "set null" }),

    // The calendar date this stop occurs on
    scheduled_date: text("scheduled_date").notNull(), // 'YYYY-MM-DD' — matches Phase 3 pattern

    // Position in the day's route (1-based; gaps are fine)
    sort_index: integer("sort_index").notNull(),

    // Locked stops are excluded from optimization
    position_locked: boolean("position_locked").notNull().default(false),

    // Optional time window constraint (e.g., morning-only gate)
    window_start: time("window_start"),
    window_end: time("window_end"),

    // 'scheduled' | 'in_progress' | 'complete' | 'skipped' | 'holiday'
    status: text("status").notNull().default("scheduled"),

    created_at: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    updated_at: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    index("route_stops_org_date_idx").on(table.org_id, table.scheduled_date),
    index("route_stops_tech_date_idx").on(table.tech_id, table.scheduled_date),
    index("route_stops_schedule_rule_idx").on(table.schedule_rule_id),
  ]
).enableRLS()

// src/lib/db/schema/schedule-rules.ts (NEW TABLE)
export const scheduleRules = pgTable(
  "schedule_rules",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    org_id: uuid("org_id").notNull().references(() => orgs.id, { onDelete: "cascade" }),
    customer_id: uuid("customer_id").notNull().references(() => customers.id, { onDelete: "cascade" }),
    pool_id: uuid("pool_id").references(() => pools.id, { onDelete: "set null" }),
    tech_id: uuid("tech_id").references(() => profiles.id, { onDelete: "set null" }),

    // 'weekly' | 'biweekly' | 'monthly' | 'custom'
    frequency: text("frequency").notNull(),
    // custom_interval_days is set when frequency = 'custom'
    custom_interval_days: integer("custom_interval_days"),
    // Anchor date for frequency calculation — first service date
    anchor_date: text("anchor_date").notNull(), // 'YYYY-MM-DD'

    // Preferred day of week (0=Sun, 1=Mon, ... 6=Sat) — used for weekly/biweekly
    preferred_day_of_week: integer("preferred_day_of_week"),

    // Whether this rule is currently active
    active: boolean("active").notNull().default(true),

    created_at: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    updated_at: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    index("schedule_rules_org_idx").on(table.org_id),
    index("schedule_rules_customer_idx").on(table.customer_id),
    index("schedule_rules_tech_idx").on(table.tech_id),
  ]
).enableRLS()

// src/lib/db/schema/holidays.ts (NEW TABLE)
export const holidays = pgTable(
  "holidays",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    org_id: uuid("org_id").notNull().references(() => orgs.id, { onDelete: "cascade" }),
    date: text("date").notNull(), // 'YYYY-MM-DD'
    name: text("name").notNull(), // "Thanksgiving", etc.
    created_at: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    index("holidays_org_date_idx").on(table.org_id, table.date),
  ]
).enableRLS()
```

### Pattern 5: OpenRouteService Optimization API

**What:** POST to ORS optimization endpoint with vehicles (techs), jobs (stops), and constraint that locked stops have fixed sequence numbers. Receive back optimized job order; compute time saved from the step durations.

**When to use:** Office clicks "Optimize Route". Build request from route_stops for a given tech+date.

```typescript
// Source: https://openrouteservice.org/services/ + VROOM docs
// ORS optimization endpoint: POST https://api.openrouteservice.org/optimization

interface ORSVehicle {
  id: number
  start: [number, number]  // [lng, lat] of tech's starting location
  end?: [number, number]   // optional return-to-depot
  profile: "driving-car"
}

interface ORSJob {
  id: number
  location: [number, number]  // [lng, lat]
  // Optional time window: array of [start_seconds, end_seconds] from midnight
  time_windows?: [[number, number]]
}

async function optimizeRoute(stops: RouteStop[], techStartLocation: [number, number]) {
  const unlockedStops = stops.filter(s => !s.position_locked)
  const lockedStops = stops.filter(s => s.position_locked)

  // Strategy for locked stops:
  // 1. Remove locked stops from ORS request
  // 2. ORS optimizes only unlocked stops
  // 3. Re-insert locked stops at their original positions post-optimization
  //    (this is a simplification — true "sequence constraints" require premium VROOM)

  const jobs: ORSJob[] = unlockedStops.map((stop, idx) => ({
    id: idx,
    location: [stop.lng, stop.lat],  // requires geocoded coordinates on route_stops
    ...(stop.window_start && stop.window_end ? {
      time_windows: [[toSeconds(stop.window_start), toSeconds(stop.window_end)]]
    } : {})
  }))

  const response = await fetch("https://api.openrouteservice.org/optimization", {
    method: "POST",
    headers: {
      Authorization: process.env.ORS_API_KEY!,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      jobs,
      vehicles: [{
        id: 0,
        start: techStartLocation,
        profile: "driving-car",
      }],
    }),
  })

  const result = await response.json()
  // result.routes[0].steps contains the optimized job sequence
  // result.summary.duration gives total drive time in seconds
  return result
}
```

### Anti-Patterns to Avoid

- **Calling `maplibre-gl` in a server component:** MapLibre accesses `window` at import time. Always `dynamic(() => import(...), { ssr: false })`.
- **Writing GPS pings to Postgres:** Each `watchPosition` callback fires every few seconds. Writing to the DB creates write load and latency. Use Supabase Realtime Broadcast (ephemeral) instead.
- **Storing coordinates without geocoding first:** Route optimization APIs need lat/lng, not address strings. Geocode customer addresses and store coordinates on `customers` or `route_stops`. Do this lazily on first assignment, not on every optimization call.
- **Regenerating all future stops on every rule change:** Only delete stops where `scheduled_date > today` and regenerate from today. Do not delete historical (past) stops — they are service history.
- **Calling the optimization API from the client:** The ORS API key would be exposed. Call from a Next.js Server Action or API route.
- **Mutating `items` array passed to `SortableContext` during drag:** Update the items array only in `onDragEnd`, not `onDragOver` for the same container. Cross-container moves update on `onDragOver` to give visual feedback.

---

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| TSP/VRP route optimization | Custom nearest-neighbor greedy algorithm | OpenRouteService optimization (VROOM) | VROOM uses metaheuristics; naive nearest-neighbor gives 20-30% worse results than optimal; time windows and multi-vehicle make hand-rolled solutions combinatorially complex |
| Map tile rendering | Custom canvas/SVG map | MapLibre GL JS | Vector tile rendering, WebGL performance, collision detection for labels, mobile touch handling — thousands of engineering hours |
| Drag-and-drop sortable list | `mousedown` + absolute positioning | `@dnd-kit/sortable` (already installed) | Accessibility (keyboard nav, screen readers), touch sensor conflict with scroll, auto-scroll for long lists, animation |
| Real-time WebSocket for GPS | Custom WebSocket server | Supabase Realtime Broadcast | Already in infrastructure; handles reconnection, auth, multiplexing |
| Geocoding | Regex address parsing | Mapbox Geocoding API v6 or ORS geocoding | Address parsing has infinite edge cases; international formats; confidence scoring matters |
| Rolling schedule generation | Cron job in Next.js process | Supabase Edge Function + pg_cron | Next.js processes are stateless/serverless; pg_cron runs reliably inside the DB; Edge Functions have isolated runtime |

**Key insight:** Route optimization is a deceptively hard combinatorial problem. Even for 20 stops, a brute-force approach is O(n!) = 2.4 quintillion operations. VROOM/ORS solves it in milliseconds with metaheuristics.

---

## Common Pitfalls

### Pitfall 1: MapLibre Map Leaks on React Re-renders

**What goes wrong:** If the map `useEffect` does not clean up `map.current`, navigating away and back creates a new MapLibre instance on top of the old one. Memory leak and doubled event listeners.

**Why it happens:** MapLibre attaches to a DOM element. React does not know about the imperative map instance.

**How to avoid:** Always return a cleanup function from the `useEffect` that calls `map.current.remove()` and sets `map.current = null`.

**Warning signs:** Console warnings about "Map already initialized", degraded performance after navigation.

### Pitfall 2: GPS Permission Denial Silently Fails

**What goes wrong:** `navigator.geolocation.watchPosition` silently does nothing if the user denies location permission. The tech's pin disappears from dispatch without explanation.

**Why it happens:** The error callback is often omitted.

**How to avoid:** Always provide an `error` callback. On `PERMISSION_DENIED`, show a toast on the tech's device ("Enable location to share your position with dispatch") and stop attempting.

**Warning signs:** Tech position markers not appearing on dispatch map; no error shown to user.

### Pitfall 3: Phase 3 `route_days` JSONB Break During Migration

**What goes wrong:** Phase 3 queries (`getTodayStops`, `/api/routes/today`) still read from `route_days.stop_order`. If Phase 4 creates `route_stops` but leaves `route_days` in place, there are two sources of truth. The tech app (Phase 3 code) reads stale data.

**Why it happens:** Incremental migration without a clear cutover plan.

**How to avoid:** Migrate in two sub-phases: (a) write to BOTH `route_days.stop_order` AND `route_stops` for a release; (b) cut the tech app to read from `route_stops`, then (c) drop `stop_order` column. This matches the Phase 2→3 migration pattern already used in this project.

**Warning signs:** Tech sees different stops than office builder shows.

### Pitfall 4: ORS Free Tier Hard Limits

**What goes wrong:** OpenRouteService free tier limits optimization to 50 routes and 3 vehicles per request. A large fleet with many techs may hit the vehicle limit.

**Why it happens:** ORS optimizes per-request — one call per tech per day. For a pool company with >3 active techs, a single "optimize all" call fails.

**How to avoid:** Call ORS once per tech (one vehicle per request). The 3-vehicle limit on the free tier applies per-request, not per-day. Per-tech optimization stays well within limits for a typical pool fleet.

**Warning signs:** ORS returns 400 error with "Maximum number of vehicles exceeded".

### Pitfall 5: Geocoding addresses Not Stored Persistently

**What goes wrong:** Every optimization call geocodes customer addresses on-the-fly via the Mapbox Geocoding API. This creates latency and API cost per optimization run.

**Why it happens:** Coordinates are not stored with customer records.

**How to avoid:** Add `lat` and `lng` (or a PostGIS `point`) columns to the `customers` table. Geocode lazily on customer create/update address, or in bulk during the Phase 4 migration. Store coordinates permanently — they rarely change.

**Warning signs:** Optimization call takes >5 seconds; Mapbox geocoding API costs appear in billing.

### Pitfall 6: Supabase Realtime Channel Not Cleaned Up

**What goes wrong:** The tech app subscribes to the `dispatch:{orgId}` broadcast channel on mount. If the component unmounts (tech navigates to a stop detail page), the channel remains subscribed and `watchPosition` keeps firing, draining battery.

**Why it happens:** `useEffect` cleanup not implemented.

**How to avoid:** Return a cleanup from `useEffect` that calls `channel.unsubscribe()` and `navigator.geolocation.clearWatch(watchId)`.

**Warning signs:** Battery drain complaints from techs; multiple position events arriving simultaneously.

### Pitfall 7: Drizzle RLS on New Tables (Known Project Pitfall)

**What goes wrong:** After `drizzle-kit push` or `generate + migrate`, the new `route_stops`, `schedule_rules`, and `holidays` tables may have RLS policies with empty `USING` / `WITH CHECK` conditions.

**Why it happens:** Known `drizzle-kit` bug documented in project MEMORY.md.

**How to avoid:** After any schema push, verify RLS policies in Supabase dashboard or via SQL: `SELECT * FROM pg_policies WHERE tablename IN ('route_stops', 'schedule_rules', 'holidays')`. Check that `qual` and `with_check` columns are not NULL.

**Warning signs:** All queries return empty results; no error thrown.

---

## Code Examples

### MapLibre Route Line (GeoJSON LineString)

```typescript
// Source: MapLibre GL JS docs — addLayer/addSource pattern
// Draw the planned route as a line through remaining stops (in sort_index order)

function addRouteLine(map: maplibregl.Map, stops: RouteStop[]) {
  const coordinates: [number, number][] = stops
    .filter(s => s.status !== "complete" && s.lat && s.lng)
    .sort((a, b) => a.sort_index - b.sort_index)
    .map(s => [s.lng, s.lat])

  const geojson: GeoJSON.Feature<GeoJSON.LineString> = {
    type: "Feature",
    properties: {},
    geometry: { type: "LineString", coordinates },
  }

  if (map.getSource("route-line")) {
    (map.getSource("route-line") as maplibregl.GeoJSONSource).setData(geojson)
  } else {
    map.addSource("route-line", { type: "geojson", data: geojson })
    map.addLayer({
      id: "route-line",
      type: "line",
      source: "route-line",
      paint: {
        "line-color": "#3b82f6",   // Tailwind blue-500
        "line-width": 3,
        "line-dasharray": [2, 1],  // dashed for planned route
      },
    })
  }
}
```

### Rolling 4-Week Schedule Generator (Edge Function pseudo-code)

```typescript
// supabase/functions/generate-schedule/index.ts
// Source: derived from Supabase Cron docs + project patterns
// Invoked by pg_cron weekly: SELECT cron.schedule('generate-schedule', '0 6 * * 1', ...)

import { createClient } from "@supabase/supabase-js"

Deno.serve(async () => {
  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")! // service role — bypasses RLS
  )

  // Generation window: today through today + 28 days
  const today = new Date()
  const windowEnd = new Date(today)
  windowEnd.setDate(today.getDate() + 28)

  // Fetch all active schedule rules
  const { data: rules } = await supabase
    .from("schedule_rules")
    .select("*")
    .eq("active", true)

  // Fetch org holidays within window
  const { data: holidays } = await supabase
    .from("holidays")
    .select("date, org_id")
    .gte("date", today.toISOString().split("T")[0])
    .lte("date", windowEnd.toISOString().split("T")[0])

  const holidaySet = new Set(holidays?.map(h => `${h.org_id}:${h.date}`) ?? [])

  for (const rule of rules ?? []) {
    const dates = generateDatesForRule(rule, today, windowEnd)
    for (const date of dates) {
      const dateStr = date.toISOString().split("T")[0]
      // Skip holidays
      if (holidaySet.has(`${rule.org_id}:${dateStr}`)) continue
      // Upsert — idempotent; safe to re-run
      await supabase.from("route_stops").upsert({
        org_id: rule.org_id,
        customer_id: rule.customer_id,
        pool_id: rule.pool_id,
        tech_id: rule.tech_id,
        schedule_rule_id: rule.id,
        scheduled_date: dateStr,
        sort_index: 999,  // appended to end; office reorders manually
        status: "scheduled",
      }, { onConflict: "org_id,customer_id,pool_id,scheduled_date", ignoreDuplicates: true })
    }
  }

  return new Response("OK")
})

function generateDatesForRule(rule: ScheduleRule, from: Date, to: Date): Date[] {
  const dates: Date[] = []
  const anchor = new Date(rule.anchor_date)
  const intervalDays = rule.frequency === "weekly" ? 7
    : rule.frequency === "biweekly" ? 14
    : rule.frequency === "monthly" ? 28  // approximate; use day-of-month for true monthly
    : rule.custom_interval_days ?? 7

  // Find first occurrence on or after `from`
  let current = new Date(anchor)
  while (current < from) {
    current.setDate(current.getDate() + intervalDays)
  }
  while (current <= to) {
    dates.push(new Date(current))
    current.setDate(current.getDate() + intervalDays)
  }
  return dates
}
```

### ETA Calculation for Remaining Stops

```typescript
// Simple approach: use ORS or Mapbox Directions Matrix API to get
// travel times between consecutive stops, then sum from tech's current position.
// Source: derived from Mapbox Matrix API docs

async function calculateETAs(
  techPosition: { lat: number; lng: number },
  remainingStops: RouteStop[]
): Promise<RouteStop[]> {
  if (remainingStops.length === 0) return []

  const coordinates = [
    [techPosition.lng, techPosition.lat],
    ...remainingStops.map(s => [s.lng, s.lat]),
  ].join(";")

  // Mapbox Directions API — up to 25 waypoints on driving-traffic profile
  const response = await fetch(
    `https://api.mapbox.com/directions/v5/mapbox/driving-traffic/${coordinates}?` +
    `access_token=${process.env.MAPBOX_TOKEN}&overview=false&annotations=duration`
  )
  const data = await response.json()
  // data.routes[0].legs[i].duration = travel time to leg i+1 in seconds
  let accumulatedSeconds = 0
  return remainingStops.map((stop, idx) => {
    accumulatedSeconds += data.routes[0]?.legs[idx]?.duration ?? 0
    const eta = new Date(Date.now() + accumulatedSeconds * 1000)
    return { ...stop, estimatedArrival: eta }
  })
}
```

---

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| Mapbox GL JS only (proprietary after 2020) | MapLibre GL JS fork (MIT) | Dec 2020 | No API key required for rendering; tiles still need a provider |
| react-map-gl v5-6 (Mapbox-only) | react-map-gl v8 (MapLibre + Mapbox) | 2022-2023 | Single React wrapper works with both renderers |
| JSONB stop_order array | Relational `route_stops` rows | Phase 4 (this phase) | Individual stops can carry metadata (lock status, status, time windows) |
| Manual schedule creation | Recurring rules + auto-generation | Phase 4 (this phase) | Office sets rules once; system generates forward |
| Polling for tech position | Supabase Realtime Broadcast | Phase 4 (this phase) | No DB writes per GPS ping; sub-second latency |

**Deprecated/outdated:**
- `route_days.stop_order` JSONB: replaced by `route_stops` table in Phase 4; Phase 3 code must be updated to query `route_stops` after cutover
- Phase 3 `reorderStops()` action (updates JSONB): replaced by `sort_index` update on individual `route_stops` rows

---

## Open Questions

1. **Geocoding strategy for existing customers**
   - What we know: Customers already have `address` text field; optimization needs lat/lng
   - What's unclear: Should we geocode in a migration script, or lazily on first route assignment? How many customers exist?
   - Recommendation: Add `lat`/`lng` nullable columns to `customers` table. Write a one-time migration function that geocodes all existing addresses via Mapbox Geocoding API. Warn office if a customer has no geocoded coordinates when assigning to a route.

2. **Locked stop handling in ORS free tier**
   - What we know: ORS free tier does not support "fixed sequence" constraints natively; those require VROOM with sequence constraints or Mapbox Optimization v2
   - What's unclear: How many customers typically need time-locked positions? Is the simplified workaround (remove locked stops, optimize unlocked, re-insert at original positions) acceptable?
   - Recommendation: Implement the simplified workaround first. Document it clearly in the UI ("Locked stops stay in position; optimizer works around them"). If a customer later needs true position constraints, evaluate Mapbox Optimization v2 beta.

3. **Phase 3 route_days backward compatibility during migration**
   - What we know: Phase 3 tech app still reads from `route_days.stop_order`; the tech app PWA may be cached
   - What's unclear: How long does service worker caching keep old code active?
   - Recommendation: Use a dual-write migration approach — write to both `route_days.stop_order` AND `route_stops` for the initial Phase 4 release. Update tech app API to read from `route_stops`. Only drop JSONB column in a follow-on release once confirmed.

4. **MapTiler API key management**
   - What we know: MapTiler free tier provides 100k monthly map loads (sufficient for internal fleet tool)
   - What's unclear: Whether the company might grow beyond this in 12-18 months
   - Recommendation: Use `NEXT_PUBLIC_MAPTILER_KEY` env var. MapTiler free tier is appropriate for Phase 4; document upgrade path to paid tier if map load volume grows.

---

## Sources

### Primary (HIGH confidence)
- `@dnd-kit/sortable` official docs — https://dndkit.com/presets/sortable — SortableContext API, useSortable hook, DragOverlay pattern, multi-container pattern
- Supabase Realtime Broadcast docs — https://supabase.com/docs/guides/realtime/broadcast — channel creation, send method, self-send config, REST alternative
- Supabase Cron docs — https://supabase.com/modules/cron — pg_cron extension, Edge Function invocation, natural language scheduling
- Existing project codebase — `src/components/field/stop-list.tsx` — verified dnd-kit pattern used in Phase 3 (DndContext, sensors, SortableContext, arrayMove)
- Existing project codebase — `src/lib/db/schema/route-days.ts` — confirmed Phase 3 JSONB schema that Phase 4 replaces
- VROOM project GitHub — https://github.com/VROOM-Project/vroom — VRP capabilities, TSP support, API interface
- Mapbox Optimization API v2 docs — https://docs.mapbox.com/api/navigation/optimization/ — input format, vehicle/job constraints, rate limits

### Secondary (MEDIUM confidence)
- MapLibre GL JS + react-map-gl integration — https://visgl.github.io/react-map-gl/ + multiple verified Next.js integration guides — SSR-safe dynamic import pattern
- MapTiler + MapLibre integration — https://docs.maptiler.com/react/maplibre-gl-js/how-to-use-maplibre-gl-js/ — setup pattern, free tier
- OpenRouteService optimization — https://openrouteservice.org/services/ — VRP features, time windows, VROOM backing, free tier (50 routes, 3 vehicles per request)
- Supabase Realtime + GPS use case — https://supabase.com/blog/postgres-realtime-location-sharing-with-maplibre — confirmed Broadcast + MapLibre pattern for live location

### Tertiary (LOW confidence — needs validation before implementation)
- ORS free tier exact daily rate limits (docs showed per-request limits of 50 routes/3 vehicles; daily quota not confirmed)
- Mapbox Optimization v2 pricing (in beta, no public pricing found)

---

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH — dnd-kit already in project and verified; react-map-gl/MapLibre well-documented; Supabase Realtime Broadcast confirmed via official docs
- Architecture: HIGH — schema patterns derived from existing project conventions + established PostgreSQL recurring schedule patterns; migration strategy matches Phase 2→3 precedent
- Optimization API: MEDIUM — ORS/VROOM capabilities verified but free tier daily limits unconfirmed; locked stop workaround is a simplification
- GPS/Realtime: HIGH — Supabase Broadcast API confirmed via official docs; watchPosition pattern well-established

**Research date:** 2026-03-08
**Valid until:** 2026-04-08 (MapLibre/react-map-gl versioning stable; ORS pricing may change)
