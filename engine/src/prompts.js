import { plain, render } from './utils/index.js'
import SCOUT_TPL from './prompts/scout.prompt.md?raw'
import PROSPECTOR_TPL from './prompts/prospector.prompt.md?raw'
import BRAINER_TPL from './prompts/brainer.prompt.md?raw'
import SENTINEL_TPL from './prompts/sentinel.prompt.md?raw'
import RESEARCHER_TPL from './prompts/researcher.prompt.md?raw'
import INITIATOR_TPL from './prompts/initiator.prompt.md?raw'
import REFINE_TPL from './prompts/refine.prompt.md?raw'
import COMPUTE_TPL from './prompts/compute.prompt.md?raw'
import AGGREGATOR_TPL from './prompts/aggregator.prompt.md?raw'
import DEBUG_TPL from './prompts/debug.prompt.md?raw'

// ─────────────────────────────────────────────────────────────────────────────
// Prompt library — every prompt the pipeline sends to an agent. The STATIC text
// lives in the `prompts/*.prompt.md` templates ({{placeholder}} holes); each builder
// computes the dynamic pieces (incl. each conditional clause to the exact string the
// original `${…}` produced) and renders the template. Output is byte-identical to the
// original inline backtick templates (proven by test/equivalence.mjs).
// ─────────────────────────────────────────────────────────────────────────────

// Guard clauses appended to agent prompts. FINISH: the pure reducers (brainer, sentinel, initiator,
// aggregator) already hold the data they need — they MAY use a tool if it genuinely helps, but the hard rule is
// they FINISH: emit the COMPLETE StructuredOutput rather than getting lost (the wave-0 brainer once spent its whole
// turn reading this repo's own files on a self-referential query and never emitted resultSoFar/lookupNext/stop).
// WEB_ONLY: the refine pass checks claims on the web — the local repo code is never evidence.
export const FINISH = `
The data above is enough to decide — work from it. You MAY consult a tool if it genuinely helps, but keep it brief and don't get lost; the answer does not require it. Your one required action is to return the StructuredOutput with EVERY required field present — never stop after a partial object.`
export const WEB_ONLY = `
Use the WEB only (WebSearch/WebFetch) to check sources — never read local files or this repository's own code; they are not evidence.`

export const SCOUT_PROMPT = ({ query, net, footer }) => render(SCOUT_TPL, { query, net, footer })

export const PROSPECTOR_PROMPT = ({ query, landscape, sources }) =>
  render(PROSPECTOR_TPL, { query, landscape, sources: plain(sources), WEB_ONLY })

export const BRAINER_PROMPT = ({ wave, query, rubric, landscape, pursuedList, open, findings, topScores, resultSoFar, assignSources, stop, mode, venues, compute }) => {
  const trajectory = topScores.length
    ? `
TOP-PICK SCORE TRAJECTORY by wave (calibrated 0-100): ${plain(topScores)}
A steadily declining trajectory means high-value rabbit-holes are drying up — read it as convergence.`
    : ''
  const goalClause = mode === 'goal'
    ? `
Goal mode: if the goal is already well answered AND the best remaining rabbit-hole adds only marginal value (a declining trajectory is strong evidence), set stop.done=true rather than chase diminishing returns.`
    : ''
  const venuesClause = (venues && venues.length)
    ? `
SOURCE VENUES (from the prospector) — give each lookupNext pick the subset whose source fits its lane, in its \`sources\`, so its researcher searches the right places first:
${plain(venues)}`
    : ''
  const sourcesClause = assignSources
    ? `
For each lookupNext pick, also set \`sourceCount\`: how many sources its researcher should fetch, sized to what that lane needs.`
    : ''
  const memoryClause = wave === 0
    ? `RESULT SO FAR — the run's living MEMORY. Start it this wave: capture the answer as it stands plus the load-bearing evidence behind it.`
    : `RESULT SO FAR — the run's living MEMORY, carried wave to wave. Prior version:
${plain(resultSoFar)}`
  const probeClause = `Before you decide, hunt for coverage GAPS — a candidate, sub-question, or angle the goal needs that no lane has touched — and probe them YOURSELF with WebSearch / WebFetch (as many as you need) to fill them; fold what you find into resultSoFar and ORIGINATE the missing leads into \`lookupNext\`. Beyond gap-filling, leave the heavy digging to the lane-researchers.`
  const scoreFields = assignSources ? ', sources, sourceCount' : ', sources'
  const assignClause = (venues && venues.length) ? ' Assign each its `sources` venue subset.' : ''
  const computeField = compute ? `

COMPUTE TO STEER: when a calculation would change your next move — a number the answer is being built toward, or an estimate of which gap matters most — derive it YOURSELF this wave (reason it out, or write and run a short Python/Node script when the arithmetic needs it) and fold the result into \`working\`. Keep it light; you are steering, not writing the final derivation.` : ''
  return render(BRAINER_TPL, {
    probeClause, wave, query, rubric, landscape,
    open: plain(open), pursuedList: plain(pursuedList), findings: plain(findings),
    trajectory, venuesClause, sourcesClause, memoryClause,
    scoreFields, assignClause, stop, goalClause, computeField, FINISH,
  })
}

export const SENTINEL_PROMPT = ({ query, resultSoFar, reason, waveLog, rabbitHoles, pursuedList }) =>
  render(SENTINEL_TPL, {
    query, resultSoFar: plain(resultSoFar), reason: plain(reason), waveLog: plain(waveLog),
    rabbitHoles: plain(rabbitHoles), pursuedList: plain(pursuedList), FINISH,
  })

export const RESEARCHER_PROMPT = ({ net, query, trail, keyword, why, footer, venues, parallelSourcesPerLaneResearchAgent }) => {
  const venuesClause = venues && venues.length ? `
Search these high-value venues for this lane first: ${venues.map(v => v.goodFor ? v.source + ' (' + v.goodFor + ')' : v.source).join('; ')}.` : ''
  return render(RESEARCHER_TPL, { net, query, trail, keyword, why, venuesClause, srcCount: parallelSourcesPerLaneResearchAgent, footer })
}

export const INITIATOR_PROMPT = ({ query, resultSoFar, waveLog, landscape, openRabbitHoles, compute }) => {
  const computementStage = compute
    ? `2. COMPUTEMENT (only when the answer must be BUILT) — a sequential chain of agents that DERIVE the answer: they assemble the hardened facts, do the actual arithmetic (writing + running code when it helps), and propagate uncertainty into error bars. Turn this ON only when the answer is a quantitative estimate or a synthesis no single source holds (e.g. "estimate the distance to the nearest undetected black hole, with error bars"); turn it OFF for a found fact, a decision, or an inventory.`
    : `2. COMPUTEMENT — OFF for this run (launched with compute disabled); it will not run regardless of what you return here.`
  const computementReturn = compute
    ? `- computement.run + computement.stages[] — run true ONLY when the answer must be derived; stages = the ordered derivation steps (each ONE line of what to compute), [] when run is false. The last stage MAY sanity-check the derived answer.`
    : `- computement — return {run: false, stages: []} (computement is OFF for this run).`
  return render(INITIATOR_TPL, {
    query, resultSoFar: plain(resultSoFar), waveLog: plain(waveLog), landscape, openRabbitHoles: plain(openRabbitHoles), computementStage, computementReturn, FINISH,
  })
}

export const REFINE_PROMPT = ({ net, query, fact, why }) => render(REFINE_TPL, { net, query, fact, why, WEB_ONLY })

export const COMPUTE_PROMPT = ({ query, goal, resultSoFar, hardenedFacts, priorStages }) => {
  const priorClause = priorStages && priorStages.length ? `
Outputs of the prior compute stages (build on these):
${plain(priorStages)}` : ''
  return render(COMPUTE_TPL, { query, goal, hardenedFacts: plain(hardenedFacts), resultSoFar: plain(resultSoFar), priorClause })
}

export const AGGREGATOR_PROMPT = ({ mode, query, landscape, resultSoFar, waveLog, cleanReports, computeResults, focus, openRabbitHoles }) => {
  const hasCompute = computeResults && computeResults.length
  const focusClause = focus ? `
Emphasis from the finalize director: ${focus}` : ''
  const computeMention1 = hasCompute ? ', and the COMPUTED derivation (the actual calculated answer with error bars)' : ''
  const computeMention2 = hasCompute ? ' Present the computed answer verbatim — do not re-derive or second-guess it.' : ''
  const computeDerivation = hasCompute ? `
Computed derivation (the calculated answer — present this as the quantitative result):
${plain(computeResults)}` : ''
  const computeLeading = hasCompute ? 'LEADING with the computed quantitative result + its error bars and showing the derivation, then ' : ''
  return render(AGGREGATOR_TPL, {
    mode, query, focusClause, computeMention1, computeMention2,
    landscape, resultSoFar: plain(resultSoFar), waveLog: plain(waveLog), cleanReports: plain(cleanReports),
    computeDerivation, openRabbitHoles: plain(openRabbitHoles), computeLeading, FINISH,
  })
}

export const DEBUG_PROMPT = ({ query, focus, metrics, waveLog, sentinelLog, resultLog, highValueSources, laneRecords }) => {
  const focusClause = focus ? `
Then answer this run-specific question directly: ${focus}` : ''
  return render(DEBUG_TPL, {
    query, highValueSources: plain(highValueSources), focusClause, metrics: plain(metrics),
    laneRecords: plain(laneRecords), waveLog: plain(waveLog), sentinelLog: plain(sentinelLog), resultLog: plain(resultLog), FINISH,
  })
}
