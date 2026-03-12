"use client"

import { useState, useEffect } from "react"
import { useSearchParams } from "next/navigation"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { toast } from "sonner"
import { Loader2Icon, ExternalLinkIcon } from "lucide-react"
import type { StripeAccountStatus } from "@/actions/stripe-connect"

interface StripeConnectSettingsProps {
  initialStatus: StripeAccountStatus
}

export function StripeConnectSettings({ initialStatus }: StripeConnectSettingsProps) {
  const [status, setStatus] = useState(initialStatus)
  const [loading, setLoading] = useState(false)
  const searchParams = useSearchParams()

  // Show toasts based on Stripe redirect params
  useEffect(() => {
    const stripeParam = searchParams.get("stripe")
    if (!stripeParam) return

    switch (stripeParam) {
      case "success":
        toast.success("Stripe account connected successfully")
        // Refresh status since onboarding just completed
        setStatus((prev) => ({
          ...prev,
          connected: true,
          chargesEnabled: true,
          onboardingComplete: true,
        }))
        break
      case "refresh":
        toast.info("Link expired. Click below to continue onboarding.")
        break
      case "incomplete":
        toast.warning("Onboarding not yet complete. Click below to continue.")
        break
    }

    // Clean URL params without page reload
    const url = new URL(window.location.href)
    url.searchParams.delete("stripe")
    window.history.replaceState({}, "", url.toString())
  }, [searchParams])

  async function handleConnect() {
    setLoading(true)
    try {
      const res = await fetch("/api/connect/stripe/onboard", { method: "POST" })
      const data = await res.json()

      if (!res.ok || !data.url) {
        toast.error(data.error || "Failed to start Stripe onboarding")
        return
      }

      // Redirect to Stripe-hosted onboarding
      window.location.href = data.url
    } catch (err) {
      console.error("[StripeConnectSettings] Error:", err)
      toast.error("Failed to connect to Stripe")
    } finally {
      setLoading(false)
    }
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
          Connect your Stripe account to accept online payments from customers. Stripe
          handles credit card processing, deposits, and compliance.
        </p>
        <div>
          <Button
            onClick={handleConnect}
            disabled={loading}
            size="sm"
            className="cursor-pointer"
          >
            {loading && <Loader2Icon className="h-4 w-4 animate-spin" aria-hidden="true" />}
            Connect Stripe Account
          </Button>
        </div>
      </div>
    )
  }

  // Connected but onboarding incomplete
  if (!status.onboardingComplete || !status.chargesEnabled) {
    return (
      <div className="flex flex-col gap-4">
        <div className="flex items-center gap-2">
          <Badge variant="outline" className="text-yellow-500 border-yellow-500/30">
            Onboarding Incomplete
          </Badge>
        </div>
        <p className="text-sm text-muted-foreground">
          Your Stripe account has been created but onboarding is not complete. Please
          finish setting up your account to start accepting payments.
        </p>
        <div>
          <Button
            onClick={handleConnect}
            disabled={loading}
            size="sm"
            className="cursor-pointer"
          >
            {loading && <Loader2Icon className="h-4 w-4 animate-spin" aria-hidden="true" />}
            Complete Onboarding
            <ExternalLinkIcon className="h-3.5 w-3.5" aria-hidden="true" />
          </Button>
        </div>
      </div>
    )
  }

  // Fully connected
  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center gap-2">
        <Badge variant="outline" className="text-green-500 border-green-500/30">
          Connected
        </Badge>
      </div>
      <div className="flex flex-col gap-2 text-sm">
        {status.businessName && (
          <div className="flex items-center justify-between">
            <span className="text-muted-foreground">Business</span>
            <span className="font-medium">{status.businessName}</span>
          </div>
        )}
        {status.email && (
          <div className="flex items-center justify-between">
            <span className="text-muted-foreground">Email</span>
            <span className="font-medium">{status.email}</span>
          </div>
        )}
        <div className="flex items-center justify-between">
          <span className="text-muted-foreground">Charges</span>
          <Badge
            variant="outline"
            className={
              status.chargesEnabled
                ? "text-green-500 border-green-500/30"
                : "text-red-500 border-red-500/30"
            }
          >
            {status.chargesEnabled ? "Enabled" : "Disabled"}
          </Badge>
        </div>
        <div className="flex items-center justify-between">
          <span className="text-muted-foreground">Payouts</span>
          <Badge
            variant="outline"
            className={
              status.payoutsEnabled
                ? "text-green-500 border-green-500/30"
                : "text-red-500 border-red-500/30"
            }
          >
            {status.payoutsEnabled ? "Enabled" : "Disabled"}
          </Badge>
        </div>
      </div>
    </div>
  )
}
