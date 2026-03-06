"use client"

import { useRef, useCallback } from "react"
import { MicIcon } from "lucide-react"
import type { VisitDraft } from "@/lib/offline/db"

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface NotesFieldProps {
  draft: VisitDraft
  onUpdate: (notes: string) => void
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

/**
 * NotesField — large textarea for visit notes with system keyboard dictation hint.
 *
 * Per locked decision: skip custom Web Speech API — iOS system keyboard dictation
 * works reliably in PWA standalone mode; Web Speech API does not. Techs use
 * the dictation key on their system keyboard instead of a custom microphone button.
 *
 * Features:
 * - Large 44px+ touch target textarea with generous padding
 * - Debounced write to Dexie visitDrafts (300ms — avoids per-keystroke writes)
 * - Character count shown in bottom-right corner
 * - Keyboard dictation hint below textarea guides techs to system feature
 * - Works fully offline — all persistence is Dexie-only
 */
export function NotesField({ draft, onUpdate }: NotesFieldProps) {
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const localValueRef = useRef<string>(draft.notes ?? "")

  // ── Debounced Dexie write ─────────────────────────────────────────────────

  const handleChange = useCallback(
    (e: React.ChangeEvent<HTMLTextAreaElement>) => {
      const value = e.target.value
      localValueRef.current = value

      // Propagate to parent (will call updateNotes → Dexie)
      // Debounce: wait 300ms after the last keystroke before writing
      if (debounceRef.current) {
        clearTimeout(debounceRef.current)
      }
      debounceRef.current = setTimeout(() => {
        onUpdate(value)
        debounceRef.current = null
      }, 300)
    },
    [onUpdate]
  )

  const charCount = draft.notes?.length ?? 0

  // ── Render ────────────────────────────────────────────────────────────────

  return (
    <div className="flex flex-col gap-4">
      {/* ── Label ──────────────────────────────────────────────────────────── */}
      <div className="flex items-center justify-between">
        <label
          htmlFor="visit-notes"
          className="text-sm font-medium text-foreground"
        >
          Visit Notes
        </label>
        {charCount > 0 && (
          <span className="text-xs text-muted-foreground/50 tabular-nums">
            {charCount.toLocaleString()}
          </span>
        )}
      </div>

      {/* ── Textarea ───────────────────────────────────────────────────────── */}
      <div className="relative">
        <textarea
          id="visit-notes"
          inputMode="text"
          rows={6}
          defaultValue={draft.notes ?? ""}
          onChange={handleChange}
          placeholder="Tap to add notes... Use your keyboard's microphone key for voice input"
          className={[
            "w-full rounded-xl border border-input bg-card/60",
            "px-4 py-4 pb-8",
            "text-base leading-relaxed text-foreground placeholder:text-muted-foreground/60",
            "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:border-ring",
            "resize-none",
            "min-h-[160px]",
            "transition-colors",
          ].join(" ")}
          aria-label="Visit notes"
          aria-describedby="notes-dictation-hint"
        />

        {/* Character count in corner */}
        {charCount > 0 && (
          <span
            className="absolute bottom-3 right-4 text-xs text-muted-foreground/40 tabular-nums pointer-events-none"
            aria-hidden="true"
          >
            {charCount.toLocaleString()}
          </span>
        )}
      </div>

      {/* ── Keyboard dictation hint ─────────────────────────────────────────── */}
      <div
        id="notes-dictation-hint"
        className="flex items-start gap-2.5 rounded-xl border border-border/40 bg-muted/20 px-4 py-3"
      >
        <MicIcon className="h-4 w-4 text-muted-foreground/60 shrink-0 mt-0.5" />
        <p className="text-xs text-muted-foreground/70 leading-relaxed">
          <span className="font-medium text-muted-foreground">Tip:</span> Tap the microphone
          icon on your keyboard for voice-to-text. Works hands-free even with wet gloves.
        </p>
      </div>
    </div>
  )
}
