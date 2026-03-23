import type { Metadata } from "next"
import { redirect } from "next/navigation"
import { getCurrentUser } from "@/actions/auth"
import { ProfileForm } from "@/components/settings/profile-form"

export const metadata: Metadata = {
  title: "Profile",
}

export default async function ProfilePage() {
  const user = await getCurrentUser()

  if (!user) redirect("/login")
  if (user.role === "customer") redirect("/portal")

  return (
    <div className="flex flex-col gap-6 max-w-xl">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Profile</h1>
        <p className="text-muted-foreground text-sm mt-1">
          Manage your personal information.
        </p>
      </div>

      <ProfileForm
        userId={user.id}
        initialName={user.full_name || ""}
        email={user.email}
      />
    </div>
  )
}
