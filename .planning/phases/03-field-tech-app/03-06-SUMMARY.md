---
phase: 03-field-tech-app
plan: "06"
subsystem: ui
tags: [photo-capture, browser-image-compression, dexie, supabase-storage, offline-sync, pwa]

# Dependency graph
requires:
  - phase: 03-04
    provides: StopWorkflow tab shell, useVisitDraft hook, VisitDraft Dexie schema
  - phase: 03-01
    provides: photoQueue Dexie store, PhotoQueueItem interface, offlineDb instance
provides:
  - PhotoCapture component with camera input, compression, offline blob queue, and photo grid
  - NotesField component with 300ms debounced Dexie persistence and keyboard dictation hint
  - createPhotoUploadUrl server action for org-scoped Supabase Storage signed URLs
  - processAllPendingPhotos global sync processor wired into initSyncListener
  - orgId field on PhotoQueueItem (Dexie v3) enabling org-scoped storage path construction
affects:
  - 03-07 (visit completion sync — photos in photoQueue need storagePath written to service_visits.photo_urls)
  - 04-route-management (photo URLs may be surfaced in visit history)

# Tech tracking
tech-stack:
  added: []  # browser-image-compression was already in package.json
  patterns:
    - Blob-in-Dexie pattern: write blob IMMEDIATELY on capture before any network attempt (never lost)
    - Client-side compression before Dexie write (300KB WebP via browser-image-compression)
    - Signed URL upload: server action returns signedUrl, client PUTs blob directly to Supabase Storage
    - orgId in photoQueue: global sync processor can construct storage path without live session
    - Object URL lifecycle management: create on photo appearance, revoke on removal and unmount
    - defaultValue + useRef debounce pattern for textarea (avoids controlled-input re-render on every keystroke)

key-files:
  created:
    - src/actions/storage.ts
    - src/components/field/photo-capture.tsx
    - src/components/field/notes-field.tsx
  modified:
    - src/actions/visits.ts (added orgId to StopContext)
    - src/lib/offline/db.ts (added orgId to PhotoQueueItem, Dexie v3)
    - src/lib/offline/sync.ts (added processAllPendingPhotos, wired into online events)
    - src/components/field/stop-workflow.tsx (replaced placeholder tabs with real components)

key-decisions:
  - "PhotoQueueItem.orgId added (Dexie v3): stores orgId with each photo so global sync processor can construct storage path without live session context — avoids passing orgId down through every layer"
  - "Blob-first architecture: compressed blob written to Dexie before any upload attempt — photo never lost even if app closes mid-upload"
  - "No custom Web Speech API: NotesField relies on system keyboard dictation (iOS dictation key); Web Speech API broken in PWA standalone mode per Research pitfall"
  - "processAllPendingPhotos in sync.ts, not just PhotoCapture: global connectivity handler retries all pending photos on app-open, not just current stop"

patterns-established:
  - "Dexie-first for blobs: write to Dexie, then attempt upload — never lose a photo"
  - "Server action auth-self-contained: createPhotoUploadUrl calls getClaims() internally, no token threading"
  - "Object URL cleanup: create URLs for blobs on render, revoke on component unmount to prevent memory leaks"

requirements-completed:
  - FIELD-07
  - FIELD-08
  - FIELD-10

# Metrics
duration: 15min
completed: 2026-03-06
---

# Phase 3 Plan 06: Photo Capture and Notes Summary

**Camera capture with client-side WebP compression to 300KB, Dexie blob queue (never lost offline), Supabase Storage via signed URLs, optional before/after/issue/equipment tagging, and notes textarea with system keyboard dictation hint**

## Performance

- **Duration:** ~15 min
- **Started:** 2026-03-06T15:43:20Z
- **Completed:** 2026-03-06T16:00:00Z
- **Tasks:** 2
- **Files modified:** 7

## Accomplishments

- Camera button triggers device camera via `<input capture="environment">` on mobile; compressed blob written to Dexie before any upload (blob never lost)
- Photos compressed to ~300KB WebP using browser-image-compression with Web Worker (non-blocking) then uploaded to Supabase Storage via signed URL when online
- Optional tag selector (before/after/issue/equipment) with 3-second auto-dismiss; 10+ photo amber warning bar
- Global photo sync processor in sync.ts runs on connectivity return and app foreground, handling photos from all visits
- Notes textarea with 300ms debounce to Dexie, system keyboard dictation hint, character count

## Task Commits

Each task was committed atomically:

1. **Task 1: Photo capture with compression, offline blob queue, and Supabase Storage upload** - `88ee305` (feat)
2. **Task 2: Notes field with system keyboard dictation** - `add8c2a` (feat)

**Plan metadata:** (this commit)

## Files Created/Modified

- `src/actions/storage.ts` - Server action: creates signed upload URL for Supabase Storage visit-photos bucket, org-scoped path for RLS
- `src/components/field/photo-capture.tsx` - Camera button, compression, Dexie write, tag selector, photo grid, full-size viewer, online/offline handling
- `src/components/field/notes-field.tsx` - Large textarea with 300ms debounce, keyboard dictation hint, character count
- `src/actions/visits.ts` - Added orgId field to StopContext interface and return value
- `src/lib/offline/db.ts` - Added orgId to PhotoQueueItem, bumped Dexie to v3
- `src/lib/offline/sync.ts` - Added processAllPendingPhotos function, wired into online/visibilitychange handlers
- `src/components/field/stop-workflow.tsx` - Replaced Photos and Notes placeholder tabs with real components

## Decisions Made

- **orgId in PhotoQueueItem:** Adding orgId to the Dexie record (v3 schema bump) enables the global sync processor to construct the storage path without live session context. Alternative was threading orgId through all sync.ts calls — unnecessary complexity.
- **Blob-first architecture:** Compressed blob goes to Dexie before any upload attempt. This is critical — if the upload fails or the app closes, the photo is already safe in IndexedDB.
- **No Web Speech API:** Per research, iOS PWA standalone mode breaks Web Speech API. System keyboard dictation (the mic key on the iOS/Android keyboard) works reliably. The NotesField component uses a hint instead of a custom microphone button.
- **processAllPendingPhotos in sync.ts:** Makes the global connectivity handler retry all pending photos on app-open and tab focus — not just photos from the current stop session. The PhotoCapture component also has its own inline processor for immediate upload after capture.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Added orgId to PhotoQueueItem and bumped Dexie to v3**
- **Found during:** Task 1 (photo sync processor implementation)
- **Issue:** The plan specified a global photo sync processor in sync.ts, but PhotoQueueItem had no orgId field. Without orgId stored per-photo, the sync processor could not construct the org-scoped storage path required for Supabase Storage RLS.
- **Fix:** Added orgId to PhotoQueueItem interface, created Dexie v3 with orgId as indexed field, updated photo-capture.tsx to write orgId into every queue item
- **Files modified:** src/lib/offline/db.ts, src/components/field/photo-capture.tsx
- **Verification:** TypeScript clean, build passes, orgId correctly threaded from StopContext through PhotoCapture to Dexie record
- **Committed in:** 88ee305 (Task 1 commit)

**2. [Rule 1 - Bug] Added orgId to StopContext**
- **Found during:** Task 1 (wiring PhotoCapture into StopWorkflow)
- **Issue:** PhotoCapture needs orgId as a prop. StopContext didn't expose orgId (it was extracted inside withRls but not returned).
- **Fix:** Added orgId to StopContext interface and return value in getStopContext
- **Files modified:** src/actions/visits.ts
- **Verification:** TypeScript satisfies check passes for StopContext
- **Committed in:** 88ee305 (Task 1 commit)

---

**Total deviations:** 2 auto-fixed (both Rule 1 — bugs that would break the sync processor)
**Impact on plan:** Both fixes necessary for the global photo sync architecture to work. No scope creep.

## Issues Encountered

None — build passed on first attempt after all files were created.

## User Setup Required

**Supabase Storage bucket `visit-photos` must be created manually in the Supabase dashboard:**

1. Go to Storage in the Supabase dashboard
2. Create a new bucket named `visit-photos`
3. Set to Private (not public)
4. File size limit: 5MB
5. Allowed MIME types: image/webp, image/jpeg, image/png
6. Add RLS policy on `storage.objects`:
   ```sql
   -- Policy: org-scoped read/write access
   CREATE POLICY "Org-scoped photo access"
   ON storage.objects
   FOR ALL
   TO authenticated
   USING (
     bucket_id = 'visit-photos'
     AND (storage.foldername(name))[1] = (auth.jwt() ->> 'org_id')
   )
   WITH CHECK (
     bucket_id = 'visit-photos'
     AND (storage.foldername(name))[1] = (auth.jwt() ->> 'org_id')
   );
   ```

## Next Phase Readiness

- Photos tab: fully functional — camera, compression, offline queue, Supabase Storage upload
- Notes tab: fully functional — debounced Dexie persistence, keyboard dictation hint
- Stop workflow is now complete: Chemistry, Tasks, Photos, Notes all wired
- Next: Plan 03-07 will handle visit completion — syncing the completed visitDraft and photo storagePaths to Supabase service_visits table

---
*Phase: 03-field-tech-app*
*Completed: 2026-03-06*
