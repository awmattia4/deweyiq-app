"use client"

import { useMemo } from "react"
import { CheckCircle2Icon, FlaskConicalIcon, TriangleAlertIcon } from "lucide-react"
import { calculateCSI, interpretCSI } from "@/lib/chemistry/lsi"
import { generateDosingRecommendations } from "@/lib/chemistry/dosing"
import type { FullChemistryReadings, ChemicalProduct, PoolInfo } from "@/lib/chemistry/dosing"
import { cn } from "@/lib/utils"

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface ChemistryDosingProps {
  readings: FullChemistryReadings
  pool: PoolInfo
  products: ChemicalProduct[]
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Format amount with unit for display */
function formatDose(amount: number, unit: string): string {
  if (unit === "floz") return `${amount} fl oz`
  if (unit === "lbs") return `${amount} lbs`
  if (unit === "oz") return `${amount} oz`
  return `${amount} ${unit}`
}

/** CSI status to Tailwind color classes */
function getCsiColors(color: "red" | "yellow" | "green") {
  switch (color) {
    case "green":
      return {
        badge: "bg-green-500/15 text-green-400 border border-green-500/20",
        indicator: "bg-green-500",
        text: "text-green-400",
      }
    case "yellow":
      return {
        badge: "bg-yellow-500/15 text-yellow-400 border border-yellow-500/20",
        indicator: "bg-yellow-500",
        text: "text-yellow-400",
      }
    case "red":
      return {
        badge: "bg-red-500/15 text-red-400 border border-red-500/20",
        indicator: "bg-red-500",
        text: "text-red-400",
      }
  }
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

/**
 * ChemistryDosing — LSI/CSI display and dosing recommendations panel.
 *
 * Per locked decisions:
 * - LSI value and dosing recommendations appear inline below chemistry grid
 * - Updates live as readings are entered (pure client-side calculation)
 * - Exact dosing amounts (fl oz / lbs), not ranges
 * - Product-aware: doses adjust based on actual product concentration
 * - Zero network dependency — works completely offline
 */
export function ChemistryDosing({ readings, pool, products }: ChemistryDosingProps) {
  // Calculate CSI (pure function — instant, no network)
  const csi = useMemo(() => calculateCSI(readings), [readings])
  const csiInterpretation = useMemo(
    () => (csi !== null ? interpretCSI(csi) : null),
    [csi]
  )

  // Generate dosing recommendations (pure function — instant, no network)
  const recommendations = useMemo(
    () =>
      generateDosingRecommendations({
        readings,
        pool,
        products,
      }),
    [readings, pool, products]
  )

  // Check if any readings have been entered at all
  const hasAnyReading = useMemo(() => {
    return Object.values(readings).some((v) => v !== null && v !== undefined)
  }, [readings])

  // Check if we have enough readings for CSI
  const hasRequiredForCsi =
    readings.pH !== null &&
    readings.totalAlkalinity !== null &&
    readings.calciumHardness !== null &&
    readings.temperatureF !== null

  const csiColors = csiInterpretation ? getCsiColors(csiInterpretation.color) : null

  return (
    <div className="flex flex-col gap-3">
      {/* ── LSI / CSI section ─────────────────────────────────────────────── */}
      <div className="rounded-xl border border-border/60 bg-card overflow-hidden">
        <div className="flex items-center justify-between px-4 py-3 border-b border-border/40 bg-muted/20">
          <div className="flex items-center gap-2">
            <FlaskConicalIcon className="h-4 w-4 text-muted-foreground" />
            <span className="text-sm font-medium">Saturation Index (CSI/LSI)</span>
          </div>
        </div>

        <div className="px-4 py-4">
          {!hasRequiredForCsi ? (
            <p className="text-sm text-muted-foreground">
              Enter pH, Total Alkalinity, Calcium Hardness, and Temperature to see LSI
            </p>
          ) : csi !== null && csiInterpretation !== null ? (
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                {/* Color indicator dot */}
                <div
                  className={cn("h-3 w-3 rounded-full shrink-0", csiColors?.indicator)}
                />
                <div className="flex flex-col gap-0.5">
                  <span className={cn("text-sm font-medium", csiColors?.text)}>
                    {csiInterpretation.label}
                  </span>
                  <span className="text-xs text-muted-foreground">
                    Target: -0.3 to +0.3
                  </span>
                </div>
              </div>
              {/* CSI value badge */}
              <span
                className={cn(
                  "text-sm font-bold tabular-nums px-2.5 py-1 rounded-lg",
                  csiColors?.badge
                )}
              >
                {csi >= 0 ? "+" : ""}
                {csi.toFixed(2)}
              </span>
            </div>
          ) : (
            <p className="text-sm text-muted-foreground">
              Unable to calculate — check that values are valid
            </p>
          )}
        </div>
      </div>

      {/* ── Dosing recommendations section ────────────────────────────────── */}
      <div className="rounded-xl border border-border/60 bg-card overflow-hidden">
        <div className="flex items-center justify-between px-4 py-3 border-b border-border/40 bg-muted/20">
          <div className="flex items-center gap-2">
            <TriangleAlertIcon className="h-4 w-4 text-muted-foreground" />
            <span className="text-sm font-medium">Dosing Recommendations</span>
          </div>
          {recommendations.length > 0 && (
            <span className="text-xs bg-orange-500/15 text-orange-400 border border-orange-500/20 px-2 py-0.5 rounded-full font-medium">
              {recommendations.length} action{recommendations.length !== 1 ? "s" : ""}
            </span>
          )}
        </div>

        <div className="px-4 py-4 flex flex-col gap-3">
          {!hasAnyReading ? (
            <p className="text-sm text-muted-foreground">
              Enter readings to see recommendations
            </p>
          ) : products.length === 0 ? (
            <div className="flex items-start gap-2.5 text-sm text-muted-foreground">
              <TriangleAlertIcon className="h-4 w-4 text-yellow-500 shrink-0 mt-0.5" />
              <span>
                No chemical products configured — ask your office to set up products
              </span>
            </div>
          ) : recommendations.length === 0 ? (
            <div className="flex items-center gap-2.5 text-sm">
              <CheckCircle2Icon className="h-4 w-4 text-green-500 shrink-0" />
              <span className="text-green-400 font-medium">All readings in range</span>
            </div>
          ) : (
            recommendations.map((rec, idx) => (
              <div
                key={`${rec.chemical}-${idx}`}
                className="flex items-start gap-3 rounded-lg border border-border/40 bg-muted/20 p-3"
              >
                {/* Action indicator */}
                <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md bg-orange-500/15 border border-orange-500/20">
                  <span className="text-[11px] font-bold text-orange-400 uppercase">
                    Add
                  </span>
                </div>

                <div className="flex flex-col gap-1 min-w-0 flex-1">
                  {/* Product name + amount */}
                  <div className="flex items-baseline gap-1.5 flex-wrap">
                    <span className="text-sm font-semibold text-foreground">
                      {formatDose(rec.amount, rec.unit)}
                    </span>
                    <span className="text-sm text-muted-foreground truncate">
                      {rec.product.name}
                    </span>
                  </div>
                  {/* Reason */}
                  <p className="text-xs text-muted-foreground leading-relaxed">
                    {rec.reason}
                  </p>
                </div>
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  )
}
