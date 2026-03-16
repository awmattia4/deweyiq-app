"use client"

/**
 * BroadcastMessaging -- Owner sends bulk email/SMS to customer segments.
 *
 * Features:
 * - Segment selector (All Active, All Customers, Tech's Route, Specific Customers)
 * - Count preview: "Will reach X customers (Y with email, Z with phone)"
 * - Channel checkboxes: Email / SMS
 * - Compose area: subject, body (with merge tag helper), SMS text (with char count)
 * - Confirmation dialog before send
 * - Broadcast history (last 10) with delivery stats
 *
 * Plain React state — no zod/hookform (MEMORY.md pattern).
 * Owner-only (role check in server actions).
 */

import { useState, useEffect, useTransition, useCallback } from "react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Textarea } from "@/components/ui/textarea"
import { Label } from "@/components/ui/label"
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog"
import { Badge } from "@/components/ui/badge"
import { Separator } from "@/components/ui/separator"
import { Loader2, Send, Users, CheckCircle, AlertCircle } from "lucide-react"
import { cn } from "@/lib/utils"
import {
  getSegmentCount,
  sendBroadcast,
  getBroadcastHistory,
} from "@/actions/broadcast"
import type { BroadcastSegment, BroadcastHistoryEntry } from "@/actions/broadcast"

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface BroadcastMessagingProps {
  techProfiles: Array<{ id: string; fullName: string }>
  initialHistory: BroadcastHistoryEntry[]
}

type SegmentOption =
  | "active"
  | "all"
  | "tech_route"
  | "individual"

const SEGMENT_LABELS: Record<SegmentOption, string> = {
  active: "All Active Customers",
  all: "All Customers (including inactive)",
  tech_route: "Customers on a Tech's Route",
  individual: "Specific Customers",
}

// Character count thresholds for SMS segments (160 chars = 1 segment)
const SMS_SEGMENT_SIZE = 160

function getSmsSegmentCount(text: string): number {
  if (!text) return 0
  return Math.ceil(text.length / SMS_SEGMENT_SIZE)
}

// ---------------------------------------------------------------------------
// MergeTagButton
// ---------------------------------------------------------------------------

function MergeTagButton({
  tag,
  onClick,
}: {
  tag: string
  onClick: (tag: string) => void
}) {
  return (
    <button
      type="button"
      onClick={() => onClick(tag)}
      className="cursor-pointer rounded px-2 py-0.5 text-xs font-mono bg-muted/60 hover:bg-muted text-muted-foreground hover:text-foreground transition-colors border border-border/50"
    >
      {tag}
    </button>
  )
}

// ---------------------------------------------------------------------------
// BroadcastHistory
// ---------------------------------------------------------------------------

function BroadcastHistory({ entries }: { entries: BroadcastHistoryEntry[] }) {
  if (entries.length === 0) {
    return (
      <p className="text-sm text-muted-foreground italic">
        No broadcasts sent yet.
      </p>
    )
  }

  return (
    <div className="flex flex-col gap-3">
      {entries.map((entry) => (
        <div
          key={entry.id}
          className="rounded-lg border border-border bg-muted/20 p-3"
        >
          <div className="flex items-start justify-between gap-2 flex-wrap">
            <div className="flex flex-col gap-0.5">
              <p className="text-sm font-medium leading-snug">{entry.subject || "(No subject)"}</p>
              <p className="text-xs text-muted-foreground">
                {entry.segment_label} &middot;{" "}
                {entry.channels.join(" + ").toUpperCase()}
              </p>
            </div>
            <div className="text-xs text-muted-foreground shrink-0">
              {new Date(entry.sent_at).toLocaleDateString("en-US", {
                month: "short",
                day: "numeric",
                year: "numeric",
                hour: "numeric",
                minute: "2-digit",
              })}
            </div>
          </div>
          <div className="flex items-center gap-3 mt-2 flex-wrap">
            <span className="text-xs text-muted-foreground">
              {entry.total_targeted} targeted
            </span>
            {entry.channels.includes("email") && (
              <span
                className={cn(
                  "text-xs",
                  entry.email_failed > 0
                    ? "text-destructive"
                    : "text-green-500"
                )}
              >
                {entry.email_sent} email sent
                {entry.email_failed > 0 && ` / ${entry.email_failed} failed`}
              </span>
            )}
            {entry.channels.includes("sms") && (
              <span
                className={cn(
                  "text-xs",
                  entry.sms_failed > 0
                    ? "text-destructive"
                    : "text-green-500"
                )}
              >
                {entry.sms_sent} SMS sent
                {entry.sms_failed > 0 && ` / ${entry.sms_failed} failed`}
              </span>
            )}
          </div>
        </div>
      ))}
    </div>
  )
}

// ---------------------------------------------------------------------------
// BroadcastMessaging
// ---------------------------------------------------------------------------

export function BroadcastMessaging({
  techProfiles,
  initialHistory,
}: BroadcastMessagingProps) {
  // ── Segment state ────────────────────────────────────────────────────────
  const [segmentType, setSegmentType] = useState<SegmentOption>("active")
  const [selectedTechId, setSelectedTechId] = useState<string>(
    techProfiles[0]?.id ?? ""
  )
  // Individual customer IDs — left out for now as it requires a full customer picker
  // The segment type 'individual' is supported in the server action

  // ── Count preview ────────────────────────────────────────────────────────
  const [segmentCount, setSegmentCount] = useState<{
    count: number
    hasEmail: number
    hasPhone: number
  } | null>(null)
  const [countLoading, setCountLoading] = useState(false)

  // ── Channel state ────────────────────────────────────────────────────────
  const [emailEnabled, setEmailEnabled] = useState(true)
  const [smsEnabled, setSmsEnabled] = useState(false)

  // ── Compose state ────────────────────────────────────────────────────────
  const [subject, setSubject] = useState("")
  const [bodyHtml, setBodyHtml] = useState("")
  const [smsText, setSmsText] = useState("")

  // ── Send state ───────────────────────────────────────────────────────────
  const [showConfirm, setShowConfirm] = useState(false)
  const [sending, setSending] = useState(false)
  const [sendResult, setSendResult] = useState<{
    success: boolean
    message: string
  } | null>(null)

  // ── History state ────────────────────────────────────────────────────────
  const [history, setHistory] = useState<BroadcastHistoryEntry[]>(initialHistory)

  // ── Build segment from current UI state ─────────────────────────────────

  const buildSegment = useCallback((): BroadcastSegment => {
    if (segmentType === "all") return { type: "all" }
    if (segmentType === "active") return { type: "active" }
    if (segmentType === "tech_route") {
      return { type: "tech_route", techId: selectedTechId }
    }
    return { type: "active" } // fallback
  }, [segmentType, selectedTechId])

  // ── Load segment count when segment changes ──────────────────────────────

  useEffect(() => {
    const segment = buildSegment()
    setSegmentCount(null)
    setCountLoading(true)

    getSegmentCount(segment).then((result) => {
      setCountLoading(false)
      if ("error" in result) {
        console.error("[BroadcastMessaging] Segment count error:", result.error)
      } else {
        setSegmentCount(result)
      }
    })
  }, [buildSegment])

  // ── Insert merge tag at cursor position in a field ───────────────────────

  const insertIntoBody = (tag: string) => {
    setBodyHtml((prev) => prev + tag)
  }

  const insertIntoSms = (tag: string) => {
    setSmsText((prev) => prev + tag)
  }

  // ── Validation ───────────────────────────────────────────────────────────

  const isValid = (): boolean => {
    if (!emailEnabled && !smsEnabled) return false
    if (emailEnabled && !subject.trim()) return false
    if (emailEnabled && !bodyHtml.trim()) return false
    if (smsEnabled && !smsText.trim()) return false
    return true
  }

  // ── Send handler ──────────────────────────────────────────────────────────

  const handleSend = async () => {
    setShowConfirm(false)
    setSending(true)
    setSendResult(null)

    const channels: ("email" | "sms")[] = []
    if (emailEnabled) channels.push("email")
    if (smsEnabled) channels.push("sms")

    const result = await sendBroadcast({
      segment: buildSegment(),
      subject,
      bodyHtml,
      smsText,
      channels,
    })

    setSending(false)

    if ("error" in result) {
      setSendResult({ success: false, message: result.error })
    } else {
      const parts: string[] = []
      if (result.emailSent > 0) parts.push(`${result.emailSent} email${result.emailSent !== 1 ? "s" : ""}`)
      if (result.smsSent > 0) parts.push(`${result.smsSent} SMS`)
      const successMsg =
        parts.length > 0
          ? `Sent ${parts.join(" and ")} successfully.`
          : "Broadcast complete — no messages delivered (customers may have no contact info)."
      setSendResult({ success: true, message: successMsg })

      // Refresh history
      const freshHistory = await getBroadcastHistory()
      if (!("error" in freshHistory)) {
        setHistory(freshHistory)
      }
    }
  }

  // ── Build confirmation message ─────────────────────────────────────────

  const buildConfirmMessage = () => {
    if (!segmentCount) return "Send this broadcast?"
    const channels: string[] = []
    if (emailEnabled && segmentCount.hasEmail > 0) {
      channels.push(`email to ${segmentCount.hasEmail} customer${segmentCount.hasEmail !== 1 ? "s" : ""}`)
    }
    if (smsEnabled && segmentCount.hasPhone > 0) {
      channels.push(`SMS to ${segmentCount.hasPhone} customer${segmentCount.hasPhone !== 1 ? "s" : ""}`)
    }
    if (channels.length === 0) return "Send this broadcast?"
    return `Send ${channels.join(" and ")}?`
  }

  // ── Render ───────────────────────────────────────────────────────────────

  return (
    <div className="flex flex-col gap-6">

      {/* ── Segment selector ─────────────────────────────────────────────── */}
      <div className="flex flex-col gap-3">
        <Label className="text-sm font-medium">Who to send to</Label>
        <div className="flex flex-col gap-2">
          {(["active", "all", "tech_route"] as SegmentOption[]).map((option) => (
            <label
              key={option}
              className="flex items-center gap-3 cursor-pointer"
            >
              <input
                type="radio"
                name="segment"
                value={option}
                checked={segmentType === option}
                onChange={() => setSegmentType(option)}
                className="accent-primary w-4 h-4"
              />
              <span className="text-sm">{SEGMENT_LABELS[option]}</span>
            </label>
          ))}
        </div>

        {/* Tech selector when tech_route is active */}
        {segmentType === "tech_route" && (
          <div className="ml-7">
            <Label className="text-xs text-muted-foreground mb-1 block">
              Select technician
            </Label>
            {techProfiles.length === 0 ? (
              <p className="text-sm text-muted-foreground italic">
                No technicians found.
              </p>
            ) : (
              <select
                value={selectedTechId}
                onChange={(e) => setSelectedTechId(e.target.value)}
                className="w-full rounded-md border border-input bg-background px-3 py-1.5 text-sm focus:outline-none focus:ring-1 focus:ring-ring"
              >
                {techProfiles.map((tech) => (
                  <option key={tech.id} value={tech.id}>
                    {tech.fullName}
                  </option>
                ))}
              </select>
            )}
          </div>
        )}

        {/* Segment count preview */}
        <div className="ml-1 mt-1 min-h-[20px]">
          {countLoading ? (
            <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
              <Loader2 className="h-3 w-3 animate-spin" />
              Counting customers...
            </div>
          ) : segmentCount ? (
            <p className="text-xs text-muted-foreground">
              <span className="font-medium text-foreground">{segmentCount.count}</span>{" "}
              customer{segmentCount.count !== 1 ? "s" : ""} in this segment
              {segmentCount.count > 0 && (
                <>
                  {" "}
                  ({segmentCount.hasEmail} with email
                  {segmentCount.hasPhone > 0 && `, ${segmentCount.hasPhone} with phone`})
                </>
              )}
            </p>
          ) : null}
        </div>
      </div>

      <Separator />

      {/* ── Channel selector ──────────────────────────────────────────────── */}
      <div className="flex flex-col gap-2">
        <Label className="text-sm font-medium">Channels</Label>
        <div className="flex gap-4">
          <label className="flex items-center gap-2 cursor-pointer">
            <input
              type="checkbox"
              checked={emailEnabled}
              onChange={(e) => setEmailEnabled(e.target.checked)}
              className="accent-primary w-4 h-4"
            />
            <span className="text-sm">Email</span>
            {segmentCount && segmentCount.hasEmail > 0 && (
              <Badge variant="outline" className="text-xs h-5">
                {segmentCount.hasEmail}
              </Badge>
            )}
          </label>
          <label className="flex items-center gap-2 cursor-pointer">
            <input
              type="checkbox"
              checked={smsEnabled}
              onChange={(e) => setSmsEnabled(e.target.checked)}
              className="accent-primary w-4 h-4"
            />
            <span className="text-sm">SMS</span>
            {segmentCount && segmentCount.hasPhone > 0 && (
              <Badge variant="outline" className="text-xs h-5">
                {segmentCount.hasPhone}
              </Badge>
            )}
          </label>
        </div>
      </div>

      <Separator />

      {/* ── Compose area ──────────────────────────────────────────────────── */}
      <div className="flex flex-col gap-4">
        <Label className="text-sm font-medium">Compose message</Label>

        {/* Email fields */}
        {emailEnabled && (
          <div className="flex flex-col gap-3">
            <div>
              <Label htmlFor="broadcast-subject" className="text-xs text-muted-foreground mb-1.5 block">
                Email subject
              </Label>
              <Input
                id="broadcast-subject"
                placeholder="e.g. Holiday Schedule Update from {{company_name}}"
                value={subject}
                onChange={(e) => setSubject(e.target.value)}
              />
            </div>

            <div>
              <div className="flex items-center justify-between mb-1.5">
                <Label htmlFor="broadcast-body" className="text-xs text-muted-foreground">
                  Email body
                </Label>
                <div className="flex items-center gap-1 flex-wrap justify-end">
                  <span className="text-xs text-muted-foreground mr-1">Insert:</span>
                  <MergeTagButton tag="{{customer_name}}" onClick={insertIntoBody} />
                  <MergeTagButton tag="{{company_name}}" onClick={insertIntoBody} />
                </div>
              </div>
              <Textarea
                id="broadcast-body"
                placeholder="Hi {{customer_name}},&#10;&#10;We wanted to let you know..."
                value={bodyHtml}
                onChange={(e) => setBodyHtml(e.target.value)}
                rows={6}
                className="font-mono text-sm"
              />
              <p className="text-xs text-muted-foreground mt-1">
                Plain text or HTML. Merge tags like{" "}
                <code className="font-mono text-xs bg-muted rounded px-1">
                  {"{{customer_name}}"}
                </code>{" "}
                are replaced per customer.
              </p>
            </div>
          </div>
        )}

        {/* SMS field */}
        {smsEnabled && (
          <div>
            <div className="flex items-center justify-between mb-1.5">
              <Label htmlFor="broadcast-sms" className="text-xs text-muted-foreground">
                SMS message
              </Label>
              <div className="flex items-center gap-1 flex-wrap justify-end">
                <span className="text-xs text-muted-foreground mr-1">Insert:</span>
                <MergeTagButton tag="{{customer_name}}" onClick={insertIntoSms} />
                <MergeTagButton tag="{{company_name}}" onClick={insertIntoSms} />
              </div>
            </div>
            <Textarea
              id="broadcast-sms"
              placeholder="{{company_name}}: Heads up — our holiday schedule is..."
              value={smsText}
              onChange={(e) => setSmsText(e.target.value)}
              rows={3}
            />
            <div className="flex items-center justify-between mt-1">
              <p className="text-xs text-muted-foreground">
                Merge tags replaced per customer.
              </p>
              <p
                className={cn(
                  "text-xs",
                  smsText.length > SMS_SEGMENT_SIZE
                    ? "text-amber-500"
                    : "text-muted-foreground"
                )}
              >
                {smsText.length} chars
                {smsText.length > 0 && (
                  <> &middot; {getSmsSegmentCount(smsText)} SMS segment{getSmsSegmentCount(smsText) !== 1 ? "s" : ""}</>
                )}
              </p>
            </div>
          </div>
        )}
      </div>

      {/* ── Send result feedback ──────────────────────────────────────────── */}
      {sendResult && (
        <div
          className={cn(
            "flex items-start gap-2 rounded-md p-3 text-sm",
            sendResult.success
              ? "bg-green-500/10 text-green-400 border border-green-500/20"
              : "bg-destructive/10 text-destructive border border-destructive/20"
          )}
        >
          {sendResult.success ? (
            <CheckCircle className="h-4 w-4 mt-0.5 shrink-0" />
          ) : (
            <AlertCircle className="h-4 w-4 mt-0.5 shrink-0" />
          )}
          {sendResult.message}
        </div>
      )}

      {/* ── Send button ───────────────────────────────────────────────────── */}
      <div className="flex items-center justify-between gap-4">
        <p className="text-xs text-muted-foreground">
          {!emailEnabled && !smsEnabled
            ? "Select at least one channel."
            : segmentCount?.count === 0
              ? "No customers in this segment."
              : null}
        </p>
        <Button
          onClick={() => setShowConfirm(true)}
          disabled={
            sending ||
            !isValid() ||
            segmentCount === null ||
            segmentCount.count === 0
          }
          className="cursor-pointer"
        >
          {sending ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            <Send className="h-4 w-4" />
          )}
          {sending ? "Sending..." : "Send Broadcast"}
        </Button>
      </div>

      {/* ── Confirmation dialog ───────────────────────────────────────────── */}
      <AlertDialog open={showConfirm} onOpenChange={setShowConfirm}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Confirm Broadcast</AlertDialogTitle>
            <AlertDialogDescription asChild>
              <div className="flex flex-col gap-2">
                <p>{buildConfirmMessage()}</p>
                {subject && emailEnabled && (
                  <p className="text-sm">
                    Subject: <span className="font-medium">{subject}</span>
                  </p>
                )}
                <p className="text-sm text-muted-foreground">
                  This action cannot be undone. All matching customers will receive
                  the message immediately.
                </p>
              </div>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel className="cursor-pointer">Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleSend}
              className="cursor-pointer"
            >
              Send Now
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* ── Broadcast history ─────────────────────────────────────────────── */}
      <Separator />

      <div className="flex flex-col gap-3">
        <div className="flex items-center gap-2">
          <Users className="h-4 w-4 text-muted-foreground" aria-hidden="true" />
          <h3 className="text-sm font-medium">Recent Broadcasts</h3>
        </div>
        <BroadcastHistory entries={history} />
      </div>
    </div>
  )
}
