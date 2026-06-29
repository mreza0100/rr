// equivalence.mjs — the byte-equivalence ORACLE (a plain script, NOT a *.test.js).
//
// Proves the refactored modules produce BYTE-IDENTICAL output to the frozen baseline
// (/scratchpad/baseline-workflow.js = the original 954-line engine) for every pure helper
// and store reducer. (Every PROMPT is intentionally tightened/changed now — they diverge from
// the baseline by design and are snapshot-anchored in prompts.test.js, not compared here.)
//
// It transforms the baseline into an importable ES module (strips the harness `return`
// tail, prepends ambient-global stubs, appends the surfaces to export), imports it as
// OLD, imports the NEW modules, and asserts OLD(x) === NEW(x) for the whole battery.
// Prints `EQUIVALENCE: PASS` (exit 0) only if ALL match; else the first diff + exit 1.

import { readFileSync, writeFileSync, mkdirSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { register } from 'node:module'

// teach plain `node` to load `./x.prompt.md?raw` as a string (what Vite does under vitest),
// BEFORE the dynamic import of the NEW prompts.js below.
register('./raw-hooks.mjs', import.meta.url)

const HERE = dirname(fileURLToPath(import.meta.url))
const SRC = join(HERE, '..')
const BASELINE = '/tmp/claude-1000/-home-reza-work-host-ops/74fa7505-7572-4a19-908c-15dbce88c636/scratchpad/baseline-workflow.js'

const FIXED_QUERY = 'best vector database for production RAG at scale'

// ── build + import the OLD (baseline) module ────────────────────────────────
const raw = readFileSync(BASELINE, 'utf8')
const cut = raw.lastIndexOf('const rr = new ResearchReport()')
if (cut < 0) { console.error('oracle: could not find harness tail to strip'); process.exit(1) }
const head = raw.slice(0, cut)
const PREAMBLE =
  `const agent=async()=>({}); const parallel=async(t)=>Promise.all(t.map(f=>f())); const pipeline=async()=>[]; ` +
  `const phase=()=>{}; const log=()=>{}; const args={query:${JSON.stringify(FIXED_QUERY)},mode:'goal'}; ` +
  `const budget={total:null,spent:()=>0,remaining:()=>Infinity};\n`
const EXPORTS = `\nexport { ResearchReport, CONFIG, Configs, plain, norm, lab, padIdx, lastScore, openLine, resultSoFarMd, waveMd }\n`
mkdirSync(join(HERE, '.gen'), { recursive: true })
const genPath = join(HERE, '.gen', 'baseline.mjs')
writeFileSync(genPath, PREAMBLE + head + EXPORTS)
const OLD = await import('./.gen/baseline.mjs')

// ── import the NEW modules (set the ambient query first; CONFIG reads it) ────
globalThis.args = { query: FIXED_QUERY, mode: 'goal' }
const NEW_utils = await import('../src/utils/index.js')
const NEW_store = await import('../src/store.js')

// ── diff machinery ──────────────────────────────────────────────────────────
let FAILED = 0
function firstDiff(a, b) {
  const n = Math.min(a.length, b.length)
  for (let i = 0; i < n; i++) if (a[i] !== b[i]) return i
  return a.length === b.length ? -1 : n
}
function eq(label, oldStr, newStr) {
  if (typeof oldStr !== 'string' || typeof newStr !== 'string') {
    console.error(`✗ ${label}: non-string output (old=${typeof oldStr}, new=${typeof newStr})`)
    FAILED++; return
  }
  if (oldStr === newStr) return
  const i = firstDiff(oldStr, newStr)
  const ctx = s => JSON.stringify(s.slice(Math.max(0, i - 40), i + 40))
  console.error(`✗ ${label}: first diff at char ${i}\n   OLD …${ctx(oldStr)}…\n   NEW …${ctx(newStr)}…`)
  FAILED++
}
function deepEq(label, a, b) {
  const A = JSON.stringify(a), B = JSON.stringify(b)
  if (A === B) return
  const i = firstDiff(A, B)
  console.error(`✗ ${label}: store state diverged at char ${i}\n   OLD …${A.slice(Math.max(0, i - 60), i + 60)}…\n   NEW …${B.slice(Math.max(0, i - 60), i + 60)}…`)
  FAILED++
}

// ── shared fixtures for the helper + store batteries ─────────────────────────
const resultSoFar = {
  answer: 'pgvector for most, Milvus at huge scale', confidence: 'medium',
  evidence: [{ fact: 'recall', value: '0.98', source: 'arxiv', status: 'settled' }, { fact: 'qps', value: '1200', source: 'bench', status: 'tentative' }],
  resolved: ['index types'], openGaps: ['multi-tenant isolation'], tensions: ['HNSW vs IVF tradeoff'], working: 'cost = nodes * price', // derivation
}
const findings = [{ rabbitHole: 'hnsw tuning', trail: 'goal  →  hnsw tuning', summary: 'efConstruction drives recall' }]

// NOTE: the PROMPT-equivalence battery is retired. Every prompt builder is now intentionally diverged
// from the frozen baseline — the refine-merge, the brainer-compute field, the PDF NET instruction, and
// the /quality:prompt tightening each changed wording BY DESIGN. The prompts are regression-anchored by
// the snapshots in prompts.test.js. This oracle now proves the PURE LAYER below — the helpers + store
// reducers, which never changed — stays byte-identical to the original engine.

// ── helper battery ──────────────────────────────────────────────────────────
const plainCases = [
  ['string', 'hello world'],
  ['number', 42],
  ['boolean', true],
  ['array', ['a', 'b', 'c']],
  ['nested-obj', { a: 1, b: { c: 2, d: ['x', 'y'] }, e: [] }],
  ['empty-skip', { keep1: '', keep2: [], keep3: {}, real: 'v' }],
  ['array-of-obj', [{ k: 'one', v: 1 }, { k: 'two', v: 2 }]],
  ['null', null],
]
for (const [n, v] of plainCases) eq('plain ' + n, OLD.plain(v), NEW_utils.plain(v))
eq('plain keep', OLD.plain({ a: '', b: [], c: 'v' }, { keep: ['a', 'b'] }), NEW_utils.plain({ a: '', b: [], c: 'v' }, { keep: ['a', 'b'] }))

const normCases = ['Hello, World!', '  Multiple   Spaces  ', 'CamelCase_99', '']
for (const s of normCases) eq('norm ' + JSON.stringify(s), OLD.norm(s), NEW_utils.norm(s))
for (const s of normCases) eq('lab ' + JSON.stringify(s), OLD.lab(s), NEW_utils.lab(s))
for (const n of [0, 3, 12, 100]) eq('padIdx ' + n, OLD.padIdx(n), NEW_utils.padIdx(n))

const rhScored = { id: 7, keyword: 'hnsw tuning', why: 'knobs', scoreHistory: [{ wave: 0, score: 60 }, { wave: 1, score: 80 }] }
const rhNew = { id: 8, keyword: 'sharding', why: 'scale', scoreHistory: [] }
eq('openLine scored', OLD.openLine(rhScored), NEW_utils.openLine(rhScored))
eq('openLine new', OLD.openLine(rhNew), NEW_utils.openLine(rhNew))
eq('lastScore scored', String(OLD.lastScore(rhScored)), String(NEW_utils.lastScore(rhScored)))
eq('lastScore new', String(OLD.lastScore(rhNew)), String(NEW_utils.lastScore(rhNew)))

eq('resultSoFarMd full', OLD.resultSoFarMd(resultSoFar), NEW_utils.resultSoFarMd(resultSoFar))
eq('resultSoFarMd null', OLD.resultSoFarMd(null), NEW_utils.resultSoFarMd(null))
eq('resultSoFarMd no-working', OLD.resultSoFarMd({ answer: 'a', confidence: 'low', evidence: [], resolved: [], openGaps: [], tensions: [], working: '' }), NEW_utils.resultSoFarMd({ answer: 'a', confidence: 'low', evidence: [], resolved: [], openGaps: [], tensions: [], working: '' }))

const coordForWave = { stop: { done: false, reason: 'more to verify' }, resultSoFar }
const picks = [
  { id: 1, keyword: 'hnsw tuning', why: 'knobs', score: 80, path: [], sources: ['arXiv'] },
  { id: 2, keyword: 'sharding', why: 'scale', score: null, path: ['hnsw tuning'] },
]
const storeSnap = [rhScored, rhNew]
eq('waveMd w0-empty-finds', OLD.waveMd(0, { stop: { done: false, reason: 'seed' }, resultSoFar: null }, [], [], []), NEW_utils.waveMd(0, { stop: { done: false, reason: 'seed' }, resultSoFar: null }, [], [], []))
eq('waveMd wN-finds', OLD.waveMd(2, coordForWave, picks, findings, storeSnap), NEW_utils.waveMd(2, coordForWave, picks, findings, storeSnap))

// ── store-reducer battery — identical delta sequence on OLD instance vs NEW state ──
function newState() { return { rabbitHoles: [], nextId: 1, pursuedKeys: new Set(), pursuedList: [], pursuedArchive: [] } }
const oldInst = new OLD.ResearchReport()
const st = newState()
// 1) seed scout rabbit-holes (unscored)
const seeds = [{ keyword: 'hnsw tuning', why: 'knobs', path: [], wave: 0 }, { keyword: 'sharding', why: 'scale', path: [], wave: 0 }, { keyword: 'hnsw tuning', why: 'dup', path: [], wave: 0 }]
for (const s of seeds) { oldInst.addRabbitHole(s); NEW_store.addRabbitHole(st, s) }
deepEq('store after-seed rabbitHoles', oldInst.rabbitHoles, st.rabbitHoles)
// 2) applyDeltas: rename #1, add new, rescore #1 + #2, drop nothing
const coordA = {
  rename: [{ id: 1, keyword: 'hnsw index tuning', why: 'recall/latency knobs' }],
  add: [{ keyword: 'quantization', why: 'memory', score: 55 }],
  rescore: [{ id: 1, score: 80 }, { id: 2, score: 40 }],
  drop: [],
  lookupNext: [],
}
oldInst.applyDeltas(coordA, 1); NEW_store.applyDeltas(st, coordA, 1)
deepEq('store after-applyDeltas rabbitHoles', oldInst.rabbitHoles, st.rabbitHoles)
// 3) resolveLookupNext: pursue #1 (id) + originate one + skip already-listed
const coordB = { lookupNext: [{ id: 1, sources: ['arXiv'], sourceCount: 3 }, { keyword: 'filtered search', why: 'predicate pushdown', score: 70 }, { id: 999 }] }
const picksOld = oldInst.resolveLookupNext(coordB, 2)
const picksNew = NEW_store.resolveLookupNext(st, coordB, 2, 5)
deepEq('resolveLookupNext picks', picksOld, picksNew)
deepEq('store after-resolve rabbitHoles', oldInst.rabbitHoles, st.rabbitHoles)
// 4) pursue
oldInst.pursue(picksOld); NEW_store.pursue(st, picksNew)
deepEq('store after-pursue rabbitHoles', oldInst.rabbitHoles, st.rabbitHoles)
deepEq('store after-pursue pursuedArchive', oldInst.pursuedArchive, st.pursuedArchive)
deepEq('store after-pursue pursuedList', oldInst.pursuedList, st.pursuedList)
// 5) drop path + re-add a previously-pursued keyword (must be refused → null)
const refusedOld = oldInst.addRabbitHole({ keyword: 'hnsw index tuning', why: 'x', path: [], wave: 3 })
const refusedNew = NEW_store.addRabbitHole(st, { keyword: 'hnsw index tuning', why: 'x', path: [], wave: 3 })
eq('addRabbitHole pursued-refused', String(refusedOld), String(refusedNew))

// ── verdict ───────────────────────────────────────────────────────────────
if (FAILED) { console.error(`\nEQUIVALENCE: FAIL — ${FAILED} mismatch(es)`); process.exit(1) }
console.log('EQUIVALENCE: PASS')
