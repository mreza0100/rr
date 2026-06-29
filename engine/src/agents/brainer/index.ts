// BRAINER — the brain / global reducer. Sees the open store + pursued set + running resultSoFar; returns
// the updated resultSoFar + DELTAS (rescore / add / lookupNext / rename / drop / stop). Looks up stored
// leads OR originates new directions; code-capable (general-purpose) when compute is on so it derives its
// own steering numbers inline — no separate compute stage.
// Tier: opus — ALWAYS Opus (the global brain/reducer — measured: a Haiku brainer scored erratically +
// drifted off-goal). Effort: xhigh — re-scores the store every wave AND sets direction AND maintains
// resultSoFar; the one role where the extra reasoning budget pays back most.
import { SCORED, LOOKUP, RESULT_SO_FAR } from '../shared.js';
import { buildBrainer, buildBrainerCompute } from './prompts.js';
import type { Agent, BrainerArgs, Schema } from '../../types/index.js';
export { buildBrainerCompute };

// COORD = the brainer's per-wave output: the updated resultSoFar + DELTAS against the engine's id-keyed open store. The engine carries
// each rabbit-hole's id + scoreHistory natively — the brainer never re-emits the whole set, it only sends what changed.
export const COORD: Schema = {
  type: 'object',
  properties: {
    resultSoFar: RESULT_SO_FAR,
    rescore: {
      type: 'array',
      items: {
        type: 'object',
        properties: { id: { type: 'number' }, score: { type: 'number' } },
        required: ['id', 'score'],
      },
      description:
        'only the open rabbit-holes whose score changes this wave (the engine pushes {wave,score} to each id\'s history); unlisted ones keep their last score. Score every "new" (unscored) one at least once.',
    },
    add: {
      type: 'array',
      items: SCORED,
      description:
        'new rabbit-holes to park in the store for a later wave — the engine assigns each a fresh id, scoreHistory seeded with this score',
    },
    lookupNext: {
      type: 'array',
      items: LOOKUP,
      description:
        'the rabbit-holes to research now — each either {id} (a stored one) or {keyword,why,score,sources?} (originate-and-pursue-now). None may be already pursued; assign each its relevant `sources` venue subset.',
    },
    rename: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          id: { type: 'number' },
          keyword: { type: 'string' },
          why: { type: 'string' },
        },
        required: ['id', 'keyword'],
      },
      description: 'relabel a rabbit-hole, keeping its id + score history',
    },
    drop: {
      type: 'array',
      items: { type: 'number' },
      description:
        'ids of dead/duplicate rabbit-holes to eliminate (a MERGE = drop the duplicate, rescore the survivor)',
    },
    stop: {
      type: 'object',
      properties: {
        done: { type: 'boolean' },
        reason: { type: 'string', description: 'one line: why done, or what is still missing' },
      },
      required: ['done', 'reason'],
    },
  },
  required: ['resultSoFar', 'rescore', 'add', 'lookupNext', 'stop'],
};

export const brainer: Agent<BrainerArgs> = {
  tier: 'opus',
  effort: 'xhigh',
  schema: COORD,
  buildPrompt: buildBrainer,
};

// BRAIN_COMPUTE = the brain finalize-compute output: the updated resultSoFar with the derivation folded into `working`.
export const BRAIN_COMPUTE: Schema = {
  type: 'object',
  properties: { resultSoFar: RESULT_SO_FAR },
  required: ['resultSoFar'],
};
