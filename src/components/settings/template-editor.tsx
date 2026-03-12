"use client"

import { useState, useTransition, useRef, useEffect } from "react"
import { toast } from "sonner"
import { cn } from "@/lib/utils"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Textarea } from "@/components/ui/textarea"
import { Switch } from "@/components/ui/switch"
import { Label } from "@/components/ui/label"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog"
import { RotateCcwIcon, SaveIcon, TagIcon, EyeIcon, PencilIcon } from "lucide-react"
import {
  updateTemplate,
  resetTemplate,
} from "@/actions/notification-templates"
import { updateOrgSettings as updateOrgSettingsAction } from "@/actions/company-settings"
import { MERGE_TAGS, resolveTemplate } from "@/lib/notifications/template-engine"
import type { TemplateRow } from "@/actions/notification-templates"
import type { TemplateType } from "@/lib/notifications/default-templates"
import { ALL_TEMPLATE_TYPES, DEFAULT_TEMPLATES, TEMPLATE_TYPE_META } from "@/lib/notifications/default-templates"

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface TemplateEditorProps {
  templates: TemplateRow[]
  orgTemplateSettings: {
    google_review_url: string | null
    website_url: string | null
    custom_email_footer: string | null
    custom_sms_signature: string | null
  } | null
}

// ---------------------------------------------------------------------------
// Example context for preview rendering
// ---------------------------------------------------------------------------

const EXAMPLE_CONTEXT: Record<string, string> = {
  customer_name: "John Smith",
  company_name: "Blue Wave Pools",
  tech_name: "Mike Johnson",
  invoice_number: "INV-0042",
  invoice_total: "$285.00",
  due_date: "Apr 15, 2026",
  billing_period: "Mar 1 - Mar 31, 2026",
  payment_link: "https://app.poolco.com/pay/example",
  quote_link: "https://app.poolco.com/quote/example",
  report_link: "https://app.poolco.com/api/reports/example",
  review_link: "https://g.page/r/example",
  website_link: "https://bluewavepools.com",
  custom_footer: "Licensed & Insured | Serving Phoenix since 2015",
  sms_signature: "-- Blue Wave Pools",
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function TemplateEditor({ templates, orgTemplateSettings }: TemplateEditorProps) {
  const [selectedType, setSelectedType] = useState<TemplateType>("service_report_email")
  const [editState, setEditState] = useState<Record<string, {
    subject: string
    body_html: string
    sms_text: string
    enabled: boolean
  }>>(() => {
    const initial: Record<string, { subject: string; body_html: string; sms_text: string; enabled: boolean }> = {}
    for (const t of templates) {
      initial[t.template_type] = {
        subject: t.subject ?? "",
        body_html: t.body_html ?? "",
        sms_text: t.sms_text ?? "",
        enabled: t.enabled,
      }
    }
    return initial
  })

  const [showPreview, setShowPreview] = useState(false)
  const [isPending, startTransition] = useTransition()
  const textareaRef = useRef<HTMLTextAreaElement>(null)

  // Org-level settings
  const [googleReviewUrl, setGoogleReviewUrl] = useState(orgTemplateSettings?.google_review_url ?? "")
  const [websiteUrl, setWebsiteUrl] = useState(orgTemplateSettings?.website_url ?? "")
  const [customEmailFooter, setCustomEmailFooter] = useState(orgTemplateSettings?.custom_email_footer ?? "")
  const [customSmsSignature, setCustomSmsSignature] = useState(orgTemplateSettings?.custom_sms_signature ?? "")
  const [settingsSaving, setSettingsSaving] = useState(false)

  const selected = editState[selectedType]
  const selectedMeta = TEMPLATE_TYPE_META[selectedType]
  const templateInfo = templates.find((t) => t.template_type === selectedType)
  const isEmail = selectedMeta.channel === "email"
  const isSms = selectedMeta.channel === "sms"

  // Build preview context with current org settings values
  const previewContext: Record<string, string> = {
    ...EXAMPLE_CONTEXT,
    review_link: googleReviewUrl || EXAMPLE_CONTEXT.review_link,
    website_link: websiteUrl || EXAMPLE_CONTEXT.website_link,
    custom_footer: customEmailFooter || EXAMPLE_CONTEXT.custom_footer,
    sms_signature: customSmsSignature || EXAMPLE_CONTEXT.sms_signature,
  }

  // Insert merge tag at cursor position
  const insertTag = (tag: string) => {
    if (isSms && textareaRef.current) {
      const ta = textareaRef.current
      const start = ta.selectionStart
      const end = ta.selectionEnd
      const current = selected?.sms_text ?? ""
      const newVal = current.substring(0, start) + tag + current.substring(end)
      setEditState((prev) => ({
        ...prev,
        [selectedType]: { ...prev[selectedType], sms_text: newVal },
      }))
      // Restore cursor position after tag
      setTimeout(() => {
        ta.focus()
        ta.setSelectionRange(start + tag.length, start + tag.length)
      }, 0)
    } else if (isEmail && textareaRef.current) {
      const ta = textareaRef.current
      const start = ta.selectionStart
      const end = ta.selectionEnd
      const current = selected?.body_html ?? ""
      const newVal = current.substring(0, start) + tag + current.substring(end)
      setEditState((prev) => ({
        ...prev,
        [selectedType]: { ...prev[selectedType], body_html: newVal },
      }))
      setTimeout(() => {
        ta.focus()
        ta.setSelectionRange(start + tag.length, start + tag.length)
      }, 0)
    }
  }

  // Save template
  const handleSave = () => {
    if (!selected) return
    startTransition(async () => {
      const result = await updateTemplate(selectedType, {
        subject: isEmail ? selected.subject : null,
        body_html: isEmail ? selected.body_html : null,
        sms_text: isSms ? selected.sms_text : null,
        enabled: selected.enabled,
      })
      if (result.success) {
        toast.success("Template saved")
      } else {
        toast.error("Failed to save template", { description: result.error })
      }
    })
  }

  // Reset to default
  const handleReset = () => {
    startTransition(async () => {
      const result = await resetTemplate(selectedType)
      if (result.success) {
        // Reload actual defaults (not from props, which may hold stale custom values)
        const defaults = DEFAULT_TEMPLATES[selectedType]
        setEditState((prev) => ({
          ...prev,
          [selectedType]: {
            subject: defaults?.subject ?? "",
            body_html: defaults?.body_html ?? "",
            sms_text: defaults?.sms_text ?? "",
            enabled: true,
          },
        }))
        toast.success("Template reset to default")
      } else {
        toast.error("Failed to reset template", { description: result.error })
      }
    })
  }

  // Toggle enabled/disabled
  const handleToggleEnabled = (checked: boolean) => {
    setEditState((prev) => ({
      ...prev,
      [selectedType]: { ...prev[selectedType], enabled: checked },
    }))
    // Auto-save the enabled state
    startTransition(async () => {
      const result = await updateTemplate(selectedType, { enabled: checked })
      if (!result.success) {
        // Revert on failure
        setEditState((prev) => ({
          ...prev,
          [selectedType]: { ...prev[selectedType], enabled: !checked },
        }))
        toast.error("Failed to update", { description: result.error })
      }
    })
  }

  // Save org-level settings
  const handleSaveOrgSettings = async () => {
    setSettingsSaving(true)
    try {
      const result = await updateOrgSettingsAction({
        google_review_url: googleReviewUrl || null,
        website_url: websiteUrl || null,
        custom_email_footer: customEmailFooter || null,
        custom_sms_signature: customSmsSignature || null,
      })
      if (result.success) {
        toast.success("Template settings saved")
      } else {
        toast.error("Failed to save settings", { description: result.error })
      }
    } catch {
      toast.error("Failed to save settings")
    } finally {
      setSettingsSaving(false)
    }
  }

  // Render resolved preview
  const previewSubject = selected && isEmail
    ? resolveTemplate(selected.subject, previewContext)
    : ""
  const previewBody = selected
    ? isEmail
      ? resolveTemplate(selected.body_html, previewContext)
      : resolveTemplate(selected.sms_text, previewContext)
    : ""

  if (!selected) return null

  return (
    <div className="flex flex-col gap-6">
      {/* Template types list + editor */}
      <div className="flex flex-col gap-4">
        {/* Template type selector */}
        <div className="flex flex-col gap-1">
          <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider px-0.5 mb-1">
            Template Type
          </h3>
          <div className="rounded-xl border border-border/60 bg-muted/5 divide-y divide-border/40">
            {ALL_TEMPLATE_TYPES.map((type) => {
              const meta = TEMPLATE_TYPE_META[type]
              const state = editState[type]
              const isActive = type === selectedType
              return (
                <button
                  key={type}
                  type="button"
                  onClick={() => {
                    setSelectedType(type)
                    setShowPreview(false)
                  }}
                  className={cn(
                    "flex items-center justify-between w-full px-4 py-3 text-left cursor-pointer transition-colors",
                    isActive
                      ? "bg-primary/10 text-foreground"
                      : "text-muted-foreground hover:text-foreground hover:bg-muted/10"
                  )}
                >
                  <div className="flex flex-col gap-0.5">
                    <span className="text-sm font-medium">{meta.label}</span>
                    <span className="text-xs text-muted-foreground">
                      {meta.channel === "email" ? "Email" : "SMS"}
                    </span>
                  </div>
                  <div className="flex items-center gap-2">
                    {!state?.enabled && (
                      <span className="text-xs text-muted-foreground bg-muted/30 px-2 py-0.5 rounded">
                        Disabled
                      </span>
                    )}
                  </div>
                </button>
              )
            })}
          </div>
        </div>

        {/* Editor panel */}
        <div className="rounded-xl border border-border/60 bg-muted/5 p-4 flex flex-col gap-4">
          {/* Header */}
          <div className="flex items-center justify-between">
            <div>
              <h4 className="text-sm font-semibold">{selectedMeta.label}</h4>
              <p className="text-xs text-muted-foreground">
                {isEmail ? "Email template" : "SMS template"}
                {templateInfo?.isCustom && " (customized)"}
              </p>
            </div>
            <div className="flex items-center gap-3">
              <div className="flex items-center gap-2">
                <Label htmlFor="template-enabled" className="text-xs text-muted-foreground cursor-pointer">
                  Enabled
                </Label>
                <Switch
                  id="template-enabled"
                  checked={selected.enabled}
                  onCheckedChange={handleToggleEnabled}
                  disabled={isPending}
                  className="cursor-pointer"
                />
              </div>
            </div>
          </div>

          {/* Edit / Preview tabs */}
          <div className="flex items-center gap-1 rounded-lg border border-border bg-muted/30 p-0.5 w-fit">
            <button
              type="button"
              onClick={() => setShowPreview(false)}
              className={cn(
                "cursor-pointer flex items-center gap-1.5 rounded-md px-3 py-1 text-xs font-medium transition-colors",
                !showPreview
                  ? "bg-background text-foreground shadow-sm"
                  : "text-muted-foreground hover:text-foreground"
              )}
            >
              <PencilIcon className="h-3 w-3" />
              Edit
            </button>
            <button
              type="button"
              onClick={() => setShowPreview(true)}
              className={cn(
                "cursor-pointer flex items-center gap-1.5 rounded-md px-3 py-1 text-xs font-medium transition-colors",
                showPreview
                  ? "bg-background text-foreground shadow-sm"
                  : "text-muted-foreground hover:text-foreground"
              )}
            >
              <EyeIcon className="h-3 w-3" />
              Preview
            </button>
          </div>

          {showPreview ? (
            /* Preview panel */
            <div className="flex flex-col gap-3">
              {isEmail && (
                <div className="rounded-lg border border-border/60 bg-background p-3">
                  <p className="text-xs text-muted-foreground mb-1">Subject</p>
                  <p className="text-sm font-medium">{previewSubject}</p>
                </div>
              )}
              <div className={cn(
                "rounded-lg border border-border/60 p-4",
                isSms
                  ? "bg-emerald-950/20 max-w-xs mx-auto"
                  : "bg-background"
              )}>
                {isSms && (
                  <p className="text-xs text-muted-foreground mb-2">SMS Preview</p>
                )}
                <p className="text-sm whitespace-pre-wrap leading-relaxed">
                  {previewBody}
                </p>
              </div>
              <p className="text-xs text-muted-foreground italic">
                Preview rendered with example data. Actual values will be filled at send time.
              </p>
            </div>
          ) : (
            /* Edit panel */
            <div className="flex flex-col gap-3">
              {/* Subject (email only) */}
              {isEmail && (
                <div className="flex flex-col gap-1.5">
                  <Label htmlFor="template-subject" className="text-xs text-muted-foreground">
                    Subject Line
                  </Label>
                  <Input
                    id="template-subject"
                    value={selected.subject}
                    onChange={(e) =>
                      setEditState((prev) => ({
                        ...prev,
                        [selectedType]: { ...prev[selectedType], subject: e.target.value },
                      }))
                    }
                    placeholder="Email subject line..."
                    className="text-sm"
                  />
                </div>
              )}

              {/* Body / SMS text */}
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="template-body" className="text-xs text-muted-foreground">
                  {isEmail ? "Body" : "SMS Text"}
                </Label>
                <Textarea
                  id="template-body"
                  ref={textareaRef}
                  value={isEmail ? selected.body_html : selected.sms_text}
                  onChange={(e) => {
                    const field = isEmail ? "body_html" : "sms_text"
                    setEditState((prev) => ({
                      ...prev,
                      [selectedType]: { ...prev[selectedType], [field]: e.target.value },
                    }))
                  }}
                  placeholder={isEmail ? "Email body content..." : "SMS message text..."}
                  rows={isEmail ? 10 : 4}
                  className="text-sm font-mono leading-relaxed"
                />
                {isSms && (
                  <p className="text-xs text-muted-foreground text-right">
                    {(selected.sms_text ?? "").length} characters
                  </p>
                )}
              </div>

              {/* Merge tags */}
              <div className="flex flex-col gap-1.5">
                <p className="text-xs text-muted-foreground flex items-center gap-1">
                  <TagIcon className="h-3 w-3" />
                  Insert merge tag (click to insert at cursor)
                </p>
                <div className="flex flex-wrap gap-1">
                  {MERGE_TAGS.map((mt) => (
                    <button
                      key={mt.tag}
                      type="button"
                      onClick={() => insertTag(mt.tag)}
                      title={`${mt.description} (e.g. ${mt.example})`}
                      className="cursor-pointer text-xs px-2 py-1 rounded-md border border-border/60 bg-muted/20 text-muted-foreground hover:text-foreground hover:bg-muted/40 transition-colors"
                    >
                      {mt.tag}
                    </button>
                  ))}
                </div>
              </div>
            </div>
          )}

          {/* Action buttons */}
          <div className="flex items-center justify-between pt-2 border-t border-border/40">
            <AlertDialog>
              <AlertDialogTrigger asChild>
                <Button
                  variant="outline"
                  size="sm"
                  disabled={isPending}
                  className="cursor-pointer text-muted-foreground"
                >
                  <RotateCcwIcon className="h-3.5 w-3.5 mr-1.5" />
                  Reset to Default
                </Button>
              </AlertDialogTrigger>
              <AlertDialogContent>
                <AlertDialogHeader>
                  <AlertDialogTitle>Reset template to default?</AlertDialogTitle>
                  <AlertDialogDescription>
                    This will remove your custom template for "{selectedMeta.label}" and revert to the platform default. This action cannot be undone.
                  </AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                  <AlertDialogCancel className="cursor-pointer">Cancel</AlertDialogCancel>
                  <AlertDialogAction onClick={handleReset} className="cursor-pointer">
                    Reset
                  </AlertDialogAction>
                </AlertDialogFooter>
              </AlertDialogContent>
            </AlertDialog>

            <Button
              size="sm"
              onClick={handleSave}
              disabled={isPending}
              className="cursor-pointer"
            >
              <SaveIcon className="h-3.5 w-3.5 mr-1.5" />
              Save Template
            </Button>
          </div>
        </div>
      </div>

      {/* Org-wide template settings */}
      <div className="flex flex-col gap-1">
        <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider px-0.5 mb-1">
          Template Settings
        </h3>
        <div className="rounded-xl border border-border/60 bg-muted/5 p-4 flex flex-col gap-4">
          <p className="text-xs text-muted-foreground">
            These values are used across all templates via merge tags.
          </p>

          <div className="flex flex-col gap-3">
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="google-review-url" className="text-xs text-muted-foreground">
                Google Review URL
              </Label>
              <Input
                id="google-review-url"
                value={googleReviewUrl}
                onChange={(e) => setGoogleReviewUrl(e.target.value)}
                placeholder="https://g.page/r/..."
                className="text-sm"
              />
              <p className="text-xs text-muted-foreground">
                Used in {"{{review_link}}"} and {"{{review_link_section}}"} tags. Leave empty to hide the review link.
              </p>
            </div>

            <div className="flex flex-col gap-1.5">
              <Label htmlFor="website-url" className="text-xs text-muted-foreground">
                Website URL
              </Label>
              <Input
                id="website-url"
                value={websiteUrl}
                onChange={(e) => setWebsiteUrl(e.target.value)}
                placeholder="https://yourcompany.com"
                className="text-sm"
              />
            </div>

            <div className="flex flex-col gap-1.5">
              <Label htmlFor="custom-email-footer" className="text-xs text-muted-foreground">
                Custom Email Footer
              </Label>
              <Textarea
                id="custom-email-footer"
                value={customEmailFooter}
                onChange={(e) => setCustomEmailFooter(e.target.value)}
                placeholder="Licensed & Insured | Serving Phoenix since 2015"
                rows={2}
                className="text-sm"
              />
              <p className="text-xs text-muted-foreground">
                Appended to all emails via the {"{{custom_footer}}"} tag.
              </p>
            </div>

            <div className="flex flex-col gap-1.5">
              <Label htmlFor="custom-sms-signature" className="text-xs text-muted-foreground">
                Custom SMS Signature
              </Label>
              <Input
                id="custom-sms-signature"
                value={customSmsSignature}
                onChange={(e) => setCustomSmsSignature(e.target.value)}
                placeholder="-- Blue Wave Pools"
                className="text-sm"
              />
              <p className="text-xs text-muted-foreground">
                Appended to all SMS via the {"{{sms_signature}}"} tag. Defaults to "-- Company Name" if empty.
              </p>
            </div>
          </div>

          <div className="flex justify-end pt-2 border-t border-border/40">
            <Button
              size="sm"
              onClick={handleSaveOrgSettings}
              disabled={settingsSaving}
              className="cursor-pointer"
            >
              <SaveIcon className="h-3.5 w-3.5 mr-1.5" />
              Save Settings
            </Button>
          </div>
        </div>
      </div>
    </div>
  )
}
