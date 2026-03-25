"use client"

/**
 * CrewRouteView — Read-only view of crewmate's route stops.
 *
 * Shown on the /routes page when the current tech shares a truck with
 * another tech. Displays the crewmate's stops in a simplified read-only
 * list so the tech knows where their truck is going.
 *
 * No actions (no complete, no reorder, no chemistry entry) — just visibility.
 */

import { Card, CardContent } from "@/components/ui/card"
import type { CrewMemberRoute } from "@/actions/routes"

interface CrewRouteViewProps {
  crewRoutes: CrewMemberRoute[]
  truckName: string
}

export function CrewRouteView({ crewRoutes, truckName }: CrewRouteViewProps) {
  if (crewRoutes.length === 0) return null

  return (
    <div className="flex flex-col gap-4">
      <div>
        <p className="text-xs text-muted-foreground uppercase tracking-wider font-medium mb-1">
          {truckName}
        </p>
        <p className="text-xs text-muted-foreground">
          You share this truck. Their stops are shown below for reference.
        </p>
      </div>

      {crewRoutes.map((crew) => (
        <div key={crew.techId} className="flex flex-col gap-2">
          <p className="text-sm font-medium text-muted-foreground">
            {crew.techName}&apos;s stops ({crew.stops.length})
          </p>

          <div className="flex flex-col gap-1.5">
            {crew.stops.map((stop, idx) => (
              <Card key={stop.routeStopId ?? `${stop.customerId}-${idx}`} className="border-border/50">
                <CardContent className="p-3">
                  <div className="flex items-start gap-2.5">
                    <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-muted text-[10px] font-bold text-muted-foreground mt-0.5">
                      {idx + 1}
                    </span>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium leading-tight">{stop.customerName}</p>
                      {stop.address && (
                        <p className="text-xs text-muted-foreground mt-0.5 truncate">{stop.address}</p>
                      )}
                      <div className="flex items-center gap-2 mt-0.5">
                        <span className="text-xs text-muted-foreground">{stop.poolName}</span>
                        {stop.stopStatus === "complete" && (
                          <span className="text-[10px] text-emerald-400 font-medium">Done</span>
                        )}
                        {stop.stopStatus === "skipped" && (
                          <span className="text-[10px] text-amber-400 font-medium">Skipped</span>
                        )}
                        {stop.stopStatus === "in_progress" && (
                          <span className="text-[10px] text-blue-400 font-medium">In Progress</span>
                        )}
                      </div>
                    </div>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        </div>
      ))}
    </div>
  )
}
