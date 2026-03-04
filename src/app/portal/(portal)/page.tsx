import type { Metadata } from "next"
import { getCurrentUser } from "@/actions/auth"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { HistoryIcon, FileTextIcon, MessageCircleIcon } from "lucide-react"

export const metadata: Metadata = {
  title: "My Portal",
}

/**
 * Portal home — Customer landing page after login.
 *
 * Phase 1: welcome message with the customer's name, and "coming soon"
 * empty states for Service History, Invoices, and Messages.
 *
 * Per user decision: customer portal has company branding (placeholder
 * in Phase 1; real branding from org settings in Phase 8).
 *
 * Full portal content — service history, upcoming visits, invoices,
 * and messaging — arrives in Phase 8.
 */
export default async function PortalHomePage() {
  const user = await getCurrentUser()
  const firstName = user?.full_name?.split(" ")[0] || "there"

  return (
    <div className="flex flex-col gap-6">
      {/* ── Welcome header ───────────────────────────────────────────────── */}
      <div>
        <h1 className="text-2xl font-bold tracking-tight">
          Welcome back, {firstName}
        </h1>
        <p className="text-muted-foreground text-sm mt-1">
          Your pool service portal &mdash; see your service history, invoices, and messages here.
        </p>
      </div>

      {/* ── Coming soon sections ─────────────────────────────────────────── */}
      <div className="grid gap-4 sm:grid-cols-1 md:grid-cols-3">
        {/* Service History */}
        <Card>
          <CardHeader className="pb-3">
            <div className="flex items-center gap-2">
              <div className="flex h-8 w-8 items-center justify-center rounded-full bg-teal-500/10">
                <HistoryIcon className="h-4 w-4 text-teal-400" aria-hidden="true" />
              </div>
              <CardTitle className="text-sm">Service History</CardTitle>
            </div>
          </CardHeader>
          <CardContent>
            <p className="text-xs text-muted-foreground">
              View your past pool service visits, chemical readings, and technician notes.
            </p>
            <p className="text-xs text-primary/70 mt-3 font-medium">
              Coming in Phase 8
            </p>
          </CardContent>
        </Card>

        {/* Invoices */}
        <Card>
          <CardHeader className="pb-3">
            <div className="flex items-center gap-2">
              <div className="flex h-8 w-8 items-center justify-center rounded-full bg-sky-500/10">
                <FileTextIcon className="h-4 w-4 text-sky-400" aria-hidden="true" />
              </div>
              <CardTitle className="text-sm">Invoices</CardTitle>
            </div>
          </CardHeader>
          <CardContent>
            <p className="text-xs text-muted-foreground">
              Access and pay your invoices, view payment history and upcoming charges.
            </p>
            <p className="text-xs text-primary/70 mt-3 font-medium">
              Coming in Phase 8
            </p>
          </CardContent>
        </Card>

        {/* Messages */}
        <Card>
          <CardHeader className="pb-3">
            <div className="flex items-center gap-2">
              <div className="flex h-8 w-8 items-center justify-center rounded-full bg-violet-500/10">
                <MessageCircleIcon className="h-4 w-4 text-violet-400" aria-hidden="true" />
              </div>
              <CardTitle className="text-sm">Messages</CardTitle>
            </div>
          </CardHeader>
          <CardContent>
            <p className="text-xs text-muted-foreground">
              Communicate directly with your pool service team.
            </p>
            <p className="text-xs text-primary/70 mt-3 font-medium">
              Coming in Phase 8
            </p>
          </CardContent>
        </Card>
      </div>

      {/* ── Status note ──────────────────────────────────────────────────── */}
      <div className="rounded-xl border border-dashed border-border/60 p-6 text-center">
        <p className="text-sm text-muted-foreground">
          Your portal is being set up. Full functionality &mdash; service history,
          invoices, and messaging &mdash; launches soon.
        </p>
      </div>
    </div>
  )
}
