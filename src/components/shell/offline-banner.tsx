"use client"

import { useOnlineStatus } from "@/hooks/use-online-status"

/**
 * OfflineBanner — Persistent thin bar indicating offline connectivity.
 *
 * Per user decision: "Offline status: subtle persistent banner (thin colored bar
 * at top/bottom), disappears when back online."
 *
 * Design:
 * - Thin 3px bar fixed at top of viewport
 * - Amber/yellow color: noticeable but not alarming
 *   (techs work without signal regularly — it's normal, per user decision)
 * - Slides in/out smoothly via CSS transition
 * - Shows brief text message on taller bar variant (8px) — visible contextually
 * - Renders nothing (no DOM element) when online
 *
 * Integration: Place this as the first element inside <body> in the root layout.
 * The TooltipProvider wrapper is not needed here (no tooltip on this component).
 */
export function OfflineBanner() {
  const isOnline = useOnlineStatus()

  if (isOnline) {
    // Return nothing when online — no DOM element, not just hidden
    return null
  }

  return (
    <div
      role="status"
      aria-live="polite"
      aria-label="You are offline. Changes will sync when you reconnect."
      className="fixed top-0 left-0 right-0 z-50"
      style={{ height: "4px" }}
    >
      {/* Thin amber bar */}
      <div
        className="h-full w-full bg-amber-400"
        style={{
          animation: "slideInFromTop 0.3s ease-out",
        }}
      />

      {/* Accessible label for screen readers (visually hidden) */}
      <span className="sr-only">
        You&apos;re offline. Changes will sync when you reconnect.
      </span>

      <style>{`
        @keyframes slideInFromTop {
          from { transform: translateY(-100%); opacity: 0; }
          to   { transform: translateY(0);    opacity: 1; }
        }
      `}</style>
    </div>
  )
}
