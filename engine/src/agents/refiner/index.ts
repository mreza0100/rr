// REFINER — one per load-bearing fact (parallel) in the Finalize phase. Adversarially fact-checks a fact
// against the web and returns its corrected, hardened claim. Tier: sonnet (adversarial verification on the
// web — modest middle tier). Effort: high.
import { buildRefiner } from './prompts.js';
import type { Agent, RefineArgs, Schema } from '../../types/index.js';

export const REFINE: Schema = {
  type: 'object',
  properties: {
    report: {
      type: 'string',
      description:
        'markdown: the clean / corrected claim(s) for this fact after adversarial fact-checking against the sources',
    },
  },
  required: ['report'],
};

export const refiner: Agent<RefineArgs> = {
  tier: 'sonnet',
  effort: 'high',
  schema: REFINE,
  buildPrompt: buildRefiner,
};
