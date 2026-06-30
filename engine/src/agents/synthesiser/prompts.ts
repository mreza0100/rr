// SYNTHESISER prompts — the report-writer template + its assembly function. Template strings are
// module-level consts; buildSynthesiser only assembles/substitutes the compute-mention clauses.
import { plain, render } from '../../utils/index.js';
import { FINISH } from '../shared.js';
import type { SynthesiserArgs } from '../../types/index.js';

const SYNTHESISER_TPL = `{{! synthesiser — writes the final multi-section cited report }}
Write the final research report (mode={{mode}}) for: "{{query}}".{{focusClause}}{{thinkerClause}}
Work from: the run's accumulated RESULT (the brainer's living memory — answer, working derivation, evidence, resolved, open gaps, tensions), the hardened facts (each adversarially fact-checked + source-corrected), not raw findings.
Lean on the hardened facts as the source of truth: drop anything they leave unsupported and use the corrected value wherever they revised one.{{computeMention}} Cite sources inline where they matter.
Scout landscape: {{landscape}}
Run result so far (the answer as it ended + its evidence + the \`working\` derivation):
{{resultSoFar}}
Per-wave log (what each wave pursued + where the answer stood — for the §2 narrative):
{{waveLog}}
Hardened facts (the corrected claims):
{{cleanReports}}
Top remaining open rabbit-holes (for Open questions):
{{openRabbitHoles}}
Write \`report\` as markdown with exactly these sections in order: (1) Prompt — the goal; (2) Research waves — per wave: what was pursued and how the answer sharpened (from the per-wave log); (3) Scout landscape; (4) Findings — the synthesized answer, {{computeLeading}}weaving each hardened fact in with its corrected value; (5) Assumptions — the working assumptions the answer leans on (from resultSoFar.assumptions), each with its basis, flagging any that is load-bearing but unconfirmed; (6) Verdict + overall confidence; (7) Plan — concrete operator actions; (8) Open questions. Also return verdict (1-3 sentences), confidence, plan (array of action strings), openQuestions (array).{{FINISH}}
`;

export const buildSynthesiser = ({
  mode,
  query,
  landscape,
  resultSoFar,
  waveLog,
  cleanReports,
  focus,
  openRabbitHoles,
  compute,
  thinkerNote,
}: SynthesiserArgs) => {
  // the brain folds any finalize derivation into resultSoFar.working — present that as the quantitative result.
  // Key this on CONFIG.compute, NOT merely on a non-empty `working`: with compute OFF a derivation must NEVER be
  // presented even if one leaked into resultSoFar (only an EXPLICIT compute:false suppresses it, so prompt-only
  // callers that omit compute keep the present-when-derived default).
  const hasCompute =
    compute !== false && !!(resultSoFar && resultSoFar.working && resultSoFar.working.trim());
  const thinkerClause = thinkerNote ? '\n\n' + thinkerNote : '';
  const focusClause = focus
    ? `
Emphasis from the finalize director: ${focus}`
    : '';
  const computeMention = hasCompute
    ? ' The `working` field holds the computed derivation (the calculated answer with error bars) — present it verbatim, do not re-derive or second-guess it.'
    : '';
  const computeLeading = hasCompute
    ? 'LEADING with the computed result + its error bars from `working` and showing the derivation, then '
    : '';
  return render(SYNTHESISER_TPL, {
    mode,
    query,
    focusClause,
    thinkerClause,
    computeMention,
    landscape,
    resultSoFar: plain(resultSoFar),
    waveLog: plain(waveLog),
    cleanReports: plain(cleanReports),
    openRabbitHoles: plain(openRabbitHoles),
    computeLeading,
    FINISH,
  });
};
