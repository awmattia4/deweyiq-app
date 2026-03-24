/**
 * Anthropic Claude client singleton.
 *
 * All AI features share this client. Server-side only.
 * Uses ANTHROPIC_API_KEY from environment.
 */

import Anthropic from "@anthropic-ai/sdk"

let _client: Anthropic | null = null

export function getAiClient(): Anthropic {
  if (!_client) {
    const apiKey = process.env.ANTHROPIC_API_KEY
    if (!apiKey) throw new Error("ANTHROPIC_API_KEY not configured")
    _client = new Anthropic({ apiKey })
  }
  return _client
}

/** Default model for all AI features — fast + cheap */
export const AI_MODEL = "claude-haiku-4-5-20251001"

/** Vision model for photo analysis — needs multimodal */
export const AI_VISION_MODEL = "claude-haiku-4-5-20251001"
