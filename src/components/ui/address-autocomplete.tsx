"use client"

import { useState, useRef, useEffect, useCallback } from "react"
import { SearchBoxCore, SessionToken } from "@mapbox/search-js-core"
import type { SearchBoxSuggestion } from "@mapbox/search-js-core"
import { Input } from "@/components/ui/input"
import { MapPinIcon, Loader2Icon } from "lucide-react"
import { cn } from "@/lib/utils"

interface AddressAutocompleteProps {
  value: string
  onChange: (address: string, coords: { lat: number; lng: number } | null) => void
  placeholder?: string
  disabled?: boolean
  id?: string
  className?: string
}

const MAPBOX_TOKEN = process.env.NEXT_PUBLIC_MAPBOX_ACCESS_TOKEN ?? ""

export function AddressAutocomplete({
  value,
  onChange,
  placeholder = "123 Main St, City, ST 12345",
  disabled = false,
  id,
  className,
}: AddressAutocompleteProps) {
  const [suggestions, setSuggestions] = useState<SearchBoxSuggestion[]>([])
  const [isOpen, setIsOpen] = useState(false)
  const [isLoading, setIsLoading] = useState(false)
  const [highlightIndex, setHighlightIndex] = useState(-1)

  const searchBoxRef = useRef<SearchBoxCore | null>(null)
  const sessionTokenRef = useRef<SessionToken>(new SessionToken())
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const containerRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLInputElement>(null)

  // Initialize SearchBoxCore once
  useEffect(() => {
    if (!MAPBOX_TOKEN) return
    searchBoxRef.current = new SearchBoxCore({ accessToken: MAPBOX_TOKEN })
  }, [])

  // Close dropdown on outside click
  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setIsOpen(false)
      }
    }
    document.addEventListener("mousedown", handleClick)
    return () => document.removeEventListener("mousedown", handleClick)
  }, [])

  const fetchSuggestions = useCallback(async (query: string) => {
    if (!searchBoxRef.current || query.length < 3) {
      setSuggestions([])
      setIsOpen(false)
      return
    }

    setIsLoading(true)
    try {
      const result = await searchBoxRef.current.suggest(query, {
        sessionToken: sessionTokenRef.current,
        country: "us",
        language: "en",
        limit: 5,
        types: new Set(["address", "place"]) as Set<"address" | "place">,
      })
      setSuggestions(result.suggestions)
      setIsOpen(result.suggestions.length > 0)
      setHighlightIndex(-1)
    } catch (err) {
      console.error("[AddressAutocomplete] suggest error:", err)
      setSuggestions([])
      setIsOpen(false)
    } finally {
      setIsLoading(false)
    }
  }, [])

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const val = e.target.value
    onChange(val, null) // Update text immediately, clear coords

    if (debounceRef.current) clearTimeout(debounceRef.current)
    debounceRef.current = setTimeout(() => fetchSuggestions(val), 300)
  }

  const handleSelect = async (suggestion: SearchBoxSuggestion) => {
    if (!searchBoxRef.current) return

    try {
      const result = await searchBoxRef.current.retrieve(suggestion, {
        sessionToken: sessionTokenRef.current,
      })

      // Start a new session for the next search
      sessionTokenRef.current = new SessionToken()

      const feature = result.features[0]
      if (feature) {
        const fullAddress = suggestion.full_address || suggestion.name
        const coords = {
          lat: feature.properties.coordinates.latitude,
          lng: feature.properties.coordinates.longitude,
        }
        onChange(fullAddress, coords)
      }
    } catch {
      // If retrieve fails, just use the suggestion text
      onChange(suggestion.full_address || suggestion.name, null)
    }

    setSuggestions([])
    setIsOpen(false)
  }

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (!isOpen || suggestions.length === 0) return

    if (e.key === "ArrowDown") {
      e.preventDefault()
      setHighlightIndex((prev) => Math.min(prev + 1, suggestions.length - 1))
    } else if (e.key === "ArrowUp") {
      e.preventDefault()
      setHighlightIndex((prev) => Math.max(prev - 1, 0))
    } else if (e.key === "Enter" && highlightIndex >= 0) {
      e.preventDefault()
      handleSelect(suggestions[highlightIndex])
    } else if (e.key === "Escape") {
      setIsOpen(false)
    }
  }

  const handleBlur = () => {
    // Delay close so click on suggestion can fire first
    setTimeout(() => setIsOpen(false), 200)
  }

  if (!MAPBOX_TOKEN) {
    // Fallback: plain input if no Mapbox token configured
    return (
      <Input
        id={id}
        value={value}
        onChange={(e) => onChange(e.target.value, null)}
        placeholder={placeholder}
        disabled={disabled}
        className={className}
      />
    )
  }

  return (
    <div ref={containerRef} className="relative">
      <div className="relative">
        <MapPinIcon className="absolute left-2.5 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground pointer-events-none" />
        <Input
          ref={inputRef}
          id={id}
          value={value}
          onChange={handleInputChange}
          onKeyDown={handleKeyDown}
          onBlur={handleBlur}
          onFocus={() => {
            if (suggestions.length > 0) setIsOpen(true)
          }}
          placeholder={placeholder}
          disabled={disabled}
          className={cn("pl-8", className)}
          autoComplete="off"
        />
        {isLoading && (
          <Loader2Icon className="absolute right-2.5 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground animate-spin" />
        )}
      </div>

      {isOpen && suggestions.length > 0 && (
        <div className="absolute z-50 mt-1 w-full rounded-md border border-border bg-popover shadow-lg">
          {suggestions.map((suggestion, idx) => (
            <button
              key={suggestion.mapbox_id}
              type="button"
              className={cn(
                "flex w-full items-start gap-2 px-3 py-2 text-left text-sm transition-colors cursor-pointer",
                "hover:bg-accent hover:text-accent-foreground",
                idx === highlightIndex && "bg-accent text-accent-foreground",
                idx === 0 && "rounded-t-md",
                idx === suggestions.length - 1 && "rounded-b-md"
              )}
              onMouseDown={(e) => {
                e.preventDefault() // Prevent blur from firing first
                handleSelect(suggestion)
              }}
              onMouseEnter={() => setHighlightIndex(idx)}
            >
              <MapPinIcon className="h-4 w-4 mt-0.5 shrink-0 text-muted-foreground" />
              <div className="flex flex-col min-w-0">
                <span className="font-medium truncate">{suggestion.name}</span>
                {suggestion.place_formatted && (
                  <span className="text-xs text-muted-foreground truncate">
                    {suggestion.place_formatted}
                  </span>
                )}
              </div>
            </button>
          ))}
        </div>
      )}
    </div>
  )
}
