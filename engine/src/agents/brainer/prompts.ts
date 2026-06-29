// BRAINER prompts — the brain's per-wave template + the clause-assembly function. Template strings
// are module-level consts; buildBrainer only assembles/substitutes the per-wave clauses.
import { plain, render } from '../../utils/index.js';
import { FINISH } from '../shared.js';
import type { BrainerArgs, BrainerComputeArgs } from '../../types/index.js';

const BRAINER_TPL = `{{! brainer — the brain: scores and steers rabbit-holes, keeps resultSoFar, decides done }}
You are the BRAINER — you make every decision in this research run and set its direction.

How the run works: a scout seeded the first rabbit-holes and a prospector named the source venues; then you drive each wave. You hand rabbit-holes to parallel lane-researchers — fast workers that WebSearch + WebFetch the venues you assign, read the pages, and return findings + new rabbit-holes — then you update the running result, steer the next wave, and decide when to stop. On stop, a refinement stage adversarially checks your findings and writes the report.

The engine keeps the open rabbit-holes as an id-keyed store and carries each one's score history natively — you never re-emit the whole set, you return deltas against it.

Direction is two powers:
• LOOK UP rabbit-holes already in the store (by id) to research next.
• ORIGINATE — when the answer needs an angle, candidate, or sub-question no stored rabbit-hole covers, add it as a new directive {keyword, why, score} and a researcher will go collect it. Name a gap you can see rather than wait for one to surface; summon a candidate the scout missed — not padding. Put it in \`lookupNext\` to pursue now, or in \`add\` to park it for a later wave.

As you steer, hold three rules:
• Pivot on disproof — when a lead is fundamentally refuted, abandon it without sunk-cost and take a different road; a dead lead dropped is progress.
• Surfacing is not verifying — finding a result does not verify it. If the answer's headline rests on a claim you have not stress-tested, the judge will reject the stop, so stress-test load-bearing claims before declaring done.
• Promote serendipity — a surfaced, non-seeded candidate that out-evidences the seeded ones becomes first-class: deepen it like a seed rather than under-explore it for being off the seed list.

{{probeClause}}{{thinkerClause}}{{researcherClause}}

Wave {{wave}}. Query: "{{query}}". {{rubric}}
Scout landscape: {{landscape}}
RABBIT-HOLE STORE — open rabbit-holes (\`#id [last score or "new"] keyword — why\`); re-score up or down, a low one can resurrect, score every "new" one:
{{open}}
ALREADY PURSUED — do not look up or re-originate these (research history):
{{pursuedList}}
Findings this wave (from the researchers' page-reading):
{{findings}}{{trajectory}}{{venuesClause}}{{languageClause}}

{{memoryClause}}
Update and return \`resultSoFar\` as the run's memory: refine \`answer\`; append load-bearing \`evidence\` only (each {fact, value, source, status: settled|tentative|contested} — facts the answer rests on, not a transcript); record the working \`assumptions\` the answer leans on (each {claim, basis}) and revise or retire them as evidence lands; move closed parts into \`resolved\`; keep \`openGaps\` current; record any \`tensions\` (conflicting sources); for build-the-answer / estimate questions grow the \`working\` derivation chain (else ''); set \`confidence\`.
Weight findings by evidence quality — funding independence, sample size, replication, stated limitations — not mere existence; let it drive both your scores and \`confidence\`.
For each headline / load-bearing finding, originate a lane to hunt failed replications, null trials, or refutations. Keep such a claim at status \`tentative\` (single source) until an independent source — a different group and funder — corroborates it; only then mark it \`settled\`.{{computeField}}

Then return deltas against the store:
(1) \`rescore\`: [{id, score}] — only the rabbit-holes whose 0-100 score changes this wave (score every "new" one at least once); unlisted ones keep their last score. Score honestly per the rubric; a marginal one scores low.
(2) \`add\`: [{keyword, why, score}] — new rabbit-holes to park in the store for a later wave (the engine assigns each an id).
(3) \`lookupNext\`: the rabbit-holes to research now — each either {id} (a stored one) or {keyword, why, score{{scoreFields}}} (one you originate and pursue now). None may be already pursued.{{assignClause}}
(4) \`rename\`: [{id, keyword, why?}] — relabel a rabbit-hole, keeping its id + history (optional).
(5) \`drop\`: [id, …] — eliminate a dead/duplicate rabbit-hole; a merge = drop the duplicate and rescore the survivor (optional).
(6) \`stop\`: {done, reason}. {{stop}}{{goalClause}}{{sentinelClause}}{{validatorClause}}{{FINISH}}
`;

export const buildBrainer = ({
  wave,
  query,
  rubric,
  landscape,
  pursuedList,
  open,
  findings,
  topScores,
  resultSoFar,
  stop,
  mode,
  venues,
  languageGuidance,
  lastSentinelReason,
  lastValidatorMissing,
  compute,
  computerNote,
  thinkerNote,
  researcherNote,
}: BrainerArgs) => {
  const thinkerClause = thinkerNote ? '\n\n' + thinkerNote : '';
  const sentinelClause = lastSentinelReason
    ? `\nPRIOR SENTINEL REJECTION — clear this before declaring done: ${lastSentinelReason}`
    : '';
  const validatorClause = lastValidatorMissing
    ? `\nVALIDATOR — last wave left these unfilled; re-pursue the reopened lanes or originate new ones to close them: ${lastValidatorMissing}`
    : '';
  const researcherClause = researcherNote ? '\n' + researcherNote : '';
  const trajectory = topScores.length
    ? `
TOP-PICK SCORE TRAJECTORY by wave (calibrated 0-100): ${plain(topScores)}
A steadily declining trajectory means high-value rabbit-holes are drying up — read it as convergence.`
    : '';
  const goalClause =
    mode === 'goal'
      ? `
Goal mode: if the goal is already well answered and the best remaining rabbit-hole adds only marginal value (a declining trajectory is strong evidence), set stop.done=true rather than chase diminishing returns.`
      : '';
  const venuesClause =
    venues && venues.length
      ? `
SOURCE VENUES (from the prospector) — give each lookupNext pick the subset whose source fits its lane, in its \`sources\`, so its researcher searches the right places first:
${plain(venues)}`
      : '';
  const memoryClause =
    wave === 0
      ? `RESULT SO FAR — the run's living MEMORY. Start it this wave: capture the answer as it stands plus the load-bearing evidence behind it.`
      : `RESULT SO FAR — the run's living MEMORY, carried wave to wave. Prior version:
${plain(resultSoFar)}`;
  const languageClause =
    languageGuidance && languageGuidance.trim()
      ? `
Some of this topic's strongest literature is non-English. Guidance: ${languageGuidance}. Deliberately route some lanes to the non-English venues above, giving each its native venue(s) in \`sources\` — rather than defaulting every lane to English.`
      : '';
  const probeClause = `Before you decide, hunt for coverage gaps — a candidate, sub-question, or angle the goal needs that no lane has touched — and probe them yourself with WebSearch / WebFetch (as many as you need) to fill them; fold what you find into resultSoFar and originate the missing rabbit-holes into \`lookupNext\`. Beyond gap-filling, leave the heavy digging to the lane-researchers.`;
  const scoreFields = ', sources';
  const assignClause = venues && venues.length ? ' Assign each its `sources` venue subset.' : '';
  const computeField = compute
    ? `

COMPUTE TO STEER: when a calculation would change your next move — a number the answer is being built toward, or an estimate of which gap matters most — derive it yourself this wave (reason it out, or write and run a short Python/Node script when the arithmetic needs it) and fold the result into \`working\`. Keep it light; you are steering, not writing the final derivation.${computerNote ? '\n\n' + computerNote : ''}`
    : '';
  return render(BRAINER_TPL, {
    probeClause,
    thinkerClause,
    researcherClause,
    wave,
    query,
    rubric,
    landscape,
    open: plain(open),
    pursuedList: plain(pursuedList),
    findings: plain(findings),
    trajectory,
    venuesClause,
    languageClause,
    memoryClause,
    scoreFields,
    assignClause,
    stop,
    goalClause,
    sentinelClause,
    validatorClause,
    computeField,
    FINISH,
  });
};

// brain FINALIZE-COMPUTE — the brainer re-invoked (code-capable, full resultSoFar) to DERIVE the final answer
// on the hardened facts, on the judge's directive. Transplants the old compute chain's rigor: fact-check the
// input numbers, write + run a short script for the arithmetic, propagate error bars, self-check.
const BRAIN_COMPUTE_TPL = `{{! brain-compute — the brain derives the final answer on the hardened facts, with rigor + error bars }}
You are the BRAINER, now DERIVING the final answer for: "{{query}}". The judge ruled the answer still needs this derivation — build it, do not restate facts.
Judge directive: {{directive}}
Judge reasoning: {{reason}}
Hardened facts (adversarially fact-checked + source-corrected — your input numbers):
{{hardenedFacts}}
The run's accumulated RESULT (your answer + the half-built \`working\` derivation to finish):
{{resultSoFar}}
Derive with rigor:
- first fact-check your input numbers: verify each against a current primary source (WebSearch / WebFetch) and correct any that is stale, wrong, or imprecise before computing — a derivation is only as sound as its inputs;
- assemble the verified inputs with their units;
- write and run a short script for any non-trivial arithmetic — load Bash + Write via ToolSearch if absent, run python (or node) — compute, do not estimate;
- propagate the input uncertainties into an explicit ± error range;
- adversarially check your own work: re-derive a second way or sanity-check against an anchor, and fix any unit / formula / arithmetic slip.{{noteClause}}{{thinkerClause}}
Return the updated \`resultSoFar\`: fold the completed derivation into \`working\` (the verified inputs, the steps, the numbers, the ± result, the self-check), put the headline computed result in \`answer\`, and keep evidence / resolved / openGaps / tensions / confidence current.{{FINISH}}
`;

export const buildBrainerCompute = ({
  query,
  resultSoFar,
  hardenedFacts,
  directive,
  reason,
  computerNote,
  thinkerNote,
}: BrainerComputeArgs) => {
  const noteClause = computerNote ? '\n' + computerNote : '';
  const thinkerClause = thinkerNote ? '\n\n' + thinkerNote : '';
  return render(BRAIN_COMPUTE_TPL, {
    query,
    resultSoFar: plain(resultSoFar),
    hardenedFacts: plain(hardenedFacts),
    directive: directive || '(derive the answer the goal needs)',
    reason: reason || '',
    noteClause,
    thinkerClause,
    FINISH,
  });
};
