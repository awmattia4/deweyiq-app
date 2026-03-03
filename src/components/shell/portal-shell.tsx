import type { AuthUser } from "@/actions/auth"

interface PortalShellProps {
  user: AuthUser
  children: React.ReactNode
}

/**
 * PortalShell — Customer-facing shell for the /portal/* routes.
 *
 * Simpler than the staff shell: no sidebar, just header + content area.
 * Customers do not need a sidebar — their portal is a single-section view.
 *
 * Per user decision: "customer portal shows the pool company's own logo
 * and colors." Phase 1 uses placeholder branding. In future phases, the
 * company logo and brand colors will load from org settings.
 *
 * Header navigation links (Service History, Invoices, Messages) are stubbed
 * and link to their respective Phase 8 routes. They are shown as visible
 * placeholders so the portal feels intentional, not half-built.
 *
 * Design: lighter aesthetic than the staff app — white/light card background,
 * softer borders. Distinct from the staff shell intentionally.
 */
export function PortalShell({ children }: PortalShellProps) {
  return (
    <div className="min-h-screen bg-background" data-portal="true">
      {/* ── Portal header ──────────────────────────────────────────────── */}
      <header className="sticky top-0 z-30 border-b border-border/40 bg-card/80 backdrop-blur-sm">
        <div className="max-w-screen-lg mx-auto px-4 h-14 flex items-center justify-between gap-4">
          {/* Company logo placeholder — replaced with org branding in Phase 8 */}
          <div className="flex items-center gap-2.5">
            <div className="flex h-8 w-8 items-center justify-center rounded-md bg-primary/10">
              <svg
                viewBox="0 0 24 24"
                fill="none"
                className="h-4 w-4 text-primary"
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
            <div className="flex flex-col">
              <span className="text-sm font-semibold text-foreground leading-tight">
                {/* TODO(Phase 8): Replace with org.name from org settings */}
                Your Pool Company
              </span>
              <span className="text-[10px] text-muted-foreground leading-tight">
                Customer Portal
              </span>
            </div>
          </div>

          {/* Portal navigation — stubbed links for Phase 8 routes */}
          <nav
            className="hidden sm:flex items-center gap-1"
            aria-label="Portal navigation"
          >
            {/*
              Phase 8 nav items — shown as disabled placeholder links.
              Enable these when their Phase 8 routes exist.
              Keeping them visible (not hidden) so the portal looks complete.
            */}
            <span className="px-3 py-1.5 text-sm text-muted-foreground/60 cursor-not-allowed select-none rounded-md">
              Service History
            </span>
            <span className="px-3 py-1.5 text-sm text-muted-foreground/60 cursor-not-allowed select-none rounded-md">
              Invoices
            </span>
            <span className="px-3 py-1.5 text-sm text-muted-foreground/60 cursor-not-allowed select-none rounded-md">
              Messages
            </span>
          </nav>
        </div>
      </header>

      {/* ── Page content ───────────────────────────────────────────────── */}
      <main className="max-w-screen-lg mx-auto px-4 py-6">{children}</main>

      {/* ── Footer ─────────────────────────────────────────────────────── */}
      <footer className="border-t border-border/40 mt-auto">
        <div className="max-w-screen-lg mx-auto px-4 py-4">
          <p className="text-xs text-muted-foreground text-center">
            Powered by{" "}
            <span className="text-primary font-medium">PoolCo</span>
          </p>
        </div>
      </footer>
    </div>
  )
}
