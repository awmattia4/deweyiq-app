"use client"

import { useState, useEffect } from "react"
import { cn } from "@/lib/utils"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
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
import { QboConnectSettings } from "@/components/settings/qbo-connect-settings"
import { DunningSettings } from "@/components/settings/dunning-settings"
import { TemplateEditor } from "@/components/settings/template-editor"
import { TeamPaySettings } from "@/components/settings/team-pay-settings"
import { ChemistryCostSettings } from "@/components/settings/chemistry-cost-settings"
import { SafetySettings } from "@/components/settings/safety-settings"
import { BroadcastMessaging } from "@/components/settings/broadcast-messaging"
import { NotificationPreferences } from "@/components/settings/notification-preferences"
import { TimeTrackingSettings } from "@/components/settings/time-tracking-settings"
import { ProjectTemplates } from "@/components/settings/project-templates"
import { SubcontractorSettings } from "@/components/settings/subcontractor-settings"
import type { BroadcastHistoryEntry } from "@/actions/broadcast"
import type { NotificationPreferenceRow } from "@/actions/user-notifications"
import type { QboConnectionStatus } from "@/components/settings/qbo-connect-settings"
import type { OrgSettings, ChecklistTemplateRow } from "@/actions/company-settings"
import type { TemplateRow } from "@/actions/notification-templates"
import type { DunningStep } from "@/lib/db/schema/dunning"
import type { CatalogItem } from "@/actions/parts-catalog"
import type { WoTemplate } from "@/actions/parts-catalog"
import type { StripeAccountStatus } from "@/actions/stripe-connect"
import type { ProjectTemplate } from "@/actions/projects"
import type { SubcontractorRow } from "@/actions/projects-subcontractors"
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

type TabId = "company" | "service" | "work-orders" | "billing" | "time-tracking" | "projects" | "account"

interface TabDef {
  id: TabId
  label: string
}

const OWNER_TABS: TabDef[] = [
  { id: "company", label: "Company" },
  { id: "service", label: "Service" },
  { id: "work-orders", label: "Work Orders" },
  { id: "billing", label: "Billing" },
  { id: "time-tracking", label: "Time Tracking" },
  { id: "projects", label: "Projects" },
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
  checklistTemplates: ChecklistTemplateRow[]
  logoUrl: string | null
  orgSlug: string | null
  catalogItems: CatalogItem[]
  woTemplates: WoTemplate[]
  // Billing data (null for non-owners)
  stripeStatus: StripeAccountStatus | null
  paymentProvider: string
  ccSurchargeEnabled: boolean
  ccSurchargePct: string | null
  qboConnected: boolean
  qboStatus: QboConnectionStatus | null
  // Dunning data
  dunningSteps: DunningStep[]
  dunningMaxRetries: number
  // Phase 9: Team pay configuration
  techProfiles: Array<{ id: string; fullName: string; payType: string | null; payRate: string | null }>
  // Phase 9: Chemical cost settings
  chemicalProducts: Array<{ id: string; name: string; chemicalType: string; unit: string; costPerUnit: string | null }>
  // Phase 10-14: Safety team members for escalation chain dropdown
  safetyTeamMembers: Array<{ id: string; fullName: string; role: "owner" | "office" | "tech" }>
  // Notification templates
  notifTemplates: TemplateRow[]
  orgTemplateSettings: {
    google_review_url: string | null
    website_url: string | null
    custom_email_footer: string | null
    custom_sms_signature: string | null
  } | null
  // Phase 10-16: Broadcast messaging
  broadcastTechProfiles: Array<{ id: string; fullName: string }>
  broadcastHistory: BroadcastHistoryEntry[]
  // Phase 10-11: Per-user notification preferences (all roles)
  initialNotifPreferences: NotificationPreferenceRow[]
  // Phase 12: Project templates (owner only)
  projectTemplates: ProjectTemplate[]
  // Phase 12: Subcontractor directory (owner only)
  initialSubcontractors: SubcontractorRow[]
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
  checklistTemplates,
  logoUrl,
  orgSlug,
  catalogItems,
  woTemplates,
  stripeStatus,
  paymentProvider,
  ccSurchargeEnabled,
  ccSurchargePct,
  qboConnected,
  qboStatus,
  dunningSteps,
  dunningMaxRetries,
  techProfiles,
  chemicalProducts,
  safetyTeamMembers,
  notifTemplates,
  orgTemplateSettings,
  broadcastTechProfiles,
  broadcastHistory,
  initialNotifPreferences,
  projectTemplates,
  initialSubcontractors,
  signOutAction,
}: SettingsTabsProps) {
  const isOwner = role === "owner"
  const isTech = role === "tech"

  // Non-owner roles only see "account"
  const tabs = isOwner ? OWNER_TABS : [{ id: "account" as TabId, label: "Account" }]
  const validTabIds = new Set(tabs.map((t) => t.id))

  // Read initial tab from URL hash (e.g. #billing)
  const [activeTab, setActiveTab] = useState<TabId>(() => {
    if (typeof window !== "undefined") {
      const hash = window.location.hash.slice(1) as TabId
      if (hash && validTabIds.has(hash)) return hash
    }
    return isOwner ? "company" : "account"
  })

  // Sync hash → state on popstate (browser back/forward)
  useEffect(() => {
    function onHashChange() {
      const hash = window.location.hash.slice(1) as TabId
      if (hash && validTabIds.has(hash)) setActiveTab(hash)
    }
    window.addEventListener("hashchange", onHashChange)
    return () => window.removeEventListener("hashchange", onHashChange)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // Update hash when tab changes
  function switchTab(id: TabId) {
    setActiveTab(id)
    window.history.replaceState(null, "", `#${id}`)
  }

  return (
    <div className="flex flex-col gap-6">
      {/* ── Tab bar ─────────────────────────────────────────────────────── */}
      {tabs.length > 1 && (
        <div className="sticky top-0 z-10 -mx-1 px-1 pt-1 pb-2 bg-background/95 backdrop-blur-sm border-b border-border/40">
          {/* Mobile: dropdown select */}
          <div className="sm:hidden">
            <Select value={activeTab} onValueChange={(v) => switchTab(v as TabId)}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {tabs.map((tab) => (
                  <SelectItem key={tab.id} value={tab.id}>
                    {tab.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          {/* Desktop: tab bar */}
          <div className="hidden sm:flex items-center gap-1 rounded-lg border border-border bg-muted/30 p-1 w-fit">
            {tabs.map((tab) => (
              <button
                key={tab.id}
                type="button"
                onClick={() => switchTab(tab.id)}
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
                brandColor={orgSettings?.brand_color ?? null}
                faviconPath={orgSettings?.favicon_path ?? null}
                portalWelcomeMessage={orgSettings?.portal_welcome_message ?? null}
                orgSlug={orgSlug}
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

          {notifTemplates.length > 0 && (
            <Card>
              <CardHeader>
                <CardTitle className="text-base">Email &amp; SMS Templates</CardTitle>
                <CardDescription>
                  Customize the content of every email and SMS your company sends to customers. Add your Google review link, custom footer, and brand messaging.
                </CardDescription>
              </CardHeader>
              <CardContent>
                <TemplateEditor
                  templates={notifTemplates}
                  orgTemplateSettings={orgTemplateSettings}
                />
              </CardContent>
            </Card>
          )}

          <Card>
            <CardHeader>
              <CardTitle className="text-base">Broadcast Messaging</CardTitle>
              <CardDescription>
                Send a one-time message to all customers or a filtered segment. Use for seasonal announcements, holiday schedules, or emergency notices.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <BroadcastMessaging
                techProfiles={broadcastTechProfiles}
                initialHistory={broadcastHistory}
              />
            </CardContent>
          </Card>
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
              <ChecklistManager initialTemplates={checklistTemplates} />
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

          <Card>
            <CardHeader>
              <CardTitle className="text-base">Chemical Costs</CardTitle>
              <CardDescription>
                Set the cost per unit for each chemical product. Used to calculate per-pool profitability on the Reports page.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <ChemistryCostSettings
                chemicalProducts={chemicalProducts}
                marginThreshold={orgSettings?.chem_profit_margin_threshold_pct ?? "20"}
              />
            </CardContent>
          </Card>

          {orgSettings && (
            <Card>
              <CardHeader>
                <CardTitle className="text-base">Lone Worker Safety</CardTitle>
                <CardDescription>
                  Alert the right people if a tech becomes unresponsive during an active route. Configure how long before the alert fires and who gets notified.
                </CardDescription>
              </CardHeader>
              <CardContent>
                <SafetySettings
                  settings={orgSettings}
                  teamMembers={safetyTeamMembers}
                />
              </CardContent>
            </Card>
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

          {qboStatus && (
            <Card>
              <CardHeader>
                <div className="flex items-center gap-2">
                  <CreditCardIcon className="h-4 w-4 text-muted-foreground" aria-hidden="true" />
                  <CardTitle className="text-base">QuickBooks Online</CardTitle>
                </div>
                <CardDescription>
                  Sync invoices, payments, and customers to your QuickBooks Online account automatically.
                </CardDescription>
              </CardHeader>
              <CardContent>
                <QboConnectSettings initialStatus={qboStatus} />
              </CardContent>
            </Card>
          )}

          <Card>
            <CardHeader>
              <CardTitle className="text-base">Payment Retry &amp; Reminders</CardTitle>
              <CardDescription>
                Configure automatic payment retry schedule and reminder emails for overdue invoices.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <DunningSettings
                initialSteps={dunningSteps}
                initialMaxRetries={dunningMaxRetries}
              />
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="text-base">Team Pay Configuration</CardTitle>
              <CardDescription>
                Configure pay type (per-stop or hourly) and pay rate for each technician. Used for payroll prep exports on the Reports page.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <TeamPaySettings techProfiles={techProfiles} orgSettings={orgSettings} />
            </CardContent>
          </Card>

        </div>
      )}

      {/* Time Tracking tab — owner only */}
      {isOwner && orgSettings && (
        <div className={cn("flex flex-col gap-6", activeTab === "time-tracking" ? "block" : "hidden")}>
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Time Tracking</CardTitle>
              <CardDescription>
                Configure how DeweyIQ tracks technician time. Approved entries push to QuickBooks Online as TimeActivity records for payroll processing.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <TimeTrackingSettings
                initialSettings={{
                  time_tracking_enabled: orgSettings.time_tracking_enabled,
                  geofence_radius_meters: orgSettings.geofence_radius_meters,
                  break_auto_detect_minutes: orgSettings.break_auto_detect_minutes,
                  overtime_threshold_hours: orgSettings.overtime_threshold_hours,
                  pay_period_type: orgSettings.pay_period_type,
                }}
              />
            </CardContent>
          </Card>
        </div>
      )}

      {/* Projects tab — owner only */}
      {isOwner && (
        <div className={cn("flex flex-col gap-6", activeTab === "projects" ? "block" : "hidden")}>
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Project Templates</CardTitle>
              <CardDescription>
                Create templates that pre-populate phases and tasks when starting a new project. Use
                templates to standardize your renovation and new pool workflows.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <ProjectTemplates initialTemplates={projectTemplates} />
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="text-base">Subcontractor Directory</CardTitle>
              <CardDescription>
                Manage the subcontractors your company uses for project work. Track insurance
                certificates, license expiry, and contact information. Subs can be assigned to
                project phases and receive schedule notification emails.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <SubcontractorSettings initialSubs={initialSubcontractors} />
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

        {/* My Notification Preferences — all roles */}
        <Card>
          <CardHeader>
            <div className="flex items-center gap-2">
              <BellIcon className="h-4 w-4 text-muted-foreground" aria-hidden="true" />
              <CardTitle className="text-base">My Notification Preferences</CardTitle>
            </div>
            <CardDescription>
              Choose which notifications you receive and how — in-app, push, or email. Changes apply only to your account.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <NotificationPreferences initialPreferences={initialNotifPreferences} />
          </CardContent>
        </Card>

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
