// SCRIBE — per-wave crash-safety checkpoint. Writes the given content VERBATIM to dir/_checkpoint.json via
// Bash; runs INSIDE the same parallel() as the lane readers (zero extra wall-clock cost). Tier: haiku (a
// bounded mechanical file write). Effort: low. Dies → no checkpoint that wave (the last one on disk stands).
import { CONFIG } from '../../config.js';
import { buildScribe } from './prompts.js';
import type { Agent, Schema, ScribeArgs } from '../../types/index.js';

export const SCRIBE: Schema = {
  type: 'object',
  properties: { ok: { type: 'boolean' } },
  required: ['ok'],
};

export const scribe: Agent<ScribeArgs> = {
  tier: CONFIG.TIER.scribe,
  effort: CONFIG.EFFORT.scribe,
  schema: SCRIBE,
  buildPrompt: buildScribe,
};
