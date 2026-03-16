"use client"

/**
 * PushPermissionPrompt — Non-intrusive push notification permission banner.
 *
 * Phase 10: Smart Features / Notifications — Plan 17
 *
 * Behavior:
 * - Does NOT show if Notification.permission === 'granted' (already subscribed)
 * - Does NOT show if Notification.permission === 'denied' (blocked; show message in Settings)
 * - Does NOT show if snoozed within last 24 hours (localStorage)
 * - Does NOT show on iOS unless in standalone PWA mode (push only works installed on iOS)
 * - "Enable" button calls subscribeToPush() which triggers the browser permission dialog
 * - "Not now" snoozes for 24 hours
 * - Shows success state on successful subscription
 *
 * Renders null when not applicable. Self-dismissing.
 */

import { useState, useEffect } from "react"
import { Bell } from "lucide-react"
import { Button } from "@/components/ui/button"
import { subscribeToPush } from "@/lib/push/subscribe"
import { toast } from "sonner"

const SNOOZE_KEY = "push-permission-snoozed"
const SNOOZE_DURATION_MS = 24 * 60 * 60 * 1000 // 24 hours

export function PushPermissionPrompt() {
  const [show, setShow] = useState(false)
  const [loading, setLoading] = useState(false)
  const [mounted, setMounted] = useState(false)

  useEffect(() => {
    setMounted(true)

    // 1. Browser must support notifications
    if (!("Notification" in window)) return
    if (!("serviceWorker" in navigator) || !("PushManager" in window)) return

    // 2. Already granted — no need to prompt
    if (Notification.permission === "granted") return

    // 3. Blocked — can't prompt (show message in Settings instead)
    if (Notification.permission === "denied") return

    // 4. iOS: push only works in installed PWA mode
    const isIos = /iPad|iPhone|iPod/.test(navigator.userAgent)
    if (isIos && !window.matchMedia("(display-mode: standalone)").matches) return

    // 5. Snoozed within 24 hours
    const snoozedAt = localStorage.getItem(SNOOZE_KEY)
    if (snoozedAt) {
      const elapsed = Date.now() - parseInt(snoozedAt, 10)
      if (elapsed < SNOOZE_DURATION_MS) return
    }

    // 6. Show the prompt
    setShow(true)
  }, [])

  async function handleEnable() {
    setLoading(true)
    try {
      const result = await subscribeToPush()
      if (result.success) {
        setShow(false)
        toast.success("Push notifications enabled")
      } else {
        toast.error(result.error ?? "Could not enable push notifications")
        // If permission denied, don't show the prompt again
        if (typeof Notification !== "undefined" && Notification.permission === "denied") {
          setShow(false)
        }
      }
    } catch {
      toast.error("Could not enable push notifications")
    } finally {
      setLoading(false)
    }
  }

  function handleSnooze() {
    localStorage.setItem(SNOOZE_KEY, String(Date.now()))
    setShow(false)
  }

  if (!mounted || !show) return null

  return (
    <div className="fixed bottom-20 left-4 right-4 z-40 mx-auto max-w-sm rounded-xl border border-border bg-card p-4 shadow-xl">
      <div className="flex items-start gap-3">
        <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-primary/10">
          <Bell className="h-4 w-4 text-primary" aria-hidden="true" />
        </div>

        <div className="flex-1">
          <p className="text-sm font-semibold leading-tight">Enable push notifications</p>
          <p className="mt-1 text-xs text-muted-foreground">
            Get notified when stops are completed, new work orders come in, customers message
            you, payments arrive, and more.
          </p>

          <div className="mt-3 flex items-center gap-2">
            <Button
              size="sm"
              onClick={handleEnable}
              disabled={loading}
            >
              {loading ? "Enabling..." : "Enable"}
            </Button>
            <button
              onClick={handleSnooze}
              className="text-xs text-muted-foreground hover:text-foreground cursor-pointer"
            >
              Not now
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
