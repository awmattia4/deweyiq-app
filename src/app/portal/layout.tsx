import type { Metadata } from "next"

export const metadata: Metadata = {
  title: {
    template: "%s | Customer Portal",
    default: "Customer Portal",
  },
}

/**
 * Portal layout — lighter, customer-facing aesthetic.
 * Distinct from staff app: different header, lighter background.
 * No auth guard in the layout — auth checks go in page components.
 * (portal/login must be accessible unauthenticated)
 *
 * Per user decision: portal shows pool company's own logo and colors.
 * Phase 1: placeholder company branding.
 */
export default function PortalLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <div className="min-h-screen bg-background" data-portal="true">
      {/* Portal header — lighter, customer-friendly */}
      <header className="border-b border-border/40 bg-card/50 backdrop-blur-sm">
        <div className="max-w-screen-lg mx-auto px-4 h-14 flex items-center gap-3">
          {/* Placeholder company logo area */}
          <div className="flex items-center gap-2">
            <div className="w-7 h-7 rounded bg-primary/20 flex items-center justify-center">
              <svg
                viewBox="0 0 24 24"
                fill="none"
                className="w-4 h-4 text-primary"
                aria-hidden="true"
              >
                <path
                  d="M2 12C2 12 5 8 8 8C11 8 13 12 16 12C19 12 22 8 22 8"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                />
              </svg>
            </div>
            <span className="text-sm font-medium text-foreground/80">
              Customer Portal
            </span>
          </div>
        </div>
      </header>

      {/* Page content */}
      <main>{children}</main>
    </div>
  )
}
