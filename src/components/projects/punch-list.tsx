"use client"

/**
 * PunchList — Digital punch list for final walkthrough.
 *
 * Phase 12 Plan 15 (PROJ-72)
 *
 * Features:
 * - Table of punch list items with description, assignee, status badge, photos.
 * - Office adds items via "Add Item" button.
 * - Status workflow: open -> in_progress -> resolved -> accepted.
 * - "Complete Walkthrough" button (only when all items resolved) sends sign-off link or
 *   triggers the sign-off flow directly.
 * - Customer sign-off triggers: project completion + warranty activation + final invoice.
 */

import { useState } from "react"
import { Card } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import {
  createPunchListItem,
  updatePunchListItem,
  customerSignOffPunchList,
  type PunchListItem,
} from "@/actions/projects-inspections"

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function statusBadgeVariant(status: string): "default" | "secondary" | "destructive" | "outline" {
  switch (status) {
    case "accepted":
      return "default"
    case "resolved":
      return "secondary"
    case "in_progress":
      return "outline"
    case "open":
    default:
      return "destructive"
  }
}

function statusLabel(status: string): string {
  const map: Record<string, string> = {
    open: "Open",
    in_progress: "In Progress",
    resolved: "Resolved",
    accepted: "Accepted",
  }
  return map[status] ?? status
}

function nextStatus(
  status: string
): "open" | "in_progress" | "resolved" | "accepted" | null {
  const flow: Record<string, "in_progress" | "resolved" | null> = {
    open: "in_progress",
    in_progress: "resolved",
    resolved: null, // resolved -> accepted only via customer sign-off
    accepted: null,
  }
  return flow[status] ?? null
}

function nextStatusLabel(status: string): string {
  const map: Record<string, string> = {
    open: "Start",
    in_progress: "Mark Resolved",
  }
  return map[status] ?? ""
}

// ---------------------------------------------------------------------------
// AddItemDialog
// ---------------------------------------------------------------------------

function AddItemDialog({
  projectId,
  onCreated,
  onClose,
}: {
  projectId: string
  onCreated: (item: PunchListItem) => void
  onClose: () => void
}) {
  const [form, setForm] = useState({
    itemDescription: "",
    assignedTo: "",
  })
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!form.itemDescription.trim()) {
      setError("Description is required")
      return
    }

    setSaving(true)
    setError(null)

    const result = await createPunchListItem(null, projectId, {
      itemDescription: form.itemDescription.trim(),
      assignedTo: form.assignedTo || null,
    })

    setSaving(false)

    if ("error" in result) {
      setError(result.error)
      return
    }

    const newItem: PunchListItem = {
      id: result.data.itemId,
      projectId,
      itemDescription: form.itemDescription.trim(),
      status: "open",
      assignedTo: null,
      assignedToName: null,
      photoUrls: null,
      resolutionNotes: null,
      resolvedAt: null,
      customerAcceptedAt: null,
      createdAt: new Date(),
    }

    onCreated(newItem)
    onClose()
  }

  return (
    <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
      <div className="bg-background border border-border rounded-lg w-full max-w-md p-6">
        <h3 className="text-base font-semibold mb-4">Add Punch List Item</h3>
        <form onSubmit={handleSubmit} className="flex flex-col gap-4">
          <div className="flex flex-col gap-1.5">
            <label className="text-sm font-medium">Description</label>
            <textarea
              value={form.itemDescription}
              onChange={(e) => setForm((f) => ({ ...f, itemDescription: e.target.value }))}
              placeholder="Describe the item that needs attention..."
              rows={3}
              autoFocus
              className="flex w-full rounded-md border border-input bg-transparent px-3 py-2 text-sm shadow-sm focus:outline-none focus:ring-1 focus:ring-ring resize-none"
            />
          </div>

          {error && <p className="text-sm text-destructive">{error}</p>}

          <div className="flex justify-end gap-2 mt-2">
            <Button type="button" variant="outline" size="sm" onClick={onClose}>
              Cancel
            </Button>
            <Button type="submit" size="sm" disabled={saving}>
              {saving ? "Adding..." : "Add Item"}
            </Button>
          </div>
        </form>
      </div>
    </div>
  )
}

// ---------------------------------------------------------------------------
// SignOffDialog
// ---------------------------------------------------------------------------

function SignOffDialog({
  projectId,
  itemCount,
  onSignedOff,
  onClose,
}: {
  projectId: string
  itemCount: number
  onSignedOff: () => void
  onClose: () => void
}) {
  const [signatureText, setSignatureText] = useState("")
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function handleSignOff() {
    if (!signatureText.trim()) {
      setError("Please type your name to sign off")
      return
    }

    setSaving(true)
    setError(null)

    const result = await customerSignOffPunchList(projectId, signatureText.trim())
    setSaving(false)

    if ("error" in result) {
      setError(result.error)
      return
    }

    onSignedOff()
    onClose()
  }

  return (
    <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
      <div className="bg-background border border-border rounded-lg w-full max-w-md p-6">
        <h3 className="text-base font-semibold mb-1">Complete Walkthrough</h3>
        <p className="text-sm text-muted-foreground mb-4">
          Signing off accepts all {itemCount} resolved item{itemCount !== 1 ? "s" : ""} and marks
          the project complete. This will activate the warranty and generate the final invoice.
        </p>

        <div className="bg-muted/40 border border-border rounded-md p-3 mb-4">
          <p className="text-xs text-muted-foreground">
            By signing below, you confirm that all punch list items have been reviewed and
            resolved to your satisfaction.
          </p>
        </div>

        <div className="flex flex-col gap-1.5 mb-4">
          <label className="text-sm font-medium">Type your name to sign</label>
          <input
            type="text"
            value={signatureText}
            onChange={(e) => setSignatureText(e.target.value)}
            placeholder="Full name"
            className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-sm focus:outline-none focus:ring-1 focus:ring-ring"
          />
        </div>

        {error && <p className="text-sm text-destructive mb-3">{error}</p>}

        <div className="flex justify-end gap-2">
          <Button type="button" variant="outline" size="sm" onClick={onClose}>
            Cancel
          </Button>
          <Button
            size="sm"
            disabled={saving || !signatureText.trim()}
            onClick={handleSignOff}
          >
            {saving ? "Processing..." : "Sign Off & Complete"}
          </Button>
        </div>
      </div>
    </div>
  )
}

// ---------------------------------------------------------------------------
// PunchList
// ---------------------------------------------------------------------------

interface PunchListProps {
  projectId: string
  projectStage: string
  initialItems: PunchListItem[]
  onProjectComplete?: () => void
}

export function PunchList({
  projectId,
  projectStage,
  initialItems,
  onProjectComplete,
}: PunchListProps) {
  const [items, setItems] = useState(initialItems)
  const [showAddDialog, setShowAddDialog] = useState(false)
  const [showSignOffDialog, setShowSignOffDialog] = useState(false)
  const [advancingId, setAdvancingId] = useState<string | null>(null)

  const allResolved = items.length > 0 && items.every((item) => item.status === "resolved" || item.status === "accepted")
  const resolvedCount = items.filter((item) => item.status === "resolved" || item.status === "accepted").length
  const openCount = items.filter((item) => item.status === "open" || item.status === "in_progress").length
  const isComplete = projectStage === "complete" || projectStage === "warranty_active"

  async function handleAdvanceStatus(item: PunchListItem) {
    const next = nextStatus(item.status)
    if (!next) return

    setAdvancingId(item.id)

    const updates: Parameters<typeof updatePunchListItem>[2] = { status: next }
    if (next === "resolved") {
      updates.resolutionNotes = "Resolved during walkthrough"
    }

    const result = await updatePunchListItem(null, item.id, updates)
    setAdvancingId(null)

    if ("error" in result) return

    setItems((prev) =>
      prev.map((i) =>
        i.id === item.id
          ? {
              ...i,
              status: next,
              resolvedAt: next === "resolved" ? new Date() : i.resolvedAt,
            }
          : i
      )
    )
  }

  function handleItemAdded(item: PunchListItem) {
    setItems((prev) => [...prev, item])
  }

  function handleSignedOff() {
    setItems((prev) =>
      prev.map((item) =>
        item.status === "resolved"
          ? { ...item, status: "accepted", customerAcceptedAt: new Date() }
          : item
      )
    )
    onProjectComplete?.()
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h2 className="text-base font-semibold">Punch List</h2>
          <p className="text-sm text-muted-foreground mt-0.5">
            Final walkthrough items to address before project completion.
          </p>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          {!isComplete && (
            <>
              <Button
                size="sm"
                variant="outline"
                onClick={() => setShowAddDialog(true)}
              >
                Add Item
              </Button>
              {items.length > 0 && (
                <Button
                  size="sm"
                  disabled={!allResolved}
                  onClick={() => setShowSignOffDialog(true)}
                >
                  Complete Walkthrough
                </Button>
              )}
            </>
          )}
        </div>
      </div>

      {/* Summary stats */}
      {items.length > 0 && (
        <div className="flex gap-4 text-sm">
          <span>
            <span className="font-medium">{items.length}</span>{" "}
            <span className="text-muted-foreground">total</span>
          </span>
          <span>
            <span className="font-medium text-green-600">{resolvedCount}</span>{" "}
            <span className="text-muted-foreground">resolved</span>
          </span>
          {openCount > 0 && (
            <span>
              <span className="font-medium text-destructive">{openCount}</span>{" "}
              <span className="text-muted-foreground">open</span>
            </span>
          )}
        </div>
      )}

      {!allResolved && items.length > 0 && !isComplete && (
        <div className="text-xs text-muted-foreground bg-muted/40 border border-border rounded-md px-3 py-2">
          All items must be resolved before completing the walkthrough.
        </div>
      )}

      {items.length === 0 ? (
        <p className="text-sm text-muted-foreground italic">
          No punch list items yet. Add items during the final walkthrough.
        </p>
      ) : (
        <div className="flex flex-col gap-2">
          {items.map((item) => {
            const next = nextStatus(item.status)
            return (
              <Card key={item.id} className="p-4">
                <div className="flex items-start justify-between gap-4">
                  <div className="flex flex-col gap-1 flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <Badge variant={statusBadgeVariant(item.status)} className="text-xs shrink-0">
                        {statusLabel(item.status)}
                      </Badge>
                      {item.customerAcceptedAt && (
                        <span className="text-xs text-muted-foreground">
                          Accepted{" "}
                          {item.customerAcceptedAt.toLocaleDateString("en-US", {
                            month: "short",
                            day: "numeric",
                          })}
                        </span>
                      )}
                    </div>
                    <p className="text-sm mt-0.5">{item.itemDescription}</p>
                    {item.assignedToName && (
                      <p className="text-xs text-muted-foreground">
                        Assigned to {item.assignedToName}
                      </p>
                    )}
                    {item.resolutionNotes && item.status !== "open" && (
                      <p className="text-xs text-muted-foreground mt-0.5">
                        {item.resolutionNotes}
                      </p>
                    )}
                    {item.photoUrls && item.photoUrls.length > 0 && (
                      <p className="text-xs text-muted-foreground">
                        {item.photoUrls.length} photo{item.photoUrls.length !== 1 ? "s" : ""}
                      </p>
                    )}
                  </div>

                  {!isComplete && next && (
                    <Button
                      size="sm"
                      variant="outline"
                      disabled={advancingId === item.id}
                      onClick={() => handleAdvanceStatus(item)}
                      className="shrink-0"
                    >
                      {advancingId === item.id ? "..." : nextStatusLabel(item.status)}
                    </Button>
                  )}
                </div>
              </Card>
            )
          })}
        </div>
      )}

      {showAddDialog && (
        <AddItemDialog
          projectId={projectId}
          onCreated={handleItemAdded}
          onClose={() => setShowAddDialog(false)}
        />
      )}

      {showSignOffDialog && (
        <SignOffDialog
          projectId={projectId}
          itemCount={resolvedCount}
          onSignedOff={handleSignedOff}
          onClose={() => setShowSignOffDialog(false)}
        />
      )}
    </div>
  )
}
