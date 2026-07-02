// LINEAGE CLERK dispatch — batches new claims into ≤LINEAGE_BATCH-item chunks, one retryAgent call per
// chunk, all chunks dispatched CONCURRENTLY via parallel(). A dead (null) chunk contributes nothing — its
// claims fall back to the deterministic lineageKeyOf clustering (the caller's job, not this module's).
// Hallucinated ids (not in the chunk's own input set) are dropped. Empty input → no agent spawned at all.
import { CONFIG } from '../../config.js';
import { lineageClerk } from './index.js';
import { retryAgent } from '../../runtime.js';
import { chunk } from '../../utils/index.js';
import type { BrainerState } from '../../brainerState.js';
import type { Claim, LineageClerkOut } from '../../types/index.js';

export async function runLineageClerk(
  bs: BrainerState,
  claims: Claim[],
  knownKeys: string[],
  tag: string,
  phaseName: string,
): Promise<Map<number, string[]>> {
  const out = new Map<number, string[]>();
  if (!claims.length) return out;
  const chunks = chunk(claims, CONFIG.LINEAGE_BATCH);
  const results = await parallel(
    chunks.map((ch, i) => async () => {
      const ids = new Set(ch.map((c) => c.id));
      const res = await retryAgent<LineageClerkOut>(
        lineageClerk.buildPrompt({
          items: ch.map((c) => ({ id: c.id, source: c.source, entities: c.entities })),
          knownKeys,
        }),
        {
          label: 'lineage-' + tag + (chunks.length > 1 ? '-b' + i : ''),
          phase: phaseName,
          model: lineageClerk.tier,
          effort: lineageClerk.effort,
          schema: lineageClerk.schema,
        },
      );
      return { res, ids };
    }),
  );
  for (const { res, ids } of results) {
    if (!res) continue; // dead chunk — its claims fall back to lineageKeyOf
    for (const l of res.links || [])
      if (l && ids.has(l.id) && Array.isArray(l.keys)) out.set(l.id, l.keys);
  }
  return out;
}
