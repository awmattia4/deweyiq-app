/**
 * service-report.ts — HTML service report generator.
 *
 * Generates a professional, email-compatible HTML string for post-visit
 * service reports. Uses inline CSS only (email clients strip <style> tags).
 *
 * Per locked decision: "Photo inclusion in auto-emailed service reports is
 * configurable per customer by the office"
 *
 * Mobile-responsive single-column layout with max-width: 600px.
 */

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface ServiceReportData {
  /** Visit UUID — used for idempotency */
  visitId: string
  /** Date the service was performed */
  serviceDate: Date
  /** Tech's display name */
  techName: string
  /** Company/org name */
  companyName: string
  /** Customer full name */
  customerName: string
  /** Pool name */
  poolName: string
  /** Chemistry readings keyed by param name */
  chemistry: Record<string, number | null>
  /** Checklist completion items */
  checklist: Array<{ taskId: string; completed: boolean; notes: string }>
  /** Checklist task labels (optional — for display; falls back to taskId if missing) */
  checklistLabels?: Record<string, string>
  /** General visit notes */
  notes: string
  /** Supabase Storage public URLs for photos */
  photoStoragePaths: string[]
  /** Whether to include photos in this report */
  includePhotos: boolean
  /** Dosing amounts — chemicals applied during the visit */
  dosingAmounts?: Array<{ chemical: string; amount: number; unit: string }> | null
}

// ---------------------------------------------------------------------------
// Chemistry parameter display metadata
// ---------------------------------------------------------------------------

const PARAM_META: Record<
  string,
  { label: string; unit: string; min?: number; max?: number }
> = {
  freeChlorine: { label: "Free Chlorine", unit: "ppm", min: 2, max: 4 },
  bromine: { label: "Bromine", unit: "ppm", min: 3, max: 5 },
  pH: { label: "pH", unit: "", min: 7.2, max: 7.8 },
  totalAlkalinity: { label: "Total Alkalinity", unit: "ppm", min: 80, max: 120 },
  calciumHardness: { label: "Calcium Hardness", unit: "ppm", min: 200, max: 400 },
  cya: { label: "CYA / Stabilizer", unit: "ppm", min: 30, max: 80 },
  salt: { label: "Salt", unit: "ppm", min: 2700, max: 3400 },
  tds: { label: "TDS", unit: "ppm" },
  borate: { label: "Borate", unit: "ppm" },
  phosphates: { label: "Phosphates", unit: "ppb", max: 200 },
  temperatureF: { label: "Water Temperature", unit: "°F" },
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function getReadingStatus(
  param: string,
  value: number
): "low" | "ok" | "high" {
  const meta = PARAM_META[param]
  if (!meta) return "ok"
  if (meta.min !== undefined && value < meta.min) return "low"
  if (meta.max !== undefined && value > meta.max) return "high"
  return "ok"
}

function statusColor(status: "low" | "ok" | "high"): string {
  switch (status) {
    case "low":
      return "#ef4444" // red-500
    case "high":
      return "#ef4444"
    case "ok":
      return "#22c55e" // green-500
  }
}

function statusLabel(status: "low" | "ok" | "high"): string {
  switch (status) {
    case "low":
      return "Low"
    case "high":
      return "High"
    case "ok":
      return "OK"
  }
}

function formatDate(date: Date): string {
  return date.toLocaleDateString("en-US", {
    weekday: "long",
    year: "numeric",
    month: "long",
    day: "numeric",
  })
}

// ---------------------------------------------------------------------------
// HTML builder helpers
// ---------------------------------------------------------------------------

/** Section header row */
function sectionHeader(title: string): string {
  return `
  <tr>
    <td colspan="3" style="
      background-color:#1e293b;
      color:#94a3b8;
      font-size:11px;
      font-weight:700;
      letter-spacing:0.08em;
      text-transform:uppercase;
      padding:10px 16px;
      border-bottom:1px solid #334155;
    ">${escHtml(title)}</td>
  </tr>`
}

/** Escape HTML entities */
function escHtml(str: string): string {
  return String(str)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
}

// ---------------------------------------------------------------------------
// generateServiceReport
// ---------------------------------------------------------------------------

/**
 * Generates an email-compatible HTML service report.
 *
 * @param data - Visit data for the report
 * @returns HTML string suitable for email body
 */
export function generateServiceReport(data: ServiceReportData): string {
  const {
    serviceDate,
    techName,
    companyName,
    customerName,
    poolName,
    chemistry,
    checklist,
    checklistLabels,
    notes,
    photoStoragePaths,
    includePhotos,
    dosingAmounts,
  } = data

  // ── Brand colors (dark-first palette adapted for email — use slightly lighter bg) ──
  const bg = "#0f172a" // slate-900
  const surface = "#1e293b" // slate-800
  const border = "#334155" // slate-700
  const text = "#f1f5f9" // slate-100
  const textMuted = "#94a3b8" // slate-400
  const accent = "#3b82f6" // blue-500
  const green = "#22c55e" // green-500

  // ── Chemistry rows ──────────────────────────────────────────────────────────
  const chemEntries = Object.entries(chemistry).filter(
    ([, v]) => v !== null && v !== undefined
  )

  const chemRows = chemEntries
    .map(([param, value]) => {
      const meta = PARAM_META[param]
      const label = meta?.label ?? param
      const unit = meta?.unit ?? ""
      const status = getReadingStatus(param, value as number)
      const color = statusColor(status)
      const badge = statusLabel(status)
      const rangeStr =
        meta?.min !== undefined && meta?.max !== undefined
          ? `${meta.min}–${meta.max} ${unit}`
          : meta?.max !== undefined
            ? `≤${meta.max} ${unit}`
            : ""

      return `
    <tr>
      <td style="padding:10px 16px;border-bottom:1px solid ${border};color:${text};font-size:13px;">${escHtml(label)}</td>
      <td style="padding:10px 16px;border-bottom:1px solid ${border};color:${text};font-size:13px;font-weight:600;text-align:center;">${escHtml(String(value))}${unit ? ` <span style="color:${textMuted};font-weight:400;font-size:11px;">${escHtml(unit)}</span>` : ""}</td>
      <td style="padding:10px 16px;border-bottom:1px solid ${border};text-align:right;">
        <span style="background:${color}22;color:${color};border:1px solid ${color}44;border-radius:99px;padding:2px 10px;font-size:11px;font-weight:700;">${badge}</span>
        ${rangeStr ? `<div style="color:${textMuted};font-size:10px;margin-top:3px;">${escHtml(rangeStr)}</div>` : ""}
      </td>
    </tr>`
    })
    .join("")

  const noChemistry =
    chemEntries.length === 0
      ? `<tr><td colspan="3" style="padding:14px 16px;color:${textMuted};font-size:13px;font-style:italic;">No readings recorded</td></tr>`
      : ""

  // ── Checklist rows ────────────────────────────────────────────────────────
  const checklistRows = checklist
    .map((item) => {
      const label =
        checklistLabels?.[item.taskId] ?? `Task ${item.taskId.slice(0, 8)}`
      const icon = item.completed ? "&#10003;" : "&#10007;"
      const iconColor = item.completed ? green : "#ef4444"

      return `
    <tr>
      <td style="padding:10px 16px;border-bottom:1px solid ${border};">
        <span style="color:${iconColor};font-weight:700;font-size:16px;margin-right:8px;">${icon}</span>
        <span style="color:${text};font-size:13px;">${escHtml(label)}</span>
        ${item.notes ? `<div style="color:${textMuted};font-size:11px;margin-top:3px;margin-left:24px;">${escHtml(item.notes)}</div>` : ""}
      </td>
      <td style="padding:10px 16px;border-bottom:1px solid ${border};text-align:right;color:${item.completed ? green : "#ef4444"};font-size:12px;font-weight:600;">${item.completed ? "Complete" : "Incomplete"}</td>
    </tr>`
    })
    .join("")

  const noChecklist =
    checklist.length === 0
      ? `<tr><td colspan="2" style="padding:14px 16px;color:${textMuted};font-size:13px;font-style:italic;">No tasks recorded</td></tr>`
      : ""

  // ── Photos section ────────────────────────────────────────────────────────
  const photosSection =
    includePhotos && photoStoragePaths.length > 0
      ? `
  <div style="margin:0 0 24px 0;">
    <h2 style="font-size:13px;font-weight:700;letter-spacing:0.06em;text-transform:uppercase;color:${textMuted};margin:0 0 12px 0;padding-bottom:8px;border-bottom:1px solid ${border};">Photos</h2>
    <div style="display:flex;flex-wrap:wrap;gap:8px;">
      ${photoStoragePaths
        .map(
          (url) =>
            `<img src="${escHtml(url)}" alt="Service photo" style="width:180px;height:135px;object-fit:cover;border-radius:8px;border:1px solid ${border};" />`
        )
        .join("")}
    </div>
  </div>`
      : ""

  // ── Notes section ─────────────────────────────────────────────────────────
  const notesSection = notes.trim()
    ? `
  <div style="margin:0 0 24px 0;">
    <h2 style="font-size:13px;font-weight:700;letter-spacing:0.06em;text-transform:uppercase;color:${textMuted};margin:0 0 12px 0;padding-bottom:8px;border-bottom:1px solid ${border};">Tech Notes</h2>
    <p style="margin:0;color:${text};font-size:13px;line-height:1.6;white-space:pre-wrap;">${escHtml(notes.trim())}</p>
  </div>`
    : ""

  // ── Full HTML ──────────────────────────────────────────────────────────────
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width,initial-scale=1" />
  <title>Service Report — ${escHtml(customerName)}</title>
</head>
<body style="margin:0;padding:0;background-color:#0d1117;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;">
  <div style="max-width:600px;margin:0 auto;padding:24px 16px;">

    <!-- Header -->
    <div style="background:${surface};border:1px solid ${border};border-radius:12px;overflow:hidden;margin-bottom:20px;">
      <!-- Top bar -->
      <div style="background:${accent};padding:16px 24px;">
        <p style="margin:0;color:#fff;font-size:11px;font-weight:700;letter-spacing:0.08em;text-transform:uppercase;opacity:0.8;">${escHtml(companyName)}</p>
        <h1 style="margin:4px 0 0;color:#fff;font-size:22px;font-weight:800;">Service Report</h1>
      </div>
      <!-- Visit info -->
      <div style="padding:16px 24px;border-bottom:1px solid ${border};">
        <table style="width:100%;border-collapse:collapse;">
          <tr>
            <td style="padding:4px 0;color:${textMuted};font-size:12px;width:120px;">Date</td>
            <td style="padding:4px 0;color:${text};font-size:13px;font-weight:600;">${escHtml(formatDate(serviceDate))}</td>
          </tr>
          <tr>
            <td style="padding:4px 0;color:${textMuted};font-size:12px;">Customer</td>
            <td style="padding:4px 0;color:${text};font-size:13px;font-weight:600;">${escHtml(customerName)}</td>
          </tr>
          <tr>
            <td style="padding:4px 0;color:${textMuted};font-size:12px;">Pool</td>
            <td style="padding:4px 0;color:${text};font-size:13px;font-weight:600;">${escHtml(poolName)}</td>
          </tr>
          <tr>
            <td style="padding:4px 0;color:${textMuted};font-size:12px;">Technician</td>
            <td style="padding:4px 0;color:${text};font-size:13px;font-weight:600;">${escHtml(techName)}</td>
          </tr>
        </table>
      </div>
    </div>

    <!-- Chemistry Readings -->
    <div style="background:${surface};border:1px solid ${border};border-radius:12px;overflow:hidden;margin-bottom:20px;">
      <table style="width:100%;border-collapse:collapse;">
        <thead>
          <tr style="background:#162032;">
            <th style="padding:12px 16px;text-align:left;color:${textMuted};font-size:11px;font-weight:700;letter-spacing:0.08em;text-transform:uppercase;border-bottom:1px solid ${border};">Parameter</th>
            <th style="padding:12px 16px;text-align:center;color:${textMuted};font-size:11px;font-weight:700;letter-spacing:0.08em;text-transform:uppercase;border-bottom:1px solid ${border};">Reading</th>
            <th style="padding:12px 16px;text-align:right;color:${textMuted};font-size:11px;font-weight:700;letter-spacing:0.08em;text-transform:uppercase;border-bottom:1px solid ${border};">Status</th>
          </tr>
        </thead>
        <tbody>
          ${sectionHeader("Chemistry Readings")}
          ${chemRows}
          ${noChemistry}
        </tbody>
      </table>
    </div>

    <!-- Chemicals Applied -->
    ${dosingAmounts && dosingAmounts.length > 0 ? `
    <div style="background:${surface};border:1px solid ${border};border-radius:12px;overflow:hidden;margin-bottom:20px;">
      <table style="width:100%;border-collapse:collapse;">
        <thead>
          <tr style="background:#162032;">
            <th style="padding:12px 16px;text-align:left;color:${textMuted};font-size:11px;font-weight:700;letter-spacing:0.08em;text-transform:uppercase;border-bottom:1px solid ${border};">Chemical</th>
            <th style="padding:12px 16px;text-align:right;color:${textMuted};font-size:11px;font-weight:700;letter-spacing:0.08em;text-transform:uppercase;border-bottom:1px solid ${border};">Amount</th>
          </tr>
        </thead>
        <tbody>
          ${dosingAmounts.map((dose) => `
          <tr>
            <td style="padding:10px 16px;border-bottom:1px solid ${border};color:${text};font-size:13px;">${escHtml(dose.chemical)}</td>
            <td style="padding:10px 16px;border-bottom:1px solid ${border};color:${text};font-size:13px;font-weight:600;text-align:right;">${escHtml(String(dose.amount))} <span style="color:${textMuted};font-weight:400;font-size:11px;">${escHtml(dose.unit)}</span></td>
          </tr>`).join("")}
        </tbody>
      </table>
    </div>` : ""}

    <!-- Checklist -->
    <div style="background:${surface};border:1px solid ${border};border-radius:12px;overflow:hidden;margin-bottom:20px;">
      <table style="width:100%;border-collapse:collapse;">
        <thead>
          <tr style="background:#162032;">
            <th style="padding:12px 16px;text-align:left;color:${textMuted};font-size:11px;font-weight:700;letter-spacing:0.08em;text-transform:uppercase;border-bottom:1px solid ${border};">Task</th>
            <th style="padding:12px 16px;text-align:right;color:${textMuted};font-size:11px;font-weight:700;letter-spacing:0.08em;text-transform:uppercase;border-bottom:1px solid ${border};">Status</th>
          </tr>
        </thead>
        <tbody>
          ${sectionHeader("Service Checklist")}
          ${checklistRows}
          ${noChecklist}
        </tbody>
      </table>
    </div>

    <!-- Notes and Photos -->
    ${notesSection}
    ${photosSection}

    <!-- Footer -->
    <div style="text-align:center;padding:20px 0;border-top:1px solid ${border};margin-top:8px;">
      <p style="margin:0;color:${textMuted};font-size:12px;">Service performed by <strong style="color:${text};">${escHtml(techName)}</strong> on ${escHtml(formatDate(serviceDate))}</p>
      <p style="margin:6px 0 0;color:${textMuted};font-size:11px;">${escHtml(companyName)}</p>
    </div>

  </div>
</body>
</html>`
}
