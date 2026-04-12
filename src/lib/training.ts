import type { D1Database } from '@cloudflare/workers-types'
import { randomUUID } from 'crypto'

interface CaptureTrainingDataParams {
  db: D1Database
  agentName: string
  instruction: string
  response: string
  qualityScore?: number
}

/**
 * Captures a high-quality interaction as training data.
 * Only captures if response length indicates meaningful output.
 */
export async function captureTrainingData({
  db,
  agentName,
  instruction,
  response,
  qualityScore = 0.5,
}: CaptureTrainingDataParams): Promise<void> {
  if (!instruction.trim() || !response.trim()) return
  if (response.length < 50) return // skip trivial responses

  try {
    await db
      .prepare(
        `INSERT INTO training_data (id, instruction, response, agent_name, quality_score, collected_at)
         VALUES (?, ?, ?, ?, ?, unixepoch())`
      )
      .bind(randomUUID(), instruction, response, agentName, qualityScore)
      .run()
  } catch {
    // Non-critical — don't fail the request if training capture fails
  }
}
