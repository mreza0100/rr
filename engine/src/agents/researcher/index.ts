// RESEARCHER — a lane READER: it reads its ASSIGNED cache slice(s) from disk (via code) and digests them
// into the lane's running answer. The scheduler owns discovery (which sources, sized to disk); code bin-packs
// each lane's content into RESEARCHER_TOKEN_BUDGET reader-units and runs ONE sequential thread per lane,
// handing the running answer forward across all its reads. Tier: haiku — the read-from-disk + digest is a
// BOUNDED worker task (the scheduler already chose + fetched the sources; a SONNET researcher crashed the
// vector-DB run). Effort: medium. (Both read from the central CONFIG.TIER/EFFORT maps.) The reader runs as a
// code-capable general-purpose agent so it can read its char window off disk + resolve a wall.
import { CONFIG } from '../../config.js';
import { RABBITHOLE } from '../shared.js';
import { buildResearcher } from './prompts.js';
import type { Agent, ResearcherArgs, Schema } from '../../types/index.js';

export const RESEARCH: Schema = {
  type: 'object',
  properties: {
    runningAnswer: {
      type: 'string',
      description:
        'the accumulated answer for this lane: merge what you found in your slice INTO the prior answer (or begin it if you are reader 1), kept a coherent whole — the next reader continues it and the brainer reads the final one',
    },
    rabbitHoles: { type: 'array', items: RABBITHOLE },
    nextSources: {
      type: 'array',
      maxItems: 5,
      items: {
        type: 'object',
        properties: {
          ref: {
            type: 'string',
            description: 'an exact url or DOI the content points to, worth fetching directly',
          },
          why: { type: 'string', description: 'one line on why following it advances the goal' },
        },
        required: ['ref', 'why'],
      },
      description:
        "up to 5 of the content's highest-value outbound citations/links as concrete fetch targets — a later lane fetches each directly",
    },
    deadEnds: { type: 'array', items: { type: 'string' } },
  },
  required: ['runningAnswer'],
};

export const researcher: Agent<ResearcherArgs> = {
  tier: CONFIG.TIER.researcher,
  effort: CONFIG.EFFORT.researcher,
  schema: RESEARCH,
  buildPrompt: buildResearcher,
};
