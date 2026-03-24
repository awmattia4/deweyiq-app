"use server"

import { getAiClient, AI_VISION_MODEL } from "@/lib/ai/client"

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface DiagnosisIssue {
  type: "algae" | "staining" | "equipment" | "waterline" | "debris" | "structural" | "other"
  severity: "info" | "minor" | "moderate" | "severe"
  title: string
  description: string
  recommendation: string
}

export interface PoolDiagnosis {
  issues: DiagnosisIssue[]
  overallCondition: "excellent" | "good" | "fair" | "poor"
  summary: string
}

export interface DiagnosePoolPhotoResult {
  success: boolean
  diagnosis?: PoolDiagnosis
  error?: string
}

export interface PoolContext {
  poolName?: string
  sanitizerType?: string
  lastChemistry?: Record<string, number | null>
}

// ---------------------------------------------------------------------------
// Server action
// ---------------------------------------------------------------------------

/**
 * diagnosePoolPhoto — sends a pool photo to Claude Vision for AI-powered
 * condition analysis. Returns structured findings with severity ratings and
 * actionable recommendations for the field technician.
 *
 * No auth required — photo URL is the only input. The photo must be publicly
 * accessible or a signed URL. Pool context is optional metadata that improves
 * Claude's analysis accuracy (e.g. sanitizer type informs algae risk).
 */
export async function diagnosePoolPhoto(
  photoUrl: string,
  poolContext?: PoolContext
): Promise<DiagnosePoolPhotoResult> {
  try {
    // ── Fetch image as base64 ──────────────────────────────────────────────
    let imageBase64: string
    let mediaType: "image/jpeg" | "image/png" | "image/gif" | "image/webp"

    try {
      const response = await fetch(photoUrl)
      if (!response.ok) {
        return {
          success: false,
          error: `Failed to fetch photo (${response.status})`,
        }
      }

      const contentType = response.headers.get("content-type") ?? "image/jpeg"
      if (contentType.includes("webp")) {
        mediaType = "image/webp"
      } else if (contentType.includes("png")) {
        mediaType = "image/png"
      } else if (contentType.includes("gif")) {
        mediaType = "image/gif"
      } else {
        mediaType = "image/jpeg"
      }

      const arrayBuffer = await response.arrayBuffer()
      imageBase64 = Buffer.from(arrayBuffer).toString("base64")
    } catch (fetchErr) {
      console.error("[ai-diagnosis] Failed to fetch photo:", fetchErr)
      return {
        success: false,
        error: "Could not load photo for analysis",
      }
    }

    // ── Build context string for user message ─────────────────────────────
    const contextLines: string[] = []
    if (poolContext?.poolName) {
      contextLines.push(`Pool name: ${poolContext.poolName}`)
    }
    if (poolContext?.sanitizerType) {
      contextLines.push(`Sanitizer type: ${poolContext.sanitizerType}`)
    }
    if (poolContext?.lastChemistry) {
      const chemEntries = Object.entries(poolContext.lastChemistry)
        .filter(([, v]) => v !== null && v !== undefined)
        .map(([k, v]) => `${k}: ${v}`)
      if (chemEntries.length > 0) {
        contextLines.push(`Last chemistry readings: ${chemEntries.join(", ")}`)
      }
    }

    const contextBlock =
      contextLines.length > 0
        ? `\n\nPool context:\n${contextLines.join("\n")}`
        : ""

    // ── Call Claude Vision ─────────────────────────────────────────────────
    const client = getAiClient()

    const response = await client.messages.create({
      model: AI_VISION_MODEL,
      max_tokens: 1024,
      system: `You are a pool service expert analyzing a pool photo. Identify issues like algae (green/black/mustard), staining (metal/organic/calcium), waterline buildup, equipment damage, structural issues, and debris. Rate each issue's severity. Be specific and actionable for a pool technician.

Always respond with valid JSON matching this exact structure (no markdown, no prose outside JSON):
{
  "issues": [
    {
      "type": "algae" | "staining" | "equipment" | "waterline" | "debris" | "structural" | "other",
      "severity": "info" | "minor" | "moderate" | "severe",
      "title": "short title (4-6 words)",
      "description": "what you see (1-2 sentences)",
      "recommendation": "what the tech should do (1-2 sentences)"
    }
  ],
  "overallCondition": "excellent" | "good" | "fair" | "poor",
  "summary": "one sentence overall assessment"
}

If the pool looks healthy with no issues, return an empty issues array and overallCondition of "excellent" or "good". Never fabricate issues that aren't visible. If the image is blurry, dark, or not clearly a pool, return a single issue of type "other" with severity "info" describing the image quality problem.`,
      messages: [
        {
          role: "user",
          content: [
            {
              type: "image",
              source: {
                type: "base64",
                media_type: mediaType,
                data: imageBase64,
              },
            },
            {
              type: "text",
              text: `Please analyze this pool photo and identify any issues.${contextBlock}`,
            },
          ],
        },
      ],
    })

    // ── Parse response ─────────────────────────────────────────────────────
    const rawText =
      response.content[0]?.type === "text" ? response.content[0].text : ""

    if (!rawText) {
      return { success: false, error: "No analysis returned" }
    }

    // Strip markdown code fences if Claude wraps JSON in them
    const jsonText = rawText
      .replace(/^```(?:json)?\s*/i, "")
      .replace(/\s*```$/i, "")
      .trim()

    let parsed: PoolDiagnosis
    try {
      parsed = JSON.parse(jsonText) as PoolDiagnosis
    } catch {
      console.error("[ai-diagnosis] Failed to parse JSON response:", rawText)
      return { success: false, error: "Could not parse analysis response" }
    }

    // Basic validation — ensure required fields exist
    if (
      !parsed ||
      !Array.isArray(parsed.issues) ||
      !parsed.overallCondition ||
      !parsed.summary
    ) {
      return { success: false, error: "Unexpected analysis format" }
    }

    return { success: true, diagnosis: parsed }
  } catch (err) {
    console.error("[ai-diagnosis] diagnosePoolPhoto failed:", err)
    return {
      success: false,
      error: err instanceof Error ? err.message : "Analysis failed",
    }
  }
}
