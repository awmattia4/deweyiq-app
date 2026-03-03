import type { Metadata } from "next"

export const metadata: Metadata = {
  title: {
    template: "%s | PoolCo",
    default: "PoolCo",
  },
}

/**
 * Auth layout — centered card on deep navy background.
 * No auth guard; these routes are public by design.
 */
export default function AuthLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <div className="min-h-screen bg-background flex flex-col items-center justify-center p-4">
      {/* Brand header */}
      <div className="mb-8 flex flex-col items-center gap-2">
        <div className="flex items-center gap-2">
          {/* PoolCo logo mark — stylized pool icon */}
          <div className="w-9 h-9 rounded-lg bg-primary flex items-center justify-center">
            <svg
              viewBox="0 0 24 24"
              fill="none"
              className="w-5 h-5 text-primary-foreground"
              aria-hidden="true"
            >
              <path
                d="M2 12C2 12 5 8 8 8C11 8 13 12 16 12C19 12 22 8 22 8"
                stroke="currentColor"
                strokeWidth="2.5"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
              <path
                d="M2 17C2 17 5 13 8 13C11 13 13 17 16 17C19 17 22 13 22 13"
                stroke="currentColor"
                strokeWidth="2.5"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </svg>
          </div>
          <span className="text-xl font-semibold tracking-tight text-foreground">
            PoolCo
          </span>
        </div>
        <p className="text-xs text-muted-foreground">Pool Service Management</p>
      </div>

      {/* Page content (card) */}
      <div className="w-full max-w-sm">{children}</div>
    </div>
  )
}
