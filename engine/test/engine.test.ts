import { describe, it, expect, vi } from 'vitest';
import type { AgentOpts, RunResult } from '../src/types/index.js';
type AgentStub = (prompt: string, opts: AgentOpts) => unknown;

// ── shared canned StructuredOutputs (the engine reads specific fields) ────────
const RSF = {
  answer: 'pgvector for most, Milvus at huge scale',
  confidence: 'medium',
  working: 'cost = nodes * price',
  evidence: [{ fact: 'recall', value: '0.98', source: 'arxiv', status: 'settled' }],
  resolved: ['index types'],
  openGaps: ['multi-tenant isolation'],
  tensions: [],
};
const SCOUT_OUT = {
  landscape: 'the landscape',
  pages: [
    {
      url: 'https://a.com',
      summary: 'page a',
      rabbitHoles: [
        { keyword: 'hnsw tuning', why: 'knobs' },
        { keyword: 'sharding', why: 'scale' },
      ],
    },
  ],
  deadEnds: [],
};
const PROSPECT_OUT = {
  highValueSources: [
    { source: 'arXiv (site:arxiv.org)', goodFor: 'ANN' },
    { source: 'SemiAnalysis', goodFor: 'cost' },
  ],
  reasoning: 'searched',
};
const LANE_OUT = {
  summary: 'found knobs',
  rabbitHoles: [{ keyword: 'ef tuning', why: 'recall' }],
  deadEnds: [],
};
// the per-wave validator's neutral verdict — nothing failed, nothing to reopen.
const VALIDATE_OUT = { checks: [], enough: true, missing: [] };

// load the engine fresh with the given ambient args + agent (config/CONFIG are built at import).
async function loadEngine(
  args: unknown,
  agent: AgentStub,
  {
    parallel,
    pipeline,
  }: { parallel?: typeof globalThis.parallel; pipeline?: typeof globalThis.pipeline } = {},
) {
  globalThis.args = args;
  globalThis.agent = async (p: string, o: AgentOpts) => agent(p, o);
  globalThis.phase = () => {};
  globalThis.log = () => {};
  globalThis.parallel =
    parallel ||
    (async <T>(thunks: Array<() => Promise<T>>): Promise<T[]> =>
      Promise.all(thunks.map((t) => t())));
  globalThis.pipeline =
    pipeline ||
    (async (
      items: unknown[],
      s1: (item: unknown, i: number) => Promise<unknown>,
      s2: (a: unknown, item: unknown, i: number) => Promise<unknown>,
    ): Promise<unknown[]> => {
      const out: unknown[] = [];
      for (let i = 0; i < items.length; i++) {
        const a = await s1(items[i], i);
        out.push(await s2(a, items[i], i));
      }
      return out;
    });
  vi.resetModules();
  const mod = await import('../src/engine.js');
  return mod.ResearchReport;
}
const keys = (r: RunResult) => Object.keys(r.files);

// ── (a) GOAL mode — compute ON + a sentinel reopen→uphold path ──────────────
function goalAgent(prompt: string, opts: AgentOpts) {
  const L = opts.label;
  if (L === 'scout') return SCOUT_OUT;
  if (L === 'prospector') return PROSPECT_OUT;
  if (L === 'brainer-w0')
    return {
      resultSoFar: RSF,
      rescore: [
        { id: 1, score: 80 },
        { id: 2, score: 50 },
      ],
      add: [],
      lookupNext: [{ id: 1, sources: ['arXiv (site:arxiv.org)'] }],
      rename: [],
      drop: [],
      stop: { done: false, reason: 'scoring seeds' },
    };
  if (L === 'brainer-w1')
    return {
      resultSoFar: RSF,
      rescore: [],
      add: [],
      lookupNext: [],
      rename: [],
      drop: [],
      stop: { done: true, reason: 'goal answered' },
    };
  if (L === 'brainer-w2')
    return {
      resultSoFar: RSF,
      rescore: [],
      add: [],
      lookupNext: [],
      rename: [],
      drop: [],
      stop: { done: true, reason: 'gap closed' },
    };
  if (L === 'sentinel-w2')
    return {
      solid: false,
      reasoning: 'missed multi-tenant isolation',
      rabbitHoles: [{ keyword: 'multi-tenant isolation', why: 'load-bearing gap' }],
    };
  if (L === 'sentinel-w3') return { solid: true, reasoning: 'solid now', rabbitHoles: [] };
  if (L.startsWith('validator-')) return VALIDATE_OUT;
  if (L.startsWith('lane-')) return LANE_OUT;
  if (L === 'initiator')
    return {
      refinement: { facts: [{ fact: 'recall is 0.98', why: 'headline' }] },
      synthesiser: { focus: 'lead with cost' },
    };
  if (L.startsWith('refine-')) return { report: 'refined: 0.96 ± 0.02 (verified)' };
  // judge pass 0 → needs a derivation (routes to brain-compute); pass 1 → derivation now sound → exit
  if (L === 'judge-0')
    return {
      goalMet: true,
      verificationSound: true,
      needsCompute: true,
      computeSound: false,
      reasoning: 'the answer needs a blended cost/query derivation',
      directive: 'derive blended cost/query with error bars',
      reopenRabbitHoles: [],
    };
  if (L.startsWith('judge-'))
    return {
      goalMet: true,
      verificationSound: true,
      needsCompute: true,
      computeSound: true,
      reasoning: 'derivation is now sound',
      directive: '',
    };
  if (L.startsWith('brain-compute-'))
    return { resultSoFar: { ...RSF, working: 'blended cost = $0.0003/q ± 10%' } };
  if (L === 'synthesiser')
    return {
      report: '# Report\n\nbody',
      verdict: 'pgvector wins',
      confidence: 'high',
      plan: ['use pgvector'],
      openQuestions: ['multi-tenant'],
    };
  if (L === 'debug-analyst') return { diagnosis: '# Debug\n\nall good' };
  throw new Error('goalAgent: unexpected label ' + L);
}

describe('ResearchReport.run — goal mode (compute on, sentinel reopen→uphold)', () => {
  it('completes the full pipeline and writes the expected files', async () => {
    const RR = await loadEngine(
      { query: 'best vector database for production RAG at scale', mode: 'goal' },
      goalAgent,
    );
    const result = await new RR().run();

    expect(result.stopReason).toBe('brainer-done');
    expect(result.done).toBe(true);
    expect(result.metrics.sentinelReopensForced).toBe(1);
    expect(result.metrics.mode).toBe('goal');
    expect(result.metrics.reportWritten).toBe(true);
    expect(result.verdict).toBe('pgvector wins');
    expect(result.confidence).toBe('high');

    expect(result.files['result.md']).toContain('# Report\n\nbody');
    expect(keys(result)).toContain('01-scout.md');
    expect(keys(result)).toContain('02-prospector.md');
    expect(keys(result)).toContain('03-wave-0.md');
    expect(keys(result).some((k) => k.endsWith('-initiator.md'))).toBe(true);
    expect(keys(result).some((k) => k.endsWith('-refinement.md'))).toBe(true);
    expect(keys(result).some((k) => k.endsWith('-sentinel.md'))).toBe(true);
    expect(keys(result).some((k) => k.endsWith('-judge.md'))).toBe(true);
    // the judge routed needsCompute → the brain derived the answer (folded into resultSoFar.working)
    expect(keys(result)).toContain('_finalize-compute.md');
    expect(result.files['_finalize-compute.md']).toContain('blended cost = $0.0003/q ± 10%');
    expect(keys(result)).toContain('_rabbitHoles.json');
    expect(keys(result)).toContain('_tree.md');
    // the COMPLETE launch args are persisted — surfaced at the top of result.md + as the `args` object in _rabbitHoles.json
    expect(result.files['result.md']).toContain('Run arguments');
    expect(JSON.parse(result.files['_rabbitHoles.json']).args).toEqual({
      query: 'best vector database for production RAG at scale',
      mode: 'goal',
    });
    // the sentinel-injected gap became a pursued lane
    expect(result.pursued).toContain('multi-tenant isolation');
  });
});

// ── (b) COLLECT mode — the dry-plateau stop ─────────────────────────────────
function collectAgent(prompt: string, opts: AgentOpts) {
  const L = opts.label;
  if (L === 'scout') return SCOUT_OUT;
  if (L === 'prospector') return PROSPECT_OUT;
  if (L.startsWith('brainer-w')) {
    const w = Number(L.slice('brainer-w'.length));
    const score = w === 0 ? 100 : 50; // peak 100 then plateau at 50 (≤ 0.7×peak) for 2 waves → dry
    return {
      resultSoFar: RSF,
      rescore: [],
      add: [],
      lookupNext: [{ keyword: 'collect lead ' + w, why: 'breadth', score }],
      rename: [],
      drop: [],
      stop: { done: false, reason: 'still collecting' },
    };
  }
  if (L.startsWith('validator-')) return VALIDATE_OUT;
  if (L.startsWith('lane-')) return LANE_OUT;
  if (L === 'initiator')
    return {
      refinement: { facts: [] },
      synthesiser: { focus: '' },
    };
  if (L.startsWith('judge-'))
    return {
      goalMet: true,
      verificationSound: true,
      needsCompute: false,
      computeSound: true,
      reasoning: 'inventory complete',
      directive: '',
    };
  if (L === 'synthesiser')
    return {
      report: '# Inventory\n\nbody',
      verdict: 'a broad landscape',
      confidence: 'medium',
      plan: [],
      openQuestions: [],
    };
  throw new Error('collectAgent: unexpected label ' + L);
}

describe('ResearchReport.run — collect mode (dry plateau)', () => {
  it('stops on the collect dry-plateau and writes a report with no compute', async () => {
    const RR = await loadEngine(
      { query: 'survey the vector-db landscape', mode: 'collect' },
      collectAgent,
    );
    const result = await new RR().run();
    expect(result.stopReason).toBe('collect-dry-plateau');
    expect(result.metrics.mode).toBe('collect');
    expect(result.metrics.sentinelReopensForced).toBe(0);
    expect(result.files['result.md']).toContain('# Inventory\n\nbody');
    // the judge upheld first pass → no derivation; refinement file records "no facts to harden"
    expect(keys(result)).not.toContain('_finalize-compute.md');
    expect(keys(result).some((k) => k.endsWith('-judge.md'))).toBe(true);
    expect(keys(result).some((k) => k.endsWith('-refinement.md'))).toBe(true);
  });
});

// ── (c) GOAL mode + debug:true — exercises runDebug + IO capture ─────────────
describe('ResearchReport.run — debug:true', () => {
  it('writes _debug.md with the analyst narrative + raw I/O', async () => {
    const RR = await loadEngine(
      {
        query: 'best vector database for production RAG at scale',
        mode: 'goal',
        debug: true,
        debugPrompt: 'why did wave 2 stall?',
      },
      goalAgent,
    );
    const result = await new RR().run();
    expect(keys(result)).toContain('_debug.md');
    const dbg = result.files['_debug.md'];
    expect(dbg).toContain('Analysis (debug-analyst');
    expect(dbg).toContain('Raw agent I/O');
    expect(dbg).toContain('Debug prompt:');
  });
});

// ── (d) degraded — null prospector / lane / refine / synthesiser ─────
function degradedAgent(prompt: string, opts: AgentOpts) {
  const L = opts.label;
  if (L === 'scout') return SCOUT_OUT;
  if (L === 'prospector') return null;
  if (L === 'brainer-w0')
    return {
      resultSoFar: RSF,
      rescore: [{ id: 1, score: 80 }],
      add: [],
      lookupNext: [{ id: 1 }],
      rename: [],
      drop: [],
      stop: { done: false, reason: 'go' },
    };
  if (L === 'brainer-w1')
    return {
      resultSoFar: RSF,
      rescore: [],
      add: [],
      lookupNext: [],
      rename: [],
      drop: [],
      stop: { done: true, reason: 'done' },
    };
  if (L === 'sentinel-w2') return { solid: true, reasoning: 'fine', rabbitHoles: [] };
  // the validator flags the dead lane → the engine reopens it (also reached via the null-lane path)
  if (L.startsWith('validator-'))
    return {
      checks: [{ id: 1, fulfilled: false, reason: 'died' }],
      enough: false,
      missing: ['retry'],
    };
  if (L.startsWith('lane-')) return null;
  if (L === 'initiator')
    return {
      refinement: { facts: [{ fact: 'F', why: 'W' }] },
      synthesiser: { focus: '' },
    };
  if (L.startsWith('refine-')) return null;
  if (L.startsWith('judge-'))
    return {
      goalMet: true,
      verificationSound: true,
      needsCompute: false,
      computeSound: true,
      reasoning: 'upheld',
      directive: '',
    };
  if (L === 'synthesiser') return null;
  throw new Error('degradedAgent: unexpected label ' + L);
}

describe('ResearchReport.run — degraded agents (null guards)', () => {
  it('survives null prospector / lane / refinement / synthesiser', async () => {
    const RR = await loadEngine(
      { query: 'best vector database for production RAG at scale', mode: 'goal' },
      degradedAgent,
    );
    const result = await new RR().run();
    expect(result.highValueSources).toEqual([]); // prospector failed → none
    expect(result.metrics.reportWritten).toBe(false); // synthesiser failed
    expect(result.verdict).toBe(null);
    expect(result.confidence).toBe(null);
    expect(result.files['result.md']).toBeUndefined();
    const refineFile = keys(result).find((k) => k.endsWith('-refinement.md'));
    expect(result.files[refineFile!]).toContain('_(refine failed)_');
  });
});

// ── (e) brainer mid-crawl death — covers the break path + wave-cap classification ──
function brainerDiesMidAgent(prompt: string, opts: AgentOpts) {
  const L = opts.label;
  if (L === 'scout') return SCOUT_OUT;
  if (L === 'prospector') return PROSPECT_OUT;
  if (L === 'brainer-w0')
    return {
      resultSoFar: RSF,
      rescore: [{ id: 1, score: 80 }],
      add: [],
      lookupNext: [{ id: 1 }],
      rename: [],
      drop: [],
      stop: { done: false, reason: 'go' },
    };
  if (L === 'brainer-w1') return null; // dies mid-crawl
  if (L.startsWith('validator-')) return VALIDATE_OUT;
  if (L.startsWith('lane-')) return LANE_OUT;
  if (L === 'initiator')
    return {
      refinement: { facts: [] },
      synthesiser: { focus: '' },
    };
  if (L.startsWith('judge-'))
    return {
      goalMet: true,
      verificationSound: true,
      needsCompute: false,
      computeSound: true,
      reasoning: 'upheld',
      directive: '',
    };
  if (L === 'synthesiser')
    return { report: '# R', verdict: 'v', confidence: 'low', plan: [], openQuestions: [] };
  throw new Error('brainerDiesMidAgent: unexpected label ' + L);
}

describe('ResearchReport.run — brainer dies mid-crawl', () => {
  it('stops the crawl and still finalizes (stopReason wave-cap)', async () => {
    const RR = await loadEngine(
      { query: 'best vector database for production RAG at scale', mode: 'goal' },
      brainerDiesMidAgent,
    );
    const result = await new RR().run();
    expect(result.stopReason).toBe('wave-cap');
    expect(result.done).toBe(false);
    expect(result.files['result.md']).toContain('# R');
  });
});

// ── (f) fatal: scout / wave-0 brainer death throw ───────────────────────────
describe('ResearchReport.run — fatal deaths throw', () => {
  it('throws when the scout dies', async () => {
    const RR = await loadEngine({ query: 'q', mode: 'goal' }, (p: string, o: AgentOpts) =>
      o.label === 'scout' ? null : {},
    );
    await expect(new RR().run()).rejects.toThrow(/scout died/);
  });
  it('throws when the wave-0 brainer dies', async () => {
    const agent = (p: string, o: AgentOpts) => {
      if (o.label === 'scout') return SCOUT_OUT;
      if (o.label === 'prospector') return PROSPECT_OUT;
      if (o.label === 'brainer-w0') return null;
      return {};
    };
    const RR = await loadEngine({ query: 'q', mode: 'goal' }, agent);
    await expect(new RR().run()).rejects.toThrow(/brainer died at wave 0/);
  });
});

// ── (g) retryAgent — retry-then-success + retries-exhausted→null (debug on) ──
const SCOUT_OUT2 = {
  landscape: 'the landscape',
  pages: [
    {
      url: 'https://a.com',
      summary: 'page a',
      rabbitHoles: [
        { keyword: 'hnsw tuning', why: 'knobs' },
        { keyword: 'sharding', why: 'scale' },
      ],
    },
    { url: 'https://b.com', summary: 'page b', rabbitHoles: [] },
  ],
  deadEnds: ['https://dead.com — timed out'],
};

function makeRetryAgent() {
  let prospectorCalls = 0;
  return (prompt: string, opts: AgentOpts) => {
    const L = opts.label;
    if (L === 'scout') return SCOUT_OUT2;
    if (L === 'prospector') {
      prospectorCalls++;
      if (prospectorCalls === 1) throw new Error('transient prospector failure');
      return PROSPECT_OUT;
    }
    if (L === 'synthesiser') throw new Error('synthesiser always fails'); // 3 attempts → degrade to null
    return goalAgent(prompt, opts);
  };
}

describe('ResearchReport.run — retryAgent retry + exhaust paths', () => {
  it('retries a transient failure, degrades an always-failing agent to null, captures error I/O', async () => {
    const RR = await loadEngine(
      { query: 'best vector database for production RAG at scale', mode: 'goal', debug: true },
      makeRetryAgent(),
    );
    const result = await new RR().run();
    expect(result.highValueSources.length).toBe(2); // prospector recovered on retry
    expect(result.metrics.reportWritten).toBe(false); // synthesiser exhausted → null
    expect(result.files['01-scout.md']).toContain('https://dead.com'); // deadEnds branch
    expect(result.files['_debug.md']).toContain('synthesiser always fails'); // error captured in raw I/O
  });
});

// ── (g2) rich goal run — flips the defensive-default branches in one pass ────
const LONG_Q =
  'best vector database for production retrieval-augmented generation at very large enterprise scale and operating cost';
const LONG_KW =
  'unknown venue lane that is deliberately far longer than sixty-four characters to exercise tree truncation';
const SCOUT_OUT3 = {
  landscape: 'the landscape',
  pages: [
    {
      url: 'https://a.com',
      summary: 'page a',
      rabbitHoles: [
        { keyword: 'hnsw tuning', why: 'knobs' },
        { keyword: 'sharding', why: 'scale' },
      ],
    },
    { url: 'https://b.com', summary: 'page b (no rabbitHoles key)' }, // omits rabbitHoles → exercises the `|| []` guard
  ],
}; // omits deadEnds → exercises the `|| []` guard

function richAgent(prompt: string, opts: AgentOpts) {
  const L = opts.label;
  if (L === 'scout') return SCOUT_OUT3;
  if (L === 'prospector') return PROSPECT_OUT;
  if (L === 'brainer-w0')
    return {
      resultSoFar: RSF,
      rescore: [
        { id: 1, score: 80 },
        { id: 2, score: 50 },
      ],
      add: [],
      lookupNext: [
        { id: 1 },
        { keyword: LONG_KW, why: 'gap', score: 75, sources: ['Unknown Venue XYZ'] },
      ],
      rename: [],
      drop: [],
      stop: { done: false, reason: 'go' },
    };
  if (L === 'brainer-w1')
    return {
      resultSoFar: RSF,
      rescore: [],
      add: [],
      lookupNext: [],
      rename: [],
      drop: [],
      stop: { done: true, reason: 'answered' },
    };
  if (L === 'sentinel-w2') return null; // ch null → '(sentinel failed)' + uphold-without-reasoning branches
  if (L.startsWith('validator-')) return VALIDATE_OUT; // null lane still reopens via the null-lane path
  if (L === 'lane-w1:hnsw-tuning') return LANE_OUT;
  if (L.startsWith('lane-')) return null; // the unknown-venue lane fails → null-researcher branches
  if (L === 'initiator')
    return {
      refinement: { facts: [{ fact: 'F', why: 'W' }] },
      synthesiser: { focus: '' },
    };
  if (L.startsWith('refine-')) return { report: 'r' };
  // judge pass 0 → routes to brain finalize-compute; pass 1 → derivation sound → exit
  if (L === 'judge-0')
    return {
      goalMet: true,
      verificationSound: true,
      needsCompute: true,
      computeSound: false,
      reasoning: 'needs a derivation',
      directive: 'derive it',
      reopenRabbitHoles: [],
    };
  if (L.startsWith('judge-'))
    return {
      goalMet: true,
      verificationSound: true,
      needsCompute: true,
      computeSound: true,
      reasoning: 'derivation sound',
      directive: '',
    };
  if (L.startsWith('brain-compute-')) return { resultSoFar: { ...RSF, working: 'derived 42 ± 3' } };
  if (L === 'synthesiser')
    return {
      report: '# R\n\nx',
      verdict: 'v',
      confidence: 'medium',
      plan: ['p'],
      openQuestions: ['q'],
    };
  if (L === 'debug-analyst') return null; // diag null → failed-narrative branch
  throw new Error('richAgent: unexpected label ' + L);
}

describe('ResearchReport.run — rich goal run (defensive defaults)', () => {
  it('handles missing scout fields, unknown venue, null lane/sentinel/analyst, brain finalize-compute', async () => {
    const RR = await loadEngine({ query: LONG_Q, mode: 'goal', debug: true }, richAgent);
    const result = await new RR().run();
    expect(result.stopReason).toBe('brainer-done');
    // the judge routed needsCompute → the brain derived the answer (folded into resultSoFar.working)
    expect(keys(result)).toContain('_finalize-compute.md');
    expect(result.files['_finalize-compute.md']).toContain('derived 42 ± 3');
    expect(result.files['_debug.md']).toContain('_(debug analyst failed'); // null analyst narrative
    expect(result.files['_tree.md']).toContain('…'); // long keyword + query truncation
    expect(result.metrics.reportWritten).toBe(true);
  });
});

// ── (g3) rabbithole-dry / rabbithole-empty stop classification ──────────────
function dryAgent(drop: boolean) {
  return (prompt: string, opts: AgentOpts) => {
    const L = opts.label;
    if (L === 'scout') return SCOUT_OUT;
    if (L === 'prospector') return PROSPECT_OUT;
    if (L === 'brainer-w0')
      return {
        resultSoFar: RSF,
        rescore: [
          { id: 1, score: 30 },
          { id: 2, score: 20 },
        ],
        add: [],
        lookupNext: [],
        rename: [],
        drop: drop ? [1, 2] : [],
        stop: { done: false, reason: 'no good leads' },
      };
    if (L === 'sentinel-w1')
      return { solid: true, reasoning: 'nothing worth chasing', rabbitHoles: [] };
    if (L === 'initiator')
      return {
        refinement: { facts: [] },
        synthesiser: { focus: '' },
      };
    if (L.startsWith('judge-'))
      return {
        goalMet: true,
        verificationSound: true,
        needsCompute: false,
        computeSound: true,
        reasoning: 'upheld',
        directive: '',
      };
    if (L === 'synthesiser')
      return { report: '# R', verdict: 'v', confidence: 'low', plan: [], openQuestions: [] };
    throw new Error('dryAgent: unexpected label ' + L);
  };
}

describe('ResearchReport.run — dry-store stop classification', () => {
  it('classifies rabbithole-dry when leads remain but none are looked up', async () => {
    const RR = await loadEngine({ query: 'q', mode: 'goal' }, dryAgent(false));
    const result = await new RR().run();
    expect(result.stopReason).toBe('rabbithole-dry');
  });
  it('classifies rabbithole-empty when the store is emptied', async () => {
    const RR = await loadEngine({ query: 'q', mode: 'goal' }, dryAgent(true));
    const result = await new RR().run();
    expect(result.stopReason).toBe('rabbithole-empty');
  });
});

// ── (h) manual knobs — non-auto lane/source branches ────────────────────────
describe('ResearchReport.run — manual lane/source knobs', () => {
  it('runs with fixed knobs (assignSources off, fixed srcCount, fixed laneCount)', async () => {
    const RR = await loadEngine(
      {
        query: 'best vector database for production RAG at scale',
        mode: 'goal',
        parallelLaneResearchAgentsPerWave: 2,
        parallelSourcesPerLaneResearchAgent: 3,
      },
      goalAgent,
    );
    const result = await new RR().run();
    expect(result.stopReason).toBe('brainer-done');
    expect(result.files['result.md']).toContain('# Report\n\nbody');
  });
});

// ── (i) brainer self-compute — code-capable (general-purpose) when compute is on, default subagent when off ──
function captureBrainerType(captured: Array<string | undefined>) {
  return function (prompt: string, opts: AgentOpts) {
    const L = opts.label;
    if (L.startsWith('brainer-')) captured.push(opts.agentType);
    if (L === 'scout') return SCOUT_OUT;
    if (L === 'prospector') return PROSPECT_OUT;
    if (L === 'brainer-w0')
      return {
        resultSoFar: RSF,
        rescore: [{ id: 1, score: 80 }],
        add: [],
        lookupNext: [],
        rename: [],
        drop: [],
        stop: { done: true, reason: 'answered' },
      };
    if (L === 'sentinel-w1') return { solid: true, reasoning: 'solid', rabbitHoles: [] };
    if (L === 'initiator')
      return {
        refinement: { facts: [] },
        synthesiser: { focus: '' },
      };
    if (L.startsWith('judge-'))
      return {
        goalMet: true,
        verificationSound: true,
        needsCompute: false,
        computeSound: true,
        reasoning: 'upheld',
        directive: '',
      };
    if (L === 'synthesiser')
      return { report: '# R', verdict: 'v', confidence: 'medium', plan: [], openQuestions: [] };
    throw new Error('captureBrainerType: unexpected label ' + L);
  };
}

describe('ResearchReport.run — brainer self-compute capability', () => {
  it('runs the brainer as a code-capable general-purpose agent when compute is on, with no separate wave-compute stage', async () => {
    const captured: Array<string | undefined> = [];
    const RR = await loadEngine(
      { query: 'estimate the nearest undetected black hole distance', mode: 'goal' },
      captureBrainerType(captured),
    );
    const result = await new RR().run();
    expect(result.stopReason).toBe('brainer-done');
    expect(captured.length).toBeGreaterThan(0);
    expect(captured.every((t) => t === 'general-purpose')).toBe(true); // compute on → the brainer can write+run code itself
    expect(keys(result).some((k) => k.startsWith('_compute-w'))).toBe(false); // no separate wave-compute artifacts — derived inline into `working`
  });

  it('runs the brainer as the default subagent (no code capability) when compute is off', async () => {
    const captured: Array<string | undefined> = [];
    const RR = await loadEngine(
      {
        query: 'estimate the nearest undetected black hole distance',
        mode: 'goal',
        compute: false,
      },
      captureBrainerType(captured),
    );
    await new RR().run();
    expect(captured.length).toBeGreaterThan(0);
    expect(captured.every((t) => t === undefined)).toBe(true); // compute off → no code capability at all
  });
});

// ── (j) compute flag OFF — no computation runs even when agents request it ───
describe('ResearchReport.run — compute flag off', () => {
  it('runs no computation when args.compute is false, even though the judge requests it', async () => {
    // goalAgent's judge returns needsCompute:true — with compute off the engine forces it false (no derivation path)
    const RR = await loadEngine(
      { query: 'best vector database for production RAG at scale', mode: 'goal', compute: false },
      goalAgent,
    );
    const result = await new RR().run();
    expect(result.stopReason).toBe('brainer-done');
    expect(keys(result).some((k) => k.startsWith('_compute-'))).toBe(false); // NO compute files at all
    expect(result.files['result.md']).toContain('# Report\n\nbody'); // still finalizes normally
  });
});

// ── (k) finalize JUDGE loop bounded by MAX_JUDGE_PASSES ──────────────────────
function capAgent(prompt: string, opts: AgentOpts) {
  const L = opts.label;
  if (L === 'initiator')
    return {
      refinement: { facts: [{ fact: 'recall is 0.98', why: 'headline' }] },
      synthesiser: { focus: 'lead with cost' },
    };
  // the judge is NEVER satisfied (derivation never sound) → every pass routes to brain-compute, so the loop runs to the cap
  if (L.startsWith('judge-'))
    return {
      goalMet: true,
      verificationSound: true,
      needsCompute: true,
      computeSound: false,
      reasoning: 'the derivation still is not sound',
      directive: 'derive again with tighter error bars',
      reopenRabbitHoles: [],
    };
  if (L.startsWith('brain-compute-')) return { resultSoFar: { ...RSF, working: 'derived again' } };
  return goalAgent(prompt, opts);
}

describe('ResearchReport.run — finalize judge loop bounded by MAX_JUDGE_PASSES', () => {
  it('runs the judge at most MAX_JUDGE_PASSES+1 times even when it is never satisfied', async () => {
    const RR = await loadEngine(
      { query: 'best vector database for production RAG at scale', mode: 'goal' },
      capAgent,
    );
    const result = await new RR().run();
    const judgeFile = result.files[keys(result).find((k) => k.endsWith('-judge.md'))!];
    // MAX_JUDGE_PASSES = 2 → the judge runs passes 0,1,2 (3 total), then the loop is capped
    expect(judgeFile).toContain('## Pass 2');
    expect(judgeFile).not.toContain('## Pass 3');
    // the brain derived on each remediation pass, captured into _finalize-compute.md
    expect(keys(result)).toContain('_finalize-compute.md');
  });
});

// ── (l) validator gate — re-opens failing lanes, caps re-fails, surfaces a known gap ──
function refailAgent(prompt: string, opts: AgentOpts) {
  const L = opts.label;
  if (L === 'scout') return SCOUT_OUT; // seeds id1 (hnsw tuning) + id2 (sharding)
  if (L === 'prospector') return PROSPECT_OUT;
  if (L === 'brainer-w0')
    return {
      resultSoFar: RSF,
      rescore: [
        { id: 1, score: 80 },
        { id: 2, score: 50 },
      ],
      add: [],
      lookupNext: [{ id: 1 }],
      rename: [],
      drop: [],
      stop: { done: false, reason: 'go' },
    };
  if (L === 'brainer-w1' || L === 'brainer-w2')
    // keep re-pursuing the reopened lane id1
    return {
      resultSoFar: RSF,
      rescore: [],
      add: [],
      lookupNext: [{ id: 1 }],
      rename: [],
      drop: [],
      stop: { done: false, reason: 'retry the dead lane' },
    };
  if (L === 'brainer-w3')
    return {
      resultSoFar: RSF,
      rescore: [],
      add: [],
      lookupNext: [],
      rename: [],
      drop: [],
      stop: { done: true, reason: 'gave up on the dead lane' },
    };
  if (L.startsWith('lane-')) return null; // every lane fails outright
  if (L.startsWith('validator-'))
    return {
      checks: [{ id: 1, fulfilled: false, reason: 'empty' }],
      enough: false,
      missing: ['hnsw depth'],
    };
  if (L === 'sentinel-w4') return { solid: true, reasoning: 'ok', rabbitHoles: [] };
  if (L === 'initiator') return { refinement: { facts: [] }, synthesiser: { focus: '' } };
  if (L.startsWith('judge-'))
    return {
      goalMet: true,
      verificationSound: true,
      needsCompute: false,
      computeSound: true,
      reasoning: 'ok',
      directive: '',
    };
  if (L === 'synthesiser')
    return { report: '# R', verdict: 'v', confidence: 'low', plan: [], openQuestions: [] };
  throw new Error('refailAgent: unexpected label ' + L);
}

describe('ResearchReport.run — validator reopens then caps a persistently-failing lane', () => {
  it('reopens the dead lane twice, then surfaces it as a known gap (failCount cap)', async () => {
    const RR = await loadEngine({ query: 'q', mode: 'goal' }, refailAgent);
    const result = await new RR().run();
    expect(result.stopReason).toBe('brainer-done');
    const vFile = result.files[keys(result).find((k) => k.endsWith('-validator.md'))!];
    expect(vFile).toContain('Reopened'); // it was moved back to the open store
    expect(vFile).toContain('Known gaps'); // and then capped after MAX_LANE_REFAILS
    // the capped lane carries the cap as its failCount in the pursued archive
    expect(
      result.pursuedArchive.some((r) => r.keyword === 'hnsw tuning' && r.failCount === 2),
    ).toBe(true);
  });
});

// ── (m) validator gate skipped when every lane returns a substantial finding ──
const THICK = 'x'.repeat(200); // ≥ VALIDATOR_THIN, so the gate does not fire
function skipValidatorAgent(prompt: string, opts: AgentOpts) {
  const L = opts.label;
  if (L === 'scout') return SCOUT_OUT;
  if (L === 'prospector') return PROSPECT_OUT;
  if (L === 'brainer-w0')
    return {
      resultSoFar: RSF,
      rescore: [{ id: 1, score: 80 }],
      add: [],
      lookupNext: [{ id: 1 }],
      rename: [],
      drop: [],
      stop: { done: false, reason: 'go' },
    };
  if (L === 'brainer-w1')
    return {
      resultSoFar: RSF,
      rescore: [],
      add: [],
      lookupNext: [],
      rename: [],
      drop: [],
      stop: { done: true, reason: 'answered' },
    };
  if (L === 'sentinel-w2') return { solid: true, reasoning: 'ok', rabbitHoles: [] };
  if (L === 'lane-w1:hnsw-tuning') return { summary: THICK, rabbitHoles: [], deadEnds: [] };
  if (L === 'initiator') return { refinement: { facts: [] }, synthesiser: { focus: '' } };
  if (L.startsWith('judge-'))
    return {
      goalMet: true,
      verificationSound: true,
      needsCompute: false,
      computeSound: true,
      reasoning: 'ok',
      directive: '',
    };
  if (L === 'synthesiser')
    return { report: '# R', verdict: 'v', confidence: 'high', plan: [], openQuestions: [] };
  // a 'validator-*' label here would throw → proves the gate skipped it
  throw new Error('skipValidatorAgent: unexpected label ' + L);
}

describe('ResearchReport.run — validator gate skips when findings are substantial', () => {
  it('does not run the validator (no -validator.md) when no lane died and findings are thick', async () => {
    const RR = await loadEngine({ query: 'q', mode: 'goal' }, skipValidatorAgent);
    const result = await new RR().run();
    expect(result.stopReason).toBe('brainer-done');
    expect(keys(result).some((k) => k.endsWith('-validator.md'))).toBe(false);
  });
});
