// CLAIM AUDITOR — batched per wave: for each new claim with a cachePath, mechanically verify (Bash/python3
// grep) that its verbatim quote exists in the cache file AND carries the claim on its own. Tier: haiku (a
// bounded, mechanical per-batch job). Effort: medium. Dies → its claims stay 'pending' (unpinned downstream).
import { CONFIG } from '../../config.js';
import { buildClaimAuditor } from './prompts.js';
import type { Agent, ClaimAuditArgs, Schema } from '../../types/index.js';

export const CLAIM_AUDIT: Schema = {
  type: 'object',
  properties: {
    checks: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          id: { type: 'number', description: 'the claim id this verdict is for' },
          verdict: { type: 'string', enum: ['pass', 'fail'] },
          note: {
            type: 'string',
            description: 'one line, e.g. "file unreadable" or why the audit failed',
          },
        },
        required: ['id', 'verdict'],
      },
      description: 'one verdict per audited claim',
    },
  },
  required: ['checks'],
};

export const claimAuditor: Agent<ClaimAuditArgs> = {
  tier: CONFIG.TIER.claimAuditor,
  effort: CONFIG.EFFORT.claimAuditor,
  schema: CLAIM_AUDIT,
  buildPrompt: buildClaimAuditor,
};
