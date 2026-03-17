"use client"

/**
 * materials-page-client.tsx — Client-side materials management page.
 *
 * Phase 12 Plan 09: Materials & Procurement
 *
 * Two-tab layout: Materials | Purchase Orders
 *
 * Materials tab:
 * - Alert if project-level cost variance exceeds 10% (PROJ-31)
 * - Bulk PO selection + Create PO button
 * - MaterialList table with per-row edit/receive/return actions
 *
 * Purchase Orders tab:
 * - MaterialReceiving: PO cards with status, line items, PDF download
 */

import { useState } from "react"
import Link from "next/link"
import { toast } from "sonner"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { MaterialList } from "@/components/projects/material-list"
import { PurchaseOrderBuilder } from "@/components/projects/purchase-order-builder"
import { MaterialReceiving } from "@/components/projects/material-receiving"
import { populateMaterialsFromProposal } from "@/actions/projects-materials"
import { cn } from "@/lib/utils"
import type { ProjectDetail } from "@/actions/projects"
import type { ProjectMaterial, PurchaseOrder } from "@/actions/projects-materials"

// ---------------------------------------------------------------------------
// Props
// ---------------------------------------------------------------------------

interface MaterialsPageClientProps {
  project: ProjectDetail
  initialMaterials: ProjectMaterial[]
  initialPurchaseOrders: PurchaseOrder[]
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

type TabId = "materials" | "purchase-orders"

const TABS: Array<{ id: TabId; label: string }> = [
  { id: "materials", label: "Materials" },
  { id: "purchase-orders", label: "Purchase Orders" },
]

export function MaterialsPageClient({
  project,
  initialMaterials,
  initialPurchaseOrders,
}: MaterialsPageClientProps) {
  const [activeTab, setActiveTab] = useState<TabId>("materials")
  const [materials, setMaterials] = useState<ProjectMaterial[]>(initialMaterials)
  const [purchaseOrders, setPurchaseOrders] = useState<PurchaseOrder[]>(initialPurchaseOrders)
  const [selectedForPo, setSelectedForPo] = useState<Set<string>>(new Set())
  const [showPoBuilder, setShowPoBuilder] = useState(false)
  const [isPopulating, setIsPopulating] = useState(false)

  // Cost variance summary
  const totalEstimated = materials.reduce((s, m) => s + m.total_estimated, 0)
  const totalActual = materials.reduce((s, m) => s + m.total_actual, 0)
  const totalVariance = totalActual - totalEstimated
  const totalVariancePct =
    totalEstimated > 0 ? (totalVariance / totalEstimated) * 100 : null
  const isOverBudget = totalVariancePct !== null && totalVariancePct > 10

  function handleTogglePoSelection(materialId: string) {
    setSelectedForPo((prev) => {
      const next = new Set(prev)
      if (next.has(materialId)) {
        next.delete(materialId)
      } else {
        next.add(materialId)
      }
      return next
    })
  }

  async function handlePopulateFromProposal() {
    setIsPopulating(true)
    try {
      const result = await populateMaterialsFromProposal(project.id)
      if ("error" in result) {
        toast.error(result.error)
      } else if (result.created === 0) {
        toast.info("All proposal materials already imported")
      } else {
        toast.success(`Imported ${result.created} material${result.created === 1 ? "" : "s"} from proposal`)
        // Re-fetch materials would require router.refresh or passing fresh data back
        // Since server actions don't return fresh data here, show a toast and let user see the list
        // The user can reload to see the imported materials
        // For better UX, we'll refresh via window.location.reload
        window.location.reload()
      }
    } finally {
      setIsPopulating(false)
    }
  }

  const selectedMaterials = materials.filter((m) => selectedForPo.has(m.id))
  const canCreatePo = selectedForPo.size > 0

  return (
    <div className="flex flex-col min-h-0">
      {/* Page header */}
      <div className="flex items-center justify-between px-6 py-4 border-b border-border">
        <div className="flex items-center gap-4">
          <div>
            <nav className="flex items-center gap-1 text-sm text-muted-foreground mb-1">
              <Link href="/projects" className="hover:text-foreground transition-colors">
                Projects
              </Link>
              <span>/</span>
              <Link
                href={`/projects/${project.id}`}
                className="hover:text-foreground transition-colors"
              >
                {project.project_number ?? project.name}
              </Link>
              <span>/</span>
              <span className="text-foreground">Materials</span>
            </nav>
            <h1 className="text-2xl font-bold tracking-tight">Materials</h1>
          </div>
        </div>

        <div className="flex items-center gap-2">
          {/* Populate from proposal (only show if project has an approved proposal stage) */}
          {["proposal_approved", "deposit_received", "permitted", "in_progress", "punch_list", "complete"].includes(project.stage) && (
            <Button
              size="sm"
              variant="outline"
              onClick={handlePopulateFromProposal}
              disabled={isPopulating}
            >
              {isPopulating ? "Importing..." : "Import from Proposal"}
            </Button>
          )}

          {/* Create PO button */}
          {canCreatePo && (
            <Button
              size="sm"
              onClick={() => setShowPoBuilder(true)}
            >
              Create PO ({selectedForPo.size})
            </Button>
          )}
        </div>
      </div>

      {/* Cost variance alert */}
      {isOverBudget && (
        <div className="mx-6 mt-4 rounded-lg border border-destructive/30 bg-destructive/10 px-4 py-3">
          <p className="text-sm font-medium text-destructive">
            Material costs exceed budget by{" "}
            {totalVariancePct!.toFixed(1)}%
          </p>
          <p className="text-xs text-destructive/80 mt-0.5">
            Estimated: ${totalEstimated.toFixed(2)} — Actual: ${totalActual.toFixed(2)} —
            Over by ${totalVariance.toFixed(2)}
          </p>
        </div>
      )}

      {/* Tab bar */}
      <div className="flex border-b border-border px-6 shrink-0 mt-4">
        {TABS.map((tab) => (
          <button
            key={tab.id}
            type="button"
            onClick={() => setActiveTab(tab.id)}
            className={cn(
              "px-4 py-2.5 text-sm font-medium transition-colors border-b-2 -mb-px",
              activeTab === tab.id
                ? "border-primary text-foreground"
                : "border-transparent text-muted-foreground hover:text-foreground hover:border-border"
            )}
          >
            {tab.label}
            {tab.id === "purchase-orders" && purchaseOrders.length > 0 && (
              <Badge variant="secondary" className="ml-2 text-xs py-0 px-1.5">
                {purchaseOrders.length}
              </Badge>
            )}
          </button>
        ))}
      </div>

      {/* Tab content */}
      <div className="flex-1 overflow-auto p-6">
        {activeTab === "materials" && (
          <MaterialList
            projectId={project.id}
            materials={materials}
            onMaterialsChange={setMaterials}
            onAddToPo={(material) => {
              setSelectedForPo((prev) => new Set([...prev, material.id]))
            }}
            selectedForPo={selectedForPo}
            onTogglePoSelection={handleTogglePoSelection}
          />
        )}

        {activeTab === "purchase-orders" && (
          <MaterialReceiving
            purchaseOrders={purchaseOrders}
            onPurchaseOrdersChange={setPurchaseOrders}
          />
        )}
      </div>

      {/* PO Builder dialog */}
      {showPoBuilder && (
        <PurchaseOrderBuilder
          projectId={project.id}
          selectedMaterials={selectedMaterials}
          open={showPoBuilder}
          onClose={() => {
            setShowPoBuilder(false)
            setSelectedForPo(new Set())
          }}
          onCreated={(newPo) => {
            setPurchaseOrders((prev) => [newPo, ...prev])
            setSelectedForPo(new Set())
            // Switch to PO tab to see the new PO
            setActiveTab("purchase-orders")
          }}
        />
      )}
    </div>
  )
}
