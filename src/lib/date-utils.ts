/**
 * Get a YYYY-MM-DD string for a Date using LOCAL timezone (not UTC).
 *
 * CRITICAL: Never use `date.toISOString().split("T")[0]` for "today" checks —
 * toISOString converts to UTC, so at 9pm EST it returns tomorrow's date.
 */
export function toLocalDateString(date: Date = new Date()): string {
  const y = date.getFullYear()
  const m = String(date.getMonth() + 1).padStart(2, "0")
  const d = String(date.getDate()).padStart(2, "0")
  return `${y}-${m}-${d}`
}
