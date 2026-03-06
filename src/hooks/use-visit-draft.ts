"use client"

import { useCallback } from "react"
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
  // Live query — re-renders whenever the Dexie record changes
  const draft = useLiveQuery(
    async () => {
      // Check for existing draft for this stop
      const existing = await offlineDb.visitDrafts
        .where("stopId")
        .equals(stopId)
        .and((d) => d.status === "draft")
        .first()

      if (existing) return existing

      // No existing draft — create a new one
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
      return newDraft
    },
    [stopId, visitId, customerId, poolId]
  )

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
      const existing = draft.checklist.find((t) => t.taskId === taskId)
      let updatedChecklist
      if (existing) {
        updatedChecklist = draft.checklist.map((t) =>
          t.taskId === taskId ? { ...t, completed, notes } : t
        )
      } else {
        updatedChecklist = [...draft.checklist, { taskId, completed, notes }]
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

  /** Mark draft as completed. */
  const completeDraft = useCallback(async () => {
    if (!draft) return
    await offlineDb.visitDrafts.update(draft.id, {
      status: "completed",
      updatedAt: Date.now(),
    })
  }, [draft])

  return {
    draft,
    updateChemistry,
    updateChecklist,
    updateNotes,
    completeDraft,
  }
}
