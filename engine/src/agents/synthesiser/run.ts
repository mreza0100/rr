import { CONFIG } from '../../config.js';
import { synthesiser } from './index.js';
import { retryAgent } from '../../runtime.js';
import type { BrainerState } from '../../brainerState.js';
import type { CleanReport, ReportOut } from '../../types/index.js';

// SYNTHESISER — writes the END report (always) from the judged answer (resultSoFar, any derivation folded into `working`) + the hardened facts.
// gated on CONFIG.compute (not just a non-empty `working`) so compute-off runs never present a derivation. Returns the ReportOut; the engine
// prepends the run-args banner and writes result.md.
export async function runSynthesiser(
  bs: BrainerState,
  cleanReports: CleanReport[],
  synthFocus: string,
  topOpen: string[],
): Promise<ReportOut | null> {
  const hasDerivation = !!(
    CONFIG.compute &&
    bs.resultSoFar &&
    bs.resultSoFar.working &&
    bs.resultSoFar.working.trim()
  );
  log(
    '· finalize · synthesiser · ' +
      synthesiser.tier +
      ' · writing the report' +
      (hasDerivation ? ' (with derivation)' : ''),
  );
  return retryAgent<ReportOut>(
    synthesiser.buildPrompt({
      mode: CONFIG.mode,
      query: CONFIG.query,
      landscape: bs.scout!.landscape,
      resultSoFar: bs.resultSoFar,
      waveLog: bs.waveLog,
      cleanReports,
      focus: synthFocus,
      openRabbitHoles: topOpen,
      compute: CONFIG.compute,
      thinkerNote: CONFIG.THINKER_NOTE,
    }),
    {
      label: 'synthesiser',
      phase: CONFIG.PHASE.finalize,
      model: synthesiser.tier,
      effort: synthesiser.effort,
      schema: synthesiser.schema,
    },
  );
}
