import type { Metadata } from "next"
import { redirect } from "next/navigation"
import { getCurrentUser } from "@/actions/auth"
import { withRls } from "@/lib/db"
import { profiles } from "@/lib/db/schema"
import { eq, asc } from "drizzle-orm"
import { createClient } from "@/lib/supabase/server"
import { Badge } from "@/components/ui/badge"
import { InviteDialog } from "@/components/team/invite-dialog"
import { UsersIcon } from "lucide-react"

export const metadata: Metadata = {
  title: "Team",
}

/**
 * Team — Lists all org members from the profiles table.
 *
 * Real data: queries profiles for all members in the current user's org.
 * Only accessible to owner and office roles.
 * Invite button calls the inviteTeamMember server action via InviteDialog.
 */
export default async function TeamPage() {
  const user = await getCurrentUser()

  if (!user) redirect("/login")
  if (user.role === "tech") redirect("/routes")
  if (user.role === "customer") redirect("/portal")

  // Fetch all team members in the org
  let members: Array<{
    id: string
    full_name: string
    email: string
    role: string
    created_at: Date
  }> = []

  try {
    const supabase = await createClient()
    const { data: claimsData } = await supabase.auth.getClaims()

    if (claimsData?.claims) {
      const token = claimsData.claims as Parameters<typeof withRls>[0]
      members = await withRls(token, (db) =>
        db
          .select({
            id: profiles.id,
            full_name: profiles.full_name,
            email: profiles.email,
            role: profiles.role,
            created_at: profiles.created_at,
          })
          .from(profiles)
          .where(eq(profiles.org_id, user.org_id))
          .orderBy(asc(profiles.created_at))
      )
    }
  } catch (err) {
    console.error("[TeamPage] Failed to fetch team members:", err)
  }

  return (
    <div className="flex flex-col gap-6">
      {/* ── Page header ──────────────────────────────────────────────────── */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Team</h1>
          <p className="text-muted-foreground text-sm mt-1">
            {members.length} {members.length === 1 ? "member" : "members"} in your organization
          </p>
        </div>
        {/* Only owners can invite team members (server action enforces this too) */}
        {user.role === "owner" && <InviteDialog />}
      </div>

      {/* ── Member list ──────────────────────────────────────────────────── */}
      {members.length === 0 ? (
        <div className="flex flex-col items-center justify-center rounded-xl border border-dashed border-border/60 p-12 text-center gap-4">
          <div className="flex h-12 w-12 items-center justify-center rounded-full bg-muted">
            <UsersIcon className="h-6 w-6 text-muted-foreground" aria-hidden="true" />
          </div>
          <div className="flex flex-col gap-1 max-w-sm">
            <p className="font-medium text-sm">No team members yet</p>
            <p className="text-sm text-muted-foreground">
              Invite your first team member to get started.
            </p>
          </div>
        </div>
      ) : (
        <div className="rounded-xl border border-border overflow-hidden">
          <div className="divide-y divide-border">
            {members.map((member) => (
              <div
                key={member.id}
                className="flex items-center gap-4 px-4 py-3 hover:bg-muted/40 transition-colors"
              >
                {/* Avatar placeholder */}
                <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-primary/15 text-primary text-sm font-semibold">
                  {getInitials(member.full_name || member.email)}
                </div>

                {/* Member details */}
                <div className="flex flex-1 flex-col gap-0.5 min-w-0">
                  <p className="text-sm font-medium truncate">
                    {member.full_name || member.email}
                    {member.id === user.id && (
                      <span className="text-muted-foreground font-normal ml-1.5">
                        (you)
                      </span>
                    )}
                  </p>
                  <p className="text-xs text-muted-foreground truncate">
                    {member.email}
                  </p>
                </div>

                {/* Role badge + joined date */}
                <div className="flex flex-col items-end gap-1 shrink-0">
                  <Badge
                    variant="outline"
                    className={getRoleBadgeClass(member.role)}
                  >
                    {getRoleLabel(member.role)}
                  </Badge>
                  <p className="text-xs text-muted-foreground">
                    Joined {formatDate(member.created_at)}
                  </p>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function getInitials(name: string): string {
  return name
    .split(" ")
    .map((n) => n[0])
    .join("")
    .toUpperCase()
    .slice(0, 2)
}

function getRoleLabel(role: string): string {
  switch (role) {
    case "owner":
      return "Owner"
    case "office":
      return "Office"
    case "tech":
      return "Technician"
    case "customer":
      return "Customer"
    default:
      return role
  }
}

function getRoleBadgeClass(role: string): string {
  switch (role) {
    case "owner":
      return "border-amber-500/40 text-amber-400"
    case "office":
      return "border-sky-500/40 text-sky-400"
    case "tech":
      return "border-teal-500/40 text-teal-400"
    case "customer":
      return "border-violet-500/40 text-violet-400"
    default:
      return ""
  }
}

function formatDate(date: Date): string {
  return new Date(date).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  })
}
