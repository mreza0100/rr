import { CONFIG } from '../../config.js';
import { scout } from './index.js';
import { retryAgent } from '../../runtime.js';
import type { ResearchReport } from '../../engine.js';
import type { ScoutOut, SeedLead } from '../../types/index.js';

// Scout (wave-0 seed): broad WebSearch → fetch sources with the rabbit-hole footer → seed rabbit-holes.
// Sets rr.scout + rr.scoutRabbitHoles and returns the seed leads (the engine seeds the open store from them).
export async function runScout(rr: ResearchReport): Promise<SeedLead[]> {
  phase(CONFIG.PHASE.scout);
  log('· scout DISPATCH · ' + scout.tier);
  const scoutOut = await retryAgent<ScoutOut>(
    scout.buildPrompt({
      query: CONFIG.query,
      net: CONFIG.NET,
      footer: CONFIG.FOOTER,
      researcherNote: CONFIG.RESEARCHER_NOTE,
    }),
    {
      label: 'scout',
      phase: CONFIG.PHASE.scout,
      model: scout.tier,
      effort: scout.effort,
      agentType: CONFIG.GENERAL_PURPOSE,
      schema: scout.schema,
    },
  );
  if (!scoutOut) {
    log('✗ scout DIED');
    throw new Error('scout died');
  }
  rr.scout = scoutOut;
  const scoutRabbitHoles: SeedLead[] = scoutOut.pages.flatMap((p) =>
    (p.rabbitHoles || []).map((l) => ({ keyword: l.keyword, why: l.why, path: [] as string[] })),
  ); // PATH: scout rabbit-holes descend directly from the goal
  rr.scoutRabbitHoles = scoutRabbitHoles;
  log(
    '· scout RETURN · pages=' +
      scoutOut.pages.length +
      ' · rabbit-holes=' +
      scoutRabbitHoles.length +
      ' · deadEnds=' +
      (scoutOut.deadEnds || []).length,
  );
  scoutOut.pages.forEach((p, i) =>
    log(
      '    source ' + (i + 1) + ' · rabbit-holes=' + (p.rabbitHoles || []).length + ' · ' + p.url,
    ),
  );
  return scoutRabbitHoles;
}
