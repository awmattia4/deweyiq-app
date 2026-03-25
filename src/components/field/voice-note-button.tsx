"use client"

/**
 * VoiceNoteButton — AI-powered voice-to-structured-data for field techs.
 *
 * Flow:
 *   1. Tech taps the mic button → browser starts recording via Web Speech API
 *   2. Speech Recognition produces a live transcript (interim + final)
 *   3. When recording stops, raw transcript is sent to structureVoiceNote (Claude)
 *   4. Structured results (chemistry, dosing, checklist, issues) render below
 *   5. Tech taps "Apply" → onStructured callback fires with extracted data
 *
 * Transcription is 100% free (browser Web Speech API, backed by device OS).
 * Only Claude inference costs money (haiku = cents per note).
 *
 * iOS note: webkitSpeechRecognition works in Safari PWA standalone mode on
 * iOS 17+. Older iOS devices fall back gracefully with a not-supported message.
 */

import { useState, useRef, useCallback, useEffect } from "react"
import { Mic, MicOff, Loader2, CheckCircle } from "lucide-react"
import { Button } from "@/components/ui/button"
import { cn } from "@/lib/utils"
import { structureVoiceNote } from "@/actions/ai-voice"
import type { StructuredVoiceData, PoolContext } from "@/actions/ai-voice"

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type { StructuredVoiceData }

interface VoiceNoteButtonProps {
  /** Called with the raw transcript text once recording ends */
  onTranscript?: (text: string) => void
  /** Called when user taps "Apply" with the AI-structured result */
  onStructured?: (data: StructuredVoiceData) => void
  /** Pool context passed to AI for better extraction accuracy */
  poolContext?: PoolContext
  /** Additional class names for the outer wrapper */
  className?: string
}

type RecordingState = "idle" | "recording" | "processing" | "done" | "error"

// ---------------------------------------------------------------------------
// Web Speech API type shim (not in TypeScript stdlib)
// ---------------------------------------------------------------------------

interface SpeechRecognitionEvent extends Event {
  results: SpeechRecognitionResultList
  resultIndex: number
}

interface SpeechRecognitionErrorEvent extends Event {
  error: string
}

interface SpeechRecognitionInstance extends EventTarget {
  continuous: boolean
  interimResults: boolean
  lang: string
  onresult: ((event: SpeechRecognitionEvent) => void) | null
  onerror: ((event: SpeechRecognitionErrorEvent) => void) | null
  onend: (() => void) | null
  start: () => void
  stop: () => void
}

declare global {
  interface Window {
    SpeechRecognition?: new () => SpeechRecognitionInstance
    webkitSpeechRecognition?: new () => SpeechRecognitionInstance
  }
}

// ---------------------------------------------------------------------------
// Severity badge
// ---------------------------------------------------------------------------

function SeverityBadge({ severity }: { severity: "low" | "medium" | "high" }) {
  return (
    <span
      className={cn(
        "inline-flex items-center rounded px-1.5 py-0.5 text-[10px] font-bold uppercase leading-none",
        severity === "high" && "bg-red-500/20 text-red-300 border border-red-500/40",
        severity === "medium" && "bg-amber-500/20 text-amber-300 border border-amber-500/40",
        severity === "low" && "bg-muted/60 text-muted-foreground border border-border/60"
      )}
    >
      {severity}
    </span>
  )
}

// ---------------------------------------------------------------------------
// Structured results display
// ---------------------------------------------------------------------------

function StructuredResults({
  data,
  onApply,
}: {
  data: StructuredVoiceData
  onApply: () => void
}) {
  const hasChemistry =
    data.chemistryReadings && Object.keys(data.chemistryReadings).length > 0
  const hasDosing = data.dosingAmounts && data.dosingAmounts.length > 0
  const hasChecklist = data.checklistUpdates && data.checklistUpdates.length > 0
  const hasIssues = data.issuesFound && data.issuesFound.length > 0
  const hasFollowUp = Boolean(data.suggestedFollowUp)

  return (
    <div className="rounded-xl border border-border/60 bg-card overflow-hidden">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-2.5 bg-muted/30 border-b border-border/40">
        <span className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
          Extracted Data
        </span>
        <Button size="sm" onClick={onApply} className="h-7 px-3 text-xs">
          <CheckCircle className="size-3 mr-1.5" />
          Apply
        </Button>
      </div>

      <div className="divide-y divide-border/30">
        {/* Clean notes */}
        {data.notes && (
          <div className="px-4 py-3">
            <p className="text-xs font-medium text-muted-foreground mb-1">Notes</p>
            <p className="text-sm leading-relaxed">{data.notes}</p>
          </div>
        )}

        {/* Chemistry readings */}
        {hasChemistry && (
          <div className="px-4 py-3">
            <p className="text-xs font-medium text-muted-foreground mb-2">Chemistry Readings</p>
            <div className="grid grid-cols-2 gap-x-4 gap-y-1.5">
              {Object.entries(data.chemistryReadings!).map(([key, value]) => (
                <div key={key} className="flex items-center justify-between">
                  <span className="text-xs text-muted-foreground capitalize">
                    {key.replace(/([A-Z])/g, " $1").trim()}
                  </span>
                  <span className="text-sm font-medium tabular-nums">{value}</span>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Dosing amounts */}
        {hasDosing && (
          <div className="px-4 py-3">
            <p className="text-xs font-medium text-muted-foreground mb-2">Chemicals Added</p>
            <div className="flex flex-col gap-1.5">
              {data.dosingAmounts!.map((dose, i) => (
                <div key={i} className="flex items-center justify-between">
                  <span className="text-sm">{dose.chemical}</span>
                  <span className="text-sm font-medium tabular-nums">
                    {dose.amount} {dose.unit}
                  </span>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Checklist updates */}
        {hasChecklist && (
          <div className="px-4 py-3">
            <p className="text-xs font-medium text-muted-foreground mb-2">Checklist</p>
            <div className="flex flex-col gap-1.5">
              {data.checklistUpdates!.map((update, i) => (
                <div key={i} className="flex items-start gap-2">
                  <span
                    className={cn(
                      "text-xs mt-0.5 shrink-0 font-medium",
                      update.completed ? "text-green-400" : "text-muted-foreground"
                    )}
                  >
                    {update.completed ? "Done" : "Skip"}
                  </span>
                  <div>
                    <span className="text-sm">{update.taskId}</span>
                    {update.notes && (
                      <p className="text-xs text-muted-foreground mt-0.5">{update.notes}</p>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Issues found */}
        {hasIssues && (
          <div className="px-4 py-3">
            <p className="text-xs font-medium text-muted-foreground mb-2">Issues Found</p>
            <div className="flex flex-col gap-2">
              {data.issuesFound!.map((issue, i) => (
                <div key={i} className="flex items-start gap-2">
                  <SeverityBadge severity={issue.severity} />
                  <span className="text-sm leading-tight">{issue.description}</span>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Suggested follow-up */}
        {hasFollowUp && (
          <div className="px-4 py-3">
            <p className="text-xs font-medium text-muted-foreground mb-1">Suggested Follow-up</p>
            <p className="text-sm text-muted-foreground leading-relaxed italic">
              {data.suggestedFollowUp}
            </p>
          </div>
        )}
      </div>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Main component
// ---------------------------------------------------------------------------

/**
 * VoiceNoteButton
 *
 * Renders a 48px circular microphone button. On tap, starts browser speech
 * recognition. When recording ends, sends transcript to Claude for extraction.
 * Displays results in a compact card with an Apply button.
 */
export function VoiceNoteButton({
  onTranscript,
  onStructured,
  poolContext,
  className,
}: VoiceNoteButtonProps) {
  const [recordingState, setRecordingState] = useState<RecordingState>("idle")
  const [transcript, setTranscript] = useState("")
  const [interimTranscript, setInterimTranscript] = useState("")
  const [structured, setStructured] = useState<StructuredVoiceData | null>(null)
  const [errorMessage, setErrorMessage] = useState<string | null>(null)
  const [isSupported, setIsSupported] = useState<boolean | null>(null)

  const recognitionRef = useRef<SpeechRecognitionInstance | null>(null)
  const finalTranscriptRef = useRef<string>("")

  // Check browser support on mount (client-only)
  useEffect(() => {
    const supported =
      typeof window !== "undefined" &&
      (Boolean(window.SpeechRecognition) || Boolean(window.webkitSpeechRecognition))
    setIsSupported(supported)
  }, [])

  // Process transcript with AI
  const processTranscript = useCallback(
    async (text: string) => {
      if (!text.trim()) {
        setRecordingState("idle")
        return
      }

      onTranscript?.(text)
      setRecordingState("processing")
      setErrorMessage(null)

      try {
        const result = await structureVoiceNote(text, poolContext)

        if (result.success && result.structured) {
          setStructured(result.structured)
          setRecordingState("done")
        } else {
          setErrorMessage(result.error ?? "Failed to extract data from transcript")
          setRecordingState("error")
        }
      } catch {
        setErrorMessage("Network error — try again")
        setRecordingState("error")
      }
    },
    [onTranscript, poolContext]
  )

  const startRecording = useCallback(() => {
    const SpeechRecognitionCtor =
      window.SpeechRecognition ?? window.webkitSpeechRecognition

    if (!SpeechRecognitionCtor) return

    const recognition = new SpeechRecognitionCtor()
    recognition.continuous = true
    recognition.interimResults = true
    recognition.lang = "en-US"

    finalTranscriptRef.current = ""
    setTranscript("")
    setInterimTranscript("")
    setStructured(null)
    setErrorMessage(null)

    recognition.onresult = (event: SpeechRecognitionEvent) => {
      let interimText = ""
      let finalText = finalTranscriptRef.current

      for (let i = event.resultIndex; i < event.results.length; i++) {
        const result = event.results[i]
        if (result.isFinal) {
          finalText += result[0].transcript + " "
        } else {
          interimText += result[0].transcript
        }
      }

      finalTranscriptRef.current = finalText
      setTranscript(finalText)
      setInterimTranscript(interimText)
    }

    recognition.onerror = (event: SpeechRecognitionErrorEvent) => {
      if (event.error === "no-speech") {
        // Silence — reset to idle so the mic button isn't stuck red.
        // On some browsers (iOS/Safari), no-speech auto-ends recognition
        // without firing onend, leaving the button stuck in "recording" state.
        recognitionRef.current = null
        setRecordingState("idle")
        setInterimTranscript("")
        return
      }
      console.error("[VoiceNoteButton] Speech recognition error:", event.error)
      setErrorMessage(
        event.error === "not-allowed"
          ? "Microphone access denied — check browser permissions"
          : `Recognition error: ${event.error}`
      )
      setRecordingState("error")
    }

    recognition.onend = () => {
      recognitionRef.current = null
      const finalText = finalTranscriptRef.current.trim()
      if (finalText) {
        processTranscript(finalText)
      } else {
        setRecordingState("idle")
      }
    }

    recognitionRef.current = recognition

    try {
      recognition.start()
      setRecordingState("recording")
    } catch {
      setErrorMessage("Could not start microphone — check permissions")
      setRecordingState("error")
    }
  }, [processTranscript])

  const stopRecording = useCallback(() => {
    recognitionRef.current?.stop()
  }, [])

  const handleMicClick = useCallback(() => {
    if (recordingState === "recording") {
      stopRecording()
    } else if (recordingState === "idle" || recordingState === "error") {
      startRecording()
    }
  }, [recordingState, startRecording, stopRecording])

  const handleApply = useCallback(() => {
    if (structured) {
      onStructured?.(structured)
    }
  }, [structured, onStructured])

  const handleReset = useCallback(() => {
    setRecordingState("idle")
    setTranscript("")
    setInterimTranscript("")
    setStructured(null)
    setErrorMessage(null)
    finalTranscriptRef.current = ""
  }, [])

  // Render nothing on server or during initial hydration check
  if (isSupported === null) return null

  // Not supported — show inline notice
  if (isSupported === false) {
    return (
      <div
        className={cn(
          "flex items-center gap-2.5 rounded-xl border border-border/40 bg-muted/20 px-4 py-3",
          className
        )}
      >
        <MicOff className="h-4 w-4 text-muted-foreground/60 shrink-0" />
        <p className="text-xs text-muted-foreground/70 leading-relaxed">
          Voice notes are not supported in this browser. Use the system keyboard microphone
          for voice-to-text instead.
        </p>
      </div>
    )
  }

  // Determine display state for transcript area
  const displayTranscript =
    transcript + (interimTranscript ? interimTranscript : "")

  return (
    <div className={cn("flex flex-col gap-4", className)}>
      {/* ── Mic button row ──────────────────────────────────────────────────── */}
      <div className="flex items-center gap-4">
        {/* 48px circular mic button */}
        <button
          type="button"
          onClick={handleMicClick}
          disabled={recordingState === "processing"}
          aria-label={
            recordingState === "recording" ? "Stop recording" : "Start voice note"
          }
          className={cn(
            "relative flex items-center justify-center rounded-full transition-all",
            "h-12 w-12 shrink-0",
            "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2",
            "disabled:pointer-events-none disabled:opacity-50",
            recordingState === "recording"
              ? "bg-red-500 hover:bg-red-600 text-white"
              : recordingState === "processing"
                ? "bg-muted text-muted-foreground"
                : "bg-primary hover:bg-primary/90 text-primary-foreground"
          )}
        >
          {/* Pulse ring when recording */}
          {recordingState === "recording" && (
            <span className="absolute inset-0 rounded-full bg-red-500 animate-ping opacity-30" />
          )}

          {recordingState === "processing" ? (
            <Loader2 className="h-5 w-5 animate-spin" />
          ) : (
            <Mic className="h-5 w-5" />
          )}
        </button>

        {/* State label */}
        <div className="flex flex-col gap-0.5">
          <span className="text-sm font-medium">
            {recordingState === "idle" && "Voice Entry"}
            {recordingState === "recording" && "Recording..."}
            {recordingState === "processing" && "Extracting data..."}
            {recordingState === "done" && "Done — review below"}
            {recordingState === "error" && "Recording failed"}
          </span>
          <span className="text-xs text-muted-foreground">
            {recordingState === "idle" && "Auto-fills chemistry, tasks & notes"}
            {recordingState === "recording" && "Tap again to stop"}
            {recordingState === "processing" && "Claude is analyzing your notes"}
            {recordingState === "done" && "Apply to fill chemistry, tasks & notes"}
            {recordingState === "error" && (errorMessage ?? "Tap to try again")}
          </span>
        </div>

        {/* Reset button (after done or error) */}
        {(recordingState === "done" || recordingState === "error") && (
          <button
            type="button"
            onClick={handleReset}
            className="ml-auto text-xs text-muted-foreground/70 hover:text-muted-foreground underline underline-offset-2 transition-colors"
          >
            Clear
          </button>
        )}
      </div>

      {/* ── Live / final transcript ─────────────────────────────────────────── */}
      {(recordingState === "recording" || displayTranscript) && (
        <div className="relative">
          <textarea
            value={displayTranscript}
            onChange={(e) => {
              // Allow manual edits to the final transcript before applying
              if (recordingState !== "recording") {
                setTranscript(e.target.value)
                finalTranscriptRef.current = e.target.value
              }
            }}
            readOnly={recordingState === "recording"}
            rows={4}
            placeholder="Transcript will appear here as you speak..."
            aria-label="Voice transcript"
            className={cn(
              "w-full rounded-xl border border-input bg-card/60",
              "px-4 py-3",
              "text-sm leading-relaxed text-foreground placeholder:text-muted-foreground/60",
              "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:border-ring",
              "resize-none",
              "transition-colors",
              recordingState === "recording" && "opacity-70 cursor-default"
            )}
          />
          {/* Interim indicator */}
          {recordingState === "recording" && interimTranscript && (
            <span className="absolute bottom-3 right-3 text-xs text-muted-foreground/50 italic">
              listening...
            </span>
          )}
        </div>
      )}

      {/* ── Error state ─────────────────────────────────────────────────────── */}
      {recordingState === "error" && errorMessage && (
        <div className="rounded-xl border border-destructive/30 bg-destructive/10 px-4 py-3">
          <p className="text-sm text-destructive">{errorMessage}</p>
        </div>
      )}

      {/* ── Structured results ──────────────────────────────────────────────── */}
      {recordingState === "done" && structured && (
        <StructuredResults data={structured} onApply={handleApply} />
      )}
    </div>
  )
}
