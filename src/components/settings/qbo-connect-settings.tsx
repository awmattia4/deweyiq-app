"use client"

import { useState, useEffect, useTransition } from "react"
import { useSearchParams } from "next/navigation"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { toast } from "sonner"
import { Loader2Icon } from "lucide-react"
import { disconnectQbo } from "@/actions/qbo-sync"

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface QboConnectionStatus {
  connected: boolean
  realmId: string | null
  lastSyncAt: Date | null
}

interface QboConnectSettingsProps {
  initialStatus: QboConnectionStatus
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function QboConnectSettings({ initialStatus }: QboConnectSettingsProps) {
  const [status, setStatus] = useState(initialStatus)
  const [isPending, startTransition] = useTransition()
  const [showConfirm, setShowConfirm] = useState(false)
  const searchParams = useSearchParams()

  // Handle redirect params from OAuth callback
  useEffect(() => {
    const qboParam = searchParams.get("qbo")
    if (!qboParam) return

    switch (qboParam) {
      case "success":
        toast.success("QuickBooks Online connected successfully")
        setStatus((prev) => ({ ...prev, connected: true }))
        break
      case "error": {
        const reason = searchParams.get("reason")
        const messages: Record<string, string> = {
          auth: "You must be logged in to connect QuickBooks.",
          permission: "Only account owners can connect QuickBooks.",
          state: "Authorization failed. Please try again.",
          denied: "QuickBooks authorization was denied.",
          no_realm: "No QuickBooks company was selected.",
          exchange: "Failed to complete QuickBooks authorization.",
        }
        toast.error(messages[reason ?? ""] ?? "Failed to connect QuickBooks.")
        break
      }
    }

    // Clean URL params without page reload
    const url = new URL(window.location.href)
    url.searchParams.delete("qbo")
    url.searchParams.delete("reason")
    window.history.replaceState({}, "", url.toString())
  }, [searchParams])

  function handleConnect() {
    // Navigate to authorize endpoint -- it returns a redirect
    window.location.href = "/api/connect/qbo/authorize"
  }

  function handleDisconnect() {
    startTransition(async () => {
      const result = await disconnectQbo()
      if (result.success) {
        toast.success("QuickBooks Online disconnected")
        setStatus({ connected: false, realmId: null, lastSyncAt: null })
        setShowConfirm(false)
      } else {
        toast.error(result.error ?? "Failed to disconnect")
      }
    })
  }

  // Not connected
  if (!status.connected) {
    return (
      <div className="flex flex-col gap-4">
        <div className="flex items-center gap-2">
          <Badge variant="outline" className="text-muted-foreground">
            Not Connected
          </Badge>
        </div>
        <p className="text-sm text-muted-foreground">
          Connect your QuickBooks Online account to automatically sync invoices,
          payments, and customers. PoolCo is the source of truth -- changes sync
          one-way to QBO, with inbound payment notifications pulled in via webhook.
        </p>
        <div>
          <Button
            onClick={handleConnect}
            size="sm"
            className="cursor-pointer"
          >
            Connect QuickBooks Online
          </Button>
        </div>
      </div>
    )
  }

  // Connected
  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center gap-2">
        <Badge variant="outline" className="text-green-500 border-green-500/30">
          Connected
        </Badge>
      </div>
      <div className="flex flex-col gap-2 text-sm">
        {status.realmId && (
          <div className="flex items-center justify-between">
            <span className="text-muted-foreground">Company ID</span>
            <span className="font-medium font-mono text-xs">{status.realmId}</span>
          </div>
        )}
        {status.lastSyncAt && (
          <div className="flex items-center justify-between">
            <span className="text-muted-foreground">Last Sync</span>
            <span className="font-medium">
              {new Date(status.lastSyncAt).toLocaleString()}
            </span>
          </div>
        )}
      </div>

      {showConfirm ? (
        <div className="flex flex-col gap-2 p-3 rounded-md border border-destructive/30 bg-destructive/5">
          <p className="text-sm text-muted-foreground">
            Disconnecting will stop all sync between PoolCo and QuickBooks Online.
            Existing data in QBO will not be deleted.
          </p>
          <div className="flex items-center gap-2">
            <Button
              onClick={handleDisconnect}
              disabled={isPending}
              variant="destructive"
              size="sm"
              className="cursor-pointer"
            >
              {isPending && (
                <Loader2Icon className="h-4 w-4 animate-spin" aria-hidden="true" />
              )}
              Confirm Disconnect
            </Button>
            <Button
              onClick={() => setShowConfirm(false)}
              variant="outline"
              size="sm"
              className="cursor-pointer"
            >
              Cancel
            </Button>
          </div>
        </div>
      ) : (
        <div>
          <Button
            onClick={() => setShowConfirm(true)}
            variant="outline"
            size="sm"
            className="text-destructive hover:text-destructive hover:bg-destructive/10 border-destructive/30 cursor-pointer"
          >
            Disconnect QuickBooks
          </Button>
        </div>
      )}
    </div>
  )
}
