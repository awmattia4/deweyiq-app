import type { Metadata } from "next"
import { redirect } from "next/navigation"
import { getCurrentUser } from "@/actions/auth"
import { resolveCustomerId, getOrgBranding } from "@/actions/portal-data"
import { getMessages, markAsRead } from "@/actions/portal-messages"
import { MessageThread } from "@/components/portal/message-thread"

export const metadata: Metadata = {
  title: "Messages",
}

/**
 * Portal Messages Page — Customer-facing chat thread.
 *
 * Server component:
 * 1. Loads the initial message history
 * 2. Marks any unread office messages as read (customer opened thread)
 * 3. Passes initial data to MessageThread client component for real-time hydration
 */
export default async function PortalMessagesPage() {
  const user = await getCurrentUser()
  if (!user) redirect("/portal/login")
  if (user.role !== "customer") redirect("/dashboard")

  const [customerId, branding] = await Promise.all([
    resolveCustomerId(user.org_id, user.email),
    getOrgBranding(user.org_id),
  ])

  if (!customerId) {
    return (
      <div className="flex flex-col items-center justify-center py-20 text-center">
        <p className="text-sm text-muted-foreground">
          Your account is still being set up. Check back shortly.
        </p>
      </div>
    )
  }

  const companyName = branding?.name ?? "Your Pool Company"

  // Load initial messages and mark office messages as read in parallel
  const [initialMessages] = await Promise.all([
    getMessages(user.org_id, customerId),
    markAsRead(user.org_id, customerId, "customer"),
  ])

  const senderName = user.full_name || user.email

  return (
    <div className="flex flex-col gap-4">
      {/* ── Page header ────────────────────────────────────────────────── */}
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Messages</h1>
        <p className="text-sm text-muted-foreground mt-0.5">
          Chat with {companyName}
        </p>
      </div>

      {/* ── Chat thread ────────────────────────────────────────────────── */}
      <div
        className="rounded-xl border border-border/60 bg-card overflow-hidden"
        style={{ height: "calc(100vh - 240px)", minHeight: "400px" }}
      >
        <MessageThread
          customerId={customerId}
          orgId={user.org_id}
          initialMessages={initialMessages}
          senderName={senderName}
          senderRole="customer"
        />
      </div>
    </div>
  )
}
