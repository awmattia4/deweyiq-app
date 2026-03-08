"use client"

import { useCallback, useEffect } from "react"
import { useLiveQuery } from "dexie-react-hooks"
import { offlineDb, type VisitDraft } from "@/lib/offline/db"

/**
 * useVisitDraft — manages a visit draft in Dexie for offline-first stop workflow.
 *
 * On mount:
 *   - Checks if a VisitDraft exists for this stopId in Dexie
 *   - If yes: loads it (resume in-progress work)
 *   - If no: creates a new VisitDraft with empty state, status "draft"
 *
 * Uses useLiveQuery — re-renders automatically on any Dexie write.
 * All updates write directly to Dexie with zero network dependency.
 *
 * @param stopId     - Composite stop identifier ({customerId}-{poolId})
 * @param customerId - Customer UUID
 * @param poolId     - Pool UUID
 * @param visitId    - Pre-generated UUID for this visit (client-side)
 */
export function useVisitDraft(
  stopId: string,
  customerId: string,
  poolId: string,
  visitId: string
) {
  // Live query (read-only) — re-renders whenever the Dexie record changes.
  // Finds any draft for this stopId (including completed ones) so completed
  // visits can be viewed in read-only mode instead of creating a blank draft.
  const draft = useLiveQuery(
    async () => {
      return await offlineDb.visitDrafts
        .where("stopId")
        .equals(stopId)
        .first()
    },
    [stopId]
  )

  const isCompleted = draft?.status === "completed"

  // Create draft outside liveQuery (writes not allowed in read-only liveQuery transaction)
  useEffect(() => {
    // draft is undefined while liveQuery is loading, null if no result
    if (draft !== undefined) return
    // Wait for liveQuery to resolve before deciding to create
  }, [draft])

  useEffect(() => {
    // Only create if no draft exists at all for this stopId.
    // If a completed draft exists, we show it read-only — don't create a new blank one.
    let cancelled = false
    async function ensureDraft() {
      const existing = await offlineDb.visitDrafts
        .where("stopId")
        .equals(stopId)
        .first()
      if (existing || cancelled) return

      const newDraft: VisitDraft = {
        id: visitId,
        stopId,
        poolId,
        customerId,
        chemistry: {},
        checklist: [],
        notes: "",
        status: "draft",
        updatedAt: Date.now(),
      }
      await offlineDb.visitDrafts.put(newDraft)
    }
    ensureDraft()
    return () => { cancelled = true }
  }, [stopId, visitId, customerId, poolId])

  /** Update a single chemistry reading. Writes to Dexie immediately. */
  const updateChemistry = useCallback(
    async (param: string, value: number | null) => {
      if (!draft) return
      const updatedChemistry = { ...draft.chemistry, [param]: value }
      await offlineDb.visitDrafts.update(draft.id, {
        chemistry: updatedChemistry,
        updatedAt: Date.now(),
      })
    },
    [draft]
  )

  /** Update a checklist task completion state. */
  const updateChecklist = useCallback(
    async (taskId: string, completed: boolean, notes: string = "") => {
      if (!draft) return
      // Read fresh from Dexie to avoid stale closure when multiple updates fire concurrently
      const current = await offlineDb.visitDrafts.get(draft.id)
      if (!current) return
      const existing = current.checklist.find((t) => t.taskId === taskId)
      let updatedChecklist
      if (existing) {
        updatedChecklist = current.checklist.map((t) =>
          t.taskId === taskId ? { ...t, completed, notes } : t
        )
      } else {
        updatedChecklist = [...current.checklist, { taskId, completed, notes }]
      }
      await offlineDb.visitDrafts.update(draft.id, {
        checklist: updatedChecklist,
        updatedAt: Date.now(),
      })
    },
    [draft]
  )

  /** Update free-form notes. */
  const updateNotes = useCallback(
    async (notes: string) => {
      if (!draft) return
      await offlineDb.visitDrafts.update(draft.id, {
        notes,
        updatedAt: Date.now(),
      })
    },
    [draft]
  )

  /** Mark all checklist tasks as completed in a single Dexie write (avoids race condition). */
  const markAllChecklistComplete = useCallback(
    async (taskIds: string[]) => {
      if (!draft) return
      const current = await offlineDb.visitDrafts.get(draft.id)
      if (!current) return
      const existingMap = new Map(current.checklist.map((t) => [t.taskId, t]))
      const updatedChecklist = taskIds.map((taskId) => ({
        taskId,
        completed: true,
        notes: existingMap.get(taskId)?.notes ?? "",
      }))
      await offlineDb.visitDrafts.update(draft.id, {
        checklist: updatedChecklist,
        updatedAt: Date.now(),
      })
    },
    [draft]
  )

  /** Mark draft as completed. */
  const completeDraft = useCallback(async () => {
    if (!draft) return
    await offlineDb.visitDrafts.update(draft.id, {
      status: "completed",
      updatedAt: Date.now(),
    })
  }, [draft])

  /** Reopen a completed draft for editing (e.g. forgot to add notes). */
  const reopenDraft = useCallback(async () => {
    if (!draft) return
    await offlineDb.visitDrafts.update(draft.id, {
      status: "editing",
      updatedAt: Date.now(),
    })
  }, [draft])

  return {
    draft,
    isCompleted,
    updateChemistry,
    updateChecklist,
    markAllChecklistComplete,
    updateNotes,
    completeDraft,
    reopenDraft,
  }
}
