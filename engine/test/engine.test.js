import { describe, it, expect, vi } from 'vitest'

// ── shared canned StructuredOutputs (the engine reads specific fields) ────────
const RSF = {
  answer: 'pgvector for most, Milvus at huge scale', confidence: 'medium', working: 'cost = nodes * price',
  evidence: [{ fact: 'recall', value: '0.98', source: 'arxiv', status: 'settled' }],
  resolved: ['index types'], openGaps: ['multi-tenant isolation'], tensions: [],
}
const SCOUT_OUT = { landscape: 'the landscape', pages: [{ url: 'https://a.com', summary: 'page a', rabbitHoles: [{ keyword: 'hnsw tuning', why: 'knobs' }, { keyword: 'sharding', why: 'scale' }] }], deadEnds: [] }
const PROSPECT_OUT = { highValueSources: [{ source: 'arXiv (site:arxiv.org)', goodFor: 'ANN' }, { source: 'SemiAnalysis', goodFor: 'cost' }], reasoning: 'searched' }
const LANE_OUT = { summary: 'found knobs', rabbitHoles: [{ keyword: 'ef tuning', why: 'recall' }], deadEnds: [] }

// load the engine fresh with the given ambient args + agent (config/CONFIG are built at import).
async function loadEngine(args, agent, { parallel, pipeline } = {}) {
  globalThis.args = args
  globalThis.agent = async (p, o) => agent(p, o)
  globalThis.phase = () => {}
  globalThis.log = () => {}
  globalThis.parallel = parallel || (async (thunks) => Promise.all(thunks.map(t => t())))
  globalThis.pipeline = pipeline || (async (items, s1, s2) => {
    const out = []
    for (let i = 0; i < items.length; i++) { const a = await s1(items[i], i); out.push(await s2(a, items[i], i)) }
    return out
  })
  vi.resetModules()
  const mod = await import('../src/engine.js')
  return mod.ResearchReport
}
const keys = r => Object.keys(r.files)

// ── (a) GOAL mode — compute ON + a sentinel reopen→uphold path ──────────────
function goalAgent(prompt, opts) {
  const L = opts.label
  if (L === 'scout') return SCOUT_OUT
  if (L === 'prospector') return PROSPECT_OUT
  if (L === 'brainer-w0') return { resultSoFar: RSF, rescore: [{ id: 1, score: 80 }, { id: 2, score: 50 }], add: [], lookupNext: [{ id: 1, sources: ['arXiv (site:arxiv.org)'], sourceCount: 2 }], rename: [], drop: [], stop: { done: false, reason: 'scoring seeds' } }
  if (L === 'brainer-w1') return { resultSoFar: RSF, rescore: [], add: [], lookupNext: [], rename: [], drop: [], stop: { done: true, reason: 'goal answered' } }
  if (L === 'brainer-w2') return { resultSoFar: RSF, rescore: [], add: [], lookupNext: [], rename: [], drop: [], stop: { done: true, reason: 'gap closed' } }
  if (L === 'sentinel-w2') return { solid: false, reasoning: 'missed multi-tenant isolation', rabbitHoles: [{ keyword: 'multi-tenant isolation', why: 'load-bearing gap' }] }
  if (L === 'sentinel-w3') return { solid: true, reasoning: 'solid now', rabbitHoles: [] }
  if (L.startsWith('lane-')) return LANE_OUT
  if (L === 'initiator') return { refinement: { facts: [{ fact: 'recall is 0.98', why: 'headline' }] }, computement: { run: true, stages: ['derive blended cost/query'] }, aggregator: { focus: 'lead with cost' } }
  if (L.startsWith('refine-')) return { report: 'refined: 0.96 ± 0.02 (verified)' }
  if (L.startsWith('compute-')) return { value: '$0.0003/q ± 10%', result: 'the derivation', script: 'print(0.0003)', scriptLang: 'python', assumptions: ['1200 qps'] }
  if (L === 'aggregator') return { report: '# Report\n\nbody', verdict: 'pgvector wins', confidence: 'high', plan: ['use pgvector'], openQuestions: ['multi-tenant'] }
  if (L === 'debug-analyst') return { diagnosis: '# Debug\n\nall good' }
  throw new Error('goalAgent: unexpected label ' + L)
}

describe('ResearchReport.run — goal mode (compute on, sentinel reopen→uphold)', () => {
  it('completes the full pipeline and writes the expected files', async () => {
    const RR = await loadEngine({ query: 'best vector database for production RAG at scale', mode: 'goal' }, goalAgent)
    const result = await new RR().run()

    expect(result.stopReason).toBe('brainer-done')
    expect(result.done).toBe(true)
    expect(result.metrics.sentinelReopensForced).toBe(1)
    expect(result.metrics.mode).toBe('goal')
    expect(result.metrics.reportWritten).toBe(true)
    expect(result.verdict).toBe('pgvector wins')
    expect(result.confidence).toBe('high')

    expect(result.files['result.md']).toBe('# Report\n\nbody')
    expect(keys(result)).toContain('01-scout.md')
    expect(keys(result)).toContain('02-prospector.md')
    expect(keys(result)).toContain('03-wave-0.md')
    expect(keys(result).some(k => k.endsWith('-initiator.md'))).toBe(true)
    expect(keys(result).some(k => k.endsWith('-refinement.md'))).toBe(true)
    expect(keys(result).some(k => k.endsWith('-sentinel.md'))).toBe(true)
    // compute ran → a captured script + its out.md
    expect(result.files['_compute-stage-1.py']).toBe('print(0.0003)')
    expect(keys(result)).toContain('_compute-stage-1.out.md')
    expect(keys(result)).toContain('_frontier.json')
    expect(keys(result)).toContain('_tree.md')
    // the sentinel-injected gap became a pursued lane
    expect(result.pursued).toContain('multi-tenant isolation')
  })
})

// ── (b) COLLECT mode — the dry-plateau stop ─────────────────────────────────
function collectAgent(prompt, opts) {
  const L = opts.label
  if (L === 'scout') return SCOUT_OUT
  if (L === 'prospector') return PROSPECT_OUT
  if (L.startsWith('brainer-w')) {
    const w = Number(L.slice('brainer-w'.length))
    const score = w === 0 ? 100 : 50          // peak 100 then plateau at 50 (≤ 0.7×peak) for 2 waves → dry
    return { resultSoFar: RSF, rescore: [], add: [], lookupNext: [{ keyword: 'collect lead ' + w, why: 'breadth', score }], rename: [], drop: [], stop: { done: false, reason: 'still collecting' } }
  }
  if (L.startsWith('lane-')) return LANE_OUT
  if (L === 'initiator') return { refinement: { facts: [] }, computement: { run: false, stages: [] }, aggregator: { focus: '' } }
  if (L === 'aggregator') return { report: '# Inventory\n\nbody', verdict: 'a broad landscape', confidence: 'medium', plan: [], openQuestions: [] }
  throw new Error('collectAgent: unexpected label ' + L)
}

describe('ResearchReport.run — collect mode (dry plateau)', () => {
  it('stops on the collect dry-plateau and writes a report with no compute', async () => {
    const RR = await loadEngine({ query: 'survey the vector-db landscape', mode: 'collect' }, collectAgent)
    const result = await new RR().run()
    expect(result.stopReason).toBe('collect-dry-plateau')
    expect(result.metrics.mode).toBe('collect')
    expect(result.metrics.sentinelReopensForced).toBe(0)
    expect(result.files['result.md']).toBe('# Inventory\n\nbody')
    // no compute stage files; refinement file records "no facts to harden"
    expect(keys(result).some(k => k.startsWith('_compute-stage-'))).toBe(false)
    expect(keys(result).some(k => k.endsWith('-refinement.md'))).toBe(true)
  })
})

// ── (c) GOAL mode + debug:true — exercises runDebug + IO capture ─────────────
describe('ResearchReport.run — debug:true', () => {
  it('writes _debug.md with the analyst narrative + raw I/O', async () => {
    const RR = await loadEngine({ query: 'best vector database for production RAG at scale', mode: 'goal', debug: true, debugPrompt: 'why did wave 2 stall?' }, goalAgent)
    const result = await new RR().run()
    expect(keys(result)).toContain('_debug.md')
    const dbg = result.files['_debug.md']
    expect(dbg).toContain('Analysis (debug-analyst')
    expect(dbg).toContain('Raw agent I/O')
    expect(dbg).toContain('Debug prompt:')
  })
})

// ── (d) degraded — null prospector / lane / refine / aggregator ─────
function degradedAgent(prompt, opts) {
  const L = opts.label
  if (L === 'scout') return SCOUT_OUT
  if (L === 'prospector') return null
  if (L === 'brainer-w0') return { resultSoFar: RSF, rescore: [{ id: 1, score: 80 }], add: [], lookupNext: [{ id: 1 }], rename: [], drop: [], stop: { done: false, reason: 'go' } }
  if (L === 'brainer-w1') return { resultSoFar: RSF, rescore: [], add: [], lookupNext: [], rename: [], drop: [], stop: { done: true, reason: 'done' } }
  if (L === 'sentinel-w2') return { solid: true, reasoning: 'fine', rabbitHoles: [] }
  if (L.startsWith('lane-')) return null
  if (L === 'initiator') return { refinement: { facts: [{ fact: 'F', why: 'W' }] }, computement: { run: false, stages: [] }, aggregator: { focus: '' } }
  if (L.startsWith('refine-')) return null
  if (L === 'aggregator') return null
  throw new Error('degradedAgent: unexpected label ' + L)
}

describe('ResearchReport.run — degraded agents (null guards)', () => {
  it('survives null prospector / lane / refinement / aggregator', async () => {
    const RR = await loadEngine({ query: 'best vector database for production RAG at scale', mode: 'goal' }, degradedAgent)
    const result = await new RR().run()
    expect(result.highValueSources).toEqual([])           // prospector failed → none
    expect(result.metrics.reportWritten).toBe(false)      // aggregator failed
    expect(result.verdict).toBe(null)
    expect(result.confidence).toBe(null)
    expect(result.files['result.md']).toBeUndefined()
    const refineFile = keys(result).find(k => k.endsWith('-refinement.md'))
    expect(result.files[refineFile]).toContain('_(refine failed)_')
  })
})

// ── (e) brainer mid-crawl death — covers the break path + wave-cap classification ──
function brainerDiesMidAgent(prompt, opts) {
  const L = opts.label
  if (L === 'scout') return SCOUT_OUT
  if (L === 'prospector') return PROSPECT_OUT
  if (L === 'brainer-w0') return { resultSoFar: RSF, rescore: [{ id: 1, score: 80 }], add: [], lookupNext: [{ id: 1 }], rename: [], drop: [], stop: { done: false, reason: 'go' } }
  if (L === 'brainer-w1') return null   // dies mid-crawl
  if (L.startsWith('lane-')) return LANE_OUT
  if (L === 'initiator') return { refinement: { facts: [] }, computement: { run: false, stages: [] }, aggregator: { focus: '' } }
  if (L === 'aggregator') return { report: '# R', verdict: 'v', confidence: 'low', plan: [], openQuestions: [] }
  throw new Error('brainerDiesMidAgent: unexpected label ' + L)
}

describe('ResearchReport.run — brainer dies mid-crawl', () => {
  it('stops the crawl and still finalizes (stopReason wave-cap)', async () => {
    const RR = await loadEngine({ query: 'best vector database for production RAG at scale', mode: 'goal' }, brainerDiesMidAgent)
    const result = await new RR().run()
    expect(result.stopReason).toBe('wave-cap')
    expect(result.done).toBe(false)
    expect(result.files['result.md']).toBe('# R')
  })
})

// ── (f) fatal: scout / wave-0 brainer death throw ───────────────────────────
describe('ResearchReport.run — fatal deaths throw', () => {
  it('throws when the scout dies', async () => {
    const RR = await loadEngine({ query: 'q', mode: 'goal' }, (p, o) => (o.label === 'scout' ? null : {}))
    await expect(new RR().run()).rejects.toThrow(/scout died/)
  })
  it('throws when the wave-0 brainer dies', async () => {
    const agent = (p, o) => {
      if (o.label === 'scout') return SCOUT_OUT
      if (o.label === 'prospector') return PROSPECT_OUT
      if (o.label === 'brainer-w0') return null
      return {}
    }
    const RR = await loadEngine({ query: 'q', mode: 'goal' }, agent)
    await expect(new RR().run()).rejects.toThrow(/brainer died at wave 0/)
  })
})

// ── (g) retryAgent — retry-then-success + retries-exhausted→null (debug on) ──
const SCOUT_OUT2 = { landscape: 'the landscape', pages: [
  { url: 'https://a.com', summary: 'page a', rabbitHoles: [{ keyword: 'hnsw tuning', why: 'knobs' }, { keyword: 'sharding', why: 'scale' }] },
  { url: 'https://b.com', summary: 'page b', rabbitHoles: [] },
], deadEnds: ['https://dead.com — timed out'] }

function makeRetryAgent() {
  let prospectorCalls = 0
  return (prompt, opts) => {
    const L = opts.label
    if (L === 'scout') return SCOUT_OUT2
    if (L === 'prospector') { prospectorCalls++; if (prospectorCalls === 1) throw new Error('transient prospector failure'); return PROSPECT_OUT }
    if (L === 'aggregator') throw new Error('aggregator always fails')   // 3 attempts → degrade to null
    return goalAgent(prompt, opts)
  }
}

describe('ResearchReport.run — retryAgent retry + exhaust paths', () => {
  it('retries a transient failure, degrades an always-failing agent to null, captures error I/O', async () => {
    const RR = await loadEngine({ query: 'best vector database for production RAG at scale', mode: 'goal', debug: true }, makeRetryAgent())
    const result = await new RR().run()
    expect(result.highValueSources.length).toBe(2)        // prospector recovered on retry
    expect(result.metrics.reportWritten).toBe(false)      // aggregator exhausted → null
    expect(result.files['01-scout.md']).toContain('https://dead.com')   // deadEnds branch
    expect(result.files['_debug.md']).toContain('aggregator always fails')   // error captured in raw I/O
  })
})

// ── (g2) rich goal run — flips the defensive-default branches in one pass ────
const LONG_Q = 'best vector database for production retrieval-augmented generation at very large enterprise scale and operating cost'
const LONG_KW = 'unknown venue lane that is deliberately far longer than sixty-four characters to exercise tree truncation'
const SCOUT_OUT3 = { landscape: 'the landscape', pages: [
  { url: 'https://a.com', summary: 'page a', rabbitHoles: [{ keyword: 'hnsw tuning', why: 'knobs' }, { keyword: 'sharding', why: 'scale' }] },
  { url: 'https://b.com', summary: 'page b (no rabbitHoles key)' },   // omits rabbitHoles → exercises the `|| []` guard
] }                                                                   // omits deadEnds → exercises the `|| []` guard

function richAgent(prompt, opts) {
  const L = opts.label
  if (L === 'scout') return SCOUT_OUT3
  if (L === 'prospector') return PROSPECT_OUT
  if (L === 'brainer-w0') return { resultSoFar: RSF, rescore: [{ id: 1, score: 80 }, { id: 2, score: 50 }], add: [], lookupNext: [{ id: 1 }, { keyword: LONG_KW, why: 'gap', score: 75, sources: ['Unknown Venue XYZ'] }], rename: [], drop: [], stop: { done: false, reason: 'go' } }
  if (L === 'brainer-w1') return { resultSoFar: RSF, rescore: [], add: [], lookupNext: [], rename: [], drop: [], stop: { done: true, reason: 'answered' } }
  if (L === 'sentinel-w2') return null   // ch null → '(sentinel failed)' + uphold-without-reasoning branches
  if (L === 'lane-w1:hnsw-tuning') return LANE_OUT
  if (L.startsWith('lane-')) return null   // the unknown-venue lane fails → null-researcher branches
  if (L === 'initiator') return { refinement: { facts: [{ fact: 'F', why: 'W' }] }, computement: { run: true, stages: ['s1', 's2', 's3'] }, aggregator: { focus: '' } }
  if (L.startsWith('refine-')) return { report: 'r' }
  if (L === 'compute-0') return { value: 'v1', result: 'r1', script: 'console.log(1)', scriptLang: 'node', assumptions: ['a'] }   // ext js
  if (L === 'compute-1') return null   // out null → compute-failed default
  if (L === 'compute-2') return { value: '', result: '', script: 'puts 1', scriptLang: 'ruby', assumptions: [] }   // empty value/result, ext txt
  if (L === 'aggregator') return { report: '# R\n\nx', verdict: 'v', confidence: 'medium', plan: ['p'], openQuestions: ['q'] }
  if (L === 'debug-analyst') return null   // diag null → failed-narrative branch
  throw new Error('richAgent: unexpected label ' + L)
}

describe('ResearchReport.run — rich goal run (defensive defaults)', () => {
  it('handles missing scout fields, unknown venue, null lane/sentinel/analyst, varied compute', async () => {
    const RR = await loadEngine({ query: LONG_Q, mode: 'goal', debug: true }, richAgent)
    const result = await new RR().run()
    expect(result.stopReason).toBe('brainer-done')
    expect(result.files['_compute-stage-1.js']).toBe('console.log(1)')   // scriptLang node → .js
    expect(result.files['_compute-stage-3.txt']).toBe('puts 1')          // scriptLang ruby → .txt
    expect(result.files['_compute-stage-2.js']).toBeUndefined()          // null stage → no script file
    expect(result.files['_debug.md']).toContain('_(debug analyst failed') // null analyst narrative
    expect(result.files['_tree.md']).toContain('…')                       // long keyword + query truncation
    expect(result.metrics.reportWritten).toBe(true)
  })
})

// ── (g3) rabbithole-dry / rabbithole-empty stop classification ──────────────
function dryAgent(drop) {
  return (prompt, opts) => {
    const L = opts.label
    if (L === 'scout') return SCOUT_OUT
    if (L === 'prospector') return PROSPECT_OUT
    if (L === 'brainer-w0') return { resultSoFar: RSF, rescore: [{ id: 1, score: 30 }, { id: 2, score: 20 }], add: [], lookupNext: [], rename: [], drop: drop ? [1, 2] : [], stop: { done: false, reason: 'no good leads' } }
    if (L === 'sentinel-w1') return { solid: true, reasoning: 'nothing worth chasing', rabbitHoles: [] }
    if (L === 'initiator') return { refinement: { facts: [] }, computement: { run: false, stages: [] }, aggregator: { focus: '' } }
    if (L === 'aggregator') return { report: '# R', verdict: 'v', confidence: 'low', plan: [], openQuestions: [] }
    throw new Error('dryAgent: unexpected label ' + L)
  }
}

describe('ResearchReport.run — dry-store stop classification', () => {
  it('classifies rabbithole-dry when leads remain but none are looked up', async () => {
    const RR = await loadEngine({ query: 'q', mode: 'goal' }, dryAgent(false))
    const result = await new RR().run()
    expect(result.stopReason).toBe('rabbithole-dry')
  })
  it('classifies rabbithole-empty when the store is emptied', async () => {
    const RR = await loadEngine({ query: 'q', mode: 'goal' }, dryAgent(true))
    const result = await new RR().run()
    expect(result.stopReason).toBe('rabbithole-empty')
  })
})

// ── (h) manual knobs — non-auto lane/source branches ────────────────────────
describe('ResearchReport.run — manual lane/source knobs', () => {
  it('runs with fixed knobs (assignSources off, fixed srcCount, fixed laneCount)', async () => {
    const RR = await loadEngine({ query: 'best vector database for production RAG at scale', mode: 'goal', parallelLaneResearchAgentsPerWave: 2, parallelSourcesPerLaneResearchAgent: 3 }, goalAgent)
    const result = await new RR().run()
    expect(result.stopReason).toBe('brainer-done')
    expect(result.files['result.md']).toBe('# Report\n\nbody')
  })
})

// ── (i) brainer self-compute — code-capable (general-purpose) when compute is on, default subagent when off ──
function captureBrainerType(captured) {
  return function (prompt, opts) {
    const L = opts.label
    if (L.startsWith('brainer-')) captured.push(opts.agentType)
    if (L === 'scout') return SCOUT_OUT
    if (L === 'prospector') return PROSPECT_OUT
    if (L === 'brainer-w0') return { resultSoFar: RSF, rescore: [{ id: 1, score: 80 }], add: [], lookupNext: [], rename: [], drop: [], stop: { done: true, reason: 'answered' } }
    if (L === 'sentinel-w1') return { solid: true, reasoning: 'solid', rabbitHoles: [] }
    if (L === 'initiator') return { refinement: { facts: [] }, computement: { run: false, stages: [] }, aggregator: { focus: '' } }
    if (L === 'aggregator') return { report: '# R', verdict: 'v', confidence: 'medium', plan: [], openQuestions: [] }
    throw new Error('captureBrainerType: unexpected label ' + L)
  }
}

describe('ResearchReport.run — brainer self-compute capability', () => {
  it('runs the brainer as a code-capable general-purpose agent when compute is on, with no separate wave-compute stage', async () => {
    const captured = []
    const RR = await loadEngine({ query: 'estimate the nearest undetected black hole distance', mode: 'goal' }, captureBrainerType(captured))
    const result = await new RR().run()
    expect(result.stopReason).toBe('brainer-done')
    expect(captured.length).toBeGreaterThan(0)
    expect(captured.every(t => t === 'general-purpose')).toBe(true)   // compute on → the brainer can write+run code itself
    expect(keys(result).some(k => k.startsWith('_compute-w'))).toBe(false)   // no separate wave-compute artifacts — derived inline into `working`
  })

  it('runs the brainer as the default subagent (no code capability) when compute is off', async () => {
    const captured = []
    const RR = await loadEngine({ query: 'estimate the nearest undetected black hole distance', mode: 'goal', compute: false }, captureBrainerType(captured))
    await new RR().run()
    expect(captured.length).toBeGreaterThan(0)
    expect(captured.every(t => t === undefined)).toBe(true)   // compute off → no code capability at all
  })
})

// ── (j) compute flag OFF — no computation runs even when agents request it ───
describe('ResearchReport.run — compute flag off', () => {
  it('runs no computation when args.compute is false, even though the initiator requests it', async () => {
    // goalAgent's initiator returns computement.run:true — with compute off the engine must ignore it
    const RR = await loadEngine({ query: 'best vector database for production RAG at scale', mode: 'goal', compute: false }, goalAgent)
    const result = await new RR().run()
    expect(result.stopReason).toBe('brainer-done')
    expect(keys(result).some(k => k.startsWith('_compute-'))).toBe(false)   // NO compute files at all
    expect(result.files['result.md']).toBe('# Report\n\nbody')               // still finalizes normally
  })
})
