// SENTINEL — the goal-mode TERMINAL skeptic of the crawl phase, the inverse of verify. Runs ONCE when the
// brainer declares done: sees the open store + the brainer's running answer; if the stop isn't solid it
// injects high-score gap objects at the store top and the crawl resumes. Bounded by MAX_SENTINEL_REOPENS.
// Tier: opus (adversarial judgment). Effort: xhigh.
import { buildSentinel } from './prompts.js';
import type { Agent, SentinelArgs, Schema } from '../../types/index.js';

// the goal-mode SENTINEL schema — the TERMINAL skeptic of the crawl phase, the inverse of verify. It runs ONCE when the brainer declares
// done: it sees the open store + the brainer's running answer and decides whether stopping is SOLID. If not, it injects high-score gap objects
// at the TOP of the store and hands them back to the lane researchers — the crawl resumes. Bounded by MAX_SENTINEL_REOPENS.
export const SENTINEL: Schema = {
  type: 'object',
  properties: {
    solid: {
      type: 'boolean',
      description:
        "true = the brainer's decision to stop is SOLID (uphold it, end the crawl); false = the brainer stopped prematurely / left a load-bearing gap",
    },
    reasoning: {
      type: 'string',
      description: 'why the stop is solid, or what load-bearing gap was missed',
    },
    rabbitHoles: {
      type: 'array',
      items: {
        type: 'object',
        properties: { keyword: { type: 'string' }, why: { type: 'string' } },
        required: ['keyword', 'why'],
      },
      description:
        'when solid=false: 1-3 concrete high-priority gap searches to inject at the store top (NONE already pursued); empty when solid=true',
    },
  },
  required: ['solid', 'reasoning'],
};

export const sentinel: Agent<SentinelArgs> = {
  tier: 'opus',
  effort: 'xhigh',
  schema: SENTINEL,
  buildPrompt: buildSentinel,
};
