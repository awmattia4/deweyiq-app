import type { Metadata } from "next"
import { redirect } from "next/navigation"
import { getCurrentUser } from "@/actions/auth"
import { getTruckInventory, getTruckLoadTemplates } from "@/actions/truck-inventory"
import { getShoppingList } from "@/actions/shopping-lists"
import { getPurchasingDashboard, getSpendingInsights } from "@/actions/purchasing"
import { getChemicalUsageReport } from "@/actions/reporting"
import { adminDb } from "@/lib/db"
import { profiles } from "@/lib/db/schema"
import { eq, and, inArray } from "drizzle-orm"
import { InventoryPageClient } from "./inventory-page-client"

export const metadata: Metadata = {
  title: "Inventory",
}

/**
 * /inventory — Inventory hub page.
 *
 * Tech view: their own truck inventory + shopping list in tabs.
 * Office/Owner view: per-tech inventory selector, all org shopping list,
 *   Purchasing dashboard, Spending insights, and Chemical Usage panel.
 *
 * Server component — fetches data server-side for instant render.
 */
export default async function InventoryPage() {
  const user = await getCurrentUser()

  if (!user) redirect("/login")
  if (user.role === "customer") redirect("/portal")

  const isTech = user.role === "tech"

  // ── Tech view ─────────────────────────────────────────────────────────────
  if (isTech) {
    const [inventoryItems, shoppingItems] = await Promise.all([
      getTruckInventory(user.id).catch(() => []),
      getShoppingList(user.id).catch(() => []),
    ])

    return (
      <InventoryPageClient
        role="tech"
        currentUserId={user.id}
        currentUserName={user.full_name || user.email}
        initialInventoryItems={inventoryItems}
        initialShoppingItems={shoppingItems}
        initialTemplates={[]}
        allTechs={[{ id: user.id, fullName: user.full_name || user.email }]}
      />
    )
  }

  // ── Office/Owner view ─────────────────────────────────────────────────────
  // Fetch all techs in the org for the selector
  let allTechs: Array<{ id: string; fullName: string }> = []

  try {
    const techRows = await adminDb
      .select({ id: profiles.id, full_name: profiles.full_name })
      .from(profiles)
      .where(
        and(
          eq(profiles.org_id, user.org_id),
          inArray(profiles.role, ["tech", "owner"])
        )
      )
      .orderBy(profiles.full_name)

    allTechs = techRows.map((r) => ({ id: r.id, fullName: r.full_name }))
  } catch (err) {
    console.error("[InventoryPage] Failed to fetch tech profiles:", err)
  }

  // Default to first tech (or office user themselves)
  const defaultTechId = allTechs[0]?.id ?? user.id

  const [
    inventoryItems,
    shoppingItems,
    templates,
    purchasingData,
    spendingData,
    chemicalData,
  ] = await Promise.all([
    getTruckInventory(defaultTechId).catch(() => []),
    getShoppingList(null).catch(() => []),
    getTruckLoadTemplates().catch(() => []),
    getPurchasingDashboard("urgency").catch(() => ({
      groups: [],
      totalItemsNeeded: 0,
      totalItemsOrdered: 0,
      totalEstimatedSpend: 0,
    })),
    getSpendingInsights("month", "supplier").catch(() => ({
      timeSeries: [],
      breakdown: [],
    })),
    getChemicalUsageReport("month", "tech").catch(() => ({
      entries: [],
      period: "month" as const,
      groupBy: "tech" as const,
    })),
  ])

  return (
    <InventoryPageClient
      role="office"
      currentUserId={user.id}
      currentUserName={user.full_name || user.email}
      initialInventoryItems={inventoryItems}
      initialShoppingItems={shoppingItems}
      initialTemplates={templates}
      allTechs={allTechs}
      defaultTechId={defaultTechId}
      initialPurchasingData={purchasingData}
      initialSpendingData={spendingData}
      initialChemicalData={chemicalData}
    />
  )
}
