import { CONFIG } from '../../config.js';
import { judge } from './index.js';
import { retryAgent } from '../../runtime.js';
import { lastScore } from '../../utils/index.js';
import type { BrainerState } from '../../brainerState.js';
import type { CleanReport, JudgeOut } from '../../types/index.js';

// the prefix shared by the compute-off limitation message and the engine's openGaps dedup, so editing the wording edits both.
export const COMPUTE_LIMIT_PREFIX = 'Quantitative derivation unavailable';

// JUDGE — the TERMINAL skeptic of the finalize phase. Judges the hardened answer (goal met, verification real, derivation valid) and
// names the precise fix when not. When compute is off, needsCompute/computeSound are forced (no derivation path). Bounded by MAX_JUDGE_PASSES.
export async function runJudge(
  bs: BrainerState,
  cleanReports: CleanReport[],
  focus: string,
  pass: number,
): Promise<JudgeOut | null> {
  log('· finalize · judge · ' + judge.tier + ' · judging the hardened answer (pass ' + pass + ')');
  // B1-refinement: the judge sees the leftover/unpursued open rabbit-holes (top by score) so it can rule whether a real gap remains and reopen the crawl.
  const openRabbitHoles = [...bs.rabbitHoles]
    .sort((a, b) => (lastScore(b) ?? -1) - (lastScore(a) ?? -1))
    .slice(0, CONFIG.FINALIZE_TOP_OPEN)
    .map((r) => '[' + (lastScore(r) ?? 'new') + '] ' + r.keyword + ' — ' + r.why);
  const out = await retryAgent<JudgeOut>(
    judge.buildPrompt({
      query: CONFIG.query,
      resultSoFar: bs.resultSoFar,
      cleanReports,
      focus,
      openRabbitHoles,
      compute: CONFIG.compute,
      mode: CONFIG.mode,
      computeNote: CONFIG.COMPUTE_NOTE,
      thinkerNote: CONFIG.THINKER_NOTE,
    }),
    {
      label: 'judge-' + pass,
      phase: CONFIG.PHASE.finalize,
      model: judge.tier,
      effort: judge.effort,
      schema: judge.schema,
    },
  );
  if (out && !CONFIG.compute) {
    // compute off → no derivation can run; computeSound is true because none is PRESENT to be unsound (this never
    // blocks the exit). But do NOT rubber-stamp needsCompute to false: if the judge says the answer genuinely needs
    // a derivation it cannot have, RETURN that honest signal as a STATED LIMITATION for the engine to fold into
    // openGaps (the report's Open questions) — the engine owns every resultSoFar mutation, not this run fn.
    out.computeSound = true;
    if (out.needsCompute && bs.resultSoFar)
      out.computeLimitation =
        COMPUTE_LIMIT_PREFIX +
        ' (compute is off): ' +
        (out.directive ||
          out.reasoning ||
          'the answer rests on a derivation this run could not perform');
  }
  if (out)
    log(
      '· finalize · judge pass ' +
        pass +
        ' · goalMet=' +
        out.goalMet +
        ' verif=' +
        out.verificationSound +
        ' needsCompute=' +
        out.needsCompute +
        ' computeSound=' +
        out.computeSound,
    );
  return out;
}
