import type { Metadata } from "next"
import { redirect } from "next/navigation"
import { getCurrentUser } from "@/actions/auth"
import { getInboxThreads } from "@/actions/portal-messages"
import { InboxClientShell } from "./inbox-client-shell"

export const metadata: Metadata = {
  title: "Messages",
}

/**
 * Office Inbox Page — server component.
 *
 * Auth: owner + office only. Techs redirected.
 * Loads all customer message threads and renders the two-panel inbox.
 */
export default async function InboxPage() {
  const user = await getCurrentUser()
  if (!user) redirect("/login")
  if (user.role === "tech") redirect("/routes")
  if (user.role === "customer") redirect("/portal")

  const threads = await getInboxThreads(user.org_id)

  return (
    <div className="flex flex-col gap-6">
      <h1 className="text-2xl font-bold tracking-tight">Messages</h1>

      <InboxClientShell
        threads={threads}
        orgId={user.org_id}
        senderName={user.full_name || user.email}
      />
    </div>
  )
}
