import { CONFIG } from '../../config.js';
import { initiator } from './index.js';
import { retryAgent } from '../../runtime.js';
import { withPrompt } from '../../utils/index.js';
import type { BrainerState } from '../../brainerState.js';
import type { FactToHarden, InitiatorOut } from '../../types/index.js';

// INITIATOR — shapes the finish to the query: names the load-bearing facts to harden + sets the report focus.
// Returns the facts + synthesiser focus the finalize loop consumes, plus the initiator artifact markdown.
export async function runInitiator(
  bs: BrainerState,
  topOpen: string[],
): Promise<{ facts: FactToHarden[]; synthFocus: string; artifact: string }> {
  log(
    '· finalize · initiator · ' +
      initiator.tier +
      ' · naming the facts to harden + the report focus',
  );
  const plan = await retryAgent<InitiatorOut>(
    initiator.buildPrompt({
      query: CONFIG.query,
      resultSoFar: bs.resultSoFar,
      waveLog: bs.waveLog,
      landscape: bs.scout!.landscape,
      openRabbitHoles: topOpen,
      mode: CONFIG.mode,
      thinkerNote: CONFIG.THINKER_NOTE,
    }),
    {
      label: 'initiator',
      phase: CONFIG.PHASE.finalize,
      model: initiator.tier,
      effort: initiator.effort,
      schema: initiator.schema,
    },
  );
  const facts =
    plan && plan.refinement && Array.isArray(plan.refinement.facts) ? plan.refinement.facts : [];
  const synthFocus = (plan && plan.synthesiser && plan.synthesiser.focus) || '';
  log(
    '· finalize · plan · facts=' +
      facts.length +
      ' · synthFocus=' +
      (synthFocus ? '"' + synthFocus.slice(0, 60) + '"' : 'none'),
  );
  const artifact = withPrompt(
    'initiator',
    '# Initiator — finalize plan\n\n' +
      '## Facts to harden (' +
      facts.length +
      ')\n\n' +
      (facts.map((f, i) => i + 1 + '. **' + f.fact + '** — ' + f.why).join('\n') || '_none_') +
      '\n\n## Synthesiser focus\n\n' +
      (synthFocus || '_none_') +
      '\n',
  );
  return { facts, synthFocus, artifact };
}
