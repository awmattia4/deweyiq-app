"use client"

import { useState, useEffect } from "react"
import { MapPinIcon, CheckIcon } from "lucide-react"
import { cn } from "@/lib/utils"

// ─── Types ────────────────────────────────────────────────────────────────────

type MapsPreference = "apple" | "google"

const STORAGE_KEY = "poolco-maps-pref"

// ─── Default detection ────────────────────────────────────────────────────────

/**
 * Detect the likely preferred maps app from the user's device.
 * Defaults to Apple Maps on iOS, Google Maps on all other platforms.
 */
function detectDefaultPreference(): MapsPreference {
  if (typeof navigator === "undefined") return "google"
  const isIos =
    /iPhone|iPad|iPod/.test(navigator.userAgent) ||
    (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1)
  return isIos ? "apple" : "google"
}

// ─── MapsPreference component ──────────────────────────────────────────────────

/**
 * MapsPreference — radio group that stores the tech's preferred maps app
 * in localStorage under key `poolco-maps-pref`.
 *
 * Per locked decision: "Tech sets their preferred maps app in settings;
 * navigation button opens that app with the address" (key: poolco-maps-pref)
 */
export function MapsPreferenceSetting() {
  const [preference, setPreference] = useState<MapsPreference | null>(null)
  const [saved, setSaved] = useState(false)

  // Hydrate from localStorage on mount
  useEffect(() => {
    const stored = localStorage.getItem(STORAGE_KEY) as MapsPreference | null
    if (stored === "apple" || stored === "google") {
      setPreference(stored)
    } else {
      // Apply platform default (not yet saved)
      setPreference(detectDefaultPreference())
    }
  }, [])

  const handleSelect = (value: MapsPreference) => {
    setPreference(value)
    localStorage.setItem(STORAGE_KEY, value)
    // Brief "saved" feedback
    setSaved(true)
    setTimeout(() => setSaved(false), 2000)
  }

  if (preference === null) {
    // Prevent hydration flicker
    return (
      <div className="h-[108px] rounded-xl bg-muted/20 animate-pulse" />
    )
  }

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-col gap-1">
        <p className="text-sm font-medium text-foreground flex items-center gap-2">
          <MapPinIcon className="h-4 w-4 text-muted-foreground" aria-hidden="true" />
          Maps App
        </p>
        <p className="text-xs text-muted-foreground">
          Tap the navigate button on a stop card to open directions in your preferred app.
        </p>
      </div>

      {/* Radio options — min-h-[44px] touch targets (FIELD-11) */}
      <div className="flex flex-col gap-2">
        {(["apple", "google"] as MapsPreference[]).map((option) => {
          const isSelected = preference === option
          return (
            <button
              key={option}
              type="button"
              role="radio"
              aria-checked={isSelected}
              onClick={() => handleSelect(option)}
              className={cn(
                "flex items-center gap-3 rounded-xl border px-4 min-h-[52px] text-left transition-all duration-150 cursor-pointer",
                isSelected
                  ? "border-primary/60 bg-primary/10 text-foreground"
                  : "border-border/60 bg-muted/10 text-muted-foreground hover:border-border hover:bg-muted/20"
              )}
            >
              {/* Selection indicator */}
              <div
                className={cn(
                  "flex h-5 w-5 shrink-0 items-center justify-center rounded-full border-2 transition-colors",
                  isSelected
                    ? "border-primary bg-primary"
                    : "border-muted-foreground/40"
                )}
              >
                {isSelected && <CheckIcon className="h-3 w-3 text-primary-foreground" />}
              </div>

              <div className="flex flex-col gap-0.5">
                <span className="text-sm font-medium leading-tight">
                  {option === "apple" ? "Apple Maps" : "Google Maps"}
                </span>
                <span className="text-xs text-muted-foreground/70">
                  {option === "apple"
                    ? "Opens in Apple Maps · Default on iPhone and iPad"
                    : "Opens in Google Maps · Default on Android and web"}
                </span>
              </div>
            </button>
          )
        })}
      </div>

      {/* Save confirmation */}
      {saved && (
        <p className="text-xs text-green-400 flex items-center gap-1.5 animate-in fade-in-0 duration-150">
          <CheckIcon className="h-3.5 w-3.5" />
          Preference saved
        </p>
      )}
    </div>
  )
}
