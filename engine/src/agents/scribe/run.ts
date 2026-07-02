// SCRIBE dispatch — crash-safety checkpoint: writes `content` VERBATIM to dir/_checkpoint.json. Skips (no
// agent spawned) on empty content; degrades to false on a dead agent or ok:false (no checkpoint that wave).
import { CONFIG } from '../../config.js';
import { scribe } from './index.js';
import { retryAgent } from '../../runtime.js';
import type { ScribeOut } from '../../types/index.js';

export async function runScribe(
  content: string,
  dir: string,
  tag: string,
  phaseName: string,
): Promise<boolean> {
  if (!content) return false;
  const out = await retryAgent<ScribeOut>(scribe.buildPrompt({ content, dir }), {
    label: 'scribe-' + tag,
    phase: phaseName,
    model: scribe.tier,
    effort: scribe.effort,
    agentType: CONFIG.GENERAL_PURPOSE,
    schema: scribe.schema,
  });
  return !!(out && out.ok);
}
