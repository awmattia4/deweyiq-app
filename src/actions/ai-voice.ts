"use server"

/**
 * ai-voice.ts — Voice-to-structured-data for field technicians.
 *
 * Tech dictates field observations verbally. Browser transcribes via Web Speech API
 * (free, no API cost). This server action takes the raw transcript and uses Claude
 * to extract structured data: chemistry readings, dosing amounts, checklist updates,
 * issues found, and clean notes.
 */

import { getAiClient, AI_MODEL } from "@/lib/ai/client"

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface PoolContext {
  poolName?: string
  sanitizerType?: string
  checklistTasks?: Array<{ taskId: string; label: string }>
  chemistryParams?: string[]
}

export interface DosingAmount {
  chemical: string
  amount: number
  unit: string
}

export interface ChecklistUpdate {
  taskId: string
  completed: boolean
  notes?: string
}

export interface IssueFound {
  description: string
  severity: "low" | "medium" | "high"
}

export interface StructuredVoiceData {
  notes: string
  chemistryReadings?: Record<string, number>
  dosingAmounts?: DosingAmount[]
  checklistUpdates?: ChecklistUpdate[]
  issuesFound?: IssueFound[]
  suggestedFollowUp?: string
}

export interface StructureVoiceNoteResult {
  success: boolean
  structured?: StructuredVoiceData
  error?: string
}

// ---------------------------------------------------------------------------
// System prompt
// ---------------------------------------------------------------------------

const SYSTEM_PROMPT = `You are a pool service data extraction AI. A technician has dictated field notes via voice.

Your job is to extract structured data from the transcript and return ONLY valid JSON — no markdown, no explanation, no code fences.

Extract these categories when present:
1. notes — Clean, professional tech notes summarizing what was done (string)
2. chemistryReadings — Key/value map of parameter names to numeric readings (e.g. {"pH": 7.4, "freeChlorine": 2.5, "totalAlkalinity": 90})
   - Recognize common aliases: "chlorine"/"free chlorine"→freeChlorine, "alk"/"alkalinity"→totalAlkalinity, "CYA"/"stabilizer"→cya, "calcium"/"hardness"→calciumHardness, "temp"→temperatureF, "bromine"→bromine, "salt"→salt, "phosphates"→phosphates, "TDS"→tds
3. dosingAmounts — Array of {chemical, amount, unit} objects (e.g. {"chemical":"Muriatic Acid","amount":16,"unit":"oz"})
   - Recognize: acid/muriatic acid, chlorine/shock/trichlor, soda ash/sodium carbonate, baking soda/sodium bicarbonate, CYA/stabilizer, salt, algaecide, phosphate remover
4. checklistUpdates — Array of {taskId, completed, notes} — only populate if checklistTasks context is provided and the transcript mentions completing or skipping specific tasks
5. issuesFound — Array of {description, severity:"low"|"medium"|"high"} for problems observed
   - low: minor cosmetic issues, slight readings out of range
   - medium: equipment wear, moderate chemistry issues, minor leaks
   - high: equipment failure, major leaks, safety hazards, severely out-of-range chemistry
6. suggestedFollowUp — Optional string with recommended next-visit actions

Return this exact JSON shape (omit keys where no data was found):
{
  "notes": "...",
  "chemistryReadings": {},
  "dosingAmounts": [],
  "checklistUpdates": [],
  "issuesFound": [],
  "suggestedFollowUp": "..."
}`

// ---------------------------------------------------------------------------
// Action
// ---------------------------------------------------------------------------

/**
 * structureVoiceNote
 *
 * Takes a raw voice transcript and optional pool context, returns structured
 * data extracted by Claude. Designed to be called from the VoiceNoteButton
 * component after browser Speech Recognition produces a transcript.
 */
export async function structureVoiceNote(
  transcript: string,
  poolContext?: PoolContext
): Promise<StructureVoiceNoteResult> {
  if (!transcript || transcript.trim().length === 0) {
    return { success: false, error: "Transcript is empty" }
  }

  try {
    const client = getAiClient()

    // Build context section for the user message
    const contextLines: string[] = []
    if (poolContext?.poolName) {
      contextLines.push(`Pool: ${poolContext.poolName}`)
    }
    if (poolContext?.sanitizerType) {
      contextLines.push(`Sanitizer type: ${poolContext.sanitizerType}`)
    }
    if (poolContext?.chemistryParams && poolContext.chemistryParams.length > 0) {
      contextLines.push(`Chemistry params for this pool: ${poolContext.chemistryParams.join(", ")}`)
    }
    if (poolContext?.checklistTasks && poolContext.checklistTasks.length > 0) {
      const taskList = poolContext.checklistTasks
        .map((t) => `  - id:"${t.taskId}" label:"${t.label}"`)
        .join("\n")
      contextLines.push(`Checklist tasks:\n${taskList}`)
    }

    const contextSection =
      contextLines.length > 0
        ? `POOL CONTEXT:\n${contextLines.join("\n")}\n\n`
        : ""

    const userMessage = `${contextSection}TECHNICIAN TRANSCRIPT:\n"${transcript.trim()}"`

    const response = await client.messages.create({
      model: AI_MODEL,
      max_tokens: 1024,
      system: SYSTEM_PROMPT,
      messages: [{ role: "user", content: userMessage }],
    })

    // Extract text content from response
    const textBlock = response.content.find((block) => block.type === "text")
    if (!textBlock || textBlock.type !== "text") {
      return { success: false, error: "AI returned no text content" }
    }

    const rawText = textBlock.text.trim()

    // Strip any accidental markdown fences Claude might add
    const jsonText = rawText
      .replace(/^```(?:json)?\s*/i, "")
      .replace(/\s*```$/i, "")
      .trim()

    let parsed: Record<string, unknown>
    try {
      parsed = JSON.parse(jsonText)
    } catch {
      console.error("[ai-voice] Failed to parse AI JSON:", rawText)
      return { success: false, error: "AI response was not valid JSON" }
    }

    // Validate and coerce the structured output
    const structured: StructuredVoiceData = {
      notes: typeof parsed.notes === "string" ? parsed.notes : transcript.trim(),
    }

    if (
      parsed.chemistryReadings &&
      typeof parsed.chemistryReadings === "object" &&
      !Array.isArray(parsed.chemistryReadings)
    ) {
      const readings: Record<string, number> = {}
      for (const [key, val] of Object.entries(
        parsed.chemistryReadings as Record<string, unknown>
      )) {
        if (typeof val === "number" && !isNaN(val)) {
          readings[key] = val
        }
      }
      if (Object.keys(readings).length > 0) {
        structured.chemistryReadings = readings
      }
    }

    if (Array.isArray(parsed.dosingAmounts) && parsed.dosingAmounts.length > 0) {
      const doses: DosingAmount[] = []
      for (const item of parsed.dosingAmounts as unknown[]) {
        if (
          item &&
          typeof item === "object" &&
          "chemical" in item &&
          "amount" in item &&
          "unit" in item &&
          typeof (item as DosingAmount).chemical === "string" &&
          typeof (item as DosingAmount).amount === "number" &&
          typeof (item as DosingAmount).unit === "string"
        ) {
          doses.push(item as DosingAmount)
        }
      }
      if (doses.length > 0) structured.dosingAmounts = doses
    }

    if (
      Array.isArray(parsed.checklistUpdates) &&
      parsed.checklistUpdates.length > 0
    ) {
      const updates: ChecklistUpdate[] = []
      for (const item of parsed.checklistUpdates as unknown[]) {
        if (
          item &&
          typeof item === "object" &&
          "taskId" in item &&
          "completed" in item &&
          typeof (item as ChecklistUpdate).taskId === "string" &&
          typeof (item as ChecklistUpdate).completed === "boolean"
        ) {
          updates.push(item as ChecklistUpdate)
        }
      }
      if (updates.length > 0) structured.checklistUpdates = updates
    }

    if (Array.isArray(parsed.issuesFound) && parsed.issuesFound.length > 0) {
      const issues: IssueFound[] = []
      for (const item of parsed.issuesFound as unknown[]) {
        if (
          item &&
          typeof item === "object" &&
          "description" in item &&
          "severity" in item &&
          typeof (item as IssueFound).description === "string" &&
          ["low", "medium", "high"].includes((item as IssueFound).severity)
        ) {
          issues.push(item as IssueFound)
        }
      }
      if (issues.length > 0) structured.issuesFound = issues
    }

    if (
      typeof parsed.suggestedFollowUp === "string" &&
      parsed.suggestedFollowUp.trim().length > 0
    ) {
      structured.suggestedFollowUp = parsed.suggestedFollowUp.trim()
    }

    return { success: true, structured }
  } catch (err) {
    console.error("[structureVoiceNote] Error:", err)
    return {
      success: false,
      error: err instanceof Error ? err.message : "Failed to process voice note",
    }
  }
}
