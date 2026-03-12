"use client"

import { useState } from "react"
import { cn } from "@/lib/utils"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { ProfileForm } from "@/components/settings/profile-form"
import { MapsPreferenceSetting } from "@/components/settings/maps-preference"
import { NotificationSettings } from "@/components/settings/notification-settings"
import { ServiceRequirements } from "@/components/settings/service-requirements"
import { CompanyProfileSettings } from "@/components/settings/company-profile-settings"
import { ChecklistManager } from "@/components/settings/checklist-manager"
import { ChemistryTargetEditor } from "@/components/settings/chemistry-target-editor"
import { PartsCatalogManager } from "@/components/settings/parts-catalog-manager"
import { WoTemplateManager } from "@/components/settings/wo-template-manager"
import { WorkOrderSettings } from "@/components/settings/work-order-settings"
import { StripeConnectSettings } from "@/components/settings/stripe-connect-settings"
import { PaymentStackSettings } from "@/components/settings/payment-stack-settings"
import type { OrgSettings, ChecklistTaskRow } from "@/actions/company-settings"
import type { CatalogItem } from "@/actions/parts-catalog"
import type { WoTemplate } from "@/actions/parts-catalog"
import type { StripeAccountStatus } from "@/actions/stripe-connect"
import {
  LogOutIcon,
  BuildingIcon,
  UserIcon,
  MapPinIcon,
  BellIcon,
  ClipboardCheckIcon,
  ListChecksIcon,
  FlaskConicalIcon,
  ShoppingCartIcon,
  FileTextIcon,
  WrenchIcon,
  CreditCardIcon,
} from "lucide-react"

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

type TabId = "company" | "service" | "work-orders" | "billing" | "account"

interface TabDef {
  id: TabId
  label: string
}

const OWNER_TABS: TabDef[] = [
  { id: "company", label: "Company" },
  { id: "service", label: "Service" },
  { id: "work-orders", label: "Work Orders" },
  { id: "billing", label: "Billing" },
  { id: "account", label: "Account" },
]

interface SettingsTabsProps {
  role: "owner" | "office" | "tech"
  // User
  userId: string
  fullName: string
  email: string
  orgName: string
  // Owner data (null for non-owners)
  orgSettings: OrgSettings | null
  checklistTasks: ChecklistTaskRow[]
  logoUrl: string | null
  catalogItems: CatalogItem[]
  woTemplates: WoTemplate[]
  // Billing data (null for non-owners)
  stripeStatus: StripeAccountStatus | null
  paymentProvider: string
  ccSurchargeEnabled: boolean
  ccSurchargePct: string | null
  qboConnected: boolean
  // Sign out form action
  signOutAction: () => Promise<void>
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function SettingsTabs({
  role,
  userId,
  fullName,
  email,
  orgName,
  orgSettings,
  checklistTasks,
  logoUrl,
  catalogItems,
  woTemplates,
  stripeStatus,
  paymentProvider,
  ccSurchargeEnabled,
  ccSurchargePct,
  qboConnected,
  signOutAction,
}: SettingsTabsProps) {
  const isOwner = role === "owner"
  const isTech = role === "tech"

  // Non-owner roles only see "account"
  const tabs = isOwner ? OWNER_TABS : [{ id: "account" as TabId, label: "Account" }]
  const [activeTab, setActiveTab] = useState<TabId>(isOwner ? "company" : "account")

  return (
    <div className="flex flex-col gap-6">
      {/* ── Tab bar ─────────────────────────────────────────────────────── */}
      {tabs.length > 1 && (
        <div className="sticky top-0 z-10 -mx-1 px-1 pt-1 pb-2 bg-background/95 backdrop-blur-sm border-b border-border/40">
          <div className="flex items-center gap-1 rounded-lg border border-border bg-muted/30 p-1 w-fit">
            {tabs.map((tab) => (
              <button
                key={tab.id}
                type="button"
                onClick={() => setActiveTab(tab.id)}
                className={cn(
                  "cursor-pointer rounded-md px-4 py-1.5 text-sm font-medium transition-colors",
                  activeTab === tab.id
                    ? "bg-background text-foreground shadow-sm"
                    : "text-muted-foreground hover:text-foreground"
                )}
              >
                {tab.label}
              </button>
            ))}
          </div>
        </div>
      )}

      {/* ── Tab panels — all in DOM, visibility toggled ─────────────────── */}

      {/* Company tab */}
      {isOwner && (
        <div className={cn("flex flex-col gap-6", activeTab === "company" ? "block" : "hidden")}>
          <Card>
            <CardHeader>
              <div className="flex items-center gap-2">
                <BuildingIcon className="h-4 w-4 text-muted-foreground" aria-hidden="true" />
                <CardTitle className="text-base">Company Profile</CardTitle>
              </div>
              <CardDescription>
                Your company name and logo appear in service reports and customer emails.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <CompanyProfileSettings
                orgName={orgName}
                logoUrl={logoUrl}
                homeBaseAddress={orgSettings?.home_base_address ?? null}
                homeBaseLat={orgSettings?.home_base_lat ?? null}
                homeBaseLng={orgSettings?.home_base_lng ?? null}
              />
            </CardContent>
          </Card>

          {orgSettings && (
            <Card>
              <CardHeader>
                <div className="flex items-center gap-2">
                  <BellIcon className="h-4 w-4 text-muted-foreground" aria-hidden="true" />
                  <CardTitle className="text-base">Notifications</CardTitle>
                </div>
                <CardDescription>
                  Control notifications sent to customers, service report content, and office alert preferences.
                </CardDescription>
              </CardHeader>
              <CardContent>
                <NotificationSettings settings={orgSettings} />
              </CardContent>
            </Card>
          )}
        </div>
      )}

      {/* Service tab */}
      {isOwner && (
        <div className={cn("flex flex-col gap-6", activeTab === "service" ? "block" : "hidden")}>
          <Card>
            <CardHeader>
              <div className="flex items-center gap-2">
                <ListChecksIcon className="h-4 w-4 text-muted-foreground" aria-hidden="true" />
                <CardTitle className="text-base">Service Checklist</CardTitle>
              </div>
              <CardDescription>
                Customize the tasks your techs see at every service stop. Mark tasks as required or add photo requirements.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <ChecklistManager initialTasks={checklistTasks} />
            </CardContent>
          </Card>

          {orgSettings && (
            <>
              <Card>
                <CardHeader>
                  <div className="flex items-center gap-2">
                    <ClipboardCheckIcon className="h-4 w-4 text-muted-foreground" aria-hidden="true" />
                    <CardTitle className="text-base">Service Requirements</CardTitle>
                  </div>
                  <CardDescription>
                    Configure which chemistry readings are required per sanitizer type. Techs see warnings but are never blocked from completing stops.
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  <ServiceRequirements settings={orgSettings} />
                </CardContent>
              </Card>

              <Card>
                <CardHeader>
                  <div className="flex items-center gap-2">
                    <FlaskConicalIcon className="h-4 w-4 text-muted-foreground" aria-hidden="true" />
                    <CardTitle className="text-base">Chemistry Targets</CardTitle>
                  </div>
                  <CardDescription>
                    Customize the ideal min/max range for each chemistry reading per sanitizer type. Defaults are based on CPO industry standards.
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  <ChemistryTargetEditor settings={orgSettings} />
                </CardContent>
              </Card>
            </>
          )}
        </div>
      )}

      {/* Work Orders tab */}
      {isOwner && (
        <div className={cn("flex flex-col gap-6", activeTab === "work-orders" ? "block" : "hidden")}>
          {orgSettings && (
            <Card>
              <CardHeader>
                <div className="flex items-center gap-2">
                  <WrenchIcon className="h-4 w-4 text-muted-foreground" aria-hidden="true" />
                  <CardTitle className="text-base">Work Order Settings</CardTitle>
                </div>
                <CardDescription>
                  Configure default labor rates, parts markup, tax rate, quote settings, and work order notifications.
                </CardDescription>
              </CardHeader>
              <CardContent>
                <WorkOrderSettings settings={orgSettings} />
              </CardContent>
            </Card>
          )}

          <Card>
            <CardHeader>
              <div className="flex items-center gap-2">
                <ShoppingCartIcon className="h-4 w-4 text-muted-foreground" aria-hidden="true" />
                <CardTitle className="text-base">Parts &amp; Materials Catalog</CardTitle>
              </div>
              <CardDescription>
                Save frequently used parts and labor items for quick reuse on work orders and quotes.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <PartsCatalogManager initialItems={catalogItems} />
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <div className="flex items-center gap-2">
                <FileTextIcon className="h-4 w-4 text-muted-foreground" aria-hidden="true" />
                <CardTitle className="text-base">Work Order Templates</CardTitle>
              </div>
              <CardDescription>
                Create templates for common repeat jobs to save time when creating work orders.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <WoTemplateManager initialTemplates={woTemplates} />
            </CardContent>
          </Card>
        </div>
      )}

      {/* Billing tab — owner only */}
      {isOwner && (
        <div className={cn("flex flex-col gap-6", activeTab === "billing" ? "block" : "hidden")}>
          <Card>
            <CardHeader>
              <div className="flex items-center gap-2">
                <CreditCardIcon className="h-4 w-4 text-muted-foreground" aria-hidden="true" />
                <CardTitle className="text-base">Stripe Connect</CardTitle>
              </div>
              <CardDescription>
                Connect your Stripe account to accept online credit card and ACH payments from customers.
              </CardDescription>
            </CardHeader>
            <CardContent>
              {stripeStatus && (
                <StripeConnectSettings initialStatus={stripeStatus} />
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <div className="flex items-center gap-2">
                <CreditCardIcon className="h-4 w-4 text-muted-foreground" aria-hidden="true" />
                <CardTitle className="text-base">Payment Settings</CardTitle>
              </div>
              <CardDescription>
                Choose your payment provider and configure credit card surcharge settings.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <PaymentStackSettings
                paymentProvider={paymentProvider}
                ccSurchargeEnabled={ccSurchargeEnabled}
                ccSurchargePct={ccSurchargePct}
                stripeConnected={stripeStatus?.onboardingComplete ?? false}
                qboConnected={qboConnected}
              />
            </CardContent>
          </Card>
        </div>
      )}

      {/* Account tab — all roles */}
      <div className={cn("flex flex-col gap-6", activeTab === "account" ? "block" : "hidden")}>
        <Card>
          <CardHeader>
            <div className="flex items-center gap-2">
              <MapPinIcon className="h-4 w-4 text-muted-foreground" aria-hidden="true" />
              <CardTitle className="text-base">Navigation</CardTitle>
            </div>
            <CardDescription>
              Choose which maps app opens when you tap the navigate button on a stop.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <MapsPreferenceSetting />
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <div className="flex items-center gap-2">
              <UserIcon className="h-4 w-4 text-muted-foreground" aria-hidden="true" />
              <CardTitle className="text-base">Your Profile</CardTitle>
            </div>
            <CardDescription>
              {isTech ? "Your account details." : "Update your display name."}
            </CardDescription>
          </CardHeader>
          <CardContent>
            {isTech ? (
              <div className="flex flex-col gap-3">
                <div className="flex items-center justify-between py-1">
                  <div>
                    <p className="text-sm font-medium">{fullName || "—"}</p>
                    <p className="text-xs text-muted-foreground">Display name</p>
                  </div>
                </div>
                <div className="flex items-center justify-between py-1">
                  <div>
                    <p className="text-sm font-medium">{email}</p>
                    <p className="text-xs text-muted-foreground">Email</p>
                  </div>
                  <Badge variant="outline" className="capitalize">
                    {role}
                  </Badge>
                </div>
              </div>
            ) : (
              <ProfileForm
                userId={userId}
                initialName={fullName}
                email={email}
              />
            )}
          </CardContent>
        </Card>

        {/* Organization — office role only */}
        {role === "office" && (
          <Card>
            <CardHeader>
              <div className="flex items-center gap-2">
                <BuildingIcon className="h-4 w-4 text-muted-foreground" aria-hidden="true" />
                <CardTitle className="text-base">Organization</CardTitle>
              </div>
              <CardDescription>
                Your organization&apos;s details.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="flex flex-col gap-3">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm font-medium">{orgName}</p>
                    <p className="text-xs text-muted-foreground">Organization name</p>
                  </div>
                  <Badge variant="outline" className="capitalize">
                    {role}
                  </Badge>
                </div>
              </div>
            </CardContent>
          </Card>
        )}

        <Card>
          <CardHeader>
            <CardTitle className="text-base">Account</CardTitle>
            <CardDescription>Sign out of your account on this device.</CardDescription>
          </CardHeader>
          <CardContent>
            <form action={signOutAction}>
              <Button
                type="submit"
                variant="outline"
                size="sm"
                className="text-destructive hover:text-destructive hover:bg-destructive/10 border-destructive/30 cursor-pointer"
              >
                <LogOutIcon className="h-4 w-4" aria-hidden="true" />
                Sign out
              </Button>
            </form>
          </CardContent>
        </Card>
      </div>
    </div>
  )
}
