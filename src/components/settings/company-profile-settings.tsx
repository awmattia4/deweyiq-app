"use client"

import { useState, useTransition } from "react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { updateOrgName } from "@/actions/company-settings"

// ---------------------------------------------------------------------------
// CompanyProfileSettings
// ---------------------------------------------------------------------------

interface CompanyProfileSettingsProps {
  orgName: string
}

/**
 * CompanyProfileSettings — company name edit field.
 *
 * Placeholder component for full company profile (logo upload, etc. in future phases).
 * Calls updateOrgName server action on save.
 */
export function CompanyProfileSettings({ orgName }: CompanyProfileSettingsProps) {
  const [name, setName] = useState(orgName)
  const [error, setError] = useState<string | null>(null)
  const [saved, setSaved] = useState(false)
  const [isPending, startTransition] = useTransition()

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    setError(null)
    setSaved(false)

    if (!name.trim()) {
      setError("Company name cannot be empty.")
      return
    }

    if (name.trim() === orgName) {
      return
    }

    startTransition(async () => {
      const result = await updateOrgName(name.trim())
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
        <Label htmlFor="company-name">Company name</Label>
        <Input
          id="company-name"
          type="text"
          value={name}
          onChange={(e) => {
            setName(e.target.value)
            setSaved(false)
          }}
          disabled={isPending}
          placeholder="Your company name"
          className="max-w-sm"
        />
        <p className="text-xs text-muted-foreground">
          Shown in service reports and customer emails.
        </p>
      </div>

      {error && (
        <p className="text-sm text-destructive" role="alert">
          {error}
        </p>
      )}

      {saved && (
        <p className="text-sm text-emerald-500">Company name saved.</p>
      )}

      <div className="flex justify-start">
        <Button
          type="submit"
          disabled={isPending || name.trim() === orgName || !name.trim()}
          size="sm"
          className="cursor-pointer"
        >
          {isPending ? "Saving..." : "Save Name"}
        </Button>
      </div>
    </form>
  )
}
