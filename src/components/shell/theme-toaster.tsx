"use client"

import { usePathname } from "next/navigation"
import { Toaster } from "sonner"

/**
 * ThemeToaster — Renders sonner Toaster with theme based on current route.
 *
 * Portal routes (/portal/*) get light theme; all other routes get dark theme.
 * Sonner renders toasts as a direct body child (outside [data-portal]),
 * so CSS variable overrides don't apply — we switch the theme prop instead.
 */
export function ThemeToaster() {
  const pathname = usePathname()
  const isPortal = pathname.startsWith("/portal")

  return (
    <Toaster
      theme={isPortal ? "light" : "dark"}
      position="top-center"
      richColors
    />
  )
}
