"use client"

import { useState } from "react"
import { useSearchParams } from "next/navigation"
import { sendMagicLink } from "@/actions/portal-auth"
import { Button } from "@/components/ui/button"
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Alert, AlertDescription } from "@/components/ui/alert"
import type { OrgBranding } from "@/actions/portal-data"

interface PortalLoginFormProps {
  branding: OrgBranding | null
}

/**
 * PortalLoginForm — Magic link login form for the customer portal.
 *
 * Replaces the Phase 1 password form with a magic link flow:
 * 1. Customer enters email
 * 2. Magic link is sent (always returns success to prevent enumeration)
 * 3. Form swaps to confirmation state
 * 4. Customer clicks link in email → /auth/portal-callback → /portal
 */
export function PortalLoginForm({ branding }: PortalLoginFormProps) {
  const searchParams = useSearchParams()
  const hasError = searchParams.get("error") === "invalid_link"

  const [email, setEmail] = useState("")
  const [loading, setLoading] = useState(false)
  const [submitted, setSubmitted] = useState(false)

  const companyName = branding?.name ?? "Your Pool Company"
  const logoUrl = branding?.logoUrl ?? null
  const brandColor = branding?.brandColor ?? null

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!email.trim()) return

    setLoading(true)
    try {
      await sendMagicLink(email.trim())
      setSubmitted(true)
    } catch {
      // sendMagicLink never throws — this is a safety catch
      setSubmitted(true)
    } finally {
      setLoading(false)
    }
  }

  return (
    <div
      data-portal="true"
      className="min-h-screen flex flex-col items-center justify-center p-4 bg-background text-foreground"
      style={brandColor ? ({ "--portal-primary": brandColor } as React.CSSProperties) : undefined}
    >
      {/* Company branding area */}
      <div className="mb-8 flex flex-col items-center gap-1 text-center">
        <div className="w-14 h-14 rounded-xl bg-primary/10 border border-primary/20 flex items-center justify-center mb-2 overflow-hidden">
          {logoUrl ? (
            <img
              src={logoUrl}
              alt={`${companyName} logo`}
              className="w-full h-full object-contain"
            />
          ) : (
            <svg
              viewBox="0 0 24 24"
              fill="none"
              className="w-7 h-7 text-primary"
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
          )}
        </div>
        <h1 className="text-xl font-semibold text-foreground">{companyName}</h1>
        <p className="text-sm text-muted-foreground">Customer Portal</p>
      </div>

      <div className="w-full max-w-sm">
        {hasError && (
          <Alert variant="destructive" className="mb-4">
            <AlertDescription>
              This link has expired or is invalid. Please request a new one below.
            </AlertDescription>
          </Alert>
        )}

        <Card>
          {submitted ? (
            <>
              <CardHeader>
                <CardTitle className="text-lg">Check your email</CardTitle>
                <CardDescription>
                  We sent a sign-in link to <strong>{email}</strong>
                </CardDescription>
              </CardHeader>
              <CardContent>
                <p className="text-sm text-muted-foreground">
                  Click the link in the email to sign in. The link expires in 1 hour.
                </p>
                <p className="text-sm text-muted-foreground mt-3">
                  Didn&apos;t get it? Check your spam folder or{" "}
                  <button
                    type="button"
                    className="text-primary hover:underline cursor-pointer"
                    onClick={() => {
                      setSubmitted(false)
                      setEmail("")
                    }}
                  >
                    try a different email
                  </button>
                  .
                </p>
              </CardContent>
            </>
          ) : (
            <>
              <CardHeader>
                <CardTitle className="text-lg">Sign in to your portal</CardTitle>
                <CardDescription>
                  Enter your email to receive a one-time sign-in link.
                </CardDescription>
              </CardHeader>
              <form onSubmit={handleSubmit}>
                <CardContent className="space-y-4">
                  <div className="space-y-2">
                    <Label htmlFor="email">Email address</Label>
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
                </CardContent>
                <CardFooter>
                  <Button
                    type="submit"
                    className="w-full"
                    disabled={loading || !email.trim()}
                  >
                    {loading ? "Sending link..." : "Send sign-in link"}
                  </Button>
                </CardFooter>
              </form>
            </>
          )}
        </Card>

        <p className="mt-6 text-center text-xs text-muted-foreground">
          Don&apos;t have access?{" "}
          <span className="text-foreground/60">
            Contact your pool service company.
          </span>
        </p>
      </div>
    </div>
  )
}
