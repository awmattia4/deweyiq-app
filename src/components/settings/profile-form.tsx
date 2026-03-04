"use client"

import { useState, useTransition } from "react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { updateProfile } from "@/actions/profile"

interface ProfileFormProps {
  userId: string
  initialName: string
  email: string
}

/**
 * ProfileForm — inline editable profile for the settings page.
 *
 * Calls the updateProfile server action on submit.
 * Phase 1: full_name editing only.
 */
export function ProfileForm({ userId, initialName, email }: ProfileFormProps) {
  const [name, setName] = useState(initialName)
  const [error, setError] = useState<string | null>(null)
  const [saved, setSaved] = useState(false)
  const [isPending, startTransition] = useTransition()

  void userId // will be used when updateProfile takes userId param

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError(null)
    setSaved(false)

    if (!name.trim()) {
      setError("Name is required.")
      return
    }

    startTransition(async () => {
      const result = await updateProfile({ full_name: name.trim() })
      if (result.success) {
        setSaved(true)
      } else {
        setError(result.error ?? "Failed to save. Please try again.")
      }
    })
  }

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-4">
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="profile-name">Full name</Label>
        <Input
          id="profile-name"
          type="text"
          value={name}
          onChange={(e) => {
            setName(e.target.value)
            setSaved(false)
          }}
          disabled={isPending}
          placeholder="Your full name"
        />
      </div>

      <div className="flex flex-col gap-1.5">
        <Label htmlFor="profile-email">Email</Label>
        <Input
          id="profile-email"
          type="email"
          value={email}
          disabled
          className="cursor-not-allowed"
        />
        <p className="text-xs text-muted-foreground">
          Email changes require contacting support.
        </p>
      </div>

      {error && (
        <p className="text-sm text-destructive" role="alert">
          {error}
        </p>
      )}

      {saved && (
        <p className="text-sm text-emerald-500">Profile saved.</p>
      )}

      <div className="flex justify-start">
        <Button
          type="submit"
          disabled={isPending || name.trim() === initialName}
          size="sm"
        >
          {isPending ? "Saving..." : "Save Changes"}
        </Button>
      </div>
    </form>
  )
}
