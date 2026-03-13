"use client"

import { useState, useTransition } from "react"
import { createClient } from "@/lib/supabase/client"
import { switchOrg } from "@/actions/portal-auth"
import { Button } from "@/components/ui/button"
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  CardDescription,
} from "@/components/ui/card"

interface CompanyOption {
  orgId: string
  orgName: string
  logoUrl: string | null
  slug: string | null
  brandColor: string | null
}

interface CompanyPickerProps {
  companies: CompanyOption[]
  currentOrgId: string
}

/**
 * CompanyPicker — shown to multi-org customers to select which company's portal to enter.
 *
 * After switching, calls supabase.auth.refreshSession() to get a new JWT with the
 * updated org_id, then does a hard navigation to /portal (not router.push) to ensure
 * the full page re-renders with fresh server data.
 *
 * Per research Pitfall 2: always use window.location.href for org switch navigation,
 * not router.push. The JWT org_id change needs a full page reload to take effect.
 */
export function CompanyPicker({ companies, currentOrgId }: CompanyPickerProps) {
  const [selectedOrgId, setSelectedOrgId] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [isPending, startTransition] = useTransition()

  function handleSelectCompany(orgId: string) {
    setError(null)
    setSelectedOrgId(orgId)

    startTransition(async () => {
      const result = await switchOrg(orgId)

      if (!result.success) {
        setError(result.error ?? "Failed to switch company")
        setSelectedOrgId(null)
        return
      }

      // Refresh the session so the new JWT org_id is applied
      const supabase = createClient()
      await supabase.auth.refreshSession()

      // Hard navigation — must reload to apply new JWT claims
      window.location.href = "/portal"
    })
  }

  return (
    <div className="min-h-screen flex flex-col items-center justify-center p-4">
      <div className="w-full max-w-md">
        <div className="mb-6 text-center">
          <h1 className="text-2xl font-bold tracking-tight">Choose a company</h1>
          <p className="text-sm text-muted-foreground mt-1">
            You have access to multiple companies. Select one to continue.
          </p>
        </div>

        {error && (
          <div className="mb-4 rounded-md border border-destructive/50 bg-destructive/10 px-4 py-3">
            <p className="text-sm text-destructive">{error}</p>
          </div>
        )}

        <div className="flex flex-col gap-3">
          {companies.map((company) => {
            const isLoading = isPending && selectedOrgId === company.orgId
            const isCurrent = company.orgId === currentOrgId

            return (
              <Card
                key={company.orgId}
                className="cursor-pointer transition-colors hover:bg-muted/50 active:bg-muted"
                onClick={() => !isPending && handleSelectCompany(company.orgId)}
              >
                <CardHeader className="pb-2">
                  <div className="flex items-center gap-3">
                    {/* Company logo or initials fallback */}
                    <div className="w-10 h-10 rounded-lg bg-primary/10 border border-primary/20 flex items-center justify-center overflow-hidden shrink-0">
                      {company.logoUrl ? (
                        <img
                          src={company.logoUrl}
                          alt={`${company.orgName} logo`}
                          className="w-full h-full object-contain"
                        />
                      ) : (
                        <span className="text-sm font-bold text-primary">
                          {company.orgName.charAt(0).toUpperCase()}
                        </span>
                      )}
                    </div>

                    <div className="flex-1 min-w-0">
                      <CardTitle className="text-base">{company.orgName}</CardTitle>
                      {company.slug && (
                        <CardDescription className="text-xs">
                          {company.slug}.poolco.app
                        </CardDescription>
                      )}
                    </div>

                    {isCurrent && (
                      <span className="text-xs text-muted-foreground shrink-0">Current</span>
                    )}
                  </div>
                </CardHeader>
                {isLoading && (
                  <CardContent className="pt-0 pb-3">
                    <p className="text-xs text-muted-foreground">Switching...</p>
                  </CardContent>
                )}
              </Card>
            )
          })}
        </div>

        <p className="mt-6 text-center text-xs text-muted-foreground">
          Powered by <span className="text-primary font-medium">PoolCo</span>
        </p>
      </div>
    </div>
  )
}
