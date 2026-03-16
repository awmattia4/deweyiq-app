import { CloudRainIcon, CloudLightningIcon, ThermometerIcon, WindIcon } from "lucide-react"
import type { WeatherType } from "@/lib/weather/open-meteo"

// ─── WeatherBadge ─────────────────────────────────────────────────────────────

export interface WeatherBadgeProps {
  type: WeatherType
  label: string
}

/**
 * WeatherBadge — small pill-shaped badge shown on stop cards when weather
 * conditions warrant tech awareness.
 *
 * Returns null for "clear" weather — no badge clutters the card on normal days.
 *
 * Colors use hex values (not oklch) — consistent with the design system rule
 * that small decorative elements use hex fallbacks for broad compatibility.
 *
 * Per plan spec:
 * - rain: CloudRain icon, blue tint
 * - storm: CloudLightning icon, amber tint
 * - heat: Thermometer icon, red tint
 * - wind: Wind icon, gray tint
 * - clear: null (no badge rendered)
 */
export function WeatherBadge({ type, label }: WeatherBadgeProps) {
  if (type === "clear") return null

  const config = BADGE_CONFIG[type]

  return (
    <span
      className="inline-flex shrink-0 items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-medium leading-none"
      style={{
        backgroundColor: config.bg,
        color: config.text,
        border: `1px solid ${config.border}`,
      }}
      aria-label={`Weather alert: ${label}`}
    >
      <config.Icon className="h-3 w-3 shrink-0" aria-hidden="true" />
      {label}
    </span>
  )
}

// ─── Badge config per type ────────────────────────────────────────────────────

interface BadgeConfig {
  Icon: React.FC<React.SVGProps<SVGSVGElement>>
  bg: string
  text: string
  border: string
}

const BADGE_CONFIG: Record<Exclude<WeatherType, "clear">, BadgeConfig> = {
  rain: {
    Icon: CloudRainIcon as React.FC<React.SVGProps<SVGSVGElement>>,
    bg: "rgba(59, 130, 246, 0.15)",
    text: "#93c5fd",
    border: "rgba(59, 130, 246, 0.35)",
  },
  storm: {
    Icon: CloudLightningIcon as React.FC<React.SVGProps<SVGSVGElement>>,
    bg: "rgba(245, 158, 11, 0.15)",
    text: "#fcd34d",
    border: "rgba(245, 158, 11, 0.35)",
  },
  heat: {
    Icon: ThermometerIcon as React.FC<React.SVGProps<SVGSVGElement>>,
    bg: "rgba(239, 68, 68, 0.15)",
    text: "#fca5a5",
    border: "rgba(239, 68, 68, 0.35)",
  },
  wind: {
    Icon: WindIcon as React.FC<React.SVGProps<SVGSVGElement>>,
    bg: "rgba(107, 114, 128, 0.15)",
    text: "#d1d5db",
    border: "rgba(107, 114, 128, 0.35)",
  },
}
