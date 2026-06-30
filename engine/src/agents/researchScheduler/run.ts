import { CONFIG } from '../../config.js';
import { researchScheduler } from './index.js';
import { retryAgent } from '../../runtime.js';
import { venuesFor } from '../../utils/index.js';
import type { BrainerState } from '../../brainerState.js';
import type { RabbitHole, SchedulerOut, SchedulerSource } from '../../types/index.js';

// SCHEDULER (B4) — discovery. One Sonnet researchScheduler over the WHOLE wave's lanes: per lane (the
// rabbit-hole + its steering `note` + assigned venues), it batches the searches, sizes every candidate via
// mcp__harvester__fetch size_only, and returns the chosen sources grouped per lane id. Returns a Map<id, sources>;
// the engine bin-packs each lane's sources into reader-units. Degrades to an empty map when the scheduler dies.
export async function runScheduler(
  bs: BrainerState,
  picks: RabbitHole[],
  tag: string,
  phaseName: string,
): Promise<Map<number, SchedulerSource[]>> {
  const map = new Map<number, SchedulerSource[]>();
  if (!picks.length) return map;
  const out = await retryAgent<SchedulerOut>(
    researchScheduler.buildPrompt({
      query: CONFIG.query,
      lanes: picks.map((p) => ({
        id: p.id,
        keyword: p.keyword,
        why: p.why,
        note: p.note || '',
        venues: venuesFor(bs, p.sources),
        ref: p.ref,
      })),
      researcherNote: CONFIG.RESEARCHER_NOTE,
    }),
    {
      label: 'scheduler-' + tag,
      phase: phaseName,
      model: researchScheduler.tier,
      effort: researchScheduler.effort,
      agentType: CONFIG.GENERAL_PURPOSE,
      schema: researchScheduler.schema,
    },
  );
  // B6 — only accept lanes whose id is a REAL pick this wave: drop hallucinated ids the scheduler may invent;
  // a duplicate id is last-wins (map.set), which is fine — the engine bin-packs whatever set lands on the id.
  const pickIds = new Set(picks.map((p) => p.id));
  for (const l of (out && out.lanes) || [])
    if (l && typeof l.id === 'number' && pickIds.has(l.id) && Array.isArray(l.sources))
      map.set(l.id, l.sources);
  log(
    '    scheduler · ' +
      map.size +
      '/' +
      picks.length +
      ' lane(s) sourced · sources=' +
      [...map.values()].reduce((n, s) => n + s.length, 0),
  );
  return map;
}
