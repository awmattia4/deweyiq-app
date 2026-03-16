/**
 * Open-Meteo Weather API Client
 *
 * Fetches 7-day daily forecasts from Open-Meteo's free REST API.
 * No API key required.
 *
 * API docs: https://open-meteo.com/en/docs
 *
 * Weather classification thresholds from 10-RESEARCH.md:
 * - Thunderstorm: WMO codes 95, 96, 99
 * - Heavy rain: WMO codes 63, 65 with precip probability >= 70%
 * - Wind: gusts >= 40 mph
 * - Heat: temp >= 105°F
 */

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface OpenMeteoForecast {
  latitude: number
  longitude: number
  timezone: string
  daily: {
    time: string[]
    weather_code: number[]
    precipitation_sum: number[]
    precipitation_probability_max: number[]
    wind_gusts_10m_max: number[]
    temperature_2m_max: number[]
  }
}

export type WeatherType = "clear" | "rain" | "storm" | "heat" | "wind"

export interface WeatherClassification {
  type: WeatherType
  label: string
  /**
   * Whether this weather condition warrants considering service rescheduling.
   * Storms and extreme heat/wind may affect service quality or safety.
   */
  shouldReschedule: boolean
}

// ---------------------------------------------------------------------------
// WMO weather code sets
// ---------------------------------------------------------------------------

/** WMO codes for thunderstorm conditions */
const THUNDERSTORM_CODES = new Set([95, 96, 99])

/** WMO codes for heavy rain (combined with precip probability threshold) */
const HEAVY_RAIN_CODES = new Set([63, 65])

/** Minimum precipitation probability percentage to classify as heavy rain */
const HEAVY_RAIN_PROB_THRESHOLD = 70

/** Wind gust threshold in mph to classify as windy */
const WIND_THRESHOLD_MPH = 40

/** Temperature threshold in Fahrenheit to classify as heat event */
const HEAT_THRESHOLD_F = 105

// ---------------------------------------------------------------------------
// API fetch
// ---------------------------------------------------------------------------

const OPEN_METEO_BASE = "https://api.open-meteo.com/v1/forecast"

/**
 * Fetches a 7-day daily weather forecast from Open-Meteo.
 *
 * Uses 1-hour server-side cache to avoid excessive API calls.
 * Returns null on any network or parsing error — callers should handle gracefully.
 *
 * @param lat - Latitude of the location
 * @param lng - Longitude of the location
 * @param timezone - IANA timezone string (e.g. "America/Phoenix"). Defaults to "auto".
 * @returns Forecast data, or null on error
 */
export async function fetchWeatherForecast(
  lat: number,
  lng: number,
  timezone = "auto"
): Promise<OpenMeteoForecast | null> {
  try {
    const params = new URLSearchParams({
      latitude: lat.toString(),
      longitude: lng.toString(),
      timezone,
      forecast_days: "7",
      daily: [
        "weather_code",
        "precipitation_sum",
        "precipitation_probability_max",
        "wind_gusts_10m_max",
        "temperature_2m_max",
      ].join(","),
      wind_speed_unit: "mph",
      temperature_unit: "fahrenheit",
      precipitation_unit: "inch",
    })

    const url = `${OPEN_METEO_BASE}?${params.toString()}`

    const response = await fetch(url, {
      next: { revalidate: 3600 }, // Cache for 1 hour
    })

    if (!response.ok) {
      console.error(
        `[open-meteo] API error: ${response.status} ${response.statusText}`
      )
      return null
    }

    const data = (await response.json()) as OpenMeteoForecast
    return data
  } catch (error) {
    console.error("[open-meteo] Failed to fetch weather forecast:", error)
    return null
  }
}

// ---------------------------------------------------------------------------
// Classification
// ---------------------------------------------------------------------------

/**
 * Classifies a specific day from the forecast into a weather type.
 *
 * Priority order (most severe first):
 * 1. Storm (thunderstorm WMO codes)
 * 2. Heat (temperature >= 105°F)
 * 3. Wind (gusts >= 40 mph)
 * 4. Rain (heavy rain WMO codes with >= 70% probability)
 * 5. Clear (default)
 *
 * @param forecast - The forecast data from fetchWeatherForecast
 * @param dayIndex - Index into the daily arrays (0 = today, 1 = tomorrow, etc.)
 * @returns Weather classification, or null if dayIndex is out of range
 */
export function classifyWeatherDay(
  forecast: OpenMeteoForecast,
  dayIndex: number
): WeatherClassification | null {
  const { daily } = forecast

  if (dayIndex < 0 || dayIndex >= daily.time.length) {
    return null
  }

  const code = daily.weather_code[dayIndex]
  const precipProb = daily.precipitation_probability_max[dayIndex] ?? 0
  const windGusts = daily.wind_gusts_10m_max[dayIndex] ?? 0
  const tempMax = daily.temperature_2m_max[dayIndex] ?? 0

  // Storm takes priority
  if (THUNDERSTORM_CODES.has(code)) {
    return {
      type: "storm",
      label: "Thunderstorm",
      shouldReschedule: true,
    }
  }

  // Extreme heat
  if (tempMax >= HEAT_THRESHOLD_F) {
    return {
      type: "heat",
      label: `Extreme Heat (${Math.round(tempMax)}°F)`,
      shouldReschedule: true,
    }
  }

  // High wind
  if (windGusts >= WIND_THRESHOLD_MPH) {
    return {
      type: "wind",
      label: `High Wind (${Math.round(windGusts)} mph gusts)`,
      shouldReschedule: true,
    }
  }

  // Heavy rain with high probability
  if (HEAVY_RAIN_CODES.has(code) && precipProb >= HEAVY_RAIN_PROB_THRESHOLD) {
    return {
      type: "rain",
      label: `Heavy Rain (${precipProb}% chance)`,
      shouldReschedule: false,
    }
  }

  return {
    type: "clear",
    label: "Clear",
    shouldReschedule: false,
  }
}

// ---------------------------------------------------------------------------
// Convenience function
// ---------------------------------------------------------------------------

/**
 * Fetches the weather forecast and returns today's maximum temperature in Fahrenheit.
 *
 * Returns null if the forecast cannot be fetched or today's data is unavailable.
 * Used by the dosing engine as a weather modifier input.
 *
 * @param lat - Latitude of the pool location
 * @param lng - Longitude of the pool location
 * @returns Today's max temperature in Fahrenheit, or null on error
 */
export async function getTemperatureForToday(
  lat: number,
  lng: number
): Promise<number | null> {
  const forecast = await fetchWeatherForecast(lat, lng)
  if (!forecast) return null

  const temp = forecast.daily.temperature_2m_max[0]
  if (temp == null || isNaN(temp)) return null

  return temp
}
