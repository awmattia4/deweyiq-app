import type { Metadata } from "next"
import Link from "next/link"
import { redirect } from "next/navigation"
import { getCurrentUser } from "@/actions/auth"
import { getOrgBranding } from "@/actions/portal-data"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { HistoryIcon, FileTextIcon, MessageCircleIcon, WrenchIcon, MapPinIcon, HammerIcon, ScrollTextIcon } from "lucide-react"

export const metadata: Metadata = {
  title: "My Portal",
}

/**
 * Portal home — Customer landing page after login.
 *
 * Shows welcome message (custom from org_settings or default),
 * quick-link cards to portal sections, and a summary row for
 * next visit / outstanding balance / unread messages.
 * (Summary data will be populated in subsequent portal plans.)
 */
export default async function PortalHomePage() {
  const user = await getCurrentUser()
  if (!user) redirect("/portal/login")

  const firstName = user.full_name?.split(" ")[0] || "there"
  const branding = await getOrgBranding(user.org_id)
  const welcomeMessage = branding?.portalWelcomeMessage || `Welcome back, ${firstName}.`

  return (
    <div className="flex flex-col gap-6">
      {/* ── Welcome header ───────────────────────────────────────────────── */}
      <div>
        <h1 className="text-2xl font-bold tracking-tight">{welcomeMessage}</h1>
        <p className="text-muted-foreground text-sm mt-1">
          Here&apos;s everything about your pool service in one place.
        </p>
      </div>

      {/* ── Quick-link cards ──────────────────────────────────────────────── */}
      <div className="grid gap-4 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4">
        <Link href="/portal/history" className="block">
          <Card className="h-full cursor-pointer hover:bg-muted/50 active:bg-muted transition-colors">
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
                View past visits, chemical readings, technician notes, and photos.
              </p>
            </CardContent>
          </Card>
        </Link>

        <Link href="/portal/invoices" className="block">
          <Card className="h-full cursor-pointer hover:bg-muted/50 active:bg-muted transition-colors">
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
                Access and pay invoices, view payment history.
              </p>
            </CardContent>
          </Card>
        </Link>

        <Link href="/portal/agreements" className="block">
          <Card className="h-full cursor-pointer hover:bg-muted/50 active:bg-muted transition-colors">
            <CardHeader className="pb-3">
              <div className="flex items-center gap-2">
                <div className="flex h-8 w-8 items-center justify-center rounded-full bg-indigo-500/10">
                  <ScrollTextIcon className="h-4 w-4 text-indigo-400" aria-hidden="true" />
                </div>
                <CardTitle className="text-sm">Agreements</CardTitle>
              </div>
            </CardHeader>
            <CardContent>
              <p className="text-xs text-muted-foreground">
                View your service agreements, pricing, and contract terms.
              </p>
            </CardContent>
          </Card>
        </Link>

        <Link href="/portal/projects" className="block">
          <Card className="h-full cursor-pointer hover:bg-muted/50 active:bg-muted transition-colors">
            <CardHeader className="pb-3">
              <div className="flex items-center gap-2">
                <div className="flex h-8 w-8 items-center justify-center rounded-full bg-orange-500/10">
                  <HammerIcon className="h-4 w-4 text-orange-400" aria-hidden="true" />
                </div>
                <CardTitle className="text-sm">Projects</CardTitle>
              </div>
            </CardHeader>
            <CardContent>
              <p className="text-xs text-muted-foreground">
                Track renovation and construction projects.
              </p>
            </CardContent>
          </Card>
        </Link>

        <Link href="/portal/messages" className="block">
          <Card className="h-full cursor-pointer hover:bg-muted/50 active:bg-muted transition-colors">
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
            </CardContent>
          </Card>
        </Link>

        <Link href="/portal/requests" className="block">
          <Card className="h-full cursor-pointer hover:bg-muted/50 active:bg-muted transition-colors">
            <CardHeader className="pb-3">
              <div className="flex items-center gap-2">
                <div className="flex h-8 w-8 items-center justify-center rounded-full bg-amber-500/10">
                  <WrenchIcon className="h-4 w-4 text-amber-400" aria-hidden="true" />
                </div>
                <CardTitle className="text-sm">Request Service</CardTitle>
              </div>
            </CardHeader>
            <CardContent>
              <p className="text-xs text-muted-foreground">
                Submit a one-off service request — repair, opening, or other needs.
              </p>
            </CardContent>
          </Card>
        </Link>

        <Link href="/portal/eta" className="block">
          <Card className="h-full cursor-pointer hover:bg-muted/50 active:bg-muted transition-colors">
            <CardHeader className="pb-3">
              <div className="flex items-center gap-2">
                <div className="flex h-8 w-8 items-center justify-center rounded-full bg-green-500/10">
                  <MapPinIcon className="h-4 w-4 text-green-400" aria-hidden="true" />
                </div>
                <CardTitle className="text-sm">Track Service</CardTitle>
              </div>
            </CardHeader>
            <CardContent>
              <p className="text-xs text-muted-foreground">
                See your tech&apos;s live arrival time and track their route progress.
              </p>
            </CardContent>
          </Card>
        </Link>
      </div>
    </div>
  )
}
