"use client"

import { useState, useTransition } from "react"
import { inviteTeamMember } from "@/actions/invite"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { PlusIcon } from "lucide-react"

type InviteRole = "office" | "tech" | "customer"

/**
 * InviteDialog — opens a dialog for inviting a new team member.
 *
 * Calls the inviteTeamMember server action on submit.
 * Only owners can invite (server action enforces this too).
 */
export function InviteDialog() {
  const [open, setOpen] = useState(false)
  const [email, setEmail] = useState("")
  const [role, setRole] = useState<InviteRole>("tech")
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState(false)
  const [isPending, startTransition] = useTransition()

  function handleOpenChange(next: boolean) {
    if (!next) {
      // Reset form on close
      setEmail("")
      setRole("tech")
      setError(null)
      setSuccess(false)
    }
    setOpen(next)
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError(null)

    if (!email.trim()) {
      setError("Email is required.")
      return
    }

    startTransition(async () => {
      const result = await inviteTeamMember(email.trim(), role)
      if (result.success) {
        setSuccess(true)
      } else {
        setError(result.error ?? "Something went wrong. Please try again.")
      }
    })
  }

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogTrigger asChild>
        <Button size="sm">
          <PlusIcon className="h-4 w-4" aria-hidden="true" />
          Invite Member
        </Button>
      </DialogTrigger>

      <DialogContent className="sm:max-w-sm">
        <DialogHeader>
          <DialogTitle>Invite a Team Member</DialogTitle>
          <DialogDescription>
            They&apos;ll receive an email to set up their account.
          </DialogDescription>
        </DialogHeader>

        {success ? (
          <div className="py-4">
            <p className="text-sm text-emerald-500 font-medium">
              Invite sent to {email}
            </p>
            <p className="text-xs text-muted-foreground mt-1">
              They&apos;ll receive an email with a link to activate their account.
            </p>
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="flex flex-col gap-4">
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="invite-email">Email address</Label>
              <Input
                id="invite-email"
                type="email"
                placeholder="name@example.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                disabled={isPending}
                autoComplete="off"
              />
            </div>

            <div className="flex flex-col gap-1.5">
              <Label htmlFor="invite-role">Role</Label>
              <Select
                value={role}
                onValueChange={(v) => setRole(v as InviteRole)}
                disabled={isPending}
              >
                <SelectTrigger id="invite-role">
                  <SelectValue placeholder="Select a role" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="tech">Technician &mdash; field work</SelectItem>
                  <SelectItem value="office">Office &mdash; admin access</SelectItem>
                  <SelectItem value="customer">Customer &mdash; portal only</SelectItem>
                </SelectContent>
              </Select>
            </div>

            {error && (
              <p className="text-sm text-destructive" role="alert">
                {error}
              </p>
            )}

            <DialogFooter>
              <Button
                type="button"
                variant="outline"
                onClick={() => handleOpenChange(false)}
                disabled={isPending}
              >
                Cancel
              </Button>
              <Button type="submit" disabled={isPending || !email.trim()}>
                {isPending ? "Sending..." : "Send Invite"}
              </Button>
            </DialogFooter>
          </form>
        )}

        {success && (
          <DialogFooter>
            <Button onClick={() => handleOpenChange(false)}>Done</Button>
          </DialogFooter>
        )}
      </DialogContent>
    </Dialog>
  )
}
