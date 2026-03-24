"use server"

import { getAiClient, AI_MODEL } from "@/lib/ai/client"

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface SmartSummaryInput {
  customerName: string
  poolName: string
  chemistryReadings: Record<string, number | null>
  dosingAmounts?: Array<{ chemical: string; amount: number; unit: string }>
  checklistCompletion?: Array<{ task: string; completed: boolean }>
  notes?: string
  issuesFound?: string[]
}

export interface SmartSummaryResult {
  success: boolean
  summary?: string
  highlights?: string[]
  concerns?: string[]
  error?: string
}

// ---------------------------------------------------------------------------
// System prompt
// ---------------------------------------------------------------------------

const SYSTEM_PROMPT = `You are writing a friendly, professional pool service summary for a homeowner. Convert raw service data into a warm, clear 2-3 sentence summary. Don't use technical jargon — translate chemistry readings into plain language (e.g. 'Your water chemistry is balanced and healthy' instead of 'pH 7.4, FC 3.0'). Highlight what was done and any concerns. Be concise.

You must respond with valid JSON in exactly this shape:
{
  "summary": "2-3 sentence plain-language summary for the homeowner",
  "highlights": ["bullet point of key action taken", "..."],
  "concerns": ["any concern the homeowner should know about", "..."]
}

Rules:
- summary: warm, non-technical, 2-3 sentences. Never mention raw ppm values, chemical formulas, or technical codes.
- highlights: array of 1-5 short strings describing what the tech did. Use active voice. e.g. "Balanced your pH levels", "Brushed pool walls and vacuumed floor", "Cleaned and backwashed filter".
- concerns: array of strings for anything the homeowner should know or follow up on. Empty array [] if everything is fine.
- If chemistry is all in range, say water is healthy/balanced. If something was off, say e.g. "Your chlorine was a bit low — we added a treatment to bring it back to a healthy level."
- Never make up actions that weren't in the data. Stick to what was provided.`

// ---------------------------------------------------------------------------
// Action
// ---------------------------------------------------------------------------

/**
 * Generates a customer-friendly plain-language service report summary
 * from raw service visit data using Claude AI.
 *
 * Translates chemistry readings into homeowner-friendly language,
 * summarizes actions taken, and surfaces any concerns.
 */
export async function generateSmartSummary(
  visitData: SmartSummaryInput
): Promise<SmartSummaryResult> {
  try {
    const ai = getAiClient()

    // Build a compact data payload for the AI
    const checklistSummary = visitData.checklistCompletion
      ? {
          completed: visitData.checklistCompletion.filter((t) => t.completed).map((t) => t.task),
          skipped: visitData.checklistCompletion.filter((t) => !t.completed).map((t) => t.task),
        }
      : null

    const userMessage = `
Customer: ${visitData.customerName}
Pool: ${visitData.poolName}

Chemistry readings taken today:
${Object.entries(visitData.chemistryReadings)
  .filter(([, v]) => v !== null && v !== undefined)
  .map(([k, v]) => `  ${k}: ${v}`)
  .join("\n") || "  No readings recorded"}

${
  visitData.dosingAmounts && visitData.dosingAmounts.length > 0
    ? `Chemicals added:\n${visitData.dosingAmounts.map((d) => `  ${d.chemical}: ${d.amount} ${d.unit}`).join("\n")}`
    : "No chemicals added."
}

${
  checklistSummary
    ? `Checklist completed: ${checklistSummary.completed.length} tasks
Tasks done: ${checklistSummary.completed.join(", ") || "none"}
${checklistSummary.skipped.length > 0 ? `Tasks skipped: ${checklistSummary.skipped.join(", ")}` : ""}`
    : ""
}

${visitData.notes ? `Tech notes: ${visitData.notes}` : ""}

${
  visitData.issuesFound && visitData.issuesFound.length > 0
    ? `Issues found: ${visitData.issuesFound.join(", ")}`
    : ""
}

Please generate a friendly service summary for this homeowner.`

    const response = await ai.messages.create({
      model: AI_MODEL,
      max_tokens: 600,
      system: SYSTEM_PROMPT,
      messages: [{ role: "user", content: userMessage }],
    })

    const raw = response.content[0]
    if (raw.type !== "text") {
      return { success: false, error: "Unexpected AI response format" }
    }

    // Parse JSON from the response — strip any markdown fences if present
    const jsonText = raw.text.replace(/^```(?:json)?\s*/i, "").replace(/\s*```\s*$/, "").trim()
    const parsed = JSON.parse(jsonText) as {
      summary: string
      highlights: string[]
      concerns: string[]
    }

    return {
      success: true,
      summary: parsed.summary,
      highlights: Array.isArray(parsed.highlights) ? parsed.highlights : [],
      concerns: Array.isArray(parsed.concerns) ? parsed.concerns : [],
    }
  } catch (err) {
    console.error("[ai-reports] generateSmartSummary error:", err)
    return {
      success: false,
      error: err instanceof Error ? err.message : "Failed to generate summary",
    }
  }
}
