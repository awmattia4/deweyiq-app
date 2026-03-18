"use client"

/**
 * PwaInstallPrompt — Non-intrusive PWA install banner.
 *
 * Phase 10: Smart Features / Notifications — Plan 17
 *
 * Behavior:
 * - Does NOT show if already installed (standalone display mode)
 * - Does NOT show if snoozed within the last 7 days (localStorage)
 * - Shows browser-native install prompt on Chrome/Edge (beforeinstallprompt)
 * - Shows step-by-step iOS manual instructions on Safari/iPhone/iPad
 * - "Not now" snoozes for 7 days
 *
 * Renders null when not applicable. No user input required to hide it —
 * it always renders inside the app layout but is invisible until conditions met.
 */

import { useState, useEffect } from "react"
import { X, Share, PlusSquare } from "lucide-react"
import { Button } from "@/components/ui/button"

// Number of milliseconds in 7 days
const SNOOZE_DURATION_MS = 7 * 24 * 60 * 60 * 1000
const SNOOZE_KEY = "pwa-install-snoozed"

// BeforeInstallPromptEvent is not in TypeScript's lib — define minimal interface
interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>
}

function isSnoozed(): boolean {
  try {
    const snoozedAt = localStorage.getItem(SNOOZE_KEY)
    if (!snoozedAt) return false
    return Date.now() - parseInt(snoozedAt, 10) < SNOOZE_DURATION_MS
  } catch {
    return false
  }
}

export function PwaInstallPrompt() {
  const [show, setShow] = useState(false)
  const [isIos, setIsIos] = useState(false)
  const [deferredPrompt, setDeferredPrompt] = useState<BeforeInstallPromptEvent | null>(null)
  const [mounted, setMounted] = useState(false)

  useEffect(() => {
    setMounted(true)

    // 1. Already installed in standalone mode — don't show
    if (window.matchMedia("(display-mode: standalone)").matches) return

    // 2. Snoozed within 7 days — don't show
    if (isSnoozed()) return

    // 3. iOS detection
    const iosDevice = /iPad|iPhone|iPod/.test(navigator.userAgent)
    setIsIos(iosDevice)

    if (iosDevice) {
      // iOS doesn't support beforeinstallprompt — show manual instructions
      setShow(true)
      return
    }

    // 4. Non-iOS: listen for the browser's native install prompt
    const handler = (e: Event) => {
      e.preventDefault()
      // Re-check snooze — event can fire after a previous dismissal
      if (isSnoozed()) return
      setDeferredPrompt(e as BeforeInstallPromptEvent)
      setShow(true)
    }

    window.addEventListener("beforeinstallprompt", handler)

    return () => {
      window.removeEventListener("beforeinstallprompt", handler)
    }
  }, [])

  function handleInstall() {
    if (!deferredPrompt) return
    void deferredPrompt.prompt()
    deferredPrompt.userChoice.then((choice) => {
      if (choice.outcome === "accepted") {
        setShow(false)
      }
      setDeferredPrompt(null)
    })
  }

  function handleSnooze() {
    localStorage.setItem(SNOOZE_KEY, String(Date.now()))
    setShow(false)
  }

  // Don't render anything before hydration, when not needed, or when snoozed
  if (!mounted || !show) return null
  // Belt-and-suspenders: re-check snooze at render time in case state got stale
  if (typeof window !== "undefined" && isSnoozed()) return null

  return (
    <div className="fixed bottom-4 left-4 right-4 z-50 mx-auto max-w-sm rounded-xl border border-border bg-card p-4 shadow-xl">
      <div className="flex items-start justify-between gap-3">
        <div className="flex-1">
          <p className="text-sm font-semibold leading-tight">Install DeweyIQ</p>
          <p className="mt-0.5 text-xs text-muted-foreground">
            Works offline, faster access, push notifications
          </p>

          {isIos ? (
            <div className="mt-3 space-y-1.5 text-xs text-muted-foreground">
              <p className="font-medium text-foreground">To install on iPhone / iPad:</p>
              <div className="flex items-center gap-1.5">
                <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded bg-muted">
                  <span className="text-[10px] font-bold">1</span>
                </span>
                <span>
                  Tap the{" "}
                  <Share className="mb-0.5 inline-block h-3.5 w-3.5" aria-hidden="true" /> Share
                  button in Safari
                </span>
              </div>
              <div className="flex items-center gap-1.5">
                <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded bg-muted">
                  <span className="text-[10px] font-bold">2</span>
                </span>
                <span>
                  Choose{" "}
                  <PlusSquare className="mb-0.5 inline-block h-3.5 w-3.5" aria-hidden="true" />{" "}
                  &ldquo;Add to Home Screen&rdquo;
                </span>
              </div>
              <div className="flex items-center gap-1.5">
                <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded bg-muted">
                  <span className="text-[10px] font-bold">3</span>
                </span>
                <span>Tap &ldquo;Add&rdquo; to confirm</span>
              </div>
            </div>
          ) : (
            <Button
              size="sm"
              className="mt-3"
              onClick={handleInstall}
            >
              Install app
            </Button>
          )}
        </div>

        <button
          onClick={handleSnooze}
          className="mt-0.5 shrink-0 rounded-sm text-muted-foreground hover:text-foreground cursor-pointer"
          aria-label="Dismiss install prompt"
        >
          <X className="h-4 w-4" aria-hidden="true" />
        </button>
      </div>

      {/* "Not now" link below content */}
      <button
        onClick={handleSnooze}
        className="mt-2 text-xs text-muted-foreground hover:text-foreground cursor-pointer"
      >
        Not now
      </button>
    </div>
  )
}
