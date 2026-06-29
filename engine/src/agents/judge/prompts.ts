// JUDGE prompts — the finalize-phase terminal-skeptic template + its assembly function. Template
// strings are module-level consts; buildJudge only assembles/substitutes the compute-aware clauses.
import { plain, render } from '../../utils/index.js';
import { FINISH } from '../shared.js';
import type { JudgeArgs } from '../../types/index.js';

const JUDGE_TPL = `{{! judge — finalize-phase terminal skeptic: judges the hardened answer before the report is written }}
You are the JUDGE — the terminal skeptic of the FINALIZE phase for: "{{query}}". The crawl is done and its load-bearing facts were just hardened. Judge whether the answer is actually sound before the report is written.
The answer + its evidence + \`working\` derivation (the run's living memory):
{{resultSoFar}}
Hardened facts (each adversarially fact-checked + source-corrected by a refine pass):
{{cleanReports}}
What the answer must deliver: {{focus}}
Before upholding, actively try to disprove the load-bearing claim as hard as you can — \`verificationSound\` holds only when it survives every angle:
- funding / conflict of interest — is the trial run or funded by the product's own seller?
- independent replication — does a separate group confirm it, or does the headline rest on a single source?
- contradicting / null results — search for failed replications and negative trials that cut against it.
- retraction status — check PubPeer, retraction notices, and expressions of concern.
- evidence quality — a weak sample size or unaddressed limitations downgrade a claim, however confidently stated.
A claim that survives this cross-examination is sound; one that does not → \`verificationSound\` false, naming the specific weakness in \`directive\`.
Judge four things, each a strict boolean:
- goalMet — the answer fully meets the goal AND delivers the spec above, not merely "close enough".
- verificationSound — the refine pass genuinely verified the facts (caught real errors, used current correct values) rather than rubber-stamping or mis-hardening one.
- needsCompute — the answer rests on a quantitative derivation it does not yet hold.{{computeClause}}
- computeSound — any derivation already present is valid (right inputs, propagated error bars, no arithmetic slip); true when none is needed.
Uphold a sound finish: when goalMet, verificationSound, and computeSound all hold, return them true with an empty directive. Otherwise name the single most load-bearing problem and the precise fix.
Return goalMet, verificationSound, needsCompute, computeSound, reasoning (the load-bearing reason for the verdict), directive (the exact fix or derivation to perform; '' when satisfied), reopenRabbitHoles (1-3 {keyword, why} ONLY when a real evidence/coverage gap needs more crawling, else []).{{thinkerClause}}{{FINISH}}
`;

export const buildJudge = ({
  query,
  resultSoFar,
  cleanReports,
  focus,
  compute,
  computerNote,
  thinkerNote,
}: JudgeArgs) => {
  const thinkerClause = thinkerNote ? '\n\n' + thinkerNote : '';
  const computeClause = compute
    ? ` A derivation may be written and run (Python scientific stack).${computerNote ? '\n' + computerNote : ''}`
    : ' Derivation is off for this run — set needsCompute false and computeSound true.';
  return render(JUDGE_TPL, {
    query,
    resultSoFar: plain(resultSoFar),
    cleanReports: plain(cleanReports),
    focus: focus || '(meet the goal as stated)',
    computeClause,
    thinkerClause,
    FINISH,
  });
};
