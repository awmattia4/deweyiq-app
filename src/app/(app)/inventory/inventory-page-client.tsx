"use client"

/**
 * Inventory Page Client Component
 *
 * Tab host for truck inventory and shopping list views.
 * Tech view: 2-tab layout (My Truck | Shopping List).
 * Office view: 5-tab layout (Truck Inventory | Shopping Lists | Purchasing | Spending | Chemical Usage).
 * Phase 13 Plan 03 adds purchasing/spending/chemical usage tabs for office.
 */

import { useState, useEffect, useTransition } from "react"
import { cn } from "@/lib/utils"
import { TruckInventoryView } from "@/components/inventory/truck-inventory-view"
import { ShoppingListView } from "@/components/inventory/shopping-list-view"
import { PurchasingDashboard } from "@/components/inventory/purchasing-dashboard"
import { SpendingInsights } from "@/components/inventory/spending-insights"
import { ChemicalUsagePanel } from "@/components/inventory/chemical-usage-panel"
import { getTruckInventory } from "@/actions/truck-inventory"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import type { TruckInventoryItem } from "@/actions/truck-inventory"
import type { ShoppingListItem } from "@/actions/shopping-lists"
import type { PurchasingDashboardData, SpendingInsightsData } from "@/actions/purchasing"
import type { ChemicalUsageReport } from "@/actions/reporting"

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

type TabId = "inventory" | "shopping-list" | "purchasing" | "spending" | "chemical-usage"

interface TechProfile {
  id: string
  fullName: string
}

interface Template {
  id: string
  name: string
  target_role: string | null
  is_active: boolean
}

interface InventoryPageClientProps {
  role: "tech" | "office"
  currentUserId: string
  currentUserName: string
  initialInventoryItems: TruckInventoryItem[]
  initialShoppingItems: ShoppingListItem[]
  initialTemplates: Template[]
  allTechs: TechProfile[]
  defaultTechId?: string
  // Phase 13 Plan 03: office-only purchasing data
  initialPurchasingData?: PurchasingDashboardData
  initialSpendingData?: SpendingInsightsData
  initialChemicalData?: ChemicalUsageReport
}

// ---------------------------------------------------------------------------
// Default empty data shapes
// ---------------------------------------------------------------------------

const EMPTY_PURCHASING: PurchasingDashboardData = {
  groups: [],
  totalItemsNeeded: 0,
  totalItemsOrdered: 0,
  totalEstimatedSpend: 0,
}

const EMPTY_SPENDING: SpendingInsightsData = {
  timeSeries: [],
  breakdown: [],
}

const EMPTY_CHEMICAL: ChemicalUsageReport = {
  entries: [],
  period: "month",
  groupBy: "tech",
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function InventoryPageClient({
  role,
  currentUserId,
  initialInventoryItems,
  initialShoppingItems,
  allTechs,
  defaultTechId,
  initialPurchasingData = EMPTY_PURCHASING,
  initialSpendingData = EMPTY_SPENDING,
  initialChemicalData = EMPTY_CHEMICAL,
}: InventoryPageClientProps) {
  const isOffice = role === "office"

  const officeTabs: Array<{ id: TabId; label: string }> = [
    { id: "inventory", label: "Truck Inventory" },
    { id: "shopping-list", label: "Shopping Lists" },
    { id: "purchasing", label: "Purchasing" },
    { id: "spending", label: "Spending" },
    { id: "chemical-usage", label: "Chemical Usage" },
  ]

  const techTabs: Array<{ id: TabId; label: string }> = [
    { id: "inventory", label: "My Truck" },
    { id: "shopping-list", label: "Shopping List" },
  ]

  const tabs = isOffice ? officeTabs : techTabs
  const validTabIds = new Set(tabs.map((t) => t.id))

  // Persist active tab in URL hash so it survives refresh
  function getInitialTab(): TabId {
    if (typeof window !== "undefined") {
      const hash = window.location.hash.replace("#", "") as TabId
      if (hash && validTabIds.has(hash)) return hash
    }
    return "inventory"
  }

  const [activeTab, setActiveTab] = useState<TabId>(getInitialTab)
  const [selectedTechId, setSelectedTechId] = useState(defaultTechId ?? currentUserId)
  const [inventoryItems, setInventoryItems] = useState<TruckInventoryItem[]>(initialInventoryItems)
  const [shoppingItems] = useState<ShoppingListItem[]>(initialShoppingItems)
  const [, startTransition] = useTransition()

  // Sync hash on tab change
  function handleTabChange(tabId: TabId) {
    setActiveTab(tabId)
    window.history.replaceState(null, "", `#${tabId}`)
  }

  // Listen for popstate (browser back/forward) to update tab
  useEffect(() => {
    function onHashChange() {
      const hash = window.location.hash.replace("#", "") as TabId
      if (hash && validTabIds.has(hash)) setActiveTab(hash)
    }
    window.addEventListener("hashchange", onHashChange)
    return () => window.removeEventListener("hashchange", onHashChange)
  }, [])

  const selectedTech = allTechs.find((t) => t.id === selectedTechId)

  function handleTechChange(techId: string) {
    setSelectedTechId(techId)
    startTransition(async () => {
      try {
        const items = await getTruckInventory(techId)
        setInventoryItems(items as TruckInventoryItem[])
      } catch (err) {
        console.error("Failed to fetch inventory for tech:", err)
      }
    })
  }

  return (
    <div className="flex flex-col gap-5">
      {/* Page header */}
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold tracking-tight">Inventory</h1>

        {/* Office: tech selector — only shown on Truck Inventory tab */}
        {isOffice && allTechs.length > 1 && activeTab === "inventory" && (
          <Select value={selectedTechId} onValueChange={handleTechChange}>
            <SelectTrigger className="w-48">
              <SelectValue placeholder="Select tech..." />
            </SelectTrigger>
            <SelectContent>
              {allTechs.map((t) => (
                <SelectItem key={t.id} value={t.id}>
                  {t.fullName}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        )}
      </div>

      {isOffice && selectedTech && activeTab === "inventory" && (
        <p className="text-sm text-muted-foreground -mt-3">
          Viewing inventory for {selectedTech.fullName}
        </p>
      )}

      {/* Mobile: dropdown select */}
      <div className="sm:hidden">
        <Select value={activeTab} onValueChange={(v) => handleTabChange(v as TabId)}>
          <SelectTrigger>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {tabs.map((tab) => (
              <SelectItem key={tab.id} value={tab.id}>
                {tab.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {/* Desktop: tab bar */}
      <div className="hidden sm:flex border-b border-border" role="tablist">
        {tabs.map((tab) => (
          <button
            key={tab.id}
            role="tab"
            aria-selected={activeTab === tab.id}
            onClick={() => handleTabChange(tab.id)}
            className={cn(
              "shrink-0 px-4 py-2.5 text-sm font-medium transition-colors cursor-pointer -mb-px border-b-2 whitespace-nowrap",
              activeTab === tab.id
                ? "border-primary text-foreground"
                : "border-transparent text-muted-foreground hover:text-foreground hover:border-border"
            )}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* Tab content */}
      <div>
        {activeTab === "inventory" && (
          <TruckInventoryView
            techId={selectedTechId}
            initialItems={inventoryItems}
            allTechs={allTechs}
            isOfficeView={isOffice}
          />
        )}

        {activeTab === "shopping-list" && (
          <ShoppingListView
            techId={isOffice ? null : currentUserId}
            initialItems={shoppingItems}
            isOfficeView={isOffice}
          />
        )}

        {activeTab === "purchasing" && isOffice && (
          <PurchasingDashboard initialData={initialPurchasingData} />
        )}

        {activeTab === "spending" && isOffice && (
          <SpendingInsights initialData={initialSpendingData} />
        )}

        {activeTab === "chemical-usage" && isOffice && (
          <ChemicalUsagePanel initialData={initialChemicalData} />
        )}
      </div>
    </div>
  )
}
