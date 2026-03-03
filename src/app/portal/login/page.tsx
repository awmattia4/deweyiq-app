"use client"

import { useState } from "react"
import Link from "next/link"
import { useRouter } from "next/navigation"
import { createClient } from "@/lib/supabase/client"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Alert, AlertDescription } from "@/components/ui/alert"

/**
 * Customer portal login page at /portal/login.
 *
 * Per user decision: "separate portal login page (/portal/login) with company branding."
 * - No signup (customers are invited by the pool company)
 * - No Google OAuth (staff-only feature)
 * - Lighter, more customer-friendly styling
 * - Placeholder for company branding (will be replaced with owner's branding in Phase 8)
 */
export default function PortalLoginPage() {
  const router = useRouter()
  const [email, setEmail] = useState("")
  const [password, setPassword] = useState("")
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError(null)
    setLoading(true)

    try {
      const supabase = createClient()
      const { error: signInError } = await supabase.auth.signInWithPassword({
        email,
        password,
      })

      if (signInError) {
        if (signInError.message.includes("Invalid login credentials")) {
          setError("Invalid email or password. Please contact your pool service company for access.")
        } else if (signInError.message.includes("Email not confirmed")) {
          setError("Please check your email and click the activation link before signing in.")
        } else {
          setError(signInError.message)
        }
        return
      }

      // Redirect to customer portal home (built in Phase 8)
      router.push("/portal")
      router.refresh()
    } catch {
      setError("An unexpected error occurred. Please try again.")
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="min-h-[calc(100vh-3.5rem)] flex flex-col items-center justify-center p-4">
      {/* Company branding area — placeholder for Phase 8 white-labeling */}
      <div className="mb-8 flex flex-col items-center gap-1 text-center">
        <div className="w-12 h-12 rounded-xl bg-primary/10 border border-primary/20 flex items-center justify-center mb-2">
          <svg
            viewBox="0 0 24 24"
            fill="none"
            className="w-6 h-6 text-primary"
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
        <h1 className="text-xl font-semibold text-foreground">Your Pool Portal</h1>
        <p className="text-sm text-muted-foreground">
          View your pool status, history, and service reports
        </p>
      </div>

      <div className="w-full max-w-sm">
        <Card>
          <CardHeader>
            <CardTitle className="text-lg">Sign in to your portal</CardTitle>
            <CardDescription>
              Use the credentials from your welcome email.
            </CardDescription>
          </CardHeader>
          <form onSubmit={handleSubmit}>
            <CardContent className="space-y-4">
              {error && (
                <Alert variant="destructive">
                  <AlertDescription>{error}</AlertDescription>
                </Alert>
              )}

              <div className="space-y-2">
                <Label htmlFor="email">Email</Label>
                <Input
                  id="email"
                  type="email"
                  placeholder="your@email.com"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  required
                  autoComplete="email"
                  disabled={loading}
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="password">Password</Label>
                <Input
                  id="password"
                  type="password"
                  placeholder="••••••••"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  required
                  autoComplete="current-password"
                  disabled={loading}
                />
              </div>
            </CardContent>
            <CardFooter className="flex flex-col gap-3">
              <Button type="submit" className="w-full" disabled={loading}>
                {loading ? "Signing in..." : "Sign in"}
              </Button>
              <Link
                href="/reset-password"
                className="text-xs text-muted-foreground hover:text-primary transition-colors text-center"
              >
                Forgot your password?
              </Link>
            </CardFooter>
          </form>
        </Card>

        <p className="mt-6 text-center text-xs text-muted-foreground">
          Don&apos;t have an account?{" "}
          <span className="text-foreground/60">
            Contact your pool service company to get access.
          </span>
        </p>
      </div>
    </div>
  )
}
