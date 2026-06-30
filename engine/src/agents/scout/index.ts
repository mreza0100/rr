// SCOUT — wave-0 seed. One broad WebSearch maps the landscape, then up-to-5 Harvester fetches seed the
// first rabbit-holes. Tier: haiku — the page reading is the FIXED haiku reader's job, leaving
// the scout a bounded "map + extract rabbit-holes" task (user directive + measured: haiku summaries
// were accurate + specific). Effort: medium (worker load). Escalate only on measured failure.
import { CONFIG } from '../../config.js';
import { PAGE } from '../shared.js';
import { buildScout } from './prompts.js';
import type { Agent, ScoutArgs, Schema } from '../../types/index.js';

export const SCOUT: Schema = {
  type: 'object',
  properties: {
    landscape: { type: 'string' },
    pages: { type: 'array', items: PAGE },
    deadEnds: { type: 'array', items: { type: 'string' } },
  },
  required: ['landscape', 'pages'],
};

export const scout: Agent<ScoutArgs> = {
  tier: CONFIG.TIER.scout,
  effort: CONFIG.EFFORT.scout,
  schema: SCOUT,
  buildPrompt: buildScout,
};
