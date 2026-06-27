// ─────────────────────────────────────────────────────────────────────────────
// schemas — StructuredOutput contracts (declaration order respects nesting; nested
// items reference the schemas above). Extracted from the Configs constructor: each
// `this.X = {…}` became a module-level `export const X = {…}` (bare references).
// ─────────────────────────────────────────────────────────────────────────────
export const RABBITHOLE = { type: 'object', properties: { keyword: { type: 'string' }, why: { type: 'string' } }, required: ['keyword', 'why'] }
export const SCORED = { type: 'object', properties: { keyword: { type: 'string' }, why: { type: 'string' }, score: { type: 'number' } }, required: ['keyword', 'why', 'score'] }
export const PAGE = { type: 'object', properties: { url: { type: 'string' }, summary: { type: 'string' }, rabbitHoles: { type: 'array', items: RABBITHOLE } }, required: ['url', 'summary', 'rabbitHoles'] }
export const SCOUT = { type: 'object', properties: { landscape: { type: 'string' }, pages: { type: 'array', items: PAGE }, deadEnds: { type: 'array', items: { type: 'string' } } }, required: ['landscape', 'pages'] }
export const RESEARCH = { type: 'object', properties: { summary: { type: 'string' }, rabbitHoles: { type: 'array', items: RABBITHOLE }, deadEnds: { type: 'array', items: { type: 'string' } } }, required: ['summary', 'rabbitHoles'] }
// LOOKUP = one item in the brainer's `lookupNext` (research NOW): EITHER {id} (an existing open rabbit-hole) OR {keyword,why,score,…}
// (originate-and-pursue-now). All fields optional so both shapes validate; `sources`/`sourceCount` are the prospector venues the brainer
// assigns to THIS lane (its researcher searches them first).
export const LOOKUP = { type: 'object', properties: {
  id: { type: 'number', description: 'id of an existing open rabbit-hole to research now — use this OR the keyword fields, not both' },
  keyword: { type: 'string' }, why: { type: 'string' }, score: { type: 'number' },
  sources: { type: 'array', items: { type: 'string' }, description: 'subset of the prospector venue identifiers (their exact `source` strings) best suited to THIS rabbit-hole — its researcher will prefer these. Empty if none fit.' },
  sourceCount: { type: 'number', description: 'how many sources this lane\'s researcher should fetch' },
} }
// resultSoFar = the run's living MEMORY, carried wave to wave. The brainer maintains it; refinement gets the FINAL one only.
export const RESULT_SO_FAR = { type: 'object', properties: {
  answer: { type: 'string', description: 'the best current answer to the goal, as it stands this wave' },
  evidence: { type: 'array', items: { type: 'object', properties: {
    fact: { type: 'string' }, value: { type: 'string' }, source: { type: 'string' },
    status: { type: 'string', enum: ['settled', 'tentative', 'contested'] },
  }, required: ['fact', 'value', 'source', 'status'] }, description: 'load-bearing facts the answer rests on — NOT a transcript of everything seen' },
  resolved: { type: 'array', items: { type: 'string' }, description: 'sub-questions now closed' },
  openGaps: { type: 'array', items: { type: 'string' }, description: 'what is still missing' },
  tensions: { type: 'array', items: { type: 'string' }, description: 'conflicting sources / unresolved contradictions' },
  working: { type: 'string', description: 'for build-the-answer / estimate questions, the growing derivation chain; \'\' for non-derivation questions' },
  confidence: { type: 'string' },
}, required: ['answer', 'evidence', 'resolved', 'openGaps', 'tensions', 'working', 'confidence'] }
// COMPUTEMENT = a request to run the code-capable COMPUTE agent: run + ordered one-line derivation stages. The Finalize initiator emits it
// to derive the final answer (the brainer computes its own steering numbers inline — no separate stage).
export const COMPUTEMENT = { type: 'object', properties: {
  run: { type: 'boolean', description: 'true when a calculation is needed — a quantitative estimate, a derivation, or a synthesis no single source holds; false otherwise' },
  stages: { type: 'array', items: { type: 'string' }, description: 'the ordered derivation steps, each ONE line of what to compute; [] when run is false. The last stage MAY be a sanity-check / verification of the derived value' },
}, required: ['run', 'stages'] }
// COORD = the brainer's per-wave output: the updated resultSoFar + DELTAS against the engine's id-keyed open store. The engine carries
// each rabbit-hole's id + scoreHistory natively — the brainer never re-emits the whole set, it only sends what changed.
export const COORD = { type: 'object', properties: {
  resultSoFar: RESULT_SO_FAR,
  rescore: { type: 'array', items: { type: 'object', properties: { id: { type: 'number' }, score: { type: 'number' } }, required: ['id', 'score'] }, description: 'ONLY the open rabbit-holes whose score CHANGES this wave (the engine pushes {wave,score} to each id\'s history); unlisted leads keep their last score. Score every "new" (unscored) lead at least once.' },
  add: { type: 'array', items: SCORED, description: 'NEW rabbit-holes to PARK in the store for a later wave — the engine assigns each a fresh id, scoreHistory seeded with this score' },
  lookupNext: { type: 'array', items: LOOKUP, description: 'the rabbit-holes to research NOW — each EITHER {id} (a stored lead) OR {keyword,why,score,sources?,sourceCount?} (originate-and-pursue-now). NONE may be already pursued; assign each its relevant `sources` venue subset.' },
  rename: { type: 'array', items: { type: 'object', properties: { id: { type: 'number' }, keyword: { type: 'string' }, why: { type: 'string' } }, required: ['id', 'keyword'] }, description: 'relabel a rabbit-hole, keeping its id + score history' },
  drop: { type: 'array', items: { type: 'number' }, description: 'ids of dead/duplicate rabbit-holes to eliminate (a MERGE = drop the duplicate, rescore the survivor)' },
  stop: { type: 'object', properties: { done: { type: 'boolean' }, reason: { type: 'string', description: 'one line: why done, or what is still missing' } }, required: ['done', 'reason'] },
}, required: ['resultSoFar', 'rescore', 'add', 'lookupNext', 'stop'] }
// L4 (directive B): the goal-mode SENTINEL schema — the TERMINAL skeptic of the crawl phase, the inverse of verify. It runs ONCE when the
// brainer declares done: it sees the open store + the brainer's running answer and decides whether stopping is SOLID. If not, it injects
// high-score gap objects at the TOP of the store and hands them back to the lane researchers — the crawl resumes. Bounded by MAX_SENTINEL_REOPENS.
export const SENTINEL = { type: 'object', properties: {
  solid: { type: 'boolean', description: 'true = the brainer\'s decision to stop is SOLID (uphold it, end the crawl); false = the brainer stopped prematurely / left a load-bearing gap' },
  reasoning: { type: 'string', description: 'why the stop is solid, or what load-bearing gap was missed' },
  rabbitHoles: { type: 'array', items: { type: 'object', properties: { keyword: { type: 'string' }, why: { type: 'string' } }, required: ['keyword', 'why'] }, description: 'when solid=false: 1-3 concrete high-priority gap searches to inject at the store top (NONE already pursued); empty when solid=true' },
}, required: ['solid', 'reasoning'] }
// PROSPECTOR schema — names the high-value AUTHORITATIVE source venues for THIS topic (domain-specific); output rides with the brainer.
export const SOURCES = { type: 'object', properties: {
  highValueSources: { type: 'array', items: { type: 'object', properties: {
    source: { type: 'string', description: 'the venue + how to reach/search it, e.g. "arXiv (site:arxiv.org)", "SemiAnalysis (semianalysis.com)"' },
    goodFor: { type: 'string', description: 'the kinds of sub-questions/rabbit-holes this venue is BEST for — specific enough for the brainer to match a research lane to it' },
  }, required: ['source', 'goodFor'] } },
  reasoning: { type: 'string', description: 'brief: how you chose these venues / what you searched to confirm' },
}, required: ['highValueSources'] }
// FINALIZE schemas. The INITIATOR plans the finish (which facts to harden, whether to derive, the report focus); a Sonnet REFINE pass
// adversarially fact-checks each load-bearing fact and returns its corrected claim; an optional sequential Opus COMPUTE chain derives the answer.
export const INITIATOR = { type: 'object', properties: {
  refinement: { type: 'object', properties: {
    facts: { type: 'array', items: { type: 'object', properties: {
      fact: { type: 'string', description: 'a load-bearing fact the answer rests on' },
      why: { type: 'string', description: 'why it is load-bearing — what breaks if it is wrong' },
    }, required: ['fact', 'why'] }, description: 'every load-bearing fact to harden — NO cap; name all that would change the answer if wrong, skip soft restatements' },
  }, required: ['facts'] },
  computement: COMPUTEMENT,
  aggregator: { type: 'object', properties: {
    focus: { type: 'string', description: 'a note to the report writer on what to emphasize / the shape the answer should take' },
  }, required: ['focus'] },
}, required: ['refinement', 'computement', 'aggregator'] }
export const REFINE = { type: 'object', properties: { report: { type: 'string', description: 'markdown: the clean / corrected claim(s) for this fact after adversarial fact-checking against the sources' } }, required: ['report'] }
export const COMPUTE = { type: 'object', properties: {
  value: { type: 'string', description: 'the headline quantity this stage computed — with units and an error range where applicable' },
  result: { type: 'string', description: 'markdown: the derivation — the input numbers used, the steps, the result, and the self-check' },
  script: { type: 'string', description: 'the exact source of any code you wrote AND ran to compute this; "" if none' },
  scriptLang: { type: 'string', description: 'language of `script` (python / node); "" if none' },
  assumptions: { type: 'array', items: { type: 'string' }, description: 'assumptions the derivation rests on' },
}, required: ['value', 'result', 'assumptions'] }
export const REPORT = { type: 'object', properties: {
  report: { type: 'string', description: 'the FULL report as markdown, all 7 sections in order per the contract' },
  verdict: { type: 'string', description: '1-3 sentence headline answer' },
  confidence: { type: 'string', enum: ['high', 'medium', 'low'] },
  plan: { type: 'array', items: { type: 'string' }, description: 'concrete, opinionated operator actions' },
  openQuestions: { type: 'array', items: { type: 'string' } },
}, required: ['report', 'verdict', 'confidence', 'plan', 'openQuestions'] }
export const DIAG = { type: 'object', properties: { diagnosis: { type: 'string', description: 'the full corner-by-corner debug aggregation + analysis as markdown' } }, required: ['diagnosis'] }
