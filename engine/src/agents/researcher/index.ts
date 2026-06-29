// RESEARCHER — a lane researcher pursuing ONE rabbit-hole over its assigned venues, parallel one per
// pursued lead. Tier: haiku — the page reading is done by the FIXED haiku WebFetch digester, leaving each
// worker a BOUNDED "summarize 1-2 already-digested pages + extract rabbit-holes" task (user directive +
// measured: haiku researcher summaries were accurate + specific; a SONNET researcher crashed the
// vector-DB run). Effort: medium (worker load). Escalate only on measured failure.
import { RABBITHOLE } from '../shared.js';
import { buildResearcher } from './prompts.js';
import type { Agent, ResearcherArgs, Schema } from '../../types/index.js';

export const RESEARCH: Schema = {
  type: 'object',
  properties: {
    summary: { type: 'string' },
    rabbitHoles: { type: 'array', items: RABBITHOLE },
    nextSources: {
      type: 'array',
      maxItems: 5,
      items: {
        type: 'object',
        properties: {
          ref: {
            type: 'string',
            description: 'an exact URL or DOI the page points to, worth fetching directly',
          },
          why: { type: 'string', description: 'one line on why following it advances the goal' },
        },
        required: ['ref', 'why'],
      },
      description:
        "up to 5 of the page's highest-value outbound citations/links as concrete fetch targets — the next lane fetches each directly",
    },
    deadEnds: { type: 'array', items: { type: 'string' } },
  },
  required: ['summary', 'rabbitHoles'],
};

export const researcher: Agent<ResearcherArgs> = {
  tier: 'haiku',
  effort: 'medium',
  schema: RESEARCH,
  buildPrompt: buildResearcher,
};
