"use client"

import { useState, useTransition, useCallback, useRef } from "react"
import Link from "next/link"
import { toast } from "sonner"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Textarea } from "@/components/ui/textarea"
import { Label } from "@/components/ui/label"
import { Badge } from "@/components/ui/badge"
import { Switch } from "@/components/ui/switch"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { TierBuilder } from "@/components/projects/tier-builder"
import { ProposalLineItems } from "@/components/projects/proposal-line-items"
import { AddonBuilder } from "@/components/projects/addon-builder"
import { PaymentScheduleBuilder } from "@/components/projects/payment-schedule-builder"
import {
  updateProposal,
  createProposal,
  createNewProposalVersion,
} from "@/actions/projects-proposals"
import type { ProposalDetail } from "@/actions/projects-proposals"
import type { ProjectDetail } from "@/actions/projects"

// ─── Pricing method config ─────────────────────────────────────────────────────

const PRICING_METHODS = [
  { value: "lump_sum", label: "Lump Sum" },
  { value: "cost_plus", label: "Cost Plus" },
  { value: "time_and_materials", label: "Time & Materials" },
  { value: "fixed_per_phase", label: "Fixed Per Phase" },
]

// ─── Status badge ─────────────────────────────────────────────────────────────

function ProposalStatusBadge({ status }: { status: string }) {
  const config: Record<string, { label: string; className: string }> = {
    draft: { label: "Draft", className: "bg-muted text-muted-foreground" },
    sent: { label: "Sent", className: "bg-blue-500/10 text-blue-600 border-blue-500/20" },
    approved: {
      label: "Approved",
      className: "bg-green-500/10 text-green-600 border-green-500/20",
    },
    declined: { label: "Declined", className: "bg-destructive/10 text-destructive" },
    superseded: {
      label: "Superseded",
      className: "bg-muted text-muted-foreground line-through",
    },
    expired: { label: "Expired", className: "bg-orange-500/10 text-orange-600" },
  }
  const cfg = config[status] ?? { label: status, className: "bg-muted text-muted-foreground" }
  return (
    <Badge variant="outline" className={`text-xs ${cfg.className}`}>
      {cfg.label}
    </Badge>
  )
}

// ─── Section wrapper ──────────────────────────────────────────────────────────

interface SectionProps {
  title: string
  children: React.ReactNode
}

function Section({ title, children }: SectionProps) {
  return (
    <Card>
      <CardHeader className="pb-4">
        <CardTitle className="text-base font-semibold">{title}</CardTitle>
      </CardHeader>
      <CardContent>{children}</CardContent>
    </Card>
  )
}

// ─── ProposalBuilder ──────────────────────────────────────────────────────────

interface ProposalBuilderProps {
  project: ProjectDetail
  initialProposal: ProposalDetail | null
  error?: string
}

/**
 * ProposalBuilder — Multi-section office proposal builder.
 *
 * All sections are visible and scrollable — NOT a wizard/stepper.
 * Sections: Scope & Settings, Tiers, Line Items, Add-ons, Payment Schedule, Summary.
 *
 * Auto-saves on field blur (debounced). Versioning via "Create New Version" button.
 */
export function ProposalBuilder({ project, initialProposal, error }: ProposalBuilderProps) {
  const [proposal, setProposal] = useState<ProposalDetail | null>(initialProposal)
  const [isPending, startTransition] = useTransition()

  // Scope & Settings field states (controlled strings per MEMORY.md decimal input pattern)
  const [scopeInput, setScopeInput] = useState(initialProposal?.scope_description ?? "")
  const [termsInput, setTermsInput] = useState(initialProposal?.terms_and_conditions ?? "")
  const [warrantyInput, setWarrantyInput] = useState(initialProposal?.warranty_info ?? "")
  const [cancellationInput, setCancellationInput] = useState(
    initialProposal?.cancellation_policy ?? ""
  )

  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  const handleProposalUpdate = useCallback((updated: ProposalDetail) => {
    setProposal(updated)
  }, [])

  const handleSaveField = useCallback(
    (patch: Parameters<typeof updateProposal>[1]) => {
      if (!proposal) return
      if (debounceRef.current) clearTimeout(debounceRef.current)
      debounceRef.current = setTimeout(() => {
        startTransition(async () => {
          const result = await updateProposal(proposal.id, patch)
          if ("error" in result) {
            toast.error(result.error)
          } else {
            setProposal(result.data)
          }
        })
      }, 600)
    },
    [proposal]
  )

  const handleCreateProposal = useCallback(() => {
    startTransition(async () => {
      const result = await createProposal(project.id)
      if ("error" in result) {
        toast.error(result.error)
      } else {
        setProposal(result.data)
        setScopeInput(result.data.scope_description ?? "")
        toast.success("Proposal created")
      }
    })
  }, [project.id])

  const handleCreateNewVersion = useCallback(() => {
    if (!proposal) return
    startTransition(async () => {
      const result = await createNewProposalVersion(proposal.id)
      if ("error" in result) {
        toast.error(result.error)
      } else {
        setProposal(result.data)
        setScopeInput(result.data.scope_description ?? "")
        setTermsInput(result.data.terms_and_conditions ?? "")
        setWarrantyInput(result.data.warranty_info ?? "")
        setCancellationInput(result.data.cancellation_policy ?? "")
        toast.success(`Version ${result.data.version} created`)
      }
    })
  }, [proposal])

  // ── No proposal state ────────────────────────────────────────────────────────

  if (!proposal) {
    return (
      <div className="flex flex-col gap-6 p-6">
        <div className="flex items-center justify-between">
          <div>
            <Link
              href={`/projects/${project.id}`}
              className="text-xs text-muted-foreground hover:text-foreground mb-1 inline-block"
            >
              &larr; {project.project_number ?? "Project"}: {project.name}
            </Link>
            <h1 className="text-2xl font-bold tracking-tight">Proposal</h1>
          </div>
        </div>

        <Card>
          <CardContent className="pt-6 flex flex-col items-center gap-4 py-12">
            <p className="text-sm text-muted-foreground">
              {error ?? "No active proposal found."}
            </p>
            <Button onClick={handleCreateProposal} disabled={isPending}>
              {isPending ? "Creating..." : "Create Proposal"}
            </Button>
          </CardContent>
        </Card>
      </div>
    )
  }

  // ── Main builder ─────────────────────────────────────────────────────────────

  const contractTotal = parseFloat(proposal.total_amount ?? "0") || 0

  return (
    <div className="flex flex-col gap-6 p-6 max-w-5xl mx-auto">
      {/* Page header */}
      <div className="flex items-start justify-between flex-wrap gap-3">
        <div>
          <Link
            href={`/projects/${project.id}`}
            className="text-xs text-muted-foreground hover:text-foreground mb-1 inline-block"
          >
            &larr; {project.project_number ?? "Project"}: {project.name}
          </Link>
          <div className="flex items-center gap-3">
            <h1 className="text-2xl font-bold tracking-tight">Proposal</h1>
            <ProposalStatusBadge status={proposal.status} />
            <span className="text-sm text-muted-foreground">v{proposal.version}</span>
          </div>
        </div>
      </div>

      {/* 1. Scope & Settings */}
      <Section title="Scope & Settings">
        <div className="space-y-5">
          {/* Pricing method + show line item detail */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <Label className="text-sm">Pricing Method</Label>
              <Select
                value={proposal.pricing_method}
                onValueChange={(val) => {
                  setProposal((prev) => (prev ? { ...prev, pricing_method: val } : prev))
                  handleSaveField({ pricing_method: val })
                }}
              >
                <SelectTrigger className="h-9">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {PRICING_METHODS.map((m) => (
                    <SelectItem key={m.value} value={m.value}>
                      {m.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <p className="text-xs text-muted-foreground">
                Controls how cost is presented to the customer.
              </p>
            </div>

            <div className="space-y-1.5">
              <Label className="text-sm">Show Line Item Detail</Label>
              <div className="flex items-center gap-3 h-9">
                <Switch
                  checked={proposal.show_line_item_detail}
                  onCheckedChange={(checked) => {
                    setProposal((prev) =>
                      prev ? { ...prev, show_line_item_detail: checked } : prev
                    )
                    handleSaveField({ show_line_item_detail: checked })
                  }}
                />
                <span className="text-sm text-muted-foreground">
                  {proposal.show_line_item_detail
                    ? "Customer sees individual line items"
                    : "Customer sees totals only"}
                </span>
              </div>
              <p className="text-xs text-muted-foreground">
                Controls line item visibility on the customer approval page.
              </p>
            </div>
          </div>

          {/* Scope description */}
          <div className="space-y-1.5">
            <Label className="text-sm">Scope of Work</Label>
            <Textarea
              value={scopeInput}
              onChange={(e) => setScopeInput(e.target.value)}
              onBlur={() => handleSaveField({ scope_description: scopeInput || null })}
              placeholder="Describe the full scope of work for this project..."
              className="min-h-[100px] text-sm resize-y"
              rows={4}
            />
          </div>

          {/* Terms & conditions */}
          <div className="space-y-1.5">
            <Label className="text-sm">Terms & Conditions</Label>
            <Textarea
              value={termsInput}
              onChange={(e) => setTermsInput(e.target.value)}
              onBlur={() => handleSaveField({ terms_and_conditions: termsInput || null })}
              placeholder="Payment terms, start/completion dates, change order policy..."
              className="min-h-[80px] text-sm resize-y"
              rows={3}
            />
          </div>

          {/* Warranty + cancellation (two columns) */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <Label className="text-sm">Warranty Information</Label>
              <Textarea
                value={warrantyInput}
                onChange={(e) => setWarrantyInput(e.target.value)}
                onBlur={() => handleSaveField({ warranty_info: warrantyInput || null })}
                placeholder="What is covered, duration, exclusions..."
                className="min-h-[80px] text-sm resize-y"
                rows={3}
              />
            </div>
            <div className="space-y-1.5">
              <Label className="text-sm">Cancellation Policy</Label>
              <Textarea
                value={cancellationInput}
                onChange={(e) => setCancellationInput(e.target.value)}
                onBlur={() =>
                  handleSaveField({ cancellation_policy: cancellationInput || null })
                }
                placeholder="Conditions under which deposit is forfeited, notice requirements..."
                className="min-h-[80px] text-sm resize-y"
                rows={3}
              />
            </div>
          </div>
        </div>
      </Section>

      {/* 2. Tiers */}
      <Section title="Good / Better / Best Tiers">
        <TierBuilder proposal={proposal} onProposalUpdate={handleProposalUpdate} />
      </Section>

      {/* 3. Line Items */}
      <Section title="Line Items">
        <ProposalLineItems proposal={proposal} onProposalUpdate={handleProposalUpdate} />
      </Section>

      {/* 4. Add-ons */}
      <Section title="Optional Add-ons">
        <AddonBuilder proposal={proposal} onProposalUpdate={handleProposalUpdate} />
      </Section>

      {/* 5. Payment Schedule */}
      <Section title="Payment Schedule">
        <PaymentScheduleBuilder
          proposal={proposal}
          projectId={project.id}
          phases={project.phases}
          onProposalUpdate={handleProposalUpdate}
        />
      </Section>

      {/* 6. Summary */}
      <Section title="Summary">
        <div className="space-y-4">
          {/* Version + status info */}
          <div className="flex items-center justify-between text-sm">
            <span className="text-muted-foreground">Version</span>
            <span className="font-medium">v{proposal.version}</span>
          </div>
          <div className="flex items-center justify-between text-sm">
            <span className="text-muted-foreground">Status</span>
            <ProposalStatusBadge status={proposal.status} />
          </div>
          <div className="flex items-center justify-between text-sm">
            <span className="text-muted-foreground">Pricing Method</span>
            <span className="font-medium">
              {PRICING_METHODS.find((m) => m.value === proposal.pricing_method)?.label ??
                proposal.pricing_method}
            </span>
          </div>

          {/* Tier prices */}
          {proposal.tiers.length > 0 && (
            <div className="flex items-start justify-between text-sm">
              <span className="text-muted-foreground">Tier Prices</span>
              <div className="text-right space-y-1">
                {proposal.tiers.map((t) => (
                  <div key={t.id}>
                    <span className="text-muted-foreground">{t.name}: </span>
                    <span className="font-medium">
                      {parseFloat(t.price).toLocaleString("en-US", {
                        style: "currency",
                        currency: "USD",
                      })}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Add-ons total */}
          {proposal.addons.length > 0 && (
            <div className="flex items-center justify-between text-sm">
              <span className="text-muted-foreground">Available Add-ons</span>
              <span className="font-medium">
                +
                {proposal.addons
                  .reduce((sum, a) => sum + (parseFloat(a.price) || 0), 0)
                  .toLocaleString("en-US", { style: "currency", currency: "USD" })}
              </span>
            </div>
          )}

          {/* Contract total */}
          <div className="flex items-center justify-between text-base font-semibold border-t border-border pt-3 mt-3">
            <span>Contract Total</span>
            <span>
              {contractTotal.toLocaleString("en-US", { style: "currency", currency: "USD" })}
            </span>
          </div>

          {/* Create new version */}
          <div className="pt-2">
            <Button
              variant="outline"
              size="sm"
              onClick={handleCreateNewVersion}
              disabled={isPending}
              className="w-full"
            >
              {isPending
                ? "Creating..."
                : `Create New Version (v${proposal.version + 1})`}
            </Button>
            <p className="text-xs text-muted-foreground mt-1.5 text-center">
              Supersedes current version and creates a new editable copy with all items copied.
            </p>
          </div>
        </div>
      </Section>
    </div>
  )
}
