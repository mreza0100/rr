// INITIATOR prompts — the finalize-planner template + its assembly function. Template strings are
// module-level consts; buildInitiator only substitutes the operator-steering clause.
import { plain, render } from '../../utils/index.js';
import { FINISH } from '../shared.js';
import type { InitiatorArgs } from '../../types/index.js';

const INITIATOR_TPL = `{{! initiator — plans the finalize pipeline, shaping the finish to this query }}
You direct the FINALIZE phase for: "{{query}}". The research is done; below is everything it gathered. Shape the finishing pipeline to fit this query, then return the plan.
The finish runs in two parts, and you set how each starts:
1. REFINEMENT — one refine agent per item adversarially fact-checks that group of load-bearing facts and returns them corrected and hardened. You decide the grouping. (A judge then evaluates the hardened answer and may trigger a derivation or a re-check; you do not plan that.)
2. SYNTHESIS — writes the final report from the hardened, judged answer. You give it a focus note.
The run's accumulated RESULT (the brainer's living memory — answer, the \`working\` derivation, evidence, gaps, tensions):
{{resultSoFar}}
Per-wave log:
{{waveLog}}
Scout landscape: {{landscape}}
Top open rabbit-holes left unpursued:
{{openRabbitHoles}}
Return:
- refinement.facts[] — the load-bearing facts to harden, aggressively grouped: bundle facts that share sources or stand or fall together into ONE item (each {fact, why}); prefer a few broad groups over many atomic facts. Cover every fact that would change the answer if wrong; skip soft restatements.
- synthesiser.focus — one note on what the report must emphasize / the shape the answer should take.{{thinkerClause}}{{FINISH}}
`;

export const buildInitiator = ({
  query,
  resultSoFar,
  waveLog,
  landscape,
  openRabbitHoles,
  thinkerNote,
}: InitiatorArgs) => {
  const thinkerClause = thinkerNote ? '\n\n' + thinkerNote : '';
  return render(INITIATOR_TPL, {
    query,
    resultSoFar: plain(resultSoFar),
    waveLog: plain(waveLog),
    landscape,
    openRabbitHoles: plain(openRabbitHoles),
    thinkerClause,
    FINISH,
  });
};
