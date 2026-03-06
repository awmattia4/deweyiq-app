import Link from "next/link"
import { ArrowLeft, MapPin, Phone, Route, User } from "lucide-react"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"

// ─── Types ─────────────────────────────────────────────────────────────────────

interface CustomerHeaderProps {
  customer: {
    id: string
    full_name: string
    address: string | null
    phone: string | null
    email: string | null
    status: "active" | "paused" | "cancelled"
    route_name: string | null
    assignedTech?: { id: string; full_name: string | null } | null
  }
}

// ─── Status badge helpers ──────────────────────────────────────────────────────

const STATUS_LABELS: Record<string, string> = {
  active: "Active",
  paused: "Paused",
  cancelled: "Cancelled",
}

type BadgeVariant = "default" | "secondary" | "destructive" | "outline"

const STATUS_VARIANTS: Record<string, BadgeVariant> = {
  active: "default",
  paused: "secondary",
  cancelled: "destructive",
}

// ─── Component ─────────────────────────────────────────────────────────────────

/**
 * CustomerHeader — always-visible header above tabs on the customer profile page.
 *
 * Displays customer name, address, phone, status badge, assigned route, and
 * assigned tech. Includes a back link to /customers.
 */
export function CustomerHeader({ customer }: CustomerHeaderProps) {
  const statusLabel = STATUS_LABELS[customer.status] ?? customer.status
  const statusVariant = STATUS_VARIANTS[customer.status] ?? "outline"

  return (
    <div className="rounded-lg border border-border bg-card p-5 flex flex-col gap-4">
      {/* ── Top row: name + status + back button ─────────────────────────── */}
      <div className="flex items-start justify-between gap-4">
        <div className="flex flex-col gap-1 min-w-0">
          {/* Back link */}
          <Button asChild variant="ghost" size="sm" className="-ml-2 mb-1 w-fit text-muted-foreground">
            <Link href="/customers">
              <ArrowLeft className="h-4 w-4 mr-1" />
              Back to Customers
            </Link>
          </Button>

          {/* Customer name */}
          <h1 className="text-2xl font-bold tracking-tight truncate">{customer.full_name}</h1>
        </div>

        {/* Status badge */}
        <Badge variant={statusVariant} className="shrink-0 mt-8">
          {statusLabel}
        </Badge>
      </div>

      {/* ── Detail row: address, phone, route, tech ───────────────────────── */}
      <div className="flex flex-wrap gap-x-5 gap-y-1.5 text-sm text-muted-foreground">
        {customer.address && (
          <span className="flex items-center gap-1.5">
            <MapPin className="h-3.5 w-3.5 shrink-0" />
            <span className="truncate">{customer.address}</span>
          </span>
        )}

        {customer.phone && (
          <span className="flex items-center gap-1.5">
            <Phone className="h-3.5 w-3.5 shrink-0" />
            <span>{customer.phone}</span>
          </span>
        )}

        {customer.route_name && (
          <span className="flex items-center gap-1.5">
            <Route className="h-3.5 w-3.5 shrink-0" />
            <span>{customer.route_name}</span>
          </span>
        )}

        {customer.assignedTech?.full_name && (
          <span className="flex items-center gap-1.5">
            <User className="h-3.5 w-3.5 shrink-0" />
            <span>{customer.assignedTech.full_name}</span>
          </span>
        )}
      </div>
    </div>
  )
}
