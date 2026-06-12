export const meta = {
  name: 'rr-research',
  description: 'RR research engine — scout, then judge-steered research rounds (research → judge → research), adversarial verify, synthesize to the report file',
  phases: [
    { title: 'Scout', detail: 'map the landscape, derive sub-questions' },
    { title: 'Research', detail: 'researchers + decided-retrieval collectors fan out per round' },
    { title: 'Judge', detail: 'reads all findings, steers the next round, calls saturation' },
    { title: 'Verify', detail: 'adversarial attack on the load-bearing claims' },
    { title: 'Synthesize', detail: 'writes the report file, returns the executive summary' },
  ],
}

// args contract + flow graph are declared copies of .claude/skills/rr/SKILL.md § Mode 1 — update both together:
// { goal, context, surface: 'internet'|'codebase'|'both', reportPath, timestamp,
//   subQuestions?: [{q, rationale}], sacred?: boolean, maxRounds?: number }

// Tolerate a JSON-encoded args payload — callers sometimes pass the object as a string.
const arg = typeof args === 'string' ? JSON.parse(args) : (args || {})
if (!arg.goal || !arg.reportPath || !arg.timestamp || !['internet', 'codebase', 'both'].includes(arg.surface)) {
  throw new Error('rr workflow requires args {goal, surface, reportPath, timestamp} — see .claude/skills/rr/SKILL.md Mode 1 Step 3')
}

const MAX_ROUNDS = arg.maxRounds || 4
const WAVE_CAP = 5      // researchers per round
const FETCH_CAP = 4     // decided-retrieval collectors per round
const CLAIM_CAP = 8     // key claims sent to adversarial verify

// Stage→model map: judgment (scout, judge, synthesize) never leaves opus; retrieval rides cheaper tiers.
// Sacred surfaces (compliance/clinical) lift every stage to opus — no cheap collectors near that ground.
const sacred = !!arg.sacred
const M = {
  scout: 'opus',
  researcher: sacred ? 'opus' : 'sonnet',
  collector: sacred ? 'opus' : 'haiku',
  judge: 'opus',
  verifier: sacred ? 'opus' : 'sonnet',
  synth: 'opus',
}

const NET = 'Internet tools: WebSearch + WebFetch (if absent, load via ToolSearch "select:WebSearch,WebFetch" first); context7 for library docs. Prefer primary sources over blog summaries; prefer recent sources (today: ' + arg.timestamp + ') unless older is the canonical reference.'
const CODE = 'Codebase tools: Read, Grep, Glob, read-only Bash, from the repo root. Prefer reading actual code over guessing from docstrings.'
const TOOLS = { internet: NET, codebase: CODE, both: NET + ' ' + CODE }[arg.surface]
const BRIEF = 'RR research run. Goal: ' + arg.goal + ' Context: ' + (arg.context || '(none given)') + ' ' + TOOLS

const Q = { type: 'object', properties: { q: { type: 'string' }, rationale: { type: 'string' } }, required: ['q'] }
const FINDING = { type: 'object', properties: {
  claim: { type: 'string', description: '1-2 factual sentences' },
  sources: { type: 'array', items: { type: 'string' }, description: 'full URLs or file:line' },
  excerpt: { type: 'string', description: 'raw quoted evidence, <=150 words, never a paraphrase' },
  confidence: { type: 'string', enum: ['high', 'medium', 'low'] },
}, required: ['claim', 'sources', 'confidence'] }
const RESEARCH = { type: 'object', properties: { findings: { type: 'array', items: FINDING }, deadEnds: { type: 'array', items: { type: 'string' } }, summary: { type: 'string' } }, required: ['findings', 'summary'] }
const SCOUT = { type: 'object', properties: { landscape: { type: 'string' }, questions: { type: 'array', items: Q } }, required: ['landscape', 'questions'] }
const JUDGE = { type: 'object', properties: {
  saturated: { type: 'boolean' },
  assessment: { type: 'string', description: 'one paragraph: where the research stands against the goal' },
  nextQuestions: { type: 'array', items: Q },
  retrievals: { type: 'array', items: { type: 'object', properties: { order: { type: 'string', description: 'exact retrieval: fetch URL X / grep pattern Y in dir Z / read file F' }, why: { type: 'string' } }, required: ['order'] } },
  contradictions: { type: 'array', items: { type: 'string' } },
  keyClaims: { type: 'array', items: { type: 'string' }, description: 'load-bearing claims, verbatim from findings' },
}, required: ['saturated', 'assessment', 'nextQuestions', 'retrievals', 'keyClaims'] }
const VERDICT = { type: 'object', properties: { verdict: { type: 'string', enum: ['corroborated', 'refuted', 'unverified'] }, evidence: { type: 'string' }, sources: { type: 'array', items: { type: 'string' } } }, required: ['verdict', 'evidence'] }
const SYNTH = { type: 'object', properties: {
  fileWritten: { type: 'boolean' },
  verdict: { type: 'string', description: '1-3 sentences — the headline answer' },
  findings: { type: 'array', items: { type: 'string' }, description: '3-7 bullets, citations inline' },
  plan: { type: 'string' },
  openQuestions: { type: 'array', items: { type: 'string' } },
  confidence: { type: 'string', enum: ['high', 'medium', 'low'] },
}, required: ['fileWritten', 'verdict', 'findings', 'plan', 'confidence'] }

// Silent agent death happens — respawn once before giving up on the stage.
async function run(prompt, opts) {
  let r = await agent(prompt, opts)
  if (r === null) {
    log((opts.label || 'agent') + ' died silently — respawning once')
    r = await agent(prompt, { ...opts, label: (opts.label || 'agent') + '-retry' })
  }
  return r
}
const slug = s => s.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 32)

// ---- Scout — skipped when the briefing already decomposed the goal ----
let landscape = '(scout skipped — sub-questions supplied in the briefing)'
let questions = (arg.subQuestions || []).map(x => (typeof x === 'string' ? { q: x, rationale: '' } : x))
if (!questions.length) {
  const s = await run(
    BRIEF + ' You are the scout. Run ONE entry-point batch (a few searches/greps) to map the landscape — no deep dives.' +
    ' Return: landscape = a tight paragraph of the terrain (what exists, key names, where the substance is); questions = 2-6 sub-questions decomposing the goal, each with a one-line rationale.',
    { label: 'scout', phase: 'Scout', model: M.scout, schema: SCOUT })
  if (!s) throw new Error('scout died twice — aborting before burning research rounds')
  landscape = s.landscape
  questions = s.questions
}
if (!questions.length) questions = [{ q: arg.goal, rationale: 'scout returned no decomposition — research the goal directly' }]

// ---- Research → Judge rounds — the judge's output IS the next round's input ----
const allFindings = []   // { question, round, claim, sources, excerpt, confidence }
const deadEnds = []
const roundLog = []      // { round, questions, retrievals, assessment }
let judge = null

for (let round = 1; round <= MAX_ROUNDS; round++) {
  const wave = questions.slice(0, WAVE_CAP)
  const orders = ((judge && judge.retrievals) || []).slice(0, FETCH_CAP)
  log('round ' + round + '/' + MAX_ROUNDS + ': ' + wave.length + ' researcher(s), ' + orders.length + ' collector(s)')

  const known = allFindings.map(f => f.claim).slice(-60)
  const researchers = wave.map(qd => () => run(
    BRIEF + ' You are a round-' + round + ' researcher on ONE sub-question: "' + qd.q + '"' + (qd.rationale ? ' (rationale: ' + qd.rationale + ')' : '') + '.' +
    (known.length ? ' Already established — do NOT re-research these, hunt new ground: ' + JSON.stringify(known) : '') +
    ' Work iteratively WITHIN your lane: 2-4 probes, each shaped by what the previous one returned.' +
    ' Contract: you collect and structure — you never conclude, rank, or recommend; the judge downstream does the thinking.' +
    ' Return up to 8 findings (claim / sources / raw quoted excerpt <=150 words / confidence). When unsure whether something is relevant, INCLUDE it. Report dead ends honestly — a dead end steers the judge.',
    { label: 'r' + round + ':' + slug(qd.q), phase: 'Research', model: M.researcher, schema: RESEARCH }))
  const collectors = orders.map((o, i) => () => run(
    'You are an RR collection agent. You do NOT analyze, judge, summarize, rank, filter-by-importance, or conclude — retrieve and return raw material only.' +
    ' Run exactly this retrieval: ' + o.order + (o.why ? ' (context: ' + o.why + ')' : '') + ' ' + TOOLS +
    ' Return each item as a finding: claim = a neutral one-line label of what the excerpt is (not an interpretation); sources = full URL or file:line; excerpt = the raw text verbatim (<=150 words); confidence = medium.' +
    ' When unsure whether something is relevant, INCLUDE it.',
    { label: 'r' + round + ':fetch-' + (i + 1), phase: 'Research', model: M.collector, schema: RESEARCH }))

  // Barrier is the point: the judge must see the WHOLE round before steering the next one.
  const results = await parallel([...researchers, ...collectors])
  results.forEach((r, i) => {
    if (!r) return
    const qlabel = i < wave.length ? wave[i].q : 'retrieval: ' + orders[i - wave.length].order
    r.findings.forEach(f => allFindings.push({ question: qlabel, round, ...f }))
    if (r.deadEnds) deadEnds.push(...r.deadEnds)
  })

  judge = await run(
    'You are the RR judge after round ' + round + '/' + MAX_ROUNDS + ' — the only stage in this pipeline that thinks. Goal: ' + arg.goal +
    ' Context: ' + (arg.context || '(none)') + ' Surface: ' + arg.surface + '. Scout landscape: ' + landscape +
    ' Prior rounds (questions + your assessments): ' + JSON.stringify(roundLog) +
    ' This round asked: ' + JSON.stringify(wave.map(x => x.q)) +
    ' ALL findings so far: ' + JSON.stringify(allFindings.map(f => ({ question: f.question, claim: f.claim, confidence: f.confidence, sources: f.sources }))) +
    ' Dead ends: ' + JSON.stringify(deadEnds) +
    ' Steer the next round from what THIS round returned: nextQuestions = up to ' + WAVE_CAP + ' NEW open questions (never re-ask one), empty when nothing is missing; retrievals = up to ' + FETCH_CAP + ' decided retrievals (exact URL to fetch / exact grep pattern + dir / exact file to read) for cheap collectors;' +
    ' contradictions = findings that disagree (a contradiction usually earns a next-round question); keyClaims = the <=' + CLAIM_CAP + ' load-bearing claims (verbatim) the final report will rest on.' +
    ' saturated = true ONLY when the goal is answered AND a pressure-test round has already hunted counter-evidence; the FIRST time you believe the goal is answered, return saturated=false with pressure-test questions (counter-evidence, newer sources, contradicting code paths) instead.',
    { label: 'judge-r' + round, phase: 'Judge', model: M.judge, schema: JUDGE })
  if (!judge) { log('judge died twice — stopping rounds with what we have'); break }

  roundLog.push({ round, questions: wave.map(x => x.q), retrievals: orders.map(o => o.order), assessment: judge.assessment })
  if (judge.contradictions && judge.contradictions.length) log('round ' + round + ': ' + judge.contradictions.length + ' contradiction(s) flagged')
  if (judge.saturated) { log('judge: saturated after round ' + round); break }
  if (!judge.nextQuestions.length && !judge.retrievals.length) { log('judge: nothing left to ask'); break }
  if (round === MAX_ROUNDS) { log('round cap ' + MAX_ROUNDS + ' hit — synthesizing with open gaps'); break }
  if (budget.total && budget.remaining() < 80_000) { log('token budget nearly spent — skipping remaining rounds'); break }
  questions = judge.nextQuestions
}

// ---- Adversarial verify — only the load-bearing claims, one skeptic each ----
const keyClaims = ((judge && judge.keyClaims) || []).slice(0, CLAIM_CAP)
const claims = keyClaims.length ? keyClaims : allFindings.filter(f => f.confidence !== 'low').slice(0, CLAIM_CAP).map(f => f.claim)
const verdicts = (await parallel(claims.map((c, i) => () => run(
  'You are an RR adversarial verifier. ' + TOOLS + ' Goal context: ' + arg.goal +
  ' Claim under attack: "' + c + '". Original sources: ' + JSON.stringify((allFindings.find(f => f.claim === c) || {}).sources || []) +
  ' Try to REFUTE it — hunt counter-evidence, newer/primary sources, contradicting code paths.' +
  ' corroborated = an INDEPENDENT second source confirms it; refuted = credible counter-evidence found (quote it); unverified = nothing found beyond the original source. Default to unverified when in doubt. Return evidence + sources either way.',
  { label: 'verify-' + (i + 1) + ':' + slug(c), phase: 'Verify', model: M.verifier, schema: VERDICT }).then(v => v && { claim: c, ...v })
))).filter(Boolean)

// ---- Synthesize — final judgment, writes the ONE report file ----
const synth = await run(
  'You are the RR synthesizer — final judgment lives here. Goal: ' + arg.goal + ' Context: ' + (arg.context || '(none)') + ' Surface: ' + arg.surface + '. Date: ' + arg.timestamp + '.' +
  ' Complete research record — scout landscape: ' + landscape +
  ' Round log: ' + JSON.stringify(roundLog) +
  ' Findings (with raw excerpts): ' + JSON.stringify(allFindings) +
  ' Adversarial verdicts on key claims: ' + JSON.stringify(verdicts) +
  ' Contradictions: ' + JSON.stringify((judge && judge.contradictions) || []) +
  ' Dead ends: ' + JSON.stringify(deadEnds) +
  ' Rules: REFUTED claims never appear as findings — list them under a verification note with the counter-evidence; single-source unverified claims carry an "(unverified)" flag; rate overall confidence honestly.' +
  ' Write ONE file at ' + arg.reportPath + ' (mkdir -p the parent first) with sections in this order (the file contract in .claude/skills/rr/SKILL.md § Mode 1 Step 2):' +
  ' (1) Prompt — the refined goal; (2) Research rounds — per round, questions asked + judge assessment; (3) Scout landscape; (4) Findings per sub-question — claims with sources, confidence, verification verdicts; (5) Verdict + overall confidence; (6) Plan — concrete, opinionated; (7) Open questions (only if material).' +
  ' Return the executive summary: verdict (1-3 sentences), findings (3-7 bullets, citations inline), plan, openQuestions, confidence, fileWritten.',
  { label: 'synthesize', phase: 'Synthesize', model: M.synth, schema: SYNTH })
if (!synth) {
  return { reportPath: arg.reportPath, fileWritten: false, error: 'synthesizer died twice — write the report from this record (SKILL.md Step 4 backfill)', rounds: roundLog.length, record: { landscape, roundLog, findings: allFindings, verdicts, deadEnds } }
}

return { reportPath: arg.reportPath, rounds: roundLog.length, totalFindings: allFindings.length, verifiedClaims: verdicts.length, ...synth }
