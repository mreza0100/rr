// CLAIM AUDITOR dispatch — batches new claims with a cachePath into ≤AUDIT_BATCH-item chunks, one
// retryAgent call per chunk, all chunks dispatched CONCURRENTLY via parallel(). A dead (null) chunk
// contributes nothing — its claims simply stay 'pending' (the caller treats pending as unpinned
// downstream). Hallucinated ids (not in the chunk's own input set) are dropped. Zero auditable claims →
// no agent spawned at all.
import { CONFIG } from '../../config.js';
import { claimAuditor } from './index.js';
import { retryAgent } from '../../runtime.js';
import { chunk } from '../../utils/index.js';
import type { BrainerState } from '../../brainerState.js';
import type { Claim, ClaimAuditOut } from '../../types/index.js';

export async function runClaimAuditor(
  bs: BrainerState,
  claims: Claim[],
  tag: string,
  phaseName: string,
): Promise<Map<number, { verdict: 'pass' | 'fail'; note?: string }>> {
  const out = new Map<number, { verdict: 'pass' | 'fail'; note?: string }>();
  const auditable = claims.filter((c) => !!c.cachePath); // only claims that can actually be greped
  if (!auditable.length) return out;
  const chunks = chunk(auditable, CONFIG.AUDIT_BATCH);
  const results = await parallel(
    chunks.map((ch, i) => async () => {
      const ids = new Set(ch.map((c) => c.id));
      const res = await retryAgent<ClaimAuditOut>(
        claimAuditor.buildPrompt({
          items: ch.map((c) => ({
            id: c.id,
            claim: c.claim,
            quote: c.quote,
            cachePath: c.cachePath!,
          })),
        }),
        {
          label: 'claim-audit-' + tag + (chunks.length > 1 ? '-b' + i : ''),
          phase: phaseName,
          model: claimAuditor.tier,
          effort: claimAuditor.effort,
          agentType: CONFIG.GENERAL_PURPOSE,
          schema: claimAuditor.schema,
        },
      );
      return { res, ids };
    }),
  );
  for (const { res, ids } of results) {
    if (!res) continue; // dead chunk — its claims stay 'pending'
    for (const c of res.checks || [])
      if (c && ids.has(c.id) && (c.verdict === 'pass' || c.verdict === 'fail'))
        out.set(c.id, { verdict: c.verdict, note: c.note });
  }
  return out;
}
